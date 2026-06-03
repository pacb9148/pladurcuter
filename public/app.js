'use strict';

// ============================================================
// DOM REFS
// ============================================================

const dropZone             = document.getElementById('drop-zone');
const fileInput            = document.getElementById('file-input');
const fileSelectedDiv      = document.getElementById('file-selected');
const fileNameDisplay      = document.getElementById('file-name-display');
const btnClearFile         = document.getElementById('btn-clear-file');
const btnOptimize          = document.getElementById('btn-optimize');
const btnText              = document.getElementById('btn-text');
const btnSpinner           = document.getElementById('btn-spinner');
const btnNew               = document.getElementById('btn-new');
const btnPrint             = document.getElementById('btn-print');
const uploadSection        = document.getElementById('upload-section');
const resultsSection       = document.getElementById('results-section');
const boardsContainer      = document.getElementById('boards-container');
const summaryContainer     = document.getElementById('summary-container');
const parseErrorsContainer = document.getElementById('parse-errors-container');
const parseErrorsList      = document.getElementById('parse-errors-list');
const resultMeta           = document.getElementById('result-meta');
const printDate            = document.getElementById('print-date');
const uploadError          = document.getElementById('upload-error');
const uploadErrorMsg       = document.getElementById('upload-error-msg');

// ============================================================
// STATE
// ============================================================

let currentFile = null;

// ============================================================
// FILE HANDLING
// ============================================================

dropZone.addEventListener('click', () => fileInput.click());
dropZone.addEventListener('keydown', e => {
  if (e.key === 'Enter' || e.key === ' ') fileInput.click();
});
fileInput.addEventListener('change', e => {
  if (e.target.files[0]) setFile(e.target.files[0]);
});

dropZone.addEventListener('dragover', e => {
  e.preventDefault();
  dropZone.classList.add('drag-over');
});
dropZone.addEventListener('dragleave', () => dropZone.classList.remove('drag-over'));
dropZone.addEventListener('drop', e => {
  e.preventDefault();
  dropZone.classList.remove('drag-over');
  const file = e.dataTransfer.files[0];
  if (file) setFile(file);
});

btnClearFile.addEventListener('click', clearFile);

function setFile(file) {
  const ext = file.name.split('.').pop().toLowerCase();
  if (!['csv', 'pdf', 'txt'].includes(ext)) {
    showUploadError('Formato no soportado. Use archivos CSV o PDF.');
    return;
  }
  currentFile = file;
  fileNameDisplay.textContent = `${file.name}  (${fmtBytes(file.size)})`;
  fileSelectedDiv.classList.remove('d-none');
  dropZone.classList.add('d-none');
  btnOptimize.disabled = false;
  hideUploadError();
}

function clearFile() {
  currentFile        = null;
  fileInput.value    = '';
  fileSelectedDiv.classList.add('d-none');
  dropZone.classList.remove('d-none');
  btnOptimize.disabled = true;
  hideUploadError();
}

function fmtBytes(b) {
  if (b < 1024)           return b + ' B';
  if (b < 1024 * 1024)    return (b / 1024).toFixed(1) + ' KB';
  return (b / 1048576).toFixed(1) + ' MB';
}

function showUploadError(msg) {
  uploadErrorMsg.textContent = msg;
  uploadError.classList.remove('d-none');
}
function hideUploadError() {
  uploadError.classList.add('d-none');
}

// ============================================================
// OPTIMIZE
// ============================================================

btnOptimize.addEventListener('click', handleOptimize);

async function handleOptimize() {
  if (!currentFile) return;
  setLoading(true);
  hideUploadError();

  try {
    const fd = new FormData();
    fd.append('file', currentFile);

    const res  = await fetch('/api/process', { method: 'POST', body: fd });
    const data = await res.json();

    if (!res.ok) {
      const msg = data.error || 'Error desconocido';
      const errDetail = data.parseErrors?.length
        ? '\n' + data.parseErrors.map(e => `  · Fila ${e.row}: ${e.message}`).join('\n')
        : '';
      showUploadError(msg + errDetail);
      return;
    }

    renderResults(data);
  } catch (err) {
    showUploadError('Error de conexión: ' + err.message);
  } finally {
    setLoading(false);
  }
}

function setLoading(on) {
  btnOptimize.disabled = on;
  btnText.textContent  = on ? 'Procesando...' : '⚙️ Subir y Optimizar';
  btnSpinner.classList.toggle('d-none', !on);
}

