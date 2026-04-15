# 🖥️ CRM Frontend - Panel de Control Skylab

Este es el Panel de Control administrativo del ecosistema Skylab, construido con **React 19 + Vite 7**.

## 🚀 Características principales

- **Dashboard Realtime:** Monitoreo de KPIs de los bots y estado de puntos de venta.
- **Terminal SSH Embebida:** Control directo de los servidores VPS mediante xterm.js (puente vía Socket.io al backend).
- **Gestión de Puntos:** Mapa interactivo con Leaflet y gestión de alertas.
- **Centro de Comando:** Autopilot para reinicio de túneles Cloudflare y actualizaciones de Git.

## 🛠️ Desarrollo Local

```bash
# Instalar dependencias
npm install

# Correr en modo desarrollo
npm run dev
```

## 🐳 Despliegue (Docker)

Esta aplicación está configurada para ser servida por Nginx dentro de un contenedor Docker. 
La configuración se encuentra en la raíz del proyecto para integrarse con el `docker-compose.yml` general.

- **Dockerfile:** Multi-etapa (Build Node / Prod Nginx).
- **Puerto:** Mapeado al 3003 en el host.

---
*Parte del Ecosistema Skylab.*
