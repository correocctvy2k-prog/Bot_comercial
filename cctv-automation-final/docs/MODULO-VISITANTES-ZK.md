# Módulo de visitantes ZK

## Fuente

- Carpeta IMAP de solo lectura: `Reporte Visitantes`.
- Asunto esperado: `Reporte Diario de Visitantes`, incluyendo variantes reenviadas.
- El consolidado se recibe como tabla HTML de 14 columnas dentro del correo.
- Los correos no se marcan como leídos, no se mueven y no se eliminan.

## Tratamiento

- La importación es idempotente por carpeta, UID y fila de origen.
- El número de documento no se almacena en texto claro: se conserva una huella SHA-256 para reconocer reincidencias y una referencia enmascarada para la interfaz.
- Se persisten visitante, anfitrión, razón, estado, entrada, salida y lugares de control.
- Los reportes reenviados se fechan por la hora de entrada de sus filas; los futuros mensajes directos utilizan la misma estructura.

## Operación

- Importación manual: `npm run import:visitors`.
- La importación forma parte de `npm run cycle:operational`.
- El importador admite varios reportes HTML en un solo mensaje y correos `.eml`
  adjuntos. Cada reporte interno conserva una referencia idempotente propia.
- Para históricos, se puede reenviar un mes por mensaje siempre que cada informe
  conserve su tabla HTML o se adjunte como `.eml`; no se deben convertir a imagen.
- Corte diario recomendado: 20:00 (America/Bogota), una hora después del envío ZK.
- El cierre operativo general de Seguridad Electrónica se realiza a las 22:00;
  la importación ZK de las 20:00 es una fuente previa a ese cierre.
- API: `GET /api/cctv/visitors?period=DAY|WEEK|MONTH|YEAR&date=YYYY-MM-DD`.
- Frontend: pestaña `Visitantes`, que reemplaza a `Alertas` en la navegación primaria.

## Indicadores iniciales

- visitas del periodo;
- visitantes únicos;
- primera visita y visitantes recurrentes;
- visitas sin salida;
- distribución temporal;
- razones de visita;
- anfitrión y bitácora con documento protegido.
