const crypto = require("crypto");

const COMPLIANCE_TOPICS = Object.freeze([
  "customers/data_request",
  "customers/redact",
  "shop/redact",
]);

function verifyShopifyWebhook(rawBody, providedHmac, clientSecret) {
  if (!clientSecret || !providedHmac || !Buffer.isBuffer(rawBody)) return false;

  const computedHmac = crypto
    .createHmac("sha256", clientSecret)
    .update(rawBody)
    .digest("base64");
  const provided = Buffer.from(String(providedHmac), "utf8");
  const computed = Buffer.from(computedHmac, "utf8");

  return provided.length === computed.length && crypto.timingSafeEqual(provided, computed);
}

module.exports = {
  COMPLIANCE_TOPICS,
  verifyShopifyWebhook,
};
