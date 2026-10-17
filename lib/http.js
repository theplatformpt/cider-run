export function json(data, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...extraHeaders },
  });
}

export function error(message, status = 400) {
  return json({ error: message }, status);
}

// Every state-changing request must be JSON and carry this header. Browsers
// won't send it cross-site without a preflight, which this API never allows.
export function isTrustedWrite(request) {
  const ct = request.headers.get('Content-Type') || '';
  return ct.startsWith('application/json') && request.headers.get('X-Requested-With') === 'cider-run';
}

export async function readJson(request) {
  try { return await request.json(); } catch { return {}; }
}

export function db(env) {
  if (!env.DB) throw new Error('The DB database binding is not set up in Cloudflare (Settings > Bindings > D1 database, variable name DB).');
  return env.DB;
}

export function ipOf(request) {
  return request.headers.get('CF-Connecting-IP') || 'local';
}

export function csvCell(v) {
  if (v === null || v === undefined) return '';
  const s = String(v);
  // Neutralise spreadsheet formulas, then quote.
  const safe = /^[=+\-@\t\r]/.test(s) && !/^-?\d+(\.\d+)?$/.test(s) ? "'" + s : s;
  return /[",\n\r]/.test(safe) ? '"' + safe.replace(/"/g, '""') + '"' : safe;
}

export function csv(rows) {
  return rows.map(r => r.map(csvCell).join(',')).join('\r\n') + '\r\n';
}

export function csvResponse(name, rows) {
  return new Response('﻿' + csv(rows), {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${name}"`,
      'Cache-Control': 'no-store',
    },
  });
}
