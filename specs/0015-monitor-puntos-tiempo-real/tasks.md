# TASKS 0015 — Monitor de puntos en tiempo real (ping) + sync SIISS horario

Referencia: `spec.md` y `plan.md` en esta misma carpeta.
Marcar `[x]` al completar. Mantener actualizado durante toda la tarea.

## Implementación

- [x] `monitor_puntos_wpp.py`: modo `--tipo ping_only` (verificado con `py_compile`, sintaxis ok)
- [x] `src/services/businessHours.service.js` (verificado a mano: bordes 05:30/22:30 y ventana custom)
- [x] `src/worker.js` (resucita `comercial-worker`)
- [x] `cctv-automation-final/platform/business-hours.js` + test (3 tests, 99/99 en el suite)
- [x] `cctv-automation-final/scripts/run-operational-cycle.js`: paso `siissPointsSync`
- [x] `.env.example` de `cctv-automation-final`: documentadas las env nuevas (raíz no tiene `.env.example`, no se crea uno nuevo — fuera de convención existente)

## Verificación

- [x] `cd cctv-automation-final && npm test` — 99/99
- [x] `node -c` sobre `run-operational-cycle.js` y `py_compile` sobre `monitor_puntos_wpp.py` — sintaxis ok
- [x] **Verificado end-to-end con datos reales, directo en el host** (no en Docker — el build
      de `comercial-bot`/`comercial-worker` está roto por un problema previo y ya documentado,
      no relacionado: Debian bullseye EOL, `apt-get` 404 en `deb.debian.org/debian-security`):
      `node src/worker.js` corrió 75s reales, `node-cron` disparó un ciclo dentro del horario
      (17:00 Bogotá), pingueó los 370 puntos reales en 11s, `{"ok":true,"scanned":370,
      "active":324}`, y registró 55 transiciones reales en `point_activity_log`. Confirma
      cron + gate de horario + spawn de Python + parseo + escritura en Supabase, todo real.
- [ ] Docker local: `comercial-worker` arranca sin crashear dentro del contenedor — **sigue
      bloqueado** por el build roto de la imagen (independiente de esta spec, ver arriba)
- [ ] Docker local: bot de WhatsApp responde igual que antes (no se tocó su código; sin poder
      levantar el contenedor tampoco se pudo repetir esta prueba en Docker)
- [ ] `operational-cycle.jsonl`: `siissPointsSync` aparece y respeta la cadencia de 60 min (no
      se pudo correr `run-operational-cycle.js` completo — requiere IMAP/Trello configurados;
      la lógica del paso nuevo es idéntica en forma a `crmPointsSync`, ya probado en spec 0012)

## Documentación (Definition of Done)

- [x] `CHANGELOG.md` — sección "No publicado"
- [x] Ficha de módulo (`docs/modulos/bot-comercial.md`, corrige la referencia a `worker.js`)
- [x] ADR — no aplica (reutiliza patrones ya establecidos)
- [ ] Lección aprendida sobre `comercial-worker` roto sin detectar — pendiente de decidir con el usuario

## Cierre

- [ ] Mergear primero el PR de `feat/0014-siiss-sync-directo` (spec.md §7)
- [ ] PR de esta spec abierto y enlazado en `spec.md`
- [ ] CI verde
- [ ] Merge a `main`
- [ ] Desplegado y verificado en `.65`
