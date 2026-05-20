/**
 * process-empleo.cjs
 *
 * Genera public/data/empleo/economia.json + public/reports/empleo/economia.md
 *
 * Fuente:
 *   SSPM — Subsecretaría de Planificación y Modernización
 *   Asalariados registrados del sector privado por provincia
 *   (serie sin estacionalidad, mensual 2009+)
 */

const fs = require("fs");
const path = require("path");

const Papa = require("papaparse");
const { ReportBuilder, slugify } = require("./lib/report-builder.cjs");
const { buildReportMd } = require("./lib/markdown-builder.cjs");
const { formatInteger, formatDecimal } = require("./lib/formatters.cjs");
const { SSPM_REFERENCIA, CENSO_2022, NOA_INFO } = require("./lib/contexto-nacional.cjs");
const { interpretarSerie, resumenTendencia } = require("./lib/tendencias.cjs");

const ROOT = path.resolve(__dirname, "..");
const DATASETS = path.resolve("C:/Users/dante/Desktop/Laboratorio Colossus/Pipeline OpenArg/datos_abiertos/datasets/sspm");

const FILE_SIN_EST = path.join(
  DATASETS,
  "sspm-asalariados-registrados-sector-privado-por-provincia",
  "asalariados-registrados-del-sector-privado,-por-provincia.-valores-sin-estacionalidad.csv"
);

const OUT_JSON = path.join(ROOT, "public", "data", "empleo", "economia.json");
const OUT_MD = path.join(ROOT, "public", "reports", "empleo", "economia.md");

const SOURCE = "SSPM — Subsecretaría de Planificación y Modernización · Asalariados registrados del sector privado por provincia (sin estacionalidad)";

function readCsv(file) {
  const text = fs.readFileSync(file, "utf8").replace(/^﻿/, "");
  return Papa.parse(text, { header: true, skipEmptyLines: true }).data;
}

