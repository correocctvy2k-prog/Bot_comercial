# PLAN 0007 — Endurecer el proceso de desarrollo

Referencia: `spec.md`. **Plan de alto nivel** — se detalla al programar cada tramo.

## Enfoque

Tandas pequeñas e independientes, cada una su PR. Orden = el de los tramos de la spec §3.
Prioridad: primero lo que **hace cumplir los gates solos** (Tramo 1), luego la **red de
seguridad** (Tramo 2), luego madurez (Tramo 3). No se toca el producto.

## Tramo 1 — detalle tentativo

| Ítem | Cómo | Archivos |
|------|------|----------|
| Branch protection | GitHub Settings → Branches → rule para `main`: require PR, require status check `lint-build`, no force-push, no bypass. | (config GitHub, no versionable) + nota en `docs/WORKING_MODEL.md` §6 |
| Lint con trinquete | Medir `N` (`npm run lint` → contar). Quitar `continue-on-error`. `lint` script → `eslint . --max-warnings N`. | `.github/workflows/crm-frontend.yml`, `CRM_Frontend/package.json` |
| `ops/deploy-prod.sh` | `set -euo pipefail`; params = servicios; `git pull --ff-only`; comprobar `test -f` de cada `.env` requerido; `docker compose up -d --build "$@"`; loop de `curl -fsS .../health`; `echo` del rollback. | `ops/deploy-prod.sh`, `docs/operacion/despliegue.md` (apuntar al script) |
| Healthchecks | `healthcheck:` en `docker-compose.yml` para `crm-frontend` (curl a `/`), `chatbot-analytics` (`/api/oskitar/health`), etc. `ops/healthcheck.sh` + entrada de cron + webhook Telegram. | `docker-compose.yml`, `ops/healthcheck.sh` |

## Tramo 2 — detalle tentativo

- **Vitest** en `chatbot-analytics`: `npm i -D vitest`; `test/` con casos sobre logs de muestra
  (`data/*.jsonl`, `conversations.sample.log`); cubrir `maskPhone/maskId/resolvePeer`,
  `buildModel` KPIs/embudo, `buildBettyModel`, `buildOskitarContact/buildBettyContact`.
- **Playwright** en `CRM_Frontend`: `npm i -D @playwright/test`; 1 spec que hace login (usuario
  de prueba en Supabase o mock) y visita `/bots/*`, `/contacts`, `/monitoring`, `/users`,
  comprobando que no hay error de render ni consola.
- CI: nuevo job `test` en el workflow del front; nuevo workflow `chatbot-analytics.yml`.
- `docs/WORKING_MODEL.md` §4 (DoD): añadir "pruebas para la lógica nueva".

## Tramo 3

Se planifica cuando se llegue. Cada ítem (CI por servicio, devcontainer, `CODEOWNERS`,
tags + CHANGELOG fechado, secretos con `sops`, fix `comercial-bot`) es su propia tanda o
mini-spec.

## Rollout / rollback

Cada tramo: rama corta desde `main` → PR → CI verde → merge. Rollback = `git revert` del PR.
Branch protection se activa/desactiva desde la UI de GitHub sin tocar el repo.

## Verificación

- Intentar `git push origin main` directo → **rechazado**.
- Abrir un PR con un `console.log` que suba el lint → CI **rojo**.
- `bash ops/deploy-prod.sh crm-frontend` en un entorno de staging → despliega y reporta salud.
- `docker ps` muestra `(healthy)`; parar un servicio → llega alerta.
- `npm test` verde en `chatbot-analytics` y `CRM_Frontend`; ambos jobs visibles en el PR.
