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
- [ ] Docker local: `comercial-worker` arranca sin crashear — **bloqueado, Docker Desktop caído en la máquina de desarrollo desde antes de empezar esta spec**
- [ ] Docker local: ciclo de ping corre dentro del horario, se omite fuera de él
- [ ] Docker local: bot de WhatsApp responde igual que antes
- [ ] `operational-cycle.jsonl`: `siissPointsSync` aparece y respeta la cadencia de 60 min

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
