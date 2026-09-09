# LL-0003 — Resolver un teléfono enmascarado sin exponer el crudo ni cambiar el modelo

- **Fecha:** 2026-09-08
- **Contexto:** `specs/0005-bots-gane-palmira/` tanda 4 — ficha de contacto + transcripción por
  bot. Servicio `chatbot-analytics` con `MASK_PHONES=1` en local y producción.

## Qué pasó

El nuevo endpoint `GET /api/<bot>/contact?id=<telefono>` necesitaba, dado un teléfono, sacar
sus mensajes de `state.events`. Pero la tabla de personas/clientes del CRM sólo conoce el
teléfono **ya enmascarado** (`57••••••4631`), porque `maskModel()` lo enmascara antes de
responder `/analytics` y `/users`. Opciones que se descartaron:

- **Añadir un `contactId` opaco a cada fila del modelo** — cambia el contrato de las rutas
  existentes → obligaría a un ADR y a tocar `maskModel`, el frontend y el CSV.
- **Desenmascarar en el endpoint** — reintroduce el teléfono crudo en una respuesta nueva,
  justo lo que `MASK_PHONES` evita.
- **Match por sufijo (`…4631`)** — colisiona y es frágil.

## Lección

`maskPhone()` es **determinista**: `maskPhone(peer)` produce siempre el mismo string. Entonces
el endpoint resuelve el peer real recorriendo los peers en memoria y comparando
`maskPhone(peer) === id` (y, si `MASK_PHONES=0`, `String(peer) === id` directo). No hace falta
tocar el modelo, ni un id nuevo, ni desenmascarar: el id enmascarado **es** la clave de
búsqueda. El endpoint queda aditivo → sin ADR.

Efecto colateral útil: si dos teléfonos colapsaran al mismo enmascarado, gana el primero; es
aceptable para una vista gerencial de solo lectura y no filtra datos.

## Acción / a recordar

- Cualquier endpoint nuevo que reciba un teléfono desde el CRM debe asumir que llega
  enmascarado y resolverlo con `maskPhone`. Ver `chatbot-analytics/lib/contact.js` →
  `resolvePeer()`.
- Trampa de depuración: probar el endpoint con `curl` desde Git Bash en Windows **mangla los
  bytes UTF-8 del `•`** y da 404 falso. Verificar desde dentro del contenedor
  (`docker exec ... node -e`) o desde el navegador (fetch UTF-8), no desde el shell.
