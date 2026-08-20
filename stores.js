const crypto = require("crypto");

const MAX_PRODUCTS = 300;
const RULE_KEYS = ["doprava", "vraceni", "platba"];
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const CURRENCY_RE = /^[A-Z]{3}$/;

function generateStoreId() {
  return crypto.randomUUID();
}

function generateSecretKey() {
  return crypto.randomBytes(24).toString("hex");
}

function safeEqual(a, b) {
  const bufferA = Buffer.from(String(a ?? ""));
  const bufferB = Buffer.from(String(b ?? ""));
  if (bufferA.length !== bufferB.length) return false;
  return crypto.timingSafeEqual(bufferA, bufferB);
}

function validateSignupInput(body) {
  const name = typeof body?.name === "string" ? body.name.trim() : "";
  const email = typeof body?.email === "string" ? body.email.trim().toLowerCase() : "";
  if (!name) throw new Error("Zadejte prosím název obchodu.");
  if (name.length > 200) throw new Error("Název obchodu je příliš dlouhý (max 200 znaků).");
  if (!EMAIL_RE.test(email)) throw new Error("Zadejte prosím platný e-mail.");
  return { name, email };
}

function validateProduct(raw, index) {
  if (!raw || typeof raw !== "object") {
    throw new Error(`Produkt č. ${index + 1} musí být objekt.`);
  }
  const id = typeof raw.id === "string" ? raw.id.trim() : "";
  const nazev = typeof raw.nazev === "string" ? raw.nazev.trim() : "";
  const mena = typeof raw.mena === "string" ? raw.mena.trim().toUpperCase() : "";
  const popis = typeof raw.popis === "string" ? raw.popis.trim() : "";
  const cena = Number(raw.cena);
  const sklad = Number(raw.sklad);

  if (!id || id.length > 100) {
    throw new Error(`Produkt č. ${index + 1}: chybí platné id (max 100 znaků).`);
  }
  if (!nazev || nazev.length > 200) {
    throw new Error(`Produkt č. ${index + 1}: chybí platný název (max 200 znaků).`);
  }
  if (!CURRENCY_RE.test(mena)) {
    throw new Error(`Produkt č. ${index + 1}: měna musí být tříznakový kód (např. CZK).`);
  }
  if (!Number.isFinite(cena) || cena < 0) {
    throw new Error(`Produkt č. ${index + 1}: cena musí být kladné číslo.`);
  }
  if (!Number.isInteger(sklad) || sklad < 0) {
    throw new Error(`Produkt č. ${index + 1}: sklad musí být celé nezáporné číslo.`);
  }
  if (popis.length > 2000) {
    throw new Error(`Produkt č. ${index + 1}: popis je příliš dlouhý (max 2000 znaků).`);
  }
  return { id, nazev, cena, mena, sklad, popis };
}

function validateCatalogInput(body) {
  const productsRaw = Array.isArray(body?.products) ? body.products : [];
  if (productsRaw.length > MAX_PRODUCTS) {
    throw new Error(`Nejvýš ${MAX_PRODUCTS} produktů najednou.`);
  }
  const products = productsRaw.map(validateProduct);
  const ids = new Set(products.map((product) => product.id));
  if (ids.size !== products.length) throw new Error("Id produktů se musí lišit.");

  const rulesRaw = body?.rules && typeof body.rules === "object" ? body.rules : {};
  const rules = {};
  for (const key of RULE_KEYS) {
    if (typeof rulesRaw[key] === "string" && rulesRaw[key].trim()) {
      rules[key] = rulesRaw[key].trim().slice(0, 1000);
    }
  }
  return { products, rules };
}

function planHandleToEnvSuffix(handle) {
  return String(handle || "").trim().toUpperCase().replace(/-/g, "_");
}

function buildEmbedSnippet(baseUrl, storeId, apiKey) {
  return `<script src="${baseUrl}/embed.js" data-store="${storeId}" data-key="${apiKey}" async></script>`;
}

function buildGenericSystemPrompt(storeName, products, rules) {
  return `Jsi ochotný nákupní asistent e-shopu ${storeName}.
Odpovídej stručně a konkrétně ve stejném jazyce, ve kterém se ptá zákazník.
Používej pouze fakta z poskytnutých dat o produktech a pravidlech obchodu níže. Nevymýšlej sklad, ceny, slevy ani vlastnosti.
Za skladem považuj produkt jen pokud sklad je větší než 0.
Pokud informace v datech není, řekni to otevřeně.
Data obchodu:
${JSON.stringify({ products, rules })}`;
}

module.exports = {
  MAX_PRODUCTS,
  RULE_KEYS,
  buildEmbedSnippet,
  buildGenericSystemPrompt,
  generateSecretKey,
  generateStoreId,
  planHandleToEnvSuffix,
  safeEqual,
  validateCatalogInput,
  validateSignupInput,
};
