const test = require("node:test");
const assert = require("node:assert/strict");
const vm = require("node:vm");
const {
  allocateCredits, clickForPaidAt, clientScript, isValidClickId, normalizeCreatorCode, normalizeShopDomain,
  shopifyExternalId, shopifyPaidPeriods, stripeInvoiceConversions,
} = require("../affiliate");

const DAY = 24 * 60 * 60 * 1000;
const CLICK = "bw_abcdefghij0123456789";

function recurring(price, extra = {}) {
  return { plan: { pricingDetails: { __typename: "AppRecurringPricing", interval: "EVERY_30_DAYS", price: { amount: String(price), currencyCode: "USD" }, ...extra } } };
}

function sub(overrides = {}) {
  return {
    id: "gid://shopify/AppSubscription/555",
    name: "Basic 150",
    status: "ACTIVE",
    test: false,
    trialDays: 3,
    createdAt: "2026-06-01T10:00:00Z",
    currentPeriodEnd: "2026-08-03T10:05:00Z",
    lineItems: [recurring(34.99)],
    ...overrides,
  };
}

test("click ids follow the contract format", () => {
  assert.equal(isValidClickId(CLICK), true);
  assert.equal(isValidClickId("bw_ABCDEFGHIJ0123456789"), false);
  assert.equal(isValidClickId("bw_short"), false);
  assert.equal(isValidClickId(null), false);
});

test("shop addresses normalize to the myshopify domain", () => {
  assert.equal(normalizeShopDomain("My-Store"), "my-store.myshopify.com");
  assert.equal(normalizeShopDomain(" https://my-store.myshopify.com/admin?x=1 "), "my-store.myshopify.com");
  assert.equal(normalizeShopDomain("my-store.cz"), null);
  assert.equal(normalizeShopDomain("admin.shopify.com"), null);
  assert.equal(normalizeShopDomain(""), null);
});

test("creator codes are uppercased alphanumerics", () => {
  assert.equal(normalizeCreatorCode(" petr-novak 12 "), "PETRNOVAK12");
});

test("the latest attribution at or before the payment wins", () => {
  const rows = [
    { click_id: "bw_aaaaaaaaaaaaaaaaaaaa", attached_at: "2026-01-01T00:00:00Z" },
    { click_id: "bw_bbbbbbbbbbbbbbbbbbbb", attached_at: "2026-03-01T00:00:00Z" },
  ];
  assert.equal(clickForPaidAt(rows, "2025-12-31T00:00:00Z"), null);
  assert.equal(clickForPaidAt(rows, "2026-02-01T00:00:00Z"), "bw_aaaaaaaaaaaaaaaaaaaa");
  assert.equal(clickForPaidAt(rows, "2026-03-01T00:00:00Z"), "bw_bbbbbbbbbbbbbbbbbbbb");
});

test("only charged periods after the trial are counted", () => {
  // Trial ends 2026-06-04 10:05; periods start 06-04, 07-04 (current ends 08-03).
  const periods = shopifyPaidPeriods(sub(), { now: new Date("2026-07-20T00:00:00Z") });
  assert.deepEqual(periods.map((p) => [p.n, p.start.toISOString(), p.gross]), [
    [0, "2026-06-04T10:05:00.000Z", 34.99],
    [1, "2026-07-04T10:05:00.000Z", 34.99],
  ]);
});

test("nothing is counted during the trial", () => {
  const during = sub({ createdAt: "2026-07-01T10:00:00Z", currentPeriodEnd: "2026-07-04T10:00:00Z" });
  assert.deepEqual(shopifyPaidPeriods(during, { now: new Date("2026-07-02T00:00:00Z") }), []);
  const ahead = sub({ createdAt: "2026-07-01T10:00:00Z", currentPeriodEnd: "2026-08-03T10:00:00Z" });
  assert.deepEqual(shopifyPaidPeriods(ahead, { now: new Date("2026-07-02T00:00:00Z") }), []);
});

test("period numbers stay stable as time passes", () => {
  const early = shopifyPaidPeriods(sub(), { now: new Date("2026-07-20T00:00:00Z") });
  const later = shopifyPaidPeriods(sub({ currentPeriodEnd: "2026-09-02T10:05:00Z" }), { now: new Date("2026-08-10T00:00:00Z") });
  assert.deepEqual(later.slice(0, 2).map((p) => [p.n, p.start.getTime()]), early.map((p) => [p.n, p.start.getTime()]));
  assert.equal(later.length, 3);
  assert.equal(shopifyExternalId("f".repeat(64), later[2]), `${"f".repeat(16)}:555:2`);
});

test("test, cancelled, non-recurring and dev subscriptions emit nothing", () => {
  const now = new Date("2026-07-20T00:00:00Z");
  assert.deepEqual(shopifyPaidPeriods(sub({ test: true }), { now }), []);
  assert.deepEqual(shopifyPaidPeriods(sub({ status: "CANCELLED" }), { now }), []);
  assert.deepEqual(shopifyPaidPeriods(sub({ currentPeriodEnd: null }), { now }), []);
  assert.deepEqual(shopifyPaidPeriods(sub({ lineItems: [{ plan: { pricingDetails: { __typename: "AppUsagePricing" } } }] }), { now }), []);
  assert.deepEqual(shopifyPaidPeriods(sub({ lineItems: [recurring(34.99, { interval: "ANNUAL" })] }), { now }), []);
});

