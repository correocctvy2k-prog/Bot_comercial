# LL-0010 — Al permitir que un matcher de texto vincule a "todos los que calcen", hace falta una regla de contención, no solo quitar el límite

- **Fecha:** 2026-10-01
- **Módulo:** `cctv-automation-final/platform/trello-support.js` (pestaña
  Soporte, Seguridad Electrónica), spec 0018
- **Spec / PR:** `specs/0018-soporte-tarjetas-multi-punto/`

## Contexto

`locationMatcher` vinculaba cada tarjeta de Trello al punto cuyo nombre
aparecía en el título — pero cuando el título mencionaba varios puntos reales
(común en tarjetas de ronda), el código original elegía en silencio el nombre
más largo y descartaba los demás. El usuario pidió vincular a **todos** los
puntos mencionados, no solo al de nombre más largo.

## Qué pasó

El cambio obvio — quitar el filtro de "solo el más largo gana" y devolver
todos los candidatos que hacen match por substring con límite de palabra —
se probó primero mentalmente como la solución completa. Antes de
implementarlo, se verificó cuántos pares de nombres de punto reales en la
base de datos son prefijo/sufijo el uno del otro (p.ej. "OFICINA PRINCIPAL"
dentro de "OFICINA PRINCIPAL AMAIME", dos puntos reales y distintos).

**Resultado: 43 pares de colisión reales.** Si se hubiera implementado "todos
los que calcen" sin más, cualquier tarjeta sobre "Oficina Principal Amaime"
habría quedado vinculada TAMBIÉN a "Oficina Principal" (un punto físicamente
distinto) — multiplicando falsos positivos nuevos en vez de arreglar los que
ya existían. La regla de "el más largo gana" que se estaba quitando, aunque
rota para el caso de verdaderos multi-punto, SÍ protegía contra este otro
caso sin que nadie lo hubiera notado explícitamente.

## Causa raíz

Un matcher de substring por nombre tiene dos problemas distintos que un
cambio ingenuo puede resolver uno y empeorar el otro:
1. **Múltiples menciones genuinamente independientes** en el mismo texto
   (varios puntos reales listados) — esto SÍ se quiere capturar todo.
2. **Un nombre corto que es prefijo/sufijo textual de otro punto distinto**
   (el mismo tramo de texto, no dos menciones separadas) — esto NO debe
   contarse como una mención aparte.

La regla vieja ("solo el más largo") resolvía (2) como efecto secundario
accidental, a costa de romper (1) por completo.

## Solución

Matcher con contención de tramos de texto: se registran todas las
*posiciones* donde cada candidato aparece (no solo si aparece). Una
coincidencia se descarta únicamente si su tramo queda **totalmente contenido**
dentro del tramo de otra coincidencia de un punto *distinto* con nombre más
largo, en esa misma posición del texto. Menciones en posiciones distintas del
título (multi-punto real) se conservan todas, sin excepción.

Verificado con casos reales antes de integrarlo al código: "Oficina Principal
Amaime" ya no vincula también a "Oficina Principal"; un título que de verdad
menciona ambos en distintas partes del texto sí vincula a los dos.

## Regla nueva

Al modificar cualquier matcher de texto de este ecosistema para que capture
"todas las menciones" en vez de "la mejor mención": **antes de implementar,
contar cuántos pares de identificadores reales son prefijo/sufijo/substring
unos de otros** (mismo patrón de verificación que ya se usa en este
repo para alias — ver también el hallazgo del alias genérico "Iglesia",
mismo spec). Si hay colisiones reales (como aquí, 43), la solución necesita
contención de posición, no solo "quitar el límite que antes evitaba el
problema sin que se supiera por qué estaba ahí".

## Enlaces

- `cctv-automation-final/platform/trello-support.js` (`locationMatcher`)
- `cctv-automation-final/tests/trello-support.test.js`
- `specs/0018-soporte-tarjetas-multi-punto/`
