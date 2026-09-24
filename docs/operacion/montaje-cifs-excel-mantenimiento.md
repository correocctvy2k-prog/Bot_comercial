# Runbook — montar el Excel de mantenimiento (CIFS) en `.65`

Contexto: `specs/0016-mantenimiento-excel-sync/`. El Excel de seguimiento vive en un recurso
compartido de Windows (`\\ganepalmir\dpto.informatica\Director.Informatica\...\2026 programacion
anual CCTV.xlsx`). `.65` es Linux y hoy no tiene forma de alcanzar esa ruta. Estos pasos se
ejecutan **en `.65` por SSH** — esta sesión de Claude no tiene acceso SSH a ese servidor.

## 1. Instalar cliente CIFS

```bash
sudo apt-get update && sudo apt-get install -y cifs-utils
```

## 2. Crear el archivo de credenciales (nunca en `docker-compose.yml` ni en git)

```bash
sudo mkdir -p /etc/skylab
sudo tee /etc/skylab/excel-mantenimiento.credentials > /dev/null <<'EOF'
username=<usuario_windows>
password=<contraseña>
domain=<dominio_si_aplica>
EOF
sudo chmod 600 /etc/skylab/excel-mantenimiento.credentials
```

## 3. Punto de montaje y prueba manual

```bash
sudo mkdir -p /mnt/excel-mantenimiento-cctv
sudo mount -t cifs "//ganepalmir/dpto.informatica" /mnt/excel-mantenimiento-cctv \
  -o credentials=/etc/skylab/excel-mantenimiento.credentials,uid=$(id -u),gid=$(id -g),iocharset=utf8,vers=3.0

# Confirmar que el archivo aparece:
ls "/mnt/excel-mantenimiento-cctv/Director.Informatica/1_SGC Indicadores de Gestión/Indicadores Recursos Tecnológicos/Año 2026 - (informatica)/2026 programacion anual CCTV.xlsx"
```

Si `mount` falla, revisar primero: (a) el nombre de host `ganepalmir` resuelve desde `.65`
(`ping ganepalmir` o usar la IP directa), (b) la versión SMB del servidor (`vers=3.0` es lo
usual en Windows moderno; si falla, probar `vers=2.1`), (c) usuario/clave correctos.

## 4. Montaje persistente (sobrevive reinicios)

Agregar a `/etc/fstab`:

```
//ganepalmir/dpto.informatica /mnt/excel-mantenimiento-cctv cifs credentials=/etc/skylab/excel-mantenimiento.credentials,uid=1000,gid=1000,iocharset=utf8,vers=3.0,_netdev 0 0
```

`_netdev` es importante: le dice al sistema que espere a que la red esté lista antes de montar.
Verificar con `sudo mount -a` (no debe dar error) y `sudo systemctl daemon-reload`.

## 5. Exponer el punto de montaje al contenedor `cctv-api`

En `docker-compose.yml`, agregar el bind-mount **solo en `.65`** (no en local, no se versiona
como cambio permanente salvo que el equipo decida que todos los entornos deben montarlo):

```yaml
  cctv-api:
    volumes:
      - ./cctv-automation-final/data:/var/lib/skylab-security/data
      # ... (volúmenes existentes)
      - /mnt/excel-mantenimiento-cctv:/var/lib/skylab-security/excel-share:rw
```

## 6. Configurar la ruta en `.env` de `cctv-automation-final` en `.65`

```
MAINTENANCE_EXCEL_PATH=/var/lib/skylab-security/excel-share/Director.Informatica/1_SGC Indicadores de Gestión/Indicadores Recursos Tecnológicos/Año 2026 - (informatica)/2026 programacion anual CCTV.xlsx
```

## 7. Rebuild y verificación

```bash
sudo docker compose up -d --build cctv-api
curl -s http://127.0.0.1:3003/api/cctv/maintenance/excel-status
```

Debe responder `"configured": true, "accessible": true`. Si `"accessible": false`, revisar
permisos de escritura del usuario de Windows sobre esa carpeta (el backend necesita
lectura **y** escritura).

## Rollback

Quitar `MAINTENANCE_EXCEL_PATH` del `.env` (la sincronización se desactiva sola, sin afectar el
resto del pipeline de Trello) y, si hace falta, `sudo umount /mnt/excel-mantenimiento-cctv` +
quitar la línea de `/etc/fstab`.
