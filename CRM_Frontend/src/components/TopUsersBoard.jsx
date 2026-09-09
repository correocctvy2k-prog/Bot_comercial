/**
 * Board premium "Top 5" reutilizable por los 3 bots (spec 0006, compactado en 0009).
 *
 * Cada vista normaliza sus filas a:
 *   { key, rank, name, sublabel?, value, valueLabel?, badge?, channelIcon? }
 *
 * props:
 *   title, subtitle, icon   cabecera (icon = icon-badge del design-system, opcional)
 *   rows                    array ya recortado y ordenado (se pinta tal cual, máx. 5)
 *   onRowClick(row)         abre la ficha (ContactDrawer)
 *   right                   nodo a la derecha de la cabecera (toggle "ver tabla", CSV…)
 *   compact                 filas densas (~44 px), medalla como índice de color, sin avatar
 *   emptyText
 */

// Oro / plata / bronce para los 3 primeros.
const RANK_COLOR = {
    1: "bg-amber-500/15 text-amber-700 dark:text-amber-300 ring-amber-500/30",
    2: "bg-slate-400/15 text-slate-600 dark:text-slate-200 ring-slate-400/30",
    3: "bg-orange-500/15 text-orange-700 dark:text-orange-300 ring-orange-500/30",
};

const initialsOf = (name = "") =>
    (name.trim().split(/\s+/).map((w) => w[0]).join("").slice(0, 2).toUpperCase() || "—");

export default function TopUsersBoard({
    title, subtitle, icon, rows = [], onRowClick, right, compact = false,
    emptyText = "Sin datos en el periodo.",
}) {
    return (
        <div className="overflow-hidden rounded-2xl border border-border/80 bg-card/60 shadow-sm backdrop-blur-xl">
            <div className="flex flex-col gap-2 border-b border-border/80 bg-muted/40 p-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex items-center gap-3">
                    {icon}
                    <div>
                        <h4 className="text-sm font-black tracking-tight text-foreground">{title}</h4>
                        {subtitle && <p className="text-[11px] font-medium text-muted-foreground">{subtitle}</p>}
                    </div>
                </div>
                {right}
            </div>

            <div className="divide-y divide-border/40">
                {rows.length === 0 && (
                    <p className="py-8 text-center text-xs text-muted-foreground">{emptyText}</p>
                )}
                {rows.slice(0, 5).map((r) => {
                    const rankCls = RANK_COLOR[r.rank] || "bg-muted text-muted-foreground ring-border";
                    return (
                        <button
                            key={r.key ?? r.rank}
                            type="button"
                            onClick={() => onRowClick?.(r)}
                            className={`flex w-full items-center gap-3 text-left transition-colors hover:bg-muted/40 ${
                                compact ? "px-4 py-2.5" : "px-4 py-3"
                            }`}
                        >
                            {/* Posición: índice de color (compact) o medalla */}
                            <span
                                className={`flex shrink-0 items-center justify-center rounded-md text-[11px] font-black ring-1 ${rankCls} ${
                                    compact ? "h-6 w-6" : "h-7 w-7"
                                }`}
                            >
                                {r.rank}
                            </span>

                            {/* Avatar de iniciales (solo modo normal) */}
                            {!compact && (
                                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-primary/20 bg-primary/10 text-xs font-bold text-primary">
                                    {initialsOf(r.name)}
                                </span>
                            )}

                            {/* Nombre + sublabel */}
                            <span className="min-w-0 flex-1">
                                <span className="flex items-center gap-1.5 truncate text-sm font-bold text-foreground">
                                    {r.name}
                                    {r.channelIcon}
                                    {r.badge && (
                                        <span className="rounded bg-muted px-1 text-[9px] font-black uppercase tracking-wider text-muted-foreground">
                                            {r.badge}
                                        </span>
                                    )}
                                </span>
                                {r.sublabel && (
                                    <span className={`block truncate text-[11px] text-muted-foreground ${compact ? "leading-tight" : ""}`}>
                                        {r.sublabel}
                                    </span>
                                )}
                            </span>

                            {/* Valor */}
                            <span className="shrink-0 text-right">
                                <span className={`block font-black leading-none tracking-tight text-foreground ${compact ? "text-base" : "text-lg"}`}>
                                    {typeof r.value === "number" ? r.value.toLocaleString("es-CO") : r.value}
                                </span>
                                {r.valueLabel && !compact && (
                                    <span className="block text-[10px] font-bold uppercase tracking-wider text-muted-foreground">{r.valueLabel}</span>
                                )}
                            </span>
                        </button>
                    );
                })}
            </div>
        </div>
    );
}
