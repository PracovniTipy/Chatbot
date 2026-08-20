const test = require("node:test");
const assert = require("node:assert/strict");
const {
  buildEmbedSnippet,
  buildGenericSystemPrompt,
  generateSecretKey,
  generateStoreId,
  planHandleToEnvSuffix,
  safeEqual,
  validateCatalogInput,
  validateSignupInput,
} = require("../stores");

test("signup requires a non-empty name and a valid email", () => {
  assert.throws(() => validateSignupInput({ name: "", email: "a@b.cz" }), /název/);
  assert.throws(() => validateSignupInput({ name: "Obchod", email: "not-an-email" }), /e-mail/);
  assert.deepEqual(
    validateSignupInput({ name: "  Můj obchod  ", email: " Test@Example.com " }),
    { name: "Můj obchod", email: "test@example.com" },
  );
});

test("store ids and secret keys are unique and reasonably long", () => {
  assert.notEqual(generateStoreId(), generateStoreId());
  const key = generateSecretKey();
  assert.notEqual(key, generateSecretKey());
  assert.ok(key.length >= 40);
});

test("safeEqual only accepts matching values", () => {
  assert.equal(safeEqual("abc123", "abc123"), true);
  assert.equal(safeEqual("abc123", "abc124"), false);
  assert.equal(safeEqual("abc123", "abc12"), false);
  assert.equal(safeEqual(undefined, ""), true);
});

test("catalog validation accepts well-formed products and known rule keys", () => {
  const { products, rules } = validateCatalogInput({
    products: [
      { id: "sku-1", nazev: "Boty", cena: 999, mena: "czk", sklad: 3, popis: "Pohodlné boty" },
    ],
    rules: { doprava: "Zdarma od 999 Kč", neznamy: "ignorováno" },
  });
  assert.deepEqual(products, [
    { id: "sku-1", nazev: "Boty", cena: 999, mena: "CZK", sklad: 3, popis: "Pohodlné boty" },
  ]);
  assert.deepEqual(rules, { doprava: "Zdarma od 999 Kč" });
});

test("catalog validation rejects duplicate product ids", () => {
  assert.throws(
    () => validateCatalogInput({
      products: [
        { id: "sku-1", nazev: "A", cena: 1, mena: "CZK", sklad: 0, popis: "" },
        { id: "sku-1", nazev: "B", cena: 2, mena: "CZK", sklad: 0, popis: "" },
      ],
    }),
    /lišit/,
  );
});

test("catalog validation rejects invalid price, stock and currency", () => {
  assert.throws(
    () => validateCatalogInput({ products: [{ id: "x", nazev: "N", cena: -1, mena: "CZK", sklad: 0, popis: "" }] }),
    /cena/,
  );
  assert.throws(
    () => validateCatalogInput({ products: [{ id: "x", nazev: "N", cena: 1, mena: "CZK", sklad: 1.5, popis: "" }] }),
    /sklad/,
  );
  assert.throws(
    () => validateCatalogInput({ products: [{ id: "x", nazev: "N", cena: 1, mena: "K", sklad: 0, popis: "" }] }),
    /měna/,
  );
});

test("embed snippet carries the store id and api key as data attributes", () => {
  const snippet = buildEmbedSnippet("https://example.com", "store-1", "key-1");
  assert.match(snippet, /src="https:\/\/example\.com\/embed\.js"/);
  assert.match(snippet, /data-store="store-1"/);
  assert.match(snippet, /data-key="key-1"/);
});

test("generic system prompt embeds the store name, products and rules", () => {
  const prompt = buildGenericSystemPrompt("Můj obchod", [{ id: "sku-1" }], { doprava: "Zdarma" });
  assert.match(prompt, /Můj obchod/);
  assert.match(prompt, /sku-1/);
  assert.match(prompt, /Zdarma/);
});

test("plan handles map to predictable Stripe price env var suffixes", () => {
  assert.equal(planHandleToEnvSuffix("start-70"), "START_70");
  assert.equal(planHandleToEnvSuffix("business-5000"), "BUSINESS_5000");
  assert.equal(planHandleToEnvSuffix(""), "");
});
