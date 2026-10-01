# PLAN 0020 — Soporte: interfaz compacta y bitácora horizontal

Referencia: `spec.md` en esta misma carpeta.

## Enfoque

1. **Chips de KPI en el encabezado**: cambiar el array `kpis` de
   `RealSupport` para guardar el componente de ícono directamente (no un
   elemento ya renderizado), y mapearlo dentro de una fila `flex flex-wrap`
   con borde superior separador, al final del bloque "Centro de actividad
   técnica" existente. Eliminar la fila de tarjetas KPI que estaba debajo.
2. **Bitácora a ancho completo + tarjetas horizontales**: cambiar el grid
   que emparejaba la bitácora con el panel "Tipos de actividad"
   (`xl:grid-cols-[.55fr_1.45fr]`) por un único `<Card>` a ancho completo.
   Reescribir el tile de cada tarjeta: de vertical (imagen `h-32` arriba,
   contenido abajo) a horizontal (`flex items-stretch`, imagen `w-44
   sm:w-56` a la izquierda, contenido `flex-1` a la derecha). Subir tamaños
   de texto (~20%) y el `max-h` del contenedor con scroll.
3. **Píldoras de tipo reactivas al período**: introducir `periodBaseItems`
   (los mismos filtros de período/estado/evidencia que ya existían, pero sin
   aplicar el filtro de tipo) y `typesForPeriod` (conteo por tipo sobre ese
   subconjunto). Reemplazar el panel lateral "Tipos de actividad" por una
   fila de píldoras dentro del `CardHeader` de la bitácora, usando
   `typesForPeriod` para los conteos y manteniendo el estado de filtro de
   tipo ya existente (`typeFilter` o equivalente) para resaltar la píldora
   activa.

## Verificación

- `npx eslint src/pages/CctvModule.jsx` — confirmar que el único cambio es
  un error adicional de la misma categoría ya tolerada (`Icon` no usado en
  destructuring de `.map`, falso positivo conocido).
- `npm run build` — verde.
- Docker local: rebuild de `crm-frontend` (con `docker-compose.local.yml`,
  nunca contra `.65`), `docker restart crm-frontend`, verificar `/api/cctv/
  support`, `/api/cctv/health`, `/api/cctv/maintenance`, `/api/
  cybersecurity/towers` y el bundle en `http://127.0.0.1:3003/`.
- Revisión visual pendiente del usuario tras el deploy (no hay navegador
  automatizado en este entorno).
