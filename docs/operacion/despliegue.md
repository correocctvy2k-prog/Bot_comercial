# Operacion - Despliegue y VPS

> **Orden obligatorio (ver `docs/WORKING_MODEL.md` §3):**
> 1. Build dockerizado local + smoke test en `http://127.0.0.1:3003/`
>    (`docs/operacion/despliegue-local.md`).
> 2. Commit en rama + PR en GitHub. CI verde.
> 3. Merge a `main`.
> 4. Recien entonces, promover a produccion `http://192.168.8.65:3003/` con los pasos de abajo.
>
> Nunca se despliega a produccion algo que no paso por (1) y (2).

## Flujo normal (promocion a produccion, post-merge)

1. Cambios ya verificados en local dockerizado y mergeados a `main` via PR.
2. Pull en el servidor.
3. Rebuild/restart del contenedor afectado.
4. Verificar en `http://192.168.8.65:3003/`.

## VPS

Ruta esperada:

```bash
cd ~/Bot_comercial/Bot_comercial
```

Actualizar codigo:

```bash
sudo git pull origin main
```

## Docker Compose

Reconstruir todo:

```bash
sudo docker compose up -d --build
```

Reconstruir solo CRM:

```bash
sudo docker compose up -d --build crm-frontend
```

Reconstruir Bot Comercial:

```bash
sudo docker compose up -d --build comercial-bot comercial-worker
```

Reconstruir Asamblea:

```bash
sudo docker compose up -d --build asamblea-bot asamblea-worker
```

## Logs

```bash
sudo docker logs -f --tail 100 comercial-bot
sudo docker logs -f --tail 100 comercial-worker
sudo docker logs -f --tail 100 crm-frontend
sudo docker logs -f --tail 100 asamblea-bot
```

## Puertos

| Servicio | Puerto |
| --- | --- |
| Bot Comercial / Backend principal | `3001` |
| Bot Asamblea | `3002` |
| CRM Frontend | `3003` |

## Checklist antes de avisar al usuario

- Confirmar que el commit incluye solo archivos relacionados.
- Confirmar que no se incluyeron `.env`, logs temporales o reportes locales.
- Indicar comando de pull en VPS.
- Indicar si se requiere rebuild de contenedores.

