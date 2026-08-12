require("dotenv").config();
const crypto = require("crypto");
const express = require("express");
const fs = require("fs");
const path = require("path");

const app = express();
const publicDir = path.join(__dirname, "public");
const indexTemplate = fs.readFileSync(path.join(publicDir, "index.html"), "utf8");

const PORT = process.env.PORT || 3000;
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const OPENAI_MODEL = process.env.OPENAI_MODEL || "gpt-4.1-mini";
const SHOPIFY_CLIENT_ID = process.env.SHOPIFY_CLIENT_ID;
const SHOPIFY_CLIENT_SECRET = process.env.SHOPIFY_CLIENT_SECRET;
const SHOPIFY_API_VERSION = process.env.SHOPIFY_API_VERSION || "2026-07";

const accessTokenCache = new Map();
const catalogCache = new Map();

app.use(express.json({ limit: "32kb" }));
app.use((req, res, next) => {
  res.setHeader(
    "Content-Security-Policy",
    "frame-ancestors https://admin.shopify.com https://*.myshopify.com;"
  );
  next();
});

app.get("/", (req, res) => {
  const apiKey = escapeHtmlAttribute(SHOPIFY_CLIENT_ID || "missing-client-id");
  const shopifyBridge = `
    <meta name="shopify-api-key" content="${apiKey}" />
    <script src="https://cdn.shopify.com/shopifycloud/app-bridge.js"></script>
    <script>
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
      });
    </script>`;

  res.type("html").send(indexTemplate.replace("</head>", `${shopifyBridge}\n</head>`));
});

app.use(express.static(publicDir, { index: false }));

function escapeHtmlAttribute(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll('"', "&quot;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

function decodeBase64UrlJson(value) {
  return JSON.parse(Buffer.from(value, "base64url").toString("utf8"));
}

function verifySessionToken(token) {
  if (!SHOPIFY_CLIENT_ID || !SHOPIFY_CLIENT_SECRET) {
    throw new Error("Shopify credentials are not configured");
  }

  const parts = String(token || "").split(".");
  if (parts.length !== 3) throw new Error("Invalid session token");

  const header = decodeBase64UrlJson(parts[0]);
  const payload = decodeBase64UrlJson(parts[1]);
  if (header.alg !== "HS256") throw new Error("Invalid token algorithm");

  const expected = crypto
    .createHmac("sha256", SHOPIFY_CLIENT_SECRET)
    .update(`${parts[0]}.${parts[1]}`)
    .digest();
  const received = Buffer.from(parts[2], "base64url");
  if (expected.length !== received.length || !crypto.timingSafeEqual(expected, received)) {
    throw new Error("Invalid token signature");
  }

  const now = Math.floor(Date.now() / 1000);
  if (!payload.exp || payload.exp < now - 5) throw new Error("Expired session token");
  if (payload.nbf && payload.nbf > now + 5) throw new Error("Session token is not active");
  if (payload.aud !== SHOPIFY_CLIENT_ID) throw new Error("Invalid token audience");

  const shop = new URL(payload.dest).hostname.toLowerCase();
  if (!/^[a-z0-9][a-z0-9-]*\.myshopify\.com$/.test(shop)) {
    throw new Error("Invalid shop domain");
  }

  return { payload, shop };
}

async function getShopifyAccessToken(shop, sessionToken) {
  const cached = accessTokenCache.get(shop);
  if (cached && cached.expiresAt > Date.now() + 60_000) return cached.accessToken;

  const body = new URLSearchParams({
    client_id: SHOPIFY_CLIENT_ID,
    client_secret: SHOPIFY_CLIENT_SECRET,
    grant_type: "urn:ietf:params:oauth:grant-type:token-exchange",
    subject_token: sessionToken,
    subject_token_type: "urn:ietf:params:oauth:token-type:id_token",
    requested_token_type: "urn:shopify:params:oauth:token-type:online-access-token"
  });

  const response = await fetch(`https://${shop}/admin/oauth/access_token`, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/x-www-form-urlencoded"
    },
    body
  });

  if (!response.ok) {
    console.error("Shopify token exchange failed:", response.status, await response.text());
    throw new Error("Shopify authentication failed");
  }

  const data = await response.json();
  const expiresIn = Number(data.expires_in || 3600);
  accessTokenCache.set(shop, {
    accessToken: data.access_token,
    expiresAt: Date.now() + expiresIn * 1000
  });
  return data.access_token;
}

async function loadShopCatalog(shop, accessToken) {
  const cached = catalogCache.get(shop);
  if (cached && cached.expiresAt > Date.now()) return cached.data;

  const query = `
    query ChatbotCatalog {
      shop { name currencyCode }
      products(first: 50, query: "status:active") {
        nodes {
          id
          title
          description
          handle
          variants(first: 100) {
            nodes {
              id
              title
              sku
              price
              inventoryQuantity
              availableForSale
            }
          }
        }
      }
    }
  `;

  const response = await fetch(`https://${shop}/admin/api/${SHOPIFY_API_VERSION}/graphql.json`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Shopify-Access-Token": accessToken
    },
    body: JSON.stringify({ query })
  });

  if (!response.ok) {
    console.error("Shopify GraphQL failed:", response.status, await response.text());
    throw new Error("Shopify product request failed");
  }

  const result = await response.json();
  if (result.errors?.length) {
    console.error("Shopify GraphQL errors:", JSON.stringify(result.errors));
    throw new Error("Shopify product request failed");
  }

  catalogCache.set(shop, { data: result.data, expiresAt: Date.now() + 30_000 });
  return result.data;
}

