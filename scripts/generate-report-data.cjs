/**
 * generate-report-data.cjs
 *
 * Genera los 8 data.json + 8 .md de los informes censales de Jujuy
 * a partir de los XLSX en `1- Poblacion/`.
 *
 * Output:
 *   public/data/poblacion/<slug>.json
 *   public/reports/poblacion/<slug>.md
 *
 * Uso: node scripts/generate-report-data.cjs
 */

const fs = require("fs");
const path = require("path");

const { ReportBuilder, slugify } = require("./lib/report-builder.cjs");
const { buildReportMd } = require("./lib/markdown-builder.cjs");
const { readSheetRows, extractCabaTable } = require("./lib/xlsx-utils.cjs");
const { readCsv } = require("./lib/csv-utils.cjs");
const { DEPARTAMENTOS_JUJUY } = require("./lib/geo-departamentos-jujuy.cjs");
const {
  toNumber, formatInteger, formatDecimal, formatPercent, formatCompact,
} = require("./lib/formatters.cjs");
const { CENSO_2022, NOA_INFO } = require("./lib/contexto-nacional.cjs");

const ROOT = path.resolve(__dirname, "..");
const PUBLIC_DATA = path.join(ROOT, "public", "data");
const PUBLIC_REPORTS = path.join(ROOT, "public", "reports");
const DATA_DIR = path.join(PUBLIC_DATA, "poblacion");
const REPORTS_DIR = path.join(PUBLIC_REPORTS, "poblacion");
const RAW_DIR = path.join(ROOT, "1- Poblacion");
const SEC_DIR = path.join(ROOT, "2- Seguridad");

fs.mkdirSync(DATA_DIR, { recursive: true });
fs.mkdirSync(REPORTS_DIR, { recursive: true });

const SOURCE = "Censo Nacional de Población, Hogares y Viviendas 2022 (INDEC)";
const PERIOD = "2022";
const SOURCE_SNIC = "SNIC — Sistema Nacional de Información Criminal (Ministerio de Seguridad de la Nación)";

// Para que findChartsForSection (ReportView.tsx) matchee, todos los charts/rankings
// usan sectionId = slugify(sectionTitle), y el markdown produce `## sectionTitle`.

function persist(slug, data, md) {
  fs.writeFileSync(path.join(DATA_DIR, `${slug}.json`), JSON.stringify(data, null, 2));
  fs.writeFileSync(path.join(REPORTS_DIR, `${slug}.md`), md);
  console.log(`  ✅ ${slug}.json (${data.kpis.length} KPIs, ${data.charts.length} charts, ${data.rankings.length} rankings, ${data.mapData.length} map items)`);
}

// ═══════════════════════════════════════════════════════════════
// 1. Estructura por sexo y edad
// ═══════════════════════════════════════════════════════════════
function generateEstructura() {
  const slug = "estructura";
  const folder = path.join(RAW_DIR, "1- Estructura por sexo y edad de la población");
  const file = path.join(folder, "c2022_jujuy_est_c1_10.xlsx");
  const fileDens = path.join(folder, "c2022_jujuy_est_c2_10.xlsx");
  const fileEdad = path.join(folder, "c2022_jujuy_est_c4_10.xlsx");
  const fileMediana = path.join(folder, "c2022_jujuy_est_c6_10.xlsx");

  const fileSexo = path.join(folder, "c2022_jujuy_est_c3_10.xlsx");

  const { total, departamentos } = extractCabaTable(readSheetRows(file, "Cuadro 1.10"));
  const dens = extractCabaTable(readSheetRows(fileDens, "Cuadro 2.10"));
  const mediana = extractCabaTable(readSheetRows(fileMediana, "Cuadro 6.10"));
  const sexoRows = readSheetRows(fileSexo, "Cuadro 3.10");

  const totalPob2022 = toNumber(total[3]);
  const totalVarAbs = toNumber(total[4]);
  const totalVarPct = toNumber(total[5]);

  // Densidad cols: 0=Código, 1=Departamento, 2=Superficie km², 3=Pob, 4=Densidad hab/km²
  const dTot = dens.total.map(toNumber);
  const densJujuy = dTot[4];
  const supJujuy = dTot[2];

  // Mediana cols: 0=Código, 1=Departamento, 2=Edad mediana total, 3=Mujeres, 4=Varones
  const mTot = mediana.total.map(toNumber);
  const edadMedianaJujuy = mTot[2];

  const builder = new ReportBuilder("poblacion-estructura")
    .setMeta({
      title: "Estructura por Sexo y Edad",
      subcategory: "Estructura",
      source: SOURCE,
      date: PERIOD,
    })
    .addKPI({ id: "pob-total-2022", label: "Población total Jujuy (2022)", value: totalPob2022, formatted: formatCompact(totalPob2022), unit: "hab." })
    .addKPI({ id: "densidad", label: "Densidad poblacional", value: densJujuy, formatted: formatInteger(densJujuy), unit: "hab./km²" })
    .addKPI({ id: "edad-mediana", label: "Edad mediana", value: edadMedianaJujuy, formatted: formatInteger(edadMedianaJujuy), unit: "años" })
    .addKPI({ id: "var-pct", label: "Crecimiento decenal", value: totalVarPct, formatted: formatPercent(totalVarPct), comparison: "respecto a 2010" })
    .addKPI({ id: "superficie", label: "Superficie", value: supJujuy, formatted: formatDecimal(supJujuy, 1), unit: "km²" })
    .addKPI({ id: "var-abs", label: "Variación absoluta vs 2010", value: totalVarAbs, formatted: formatInteger(totalVarAbs), unit: "hab." });

  // Chart: pob por departamento
  const sectionPob = "Población por Departamento";
  const sidPob = slugify(sectionPob);
  builder.addChart({
    id: "bar-pob-departamento",
    type: "bar",
    title: "Población 2022 por departamento",
    sectionId: sidPob,
    sectionTitle: sectionPob,
    data: departamentos.map(({ departamento, row }) => ({
      departamento: departamento.nombre,
      Población: toNumber(row[3]) || 0,
    })),
    config: { xAxis: "departamento", yAxis: "Población", layout: "vertical" },
  });

  // Chart: variación %
  const sectionVar = "Crecimiento Decenal";
  const sidVar = slugify(sectionVar);
  builder.addChart({
    id: "bar-var-departamento",
    type: "bar",
    title: "Variación % de población 2010-2022",
    sectionId: sidVar,
    sectionTitle: sectionVar,
    data: departamentos.map(({ departamento, row }) => ({
      departamento: departamento.nombre,
      "Variación %": toNumber(row[5]) || 0,
    })),
    config: { xAxis: "departamento", yAxis: "Variación %", layout: "vertical" },
  });

  // Chart: densidad por departamento
  const sectionDens = "Densidad Poblacional";
  const sidDens = slugify(sectionDens);
  builder.addChart({
    id: "bar-densidad-departamento",
    type: "bar",
    title: "Densidad poblacional por departamento (hab./km²)",
    sectionId: sidDens,
    sectionTitle: sectionDens,
    data: dens.departamentos.map(({ departamento, row }) => ({
      departamento: departamento.nombre,
      "Densidad": toNumber(row[4]) || 0,
    })),
    config: { xAxis: "departamento", yAxis: "Densidad" },
  });

  // Chart: pirámide poblacional (de est_c4)
  const sectionPiramide = "Pirámide Poblacional";
  const sidPiramide = slugify(sectionPiramide);
  const rowsEdad = readSheetRows(fileEdad, "Cuadro 4.10");
  // Cols: 0=Edad, 1=Total, 2=Mujeres, 3=Varones, 4=Índice feminidad
  // Tomar grupos quinquenales (filas con "X-Y" pattern)
  const piramideData = [];
  for (const r of rowsEdad) {
    if (!r) continue;
    const c0 = String(r[0] || "").trim();
    if (/^\d+-\d+$/.test(c0) || /^100\s*y\s*m[áa]s$/i.test(c0)) {
      piramideData.push({
        grupo: c0,
        Mujeres: -(toNumber(r[2]) || 0),  // negativo para que aparezca a la izquierda
        Varones: toNumber(r[3]) || 0,
      });
    }
  }
  builder.addChart({
    id: "piramide-poblacional",
    type: "pyramid",
    title: "Pirámide poblacional — Jujuy",
    sectionId: sidPiramide,
    sectionTitle: sectionPiramide,
    data: piramideData,
    config: { xAxis: "grupo", layout: "horizontal" },
  });

  // Chart: edad mediana por departamento
  const sectionMediana = "Edad Mediana por Departamento";
  const sidMediana = slugify(sectionMediana);
  builder.addChart({
    id: "bar-edad-mediana",
    type: "bar",
    title: "Edad mediana por departamento",
    sectionId: sidMediana,
    sectionTitle: sectionMediana,
    data: mediana.departamentos.map(({ departamento, row }) => ({
      departamento: departamento.nombre,
      "Edad mediana": toNumber(row[2]) || 0,
    })),
    config: { xAxis: "departamento", yAxis: "Edad mediana" },
  });

  // Chart: composición vivienda particular vs colectiva (de est_c3, fila Total)
  // Cols: 0=Sexo, 1=Total, 2=Pob viv. particulares, 3=Viv. colectivas, 4=Calle
  const sectionTipoResid = "Tipo de Residencia";
  const sidTipoResid = slugify(sectionTipoResid);
  const sexoTotalRow = sexoRows.find(r => r && typeof r[0] === "string" && /^Total$/i.test(r[0].trim()));
  const sT = (sexoTotalRow || []).map(toNumber);
  builder.addChart({
    id: "pie-tipo-residencia",
    type: "pie",
    title: "Tipo de residencia — Jujuy",
    sectionId: sidTipoResid,
    sectionTitle: sectionTipoResid,
    data: [
      { id: "Vivienda particular",  label: "Vivienda particular",  value: sT[2] },
      { id: "Vivienda colectiva",   label: "Vivienda colectiva",   value: sT[3] },
      { id: "Situación de calle",   label: "Situación de calle",   value: sT[4] },
    ].filter(d => d.value > 0),
  });

  // Chart: índice de feminidad por edad (de est_c4 col 4)
  const sectionFem = "Índice de Feminidad por Edad";
  const sidFem = slugify(sectionFem);
  const femData = [];
  for (const r of rowsEdad) {
    const c0 = String(r?.[0] || "").trim();
    if (!/^\d+-\d+$/.test(c0) && !/^100\s*y\s*m[áa]s$/i.test(c0)) continue;
    const idx = toNumber(r[4]);
    if (idx != null) femData.push({ edad: c0, "Índice feminidad": idx });
  }
  builder.addChart({
    id: "line-feminidad",
    type: "line",
    title: "Índice de feminidad por grupo de edad — Jujuy",
    sectionId: sidFem,
    sectionTitle: sectionFem,
    data: femData,
    config: { xAxis: "edad", yAxis: "Mujeres por cada 100 varones" },
  });

  // Rankings
  const sortedByPob = [...departamentos].sort((a, b) => (toNumber(b.row[3]) || 0) - (toNumber(a.row[3]) || 0));
  builder.addRanking({
    id: "rank-pob",
    title: "Departamentos más pobladas",
    sectionId: sidPob,
    items: sortedByPob.map(({ departamento, row }) => ({
      name: departamento.nombre,
      value: toNumber(row[3]) || 0,
      municipioId: departamento.codigo,
    })),
    order: "desc",
  });

  const sortedByVar = [...departamentos].sort((a, b) => (toNumber(b.row[5]) || 0) - (toNumber(a.row[5]) || 0));
  builder.addRanking({
    id: "rank-var",
    title: "Departamentos con mayor crecimiento",
    sectionId: sidVar,
    items: sortedByVar.map(({ departamento, row }) => ({
      name: departamento.nombre,
      value: toNumber(row[5]) || 0,
      municipioId: departamento.codigo,
    })),
    order: "desc",
  });

  const sortedByDens = [...dens.departamentos].sort((a, b) => (toNumber(b.row[4]) || 0) - (toNumber(a.row[4]) || 0));
  builder.addRanking({
    id: "rank-densidad",
    title: "Departamentos con mayor densidad",
    sectionId: sidDens,
    items: sortedByDens.map(({ departamento, row }) => ({
      name: departamento.nombre,
      value: toNumber(row[4]) || 0,
      municipioId: departamento.codigo,
    })),
    order: "desc",
  });

  const sortedByMediana = [...mediana.departamentos].sort((a, b) => (toNumber(b.row[2]) || 0) - (toNumber(a.row[2]) || 0));
  builder.addRanking({
    id: "rank-mediana",
    title: "Departamentos con población más envejecida",
    sectionId: sidMediana,
    items: sortedByMediana.map(({ departamento, row }) => ({
      name: departamento.nombre,
      value: toNumber(row[2]) || 0,
      municipioId: departamento.codigo,
    })),
    order: "desc",
  });

  // mapData: pob por departamento
  for (const { departamento, row } of departamentos) {
    const v = toNumber(row[3]) || 0;
    builder.addMapItem({
      municipioId: departamento.codigo,
      municipioNombre: departamento.nombre,
      value: v,
      label: `${formatInteger(v)} hab.`,
    });
  }

  const data = builder.build();

  // ─── Derivados para narrativa ejecutiva ───
  const pctJujuyNacional = (totalPob2022 / CENSO_2022.poblacionArgentina) * 100;
  const desvDensidad = ((densJujuy - CENSO_2022.densidadNacional) / CENSO_2022.densidadNacional) * 100;
  const desvEdadMediana = edadMedianaJujuy - CENSO_2022.edadMedianaNacional;
  const top3Pob = sortedByPob.slice(0, 3);
  const top3PobSum = top3Pob.reduce((s, d) => s + (toNumber(d.row[3]) || 0), 0);
  const pctTop3 = (top3PobSum / totalPob2022) * 100;
  const capital = sortedByPob[0];
  const pctCapital = (toNumber(capital.row[3]) || 0) / totalPob2022 * 100;
  const minPobDep = [...sortedByPob].reverse()[0];
  const ratioMaxMin = (toNumber(capital.row[3]) || 0) / Math.max(1, toNumber(minPobDep.row[3]) || 0);

  const sortedDens = [...dens.departamentos].sort((a, b) => (toNumber(b.row[4]) || 0) - (toNumber(a.row[4]) || 0));
  const densMax = toNumber(sortedDens[0].row[4]) || 0;
  const densMin = toNumber(sortedDens[sortedDens.length - 1].row[4]) || 0;
  const ratioDensidad = densMin > 0 ? densMax / densMin : densMax;

  const sortedMedianaAsc = [...mediana.departamentos].sort((a, b) => (toNumber(a.row[2]) || 0) - (toNumber(b.row[2]) || 0));
  const depMasJoven = sortedMedianaAsc[0];
  const depMasViejo = sortedMedianaAsc[sortedMedianaAsc.length - 1];

  const md = buildReportMd({
    ...data,
    intro: `La Provincia de Jujuy alcanzó **${formatInteger(totalPob2022)} habitantes** en 2022 sobre ${formatDecimal(supJujuy, 1)} km², con una densidad de **${formatInteger(densJujuy)} hab./km²** y una edad mediana de **${formatInteger(edadMedianaJujuy)} años**. El crecimiento del **${formatPercent(totalVarPct)}** vs. 2010 confirma una dinámica demográfica activa, aunque con marcadas asimetrías territoriales entre el corredor central y la Puna.`,

    executiveSummary: `Jujuy concentra el **${formatDecimal(pctJujuyNacional, 2)}%** de la población argentina (${formatInteger(totalPob2022)} sobre ${formatInteger(CENSO_2022.poblacionArgentina)} habitantes a nivel nacional) en apenas el **${formatDecimal((supJujuy / CENSO_2022.superficieArgentina) * 100, 2)}%** del territorio, lo que se traduce en una densidad de **${formatInteger(densJujuy)} hab./km²**, prácticamente igual al promedio nacional (${formatDecimal(CENSO_2022.densidadNacional, 1)} hab./km²). Sin embargo, este promedio provincial oculta una de las heterogeneidades territoriales más extremas del país: el departamento más denso multiplica por más de **${formatInteger(ratioDensidad)} veces** la densidad del más despoblado, una brecha que refleja la coexistencia de un corredor urbanizado en la Quebrada y el Valle de Jujuy con vastos territorios puneños de ocupación dispersa.

El crecimiento decenal del **${formatPercent(totalVarPct)}** (${formatInteger(totalVarAbs)} habitantes adicionales) confirma a Jujuy dentro del patrón demográfico del NOA: ritmo de expansión sostenido, por encima del promedio nacional pero con desaceleración respecto a ciclos previos. La edad mediana de **${formatInteger(edadMedianaJujuy)} años** se ubica ${desvEdadMediana < 0 ? `**${Math.abs(desvEdadMediana)} año(s) por debajo**` : `**${desvEdadMediana} año(s) por encima**`} del promedio nacional (${CENSO_2022.edadMedianaNacional} años), confirmando una estructura demográfica más jóven que el centro del país — rasgo compartido con el resto del NOA y vinculado a una transición demográfica más tardía.

La distribución territorial es marcadamente asimétrica: los tres departamentos más poblados (**${top3Pob.map(d => d.departamento.nombre).join(", ")}**) acumulan el **${formatDecimal(pctTop3, 1)}%** de la población provincial, mientras los departamentos puneños y de Valle Grande no superan, individualmente, los 5.000 habitantes. Esta concentración define dos Jujuy en términos demográficos y económicos: una provincia urbana centrada en la conurbación capital-Palpalá-El Carmen y un mosaico de departamentos rurales y de altura cuya dinámica responde a lógicas productivas, climáticas y culturales propias.

La pirámide poblacional sigue mostrando una base relativamente amplia, aunque con signos claros de estrechamiento en los grupos más jóvenes — el patrón típico de una transición demográfica en curso. El peso de la población mayor de 60 años avanza progresivamente, anticipando presiones futuras sobre sistemas de salud, previsión y cuidados.`,

    keyFindings: [
      `**Peso poblacional moderado:** Jujuy concentra el **${formatDecimal(pctJujuyNacional, 2)}%** de la población nacional, una cuota similar a su peso relativo histórico dentro del NOA.`,
      `**Densidad promedio engañosa:** **${formatInteger(densJujuy)} hab./km²** a nivel provincial vs. **${formatDecimal(densMax, 0)} hab./km²** en ${sortedDens[0].departamento.nombre} y **${formatDecimal(densMin, 1)} hab./km²** en ${sortedDens[sortedDens.length - 1].departamento.nombre} — una brecha de **${formatInteger(ratioDensidad)} veces**.`,
      `**Concentración urbana acentuada:** ${top3Pob.map(d => d.departamento.nombre).join(", ")} concentran el **${formatDecimal(pctTop3, 1)}%** del total provincial; ${capital.departamento.nombre} por sí solo absorbe el **${formatDecimal(pctCapital, 1)}%**.`,
      `**Estructura más jóven que el promedio nacional:** edad mediana de **${formatInteger(edadMedianaJujuy)} años** vs. ${CENSO_2022.edadMedianaNacional} del país, en línea con el patrón NOA de transición demográfica tardía.`,
      `**Heterogeneidad etaria interna:** ${depMasJoven.departamento.nombre} (mediana ${formatInteger(toNumber(depMasJoven.row[2]))}) es el departamento más jóven, contra ${depMasViejo.departamento.nombre} (mediana ${formatInteger(toNumber(depMasViejo.row[2]))}), lo que refleja distintos estadios de transición demográfica.`,
      `**Crecimiento decenal robusto:** **${formatPercent(totalVarPct)}** entre 2010 y 2022 — superior al promedio nacional del período y reflejo de una dinámica vegetativa aún expansiva.`,
    ],

    keyDatum: `**Dato destacado:** en Jujuy conviven departamentos como ${sortedDens[0].departamento.nombre} con **${formatInteger(densMax)} hab./km²** y la Puna (${sortedDens[sortedDens.length - 1].departamento.nombre}, **${formatDecimal(densMin, 1)} hab./km²**) — una desigualdad territorial de **${formatInteger(ratioDensidad)} a 1** que estructura buena parte de los problemas de cobertura de servicios, conectividad e infraestructura provincial.`,

    sectionNarratives: {
      [sidPob]: `Los **${formatInteger(totalPob2022)} habitantes** de Jujuy se distribuyen en 16 departamentos de tamaños radicalmente distintos. **${capital.departamento.nombre}** —que contiene la capital provincial— concentra el **${formatDecimal(pctCapital, 1)}%** del total provincial, una proporción comparable a la que San Salvador de Jujuy ostentó históricamente respecto al resto.

Los tres departamentos más poblados (**${top3Pob.map(d => d.departamento.nombre).join(", ")}**) acumulan el **${formatDecimal(pctTop3, 1)}%** de los habitantes, configurando un corredor urbano y suburbano que combina la conurbación capitalina con polos productivos del Ramal jujeño (azúcar, agroindustria) y de la zona industrial de Palpalá. En el extremo opuesto, los departamentos puneños como Rinconada, Santa Catalina, Susques y Cochinoca, junto a Valle Grande en la quebrada, no superan los 5.000 habitantes cada uno.

Esta concentración no es un dato neutral: define la geografía política, fiscal y de provisión de servicios públicos de la provincia. Las dinámicas de crecimiento, contracción o estancamiento poblacional de cada departamento configuran demandas específicas sobre infraestructura escolar, sanitaria y vial que rara vez pueden resolverse con políticas uniformes.`,

      [sidVar]: `La variación 2010-2022 muestra un crecimiento provincial agregado del **${formatPercent(totalVarPct)}** (${formatInteger(totalVarAbs)} habitantes adicionales), pero con dinámicas internas heterogéneas. Algunos departamentos crecieron por encima del promedio provincial —típicamente los del corredor central y zonas con expansión urbana o de actividad económica— mientras otros, especialmente los pequeños departamentos de altura, registraron expansiones más modestas o incluso pérdidas relativas.

Esta heterogeneidad responde a múltiples factores: migración interna desde la Puna y la quebrada hacia el Valle de Jujuy en busca de oportunidades laborales y educativas; expansión periurbana en torno a la capital; y dinámicas vegetativas diferenciadas asociadas a estructuras etarias y a tasas de fecundidad propias de cada zona.`,

      [sidDens]: `La densidad provincial promedio de **${formatInteger(densJujuy)} hab./km²** es muy similar al promedio nacional (${formatDecimal(CENSO_2022.densidadNacional, 1)}), pero oculta la mayor heterogeneidad territorial del NOA. **${sortedDens[0].departamento.nombre}**, con **${formatInteger(densMax)} hab./km²**, concentra densidad urbana plena, mientras los departamentos puneños como **${sortedDens[sortedDens.length - 1].departamento.nombre}** apenas alcanzan **${formatDecimal(densMin, 1)} hab./km²** — una proporción de aproximadamente **${formatInteger(ratioDensidad)} a 1**.

Esta brecha tiene raíces históricas y geográficas: la altitud, la disponibilidad de agua, los ciclos productivos del azúcar y el tabaco en el Ramal y la centralidad histórica del Valle de Jujuy estructuraron asentamientos densos en pocas zonas, mientras la Puna desarrolló patrones de ocupación dispersos vinculados al pastoreo, la minería extensiva y las comunidades indígenas. La densidad, por sí sola, es un mal predictor de bienestar; pero como variable de planificación de servicios es decisiva.`,

      [sidPiramide]: `La pirámide poblacional de Jujuy mantiene una base aún relativamente amplia, característica de poblaciones en transición demográfica tardía. La fecundidad ha bajado de manera sostenida en las últimas décadas, pero permanece por encima del promedio nacional (${formatDecimal(CENSO_2022.hijos_por_mujer_nacional, 1)} hijos por mujer a nivel país), lo que se traduce en cohortes de niños y adolescentes proporcionalmente más numerosas que en jurisdicciones del centro del país.

El ensanchamiento intermedio corresponde a la población económicamente activa, núcleo del bono demográfico que la provincia atraviesa. El estrechamiento progresivo a partir de los 60 años marca la base de un envejecimiento que se acelerará en las próximas dos décadas. El índice de feminidad refleja la mayor esperanza de vida femenina: paridad en la infancia y juventud, predominio femenino creciente en cohortes mayores.`,

      [sidMediana]: `La edad mediana provincial de **${formatInteger(edadMedianaJujuy)} años** se ubica ${desvEdadMediana <= 0 ? `**${Math.abs(desvEdadMediana)} año(s) por debajo**` : `**${desvEdadMediana} año(s) por encima**`} del promedio nacional de ${CENSO_2022.edadMedianaNacional} años, ratificando el perfil más jóven característico del NOA. Pero al interior de la provincia, la heterogeneidad es marcada: **${depMasJoven.departamento.nombre}** registra una mediana de **${formatInteger(toNumber(depMasJoven.row[2]))} años**, contra **${formatInteger(toNumber(depMasViejo.row[2]))} años** en **${depMasViejo.departamento.nombre}**.

Esta brecha de medianas dentro del territorio provincial supera los 8-10 años en algunos casos. Departamentos con fuerte presencia rural e indígena y/o con migración de adultos hacia centros urbanos suelen presentar poblaciones más jóvenes; las áreas urbanas con servicios consolidados tienden a envejecer más rápidamente. Estas diferencias condicionan demandas locales muy distintas en educación primaria, salud materno-infantil, geriatría y empleo joven.`,

      [sidTipoResid]: `La amplísima mayoría de la población jujeña reside en viviendas particulares. La población en viviendas colectivas —residencias estudiantiles, geriátricos, hospitales, conventos, hoteles, regimientos militares— y en situación de calle constituye una fracción minoritaria pero socialmente relevante. La distribución es comparable al patrón nacional, con leve sobrerrepresentación de viviendas colectivas en departamentos que albergan instituciones provinciales (educativas, sanitarias, militares).`,

      [sidFem]: `El índice de feminidad —mujeres por cada 100 varones— ilustra la dinámica diferencial de mortalidad entre sexos a lo largo del ciclo de vida. La curva muestra paridad relativa al nacer y en la infancia, leve predominio masculino en adolescencia y juventud temprana, y un creciente predominio femenino a partir de los 40-50 años que se acentúa marcadamente entre los mayores de 75. Este patrón replica la dinámica nacional e internacional, asociada a la mayor esperanza de vida femenina y a una mortalidad masculina superior por causas externas (accidentes, violencia interpersonal) en edades intermedias.`,
    },

    nationalContext: `Jujuy concentra el **${formatDecimal(pctJujuyNacional, 2)}%** de la población argentina sobre el **${formatDecimal((supJujuy / CENSO_2022.superficieArgentina) * 100, 2)}%** del territorio. Su densidad provincial de **${formatInteger(densJujuy)} hab./km²** es prácticamente idéntica al promedio nacional (${formatDecimal(CENSO_2022.densidadNacional, 1)} hab./km²), pero el promedio oculta la coexistencia de zonas urbanas plenamente desarrolladas con vastos territorios de altura prácticamente despoblados — una característica que comparte con sus pares del NOA, especialmente Salta y Catamarca.

La edad mediana provincial (**${formatInteger(edadMedianaJujuy)} años**) se sitúa ${desvEdadMediana <= 0 ? `por debajo` : `por encima`} del promedio nacional (${CENSO_2022.edadMedianaNacional} años), reflejando una transición demográfica más tardía que la del centro y sur del país. El NOA en su conjunto presenta tasas de fecundidad mayores que el promedio argentino (${formatDecimal(CENSO_2022.hijos_por_mujer_nacional, 1)} hijos por mujer), lo que sostiene una estructura etaria con base más amplia y participación juvenil mayor. Provincias como Buenos Aires, CABA, Santa Fe y Córdoba presentan poblaciones más envejecidas, con edades medianas que superan los 33-35 años.

El crecimiento decenal de Jujuy se ubica entre los más sostenidos del NOA y por encima del promedio nacional. Esta dinámica anticipa una oferta laboral potencial creciente en la próxima década, configurando una "ventana demográfica" que demanda inversiones específicas en formación y generación de empleo formal.`,

    policyImplications: `La estructura demográfica de Jujuy plantea tres tensiones estructurales que atraviesan cualquier diagnóstico territorial. La primera es la asimetría densidad-cobertura: prestar servicios públicos en departamentos con menos de 5 hab./km² (Puna, Valle Grande) tiene costos unitarios sustancialmente mayores que en la conurbación capitalina, lo que genera dilemas de equidad federal y provincial en infraestructura escolar, sanitaria, vial y de conectividad digital.

La segunda tensión es la coexistencia de un bono demográfico vigente —cohortes jóvenes amplias entrando al mercado laboral— con un envejecimiento progresivo que se acelerará en las próximas dos décadas. La capacidad de aprovechar el bono depende de la calidad educativa, la inserción laboral formal y la generación de oportunidades productivas en territorio; su desperdicio implicaría no solo costos sociales sino la pérdida de una oportunidad demográfica irrepetible.

La tercera dimensión, menos visible en los promedios, es la heterogeneidad cultural y productiva entre las distintas zonas de la provincia: la lógica demográfica del Ramal (agroindustria, ciclo zafrero, migraciones estacionales) difiere de la de la Puna (pastoreo, minería, comunidades indígenas), de la del Valle de Jujuy (servicios, administración, comercio) y de la Quebrada (turismo, agricultura familiar). Cualquier lectura agregada del Censo 2022 que no considere esta heterogeneidad subestima la complejidad real del territorio jujeño.`,
  });
  persist(slug, data, md);
}

