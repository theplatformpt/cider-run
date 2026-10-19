import { db } from './http.js';
import { computeBoard, parseSettings } from './scoring.js';

export const ATHLETE_COLS = 'id, bib, first, last, sex, age, email, phone, token, s1, s2, s3, j1, j2, j3, mile, created_at, updated_at';
export const BUMP = 'UPDATE snapshot SET rev = rev + 1 WHERE id = 1';

export async function loadSettings(env) {
  const { results } = await db(env).prepare('SELECT key, value FROM settings').all();
  return parseSettings(results);
}

// Rebuilds the public snapshot from a consistent read. Two staff saves landing at
// once can finish out of order; the src_rev guard stops an older rebuild from
// overwriting a newer one.
export async function rebuild(env) {
  const D = db(env);
  const [meta, ath, set] = await D.batch([
    D.prepare('SELECT rev FROM snapshot WHERE id = 1'),
    D.prepare(`SELECT ${ATHLETE_COLS} FROM athletes`),
    D.prepare('SELECT key, value FROM settings'),
  ]);
  const rev = meta.results[0]?.rev ?? 0;
  const board = computeBoard(ath.results, parseSettings(set.results), rev);
  const { _byId, ...pub } = board;
  await D.prepare('UPDATE snapshot SET body = ?1, src_rev = ?2 WHERE id = 1 AND src_rev < ?2')
    .bind(JSON.stringify(pub), rev).run();
  return { board, rows: ath.results };
}

// Runs one or more changes plus the revision bump in a single transaction, then rebuilds.
export async function mutate(env, statements) {
  const D = db(env);
  const results = await D.batch([...statements, D.prepare(BUMP)]);
  await rebuild(env);
  return results;
}

export function newToken() {
  const b = crypto.getRandomValues(new Uint8Array(12));
  return [...b].map(x => x.toString(16).padStart(2, '0')).join('');
}
