# Continuidad: Seguridad Electronica y eventos diarios

**Fecha del corte:** 2 de septiembre de 2026
**Objetivo:** continuar el trabajo del modulo integrado de Seguridad Electronica sin confundirlo con el frontend standalone de Table Trello.

## 1. Punto de entrada real

La aplicacion que usa el usuario es el CRM integrado:

```text
http://192.168.8.65:3003/points/cctv
http://127.0.0.1:3003/points/cctv
```

El host `3003` pertenece a `crm-frontend` (Nginx). Nginx reenvia:

```text
/api/cctv/*          -> cctv-api:3003
/api/cybersecurity/* -> cybersecurity-api:3005
/                    -> archivos estaticos del CRM
```

No usar `CRM_Frontend/Table Trello/frontend` para validar la pantalla integrada. Ese es otro MVP independiente.

## 2. Estado remoto al cierre

Servidor: `192.168.8.65`
Usuario SSH correcto: `openfire`
Ruta remota del proyecto:

```text
/home/openfire/Bot_comercial/Bot_comercial
```

La clave de despliegue local funciona como `openfire`, no como `skylab`:

```powershell
ssh -i "$HOME\\.ssh\\skylab_deploy_ed25519" openfire@192.168.8.65
```

Servicios validados activos:

```text
crm-frontend
cctv-api (healthy)
cybersecurity-api (healthy)
cctv-operational-worker
cctv-visitor-worker
```

Validaciones remotas realizadas:

```text
/api/cctv/health          -> 200
/api/cybersecurity/health -> 200
/points/cctv              -> 200
/api/cctv/maintenance     -> 200
```

El servidor tiene Docker habilitado para `openfire` mediante el grupo `docker`.

## 3. Flujo de mantenimiento Trello

Trello no alimenta directamente la pantalla integrada. El flujo es:

```text
Trello API
  -> caché SQLite de Table Trello
  -> refresh-trello-maintenance-cache.js
  -> import-trello-maintenance.js
  -> cctv-staging.db
  -> GET /api/cctv/maintenance
  -> frontend integrado
```

El worker `cctv-operational-worker` ejecuta el ciclo operativo. La importacion canónica selecciona exactamente la lista:

```text
Mantenimiento CCTV 2026
```

Conteo confirmado en el ultimo refresco:

```text
263 actividades
177 realizadas
86 pendientes
67 por ciento
12 tarjetas mensuales
```

## 4. Credenciales y red Trello

El secreto usado por el contenedor es:

```text
CRM_Frontend/Table Trello/backend/.env
```

En Docker se monta como:

```text
/run/secrets/trello.env
```

El worker usa `TRELLO_ENV_FILE=/run/secrets/trello.env`.

No registrar ni compartir los valores de `TRELLO_API_KEY` o `TRELLO_TOKEN`.

Durante el diagnostico el servidor respondia `403 Web Filter Violation` por el filtro HTTPS corporativo. En el ultimo corte, una prueba desde el mismo contenedor devolvio `TRELLO_HTTP=200` y el refresco de mantenimiento termino correctamente.

Si vuelve el `403`, comprobar:

```bash
curl -k -sS -o /tmp/trello-check.json -w 'HTTP=%{http_code}\\n' 'https://api.trello.com/1/members/me?...'
```

No pegar credenciales en la terminal compartida ni en logs.

## 5. SQLite y orden seguro de refresco

La caché Trello y la base canónica se comparten entre servicios. No ejecutar el backend standalone de Table Trello mientras se importa la caché, porque puede producir:

```text
database is locked
```

Orden seguro en el servidor:

```bash
cd /home/openfire/Bot_comercial/Bot_comercial
docker stop cctv-operational-worker cctv-api
docker compose run --rm --no-deps cctv-operational-worker npm run refresh:trello-maintenance
docker compose run --rm --no-deps cctv-operational-worker npm run import:trello-maintenance
docker start cctv-api cctv-operational-worker cctv-visitor-worker
docker restart crm-frontend
```

Reiniciar `crm-frontend` despues de recrear `cctv-api` renueva la resolucion DNS de Nginx y evita `502 Bad Gateway` por upstream obsoleto.

## 6. Cambios de eventos diarios

La logica de horarios se mantiene separada de Trello.

### Fuentes

- `zone_schedules` en Supabase: horario base por zona y `tolerance_minutes`.
- `puntos_venta` en Supabase: excepciones con `has_custom_schedule`, `custom_open_time` y `custom_close_time`.
- `cctv_events` en SQLite canónico: detecciones de correo Dahua.
- `stg_siis_locations` y `siis_sync_runs`: pings SIIS.

### Reglas acordadas

- El estado inicial de cada punto es `NO_ENTRY`.
- El primer ping SIIS confiable es la evidencia principal de llegada.
- Un punto doble queda consolidado por ubicación; basta un nodo activo.
- CCTV puede corroborar la llegada y conserva su evidencia visual.
- El cierre de almuerzo solo se acepta por deteccion CCTV de cierre.
- El ultimo ping representa ultima actividad; no crea cierre de almuerzo.
- La tolerancia inicial es 15 minutos y permanece configurable.
- Antes del rango: `EARLY` y alerta de apertura temprana.
- Dentro del rango: `ON_TIME`.
- Despues del rango: `LATE` y alerta de apertura tardia.
- Sin ping ni CCTV: `NO_ENTRY`.
- Ping fuera del horario: alerta de revision, sin cambiar automaticamente horarios.
- Las sugerencias no modifican horarios por si solas.

