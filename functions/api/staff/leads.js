import { db, csvResponse } from '../../../lib/http.js';

export async function onRequestGet({ env }) {
  const { results } = await db(env).prepare(
    `SELECT l.created_at, l.first, l.last, l.email, l.phone, l.note, l.sent_to_crm,
            a.bib, a.first AS a_first, a.last AS a_last, a.age
     FROM leads l LEFT JOIN athletes a ON a.id = l.athlete_id ORDER BY l.id`
  ).all();
  const rows = [['Requested at', 'Contact first', 'Contact last', 'Email', 'Phone', 'Note', 'Sent to GoHighLevel', 'Athlete #', 'Athlete', 'Athlete age']];
  for (const r of results) {
    rows.push([r.created_at, r.first, r.last, r.email, r.phone, r.note, r.sent_to_crm, r.bib,
      r.a_first ? `${r.a_first} ${r.a_last}` : '', r.age]);
  }
  return csvResponse('cider-run-ppi-requests.csv', rows);
}
