'use strict';

const express = require('express');
const multer  = require('multer');
const { parse: parseCsvSync } = require('csv-parse/sync');
const pdfParse = require('pdf-parse');
const path = require('path');

const app = express();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }
});

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// ============================================================
// CONSTANTS
// ============================================================

const BOARD_WIDTH  = 1200;  // mm
const BOARD_HEIGHT = 2800;  // mm
const ESPESORES    = [119, 90, 75];

// ============================================================
// NOTA CLAVE PARSER
// ============================================================

function parseNotaClave(raw) {
  if (!raw || typeof raw !== 'string') return null;
  const s = raw.trim().toUpperCase();
  // EH and EE must be tested before H and E to avoid partial matches
  const m = s.match(/^(TRX|TBX)\.(119|90|75)\.(EH|EE|H|E)\.SC\.(\d+)$/);
  if (!m) return null;
  return { tipo: m[1], espesor: parseInt(m[2]), propiedades: m[3], sequence: m[4] };
}

function isHydro(propiedades) {
  return propiedades === 'H' || propiedades === 'EH';
}

// ============================================================
// COMPATIBILITY GROUPING  (Rules R1–R5)
// ============================================================

function getBoardGroupKey(components) {
  return `${components.tipo}.${components.espesor}.${isHydro(components.propiedades) ? 'H' : 'E'}`;
}

function groupPieces(pieces) {
  const groups = {};
  for (const p of pieces) {
    const key = getBoardGroupKey(p.components);
    if (!groups[key]) groups[key] = [];
    groups[key].push(p);
  }

  // R5: TRX E/EE can go in TRX H boards of same espesor → merge when both exist
  for (const esp of ESPESORES) {
    const hKey = `TRX.${esp}.H`;
    const eKey = `TRX.${esp}.E`;
    if (groups[hKey] && groups[eKey]) {
      groups[hKey].push(...groups[eKey]);
      delete groups[eKey];
    }
  }

  return groups;
}

// ============================================================
// BIN PACKING — Shelf / Strip algorithm (FFD)
// ============================================================

function tryPlace(board, piece) {
  // Try both orientations; prefer non-rotated first
  const orientations = [
    { w: piece.length, h: piece.height, rotated: false },
    { w: piece.height, h: piece.length, rotated: true  }
  ].filter(o => o.w <= BOARD_WIDTH && o.h <= BOARD_HEIGHT);

  for (const { w, h, rotated } of orientations) {
    // Fit in an existing shelf
    for (const shelf of board.shelves) {
      if (shelf.remaining >= w && h <= shelf.height) {
        const x = BOARD_WIDTH - shelf.remaining;
        board.placed.push({ ...piece, x, y: shelf.y, placedLength: w, placedHeight: h, rotated });
        shelf.remaining -= w;
        return true;
      }
    }

    // Open a new shelf below existing ones
    const usedH = board.shelves.reduce((sum, s) => sum + s.height, 0);
    if (usedH + h <= BOARD_HEIGHT) {
      board.shelves.push({ y: usedH, height: h, remaining: BOARD_WIDTH - w });
      board.placed.push({ ...piece, x: 0, y: usedH, placedLength: w, placedHeight: h, rotated });
      return true;
    }
  }

  return false;
}

function packGroup(groupPieces, groupKey) {
  // Sort descending by height then by length for better strip utilization
  const sorted = [...groupPieces].sort((a, b) =>
    b.height !== a.height ? b.height - a.height : b.length - a.length
  );

  const boards = [];

  for (const piece of sorted) {
    let placed = false;
    for (const board of boards) {
      if (tryPlace(board, piece)) { placed = true; break; }
    }
    if (!placed) {
      const board = { groupKey, shelves: [], placed: [] };
      boards.push(board);
      tryPlace(board, piece);
    }
  }

  const totalArea = BOARD_WIDTH * BOARD_HEIGHT;

  return boards.map(board => {
    const usedArea = board.placed.reduce((s, p) => s + p.placedLength * p.placedHeight, 0);
    return {
      groupKey: board.groupKey,
      pieces:   board.placed,
      usedArea,
      wasteArea:       totalArea - usedArea,
      wastePercentage: +((totalArea - usedArea) / totalArea * 100).toFixed(1)
    };
  });
}

