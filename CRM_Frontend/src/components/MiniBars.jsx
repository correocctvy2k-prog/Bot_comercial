/**
 * Barras horizontales de ranking/desglose para las tarjetas de datos (spec 0009).
 * Rediseño premium del MiniBars original: valor y porcentaje alineados, índice de
 * posición, top-1 con acento, degradado por serie.
 *
 * props (compatibles con el uso previo):
 *   rows      array de objetos
 *   labelKey  clave de la etiqueta
 *   valueKey  clave del valor numérico (ancho de barra)
 *   subKey    clave opcional del dato secundario (se muestra tras el valor)
 *   max       tope para el 100% (default: máximo de la serie)
 *   color     clases del relleno (default degradado primary)
 *   showRank  muestra el índice 1..N a la izquierda (default true si hay > 2 filas)
 *   emptyText
 */
export default function MiniBars({
    rows = [],
    labelKey,
    valueKey,
    subKey,
    max,
    color = "bg-gradient-to-r from-primary/80 to-primary",
    showRank,
    emptyText = "Sin datos.",
}) {
    const top = max || Math.max(1, ...rows.map((r) => Number(r[valueKey]) || 0));
    const withRank = showRank ?? rows.length > 2;

    if (rows.length === 0) {
        return <p className="py-6 text-center text-xs text-muted-foreground">{emptyText}</p>;
    }

    return (
        <div className="space-y-3">
            {rows.map((r, i) => {
                const value = Number(r[valueKey]) || 0;
                const pctWidth = Math.max(2, (value / top) * 100);
                const isTop = i === 0;
                return (
                    <div key={i}>
                        <div className="mb-1.5 flex items-center gap-2 text-xs">
                            {withRank && (
                                <span
                                    className={`flex h-4 w-4 shrink-0 items-center justify-center rounded text-[10px] font-black ${
                                        isTop
                                            ? "bg-primary/15 text-primary"
                                            : "bg-muted text-muted-foreground"
                                    }`}
                                >
                                    {i + 1}
                                </span>
                            )}
                            <span className="min-w-0 flex-1 truncate font-bold text-foreground">{r[labelKey]}</span>
                            <span className="shrink-0 font-black tabular-nums text-foreground">{value.toLocaleString("es-CO")}</span>
                            {subKey != null && r[subKey] != null && (
                                <span className="shrink-0 text-[11px] font-medium text-muted-foreground">{r[subKey]}</span>
                            )}
                        </div>
                        <div className={`h-2.5 overflow-hidden rounded-full bg-muted ${isTop ? "ring-1 ring-primary/25" : ""}`}>
                            <div
                                className={`h-full rounded-full ${color} transition-[width] duration-500`}
                                style={{ width: `${pctWidth}%` }}
                            />
                        </div>
                    </div>
                );
            })}
        </div>
    );
}
