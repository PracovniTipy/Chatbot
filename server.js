const express = require("express");
const path = require("path");
const crypto = require("crypto");
const { Pool } = require("pg");
const Stripe = require("stripe");
const {
  DEFAULT_PLAN_HANDLE,
  PLANS,
  calculateBillingPeriod,
  calculateSubscriptionPeriod,
  getPlan,
  publicPlans,
  resolvePlan,
} = require("./billing");
const { COMPLIANCE_TOPICS, verifyShopifyWebhook } = require("./webhooks");
const { HOW_IT_WORKS, FAQ } = require("./faq");
const { OPERATOR_PLACEHOLDER, renderPrivacyText } = require("./privacy");
const {
  buildEmbedSnippet,
  buildGenericSystemPrompt,
  generateSecretKey,
  generateStoreId,
  planHandleToEnvSuffix,
  safeEqual,
  validateCatalogInput,
  validateSignupInput,
} = require("./stores");

const app = express();
app.set("trust proxy", true);
app.use(express.json({
  limit: "32kb",
  verify(req, _res, buffer) {
    req.rawBody = Buffer.from(buffer);
  },
}));
app.use(express.static(path.join(__dirname, "public"), { index: false }));

const SHOPIFY_CLIENT_ID = process.env.SHOPIFY_CLIENT_ID;
const SHOPIFY_CLIENT_SECRET = process.env.SHOPIFY_CLIENT_SECRET;
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const OPENAI_MODEL = process.env.OPENAI_MODEL || "gpt-4o-mini";
const DATABASE_URL = process.env.DATABASE_URL;
const USAGE_METERING_ENABLED = process.env.USAGE_METERING_ENABLED !== "false";
const SHOPIFY_SUBSCRIPTION_REQUIRED = process.env.SHOPIFY_SUBSCRIPTION_REQUIRED === "true";
const SHOPIFY_USAGE_BILLING_ENABLED = process.env.SHOPIFY_USAGE_BILLING_ENABLED === "true";
const SHOPIFY_USAGE_EVENT_HANDLE = process.env.SHOPIFY_USAGE_EVENT_HANDLE || "resolved_case";
const SHOPIFY_APP_EVENTS_API_VERSION = process.env.SHOPIFY_APP_EVENTS_API_VERSION || "unstable";
const SHOPIFY_DEFAULT_PLAN_HANDLE = process.env.SHOPIFY_DEFAULT_PLAN_HANDLE || DEFAULT_PLAN_HANDLE;
const MAX_MESSAGES_PER_CASE = Number(process.env.MAX_MESSAGES_PER_CASE) || 20;
const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY;
const STRIPE_WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET;
const GENERIC_SUBSCRIPTION_REQUIRED = process.env.GENERIC_SUBSCRIPTION_REQUIRED === "true";
const SOCIAL_AUTOMATION_KEY = process.env.SOCIAL_AUTOMATION_KEY;
const stripeClient = STRIPE_SECRET_KEY ? new Stripe(STRIPE_SECRET_KEY) : null;

function stripePriceIdForPlan(planHandle) {
  return process.env[`STRIPE_PRICE_${planHandleToEnvSuffix(planHandle)}`] || null;
}

function planHandleForStripePriceId(priceId) {
  if (!priceId) return null;
  const plan = PLANS.find((candidate) => stripePriceIdForPlan(candidate.handle) === priceId);
  return plan ? plan.handle : null;
}
// Shopify blocks App Proxy URLs before a password-protected development store
// has been unlocked. Keep this fallback restricted to our single test shop.
const PASSWORD_PROTECTED_TEST_SHOP = process.env.PASSWORD_PROTECTED_TEST_SHOP ||
  "eshop-assistant-test.myshopify.com";
const PASSWORD_PROTECTED_TEST_ORIGIN = `https://${PASSWORD_PROTECTED_TEST_SHOP}`;

const shopTokens = new Map();
const marketingChatRateLimit = new Map();
const MARKETING_CHAT_RATE_LIMIT = 20;
const MARKETING_CHAT_RATE_WINDOW_MS = 60 * 60 * 1000;
const signupRateLimit = new Map();
const SIGNUP_RATE_LIMIT = 5;
const SIGNUP_RATE_WINDOW_MS = 60 * 60 * 1000;
let socialAutomationCount = { windowStart: 0, count: 0 };
const SOCIAL_AUTOMATION_RATE_LIMIT = 300;
const SOCIAL_AUTOMATION_RATE_WINDOW_MS = 60 * 60 * 1000;
const database = DATABASE_URL ? new Pool({ connectionString: DATABASE_URL }) : null;
let databaseReady = false;
let appEventsAccessToken = null;
let appEventsAccessTokenExpiresAt = 0;

class UsageLimitError extends Error {
  constructor(plan) {
    super(`Měsíční limit ${plan.limit} vyřešených případů v tarifu ${plan.name} byl vyčerpán.`);
    this.name = "UsageLimitError";
    this.statusCode = 429;
  }
}

class CaseMessageLimitError extends Error {
  constructor() {
    super(`Tento případ dosáhl limitu ${MAX_MESSAGES_PER_CASE} zpráv. Založte prosím nový chat.`);
    this.name = "CaseMessageLimitError";
    this.statusCode = 429;
  }
}

function planForSubscription(subscription) {
  const matchedPlan = resolvePlan(subscription, "");
  const plan = matchedPlan || (!SHOPIFY_SUBSCRIPTION_REQUIRED
    ? resolvePlan(null, SHOPIFY_DEFAULT_PLAN_HANDLE)
    : null);
  if (!plan) {
    const error = new Error("Aktivní předplatné neodpovídá žádnému nastavenému tarifu.");
    error.statusCode = 402;
    throw error;
  }
  return plan;
}

function tokenEncryptionKey() {
  if (!SHOPIFY_CLIENT_SECRET) {
    throw new Error("SHOPIFY_CLIENT_SECRET není nastaven.");
  }
  return crypto
    .createHash("sha256")
    .update(`eshop-assistant-token:${SHOPIFY_CLIENT_SECRET}`)
    .digest();
}

function encryptToken(token) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", tokenEncryptionKey(), iv);
  const encrypted = Buffer.concat([cipher.update(token, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, encrypted]).toString("base64");
}

