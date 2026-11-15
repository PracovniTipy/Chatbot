// Wix App Market integration for Chatnelo.
//
// Flow:
//  1. A Wix site installs the app -> Wix sends the "App Instance Installed"
//     webhook to POST /wix/webhooks (JWT signed with the app's public key).
//  2. We create a Chatnelo store (generic_stores, access_mode = 'wix'), import
//     the Wix Stores catalogue (Catalog V1 or V3) and embed the chat widget
//     with the "Embedded Script" extension (dynamic params storeId + apiKey).
//  3. The site owner opens the app in the Wix dashboard -> GET /wix/dashboard
//     with a signed ?instance=… parameter (HMAC-SHA256 with the app secret).
//     There they see the status, can re-sync products and fill in shipping /
//     returns / payment info. Setup also runs from here if a webhook was missed.
//
// Env: WIX_APP_ID, WIX_APP_SECRET, WIX_PUBLIC_KEY (PEM from the Webhooks page).

const crypto = require("crypto");
const { generateSecretKey, generateStoreId } = require("./stores");

const WIX_API = "https://www.wixapis.com";
const MAX_PRODUCTS = 5000;
const RULE_KEYS = ["doprava", "vraceni", "platba"];

function env(name) {
  return String(process.env[name] || "").trim();
}

function publicKeyPem() {
  const raw = env("WIX_PUBLIC_KEY").replace(/\\n/g, "\n");
  if (!raw) return "";
  if (raw.includes("BEGIN")) return raw;
  return `-----BEGIN PUBLIC KEY-----\n${raw.replace(/\s+/g, "").match(/.{1,64}/g).join("\n")}\n-----END PUBLIC KEY-----\n`;
}

function b64urlDecode(text) {
  return Buffer.from(String(text).replace(/-/g, "+").replace(/_/g, "/"), "base64");
}

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

// ---------------------------------------------------------------- signatures

// Webhook body = JWT (RS256) signed by Wix. Returns the parsed event envelope.
function verifyWebhookJwt(token) {
  const key = publicKeyPem();
  if (!key) throw new Error("WIX_PUBLIC_KEY is not configured");
  const parts = String(token || "").trim().split(".");
  if (parts.length !== 3) throw new Error("Malformed webhook token");
  const header = JSON.parse(b64urlDecode(parts[0]).toString("utf8"));
  if (header.alg !== "RS256") throw new Error("Unexpected webhook algorithm");
  const ok = crypto.verify(
    "RSA-SHA256",
    Buffer.from(`${parts[0]}.${parts[1]}`),
    key,
    b64urlDecode(parts[2]),
  );
  if (!ok) throw new Error("Invalid webhook signature");
  const payload = JSON.parse(b64urlDecode(parts[1]).toString("utf8"));
  if (payload.exp && Date.now() / 1000 > payload.exp + 300) throw new Error("Webhook token expired");
  const event = typeof payload.data === "string" ? JSON.parse(payload.data) : payload.data || {};
  let data = event.data;
  if (typeof data === "string") {
    try { data = JSON.parse(data); } catch { /* keep raw */ }
  }
  return { eventType: event.eventType || "", instanceId: event.instanceId || "", data: data || {} };
}

// Dashboard ?instance=signature.data (HMAC-SHA256 with the app secret).
function parseSignedInstance(instance) {
  const secret = env("WIX_APP_SECRET");
  if (!secret) throw new Error("WIX_APP_SECRET is not configured");
  const [signature, data] = String(instance || "").split(".");
  if (!signature || !data) throw new Error("Missing app instance");
  const expected = crypto.createHmac("sha256", secret).update(data).digest();
  const given = b64urlDecode(signature);
  if (given.length !== expected.length || !crypto.timingSafeEqual(given, expected)) {
    throw new Error("Invalid app instance signature");
  }
  const decoded = JSON.parse(b64urlDecode(data).toString("utf8"));
  if (!decoded.instanceId) throw new Error("App instance without instanceId");
  // Anonymous visitors must never reach the dashboard.
  if (decoded.aid && !decoded.uid) throw new Error("Anonymous access is not allowed");
  return decoded;
}

// ---------------------------------------------------------------- Wix REST

