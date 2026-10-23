const test = require("node:test");
const assert = require("node:assert/strict");
const { parseFeed, validateFeedUrl, selectRelevantProducts } = require("../feed");

test("parses Heureka feed items", () => {
  const xml = `<SHOP><SHOPITEM><ITEM_ID>1</ITEM_ID><PRODUCTNAME>Mikina &amp; čepice</PRODUCTNAME><URL>https://x.cz/m</URL><PRICE_VAT>1 290</PRICE_VAT><DELIVERY_DATE>0</DELIVERY_DATE></SHOPITEM></SHOP>`;
  const [p] = parseFeed(xml);
  assert.equal(p.nazev, "Mikina & čepice");
  assert.equal(p.cena, 1290);
  assert.equal(p.dostupnost, "skladem");
  assert.equal(p.url, "https://x.cz/m");
});

test("parses Google feed items", () => {
  const xml = `<rss><channel><item><g:id>A</g:id><title>Wallet</title><g:price>39.00 USD</g:price><g:availability>out of stock</g:availability></item></channel></rss>`;
  const [p] = parseFeed(xml);
  assert.equal(p.mena, "USD");
  assert.equal(p.dostupnost, "není skladem");
});

test("rejects private feed addresses", () => {
  assert.throws(() => validateFeedUrl("http://127.0.0.1/feed.xml"));
  assert.equal(validateFeedUrl("https://shop.cz/feed.xml"), "https://shop.cz/feed.xml");
});

test("selects relevant products for large catalogues", () => {
  const products = Array.from({ length: 100 }, (_, i) => ({ nazev: i === 70 ? "Zimní bunda" : `Triko ${i}` }));
  assert.equal(selectRelevantProducts(products, "máte zimní bundu?", 5)[0].nazev, "Zimní bunda");
});
