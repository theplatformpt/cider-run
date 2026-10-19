// Shared helpers for the public pages and the staff site.
export const $ = (s, el = document) => el.querySelector(s);
export const $$ = (s, el = document) => [...el.querySelectorAll(s)];

export function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

export function ordinal(n) {
  if (n === null || n === undefined) return '';
  const s = ['th', 'st', 'nd', 'rd'], v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}

export const fmtS = v => (v === null || v === undefined ? '' : Number(v).toFixed(2));
export const fmtJ = v => (v === null || v === undefined ? '' : Number(v).toFixed(1));
export const fmtM = v => {
  if (v === null || v === undefined) return '';
  const t = Math.round(v), m = Math.floor(t / 60), s = t % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
};
// Staff typing a mile time: "7:42", "7.42" (minutes.seconds) or "742" all mean 7:42.
// Returns seconds, null for blank, or NaN when it can't be read.
export function parseMile(raw) {
  const v = String(raw ?? '').trim();
  if (!v) return null;
  let m, s;
  let x = v.match(/^(\d{1,2})\s*[:.,;']\s*(\d{1,2})$/);
  if (x) { if (x[2].length !== 2) return NaN; m = +x[1]; s = +x[2]; }   // "7.5" is ambiguous (7:05? 7:30? 7:50?), so seconds need 2 digits
  else if (/^\d{3,4}$/.test(v)) { m = +v.slice(0, -2); s = +v.slice(-2); }
  else return NaN;
  if (s > 59) return NaN;
  return m * 60 + s;
}
export const fmtO = v => (v === null || v === undefined ? '' : Number(v).toFixed(1));

export function ago(iso) {
  const s = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 1000));
  if (s < 10) return 'just now';
  if (s < 60) return `${s}s ago`;
  const m = Math.round(s / 60);
  if (m < 60) return `${m} min ago`;
  return `${Math.round(m / 60)} h ago`;
}

export async function api(path, { method = 'GET', body } = {}) {
  const opt = { method, headers: { Accept: 'application/json' }, credentials: 'same-origin' };
  if (body !== undefined) {
    opt.headers['Content-Type'] = 'application/json';
    opt.headers['X-Requested-With'] = 'cider-run';
    opt.body = JSON.stringify(body);
  }
  let res;
  try { res = await fetch(path, opt); } catch { throw Object.assign(new Error('No connection. Check the wifi and try again.'), { status: 0 }); }
  if (res.status === 204) return null;
  let data = {};
  try { data = await res.json(); } catch { /* not json */ }
  if (!res.ok) throw Object.assign(new Error(data.error || `Something went wrong (${res.status}).`), { status: res.status });
  return data;
}

export function toast(msg, ms = 2600) {
  let t = $('#toast');
  if (!t) { t = document.createElement('div'); t.id = 'toast'; t.className = 'toast'; t.setAttribute('role', 'status'); document.body.append(t); }
  t.textContent = msg; t.hidden = false;
  clearTimeout(toast._t); toast._t = setTimeout(() => { t.hidden = true; }, ms);
}

// Polls fn every `ms` while the page is visible; runs immediately when it becomes visible again.
export function poll(fn, ms) {
  let timer = null;
  const tick = async () => { clearTimeout(timer); try { await fn(); } finally { if (!document.hidden) timer = setTimeout(tick, ms); } };
  document.addEventListener('visibilitychange', () => { if (!document.hidden) tick(); else clearTimeout(timer); });
  tick();
  return { now: tick };
}

export function qrSvg(text, { margin = 2, dark = '#3A1B0F', light = '#FFFAF0' } = {}) {
  /* global qrcode */
  const q = qrcode(0, 'M'); q.addData(text); q.make();
  const n = q.getModuleCount(), size = n + margin * 2;
  let d = '';
  for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) if (q.isDark(r, c)) d += `M${c + margin} ${r + margin}h1v1h-1z`;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}" shape-rendering="crispEdges" role="img" aria-label="QR code for ${esc(text)}"><rect width="${size}" height="${size}" fill="${light}"/><path d="${d}" fill="${dark}"/></svg>`;
}

export const SEARCH_ICON = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg>';
