/**
 * contexto-nacional.cjs
 *
 * Constantes nacionales para interpolar en narrativas comparativas
 * (sección "Contexto Nacional y Tendencias" de cada informe ejecutivo).
 *
 * Fuentes:
 *  - Censo 2022: resultados definitivos INDEC
 *  - SNIC: panel provincial Min. Seguridad de la Nación
 *  - SSPM: Subsecretaría de Planificación y Modernización
 *  - DEIS: Dirección de Estadísticas e Información de Salud
 *  - Sec. Educación de la Nación · DiNIECE
 *  - SIACAM: Secretaría de Minería
 *
 * Última actualización: 2026-05
 */

// ─── CENSO 2022 (resultados definitivos INDEC) ───
const CENSO_2022 = {
  poblacionArgentina: 46_044_703,
  superficieArgentina: 2_780_400,            // km² continental + islas
  densidadNacional: 16.6,                    // hab/km²
  hogaresArgentina: 15_178_369,
  viviendasArgentina: 17_796_697,
  tamanoHogarPromedioNacional: 3.0,          // personas por hogar
  edadMedianaNacional: 32,
  edadMedianaMujeresNacional: 33,
  edadMedianaVaronesNacional: 30,
  // Habitacional
  pct_agua_red_nacional: 88.2,               // % población en viviendas con conexión de agua de red
  pct_cloaca_nacional: 64.4,                 // % con desagüe cloacal a red pública
  pct_gas_red_nacional: 56.3,                // % con gas de red
  // Salud (cobertura — autodeclarada)
  pct_obra_social_nacional: 71.5,            // % con obra social, prepaga o plan estatal
  pct_solo_publica_nacional: 28.5,           // % sin obra social/prepaga (depende solo del sistema público)
  // Educación censal
  pct_asistencia_primaria_nacional: 99.0,    // % asistencia en edad teórica primaria
  pct_asistencia_secundaria_nacional: 91.0,  // % asistencia en edad teórica secundaria
  pct_secundario_completo_25mas_nacional: 51.5,
  pct_universitario_completo_25mas_nacional: 14.2,
  // Actividad económica
  tasa_actividad_nacional: 47.6,             // % PEA / población total
  tasa_empleo_nacional: 44.5,
  tasa_desocupacion_nacional: 6.5,
  // Fecundidad
  hijos_por_mujer_nacional: 1.4,             // tasa global de fecundidad censal (acumulada 14-49)
};

// ─── SNIC último año disponible (2024, oficial) ───
const SNIC_2024 = {
  anio: 2024,
  tasa_homicidios_nacional: 4.5,             // cada 100.000 hab.
  tasa_robos_nacional: 1100,                 // aprox /100K (orden de magnitud)
  tasa_hurtos_nacional: 1700,                // aprox /100K
  total_jurisdicciones: 24,                  // 23 provincias + CABA
  // Provincias con tasas más bajas suelen ser Santiago del Estero, Catamarca, La Pampa, Jujuy, La Rioja
};

// ─── SSPM (empleo registrado privado nacional — calculado en runtime sumando provincias) ───
const SSPM_REFERENCIA = {
  // Sumatoria nacional referencial al 2025-11 (~6,5M asalariados privados)
  // El valor real se calcula sumando todas las columnas provinciales en process-empleo.cjs
  asalariados_priv_nacional_aprox: 6_400_000,
  fecha_referencia: "2025-11",
};

// ─── Educación (Sec. Educación · DiNIECE — promedios nacionales) ───
const EDUCACION = {
  abandono_primaria_nacional_2022_2023: 0.4,    // %
  abandono_secundaria_nacional_2022_2023: 8.2,
  repitencia_primaria_nacional_2022: 1.0,
  repitencia_secundaria_nacional_2022: 9.6,
  // contexto adicional
  pct_inversion_educativa_pib: 5.6,
  cant_establecimientos_nacional_aprox: 64_000,
};

// ─── Minería (SIACAM) ───
const MINERIA = {
  proyectos_metaliferos_litio_nacional: 1000,    // total cartera (todos los estados)
  proyectos_litio_nacional_aprox: 38,            // proyectos específicos de litio activos
  expo_litio_nacional_2023_FOB_USD_M: 730,       // millones US$ FOB
  participacion_litio_expo_totales_2023_pct: 0.86,
  share_provincias_litio: {
    Jujuy: 30,           // aprox % de cartera nacional
    Salta: 35,
    Catamarca: 35,
  },
};

// ─── Salud (DEIS — tasas nacionales) ───
const SALUD = {
  tasa_natalidad_nacional_2023: 11.0,            // por 1000 hab
  tasa_mortalidad_general_nacional_2023: 8.6,    // por 1000 hab
  tasa_mortalidad_infantil_nacional_2022: 8.5,   // por 1000 nacidos vivos
  defunciones_nacionales_2023: 353_428,          // total país (del propio CSV)
  defunciones_nacionales_2020: 376_215,          // pico pandemia
  esperanza_vida_nacional_h: 73.2,
  esperanza_vida_nacional_m: 79.7,
};

// ─── NOA: contexto regional para comparativas no-numéricas ───
const NOA_INFO = {
  provincias: ["Jujuy", "Salta", "Tucumán", "Catamarca", "La Rioja", "Santiago del Estero"],
  rasgos_estructurales: [
    "alta concentración urbana en capitales provinciales",
    "mercado laboral con peso significativo del empleo público",
    "indicadores de pobreza por encima del promedio nacional",
    "transición demográfica más tardía que el centro del país",
    "presencia indígena y rural significativa",
  ],
};

module.exports = {
  CENSO_2022,
  SNIC_2024,
  SSPM_REFERENCIA,
  EDUCACION,
  MINERIA,
  SALUD,
  NOA_INFO,
};
