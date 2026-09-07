# SPEC 0002 — Analítica de Agentes: Ranking de Usuarios & Zonas (rango real, paginación, filtro de canal, orden y export CSV)

- **Estado:** Aprobada (retroactiva)
- **Autor:** equipo Skylab (@jbeltran)
- **Fecha:** 2026-09-07
- **Módulos afectados:** CRM_Frontend / Analítica de Agentes (`RankingSection`, `crmService.getUserRanking`)
- **Rama:** `feat/0002-analitica-agentes-ranking`
- **PR:** _pendiente_

> **Nota.** Esta spec es **retroactiva**: los cambios se implementaron antes de adoptar SDD
> (ver `CHANGELOG.md` y [[ranking-pendiente-spec]]). Se documenta ahora para dejar constancia
> del problema, alcance y criterios de aceptación antes de mover el bloque a una versión
> publicada. El código vivía sin commitear (`git stash`) y se recupera en esta rama.

## 1. Problema / oportunidad

El módulo **Analítica de Agentes → Ranking de Usuarios & Zonas Escaneadas** (pestaña Bot
Comercial, `CRM_Frontend/src/pages/Dashboard.jsx`, componente `RankingSection`) tenía tres
carencias para uso gerencial:

1. **El rango de tiempo no se respetaba.** `crmService.getUserRanking(range)` forzaba un mínimo
   de 30 días (`subDays(now, Math.max(days, 30))`), así que elegir `24h` o `7d` en el selector
   devolvía igualmente el histórico de un mes. Incoherente con `getDashboardStats`, que sí
   respeta el rango.
2. **La tabla completa no paginaba.** Con decenas de usuarios, la "Tabla Completa de Posiciones"
   se renderizaba entera, difícil de escanear y pesada.
3. **Sin herramientas de análisis.** No había filtro por canal, ni orden por columnas, ni forma
   de exportar el ranking para un informe.

Además, la superficie del panel usaba `bg-white/5` / `border-white/10` (prohibido por
`CRM_Frontend/docs/design-system.md`) y una tipografía de cabecera por debajo del resto del
módulo.

## 2. Objetivo

El Ranking refleja exactamente el rango seleccionado (`24h`/`7d`/`1m`/`1y`), es navegable por
páginas, filtrable por canal, ordenable por posición y total de mensajes, exportable a CSV, y
cumple el sistema de diseño.

## 3. Alcance

- `crmService.getUserRanking`: calcular `startDate` según el rango real, con el mismo criterio
  que `getDashboardStats` (`24h` = últimas 24 h; `7d`/`1m`/`1y` = `startOfDay(subDays(now, days-1))`).
- `RankingSection` (`Dashboard.jsx`):
  - Paginación de la tabla completa: `RANKING_PAGE_SIZE = 15`, controles Anterior/Siguiente,
    indicador "Mostrando X–Y de N" y "página A / B". La paginación se oculta si `N <= 15`.
  - Filtro por canal: `Todos` / `WhatsApp` / `Telegram` (sobre `item.channel`, que ya devuelve
    `getUserRanking`). Resetea a página 1 al cambiar.
  - Orden por columnas `# Pos.` y `Total Mensajes` (asc/desc, con icono de estado). Resetea a
    página 1.
  - Exportar CSV del ranking **filtrado + ordenado** (no solo la página visible): cabeceras
    fijas, escape de `" , ; \n`, BOM UTF-8 para acentos correctos en Excel, nombre
    `ranking-agentes-AAAA-MM-DD.csv`.
  - Pase de diseño: `bg-card/60 backdrop-blur-xl border-border/80`, tokens de tema en vez de
    `bg-white/5` / `border-white/10`, título `text-lg font-black tracking-tight`, glow decorativo
    en tarjetas TOP 2 / TOP 3.
  - El buscador y todos los filtros resetean la paginación a página 1.

## 4. No-objetivos

