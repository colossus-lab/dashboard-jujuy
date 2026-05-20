/**
 * process-salud.cjs
 *
 * Genera public/data/salud/vitales.json + public/reports/salud/vitales.md
 *
 * Fuentes:
 *   - Defunciones 1914-2023 (serie histórica por jurisdicción)
 *   - Nacimientos 2017, 2018, 2023 (por jurisdicción de residencia)
 */

const fs = require("fs");
const path = require("path");

const Papa = require("papaparse");
const { ReportBuilder, slugify } = require("./lib/report-builder.cjs");
const { buildReportMd } = require("./lib/markdown-builder.cjs");
const { formatInteger, formatDecimal, formatCompact, formatPercent } = require("./lib/formatters.cjs");
const { SALUD, CENSO_2022, NOA_INFO } = require("./lib/contexto-nacional.cjs");
const { interpretarSerie, resumenTendencia } = require("./lib/tendencias.cjs");

const ROOT = path.resolve(__dirname, "..");
const DATASETS = path.resolve("C:/Users/dante/Desktop/Laboratorio Colossus/Pipeline OpenArg/datos_abiertos/datasets/salud");

const FILE_DEFUNCIONES = path.join(
  DATASETS,
  "salud-serie-historica-defunciones-ocurridas-argentina-por-jurisdiccion",
  "serie-histórica-de-defunciones-ocurrida-en-argentina-por-jurisdicción-1914-2023.csv"
);
const NACIMIENTOS_DIR = path.join(
  DATASETS,
  "salud-nacidos-vivos-registrados-por-jurisdiccion-residencia-madre-republica-argentina"
);

const OUT_JSON = path.join(ROOT, "public", "data", "salud", "vitales.json");
const OUT_MD = path.join(ROOT, "public", "reports", "salud", "vitales.md");

const SOURCE = "DEIS — Dirección de Estadísticas e Información de Salud · Ministerio de Salud de la Nación";

function readCsv(file, delimiter) {
  const text = fs.readFileSync(file, "utf8").replace(/^﻿/, "");
  return Papa.parse(text, { header: true, skipEmptyLines: true, delimiter }).data;
}

