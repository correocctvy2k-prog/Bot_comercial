import React, { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { crmService } from '../services/crm.service';
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { MessageSquare, ArrowLeft, GitMerge, X, Search, CheckCircle2, MessageCircle, CalendarDays, Activity, ArrowUpDown } from 'lucide-react';
import { format, formatDistanceToNow } from 'date-fns';
import { es } from 'date-fns/locale';

// ─── Canal Icons ──────────────────────────────────────────────────────
const WhatsAppIcon = ({ size = 15 }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
        <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.297-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z" fill="#25D366" />
        <path d="M12 0C5.373 0 0 5.373 0 12c0 2.127.558 4.122 1.532 5.852L.054 23.35a.75.75 0 00.918.919l5.593-1.494A11.942 11.942 0 0012 24c6.627 0 12-5.373 12-12S18.627 0 12 0zm0 22c-1.943 0-3.76-.523-5.314-1.432l-.38-.224-3.946 1.055 1.04-3.854-.247-.393A9.956 9.956 0 012 12C2 6.477 6.477 2 12 2s10 4.477 10 10-4.477 10-10 10z" fill="#25D366" />
    </svg>
);

const TelegramIcon = ({ size = 15 }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
        <circle cx="12" cy="12" r="12" fill="#2AABEE" />
        <path d="M17.54 7.155l-2.04 9.61c-.15.673-.54.84-1.094.523l-3.03-2.232-1.462 1.407c-.162.162-.297.297-.61.297l.218-3.085 5.62-5.077c.244-.218-.054-.337-.378-.12L6.56 13.91 3.57 12.98c-.657-.206-.67-.657.138-.973l13.702-5.284c.546-.198 1.024.134.83.432z" fill="white" />
    </svg>
);

function ChannelIcon({ providerId, channelType, size = 15 }) {
    const isTG = channelType === 'telegram' || String(providerId).startsWith('tg_');
    return isTG ? <TelegramIcon size={size} /> : <WhatsAppIcon size={size} />;
}

function getMsgChannelIcon(msg) {
    const isTG = String(msg.provider_id || "").startsWith('tg_') || (msg.channel_id || "").includes('telegram');
    return isTG ? <TelegramIcon size={11} /> : <WhatsAppIcon size={11} />;
}

// ─── Avatar gradiente ───────────────────────────────────────────────
const GRADIENTS = ["from-violet-500 to-purple-700", "from-blue-500 to-cyan-600", "from-emerald-500 to-teal-700", "from-amber-500 to-orange-600", "from-pink-500 to-rose-700"];
const getGradient = (name = "") => GRADIENTS[name.charCodeAt(0) % GRADIENTS.length];

// ─── Separador de fecha en el chat ─────────────────────────────────
function DateSeparator({ date }) {
    const d = new Date(date);
    const today = new Date();
    const yesterday = new Date(Date.now() - 86400000);
    let label = format(d, "dd MMM yyyy", { locale: es });
    if (d.toDateString() === today.toDateString()) label = "Hoy";
    else if (d.toDateString() === yesterday.toDateString()) label = "Ayer";
    return (
        <div className="flex items-center gap-3 my-3">
            <hr className="flex-1 border-border/40" />
            <span className="text-[10px] text-muted-foreground px-2 py-0.5 rounded-full bg-muted/30 border border-border/30">{label}</span>
            <hr className="flex-1 border-border/40" />
        </div>
    );
}

// ════════════════════════════════════════════════════════════════════
//  CONTACT DETAIL
// ════════════════════════════════════════════════════════════════════
export default function ContactDetail() {
    const { id } = useParams();
    const navigate = useNavigate();
    const queryClient = useQueryClient();
    const [showMergeModal, setShowMergeModal] = useState(false);

    const { data, isLoading } = useQuery({
        queryKey: ['contact', id],
        queryFn: () => crmService.getContactDetails(id),
        staleTime: 0,
    });

    if (isLoading) return (
        <div className="flex items-center justify-center h-64 text-muted-foreground animate-pulse">
            Cargando perfil…
        </div>
    );
    if (!data?.contact) return (
        <div className="p-8 text-muted-foreground">Contacto no encontrado.</div>
    );

    const { contact, identities = [], history = [] } = data;
    const initials = (contact.display_name || "?").substring(0, 2).toUpperCase();
    const gradient = getGradient(contact.display_name || "");
    const isMulti = identities.length > 1;

    const firstMsg = history[0];
    const lastMsg = history[history.length - 1];

    // ── Analytics computadas del historial local ─────────────────────
    const incoming = history.filter(m => m.direction === 'INCOMING');
    const outgoing = history.filter(m => m.direction === 'OUTGOING');
    const responseRate = history.length > 0 ? Math.round((outgoing.length / history.length) * 100) : 0;

    // Días únicos con actividad
    const activeDays = new Set(history.map(m => new Date(m.created_at).toDateString())).size;

    // Tipos de mensaje más frecuentes
    const typeCount = history.reduce((acc, m) => {
        const t = m.message_type || 'text';
        acc[t] = (acc[t] || 0) + 1;
        return acc;
    }, {});
    const topTypes = Object.entries(typeCount)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 4);
    const maxTypeCount = topTypes[0]?.[1] || 1;

    // Actividad por día de la semana (0=Dom ... 6=Sáb)
    const DOW_LABELS = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
    const dowCount = Array(7).fill(0);
    history.forEach(m => { dowCount[new Date(m.created_at).getDay()]++; });
    const maxDow = Math.max(...dowCount, 1);

    const groupedHistory = [];
    let lastDate = null;
    for (const msg of history) {
        const msgDate = new Date(msg.created_at).toDateString();
        if (msgDate !== lastDate) {
            groupedHistory.push({ type: "date", date: msg.created_at, key: `d-${msg.created_at}` });
            lastDate = msgDate;
        }
        groupedHistory.push({ type: "msg", msg, key: msg.id });
    }

    return (
        <div className="space-y-5 animate-in fade-in duration-500 h-[calc(100vh-90px)] flex flex-col">
            {/* Back button */}
            <button onClick={() => navigate('/contacts')} className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition w-fit">
                <ArrowLeft className="w-4 h-4" /> Volver a Contactos
            </button>

            {/* ── Header ── */}
            <div className="flex items-start justify-between bg-card/40 backdrop-blur-sm border border-border rounded-xl p-5">
                <div className="flex gap-5 items-center">
                    {/* Avatar */}
                    <div className={`w-16 h-16 rounded-full bg-gradient-to-br ${gradient} flex items-center justify-center text-white font-bold text-xl shrink-0 shadow-lg`}>
                        {initials}
                    </div>
                    <div>
                        <div className="flex items-center gap-3 flex-wrap">
                            <h1 className="text-2xl font-bold">{contact.display_name || "Usuario desconocido"}</h1>
                            {isMulti && (
                                <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-primary/10 text-primary border border-primary/20">
                                    Multicanal
                                </span>
                            )}
                        </div>
                        {/* Canal badges */}
                        <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                            {identities.map((ident, i) => (
                                <span key={i} className="flex items-center gap-1.5 text-xs px-2 py-0.5 rounded-full bg-muted/50 border border-border/50">
                                    <ChannelIcon providerId={ident.provider_id} channelType={ident.channel_type} size={12} />
                                    <span className="text-muted-foreground truncate max-w-[120px]">{ident.provider_id}</span>
                                </span>
                            ))}
                        </div>
                        {contact.updated_at && (
                            <p className="text-xs text-muted-foreground mt-1">
                                Última actividad: {formatDistanceToNow(new Date(contact.updated_at), { addSuffix: true, locale: es })}
                            </p>
                        )}
                    </div>
                </div>
                <Button
                    variant="outline"
                    size="sm"
                    className="gap-2"
                    onClick={() => setShowMergeModal(true)}
                >
                    <GitMerge className="w-4 h-4" /> Vincular canal
                </Button>
            </div>

            {/* ── KPIs ── */}
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
                <KpiMini icon={<MessageCircle className="w-4 h-4 text-blue-400" />} label="Mensajes totales" value={history.length.toLocaleString()} />
                <KpiMini icon={<CalendarDays className="w-4 h-4 text-emerald-400" />} label="Primera interacción"
                    value={firstMsg ? format(new Date(firstMsg.created_at), "dd MMM yyyy", { locale: es }) : "—"} />
                <KpiMini icon={<CalendarDays className="w-4 h-4 text-violet-400" />} label="Última interacción"
                    value={lastMsg ? format(new Date(lastMsg.created_at), "dd MMM HH:mm", { locale: es }) : "—"} />
                <KpiMini icon={<Activity className="w-4 h-4 text-amber-400" />} label="Días activo" value={activeDays} />
                <KpiMini icon={<ArrowUpDown className="w-4 h-4 text-rose-400" />} label="Tasa respuesta" value={`${responseRate}%`} />
            </div>

            {/* ── Analítica: Tipos de mensaje + Actividad por día ── */}
            <div className="grid grid-cols-2 gap-4">
                {/* Tipos de mensaje */}
                <div className="bg-card/40 border border-border/60 rounded-xl p-4">
                    <p className="text-xs font-semibold text-muted-foreground mb-3 uppercase tracking-wide">Tipos de mensaje</p>
                    <div className="space-y-2">
                        {topTypes.length === 0 ? (
                            <p className="text-xs text-muted-foreground">Sin datos</p>
                        ) : topTypes.map(([type, count]) => (
                            <div key={type} className="flex items-center gap-2">
                                <span className="text-xs w-14 shrink-0 capitalize text-muted-foreground">{type}</span>
                                <div className="flex-1 bg-background/40 rounded-full h-2 overflow-hidden">
                                    <div
                                        className="h-2 rounded-full bg-primary/70 transition-all duration-500"
                                        style={{ width: `${(count / maxTypeCount) * 100}%` }}
                                    />
                                </div>
                                <span className="text-xs text-muted-foreground w-8 text-right">{count}</span>
                            </div>
                        ))}
                    </div>
                </div>

                {/* Actividad por día de la semana */}
                <div className="bg-card/40 border border-border/60 rounded-xl p-4">
                    <p className="text-xs font-semibold text-muted-foreground mb-3 uppercase tracking-wide">Actividad semanal</p>
                    <div className="flex items-end gap-1.5 h-16">
                        {dowCount.map((count, i) => (
                            <div key={i} className="flex-1 flex flex-col items-center gap-1">
                                <div
                                    className="w-full rounded-sm bg-primary/60 transition-all duration-500"
                                    style={{ height: `${Math.max((count / maxDow) * 52, count > 0 ? 4 : 0)}px` }}
                                    title={`${DOW_LABELS[i]}: ${count} mensajes`}
                                />
                                <span className="text-[9px] text-muted-foreground">{DOW_LABELS[i]}</span>
                            </div>
                        ))}
                    </div>
                </div>
            </div>

            {/* ── Main: Identidades + Chat ── */}
            <div className="grid grid-cols-3 gap-5 flex-1 min-h-0">
                {/* Left */}
                <div className="space-y-4">
                    <Card className="bg-card/40 border-border/60">
                        <CardHeader className="pb-3">
                            <CardTitle className="text-sm font-semibold">Identidades vinculadas</CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-3">
                            {identities.map((ident, i) => {
                                const isTG = ident.channel_type === 'telegram' || String(ident.provider_id).startsWith('tg_');
                                return (
                                    <div key={i} className={`flex items-center gap-3 p-3 rounded-xl border ${isTG ? 'border-sky-500/20 bg-sky-500/5' : 'border-emerald-500/20 bg-emerald-500/5'}`}>
                                        <div className={`p-2 rounded-full ${isTG ? 'bg-sky-500/10' : 'bg-emerald-500/10'}`}>
                                            <ChannelIcon providerId={ident.provider_id} channelType={ident.channel_type} size={18} />
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <div className="font-medium text-sm capitalize">{isTG ? 'Telegram' : 'WhatsApp'}</div>
                                            <div className="text-xs text-muted-foreground truncate">{ident.provider_id}</div>
                                        </div>
                                        <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${isTG ? 'bg-sky-500/20 text-sky-400' : 'bg-emerald-500/20 text-emerald-400'}`}>
                                            Activo
                                        </span>
                                    </div>
                                );
                            })}
                            {identities.length === 0 && (
                                <p className="text-xs text-muted-foreground text-center py-4">Sin identidades vinculadas</p>
                            )}
                        </CardContent>
                    </Card>

                    {contact.notes && (
                        <Card className="bg-card/40 border-border/60">
                            <CardHeader className="pb-2"><CardTitle className="text-sm">Notas</CardTitle></CardHeader>
                            <CardContent>
                                <p className="text-sm text-muted-foreground">{contact.notes}</p>
                            </CardContent>
                        </Card>
                    )}
                </div>

                {/* Chat column */}
                <div className="col-span-2 flex flex-col min-h-0">
                    <Card className="flex-1 flex flex-col min-h-0 bg-card/40 border-border/60">
                        <CardHeader className="border-b border-border/30 py-3 px-4">
                            <div className="flex items-center justify-between">
                                <CardTitle className="text-sm flex items-center gap-2">
                                    <MessageSquare className="w-4 h-4 text-primary" />
                                    Historial de Interacciones
                                </CardTitle>
                                <span className="text-xs text-muted-foreground">{history.length.toLocaleString()} mensajes</span>
                            </div>
                        </CardHeader>
                        <CardContent className="flex-1 overflow-y-auto p-4 space-y-1 bg-slate-950/20">
                            {groupedHistory.length === 0 ? (
                                <div className="h-full flex items-center justify-center text-muted-foreground text-sm">
                                    No hay interacciones registradas.
                                </div>
                            ) : groupedHistory.map(item => {
                                if (item.type === "date") return <DateSeparator key={item.key} date={item.date} />;
                                const msg = item.msg;
                                const isOut = msg.direction === 'OUTGOING';
                                return (
                                    <div key={item.key} className={`flex w-full ${isOut ? 'justify-end' : 'justify-start'}`}>
                                        <div className={`max-w-[70%] rounded-2xl px-3.5 py-2.5 text-sm ${isOut ? 'bg-blue-600 text-white rounded-br-none' : 'bg-card border border-border rounded-bl-none'}`}>
                                            <div className="break-words leading-relaxed">
                                                {msg.message_type === 'text'
                                                    ? msg.content
                                                    : <span className="italic opacity-70">[{msg.message_type}]</span>}
                                            </div>
                                            <div className={`text-[9px] mt-1 flex items-center gap-1 ${isOut ? 'text-blue-200 justify-end' : 'text-muted-foreground'}`}>
                                                {getMsgChannelIcon(msg)}
                                                <span>{format(new Date(msg.created_at), 'HH:mm', { locale: es })}</span>
                                                {isOut && <span>✓</span>}
                                            </div>
                                        </div>
                                    </div>
                                );
                            })}
                        </CardContent>
                    </Card>
                </div>
            </div>

            {/* ── Modal Vincular Canal ── */}
            {showMergeModal && (
                <MergeModal
                    currentId={id}
                    currentName={contact.display_name}
                    onClose={() => setShowMergeModal(false)}
                    onMerged={() => {
                        queryClient.invalidateQueries({ queryKey: ['contacts'] });
                        queryClient.invalidateQueries({ queryKey: ['contact', id] });
                        setShowMergeModal(false);
                    }}
                />
            )}
        </div>
    );
}

// ─── KPI Mini Card ───────────────────────────────────────────────────
function KpiMini({ icon, label, value }) {
    return (
        <div className="bg-card/40 border border-border/60 rounded-xl p-4 flex items-center gap-3">
            <div className="p-2 rounded-lg bg-background/40 shrink-0">{icon}</div>
            <div className="min-w-0">
                <p className="text-xs text-muted-foreground truncate">{label}</p>
                <p className="font-bold text-sm mt-0.5 truncate">{value}</p>
            </div>
        </div>
    );
}

// ─── Modal: Vincular Canal ───────────────────────────────────────────
function MergeModal({ currentId, currentName, onClose, onMerged }) {
    const [query, setQuery] = useState("");
    const [selected, setSelected] = useState(null);
    const [error, setError] = useState(null);

    const { data: results = [], isFetching } = useQuery({
        queryKey: ['search-contacts', query],
        queryFn: () => crmService.searchContacts(query),
        enabled: query.length >= 2,
        staleTime: 0,
    });

    // Excluir el contacto actual de los resultados
    const filtered = results.filter(c => c.id !== currentId);

    const mutation = useMutation({
        mutationFn: () => crmService.mergeContacts(currentId, selected.id),
        onSuccess: onMerged,
        onError: (e) => setError(e.message),
    });

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
            <div className="bg-card border border-border rounded-2xl w-full max-w-md shadow-2xl animate-in zoom-in-95 duration-200">
                <div className="flex items-center justify-between p-5 border-b border-border">
                    <div>
                        <h3 className="font-bold text-base flex items-center gap-2">
                            <GitMerge className="w-4 h-4 text-primary" /> Vincular otro canal
                        </h3>
                        <p className="text-xs text-muted-foreground mt-0.5">
                            Unir una identidad existente a <strong>{currentName}</strong>
                        </p>
                    </div>
                    <button onClick={onClose} className="text-muted-foreground hover:text-foreground transition">
                        <X className="w-5 h-5" />
                    </button>
                </div>

                <div className="p-5 space-y-4">
                    {/* Search input */}
                    <div className="relative">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                        <input
                            autoFocus
                            type="text"
                            placeholder="Buscar contacto por nombre..."
                            className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-background border border-border text-sm focus:outline-none focus:ring-2 focus:ring-primary/40 transition"
                            value={query}
                            onChange={e => { setQuery(e.target.value); setSelected(null); setError(null); }}
                        />
                    </div>

                    {/* Results */}
                    {query.length >= 2 && (
                        <div className="space-y-1.5 max-h-52 overflow-y-auto">
                            {isFetching && <p className="text-xs text-muted-foreground text-center py-3">Buscando…</p>}
                            {!isFetching && filtered.length === 0 && (
                                <p className="text-xs text-muted-foreground text-center py-3">No se encontraron resultados</p>
                            )}
                            {filtered.map(c => (
                                <button
                                    key={c.id}
                                    onClick={() => { setSelected(c); setError(null); }}
                                    className={`w-full text-left flex items-center justify-between px-3 py-2.5 rounded-xl border transition ${selected?.id === c.id
                                        ? 'border-primary bg-primary/10'
                                        : 'border-border/50 hover:border-border hover:bg-muted/30'
                                        }`}
                                >
                                    <span className="text-sm font-medium">{c.display_name}</span>
                                    {selected?.id === c.id && <CheckCircle2 className="w-4 h-4 text-primary shrink-0" />}
                                </button>
                            ))}
                        </div>
                    )}

                    {/* Selected preview + warning */}
                    {selected && (
                        <div className="rounded-xl bg-amber-500/10 border border-amber-500/30 p-3 text-xs text-amber-400">
                            ⚠️ Las identidades de <strong>{selected.display_name}</strong> se moverán a <strong>{currentName}</strong>.
                            El contacto <strong>{selected.display_name}</strong> se eliminará.
                        </div>
                    )}

                    {error && (
                        <div className="rounded-xl bg-red-500/10 border border-red-500/30 p-3 text-xs text-red-400">
                            {error}
                        </div>
                    )}
                </div>

                <div className="flex gap-3 p-5 border-t border-border">
                    <Button variant="outline" className="flex-1" onClick={onClose}>Cancelar</Button>
                    <Button
                        className="flex-1 gap-2"
                        disabled={!selected || mutation.isPending}
                        onClick={() => mutation.mutate()}
                    >
                        <GitMerge className="w-4 h-4" />
                        {mutation.isPending ? "Vinculando…" : "Confirmar vínculo"}
                    </Button>
                </div>
            </div>
        </div>
    );
}
