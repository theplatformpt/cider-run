import { db, error } from '../../lib/http.js';
import { rebuild } from '../../lib/board.js';

// Public leaderboard. One row read per request. Phones send ?v=<rev> and get a
// tiny 204 when nothing has changed.
export async function onRequestGet({ request, env }) {
  try {
    const D = db(env);
    let row = await D.prepare('SELECT src_rev, body FROM snapshot WHERE id = 1').first();
    if (!row || row.src_rev < 0) {
      await rebuild(env);
      row = await D.prepare('SELECT src_rev, body FROM snapshot WHERE id = 1').first();
    }
    const v = new URL(request.url).searchParams.get('v');
    const headers = { 'Cache-Control': 'no-store', 'X-Board-Rev': String(row.src_rev) };
    if (v !== null && Number(v) === row.src_rev) return new Response(null, { status: 204, headers });

    let body = row.body;
    const parsed = JSON.parse(body);
    if (!parsed.open) { parsed.rows = []; body = JSON.stringify(parsed); }
    return new Response(body, { headers: { ...headers, 'Content-Type': 'application/json; charset=utf-8' } });
  } catch (e) {
    return error(e.message || 'Leaderboard unavailable', 503);
  }
}
