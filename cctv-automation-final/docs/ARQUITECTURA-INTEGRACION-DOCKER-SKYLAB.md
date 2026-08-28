# Arquitectura de integración Docker con Skylab global

**Fecha:** 28 de agosto de 2026  
**Objetivo:** consolidar localmente Seguridad Electrónica sin mover ni reiniciar sus datos.

## Punto de entrada

El host `192.168.8.65:3003` continúa reservado para `crm-frontend`. Nginx sirve
la SPA y reenvía `/api/cctv/*` al servicio interno `cctv-api:3003`. La API CCTV
no publica puertos del host.

```text
cliente -> 192.168.8.65:3003 -> crm-frontend:80
                                  ├─ / -> React
                                  └─ /api/cctv/* -> cctv-api:3003
```

## Servicios

- `cctv-api`: API y acceso a evidencias.
- `cctv-operational-worker`: ciclo secuencial de correo, SIIS, Trello y cierre.
- `cctv-visitor-worker`: importación diaria ZK después de las 20:00 de Bogotá.

Los tres usan la misma imagen y los mismos montajes persistentes. El lock del
ciclo y la idempotencia de cada fuente se conservan.

## Persistencia durante la consolidación local

Para evitar una migración prematura, Compose monta los archivos existentes:

- `data` -> `/var/lib/skylab-security/data`;
- `state.json` -> `/var/lib/skylab-security/state/state.json`;
- `logs`, `reports` y `output` en sus equivalentes persistentes;
- caché Trello -> `/var/lib/skylab-security/trello`;
- entorno Trello como archivo de solo lectura.

El código resuelve estas ubicaciones mediante `config/runtime-paths.js`. Sin
variables, mantiene exactamente el layout local anterior.

## Preparación local

1. Definir en el entorno raíz una clave pública de Supabase:

   ```bash
   export VITE_SUPABASE_ANON_KEY='clave-anon-publica'
   ```

   Nunca usar una clave `service_role` en una variable `VITE_*`.

2. Verificar configuración:

   ```bash
   docker compose config --quiet
   ```

3. Construir primero Seguridad Electrónica:

   ```bash
   docker compose build cctv-api
   ```

4. Levantar API y comprobar salud a través de Nginx:

   ```bash
   docker compose up -d cctv-api crm-frontend
   curl http://127.0.0.1:3003/api/cctv/health
   ```

5. Levantar workers después de validar la copia de datos:

   ```bash
   docker compose up -d cctv-operational-worker cctv-visitor-worker
   ```

## Trello y Excel

La caché Trello sigue siendo una dependencia transitoria de solo lectura para
la importación canónica. El refresco reutiliza temporalmente el cliente del
backend Table Trello. En Linux, `EXCEL_FILE_PATH` debe apuntar a un montaje SMB
real; una ruta UNC de Windows no funciona dentro del contenedor.

Si no existe el montaje Excel, el refresco Trello puede fallar, pero el ciclo
continúa como `SUCCESS_WITH_WARNINGS` y conserva la última instantánea canónica.

## Migración posterior al VPS

Antes de sustituir los montajes relativos por `/srv/skylab/security`:

1. detener API y workers;
2. respaldar SQLite, `state.json`, evidencias y caché Trello;
3. calcular hashes;
4. copiar el conjunto como una unidad;
5. cambiar únicamente los mounts de Compose;
6. verificar conteos y continuidad de `lastUid`;
7. iniciar API y luego workers.

Nunca inicializar una base vacía ni eliminar `state.json` como mecanismo de
recuperación.
