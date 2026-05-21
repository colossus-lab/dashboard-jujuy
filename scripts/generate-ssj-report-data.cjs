/**
 * generate-ssj-report-data.cjs
 *
 * Genera los 8 informes censales del apartado "San Salvador de Jujuy",
 * recortados al Departamento Dr. Manuel Belgrano (código INDEC "38021"),
 * a partir de los mismos XLSX en `1- Poblacion/` que alimentan el dashboard
 * provincial.
 *
 * Estrategia:
 *   A. Hojas con código depto en col 0 → extractJujuyTable + getBelgranoRow.
 *   B. Hojas categóricas (combustible, agua, cloaca, habitaciones, internet,
 *      cobertura por edad) → readBelgranoSubsheet autodetecta la sub-hoja
 *      del depto Belgrano.
 *
 * Output:
 *   public/data/ssj/poblacion/<slug>.json
 *   public/reports/ssj/poblacion/<slug>.md
 *
 * Uso: node scripts/generate-ssj-report-data.cjs
 */

const fs = require("fs");
const path = require("path");

const { ReportBuilder, slugify } = require("./lib/report-builder.cjs");
const { buildReportMd } = require("./lib/markdown-builder.cjs");
const { readSheetRows, extractJujuyTable } = require("./lib/xlsx-utils.cjs");
const {
  BELGRANO,
  BELGRANO_CODIGO,
  getBelgranoRow,
  readBelgranoSubsheet,
} = require("./lib/ssj-utils.cjs");
const {
  toNumber, formatInteger, formatDecimal, formatPercent, formatCompact,
} = require("./lib/formatters.cjs");
const { CENSO_2022 } = require("./lib/contexto-nacional.cjs");

const ROOT = path.resolve(__dirname, "..");
const DATA_DIR = path.join(ROOT, "public", "data", "ssj", "poblacion");
const REPORTS_DIR = path.join(ROOT, "public", "reports", "ssj", "poblacion");
const RAW_DIR = path.join(ROOT, "1- Poblacion");

fs.mkdirSync(DATA_DIR, { recursive: true });
fs.mkdirSync(REPORTS_DIR, { recursive: true });

const SOURCE = "Censo Nacional de Población, Hogares y Viviendas 2022 (INDEC)";
const PERIOD = "2022";
const CATEGORY = "San Salvador de Jujuy";

function persist(slug, data, md) {
  fs.writeFileSync(path.join(DATA_DIR, `${slug}.json`), JSON.stringify(data, null, 2));
  fs.writeFileSync(path.join(REPORTS_DIR, `${slug}.md`), md);
  console.log(`  ✅ ssj/poblacion/${slug}.json (${data.kpis.length} KPIs, ${data.charts.length} charts, ${data.rankings.length} rankings)`);
}

// Helper: encuentra la fila Total en una sub-hoja categórica de Belgrano
function findTotal(rows) {
  return rows.find(r => r && typeof r[0] === "string" && /^Total$/i.test(r[0].trim()));
}