function decryptToken(value) {
  const packed = Buffer.from(value, "base64");
  if (packed.length < 29) throw new Error("Uložený Shopify token je poškozený.");
  const iv = packed.subarray(0, 12);
  const tag = packed.subarray(12, 28);
  const encrypted = packed.subarray(28);
  const decipher = crypto.createDecipheriv("aes-256-gcm", tokenEncryptionKey(), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString("utf8");
}

async function initializeDatabase() {
  if (!database) {
    console.warn("DATABASE_URL není nastaven. Tokeny budou dočasně jen v paměti.");
    return;
  }

  await database.query(`
    CREATE TABLE IF NOT EXISTS shop_sessions (
      shop TEXT PRIMARY KEY,
      access_token TEXT NOT NULL,
      shop_id TEXT,
      installed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await database.query("ALTER TABLE shop_sessions ADD COLUMN IF NOT EXISTS shop_id TEXT");
  await database.query(`
    CREATE TABLE IF NOT EXISTS usage_events (
      id TEXT PRIMARY KEY,
      shop TEXT NOT NULL,
      shop_id TEXT NOT NULL,
      event_handle TEXT NOT NULL,
      period_start TIMESTAMPTZ NOT NULL,
      case_id TEXT,
      message_count INTEGER NOT NULL DEFAULT 0,
      occurred_at TIMESTAMPTZ,
      status TEXT NOT NULL,
      billing_attempts INTEGER NOT NULL DEFAULT 0,
      last_error TEXT,
      submitted_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await database.query("ALTER TABLE usage_events ADD COLUMN IF NOT EXISTS case_id TEXT");
  await database.query(
    "ALTER TABLE usage_events ADD COLUMN IF NOT EXISTS message_count INTEGER NOT NULL DEFAULT 0",
  );
  await database.query(`
    CREATE INDEX IF NOT EXISTS usage_events_shop_period_idx
    ON usage_events (shop, period_start, status)
  `);
  await database.query(`
    CREATE UNIQUE INDEX IF NOT EXISTS usage_events_shop_period_case_idx
    ON usage_events (shop, period_start, case_id)
    WHERE case_id IS NOT NULL AND status NOT IN ('failed', 'abandoned')
  `);

  await database.query(`
    CREATE TABLE IF NOT EXISTS generic_stores (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      email TEXT NOT NULL,
      api_key TEXT NOT NULL UNIQUE,
      admin_key TEXT NOT NULL UNIQUE,
      plan_handle TEXT NOT NULL DEFAULT '${DEFAULT_PLAN_HANDLE}',
      active BOOLEAN NOT NULL DEFAULT TRUE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await database.query("ALTER TABLE generic_stores ADD COLUMN IF NOT EXISTS stripe_customer_id TEXT");
  await database.query("ALTER TABLE generic_stores ADD COLUMN IF NOT EXISTS stripe_subscription_id TEXT");
  await database.query("ALTER TABLE generic_stores ADD COLUMN IF NOT EXISTS subscription_status TEXT");
  await database.query(`
    CREATE TABLE IF NOT EXISTS generic_catalog (
      store_id TEXT PRIMARY KEY REFERENCES generic_stores (id) ON DELETE CASCADE,
      products JSONB NOT NULL DEFAULT '[]',
      rules JSONB NOT NULL DEFAULT '{}',
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await database.query(`
    CREATE TABLE IF NOT EXISTS generic_usage_events (
      id TEXT PRIMARY KEY,
      store_id TEXT NOT NULL REFERENCES generic_stores (id) ON DELETE CASCADE,
      period_start TIMESTAMPTZ NOT NULL,
      case_id TEXT NOT NULL,
      message_count INTEGER NOT NULL DEFAULT 0,
      status TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await database.query(`
    CREATE UNIQUE INDEX IF NOT EXISTS generic_usage_events_store_period_case_idx
    ON generic_usage_events (store_id, period_start, case_id)
    WHERE status NOT IN ('failed', 'abandoned')
  `);
  await database.query(`
    CREATE INDEX IF NOT EXISTS generic_usage_events_store_period_idx
    ON generic_usage_events (store_id, period_start, status)
  `);

  databaseReady = true;
  console.log("Databáze Shopify připojení a spotřeby je připravená.");
}

async function saveShopToken(shop, accessToken) {
  shopTokens.set(shop, accessToken);
  if (!database) return;

  await database.query(
    `INSERT INTO shop_sessions (shop, access_token)
     VALUES ($1, $2)
     ON CONFLICT (shop) DO UPDATE
     SET access_token = EXCLUDED.access_token, updated_at = NOW()`,
    [shop, encryptToken(accessToken)],
  );
}

async function getShopToken(shop) {
  const cached = shopTokens.get(shop);
  if (cached) return cached;
  if (!database) return null;

  const result = await database.query(
    "SELECT access_token FROM shop_sessions WHERE shop = $1",
    [shop],
  );
  if (!result.rowCount) return null;

  const accessToken = decryptToken(result.rows[0].access_token);
  shopTokens.set(shop, accessToken);
  return accessToken;
}

async function saveShopIdentity(shop, shopId) {
  if (!database || !shopId) return;
  await database.query(
    `UPDATE shop_sessions
     SET shop_id = $2, updated_at = NOW()
     WHERE shop = $1 AND shop_id IS DISTINCT FROM $2`,
    [shop, shopId],
  );
}

async function deleteShopData(shop, deleteUsage) {
  shopTokens.delete(shop);
  if (!database) return;
  if (!databaseReady) throw new Error("Databáze zatím není připravená.");

  const client = await database.connect();
  try {
    await client.query("BEGIN");
    if (deleteUsage) {
      await client.query("DELETE FROM usage_events WHERE shop = $1", [shop]);
    }
    await client.query("DELETE FROM shop_sessions WHERE shop = $1", [shop]);
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}

function requireMeteringDatabase() {
  if (USAGE_METERING_ENABLED && (!database || !databaseReady)) {
    const error = new Error("Měření spotřeby je dočasně nedostupné. Zkuste to prosím za chvíli.");
    error.statusCode = 503;
    throw error;
  }
}

async function getShopBillingPeriod(
  shop,
  subscription,
  currentDate = new Date(),
  client = database,
) {
  if (subscription) return calculateSubscriptionPeriod(subscription, currentDate);

  const result = await client.query(
    "SELECT installed_at FROM shop_sessions WHERE shop = $1",
    [shop],
  );
  if (!result.rowCount) {
    throw new Error("Obchod nemá uložené Shopify připojení.");
  }
  return calculateBillingPeriod(result.rows[0].installed_at, currentDate);
}

async function reserveUsage(shop, shopId, subscription, caseId) {
  if (!USAGE_METERING_ENABLED) return null;
  requireMeteringDatabase();
  const plan = planForSubscription(subscription);

  const client = await database.connect();
  try {
    await client.query("BEGIN");
    await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", [shop]);
    const { periodStart, periodEnd } = await getShopBillingPeriod(
      shop,
      subscription,
      new Date(),
      client,
    );

    await client.query(
      `UPDATE usage_events
       SET status = 'abandoned', updated_at = NOW(), last_error = 'Reservation expired'
       WHERE shop = $1 AND status = 'reserved' AND created_at < NOW() - INTERVAL '15 minutes'`,
      [shop],
    );

    const countedStatuses = ["reserved", "recorded", "pending", "sending", "submitted"];
    const countResult = await client.query(
      `SELECT COUNT(*)::integer AS count
       FROM usage_events
       WHERE shop = $1 AND period_start = $2
         AND status = ANY($3::text[])`,
      [shop, periodStart, countedStatuses],
    );
    const currentUsage = countResult.rows[0].count;

    const existingResult = await client.query(
      `SELECT id, status, message_count
       FROM usage_events
       WHERE shop = $1 AND period_start = $2 AND case_id = $3
         AND status NOT IN ('failed', 'abandoned')
       LIMIT 1`,
      [shop, periodStart, caseId],
    );
    const existing = existingResult.rows[0];
    if (existing) {
      if (existing.status === "reserved") {
        const error = new Error("Předchozí zpráva se ještě zpracovává. Zkuste to prosím znovu.");
        error.statusCode = 409;
        throw error;
      }
      if (existing.message_count >= MAX_MESSAGES_PER_CASE) {
        throw new CaseMessageLimitError();
      }
      await client.query(
        `UPDATE usage_events
         SET message_count = message_count + 1, updated_at = NOW()
         WHERE id = $1`,
        [existing.id],
      );
      await client.query("COMMIT");
      return {
        id: existing.id,
        isNewCase: false,
        periodStart,
        periodEnd,
        plan,
        usageAfterSuccess: currentUsage,
      };
    }

    if (currentUsage >= plan.limit) throw new UsageLimitError(plan);

    const id = crypto.randomUUID();
    await client.query(
      `INSERT INTO usage_events
       (id, shop, shop_id, event_handle, period_start, case_id, message_count, status)
       VALUES ($1, $2, $3, $4, $5, $6, 1, 'reserved')`,
      [id, shop, shopId, SHOPIFY_USAGE_EVENT_HANDLE, periodStart, caseId],
    );
    await client.query("COMMIT");
    return {
      id,
      isNewCase: true,
      periodStart,
      periodEnd,
      plan,
      usageAfterSuccess: currentUsage + 1,
    };
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}

async function abandonUsageReservation(reservation, reason) {
  if (!reservation || !database) return;
  if (!reservation.isNewCase) {
    await database.query(
      `UPDATE usage_events
       SET message_count = GREATEST(0, message_count - 1), updated_at = NOW()
       WHERE id = $1`,
      [reservation.id],
    );
    return;
  }
  await database.query(
    `UPDATE usage_events
     SET status = 'failed', last_error = $2, updated_at = NOW()
     WHERE id = $1 AND status = 'reserved'`,
    [reservation.id, String(reason || "Answer generation failed").slice(0, 1000)],
  );
}

async function finalizeUsageReservation(reservation) {
  if (!reservation || !database) return;
  if (!reservation.isNewCase) return;
  const nextStatus = SHOPIFY_USAGE_BILLING_ENABLED ? "pending" : "recorded";
  const result = await database.query(
    `UPDATE usage_events
     SET status = $2, occurred_at = NOW(), updated_at = NOW()
     WHERE id = $1 AND status = 'reserved'
     RETURNING id`,
    [reservation.id, nextStatus],
  );
  if (!result.rowCount) throw new Error("Spotřebu se nepodařilo bezpečně uložit.");
}

async function getUsageSummary(shop, accessToken, subscription) {
  const activeSubscription = subscription === undefined
    ? await loadActiveSubscription(shop, accessToken)
    : subscription;
  const plan = planForSubscription(activeSubscription);
  if (!USAGE_METERING_ENABLED) {
    return {
      enabled: false,
      usage: 0,
      limit: plan.limit,
      monthlyPriceCzk: plan.priceCzk,
      plan,
      plans: publicPlans(),
    };
  }
  requireMeteringDatabase();
  const { periodStart, periodEnd } = await getShopBillingPeriod(shop, activeSubscription);
  const countedStatuses = ["recorded", "pending", "sending", "submitted"];
  const result = await database.query(
    `SELECT COUNT(*)::integer AS count
     FROM usage_events
     WHERE shop = $1 AND period_start = $2
       AND status = ANY($3::text[])`,
    [shop, periodStart, countedStatuses],
  );
  const usage = result.rows[0].count;
  return {
    enabled: true,
    billingEnabled: SHOPIFY_USAGE_BILLING_ENABLED,
    usage,
    limit: plan.limit,
    monthlyPriceCzk: plan.priceCzk,
    plan,
    periodStart: periodStart.toISOString(),
    periodEnd: periodEnd.toISOString(),
    plans: publicPlans(),
  };
}

async function findStoreById(id) {
  if (!database || !id) return null;
  const result = await database.query(
    `SELECT id, name, email, api_key, admin_key, plan_handle, active,
            stripe_customer_id, stripe_subscription_id, subscription_status
     FROM generic_stores WHERE id = $1`,
    [id],
  );
  return result.rows[0] || null;
}

async function requireStoreAdmin(req) {
  requireMeteringDatabase();
  const id = String(req.params.id || "").trim();
  const authHeader = req.get("Authorization") || "";
  const adminKey = authHeader.startsWith("Bearer ") ? authHeader.slice(7).trim() : "";
  const store = await findStoreById(id);
  if (!store || !adminKey || !safeEqual(store.admin_key, adminKey)) {
    const error = new Error("Neplatné přihlašovací údaje obchodu.");
    error.statusCode = 401;
    throw error;
  }
  return store;
}

async function requireStoreApiKey(body) {
  requireMeteringDatabase();
  const id = typeof body?.storeId === "string" ? body.storeId.trim() : "";
  const apiKey = typeof body?.apiKey === "string" ? body.apiKey.trim() : "";
  const store = await findStoreById(id);
  if (!store || !apiKey || !safeEqual(store.api_key, apiKey)) {
    const error = new Error("Neplatné přihlašovací údaje widgetu.");
    error.statusCode = 401;
    throw error;
  }
  if (!store.active) {
    const error = new Error("Tento obchod je momentálně neaktivní.");
    error.statusCode = 403;
    throw error;
  }
  if (GENERIC_SUBSCRIPTION_REQUIRED && store.subscription_status !== "active") {
    const error = new Error("Obchod nemá aktivní předplatné Chatnelo.");
    error.statusCode = 402;
    throw error;
  }
  return store;
}

async function getStoreCatalog(storeId) {
  const result = await database.query(
    "SELECT products, rules FROM generic_catalog WHERE store_id = $1",
    [storeId],
  );
  if (!result.rowCount) return { products: [], rules: {} };
  return { products: result.rows[0].products || [], rules: result.rows[0].rules || {} };
}

async function saveStoreCatalog(storeId, { products, rules }) {
  await database.query(
    `INSERT INTO generic_catalog (store_id, products, rules, updated_at)
     VALUES ($1, $2, $3, NOW())
     ON CONFLICT (store_id) DO UPDATE
     SET products = EXCLUDED.products, rules = EXCLUDED.rules, updated_at = NOW()`,
    [storeId, JSON.stringify(products), JSON.stringify(rules)],
  );
}

async function getStoreBillingPeriod(storeId, currentDate = new Date()) {
  const result = await database.query(
    "SELECT created_at FROM generic_stores WHERE id = $1",
    [storeId],
  );
  if (!result.rowCount) throw new Error("Obchod nebyl nalezen.");
  return calculateBillingPeriod(result.rows[0].created_at, currentDate);
}

function planForStore(store) {
  return resolvePlan(null, store.plan_handle) || resolvePlan(null, DEFAULT_PLAN_HANDLE);
}

async function reserveGenericUsage(store, caseId) {
  if (!USAGE_METERING_ENABLED) return null;
  requireMeteringDatabase();
  const plan = planForStore(store);

  const client = await database.connect();
  try {
    await client.query("BEGIN");
    await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", [store.id]);
    const { periodStart, periodEnd } = await getStoreBillingPeriod(store.id);

    await client.query(
      `UPDATE generic_usage_events
       SET status = 'abandoned', updated_at = NOW()
       WHERE store_id = $1 AND status = 'reserved' AND created_at < NOW() - INTERVAL '15 minutes'`,
      [store.id],
    );

    const countResult = await client.query(
      `SELECT COUNT(*)::integer AS count
       FROM generic_usage_events
       WHERE store_id = $1 AND period_start = $2 AND status IN ('reserved', 'recorded')`,
      [store.id, periodStart],
    );
    const currentUsage = countResult.rows[0].count;

    const existingResult = await client.query(
      `SELECT id, status, message_count
       FROM generic_usage_events
       WHERE store_id = $1 AND period_start = $2 AND case_id = $3
         AND status NOT IN ('failed', 'abandoned')
       LIMIT 1`,
      [store.id, periodStart, caseId],
    );
    const existing = existingResult.rows[0];
    if (existing) {
      if (existing.status === "reserved") {
        const error = new Error("Předchozí zpráva se ještě zpracovává. Zkuste to prosím znovu.");
        error.statusCode = 409;
        throw error;
      }
      if (existing.message_count >= MAX_MESSAGES_PER_CASE) {
        throw new CaseMessageLimitError();
      }
      await client.query(
        `UPDATE generic_usage_events
         SET message_count = message_count + 1, updated_at = NOW()
         WHERE id = $1`,
        [existing.id],
      );
      await client.query("COMMIT");
      return {
        id: existing.id,
        isNewCase: false,
        periodStart,
        periodEnd,
        plan,
        usageAfterSuccess: currentUsage,
      };
    }

    if (currentUsage >= plan.limit) throw new UsageLimitError(plan);

    const id = crypto.randomUUID();
    await client.query(
      `INSERT INTO generic_usage_events (id, store_id, period_start, case_id, message_count, status)
       VALUES ($1, $2, $3, $4, 1, 'reserved')`,
      [id, store.id, periodStart, caseId],
    );
    await client.query("COMMIT");
    return {
      id,
      isNewCase: true,
      periodStart,
      periodEnd,
      plan,
      usageAfterSuccess: currentUsage + 1,
    };
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}

async function abandonGenericUsageReservation(reservation) {
  if (!reservation || !database) return;
  if (!reservation.isNewCase) {
    await database.query(
      `UPDATE generic_usage_events
       SET message_count = GREATEST(0, message_count - 1), updated_at = NOW()
       WHERE id = $1`,
      [reservation.id],
    );
    return;
  }
  await database.query(
    `UPDATE generic_usage_events
     SET status = 'failed', updated_at = NOW()
     WHERE id = $1 AND status = 'reserved'`,
    [reservation.id],
  );
}

async function finalizeGenericUsageReservation(reservation) {
  if (!reservation || !database) return;
  if (!reservation.isNewCase) return;
  const result = await database.query(
    `UPDATE generic_usage_events
     SET status = 'recorded', updated_at = NOW()
     WHERE id = $1 AND status = 'reserved'
     RETURNING id`,
    [reservation.id],
  );
  if (!result.rowCount) throw new Error("Spotřebu se nepodařilo bezpečně uložit.");
}

async function getGenericUsageSummary(store) {
  const plan = planForStore(store);
  if (!USAGE_METERING_ENABLED) {
    return {
      enabled: false,
      usage: 0,
      limit: plan.limit,
      monthlyPriceCzk: plan.priceCzk,
      plan,
      plans: publicPlans(),
    };
  }
  requireMeteringDatabase();
  const { periodStart, periodEnd } = await getStoreBillingPeriod(store.id);
  const result = await database.query(
    `SELECT COUNT(*)::integer AS count
     FROM generic_usage_events
     WHERE store_id = $1 AND period_start = $2 AND status = 'recorded'`,
    [store.id, periodStart],
  );
  return {
    enabled: true,
    usage: result.rows[0].count,
    limit: plan.limit,
    monthlyPriceCzk: plan.priceCzk,
    plan,
    periodStart: periodStart.toISOString(),
    periodEnd: periodEnd.toISOString(),
    plans: publicPlans(),
  };
}

async function answerGenericChat(store, body) {
  const { caseId, message, history } = validateChatBody(body);
  const catalog = await getStoreCatalog(store.id);
  const reservation = await reserveGenericUsage(store, caseId);
  try {
    const reply = await generateGenericAnswer(store, catalog, message, history);
    await finalizeGenericUsageReservation(reservation);
    return {
      caseId,
      reply,
      usage: reservation ? reservation.usageAfterSuccess : null,
      usageLimit: planForStore(store).limit,
    };
  } catch (error) {
    await abandonGenericUsageReservation(reservation).catch((databaseError) => {
      console.error("Zrušení rezervace spotřeby (univerzální obchod):", databaseError);
    });
    throw error;
  }
}

async function handleStripeEvent(event) {
  if (!database) return;
  const object = event.data.object;

  if (event.type === "checkout.session.completed") {
    const storeId = object.metadata?.storeId || object.client_reference_id;
    const planHandle = object.metadata?.planHandle;
    if (!storeId) return;
    await database.query(
      `UPDATE generic_stores
       SET stripe_customer_id = $2, stripe_subscription_id = $3,
           subscription_status = 'active', plan_handle = COALESCE($4, plan_handle), active = TRUE
       WHERE id = $1`,
      [storeId, object.customer, object.subscription, planHandle || null],
    );
    return;
  }

  if (event.type === "customer.subscription.updated" || event.type === "customer.subscription.deleted") {
    const storeId = object.metadata?.storeId;
    if (!storeId) return;
    const priceId = object.items?.data?.[0]?.price?.id;
    const planHandle = planHandleForStripePriceId(priceId);
    const status = event.type === "customer.subscription.deleted" ? "canceled" : object.status;
    await database.query(
      `UPDATE generic_stores
       SET subscription_status = $2, plan_handle = COALESCE($3, plan_handle)
       WHERE id = $1 AND stripe_subscription_id = $4`,
      [storeId, status, planHandle, object.id],
    );
  }
}

async function getAppEventsAccessToken() {
  if (!SHOPIFY_CLIENT_ID || !SHOPIFY_CLIENT_SECRET) {
    throw new Error("Chybí údaje aplikace pro Shopify Billing.");
  }
  if (appEventsAccessToken && Date.now() < appEventsAccessTokenExpiresAt - 60_000) {
    return appEventsAccessToken;
  }

  const response = await fetch("https://api.shopify.com/auth/access_token", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      client_id: SHOPIFY_CLIENT_ID,
      client_secret: SHOPIFY_CLIENT_SECRET,
      grant_type: "client_credentials",
    }),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || !data.access_token) {
    throw new Error(data.error_description || data.error || "Shopify nevydal Billing token.");
  }

  appEventsAccessToken = data.access_token;
  appEventsAccessTokenExpiresAt = Date.now() + Number(data.expires_in || 3600) * 1000;
  return appEventsAccessToken;
}

async function claimPendingBillingEvent() {
  const client = await database.connect();
  try {
    await client.query("BEGIN");
    await client.query(
      `UPDATE usage_events
       SET status = 'pending', updated_at = NOW(), last_error = 'Retry after interrupted delivery'
       WHERE status = 'sending' AND updated_at < NOW() - INTERVAL '5 minutes'`,
    );
    const result = await client.query(`
      WITH candidate AS (
        SELECT id
        FROM usage_events
        WHERE status = 'pending' AND billing_attempts < 20
        ORDER BY created_at
        LIMIT 1
        FOR UPDATE SKIP LOCKED
      )
      UPDATE usage_events AS event
      SET status = 'sending', billing_attempts = billing_attempts + 1, updated_at = NOW()
      FROM candidate
      WHERE event.id = candidate.id
      RETURNING event.*
    `);
    await client.query("COMMIT");
    return result.rows[0] || null;
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}

async function deliverBillingEvent(event) {
  const accessToken = await getAppEventsAccessToken();
  const response = await fetch(
    `https://api.shopify.com/app/${SHOPIFY_APP_EVENTS_API_VERSION}/events`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify({
        shop_id: event.shop_id,
        event_handle: event.event_handle,
        timestamp: new Date(event.occurred_at).toISOString(),
        idempotency_key: event.id,
        attributes: { value: 1 },
      }),
    },
  );
  if (response.status !== 202) {
    const detail = (await response.text().catch(() => "")).slice(0, 1000);
    throw new Error(`Shopify Billing vrátil ${response.status}${detail ? `: ${detail}` : ""}`);
  }
}

let billingFlushRunning = false;
async function flushPendingBillingEvents() {
  if (!SHOPIFY_USAGE_BILLING_ENABLED || !databaseReady || billingFlushRunning) return;
  billingFlushRunning = true;
  try {
    for (let delivered = 0; delivered < 50; delivered += 1) {
      const event = await claimPendingBillingEvent();
      if (!event) break;
      try {
        await deliverBillingEvent(event);
        await database.query(
          `UPDATE usage_events
           SET status = 'submitted', submitted_at = NOW(), last_error = NULL, updated_at = NOW()
           WHERE id = $1 AND status = 'sending'`,
          [event.id],
        );
      } catch (error) {
        console.error("Shopify Billing event:", error.message);
        await database.query(
          `UPDATE usage_events
           SET status = 'pending', last_error = $2, updated_at = NOW()
           WHERE id = $1 AND status = 'sending'`,
          [event.id, String(error.message).slice(0, 1000)],
        );
        break;
      }
    }
  } finally {
    billingFlushRunning = false;
  }
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function isValidShop(shop) {
  return typeof shop === "string" &&
    /^[a-z0-9][a-z0-9-]*\.myshopify\.com$/i.test(shop);
}

app.post("/webhooks", async (req, res) => {
  const isAuthentic = verifyShopifyWebhook(
    req.rawBody,
    req.get("x-shopify-hmac-sha256"),
    SHOPIFY_CLIENT_SECRET,
  );
  if (!isAuthentic) return res.status(401).send("Unauthorized");

  const topic = String(req.get("x-shopify-topic") || "").toLowerCase();
  const headerShop = String(req.get("x-shopify-shop-domain") || "").toLowerCase();
  const payloadShop = String(req.body?.shop_domain || "").toLowerCase();
  const shop = headerShop || payloadShop;
  if (!isValidShop(shop)) return res.status(400).send("Invalid shop");

  try {
    if (topic === "app/uninstalled") {
      await deleteShopData(shop, false);
    } else if (topic === "shop/redact") {
      await deleteShopData(shop, true);
    } else if (!COMPLIANCE_TOPICS.includes(topic)) {
      return res.status(400).send("Unsupported topic");
    }

    console.log("Shopify webhook zpracován:", {
      topic,
      shop,
      webhookId: req.get("x-shopify-webhook-id") || null,
    });
    return res.status(200).send("OK");
  } catch (error) {
    console.error("Shopify webhook:", error);
    return res.status(503).send("Retry later");
  }
});

function base64UrlDecode(value) {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const padding = "=".repeat((4 - normalized.length % 4) % 4);
  return Buffer.from(normalized + padding, "base64");
}

function verifySessionToken(token) {
  if (!SHOPIFY_CLIENT_SECRET) {
    throw new Error("SHOPIFY_CLIENT_SECRET není nastaven.");
  }
  if (!token || typeof token !== "string") {
    throw new Error("Chybí Shopify session token.");
  }

  const parts = token.split(".");
  if (parts.length !== 3) throw new Error("Neplatný session token.");

  const [headerPart, payloadPart, signaturePart] = parts;
  const expected = crypto
    .createHmac("sha256", SHOPIFY_CLIENT_SECRET)
    .update(`${headerPart}.${payloadPart}`)
    .digest();
  const received = base64UrlDecode(signaturePart);

  if (expected.length !== received.length ||
      !crypto.timingSafeEqual(expected, received)) {
    throw new Error("Neplatný podpis session tokenu.");
  }

  const payload = JSON.parse(base64UrlDecode(payloadPart).toString("utf8"));
  const now = Math.floor(Date.now() / 1000);
  if (!payload.exp || payload.exp < now) throw new Error("Session token vypršel.");
  if (payload.nbf && payload.nbf > now + 10) throw new Error("Session token ještě není platný.");
  if (payload.aud !== SHOPIFY_CLIENT_ID) throw new Error("Session token patří jiné aplikaci.");

  const destination = new URL(payload.dest);
  const shop = destination.hostname;
  if (!isValidShop(shop)) throw new Error("Neplatná doména obchodu.");
  return { shop, payload };
}

function getBearerToken(req) {
  const value = req.get("authorization") || "";
  return value.startsWith("Bearer ") ? value.slice(7) : "";
}

async function exchangeForOfflineToken(shop, sessionToken) {
  const response = await fetch(`https://${shop}/admin/oauth/access_token`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      client_id: SHOPIFY_CLIENT_ID,
      client_secret: SHOPIFY_CLIENT_SECRET,
      grant_type: "urn:ietf:params:oauth:grant-type:token-exchange",
      subject_token: sessionToken,
      subject_token_type: "urn:ietf:params:oauth:token-type:id_token",
      requested_token_type: "urn:shopify:params:oauth:token-type:offline-access-token",
    }),
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok || !data.access_token) {
    throw new Error(data.error_description || data.error || "Shopify nevydal přístupový token.");
  }

  await saveShopToken(shop, data.access_token);
  return data.access_token;
}

async function getAdminAccess(req) {
  const sessionToken = getBearerToken(req);
  const { shop } = verifySessionToken(sessionToken);
  const cached = await getShopToken(shop);
  const accessToken = cached || await exchangeForOfflineToken(shop, sessionToken);
  return { shop, accessToken };
}

function verifyAppProxy(req) {
  if (!SHOPIFY_CLIENT_SECRET) throw new Error("Shopify není nakonfigurované.");

  const signature = typeof req.query.signature === "string" ? req.query.signature : "";
  if (!signature) throw new Error("Chybí podpis App Proxy.");

  const message = Object.entries(req.query)
    .filter(([key]) => key !== "signature")
    .map(([key, value]) => {
      const normalized = Array.isArray(value) ? value.join(",") : String(value ?? "");
      return `${key}=${normalized}`;
    })
    .sort()
    .join("");

  const expected = crypto
    .createHmac("sha256", SHOPIFY_CLIENT_SECRET)
    .update(message)
    .digest("hex");

  const expectedBuffer = Buffer.from(expected, "utf8");
  const receivedBuffer = Buffer.from(signature, "utf8");
  if (expectedBuffer.length !== receivedBuffer.length ||
      !crypto.timingSafeEqual(expectedBuffer, receivedBuffer)) {
    throw new Error("Neplatný podpis App Proxy.");
  }

  const timestamp = Number(req.query.timestamp);
  if (!Number.isFinite(timestamp) ||
      Math.abs(Math.floor(Date.now() / 1000) - timestamp) > 300) {
    throw new Error("Požadavek App Proxy vypršel.");
  }

  const shop = String(req.query.shop || "");
  if (!isValidShop(shop)) throw new Error("Neplatná doména obchodu.");
  return shop;
}

async function shopifyGraphql(shop, accessToken, query) {
  const response = await fetch(`https://${shop}/admin/api/2026-07/graphql.json`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Shopify-Access-Token": accessToken,
    },
    body: JSON.stringify({ query }),
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok || data.errors) {
    const detail = data.errors?.map((error) => error.message).join("; ");
    throw new Error(detail || "Nepodařilo se načíst data ze Shopify.");
  }
  return data.data;
}

