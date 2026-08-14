const test = require("node:test");
const assert = require("node:assert/strict");
const {
  MONTHLY_USAGE_LIMIT,
  PRICING_TIERS,
  calculateBillingPeriod,
  calculatePriceCzk,
  calculateSubscriptionPeriod,
} = require("../billing");

test("graduated pricing matches all six agreed checkpoints", () => {
  assert.equal(calculatePriceCzk(0), 0);
  assert.equal(calculatePriceCzk(40), 380);
  assert.equal(calculatePriceCzk(100), 782);
  assert.equal(calculatePriceCzk(250), 1457);
  assert.equal(calculatePriceCzk(600), 2682);
  assert.equal(calculatePriceCzk(1500), 5202);
  assert.equal(calculatePriceCzk(4000), 10202);
});

test("usage is capped at the agreed maximum", () => {
  assert.equal(MONTHLY_USAGE_LIMIT, 4000);
  assert.equal(calculatePriceCzk(4001), calculatePriceCzk(4000));
});

test("no tier is cheaper than two crowns per successful answer", () => {
  assert.ok(PRICING_TIERS.every((tier) => tier.unitPriceHalere >= 200));
});

test("billing periods are consecutive 30-day windows", () => {
  const { periodStart, periodEnd } = calculateBillingPeriod(
    "2026-08-01T12:00:00.000Z",
    "2026-09-02T12:00:00.000Z",
  );
  assert.equal(periodStart.toISOString(), "2026-08-31T12:00:00.000Z");
  assert.equal(periodEnd.toISOString(), "2026-09-30T12:00:00.000Z");
});

test("an active Shopify subscription anchors the billing period", () => {
  const { periodStart, periodEnd } = calculateSubscriptionPeriod(
    {
      createdAt: "2026-07-01T12:00:00.000Z",
      currentPeriodEnd: "2026-08-20T12:00:00.000Z",
    },
    "2026-08-13T12:00:00.000Z",
  );
  assert.equal(periodStart.toISOString(), "2026-07-21T12:00:00.000Z");
  assert.equal(periodEnd.toISOString(), "2026-08-20T12:00:00.000Z");
});

test("a stale Shopify period is advanced without resetting usage", () => {
  const { periodStart, periodEnd } = calculateSubscriptionPeriod(
    {
      createdAt: "2026-06-01T12:00:00.000Z",
      currentPeriodEnd: "2026-07-31T12:00:00.000Z",
    },
    "2026-08-13T12:00:00.000Z",
  );
  assert.equal(periodStart.toISOString(), "2026-07-31T12:00:00.000Z");
  assert.equal(periodEnd.toISOString(), "2026-08-30T12:00:00.000Z");
});
