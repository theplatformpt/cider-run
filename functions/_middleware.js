// Runs before every request.
// 1. Sends every visit to the event's own address, so links, QR codes and
//    results cards always say cider.theplatformpt.com, never *.pages.dev.
//    Set CANONICAL_HOST in Cloudflare to change the address; "off" disables it.
// 2. Brings an older database up to date (adds columns added after setup),
//    so nobody has to run SQL in the Cloudflare console after an update.
const DEFAULT_HOST = 'cider.theplatformpt.com';

const MIGRATIONS = [
  { check: 'SELECT mile FROM athletes LIMIT 0', fix: 'ALTER TABLE athletes ADD COLUMN mile REAL' },
];
let migrated = null;

// Schema 2: sex and age may be blank, so people can be pre-registered by name
// and give their age and sex when they arrive. SQLite can't relax NOT NULL in
// place, so the table is copied into a new one inside a single transaction.
const ATHLETES_V2 = `CREATE TABLE athletes_v2 (id INTEGER PRIMARY KEY AUTOINCREMENT, bib INTEGER NOT NULL UNIQUE, first TEXT NOT NULL, last TEXT NOT NULL, sex TEXT CHECK (sex IS NULL OR sex IN ('M','F')), age INTEGER CHECK (age IS NULL OR age BETWEEN 2 AND 110), email TEXT, phone TEXT, token TEXT NOT NULL UNIQUE, s1 REAL, s2 REAL, s3 REAL, j1 REAL, j2 REAL, j3 REAL, mile REAL, created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')), updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')))`;
const COLS = 'id, bib, first, last, sex, age, email, phone, token, s1, s2, s3, j1, j2, j3, mile, created_at, updated_at';

async function migrate(env) {
  if (!env.DB) return;
  const D = env.DB;
  for (const m of MIGRATIONS) {
    try { await D.prepare(m.check).all(); }
    catch {
      try { await D.prepare(m.fix).run(); }
      catch (e) { if (!/duplicate column/i.test(String(e && e.message))) throw e; }
    }
  }
  const v = await D.prepare("SELECT value FROM settings WHERE key = 'schema'").first();
  if (Number(v?.value || 1) < 2) {
    await D.batch([
      D.prepare('DROP TABLE IF EXISTS athletes_v2'),
      D.prepare(ATHLETES_V2),
      D.prepare(`INSERT INTO athletes_v2 (${COLS}) SELECT ${COLS} FROM athletes`),
      D.prepare('DROP TABLE athletes'),
      D.prepare('ALTER TABLE athletes_v2 RENAME TO athletes'),
      D.prepare("INSERT INTO settings (key, value) VALUES ('schema', '2') ON CONFLICT(key) DO UPDATE SET value = '2'"),
    ]);
  }
}

export async function onRequest({ request, env, next }) {
  const host = (env.CANONICAL_HOST || DEFAULT_HOST).trim();
  const url = new URL(request.url);
  if (host !== 'off' && url.hostname.endsWith('.pages.dev')) {
    url.hostname = host; url.protocol = 'https:'; url.port = '';
    return Response.redirect(url.toString(), 301);
  }
  if (url.pathname.startsWith('/api/')) {
    if (!migrated) migrated = migrate(env).catch(e => { migrated = null; throw e; });
    try { await migrated; } catch (e) {
      return new Response(JSON.stringify({ error: 'Database update failed: ' + (e.message || e) }), { status: 503, headers: { 'Content-Type': 'application/json' } });
    }
  }
  return next();
}
