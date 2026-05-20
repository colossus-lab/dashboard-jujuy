import { Link } from 'react-router-dom';
import { useEffect, useRef, useState, useCallback } from 'react';
import { Helmet } from 'react-helmet-async';
import { getPoblacionReports, getSectorialReports } from '../data/reportRegistry';
import { SectionReveal } from '../components/ui/SectionReveal';
import { SiteFooter } from '../components/layout/SiteFooter';
import type { ReportEntry } from '../types/report';

// ─── Macro KPIs for the hero (Jujuy census data) ───
const HERO_STATS = [
  { value: 811611, label: 'Habitantes', suffix: '', tooltip: 'Censo Nacional 2022 · INDEC' },
  { value: 16, label: 'Departamentos', suffix: '', tooltip: 'División política de la Provincia de Jujuy' },
  { value: 53219, label: 'km²', suffix: '', tooltip: 'Superficie total de la provincia' },
  { value: 13, label: 'Informes', suffix: '', tooltip: '13 informes basados en datos abiertos' },
];

// ─── Stats reales por informe ───
type StatItem = { value: string; label: string };

const REPORT_STATS: Record<string, StatItem[]> = {
  'poblacion-estructura': [
    { value: '811K', label: 'habitantes' },
    { value: '16', label: 'departamentos' },
    { value: '+20,5%', label: '2010-2022' },
    { value: '1,7%', label: 'del país' },
  ],
  'poblacion-habitacional-personas': [
    { value: 'Personas', label: 'censo' },
    { value: 'Hábitat', label: 'condición' },
    { value: 'Agua', label: 'cobertura' },
    { value: 'Cloaca', label: 'servicio' },
  ],
  'poblacion-salud-prevision': [
    { value: 'Salud', label: 'cobertura' },
    { value: 'Obra social', label: 'tipo' },
    { value: 'Previsión', label: 'jubilados' },
    { value: 'Sin OS', label: 'subsist.' },
  ],
  'poblacion-habitacional-hogares': [
    { value: 'Hogares', label: 'censo' },
    { value: 'Vivienda', label: 'tipo' },
    { value: 'Cocina', label: 'combustible' },
    { value: 'Cuartos', label: 'tamaño' },
  ],
  'poblacion-viviendas': [
    { value: 'Stock', label: 'viviendas' },
    { value: 'Tipo', label: 'casas/dpto' },
    { value: 'Material', label: 'paredes' },
    { value: 'Ocupación', label: 'estado' },
  ],
  'poblacion-educacion-censal': [
    { value: 'Asistencia', label: 'escolar' },
    { value: 'Nivel', label: 'alcanzado' },
    { value: 'Inicial', label: '3-5 años' },
    { value: 'Sec.', label: 'completo' },
  ],
  'poblacion-economia': [
    { value: 'PEA', label: 'activos' },
    { value: 'Empleo', label: 'tasa' },
    { value: 'Categoría', label: 'ocupacional' },
    { value: 'Rama', label: 'actividad' },
  ],
  'poblacion-fecundidad': [
    { value: 'Hijos', label: 'por mujer' },
    { value: 'Madres', label: 'edad' },
    { value: '14-49', label: 'fecundas' },
    { value: 'Brecha', label: 'rural-urb.' },
  ],
  // Sectoriales
  'seguridad': [
    { value: 'SNIC', label: '2000-2024' },
    { value: 'Hechos', label: 'delictivos' },
    { value: 'Tasa', label: '/100K hab.' },
    { value: '16', label: 'departamentos' },
  ],
  'salud-vitales': [
    { value: 'Defunciones', label: '1914-2023' },
    { value: 'Nacimientos', label: '2017-2023' },
    { value: '109 años', label: 'serie' },
    { value: 'INDEC', label: 'DEIS' },
  ],
  'empleo-economia': [
    { value: 'SSPM', label: 'mensual' },
    { value: '2009+', label: 'serie' },
    { value: 'Privado', label: 'asalariado' },
    { value: 'Sin estac.', label: 'serie' },
  ],
  'mineria-litio': [
    { value: 'Litio', label: 'protagonista' },
    { value: 'SIACAM', label: 'SIPM' },
    { value: 'Producción', label: 'minera' },
    { value: 'Empleo', label: 'sectorial' },
  ],
  'educacion-indicadores': [
    { value: 'Abandono', label: '2012-2023' },
    { value: 'Repitencia', label: 'serie' },
    { value: 'Padrón', label: 'escuelas' },
    { value: 'Niveles', label: 'inic-sup' },
  ],
};

