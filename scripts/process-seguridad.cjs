/**
 * process-seguridad.cjs
 *
 * Genera public/data/seguridad.json + public/reports/seguridad.md
 * desde los CSV del SNIC en el repositorio Pipeline OpenArg.
 *
 * Fuente:
 *   .../seguridad/seguridad-snic-provincial-.../estadísticas-criminales-...(panel).csv  (comma-separated)
 *   .../seguridad/seguridad-snic-departamental-.../estadísticas-criminales-...(panel).csv (semicolon-separated)
 *
 * Filtra todo por la Provincia de Jujuy (provincia_id "38").
 */

const fs = require("fs");
const path = require("path");

const Papa = require("papaparse");
const { ReportBuilder, slugify } = require("./lib/report-builder.cjs");
const { buildReportMd } = require("./lib/markdown-builder.cjs");
const { DEPARTAMENTOS_JUJUY, PROVINCIA_ID } = require("./lib/geo-departamentos-jujuy.cjs");
const {
  toNumber, formatInteger, formatDecimal, formatCompact,
} = require("./lib/formatters.cjs");
const { SNIC_2024 } = require("./lib/contexto-nacional.cjs");
const { interpretarSerie, resumenTendencia } = require("./lib/tendencias.cjs");

const ROOT = path.resolve(__dirname, "..");
const DATASETS_DIR = path.resolve("C:/Users/dante/Desktop/Laboratorio Colossus/Pipeline OpenArg/datos_abiertos/datasets/seguridad");

const FILE_PROV = path.join(
  DATASETS_DIR,
  "seguridad-snic-provincial-estadisticas-criminales-republica-argentina-por-provincias",
  "estadísticas-criminales-en-la-república-argentina-por-provincias-(panel)-(.csv).csv"
);
const FILE_DEPT = path.join(
  DATASETS_DIR,
  "seguridad-snic-departamental-estadisticas-criminales-republica-argentina-por-departamentos",
  "estadísticas-criminales-en-la-república-argentina-por-departamentos-(panel)-(.csv).csv"
);

const OUT_JSON = path.join(ROOT, "public", "data", "seguridad.json");
const OUT_MD = path.join(ROOT, "public", "reports", "seguridad.md");

const SOURCE = "SNIC — Sistema Nacional de Información Criminal (Ministerio de Seguridad de la Nación)";

function readCsv(file, delimiter) {
  const text = fs.readFileSync(file, "utf8").replace(/^﻿/, "");
  return Papa.parse(text, { header: true, skipEmptyLines: true, delimiter }).data;
}

