import { $, $$, esc, ordinal, fmtS, fmtJ, api, toast, qrSvg } from './common.js';

const EVENT_DATE = new Date('2026-11-21T12:00:00-07:00'); // for ages from a date of birth in imports
const S = {
  view: null, athletes: [], nextBib: 1, settings: null, groups: [], counts: {},
  current: null,          // athlete open at a station
  saved: null,            // last saved trial values at the station, to spot unsaved edits
  dupBody: null, sex: null, editing: null, importRows: null,
};

/* ---------- auth ---------- */
async function boot() {
  try {
    const me = await api('/api/login');
    if (!me.staff) return showLogin(me.configured ? '' : 'Staff login is not set up yet: add STAFF_PASSCODE in Cloudflare.');
    $('#loginView').hidden = true; $('#app').hidden = false; $('#nav').hidden = false;
    await Promise.all([loadAthletes(), loadSettings()]);
    let start = 'checkin';
    try { start = localStorage.getItem('cider_station') || start; } catch { /* private mode */ }
    go(start);
  } catch (e) { showLogin(e.message); }
}

function showLogin(msg = '') {
  $('#app').hidden = true; $('#nav').hidden = true; $('#loginView').hidden = false;
  $('#loginErr').textContent = msg; $('#pass').focus();
}

// Any 401 mid-shift: show login over the app, keep whatever was typed.
async function call(path, opt) {
  try { return await api(path, opt); } catch (e) {
    if (e.status === 401) { reLogin(); }
    throw e;
  }
}

function reLogin() {
  $('#loginErr').textContent = 'Your session ended. Log in again. Nothing you typed was lost.';
  $('#loginView').hidden = false; $('#app').hidden = true; $('#nav').hidden = true; $('#pass').focus();
}

$('#loginForm').addEventListener('submit', async e => {
  e.preventDefault();
  try {
    await api('/api/login', { method: 'POST', body: { passcode: $('#pass').value } });
    $('#pass').value = '';
    if (S.view) { $('#loginView').hidden = true; $('#app').hidden = false; $('#nav').hidden = false; await loadAthletes(); }
    else boot();
  } catch (x) { $('#loginErr').textContent = x.message; }
});

$('#logout').addEventListener('click', async () => { await api('/api/logout', { method: 'POST', body: {} }); location.reload(); });

/* ---------- data ---------- */
async function loadAthletes() {
  const d = await call('/api/staff/athletes');
  S.athletes = d.athletes; S.nextBib = d.nextBib;
  $('#ci_bibHint').textContent = `blank = next number (${S.nextBib})`;
}
async function loadSettings() {
  const d = await call('/api/staff/settings');
  S.settings = d.settings; S.groups = d.groups; S.counts = d.counts; S.crm = d.crm;
}

const yards = () => S.settings?.sprintYards ?? 40;
const groupOf = age => { const m = S.settings.ageMaxes; for (let i = 0; i < m.length; i++) if (age <= m[i]) return i; return m.length; };
const divOf = a => `${a.sex === 'M' ? 'Male' : 'Female'} ${S.groups[groupOf(a.age)]}`;
const bestOf = (arr, low) => { const v = arr.filter(x => x !== null && x !== undefined); return v.length ? (low ? Math.min(...v) : Math.max(...v)) : null; };
const fullName = a => `${a.first} ${a.last}`;

function upsertLocal(a) {
  const i = S.athletes.findIndex(x => x.id === a.id);
  if (i >= 0) S.athletes[i] = a; else S.athletes.push(a);
  S.athletes.sort((x, y) => x.bib - y.bib);
  S.nextBib = Math.max(S.nextBib, a.bib + 1);
}

