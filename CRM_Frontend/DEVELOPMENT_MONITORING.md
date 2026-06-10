# Monitoreo IT - Nota de desarrollo

La documentacion vigente del modulo esta organizada en:

- [Documentacion principal](./docs/monitoreo-it/README.md)
- [Arquitectura y flujo de datos](./docs/monitoreo-it/arquitectura-y-flujo.md)
- [Scripts y tareas programadas](./docs/monitoreo-it/scripts-y-tareas.md)
- [Operacion y troubleshooting](./docs/monitoreo-it/operacion-y-troubleshooting.md)

Este archivo se conserva como punto de entrada rapido para desarrolladores que ya conocian la nota anterior.

## Estado actual

El modulo cuenta con:

- Dashboard principal en `/monitoring`.
- Vista operativa de detalles en `/monitoring/dashboard`.
- Heartbeat centralizado desde el VPS para pings ICMP y TCP.
- Scripts PowerShell para AD, hosts, KSC, inventario KSC y SERV-ZK.
- Layout editable persistido en el navegador.
- Inventario KSC con KPIs y graficos animados.
- Notificaciones inteligentes con recomendaciones cada 5 minutos.

## Verificacion rapida

```bash
cd CRM_Frontend
npm run build
```

En el VPS:

```bash
git pull origin main
sudo docker compose up -d --build crm-frontend
```