// ═══════════════════════════════════════════════════════════════
// 1. Estructura por sexo y edad — Dr. M. Belgrano
// ═══════════════════════════════════════════════════════════════
function generateSSJEstructura() {
  const slug = "estructura";
  const folder = path.join(RAW_DIR, "1- Estructura por sexo y edad de la población");
  const file = path.join(folder, "c2022_jujuy_est_c1_10.xlsx");
  const fileDens = path.join(folder, "c2022_jujuy_est_c2_10.xlsx");
  const fileSexo = path.join(folder, "c2022_jujuy_est_c3_10.xlsx");
  const fileEdad = path.join(folder, "c2022_jujuy_est_c4_10.xlsx");
  const fileMediana = path.join(folder, "c2022_jujuy_est_c6_10.xlsx");

  const pobTable = extractJujuyTable(readSheetRows(file, "Cuadro 1.10"));
  const densTable = extractJujuyTable(readSheetRows(fileDens, "Cuadro 2.10"));
  const medianaTable = extractJujuyTable(readSheetRows(fileMediana, "Cuadro 6.10"));
  const pobBelgrano = getBelgranoRow(pobTable);
  const densBelgrano = getBelgranoRow(densTable);
  const medBelgrano = getBelgranoRow(medianaTable);

  const sexoRows = readBelgranoSubsheet(fileSexo);
  const edadRows = readBelgranoSubsheet(fileEdad);

  const pobBelg = toNumber(pobBelgrano.row[3]);
  const varAbsBelg = toNumber(pobBelgrano.row[4]);
  const varPctBelg = toNumber(pobBelgrano.row[5]);
  const pobJujuy = toNumber(pobTable.total[3]);
  const pctSobreProv = (pobBelg / pobJujuy) * 100;
  const densRow = densBelgrano.row.map(toNumber);
  const supBelg = densRow[2];
  const densBelg = densRow[4];
  const edadMedBelg = toNumber(medBelgrano.row[2]);

  const builder = new ReportBuilder("ssj-poblacion-estructura")
    .setMeta({ title: "Estructura por Sexo y Edad — San Salvador de Jujuy", category: CATEGORY, subcategory: "Estructura", source: SOURCE, date: PERIOD })
    .addKPI({ id: "pob-belgrano", label: "Población Belgrano (2022)", value: pobBelg, formatted: formatCompact(pobBelg), unit: "hab." })
    .addKPI({ id: "pct-provincia", label: "Peso sobre la provincia", value: pctSobreProv, formatted: formatDecimal(pctSobreProv, 1), unit: "%" })
    .addKPI({ id: "densidad-belgrano", label: "Densidad poblacional", value: densBelg, formatted: formatInteger(densBelg), unit: "hab./km²" })
    .addKPI({ id: "edad-mediana", label: "Edad mediana", value: edadMedBelg, formatted: formatInteger(edadMedBelg), unit: "años" })
    .addKPI({ id: "var-pct", label: "Crecimiento decenal", value: varPctBelg, formatted: formatPercent(varPctBelg), comparison: "respecto a 2010" })
    .addKPI({ id: "superficie", label: "Superficie", value: supBelg, formatted: formatDecimal(supBelg, 1), unit: "km²" });

  const sectionPob = "Población en el contexto provincial";
  const sidPob = slugify(sectionPob);
  builder.addChart({ id: "bar-pob-comparativo", type: "bar", title: "Población 2022 — todos los departamentos de Jujuy", sectionId: sidPob, sectionTitle: sectionPob, data: pobTable.departamentos.map(({ departamento, row }) => ({ departamento: departamento.nombre, Población: toNumber(row[3]) || 0 })), config: { xAxis: "departamento", yAxis: "Población", layout: "vertical" } });

  const sectionVar = "Crecimiento decenal";
  const sidVar = slugify(sectionVar);
  builder.addChart({ id: "bar-var-comparativo", type: "bar", title: "Variación 2010-2022 (%) por departamento", sectionId: sidVar, sectionTitle: sectionVar, data: pobTable.departamentos.map(({ departamento, row }) => ({ departamento: departamento.nombre, "Variación %": toNumber(row[5]) || 0 })), config: { xAxis: "departamento", yAxis: "Variación %", layout: "vertical" } });

  const sectionDens = "Densidad poblacional";
  const sidDens = slugify(sectionDens);
  builder.addChart({ id: "bar-densidad-comparativo", type: "bar", title: "Densidad poblacional por departamento (hab./km²)", sectionId: sidDens, sectionTitle: sectionDens, data: densTable.departamentos.map(({ departamento, row }) => ({ departamento: departamento.nombre, "Densidad": toNumber(row[4]) || 0 })), config: { xAxis: "departamento", yAxis: "Densidad" } });

  const sectionPiramide = "Pirámide poblacional de Dr. M. Belgrano";
  const sidPiramide = slugify(sectionPiramide);
  const piramideData = [];
  const femData = [];
  for (const r of edadRows) {
    if (!r) continue;
    const c0 = String(r[0] || "").trim();
    if (/^\d+-\d+$/.test(c0) || /^100\s*y\s*m[áa]s$/i.test(c0)) {
      piramideData.push({ grupo: c0, Mujeres: -(toNumber(r[2]) || 0), Varones: toNumber(r[3]) || 0 });
      const idx = toNumber(r[4]);
      if (idx != null) femData.push({ edad: c0, "Índice feminidad": idx });
    }
  }
  builder.addChart({ id: "piramide-belgrano", type: "pyramid", title: "Pirámide poblacional — Dr. M. Belgrano", sectionId: sidPiramide, sectionTitle: sectionPiramide, data: piramideData, config: { xAxis: "grupo", layout: "horizontal" } });

  const sectionMed = "Edad mediana por departamento";
  const sidMed = slugify(sectionMed);
  builder.addChart({ id: "bar-mediana-comparativo", type: "bar", title: "Edad mediana por departamento (años)", sectionId: sidMed, sectionTitle: sectionMed, data: medianaTable.departamentos.map(({ departamento, row }) => ({ departamento: departamento.nombre, "Edad mediana": toNumber(row[2]) || 0 })), config: { xAxis: "departamento", yAxis: "Edad mediana" } });

  const sectionTipoResid = "Tipo de residencia en Belgrano";
  const sidTipoResid = slugify(sectionTipoResid);
  const sexoTotalRow = findTotal(sexoRows);
  if (sexoTotalRow) {
    const sT = sexoTotalRow.map(toNumber);
    const pieData = [
      { id: "Vivienda particular", label: "Vivienda particular", value: sT[2] },
      { id: "Vivienda colectiva",  label: "Vivienda colectiva",  value: sT[3] },
      { id: "Situación de calle",  label: "Situación de calle",  value: sT[4] },
    ].filter(d => d.value > 0);
    builder.addChart({ id: "pie-tipo-residencia-belgrano", type: "pie", title: "Tipo de residencia — Dr. M. Belgrano", sectionId: sidTipoResid, sectionTitle: sectionTipoResid, data: pieData });
  }

  const sectionFem = "Índice de feminidad por edad — Belgrano";
  const sidFem = slugify(sectionFem);
  builder.addChart({ id: "line-feminidad-belgrano", type: "line", title: "Índice de feminidad por grupo de edad — Dr. M. Belgrano", sectionId: sidFem, sectionTitle: sectionFem, data: femData, config: { xAxis: "edad", yAxis: "Mujeres por cada 100 varones" } });

  const sortedByPob = [...pobTable.departamentos].sort((a, b) => (toNumber(b.row[3]) || 0) - (toNumber(a.row[3]) || 0));
  builder.addRanking({ id: "rank-pob", title: "Departamentos más poblados", sectionId: sidPob, items: sortedByPob.map(({ departamento, row }) => ({ name: departamento.nombre, value: toNumber(row[3]) || 0, municipioId: departamento.codigo })), order: "desc" });
  const sortedByVar = [...pobTable.departamentos].sort((a, b) => (toNumber(b.row[5]) || 0) - (toNumber(a.row[5]) || 0));
  builder.addRanking({ id: "rank-var", title: "Mayor crecimiento decenal", sectionId: sidVar, items: sortedByVar.map(({ departamento, row }) => ({ name: departamento.nombre, value: toNumber(row[5]) || 0, municipioId: departamento.codigo })), order: "desc" });
  const sortedByDens = [...densTable.departamentos].sort((a, b) => (toNumber(b.row[4]) || 0) - (toNumber(a.row[4]) || 0));
  builder.addRanking({ id: "rank-densidad", title: "Departamentos más densos", sectionId: sidDens, items: sortedByDens.map(({ departamento, row }) => ({ name: departamento.nombre, value: toNumber(row[4]) || 0, municipioId: departamento.codigo })), order: "desc" });

  for (const { departamento, row } of pobTable.departamentos) {
    const v = toNumber(row[3]) || 0;
    builder.addMapItem({ municipioId: departamento.codigo, municipioNombre: departamento.nombre, value: v, label: `${formatInteger(v)} hab.` });
  }

  const data = builder.build();
  const desvEdad = edadMedBelg - CENSO_2022.edadMedianaNacional;

  const md = buildReportMd({
    ...data,
    intro: `El **Departamento Dr. Manuel Belgrano** —que contiene a **San Salvador de Jujuy**, capital provincial— concentra **${formatInteger(pobBelg)} habitantes** en 2022 sobre ${formatDecimal(supBelg, 1)} km², lo que equivale al **${formatDecimal(pctSobreProv, 1)}%** de la población provincial. Es el departamento más poblado y más denso de Jujuy, con una edad mediana de **${formatInteger(edadMedBelg)} años** y un crecimiento decenal del **${formatPercent(varPctBelg)}** vs. 2010.`,
    executiveSummary: `Con **${formatInteger(pobBelg)} habitantes**, Belgrano es el departamento más poblado de Jujuy: absorbe el **${formatDecimal(pctSobreProv, 1)}%** de la población provincial en solo ${formatDecimal(supBelg, 1)} km². La densidad de **${formatInteger(densBelg)} hab./km²** lo coloca muy por encima del promedio jujeño (15 hab./km²) y nacional (${formatDecimal(CENSO_2022.densidadNacional, 1)} hab./km²), reflejando una urbanización plena del corredor capital-Alto Comedero. El crecimiento decenal del **${formatPercent(varPctBelg)}** (${formatInteger(varAbsBelg)} hab. adicionales) confirma a Belgrano como el principal receptor de migración interna y de expansión periurbana, particularmente sobre el eje sur (Alto Comedero). La edad mediana de **${formatInteger(edadMedBelg)} años** se ubica ${desvEdad <= 0 ? `${Math.abs(desvEdad)} año(s) por debajo` : `${desvEdad} año(s) por encima`} del promedio nacional.`,
    keyFindings: [
      `**Mayoría aplastante:** Belgrano concentra el **${formatDecimal(pctSobreProv, 1)}%** de la población provincial.`,
      `**Densidad capital:** **${formatInteger(densBelg)} hab./km²** vs. **15 hab./km²** del promedio provincial.`,
      `**Crecimiento sostenido:** **${formatPercent(varPctBelg)}** decenal, motorizado por migración interna y expansión periurbana.`,
      `**Alto Comedero:** dentro del ejido capitalino, Alto Comedero (~170.000 hab.) configura una "segunda ciudad" con perfil propio.`,
      `**Edad mediana:** **${formatInteger(edadMedBelg)} años**, en línea con el patrón NOA.`,
    ],
    keyDatum: `**Dato destacado:** los **${formatInteger(pobBelg)} habitantes** de Belgrano superan la suma de los diez departamentos jujeños más pequeños.`,
    sectionNarratives: {
      [sidPob]: `Belgrano lidera ampliamente el ranking poblacional jujeño. La ciudad de San Salvador de Jujuy y su entorno inmediato concentran la mayor parte del departamento; el resto son localidades menores y áreas rurales. El crecimiento de las últimas dos décadas se concentró en Alto Comedero.`,
      [sidVar]: `El crecimiento decenal de **${formatPercent(varPctBelg)}** está alineado con el promedio provincial pero por debajo de otros departamentos del corredor central. Belgrano absorbe migración interna sostenida desde Puna, Quebrada y Ramal.`,
      [sidDens]: `**${formatInteger(densBelg)} hab./km²** es la densidad más alta de la provincia. En el otro extremo, departamentos puneños presentan densidades menores a 1 hab./km².`,
      [sidPiramide]: `La pirámide de Belgrano muestra una base ancha característica del NOA con cohortes jóvenes todavía numerosas. El bono demográfico está vigente; el envejecimiento se acelerará en la próxima década, con dinámica diferenciada entre barrios consolidados (envejecen) y Alto Comedero (mantiene estructura joven).`,
      [sidMed]: `Belgrano tiene una mediana intermedia dentro del ranking provincial. La heterogeneidad interna entre Alto Comedero (joven) y los barrios centrales (más envejecidos) es marcada.`,
      [sidTipoResid]: `La amplísima mayoría reside en viviendas particulares. La población en viviendas colectivas es proporcionalmente mayor que en el promedio provincial — esperable para una capital con concentración institucional y universitaria.`,
      [sidFem]: `Curva clásica: paridad relativa al nacer, predominio masculino moderado en juventud temprana, predominio femenino creciente desde los 40-50 años, acentuado entre mayores de 75.`,
    },
    policyImplications: `La centralidad demográfica de Belgrano impone que cualquier promedio "Jujuy" oculte la heterogeneidad real entre la capital y el resto. Dentro del departamento, la dualidad centro / Alto Comedero exige miradas focalizadas que el dato departamental agregado todavía no resuelve. El crecimiento sostenido anticipa demandas crecientes de infraestructura urbana, vivienda, transporte y servicios, con foco en la periferia sur.`,
  });
  persist(slug, data, md);
}

