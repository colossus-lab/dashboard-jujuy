/**
 * ssj-utils.cjs — helpers para el apartado San Salvador de Jujuy
 *
 * El apartado SSJ recorta los datos provinciales al Departamento Dr. Manuel
 * Belgrano (código INDEC "38021"), que contiene a la ciudad capital.
 *
 * Estrategias de lectura validadas por scripts/validate-ssj-sheets.cjs:
 *   A. Hoja principal "Cuadro X.10" → trae fila con código 38021.
 *      Usar getBelgranoRow(extractJujuyTable(rows)).
 *   B. Sub-hoja específica de Belgrano → archivos con 16 sub-hojas
 *      departamentales. La N de Belgrano NO es uniforme: en algunos archivos
 *      es N=2 (orden alfabético sin "Dr.") y en otros N=3 (orden por código
 *      INDEC). readBelgranoSubsheet() autodetecta escaneando los títulos.
 */

const XLSX = require("xlsx");
const { readSheetRows } = require("./xlsx-utils.cjs");
const { getDepartamentoByCodigo } = require("./geo-departamentos-jujuy.cjs");

const BELGRANO_CODIGO = "38021";
const BELGRANO = getDepartamentoByCodigo(BELGRANO_CODIGO);

const _belgranoSheetCache = new Map();

/**
 * Recibe el resultado de extractJujuyTable(rows) y devuelve el item de
 * Belgrano: { comuna, departamento, row } o null.
 */
function getBelgranoRow(jujuyTable) {
  if (!jujuyTable || !Array.isArray(jujuyTable.departamentos)) return null;
  return jujuyTable.departamentos.find(d => d.departamento.codigo === BELGRANO_CODIGO) || null;
}

/**
 * Autodetecta la sub-hoja "Cuadro X.10.N" de Belgrano en el XLSX dado.
 * Escanea las sub-hojas y matchea por el título "departamento Dr. Manuel Belgrano".
 * Resultado cacheado por filePath.
 */
function findBelgranoSheetName(filePath) {
  if (_belgranoSheetCache.has(filePath)) return _belgranoSheetCache.get(filePath);
  const wb = XLSX.readFile(filePath, { cellDates: false });
  for (const name of wb.SheetNames) {
    if (!/^cuadro\s+[\d.]+$/i.test(name.trim())) continue;
    const ws = wb.Sheets[name];
    const rows = XLSX.utils.sheet_to_json(ws, { header: 1, blankrows: false, defval: null, raw: true });
    const hit = rows.slice(0, 6).flat().some(c => typeof c === "string" && /Dr\.\s*Manuel\s*Belgrano/i.test(c));
    if (hit) {
      _belgranoSheetCache.set(filePath, name);
      return name;
    }
  }
  _belgranoSheetCache.set(filePath, null);
  return null;
}

/**
 * Lee la sub-hoja de Belgrano de un XLSX que tiene 16 sub-hojas
 * departamentales. Throws si no se encuentra.
 */
function readBelgranoSubsheet(filePath) {
  const name = findBelgranoSheetName(filePath);
  if (!name) throw new Error(`No se encontró sub-hoja de Belgrano en ${filePath}`);
  return readSheetRows(filePath, name);
}

module.exports = {
  BELGRANO_CODIGO,
  BELGRANO,
  getBelgranoRow,
  findBelgranoSheetName,
  readBelgranoSubsheet,
};
