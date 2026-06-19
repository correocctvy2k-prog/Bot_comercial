# Skylab Node Monitor

Dashboard Node.js independiente para monitorear servidores agregando nombre, IP, puerto, usuario y contrasena.

## Que monitorea

- Estado TCP del puerto configurado.
- Latencia de conexion.
- Metricas Linux por SSH:
  - CPU
  - RAM
  - Swap
  - Disco raiz
  - Uptime
  - Load average
- Contenedores Docker si el usuario remoto tiene permisos para ejecutar `docker`.

## Instalacion

```bash
cd skylab-node-monitor
npm install
npm start
```

Abrir:

```text
http://localhost:8088
```

## Configuracion

Desde la dashboard puedes crear, editar, pausar o eliminar servidores.

Campos:

- Nombre visible.
- IP o hostname.
- Puerto, normalmente `22` para SSH.
- Usuario.
- Contrasena.
- Tipo: Linux/SSH o TCP solamente.
- Tags opcionales separados por coma.

## Variables

```bash
PORT=8088
POLL_INTERVAL_MS=30000
SSH_TIMEOUT_MS=8000
DATA_DIR=./data
```

## Seguridad

Este proyecto guarda credenciales en `data/targets.json`. Usalo primero dentro de red privada. Para produccion publica conviene agregar autenticacion al panel y cifrado de credenciales con una clave local.