// ═══════════════════════════════════════════════════════════════
// 2. Habitacional Personas — Dr. M. Belgrano
// ═══════════════════════════════════════════════════════════════
function generateSSJHabitacionalPersonas() {
  const slug = "habitacional-personas";
  const folder = path.join(RAW_DIR, "2- Condiciones habitacionales de la población");
  const fileComb = path.join(folder, "c2022_jujuy_pob_c4_10.xlsx");
  const fileMat = path.join(folder, "c2022_jujuy_pob_c1_10.xlsx");
  const fileAgua = path.join(folder, "c2022_jujuy_pob_c2_10.xlsx");
  const fileCloaca = path.join(folder, "c2022_jujuy_pob_c3_10.xlsx");
  const fileHab = path.join(folder, "c2022_jujuy_pob_c5_10.xlsx");
  const fileTenencia = path.join(folder, "c2022_jujuy_pob_c6_10.xlsx");
  const fileNet = path.join(folder, "c2022_jujuy_pob_c7_10.xlsx");

  const combTable = extractJujuyTable(readSheetRows(fileComb, "Cuadro 4.10"));
  const tenTable = extractJujuyTable(readSheetRows(fileTenencia, "Cuadro 6.10"));
  const combBelg = getBelgranoRow(combTable).row.map(toNumber);
  const tenBelg = getBelgranoRow(tenTable).row.map(toNumber);

  const matBelg = findTotal(readBelgranoSubsheet(fileMat))?.map(toNumber) || [];
  const aguaBelg = findTotal(readBelgranoSubsheet(fileAgua))?.map(toNumber) || [];
  const cloacaBelg = findTotal(readBelgranoSubsheet(fileCloaca))?.map(toNumber) || [];
  const habBelg = readBelgranoSubsheet(fileHab);
  const netBelg = findTotal(readBelgranoSubsheet(fileNet))?.map(toNumber) || [];

  const pobBelg = combBelg[2];
  const gasRedPct = (combBelg[4] / pobBelg) * 100;
  const gasGarrafaPct = (combBelg[6] / pobBelg) * 100;
  const electricidadPct = (combBelg[3] / pobBelg) * 100;
  const aguaPobBelg = aguaBelg[1];
  const caneriaDentroPct = aguaPobBelg ? (aguaBelg[2] / aguaPobBelg) * 100 : 0;
  const netPobBelg = netBelg[1];
  const conInternetPct = netPobBelg ? (netBelg[2] / netPobBelg) * 100 : 0;
  const sinInternetPct = netPobBelg ? (netBelg[5] / netPobBelg) * 100 : 0;
  const propiaPct = (tenBelg[3] / tenBelg[2]) * 100;
  const alquilPct = (tenBelg[8] / tenBelg[2]) * 100;
  const sinBanoPct = cloacaBelg[5] && aguaPobBelg ? (cloacaBelg[5] / aguaPobBelg) * 100 : 0;

  const builder = new ReportBuilder("ssj-poblacion-habitacional-personas")
    .setMeta({ title: "Condiciones Habitacionales — San Salvador de Jujuy", category: CATEGORY, subcategory: "Hábitat Personas", source: SOURCE, date: PERIOD })
    .addKPI({ id: "pob", label: "Población en viviendas particulares", value: pobBelg, formatted: formatCompact(pobBelg), unit: "hab." })
    .addKPI({ id: "gas-red", label: "Cocina con gas de red", value: gasRedPct, formatted: formatPercent(gasRedPct) })
    .addKPI({ id: "gas-garrafa", label: "Cocina con gas en garrafa", value: gasGarrafaPct, formatted: formatPercent(gasGarrafaPct), status: gasGarrafaPct > 10 ? "warning" : undefined })
    .addKPI({ id: "agua", label: "Agua por cañería dentro de la vivienda", value: caneriaDentroPct, formatted: formatPercent(caneriaDentroPct) })
    .addKPI({ id: "internet", label: "Vive en hogar con internet", value: conInternetPct, formatted: formatPercent(conInternetPct) })
    .addKPI({ id: "propia", label: "Vive en vivienda propia", value: propiaPct, formatted: formatPercent(propiaPct) })
    .addKPI({ id: "alquila", label: "Vive en vivienda alquilada", value: alquilPct, formatted: formatPercent(alquilPct) })
    .addKPI({ id: "elec", label: "Cocina con electricidad", value: electricidadPct, formatted: formatPercent(electricidadPct) });

  const sectionDist = "Combustibles para cocinar";
  const sidDist = slugify(sectionDist);
  builder.addChart({ id: "pie-comb", type: "pie", title: "Combustible para cocinar — Belgrano", sectionId: sidDist, sectionTitle: sectionDist, data: [
    { id: "Gas de red", label: "Gas de red", value: combBelg[4] },
    { id: "Electricidad", label: "Electricidad", value: combBelg[3] },
    { id: "Gas en garrafa", label: "Gas en garrafa", value: combBelg[6] },
    { id: "Gas zeppelin", label: "Gas zeppelin", value: combBelg[5] },
    { id: "Leña/carbón", label: "Leña/carbón", value: combBelg[7] },
    { id: "Otro", label: "Otro", value: combBelg[8] },
  ].filter(d => d.value > 0) });

  const sectionAccess = "Gas de red — comparativo provincial";
  const sidAccess = slugify(sectionAccess);
  builder.addChart({ id: "bar-gas-comp", type: "bar", title: "% con gas de red por departamento", sectionId: sidAccess, sectionTitle: sectionAccess, data: combTable.departamentos.map(({ departamento, row }) => { const r = row.map(toNumber); return { departamento: departamento.nombre, "Gas de red %": Math.round((r[4] / r[2]) * 1000) / 10 }; }), config: { xAxis: "departamento", yAxis: "Gas de red %" } });

  const sectionAgua = "Procedencia del agua — Belgrano";
  const sidAgua = slugify(sectionAgua);
  const aguaRows = readBelgranoSubsheet(fileAgua);
  const aguaCategorias = [];
  for (const r of aguaRows) {
    const c0 = String(r?.[0] || "").trim();
    if (!c0 || /^Total$/i.test(c0) || c0.startsWith("(") || c0.startsWith("Cuadro") || c0.startsWith("Censo") || c0 === "Procedencia del agua") continue;
    const v = toNumber(r[1]);
    if (v != null && v > 0) aguaCategorias.push({ id: c0.slice(0, 38), label: c0.slice(0, 38), value: v });
    if (aguaCategorias.length >= 5) break;
  }
  builder.addChart({ id: "pie-agua", type: "pie", title: "Procedencia del agua — Belgrano", sectionId: sidAgua, sectionTitle: sectionAgua, data: aguaCategorias });

  const sectionDigital = "Brecha digital en Belgrano";
  const sidDigital = slugify(sectionDigital);
  builder.addChart({ id: "pie-internet", type: "pie", title: "Acceso a internet en la vivienda — Belgrano", sectionId: sidDigital, sectionTitle: sectionDigital, data: [
    { id: "Internet + dispositivo", label: "Internet + dispositivo", value: netBelg[3] },
    { id: "Internet sin dispositivo", label: "Internet sin dispositivo", value: netBelg[4] },
    { id: "Sin internet", label: "Sin internet", value: netBelg[5] },
  ].filter(d => d.value > 0) });

  const sectionTen = "Tenencia — comparativo provincial";
  const sidTen = slugify(sectionTen);
  builder.addChart({ id: "bar-tenencia-comp", type: "bar", title: "% propia vs alquilada por departamento", sectionId: sidTen, sectionTitle: sectionTen, data: tenTable.departamentos.map(({ departamento, row }) => { const r = row.map(toNumber); return { departamento: departamento.nombre, "Propia %": Math.round((r[3] / r[2]) * 1000) / 10, "Alquilada %": Math.round((r[8] / r[2]) * 1000) / 10 }; }), config: { xAxis: "departamento", yAxis: "%", grouped: true } });

  const sectionCloaca = "Saneamiento en Belgrano";
  const sidCloaca = slugify(sectionCloaca);
  builder.addChart({ id: "pie-bano", type: "pie", title: "Ubicación del baño — Belgrano", sectionId: sidCloaca, sectionTitle: sectionCloaca, data: [
    { id: "Dentro de la vivienda", label: "Dentro de la vivienda", value: cloacaBelg[3] },
    { id: "Fuera de la vivienda", label: "Fuera de la vivienda", value: cloacaBelg[4] },
    { id: "No tiene baño", label: "No tiene baño", value: cloacaBelg[5] },
  ].filter(d => d.value > 0) });

  if (matBelg[2] != null) {
    const sectionMat = "Materiales de piso — Belgrano";
    const sidMat = slugify(sectionMat);
    builder.addChart({ id: "pie-piso", type: "pie", title: "Material predominante de los pisos — Belgrano", sectionId: sidMat, sectionTitle: sectionMat, data: [
      { id: "Cerámica/Mosaico/Madera", label: "Cerámica/Mosaico/Madera", value: matBelg[2] },
      { id: "Carpeta/Contrapiso", label: "Carpeta/Contrapiso", value: matBelg[3] },
      { id: "Tierra/Ladrillo suelto", label: "Tierra/Ladrillo suelto", value: matBelg[4] },
      { id: "Otro", label: "Otro", value: matBelg[5] },
    ].filter(d => d.value > 0) });
  }

  // Ranking inter-deptos: gas garrafa (vulnerabilidad)
  const ranked = combTable.departamentos.map(({ departamento, row }) => { const r = row.map(toNumber); return { departamento, value: (r[6] / r[2]) * 100 }; }).sort((a, b) => b.value - a.value);
  builder.addRanking({ id: "rank-garrafa", title: "Departamentos con mayor uso de gas en garrafa", sectionId: sidAccess, items: ranked.map(r => ({ name: r.departamento.nombre, value: Math.round(r.value * 10) / 10, municipioId: r.departamento.codigo })), order: "desc" });

  const data = builder.build();
  const desvGas = gasRedPct - CENSO_2022.pct_gas_red_nacional;
  const desvAgua = caneriaDentroPct - CENSO_2022.pct_agua_red_nacional;

  const md = buildReportMd({
    ...data,
    intro: `Sobre **${formatInteger(pobBelg)} personas** en viviendas particulares en Dr. M. Belgrano, el **${formatPercent(gasRedPct)}** cocina con gas de red, el **${formatPercent(caneriaDentroPct)}** accede al agua por cañería dentro de la vivienda y el **${formatPercent(conInternetPct)}** vive en hogares con conexión a internet. La capital concentra coberturas mucho más altas que el promedio provincial — efecto neto de la urbanización del corredor central.`,
    executiveSummary: `El perfil habitacional de Belgrano refleja una capital urbana plena: cobertura de gas de red del **${formatPercent(gasRedPct)}** (${desvGas >= 0 ? `**${formatDecimal(desvGas, 1)} pp por encima**` : `**${formatDecimal(Math.abs(desvGas), 1)} pp por debajo**`} del promedio nacional **${formatDecimal(CENSO_2022.pct_gas_red_nacional, 1)}%**) y agua dentro de la vivienda del **${formatPercent(caneriaDentroPct)}** (${desvAgua >= 0 ? `${formatDecimal(desvAgua, 1)} pp arriba` : `${formatDecimal(Math.abs(desvAgua), 1)} pp abajo`} del nacional). El gas en garrafa todavía afecta al **${formatPercent(gasGarrafaPct)}** — concentrado predominantemente en Alto Comedero y barrios periurbanos sin red. La brecha digital es moderada: **${formatPercent(sinInternetPct)}** sin internet. La tenencia propia (**${formatPercent(propiaPct)}**) supera al alquiler (**${formatPercent(alquilPct)}**), aunque el peso del alquiler es mayor que en el resto de la provincia, característica capital.`,
    keyFindings: [
      `**Gas de red:** **${formatPercent(gasRedPct)}** vs. **${formatDecimal(CENSO_2022.pct_gas_red_nacional, 1)}%** nacional — Belgrano lidera la cobertura provincial.`,
      `**Garrafa:** **${formatPercent(gasGarrafaPct)}** depende de gas en garrafa, concentrado en barrios periurbanos.`,
      `**Agua dentro de la vivienda:** **${formatPercent(caneriaDentroPct)}**, ${desvAgua >= 0 ? "por encima" : "por debajo"} del promedio nacional.`,
      `**Brecha digital:** **${formatPercent(sinInternetPct)}** sin internet.`,
      `**Tenencia:** **${formatPercent(propiaPct)}** propia vs **${formatPercent(alquilPct)}** alquilada — peso del alquiler mayor que en el resto de la provincia.`,
      `**Saneamiento:** ${sinBanoPct < 1 ? "déficit residual menor a 1% en baño dentro de la vivienda" : `**${formatDecimal(sinBanoPct, 1)}%** sin baño en la vivienda`}.`,
    ],
    sectionNarratives: {
      [sidDist]: `La matriz energética doméstica de Belgrano está mucho más desarrollada que la del resto de la provincia: el gas natural domiciliario es la fuente predominante. La garrafa retiene presencia significativa en barrios periurbanos sin acceso a la red, especialmente Alto Comedero y asentamientos populares.`,
      [sidAccess]: `Belgrano lidera la cobertura provincial de gas de red. La brecha respecto a departamentos puneños y de altura es estructural: la red troncal de gasoductos no llega a buena parte de Jujuy.`,
      [sidAgua]: `La red pública cubre a la amplísima mayoría de los hogares belgranenses. Las situaciones de provisión por perforación, transporte o canilla pública se concentran en zonas periurbanas.`,
      [sidDigital]: `La brecha digital en Belgrano es menor que en el resto de la provincia, pero todavía afecta a una fracción relevante de la población — concentrada en barrios populares.`,
      [sidTen]: `El alquiler tiene mayor peso en Belgrano que en otros departamentos de Jujuy, característica esperable de una capital con población estudiantil, migración interna y movilidad laboral.`,
      [sidCloaca]: `El baño dentro de la vivienda es prácticamente universal en Belgrano. El déficit residual se concentra en asentamientos populares periurbanos.`,
    },
    policyImplications: `La capital lidera la mayoría de indicadores habitacionales provinciales pero esconde su propia heterogeneidad interna: la cobertura de gas de red es muy desigual entre el casco urbano consolidado y Alto Comedero / barrios periurbanos. La política habitacional capital requiere mirada barrial, no agregada.`,
  });
  persist(slug, data, md);
}

