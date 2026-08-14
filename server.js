const express = require("express");
const path = require("path");
const crypto = require("crypto");
const { Pool } = require("pg");
const {
  DEFAULT_PLAN_HANDLE,
  PLANS,
  calculateBillingPeriod,
  calculateSubscriptionPeriod,
  publicPlans,
  resolvePlan,
} = require("./billing");

const app = express();
app.use(express.json({ limit: "32kb" }));
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
// Shopify blocks App Proxy URLs before a password-protected development store
// has been unlocked. Keep this fallback restricted to our single test shop.
const PASSWORD_PROTECTED_TEST_SHOP = process.env.PASSWORD_PROTECTED_TEST_SHOP ||
  "eshop-assistant-test.myshopify.com";
const PASSWORD_PROTECTED_TEST_ORIGIN = `https://${PASSWORD_PROTECTED_TEST_SHOP}`;

const shopTokens = new Map();
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

async function generateAnswer(catalog, message, history) {
  if (!OPENAI_API_KEY) throw new Error("OPENAI_API_KEY není nastaven.");

  const system = `Jsi ochotný nákupní asistent e-shopu ${catalog.shop.name}.
Odpovídej česky, stručně a konkrétně.
Používej pouze fakta z poskytnutých dat Shopify. Nevymýšlej sklad, ceny, slevy ani vlastnosti.
Za skladem považuj variantu jen pokud availableForSale je true a inventoryQuantity je větší než 0.
Pokud informace v datech není, řekni to otevřeně.
Částky uváděj v měně ${catalog.shop.currencyCode}.
Data Shopify:
${JSON.stringify({ shop: catalog.shop, products: catalog.products })}`;

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

async function answerChat(shop, accessToken, body) {
  const { caseId, message, history } = validateChatBody(body);
  const catalog = await loadCatalog(shop, accessToken);
  if (SHOPIFY_SUBSCRIPTION_REQUIRED && !catalog.subscription) {
    const error = new Error("Obchod nemá aktivní předplatné Eshop Assistant AI.");
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
  <title>Eshop Assistant AI</title>
  <style>
    body{font-family:system-ui,-apple-system,sans-serif;margin:0;background:#f6f6f7;color:#202223}
    main{max-width:900px;margin:48px auto;padding:32px;background:#fff;border-radius:16px;box-shadow:0 1px 4px #00000012}
    h1{margin-top:0;color:#173b70}
    .usage-card{margin-top:28px;padding:22px;border:1px solid #dfe3e8;border-radius:12px;background:#fafbfb}
    .usage-row{display:flex;justify-content:space-between;gap:24px;align-items:baseline;flex-wrap:wrap}
    .usage-value{font-size:1.5rem;font-weight:700;color:#173b70}
    progress{width:100%;height:14px;margin:14px 0;accent-color:#173b70}
    .muted{color:#637381;font-size:.92rem}
    table{width:100%;border-collapse:collapse;margin-top:20px;font-size:.92rem}
    th,td{padding:9px;border-bottom:1px solid #dfe3e8;text-align:left}
    th{color:#637381;font-weight:600}
    .error{color:#b42318}
  </style>
</head>
<body>
  <main>
    <h1>Eshop Assistant AI</h1>
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
        error: "Asistent se právě připojuje. Správce obchodu musí jednou otevřít aplikaci Eshop Assistant AI v administraci.",
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
        error: "Asistent se právě připojuje. Otevřete jednou aplikaci Eshop Assistant AI v administraci.",
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
      console.log(`Eshop Assistant AI běží na portu ${port}`);
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
