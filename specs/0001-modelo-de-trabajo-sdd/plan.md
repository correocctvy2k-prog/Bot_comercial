# PLAN 0001 — Modelo de trabajo SDD y gobernanza

Referencia: `spec.md` en esta misma carpeta.

## Enfoque técnico

Fuente única de verdad (`docs/WORKING_MODEL.md`) + adaptadores mínimos por herramienta
(punteros de ~10 líneas). Así no hay deriva entre archivos: si cambia el modelo, cambia
un solo documento.

SDD se generaliza desde el precedente de Ciberseguridad, pero a nivel raíz (`specs/`),
porque las specs cruzan servicios (frontend + bots + APIs).

El pipeline local se resuelve con un **override de Docker Compose** en vez de tocar el
archivo base, porque la config del frontend es build-time y solo hay que redefinir
`build.args` y relajar `depends_on` para el arranque local.

## Archivos a tocar

### Nuevos
| Archivo | Propósito |
|---------|-----------|
| `docs/WORKING_MODEL.md` | Canónico |
| `AGENTS.md`, `CLAUDE.md`, `GEMINI.md`, `.github/copilot-instructions.md` | Punteros |
| `specs/README.md`, `specs/TEMPLATE/{spec,plan,tasks}.md` | SDD |
| `specs/0001-modelo-de-trabajo-sdd/{spec,plan,tasks}.md` | Esta spec (dogfooding) |
| `docs/adr/README.md`, `docs/adr/ADR-0000-template.md`, `docs/adr/ADR-0001-modelo-sdd-y-gobernanza.md` | ADRs |
| `docs/lecciones-aprendidas/README.md`, `LL-0000-template.md`, `LL-0001-config-build-time-vite.md` | Lecciones |
| `CHANGELOG.md` | Registro de avances |
| `docker-compose.local.yml` | Override local (no toca el base) |
| `docs/operacion/despliegue-local.md` | Runbook local + smoke test |
| `.github/pull_request_template.md` | Definition of Done en cada PR |
| `.github/workflows/crm-frontend.yml` | CI lint + build |
| `CRM_Frontend/docs/design-system.md` | ADN visual |
| `CRM_Frontend/docs/analitica-agentes/README.md` | Ficha de módulo |

### Ediciones aditivas (append-only)
| Archivo | Cambio | Riesgo |
|---------|--------|--------|
| `# ANTIGRAVITY RULES.txt` | Sección nueva al final apuntando al canónico | nulo |
| `docs/README.md` | Filas nuevas en la cascada (SDD, ADR, lecciones, design-system) | nulo |
| `docs/modulos/crm-frontend.md` | Sub-módulo "Analítica de Agentes" + enlace a design-system | nulo |
| `docs/operacion/despliegue.md` | Aviso arriba: orden obligatorio local→PR→prod + enlace | nulo |

## Contratos de datos / API

Ninguno. Sin cambios de esquema, endpoints ni bundle.

## `docker-compose.local.yml` — diseño

- Solo servicio `crm-frontend`:
  - `build.args` en sintaxis de **mapa**, con `VITE_*` apuntando a `http://127.0.0.1:<puerto>`
    (`3001` backend/monitoring, `3004` services-ti, `3006` support). Supabase igual que el base.
    `VITE_CCTV_API_BASE` vacío (relativo, vía nginx interno).
  - `depends_on` redefinido a `condition: service_started` para `cctv-api`, `cybersecurity-api`,
    `chatbot-soporte`, para que el frontend arranque aunque esas APIs estén degradadas en local.
- No redefine ningún otro servicio: se heredan tal cual del base cuando se listan en el `up`.

## Plan de rollout

1. Crear archivos en rama `chore/working-model`.
2. `docker compose -f docker-compose.yml -f docker-compose.local.yml config` → validar.
3. (Manual, con Docker disponible) `... up -d --build crm-frontend` → abrir `http://127.0.0.1:3003/`.
4. Commit con rutas explícitas. PR. CI.
5. Merge. Sin deploy a prod (cambio solo documental/tooling).

## Plan de rollback

`git revert` del merge commit. No hay estado en runtime que revertir.

## Verificación

- `git status --porcelain` no lista `docker-compose.yml`, `Dockerfile`, `nginx.conf`, `CRM_Frontend/src/`.
- `docker compose ... config` sale con código 0 y muestra `crm-frontend` con los `VITE_*` en `127.0.0.1`.
- `node --check` / lint de YAML del workflow (o `actionlint` si está disponible).
