import { error, isTrustedWrite } from '../../../lib/http.js';
import { isStaff } from '../../../lib/auth.js';

export async function onRequest(ctx) {
  const { request, env } = ctx;
  if (!(await isStaff(request, env))) return error('Your staff session ended. Log in again.', 401);
  if (request.method !== 'GET' && !isTrustedWrite(request)) return error('Bad request', 400);
  try {
    return await ctx.next();
  } catch (e) {
    const msg = String(e && e.message || e);
    if (/UNIQUE constraint failed: athletes\.bib/.test(msg)) return error('That bib number is already taken.', 409);
    return error(msg, 500);
  }
}
