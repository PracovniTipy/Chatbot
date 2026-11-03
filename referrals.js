// "Recommend Chatnelo": every account gets a short code. A new store that
// signs up with it gets a 30-day trial instead of 3 days and the recommender
// gets 30 days for free (or app credit when already paying on Shopify).
const crypto = require("crypto");

const REFERRAL_DAYS = 30;
const MAX_REWARDS = 12;
const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

async function ensureTables(db) {
  await db.query(`
    CREATE TABLE IF NOT EXISTS referral_codes (
      code TEXT PRIMARY KEY,
      owner_kind TEXT NOT NULL,
      owner_id TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE (owner_kind, owner_id)
    )
  `);
  await db.query(`
    CREATE TABLE IF NOT EXISTS referrals (
      referee_key TEXT PRIMARY KEY,
      code TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await db.query(`
    CREATE TABLE IF NOT EXISTS shop_bonus (
      shop_hash TEXT PRIMARY KEY,
      free_until TIMESTAMPTZ NOT NULL
    )
  `);
  await db.query("ALTER TABLE generic_stores ADD COLUMN IF NOT EXISTS trial_days INTEGER");
  await db.query("ALTER TABLE generic_stores ADD COLUMN IF NOT EXISTS free_until TIMESTAMPTZ");
}

function hash(value) {
  return crypto.createHash("sha256").update(String(value || "").trim().toLowerCase()).digest("hex");
}

function newCode() {
  const bytes = crypto.randomBytes(6);
  let code = "";
  for (const byte of bytes) code += ALPHABET[byte % ALPHABET.length];
  return code;
}

function normalizeCode(value) {
  return String(value || "").toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 12);
}

async function getOrCreateCode(db, kind, ownerId) {
  const existing = await db.query("SELECT code FROM referral_codes WHERE owner_kind = $1 AND owner_id = $2", [kind, ownerId]);
  if (existing.rowCount) return existing.rows[0].code;
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const code = newCode();
    const inserted = await db.query(
      "INSERT INTO referral_codes (code, owner_kind, owner_id) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING RETURNING code",
      [code, kind, ownerId],
    );
    if (inserted.rowCount) return code;
    const again = await db.query("SELECT code FROM referral_codes WHERE owner_kind = $1 AND owner_id = $2", [kind, ownerId]);
    if (again.rowCount) return again.rows[0].code;
  }
  throw new Error("Kód doporučení se nepodařilo vytvořit.");
}

async function resolveCode(db, code) {
  const clean = normalizeCode(code);
  if (!clean) return null;
  const result = await db.query("SELECT code, owner_kind, owner_id FROM referral_codes WHERE code = $1", [clean]);
  return result.rows[0] || null;
}

async function countRewards(db, code) {
  const result = await db.query("SELECT COUNT(*)::integer AS count FROM referrals WHERE code = $1", [code]);
  return result.rows[0].count;
}

// Records that refereeKey joined with code. Returns the recommender or null
// when the code is invalid, belongs to the referee, the referee was already
// referred, or the recommender reached the reward limit.
async function claim(db, { code, refereeKey, refereeKind, refereeId }) {
  const owner = await resolveCode(db, code);
  if (!owner) return null;
  if (owner.owner_kind === refereeKind && owner.owner_id === refereeId) return null;
  if ((await countRewards(db, owner.code)) >= MAX_REWARDS) return null;
  const inserted = await db.query(
    "INSERT INTO referrals (referee_key, code) VALUES ($1, $2) ON CONFLICT DO NOTHING RETURNING code",
    [refereeKey, owner.code],
  );
  return inserted.rowCount ? owner : null;
}

async function wasReferred(db, refereeKey) {
  const result = await db.query("SELECT 1 FROM referrals WHERE referee_key = $1", [refereeKey]);
  return result.rowCount > 0;
}

async function extendStore(db, storeId, days = REFERRAL_DAYS) {
  await db.query(
    `UPDATE generic_stores SET free_until = GREATEST(COALESCE(free_until, NOW()), NOW()) + make_interval(days => $2)
     WHERE id = $1`,
    [storeId, days],
  );
}

async function extendShop(db, shop, days = REFERRAL_DAYS) {
  await db.query(
    `INSERT INTO shop_bonus (shop_hash, free_until) VALUES ($1, NOW() + make_interval(days => $2))
     ON CONFLICT (shop_hash) DO UPDATE SET free_until = GREATEST(shop_bonus.free_until, NOW()) + make_interval(days => $2)`,
    [hash(shop), days],
  );
}

async function shopBonusUntil(db, shop) {
  const result = await db.query("SELECT free_until FROM shop_bonus WHERE shop_hash = $1", [hash(shop)]);
  const until = result.rowCount ? new Date(result.rows[0].free_until) : null;
  return until && until.getTime() > Date.now() ? until : null;
}

module.exports = {
  REFERRAL_DAYS, ensureTables, hash, normalizeCode, getOrCreateCode, resolveCode, countRewards,
  claim, wasReferred, extendStore, extendShop, shopBonusUntil,
};