async function loadActiveSubscription(shop, accessToken) {
  const data = await shopifyGraphql(shop, accessToken, `{
    currentAppInstallation {
      activeSubscriptions {
        id
        name
        status
        createdAt
        currentPeriodEnd
      }
    }
  }`);
  return data.currentAppInstallation.activeSubscriptions[0] || null;
}

async function loadCatalog(shop, accessToken) {
  const query = `{
    products(first: 50, sortKey: TITLE) {
      nodes {
        title
        handle
        status
        productType
        vendor
        description
        variants(first: 50) {
          nodes {
            title
            price
            compareAtPrice
            inventoryQuantity
            availableForSale
            sku
          }
        }
      }
    }
    shop {
      id
      name
      currencyCode
    }
    currentAppInstallation {
      activeSubscriptions {
        id
        name
        status
        createdAt
        currentPeriodEnd
      }
    }
  }`;

  const data = await shopifyGraphql(shop, accessToken, query);
  return {
    shop: data.shop,
    subscription: data.currentAppInstallation.activeSubscriptions[0] || null,
    products: data.products.nodes.map((product) => ({
      title: product.title,
      handle: product.handle,
      status: product.status,
      type: product.productType,
      vendor: product.vendor,
      description: product.description,
      variants: product.variants.nodes,
    })),
  };
}

