# Operación — Despliegue local dockerizado (paso obligatorio antes de producción)

Todo cambio de `CRM_Frontend` se verifica aquí, en `http://127.0.0.1:3003/`, **antes** de
abrir PR y **antes** de tocar producción (`http://192.168.8.65:3003/`).
Ver `docs/WORKING_MODEL.md` §3.

## Requisitos

- Docker Desktop en marcha (Windows).
- Root `.env` con `VITE_SUPABASE_ANON_KEY` definido (lo usan los `build.args`).
- Puertos libres en el host: `3001`, `3002`, `3003`, `3004`, `3006`.

## Levantar

Mínimo — frontend + dependencias directas (CCTV, Ciberseguridad, Soporte):

```bash
docker compose -f docker-compose.yml -f docker-compose.local.yml up -d --build crm-frontend
```

Completo — todos los backends que consume el CRM:

```bash
docker compose -f docker-compose.yml -f docker-compose.local.yml up -d --build \
  crm-frontend comercial-bot asamblea-bot monitoreo-ti chatbot-soporte cctv-api cybersecurity-api
```

Validar la configuración fusionada sin construir nada:

```bash
docker compose -f docker-compose.yml -f docker-compose.local.yml config
```

> El primer build es lento: los contextos de `comercial-bot` y `cctv-api` son grandes.

## Smoke test en `http://127.0.0.1:3003/`

- [ ] Carga el login; se puede iniciar sesión (Supabase).
- [ ] `/` **Analítica de Agentes**: pestañas Bot Comercial y Bot Soporte Técnico renderizan.
      KPIs, gráfica de actividad, donut y Ranking cargan (o muestran vacío controlado, sin crash).
- [ ] Ranking: selector de rango (`24h`/`7d`/`1m`/`1y`), paginación, filtro de canal, orden
      de columnas y "Exportar CSV" funcionan.
- [ ] `/monitoring` y `/monitoring/services-ti` cargan contra `127.0.0.1:3001` / `:3004`.
- [ ] `/points` carga; el mapa (Leaflet) aparece.
- [ ] `/support` embebe el panel de `127.0.0.1:3006`.
- [ ] Consola del navegador sin errores nuevos respecto a `main`.
- [ ] Tema claro y oscuro: sin superficies "rotas" (herencia de `bg-white/5`).

## Logs y parada

```bash
docker compose -f docker-compose.yml -f docker-compose.local.yml logs -f --tail 100 crm-frontend
docker compose -f docker-compose.yml -f docker-compose.local.yml down
```

## Notas / limitaciones conocidas

- **Supabase es el de producción** también en local (no hay proyecto de staging). Las
  lecturas son seguras; evitar operaciones de escritura de prueba. Riesgo registrado en
  `ADR-0001` y `specs/0001-modelo-de-trabajo-sdd/spec.md` §7.
- `cybersecurity-api` corre endurecido (`read_only`, `user:`, `cap_drop`). Si no llega a
  `healthy` en local, el override ya evita que bloquee al frontend (`service_started`).
- Config build-time: si cambias un `VITE_*`, hay que reconstruir (`--build`). Ver
  `docs/lecciones-aprendidas/LL-0001-config-build-time-vite.md`.