// ═══════════════════════════════════════════════════════════════
// 2. Habitacional Personas — combustible para cocinar (pob_c4)
// ═══════════════════════════════════════════════════════════════
function generateHabitacionalPersonas() {
  const slug = "habitacional-personas";
  const folder = path.join(RAW_DIR, "2- Condiciones habitacionales de la población");
  const file = path.join(folder, "c2022_jujuy_pob_c4_10.xlsx");
  const fileMat = path.join(folder, "c2022_jujuy_pob_c1_10.xlsx");
  const fileAgua = path.join(folder, "c2022_jujuy_pob_c2_10.xlsx");
  const fileCloaca = path.join(folder, "c2022_jujuy_pob_c3_10.xlsx");
  const fileHab = path.join(folder, "c2022_jujuy_pob_c5_10.xlsx");
  const fileTenencia = path.join(folder, "c2022_jujuy_pob_c6_10.xlsx");
  const fileNet = path.join(folder, "c2022_jujuy_pob_c7_10.xlsx");

  const { total, departamentos } = extractCabaTable(readSheetRows(file, "Cuadro 4.10"));
  const tenencia = extractCabaTable(readSheetRows(fileTenencia, "Cuadro 6.10"));

  // Lectura helpers para hojas categóricas (sin departamentos)
  const matRows = readSheetRows(fileMat, "Cuadro 1.10");
  const aguaRows = readSheetRows(fileAgua, "Cuadro 2.10");
  const cloacaRows = readSheetRows(fileCloaca, "Cuadro 3.10");
  const habRows = readSheetRows(fileHab, "Cuadro 5.10");
  const netRows = readSheetRows(fileNet, "Cuadro 7.10");
  const findTotal = (rows) => rows.find(r => r && typeof r[0] === "string" && /^Total$/i.test(r[0].trim()));
  const matTotal = (findTotal(matRows) || []).map(toNumber);
  const aguaTotal = (findTotal(aguaRows) || []).map(toNumber);
  const cloacaTotal = (findTotal(cloacaRows) || []).map(toNumber);
  const habTotal = (findTotal(habRows) || []).map(toNumber);
  const netTotal = (findTotal(netRows) || []).map(toNumber);

  // Cols: 0=Código, 1=Departamento, 2=Pob, 3=Electricidad, 4=Gas red, 5=Gas zeppelin,
  //       6=Gas garrafa, 7=Leña, 8=Otro
  const tot = total.map(toNumber);
  const pobTot = tot[2];
  const gasRedPct = (tot[4] / pobTot) * 100;
  const gasGarrafaPct = (tot[6] / pobTot) * 100;
  const electricidadPct = (tot[3] / pobTot) * 100;

  // pob_c2 (agua): col 1=Total, 2=Cañería dentro, 3=Fuera vivienda, 4=Fuera terreno
  const aguaPobTot = aguaTotal[1];
  const caneriaDentroPct = (aguaTotal[2] / aguaPobTot) * 100;

  // pob_c7 (internet): col 1=Pob, 2=Internet total, 5=Sin internet total
  const netPobTot = netTotal[1];
  const conInternetPct = (netTotal[2] / netPobTot) * 100;
  const sinInternetPct = (netTotal[5] / netPobTot) * 100;

  // pob_c6 tenencia: 0=Código, 1=Departamento, 2=Pob, 3=Propia Total, 4=Escritura, 5=Boleto,
  //                  6=Otra doc, 7=Sin doc, 8=Alquilada, 9=Cedida trabajo, 10=Prestada, 11=Otra
  const teTot = tenencia.total.map(toNumber);
  const propiaPersPct = (teTot[3] / teTot[2]) * 100;
  const alquilPersPct = (teTot[8] / teTot[2]) * 100;

  const builder = new ReportBuilder("poblacion-habitacional-personas")
    .setMeta({
      title: "Condiciones Habitacionales de la Población",
      subcategory: "Hábitat Personas",
      source: SOURCE,
      date: PERIOD,
    })
    .addKPI({ id: "pob-cubierta", label: "Población en viviendas particulares", value: pobTot, formatted: formatCompact(pobTot), unit: "hab." })
    .addKPI({ id: "gas-red", label: "Cocina con gas de red", value: gasRedPct, formatted: formatPercent(gasRedPct) })
    .addKPI({ id: "gas-garrafa", label: "Cocina con gas en garrafa", value: gasGarrafaPct, formatted: formatPercent(gasGarrafaPct), status: gasGarrafaPct > 10 ? "warning" : undefined })
    .addKPI({ id: "agua-canio", label: "Agua por cañería dentro de la vivienda", value: caneriaDentroPct, formatted: formatPercent(caneriaDentroPct) })
    .addKPI({ id: "internet", label: "Vive en hogar con internet", value: conInternetPct, formatted: formatPercent(conInternetPct) })
    .addKPI({ id: "propia-pers", label: "Vive en vivienda propia", value: propiaPersPct, formatted: formatPercent(propiaPersPct) })
    .addKPI({ id: "alquila-pers", label: "Vive en vivienda alquilada", value: alquilPersPct, formatted: formatPercent(alquilPersPct) })
    .addKPI({ id: "electricidad", label: "Cocina con electricidad", value: electricidadPct, formatted: formatPercent(electricidadPct) });

  // Chart: distribución combustible Jujuy (pie)
  const sectionDist = "Distribución de Combustibles";
  const sidDist = slugify(sectionDist);
  builder.addChart({
    id: "pie-combustible",
    type: "pie",
    title: "Combustible para cocinar — Jujuy",
    sectionId: sidDist,
    sectionTitle: sectionDist,
    data: [
      { id: "Gas de red",      label: "Gas de red",      value: tot[4] },
      { id: "Electricidad",    label: "Electricidad",    value: tot[3] },
      { id: "Gas en garrafa",  label: "Gas en garrafa",  value: tot[6] },
      { id: "Gas zeppelin",    label: "Gas zeppelin",    value: tot[5] },
      { id: "Leña o carbón",   label: "Leña o carbón",   value: tot[7] },
      { id: "Otro",            label: "Otro",            value: tot[8] },
    ].filter(d => d.value > 0),
  });

  // Chart: gas de red por departamento
  const sectionAccess = "Acceso al Gas de Red por Departamento";
  const sidAccess = slugify(sectionAccess);
  builder.addChart({
    id: "bar-gas-red-departamento",
    type: "bar",
    title: "% de población con gas de red por departamento",
    sectionId: sidAccess,
    sectionTitle: sectionAccess,
    data: departamentos.map(({ departamento, row }) => {
      const r = row.map(toNumber);
      const pct = (r[4] / r[2]) * 100;
      return { departamento: departamento.nombre, "Gas de red %": Math.round(pct * 10) / 10 };
    }),
    config: { xAxis: "departamento", yAxis: "Gas de red %" },
  });

  // Ranking: departamentos con mayor gas garrafa (vulnerabilidad)
  const ranked = departamentos.map(({ departamento, row }) => {
    const r = row.map(toNumber);
    return { departamento, value: (r[6] / r[2]) * 100 };
  }).sort((a, b) => b.value - a.value);

  builder.addRanking({
    id: "rank-garrafa",
    title: "Departamentos con mayor uso de gas en garrafa",
    sectionId: sidAccess,
    items: ranked.map(r => ({
      name: r.departamento.nombre,
      value: Math.round(r.value * 10) / 10,
      municipioId: r.departamento.codigo,
    })),
    order: "desc",
  });

  // Map: % gas de red por departamento
  for (const { departamento, row } of departamentos) {
    const r = row.map(toNumber);
    const pct = (r[4] / r[2]) * 100;
    builder.addMapItem({
      municipioId: departamento.codigo,
      municipioNombre: departamento.nombre,
      value: Math.round(pct * 10) / 10,
      label: `${formatPercent(pct)} con gas de red`,
    });
  }

  // Chart: materiales de piso (pob_c1) — pie con cols 2..5 fila Total
  const sectionMat = "Materiales de Piso";
  const sidMat = slugify(sectionMat);
  builder.addChart({
    id: "pie-piso",
    type: "pie",
    title: "Material predominante de los pisos — Jujuy",
    sectionId: sidMat,
    sectionTitle: sectionMat,
    data: [
      { id: "Cerámica/Mosaico/Madera", label: "Cerámica/Mosaico/Madera", value: matTotal[2] },
      { id: "Carpeta/Contrapiso",      label: "Carpeta/Contrapiso",      value: matTotal[3] },
      { id: "Tierra/Ladrillo suelto",  label: "Tierra/Ladrillo suelto",  value: matTotal[4] },
      { id: "Otro material",           label: "Otro material",           value: matTotal[5] },
    ].filter(d => d.value > 0),
  });

  // Chart: procedencia del agua (pob_c2) — primeras 4 filas no-Total
  const sectionAgua = "Procedencia del Agua";
  const sidAgua = slugify(sectionAgua);
  const aguaCategorias = [];
  for (const r of aguaRows) {
    const c0 = String(r?.[0] || "").trim();
    if (!c0 || /^Total$/i.test(c0) || c0.startsWith("(") || c0.startsWith("Cuadro") || c0.startsWith("Censo")) continue;
    if (c0 === "Procedencia del agua") continue;
    const v = toNumber(r[1]);
    if (v != null && v > 0) aguaCategorias.push({ id: c0.slice(0, 38), label: c0.slice(0, 38), value: v });
    if (aguaCategorias.length >= 5) break;
  }
  builder.addChart({
    id: "pie-agua",
    type: "pie",
    title: "Procedencia del agua — Jujuy",
    sectionId: sidAgua,
    sectionTitle: sectionAgua,
    data: aguaCategorias,
  });

  // Chart: brecha digital (pob_c7) — internet sí/no
  const sectionDigital = "Brecha Digital";
  const sidDigital = slugify(sectionDigital);
  builder.addChart({
    id: "pie-internet",
    type: "pie",
    title: "Acceso a internet en la vivienda — Jujuy",
    sectionId: sidDigital,
    sectionTitle: sectionDigital,
    data: [
      { id: "Internet + dispositivo",   label: "Internet + dispositivo",   value: netTotal[3] },
      { id: "Internet sin dispositivo", label: "Internet sin dispositivo", value: netTotal[4] },
      { id: "Sin internet",             label: "Sin internet",             value: netTotal[5] },
    ].filter(d => d.value > 0),
  });

  // Chart: tenencia (personas) por departamento
  const sectionTenenciaPers = "Tenencia de la Vivienda (Personas)";
  const sidTenenciaPers = slugify(sectionTenenciaPers);
  builder.addChart({
    id: "bar-tenencia-personas-departamento",
    type: "bar",
    title: "% personas en vivienda propia vs alquilada — por departamento",
    sectionId: sidTenenciaPers,
    sectionTitle: sectionTenenciaPers,
    data: tenencia.departamentos.map(({ departamento, row }) => {
      const r = row.map(toNumber);
      return {
        departamento: departamento.nombre,
        "Propia %":     Math.round((r[3] / r[2]) * 1000) / 10,
        "Alquilada %":  Math.round((r[8] / r[2]) * 1000) / 10,
      };
    }),
    config: { xAxis: "departamento", yAxis: "%", grouped: true },
  });

  // Chart: cantidad de habitaciones (pob_c5) — pie con filas 1,2,3,4,5+
  const sectionHabPers = "Cantidad de Habitaciones";
  const sidHabPers = slugify(sectionHabPers);
  const habCategorias = [];
  for (const r of habRows) {
    const c0 = String(r?.[0] || "").trim();
    if (!c0 || /^Total$/i.test(c0) || c0.startsWith("(") || c0.startsWith("Cuadro") || c0.startsWith("Censo") || c0 === "Cantidad de habitaciones") continue;
    const v = toNumber(r[1]);
    if (v != null && v > 0) habCategorias.push({ id: c0.slice(0, 20), label: c0.slice(0, 20), value: v });
    if (habCategorias.length >= 8) break;
  }
  builder.addChart({
    id: "pie-habitaciones",
    type: "pie",
    title: "Cantidad de habitaciones de la vivienda — Jujuy",
    sectionId: sidHabPers,
    sectionTitle: sectionHabPers,
    data: habCategorias,
  });

  // Chart: desagüe cloacal (pob_c3) — pie ubicación del baño (cols 3,4,5 fila Total)
  const sectionCloacaPers = "Saneamiento";
  const sidCloacaPers = slugify(sectionCloacaPers);
  builder.addChart({
    id: "pie-cloaca-personas",
    type: "pie",
    title: "Ubicación del baño — Jujuy",
    sectionId: sidCloacaPers,
    sectionTitle: sectionCloacaPers,
    data: [
      { id: "Dentro de la vivienda",   label: "Dentro de la vivienda",   value: cloacaTotal[3] },
      { id: "Fuera de la vivienda",    label: "Fuera de la vivienda",    value: cloacaTotal[4] },
      { id: "No tiene baño",           label: "No tiene baño",           value: cloacaTotal[5] },
    ].filter(d => d.value > 0),
  });

  const data = builder.build();

  // ─── Derivados para narrativa ejecutiva ───
  const desvAgua = caneriaDentroPct - CENSO_2022.pct_agua_red_nacional;
  const desvGasRed = gasRedPct - CENSO_2022.pct_gas_red_nacional;
  // Brechas inter-departamentales en gas de red
  const gasRedPorDep = departamentos.map(({ departamento, row }) => {
    const r = row.map(toNumber);
    return { nombre: departamento.nombre, pct: (r[4] / r[2]) * 100, garrafa: (r[6] / r[2]) * 100 };
  });
  const gasRedOrdenado = [...gasRedPorDep].sort((a, b) => b.pct - a.pct);
  const gasRedMax = gasRedOrdenado[0];
  const gasRedMin = gasRedOrdenado[gasRedOrdenado.length - 1];
  const brechaGasRed = gasRedMax.pct - gasRedMin.pct;
  const garrafaOrdenado = [...gasRedPorDep].sort((a, b) => b.garrafa - a.garrafa);
  const topGarrafa = garrafaOrdenado.slice(0, 3);

  // Cloaca/baño
  const banoDentroPct = cloacaTotal[3] && aguaPobTot ? (cloacaTotal[3] / aguaPobTot) * 100 : null;
  const sinBanoPct = cloacaTotal[5] && aguaPobTot ? (cloacaTotal[5] / aguaPobTot) * 100 : 0;

  // Brecha digital
  const sinDispPct = netTotal[4] && netPobTot ? (netTotal[4] / netPobTot) * 100 : 0;

  const md = buildReportMd({
    ...data,
    intro: `Las condiciones habitacionales de la población son uno de los indicadores más sensibles del bienestar estructural. En Jujuy, sobre **${formatInteger(pobTot)} personas** en viviendas particulares, el **${formatPercent(gasRedPct)}** cocina con gas de red, el **${formatPercent(caneriaDentroPct)}** accede al agua por cañería dentro de la vivienda y el **${formatPercent(conInternetPct)}** vive en hogares con conexión a internet — con brechas inter-departamentales muy marcadas entre el corredor central y los departamentos de altura.`,

    executiveSummary: `El perfil habitacional de la población de Jujuy combina coberturas muy altas en algunos servicios (agua dentro de la vivienda: **${formatPercent(caneriaDentroPct)}**) con déficits estructurales en otros, particularmente en gas de red. El **${formatPercent(gasRedPct)}** de la población provincial cocina con gas natural domiciliario, ${desvGasRed >= 0 ? `por encima` : `**${formatDecimal(Math.abs(desvGasRed), 1)} puntos por debajo**`} del promedio nacional (${formatDecimal(CENSO_2022.pct_gas_red_nacional, 1)}%). Mientras tanto, **${formatPercent(gasGarrafaPct)}** depende del gas en garrafa — una dependencia que en la Argentina marca de manera transversal un piso de vulnerabilidad económica: el costo equivalente por caloría útil es sustancialmente mayor que el del gas natural y golpea de manera regresiva.

La cobertura de agua corriente dentro de la vivienda (**${formatPercent(caneriaDentroPct)}**) se ubica ${desvAgua >= 0 ? `por encima` : `por debajo`} del promedio nacional (${formatDecimal(CENSO_2022.pct_agua_red_nacional, 1)}%), confirmando una infraestructura urbana sólida pero con asimetrías hacia las zonas rurales y de altura. La brecha digital es de magnitud moderada: el **${formatPercent(sinInternetPct)}** de la población no tiene internet en su vivienda, y un **${formatDecimal(sinDispPct, 1)}%** adicional cuenta con internet pero sin dispositivo apropiado — escenario que limita el aprovechamiento educativo y laboral del recurso.

Las brechas inter-departamentales son la dimensión más reveladora del análisis. La cobertura de gas de red oscila entre **${formatDecimal(gasRedMax.pct, 1)}%** en ${gasRedMax.nombre} y **${formatDecimal(gasRedMin.pct, 1)}%** en ${gasRedMin.nombre} — una diferencia de **${formatDecimal(brechaGasRed, 1)} puntos porcentuales**. Los departamentos puneños, alejados de la red troncal de gas y con menores umbrales de rentabilidad para extender infraestructura, dependen casi por completo de garrafa, leña o combustibles alternativos.

El perfil de tenencia confirma que el **${formatPercent(propiaPersPct)}** de la población vive en viviendas propias, una proporción típica de provincias del NOA donde la vivienda en propiedad mantiene un peso significativo, frecuentemente con escrituras irregulares en zonas periurbanas y rurales.`,

    keyFindings: [
      `**Brecha de gas de red:** cobertura provincial del **${formatPercent(gasRedPct)}** ${desvGasRed >= 0 ? `vs.` : `frente al`} **${formatDecimal(CENSO_2022.pct_gas_red_nacional, 1)}%** nacional, con una brecha interna de **${formatDecimal(brechaGasRed, 1)} pp** entre ${gasRedMax.nombre} (${formatDecimal(gasRedMax.pct, 1)}%) y ${gasRedMin.nombre} (${formatDecimal(gasRedMin.pct, 1)}%).`,
      `**Dependencia de garrafa:** **${formatPercent(gasGarrafaPct)}** de la población provincial cocina con garrafa; los departamentos más dependientes (${topGarrafa.map(d => `${d.nombre} ${formatDecimal(d.garrafa, 0)}%`).join(", ")}) marcan el núcleo del déficit estructural.`,
      `**Agua de red dentro de la vivienda:** **${formatPercent(caneriaDentroPct)}**, ${desvAgua >= 0 ? `por encima` : `por debajo`} del promedio nacional (**${formatDecimal(CENSO_2022.pct_agua_red_nacional, 1)}%**).`,
      `**Brecha digital:** **${formatPercent(sinInternetPct)}** sin internet en la vivienda, más **${formatDecimal(sinDispPct, 1)}%** con conexión pero sin dispositivo adecuado — un total de población con acceso digital limitado.`,
      `**Tenencia mayoritaria propia:** **${formatPercent(propiaPersPct)}** de la población reside en vivienda propia; **${formatPercent(alquilPersPct)}** en alquiler, fracción menor que en grandes conurbaciones.`,
      `**Saneamiento intra-vivienda:** ${sinBanoPct < 1 ? `prácticamente todos los hogares disponen de baño dentro de la vivienda; el déficit residual (${formatDecimal(sinBanoPct, 1)}%) se concentra en zonas rurales aisladas.` : `el **${formatDecimal(sinBanoPct, 1)}%** declara no contar con baño en la vivienda, una situación de déficit crítico concentrada en zonas rurales.`}`,
    ],

    keyDatum: `**Dato destacado:** mientras el **${formatPercent(caneriaDentroPct)}** de los jujeños accede al agua por cañería dentro de su vivienda, apenas el **${formatPercent(gasRedPct)}** cuenta con gas de red — una asimetría entre redes que define a Jujuy como un caso típico del interior argentino: agua sí, gas no.`,

    sectionNarratives: {
      [sidDist]: `La matriz energética doméstica de Jujuy combina **gas de red (${formatPercent(gasRedPct)})**, **garrafa (${formatPercent(gasGarrafaPct)})** y **electricidad (${formatPercent(electricidadPct)})** como principales fuentes para cocinar. El peso aún relevante de la garrafa marca un piso de vulnerabilidad económica: el costo equivalente por caloría útil es sustancialmente mayor que el del gas natural, y absorbe una fracción mayor del presupuesto en hogares de menores ingresos.

La penetración del gas de red está fuertemente determinada por la geografía de la red troncal de gasoductos: la disponibilidad efectiva es mucho mayor en el corredor central (capital, Palpalá, El Carmen, San Salvador) que en los departamentos de altura, donde la baja densidad poblacional vuelve económicamente inviable extender la red. La leña y el carbón retienen presencia residual en zonas rurales, asociada a tradiciones culturales y a la disponibilidad local del recurso.

La transición energética futura —con potenciales programas de electrificación rural o de garrafa social ampliada— pasa por reconocer esta heterogeneidad estructural: políticas uniformes para una matriz tan diversa rara vez son eficientes.`,

      [sidAccess]: `La cobertura de gas de red varía entre **${formatDecimal(gasRedMax.pct, 1)}%** en ${gasRedMax.nombre} y **${formatDecimal(gasRedMin.pct, 1)}%** en ${gasRedMin.nombre}, una brecha de aproximadamente **${formatDecimal(brechaGasRed, 1)} puntos**. Los departamentos del corredor central concentran las mayores tasas de penetración, mientras que los departamentos puneños y de Valle Grande prácticamente carecen de cobertura.

Los departamentos con mayor dependencia de garrafa (${topGarrafa.map(d => `${d.nombre} **${formatDecimal(d.garrafa, 1)}%**`).join(", ")}) configuran el núcleo del déficit estructural en infraestructura energética doméstica. Esta dependencia no es solo una incomodidad operativa: implica mayores costos de la energía útil para los hogares, exposición a faltantes estacionales y volatilidad de precios mayorista, y un piso de pobreza energética que las políticas sectoriales tienden a invisibilizar.`,

      [sidMat]: `La calidad de los materiales constructivos —específicamente el material del piso predominante— es un proxy aceptado del estado del stock habitacional y de la vulnerabilidad estructural. La amplísima mayoría de la población jujeña reside en viviendas con pisos de cerámica, mosaico, madera o materiales equivalentes; el remanente con pisos de carpeta, contrapiso, tierra o ladrillo suelto identifica situaciones de vulnerabilidad habitacional que coinciden con otros indicadores de déficit (acceso a servicios, tenencia precaria).

A nivel territorial, los pisos precarios se concentran en barrios populares de las ciudades intermedias y en zonas rurales de altura. Aunque la proporción provincial es baja, su distribución territorial revela una geografía de la vulnerabilidad consistente con otros indicadores censales.`,

      [sidAgua]: `La provisión de agua potable por red pública alcanza a la mayor parte de la población provincial, con una cobertura por cañería dentro de la vivienda del **${formatPercent(caneriaDentroPct)}** que se compara favorablemente con el promedio nacional (**${formatDecimal(CENSO_2022.pct_agua_red_nacional, 1)}%**). Las fracciones con perforaciones, transporte por cisterna u otras fuentes se concentran en zonas rurales aisladas y en algunos barrios periurbanos sin infraestructura consolidada.

A diferencia del gas, el agua corriente tiene una lógica de expansión menos sujeta a umbrales mínimos de rentabilidad económica: la presión sanitaria, el rol de los municipios y los programas nacionales de extensión de red han sostenido coberturas elevadas incluso en zonas de baja densidad. Persiste, sin embargo, la cuestión de la **calidad** del agua —no medida en este cuadro— particularmente relevante en zonas con alta presencia de arsénico geológico, problema recurrente en algunas localidades del altiplano.`,

      [sidDigital]: `La brecha digital se desagrega en dos dimensiones: hogares sin conexión a internet (**${formatPercent(sinInternetPct)}** de la población provincial) y hogares con conexión pero sin dispositivos apropiados para aprovecharla (**${formatDecimal(sinDispPct, 1)}%** adicional, típicamente sólo celular). Sumadas, configuran un universo de personas con acceso digital limitado o nulo.

Este indicador es particularmente relevante post-pandemia, donde la virtualización masiva de servicios educativos, sanitarios y administrativos puso en evidencia los costos del subequipamiento digital. La brecha digital se distribuye de manera asimétrica entre departamentos y entre niveles socioeconómicos, replicando otras brechas estructurales.`,

      [sidTenenciaPers]: `La tenencia desde la perspectiva de las personas confirma que el **${formatPercent(propiaPersPct)}** vive en viviendas propias y el **${formatPercent(alquilPersPct)}** en alquiler. Esta estructura es típica del interior del país y contrasta con los grandes núcleos urbanos del AMBA y Rosario, donde el alquiler tiene mayor peso.

La propiedad mayoritaria del NOA convive, sin embargo, con un fenómeno significativo: la regularización dominial pendiente. Muchas viviendas "propias" lo son sin escritura formal, situación que en barrios populares, asentamientos y zonas periurbanas limita el acceso al crédito hipotecario y a programas formales de mejora habitacional. La política pública específica de regularización ha avanzado lentamente y queda como un déficit institucional pendiente.`,

      [sidHabPers]: `El tamaño habitacional efectivo de las viviendas se concentra entre 2 y 4 habitaciones, distribución típica de viviendas familiares en el interior. Las viviendas de 1 habitación (monoambientes, pensiones, viviendas precarias) son numéricamente relevantes y suelen alojar hogares unipersonales o de bajos ingresos. En el extremo opuesto, las viviendas de 5+ habitaciones se concentran en barrios residenciales consolidados.`,

      [sidCloacaPers]: `El acceso a baño dentro de la vivienda es prácticamente universal en Jujuy. ${sinBanoPct < 1 ? `La fracción residual sin baño se ubica por debajo del 1% del total provincial, concentrada en zonas rurales aisladas y configurando un núcleo duro de déficit sanitario crítico.` : `El **${formatDecimal(sinBanoPct, 1)}%** declara no contar con baño en la vivienda — un núcleo duro de déficit sanitario crítico concentrado en zonas rurales y en algunos barrios populares de altura.`} Junto con la disponibilidad de agua corriente, esta dimensión configura el piso básico de saneamiento, condición necesaria para cortar cadenas de transmisión de enfermedades infecciosas.`,
    },

    nationalContext: `Los indicadores habitacionales de Jujuy se enmarcan en el patrón más amplio del NOA: alta cobertura de agua de red comparable al promedio nacional, pero brecha persistente en gas de red por las limitaciones de la red troncal de gasoductos en provincias periféricas. El promedio nacional de cobertura de agua dentro de la vivienda (**${formatDecimal(CENSO_2022.pct_agua_red_nacional, 1)}%**) es comparable al de Jujuy, mientras que la brecha en gas (**${formatDecimal(CENSO_2022.pct_gas_red_nacional, 1)}%** nacional vs. **${formatPercent(gasRedPct)}** provincial) refleja la estructura federal de la infraestructura energética: provincias con yacimientos o muy cercanas a la red troncal (Neuquén, Mendoza, Buenos Aires) presentan coberturas muy superiores, mientras el NOA y la Patagonia austral mantienen brechas.

El acceso a saneamiento mejorado (baño dentro de la vivienda + desagüe cloacal a red pública) muestra un patrón similar: cobertura intra-vivienda casi universal, pero conexión a red cloacal pública (estimada en **${formatDecimal(CENSO_2022.pct_cloaca_nacional, 1)}%** a nivel nacional) sustancialmente menor, especialmente en barrios periurbanos y municipios chicos del interior.

La brecha digital provincial replica el patrón nacional con leves desvíos: las jurisdicciones más urbanizadas (CABA, Buenos Aires) concentran mayor penetración, mientras el NOA y NEA mantienen rezagos de varios puntos porcentuales.`,

    policyImplications: `El perfil habitacional de la población jujeña señala tres tensiones estructurales relevantes para la política pública. La primera es la asimetría entre redes: la cobertura de agua y la del gas siguen lógicas de inversión muy distintas, lo que genera coberturas dispares y un déficit estructural en gas que se traduce en pobreza energética en los hogares de menores ingresos.

La segunda es la dimensión territorial: las brechas inter-departamentales en gas de red (**${formatDecimal(brechaGasRed, 1)} pp** entre el departamento mejor y peor cubierto) y en saneamiento son sustancialmente mayores que las brechas promedio nacionales, lo que refleja la heterogeneidad estructural de la provincia y los límites de las políticas universales de extensión de servicios. Las soluciones a esta dimensión típicamente combinan inversión en red allí donde es viable, subsidios al consumo allí donde no, y alternativas tecnológicas (electrificación, energías renovables) en zonas de baja densidad.

La tercera dimensión, no enteramente capturada por el Censo, es la **calidad** de los servicios prestados: presión y continuidad del agua, calidad química, frecuencia y costo de las garrafas en zonas alejadas, ancho de banda efectivo de internet. El indicador binario "tiene/no tiene" subestima problemas reales de calidad que afectan a poblaciones formalmente cubiertas. Una política pública integral en infraestructura básica debe combinar la mirada censal con relevamientos cualitativos y operativos complementarios.`,
  });
  persist(slug, data, md);
}

