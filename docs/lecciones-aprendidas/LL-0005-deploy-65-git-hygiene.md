# LL-0005 — Saltarse git en el servidor (root, a mano, o directo a `main`) se cobra en el siguiente deploy

- **Fecha:** 2026-09-11
- **Contexto:** deploy de `specs/0010-eventos-diarios-interpretacion/` y
  `specs/0011-eventos-diarios-operacion/` a `192.168.8.65` (PR #4 `857f83f` + PR #5 `4004cce`).

## Qué pasó

Al hacer `git pull` en `.65` para desplegar 0011, el pull se abortó dos veces por motivos
distintos, y aparte hubo un tercer tropiezo en la propia sesión de trabajo:

1. **Código aplicado a mano, sin commits.** `git status` mostró 7 archivos "modificados" y un
   `platform/window-config.js` "sin seguimiento" — exactamente el conjunto de archivos que toca
   spec 0010. Alguien había copiado/editado ese fix directo en el servidor en algún momento
   anterior, sin pasar por git. `main` en `.65` seguía en `0386cd8` (PR #3, spec 0008): **ni
   0010 ni 0011 habían llegado nunca por git**, aunque el comportamiento en pantalla ya parecía
   el de 0010.
2. **`specs/` de otro dueño.** Tras descartar lo anterior, el pull volvió a fallar:
   `fatal: cannot create directory at 'specs/0010-eventos-diarios-interpretacion': Permiso
   denegado`. `specs/` y sus subcarpetas eran `root:root` (`drwxr-xr-x`), mientras el resto del
   repo era del usuario de deploy (`openfire`) — quedó así de un deploy previo corrido con
   `sudo`. `openfire` podía leer/listar pero no crear directorios nuevos ahí.
3. **Commit de cierre pusheado directo a `main`.** En el repo de trabajo (no en `.65`), el commit
   que movía las entradas de CHANGELOG a una sección fechada se pusheó sin pasar por rama+PR,
   saltándose la regla del proyecto.

## Causa raíz

Cada atajo ahorra un paso en el momento y le pasa la cuenta a quien toque ese mismo camino
después:
- Editar archivos de prod a mano "para que funcione ya" deja el servidor con código que **no
  existe en ningún commit** — no hay forma de saber qué es sin diffearlo a ciegas contra cada
  candidato, y bloquea cualquier pull futuro sobre esos mismos archivos.
- Correr un deploy como `root` dejó carpetas que el usuario normal de deploy no puede escribir;
  el problema queda dormido hasta que un PR necesita crear algo nuevo ahí (una carpeta de spec).
- "Es solo documentación, no hace falta rama" es la misma excusa que ya cubre
  [LL-0002](LL-0002-cadena-de-ramas-sin-merge.md) para código — aplica igual a un `CHANGELOG.md`.

## Solución

1. Antes de descartar cualquier cambio local no versionado en un servidor: diff **byte a byte**
   contra el commit candidato (`git diff --stat <commit> -- <archivos>`, y para archivos sin
   seguimiento `diff <(git show <commit>:<archivo>) <archivo>`). Solo se descarta si es
   idéntico; si difiere, se revisa antes de tocar nada.
2. `sudo chown -R <usuario-de-deploy>:<usuario-de-deploy> .` sobre todo el repo en `.65` para
   devolver el árbol a un único dueño consistente.
3. `git reset --hard HEAD` para deshacer un merge que quedó a medias (los archivos nuevos sin
   seguimiento que el merge alcanzó a escribir sobreviven y solo estorban al reintentar; se
   verifican igual que el punto 1 antes de borrarlos).
4. El commit de CHANGELOG que se saltó la rama no se revirtió (era solo doc, sin efecto en
   runtime) — se anota aquí y no se repite.

## Regla nueva

- **Nunca editar archivos de un servidor a mano.** Si algo necesita salir ya y no hay tiempo
  para PR, se commitea igual (aunque sea a una rama `hotfix/` propia) y se hace merge después —
  nunca queda solo en el disco del servidor.
- **Nunca correr `docker compose` / `git` de deploy como `root`** salvo necesidad real (p. ej.
  el primer `chown`); si se corre como root por algo puntual, devolver el dueño al usuario de
  deploy antes de terminar.
- **Antes de cada deploy que trae specs nuevas:** `whoami` + `ls -ld specs` en el servidor como
  chequeo de 5 segundos de que el árbol es escribible por quien va a hacer `git pull`.
- **Ninguna excepción a rama+PR**, ni para código ni para documentación — ver
  `docs/WORKING_MODEL.md` §6 "Git". Esta lección es el recordatorio concreto de por qué la
  regla existe: la excepción de hoy es el bloqueo de mañana.

## Enlaces

- `specs/0010-eventos-diarios-interpretacion/`, `specs/0011-eventos-diarios-operacion/`
- PR #4 (`857f83f`), PR #5 (`4004cce`)
- [LL-0002](LL-0002-cadena-de-ramas-sin-merge.md) — misma familia de lección, para código
- [LL-0004](LL-0004-fuente-unica-por-vista.md) — incidente de deploy anterior del mismo servicio
