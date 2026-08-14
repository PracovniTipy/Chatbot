const test = require("node:test");
const assert = require("node:assert/strict");
const {
  PLANS,
  calculateBillingPeriod,
  calculateSubscriptionPeriod,
  getPlan,
  publicPlans,
  resolvePlan,
} = require("../billing");

test("fixed monthly plans match the agreed price list", () => {
  assert.deepEqual(
    PLANS.map(({ limit, priceCzk }) => [limit, priceCzk]),
    [
      [70, 379],
      [150, 779],
      [400, 1270],
      [1000, 2490],
      [5000, 7990],
      [12000, 14990],
      [30000, 29990],
      [80000, 59990],
      [200000, 119990],
      [500000, 249990],
    ],
  );
});

test("the five self-service plans are public", () => {
  assert.deepEqual(publicPlans().map((plan) => plan.limit), [70, 150, 400, 1000, 5000]);
});

test("every plan has a unique handle and limit", () => {
  assert.equal(new Set(PLANS.map((plan) => plan.handle)).size, PLANS.length);
  assert.equal(new Set(PLANS.map((plan) => plan.limit)).size, PLANS.length);
});

test("plans resolve from Shopify names and handles", () => {
  assert.equal(getPlan("growth-400").limit, 400);
  assert.equal(resolvePlan({ name: "Business 5000" }).priceCzk, 7990);
  assert.equal(resolvePlan({ planHandle: "scale-12000" }).limit, 12000);
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