function optimize(pieces) {
  const groups = groupPieces(pieces);
  const allBoards = [];
  let globalIdx = 1;

  for (const [groupKey, gPieces] of Object.entries(groups)) {
    const boards = packGroup(gPieces, groupKey);
    for (const b of boards) { b.boardIndex = globalIdx++; }
    allBoards.push(...boards);
  }

  // Build per-type summary
  const summaryMap = {};
  for (const b of allBoards) {
    if (!summaryMap[b.groupKey]) {
      summaryMap[b.groupKey] = { boardCount: 0, pieceCount: 0, wasteSum: 0 };
    }
    summaryMap[b.groupKey].boardCount++;
    summaryMap[b.groupKey].pieceCount += b.pieces.length;
    summaryMap[b.groupKey].wasteSum   += b.wastePercentage;
  }

  const summary = Object.entries(summaryMap).map(([key, s]) => ({
    groupKey:     key,
    boardCount:   s.boardCount,
    pieceCount:   s.pieceCount,
    averageWaste: +(s.wasteSum / s.boardCount).toFixed(1)
  }));

  const totalArea = BOARD_WIDTH * BOARD_HEIGHT * allBoards.length;
  const usedArea  = allBoards.reduce((s, b) => s + b.usedArea, 0);

  return {
    boards:      allBoards,
    summary,
    totalBoards: allBoards.length,
    totalPieces: pieces.length,
    overallWaste: totalArea > 0 ? +((totalArea - usedArea) / totalArea * 100).toFixed(1) : 0,
    generatedAt:  new Date().toISOString()
  };
}

// ============================================================
// PARSING HELPERS
// ============================================================

function parseNum(str) {
  if (str === undefined || str === null || str === '') return NaN;
  return parseFloat(String(str).trim().replace(',', '.'));
}

function validatePiece(row) {
  const errors = [];
  const components = parseNotaClave(row.notaClave);

  if (!components) {
    errors.push(`Nota Clave inválida: "${row.notaClave}" (esperado: TIPO.ESPESOR.PROP.SC.NNN)`);
  }

  const length = parseNum(row.length);
  const height = parseNum(row.height);

  if (isNaN(length) || length <= 0) {
    errors.push(`Longitud inválida: "${row.length}"`);
  } else if (length > BOARD_WIDTH) {
    errors.push(`Longitud ${length}mm supera el máximo (${BOARD_WIDTH}mm)`);
  }

  if (isNaN(height) || height <= 0) {
    errors.push(`Altura inválida: "${row.height}"`);
  } else if (height > BOARD_HEIGHT) {
    errors.push(`Altura ${height}mm supera el máximo (${BOARD_HEIGHT}mm)`);
  }

  const name = String(row.name || '').trim();
  if (!name) errors.push('Nombre vacío');

  if (errors.length > 0) return { errors };

  return {
    piece: {
      notaClave:     row.notaClave.trim().toUpperCase(),
      components,
      packageNumber: String(row.packageNumber || '').trim(),
      name,
      length,
      height
    }
  };
}

// Normalize CSV/PDF column names to internal keys
function normalizeRow(record) {
  const keys = Object.keys(record);
  const norm  = s =>
    s.toLowerCase()
     .normalize('NFD').replace(/[̀-ͯ]/g, '')
     .replace(/[^a-z0-9]/g, '');

  const find = (...patterns) => {
    for (const pat of patterns) {
      const key = keys.find(k => norm(k).includes(norm(pat)));
      if (key !== undefined) return String(record[key] ?? '').trim();
    }
    return '';
  };

  return {
    notaClave:     find('notaclave', 'nota', 'clave', 'codigo'),
    packageNumber: find('paquete', 'package', 'num', 'no'),
    name:          find('nombre', 'name', 'pieza', 'descripcion'),
    length:        find('longitud', 'length', 'largo', 'ancho'),
    height:        find('altura', 'height', 'alto', 'desconectada')
  };
}

function parseCsvBuffer(buffer) {
  const text = buffer.toString('utf-8');
  let records;

  for (const delimiter of [',', ';', '\t']) {
    try {
      const r = parseCsvSync(text, { columns: true, skip_empty_lines: true, trim: true, delimiter });
      if (r.length > 0) { records = r; break; }
    } catch (_) { /* try next */ }
  }

  if (!records || records.length === 0) {
    return { pieces: [], errors: [{ row: 1, message: 'No se encontraron filas en el CSV' }] };
  }

  const pieces = [], errors = [];
  records.forEach((rec, i) => {
    const row = normalizeRow(rec);
    const res = validatePiece(row);
    if (res.errors) errors.push({ row: i + 2, message: res.errors.join('; ') });
    else            pieces.push(res.piece);
  });

  return { pieces, errors };
}

