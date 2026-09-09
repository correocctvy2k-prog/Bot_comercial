# LL-0002 — Cadena larga de ramas sin fusionar a `main`

- **Fecha:** 2026-09-08
- **Contexto:** specs 0001-0005, sesión intensiva de un solo desarrollador con IA.

## Qué pasó

Se trabajaron 5 specs seguidas sin fusionar nada a `main`. Cada rama se creó **encima de la
anterior** (`chore/working-model` → `feat/0002` → `feat/0003x` → `feat/0004x` → `feat/0005`).
Al no haber `gh` CLI, los PR quedaron para abrir a mano y se fueron posponiendo.

Consecuencias:
- El resultado sólo se ve completo en la última rama; revisar cada spec por separado es
  engañoso (según qué rama mires, ves una cosa u otra).
- Un mismo archivo (`Dashboard.jsx`) evolucionó en dos ramas paralelas (`feat/0002` funcional
  del Ranking vs cadena `0003`), lo que obligó a un `git merge feat/0003c` dentro de
  `feat/0004-rediseno-modulos`.
- Corregir la identidad de Git (`user.email`) sólo se pudo hacer en las ramas nuevas; los
  commits viejos (`5fb9122`, `ab0bc1e`) quedaron con el correo equivocado.

## Lección

Fusionar la **base** (`chore/working-model` → `main`) y las specs cerradas **en cuanto pasan
el DoD**, aunque sea el mismo desarrollador quien abre y aprueba el PR. Una rama por spec, que
sale de `main` actualizado — no una cadena. El "lo fusiono luego" acumula deuda de integración.

## Acción

Al retomar: abrir los PR en orden (`chore/working-model` primero) y fusionar; rebasar/limpiar
lo que quede. Guía operativa de merge en `docs/operacion/despliegue.md` y `despliegue-local.md`.
