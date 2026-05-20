/**
 * tendencias.cjs
 *
 * Helpers para interpretar series temporales en las narrativas:
 *  - Detección de quiebres (variaciones interanuales > umbral)
 *  - Asociación con eventos históricos conocidos
 *  - Cálculo de promedios decenales y tendencia general
 */

const EVENTOS_HISTORICOS = {
  2001: "la crisis económica y social de 2001-2002",
  2002: "el período inmediato post-default",
  2008: "el shock de la crisis financiera internacional",
  2009: "la recesión global posterior a la crisis 2008",
  2014: "la primera devaluación del ciclo 2014-2015",
  2018: "el inicio de la recesión y crisis cambiaria",
  2019: "la profundización del ciclo recesivo",
  2020: "el shock por la pandemia de COVID-19",
  2021: "la recuperación parcial post-pandemia",
  2023: "el ciclo de aceleración inflacionaria",
  2024: "el período de ajuste macroeconómico iniciado en diciembre de 2023",
};

/**
 * Detecta quiebres en una serie temporal y devuelve un texto interpretativo.
 *
 * @param {Array<{anio:number, valor:number}>} serie ordenada por año
 * @param {Object} opts
 * @param {number} [opts.umbralVariacion=20] - % mínimo de variación interanual para considerar quiebre
 * @param {string} [opts.magnitudLabel='casos'] - palabra para el sustantivo (ej. "homicidios", "asalariados")
 * @param {string} [opts.tendenciaLabel] - opcional, descripción cualitativa adicional
 * @returns {string} texto en prosa
 */
function interpretarSerie(serie, opts = {}) {
  const { umbralVariacion = 20, magnitudLabel = "casos" } = opts;

  if (!Array.isArray(serie) || serie.length < 3) {
    return `La serie disponible es demasiado corta para identificar tendencias robustas.`;
  }

  const sorted = [...serie].sort((a, b) => a.anio - b.anio);
  const quiebres = [];

  for (let i = 1; i < sorted.length; i++) {
    const prev = sorted[i - 1];
    const curr = sorted[i];
    if (!prev.valor || prev.valor === 0) continue;
    const variacion = ((curr.valor - prev.valor) / prev.valor) * 100;
    if (Math.abs(variacion) >= umbralVariacion) {
      quiebres.push({
        anio: curr.anio,
        anio_prev: prev.anio,
        variacion_pct: variacion,
        valor: curr.valor,
        valor_prev: prev.valor,
        direccion: variacion > 0 ? "incremento" : "descenso",
        evento: EVENTOS_HISTORICOS[curr.anio] || EVENTOS_HISTORICOS[prev.anio] || null,
      });
    }
  }

  if (quiebres.length === 0) {
    const first = sorted[0];
    const last = sorted[sorted.length - 1];
    const totalVar = first.valor ? ((last.valor - first.valor) / first.valor) * 100 : 0;
    const sentido = totalVar > 0 ? "crecimiento sostenido" : totalVar < 0 ? "descenso sostenido" : "estabilidad";
    return `La serie ${first.anio}-${last.anio} muestra ${sentido} sin quiebres interanuales significativos por encima del ${umbralVariacion}%. La variación acumulada en el período alcanza ${totalVar >= 0 ? "+" : ""}${totalVar.toFixed(1)}% en términos absolutos.`;
  }

  // Componer texto con los quiebres más relevantes (hasta 3)
  const principales = quiebres
    .slice()
    .sort((a, b) => Math.abs(b.variacion_pct) - Math.abs(a.variacion_pct))
    .slice(0, 3)
    .sort((a, b) => a.anio - b.anio);

  const frases = principales.map(q => {
    const sign = q.variacion_pct >= 0 ? "+" : "";
    const eventoTxt = q.evento ? `, asociado a ${q.evento}` : "";
    return `${q.anio} (${sign}${q.variacion_pct.toFixed(1)}% en ${magnitudLabel}${eventoTxt})`;
  });

  const cuantos = principales.length === 1 ? "un quiebre significativo" : `${principales.length} quiebres significativos`;
  return `La serie ${sorted[0].anio}-${sorted[sorted.length - 1].anio} presenta ${cuantos}: ${frases.join("; ")}. Estos puntos de inflexión permiten leer la evolución de ${magnitudLabel} en clave de ciclo macroeconómico antes que de tendencia lineal.`;
}

/**
 * Calcula promedio simple de los últimos N años.
 */
function promedioReciente(serie, n = 5) {
  if (!Array.isArray(serie) || serie.length === 0) return null;
  const sorted = [...serie].sort((a, b) => a.anio - b.anio);
  const tail = sorted.slice(-n);
  const suma = tail.reduce((s, x) => s + (x.valor || 0), 0);
  return tail.length ? suma / tail.length : null;
}

/**
 * Resumen cualitativo de la tendencia comparando el promedio de los primeros vs los últimos N años.
 */
function resumenTendencia(serie, n = 5) {
  const sorted = [...serie].sort((a, b) => a.anio - b.anio);
  if (sorted.length < n * 2) return "tendencia indeterminada por longitud insuficiente";
  const primeros = sorted.slice(0, n);
  const ultimos = sorted.slice(-n);
  const promPrim = primeros.reduce((s, x) => s + (x.valor || 0), 0) / n;
  const promUlt = ultimos.reduce((s, x) => s + (x.valor || 0), 0) / n;
  if (promPrim === 0) return "tendencia indeterminada";
  const var_pct = ((promUlt - promPrim) / promPrim) * 100;
  if (Math.abs(var_pct) < 10) return `estabilidad relativa (variación acumulada ${var_pct >= 0 ? "+" : ""}${var_pct.toFixed(1)}% entre el promedio inicial y el final)`;
  if (var_pct > 0) return `tendencia creciente (${var_pct.toFixed(1)}% entre el promedio inicial y el final)`;
  return `tendencia decreciente (${var_pct.toFixed(1)}% entre el promedio inicial y el final)`;
}

module.exports = {
  EVENTOS_HISTORICOS,
  interpretarSerie,
  promedioReciente,
  resumenTendencia,
};
