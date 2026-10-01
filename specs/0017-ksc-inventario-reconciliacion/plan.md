# PLAN 0017 — Reconciliar el inventario KSC (155 vs 175)

Referencia: `spec.md` en esta misma carpeta.

## Enfoque técnico

El PS1 ya hace `Merge-ProtectionStatusIntoInventory` para enriquecer los 155
dispositivos de "Informe de hardware" con IP/NetBIOS/Estado desde "Informe del
estado de la protección" — pero descarta los 20 dispositivos de ese segundo
reporte que no encuentran match (`$lookup` queda con ellos, nunca se usan). La
solución es dejar de descartarlos: agregarlos como filas nuevas de `$Inventory.
Devices` (con los campos que sí trae ese reporte: Nombre, SO, IP, NetBIOS,
Estado) y recalcular los agregados (`TotalDevices`/`OperatingSystems`/
`Virtualization`/`LastSeen`) sobre el arreglo completo, no solo sobre los 155
originales.

Alternativa descartada: cambiar el frontend para que use `ProtectionStatus.
TotalDevices` (175) como el número a mostrar, dejando el desglose de SO
desactualizado en 155. Se descarta porque dejaría el donut de SO inconsistente
con el KPI de nuevo, solo que al revés.

## Archivos a tocar

| Archivo | Cambio | Riesgo |
|---------|--------|--------|
| `CRM_Frontend/Monitoreo/KSC/Monitor-KSC-HardwareInventory.ps1` | `Merge-ProtectionStatusIntoInventory` agrega dispositivos sin match como filas nuevas (tri-state `IsVirtual=$null`, `VisibilityBucket="SinDatos"`); nueva función `Update-InventoryAggregates` recalcula `TotalDevices`/`OperatingSystems`/`Virtualization`/`LastSeen` desde `$Inventory.Devices`, llamada al final de `Parse-HardwareInventory` y de nuevo tras el merge | medio (corre en SERV-KSC, fuera de Docker; requiere el usuario para desplegar y correr) |
| `CRM_Frontend/src/pages/Monitoring.jsx` | `KscHardwareInventoryPanel`: nueva categoría "Sin clasificar" en virtualización, `physicalPct`/`vmPct` calculados sobre `total` en vez de `100 - vmPct`; `VisibilityBarChart` recibe y muestra el nuevo conteo | bajo (solo lectura de un campo nuevo, con fallback `|| 0`) |

## Contratos de datos / API

`POST /api/monitoring/upload` (service `KSC-HARDWARE`): el payload
`Kaspersky.HardwareInventory` gana:
- `TotalDevices`: ahora puede ser mayor que antes (une ambos reportes).
- `Virtualization.Unclassified` (nuevo campo, entero) — dispositivos sin dato de
  virtualización. `VirtualMachines`/`PhysicalDevices` ya no sumaban siempre
  `TotalDevices`; con este cambio `VirtualMachines + PhysicalDevices +
  Unclassified === TotalDevices`, siempre.
- Cada entrada de `Devices[]` agregada desde "Estado de la protección" tiene
  `Provider`, `LastSeen`, `LastSeenDays` en `$null` e `IsVirtual` en `$null`
  (antes siempre `$true`/`$false`) — compatibilidad hacia atrás: cualquier
  consumidor que compare `=== $true`/`=== true` (como `ksc-importer.js`) sigue
  funcionando sin cambios.

## Diseño / UI

Sin componentes nuevos. `VisibilityBarChart` pasa de un grid de 2 columnas
(Virtuales/Físicos) a 2 o 3 según si `unclassifiedCount > 0` — mismo patrón ya
usado en `osSegments`/`deviceTypePoints` (`.filter(item => item.value > 0)`).

## Plan de rollout

1. Editar y probar el PS1 localmente contra el payload real ya capturado en
   `.65` (`data/monitoring/ksc-hardware/latest.json`), replicando la lógica de
   merge fuera de PowerShell (Node) para verificar los números antes de pedirle
   al usuario que lo corra en `SERV-KSC` — no hay entorno PowerShell en esta
   máquina para correrlo directamente.
2. Editar `Monitoring.jsx`, verificar `npm run lint`/`build`.
3. Rama corta (`fix/0017-...`), PR, merge.
4. El usuario copia el `.ps1` actualizado a `SERV-KSC` y lo corre (reemplaza al
   archivo que ya está desplegado ahí, mismo patrón que `fix/ciberseguridad-ksc-
   ip-persistencia`).
5. Deploy del frontend en `.65` (`crm-frontend` rebuild + restart).
6. Verificar en `http://192.168.8.65:3003/monitoring` con el próximo envío real.

## Plan de rollback

Revertir el commit del `.ps1` en `SERV-KSC` (vuelve a enviar 155 sin los 20
agregados) y el commit del frontend en `.65` (rebuild del commit anterior).

## Verificación

- Simulación en Node del merge contra el payload real de `.65`, comparando
  `TotalDevices` resultante contra 175 y el desglose de SO contra lo que trae
  `ProtectionStatus.Devices[].OperatingSystem` para los 20 agregados.
- `cd CRM_Frontend && npm run lint && npm run build`.
- Verificación visual en `http://192.168.8.65:3003/monitoring` tras el próximo
  envío real desde `SERV-KSC`.
