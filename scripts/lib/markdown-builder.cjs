/**
 * markdown-builder.cjs — Genera Markdown plantilla a partir del ReportData.
 *
 * Estructura ejecutiva v2:
 *   1. intro corto (sin H1: el título lo pinta el hero del ReportView)
 *   2. Bloque KPI bullets
 *   3. ## Resumen Ejecutivo            (opcional, sin chart asignado)
 *   4. ## Hallazgos Clave + bullets    (opcional, sin chart)
 *   5. > blockquote dato destacado     (opcional)
 *   6. ## <Dimensión N> por chart      (una por chart.sectionId, con sectionNarratives)
 *   7. ## Contexto Nacional y Tendencias  (opcional, sin chart)
 *   8. ## Implicancias para la Política Pública (opcional, sin chart)
 *   9. footer con fuente
 *
 * Todos los campos nuevos (executiveSummary, keyFindings, keyDatum,
 * nationalContext, policyImplications) son OPCIONALES — si no se pasan,
 * la sección correspondiente no se emite. Backward compatible con v1.
 */

const { slugify } = require("./report-builder.cjs");

function formatNumber(n) {
  if (n == null || !Number.isFinite(n)) return "—";
  return new Intl.NumberFormat("es-AR", { maximumFractionDigits: 1 }).format(n);
}

function buildReportMd({
  meta,
  kpis,
  charts,
  rankings,
  intro,
  sectionNarratives = {},
  // ─── Nuevos campos ejecutivos (v2) ───
  executiveSummary,
  keyFindings = [],
  keyDatum,
  nationalContext,
  policyImplications,
}) {
  const lines = [];

  // 1. Intro paragraph (no H1 — hero handles title)
  lines.push(intro || `Análisis de **${meta.title}** sobre la base del **${meta.source}**.`);
  lines.push("");

  // 2. KPI summary block (markdown bullets) — appears above the first section
  if (kpis && kpis.length > 0) {
    lines.push("**Indicadores destacados:**");
    lines.push("");
    for (const k of kpis.slice(0, 6)) {
      lines.push(`- **${k.label}:** ${k.formatted}${k.unit ? ` ${k.unit}` : ""}${k.comparison ? ` — _${k.comparison}_` : ""}`);
    }
    lines.push("");
  }

  // 3. Resumen Ejecutivo (opcional)
  if (executiveSummary && String(executiveSummary).trim().length > 0) {
    lines.push("## Resumen Ejecutivo");
    lines.push("");
    lines.push(String(executiveSummary).trim());
    lines.push("");
  }

  // 4. Hallazgos Clave (opcional, con bullets)
  if (Array.isArray(keyFindings) && keyFindings.length > 0) {
    lines.push("## Hallazgos Clave");
    lines.push("");
    for (const h of keyFindings) {
      if (h && String(h).trim().length > 0) {
        lines.push(`- ${String(h).trim()}`);
      }
    }
    lines.push("");
  }

  // 5. Blockquote con dato destacado (opcional)
  if (keyDatum && String(keyDatum).trim().length > 0) {
    lines.push(`> ${String(keyDatum).trim()}`);
    lines.push("");
  }

  // 6. Una sección (## heading) por chart con sectionId único
  //    El sectionNarratives[chart.sectionId] se expande en el contenido.
  const seenSections = new Set();
  for (const chart of charts) {
    if (!chart.sectionId || seenSections.has(chart.sectionId)) continue;
    seenSections.add(chart.sectionId);

    const heading = chart.sectionTitle || titleFromSlug(chart.sectionId);
    lines.push(`## ${heading}`);
    lines.push("");

    const narrative = sectionNarratives[chart.sectionId];
    if (narrative && String(narrative).trim().length > 0) {
      lines.push(String(narrative).trim());
      lines.push("");
    } else {
      lines.push(`Distribución y comparación según ${heading.toLowerCase()}. Los gráficos a continuación detallan los valores observados.`);
      lines.push("");
    }

    // Append matching ranking, if present
    const matching = (rankings || []).filter(r => r.sectionId === chart.sectionId);
    for (const r of matching) {
      const top = (r.items || []).slice(0, 5);
      if (top.length === 0) continue;
      lines.push(`**${r.title}** (top ${top.length}):`);
      lines.push("");
      lines.push("| # | Departamento | Valor |");
      lines.push("|---|---|---:|");
      top.forEach((item, i) => {
        lines.push(`| ${i + 1} | ${item.name} | ${formatNumber(item.value)} |`);
      });
      lines.push("");
    }
  }

  // 7. Contexto Nacional y Tendencias (opcional)
  if (nationalContext && String(nationalContext).trim().length > 0) {
    lines.push("## Contexto Nacional y Tendencias");
    lines.push("");
    lines.push(String(nationalContext).trim());
    lines.push("");
  }

  // 8. Implicancias para la Política Pública (opcional)
  if (policyImplications && String(policyImplications).trim().length > 0) {
    lines.push("## Implicancias para la Política Pública");
    lines.push("");
    lines.push(String(policyImplications).trim());
    lines.push("");
  }

  // 9. Footer
  lines.push("---");
  lines.push("");
  lines.push(`> **Fuente:** ${meta.source} · **Período:** ${meta.date}`);
  lines.push("");

  return lines.join("\n");
}

function titleFromSlug(slug) {
  return String(slug)
    .split("-")
    .map(w => w.length > 0 ? w[0].toUpperCase() + w.slice(1) : w)
    .join(" ");
}

module.exports = { buildReportMd, slugify };