function search(q) {
  q = q.trim().toLowerCase().replace(/^#/, '');
  if (!q) return [];
  const exact = S.athletes.filter(a => String(a.bib) === q);
  const rest = S.athletes.filter(a => String(a.bib) !== q &&
    (fullName(a).toLowerCase().includes(q) || a.last.toLowerCase().startsWith(q) || String(a.bib).startsWith(q)));
  return exact.concat(rest).slice(0, 12);
}

/* ---------- navigation ---------- */
function go(view) {
  if (!['checkin', 'sprint', 'jump', 'athletes', 'settings'].includes(view)) view = 'checkin';
  if (S.view && (S.view === 'sprint' || S.view === 'jump') && dirty() && !confirm('You have results that are not saved. Leave without saving?')) return;
  S.view = view;
  try { localStorage.setItem('cider_station', view); } catch { /* private mode */ }
  $$('#nav [data-view]').forEach(b => b.setAttribute('aria-current', b.dataset.view === view ? 'page' : 'false'));
  $$('.view').forEach(v => { v.hidden = true; });
  const names = { checkin: 'Check-in', sprint: `${yards()}-yd sprint`, jump: 'Vertical jump', athletes: 'Athletes', settings: 'Setup' };
  $('#stationName').textContent = names[view];
  if (view === 'checkin') { $('#v-checkin').hidden = false; resetCheckin(); }
  if (view === 'sprint' || view === 'jump') { $('#v-station').hidden = false; openStation(view); }
  if (view === 'athletes') { $('#v-athletes').hidden = false; loadAthletes().then(renderAthletes); renderAthletes(); }
  if (view === 'settings') { $('#v-settings').hidden = false; loadSettings().then(renderSettings); renderSettings(); }
  window.scrollTo(0, 0);
}
document.addEventListener('click', e => {
  const b = e.target.closest('[data-view],[data-goto]');
  if (b) go(b.dataset.view || b.dataset.goto);
});

/* ---------- check-in ---------- */
function resetCheckin() {
  $('#ciFormCard').hidden = false; $('#ciDone').hidden = true;
  ['first', 'last', 'age', 'bib', 'email', 'phone'].forEach(k => { $(`#ci_${k}`).value = ''; });
  S.sex = null; $$('#ci_sex button').forEach(b => b.setAttribute('aria-pressed', 'false'));
  $('#ciErr').textContent = ''; $('#ciDup').hidden = true; S.dupBody = null;
  $('#ci_first').focus();
}
$$('#ci_sex button').forEach(b => b.addEventListener('click', () => {
  S.sex = b.dataset.v; $$('#ci_sex button').forEach(x => x.setAttribute('aria-pressed', String(x === b)));
}));

async function checkIn(body) {
  const btn = $('#ciSave'); btn.disabled = true;
  try {
    const d = await call('/api/staff/athletes', { method: 'POST', body });
    upsertLocal(d.athlete);
    $('#ciFormCard').hidden = true; $('#ciDone').hidden = false;
    $('#ciDoneBib').textContent = `Athlete #${d.athlete.bib}`;
    $('#ciDoneName').textContent = `${fullName(d.athlete)} · ${divOf(d.athlete)}`;
    $('#ciDoneQr').innerHTML = qrSvg(`${location.origin}/r/${d.athlete.token}`);
    S.lastCheckedIn = d.athlete;
  } catch (x) {
    $('#ciErr').textContent = x.message;
    if (x.status === 409 && /already checked in/.test(x.message)) { S.dupBody = body; $('#ciDup').hidden = false; }
  } finally { btn.disabled = false; }
}
$('#ciForm').addEventListener('submit', e => {
  e.preventDefault();
  const body = {
    first: $('#ci_first').value, last: $('#ci_last').value, sex: S.sex, age: $('#ci_age').value === '' ? null : Number($('#ci_age').value),
    bib: $('#ci_bib').value, email: $('#ci_email').value, phone: $('#ci_phone').value,
  };
  const err = !body.first.trim() ? 'First name is required.' : !body.last.trim() ? 'Last name is required.'
    : !body.sex ? 'Pick female or male.' : !Number.isInteger(body.age) ? 'Enter their age.' : '';
  $('#ciErr').textContent = err; $('#ciDup').hidden = true;
  if (!err) checkIn(body);
});
$('#ciDup').addEventListener('click', () => S.dupBody && checkIn({ ...S.dupBody, allowDuplicate: true }));
$('#ciNext').addEventListener('click', resetCheckin);

/* ---------- stations ---------- */
const T = {
  sprint: { key: 's', unit: 's', fmt: fmtS, low: true, step: '0.01', plaus: () => [yards() * 0.095, yards() * 0.4] },
  jump: { key: 'j', unit: 'in', fmt: fmtJ, low: false, step: '0.1', plaus: () => [2, 45] },
};

function openStation(view) {
  const t = T[view];
  $('#stTitle').textContent = view === 'sprint' ? `${yards()}-yd sprint` : 'Vertical jump';
  $('#stLede').textContent = view === 'sprint'
    ? 'Find the athlete, enter each trial in seconds. Best (lowest) time counts.'
    : 'Find the athlete, enter each trial in inches. Best (highest) jump counts.';
  $('#stUnit').textContent = view === 'sprint' ? 'Seconds, e.g. 5.42. Trial 1 is required, 2 and 3 are optional.' : 'Inches, e.g. 22.5. Trial 1 is required, 2 and 3 are optional.';
  $('#stTrials').innerHTML = [1, 2, 3].map(i => `<label>Trial ${i}<input id="tr${i}" inputmode="decimal" step="${t.step}" autocomplete="off" enterkeyhint="${i < 3 ? 'next' : 'done'}"></label>`).join('');
  $$('#stTrials input').forEach((inp, i, all) => {
    inp.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); if (i < 2 && !all[i + 1].value) all[i + 1].focus(); else saveTrials(); } });
    inp.addEventListener('input', markBest);
  });
  closePanel();
  $('#stq').value = ''; renderPicks(); $('#stq').focus();
}