### Implementacion actual

El evaluador puro esta en:

```text
CRM_Frontend/src/utils/operationalSchedule.js
```

La integracion de la vista esta en:

```text
CRM_Frontend/src/pages/CctvModule.jsx
```

El backend conserva y entrega las señales crudas por fecha. La clasificacion se deriva al consultar la ventana de eventos, por lo que funciona para hoy y para fechas históricas sin reescribir `cctv_events`.

La vista muestra alertas como:

```text
Apertura temprana
Apertura tardia
CCTV antes del ping
Ping fuera de horario
```

## 7. Archivos modificados en este trabajo

Archivos principales:

```text
CRM_Frontend/src/pages/CctvModule.jsx
CRM_Frontend/src/utils/operationalSchedule.js
cctv-automation-final/scripts/refresh-trello-maintenance-cache.js
cctv-automation-final/docs/MODELO-CANONICO-MANTENIMIENTO-TRELLO.md
cctv-automation-final/docs/RUNBOOK-DESPLIEGUE-SERVIDOR.md
docker-compose.yml
CRM_Frontend/Table Trello/backend/Dockerfile
```

Tambien se sincronizaron al servidor cambios de Seguridad Perimetral en:

```text
CRM_Frontend/src/App.jsx
CRM_Frontend/src/layout/Layout.jsx
CRM_Frontend/src/pages/CybersecurityDashboard.jsx
CRM_Frontend/src/services/cybersecurity.service.js
CRM_Frontend/nginx.conf
CRM_Frontend/vite.config.js
cybersecurity/src/
cybersecurity/scripts/
cybersecurity/db/
cybersecurity/tests/
cybersecurity/package.json
```

## 8. Pruebas ejecutadas

Desde la raiz:

```powershell
npm --prefix cctv-automation-final test
npm --prefix CRM_Frontend run build
npm --prefix CRM_Frontend run lint -- --quiet
```

Resultado conocido:

```text
52 pruebas del modulo CCTV: todas pasan
Build de CRM_Frontend: correcto
Lint: sin errores relevantes del cambio
```

El build muestra avisos existentes de Browserslist y tamaño de chunks; no bloquean el despliegue.

Prueba directa del evaluador:

```text
llegada a tiempo -> ON_TIME
llegada tardia -> LATE + OPENING_AFTER_SCHEDULE
sin señales -> NO_ENTRY
ping nocturno -> PING_OUTSIDE_SCHEDULE sin cierre de almuerzo
```

## 9. Despliegue remoto

El despliegue remoto del corte anterior requirio:

1. respaldo en `backups/deploy-20260902-105326` y otro respaldo de datos de ciberseguridad;
2. transferencia selectiva de codigo y configuracion;
3. restauracion de `cyber-inventory.db` y `network-policies.db` porque no existian en el servidor;
4. build de `cctv-api`, `cctv-operational-worker`, `crm-frontend` y `cybersecurity-api`;
5. reinicio de Nginx despues de recrear upstreams;
6. refresco e importacion Trello.

Antes de otro despliegue, verificar el estado actual:

```bash
cd /home/openfire/Bot_comercial/Bot_comercial
docker ps
docker compose config --quiet
curl -sS http://127.0.0.1:3003/api/cctv/health
curl -sS http://127.0.0.1:3003/api/cybersecurity/health
```

No usar `docker compose up -d --build` indiscriminadamente si falta un volumen o base de otro modulo. Construir servicios concretos cuando el cambio sea acotado.

## 10. Pendientes recomendados

1. Ejecutar una prueba con el usuario en la ventana Eventos diarios para fechas actual e histórica.
2. Confirmar que el horario base y la tolerancia de cada zona son los esperados en Supabase.
3. Revisar visualmente puntos dobles y puntos sin CCTV.
4. Añadir pruebas formales del evaluador puro al proyecto frontend si se incorpora un runner de tests.
5. Considerar persistir una fotografía diaria de la evaluación si se requiere auditoría histórica exacta del horario aplicado.
6. Mejorar la clasificación de jornadas partidas: cierre de almuerzo, reapertura y cierre final como segmentos independientes.
7. Crear alertas persistentes para patrones fuera de horario, sin cambiar automáticamente la configuración.
8. Resolver con infraestructura el certificado CA/proxy corporativo para no depender de excepciones TLS.

## 11. Regla de continuidad

Antes de modificar logica:

1. confirmar que se trabaja en `CRM_Frontend/src/pages/CctvModule.jsx` y no en el MVP Table Trello;
2. conservar las señales originales del API;
3. añadir campos derivados en lugar de cambiar contratos existentes;
4. probar hoy, histórico, sin CCTV y punto doble;
5. ejecutar build y las 52 pruebas antes de desplegar;
6. respaldar SQLite y no ejecutar dos escritores simultáneos;
7. verificar el portal por `192.168.8.65:3003` despues de recrear contenedores.
