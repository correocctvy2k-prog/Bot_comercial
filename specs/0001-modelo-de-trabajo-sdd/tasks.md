# TASKS 0001 — Modelo de trabajo SDD y gobernanza

Referencia: `spec.md` y `plan.md` en esta carpeta.

## Implementación

- [x] `docs/WORKING_MODEL.md` (canónico)
- [x] Punteros: `AGENTS.md`, `CLAUDE.md`, `GEMINI.md`, `.github/copilot-instructions.md`
- [x] `specs/README.md` + `specs/TEMPLATE/{spec,plan,tasks}.md`
- [x] `specs/0001-modelo-de-trabajo-sdd/{spec,plan,tasks}.md`
- [x] `docs/adr/` (README + plantilla + ADR-0001)
- [x] `docs/lecciones-aprendidas/` (README + plantilla + LL-0001)
- [x] `CHANGELOG.md`
- [x] `docker-compose.local.yml` (override)
- [x] `docs/operacion/despliegue-local.md`
- [x] `.github/pull_request_template.md`
- [x] `.github/workflows/crm-frontend.yml`
- [x] `CRM_Frontend/docs/design-system.md`
- [x] `CRM_Frontend/docs/analitica-agentes/README.md`
- [x] Ediciones aditivas: `# ANTIGRAVITY RULES.txt`, `docs/README.md`, `docs/modulos/crm-frontend.md`, `docs/operacion/despliegue.md`

## Verificación

- [x] `git status` sin cambios en `docker-compose.yml`, `Dockerfile`, `nginx.conf`, `CRM_Frontend/src/**`
- [ ] `docker compose -f docker-compose.yml -f docker-compose.local.yml config` (requiere Docker en la máquina)
- [ ] `... up -d --build crm-frontend` → `http://127.0.0.1:3003/` responde (requiere Docker)
- [ ] Workflow validado (`actionlint` o revisión manual)

## Documentación (Definition of Done)

- [x] `CHANGELOG.md` — sección "No publicado"
- [x] Ficha de módulo (`docs/modulos/crm-frontend.md` + `CRM_Frontend/docs/analitica-agentes/`)
- [x] ADR (`docs/adr/ADR-0001-modelo-sdd-y-gobernanza.md`)
- [x] Lección aprendida (`docs/lecciones-aprendidas/LL-0001-config-build-time-vite.md`)

## Cierre

- [ ] PR abierto y enlazado en `spec.md`
- [ ] CI verde
- [ ] Merge a `main`
- [ ] N/A deploy a prod (cambio documental/tooling)
