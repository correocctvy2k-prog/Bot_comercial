# PLAN NNNN — <título>

Referencia: `spec.md` en esta misma carpeta.

## Enfoque técnico

Descripción breve de la solución elegida y por qué, frente a alternativas descartadas.

## Archivos a tocar

| Archivo | Cambio | Riesgo |
|---------|--------|--------|
| `CRM_Frontend/src/...` | | bajo/medio/alto |

## Contratos de datos / API

Tablas Supabase, endpoints, formas de payload, nuevas columnas. Compatibilidad hacia atrás.

## Diseño / UI

Componentes nuevos o modificados. Cómo cumplen `design-system.md`.

## Plan de rollout

1. Local dockerizado + smoke test.
2. PR + CI.
3. Merge + deploy a prod.

## Plan de rollback

Cómo se revierte si falla en prod (revert del commit / rebuild del contenedor con el tag anterior / etc.).

## Verificación

Comandos y pasos manuales para comprobar cada criterio de aceptación.
