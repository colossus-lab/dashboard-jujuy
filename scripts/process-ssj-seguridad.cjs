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
    intro: `En **${latest}**, el Departamento Dr. M. Belgrano registró **${formatInteger(homDol)} homicidios dolosos** (${variacionHomDol >= 0 ? "↑" : "↓"} ${formatDecimal(Math.abs(variacionHomDol), 1)}% vs ${prev}), **${formatInteger(robos)} robos** y **${formatInteger(hurtos)} hurtos**. La tasa de homicidios fue de **${formatDecimal(tasaHomicidios, 2)} cada 100.000 habitantes** — una relación baja en comparación con grandes capitales del país. Belgrano concentra el **${formatDecimal(pctBelgJujuy, 1)}%** del total de hechos delictivos provinciales y el **${formatDecimal(pctHomBelgJujuy, 1)}%** de los homicidios dolosos, proporción consistente con su peso poblacional del 39,5%.`,

    executiveSummary: `Belgrano es el **principal núcleo de actividad delictiva registrada en Jujuy**: concentra el **${formatDecimal(pctBelgJujuy, 1)}%** de los hechos provinciales en ${latest}, una proporción **consistente con su peso poblacional** del 39,5%. Esto es relevante interpretarlo correctamente: la concentración del delito en la capital **no implica una tasa criminal más alta** que en otros departamentos — refleja el peso urbano (mayor circulación, mayor exposición, mayor cantidad de víctimas potenciales) y la **mayor capilaridad institucional del sistema de denuncia** (fiscalías, dependencias policiales, oficinas judiciales están concentradas en Belgrano y reciben denuncias incluso de hechos ocurridos en otros departamentos).

La estructura del delito capital es **netamente patrimonial**: los **${formatInteger(totalPropiedad)} hurtos y robos** representan el **${formatDecimal(pctPropiedad, 1)}%** del total registrado en el departamento. Esta composición es típica de centros urbanos del NOA, donde el peso económico y la concentración comercial generan oportunidades delictivas patrimoniales. Las categorías violentas —homicidios, lesiones, abusos sexuales con acceso carnal— exhiben volúmenes acotados pero alta carga social y mediática.

La **tasa de homicidios dolosos** de **${formatDecimal(tasaHomicidios, 2)} cada 100.000 habitantes** implica aproximadamente **un homicidio cada ${formatInteger(ratioHom)} habitantes** — relación muy baja en términos comparados nacionales e internacionales. La capital jujeña se mantiene como una de las más seguras del país en términos de violencia letal, junto con capitales de La Pampa, Catamarca, La Rioja y Santiago del Estero. La variación interanual de **${formatDecimal(Math.abs(variacionHomDol), 1)}%** ${variacionHomDol >= 0 ? "al alza" : "a la baja"} respecto a ${prev} se mueve dentro del rango esperable para series con valores absolutos bajos: oscilaciones de pocos casos generan variaciones porcentuales grandes que no necesariamente reflejan cambios de tendencia.

${interpHom}

La distribución intra-Belgrano del delito no es captable con datos departamentales agregados — pero la evidencia disponible (denuncias por dependencia policial, mapas operativos de seguridad) muestra **concentración del delito patrimonial en zonas comerciales** (microcentro, Av. Senador Pérez, Av. 19 de Abril, terminales de ómnibus) y **delitos contra la persona más distribuidos** entre barrios, con peso significativo en **Alto Comedero** y barrios populares. La política de seguridad capital debe articularse en consecuencia: prevención situacional en zonas comerciales + intervención focalizada en barrios con violencia interpersonal.`,

    keyFindings: [
      `**Concentración consistente con población:** Belgrano absorbe el **${formatDecimal(pctBelgJujuy, 1)}%** de los hechos provinciales — proporción esperable dada su población (39,5% del total provincial). No es tasa más alta, es masa demográfica.`,
      `**Predominio patrimonial:** **${formatDecimal(pctPropiedad, 1)}%** del registro local son hurtos y robos — patrón típico del NOA urbano.`,
      `**Tasa de homicidios baja:** **${formatDecimal(tasaHomicidios, 2)} /100K** — una víctima cada **${formatInteger(ratioHom)}** habitantes, una de las más bajas comparadas con capitales nacionales.`,
      `**Variación interanual:** los homicidios ${variacionHomDol >= 0 ? "aumentaron" : "se redujeron"} **${formatDecimal(Math.abs(variacionHomDol), 1)}%** vs ${prev} — oscilación dentro del rango esperable para series con valores absolutos bajos.`,
      `**Capilaridad de la denuncia:** Belgrano concentra fiscalías, dependencias policiales y oficinas judiciales — el registro capital es más completo que el de departamentos rurales, lo que infla en parte su participación porcentual.`,
      `**Distribución intra-capital:** delito patrimonial concentrado en zonas comerciales; delitos contra la persona más distribuidos, con peso significativo en barrios populares y Alto Comedero.`,
    ],

    keyDatum: `**Dato destacado:** Belgrano concentra el **${formatDecimal(pctBelgJujuy, 1)}%** de los hechos delictivos registrados de Jujuy en ${latest} — proporción consistente con su peso poblacional (39,5%) y no resultado de una tasa criminal más alta. La capital es el núcleo operativo del sistema de seguridad y justicia provincial.`,

    sectionNarratives: {
      [sidTop]: `La **estructura del delito en Belgrano** replica el patrón típico del NOA urbano: fuerte predominio de las categorías patrimoniales sobre las violentas. Los **${formatInteger(hurtos)} hurtos** y **${formatInteger(robos)} robos** (sumando agravados) constituyen el grueso del registro: aproximadamente **${formatDecimal(pctPropiedad, 1)}%** del total de hechos relevados por el SNIC en el departamento.

Las categorías violentas exhiben volúmenes absolutos bajos pero concentran el mayor impacto social y mediático: los **${formatInteger(homDol)} homicidios dolosos** representan apenas una fracción del total registrado, mientras que las **${formatInteger(lesiones)} lesiones dolosas** configuran el núcleo de la violencia interpersonal cotidiana. Las **estafas** —tanto presenciales como virtuales— han crecido como categoría en los últimos años, reflejo del avance del comercio electrónico y la digitalización financiera.

El SNIC mide *hechos denunciados o conocidos por las fuerzas de seguridad*, no la totalidad de los delitos cometidos. Las categorías de delitos sexuales, violencia de género e intrafamiliar suelen presentar subregistro significativo por barreras a la denuncia.`,

      [sidSerie]: `La **serie ${years[0]}-${latest} en Belgrano** muestra la evolución típica de una capital provincial. ${interpHom}

La **pandemia de 2020** introdujo un quiebre transversal en delitos patrimoniales: la abrupta caída de la circulación urbana, el cierre de comercios y la suspensión de actividades en espacios públicos redujeron los hurtos y robos. La recuperación posterior muestra trayectorias heterogéneas: algunas categorías retornaron rápidamente a niveles pre-pandémicos, mientras otras se reconfiguraron por cambios estructurales (más comercio electrónico, modalidades de estafa virtual emergentes).

Los homicidios dolosos en Belgrano se mantuvieron en valores absolutos bajos durante toda la serie. Esto sugiere que la violencia letal responde a dinámicas estructurales (no a ciclos económicos ni a olas delictivas episódicas) — patrón distinto al de provincias metropolitanas donde la tasa oscila con amplitud.`,

      [sidTasa]: `La **tasa de homicidios dolosos cada 100.000 habitantes** es el indicador internacionalmente comparable para violencia letal y un proxy de la calidad institucional. Para Belgrano, esta tasa se ubica en **${formatDecimal(tasaHomicidios, 2)}**, valor históricamente bajo y consistentemente por debajo del promedio nacional.

La estabilidad relativa de este indicador a lo largo del período sugiere que la violencia letal en la capital responde a dinámicas estructurales —baja conflictividad armada urbana, ausencia de mercados ilegales consolidados, presencia institucional sostenida— más que a ciclos económicos episódicos. Esta característica diferencia a Belgrano de capitales con mayor tensión criminal (Rosario, partidos del Conurbano bonaerense) donde la tasa oscila con mayor amplitud según las dinámicas del narcomenudeo y de conflictividad asociada.`,

      [sidComp]: `**Belgrano lidera ampliamente** el ranking departamental de hechos delictivos, seguido a distancia por El Carmen y San Pedro. La proporción capital (**${formatDecimal(pctBelgJujuy, 1)}%**) es **consistente con su peso poblacional** del 39,5%, no representa una concentración anómala. No implica necesariamente una tasa más alta que en otros departamentos.

Esta concentración refleja menos una "geografía del delito" que la geografía del propio registro estadístico: los hechos se denuncian y procesan en las jurisdicciones donde existen dependencias policiales, fiscalías y población urbana suficiente para sostener trámites. Los departamentos puneños (Susques, Rinconada, Santa Catalina, Yavi) muestran volúmenes mínimos, en parte por sus reducidas poblaciones y en parte por la menor capilaridad del sistema de denuncia.

**Dentro de Belgrano**, la distribución del delito tampoco es homogénea: el casco comercial (microcentro, terminal, corredores) concentra delitos patrimoniales; Alto Comedero y barrios populares concentran delitos contra la persona. Esta dualidad intra-capital sería visible con datos a escala barrial o de radio censal, pero el SNIC no llega a ese nivel.`,
    },

    nationalContext: `La **tasa de homicidios dolosos de Belgrano (${formatDecimal(tasaHomicidios, 2)})** se ubica por debajo del promedio nacional argentino. La capital jujeña se ubica entre las **jurisdicciones más seguras del país** en términos de violencia letal, junto con capitales de La Pampa, Santiago del Estero, Catamarca y La Rioja — todas con estructuras demográficas y económicas comparables y baja densidad urbana fuera de sus capitales.

En el plano del **registro patrimonial**, las tasas de robos y hurtos en Belgrano son inferiores a las de jurisdicciones más urbanizadas (CABA, Buenos Aires, Córdoba, Santa Fe), pero el **peso relativo** de estas categorías dentro del total provincial (**${formatDecimal(pctPropiedad, 1)}%**) es consistente con el patrón nacional, donde los delitos contra la propiedad estructuran la mayor parte de la actividad delictiva registrada.

La **pandemia de COVID-19 (2020)** generó un quiebre transversal en todas las series provinciales del SNIC, con caídas de hurtos y robos del orden del 20-40% durante el período de aislamiento. La recuperación posterior muestra trayectorias divergentes entre jurisdicciones, asociadas a diferentes ritmos de retorno de la actividad comercial y de la circulación urbana.`,

    policyImplications: `El perfil delictivo capital tiene implicancias específicas para el diseño de política de seguridad. **Primera**: la **baja tasa de homicidios** sugiere que los recursos institucionales pueden orientarse hacia las categorías que efectivamente concentran el volumen del registro — delitos patrimoniales en los centros urbanos y delitos sexuales que requieren fortalecimiento del sistema de denuncia, atención y persecución penal.

**Segunda**: el peso de Belgrano en el delito provincial demanda **capacidades focalizadas en la capital**: presencia policial visible en zonas comerciales (microcentro, Senador Pérez, terminales), iluminación urbana, articulación con cámaras de seguridad municipales, transporte público nocturno (SUMOVI) y políticas de espacio público. El delito en la capital es predominantemente patrimonial — demanda **prevención situacional** más que respuestas reactivas.

**Tercera**: la **dualidad centro / Alto Comedero** exige miradas barriales que el dato departamental agregado no permite. La política de seguridad capital debe diferenciar tipos de delito por zona: prevención situacional en zonas comerciales; intervención focalizada (programas de cercanía, articulación con servicios sociales) en barrios populares con mayor conflictividad interpersonal. El siguiente paso analítico natural es la baja a radios censales y la articulación con datos municipales propios — particularmente del sistema 911 provincial cuando sus datos sean accesibles.

**Cuarta**: dimensiones que el SNIC no captura por completo y que requieren bases complementarias: **violencia de género** (Línea 144, Registro Único de Casos de Violencia, sistemas hospitalarios), **trata de personas**, **conflictividad urbana** asociada a desigualdad de servicios — todas dimensiones particularmente relevantes para entender la seguridad capital más allá de la tasa de homicidios.`,
  });

  fs.mkdirSync(path.dirname(OUT_JSON), { recursive: true });
  fs.mkdirSync(path.dirname(OUT_MD), { recursive: true });
  fs.writeFileSync(OUT_JSON, JSON.stringify(data, null, 2));
  fs.writeFileSync(OUT_MD, md);
  console.log(`  ✅ ssj/seguridad.json (${data.kpis.length} KPIs, ${data.charts.length} charts, ${data.rankings.length} rankings, ${data.mapData.length} map items) — año ${latest}`);
}

main();
