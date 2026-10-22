pdfjsLib.GlobalWorkerOptions.workerSrc = 'lib/pdf.worker.min.js';
const $ = id => document.getElementById(id);
let file = null, blobUrl = null;

if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js');
let deferred;
addEventListener('beforeinstallprompt', e => { e.preventDefault(); deferred = e; $('install').hidden = false; });
$('install').onclick = () => deferred && deferred.prompt();

const step = n => [1, 2, 3].forEach(i => { const el = $('s' + i); el.className = i < n ? 'done' : i === n ? 'on' : ''; });
const hist = () => { try { return JSON.parse(localStorage.getItem('p2x') || '[]'); } catch { return []; } };
function renderHist() {
  const h = hist();
  $('count').textContent = h.length ? `Anda sudah menukar ${h.length} fail. Syabas!` : 'Belum ada penukaran lagi.';
  $('log').innerHTML = '';
  h.slice(-5).reverse().forEach(x => { const li = document.createElement('li'); li.textContent = `${x.n} (${x.p} halaman, ${x.t})`; $('log').append(li); });
}
renderHist();

function pick(f) {
  if (!f || f.type !== 'application/pdf') { $('msg').textContent = 'Sila pilih fail PDF.'; return; }
  file = f; $('fname').textContent = f.name; $('go').disabled = false; $('dl').hidden = true;
  $('preview').innerHTML = ''; $('msg').textContent = 'Bagus! Tekan “Tukar ke Excel”.'; step(2);
}
$('file').onchange = e => pick(e.target.files[0]);
const drop = $('drop');
['dragover', 'dragenter'].forEach(t => drop.addEventListener(t, e => { e.preventDefault(); drop.classList.add('over'); }));
['dragleave', 'drop'].forEach(t => drop.addEventListener(t, e => { e.preventDefault(); drop.classList.remove('over'); }));
drop.addEventListener('drop', e => pick(e.dataTransfer.files[0]));
drop.onkeydown = e => { if (e.key === 'Enter') $('file').click(); };

// Susun item teks kepada baris (ikut Y) dan sel (ikut jurang X), kemudian lajur (kluster X).
function pageToRows(items) {
  const toks = items.filter(i => i.str.trim()).map(i => ({ s: i.str, x: i.transform[4], y: i.transform[5], w: i.width, h: Math.abs(i.transform[3]) || 10 }));
  toks.sort((a, b) => b.y - a.y || a.x - b.x);
  const lines = [];
  for (const t of toks) {
    const l = lines.find(l => Math.abs(l.y - t.y) <= Math.max(2, t.h * 0.4));
    l ? l.t.push(t) : lines.push({ y: t.y, t: [t] });
  }
  lines.sort((a, b) => b.y - a.y);
  const rows = lines.map(l => {
    l.t.sort((a, b) => a.x - b.x);
    const cells = [];
    for (const t of l.t) {
      const c = cells[cells.length - 1];
      const gap = c ? t.x - c.end : 0;
      if (c && gap < t.h * 0.8) { c.s += (gap > t.h * 0.15 ? ' ' : '') + t.s; c.end = t.x + t.w; }
      else cells.push({ s: t.s, x: t.x, end: t.x + t.w });
    }
    return cells;
  });
  // kluster permulaan sel -> lajur
  const xs = rows.flat().map(c => c.x).sort((a, b) => a - b), cols = [];
  for (const x of xs) { const last = cols[cols.length - 1]; if (last === undefined || x - last > 14) cols.push(x); }
  return rows.map(cells => {
    const r = [];
    for (const c of cells) {
      let k = 0, best = 1e9;
      cols.forEach((cx, i) => { const d = Math.abs(cx - c.x); if (d < best) { best = d; k = i; } });
      r[k] = r[k] ? r[k] + ' ' + c.s : c.s;
    }
    return Array.from(r, v => v === undefined ? '' : (v.trim() !== '' && !isNaN(v.replace(/,/g, '')) ? Number(v.replace(/,/g, '')) : v));
  });
}

$('go').onclick = async () => {
  $('go').disabled = true; $('dl').hidden = true; document.querySelector('.bar').hidden = false;
  try {
    const pdf = await pdfjsLib.getDocument({ data: await file.arrayBuffer() }).promise;
    const wb = XLSX.utils.book_new(), one = document.querySelector('[name=mode]:checked').value === 'one';
    let all = [], total = 0;
    for (let p = 1; p <= pdf.numPages; p++) {
      const rows = pageToRows((await (await pdf.getPage(p)).getTextContent()).items);
      total += rows.length;
      if (one) all = all.concat(rows); else XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(rows.length ? rows : [['']]), 'Halaman ' + p);
      if (p === 1) preview(rows);
      $('fill').style.width = (p / pdf.numPages * 100) + '%'; $('msg').textContent = `Memproses halaman ${p}/${pdf.numPages}…`;
    }
    if (!total) { $('msg').textContent = 'Tiada teks dijumpai. PDF ini mungkin imbasan (perlu OCR).'; $('go').disabled = false; return; }
    if (one) XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(all), 'Data');
    const buf = XLSX.write(wb, { type: 'array', bookType: 'xlsx' });
    if (blobUrl) URL.revokeObjectURL(blobUrl);
    blobUrl = URL.createObjectURL(new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }));
    const dl = $('dl'); dl.href = blobUrl; dl.download = file.name.replace(/\.pdf$/i, '') + '.xlsx'; dl.hidden = false;
    $('msg').textContent = `🎉 Berjaya! ${total} baris dari ${pdf.numPages} halaman.`; step(4);
    const h = hist(); h.push({ n: file.name, p: pdf.numPages, t: new Date().toLocaleString() });
    try { localStorage.setItem('p2x', JSON.stringify(h.slice(-50))); } catch {}
    renderHist();
  } catch (e) { $('msg').textContent = 'Gagal: ' + e.message; }
  $('go').disabled = false;
};
function preview(rows) {
  const t = document.createElement('table');
  rows.slice(0, 8).forEach(r => { const tr = t.insertRow(); r.forEach(v => tr.insertCell().textContent = v); });
  $('preview').replaceChildren(t);
}
