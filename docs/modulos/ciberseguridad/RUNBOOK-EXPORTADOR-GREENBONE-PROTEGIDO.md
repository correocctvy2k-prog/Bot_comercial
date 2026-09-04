# Runbook - exportador Greenbone protegido

Estado: exportador y pruebas extremo a extremo completos; helper de consulta
del scanner pendiente de instalacion controlada.

## Frontera de seguridad

El exportador no se conecta a PostgreSQL, `gvmd` ni GMP. Recibe por `stdin` un
modelo de lectura efimero generado por un helper local y produce un contrato
protegido. Esta separacion evita entregar credenciales al exportador y desacopla
Skylab de las tablas internas de Greenbone.

El helper local debe cumplir estas condiciones:

- aceptar solamente un UUID de reporte con formato validado;
- usar una cuenta PostgreSQL o GMP de solo lectura;
- consultar exclusivamente reportes terminados;
- ejecutarse con una consulta fija, sin SQL construido por concatenacion;
- escribir el modelo por `stdout`, no en almacenamiento persistente;
- no incluir credenciales, tokens ni rutas en el JSON;
- asociar el reporte a una autorizacion de escaneo vigente.

## Modelo de lectura

El modelo usa `SourceSystem: GREENBONE_READ_ONLY_EXTRACTION`, estado `DONE`,
referencia de autorizacion, tiempos, perfil y resultados. Este modelo sí puede
contener temporalmente el host porque existe solo dentro del pipeline local.
Nunca debe enviarse por SFTP ni conservarse como evidencia central.

Ejemplo anonimizado:

`cybersecurity/fixtures/greenbone-read-model-anonymized.json`

## Clave de identidad

La clave HMAC debe tener al menos 32 bytes aleatorios, residir fuera del
repositorio y tener permisos `0600`. No se pasa por argumento, variable de
entorno ni salida de consola; solamente se entrega su ruta.

Ejemplo de creacion inicial en Linux:

```bash
sudo install -d -o root -g cyberingest -m 0750 /etc/skylab-cyber
sudo openssl rand -out /etc/skylab-cyber/greenbone-target-hmac.key 32
sudo chown root:cyberingest /etc/skylab-cyber/greenbone-target-hmac.key
sudo chmod 0640 /etc/skylab-cyber/greenbone-target-hmac.key
```

La version de clave es un identificador no secreto, por ejemplo
`greenbone-target-hmac-2026-01`. Una rotacion crea una version nueva; no
sobrescribe silenciosamente la anterior.

## Exportacion

Para una prueba con archivo local:

```bash
node scripts/export-greenbone-protected.js \
  --input fixtures/greenbone-read-model-anonymized.json \
  --identity-key-file /etc/skylab-cyber/greenbone-target-hmac.key \
  --identity-key-version greenbone-target-hmac-2026-01 \
  --output /var/lib/skylab-sftp/skylabgreenbone/incoming
```

En produccion se debe usar un pipe para evitar almacenar el modelo crudo:

```bash
/usr/local/sbin/skylab-greenbone-read-report REPORT_UUID AUTH_REFERENCE \
  | node scripts/export-greenbone-protected.js \
      --input - \
      --identity-key-file /etc/skylab-cyber/greenbone-target-hmac.key \
      --identity-key-version greenbone-target-hmac-2026-01 \
      --output /var/lib/skylab-sftp/skylabgreenbone/incoming
```

Los valores en mayusculas son marcadores documentales, no deben copiarse
literalmente.

## Controles aplicados

- exige reporte `DONE` y referencia de autorizacion;
- valida tiempos, perfil, puertos, severidad y QoD;
- genera fingerprints HMAC de reporte, objetivo y resultado;
- elimina IP, MAC, IPv6 y caracteres de control de la evidencia;
- limita cada evidencia a 8192 caracteres;
- escribe con permiso `0640`, sincroniza y publica atomicamente;
- no sobrescribe un archivo diferente con el mismo nombre;
- una segunda exportacion identica devuelve `ALREADY_EXPORTED`.

La salida de consola contiene solamente estado, nombre protegido, cantidad y
bytes; nunca muestra objetivos, CVE ni evidencia.

## Contenedor opcional

`Dockerfile.greenbone-exporter` ejecuta el transformador como usuario no root.
No necesita red: recibe el modelo por `stdin`, una clave montada read-only y un
buzon de salida. El helper de consulta permanece fuera del contenedor y conserva
sus permisos de lectura mínimos.

## Pendiente para el scanner piloto

Antes de instalar el helper se debe capturar y versionar la consulta de solo
lectura compatible con `gvmd 26.37.0 / DB revision 281`, validar que no depende
del esquema `vts` ausente y probarla contra un reporte terminado. Esta accion no
debe modificar ni reconstruir la base de Greenbone.
