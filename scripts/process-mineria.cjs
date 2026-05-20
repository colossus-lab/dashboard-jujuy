/**
 * process-mineria.cjs
 *
 * Genera public/data/mineria/litio.json + public/reports/mineria/litio.md
 *
 * Fuente:
 *   SIACAM — Sistema de Información Abierta a la Comunidad sobre Actividad Minera
 *   Datasets: cartera de proyectos, empleo en litio, exportaciones nacionales
 */

const fs = require("fs");
const path = require("path");

const XLSX = require("xlsx");
const Papa = require("papaparse");
const { ReportBuilder, slugify } = require("./lib/report-builder.cjs");
const { buildReportMd } = require("./lib/markdown-builder.cjs");
const { formatInteger, formatDecimal } = require("./lib/formatters.cjs");
const { MINERIA, NOA_INFO } = require("./lib/contexto-nacional.cjs");
const { interpretarSerie, resumenTendencia } = require("./lib/tendencias.cjs");

const ROOT = path.resolve(__dirname, "..");
const DATASETS = path.resolve("C:/Users/dante/Desktop/Laboratorio Colossus/Pipeline OpenArg/datos_abiertos/datasets/mineria");

const FILE_PROYECTOS = path.join(
  DATASETS,
  "mineria-cartera-proyectos-mineros-argentina-siacam",
  "proyectos-mineros-metalíferos-y-de-litio-en-argentina.xlsx"
);
const FILE_EMPLEO_LITIO = path.join(
  DATASETS,
  "mineria-empleos-generados-proyectos-litio-siacam",
  "empleos-generados-en-proyectos-de-litio,-por-provincia-y-género.csv"
);
const FILE_EXPO_LITIO = path.join(
  DATASETS,
  "mineria-exportaciones-argentinas-litio-siacam",
  "exportaciones-argentinas-de-litio.csv"
);

const OUT_JSON = path.join(ROOT, "public", "data", "mineria", "litio.json");
const OUT_MD = path.join(ROOT, "public", "reports", "mineria", "litio.md");

const SOURCE = "SIACAM — Sistema de Información Abierta a la Comunidad sobre Actividad Minera · Secretaría de Minería";

function readCsv(file) {
  const text = fs.readFileSync(file, "utf8").replace(/^﻿/, "");
  return Papa.parse(text, { header: true, skipEmptyLines: true }).data;
}

