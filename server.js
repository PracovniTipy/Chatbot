const express = require("express");
const path = require("path");
const crypto = require("crypto");

const app = express();
app.use(express.json({ limit: "32kb" }));
app.use(express.static(path.join(__dirname, "public")));

const SHOPIFY_CLIENT_ID = process.env.SHOPIFY_CLIENT_ID;
const SHOPIFY_CLIENT_SECRET = process.env.SHOPIFY_CLIENT_SECRET;
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const OPENAI_MODEL = process.env.OPENAI_MODEL || "gpt-4o-mini";

const shopTokens = new Map();

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

  shopTokens.set(shop, data.access_token);
  return data.access_token;
}

async function getAdminAccess(req) {
  const sessionToken = getBearerToken(req);
  const { shop } = verifySessionToken(sessionToken);
  const cached = shopTokens.get(shop);
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
      name
      currencyCode
    }
  }`;

  const data = await shopifyGraphql(shop, accessToken, query);
  return {
    shop: data.shop,
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

  const history = Array.isArray(body?.history)
    ? body.history.slice(-10)
      .filter((item) => item && ["user", "assistant"].includes(item.role))
      .map((item) => ({
        role: item.role,
        content: String(item.content || "").slice(0, 2000),
      }))
    : [];

  return { message, history };
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
${JSON.stringify(catalog)}`;

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
  const { message, history } = validateChatBody(body);
  const catalog = await loadCatalog(shop, accessToken);
  return generateAnswer(catalog, message, history);
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
    main{max-width:900px;margin:48px auto;padding:32px;background:#fff;border-radius:16px}
    h1{margin-top:0;color:#173b70}
  </style>
</head>
<body>
  <main>
    <h1>Eshop Assistant AI</h1>
    <p>Aplikace je připojená. Chat vpravo používá produkty a sklad tohoto obchodu.</p>
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
      window.fetch("/api/bootstrap", { method: "POST" }).catch(function () {});
    });
  </script>
  <script src="/widget.js" defer></script>
</body>
</html>`);
});

app.post("/api/bootstrap", async (req, res) => {
  try {
    const { shop } = await getAdminAccess(req);
    res.json({ ok: true, shop });
  } catch (error) {
    console.error("Bootstrap:", error);
    res.status(401).json({ error: error.message });
  }
});

app.post("/api/chat", async (req, res) => {
  try {
    const { shop, accessToken } = await getAdminAccess(req);
    const reply = await answerChat(shop, accessToken, req.body);
    res.json({ reply });
  } catch (error) {
    console.error("Admin chat:", error);
    const status = /token|podpis|doména|Session/i.test(error.message) ? 401 : 500;
    res.status(status).json({ error: error.message });
  }
});

app.post("/proxy/chat", async (req, res) => {
  try {
    const shop = verifyAppProxy(req);
    const accessToken = shopTokens.get(shop);
    if (!accessToken) {
      return res.status(503).json({
        error: "Asistent se právě připojuje. Správce obchodu musí jednou otevřít aplikaci Eshop Assistant AI v administraci.",
      });
    }
    const reply = await answerChat(shop, accessToken, req.body);
    res.json({ reply });
  } catch (error) {
    console.error("Storefront chat:", error);
    const status = /podpis|App Proxy|doména|vypršel/i.test(error.message) ? 401 : 500;
    res.status(status).json({ error: error.message });
  }
});

app.get("/health", (req, res) => {
  res.json({
    ok: true,
    shopifyConfigured: Boolean(SHOPIFY_CLIENT_ID && SHOPIFY_CLIENT_SECRET),
    openaiConfigured: Boolean(OPENAI_API_KEY),
  });
});

const port = Number(process.env.PORT) || 3000;
app.listen(port, "0.0.0.0", () => {
  console.log(`Eshop Assistant AI běží na portu ${port}`);
});
