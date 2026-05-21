/**
 * process-ssj-seguridad.cjs
 *
 * Genera public/data/ssj/seguridad.json + public/reports/ssj/seguridad.md
 * a partir del panel departamental SNIC, filtrado al Departamento Dr. Manuel
 * Belgrano (código INDEC "38021") que contiene a San Salvador de Jujuy.
 *
 * Reusa la misma fuente que `process-seguridad.cjs` provincial.
 */

const fs = require("fs");
const path = require("path");
const Papa = require("papaparse");

const { ReportBuilder, slugify } = require("./lib/report-builder.cjs");
const { buildReportMd } = require("./lib/markdown-builder.cjs");
const { DEPARTAMENTOS_JUJUY } = require("./lib/geo-departamentos-jujuy.cjs");
const { BELGRANO, BELGRANO_CODIGO } = require("./lib/ssj-utils.cjs");
const {
  toNumber, formatInteger, formatDecimal, formatCompact,
} = require("./lib/formatters.cjs");
const { interpretarSerie } = require("./lib/tendencias.cjs");

const ROOT = path.resolve(__dirname, "..");
const DATASETS_DIR = path.resolve("C:/Users/dante/Desktop/Laboratorio Colossus/Pipeline OpenArg/datos_abiertos/datasets/seguridad");
const FILE_DEPT = path.join(
  DATASETS_DIR,
  "seguridad-snic-departamental-estadisticas-criminales-republica-argentina-por-departamentos",
  "estadísticas-criminales-en-la-república-argentina-por-departamentos-(panel)-(.csv).csv"
);

const OUT_JSON = path.join(ROOT, "public", "data", "ssj", "seguridad.json");
const OUT_MD = path.join(ROOT, "public", "reports", "ssj", "seguridad.md");

const SOURCE = "SNIC — Sistema Nacional de Información Criminal (Ministerio de Seguridad de la Nación)";

function readCsv(file, delimiter) {
  const text = fs.readFileSync(file, "utf8").replace(/^﻿/, "");
  return Papa.parse(text, { header: true, skipEmptyLines: true, delimiter }).data;
}

