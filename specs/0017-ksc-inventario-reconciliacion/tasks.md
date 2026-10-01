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

## Incremento — portátiles (2026-10-01, mismo día)

El usuario confirmó (revisando la consola KSC) que "Informe del estado de la
protección" trae columna "Grupo", y los portátiles están agrupados
literalmente como "Portátiles" — no hacía falta ningún reporte nuevo.

- [x] `Parse-ProtectionStatus`: captura `Grupo` (`Get-FirstRecordValue -Keys
      @("Grupo")`).
- [x] `Merge-ProtectionStatusIntoInventory`: propaga `Group` a los
      dispositivos emparejados y a los agregados.
- [x] `Update-InventoryAggregates`: nuevo `Inventory.DeviceTypes`
      (`Portables`/`NoPortables`/`SinDato`), `$_.Group -match 'Port[áa]til'`
      (case-insensitive, sin asumir nada si `Group` está vacío).
- [x] `New-HardwareInventoryHtml` + resumen `Write-Host`: muestran el conteo
      de portátiles.
- [x] `Monitoring.jsx`: nueva tarjeta KPI "Portátiles" (ícono `Laptop`,
      `deviceTypes.Portables`), grid del KPI de 5 a 6 columnas.
- [x] **Verificación real con PowerShell** (no solo simulación en Node):
      fixtures sintéticos (`Informe de hardware (test).html` + `Informe del
      estado de la proteccion (test).html`, nombres inventados) corridos con
      `-SkipUpload` contra el script real — 5 dispositivos, 3 portátiles
      (incluye un caso límite: un equipo con fila en "Informe de hardware"
      pero grupo KSC "Portátiles", correctamente contado como portátil), 2
      agregados desde protección, todos los conteos (SO/virtualización/IP)
      coinciden exactamente con lo calculado a mano.
- [x] `cd CRM_Frontend && npm run lint`/`build` — mismos 8 errores
      preexistentes, sin nuevos.
- [x] Docker local: `crm-frontend` reconstruido, bundle confirmado con
      "Portátiles"/"grupo KSC", sin regresión en otros endpoints.

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

## Cierre

Decisión explícita del usuario (2026-10-01): probar bien en local primero,
desplegar a producción (`SERV-KSC` + `.65`) solo cuando esté confirmado.

- [x] PR abierto y enlazado en `spec.md` — [#24](https://github.com/correocctvy2k-prog/Bot_comercial/pull/24)
- [x] Merge a `main` (2026-10-01, `b65c866`)
- [x] `.ps1` actualizado copiado y corrido en `SERV-KSC` — encontró un problema
      real en el camino (LL-0009: `PowerShell.exe` 5.1 falla en silencio con
      estos reportes, `pwsh` funciona), resuelto sin cambiar código. Confirmado
      con la tarea programada `Skylab_Monitor_Inventory` que ya usa `pwsh.exe`.
- [x] Desplegado y verificado en `http://192.168.8.65:3003/monitoring` —
      panel "Inventario KSC" con 175 dispositivos consistentes en todas las
      vistas, tarjeta "Portátiles" (32) visible, confirmado por el usuario con
      captura real del dashboard en producción.
