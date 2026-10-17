import { json, error, isTrustedWrite, readJson } from '../../lib/http.js';
import { checkPasscode, passcodeConfigured, makeSessionCookie, isLockedOut, recordFailure, clearFailures, isStaff } from '../../lib/auth.js';

export async function onRequestGet({ request, env }) {
  return json({ staff: await isStaff(request, env), configured: passcodeConfigured(env) });
}

export async function onRequestPost({ request, env }) {
  if (!isTrustedWrite(request)) return error('Bad request', 400);
  if (!passcodeConfigured(env)) return error('Staff login is not set up yet. Add STAFF_PASSCODE (8+ characters) in Cloudflare and redeploy.', 503);
  try {
    if (await isLockedOut(request, env)) return error('Too many wrong passcodes. Try again in 15 minutes.', 429);
    const body = await readJson(request);
    if (!checkPasscode(env, body.passcode)) {
      await recordFailure(request, env);
      return error('That passcode is not right.', 401);
    }
    await clearFailures(request, env);
    return json({ ok: true }, 200, { 'Set-Cookie': await makeSessionCookie(env, request) });
  } catch (e) {
    return error(e.message, 503);
  }
}