function buildSystemPrompt(catalog) {
  const currency = catalog.shop.currencyCode;
  const productLines = catalog.products.nodes.flatMap((product) => {
    const description = product.description?.trim() || "Popis neuveden.";
    return product.variants.nodes.map((variant) => {
      const variantName = variant.title === "Default Title" ? "" : `, varianta: ${variant.title}`;
      const stock = variant.availableForSale
        ? `${Math.max(0, Number(variant.inventoryQuantity || 0))} ks skladem`
        : "vyprodano";
      return `- ${product.title}${variantName}; SKU: ${variant.sku || "neuvedeno"}; cena: ${variant.price} ${currency}; ${stock}; ${description}`;
    });
  });

  return `Jsi zĂˇkaznickĂ˝ a prodejnĂ­ asistent obchodu ${catalog.shop.name}. OdpovĂ­dej struÄŤnÄ›, vÄ›cnÄ› a ÄŤesky.
PouĹľĂ­vej vĂ˝hradnÄ› nĂ­Ĺľe uvedenĂˇ aktuĂˇlnĂ­ data ze Shopify. Nic si nevymĂ˝Ĺˇlej.

PRODUKTY A SKLAD:
${productLines.length ? productLines.join("\n") : "Obchod zatĂ­m nemĂˇ ĹľĂˇdnĂ© aktivnĂ­ produkty."}

Pravidla:
- KdyĹľ informace nenĂ­ v datech, Ĺ™ekni jasnÄ›, Ĺľe ji zatĂ­m nemĂˇĹˇ k dispozici.
- NevymĂ˝Ĺˇlej slevy, dopravu, vrĂˇcenĂ­, dostupnost ani termĂ­ny.
- KdyĹľ je produkt vyprodanĂ˝, Ĺ™ekni to otevĹ™enÄ›.
- NeuvĂˇdÄ›j internĂ­ ID ani technickĂ© informace.`;
}

app.post("/api/chat", async (req, res) => {
  try {
    const authHeader = req.get("authorization") || "";
    const sessionToken = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
    const { shop } = verifySessionToken(sessionToken);

    const { message, history } = req.body || {};
    if (!message || typeof message !== "string" || message.trim().length > 1000) {
      return res.status(400).json({ error: "ZprĂˇva chybĂ­ nebo je pĹ™Ă­liĹˇ dlouhĂˇ." });
    }
    if (!OPENAI_API_KEY) {
      return res.status(503).json({ error: "OpenAI API nenĂ­ nastavenĂ©." });
    }

    const accessToken = await getShopifyAccessToken(shop, sessionToken);
    const catalog = await loadShopCatalog(shop, accessToken);
    const safeHistory = (Array.isArray(history) ? history : [])
      .filter(
        (item) =>
          item &&
          ["user", "assistant"].includes(item.role) &&
          typeof item.content === "string" &&
          item.content.length <= 2000
      )
      .slice(-10);

    if (
      !safeHistory.length ||
      safeHistory[safeHistory.length - 1].role !== "user" ||
      safeHistory[safeHistory.length - 1].content !== message
    ) {
      safeHistory.push({ role: "user", content: message });
    }

    const aiResponse = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${OPENAI_API_KEY}`
      },
      body: JSON.stringify({
        model: OPENAI_MODEL,
        messages: [{ role: "system", content: buildSystemPrompt(catalog) }, ...safeHistory],
        temperature: 0.2,
        max_tokens: 400
      })
    });

    if (!aiResponse.ok) {
      console.error("OpenAI error:", aiResponse.status, await aiResponse.text());
      return res.status(502).json({ error: "AI sluĹľba momentĂˇlnÄ› neodpovĂ­dĂˇ." });
    }

    const data = await aiResponse.json();
    const reply = data.choices?.[0]?.message?.content?.trim();
    return res.json({ reply: reply || "OmlouvĂˇm se, odpovÄ›ÄŹ se nepodaĹ™ilo vytvoĹ™it." });
  } catch (error) {
    console.error("Chat request failed:", error.message);
    const unauthorized = /token|credentials|audience|shop domain|authentication/i.test(error.message);
    return res.status(unauthorized ? 401 : 500).json({
      error: unauthorized
        ? "Shopify pĹ™ihlĂˇĹˇenĂ­ chybĂ­ nebo vyprĹˇelo. Obnovte strĂˇnku aplikace."
        : "Chatbot se teÄŹ nemĹŻĹľe spojit s daty obchodu."
    });
  }
});

app.get("/health", (req, res) =>
  res.json({
    ok: true,
    shopifyConfigured: Boolean(SHOPIFY_CLIENT_ID && SHOPIFY_CLIENT_SECRET),
    openaiConfigured: Boolean(OPENAI_API_KEY)
  })
);

app.listen(PORT, () => {
  console.log(`Chatbot bÄ›ĹľĂ­ na portu ${PORT}`);
});