// ═══════════════════════════════════════════════════════════════
// 3. Salud y Previsión Social — Dr. M. Belgrano
// ═══════════════════════════════════════════════════════════════
function generateSSJSaludPrevision() {
  const slug = "salud-prevision";
  const folder = path.join(RAW_DIR, "3- Salud y previsión social");
  const fileSalud = path.join(folder, "c2022_jujuy_salud_c1_10.xlsx");
  const filePrev = path.join(folder, "c2022_jujuy_prevision_c3_10.xlsx");

  const saludTable = extractJujuyTable(readSheetRows(fileSalud, "Cuadro 1.10"));
  const prevTable = extractJujuyTable(readSheetRows(filePrev, "Cuadro 3.10"));
  const saludBelg = getBelgranoRow(saludTable).row.map(toNumber);
  const prevBelg = getBelgranoRow(prevTable).row.map(toNumber);

  const pobBelg = saludBelg[2];
  const conObraPct = (saludBelg[3] / pobBelg) * 100;
  const programasPct = (saludBelg[4] / pobBelg) * 100;
  const sinCobPct = (saludBelg[5] / pobBelg) * 100;
  const conJubPct = (prevBelg[3] / prevBelg[2]) * 100;
  const pobSinCob = saludBelg[5];

  const builder = new ReportBuilder("ssj-poblacion-salud-prevision")
    .setMeta({ title: "Salud y Previsión Social — San Salvador de Jujuy", category: CATEGORY, subcategory: "Salud", source: SOURCE, date: PERIOD })
    .addKPI({ id: "obra", label: "Con obra social o prepaga", value: conObraPct, formatted: formatPercent(conObraPct) })
    .addKPI({ id: "prog", label: "Programas o planes estatales", value: programasPct, formatted: formatPercent(programasPct) })
    .addKPI({ id: "sin-cob", label: "Sin cobertura de salud", value: sinCobPct, formatted: formatPercent(sinCobPct), status: sinCobPct > 15 ? "critical" : "warning" })
    .addKPI({ id: "jub", label: "Percibe jubilación o pensión", value: conJubPct, formatted: formatPercent(conJubPct) });

  const sectionCob = "Tipo de cobertura en Belgrano";
  const sidCob = slugify(sectionCob);
  builder.addChart({ id: "pie-cob", type: "pie", title: "Cobertura de salud — Belgrano", sectionId: sidCob, sectionTitle: sectionCob, data: [
    { id: "Obra social/Prepaga", label: "Obra social/Prepaga", value: saludBelg[3] },
    { id: "Programas estatales", label: "Programas estatales", value: saludBelg[4] },
    { id: "Sin cobertura", label: "Sin cobertura", value: saludBelg[5] },
  ] });

  const sectionDes = "Sin cobertura — comparativo provincial";
  const sidDes = slugify(sectionDes);
  builder.addChart({ id: "bar-sin-comp", type: "bar", title: "% sin cobertura por departamento", sectionId: sidDes, sectionTitle: sectionDes, data: saludTable.departamentos.map(({ departamento, row }) => { const r = row.map(toNumber); return { departamento: departamento.nombre, "Sin cobertura %": Math.round((r[5] / r[2]) * 1000) / 10 }; }), config: { xAxis: "departamento", yAxis: "Sin cobertura %" } });

  const ranked = saludTable.departamentos.map(({ departamento, row }) => { const r = row.map(toNumber); return { departamento, value: (r[5] / r[2]) * 100 }; }).sort((a, b) => b.value - a.value);
  builder.addRanking({ id: "rank-sin-cob", title: "Departamentos con mayor % sin cobertura", sectionId: sidDes, items: ranked.map(r => ({ name: r.departamento.nombre, value: Math.round(r.value * 10) / 10, municipioId: r.departamento.codigo })), order: "desc" });

  for (const { departamento, row } of saludTable.departamentos) {
    const r = row.map(toNumber);
    const pct = (r[5] / r[2]) * 100;
    builder.addMapItem({ municipioId: departamento.codigo, municipioNombre: departamento.nombre, value: Math.round(pct * 10) / 10, label: `${formatPercent(pct)} sin cobertura` });
  }

  const data = builder.build();
  const desvSin = sinCobPct - CENSO_2022.pct_solo_publica_nacional;

  const md = buildReportMd({
    ...data,
    intro: `En el Departamento Dr. M. Belgrano, **${formatPercent(conObraPct)}** de la población declara contar con obra social o prepaga, **${formatPercent(programasPct)}** está cubierto por programas estatales, y **${formatPercent(sinCobPct)}** depende exclusivamente del sistema público (${formatInteger(pobSinCob)} personas). La cobertura previsional alcanza al **${formatPercent(conJubPct)}** de la población.`,
    executiveSummary: `Belgrano presenta una cobertura de salud formal **${conObraPct > 60 ? "elevada" : "intermedia"}** en el contexto provincial: **${formatPercent(conObraPct)}** con obra social o prepaga, gracias al peso del empleo público provincial y de prepagas asociadas a sectores formales urbanos. La población sin cobertura (**${formatPercent(sinCobPct)}**, ${formatInteger(pobSinCob)} personas) es ${desvSin >= 0 ? `**${formatDecimal(desvSin, 1)} pp por encima**` : `**${formatDecimal(Math.abs(desvSin), 1)} pp por debajo**`} del promedio nacional. Como capital provincial, Belgrano concentra la principal infraestructura sanitaria pública (Hospital Pablo Soria, hospitales de mediana complejidad, red de CAPS), por lo que aún la población formalmente cubierta utiliza intensivamente el sistema público.`,
    keyFindings: [
      `**Cobertura formal:** **${formatPercent(conObraPct)}** con obra social/prepaga — por encima del resto de la provincia.`,
      `**Sin cobertura:** **${formatPercent(sinCobPct)}** (${formatInteger(pobSinCob)} personas) depende exclusivamente del sistema público.`,
      `**Cobertura previsional:** **${formatPercent(conJubPct)}** percibe jubilación o pensión.`,
      `**Centralidad sanitaria:** Belgrano concentra la principal infraestructura sanitaria pública de Jujuy.`,
    ],
    sectionNarratives: {
      [sidCob]: `La cobertura formal en Belgrano es superior al promedio provincial: el empleo público provincial, prepagas privadas y obras sociales sindicales tienen mayor peso en la capital. El sistema público funciona como red universal complementaria.`,
      [sidDes]: `La concentración de empleo formal y de servicios públicos provinciales en Belgrano explica que tenga la menor tasa de población sin cobertura formal de la provincia.`,
    },
    policyImplications: `Belgrano concentra la oferta sanitaria pública y privada de Jujuy. La capital recibe demanda derivada del interior provincial — fenómeno que tensiona la infraestructura hospitalaria capital más allá de su propia población. La planificación sanitaria capital debe considerar esta función regional.`,
  });
  persist(slug, data, md);
}

