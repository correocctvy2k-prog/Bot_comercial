import { useInfiniteQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import {
    X, MessageSquare, User, Clock, Hash, Route, Loader2, AlertTriangle,
} from "lucide-react";
import { chatbotAnalyticsService as api } from "@/services/chatbotAnalytics.service";
import { crmService } from "@/services/crm.service";

/**
 * Ficha de contacto + historial de conversación por bot (spec 0005, tanda 4).
 * Solo lectura. Se abre desde la tabla de personas/clientes de cada vista.
 *
 * props:
 *   open      boolean
 *   bot       "comercial" | "oskitar" | "betty"
 *   target    { id, name }            para oskitar/betty  (id = teléfono tal como lo muestra la tabla)
 *             { providerId, name }    para comercial
 *   onClose   () => void
 */

const PAGE = 200;

const STATUS = {
    escalado: { label: "Escaló a humano", cls: "bg-rose-500/15 text-rose-600 dark:text-rose-300 border-rose-500/25" },
    resuelto: { label: "Resuelto por el bot", cls: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-500/25" },
    no_disponible: { label: 'Cayó en "No disponible"', cls: "bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-500/25" },
    atendido: { label: "Atendido", cls: "bg-slate-500/15 text-slate-600 dark:text-slate-300 border-slate-500/25" },
};

const fmtDate = (iso) => (iso ? format(new Date(iso), "dd MMM yyyy", { locale: es }) : "—");

export default function ContactDrawer({ open, bot, target, onClose }) {
    const key = target ? (target.providerId || target.id) : null;

    const fetchPage = ({ pageParam = 0 }) => {
        if (bot === "comercial") {
            return crmService.getContactByProvider(target.providerId, { limit: PAGE, offset: pageParam });
        }
        return api.getContact(bot, target.id, { limit: PAGE, offset: pageParam });
    };

    const {
        data, isLoading, isError, error,
        fetchNextPage, hasNextPage, isFetchingNextPage,
    } = useInfiniteQuery({
        queryKey: ["contact-card", bot, key],
        queryFn: fetchPage,
        initialPageParam: 0,
        getNextPageParam: (lastPage, allPages) => (lastPage?.transcript?.hasMore ? allPages.length * PAGE : undefined),
        enabled: !!open && !!key,
        staleTime: 15_000,
        retry: 1,
    });

    if (!open) return null;

    const pages = data?.pages || [];
    const card = pages[0]?.contact || null;
    const journey = pages[0]?.journey || [];
    const note = pages[0]?.transcript?.note || null;
    // pages[0] = los más recientes; se pintan en orden cronológico (páginas antiguas arriba).
    const items = [...pages].reverse().flatMap((p) => p.transcript?.items || []);

    const c = card || {};
    const st = STATUS[c.status];
    const title = c.name || target?.name || c.phone || "Contacto";

    return (
        <div className="fixed inset-0 z-50 flex">
            <div className="flex-1 bg-black/50 backdrop-blur-[2px]" onClick={onClose} />
            <div className="relative flex h-full w-full max-w-xl flex-col border-l border-border bg-card shadow-2xl animate-in slide-in-from-right duration-200">
                {/* Cabecera */}
                <div className="flex items-start justify-between gap-3 border-b border-border/80 p-4">
                    <div className="flex min-w-0 items-center gap-3">
                        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-tr from-primary/80 to-primary text-primary-foreground shadow-inner">
                            <User size={18} />
                        </div>
                        <div className="min-w-0">
                            <h3 className="truncate text-base font-black tracking-tight text-foreground">{title}</h3>
                            <p className="truncate text-[11px] text-muted-foreground">
                                {c.phone || target?.id || "—"}{c.document ? ` · doc. ${c.document}` : ""}
                            </p>
                        </div>
                    </div>
                    <button
                        onClick={onClose}
                        className="rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                        aria-label="Cerrar"
                    >
                        <X size={18} />
                    </button>
                </div>

                {isError && (
                    <div className="m-4 flex items-center gap-2 rounded-xl border border-rose-500/30 bg-rose-500/5 p-3 text-xs font-bold text-rose-500">
                        <AlertTriangle size={14} /> {String(error?.message || "No se pudo cargar la ficha").slice(0, 200)}
                    </div>
                )}

                {isLoading && (
                    <div className="flex flex-1 items-center justify-center gap-2 text-sm text-muted-foreground">
                        <Loader2 size={16} className="animate-spin" /> Cargando ficha…
                    </div>
                )}

                {card && (
                    <div className="flex min-h-0 flex-1 flex-col">
                        {/* Datos + KPIs */}
                        <div className="space-y-3 border-b border-border/80 p-4">
                            <div className="flex flex-wrap items-center gap-2">
                                {st && (
                                    <span className={`inline-flex items-center rounded-full border px-2.5 py-1 text-[10px] font-black uppercase tracking-wider ${st.cls}`}>
                                        {st.label}
                                    </span>
                                )}
                                {(c.categories || []).map((cat) => (
                                    <span key={cat} className="inline-flex items-center rounded-full border border-border/70 bg-muted/50 px-2.5 py-1 text-[10px] font-bold text-foreground/80">
                                        {cat}
                                    </span>
                                ))}
                            </div>

                            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                                <Stat icon={<MessageSquare size={13} />} label="Mensajes" value={c.totalMessages ?? "—"} hint={`${c.inbound ?? 0} in · ${c.outbound ?? 0} out`} />
                                <Stat icon={<Hash size={13} />} label={bot === "comercial" ? "Historial" : "Conversaciones"} value={c.sessions ?? (bot === "comercial" ? "—" : 0)} />
                                <Stat icon={<Clock size={13} />} label="Primera" value={fmtDate(c.firstInteraction)} />
                                <Stat icon={<Clock size={13} />} label="Última" value={fmtDate(c.lastInteraction)} />
                            </div>
                        </div>

                        {/* Recorrido (Betty) */}
                        {journey.length > 0 && (
                            <div className="border-b border-border/80 p-4">
                                <p className="mb-2 flex items-center gap-1.5 text-[10px] font-extrabold uppercase tracking-wider text-muted-foreground">
                                    <Route size={12} /> Recorrido en el bot
                                </p>
                                <div className="max-h-40 space-y-1.5 overflow-y-auto pr-1">
                                    {journey.map((j, i) => (
                                        <div key={i} className="flex items-baseline gap-2 text-xs">
                                            <span className="shrink-0 text-[10px] tabular-nums text-muted-foreground">
                                                {j.iso ? format(new Date(j.iso), "dd/MM HH:mm", { locale: es }) : ""}
                                            </span>
                                            <span className="text-foreground/80">{j.label}</span>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}

                        {/* Transcripción */}
                        <div className="flex min-h-0 flex-1 flex-col">
                            <div className="flex items-center justify-between border-b border-border/60 px-4 py-2.5">
                                <p className="flex items-center gap-1.5 text-xs font-bold text-foreground">
                                    <MessageSquare size={14} className="text-primary" /> Transcripción
                                </p>
                                <span className="text-[11px] text-muted-foreground">
                                    {items.length} de {c.totalMessages ?? items.length}
                                </span>
                            </div>

                            <div className="flex-1 space-y-1 overflow-y-auto bg-muted/20 p-4">
                                {note && (
                                    <p className="mb-2 rounded-lg border border-border/60 bg-card/60 px-2.5 py-1.5 text-[10px] text-muted-foreground">
                                        {note}
                                    </p>
                                )}
                                {hasNextPage && (
                                    <div className="flex justify-center pb-2">
                                        <button
                                            onClick={() => fetchNextPage()}
                                            disabled={isFetchingNextPage}
                                            className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-card px-3 py-1.5 text-[11px] font-bold text-foreground transition-colors hover:bg-muted disabled:opacity-50"
                                        >
                                            {isFetchingNextPage ? <Loader2 size={12} className="animate-spin" /> : null}
                                            Cargar mensajes anteriores
                                        </button>
                                    </div>
                                )}

                                {items.length === 0 && (
                                    <p className="py-10 text-center text-xs text-muted-foreground">Sin mensajes registrados.</p>
                                )}

                                {items.map((m, i) => {
                                    const prev = items[i - 1];
                                    const showDate = m.iso && (!prev || !prev.iso
                                        || new Date(m.iso).toDateString() !== new Date(prev.iso).toDateString());
                                    return (
                                        <div key={i}>
                                            {showDate && (
                                                <div className="my-3 flex items-center gap-3">
                                                    <hr className="flex-1 border-border/40" />
                                                    <span className="rounded-full border border-border/30 bg-muted/40 px-2 py-0.5 text-[10px] text-muted-foreground">
                                                        {fmtDate(m.iso)}
                                                    </span>
                                                    <hr className="flex-1 border-border/40" />
                                                </div>
                                            )}
                                            <Bubble m={m} />
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}

function Stat({ icon, label, value, hint }) {
    return (
        <div className="rounded-xl border border-border/60 bg-muted/30 p-2.5">
            <p className="flex items-center gap-1 text-[9px] font-bold uppercase tracking-wider text-muted-foreground">
                {icon} {label}
            </p>
            <p className="mt-0.5 truncate text-sm font-black tracking-tight text-foreground">{value}</p>
            {hint && <p className="truncate text-[10px] text-muted-foreground">{hint}</p>}
        </div>
    );
}

function Bubble({ m }) {
    const isOut = m.direction === "out";
    const isPlaceholder = m.type && m.type !== "text" && !m.content;
    const body = isPlaceholder
        ? `[${m.type}]`
        : (m.content || (m.hasMedia ? "[multimedia]" : "—"));
    return (
        <div className={`flex w-full ${isOut ? "justify-end" : "justify-start"}`}>
            <div className={`max-w-[78%] rounded-2xl px-3.5 py-2 text-sm ${isOut
                ? "rounded-br-sm bg-primary text-primary-foreground"
                : "rounded-bl-sm border border-border bg-card text-foreground"}`}
            >
                <p className="whitespace-pre-wrap break-words leading-relaxed">
                    {isPlaceholder ? <span className="italic opacity-70">{body}</span> : body}
                </p>
                {m.iso && (
                    <p className={`mt-1 text-[9px] ${isOut ? "text-primary-foreground/70" : "text-muted-foreground"}`}>
                        {format(new Date(m.iso), "HH:mm", { locale: es })}
                    </p>
                )}
            </div>
        </div>
    );
}
