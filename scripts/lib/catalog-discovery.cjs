/**
 * catalog-discovery.cjs — Lee scripts/.discovery.json y produce un catálogo
 * categorizado de cada XLSX según su granularidad (comuna / age / cat).
 * Marca con ✅ los archivos ya usados por el pipeline actual.
 */

const fs = require("fs");
const path = require("path");

const DISCOVERY = path.join(__dirname, "..", ".discovery.json");
const data = JSON.parse(fs.readFileSync(DISCOVERY, "utf8"));

const folderRe = /1- Poblacion[\\/]([^\\/]+)[\\/]([^\\/]+\.xlsx)/i;

const groups = {};
for (const item of data) {
  if (!item.file) continue;
  const m = item.file.match(folderRe);
  if (!m) continue;
  groups[m[1]] = groups[m[1]] || [];
  groups[m[1]].push({ fname: m[2], sheets: item.sheets });
}

function classify(sheet) {
  const rows = sheet.first15 || [];
  let comuna = 0, age = 0;
  for (const r of rows) {
    if (!r) continue;
    const c0 = r[0] == null ? "" : String(r[0]).trim();
    if (/^0?2\d{3}$/.test(c0)) comuna++;
    if (/^\d+(\s*-\s*\d+)?$/.test(c0)) age++;
  }
  if (comuna >= 6) return "comuna";
  if (age >= 5) return "age";
  return "cat";
}

function topic(sheet) {
  const rows = sheet.first15 || [];
  const cells = [];
  for (let i = 2; i < Math.min(5, rows.length); i++) {
    const r = rows[i] || [];
    for (const c of r) {
      if (typeof c === "string" && c.trim().length > 2) cells.push(c.replace(/\s+/g, " ").trim());
    }
  }
  // Dedup, take first 4 unique
  const seen = new Set();
  const out = [];
  for (const c of cells) {
    if (seen.has(c)) continue;
    seen.add(c);
    out.push(c.length > 36 ? c.slice(0, 36) + "…" : c);
    if (out.length >= 4) break;
  }
  return out.join(" / ");
}

const usedFiles = new Set([
  "c2022_caba_est_c1_1.xlsx",
  "c2022_caba_pob_c4_1.xlsx",
  "c2022_caba_salud_c1_1.xlsx",
  "c2022_caba_prevision_c3_1.xlsx",
  "c2022_caba_hogares_c4_1.xlsx",
  "c2022_caba_hogares_c6_1.xlsx",
  "c2022_caba_vivienda_c1_1.xlsx",
  "c2022_caba_vivienda_c3_1.xlsx",
  "c2022_caba_educacion_c1_1.xlsx",
  "c2022_caba_educacion_c2_1.xlsx",
  "c2022_caba_actividad_economica_c1_1.xlsx",
  "c2022_caba_fecundidad_c1_1.xlsx",
]);

console.log("═".repeat(120));
for (const folder of Object.keys(groups).sort()) {
  console.log("\n📂", folder);
  console.log("─".repeat(120));
  for (const f of groups[folder]) {
    // Pick the first non-Carátula non-Índice sheet
    const main = f.sheets.find(s =>
      s.sheet.startsWith("Cuadro") && !/\.\d+\.\d+/.test(s.sheet)
    );
    if (!main) continue;
    const cls = classify(main);
    const t = topic(main);
    const used = usedFiles.has(f.fname) ? "✅" : "⬜";
    console.log(" ", used, f.fname.padEnd(50), `[${cls}]`.padEnd(10), t);
  }
}
console.log();
