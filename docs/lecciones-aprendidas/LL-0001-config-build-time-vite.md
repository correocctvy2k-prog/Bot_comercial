# LL-0001 — La config del CRM_Frontend es build-time, no runtime

- **Fecha:** 2026-09-07
- **Módulo:** CRM_Frontend
- **Spec / PR:** `specs/0001-modelo-de-trabajo-sdd/`

## Contexto

Al diseñar el pipeline "desplegar primero en local `http://127.0.0.1:3003/`", la suposición
inicial era que bastaría con un `.env` distinto para apuntar el frontend a servicios locales.

## Qué pasó

No hay ningún punto donde el contenedor `crm-frontend` lea variables de entorno en runtime.
El `Dockerfile` (`CRM_Frontend/Dockerfile`) declara `ARG VITE_*` → `ENV VITE_*` → `RUN npm run build`,
y el resultado es un bundle estático servido por nginx. Las `VITE_*` quedan **incrustadas en
el JS compilado**. El `docker-compose.yml` base las fija a `http://192.168.8.65:...` como
`build.args`.

## Causa raíz

Vite reemplaza `import.meta.env.VITE_*` en tiempo de compilación. Una vez hecho `npm run build`,
cambiar variables de entorno del contenedor no tiene efecto: hay que **reconstruir la imagen**
con otros `build.args`.

## Solución

`docker-compose.local.yml` (override) que redefine `crm-frontend.build.args` apuntando a
`http://127.0.0.1:<puerto>` y baja `depends_on` a `service_started` para que el frontend
arranque aunque `cctv-api` / `cybersecurity-api` estén degradados en local. El archivo base
no se toca. Arranque:

```bash
docker compose -f docker-compose.yml -f docker-compose.local.yml up -d --build crm-frontend
```

## Regla nueva

- Cualquier cambio de entorno del frontend = **rebuild con `build.args`**, no edición de env.
- El override local vive en `docker-compose.local.yml`; el `docker-compose.yml` base solo se
  toca con ADR previo.
- Reflejado en `docs/WORKING_MODEL.md` §2 y `ADR-0001`.

## Enlaces

- `CRM_Frontend/Dockerfile`
- `docker-compose.yml` (servicio `crm-frontend`, líneas de `build.args`)
- `docker-compose.local.yml`
- `docs/operacion/despliegue-local.md`
