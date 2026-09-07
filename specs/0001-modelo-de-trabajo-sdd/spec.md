# SPEC 0001 — Modelo de trabajo SDD y gobernanza

- **Estado:** En progreso
- **Autor:** equipo Skylab
- **Fecha:** 2026-09-07
- **Módulos afectados:** repo (raíz), docs/, CI (GitHub Actions), CRM_Frontend (design-system, ficha de módulo)
- **Rama:** `chore/working-model`
- **PR:** _pendiente_

## 1. Problema / oportunidad

El desarrollo se hace con varias herramientas de IA (Claude, Gemini/Antigravity, Copilot).
Hoy no hay un modelo único escrito: cada herramienta improvisa proceso, despliegue y
documentación. Riesgos concretos:

- Cambios que llegan a producción (`http://192.168.8.65:3003/`) sin verificación local previa.
- Sin trazabilidad spec → código → PR.
- Documentación dispersa; las lecciones aprendidas se pierden entre sesiones.
- El "estilo premium" del CRM se aplica de forma inconsistente (mezcla de `bg-white/5`
  con tokens de tema, radios y tipografía variables).

Precedente que sí funciona: `docs/modulos/ciberseguridad/` ya usa `SPEC-*.md` + `adr/`.

## 2. Objetivo

Un modelo de trabajo único, escrito y agnóstico de herramienta, que toda IA deba leer y
cumplir, con andamiaje mínimo para hacerlo operativo (SDD, pipeline local→PR→prod,
documentación estructurada, CI).

## 3. Alcance

- Documento canónico `docs/WORKING_MODEL.md` + punteros (`AGENTS.md`, `CLAUDE.md`,
  `GEMINI.md`, `.github/copilot-instructions.md`, línea en `# ANTIGRAVITY RULES.txt`).
- Estructura `specs/` (README + TEMPLATE + esta spec 0001).
- `docs/adr/` (README + plantilla + ADR-0001).
- `docs/lecciones-aprendidas/` (README + plantilla + LL-0001).
- `CHANGELOG.md` raíz (Keep a Changelog).
- `CRM_Frontend/docs/design-system.md` (codifica el "ADN premium").
- `CRM_Frontend/docs/analitica-agentes/README.md` (ficha del módulo en curso).
- Pipeline local: `docker-compose.local.yml` (override, no toca el base) +
  `docs/operacion/despliegue-local.md`.
- CI: `.github/workflows/crm-frontend.yml` (lint + build en PRs que tocan `CRM_Frontend/**`).
- `.github/pull_request_template.md` con el Definition of Done.
- Ediciones aditivas mínimas en `docs/README.md`, `docs/modulos/crm-frontend.md`,
  `docs/operacion/despliegue.md`, `# ANTIGRAVITY RULES.txt`.

## 4. No-objetivos

- **No** se modifica `docker-compose.yml` base, `Dockerfile`, `nginx.conf`, `package.json`
  ni nada bajo `CRM_Frontend/src/**`.
- **No** se refactoriza código de producto en esta spec.
- **No** se crea entorno Supabase de staging (se documenta como riesgo pendiente).
- **No** se limpia basura del repo (`Bot_comercial-main cop/`, `gemini.mp4`) — spec aparte.
- **No** se retro-formaliza como spec el trabajo previo del ranking; se registra en
  `CHANGELOG.md` como pendiente de spec retroactiva.

## 5. Criterios de aceptación

- [ ] `docs/WORKING_MODEL.md` existe y describe los 5 pilares + Definition of Done.
- [ ] Los 4 punteros existen y solo apuntan al canónico (sin reglas duplicadas).
- [ ] `specs/TEMPLATE/` con `spec.md`, `plan.md`, `tasks.md`.
- [ ] `docker-compose.local.yml` levanta `crm-frontend` en `http://127.0.0.1:3003/`
      apuntando a `127.0.0.1` y **sin** modificar el archivo base.
- [ ] `docker compose -f docker-compose.yml -f docker-compose.local.yml config` valida sin error.
- [ ] Workflow de CI presente y con sintaxis válida.
- [ ] `CRM_Frontend/docs/design-system.md` cubre superficie, radios, tipografía, tema.
- [ ] `git status` no muestra cambios en `docker-compose.yml`, `Dockerfile`, `nginx.conf`, `src/**`.

## 6. Restricciones de arquitectura y diseño

- Trabajo estrictamente aditivo salvo 4 ediciones documentales append-only.
- El override de compose solo redefine `crm-frontend` (`build.args` + `depends_on`).
- Nada de secretos nuevos versionados.

## 7. Riesgos

| Riesgo | Impacto | Mitigación |
|--------|---------|-----------|
| El override de compose merge-ea mal los `build.args` (lista vs mapa) | build local con URLs de prod | Usar sintaxis de mapa en el override; validar con `compose config` |
| `crm-frontend` no arranca local por `depends_on: service_healthy` de cctv/cyber | bloquea el smoke test | El override baja las condiciones a `service_started` (solo local) |
| Herramientas de IA que no cargan `AGENTS.md`/`CLAUDE.md` | se saltan el modelo | Punteros redundantes (4) + línea en `# ANTIGRAVITY RULES.txt` |

## 8. Impacto en producción

**Ninguno.** No cambia el bundle, el `docker-compose.yml` base ni el flujo de deploy a prod.
Solo agrega documentación, plantillas, un override local y CI. Rollback = revert del PR.
