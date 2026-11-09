// BrosWars Partner (creator affiliate program) – Chatnelo side.
// Binding contract: broswars-studio/partneri/KONTRAKT.md. The hub (Supabase)
// owns partners, clicks and commission rules; this module only
//   1. captures ?bw=<clickId> on chatnelo.com pages (inline client script),
//   2. attaches a click to a Shopify shop (landing step / creator code in the
//      admin) or to a non-Shopify store at sign-up,
//   3. publishes a feed of money actually paid by attributed stores.
// Completely separate from the merchant-to-merchant referral program
// (referrals.js, 30 days free), which stays as it is.
const { hash } = require("./referrals");

const HUB_URL = (process.env.AFF_HUB_URL || "https://smjplqxwqyraphfeqsyk.supabase.co/functions/v1/aff").replace(/\/$/, "");
const CLICK_ID_RE = /^bw_[a-z0-9]{20}$/;
const DAY_MS = 24 * 60 * 60 * 1000;
const PERIOD_MS = 30 * DAY_MS;
const HUB_TIMEOUT_MS = 6000;
const REFRESH_STALE_MS = 15 * 60 * 1000;
const REFRESH_INTERVAL_MS = 60 * 60 * 1000;
// Stripe amounts are in the smallest unit; these currencies have none.
const ZERO_DECIMAL = new Set(["BIF", "CLP", "DJF", "GNF", "JPY", "KMF", "KRW", "MGA", "PYG", "RWF", "UGX", "VND", "VUV", "XAF", "XOF", "XPF"]);

function isValidClickId(value) {
  return typeof value === "string" && CLICK_ID_RE.test(value);
}

// "mystore", "mystore.myshopify.com" or "https://mystore.myshopify.com/admin"
// -> "mystore.myshopify.com". A custom domain (mystore.cz) cannot be mapped
// to the shop, so it is rejected.
function normalizeShopDomain(value) {
  let text = String(value || "").trim().toLowerCase();
  if (!text || text.length > 200) return null;
  text = text.replace(/^[a-z]+:\/\//, "").split(/[/?#]/)[0].replace(/:\d+$/, "");
  if (/^admin\.shopify\.com$/.test(text)) return null;
  if (/^[a-z0-9][a-z0-9-]*\.myshopify\.com$/.test(text)) return text;
  if (/^[a-z0-9][a-z0-9-]{0,60}$/.test(text)) return `${text}.myshopify.com`;
  return null;
}

function normalizeCreatorCode(value) {
  return String(value || "").toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 20);
}

function shopKey(shop) {
  return hash(shop);
}

// Non-Shopify (Stripe-billed) stores are keyed by their store id.
function storeKey(storeId) {
  return hash(`store:${storeId}`);
}

