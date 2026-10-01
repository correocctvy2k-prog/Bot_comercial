# LL-0009 — `Monitor-KSC-HardwareInventory.ps1` falla en silencio con PowerShell 5.1, funciona con `pwsh` (7)

- **Fecha:** 2026-10-01
- **Módulo:** `CRM_Frontend/Monitoreo/KSC/` (Monitoreo IT), spec 0017
- **Spec / PR:** `specs/0017-ksc-inventario-reconciliacion/`

## Contexto

Tras desplegar la spec 0017 (reconciliación 155→175 + desglose de portátiles),
el usuario corrió `Monitor-KSC-HardwareInventory.ps1` en `SERV-KSC` para probar
en producción antes del envío real.

## Qué pasó

Corrido con:
```powershell
PowerShell.exe -NonInteractive -NoProfile -ExecutionPolicy Bypass -File .\Monitor-KSC-HardwareInventory.ps1 -SkipUpload
```
El resumen de consola mostró **`Dispositivos : 0`** — y no solo eso: también
`BD virus vigentes/al día : 0` (un reporte completamente distinto, parseado por
una función distinta, `Parse-VirusDatabaseUsage`) y "Informe del estado de la
protección" **no se encontró**, pese a que el archivo sí existía en
`F:\Informes KSC`. Sin ningún error visible en consola.

Se investigó paso a paso contra el archivo real (nunca contra datos
sintéticos en este caso, porque el síntoma solo aparecía con el reporte real
de producción):
1. El archivo se lee bien (`Get-Content -Raw -Encoding UTF8`), tamaño y
   longitud coherentes, el texto "Visible por" sí está presente.
2. Replicando exactamente la lógica de `Get-HtmlTableRows`/
   `Parse-HardwareInventory` **a mano, en la misma consola interactiva**
   (`pwsh`, confirmado `$PSVersionTable.PSVersion` = 7.5.4) contra el mismo
   `$content`: **155 dispositivos, encabezado detectado correctamente, cero
   filas descartadas.** La lógica de parseo es correcta.
3. Correr el `.ps1` real (no la réplica) con `PowerShell.exe` (5.1): sigue en
   0, de forma reproducible, no era una condición de carrera con el export de
   KSC.
4. Correr el **mismo `.ps1`, sin tocar una sola línea**, con `pwsh`:
   ```powershell
   pwsh -NonInteractive -NoProfile -ExecutionPolicy Bypass -File .\Monitor-KSC-HardwareInventory.ps1 -SkipUpload
   ```
   **175 dispositivos, 32 portátiles, "Informe del estado de la protección"
   encontrado (174 dispositivos, 174 con IP)** — todo correcto.

## Causa raíz

El script funciona correctamente con PowerShell 7 (`pwsh`, motor de regex de
.NET moderno) pero falla en silencio con Windows PowerShell 5.1 clásico
(`powershell.exe`, motor de regex de .NET Framework) al procesar estos
archivos HTML reales de KSC (~130 KB, con tablas anidadas de estilo/UI además
de la tabla de datos). No se profundizó en el mecanismo exacto interno de
.NET Framework vs .NET moderno — no era necesario para resolverlo, y repetir
la investigación con el archivo real cada vez tiene costo. Lo que importa:
**el síntoma es "0 dispositivos, sin ningún error" en 5.1, no una excepción
visible** — fácil de confundir con "el reporte está vacío" o "el archivo no se
encontró", cuando el archivo y la lógica están perfectamente bien.

## Solución

Ninguna. El script no cambió — correrlo con `pwsh` en vez de `PowerShell.exe`
resuelve el problema por completo.

## Regla nueva

**Cualquier script de este módulo que parsee HTML real de KSC (tablas
grandes, 100+ KB) debe correrse con `pwsh`, nunca con `PowerShell.exe`
clásico.** La guía `docs/monitoreo-it/scripts-y-tareas.md` recomendaba
`PowerShell.exe` como ejecución general — corregida para recomendar `pwsh`
específicamente para `Monitor-KSC-HardwareInventory.ps1`.

**Verificado que no hace falta ninguna acción adicional en `SERV-KSC`:** la
tarea programada `Skylab_Monitor_Inventory` (09:00 diario, Programador de
tareas de Windows) **ya invoca `"C:\Program Files\PowerShell\7\pwsh.exe"`**,
no el ejecutable clásico — confirmado en pantalla por el usuario. El deploy de
la spec 0017 queda autosuficiente para las corridas diarias automáticas sin
ningún cambio en la tarea programada.

Si en el futuro se crea una tarea nueva o se corre este script a mano, usar
siempre `pwsh`, confirmando antes con `$PSVersionTable.PSVersion` (debe
reportar `Major: 7`).

## Enlaces

- `CRM_Frontend/Monitoreo/KSC/Monitor-KSC-HardwareInventory.ps1`
- `CRM_Frontend/docs/monitoreo-it/scripts-y-tareas.md`
- `specs/0017-ksc-inventario-reconciliacion/`
