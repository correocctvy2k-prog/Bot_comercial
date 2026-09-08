/* eslint-disable react-refresh/only-export-components -- kit compartido: componentes + constantes */
/**
 * Piezas compartidas por las 3 vistas de "Bots Gane Palmira"
 * (Bot Comercial · Oskitar · Betty). Un solo KpiCard, un solo selector de
 * periodo y el bloque de resumen, para que las 3 se vean idénticas.
 */

// --- Selector de periodo -------------------------------------------------
export const PERIOD_OPTIONS = [
    { value: "24h", label: "Hoy (Últimas 24h)" },
    { value: "7d", label: "Últimos 7 días" },
    { value: "1m", label: "Último mes" },
    { value: "1y", label: "Último año" },
];
export const periodLabel = (v) => PERIOD_OPTIONS.find((o) => o.value === v)?.label || v;

// Frase para los resúmenes en lenguaje natural.
export const periodPhrase = (v) => ({
    "24h": "en las últimas 24 horas",
    "7d": "en los últimos 7 días",
    "1m": "en el último mes",
    "1y": "en el último año",
}[v] || "en el periodo");

export function PeriodSelect({ value, onChange, className = "" }) {
    return (
        <select
            className={`bg-card w-44 text-sm border border-border rounded-xl px-3 py-2 outline-none focus:ring-1 focus:ring-primary shadow-sm font-semibold ${className}`}
            value={value}
            onChange={(e) => onChange(e.target.value)}
        >
            {PERIOD_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
    );
}

// --- Resumen en lenguaje natural --------------------------------------
export function BotSummary({ children }) {
    if (!children) return null;
    return (
        <div className="rounded-2xl border border-border/80 bg-muted/30 px-4 py-3 text-sm leading-relaxed text-foreground/90">
            <span className="mr-2 rounded-md bg-primary/15 px-1.5 py-0.5 text-[10px] font-black uppercase tracking-wider text-primary align-middle">Resumen</span>
            {children}
        </div>
    );
}

// --- KpiCard (el de Bot Comercial, reutilizado en las 3 vistas) --------
export function KpiCard({ title, value, badge, badgeColor, icon, accent, iconColor, noIconWrapper }) {
    return (
        <div className={`relative bg-gradient-to-br ${accent || "from-primary/10 to-primary/5"} bg-card/60 backdrop-blur-md border border-border/70 p-5 rounded-xl hover:border-border transition-all duration-300 overflow-hidden group`}>
            <div className="flex justify-between items-start gap-2">
                <div className="min-w-0">
                    <p className="text-xs font-medium text-muted-foreground truncate">{title}</p>
                    <h3 className="text-3xl font-bold mt-1 tracking-tight">{value}</h3>
                </div>
                <div className={noIconWrapper ? "shrink-0 mt-0.5" : `p-2 rounded-lg bg-background/40 ${iconColor || "text-primary"} shrink-0 group-hover:scale-110 transition-transform`}>
                    {icon}
                </div>
            </div>
            {badge != null && <p className={`text-xs mt-3 font-medium ${badgeColor || "text-muted-foreground"}`}>{badge}</p>}
        </div>
    );
}
