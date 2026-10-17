import { json, error, db, readJson, isTrustedWrite } from '../../lib/http.js';
import { sendToGhl } from '../../lib/ghl.js';

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const clip = (v, n) => String(v ?? '').replace(/\s+/g, ' ').trim().slice(0, n);

// "Book a PPI session" form on an athlete's results card.
export async function onRequestPost({ request, env, waitUntil }) {
  if (!isTrustedWrite(request)) return error('Bad request', 400);
  const b = await readJson(request);
  if (b.website) return json({ ok: true }); // honeypot: bots fill hidden fields

  const lead = {
    first: clip(b.first, 40), last: clip(b.last, 40), email: clip(b.email, 120).toLowerCase(),
    phone: String(b.phone || '').replace(/\D/g, '').slice(0, 15), note: clip(b.note, 300),
  };
  if (!lead.first) return error('Enter your first name.');
  if (!EMAIL.test(lead.email)) return error('Enter a valid email.');
  if (lead.phone && lead.phone.length < 10) return error('Enter a 10-digit phone number, or leave it blank.');
  if (!b.consent) return error('Check the box so we can contact you.');

  const D = db(env);
  const token = String(b.token || '');
  const a = /^[a-f0-9]{24}$/.test(token)
    ? await D.prepare('SELECT id, bib, first, last, age, s1, s2, s3, j1, j2, j3 FROM athletes WHERE token = ?').bind(token).first()
    : null;
  if (!a) return error('Results link not found.', 404);

  const recent = await D.prepare(
    "SELECT COUNT(*) AS n FROM leads WHERE athlete_id = ? AND created_at > strftime('%Y-%m-%dT%H:%M:%fZ','now','-1 day')"
  ).bind(a.id).first();
  if (recent.n >= 3) return json({ ok: true, duplicate: true });

  const ins = await D.prepare(
    'INSERT INTO leads (athlete_id, first, last, email, phone, note, sent_to_crm) VALUES (?, ?, ?, ?, ?, ?, ?)'
  ).bind(a.id, lead.first, lead.last || null, lead.email, lead.phone || null, lead.note || null, 'pending').run();

  const bestS = [a.s1, a.s2, a.s3].filter(v => v !== null);
  const bestJ = [a.j1, a.j2, a.j3].filter(v => v !== null);
  const summary = [
    `Cider Run Jump & Speed Contest: PPI session request.`,
    `Athlete: ${a.first} ${a.last}, age ${a.age}, bib ${a.bib}.`,
    `Best sprint: ${bestS.length ? Math.min(...bestS).toFixed(2) + ' s' : 'not tested'}. Best jump: ${bestJ.length ? Math.max(...bestJ).toFixed(1) + ' in' : 'not tested'}.`,
    lead.note ? `Note: ${lead.note}` : '',
  ].filter(Boolean).join('\n');

  const send = sendToGhl(env, lead, summary).then(status =>
    D.prepare('UPDATE leads SET sent_to_crm = ? WHERE id = ?').bind(status, ins.meta.last_row_id).run());
  if (waitUntil) waitUntil(send); else await send;
  return json({ ok: true });
}
