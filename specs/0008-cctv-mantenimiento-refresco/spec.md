# SPEC 0008 — CCTV/Mantenimiento: la "ventana de ejecución" no refleja cambios recientes de Trello

- **Estado:** Borrador (pendiente de investigación — se aborda **después** de `specs/0009`)
- **Autor:** equipo Skylab (@jbeltran)
- **Fecha:** 2026-09-09
- **Módulos afectados:** `cctv-automation-final` (`api/server.js`, `platform/import-trello-*`,
  `scripts/refresh-trello-maintenance-cache.js`, `scripts/run-operational-cycle.js`);
  `CRM_Frontend/src/pages/CctvModule.jsx` (vista `RealMaintenance`).
- **Rama:** `fix/0008-cctv-mantenimiento-refresco` (cuando se ejecute)

## 1. Problema (reportado)

En el local, en Seguridad Electrónica / Mantenimiento: cuando el usuario actualiza una tarjeta
en Trello, **el cambio se ve en el dashboard** ("Ritmo de atención" / "Centro de actividad
técnica") **pero NO en la ventana de "Ejecución del programa"** de la vista de Mantenimiento.

## 2. Causa probable (hallazgo inicial, a confirmar)

- La vista **`RealMaintenance`** ("Ejecución del programa", `CctvModule.jsx`) consume
  `GET /api/cctv/maintenance`, que en `cctv-automation-final/api/server.js` (~línea 389)
  devuelve `mode: 'CANONICAL_SNAPSHOT'` con `cacheUpdatedAt = run.completed_at`: es una
  **instantánea canónica en BD** que sólo se regenera al correr
  `scripts/refresh-trello-maintenance-cache.js`, disparado por `run-operational-cycle.js` sólo
  cuando `maintenanceSchedule.due` (ciclo programado).
- El **dashboard de soporte** lee `support_cards WHERE source_system = 'TRELLO_SUPPORT'`
  (`server.js` ~línea 394) con `syncedAt`, un sync distinto y más frecuente.
- Resultado: editar una tarjeta se refleja pronto en el sync de soporte, pero la instantánea
  de mantenimiento queda rezagada hasta el siguiente ciclo.

## 3. Objetivo

Que la ventana de "Ejecución del programa" muestre los cambios de Trello con una latencia
aceptable (umbral a definir), sin romper el modelo de "instantánea canónica protegida"
(Trello/Excel no se modifican; ver `CctvModule` "Instantánea canónica · Trello protegido").

## 4. Alcance (a detallar tras investigar)

Opciones candidatas — elegir en `plan.md`:
1. **Refresco bajo demanda:** endpoint `POST /api/cctv/maintenance/refresh` + botón
   "Actualizar" en la vista (como el `refresh` de `chatbot-analytics`). Corre el import y
   regenera el snapshot.
2. **Acortar el ciclo:** bajar el intervalo del refresh de mantenimiento (coste: llamadas a
   la API de Trello).
3. **Lectura más fresca:** que `/api/cctv/maintenance` combine el snapshot canónico con el
   último sync incremental de tarjetas para los campos volátiles (estado, due, fecha).
4. **Webhook de Trello** hacia `cctv-api` que invalide/regenere el snapshot al cambiar una
   tarjeta (lo más "tiempo real", más trabajo).

## 5. Criterios de aceptación (borrador)

- [ ] Tras editar una tarjeta en Trello, el cambio aparece en "Ejecución del programa" en
      ≤ _(umbral a definir)_ sin acción manual, o con un botón "Actualizar" explícito.
- [ ] La instantánea canónica sigue siendo la fuente de verdad; Trello/Excel intactos.
- [ ] Sin degradar el rendimiento ni exceder límites de la API de Trello.
- [ ] Verificado en local y en `192.168.8.65` (donde corre el ciclo real).

## 6. No-objetivos

- No rediseñar la vista de Mantenimiento (si acaso, un botón "Actualizar").
- No cambiar el esquema de la BD de `cctv-automation-final` sin ADR.
- No tocar el bot ni el dashboard de soporte (ya refresca bien).

## 7. Pendiente antes de `plan.md`

- Confirmar cómo/cada cuánto corre `run-operational-cycle.js` en el `.65` (cron, systemd, PM2…).
- Medir la latencia real actual (cuánto tarda hoy en verse un cambio).
- Ver si ya existe un endpoint de refresco parcial o un webhook.
- Decidir el umbral aceptable con el usuario.
