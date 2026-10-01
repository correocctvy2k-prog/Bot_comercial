# SPEC 0017 — Monitoreo IT: reconciliar el inventario KSC (155 vs 175) y preparar el desglose de portátiles

- **Estado:** Implementado y verificado en local (Docker + simulación contra
  datos reales de `.65`), pendiente de PR/merge y de que el usuario corra el
  `.ps1` actualizado en `SERV-KSC`
- **Autor:** Claude (a partir del hallazgo del usuario, 2026-10-01)
- **Fecha:** 2026-10-01
- **Módulos afectados:** `CRM_Frontend/Monitoreo/KSC/Monitor-KSC-HardwareInventory.ps1` (corre en `SERV-KSC`, fuera de este repo en ejecución), `CRM_Frontend/src/pages/Monitoring.jsx` (dashboard `/monitoring`).
- **Rama:** `fix/0017-ksc-inventario-reconciliacion`
- **PR:** —

## 1. Problema / oportunidad

El panel "Inventario KSC" del módulo Monitoreo IT muestra dos conteos distintos de
dispositivos en la misma pantalla: el KPI "Dispositivos" y el donut "Distribución"
(Windows 10/11/Server) muestran **155**, mientras que el donut "Versiones Kaspersky"
muestra **175**. El usuario reportó la inconsistencia (captura adjunta,
2026-10-01) y señaló que 175 le parece el dato más confiable, porque 155 "no
cambia".

**Investigado con datos reales** (payload `KSC-HARDWARE` vivo en `.65`,
`2026-09-30 09:00:04`):
- `HardwareInventory.TotalDevices` = **155** — viene de "Informe de hardware", la
  única fuente del KPI/donut de distribución.
- `VirusDatabaseUsage.TotalDevices` = **175** — viene de "Informe de uso de bases
  de datos antivirus" (alimenta el donut "Versiones Kaspersky").
