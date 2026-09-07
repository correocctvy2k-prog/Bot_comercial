# TASKS 0003 — Estandarización de la interfaz

Referencia: `spec.md` y `plan.md` en esta misma carpeta.
Spec paraguas: cada lote tiene su propia rama y PR. Marcar aquí el avance global.

## Preparación

- [x] Auditoría de patrones prohibidos sobre `CRM_Frontend/src` (2026-09-07).
- [x] Spec paraguas (`spec.md`, `plan.md`, `tasks.md`) + tabla de mapeo crudo→token.
- [ ] Confirmar con quien pidió el cambio el orden de lotes (A→E) y el criterio de
      "identidad semántica" que se conserva.

## Lote A — Shell y compartidos

- [ ] `layout/Layout.jsx` — 10 `*-white/N`
- [ ] `components/GerenciaDashboard.jsx` — 2
- [ ] `components/support/SupportWidget.jsx` — 2
- [ ] `components/SystemHealthPanel.jsx` — hex crudo
- [ ] Smoke: todas las rutas montan el shell → recorrer 4-5 rutas en claro y oscuro
- [ ] PR lote A

## Lote B — Analítica y Monitoreo

- [ ] `pages/Dashboard.jsx` (las 6 ocurrencias fuera de `RankingSection`)
- [ ] `pages/Monitoring.jsx` — 5
- [ ] `pages/MonitoringDashboard.jsx`
- [ ] `pages/ServicesTIDashboard.jsx` — 3
- [ ] `pages/CommandCenter.jsx` — 5 + 49 hex crudos
- [ ] `components/AlertsTab.jsx`
- [ ] Smoke `/`, `/monitoring`, `/monitoring/services-ti`, `/monitoring/dashboard`, `/command-center`
- [ ] PR lote B

## Lote C — Puntos / CCTV / Ciberseguridad

- [ ] `pages/Points.jsx` — 2
- [ ] `pages/CctvModule.jsx` — 1 + 13 hex crudos
- [ ] `pages/CybersecurityDashboard.jsx` — coordinar con `git stash@{0}` (WIP historial de segmentos)
- [ ] Smoke `/points`, `/points/cctv`, `/points/cybersecurity`
- [ ] PR lote C

## Lote D — Contactos y Conexiones

- [ ] `pages/Contacts.jsx` — 3
- [ ] `pages/ContactDetail.jsx`
- [ ] `pages/Connections.jsx`, `pages/BotConfig.jsx`, `pages/PruebaWhatsApp*`
- [ ] Smoke `/contacts`, `/contacts/:id`, `/connections`, `/connections/:id/config`, `/test-wa`
- [ ] PR lote D

## Lote E — Asamblea / Soporte / Login

- [ ] `pages/AsambleaDashboard.jsx` — 30 (el más pesado)
- [ ] `pages/SupportDashboard.jsx` — 9 + 7 hex crudos
- [ ] `pages/LoginPage.jsx` — 13
- [ ] Smoke `/asamblea`, `/support`, `/login`
- [ ] PR lote E

## Cierre de la spec paraguas

- [ ] `grep` global de `*-white/N` en páginas ruteadas = 0.
- [ ] `CHANGELOG.md` con el resumen de la estandarización.
- [ ] Fichas de módulo actualizadas donde aplique.
- [ ] Quitar `continue-on-error` del paso de lint en `.github/workflows/crm-frontend.yml`
      y verificar CI verde.
- [ ] Lección aprendida sobre la deriva visual y cómo se evita (revisión de diseño en cada PR).