async function ensureTables(db) {
  // Full history: the attribution for a payment is the latest row with
  // attached_at <= paid_at. Only a hash of the shop domain is stored.
  await db.query(`
    CREATE TABLE IF NOT EXISTS aff_attributions (
      id SERIAL PRIMARY KEY,
      shop_hash TEXT NOT NULL,
      click_id TEXT NOT NULL,
      attached_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await db.query("ALTER TABLE aff_attributions ADD COLUMN IF NOT EXISTS via TEXT");
  await db.query("CREATE INDEX IF NOT EXISTS aff_attributions_shop_idx ON aff_attributions (shop_hash, attached_at)");
  // Paid periods / invoices observed for attributed stores. Rows are written
  // once and never changed, so external_id and amount stay stable for the hub
  // even after the subscription is cancelled or the app is uninstalled.
  await db.query(`
    CREATE TABLE IF NOT EXISTS aff_conversions (
      external_id TEXT PRIMARY KEY,
      source TEXT NOT NULL,
      shop_hash TEXT NOT NULL,
      subscription_id TEXT,
      period_index INTEGER,
      click_id TEXT,
      gross_amount NUMERIC(12, 2) NOT NULL,
      amount NUMERIC(12, 2) NOT NULL,
      currency TEXT NOT NULL,
      paid_at TIMESTAMPTZ NOT NULL,
      description TEXT,
      recorded_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await db.query("CREATE INDEX IF NOT EXISTS aff_conversions_paid_idx ON aff_conversions (paid_at)");
  await db.query("CREATE INDEX IF NOT EXISTS aff_conversions_recorded_idx ON aff_conversions (recorded_at)");
}

async function recordAttribution(db, { key, clickId, via }) {
  if (!isValidClickId(clickId)) throw new Error("invalid click id");
  const latest = await db.query(
    "SELECT click_id FROM aff_attributions WHERE shop_hash = $1 ORDER BY attached_at DESC, id DESC LIMIT 1",
    [key],
  );
  if (latest.rowCount && latest.rows[0].click_id === clickId) return false;
  await db.query("INSERT INTO aff_attributions (shop_hash, click_id, via) VALUES ($1, $2, $3)", [key, clickId, via]);
  return true;
}

// attributions: [{click_id, attached_at}] in any order.
function clickForPaidAt(attributions, paidAt) {
  const paid = new Date(paidAt).getTime();
  let best = null;
  for (const row of attributions || []) {
    const at = new Date(row.attached_at).getTime();
    if (!Number.isFinite(at) || at > paid) continue;
    if (!best || at >= best.at) best = { at, clickId: row.click_id };
  }
  return best ? best.clickId : null;
}

function money(value) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.round(number * 100) / 100 : NaN;
}

function numericId(gid) {
  return String(gid || "").split("/").pop().replace(/[^0-9A-Za-z_-]/g, "").slice(0, 40);
}

const APPROVED_STATUSES = new Set(["ACTIVE", "CANCELLED", "FROZEN", "ACCEPTED"]);

// Charged 30-day periods of one Shopify app subscription, derived from what
// the Admin API exposes (it has no list of charges):
//   - only ACTIVE, non-test subscriptions with exactly one recurring
//     EVERY_30_DAYS line item and a known currentPeriodEnd are used; anything
//     else returns [] (nothing is guessed),
//   - Shopify bills at the start of each period after the trial, and periods
//     are anchored at currentPeriodEnd, so period k starts at
//     currentPeriodEnd - k*30d (k >= 1, k = 1 is the current one),
//   - a period counts only when it starts on/after the trial end (createdAt +
//     trialDays, minus one day of tolerance for the approval delay) and
//     has already started (start <= now),
//   - n = whole 30-day steps since that threshold: stable for the lifetime of
//     the subscription,
//   - a discount (first-month offer) uses priceAfterDiscount for its first
//     durationLimitInIntervals periods,
//   - after a plan change (an earlier approved subscription whose trial had
//     ended), Shopify prorates the replaced plan in a way the API does not
//     expose, so the first period of the new subscription is skipped.
function shopifyPaidPeriods(subscription, { now = new Date(), allSubscriptions = [] } = {}) {
  const sub = subscription;
  if (!sub || sub.test || sub.status !== "ACTIVE") return [];
  const items = (sub.lineItems || []).map((item) => item && item.plan && item.plan.pricingDetails).filter(Boolean);
  const recurring = items.filter((pricing) => pricing.__typename === "AppRecurringPricing");
  if (recurring.length !== 1) return [];
  const pricing = recurring[0];
  if (pricing.interval !== "EVERY_30_DAYS") return [];
  const price = money(pricing.price && pricing.price.amount);
  const currency = String((pricing.price && pricing.price.currencyCode) || "").toUpperCase();
  if (!(price > 0) || !/^[A-Z]{3}$/.test(currency)) return [];

  const createdAt = new Date(sub.createdAt).getTime();
  const periodEnd = new Date(sub.currentPeriodEnd).getTime();
  const nowMs = new Date(now).getTime();
  if (!Number.isFinite(createdAt) || !Number.isFinite(periodEnd) || !Number.isFinite(nowMs)) return [];
  const trialDays = Math.max(0, Number(sub.trialDays) || 0);
  const threshold = createdAt + trialDays * DAY_MS - DAY_MS;

  let discounted = 0;
  let discountedPrice = price;
  if (pricing.discount) {
    discountedPrice = money(pricing.discount.priceAfterDiscount && pricing.discount.priceAfterDiscount.amount);
    if (!Number.isFinite(discountedPrice) || discountedPrice < 0) return [];
    const limit = pricing.discount.durationLimitInIntervals;
    discounted = limit === null || limit === undefined ? Infinity : Math.max(0, Number(limit) || 0);
  }

  const replacesPaidPlan = (allSubscriptions || []).some((other) => {
    if (!other || other.id === sub.id || other.test || !APPROVED_STATUSES.has(other.status)) return false;
    const otherCreated = new Date(other.createdAt).getTime();
    if (!Number.isFinite(otherCreated) || otherCreated >= createdAt) return false;
    return otherCreated + Math.max(0, Number(other.trialDays) || 0) * DAY_MS < createdAt;
  });

  const id = numericId(sub.id);
  if (!id) return [];
  const periods = [];
  for (let k = 1; k <= 400; k += 1) {
    const start = periodEnd - k * PERIOD_MS;
    if (start < threshold) break;
    if (start > nowMs) continue;
    const n = Math.floor((start - threshold) / PERIOD_MS);
    if (n === 0 && replacesPaidPlan) continue;
    const gross = n < discounted ? discountedPrice : price;
    if (!(gross > 0)) continue;
    periods.push({ subscriptionId: id, n, start: new Date(start), gross, currency, name: String(sub.name || "").slice(0, 60) });
  }
  return periods.sort((a, b) => a.start - b.start);
}

// App credits (e.g. the merchant-referral reward, one month of credit) are
// spent by Shopify on the next charges, so they are subtracted from the
// periods that start after each credit was issued, oldest first.
// periods: [{key, start, gross, currency, fixedNet?}] – fixedNet for rows
// already recorded (their amount never changes). Returns Map key -> net, or
// null when credits use a different currency than the periods.
function allocateCredits(periods, credits) {
  const list = [...periods].sort((a, b) => a.start - b.start);
  const pending = (credits || [])
    .filter((credit) => credit && !credit.test)
    .map((credit) => ({
      at: new Date(credit.createdAt).getTime(),
      amount: money(credit.amount && credit.amount.amount),
      currency: String((credit.amount && credit.amount.currencyCode) || "").toUpperCase(),
    }))
    .filter((credit) => Number.isFinite(credit.at) && credit.amount > 0)
    .sort((a, b) => a.at - b.at);
  const currencies = new Set(list.map((period) => period.currency));
  if (pending.some((credit) => !currencies.has(credit.currency) || currencies.size > 1)) return null;

  const result = new Map();
  let pool = 0;
  let index = 0;
  for (const period of list) {
    const start = new Date(period.start).getTime();
    while (index < pending.length && pending[index].at <= start) {
      pool = money(pool + pending[index].amount);
      index += 1;
    }
    if (Number.isFinite(period.fixedNet)) {
      pool = Math.max(0, money(pool - Math.max(0, period.gross - period.fixedNet)));
      result.set(period.key, period.fixedNet);
      continue;
    }
    const used = Math.min(pool, period.gross);
    pool = money(pool - used);
    result.set(period.key, money(period.gross - used));
  }
  return result;
}

function shopifyExternalId(key, period) {
  return `${key.slice(0, 16)}:${period.subscriptionId}:${period.n}`;
}

// Paid Stripe invoices of a non-Shopify store -> conversions. Only live,
// actually paid money; credit notes issued after payment are subtracted.
function stripeInvoiceConversions(invoices) {
  const out = [];
  for (const invoice of invoices || []) {
    if (!invoice || invoice.status !== "paid" || invoice.livemode !== true) continue;
    const currency = String(invoice.currency || "").toUpperCase();
    if (!/^[A-Z]{3}$/.test(currency)) continue;
    const divisor = ZERO_DECIMAL.has(currency) ? 1 : 100;
    const paidCents = Number(invoice.amount_paid) - Number(invoice.post_payment_credit_notes_amount || 0);
    const paidAtSeconds = Number(invoice.status_transitions && invoice.status_transitions.paid_at);
    if (!(paidCents > 0) || !Number.isFinite(paidAtSeconds) || !invoice.id) continue;
    out.push({
      externalId: String(invoice.id),
      gross: money(Number(invoice.amount_paid) / divisor),
      amount: money(paidCents / divisor),
      currency,
      paidAt: new Date(paidAtSeconds * 1000),
    });
  }
  return out;
}

// Hub calls. hubCheck -> true / false, or null when the hub cannot be reached.
async function hubCheck(clickId, fetchImpl = fetch) {
  try {
    const response = await fetchImpl(`${HUB_URL}/check?id=${encodeURIComponent(clickId)}`, {
      headers: { accept: "application/json" },
      signal: AbortSignal.timeout(HUB_TIMEOUT_MS),
    });
    if (!response.ok) return null;
    const data = await response.json();
    return typeof data?.valid === "boolean" ? data.valid : null;
  } catch (_error) {
    return null;
  }
}

// -> {clickId} | {unknown: true}; throws when the hub cannot be reached.
async function hubCode(code, clientIp, fetchImpl = fetch) {
  const headers = { "Content-Type": "application/json", accept: "application/json" };
  // The hub limits clicks per IP + code; pass the merchant's IP so all
  // merchants are not counted as this server.
  if (clientIp && clientIp !== "unknown") headers["X-Forwarded-For"] = String(clientIp).slice(0, 64);
  const response = await fetchImpl(`${HUB_URL}/code`, {
    method: "POST",
    headers,
    body: JSON.stringify({ code, to: "chatnelo" }),
    signal: AbortSignal.timeout(HUB_TIMEOUT_MS),
  });
  const data = await response.json().catch(() => ({}));
  if (response.status === 404 || data.error === "unknown_code") return { unknown: true };
  if (!response.ok) throw new Error(`hub HTTP ${response.status}`);
  return isValidClickId(data.click_id) ? { clickId: data.click_id } : { unknown: true };
}

const SHOPIFY_BILLING_QUERY = `{
  shop { plan { partnerDevelopment } }
  currentAppInstallation {
    allSubscriptions(first: 50) {
      nodes {
        id name status test trialDays createdAt currentPeriodEnd
        lineItems {
          plan {
            pricingDetails {
              __typename
              ... on AppRecurringPricing {
                interval
                price { amount currencyCode }
                discount { durationLimitInIntervals priceAfterDiscount { amount currencyCode } }
              }
            }
          }
        }
      }
    }
    credits(first: 100) { nodes { amount { amount currencyCode } createdAt test } }
  }
}`;

// Small fixed-window limiter (same approach as the other limiters in server.js).
function createLimiter(limit, windowMs) {
  const entries = new Map();
  const check = (key) => {
    const now = Date.now();
    if (entries.size > 50000) entries.clear();
    const entry = entries.get(key);
    if (!entry || now - entry.windowStart > windowMs) {
      entries.set(key, { windowStart: now, count: 1 });
      return false;
    }
    entry.count += 1;
    return entry.count > limit;
  };
  check.prune = () => {
    const now = Date.now();
    for (const [key, entry] of entries) if (now - entry.windowStart > windowMs) entries.delete(key);
  };
  return check;
}

function createAffiliate(deps) {
  const {
    getDb, getShopToken, shopifyGraphql, getAdminAccess, getStripe, clientIp,
    logRouteError, errorStatus, publicErrorMessage, httpError,
  } = deps;
  const attachLimited = createLimiter(10, 60 * 60 * 1000);
  const attachGlobal = createLimiter(600, 60 * 60 * 1000);
  const codeLimited = createLimiter(10, 60 * 60 * 1000);
  const feedLimited = createLimiter(60, 60 * 60 * 1000);
  let lastRefresh = 0;
  let refreshing = null;

  async function isInstalled(db, shop) {
    const result = await db.query("SELECT 1 FROM shop_sessions WHERE shop = $1", [shop]);
    return result.rowCount > 0;
  }

  async function attributionsFor(db, key) {
    const result = await db.query("SELECT click_id, attached_at FROM aff_attributions WHERE shop_hash = $1", [key]);
    return result.rows;
  }

  async function insertConversion(db, row) {
    await db.query(
      `INSERT INTO aff_conversions
         (external_id, source, shop_hash, subscription_id, period_index, click_id, gross_amount, amount, currency, paid_at, description)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
       ON CONFLICT (external_id) DO NOTHING`,
      [row.externalId, row.source, row.key, row.subscriptionId || null, Number.isInteger(row.n) ? row.n : null,
        row.clickId, row.gross, row.amount, row.currency, row.paidAt, row.description || null],
    );
  }

  async function refreshShop(db, shop, key, now) {
    const accessToken = await getShopToken(shop);
    if (!accessToken) return;
    const data = await shopifyGraphql(shop, accessToken, SHOPIFY_BILLING_QUERY);
    // Development stores (our test store, App Store reviewers) never pay.
    if (!data || !data.shop || !data.shop.plan || data.shop.plan.partnerDevelopment !== false) return;
    const installation = data.currentAppInstallation || {};
    const subscriptions = (installation.allSubscriptions && installation.allSubscriptions.nodes) || [];
    const fresh = [];
    for (const sub of subscriptions) {
      for (const period of shopifyPaidPeriods(sub, { now, allSubscriptions: subscriptions })) {
        fresh.push({ ...period, key: shopifyExternalId(key, period) });
      }
    }
    if (!fresh.length) return;
    const recorded = await db.query(
      "SELECT external_id, gross_amount, amount, currency, paid_at FROM aff_conversions WHERE shop_hash = $1 AND source = 'shopify'",
      [key],
    );
    const known = new Map(recorded.rows.map((row) => [row.external_id, row]));
    const periods = recorded.rows.map((row) => ({
      key: row.external_id, start: new Date(row.paid_at), gross: Number(row.gross_amount),
      currency: row.currency, fixedNet: Number(row.amount),
    }));
    for (const period of fresh) {
      if (!known.has(period.key)) periods.push({ key: period.key, start: period.start, gross: period.gross, currency: period.currency });
    }
    const credits = (installation.credits && installation.credits.nodes) || [];
    const nets = allocateCredits(periods, credits);
    if (!nets) {
      console.warn("Affiliate: kredity v jiné měně, platby obchodu nelze spočítat.", { shop: key.slice(0, 16) });
      return;
    }
    const attributions = await attributionsFor(db, key);
    for (const period of fresh) {
      if (known.has(period.key)) continue;
      await insertConversion(db, {
        externalId: period.key, source: "shopify", key, subscriptionId: period.subscriptionId, n: period.n,
        clickId: clickForPaidAt(attributions, period.start), gross: period.gross, amount: nets.get(period.key),
        currency: period.currency, paidAt: period.start,
        description: `Chatnelo ${period.name || "subscription"} – 30 days #${period.n + 1}`,
      });
    }
  }

  async function refreshStripeStore(db, stripe, store, key) {
    const attributions = await attributionsFor(db, key);
    const invoices = [];
    for await (const invoice of stripe.invoices.list({ customer: store.stripe_customer_id, status: "paid", limit: 100 })) {
      invoices.push(invoice);
      if (invoices.length >= 500) break;
    }
    for (const row of stripeInvoiceConversions(invoices)) {
      await insertConversion(db, {
        externalId: row.externalId, source: "stripe", key, clickId: clickForPaidAt(attributions, row.paidAt),
        gross: row.gross, amount: row.amount, currency: row.currency, paidAt: row.paidAt,
        description: "Chatnelo subscription (Stripe invoice)",
      });
    }
  }

  async function refreshNow() {
    const db = getDb();
    if (!db) return;
    const now = new Date();
    const keys = new Set((await db.query("SELECT DISTINCT shop_hash FROM aff_attributions")).rows.map((row) => row.shop_hash));
    if (!keys.size) return;
    const shops = (await db.query("SELECT shop FROM shop_sessions")).rows.map((row) => row.shop);
    for (const shop of shops) {
      const key = shopKey(shop);
      if (!keys.has(key)) continue;
      await refreshShop(db, shop, key, now).catch((error) => {
        console.warn("Affiliate: platby obchodu nelze načíst:", { shop: key.slice(0, 16), error: error.message });
      });
    }
    const stripe = getStripe();
    if (stripe) {
      const stores = (await db.query("SELECT id, stripe_customer_id FROM generic_stores WHERE stripe_customer_id IS NOT NULL")).rows;
      for (const store of stores) {
        const key = storeKey(store.id);
        if (!keys.has(key)) continue;
        await refreshStripeStore(db, stripe, store, key).catch((error) => {
          console.warn("Affiliate: faktury Stripe nelze načíst:", { store: key.slice(0, 16), error: error.message });
        });
      }
    }
  }

  function refresh() {
    if (!refreshing) {
      refreshing = refreshNow()
        .catch((error) => console.error("Affiliate: obnova plateb selhala:", error.message))
        .finally(() => { lastRefresh = Date.now(); refreshing = null; });
    }
    return refreshing;
  }

  function start() {
    setInterval(() => { refresh(); }, REFRESH_INTERVAL_MS).unref();
    setInterval(() => { attachLimited.prune(); attachGlobal.prune(); codeLimited.prune(); feedLimited.prune(); }, 10 * 60 * 1000).unref();
    setTimeout(() => { refresh(); }, 2 * 60 * 1000).unref();
  }

  // Non-Shopify sign-up with a stored bw_click: attach to the new store.
  async function attachStore(storeId, clickId) {
    const db = getDb();
    if (!db || !isValidClickId(clickId)) return;
    if ((await hubCheck(clickId)) === false) return;
    await recordAttribution(db, { key: storeKey(storeId), clickId, via: "signup" });
  }

  function register(app) {
    // Public: landing step "your store address" before the App Store.
    // Always answers {ok:true} for well-formed input, so it cannot be used to
    // find out whether a shop uses Chatnelo.
    app.post("/api/aff/attach", async (req, res) => {
      res.set("Cache-Control", "no-store");
      try {
        const ip = clientIp(req);
        if (attachLimited(ip) || attachGlobal("all")) return res.status(429).json({ error: "Too many requests." });
        const clickId = req.body && req.body.click_id;
        const shop = normalizeShopDomain(req.body && req.body.shop);
        if (!isValidClickId(clickId) || !shop) return res.status(400).json({ error: "Invalid input." });
        const db = getDb();
        if (!db) return res.status(503).json({ error: "Unavailable." });
        // A shop that already has the app installed is not taken over by
        // anyone who types its address; its merchant can enter a creator code
        // in the app instead.
        if (!(await isInstalled(db, shop)) && (await hubCheck(clickId)) !== false) {
          await recordAttribution(db, { key: shopKey(shop), clickId, via: "landing" });
        }
        return res.json({ ok: true });
      } catch (error) {
        logRouteError("Affiliate attach", error);
        return res.status(500).json({ error: "Error." });
      }
    });

    // Shopify admin: has this shop a creator attribution?
    app.get("/api/aff/creator", async (req, res) => {
      res.set("Cache-Control", "no-store");
      try {
        const { shop } = await getAdminAccess(req);
        const db = getDb();
        if (!db) throw httpError("Databáze není dostupná.", 503);
        const result = await db.query("SELECT MAX(attached_at) AS at FROM aff_attributions WHERE shop_hash = $1", [shopKey(shop)]);
        res.json({ attached: Boolean(result.rows[0] && result.rows[0].at) });
      } catch (error) {
        logRouteError("Affiliate creator status", error);
        res.status(errorStatus(error)).json({ error: publicErrorMessage(error) });
      }
    });

    // Shopify admin: the merchant enters a creator code (BrosWars Partner).
    app.post("/api/aff/creator", async (req, res) => {
      res.set("Cache-Control", "no-store");
      try {
        const { shop } = await getAdminAccess(req);
        const db = getDb();
        if (!db) throw httpError("Databáze není dostupná.", 503);
        if (codeLimited(shopKey(shop))) throw httpError("Too many attempts. Try again later.", 429);
        const code = normalizeCreatorCode(req.body && req.body.code);
        if (code.length < 2) return res.status(400).json({ error: "invalid_code" });
        let result;
        try {
          result = await hubCode(code, clientIp(req));
        } catch (error) {
          console.warn("Affiliate: hub nedostupný:", error.message);
          return res.status(503).json({ error: "hub_unavailable" });
        }
        if (!result.clickId) return res.status(400).json({ error: "unknown_code" });
        await recordAttribution(db, { key: shopKey(shop), clickId: result.clickId, via: "admin_code" });
        res.json({ ok: true });
      } catch (error) {
        logRouteError("Affiliate creator code", error);
        res.status(errorStatus(error)).json({ error: publicErrorMessage(error) });
      }
    });

    // Public feed polled hourly by the hub. Only money actually paid by
    // attributed stores; no PII (shop hashes are truncated in external_id).
    // Rows recorded late (e.g. after a Shopify API outage) are also returned
    // when recorded_at >= since, so the hub's overlap window cannot miss them;
    // the hub de-duplicates by external_id.
    app.get("/api/aff/conversions", async (req, res) => {
      res.set("Cache-Control", "no-store");
      try {
        if (feedLimited(clientIp(req))) return res.status(429).json({ error: "Too many requests." });
        const since = req.query.since ? new Date(String(req.query.since)) : new Date(0);
        if (!Number.isFinite(since.getTime())) return res.status(400).json({ error: "Invalid since." });
        const db = getDb();
        if (!db) return res.status(503).json({ error: "Unavailable." });
        if (Date.now() - lastRefresh > REFRESH_STALE_MS) {
          await Promise.race([refresh(), new Promise((resolve) => setTimeout(resolve, 25_000).unref())]);
        }
        const result = await db.query(
          `SELECT external_id, click_id, amount, currency, paid_at, description FROM aff_conversions
           WHERE click_id IS NOT NULL AND amount > 0 AND (paid_at >= $1 OR recorded_at >= $1)
           ORDER BY paid_at ASC LIMIT 2000`,
          [since],
        );
        res.json({
          conversions: result.rows.map((row) => ({
            external_id: row.external_id,
            click_id: row.click_id,
            amount: Number(row.amount),
            currency: row.currency,
            paid_at: new Date(row.paid_at).toISOString(),
            description: row.description || "",
          })),
        });
      } catch (error) {
        logRouteError("Affiliate conversions", error);
        res.status(500).json({ error: "Error." });
      }
    });
  }

  return { register, start, refresh, attachStore };
}

// Inline client script for public chatnelo.com pages (no dependencies):
//  - ?bw=<clickId> -> localStorage bw_click = {id, at} (always overwritten,
//    last click wins) and the parameter is removed from the URL,
//  - with a valid click (<= 365 days), the first click on an App Store CTA
//    asks for the store's myshopify address, sends it to /api/aff/attach and
//    continues to the App Store. Skippable; never blocks the install.
function clientScript() {
  return `<script>
(function () {
  var KEY = "bw_click", DONE = "bw_click_attached", RE = /^bw_[a-z0-9]{20}$/, YEAR = 365 * 864e5;
  try {
    var url = new URL(location.href), bw = url.searchParams.get("bw");
    if (bw !== null) {
      if (RE.test(bw)) localStorage.setItem(KEY, JSON.stringify({ id: bw, at: Date.now() }));
      url.searchParams.delete("bw");
      history.replaceState(history.state, "", url.pathname + url.search + url.hash);
    }
  } catch (e) {}
  function click() {
    try {
      var c = JSON.parse(localStorage.getItem(KEY) || "null");
      return c && RE.test(c.id) && Date.now() - Number(c.at) <= YEAR ? c : null;
    } catch (e) { return null; }
  }
  window.bwClickId = function () { var c = click(); return c ? c.id : ""; };
  var T = {
    cs: ["Ještě jeden krok", "Zadejte adresu svého obchodu na Shopify, ať víme, kdo vám Chatnelo doporučil. Cena se tím nemění.", "Najdete ji v administraci Shopify v Nastavení → Domény.", "Pokračovat do Shopify App Store", "Přeskočit", "Zadejte adresu ve tvaru vas-obchod.myshopify.com."],
    sk: ["Ešte jeden krok", "Zadajte adresu svojho obchodu na Shopify, aby sme vedeli, kto vám Chatnelo odporučil. Cena sa tým nemení.", "Nájdete ju v administrácii Shopify v Nastavenia → Domény.", "Pokračovať do Shopify App Store", "Preskočiť", "Zadajte adresu v tvare vas-obchod.myshopify.com."],
    en: ["One more step", "Enter your Shopify store address so we know who recommended Chatnelo to you. The price stays the same.", "You can find it in your Shopify admin under Settings → Domains.", "Continue to the Shopify App Store", "Skip", "Enter the address as your-store.myshopify.com."],
    de: ["Noch ein Schritt", "Geben Sie die Adresse Ihres Shopify-Shops ein, damit wir wissen, wer Ihnen Chatnelo empfohlen hat. Der Preis bleibt gleich.", "Sie finden sie im Shopify-Admin unter Einstellungen → Domains.", "Weiter zum Shopify App Store", "Überspringen", "Geben Sie die Adresse als ihr-shop.myshopify.com ein."],
    pl: ["Jeszcze jeden krok", "Wpisz adres swojego sklepu Shopify, abyśmy wiedzieli, kto polecił Ci Chatnelo. Cena się nie zmienia.", "Znajdziesz go w panelu Shopify w Ustawienia → Domeny.", "Przejdź do Shopify App Store", "Pomiń", "Wpisz adres w formacie twoj-sklep.myshopify.com."]
  };
  function t() {
    var l = String(window.CHATNELO_LANG || document.documentElement.lang || navigator.language || "cs").slice(0, 2).toLowerCase();
    return T[l] || T.en;
  }
  function shop(v) {
    v = String(v || "").trim().toLowerCase().replace(/^[a-z]+:\\/\\//, "").split(/[\\/?#]/)[0];
    if (/^[a-z0-9][a-z0-9-]*\\.myshopify\\.com$/.test(v)) return v;
    if (/^[a-z0-9][a-z0-9-]{0,60}$/.test(v)) return v + ".myshopify.com";
    return "";
  }
  function isCta(a) {
    return a && /^https:\\/\\/apps\\.shopify\\.com\\/chatnelo\\/?(\\?[^#]*)?$/.test(a.href || "");
  }
  function ask(a, c) {
    var s = t(), box = document.createElement("div");
    box.setAttribute("role", "dialog"); box.setAttribute("aria-modal", "true"); box.setAttribute("aria-labelledby", "bw-t");
    box.style.cssText = "position:fixed;inset:0;z-index:2147483000;display:flex;align-items:center;justify-content:center;padding:16px;background:rgba(5,6,13,.62);backdrop-filter:blur(4px);font-family:system-ui,-apple-system,'Segoe UI',Roboto,sans-serif";
    box.innerHTML = '<form style="width:100%;max-width:440px;background:#fff;color:#0f172a;border-radius:20px;padding:26px 24px 20px;box-shadow:0 30px 80px -20px rgba(0,0,0,.55);border:1px solid #ede9fe">' +
      '<div style="width:44px;height:6px;border-radius:9px;background:linear-gradient(90deg,#22d3ee,#a855f7);margin-bottom:16px"></div>' +
      '<h2 id="bw-t" style="margin:0 0 6px;font-size:1.3rem;line-height:1.25"></h2><p id="bw-p" style="margin:0 0 16px;color:#475569;font-size:.95rem;line-height:1.5"></p>' +
      '<label style="display:flex;align-items:center;border:1px solid #cbd5e1;border-radius:12px;overflow:hidden;background:#f8fafc;font-size:1rem"><input id="bw-i" autocomplete="off" autocapitalize="none" spellcheck="false" inputmode="url" placeholder="vas-obchod" style="flex:1;min-width:0;border:0;padding:12px;font:inherit;background:#fff;color:#0f172a;outline:none"><span style="padding:0 12px;color:#64748b;white-space:nowrap">.myshopify.com</span></label>' +
      '<p id="bw-h" style="margin:8px 0 0;color:#64748b;font-size:.82rem"></p><p id="bw-e" role="alert" style="margin:8px 0 0;color:#b42318;font-size:.88rem" hidden></p>' +
      '<div style="display:flex;flex-wrap:wrap;gap:10px;align-items:center;margin-top:18px"><button id="bw-go" type="submit" style="flex:1 1 auto;border:0;border-radius:12px;padding:13px 18px;font:inherit;font-weight:700;color:#fff;cursor:pointer;background:linear-gradient(135deg,#0891b2,#7e22ce)"></button><button id="bw-skip" type="button" style="border:0;background:none;color:#6d28d9;font:inherit;text-decoration:underline;cursor:pointer;padding:8px"></button></div></form>';
    document.body.appendChild(box);
    var $ = function (id) { return box.querySelector("#" + id); };
    $("bw-t").textContent = s[0]; $("bw-p").textContent = s[1]; $("bw-h").textContent = s[2]; $("bw-go").textContent = s[3]; $("bw-skip").textContent = s[4];
    var input = $("bw-i"); input.focus();
    function close() { box.remove(); document.removeEventListener("keydown", esc); }
    function go() {
      try { localStorage.setItem(DONE, c.id); } catch (e) {}
      close();
      if (a.target === "_blank") {
        var w = window.open(a.href, "_blank");
        if (w) { try { w.opener = null; } catch (e) {} } else location.href = a.href;
      } else location.href = a.href;
    }
    function esc(e) { if (e.key === "Escape") close(); }
    document.addEventListener("keydown", esc);
    box.addEventListener("click", function (e) { if (e.target === box) close(); });
    $("bw-skip").addEventListener("click", go);
    box.querySelector("form").addEventListener("submit", function (e) {
      e.preventDefault();
      var v = shop(input.value);
      if (!v) { $("bw-e").textContent = s[5]; $("bw-e").hidden = false; input.focus(); return; }
      try {
        fetch("/api/aff/attach", { method: "POST", keepalive: true, headers: { "Content-Type": "application/json" }, body: JSON.stringify({ click_id: c.id, shop: v }) }).catch(function () {});
      } catch (err) {}
      go();
    });
  }
  document.addEventListener("click", function (e) {
    if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    var a = e.target && e.target.closest ? e.target.closest("a[href]") : null;
    if (!isCta(a)) return;
    var c = click();
    var done = ""; try { done = localStorage.getItem(DONE) || ""; } catch (err) {}
    if (!c || done === c.id) return;
    e.preventDefault();
    ask(a, c);
  }, true);
})();
</script>`;
}

module.exports = {
  CLICK_ID_RE, HUB_URL, createAffiliate, clientScript, isValidClickId, normalizeShopDomain, normalizeCreatorCode,
  shopKey, storeKey, clickForPaidAt, shopifyPaidPeriods, allocateCredits, stripeInvoiceConversions,
  shopifyExternalId, recordAttribution, ensureTables, hubCheck, hubCode,
};
