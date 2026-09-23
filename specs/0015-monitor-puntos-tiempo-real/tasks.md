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
- [x] **Fix del `Dockerfile` (Debian bullseye EOL) verificado con build real**: `docker compose
      up -d --build comercial-bot comercial-worker` construyó ambas imágenes sin error
      (`apt-get install` completo, incluye `iputils-ping`).
- [x] Docker local: `comercial-worker` arranca sin crashear dentro del contenedor — logs reales:
      `[points-ping-worker] iniciado...` y, un minuto después,
      `{"ok":true,"scanned":370,"active":258,"duration":19}` (variación de `active` vs. la
      corrida en host es normal: pasó más tiempo, más puntos habían cerrado).
- [x] Docker local: `comercial-bot` sigue funcionando igual — logs del heartbeat de
      infraestructura (`ping.service.js`) corriendo normal, sin cambios de comportamiento.
      Contenedores de prueba detenidos y eliminados después de verificar (no se dejaron
      corriendo junto a la instancia real de WhatsApp, para no duplicar procesamiento).
- [ ] `operational-cycle.jsonl`: `siissPointsSync` aparece y respeta la cadencia de 60 min — no
      se pudo correr `run-operational-cycle.js` completo (requiere IMAP/Trello configurados);
      la lógica del paso nuevo es idéntica en forma a `crmPointsSync`, ya probado en spec 0012

## Documentación (Definition of Done)

- [x] `CHANGELOG.md` — sección "No publicado"
- [x] Ficha de módulo (`docs/modulos/bot-comercial.md`, corrige la referencia a `worker.js`)
- [x] ADR — no aplica (reutiliza patrones ya establecidos)
- [ ] Lección aprendida sobre `comercial-worker` roto sin detectar — pendiente de decidir con el usuario

## Cierre

- [x] Mergear primero el PR de `feat/0014-siiss-sync-directo` (spec.md §7) — mergeado 2026-09-23 (PR #10)
- [ ] PR de esta spec abierto y enlazado en `spec.md`
- [ ] CI verde
- [ ] Merge a `main`
- [ ] Desplegado y verificado en `.65`
