# Modelo de Trabajo — Ecosistema Skylab / CRM_Frontend

> **Documento canónico.** Cualquier persona o herramienta de IA (Claude, Gemini/Antigravity,
> GitHub Copilot, Cursor, etc.) debe leer y cumplir este documento antes de proponer o
> escribir cambios. Los archivos `AGENTS.md`, `CLAUDE.md`, `GEMINI.md` y
> `.github/copilot-instructions.md` solo apuntan aquí.

Última actualización: 2026-09-07 · Owner: equipo Skylab · Repo: `correocctvy2k-prog/Bot_comercial`

---

## 0. Los 5 pilares

| # | Pilar | Qué significa en la práctica |
|---|-------|------------------------------|
| 1 | **SDD (Spec-Driven Development)** | Nada se implementa sin una spec previa en `specs/NNNN-slug/`. El código es consecuencia de la spec, no al revés. |
| 2 | **Producto norte = CRM_Frontend** | Todo cambio se piensa integrado al CRM_Frontend global. Se respeta la arquitectura base y el sistema de diseño (`CRM_Frontend/docs/design-system.md`). |
| 3 | **Pipeline local → PR → producción** | Orden obligatorio: build dockerizado local en `http://127.0.0.1:3003/` y verificación → commit en rama + PR en GitHub → promoción a `http://192.168.8.65:3003/`. |
| 4 | **Documentación de avances obligatoria** | En el mismo PR: `CHANGELOG.md`, ficha de módulo, ADR si hubo decisión de arquitectura, y lección aprendida si hubo un tropiezo no obvio. |
| 5 | **Agnóstico de herramienta** | Este documento manda. Ninguna IA usa reglas propias que lo contradigan. |

---

## 1. SDD — cómo se trabaja una tarea

1. **Crear la spec.** Copiar `specs/TEMPLATE/` a `specs/NNNN-slug/` (NNNN = siguiente correlativo de 4 dígitos).
   - `spec.md`: problema, alcance, criterios de aceptación, **no-objetivos**, módulos afectados, restricciones de arquitectura/diseño.
   - `plan.md`: enfoque técnico, archivos a tocar, contratos de datos/API, riesgos, plan de rollout y rollback.
   - `tasks.md`: checklist de tareas atómicas con estado (`[ ]` / `[x]`).
2. **Validar la spec** con quien pidió el cambio (o dejar constancia escrita si es menor).
3. **Rama** `feat/NNNN-slug` (o `fix/…`, `docs/…`, `chore/…`).
4. **Implementar** siguiendo `plan.md`, marcando `tasks.md`.
5. **Verificar** contra el Definition of Done (§4).
6. **PR** en GitHub enlazando la spec. Merge a `main` solo con CI verde y DoD cumplido.
7. **Promover a producción** (§3).

Fix trivial (typo, estilo, one-liner sin cambio de comportamiento): basta un `spec.md` ligero de 5 líneas.

---

## 2. Arquitectura base (no romper)

- **CRM_Frontend** es una SPA **React 19 + Vite 7 + Tailwind 3 + shadcn/ui (Radix) + Recharts + Leaflet + socket.io-client + Supabase-js**. Se compila a estáticos y se sirve con **nginx** en Docker. Host `3003` → contenedor `80`.
- **Toda la configuración es build-time** (`VITE_*` inyectadas como `ARG`/`ENV` en el `Dockerfile` antes de `npm run build`). No hay configuración en runtime. Cambiar de entorno = **rebuild con otros `build.args`** (ver `docker-compose.local.yml`). → Lección `LL-0001`.
- CRM_Frontend es el **agregador** del ecosistema: consume 7 de los 10 servicios del `docker-compose.yml` + Supabase. Mapa completo en `docs/modulos/crm-frontend.md`.
- **Prohibido sin ADR previo:** cambiar el stack, el modelo de config build-time, el esquema de rutas de `nginx.conf`, los puertos publicados, o el `docker-compose.yml` base.
- **Nunca** versionar `.env` / `.env.local` / claves. Solo `.env.example`.

