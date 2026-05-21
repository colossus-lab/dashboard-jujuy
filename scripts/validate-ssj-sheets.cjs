/**
 * validate-ssj-sheets.cjs
 *
 * Fase 0 del apartado SSJ: para cada XLSX censal en `1- Poblacion/`,
 * reporta:
 *   - Hojas disponibles
 *   - Si la hoja principal (Cuadro X.10) trae fila con código "38021" (Dr. M. Belgrano)
 *   - Si existen sub-hojas "Cuadro X.10.N" y qué N corresponde a Belgrano
 *
 * READ-ONLY. No genera nada en public/. Solo imprime a consola.
 *
 * Uso: node scripts/validate-ssj-sheets.cjs
 */

const fs = require("fs");
const path = require("path");
const XLSX = require("xlsx");

const { readSheetRows, extractJujuyTable } = require("./lib/xlsx-utils.cjs");
const { normalizeCode } = require("./lib/geo-departamentos-jujuy.cjs");

const ROOT = path.resolve(__dirname, "..");
const RAW_DIR = path.join(ROOT, "1- Poblacion");
const BELGRANO = "38021";

function listXlsxRecursive(dir) {
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...listXlsxRecursive(full));
    else if (entry.name.toLowerCase().endsWith(".xlsx")) out.push(full);
  }
  return out;
}

function hasBelgranoRow(rows) {
  for (const r of rows) {
    if (!r || r.length === 0) continue;
    const c = normalizeCode(r[0]);
    if (c === BELGRANO) return true;
  }
  return false;
}

function findBelgranoSubsheet(wb) {
  for (const name of wb.SheetNames) {
    if (!/^cuadro\s+[\d.]+$/i.test(name.trim())) continue;
    try {
      const ws = wb.Sheets[name];
      const rows = XLSX.utils.sheet_to_json(ws, { header: 1, blankrows: false, defval: null, raw: true });
      const titleRow = rows.slice(0, 6).find(r => r && r.some(c => typeof c === "string" && /Dr\.\s*Manuel\s*Belgrano/i.test(c)));
      if (titleRow) return name;
    } catch (_) { /* skip */ }
  }
  return null;
}

function inspectFile(filePath) {
  const wb = XLSX.readFile(filePath, { cellDates: false });
  const fileRel = path.relative(ROOT, filePath);
  const sheets = wb.SheetNames.filter(n => !/^(carátula|caratula|índice|indice)$/i.test(n.trim()));

  console.log(`\n📄 ${fileRel}`);
  console.log(`   Hojas (${sheets.length}): ${sheets.map(s => `"${s}"`).join(", ")}`);

  const mainSheets = sheets.filter(n => /^cuadro\s+\d+\.\d+$/i.test(n.trim()));
  const subSheets  = sheets.filter(n => /^cuadro\s+\d+\.\d+\.\d+$/i.test(n.trim()));

  // Estrategia A: hoja principal con fila 38021
  let mainHasBelgrano = false;
  let mainSheetName = null;
  for (const n of mainSheets) {
    try {
      const rows = readSheetRows(filePath, n);
      if (hasBelgranoRow(rows)) { mainHasBelgrano = true; mainSheetName = n; break; }
    } catch (_) { /* skip */ }
  }

  // Estrategia B: sub-hoja específica de Belgrano
  const belgranoSubsheet = subSheets.length ? findBelgranoSubsheet(wb) : null;

  if (mainHasBelgrano) {
    console.log(`   ✅ ESTRATEGIA A — hoja principal "${mainSheetName}" trae fila 38021 (Belgrano)`);
  } else if (belgranoSubsheet) {
    console.log(`   ✅ ESTRATEGIA B — sub-hoja "${belgranoSubsheet}" corresponde a Belgrano`);
  } else if (subSheets.length) {
    console.log(`   ⚠️  Sub-hojas presentes pero ninguna identificada para Belgrano (revisar manualmente)`);
  } else {
    console.log(`   ⚠️  Solo hoja principal sin fila 38021 — informe puede estar limitado a indicadores provinciales`);
  }

  return {
    file: fileRel,
    mainSheet: mainSheetName,
    mainHasBelgrano,
    belgranoSubsheet,
    subSheetCount: subSheets.length,
  };
}

function main() {
  console.log("═".repeat(78));
  console.log("  Fase 0 — Validación de hojas SSJ para Dr. M. Belgrano (38021)");
  console.log("═".repeat(78));

  const files = listXlsxRecursive(RAW_DIR);
  const results = files.map(inspectFile);

  console.log(`\n${"═".repeat(78)}`);
  console.log("  RESUMEN");
  console.log("═".repeat(78));

  const a = results.filter(r => r.mainHasBelgrano).length;
  const b = results.filter(r => !r.mainHasBelgrano && r.belgranoSubsheet).length;
  const u = results.filter(r => !r.mainHasBelgrano && !r.belgranoSubsheet).length;

  console.log(`  ✅ ${a} archivos: estrategia A (hoja principal + filtro 38021)`);
  console.log(`  ✅ ${b} archivos: estrategia B (sub-hoja Belgrano)`);
  console.log(`  ⚠️  ${u} archivos: sin acceso directo a datos de Belgrano (provincial-only)`);

  const tablePath = path.join(__dirname, ".ssj-sheets.json");
  fs.writeFileSync(tablePath, JSON.stringify(results, null, 2));
  console.log(`\n  → mapeo completo guardado en scripts/.ssj-sheets.json`);
}

main();