// ═══════════════════════════════════════════════════════════════
// 3. Salud y Previsión Social
// ═══════════════════════════════════════════════════════════════
function generateSaludPrevision() {
  const slug = "salud-prevision";
  const folder = path.join(RAW_DIR, "3- Salud y previsión social");
  const fileSalud = path.join(folder, "c2022_jujuy_salud_c1_10.xlsx");
  const fileSaludEdad = path.join(folder, "c2022_jujuy_salud_c2_10.xlsx");
  const filePrev = path.join(folder, "c2022_jujuy_prevision_c3_10.xlsx");

  const salud = extractCabaTable(readSheetRows(fileSalud, "Cuadro 1.10"));
  const prev = extractCabaTable(readSheetRows(filePrev, "Cuadro 3.10"));
  const saludEdadRows = readSheetRows(fileSaludEdad, "Cuadro 2.10");

  // Salud cols: 0=Código, 1=Departamento, 2=Pob total, 3=Obra social/prepaga, 4=Programas estatales, 5=Sin cobertura
  const sTot = salud.total.map(toNumber);
  const pobTot = sTot[2];
  const conObraPct = (sTot[3] / pobTot) * 100;
  const programasPct = (sTot[4] / pobTot) * 100;
  const sinCobPct = (sTot[5] / pobTot) * 100;

  // Previsión cols: 0=Código, 1=Departamento, 2=Pob, 3=Sí Total, 4=Solo jub, 5=Solo pens, 6=Jub+pens, 7=Solo otra, 8=No
  const pTot = prev.total.map(toNumber);
  const conJubPct = (pTot[3] / pTot[2]) * 100;

  const builder = new ReportBuilder("poblacion-salud-prevision")
    .setMeta({
      title: "Salud y Previsión Social",
      subcategory: "Salud",
      source: SOURCE,
      date: PERIOD,
    })
    .addKPI({ id: "obra-prepaga", label: "Con obra social o prepaga", value: conObraPct, formatted: formatPercent(conObraPct) })
    .addKPI({ id: "programas", label: "Programas o planes estatales", value: programasPct, formatted: formatPercent(programasPct) })
    .addKPI({ id: "sin-cobertura", label: "Sin cobertura de salud", value: sinCobPct, formatted: formatPercent(sinCobPct), status: sinCobPct > 15 ? "critical" : "warning" })
    .addKPI({ id: "con-jub", label: "Percibe jubilación o pensión", value: conJubPct, formatted: formatPercent(conJubPct) });

  // Chart: distribución cobertura Jujuy (pie)
  const sectionCob = "Tipo de Cobertura";
  const sidCob = slugify(sectionCob);
  builder.addChart({
    id: "pie-cobertura",
    type: "pie",
    title: "Tipo de cobertura de salud — Jujuy",
    sectionId: sidCob,
    sectionTitle: sectionCob,
    data: [
      { id: "Obra social/Prepaga", label: "Obra social/Prepaga", value: sTot[3] },
      { id: "Programas estatales", label: "Programas estatales", value: sTot[4] },
      { id: "Sin cobertura",       label: "Sin cobertura",       value: sTot[5] },
    ],
  });

  // Chart: % sin cobertura por departamento
  const sectionDesigualdad = "Brechas de Cobertura por Departamento";
  const sidDes = slugify(sectionDesigualdad);
  builder.addChart({
    id: "bar-sin-cob-departamento",
    type: "bar",
    title: "% sin cobertura de salud por departamento",
    sectionId: sidDes,
    sectionTitle: sectionDesigualdad,
    data: salud.departamentos.map(({ departamento, row }) => {
      const r = row.map(toNumber);
      return { departamento: departamento.nombre, "Sin cobertura %": Math.round((r[5] / r[2]) * 1000) / 10 };
    }),
    config: { xAxis: "departamento", yAxis: "Sin cobertura %" },
  });

  // Ranking: departamentos con mayor % sin cobertura
  const ranked = salud.departamentos.map(({ departamento, row }) => {
    const r = row.map(toNumber);
    return { departamento, value: (r[5] / r[2]) * 100 };
  }).sort((a, b) => b.value - a.value);

  builder.addRanking({
    id: "rank-sin-cob",
    title: "Departamentos con mayor % sin cobertura",
    sectionId: sidDes,
    items: ranked.map(r => ({
      name: r.departamento.nombre,
      value: Math.round(r.value * 10) / 10,
      municipioId: r.departamento.codigo,
    })),
    order: "desc",
  });

  // Map: % sin cobertura por departamento
  for (const { departamento, row } of salud.departamentos) {
    const r = row.map(toNumber);
    const pct = (r[5] / r[2]) * 100;
    builder.addMapItem({
      municipioId: departamento.codigo,
      municipioNombre: departamento.nombre,
      value: Math.round(pct * 10) / 10,
      label: `${formatPercent(pct)} sin cobertura`,
    });
  }

  // Chart: % sin cobertura por grupo de edad (de salud_c2)
  // Cols: 0=Edad, 1=Pob, 2=Obra/prepaga, 3=Programas, 4=Sin cobertura
  const sectionEdad = "Cobertura por Grupo de Edad";
  const sidEdad = slugify(sectionEdad);
  const ageRe = /^\d+\s*-\s*\d+$|^100\s*y\s*m[áa]s$/i;
  const edadData = [];
  for (const r of saludEdadRows) {
    const c0 = String(r?.[0] || "").trim();
    if (!ageRe.test(c0)) continue;
    const pob = toNumber(r[1]);
    const sin = toNumber(r[4]);
    if (pob && sin != null) {
      edadData.push({
        edad: c0,
        "Sin cobertura %": Math.round((sin / pob) * 1000) / 10,
        "Con obra social/prepaga %": Math.round((toNumber(r[2]) / pob) * 1000) / 10,
      });
    }
  }
  builder.addChart({
    id: "line-cobertura-edad",
    type: "line",
    title: "Cobertura de salud según grupo de edad — Jujuy",
    sectionId: sidEdad,
    sectionTitle: sectionEdad,
    data: edadData,
    config: { xAxis: "edad", yAxis: "Porcentaje" },
  });

  const data = builder.build();

  // ─── Derivados para narrativa ejecutiva ───
  const desvObra = conObraPct - CENSO_2022.pct_obra_social_nacional;
  const desvSinCob = sinCobPct - CENSO_2022.pct_solo_publica_nacional;
  const sortedSinCob = [...ranked]; // ya ordenado desc por % sin cobertura
  const depMaxSinCob = sortedSinCob[0];
  const depMinSinCob = sortedSinCob[sortedSinCob.length - 1];
  const brechaSinCob = depMaxSinCob.value - depMinSinCob.value;
  const pobSinCobAbs = sTot[5];

  const md = buildReportMd({
    ...data,
    intro: `La cobertura de salud y el sistema previsional son dimensiones críticas del bienestar estructural. En Jujuy, sobre **${formatInteger(pobTot)} habitantes**, el **${formatPercent(conObraPct)}** declara contar con obra social o prepaga, el **${formatPercent(programasPct)}** está cubierto por programas o planes estatales, y el **${formatPercent(sinCobPct)}** depende exclusivamente del sistema público. La cobertura previsional alcanza al **${formatPercent(conJubPct)}** de la población mayor.`,

    executiveSummary: `El perfil de cobertura sanitaria de Jujuy confirma una característica estructural compartida con la mayoría de las provincias del NOA: **alta dependencia del sistema público de salud**. El **${formatPercent(sinCobPct)}** de la población —aproximadamente **${formatInteger(pobSinCobAbs)} personas**— declara no contar con obra social, prepaga ni programa estatal, dependiendo exclusivamente de hospitales y centros de salud públicos. Esta proporción es ${desvSinCob >= 0 ? `**${formatDecimal(desvSinCob, 1)} pp superior**` : `**${formatDecimal(Math.abs(desvSinCob), 1)} pp inferior**`} al promedio nacional de **${formatDecimal(CENSO_2022.pct_solo_publica_nacional, 1)}%**, marcando ${desvSinCob >= 0 ? `una sobrecarga relativa` : `un nivel relativamente alineado`} sobre la infraestructura sanitaria provincial.

La cobertura formal vía obra social o prepaga alcanza al **${formatPercent(conObraPct)}** de la población, ${desvObra >= 0 ? `por encima` : `por debajo`} del **${formatDecimal(CENSO_2022.pct_obra_social_nacional, 1)}%** nacional. Esta cifra refleja en buena medida la informalidad laboral relativa de la provincia: la cobertura formal de salud está históricamente acoplada al empleo asalariado registrado, por lo que provincias con mayor peso del empleo público (que aporta obra social provincial) y menor peso del cuentapropismo informal suelen presentar mejores indicadores.

La cobertura previsional —**${formatPercent(conJubPct)}** entre quienes están en edad de percibirla— refleja una característica del sistema argentino: las moratorias previsionales permitieron alcanzar tasas de cobertura jubilatoria altas incluso en personas con historias laborales informales o incompletas. Esta política, cuya sostenibilidad fiscal es objeto recurrente de debate, ha tenido efectos sustantivos sobre la pobreza en la población adulta mayor.

Las brechas inter-departamentales son significativas: el porcentaje de población sin cobertura formal oscila entre el **${formatDecimal(depMinSinCob.value, 1)}%** en ${depMinSinCob.departamento.nombre} y el **${formatDecimal(depMaxSinCob.value, 1)}%** en ${depMaxSinCob.departamento.nombre} — una brecha de **${formatDecimal(brechaSinCob, 1)} puntos porcentuales** que replica la geografía socioeconómica subyacente.`,

    keyFindings: [
      `**Dependencia del sistema público:** **${formatPercent(sinCobPct)}** de la población jujeña carece de obra social o prepaga (${formatInteger(pobSinCobAbs)} personas) — ${desvSinCob >= 0 ? `**${formatDecimal(Math.abs(desvSinCob), 1)} pp por encima**` : `**${formatDecimal(Math.abs(desvSinCob), 1)} pp por debajo**`} del promedio nacional (**${formatDecimal(CENSO_2022.pct_solo_publica_nacional, 1)}%**).`,
      `**Cobertura formal:** **${formatPercent(conObraPct)}** con obra social o prepaga vs. **${formatDecimal(CENSO_2022.pct_obra_social_nacional, 1)}%** nacional — desvío de **${desvObra >= 0 ? "+" : ""}${formatDecimal(desvObra, 1)} pp**.`,
      `**Programas estatales:** **${formatPercent(programasPct)}** está cubierto exclusivamente por programas o planes estatales (PAMI, planes provinciales, programas sociales).`,
      `**Brecha territorial extrema:** **${formatDecimal(brechaSinCob, 1)} pp** entre ${depMaxSinCob.departamento.nombre} (**${formatDecimal(depMaxSinCob.value, 1)}%** sin cobertura) y ${depMinSinCob.departamento.nombre} (**${formatDecimal(depMinSinCob.value, 1)}%**).`,
      `**Cobertura previsional:** **${formatPercent(conJubPct)}** de la población mayor percibe jubilación o pensión, reflejando el efecto de las moratorias en el sistema argentino.`,
      `**Ciclo vital de cobertura:** los menores y jóvenes adultos concentran la mayor proporción sin cobertura formal; la población mayor de 65 años alcanza cobertura prácticamente universal vía PAMI.`,
    ],

    keyDatum: `**Dato destacado:** **${formatInteger(pobSinCobAbs)} jujeños** —el **${formatPercent(sinCobPct)}** de la población— dependen exclusivamente del sistema público de salud, una proporción que ${desvSinCob >= 0 ? `supera` : `es inferior a`} el promedio nacional y configura la principal demanda estructural sobre los hospitales públicos provinciales.`,

    sectionNarratives: {
      [sidCob]: `El sistema sanitario jujeño combina tres dimensiones de cobertura formal: **obra social o prepaga (${formatPercent(conObraPct)})**, **programas estatales (${formatPercent(programasPct)})** y **sistema público exclusivo (${formatPercent(sinCobPct)})**. La obra social provincial (empleo público), las obras sociales sindicales y prepagas privadas configuran la cobertura formal "primaria"; los programas estatales (PAMI para adultos mayores, planes nacionales y provinciales) actúan como segundo nivel; y el sistema público hospitalario provee atención universal a toda la población, con o sin cobertura formal.

Esta arquitectura tripartita es típica del modelo argentino y genera, en la práctica, una sobreutilización del sistema público por parte de población con coberturas formales en provincias donde la red de prestadores privados es limitada. En Jujuy, esto se traduce en una mayor presión efectiva sobre hospitales y centros de salud provinciales que la que sugieren los números de cobertura formal aisladamente.

La heterogeneidad social se refleja en estos accesos diferenciados: el empleo asalariado registrado garantiza cobertura formal vía obra social; el cuentapropismo informal, el empleo doméstico no registrado y el desempleo estructural quedan, en cambio, fuera del esquema.`,

      [sidDes]: `La distribución territorial de la cobertura sanitaria muestra brechas marcadas: el porcentaje de población sin cobertura formal oscila entre el **${formatDecimal(depMinSinCob.value, 1)}%** y el **${formatDecimal(depMaxSinCob.value, 1)}%** según el departamento, una diferencia de **${formatDecimal(brechaSinCob, 1)} puntos** que coincide con otras geografías de vulnerabilidad (informalidad laboral, déficit habitacional, menor escolarización).

Los departamentos con mayor peso de empleo público y/o de servicios formales tienden a presentar coberturas mayores. Los departamentos rurales, de altura o con mayor peso del cuentapropismo informal y del trabajo agrícola estacional concentran las proporciones más altas de población sin cobertura formal. **${depMaxSinCob.departamento.nombre}** lidera la categoría con **${formatDecimal(depMaxSinCob.value, 1)}%** de la población sin obra social ni programa estatal.

Estas brechas no son meramente estadísticas: implican diferencias reales de acceso al sistema sanitario. Las poblaciones sin cobertura formal dependen exclusivamente de la red pública provincial, que tiene capacidades desigualmente distribuidas en el territorio (concentración de especialistas y alta complejidad en el corredor central, primer nivel en zonas rurales con derivaciones complejas).`,

      [sidEdad]: `La cobertura por grupo etario refleja el ciclo vital del sistema sanitario argentino: los menores de 5 años y la franja 18-30 años presentan mayor proporción sin cobertura formal —los primeros por dependencia de la cobertura parental, los segundos por inserción laboral informal o desempleo estructural. La población de 65 años y más alcanza cobertura prácticamente universal vía PAMI, programa que actúa como red de contención cuasi universal en la tercera edad.

Este patrón etario es nacional, pero adquiere intensidad particular en provincias del NOA: la informalidad laboral juvenil es mayor que el promedio, lo que se traduce en cohortes de adultos jóvenes con cobertura formal limitada y dependencia del sistema público. A la inversa, el peso de PAMI en la cobertura de los mayores es particularmente alto.`,
    },

    nationalContext: `Argentina presenta una cobertura de salud (obra social/prepaga/plan estatal) del **${formatDecimal(CENSO_2022.pct_obra_social_nacional, 1)}%** según Censo 2022, dejando un **${formatDecimal(CENSO_2022.pct_solo_publica_nacional, 1)}%** dependiente exclusivamente del sistema público. Jujuy se ubica ${desvObra >= 0 ? `por encima` : `por debajo`} de esta media en cobertura formal — un patrón que se replica en el conjunto del NOA, donde las tasas de informalidad laboral y de empleo público son sistemáticamente diferentes a las del centro del país.

CABA y las grandes provincias industriales (Buenos Aires, Santa Fe, Córdoba, Mendoza) presentan tasas de cobertura formal superiores al promedio nacional, asociadas a mayor formalidad laboral, mayor peso de prepagas y mayor desarrollo de obras sociales sindicales fuertes. El NOA y el NEA, en cambio, presentan dependencia mayor del sistema público y de PAMI. La cobertura previsional muestra patrones más uniformes a nivel nacional gracias al efecto de las moratorias.

La presión sobre el sistema sanitario público jujeño es estructural: combina la cobertura primaria de la población sin obra social con la cobertura efectiva (atención real) de buena parte de la población formalmente cubierta cuando los prestadores privados son insuficientes en territorio.`,

    policyImplications: `El perfil sanitario de Jujuy plantea desafíos específicos para la política pública provincial. La alta dependencia del sistema público (efectiva, no sólo formal) configura una demanda estructural sobre la red provincial de salud que no se atenúa con el ciclo económico. Las brechas inter-departamentales (de **${formatDecimal(brechaSinCob, 1)} pp** entre extremos) demandan estrategias diferenciadas: en zonas con alta proporción sin cobertura formal, el sistema público debe sostener la totalidad de la demanda; en zonas más cubiertas, el rol público es más complementario.

El envejecimiento poblacional anticipado introduce una segunda tensión: en la próxima década, las cohortes que hoy están en la quinta y sexta década de vida ingresarán masivamente al sistema PAMI, aumentando la presión sobre infraestructura geriátrica, cuidados crónicos y rehabilitación. Esta transición, ya en curso a nivel nacional, tendrá ritmos provinciales heterogéneos según las dinámicas demográficas locales.

Por último, el indicador censal de cobertura es estrecho: mide la afiliación declarada, no la calidad ni la oportunidad del acceso real al sistema. Tener obra social no garantiza acceso a especialistas, a estudios complejos o a medicación crónica; tener cobertura PAMI no asegura disponibilidad efectiva de prestadores en zonas rurales. El análisis integral del sistema sanitario provincial requiere combinar el indicador censal con datos de utilización real (egresos hospitalarios, consultas de primer nivel, derivaciones), información que escapa al alcance de este informe pero que es indispensable para una política pública informada.`,
  });
  persist(slug, data, md);
}

