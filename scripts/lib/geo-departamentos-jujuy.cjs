/**
 * geo-departamentos-jujuy.cjs
 *
 * Catálogo de los 16 departamentos de la Provincia de Jujuy
 * con sus códigos INDEC (provincia 38).
 *
 * Total provincial INDEC: código "38"
 * Censo 2022: 811.611 habitantes
 */

const DEPARTAMENTOS_JUJUY = [
  { codigo: "38007", nombre: "Cochinoca" },
  { codigo: "38014", nombre: "El Carmen" },
  { codigo: "38021", nombre: "Dr. Manuel Belgrano" },
  { codigo: "38028", nombre: "Humahuaca" },
  { codigo: "38035", nombre: "Ledesma" },
  { codigo: "38042", nombre: "Palpalá" },
  { codigo: "38049", nombre: "Rinconada" },
  { codigo: "38056", nombre: "San Antonio" },
  { codigo: "38063", nombre: "San Pedro" },
  { codigo: "38070", nombre: "Santa Bárbara" },
  { codigo: "38077", nombre: "Santa Catalina" },
  { codigo: "38084", nombre: "Susques" },
  { codigo: "38094", nombre: "Tilcara" },
  { codigo: "38098", nombre: "Tumbaya" },
  { codigo: "38105", nombre: "Valle Grande" },
  { codigo: "38112", nombre: "Yavi" },
];

const PROVINCIA_ID = "38";
const PROVINCIA_NOMBRE = "Jujuy";
const XLSX_SUFFIX = "10"; // los XLSX del INDEC para Jujuy usan suffix _10

function normalizeCode(c) {
  if (c == null) return "";
  let s = String(c).trim();
  // Strip trailing ".0" si Excel devolvió números
  if (/^\d+\.0+$/.test(s)) s = s.replace(/\.0+$/, "");
  // Pad con leading zero si es necesario
  if (/^\d{4}$/.test(s)) s = "0" + s;
  return s;
}

function isTotalJujuy(c) {
  if (c == null) return false;
  const s = normalizeCode(c);
  return s === "38" || s === "038";
}

function getDepartamentoByCodigo(c) {
  const s = normalizeCode(c);
  return DEPARTAMENTOS_JUJUY.find(d => d.codigo === s);
}

module.exports = {
  DEPARTAMENTOS_JUJUY,
  PROVINCIA_ID,
  PROVINCIA_NOMBRE,
  XLSX_SUFFIX,
  isTotalJujuy,
  getDepartamentoByCodigo,
  normalizeCode,
};