function validateChatBody(body) {
  const message = typeof body?.message === "string" ? body.message.trim() : "";
  if (!message) throw new Error("Napište prosím zprávu.");
  if (message.length > 1000) throw new Error("Zpráva je příliš dlouhá.");

  const suppliedCaseId = typeof body?.caseId === "string" ? body.caseId.trim() : "";
  if (suppliedCaseId &&
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(suppliedCaseId)) {
    const error = new Error("Neplatné ID chatu. Obnovte prosím stránku.");
    error.statusCode = 400;
    throw error;
  }
  const caseId = suppliedCaseId || crypto.randomUUID();

  const history = Array.isArray(body?.history)
    ? body.history.slice(-10)
      .filter((item) => item && ["user", "assistant"].includes(item.role))
      .map((item) => ({
        role: item.role,
        content: String(item.content || "").slice(0, 2000),
      }))
    : [];

  return { caseId, message, history };
}

async function callOpenAiChat(system, message, history) {
  if (!OPENAI_API_KEY) throw new Error("OPENAI_API_KEY není nastaven.");

  const messages = [
    { role: "system", content: system },
    ...history,
  ];
  if (history.at(-1)?.role !== "user" || history.at(-1)?.content !== message) {
    messages.push({ role: "user", content: message });
  }

  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${OPENAI_API_KEY}`,
    },
    body: JSON.stringify({
      model: OPENAI_MODEL,
      temperature: 0.1,
      messages,
    }),
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data.error?.message || "AI služba neodpověděla.");
  }
  return data.choices?.[0]?.message?.content?.trim() || "Omlouvám se, odpověď se nepodařilo vytvořit.";
}

function shopifySystemPrompt(catalog) {
  return `Jsi ochotný nákupní asistent e-shopu ${catalog.shop.name}.
Odpovídej česky, stručně a konkrétně.
Používej pouze fakta z poskytnutých dat Shopify. Nevymýšlej sklad, ceny, slevy ani vlastnosti.
Za skladem považuj variantu jen pokud availableForSale je true a inventoryQuantity je větší než 0.
Pokud informace v datech není, řekni to otevřeně.
Částky uváděj v měně ${catalog.shop.currencyCode}.
Data Shopify:
${JSON.stringify({ shop: catalog.shop, products: catalog.products })}`;
}

async function generateAnswer(catalog, message, history) {
  return callOpenAiChat(shopifySystemPrompt(catalog), message, history);
}

async function generateGenericAnswer(store, catalog, message, history) {
  return callOpenAiChat(
    buildGenericSystemPrompt(store.name, catalog.products, catalog.rules),
    message,
    history,
  );
}

function isMarketingChatRateLimited(ip) {
  const now = Date.now();
  const entry = marketingChatRateLimit.get(ip);
  if (!entry || now - entry.windowStart > MARKETING_CHAT_RATE_WINDOW_MS) {
    marketingChatRateLimit.set(ip, { windowStart: now, count: 1 });
    return false;
  }
  entry.count += 1;
  return entry.count > MARKETING_CHAT_RATE_LIMIT;
}

function isSignupRateLimited(ip) {
  const now = Date.now();
  const entry = signupRateLimit.get(ip);
  if (!entry || now - entry.windowStart > SIGNUP_RATE_WINDOW_MS) {
    signupRateLimit.set(ip, { windowStart: now, count: 1 });
    return false;
  }
  entry.count += 1;
  return entry.count > SIGNUP_RATE_LIMIT;
}

function marketingSystemPrompt() {
  return `Jsi asistent na marketingové stránce aplikace Chatnelo (univerzální AI chatbot pro e-shopy, funguje na Shopify i mimo něj).
Odpovídáš potenciálním obchodníkům, kteří zvažují nasazení appky, ne zákazníkům konkrétního e-shopu.
Odpovídej česky, stručně a přátelsky.
Používej pouze fakta z poskytnutých informací o appce níže. Nevymýšlej si funkce, ceny ani podmínky, které tam nejsou.
Pokud se někdo zeptá na něco, co v datech není, řekni to otevřeně a nasměruj ho na podporu.
Informace o appce:
${JSON.stringify({ jakToFunguje: HOW_IT_WORKS, faq: FAQ })}`;
}

async function generateMarketingAnswer(message, history) {
  return callOpenAiChat(marketingSystemPrompt(), message, history);
}

async function answerChat(shop, accessToken, body) {
  const { caseId, message, history } = validateChatBody(body);
  const catalog = await loadCatalog(shop, accessToken);
  if (SHOPIFY_SUBSCRIPTION_REQUIRED && !catalog.subscription) {
    const error = new Error("Obchod nemá aktivní předplatné Chatnelo.");
    error.statusCode = 402;
    throw error;
  }
  await saveShopIdentity(shop, catalog.shop.id);
  const plan = planForSubscription(catalog.subscription);
  const reservation = await reserveUsage(shop, catalog.shop.id, catalog.subscription, caseId);
  try {
    const reply = await generateAnswer(catalog, message, history);
    await finalizeUsageReservation(reservation);
    setImmediate(() => flushPendingBillingEvents().catch((error) => {
      console.error("Shopify Billing fronta:", error);
    }));
    return {
      caseId,
      reply,
      usage: reservation ? reservation.usageAfterSuccess : null,
      usageLimit: plan.limit,
      plan: plan.handle,
    };
  } catch (error) {
    await abandonUsageReservation(reservation, error.message).catch((databaseError) => {
      console.error("Zrušení rezervace spotřeby:", databaseError);
    });
    throw error;
  }
}

function errorStatus(error) {
  if (error?.statusCode) return error.statusCode;
  return /token|podpis|doména|Session/i.test(error.message) ? 401 : 500;
}

function appBaseUrl(req) {
  return `${req.protocol}://${req.get("host")}`;
}