export function Landing() {
  const poblacion = getPoblacionReports();
  const sectoriales = getSectorialReports();

  return (
    <div className="landing-page">
      <Helmet>
        <title>Dashboard Jujuy · Inteligencia Estratégica Provincial</title>
        <meta
          name="description"
          content="Plataforma de datos abiertos con análisis interactivo de la Provincia de Jujuy. 811.611 habitantes, 16 departamentos, 13 informes."
        />
        <link rel="canonical" href="https://jujuy.openarg.org" />
      </Helmet>
      {/* ─── Animated Hero ─── */}
      <SectionReveal>
        <header className="landing-hero">
          {/* Floating particles */}
          <div className="hero-particles" aria-hidden="true">
            {Array.from({ length: 6 }).map((_, i) => (
              <span key={i} className="hero-particle" style={{ '--i': i } as React.CSSProperties} />
            ))}
          </div>

          <div className="hero-content">
            <div className="hero-badge">
              <span className="hero-badge-dot" />
              Plataforma de Datos Abiertos
            </div>
            <h1 className="hero-title">
              Inteligencia Estratégica
              <span className="hero-title-light">de la Provincia de Jujuy</span>
            </h1>
            <p className="hero-subtitle">
              Explorá <span className="hero-highlight">811.611 habitantes</span> y{' '}
              <span className="hero-highlight">16 departamentos</span> con 13 informes basados
              en datos oficiales del INDEC, Censo 2022, SNIC, SSPM, SIACAM y Ministerio de Salud.
            </p>
            <p className="hero-attribution">
              Powered by{' '}
              <a href="https://colossuslab.org" target="_blank" rel="noopener noreferrer" className="hero-link">
                ColossusLab.org
              </a>{' '}
              · Datos vía{' '}
              <a href="https://openarg.org" target="_blank" rel="noopener noreferrer" className="hero-link">
                OpenArg
              </a>
            </p>

            {/* ─── Count-up Stats ─── */}
            <div className="hero-stats">
              {HERO_STATS.map((stat, i) => (
                <div key={stat.label}>
                  {i > 0 && <span className="hero-stat-divider" />}
                  <div className="hero-stat" title={stat.tooltip}>
                    <CountUp target={stat.value} suffix={stat.suffix} />
                    <span className="hero-stat-label">{stat.label}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </header>
      </SectionReveal>

      {/* ─── Población Grid ─── */}
      <SectionReveal>
        <section className="landing-section">
          <div className="section-header">
            <div className="section-number">01</div>
            <div>
              <h2 className="section-title">Población — Censo 2022</h2>
              <p className="section-desc">
                Ocho dimensiones del último censo nacional: estructura por sexo y edad, hábitat,
                hogares, stock de viviendas, asistencia educativa, características económicas,
                salud y previsión, y fecundidad.
              </p>
            </div>
          </div>
          <div className="report-grid">
            {poblacion.map((report, i) => (
              <ReportCard key={report.id} report={report} index={i} />
            ))}
          </div>
        </section>
      </SectionReveal>

      {/* ─── Sectoriales Grid ─── */}
      {sectoriales.length > 0 && (
        <SectionReveal>
          <section className="landing-section">
            <div className="section-header">
              <div className="section-number">02</div>
              <div>
                <h2 className="section-title">Análisis Sectoriales</h2>
                <p className="section-desc">Informes especializados por sector productivo, institucional y social.</p>
              </div>
            </div>
            <div className="report-grid">
              {sectoriales.map((report, i) => (
                <ReportCard key={report.id} report={report} index={i} />
              ))}
            </div>
          </section>
        </SectionReveal>
      )}

      {/* ─── Footer ─── */}
      <SiteFooter />
    </div>
  );
}

// ═══════ Components ═══════

function ReportCard({ report, index }: { report: ReportEntry; index: number }) {
  const stats = REPORT_STATS[report.id];
  const tickerSize: 'sm' | 'md' | 'lg' = index === 0 ? 'md' : 'sm';

  return (
    <Link
      to={`/${report.slug}`}
      className="report-card"
      style={{
        '--card-color': report.color,
        animationDelay: `${index * 80}ms`,
      } as React.CSSProperties}
    >
      <div className="report-card-glow" aria-hidden="true" />
      <div className="report-card-header">
        <span className="report-card-number">{String(report.order).padStart(2, '0')}</span>
        <span className="report-card-arrow">→</span>
      </div>
      <div className="report-card-body">
        <span className="report-card-title">{report.shortTitle}</span>
        <span className="report-card-desc">{report.title}</span>
      </div>
      {stats && stats.length > 0 && (
        <div className="report-card-stat">
          <StatTicker items={stats} size={tickerSize} />
        </div>
      )}
    </Link>
  );
}

// ─── Stat ticker: rota cifras reales con pausa para leer ───
function StatTicker({ items, size = 'sm' }: { items: StatItem[]; size?: 'sm' | 'md' | 'lg' }) {
  const [idx, setIdx] = useState(0);
  useEffect(() => {
    if (items.length <= 1) return;
    const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    if (reduce) return;
    const t = setInterval(() => setIdx(i => (i + 1) % items.length), 4000);
    return () => clearInterval(t);
  }, [items.length]);

  if (items.length === 0) return null;
  const cur = items[idx];
  return (
    <div className={`report-card-ticker report-card-ticker--${size}`} aria-hidden="true">
      <span key={idx} className="report-card-ticker-item">
        <strong className="report-card-ticker-value">{cur.value}</strong>
        <span className="report-card-ticker-label">{cur.label}</span>
      </span>
    </div>
  );
}

// ─── Count-up Animation ───
function CountUp({ target, suffix = '' }: { target: number; suffix?: string }) {
  const [value, setValue] = useState(0);
  const ref = useRef<HTMLSpanElement>(null);
  const hasAnimated = useRef(false);

  const animate = useCallback(() => {
    if (hasAnimated.current) return;
    hasAnimated.current = true;
    const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    if (reduce) {
      setValue(target);
      return;
    }
    const duration = 2000;
    const startTime = performance.now();
    const step = (now: number) => {
      const elapsed = now - startTime;
      const progress = Math.min(elapsed / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      setValue(Math.floor(eased * target));
      if (progress < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }, [target]);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting) animate(); },
      { threshold: 0.4 }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [animate]);

  const formatted = value >= 1000000
    ? `${(value / 1000000).toFixed(1).replace('.', ',')}M`
    : value >= 1000
    ? value.toLocaleString('es-AR')
    : `${value}`;

  return (
    <span ref={ref} className="hero-stat-value">
      {formatted}{suffix}
    </span>
  );
}
