# SPEC 0007 — Endurecer el proceso de desarrollo

- **Estado:** Borrador (roadmap de corto plazo — **no programada aún**)
- **Autor:** equipo Skylab (@jbeltran)
- **Fecha:** 2026-09-09
- **Módulos afectados:** repo (GitHub settings, CI), `ops/`, `docs/WORKING_MODEL.md`,
  `chatbot-analytics/`, `CRM_Frontend/`.
- **Rama:** `feat/0007-endurecer-proceso-desarrollo` (cuando se ejecute)
- **PR:** _pendiente_
- **Depende de / va después de:** las "oportunidades de mejora" del proyecto que el equipo
  identifique primero (posible spec 0008+). Esta spec se **documenta ahora** y se **secuencia
  después**.

## 1. Problema / oportunidad

El proceso SDD (spec 0001) dio un **esqueleto profesional**: specs por cambio,
`WORKING_MODEL.md` canónico y agnóstico de herramienta, ADRs, lecciones aprendidas, fichas de
módulo, `design-system.md`, Definition of Done, CI y "Docker local antes de prod".

Pero en la práctica de las specs 0002-0006 aparecieron **brechas de ejecución** (no de diseño):

| # | Brecha observada | Evidencia |
|---|------------------|-----------|
| 1 | **Cero pruebas automáticas.** La verificación fue siempre `curl` a mano + "no puedo hacer el smoke visual". | Ninguna carpeta `test/` / `*.test.js` / `*.spec.jsx` en el repo. `chatbot-analytics/lib/*` son funciones puras sin cubrir. |
| 2 | **PRs sin dientes.** 26 commits en 1 PR, auto-mergeado, sin revisión; nada llegó a `main` en ~2 semanas. | `LL-0002` (cadena de 7 ramas). `main` sin *branch protection*: se pudo hacer push directo y self-merge. |
| 3 | **Deuda de lint normalizada.** ~400 avisos; CI en `continue-on-error`. | `.github/workflows/crm-frontend.yml` paso "Lint (informativo)". |
| 4 | **CI parcial.** Solo `CRM_Frontend`. `chatbot-analytics` (lógica real) y `comercial-bot` (build roto) sin CI. | Un único workflow; lección de `comercial-bot` bullseye EOL. |
| 5 | **Deploy manual y frágil.** SSH + `sudo git pull` + colocar `.env` secreto a mano + `docker compose up --build` + mirar. Prod estuvo 5 specs atrás sin que nadie lo notara; `chatbot-analytics` :3008 no existía en prod. | Sesión 2026-09-09: primer deploy de 0002-0006 a `192.168.8.65`. `docs/operacion/despliegue.md` es una lista de pasos manuales. |
| 6 | **Entorno de dev no reproducible.** Windows + Git Bash: el enmascarado UTF-8 (`•`) rompió pruebas por `curl` dos veces (`LL-0003`). `node_modules` en el árbol; directorio de trabajo `CRM_Frontend/Table Trello`. | — |
| 7 | **Sin observabilidad.** `restart: always` pero sin `healthcheck` en compose ni alerta cuando un servicio cae. | `docker-compose.yml`. |

## 2. Objetivo

Que los controles de calidad **se hagan cumplir solos** (no honor-system) y que exista la
**red de seguridad** que hoy no hay (pruebas, healthchecks, deploy con script y rollback),
para sostener productos mantenibles y auditables con poco personal.

## 3. Alcance — por tramos (prioridad descendente)

### Tramo 1 — Barato y de alto apalancamiento (Tanda 1 al ejecutar)
1. **Branch protection en `main`** (GitHub Settings → Branches): exigir PR, exigir el check
   `CRM_Frontend CI` en verde, prohibir push directo y `--force`. Documentar en `WORKING_MODEL.md`.
2. **Lint con trinquete:** quitar `continue-on-error`; `npm run lint -- --max-warnings <N>` con
   `N` = conteo actual; el número solo baja. (Opcional: lint solo de archivos cambiados en PR.)
3. **`ops/deploy-prod.sh`:** un script idempotente — `git pull`, verificar que los `.env`
   requeridos existen, `docker compose up -d --build <servicios>`, `curl` a cada `/health`,
   imprimir la línea de rollback. Reemplaza la lista manual de `docs/operacion/despliegue.md`.
