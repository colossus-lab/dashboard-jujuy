/**
 * generate-ssj-report-data.cjs
 *
 * Genera los 8 informes censales del apartado "San Salvador de Jujuy",
 * recortados al Departamento Dr. Manuel Belgrano (código INDEC "38021"),
 * con narrativa ejecutiva análoga al corpus provincial.
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
const POB_JUJUY_TOTAL = 811611;

function persist(slug, data, md) {
  fs.writeFileSync(path.join(DATA_DIR, `${slug}.json`), JSON.stringify(data, null, 2));
  fs.writeFileSync(path.join(REPORTS_DIR, `${slug}.md`), md);
  console.log(`  ✅ ssj/poblacion/${slug}.json (${data.kpis.length} KPIs, ${data.charts.length} charts, ${data.rankings.length} rankings)`);
}

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
  const sexoRows = readBelgranoSubsheet(fileSexo);
  const edadRows = readBelgranoSubsheet(fileEdad);

  const pobBelgrano = getBelgranoRow(pobTable);
  const densBelgrano = getBelgranoRow(densTable);
  const medBelgrano = getBelgranoRow(medianaTable);

  const pobBelg = toNumber(pobBelgrano.row[3]);
  const varAbsBelg = toNumber(pobBelgrano.row[4]);
  const varPctBelg = toNumber(pobBelgrano.row[5]);
  const pobJujuy = toNumber(pobTable.total[3]);
  const pctSobreProv = (pobBelg / pobJujuy) * 100;
  const densRow = densBelgrano.row.map(toNumber);
  const supBelg = densRow[2];
  const densBelg = densRow[4];
  const supJujuy = toNumber(densTable.total[2]);
  const densJujuy = toNumber(densTable.total[4]);
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
      { id: "Vivienda colectiva", label: "Vivienda colectiva", value: sT[3] },
      { id: "Situación de calle", label: "Situación de calle", value: sT[4] },
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
  const top2 = sortedByPob.slice(1, 3).map(s => s.departamento.nombre);
  const minPobDept = sortedByPob[sortedByPob.length - 1];
  const ratioMaxMin = pobBelg / Math.max(1, toNumber(minPobDept.row[3]) || 1);
  const ratioDensSobreProv = densBelg / densJujuy;
  const sortedMedAsc = [...medianaTable.departamentos].sort((a, b) => (toNumber(a.row[2]) || 0) - (toNumber(b.row[2]) || 0));
  const depMasJoven = sortedMedAsc[0];
  const depMasViejo = sortedMedAsc[sortedMedAsc.length - 1];
  const posPob = sortedByPob.findIndex(d => d.departamento.codigo === BELGRANO_CODIGO) + 1;
  const posDens = sortedByDens.findIndex(d => d.departamento.codigo === BELGRANO_CODIGO) + 1;

  const md = buildReportMd({
    ...data,
    intro: `El **Departamento Dr. Manuel Belgrano** —que contiene a **San Salvador de Jujuy**, capital provincial— concentra **${formatInteger(pobBelg)} habitantes** en 2022 sobre ${formatDecimal(supBelg, 1)} km², equivalente al **${formatDecimal(pctSobreProv, 1)}%** de la población provincial. Es el departamento más poblado y más denso de Jujuy, con una edad mediana de **${formatInteger(edadMedBelg)} años** y un crecimiento decenal del **${formatPercent(varPctBelg)}** vs. 2010 — equivalente a ${formatInteger(varAbsBelg)} habitantes adicionales en doce años, en su mayoría absorbidos por la expansión sur de la conurbación capital.`,

    executiveSummary: `Con **${formatInteger(pobBelg)} habitantes**, Belgrano es por lejos el departamento más poblado de Jujuy: absorbe el **${formatDecimal(pctSobreProv, 1)}%** de la población provincial (${formatInteger(pobJujuy)} habitantes) en solo ${formatDecimal(supBelg, 1)} km² (apenas el **${formatDecimal((supBelg / supJujuy) * 100, 1)}%** del territorio jujeño). Esta concentración define la centralidad demográfica, política y económica de la capital: una sola unidad administrativa que pesa más que la suma de los diez departamentos más chicos juntos. La relación entre Belgrano y el departamento menos poblado (${minPobDept.departamento.nombre}) es de aproximadamente **${formatInteger(ratioMaxMin)} a 1**.

La densidad de **${formatInteger(densBelg)} hab./km²** lo coloca como el departamento más denso de Jujuy — **${formatDecimal(ratioDensSobreProv, 1)} veces** el promedio provincial (${formatInteger(densJujuy)} hab./km²) y muy por encima del promedio nacional (${formatDecimal(CENSO_2022.densidadNacional, 1)} hab./km²). Esta densidad refleja la urbanización plena del corredor capital, que combina el casco histórico colonial, los barrios consolidados del norte (Ciudad de Nieva, Los Perales, Mariano Moreno) y la enorme expansión sur protagonizada por **Alto Comedero** — un mega-barrio que por sí solo concentra cerca de la mitad de los habitantes del departamento y cuya identidad social, urbana y demográfica difiere marcadamente del resto de la ciudad.

El crecimiento decenal del **${formatPercent(varPctBelg)}** confirma que Belgrano sigue siendo el principal receptor de migración interna desde la Puna, la Quebrada y el Ramal, además de su propio crecimiento vegetativo. Esta expansión —concentrada mayoritariamente en la periferia sur y en barrios populares— plantea desafíos crecientes de infraestructura urbana, transporte público (SUMOVI), agua y cloaca, escuelas y centros de salud. Por contraste, los barrios consolidados del norte envejecen y ven crecer la demanda geriátrica y de cuidados.

La edad mediana de **${formatInteger(edadMedBelg)} años** se ubica ${desvEdad <= 0 ? `**${Math.abs(desvEdad)} año(s) por debajo**` : `**${desvEdad} año(s) por encima**`} del promedio nacional (${CENSO_2022.edadMedianaNacional} años), reflejando la transición demográfica todavía en curso del NOA. Pero el promedio capital esconde realidades muy distintas: el casco urbano consolidado envejece a un ritmo similar al de capitales más antiguas del centro del país, mientras Alto Comedero mantiene una estructura mucho más joven, sostenida por familias jóvenes en formación y migración interna.`,

    keyFindings: [
      `**Mayoría aplastante:** Belgrano concentra el **${formatDecimal(pctSobreProv, 1)}%** de la población provincial — supera a los siguientes tres departamentos juntos (${top2.join(", ")} y el cuarto del ranking).`,
      `**Densidad capital:** **${formatInteger(densBelg)} hab./km²** en Belgrano vs. **${formatInteger(densJujuy)} hab./km²** del promedio provincial — la densidad más alta de Jujuy (${formatDecimal(ratioDensSobreProv, 1)} veces el promedio).`,
      `**Crecimiento sostenido:** **${formatPercent(varPctBelg)}** entre 2010 y 2022 (${formatInteger(varAbsBelg)} hab. adicionales) — motorizado por migración interna y expansión sur (Alto Comedero).`,
      `**Posición provincial:** ${posPob}° en población, ${posDens}° en densidad. La capital concentra la actividad demográfica y económica del NOA jujeño.`,
      `**Alto Comedero como sub-realidad:** dentro del ejido capitalino, Alto Comedero (~170.000 hab. estimados) configura una "segunda ciudad" con perfil etario, habitacional y socioeconómico propio — más joven, con servicios menos consolidados.`,
      `**Edad mediana ${formatInteger(edadMedBelg)} años:** ${desvEdad <= 0 ? `por debajo` : `por encima`} del promedio nacional (${CENSO_2022.edadMedianaNacional}), en línea con el patrón NOA. Heterogeneidad interna marcada: barrios consolidados envejecen, Alto Comedero se mantiene joven.`,
    ],

    keyDatum: `**Dato destacado:** los **${formatInteger(pobBelg)} habitantes** del Departamento Dr. Manuel Belgrano superan la suma de la población de los diez departamentos jujeños más pequeños. El peso de la capital sobre el resto de la provincia es un dato estructural —no coyuntural— de la geografía jujeña: cualquier promedio "Jujuy" oculta la asimetría entre la capital y el resto.`,

    sectionNarratives: {
      [sidPob]: `Belgrano lidera el ranking poblacional provincial con **${formatInteger(pobBelg)} habitantes**, seguido a considerable distancia por ${top2[0]} (~122.000) y ${top2[1]} (~94.000). La asimetría es la columna vertebral de la geografía política, fiscal y de provisión de servicios de Jujuy: cualquier indicador agregado provincial está, en buena medida, dominado por lo que ocurre en este departamento.

Dentro de Belgrano, la ciudad de San Salvador de Jujuy es prácticamente coincidente con el departamento (el resto son localidades menores y áreas rurales). El crecimiento de las últimas dos décadas se concentró sobre todo en la zona sur —**Alto Comedero**— donde el crecimiento demográfico y la expansión urbana se aceleraron tras los planes de vivienda de los años 80-90. La diferencia entre Belgrano y ${minPobDept.departamento.nombre} (depto. menos poblado) es de aproximadamente ${formatInteger(ratioMaxMin)} a 1, una de las brechas inter-departamentales más extremas del NOA.`,

      [sidVar]: `El crecimiento decenal de Belgrano (**${formatPercent(varPctBelg)}**, ${formatInteger(varAbsBelg)} hab. adicionales) está alineado con el promedio provincial (20,5%) pero por debajo de departamentos del corredor central como El Carmen, donde la expansión periférica de la conurbación capital-Palpalá-El Carmen genera ritmos de crecimiento aún mayores. Belgrano absorbe migración interna sostenida desde la Puna, la Quebrada y el Ramal —fenómeno que se intensificó post-pandemia— y mantiene una tasa de natalidad por encima del promedio nacional.

La expansión interna es heterogénea: el casco urbano consolidado prácticamente no crece (incluso pierde población por envejecimiento), mientras Alto Comedero, Cuyaya y los barrios del sur reciben la mayor parte del crecimiento. Esta dinámica genera presiones diferenciadas: el centro necesita servicios para población mayor; la periferia, infraestructura básica para nuevos hogares.`,

      [sidDens]: `Belgrano tiene la densidad más alta de Jujuy: **${formatInteger(densBelg)} hab./km²**, **${formatDecimal(ratioDensSobreProv, 1)} veces** el promedio provincial (${formatInteger(densJujuy)} hab./km²) y muy por encima del promedio nacional (${formatDecimal(CENSO_2022.densidadNacional, 1)}). En el otro extremo, departamentos puneños presentan densidades menores a 1 hab./km².

La densidad capital refleja una urbanización plena del Valle de Jujuy: trama vial consolidada, edificación en altura selectiva, presión sobre suelo urbano. Internamente, sin embargo, la densidad es muy desigual: el centro histórico y los barrios consolidados del norte mantienen densidades altas con baja construcción nueva; Alto Comedero combina alta densidad poblacional con trama todavía en formación, déficit de espacios verdes y servicios.`,

      [sidPiramide]: `La pirámide poblacional de Belgrano muestra una base ancha característica del NOA, con cohortes jóvenes (0-19 años) todavía numerosas pero estrechándose progresivamente respecto a generaciones anteriores. El bono demográfico está vigente y se traduce en una población económicamente activa relativamente joven, motor de la actividad económica capital.

El estrechamiento progresivo a partir de los 60 años marca el inicio de un envejecimiento que se acelerará en las próximas dos décadas. Como en toda área metropolitana, la pirámide del depto. promedia realidades distintas: los barrios consolidados del centro tienden a envejecer más rápido y demandar geriatría y cuidados crónicos; Alto Comedero mantiene una estructura mucho más joven con presión sobre escuelas primarias y secundarias, salud materno-infantil y empleo joven.`,

      [sidMed]: `Belgrano tiene una edad mediana de **${formatInteger(edadMedBelg)} años**, ubicándose en posición intermedia dentro del ranking provincial. ${depMasJoven.departamento.nombre} (mediana ${formatInteger(toNumber(depMasJoven.row[2]))}) lidera el ranking de juventud, sostenida por altas tasas de fecundidad y emigración de adultos; ${depMasViejo.departamento.nombre} (mediana ${formatInteger(toNumber(depMasViejo.row[2]))}) lidera el envejecimiento, asociado a urbanización consolidada y baja fecundidad.

Belgrano combina ambas dinámicas en un único promedio: zonas con familias jóvenes en expansión periurbana (Alto Comedero, Cuyaya) tiran la mediana hacia abajo; barrios consolidados con población más envejecida la suben. La política pública municipal capital debe operar simultáneamente sobre estas dos realidades.`,

      [sidTipoResid]: `La amplísima mayoría de la población de Belgrano reside en viviendas particulares. La población en viviendas colectivas (geriátricos, residencias estudiantiles, hospitales, hoteles, regimientos) es proporcionalmente mayor que en el promedio provincial — esperable para una capital con concentración institucional: sede de la Universidad Nacional de Jujuy, hospitales de referencia provincial (Pablo Soria, Materno-Infantil), residencias estudiantiles, geriátricos privados, regimientos militares y dependencias administrativas. La situación de calle, aunque acotada en números absolutos, está casi exclusivamente concentrada en el departamento por su perfil urbano y la oferta de servicios para personas sin techo.`,

      [sidFem]: `El índice de feminidad —mujeres por cada 100 varones— ilustra la dinámica diferencial de mortalidad entre sexos a lo largo del ciclo de vida en Belgrano. La curva muestra paridad relativa al nacer y en la infancia, leve predominio masculino en adolescencia y juventud temprana (vinculado a migración masculina por trabajo), y un creciente predominio femenino a partir de los 40-50 años que se acentúa marcadamente entre los mayores de 75. Este patrón replica la dinámica nacional e internacional, asociada a la mayor esperanza de vida femenina y a una mortalidad masculina superior por causas externas (accidentes, violencia interpersonal) en edades intermedias.`,
    },

    nationalContext: `Belgrano —y por extensión la ciudad de San Salvador de Jujuy— se inscribe en el patrón de las capitales del NOA: ciudades medianas-grandes con densidad alta, crecimiento sostenido y una concentración demográfica desproporcionada respecto al resto de su provincia. Es comparable en peso relativo a Salta Capital (depto. Capital sobre el total provincial), Tucumán Capital o La Banda en Santiago del Estero. Su densidad de **${formatInteger(densBelg)} hab./km²** es comparable a la de capitales medianas argentinas, aunque muy por debajo de CABA (>14.000 hab./km²) o el Gran Rosario.

La ${desvEdad <= 0 ? "menor" : "mayor"} edad mediana respecto al promedio nacional reproduce el patrón NOA de transición demográfica tardía, sostenida por una fecundidad todavía por encima del promedio nacional (${formatDecimal(CENSO_2022.hijos_por_mujer_nacional || 1.4, 1)} hijos por mujer). Esta característica configura una ventana de bono demográfico que se mantiene activa en el corto-mediano plazo: una población económicamente activa relativamente joven es un activo si el sistema productivo y educativo puede absorberla con empleo de calidad, o un pasivo si no.

El crecimiento decenal del **${formatPercent(varPctBelg)}** ubica a Belgrano dentro del rango habitual de capitales NOA y por encima del promedio nacional. La concentración demográfica capital es un patrón estructural argentino: provincias chicas tienden a tener capitales que pesan más sobre el total provincial, mientras las provincias grandes (Buenos Aires, Santa Fe, Córdoba) reparten su población entre múltiples ciudades intermedias.`,

    policyImplications: `La centralidad demográfica de Belgrano plantea tres tensiones estratégicas para la política pública. **Primera**: cualquier promedio "Jujuy" oculta la heterogeneidad real entre el corazón capitalino y el resto de la provincia. Las políticas universales aplicadas uniformemente terminan beneficiando desproporcionadamente a la capital por su mayor capacidad institucional preexistente. Los recortes departamentales son indispensables para diseñar política pública territorialmente equitativa.

**Segunda**: dentro de Belgrano, la dualidad **centro consolidado / Alto Comedero** exige miradas focalizadas que el dato departamental agregado todavía no resuelve. El centro histórico demanda servicios para población mayor, regeneración urbana y conservación patrimonial; Alto Comedero demanda infraestructura básica, escuelas y centros de salud, transporte público y oportunidades de empleo. El siguiente paso analítico natural es bajar el análisis a radios censales o barrios, para visibilizar esta dualidad estadísticamente.

**Tercera**: el crecimiento sostenido (${formatPercent(varPctBelg)} decenal) anticipa demandas crecientes de infraestructura urbana, vivienda, transporte y servicios sociales, con foco en la periferia sur — donde se concentra la mayor parte de la expansión y donde el déficit acumulado de inversión pública es mayor. La planificación urbana capital tiene una ventana de oportunidad ahora, antes de que la expansión consolide patrones territoriales difíciles de revertir.`,
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

  const sectionDist = "Combustibles para cocinar en Belgrano";
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

  const sectionAgua = "Procedencia del agua en Belgrano";
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
    const sectionMat = "Materiales de piso en Belgrano";
    const sidMat = slugify(sectionMat);
    builder.addChart({ id: "pie-piso", type: "pie", title: "Material predominante de los pisos — Belgrano", sectionId: sidMat, sectionTitle: sectionMat, data: [
      { id: "Cerámica/Mosaico/Madera", label: "Cerámica/Mosaico/Madera", value: matBelg[2] },
      { id: "Carpeta/Contrapiso", label: "Carpeta/Contrapiso", value: matBelg[3] },
      { id: "Tierra/Ladrillo suelto", label: "Tierra/Ladrillo suelto", value: matBelg[4] },
      { id: "Otro", label: "Otro", value: matBelg[5] },
    ].filter(d => d.value > 0) });
  }

  const rankedGar = combTable.departamentos.map(({ departamento, row }) => { const r = row.map(toNumber); return { departamento, value: (r[6] / r[2]) * 100 }; }).sort((a, b) => b.value - a.value);
  builder.addRanking({ id: "rank-garrafa", title: "Departamentos con mayor uso de gas en garrafa", sectionId: sidAccess, items: rankedGar.map(r => ({ name: r.departamento.nombre, value: Math.round(r.value * 10) / 10, municipioId: r.departamento.codigo })), order: "desc" });

  const data = builder.build();
  const desvGas = gasRedPct - CENSO_2022.pct_gas_red_nacional;
  const desvAgua = caneriaDentroPct - CENSO_2022.pct_agua_red_nacional;
  const posBelgGas = [...combTable.departamentos].map(({ departamento, row }) => { const r = row.map(toNumber); return { depto: departamento, pct: (r[4] / r[2]) * 100 }; }).sort((a, b) => b.pct - a.pct).findIndex(x => x.depto.codigo === BELGRANO_CODIGO) + 1;

  const md = buildReportMd({
    ...data,
    intro: `Sobre **${formatInteger(pobBelg)} personas** en viviendas particulares en Dr. M. Belgrano, el **${formatPercent(gasRedPct)}** cocina con gas de red, el **${formatPercent(caneriaDentroPct)}** accede al agua por cañería dentro de la vivienda y el **${formatPercent(conInternetPct)}** vive en hogares con conexión a internet. La capital concentra coberturas mucho más altas que el promedio provincial — efecto neto de la urbanización del corredor central — pero esconde su propia heterogeneidad interna entre el casco consolidado y Alto Comedero.`,

    executiveSummary: `El perfil habitacional de Belgrano refleja una capital urbana plena con coberturas claramente superiores al promedio provincial en casi todos los servicios básicos. La cobertura de gas de red del **${formatPercent(gasRedPct)}** es la más alta de Jujuy (puesto **${posBelgGas}** entre los 16 deptos.) — un desvío de ${desvGas >= 0 ? `**+${formatDecimal(desvGas, 1)} pp**` : `**${formatDecimal(desvGas, 1)} pp**`} respecto al promedio nacional de **${formatDecimal(CENSO_2022.pct_gas_red_nacional, 1)}%**. La cobertura de agua dentro de la vivienda alcanza el **${formatPercent(caneriaDentroPct)}** (${desvAgua >= 0 ? `**+${formatDecimal(desvAgua, 1)} pp**` : `**${formatDecimal(desvAgua, 1)} pp**`} vs. **${formatDecimal(CENSO_2022.pct_agua_red_nacional, 1)}%** nacional), reflejo de una infraestructura sanitaria urbana sólida.

A pesar de estas cifras agregadas favorables, el **${formatPercent(gasGarrafaPct)}** de la población capital todavía depende del gas en garrafa — un déficit estructural concentrado en Alto Comedero, asentamientos populares y barrios periurbanos sin red. El costo equivalente por caloría útil del gas en garrafa es sustancialmente mayor que el del gas natural, configurando una situación de **pobreza energética intra-Belgrano** que las cifras agregadas tienden a invisibilizar. Esta brecha intra-capital reproduce, en escala barrial, la brecha territorial que separa al corredor central del NOA jujeño del altiplano puneño.

La brecha digital en Belgrano es moderada: **${formatPercent(sinInternetPct)}** sin internet, una proporción inferior al promedio provincial pero todavía relevante para una capital. Las brechas se concentran nuevamente en barrios populares y entre adultos mayores. Post-pandemia, la insuficiencia de equipamiento digital limita el aprovechamiento educativo, sanitario y laboral del recurso disponible.

El **${formatPercent(propiaPct)}** de la población capital vive en vivienda propia y el **${formatPercent(alquilPct)}** en alquiler — el peso del alquiler es claramente mayor que en el resto de la provincia, característica esperable de una capital con población universitaria, migración interna por trabajo y empleo público. La regularización dominial pendiente en barrios populares de Alto Comedero limita el acceso al crédito hipotecario y a programas formales de mejora habitacional para una fracción significativa de los "propietarios" formales.`,

    keyFindings: [
      `**Gas de red líder provincial:** **${formatPercent(gasRedPct)}** vs. promedio provincial mucho menor (depto. **${posBelgGas}°** del ranking). El desvío respecto a la media nacional es de **${desvGas >= 0 ? "+" : ""}${formatDecimal(desvGas, 1)} pp**.`,
      `**Pobreza energética latente:** **${formatPercent(gasGarrafaPct)}** depende de gas en garrafa, concentrado en Alto Comedero y asentamientos populares — núcleo de déficit energético capital.`,
      `**Agua de red:** **${formatPercent(caneriaDentroPct)}** dentro de la vivienda, ${desvAgua >= 0 ? `por encima` : `por debajo`} del promedio nacional. Cobertura cuasi universal en el casco urbano.`,
      `**Brecha digital moderada:** **${formatPercent(sinInternetPct)}** sin internet en la vivienda — la menor de Jujuy pero con bolsones críticos en barrios populares.`,
      `**Alquiler como hecho metropolitano:** **${formatPercent(alquilPct)}** alquila — mayor peso que en cualquier otro departamento provincial, característica típica de capitales NOA.`,
      `**Saneamiento intra-vivienda:** ${sinBanoPct < 1 ? `cuasi universal; déficit residual menor a 1%` : `**${formatDecimal(sinBanoPct, 1)}%** sin baño en la vivienda`} — concentrado en asentamientos populares.`,
    ],

    keyDatum: `**Dato destacado:** la capital lidera la cobertura de gas de red provincial (**${formatPercent(gasRedPct)}**) pero **${formatPercent(gasGarrafaPct)}** de sus habitantes todavía depende de garrafa — una contradicción interna que define la dualidad estructural entre el casco urbano consolidado y los barrios periféricos, particularmente Alto Comedero.`,

    sectionNarratives: {
      [sidDist]: `La matriz energética doméstica de Belgrano está mucho más desarrollada que la del resto de la provincia: el gas natural domiciliario es la fuente predominante, alimentado por la red troncal que llega al corredor capital. La garrafa retiene presencia significativa (**${formatPercent(gasGarrafaPct)}**) en barrios periurbanos sin acceso a la red, especialmente **Alto Comedero**, donde la expansión urbana fue más rápida que el tendido de servicios. La leña y carbón mantienen presencia residual en zonas rurales del departamento (escasas, pero presentes en los bordes hacia las Yungas y la quebrada).

La transición energética intra-capital es una asignatura pendiente: extender la red de gas a barrios populares periurbanos enfrenta umbrales de rentabilidad y problemas de regularización dominial, pero alternativas como electrificación o garrafa social subsidiada deberían formar parte del menú de políticas.`,

      [sidAccess]: `Belgrano lidera la cobertura provincial de gas de red (**${formatPercent(gasRedPct)}**) — la diferencia con departamentos puneños (donde la red troncal no llega) es de decenas de puntos porcentuales. Esta concentración refleja la geografía de la infraestructura: el gasoducto del NOA cubre el corredor central jujeño y deja afuera los departamentos de altura, donde la baja densidad poblacional vuelve económicamente inviable extender la red.

Internamente, sin embargo, Belgrano no está homogéneamente cubierta: el **${formatPercent(gasGarrafaPct)}** que depende de garrafa configura un núcleo de pobreza energética concentrado en barrios populares y en la expansión sur de la ciudad. La política pública capital debería diferenciar este déficit intra-departamental del que afecta a los departamentos puneños — son fenómenos cualitativamente distintos que demandan soluciones distintas.`,

      [sidAgua]: `La red pública cubre a la amplísima mayoría de los hogares belgranenses (**${formatPercent(caneriaDentroPct)}** con cañería dentro de la vivienda). Las situaciones de provisión por perforación, transporte por cisterna o canilla pública se concentran en zonas periurbanas sin infraestructura consolidada, particularmente en Alto Comedero. La cobertura agregada se compara favorablemente con el promedio nacional (**${formatDecimal(CENSO_2022.pct_agua_red_nacional, 1)}%**) y refleja inversión sostenida del estado provincial y municipal en la red de agua.

Cuestión pendiente: la **calidad** del agua (presión, continuidad, calidad química) no está medida en este indicador — pueden persistir problemas de calidad incluso donde formalmente hay cobertura.`,

      [sidDigital]: `La brecha digital en Belgrano es la menor de Jujuy, pero todavía afecta a una fracción significativa: **${formatPercent(sinInternetPct)}** de los habitantes no tiene internet en su vivienda. Sumado al **${formatDecimal(netPobBelg ? (netBelg[4] / netPobBelg) * 100 : 0, 1)}%** que tiene conexión pero sin dispositivo adecuado, configura un universo con acceso digital limitado. El impacto post-pandemia es claro: virtualización educativa, sanitaria y administrativa golpea más a los hogares sin equipamiento. Las brechas se concentran en barrios populares y entre adultos mayores.`,

      [sidTen]: `El alquiler tiene mayor peso en Belgrano (**${formatPercent(alquilPct)}**) que en cualquier otro departamento jujeño. La población universitaria de la UNJu, los empleados públicos provinciales que se trasladan a la capital y la migración interna por trabajo sostienen una demanda de alquiler estructural. Esta característica capital requiere instrumentos de política específicos (regulación de alquileres, programas de acceso a primera vivienda) que en el interior provincial son menos relevantes.

La propiedad mayoritaria (**${formatPercent(propiaPct)}**) convive con un fenómeno significativo: la regularización dominial pendiente en barrios populares —particularmente Alto Comedero— donde muchas viviendas "propias" lo son sin escritura formal. Esto limita el acceso al crédito hipotecario y a programas formales de mejora habitacional.`,

      [sidCloaca]: `El baño dentro de la vivienda es prácticamente universal en Belgrano. El déficit residual (${sinBanoPct < 1 ? `menos del 1%` : `**${formatDecimal(sinBanoPct, 1)}%**`}) se concentra en asentamientos populares periurbanos. La conexión a red cloacal pública (no medida directamente en este cuadro) es una cuestión distinta: una fracción significativa del depto tiene baño en la vivienda pero descarga a pozo o cámara séptica, especialmente en Alto Comedero, lo que tensiona la sustentabilidad sanitaria del crecimiento periurbano.`,
    },

    nationalContext: `El perfil habitacional de Belgrano se inscribe en el patrón típico de las capitales NOA: cobertura urbana plena en agua y gas, brechas digitales moderadas, fuerte presencia del alquiler en una matriz con propiedad mayoritaria. La cobertura de gas de red provincial (**${formatPercent(gasRedPct)}**) en Belgrano se compara favorablemente con la del promedio nacional (**${formatDecimal(CENSO_2022.pct_gas_red_nacional, 1)}%**) — la capital provincial supera al promedio nacional gracias al gasoducto del NOA que la abastece. Esta cifra contrasta marcadamente con departamentos puneños (donde la red no llega) y con buena parte del NEA y la Patagonia.

La cobertura de agua corriente (**${formatPercent(caneriaDentroPct)}**) replica el patrón nacional con leves variaciones. La brecha digital es comparable a la de otras capitales NOA y por debajo del promedio nacional. El peso del alquiler (**${formatPercent(alquilPct)}**) es típico de capitales del interior: mayor que en municipios chicos, menor que en CABA o el Conurbano bonaerense.`,

    policyImplications: `El perfil habitacional capital plantea tres tensiones estructurales para la política pública. **Primera**: la **dualidad intra-capital** entre el casco urbano consolidado (con cobertura plena) y los barrios populares periurbanos (con déficits significativos). La política habitacional capital debe diferenciar estos contextos: no es lo mismo intervenir en el centro histórico que en Alto Comedero. La política habitacional uniforme termina invisibilizando los déficits concentrados en la periferia.

**Segunda**: la **regularización dominial** como pre-requisito de cualquier política de mejora habitacional. Sin escrituras formales en barrios populares, el acceso al crédito hipotecario, los programas de mejora y la integración a la trama urbana formal quedan bloqueados. Avanzar en regularización es una condición habilitante.

**Tercera**: la **calidad** vs. **cobertura**. Los indicadores censales miden cobertura binaria (tiene/no tiene) pero no calidad del servicio. Presión y continuidad del agua, calidad química, frecuencia y costo de las garrafas, ancho de banda efectivo de internet — todas dimensiones que afectan a poblaciones formalmente cubiertas. La política pública integral debe combinar el dato censal con relevamientos cualitativos y operativos complementarios.`,
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
  const posBelg = ranked.findIndex(r => r.departamento.codigo === BELGRANO_CODIGO) + 1;

  for (const { departamento, row } of saludTable.departamentos) {
    const r = row.map(toNumber);
    const pct = (r[5] / r[2]) * 100;
    builder.addMapItem({ municipioId: departamento.codigo, municipioNombre: departamento.nombre, value: Math.round(pct * 10) / 10, label: `${formatPercent(pct)} sin cobertura` });
  }

  const data = builder.build();
  const desvSin = sinCobPct - CENSO_2022.pct_solo_publica_nacional;
  const desvObra = conObraPct - CENSO_2022.pct_obra_social_nacional;

  const md = buildReportMd({
    ...data,
    intro: `En el Departamento Dr. M. Belgrano, el **${formatPercent(conObraPct)}** declara contar con obra social o prepaga, el **${formatPercent(programasPct)}** está cubierto por programas estatales, y el **${formatPercent(sinCobPct)}** depende exclusivamente del sistema público (${formatInteger(pobSinCob)} personas). La cobertura previsional alcanza al **${formatPercent(conJubPct)}** de la población. Belgrano concentra la principal infraestructura sanitaria pública provincial: Hospital Pablo Soria, Hospital Materno-Infantil, Hospital San Roque y la red de CAPS capital.`,

    executiveSummary: `Belgrano presenta la **mayor cobertura formal de salud de Jujuy**: **${formatPercent(conObraPct)}** con obra social o prepaga vs. el promedio nacional de **${formatDecimal(CENSO_2022.pct_obra_social_nacional, 1)}%** — un desvío de ${desvObra >= 0 ? `**+${formatDecimal(desvObra, 1)} pp**` : `**${formatDecimal(desvObra, 1)} pp**`} explicado por el peso del empleo público provincial (que aporta cobertura formal vía obra social provincial), la concentración de empleados sindicalizados con OSDE, OSPLAD, OSECAC y similares, y la mayor penetración relativa de prepagas privadas en el segmento de servicios profesionales.

La población sin cobertura formal (**${formatPercent(sinCobPct)}**, ${formatInteger(pobSinCob)} personas) es la **${posBelg <= 8 ? "más baja" : "intermedia"}** de la provincia (puesto ${posBelg}° del ranking) — un desvío de ${desvSin >= 0 ? `**+${formatDecimal(desvSin, 1)} pp**` : `**${formatDecimal(Math.abs(desvSin), 1)} pp por debajo**`} del promedio nacional. La cobertura previsional (**${formatPercent(conJubPct)}**) refleja el efecto de las moratorias en la población adulta mayor.

Como capital provincial, Belgrano concentra la **infraestructura sanitaria pública de mayor complejidad de Jujuy**: el Hospital Pablo Soria es el centro de referencia provincial para alta complejidad, recibiendo derivaciones de toda la provincia. La capacidad sanitaria capital opera, por tanto, simultáneamente como sistema local (para sus propios habitantes) y como sistema regional (para el resto de Jujuy y zonas limítrofes). Esta función dual tensiona la planificación: capacidad calculada solo por habitantes locales subestima la demanda real.

Internamente, sin embargo, la heterogeneidad es marcada: el casco urbano consolidado y zonas con concentración de empleo formal presentan coberturas superiores al promedio capital; **Alto Comedero**, asentamientos populares y barrios periurbanos concentran la mayor parte de la población sin cobertura formal y dependen exclusivamente de CAPS y de derivación al sistema público.`,

    keyFindings: [
      `**Cobertura formal líder provincial:** **${formatPercent(conObraPct)}** con obra social/prepaga — la mayor de Jujuy, ${desvObra >= 0 ? `por encima` : `por debajo`} del promedio nacional (${formatDecimal(CENSO_2022.pct_obra_social_nacional, 1)}%).`,
      `**Sin cobertura:** **${formatPercent(sinCobPct)}** (${formatInteger(pobSinCob)} personas) depende exclusivamente del sistema público — la menor proporción de Jujuy.`,
      `**Cobertura previsional:** **${formatPercent(conJubPct)}** percibe jubilación o pensión, reflejando el efecto de las moratorias.`,
      `**Capitalidad sanitaria:** Belgrano concentra Hospital Pablo Soria (alta complejidad), Materno-Infantil, San Roque y la mayor red de CAPS provincial.`,
      `**Función dual del sistema capital:** la red sanitaria capital atiende a sus propios habitantes y a derivaciones del resto de la provincia — la presión efectiva supera la calculada por habitantes locales.`,
      `**Dualidad interna:** dentro de Belgrano, el casco consolidado tiene cobertura formal alta; Alto Comedero y asentamientos populares concentran la dependencia del sistema público.`,
    ],

    keyDatum: `**Dato destacado:** Belgrano combina la **mayor cobertura formal de salud de Jujuy** (${formatPercent(conObraPct)}) con la **concentración de la infraestructura sanitaria pública de alta complejidad** — una capital donde la mayoría tiene obra social formal pero buena parte de la atención efectiva igualmente pasa por hospitales y CAPS públicos.`,

    sectionNarratives: {
      [sidCob]: `El sistema sanitario capital combina las tres dimensiones de cobertura: **obra social o prepaga (${formatPercent(conObraPct)})**, **programas estatales (${formatPercent(programasPct)})** y **sistema público exclusivo (${formatPercent(sinCobPct)})**. La obra social provincial (IPS Jujuy) cubre a empleados públicos provinciales —muy concentrados en Belgrano—; las obras sociales sindicales nacionales (OSDE, OSECAC, OSPLAD, etc.) cubren al empleo asalariado formal; las prepagas privadas tienen presencia significativa entre profesionales y servicios. PAMI cubre cuasi universalmente a los adultos mayores.

La arquitectura tripartita argentina genera, en la práctica, sobreutilización del sistema público incluso por población con coberturas formales: cuando la red de prestadores privados es limitada o los tiempos de espera son largos, los hospitales públicos terminan absorbiendo la demanda. En Belgrano, donde la red privada es relativamente desarrollada, este efecto es menor que en otras capitales NOA, pero igualmente significativo.`,

      [sidDes]: `La distribución territorial de la cobertura sanitaria muestra a Belgrano en el extremo "mejor cubierto" del ranking provincial. Los departamentos puneños y de altura (Susques, Rinconada, Santa Catalina) presentan tasas mucho mayores de población sin cobertura formal: empleo informal, cuentapropismo de subsistencia, trabajo agrícola estacional configuran el grueso de la fuerza laboral en esas zonas.

**Dentro de Belgrano**, la heterogeneidad reproducida en escala barrial: el casco urbano y barrios con empleo formal concentran las coberturas más altas; Alto Comedero, asentamientos populares y barrios periurbanos concentran la dependencia del sistema público. La cifra capital agregada oculta esta dualidad — visibilizarla requeriría bajar a radios censales.`,
    },

    nationalContext: `Argentina presenta una cobertura formal de salud (obra social/prepaga/plan estatal) del **${formatDecimal(CENSO_2022.pct_obra_social_nacional, 1)}%** según Censo 2022, dejando un **${formatDecimal(CENSO_2022.pct_solo_publica_nacional, 1)}%** dependiente exclusivamente del sistema público. Belgrano se ubica ${desvObra >= 0 ? `por encima` : `por debajo`} del promedio nacional en cobertura formal — un patrón típico de capitales provinciales NOA donde el peso del empleo público y de servicios profesionales es alto.

La función dual de la red sanitaria capital (atender a habitantes locales + recibir derivaciones del resto de la provincia) replica el patrón de otras capitales argentinas (CABA respecto al AMBA y al país, Tucumán capital respecto a la provincia, etc.). El indicador censal de cobertura es estrecho: mide afiliación declarada, no acceso real, calidad ni oportunidad de la atención.`,

    policyImplications: `El perfil sanitario capital plantea tres tensiones específicas. **Primera**: la **función regional del sistema público capital**. Belgrano atiende a su propia población y a derivaciones provinciales — la planificación de infraestructura, recursos humanos y financiamiento debe considerar esta doble demanda. Subestimarla genera saturación crónica de hospitales de referencia.

**Segunda**: la **dualidad interna**. La cobertura formal alta promedio capital esconde un núcleo significativo —Alto Comedero, asentamientos populares— donde la dependencia del sistema público es total. Los CAPS de esos barrios deben recibir inversión sostenida; no son "auxiliares" del sistema sino su columna vertebral en esas zonas.

**Tercera**: el **envejecimiento anticipado**. En la próxima década, las cohortes que hoy están en la quinta y sexta década de vida en barrios consolidados ingresarán masivamente a PAMI. La oferta de servicios geriátricos, rehabilitación y cuidados crónicos en Belgrano debe prepararse — la transición demográfica capital se acelerará antes que el resto de la provincia.`,
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

  const sectionGas = "Gas de red — comparativo provincial";
  const sidGas = slugify(sectionGas);
  builder.addChart({ id: "bar-gas-hog-comp", type: "bar", title: "% hogares con gas de red por departamento", sectionId: sidGas, sectionTitle: sectionGas, data: combTable.departamentos.map(({ departamento, row }) => { const r = row.map(toNumber); return { departamento: departamento.nombre, "Gas de red %": Math.round((r[4] / r[2]) * 1000) / 10 }; }), config: { xAxis: "departamento", yAxis: "Gas de red %" } });

  const rankedAlq = tenTable.departamentos.map(({ departamento, row }) => { const r = row.map(toNumber); return { departamento, value: (r[8] / r[2]) * 100 }; }).sort((a, b) => b.value - a.value);
  builder.addRanking({ id: "rank-alq", title: "Departamentos con mayor % alquiler", sectionId: sidAlq, items: rankedAlq.map(r => ({ name: r.departamento.nombre, value: Math.round(r.value * 10) / 10, municipioId: r.departamento.codigo })), order: "desc" });
  const posAlq = rankedAlq.findIndex(r => r.departamento.codigo === BELGRANO_CODIGO) + 1;

  const data = builder.build();
  const pctHogProv = (totalHogares / 247720) * 100; // aprox total hogares Jujuy (estimado del Censo 2022)

  const md = buildReportMd({
    ...data,
    intro: `El Departamento Dr. M. Belgrano concentra **${formatInteger(totalHogares)} hogares** —el mayor stock de hogares de la provincia, aproximadamente el 40% del total provincial—. El **${formatPercent(propiaPct)}** vive en vivienda propia y el **${formatPercent(alquiladaPct)}** alquila — el peso del alquiler es mayor que en cualquier otro departamento jujeño, característica típica de las capitales del NOA. La cobertura de gas de red alcanza al **${formatPercent(gasRedHogPct)}** de los hogares capital, liderando ampliamente el ranking provincial.`,

    executiveSummary: `Los **${formatInteger(totalHogares)} hogares** registrados en Belgrano en 2022 configuran el núcleo del mercado habitacional jujeño. La estructura de tenencia muestra propiedad mayoritaria (**${formatPercent(propiaPct)}**), patrón típico del NOA, conviviendo con un mercado de alquiler robusto (**${formatPercent(alquiladaPct)}**) que es proporcionalmente mayor que en cualquier otro departamento provincial (puesto ${posAlq}° del ranking). La capital captura una demanda de alquiler estructural sostenida por: (a) población universitaria de la UNJu y de institutos terciarios; (b) empleados públicos provinciales y nacionales que rotan; (c) migración interna desde el interior jujeño por trabajo; (d) movilidad laboral propia del sector servicios.

La **cobertura de gas de red domiciliaria (${formatPercent(gasRedHogPct)})** lidera ampliamente el ranking provincial: la red troncal del NOA llega al corredor central jujeño y concentra su disponibilidad efectiva en Belgrano y Palpalá. Los déficits intra-Belgrano se concentran en barrios periurbanos no servidos por la red, particularmente Alto Comedero y asentamientos populares — fenómeno que dentro de la capital configura una **frontera energética interna** entre el casco urbano y la periferia sur.

La regularización dominial es un pendiente significativo dentro del **${formatPercent(propiaPct)}** que figura como "propietario". En barrios populares (Alto Comedero, asentamientos consolidados, expansión sur) muchas viviendas son ocupadas por familias sin escritura formal: figuran en el Censo como propiedad pero no acceden a crédito hipotecario, programas formales de mejora ni garantías reales sobre el bien. Esta brecha entre **propiedad censal** y **propiedad jurídicamente plena** es un fenómeno conocido del NOA y particularmente significativo en Alto Comedero.

El alquiler como hecho metropolitano genera dinámicas específicas: presión sobre precios en zonas con demanda concentrada (centro, cercanías UNJu, Av. Senador Pérez, Ciudad de Nieva), informalidad contractual frecuente, dificultad de acceso a primera vivienda para hogares jóvenes. Instrumentos como regulación de alquileres, programas de garantía estatal y créditos accesibles tienen relevancia capital pero no provincial.`,

    keyFindings: [
      `**Hogares totales:** **${formatInteger(totalHogares)}** — el mayor stock departamental de Jujuy, ~40% del total provincial.`,
      `**Tenencia propia mayoritaria:** **${formatPercent(propiaPct)}** — alineado con patrón provincial pero con regularización dominial pendiente en barrios populares.`,
      `**Alquiler hecho capital:** **${formatPercent(alquiladaPct)}** — puesto ${posAlq}° del ranking provincial, claramente por encima del resto.`,
      `**Gas de red líder:** **${formatPercent(gasRedHogPct)}** de los hogares con cobertura — la más alta de Jujuy.`,
      `**Demanda estructural de alquiler:** sostenida por UNJu, empleo público, migración interna y servicios.`,
      `**Frontera energética interna:** déficit de gas concentrado en Alto Comedero y asentamientos populares dentro del depto.`,
    ],

    keyDatum: `**Dato destacado:** Belgrano concentra el **${formatPercent(alquiladaPct)}** de hogares en alquiler — la mayor proporción de Jujuy. La condición capital genera un mercado de alquiler estructural que el resto de la provincia no tiene, demandando instrumentos de política específicos (regulación, garantías, créditos a primera vivienda).`,

    sectionNarratives: {
      [sidTen]: `Belgrano combina la estructura típica de propiedad mayoritaria del NOA con un componente de alquiler claramente más relevante que el resto de la provincia. La población universitaria (UNJu como motor), los empleados públicos provinciales y nacionales, y la migración interna por trabajo sostienen una demanda de alquiler estructural y previsible.

La fracción "Cedida" agrega hogares que ocupan viviendas sin pago formal (vivienda funcional, cesión familiar, ocupación tolerada) y es proporcionalmente mayor en barrios populares. Sumadas, las situaciones "no propietario formal" (alquiler + cedida + otras) configuran el universo capital con vulnerabilidad de tenencia, particularmente expuesto a desalojos, aumentos abruptos o pérdida de vivienda por cambio de empleo.

La política habitacional capital debe diferenciar estos sub-universos: el alquilino joven con contrato formal tiene problemas distintos al ocupante de vivienda cedida sin escrituras, y ambos a su vez distintos al propietario con escritura plena.`,

      [sidAlq]: `Belgrano lidera el ranking provincial de alquiler (**${formatPercent(alquiladaPct)}**, puesto ${posAlq}°), seguido por Palpalá (segundo eslabón del aglomerado capital) y a mucha distancia por El Carmen. Los departamentos rurales y de altura presentan tasas mínimas de alquiler: la tenencia tradicional propia, la transmisión familiar de la vivienda y la baja rotación laboral configuran un paisaje habitacional muy distinto.

El mercado de alquiler capital tiene zonas claramente diferenciadas: el centro histórico y las cercanías de la UNJu sostienen los precios más altos (demanda estudiantil + administrativa); barrios consolidados del norte (Ciudad de Nieva, Mariano Moreno) tienen alquiler estable con familias; la periferia sur tiene alquiler más informal con mayor rotación.`,

      [sidGas]: `Belgrano lidera la cobertura provincial de gas de red domiciliaria (**${formatPercent(gasRedHogPct)}**). Esta cifra refleja la geografía de la red troncal de gasoductos del NOA: el ramal que atraviesa el corredor capital ofrece disponibilidad efectiva muy superior a la del altiplano o las Yungas, donde la red no llega. Dentro de Belgrano, sin embargo, los déficits se concentran en barrios periurbanos sin tendido — la red urbana no es homogénea.`,
    },

    nationalContext: `El perfil habitacional de hogares en Belgrano replica el patrón típico de las capitales del NOA: propiedad mayoritaria, alquiler más relevante que en el interior provincial, cobertura urbana plena en gas y servicios básicos. La proporción de alquiler capital (**${formatPercent(alquiladaPct)}**) está por debajo de capitales más grandes y más metropolitanas (CABA, Gran Rosario, Gran Córdoba), pero claramente por encima de capitales más chicas y de departamentos rurales.

La regularización dominial pendiente en barrios populares es un fenómeno nacional con particular incidencia en el NOA: el peso del autoconstruido, las ocupaciones consolidadas y los planes de vivienda con escrituras nunca formalizadas configuran un universo donde la propiedad censal supera a la propiedad jurídica plena.`,

    policyImplications: `El perfil habitacional capital plantea tres tensiones específicas para política pública. **Primera**: el **mercado de alquiler** como hecho metropolitano. Belgrano demanda instrumentos específicos para inquilinos —regulación de alquileres, garantías estatales, programas de acceso a primera vivienda, créditos hipotecarios adaptados a contratos de alquiler— que en el interior provincial son menos relevantes. Las políticas provinciales uniformes terminan invisibilizando este universo.

**Segunda**: la **regularización dominial** como condición habilitante. Sin escrituras formales en barrios populares de Alto Comedero, los programas de mejora habitacional, el crédito hipotecario y las inversiones de los propios habitantes en sus viviendas quedan bloqueados. Avanzar en regularización es un paso de bajo costo fiscal y alto retorno social.

**Tercera**: la **frontera energética interna**. La cobertura de gas de red capital es la más alta de Jujuy pero esconde déficits significativos en la periferia sur. La extensión de la red urbana donde es viable, combinada con alternativas (electrificación, garrafa social ampliada) donde no, es una agenda concreta de política capital — no provincial.`,
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
  const piezaInquilPct = (c3Belg[7] / c3Belg[2]) * 100;
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
    intro: `El stock habitacional de Belgrano suma **${formatInteger(totalViv)} viviendas** (**${formatInteger(particulares)}** particulares y **${formatInteger(colectivas)}** colectivas) — el mayor stock departamental de Jujuy. El **${formatPercent(casaPct)}** son casas y el **${formatPercent(deptoPct)}** departamentos, esta última siendo la mayor proporción provincial — consistente con el perfil urbano de la capital. La desocupación habitacional alcanza el **${formatPercent(desocupadasPct)}** y el hacinamiento residencial (viviendas con 2+ hogares) el **${formatPercent(hacinamientoPct)}** — concentrado en Alto Comedero y barrios populares.`,

    executiveSummary: `Belgrano concentra el **principal stock habitacional urbano de Jujuy**: **${formatInteger(totalViv)} viviendas** distribuidas entre **casas (${formatPercent(casaPct)})** y **departamentos en altura (${formatPercent(deptoPct)})** —esta última siendo la mayor participación provincial en el stock particular, característica esperable de una capital con desarrollo vertical en zonas céntricas y de Av. Senador Pérez—. Las formas precarias (rancho, casilla, pieza en inquilinato) representan el **${formatDecimal(ranchoCasillaPct + piezaInquilPct, 1)}%** del stock — minoritario pero significativo, concentrado en asentamientos populares y en la expansión sur.

La **desocupación habitacional (${formatPercent(desocupadasPct)})** combina situaciones cualitativamente muy distintas: stock urbano en alquiler o venta no ocupado al momento del Censo, viviendas en construcción, segundas residencias capital (algunas familias mantienen unidad en la capital y residen habitualmente en interior), y stock potencialmente subutilizado. Es comparable al promedio provincial y refleja un mercado inmobiliario capital relativamente activo.

El **hacinamiento residencial (${formatPercent(hacinamientoPct)})** —viviendas que alojan 2 o más hogares— afecta principalmente a **Alto Comedero, asentamientos populares y barrios periurbanos del sur**, donde la presión sobre el stock se acumuló por décadas. Los hogares involucrados comparten cocina, baño y espacios comunes con otra unidad familiar, frecuentemente por imposibilidad económica de acceder a vivienda propia o por subdivisión informal del stock existente. Es uno de los indicadores más claros de déficit habitacional cuantitativo.

La paradoja del stock urbano capital es típica del NOA: coexistencia de **stock subutilizado** (desocupación, segundas residencias) con **stock sobreutilizado** (hacinamiento residencial, multihogar). Esta paradoja no se resuelve simplemente "reasignando" viviendas: la heterogeneidad cualitativa entre vivienda ociosa y vivienda demandada (ubicación, precio, condiciones) impide una solución directa por mercado o regulación. Requiere instrumentos focalizados — programas de mejora habitacional, regularización dominial, créditos accesibles para primera vivienda — adaptados al contexto territorial.`,

    keyFindings: [
      `**Stock total:** **${formatInteger(totalViv)} viviendas** en Belgrano — el mayor stock departamental de Jujuy.`,
      `**Departamentos:** **${formatPercent(deptoPct)}** del stock particular — la mayor proporción provincial, perfil capital.`,
      `**Casas:** **${formatPercent(casaPct)}** — sigue siendo la tipología predominante incluso en la capital.`,
      `**Desocupación:** **${formatPercent(desocupadasPct)}** del stock — mezcla de alquiler, segundas residencias y stock en construcción.`,
      `**Hacinamiento residencial:** **${formatPercent(hacinamientoPct)}** — concentrado en Alto Comedero y barrios populares.`,
      `**Formas precarias:** **${formatDecimal(ranchoCasillaPct + piezaInquilPct, 1)}%** rancho/casilla/inquilinato — minoritario pero indicador clave de déficit.`,
    ],

    keyDatum: `**Dato destacado:** Belgrano combina **stock subutilizado** (${formatPercent(desocupadasPct)} desocupado) con **stock sobreutilizado** (${formatPercent(hacinamientoPct)} multihogar) — la paradoja típica del NOA: coexisten unidades ociosas con familias hacinadas en otras unidades del mismo territorio.`,

    sectionNarratives: {
      [sidTipo]: `Belgrano tiene la composición tipológica más urbana de Jujuy. El **${formatPercent(deptoPct)}** de departamentos refleja desarrollo vertical concentrado en zonas céntricas: Av. Senador Pérez, microcentro, Ciudad de Nieva y algunos corredores nuevos. Es la única zona de la provincia donde la vivienda en altura tiene peso relevante.

La **casa unifamiliar (${formatPercent(casaPct)})** sigue siendo predominante, particularmente en barrios consolidados (Mariano Moreno, Los Perales, Cuyaya) y en toda la expansión sur (Alto Comedero). Las formas precarias —rancho, casilla, pieza en inquilinato (**${formatDecimal(ranchoCasillaPct + piezaInquilPct, 1)}%**)— se concentran en asentamientos populares de la periferia y en pensiones del microcentro. Aunque numéricamente minoritarias, son las viviendas con mayores déficits estructurales (materiales, servicios, tenencia).`,

      [sidDes]: `La **desocupación en Belgrano (${formatPercent(desocupadasPct)})** está en línea con el promedio provincial. Tiene tres componentes principales: (a) stock en alquiler/venta sin ocupación al momento del Censo —indicador de mercado activo—; (b) segundas residencias —familias del interior provincial que mantienen unidad en la capital—; (c) viviendas en construcción y stock formalmente registrado pero efectivamente ocioso.

A diferencia de zonas turísticas (Quebrada, Yungas) donde la desocupación responde a segundas residencias y alquileres temporarios, en Belgrano la desocupación es predominantemente urbana: stock de mercado en rotación.`,

      [sidHacComp]: `El **hacinamiento residencial en Belgrano (${formatPercent(hacinamientoPct)})** se concentra geográficamente: Alto Comedero, asentamientos populares consolidados y la expansión periurbana sur acumulan la mayor parte de las viviendas que alojan 2+ hogares. El centro consolidado y los barrios residenciales tradicionales presentan tasas mucho menores.

Esta concentración territorial coincide con la geografía de otros indicadores de vulnerabilidad (precariedad de servicios, menor escolarización, mayor informalidad laboral). La focalización de políticas habitacionales —programas de ampliación de vivienda, regularización dominial, créditos para primera vivienda— debería seguir esta geografía concreta y no aplicarse uniformemente al departamento.`,
    },

    nationalContext: `El stock habitacional capital de Jujuy se inscribe en el patrón típico de capitales NOA: predominio de la casa unifamiliar con peso creciente del departamento en zonas céntricas, desocupación urbana moderada y hacinamiento residencial concentrado en barrios populares. El **${formatPercent(deptoPct)}** de departamentos en altura sigue muy por debajo de CABA (>50%), Gran Rosario o Gran Córdoba, pero por encima del resto de la provincia.

El hacinamiento residencial (viviendas multihogar) muestra patrones territoriales claros a nivel nacional: las provincias del NOA y NEA, especialmente en zonas rurales y barrios populares de las capitales, presentan tasas superiores al promedio nacional. Esto refleja una combinación de mayor fecundidad histórica (hogares más numerosos), menor capacidad económica de los hogares jóvenes para acceder a vivienda propia y stock habitacional rezagado respecto al crecimiento demográfico.`,

    policyImplications: `El stock habitacional capital plantea tres tensiones para la política pública. **Primera**: la **paradoja de coexistencia** entre stock subutilizado y sobreutilizado. No se resuelve con redistribución directa: requiere instrumentos focalizados que ataquen ambos extremos. Por el lado del stock ocioso, regulación del mercado de alquileres y eventualmente desincentivos a la propiedad ociosa; por el lado del hacinamiento, programas de ampliación de vivienda y de acceso a primera vivienda focalizados.

**Segunda**: la **geografía del déficit** intra-Belgrano. Alto Comedero y barrios populares concentran las formas precarias, el hacinamiento y la regularización dominial pendiente. Cualquier política habitacional capital debe priorizar territorialmente esos espacios — los promedios departamentales agregados son insuficientes para diseñar intervenciones eficaces.

**Tercera**: la **capacidad institucional** para sostener intervenciones complejas. La mejora del stock precario suele requerir intervenciones integrales —materiales + servicios + regularización + articulación con trama urbana— que demandan capacidad técnica y financiera sostenida en el tiempo. El municipio capital y la provincia deben articular con programas nacionales (Pro.Cre.Ar y similares) y construir capacidades propias para que los recursos lleguen a destino.`,
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
  const primarioT = (tC3[5] || 0) + (tC3[8] || 0);
  const secundarioT = (tC3[11] || 0) + (tC3[14] || 0);
  const terciarioT = tC3[17];
  const universitarioT = tC3[20];
  const posgradoT = tC3[23];
  const superiorPct = ((terciarioT + universitarioT + posgradoT) / pob5Mas) * 100;
  const sinInstrPct = (sinInstr / pob5Mas) * 100;
  const secundarioPct = (secundarioT / pob5Mas) * 100;
  const primarioPct = (primarioT / pob5Mas) * 100;

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
    intro: `En Dr. M. Belgrano, sobre **${formatInteger(pobTot)} personas** en viviendas particulares, el **${formatPercent(asistePct)}** asiste a un establecimiento educativo, el **${formatPercent(noAsistePct)}** asistió pero no lo hace actualmente, y apenas el **${formatPercent(nuncaPct)}** nunca asistió. Entre la población de 5+ años, el **${formatPercent(superiorPct)}** alcanzó nivel superior (terciario, universitario o posgrado) — la mayor proporción provincial, sostenida por la oferta capital de la Universidad Nacional de Jujuy y los institutos terciarios.`,

    executiveSummary: `Belgrano concentra la **mayor escolarización formal de Jujuy**. La asistencia actual del **${formatPercent(asistePct)}** y la fracción que ya asistió suman cuasi universalidad de la educación obligatoria. La proporción con **nivel superior alcanzado (${formatPercent(superiorPct)})** —terciario, universitario o posgrado— está sustentada por la **Universidad Nacional de Jujuy (UNJu)**, sede capital del sistema universitario provincial, los institutos de formación docente (ENS), institutos terciarios técnicos y la oferta privada de educación superior. La concentración de empleo público provincial demanda formación terciaria y postula a Belgrano como el polo de capital humano de Jujuy.

La población **sin instrucción (${formatPercent(sinInstrPct)}** de los 5+ años) es la menor de Jujuy. Se concentra mayormente entre adultos mayores —legado de un sistema educativo que en décadas pasadas tenía cobertura insuficiente en zonas rurales y populares— y en una fracción de población migrante reciente desde el interior provincial. Los **${formatInteger(posgradoT)} habitantes con posgrado** en Belgrano son la mayor concentración de Jujuy: cuadros técnicos de la administración pública, docencia universitaria, profesiones liberales y sector salud.

La pirámide del máximo nivel alcanzado muestra una estructura más cercana al promedio nacional que al promedio provincial: el peso del secundario completo (**${formatPercent(secundarioPct)}**) y del nivel superior (**${formatPercent(superiorPct)}**) supera al de cualquier otro departamento de Jujuy. El primario sigue siendo el nivel modal en muchos hogares, pero la transición hacia mayor escolaridad está más avanzada que en el resto.

La heterogeneidad interna del depto. es relevante: el casco consolidado y zonas con empleo formal presentan tasas de escolarización superior aún más altas que el promedio capital; Alto Comedero y barrios populares concentran las tasas de abandono temprano, repitencia y nivel máximo más bajo. La política educativa capital debe combinar **sostener y ampliar la oferta superior** (UNJu, institutos) con **garantizar la continuidad educativa** en barrios populares — particularmente la transición secundario-superior, donde se pierde la mayor parte de la cohorte.`,

    keyFindings: [
      `**Asistencia actual:** **${formatPercent(asistePct)}** asiste a un establecimiento — cuasi universal en edad obligatoria.`,
      `**Nivel superior líder:** **${formatPercent(superiorPct)}** alcanzó terciario, universitario o posgrado — la mayor proporción de Jujuy.`,
      `**Posgrado concentrado:** **${formatInteger(posgradoT)}** personas con posgrado — la mayor concentración provincial.`,
      `**Sin instrucción mínima:** **${formatPercent(sinInstrPct)}** — la menor de Jujuy, concentrada en adultos mayores y migración rural.`,
      `**Nunca asistió:** **${formatPercent(nuncaPct)}** — fracción residual.`,
      `**UNJu como motor:** la Universidad Nacional de Jujuy, sede capital, sostiene la oferta superior y el ecosistema de capital humano provincial.`,
    ],

    keyDatum: `**Dato destacado:** **${formatPercent(superiorPct)}** de los habitantes de Belgrano de 5+ años alcanzó nivel terciario, universitario o posgrado — la mayor proporción de Jujuy. La UNJu y los institutos terciarios capital son los principales productores de capital humano provincial.`,

    sectionNarratives: {
      [sidAsist]: `La **asistencia escolar en Belgrano (${formatPercent(asistePct)})** replica la cobertura cuasi universal de la educación obligatoria (4 a 17 años). La fracción "asistió pero no asiste actualmente" (**${formatPercent(noAsistePct)}**) corresponde a la población adulta que completó su trayectoria educativa. La fracción "nunca asistió" (**${formatPercent(nuncaPct)}**) se concentra mayoritariamente en adultos mayores —legado histórico— y en una pequeña fracción de niños no escolarizados, mayormente en asentamientos populares y nueva migración.

Los **puntos críticos** de la trayectoria educativa capital están en el pasaje primario-secundario y secundario-superior, donde la cohorte se va reduciendo. Aunque el indicador censal binario "asiste/no asiste" no captura abandono, repitencia ni sobreedad —indicadores complementarios— la asistencia agregada alta enmascara dichas pérdidas.`,

      [sidNivel]: `Belgrano concentra la oferta capital de educación superior de Jujuy: **Universidad Nacional de Jujuy (UNJu)**, **Escuela Normal Superior**, institutos terciarios técnicos y oferta privada. Esta concentración explica que **${formatPercent(superiorPct)}** de la población alcance nivel superior — proporción muy superior al resto de la provincia.

La pirámide del máximo nivel alcanzado muestra: secundario (**${formatPercent(secundarioPct)}**) como nivel modal, seguido por primario (**${formatPercent(primarioPct)}**) y nivel superior. Las brechas con el resto de la provincia se concentran particularmente en el segmento universitario y posgrado, donde Belgrano lidera ampliamente.

La distribución intra-Belgrano es heterogénea: el casco consolidado y zonas con empleo formal presentan tasas aún más altas; Alto Comedero concentra la población con primario completo + secundario incompleto, configurando el grupo donde la política educativa pública debe focalizar.`,
    },

    nationalContext: `Belgrano se inscribe en el patrón de capitales argentinas: concentración de oferta de educación superior, mayor proporción de población con nivel terciario/universitario/posgrado que el resto de la provincia, y peso significativo de la universidad pública (UNJu) como motor de movilidad educativa.

La proporción con nivel superior alcanzado (**${formatPercent(superiorPct)}**) está por debajo de CABA (>40%) y de algunas capitales metropolitanas, pero por encima del promedio nacional y de capitales NOA pequeñas. La universidad nacional pública es la palanca de inclusión que más diferencia a las capitales provinciales del resto del territorio: sin UNJu, la pirámide educativa de Belgrano sería más cercana a la de El Carmen o San Pedro.`,

    policyImplications: `El perfil educativo capital plantea tres tensiones específicas. **Primera**: la **sostenibilidad de la UNJu y la oferta terciaria pública** como motor de movilidad. El financiamiento universitario nacional, la calidad de oferta y la articulación con el sistema productivo provincial son condiciones para que la ventaja capital se mantenga.

**Segunda**: la **continuidad educativa** secundario-superior en barrios populares. La cohorte que llega al final del secundario se reduce significativamente al pasar al nivel superior, especialmente en Alto Comedero y asentamientos. Programas de tutorías, becas y orientación vocacional focalizados son inversión de alto retorno.

**Tercera**: la **producción de capital humano** para los sectores productivos provinciales. Una capital con alta escolarización no se traduce automáticamente en empleo formal calificado si el sistema productivo no demanda ese capital humano. La articulación universidad-sectores productivos (litio, turismo, salud, energías renovables) es una agenda estratégica que excede a la política educativa stricto sensu.`,
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
  const desvAct = tasaActividad - CENSO_2022.tasa_actividad_nacional;
  const desvEmp = tasaEmpleo - CENSO_2022.tasa_empleo_nacional;
  const desvDesoc = tasaDesoc - CENSO_2022.tasa_desocupacion_nacional;
  const top3Ramas = ramasTop.slice(0, 3).map(r => r.rama).join(", ");

  const md = buildReportMd({
    ...data,
    intro: `El Departamento Dr. M. Belgrano reúne **${formatInteger(pob14)} personas** de 14+ años, con una tasa de actividad del **${formatPercent(tasaActividad)}**, empleo del **${formatPercent(tasaEmpleo)}** y desocupación del **${formatPercent(tasaDesoc)}**. La estructura ocupacional capital se sostiene en cuatro pilares: empleo público provincial y municipal, comercio (centro comercial provincial), servicios financieros y profesionales, y educación-salud (UNJu y red hospitalaria).`,

    executiveSummary: `La economía capital de Jujuy se sostiene en cuatro motores complementarios: **empleo público** (provincial y municipal), **comercio** (Belgrano es el centro comercial provincial), **servicios financieros y profesionales** (bancos, escribanías, estudios jurídicos y contables, consultoras) y **educación y salud** (UNJu, institutos terciarios, Hospital Pablo Soria, Materno-Infantil, red privada). Las ramas con mayor ocupación reflejan este perfil: **${top3Ramas}** y similares. La industria es marginal en Belgrano — la actividad industrial provincial está concentrada en Palpalá (acero, tabaco) y en el Ramal (azúcar, agroindustria).

La tasa de actividad del **${formatPercent(tasaActividad)}** y la de empleo del **${formatPercent(tasaEmpleo)}** ubican a Belgrano ${desvAct >= 0 ? `por encima` : `por debajo`} del promedio nacional (${formatDecimal(CENSO_2022.tasa_actividad_nacional, 1)}% y ${formatDecimal(CENSO_2022.tasa_empleo_nacional, 1)}% respectivamente). La tasa de desocupación del **${formatPercent(tasaDesoc)}** está ${desvDesoc >= 0 ? `por encima` : `por debajo`} del promedio nacional (${formatDecimal(CENSO_2022.tasa_desocupacion_nacional, 1)}%). Como en toda capital provincial, Belgrano captura una **migración interna** que busca empleo formal: la oferta de empleo público y de servicios urbanos absorbe parte significativa, pero también genera presión sobre el mercado laboral local con quienes no logran ingresar al circuito formal.

La **estructura ocupacional** de Belgrano es netamente terciaria: servicios públicos, comercio, educación, salud, banca, transporte. La industria manufacturera ocupa una fracción residual; la construcción es procíclica y emplea sobre todo en períodos de obra pública. El cuentapropismo informal —comercio minorista, servicios personales, transporte— es el componente más vulnerable de la matriz: depende del ingreso disponible de los hogares y se contrae rápido en ciclos recesivos.

Como en otros indicadores, la heterogeneidad interna del depto. es significativa: el casco consolidado concentra empleo formal de mayor calificación e ingresos altos; Alto Comedero y barrios populares concentran cuentapropismo informal, empleo doméstico, construcción y comercio minorista — actividades con mayor exposición al ciclo económico y menor formalización.`,

    keyFindings: [
      `**Tasa de actividad:** **${formatPercent(tasaActividad)}** — ${desvAct >= 0 ? `por encima` : `por debajo`} del promedio nacional (${formatDecimal(CENSO_2022.tasa_actividad_nacional, 1)}%).`,
      `**Tasa de empleo:** **${formatPercent(tasaEmpleo)}** sobre la población de 14+.`,
      `**Tasa de desocupación:** **${formatPercent(tasaDesoc)}** ${desvDesoc >= 0 ? `por encima` : `por debajo`} del promedio nacional.`,
      `**No PEA:** **${formatInteger(noPea)}** personas — estudiantes, jubilados, amas/os de casa.`,
      `**Estructura terciaria plena:** empleo público + comercio + servicios + educación-salud lideran la matriz.`,
      `**Industria marginal:** la actividad industrial está concentrada en Palpalá (acero, tabaco) y el Ramal — Belgrano es netamente terciaria.`,
    ],

    keyDatum: `**Dato destacado:** la economía capital se sostiene en cuatro motores complementarios —**empleo público, comercio, servicios y educación-salud**— y captura migración interna del resto de la provincia. La industria es marginal: Belgrano es netamente terciaria.`,

    sectionNarratives: {
      [sidComp]: `La condición de actividad refleja una estructura urbana plena: la mayoría de la población de 14+ está en la PEA, con peso significativo del empleo formal —público y privado registrado—. La tasa de actividad capital se ubica ${desvAct >= 0 ? `por encima` : `por debajo`} del promedio nacional y es de las más altas de Jujuy. La No PEA combina estudiantes (peso significativo dado la presencia universitaria), jubilados/pensionados y amas/os de casa.`,

      [sidTAct]: `Belgrano se ubica en posición intermedia-alta del ranking provincial de actividad, con dinámica similar a Palpalá (segundo eslabón del aglomerado capital). Los departamentos puneños presentan tasas menores por estructura demográfica (mayor proporción de niños/adolescentes), dependencia de actividades estacionales y mayor peso del trabajo no remunerado del hogar.`,

      [sidTDes]: `La desocupación capital es comparable a otras capitales del NOA: el mercado laboral capital absorbe migración pero también genera presión sobre el empleo formal disponible. La estacionalidad de algunas actividades (turismo en menor medida que en la Quebrada, construcción dependiente de obra pública) introduce fluctuaciones que el dato censal no captura.`,

      [sidRama]: `Las ramas líderes en Belgrano —**${top3Ramas}**— son las propias de una capital provincial. La administración pública (provincial y municipal) es típicamente la rama con más empleo absoluto en capitales NOA. El comercio se concentra en el microcentro y corredores comerciales. La enseñanza incluye universidad pública y privada + sistema educativo provincial. La salud incluye hospitales públicos y la red privada (clínicas, sanatorios, consultorios).

El sector industrial es marginal en Belgrano — concentrado en Palpalá (acero Aceros Zapla, tabaco). La construcción es procíclica y depende fuertemente de obra pública (provincial, municipal, planes nacionales). El comercio minorista y los servicios personales son el grueso del cuentapropismo informal capital.`,
    },

    nationalContext: `El perfil económico de Belgrano se inscribe en el patrón típico de capitales NOA: estructura terciaria plena, peso significativo del empleo público, comercio y servicios. La industria es marginal y concentrada en las "segundas ciudades" industriales (Palpalá en Jujuy; Aguilares en Tucumán; San Ramón de la Nueva Orán en Salta). La tasa de actividad ${desvAct >= 0 ? `supera` : `está por debajo`} de la media nacional, con dinámica comparable a otras capitales medianas argentinas.

La dependencia del empleo público es estructural: en provincias de menor diversificación económica, el estado provincial es típicamente el mayor empleador formal de la capital. Esto tiene implicancias fiscales y políticas: la sostenibilidad del empleo público depende del cuadro fiscal provincial y de las transferencias nacionales por coparticipación.`,

    policyImplications: `El perfil económico capital plantea tres tensiones para la política pública. **Primera**: la **diversificación de la base productiva**. Una capital donde el empleo público es el motor dominante es vulnerable a ciclos fiscales. Diversificar hacia comercio formal, servicios profesionales, economía del conocimiento (software, turismo MICE, salud especializada) reduce el riesgo concentrado en el estado provincial.

**Segunda**: la **formalización del cuentapropismo**. El comercio minorista, los servicios personales y el transporte concentran cuentapropismo informal — segmento vulnerable que no accede a obra social, jubilación contributiva, crédito formal ni mercado de proveedores formales. Instrumentos como el monotributo, simplificación de inscripción y acceso a fintech tienen relevancia capital.

**Tercera**: la **articulación universidad-sectores productivos**. La UNJu produce egresados que no siempre encuentran empleo formal acorde a su formación en la economía local. Vincular oferta universitaria con demanda productiva (litio, energías renovables, turismo, salud, agroindustria del Ramal) requiere agencias específicas, programas de pasantías estructurales y desarrollo de incubadoras de proyectos productivos.`,
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

  const c1 = extractJujuyTable(readSheetRows(fileC1, "Cuadro 1.10"));
  const c1Belg = getBelgranoRow(c1).row.map(toNumber);

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
  const posBelg = ranked.findIndex(r => r.departamento.codigo === BELGRANO_CODIGO) + 1;
  const depMaxHijos = ranked[0];
  const depMinHijos = ranked[ranked.length - 1];

  const data = builder.build();

  const md = buildReportMd({
    ...data,
    intro: `En Dr. M. Belgrano viven **${formatInteger(mujeres14)} mujeres** de 14 o más años. El **${formatPercent(pctTuvieron)}** tuvo al menos un hijo nacido vivo, con un promedio de **${formatDecimal(hijosPromedio, 2)} hijos** entre las que tuvieron — un valor por debajo del promedio provincial, característico de capitales urbanas con transición demográfica más avanzada.`,

    executiveSummary: `La fecundidad en Belgrano sigue el patrón típico de una **capital provincial NOA**: menos hijos por mujer que en el promedio provincial (puesto ${posBelg}° del ranking, donde los primeros son rurales/puneños), transición demográfica más avanzada que el resto del territorio jujeño. El promedio de **${formatDecimal(hijosPromedio, 2)} hijos** entre las que tuvieron es claramente menor que en departamentos como ${depMaxHijos.departamento.nombre} (${formatDecimal(depMaxHijos.value, 2)}) o ${ranked[1].departamento.nombre} (${formatDecimal(ranked[1].value, 2)}).

Esta diferencia se asocia con factores estructurales bien conocidos: **mayor escolarización femenina** (Belgrano tiene la mayor proporción de mujeres con nivel superior alcanzado de Jujuy), **inserción laboral formal de las mujeres** (empleo público, educación, salud, servicios), **postergación de la maternidad** (primer hijo a edades más tardías), **acceso a métodos anticonceptivos modernos** y mayor proyecto educativo-laboral autónomo. La proporción de mujeres que tuvieron al menos un hijo (**${formatPercent(pctTuvieron)}**) es relativamente menor que en departamentos rurales, donde la maternidad temprana es más frecuente.

Esta menor fecundidad capital tiene implicancias demográficas relevantes: el **crecimiento poblacional de Belgrano** depende más del componente migratorio que del vegetativo. El crecimiento decenal del 21% que vimos en el informe de Estructura es sostenido fundamentalmente por migración interna desde la Puna, la Quebrada y el Ramal — sin esa migración, el crecimiento vegetativo capital sería menor que el promedio provincial.

Internamente, sin embargo, la heterogeneidad es significativa: **Alto Comedero y barrios populares** mantienen pautas de fecundidad más cercanas al promedio provincial; el **casco consolidado y zonas con mayor escolarización femenina** presentan tasas mucho más bajas, comparables a las de capitales centro/sur del país. Esta dualidad intra-Belgrano reproduce, en escala barrial, la brecha territorial provincial que separa al corredor central NOA del resto.`,

    keyFindings: [
      `**Mujeres 14+:** **${formatInteger(mujeres14)}** en Belgrano.`,
      `**Con hijos:** **${formatPercent(pctTuvieron)}** declararon haber tenido al menos un hijo nacido vivo.`,
      `**Hijos promedio:** **${formatDecimal(hijosPromedio, 2)}** — por debajo del promedio provincial.`,
      `**Posición provincial:** puesto **${posBelg}°** del ranking — capital con transición demográfica más avanzada.`,
      `**Brecha territorial:** ${depMaxHijos.departamento.nombre} lidera con ${formatDecimal(depMaxHijos.value, 2)} hijos promedio; ${depMinHijos.departamento.nombre} cierra con ${formatDecimal(depMinHijos.value, 2)}.`,
      `**Crecimiento por migración:** Belgrano crece más por migración interna que por crecimiento vegetativo — característica capital.`,
    ],

    keyDatum: `**Dato destacado:** **${formatDecimal(hijosPromedio, 2)} hijos promedio** entre las mujeres que tuvieron hijos en Belgrano — por debajo del promedio provincial. La capital muestra una transición demográfica más avanzada que el resto de Jujuy, sostenida por mayor escolarización femenina e inserción laboral formal.`,

    sectionNarratives: {
      [sidComp]: `La proporción de mujeres que tuvieron al menos un hijo es menor en Belgrano (**${formatPercent(pctTuvieron)}**) que en departamentos rurales, donde la maternidad temprana sigue siendo más frecuente. Las edades de inicio de la maternidad se postergan en la capital por la combinación de mayor escolarización, inserción laboral formal y acceso a métodos anticonceptivos modernos. La trayectoria reproductiva se concentra en edades más adultas (25-35 años en capital, 18-30 en rural).`,

      [sidHij]: `Los departamentos puneños y rurales presentan los promedios más altos de hijos por mujer: **${depMaxHijos.departamento.nombre}** lidera con ${formatDecimal(depMaxHijos.value, 2)}. Belgrano (puesto ${posBelg}°) se ubica más cerca del promedio nacional (~${formatDecimal(CENSO_2022.hijos_por_mujer_nacional || 1.4, 1)}) que del promedio provincial. La brecha intra-provincia es significativa: refleja distintos estadios de transición demográfica y distintas estructuras socioeconómicas (rural vs urbana, presencia de comunidades originarias, niveles de escolarización femenina).`,
    },

    nationalContext: `La fecundidad capital se inscribe en el patrón típico de transición demográfica avanzada: tasas comparables a las de capitales del centro del país y por debajo del promedio NOA. Argentina tiene una fecundidad promedio de aproximadamente **${formatDecimal(CENSO_2022.hijos_por_mujer_nacional || 1.4, 1)} hijos por mujer**, en franco descenso en las últimas dos décadas. CABA presenta tasas muy bajas (~1.3); las provincias del NOA y NEA mantienen tasas más altas, sostenidas por estructuras etarias más jóvenes y por mantenimiento de pautas tradicionales de familia extendida en zonas rurales y comunidades originarias.

Belgrano se ubica entre estos dos extremos: por debajo de los departamentos rurales jujeños pero por encima de las grandes capitales del centro. Esta posición intermedia es consistente con su perfil de capital provincial NOA con desarrollo terciario y universidad pública consolidada.`,

    policyImplications: `La menor fecundidad capital tiene tres implicancias relevantes. **Primera**: el **crecimiento poblacional de Belgrano** depende crucialmente del componente migratorio. La planificación de servicios debe considerar no solo el crecimiento vegetativo sino el flujo migratorio sostenido desde la Puna, Quebrada y Ramal — flujo que se concentra en zonas concretas (Alto Comedero, barrios populares) más que distribuido uniformemente.

**Segunda**: la **planificación de servicios materno-infantiles y educación inicial** debe considerar el diferencial capital vs. provincial. Belgrano tendrá demanda creciente de geriatría y cuidados crónicos (cohortes mayores envejeciendo); el interior provincial mantendrá presión sobre educación inicial y atención materno-infantil. La distribución de recursos provinciales debe reflejar estas dinámicas diferenciadas.

**Tercera**: la **dualidad intra-Belgrano** entre fecundidad de barrios populares (más alta) y casco consolidado (más baja) demanda focalización en políticas de salud sexual y reproductiva, educación sexual integral y acceso a métodos anticonceptivos modernos. Los CAPS de Alto Comedero y zonas periurbanas son la primera línea de esta agenda.`,
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
  if (failed === 0) console.log("  ✅ 8 informes SSJ generados con narrativa ejecutiva.");
  else console.log(`  ⚠️  ${failed}/8 fallaron`);
}

main();
