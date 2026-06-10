# Modulo - Bot Asamblea

## Proposito

Bot especializado para la Asamblea 2026. Gestiona interacciones, padron, sincronizaciones y reportes asociados al evento.

## Ubicacion

```text
Asamblea/
```

## Contenedores

| Contenedor | Rol |
| --- | --- |
| `asamblea-bot` | API y webhooks del bot Asamblea |
| `asamblea-worker` | Procesamiento de cola del bot Asamblea |

## Archivos y carpetas clave

| Ruta | Responsabilidad |
| --- | --- |
| `Asamblea/src/` | Codigo principal del bot |
| `Asamblea/assets/` | Recursos visuales y archivos del evento |
| `Asamblea/sql/` | Consultas o scripts SQL asociados |
| `Asamblea/charts_asamblea.py` | Generacion de graficos |
| `Asamblea/sync_padron.js` | Sincronizacion del padron |
| `Asamblea/sync_empresas_siiss.js` | Sincronizacion con SIISS |
| `Asamblea/import_excel_padron.js` | Importacion de datos desde Excel |

## Datos y dependencias

- Supabase para tablas de Asamblea.
- SIISS para sincronizaciones.
- WhatsApp/Telegram segun configuracion del bot.
- Python para generacion de graficos cuando aplique.

## Antes de modificar

- Validar si el cambio afecta padron, SIISS o flujo conversacional.
- No mezclar cambios del Bot Comercial con Asamblea salvo que sea una abstraccion compartida.
- Revisar `PROYECTO_CONTEXTO.md` para tablas y flujo historico.

## Verificacion minima

```bash
cd Asamblea
npm install
npm start
```

En VPS:

```bash
cd Asamblea
sudo docker compose restart
```

O desde la raiz si se reconstruye:

```bash
sudo docker compose up -d --build asamblea-bot asamblea-worker
```

