# Modulo - CRM Frontend

## Proposito

Panel administrativo Skylab construido con React + Vite. Incluye dashboards, usuarios, contactos, puntos, conexiones, centro de comando, pruebas WhatsApp y Monitoreo IT.

## Ubicacion

```text
CRM_Frontend/
```

## Documentacion relacionada

- [README CRM Frontend](../../CRM_Frontend/README.md)
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
| `CRM_Frontend/src/pages/Dashboard.jsx` | Actividad Bot |
| `CRM_Frontend/src/pages/Monitoring.jsx` | Dashboard principal de Monitoreo IT |
| `CRM_Frontend/src/pages/MonitoringDashboard.jsx` | Detalles e historial de Monitoreo IT |
| `CRM_Frontend/src/services/` | Clientes de API |
| `CRM_Frontend/public/` | Logos e iconos usados por la UI |

## Antes de modificar

- Revisar convenciones visuales existentes.
- No crear landing pages para herramientas internas.
- Mantener dashboards compactos, escaneables y utiles en pantalla.
- Probar build antes de entregar.

## Verificacion minima

```bash
cd CRM_Frontend
npm run build
```

Servidor local:

```bash
cd CRM_Frontend
npm run dev
```

Despliegue VPS:

```bash
sudo docker compose up -d --build crm-frontend
```

