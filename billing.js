const PLANS = Object.freeze([
  Object.freeze({ handle: "start-70", name: "Start 70", limit: 70, priceCzk: 379, public: true }),
  Object.freeze({ handle: "basic-150", name: "Basic 150", limit: 150, priceCzk: 779, public: true }),
  Object.freeze({ handle: "growth-400", name: "Growth 400", limit: 400, priceCzk: 1270, public: true }),
  Object.freeze({ handle: "pro-1000", name: "Pro 1000", limit: 1000, priceCzk: 2490, public: true }),
  Object.freeze({ handle: "business-5000", name: "Business 5000", limit: 5000, priceCzk: 7990, public: true }),
  Object.freeze({ handle: "scale-12000", name: "Scale 12000", limit: 12000, priceCzk: 14990, public: false }),
  Object.freeze({ handle: "scale-30000", name: "Scale 30000", limit: 30000, priceCzk: 29990, public: false }),
  Object.freeze({ handle: "scale-80000", name: "Scale 80000", limit: 80000, priceCzk: 59990, public: false }),
  Object.freeze({ handle: "enterprise-200000", name: "Enterprise 200000", limit: 200000, priceCzk: 119990, public: false }),
  Object.freeze({ handle: "enterprise-500000", name: "Enterprise 500000", limit: 500000, priceCzk: 249990, public: false }),
]);

const DEFAULT_PLAN_HANDLE = "start-70";
const BILLING_PERIOD_DAYS = 30;
const BILLING_PERIOD_MS = BILLING_PERIOD_DAYS * 24 * 60 * 60 * 1000;

function normalizePlanKey(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

function getPlan(value) {
  if (value && typeof value === "object" && Number.isInteger(value.limit)) return value;
  const key = normalizePlanKey(value);
  if (!key) return null;

  const exact = PLANS.find((plan) =>
    normalizePlanKey(plan.handle) === key || normalizePlanKey(plan.name) === key,
  );
  if (exact) return exact;

  const numericLimit = Number(key.match(/\d+/)?.[0]);
  return Number.isInteger(numericLimit)
    ? PLANS.find((plan) => plan.limit === numericLimit) || null
    : null;
}

function resolvePlan(subscription, fallbackHandle = DEFAULT_PLAN_HANDLE) {
  const candidates = [
    subscription?.planHandle,
    subscription?.handle,
    subscription?.name,
    fallbackHandle,
  ];
  for (const candidate of candidates) {
    const plan = getPlan(candidate);
    if (plan) return plan;
  }
  return null;
}

function publicPlans() {
  return PLANS.filter((plan) => plan.public);
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

module.exports = {
  BILLING_PERIOD_DAYS,
  DEFAULT_PLAN_HANDLE,
  PLANS,
  calculateBillingPeriod,
  calculateSubscriptionPeriod,
  getPlan,
  publicPlans,
  resolvePlan,
};