---

## 3. Pipeline de despliegue (orden obligatorio)

Detalle operativo en **`docs/operacion/despliegue-local.md`** (local) y `docs/operacion/despliegue.md` (VPS/prod).

1. **Local dockerizado.**
   `docker compose -f docker-compose.yml -f docker-compose.local.yml up -d --build crm-frontend`
   Servido en `http://127.0.0.1:3003/`.
2. **Smoke test local** (checklist en `docs/operacion/despliegue-local.md`).
3. **Commit** en rama + **push** + **PR** en GitHub. CI (`.github/workflows/crm-frontend.yml`) debe pasar.
4. **Merge a `main`** tras revisión.
5. **Producción:** en el servidor `192.168.8.65`, `git pull origin main` + `docker compose up -d --build crm-frontend`. Verificar `http://192.168.8.65:3003/`.

Nunca se despliega a producción algo que no pasó por (1) y (2).

---

## 4. Definition of Done

Un cambio está terminado cuando **todo** esto es cierto:

- [ ] Existe `specs/NNNN-slug/` enlazada en el PR.
- [ ] Respeta `CRM_Frontend/docs/design-system.md` y la arquitectura base (§2).
- [ ] `cd CRM_Frontend && npm run lint` sin errores.
- [ ] `cd CRM_Frontend && npm run build` en verde.
- [ ] Verificado a mano en `http://127.0.0.1:3003/` (Docker local), no solo en `npm run dev`.
- [ ] `CHANGELOG.md` actualizado (sección `No publicado`).
- [ ] Ficha de módulo actualizada (`docs/modulos/…`).
- [ ] ADR creado si hubo decisión de arquitectura (`docs/adr/`).
- [ ] Lección aprendida registrada si hubo un tropiezo no obvio (`docs/lecciones-aprendidas/`).
- [ ] PR abierto en GitHub; sin commits directos a `main`.

---

## 5. Sistema de diseño (resumen; fuente: `CRM_Frontend/docs/design-system.md`)

- Superficie estándar de panel: `bg-card/60 backdrop-blur-xl border border-border/80 rounded-2xl shadow-sm`.
- Radios: `rounded-xl` controles, `rounded-2xl` paneles, `rounded-3xl` contenedores de cabecera.
- Tipografía: títulos `text-lg font-black tracking-tight`; micro-etiquetas `text-[11px] font-extrabold uppercase tracking-wider text-muted-foreground`.
- Icon-badge: `w-10 h-10 rounded-2xl bg-gradient-to-tr from-<c1> to-<c2> flex items-center justify-center text-white font-black shadow-inner`.
- **Compatibilidad de tema:** usar tokens (`bg-card`, `bg-muted`, `border-border`, `text-foreground`, `text-muted-foreground`, `text-primary`). **Prohibido** `bg-white/5`, `border-white/10` y colores crudos para superficies/bordes.
- Sin landing pages para herramientas internas. Dashboards compactos, escaneables, útiles en una pantalla.

---

## 6. Git

- Ramas: `feat/NNNN-slug`, `fix/slug`, `docs/slug`, `chore/slug`. Nunca push directo a `main`.
- Conventional Commits: `tipo(scope): descripción` (`feat`, `fix`, `docs`, `chore`, `refactor`, `style`, `test`).
- 1 spec → 1 rama → 1 PR.
- `git add` con rutas explícitas. Nunca `git add -A` a ciegas.
- El escaneo de secretos de GitHub está activo: nunca `--amend` sobre un commit con secreto; usar `git rm --cached` + `reset`.

---

## 7. Continuidad entre sesiones (memoria de agente)

Regla heredada de `# ANTIGRAVITY RULES.txt`, se mantiene:

- Ninguna sesión empieza sin leer este documento y la spec activa.
- Ninguna sesión termina sin dejar rastro: `tasks.md` actualizado y, si aplica, entrada en `km_agent_memory` (Supabase `qqavaomzxxcwpptfrsti`) y/o lección aprendida.
