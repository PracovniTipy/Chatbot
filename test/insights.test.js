const test = require("node:test");
const assert = require("node:assert");
const insights = require("../insights");

test("splitNoAnswer strips the marker and flags unanswered", () => {
  const a = insights.splitNoAnswer("Nevím, kontaktujte obchod. [[NO_ANSWER]]");
  assert.strictEqual(a.reply, "Nevím, kontaktujte obchod.");
  assert.strictEqual(a.unanswered, true);
  const b = insights.splitNoAnswer("Ano, skladem.");
  assert.strictEqual(b.reply, "Ano, skladem.");
  assert.strictEqual(b.unanswered, false);
  assert.strictEqual(insights.splitNoAnswer("Sorry\n[[ no_answer ]]").unanswered, true);
});

test("sanitizeQuestion masks e-mails and phone numbers", () => {
  const out = insights.sanitizeQuestion("Napište mi na jan.novak@seznam.cz nebo +420 777 123 456 prosím");
  assert.ok(!out.includes("seznam.cz"));
  assert.ok(!out.includes("777"));
  assert.ok(out.includes("[e-mail]"));
});

test("normalizeQuestion groups the same sentence", () => {
  assert.strictEqual(insights.normalizeQuestion("Kolik stojí doprava?"), insights.normalizeQuestion("kolik stoji  DOPRAVA"));
});

test("isValidEmail", () => {
  assert.ok(insights.isValidEmail("a@b.cz"));
  assert.ok(!insights.isValidEmail("nope"));
  assert.ok(!insights.isValidEmail("a@b"));
});

test("recordLead rejects invalid e-mail with 400", async () => {
  const db = { query: async () => ({ rows: [{ id: 1 }] }) };
  await assert.rejects(insights.recordLead(db, { shop: "s", email: "x", encrypt: (v) => v }), (e) => e.statusCode === 400);
  const id = await insights.recordLead(db, { shop: "s", caseId: "abc-12345", email: "a@b.cz", question: "q", encrypt: (v) => v });
  assert.strictEqual(id, 1);
});

test("getInsights shapes the result and hides undecryptable leads", async () => {
  const responses = [
    { rows: [{ total: 5, unanswered: 2 }] },
    { rows: [{ question: "Kolik stojí doprava?", count: 3, has_unanswered: false, last_at: new Date() }] },
    { rows: [{ question: "Máte dárkové balení?", count: 2, last_at: new Date() }] },
    { rows: [{ id: 7, email_enc: "enc:a@b.cz", question: "q", created_at: new Date(), handled_at: null },
             { id: 8, email_enc: "broken", question: "q", created_at: new Date(), handled_at: new Date() }] },
  ];
  let i = 0;
  const db = { query: async () => responses[i++] };
  const decrypt = (v) => { if (!v.startsWith("enc:")) throw new Error("bad"); return v.slice(4); };
  const r = await insights.getInsights(db, "shop", decrypt);
  assert.strictEqual(r.total, 5);
  assert.strictEqual(r.top[0].count, 3);
  assert.strictEqual(r.unansweredList.length, 1);
  assert.strictEqual(r.leads.length, 1);
  assert.strictEqual(r.leads[0].email, "a@b.cz");
  assert.strictEqual(r.openLeads, 1);
});

test("splitNoAnswer extracts the canonical topic and hides it", () => {
  const r = insights.splitNoAnswer("Doprava stojí 89 Kč.\n[[Q: How much does shipping cost?]]");
  assert.strictEqual(r.reply, "Doprava stojí 89 Kč.");
  assert.strictEqual(r.topic, "How much does shipping cost?");
  assert.strictEqual(r.unanswered, false);
  const both = insights.splitNoAnswer("Nevím. [[NO_ANSWER]]\n[[Q: Do you offer gift wrapping?]]");
  assert.strictEqual(both.reply, "Nevím.");
  assert.strictEqual(both.unanswered, true);
  assert.strictEqual(insights.splitNoAnswer("Odpověď [[Q: useknut").reply, "Odpověď");
});
