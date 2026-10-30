// Merchant insights (most frequent / unanswered customer questions) and
// human handoff (customer leaves an e-mail when the bot has no answer).
//
// Privacy by design:
// - questions are stored without personal data (e-mails, phone numbers and
//   long digit sequences are masked) and only for RETENTION_DAYS;
// - a customer's e-mail is stored only when they type it into the handoff
//   form themselves; it is encrypted at rest and looked up by a SHA-256 hash
//   so customers/redact can delete it.

const crypto = require("crypto");

const RETENTION_DAYS = 90;
const NO_ANSWER_TOKEN = "[[NO_ANSWER]]";
const NO_ANSWER_RULE =
  `- If the customer's question cannot be answered from the data (you had to say you don't have that information or suggest contacting the store), end your reply with the exact marker ${NO_ANSWER_TOKEN} on its own. Never use the marker when you did answer.
- After your reply, on a new last line, add [[Q: topic]] where topic is the customer's question as a short lowercase English topic of 2-4 words, without names, e-mails or numbers. Always use the most common wording, e.g. "shipping cost", "delivery time", "return policy", "payment methods", "product availability", "product price", "gift wrapping", "discount code", "order status". This line is hidden from the customer.`;
const EMAIL_RE = /^[^\s@]{1,64}@[^\s@]{1,190}\.[^\s@]{2,24}$/;

function splitNoAnswer(reply) {
  let text = String(reply || "");
  const unanswered = /\[\[\s*NO_ANSWER\s*\]\]/i.test(text);
  const topicMatch = text.match(/\[\[\s*Q\s*:\s*([^\]]{1,160})\]\]/i);
  const topic = topicMatch ? topicMatch[1].trim().slice(0, 120) : "";
  text = text
    .replace(/\[\[\s*NO_ANSWER\s*\]\]/gi, "")
    .replace(/\[\[\s*Q\s*:[^\]]*\]\]/gi, "")
    .replace(/\[\[[^\]]*$/g, "")
    .replace(/[ \t]+\n/g, "\n")
    .trim();
  return { reply: text, unanswered, topic };
}

function sanitizeQuestion(text) {
  return String(text || "")
    .replace(/[^\s@]+@[^\s@]+\.[^\s@]+/g, "[e-mail]")
    .replace(/\+?\d[\d\s().-]{7,}\d/g, "[číslo]")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 300);
}

function normalizeQuestion(text) {
  return String(text || "")
    .toLowerCase()
    .normalize("NFD").replace(/[̀-ͯ]/g, "")
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 300);
}

function isValidEmail(value) {
  return typeof value === "string" && EMAIL_RE.test(value.trim()) && value.trim().length <= 254;
}

function hashEmail(email) {
  return crypto.createHash("sha256").update(String(email || "").trim().toLowerCase()).digest("hex");
}

