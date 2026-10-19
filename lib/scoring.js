// Leaderboard math. Pure functions, no database access, so they can be tested alone.

export const DEFAULT_SETTINGS = {
  event: '1st Annual Platform Cider Run',
  title: 'Jump & Speed Contest',
  sprintYards: 40,
  ageMaxes: [10, 13, 17, 34, 49],   // groups: 10 & under, 11–13, 14–17, 18–34, 35–49, 50+
  boardOpen: true,
  ppiUrl: '',                         // optional link for the "book a PPI session" button instead of the form
};

// Hard limits: anything outside these is a typo, not a result.
export const LIMITS = {
  sprint: { min: 2.0, max: 30.0, unit: 's', decimals: 2 },
  jump:   { min: 1.0, max: 60.0, unit: 'in', decimals: 1 },
  mile:   { min: 180, max: 3600, unit: 's', decimals: 0 },   // 3:00 to 60:00, stored in seconds
};

export function fmtMile(sec) {
  if (sec === null || sec === undefined) return '';
  const t = Math.round(sec), m = Math.floor(t / 60), s = t % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

export function parseSettings(rows) {
  const s = { ...DEFAULT_SETTINGS };
  for (const { key, value } of rows || []) {
    try { if (key in s) s[key] = JSON.parse(value); } catch { /* keep default */ }
  }
  return s;
}

export function groupLabels(maxes) {
  const labels = [];
  let lo = null;
  maxes.forEach((m, i) => {
    labels.push(i === 0 ? `${m} & under` : `${lo}–${m}`);
    lo = m + 1;
  });
  labels.push(`${lo === null ? 0 : lo}+`);
  return labels;
}

export function groupIndex(age, maxes) {
  for (let i = 0; i < maxes.length; i++) if (age <= maxes[i]) return i;
  return maxes.length;
}

export function validAgeMaxes(list) {
  if (!Array.isArray(list) || list.length < 1 || list.length > 12) return false;
  for (let i = 0; i < list.length; i++) {
    if (!Number.isInteger(list[i]) || list[i] < 3 || list[i] > 99) return false;
    if (i && list[i] <= list[i - 1]) return false;
  }
  return true;
}

export function best(values, lowerIsBetter) {
  const v = values.filter(x => typeof x === 'number' && Number.isFinite(x));
  if (!v.length) return null;
  return lowerIsBetter ? Math.min(...v) : Math.max(...v);
}

export function displayName(first, last) {
  const f = String(first || '').trim();
  const l = String(last || '').trim();
  return l ? `${f} ${l[0].toUpperCase()}.` : f;
}

// Competition ranking (1, 2, 2, 4) and mid-rank percentile within one division.
// Percentile = share of the other athletes in the division you beat, ties count half.
// A division of one gets 100.
function rankAndPercentile(items, key, lowerIsBetter) {
  const have = items.filter(it => it[key] !== null);
  const n = have.length;
  for (const it of have) {
    let better = 0, worse = 0, tied = 0;
    for (const o of have) {
      if (o === it) continue;
      if (o[key] === it[key]) tied++;
      else if (lowerIsBetter ? o[key] < it[key] : o[key] > it[key]) better++;
      else worse++;
    }
    it[key + 'Rank'] = better + 1;
    it[key + 'Pct'] = n === 1 ? 100 : Math.round(((worse + 0.5 * tied) / (n - 1)) * 1000) / 10;
  }
}

// rows: athlete rows from the database. Returns the public snapshot.
export function computeBoard(rows, settings, rev) {
  const labels = groupLabels(settings.ageMaxes);
  const items = rows.map(r => ({
    id: r.id,
    n: displayName(r.first, r.last),
    b: r.bib,
    x: r.sex,
    g: groupIndex(r.age, settings.ageMaxes),
    s: best([r.s1, r.s2, r.s3], true),
    j: best([r.j1, r.j2, r.j3], false),
    m: typeof r.mile === 'number' && Number.isFinite(r.mile) ? r.mile : null,
    sTrials: [r.s1, r.s2, r.s3].filter(v => v !== null && v !== undefined).length,
    jTrials: [r.j1, r.j2, r.j3].filter(v => v !== null && v !== undefined).length,
  }));

  const divisions = new Map();
  for (const it of items) {
    const k = it.g + it.x;
    if (!divisions.has(k)) divisions.set(k, []);
    divisions.get(k).push(it);
  }
  for (const div of divisions.values()) {
    rankAndPercentile(div, 's', true);
    rankAndPercentile(div, 'j', false);
    rankAndPercentile(div, 'm', true);
    for (const it of div) {
      it.o = it.s !== null && it.j !== null ? Math.round(((it.sPct + it.jPct) / 2) * 10) / 10 : null;
    }
    rankAndPercentile(div, 'o', false);
  }

  return {
    rev,
    at: new Date().toISOString(),
    event: settings.event,
    title: settings.title,
    yards: settings.sprintYards,
    open: settings.boardOpen,
    ppiUrl: settings.ppiUrl || '',
    groups: labels,
    counts: {
      athletes: items.length,
      sprint: items.filter(i => i.s !== null).length,
      jump: items.filter(i => i.j !== null).length,
      mile: items.filter(i => i.m !== null).length,
    },
    rows: items.map(it => ({
      n: it.n, b: it.b, x: it.x, g: it.g,
      s: it.s, sr: it.sRank ?? null, sp: it.sPct ?? null,
      j: it.j, jr: it.jRank ?? null, jp: it.jPct ?? null,
      o: it.o, or: it.oRank ?? null,
      m: it.m, mr: it.mRank ?? null,
    })),
    _byId: Object.fromEntries(items.map((it, i) => [it.id, i])),
  };
}

export function divisionSizes(rows) {
  const sizes = {};
  for (const r of rows) {
    const k = r.g + r.x;
    sizes[k] = sizes[k] || { s: 0, j: 0, o: 0, m: 0 };
    if (r.s !== null) sizes[k].s++;
    if (r.j !== null) sizes[k].j++;
    if (r.o !== null) sizes[k].o++;
    if (r.m !== null && r.m !== undefined) sizes[k].m++;
  }
  return sizes;
}

// Normalises a trial value from staff input. Returns {value} or {error}.
export function cleanTrial(raw, test) {
  if (raw === null || raw === undefined || raw === '') return { value: null };
  const n = Number(String(raw).replace(',', '.'));
  const lim = LIMITS[test];
  if (!Number.isFinite(n)) return { error: `"${raw}" is not a number.` };
  if (n < lim.min || n > lim.max) return { error: `${n} ${lim.unit} is outside ${lim.min}–${lim.max} ${lim.unit}. Check for a typo.` };
  const f = 10 ** lim.decimals;
  return { value: Math.round(n * f) / f };
}