app.get("/", (req, res) => {
  const host = escapeHtml(req.query.host || "");
  const apiKey = escapeHtml(SHOPIFY_CLIENT_ID || "");
  res.type("html").send(`<!doctype html>
<html lang="cs">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <meta name="shopify-api-key" content="${apiKey}">
  <script src="https://cdn.shopify.com/shopifycloud/app-bridge.js"></script>
  <link rel="icon" type="image/svg+xml" href="/mascot.svg">
  <title>Chatnelo</title>
  <style>
    body{font-family:system-ui,-apple-system,sans-serif;margin:0;background:#f6f6f7;color:#202223}
    .brand-header{background:linear-gradient(135deg,#0b1020 0%,#1e1b4b 55%,#312e81 100%);display:flex;align-items:center;gap:14px;padding:20px 32px;color:#fff}
    .brand-header img{width:44px;height:44px}
    .brand-header span{font-size:1.3rem;font-weight:700;letter-spacing:.02em}
    main{max-width:900px;margin:32px auto 48px;padding:32px;background:#fff;border-radius:16px;box-shadow:0 1px 4px #00000012}
    h1{margin-top:0;background:linear-gradient(90deg,#0891b2,#7e22ce);-webkit-background-clip:text;background-clip:text;color:transparent}
    .usage-card{margin-top:28px;padding:22px;border:1px solid #dfe3e8;border-radius:12px;background:#fafbfb}
    .usage-row{display:flex;justify-content:space-between;gap:24px;align-items:baseline;flex-wrap:wrap}
    .usage-value{font-size:1.5rem;font-weight:700;color:#7e22ce}
    progress{width:100%;height:14px;margin:14px 0;accent-color:#a855f7}
    .muted{color:#637381;font-size:.92rem}
    table{width:100%;border-collapse:collapse;margin-top:20px;font-size:.92rem}
    th,td{padding:9px;border-bottom:1px solid #dfe3e8;text-align:left}
    th{color:#637381;font-weight:600}
    .error{color:#b42318}
  </style>
</head>
<body>
  <div class="brand-header"><img src="/mascot.svg" alt="Chatnelo"><span>Chatnelo</span></div>
  <main>
    <h1>Chatnelo</h1>
    <p>Aplikace je připojená. Chat vpravo používá produkty a sklad tohoto obchodu.</p>
    <section class="usage-card" aria-live="polite">
      <div class="usage-row">
        <div>
          <strong>Spotřeba v tomto období</strong>
          <div class="usage-value" id="usage-count">Načítám…</div>
        </div>
        <div>
          <strong id="plan-name">Cena tarifu</strong>
          <div class="usage-value" id="usage-price">—</div>
        </div>
      </div>
      <progress id="usage-progress" max="70" value="0"></progress>
      <div class="muted" id="usage-period">Jeden případ je jedno chatové vlákno s úspěšnou odpovědí.</div>
      <table>
        <thead><tr><th>Tarif</th><th>Případů / měsíc</th><th>Cena / měsíc</th></tr></thead>
        <tbody id="pricing-tiers"></tbody>
      </table>
    </section>
  </main>
  <script>
    window.CHATBOT_API = "";
    window.addEventListener("DOMContentLoaded", function () {
      var originalFetch = window.fetch.bind(window);
      window.fetch = async function (resource, options) {
        var url = typeof resource === "string" ? resource : (resource && resource.url) || "";
        if (url.indexOf("/api/") !== -1 && window.shopify && window.shopify.idToken) {
          var token = await window.shopify.idToken();
          options = options || {};
          var headers = new Headers(options.headers || {});
          headers.set("Authorization", "Bearer " + token);
          options.headers = headers;
        }
        return originalFetch(resource, options);
      };
      window.fetch("/api/bootstrap", { method: "POST" })
        .then(function (response) { return response.json(); })
        .then(function (data) {
          if (!data.usage || !data.usage.enabled) {
            document.getElementById("usage-count").textContent = "Měření vypnuto";
            return;
          }
          var usage = data.usage;
          document.getElementById("usage-count").textContent = usage.usage + " / " + usage.limit;
          document.getElementById("plan-name").textContent = "Tarif " + usage.plan.name;
          document.getElementById("usage-price").textContent = new Intl.NumberFormat("cs-CZ", {
            style: "currency", currency: "CZK", maximumFractionDigits: 0
          }).format(usage.monthlyPriceCzk);
          document.getElementById("usage-progress").max = usage.limit;
          document.getElementById("usage-progress").value = usage.usage;
          var start = new Date(usage.periodStart).toLocaleDateString("cs-CZ");
          var end = new Date(usage.periodEnd).toLocaleDateString("cs-CZ");
          document.getElementById("usage-period").textContent = "Období " + start + " – " + end +
            ". Jeden případ je jedno chatové vlákno s úspěšnou odpovědí.";
          document.getElementById("pricing-tiers").innerHTML = usage.plans.map(function (plan) {
            return "<tr><td>" + plan.name + "</td><td>" +
              plan.limit.toLocaleString("cs-CZ") + "</td><td>" +
              plan.priceCzk.toLocaleString("cs-CZ") + " Kč</td></tr>";
          }).join("");
        })
        .catch(function () {
          var counter = document.getElementById("usage-count");
          counter.textContent = "Nelze načíst";
          counter.classList.add("error");
        });
    });
  </script>
  <script src="/widget.js" defer></script>
</body>
</html>`);
});

