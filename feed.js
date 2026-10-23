// Product feed import for stores outside Shopify (Shoptet, WooCommerce, …).
// Supports the common Heureka / Zboží.cz (<SHOPITEM>) and Google Merchant
// (<item>/<entry> with g: tags) XML formats without extra dependencies.

const MAX_FEED_BYTES = 25 * 1024 * 1024;
const MAX_FEED_PRODUCTS = 5000;

function decodeEntities(text) {
  return String(text || "")
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&quot;/g, '"').replace(/&apos;/g, "'")
    .replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&");
}

function stripHtml(text) {
  return decodeEntities(text)
    .replace(/<br\s*\/?>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function tag(block, names) {
  for (const name of names) {
    const escaped = name.replace(/[:]/g, "\\:");
    const match = block.match(new RegExp(`<${escaped}(?:\\s[^>]*)?>([\\s\\S]*?)</${escaped}>`, "i"));
    if (match) return decodeEntities(match[1]).trim();
  }
  return "";
}

function parsePrice(raw) {
  const text = String(raw || "").replace(/\s/g, "");
  const currency = (text.match(/[A-Z]{3}/) || [""])[0];
  const number = Number(text.replace(/[A-Z]{3}/g, "").replace(",", ".").replace(/[^0-9.]/g, ""));
  return { price: Number.isFinite(number) ? number : null, currency };
}

function heurekaInStock(block) {
  const delivery = tag(block, ["DELIVERY_DATE"]);
  if (delivery === "") return null;
  return delivery === "0" || /^0\b/.test(delivery);
}

function parseHeureka(xml) {
  const items = xml.match(/<SHOPITEM[\s>][\s\S]*?<\/SHOPITEM>/gi) || [];
  return items.map((block) => {
    const { price, currency } = parsePrice(tag(block, ["PRICE_VAT", "PRICE"]));
    const inStock = heurekaInStock(block);
    return {
      id: tag(block, ["ITEM_ID", "ITEMGROUP_ID"]) || tag(block, ["URL"]),
      nazev: tag(block, ["PRODUCTNAME", "PRODUCT"]),
      cena: price,
      mena: currency || tag(block, ["CURRENCY"]) || "CZK",
      dostupnost: inStock === null ? undefined : (inStock ? "skladem" : "není skladem"),
      popis: stripHtml(tag(block, ["DESCRIPTION"])).slice(0, 600),
      kategorie: tag(block, ["CATEGORYTEXT"]).slice(0, 200) || undefined,
      vyrobce: tag(block, ["MANUFACTURER"]) || undefined,
      url: tag(block, ["URL"]) || undefined,
      obrazek: tag(block, ["IMGURL"]) || undefined,
    };
  });
}

function parseGoogle(xml) {
  const items = xml.match(/<(item|entry)[\s>][\s\S]*?<\/\1>/gi) || [];
  return items.map((block) => {
    const { price, currency } = parsePrice(tag(block, ["g:sale_price", "g:price", "price"]));
    const availability = tag(block, ["g:availability", "availability"]).toLowerCase();
    return {
      id: tag(block, ["g:id", "id"]) || tag(block, ["g:link", "link"]),
      nazev: tag(block, ["g:title", "title"]),
      cena: price,
      mena: currency || "CZK",
      dostupnost: availability ? (/in.?stock|skladem/.test(availability) ? "skladem" : "není skladem") : undefined,
      popis: stripHtml(tag(block, ["g:description", "description"])).slice(0, 600),
      kategorie: tag(block, ["g:product_type", "g:google_product_category"]).slice(0, 200) || undefined,
      vyrobce: tag(block, ["g:brand"]) || undefined,
      url: tag(block, ["g:link", "link"]) || undefined,
      obrazek: tag(block, ["g:image_link", "image_link"]) || undefined,
    };
  });
}

function parseFeed(xml) {
  const text = String(xml || "");
  const raw = /<SHOPITEM[\s>]/i.test(text) ? parseHeureka(text) : parseGoogle(text);
  const seen = new Set();
  const products = [];
  for (const product of raw) {
    if (!product.nazev || !product.id || seen.has(product.id)) continue;
    seen.add(product.id);
    for (const key of Object.keys(product)) if (product[key] === undefined || product[key] === "") delete product[key];
    products.push(product);
    if (products.length >= MAX_FEED_PRODUCTS) break;
  }
  return products;
}

function validateFeedUrl(raw) {
  const value = String(raw || "").trim();
  if (!value) return "";
  let url;
  try { url = new URL(value); } catch { throw new Error("Zadejte platnou adresu feedu (https://…)."); }
  if (!/^https?:$/.test(url.protocol)) throw new Error("Feed musí být na adrese http(s).");
  if (/^(localhost|127\.|10\.|192\.168\.|169\.254\.|0\.)/.test(url.hostname) || url.hostname.endsWith(".internal")) {
    throw new Error("Tato adresa feedu není povolená.");
  }
  return url.toString();
}

async function fetchFeed(url, fetchImpl = fetch, timeoutMs = 60000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetchImpl(url, { signal: controller.signal, headers: { "User-Agent": "ChatneloFeedBot/1.0" } });
    if (!response.ok) throw new Error(`Feed vrátil chybu HTTP ${response.status}.`);
    const reader = response.body && response.body.getReader ? response.body.getReader() : null;
    if (!reader) return await response.text();
    const chunks = []; let size = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.length;
      if (size > MAX_FEED_BYTES) throw new Error("Feed je příliš velký (max 25 MB).");
      chunks.push(value);
    }
    return Buffer.concat(chunks.map((c) => Buffer.from(c))).toString("utf8");
  } catch (error) {
    if (error.name === "AbortError") throw new Error("Feed se nepodařilo stáhnout včas.");
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

// Chooses the products most relevant to the customer's message so large
// catalogues still fit into the prompt.
function normalize(text) {
  return String(text || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
}

function selectRelevantProducts(products, query, limit = 60) {
  if (!Array.isArray(products) || products.length <= limit) return products || [];
  const words = normalize(query).match(/[a-z0-9]{3,}/g) || [];
  const scored = products.map((product, index) => {
    const name = normalize(product.nazev);
    const rest = normalize(`${product.kategorie || ""} ${product.vyrobce || ""} ${product.popis || ""}`);
    let score = 0;
    for (const word of words) {
      const stem = word.slice(0, Math.max(3, word.length - 2));
      if (name.includes(stem)) score += 3;
      else if (rest.includes(stem)) score += 1;
    }
    return { product, score, index };
  });
  scored.sort((a, b) => b.score - a.score || a.index - b.index);
  return scored.slice(0, limit).map((entry) => entry.product);
}

module.exports = { parseFeed, fetchFeed, validateFeedUrl, selectRelevantProducts, MAX_FEED_PRODUCTS };
