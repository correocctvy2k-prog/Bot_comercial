# Monitor Dashboard — Cambios recientes y verificación

Resumen breve
- Se eliminó la tarjeta duplicada de "Kaspersky KSC" que aparecía dentro de los `DCCard`.
- Se restauró la tarjeta `AD02` bajo el panel `ANFIGANE` (AD01 + AD02).
- Se ajustó `SERV-KSC` para ocupar la misma columna que `AD03`, mostrar datos desde `nodes.ksc` y preferir el ping por la IP `192.168.8.42`.
- Se añadió prioridad en las claves de ping: `192.168.8.42`, `SERV-KSC`, `KSC`, `ksc`.

Archivos editados
- `CRM_Frontend/src/pages/Monitoring.jsx` — cambios principales de layout, mapeo de `nodes.ksc` y prioridad de `pingData`.
- (commits recientes) cambios comiteados y empujados a `origin/main`.

Objetivo de estos cambios
- Evitar tarjetas KSC duplicadas y mostrar una sola tarjeta consolidada de Kaspersky.
- Mostrar `SERV-KSC` correctamente (tamaño/columna y estado de ping).

Verificación rápida en navegador
1. Abrir la consola (DevTools) en la ruta `/monitoring`.
2. Revisar los mensajes `📡 [HEARTBEAT] Datos de ping recibidos:` — buscar una entrada con la clave `KSC` o `192.168.8.42`.
   - Ejemplo esperado: `"192.168.8.42": { status: 'UP', time: 1.03, ip: '192.168.8.42', checkedAt: 165... }`
3. Si esa entrada existe y `status === 'UP'`, la tarjeta `SERV-KSC` debería mostrar el LED verde (animado) y tiempo en ms.

Comandos para build y despliegue (local / servidor)
1. Construir producción (en el directorio `CRM_Frontend`):
```bash
cd CRM_Frontend
npm ci
npm run build
```
2. Si usas Docker Compose (desde la raíz del repo):
```bash
docker compose up -d --build crm-frontend
```
Notas:
- Si el daemon de Docker no está accesible en tu máquina, ejecuta el paso anterior en el servidor donde despliegas.
- El backend debe estar corriendo y emitiendo el evento `monitoring:heartbeat` con la clave `KSC` o la IP `192.168.8.42` para que el LED aparezca.

Próximos pasos recomendados
- Ejecutar la build y redeploy en el servidor de producción.
- Validar que el backend envíe la clave `KSC`/`192.168.8.42` en los heartbeats.
- Implementar fallback UNC (PowerShell) si es necesario para obtener `Último Backup` desde ruta de red.

Reversión rápida
- Si necesitas revertir sólo estos cambios, puedes volver al commit anterior en `origin/main` o revertir el archivo `src/pages/Monitoring.jsx` a la versión previa usando git.

Archivo de referencia
- `CRM_Frontend/src/pages/Monitoring.jsx` — aquí está la lógica del ping y los DCCards.

Contacto
- Dime si quieres que ejecute la `build` y haga el `docker compose up` desde aquí (si tienes acceso), o te doy los pasos exactos para el servidor.