app.get("/marketing", (req, res) => {
  const stepsHtml = HOW_IT_WORKS.map((step, index) => `
        <li>
          <span class="step-number">${index + 1}</span>
          <div>
            <h3>${escapeHtml(step.title)}</h3>
            <p>${escapeHtml(step.text)}</p>
          </div>
        </li>`).join("");

  const pricingHtml = publicPlans().map((plan) => `
        <tr>
          <td>${escapeHtml(plan.name)}</td>
          <td>${plan.limit.toLocaleString("cs-CZ")}</td>
          <td>${plan.priceCzk.toLocaleString("cs-CZ")} Kč</td>
        </tr>`).join("");

  const faqHtml = FAQ.map((item) => `
        <details>
          <summary>${escapeHtml(item.question)}</summary>
          <p>${escapeHtml(item.answer)}</p>
        </details>`).join("");

  res.type("html").send(`<!doctype html>
<html lang="cs">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <link rel="icon" type="image/svg+xml" href="/mascot.svg">
  <title>Chatnelo — chatbot pro váš Shopify obchod</title>
  <style>
    body{font-family:system-ui,-apple-system,sans-serif;margin:0;background:#f6f6f7;color:#202223;line-height:1.5}
    header{background:radial-gradient(circle at 20% 20%,#1e1b4b 0%,#0b1020 55%,#05060d 100%);color:#fff;padding:64px 24px 72px;text-align:center;position:relative;overflow:hidden}
    header::after{content:"";position:absolute;inset:0;background:radial-gradient(circle at 80% 0%,rgba(168,85,247,.35),transparent 55%),radial-gradient(circle at 10% 90%,rgba(34,211,238,.25),transparent 50%);pointer-events:none}
    header .brand-mark{position:relative;display:flex;flex-direction:column;align-items:center;gap:10px}
    header img{width:96px;height:96px;filter:drop-shadow(0 0 24px rgba(168,85,247,.55))}
    header h1{margin:0;font-size:2.3rem;background:linear-gradient(90deg,#67e8f9,#e9d5ff);-webkit-background-clip:text;background-clip:text;color:transparent}
    header p{margin:10px 0 0;opacity:.85;font-size:1.1rem;max-width:560px}
    main{max-width:900px;margin:0 auto;padding:40px 24px}
    section{margin-bottom:48px}
    h2{background:linear-gradient(90deg,#0891b2,#7e22ce);-webkit-background-clip:text;background-clip:text;color:transparent;display:inline-block}
    ol.steps{list-style:none;padding:0;display:grid;gap:20px}
    ol.steps li{display:flex;gap:16px;align-items:flex-start}
    .step-number{flex:none;width:32px;height:32px;border-radius:50%;background:linear-gradient(135deg,#22d3ee,#a855f7);color:#fff;display:flex;align-items:center;justify-content:center;font-weight:700;box-shadow:0 4px 14px -4px rgba(168,85,247,.6)}
    ol.steps h3{margin:0 0 4px}
    ol.steps p{margin:0;color:#4b5563}
    table{width:100%;border-collapse:collapse;background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 1px 4px #00000012}
    th,td{padding:12px 16px;text-align:left;border-bottom:1px solid #dfe3e8}
    th{background:#171335;color:#e9d5ff}
    details{background:#fff;border-radius:10px;padding:14px 18px;margin-bottom:10px;box-shadow:0 1px 4px #00000012;border-left:3px solid #a855f7}
    summary{font-weight:600;cursor:pointer}
    details p{margin:10px 0 0;color:#4b5563}
    #marketing-chat{background:#fff;border-radius:16px;box-shadow:0 1px 4px #00000012;padding:24px}
    #marketing-chat-log{min-height:120px;max-height:320px;overflow-y:auto;margin-bottom:12px;display:flex;flex-direction:column;gap:10px}
    .msg{padding:10px 14px;border-radius:10px;max-width:80%}
    .msg.user{align-self:flex-end;background:linear-gradient(135deg,#0891b2,#7e22ce);color:#fff}
    .msg.assistant{align-self:flex-start;background:#f1f2f4}
    #marketing-chat-form{display:flex;gap:8px}
    #marketing-chat-input{flex:1;padding:10px 12px;border:1px solid #dfe3e8;border-radius:8px;font-size:1rem}
    #marketing-chat-form button{padding:10px 18px;border:none;border-radius:8px;background:linear-gradient(135deg,#22d3ee,#a855f7);color:#fff;font-weight:600;cursor:pointer;box-shadow:0 4px 14px -4px rgba(168,85,247,.6)}
    #marketing-chat-form button:disabled{opacity:.6;cursor:default}
  </style>
</head>
<body>
  <header>
    <div class="brand-mark">
      <img src="/mascot.svg" alt="Chatnelo maskot">
      <h1>Chatnelo</h1>
      <p>AI chatbot, který za vás na Shopify obchodě odpovídá zákazníkům — podle reálných produktů a skladu.</p>
    </div>
  </header>
  <main>
    <section>
      <h2>Jak to funguje</h2>
      <ol class="steps">${stepsHtml}
      </ol>
    </section>
    <section>
      <h2>Ceník</h2>
      <p class="muted">Pevná měsíční cena za tarif, ne platba za jednotlivou zprávu. Víte tedy dopředu, kolik appka bude stát, i v měsíci, kdy dorazí jen pár dotazů.</p>
      <table>
        <thead><tr><th>Tarif</th><th>Případů / měsíc</th><th>Cena / měsíc</th></tr></thead>
        <tbody>${pricingHtml}
        </tbody>
      </table>
    </section>
    <section>
      <h2>Časté dotazy</h2>
      ${faqHtml}
    </section>
    <section>
      <h2>Zeptejte se rovnou chatbota</h2>
      <div id="marketing-chat">
        <div id="marketing-chat-log"></div>
        <form id="marketing-chat-form">
          <input id="marketing-chat-input" maxlength="500" autocomplete="off" placeholder="Např. Jak dlouho trvá instalace?">
          <button type="submit">Odeslat</button>
        </form>
      </div>
    </section>
  </main>
  <footer style="text-align:center;padding:24px;color:#637381;font-size:.85rem">
    <a href="/privacy" style="color:#637381">Zásady ochrany osobních údajů</a>
  </footer>
  <script>
    (function () {
      var log = document.getElementById("marketing-chat-log");
      var form = document.getElementById("marketing-chat-form");
      var input = document.getElementById("marketing-chat-input");
      var button = form.querySelector("button");
      var history = [];

      function addMessage(role, text) {
        var el = document.createElement("div");
        el.className = "msg " + role;
        el.textContent = text;
        log.appendChild(el);
        log.scrollTop = log.scrollHeight;
      }

      form.addEventListener("submit", function (event) {
        event.preventDefault();
        var message = input.value.trim();
        if (!message) return;
        addMessage("user", message);
        history.push({ role: "user", content: message });
        input.value = "";
        input.disabled = true;
        button.disabled = true;

        fetch("/marketing/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ message: message, history: history.slice(0, -1) }),
        })
          .then(function (response) { return response.json(); })
          .then(function (data) {
            if (data.error) throw new Error(data.error);
            addMessage("assistant", data.reply);
            history.push({ role: "assistant", content: data.reply });
          })
          .catch(function (error) {
            addMessage("assistant", "Omlouvám se, teď se mi nedaří odpovědět (" + error.message + "). Zkuste to prosím znovu.");
          })
          .finally(function () {
            input.disabled = false;
            button.disabled = false;
            input.focus();
          });
      });
    })();
  </script>
</body>
</html>`);
});

app.post("/marketing/chat", async (req, res) => {
  try {
    if (isMarketingChatRateLimited(req.ip)) {
      return res.status(429).json({ error: "Příliš mnoho dotazů, zkuste to prosím za chvíli znovu." });
    }
    const { message, history } = validateChatBody(req.body);
    const reply = await generateMarketingAnswer(message, history);
    res.json({ reply });
  } catch (error) {
    console.error("Marketing chat:", error);
    res.status(errorStatus(error)).json({ error: error.message });
  }
});

function isSocialAutomationRateLimited() {
  const now = Date.now();
  if (now - socialAutomationCount.windowStart > SOCIAL_AUTOMATION_RATE_WINDOW_MS) {
    socialAutomationCount = { windowStart: now, count: 1 };
    return false;
  }
  socialAutomationCount.count += 1;
  return socialAutomationCount.count > SOCIAL_AUTOMATION_RATE_LIMIT;
}

app.post("/social/reply", async (req, res) => {
  try {
    if (!SOCIAL_AUTOMATION_KEY) {
      const error = new Error("Automatizace pro sociální sítě zatím není nakonfigurovaná.");
      error.statusCode = 503;
      throw error;
    }
    const authHeader = req.get("Authorization") || "";
    const providedKey = authHeader.startsWith("Bearer ") ? authHeader.slice(7).trim() : "";
    if (!providedKey || !safeEqual(SOCIAL_AUTOMATION_KEY, providedKey)) {
      const error = new Error("Neplatný klíč automatizace.");
      error.statusCode = 401;
      throw error;
    }
    if (isSocialAutomationRateLimited()) {
      return res.status(429).json({ error: "Příliš mnoho dotazů, zkuste to prosím za chvíli znovu." });
    }
    const { message, history } = validateChatBody(req.body);
    const reply = await generateMarketingAnswer(message, history);
    res.json({ reply });
  } catch (error) {
    console.error("Social automation reply:", error);
    res.status(errorStatus(error)).json({ error: error.message });
  }
});

app.get("/privacy", (req, res) => {
  const operator = {
    name: process.env.PRIVACY_OPERATOR_NAME || OPERATOR_PLACEHOLDER.name,
    contactEmail: process.env.PRIVACY_CONTACT_EMAIL || OPERATOR_PLACEHOLDER.contactEmail,
    address: process.env.PRIVACY_OPERATOR_ADDRESS || OPERATOR_PLACEHOLDER.address,
  };
  const sectionsHtml = renderPrivacyText(operator).map((section) => `
        <section>
          <h2>${escapeHtml(section.title)}</h2>
          <p>${escapeHtml(section.body)}</p>
        </section>`).join("");

  res.type("html").send(`<!doctype html>
<html lang="cs">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <link rel="icon" type="image/svg+xml" href="/mascot.svg">
  <title>Chatnelo — Zásady ochrany osobních údajů</title>
  <style>
    body{font-family:system-ui,-apple-system,sans-serif;margin:0;background:#f6f6f7;color:#202223;line-height:1.6}
    header{background:linear-gradient(135deg,#0b1020 0%,#1e1b4b 55%,#312e81 100%);color:#fff;padding:36px 24px;text-align:center;display:flex;flex-direction:column;align-items:center;gap:10px}
    header img{width:52px;height:52px}
    header h1{margin:0;font-size:1.6rem}
    main{max-width:760px;margin:0 auto;padding:32px 24px 60px}
    section{background:#fff;border-radius:12px;box-shadow:0 1px 4px #00000012;padding:20px 24px;margin-bottom:16px;border-left:3px solid #a855f7}
    h2{background:linear-gradient(90deg,#0891b2,#7e22ce);-webkit-background-clip:text;background-clip:text;color:transparent;font-size:1.1rem;margin-top:0;display:inline-block}
    p{margin:0;color:#3c4149}
    .updated{text-align:center;color:#637381;font-size:.85rem;margin-bottom:24px}
  </style>
</head>
<body>
  <header>
    <img src="/mascot.svg" alt="Chatnelo maskot">
    <h1>Zásady ochrany osobních údajů</h1>
  </header>
  <main>
    <p class="updated">Poslední aktualizace: ${new Date().toISOString().slice(0, 10)}</p>
    ${sectionsHtml}
  </main>
</body>
</html>`);
});

