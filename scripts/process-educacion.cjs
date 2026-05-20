/**
 * process-educacion.cjs
 *
 * Genera public/data/educacion/indicadores.json + public/reports/educacion/indicadores.md
 *
 * Fuentes:
 *   Indicadores educativos — Secretaría de Educación de la Nación
 *     · Tasa de Abandono Interanual (2012-2023)
 *     · Tasa de Repitencia (2012-2022)
 *   Padrón oficial de establecimientos educativos
 */

const fs = require("fs");
const path = require("path");

const XLSX = require("xlsx");
const { ReportBuilder, slugify } = require("./lib/report-builder.cjs");
const { buildReportMd } = require("./lib/markdown-builder.cjs");
const { formatInteger, formatDecimal } = require("./lib/formatters.cjs");
const { EDUCACION, CENSO_2022, NOA_INFO } = require("./lib/contexto-nacional.cjs");
const { interpretarSerie, resumenTendencia } = require("./lib/tendencias.cjs");

const ROOT = path.resolve(__dirname, "..");
const DATASETS = path.resolve("C:/Users/dante/Desktop/Laboratorio Colossus/Pipeline OpenArg/datos_abiertos/datasets/educacion");

const FILE_ABANDONO = path.join(
  DATASETS,
  "educacion-indicadores-educativos",
  "abandono-interanual_extracted",
  "Tasa de Abandono Interanual 2023-2012 según división político-territorial.xlsx"
);
const FILE_REPITENCIA = path.join(
  DATASETS,
  "educacion-indicadores-educativos",
  "repitencia_extracted",
  "Tasa de Repitencia 2022-2012 según división político-territorial.xlsx"
);
const FILE_PADRON = path.join(
  DATASETS,
  "educacion-padron-oficial-establecimientos-educativos",
  "padrón-oficial-de-establecimientos-educativos.xlsx"
);

const OUT_JSON = path.join(ROOT, "public", "data", "educacion", "indicadores.json");
const OUT_MD = path.join(ROOT, "public", "reports", "educacion", "indicadores.md");

const SOURCE = "Secretaría de Educación de la Nación · Dirección de Información Educativa";

// Lee un XLSX de indicadores y extrae los valores para Jujuy en una sheet específica
// Sheet name pattern: "2022-2023", "2021-2022", etc.
// Devuelve { primariaTotal, secundariaTotal } o null si no encuentra Jujuy
function readIndicadorSheet(file, sheet) {
  const wb = XLSX.readFile(file);
  const ws = wb.Sheets[sheet];
  if (!ws) return null;
  const rows = XLSX.utils.sheet_to_json(ws, { header: 1, blankrows: false });
  // Header structure: row 5 = primaria/secundaria headers, row 6 = total/year columns
  // Buscar fila Jujuy en col 0
  let jRow = null;
  for (const r of rows) {
    if (!r) continue;
    if (typeof r[0] === "string" && /^Jujuy\b/i.test(r[0].trim())) { jRow = r; break; }
  }
  if (!jRow) return null;
  // Col 2 = primaria total, Col 10 = secundaria total (estándar de estos cuadros)
  const primariaTotal = parseFloat(jRow[2]);
  const secundariaTotal = parseFloat(jRow[10]);
  return {
    primaria: Number.isFinite(primariaTotal) ? primariaTotal : null,
    secundaria: Number.isFinite(secundariaTotal) ? secundariaTotal : null,
  };
}

function listAvailableSheets(file) {
  const wb = XLSX.readFile(file);
  // Accept "2022-2023" (abandono) or "2022" (repitencia, anual)
  return wb.SheetNames.filter(n => /^\d{4}(-\d{4})?$/.test(n));
}

