import { db, csvResponse } from '../../../lib/http.js';
import { ATHLETE_COLS, loadSettings } from '../../../lib/board.js';
import { computeBoard, fmtMile } from '../../../lib/scoring.js';

// Every athlete with every trial, best marks, division and placings.
// Open in Excel/Sheets, or import into Airtable (PPI) or GoHighLevel after the event.
export async function onRequestGet({ request, env }) {
  const { results } = await db(env).prepare(`SELECT ${ATHLETE_COLS} FROM athletes ORDER BY bib`).all();
  const s = await loadSettings(env);
  const board = computeBoard(results, s, 0);
  const u = new URL(request.url);
  const origin = u.hostname.endsWith('.pages.dev') || u.hostname === '127.0.0.1' || u.hostname === 'localhost'
    ? `https://${env.CANONICAL_HOST && env.CANONICAL_HOST !== 'off' ? env.CANONICAL_HOST : 'cider.theplatformpt.com'}` : u.origin;
  const y = s.sprintYards;
  const rows = [[
    'Athlete #', 'First', 'Last', 'Sex', 'Age', 'Age group', 'Email', 'Phone',
    `${y} yd trial 1 (s)`, `${y} yd trial 2 (s)`, `${y} yd trial 3 (s)`, `Best ${y} yd (s)`, 'Sprint place', 'Sprint percentile',
    'Jump trial 1 (in)', 'Jump trial 2 (in)', 'Jump trial 3 (in)', 'Best jump (in)', 'Jump place', 'Jump percentile',
    'Overall score', 'Overall place', 'Mile time', 'Mile (seconds)', 'Mile place', 'Results link', 'Checked in',
  ]];
  for (const r of results) {
    const b = board.rows[board._byId[r.id]];
    rows.push([
      r.bib, r.first, r.last, r.sex === 'M' ? 'Male' : 'Female', r.age, board.groups[b.g], r.email, r.phone,
      r.s1, r.s2, r.s3, b.s, b.sr, b.sp,
      r.j1, r.j2, r.j3, b.j, b.jr, b.jp,
      b.o, b.or, fmtMile(r.mile), r.mile, b.mr, `${origin}/r/${r.token}`, r.created_at,
    ]);
  }
  return csvResponse('cider-run-results.csv', rows);
}
