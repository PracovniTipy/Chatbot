const PRICING_TIERS = Object.freeze([
  Object.freeze({ upTo: 40, unitPriceHalere: 950 }),
  Object.freeze({ upTo: 100, unitPriceHalere: 670 }),
  Object.freeze({ upTo: 250, unitPriceHalere: 450 }),
  Object.freeze({ upTo: 600, unitPriceHalere: 350 }),
  Object.freeze({ upTo: 1500, unitPriceHalere: 280 }),
  Object.freeze({ upTo: 4000, unitPriceHalere: 200 }),
]);

const MONTHLY_USAGE_LIMIT = PRICING_TIERS.at(-1).upTo;
const BILLING_PERIOD_DAYS = 30;
const BILLING_PERIOD_MS = BILLING_PERIOD_DAYS * 24 * 60 * 60 * 1000;

function normalizeUsage(value) {
  const usage = Number(value);
  if (!Number.isFinite(usage) || usage < 0) return 0;
  return Math.min(Math.floor(usage), MONTHLY_USAGE_LIMIT);
}

function calculatePriceHalere(value) {
  const usage = normalizeUsage(value);
  let price = 0;
  let previousLimit = 0;

  for (const tier of PRICING_TIERS) {
    const unitsInTier = Math.max(0, Math.min(usage, tier.upTo) - previousLimit);
    price += unitsInTier * tier.unitPriceHalere;
    previousLimit = tier.upTo;
    if (usage <= tier.upTo) break;
  }

  return price;
}

function calculatePriceCzk(value) {
  return calculatePriceHalere(value) / 100;
}

function calculateBillingPeriod(startedAt, currentDate = new Date()) {
  const start = new Date(startedAt);
  const now = new Date(currentDate);
  if (!Number.isFinite(start.getTime()) || !Number.isFinite(now.getTime())) {
    throw new Error("Neplatné datum fakturačního období.");
  }

  const elapsed = Math.max(0, now.getTime() - start.getTime());
  const periodIndex = Math.floor(elapsed / BILLING_PERIOD_MS);
  const periodStart = new Date(start.getTime() + periodIndex * BILLING_PERIOD_MS);
  const periodEnd = new Date(periodStart.getTime() + BILLING_PERIOD_MS);
  return { periodStart, periodEnd };
}

function calculateSubscriptionPeriod(subscription, currentDate = new Date()) {
  const now = new Date(currentDate);
  const currentPeriodEnd = new Date(subscription?.currentPeriodEnd);

  if (Number.isFinite(now.getTime()) && Number.isFinite(currentPeriodEnd.getTime())) {
    let periodEnd = currentPeriodEnd;
    while (periodEnd.getTime() <= now.getTime()) {
      periodEnd = new Date(periodEnd.getTime() + BILLING_PERIOD_MS);
    }
    return {
      periodStart: new Date(periodEnd.getTime() - BILLING_PERIOD_MS),
      periodEnd,
    };
  }

  return calculateBillingPeriod(subscription?.createdAt, now);
}

function publicPricingTiers() {
  let previousLimit = 0;
  return PRICING_TIERS.map((tier) => {
    const result = {
      from: previousLimit + 1,
      to: tier.upTo,
      unitPriceCzk: tier.unitPriceHalere / 100,
    };
    previousLimit = tier.upTo;
    return result;
  });
}

module.exports = {
  BILLING_PERIOD_DAYS,
  MONTHLY_USAGE_LIMIT,
  PRICING_TIERS,
  calculateBillingPeriod,
  calculatePriceCzk,
  calculatePriceHalere,
  calculateSubscriptionPeriod,
  publicPricingTiers,
};