test("the first-month discount is the amount actually charged", () => {
  const discounted = sub({ lineItems: [recurring(34.99, { discount: { durationLimitInIntervals: 1, priceAfterDiscount: { amount: "4.45", currencyCode: "USD" } } })] });
  const periods = shopifyPaidPeriods(discounted, { now: new Date("2026-07-20T00:00:00Z") });
  assert.deepEqual(periods.map((p) => p.gross), [4.45, 34.99]);
  const free = sub({ lineItems: [recurring(34.99, { discount: { durationLimitInIntervals: null, priceAfterDiscount: { amount: "0.0", currencyCode: "USD" } } })] });
  assert.deepEqual(shopifyPaidPeriods(free, { now: new Date("2026-07-20T00:00:00Z") }), []);
});

test("after a plan change the prorated first period is skipped", () => {
  const previous = { id: "gid://shopify/AppSubscription/1", status: "CANCELLED", test: false, trialDays: 3, createdAt: "2026-03-01T00:00:00Z" };
  const current = sub({ trialDays: 0 });
  const periods = shopifyPaidPeriods(current, { now: new Date("2026-07-20T00:00:00Z"), allSubscriptions: [previous, current] });
  assert.ok(periods.length > 0);
  assert.ok(periods.every((p) => p.n > 0));
  // An earlier subscription cancelled during its trial does not count.
  const trialOnly = { ...previous, createdAt: "2026-05-31T12:00:00Z" };
  const all = shopifyPaidPeriods(current, { now: new Date("2026-07-20T00:00:00Z"), allSubscriptions: [trialOnly, current] });
  assert.equal(all[0].n, 0);
});

test("app credits are subtracted from the next periods", () => {
  const periods = [
    { key: "a", start: new Date("2026-06-04T00:00:00Z"), gross: 34.99, currency: "USD" },
    { key: "b", start: new Date("2026-07-04T00:00:00Z"), gross: 34.99, currency: "USD" },
    { key: "c", start: new Date("2026-08-03T00:00:00Z"), gross: 34.99, currency: "USD" },
  ];
  const credits = [{ amount: { amount: "50.00", currencyCode: "USD" }, createdAt: "2026-06-10T00:00:00Z", test: false }];
  const nets = allocateCredits(periods, credits);
  assert.deepEqual([nets.get("a"), nets.get("b"), nets.get("c")], [34.99, 0, 19.98]);
  assert.equal(allocateCredits(periods, [{ amount: { amount: "5", currencyCode: "EUR" }, createdAt: "2026-06-10T00:00:00Z" }]), null);
  const fixed = allocateCredits([{ ...periods[1], fixedNet: 0 }, periods[2]], credits);
  assert.equal(fixed.get("c"), 19.98);
  assert.equal(allocateCredits(periods, [{ ...credits[0], test: true }]).get("b"), 34.99);
});

test("only live, paid Stripe invoices count", () => {
  const rows = stripeInvoiceConversions([
    { id: "in_1", status: "paid", livemode: true, amount_paid: 77900, currency: "czk", status_transitions: { paid_at: 1780000000 } },
    { id: "in_2", status: "paid", livemode: false, amount_paid: 77900, currency: "czk", status_transitions: { paid_at: 1780000000 } },
    { id: "in_3", status: "paid", livemode: true, amount_paid: 0, currency: "czk", status_transitions: { paid_at: 1780000000 } },
    { id: "in_4", status: "paid", livemode: true, amount_paid: 1000, post_payment_credit_notes_amount: 1000, currency: "usd", status_transitions: { paid_at: 1780000000 } },
  ]);
  assert.deepEqual(rows.map((row) => [row.externalId, row.amount, row.currency]), [["in_1", 779, "CZK"]]);
});

test("the client script stores the click, strips the parameter and keeps other params", () => {
  const store = new Map();
  let replaced = null;
  const listeners = {};
  const context = {
    URL,
    JSON,
    Date,
    location: { href: `https://chatnelo.com/?utm=x&bw=${CLICK}#top` },
    history: { state: null, replaceState: (_s, _t, value) => { replaced = value; } },
    localStorage: { getItem: (k) => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v)) },
    document: { addEventListener: (type, fn) => { listeners[type] = fn; }, documentElement: { lang: "cs" } },
    navigator: { language: "cs" },
  };
  context.window = context;
  vm.runInNewContext(clientScript().replace(/^<script>|<\/script>$/g, ""), context);
  assert.equal(JSON.parse(store.get("bw_click")).id, CLICK);
  assert.equal(replaced, "/?utm=x#top");
  assert.equal(context.window.bwClickId(), CLICK);
  assert.equal(typeof listeners.click, "function");
});