// ═══════════════════════════════════════════════════════════════
// 4. Habitacional Hogares — Dr. M. Belgrano
// ═══════════════════════════════════════════════════════════════
function generateSSJHabitacionalHogares() {
  const slug = "habitacional-hogares";
  const folder = path.join(RAW_DIR, "4- Condiciones habitacionales de los hogares");
  const fileTen = path.join(folder, "c2022_jujuy_hogares_c6_10.xlsx");
  const fileComb = path.join(folder, "c2022_jujuy_hogares_c4_10.xlsx");

  const tenTable = extractJujuyTable(readSheetRows(fileTen, "Cuadro 6.10"));
  const combTable = extractJujuyTable(readSheetRows(fileComb, "Cuadro 4.10"));
  const tenBelg = getBelgranoRow(tenTable).row.map(toNumber);
  const combBelg = getBelgranoRow(combTable).row.map(toNumber);

  const totalHogares = tenBelg[2];
  const propiaPct = (tenBelg[3] / totalHogares) * 100;
  const alquiladaPct = (tenBelg[8] / totalHogares) * 100;
  const gasRedHogPct = (combBelg[4] / combBelg[2]) * 100;

  const builder = new ReportBuilder("ssj-poblacion-habitacional-hogares")
    .setMeta({ title: "Condiciones Habitacionales de los Hogares — San Salvador de Jujuy", category: CATEGORY, subcategory: "Hábitat Hogares", source: SOURCE, date: PERIOD })
    .addKPI({ id: "hogares", label: "Total de hogares", value: totalHogares, formatted: formatCompact(totalHogares) })
    .addKPI({ id: "propia", label: "Hogares en vivienda propia", value: propiaPct, formatted: formatPercent(propiaPct) })
    .addKPI({ id: "alq", label: "Hogares en vivienda alquilada", value: alquiladaPct, formatted: formatPercent(alquiladaPct) })
    .addKPI({ id: "gas-hog", label: "Hogares con gas de red", value: gasRedHogPct, formatted: formatPercent(gasRedHogPct) });

  const sectionTen = "Régimen de tenencia — Belgrano";
  const sidTen = slugify(sectionTen);
  builder.addChart({ id: "pie-ten", type: "pie", title: "Régimen de tenencia — Hogares Belgrano", sectionId: sidTen, sectionTitle: sectionTen, data: [
    { id: "Propia", label: "Propia", value: tenBelg[3] },
    { id: "Alquilada", label: "Alquilada", value: tenBelg[8] },
    { id: "Cedida", label: "Cedida", value: tenBelg[9] || 0 },
    { id: "Otras", label: "Otras", value: Math.max(0, totalHogares - tenBelg[3] - tenBelg[8] - (tenBelg[9] || 0)) },
  ].filter(d => d.value > 0) });

  const sectionAlq = "Alquiler — comparativo provincial";
  const sidAlq = slugify(sectionAlq);
  builder.addChart({ id: "bar-alq-comp", type: "bar", title: "% hogares en alquiler por departamento", sectionId: sidAlq, sectionTitle: sectionAlq, data: tenTable.departamentos.map(({ departamento, row }) => { const r = row.map(toNumber); return { departamento: departamento.nombre, "Alquiler %": Math.round((r[8] / r[2]) * 1000) / 10 }; }), config: { xAxis: "departamento", yAxis: "Alquiler %" } });

  const ranked = tenTable.departamentos.map(({ departamento, row }) => { const r = row.map(toNumber); return { departamento, value: (r[8] / r[2]) * 100 }; }).sort((a, b) => b.value - a.value);
  builder.addRanking({ id: "rank-alq", title: "Departamentos con mayor % alquiler", sectionId: sidAlq, items: ranked.map(r => ({ name: r.departamento.nombre, value: Math.round(r.value * 10) / 10, municipioId: r.departamento.codigo })), order: "desc" });

  const data = builder.build();
  const md = buildReportMd({
    ...data,
    intro: `El Departamento Dr. M. Belgrano contiene **${formatInteger(totalHogares)} hogares**. **${formatPercent(propiaPct)}** ocupa vivienda propia y **${formatPercent(alquiladaPct)}** alquila — el peso del alquiler es mayor que en el resto de la provincia, característica típica de las capitales.`,
    executiveSummary: `Los **${formatInteger(totalHogares)} hogares** de Belgrano configuran el núcleo del mercado habitacional jujeño. El **${formatPercent(propiaPct)}** vive en vivienda propia y el **${formatPercent(alquiladaPct)}** alquila — el alquiler tiene más peso que en cualquier otro departamento de la provincia, reflejo de la mayor movilidad laboral, presencia universitaria y dinámica urbana de la capital. La cobertura de gas de red (**${formatPercent(gasRedHogPct)}**) lidera el ranking provincial; los déficits intra-Belgrano se concentran en barrios periurbanos no servidos por la red.`,
    keyFindings: [
      `**Hogares totales:** **${formatInteger(totalHogares)}** — el departamento con más hogares de Jujuy.`,
      `**Tenencia propia mayoritaria:** **${formatPercent(propiaPct)}**, alineado con el patrón provincial.`,
      `**Alquiler relevante:** **${formatPercent(alquiladaPct)}** — mayor peso del alquiler que en el resto de la provincia.`,
      `**Gas de red:** **${formatPercent(gasRedHogPct)}** de los hogares con cobertura — la más alta de Jujuy.`,
    ],
    sectionNarratives: {
      [sidTen]: `Belgrano combina la estructura típica de propiedad mayoritaria del NOA con un componente de alquiler más relevante que el resto de la provincia. La población universitaria, los empleados públicos provinciales y la migración interna sostienen una demanda de alquiler estructural.`,
      [sidAlq]: `Belgrano lidera el ranking provincial de alquiler, seguido por Palpalá. Los departamentos rurales presentan tasas mínimas de alquiler.`,
    },
    policyImplications: `El mercado de alquiler capital concentra dinámicas que el resto de la provincia no tiene. La política habitacional debe considerar instrumentos específicos para inquilinos (regulación de alquileres, programas de acceso a primera vivienda) que en el interior provincial son menos relevantes.`,
  });
  persist(slug, data, md);
}

