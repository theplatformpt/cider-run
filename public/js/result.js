import { $, esc, ordinal, fmtS, fmtJ, fmtM, ago, poll, api } from './common.js';

const token = location.pathname.split('/').filter(Boolean)[1] || '';
let data = null, ok = true, formShown = false;

function trials(list, f, unit) {
  const done = list.filter(v => v !== null);
  if (!done.length) return 'Not tested yet';
  return `Trials: ${done.map(f).join(' · ')} ${unit}`;
}

function place(p, of) {
  if (!p) return '';
  return `${ordinal(p)} of ${of} in division`;
}

function render() {
  const d = data, a = d.athlete;
  document.title = `${a.name} · ${d.title}`;
  $('#event').textContent = `${d.event} · ${d.title}`;
  $('#name').textContent = a.name;
  $('#div').textContent = `#${a.bib}${a.division ? ' · ' + a.division : ''}`;
  $('#live').hidden = false;
  $('#statsCard').hidden = false;
  const showPlaces = d.open;
  $('#stats').innerHTML = `
    <div class="stat">
      <div class="k">${d.yards}-yd dash</div>
      <div class="v">${a.sprint.best !== null ? `${fmtS(a.sprint.best)}<small> s</small>` : '–'}</div>
      ${showPlaces && a.sprint.place ? `<div class="place">${place(a.sprint.place, a.sprint.of)}</div>` : ''}
      <div class="tr">${trials(a.sprint.trials, fmtS, 's')}</div>
    </div>
    <div class="stat">
      <div class="k">Vertical jump</div>
      <div class="v">${a.jump.best !== null ? `${fmtJ(a.jump.best)}<small> in</small>` : '–'}</div>
      ${showPlaces && a.jump.place ? `<div class="place">${place(a.jump.place, a.jump.of)}</div>` : ''}
      <div class="tr">${trials(a.jump.trials, fmtJ, 'in')}</div>
    </div>
    <div class="stat lead">
      <div class="k">Overall place</div>
      <div class="v">${showPlaces && a.overall.place ? `${ordinal(a.overall.place)}<small> of ${a.overall.of}</small>` : '–'}</div>
      <div class="tr">${a.overall.place == null ? 'Finish both tests to get an overall place.' : showPlaces ? `In ${esc(a.division)}, ranking your sprint and jump together.` : 'Places show when results go live.'}</div>
    </div>
    ${a.mile && a.mile.time != null ? `<div class="stat">
      <div class="k">Mile</div>
      <div class="v">${fmtM(a.mile.time)}</div>
      ${showPlaces && a.mile.place ? `<div class="place">${place(a.mile.place, a.mile.of)}</div>` : ''}
      <div class="tr">Cider Run mile. Not part of overall.</div>
    </div>` : ''}`;
  if (!formShown) {
    formShown = true;
    $('#ppi').hidden = false;
    if (d.ppiUrl) { $('#ppiLink').href = d.ppiUrl; $('#ppiLink').hidden = false; $('#lead').hidden = true; }
  }
  $('#liveText').textContent = ok ? `Updates live · last change ${ago(d.at)}` : 'Reconnecting…';
  $('#live').classList.toggle('down', !ok);
}

async function load() {
  try {
    data = await api(`/api/result/${encodeURIComponent(token)}`);
    ok = true; render();
  } catch (e) {
    if (e.status === 404) {
      $('#name').textContent = 'Results link not found';
      $('#div').innerHTML = 'Ask our team at the contest table for your QR code, or <a href="/">see the live leaderboard</a>.';
      return;
    }
    ok = false; if (data) render();
  }
}

$('#share').addEventListener('click', async () => {
  const a = data.athlete;
  const bits = [];
  if (a.sprint.best !== null) bits.push(`${fmtS(a.sprint.best)} s ${data.yards}-yd dash`);
  if (a.jump.best !== null) bits.push(`${fmtJ(a.jump.best)} in vertical`);
  if (a.mile && a.mile.time != null) bits.push(`${fmtM(a.mile.time)} mile`);
  const text = `My ${data.event} results: ${bits.join(', ') || 'coming soon'} 🍎`;
  if (navigator.share) { try { await navigator.share({ title: data.title, text, url: location.href }); } catch { /* cancelled */ } }
  else { try { await navigator.clipboard.writeText(`${text} ${location.href}`); $('#share').textContent = 'Link copied'; } catch { /* no clipboard */ } }
});

$('#lead').addEventListener('submit', async e => {
  e.preventDefault();
  const body = {
    token, first: $('#l_first').value, last: $('#l_last').value, email: $('#l_email').value,
    phone: $('#l_phone').value, note: $('#l_note').value, consent: $('#l_ok').checked, website: $('#l_web').value,
  };
  const err = !body.first.trim() ? 'Enter your first name.'
    : !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(body.email.trim()) ? 'Enter a valid email.'
    : body.phone && body.phone.replace(/\D/g, '').length < 10 ? 'Enter a 10-digit phone number, or leave it blank.'
    : !body.consent ? 'Check the box so we can contact you.' : '';
  $('#l_err').textContent = err;
  if (err) return;
  const btn = $('#l_send'); btn.disabled = true; btn.textContent = 'Sending…';
  try {
    await api('/api/lead', { method: 'POST', body });
    $('#lead').hidden = true;
    $('#l_done').hidden = false;
    $('#l_done').textContent = `Got it, ${body.first.trim()}! Our team will reach out to set up a PPI session.`;
  } catch (x) {
    $('#l_err').textContent = x.message; btn.disabled = false; btn.textContent = 'Request a PPI session';
  }
});

poll(load, 10000);
setInterval(() => data && render(), 10000);
