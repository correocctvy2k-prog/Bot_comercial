# Runbook - receptor Greenbone protegido

Estado: implementacion local verificada, pendiente de despliegue controlado.

## Proposito

Ingresar resultados de vulnerabilidad a Skylab sin entregar a la base central
credenciales de Greenbone, direcciones IP, MAC, hostnames ni rutas del servidor
scanner. El canal no inicia escaneos y no modifica activos.

## Contrato

El JSON usa `SchemaVersion: 1` y
`SourceSystem: GREENBONE_RESULTS_PROTECTED`. Cada objetivo y resultado se
identifica mediante HMAC-SHA256 estable. La clave HMAC permanece en el origen y
solo se publica su version.

Se permiten los siguientes datos tecnicos:

- tiempos de inicio y finalizacion del escaneo;
- perfil utilizado;
- fingerprint de reporte, objetivo y resultado;
- puerto, transporte, OID del NVT, titulo, severidad y QoD;
- CVE y evidencia sanitizada necesaria para remediacion.

El validador rechaza campos de identidad cruda, credenciales, secretos y tokens,
incluso anidados. Tambien rechaza IP o MAC dentro del texto de evidencia.

## Flujo de custodia

1. El exportador escribe primero un archivo con sufijo `.part`.
2. Tras completar y sincronizar la escritura, lo renombra atomicamente a `.json`.
3. El receptor reclama el archivo mediante rename y lo lee con `O_NOFOLLOW`.
4. Comprueba tipo, tamano maximo e invariancia durante la lectura.
5. Valida el contrato antes de abrir la transaccion SQLite.
6. Importa fuente, captura, evidencia y casos en una unica transaccion.
7. Archiva el contenido aceptado por su SHA-256 o conserva evidencia y error
   sanitizado en `greenbone-rejected`.

## Verificacion local

```bash
cd cybersecurity
npm run validate:greenbone-protected -- fixtures/greenbone-protected-anonymized.json
npm test
```

## Ejecucion del receptor

```bash
node scripts/receive-greenbone-protected.js \
  --incoming /ruta/restringida/incoming \
  --state-root /ruta/restringida/state \
  --db /ruta/restringida/state/data/cyber-inventory.db
```

La salida es exclusivamente un resumen agregado:

```json
{"discovered":1,"accepted":1,"alreadyImported":0,"rejected":0}
```

Un valor `rejected` mayor que cero produce codigo de salida 2 para que systemd
o el sistema de monitoreo lo detecten.

## Contenedor

El servicio `greenbone-protected-receiver` usa red deshabilitada, filesystem de
contenedor de solo lectura, capacidades eliminadas y `no-new-privileges`. Debe
ejecutarse con UID/GID explicitos y acceso solamente al buzon Greenbone y al
estado de Skylab.

Antes del despliegue se deben crear por separado:

- cuenta SFTP dedicada sin shell;
- directorio `incoming` con permisos de deposito y sin lectura global;
- unidad systemd oneshot protegida por el mismo `flock` del receptor KSC;
- temporizador posterior a la ventana de exportacion;
- copia de seguridad verificada de SQLite.

## Limite actual

Este hito implementa el contrato, importador y receptor. El exportador que
consulta Greenbone y genera el JSON protegido se desarrollara como componente
separado, con permisos de solo lectura y sin acceso a las credenciales desde el
contenedor receptor.
