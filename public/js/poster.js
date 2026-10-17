import { $, qrSvg } from './common.js';
$('#qr').innerHTML = qrSvg(location.origin + '/', { light: '#FFFAF0' });
$('#url').textContent = location.host;
$('#print').addEventListener('click', () => print());