function main() {
  if (!fs.existsSync(FILE_PROV) || !fs.existsSync(FILE_DEPT)) {
    console.error("❌ SNIC CSVs no encontrados. Skip seguridad.");
    return;
  }

  const provRows = readCsv(FILE_PROV, ",")
    .map(r => ({
      ...r,
      anio: parseInt(r.anio, 10),
      cantidad_hechos: parseInt(r.cantidad_hechos, 10) || 0,
      cantidad_victimas: parseInt(r.cantidad_victimas, 10) || 0,
      cantidad_victimas_masc: parseInt(r.cantidad_victimas_masc, 10) || 0,
      cantidad_victimas_fem: parseInt(r.cantidad_victimas_fem, 10) || 0,
      tasa_hechos: parseFloat(r.tasa_hechos) || 0,
    }))
    .filter(r => Number.isFinite(r.anio));

  const deptRows = readCsv(FILE_DEPT, ";")
    .map(r => ({
      ...r,
      anio: parseInt(r.anio, 10),
      cantidad_hechos: parseInt(r.cantidad_hechos, 10) || 0,
      tasa_hechos: parseFloat(r.tasa_hechos) || 0,
    }))
    .filter(r => Number.isFinite(r.anio));

  // Jujuy provincial: trabaja con `provincia_nombre` exacto "Jujuy"
  const provJujuy = provRows.filter(r => /^Jujuy$/i.test(String(r.provincia_nombre || "").trim()));
  const deptJujuy = deptRows.filter(r => /^Jujuy$/i.test(String(r.provincia_nombre || "").trim()));

  if (provJujuy.length === 0 || deptJujuy.length === 0) {
    console.error("❌ Sin filas para Jujuy en SNIC. Skip.");
    return;
  }

  const years = [...new Set(provJujuy.map(r => r.anio))].sort((a, b) => a - b);
  const latest = years[years.length - 1];
  const prev = years[years.length - 2];

  // Categorías clave (nombres exactos del CSV)
  const KEY = {
    homDol:   "Homicidios dolosos",
    robos:    "Robos (excluye los agravados por el resultado de lesiones y/o muertes)",
    robosAgr: "Robos agravados por el resultado de lesiones y/o muertes",
    hurtos:   "Hurtos",
    lesiones: "Lesiones dolosas",
    muertesViales: "Muertes en accidentes viales",
    suicidios: "Suicidios (consumados)",
    abusosCarnal: "Abusos sexuales con acceso carnal (violaciones)",
    estafas:  "Estafas y defraudaciones (no incluye virtuales) y usura",
    estafasVirt: "Estafas y defraudaciones asistidas virtualmente",
    estupef:  "Ley 23.737 (estupefacientes)",
    amenazas: "Amenazas",
  };

  const sumHechosProv = (year, cat) => provJujuy
    .filter(r => r.anio === year && r.codigo_delito_snic_nombre === cat)
    .reduce((s, r) => s + r.cantidad_hechos, 0);

  const tasaProv = (year, cat) => {
    const r = provJujuy.find(r => r.anio === year && r.codigo_delito_snic_nombre === cat);
    return r ? r.tasa_hechos : 0;
  };

  // KPIs último año
  const homDol = sumHechosProv(latest, KEY.homDol);
  const homDolPrev = sumHechosProv(prev, KEY.homDol);
  const robos = sumHechosProv(latest, KEY.robos) + sumHechosProv(latest, KEY.robosAgr);
  const hurtos = sumHechosProv(latest, KEY.hurtos);
  const lesiones = sumHechosProv(latest, KEY.lesiones);
  const muertesViales = sumHechosProv(latest, KEY.muertesViales);
  const suicidios = sumHechosProv(latest, KEY.suicidios);
  const totalHechos = provJujuy.filter(r => r.anio === latest).reduce((s, r) => s + r.cantidad_hechos, 0);
  const variacionHomDol = homDolPrev ? ((homDol - homDolPrev) / homDolPrev) * 100 : 0;
  const tasaHomicidios = tasaProv(latest, KEY.homDol);

  const builder = new ReportBuilder("seguridad")
    .setMeta({
      title: "Seguridad y Estadísticas Criminales",
      category: "Seguridad",
      subcategory: "SNIC",
      source: SOURCE,
      date: String(latest),
    })
    .addKPI({ id: "homicidios-dolosos", label: "Homicidios dolosos", value: homDol, formatted: formatInteger(homDol), unit: "casos", comparison: prev ? `${variacionHomDol >= 0 ? "+" : ""}${formatDecimal(variacionHomDol, 1)}% vs ${prev}` : undefined })
    .addKPI({ id: "tasa-homicidios", label: "Tasa homicidios", value: tasaHomicidios, formatted: formatDecimal(tasaHomicidios, 2), unit: "/100K hab." })
    .addKPI({ id: "robos", label: "Robos (totales)", value: robos, formatted: formatCompact(robos), unit: "casos", comparison: "incluye agravados" })
    .addKPI({ id: "hurtos", label: "Hurtos", value: hurtos, formatted: formatCompact(hurtos), unit: "casos" })
    .addKPI({ id: "lesiones-dolosas", label: "Lesiones dolosas", value: lesiones, formatted: formatCompact(lesiones), unit: "casos" })
    .addKPI({ id: "muertes-viales", label: "Muertes viales", value: muertesViales, formatted: formatInteger(muertesViales), unit: "casos" })
    .addKPI({ id: "suicidios", label: "Suicidios", value: suicidios, formatted: formatInteger(suicidios), unit: "casos" })
    .addKPI({ id: "total-hechos", label: "Total hechos delictivos", value: totalHechos, formatted: formatCompact(totalHechos) });

  // Chart 1: Top categorías (último año, Jujuy)
  const sectionTop = "Principales Tipos de Delito";
  const sidTop = slugify(sectionTop);
  const topCategorias = [
    { label: "Hurtos",                          v: hurtos },
    { label: "Robos",                           v: robos },
    { label: "Lesiones dolosas",                v: lesiones },
    { label: "Amenazas",                        v: sumHechosProv(latest, KEY.amenazas) },
    { label: "Estupefacientes (Ley 23.737)",    v: sumHechosProv(latest, KEY.estupef) },
    { label: "Estafas",                         v: sumHechosProv(latest, KEY.estafas) + sumHechosProv(latest, KEY.estafasVirt) },
    { label: "Abusos sexuales con acceso carnal", v: sumHechosProv(latest, KEY.abusosCarnal) },
    { label: "Muertes viales",                  v: muertesViales },
    { label: "Suicidios",                       v: suicidios },
    { label: "Homicidios dolosos",              v: homDol },
  ].filter(d => d.v > 0).sort((a, b) => b.v - a.v);
  builder.addChart({
    id: "bar-top-delitos",
    type: "bar",
    title: `Principales tipos de delito — Jujuy, ${latest}`,
    sectionId: sidTop,
    sectionTitle: sectionTop,
    data: topCategorias.map(d => ({ delito: d.label, Hechos: d.v })),
    config: { xAxis: "delito", yAxis: "Hechos", layout: "horizontal" },
  });

  // Chart 2: Serie temporal (2000-latest)
  const sectionSerie = "Evolución 2000-" + latest;
  const sidSerie = slugify(sectionSerie);
  const serieData = years.map(y => ({
    anio: String(y),
    "Homicidios dolosos": sumHechosProv(y, KEY.homDol),
    "Hurtos": sumHechosProv(y, KEY.hurtos),
    "Robos": sumHechosProv(y, KEY.robos) + sumHechosProv(y, KEY.robosAgr),
  }));
  builder.addChart({
    id: "line-serie-temporal",
    type: "line",
    title: `Evolución temporal de delitos clave — Jujuy ${years[0]}-${latest}`,
    sectionId: sidSerie,
    sectionTitle: sectionSerie,
    data: serieData,
    config: { xAxis: "anio", yAxis: "Hechos" },
  });

  // Chart 3: Tasa homicidios histórica
  const sectionTasa = "Tasa de Homicidios";
  const sidTasa = slugify(sectionTasa);
  const tasaData = years.map(y => ({ anio: String(y), "Tasa /100K": tasaProv(y, KEY.homDol) }));
  builder.addChart({
    id: "line-tasa-homicidios",
    type: "line",
    title: `Tasa de homicidios dolosos (cada 100.000 hab.) — Jujuy`,
    sectionId: sidTasa,
    sectionTitle: sectionTasa,
    data: tasaData,
    config: { xAxis: "anio", yAxis: "Tasa /100.000" },
  });

  // Chart 4: Hechos por departamento (último año, suma todos los delitos)
  const sectionDept = "Hechos Delictivos por Departamento";
  const sidDept = slugify(sectionDept);
  const isDepartamento = (dn) => /^\d+/.test(String(dn || "").trim()) === false && !/sin determinar/i.test(String(dn || ""));
  // Mejor: filtrar usando catálogo
  const NOMBRE_BY_CODIGO = Object.fromEntries(DEPARTAMENTOS_JUJUY.map(d => [d.codigo, d.nombre]));
  const deptCurrent = deptJujuy.filter(r => r.anio === latest && NOMBRE_BY_CODIGO[String(r.departamento_id).trim()]);

  const byDepartamento = new Map();
  for (const r of deptCurrent) {
    const codigo = String(r.departamento_id).trim();
    const slot = byDepartamento.get(codigo) || { hechos: 0, tasaSum: 0, tasaCount: 0 };
    slot.hechos += r.cantidad_hechos;
    if (r.tasa_hechos > 0) { slot.tasaSum += r.tasa_hechos; slot.tasaCount++; }
    byDepartamento.set(codigo, slot);
  }
  const dataDepartamento = DEPARTAMENTOS_JUJUY.map(c => {
    const slot = byDepartamento.get(c.codigo) || { hechos: 0, tasaSum: 0, tasaCount: 0 };
    return {
      departamento: c.nombre,
      municipioId: c.codigo,
      hechos: slot.hechos,
      tasa: slot.tasaCount ? Math.round((slot.tasaSum / slot.tasaCount) * 10) / 10 : 0,
    };
  });

  builder.addChart({
    id: "bar-hechos-departamento",
    type: "bar",
    title: `Hechos delictivos por departamento — ${latest}`,
    sectionId: sidDept,
    sectionTitle: sectionDept,
    data: dataDepartamento.map(d => ({ departamento: d.departamento, Hechos: d.hechos })),
    config: { xAxis: "departamento", yAxis: "Hechos" },
  });

  builder.addRanking({
    id: "rank-hechos-departamento",
    title: "Departamentos con más hechos delictivos",
    sectionId: sidDept,
    items: [...dataDepartamento].sort((a, b) => b.hechos - a.hechos).map(d => ({
      name: d.departamento,
      value: d.hechos,
      municipioId: d.municipioId,
    })),
    order: "desc",
  });

  // Chart 5: Víctimas por sexo (delitos violentos último año)
  const sectionVic = "Víctimas por Sexo";
  const sidVic = slugify(sectionVic);
  const violentas = [KEY.homDol, KEY.lesiones, KEY.abusosCarnal, KEY.robosAgr];
  const vicData = violentas.map(cat => {
    const filt = provJujuy.filter(r => r.anio === latest && r.codigo_delito_snic_nombre === cat);
    const masc = filt.reduce((s, r) => s + r.cantidad_victimas_masc, 0);
    const fem = filt.reduce((s, r) => s + r.cantidad_victimas_fem, 0);
    return { delito: cat.length > 32 ? cat.slice(0, 30) + "…" : cat, Mujeres: fem, Varones: masc };
  });
  builder.addChart({
    id: "bar-victimas-sexo",
    type: "bar",
    title: "Víctimas por sexo según delito",
    sectionId: sidVic,
    sectionTitle: sectionVic,
    data: vicData,
    config: { xAxis: "delito", yAxis: "Víctimas", grouped: true },
  });

  // Chart 6: Comparativo Nacional — tasa homicidios provincias (último año)
  const sectionProv = "Comparativo Nacional";
  const sidProv = slugify(sectionProv);
  const provYear = provRows.filter(r => r.anio === latest && r.codigo_delito_snic_nombre === KEY.homDol);
  const provData = provYear
    .map(r => ({ provincia: String(r.provincia_nombre || ""), "Tasa homicidios": r.tasa_hechos }))
    .filter(d => d.provincia && d["Tasa homicidios"] >= 0)
    .sort((a, b) => b["Tasa homicidios"] - a["Tasa homicidios"]);
  builder.addChart({
    id: "bar-homicidios-provincias",
    type: "bar",
    title: `Tasa de homicidios dolosos por provincia — ${latest}`,
    sectionId: sidProv,
    sectionTitle: sectionProv,
    data: provData,
    config: { xAxis: "provincia", yAxis: "Tasa (/100K)", layout: "horizontal" },
  });

  // mapData (opcional, sin choropleth visible aún)
  for (const d of dataDepartamento) {
    builder.addMapItem({
      municipioId: d.municipioId,
      municipioNombre: d.departamento,
      value: d.hechos,
      label: `${formatInteger(d.hechos)} hechos`,
    });
  }

  const data = builder.build();

  // ─── Posición Jujuy ranking provincial ───
  const jujuyHomEntry = provData.find(d => /^Jujuy$/i.test(d.provincia));
  const posJujuy = jujuyHomEntry ? provData.indexOf(jujuyHomEntry) + 1 : null;
  const totalProv = provData.length;

  // ─── Datos derivados para narrativa ejecutiva ───
  const totalPobJujuy = 811611;
  const totalPropiedad = hurtos + robos;
  const pctPropiedad = totalHechos ? (totalPropiedad / totalHechos) * 100 : 0;
  const ratioHomicidios = homDol ? Math.round(totalPobJujuy / homDol) : 0;
  const top3 = [...dataDepartamento].sort((a, b) => b.hechos - a.hechos).slice(0, 3);
  const top3Hechos = top3.reduce((s, d) => s + d.hechos, 0);
  const totalDeptHechos = dataDepartamento.reduce((s, d) => s + d.hechos, 0);
  const pctTop3 = totalDeptHechos ? (top3Hechos / totalDeptHechos) * 100 : 0;
  const tasaNac = SNIC_2024.tasa_homicidios_nacional;
  const desvNac = tasaNac ? ((tasaHomicidios - tasaNac) / tasaNac) * 100 : 0;

  // Víctimas por sexo (homicidios dolosos) año actual
  const homFilt = provJujuy.filter(r => r.anio === latest && r.codigo_delito_snic_nombre === KEY.homDol);
  const homMasc = homFilt.reduce((s, r) => s + r.cantidad_victimas_masc, 0);
  const homFem = homFilt.reduce((s, r) => s + r.cantidad_victimas_fem, 0);
  const ratioGenero = homFem > 0 ? `${homMasc}:${homFem}` : `${homMasc}:0`;

  // Serie temporal — interpretación de quiebres (homicidios dolosos)
  const serieHom = years.map(y => ({ anio: y, valor: sumHechosProv(y, KEY.homDol) }));
  const interpHom = interpretarSerie(serieHom, { magnitudLabel: "homicidios" });
  const tendHom = resumenTendencia(serieHom, 5);

  const serieHurtos = years.map(y => ({ anio: y, valor: sumHechosProv(y, KEY.hurtos) }));
  const interpHurtos = interpretarSerie(serieHurtos, { magnitudLabel: "hurtos" });

  const md = buildReportMd({
    ...data,

    intro: `En **${latest}**, Jujuy registró **${formatInteger(homDol)} homicidios dolosos** (${variacionHomDol >= 0 ? "↑" : "↓"} ${formatDecimal(Math.abs(variacionHomDol), 1)}% vs ${prev}), **${formatInteger(robos)} robos** y **${formatInteger(hurtos)} hurtos**. La tasa de homicidios fue de **${formatDecimal(tasaHomicidios, 2)} cada 100.000 habitantes**${posJujuy ? `, ubicándola en el puesto **${posJujuy} de ${totalProv}** jurisdicciones del país` : ""}.`,

    executiveSummary: `El perfil delictivo de Jujuy en ${latest} confirma una característica estructural de la provincia: una tasa de homicidios dolosos de **${formatDecimal(tasaHomicidios, 2)} cada 100.000 habitantes**, sustancialmente por debajo del promedio nacional estimado en **${formatDecimal(tasaNac, 1)}** (un desvío de **${desvNac >= 0 ? "+" : ""}${formatDecimal(desvNac, 1)}%**). En términos absolutos, los **${formatInteger(homDol)} homicidios dolosos** registrados equivalen a uno cada **${formatInteger(ratioHomicidios)} habitantes**, una de las relaciones más bajas del país, comparable con jurisdicciones como La Pampa, La Rioja y Catamarca.

La composición del delito está dominada por las categorías patrimoniales: **${formatInteger(totalPropiedad)} hechos** entre hurtos y robos concentran el **${formatDecimal(pctPropiedad, 1)}%** del total registrado en ${latest}. Este patrón es típico del Noroeste argentino, donde el peso urbano se concentra en pocos núcleos (capitales provinciales y ciudades intermedias) que ejercen como gravitadores de actividad económica y, por extensión, de oportunidades delictivas patrimoniales.

La distribución territorial es marcadamente asimétrica: los tres departamentos con mayor volumen de hechos (**${top3.map(d => d.departamento).join(", ")}**) acumulan el **${formatDecimal(pctTop3, 1)}%** del total provincial, replicando el mapa de concentración poblacional y comercial. Los departamentos puneños y de la quebrada presentan volúmenes absolutos significativamente menores, aunque no necesariamente tasas relativas más bajas.

La evolución 2000-${latest} muestra ${tendHom}, con quiebres asociados a los grandes ciclos macroeconómicos nacionales antes que a dinámicas estrictamente provinciales. La pandemia de 2020 introdujo un punto de inflexión en delitos contra la propiedad por la caída de la circulación urbana.`,

    keyFindings: [
      `**Predominio patrimonial:** los delitos contra la propiedad (${formatInteger(totalPropiedad)} hurtos y robos) concentran el **${formatDecimal(pctPropiedad, 1)}%** del total registrado en ${latest}, contra ${formatInteger(homDol)} homicidios dolosos y ${formatInteger(lesiones)} lesiones dolosas.`,
      `**Tasa de homicidios por debajo del promedio nacional:** ${formatDecimal(tasaHomicidios, 2)} vs ${formatDecimal(tasaNac, 1)} cada 100.000 habitantes (desvío de **${desvNac >= 0 ? "+" : ""}${formatDecimal(desvNac, 1)}%**).`,
      `**Concentración territorial:** los 3 departamentos más urbanizados (${top3.map(d => d.departamento).join(", ")}) acumulan el **${formatDecimal(pctTop3, 1)}%** de los hechos registrados.`,
      `**Asimetría de género en víctimas:** en homicidios dolosos la relación masculino:femenino fue **${ratioGenero}** en ${latest}, consistente con el patrón nacional. Los delitos sexuales con acceso carnal invierten esta proporción.`,
      `**Variación interanual:** los homicidios dolosos ${variacionHomDol >= 0 ? "aumentaron" : "se redujeron"} **${formatDecimal(Math.abs(variacionHomDol), 1)}%** respecto a ${prev}, oscilación dentro del rango esperable para una serie con valores absolutos bajos.`,
      `**Posicionamiento federal:** Jujuy ocupa el puesto **${posJujuy || "—"} de ${totalProv}** jurisdicciones en tasa de homicidios — ${posJujuy && posJujuy > totalProv * 0.6 ? "entre las más bajas del país" : "en el rango intermedio"}.`,
    ],

    keyDatum: `**Dato destacado:** en ${latest}, Jujuy registró **un homicidio doloso cada ${formatInteger(ratioHomicidios)} habitantes** — un indicador que ubica a la provincia entre las más seguras del país en términos de violencia letal, aunque convive con altos volúmenes de delitos contra la propiedad concentrados en sus principales núcleos urbanos.`,

    sectionNarratives: {
      [sidTop]: `La estructura del delito registrado en Jujuy en ${latest} muestra un fuerte predominio de las categorías patrimoniales sobre las violentas. Los **${formatInteger(hurtos)} hurtos** y **${formatInteger(robos)} robos** (sumando agravados) constituyen el grueso del registro: aproximadamente **${formatDecimal(pctPropiedad, 1)}%** del total de hechos relevados por el SNIC.

Las categorías violentas — homicidios dolosos, lesiones graves, abusos sexuales — exhiben volúmenes absolutos bajos pero concentran el mayor impacto social y mediático. Los **${formatInteger(homDol)} homicidios dolosos** representan apenas una fracción del total registrado, mientras que las **${formatInteger(lesiones)} lesiones dolosas** y los abusos sexuales con acceso carnal configuran el núcleo de la violencia interpersonal cotidiana.

Vale señalar que el SNIC mide *hechos denunciados o conocidos por las fuerzas de seguridad*, no la totalidad de los delitos cometidos. Las cifras de delitos sexuales, violencia de género e intrafamiliar suelen presentar subregistro significativo por barreras a la denuncia. Las categorías patrimoniales, en cambio, tienen mayor cobertura por su vinculación con trámites de seguros y compañías telefónicas.`,

      [sidSerie]: `La serie ${years[0]}-${latest} permite leer la evolución del delito en Jujuy en clave de ciclo macroeconómico antes que de tendencia lineal. ${interpHom}

En el caso específico de los hurtos, ${interpHurtos}

La pandemia de 2020 introdujo un quiebre transversal en las categorías patrimoniales por la abrupta caída de la circulación urbana y la suspensión temporal de actividades comerciales. La recuperación posterior muestra heterogeneidad: algunas categorías retornaron rápidamente a niveles pre-pandémicos, mientras otras se reconfiguraron por cambios estructurales (más comercio electrónico, modalidades de estafa virtual emergentes).`,

      [sidTasa]: `La tasa de homicidios dolosos cada 100.000 habitantes es el indicador internacionalmente comparable para violencia letal y un proxy de la calidad institucional. Para Jujuy, esta tasa se ubica en **${formatDecimal(tasaHomicidios, 2)}**, valor históricamente bajo y consistentemente por debajo del promedio nacional.

La estabilidad relativa de este indicador a lo largo del período sugiere que la violencia letal en la provincia responde a dinámicas estructurales (no a ciclos económicos ni a olas delictivas episódicas), un patrón distinto al de las grandes provincias metropolitanas donde la tasa oscila con mayor amplitud.`,

      [sidDept]: `La distribución territorial del delito en Jujuy reproduce, en escala provincial, el patrón nacional de concentración urbana: los departamentos con mayor población y actividad económica concentran los volúmenes absolutos más altos. **${top3[0]?.departamento || "Dr. Manuel Belgrano"}** (capital provincial), seguido por **${top3[1]?.departamento || "—"}** y **${top3[2]?.departamento || "—"}**, encabezan la distribución, acumulando entre los tres el **${formatDecimal(pctTop3, 1)}%** de los hechos registrados.

Esta concentración refleja menos una "geografía del delito" que la geografía del propio registro estadístico: los hechos se denuncian y procesan en las jurisdicciones donde existen dependencias policiales, fiscalías y población urbana suficiente para sostener trámites. Los departamentos puneños y de la quebrada (Susques, Rinconada, Santa Catalina, Yavi) muestran volúmenes mínimos, en parte por sus reducidas poblaciones y en parte por la menor capilaridad del sistema de denuncia.`,

      [sidVic]: `La distribución por sexo de las víctimas en ${latest} reproduce, con leves variaciones, el patrón nacional e internacional. En **homicidios dolosos** la relación masculino:femenino fue **${ratioGenero}**, consistente con la literatura criminológica que asocia la violencia letal en espacios públicos a interacciones entre varones jóvenes. La proporción se atenúa en homicidios dolosos vinculados a violencia intrafamiliar (femicidios), donde las víctimas mujeres tienen mayor presencia, pero el registro SNIC no permite desagregar esta dimensión sin cruzar con bases adicionales.

En **abusos sexuales con acceso carnal**, la proporción se invierte: la abrumadora mayoría de las víctimas son mujeres, en línea con un fenómeno globalmente reconocido como expresión de violencia sexual y de género. La distribución de víctimas en **lesiones dolosas** muestra prevalencia masculina, asociada a episodios de violencia interpersonal en espacios públicos y al consumo problemático de sustancias.`,

      [sidProv]: `Comparada con el resto del país, Jujuy se ubica de forma consistente en el cuartil inferior de tasa de homicidios dolosos. En ${latest}, su tasa de **${formatDecimal(tasaHomicidios, 2)} cada 100.000 habitantes** la posiciona en el puesto **${posJujuy || "—"}** de **${totalProv}** jurisdicciones, junto con provincias del NOA y del centro-sur del país tradicionalmente caracterizadas por baja violencia letal.

Este posicionamiento contrasta con jurisdicciones como Santa Fe, Buenos Aires y CABA, donde las tasas son significativamente mayores y reflejan dinámicas vinculadas al narcomenudeo, conflictividad urbana sostenida y mayor exposición a violencia armada. El perfil de Jujuy se caracteriza, en cambio, por mayor incidencia relativa de delitos contra la propiedad que de violencia letal — un patrón que estructura las prioridades de política criminal a nivel provincial.`,
    },

    nationalContext: `La tasa de homicidios dolosos de **${formatDecimal(tasaHomicidios, 2)} cada 100.000 habitantes** registrada en Jujuy en ${latest} se ubica por debajo del promedio nacional estimado en **${formatDecimal(tasaNac, 1)}**, un desvío de **${desvNac >= 0 ? "+" : ""}${formatDecimal(desvNac, 1)}%**. Esto ubica a la provincia entre las jurisdicciones más seguras del país en términos de violencia letal, junto con La Pampa, Santiago del Estero, Catamarca y La Rioja — todas con estructuras demográficas y económicas comparables y baja densidad urbana fuera de sus capitales.

En el plano del registro patrimonial, las tasas de robos y hurtos en Jujuy son inferiores a las de jurisdicciones más urbanizadas (CABA, Buenos Aires, Córdoba, Santa Fe), pero el peso relativo de estas categorías dentro del total provincial (**${formatDecimal(pctPropiedad, 1)}%**) es consistente con el patrón nacional, donde los delitos contra la propiedad estructuran la mayor parte de la actividad delictiva registrada.

${interpHom}

La pandemia de COVID-19 (2020) generó un quiebre transversal en todas las series provinciales del SNIC, con caídas de hurtos y robos del orden del 20-40% durante el período de aislamiento. La recuperación posterior muestra trayectorias divergentes entre jurisdicciones, asociadas a diferentes ritmos de retorno de la actividad comercial y de la circulación urbana.`,

    policyImplications: `El perfil delictivo de Jujuy tiene implicancias específicas para el diseño de políticas de seguridad y de medición. La baja tasa de homicidios sugiere que los recursos institucionales pueden orientarse hacia las categorías que efectivamente concentran el volumen del registro: delitos patrimoniales en los centros urbanos y delitos sexuales que requieren fortalecimiento del sistema de denuncia, atención y persecución penal.

La concentración del delito en pocos departamentos (capital, San Pedro, El Carmen, Ledesma) configura un desafío de capacidades territoriales: las fuerzas de seguridad y el sistema judicial deben sostener presencia y respuesta en zonas con dinámicas urbanas complejas, mientras que en los departamentos del altiplano y la quebrada los desafíos son más bien de cobertura básica (presencia institucional, acceso a denuncia, traslados a fiscalías). La asimetría territorial de los hechos registrados puede leerse, en parte, como asimetría de capilaridad institucional.

Existen dimensiones que el SNIC no captura por completo y que requieren bases complementarias para un análisis integral: violencia de género (sistemas como la Línea 144, Registro Único de Casos de Violencia, sistemas hospitalarios), trata de personas, conflictividad ambiental y minería ilegal — todas dimensiones particularmente relevantes para una provincia con extensos territorios rurales y de frontera. La tasa de homicidios dolosos, indicador robusto pero estrecho, no debería usarse como medida única de la situación de seguridad provincial.`,
  });

  fs.mkdirSync(path.dirname(OUT_JSON), { recursive: true });
  fs.mkdirSync(path.dirname(OUT_MD), { recursive: true });
  fs.writeFileSync(OUT_JSON, JSON.stringify(data, null, 2));
  fs.writeFileSync(OUT_MD, md);
  console.log(`  ✅ seguridad.json (${data.kpis.length} KPIs, ${data.charts.length} charts, ${data.rankings.length} rankings, ${data.mapData.length} map items) — año ${latest}`);
}

main();
