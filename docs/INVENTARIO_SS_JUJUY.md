# Apartado "San Salvador de Jujuy" — Inventario y plan

> Apartado dentro del Dashboard Jujuy análogo al "Conurbano" del Dashboard PBA.
> Recorte geográfico: **Departamento Dr. Manuel Belgrano** (código INDEC `38021`), que contiene la ciudad capital.
> Aglomerado Gran Jujuy (incluiría Palpalá `38042`): **descartado** — apartado estricto a la capital.

---

## 1. Hallazgo central

**No hace falta sumar fuentes nuevas para arrancar el apartado.** Los datasets que ya alimentan los 13 informes provinciales tienen — en casi todos los casos — corte departamental disponible, donde Dr. M. Belgrano es uno de los 16 departamentos cubiertos.

Mecánica: re-procesar los mismos archivos crudos filtrando por código `38021`, generar salidas paralelas en `public/data/ssj/` y reutilizar los componentes de visualización ya escritos para el dashboard provincial.

---

## 2. Cobertura de los 13 informes provinciales

### 2.1 Censo 2022 — 8 informes

Patrón de los XLSX: cada cuadro principal trae **16 sub-hojas** `X.10.1` a `X.10.16`, una por departamento de Jujuy.

| # | Informe | Cobertura departamental | Estado |
|---|---|---|---|
| 1 | Estructura por sexo y edad | 51 / 54 hojas (94%) | ✅ Replicable |
| 2 | Habitacional de la población | 82 / 87 (94%) | ✅ Replicable |
| 3 | Salud y previsión social | 2 / 4 (50%) | ⚠️ Parcial — algunos cuadros solo provinciales |
| 4 | Habitacional de los hogares | 82 / 87 (94%) | ✅ Replicable |
| 5 | Viviendas | 3 / 3 (100%) | ✅ Replicable |
| 6 | Educación censal | 48 / 51 (94%) | ✅ Replicable |
| 7 | Características económicas | 193 / 205 (94%) | ✅ Replicable |
| 8 | Fecundidad | 225 / 248 (91%) | ✅ Replicable |

### 2.2 Sectoriales — 5 informes

| Informe | Fuente | Estado para Belgrano |
|---|---|---|
| Seguridad — SNIC | Panel departamental Min. Seguridad Nación | ✅ Listo — `process-seguridad.cjs` ya filtra por código depto |
| Salud — Vitales (DEIS) | Min. Salud Nación | ✅ DEIS publica por depto de residencia |
| Empleo y Economía | SSPM | ⚠️ Parcial — algunos indicadores SSPM bajan a depto, otros no |
| Educación — Indicadores | Min. Educación Nación | ✅ Listo — `process-educacion.cjs` ya tiene `porDepartamento` |
| ~~Minería / Litio~~ | SIACAM | ❌ **Omitido** — el litio está en Susques, Cochinoca, Rinconada; Belgrano no tiene yacimientos relevantes |

**Resultado: 12 informes en el apartado SS Jujuy** (los 8 censales + 4 sectoriales).

---

## 3. Lo que NO entra en este alcance

- **Bajada a barrio o radio censal** dentro de la ciudad — queda como fase 2 opcional. Requiere reagregar radios censales del depto. Belgrano a polígonos de barrio (con riesgo de cobertura de capa OSM).
- **Datos municipales propios** (boletines, ordenanzas, licitaciones de la Municipalidad) — fase 2 opcional, requiere scraping de PDFs.
- **Datos satelitales** (NDVI, mancha urbana, building footprints) — fase 3 opcional.
- **Aglomerado Gran Jujuy** (sumar Palpalá) — descartado por decisión de scope.

---

## 4. Plan técnico

### 4.1 Estructura de salidas

```
public/data/ssj/
├── poblacion/
│   ├── estructura.json
│   ├── habitacional-personas.json
│   ├── salud-prevision.json
│   ├── habitacional-hogares.json
│   ├── viviendas.json
│   ├── educacion-censal.json
│   ├── economia.json
│   └── fecundidad.json
├── seguridad.json
├── salud/vitales.json
├── empleo/economia.json
└── educacion/indicadores.json
```

### 4.2 Reutilización del pipeline

Estrategia preferida: **parametrizar los generadores existentes con un `scope`**, no duplicar.

- `scripts/generate-report-data.cjs` → recibe `scope = "provincial" | "ssj"` y, según valor, lee la hoja `X.10` (provincia) o la `X.10.N` de Dr. M. Belgrano.
- `scripts/process-seguridad.cjs`, `process-salud.cjs`, `process-empleo.cjs`, `process-educacion.cjs` → mismo patrón, agregar filtro `departamento_id == "38021"` cuando `scope = "ssj"`.
- `scripts/build-data.cjs` → al final del pipeline provincial, ejecutar todo de nuevo con `scope = "ssj"`.

### 4.3 Registry y rutas en el front

- Agregar campo `scope?: 'provincial' | 'ssj'` a `ReportEntry`.
- Sumar 12 entradas paralelas en `src/data/reportRegistry.ts` con `slug: "ssj/..."` y `dataPath: "/data/ssj/..."`.
- Layout/sidebar puede agrupar por scope; rutas tipo `/ssj/poblacion/estructura`.

### 4.4 Hoja correspondiente a Belgrano

En los XLSX con sub-cuadros (patrón `X.10.N`), el departamento Dr. M. Belgrano aparece como uno de los 16. **Acción de validación previa al code**: confirmar el índice N de Belgrano en cada archivo — el orden dentro de los XLSX puede ser por código INDEC o alfabético. Resolver una vez con un mini-script de mapeo y consumirlo desde los generadores.

---

## 5. Fuentes (sin novedades respecto al dashboard provincial)

- INDEC — XLSX Censo 2022 ya en `1- Poblacion/`
- Pipeline OpenArg local — `C:/Users/dante/Desktop/Laboratorio Colossus/Pipeline OpenArg/datos_abiertos/datasets/{seguridad,salud,sspm,educacion}`
- Catálogo de departamentos: `scripts/lib/geo-departamentos-jujuy.cjs` (ya existente, código `38021`)
