# TASKS 0017 — Reconciliar inventario KSC (155 vs 175)

Referencia: `spec.md` y `plan.md` en esta misma carpeta.

## Implementación

- [x] `Monitor-KSC-HardwareInventory.ps1`: `Update-InventoryAggregates` (nueva,
      recalcula `TotalDevices`/`OperatingSystems`/`Virtualization`/`LastSeen`
      desde `$Inventory.Devices`).
- [x] `Parse-HardwareInventory` usa `Update-InventoryAggregates` en vez de
      calcular los agregados inline (mismo resultado para los 155 originales,
      sin cambio de comportamiento ahí).
- [x] `Merge-ProtectionStatusIntoInventory`: agrega como filas nuevas los
      dispositivos de `ProtectionStatus` sin match, con `IsVirtual=$null`,
      `VisibilityBucket="SinDatos"`, `OsBucket` real desde su `OperatingSystem`.
      Llama `Update-InventoryAggregates` al final.
- [x] `New-HardwareInventoryHtml`: refleja `Unclassified` en la tabla de
      virtualización, nueva columna "Agregados" en la tabla de cobertura IP.
- [x] `CRM_Frontend/src/pages/Monitoring.jsx` (`KscHardwareInventoryPanel`):
      `unclassifiedCount`, `physicalPct`/`vmPct` sobre `total` (no `100 -
      vmPct`), nueva categoría en `deviceTypePoints`, nota "+N desde Estado de
      la protección" junto a la fuente.
- [x] `VisibilityBarChart`: tercera tarjeta "Sin clasificar" cuando
      `unclassifiedCount > 0`.

## Verificación

- [x] Simulación en Node contra `data/monitoring/ksc-hardware/latest.json` real
      de `.65` (leído por SSH), replicando la lógica de merge — confirmado
      `TotalDevices === 175`, suma de OS/Virtualización/LastSeen exactamente
      175 en los tres casos.
- [x] `cd CRM_Frontend && npm run lint` — 8 errores, todos preexistentes
      (confirmado comparando contra la versión del archivo sin estos cambios
      vía `git stash`, mismo conteo antes y después).
- [x] `cd CRM_Frontend && npm run build` — verde.
- [x] Docker local: `crm-frontend` reconstruido, bundle confirmado con "Sin
      clasificar"/"desde Estado de la protección", `/api/cybersecurity/towers`
      y `/api/cctv/health` sin regresión. **No verificado visualmente en
      navegador** (sin `comercial-bot` corriendo localmente — es el proceso
      real de WhatsApp, no se arrancó aquí; sin chromium-cli/Playwright en este
      entorno tampoco) — riesgo residual bajo, mismo patrón ya usado para otros
      cambios de este módulo.
- [ ] Verificado en `http://192.168.8.65:3003/monitoring` tras el deploy real.

## Documentación (Definition of Done)

- [x] `CHANGELOG.md` — sección "No publicado"
- [x] Ficha de módulo — `CRM_Frontend/docs/monitoreo-it/README.md`
- [x] Lección aprendida — no aplica (el hallazgo ya quedó documentado en la
      spec y el changelog; no es un bug de proceso repetible, es un dato real
      que faltaba)

## Pendiente separado (no bloquea esta spec)

- [ ] Portátiles: el usuario revisa la consola KSC para confirmar si existe un
      reporte/columna exportable con tipo de equipo (chasis/portátil vs
      escritorio). Sin esa respuesta, no se implementa (spec §3/§4).

## Cierre

- [ ] PR abierto y enlazado en `spec.md`
- [ ] Merge a `main`
- [ ] `.ps1` actualizado copiado y corrido en `SERV-KSC` (el usuario)
- [ ] Desplegado y verificado en `http://192.168.8.65:3003/`
