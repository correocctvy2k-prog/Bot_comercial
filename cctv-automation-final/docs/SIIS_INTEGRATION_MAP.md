# Mapa de integración SIIS para CCTV

## Llave canónica

El campo `Código SIIS` del maestro CCTV debe corresponder a `puntos_venta.siiss_id`. No se debe conciliar por IP como llave de negocio: la IP puede cambiar y debe conservarse como atributo técnico.

## Implementación existente

- Frontend de puntos: `CRM_Frontend/src/pages/Points.jsx` ejecuta `POST /api/siiss/sync`.
- Indicadores: `CRM_Frontend/src/services/crm.service.js` consulta `siiss_active` y `siiss_last_sync` en `puntos_venta`.
- Servicio localizado en el proyecto global: `Asamblea/src/services/siiss.service.js` consulta estaciones SIIS, cruza `estacodi` con `siiss_id`, actualiza el estado y registra transiciones de apertura/cierre.
- Campos SIIS utilizados: `estacodi`, `estanomb` y `estaping`.
- Campos locales relevantes: `ip`, `name`, `alias`, `siiss_id`, `segment`, `siiss_active`, `siiss_last_sync` e `is_permanently_closed`.

## Aplicación al módulo CCTV

1. Importar `Ubicaciones` usando `Código SIIS` como identidad externa.
2. Asignar cada dispositivo, panel, vehículo o iniciativa a una ubicación canónica.
3. Mantener alias en una tabla separada y exigir revisión humana para coincidencias no exactas.
4. Usar los eventos SIIS de apertura/cierre como una fuente adicional; no confundirlos con eventos de video o alarma.
5. Mantener trazabilidad de fuente, fecha de sincronización y confianza de cada dato.

## Riesgo de seguridad detectado

La implementación actual contiene valores de acceso de respaldo dentro de archivos de configuración/servicio. Deben eliminarse del código y obtenerse exclusivamente de variables de entorno o de un gestor de secretos. Ninguna credencial fue copiada al libro normalizado.

## Estado de implementación local

- `platform/siis.js`: contrato y normalización de estaciones.
- `platform/import-siis-snapshot.js`: importación reproducible a staging.
- `siis_sync_runs`: auditoría de cada instantánea.
- `stg_siis_locations`: datos SIIS validados, sin promoción automática.
- `siis_location_reconciliation`: decisiones de vínculo con el catálogo canónico.
- `platform/siis-client.js`: autenticación segura y extracción de campos mínimos.
- `platform/reconcile-siis-staging.js`: cadena auditable SIIS–mantenimiento–CCTV.

La decisión arquitectónica completa está en
`ADR-001-IDENTIDAD-Y-SINCRONIZACION-SIIS.md` y la operación está descrita en
`RUNBOOK-SIIS.md`.

## Migración requerida en el backend existente

Antes de reutilizar el servicio actual en producción:

1. Eliminar los valores predeterminados de usuario y contraseña del código.
2. Validar las variables obligatorias al iniciar el backend.
3. Evitar que el diagnóstico retorne muestras crudas si contienen campos no
   necesarios para la interfaz.
4. Compartir un único cliente SIIS entre el worker y las rutas HTTP.
5. Registrar métricas y errores sin incluir token ni credenciales.

Esta migración afecta el proyecto `Asamblea`; no se ha modificado desde este paquete.