function main() {
  if (!fs.existsSync(FILE_DEFUNCIONES)) {
    console.error("❌ Defunciones CSV no encontrado. Skip salud.");
    return;
  }

  // ─── DEFUNCIONES ───
  const defRows = readCsv(FILE_DEFUNCIONES, ",")
    .map(r => ({
      anio: r.indice_tiempo ? parseInt(String(r.indice_tiempo).slice(0, 4), 10) : null,
      argentina: parseInt(r.republica_argentina, 10) || 0,
      jujuy: parseInt(r.jujuy, 10) || 0,
    }))
    .filter(r => Number.isFinite(r.anio));

  const yearsDef = defRows.map(r => r.anio);
  const latestDef = Math.max(...yearsDef);
  const latestDefRow = defRows.find(r => r.anio === latestDef);
  const def2010 = defRows.find(r => r.anio === 2010);
  const def2020 = defRows.find(r => r.anio === 2020); // pico pandemia

  // ─── NACIMIENTOS (cargamos años disponibles) ───
  const nacFiles = fs.readdirSync(NACIMIENTOS_DIR).filter(f => f.endsWith(".csv"));
  const nacByYear = {};
  for (const f of nacFiles) {
    const m = f.match(/(20\d{2})/);
    if (!m) continue;
    const year = parseInt(m[1], 10);
    try {
      const rows = readCsv(path.join(NACIMIENTOS_DIR, f), ";");
      // Filtrar Jujuy (id=38)
      const jujRows = rows.filter(r => String(r.jurisdiccion_de_residencia_id || "").trim() === "38");
      if (jujRows.length === 0) continue;
      nacByYear[year] = jujRows.map(r => ({
        anio: year,
        edad_madre: r.edad_madre_grupo,
        instruccion_madre: r.instruccion_madre,
        tipo_parto: r.tipo_de_parto_nombre,
        semana_gestacion: r.semana_gestacion,
        peso: r.intervalo_peso_al_nacer,
        sexo: r.Sexo || r.sexo,
        cantidad: parseInt(r.nacimientos_cantidad, 10) || 0,
      }));
    } catch (err) {
      console.warn(`  ⚠️  Error leyendo ${f}: ${err.message}`);
    }
  }

  const nacYears = Object.keys(nacByYear).map(Number).sort();
  const latestNacYear = nacYears.length ? nacYears[nacYears.length - 1] : null;
  const latestNacRows = latestNacYear ? nacByYear[latestNacYear] : [];
  const totalNacLatest = latestNacRows.reduce((s, r) => s + r.cantidad, 0);

  // ─── BUILDER ───
  const builder = new ReportBuilder("salud-vitales")
    .setMeta({
      title: "Estadísticas Vitales — Nacimientos y Defunciones",
      category: "Salud",
      subcategory: "Vitales",
      source: SOURCE,
      date: String(latestDef),
    })
    .addKPI({
      id: "defunciones-latest",
      label: `Defunciones Jujuy (${latestDef})`,
      value: latestDefRow.jujuy,
      formatted: formatInteger(latestDefRow.jujuy),
      unit: "casos",
    })
    .addKPI({
      id: "defunciones-2020",
      label: "Defunciones pico pandemia (2020)",
      value: def2020 ? def2020.jujuy : 0,
      formatted: def2020 ? formatInteger(def2020.jujuy) : "—",
      unit: "casos",
    })
    .addKPI({
      id: "defunciones-2010",
      label: "Defunciones década anterior (2010)",
      value: def2010 ? def2010.jujuy : 0,
      formatted: def2010 ? formatInteger(def2010.jujuy) : "—",
      unit: "casos",
    })
    .addKPI({
      id: "serie-largo",
      label: "Cobertura de la serie histórica",
      value: yearsDef.length,
      formatted: `${Math.min(...yearsDef)}–${latestDef}`,
      unit: `${yearsDef.length} años`,
    });

  if (latestNacYear) {
    builder.addKPI({
      id: "nacimientos-latest",
      label: `Nacimientos Jujuy (${latestNacYear})`,
      value: totalNacLatest,
      formatted: formatInteger(totalNacLatest),
      unit: "nacidos vivos",
    });
  }

  // ─── CHART 1: Serie histórica defunciones Jujuy ───
  const sectionSerie = "Serie Histórica de Defunciones";
  const sidSerie = slugify(sectionSerie);
  // Mostrar serie completa, agrupando los últimos 110 años
  const serieData = defRows
    .filter(r => r.anio >= 1914)
    .map(r => ({ anio: String(r.anio), Defunciones: r.jujuy }));
  builder.addChart({
    id: "line-defunciones",
    type: "line",
    title: "Defunciones registradas en Jujuy (1914-2023)",
    sectionId: sidSerie,
    sectionTitle: sectionSerie,
    data: serieData,
    config: { xAxis: "anio", yAxis: "Defunciones" },
  });

  // ─── CHART 2: Comparativa decenal ───
  const sectionComp = "Comparativa Decenal";
  const sidComp = slugify(sectionComp);
  const decadas = [1920, 1940, 1960, 1980, 2000, 2010, 2020, latestDef]
    .filter((y, i, a) => a.indexOf(y) === i);
  const compData = decadas.map(y => {
    const r = defRows.find(x => x.anio === y);
    return { decada: String(y), Defunciones: r ? r.jujuy : 0 };
  });
  builder.addChart({
    id: "bar-decadas",
    type: "bar",
    title: "Defunciones en Jujuy por año hito",
    sectionId: sidComp,
    sectionTitle: sectionComp,
    data: compData,
    config: { xAxis: "decada", yAxis: "Defunciones" },
  });

  // ─── CHART 3: Nacimientos por edad de la madre (último año disponible) ───
  if (latestNacYear) {
    const sectionEdadMadre = "Nacimientos por Edad de la Madre";
    const sidEdadMadre = slugify(sectionEdadMadre);
    const byEdad = new Map();
    for (const r of latestNacRows) {
      const k = String(r.edad_madre || "Sin dato").replace(/^\d+\.\s*/, "");
      byEdad.set(k, (byEdad.get(k) || 0) + r.cantidad);
    }
    const edadData = [...byEdad.entries()]
      .map(([edad, cant]) => ({ edad, Nacimientos: cant }))
      .sort((a, b) => a.edad.localeCompare(b.edad));
    builder.addChart({
      id: "bar-edad-madre",
      type: "bar",
      title: `Nacimientos por grupo de edad de la madre — Jujuy ${latestNacYear}`,
      sectionId: sidEdadMadre,
      sectionTitle: sectionEdadMadre,
      data: edadData,
      config: { xAxis: "edad", yAxis: "Nacimientos" },
    });

    // ─── CHART 4: Tipo de parto ───
    const sectionTipoParto = "Tipo de Parto";
    const sidTipoParto = slugify(sectionTipoParto);
    const byTipo = new Map();
    for (const r of latestNacRows) {
      const k = String(r.tipo_parto || "Sin dato");
      byTipo.set(k, (byTipo.get(k) || 0) + r.cantidad);
    }
    const tipoData = [...byTipo.entries()].map(([id, value]) => ({ id, label: id, value }));
    builder.addChart({
      id: "pie-tipo-parto",
      type: "pie",
      title: `Tipo de parto — Jujuy ${latestNacYear}`,
      sectionId: sidTipoParto,
      sectionTitle: sectionTipoParto,
      data: tipoData,
    });

    // ─── CHART 5: Nacimientos por sexo ───
    const sectionSexo = "Nacimientos por Sexo";
    const sidSexo = slugify(sectionSexo);
    const bySexo = new Map();
    for (const r of latestNacRows) {
      const k = String(r.sexo || "Sin dato").trim().toLowerCase();
      const label = k === "masculino" ? "Masculino" : k === "femenino" ? "Femenino" : "Sin dato";
      bySexo.set(label, (bySexo.get(label) || 0) + r.cantidad);
    }
    const sexoData = [...bySexo.entries()].map(([id, value]) => ({ id, label: id, value }));
    builder.addChart({
      id: "pie-sexo",
      type: "pie",
      title: `Nacimientos por sexo del recién nacido — Jujuy ${latestNacYear}`,
      sectionId: sidSexo,
      sectionTitle: sectionSexo,
      data: sexoData,
    });

    // ─── CHART 6: Serie nacimientos (años disponibles) ───
    if (nacYears.length > 1) {
      const sectionSerieNac = "Evolución de Nacimientos";
      const sidSerieNac = slugify(sectionSerieNac);
      const serieNacData = nacYears.map(y => ({
        anio: String(y),
        Nacimientos: nacByYear[y].reduce((s, r) => s + r.cantidad, 0),
      }));
      builder.addChart({
        id: "line-nacimientos",
        type: "line",
        title: `Nacimientos anuales en Jujuy — años disponibles`,
        sectionId: sidSerieNac,
        sectionTitle: sectionSerieNac,
        data: serieNacData,
        config: { xAxis: "anio", yAxis: "Nacimientos" },
      });
    }
  }

  const data = builder.build();

  const variacionDecadal = def2010 && def2010.jujuy
    ? ((latestDefRow.jujuy - def2010.jujuy) / def2010.jujuy) * 100
    : 0;

  // ─── Datos derivados para narrativa ejecutiva ───
  const POB_JUJUY_2022 = 811611;
  const sharePobJujuy = (POB_JUJUY_2022 / CENSO_2022.poblacionArgentina) * 100;
  // Tasa bruta de mortalidad Jujuy = defunciones / población * 1000
  const tasaMortJujuy = (latestDefRow.jujuy / POB_JUJUY_2022) * 1000;
  const desvMortNac = SALUD.tasa_mortalidad_general_nacional_2023
    ? ((tasaMortJujuy - SALUD.tasa_mortalidad_general_nacional_2023) / SALUD.tasa_mortalidad_general_nacional_2023) * 100
    : 0;
  const shareDefJujuyNac = SALUD.defunciones_nacionales_2023
    ? (latestDefRow.jujuy / SALUD.defunciones_nacionales_2023) * 100
    : 0;
  // Pandemia: pico 2020 vs nivel 2019
  const def2019 = defRows.find(r => r.anio === 2019);
  const sobreMort2020 = def2019 && def2019.jujuy
    ? ((def2020.jujuy - def2019.jujuy) / def2019.jujuy) * 100
    : 0;
  const sobreMort2020Nac = SALUD.defunciones_nacionales_2020 && SALUD.defunciones_nacionales_2023
    ? ((SALUD.defunciones_nacionales_2020 - SALUD.defunciones_nacionales_2023) / SALUD.defunciones_nacionales_2023) * 100
    : 0;
  // Razón sexos al nacer
  let nacMasc = 0, nacFem = 0;
  if (latestNacYear) {
    nacMasc = latestNacRows.filter(r => /masculino/i.test(String(r.sexo || ""))).reduce((s, r) => s + r.cantidad, 0);
    nacFem  = latestNacRows.filter(r => /femenino/i.test(String(r.sexo || ""))).reduce((s, r) => s + r.cantidad, 0);
  }
  const razonSexos = nacFem > 0 ? (nacMasc / nacFem) * 100 : 0;
  // Tasa bruta natalidad Jujuy
  const tasaNatJujuy = totalNacLatest > 0 ? (totalNacLatest / POB_JUJUY_2022) * 1000 : 0;
  const desvNatNac = SALUD.tasa_natalidad_nacional_2023 && tasaNatJujuy
    ? ((tasaNatJujuy - SALUD.tasa_natalidad_nacional_2023) / SALUD.tasa_natalidad_nacional_2023) * 100
    : 0;
  // Cesáreas %
  let pctCesarea = 0;
  if (latestNacYear) {
    const cesarea = latestNacRows.filter(r => /ces[aá]rea/i.test(String(r.tipo_parto || ""))).reduce((s, r) => s + r.cantidad, 0);
    pctCesarea = totalNacLatest > 0 ? (cesarea / totalNacLatest) * 100 : 0;
  }
  // Madres adolescentes (<20)
  let nacAdolescentes = 0;
  if (latestNacYear) {
    nacAdolescentes = latestNacRows.filter(r => /menores|^1\.|10\s*a\s*14|15\s*a\s*19/i.test(String(r.edad_madre || ""))).reduce((s, r) => s + r.cantidad, 0);
  }
  const pctAdolescentes = totalNacLatest > 0 ? (nacAdolescentes / totalNacLatest) * 100 : 0;

  // Serie histórica defunciones — interpretación de quiebres
  const serieDefAnalisis = defRows.filter(r => r.anio >= 1950).map(r => ({ anio: r.anio, valor: r.jujuy }));
  const interpDef = interpretarSerie(serieDefAnalisis, { umbralVariacion: 15, magnitudLabel: "defunciones" });
  const tendDef = resumenTendencia(serieDefAnalisis, 10);
  // Período largo 1914-2023 longitud
  const longitudSerie = latestDef - Math.min(...yearsDef);

  const sidSerieKey = slugify("Serie Histórica de Defunciones");
  const sidCompKey = slugify("Comparativa Decenal");
  const sidEdadMadreKey = slugify("Nacimientos por Edad de la Madre");
  const sidTipoPartoKey = slugify("Tipo de Parto");
  const sidSexoKey = slugify("Nacimientos por Sexo");
  const sidSerieNacKey = slugify("Evolución de Nacimientos");

  const md = buildReportMd({
    ...data,

    intro: `En **${latestDef}**, Jujuy registró **${formatInteger(latestDefRow.jujuy)} defunciones** (${variacionDecadal >= 0 ? "↑" : "↓"} **${formatDecimal(Math.abs(variacionDecadal), 1)}%** vs 2010), con una tasa bruta estimada de **${formatDecimal(tasaMortJujuy, 1)} cada 1.000 habitantes**. La serie 1914-${latestDef} (${longitudSerie} años de cobertura continua) es una de las más extensas del país.${latestNacYear ? ` En **${latestNacYear}** se registraron **${formatInteger(totalNacLatest)} nacidos vivos** (tasa bruta ${formatDecimal(tasaNatJujuy, 1)}/1.000), con **${formatDecimal(pctCesarea, 1)}%** de partos por cesárea.` : ""}`,

    executiveSummary: `Las estadísticas vitales de Jujuy correspondientes a ${latestDef} muestran a una provincia que sigue consolidando su transición demográfica con un perfil característico del Noroeste argentino. Las **${formatInteger(latestDefRow.jujuy)} defunciones** registradas representan el **${formatDecimal(shareDefJujuyNac, 2)}%** del total nacional (Jujuy concentra el **${formatDecimal(sharePobJujuy, 2)}%** de la población argentina según el Censo 2022), una relación que sugiere mortalidad bruta levemente por debajo de la media país. La tasa bruta estimada de **${formatDecimal(tasaMortJujuy, 1)} defunciones cada 1.000 habitantes** se ubica **${desvMortNac >= 0 ? "por encima" : "por debajo"}** del promedio nacional (${formatDecimal(SALUD.tasa_mortalidad_general_nacional_2023, 1)}/1.000), con un desvío de **${desvMortNac >= 0 ? "+" : ""}${formatDecimal(desvMortNac, 1)}%**.

La serie histórica 1914-${latestDef} es excepcional por su longitud: **${longitudSerie} años de registro continuo** la convierten en uno de los pocos paneles provinciales aptos para análisis demográficos de largo plazo en Argentina. A lo largo del período es posible leer en los datos los hitos principales de la transición demográfica argentina: la caída sostenida de la mortalidad infantil durante el siglo XX, la convergencia entre mortalidad masculina y femenina, los efectos de las grandes crisis epidemiológicas y, más recientemente, el impacto del COVID-19. En ${tendDef}.

El pico de **${def2020 ? formatInteger(def2020.jujuy) : "—"} defunciones en 2020** ${def2019 ? `representó una sobremortalidad del **${formatDecimal(sobreMort2020, 1)}%** respecto a 2019` : ""}, un quiebre transversal compartido con el resto de las jurisdicciones del país. A nivel nacional, la sobremortalidad fue del orden del **${formatDecimal(Math.abs(sobreMort2020Nac), 1)}%** comparando 2020 con 2023 (post-pandemia), confirmando que Jujuy no fue una excepción al fenómeno global pero tampoco mostró un exceso de mortalidad fuera de los rangos esperables.

${latestNacYear ? `En el lado de los nacimientos, los **${formatInteger(totalNacLatest)} nacidos vivos** de ${latestNacYear} arrojan una tasa bruta de natalidad estimada en **${formatDecimal(tasaNatJujuy, 1)} cada 1.000 habitantes**, **${desvNatNac >= 0 ? "+" : ""}${formatDecimal(desvNatNac, 1)}%** respecto del promedio nacional (${formatDecimal(SALUD.tasa_natalidad_nacional_2023, 1)}/1.000). El **${formatDecimal(pctCesarea, 1)}%** de partos por cesárea, sumado al **${formatDecimal(pctAdolescentes, 1)}%** de nacimientos de madres adolescentes (<20 años), configuran dos indicadores de calidad de atención y de salud reproductiva con implicancias específicas para el sistema sanitario provincial.` : ""}`,

    keyFindings: [
      `**Mortalidad bruta cercana al promedio nacional:** la tasa estimada en ${formatDecimal(tasaMortJujuy, 1)} defunciones cada 1.000 habitantes muestra un desvío de **${desvMortNac >= 0 ? "+" : ""}${formatDecimal(desvMortNac, 1)}%** respecto al ${formatDecimal(SALUD.tasa_mortalidad_general_nacional_2023, 1)} nacional.`,
      `**Sobremortalidad pandémica acotada:** las defunciones de ${def2020 ? formatInteger(def2020.jujuy) : "—"} en 2020 ${def2019 ? `implicaron un exceso del **${formatDecimal(sobreMort2020, 1)}%** respecto a 2019` : "configuraron el pico de la serie reciente"}, en línea con el patrón nacional.`,
      `**Serie de ${longitudSerie} años:** el registro continuo 1914-${latestDef} es uno de los más extensos disponibles para análisis demográfico provincial en Argentina, lo que habilita lectura en clave de transición demográfica de largo plazo.`,
      `**Crecimiento absoluto, no necesariamente de tasa:** las defunciones crecieron **${formatDecimal(variacionDecadal, 1)}%** entre 2010 y ${latestDef}, expansión que debe leerse contra el crecimiento poblacional simultáneo para inferir cambios efectivos en mortalidad relativa.`,
      latestNacYear ? `**Natalidad y cesáreas:** ${formatInteger(totalNacLatest)} nacidos vivos en ${latestNacYear} (tasa bruta ${formatDecimal(tasaNatJujuy, 1)}/1.000), con **${formatDecimal(pctCesarea, 1)}%** de partos por cesárea — indicador clave de calidad de atención perinatal.` : ``,
      latestNacYear ? `**Maternidad adolescente:** el **${formatDecimal(pctAdolescentes, 1)}%** de los nacimientos correspondió a madres menores de 20 años, marcador estructural de salud reproductiva relevante para el diseño de políticas de educación sexual y acceso a métodos anticonceptivos.` : ``,
    ].filter(Boolean),

    keyDatum: `**Dato destacado:** Jujuy dispone de **${longitudSerie} años continuos de registro de defunciones (1914-${latestDef})**, una de las series demográficas provinciales más extensas de Argentina — un activo informativo que permite reconstruir la transición demográfica jujeña con un nivel de granularidad temporal pocas veces disponible en jurisdicciones subnacionales del país.`,

    sectionNarratives: {
      [sidSerieKey]: `La serie 1914-${latestDef} permite reconstruir la transición demográfica de Jujuy con un grado de detalle inusual para jurisdicciones subnacionales argentinas. Los valores de las primeras décadas del siglo XX corresponden a una población provincial muy inferior a la actual (Jujuy pasó de aproximadamente 80.000 habitantes en 1914 a más de 800.000 en el Censo 2022), por lo que su interpretación requiere contextualizar contra el denominador poblacional.

${interpDef}

El pico más visible de la serie reciente corresponde a **2020**, con ${def2020 ? formatInteger(def2020.jujuy) : "—"} defunciones, asociado al shock de la pandemia de COVID-19. ${def2019 ? `Comparado con las ${formatInteger(def2019.jujuy)} defunciones de 2019, la sobremortalidad alcanzó el **${formatDecimal(sobreMort2020, 1)}%** — un orden de magnitud consistente con la sobremortalidad nacional registrada por DEIS para el mismo año.` : ""} La recuperación posterior (descenso a ${formatInteger(latestDefRow.jujuy)} defunciones en ${latestDef}) sugiere que el efecto pandémico sobre la mortalidad fue transitorio, sin un quiebre estructural sostenido.`,

      [sidCompKey]: `Los años hito seleccionados (1920, 1940, 1960, 1980, 2000, 2010, 2020, ${latestDef}) ofrecen una lectura panorámica del crecimiento absoluto de defunciones a lo largo de un siglo de registro. Este crecimiento responde fundamentalmente a la dinámica poblacional: Jujuy multiplicó su población aproximadamente diez veces en el período, por lo que un aumento de defunciones absolutas no implica deterioro de la mortalidad relativa — al contrario, las tasas brutas de mortalidad muestran descensos sostenidos en el largo plazo.

La lectura correcta de este cuadro requiere combinar las cifras de defunciones con las estimaciones poblacionales de cada momento. Comparar 1920 (cuando Jujuy tenía ~80.000 habitantes) con ${latestDef} (más de 800.000) sin ajustar por población lleva a conclusiones erradas sobre la "evolución de la mortalidad". El indicador relevante para análisis de salud pública es la tasa bruta de mortalidad — que ha caído estructuralmente — y, idealmente, tasas específicas por edad y causa de muerte.`,

      [sidEdadMadreKey]: `La distribución de los nacimientos por grupo de edad de la madre es uno de los indicadores más sensibles de la dinámica demográfica y de salud reproductiva. La proporción de nacimientos de madres adolescentes (menores de 20 años) — **${formatDecimal(pctAdolescentes, 1)}%** en Jujuy en ${latestNacYear} — es un marcador estructural reconocido por la literatura epidemiológica: refleja acceso a educación sexual integral, disponibilidad de métodos anticonceptivos, condiciones socioeconómicas del hogar de origen y tasas de continuidad escolar.

En el otro extremo, la proporción de nacimientos de madres en edades centrales (25-34 años) y en edades tardías (35+) refleja patrones de postergación de la maternidad asociados a mayor escolarización femenina y participación laboral. Jujuy, como el resto del NOA, presenta una distribución más "joven" que el promedio nacional — un rasgo característico de provincias con menor avance en transición de la fecundidad.

La fuente DEIS permite cruzar esta distribución con otras variables clave (instrucción de la madre, tipo de parto, peso al nacer), insumo central para diseñar políticas focalizadas de salud sexual y reproductiva en cada departamento.`,

      [sidTipoPartoKey]: `La proporción de partos por cesárea en Jujuy en ${latestNacYear} alcanzó el **${formatDecimal(pctCesarea, 1)}%** del total de nacimientos. La OMS recomienda tasas no superiores al 10-15% para optimizar resultados maternos y neonatales; cifras significativamente más altas suelen leerse como indicador de medicalización excesiva del parto, con implicancias clínicas (mayor morbilidad materna, riesgo en embarazos subsiguientes) y de costos sanitarios.

La interpretación de este indicador requiere distinguir entre subsector público y privado: en el subsector privado, las tasas de cesárea suelen ser sustancialmente más altas que en el público, por una combinación de factores que incluyen preferencias profesionales, organización de los servicios y prácticas de programación. La serie DEIS no desagrega por subsector, lo que limita el análisis. Aun así, el indicador agregado provincial constituye un insumo central para monitoreo de calidad obstétrica.`,

      [sidSexoKey]: `La razón de sexos al nacer en Jujuy en ${latestNacYear} se ubicó en aproximadamente **${formatInteger(razonSexos)} varones cada 100 mujeres**, valor consistente con la razón biológica observada universalmente (entre 103 y 107 varones cada 100 mujeres al nacimiento). Esta proporción se equipara progresivamente a lo largo del ciclo de vida por la mayor mortalidad masculina en todas las edades, lo que explica el predominio femenino en la población adulta y particularmente en adultos mayores.

El registro de sexo al nacer en la base DEIS no incorpora aún variables vinculadas a género o identidad de género, dimensiones reguladas por la Ley de Identidad de Género (Ley 26.743) en otros sistemas de información. Para análisis de salud sexual y reproductiva más completos, la base requiere cruces con otros instrumentos del sistema estadístico provincial.`,

      [sidSerieNacKey]: `La serie de nacimientos disponible cubre un período acotado (${nacYears.length ? nacYears[0] : "—"}-${latestNacYear || "—"}) que no permite aún identificar tendencias estructurales de largo plazo, pero sí confirma una característica observada en todo el país: la caída sostenida de los nacimientos absolutos en la última década, asociada al descenso de la tasa global de fecundidad. Argentina pasó de aproximadamente 770.000 nacimientos anuales en 2014 a menos de 470.000 en 2023 — una caída del orden del 40% en menos de diez años, sin precedentes en la historia demográfica nacional.

Jujuy, con una transición de la fecundidad históricamente más lenta que el centro del país, también participa de esta tendencia aunque con menor intensidad. El descenso responde a múltiples factores convergentes: mayor escolarización femenina, ampliación del acceso a métodos anticonceptivos (Ley 25.673 y políticas posteriores), inserción laboral femenina y cambios culturales en torno al deseo de hijos.`,
    },

    nationalContext: `Las estadísticas vitales de Jujuy se ubican dentro de los rangos esperables para una provincia del NOA en transición demográfica avanzada. La tasa bruta de mortalidad estimada en **${formatDecimal(tasaMortJujuy, 1)} cada 1.000 habitantes** se compara con el promedio nacional de **${formatDecimal(SALUD.tasa_mortalidad_general_nacional_2023, 1)}** (DEIS 2023), un desvío de **${desvMortNac >= 0 ? "+" : ""}${formatDecimal(desvMortNac, 1)}%**. Las **${formatInteger(latestDefRow.jujuy)} defunciones** registradas representan el **${formatDecimal(shareDefJujuyNac, 2)}%** del total nacional (${formatInteger(SALUD.defunciones_nacionales_2023)} en 2023), contra una participación poblacional del **${formatDecimal(sharePobJujuy, 2)}%**.

${interpDef}

El shock pandémico de 2020 dejó marca en todas las series provinciales del país. A nivel nacional, las defunciones pasaron de un nivel pre-pandémico cercano a las 340.000 anuales a **${formatInteger(SALUD.defunciones_nacionales_2020)}** en 2020 — una sobremortalidad del orden del **${formatDecimal(Math.abs(sobreMort2020Nac), 1)}%** comparada con los registros post-pandemia. Jujuy participó de este fenómeno con ${def2020 ? formatInteger(def2020.jujuy) : "—"} defunciones en 2020${def2019 ? ` (sobremortalidad del **${formatDecimal(sobreMort2020, 1)}%** vs 2019)` : ""}, sin desviarse significativamente del patrón nacional.

En materia de natalidad, el descenso es generalizado a nivel país: Argentina pasó de tasas de natalidad del orden de 18-19/1.000 en los años 90 a aproximadamente **${formatDecimal(SALUD.tasa_natalidad_nacional_2023, 1)}/1.000** en 2023. Jujuy, históricamente con tasas superiores al promedio nacional, también participa de la convergencia descendente aunque con cierto rezago, característico de las provincias del NOA donde la transición de la fecundidad operó más tardíamente que en el centro del país.`,

    policyImplications: `El perfil de estadísticas vitales de Jujuy señala dos dimensiones de atención para el sistema sanitario provincial. La primera es la consolidación de la transición demográfica: el descenso de la mortalidad y la natalidad implica envejecimiento poblacional progresivo, con cambios estructurales en el perfil epidemiológico. La carga de enfermedad se desplaza desde las enfermedades transmisibles y los problemas materno-infantiles hacia las enfermedades crónicas no transmisibles (cardiovasculares, cáncer, diabetes, neurodegenerativas), reconfigurando las prioridades del sistema de atención.

La segunda dimensión es la calidad de la información: la serie de ${longitudSerie} años para defunciones es un activo informativo notable, pero la base DEIS no incorpora aún variables clave para análisis territorial fino (causas de muerte específicas desagregadas por departamento, cobertura de salud al momento del deceso, lugar de ocurrencia versus residencia, etnia). Los nacimientos cuentan con cobertura más reciente pero el cruce con instrucción materna, edad y tipo de parto habilita ya análisis robustos sobre salud reproductiva. El indicador de cesáreas (**${formatDecimal(pctCesarea, 1)}%** en ${latestNacYear || "—"}) y el de maternidad adolescente (**${formatDecimal(pctAdolescentes, 1)}%**) son trazadores especialmente sensibles para monitoreo de calidad.

Quedan fuera del registro DEIS algunas dimensiones que requerirían bases complementarias para un análisis sanitario integral: muertes maternas y neonatales por causa específica, mortalidad por suicidio desagregada por departamento y grupo de edad, mortalidad asociada a consumo problemático de sustancias, y morbilidad hospitalaria. La articulación de estas fuentes — DEIS, registros hospitalarios provinciales, base SIVILA — permitiría caracterizar de manera más completa el perfil epidemiológico de Jujuy y sus disparidades territoriales internas.`,
  });

  fs.mkdirSync(path.dirname(OUT_JSON), { recursive: true });
  fs.mkdirSync(path.dirname(OUT_MD), { recursive: true });
  fs.writeFileSync(OUT_JSON, JSON.stringify(data, null, 2));
  fs.writeFileSync(OUT_MD, md);
  console.log(`  ✅ salud/vitales.json (${data.kpis.length} KPIs, ${data.charts.length} charts)`);
}

main();
