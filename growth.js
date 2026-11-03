// Growth features for chatnelo.com:
// - "Try it on your store": reads a store's products and lets the visitor chat
//   with a demo of Chatnelo trained on them (no sign-up).
// - Revenue calculator.
// - Czech landing pages for search engines.
const dns = require("dns").promises;
const net = require("net");
const crypto = require("crypto");

const UA = "Mozilla/5.0 (compatible; ChatneloDemo/1.0; +https://chatnelo.com)";
const MAX_PRODUCTS = 250;
const SESSION_TTL_MS = 2 * 60 * 60 * 1000;
const MAX_SESSIONS = 400;
const MAX_MESSAGES = 30;

function isPrivateIp(ip) {
  if (net.isIPv4(ip)) {
    const [a, b] = ip.split(".").map(Number);
    return a === 10 || a === 127 || a === 0 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127) || a >= 224;
  }
  const v = ip.toLowerCase();
  return v === "::1" || v === "::" || v.startsWith("fc") || v.startsWith("fd") || v.startsWith("fe80") ||
    v.startsWith("::ffff:") && isPrivateIp(v.slice(7));
}

async function assertPublicUrl(raw) {
  let url;
  try { url = new URL(raw); } catch (_) { throw new Error("bad_url"); }
  if (!/^https?:$/.test(url.protocol) || url.username || url.password) throw new Error("bad_url");
  if (url.port && !["80", "443"].includes(url.port)) throw new Error("bad_url");
  const host = url.hostname.replace(/^\[|\]$/g, "");
  if (net.isIP(host)) { if (isPrivateIp(host)) throw new Error("bad_url"); return url; }
  if (!host.includes(".") || /\.(local|internal|localhost)$/i.test(host)) throw new Error("bad_url");
  const records = await dns.lookup(host, { all: true }).catch(() => []);
  if (!records.length) throw new Error("not_found");
  if (records.some((record) => isPrivateIp(record.address))) throw new Error("bad_url");
  return url;
}

// Fetch with SSRF checks on every redirect, a timeout and a size cap.
async function safeFetch(raw, { timeoutMs = 9000, maxBytes = 3 * 1024 * 1024, accept = "*/*" } = {}) {
  let current = raw;
  for (let hop = 0; hop < 4; hop += 1) {
    const url = await assertPublicUrl(current);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetch(url.toString(), {
        redirect: "manual", signal: controller.signal,
        headers: { "User-Agent": UA, Accept: accept, "Accept-Language": "cs,en;q=0.8" },
      });
      if ([301, 302, 303, 307, 308].includes(response.status)) {
        const location = response.headers.get("location");
        if (!location) return { ok: false, status: response.status, text: "", url: url.toString(), type: "" };
        current = new URL(location, url).toString();
        continue;
      }
      const reader = response.body && response.body.getReader ? response.body.getReader() : null;
      let text = "";
      if (reader) {
        const chunks = []; let size = 0;
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          size += value.length;
          if (size > maxBytes) { controller.abort(); break; }
          chunks.push(Buffer.from(value));
        }
        text = Buffer.concat(chunks).toString("utf8");
      } else {
        text = (await response.text()).slice(0, maxBytes);
      }
      return { ok: response.ok, status: response.status, text, url: url.toString(), type: response.headers.get("content-type") || "" };
    } finally {
      clearTimeout(timer);
    }
  }
  return { ok: false, status: 0, text: "", url: current, type: "" };
}

function decodeEntities(text) {
  return String(text || "")
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#039;|&apos;/g, "'")
    .replace(/&lt;/g, "<").replace(/&gt;/g, ">");
}

function stripHtml(html) {
  return decodeEntities(String(html || "").replace(/<style[\s\S]*?<\/style>|<script[\s\S]*?<\/script>/gi, " ").replace(/<[^>]+>/g, " "))
    .replace(/\s+/g, " ").trim();
}

function toNumber(value) {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  let cleaned = String(value || "").replace(/[\s\u00a0]/g, "").replace(/[^0-9.,-]/g, "");
  if (/,\d{1,2}$/.test(cleaned)) cleaned = cleaned.replace(/\./g, "").replace(",", ".");
  else cleaned = cleaned.replace(/,/g, "");
  const number = parseFloat(cleaned);
  return Number.isFinite(number) ? number : null;
}

