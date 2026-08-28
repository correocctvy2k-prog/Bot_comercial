# Checklist de despliegue — Seguridad Electrónica

Usar una copia de este archivo por cada despliegue. No registrar secretos.

## Identificación

- [ ] Fecha y ventana de cambio:
- [ ] Servidor/ambiente:
- [ ] Responsable técnico:
- [ ] Responsable funcional:
- [ ] Commit o hash del paquete:
- [ ] Versión anterior:

## Previo al cambio

- [ ] Cambio aprobado.
- [ ] Alcance y reversión comunicados.
- [ ] `npm test` aprobado.
- [ ] `npm run build` aprobado en CRM_Frontend.
- [ ] `.env` ausente del paquete y del repositorio.
- [ ] Base SQLite respaldada con procesos detenidos o backup consistente.
- [ ] `state.json` respaldado.
- [ ] Excel, evidencias y configuración respaldados.
- [ ] Hashes de respaldo registrados.
- [ ] Restauración probada en ubicación aislada.

## Infraestructura

- [ ] Cuenta de servicio creada.
- [ ] ACL de `.env`, SQLite y evidencias aplicada.
- [ ] NTP y zona horaria verificados.
- [ ] DNS, firewall y conectividad IMAP/SIIS/Trello verificados.
- [ ] Proxy HTTPS configurado.
- [ ] Puerto 3003 no expuesto directamente a usuarios.
- [ ] Frontend publicado desde `dist`, no con Vite dev.
- [ ] API configurada como servicio con reinicio automático.

## Instalación

- [ ] Código copiado en ruta definitiva.
- [ ] `npm ci` ejecutado en ambos proyectos.
- [ ] Variables configuradas desde `.env.example`.
- [ ] Rutas absolutas de datos y Trello verificadas.
- [ ] API iniciada una vez y esquema aplicado.
- [ ] Tarea del ciclo operativo instalada.
- [ ] Tarea ZK de las 20:00 instalada.
- [ ] Tareas ejecutan sin sesión interactiva.

## Pruebas posteriores

- [ ] `/api/cctv/health` responde `ok`.
- [ ] `/api/cctv/sync-status` no presenta fuente fallida.
- [ ] Centro operativo carga.
- [ ] Inventario y ficha integral cargan.
- [ ] Evidencia IMAP se abre bajo demanda.
- [ ] SIIS registra una nueva instantánea.
- [ ] Trello refleja una actualización de prueba.
- [ ] Visitantes consulta el último reporte.
- [ ] Alarmas y perfiles BabyWare cargan.
- [ ] Registro manual controlado genera auditoría.
- [ ] Tema claro y oscuro revisados.
- [ ] Acceso desde un segundo equipo autorizado validado.

## Observación

- [ ] Logs sin errores críticos durante 60 minutos.
- [ ] Lock operativo se crea y libera correctamente.
- [ ] No aparecen ventanas interactivas de PowerShell.
- [ ] Cierre de las 22:00 verificado.
- [ ] Importación ZK de las 20:00 verificada.
- [ ] Respaldo automático del nuevo ambiente confirmado.

## Decisión

- [ ] Avanzar.
- [ ] Revertir.
- [ ] Avanzar con observaciones documentadas.

Observaciones:

```text

```

## Reversión, si aplica

- [ ] Procesos nuevos detenidos.
- [ ] Base y `state.json` problemáticos preservados para análisis.
- [ ] Código y datos anteriores restaurados.
- [ ] API y frontend anteriores validados.
- [ ] Tareas anteriores reactivadas.
- [ ] Intervalo de datos pendiente identificado y recuperado.