function main() {
  if (!fs.existsSync(FILE_SIN_EST)) {
    console.error("❌ Empleo SSPM CSV no encontrado. Skip.");
    return;
  }

  const rows = readCsv(FILE_SIN_EST)
    .map(r => ({
      fecha: String(r.indice_tiempo || "").trim(),
      jujuy_miles: parseFloat(r.asalariados_priv_sin_estac_jujuy) || 0,
    }))
    .filter(r => /^\d{4}-\d{2}-\d{2}$/.test(r.fecha) && r.jujuy_miles > 0);

  if (rows.length === 0) {
    console.error("❌ Sin filas válidas en CSV de empleo. Skip.");
    return;
  }

  rows.sort((a, b) => a.fecha.localeCompare(b.fecha));
  const latestRow = rows[rows.length - 1];
  const firstRow = rows[0];
  const latestYear = latestRow.fecha.slice(0, 4);
  const firstYear = firstRow.fecha.slice(0, 4);
  // Buscar misma fecha año anterior (para var. interanual)
  const sameDayYearAgo = rows.find(r => r.fecha === `${parseInt(latestYear, 10) - 1}-${latestRow.fecha.slice(5)}`);
  // Convertir miles → unidades
  const latestVal = Math.round(latestRow.jujuy_miles * 1000);
  const firstVal = Math.round(firstRow.jujuy_miles * 1000);
  const varAcum = ((latestRow.jujuy_miles - firstRow.jujuy_miles) / firstRow.jujuy_miles) * 100;
  const varInter = sameDayYearAgo
    ? ((latestRow.jujuy_miles - sameDayYearAgo.jujuy_miles) / sameDayYearAgo.jujuy_miles) * 100
    : 0;
  const maxRow = rows.reduce((a, b) => (a.jujuy_miles > b.jujuy_miles ? a : b));
  const minRow = rows.reduce((a, b) => (a.jujuy_miles < b.jujuy_miles ? a : b));

  const builder = new ReportBuilder("empleo-economia")
    .setMeta({
      title: "Empleo Registrado y Economía",
      category: "Economía",
      subcategory: "Empleo SSPM",
      source: SOURCE,
      date: latestRow.fecha,
    })
    .addKPI({
      id: "asalariados-latest",
      label: `Asalariados privados (${latestRow.fecha.slice(0, 7)})`,
      value: latestVal,
      formatted: formatInteger(latestVal),
      unit: "personas",
    })
    .addKPI({
      id: "var-interanual",
      label: "Variación interanual",
      value: varInter,
      formatted: `${varInter >= 0 ? "+" : ""}${formatDecimal(varInter, 1)}%`,
      status: varInter >= 0 ? "good" : "warning",
      comparison: sameDayYearAgo ? `vs ${sameDayYearAgo.fecha.slice(0, 7)}` : "—",
    })
    .addKPI({
      id: "var-acumulada",
      label: `Variación desde ${firstYear}`,
      value: varAcum,
      formatted: `${varAcum >= 0 ? "+" : ""}${formatDecimal(varAcum, 1)}%`,
      comparison: `vs ${firstRow.fecha.slice(0, 7)}`,
    })
    .addKPI({
      id: "max-historico",
      label: "Máximo histórico",
      value: Math.round(maxRow.jujuy_miles * 1000),
      formatted: formatInteger(Math.round(maxRow.jujuy_miles * 1000)),
      comparison: maxRow.fecha.slice(0, 7),
    })
    .addKPI({
      id: "min-historico",
      label: "Mínimo histórico",
      value: Math.round(minRow.jujuy_miles * 1000),
      formatted: formatInteger(Math.round(minRow.jujuy_miles * 1000)),
      comparison: minRow.fecha.slice(0, 7),
    })
    .addKPI({
      id: "cobertura",
      label: "Cobertura de la serie",
      value: rows.length,
      formatted: `${firstYear}–${latestYear}`,
      unit: `${rows.length} obs.`,
    });

  // ─── CHART 1: Serie mensual completa ───
  const sectionSerie = "Evolución del Empleo Registrado";
  const sidSerie = slugify(sectionSerie);
  const serieMensual = rows.map(r => ({
    fecha: r.fecha.slice(0, 7),
    Asalariados: Math.round(r.jujuy_miles * 1000),
  }));
  builder.addChart({
    id: "line-serie-empleo",
    type: "line",
    title: `Asalariados privados registrados — Jujuy ${firstYear}-${latestYear}`,
    sectionId: sidSerie,
    sectionTitle: sectionSerie,
    data: serieMensual,
    config: { xAxis: "fecha", yAxis: "Asalariados" },
  });

  // ─── CHART 2: Promedio anual ───
  const sectionAnual = "Promedio Anual";
  const sidAnual = slugify(sectionAnual);
  const byYear = new Map();
  for (const r of rows) {
    const y = r.fecha.slice(0, 4);
    const slot = byYear.get(y) || { sum: 0, count: 0 };
    slot.sum += r.jujuy_miles * 1000;
    slot.count++;
    byYear.set(y, slot);
  }
  const promedioAnual = [...byYear.entries()]
    .map(([y, s]) => ({ anio: y, "Promedio asalariados": Math.round(s.sum / s.count) }))
    .sort((a, b) => a.anio.localeCompare(b.anio));
  builder.addChart({
    id: "bar-prom-anual",
    type: "bar",
    title: `Promedio anual de asalariados — Jujuy`,
    sectionId: sidAnual,
    sectionTitle: sectionAnual,
    data: promedioAnual,
    config: { xAxis: "anio", yAxis: "Promedio asalariados" },
  });

  // ─── CHART 3: Variación interanual (TIE) ───
  const sectionVar = "Variación Interanual";
  const sidVar = slugify(sectionVar);
  const variaciones = [];
  for (let i = 12; i < rows.length; i += 6) {
    const r = rows[i];
    const ago = rows[i - 12];
    if (ago && ago.jujuy_miles > 0) {
      variaciones.push({
        fecha: r.fecha.slice(0, 7),
        "Var. interanual (%)": Math.round(((r.jujuy_miles - ago.jujuy_miles) / ago.jujuy_miles) * 1000) / 10,
      });
    }
  }
  builder.addChart({
    id: "line-var-interanual",
    type: "line",
    title: `Variación interanual del empleo — Jujuy`,
    sectionId: sidVar,
    sectionTitle: sectionVar,
    data: variaciones,
    config: { xAxis: "fecha", yAxis: "Var. interanual (%)" },
  });

  const data = builder.build();

  // ─── Datos derivados para narrativa ejecutiva ───
  const POB_JUJUY_2022 = 811611;
  const shareNacional = SSPM_REFERENCIA.asalariados_priv_nacional_aprox
    ? (latestVal / SSPM_REFERENCIA.asalariados_priv_nacional_aprox) * 100
    : 0;
  const sharePoblacionNacional = (POB_JUJUY_2022 / CENSO_2022.poblacionArgentina) * 100;
  // Cobertura: asalariados privados / población
  const ratioAsalPob = POB_JUJUY_2022 ? (latestVal / POB_JUJUY_2022) * 100 : 0;
  // Distancia al máximo histórico
  const distAlMax = ((latestVal - Math.round(maxRow.jujuy_miles * 1000)) / Math.round(maxRow.jujuy_miles * 1000)) * 100;
  const longitudSerieMeses = rows.length;
  const longitudSerieAnios = Math.round(longitudSerieMeses / 12);

  // Serie anual para interpretar quiebres
  const serieAnualParaAnalisis = [...byYear.entries()]
    .map(([y, s]) => ({ anio: parseInt(y, 10), valor: Math.round(s.sum / s.count) }))
    .sort((a, b) => a.anio - b.anio);
  const interpEmpleo = interpretarSerie(serieAnualParaAnalisis, { umbralVariacion: 5, magnitudLabel: "asalariados privados" });
  const tendEmpleo = resumenTendencia(serieAnualParaAnalisis, 3);

  // Variación promedio últimos 3 años vs 3 años previos a la pandemia
  const prom2017_2019 = serieAnualParaAnalisis.filter(d => d.anio >= 2017 && d.anio <= 2019).reduce((s, d) => s + d.valor, 0) / 3;
  const prom2023_2025 = serieAnualParaAnalisis.filter(d => d.anio >= 2023).reduce((s, d, _, arr) => s + d.valor / arr.length, 0);
  const recupPostCovid = prom2017_2019 > 0 ? ((prom2023_2025 - prom2017_2019) / prom2017_2019) * 100 : 0;

  const md = buildReportMd({
    ...data,

    intro: `En **${latestRow.fecha.slice(0, 7)}**, Jujuy contaba con **${formatInteger(latestVal)} asalariados registrados** en el sector privado según la serie sin estacionalidad de SSPM (${varInter >= 0 ? "↑" : "↓"} **${formatDecimal(Math.abs(varInter), 1)}%** interanual, ${varAcum >= 0 ? "↑" : "↓"} **${formatDecimal(Math.abs(varAcum), 1)}%** acumulado desde ${firstRow.fecha.slice(0, 7)}). Esto representa el **${formatDecimal(shareNacional, 2)}%** del empleo privado registrado nacional, contra una participación poblacional del **${formatDecimal(sharePoblacionNacional, 2)}%**.`,

    executiveSummary: `El empleo registrado privado en Jujuy alcanzó **${formatInteger(latestVal)} asalariados** en ${latestRow.fecha.slice(0, 7)}, configurando una estructura laboral con dos rasgos característicos del NOA. Primero, una baja densidad relativa de empleo privado formal: los **${formatInteger(latestVal)} asalariados** representan apenas el **${formatDecimal(ratioAsalPob, 1)}%** de la población provincial, una cobertura sustancialmente menor a la observada en jurisdicciones del centro del país (CABA, Buenos Aires, Córdoba, Santa Fe). Segundo, una participación del **${formatDecimal(shareNacional, 2)}%** en el total nacional, por debajo del peso poblacional de la provincia (**${formatDecimal(sharePoblacionNacional, 2)}%**), un indicador del subpeso estructural del sector privado registrado en la matriz económica jujeña.

La serie ${firstRow.fecha.slice(0, 7)}–${latestRow.fecha.slice(0, 7)} cubre **${longitudSerieMeses} observaciones mensuales** (aproximadamente ${longitudSerieAnios} años de panel continuo), lo que permite leer la trayectoria del empleo registrado en clave de ciclos macroeconómicos. ${interpEmpleo} El nivel actual se ubica a **${formatDecimal(distAlMax, 1)}%** del máximo histórico registrado en ${maxRow.fecha.slice(0, 7)}, con un mínimo histórico de **${formatInteger(Math.round(minRow.jujuy_miles * 1000))}** asalariados en ${minRow.fecha.slice(0, 7)}.

En el último ciclo, la dinámica muestra ${tendEmpleo}. Comparando el promedio 2017-2019 (${formatInteger(Math.round(prom2017_2019))}) con el de los últimos años (${formatInteger(Math.round(prom2023_2025))}), la variación acumulada en este sub-período fue de **${recupPostCovid >= 0 ? "+" : ""}${formatDecimal(recupPostCovid, 1)}%**, indicador de la magnitud (o limitación) de la recuperación post-pandémica del empleo privado registrado en la provincia.

Es importante señalar la cobertura analítica de esta serie: el indicador SSPM mide exclusivamente el **empleo asalariado privado registrado** ante la seguridad social. Quedan fuera del registro el empleo público provincial y municipal (particularmente relevante en Jujuy, donde el Estado provincial es uno de los principales empleadores), el empleo informal, el trabajo independiente no registrado, el cuentapropismo y la economía social. Por tanto, los movimientos de la serie reflejan la dinámica del sector privado formal, no la situación ocupacional del conjunto de la fuerza de trabajo jujeña.`,

    keyFindings: [
      `**Stock de empleo privado registrado:** ${formatInteger(latestVal)} asalariados en ${latestRow.fecha.slice(0, 7)} — el **${formatDecimal(shareNacional, 2)}%** del total nacional, contra una participación poblacional del **${formatDecimal(sharePoblacionNacional, 2)}%**.`,
      `**Variación interanual:** ${varInter >= 0 ? "creación" : "destrucción"} neta del **${formatDecimal(Math.abs(varInter), 1)}%** respecto a ${sameDayYearAgo ? sameDayYearAgo.fecha.slice(0, 7) : "—"}, dentro del rango característico de un mercado laboral con baja volatilidad mensual.`,
      `**Trayectoria de largo plazo:** variación acumulada del **${varAcum >= 0 ? "+" : ""}${formatDecimal(varAcum, 1)}%** desde ${firstRow.fecha.slice(0, 7)} (~${longitudSerieAnios} años), con un pico histórico en ${maxRow.fecha.slice(0, 7)} (${formatInteger(Math.round(maxRow.jujuy_miles * 1000))} asalariados).`,
      `**Distancia al máximo:** el nivel actual se ubica a **${formatDecimal(distAlMax, 1)}%** del máximo histórico, indicador clave para evaluar si la economía formal recuperó plenamente los niveles pre-shock.`,
      `**Recuperación post-pandémica:** el promedio 2023+ frente al promedio 2017-2019 muestra una variación del **${recupPostCovid >= 0 ? "+" : ""}${formatDecimal(recupPostCovid, 1)}%**, parámetro de magnitud de la reconstrucción del empleo privado tras el shock COVID-19.`,
      `**Cobertura del indicador:** la serie SSPM excluye empleo público, informal, cuentapropismo y economía social — en Jujuy, donde el empleo público tiene peso estructural relevante, este recorte exige cautela en la lectura general del mercado laboral.`,
    ],

    keyDatum: `**Dato destacado:** los **${formatInteger(latestVal)} asalariados privados registrados** en Jujuy equivalen al **${formatDecimal(ratioAsalPob, 1)}%** de la población provincial — una cobertura del empleo privado formal sustancialmente menor a la del centro del país, lo que evidencia el peso estructural del empleo público, informal y cuentapropista en la matriz laboral jujeña.`,

    sectionNarratives: {
      [sidSerie]: `La serie mensual ${firstRow.fecha.slice(0, 7)}–${latestRow.fecha.slice(0, 7)} captura ${longitudSerieMeses} observaciones (~${longitudSerieAnios} años) del empleo registrado privado en Jujuy. La trayectoria refleja con nitidez los grandes ciclos macroeconómicos nacionales: el rebote post-crisis 2009, la fase de relativa estabilidad 2013-2017, la contracción asociada a la crisis cambiaria 2018-2019, el shock pandémico de 2020 y el ciclo de ajuste macroeconómico iniciado a fines de 2023.

El máximo histórico se alcanzó en **${maxRow.fecha.slice(0, 7)}** con **${formatInteger(Math.round(maxRow.jujuy_miles * 1000))} asalariados**, mientras que el mínimo se registró en **${minRow.fecha.slice(0, 7)}** con **${formatInteger(Math.round(minRow.jujuy_miles * 1000))}**. El nivel actual (${formatInteger(latestVal)}) se ubica a **${formatDecimal(distAlMax, 1)}%** del máximo, un indicador relevante para evaluar la posición cíclica del mercado laboral formal provincial.

La serie tiene la virtud de estar deestacionalizada (los movimientos no responden a calendario laboral), lo que la convierte en el indicador más limpio disponible para análisis tendencial. Su limitación: captura un universo acotado — el empleo privado registrado — que en Jujuy representa una porción relativamente menor del total ocupacional, ya que coexiste con un sector público provincial robusto y con una economía informal y cuentapropista de peso significativo.`,

      [sidAnual]: `La agregación anual suaviza las oscilaciones mensuales y permite leer la trayectoria estructural del empleo registrado. ${interpEmpleo}

${tendEmpleo[0].toUpperCase() + tendEmpleo.slice(1)} es el cuadro general; comparando el promedio del trienio pre-pandémico (2017-2019: ${formatInteger(Math.round(prom2017_2019))} asalariados) con el promedio post-pandémico (2023+: ${formatInteger(Math.round(prom2023_2025))}), la variación neta resulta de **${recupPostCovid >= 0 ? "+" : ""}${formatDecimal(recupPostCovid, 1)}%**. Este parámetro permite responder una pregunta de política pública clave: ¿el empleo privado registrado recuperó los niveles previos al shock COVID-19, los superó o quedó por debajo?

El análisis sectorial — no incluido en este corte — permitiría refinar el diagnóstico: identificar qué ramas (construcción, comercio, servicios, industria manufacturera, minería, agro) lideraron la dinámica reciente y cuáles quedaron rezagadas. Para una provincia como Jujuy, con peso creciente del litio y diversificación incipiente del aparato productivo, este desglose sectorial es central para entender la composición real de la creación o destrucción de empleo formal.`,

      [sidVar]: `La variación interanual mide el cambio porcentual del stock de asalariados privados respecto al mismo mes del año anterior, suavizando estacionalidad y haciendo legibles los puntos de inflexión del ciclo. Los tramos en territorio negativo identifican períodos de destrucción neta de empleo registrado — típicamente asociados a crisis cambiarias, recesiones generalizadas o shocks externos. Los tramos positivos sostenidos identifican períodos de creación neta, asociados a ciclos expansivos o políticas activas de empleo.

En el caso de Jujuy, la serie ha mostrado los quiebres esperables: caídas marcadas en 2009 (crisis financiera internacional), 2014-2015 (primera devaluación del ciclo Kirchner), 2018-2019 (crisis cambiaria), 2020 (shock COVID-19) y, más recientemente, contracciones asociadas al ajuste macroeconómico iniciado en diciembre de 2023. La amplitud de las oscilaciones en Jujuy tiende a ser **menor** que en provincias de matriz productiva más diversificada y abierta al sector externo, lo que se asocia al peso relativo del empleo público (no incluido aquí) que estabiliza el ingreso disponible provincial pero también limita la elasticidad del ajuste laboral en fases recesivas.`,
    },

    nationalContext: `Los **${formatInteger(latestVal)} asalariados privados registrados** en Jujuy representan el **${formatDecimal(shareNacional, 2)}%** del total nacional estimado (~${formatInteger(SSPM_REFERENCIA.asalariados_priv_nacional_aprox)} asalariados según referencia agregada SSPM ${SSPM_REFERENCIA.fecha_referencia}). Esta participación es **inferior** a la participación poblacional de Jujuy (${formatDecimal(sharePoblacionNacional, 2)}% del país según Censo 2022), brecha que refleja una característica estructural compartida con el resto del NOA: la menor densidad relativa de empleo privado formal frente a un sector público provincial robusto y una economía informal extendida.

${interpEmpleo}

La pandemia de COVID-19 (2020) y, posteriormente, el ajuste macroeconómico iniciado en diciembre de 2023, configuran los dos quiebres más recientes con impacto transversal sobre todas las jurisdicciones del país. La heterogeneidad provincial radica en la velocidad y amplitud de la respuesta: provincias con matriz exportadora diversificada (Buenos Aires, Córdoba, Santa Fe) muestran trayectorias más volátiles pero también con recuperaciones más vigorosas; provincias del NOA, con menor exposición externa y peso significativo del empleo público estabilizador, presentan series con menor amplitud cíclica pero también con dinamismo más acotado en fases expansivas.

Comparado con sus vecinas del NOA (Salta, Tucumán, Catamarca, La Rioja, Santiago del Estero), Jujuy comparte el perfil de baja densidad de empleo privado registrado y alta dependencia estructural del sector público y, en menor medida, de algunos enclaves productivos específicos (litio, azúcar, tabaco, turismo). El despegue reciente del litio podría modificar parcialmente esta estructura en los próximos años, aunque su impacto sobre el empleo privado registrado dependerá de las decisiones de localización del eslabón industrial (refinación, batería).`,

    policyImplications: `El perfil del empleo registrado privado en Jujuy señala dos tensiones estructurales del modelo de desarrollo provincial. La primera es la dependencia del sector público como estabilizador del ingreso disponible: con ${formatDecimal(ratioAsalPob, 1)}% de la población como asalariada privada formal, una parte significativa del consumo y la actividad económica jujeña se sostiene desde los salarios estatales y desde la economía informal o de subsistencia. Esto otorga estabilidad relativa al ingreso provincial en fases recesivas, pero también limita la capacidad de generar empleo de calidad por la vía de la inversión privada autónoma.

La segunda tensión es el carácter parcial de la información disponible. El indicador SSPM, aunque robusto y deestacionalizado, mide únicamente el empleo asalariado privado registrado ante la seguridad social. Para un diagnóstico ocupacional integral de Jujuy se requiere combinar esta serie con: registros del empleo público provincial y municipal (planta y contratos), datos de la Encuesta Permanente de Hogares para el aglomerado Jujuy-Palpalá (informalidad, subocupación, búsqueda activa), información de monotributistas y autónomos (AFIP), y datos sectoriales específicos (azúcar, litio, tabaco, agro). Solo a partir de esa integración es posible caracterizar la estructura ocupacional jujeña con la granularidad necesaria para el diseño de políticas activas.

Quedan fuera del campo de visión de este indicador algunas dimensiones particularmente relevantes para la provincia: el empleo en las empresas asociadas a la explotación del litio (con dinámicas cíclicas vinculadas a las fases de construcción versus producción), el empleo estacional asociado al ciclo azucarero, la informalidad rural y de comunidades indígenas, y la economía vinculada al turismo en la Quebrada de Humahuaca. El monitoreo del empleo registrado privado debe leerse, por tanto, como una pieza — relevante pero acotada — de un sistema de información ocupacional más amplio que la propia base SSPM no pretende sustituir.`,
  });

  fs.mkdirSync(path.dirname(OUT_JSON), { recursive: true });
  fs.mkdirSync(path.dirname(OUT_MD), { recursive: true });
  fs.writeFileSync(OUT_JSON, JSON.stringify(data, null, 2));
  fs.writeFileSync(OUT_MD, md);
  console.log(`  ✅ empleo/economia.json (${data.kpis.length} KPIs, ${data.charts.length} charts) — ${latestRow.fecha.slice(0, 7)}`);
}

main();
