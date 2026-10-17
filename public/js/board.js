import { $, $$, esc, ordinal, fmtS, fmtJ, ago, poll } from './common.js';

const params = new URLSearchParams(location.search);
const S = {
  data: null, rev: null, ok: true,
  tab: ['o', 's', 'j'].includes(params.get('tab')) ? params.get('tab') : 'o',
  x: ['A', 'M', 'F'].includes(params.get('x')) ? params.get('x') : 'A',
  g: params.has('g') ? Number(params.get('g')) : -1,
  q: '',
  me: (() => { try { return Number(localStorage.getItem('cider_me')) || null; } catch { return null; } })(),
};

const KEY = { s: ['s', 'sr'], j: ['j', 'jr'], o: ['o', 'or'] };

function saveUrl() {
  const p = new URLSearchParams();
  if (S.tab !== 'o') p.set('tab', S.tab);
  if (S.x !== 'A') p.set('x', S.x);
  if (S.g >= 0) p.set('g', S.g);
  history.replaceState(null, '', p.toString() ? `?${p}` : location.pathname);
}

function value(r, tab) {
  if (tab === 's') return `${fmtS(r.s)}<small>s</small>`;
  if (tab === 'j') return `${fmtJ(r.j)}<small>in</small>`;
  // Overall shows place only (the badge) plus the athlete's two marks, never a score.
  return `<span class="pair">${fmtS(r.s)}<small>s</small><br>${fmtJ(r.j)}<small>in</small></span>`;
}

function sub(r, tab) {
  const bib = `#${r.b}`;
  return bib;
}

function row(r, tab) {
  const [, rk] = KEY[tab];
  const p = r[rk];
  return `<li class="${r.b === S.me ? 'me' : ''}">
    <span class="badge ${p <= 3 ? 'p' + p : ''}" aria-label="${ordinal(p)} place">${p}</span>
    <span class="who"><b>${esc(r.n)}</b><span>${sub(r, tab)}</span></span>
    <span class="val">${value(r, tab)}</span></li>`;
}

function divisionLabel(x, g) {
  return `${x === 'M' ? 'Male' : 'Female'} ${S.data.groups[g]}`;
}

function renderChips() {
  const d = S.data;
  $('#ageChips').innerHTML = [`<button class="chip" data-g="-1" aria-pressed="${S.g === -1}">All ages</button>`]
    .concat(d.groups.map((label, i) => `<button class="chip" data-g="${i}" aria-pressed="${S.g === i}">${esc(label)}</button>`)).join('');
  $$('#sexChips .chip').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.x === S.x)));
  $$('.tabs button').forEach(b => b.setAttribute('aria-selected', String(b.dataset.tab === S.tab)));
}

function renderSearch(rows) {
  const q = S.q.trim().toLowerCase();
  const hits = rows.filter(r => String(r.b) === q.replace('#', '') || r.n.toLowerCase().includes(q)).slice(0, 20);
  if (!hits.length) return `<div class="card empty"><b>No one matches “${esc(S.q)}”</b>Check the spelling, or try your athlete number.</div>`;
  return `<div class="divs">${hits.map(r => `
    <section class="card div">
      <div class="head"><h2>${esc(r.n)} <small>#${r.b}</small></h2><div class="who"><span>${esc(divisionLabel(r.x, r.g))}</span></div></div>
      <ol class="rank">
        <li><span class="badge ${r.sr && r.sr <= 3 ? 'p' + r.sr : ''}">${r.sr ?? '–'}</span><span class="who"><b>${S.data.yards}-yd dash</b><span>${r.sr ? ordinal(r.sr) + ' in division' : 'Not tested yet'}</span></span><span class="val">${r.s !== null ? value(r, 's') : '–'}</span></li>
        <li><span class="badge ${r.jr && r.jr <= 3 ? 'p' + r.jr : ''}">${r.jr ?? '–'}</span><span class="who"><b>Vertical jump</b><span>${r.jr ? ordinal(r.jr) + ' in division' : 'Not tested yet'}</span></span><span class="val">${r.j !== null ? value(r, 'j') : '–'}</span></li>
        <li><span class="badge ${r.or && r.or <= 3 ? 'p' + r.or : ''}">${r.or ?? '–'}</span><span class="who"><b>Overall</b><span>${r.or ? ordinal(r.or) + ' in division' : 'Needs both tests'}</span></span><span class="val">${r.or ? ordinal(r.or) : '–'}</span></li>
      </ol>
      <button class="more" data-follow="${r.b}">${r.b === S.me ? '★ Highlighted on the board' : 'Highlight me on the board'}</button>
    </section>`).join('')}</div>`;
}

