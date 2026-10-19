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

async function migrate(env) {
  if (!env.DB) return;
  for (const m of MIGRATIONS) {
    try { await env.DB.prepare(m.check).all(); }
    catch {
      try { await env.DB.prepare(m.fix).run(); }
      catch (e) { if (!/duplicate column/i.test(String(e && e.message))) throw e; }
    }
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
