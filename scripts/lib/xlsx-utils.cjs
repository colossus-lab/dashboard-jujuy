/**
 * xlsx-utils.cjs — helpers de lectura de XLSX del Censo INDEC para Jujuy
 *
 * Patrón típico de los Cuadros N.10 del Censo (Jujuy + 16 departamentos):
 *   filas 0-1 : títulos
 *   filas 2-4 : encabezados multinivel (merged)
 *   fila ~4-5 : Total Jujuy (código "38")
 *   filas siguientes (16) : una por departamento (códigos "38007"..."38112")
 */

const path = require("path");
const XLSX = require("xlsx");
const { toNumber } = require("./formatters.cjs");
const {
  DEPARTAMENTOS_JUJUY,
  isTotalJujuy,
  getDepartamentoByCodigo,
} = require("./geo-departamentos-jujuy.cjs");

function readWorkbook(filePath) {
  return XLSX.readFile(filePath, { cellDates: false });
}

// Normalize sheet name for matching: collapse NBSP and other Unicode whitespace
// to a regular space, then trim.
function normalizeSheetName(s) {
  return String(s).replace(/[\s ]+/g, " ").trim();
}

function readSheetRows(filePath, sheetName) {
  const wb = readWorkbook(filePath);
  let ws = null;
  if (sheetName) {
    ws = wb.Sheets[sheetName];
    if (!ws) {
      // Pass 1: normalized exact match (handles NBSP, case)
      const target = normalizeSheetName(sheetName).toLowerCase();
      let found = wb.SheetNames.find(n => normalizeSheetName(n).toLowerCase() === target);

      // Pass 2: match by cuadro NUMBER (eg "Cuadro 1.10" → match anything with "1" as primary number)
      // Useful when INDEC names sheets as "Cobertura de salud N°1.10" or "Cuadro 1. 12" (with typo).
      if (!found) {
        const m = String(sheetName).match(/(\d+)\s*[\.\s]\s*\d+/) || String(sheetName).match(/(\d+)/);
        const wantNum = m ? m[1] : null;
        if (wantNum) {
          // Prefer sheets whose name contains a number-like pattern starting with wantNum
          const re = new RegExp(`(^|[^\\d])${wantNum}\\s*[\\.\\s]`);
          found = wb.SheetNames.find(n => re.test(normalizeSheetName(n))) ||
                  wb.SheetNames.find(n => normalizeSheetName(n).includes(`N°${wantNum}`)) ||
                  // last resort: skip well-known meta sheets
                  wb.SheetNames.find(n => !/carátula|caratula|índice|indice/i.test(normalizeSheetName(n)));
        }
      }

      if (found) ws = wb.Sheets[found];
    }
  } else {
    ws = wb.Sheets[wb.SheetNames[0]];
  }
  if (!ws) {
    throw new Error(
      `Sheet not found: "${sheetName}" in ${path.basename(filePath)} (available: ${wb.SheetNames.map(n => `"${n}"`).join(", ")})`
    );
  }
  return XLSX.utils.sheet_to_json(ws, {
    header: 1,
    blankrows: false,
    defval: null,
    raw: true,
  });
}

/**
 * Extrae la fila Total Jujuy y las 16 filas por departamento de un Cuadro N.10.
 * Devuelve: { total: row, comunas: [{ comuna: { codigo, nombre }, row }, ...] }
 *
 * NOTA: La clave se llama "comunas" por compatibilidad con el código heredado
 * de CABA — internamente son departamentos de Jujuy.
 */
function extractJujuyTable(rows) {
  let totalRow = null;
  const deptRows = [];

  for (const r of rows) {
    if (!r || r.length === 0) continue;
    const c0 = r[0];
    const c1 = r[1];

    if (totalRow == null) {
      if (isTotalJujuy(c0)) { totalRow = r; continue; }
      if (typeof c1 === "string" && /^Total$/i.test(c1.trim())) { totalRow = r; continue; }
      if (typeof c0 === "string" && /^Total$/i.test(c0.trim())) { totalRow = r; continue; }
    }

    const dept = getDepartamentoByCodigo(c0);
    if (dept) {
      // Expose both `comuna` (legacy from CABA template) and `departamento`
      deptRows.push({ comuna: dept, departamento: dept, row: r });
    }
  }

  return {
    total: totalRow,
    comunas: deptRows,           // legacy name from CABA pipeline
    departamentos: deptRows,     // semantically correct for Jujuy
  };
}

// Backwards-compat alias para no romper código que importe extractCabaTable
const extractCabaTable = extractJujuyTable;

/**
 * Para hojas tabuladas por edad (Cuadro 2.10 de salud, prevision_c4, fecundidad por edad, etc).
 * Detecta la fila "Total" y luego filas con grupos quinquenales o edades simples.
 * Devuelve: { total: row, byAge: [{ ageLabel, row }, ...] }
 */
function extractAgeTable(rows) {
  let totalRow = null;
  const byAge = [];
  const ageRe = /^\d+(\s*-\s*\d+)?$|^100\s*y\s*m[áa]s$|^100\+$/i;

  for (const r of rows) {
    if (!r || r.length === 0) continue;
    const c0 = r[0];
    if (typeof c0 === "string") {
      const s = c0.trim();
      if (totalRow == null && /^Total$/i.test(s)) { totalRow = r; continue; }
      if (ageRe.test(s)) byAge.push({ ageLabel: s, row: r });
    }
  }

  return { total: totalRow, byAge };
}

/**
 * Lee el Cuadro 1.10 de un archivo (Jujuy + 16 departamentos).
 */
function readJujuyCuadro(filePath, sheetName = "Cuadro 1.10") {
  const rows = readSheetRows(filePath, sheetName);
  return extractJujuyTable(rows);
}

const readCabaCuadro = readJujuyCuadro;

function sumColumn(rows, colIdx) {
  let s = 0;
  for (const r of rows) {
    const v = toNumber(r?.[colIdx]);
    if (v != null) s += v;
  }
  return s;
}

module.exports = {
  readWorkbook,
  readSheetRows,
  readJujuyCuadro,
  readCabaCuadro,
  extractJujuyTable,
  extractCabaTable,
  extractAgeTable,
  sumColumn,
  DEPARTAMENTOS_JUJUY,
  COMUNAS_CABA: DEPARTAMENTOS_JUJUY, // backwards-compat
};