- `ProtectionStatus.TotalDevices` = **175** (175/175 con IP) — viene de "Informe
  del estado de la protección" (el mismo reporte que `fix/ciberseguridad-ksc-ip-
  persistencia` ya identificó como el único con cobertura del 100% de equipos
  administrados).
- `IPMergeSummary.UnmatchedInHardware` ya lista, **por nombre**, los 20
  dispositivos reales que existen en los otros dos reportes pero faltan por
  completo en "Informe de hardware" (`011256-CAJA1AMA`, `14502-BCP1`, `SOPORTE`,
  etc.) — 175 − 155 = 20, exacto.

**Conclusión verificada, no solo intuida:** "Informe de hardware" subcuenta 20
equipos reales que sí están protegidos y visibles en KSC. No es ruido de datos ni
un problema de parseo — son dispositivos ausentes de ese reporte específico.

Además, el usuario pidió discriminar el número de **computadores portátiles**
reportados por la consola KSC. Investigado: **ningún reporte que ya consumimos
(Informe de hardware / Informe de uso de BD antivirus / Informe del estado de la
protección) trae un campo de tipo de equipo (portátil/escritorio/chasis)** —
confirmado revisando `Monitor-KSC-HardwareInventory.ps1` y los fixtures de
`cybersecurity/`. No se puede derivar sin inventar un criterio.

## 2. Objetivo

Que "Inventario KSC" muestre un solo número de dispositivos consistente en todo
el panel (155 → 175, usando datos ya disponibles, sin inventar ninguno), y dejar
preparado (no necesariamente resuelto en esta spec) el desglose de portátiles.

## 3. Alcance

- `Monitor-KSC-HardwareInventory.ps1`: `Merge-ProtectionStatusIntoInventory` ya no
  solo enriquece los 155 dispositivos existentes con IP/NetBIOS/Estado — también
  **agrega como filas nuevas** los dispositivos de "Informe del estado de la
  protección" que no tienen match en "Informe de hardware" (los 20 reales),
  usando el `Sistema operativo` que ese mismo reporte ya trae para ellos.
  Recalcular `TotalDevices`/`OperatingSystems`/`Virtualization`/`LastSeen` sobre
  el inventario ya unido, no solo sobre los 155 originales.
- Los dispositivos agregados así **no** tienen dato de virtualización (el
  "Informe de hardware" nunca los tuvo) ni de última visibilidad — se marcan
  honestamente como "Sin clasificar"/"Sin datos", nunca se asume físico ni
  reciente por defecto.
- `Monitoring.jsx` (`KscHardwareInventoryPanel`): mostrar la nueva categoría "Sin
  clasificar" en el desglose de virtualización en vez de absorberla
  silenciosamente en "Físicos" (el cálculo actual de `physicalPct = 100 - vmPct`
  asumiría eso si no se corrige).
- Investigación (no implementación todavía) de dónde sacar "portátiles": el
  usuario revisa la consola KSC para confirmar si existe un reporte/columna
  exportable con tipo de equipo, igual que se hizo con la IP.

## 4. No-objetivos

- No se implementa el desglose de portátiles en esta spec — queda documentado
  como pendiente, bloqueado en la respuesta del usuario sobre qué reporte de KSC
  lo trae (§3).
- No se cambia la fuente de verdad de IP (`fix/ciberseguridad-ksc-ip-
  persistencia`, ya en producción) — esta spec es ortogonal, solo toca el conteo
  total y el desglose de SO/virtualización.
- No se toca `cybersecurity/src/ksc-importer.js` — ya maneja de forma defensiva
  dispositivos con campos nulos (verificado leyendo el código), no requiere
  cambios para los 20 dispositivos nuevos.

## 5. Criterios de aceptación

- [x] El KPI "Dispositivos" y el donut "Distribución" muestran 175 (o el total
      real vigente al momento del deploy), igual que "Versiones Kaspersky" —
      confirmado por simulación contra el payload real de `.65`.
- [x] Los 20 dispositivos agregados aparecen en el desglose de SO (Windows
      10/11/Server/Otros) usando el dato real de "Informe del estado de la
      protección".
- [x] El desglose de virtualización muestra una categoría honesta "Sin
      clasificar" para esos 20, sin inflar "Físicos".
- [x] Verificado contra el payload real (`data/monitoring/ksc-hardware/latest.json`
      en `.65`), no solo con datos sintéticos.
- [x] `cd CRM_Frontend && npm run lint` + `npm run build` verdes, sin errores
      nuevos.
- [ ] Verificado en `http://192.168.8.65:3003/monitoring` tras el deploy real
      (pendiente: requiere que el `.ps1` corra en `SERV-KSC` primero).

## 6. Restricciones de arquitectura y diseño

- `Monitor-KSC-HardwareInventory.ps1` corre en `SERV-KSC`, fuera del alcance de
  Docker/`.65` — el despliegue de este archivo lo hace el usuario copiándolo al
  servidor Windows, no Claude.
- Ningún dato se infiere o se inventa (p.ej. no asumir "físico" por defecto para
  los dispositivos sin dato de virtualización) — mismo principio ya aplicado en
  el resto del módulo Ciberseguridad.

## 7. Riesgos

| Riesgo | Impacto | Mitigación |
|--------|---------|-----------|
| El usuario no puede re-ejecutar el PS1 en `SERV-KSC` de inmediato para verificar con datos reales frescos | Medio | Verificar primero contra el payload ya capturado en `.65` (`data/monitoring/ksc-hardware/latest.json`), reproduciendo la lógica fuera de PowerShell si hace falta, antes de pedir una corrida real. |
| El campo `IsVirtual` nulo (tri-state) rompe algún consumidor que asuma booleano | Bajo | Verificado: `ksc-importer.js` ya usa `=== true`, no `!== false` — nulo se trata igual que `false` ahí, degradación segura, no excepción. |

## 8. Impacto en producción

Cambia el número mostrado en el dashboard de Monitoreo IT (155 → 175) y agrega una
categoría nueva de virtualización. No cambia ningún endpoint de API ni esquema de
base de datos. Rollback: revertir el commit de `Monitor-KSC-HardwareInventory.ps1`
en `SERV-KSC` (vuelve a enviar solo 155) y el commit del frontend.