app.post("/store/signup", async (req, res) => {
  try {
    requireMeteringDatabase();
    if (isSignupRateLimited(req.ip)) {
      return res.status(429).json({ error: "Příliš mnoho registrací, zkuste to prosím za chvíli znovu." });
    }
    const { name, email } = validateSignupInput(req.body);
    const id = generateStoreId();
    const apiKey = generateSecretKey();
    const adminKey = generateSecretKey();

    await database.query(
      `INSERT INTO generic_stores (id, name, email, api_key, admin_key, plan_handle)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [id, name, email, apiKey, adminKey, DEFAULT_PLAN_HANDLE],
    );
    await database.query(
      "INSERT INTO generic_catalog (store_id, products, rules) VALUES ($1, '[]', '{}')",
      [id],
    );

    const baseUrl = appBaseUrl(req);
    res.status(201).json({
      storeId: id,
      apiKey,
      adminKey,
      dashboardUrl: `${baseUrl}/store/dashboard`,
      embedSnippet: buildEmbedSnippet(baseUrl, id, apiKey),
      note: "Uložte si adminKey bezpečně, znovu se nezobrazí. Slouží ke správě katalogu na řídicím panelu.",
    });
  } catch (error) {
    console.error("Store signup:", error);
    res.status(errorStatus(error)).json({ error: error.message });
  }
});

app.get("/store/dashboard", (req, res) => {
  res.type("html").send(`<!doctype html>
<html lang="cs">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <link rel="icon" type="image/svg+xml" href="/mascot.svg">
  <title>Chatnelo — Řídicí panel</title>
  <style>
    body{font-family:system-ui,-apple-system,sans-serif;margin:0;background:#f6f6f7;color:#202223}
    .brand-header{background:linear-gradient(135deg,#0b1020 0%,#1e1b4b 55%,#312e81 100%);display:flex;align-items:center;gap:14px;padding:20px 32px;color:#fff}
    .brand-header img{width:44px;height:44px}
    .brand-header span{font-size:1.3rem;font-weight:700;letter-spacing:.02em}
    main{max-width:760px;margin:32px auto 60px;padding:0 20px 60px}
    h1{background:linear-gradient(90deg,#0891b2,#7e22ce);-webkit-background-clip:text;background-clip:text;color:transparent}
    section{background:#fff;border-radius:14px;box-shadow:0 1px 4px #00000012;padding:24px;margin-bottom:22px;border-left:3px solid #a855f7}
    label{display:block;font-weight:600;margin:14px 0 6px}
    input,textarea{width:100%;box-sizing:border-box;padding:10px 12px;border:1px solid #dfe3e8;border-radius:8px;font:inherit}
    textarea{min-height:220px;font-family:ui-monospace,Consolas,monospace;font-size:.85rem}
    button{margin-top:14px;padding:10px 18px;border:none;border-radius:8px;background:linear-gradient(135deg,#22d3ee,#a855f7);color:#fff;font-weight:600;cursor:pointer;box-shadow:0 4px 14px -4px rgba(168,85,247,.6)}
    button:disabled{opacity:.6;cursor:default;box-shadow:none}
    .muted{color:#637381;font-size:.9rem}
    .error{color:#b42318;margin-top:10px}
    .ok{color:#0f7b3f;margin-top:10px}
    pre{white-space:pre-wrap;word-break:break-all;background:#f6f7fb;padding:12px;border-radius:8px;font-size:.85rem}
    #app-section{display:none}
  </style>
</head>
<body>
  <div class="brand-header"><img src="/mascot.svg" alt="Chatnelo"><span>Chatnelo</span></div>
  <main>
    <h1>Řídicí panel obchodu</h1>
    <section id="signup-section">
      <p class="muted">Nemáte ještě obchod? Zaregistrujte se — je to zdarma, tarif zvolíte a zaplatíte později.</p>
      <label for="signup-name">Název obchodu</label>
      <input id="signup-name" autocomplete="off">
      <label for="signup-email">E-mail</label>
      <input id="signup-email" type="email" autocomplete="off">
      <button id="signup-btn" type="button">Zaregistrovat obchod</button>
      <div id="signup-error" class="error"></div>
      <div id="signup-result" style="display:none">
        <p class="ok">Obchod je zaregistrovaný. <strong>Uložte si adminKey níže bezpečně — znovu se nezobrazí.</strong></p>
        <label>ID obchodu</label>
        <pre id="signup-store-id"></pre>
        <label>adminKey</label>
        <pre id="signup-admin-key"></pre>
        <button id="signup-continue-btn" type="button">Pokračovat do panelu</button>
      </div>
    </section>
    <section id="login-section">
      <p class="muted">Už máte obchod? Zadejte ID obchodu a adminKey, které jste dostali při registraci.</p>
      <label for="store-id">ID obchodu</label>
      <input id="store-id" autocomplete="off">
      <label for="admin-key">adminKey</label>
      <input id="admin-key" type="password" autocomplete="off">
      <button id="login-btn" type="button">Přihlásit</button>
      <div id="login-error" class="error"></div>
    </section>
    <section id="app-section">
      <h2 id="store-name"></h2>
      <p class="muted">Vložte tento kód do HTML svého webu (např. před &lt;/body&gt;):</p>
      <pre id="embed-snippet"></pre>
      <p class="muted" id="usage-summary"></p>
    </section>
    <section id="billing-section" style="display:none">
      <h2>Tarif a platba</h2>
      <p class="muted" id="billing-status"></p>
      <div id="plan-list"></div>
      <div id="billing-error" class="error"></div>
    </section>
    <section id="app-section2" style="display:none">
      <h2>Katalog produktů a pravidla obchodu</h2>
      <p class="muted">Pole products je pole objektů s klíči id, nazev, cena, mena, sklad, popis. Pole rules může obsahovat doprava, vraceni, platba.</p>
      <label for="catalog-json">Katalog (JSON)</label>
      <textarea id="catalog-json" spellcheck="false"></textarea>
      <button id="save-btn" type="button">Uložit katalog</button>
      <div id="save-message"></div>
    </section>
  </main>
  <script>
    var storeId = "";
    var adminKey = "";

    function authHeaders() {
      return { "Content-Type": "application/json", Authorization: "Bearer " + adminKey };
    }

    async function enterDashboard(errorElementId) {
      document.getElementById(errorElementId).textContent = "";
      try {
        var response = await fetch("/store/" + encodeURIComponent(storeId), { headers: authHeaders() });
        var data = await response.json();
        if (!response.ok) throw new Error(data.error || "Přihlášení se nezdařilo.");
        document.getElementById("signup-section").style.display = "none";
        document.getElementById("login-section").style.display = "none";
        document.getElementById("app-section").style.display = "block";
        document.getElementById("app-section2").style.display = "block";
        document.getElementById("store-name").textContent = data.name;
        document.getElementById("embed-snippet").textContent = data.embedSnippet;
        if (data.usage.enabled) {
          document.getElementById("usage-summary").textContent =
            "Spotřeba: " + data.usage.usage + " / " + data.usage.limit + " (tarif " + data.usage.plan.name + ")";
        }
        document.getElementById("catalog-json").value = JSON.stringify(data.catalog, null, 2);
        renderBilling(data);
      } catch (error) {
        document.getElementById(errorElementId).textContent = error.message;
      }
    }

    document.getElementById("login-btn").addEventListener("click", function () {
      storeId = document.getElementById("store-id").value.trim();
      adminKey = document.getElementById("admin-key").value.trim();
      enterDashboard("login-error");
    });

    document.getElementById("signup-btn").addEventListener("click", async function () {
      var errorEl = document.getElementById("signup-error");
      errorEl.textContent = "";
      try {
        var response = await fetch("/store/signup", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: document.getElementById("signup-name").value.trim(),
            email: document.getElementById("signup-email").value.trim(),
          }),
        });
        var data = await response.json();
        if (!response.ok) throw new Error(data.error || "Registrace se nezdařila.");
        document.getElementById("signup-store-id").textContent = data.storeId;
        document.getElementById("signup-admin-key").textContent = data.adminKey;
        document.getElementById("signup-result").style.display = "block";
        document.getElementById("signup-continue-btn").dataset.storeId = data.storeId;
        document.getElementById("signup-continue-btn").dataset.adminKey = data.adminKey;
      } catch (error) {
        errorEl.textContent = error.message;
      }
    });

    document.getElementById("signup-continue-btn").addEventListener("click", function () {
      storeId = this.dataset.storeId;
      adminKey = this.dataset.adminKey;
      enterDashboard("signup-error");
    });

    function renderBilling(data) {
      var section = document.getElementById("billing-section");
      var status = document.getElementById("billing-status");
      var list = document.getElementById("plan-list");
      list.innerHTML = "";
      document.getElementById("billing-error").textContent = "";

      if (!data.billingConfigured) {
        status.textContent = "Aktuální tarif: " + data.usage.plan.name +
          ". Platby zatím nejsou nastavené, tarif běží v testovacím režimu.";
        section.style.display = "block";
        return;
      }
      status.textContent = "Aktuální tarif: " + data.usage.plan.name +
        (data.subscriptionStatus ? " (stav platby: " + data.subscriptionStatus + ")" : " (zatím bez platby)");

      data.usage.plans.forEach(function (plan) {
        var row = document.createElement("div");
        row.style.cssText = "display:flex;justify-content:space-between;align-items:center;padding:10px 0;border-bottom:1px solid #eee";
        var label = document.createElement("span");
        label.textContent = plan.name + " — " + plan.limit.toLocaleString("cs-CZ") + " případů / měsíc — " +
          plan.priceCzk.toLocaleString("cs-CZ") + " Kč";
        var button = document.createElement("button");
        var isCurrent = plan.handle === data.planHandle && data.subscriptionStatus === "active";
        button.textContent = isCurrent ? "Aktivní tarif" : "Vybrat";
        button.disabled = isCurrent;
        button.style.marginTop = "0";
        button.addEventListener("click", async function () {
          button.disabled = true;
          try {
            var response = await fetch("/store/" + encodeURIComponent(storeId) + "/checkout", {
              method: "POST",
              headers: authHeaders(),
              body: JSON.stringify({ planHandle: plan.handle }),
            });
            var checkoutData = await response.json();
            if (!response.ok) throw new Error(checkoutData.error || "Platbu se nepodařilo spustit.");
            window.location = checkoutData.url;
          } catch (error) {
            document.getElementById("billing-error").textContent = error.message;
            button.disabled = isCurrent;
          }
        });
        row.appendChild(label);
        row.appendChild(button);
        list.appendChild(row);
      });
      section.style.display = "block";
    }

    document.getElementById("save-btn").addEventListener("click", async function () {
      var messageEl = document.getElementById("save-message");
      messageEl.className = "";
      messageEl.textContent = "Ukládám…";
      try {
        var catalog = JSON.parse(document.getElementById("catalog-json").value);
        var response = await fetch("/store/" + encodeURIComponent(storeId) + "/catalog", {
          method: "PUT",
          headers: authHeaders(),
          body: JSON.stringify(catalog),
        });
        var data = await response.json();
        if (!response.ok) throw new Error(data.error || "Uložení se nezdařilo.");
        messageEl.className = "ok";
        messageEl.textContent = "Katalog uložen.";
      } catch (error) {
        messageEl.className = "error";
        messageEl.textContent = error.message;
      }
    });
  </script>
</body>
</html>`);
});

app.get("/store/:id", async (req, res) => {
  try {
    const store = await requireStoreAdmin(req);
    const catalog = await getStoreCatalog(store.id);
    const usage = await getGenericUsageSummary(store);
    const baseUrl = appBaseUrl(req);
    res.json({
      storeId: store.id,
      name: store.name,
      email: store.email,
      active: store.active,
      planHandle: store.plan_handle,
      subscriptionStatus: store.subscription_status,
      billingConfigured: Boolean(stripeClient),
      catalog,
      usage,
      embedSnippet: buildEmbedSnippet(baseUrl, store.id, store.api_key),
    });
  } catch (error) {
    console.error("Store detail:", error);
    res.status(errorStatus(error)).json({ error: error.message });
  }
});

app.post("/store/:id/checkout", async (req, res) => {
  try {
    const store = await requireStoreAdmin(req);
    if (!stripeClient) {
      const error = new Error("Platby zatím nejsou nakonfigurované.");
      error.statusCode = 503;
      throw error;
    }
    const planHandle = typeof req.body?.planHandle === "string" ? req.body.planHandle.trim() : "";
    const plan = getPlan(planHandle);
    if (!plan || !plan.public) {
      const error = new Error("Neplatný tarif.");
      error.statusCode = 400;
      throw error;
    }
    const priceId = stripePriceIdForPlan(plan.handle);
    if (!priceId) {
      const error = new Error(`Tarif ${plan.name} zatím nemá nastavenou platbu.`);
      error.statusCode = 503;
      throw error;
    }

    const baseUrl = appBaseUrl(req);
    const session = await stripeClient.checkout.sessions.create({
      mode: "subscription",
      customer: store.stripe_customer_id || undefined,
      customer_email: store.stripe_customer_id ? undefined : store.email,
      client_reference_id: store.id,
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: `${baseUrl}/store/dashboard?checkout=success`,
      cancel_url: `${baseUrl}/store/dashboard?checkout=cancelled`,
      metadata: { storeId: store.id, planHandle: plan.handle },
      subscription_data: { metadata: { storeId: store.id, planHandle: plan.handle } },
    });
    res.json({ url: session.url });
  } catch (error) {
    console.error("Store checkout:", error);
    res.status(errorStatus(error)).json({ error: error.message });
  }
});

app.post("/stripe/webhook", async (req, res) => {
  if (!stripeClient || !STRIPE_WEBHOOK_SECRET) return res.sendStatus(404);
  let event;
  try {
    event = stripeClient.webhooks.constructEvent(
      req.rawBody,
      req.get("stripe-signature"),
      STRIPE_WEBHOOK_SECRET,
    );
  } catch (error) {
    console.error("Stripe webhook signature:", error.message);
    return res.sendStatus(400);
  }
  try {
    await handleStripeEvent(event);
    res.sendStatus(200);
  } catch (error) {
    console.error("Stripe webhook handling:", error);
    res.sendStatus(500);
  }
});

app.put("/store/:id/catalog", async (req, res) => {
  try {
    const store = await requireStoreAdmin(req);
    const catalog = validateCatalogInput(req.body);
    await saveStoreCatalog(store.id, catalog);
    res.json({ ok: true, catalog });
  } catch (error) {
    console.error("Store catalog update:", error);
    res.status(errorStatus(error)).json({ error: error.message });
  }
});

// The embed widget runs on the merchant's own site, a different origin
// from this backend, so /widget/chat must allow cross-origin requests.
// The security boundary here is the per-store apiKey, not Origin.
app.options("/widget/chat", (req, res) => {
  res.set({
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  });
  res.sendStatus(204);
});

app.post("/widget/chat", async (req, res) => {
  res.set("Access-Control-Allow-Origin", "*");
  try {
    const store = await requireStoreApiKey(req.body);
    res.json(await answerGenericChat(store, req.body));
  } catch (error) {
    console.error("Widget chat:", error);
    res.status(errorStatus(error)).json({ error: error.message });
  }
});

app.post("/api/bootstrap", async (req, res) => {
  try {
    const { shop, accessToken } = await getAdminAccess(req);
    const usage = await getUsageSummary(shop, accessToken);
    res.json({ ok: true, shop, usage });
  } catch (error) {
    console.error("Bootstrap:", error);
    res.status(401).json({ error: error.message });
  }
});

app.get("/api/usage", async (req, res) => {
  try {
    const { shop, accessToken } = await getAdminAccess(req);
    res.json(await getUsageSummary(shop, accessToken));
  } catch (error) {
    console.error("Usage summary:", error);
    res.status(errorStatus(error)).json({ error: error.message });
  }
});

app.post("/api/chat", async (req, res) => {
  try {
    const { shop, accessToken } = await getAdminAccess(req);
    res.json(await answerChat(shop, accessToken, req.body));
  } catch (error) {
    console.error("Admin chat:", error);
    res.status(errorStatus(error)).json({ error: error.message });
  }
});

app.post("/proxy/chat", async (req, res) => {
  try {
    const shop = verifyAppProxy(req);
    const accessToken = await getShopToken(shop);
    if (!accessToken) {
      return res.status(503).json({
        error: "Asistent se právě připojuje. Správce obchodu musí jednou otevřít aplikaci Chatnelo v administraci.",
      });
    }
    res.json(await answerChat(shop, accessToken, req.body));
  } catch (error) {
    console.error("Storefront chat:", error);
    res.status(errorStatus(error)).json({ error: error.message });
  }
});

function allowPasswordProtectedTestStore(req, res) {
  const origin = req.get("Origin") || "";
  if (origin !== PASSWORD_PROTECTED_TEST_ORIGIN) return false;

  res.set({
    "Access-Control-Allow-Origin": PASSWORD_PROTECTED_TEST_ORIGIN,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Cache-Control": "no-store",
    Vary: "Origin",
  });
  return true;
}

app.options("/test-storefront/chat", (req, res) => {
  if (!allowPasswordProtectedTestStore(req, res)) return res.sendStatus(403);
  return res.sendStatus(204);
});

app.post("/test-storefront/chat", async (req, res) => {
  if (!allowPasswordProtectedTestStore(req, res)) {
    return res.status(403).json({ error: "Tento testovací přístup není pro daný obchod povolen." });
  }

  try {
    const accessToken = await getShopToken(PASSWORD_PROTECTED_TEST_SHOP);
    if (!accessToken) {
      return res.status(503).json({
        error: "Asistent se právě připojuje. Otevřete jednou aplikaci Chatnelo v administraci.",
      });
    }
    return res.json(await answerChat(PASSWORD_PROTECTED_TEST_SHOP, accessToken, req.body));
  } catch (error) {
    console.error("Password-protected test storefront chat:", error);
    return res.status(errorStatus(error)).json({ error: error.message });
  }
});

app.get("/health", (req, res) => {
  res.json({
    ok: true,
    shopifyConfigured: Boolean(SHOPIFY_CLIENT_ID && SHOPIFY_CLIENT_SECRET),
    openaiConfigured: Boolean(OPENAI_API_KEY),
    stripeConfigured: Boolean(stripeClient),
    genericSubscriptionRequired: GENERIC_SUBSCRIPTION_REQUIRED,
    persistentStorageConfigured: Boolean(database),
    persistentStorageReady: databaseReady,
    usageMeteringEnabled: USAGE_METERING_ENABLED,
    shopifySubscriptionRequired: SHOPIFY_SUBSCRIPTION_REQUIRED,
    shopifyUsageBillingEnabled: SHOPIFY_USAGE_BILLING_ENABLED,
    defaultPlan: SHOPIFY_DEFAULT_PLAN_HANDLE,
    availablePlanHandles: PLANS.map((plan) => plan.handle),
  });
});

const port = Number(process.env.PORT) || 3000;
initializeDatabase()
  .catch((error) => {
    console.error("Databáze se nepřipojila:", error);
  })
  .finally(() => {
    app.listen(port, "0.0.0.0", () => {
      console.log(`Chatnelo běží na portu ${port}`);
    });
    if (SHOPIFY_USAGE_BILLING_ENABLED) {
      setInterval(() => {
        flushPendingBillingEvents().catch((error) => {
          console.error("Shopify Billing fronta:", error);
        });
      }, 60_000).unref();
      setImmediate(() => flushPendingBillingEvents().catch((error) => {
        console.error("Shopify Billing fronta:", error);
      }));
    }
  });