function main() {
  if (!fs.existsSync(FILE_DEPT)) {
    console.error("❌ SNIC departamental no encontrado. Skip seguridad SSJ.");
    return;
  }

  const deptRows = readCsv(FILE_DEPT, ";")
    .map(r => ({
      ...r,
      anio: parseInt(r.anio, 10),
      cantidad_hechos: parseInt(r.cantidad_hechos, 10) || 0,
      tasa_hechos: parseFloat(r.tasa_hechos) || 0,
    }))
    .filter(r => Number.isFinite(r.anio));

  const deptJujuy = deptRows.filter(r => /^Jujuy$/i.test(String(r.provincia_nombre || "").trim()));
  const deptBelg = deptJujuy.filter(r => String(r.departamento_id).trim() === BELGRANO_CODIGO);

  if (deptBelg.length === 0) {
    console.error("❌ Sin filas para Belgrano (38021) en SNIC departamental. Skip.");
    return;
  }

  const years = [...new Set(deptBelg.map(r => r.anio))].sort((a, b) => a - b);
  const latest = years[years.length - 1];
  const prev = years[years.length - 2];

  const KEY = {
    homDol: "Homicidios dolosos",
    robos: "Robos (excluye los agravados por el resultado de lesiones y/o muertes)",
    robosAgr: "Robos agravados por el resultado de lesiones y/o muertes",
    hurtos: "Hurtos",
    lesiones: "Lesiones dolosas",
    muertesViales: "Muertes en accidentes viales",
    suicidios: "Suicidios (consumados)",
    abusosCarnal: "Abusos sexuales con acceso carnal (violaciones)",
    estafas: "Estafas y defraudaciones (no incluye virtuales) y usura",
    estafasVirt: "Estafas y defraudaciones asistidas virtualmente",
    estupef: "Ley 23.737 (estupefacientes)",
    amenazas: "Amenazas",
  };

  const sumBelg = (year, cat) => deptBelg
    .filter(r => r.anio === year && r.codigo_delito_snic_nombre === cat)
    .reduce((s, r) => s + r.cantidad_hechos, 0);

  const tasaBelg = (year, cat) => {
    const r = deptBelg.find(rr => rr.anio === year && rr.codigo_delito_snic_nombre === cat);
    return r ? r.tasa_hechos : 0;
  };

  const homDol = sumBelg(latest, KEY.homDol);
  const homDolPrev = sumBelg(prev, KEY.homDol);
  const robos = sumBelg(latest, KEY.robos) + sumBelg(latest, KEY.robosAgr);
  const hurtos = sumBelg(latest, KEY.hurtos);
  const lesiones = sumBelg(latest, KEY.lesiones);
  const muertesViales = sumBelg(latest, KEY.muertesViales);
  const suicidios = sumBelg(latest, KEY.suicidios);
  const totalHechos = deptBelg.filter(r => r.anio === latest).reduce((s, r) => s + r.cantidad_hechos, 0);
  const variacionHomDol = homDolPrev ? ((homDol - homDolPrev) / homDolPrev) * 100 : 0;
  const tasaHomicidios = tasaBelg(latest, KEY.homDol);

  // Total Jujuy provincial — para comparativo
  const totalJujuyHechos = deptJujuy.filter(r => r.anio === latest).reduce((s, r) => s + r.cantidad_hechos, 0);
  const pctBelgJujuy = totalJujuyHechos ? (totalHechos / totalJujuyHechos) * 100 : 0;
  const homJujuy = deptJujuy.filter(r => r.anio === latest && r.codigo_delito_snic_nombre === KEY.homDol)
    .reduce((s, r) => s + r.cantidad_hechos, 0);
  const pctHomBelgJujuy = homJujuy ? (homDol / homJujuy) * 100 : 0;

  const builder = new ReportBuilder("ssj-seguridad")
    .setMeta({
      title: "Seguridad y Estadísticas Criminales — San Salvador de Jujuy",
      category: "San Salvador de Jujuy",
      subcategory: "SNIC",
      source: SOURCE,
      date: String(latest),
    })
    .addKPI({ id: "homicidios", label: "Homicidios dolosos", value: homDol, formatted: formatInteger(homDol), unit: "casos", comparison: prev ? `${variacionHomDol >= 0 ? "+" : ""}${formatDecimal(variacionHomDol, 1)}% vs ${prev}` : undefined })
    .addKPI({ id: "tasa-hom", label: "Tasa homicidios", value: tasaHomicidios, formatted: formatDecimal(tasaHomicidios, 2), unit: "/100K hab." })
    .addKPI({ id: "robos", label: "Robos (totales)", value: robos, formatted: formatCompact(robos), unit: "casos", comparison: "incluye agravados" })
    .addKPI({ id: "hurtos", label: "Hurtos", value: hurtos, formatted: formatCompact(hurtos), unit: "casos" })
    .addKPI({ id: "lesiones", label: "Lesiones dolosas", value: lesiones, formatted: formatCompact(lesiones), unit: "casos" })
    .addKPI({ id: "muertes-viales", label: "Muertes viales", value: muertesViales, formatted: formatInteger(muertesViales), unit: "casos" })
    .addKPI({ id: "suicidios", label: "Suicidios", value: suicidios, formatted: formatInteger(suicidios), unit: "casos" })
    .addKPI({ id: "total", label: "Total hechos delictivos", value: totalHechos, formatted: formatCompact(totalHechos), comparison: `${formatDecimal(pctBelgJujuy, 1)}% del total provincial` });

  // Chart 1: Top categorías Belgrano
  const sectionTop = "Principales tipos de delito en Belgrano";
  const sidTop = slugify(sectionTop);
  const topCategorias = [
    { label: "Hurtos", v: hurtos },
    { label: "Robos", v: robos },
    { label: "Lesiones dolosas", v: lesiones },
    { label: "Amenazas", v: sumBelg(latest, KEY.amenazas) },
    { label: "Estupefacientes (Ley 23.737)", v: sumBelg(latest, KEY.estupef) },
    { label: "Estafas", v: sumBelg(latest, KEY.estafas) + sumBelg(latest, KEY.estafasVirt) },
    { label: "Abusos sexuales con acceso carnal", v: sumBelg(latest, KEY.abusosCarnal) },
    { label: "Muertes viales", v: muertesViales },
    { label: "Suicidios", v: suicidios },
    { label: "Homicidios dolosos", v: homDol },
  ].filter(d => d.v > 0).sort((a, b) => b.v - a.v);
  builder.addChart({
    id: "bar-top-delitos",
    type: "bar",
    title: `Principales tipos de delito — Dr. M. Belgrano, ${latest}`,
    sectionId: sidTop,
    sectionTitle: sectionTop,
    data: topCategorias.map(d => ({ delito: d.label, Hechos: d.v })),
    config: { xAxis: "delito", yAxis: "Hechos", layout: "horizontal" },
  });

  // Chart 2: Serie temporal Belgrano
  const sectionSerie = `Evolución 2014-${latest} en Belgrano`;
  const sidSerie = slugify(sectionSerie);
  const serieData = years.map(y => ({
    anio: String(y),
    "Homicidios dolosos": sumBelg(y, KEY.homDol),
    "Hurtos": sumBelg(y, KEY.hurtos),
    "Robos": sumBelg(y, KEY.robos) + sumBelg(y, KEY.robosAgr),
  }));
  builder.addChart({
    id: "line-serie-belgrano",
    type: "line",
    title: `Evolución temporal de delitos clave — Dr. M. Belgrano ${years[0]}-${latest}`,
    sectionId: sidSerie,
    sectionTitle: sectionSerie,
    data: serieData,
    config: { xAxis: "anio", yAxis: "Hechos" },
  });

  // Chart 3: Tasa homicidios histórica en Belgrano
  const sectionTasa = "Tasa de homicidios en Belgrano";
  const sidTasa = slugify(sectionTasa);
  builder.addChart({
    id: "line-tasa-belgrano",
    type: "line",
    title: `Tasa de homicidios dolosos cada 100.000 hab. — Dr. M. Belgrano`,
    sectionId: sidTasa,
    sectionTitle: sectionTasa,
    data: years.map(y => ({ anio: String(y), "Tasa /100K": tasaBelg(y, KEY.homDol) })),
    config: { xAxis: "anio", yAxis: "Tasa /100.000" },
  });

  // Chart 4: Comparativo Belgrano vs Total Jujuy (último año, hechos totales)
  const sectionComp = "Belgrano vs Provincia";
  const sidComp = slugify(sectionComp);
  const NOMBRE_BY_CODIGO = Object.fromEntries(DEPARTAMENTOS_JUJUY.map(d => [d.codigo, d.nombre]));
  const deptCurrent = deptJujuy.filter(r => r.anio === latest && NOMBRE_BY_CODIGO[String(r.departamento_id).trim()]);
  const byDept = new Map();
  for (const r of deptCurrent) {
    const codigo = String(r.departamento_id).trim();
    byDept.set(codigo, (byDept.get(codigo) || 0) + r.cantidad_hechos);
  }
  const dataDept = DEPARTAMENTOS_JUJUY.map(c => ({
    departamento: c.nombre,
    municipioId: c.codigo,
    hechos: byDept.get(c.codigo) || 0,
    esBelgrano: c.codigo === BELGRANO_CODIGO,
  }));
  builder.addChart({
    id: "bar-comparativo-deptos",
    type: "bar",
    title: `Hechos delictivos por departamento — ${latest} (Belgrano resaltado)`,
    sectionId: sidComp,
    sectionTitle: sectionComp,
    data: dataDept.map(d => ({ departamento: d.departamento, Hechos: d.hechos })),
    config: { xAxis: "departamento", yAxis: "Hechos" },
  });

  builder.addRanking({
    id: "rank-deptos",
    title: "Hechos delictivos por departamento",
    sectionId: sidComp,
    items: [...dataDept].sort((a, b) => b.hechos - a.hechos).map(d => ({
      name: d.departamento + (d.esBelgrano ? " ★" : ""),
      value: d.hechos,
      municipioId: d.municipioId,
    })),
    order: "desc",
  });

  // mapData
  for (const d of dataDept) {
    builder.addMapItem({
      municipioId: d.municipioId,
      municipioNombre: d.departamento,
      value: d.hechos,
      label: `${formatInteger(d.hechos)} hechos`,
    });
  }

  const data = builder.build();

  // ─── Narrativa ───
  const pobBelg = 320990;
  const totalPropiedad = hurtos + robos;
  const pctPropiedad = totalHechos ? (totalPropiedad / totalHechos) * 100 : 0;
  const ratioHom = homDol ? Math.round(pobBelg / homDol) : 0;
  const serieHom = years.map(y => ({ anio: y, valor: sumBelg(y, KEY.homDol) }));
  const interpHom = interpretarSerie(serieHom, { magnitudLabel: "homicidios" });

  const md = buildReportMd({
    ...data,
    intro: `En **${latest}**, el Departamento Dr. M. Belgrano registró **${formatInteger(homDol)} homicidios dolosos** (${variacionHomDol >= 0 ? "↑" : "↓"} ${formatDecimal(Math.abs(variacionHomDol), 1)}% vs ${prev}), **${formatInteger(robos)} robos** y **${formatInteger(hurtos)} hurtos**. La tasa de homicidios fue de **${formatDecimal(tasaHomicidios, 2)} cada 100.000 habitantes**. Belgrano concentra el **${formatDecimal(pctBelgJujuy, 1)}%** del total de hechos delictivos provinciales y el **${formatDecimal(pctHomBelgJujuy, 1)}%** de los homicidios dolosos.`,
    executiveSummary: `Belgrano es el principal núcleo de actividad delictiva registrada en Jujuy: concentra el **${formatDecimal(pctBelgJujuy, 1)}%** de los hechos provinciales en ${latest}, una proporción consistente con su peso poblacional (39,5%). La estructura es netamente patrimonial: los **${formatInteger(totalPropiedad)} hurtos y robos** representan el **${formatDecimal(pctPropiedad, 1)}%** del total registrado en el departamento. La tasa de homicidios (**${formatDecimal(tasaHomicidios, 2)} /100K**) implica aproximadamente un homicidio cada **${formatInteger(ratioHom)} habitantes** — relación baja en comparación con grandes capitales del país, pero levemente superior al promedio provincial. La concentración del delito en la capital refleja el peso urbano (mayor circulación, mayor exposición, mayor capilaridad del sistema de denuncia) y no implica necesariamente una tasa criminal más alta que en otros departamentos. ${interpHom}`,
    keyFindings: [
      `**Concentración del delito:** Belgrano absorbe el **${formatDecimal(pctBelgJujuy, 1)}%** de los hechos provinciales — proporción esperable dada su población (39,5% provincial).`,
      `**Predominio patrimonial:** **${formatDecimal(pctPropiedad, 1)}%** del registro local son hurtos y robos.`,
      `**Tasa de homicidios:** **${formatDecimal(tasaHomicidios, 2)} /100K** — una víctima cada **${formatInteger(ratioHom)}** habitantes.`,
      `**Variación interanual:** homicidios ${variacionHomDol >= 0 ? "aumentaron" : "se redujeron"} **${formatDecimal(Math.abs(variacionHomDol), 1)}%** vs ${prev}.`,
      `**Capitalidad de la denuncia:** Belgrano concentra fiscalías, dependencias policiales y oficinas judiciales — el registro está más completo que en departamentos rurales.`,
    ],
    keyDatum: `**Dato destacado:** Belgrano concentra **${formatDecimal(pctBelgJujuy, 1)}%** de los hechos delictivos registrados de Jujuy en ${latest} — una proporción esperable dado su peso poblacional, pero que define la capital como núcleo operativo del sistema de seguridad y justicia provincial.`,
    sectionNarratives: {
      [sidTop]: `La estructura del delito en Belgrano replica el patrón del NOA: fuerte predominio de las categorías patrimoniales (hurtos y robos) sobre las violentas. Los **${formatInteger(hurtos)} hurtos** y **${formatInteger(robos)} robos** dominan el registro; las categorías violentas tienen volúmenes acotados pero alta carga social. La concentración en Belgrano refleja, en parte, el efecto registrado: las denuncias se procesan en la capital donde están las fiscalías y dependencias.`,
      [sidSerie]: `La serie ${years[0]}-${latest} en Belgrano muestra la evolución típica de una capital provincial: ${interpHom} La pandemia de 2020 generó una caída transversal en delitos patrimoniales por la reducción de circulación urbana.`,
      [sidTasa]: `La tasa de homicidios en Belgrano se mantiene en un rango bajo dentro del contexto nacional. La estabilidad relativa sugiere que la violencia letal responde a dinámicas estructurales más que a ciclos económicos.`,
      [sidComp]: `Belgrano lidera ampliamente el ranking departamental de hechos delictivos. La proporción es consistente con su peso poblacional (39,5%); no implica necesariamente una tasa más alta que en otros departamentos. La concentración refleja la centralidad urbana y la mayor capilaridad institucional para la denuncia.`,
    },
    policyImplications: `El peso de Belgrano en el delito provincial demanda capacidades focalizadas en la capital: presencia policial visible en zonas comerciales, fortalecimiento del sistema de denuncia y articulación con políticas urbanas (iluminación, transporte, espacio público). El delito en la capital es predominantemente patrimonial, lo que demanda prevención situacional más que respuestas reactivas. Dentro de Belgrano, la dualidad centro / Alto Comedero exige miradas barriales que el dato departamental agregado no permite — un siguiente paso natural es la baja a radios censales y la articulación con datos municipales propios.`,
  });

  fs.mkdirSync(path.dirname(OUT_JSON), { recursive: true });
  fs.mkdirSync(path.dirname(OUT_MD), { recursive: true });
  fs.writeFileSync(OUT_JSON, JSON.stringify(data, null, 2));
  fs.writeFileSync(OUT_MD, md);
  console.log(`  ✅ ssj/seguridad.json (${data.kpis.length} KPIs, ${data.charts.length} charts, ${data.rankings.length} rankings, ${data.mapData.length} map items) — año ${latest}`);
}

main();
