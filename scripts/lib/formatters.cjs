/**
 * formatters.cjs — Formato AR (separador miles ".", decimal ",")
 */

function toNumber(v) {
  if (v == null || v === "" || v === "///") return null;
  if (typeof v === "number") return v;
  const s = String(v).trim().replace(/\./g, "").replace(",", ".");
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

function formatInteger(n) {
  if (n == null || !Number.isFinite(n)) return "—";
  return new Intl.NumberFormat("es-AR", { maximumFractionDigits: 0 }).format(n);
}

function formatDecimal(n, digits = 1) {
  if (n == null || !Number.isFinite(n)) return "—";
  return new Intl.NumberFormat("es-AR", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(n);
}

function formatPercent(n, digits = 1) {
  // n is a fraction (0.245) → "24,5%"  OR  n is already a percent (24.5) — pass divide=false
  if (n == null || !Number.isFinite(n)) return "—";
  return formatDecimal(n, digits) + "%";
}

function formatCompact(n) {
  if (n == null || !Number.isFinite(n)) return "—";
  const abs = Math.abs(n);
  if (abs >= 1_000_000) return formatDecimal(n / 1_000_000, 1) + "M";
  if (abs >= 1_000) return formatDecimal(n / 1_000, 1) + "K";
  return formatInteger(n);
}

module.exports = {
  toNumber,
  formatInteger,
  formatDecimal,
  formatPercent,
  formatCompact,
};
