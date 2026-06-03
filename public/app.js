'use strict';

// ── DOM ──────────────────────────────────────────────────────
const $  = id => document.getElementById(id);
const dropZone    = $('drop-zone');
const fileInput   = $('file-input');
const fileBadge   = $('file-selected');
const fileLabel   = $('file-name-display');
const btnClear    = $('btn-clear-file');
const btnOptimize = $('btn-optimize');
const btnText     = $('btn-text');
const btnSpinner  = $('btn-spinner');
const btnNew      = $('btn-new');
const btnPrint    = $('btn-print');
const uploadSec   = $('upload-section');
const resultsSec  = $('results-section');
const boardsEl    = $('boards-container');
const summaryEl   = $('summary-container');
const errContainer = $('parse-errors-container');
const errList     = $('parse-errors-list');
const resultMeta  = $('result-meta');
const printDate   = $('print-date');
const uploadErr   = $('upload-error');

let currentFile = null;

// ── File handling ─────────────────────────────────────────────
dropZone.addEventListener('click', () => fileInput.click());
dropZone.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') fileInput.click(); });
fileInput.addEventListener('change', e => e.target.files[0] && setFile(e.target.files[0]));
dropZone.addEventListener('dragover', e => { e.preventDefault(); dropZone.classList.add('drag-over'); });
dropZone.addEventListener('dragleave', () => dropZone.classList.remove('drag-over'));
dropZone.addEventListener('drop', e => {
  e.preventDefault();
  dropZone.classList.remove('drag-over');
  e.dataTransfer.files[0] && setFile(e.dataTransfer.files[0]);
});
btnClear.addEventListener('click', clearFile);

function setFile(file) {
  const ext = file.name.split('.').pop().toLowerCase();
  if (!['csv', 'pdf', 'txt'].includes(ext)) {
    showErr('Formato no soportado. Use CSV o PDF.');
    return;
  }
  currentFile = file;
  fileLabel.textContent = `${file.name}  (${fmtBytes(file.size)})`;
  fileBadge.classList.remove('hidden');
  dropZone.classList.add('hidden');
  btnOptimize.disabled = false;
  hideErr();
}

function clearFile() {
  currentFile       = null;
  fileInput.value   = '';
  fileBadge.classList.add('hidden');
  dropZone.classList.remove('hidden');
  btnOptimize.disabled = true;
  hideErr();
}

function fmtBytes(b) {
  return b < 1024 ? `${b} B` : b < 1048576 ? `${(b/1024).toFixed(1)} KB` : `${(b/1048576).toFixed(1)} MB`;
}

function showErr(msg) { uploadErr.textContent = msg; uploadErr.classList.remove('hidden'); }
function hideErr()    { uploadErr.classList.add('hidden'); }

// ── Optimize ──────────────────────────────────────────────────
btnOptimize.addEventListener('click', run);

async function run() {
  if (!currentFile) return;
  setLoading(true);
  hideErr();

  try {
    const fd = new FormData();
    fd.append('file', currentFile);
    const res  = await fetch('/api/process', { method: 'POST', body: fd });
    const data = await res.json();

    if (!res.ok) {
      const detail = data.parseErrors?.map(e => `  Fila ${e.row}: ${e.message}`).join('\n') || '';
      showErr((data.error || 'Error desconocido') + (detail ? '\n' + detail : ''));
      return;
    }

    renderResults(data);
  } catch (e) {
    showErr('Error de conexión: ' + e.message);
  } finally {
    setLoading(false);
  }
}

function setLoading(on) {
  btnOptimize.disabled = on;
  btnText.textContent  = on ? 'Procesando…' : 'Procesar';
  btnSpinner.classList.toggle('hidden', !on);
}

// ── Results ───────────────────────────────────────────────────
btnNew.addEventListener('click', reset);
btnPrint.addEventListener('click', () => window.print());

