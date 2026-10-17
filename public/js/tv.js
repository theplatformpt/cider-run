import { $, esc, fmtS, fmtJ, fmtO, poll, qrSvg } from './common.js';
let data = null, rev = null, idx = 0;
$('#qr').innerHTML = qrSvg(location.origin + '/');
$('#url').textContent = location.host;

function divisions() {
  const out = [];
  if (!data) return out;
  data.groups.forEach((g, gi) => ['F', 'M'].forEach(x => {
    if (data.rows.some(r => r.g === gi && r.x === x && (r.s !== null || r.j !== null))) out.push({ g: gi, x });
  }));
  return out;
}
function col(title, list, vk, rk, fmt, unit) {
  const top = list.filter(r => r[vk] !== null).sort((a, b) => a[rk] - b[rk] || a.n.localeCompare(b.n)).slice(0, 6);
  return `<section class="col"><h2>${title}</h2><ol>${top.map(r => `<li><span class="badge ${r[rk] <= 3 ? 'p' + r[rk] : ''}">${r[rk]}</span><b>${esc(r.n)}</b><span class="v">${fmt(r[vk])}${unit ? `<small> ${unit}</small>` : ''}</span></li>`).join('') || '<li class="none">No results yet</li>'}</ol></section>`;
}
function show() {
  if (!data) return;
  $('#event').textContent = data.event;
  $('#title').textContent = `${data.title} 🍎`;
  const divs = divisions();
  if (!data.open || !divs.length) {
    $('#divname').textContent = '';
    $('#cols').innerHTML = `<div class="msg" style="grid-column:1/-1">${data.open ? 'Results show up here as athletes finish' : 'Results go live soon'}</div>`;
    $('#dots').innerHTML = ''; return;
  }
  idx = idx % divs.length;
  const { g, x } = divs[idx];
  const list = data.rows.filter(r => r.g === g && r.x === x);
  $('#divname').innerHTML = `<small>Division ${idx + 1} of ${divs.length}</small>${x === 'M' ? 'Male' : 'Female'} ${esc(data.groups[g])}`;
  $('#cols').innerHTML = col(`${data.yards}-yd dash`, list, 's', 'sr', fmtS, 's') + col('Vertical jump', list, 'j', 'jr', fmtJ, 'in') + col('Overall', list, 'o', 'or', fmtO, '');
  $('#dots').innerHTML = divs.map((_, i) => `<i class="${i === idx ? 'on' : ''}"></i>`).join('');
}
poll(async () => {
  try {
    const res = await fetch(`/api/board${rev !== null ? `?v=${rev}` : ''}`, { cache: 'no-store' });
    if (res.status === 200) { data = await res.json(); rev = data.rev; show(); }
  } catch { /* keep showing last data */ }
}, 5000);
setInterval(() => { idx++; show(); }, 9000);
