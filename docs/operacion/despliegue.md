# Operacion - Despliegue y VPS

## Flujo normal

1. Cambios locales.
2. Verificacion minima segun modulo.
3. Commit.
4. Push a `origin/main`.
5. Pull en VPS.
6. Rebuild/restart del contenedor afectado.

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