- **No** se toca la pestaña Bot Soporte Técnico ni `chatbot-soporte`.
- **No** se cambian los KPIs, la gráfica de actividad ni el donut de canales.
- **No** se añade paginación server-side ni cambia el contrato de `interactions_log`.
- **No** entra en esta spec el cambio de `CRM_Frontend/src/pages/CybersecurityDashboard.jsx`
  (historial de cambios de segmentos de red): es del módulo Ciberseguridad y va en su propia
  spec/rama.
- **No** se arregla el build de `comercial-bot` (ver [[comercial-bot-build-roto-bullseye]]);
  el Ranking lee Supabase directo y no lo necesita.

## 5. Criterios de aceptación

- [ ] Con `range = '24h'` el Ranking solo cuenta interacciones `INCOMING` de las últimas 24 h;
      con `7d`/`1m`/`1y`, desde `startOfDay(subDays(now, days-1))`. Verificable comparando el
      total con `getDashboardStats` del mismo rango.
- [ ] La tabla completa muestra como máximo 15 filas por página; los controles Anterior/Siguiente
      y el indicador de rango funcionan; se oculta la paginación con ≤ 15 usuarios.
- [ ] El filtro de canal (`Todos`/`WhatsApp`/`Telegram`) acota la tabla y el contador de usuarios,
      y vuelve a página 1.
- [ ] Ordenar por `# Pos.` y por `Total Mensajes` alterna asc/desc y vuelve a página 1.
- [ ] "Exportar CSV" descarga el ranking filtrado y ordenado completo, con acentos correctos en
      Excel y campos con comas/comillas bien escapados. Botón deshabilitado si no hay filas.
- [ ] El buscador resetea a página 1.
- [ ] Sin `bg-white/5` ni `border-white/10` en `RankingSection`; superficies con tokens de tema;
      OK en tema claro y oscuro.
- [ ] `cd CRM_Frontend && npm run lint` + `npm run build` verdes.
- [ ] Verificado en `http://127.0.0.1:3003/` (Docker local).

## 6. Restricciones de arquitectura y diseño

- Respetar `CRM_Frontend/docs/design-system.md` (superficie de panel, radios, tipografía, tokens).
- No tocar sin ADR: stack, config build-time, `nginx.conf`, puertos, `docker-compose.yml` base.
- Cambio solo cliente: sin migraciones, sin endpoints nuevos, sin columnas nuevas en Supabase.
- El export CSV se genera en el navegador (Blob), sin dependencias nuevas.

## 7. Riesgos

| Riesgo | Impacto | Mitigación |
|--------|---------|-----------|
| `getUserRanking` con `24h` puede devolver muy pocos datos y "vaciar" el ranking | Medio — percepción de bug | Es el comportamiento correcto; el vacío se muestra controlado ("sin filas"), no crash |
| Supabase de producción también en local (no hay staging) | Bajo — solo lecturas | `getUserRanking` es de solo lectura; regla de `despliegue-local.md` |
| CSV mal escapado rompe columnas en Excel | Bajo | Escape de `" , ; \n\r` + comillas dobladas + BOM UTF-8; cubierto por criterio de aceptación |
| El WIP recuperado del stash arrastra un archivo ajeno (`CybersecurityDashboard.jsx`) | Medio — scope creep | Se re-stashea ese archivo; esta rama solo lleva `Dashboard.jsx` + `crm.service.js` |

## 8. Impacto en producción

- **Usuario final:** el Ranking pasa a respetar el rango elegido y gana paginación, filtro de
  canal, orden y exportación CSV. Sin cambios en el resto del dashboard.
- **Despliegue:** rebuild estándar del contenedor `crm-frontend` (build-time). Sin cambios de
  infraestructura.
- **Rollback:** `git revert` del commit de la feature + rebuild del contenedor con el estado
  anterior. Al ser solo cliente, el rollback es inmediato y sin migraciones que deshacer.