function renderResults(data) {
  uploadSec.classList.add('hidden');
  resultsSec.classList.remove('hidden');

  if (data.parseErrors?.length) {
    errContainer.classList.remove('hidden');
    errList.innerHTML = data.parseErrors.map(e => `<li>Fila ${e.row}: ${esc(e.message)}</li>`).join('');
  } else {
    errContainer.classList.add('hidden');
  }

  const dt = new Date(data.generatedAt).toLocaleString('es-ES');
  resultMeta.textContent = `${data.totalPieces} piezas · ${data.totalBoards} tableros · ${data.overallWaste}% desperdicio`;
  printDate.textContent  = dt;

  boardsEl.innerHTML = '';
  data.boards.forEach(b => boardsEl.appendChild(boardCard(b)));

  renderSummary(data);
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function reset() {
  resultsSec.classList.add('hidden');
  uploadSec.classList.remove('hidden');
  boardsEl.innerHTML  = '';
  summaryEl.innerHTML = '';
  clearFile();
  window.scrollTo({ top: 0 });
}

// ── Board card ────────────────────────────────────────────────
function boardCard(board) {
  const wasteClass = board.wastePercentage > 20 ? 'waste-high'
                   : board.wastePercentage > 10 ? 'waste-mid' : 'waste-low';

  const div = document.createElement('div');
  div.className = 'board-card';
  div.innerHTML = `
    <div class="board-card-header">
      <b>#${board.boardIndex} &nbsp;${esc(board.groupKey)}</b>
      <span class="waste-badge ${wasteClass}">Desperdicio ${board.wastePercentage}%</span>
    </div>
    <div class="board-card-body">
      <div class="bsvg-wrap">
        ${boardSVG(board)}
        <div class="bsvg-meta">
          ${board.pieces.length} pzs<br>
          útil ${(board.usedArea/(1200*2800)*100).toFixed(1)}%
        </div>
      </div>
      <div class="blist-wrap">${pieceTable(board)}</div>
    </div>`;
  return div;
}

// ── SVG diagram ───────────────────────────────────────────────
function boardSVG(board) {
  const BW = 1200, BH = 2800;
  const uid = `b${board.boardIndex}`;

  const pieces = board.pieces.map((p, i) => {
    const color  = pieceColor(p.components);
    const clipId = `cl${uid}i${i}`;
    const minDim = Math.min(p.placedLength, p.placedHeight);
    const fName  = Math.max(26, Math.min(110, minDim * 0.27));
    const fDim   = Math.max(18, Math.min(75,  minDim * 0.19));
    const cx = p.x + p.placedLength / 2;
    const cy = p.y + p.placedHeight / 2;

    return `
  <clipPath id="${clipId}">
    <rect x="${p.x+6}" y="${p.y+6}" width="${Math.max(0,p.placedLength-12)}" height="${Math.max(0,p.placedHeight-12)}"/>
  </clipPath>
  <rect x="${p.x}" y="${p.y}" width="${p.placedLength}" height="${p.placedHeight}"
        fill="${color}" stroke="#334155" stroke-width="5" rx="2"/>
  <g clip-path="url(#${clipId})" font-family="system-ui,sans-serif">
    <text x="${cx}" y="${cy - fDim*.5}" text-anchor="middle" dominant-baseline="middle"
          font-size="${fName}" font-weight="700" fill="#1e293b">${esc(p.name)}</text>
    <text x="${cx}" y="${cy + fName*.75}" text-anchor="middle" dominant-baseline="middle"
          font-size="${fDim}" fill="#475569">${p.placedLength}×${p.placedHeight}${p.rotated?' ↻':''}</text>
  </g>`;
  }).join('');

  return `<svg class="board-svg" viewBox="0 0 ${BW} ${BH}"
     xmlns="http://www.w3.org/2000/svg"
     role="img" aria-label="Tablero ${board.boardIndex}">
  <defs>
    <pattern id="wp${uid}" patternUnits="userSpaceOnUse" width="120" height="120" patternTransform="rotate(45)">
      <rect width="120" height="120" fill="#f1f5f9"/>
      <rect width="46" height="120" fill="#e2e8f0"/>
    </pattern>
  </defs>
  <rect width="${BW}" height="${BH}" fill="url(#wp${uid})"/>
  ${pieces}
  <rect width="${BW}" height="${BH}" fill="none" stroke="#0f172a" stroke-width="14"/>
</svg>`;
}

// ── Piece table ───────────────────────────────────────────────
function pieceTable(board) {
  const rows = board.pieces
    .slice()
    .sort((a, b) => (a.packageNumber||'').localeCompare(b.packageNumber||'', 'es', {numeric:true}))
    .map(p => `<tr>
      <td>${esc(p.packageNumber)}</td>
      <td>${esc(p.name)}</td>
      <td class="text-right">${p.length}</td>
      <td class="text-right">${p.height}</td>
      <td>${esc(p.notaClave)}</td>
      <td class="text-center">${p.rotated ? '↻' : ''}</td>
    </tr>`).join('');

  return `<table aria-label="Piezas tablero ${board.boardIndex}">
  <thead>
    <tr>
      <th>Paq.</th><th>Nombre</th>
      <th class="text-right">L (mm)</th><th class="text-right">A (mm)</th>
      <th>Nota Clave</th><th class="text-center">↻</th>
    </tr>
  </thead>
  <tbody>${rows}</tbody>
</table>`;
}

// ── Summary ───────────────────────────────────────────────────
function renderSummary(data) {
  const rows = data.summary.map(s => `<tr>
    <td style="text-align:left;font-weight:600">${esc(s.groupKey)}</td>
    <td>${s.boardCount}</td><td>${s.pieceCount}</td><td>${s.averageWaste}%</td>
  </tr>`).join('');

  summaryEl.innerHTML = `<table>
  <thead><tr>
    <th style="text-align:left">Tipo de tablero</th>
    <th>Tableros</th><th>Piezas</th><th>% Desperdicio</th>
  </tr></thead>
  <tbody>${rows}</tbody>
  <tfoot><tr class="total-row">
    <td style="text-align:left">TOTAL</td>
    <td>${data.totalBoards}</td><td>${data.totalPieces}</td><td>${data.overallWaste}%</td>
  </tr></tfoot>
</table>`;
}

// ── Helpers ───────────────────────────────────────────────────
function pieceColor(c) {
  if (!c) return '#e2e8f0';
  const m = { TRX: { E:'#BFDBFE', EE:'#93C5FD', H:'#60A5FA', EH:'#3B82F6' },
               TBX: { E:'#BBF7D0', EE:'#86EFAC', H:'#4ADE80', EH:'#22C55E' } };
  return m[c.tipo]?.[c.propiedades] ?? '#e2e8f0';
}

function esc(s) {
  return String(s ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
