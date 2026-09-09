/**
 * Panel de datos estándar del módulo Bots Gane Palmira (spec 0009).
 * Superficie del design-system §2 + cabecera con la tipografía §3.
 *
 * props:
 *   title      string | nodo
 *   subtitle   string | nodo (opcional)
 *   icon       nodo a la izquierda del título (icon-badge o lucide)
 *   right      nodo a la derecha de la cabecera (toolbar, toggle…)
 *   bodyClass  clases extra para el cuerpo (default `p-4`)
 *   children
 */
export default function Panel({ title, subtitle, icon, right, bodyClass = "p-4", children }) {
    return (
        <div className="overflow-hidden rounded-2xl border border-border/80 bg-card/60 shadow-sm backdrop-blur-xl">
            <div className="flex flex-col gap-2 border-b border-border/80 bg-muted/20 p-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex items-center gap-2.5 min-w-0">
                    {icon}
                    <div className="min-w-0">
                        <h4 className="truncate text-sm font-black tracking-tight text-foreground">{title}</h4>
                        {subtitle != null && (
                            <p className="truncate text-[11px] font-medium text-muted-foreground">{subtitle}</p>
                        )}
                    </div>
                </div>
                {right != null && <div className="shrink-0">{right}</div>}
            </div>
            <div className={bodyClass}>{children}</div>
        </div>
    );
}

/** Icon-badge de sección para la cabecera del Panel (design-system §4). */
export function PanelIcon({ children, from = "from-blue-600", to = "to-indigo-600" }) {
    return (
        <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-tr ${from} ${to} text-white shadow-inner`}>
            {children}
        </span>
    );
}