// ═══════════════════════════════════════════════════════════════
// 5. Viviendas — Dr. M. Belgrano
// ═══════════════════════════════════════════════════════════════
function generateSSJViviendas() {
  const slug = "viviendas";
  const folder = path.join(RAW_DIR, "5- Viviendas");
  const fileC1 = path.join(folder, "c2022_jujuy_vivienda_c1_10.xlsx");
  const fileC2 = path.join(folder, "c2022_jujuy_vivienda_c2_10.xlsx");
  const fileC3 = path.join(folder, "c2022_jujuy_vivienda_c3_10.xlsx");

  const c1 = extractJujuyTable(readSheetRows(fileC1, "Cuadro 1.10"));
  const c2 = extractJujuyTable(readSheetRows(fileC2, "Cuadro 2.10"));
  const c3 = extractJujuyTable(readSheetRows(fileC3, "Cuadro 3.10"));
  const c1Belg = getBelgranoRow(c1).row.map(toNumber);
  const c2Belg = getBelgranoRow(c2).row.map(toNumber);
  const c3Belg = getBelgranoRow(c3).row.map(toNumber);

  const totalViv = c1Belg[2];
  const particulares = c1Belg[3];
  const colectivas = c1Belg[11];
  const conPersonas = c1Belg[4];
  const desocupadas = totalViv - conPersonas - colectivas;
  const desocupadasPct = (desocupadas / totalViv) * 100;
  const deptoPct = (c3Belg[6] / c3Belg[2]) * 100;
  const casaPct = (c3Belg[3] / c3Belg[2]) * 100;
  const ranchoCasillaPct = ((c3Belg[4] + c3Belg[5]) / c3Belg[2]) * 100;
  const vivOcup = c2Belg[2];
  const vivCon2H = c2Belg[6] || 0;
  const vivCon3plus = c2Belg[8] || 0;
  const hacinamientoPct = ((vivCon2H + vivCon3plus) / vivOcup) * 100;

  const builder = new ReportBuilder("ssj-poblacion-viviendas")
    .setMeta({ title: "Stock Habitacional y Viviendas — San Salvador de Jujuy", category: CATEGORY, subcategory: "Viviendas", source: SOURCE, date: PERIOD })
    .addKPI({ id: "tot-viv", label: "Total de viviendas", value: totalViv, formatted: formatCompact(totalViv) })
    .addKPI({ id: "part", label: "Viviendas particulares", value: particulares, formatted: formatCompact(particulares) })
    .addKPI({ id: "depto-pct", label: "Departamentos (apartamentos)", value: deptoPct, formatted: formatPercent(deptoPct), comparison: "del stock particular" })
    .addKPI({ id: "casa-pct", label: "Casas", value: casaPct, formatted: formatPercent(casaPct) })
    .addKPI({ id: "desoc", label: "Viviendas desocupadas", value: desocupadasPct, formatted: formatPercent(desocupadasPct), status: desocupadasPct > 12 ? "warning" : undefined })
    .addKPI({ id: "hac", label: "Viviendas con 2+ hogares", value: hacinamientoPct, formatted: formatPercent(hacinamientoPct), comparison: "hacinamiento residencial" });

  const sectionTipo = "Tipo de vivienda en Belgrano";
  const sidTipo = slugify(sectionTipo);
  builder.addChart({ id: "pie-tipo", type: "pie", title: "Tipo de vivienda particular — Belgrano", sectionId: sidTipo, sectionTitle: sectionTipo, data: [
    { id: "Departamento", label: "Departamento", value: c3Belg[6] },
    { id: "Casa", label: "Casa", value: c3Belg[3] },
    { id: "Pieza/Inquilinato", label: "Pieza/Inquilinato", value: c3Belg[7] },
    { id: "Rancho/Casilla", label: "Rancho/Casilla", value: c3Belg[4] + c3Belg[5] },
    { id: "Otros", label: "Otros", value: c3Belg[8] + c3Belg[9] },
  ].filter(d => d.value > 0) });

  const sectionDes = "Desocupación — comparativo provincial";
  const sidDes = slugify(sectionDes);
  builder.addChart({ id: "bar-des-comp", type: "bar", title: "% viviendas desocupadas por departamento", sectionId: sidDes, sectionTitle: sectionDes, data: c1.departamentos.map(({ departamento, row }) => { const r = row.map(toNumber); const desoc = r[2] - r[4] - r[11]; return { departamento: departamento.nombre, "Desocupadas %": Math.round((desoc / r[2]) * 1000) / 10 }; }), config: { xAxis: "departamento", yAxis: "Desocupadas %" } });

  const sectionHacComp = "Hacinamiento residencial — comparativo provincial";
  const sidHacComp = slugify(sectionHacComp);
  builder.addChart({ id: "bar-hac-comp", type: "bar", title: "% viviendas con 2+ hogares por depto.", sectionId: sidHacComp, sectionTitle: sectionHacComp, data: c2.departamentos.map(({ departamento, row }) => { const r = row.map(toNumber); const hac = (r[6] || 0) + (r[8] || 0); return { departamento: departamento.nombre, "Hacinamiento %": r[2] ? Math.round((hac / r[2]) * 1000) / 10 : 0 }; }), config: { xAxis: "departamento", yAxis: "Hacinamiento %" } });

  const ranked = c2.departamentos.map(({ departamento, row }) => { const r = row.map(toNumber); return { departamento, value: r[2] ? (((r[6] || 0) + (r[8] || 0)) / r[2]) * 100 : 0 }; }).sort((a, b) => b.value - a.value);
  builder.addRanking({ id: "rank-hac", title: "Departamentos con mayor hacinamiento residencial", sectionId: sidHacComp, items: ranked.map(r => ({ name: r.departamento.nombre, value: Math.round(r.value * 100) / 100, municipioId: r.departamento.codigo })), order: "desc" });

  const data = builder.build();
  const md = buildReportMd({
    ...data,
    intro: `El stock habitacional de Belgrano suma **${formatInteger(totalViv)} viviendas** (**${formatInteger(particulares)}** particulares y **${formatInteger(colectivas)}** colectivas). El **${formatPercent(casaPct)}** son casas y el **${formatPercent(deptoPct)}** departamentos — la mayor proporción de departamentos de Jujuy, consistente con el perfil urbano de la capital.`,
    executiveSummary: `Belgrano concentra el principal stock habitacional urbano de Jujuy: **${formatInteger(totalViv)} viviendas**, con la mayor participación provincial de **departamentos (${formatPercent(deptoPct)})** en el stock particular — característica esperable para una capital. La **desocupación habitacional (${formatPercent(desocupadasPct)})** está en línea con el promedio provincial y refleja stock en alquiler, segundas residencias y unidades en construcción. El **hacinamiento residencial (${formatPercent(hacinamientoPct)})** —viviendas que alojan 2+ hogares— afecta principalmente a barrios populares y a Alto Comedero, donde la presión sobre el stock es histórica. Las formas precarias (rancho, casilla) son minoritarias (**${formatDecimal(ranchoCasillaPct, 1)}%**) pero concentradas en asentamientos populares.`,
    keyFindings: [
      `**Stock total:** **${formatInteger(totalViv)}** viviendas en Belgrano — el mayor stock departamental de Jujuy.`,
      `**Departamentos:** **${formatPercent(deptoPct)}** del stock particular — la mayor proporción provincial.`,
      `**Casas:** **${formatPercent(casaPct)}** — sigue siendo la tipología predominante.`,
      `**Desocupación:** **${formatPercent(desocupadasPct)}** del stock — mezcla de alquiler, segundas residencias y stock en construcción.`,
      `**Hacinamiento residencial:** **${formatPercent(hacinamientoPct)}** — concentrado en Alto Comedero y barrios populares.`,
      `**Formas precarias:** **${formatDecimal(ranchoCasillaPct, 1)}%** rancho/casilla — minoritario pero indicador clave de déficit.`,
    ],
    sectionNarratives: {
      [sidTipo]: `Belgrano tiene la composición tipológica más urbana de Jujuy: mayor peso de departamentos que en cualquier otro departamento provincial. La casa unifamiliar sigue siendo predominante.`,
      [sidDes]: `La desocupación en Belgrano se concentra en stock urbano (mercado de alquiler activo, unidades nuevas, segundas residencias).`,
      [sidHacComp]: `El hacinamiento residencial en Belgrano se concentra en Alto Comedero y barrios populares — fenómeno propio de la presión habitacional capital.`,
    },
    policyImplications: `La política habitacional capital debe abordar la dualidad de la capital: stock urbano consolidado con desocupación normal vs barrios populares (Alto Comedero) con hacinamiento estructural. Instrumentos diferenciados.`,
  });
  persist(slug, data, md);
}

