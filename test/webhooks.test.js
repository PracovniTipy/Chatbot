const test = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("crypto");
const { COMPLIANCE_TOPICS, verifyShopifyWebhook } = require("../webhooks");

test("mandatory Shopify compliance topics are configured in code", () => {
  assert.deepEqual(COMPLIANCE_TOPICS, [
    "customers/data_request",
    "customers/redact",
    "shop/redact",
  ]);
});

test("valid Shopify webhook HMAC is accepted", () => {
  const secret = "test-secret";
  const body = Buffer.from('{"shop_domain":"demo.myshopify.com"}');
  const hmac = crypto.createHmac("sha256", secret).update(body).digest("base64");

  assert.equal(verifyShopifyWebhook(body, hmac, secret), true);
});

test("tampered Shopify webhook body is rejected", () => {
  const secret = "test-secret";
  const original = Buffer.from('{"shop_domain":"demo.myshopify.com"}');
  const tampered = Buffer.from('{"shop_domain":"attacker.myshopify.com"}');
  const hmac = crypto.createHmac("sha256", secret).update(original).digest("base64");

  assert.equal(verifyShopifyWebhook(tampered, hmac, secret), false);
  assert.equal(verifyShopifyWebhook(original, "", secret), false);
});