// ═══════════════════════════════════════════════════════════════
// 4. Habitacional Hogares — tenencia (c6) + combustible (c4)
// ═══════════════════════════════════════════════════════════════
function generateHabitacionalHogares() {
  const slug = "habitacional-hogares";
  const folder = path.join(RAW_DIR, "4- Condiciones habitacionales de los hogares");
  const fileTen = path.join(folder, "c2022_jujuy_hogares_c6_10.xlsx");
  const fileComb = path.join(folder, "c2022_jujuy_hogares_c4_10.xlsx");
  const fileMat = path.join(folder, "c2022_jujuy_hogares_c1_10.xlsx");
  const fileAgua = path.join(folder, "c2022_jujuy_hogares_c2_10.xlsx");
  const fileCloaca = path.join(folder, "c2022_jujuy_hogares_c3_10.xlsx");
  const fileHab = path.join(folder, "c2022_jujuy_hogares_c5_10.xlsx");
  const fileNet = path.join(folder, "c2022_jujuy_hogares_c7_10.xlsx");

  const ten = extractCabaTable(readSheetRows(fileTen, "Cuadro 6.10"));
  const comb = extractCabaTable(readSheetRows(fileComb, "Cuadro 4.10"));
  const matRows = readSheetRows(fileMat, "Cuadro 1.10");
  const aguaRows = readSheetRows(fileAgua, "Cuadro 2.10");
  const cloacaRows = readSheetRows(fileCloaca, "Cuadro 3.10");
  const habRows = readSheetRows(fileHab, "Cuadro 5.10");
  const netRows = readSheetRows(fileNet, "Cuadro 7.10");
  const findTotal = (rows) => rows.find(r => r && typeof r[0] === "string" && /^Total$/i.test(r[0].trim()));
  const matTot = (findTotal(matRows) || []).map(toNumber);
  const aguaTot = (findTotal(aguaRows) || []).map(toNumber);
  const cloacaTot = (findTotal(cloacaRows) || []).map(toNumber);
  const habTot = (findTotal(habRows) || []).map(toNumber);
  const netTot = (findTotal(netRows) || []).map(toNumber);

  // Tenencia cols: 0=Código, 1=Departamento, 2=Total hogares, 3=Propia Total, 4=Escritura, 5=Boleto,
  //                6=Otra doc, 7=Sin doc, 8=Alquilada, 9=Cedida por trabajo, 10..=Otras
  const tTot = ten.total.map(toNumber);
  const totalHogares = tTot[2];
  const propiaPct = (tTot[3] / totalHogares) * 100;
  const alquiladaPct = (tTot[8] / totalHogares) * 100;

  // Combustible cols: 0=Código, 1=Departamento, 2=Total hogares, 3=Electricidad, 4=Gas red, 5=Zeppelin,
  //                   6=Gas garrafa, 7=Leña, 8=Otro
  const cTot = comb.total.map(toNumber);
  const gasRedHogPct = (cTot[4] / cTot[2]) * 100;

  // Internet hogares: col 2 = total con internet en vivienda
  const internetHogPct = (netTot[2] / netTot[1]) * 100;

  // Agua red pública: fila "Red pública (agua corriente)" col 1
  const aguaRedRow = aguaRows.find(r => r && typeof r[0] === "string" && /Red p[uú]blica/i.test(r[0]));
  const aguaRedPct = aguaRedRow ? (toNumber(aguaRedRow[1]) / aguaTot[1]) * 100 : 0;

  const builder = new ReportBuilder("poblacion-habitacional-hogares")
    .setMeta({
      title: "Condiciones Habitacionales de los Hogares",
      subcategory: "Hábitat Hogares",
      source: SOURCE,
      date: PERIOD,
    })
    .addKPI({ id: "total-hogares", label: "Total de hogares", value: totalHogares, formatted: formatCompact(totalHogares) })
    .addKPI({ id: "propia", label: "Hogares en vivienda propia", value: propiaPct, formatted: formatPercent(propiaPct) })
    .addKPI({ id: "alquilada", label: "Hogares en vivienda alquilada", value: alquiladaPct, formatted: formatPercent(alquiladaPct) })
    .addKPI({ id: "gas-red-hog", label: "Hogares con gas de red", value: gasRedHogPct, formatted: formatPercent(gasRedHogPct) })
    .addKPI({ id: "internet-hog", label: "Hogares con internet en la vivienda", value: internetHogPct, formatted: formatPercent(internetHogPct) })
    .addKPI({ id: "agua-red", label: "Hogares con agua de red pública", value: aguaRedPct, formatted: formatPercent(aguaRedPct) });

  // Chart: tenencia Jujuy (pie)
  const sectionTen = "Régimen de Tenencia";
  const sidTen = slugify(sectionTen);
  builder.addChart({
    id: "pie-tenencia",
    type: "pie",
    title: "Régimen de tenencia de la vivienda — Jujuy",
    sectionId: sidTen,
    sectionTitle: sectionTen,
    data: [
      { id: "Propia",                label: "Propia",                value: tTot[3] },
      { id: "Alquilada",             label: "Alquilada",             value: tTot[8] },
      { id: "Cedida por trabajo",    label: "Cedida por trabajo",    value: tTot[9] || 0 },
      { id: "Otras situaciones",     label: "Otras situaciones",     value: Math.max(0, totalHogares - (tTot[3] + tTot[8] + (tTot[9] || 0))) },
    ].filter(d => d.value > 0),
  });

  // Chart: % alquiler por departamento
  const sectionAlq = "Alquiler por Departamento";
  const sidAlq = slugify(sectionAlq);
  builder.addChart({
    id: "bar-alquiler-departamento",
    type: "bar",
    title: "% de hogares en vivienda alquilada por departamento",
    sectionId: sidAlq,
    sectionTitle: sectionAlq,
    data: ten.departamentos.map(({ departamento, row }) => {
      const r = row.map(toNumber);
      return { departamento: departamento.nombre, "Alquiler %": Math.round((r[8] / r[2]) * 1000) / 10 };
    }),
    config: { xAxis: "departamento", yAxis: "Alquiler %" },
  });

  // Ranking: top alquiler
  const ranked = ten.departamentos.map(({ departamento, row }) => {
    const r = row.map(toNumber);
    return { departamento, value: (r[8] / r[2]) * 100 };
  }).sort((a, b) => b.value - a.value);

  builder.addRanking({
    id: "rank-alquiler",
    title: "Departamentos con mayor % de alquiler",
    sectionId: sidAlq,
    items: ranked.map(r => ({
      name: r.departamento.nombre,
      value: Math.round(r.value * 10) / 10,
      municipioId: r.departamento.codigo,
    })),
    order: "desc",
  });

  // Map: % alquiler por departamento
  for (const { departamento, row } of ten.departamentos) {
    const r = row.map(toNumber);
    const pct = (r[8] / r[2]) * 100;
    builder.addMapItem({
      municipioId: departamento.codigo,
      municipioNombre: departamento.nombre,
      value: Math.round(pct * 10) / 10,
      label: `${formatPercent(pct)} alquiler`,
    });
  }

  // Chart: materiales de cubierta (hogares_c1) — usa la fila Total con cols 2..5
  const sectionMatHog = "Materiales del Piso (Hogares)";
  const sidMatHog = slugify(sectionMatHog);
  builder.addChart({
    id: "pie-piso-hogares",
    type: "pie",
    title: "Material predominante de los pisos — Hogares Jujuy",
    sectionId: sidMatHog,
    sectionTitle: sectionMatHog,
    data: [
      { id: "Cerámica/Mosaico/Madera", label: "Cerámica/Mosaico/Madera", value: matTot[2] },
      { id: "Carpeta/Contrapiso",      label: "Carpeta/Contrapiso",      value: matTot[3] },
      { id: "Tierra/Ladrillo suelto",  label: "Tierra/Ladrillo suelto",  value: matTot[4] },
      { id: "Otro material",           label: "Otro material",           value: matTot[5] },
    ].filter(d => d.value > 0),
  });

  // Chart: provisión del agua de hogares (procedencia) - top 4 categorías
  const sectionAguaHog = "Procedencia del Agua (Hogares)";
  const sidAguaHog = slugify(sectionAguaHog);
  const aguaHogCategorias = [];
  for (const r of aguaRows) {
    const c0 = String(r?.[0] || "").trim();
    if (!c0 || /^Total$/i.test(c0) || c0.startsWith("(") || c0.startsWith("Cuadro") || c0.startsWith("Censo")) continue;
    if (c0 === "Procedencia del agua") continue;
    const v = toNumber(r[1]);
    if (v != null && v > 0) aguaHogCategorias.push({ id: c0.slice(0, 38), label: c0.slice(0, 38), value: v });
    if (aguaHogCategorias.length >= 5) break;
  }
  builder.addChart({
    id: "pie-agua-hogares",
    type: "pie",
    title: "Procedencia del agua — Hogares Jujuy",
    sectionId: sidAguaHog,
    sectionTitle: sidAguaHog === "procedencia-del-agua-hogares" ? sectionAguaHog : sectionAguaHog,
    data: aguaHogCategorias,
  });

  // Chart: brecha digital hogares (hogares_c7) - internet en vivienda
  const sectionDigHog = "Brecha Digital (Hogares)";
  const sidDigHog = slugify(sectionDigHog);
  builder.addChart({
    id: "pie-internet-hogares",
    type: "pie",
    title: "Acceso a internet en la vivienda — Hogares Jujuy",
    sectionId: sidDigHog,
    sectionTitle: sectionDigHog,
    data: [
      { id: "Internet + dispositivo",   label: "Internet + dispositivo",   value: netTot[3] },
      { id: "Internet sin dispositivo", label: "Internet sin dispositivo", value: netTot[4] },
      { id: "Sin internet",             label: "Sin internet",             value: netTot[5] },
    ].filter(d => d.value > 0),
  });

  // Chart: saneamiento hogares (hogares_c3) — pie
  const sectionCloacaHog = "Saneamiento (Hogares)";
  const sidCloacaHog = slugify(sectionCloacaHog);
  builder.addChart({
    id: "pie-cloaca-hogares",
    type: "pie",
    title: "Ubicación del baño — Hogares Jujuy",
    sectionId: sidCloacaHog,
    sectionTitle: sectionCloacaHog,
    data: [
      { id: "Dentro de la vivienda",  label: "Dentro de la vivienda",  value: cloacaTot[3] },
      { id: "Fuera de la vivienda",   label: "Fuera de la vivienda",   value: cloacaTot[4] },
      { id: "No tiene baño",          label: "No tiene baño",          value: cloacaTot[5] },
    ].filter(d => d.value > 0),
  });

  // Chart: cantidad de habitaciones por hogar (hogares_c5) — pie
  const sectionHabHog = "Cantidad de Habitaciones (Hogares)";
  const sidHabHog = slugify(sectionHabHog);
  const habHogCategorias = [];
  for (const r of habRows) {
    const c0 = String(r?.[0] || "").trim();
    if (!c0 || /^Total$/i.test(c0) || c0.startsWith("(") || c0.startsWith("Cuadro") || c0.startsWith("Censo") || c0 === "Cantidad de habitaciones") continue;
    const v = toNumber(r[1]);
    if (v != null && v > 0) habHogCategorias.push({ id: c0.slice(0, 20), label: c0.slice(0, 20), value: v });
    if (habHogCategorias.length >= 8) break;
  }
  builder.addChart({
    id: "pie-habitaciones-hogares",
    type: "pie",
    title: "Cantidad de habitaciones por hogar — Jujuy",
    sectionId: sidHabHog,
    sectionTitle: sectionHabHog,
    data: habHogCategorias,
  });

  // Chart: cantidad de baños por hogar (hogares_c5 fila Total cols 2..5)
  const sectionBanos = "Cantidad de Baños por Hogar";
  const sidBanos = slugify(sectionBanos);
  builder.addChart({
    id: "pie-banos",
    type: "pie",
    title: "Cantidad de baños por hogar — Jujuy",
    sectionId: sidBanos,
    sectionTitle: sectionBanos,
    data: [
      { id: "1 baño",        label: "1 baño",        value: habTot[2] },
      { id: "2 baños",       label: "2 baños",       value: habTot[3] },
      { id: "3 o más baños", label: "3 o más baños", value: habTot[4] },
      { id: "No tiene baño", label: "No tiene baño", value: habTot[5] },
    ].filter(d => d.value > 0),
  });

  const data = builder.build();

  // ─── Derivados para narrativa ejecutiva ───
  const tamanoHogarPromedio = totalHogares > 0 ? 811611 / totalHogares : 0;
  const desvTamHogar = tamanoHogarPromedio - CENSO_2022.tamanoHogarPromedioNacional;
  const pctHogaresJujuyNac = (totalHogares / CENSO_2022.hogaresArgentina) * 100;
  const desvGasRed = gasRedHogPct - CENSO_2022.pct_gas_red_nacional;
  const desvAguaRed = aguaRedPct - CENSO_2022.pct_agua_red_nacional;
  // Brechas alquiler por departamento
  const sortedAlqDes = [...ranked]; // ya ordenado desc por % alquiler
  const depMaxAlq = sortedAlqDes[0];
  const depMinAlq = sortedAlqDes[sortedAlqDes.length - 1];
  const brechaAlquiler = depMaxAlq.value - depMinAlq.value;

  // Combustible con garrafa
  const garrafaHogPct = (cTot[6] / cTot[2]) * 100;
  const lenaHogPct = (cTot[7] / cTot[2]) * 100;

  const md = buildReportMd({
    ...data,
    intro: `Jujuy registra **${formatInteger(totalHogares)} hogares** en 2022, que concentran el **${formatDecimal(pctHogaresJujuyNac, 2)}%** del total nacional. El tamaño promedio del hogar (**${formatDecimal(tamanoHogarPromedio, 1)} personas**) ${desvTamHogar > 0 ? `supera` : `se ubica`} ${Math.abs(desvTamHogar) < 0.1 ? `cerca del` : ''} promedio nacional (${formatDecimal(CENSO_2022.tamanoHogarPromedioNacional, 1)}). La cobertura de servicios básicos es heterogénea: **${formatPercent(aguaRedPct)}** con agua de red pública, **${formatPercent(gasRedHogPct)}** con gas de red y **${formatPercent(internetHogPct)}** con internet en la vivienda.`,

    executiveSummary: `Los **${formatInteger(totalHogares)} hogares** jujeños constituyen el **${formatDecimal(pctHogaresJujuyNac, 2)}%** del stock nacional. El tamaño promedio del hogar (**${formatDecimal(tamanoHogarPromedio, 1)} personas**) es ${Math.abs(desvTamHogar) < 0.2 ? `prácticamente equivalente al` : `${desvTamHogar > 0 ? `superior al` : `inferior al`}`} promedio nacional (${formatDecimal(CENSO_2022.tamanoHogarPromedioNacional, 1)}) — una señal de transición demográfica avanzada compatible con la fecundidad provincial declinante pero todavía superior a la del centro del país. El régimen de tenencia muestra una estructura dominada por la propiedad (**${formatPercent(propiaPct)}**), seguida por el alquiler (**${formatPercent(alquiladaPct)}**) y por cesiones por trabajo o vivienda prestada como categorías residuales.

La infraestructura básica por hogar exhibe un patrón típico del NOA: **cobertura de agua de red** alta (**${formatPercent(aguaRedPct)}**, ${desvAguaRed >= 0 ? `por encima` : `por debajo`} del promedio nacional de **${formatDecimal(CENSO_2022.pct_agua_red_nacional, 1)}%**) frente a **cobertura de gas de red** sustancialmente menor (**${formatPercent(gasRedHogPct)}** vs. **${formatDecimal(CENSO_2022.pct_gas_red_nacional, 1)}%** nacional, un desvío de **${formatDecimal(desvGasRed, 1)} pp**). Esta asimetría no es contingente sino estructural: refleja décadas de inversión diferencial entre las redes de agua y sanitaria (más capilares y subsidiadas por su impacto sanitario directo) y la red de gasoductos troncales (con umbrales mínimos de rentabilidad económica que excluyen zonas de baja densidad).

La dependencia del **gas en garrafa (${formatPercent(garrafaHogPct)})** y la presencia de **leña (${formatPercent(lenaHogPct)})** como combustible cocción configuran el núcleo de pobreza energética doméstica: hogares que pagan un costo unitario sustancialmente mayor por la energía útil que consumen y quedan expuestos a faltantes estacionales y volatilidad de precios mayorista.

Las brechas territoriales de alquiler son significativas: oscilan entre el **${formatDecimal(depMinAlq.value, 1)}%** y el **${formatDecimal(depMaxAlq.value, 1)}%** según el departamento, reflejando la heterogeneidad entre mercados habitacionales locales (capital con mercado de alquiler activo vs. departamentos rurales con propiedad cuasi-universal pero a menudo sin escrituración formal).`,

    keyFindings: [
      `**Estructura de tenencia:** **${formatPercent(propiaPct)}** propietaria y **${formatPercent(alquiladaPct)}** inquilina — una composición típica del interior con peso significativo de la propiedad, frecuentemente con regularización dominial pendiente.`,
      `**Tamaño del hogar:** **${formatDecimal(tamanoHogarPromedio, 1)} personas/hogar** vs. **${formatDecimal(CENSO_2022.tamanoHogarPromedioNacional, 1)}** nacional — ${Math.abs(desvTamHogar) < 0.1 ? `prácticamente alineado.` : `un desvío de ${formatDecimal(desvTamHogar, 1)} personas que refleja transición demográfica en curso.`}`,
      `**Brecha agua-gas:** cobertura de agua de red (**${formatPercent(aguaRedPct)}**) muy superior a la de gas de red (**${formatPercent(gasRedHogPct)}**), patrón típico del NOA con desvío de **${formatDecimal(desvGasRed, 1)} pp** vs. media nacional en gas.`,
      `**Pobreza energética:** **${formatPercent(garrafaHogPct)}** de los hogares cocina con garrafa y **${formatPercent(lenaHogPct)}** con leña, alternativas más caras por unidad de energía útil que el gas natural.`,
      `**Conectividad digital del hogar:** **${formatPercent(internetHogPct)}** con internet en la vivienda — base creciente para teletrabajo, educación virtual y trámites en línea.`,
      `**Brecha territorial en alquiler:** entre **${formatDecimal(depMinAlq.value, 1)}%** (${depMinAlq.departamento.nombre}) y **${formatDecimal(depMaxAlq.value, 1)}%** (${depMaxAlq.departamento.nombre}) — una diferencia de **${formatDecimal(brechaAlquiler, 1)} pp** que refleja mercados habitacionales locales heterogéneos.`,
    ],

    keyDatum: `**Dato destacado:** Jujuy tiene **${formatInteger(totalHogares)} hogares** con un tamaño promedio de **${formatDecimal(tamanoHogarPromedio, 1)} personas por hogar**, valor que confirma una transición demográfica en curso pero aún más rezagada que la del centro del país (${formatDecimal(CENSO_2022.tamanoHogarPromedioNacional, 1)} a nivel nacional).`,

    sectionNarratives: {
      [sidTen]: `La estructura de tenencia muestra una composición típica del interior: **${formatPercent(propiaPct)}** propietaria, **${formatPercent(alquiladaPct)}** inquilina, con fracciones menores de cesión por trabajo, vivienda prestada u otras situaciones. El alto peso de la propiedad refleja una característica histórica del NOA y de las provincias menos urbanizadas: el acceso al suelo ha sido relativamente accesible (especialmente en zonas periurbanas y rurales) y la cultura de la "casa propia" mantiene fuerza como horizonte familiar.

Sin embargo, la categoría "propiedad" esconde una heterogeneidad significativa: viviendas con escritura formal coexisten con viviendas adquiridas por boleto, ocupación con permiso o sin él, herencia familiar sin sucesión formal. Esta regularización dominial pendiente es un déficit institucional persistente con efectos concretos: limita acceso al crédito hipotecario, dificulta planes formales de mejora habitacional y vulnera la seguridad jurídica del hogar.

El segmento inquilino es minoritario pero socialmente relevante: en una provincia donde la propiedad propia es la norma, los hogares inquilinos suelen ser jóvenes en formación, trabajadores migrantes desde otras zonas o departamentos, o sectores socioeconómicos con menor capacidad de capitalización.`,

      [sidAlq]: `La distribución territorial del alquiler muestra brechas marcadas: entre el **${formatDecimal(depMinAlq.value, 1)}%** y el **${formatDecimal(depMaxAlq.value, 1)}%** según el departamento, una diferencia de **${formatDecimal(brechaAlquiler, 1)} puntos** que refleja la heterogeneidad de los mercados habitacionales locales. **${depMaxAlq.departamento.nombre}** lidera la categoría con la mayor proporción de hogares en alquiler, en línea con su perfil urbano y de mercado de servicios formal.

Los departamentos del Ramal y de la Puna presentan, en cambio, alquileres marginales: predomina la propiedad familiar, frecuentemente sin escritura formal. Esta heterogeneidad territorial debería leerse antes como reflejo de mercados habitacionales muy distintos —centros urbanos con flujo migratorio interno vs. comunidades estables con propiedad ancestral o autoconstruida— que como un único indicador habitacional homogéneo.`,

      [sidMatHog]: `La calidad constructiva medida por el material predominante del piso muestra que la enorme mayoría de los hogares jujeños reside en condiciones adecuadas (cerámica, mosaico, madera o equivalentes). La fracción minoritaria con pisos de carpeta, contrapiso, tierra o ladrillo suelto identifica núcleos de déficit habitacional crítico, generalmente concentrados en zonas rurales aisladas, barrios populares de la periferia urbana y asentamientos informales. Esta dimensión es un proxy aceptado de pobreza estructural y suele coincidir con otros indicadores de vulnerabilidad (acceso a servicios básicos, hacinamiento, ingresos del hogar).`,

      [sidAguaHog]: `La cobertura de agua corriente por red pública alcanza al **${formatPercent(aguaRedPct)}** de los hogares jujeños, ${desvAguaRed >= 0 ? `por encima` : `por debajo`} del promedio nacional (**${formatDecimal(CENSO_2022.pct_agua_red_nacional, 1)}%**). Las fracciones que dependen de perforaciones, transporte por cisterna o agua de lluvia se concentran en zonas rurales dispersas y en algunos asentamientos periurbanos sin infraestructura consolidada.

A diferencia del gas, la red de agua tiene una capilaridad mucho mayor: la presión sanitaria y los programas nacionales de extensión han sostenido coberturas elevadas incluso en zonas de baja densidad. Persiste sin embargo la cuestión —no medida en este cuadro— de la **calidad** del agua provista: presión, continuidad, calidad química, particularmente relevante en zonas con presencia geológica de arsénico u otros contaminantes naturales.`,

      [sidDigHog]: `La brecha digital a nivel hogar combina dos dimensiones: hogares sin conexión a internet y hogares conectados pero sin dispositivos apropiados. El **${formatPercent(internetHogPct)}** declara contar con internet en la vivienda; el resto, total o parcialmente, queda fuera del entorno digital funcional.

Este indicador es particularmente sensible post-pandemia: la virtualización masiva de educación, trabajo y servicios públicos puso en evidencia los costos del subequipamiento digital. Las brechas digitales por departamento replican otras brechas socioeconómicas y configuran una desigualdad estructural creciente.`,

      [sidCloacaHog]: `La inmensa mayoría de los hogares jujeños cuenta con baño dentro de la vivienda. La fracción residual sin baño identifica déficits sanitarios críticos concentrados en zonas rurales aisladas. La conexión a red cloacal pública —dimensión vinculada pero no idéntica— suele ser menor que la disponibilidad de baño: muchos hogares con baño dentro de la vivienda descargan a cámara séptica o pozo ciego en lugar de a cloaca pública, situación común en zonas periurbanas sin red consolidada y consistente con el promedio nacional de **${formatDecimal(CENSO_2022.pct_cloaca_nacional, 1)}%** con cloaca.`,

      [sidHabHog]: `La distribución de hogares según cantidad de habitaciones refleja la diversidad de tipologías habitacionales y de tamaños de los hogares. Los hogares con 2-4 habitaciones predominan, reflejando la vivienda típica familiar. Los hogares con 1 habitación (monoambientes, viviendas precarias, situaciones de hacinamiento estructural) identifican un segmento de vulnerabilidad cuya relación entre cantidad de habitaciones y miembros del hogar configura el "índice de hacinamiento" tradicional.`,

      [sidBanos]: `La amplia mayoría de los hogares dispone de un solo baño. La fracción con 2 o más baños se concentra en viviendas más amplias y en hogares de mayor nivel socioeconómico, situación que es proxy aceptado de calidad habitacional. La fracción sin baño —indicador crítico de déficit— se ubica en zonas rurales y barrios populares con infraestructura básica deficitaria.`,
    },

    nationalContext: `El stock de **${formatInteger(totalHogares)} hogares** jujeños representa el **${formatDecimal(pctHogaresJujuyNac, 2)}%** del total nacional de **${formatInteger(CENSO_2022.hogaresArgentina)}**. El tamaño promedio del hogar (**${formatDecimal(tamanoHogarPromedio, 1)} personas**) se compara con un promedio nacional de **${formatDecimal(CENSO_2022.tamanoHogarPromedioNacional, 1)}** — proporción similar pero ligeramente mayor, en línea con la mayor fecundidad y la transición demográfica más tardía del NOA. El centro del país (CABA, Buenos Aires, Córdoba, Santa Fe) presenta tamaños promedio menores, asociados a hogares unipersonales y de pareja sin hijos más frecuentes.

En infraestructura básica, Jujuy muestra el patrón típico del NOA: cobertura de agua de red (**${formatPercent(aguaRedPct)}**) cercana al promedio nacional (**${formatDecimal(CENSO_2022.pct_agua_red_nacional, 1)}%**) pero brecha significativa en gas de red (**${formatPercent(gasRedHogPct)}** vs. **${formatDecimal(CENSO_2022.pct_gas_red_nacional, 1)}%** nacional). Esta brecha refleja la geografía de la red troncal de gasoductos: provincias con yacimientos o muy cercanas a la red (Buenos Aires, Mendoza, Neuquén) superan el 80-90% de cobertura, mientras el NOA y la Patagonia austral arrastran déficits estructurales.

La conectividad digital sigue el patrón nacional con leve rezago: las jurisdicciones más urbanizadas concentran las mayores tasas de penetración. La cobertura de saneamiento (baño dentro de la vivienda) es casi universal en Jujuy y en el promedio nacional, pero la conexión a cloaca pública es sustancialmente menor (**${formatDecimal(CENSO_2022.pct_cloaca_nacional, 1)}%** nacional), con presencia importante de cámaras sépticas y pozos ciegos.`,

    policyImplications: `El perfil habitacional de los hogares jujeños señala tensiones específicas para la política pública. Primero, la asimetría entre redes: la cobertura de agua y la de gas siguen lógicas inversoras muy diferentes, lo que genera un déficit estructural de gas concentrado en zonas de baja densidad. La política pública en gas suele combinar inversión en redes donde es viable, subsidios al consumo (garrafa social) donde no lo es y, prospectivamente, alternativas tecnológicas (electrificación residencial, energías renovables descentralizadas) en zonas remotas.

Segundo, la regularización dominial pendiente: el alto peso de la "propiedad" en la tenencia esconde una proporción significativa de viviendas sin escritura formal. Esta dimensión limita el acceso al crédito hipotecario, dificulta planes formales de mejora habitacional y mantiene un piso de inseguridad jurídica que afecta especialmente a hogares de menores ingresos. Los programas provinciales y nacionales de regularización han avanzado pero el déficit acumulado es considerable.

Tercero, la dimensión que escapa al Censo: la **calidad efectiva** de los servicios prestados (presión y continuidad del agua, calidad química, frecuencia y costo de las garrafas, ancho de banda efectivo de internet). La óptica binaria "tiene/no tiene" subestima problemas reales de calidad que afectan a poblaciones formalmente cubiertas. Cualquier política integral de hábitat doméstico requiere combinar el indicador censal con relevamientos operativos complementarios, sensibles a la heterogeneidad territorial muy marcada de la provincia.`,
  });
  persist(slug, data, md);
}

