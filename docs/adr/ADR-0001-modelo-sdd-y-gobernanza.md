# ADR-0001 — Modelo SDD, gobernanza multi-herramienta y pipeline local→PR→prod

- **Estado:** Aceptado
- **Fecha:** 2026-09-07
- **Autor:** equipo Skylab
- **Spec relacionada:** `specs/0001-modelo-de-trabajo-sdd/`

## Contexto

- El desarrollo usa varias herramientas de IA (Claude, Gemini/Antigravity, Copilot) sin un
  proceso común escrito. Cada una improvisa spec, despliegue y documentación.
- Existe un servidor de producción en `http://192.168.8.65:3003/`. Han llegado cambios sin
  paso previo por un entorno local equivalente.
- La documentación está dispersa (`README.md`, `DOCUMENTACION.md`, `PROYECTO_CONTEXTO.md`,
  `# ANTIGRAVITY RULES.txt`, `docs/`), y las lecciones aprendidas no se capturan de forma
  estructurada.
- `CRM_Frontend` es el punto de integración del ecosistema: su configuración es **build-time**
  (`VITE_*` en el `Dockerfile`), por lo que "local vs prod" es un problema de `build.args`,
  no de variables de runtime.
- Ya hay un precedente que funciona: `docs/modulos/ciberseguridad/` con `SPEC-*.md` + `adr/`.

## Decisión

1. **Fuente única de verdad:** `docs/WORKING_MODEL.md`. Cada herramienta de IA recibe un
   archivo-puntero mínimo (`AGENTS.md`, `CLAUDE.md`, `GEMINI.md`,
   `.github/copilot-instructions.md`) que solo remite al canónico. Se prohíbe duplicar
   reglas en los punteros.
2. **SDD a nivel raíz:** carpeta `specs/` con `TEMPLATE/` (`spec.md`, `plan.md`, `tasks.md`).
   Ningún PR sin su `specs/NNNN-slug/`. Se elige la raíz (no `CRM_Frontend/specs/`) porque
   las specs cruzan servicios.
3. **Gobernanza en la raíz, diseño en el frontend:** `WORKING_MODEL.md`, `specs/`,
   `docs/adr/`, `docs/lecciones-aprendidas/`, `CHANGELOG.md` viven en la raíz;
   `design-system.md` y las fichas profundas de UI viven en `CRM_Frontend/docs/`.
4. **Pipeline obligatorio:** local dockerizado en `http://127.0.0.1:3003/` + smoke test →
   PR en GitHub con CI → merge → deploy a `http://192.168.8.65:3003/`.
5. **Entorno local vía override:** `docker-compose.local.yml` que solo redefine el servicio
   `crm-frontend` (`build.args` a `127.0.0.1` y `depends_on` a `service_started`). **No se
   modifica** `docker-compose.yml` base, `Dockerfile` ni `nginx.conf`.
6. **CI:** `.github/workflows/crm-frontend.yml` corre `npm ci` + `npm run lint` +
   `npm run build` en PRs que tocan `CRM_Frontend/**`. Compuerta objetiva, independiente
   de la IA.
7. **Definition of Done** explícito (spec, diseño, lint, build, verificación local, docs,
   changelog, lección) embebido en `WORKING_MODEL.md` y en el `pull_request_template.md`.

## Consecuencias

- **Positivas:** trazabilidad spec→código→PR→prod; comportamiento reproducible entre
  herramientas de IA; producción protegida por una verificación local previa; conocimiento
  acumulado (ADR + lecciones).
- **Negativas / costo asumido:** más ceremonia por tarea (crear spec, actualizar changelog);
  el primer `up` local es pesado (contextos de build grandes de los bots).
- **Impacto en producción:** ninguno en este ADR. Solo se agregan docs, plantillas, un
  override local y CI. El bundle y el flujo de deploy a prod no cambian.

## Alternativas consideradas

| Alternativa | Por qué se descartó |
|-------------|---------------------|
| `specs/` y gobernanza dentro de `CRM_Frontend/` | Deja fuera los cambios de backend que alimentan al frontend; rompe la carga raíz de `AGENTS.md`/`CLAUDE.md` |
| Reescribir `docker-compose.yml` con perfiles `local`/`prod` | Toca un archivo crítico de producción; riesgo alto para beneficio equivalente al de un override |
| Un `.env` de runtime para el frontend | El frontend es estático servido por nginx; no lee env en runtime. Requeriría reingeniería del arranque |
| Reglas embebidas en cada herramienta (`.cursorrules`, prompts) | Deriva garantizada entre herramientas; nada que audite el cumplimiento |
