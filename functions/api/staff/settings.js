import { json, error, db, readJson } from '../../../lib/http.js';
import { loadSettings, mutate } from '../../../lib/board.js';
import { DEFAULT_SETTINGS, groupLabels, validAgeMaxes } from '../../../lib/scoring.js';

export async function onRequestGet({ env }) {
  const s = await loadSettings(env);
  const D = db(env);
  const c = await D.prepare(
    `SELECT COUNT(*) AS athletes,
            SUM(CASE WHEN COALESCE(s1, s2, s3) IS NOT NULL THEN 1 ELSE 0 END) AS sprint,
            SUM(CASE WHEN COALESCE(j1, j2, j3) IS NOT NULL THEN 1 ELSE 0 END) AS jump
     FROM athletes`
  ).first();
  const leads = await D.prepare('SELECT COUNT(*) AS n FROM leads').first();
  return json({
    settings: s,
    groups: groupLabels(s.ageMaxes),
    counts: { athletes: c.athletes || 0, sprint: c.sprint || 0, jump: c.jump || 0, leads: leads.n || 0 },
    crm: !!(env.GHL_API_KEY && env.GHL_LOCATION_ID),
  });
}

export async function onRequestPut({ request, env }) {
  const body = await readJson(request);
  const out = {};
  if ('event' in body) {
    const v = String(body.event || '').trim();
    if (!v || v.length > 60) return error('Event name must be 1–60 characters.');
    out.event = v;
  }
  if ('title' in body) {
    const v = String(body.title || '').trim();
    if (!v || v.length > 40) return error('Contest name must be 1–40 characters.');
    out.title = v;
  }
  if ('sprintYards' in body) {
    const v = Number(body.sprintYards);
    if (!Number.isInteger(v) || v < 5 || v > 100) return error('Sprint distance must be 5–100 yards.');
    out.sprintYards = v;
  }
  if ('ageMaxes' in body) {
    if (!validAgeMaxes(body.ageMaxes)) return error('Age groups must be rising whole numbers, e.g. 10, 13, 17, 34, 49.');
    out.ageMaxes = body.ageMaxes;
  }
  if ('boardOpen' in body) out.boardOpen = !!body.boardOpen;
  if ('ppiUrl' in body) {
    const v = String(body.ppiUrl || '').trim();
    if (v && !/^https:\/\/[^\s]+$/.test(v)) return error('Booking link must start with https://');
    out.ppiUrl = v;
  }
  const keys = Object.keys(out).filter(k => k in DEFAULT_SETTINGS);
  if (!keys.length) return error('Nothing to save.');
  const D = db(env);
  await mutate(env, keys.map(k =>
    D.prepare('INSERT INTO settings (key, value) VALUES (?1, ?2) ON CONFLICT(key) DO UPDATE SET value = ?2').bind(k, JSON.stringify(out[k]))
  ));
  return onRequestGet({ env });
}
