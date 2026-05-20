/**
 * inspect-xlsx.cjs
 *
 * Discovery utility — recorre todos los .xlsx en `1- Poblacion/`,
 * imprime hojas, dimensiones, primeras filas y escribe un dump
 * a `scripts/.discovery.json` para guiar el código de los generadores.
 *
 * No es parte del build pipeline. Uso manual:
 *   node scripts/lib/inspect-xlsx.cjs
 */

const fs = require("fs");
const path = require("path");
const XLSX = require("xlsx");

const ROOT = path.resolve(__dirname, "..", "..");
const RAW_DIR = path.join(ROOT, "1- Poblacion");
const OUT = path.join(__dirname, "..", ".discovery.json");

function listXlsxRecursive(dir) {
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...listXlsxRecursive(full));
    else if (entry.name.toLowerCase().endsWith(".xlsx")) out.push(full);
  }
  return out;
}

function inspect(filePath) {
  const wb = XLSX.readFile(filePath, { cellDates: false });
  const sheets = wb.SheetNames.map((name) => {
    const ws = wb.Sheets[name];
    const ref = ws["!ref"] || "A1:A1";
    const range = XLSX.utils.decode_range(ref);
    const rows = XLSX.utils.sheet_to_json(ws, {
      header: 1,
      blankrows: false,
      defval: null,
      raw: true,
    });
    return {
      sheet: name,
      ref,
      nRows: range.e.r - range.s.r + 1,
      nCols: range.e.c - range.s.c + 1,
      first15: rows.slice(0, 15),
      last3: rows.slice(Math.max(0, rows.length - 3)),
    };
  });
  return { file: path.relative(ROOT, filePath), sheets };
}

function main() {
  const files = listXlsxRecursive(RAW_DIR);
  console.log(`Inspecting ${files.length} .xlsx files...`);
  const dump = files.map((f) => {
    try {
      return inspect(f);
    } catch (err) {
      return { file: path.relative(ROOT, f), error: err.message };
    }
  });
  fs.writeFileSync(OUT, JSON.stringify(dump, null, 2));
  console.log(`✅ Wrote ${OUT}`);
  console.log("\nSummary:");
  for (const item of dump) {
    if (item.error) {
      console.log(`  ❌ ${item.file}: ${item.error}`);
      continue;
    }
    console.log(`  📄 ${item.file}`);
    for (const s of item.sheets) {
      console.log(`     • [${s.sheet}] ${s.nRows}r × ${s.nCols}c (${s.ref})`);
    }
  }
}

main();