function render() {
  const d = S.data;
  if (!d) return;
  $('#event').textContent = d.event;
  $('#title').textContent = d.title;
  $('#sprintTab').textContent = `${d.yards}-Yd Dash`;
  $('#counts').innerHTML = d.open
    ? `<span><b>${d.counts.athletes}</b> athletes</span><span><b>${d.counts.sprint}</b> sprinted</span><span><b>${d.counts.jump}</b> jumped</span>`
    : '';
  renderChips();

  const board = $('#board');
  if (!d.open) {
    board.innerHTML = `<div class="card empty" style="margin-top:14px"><b>Results go live soon 🍎</b>Check back once testing starts. This page updates on its own.</div>`;
    return;
  }
  if (S.q.trim()) { board.innerHTML = renderSearch(d.rows); return; }

  const [vk, rk] = KEY[S.tab];
  const divs = [];
  for (let g = 0; g < d.groups.length; g++) {
    if (S.g >= 0 && g !== S.g) continue;
    for (const x of ['F', 'M']) {
      if (S.x !== 'A' && x !== S.x) continue;
      const list = d.rows.filter(r => r.g === g && r.x === x && r[vk] !== null)
        .sort((a, b) => a[rk] - b[rk] || a.n.localeCompare(b.n));
      if (list.length) divs.push({ g, x, list });
    }
  }
  if (!divs.length) {
    const what = S.tab === 'o' ? 'overall places (they need both tests)' : 'results';
    board.innerHTML = `<div class="card empty" style="margin-top:14px"><b>No ${what} here yet</b>Results show up the moment our team enters them.</div>`;
    return;
  }
  const full = S.g >= 0;
  board.innerHTML = `<div class="divs ${full ? '' : 'grid'}">${divs.map(({ g, x, list }) => {
    let shown = full ? list : list.slice(0, 3);
    if (!full && S.me) {
      const mine = list.find(r => r.b === S.me);
      if (mine && !shown.includes(mine)) shown = shown.concat(mine);
    }
    return `<section class="card div">
      <div class="head"><h2>${esc(divisionLabel(x, g))} <small>${list.length} ${list.length === 1 ? 'athlete' : 'athletes'}</small></h2></div>
      <ol class="rank">${shown.map(r => row(r, S.tab)).join('')}</ol>
      ${!full && list.length > shown.length ? `<button class="more" data-g="${g}" data-x="${x}">See all ${list.length} →</button>` : ''}
    </section>`;
  }).join('')}</div>`;
}

function setLive() {
  const el = $('#live'), t = $('#liveText');
  if (!S.data) return;
  el.classList.toggle('down', !S.ok);
  t.textContent = S.ok ? `Live · last update ${ago(S.data.at)}` : 'Reconnecting…';
}

async function load() {
  try {
    const res = await fetch(`/api/board${S.rev !== null ? `?v=${S.rev}` : ''}`, { cache: 'no-store' });
    if (res.status === 204) { S.ok = true; setLive(); return; }
    if (!res.ok) throw new Error(res.status);
    const d = await res.json();
    S.data = d; S.rev = d.rev; S.ok = true;
    if (S.g >= d.groups.length) S.g = -1;
    render();
  } catch {
    S.ok = false;
  }
  setLive();
}

document.addEventListener('click', e => {
  const tab = e.target.closest('[data-tab]');
  if (tab) { S.tab = tab.dataset.tab; saveUrl(); render(); return; }
  const sx = e.target.closest('#sexChips [data-x]');
  if (sx) { S.x = sx.dataset.x; saveUrl(); render(); return; }
  const fol = e.target.closest('[data-follow]');
  if (fol) {
    const b = Number(fol.dataset.follow);
    S.me = S.me === b ? null : b;
    try { S.me ? localStorage.setItem('cider_me', S.me) : localStorage.removeItem('cider_me'); } catch { /* private mode */ }
    const r = S.data.rows.find(x => x.b === b);
    if (S.me && r) { S.q = ''; $('#q').value = ''; S.g = r.g; S.x = r.x; saveUrl(); }
    render(); return;
  }
  const g = e.target.closest('[data-g]');
  if (g) {
    S.g = Number(g.dataset.g);
    if (g.dataset.x) S.x = g.dataset.x;
    saveUrl(); render();
    if (g.classList.contains('more')) window.scrollTo({ top: $('#board').offsetTop - 12, behavior: 'smooth' });
  }
});
$('#q').addEventListener('input', e => { S.q = e.target.value; render(); });
$$('.tabs [role=tab]').forEach((b, i, all) => b.addEventListener('keydown', e => {
  const k = { ArrowRight: 1, ArrowLeft: -1 }[e.key];
  if (k) { const n = all[(i + k + all.length) % all.length]; n.focus(); n.click(); }
}));

poll(load, 5000);
setInterval(setLive, 5000);
