import { json, error, db, readJson } from '../../../../lib/http.js';
import { ATHLETE_COLS, mutate, rebuild, newToken } from '../../../../lib/board.js';
import { cleanAthlete, publicAthlete } from '../../../../lib/athletes.js';
import { standingFor } from '../../../../lib/standing.js';

export async function onRequestGet({ env }) {
  const { results } = await db(env).prepare(`SELECT ${ATHLETE_COLS} FROM athletes ORDER BY bib`).all();
  const next = results.reduce((m, r) => Math.max(m, r.bib), 0) + 1;
  return json({ athletes: results.map(publicAthlete), nextBib: next });
}

export async function onRequestPost({ request, env }) {
  const body = await readJson(request);
  const { fields, error: bad } = cleanAthlete(body, false);
  if (bad) return error(bad);
  const D = db(env);

  const dup = await D.prepare(
    'SELECT bib FROM athletes WHERE lower(first) = lower(?1) AND lower(last) = lower(?2) AND age = ?3'
  ).bind(fields.first, fields.last, fields.age).first();
  if (dup && !body.allowDuplicate) {
    return error(`${fields.first} ${fields.last} (age ${fields.age}) is already checked in as bib ${dup.bib}.`, 409);
  }

  const token = newToken();
  const bibSql = fields.bib ? '?1' : '(SELECT COALESCE(MAX(bib), 0) + 1 FROM athletes)';
  const stmt = D.prepare(
    `INSERT INTO athletes (bib, first, last, sex, age, email, phone, token, s1, s2, s3, j1, j2, j3)
     VALUES (${bibSql}, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14)`
  ).bind(fields.bib ?? null, fields.first, fields.last, fields.sex, fields.age, fields.email ?? null, fields.phone ?? null, token,
    fields.s1 ?? null, fields.s2 ?? null, fields.s3 ?? null, fields.j1 ?? null, fields.j2 ?? null, fields.j3 ?? null);
  await D.batch([stmt, D.prepare('UPDATE snapshot SET rev = rev + 1 WHERE id = 1')]);
  const row = await D.prepare(`SELECT ${ATHLETE_COLS} FROM athletes WHERE token = ?`).bind(token).first();
  const { board } = await rebuild(env);
  return json({ athlete: publicAthlete(row), standing: standingFor(board, row.id) }, 201);
}

// Used by staff import: adds many athletes at once, skipping duplicates and bad rows.
export async function onRequestPut({ request, env }) {
  const body = await readJson(request);
  const list = Array.isArray(body.athletes) ? body.athletes : [];
  if (!list.length) return error('No athletes in the file.');
  if (list.length > 2000) return error('That file has more than 2,000 rows.');
  const D = db(env);
  const { results: existing } = await D.prepare('SELECT first, last, age, bib, email FROM athletes').all();
  const seen = new Set(existing.map(r => `${r.first.toLowerCase()}|${r.last.toLowerCase()}|${r.age}`));
  const bibs = new Set(existing.map(r => r.bib));
  let nextBib = existing.reduce((m, r) => Math.max(m, r.bib), 0) + 1;

  const skipped = [], stmts = [];
  list.forEach((raw, i) => {
    const { fields, error: bad } = cleanAthlete(raw, false);
    if (bad) { skipped.push({ row: i + 2, reason: bad }); return; }
    const key = `${fields.first.toLowerCase()}|${fields.last.toLowerCase()}|${fields.age}`;
    if (seen.has(key)) { skipped.push({ row: i + 2, reason: `${fields.first} ${fields.last} is already on the list.` }); return; }
    if (fields.bib && bibs.has(fields.bib)) { skipped.push({ row: i + 2, reason: `Bib ${fields.bib} is already taken.` }); return; }
    seen.add(key);
    let bib = fields.bib;
    if (!bib) { while (bibs.has(nextBib)) nextBib++; bib = nextBib++; }
    bibs.add(bib);
    stmts.push(D.prepare(
      'INSERT INTO athletes (bib, first, last, sex, age, email, phone, token) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
    ).bind(bib, fields.first, fields.last, fields.sex, fields.age, fields.email ?? null, fields.phone ?? null, newToken()));
  });

  for (let i = 0; i < stmts.length; i += 80) {
    const chunk = stmts.slice(i, i + 80);
    await D.batch([...chunk, D.prepare('UPDATE snapshot SET rev = rev + 1 WHERE id = 1')]);
  }
  if (stmts.length) await rebuild(env);
  return json({ added: stmts.length, skipped });
}
