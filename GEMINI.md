# GEMINI.md

Puntero al modelo de trabajo canónico para Gemini CLI / Antigravity. **No dupliques reglas aquí.**

> Antes de proponer o escribir cambios, lee y cumple
> [`docs/WORKING_MODEL.md`](docs/WORKING_MODEL.md). Es idéntico para cualquier
> herramienta de IA (ver `AGENTS.md`).

Recordatorios rápidos:

- **SDD**: crea/actualiza `specs/NNNN-slug/` antes de tocar código.
- **Producto norte = `CRM_Frontend`**; sigue `CRM_Frontend/docs/design-system.md`.
- **Verifica en Docker local** `http://127.0.0.1:3003/` antes de dar algo por hecho.
- Rama por tarea, `git add` con rutas explícitas, nunca commit directo a `main`.
- Actualiza `CHANGELOG.md` + ficha de módulo + lección aprendida en el mismo PR.
- Ciclo de memoria (`km_agent_memory`, Supabase `qqavaomzxxcwpptfrsti`): se mantiene —
  ver sección 7 de `docs/WORKING_MODEL.md` y `# ANTIGRAVITY RULES.txt`.
