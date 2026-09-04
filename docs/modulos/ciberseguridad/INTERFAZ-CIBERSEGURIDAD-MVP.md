# Interfaz Skylab Cybersecurity - MVP

Estado: primera interfaz y API read-only implementadas, 2026-08-31.

## Alcance

La interfaz incorpora el modulo Ciberseguridad dentro de Seguridad Perimetral.
Consume exclusivamente una API local de lectura; el navegador no abre SQLite,
no se conecta a Greenbone y no recibe fingerprints completos.

Incluye:

- resumen de casos abiertos, P1, validaciones y evidencias;
- distribucion por prioridad tecnica;
- fecha de la ultima captura Greenbone;
- filtros por prioridad y estado;
- bandeja ordenada por prioridad y severidad;
- detalle de caso con CVE, puerto, QoD, confianza y evidencia sanitizada;
- alias protegido cuando el activo aun no esta conciliado.

No incluye todavia cambios de estado, aceptacion de riesgo ni acciones de
remediacion. Esas operaciones requeriran permisos propios, motivo obligatorio
y registro en `cyber_audit_log`.

## API

En desarrollo, la API escucha por defecto solamente en `127.0.0.1:3005`. En
Docker utiliza el mismo puerto exclusivamente dentro de la red interna. Nginx
la publica bajo `/api/cybersecurity/*` en el portal existente del puerto
`3003`. La API abre SQLite con
`readOnly` y `PRAGMA query_only = ON`.

Compose usa `./cybersecurity/data` como origen local. En el servidor se debe
definir `CYBER_DATA_DIR=/var/lib/skylab-cyber/data` sin publicar el puerto 3005.
El modo `--immutable` se usa solamente con una captura SQLite estable y sin WAL
pendiente. La interfaz productiva debe leer una instantanea verificada o una
replica de lectura, no declarar inmutable la base viva del receptor.

Endpoints:

- `GET /api/cybersecurity/health`
- `GET /api/cybersecurity/overview`
- `GET /api/cybersecurity/cases`
- `GET /api/cybersecurity/cases/:id`

Los filtros admitidos son `priority`, `status` y `limit`. Otros métodos reciben
`405 METHOD_NOT_ALLOWED`.

## Ejecucion local con datos anonimizados

Crear una base temporal, sin sobrescribir una existente:

```bash
cd cybersecurity
npm run demo:create -- --db ./temp/cyber-demo.db
npm run api:serve -- --db ./temp/cyber-demo.db
```

En otra terminal:

```bash
cd CRM_Frontend
npm run dev
```

Tras reconstruir el portal e iniciar sesion, la ruta integrada es:

```text
/points/cybersecurity
```

Para QA local existe `/dev/cybersecurity`, pero solamente cuando Vite ejecuta
en modo desarrollo. La compilacion productiva redirige esa ruta al login.

## Seguridad de presentacion

- `target_key` y `host_reference` nunca salen de la API.
- Los activos no conciliados se muestran como `Activo protegido XXXXXXXX`.
- Las respuestas usan `Cache-Control: no-store`, `nosniff` y CSP restrictiva.
- El usuario entra solamente por `http://127.0.0.1:3003`; el puerto interno
  `3005` no se publica en el host.
- La API es de lectura y se publica detrás de la autenticacion del portal.
- La ruta de desarrollo no debe habilitarse en un despliegue productivo.

## Proximo incremento

1. Continuar clasificando los pendientes residuales producidos por la
   desagregacion de segmentos FortiGate.
2. Conciliar fingerprints Greenbone con activos canonicos KSC/FortiGate.
3. Agregar enriquecimiento KEV, EPSS y MITRE.
4. Incorporar un score contextual explicable.
5. Diseñar mutaciones auditadas de tratamiento de riesgo.

## Desagregacion de segmentos

Un grupo marcado `NEEDS_SPLIT` no altera las observaciones originales. En la
lectura administrativa, cada IP se compara con las políticas `APPROVED` y se
reasigna de forma derivada a la red coincidente. Si hay redes superpuestas se
elige el prefijo más específico. Las IP sin coincidencia forman pendientes
estables por prefijo `/24`, que pueden clasificarse y convertirse en destinos
aplicados en la siguiente lectura. Este cálculo es idempotente y mantiene la
evidencia FortiGate intacta.

Para políticas históricas aplicadas antes de exigir CIDR, la lectura puede
inferir un `/24` únicamente cuando al menos el 80% de las IP únicas del grupo
pertenecen al mismo prefijo. La inferencia se identifica como
`INFERRED_DOMINANT_24`; no modifica silenciosamente la política almacenada.