function product({ id, name, price, currency, inStock, url, image, description, category, brand }) {
  if (!name || !url) return null;
  const item = {
    id: String(id || url).slice(0, 200),
    nazev: String(name).trim().slice(0, 200),
    url,
  };
  if (Number.isFinite(price)) item.cena = price;
  item.mena = (currency || "").toUpperCase().slice(0, 3) || undefined;
  if (inStock !== undefined && inStock !== null) item.dostupnost = inStock ? "skladem" : "není skladem";
  if (image && /^https?:\/\//.test(image)) item.obrazek = image;
  if (description) item.popis = stripHtml(description).slice(0, 400);
  if (category) item.kategorie = String(category).slice(0, 150);
  if (brand) item.vyrobce = String(brand).slice(0, 100);
  for (const key of Object.keys(item)) if (item[key] === undefined || item[key] === "") delete item[key];
  return item;
}

function siteName(html, host) {
  const og = html.match(/<meta[^>]+property=["']og:site_name["'][^>]+content=["']([^"']+)/i) ||
    html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:site_name/i);
  if (og) return decodeEntities(og[1]).trim().slice(0, 80);
  const title = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  if (title) {
    const clean = decodeEntities(title[1]).replace(/\s+/g, " ").trim();
    const parts = clean.split(/\s[|\-–—:]\s/).map((part) => part.trim()).filter(Boolean);
    return (parts.length > 1 ? parts[parts.length - 1] : clean).slice(0, 80) || host;
  }
  return host;
}

// --- Shopify: public /products.json
async function fromShopify(origin) {
  const res = await safeFetch(`${origin}/products.json?limit=250`, { accept: "application/json" }).catch(() => null);
  if (!res || !res.ok || !/json/.test(res.type)) return null;
  let data; try { data = JSON.parse(res.text); } catch (_) { return null; }
  if (!data || !Array.isArray(data.products)) return null;
  let currency = "";
  const cart = await safeFetch(`${origin}/cart.js`, { accept: "application/json" }).catch(() => null);
  if (cart && cart.ok) { try { currency = JSON.parse(cart.text).currency || ""; } catch (_) {} }
  const items = data.products.map((p) => {
    const variants = Array.isArray(p.variants) ? p.variants : [];
    const prices = variants.map((v) => toNumber(v.price)).filter((n) => n !== null);
    return product({
      id: p.id, name: p.title, price: prices.length ? Math.min(...prices) : null, currency,
      inStock: variants.length ? variants.some((v) => v.available) : undefined,
      url: `${origin}/products/${p.handle}`,
      image: p.images && p.images[0] && p.images[0].src,
      description: p.body_html, category: p.product_type, brand: p.vendor,
    });
  }).filter(Boolean);
  return items.length ? { platform: "shopify", products: items } : null;
}

// --- WooCommerce: public Store API
async function fromWoo(origin) {
  const res = await safeFetch(`${origin}/wp-json/wc/store/v1/products?per_page=100`, { accept: "application/json" }).catch(() => null);
  if (!res || !res.ok || !/json/.test(res.type)) return null;
  let data; try { data = JSON.parse(res.text); } catch (_) { return null; }
  if (!Array.isArray(data)) return null;
  const items = data.map((p) => {
    const prices = p.prices || {};
    const minor = Number(prices.currency_minor_unit) || 0;
    const raw = toNumber(prices.price);
    return product({
      id: p.id, name: decodeEntities(p.name), price: raw === null ? null : raw / Math.pow(10, minor),
      currency: prices.currency_code, inStock: p.is_in_stock, url: p.permalink,
      image: p.images && p.images[0] && p.images[0].src,
      description: p.short_description || p.description,
      category: Array.isArray(p.categories) && p.categories.map((c) => c.name).join(", "),
    });
  }).filter(Boolean);
  return items.length ? { platform: "woocommerce", products: items } : null;
}

// --- Any website: JSON-LD / Open Graph product data
function jsonLdProducts(html, pageUrl) {
  const found = [];
  const blocks = html.match(/<script[^>]+type=["']application\/ld\+json["'][^>]*>[\s\S]*?<\/script>/gi) || [];
  function visit(node) {
    if (!node || typeof node !== "object") return;
    if (Array.isArray(node)) { node.forEach(visit); return; }
    const type = [].concat(node["@type"] || []).map(String);
    if (type.some((t) => /^(Product|ProductGroup)$/i.test(t))) {
      let offers = node.offers;
      if (Array.isArray(offers)) offers = offers[0];
      if (offers && offers.offers) offers = [].concat(offers.offers)[0];
      const priceSpec = offers && [].concat(offers.priceSpecification || [])[0];
      const price = toNumber(offers && (offers.price ?? offers.lowPrice ?? (priceSpec && priceSpec.price)));
      const availability = String((offers && offers.availability) || "");
      const image = Array.isArray(node.image) ? node.image[0] : (node.image && node.image.url) || node.image;
      const brand = node.brand && (node.brand.name || node.brand);
      found.push(product({
        id: node.sku || node.productID || node.url || pageUrl,
        name: decodeEntities(node.name),
        price, currency: offers && (offers.priceCurrency || (priceSpec && priceSpec.priceCurrency)),
        inStock: availability ? /InStock|LimitedAvailability|PreOrder|OnlineOnly/i.test(availability) : undefined,
        url: typeof node.url === "string" && /^https?:/.test(node.url) ? node.url : pageUrl,
        image: typeof image === "string" ? image : undefined,
        description: node.description, category: typeof node.category === "string" ? node.category : undefined,
        brand: typeof brand === "string" ? brand : undefined,
      }));
    }
    for (const key of ["@graph", "itemListElement", "item", "mainEntity", "hasVariant"]) if (node[key]) visit(node[key]);
  }
  for (const block of blocks) {
    const body = block.replace(/^<script[^>]*>/i, "").replace(/<\/script>$/i, "").replace(/<!--|-->/g, "").trim();
    try { visit(JSON.parse(body)); } catch (_) { /* invalid JSON-LD */ }
  }
  if (found.length) return found.filter(Boolean);
  // Microdata (schema.org/Product with itemprop) and Open Graph product tags,
  // used e.g. by Shoptet and many Czech platforms.
  const meta = (prop) => {
    const m = html.match(new RegExp(`<meta[^>]+(?:property|name)=["']${prop}["'][^>]+content=["']([^"']*)`, "i")) ||
      html.match(new RegExp(`<meta[^>]+content=["']([^"']*)["'][^>]+(?:property|name)=["']${prop}["']`, "i"));
    return m ? decodeEntities(m[1]) : "";
  };
  const itemprop = (prop) => {
    const m = html.match(new RegExp(`itemprop=["']${prop}["'][^>]*content=["']([^"']*)`, "i")) ||
      html.match(new RegExp(`content=["']([^"']*)["'][^>]*itemprop=["']${prop}["']`, "i")) ||
      html.match(new RegExp(`itemprop=["']${prop}["'][^>]*href=["']([^"']*)`, "i")) ||
      html.match(new RegExp(`itemprop=["']${prop}["'][^>]*>([^<]{1,200})<`, "i"));
    return m ? decodeEntities(m[1]).trim() : "";
  };
  const hasMicrodata = /itemtype=["']https?:\/\/schema\.org\/Product["']/i.test(html);
  const ogPrice = meta("product:price:amount") || meta("og:price:amount");
  const isOgProduct = /<meta[^>]+(property|name)=["']og:type["'][^>]+content=["']product/i.test(html);
  if (hasMicrodata || ogPrice || isOgProduct) {
    let name = "";
    if (hasMicrodata) {
      const block = html.slice(html.search(/itemtype=["']https?:\/\/schema\.org\/Product["']/i));
      const m = block.match(/itemprop=["']name["'][^>]*content=["']([^"']+)/i) || block.match(/itemprop=["']name["'][^>]*>([^<]{2,200})</i);
      name = m ? decodeEntities(m[1]).trim() : "";
    }
    if (!name) { const h1 = html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i); name = h1 ? stripHtml(h1[1]) : meta("og:title"); }
    const availability = itemprop("availability") || meta("product:availability");
    found.push(product({
      name,
      price: toNumber(itemprop("price") || ogPrice),
      currency: itemprop("priceCurrency") || meta("product:price:currency") || meta("og:price:currency"),
      url: pageUrl,
      image: meta("og:image") || itemprop("image"),
      description: itemprop("description") || meta("og:description"),
      inStock: availability ? /InStock|in.?stock|skladem|LimitedAvailability|PreOrder/i.test(availability) : undefined,
    }));
  }
  return found.filter(Boolean);
}

function sameHostLinks(html, base) {
  const links = new Set();
  const re = /<a[^>]+href=["']([^"'#]+)["']/gi;
  let m;
  while ((m = re.exec(html)) && links.size < 400) {
    try {
      const url = new URL(decodeEntities(m[1]), base);
      if (url.hostname !== base.hostname || !/^https?:$/.test(url.protocol)) continue;
      url.hash = "";
      const path = url.pathname.toLowerCase();
      if (path === "/" || /\.(jpg|jpeg|png|gif|webp|svg|pdf|zip|css|js)$/.test(path)) continue;
      if (/(kosik|cart|basket|login|prihlas|registr|account|ucet|kontakt|contact|blog|clanek|novink|obchodni-podminky|terms|privacy|ochrana|gdpr|reklamac|doprava|platba|faq|o-nas|about|search|hledat|wishlist|compare|porovn)/.test(path)) continue;
      links.add(url.toString());
    } catch (_) { /* ignore */ }
  }
  return [...links];
}

async function sitemapUrls(origin) {
  const urls = [];
  const robots = await safeFetch(`${origin}/robots.txt`, { timeoutMs: 6000, maxBytes: 200000 }).catch(() => null);
  const maps = robots && robots.ok ? (robots.text.match(/^sitemap:\s*(\S+)/gim) || []).map((line) => line.replace(/^sitemap:\s*/i, "")) : [];
  if (!maps.length) maps.push(`${origin}/sitemap.xml`);
  const queue = maps.slice(0, 3);
  let fetched = 0;
  while (queue.length && fetched < 5 && urls.length < 600) {
    const map = queue.shift(); fetched += 1;
    const res = await safeFetch(map, { timeoutMs: 8000, maxBytes: 8 * 1024 * 1024 }).catch(() => null);
    if (!res || !res.ok) continue;
    if (/<sitemapindex/i.test(res.text)) {
      const locs = (res.text.match(/<loc>\s*([^<\s]+)\s*<\/loc>/gi) || []).map((l) => decodeEntities(l.replace(/<\/?loc>/gi, "").trim()));
      const ranked = locs.sort((a, b) => Number(/product|produkt|zbozi|goods|item/i.test(b)) - Number(/product|produkt|zbozi|goods|item/i.test(a)));
      queue.unshift(...ranked.slice(0, 2));
    } else {
      for (const block of res.text.match(/<url>[\s\S]*?<\/url>/gi) || []) {
        const loc = block.match(/<loc>\s*([^<\s]+)\s*<\/loc>/i);
        if (loc) urls.push({ loc: decodeEntities(loc[1]), image: /<image:image/i.test(block) });
      }
    }
  }
  return urls;
}

async function mapLimit(items, limit, fn) {
  const results = []; let index = 0;
  async function worker() { while (index < items.length) { const i = index++; results[i] = await fn(items[i]).catch(() => null); } }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}

async function fromWebsite(origin, homeHtml, deadline) {
  const base = new URL(origin);
  const products = jsonLdProducts(homeHtml, origin);
  const scored = new Map();
  const score = (url, bonus) => {
    try {
      const parsed = new URL(url);
      if (parsed.hostname !== base.hostname) return;
      const path = parsed.pathname.toLowerCase();
      if (path === "/" || /(kosik|cart|login|registr|kontakt|contact|blog|clanek|novink|podmink|terms|privacy|ochrana|gdpr|reklamac|kariera|o-nas|about|faq|newsletter|znacka|brand|search|hledat)/.test(path)) return;
      const depth = path.split("/").filter(Boolean).length;
      const value = bonus + (depth >= 2 ? 1 : 0) + (/product|produkt|zbozi|\/p\/|\/item/.test(path) ? 3 : 0);
      scored.set(parsed.toString(), Math.max(scored.get(parsed.toString()) || 0, value));
    } catch (_) { /* ignore */ }
  };
  for (const entry of await sitemapUrls(origin).catch(() => [])) score(entry.loc, entry.image ? 2 : 0);
  for (const link of sameHostLinks(homeHtml, base)) score(link, 1.5);
  const candidates = [...scored.entries()].sort((a, b) => b[1] - a[1]).slice(0, 36).map(([url]) => url);
  const pages = await mapLimit(candidates, 6, async (url) => {
    if (Date.now() > deadline) return null;
    const res = await safeFetch(url, { timeoutMs: 7000, maxBytes: 2 * 1024 * 1024, accept: "text/html" });
    return res.ok ? jsonLdProducts(res.text, res.url) : null;
  });
  for (const list of pages) if (list) products.push(...list);
  return products.length ? { platform: /shoptet/i.test(homeHtml) ? "shoptet" : (/upgates/i.test(homeHtml) ? "upgates" : "web"), products } : null;
}

function dedupe(products) {
  const seen = new Set(); const out = [];
  for (const item of products) {
    const key = (item.url || item.nazev).toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key); out.push(item);
    if (out.length >= MAX_PRODUCTS) break;
  }
  return out;
}

async function discoverStore(input, parseFeed) {
  let raw = String(input || "").trim();
  if (!raw) throw new Error("bad_url");
  if (!/^https?:\/\//i.test(raw)) raw = `https://${raw}`;
  const first = await assertPublicUrl(raw);
  const deadline = Date.now() + 22000;

  // Direct XML feed (Heureka / Zboží / Google)
  if (/\.xml($|\?)/i.test(first.pathname + first.search) || /export|feed/i.test(first.pathname)) {
    const res = await safeFetch(first.toString(), { timeoutMs: 15000, maxBytes: 25 * 1024 * 1024 });
    if (res.ok && /<(SHOPITEM|item|entry)[\s>]/i.test(res.text)) {
      const products = parseFeed(res.text).slice(0, MAX_PRODUCTS);
      if (products.length) return { name: first.hostname.replace(/^www\./, ""), domain: first.hostname.replace(/^www\./, ""), platform: "feed", products };
    }
  }

  const home = await safeFetch(first.toString(), { accept: "text/html" });
  if (!home.ok && !home.text) throw new Error("unreachable");
  const finalUrl = new URL(home.url);
  const origin = finalUrl.origin;
  const domain = finalUrl.hostname.replace(/^www\./, "");
  const name = siteName(home.text || "", domain);

  const result = (await fromShopify(origin)) || (await fromWoo(origin)) || (await fromWebsite(origin, home.text || "", deadline));
  if (!result || !result.products.length) return { name, domain, platform: "unknown", products: [] };
  return { name, domain, platform: result.platform, products: dedupe(result.products) };
}

// ------------------------------------------------------------------ UI texts
const TRY_TEXT = {
  cs: {
    invite: "🎁 Máte pozvánku od známého: 30 dní zdarma místo 3. Na Shopify po instalaci zadejte kód {c}, jinde se stačí zaregistrovat.",
    title: "Vyzkoušejte Chatnelo na svém e-shopu", text: "Vložte adresu svého e-shopu. Chatnelo si za pár vteřin přečte vaše produkty a můžete si s ním rovnou psát – přesně jako vaši zákazníci.",
    placeholder: "vas-eshop.cz", button: "Vyzkoušet", note: "Bez registrace · Shopify, WooCommerce, Shoptet i další",
    steps: ["Otevírám váš e-shop…", "Hledám produkty…", "Učím se váš sortiment…"],
    hello: "Dobrý den 👋 Načetl jsem {n} produktů z {d}. Zeptejte se mě na cokoli – třeba jako váš zákazník.",
    q1: "Co mi doporučíte?", q2: "Máte {p} skladem?", q3: "Něco do {x}?",
    inputPh: "Napište dotaz…", send: "Odeslat", demo: "Ukázka pro {d}",
    ctaTitle: "Líbí se vám to?", ctaText: "Takhle bude Chatnelo odpovídat zákazníkům na vašem webu – 24 hodin denně.",
    ctaShopify: "Nainstalovat na Shopify · 3 dny zdarma", ctaOther: "Vyzkoušet 3 dny zdarma", share: "Sdílet ukázku", copied: "Odkaz zkopírován ✓", again: "Zkusit jiný e-shop",
    none: "Na tomhle webu jsme produkty nenašli automaticky. Zkuste vložit odkaz na XML feed produktů (Heureka, Zboží.cz nebo Google) – najdete ho v administraci e-shopu.",
    error: "Tenhle web se nepodařilo otevřít. Zkontrolujte adresu a zkuste to znovu.", busy: "Teď je to přetížené, zkuste to prosím za chvíli.", limit: "Ukázka má limit zpráv. Pokračujte s 3 dny zdarma ↓",
  },
  sk: {
    invite: "🎁 Máte pozvánku od známeho: 30 dní zdarma namiesto 3. Na Shopify po inštalácii zadajte kód {c}, inde sa stačí zaregistrovať.",
    title: "Vyskúšajte Chatnelo na svojom e-shope", text: "Vložte adresu svojho e-shopu. Chatnelo si za pár sekúnd prečíta vaše produkty a môžete si s ním hneď písať – presne ako vaši zákazníci.",
    placeholder: "vas-eshop.sk", button: "Vyskúšať", note: "Bez registrácie · Shopify, WooCommerce, Shoptet a ďalšie",
    steps: ["Otváram váš e-shop…", "Hľadám produkty…", "Učím sa váš sortiment…"],
    hello: "Dobrý deň 👋 Načítal som {n} produktov z {d}. Opýtajte sa ma na čokoľvek – ako váš zákazník.",
    q1: "Čo mi odporučíte?", q2: "Máte {p} skladom?", q3: "Niečo do {x}?",
    inputPh: "Napíšte otázku…", send: "Odoslať", demo: "Ukážka pre {d}",
    ctaTitle: "Páči sa vám to?", ctaText: "Takto bude Chatnelo odpovedať zákazníkom na vašom webe – 24 hodín denne.",
    ctaShopify: "Nainštalovať na Shopify · 3 dni zdarma", ctaOther: "Vyskúšať 3 dni zdarma", share: "Zdieľať ukážku", copied: "Odkaz skopírovaný ✓", again: "Skúsiť iný e-shop",
    none: "Na tomto webe sme produkty nenašli automaticky. Skúste vložiť odkaz na XML feed produktov (Heureka alebo Google).",
    error: "Tento web sa nepodarilo otvoriť. Skontrolujte adresu.", busy: "Teraz je to preťažené, skúste to o chvíľu.", limit: "Ukážka má limit správ. Pokračujte s 3 dňami zdarma ↓",
  },
  en: {
    invite: "🎁 You were invited by a friend: 30 days free instead of 3. On Shopify enter code {c} after installing, elsewhere just sign up.",
    title: "Try Chatnelo on your own store", text: "Enter your store address. Chatnelo reads your products in seconds and you can chat with it right away – just like your customers would.",
    placeholder: "your-store.com", button: "Try it", note: "No sign-up · Shopify, WooCommerce, Shoptet and more",
    steps: ["Opening your store…", "Finding products…", "Learning your catalog…"],
    hello: "Hi 👋 I've read {n} products from {d}. Ask me anything – like one of your customers would.",
    q1: "What do you recommend?", q2: "Is {p} in stock?", q3: "Anything under {x}?",
    inputPh: "Type a question…", send: "Send", demo: "Demo for {d}",
    ctaTitle: "Like it?", ctaText: "This is how Chatnelo will answer customers on your website – 24 hours a day.",
    ctaShopify: "Install on Shopify · 3 days free", ctaOther: "Try 3 days free", share: "Share this demo", copied: "Link copied ✓", again: "Try another store",
    none: "We couldn't find products on this site automatically. Try pasting your product XML feed URL (Google Shopping or Heureka).",
    error: "We couldn't open this website. Please check the address.", busy: "It's busy right now, please try again in a moment.", limit: "The demo has a message limit. Continue with 3 days free ↓",
  },
  de: {
    invite: "🎁 Sie wurden eingeladen: 30 statt 3 Tage gratis. Auf Shopify nach der Installation Code {c} eingeben, sonst einfach registrieren.",
    title: "Testen Sie Chatnelo in Ihrem Shop", text: "Geben Sie Ihre Shop-Adresse ein. Chatnelo liest Ihre Produkte in Sekunden und Sie können sofort chatten – wie Ihre Kunden.",
    placeholder: "ihr-shop.de", button: "Testen", note: "Ohne Anmeldung · Shopify, WooCommerce, Shoptet und mehr",
    steps: ["Öffne Ihren Shop…", "Suche Produkte…", "Lerne Ihr Sortiment…"],
    hello: "Hallo 👋 Ich habe {n} Produkte von {d} gelesen. Fragen Sie mich alles – wie ein Kunde.",
    q1: "Was empfehlen Sie?", q2: "Ist {p} auf Lager?", q3: "Etwas unter {x}?",
    inputPh: "Frage eingeben…", send: "Senden", demo: "Demo für {d}",
    ctaTitle: "Gefällt es Ihnen?", ctaText: "So beantwortet Chatnelo Kundenfragen auf Ihrer Website – rund um die Uhr.",
    ctaShopify: "Auf Shopify installieren · 3 Tage gratis", ctaOther: "3 Tage gratis testen", share: "Demo teilen", copied: "Link kopiert ✓", again: "Anderen Shop testen",
    none: "Wir konnten auf dieser Website keine Produkte finden. Fügen Sie die URL Ihres Produkt-XML-Feeds ein (Google Shopping).",
    error: "Diese Website konnte nicht geöffnet werden. Bitte Adresse prüfen.", busy: "Gerade ausgelastet, bitte gleich nochmal.", limit: "Die Demo hat ein Nachrichtenlimit. Weiter mit 3 Tagen gratis ↓",
  },
  pl: {
    invite: "🎁 Masz zaproszenie od znajomego: 30 dni za darmo zamiast 3. Na Shopify po instalacji wpisz kod {c}, gdzie indziej wystarczy rejestracja.",
    title: "Wypróbuj Chatnelo na swoim sklepie", text: "Wpisz adres swojego sklepu. Chatnelo w kilka sekund przeczyta Twoje produkty i od razu możesz z nim pisać – jak Twoi klienci.",
    placeholder: "twoj-sklep.pl", button: "Wypróbuj", note: "Bez rejestracji · Shopify, WooCommerce, Shoptet i inne",
    steps: ["Otwieram Twój sklep…", "Szukam produktów…", "Uczę się asortymentu…"],
    hello: "Dzień dobry 👋 Przeczytałem {n} produktów z {d}. Zapytaj mnie o cokolwiek – jak Twój klient.",
    q1: "Co polecasz?", q2: "Czy {p} jest dostępny?", q3: "Coś do {x}?",
    inputPh: "Napisz pytanie…", send: "Wyślij", demo: "Demo dla {d}",
    ctaTitle: "Podoba się?", ctaText: "Tak Chatnelo będzie odpowiadać klientom na Twojej stronie – 24 godziny na dobę.",
    ctaShopify: "Zainstaluj na Shopify · 3 dni gratis", ctaOther: "Wypróbuj 3 dni gratis", share: "Udostępnij demo", copied: "Link skopiowany ✓", again: "Inny sklep",
    none: "Nie znaleźliśmy automatycznie produktów na tej stronie. Wklej adres feedu XML produktów (Google Shopping).",
    error: "Nie udało się otworzyć tej strony. Sprawdź adres.", busy: "Teraz jest przeciążone, spróbuj za chwilę.", limit: "Demo ma limit wiadomości. Kontynuuj z 3 dniami gratis ↓",
  },
};

const CALC_TEXT = {
  cs: { title: "Kolik vám může chat vydělat?", visitors: "Návštěvníků za měsíc", order: "Průměrná objednávka", help: "Chat pomůže dokončit nákup", of1000: "z 1 000 návštěvníků", result: "navíc každý měsíc", roi: "To je {x}× víc, než stojí Chatnelo (od {p}).", note: "Orientační výpočet – skutečný výsledek záleží na vašem e-shopu.", cur: "Kč", price: 379, aov: 800, locale: "cs-CZ" },
  sk: { title: "Koľko vám môže chat zarobiť?", visitors: "Návštevníkov za mesiac", order: "Priemerná objednávka", help: "Chat pomôže dokončiť nákup", of1000: "z 1 000 návštevníkov", result: "navyše každý mesiac", roi: "To je {x}× viac, než stojí Chatnelo (od {p}).", note: "Orientačný výpočet – skutočný výsledok závisí od vášho e-shopu.", cur: "€", price: 16, aov: 40, locale: "sk-SK" },
  en: { title: "How much can the chat earn you?", visitors: "Visitors per month", order: "Average order", help: "The chat helps complete a purchase for", of1000: "out of 1,000 visitors", result: "extra every month", roi: "That's {x}× more than Chatnelo costs (from {p}).", note: "An estimate – real results depend on your store.", cur: "$", price: 16.99, aov: 45, locale: "en-US" },
  de: { title: "Wie viel kann der Chat Ihnen bringen?", visitors: "Besucher pro Monat", order: "Durchschnittliche Bestellung", help: "Der Chat hilft beim Kauf für", of1000: "von 1.000 Besuchern", result: "zusätzlich pro Monat", roi: "Das ist {x}× mehr, als Chatnelo kostet (ab {p}).", note: "Eine Schätzung – das Ergebnis hängt von Ihrem Shop ab.", cur: "€", price: 16, aov: 45, locale: "de-DE" },
  pl: { title: "Ile może Ci zarobić czat?", visitors: "Odwiedzających miesięcznie", order: "Średnie zamówienie", help: "Czat pomoże sfinalizować zakup", of1000: "na 1 000 odwiedzających", result: "więcej co miesiąc", roi: "To {x}× więcej, niż kosztuje Chatnelo (od {p}).", note: "Szacunek – wynik zależy od Twojego sklepu.", cur: "zł", price: 66, aov: 150, locale: "pl-PL" },
};

function json(value) {
  return JSON.stringify(value).replace(/</g, "\\u003c");
}

function tryHtml(options = {}) {
  const lang = options.lang ? json(options.lang) : "null";
  return `
<section id="cn-try" aria-labelledby="cn-try-title">
  <style>
    #cn-try{margin:0 auto 28px;max-width:980px;padding:0 4px}
    #cn-try .box{position:relative;border-radius:22px;padding:28px;background:#fff;box-shadow:0 24px 60px -36px rgba(30,27,75,.55);border:1px solid #ebe7ff}
    #cn-try .box::before{content:"";position:absolute;inset:-1px;border-radius:23px;padding:1px;background:linear-gradient(135deg,#22d3ee,#a855f7);-webkit-mask:linear-gradient(#000 0 0) content-box,linear-gradient(#000 0 0);-webkit-mask-composite:xor;mask-composite:exclude;pointer-events:none}
    #cn-try h2{margin:0 0 6px;font-size:1.55rem;letter-spacing:-.01em;color:#0f172a}
    #cn-try .lead{margin:0 0 18px;color:#475569}
    #cn-try form.go{display:flex;gap:10px;flex-wrap:wrap}
    #cn-try form.go input{flex:1 1 260px;padding:15px 16px;border:1.5px solid #e2e8f0;border-radius:14px;font:inherit;font-size:1.02rem;background:#f8fafc}
    #cn-try form.go input:focus{outline:none;border-color:#a855f7;background:#fff;box-shadow:0 0 0 4px rgba(168,85,247,.14)}
    #cn-try .btn{display:inline-flex;align-items:center;justify-content:center;gap:8px;padding:14px 22px;border:none;border-radius:14px;background:linear-gradient(135deg,#22d3ee,#a855f7);color:#fff;font-weight:800;font-size:1rem;cursor:pointer;text-decoration:none;box-shadow:0 12px 26px -14px rgba(124,58,237,.9)}
    #cn-try .btn.ghost{background:#fff;color:#0f172a;border:1px solid #e2e8f0;box-shadow:none;font-weight:700}
    #cn-try .btn:disabled{opacity:.6;cursor:wait}
    #cn-try .note{margin:10px 0 0;color:#94a3b8;font-size:.85rem}
    #cn-try .steps{list-style:none;margin:18px 0 0;padding:0}
    #cn-try .steps li{display:flex;align-items:center;gap:10px;padding:6px 0;color:#94a3b8;font-weight:600;transition:color .3s}
    #cn-try .steps li.on{color:#0f172a}
    #cn-try .steps li.done{color:#059669}
    #cn-try .steps i{width:18px;height:18px;border-radius:50%;border:2px solid currentColor;display:inline-block;flex:none}
    #cn-try .steps li.on i{border-color:#a855f7;border-top-color:transparent;animation:cnspin .8s linear infinite}
    #cn-try .steps li.done i{background:#10b981;border-color:#10b981}
    @keyframes cnspin{to{transform:rotate(360deg)}}
    #cn-try .msg{margin-top:14px;padding:13px 15px;border-radius:12px;background:#fff7ed;border:1px solid #fed7aa;color:#9a3412;font-size:.94rem}
    #cn-try .result{display:grid;grid-template-columns:1.25fr .75fr;gap:20px;margin-top:20px;align-items:stretch}
    #cn-try .chat{display:flex;flex-direction:column;height:470px;border-radius:18px;overflow:hidden;border:1px solid #e2e8f0;background:#f8fafc}
    #cn-try .chat-head{display:flex;align-items:center;gap:10px;padding:12px 14px;background:linear-gradient(135deg,#0b1020,#312e81);color:#fff}
    #cn-try .chat-head img{width:34px;height:34px;border-radius:50%}
    #cn-try .chat-head b{display:block;font-size:.95rem;line-height:1.2}
    #cn-try .chat-head span{font-size:.78rem;opacity:.8}
    #cn-try .log{flex:1;overflow-y:auto;padding:14px;display:flex;flex-direction:column;gap:10px}
    #cn-try .log>*{flex-shrink:0}
    #cn-try .m{max-width:86%;padding:10px 13px;border-radius:14px;font-size:.93rem;line-height:1.45;white-space:pre-wrap;word-wrap:break-word}
    #cn-try .m.bot{background:#fff;border:1px solid #e2e8f0;align-self:flex-start;border-bottom-left-radius:4px}
    #cn-try .m.me{background:linear-gradient(135deg,#22d3ee,#a855f7);color:#fff;align-self:flex-end;border-bottom-right-radius:4px}
    #cn-try .m.typing{color:#94a3b8}
    #cn-try .cards{display:flex;gap:8px;overflow-x:auto;align-self:stretch;padding-bottom:2px}
    #cn-try .card{flex:0 0 150px;display:block;background:#fff;border:1px solid #e2e8f0;border-radius:12px;overflow:hidden;text-decoration:none;color:#0f172a;font-size:.8rem}
    #cn-try .card img{width:100%;height:96px;object-fit:cover;background:#f1f5f9;display:block}
    #cn-try .card div{padding:7px 9px}
    #cn-try .card b{display:block;font-weight:700;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
    #cn-try .chips{display:flex;gap:6px;flex-wrap:wrap;padding:0 14px 10px}
    #cn-try .chips button{border:1px solid #ddd6fe;background:#fff;color:#6d28d9;border-radius:999px;padding:6px 11px;font-size:.82rem;font-weight:600;cursor:pointer}
    #cn-try form.ask{display:flex;gap:8px;padding:10px;border-top:1px solid #e2e8f0;background:#fff}
    #cn-try form.ask input{flex:1;padding:11px 12px;border:1px solid #e2e8f0;border-radius:11px;font:inherit}
    #cn-try form.ask button{padding:0 16px;border:none;border-radius:11px;background:linear-gradient(135deg,#22d3ee,#a855f7);color:#fff;font-weight:700;cursor:pointer}
    #cn-try .cta{display:flex;flex-direction:column;gap:12px;justify-content:center;padding:22px;border-radius:18px;background:linear-gradient(160deg,#0b1020,#1e1b4b 60%,#2e1065);color:#fff}
    #cn-try .cta h3{margin:0;font-size:1.3rem}
    #cn-try .cta p{margin:0 0 6px;color:#cbd5e1}
    #cn-try .cta .btn.ghost{background:transparent;color:#fff;border-color:rgba(255,255,255,.3)}
    #cn-try .linkbtn{background:none;border:none;color:#a5b4fc;text-decoration:underline;cursor:pointer;font:inherit;font-size:.88rem;padding:0;align-self:flex-start}
    #cn-try [hidden]{display:none!important}
    #cn-try .invite{margin:0 0 16px;padding:12px 14px;border-radius:12px;background:linear-gradient(135deg,#faf5ff,#ecfeff);border:1px solid #d8b4fe;color:#4c1d95;font-weight:600;font-size:.93rem}
    @media (max-width:760px){#cn-try .result{grid-template-columns:1fr}#cn-try .chat{height:430px}#cn-try .box{padding:20px}}
  </style>
  <div class="box">
    <div class="invite" id="cn-invite" hidden></div>
    <h2 id="cn-try-title" data-t="title"></h2>
    <p class="lead" data-t="text"></p>
    <form class="go" id="cn-go">
      <input id="cn-url" type="text" inputmode="url" autocomplete="url" spellcheck="false" required>
      <button class="btn" type="submit" id="cn-go-btn" data-t="button"></button>
    </form>
    <p class="note" data-t="note"></p>
    <ul class="steps" id="cn-steps" hidden></ul>
    <div class="msg" id="cn-msg" hidden></div>
    <div class="result" id="cn-result" hidden>
      <div class="chat">
        <div class="chat-head"><img src="/mascot.png" alt=""><div><b id="cn-name"></b><span id="cn-demo"></span></div></div>
        <div class="log" id="cn-log"></div>
        <div class="chips" id="cn-chips"></div>
        <form class="ask" id="cn-ask"><input id="cn-q" autocomplete="off" maxlength="500"><button type="submit" data-t="send"></button></form>
      </div>
      <div class="cta">
        <h3 data-t="ctaTitle"></h3>
        <p data-t="ctaText"></p>
        <a class="btn" id="cn-cta" href="/store/dashboard?next=install"></a>
        <button class="btn ghost" type="button" id="cn-share" data-t="share"></button>
        <button class="linkbtn" type="button" id="cn-again" data-t="again"></button>
      </div>
    </div>
  </div>
  <script>
  (function () {
    var D = ${json(TRY_TEXT)}, FORCE = ${lang};
    var s = { token: "", history: [], data: null, busy: false };
    function L() { var l = FORCE || window.CHATNELO_LANG || (document.documentElement.lang || "cs").slice(0, 2); return D[l] || D.en; }
    function $(id) { return document.getElementById(id); }
    function fill(t, v) { return t.replace(/\\{(\\w)\\}/g, function (_, k) { return v[k] != null ? v[k] : ""; }); }
    function texts() {
      var t = L(), nodes = document.querySelectorAll("#cn-try [data-t]");
      for (var i = 0; i < nodes.length; i++) nodes[i].textContent = t[nodes[i].getAttribute("data-t")];
      $("cn-url").placeholder = t.placeholder; $("cn-q").placeholder = t.inputPh;
      var ref = ""; try { ref = localStorage.getItem("cn_ref") || ""; } catch (e) {}
      $("cn-invite").hidden = !ref; if (ref) $("cn-invite").textContent = fill(t.invite, { c: ref });
      if (s.data) { $("cn-demo").textContent = fill(t.demo, { d: s.data.domain }); $("cn-cta").textContent = s.data.platform === "shopify" ? t.ctaShopify : t.ctaOther; chips(); }
    }
    document.addEventListener("chatnelo:langchange", texts);
    function add(text, who) { var el = document.createElement("div"); el.className = "m " + who; el.textContent = text; $("cn-log").appendChild(el); $("cn-log").scrollTop = 1e6; return el; }
    function cards(list) {
      if (!list || !list.length) return;
      var wrap = document.createElement("div"); wrap.className = "cards";
      list.forEach(function (p) {
        var a = document.createElement("a"); a.className = "card"; a.href = p.url; a.target = "_blank"; a.rel = "noopener nofollow";
        if (p.image) { var img = document.createElement("img"); img.src = p.image; img.alt = ""; img.loading = "lazy"; a.appendChild(img); }
        var d = document.createElement("div"); var b = document.createElement("b"); b.textContent = p.title; d.appendChild(b);
        if (p.price != null) { var pr = document.createElement("span"); pr.textContent = p.price + " " + (p.currency || ""); d.appendChild(pr); }
        a.appendChild(d); wrap.appendChild(a);
      });
      $("cn-log").appendChild(wrap); $("cn-log").scrollTop = 1e6;
    }
    function chips() {
      var t = L(), d = s.data, box = $("cn-chips"); box.innerHTML = "";
      if (!d || s.history.length) return;
      var list = [t.q1];
      if (d.sample && d.sample[0]) list.push(fill(t.q2, { p: d.sample[0] }));
      if (d.priceHint) list.push(fill(t.q3, { x: d.priceHint }));
      list.forEach(function (q) { var b = document.createElement("button"); b.type = "button"; b.textContent = q; b.onclick = function () { ask(q); }; box.appendChild(b); });
    }
    function steps(n) {
      var t = L(), ul = $("cn-steps"); ul.hidden = false;
      ul.innerHTML = t.steps.map(function (x, i) { return '<li class="' + (i < n ? "done" : (i === n ? "on" : "")) + '"><i></i>' + x + "</li>"; }).join("");
    }
    function load(url) {
      var t = L(); if (!url) return;
      $("cn-msg").hidden = true; $("cn-result").hidden = true; $("cn-go-btn").disabled = true;
      var n = 0; steps(0); var timer = setInterval(function () { if (n < 2) steps(++n); }, 3200);
      fetch("/try/load", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ url: url }) })
        .then(function (r) { return r.json().then(function (d) { d.__status = r.status; return d; }); })
        .then(function (d) {
          clearInterval(timer); $("cn-steps").hidden = true;
          if (d.__status === 429) throw new Error(t.busy);
          if (d.__status >= 400) throw new Error(d.code === "no_products" ? t.none : t.error);
          s.token = d.token; s.data = d; s.history = [];
          $("cn-name").textContent = d.name; $("cn-log").innerHTML = "";
          add(fill(t.hello, { n: d.count, d: d.domain }), "bot");
          var shop = d.platform === "shopify";
          $("cn-cta").href = shop ? "https://apps.shopify.com/chatnelo" : "/store/dashboard?next=install";
          if (shop) { $("cn-cta").target = "_blank"; $("cn-cta").rel = "noopener"; } else { $("cn-cta").removeAttribute("target"); }
          $("cn-result").hidden = false; texts();
          try { history.replaceState(null, "", location.pathname + "?try=" + encodeURIComponent(d.domain) + "#cn-try"); } catch (e) {}
          $("cn-result").scrollIntoView({ behavior: "smooth", block: "center" });
        })
        .catch(function (e) { clearInterval(timer); $("cn-steps").hidden = true; $("cn-msg").textContent = e.message || t.error; $("cn-msg").hidden = false; })
        .finally(function () { $("cn-go-btn").disabled = false; });
    }
    function ask(q) {
      var t = L(); q = String(q || "").trim(); if (!q || s.busy || !s.token) return;
      s.busy = true; $("cn-chips").innerHTML = ""; add(q, "me"); var typing = add("…", "bot typing");
      fetch("/try/chat", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token: s.token, message: q, history: s.history }) })
        .then(function (r) { return r.json().then(function (d) { d.__status = r.status; return d; }); })
        .then(function (d) {
          typing.remove();
          if (d.__status === 410) { add(t.limit, "bot"); return; }
          if (d.__status >= 400 || !d.reply) { add(d.__status === 429 ? t.busy : t.error, "bot"); return; }
          add(d.reply, "bot"); cards(d.products);
          s.history.push({ role: "user", content: q }, { role: "assistant", content: d.reply });
          s.history = s.history.slice(-8);
        })
        .catch(function () { typing.remove(); add(t.busy, "bot"); })
        .finally(function () { s.busy = false; });
    }
    $("cn-go").addEventListener("submit", function (e) { e.preventDefault(); load($("cn-url").value.trim()); });
    $("cn-ask").addEventListener("submit", function (e) { e.preventDefault(); var q = $("cn-q").value; $("cn-q").value = ""; ask(q); });
    $("cn-again").addEventListener("click", function () { $("cn-result").hidden = true; $("cn-url").value = ""; $("cn-url").focus(); });
    $("cn-share").addEventListener("click", function () {
      var link = location.origin + location.pathname + "?try=" + encodeURIComponent(s.data ? s.data.domain : "") + "#cn-try", btn = this;
      var done = function () { var o = btn.textContent; btn.textContent = L().copied; setTimeout(function () { btn.textContent = o; }, 1800); };
      if (navigator.share) { navigator.share({ title: "Chatnelo", url: link }).catch(function () {}); return; }
      if (navigator.clipboard) navigator.clipboard.writeText(link).then(done, function () {});
    });
    function start() {
      try { var r = new URLSearchParams(location.search).get("ref"); if (r && /^[A-Za-z0-9]{4,12}$/.test(r)) localStorage.setItem("cn_ref", r.toUpperCase()); } catch (e) {}
      texts();
      var pre = ""; try { pre = new URLSearchParams(location.search).get("try") || ""; } catch (e) {}
      if (pre) { $("cn-url").value = pre; load(pre); }
    }
    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start); else start();
  })();
  </script>
</section>`;
}

function calcHtml(options = {}) {
  const lang = options.lang ? json(options.lang) : "null";
  return `
<section id="cn-calc" aria-labelledby="cn-calc-title">
  <style>
    #cn-calc{max-width:980px;margin:0 auto 28px;padding:0 4px}
    #cn-calc .box{display:grid;grid-template-columns:1fr 1fr;gap:26px;align-items:center;border-radius:22px;padding:26px;background:#fff;border:1px solid #ebe7ff;box-shadow:0 24px 60px -40px rgba(30,27,75,.5)}
    #cn-calc h2{margin:0 0 14px;font-size:1.35rem;color:#0f172a}
    #cn-calc label{display:block;font-weight:600;font-size:.9rem;color:#334155;margin:12px 0 6px}
    #cn-calc input[type=number]{width:100%;padding:11px 12px;border:1.5px solid #e2e8f0;border-radius:11px;font:inherit;font-size:1rem}
    #cn-calc input[type=range]{width:100%;accent-color:#a855f7}
    #cn-calc .out{border-radius:18px;padding:24px;background:linear-gradient(160deg,#0b1020,#1e1b4b 60%,#2e1065);color:#fff;text-align:center}
    #cn-calc .big{font-size:clamp(2rem,5vw,2.8rem);font-weight:900;letter-spacing:-.02em;background:linear-gradient(90deg,#67e8f9,#d8b4fe);-webkit-background-clip:text;background-clip:text;color:transparent}
    #cn-calc .out p{margin:6px 0 0;color:#cbd5e1}
    #cn-calc .roi{margin-top:14px!important;font-weight:700;color:#fff!important}
    #cn-calc small{display:block;margin-top:12px;color:#94a3b8;font-size:.78rem}
    @media (max-width:760px){#cn-calc .box{grid-template-columns:1fr;padding:20px}}
  </style>
  <div class="box">
    <div>
      <h2 id="cn-calc-title" data-c="title"></h2>
      <label for="cn-v" data-c="visitors"></label><input id="cn-v" type="number" min="0" step="100" value="5000">
      <label for="cn-o"><span data-c="order"></span> (<span class="cn-cur"></span>)</label><input id="cn-o" type="number" min="0" step="10">
      <label for="cn-r"><span data-c="help"></span> <b id="cn-rv">2</b> <span data-c="of1000"></span></label><input id="cn-r" type="range" min="1" max="10" value="2">
    </div>
    <div class="out"><div class="big" id="cn-big"></div><p data-c="result"></p><p class="roi" id="cn-roi"></p><small data-c="note"></small></div>
  </div>
  <script>
  (function () {
    var C = ${json(CALC_TEXT)}, FORCE = ${lang}, lastLang = "";
    function T() { var l = FORCE || window.CHATNELO_LANG || "cs"; return C[l] || C.en; }
    function $(id) { return document.getElementById(id); }
    function money(n, t) { return new Intl.NumberFormat(t.locale, { maximumFractionDigits: n < 100 ? 2 : 0 }).format(n) + " " + t.cur; }
    function calc() {
      var t = T(), l = FORCE || window.CHATNELO_LANG || "cs";
      if (l !== lastLang) { lastLang = l; $("cn-o").value = t.aov; var n = document.querySelectorAll("#cn-calc [data-c]"); for (var i = 0; i < n.length; i++) n[i].textContent = t[n[i].getAttribute("data-c")]; var c = document.querySelectorAll("#cn-calc .cn-cur"); for (var j = 0; j < c.length; j++) c[j].textContent = t.cur; }
      var v = Math.max(0, +$("cn-v").value || 0), o = Math.max(0, +$("cn-o").value || 0), r = +$("cn-r").value;
      $("cn-rv").textContent = r;
      var extra = v * (r / 1000) * o;
      $("cn-big").textContent = "+ " + money(Math.round(extra), t);
      var x = extra / t.price;
      $("cn-roi").textContent = x >= 1.5 ? t.roi.replace("{x}", x >= 10 ? Math.round(x) : x.toFixed(1)).replace("{p}", money(t.price, t)) : "";
    }
    ["cn-v", "cn-o", "cn-r"].forEach(function (id) { document.getElementById(id).addEventListener("input", calc); });
    document.addEventListener("chatnelo:langchange", calc);
    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", calc); else calc();
  })();
  </script>
</section>`;
}

// ------------------------------------------------------- Czech landing pages
const SEO_PAGES = {
  "chatbot-pro-shoptet": {
    platform: "Shoptet", title: "AI chatbot pro Shoptet – odpovídá zákazníkům 24/7 | Chatnelo",
    description: "Chatbot pro Shoptet e-shop, který odpovídá zákazníkům podle vašich produktů, cen a skladu. Instalace za 5 minut přes HTML kód, produkty z Heureka feedu. 3 dny zdarma.",
    h1: "AI chatbot pro Shoptet", lead: "Chatnelo odpovídá zákazníkům vašeho Shoptet e-shopu 24 hodin denně – podle skutečných produktů, cen a skladu. Nainstalujete ho za 5 minut, bez programátora.",
    install: ["Zaregistrujte se na chatnelo.com (3 dny zdarma, bez karty).", "V administraci Shoptetu otevřete Vzhled a obsah → Editor → HTML kód a do pole Zápatí vložte kód Chatnelo.", "Vložte do Chatnela odkaz na Heureka XML feed (Propojení → Srovnávače zboží) – produkty se pak samy aktualizují každých 6 hodin."],
    faq: [["Funguje Chatnelo se všemi šablonami Shoptetu?", "Ano. Chat se vkládá jedním řádkem kódu do Zápatí, který funguje ve všech šablonách. Po změně šablony stačí zkontrolovat, že kód v Zápatí zůstal."],
      ["Odkud chatbot ví, co mám skladem?", "Z XML feedu pro Heureku nebo Zboží.cz, který Shoptet generuje automaticky. Chatnelo si ho načítá každých 6 hodin, takže zná aktuální ceny i dostupnost."],
      ["Musím něco programovat?", "Ne. Zkopírujete jeden řádek kódu a jeden odkaz na feed. Krok za krokem vás provede náš návod."],
      ["Kolik to stojí?", "Prvních 3 dny je plná verze zdarma bez karty. Potom tarify od 379 Kč měsíčně podle počtu vyřešených konverzací."]],
  },
  "chatbot-pro-woocommerce": {
    platform: "WooCommerce", title: "AI chatbot pro WooCommerce – plugin zdarma | Chatnelo",
    description: "Chatbot pro WordPress a WooCommerce. Plugin zdarma, produkty se načtou samy, odpovídá zákazníkům 24/7 v jejich jazyce. 3 dny zdarma.",
    h1: "AI chatbot pro WooCommerce", lead: "Chatnelo je plugin pro WordPress a WooCommerce, který odpovídá zákazníkům 24/7 podle vašich produktů, cen a skladu – a ukazuje rovnou klikací karty produktů.",
    install: ["Nainstalujte plugin Chatnelo (Pluginy → Přidat nový, nebo ZIP z chatnelo.com).", "V Nastavení → Chatnelo AI Chatbot vložte ID obchodu a klíč z vašeho účtu Chatnelo.", "Zkopírujte adresu produktového feedu, kterou plugin vytvoří, do panelu Chatnelo. Hotovo."],
    faq: [["Zpomalí plugin můj web?", "Ne. Skript chatu se načítá asynchronně až po načtení stránky."],
      ["Jak chatbot zná moje produkty?", "Plugin sám vytvoří produktový feed z WooCommerce (název, cena, dostupnost, obrázek, odkaz) a Chatnelo si ho načítá každých 6 hodin."],
      ["V jakém jazyce odpovídá?", "V jazyce, ve kterém se zákazník zeptá – česky, slovensky, anglicky, německy, polsky a v dalších jazycích."],
      ["Kolik to stojí?", "Plugin je zdarma. Služba Chatnelo má 3 dny plné verze zdarma, potom tarify od 379 Kč měsíčně."]],
  },
  "chatbot-pro-upgates": {
    platform: "Upgates", title: "AI chatbot pro Upgates e-shop | Chatnelo",
    description: "Chatbot pro Upgates, který odpovídá zákazníkům podle vašich produktů a skladu. Vložení přes vlastní konverzní kódy, produkty z XML feedu. 3 dny zdarma.",
    h1: "AI chatbot pro Upgates", lead: "Chatnelo odpovídá zákazníkům vašeho Upgates e-shopu nonstop – na dotazy o produktech, skladu a dopravě. Bez programování.",
    install: ["Zaregistrujte se na chatnelo.com (3 dny zdarma).", "V administraci Upgates otevřete Doplňky → Vlastní konverzní kódy a vložte kód Chatnelo do části pro všechny stránky (před </body>).", "Do Chatnela vložte odkaz na XML export pro Heureku nebo Google – produkty se aktualizují samy."],
    faq: [["Potřebuju programátora?", "Ne, stačí vložit jeden řádek kódu do vlastních konverzních kódů. Provede vás náš návod."],
      ["Jak chatbot zná moje produkty?", "Z XML exportu pro srovnávače (Heureka, Google), který Upgates umí vytvořit. Chatnelo ho načítá každých 6 hodin."],
      ["Co když chatbot něco neví?", "Nevymýšlí si. Řekne, že informaci nemá, a nabídne kontakt na vás. Takové dotazy pak uvidíte v přehledu."],
      ["Kolik to stojí?", "3 dny plné verze zdarma, potom tarify od 379 Kč měsíčně."]],
  },
  "chatbot-pro-shopify": {
    platform: "Shopify", title: "AI chatbot pro Shopify v češtině | Chatnelo",
    description: "Česká Shopify aplikace Chatnelo: AI chatbot, který odpovídá zákazníkům podle produktů, variant, skladu a dopravy. Instalace jedním kliknutím, 3 dny zdarma.",
    h1: "AI chatbot pro Shopify", lead: "Chatnelo je česká aplikace v Shopify App Store. Odpovídá zákazníkům 24/7 podle vašich produktů, variant, skladu a dopravy – v jejich jazyce.",
    install: ["Otevřete Chatnelo v Shopify App Store a klikněte na Instalovat.", "Vyberte 3 dny zdarma, nebo rovnou tarif. Produkty a sklad se načtou samy.", "V editoru šablony zapněte Chatnelo Chat (Vložení aplikací) a upravte barvy."],
    faq: [["Musím něco nastavovat?", "Skoro nic. Produkty, varianty, sklad i stránky o dopravě a vrácení si Chatnelo načte přímo ze Shopify."],
      ["Jak se platí?", "Bezpečně přes Shopify spolu s vaším předplatným Shopify. Zrušit můžete kdykoli."],
      ["Umí česky?", "Ano – a také slovensky, anglicky, německy, polsky a v dalších jazycích podle zákazníka."],
      ["Kolik to stojí?", "3 dny zdarma, potom od $16.99 měsíčně. Je i tarif zdarma s 30 konverzacemi měsíčně."]],
  },
  "ai-chatbot-pro-eshop": {
    platform: "", title: "AI chatbot pro e-shop – odpovídá zákazníkům 24/7 | Chatnelo",
    description: "AI chatbot pro e-shop, který zná vaše produkty, ceny a sklad. Funguje se Shopify, WooCommerce, Shoptetem, Upgates i vlastním webem. Vyzkoušejte zdarma na svém e-shopu.",
    h1: "AI chatbot pro e-shop", lead: "Většina zákazníků se ptá pořád na to samé – sklad, velikosti, doprava. Chatnelo jim odpoví okamžitě, ve dne i v noci, podle skutečných dat z vašeho e-shopu.",
    install: ["Vyzkoušejte ukázku nahoře – stačí adresa vašeho e-shopu.", "Zaregistrujte se (3 dny zdarma) a vložte na web jeden řádek kódu, nebo nainstalujte plugin či Shopify aplikaci.", "Hotovo. Chatbot odpovídá a vy v přehledu vidíte, na co se zákazníci ptají."],
    faq: [["Na jakých platformách Chatnelo funguje?", "Shopify (aplikace), WooCommerce (plugin), Shoptet, Upgates, Wix, Webnode a jakýkoli web, kam jde vložit kód."],
      ["Nevymýšlí si chatbot?", "Ne. Odpovídá jen podle vašich produktů a pravidel obchodu. Když něco neví, řekne to a nabídne kontakt na vás."],
      ["Co když se zákazník zeptá v jiném jazyce?", "Chatnelo odpoví v jazyce zákazníka."],
      ["Kolik to stojí?", "3 dny plné verze zdarma, potom tarify od 379 Kč měsíčně. Platíte za vyřešené konverzace, ne za jednotlivé zprávy."]],
  },
};

function esc(text) {
  return String(text).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" }[c]));
}

function seoPage(slug) {
  const p = SEO_PAGES[slug];
  const shopify = p.platform === "Shopify";
  const primary = shopify
    ? '<a class="btn" href="https://apps.shopify.com/chatnelo" target="_blank" rel="noopener">Nainstalovat ze Shopify App Store</a>'
    : '<a class="btn" href="/store/dashboard?next=install">Vyzkoušet 3 dny zdarma</a>';
  const faqLd = { "@context": "https://schema.org", "@type": "FAQPage", mainEntity: p.faq.map(([q, a]) => ({ "@type": "Question", name: q, acceptedAnswer: { "@type": "Answer", text: a } })) };
  const others = Object.keys(SEO_PAGES).filter((s) => s !== slug).map((s) => `<a href="/${s}">${esc(SEO_PAGES[s].h1)}</a>`).join(" · ");
  return `<!doctype html>
<html lang="cs">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>${esc(p.title)}</title>
  <meta name="description" content="${esc(p.description)}">
  <link rel="canonical" href="https://chatnelo.com/${slug}">
  <link rel="icon" href="/favicon.ico" sizes="48x48">
  <link rel="icon" type="image/png" sizes="192x192" href="/icon-192.png">
  <link rel="apple-touch-icon" href="/apple-touch-icon.png">
  <meta property="og:title" content="${esc(p.title)}">
  <meta property="og:description" content="${esc(p.description)}">
  <meta property="og:image" content="https://chatnelo.com/icon-512.png">
  <meta property="og:url" content="https://chatnelo.com/${slug}">
  <script type="application/ld+json">${json(faqLd)}</script>
  <style>
    *{box-sizing:border-box}
    body{margin:0;font-family:Inter,system-ui,-apple-system,"Segoe UI",sans-serif;color:#0f172a;background:#f6f7fb;line-height:1.6;-webkit-font-smoothing:antialiased}
    a{color:#7c3aed}
    .top{max-width:1080px;margin:0 auto;display:flex;align-items:center;justify-content:space-between;padding:16px 22px}
    .logo{display:flex;align-items:center;gap:10px;font-weight:800;color:#fff;text-decoration:none;font-size:1.1rem}
    .logo img{width:38px;height:38px;border-radius:50%}
    .login{color:#fff;text-decoration:none;font-weight:600;border:1px solid rgba(255,255,255,.3);padding:8px 14px;border-radius:10px;font-size:.9rem}
    .hero{background:radial-gradient(900px 400px at 85% -10%,rgba(168,85,247,.45),transparent 60%),linear-gradient(135deg,#0b1020,#1e1b4b 60%,#2e1065);color:#fff;padding-bottom:70px}
    .hero-in{max-width:1080px;margin:0 auto;padding:30px 22px 0}
    .hero h1{margin:0 0 12px;font-size:clamp(2rem,4.4vw,3rem);line-height:1.1;letter-spacing:-.02em}
    .hero p{margin:0 0 22px;max-width:680px;color:#cbd5e1;font-size:1.1rem}
    .btn{display:inline-flex;align-items:center;justify-content:center;padding:14px 22px;border-radius:14px;background:linear-gradient(135deg,#22d3ee,#a855f7);color:#fff;font-weight:800;text-decoration:none;box-shadow:0 12px 26px -14px rgba(124,58,237,.9)}
    .wrap{max-width:1080px;margin:-46px auto 0;padding:0 18px 60px}
    .sec{max-width:980px;margin:0 auto 28px;background:#fff;border-radius:22px;padding:26px;border:1px solid #ebe7ff}
    .sec h2{margin:0 0 14px;font-size:1.35rem}
    .grid{display:grid;grid-template-columns:repeat(3,1fr);gap:14px}
    .grid div{padding:16px;border-radius:14px;background:#f8fafc;border:1px solid #e2e8f0}
    .grid b{display:block;margin-bottom:4px}
    ol.st{margin:0;padding-left:20px}
    ol.st li{margin-bottom:8px}
    details{border:1px solid #e2e8f0;border-radius:12px;padding:12px 16px;margin-bottom:10px;background:#fff}
    summary{cursor:pointer;font-weight:700}
    details p{margin:8px 0 0;color:#475569}
    footer{text-align:center;color:#64748b;font-size:.88rem;padding:10px 18px 40px}
    footer a{color:#64748b}
    @media (max-width:760px){.grid{grid-template-columns:1fr}}
  </style>
</head>
<body>
  <div class="hero">
    <div class="top"><a class="logo" href="/"><img src="/mascot.png" alt="">Chatnelo</a><a class="login" href="/store/dashboard#login">Přihlásit se</a></div>
    <div class="hero-in"><h1>${esc(p.h1)}</h1><p>${esc(p.lead)}</p>${primary}</div>
  </div>
  <div class="wrap">
    ${tryHtml({ lang: "cs" })}
    <div class="sec">
      <h2>Proč Chatnelo</h2>
      <div class="grid">
        <div><b>⚡ Odpověď během pár vteřin</b>Zákazník nečeká na e-mail a neodchází ke konkurenci – ani v noci a o víkendu.</div>
        <div><b>🎯 Jen podle vašich dat</b>Produkty, ceny, sklad a pravidla obchodu. Nic si nevymýšlí.</div>
        <div><b>🛍️ Klikací karty produktů</b>Chatbot rovnou ukáže doporučené zboží s cenou a odkazem.</div>
      </div>
    </div>
    <div class="sec">
      <h2>Instalace${p.platform ? " na " + esc(p.platform) : ""} ve 3 krocích</h2>
      <ol class="st">${p.install.map((step) => `<li>${esc(step)}</li>`).join("")}</ol>
      ${shopify ? "" : '<p style="margin:12px 0 0"><a href="/store/install">Podrobný návod krok za krokem →</a></p>'}
    </div>
    ${calcHtml({ lang: "cs" })}
    <div class="sec">
      <h2>Časté dotazy</h2>
      ${p.faq.map(([q, a]) => `<details><summary>${esc(q)}</summary><p>${esc(a)}</p></details>`).join("")}
    </div>
    <div class="sec" style="text-align:center">
      <h2>Vyzkoušejte to 3 dny zdarma</h2>
      <p style="margin:0 0 16px;color:#475569">Bez karty a bez závazků. Nastavení zabere pár minut.</p>
      ${primary}
    </div>
  </div>
  <footer>${others}<br><a href="/">chatnelo.com</a> · <a href="/privacy">Ochrana osobních údajů</a> · © BrosWars Studio</footer>
</body>
</html>`;
}

function createGrowth(deps) {
  const sessions = new Map();
  const loadLimits = new Map();
  const chatLimits = new Map();

  function limited(map, key, max, windowMs) {
    const now = Date.now();
    const entry = map.get(key);
    if (!entry || now - entry.start > windowMs) { map.set(key, { start: now, count: 1 }); return false; }
    entry.count += 1;
    return entry.count > max;
  }

  function prune() {
    const now = Date.now();
    for (const [token, session] of sessions) if (now - session.created > SESSION_TTL_MS) sessions.delete(token);
    while (sessions.size > MAX_SESSIONS) sessions.delete(sessions.keys().next().value);
    for (const map of [loadLimits, chatLimits]) for (const [key, entry] of map) if (now - entry.start > 60 * 60 * 1000) map.delete(key);
  }
  setInterval(prune, 10 * 60 * 1000).unref();

  function register(app) {
    app.post("/try/load", async (req, res) => {
      try {
        if (limited(loadLimits, req.ip, 8, 60 * 60 * 1000)) return res.status(429).json({ code: "busy" });
        const store = await discoverStore(req.body && req.body.url, deps.parseFeed).catch((error) => {
          throw Object.assign(new Error(error.message), { statusCode: 400, code: ["bad_url", "not_found", "unreachable"].includes(error.message) ? error.message : "unreachable" });
        });
        if (!store.products.length) return res.status(422).json({ code: "no_products", name: store.name, domain: store.domain });
        const token = crypto.randomBytes(16).toString("hex");
        sessions.set(token, { ...store, created: Date.now(), messages: 0 });
        prune();
        const priced = store.products.map((p) => p.cena).filter((n) => Number.isFinite(n) && n > 0).sort((a, b) => a - b);
        const currency = (store.products.find((p) => p.mena) || {}).mena || "";
        let priceHint = "";
        if (priced.length >= 3) {
          const median = priced[Math.floor(priced.length / 2)];
          const magnitude = Math.pow(10, Math.max(0, Math.floor(Math.log10(median))));
          const rounded = Math.ceil(median / magnitude) * magnitude;
          priceHint = `${rounded.toLocaleString("cs-CZ")} ${currency === "CZK" ? "Kč" : currency}`.trim();
        }
        const sample = store.products.filter((p) => p.nazev.length <= 40).slice(0, 3).map((p) => p.nazev);
        res.json({ token, name: store.name, domain: store.domain, platform: store.platform, count: store.products.length, sample, priceHint });
      } catch (error) {
        if (!error.code) deps.logRouteError("Try load", error);
        res.status(error.statusCode || 500).json({ code: error.code || "error" });
      }
    });

    app.post("/try/chat", async (req, res) => {
      try {
        const token = String((req.body && req.body.token) || "");
        const session = sessions.get(token);
        if (!session) return res.status(404).json({ code: "expired" });
        if (limited(chatLimits, req.ip, 60, 60 * 60 * 1000)) return res.status(429).json({ code: "busy" });
        if (session.messages >= MAX_MESSAGES) return res.status(410).json({ code: "limit" });
        const message = String((req.body && req.body.message) || "").trim().slice(0, 500);
        if (!message) return res.status(400).json({ code: "empty" });
        const history = Array.isArray(req.body.history) ? req.body.history.slice(-8)
          .filter((item) => item && ["user", "assistant"].includes(item.role))
          .map((item) => ({ role: item.role, content: String(item.content || "").slice(0, 1500) })) : [];
        session.messages += 1;
        const reply = await deps.generateGenericAnswer({ name: session.name }, { products: session.products, rules: {} }, message, history);
        res.json({ reply, products: deps.genericProductCards(session.products, reply) });
      } catch (error) {
        deps.logRouteError("Try chat", error);
        res.status(500).json({ code: "error" });
      }
    });

    for (const slug of Object.keys(SEO_PAGES)) {
      app.get(`/${slug}`, (req, res) => res.type("html").send(seoPage(slug)));
    }
  }

  return { register, tryHtml, calcHtml, seoPaths: Object.keys(SEO_PAGES).map((slug) => `/${slug}`) };
}

module.exports = { createGrowth, discoverStore, jsonLdProducts, isPrivateIp };
