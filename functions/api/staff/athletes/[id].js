import { json, error, db, readJson } from '../../../../lib/http.js';
import { ATHLETE_COLS, mutate } from '../../../../lib/board.js';
import { cleanAthlete, publicAthlete } from '../../../../lib/athletes.js';
import { rebuild } from '../../../../lib/board.js';
import { standingFor } from '../../../../lib/standing.js';

const EDITABLE = ['bib', 'first', 'last', 'sex', 'age', 'email', 'phone', 's1', 's2', 's3', 'j1', 'j2', 'j3', 'mile'];

function idOf(params) {
  const id = Number(params.id);
  return Number.isInteger(id) && id > 0 ? id : null;
}

export async function onRequestGet({ env, params }) {
  const id = idOf(params);
  const row = id && await db(env).prepare(`SELECT ${ATHLETE_COLS} FROM athletes WHERE id = ?`).bind(id).first();
  if (!row) return error('Athlete not found.', 404);
  return json({ athlete: publicAthlete(row) });
}

// Partial update. A sprint station sends {s:[...]}, a jump station {j:[...]}, so two
// stations saving the same athlete at once never overwrite each other's numbers.
export async function onRequestPatch({ request, env, params }) {
  const id = idOf(params);
  if (!id) return error('Athlete not found.', 404);
  const { fields, error: bad } = cleanAthlete(await readJson(request), true);
  if (bad) return error(bad);
  const keys = Object.keys(fields).filter(k => EDITABLE.includes(k));
  if (!keys.length) return error('Nothing to save.');

  const D = db(env);
  const sets = keys.map((k, i) => `${k} = ?${i + 1}`).join(', ');
  const upd = D.prepare(
    `UPDATE athletes SET ${sets}, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = ?${keys.length + 1}`
  ).bind(...keys.map(k => fields[k]), id);
  const [res] = await D.batch([upd, D.prepare('UPDATE snapshot SET rev = rev + 1 WHERE id = 1')]);
  if (!res.meta.changes) return error('Athlete not found. Someone may have deleted them.', 404);
  const { board, rows } = await rebuild(env);
  const row = rows.find(r => r.id === id);
  return json({ athlete: publicAthlete(row), standing: standingFor(board, id) });
}

export async function onRequestDelete({ env, params }) {
  const id = idOf(params);
  if (!id) return error('Athlete not found.', 404);
  const D = db(env);
  await mutate(env, [D.prepare('DELETE FROM athletes WHERE id = ?').bind(id)]);
  return json({ ok: true });
}