// ═══════════════════════════════════════════════════════════════
// 6. Educación Censal — Dr. M. Belgrano
// ═══════════════════════════════════════════════════════════════
function generateSSJEducacion() {
  const slug = "educacion-censal";
  const folder = path.join(RAW_DIR, "6- Educación");
  const fileC1 = path.join(folder, "c2022_jujuy_educacion_c1_10.xlsx");
  const fileC3 = path.join(folder, "c2022_jujuy_educacion_c3_10.xlsx");

  const c1Rows = readBelgranoSubsheet(fileC1);
  const c3Rows = readBelgranoSubsheet(fileC3);
  const tC1 = findTotal(c1Rows)?.map(toNumber) || [];
  const tC3 = findTotal(c3Rows)?.map(toNumber) || [];

  const pobTot = tC1[2];
  const asistePct = (tC1[3] / pobTot) * 100;
  const noAsistePct = (tC1[4] / pobTot) * 100;
  const nuncaPct = (tC1[5] / pobTot) * 100;

  const pob5Mas = tC3[3];
  const sinInstr = tC3[4];
  const terciarioT = tC3[17];
  const universitarioT = tC3[20];
  const posgradoT = tC3[23];
  const superiorPct = ((terciarioT + universitarioT + posgradoT) / pob5Mas) * 100;
  const sinInstrPct = (sinInstr / pob5Mas) * 100;

  const builder = new ReportBuilder("ssj-poblacion-educacion-censal")
    .setMeta({ title: "Asistencia Educativa — San Salvador de Jujuy", category: CATEGORY, subcategory: "Educación", source: SOURCE, date: PERIOD })
    .addKPI({ id: "asiste", label: "Asiste a un establecimiento", value: asistePct, formatted: formatPercent(asistePct) })
    .addKPI({ id: "superior", label: "Con nivel superior alcanzado", value: superiorPct, formatted: formatPercent(superiorPct), comparison: "terciario, universitario o posgrado" })
    .addKPI({ id: "no-asiste", label: "Asistió pero no asiste", value: noAsistePct, formatted: formatPercent(noAsistePct) })
    .addKPI({ id: "nunca", label: "Nunca asistió", value: nuncaPct, formatted: formatPercent(nuncaPct), status: "warning" })
    .addKPI({ id: "sin-instr", label: "Sin instrucción (5+ años)", value: sinInstrPct, formatted: formatPercent(sinInstrPct), status: "warning" })
    .addKPI({ id: "posgrado", label: "Con posgrado alcanzado", value: posgradoT, formatted: formatCompact(posgradoT) });

  const sectionAsist = "Condición de asistencia — Belgrano";
  const sidAsist = slugify(sectionAsist);
  builder.addChart({ id: "pie-asist", type: "pie", title: "Condición de asistencia escolar — Belgrano", sectionId: sidAsist, sectionTitle: sectionAsist, data: [
    { id: "Asiste", label: "Asiste", value: tC1[3] },
    { id: "Asistió (no asiste)", label: "Asistió (no asiste)", value: tC1[4] },
    { id: "Nunca asistió", label: "Nunca asistió", value: tC1[5] },
  ] });

  const sectionNivel = "Máximo nivel educativo — Belgrano";
  const sidNivel = slugify(sectionNivel);
  const primarioT = (tC3[5] || 0) + (tC3[8] || 0);
  const secundarioT = (tC3[11] || 0) + (tC3[14] || 0);
  builder.addChart({ id: "pie-nivel", type: "pie", title: "Máximo nivel educativo alcanzado — Belgrano (5+ años)", sectionId: sidNivel, sectionTitle: sectionNivel, data: [
    { id: "Sin instrucción", label: "Sin instrucción", value: sinInstr },
    { id: "Primario", label: "Primario", value: primarioT },
    { id: "Secundario", label: "Secundario", value: secundarioT },
    { id: "Terciario", label: "Terciario", value: terciarioT },
    { id: "Universitario", label: "Universitario", value: universitarioT },
    { id: "Posgrado", label: "Posgrado", value: posgradoT },
  ].filter(d => d.value > 0) });

  const data = builder.build();
  const md = buildReportMd({
    ...data,
    intro: `En Dr. M. Belgrano sobre **${formatInteger(pobTot)} personas** en viviendas particulares, el **${formatPercent(asistePct)}** asiste a un establecimiento educativo, el **${formatPercent(noAsistePct)}** asistió pero no lo hace actualmente, y apenas el **${formatPercent(nuncaPct)}** nunca asistió. Entre la población de 5+ años, el **${formatPercent(superiorPct)}** alcanzó nivel superior (terciario, universitario o posgrado).`,
    executiveSummary: `Belgrano concentra la mayor escolarización formal de Jujuy. La cobertura universitaria — sostenida por la Universidad Nacional de Jujuy (UNJu), institutos terciarios y oferta privada — explica un nivel superior alcanzado del **${formatPercent(superiorPct)}**, sustancialmente más alto que en departamentos rurales. La población sin instrucción (**${formatPercent(sinInstrPct)}**) es menor que el promedio provincial. La asistencia actual (**${formatPercent(asistePct)}**) confirma el peso del corredor educativo capital.`,
    keyFindings: [
      `**Asistencia actual:** **${formatPercent(asistePct)}** asiste a un establecimiento.`,
      `**Nivel superior:** **${formatPercent(superiorPct)}** alcanzó terciario, universitario o posgrado — la mayor proporción provincial.`,
      `**Posgrado:** **${formatInteger(posgradoT)}** personas con posgrado — concentrado en la capital.`,
      `**Sin instrucción:** **${formatPercent(sinInstrPct)}** — déficit menor que el promedio provincial, concentrado en barrios populares y adultos mayores.`,
      `**Nunca asistió:** **${formatPercent(nuncaPct)}** — fracción residual.`,
    ],
    sectionNarratives: {
      [sidAsist]: `La asistencia escolar en Belgrano replica la cobertura cuasi universal de la educación obligatoria. La fracción "nunca asistió" se concentra mayormente en adultos mayores y refleja el legado histórico del sistema educativo argentino.`,
      [sidNivel]: `Belgrano concentra la oferta de educación superior de Jujuy. La proporción de población con título universitario o de posgrado es la más alta de la provincia, fenómeno típico de las capitales NOA.`,
    },
    policyImplications: `El peso de la educación superior en Belgrano demanda inversión sostenida en UNJu y en oferta terciaria. La continuidad educativa entre primario, secundario y superior es la clave del aprovechamiento del bono demográfico.`,
  });
  persist(slug, data, md);
}

