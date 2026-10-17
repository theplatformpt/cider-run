import { json, error, db } from '../../../lib/http.js';
import { divisionSizes } from '../../../lib/scoring.js';

// An athlete's own results card. The token is the private part of their link.
export async function onRequestGet({ env, params }) {
  const token = String(params.token || '');
  if (!/^[a-f0-9]{24}$/.test(token)) return error('Results link not found.', 404);
  const D = db(env);
  const [a, snap] = await D.batch([
    D.prepare('SELECT bib, first, last, s1, s2, s3, j1, j2, j3 FROM athletes WHERE token = ?').bind(token),
    D.prepare('SELECT body FROM snapshot WHERE id = 1'),
  ]);
  const row = a.results[0];
  if (!row) return error('Results link not found.', 404);
  const board = JSON.parse(snap.results[0]?.body || '{}');
  const me = (board.rows || []).find(r => r.b === row.bib);
  const size = me ? (divisionSizes(board.rows)[me.g + me.x] || {}) : {};
  return json({
    event: board.event, title: board.title, yards: board.yards, open: board.open, ppiUrl: board.ppiUrl || '',
    at: board.at,
    athlete: {
      name: `${row.first} ${row.last ? row.last[0].toUpperCase() + '.' : ''}`.trim(),
      first: row.first,
      bib: row.bib,
      division: me ? `${me.x === 'M' ? 'Male' : 'Female'} ${board.groups[me.g]}` : '',
      sprint: { trials: [row.s1, row.s2, row.s3], best: me?.s ?? null, place: me?.sr ?? null, of: size.s || 0, pct: me?.sp ?? null },
      jump:   { trials: [row.j1, row.j2, row.j3], best: me?.j ?? null, place: me?.jr ?? null, of: size.j || 0, pct: me?.jp ?? null },
      overall: { score: me?.o ?? null, place: me?.or ?? null, of: size.o || 0 },
    },
  });
}