// ═══════════════════════════════════════════════════════════════
// 5. Viviendas — stock y tipo
// ═══════════════════════════════════════════════════════════════
function generateViviendas() {
  const slug = "viviendas";
  const folder = path.join(RAW_DIR, "5- Viviendas");
  const fileC1 = path.join(folder, "c2022_jujuy_vivienda_c1_10.xlsx");
  const fileC2 = path.join(folder, "c2022_jujuy_vivienda_c2_10.xlsx");
  const fileC3 = path.join(folder, "c2022_jujuy_vivienda_c3_10.xlsx");

  const c1 = extractCabaTable(readSheetRows(fileC1, "Cuadro 1.10"));
  const c2 = extractCabaTable(readSheetRows(fileC2, "Cuadro 2.10"));
  const c3 = extractCabaTable(readSheetRows(fileC3, "Cuadro 3.10"));

  // c1 cols: 0=Código, 1=Departamento, 2=Total viviendas, 3=Particulares, 4=Hay personas, 5=Vacaciones,
  //          6=Oficina, 7=Alquiler/venta, 8=Construcción, 9=Habit.no se censó, 10=Otra, 11=Colectivas
  const t1 = c1.total.map(toNumber);
  const totalViv = t1[2];
  const particulares = t1[3];
  const colectivas = t1[11];
  const conPersonas = t1[4];
  const desocupadas = totalViv - conPersonas - colectivas;
  const desocupadasPct = (desocupadas / totalViv) * 100;
  const colectivasPct = (colectivas / totalViv) * 100;

  // c3 cols: 0=Código, 1=Departamento, 2=Total vivs partic., 3=Casa, 4=Rancho, 5=Casilla,
  //          6=Departamento, 7=Pieza inquilinato, 8=Local no constr., 9=Móvil
  const t3 = c3.total.map(toNumber);
  const deptoPct = (t3[6] / t3[2]) * 100;

  // c2 cols: 0=Código, 1=Departamento, 2=Total viv. ocup., 3=Total hogares, 4=Viv c/1 hogar, 5=Hog en viv c/1,
  //          6=Viv c/2 hogares, 7=Hog en viv c/2, 8=Viv c/3+ hogares, 9=Hog en viv c/3+
  const t2 = c2.total.map(toNumber);
  const vivOcupTot = t2[2];
  const vivCon2Hog = t2[6];
  const vivCon3Mas = t2[8];
  const hacinamientoPct = ((vivCon2Hog + vivCon3Mas) / vivOcupTot) * 100;

  const builder = new ReportBuilder("poblacion-viviendas")
    .setMeta({
      title: "Stock Habitacional y Viviendas",
      subcategory: "Viviendas",
      source: SOURCE,
      date: PERIOD,
    })
    .addKPI({ id: "total-viv", label: "Total de viviendas", value: totalViv, formatted: formatCompact(totalViv) })
    .addKPI({ id: "particulares", label: "Viviendas particulares", value: particulares, formatted: formatCompact(particulares) })
    .addKPI({ id: "depto-pct", label: "Departamentos", value: deptoPct, formatted: formatPercent(deptoPct), comparison: "del stock particular" })
    .addKPI({ id: "desocupadas", label: "Viviendas desocupadas", value: desocupadasPct, formatted: formatPercent(desocupadasPct), status: desocupadasPct > 12 ? "warning" : undefined })
    .addKPI({ id: "hacinamiento-viv", label: "Viviendas con 2+ hogares", value: hacinamientoPct, formatted: formatPercent(hacinamientoPct), status: hacinamientoPct > 2 ? "warning" : undefined, comparison: "hacinamiento residencial" });

  // Chart: tipo vivienda Jujuy (pie)
  const sectionTipo = "Tipo de Vivienda";
  const sidTipo = slugify(sectionTipo);
  builder.addChart({
    id: "pie-tipo-vivienda",
    type: "pie",
    title: "Tipo de vivienda particular — Jujuy",
    sectionId: sidTipo,
    sectionTitle: sectionTipo,
    data: [
      { id: "Departamento",   label: "Departamento",   value: t3[6] },
      { id: "Casa",           label: "Casa",           value: t3[3] },
      { id: "Pieza/Inquilinato", label: "Pieza/Inquilinato", value: t3[7] },
      { id: "Rancho/Casilla", label: "Rancho/Casilla", value: t3[4] + t3[5] },
      { id: "Otros",          label: "Otros",          value: t3[8] + t3[9] },
    ].filter(d => d.value > 0),
  });

  // Chart: desocupación por departamento
  const sectionDes = "Desocupación de Viviendas por Departamento";
  const sidDes = slugify(sectionDes);
  builder.addChart({
    id: "bar-desoc-departamento",
    type: "bar",
    title: "% de viviendas desocupadas por departamento",
    sectionId: sidDes,
    sectionTitle: sectionDes,
    data: c1.departamentos.map(({ departamento, row }) => {
      const r = row.map(toNumber);
      const tot = r[2];
      const conPers = r[4];
      const col = r[11];
      const desoc = tot - conPers - col;
      return { departamento: departamento.nombre, "Desocupadas %": Math.round((desoc / tot) * 1000) / 10 };
    }),
    config: { xAxis: "departamento", yAxis: "Desocupadas %" },
  });

  // Map: % desocupación por departamento
  for (const { departamento, row } of c1.departamentos) {
    const r = row.map(toNumber);
    const desoc = r[2] - r[4] - r[11];
    const pct = (desoc / r[2]) * 100;
    builder.addMapItem({
      municipioId: departamento.codigo,
      municipioNombre: departamento.nombre,
      value: Math.round(pct * 10) / 10,
      label: `${formatPercent(pct)} desocupadas`,
    });
  }

  // Chart: hogares por vivienda (Jujuy, pie)
  const sectionHac = "Hogares por Vivienda";
  const sidHac = slugify(sectionHac);
  builder.addChart({
    id: "pie-hogares-vivienda",
    type: "pie",
    title: "Cantidad de hogares por vivienda — Jujuy",
    sectionId: sidHac,
    sectionTitle: sectionHac,
    data: [
      { id: "1 hogar",        label: "1 hogar",        value: t2[4] },
      { id: "2 hogares",      label: "2 hogares",      value: t2[6] },
      { id: "3 o más hogares", label: "3 o más hogares", value: t2[8] },
    ].filter(d => d.value > 0),
  });

  // Chart: hacinamiento por departamento (% viv con 2+ hogares)
  const sectionHacDepartamento = "Hacinamiento Residencial por Departamento";
  const sidHacCom = slugify(sectionHacDepartamento);
  builder.addChart({
    id: "bar-hacinamiento-departamento",
    type: "bar",
    title: "Viviendas con 2 o más hogares por departamento",
    sectionId: sidHacCom,
    sectionTitle: sectionHacDepartamento,
    data: c2.departamentos.map(({ departamento, row }) => {
      const r = row.map(toNumber);
      const tot = r[2];
      const hac = (r[6] || 0) + (r[8] || 0);
      return { departamento: departamento.nombre, "Hacinamiento %": tot ? Math.round((hac / tot) * 1000) / 10 : 0 };
    }),
    config: { xAxis: "departamento", yAxis: "Hacinamiento %" },
  });

  // Ranking: top hacinamiento
  const rankedHac = c2.departamentos.map(({ departamento, row }) => {
    const r = row.map(toNumber);
    return { departamento, value: r[2] ? (((r[6] || 0) + (r[8] || 0)) / r[2]) * 100 : 0 };
  }).sort((a, b) => b.value - a.value);

  builder.addRanking({
    id: "rank-hacinamiento",
    title: "Departamentos con mayor hacinamiento residencial",
    sectionId: sidHacCom,
    items: rankedHac.map(r => ({
      name: r.departamento.nombre,
      value: Math.round(r.value * 100) / 100,
      municipioId: r.departamento.codigo,
    })),
    order: "desc",
  });

  const data = builder.build();

  // ─── Derivados para narrativa ejecutiva ───
  const casaPct = (t3[3] / t3[2]) * 100;
  const ranchoCasillaPct = ((t3[4] + t3[5]) / t3[2]) * 100;
  const piezaInquilPct = (t3[7] / t3[2]) * 100;
  const pctViviendasJujuyNac = (totalViv / CENSO_2022.viviendasArgentina) * 100;
  const sortedDesoc = c1.departamentos.map(({ departamento, row }) => {
    const r = row.map(toNumber);
    const tot = r[2];
    const desoc = tot - r[4] - r[11];
    return { nombre: departamento.nombre, pct: (desoc / tot) * 100 };
  }).sort((a, b) => b.pct - a.pct);
  const depMaxDesoc = sortedDesoc[0];
  const depMinDesoc = sortedDesoc[sortedDesoc.length - 1];
  // Hacinamiento extremo
  const depMaxHac = rankedHac[0];
  const depMinHac = rankedHac[rankedHac.length - 1];

  const md = buildReportMd({
    ...data,
    intro: `El stock habitacional de Jujuy suma **${formatInteger(totalViv)} viviendas**, el **${formatDecimal(pctViviendasJujuyNac, 2)}%** del total nacional. **${formatPercent(casaPct)}** son casas y **${formatPercent(deptoPct)}** departamentos, configurando un paisaje habitacional dominado por la vivienda unifamiliar. Una fracción del **${formatPercent(desocupadasPct)}** figura como desocupada, y el **${formatPercent(hacinamientoPct)}** de las viviendas ocupadas aloja a 2 o más hogares — el principal indicador censal de hacinamiento residencial.`,

    executiveSummary: `Las **${formatInteger(totalViv)} viviendas** registradas en Jujuy en 2022 representan el **${formatDecimal(pctViviendasJujuyNac, 2)}%** del stock habitacional nacional (**${formatInteger(CENSO_2022.viviendasArgentina)}**). La composición tipológica muestra el predominio claro de la **casa (${formatPercent(casaPct)})** sobre el **departamento (${formatPercent(deptoPct)})**, un patrón típico de provincias del NOA y opuesto al de CABA, Rosario o el AMBA, donde el departamento es la tipología dominante. Las formas precarias —rancho, casilla y pieza en inquilinato— representan en conjunto **${formatDecimal(ranchoCasillaPct + piezaInquilPct, 1)}%** del stock, fracción minoritaria pero crítica que identifica núcleos de déficit habitacional severo.

La **desocupación habitacional (${formatPercent(desocupadasPct)})** combina varias situaciones heterogéneas: viviendas en alquiler/venta sin ocupar al momento del Censo, segundas residencias (particularmente en zonas turísticas como Tilcara, Humahuaca o las Yungas), viviendas en construcción y stock potencialmente subutilizado. La distribución territorial es marcada: oscila entre el **${formatDecimal(depMinDesoc.pct, 1)}%** en ${depMinDesoc.nombre} y el **${formatDecimal(depMaxDesoc.pct, 1)}%** en ${depMaxDesoc.nombre}. Las zonas con mayor desocupación suelen ser las turísticas de la Quebrada, donde el peso de segundas residencias y alquileres temporarios es estructural.

El **hacinamiento residencial** —viviendas particulares ocupadas que alojan a 2 o más hogares— afecta al **${formatPercent(hacinamientoPct)}** del stock ocupado. Aunque la fracción agregada parece moderada, los hogares involucrados experimentan condiciones de vida sustancialmente más críticas: comparten cocina, baño y espacios comunes con otra unidad familiar, frecuentemente por imposibilidad económica de acceso a vivienda propia o por subdivisión informal del stock existente. Las brechas inter-departamentales son significativas: ${depMaxHac.departamento.nombre} lidera con **${formatDecimal(depMaxHac.value, 1)}%** de hacinamiento, contra **${formatDecimal(depMinHac.value, 1)}%** en ${depMinHac.departamento.nombre}.

La calidad del stock —medida indirectamente por tipo de vivienda y, en informes complementarios, por materiales y servicios— configura el cuadro estructural sobre el que opera la política habitacional provincial.`,

    keyFindings: [
      `**Predominio de la casa unifamiliar:** **${formatPercent(casaPct)}** del stock son casas vs. **${formatPercent(deptoPct)}** departamentos — patrón típico de provincias menos densamente urbanizadas que las metropolitanas.`,
      `**Vivienda precaria minoritaria pero crítica:** **${formatDecimal(ranchoCasillaPct, 1)}%** rancho/casilla y **${formatDecimal(piezaInquilPct, 1)}%** pieza en inquilinato — núcleos de déficit habitacional severo.`,
      `**Desocupación habitacional:** **${formatPercent(desocupadasPct)}** del stock figura sin ocupación, combinando alquiler/venta, segundas residencias y stock potencialmente subutilizado.`,
      `**Brecha territorial en desocupación:** entre **${formatDecimal(depMinDesoc.pct, 1)}%** (${depMinDesoc.nombre}) y **${formatDecimal(depMaxDesoc.pct, 1)}%** (${depMaxDesoc.nombre}) — zonas turísticas de la Quebrada concentran las mayores tasas.`,
      `**Hacinamiento residencial:** **${formatPercent(hacinamientoPct)}** de las viviendas ocupadas aloja 2+ hogares; ${depMaxHac.departamento.nombre} lidera con **${formatDecimal(depMaxHac.value, 1)}%**.`,
      `**Peso provincial del stock:** Jujuy concentra el **${formatDecimal(pctViviendasJujuyNac, 2)}%** del stock habitacional nacional, ligeramente por debajo de su peso poblacional, consecuencia de hogares más numerosos.`,
    ],

    keyDatum: `**Dato destacado:** sobre **${formatInteger(totalViv)} viviendas**, **${formatPercent(desocupadasPct)}** figura como desocupada y **${formatPercent(hacinamientoPct)}** aloja a más de un hogar — un déficit habitacional doble (stock ocioso por un lado, sobreutilizado por otro) que es uno de los grandes problemas estructurales del NOA.`,

    sectionNarratives: {
      [sidTipo]: `El paisaje habitacional de Jujuy está dominado por la **casa unifamiliar (${formatPercent(casaPct)})**, complemento del **departamento (${formatPercent(deptoPct)})** —concentrado este último en la conurbación capitalina y en Palpalá— y, en proporción minoritaria pero socialmente relevante, las formas precarias: ranchos y casillas (**${formatDecimal(ranchoCasillaPct, 1)}%**) y piezas en inquilinato (**${formatDecimal(piezaInquilPct, 1)}%**).

La predominancia de la casa refleja la estructura urbana relativamente baja en altura de la mayoría de las ciudades jujeñas, con desarrollos verticales recientes concentrados en pocos barrios de la capital. Las formas precarias se distribuyen entre asentamientos populares de la periferia urbana (San Salvador, San Pedro, Palpalá) y zonas rurales con vivienda autoconstruida tradicional.

El rancho —tipología tradicional del altiplano y la quebrada construida con adobe, piedra y techo de paja o caña— mantiene presencia residual en algunas zonas rurales: aunque culturalmente arraigado, en términos censales clasifica como vivienda precaria por sus materiales y sus prestaciones (aislamiento térmico limitado, dificultad para incorporar servicios modernos). El debate entre la preservación cultural y la mejora habitacional permea cualquier política específica sobre esta tipología.`,

      [sidDes]: `La **desocupación habitacional (${formatPercent(desocupadasPct)})** combina situaciones cualitativamente muy distintas: viviendas en stock para alquiler o venta no ocupadas al momento del Censo, segundas residencias (particularmente en zonas turísticas), viviendas en construcción y bienes inmuebles potencialmente subutilizados. La distribución territorial es muy marcada: las tasas más altas corresponden a **${depMaxDesoc.nombre}** (**${formatDecimal(depMaxDesoc.pct, 1)}%**) y las más bajas a **${depMinDesoc.nombre}** (**${formatDecimal(depMinDesoc.pct, 1)}%**).

En zonas turísticas (Quebrada de Humahuaca, parte del corredor Yungas) la desocupación responde mayormente a segundas residencias y alquileres temporarios; en zonas urbanas, a stock en mercado. La política habitacional ha discutido históricamente la posibilidad de gravar o desincentivar la vivienda ociosa, debate que choca con las dificultades operativas de discriminar entre las situaciones cualitativamente distintas que componen el agregado censal.`,

      [sidHac]: `La gran mayoría de las viviendas particulares ocupadas aloja un único hogar. La fracción con **2 o 3+ hogares** —si bien agregadamente moderada (**${formatPercent(hacinamientoPct)}**)— concentra situaciones de hacinamiento residencial y de subdivisión informal del stock. Los hogares involucrados comparten cocina, baño y espacios comunes con otra unidad familiar, una situación que tiene consecuencias directas sobre privacidad, salud mental y desarrollo infantil.

El hacinamiento residencial es indicador robusto de déficit habitacional cuantitativo: refleja la imposibilidad de hogares jóvenes en formación o de hogares migrantes de acceder a vivienda propia o alquilada, derivando en convivencias forzadas con la familia extensa o con otros hogares.`,

      [sidHacCom]: `La distribución territorial del hacinamiento residencial muestra brechas significativas: **${depMaxHac.departamento.nombre}** lidera con el **${formatDecimal(depMaxHac.value, 1)}%** de viviendas multihogar, mientras **${depMinHac.departamento.nombre}** registra solo el **${formatDecimal(depMinHac.value, 1)}%**. La geografía del hacinamiento coincide con la geografía de otros indicadores de vulnerabilidad estructural: zonas con mayor precariedad de servicios, menor escolarización, mayor informalidad laboral y/o presencia de asentamientos populares consolidados.

Esta concentración territorial debería ser un input directo para focalización de políticas habitacionales: ampliación de oferta de vivienda accesible, programas de regularización dominial y de mejoramiento de barrios, y articulación con planes nacionales (Pro.Cre.Ar y similares) que demandan capacidad institucional de gestión local.`,
    },

    nationalContext: `Las **${formatInteger(totalViv)} viviendas** de Jujuy representan el **${formatDecimal(pctViviendasJujuyNac, 2)}%** del stock habitacional nacional (**${formatInteger(CENSO_2022.viviendasArgentina)}**). La composición tipológica provincial difiere marcadamente del promedio nacional: en Jujuy predomina la casa (**${formatPercent(casaPct)}**) sobre el departamento (**${formatPercent(deptoPct)}**), patrón típico del interior y opuesto al de las grandes metrópolis (CABA, Rosario, Córdoba) donde la vivienda en altura es predominante.

La tasa de desocupación habitacional provincial (**${formatPercent(desocupadasPct)}**) se ubica en el rango nacional típico, con mayor desocupación en zonas turísticas (Quebrada de Humahuaca) y en stock de mercado urbano. A nivel nacional, las tasas más altas corresponden a CABA, Bariloche, costa atlántica y zonas turísticas serranas, todas con peso significativo de segundas residencias.

El hacinamiento residencial (viviendas multihogar) muestra patrones territoriales claros: las provincias del NOA y NEA, especialmente en zonas rurales y barrios populares de las capitales, presentan tasas superiores al promedio nacional. Esto refleja una combinación de mayor fecundidad histórica (hogares más numerosos), menor capacidad económica de los hogares jóvenes para acceder a vivienda propia y stock habitacional rezagado respecto al crecimiento demográfico.`,

    policyImplications: `El stock habitacional jujeño plantea tres tensiones estructurales relevantes para la política pública. La primera es la coexistencia de **stock subutilizado** (**${formatPercent(desocupadasPct)}** desocupado) con **stock sobreutilizado** (**${formatPercent(hacinamientoPct)}** multihogar). Esta paradoja, recurrente en el debate habitacional argentino, no se resuelve simplemente "reasignando" viviendas: la heterogeneidad cualitativa entre vivienda ociosa y vivienda demandada (ubicación, precio, condiciones de tenencia) impide una solución directa por la vía del mercado o la regulación.

La segunda tensión es la **calidad del stock**: las formas precarias (rancho, casilla, pieza en inquilinato) son minoritarias en el agregado pero concentran déficits graves. La mejora del stock precario suele requerir intervenciones integrales —no solo materiales sino de servicios básicos, regularización dominial y articulación con la trama urbana— que demandan capacidad institucional sostenida en el tiempo.

La tercera dimensión es la **territorialidad** de la demanda habitacional: la presión sobre vivienda accesible en la conurbación capitalina (Dr. Manuel Belgrano, Palpalá, El Carmen) tiene lógicas muy distintas a la dinámica habitacional de la Quebrada (donde el turismo presiona los precios) o de la Puna (donde el problema es más bien la calidad del stock existente, no su disponibilidad). Una política habitacional sensible al territorio debe diferenciar estas dinámicas y articular instrumentos específicos para cada contexto, antes que aplicar mecanismos uniformes que terminan beneficiando desproporcionadamente a las zonas con mayor capacidad institucional preexistente.`,
  });
  persist(slug, data, md);
}

// ═══════════════════════════════════════════════════════════════
// 6. Educación Censal — sin granularidad por departamento
// ═══════════════════════════════════════════════════════════════
function generateEducacionCensal() {
  const slug = "educacion-censal";
  const folder = path.join(RAW_DIR, "6- Educación");
  const fileC1 = path.join(folder, "c2022_jujuy_educacion_c1_10.xlsx");
  const fileC2 = path.join(folder, "c2022_jujuy_educacion_c2_10.xlsx");
  const fileC3 = path.join(folder, "c2022_jujuy_educacion_c3_10.xlsx");

  // c1 Cuadro 1.1: filas Total y por edad, cols 0=Sexo, 1=Edad, 2=Pob, 3=Asiste, 4=No asiste, 5=Nunca
  const rowsC1 = readSheetRows(fileC1, "Cuadro 1.10");
  const totalRowC1 = rowsC1.find(r => r && typeof r[0] === "string" && /^Total$/i.test(r[0].trim()));
  const tC1 = totalRowC1.map(toNumber);
  const pobTot = tC1[2];
  const asistePct = (tC1[3] / pobTot) * 100;
  const noAsistePct = (tC1[4] / pobTot) * 100;
  const nuncaPct = (tC1[5] / pobTot) * 100;

  // c2 Cuadro 2.1: nivel educativo al que asiste (cols 4..9)
  const rowsC2 = readSheetRows(fileC2, "Cuadro 2.10");
  const totalRowC2 = rowsC2.find(r => r && typeof r[0] === "string" && /^Total$/i.test(r[0].trim()));
  const tC2 = totalRowC2.map(toNumber);
  const universitarioGrado = tC2[9];

  // c3 Cuadro 3.1: máximo nivel educativo alcanzado
  // Cols (fila Total): 2=Pob viv. partic., 3=Pob 5+ que asistió,
  //   4=Sin instrucción, 5=Primario T, 8=EGB T, 11=Secundario T, 14=Polimodal T,
  //   17=Terciario no univ T, 20=Universitario grado T, 23=Posgrado T, 26=Ignorado
  const rowsC3 = readSheetRows(fileC3, "Cuadro 3.10");
  const totalRowC3 = rowsC3.find(r => r && typeof r[0] === "string" && /^Total$/i.test(r[0].trim()));
  const tC3 = totalRowC3.map(toNumber);
  const pob5Mas = tC3[3];
  const sinInstr = tC3[4];
  const primarioT = (tC3[5] || 0) + (tC3[8] || 0);
  const secundarioT = (tC3[11] || 0) + (tC3[14] || 0);
  const terciarioT = tC3[17];
  const universitarioT = tC3[20];
  const posgradoT = tC3[23];
  const superiorPct = ((terciarioT + universitarioT + posgradoT) / pob5Mas) * 100;

  const builder = new ReportBuilder("poblacion-educacion-censal")
    .setMeta({
      title: "Asistencia Educativa de la Población",
      subcategory: "Educación",
      source: SOURCE,
      date: PERIOD,
    })
    .addKPI({ id: "asiste", label: "Asiste a un establecimiento", value: asistePct, formatted: formatPercent(asistePct) })
    .addKPI({ id: "superior", label: "Con nivel superior alcanzado", value: superiorPct, formatted: formatPercent(superiorPct), comparison: "terciario, universitario o posgrado" })
    .addKPI({ id: "no-asiste", label: "No asiste pero asistió", value: noAsistePct, formatted: formatPercent(noAsistePct) })
    .addKPI({ id: "nunca", label: "Nunca asistió", value: nuncaPct, formatted: formatPercent(nuncaPct), status: "warning" })
    .addKPI({ id: "universitarios", label: "Asisten a universitario de grado", value: universitarioGrado, formatted: formatCompact(universitarioGrado) })
    .addKPI({ id: "posgrado-pop", label: "Con posgrado alcanzado", value: posgradoT, formatted: formatCompact(posgradoT) });

  // Chart: condición de asistencia (pie)
  const sectionAsist = "Condición de Asistencia";
  const sidAsist = slugify(sectionAsist);
  builder.addChart({
    id: "pie-asistencia",
    type: "pie",
    title: "Condición de asistencia escolar — Jujuy",
    sectionId: sidAsist,
    sectionTitle: sectionAsist,
    data: [
      { id: "Asiste",            label: "Asiste",            value: tC1[3] },
      { id: "Asistió (no asiste)", label: "Asistió (no asiste)", value: tC1[4] },
      { id: "Nunca asistió",     label: "Nunca asistió",     value: tC1[5] },
    ],
  });

  // Chart: distribución por nivel
  const sectionNivel = "Nivel Educativo en Curso";
  const sidNivel = slugify(sectionNivel);
  const niveles = [
    { label: "Jardín maternal/centro primera infancia", v: tC2[4] },
    { label: "Sala de 4 o 5 (jardín)", v: tC2[5] },
    { label: "Primario", v: tC2[6] },
    { label: "Secundario", v: tC2[7] },
    { label: "Terciario no universitario", v: tC2[8] },
    { label: "Universitario de grado", v: tC2[9] },
    { label: "Posgrado", v: tC2[10] },
  ].filter(n => n.v != null && n.v > 0);

  builder.addChart({
    id: "bar-niveles",
    type: "bar",
    title: "Población por nivel educativo en curso",
    sectionId: sidNivel,
    sectionTitle: sectionNivel,
    data: niveles.map(n => ({ nivel: n.label, "Población": n.v })),
    config: { xAxis: "nivel", yAxis: "Población" },
  });

  // Chart: máximo nivel educativo alcanzado (de educacion_c3)
  const sectionMax = "Máximo Nivel Educativo Alcanzado";
  const sidMax = slugify(sectionMax);
  builder.addChart({
    id: "pie-max-nivel",
    type: "pie",
    title: "Máximo nivel educativo alcanzado — Jujuy (5 años y más que asistió)",
    sectionId: sidMax,
    sectionTitle: sectionMax,
    data: [
      { id: "Sin instrucción",       label: "Sin instrucción",       value: sinInstr },
      { id: "Primario/EGB",          label: "Primario/EGB",          value: primarioT },
      { id: "Secundario/Polimodal",  label: "Secundario/Polimodal",  value: secundarioT },
      { id: "Terciario no univ.",    label: "Terciario no univ.",    value: terciarioT },
      { id: "Universitario grado",   label: "Universitario grado",   value: universitarioT },
      { id: "Posgrado",              label: "Posgrado",              value: posgradoT },
    ].filter(d => d.value > 0),
  });

  // No mapData (educación no tiene granularidad departamentol en estos cuadros)

  const data = builder.build();

  // ─── Derivados para narrativa ejecutiva ───
  const secundarioPct = (secundarioT / pob5Mas) * 100;
  const primarioPct = (primarioT / pob5Mas) * 100;
  const sinInstrPct = (sinInstr / pob5Mas) * 100;
  const universitarioPct = (universitarioT / pob5Mas) * 100;
  const terciarioPct = (terciarioT / pob5Mas) * 100;
  const posgradoPct = (posgradoT / pob5Mas) * 100;
  // Brechas vs nacional
  const desvSecComp = secundarioPct - CENSO_2022.pct_secundario_completo_25mas_nacional;
  const desvUniComp = universitarioPct - CENSO_2022.pct_universitario_completo_25mas_nacional;

  const md = buildReportMd({
    ...data,
    intro: `La estructura educativa de Jujuy refleja décadas de expansión del sistema escolar pero todavía conserva brechas significativas en niveles superiores. El **${formatPercent(asistePct)}** de la población asiste actualmente a un establecimiento educativo, **${formatPercent(superiorPct)}** alcanzó nivel terciario, universitario o de posgrado, y apenas el **${formatPercent(nuncaPct)}** nunca asistió a un establecimiento formal.`,

    executiveSummary: `Sobre **${formatInteger(pobTot)} personas** consideradas, el **${formatPercent(asistePct)}** asiste actualmente a algún establecimiento educativo —desde jardín maternal hasta posgrado—, **${formatPercent(noAsistePct)}** asistió en algún momento pero ya no lo hace, y solo el **${formatPercent(nuncaPct)}** declara no haber asistido nunca. Este último indicador es el núcleo histórico del analfabetismo declarativo: se concentra principalmente en niños en edad preescolar (sin asistir aún) y en la población adulta mayor que en su juventud no accedió al sistema, especialmente mujeres rurales de la Puna y de comunidades indígenas.

El **stock educativo de la población** muestra una estructura típica del NOA con avances significativos: el **${formatDecimal(primarioPct, 1)}%** alcanzó como máximo nivel primario o EGB; el **${formatDecimal(secundarioPct, 1)}%** alcanzó secundario o polimodal (${desvSecComp >= 0 ? `por encima` : `${formatDecimal(Math.abs(desvSecComp), 1)} pp por debajo`} del promedio nacional de **${formatDecimal(CENSO_2022.pct_secundario_completo_25mas_nacional, 1)}%**); el **${formatDecimal(terciarioPct, 1)}%** alcanzó terciario no universitario; el **${formatDecimal(universitarioPct, 1)}%** alcanzó universitario de grado (${desvUniComp >= 0 ? `por encima` : `${formatDecimal(Math.abs(desvUniComp), 1)} pp por debajo`} del **${formatDecimal(CENSO_2022.pct_universitario_completo_25mas_nacional, 1)}%** nacional); y un **${formatDecimal(posgradoPct, 1)}%** completó posgrado.

La presencia de la **Universidad Nacional de Jujuy (UNJu)** y otras instituciones de formación terciaria explica un buen flujo de matrícula superior local (**${formatInteger(universitarioGrado)}** asisten actualmente a universitario de grado), aunque la finalización efectiva de estudios universitarios es estructuralmente más baja que en provincias con tradición universitaria más extensa (CABA, Córdoba, Mendoza). El **${formatDecimal(sinInstrPct, 1)}%** sin instrucción identifica el núcleo de exclusión educativa estructural que persiste, principalmente en cohortes mayores.

La asistencia escolar en edades teóricas (primaria y secundaria) en Jujuy es prácticamente universal, en línea con los promedios nacionales que ubican la cobertura primaria en **${formatDecimal(CENSO_2022.pct_asistencia_primaria_nacional, 1)}%** y la secundaria en **${formatDecimal(CENSO_2022.pct_asistencia_secundaria_nacional, 1)}%**. Las brechas persistentes se concentran en la finalización del nivel secundario y la transición a estudios superiores.`,

    keyFindings: [
      `**Asistencia escolar:** **${formatPercent(asistePct)}** de la población asiste actualmente a un establecimiento, en línea con la masificación del sistema educativo nacional.`,
      `**Población sin instrucción:** **${formatDecimal(sinInstrPct, 1)}%** sobre la población de 5+ años, concentrada en cohortes mayores con baja escolarización inicial, especialmente mujeres rurales de la Puna.`,
      `**Secundario completo:** **${formatDecimal(secundarioPct, 1)}%** alcanzó como máximo secundario/polimodal — ${desvSecComp >= 0 ? `por encima` : `**${formatDecimal(Math.abs(desvSecComp), 1)} pp por debajo**`} del promedio nacional (**${formatDecimal(CENSO_2022.pct_secundario_completo_25mas_nacional, 1)}%**).`,
      `**Educación superior alcanzada:** **${formatPercent(superiorPct)}** alcanzó terciario, universitario o posgrado — combinación que refleja la presencia local de la UNJu y de instituciones de formación docente y técnica.`,
      `**Universitario de grado completo:** **${formatDecimal(universitarioPct, 1)}%** — ${desvUniComp >= 0 ? `por encima` : `**${formatDecimal(Math.abs(desvUniComp), 1)} pp por debajo**`} del **${formatDecimal(CENSO_2022.pct_universitario_completo_25mas_nacional, 1)}%** nacional.`,
      `**Matrícula universitaria activa:** **${formatInteger(universitarioGrado)}** personas asisten actualmente a universitario de grado, núcleo de la formación profesional emergente provincial.`,
    ],

    keyDatum: `**Dato destacado:** el **${formatPercent(superiorPct)}** de la población con 5+ años en Jujuy alcanzó algún nivel de educación superior (terciario, universitario o posgrado) — un stock de capital humano calificado en expansión, aunque todavía con brecha vs. el promedio nacional en finalización universitaria.`,

    sectionNarratives: {
      [sidAsist]: `La condición de asistencia escolar muestra que el **${formatPercent(asistePct)}** de la población jujeña asiste actualmente a un establecimiento educativo, el **${formatPercent(noAsistePct)}** asistió alguna vez pero ya no, y el **${formatPercent(nuncaPct)}** nunca asistió. Este último grupo es estadísticamente acotado pero sociológicamente relevante: combina niños de 5 años aún no escolarizados, adultos mayores que en su juventud no accedieron al sistema (cohortes pre-1970 con baja escolarización rural, especialmente mujeres), y un núcleo residual de exclusión escolar contemporánea.

La cobertura del sistema educativo en edades teóricas (primaria y secundaria) es prácticamente universal en Argentina y en Jujuy, en línea con los promedios nacionales (**${formatDecimal(CENSO_2022.pct_asistencia_primaria_nacional, 1)}%** primaria, **${formatDecimal(CENSO_2022.pct_asistencia_secundaria_nacional, 1)}%** secundaria). Las brechas significativas no están tanto en el acceso inicial como en la finalización del nivel secundario y la transición efectiva a estudios superiores.`,

      [sidNivel]: `La distribución por nivel educativo en curso muestra el perfil de matrícula activa: el primario y secundario concentran la mayor parte de los estudiantes, en línea con la pirámide poblacional y la edad teórica de cada nivel. El nivel universitario de grado registra **${formatInteger(universitarioGrado)}** personas en curso, indicador del peso de la UNJu y otras instituciones terciarias locales.

La diferencia entre matrícula activa y stock educativo alcanzado es informativa: la matrícula refleja el flujo presente del sistema, mientras el stock acumulado refleja el resultado histórico de décadas de inversión y expansión. Provincias con expansión universitaria reciente (como Jujuy con la UNJu, fundada en 1972) suelen mostrar matrículas altas pero stocks acumulados menores que jurisdicciones con tradición universitaria más antigua.`,

      [sidMax]: `El stock educativo acumulado de la población jujeña de 5 años y más muestra una estructura típica del NOA: **${formatDecimal(primarioPct, 1)}%** primario/EGB; **${formatDecimal(secundarioPct, 1)}%** secundario/polimodal; **${formatDecimal(terciarioPct, 1)}%** terciario no universitario; **${formatDecimal(universitarioPct, 1)}%** universitario de grado; **${formatDecimal(posgradoPct, 1)}%** posgrado; **${formatDecimal(sinInstrPct, 1)}%** sin instrucción.

La comparación con los promedios nacionales (**${formatDecimal(CENSO_2022.pct_secundario_completo_25mas_nacional, 1)}%** con secundario completo, **${formatDecimal(CENSO_2022.pct_universitario_completo_25mas_nacional, 1)}%** universitario completo) muestra el patrón típico del NOA: ${desvSecComp >= 0 ? `cobertura secundaria por encima del promedio` : `cobertura secundaria ligeramente por debajo`}, pero brecha persistente en universitario completo. Esta diferencia refleja décadas de menor desarrollo institucional universitario, menor cantidad de hogares con tradición universitaria heredada y una estructura productiva con menor demanda de profesionales con título de grado.

El stock acumulado tiene inercia: los cambios significativos en estos indicadores requieren décadas de inversión sostenida y, sobre todo, generaciones de profesionales que se queden a trabajar en la provincia en lugar de migrar a centros urbanos mayores.`,
    },

    nationalContext: `El sistema educativo argentino presenta una cobertura prácticamente universal en edades teóricas de primaria (**${formatDecimal(CENSO_2022.pct_asistencia_primaria_nacional, 1)}%**) y alta en secundaria (**${formatDecimal(CENSO_2022.pct_asistencia_secundaria_nacional, 1)}%**). Jujuy se ubica en línea con estos promedios, sin brechas significativas de acceso inicial. Las desigualdades educativas más relevantes se concentran en la finalización del nivel secundario y la transición a estudios superiores, donde provincias del NOA, NEA y zonas rurales periféricas presentan rezagos persistentes.

En **stock educativo de la población 25+**, el promedio nacional muestra **${formatDecimal(CENSO_2022.pct_secundario_completo_25mas_nacional, 1)}%** con secundario completo y **${formatDecimal(CENSO_2022.pct_universitario_completo_25mas_nacional, 1)}%** con universitario completo. CABA, Tierra del Fuego, Santa Cruz y Córdoba presentan tasas superiores; el NOA y NEA tienden a estar por debajo. La distancia se acorta en cada cohorte sucesiva por efecto de la expansión universitaria y de la masificación secundaria, pero el stock acumulado mantiene la inercia generacional.

La presencia de la UNJu y de instituciones terciarias provinciales ha sostenido la formación de profesionales locales en las últimas cinco décadas, aunque persiste un patrón de migración educativa hacia centros universitarios mayores (Tucumán, Córdoba, Buenos Aires) para carreras específicas. La retención de profesionales formados localmente es uno de los desafíos estructurales del desarrollo provincial.`,

    policyImplications: `El perfil educativo jujeño señala tres tensiones que estructuran cualquier diagnóstico de capital humano provincial. La primera es la **brecha de finalización del secundario**: aunque el acceso es prácticamente universal, la finalización efectiva sigue siendo menor que el ideal y desigual entre departamentos urbanos y rurales. El abandono escolar en secundaria, fenómeno multicausal (necesidad de aporte económico al hogar, embarazo adolescente, distancia geográfica a establecimientos, calidad percibida del servicio), es el principal cuello de botella del flujo educativo.

La segunda tensión es la **transición efectiva a estudios superiores**: la matrícula universitaria es relativamente robusta gracias a la UNJu, pero las tasas de graduación efectiva siguen siendo bajas. Factores estructurales (necesidad de trabajar mientras se estudia, calidad de la formación previa, inadecuación entre oferta de carreras y demanda local de profesionales) configuran un sistema con alta deserción universitaria. El stock de universitarios graduados crece lentamente, condicionando el techo del desarrollo profesional provincial.

La tercera dimensión, no medida directamente en este informe pero relevante, es la **calidad del aprendizaje**: la cobertura formal no garantiza adquisición efectiva de competencias. Las pruebas estandarizadas (Aprender, internacionales como PISA) muestran brechas significativas entre provincias y entre sectores socioeconómicos al interior de cada provincia. Una política educativa integral debe combinar la mirada censal con datos de calidad, trayectorias educativas reales y articulación con el mercado laboral local — dimensiones que el Censo no captura por completo y que requieren bases complementarias.`,
  });
  persist(slug, data, md);
}

