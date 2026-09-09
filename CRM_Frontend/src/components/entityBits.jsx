/* eslint-disable react-refresh/only-export-components -- kit compartido: componentes + helpers */
/**
 * Piezas compartidas para las tablas de personas / clientes / ranking del módulo
 * Bots Gane Palmira (spec 0009, Tanda B). Estado con icono+color, chips de
 * categoría con color estable, y "última actividad" con fecha absoluta en `title`.
 */
import { AlertTriangle, CheckCircle2, MinusCircle, CircleDot } from "lucide-react";
import { formatDistanceToNow, format } from "date-fns";
import { es } from "date-fns/locale";

// --- Estado --------------------------------------------------------------
const STATUS = {
    escalado: { label: "Escaló", Icon: AlertTriangle, cls: "bg-rose-500/15 text-rose-600 dark:text-rose-300 ring-rose-500/25" },
    resuelto: { label: "Resuelto", Icon: CheckCircle2, cls: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 ring-emerald-500/25" },
    ok: { label: "OK", Icon: CheckCircle2, cls: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 ring-emerald-500/25" },
    no_disponible: { label: "No disp.", Icon: MinusCircle, cls: "bg-amber-500/15 text-amber-700 dark:text-amber-300 ring-amber-500/25" },
    atendido: { label: "Atendido", Icon: CircleDot, cls: "bg-slate-500/15 text-slate-600 dark:text-slate-300 ring-slate-500/25" },
};

/** Deriva el estado de una persona de Oskitar (`m.users[i]`). */
export const oskitarStatus = (u) => (u?.escalated ? "escalado" : u?.validated ? "ok" : "atendido");
/** Deriva el estado de un cliente de Betty (`m.customers[i]`). */
export const bettyStatus = (c) => {
    const flows = c?.flows?.length || 0;
    if (c?.notAvailable && !flows) return "no_disponible";
    return flows ? "resuelto" : "atendido";
};

export function StatusPill({ status }) {
    const s = STATUS[status] || STATUS.atendido;
    const { Icon } = s;
    return (
        <span className={`inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-[9px] font-black uppercase tracking-wider ring-1 ${s.cls}`}>
            <Icon size={10} /> {s.label}
        </span>
    );
}

// --- Chips de categoría (color estable por nombre) ---------------------
const CHIP_PALETTE = [
    "bg-blue-500/12 text-blue-700 dark:text-blue-300",
    "bg-violet-500/12 text-violet-700 dark:text-violet-300",
    "bg-emerald-500/12 text-emerald-700 dark:text-emerald-300",
    "bg-amber-500/12 text-amber-700 dark:text-amber-300",
    "bg-rose-500/12 text-rose-700 dark:text-rose-300",
    "bg-cyan-500/12 text-cyan-700 dark:text-cyan-300",
    "bg-fuchsia-500/12 text-fuchsia-700 dark:text-fuchsia-300",
    "bg-teal-500/12 text-teal-700 dark:text-teal-300",
];
const hashStr = (s = "") => {
    let h = 0;
    for (let i = 0; i < s.length; i += 1) h = (h * 31 + s.charCodeAt(i)) | 0;
    return Math.abs(h);
};
export const categoryColor = (name = "") => CHIP_PALETTE[hashStr(name) % CHIP_PALETTE.length];

export function CategoryChips({ items = [], max = 2 }) {
    if (!items.length) return <span className="text-muted-foreground">—</span>;
    const shown = items.slice(0, max);
    const rest = items.length - max;
    return (
        <span className="flex flex-wrap items-center gap-1" title={items.join(" · ")}>
            {shown.map((c) => (
                <span key={c} className={`max-w-[140px] truncate rounded-md px-1.5 py-0.5 text-[10px] font-bold ${categoryColor(c)}`}>
                    {c}
                </span>
            ))}
            {rest > 0 && <span className="text-[10px] font-bold text-muted-foreground">+{rest}</span>}
        </span>
    );
}

// --- Última actividad (relativa + absoluta en title) -----------------
export function LastActivity({ iso, className = "" }) {
    if (!iso) return <span className={`text-muted-foreground ${className}`}>—</span>;
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return <span className={`text-muted-foreground ${className}`}>—</span>;
    return (
        <span className={`text-muted-foreground ${className}`} title={format(d, "PPPp", { locale: es })}>
            {formatDistanceToNow(d, { addSuffix: true, locale: es })}
        </span>
    );
}
