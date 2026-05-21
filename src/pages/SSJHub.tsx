import { Link } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';
import { ArrowLeft } from 'lucide-react';
import { getSSJReports } from '../data/reportRegistry';
import { SectionReveal } from '../components/ui/SectionReveal';
import { SiteFooter } from '../components/layout/SiteFooter';
import type { ReportEntry } from '../types/report';

// ─── Stats por informe SSJ — replicados del Landing para mostrar en cards featured ───
type StatItem = { value: string; label: string };

const SSJ_REPORT_STATS: Record<string, StatItem[]> = {
  'ssj-poblacion-estructura': [
    { value: '321K', label: 'habitantes' },
    { value: '39,5%', label: 'de la provincia' },
    { value: '155', label: 'hab./km²' },
    { value: '32', label: 'edad mediana' },
  ],
  'ssj-poblacion-habitacional-personas': [
    { value: 'Personas', label: 'Belgrano' },
    { value: 'Gas red', label: 'cobertura' },
    { value: 'Agua', label: 'cañería' },
    { value: 'Internet', label: 'brecha' },
  ],
  'ssj-poblacion-salud-prevision': [
    { value: 'Salud', label: 'Belgrano' },
    { value: 'Obra social', label: 'cobertura' },
    { value: 'Previsión', label: 'jubilados' },
    { value: 'Sin OS', label: 'subsist.' },
  ],
  'ssj-poblacion-habitacional-hogares': [
    { value: 'Hogares', label: 'Belgrano' },
    { value: 'Tenencia', label: 'propia/alq.' },
    { value: 'Alquiler', label: 'mayor pp.' },
    { value: 'Gas red', label: 'líder' },
  ],
  'ssj-poblacion-viviendas': [
    { value: 'Stock', label: 'capital' },
    { value: 'Departamentos', label: 'mayor %' },
    { value: 'Desocupación', label: 'tasa' },
    { value: 'Hacinamiento', label: 'residencial' },
  ],
  'ssj-poblacion-educacion-censal': [
    { value: 'Nivel sup.', label: 'UNJu' },
    { value: 'Asistencia', label: 'capital' },
    { value: 'Posgrado', label: 'concentra' },
    { value: 'Sin instr.', label: 'menor' },
  ],
  'ssj-poblacion-economia': [
    { value: 'PEA', label: 'Belgrano' },
    { value: 'Empleo', label: 'público' },
    { value: 'Comercio', label: 'servicios' },
    { value: 'Ramas', label: 'capital' },
  ],
  'ssj-poblacion-fecundidad': [
    { value: 'Hijos', label: 'Belgrano' },
    { value: '< prov.', label: 'transición' },
    { value: 'Capital', label: 'urbana' },
    { value: 'Promedio', label: 'menor' },
  ],
  'ssj-seguridad': [
    { value: 'SNIC', label: 'Belgrano' },
    { value: '40%+', label: 'del total' },
    { value: 'Tasa hom.', label: '/100K' },
    { value: 'Capital', label: '2024' },
  ],
};

export function SSJHub() {
  const ssj = getSSJReports();

  return (
    <div className="landing-page">
      <Helmet>
        <title>San Salvador de Jujuy · Análisis Especial · Dashboard Jujuy</title>
        <meta
          name="description"
          content="Apartado especial dedicado al Departamento Dr. Manuel Belgrano y la ciudad capital de Jujuy. 9 informes ejecutivos con datos del Censo 2022 y SNIC."
        />
      </Helmet>

      {/* ─── Back link ─── */}
      <div style={{ padding: '1.25rem 0 0.5rem' }}>
        <Link
          to="/"
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '0.4rem',
            color: 'var(--text-secondary)',
            fontSize: '0.85rem',
            textDecoration: 'none',
            fontFamily: 'var(--font-heading)',
            letterSpacing: '0.04em',
          }}
        >
          <ArrowLeft size={14} /> Volver al Dashboard
        </Link>
      </div>

      {/* ─── Hero del apartado ─── */}
      <SectionReveal>
        <section className="ssj-highlight" aria-labelledby="ssj-hub-title">
          <div className="ssj-highlight-header">
            <span className="ssj-highlight-badge">Análisis Especial</span>
            <h1 id="ssj-hub-title" className="ssj-highlight-title">San Salvador de Jujuy</h1>
            <p className="ssj-highlight-desc">
              Apartado dedicado al <strong>Departamento Dr. Manuel Belgrano</strong>, que contiene
              la ciudad capital y concentra el <strong>39,5%</strong> de la población provincial.
              Mismo corpus analítico que el dashboard provincial, recortado al territorio del Gran
              San Salvador — con foco narrativo en <strong>Alto Comedero</strong>, el centro
              histórico y la conurbación capitalina.
            </p>
            <div
              style={{
                marginTop: '1rem',
                display: 'flex',
                gap: '1.5rem',
                flexWrap: 'wrap',
                fontSize: '0.85rem',
                color: 'var(--text-secondary)',
                fontFamily: 'var(--font-mono)',
              }}
            >
              <span>📊 {ssj.length} informes</span>
              <span>📍 Código INDEC 38021</span>
              <span>🏘️ ~320.990 habitantes</span>
              <span>📐 2.073,3 km²</span>
            </div>
          </div>
          <div className="ssj-highlight-grid">
            {ssj.map((report, i) => (
              <SSJReportCard key={report.id} report={report} index={i} />
            ))}
          </div>
        </section>
      </SectionReveal>

      <SiteFooter />
    </div>
  );
}

function SSJReportCard({ report, index }: { report: ReportEntry; index: number }) {
  const stats = SSJ_REPORT_STATS[report.id];

  return (
    <Link
      to={`/${report.slug}`}
      className="report-card report-card-featured"
      style={{
        '--card-color': report.color,
        animationDelay: `${index * 80}ms`,
      } as React.CSSProperties}
    >
      <div className="report-card-glow" aria-hidden="true" />
      <div className="report-card-header">
        <span className="report-card-number">{report.icon}</span>
        <span className="report-card-arrow">→</span>
      </div>
      <div className="report-card-body">
        <span className="report-card-title">{report.shortTitle}</span>
        <span className="report-card-desc">{report.title}</span>
      </div>
      {stats && stats.length > 0 && (
        <div className="report-card-stat">
          <div className="report-card-ticker report-card-ticker--lg" aria-hidden="true">
            <span className="report-card-ticker-item">
              <strong className="report-card-ticker-value">{stats[0].value}</strong>
              <span className="report-card-ticker-label">{stats[0].label}</span>
            </span>
          </div>
        </div>
      )}
    </Link>
  );
}