// ═══════════════════════════════════════════════════════════════
// 7. Características económicas — actividad por departamento
// ═══════════════════════════════════════════════════════════════
function generateEconomia() {
  const slug = "economia";
  const folder = path.join(RAW_DIR, "7- Características económicas");
  const file = path.join(folder, "c2022_jujuy_actividad_economica_c1_10.xlsx");
  const fileRamas = path.join(folder, "c2022_jujuy_actividad_economica_c6_10.xlsx");
  const fileCatEdad = path.join(folder, "c2022_jujuy_actividad_economica_c3_10.xlsx");
  const fileActEdu = path.join(folder, "c2022_jujuy_actividad_economica_c8_10.xlsx");

  const { total, departamentos } = extractCabaTable(readSheetRows(file, "Cuadro 1.10"));

  // Ramas de actividad: filas son ramas (col 1 luego de Total)
  // Cols del cuadro c6 fila Total: 0=Total, 1='', 2=Ocupada total, 3=Servicio dom., 4=Empleado/obrero, 5=Cuenta propia, 6=Patrón, 7=Trab. familiar, 8=Ignorado
  const ramasRows = readSheetRows(fileRamas, "Cuadro 6.10");
  const totalRamas = ramasRows.find(r => r && typeof r[0] === "string" && /^Total$/i.test(r[0].trim()));
  const tRamas = (totalRamas || []).map(toNumber);

  // c3: cat ocupacional por edad — col 1=Edad (cuando col 0 vacío), col 2=Pob ocupada,
  //     cols 3..8=Servicio dom, Empleado, Cuenta propia, Patrón, Trab familiar, Ignorado
  const catEdadRows = readSheetRows(fileCatEdad, "Cuadro 3.10");

  // c8: actividad económica por máximo nivel educativo
  // col 1=Nivel educativo, col 2=Pob 14+, 3=PEA total, 4=Ocupada, 5=Desocupada, 6=No PEA
  const actEduRows = readSheetRows(fileActEdu, "Cuadro 8.10");

  // Cols: 0=Código, 1=Departamento, 2=Pob 14+, 3=PEA total, 4=Ocupada, 5=Desocupada, 6=No PEA
  const t = total.map(toNumber);
  const pob14 = t[2];
  const pea = t[3];
  const ocupada = t[4];
  const desocupada = t[5];
  const noPea = t[6];

  const tasaActividad = (pea / pob14) * 100;
  const tasaEmpleo = (ocupada / pob14) * 100;
  const tasaDesocupacion = (desocupada / pea) * 100;

  const builder = new ReportBuilder("poblacion-economia")
    .setMeta({
      title: "Características Económicas de la Población",
      subcategory: "Economía",
      source: SOURCE,
      date: PERIOD,
    })
    .addKPI({ id: "tasa-actividad", label: "Tasa de actividad", value: tasaActividad, formatted: formatPercent(tasaActividad), comparison: "PEA / Población 14+" })
    .addKPI({ id: "tasa-empleo", label: "Tasa de empleo", value: tasaEmpleo, formatted: formatPercent(tasaEmpleo), comparison: "Ocupados / Población 14+" })
    .addKPI({ id: "tasa-desoc", label: "Tasa de desocupación", value: tasaDesocupacion, formatted: formatPercent(tasaDesocupacion), comparison: "Desocupados / PEA", status: tasaDesocupacion > 8 ? "warning" : undefined })
    .addKPI({ id: "no-pea", label: "Población no económicamente activa", value: noPea, formatted: formatCompact(noPea) });

  // Chart: composición Jujuy (pie)
  const sectionComp = "Condición de Actividad";
  const sidComp = slugify(sectionComp);
  builder.addChart({
    id: "pie-actividad",
    type: "pie",
    title: "Condición de actividad económica — Jujuy (14+)",
    sectionId: sidComp,
    sectionTitle: sectionComp,
    data: [
      { id: "Ocupada",    label: "Ocupada",    value: ocupada },
      { id: "Desocupada", label: "Desocupada", value: desocupada },
      { id: "No PEA",     label: "No PEA",     value: noPea },
    ],
  });

  // Chart: tasa actividad por departamento
  const sectionTAct = "Tasa de Actividad por Departamento";
  const sidTAct = slugify(sectionTAct);
  builder.addChart({
    id: "bar-tasa-act-departamento",
    type: "bar",
    title: "Tasa de actividad por departamento",
    sectionId: sidTAct,
    sectionTitle: sectionTAct,
    data: departamentos.map(({ departamento, row }) => {
      const r = row.map(toNumber);
      return { departamento: departamento.nombre, "Tasa actividad %": Math.round((r[3] / r[2]) * 1000) / 10 };
    }),
    config: { xAxis: "departamento", yAxis: "Tasa actividad %" },
  });

  // Chart: tasa desocupación por departamento
  const sectionTDes = "Tasa de Desocupación por Departamento";
  const sidTDes = slugify(sectionTDes);
  builder.addChart({
    id: "bar-tasa-desoc-departamento",
    type: "bar",
    title: "Tasa de desocupación por departamento",
    sectionId: sidTDes,
    sectionTitle: sectionTDes,
    data: departamentos.map(({ departamento, row }) => {
      const r = row.map(toNumber);
      return { departamento: departamento.nombre, "Desocupación %": Math.round((r[5] / r[3]) * 1000) / 10 };
    }),
    config: { xAxis: "departamento", yAxis: "Desocupación %" },
  });

  // Rankings
  const rankedAct = departamentos.map(({ departamento, row }) => {
    const r = row.map(toNumber);
    return { departamento, value: (r[3] / r[2]) * 100 };
  }).sort((a, b) => b.value - a.value);

  builder.addRanking({
    id: "rank-actividad",
    title: "Departamentos con mayor tasa de actividad",
    sectionId: sidTAct,
    items: rankedAct.map(r => ({
      name: r.departamento.nombre,
      value: Math.round(r.value * 10) / 10,
      municipioId: r.departamento.codigo,
    })),
    order: "desc",
  });

  const rankedDes = departamentos.map(({ departamento, row }) => {
    const r = row.map(toNumber);
    return { departamento, value: (r[5] / r[3]) * 100 };
  }).sort((a, b) => b.value - a.value);

  builder.addRanking({
    id: "rank-desocupacion",
    title: "Departamentos con mayor tasa de desocupación",
    sectionId: sidTDes,
    items: rankedDes.map(r => ({
      name: r.departamento.nombre,
      value: Math.round(r.value * 10) / 10,
      municipioId: r.departamento.codigo,
    })),
    order: "desc",
  });

  // Map: tasa desocupación
  for (const { departamento, row } of departamentos) {
    const r = row.map(toNumber);
    const pct = (r[5] / r[3]) * 100;
    builder.addMapItem({
      municipioId: departamento.codigo,
      municipioNombre: departamento.nombre,
      value: Math.round(pct * 10) / 10,
      label: `${formatPercent(pct)} desocupación`,
    });
  }

  // Chart: rama de actividad económica (de actividad_c6, filas con rama en col 1)
  const sectionRama = "Ramas de Actividad Económica";
  const sidRama = slugify(sectionRama);
  const ramasData = [];
  for (const r of ramasRows) {
    const c0 = String(r?.[0] || "").trim();
    const c1 = String(r?.[1] || "").trim();
    if (c0 || !c1) continue; // saltar filas que tengan algo en col 0 (incluye "Total" y ramas agregadas)
    if (/^\(/.test(c1) || c1.length < 4) continue;
    const ocup = toNumber(r[2]);
    if (ocup != null && ocup > 0) {
      ramasData.push({
        rama: c1.length > 38 ? c1.slice(0, 36) + "…" : c1,
        Ocupados: ocup,
      });
    }
  }
  // Top 10 ramas
  ramasData.sort((a, b) => b.Ocupados - a.Ocupados);
  const ramasTop = ramasData.slice(0, 10);
  builder.addChart({
    id: "bar-ramas",
    type: "bar",
    title: "Población ocupada por rama de actividad económica",
    sectionId: sidRama,
    sectionTitle: sectionRama,
    data: ramasTop,
    config: { xAxis: "rama", yAxis: "Ocupados", layout: "horizontal" },
  });

  // Ranking ramas
  builder.addRanking({
    id: "rank-ramas",
    title: "Ramas con mayor ocupación",
    sectionId: sidRama,
    items: ramasTop.map(r => ({
      name: r.rama,
      value: r.Ocupados,
    })),
    order: "desc",
  });

  // Chart: cat. ocupacional por edad (de actividad_c3) — solo grupos quinquenales
  const sectionCatEdad = "Categoría Ocupacional por Edad";
  const sidCatEdad = slugify(sectionCatEdad);
  const catEdadData = [];
  for (const r of catEdadRows) {
    const c0 = String(r?.[0] || "").trim();
    const c1 = String(r?.[1] || "").trim();
    if (c0 || !c1) continue; // saltar Total y filas con sexo
    if (!/^\d+(-\d+)?$/.test(c1) && !/^65\s*y\s*m[áa]s$/i.test(c1)) continue;
    const ocupada = toNumber(r[2]);
    if (!ocupada) continue;
    catEdadData.push({
      edad: c1,
      "Servicio doméstico %":  Math.round(((toNumber(r[3]) || 0) / ocupada) * 1000) / 10,
      "Empleado/obrero %":     Math.round(((toNumber(r[4]) || 0) / ocupada) * 1000) / 10,
      "Cuenta propia %":       Math.round(((toNumber(r[5]) || 0) / ocupada) * 1000) / 10,
      "Patrón/Empleador %":    Math.round(((toNumber(r[6]) || 0) / ocupada) * 1000) / 10,
    });
  }
  builder.addChart({
    id: "line-cat-ocupacional-edad",
    type: "line",
    title: "Distribución de la categoría ocupacional según edad",
    sectionId: sidCatEdad,
    sectionTitle: sectionCatEdad,
    data: catEdadData,
    config: { xAxis: "edad", yAxis: "%" },
  });

  // Chart: actividad por nivel educativo (de actividad_c8)
  const sectionActEdu = "Actividad y Nivel Educativo";
  const sidActEdu = slugify(sectionActEdu);
  const actEduData = [];
  for (const r of actEduRows) {
    const c0 = String(r?.[0] || "").trim();
    const c1 = String(r?.[1] || "").trim();
    if (c0 || !c1) continue;
    if (c1.length < 5) continue;
    const pob = toNumber(r[2]);
    if (!pob) continue;
    actEduData.push({
      nivel: c1.length > 30 ? c1.slice(0, 28) + "…" : c1,
      "Tasa actividad %":     Math.round(((toNumber(r[3]) || 0) / pob) * 1000) / 10,
      "Tasa empleo %":        Math.round(((toNumber(r[4]) || 0) / pob) * 1000) / 10,
      "Tasa desocupación %":  toNumber(r[3]) ? Math.round(((toNumber(r[5]) || 0) / toNumber(r[3])) * 1000) / 10 : 0,
    });
  }
  builder.addChart({
    id: "bar-actividad-nivel-edu",
    type: "bar",
    title: "Tasas de actividad y empleo según máximo nivel educativo",
    sectionId: sidActEdu,
    sectionTitle: sectionActEdu,
    data: actEduData.slice(0, 10),
    config: { xAxis: "nivel", yAxis: "%", grouped: true },
  });

  const data = builder.build();

  // ─── Derivados para narrativa ejecutiva ───
  const desvActividad = tasaActividad - CENSO_2022.tasa_actividad_nacional;
  const desvEmpleo = tasaEmpleo - CENSO_2022.tasa_empleo_nacional;
  const desvDesoc = tasaDesocupacion - CENSO_2022.tasa_desocupacion_nacional;

  // Categorías ocupacionales agregadas (fila Total c6)
  const tRamasOcup = tRamas[2] || 0;
  const empleadoObreroPct = tRamasOcup ? ((tRamas[4] || 0) / tRamasOcup) * 100 : 0;
  const cuentaPropiaPct = tRamasOcup ? ((tRamas[5] || 0) / tRamasOcup) * 100 : 0;
  const patronPct = tRamasOcup ? ((tRamas[6] || 0) / tRamasOcup) * 100 : 0;
  const servDomPct = tRamasOcup ? ((tRamas[3] || 0) / tRamasOcup) * 100 : 0;

  // Brechas por departamento
  const sortedAct = [...rankedAct];
  const depMaxAct = sortedAct[0];
  const depMinAct = sortedAct[sortedAct.length - 1];
  const sortedDes = [...rankedDes];
  const depMaxDes = sortedDes[0];
  const depMinDes = sortedDes[sortedDes.length - 1];

  // Top 3 ramas
  const top3Ramas = ramasTop.slice(0, 3);
  const sumTop3 = top3Ramas.reduce((s, r) => s + r.Ocupados, 0);
  const totalOcup = ramasData.reduce((s, r) => s + r.Ocupados, 0);
  const pctTop3Ramas = totalOcup ? (sumTop3 / totalOcup) * 100 : 0;

  const md = buildReportMd({
    ...data,
    intro: `La población de **14 años y más** en Jujuy es de **${formatInteger(pob14)} personas**. La tasa de actividad alcanza el **${formatPercent(tasaActividad)}**, con una tasa de empleo del **${formatPercent(tasaEmpleo)}** y una desocupación del **${formatPercent(tasaDesocupacion)}** sobre la PEA. Estos indicadores ubican a la provincia ${desvActividad >= 0 ? `cerca o por encima` : `por debajo`} del promedio nacional, con una estructura productiva donde el sector público, el comercio y los servicios concentran buena parte del empleo formal.`,

    executiveSummary: `El mercado de trabajo censal de Jujuy presenta una tasa de actividad del **${formatPercent(tasaActividad)}** (${desvActividad >= 0 ? `**+${formatDecimal(desvActividad, 1)} pp**` : `**${formatDecimal(desvActividad, 1)} pp**`} vs. **${formatDecimal(CENSO_2022.tasa_actividad_nacional, 1)}%** nacional), una tasa de empleo del **${formatPercent(tasaEmpleo)}** (${desvEmpleo >= 0 ? `+` : ``}**${formatDecimal(desvEmpleo, 1)} pp** vs. **${formatDecimal(CENSO_2022.tasa_empleo_nacional, 1)}%** nacional) y una desocupación del **${formatPercent(tasaDesocupacion)}** sobre la PEA (${desvDesoc >= 0 ? `+` : ``}**${formatDecimal(desvDesoc, 1)} pp** vs. **${formatDecimal(CENSO_2022.tasa_desocupacion_nacional, 1)}%** nacional). El cuadro agregado se mantiene dentro de los rangos típicos del NOA: actividad relativamente moderada, desocupación contenida pero con presencia significativa de empleo informal y cuentapropismo no medido en este indicador.

La composición de la categoría ocupacional revela el peso de cada modalidad laboral: **${formatDecimal(empleadoObreroPct, 1)}%** son empleados/obreros (asalariados públicos y privados); **${formatDecimal(cuentaPropiaPct, 1)}%** trabajadores por cuenta propia; **${formatDecimal(patronPct, 1)}%** patrones o empleadores; y **${formatDecimal(servDomPct, 1)}%** en servicio doméstico. La relación de dependencia (empleado/obrero) absorbe la mayor parte del empleo, pero el cuentapropismo retiene un peso significativo —típicamente vinculado a actividades de comercio, servicios personales, construcción y oficios— y suele coincidir con condiciones de informalidad laboral, ausencia de aportes previsionales y vulnerabilidad ante ciclos económicos adversos.

La distribución por **rama de actividad económica** muestra una estructura productiva diversificada pero con concentraciones claras: las tres ramas principales (**${top3Ramas.map(r => r.rama).join(", ")}**) acumulan aproximadamente el **${formatDecimal(pctTop3Ramas, 1)}%** del empleo total registrado. El peso del empleo público (en administración, salud, educación) es una característica estructural del NOA y de Jujuy en particular: aunque no se mide directamente como una sola rama, atraviesa varias categorías y configura el principal estabilizador del mercado laboral provincial.

Las **brechas territoriales** son significativas: la tasa de actividad varía entre **${formatDecimal(depMinAct.value, 1)}%** en ${depMinAct.departamento.nombre} y **${formatDecimal(depMaxAct.value, 1)}%** en ${depMaxAct.departamento.nombre}; la tasa de desocupación oscila entre **${formatDecimal(depMinDes.value, 1)}%** y **${formatDecimal(depMaxDes.value, 1)}%** entre extremos territoriales. Estas diferencias reflejan estructuras económicas locales muy heterogéneas: la dinámica urbano-administrativa del corredor capital-Palpalá difiere radicalmente de la lógica agroindustrial del Ramal o de las economías de subsistencia y minería extensiva del altiplano.`,

    keyFindings: [
      `**Tasa de actividad:** **${formatPercent(tasaActividad)}** vs. **${formatDecimal(CENSO_2022.tasa_actividad_nacional, 1)}%** nacional — desvío de **${desvActividad >= 0 ? "+" : ""}${formatDecimal(desvActividad, 1)} pp**.`,
      `**Tasa de empleo:** **${formatPercent(tasaEmpleo)}** vs. **${formatDecimal(CENSO_2022.tasa_empleo_nacional, 1)}%** nacional — diferencia de **${desvEmpleo >= 0 ? "+" : ""}${formatDecimal(desvEmpleo, 1)} pp**.`,
      `**Desocupación:** **${formatPercent(tasaDesocupacion)}** vs. **${formatDecimal(CENSO_2022.tasa_desocupacion_nacional, 1)}%** nacional — ${desvDesoc >= 0 ? `**+${formatDecimal(desvDesoc, 1)} pp**` : `**${formatDecimal(desvDesoc, 1)} pp**`} de desvío.`,
      `**Empleo asalariado:** **${formatDecimal(empleadoObreroPct, 1)}%** son empleados/obreros — núcleo del empleo formal (público y privado), incluyendo el peso significativo del Estado provincial y nacional en territorio.`,
      `**Cuentapropismo:** **${formatDecimal(cuentaPropiaPct, 1)}%** del empleo es por cuenta propia, frecuentemente vinculado a comercio, servicios personales, construcción y oficios — categoría con alta correlación con informalidad laboral.`,
      `**Brecha territorial en desocupación:** entre **${formatDecimal(depMinDes.value, 1)}%** en ${depMinDes.departamento.nombre} y **${formatDecimal(depMaxDes.value, 1)}%** en ${depMaxDes.departamento.nombre} — refleja estructuras económicas locales muy heterogéneas.`,
    ],

    keyDatum: `**Dato destacado:** sobre **${formatInteger(pob14)} personas** de 14+ años, el **${formatPercent(tasaActividad)}** participa en el mercado laboral y el **${formatPercent(tasaEmpleo)}** está efectivamente ocupado — una estructura ocupacional donde el cuentapropismo (**${formatDecimal(cuentaPropiaPct, 1)}%**) coexiste con el asalariado público y privado.`,

    sectionNarratives: {
      [sidComp]: `La PEA jujeña refleja una estructura típica del NOA: combina núcleos urbanos con tasas de actividad relativamente altas (capital provincial, Palpalá, San Pedro) con zonas rurales donde la actividad económica medida por el Censo subestima el trabajo real (economía de subsistencia, pastoreo, trabajo familiar no remunerado, actividades estacionales). La tasa de actividad censal de **${formatPercent(tasaActividad)}** ${desvActividad >= 0 ? `supera` : `se ubica por debajo`} del promedio nacional, ratificando un perfil que ha mejorado en las últimas décadas pero conserva brechas con jurisdicciones más urbanizadas.

La **No PEA (${formatInteger(noPea)} personas)** incluye estudiantes, jubilados, amas de casa y personas con discapacidad o sin disposición a trabajar al momento del Censo. Su peso relativo es estructuralmente elevado en provincias del NOA por varias razones convergentes: alta proporción de jóvenes en formación, mayor peso de las amas de casa no remuneradas (vinculado a estructura familiar tradicional y a menor inserción laboral femenina), y cohortes adultas mayores con cobertura jubilatoria amplia.`,

      [sidTAct]: `La tasa de actividad varía marcadamente entre departamentos: oscila entre **${formatDecimal(depMinAct.value, 1)}%** en ${depMinAct.departamento.nombre} y **${formatDecimal(depMaxAct.value, 1)}%** en ${depMaxAct.departamento.nombre}. Esta brecha de aproximadamente **${formatDecimal(depMaxAct.value - depMinAct.value, 1)} puntos porcentuales** refleja diferencias estructurales en composición etaria (departamentos más jóvenes vs. más envejecidos), oferta laboral local (existencia o no de empleadores formales significativos), y peso relativo del empleo público (que ancla actividad en localidades con dependencias provinciales o nacionales).

Los departamentos con mayor presencia de adultos jóvenes y mayor disponibilidad de empleo formal —típicamente los del corredor central— registran las tasas más altas; las zonas con mayor peso del trabajo familiar no remunerado, economías de subsistencia o cohortes envejecidas presentan los valores más bajos.`,

      [sidTDes]: `La distribución territorial de la desocupación es marcadamente asimétrica: entre **${formatDecimal(depMinDes.value, 1)}%** en ${depMinDes.departamento.nombre} y **${formatDecimal(depMaxDes.value, 1)}%** en ${depMaxDes.departamento.nombre}, una brecha que refleja oportunidades laborales radicalmente distintas según el contexto local. Los departamentos con mayor desocupación suelen combinar dinamismo demográfico (PEA creciente por entrada de jóvenes al mercado laboral), oferta de empleo formal insuficiente para absorber esa demanda, y dependencia de actividades cíclicas (agroindustria, construcción) susceptibles a ciclos económicos.

La desocupación medida por el Censo (definición clásica: buscan activamente y están disponibles) suele subestimar la subutilización real del trabajo, que incluye trabajadores desalentados que dejaron de buscar y subocupados que querrían trabajar más horas. Los promedios urbanos del INDEC vía EPH son más exhaustivos en esta dimensión pero no cubren las zonas rurales que sí releva el Censo.`,

      [sidRama]: `La estructura productiva jujeña refleja una economía diversificada pero con tres ramas principales —**${top3Ramas.map(r => r.rama).join(", ")}**— que concentran aproximadamente el **${formatDecimal(pctTop3Ramas, 1)}%** del empleo total. Comercio, administración pública, enseñanza, salud, construcción e industria manufacturera (incluyendo agroindustria del Ramal y siderurgia en Palpalá) configuran el núcleo del empleo formal provincial.

El peso del **empleo público** (provincial y nacional) es estructural en Jujuy: aunque no aparece como una rama única, atraviesa administración pública, salud, educación y otras categorías. En provincias del NOA, este peso es históricamente mayor que el promedio nacional y configura el principal estabilizador del mercado laboral provincial: amortigua los ciclos económicos, garantiza demanda agregada estable en localidades del interior y absorbe parte del bono demográfico juvenil. Su sostenibilidad fiscal y su impacto en la dinámica del sector privado son objeto de debate recurrente.

La **minería del litio**, en franca expansión, no aparece todavía con peso decisivo en la rama "extractivas" del cuadro censal, pero su crecimiento futuro modificará la estructura productiva provincial en los próximos años.`,

      [sidCatEdad]: `La categoría ocupacional por edad muestra patrones marcados: la juventud predomina en **relación de dependencia (empleado/obrero)**, frecuentemente en sus primeras inserciones laborales y muchas veces en condiciones de informalidad o de contratos a término. El **cuenta propia** y la categoría **patrón/empleador** ganan peso en edades intermedias y maduras, reflejando trayectorias laborales que van migrando desde el asalariado inicial hacia formas autónomas o de propietario.

El **servicio doméstico**, aunque cuantitativamente minoritario (**${formatDecimal(servDomPct, 1)}%**), está fuertemente concentrado en mujeres adultas y suele ser la modalidad laboral con mayor informalidad estructural del mercado de trabajo argentino. Su persistencia refleja la composición de la demanda de cuidado y limpieza doméstica de los hogares de mayor ingreso, combinada con la oferta laboral femenina sin formación técnica formal.`,

      [sidActEdu]: `La participación en el mercado de trabajo crece consistentemente con el nivel educativo alcanzado, patrón universal en mercados laborales contemporáneos. La tasa de actividad y la tasa de empleo son significativamente más altas en quienes completaron estudios universitarios y de posgrado; la tasa de desocupación, en cambio, afecta más fuertemente a quienes sólo alcanzaron primario o secundario incompleto.

Esta relación inversa entre educación y desocupación tiene varias implicancias. Primero, confirma el valor del capital humano como activo laboral: invertir en educación reduce significativamente la probabilidad de exclusión del mercado de trabajo. Segundo, plantea una tensión estructural: si la oferta educativa expande pero el mercado laboral local no genera empleo calificado correspondiente, se produce **subempleo profesional** (graduados ocupados en tareas para las que están sobre-calificados) o migración educativa hacia centros laborales mayores.`,
    },

    nationalContext: `Los indicadores de actividad económica de Jujuy se enmarcan en patrones típicos del NOA: tasa de actividad **${formatPercent(tasaActividad)}** vs. **${formatDecimal(CENSO_2022.tasa_actividad_nacional, 1)}%** nacional, tasa de empleo **${formatPercent(tasaEmpleo)}** vs. **${formatDecimal(CENSO_2022.tasa_empleo_nacional, 1)}%**, desocupación **${formatPercent(tasaDesocupacion)}** vs. **${formatDecimal(CENSO_2022.tasa_desocupacion_nacional, 1)}%**. La provincia se ubica ${desvActividad >= 0 ? `por encima` : `por debajo`} del promedio nacional en actividad y ${desvDesoc >= 0 ? `por encima` : `por debajo`} en desocupación, consistente con un mercado laboral con menor presencia de empleo asalariado privado registrado que las grandes provincias industriales del centro del país.

Las provincias del NOA y NEA muestran sistemáticamente menor formalidad laboral, mayor peso del empleo público y del cuentapropismo, y mayor dependencia de actividades primarias (agroindustria, minería) y de servicios vinculados al sector público. CABA, Buenos Aires, Santa Fe y Córdoba concentran las mayores tasas de empleo asalariado privado registrado y las menores tasas de informalidad.

El **empleo público** en Jujuy, como en el resto del NOA, es un componente estructural del mercado de trabajo: representa una proporción significativamente mayor del empleo total que en provincias del centro y sur del país. Esta característica tiene raíces históricas (rol del Estado como organizador del territorio en zonas de baja densidad económica) y configuracionales (escasa densidad de empresas privadas formales), y atraviesa cualquier discusión sobre sostenibilidad fiscal provincial.

Las tasas de desocupación medidas por el Censo son consistentes pero no estrictamente comparables con las de la EPH urbana del INDEC. La EPH, restringida a aglomerados urbanos, suele captar mejor la subocupación y el desempleo desalentado, dimensiones que el Censo no mide en el mismo detalle.`,

    policyImplications: `El perfil económico-laboral jujeño plantea tres tensiones estructurales relevantes para la política pública. La primera es el **peso del empleo público** como estabilizador y, simultáneamente, como límite del dinamismo privado: el Estado provincial y nacional sostiene una parte sustancial del empleo formal, lo que reduce la volatilidad cíclica del mercado laboral pero también puede inhibir el desarrollo de un sector privado robusto si la masa salarial pública compite por mano de obra calificada o si las cargas tributarias asociadas presionan la formalización empresarial.

La segunda tensión es la **informalidad laboral del cuentapropismo**: el **${formatDecimal(cuentaPropiaPct, 1)}%** del empleo es por cuenta propia, frecuentemente sin registración previsional, sin obra social y sin acceso a crédito formal. Esta modalidad concentra a comerciantes, trabajadores de oficios, artesanos y prestadores de servicios personales que constituyen el grueso del empleo no asalariado en la provincia. Cualquier política de inclusión laboral o de formalización debe diseñar instrumentos específicos para este universo, distinto al del asalariado.

La tercera dimensión es la **heterogeneidad productiva territorial**: la dinámica económica del corredor central (capital, Palpalá, El Carmen) difiere radicalmente de la del Ramal (agroindustria, ciclo zafrero, migraciones estacionales), de la Puna (minería del litio en expansión, pastoreo, comunidades indígenas) y de la Quebrada (turismo, agricultura familiar). Las brechas territoriales en tasas de actividad, empleo y desocupación reflejan esta heterogeneidad. Una política de desarrollo productivo debe articular instrumentos sensibles a cada subregión, antes que aplicar mecanismos uniformes que naturalmente benefician a las zonas con mayor capacidad institucional y económica preexistente.

La expansión del litio en los próximos años introducirá una variable nueva en este cuadro: empleo directo en minería con salarios relativamente altos pero con encadenamientos productivos locales aún limitados, plantea desafíos específicos de calificación de mano de obra, sostenibilidad ambiental y captura provincial de la renta minera.`,
  });
  persist(slug, data, md);
}

// ═══════════════════════════════════════════════════════════════
// 8. Fecundidad
// ═══════════════════════════════════════════════════════════════
function generateFecundidad() {
  const slug = "fecundidad";
  const folder = path.join(RAW_DIR, "8- Fecundidad");
  const file = path.join(folder, "c2022_jujuy_fecundidad_c1_10.xlsx");
  const fileEdu = path.join(folder, "c2022_jujuy_fecundidad_c6_10.xlsx");
  const fileEdad = path.join(folder, "c2022_jujuy_fecundidad_c2_10.xlsx");
  const fileCob = path.join(folder, "c2022_jujuy_fecundidad_c3_10.xlsx");
  const fileAct = path.join(folder, "c2022_jujuy_fecundidad_c4_10.xlsx");

  const { total, departamentos } = extractCabaTable(readSheetRows(file, "Cuadro 1.10"));
  const eduRows = readSheetRows(fileEdu, "Cuadro 6.10");
  const edadRows = readSheetRows(fileEdad, "Cuadro 2.10");
  const cobRows = readSheetRows(fileCob, "Cuadro 3.10");
  const actRows = readSheetRows(fileAct, "Cuadro 4.10");

  // Cols: 0=Código, 1=Departamento, 2=Mujeres 14-49, 3=Ninguno, 4=1, 5=2, 6=3, 7=4, 8=5+, 9=Promedio
  const t = total.map(toNumber);
  const mujeres = t[2];
  const sinHijos = t[3];
  const sinHijosPct = (sinHijos / mujeres) * 100;
  const tresOMas = (t[6] || 0) + (t[7] || 0) + (t[8] || 0);
  const tresOMasPct = (tresOMas / mujeres) * 100;
  const promedioJujuy = t[9];

  const builder = new ReportBuilder("poblacion-fecundidad")
    .setMeta({
      title: "Fecundidad",
      subcategory: "Fecundidad",
      source: SOURCE,
      date: PERIOD,
    })
    .addKPI({ id: "mujeres-14-49", label: "Mujeres de 14 a 49 años", value: mujeres, formatted: formatCompact(mujeres) })
    .addKPI({ id: "promedio-hijos", label: "Promedio de hijos por mujer", value: promedioJujuy, formatted: formatDecimal(promedioJujuy, 1) })
    .addKPI({ id: "sin-hijos", label: "Mujeres sin hijos", value: sinHijosPct, formatted: formatPercent(sinHijosPct) })
    .addKPI({ id: "tres-o-mas", label: "Mujeres con 3 o más hijos", value: tresOMasPct, formatted: formatPercent(tresOMasPct) });

  // Chart: distribución cantidad hijos Jujuy (pie)
  const sectionDist = "Distribución por Cantidad de Hijos";
  const sidDist = slugify(sectionDist);
  builder.addChart({
    id: "pie-cant-hijos",
    type: "pie",
    title: "Cantidad de hijas e hijos nacidos vivos — Jujuy",
    sectionId: sidDist,
    sectionTitle: sectionDist,
    data: [
      { id: "Ninguno",  label: "Ninguno",  value: t[3] },
      { id: "1",        label: "1",        value: t[4] },
      { id: "2",        label: "2",        value: t[5] },
      { id: "3",        label: "3",        value: t[6] },
      { id: "4",        label: "4",        value: t[7] },
      { id: "5 y más",  label: "5 y más",  value: t[8] },
    ].filter(d => d.value > 0),
  });

  // Chart: promedio hijos por departamento
  const sectionProm = "Promedio de Hijos por Departamento";
  const sidProm = slugify(sectionProm);
  builder.addChart({
    id: "bar-prom-hijos-departamento",
    type: "bar",
    title: "Promedio de hijos por mujer — por departamento",
    sectionId: sidProm,
    sectionTitle: sectionProm,
    data: departamentos.map(({ departamento, row }) => ({
      departamento: departamento.nombre,
      "Promedio hijos": toNumber(row[9]) || 0,
    })),
    config: { xAxis: "departamento", yAxis: "Promedio hijos" },
  });

  // Ranking
  const rankedProm = [...departamentos].sort((a, b) => (toNumber(b.row[9]) || 0) - (toNumber(a.row[9]) || 0));
  builder.addRanking({
    id: "rank-prom-hijos",
    title: "Departamentos con mayor promedio de hijos",
    sectionId: sidProm,
    items: rankedProm.map(({ departamento, row }) => ({
      name: departamento.nombre,
      value: toNumber(row[9]) || 0,
      municipioId: departamento.codigo,
    })),
    order: "desc",
  });

  // Map: promedio hijos por departamento
  for (const { departamento, row } of departamentos) {
    const v = toNumber(row[9]) || 0;
    builder.addMapItem({
      municipioId: departamento.codigo,
      municipioNombre: departamento.nombre,
      value: v,
      label: `${formatDecimal(v, 1)} hijos/mujer`,
    });
  }

  // Chart: hijos por nivel educativo (de fecundidad_c6, agregando niveles)
  // Cols: 1=Mujeres, 2=Ninguno, 3=1, 4=2, 5=3, 6=4, 7=5+
  const sectionEdu = "Fecundidad y Educación";
  const sidEdu = slugify(sectionEdu);
  const groupBy = (matchers) => {
    const out = { mujeres: 0, ninguno: 0, total_hijos: 0, con_hijos: 0 };
    for (const r of eduRows) {
      const c0 = String(r?.[0] || "").trim();
      if (!matchers.some(m => m.test(c0))) continue;
      const m = toNumber(r[1]) || 0;
      const n = toNumber(r[2]) || 0;
      const h1 = toNumber(r[3]) || 0;
      const h2 = toNumber(r[4]) || 0;
      const h3 = toNumber(r[5]) || 0;
      const h4 = toNumber(r[6]) || 0;
      const h5 = toNumber(r[7]) || 0;
      out.mujeres += m;
      out.ninguno += n;
      out.con_hijos += h1 + h2 + h3 + h4 + h5;
      out.total_hijos += h1 + 2 * h2 + 3 * h3 + 4 * h4 + 5.5 * h5;
    }
    return out;
  };
  const grupos = [
    { label: "Sin instrucción / Primario", g: groupBy([/^Sin instrucci/i, /^Primario/i, /^EGB/i]) },
    { label: "Secundario / Polimodal",     g: groupBy([/^Secundario/i, /^Polimodal/i]) },
    { label: "Terciario no univ.",         g: groupBy([/^Terciario/i]) },
    { label: "Universitario",              g: groupBy([/^Universitario/i]) },
    { label: "Posgrado",                   g: groupBy([/^Posgrado/i]) },
  ];
  const eduData = grupos.map(({ label, g }) => ({
    nivel: label,
    "Promedio hijos": g.mujeres ? Math.round((g.total_hijos / g.mujeres) * 100) / 100 : 0,
    "% sin hijos": g.mujeres ? Math.round((g.ninguno / g.mujeres) * 1000) / 10 : 0,
  }));
  builder.addChart({
    id: "bar-fecundidad-educacion",
    type: "bar",
    title: "Promedio de hijos según máximo nivel educativo alcanzado",
    sectionId: sidEdu,
    sectionTitle: sectionEdu,
    data: eduData,
    config: { xAxis: "nivel", yAxis: "Promedio hijos" },
  });

  // Chart: promedio de hijos por grupo de edad (de fecundidad_c2)
  // Cols: 0=Edad, 1=Mujeres, 2=Ninguno, 3=1, 4=2, 5=3, 6=4, 7=5+, 8=Promedio
  const sectionFecEdad = "Fecundidad por Edad";
  const sidFecEdad = slugify(sectionFecEdad);
  const fecEdadData = [];
  for (const r of edadRows) {
    const c0 = String(r?.[0] || "").trim();
    if (!/^\d+(-\d+)?$/.test(c0)) continue;
    const prom = toNumber(r[8]);
    const muj = toNumber(r[1]);
    const ninguno = toNumber(r[2]);
    if (muj == null) continue;
    fecEdadData.push({
      edad: c0,
      "Promedio hijos": prom != null ? prom : 0,
      "% sin hijos":    muj ? Math.round((ninguno / muj) * 1000) / 10 : 0,
    });
  }
  builder.addChart({
    id: "line-fec-edad",
    type: "line",
    title: "Promedio de hijos y % sin hijos según edad — Jujuy",
    sectionId: sidFecEdad,
    sectionTitle: sectionFecEdad,
    data: fecEdadData,
    config: { xAxis: "edad", yAxis: "Valor" },
  });

  // Chart: hijos por cobertura de salud (de fecundidad_c3)
  // Cols: 0=Cobertura, 1=Mujeres, 2=Ninguno, 3=1, 4=2, 5=3, 6=4, 7=5+
  const sectionFecCob = "Fecundidad y Cobertura de Salud";
  const sidFecCob = slugify(sectionFecCob);
  const fecCobData = [];
  for (const r of cobRows) {
    const c0 = String(r?.[0] || "").trim();
    if (!c0 || /^Total$/i.test(c0) || c0.startsWith("(") || c0.startsWith("Cuadro") || c0.startsWith("Censo") || c0 === "Tipo de cobertura de salud") continue;
    const muj = toNumber(r[1]);
    if (!muj) continue;
    const total_hijos =
      (toNumber(r[3]) || 0) * 1 +
      (toNumber(r[4]) || 0) * 2 +
      (toNumber(r[5]) || 0) * 3 +
      (toNumber(r[6]) || 0) * 4 +
      (toNumber(r[7]) || 0) * 5.5;
    fecCobData.push({
      cobertura: c0.length > 32 ? c0.slice(0, 30) + "…" : c0,
      "Promedio hijos": Math.round((total_hijos / muj) * 100) / 100,
      "% sin hijos":    Math.round(((toNumber(r[2]) || 0) / muj) * 1000) / 10,
    });
    if (fecCobData.length >= 5) break;
  }
  builder.addChart({
    id: "bar-fec-cobertura",
    type: "bar",
    title: "Hijos según tipo de cobertura de salud",
    sectionId: sidFecCob,
    sectionTitle: sectionFecCob,
    data: fecCobData,
    config: { xAxis: "cobertura", yAxis: "Valor", grouped: true },
  });

  // Chart: hijos por condición de actividad (de fecundidad_c4)
  const sectionFecAct = "Fecundidad y Condición de Actividad";
  const sidFecAct = slugify(sectionFecAct);
  const fecActData = [];
  for (const r of actRows) {
    const c0 = String(r?.[0] || "").trim();
    if (!c0 || /^Total$/i.test(c0) || c0.startsWith("(") || c0.startsWith("Cuadro") || c0.startsWith("Censo") || c0 === "Condición de actividad") continue;
    const muj = toNumber(r[1]);
    if (!muj) continue;
    const total_hijos =
      (toNumber(r[3]) || 0) * 1 +
      (toNumber(r[4]) || 0) * 2 +
      (toNumber(r[5]) || 0) * 3 +
      (toNumber(r[6]) || 0) * 4 +
      (toNumber(r[7]) || 0) * 5.5;
    fecActData.push({
      condicion: c0.length > 32 ? c0.slice(0, 30) + "…" : c0,
      "Promedio hijos": Math.round((total_hijos / muj) * 100) / 100,
      "% sin hijos":    Math.round(((toNumber(r[2]) || 0) / muj) * 1000) / 10,
    });
    if (fecActData.length >= 6) break;
  }
  builder.addChart({
    id: "bar-fec-actividad",
    type: "bar",
    title: "Hijos según condición de actividad económica",
    sectionId: sidFecAct,
    sectionTitle: sectionFecAct,
    data: fecActData,
    config: { xAxis: "condicion", yAxis: "Valor", grouped: true },
  });

  const data = builder.build();

  // ─── Derivados para narrativa ejecutiva ───
  const desvFec = promedioJujuy - CENSO_2022.hijos_por_mujer_nacional;
  // Brechas departamentales
  const sortedProm = [...departamentos]
    .map(({ departamento, row }) => ({ nombre: departamento.nombre, valor: toNumber(row[9]) || 0 }))
    .sort((a, b) => b.valor - a.valor);
  const depMaxFec = sortedProm[0];
  const depMinFec = sortedProm[sortedProm.length - 1];
  const brechaDep = depMaxFec.valor - depMinFec.valor;

  // Fecundidad por educación (extremos)
  const fecEduSinPrim = eduData[0];
  const fecEduUniv = eduData.find(d => /Universitario/i.test(d.nivel));
  const brechaEdu = fecEduUniv && fecEduSinPrim ? fecEduSinPrim["Promedio hijos"] - fecEduUniv["Promedio hijos"] : null;

  const md = buildReportMd({
    ...data,
    intro: `Las mujeres de **14 a 49 años** en Jujuy suman **${formatInteger(mujeres)}**, con un promedio de **${formatDecimal(promedioJujuy, 1)} hijos por mujer**. El **${formatPercent(sinHijosPct)}** no tiene hijos al momento del Censo y el **${formatPercent(tresOMasPct)}** tiene 3 o más, evidenciando un patrón reproductivo en plena transición demográfica pero todavía con fecundidad acumulada superior al promedio nacional.`,

    executiveSummary: `La fecundidad acumulada de las mujeres jujeñas en edad fértil (**${formatDecimal(promedioJujuy, 1)} hijos por mujer**) se ubica ${desvFec >= 0 ? `**${formatDecimal(desvFec, 1)} hijos por encima**` : `**${formatDecimal(Math.abs(desvFec), 1)} hijos por debajo**`} del promedio nacional (**${formatDecimal(CENSO_2022.hijos_por_mujer_nacional, 1)}**). Este desvío confirma una característica estructural del NOA: la transición demográfica está en curso pero su ritmo es más lento que el del centro del país, donde la fecundidad ha caído por debajo del nivel de reemplazo de manera más temprana y sostenida.

La distribución por cantidad de hijos muestra la coexistencia de patrones reproductivos diversos: el **${formatPercent(sinHijosPct)}** de las mujeres en edad fértil no tiene hijos al momento del Censo (cifra que combina genuina nuliparidad con postergación reproductiva en cohortes jóvenes), mientras el **${formatPercent(tresOMasPct)}** ha tenido 3 o más. Esta dispersión refleja la coexistencia, en el territorio provincial, de trayectorias reproductivas tempranas y numerosas (más frecuentes en zonas rurales, comunidades indígenas, mujeres con menor escolarización) con trayectorias tardías y reducidas (más frecuentes en zonas urbanas, mujeres con educación superior y trayectoria laboral consolidada).

Las **brechas inter-departamentales** son significativas: el promedio oscila entre **${formatDecimal(depMaxFec.valor, 1)} hijos/mujer** en **${depMaxFec.nombre}** y **${formatDecimal(depMinFec.valor, 1)}** en **${depMinFec.nombre}** — una diferencia de **${formatDecimal(brechaDep, 1)} hijos** que replica la geografía socioeconómica y cultural de la provincia. Los departamentos puneños y los del Ramal con mayor ruralidad y mayor presencia indígena suelen presentar fecundidades más altas que el corredor central urbanizado.

La **correlación inversa entre fecundidad y educación** es el patrón más robusto del análisis: las mujeres con nivel universitario o de posgrado tienen sistemáticamente menos hijos que las mujeres con primario completo o menos. ${brechaEdu !== null ? `La brecha es de aproximadamente **${formatDecimal(brechaEdu, 1)} hijos por mujer** entre los extremos del gradiente educativo.` : ''} Este patrón refleja la postergación reproductiva asociada a trayectorias educativas largas y al ingreso al mercado laboral calificado, así como mayor acceso efectivo a métodos anticonceptivos modernos y a información reproductiva.`,

    keyFindings: [
      `**Fecundidad acumulada provincial:** **${formatDecimal(promedioJujuy, 1)} hijos/mujer** en edad 14-49 — ${desvFec >= 0 ? `**+${formatDecimal(desvFec, 1)}**` : `**${formatDecimal(desvFec, 1)}**`} hijos vs. promedio nacional (**${formatDecimal(CENSO_2022.hijos_por_mujer_nacional, 1)}**).`,
      `**Mujeres sin hijos:** **${formatPercent(sinHijosPct)}** al momento del Censo — combina genuina nuliparidad con postergación reproductiva en cohortes jóvenes en plena formación.`,
      `**Familias numerosas:** **${formatPercent(tresOMasPct)}** de las mujeres en edad fértil tiene 3 o más hijos — concentrado en zonas rurales, comunidades indígenas y mujeres con menor escolarización.`,
      `**Brecha territorial:** entre **${formatDecimal(depMaxFec.valor, 1)} hijos/mujer** (${depMaxFec.nombre}) y **${formatDecimal(depMinFec.valor, 1)}** (${depMinFec.nombre}) — diferencia de **${formatDecimal(brechaDep, 1)} hijos** que refleja heterogeneidad cultural y socioeconómica.`,
      `**Correlación inversa educación-fecundidad:** patrón robusto, con mujeres universitarias y de posgrado registrando promedios significativamente menores que las de primario o sin instrucción.`,
      `**Transición demográfica en curso:** la fecundidad provincial sigue cayendo (ritmo más lento que el promedio nacional), anticipando una desaceleración del crecimiento vegetativo en las próximas décadas.`,
    ],

    keyDatum: `**Dato destacado:** las **${formatInteger(mujeres)} mujeres jujeñas** en edad fértil tienen, en promedio, **${formatDecimal(promedioJujuy, 1)} hijos** — una fecundidad acumulada ${desvFec >= 0 ? `superior` : `inferior`} al promedio nacional (**${formatDecimal(CENSO_2022.hijos_por_mujer_nacional, 1)}**), que confirma una transición demográfica en curso pero más rezagada que la del centro del país.`,

    sectionNarratives: {
      [sidDist]: `La distribución por cantidad de hijos muestra la coexistencia de patrones reproductivos diversos. El **${formatPercent(sinHijosPct)}** sin hijos al momento del Censo combina dos fenómenos distintos: nuliparidad genuina (mujeres que nunca tendrán hijos) y postergación reproductiva en cohortes jóvenes que todavía están en plena trayectoria formativa o laboral. La distinción entre ambos solo puede hacerse analizando cohortes específicas: el % sin hijos cae monótonamente con la edad, alcanzando un piso al cierre del período fértil (45-49 años) que representa la nuliparidad efectiva.

El **${formatPercent(tresOMasPct)}** con 3+ hijos identifica al segmento de fecundidad alta, concentrado en zonas rurales, comunidades indígenas y mujeres con menor escolarización. Las mujeres con 1 o 2 hijos representan el grueso de la distribución y reflejan el modelo de familia mediana que se ha consolidado como predominante en Argentina.

El **promedio acumulado de ${formatDecimal(promedioJujuy, 1)} hijos/mujer** se ubica por encima del nivel de reemplazo (2.1 hijos/mujer), aunque viene cayendo de manera sostenida. La fecundidad provincial todavía sostiene crecimiento vegetativo positivo, característica que distingue al NOA del centro del país.`,

      [sidProm]: `La distribución territorial del promedio de hijos por mujer muestra una geografía clara: los departamentos del corredor central y urbano (capital, Palpalá) tienden a presentar promedios más bajos, mientras los departamentos puneños y rurales (incluyendo zonas del Ramal y de la Puna) registran los promedios más altos. **${depMaxFec.nombre}** lidera con **${formatDecimal(depMaxFec.valor, 1)} hijos/mujer**, contra **${formatDecimal(depMinFec.valor, 1)}** en **${depMinFec.nombre}** — una brecha de **${formatDecimal(brechaDep, 1)} hijos**.

Esta dispersión replica patrones observables a escala nacional e internacional: la fecundidad tiende a ser menor en zonas urbanas con mayor escolarización femenina, mayor inserción laboral de las mujeres, mayor acceso a métodos anticonceptivos y a información reproductiva. En zonas rurales y de mayor presencia indígena, los patrones de fecundidad responden a configuraciones culturales propias, a menor escolarización femenina y a menor acceso efectivo a servicios de salud reproductiva.

La política pública en salud reproductiva debe diseñar instrumentos sensibles a esta heterogeneidad, evitando enfoques uniformes que pueden ser inadecuados culturalmente o ineficaces operativamente en zonas con dinámicas propias.`,

      [sidEdu]: `La correlación inversa entre nivel educativo y fecundidad es uno de los patrones más robustos de la demografía contemporánea: las mujeres con educación superior tienen, en promedio, sustancialmente menos hijos que aquellas con menor escolarización. Este patrón refleja varios factores convergentes: postergación reproductiva asociada a trayectorias educativas largas, ingreso al mercado laboral calificado con costos de oportunidad altos de la maternidad temprana, mayor acceso efectivo a métodos anticonceptivos modernos, y mayor información sobre planificación familiar.

${brechaEdu !== null ? `La brecha educativa de la fecundidad en Jujuy alcanza aproximadamente **${formatDecimal(brechaEdu, 1)} hijos** entre las mujeres sin instrucción o con primario y las universitarias. ` : ''}Este gradiente educativo es un proxy de transformación social profunda: cada generación de mujeres con mayor escolarización contribuye a la desaceleración estructural de la fecundidad, en un proceso que la demografía denomina "transición demográfica de segundo orden".

La política educativa orientada a niñas y adolescentes —especialmente la finalización efectiva del secundario y el acceso a educación superior— es, en esta clave, también una política de salud reproductiva y de planificación familiar de largo plazo.`,

      [sidFecEdad]: `La fecundidad acumulada por edad muestra el patrón típico de cohortes: el promedio de hijos por mujer crece monótonamente con la edad y se estabiliza hacia el cierre del período fértil (45-49 años). El "% sin hijos" hace el camino inverso: muy alto en adolescencia y juventud (cuando la mayoría aún no ha iniciado vida reproductiva), cae rápidamente en la tercera década de vida y alcanza el piso de nuliparidad efectiva al cierre del período.

La diferencia entre el promedio de hijos al cierre del período fértil y el del inicio refleja la fecundidad de cohortes específicas. La caída sostenida que se observa en cohortes sucesivas más jóvenes (con menor fecundidad acumulada a la misma edad que sus madres y abuelas) es la marca demográfica más visible de la transición en curso.`,

      [sidFecCob]: `Las mujeres con obra social o prepaga muestran patrones de fecundidad más bajos que aquellas con cobertura estatal exclusiva o sin cobertura formal. La diferencia refleja perfiles socioeconómicos y educativos asociados a cada tipo de aseguramiento: la obra social se acopla al empleo formal, que a su vez se asocia con mayor escolarización y mayor inserción laboral femenina, factores ambos correlacionados con menor fecundidad acumulada.

Esta correlación no implica causalidad directa entre tipo de cobertura y fecundidad, sino que ambos indicadores reflejan posicionamientos socioeconómicos más amplios. La cobertura de salud pública —incluyendo programas específicos de salud sexual y reproductiva como el de Educación Sexual Integral (ESI) y el de provisión gratuita de anticonceptivos— tiene un rol decisivo en la accesibilidad efectiva a métodos de planificación familiar, especialmente en mujeres de menores recursos.`,

      [sidFecAct]: `Las mujeres ocupadas tienen menor promedio de hijos que las inactivas o desocupadas, patrón que refleja la tensión estructural entre trayectoria laboral y maternidad. Las amas de casa y mujeres no económicamente activas registran las tasas más altas de fecundidad acumulada, en línea con un modelo de organización familiar donde la maternidad y el cuidado se concentran como tarea exclusiva o principal.

Esta relación inversa entre fecundidad e inserción laboral femenina tiene implicancias estructurales para el desarrollo provincial: aumentar la participación laboral femenina —objetivo de política deseable por razones de equidad y de eficiencia económica— requiere simultáneamente desarrollar infraestructura de cuidado (jardines maternales, escolaridad de jornada completa, espacios de cuidado de adultos mayores) que permita compatibilizar maternidad y trabajo. La ausencia de esta infraestructura naturalmente penaliza la decisión reproductiva de las mujeres con trayectoria laboral consolidada y refuerza el patrón asimétrico actual.`,
    },

    nationalContext: `La fecundidad acumulada nacional de **${formatDecimal(CENSO_2022.hijos_por_mujer_nacional, 1)} hijos/mujer** marca un proceso de transición demográfica avanzado: Argentina se ubica por debajo del nivel de reemplazo (2.1) y registra una caída sostenida en cada cohorte sucesiva. Jujuy, con **${formatDecimal(promedioJujuy, 1)}**, se sitúa por encima de este promedio, replicando el patrón del NOA: transición en curso pero más lenta que en el centro del país.

Las provincias con menor fecundidad acumulada (CABA, Tierra del Fuego, Santa Cruz, La Pampa) muestran promedios por debajo del reemplazo, con poblaciones envejecidas que crecen principalmente por migración interna o internacional. Las provincias del NOA (Jujuy, Salta, Tucumán, Catamarca, La Rioja, Santiago del Estero) y NEA mantienen fecundidades por encima del promedio nacional, lo que sostiene crecimiento vegetativo positivo y estructuras etarias más jóvenes.

La **brecha educativa de la fecundidad** es transversal a todas las provincias: mujeres con mayor escolarización tienen sistemáticamente menos hijos. La intensidad de esta brecha varía: en provincias con mayor expansión educativa femenina, la brecha es mayor en términos absolutos pero el promedio agregado provincial es menor; en provincias con menor escolarización femenina (como aún ocurre en algunas zonas del NOA y NEA), el promedio agregado es mayor pero la brecha intra-provincial puede ser igualmente significativa.

La política de salud reproductiva —Ley de Educación Sexual Integral (ESI), Plan ENIA de prevención del embarazo no intencional adolescente, provisión gratuita de anticonceptivos en el sistema público, Ley IVE/ILE— configura el marco nacional que sustenta la transición demográfica en curso.`,

    policyImplications: `La dinámica reproductiva jujeña señala tres tensiones estructurales relevantes para la política pública. La primera es la **transición demográfica en curso con ritmo heterogéneo**: la fecundidad agregada cae, pero a velocidades muy distintas según el territorio, el nivel educativo y el contexto cultural. Las políticas de salud reproductiva universales son necesarias pero insuficientes: la accesibilidad efectiva a información, anticonceptivos y atención prenatal/postnatal requiere instrumentos sensibles a la heterogeneidad cultural y geográfica de la provincia, especialmente en zonas rurales y de comunidades indígenas con cosmovisiones propias sobre maternidad y familia.

La segunda tensión es el **embarazo no intencional adolescente**: aunque la fecundidad adolescente ha caído significativamente en Argentina en la última década gracias al Plan ENIA y a la ESI, persisten brechas territoriales y socioeconómicas. En provincias del NOA, las tasas de fecundidad adolescente siguen siendo mayores que el promedio nacional, con consecuencias directas sobre trayectorias educativas (abandono escolar), inserción laboral futura y reproducción intergeneracional de la pobreza.

La tercera dimensión es la **conciliación entre maternidad y trayectoria laboral femenina**: la baja fecundidad de las mujeres ocupadas refleja, en parte, la ausencia de infraestructura de cuidado que permita compatibilizar ambas dimensiones. Avanzar en la igualdad efectiva de oportunidades laborales de las mujeres requiere, simultáneamente, desarrollar la oferta de servicios de cuidado (jardines maternales públicos, escolaridad de jornada extendida, redes de cuidado de adultos mayores), una agenda que excede el ámbito sectorial de salud reproductiva pero que es estructuralmente complementaria a ella.

Por último, el envejecimiento poblacional que la caída de la fecundidad anticipa (hoy oculto por el bono demográfico aún vigente) configurará en las próximas décadas una nueva agenda de cuidados, pensiones y atención sanitaria de larga duración que requiere planificación estructural temprana.`,
  });
  persist(slug, data, md);
}

// ═══════════════════════════════════════════════════════════════
// 9. Seguridad — SNIC (Sistema Nacional de Información Criminal)
// ═══════════════════════════════════════════════════════════════
function generateSeguridad() {
  const slug = "seguridad";
  const fileDept = path.join(SEC_DIR, "snic-jujuy-departamental.csv");
  const fileProv = path.join(SEC_DIR, "snic-provincial.csv");

  if (!fs.existsSync(fileDept)) {
    console.log(`  ⏭️  Seguridad: ${path.relative(ROOT, fileDept)} no existe. Skip.`);
    return;
  }

  const rowsDept = readCsv(fileDept);     // Jujuy por departamento
  const rowsProv = readCsv(fileProv);     // Argentina por provincia

  // Año más reciente disponible
  const yearsAvail = [...new Set(rowsDept.map(r => parseInt(r.anio, 10)).filter(n => Number.isFinite(n)))].sort((a, b) => b - a);
  const latest = yearsAvail[0];
  const prev = yearsAvail[1];

  // Subset año actual y previo, solo Jujuy por departamento (excluyendo "Departamento sin determinar")
  const isDepartamento = (name) => /^Departamento\s+\d+$/i.test(String(name || "").trim());
  const dCurrent = rowsDept.filter(r => +r.anio === latest && isDepartamento(r.departamento_nombre));
  const dPrev    = rowsDept.filter(r => +r.anio === prev    && isDepartamento(r.departamento_nombre));

  // Categorías clave para KPI/charts (los nombres deben coincidir EXACTAMENTE con el CSV)
  const KEY = {
    homDol:   "Homicidios dolosos",
    robos:    "Robos (excluye los agravados por el resultado de lesiones y/o muertes)",
    hurtos:   "Hurtos",
    lesiones: "Lesiones dolosas",
    muertesViales: "Muertes en accidentes viales",
    suicidios: "Suicidios (consumados)",
    abusosCarnal: "Abusos sexuales con acceso carnal (violaciones)",
    estafas:  "Estafas y defraudaciones (no incluye virtuales) y usura",
    estafasVirt: "Estafas y defraudaciones asistidas virtualmente",
    estupef:  "Ley 23.737 (estupefacientes)",
    amenazas: "Amenazas",
    robosAgr: "Robos agravados por el resultado de lesiones y/o muertes",
  };

  // Sumar `cantidad_hechos` para una categoría en un set de filas
  const sumHechos = (rows, categoria) => rows
    .filter(r => r.codigo_delito_snic_nombre === categoria)
    .reduce((s, r) => s + (parseInt(r.cantidad_hechos, 10) || 0), 0);

  const sumVictimas = (rows, categoria) => rows
    .filter(r => r.codigo_delito_snic_nombre === categoria)
    .reduce((s, r) => s + (parseInt(r.cantidad_victimas, 10) || 0), 0);

  // Totales Jujuy año actual
  const homDol = sumHechos(dCurrent, KEY.homDol);
  const homDolPrev = sumHechos(dPrev, KEY.homDol);
  const robos = sumHechos(dCurrent, KEY.robos);
  const robosAgr = sumHechos(dCurrent, KEY.robosAgr);
  const hurtos = sumHechos(dCurrent, KEY.hurtos);
  const lesiones = sumHechos(dCurrent, KEY.lesiones);
  const muertesViales = sumHechos(dCurrent, KEY.muertesViales);
  const suicidios = sumHechos(dCurrent, KEY.suicidios);
  const totalHechos = dCurrent.reduce((s, r) => s + (parseInt(r.cantidad_hechos, 10) || 0), 0);
  const variacionHomDol = homDolPrev ? ((homDol - homDolPrev) / homDolPrev) * 100 : 0;

  const builder = new ReportBuilder("seguridad")
    .setMeta({
      title: "Seguridad y Estadísticas Criminales",
      category: "Seguridad",
      subcategory: "Estadísticas Criminales",
      source: SOURCE_SNIC,
      date: String(latest),
    })
    .addKPI({ id: "homicidios-dolosos", label: "Homicidios dolosos", value: homDol, formatted: formatInteger(homDol), unit: "casos", comparison: prev ? `${variacionHomDol >= 0 ? "+" : ""}${formatDecimal(variacionHomDol, 1)}% vs ${prev}` : undefined, status: homDol > 100 ? "warning" : undefined })
    .addKPI({ id: "robos", label: "Robos", value: robos + robosAgr, formatted: formatCompact(robos + robosAgr), unit: "casos", comparison: "incluye agravados" })
    .addKPI({ id: "hurtos", label: "Hurtos", value: hurtos, formatted: formatCompact(hurtos), unit: "casos" })
    .addKPI({ id: "lesiones-dolosas", label: "Lesiones dolosas", value: lesiones, formatted: formatCompact(lesiones), unit: "casos" })
    .addKPI({ id: "muertes-viales", label: "Muertes en accidentes viales", value: muertesViales, formatted: formatInteger(muertesViales), unit: "casos" })
    .addKPI({ id: "suicidios", label: "Suicidios", value: suicidios, formatted: formatInteger(suicidios), unit: "casos" })
    .addKPI({ id: "total-hechos", label: "Total de hechos delictivos registrados", value: totalHechos, formatted: formatCompact(totalHechos) });

  // Chart: top categorías de delito en Jujuy (último año)
  const sectionTop = "Principales Tipos de Delito";
  const sidTop = slugify(sectionTop);
  const topCategorias = [
    { label: "Hurtos",                          v: hurtos },
    { label: "Robos",                           v: robos },
    { label: "Robos agravados",                 v: robosAgr },
    { label: "Lesiones dolosas",                v: lesiones },
    { label: "Amenazas",                        v: sumHechos(dCurrent, KEY.amenazas) },
    { label: "Estupefacientes (Ley 23.737)",    v: sumHechos(dCurrent, KEY.estupef) },
    { label: "Estafas",                         v: sumHechos(dCurrent, KEY.estafas) + sumHechos(dCurrent, KEY.estafasVirt) },
    { label: "Abusos sexuales (con acceso carnal)", v: sumHechos(dCurrent, KEY.abusosCarnal) },
    { label: "Muertes viales",                  v: muertesViales },
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

  // Chart: serie temporal — homicidios, robos, hurtos por año
  const sectionSerie = "Evolución Temporal";
  const sidSerie = slugify(sectionSerie);
  const yearsSeries = [...new Set(rowsDept.map(r => parseInt(r.anio, 10)).filter(n => Number.isFinite(n) && n >= 2017 && n <= latest))].sort();
  const sumByYear = (categoria) => yearsSeries.map(y => {
    const sum = rowsDept
      .filter(r => +r.anio === y && isDepartamento(r.departamento_nombre) && r.codigo_delito_snic_nombre === categoria)
      .reduce((s, r) => s + (parseInt(r.cantidad_hechos, 10) || 0), 0);
    return { anio: String(y), valor: sum };
  });
  const serieData = yearsSeries.map(y => {
    const filt = rowsDept.filter(r => +r.anio === y && isDepartamento(r.departamento_nombre));
    const hd = filt.filter(r => r.codigo_delito_snic_nombre === KEY.homDol).reduce((s, r) => s + (parseInt(r.cantidad_hechos, 10) || 0), 0);
    const hu = filt.filter(r => r.codigo_delito_snic_nombre === KEY.hurtos).reduce((s, r) => s + (parseInt(r.cantidad_hechos, 10) || 0), 0);
    const ro = filt.filter(r => r.codigo_delito_snic_nombre === KEY.robos).reduce((s, r) => s + (parseInt(r.cantidad_hechos, 10) || 0), 0);
    return { anio: String(y), "Homicidios dolosos": hd, "Hurtos": hu, "Robos": ro };
  });
  builder.addChart({
    id: "line-serie-temporal",
    type: "line",
    title: `Evolución 2017-${latest} de delitos clave — Jujuy`,
    sectionId: sidSerie,
    sectionTitle: sectionSerie,
    data: serieData,
    config: { xAxis: "anio", yAxis: "Hechos" },
  });

  // Chart: tasa de hechos por departamento (último año, todas las categorías sumadas)
  const sectionDepartamento = "Hechos Delictivos por Departamento";
  const sidDepartamento = slugify(sectionDepartamento);
  // Agrupar por departamento sumando todos los delitos, y tasa promedio de las filas con tasa > 0
  const byDepartamento = new Map();
  for (const r of dCurrent) {
    const nm = String(r.departamento_nombre || "").trim();
    if (!isDepartamento(nm)) continue;
    const slot = byDepartamento.get(nm) || { hechos: 0, tasaSum: 0, tasaCount: 0 };
    slot.hechos += parseInt(r.cantidad_hechos, 10) || 0;
    const t = parseFloat(r.tasa_hechos);
    if (Number.isFinite(t) && t > 0) { slot.tasaSum += t; slot.tasaCount++; }
    byDepartamento.set(nm, slot);
  }

  const dataDepartamento = DEPARTAMENTOS_JUJUY.map(c => {
    const slot = byDepartamento.get(c.nombre) || { hechos: 0, tasaSum: 0, tasaCount: 0 };
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
    title: `Hechos delictivos totales por departamento — ${latest}`,
    sectionId: sidDepartamento,
    sectionTitle: sectionDepartamento,
    data: dataDepartamento.map(d => ({ departamento: d.departamento, Hechos: d.hechos })),
    config: { xAxis: "departamento", yAxis: "Hechos" },
  });

  // Ranking por hechos absolutos por departamento
  builder.addRanking({
    id: "rank-hechos-departamento",
    title: "Departamentos con más hechos delictivos",
    sectionId: sidDepartamento,
    items: [...dataDepartamento].sort((a, b) => b.hechos - a.hechos).map(d => ({
      name: d.departamento,
      value: d.hechos,
      municipioId: d.municipioId,
    })),
    order: "desc",
  });

  // Chart: víctimas por sexo (acumulado año actual, top 4 categorías violentas)
  const sectionVic = "Víctimas por Sexo";
  const sidVic = slugify(sectionVic);
  const violentas = [KEY.homDol, KEY.robos, KEY.lesiones, KEY.abusosCarnal];
  const vicData = violentas.map(cat => {
    const filt = dCurrent.filter(r => r.codigo_delito_snic_nombre === cat);
    const masc = filt.reduce((s, r) => s + (parseInt(r.cantidad_victimas_masc, 10) || 0), 0);
    const fem = filt.reduce((s, r) => s + (parseInt(r.cantidad_victimas_fem, 10) || 0), 0);
    return { delito: cat.length > 30 ? cat.slice(0, 28) + "…" : cat, Mujeres: fem, Varones: masc };
  });
  builder.addChart({
    id: "bar-victimas-sexo",
    type: "bar",
    title: "Víctimas por sexo según delito (categorías violentas)",
    sectionId: sidVic,
    sectionTitle: sectionVic,
    data: vicData,
    config: { xAxis: "delito", yAxis: "Víctimas", grouped: true },
  });

  // Comparativo provincial: tasa de homicidios por jurisdicción (top 12)
  const sectionProv = "Comparativo Nacional";
  const sidProv = slugify(sectionProv);
  const provYear = rowsProv.filter(r => +r.anio === latest && r.codigo_delito_snic_nombre === KEY.homDol);
  const provData = provYear
    .map(r => ({
      provincia: String(r.provincia_nombre || ""),
      "Tasa homicidios": parseFloat(r.tasa_hechos) || 0,
    }))
    .filter(d => d.provincia && d["Tasa homicidios"] >= 0)
    .sort((a, b) => b["Tasa homicidios"] - a["Tasa homicidios"])
    .slice(0, 15);
  builder.addChart({
    id: "bar-homicidios-provincias",
    type: "bar",
    title: `Tasa de homicidios dolosos por provincia — ${latest}`,
    sectionId: sidProv,
    sectionTitle: sectionProv,
    data: provData,
    config: { xAxis: "provincia", yAxis: "Tasa (cada 100.000 hab.)", layout: "horizontal" },
  });

  // mapData: hechos por departamento
  for (const d of dataDepartamento) {
    builder.addMapItem({
      municipioId: d.municipioId,
      municipioNombre: d.departamento,
      value: d.hechos,
      label: `${formatInteger(d.hechos)} hechos`,
    });
  }

  const data = builder.build();

  // Jujuy homicidios → posición en ranking provincial
  const jujuyHomEntry = provData.find(d => /jujuy/i.test(d.provincia));
  const posJujuy = jujuyHomEntry ? provData.indexOf(jujuyHomEntry) + 1 : null;

  const md = buildReportMd({
    ...data,
    intro: `En **${latest}**, Jujuy registró **${formatInteger(homDol)} homicidios dolosos** (${variacionHomDol >= 0 ? "↑" : "↓"} ${formatDecimal(Math.abs(variacionHomDol), 1)}% vs ${prev}), **${formatInteger(robos + robosAgr)} robos** y **${formatInteger(hurtos)} hurtos**. La tasa de homicidios la ubica${posJujuy ? ` en el puesto ${posJujuy} de 24 jurisdicciones del país` : ""}, evidenciando un perfil delictivo dominado por delitos contra la propiedad antes que por violencia letal.`,
    sectionNarratives: {
      [sidTop]: `La estructura del delito en Jujuy muestra el predominio absoluto de hurtos y robos, característico de grandes centros urbanos. Las categorías violentas (homicidios dolosos, lesiones graves) son comparativamente bajas en términos absolutos pero representan el mayor impacto social.`,
      [sidSerie]: `La evolución 2017-${latest} permite identificar tendencias estructurales. La pandemia de 2020 marcó un quiebre con caídas históricas en hurtos y robos por la reducción de la circulación, seguido de una recomposición gradual.`,
      [sidDepartamento]: `La distribución territorial del delito refleja patrones de concentración urbana, flujo de trabajadores, comercios y nodos de transporte. Las departamentos céntricas suelen liderar los rankings absolutos por concentración de actividad económica.`,
      [sidVic]: `La distribución por sexo de las víctimas varía según el delito: en homicidios dolosos las víctimas son predominantemente varones, mientras que los abusos sexuales con acceso carnal afectan en su gran mayoría a mujeres. Estos patrones son consistentes con la literatura criminológica internacional.`,
      [sidProv]: `Comparada con el resto del país, Jujuy presenta una tasa de homicidios dolosos por debajo del promedio nacional, ubicándose habitualmente entre las jurisdicciones más seguras del país en este indicador, contrastando con su mayor incidencia de delitos contra la propiedad.`,
    },
  });

  fs.writeFileSync(path.join(PUBLIC_DATA, "seguridad.json"), JSON.stringify(data, null, 2));
  fs.writeFileSync(path.join(PUBLIC_REPORTS, "seguridad.md"), md);
  console.log(`  ✅ seguridad.json (${data.kpis.length} KPIs, ${data.charts.length} charts, ${data.rankings.length} rankings, ${data.mapData.length} map items) — año ${latest}`);
}

// ═══════════════════════════════════════════════════════════════
// Main
// ═══════════════════════════════════════════════════════════════
function main() {
  console.log("\n╔══════════════════════════════════════════════════════════╗");
  console.log("║   Jujuy — Census + Security Report Data Generator       ║");
  console.log("╚══════════════════════════════════════════════════════════╝\n");

  const generators = [
    generateEstructura,
    generateHabitacionalPersonas,
    generateSaludPrevision,
    generateHabitacionalHogares,
    generateViviendas,
    generateEducacionCensal,
    generateEconomia,
    generateFecundidad,
    generateSeguridad,
  ];

  let failed = 0;
  for (const gen of generators) {
    try {
      gen();
    } catch (err) {
      console.error(`  ❌ Error in ${gen.name}: ${err.message}`);
      console.error(err.stack);
      failed++;
    }
  }

  console.log(failed === 0
    ? `\n  ✅ ${generators.length} informes generados\n`
    : `\n  ⚠️  ${failed}/${generators.length} fallaron\n`);

  if (failed > 0) process.exit(1);
}

main();