function main() {
  // ─── 1. Proyectos de litio + metalíferos ───
  let proyectosJujuy = [];
  let proyectosTotal = 0;
  let proyectosLitioNac = 0;
  let proyectosLitioJujuy = 0;
  let porEstado = {};
  let porMineral = {};

  if (fs.existsSync(FILE_PROYECTOS)) {
    const wb = XLSX.readFile(FILE_PROYECTOS);
    const ws = wb.Sheets[wb.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json(ws, { header: 1 });
    const hdr = rows[0];
    const idxProv = hdr.indexOf("PROVINCIA");
    const idxEstado = hdr.indexOf("ESTADO");
    const idxMineral = hdr.indexOf("MINERAL PRINCIPAL");
    const idxNombre = hdr.indexOf("NOMBRE");

    for (let i = 1; i < rows.length; i++) {
      const r = rows[i];
      if (!r || !r[idxProv]) continue;
      proyectosTotal++;
      const mineral = String(r[idxMineral] || "").trim();
      if (/litio/i.test(mineral)) proyectosLitioNac++;
      if (/jujuy/i.test(String(r[idxProv]))) {
        proyectosJujuy.push({
          nombre: String(r[idxNombre] || "").trim(),
          mineral,
          estado: String(r[idxEstado] || "").trim(),
        });
        if (/litio/i.test(mineral)) proyectosLitioJujuy++;
        porEstado[r[idxEstado]] = (porEstado[r[idxEstado]] || 0) + 1;
        porMineral[mineral] = (porMineral[mineral] || 0) + 1;
      }
    }
  }

  // ─── 2. Empleo en proyectos de litio (mensual por provincia/género) ───
  let empleoJujuyRows = [];
  let latestEmpleo = null;
  if (fs.existsSync(FILE_EMPLEO_LITIO)) {
    const all = readCsv(FILE_EMPLEO_LITIO);
    empleoJujuyRows = all
      .filter(r => /jujuy/i.test(String(r.provincia_zona || "")))
      .map(r => ({
        fecha: String(r.año_mes || "").trim(),
        genero: String(r.genero || "").trim(),
        rubro: String(r.rubro || "").trim(),
        cantidad: parseInt(r.Cantidad, 10) || 0,
      }))
      .filter(r => /^\d{4}-\d{2}-\d{2}$/.test(r.fecha));
    if (empleoJujuyRows.length) {
      empleoJujuyRows.sort((a, b) => a.fecha.localeCompare(b.fecha));
      latestEmpleo = empleoJujuyRows[empleoJujuyRows.length - 1].fecha;
    }
  }

  // ─── 3. Exportaciones nacionales de litio (Argentina) ───
  let expoRows = [];
  if (fs.existsSync(FILE_EXPO_LITIO)) {
    expoRows = readCsv(FILE_EXPO_LITIO).map(r => ({
      anio: parseInt(r["Año"], 10),
      fob: parseFloat(r["Exportaciones_FOB"]) || 0,
      participacion: parseFloat(r["Participación_sobre_total_exportado"]) || 0,
    })).filter(r => Number.isFinite(r.anio));
    expoRows.sort((a, b) => a.anio - b.anio);
  }

  // Totales empleo Jujuy último mes
  const empleoLatest = latestEmpleo
    ? empleoJujuyRows.filter(r => r.fecha === latestEmpleo).reduce((s, r) => s + r.cantidad, 0)
    : 0;
  const empleoFemLatest = latestEmpleo
    ? empleoJujuyRows.filter(r => r.fecha === latestEmpleo && /femenino/i.test(r.genero)).reduce((s, r) => s + r.cantidad, 0)
    : 0;
  const pctMujeres = empleoLatest ? (empleoFemLatest / empleoLatest) * 100 : 0;

  const latestExpo = expoRows[expoRows.length - 1];
  const expoLatestFOB = latestExpo ? latestExpo.fob : 0;
  const pctExpo = latestExpo ? latestExpo.participacion * 100 : 0;

  const builder = new ReportBuilder("mineria-litio")
    .setMeta({
      title: "Minería y Litio",
      category: "Minería",
      subcategory: "Litio · SIACAM",
      source: SOURCE,
      date: latestEmpleo || (latestExpo ? String(latestExpo.anio) : "—"),
    })
    .addKPI({
      id: "proyectos-jujuy",
      label: "Proyectos mineros en Jujuy",
      value: proyectosJujuy.length,
      formatted: formatInteger(proyectosJujuy.length),
      unit: "proyectos",
      comparison: `${proyectosLitioJujuy} de litio`,
    })
    .addKPI({
      id: "share-proyectos-litio",
      label: "Litio Jujuy / Litio nacional",
      value: proyectosLitioNac ? (proyectosLitioJujuy / proyectosLitioNac) * 100 : 0,
      formatted: proyectosLitioNac ? `${formatDecimal((proyectosLitioJujuy / proyectosLitioNac) * 100, 1)}%` : "—",
      comparison: `${proyectosLitioNac} proyectos de litio en el país`,
    });

  if (latestEmpleo) {
    builder.addKPI({
      id: "empleo-litio-jujuy",
      label: `Empleos litio Jujuy (${latestEmpleo.slice(0, 7)})`,
      value: empleoLatest,
      formatted: formatInteger(empleoLatest),
      unit: "trabajadores",
    });
    builder.addKPI({
      id: "mujeres-pct",
      label: "Mujeres en el empleo del litio",
      value: pctMujeres,
      formatted: `${formatDecimal(pctMujeres, 1)}%`,
      status: pctMujeres < 20 ? "warning" : "good",
    });
  }

  if (latestExpo) {
    builder.addKPI({
      id: "expo-litio",
      label: `Exportaciones argentinas de litio (${latestExpo.anio})`,
      value: expoLatestFOB,
      formatted: `US$ ${formatDecimal(expoLatestFOB, 1)}M FOB`,
    });
    builder.addKPI({
      id: "share-expo",
      label: "Participación del litio en exportaciones nacionales",
      value: pctExpo,
      formatted: `${formatDecimal(pctExpo, 2)}%`,
    });
  }

  // ─── CHART 1: Proyectos por estado (Jujuy) ───
  if (Object.keys(porEstado).length) {
    const sectionEstado = "Cartera de Proyectos en Jujuy";
    const sidEstado = slugify(sectionEstado);
    const estadoData = Object.entries(porEstado).map(([id, value]) => ({ id, label: id || "—", value }));
    builder.addChart({
      id: "pie-proyectos-estado",
      type: "pie",
      title: "Proyectos mineros en Jujuy por estado",
      sectionId: sidEstado,
      sectionTitle: sectionEstado,
      data: estadoData,
    });

    const mineralData = Object.entries(porMineral).map(([mineral, Proyectos]) => ({ mineral, Proyectos }))
      .sort((a, b) => b.Proyectos - a.Proyectos);
    builder.addChart({
      id: "bar-proyectos-mineral",
      type: "bar",
      title: "Proyectos mineros en Jujuy por mineral principal",
      sectionId: sidEstado,
      sectionTitle: sectionEstado,
      data: mineralData,
      config: { xAxis: "mineral", yAxis: "Proyectos" },
    });
  }

  // ─── CHART 2: Empleo litio Jujuy serie ───
  if (empleoJujuyRows.length) {
    const sectionEmpleo = "Empleo en Proyectos de Litio";
    const sidEmpleo = slugify(sectionEmpleo);

    // Serie temporal: suma por fecha
    const byFecha = new Map();
    for (const r of empleoJujuyRows) {
      byFecha.set(r.fecha, (byFecha.get(r.fecha) || 0) + r.cantidad);
    }
    const serieEmpleo = [...byFecha.entries()]
      .map(([fecha, Empleos]) => ({ fecha: fecha.slice(0, 7), Empleos }))
      .sort((a, b) => a.fecha.localeCompare(b.fecha));
    builder.addChart({
      id: "line-empleo-litio",
      type: "line",
      title: "Empleo en proyectos de litio — Jujuy (mensual)",
      sectionId: sidEmpleo,
      sectionTitle: sectionEmpleo,
      data: serieEmpleo,
      config: { xAxis: "fecha", yAxis: "Empleos" },
    });

    // Composición por género (último mes)
    const lastGenero = empleoJujuyRows.filter(r => r.fecha === latestEmpleo);
    const generoMap = new Map();
    for (const r of lastGenero) generoMap.set(r.genero, (generoMap.get(r.genero) || 0) + r.cantidad);
    builder.addChart({
      id: "pie-empleo-genero",
      type: "pie",
      title: `Empleo del litio por género — Jujuy ${latestEmpleo.slice(0, 7)}`,
      sectionId: sidEmpleo,
      sectionTitle: sectionEmpleo,
      data: [...generoMap.entries()].map(([id, value]) => ({ id, label: id, value })),
    });
  }

  // ─── CHART 3: Exportaciones nacionales litio ───
  if (expoRows.length) {
    const sectionExpo = "Exportaciones Nacionales de Litio (contexto Argentina)";
    const sidExpo = slugify(sectionExpo);
    builder.addChart({
      id: "line-expo-litio",
      type: "line",
      title: "Exportaciones argentinas de litio (FOB · US$ millones)",
      sectionId: sidExpo,
      sectionTitle: sectionExpo,
      data: expoRows.map(r => ({ anio: String(r.anio), "FOB US$ M": Math.round(r.fob * 10) / 10 })),
      config: { xAxis: "anio", yAxis: "FOB US$ M" },
    });
  }

  // Listing de proyectos
  if (proyectosJujuy.length) {
    builder.addRanking({
      id: "proyectos-listado",
      title: "Proyectos mineros activos en Jujuy",
      sectionId: slugify("Cartera de Proyectos en Jujuy"),
      items: proyectosJujuy
        .map((p, idx) => ({ name: `${p.nombre} — ${p.mineral} — ${p.estado}`, value: idx + 1 })),
      order: "asc",
    });
  }

  const data = builder.build();

  // ─── Datos derivados para narrativa ejecutiva ───
  const shareLitioJujuy = proyectosLitioNac ? (proyectosLitioJujuy / proyectosLitioNac) * 100 : 0;
  // Proyectos por estado: top
  const proyEstadoOrden = Object.entries(porEstado).sort((a, b) => b[1] - a[1]);
  const estadoTop = proyEstadoOrden[0] ? proyEstadoOrden[0][0] : "—";
  const estadoTopCant = proyEstadoOrden[0] ? proyEstadoOrden[0][1] : 0;
  // Composición empleo por género absoluto
  const empleoMascLatest = latestEmpleo
    ? empleoJujuyRows.filter(r => r.fecha === latestEmpleo && /masculino/i.test(r.genero)).reduce((s, r) => s + r.cantidad, 0)
    : 0;
  // Serie empleo para tendencias
  const serieEmpleoLitio = [];
  if (empleoJujuyRows.length) {
    const byFecha = new Map();
    for (const r of empleoJujuyRows) {
      byFecha.set(r.fecha, (byFecha.get(r.fecha) || 0) + r.cantidad);
    }
    // Anual
    const byYearLit = new Map();
    for (const [fecha, val] of byFecha.entries()) {
      const y = parseInt(fecha.slice(0, 4), 10);
      const slot = byYearLit.get(y) || { sum: 0, count: 0 };
      slot.sum += val; slot.count++;
      byYearLit.set(y, slot);
    }
    for (const [y, s] of byYearLit.entries()) {
      serieEmpleoLitio.push({ anio: y, valor: Math.round(s.sum / s.count) });
    }
    serieEmpleoLitio.sort((a, b) => a.anio - b.anio);
  }
  const interpEmpleoLitio = serieEmpleoLitio.length >= 3
    ? interpretarSerie(serieEmpleoLitio, { umbralVariacion: 25, magnitudLabel: "empleos del litio" })
    : "La serie de empleo del litio es aún corta para identificar tendencias robustas.";
  // Empleo primer vs último año
  const empleoPrimero = serieEmpleoLitio.length ? serieEmpleoLitio[0].valor : 0;
  const empleoUltimoAnual = serieEmpleoLitio.length ? serieEmpleoLitio[serieEmpleoLitio.length - 1].valor : 0;
  const varEmpleoLitio = empleoPrimero ? ((empleoUltimoAnual - empleoPrimero) / empleoPrimero) * 100 : 0;

  // Exportaciones: serie para interpretación
  const serieExpoNum = expoRows.map(r => ({ anio: r.anio, valor: r.fob }));
  const interpExpo = serieExpoNum.length >= 3
    ? interpretarSerie(serieExpoNum, { umbralVariacion: 30, magnitudLabel: "US$ FOB exportados" })
    : "La serie de exportaciones es aún corta para identificar tendencias robustas.";
  const expoMax = expoRows.length ? expoRows.reduce((a, b) => (a.fob > b.fob ? a : b)) : null;
  const distAlMaxExpo = expoMax && latestExpo && expoMax.fob
    ? ((latestExpo.fob - expoMax.fob) / expoMax.fob) * 100
    : 0;

  // Share Jujuy proyectos de litio según constante de referencia
  const shareJujuyTrianguloRef = MINERIA.share_provincias_litio.Jujuy;
  const shareSaltaRef = MINERIA.share_provincias_litio.Salta;
  const shareCatamarcaRef = MINERIA.share_provincias_litio.Catamarca;

  const sidEstado = slugify("Cartera de Proyectos en Jujuy");
  const sidEmpleo = slugify("Empleo en Proyectos de Litio");
  const sidExpo = slugify("Exportaciones Nacionales de Litio (contexto Argentina)");

  const md = buildReportMd({
    ...data,

    intro: `Jujuy es uno de los protagonistas del **triángulo del litio sudamericano** (Jujuy-Salta-Catamarca en Argentina, sumado a Bolivia y Chile). La provincia concentra **${formatInteger(proyectosJujuy.length)} proyectos mineros activos**, de los cuales **${formatInteger(proyectosLitioJujuy)} son de litio** — el **${formatDecimal(shareLitioJujuy, 1)}%** de los ~${formatInteger(proyectosLitioNac)} proyectos de litio activos en el país${latestEmpleo ? `. El sector emplea **${formatInteger(empleoLatest)} trabajadores** en Jujuy según el último registro mensual disponible (${latestEmpleo.slice(0, 7)}), con **${formatDecimal(pctMujeres, 1)}%** de participación femenina` : ""}.${latestExpo ? ` En **${latestExpo.anio}**, las exportaciones nacionales de litio alcanzaron **US$ ${formatDecimal(expoLatestFOB, 1)} millones FOB** (${formatDecimal(pctExpo, 2)}% del total exportado argentino).` : ""}`,

    executiveSummary: `Jujuy es uno de los tres vértices argentinos del triángulo del litio sudamericano, junto con Salta y Catamarca — un área que concentra una de las mayores reservas mundiales del mineral, recurso estratégico para la transición energética global. La provincia exhibe una cartera de **${formatInteger(proyectosJujuy.length)} proyectos mineros activos** registrados en SIACAM, con **${formatInteger(proyectosLitioJujuy)} específicos de litio** (**${formatDecimal(shareLitioJujuy, 1)}%** de los ~${formatInteger(proyectosLitioNac)} proyectos de litio del país). El estado predominante en la cartera es **${estadoTop}** (${formatInteger(estadoTopCant)} proyectos), una distribución que refleja la fase del ciclo en la que se encuentra el cluster minero provincial.

La participación de Jujuy en el triángulo del litio nacional, según referencia agregada, se ubica en torno al **${formatInteger(shareJujuyTrianguloRef)}%** de la cartera de proyectos, contra **${formatInteger(shareSaltaRef)}%** de Salta y **${formatInteger(shareCatamarcaRef)}%** de Catamarca. Esta distribución triádica configura un escenario donde las tres provincias compiten y, simultáneamente, comparten dinámicas geológicas (salares de altura), institucionales (marco regulatorio nacional, política federal de regalías) y de mercado (compradores asiáticos, principalmente China, Corea del Sur y Japón).

${latestEmpleo ? `El empleo asociado al litio en Jujuy alcanzaba **${formatInteger(empleoLatest)} trabajadores** en ${latestEmpleo.slice(0, 7)}, con **${formatDecimal(pctMujeres, 1)}%** de mujeres (${formatInteger(empleoMascLatest)} varones y ${formatInteger(empleoFemLatest)} mujeres). La serie disponible muestra ${interpEmpleoLitio.toLowerCase()} ${serieEmpleoLitio.length > 1 ? `Desde el inicio del registro, el empleo ${varEmpleoLitio >= 0 ? "creció" : "se contrajo"} un **${formatDecimal(Math.abs(varEmpleoLitio), 1)}%**.` : ""}` : ""}

${latestExpo ? `En el plano de las exportaciones, el litio argentino totalizó **US$ ${formatDecimal(expoLatestFOB, 1)} millones FOB** en ${latestExpo.anio}, equivalente al **${formatDecimal(pctExpo, 2)}%** del total exportado por el país. ${expoMax && expoMax.anio !== latestExpo.anio ? `El máximo histórico se alcanzó en **${expoMax.anio}** con **US$ ${formatDecimal(expoMax.fob, 1)} millones FOB**, lo que ubica al último registro a **${formatDecimal(distAlMaxExpo, 1)}%** del pico.` : ""} Estas cifras son nacionales (Jujuy participa a través de los proyectos en producción), y reflejan tanto la dinámica de los volúmenes embarcados como la fuerte volatilidad del precio internacional del carbonato y del hidróxido de litio, ambos en correlación con la demanda de baterías para vehículos eléctricos.` : ""}`,

    keyFindings: [
      `**Cartera de litio:** Jujuy concentra **${formatInteger(proyectosLitioJujuy)} de los ~${formatInteger(proyectosLitioNac)} proyectos de litio** activos en el país (**${formatDecimal(shareLitioJujuy, 1)}%** del total nacional).`,
      `**Diversidad de estados:** los **${formatInteger(proyectosJujuy.length)} proyectos activos** en la provincia se distribuyen en distintas fases del ciclo minero (exploración, factibilidad, construcción, producción), con predominio de "${estadoTop}" (${formatInteger(estadoTopCant)} proyectos).`,
      latestEmpleo ? `**Empleo del litio:** **${formatInteger(empleoLatest)} trabajadores** en ${latestEmpleo.slice(0, 7)}, con **${formatDecimal(pctMujeres, 1)}%** de participación femenina — brecha de género consistente con el patrón histórico del sector minero.` : ``,
      serieEmpleoLitio.length > 1 ? `**Trayectoria del empleo:** desde el inicio del registro mensual, el empleo en litio de Jujuy ${varEmpleoLitio >= 0 ? "creció" : "se contrajo"} un **${formatDecimal(Math.abs(varEmpleoLitio), 1)}%**, asociado a las fases de construcción y puesta en producción de los proyectos.` : ``,
      latestExpo ? `**Exportaciones nacionales de litio:** US$ **${formatDecimal(expoLatestFOB, 1)} millones FOB** en ${latestExpo.anio} (**${formatDecimal(pctExpo, 2)}%** del total exportado del país)${expoMax && expoMax.anio !== latestExpo.anio ? ` — **${formatDecimal(distAlMaxExpo, 1)}%** respecto al máximo histórico de ${expoMax.anio}` : ""}.` : ``,
      `**Posicionamiento en el triángulo del litio:** Jujuy participa con aproximadamente el **${formatInteger(shareJujuyTrianguloRef)}%** del total argentino, en una tríada con Salta (~${formatInteger(shareSaltaRef)}%) y Catamarca (~${formatInteger(shareCatamarcaRef)}%) que define la geografía interna del recurso a nivel nacional.`,
    ].filter(Boolean),

    keyDatum: `**Dato destacado:** Jujuy concentra el **${formatDecimal(shareLitioJujuy, 1)}%** de los proyectos de litio activos en Argentina (${formatInteger(proyectosLitioJujuy)} de ~${formatInteger(proyectosLitioNac)}) — convirtiéndose en uno de los tres territorios decisivos para la inserción del país en la cadena global del mineral estratégico de la transición energética.`,

    sectionNarratives: {
      [sidEstado]: `La cartera minera de Jujuy registra **${formatInteger(proyectosJujuy.length)} proyectos activos** en SIACAM, distribuidos en distintos estados del ciclo de vida minero. El estado predominante en la cartera provincial es **${estadoTop}** (${formatInteger(estadoTopCant)} proyectos), un dato relevante porque cada estado tiene implicancias distintas: los proyectos en exploración generan empleo limitado y baja recaudación pero pueden definir la pipeline de mediano plazo; los proyectos en factibilidad o construcción son los más intensivos en capital y empleo; los proyectos en producción generan flujos de exportación, regalías y empleo más estable pero menor en magnitud.

El **${formatDecimal(shareLitioJujuy, 1)}%** de los proyectos de litio del país concentrados en Jujuy posiciona a la provincia como uno de los tres territorios decisivos para la inserción argentina en la cadena global del mineral. La cartera incluye también proyectos de otros metales (plomo, plata, zinc, oro), continuidad de la tradición minera tradicional jujeña anterior al boom del litio. La diversificación es relevante porque mitiga la exposición al ciclo de precios del litio — fenómeno notoriamente volátil — al combinar minerales con dinámicas de mercado distintas.

La gobernanza de esta cartera involucra una arquitectura institucional compleja: el marco regulatorio nacional (Código de Minería, Ley de Inversiones Mineras), la autoridad provincial (Secretaría de Minería de Jujuy, regalías), las comunidades indígenas en territorios productivos (consulta libre, previa e informada según Convenio 169 OIT), y el sistema judicial provincial y federal. Cada decisión de inversión navega ese ecosistema multinivel, lo que explica los tiempos prolongados entre descubrimiento, factibilidad y puesta en producción.`,

      [sidEmpleo]: `El empleo asociado a los proyectos de litio en Jujuy alcanzaba **${formatInteger(empleoLatest)} trabajadores** en el último registro mensual disponible (${latestEmpleo ? latestEmpleo.slice(0, 7) : "—"}), con una composición de **${formatInteger(empleoMascLatest)} varones** y **${formatInteger(empleoFemLatest)} mujeres** — la participación femenina del **${formatDecimal(pctMujeres, 1)}%** refleja la brecha de género estructural del sector minero, asociada a barreras históricas de acceso (formación técnica, condiciones laborales, residencia en sitios remotos) y a esquemas de turnos rotativos en altitud que dificultan la conciliación con tareas de cuidado.

${interpEmpleoLitio} ${serieEmpleoLitio.length > 1 ? `Desde el inicio del registro disponible, el empleo del litio en Jujuy ${varEmpleoLitio >= 0 ? "se expandió" : "se contrajo"} un **${formatDecimal(Math.abs(varEmpleoLitio), 1)}%**, dinámica que refleja simultáneamente la puesta en producción de proyectos en avanzado estado de construcción y los ciclos cortos de empleo intensivo asociados a las fases constructivas (que finalizan al completarse las plantas industriales).` : ""}

La estructura del empleo del litio combina una pequeña planta permanente altamente calificada (ingenieros de proceso, geólogos, técnicos en mantenimiento) con un universo más amplio de empleo contratista, particularmente durante las fases de construcción de salar y planta. Esta dualidad explica buena parte de la volatilidad observada en la serie: picos de empleo durante las construcciones, mesetas más bajas pero estables durante la producción. El indicador permite seguir el pulso del ciclo de inversiones en un sector cuya importancia económica crece a medida que el mercado global de baterías para movilidad eléctrica se expande.`,

      [sidExpo]: `Las exportaciones argentinas de litio totalizaron **US$ ${formatDecimal(expoLatestFOB, 1)} millones FOB** en ${latestExpo ? latestExpo.anio : "—"}, equivalente al **${formatDecimal(pctExpo, 2)}%** del total exportado por el país. ${interpExpo} ${expoMax && expoMax.anio !== latestExpo?.anio ? `El máximo histórico se registró en **${expoMax.anio}** con **US$ ${formatDecimal(expoMax.fob, 1)} millones FOB**; el nivel del último año disponible se ubica a **${formatDecimal(distAlMaxExpo, 1)}%** del pico, evidencia del impacto del ciclo de precios internacionales del carbonato y del hidróxido de litio sobre el valor exportado.` : ""}

El valor FOB exportado depende simultáneamente de dos variables: volumen físico (toneladas embarcadas, vinculado a la capacidad instalada y al ramp-up de cada planta) y precio internacional (definido en mercados spot y contratos de largo plazo con grandes compradores asiáticos). La caída de precios desde el pico de 2022-2023 — cuando el carbonato de litio superó los US$ 70.000/tonelada — hacia niveles más moderados refleja una corrección del ciclo de superpicos asociados a la salida de la pandemia y la aceleración de la electromovilidad.

Estas cifras son agregadas nacionales: Jujuy participa a través de los proyectos en producción operando en la provincia, pero la base SIACAM no desagrega exportaciones por jurisdicción de origen del mineral. Para estimar la contribución específica de Jujuy se requeriría cruzar datos de capacidad instalada por proyecto, precios de exportación y participación de cada salar en el total embarcado — análisis que excede el alcance de este informe pero que constituye una agenda relevante para el monitoreo del sector.`,
    },

    nationalContext: `Argentina es uno de los tres países del triángulo del litio sudamericano (junto con Bolivia y Chile), que concentra aproximadamente el 56% de las reservas mundiales identificadas del mineral. Dentro de la geografía argentina del litio, la cartera nacional incluye **~${formatInteger(MINERIA.proyectos_litio_nacional_aprox)} proyectos activos** distribuidos entre tres provincias: **Jujuy (~${formatInteger(shareJujuyTrianguloRef)}%)**, **Salta (~${formatInteger(shareSaltaRef)}%)** y **Catamarca (~${formatInteger(shareCatamarcaRef)}%)**. Esta tríada provincial define la totalidad de la actividad litífera del país y configura un sistema federal de competencia y complementariedad regulatoria.

${interpExpo} Las exportaciones de litio representaron aproximadamente **${formatDecimal(MINERIA.participacion_litio_expo_totales_2023_pct, 2)}%** del total exportado argentino en 2023, una participación todavía modesta pero con potencial de crecimiento significativo a medida que los proyectos en construcción entran en operación. La proyección de mediano plazo, sujeta a la evolución del precio internacional, ubica al litio entre los tres principales productos exportadores del complejo minero-energético argentino junto con el cobre (futuro, vía proyectos en cartera) y los hidrocarburos no convencionales (Vaca Muerta).

El régimen de gobernanza del litio en Argentina combina jurisdicción provincial sobre el recurso (Constitución Nacional, Art. 124) con marco regulatorio nacional (Código de Minería, Ley de Inversiones Mineras N° 24.196) y, crucialmente, con la presencia de comunidades indígenas en territorios productivos cuyos derechos están reconocidos por el Convenio 169 de la OIT y la Constitución Nacional. Esta arquitectura genera tensiones regulares entre la velocidad de los proyectos y los tiempos de la consulta libre, previa e informada — particularmente activas en Jujuy, donde varios proyectos operan en territorios de comunidades atacamas, kollas y omaguacas.`,

    policyImplications: `El perfil del sector litio en Jujuy plantea tensiones estructurales que el modelo de desarrollo provincial debe procesar simultáneamente. La primera es la tensión entre la magnitud del recurso (uno de los tres territorios decisivos para la inserción argentina en la cadena global del mineral estratégico de la transición energética) y la escala todavía acotada de su contribución al empleo y a la economía provincial (**${formatInteger(empleoLatest)} empleos directos** en el último registro disponible, una cifra relevante pero pequeña frente al stock total de empleo asalariado privado provincial). Esto refleja el carácter capital-intensivo y no mano-de-obra intensivo del sector, particularmente en su fase de producción.

La segunda tensión es entre los compromisos globales y las dinámicas locales. La transición energética global impulsa la demanda de litio y por tanto la valorización del recurso jujeño, pero su explotación se realiza en territorios de comunidades indígenas con derechos reconocidos (Convenio 169 OIT, Art. 75 inc. 17 CN) y en ecosistemas frágiles de salares de altura donde el agua es el insumo crítico, escaso y disputado. La gobernanza del recurso debe procesar simultáneamente la oportunidad económica nacional, los derechos comunitarios y la sostenibilidad ambiental — una ecuación de difícil resolución donde cada decisión técnica (volumen de extracción, modalidad — evaporítica tradicional vs DLE—, gestión de pasivos) tiene implicancias políticas significativas.

La tercera tensión es entre el régimen federal vigente (regalías provinciales acotadas, exenciones impositivas del régimen minero) y las demandas crecientes de mayor captura local de la renta. El debate sobre el "valor agregado del litio" (avanzar de carbonato e hidróxido hacia precursores catódicos, cátodos y baterías completas) requiere infraestructura, capital humano calificado y energía competitiva que las provincias del NOA no necesariamente poseen, lo que probablemente desplace los eslabones industriales hacia regiones con mayor base productiva preexistente. La política pública debe procesar la tensión entre maximizar la captura provincial del valor versus asegurar la viabilidad del proyecto en escala industrial.

Quedan fuera del registro SIACAM dimensiones particularmente sensibles para el seguimiento integral del sector: la huella hídrica desagregada por proyecto y salar, los pasivos ambientales acumulados, la composición específica de la mano de obra calificada (de qué provincias proviene, cuánto se queda en Jujuy), los efectos económicos indirectos (cadenas de proveedores locales, alojamiento, servicios) y los flujos de regalías efectivamente recibidos por la provincia. Esta información, dispersa o reservada, es central para una evaluación pública robusta del impacto real del litio en el desarrollo jujeño.`,
  });

  fs.mkdirSync(path.dirname(OUT_JSON), { recursive: true });
  fs.mkdirSync(path.dirname(OUT_MD), { recursive: true });
  fs.writeFileSync(OUT_JSON, JSON.stringify(data, null, 2));
  fs.writeFileSync(OUT_MD, md);
  console.log(`  ✅ mineria/litio.json (${data.kpis.length} KPIs, ${data.charts.length} charts, ${data.rankings.length} rankings)`);
}

main();