4. **Healthchecks** en `docker-compose.yml` para los servicios con endpoint de salud +
   `ops/healthcheck.sh` (cron cada 5 min) que pinga todo y avisa por Telegram si algo cae.

### Tramo 2 — La inversión de verdad
5. **Pruebas, empezando por el núcleo:** Vitest sobre `chatbot-analytics/lib/`
   (`analytics.js`, `analyticsBetty.js`, `parser*.js`, `privacy.js`, `contact.js` —
   `maskPhone`/`maskId`/`resolvePeer`, construcción de modelo, embudos). Luego **un** e2e con
   Playwright: login al CRM y recorrido de cada módulo (hubiera cazado cada "smoke visual"
   pendiente). Ambos a CI. DoD: "pruebas para lógica nueva".
6. **Trunk-based-ish:** ramas que salen de `main`, vida ≤ 3 días, merge tras PR verde. Prohibir
   ramas sobre ramas; si un trabajo depende de otro sin mergear → mergear antes o *feature flag*.
   Actualizar `WORKING_MODEL.md` §1 y §6.

### Tramo 3 — Madurez
7. CI por servicio (workflow para `chatbot-analytics`, y para `comercial-bot` cuando su build
   se arregle).
8. Entorno de dev estandarizado: devcontainer o `docs/operacion/setup-dev.md` verificado en
   limpio; sacar `node_modules` del árbol; normalizar el working dir.
9. `CODEOWNERS`, plantilla de PR obligatoria, y en cada deploy a prod: `git tag` + mover el
   bloque "No publicado" del `CHANGELOG.md` a una versión fechada (el formato ya existe, sin usar).
10. Gestión de secretos: `.env` cifrado con `age`/`sops` versionado, en vez de `scp` a mano.
11. Arreglar el build de `comercial-bot` (Debian bullseye EOL).

## 4. No-objetivos

- **No** es un rewrite ni un cambio de stack.
- **No** se adopta ceremonia de agencia grande que no encaja en 1-2 personas (Jira, sprints
  formales, story points, RFC board). El vehículo sigue siendo el SDD de spec 0001.
- **No** se persigue cobertura de pruebas alta de golpe: se prioriza la lógica pura y un e2e
  de humo; el resto crece con cada spec.
- **No** se bloquea el trabajo de producto mientras se implementa: los tramos entran como
  tandas pequeñas e independientes.

## 5. Criterios de aceptación (al ejecutar)

- [ ] `main` no acepta push directo ni merge sin PR + CI verde (probado intentando ambos).
- [ ] CI falla si el lint sube de `N` avisos o si `npm run build` / pruebas fallan, en
      `CRM_Frontend` **y** `chatbot-analytics`.
- [ ] `ops/deploy-prod.sh` despliega y verifica salud en una sola orden; documentado su uso y
      su rollback.
- [ ] `docker compose` reporta `healthy`/`unhealthy` por servicio; una caída dispara alerta.
- [ ] Existe `chatbot-analytics/lib/*.test.js` (Vitest) y un e2e Playwright de humo, ambos en CI.
- [ ] `WORKING_MODEL.md` refleja: branch protection, ramas cortas desde `main`, DoD con pruebas.

## 6. Restricciones

- Cambios de proceso pasan por su propia spec y PR (dogfooding del modelo).
- No introducir dependencias pesadas: Vitest/Playwright son estándar y ya alineados con el stack.
- `docs/WORKING_MODEL.md` es canónico: cualquier regla nueva se escribe ahí, no en los punteros.

## 7. Riesgos

| Riesgo | Impacto | Mitigación |
|--------|---------|-----------|
| Branch protection frena a un dev solo con prisa | Bajo | Se permite self-approve; el gate es "CI verde", no "otra persona" |
| El trinquete de lint bloquea un fix urgente | Bajo | `N` es el techo actual; un fix no sube avisos. `override` documentado para emergencias |
| Escribir pruebas retroactivas es mucho trabajo | Medio | Solo lógica pura + 1 e2e; lo demás crece por spec, no retroactivo |
| El script de deploy oculta un paso que falla en silencio | Medio | `set -euo pipefail`, healthcheck obligatorio al final, salida detallada |

## 8. Impacto en producción

Ninguno directo sobre el producto. Cambia **cómo** se entrega: menos error humano en el
deploy, imposible saltarse CI, y una red de pruebas/healthchecks que hoy no existe.
Rollback de cada tramo = `git revert` de su PR.
