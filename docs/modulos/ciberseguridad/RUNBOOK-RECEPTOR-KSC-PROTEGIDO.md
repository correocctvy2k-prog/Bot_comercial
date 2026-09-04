# Runbook - receptor KSC protegido

- Estado: piloto local operativo
- Receptor: `skylab-scanner01`
- Version inicial validada: `0.1.1`
- Fecha: 2026-08-31

## Flujo

1. `Skylab_Monitor_Inventory` genera a las 09:00 el JSON protegido en
   SERV-KSC sin alterar el contrato de Monitoreo IT.
2. `Skylab_Cyber_KSC_Transfer` intenta entregar a las 09:10 mediante SFTP.
3. El nombre remoto combina `GeneratedAt` y SHA-256. La carga usa `.part` y
   `rename`; una repeticion reconoce una entrega existente.
4. `skylab-ksc-receiver.timer` ejecuta cada cinco minutos un contenedor sin red.
5. El receptor valida, reclama el archivo, importa solo a staging SQLite y
   conserva la evidencia aceptada por SHA-256.

## Rutas del scanner

- Aplicacion: `/opt/skylab-cyber/ksc-receiver`
- Entrada SFTP: `/var/lib/skylab-sftp/skylabksc/incoming`
- Estado: `/var/lib/skylab-cyber`
- Base: `/var/lib/skylab-cyber/data/cyber-inventory.db`
- Backups verificados: `/var/lib/skylab-cyber/backups`
- Aceptados: `/var/lib/skylab-cyber/accepted`
- Rechazados: `/var/lib/skylab-cyber/rejected`
- Evidencia de preparacion: `/var/lib/skylab-cyber/manual-setup-20260831`

## Controles aplicados

- `skylabksc` solo puede usar SFTP dentro de su chroot.
- El firewall limita TCP/22 al origen SERV-KSC.
- `cyberingest` no tiene shell y comparte solo el grupo `cyberdrop`.
- Los archivos nuevos usan `umask 0027`.
- El contenedor usa UID 996, no tiene red, elimina todas las capabilities,
  activa `no-new-privileges` y monta su raiz en solo lectura.
- El receptor ignora `.part`, rechaza symlinks, limita cada exportacion a
  10 MiB y comprueba que el archivo no cambie durante la lectura.
- Una importacion no crea activos canonicos ni autorizaciones de escaneo.

## Comprobacion diaria

```bash
sudo systemctl list-timers skylab-ksc-receiver.timer --all --no-pager
sudo systemctl show skylab-ksc-receiver.service -p Result -p ExecMainStatus
sudo journalctl -u skylab-ksc-receiver.service --since today --no-pager
```

Una ejecucion normal devuelve conteos JSON y codigo cero. `rejected > 0` causa
codigo distinto de cero y requiere revision; nunca se debe importar
manualmente el archivo rechazado sin determinar la causa.

## Backup local verificado

`skylab-cyber-backup.timer` crea diariamente alrededor de las 02:30 un
snapshot SQLite consistente y un manifiesto. Ambos servicios usan
`/run/skylab-cyber/state.lock`, por lo que backup e ingestion no escriben de
forma concurrente.

El manifiesto registra SHA-256, tamano, integridad, violaciones de claves
foraneas, conteos agregados y hashes de evidencias aceptadas. Una copia valida
debe tener `integrity=ok`, cero violaciones y el mismo SHA-256 que el archivo
`.db`. No se eliminan snapshots automaticamente.

Esta copia reside en el mismo disco que la base activa. Protege frente a
corrupcion logica y facilita rollback, pero no constituye recuperacion ante
falla o perdida fisica del scanner. Sigue pendiente una replica externa
cifrada y una prueba formal de restauracion.

## Pausa y rollback

Pausar solo el receptor no afecta KSC ni Monitoreo IT:

```bash
sudo systemctl disable --now skylab-ksc-receiver.timer
```

La imagen `0.1.0` y el paquete instalado se conservan durante la validacion del
piloto. Un rollback debe mantener una copia consistente de SQLite, los
directorios `accepted` y `rejected`, y registrar la version restaurada. No se
deben borrar entregas ni reescribir snapshots ya importados.

## Pendientes antes de produccion plena

- Retencion y copia de seguridad cifrada para SQLite y evidencias.
- Alerta central cuando systemd marque fallo o existan rechazados.
- Prueba formal de restauracion y rotacion de HMAC/SSH.
- Promocion desde staging solo mediante reglas y revision aprobadas.
