# Modulo - CRM Frontend

## Proposito

Panel administrativo Skylab construido con React + Vite. Incluye dashboards, usuarios, contactos, puntos, conexiones, centro de comando, pruebas WhatsApp y Monitoreo IT.

## Ubicacion

```text
CRM_Frontend/
```

## Documentacion relacionada

- [README CRM Frontend](../../CRM_Frontend/README.md)
- [Sistema de diseno ("ADN premium")](../../CRM_Frontend/docs/design-system.md) — obligatorio para UI nueva o modificada
- [Modulo: Analitica de Agentes IA](../../CRM_Frontend/docs/analitica-agentes/README.md)
- [Monitoreo IT](./monitoreo-it.md)

## Stack

- React.
- Vite.
- Tailwind CSS.
- Lucide React.
- Recharts.
- Socket.IO client.
- Supabase client.

## Archivos clave

| Archivo | Responsabilidad |
| --- | --- |
| `CRM_Frontend/src/App.jsx` | Rutas principales |
| `CRM_Frontend/src/layout/Layout.jsx` | Shell visual, sidebar y header |
| `CRM_Frontend/src/pages/Dashboard.jsx` | Analitica de Agentes IA (Bot Comercial + Bot Soporte) |
| `CRM_Frontend/src/services/crm.service.js` | Metricas y ranking de Analitica de Agentes |
| `CRM_Frontend/src/pages/Monitoring.jsx` | Dashboard principal de Monitoreo IT |
| `CRM_Frontend/src/pages/MonitoringDashboard.jsx` | Detalles e historial de Monitoreo IT |
| `CRM_Frontend/src/services/` | Clientes de API |
| `CRM_Frontend/public/` | Logos e iconos usados por la UI |

## Antes de modificar

- Crear/actualizar la spec en `specs/NNNN-slug/` ([WORKING_MODEL.md](../WORKING_MODEL.md)).
- Seguir el [sistema de diseno](../../CRM_Frontend/docs/design-system.md): tokens de tema, nada de `bg-white/5`.
- No crear landing pages para herramientas internas.
- Mantener dashboards compactos, escaneables y utiles en pantalla.

## Verificacion minima

```bash
cd CRM_Frontend
npm run lint
npm run build
```

Desarrollo rapido (no sustituye la verificacion en Docker local):

```bash
cd CRM_Frontend
npm run dev
```

Verificacion obligatoria antes de PR — Docker local en `http://127.0.0.1:3003/`
(ver [despliegue-local.md](../operacion/despliegue-local.md)):

```bash
docker compose -f docker-compose.yml -f docker-compose.local.yml up -d --build crm-frontend
```

Despliegue a produccion (solo tras merge a `main`):

```bash
sudo docker compose up -d --build crm-frontend
```