const tokenCache = new Map();

async function accessToken(instanceId) {
  const cached = tokenCache.get(instanceId);
  if (cached && cached.expiresAt > Date.now() + 60000) return cached.token;
  const response = await fetch(`${WIX_API}/oauth2/token`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      grant_type: "client_credentials",
      client_id: env("WIX_APP_ID"),
      client_secret: env("WIX_APP_SECRET"),
      instance_id: instanceId,
    }),
  });
  const json = await response.json().catch(() => ({}));
  if (!response.ok || !json.access_token) {
    throw new Error(`Wix token error ${response.status}: ${JSON.stringify(json).slice(0, 200)}`);
  }
  const ttl = Number(json.expires_in) > 0 ? Number(json.expires_in) * 1000 : 4 * 3600 * 1000;
  tokenCache.set(instanceId, { token: json.access_token, expiresAt: Date.now() + ttl });
  return json.access_token;
}

async function wixRequest(instanceId, method, path, body) {
  const token = await accessToken(instanceId);
  const response = await fetch(`${WIX_API}${path}`, {
    method,
    headers: { Authorization: token, "Content-Type": "application/json", Accept: "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await response.text();
  let json = {};
  try { json = text ? JSON.parse(text) : {}; } catch { json = { raw: text.slice(0, 200) }; }
  if (!response.ok) {
    const error = new Error(`Wix API ${method} ${path} -> ${response.status}: ${text.slice(0, 300)}`);
    error.status = response.status;
    throw error;
  }
  return json;
}

function stripHtml(text) {
  return String(text || "")
    .replace(/<br\s*\/?>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

function availability(status) {
  if (status === "IN_STOCK" || status === "PARTIALLY_OUT_OF_STOCK") return "skladem";
  if (status === "OUT_OF_STOCK") return "není skladem";
  return undefined;
}

function clean(product) {
  for (const key of Object.keys(product)) {
    if (product[key] === undefined || product[key] === "" || product[key] === null) delete product[key];
  }
  return product;
}

function mapV3(p, fallbackCurrency, siteUrl) {
  const min = p.actualPriceRange && p.actualPriceRange.minValue;
  const price = min ? Number(min.amount) : NaN;
  const url = (p.url && p.url.url) || (siteUrl && p.slug ? `${siteUrl.replace(/\/$/, "")}/product-page/${p.slug}` : undefined);
  const image = p.media && p.media.main && ((p.media.main.image && p.media.main.image.url) || p.media.main.url);
  return clean({
    id: String(p.id || ""),
    nazev: String(p.name || "").slice(0, 200),
    cena: Number.isFinite(price) ? price : undefined,
    mena: p.currency || fallbackCurrency || undefined,
    dostupnost: availability(p.inventory && p.inventory.availabilityStatus),
    popis: stripHtml(p.plainDescription).slice(0, 600),
    vyrobce: (p.brand && p.brand.name) || undefined,
    url,
    obrazek: image || undefined,
  });
}

function mapV1(p, siteUrl) {
  const priceData = p.priceData || p.price || {};
  const price = Number(priceData.discountedPrice ?? priceData.price);
  const pageUrl = p.productPageUrl && p.productPageUrl.path
    ? `${String(p.productPageUrl.base || siteUrl || "").replace(/\/$/, "")}${p.productPageUrl.path}`
    : undefined;
  const stock = p.stock || {};
  let dostupnost = availability(stock.inventoryStatus);
  if (!dostupnost && typeof stock.inStock === "boolean") dostupnost = stock.inStock ? "skladem" : "není skladem";
  const product = clean({
    id: String(p.id || ""),
    nazev: String(p.name || "").slice(0, 200),
    cena: Number.isFinite(price) ? price : undefined,
    mena: priceData.currency || undefined,
    dostupnost,
    popis: stripHtml(p.description).slice(0, 600),
    vyrobce: p.brand || undefined,
    url: /^https?:\/\//.test(pageUrl || "") ? pageUrl : undefined,
    obrazek: (p.media && p.media.mainMedia && p.media.mainMedia.image && p.media.mainMedia.image.url) || undefined,
  });
  if (stock.trackInventory && Number.isInteger(stock.quantity)) product.sklad = stock.quantity;
  return product;
}

async function fetchCatalog(instanceId, siteUrl, currency) {
  let version = "V3_CATALOG";
  try {
    const result = await wixRequest(instanceId, "GET", "/stores/v3/provision/version");
    version = result.catalogVersion || version;
  } catch (error) {
    // Older permission sets may not allow the versioning call; try V1 then.
    version = "V1_CATALOG";
  }
  if (version === "STORES_NOT_INSTALLED") return { version, products: [] };

  const products = [];
  if (version === "V3_CATALOG") {
    let cursor = "";
    for (let page = 0; page < 60 && products.length < MAX_PRODUCTS; page += 1) {
      const body = {
        query: { cursorPaging: cursor ? { limit: 100, cursor } : { limit: 100 } },
        fields: ["URL", "PLAIN_DESCRIPTION", "CURRENCY"],
      };
      const result = await wixRequest(instanceId, "POST", "/stores/v3/products/query", body);
      for (const p of result.products || []) {
        if (p.visible === false) continue;
        const mapped = mapV3(p, currency, siteUrl);
        if (mapped.id && mapped.nazev) products.push(mapped);
      }
      const meta = result.pagingMetadata || {};
      cursor = (meta.cursors && meta.cursors.next) || "";
      if (!cursor || meta.hasNext === false) break;
    }
  } else {
    for (let offset = 0; offset < MAX_PRODUCTS; offset += 100) {
      const result = await wixRequest(instanceId, "POST", "/stores-reader/v1/products/query", {
        query: { paging: { limit: 100, offset } },
      });
      const list = result.products || [];
      for (const p of list) {
        if (p.visible === false) continue;
        const mapped = mapV1(p, siteUrl);
        if (mapped.id && mapped.nazev) products.push(mapped);
      }
      if (list.length < 100) break;
    }
  }
  return { version, products: products.slice(0, MAX_PRODUCTS) };
}

// ---------------------------------------------------------------- module

function register(app, deps = {}) {
  const database = deps.database;
  const logError = (label, error) => {
    try {
      if (typeof deps.logRouteError === "function") deps.logRouteError(label, error);
      else console.error(label, error);
    } catch (_) {
      console.error(label, error && error.message);
    }
  };

  let tableReady = null;
  function ensureTable() {
    if (!database) return Promise.reject(new Error("Database is not configured"));
    if (!tableReady) {
      tableReady = database.query(`
        CREATE TABLE IF NOT EXISTS wix_installs (
          instance_id TEXT PRIMARY KEY,
          store_id TEXT NOT NULL,
          site_name TEXT,
          site_url TEXT,
          catalog_version TEXT,
          product_count INTEGER NOT NULL DEFAULT 0,
          script_embedded BOOLEAN NOT NULL DEFAULT FALSE,
          last_sync_at TIMESTAMPTZ,
          last_error TEXT,
          active BOOLEAN NOT NULL DEFAULT TRUE,
          installed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
      `).catch((error) => { tableReady = null; throw error; });
    }
    return tableReady;
  }

  async function findInstall(instanceId) {
    await ensureTable();
    const result = await database.query("SELECT * FROM wix_installs WHERE instance_id = $1", [instanceId]);
    return result.rows[0] || null;
  }

  async function setError(instanceId, message) {
    try {
      await database.query(
        "UPDATE wix_installs SET last_error = $2, updated_at = NOW() WHERE instance_id = $1",
        [instanceId, message ? String(message).slice(0, 500) : null],
      );
    } catch (_) { /* ignore */ }
  }

  async function embedWidget(instanceId, storeId, apiKey) {
    await wixRequest(instanceId, "POST", "/apps/v1/scripts", {
      properties: { parameters: { storeId, apiKey } },
    });
    await database.query(
      "UPDATE wix_installs SET script_embedded = TRUE, updated_at = NOW() WHERE instance_id = $1",
      [instanceId],
    );
  }

  async function syncProducts(instanceId) {
    const install = await findInstall(instanceId);
    if (!install) throw new Error("Unknown Wix installation");
    const { version, products } = await fetchCatalog(instanceId, install.site_url, null);
    await database.query(
      `INSERT INTO generic_catalog (store_id, products, rules, updated_at)
       VALUES ($1, $2::jsonb, '{}'::jsonb, NOW())
       ON CONFLICT (store_id) DO UPDATE SET products = EXCLUDED.products, updated_at = NOW()`,
      [install.store_id, JSON.stringify(products)],
    );
    await database.query(
      `UPDATE wix_installs SET catalog_version = $2, product_count = $3, last_sync_at = NOW(),
         last_error = NULL, updated_at = NOW() WHERE instance_id = $1`,
      [instanceId, version, products.length],
    );
    return { version, count: products.length };
  }

  const setupRunning = new Map();
  function setupInstance(instanceId) {
    if (setupRunning.has(instanceId)) return setupRunning.get(instanceId);
    const job = (async () => {
      await ensureTable();
      let site = {};
      try {
        const info = await wixRequest(instanceId, "GET", "/apps/v1/instance");
        site = info.site || {};
      } catch (error) {
        logError("wix: get instance", error);
      }
      const siteName = String(site.siteDisplayName || site.url || "Wix store").slice(0, 200);
      const siteUrl = site.url ? String(site.url).slice(0, 500) : null;
      const email = (site.ownerInfo && site.ownerInfo.email) || `wix+${instanceId}@users.chatnelo.com`;

      let install = await findInstall(instanceId);
      let store;
      if (install) {
        const result = await database.query("SELECT id, api_key FROM generic_stores WHERE id = $1", [install.store_id]);
        store = result.rows[0];
      }
      if (!store) {
        const id = generateStoreId();
        const apiKey = generateSecretKey();
        const adminKey = generateSecretKey();
        await database.query(
          `INSERT INTO generic_stores (id, name, email, api_key, admin_key, access_mode)
           VALUES ($1, $2, $3, $4, $5, 'wix')`,
          [id, siteName, email, apiKey, adminKey],
        );
        await database.query(
          "INSERT INTO generic_catalog (store_id) VALUES ($1) ON CONFLICT (store_id) DO NOTHING",
          [id],
        );
        store = { id, api_key: apiKey };
      } else {
        await database.query("UPDATE generic_stores SET active = TRUE WHERE id = $1", [store.id]);
      }
      await database.query(
        `INSERT INTO wix_installs (instance_id, store_id, site_name, site_url, active)
         VALUES ($1, $2, $3, $4, TRUE)
         ON CONFLICT (instance_id) DO UPDATE SET store_id = EXCLUDED.store_id, site_name = EXCLUDED.site_name,
           site_url = COALESCE(EXCLUDED.site_url, wix_installs.site_url), active = TRUE, updated_at = NOW()`,
        [instanceId, store.id, siteName, siteUrl],
      );

      const problems = [];
      try { await embedWidget(instanceId, store.id, store.api_key); } catch (error) {
        problems.push("widget: " + error.message);
        logError("wix: embed script", error);
      }
      try { await syncProducts(instanceId); } catch (error) {
        problems.push("products: " + error.message);
        logError("wix: sync products", error);
      }
      if (problems.length) await setError(instanceId, problems.join(" | "));
      return findInstall(instanceId);
    })().finally(() => setupRunning.delete(instanceId));
    setupRunning.set(instanceId, job);
    return job;
  }

  async function deactivate(instanceId) {
    const install = await findInstall(instanceId);
    if (!install) return;
    await database.query("UPDATE wix_installs SET active = FALSE, script_embedded = FALSE, updated_at = NOW() WHERE instance_id = $1", [instanceId]);
    await database.query("UPDATE generic_stores SET active = FALSE WHERE id = $1", [install.store_id]);
    tokenCache.delete(instanceId);
  }

  // -------------------------------------------------------------- webhooks
  app.post("/wix/webhooks", (req, res, next) => {
    // The body is a JWT. Read it raw unless express.json already consumed it.
    if (typeof req.body === "string" && req.body) return next();
    if (req.rawBody && req.rawBody.length) { req.body = req.rawBody.toString("utf8"); return next(); }
    let raw = "";
    req.setEncoding("utf8");
    req.on("data", (chunk) => { raw += chunk; if (raw.length > 200000) req.destroy(); });
    req.on("end", () => { req.body = raw; next(); });
    req.on("error", next);
  }, (req, res) => {
    let event;
    try {
      event = verifyWebhookJwt(req.body);
    } catch (error) {
      logError("wix: webhook verify", error);
      return res.status(400).send("invalid");
    }
    // Wix needs a 200 within 1250 ms; do the work afterwards.
    res.status(200).send("ok");
    const type = String(event.eventType || "");
    const instanceId = event.instanceId;
    if (!instanceId || !database) return;
    if (/AppInstalled|app_instance_installed|AppInstanceInstalled/i.test(type)) {
      setupInstance(instanceId).catch((error) => logError("wix: setup", error));
    } else if (/AppRemoved|app_instance_removed|AppInstanceRemoved/i.test(type)) {
      deactivate(instanceId).catch((error) => logError("wix: remove", error));
    } else if (/product/i.test(type)) {
      // Product created / updated / deleted -> refresh the catalogue (debounced).
      scheduleSync(instanceId);
    }
  });

  const pendingSync = new Map();
  function scheduleSync(instanceId) {
    if (pendingSync.has(instanceId)) return;
    pendingSync.set(instanceId, setTimeout(() => {
      pendingSync.delete(instanceId);
      syncProducts(instanceId).catch((error) => {
        logError("wix: product webhook sync", error);
        setError(instanceId, "products: " + error.message);
      });
    }, 60000));
  }

  // -------------------------------------------------------------- dashboard API
  function instanceFrom(req) {
    const value = (req.body && req.body.instance) || req.query.instance || "";
    return parseSignedInstance(value);
  }

  async function statusPayload(instanceId) {
    const install = await findInstall(instanceId);
    if (!install) return { installed: false };
    const catalog = await database.query("SELECT rules FROM generic_catalog WHERE store_id = $1", [install.store_id]);
    const usage = await database.query(
      "SELECT COUNT(*)::int AS chats FROM generic_usage_events WHERE store_id = $1 AND created_at > NOW() - INTERVAL '30 days'",
      [install.store_id],
    ).catch(() => ({ rows: [{ chats: null }] }));
    return {
      installed: true,
      active: install.active,
      siteName: install.site_name,
      siteUrl: install.site_url,
      products: install.product_count,
      catalogVersion: install.catalog_version,
      widget: install.script_embedded,
      lastSync: install.last_sync_at,
      error: install.last_error,
      rules: (catalog.rows[0] && catalog.rows[0].rules) || {},
      chats30d: usage.rows[0] ? usage.rows[0].chats : null,
    };
  }

  app.post("/wix/api/status", async (req, res) => {
    try {
      const decoded = instanceFrom(req);
      let status = await statusPayload(decoded.instanceId);
      if (!status.installed) {
        await setupInstance(decoded.instanceId);
        status = await statusPayload(decoded.instanceId);
      }
      res.json(status);
    } catch (error) {
      logError("wix: status", error);
      res.status(/signature|instance/i.test(error.message) ? 401 : 500).json({ error: error.message });
    }
  });

  app.post("/wix/api/sync", async (req, res) => {
    try {
      const decoded = instanceFrom(req);
      const install = await findInstall(decoded.instanceId);
      if (!install) await setupInstance(decoded.instanceId);
      else {
        if (!install.script_embedded) {
          const store = await database.query("SELECT id, api_key FROM generic_stores WHERE id = $1", [install.store_id]);
          if (store.rows[0]) await embedWidget(decoded.instanceId, store.rows[0].id, store.rows[0].api_key).catch((e) => logError("wix: re-embed", e));
        }
        await syncProducts(decoded.instanceId);
      }
      res.json(await statusPayload(decoded.instanceId));
    } catch (error) {
      logError("wix: sync", error);
      const decoded = (() => { try { return instanceFrom(req); } catch { return null; } })();
      if (decoded) await setError(decoded.instanceId, error.message);
      res.status(500).json({ error: "Sync failed. Please try again in a minute." });
    }
  });

  app.post("/wix/api/rules", async (req, res) => {
    try {
      const decoded = instanceFrom(req);
      const install = await findInstall(decoded.instanceId);
      if (!install) return res.status(404).json({ error: "Not installed" });
      const rules = {};
      const input = (req.body && req.body.rules) || {};
      for (const key of RULE_KEYS) {
        if (typeof input[key] === "string" && input[key].trim()) rules[key] = input[key].trim().slice(0, 1000);
      }
      await database.query(
        `INSERT INTO generic_catalog (store_id, rules, updated_at) VALUES ($1, $2::jsonb, NOW())
         ON CONFLICT (store_id) DO UPDATE SET rules = EXCLUDED.rules, updated_at = NOW()`,
        [install.store_id, JSON.stringify(rules)],
      );
      res.json({ ok: true, rules });
    } catch (error) {
      logError("wix: rules", error);
      res.status(/signature|instance/i.test(error.message) ? 401 : 500).json({ error: "Could not save." });
    }
  });

  // -------------------------------------------------------------- dashboard page
  app.get("/wix/dashboard", (req, res) => {
    let decoded = null;
    try { decoded = parseSignedInstance(req.query.instance); } catch (error) { decoded = null; }
    res.setHeader("Content-Security-Policy", "frame-ancestors https://*.wix.com https://*.wixsite.com https://*.editorx.com");
    res.setHeader("Cache-Control", "no-store");
    if (!decoded) {
      return res.status(401).type("html").send("<!doctype html><meta charset=utf-8><body style=\"font-family:system-ui;padding:40px\">Please open Chatnelo from your Wix dashboard.</body>");
    }
    res.type("html").send(dashboardHtml(String(req.query.instance)));
  });

  return { setupInstance, syncProducts, verifyWebhookJwt, parseSignedInstance };
}

function dashboardHtml(instance) {
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Chatnelo – AI chat for your store</title>
<meta name="color-scheme" content="light">
<style>
*{box-sizing:border-box}body{margin:0;font:15px/1.5 -apple-system,BlinkMacSystemFont,"Segoe UI",Inter,system-ui,sans-serif;color:#1f2430;background:#f5f6fa}
.wrap{max-width:880px;margin:0 auto;padding:28px 22px 60px}
.hero{display:flex;align-items:center;gap:16px;margin-bottom:22px}
.hero img{width:56px;height:56px;border-radius:16px;background:#0b0d1d}
h1{font-size:22px;margin:0;font-weight:800}
.sub{color:#5b6170;margin:2px 0 0}
.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:12px;margin-bottom:18px}
.card{background:#fff;border:1px solid #e6e8ef;border-radius:16px;padding:16px 18px}
.k{font-size:12px;color:#7a8091;text-transform:uppercase;letter-spacing:.04em}
.v{font-size:22px;font-weight:800;margin-top:4px;font-variant-numeric:tabular-nums}
.ok{color:#15803d}.bad{color:#b91c1c}.muted{color:#7a8091}
h2{font-size:16px;margin:0 0 10px}
label{display:block;font-weight:600;font-size:13px;margin:12px 0 6px}
textarea{width:100%;min-height:70px;border:1px solid #d9dce5;border-radius:12px;padding:10px 12px;font:inherit;resize:vertical}
textarea:focus-visible,button:focus-visible{outline:3px solid rgba(124,58,237,.35);outline-offset:2px}
button{border:0;border-radius:999px;padding:10px 20px;font:inherit;font-weight:700;cursor:pointer;background:#7c3aed;color:#fff}
button.secondary{background:#eef0f6;color:#1f2430}
button:disabled{opacity:.6;cursor:wait}
.row{display:flex;gap:10px;flex-wrap:wrap;align-items:center;margin-top:14px}
.note{font-size:13px;color:#5b6170}
.err{background:#fdeceb;border:1px solid #f5c6c0;color:#8a2a20;border-radius:12px;padding:10px 14px;margin-bottom:14px;display:none}
.steps{margin:0;padding-left:18px;color:#3b4150}
</style></head>
<body><main class="wrap">
<div class="hero"><img src="/mascot.png" alt="" width="56" height="56"><div><h1>Chatnelo – AI chat for your store</h1>
<p class="sub">Answers your shoppers 24/7 from your real products, prices and stock.</p></div></div>
<div class="err" id="err" role="alert"></div>
<div class="grid">
 <div class="card"><div class="k">Chat on your site</div><div class="v" id="widget">…</div></div>
 <div class="card"><div class="k">Products loaded</div><div class="v" id="products">…</div></div>
 <div class="card"><div class="k">Chats (30 days)</div><div class="v" id="chats">…</div></div>
 <div class="card"><div class="k">Last product sync</div><div class="v" id="sync" style="font-size:15px">…</div></div>
</div>
<div class="card" style="margin-bottom:14px">
 <h2>Products</h2>
 <p class="note">Products sync automatically. Added new products or changed prices? Sync now.</p>
 <div class="row"><button id="syncBtn" type="button">Sync products now</button><span class="note" id="syncMsg" aria-live="polite"></span></div>
</div>
<div class="card" style="margin-bottom:14px">
 <h2>Store information for the chat</h2>
 <p class="note">The chat only answers from what you write here and from your products. Leave empty what you don't want it to answer.</p>
 <label for="doprava">Shipping (prices, delivery times, countries)</label><textarea id="doprava" name="doprava" maxlength="1000" placeholder="e.g. Free shipping over $50. Delivery in 2–4 business days."></textarea>
 <label for="vraceni">Returns</label><textarea id="vraceni" name="vraceni" maxlength="1000" placeholder="e.g. 30 days to return unused items. We send a return label."></textarea>
 <label for="platba">Payment</label><textarea id="platba" name="platba" maxlength="1000" placeholder="e.g. Card, PayPal, Apple Pay."></textarea>
 <div class="row"><button id="saveBtn" type="button">Save</button><span class="note" id="saveMsg" aria-live="polite"></span></div>
</div>
<div class="card">
 <h2>How it works</h2>
 <ol class="steps"><li>The chat bubble appears on your published site automatically.</li><li>It answers questions about products, availability, shipping and returns.</li><li>It never invents prices or stock – it only uses your store data.</li></ol>
 <p class="note">Questions? <a href="mailto:support@chatnelo.com">support@chatnelo.com</a></p>
</div>
</main>
<script>
(function(){
  var INSTANCE=${JSON.stringify(instance)};
  function $(id){return document.getElementById(id);}
  function post(path,body){body=body||{};body.instance=INSTANCE;return fetch(path,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(body)}).then(function(r){return r.json().then(function(j){if(!r.ok)throw new Error(j.error||"Error");return j;});});}
  function showError(m){var e=$("err");e.textContent=m;e.style.display=m?"block":"none";}
  function render(s){
    if(!s.installed){$("widget").textContent="Setting up…";return;}
    $("widget").innerHTML=s.widget?'<span class="ok">Active</span>':'<span class="bad">Not active</span>';
    $("products").textContent=s.products;
    $("chats").textContent=s.chats30d==null?"–":s.chats30d;
    $("sync").textContent=s.lastSync?new Date(s.lastSync).toLocaleString():"Not yet";
    var r=s.rules||{};["doprava","vraceni","platba"].forEach(function(k){if(document.activeElement!==$(k))$(k).value=r[k]||"";});
    if(s.error)showError("Something needs attention: "+s.error+" — try “Sync products now”, or write to support@chatnelo.com.");else showError("");
  }
  post("/wix/api/status").then(render).catch(function(e){showError(e.message);});
  $("syncBtn").addEventListener("click",function(){var b=this;b.disabled=true;$("syncMsg").textContent="Syncing…";post("/wix/api/sync").then(function(s){render(s);$("syncMsg").textContent="Done.";}).catch(function(e){$("syncMsg").textContent=e.message;}).then(function(){b.disabled=false;});});
  $("saveBtn").addEventListener("click",function(){var b=this;b.disabled=true;$("saveMsg").textContent="Saving…";post("/wix/api/rules",{rules:{doprava:$("doprava").value,vraceni:$("vraceni").value,platba:$("platba").value}}).then(function(){$("saveMsg").textContent="Saved.";}).catch(function(e){$("saveMsg").textContent=e.message;}).then(function(){b.disabled=false;});});
})();
</script>
</body></html>`;
}

module.exports = { register, verifyWebhookJwt, parseSignedInstance, mapV1, mapV3, dashboardHtml };
