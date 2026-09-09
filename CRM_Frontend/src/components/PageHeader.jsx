/**
 * Encabezado estándar de módulo (spec 0006).
 *
 * Tipografía uniforme para el `<h1>` superior de cada página del shell:
 *   título    → text-2xl font-bold tracking-tight
 *   subtítulo → text-sm text-muted-foreground font-medium  (frase, no mayúsculas)
 *
 * Ver `docs/design-system.md` §3.
 *
 * props:
 *   icon      nodo opcional a la izquierda (lucide, <BotAvatar/>, etc.)
 *   title     string | nodo
 *   subtitle  string | nodo (opcional)
 *   actions   nodo opcional a la derecha (tabs, selector de periodo, botones)
 *   className  clases extra para el contenedor
 */
export default function PageHeader({ icon, title, subtitle, actions, className = "" }) {
    return (
        <div className={`flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between ${className}`}>
            <div className="flex items-center gap-3 min-w-0">
                {icon != null && <span className="shrink-0">{icon}</span>}
                <div className="min-w-0">
                    <h1 className="text-2xl font-bold tracking-tight text-foreground">{title}</h1>
                    {subtitle != null && (
                        <p className="mt-1 text-sm font-medium text-muted-foreground">{subtitle}</p>
                    )}
                </div>
            </div>
            {actions != null && <div className="shrink-0">{actions}</div>}
        </div>
    );
}
