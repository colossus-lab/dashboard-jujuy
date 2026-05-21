/**
 * build-data.cjs
 *
 * Orquestador del pipeline de datos del Dashboard Jujuy.
 *
 * Ejecuta secuencialmente:
 *   1. generate-report-data.cjs    → 8 informes Población (Censo 2022 Jujuy)
 *   2. process-seguridad.cjs       → SNIC provincial + departamental
 *   3. process-salud.cjs           → defunciones + nacimientos
 *   4. process-empleo.cjs          → empleo registrado SSPM
 *   5. process-mineria.cjs         → minería y litio (SIACAM)
 *   6. process-educacion.cjs       → abandono, repitencia, padrón escuelas
 *
 * Skipea automáticamente el pipeline censal si los XLSX fuente no están
 * disponibles (caso build en Vercel/CI con datos ya committeados en public/).
 *
 * Uso: node scripts/build-data.cjs
 */

const fs = require("fs");
const { execSync } = require("child_process");
const path = require("path");

const SCRIPTS_DIR = __dirname;
const ROOT = path.resolve(SCRIPTS_DIR, "..");
const RAW_DIR = path.join(ROOT, "1- Poblacion");
const PUBLIC_DATA = path.join(ROOT, "public", "data", "poblacion");
const PIPELINE_OPENARG = "C:/Users/dante/Desktop/Laboratorio Colossus/Pipeline OpenArg/datos_abiertos/datasets";

const censoOutputsExist = fs.existsSync(PUBLIC_DATA) && fs.readdirSync(PUBLIC_DATA).some(f => f.endsWith(".json"));
const censoSourceExists = fs.existsSync(RAW_DIR);
const datasetsExist = fs.existsSync(PIPELINE_OPENARG);

if (!censoSourceExists && !censoOutputsExist) {
  console.error("❌ build-data: ni fuentes XLSX en `1- Poblacion/` ni outputs JSON en `public/data/poblacion/`.");
  process.exit(1);
}

const PIPELINE = [];
if (censoSourceExists) {
  PIPELINE.push({ name: "Census (8 informes Población)", file: "generate-report-data.cjs" });
  PIPELINE.push({ name: "SSJ Censo (8 informes Dr. M. Belgrano)", file: "generate-ssj-report-data.cjs" });
} else {
  console.log("ℹ️  Pipeline censo: fuentes XLSX no disponibles, usando outputs pre-generados.");
}
if (datasetsExist) {
  PIPELINE.push({ name: "Seguridad SNIC", file: "process-seguridad.cjs" });
  PIPELINE.push({ name: "SSJ Seguridad SNIC (Belgrano)", file: "process-ssj-seguridad.cjs" });
  PIPELINE.push({ name: "Salud (vitales)", file: "process-salud.cjs" });
  PIPELINE.push({ name: "Empleo SSPM", file: "process-empleo.cjs" });
  PIPELINE.push({ name: "Minería / Litio SIACAM", file: "process-mineria.cjs" });
  PIPELINE.push({ name: "Educación (indicadores)", file: "process-educacion.cjs" });
} else {
  console.log("ℹ️  Pipeline sectorial: datasets OpenArg no accesibles, skip seguridad/salud/empleo/minería/educación.");
}

if (PIPELINE.length === 0) {
  console.log("ℹ️  Nada que hacer. Usando outputs pre-generados en public/.");
  process.exit(0);
}

console.log("╔══════════════════════════════════════════════════════════╗");
console.log("║       Dashboard Jujuy — Data Build Pipeline             ║");
console.log("╚══════════════════════════════════════════════════════════╝");

const start = Date.now();
let failed = 0;

for (const { name, file } of PIPELINE) {
  const scriptPath = path.join(SCRIPTS_DIR, file);
  console.log(`\n${"═".repeat(60)}`);
  console.log(`  ▶ ${name}  (${file})`);
  console.log("═".repeat(60));
  try {
    execSync(`node "${scriptPath}"`, { stdio: "inherit" });
  } catch (err) {
    console.error(`  ❌ FAILED: ${file}`);
    failed++;
  }
}

const elapsed = ((Date.now() - start) / 1000).toFixed(1);
console.log(`\n${"═".repeat(60)}`);
if (failed === 0) {
  console.log(`  ✅ All ${PIPELINE.length} scripts completed in ${elapsed}s`);
} else {
  console.log(`  ⚠️  ${failed}/${PIPELINE.length} failed — ${elapsed}s`);
  process.exit(1);
}
console.log("═".repeat(60));
