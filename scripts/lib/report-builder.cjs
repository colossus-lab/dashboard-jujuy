/**
 * report-builder.cjs — Construye un objeto ReportData válido (matchea src/types/report.ts).
 *
 * Validación liviana sin zod (zod es ESM-only en v4 y este script es CommonJS).
 * Si build() detecta un campo faltante o malformado, arroja con mensaje claro.
 */

const VALID_CHART_TYPES = new Set([
  "bar", "line", "pie", "pyramid", "scatter", "radar", "treemap", "heatmap", "map",
]);

class ReportBuilder {
  constructor(id) {
    if (!id) throw new Error("ReportBuilder: id is required");
    this._id = id;
    this._meta = null;
    this._kpis = [];
    this._charts = [];
    this._rankings = [];
    this._mapData = [];
  }

  setMeta({ title, category = "Población", subcategory, source, date }) {
    if (!title || !source || !date) {
      throw new Error(`[${this._id}] meta requires title, source, date`);
    }
    this._meta = {
      id: this._id,
      title,
      category,
      ...(subcategory ? { subcategory } : {}),
      source,
      date,
    };
    return this;
  }

  addKPI(kpi) {
    if (!kpi.id || !kpi.label || kpi.value == null || kpi.formatted == null) {
      throw new Error(`[${this._id}] KPI requires id/label/value/formatted: ${JSON.stringify(kpi)}`);
    }
    this._kpis.push(kpi);
    return this;
  }

  addChart(chart) {
    if (!chart.id || !chart.type || !chart.title || !Array.isArray(chart.data)) {
      throw new Error(`[${this._id}] Chart requires id/type/title/data: ${JSON.stringify(chart).slice(0, 200)}`);
    }
    if (!VALID_CHART_TYPES.has(chart.type)) {
      throw new Error(`[${this._id}] Invalid chart type "${chart.type}" for ${chart.id}`);
    }
    this._charts.push({ sectionId: "", config: {}, ...chart });
    return this;
  }

  addRanking(ranking) {
    if (!ranking.id || !ranking.title || !Array.isArray(ranking.items) || !ranking.order) {
      throw new Error(`[${this._id}] Ranking requires id/title/items/order: ${ranking.id}`);
    }
    this._rankings.push({ sectionId: "", ...ranking });
    return this;
  }

  addMapItem(item) {
    if (!item.municipioId || !item.municipioNombre || item.value == null || !item.label) {
      throw new Error(`[${this._id}] MapDataItem requires municipioId/municipioNombre/value/label`);
    }
    this._mapData.push(item);
    return this;
  }

  build() {
    if (!this._meta) throw new Error(`[${this._id}] meta is required`);
    if (this._kpis.length === 0) {
      console.warn(`  ⚠️  [${this._id}] no KPIs registered`);
    }
    return {
      meta: this._meta,
      kpis: this._kpis,
      charts: this._charts,
      rankings: this._rankings,
      mapData: this._mapData,
    };
  }
}

function slugify(s) {
  return String(s)
    .toLowerCase()
    .normalize("NFD").replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

module.exports = { ReportBuilder, slugify };
