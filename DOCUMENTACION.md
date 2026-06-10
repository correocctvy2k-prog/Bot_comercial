# Documentacion maestra - Ecosistema Skylab

Este archivo es la puerta de entrada recomendada para cualquier persona o agente que vaya a trabajar en el repositorio.

## Lectura recomendada

1. Leer este archivo para entender como navegar la documentacion.
2. Leer el indice maestro: [docs/README.md](./docs/README.md).
3. Abrir la ficha del modulo a intervenir.
4. Consultar documentacion profunda solo cuando el cambio lo requiera.

## Mapa rapido

| Si vas a trabajar en... | Lee primero |
| --- | --- |
| Bot Comercial WhatsApp/Telegram | [docs/modulos/bot-comercial.md](./docs/modulos/bot-comercial.md) |
| Bot Asamblea | [docs/modulos/bot-asamblea.md](./docs/modulos/bot-asamblea.md) |
| CRM Frontend general | [docs/modulos/crm-frontend.md](./docs/modulos/crm-frontend.md) |
| Monitoreo IT | [docs/modulos/monitoreo-it.md](./docs/modulos/monitoreo-it.md) |
| Despliegue / VPS / Docker | [docs/operacion/despliegue.md](./docs/operacion/despliegue.md) |
| Contexto historico amplio | [PROYECTO_CONTEXTO.md](./PROYECTO_CONTEXTO.md) |

## Reglas para agentes

- Antes de editar, identificar el modulo y leer su ficha.
- No usar `PROYECTO_CONTEXTO.md` como unico mapa: es memoria historica y puede contener secciones antiguas.
- Si se modifica un modulo, actualizar su documentacion cuando cambie arquitectura, rutas, endpoints, scripts, despliegue o comportamiento visible.
- No incluir archivos locales no relacionados en commits.
- Al finalizar cambios que deben llegar al VPS, hacer commit, push e indicar `git pull origin main`.

## Estructura documental

```text
DOCUMENTACION.md              Entrada raiz para agentes
docs/README.md                Indice maestro por modulo
docs/modulos/                 Fichas cortas por modulo
docs/operacion/               Guias operativas transversales
CRM_Frontend/docs/            Documentacion profunda del frontend y submodulos
PROYECTO_CONTEXTO.md          Memoria historica y contexto extendido
```