async function ensureTables(db) {
  await db.query(`
    CREATE TABLE IF NOT EXISTS chat_questions (
      id BIGSERIAL PRIMARY KEY,
      shop TEXT NOT NULL,
      question TEXT NOT NULL,
      norm TEXT NOT NULL,
      answered BOOLEAN NOT NULL DEFAULT TRUE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await db.query("CREATE INDEX IF NOT EXISTS chat_questions_shop_created_idx ON chat_questions (shop, created_at)");
  await db.query(`
    CREATE TABLE IF NOT EXISTS chat_leads (
      id BIGSERIAL PRIMARY KEY,
      shop TEXT NOT NULL,
      case_id TEXT,
      email_enc TEXT NOT NULL,
      email_hash TEXT NOT NULL,
      question TEXT NOT NULL DEFAULT '',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      handled_at TIMESTAMPTZ
    )
  `);
  await db.query("CREATE INDEX IF NOT EXISTS chat_leads_shop_idx ON chat_leads (shop, created_at)");
  await db.query("CREATE INDEX IF NOT EXISTS chat_leads_email_idx ON chat_leads (shop, email_hash)");
  await db.query(
    "CREATE UNIQUE INDEX IF NOT EXISTS chat_leads_case_idx ON chat_leads (shop, case_id) WHERE case_id IS NOT NULL",
  );
}

async function recordQuestion(db, shop, question, answered, topic) {
  const clean = sanitizeQuestion(question);
  // Group by the model's canonical English rewrite when available, so
  // "Kolik stojí doprava?" and "How much is shipping?" count together.
  const norm = normalizeQuestion(topic ? `t ${sanitizeQuestion(topic)}` : clean);
  if (!norm) return;
  await db.query(
    "INSERT INTO chat_questions (shop, question, norm, answered) VALUES ($1, $2, $3, $4)",
    [shop, clean, norm, Boolean(answered)],
  );
}

async function recordLead(db, { shop, caseId, email, question, encrypt }) {
  const address = String(email || "").trim();
  if (!isValidEmail(address)) {
    const error = new Error("Zadejte prosím platný e-mail.");
    error.statusCode = 400;
    error.expose = true;
    throw error;
  }
  const result = await db.query(
    `INSERT INTO chat_leads (shop, case_id, email_enc, email_hash, question)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (shop, case_id) WHERE case_id IS NOT NULL
     DO UPDATE SET email_enc = EXCLUDED.email_enc, email_hash = EXCLUDED.email_hash,
                   question = EXCLUDED.question, created_at = NOW(), handled_at = NULL
     RETURNING id`,
    [shop, caseId || null, encrypt(address), hashEmail(address), String(question || "").replace(/\s+/g, " ").trim().slice(0, 500)],
  );
  return result.rows[0].id;
}

async function getInsights(db, shop, decrypt, days = 30) {
  const since = `${Math.max(1, Math.min(RETENTION_DAYS, Number(days) || 30))} days`;
  const [totals, top, unanswered, leads] = await Promise.all([
    db.query(
      `SELECT COUNT(*)::int AS total, COUNT(*) FILTER (WHERE NOT answered)::int AS unanswered
       FROM chat_questions WHERE shop = $1 AND created_at > NOW() - $2::interval`,
      [shop, since],
    ),
    db.query(
      `SELECT (ARRAY_AGG(question ORDER BY created_at DESC))[1] AS question, COUNT(*)::int AS count,
              BOOL_OR(NOT answered) AS has_unanswered, MAX(created_at) AS last_at
       FROM chat_questions WHERE shop = $1 AND created_at > NOW() - $2::interval
       GROUP BY norm ORDER BY COUNT(*) DESC, MAX(created_at) DESC LIMIT 10`,
      [shop, since],
    ),
    db.query(
      `SELECT (ARRAY_AGG(question ORDER BY created_at DESC))[1] AS question, COUNT(*)::int AS count, MAX(created_at) AS last_at
       FROM chat_questions WHERE shop = $1 AND NOT answered AND created_at > NOW() - $2::interval
       GROUP BY norm ORDER BY MAX(created_at) DESC LIMIT 15`,
      [shop, since],
    ),
    db.query(
      `SELECT id, email_enc, question, created_at, handled_at FROM chat_leads
       WHERE shop = $1 ORDER BY handled_at IS NOT NULL, created_at DESC LIMIT 50`,
      [shop],
    ),
  ]);
  return {
    days: Number(since.split(" ")[0]),
    total: totals.rows[0].total,
    unanswered: totals.rows[0].unanswered,
    top: top.rows.map((row) => ({ question: row.question, count: row.count, unanswered: row.has_unanswered, lastAt: row.last_at })),
    unansweredList: unanswered.rows.map((row) => ({ question: row.question, count: row.count, lastAt: row.last_at })),
    leads: leads.rows.map((row) => {
      let email = "";
      try { email = decrypt(row.email_enc); } catch (_) { email = ""; }
      return { id: String(row.id), email, question: row.question, createdAt: row.created_at, handled: Boolean(row.handled_at) };
    }).filter((lead) => lead.email),
    openLeads: leads.rows.filter((row) => !row.handled_at).length,
  };
}

async function setLeadHandled(db, shop, id, handled) {
  const result = await db.query(
    `UPDATE chat_leads SET handled_at = ${handled ? "NOW()" : "NULL"} WHERE shop = $1 AND id = $2`,
    [shop, String(id)],
  );
  return result.rowCount > 0;
}

async function deleteForShop(db, shop) {
  await db.query("DELETE FROM chat_questions WHERE shop = $1", [shop]);
  await db.query("DELETE FROM chat_leads WHERE shop = $1", [shop]);
}

async function redactCustomer(db, shop, email) {
  if (!email) return 0;
  const result = await db.query("DELETE FROM chat_leads WHERE shop = $1 AND email_hash = $2", [shop, hashEmail(email)]);
  return result.rowCount;
}

async function countCustomerData(db, shop, email) {
  if (!email) return 0;
  const result = await db.query("SELECT COUNT(*)::int AS n FROM chat_leads WHERE shop = $1 AND email_hash = $2", [shop, hashEmail(email)]);
  return result.rows[0].n;
}

async function pruneOld(db) {
  await db.query(`DELETE FROM chat_questions WHERE created_at < NOW() - INTERVAL '${RETENTION_DAYS} days'`);
  await db.query(`DELETE FROM chat_leads WHERE created_at < NOW() - INTERVAL '${RETENTION_DAYS} days'`);
}

module.exports = {
  RETENTION_DAYS,
  NO_ANSWER_TOKEN,
  NO_ANSWER_RULE,
  splitNoAnswer,
  sanitizeQuestion,
  normalizeQuestion,
  isValidEmail,
  hashEmail,
  ensureTables,
  recordQuestion,
  recordLead,
  getInsights,
  setLeadHandled,
  deleteForShop,
  redactCustomer,
  countCustomerData,
  pruneOld,
};