async function parsePdfBuffer(buffer) {
  let data;
  try {
    data = await pdfParse(buffer);
  } catch (e) {
    return { pieces: [], errors: [{ row: 0, message: `Error leyendo PDF: ${e.message}` }] };
  }

  // pdf-parse concatenates the package number (1-9) directly onto the SC sequence
  // when columns are close together, e.g. "TRX.119.E.SC.000" + "1" → "TRX.119.E.SC.0001".
  // Two-digit packages (10+) always appear space-separated: "SC.000 11".
  // The regex captures: (TIPO.ESP.PROP).SC.(DIGITS) [OPT_SPACE_PKG] (P-NAME) (LENGTH) (HEIGHT)
  const rowRegex = /((TRX|TBX)\.(119|90|75)\.(EH|EE|H|E))\.SC\.(\d+)(?:\s+(\d+))?\s+(P\S+)\s+(\d+[.,]\d+)\s+(\d+[.,]\d+)/gi;

  const rawRows = [];
  let m;
  while ((m = rowRegex.exec(data.text)) !== null) {
    const tipo     = m[2];
    const espesor  = m[3];
    const prop     = m[4];
    const scDigits = m[5];
    const sepPkg   = m[6]; // defined only when space-separated (packages 10+)

    // Canonical NC — normalize SC sequence to 000
    const notaClave = `${tipo}.${espesor}.${prop}.SC.000`;

    // Package number: space-separated (sepPkg) or appended to SC digits (strip leading zeros)
    const packageNumber = sepPkg !== undefined
      ? sepPkg
      : (scDigits.replace(/^0+/, '') || '0');

    rawRows.push({
      notaClave,
      packageNumber,
      name:      m[7],
      lengthRaw: parseFloat(m[8].replace(',', '.')),
      heightRaw: parseFloat(m[9].replace(',', '.'))
    });
  }

  if (rawRows.length === 0) {
    return {
      pieces: [],
      errors: [{ row: 0, message: 'No se encontraron filas de tabla en el PDF. Verifique el formato o use CSV.' }]
    };
  }

  // Auto-detect unit: values ≤ 2.8 are in metres → convert to mm (*1000)
  const maxVal = Math.max(...rawRows.map(r => Math.max(r.lengthRaw, r.heightRaw)));
  const inMetres = maxVal <= 2.8;

  const pieces = [], errors = [];
  rawRows.forEach((row, i) => {
    const length = inMetres ? Math.round(row.lengthRaw * 1000) : Math.round(row.lengthRaw);
    const height = inMetres ? Math.round(row.heightRaw * 1000) : Math.round(row.heightRaw);

    const res = validatePiece({ notaClave: row.notaClave, packageNumber: row.packageNumber, name: row.name, length, height });
    if (res.errors) errors.push({ row: i + 1, message: res.errors.join('; ') });
    else            pieces.push(res.piece);
  });

  return { pieces, errors };
}

// ============================================================
// API
// ============================================================

app.get('/api/version', (_req, res) => res.json({ version: 'v2', ts: new Date().toISOString() }));

app.post('/api/process', upload.single('file'), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'No se recibió ningún archivo' });
  }

  const ext = path.extname(req.file.originalname).toLowerCase().slice(1);

  let parseResult;
  try {
    if (ext === 'csv' || ext === 'txt') {
      parseResult = parseCsvBuffer(req.file.buffer);
    } else if (ext === 'pdf') {
      parseResult = await parsePdfBuffer(req.file.buffer);
    } else {
      return res.status(400).json({ error: `Formato no soportado: .${ext}. Use CSV o PDF.` });
    }
  } catch (err) {
    return res.status(500).json({ error: `Error procesando el archivo: ${err.message}` });
  }

  const { pieces, errors } = parseResult;

  if (pieces.length === 0) {
    return res.status(422).json({
      error: 'No se encontraron piezas válidas para optimizar.',
      parseErrors: errors
    });
  }

  try {
    const result = optimize(pieces);
    return res.json({ parseErrors: errors, ...result });
  } catch (err) {
    return res.status(500).json({ error: `Error en la optimización: ${err.message}` });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`\n  Pladurcuter → http://localhost:${PORT}\n`));