// ============================================================
// RENDER RESULTS
// ============================================================

btnNew.addEventListener('click', resetToUpload);
btnPrint.addEventListener('click', () => window.print());

function renderResults(result) {
  uploadSection.classList.add('d-none');
  resultsSection.classList.remove('d-none');

  // Parse warnings
  if (result.parseErrors?.length) {
    parseErrorsContainer.classList.remove('d-none');
    parseErrorsList.innerHTML = result.parseErrors
      .map(e => `<li>Fila ${e.row}: ${escHtml(e.message)}</li>`)
      .join('');
  } else {
    parseErrorsContainer.classList.add('d-none');
  }

  // Meta
  const dt = new Date(result.generatedAt).toLocaleString('es-ES');
  resultMeta.textContent = `${result.totalPieces} piezas · ${result.totalBoards} tableros · ${result.overallWaste}% desperdicio global`;
  printDate.textContent  = `Generado: ${dt}`;

  // Boards
  boardsContainer.innerHTML = '';
  result.boards.forEach(board => boardsContainer.appendChild(buildBoardCard(board)));

  // Summary
  renderSummary(result);

  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function resetToUpload() {
  resultsSection.classList.add('d-none');
  uploadSection.classList.remove('d-none');
  boardsContainer.innerHTML   = '';
  summaryContainer.innerHTML  = '';
  clearFile();
  window.scrollTo({ top: 0 });
}

// ============================================================
// BOARD CARD
// ============================================================

function buildBoardCard(board) {
  const wasteBadge = board.wastePercentage > 20 ? 'bg-danger'
                   : board.wastePercentage > 10 ? 'bg-warning text-dark'
                   : 'bg-success';

  const div = document.createElement('div');
  div.className = 'board-page card shadow-sm mb-4';
  div.innerHTML = `
    <div class="card-header d-flex justify-content-between align-items-center py-2">
      <span class="fw-bold">Tablero #${board.boardIndex} &nbsp;—&nbsp; ${escHtml(board.groupKey)}</span>
      <span class="badge ${wasteBadge}">Desperdicio: ${board.wastePercentage}%</span>
    </div>
    <div class="card-body p-3">
      <div class="row g-3 align-items-start">
        <div class="col-sm-5 col-md-4 col-lg-3">
          ${buildBoardSVG(board)}
          <p class="text-center text-muted small mt-1 mb-0">
            ${board.pieces.length} pieza${board.pieces.length !== 1 ? 's' : ''}
            · Útil: ${(board.usedArea / (1200 * 2800) * 100).toFixed(1)}%
          </p>
        </div>
        <div class="col-sm-7 col-md-8 col-lg-9">
          ${buildPieceTable(board)}
        </div>
      </div>
    </div>`;
  return div;
}

// ============================================================
// SVG DIAGRAM
// ============================================================

function buildBoardSVG(board) {
  const BW = 1200, BH = 2800;
  const uid = `b${board.boardIndex}`;

  const pieceSVG = board.pieces.map((p, i) => {
    const color  = pieceColor(p.components);
    const clipId = `cl${uid}i${i}`;
    const minDim = Math.min(p.placedLength, p.placedHeight);
    const fName  = Math.max(28, Math.min(110, minDim * 0.28));
    const fDim   = Math.max(20, Math.min(80,  minDim * 0.20));
    const cx = p.x + p.placedLength / 2;
    const cy = p.y + p.placedHeight / 2;

    return `
  <clipPath id="${clipId}">
    <rect x="${p.x + 6}" y="${p.y + 6}" width="${Math.max(0, p.placedLength - 12)}" height="${Math.max(0, p.placedHeight - 12)}"/>
  </clipPath>
  <rect x="${p.x}" y="${p.y}" width="${p.placedLength}" height="${p.placedHeight}"
        fill="${color}" stroke="#1e293b" stroke-width="5" rx="3"/>
  <g clip-path="url(#${clipId})" font-family="Arial,Helvetica,sans-serif">
    <text x="${cx}" y="${cy - fDim * 0.6}"
          text-anchor="middle" dominant-baseline="middle"
          font-size="${fName}" font-weight="700" fill="#1e293b">${escSvg(p.name)}</text>
    <text x="${cx}" y="${cy + fName * 0.7}"
          text-anchor="middle" dominant-baseline="middle"
          font-size="${fDim}" fill="#475569">${p.placedLength}×${p.placedHeight}mm${p.rotated ? ' ↻' : ''}</text>
  </g>`;
  }).join('');

  return `<svg class="board-svg"
         viewBox="0 0 ${BW} ${BH}"
         xmlns="http://www.w3.org/2000/svg"
         role="img"
         aria-label="Diagrama del tablero ${board.boardIndex}: ${board.groupKey}">
  <defs>
    <pattern id="wp${uid}" patternUnits="userSpaceOnUse" width="120" height="120" patternTransform="rotate(45)">
      <rect width="120" height="120" fill="#f1f5f9"/>
      <rect width="48" height="120" fill="#e2e8f0"/>
    </pattern>
  </defs>
  <rect width="${BW}" height="${BH}" fill="url(#wp${uid})"/>
  ${pieceSVG}
  <rect width="${BW}" height="${BH}" fill="none" stroke="#0f172a" stroke-width="16"/>
</svg>`;
}

// ============================================================
// PIECE TABLE
// ============================================================

function buildPieceTable(board) {
  const rows = board.pieces
    .slice()
    .sort((a, b) =>
      (a.packageNumber || '').localeCompare(b.packageNumber || '', 'es', { numeric: true })
    )
    .map(p => `
      <tr>
        <td class="text-nowrap">${escHtml(p.packageNumber)}</td>
        <td>${escHtml(p.name)}</td>
        <td class="text-end text-nowrap">${p.length}</td>
        <td class="text-end text-nowrap">${p.height}</td>
        <td class="text-nowrap small font-monospace">${escHtml(p.notaClave)}</td>
        <td class="text-center">${p.rotated ? '<span title="Pieza rotada">↻</span>' : ''}</td>
      </tr>`)
    .join('');

  return `<div class="table-responsive">
  <table class="table table-sm table-bordered table-hover mb-0 align-middle"
         aria-label="Lista de piezas del tablero ${board.boardIndex}">
    <thead class="table-dark">
      <tr>
        <th scope="col">Paquete</th>
        <th scope="col">Nombre</th>
        <th scope="col" class="text-end">Long. (mm)</th>
        <th scope="col" class="text-end">Alt. (mm)</th>
        <th scope="col">Nota Clave</th>
        <th scope="col" class="text-center">Rot.</th>
      </tr>
    </thead>
    <tbody>${rows}</tbody>
  </table>
</div>`;
}

// ============================================================
// SUMMARY TABLE
// ============================================================

function renderSummary(result) {
  const typeRows = result.summary.map(s => `
    <tr>
      <td class="fw-semibold font-monospace">${escHtml(s.groupKey)}</td>
      <td class="text-center">${s.boardCount}</td>
      <td class="text-center">${s.pieceCount}</td>
      <td class="text-center">${s.averageWaste}%</td>
    </tr>`).join('');

  summaryContainer.innerHTML = `
  <div class="table-responsive">
    <table class="table table-bordered summary-table"
           aria-label="Resumen de tableros usados por tipo">
      <thead class="table-primary">
        <tr>
          <th scope="col">Tipo de tablero</th>
          <th scope="col" class="text-center">Tableros usados</th>
          <th scope="col" class="text-center">Piezas</th>
          <th scope="col" class="text-center">% Desperdicio medio</th>
        </tr>
      </thead>
      <tbody>${typeRows}</tbody>
      <tfoot class="table-dark fw-bold">
        <tr>
          <td>TOTAL</td>
          <td class="text-center">${result.totalBoards}</td>
          <td class="text-center">${result.totalPieces}</td>
          <td class="text-center">${result.overallWaste}%</td>
        </tr>
      </tfoot>
    </table>
  </div>`;
}

// ============================================================
// HELPERS
// ============================================================

function pieceColor(components) {
  if (!components) return '#E2E8F0';
  const map = {
    TRX: { E: '#BFDBFE', EE: '#93C5FD', H: '#60A5FA', EH: '#3B82F6' },
    TBX: { E: '#BBF7D0', EE: '#86EFAC', H: '#4ADE80', EH: '#22C55E' }
  };
  return map[components.tipo]?.[components.propiedades] ?? '#E2E8F0';
}

function escHtml(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function escSvg(str) {
  return String(str ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