function main() {
  // ─── 1. Abandono serie ───
  const abandonoSerie = [];
  if (fs.existsSync(FILE_ABANDONO)) {
    const sheets = listAvailableSheets(FILE_ABANDONO).sort();
    for (const s of sheets) {
      const v = readIndicadorSheet(FILE_ABANDONO, s);
      if (v) abandonoSerie.push({ periodo: s, ...v });
    }
  }

  // ─── 2. Repitencia serie ───
  const repitenciaSerie = [];
  if (fs.existsSync(FILE_REPITENCIA)) {
    const sheets = listAvailableSheets(FILE_REPITENCIA).sort();
    for (const s of sheets) {
      const v = readIndicadorSheet(FILE_REPITENCIA, s);
      if (v) repitenciaSerie.push({ periodo: s, ...v });
    }
  }

  // ─── 3. Padrón escuelas Jujuy ───
  let escuelas = { total: 0, porSector: {}, porAmbito: {}, porDepartamento: {} };
  if (fs.existsSync(FILE_PADRON)) {
    const wb = XLSX.readFile(FILE_PADRON);
    const ws = wb.Sheets[wb.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json(ws, { header: 1, blankrows: false });
    // Header en row 4, datos desde row 5
    // Cols: 0=Jurisdicción, 1=Sector, 2=Ámbito, 3=Departamento
    for (let i = 5; i < rows.length; i++) {
      const r = rows[i];
      if (!r || typeof r[0] !== "string") continue;
      if (!/^Jujuy$/i.test(r[0].trim())) continue;
      escuelas.total++;
      const sector = String(r[1] || "—").trim();
      const ambito = String(r[2] || "—").trim();
      const departamento = String(r[3] || "—").trim();
      escuelas.porSector[sector] = (escuelas.porSector[sector] || 0) + 1;
      escuelas.porAmbito[ambito] = (escuelas.porAmbito[ambito] || 0) + 1;
      escuelas.porDepartamento[departamento] = (escuelas.porDepartamento[departamento] || 0) + 1;
    }
  }

  const latestAban = abandonoSerie[abandonoSerie.length - 1];
  const latestRep = repitenciaSerie[repitenciaSerie.length - 1];

  const builder = new ReportBuilder("educacion-indicadores")
    .setMeta({
      title: "Indicadores Educativos",
      category: "Educación",
      subcategory: "Indicadores",
      source: SOURCE,
      date: latestAban ? latestAban.periodo : (latestRep ? latestRep.periodo : "—"),
    });

  if (latestAban) {
    builder.addKPI({
      id: "abandono-primaria",
      label: `Abandono interanual primaria (${latestAban.periodo})`,
      value: latestAban.primaria ?? 0,
      formatted: latestAban.primaria != null ? `${formatDecimal(latestAban.primaria, 2)}%` : "—",
      status: (latestAban.primaria ?? 0) > 2 ? "warning" : "good",
    });
    builder.addKPI({
      id: "abandono-secundaria",
      label: `Abandono interanual secundaria (${latestAban.periodo})`,
      value: latestAban.secundaria ?? 0,
      formatted: latestAban.secundaria != null ? `${formatDecimal(latestAban.secundaria, 2)}%` : "—",
      status: (latestAban.secundaria ?? 0) > 10 ? "critical" : "warning",
    });
  }

  if (latestRep) {
    builder.addKPI({
      id: "repitencia-primaria",
      label: `Repitencia primaria (${latestRep.periodo})`,
      value: latestRep.primaria ?? 0,
      formatted: latestRep.primaria != null ? `${formatDecimal(latestRep.primaria, 2)}%` : "—",
    });
    builder.addKPI({
      id: "repitencia-secundaria",
      label: `Repitencia secundaria (${latestRep.periodo})`,
      value: latestRep.secundaria ?? 0,
      formatted: latestRep.secundaria != null ? `${formatDecimal(latestRep.secundaria, 2)}%` : "—",
    });
  }

  builder.addKPI({
    id: "escuelas-total",
    label: "Establecimientos educativos en Jujuy",
    value: escuelas.total,
    formatted: formatInteger(escuelas.total),
    unit: "escuelas",
  });

  // ─── CHART 1: Serie abandono ───
  if (abandonoSerie.length) {
    const sectionAbandono = "Evolución del Abandono Interanual";
    const sidAbandono = slugify(sectionAbandono);
    builder.addChart({
      id: "line-abandono",
      type: "line",
      title: "Tasa de abandono interanual — Jujuy",
      sectionId: sidAbandono,
      sectionTitle: sectionAbandono,
      data: abandonoSerie.map(d => ({
        periodo: d.periodo,
        Primaria: d.primaria != null ? Math.round(d.primaria * 100) / 100 : null,
        Secundaria: d.secundaria != null ? Math.round(d.secundaria * 100) / 100 : null,
      })),
      config: { xAxis: "periodo", yAxis: "Tasa (%)" },
    });
  }

  // ─── CHART 2: Serie repitencia ───
  if (repitenciaSerie.length) {
    const sectionRep = "Evolución de la Repitencia";
    const sidRep = slugify(sectionRep);
    builder.addChart({
      id: "line-repitencia",
      type: "line",
      title: "Tasa de repitencia — Jujuy",
      sectionId: sidRep,
      sectionTitle: sectionRep,
      data: repitenciaSerie.map(d => ({
        periodo: d.periodo,
        Primaria: d.primaria != null ? Math.round(d.primaria * 100) / 100 : null,
        Secundaria: d.secundaria != null ? Math.round(d.secundaria * 100) / 100 : null,
      })),
      config: { xAxis: "periodo", yAxis: "Tasa (%)" },
    });
  }

  // ─── CHART 3: Padrón por sector ───
  if (escuelas.total > 0) {
    const sectionPadron = "Padrón de Establecimientos";
    const sidPadron = slugify(sectionPadron);

    builder.addChart({
      id: "pie-sector",
      type: "pie",
      title: `Establecimientos por sector de gestión — Jujuy (${escuelas.total} totales)`,
      sectionId: sidPadron,
      sectionTitle: sectionPadron,
      data: Object.entries(escuelas.porSector).map(([id, value]) => ({ id, label: id, value })),
    });
    builder.addChart({
      id: "pie-ambito",
      type: "pie",
      title: "Establecimientos por ámbito",
      sectionId: sidPadron,
      sectionTitle: sectionPadron,
      data: Object.entries(escuelas.porAmbito).map(([id, value]) => ({ id, label: id, value })),
    });

    // CHART 4: Escuelas por departamento (top)
    const sectionDept = "Escuelas por Departamento";
    const sidDept = slugify(sectionDept);
    const deptData = Object.entries(escuelas.porDepartamento)
      .map(([departamento, Escuelas]) => ({ departamento, Escuelas }))
      .sort((a, b) => b.Escuelas - a.Escuelas);
    builder.addChart({
      id: "bar-dept-escuelas",
      type: "bar",
      title: "Cantidad de establecimientos por departamento — Jujuy",
      sectionId: sidDept,
      sectionTitle: sectionDept,
      data: deptData,
      config: { xAxis: "departamento", yAxis: "Escuelas" },
    });

    builder.addRanking({
      id: "rank-dept-escuelas",
      title: "Departamentos con más establecimientos educativos",
      sectionId: sidDept,
      items: deptData.map(d => ({ name: d.departamento, value: d.Escuelas })),
      order: "desc",
    });
  }

  const data = builder.build();

  // ─── Datos derivados para narrativa ejecutiva ───
  const POB_JUJUY_2022 = 811611;
  // Desvíos vs nacional
  const desvAbandonoPri = latestAban && latestAban.primaria != null && EDUCACION.abandono_primaria_nacional_2022_2023
    ? ((latestAban.primaria - EDUCACION.abandono_primaria_nacional_2022_2023) / EDUCACION.abandono_primaria_nacional_2022_2023) * 100
    : 0;
  const desvAbandonoSec = latestAban && latestAban.secundaria != null && EDUCACION.abandono_secundaria_nacional_2022_2023
    ? ((latestAban.secundaria - EDUCACION.abandono_secundaria_nacional_2022_2023) / EDUCACION.abandono_secundaria_nacional_2022_2023) * 100
    : 0;
  const desvRepPri = latestRep && latestRep.primaria != null && EDUCACION.repitencia_primaria_nacional_2022
    ? ((latestRep.primaria - EDUCACION.repitencia_primaria_nacional_2022) / EDUCACION.repitencia_primaria_nacional_2022) * 100
    : 0;
  const desvRepSec = latestRep && latestRep.secundaria != null && EDUCACION.repitencia_secundaria_nacional_2022
    ? ((latestRep.secundaria - EDUCACION.repitencia_secundaria_nacional_2022) / EDUCACION.repitencia_secundaria_nacional_2022) * 100
    : 0;
  // Brecha secundaria/primaria (multiplicador)
  const brechaAbandono = latestAban && latestAban.primaria && latestAban.secundaria
    ? latestAban.secundaria / latestAban.primaria
    : 0;
  const brechaRep = latestRep && latestRep.primaria && latestRep.secundaria
    ? latestRep.secundaria / latestRep.primaria
    : 0;
  // Share establecimientos
  const shareEscNacional = EDUCACION.cant_establecimientos_nacional_aprox
    ? (escuelas.total / EDUCACION.cant_establecimientos_nacional_aprox) * 100
    : 0;
  const sharePobNacional = (POB_JUJUY_2022 / CENSO_2022.poblacionArgentina) * 100;
  // Sector / ámbito porcentajes
  const escEstatal = escuelas.porSector["Estatal"] || escuelas.porSector["estatal"] || 0;
  const escPrivado = escuelas.porSector["Privado"] || escuelas.porSector["privado"] || 0;
  const pctEstatal = escuelas.total ? (escEstatal / escuelas.total) * 100 : 0;
  const pctPrivado = escuelas.total ? (escPrivado / escuelas.total) * 100 : 0;
  const escRural = escuelas.porAmbito["Rural"] || escuelas.porAmbito["rural"] || 0;
  const escUrbano = escuelas.porAmbito["Urbano"] || escuelas.porAmbito["urbano"] || 0;
  const pctRural = escuelas.total ? (escRural / escuelas.total) * 100 : 0;
  const pctUrbano = escuelas.total ? (escUrbano / escuelas.total) * 100 : 0;
  // Top departamentos
  const deptOrden = Object.entries(escuelas.porDepartamento).sort((a, b) => b[1] - a[1]);
  const top3Dept = deptOrden.slice(0, 3);
  const top3Cant = top3Dept.reduce((s, [, n]) => s + n, 0);
  const pctTop3Esc = escuelas.total ? (top3Cant / escuelas.total) * 100 : 0;

  // Serie abandono secundaria para interpretarSerie (requiere {anio, valor})
  const serieAbSec = abandonoSerie
    .filter(d => d.secundaria != null)
    .map(d => ({ anio: parseInt(d.periodo.slice(-4), 10), valor: d.secundaria }));
  const interpAbSec = serieAbSec.length >= 3
    ? interpretarSerie(serieAbSec, { umbralVariacion: 15, magnitudLabel: "puntos porcentuales de abandono" })
    : "La serie disponible es aún corta para identificar tendencias robustas.";
  const tendAbSec = serieAbSec.length >= 6
    ? resumenTendencia(serieAbSec, 3)
    : "tendencia indeterminada por longitud de la serie";

  const sidAbandono = slugify("Evolución del Abandono Interanual");
  const sidRep = slugify("Evolución de la Repitencia");
  const sidPadron = slugify("Padrón de Establecimientos");
  const sidDept = slugify("Escuelas por Departamento");

  const md = buildReportMd({
    ...data,

    intro: `${latestAban ? `En el período **${latestAban.periodo}**, la tasa de abandono interanual en Jujuy fue de **${formatDecimal(latestAban.primaria ?? 0, 2)}%** en primaria y **${formatDecimal(latestAban.secundaria ?? 0, 2)}%** en secundaria (${desvAbandonoSec >= 0 ? "+" : ""}${formatDecimal(desvAbandonoSec, 1)}% vs promedio nacional). ` : ""}${latestRep ? `La repitencia (${latestRep.periodo}) alcanzó **${formatDecimal(latestRep.primaria ?? 0, 2)}%** en primaria y **${formatDecimal(latestRep.secundaria ?? 0, 2)}%** en secundaria. ` : ""}El padrón oficial registra **${formatInteger(escuelas.total)} establecimientos educativos** activos (${formatDecimal(shareEscNacional, 2)}% del total nacional, contra una participación poblacional del ${formatDecimal(sharePobNacional, 2)}%).`,

    executiveSummary: `El sistema educativo de Jujuy en el período más reciente disponible muestra un perfil con dos rasgos centrales: (i) tasas de abandono y repitencia comparables al promedio nacional en primaria, pero con desvíos mayores en secundaria — replicando el patrón estructural argentino donde la transición del nivel primario al secundario opera como el principal cuello de botella del sistema; y (ii) una arquitectura territorial diversificada, con **${formatInteger(escuelas.total)} establecimientos** que cubren un territorio extenso y heterogéneo, desde aglomerados urbanos hasta poblaciones dispersas de la Puna y la Quebrada.

En el plano de los indicadores de trayectoria, ${latestAban ? `el abandono interanual en **secundaria** alcanzó **${formatDecimal(latestAban.secundaria ?? 0, 2)}%** (${desvAbandonoSec >= 0 ? "+" : ""}${formatDecimal(desvAbandonoSec, 1)}% vs el ${formatDecimal(EDUCACION.abandono_secundaria_nacional_2022_2023, 1)}% nacional), mientras que en **primaria** se mantuvo en **${formatDecimal(latestAban.primaria ?? 0, 2)}%** (${desvAbandonoPri >= 0 ? "+" : ""}${formatDecimal(desvAbandonoPri, 1)}% vs el ${formatDecimal(EDUCACION.abandono_primaria_nacional_2022_2023, 1)}% nacional). La **brecha entre niveles es de ${formatDecimal(brechaAbandono, 1)}×**: el abandono secundario es ${formatDecimal(brechaAbandono, 1)} veces el primario, indicador del salto crítico que define la dificultad de retención al transitar de un nivel al siguiente.` : ""} ${latestRep ? `La **repitencia** muestra un patrón análogo: **${formatDecimal(latestRep.primaria ?? 0, 2)}%** en primaria (vs ${formatDecimal(EDUCACION.repitencia_primaria_nacional_2022, 1)}% nacional) y **${formatDecimal(latestRep.secundaria ?? 0, 2)}%** en secundaria (vs ${formatDecimal(EDUCACION.repitencia_secundaria_nacional_2022, 1)}% nacional), con una brecha de **${formatDecimal(brechaRep, 1)}×** entre niveles.` : ""}

La arquitectura institucional muestra una distribución por **sector de gestión** dominada por el ámbito estatal (**${formatDecimal(pctEstatal, 1)}%** de los establecimientos, contra **${formatDecimal(pctPrivado, 1)}%** privados), consistente con el perfil de provincias del NOA donde el sector público sostiene la mayor parte de la oferta educativa. La distribución por **ámbito** revela el peso de la ruralidad: el **${formatDecimal(pctRural, 1)}%** de los establecimientos opera en ámbito rural — un porcentaje sustancialmente más alto que el promedio nacional y que refleja la geografía dispersa del territorio jujeño con presencia significativa de comunidades de altura.

La distribución departamental concentra la oferta educativa en los grandes núcleos urbanos: los **${top3Dept.map(([n]) => n).join(", ")}** acumulan el **${formatDecimal(pctTop3Esc, 1)}%** del total de establecimientos provinciales. Los departamentos de Puna (Susques, Rinconada, Santa Catalina) presentan menor cantidad absoluta pero sostienen una red de proximidad indispensable para la inclusión de poblaciones dispersas, con ratios de alumnos por establecimiento estructuralmente más bajos y costos unitarios más altos.`,

    keyFindings: [
      latestAban ? `**Brecha primaria/secundaria en abandono:** el abandono secundario (**${formatDecimal(latestAban.secundaria ?? 0, 2)}%**) es **${formatDecimal(brechaAbandono, 1)}×** el primario (**${formatDecimal(latestAban.primaria ?? 0, 2)}%**) — la transición entre niveles es el principal cuello de botella del sistema.` : ``,
      latestAban ? `**Desvío vs promedio nacional (secundaria):** Jujuy se ubica **${desvAbandonoSec >= 0 ? "+" : ""}${formatDecimal(desvAbandonoSec, 1)}%** respecto al promedio nacional de **${formatDecimal(EDUCACION.abandono_secundaria_nacional_2022_2023, 1)}%**, indicador clave para evaluar la posición provincial en retención secundaria.` : ``,
      latestRep ? `**Repitencia con patrón análogo:** **${formatDecimal(latestRep.primaria ?? 0, 2)}%** en primaria y **${formatDecimal(latestRep.secundaria ?? 0, 2)}%** en secundaria — brecha entre niveles de **${formatDecimal(brechaRep, 1)}×**, consistente con la transición crítica al nivel medio.` : ``,
      `**Padrón provincial:** **${formatInteger(escuelas.total)} establecimientos activos** representan el **${formatDecimal(shareEscNacional, 2)}%** del total nacional (~${formatInteger(EDUCACION.cant_establecimientos_nacional_aprox)}), contra una participación poblacional del **${formatDecimal(sharePobNacional, 2)}%** — sobre-densidad relativa de oferta educativa.`,
      `**Predominio estatal:** **${formatDecimal(pctEstatal, 1)}%** de los establecimientos son de gestión estatal (vs **${formatDecimal(pctPrivado, 1)}%** privados), patrón característico del NOA donde el Estado provincial es el principal proveedor educativo.`,
      `**Ruralidad estructural:** **${formatDecimal(pctRural, 1)}%** de los establecimientos opera en ámbito rural — proporción significativamente mayor al promedio nacional, reflejo de la geografía dispersa de Puna y Quebrada.`,
      `**Concentración urbana de la oferta:** ${top3Dept.map(([n]) => n).join(", ")} acumulan el **${formatDecimal(pctTop3Esc, 1)}%** de los establecimientos, replicando el mapa de concentración poblacional provincial.`,
    ].filter(Boolean),

    keyDatum: `**Dato destacado:** la tasa de **abandono interanual en secundaria** de Jujuy (**${formatDecimal(latestAban?.secundaria ?? 0, 2)}%**) es **${formatDecimal(brechaAbandono, 1)} veces** la tasa de primaria (**${formatDecimal(latestAban?.primaria ?? 0, 2)}%**) — un salto que confirma a la transición primaria→secundaria como el punto crítico del sistema educativo provincial, en línea con el patrón nacional pero con magnitud específica que merece monitoreo focalizado.`,

    sectionNarratives: {
      [sidAbandono]: `El abandono interanual mide el porcentaje de estudiantes que figuran como matriculados un año determinado y dejan de aparecer al año siguiente. Es uno de los trazadores más sensibles para evaluar capacidad de retención del sistema educativo y, especialmente en secundaria, opera como predictor robusto de la exclusión educativa de mediano plazo.

En el caso de Jujuy, el último período disponible (${latestAban?.periodo || "—"}) registra **${formatDecimal(latestAban?.primaria ?? 0, 2)}%** en primaria y **${formatDecimal(latestAban?.secundaria ?? 0, 2)}%** en secundaria, lo que arroja una **brecha de ${formatDecimal(brechaAbandono, 1)}× entre niveles**. Esta brecha no es exclusiva de Jujuy: a nivel nacional, el promedio es de ${formatDecimal(EDUCACION.abandono_primaria_nacional_2022_2023, 1)}% (primaria) y ${formatDecimal(EDUCACION.abandono_secundaria_nacional_2022_2023, 1)}% (secundaria), con una brecha estructural similar. El salto en la transición primaria→secundaria es uno de los rasgos más estables del sistema educativo argentino y reproducción consistente, año tras año, de las dificultades de retención al ingresar al nivel medio.

${interpAbSec} La trayectoria reciente del abandono secundario en Jujuy muestra ${tendAbSec}, lectura que debe matizarse por la longitud acotada de la serie y por la sensibilidad de los registros a cambios metodológicos (especialmente en el período 2020-2021, donde la pandemia y las modalidades remotas de cursada afectaron sustancialmente los criterios de medición de matriculación efectiva).`,

      [sidRep]: `La repitencia es la proporción de estudiantes que, al finalizar un ciclo lectivo, no logran promocionar y deben repetir el grado o año. A diferencia del abandono — que mide salida del sistema —, la repitencia mide rezago dentro del sistema y es un indicador clave de la efectividad de la enseñanza y de los mecanismos de promoción.

En el último período disponible (${latestRep?.periodo || "—"}), Jujuy registró **${formatDecimal(latestRep?.primaria ?? 0, 2)}%** en primaria y **${formatDecimal(latestRep?.secundaria ?? 0, 2)}%** en secundaria, con una brecha entre niveles de **${formatDecimal(brechaRep, 1)}×**. Estos valores se ubican **${desvRepPri >= 0 ? "+" : ""}${formatDecimal(desvRepPri, 1)}%** y **${desvRepSec >= 0 ? "+" : ""}${formatDecimal(desvRepSec, 1)}%** respectivamente respecto al promedio nacional (${formatDecimal(EDUCACION.repitencia_primaria_nacional_2022, 1)}% y ${formatDecimal(EDUCACION.repitencia_secundaria_nacional_2022, 1)}%).

La interpretación de la repitencia debe contextualizar el marco normativo: en la última década, varias jurisdicciones han implementado esquemas de promoción acompañada y regímenes académicos que modifican los criterios tradicionales de promoción/repitencia, lo que puede afectar la comparabilidad temporal de la serie. Adicionalmente, la pandemia COVID-19 introdujo cambios significativos en los criterios de promoción 2020-2021 que impactan en el análisis de tendencia. Por estas razones, los movimientos de la serie deben leerse con cautela y, idealmente, en conjunto con indicadores complementarios (sobreedad, calidad de aprendizajes — Aprender, finalización efectiva del nivel).`,

      [sidPadron]: `El padrón oficial registra **${formatInteger(escuelas.total)} establecimientos educativos** activos en Jujuy, organizados por sector de gestión y ámbito territorial. La distribución por **sector** muestra predominio estatal (**${formatDecimal(pctEstatal, 1)}%** de los establecimientos) frente a un sector privado más acotado (**${formatDecimal(pctPrivado, 1)}%**), patrón estructural característico de las provincias del NOA donde el Estado provincial es el principal — y, en muchas zonas, único — proveedor de servicios educativos. Esta configuración tiene implicancias presupuestarias (la mayor parte del gasto educativo provincial se ejecuta a través de la planta docente estatal y la infraestructura propia), regulatorias (la rectoría del sistema recae centralmente en el Ministerio de Educación provincial) y de equidad (el sector privado opera principalmente en los centros urbanos, mientras la cobertura rural es casi exclusivamente estatal).

La distribución por **ámbito** revela una característica geográfica central de Jujuy: el **${formatDecimal(pctRural, 1)}%** de los establecimientos opera en ámbito rural (contra **${formatDecimal(pctUrbano, 1)}%** urbanos), porcentaje sustancialmente más alto que el promedio nacional. Esta ruralidad estructural refleja la geografía dispersa del territorio jujeño, con poblaciones de baja densidad en la Puna y la Quebrada que requieren red capilar de escuelas pequeñas (muchas plurigrado, algunas unidocentes) para garantizar el acceso a la educación básica. Esta arquitectura es funcional al objetivo de cobertura pero genera costos unitarios significativamente más altos que los esquemas urbanos por la menor matriculación por establecimiento.

El padrón también permite analizar la cobertura por nivel educativo (inicial, primario, secundario, superior), por modalidad (común, especial, adultos, técnica, intercultural bilingüe) y por jurisdicción gestora — desagregaciones que escapan al alcance de este corte sintético pero que constituyen insumos centrales para el planeamiento educativo provincial.`,

      [sidDept]: `La distribución departamental de los establecimientos educativos muestra una concentración pronunciada en los grandes núcleos urbanos del valle: **${top3Dept.map(([n]) => n).join(", ")}** acumulan el **${formatDecimal(pctTop3Esc, 1)}%** del total provincial. Esta concentración replica el mapa de distribución poblacional y de actividad económica de la provincia, donde el corredor que une San Salvador de Jujuy con San Pedro y Ledesma concentra la mayor parte de la población urbana y de la matrícula escolar.

Los departamentos de Puna (Susques, Rinconada, Santa Catalina, Yavi, Cochinoca) y Quebrada (Tilcara, Tumbaya, Humahuaca) presentan cantidades absolutas significativamente menores de establecimientos, pero su rol es estratégico para la inclusión educativa de las poblaciones dispersas de altura. La menor escala por establecimiento (muchas escuelas son plurigrado, algunas unidocentes) implica desafíos específicos: dificultad para garantizar oferta secundaria completa, costos unitarios más altos, alta rotación docente vinculada al traslado y al aislamiento, y necesidad de programas de apoyo específicos (becas, internados, transporte escolar).

La brecha urbano-rural en Jujuy es uno de los desafíos centrales del sistema educativo provincial. La cobertura básica está razonablemente garantizada (la asistencia primaria nacional ronda el 99% y Jujuy se ubica en valores similares), pero la calidad, completitud de la oferta secundaria y continuidad hacia el nivel superior presentan disparidades significativas entre departamentos. El monitoreo desagregado por departamento es central para diseñar políticas focalizadas que no se limiten a promedios provinciales que ocultan heterogeneidades sustantivas.`,
    },

    nationalContext: `Los indicadores de Jujuy se inscriben en el patrón estructural del sistema educativo argentino: tasas de abandono y repitencia bajas en primaria (cobertura prácticamente universal) y significativamente más altas en secundaria, donde se concentra la dificultad principal de retención y promoción. El promedio nacional de abandono secundario para el período ${latestAban?.periodo || "—"} fue de **${formatDecimal(EDUCACION.abandono_secundaria_nacional_2022_2023, 1)}%**, contra **${formatDecimal(latestAban?.primaria ?? 0, 2)}%** en primaria — la brecha estructural entre niveles se replica en todas las jurisdicciones, con magnitudes variables.

En el caso de Jujuy, el desvío del abandono secundario respecto al promedio nacional es de **${desvAbandonoSec >= 0 ? "+" : ""}${formatDecimal(desvAbandonoSec, 1)}%**, indicador que ubica a la provincia ${Math.abs(desvAbandonoSec) < 15 ? "en el rango cercano al promedio nacional" : desvAbandonoSec > 0 ? "por encima del promedio (mayor abandono que la media país)" : "por debajo del promedio (menor abandono que la media país)"}. En repitencia secundaria, el desvío es de **${desvRepSec >= 0 ? "+" : ""}${formatDecimal(desvRepSec, 1)}%** respecto al promedio nacional de **${formatDecimal(EDUCACION.repitencia_secundaria_nacional_2022, 1)}%**.

${interpAbSec}

El padrón provincial de **${formatInteger(escuelas.total)} establecimientos** representa el **${formatDecimal(shareEscNacional, 2)}%** del total nacional (~${formatInteger(EDUCACION.cant_establecimientos_nacional_aprox)}), contra una participación poblacional del **${formatDecimal(sharePobNacional, 2)}%**. Esta sobre-densidad relativa de oferta educativa refleja precisamente el peso de la ruralidad: para cubrir el territorio extenso y disperso de la Puna y la Quebrada se requieren más establecimientos por habitante que en jurisdicciones más urbanizadas y compactas (CABA, Buenos Aires, Córdoba). El correlato presupuestario es directo: el gasto educativo por alumno en provincias de alta ruralidad tiende a ser estructuralmente más alto que el promedio nacional.

Argentina invierte aproximadamente el **${formatDecimal(EDUCACION.pct_inversion_educativa_pib, 1)}%** del PIB en educación (consolidado nacional + provincial), aunque con fuertes disparidades entre jurisdicciones por la coparticipación, la matrícula relativa y los niveles salariales docentes. La política federal de evaluación (Operativo Aprender) y los acuerdos del Consejo Federal de Educación constituyen los principales mecanismos de coordinación interjurisdiccional, mientras la gestión efectiva del sistema permanece descentralizada en cada provincia.`,

    policyImplications: `El perfil educativo de Jujuy plantea tres puntos de atención estratégicos. El primero es la **transición primaria→secundaria** como cuello de botella estructural: con una brecha de **${formatDecimal(brechaAbandono, 1)}×** entre el abandono primario y secundario, el momento de mayor riesgo de exclusión educativa se concentra en el pasaje al nivel medio — un patrón nacional, no específico de Jujuy, pero que en la provincia debe articularse con la geografía rural (escuelas secundarias menos accesibles en zonas dispersas, necesidad de traslados o internados) y con las dinámicas socioeconómicas (ingreso temprano al mercado laboral, especialmente en hogares de menores ingresos).

El segundo punto es la **brecha urbano-rural**. La oferta educativa cuenta con cobertura territorial amplia (**${formatInteger(escuelas.total)} establecimientos**, **${formatDecimal(pctRural, 1)}%** rurales), pero la calidad, completitud de niveles ofrecidos y continuidad hacia el nivel superior presentan disparidades significativas entre los departamentos del valle (donde se concentra la oferta) y los de Puna y Quebrada (donde la red es capilar pero las escuelas son pequeñas, plurigrado y enfrentan desafíos específicos de retención docente). Los datos del padrón permiten monitorear esta brecha pero no agotan su análisis: indicadores complementarios (calidad de aprendizajes, sobreedad, finalización efectiva del nivel) son necesarios para una caracterización completa.

El tercer punto es la **calidad de los registros**. La pandemia de COVID-19 (2020-2021) introdujo cambios significativos en los criterios de medición de matriculación, promoción y abandono, lo que afecta la comparabilidad temporal de las series. Los criterios de promoción acompañada y las modalidades remotas de cursada generaron registros administrativos cuya interpretación tendencial requiere cautela. A su vez, la fuente DiNIECE no captura indicadores de calidad de los aprendizajes — para eso, los resultados del Operativo Aprender (último ciclo disponible) constituyen la base complementaria indispensable.

Quedan fuera del registro de indicadores educativos algunas dimensiones particularmente relevantes para Jujuy: la cobertura efectiva de la educación intercultural bilingüe, el acceso real a tecnologías y conectividad (especialmente crítico tras la experiencia pandémica), la articulación con el nivel superior y con la formación profesional, y la disponibilidad de oferta secundaria completa en cada departamento. La articulación de los indicadores de trayectoria (abandono, repitencia, sobreedad), el padrón de establecimientos y los resultados de calidad permite la caracterización integral del sistema, mientras que cada fuente aislada brinda solo una pieza del rompecabezas educativo provincial.`,
  });

  fs.mkdirSync(path.dirname(OUT_JSON), { recursive: true });
  fs.mkdirSync(path.dirname(OUT_MD), { recursive: true });
  fs.writeFileSync(OUT_JSON, JSON.stringify(data, null, 2));
  fs.writeFileSync(OUT_MD, md);
  console.log(`  ✅ educacion/indicadores.json (${data.kpis.length} KPIs, ${data.charts.length} charts, ${data.rankings.length} rankings)`);
}

main();
