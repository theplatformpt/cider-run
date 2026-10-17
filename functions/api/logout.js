import { json } from '../../lib/http.js';
import { clearSessionCookie } from '../../lib/auth.js';

export async function onRequestPost() {
  return json({ ok: true }, 200, { 'Set-Cookie': clearSessionCookie() });
}