function renderPicks() {
  const view = S.view, t = T[view];
  const hits = search($('#stq').value);
  $('#stList').innerHTML = hits.map(a => {
    const b = bestOf(a[t.key], t.low);
    return `<button class="pick" data-pick="${a.id}"><span class="bib">${a.bib}</span>
      <span><span class="nm">${esc(fullName(a))}</span><br><span class="meta">${esc(divOf(a))}</span></span>
      <span class="done">${b !== null ? `✓ ${t.fmt(b)} ${t.unit}` : ''}</span></button>`;
  }).join('') || ($('#stq').value.trim() ? `<p style="color:var(--muted)">No match. Check them in first on the Check in tab.</p>` : '');
}
$('#stq').addEventListener('input', renderPicks);
$('#stq').addEventListener('keydown', e => {
  if (e.key !== 'Enter') return;
  e.preventDefault();
  const hits = search($('#stq').value);
  if (hits.length === 1 || (hits[0] && String(hits[0].bib) === $('#stq').value.trim().replace(/^#/, ''))) openAthlete(hits[0].id);
});
$('#stList').addEventListener('click', e => { const p = e.target.closest('[data-pick]'); if (p) openAthlete(Number(p.dataset.pick)); });

function trialInputs() { return [1, 2, 3].map(i => $(`#tr${i}`)); }
function currentValues() { return trialInputs().map(i => i.value.trim()); }
function dirty() { return !!S.current && !$('#stPanel').hidden && JSON.stringify(currentValues()) !== JSON.stringify(S.saved); }

async function openAthlete(id) {
  if (dirty() && !confirm('You have results that are not saved. Switch athletes anyway?')) return;
  const t = T[S.view];
  let a = S.athletes.find(x => x.id === id);
  try { a = (await call(`/api/staff/athletes/${id}`)).athlete; upsertLocal(a); } catch { /* use cached copy */ }
  S.current = a;
  $('#stSearchCard').hidden = true; $('#stPanel').hidden = false;
  $('#stBib').textContent = a.bib; $('#stName').textContent = fullName(a); $('#stDiv').textContent = `${divOf(a)} · age ${a.age}`;
  trialInputs().forEach((inp, i) => { inp.value = a[t.key][i] ?? ''; });
  S.saved = currentValues();
  $('#stErr').textContent = ''; $('#stStanding').hidden = true;
  markBest();
  const firstEmpty = trialInputs().find(i => !i.value) || trialInputs()[0];
  firstEmpty.focus();
}

function markBest() {
  const t = T[S.view]; if (!t) return;
  const vals = trialInputs().map(i => (i.value.trim() === '' ? null : Number(i.value.replace(',', '.'))));
  const b = bestOf(vals.filter(Number.isFinite), t.low);
  trialInputs().forEach((inp, i) => inp.classList.toggle('best', b !== null && vals[i] === b));
}

function closePanel() {
  S.current = null; S.saved = null;
  $('#stPanel').hidden = true; $('#stSearchCard').hidden = false;
}

async function saveTrials() {
  const a = S.current; if (!a) return;
  const t = T[S.view];
  const raw = currentValues();
  const vals = raw.map(v => (v === '' ? null : Number(v.replace(',', '.'))));
  if (vals.some((v, i) => raw[i] !== '' && !Number.isFinite(v))) { $('#stErr').textContent = 'Only numbers, please.'; return; }
  if (vals[0] === null && vals.some(v => v !== null)) { $('#stErr').textContent = 'Fill trial 1 first.'; return; }
  const [lo, hi] = t.plaus();
  const odd = vals.filter(v => v !== null && (v < lo || v > hi));
  if (odd.length && !confirm(`${odd.map(v => `${v} ${t.unit}`).join(', ')} looks unusual for this test. Save anyway?`)) return;
  const btn = $('#stSave'); btn.disabled = true; btn.textContent = 'Saving…';
  try {
    const d = await call(`/api/staff/athletes/${a.id}`, { method: 'PATCH', body: { [t.key]: vals } });
    upsertLocal(d.athlete); S.current = d.athlete; S.saved = currentValues();
    const st = d.standing;
    const best = S.view === 'sprint' ? st?.s : st?.j;
    const place = S.view === 'sprint' ? st?.sr : st?.jr;
    const of = S.view === 'sprint' ? st?.sn : st?.jn;
    const msg = best !== null && best !== undefined
      ? `Saved. Best ${t.fmt(best)} ${t.unit}: ${ordinal(place)} of ${of} in ${st.division}${st.o !== null ? ` · overall ${ordinal(st.or)}` : ''}.`
      : 'Saved. Trials cleared.';
    $('#stErr').textContent = '';
    $('#stStanding').hidden = false; $('#stStanding').textContent = msg;
    toast('Saved ✓');
  } catch (x) {
    $('#stErr').textContent = x.message;
  } finally { btn.disabled = false; btn.textContent = 'Save'; }
}
$('#stSave').addEventListener('click', saveTrials);
$('#stNext').addEventListener('click', () => {
  if (dirty() && !confirm('You have results that are not saved. Move on anyway?')) return;
  closePanel(); $('#stq').value = ''; renderPicks(); $('#stq').focus();
  loadAthletes().catch(() => {});
});
$('#stQr').addEventListener('click', () => S.current && showQr(S.current));

/* ---------- QR dialog ---------- */
function showQr(a) {
  const url = `${location.origin}/r/${a.token}`;
  $('#qrName').textContent = `${fullName(a)} · #${a.bib}`;
  $('#qrBox').innerHTML = qrSvg(url);
  $('#qrLink').href = url; $('#qrLink').textContent = url;
  $('#qrDlg').showModal();
}
$('#qrClose').addEventListener('click', () => $('#qrDlg').close());

/* ---------- athletes list + edit ---------- */
function renderAthletes() {
  $('#thS').textContent = `${yards()} yd`;
  const q = $('#athq').value.trim();
  const list = q ? search(q).concat([]) : S.athletes;
  const nS = S.athletes.filter(a => bestOf(a.s, true) !== null).length, nJ = S.athletes.filter(a => bestOf(a.j, false) !== null).length;
  $('#athCount').textContent = `${S.athletes.length} checked in · ${nS} sprinted · ${nJ} jumped. Tap a row to edit or fix a result.`;
  $('#athBody').innerHTML = list.map(a => {
    const bs = bestOf(a.s, true), bj = bestOf(a.j, false);
    return `<tr class="click" data-edit="${a.id}"><td><b>${a.bib}</b></td><td>${esc(fullName(a))}</td><td>${esc(divOf(a))}</td>
      <td class="num">${bs !== null ? fmtS(bs) : '–'}</td><td class="num">${bj !== null ? fmtJ(bj) : '–'}</td></tr>`;
  }).join('') || '<tr><td colspan="5" style="color:var(--muted)">No athletes yet.</td></tr>';
}
$('#athq').addEventListener('input', renderAthletes);
$('#athBody').addEventListener('click', e => { const r = e.target.closest('[data-edit]'); if (r) openEdit(Number(r.dataset.edit)); });

function openEdit(id) {
  const a = S.athletes.find(x => x.id === id); if (!a) return;
  S.editing = a;
  $('#editTitle').textContent = `#${a.bib} · ${fullName(a)}`;
  for (const k of ['first', 'last', 'sex', 'age', 'bib', 'phone', 'email']) $(`#ed_${k}`).value = a[k] ?? '';
  $('#edSLabel').textContent = `${yards()}-yd sprint trials (s)`;
  $('#ed_s').innerHTML = [0, 1, 2].map(i => `<label>Trial ${i + 1}<input data-s="${i}" inputmode="decimal" value="${a.s[i] ?? ''}"></label>`).join('');
  $('#ed_j').innerHTML = [0, 1, 2].map(i => `<label>Trial ${i + 1}<input data-j="${i}" inputmode="decimal" value="${a.j[i] ?? ''}"></label>`).join('');
  $('#edErr').textContent = '';
  $('#editDlg').showModal();
}
$('#edCancel').addEventListener('click', () => $('#editDlg').close());
$('#edQr').addEventListener('click', () => { const a = S.editing; $('#editDlg').close(); showQr(a); });
$('#edSave').addEventListener('click', async () => {
  const a = S.editing;
  const num = v => (v.trim() === '' ? null : Number(v.replace(',', '.')));
  const body = {
    first: $('#ed_first').value, last: $('#ed_last').value, sex: $('#ed_sex').value, age: Number($('#ed_age').value),
    bib: $('#ed_bib').value === '' ? a.bib : Number($('#ed_bib').value), phone: $('#ed_phone').value, email: $('#ed_email').value,
    s: $$('#ed_s input').map(i => num(i.value)), j: $$('#ed_j input').map(i => num(i.value)),
  };
  try {
    const d = await call(`/api/staff/athletes/${a.id}`, { method: 'PATCH', body });
    upsertLocal(d.athlete); $('#editDlg').close(); renderAthletes(); toast('Saved ✓');
  } catch (x) { $('#edErr').textContent = x.message; }
});
$('#edDel').addEventListener('click', async () => {
  const a = S.editing;
  if (!confirm(`Delete ${fullName(a)} (#${a.bib}) and all their results? This can't be undone.`)) return;
  try {
    await call(`/api/staff/athletes/${a.id}`, { method: 'DELETE', body: {} });
    S.athletes = S.athletes.filter(x => x.id !== a.id); $('#editDlg').close(); renderAthletes(); toast('Deleted');
  } catch (x) { $('#edErr').textContent = x.message; }
});

/* ---------- settings ---------- */
function agesPreview() {
  const list = $('#setAges').value.split(/[,\s]+/).filter(Boolean).map(Number);
  const okList = list.length && list.every((v, i) => Number.isInteger(v) && v >= 3 && v <= 99 && (!i || v > list[i - 1]));
  if (!okList) { $('#setAgesPreview').textContent = 'Rising whole numbers, e.g. 10, 13, 17, 34, 49'; return null; }
  const labels = []; let lo = null;
  list.forEach((m, i) => { labels.push(i ? `${lo}–${m}` : `${m} & under`); lo = m + 1; });
  labels.push(`${lo}+`);
  $('#setAgesPreview').textContent = `Groups: ${labels.join(' · ')}`;
  return list;
}
function renderSettings() {
  const s = S.settings; if (!s) return;
  const url = `${location.origin}/`;
  $('#boardQr').innerHTML = qrSvg(url); $('#boardUrl').textContent = url.replace(/^https?:\/\//, '');
  $('#setOpen').checked = !!s.boardOpen;
  $('#setEvent').value = s.event; $('#setTitle').value = s.title; $('#setYards').value = s.sprintYards;
  $('#setAges').value = s.ageMaxes.join(', '); $('#setPpi').value = s.ppiUrl || '';
  agesPreview();
  $('#setYardsHint').textContent = S.counts.sprint ? `${S.counts.sprint} athletes already have times at ${s.sprintYards} yd. Changing the distance relabels those times; it doesn't convert them.` : '';
  $('#leadsLink').textContent = `PPI requests CSV (${S.counts.leads || 0})`;
  $('#crmNote').textContent = S.crm ? 'PPI requests also go straight to GoHighLevel.' : 'GoHighLevel is not connected, so PPI requests are only saved here. Download them above, or add GHL_API_KEY and GHL_LOCATION_ID in Cloudflare.';
}
$('#setAges').addEventListener('input', agesPreview);
$('#setOpen').addEventListener('change', async e => {
  try { const d = await call('/api/staff/settings', { method: 'PUT', body: { boardOpen: e.target.checked } }); S.settings = d.settings; toast(e.target.checked ? 'Board is showing results' : 'Board is hidden'); }
  catch (x) { e.target.checked = !e.target.checked; toast(x.message); }
});
$('#setForm').addEventListener('submit', async e => {
  e.preventDefault();
  const ages = agesPreview();
  if (!ages) { $('#setErr').textContent = 'Fix the age groups first.'; return; }
  const yardsNew = Number($('#setYards').value);
  if (S.counts.sprint && yardsNew !== S.settings.sprintYards &&
      !confirm(`${S.counts.sprint} sprint times were run at ${S.settings.sprintYards} yd. Change the distance label to ${yardsNew} yd anyway?`)) return;
  try {
    const d = await call('/api/staff/settings', { method: 'PUT', body: {
      event: $('#setEvent').value, title: $('#setTitle').value, sprintYards: yardsNew, ageMaxes: ages, ppiUrl: $('#setPpi').value,
    } });
    S.settings = d.settings; S.groups = d.groups; S.counts = d.counts; $('#setErr').textContent = ''; renderSettings(); toast('Setup saved ✓');
  } catch (x) { $('#setErr').textContent = x.message; }
});
$('#resetGo').addEventListener('click', async () => {
  if ($('#resetConfirm').value.trim() !== 'RESET') { toast('Type RESET first'); return; }
  if (!confirm('Delete every athlete, result and PPI request?')) return;
  try { await call('/api/staff/reset', { method: 'POST', body: { confirm: 'RESET' } }); $('#resetConfirm').value = ''; await Promise.all([loadAthletes(), loadSettings()]); renderSettings(); toast('All test data deleted'); }
  catch (x) { toast(x.message); }
});

/* ---------- CSV import ---------- */
function parseCsv(text) {
  const rows = []; let row = [], cell = '', q = false;
  text = text.replace(/^﻿/, '');
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) { if (c === '"') { if (text[i + 1] === '"') { cell += '"'; i++; } else q = false; } else cell += c; }
    else if (c === '"') q = true;
    else if (c === ',') { row.push(cell); cell = ''; }
    else if (c === '\n' || c === '\r') { if (c === '\r' && text[i + 1] === '\n') i++; row.push(cell); rows.push(row); row = []; cell = ''; }
    else cell += c;
  }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  return rows.filter(r => r.some(c => c.trim()));
}
function ageFromDob(s) {
  const d = new Date(s); if (Number.isNaN(d.getTime())) return null;
  let a = EVENT_DATE.getFullYear() - d.getFullYear();
  const m = EVENT_DATE.getMonth() - d.getMonth();
  if (m < 0 || (m === 0 && EVENT_DATE.getDate() < d.getDate())) a--;
  return a;
}
function mapRows(rows) {
  const h = rows[0].map(x => x.trim().toLowerCase().replace(/[^a-z]/g, ''));
  const find = (...names) => h.findIndex(x => names.includes(x));
  const iF = find('first', 'firstname', 'athletefirstname', 'givenname'), iL = find('last', 'lastname', 'athletelastname', 'surname', 'familyname');
  const iN = find('name', 'fullname', 'athlete', 'athletename');
  const iS = find('sex', 'gender', 'mf', 'division'), iA = find('age', 'athleteage', 'ageonraceday');
  const iD = find('dob', 'dateofbirth', 'birthday', 'birthdate'), iE = find('email', 'emailaddress'), iP = find('phone', 'phonenumber', 'mobile', 'cell'), iB = find('bib', 'bibnumber', 'athletenumber', 'number');
  const sexOf = v => { v = String(v || '').trim().toLowerCase(); return /^(m|male|man|boy|boys|men)$/.test(v) ? 'M' : /^(f|female|woman|girl|girls|women)$/.test(v) ? 'F' : ''; };
  return rows.slice(1).map(r => {
    let first = iF >= 0 ? r[iF] : '', last = iL >= 0 ? r[iL] : '';
    if ((!first || !last) && iN >= 0) { const p = String(r[iN] || '').trim().split(/\s+/); first = first || p[0] || ''; last = last || p.slice(1).join(' '); }
    let age = iA >= 0 && String(r[iA]).trim() !== '' ? Number(r[iA]) : null;
    if (age === null && iD >= 0) age = ageFromDob(r[iD]);
    return { first, last, sex: iS >= 0 ? sexOf(r[iS]) : '', age, email: iE >= 0 ? r[iE] : '', phone: iP >= 0 ? r[iP] : '', bib: iB >= 0 ? r[iB] : '' };
  });
}
$('#impFile').addEventListener('change', async e => {
  const f = e.target.files[0]; if (!f) return;
  const rows = parseCsv(await f.text());
  if (rows.length < 2) { $('#impPreview').textContent = 'That file has no rows.'; $('#impGo').hidden = true; return; }
  S.importRows = mapRows(rows);
  const missing = S.importRows.filter(r => !r.sex || r.age === null || !r.first || !r.last).length;
  $('#impPreview').innerHTML = `Found <b>${S.importRows.length}</b> rows.` + (missing ? ` <span class="danger">${missing} are missing a name, sex or age and will be skipped; check those in on the day.</span>` : '');
  $('#impGo').hidden = false; $('#impGo').textContent = `Import ${S.importRows.length - missing} athletes`;
});
$('#impGo').addEventListener('click', async () => {
  try {
    const d = await call('/api/staff/athletes', { method: 'PUT', body: { athletes: S.importRows } });
    $('#impPreview').innerHTML = `Added <b>${d.added}</b>.` + (d.skipped.length ? `<br>Skipped ${d.skipped.length}:<br>` +
      d.skipped.slice(0, 30).map(s => `Row ${s.row}: ${esc(s.reason)}`).join('<br>') : '');
    $('#impGo').hidden = true; $('#impFile').value = '';
    await Promise.all([loadAthletes(), loadSettings()]);
  } catch (x) { $('#impPreview').textContent = x.message; }
});

/* keep station lists fresh when two people check athletes in */
setInterval(() => { if (!document.hidden && (S.view === 'sprint' || S.view === 'jump') && $('#stPanel').hidden) loadAthletes().then(renderPicks).catch(() => {}); }, 15000);
window.addEventListener('beforeunload', e => { if (dirty()) { e.preventDefault(); e.returnValue = ''; } });

boot();
