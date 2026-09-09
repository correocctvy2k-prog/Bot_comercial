# TASKS 0007 — Endurecer el proceso de desarrollo

Referencia: `spec.md` y `plan.md`. **Spec en Borrador — no iniciar hasta secuenciarla**
(va después de las oportunidades de mejora que el equipo aborde primero).

## Tramo 1 — gates que se hacen cumplir solos

- [ ] Branch protection en `main` (require PR + check `lint-build` verde + no force-push).
- [ ] Documentar la regla en `docs/WORKING_MODEL.md` §6.
- [ ] Medir `N` de avisos de lint; `eslint . --max-warnings N`; quitar `continue-on-error` del CI.
- [ ] `ops/deploy-prod.sh` (pull ff-only, check de `.env`, build, healthcheck, rollback impreso).
- [ ] `docs/operacion/despliegue.md` apunta al script.
- [ ] `healthcheck:` en `docker-compose.yml` (servicios con endpoint de salud).
- [ ] `ops/healthcheck.sh` + cron + aviso Telegram.

## Tramo 2 — red de seguridad

- [ ] Vitest en `chatbot-analytics` + tests de `lib/*` (privacidad, modelo, contacto).
- [ ] Playwright en `CRM_Frontend` + 1 e2e de humo (login + recorrido de módulos).
- [ ] CI: job `test` en el workflow del front + workflow `chatbot-analytics.yml`.
- [ ] `docs/WORKING_MODEL.md` §4: DoD incluye "pruebas para lógica nueva".
- [ ] `docs/WORKING_MODEL.md` §1/§6: ramas cortas desde `main`, prohibido ramas sobre ramas.

## Tramo 3 — madurez (planificar al llegar)

- [ ] CI por servicio.
- [ ] Entorno de dev estandarizado (devcontainer / `setup-dev.md`); `node_modules` fuera del árbol.
- [ ] `CODEOWNERS` + plantilla de PR obligatoria.
- [ ] En cada deploy: `git tag` + versión fechada en `CHANGELOG.md`.
- [ ] Secretos: `.env` cifrado (`sops`/`age`) versionado.
- [ ] Fix del build de `comercial-bot` (bullseye EOL).

## Documentación (DoD, por tramo)

- [ ] `CHANGELOG.md` — sección "Infra / Docs".
- [ ] `docs/WORKING_MODEL.md` actualizado con cada regla nueva.
- [ ] ADR si un tramo cambia una decisión de arquitectura del proceso.
- [ ] Lección aprendida si aparece un tropiezo no obvio.

## Cierre

- [ ] Una rama y un PR por tramo. CI verde. Merge. `specs/README.md` índice actualizado.
