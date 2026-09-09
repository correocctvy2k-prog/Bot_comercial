# Indice maestro de documentacion

Este indice organiza la documentacion en cascada. La idea es que un agente nuevo no tenga que leer todo el repositorio: debe entrar por el modulo correcto, revisar sus limites y luego profundizar solo donde sea necesario.

## Ecosistema

El repositorio es un monorepo con estos bloques principales:

| Modulo | Carpeta | Proposito |
| --- | --- | --- |
| Bot Comercial | `src/` | Bot principal de WhatsApp/Telegram para reportes comerciales |
| Bot Asamblea | `Asamblea/` | Bot y procesos para Asamblea 2026 |
| CRM Frontend | `CRM_Frontend/` | Panel React/Vite para operacion, monitoreo y administracion |
| Monitoreo IT | `CRM_Frontend/src/pages/Monitoring.jsx` + `CRM_Frontend/Monitoreo/` | Dashboard de infraestructura, scripts PowerShell y heartbeat |
| Ciberseguridad | `docs/modulos/ciberseguridad/` | Inventario de activos, exposicion, vulnerabilidades y riesgo |
| Datos runtime | `data/` | Persistencia local de reportes y datos generados |

## Documentacion por modulo

- [Bot Comercial](./modulos/bot-comercial.md)
- [Bot Asamblea](./modulos/bot-asamblea.md)
- [CRM Frontend](./modulos/crm-frontend.md)
- [Monitoreo IT](./modulos/monitoreo-it.md)
- [Ciberseguridad](./modulos/ciberseguridad/README.md)
- [Continuidad: Seguridad Electronica y eventos diarios](./CONTINUIDAD-SEGURIDAD-ELECTRONICA-EVENTOS.md)

## Proceso de trabajo (obligatorio)

- [Modelo de trabajo canonico (SDD)](./WORKING_MODEL.md) — leer antes de cualquier cambio, con cualquier herramienta de IA.
- [Specs](../specs/README.md) — Spec-Driven Development, plantillas e indice.
- [ADR](./adr/README.md) — decisiones de arquitectura.
- [Lecciones aprendidas](./lecciones-aprendidas/README.md).
- [Changelog](../CHANGELOG.md) — se actualiza en cada PR.
- [Sistema de diseno CRM_Frontend](../CRM_Frontend/docs/design-system.md).

## Operacion

- [Despliegue local dockerizado (paso obligatorio antes de prod)](./operacion/despliegue-local.md)
- [Despliegue y VPS](./operacion/despliegue.md)

## Referencias existentes

- [README raiz](../README.md)
- [Contexto maestro historico](../PROYECTO_CONTEXTO.md)
- [README CRM Frontend](../CRM_Frontend/README.md)
- [Documentacion profunda de Monitoreo IT](../CRM_Frontend/docs/monitoreo-it/README.md)

## Como mantener esta cascada

Cuando se cree o cambie un modulo:

1. Crear/actualizar la spec en `specs/NNNN-slug/` (ver [WORKING_MODEL.md](./WORKING_MODEL.md)).
2. Agregar o actualizar su ficha en `docs/modulos/`.
3. Enlazar documentacion profunda si existe.
4. Actualizar `CHANGELOG.md`, y `docs/adr/` o `docs/lecciones-aprendidas/` si corresponde.
5. Actualizar este indice si cambia el mapa del ecosistema.
6. Mantener `DOCUMENTACION.md` como puerta de entrada estable.
