import { db, ipOf } from './http.js';

const COOKIE = 'cider_staff';
const SESSION_HOURS = 14;
const enc = new TextEncoder();

function b64url(bytes) {
  let s = '';
  for (const b of new Uint8Array(bytes)) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

async function hmacKey(env) {
  const secret = (env.SESSION_SECRET || '') + '|' + (env.STAFF_PASSCODE || '');
  return crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
}

async function sign(env, payload) {
  return b64url(await crypto.subtle.sign('HMAC', await hmacKey(env), enc.encode(payload)));
}

function safeEqual(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  const ab = enc.encode(a), bb = enc.encode(b);
  let diff = ab.length ^ bb.length;
  for (let i = 0; i < Math.max(ab.length, bb.length); i++) diff |= (ab[i] || 0) ^ (bb[i] || 0);
  return diff === 0;
}

export function passcodeConfigured(env) {
  return typeof env.STAFF_PASSCODE === 'string' && env.STAFF_PASSCODE.length >= 8;
}

export function checkPasscode(env, given) {
  return passcodeConfigured(env) && safeEqual(String(given || ''), env.STAFF_PASSCODE);
}

export async function makeSessionCookie(env, request) {
  const exp = Date.now() + SESSION_HOURS * 3600e3;
  const payload = `v1.${exp}`;
  const secure = new URL(request.url).protocol === 'https:' ? ' Secure;' : '';
  return `${COOKIE}=${payload}.${await sign(env, payload)}; Path=/; HttpOnly;${secure} SameSite=Strict; Max-Age=${SESSION_HOURS * 3600}`;
}

export function clearSessionCookie() {
  return `${COOKIE}=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0`;
}

export async function isStaff(request, env) {
  if (!passcodeConfigured(env)) return false;
  const raw = (request.headers.get('Cookie') || '').split(/;\s*/).find(c => c.startsWith(COOKIE + '='));
  if (!raw) return false;
  const parts = raw.slice(COOKIE.length + 1).split('.');
  if (parts.length !== 3 || parts[0] !== 'v1') return false;
  const exp = Number(parts[1]);
  if (!Number.isFinite(exp) || exp < Date.now()) return false;
  return safeEqual(parts[2], await sign(env, `v1.${parts[1]}`));
}

// 8 wrong passcodes from one address locks it for 15 minutes.
const MAX_FAILS = 8;
const LOCK_MS = 15 * 60e3;

export async function isLockedOut(request, env) {
  const row = await db(env).prepare('SELECT n, until FROM login_fails WHERE ip = ?').bind(ipOf(request)).first();
  return !!row && row.until > Date.now() && row.n >= MAX_FAILS;
}

export async function recordFailure(request, env) {
  const now = Date.now();
  await db(env).prepare(
    `INSERT INTO login_fails (ip, n, until) VALUES (?1, 1, ?2)
     ON CONFLICT(ip) DO UPDATE SET n = CASE WHEN until < ?3 THEN 1 ELSE n + 1 END, until = ?2`
  ).bind(ipOf(request), now + LOCK_MS, now).run();
}

export async function clearFailures(request, env) {
  await db(env).prepare('DELETE FROM login_fails WHERE ip = ?').bind(ipOf(request)).run();
}
