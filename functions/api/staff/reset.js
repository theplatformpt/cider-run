import { json, error, db, readJson } from '../../../lib/http.js';
import { mutate } from '../../../lib/board.js';

// Wipes athletes and PPI requests (keeps settings). For clearing test data before the event.
export async function onRequestPost({ request, env }) {
  const body = await readJson(request);
  if (body.confirm !== 'RESET') return error('Type RESET to confirm.');
  const D = db(env);
  await mutate(env, [D.prepare('DELETE FROM leads'), D.prepare('DELETE FROM athletes'),
    D.prepare("DELETE FROM sqlite_sequence WHERE name IN ('athletes','leads')")]);
  return json({ ok: true });
}
