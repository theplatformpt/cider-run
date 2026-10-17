import { cleanTrial } from './scoring.js';

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

function cleanName(v, label) {
  const s = String(v ?? '').replace(/\s+/g, ' ').trim();
  if (!s) return { error: `${label} is required.` };
  if (s.length > 40) return { error: `${label} is too long.` };
  return { value: s };
}

// Validates athlete fields. partial=true checks only the keys present.
// Returns { fields } or { error }.
export function cleanAthlete(input, partial = false) {
  const out = {};
  const has = k => !partial || Object.prototype.hasOwnProperty.call(input, k);

  for (const [k, label] of [['first', 'First name'], ['last', 'Last name']]) {
    if (!has(k)) continue;
    const r = cleanName(input[k], label);
    if (r.error) return { error: r.error };
    out[k] = r.value;
  }
  if (has('sex')) {
    const s = String(input.sex || '').toUpperCase();
    if (s !== 'M' && s !== 'F') return { error: 'Pick male or female (it sets the leaderboard division).' };
    out.sex = s;
  }
  if (has('age')) {
    const a = Number(input.age);
    if (!Number.isInteger(a) || a < 2 || a > 110) return { error: 'Age must be a whole number of years.' };
    out.age = a;
  }
  if (has('email')) {
    const e = String(input.email || '').trim().toLowerCase();
    if (e && (!EMAIL.test(e) || e.length > 120)) return { error: `"${e}" doesn't look like an email.` };
    out.email = e || null;
  }
  if (has('phone')) {
    const p = String(input.phone || '').trim();
    const digits = p.replace(/\D/g, '');
    if (p && (digits.length < 10 || digits.length > 15)) return { error: 'Phone needs 10 digits, or leave it blank.' };
    out.phone = p ? digits : null;
  }
  if (has('bib') && input.bib !== '' && input.bib !== null && input.bib !== undefined) {
    const b = Number(input.bib);
    if (!Number.isInteger(b) || b < 1 || b > 99999) return { error: 'Bib must be a whole number.' };
    out.bib = b;
  }
  for (const [key, test, cols] of [['s', 'sprint', ['s1', 's2', 's3']], ['j', 'jump', ['j1', 'j2', 'j3']]]) {
    if (!Object.prototype.hasOwnProperty.call(input, key)) continue;
    const arr = Array.isArray(input[key]) ? input[key] : [];
    for (let i = 0; i < 3; i++) {
      const r = cleanTrial(arr[i], test);
      if (r.error) return { error: `${test === 'sprint' ? 'Sprint' : 'Jump'} trial ${i + 1}: ${r.error}` };
      out[cols[i]] = r.value;
    }
  }
  return { fields: out };
}

export function publicAthlete(r) {
  return {
    id: r.id, bib: r.bib, first: r.first, last: r.last, sex: r.sex, age: r.age,
    email: r.email, phone: r.phone, token: r.token,
    s: [r.s1, r.s2, r.s3], j: [r.j1, r.j2, r.j3], updated_at: r.updated_at,
  };
}
