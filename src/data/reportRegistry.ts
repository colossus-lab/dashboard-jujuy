import type { ReportEntry } from '../types/report';

// ═══════════════════════════════════════════════════════════════
// Report Registry — 13 informes del Dashboard Jujuy
//   · 8 informes censales (Censo 2022 INDEC)
//   · 5 informes sectoriales (Seguridad, Salud, Empleo, Minería, Educación)
// ═══════════════════════════════════════════════════════════════

export const REPORTS: ReportEntry[] = [
  // ─── Grupo 1: Población (Censo 2022) ───
  {
    id: 'poblacion-estructura',
    slug: 'poblacion/estructura',
    title: 'Estructura por Sexo y Edad',
    shortTitle: 'Estructura Poblacional',
    category: 'Población',
    subcategory: 'Estructura',
    icon: '👥',
    color: '#74ACDF',
    mdPath: '/reports/poblacion/estructura.md',
    dataPath: '/data/poblacion/estructura.json',
    order: 1,
  },
  {
    id: 'poblacion-habitacional-personas',
    slug: 'poblacion/habitacional-personas',
    title: 'Condiciones Habitacionales de la Población',
    shortTitle: 'Hábitat Personas',
    category: 'Población',
    subcategory: 'Hábitat Personas',
    icon: '🏠',
    color: '#F6B40E',
    mdPath: '/reports/poblacion/habitacional-personas.md',
    dataPath: '/data/poblacion/habitacional-personas.json',
    order: 2,
  },
  {
    id: 'poblacion-salud-prevision',
    slug: 'poblacion/salud-prevision',
    title: 'Salud y Previsión Social',
    shortTitle: 'Salud & Previsión',
    category: 'Población',
    subcategory: 'Salud',
    icon: '🏥',
    color: '#6BBF59',
    mdPath: '/reports/poblacion/salud-prevision.md',
    dataPath: '/data/poblacion/salud-prevision.json',
    order: 3,
  },
  {
    id: 'poblacion-habitacional-hogares',
    slug: 'poblacion/habitacional-hogares',
    title: 'Condiciones Habitacionales de los Hogares',
    shortTitle: 'Hábitat Hogares',
    category: 'Población',
    subcategory: 'Hábitat Hogares',
    icon: '🏗️',
    color: '#FFD04A',
    mdPath: '/reports/poblacion/habitacional-hogares.md',
    dataPath: '/data/poblacion/habitacional-hogares.json',
    order: 4,
  },
  {
    id: 'poblacion-viviendas',
    slug: 'poblacion/viviendas',
    title: 'Stock Habitacional y Viviendas',
    shortTitle: 'Viviendas',
    category: 'Población',
    subcategory: 'Viviendas',
    icon: '🏘️',
    color: '#93C5F8',
    mdPath: '/reports/poblacion/viviendas.md',
    dataPath: '/data/poblacion/viviendas.json',
    order: 5,
  },
  {
    id: 'poblacion-educacion-censal',
    slug: 'poblacion/educacion-censal',
    title: 'Asistencia Educativa de la Población',
    shortTitle: 'Educación Censal',
    category: 'Población',
    subcategory: 'Educación',
    icon: '📚',
    color: '#06b6d4',
    mdPath: '/reports/poblacion/educacion-censal.md',
    dataPath: '/data/poblacion/educacion-censal.json',
    order: 6,
  },
  {
    id: 'poblacion-economia',
    slug: 'poblacion/economia',
    title: 'Características Económicas de la Población',
    shortTitle: 'Economía Poblacional',
    category: 'Población',
    subcategory: 'Economía',
    icon: '💼',
    color: '#eab308',
    mdPath: '/reports/poblacion/economia.md',
    dataPath: '/data/poblacion/economia.json',
    order: 7,
  },
  {
    id: 'poblacion-fecundidad',
    slug: 'poblacion/fecundidad',
    title: 'Fecundidad',
    shortTitle: 'Fecundidad',
    category: 'Población',
    subcategory: 'Fecundidad',
    icon: '👶',
    color: '#ec4899',
    mdPath: '/reports/poblacion/fecundidad.md',
    dataPath: '/data/poblacion/fecundidad.json',
    order: 8,
  },

  // ─── Grupo 2: Sectoriales ───
  {
    id: 'seguridad',
    slug: 'seguridad',
    title: 'Seguridad y Estadísticas Criminales',
    shortTitle: 'Seguridad',
    category: 'Seguridad',
    subcategory: 'SNIC',
    icon: '🛡️',
    color: '#dc2626',
    mdPath: '/reports/seguridad.md',
    dataPath: '/data/seguridad.json',
    order: 9,
  },
  {
    id: 'salud-vitales',
    slug: 'salud/vitales',
    title: 'Estadísticas Vitales — Nacimientos y Defunciones',
    shortTitle: 'Salud Vitales',
    category: 'Salud',
    subcategory: 'Vitales',
    icon: '💗',
    color: '#10b981',
    mdPath: '/reports/salud/vitales.md',
    dataPath: '/data/salud/vitales.json',
    order: 10,
  },
  {
    id: 'empleo-economia',
    slug: 'empleo/economia',
    title: 'Empleo Registrado y Economía',
    shortTitle: 'Empleo & Economía',
    category: 'Economía',
    subcategory: 'Empleo SSPM',
    icon: '📊',
    color: '#14b8a6',
    mdPath: '/reports/empleo/economia.md',
    dataPath: '/data/empleo/economia.json',
    order: 11,
  },
  {
    id: 'mineria-litio',
    slug: 'mineria/litio',
    title: 'Minería y Litio',
    shortTitle: 'Minería · Litio',
    category: 'Minería',
    subcategory: 'Litio · SIACAM',
    icon: '⛏️',
    color: '#a855f7',
    mdPath: '/reports/mineria/litio.md',
    dataPath: '/data/mineria/litio.json',
    order: 12,
  },
  {
    id: 'educacion-indicadores',
    slug: 'educacion/indicadores',
    title: 'Indicadores Educativos',
    shortTitle: 'Educación Provincial',
    category: 'Educación',
    subcategory: 'Indicadores',
    icon: '🎓',
    color: '#f97316',
    mdPath: '/reports/educacion/indicadores.md',
    dataPath: '/data/educacion/indicadores.json',
    order: 13,
  },
];

export function getReportBySlug(slug: string): ReportEntry | undefined {
  return REPORTS.find(r => r.slug === slug);
}

export function getReportsByCategory(category: string): ReportEntry[] {
  return REPORTS.filter(r => r.category === category);
}

export function getPoblacionReports(): ReportEntry[] {
  return REPORTS.filter(r => r.category === 'Población');
}

export function getSectorialReports(): ReportEntry[] {
  return REPORTS.filter(r => r.category !== 'Población');
}
