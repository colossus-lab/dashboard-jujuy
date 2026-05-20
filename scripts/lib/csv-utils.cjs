/**
 * csv-utils.cjs — helpers para leer CSVs delimitados por `;` o `,`.
 *
 * Usa papaparse (ya en deps). Devuelve filas como objetos {col: valor}.
 */

const fs = require("fs");
const Papa = require("papaparse");

function readCsv(filePath, opts = {}) {
  const raw = fs.readFileSync(filePath, "utf8");
  // Detectar delimitador en la primera línea (; vs ,)
  const firstLine = raw.split("\n", 1)[0] || "";
  const semicolons = (firstLine.match(/;/g) || []).length;
  const commas = (firstLine.match(/,/g) || []).length;
  const delimiter = opts.delimiter || (semicolons > commas ? ";" : ",");

  const parsed = Papa.parse(raw, {
    header: true,
    delimiter,
    skipEmptyLines: true,
    dynamicTyping: false,
  });
  if (parsed.errors && parsed.errors.length) {
    // Reportar pero no fallar (CSVs grandes pueden tener filas malformadas marginales)
    const fatal = parsed.errors.filter(e => e.type !== "FieldMismatch").slice(0, 3);
    if (fatal.length) console.warn(`  ⚠️  CSV parse warnings (${parsed.errors.length}): ${fatal.map(e => e.message).slice(0, 2).join(" | ")}`);
  }
  return parsed.data;
}

module.exports = { readCsv };