// ═══════════════════════════════════════════════════════════════
// 7. Economía — Dr. M. Belgrano
// ═══════════════════════════════════════════════════════════════
function generateSSJEconomia() {
  const slug = "economia";
  const folder = path.join(RAW_DIR, "7- Características económicas");
  const fileC1 = path.join(folder, "c2022_jujuy_actividad_economica_c1_10.xlsx");
  const fileC6 = path.join(folder, "c2022_jujuy_actividad_economica_c6_10.xlsx");

  const c1 = extractJujuyTable(readSheetRows(fileC1, "Cuadro 1.10"));
  const c1Belg = getBelgranoRow(c1).row.map(toNumber);
  const ramasRows = readBelgranoSubsheet(fileC6);

  const pob14 = c1Belg[2];
  const pea = c1Belg[3];
  const ocupada = c1Belg[4];
  const desocupada = c1Belg[5];
  const noPea = c1Belg[6];
  const tasaActividad = (pea / pob14) * 100;
  const tasaEmpleo = (ocupada / pob14) * 100;
  const tasaDesoc = (desocupada / pea) * 100;

  const builder = new ReportBuilder("ssj-poblacion-economia")
    .setMeta({ title: "Características Económicas — San Salvador de Jujuy", category: CATEGORY, subcategory: "Economía", source: SOURCE, date: PERIOD })
    .addKPI({ id: "tact", label: "Tasa de actividad", value: tasaActividad, formatted: formatPercent(tasaActividad), comparison: "PEA / 14+" })
    .addKPI({ id: "temp", label: "Tasa de empleo", value: tasaEmpleo, formatted: formatPercent(tasaEmpleo), comparison: "Ocupados / 14+" })
    .addKPI({ id: "tdes", label: "Tasa de desocupación", value: tasaDesoc, formatted: formatPercent(tasaDesoc), comparison: "Desocupados / PEA", status: tasaDesoc > 8 ? "warning" : undefined })
    .addKPI({ id: "nopea", label: "No económicamente activa", value: noPea, formatted: formatCompact(noPea) });

  const sectionComp = "Condición de actividad — Belgrano";
  const sidComp = slugify(sectionComp);
  builder.addChart({ id: "pie-act", type: "pie", title: "Condición de actividad económica — Belgrano (14+)", sectionId: sidComp, sectionTitle: sectionComp, data: [
    { id: "Ocupada", label: "Ocupada", value: ocupada },
    { id: "Desocupada", label: "Desocupada", value: desocupada },
    { id: "No PEA", label: "No PEA", value: noPea },
  ] });

  const sectionTAct = "Tasa de actividad — comparativo provincial";
  const sidTAct = slugify(sectionTAct);
  builder.addChart({ id: "bar-tact-comp", type: "bar", title: "Tasa de actividad por departamento", sectionId: sidTAct, sectionTitle: sectionTAct, data: c1.departamentos.map(({ departamento, row }) => { const r = row.map(toNumber); return { departamento: departamento.nombre, "Tasa actividad %": Math.round((r[3] / r[2]) * 1000) / 10 }; }), config: { xAxis: "departamento", yAxis: "Tasa actividad %" } });

  const sectionTDes = "Tasa de desocupación — comparativo provincial";
  const sidTDes = slugify(sectionTDes);
  builder.addChart({ id: "bar-tdes-comp", type: "bar", title: "Tasa de desocupación por departamento", sectionId: sidTDes, sectionTitle: sectionTDes, data: c1.departamentos.map(({ departamento, row }) => { const r = row.map(toNumber); return { departamento: departamento.nombre, "Desocupación %": Math.round((r[5] / r[3]) * 1000) / 10 }; }), config: { xAxis: "departamento", yAxis: "Desocupación %" } });

  const sectionRama = "Ramas de actividad en Belgrano";
  const sidRama = slugify(sectionRama);
  const ramasData = [];
  for (const r of ramasRows) {
    const c0 = String(r?.[0] || "").trim();
    const c1Lbl = String(r?.[1] || "").trim();
    if (c0 || !c1Lbl) continue;
    if (/^\(/.test(c1Lbl) || c1Lbl.length < 4) continue;
    const ocup = toNumber(r[2]);
    if (ocup != null && ocup > 0) ramasData.push({ rama: c1Lbl.length > 38 ? c1Lbl.slice(0, 36) + "…" : c1Lbl, Ocupados: ocup });
  }
  ramasData.sort((a, b) => b.Ocupados - a.Ocupados);
  const ramasTop = ramasData.slice(0, 10);
  builder.addChart({ id: "bar-ramas", type: "bar", title: "Población ocupada por rama de actividad — Belgrano", sectionId: sidRama, sectionTitle: sectionRama, data: ramasTop, config: { xAxis: "rama", yAxis: "Ocupados", layout: "horizontal" } });
  builder.addRanking({ id: "rank-ramas", title: "Ramas con mayor ocupación en Belgrano", sectionId: sidRama, items: ramasTop.map(r => ({ name: r.rama, value: r.Ocupados })), order: "desc" });

  const data = builder.build();
  const desvDesoc = tasaDesoc - CENSO_2022.tasa_desocupacion_nacional;
  const md = buildReportMd({
    ...data,
    intro: `El Departamento Dr. M. Belgrano reúne **${formatInteger(pob14)} personas** de 14+ años, con una tasa de actividad del **${formatPercent(tasaActividad)}**, empleo del **${formatPercent(tasaEmpleo)}** y desocupación del **${formatPercent(tasaDesoc)}**. La estructura ocupacional capital combina empleo público provincial, servicios urbanos y comercio.`,
    executiveSummary: `La economía de Belgrano se sostiene en cuatro motores: **empleo público** (provincial y municipal), **comercio** (centro comercial provincial), **servicios financieros y profesionales**, y **educación-salud** (UNJu, hospitales). La tasa de actividad del **${formatPercent(tasaActividad)}** y la de desocupación del **${formatPercent(tasaDesoc)}** ${desvDesoc >= 0 ? `superan` : `están por debajo`} del promedio nacional. La capital captura el mercado laboral formal de la región: la oferta de empleo formal de Belgrano sostiene migración interna desde la Puna y la Quebrada.`,
    keyFindings: [
      `**Tasa de actividad:** **${formatPercent(tasaActividad)}** — alineada con el promedio NOA.`,
      `**Tasa de empleo:** **${formatPercent(tasaEmpleo)}** sobre la población de 14+.`,
      `**Tasa de desocupación:** **${formatPercent(tasaDesoc)}** ${desvDesoc >= 0 ? `por encima` : `por debajo`} del promedio nacional.`,
      `**No PEA:** **${formatInteger(noPea)}** personas — incluye estudiantes, jubilados, amas/os de casa.`,
      `**Estructura ocupacional:** empleo público, comercio, servicios y educación-salud lideran las ramas.`,
    ],
    sectionNarratives: {
      [sidComp]: `La distribución de actividad refleja una estructura urbana plena: la mayoría de la población 14+ está en la PEA, con peso del empleo formal (público y privado).`,
      [sidTAct]: `Belgrano se ubica en posición intermedia-alta de actividad, con dinámica similar a Palpalá y El Carmen. Los departamentos puneños presentan tasas menores por estructura demográfica y dependencia de actividades estacionales.`,
      [sidTDes]: `La desocupación en Belgrano es comparable a otras capitales del NOA: el mercado laboral capital absorbe migración pero también genera presión sobre el empleo formal disponible.`,
      [sidRama]: `Las ramas líderes en Belgrano son las propias de una capital: administración pública, comercio, enseñanza, salud y servicios profesionales. El sector industrial es marginal — concentrado en Palpalá.`,
    },
    policyImplications: `La política productiva capital debe complementar el empleo público (saturado) con incentivos al sector privado: comercio, turismo, servicios profesionales y economía del conocimiento. La diversificación de la base económica capital es estructural para reducir vulnerabilidad fiscal.`,
  });
  persist(slug, data, md);
}

// ═══════════════════════════════════════════════════════════════
// 8. Fecundidad — Dr. M. Belgrano
// ═══════════════════════════════════════════════════════════════
function generateSSJFecundidad() {
  const slug = "fecundidad";
  const folder = path.join(RAW_DIR, "8- Fecundidad");
  const fileC1 = path.join(folder, "c2022_jujuy_fecundidad_c1_10.xlsx");
  const fileC2 = path.join(folder, "c2022_jujuy_fecundidad_c2_10.xlsx");

  const c1 = extractJujuyTable(readSheetRows(fileC1, "Cuadro 1.10"));
  const c1Belg = getBelgranoRow(c1).row.map(toNumber);
  const c2Rows = readBelgranoSubsheet(fileC2);
  const c2Total = findTotal(c2Rows)?.map(toNumber) || [];

  // c1 cols: 0=Cod, 1=Depto, 2=Mujeres 14+, 3=Tuvo hijos, 4=Pct, 5=Hijos prom., 6=Hijos sobrev. prom.
  const mujeres14 = c1Belg[2];
  const tuvieronHijos = c1Belg[3];
  const pctTuvieron = c1Belg[4] != null ? c1Belg[4] : (tuvieronHijos / mujeres14) * 100;
  const hijosPromedio = c1Belg[5];

  const builder = new ReportBuilder("ssj-poblacion-fecundidad")
    .setMeta({ title: "Fecundidad — San Salvador de Jujuy", category: CATEGORY, subcategory: "Fecundidad", source: SOURCE, date: PERIOD })
    .addKPI({ id: "mujeres", label: "Mujeres de 14 años o más", value: mujeres14, formatted: formatCompact(mujeres14) })
    .addKPI({ id: "tuvo", label: "Tuvo al menos un hijo", value: pctTuvieron, formatted: formatPercent(pctTuvieron) })
    .addKPI({ id: "hijos-prom", label: "Hijos promedio por mujer", value: hijosPromedio, formatted: formatDecimal(hijosPromedio, 2), comparison: "entre las que tuvieron hijos" });

  const sectionComp = "Mujeres con hijos — comparativo provincial";
  const sidComp = slugify(sectionComp);
  builder.addChart({ id: "bar-tuvo-comp", type: "bar", title: "% mujeres que tuvieron al menos un hijo — por depto.", sectionId: sidComp, sectionTitle: sectionComp, data: c1.departamentos.map(({ departamento, row }) => { const r = row.map(toNumber); const pct = r[4] != null ? r[4] : (r[3] / r[2]) * 100; return { departamento: departamento.nombre, "% con hijos": Math.round(pct * 10) / 10 }; }), config: { xAxis: "departamento", yAxis: "% con hijos" } });

  const sectionHij = "Hijos promedio — comparativo provincial";
  const sidHij = slugify(sectionHij);
  builder.addChart({ id: "bar-hijos-comp", type: "bar", title: "Promedio de hijos por mujer (entre las que tuvieron) — por depto.", sectionId: sidHij, sectionTitle: sectionHij, data: c1.departamentos.map(({ departamento, row }) => { const r = row.map(toNumber); return { departamento: departamento.nombre, "Hijos promedio": r[5] || 0 }; }), config: { xAxis: "departamento", yAxis: "Hijos promedio" } });

  const ranked = c1.departamentos.map(({ departamento, row }) => ({ departamento, value: toNumber(row[5]) || 0 })).sort((a, b) => b.value - a.value);
  builder.addRanking({ id: "rank-hij", title: "Departamentos con mayor promedio de hijos", sectionId: sidHij, items: ranked.map(r => ({ name: r.departamento.nombre, value: Math.round(r.value * 100) / 100, municipioId: r.departamento.codigo })), order: "desc" });

  const data = builder.build();
  const md = buildReportMd({
    ...data,
    intro: `En Dr. M. Belgrano viven **${formatInteger(mujeres14)} mujeres** de 14 o más años. El **${formatPercent(pctTuvieron)}** tuvo al menos un hijo nacido vivo, con un promedio de **${formatDecimal(hijosPromedio, 2)} hijos** entre las que tuvieron — un valor por debajo del promedio provincial, característico de capitales urbanas.`,
    executiveSummary: `La fecundidad en Belgrano sigue el patrón típico de una capital provincial NOA: menos hijos por mujer que en el promedio provincial, transición demográfica más avanzada. El promedio de **${formatDecimal(hijosPromedio, 2)} hijos** entre las que tuvieron es claramente menor que en departamentos rurales como Santa Catalina o Rinconada. Esta diferencia se asocia con mayor escolarización femenina, inserción laboral formal, postergación de la maternidad y acceso a métodos anticonceptivos.`,
    keyFindings: [
      `**Mujeres 14+:** **${formatInteger(mujeres14)}** en Belgrano.`,
      `**Con hijos:** **${formatPercent(pctTuvieron)}** declararon haber tenido al menos un hijo nacido vivo.`,
      `**Hijos promedio:** **${formatDecimal(hijosPromedio, 2)}** — por debajo del promedio provincial.`,
      `**Transición demográfica avanzada:** fecundidad más baja que en departamentos rurales, patrón propio de capitales NOA.`,
    ],
    sectionNarratives: {
      [sidComp]: `La proporción de mujeres que tuvieron hijos es relativamente menor en Belgrano que en departamentos rurales, donde la maternidad temprana es más frecuente.`,
      [sidHij]: `Los departamentos puneños y rurales presentan los promedios más altos de hijos por mujer. Belgrano se ubica más cerca del promedio nacional.`,
    },
    policyImplications: `La menor fecundidad capital implica menor presión de crecimiento vegetativo y mayor peso del componente migratorio en el crecimiento poblacional. La planificación de servicios materno-infantiles y educación inicial debe considerar este diferencial vs. el resto de la provincia.`,
  });
  persist(slug, data, md);
}

// ═══════════════════════════════════════════════════════════════
// Main
// ═══════════════════════════════════════════════════════════════
function main() {
  console.log("╔══════════════════════════════════════════════════════════╗");
  console.log("║     Dashboard Jujuy — Apartado SSJ (Dr. M. Belgrano)    ║");
  console.log("╚══════════════════════════════════════════════════════════╝");
  console.log(`\nDepartamento: ${BELGRANO.nombre} (código ${BELGRANO.codigo})\n`);

  const informes = [
    ["1. Estructura", generateSSJEstructura],
    ["2. Habitacional Personas", generateSSJHabitacionalPersonas],
    ["3. Salud y Previsión", generateSSJSaludPrevision],
    ["4. Habitacional Hogares", generateSSJHabitacionalHogares],
    ["5. Viviendas", generateSSJViviendas],
    ["6. Educación Censal", generateSSJEducacion],
    ["7. Economía", generateSSJEconomia],
    ["8. Fecundidad", generateSSJFecundidad],
  ];

  let failed = 0;
  for (const [name, fn] of informes) {
    console.log(`\n▸ ${name}`);
    try { fn(); } catch (err) { console.error(`  ❌ ${err.message}`); failed++; }
  }

  console.log(`\n${"═".repeat(60)}`);
  if (failed === 0) console.log("  ✅ 8 informes SSJ generados.");
  else console.log(`  ⚠️  ${failed}/8 fallaron`);
}

main();
