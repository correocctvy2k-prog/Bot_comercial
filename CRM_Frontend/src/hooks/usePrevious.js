import { useRef, useEffect } from "react";

const EMPTY_SET = new Set();

/** Devuelve el valor del render anterior (undefined en el primero). */
export default function usePrevious(value) {
    const ref = useRef(undefined);
    useEffect(() => {
        ref.current = value;
    }, [value]);
    // eslint-disable-next-line react-hooks/refs -- patrón estándar: se expone el valor del render previo
    return ref.current;
}

/** true si el usuario pidió reducir movimiento. */
export function prefersReducedMotion() {
    if (typeof window === "undefined" || !window.matchMedia) return false;
    return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/**
 * Set con las claves de `items` cuya marca de tiempo avanzó respecto al render
 * anterior (o que son nuevas). Se calcula **en render**, sin estado: el resaltado
 * temporal lo hace CSS (`.sk-row-flash`). No marca nada en el primer render ni
 * cuando `items` no cambió de referencia. (spec 0009, Tanda C)
 *
 * @param {Array}  items
 * @param {(x)=>string} keyOf  clave estable por fila (p. ej. teléfono)
 * @param {(x)=>string} tsOf   marca de tiempo comparable (ISO)
 */
export function useFreshKeys(items, keyOf, tsOf) {
    const prev = usePrevious(items);
    if (!prev || prev === items || !Array.isArray(items)) return EMPTY_SET;
    const prevMap = new Map(prev.map((x) => [keyOf(x), tsOf(x) || ""]));
    const fresh = new Set();
    for (const x of items) {
        const k = keyOf(x);
        if (!prevMap.has(k) || (tsOf(x) || "") > prevMap.get(k)) fresh.add(k);
    }
    return fresh;
}
