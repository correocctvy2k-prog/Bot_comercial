import { Fragment, useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
    AreaChart, Area, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from "recharts";
import {
    MessageSquare, Users, Activity, Bot, Timer, TrendingDown, ArrowUpRight,
    Download, RefreshCw, Filter, ListChecks, MapPin, ChevronDown, Trophy,
} from "lucide-react";
import { chatbotAnalyticsService as api } from "@/services/chatbotAnalytics.service";
import { KpiCard, PeriodSelect, BotSummary, periodPhrase, BotAvatar } from "@/components/botKit";
import ContactDrawer from "@/components/ContactDrawer";
import PageHeader from "@/components/PageHeader";
import TopUsersBoard from "@/components/TopUsersBoard";

/* --------------------------------------------------------------------- */
/*  Piezas de presentación (design-system.md)                           */
/* --------------------------------------------------------------------- */

// Mapea el "tone" a los mismos acentos que usan los KPIs de Bot Comercial.
const TONE = {
    blue: { accent: "from-blue-500/20 to-blue-600/5", iconColor: "text-blue-400" },
    emerald: { accent: "from-emerald-500/20 to-emerald-600/5", iconColor: "text-emerald-400" },
    amber: { accent: "from-amber-500/20 to-amber-600/5", iconColor: "text-amber-400" },
    violet: { accent: "from-violet-500/20 to-violet-600/5", iconColor: "text-violet-400" },
    rose: { accent: "from-rose-500/20 to-rose-600/5", iconColor: "text-rose-400" },
    slate: { accent: "from-slate-500/20 to-slate-600/5", iconColor: "text-slate-400" },
};

// Envoltorio: mismos props que antes, pero renderiza el KpiCard de Bot Comercial.
function Kpi({ label, value, sub, icon, tone = "blue" }) {
    const t = TONE[tone] || TONE.blue;
    return <KpiCard title={label} value={value} badge={sub} icon={icon} accent={t.accent} iconColor={t.iconColor} />;
}

function Panel({ title, subtitle, right, icon, children }) {
    return (
        <div className="rounded-2xl border border-border/80 bg-card/60 shadow-sm backdrop-blur-xl">
            <div className="flex flex-col gap-2 border-b border-border/80 p-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex items-center gap-2">
                    {icon}
                    <div>
                        <h4 className="text-sm font-black tracking-tight text-foreground">{title}</h4>
                        {subtitle && <p className="text-[11px] text-muted-foreground">{subtitle}</p>}
                    </div>
                </div>
                {right}
            </div>
            <div className="p-4">{children}</div>
        </div>
    );
}

function ChartTooltip({ active, payload, label }) {
    if (!active || !payload?.length) return null;
    return (
        <div className="rounded-lg border border-border bg-card px-3 py-2 text-xs shadow-md">
            <p className="mb-1 font-bold text-foreground">{label}</p>
            {payload.map((p) => (
                <p key={p.dataKey} className="flex items-center gap-1.5 text-muted-foreground">
                    <span className="inline-block h-2 w-2 rounded-full" style={{ background: p.color }} />
                    {p.name}: <strong className="text-foreground">{p.value}</strong>
                </p>
            ))}
        </div>
    );
}

const axis = { tick: { fontSize: 11, fill: "#888" }, tickLine: false, axisLine: false };
const grid = <CartesianGrid stroke="rgba(255,255,255,0.05)" vertical={false} />;

function MiniBars({ rows, labelKey, valueKey, subKey, max, color = "bg-primary" }) {
    const top = max || Math.max(1, ...rows.map((r) => r[valueKey]));
    return (
        <div className="space-y-2.5">
            {rows.map((r, i) => (
                <div key={i}>
                    <div className="mb-1 flex items-center justify-between gap-2 text-xs">
                        <span className="truncate font-bold text-foreground">{r[labelKey]}</span>
                        <span className="shrink-0 text-muted-foreground">
                            {r[valueKey]}{subKey != null && r[subKey] != null ? ` · ${r[subKey]}` : ""}
                        </span>
                    </div>
                    <div className="h-2 overflow-hidden rounded-full bg-muted">
                        <div className={`h-full rounded-full ${color}`} style={{ width: `${(r[valueKey] / top) * 100}%` }} />
                    </div>
                </div>
            ))}
            {rows.length === 0 && <p className="py-4 text-center text-xs text-muted-foreground">Sin datos.</p>}
        </div>
    );
}

const pct = (n) => (n == null ? "—" : `${Math.round(n * 10) / 10}%`);
const fmtDay = (d) => (d ? d.slice(5) : "");
const fmtHour = (h) => `${String(h).padStart(2, "0")}h`;
const timeAgo = (iso) => {
    if (!iso) return "—";
    const s = (Date.now() - new Date(iso).getTime()) / 1000;
    if (s < 90) return "hace un momento";
    if (s < 3600) return `hace ${Math.round(s / 60)} min`;
    if (s < 86400) return `hace ${Math.round(s / 3600)} h`;
    return `hace ${Math.round(s / 86400)} d`;
};

/* --------------------------------------------------------------------- */
/*  Panel principal                                                     */
/* --------------------------------------------------------------------- */

// Resúmenes en lenguaje natural (propuesta 8).
function summarizeOskitar(m, range) {
    const k = m?.kpis; if (!k) return null;
    let t = `Oskitar atendió ${k.sessions ?? 0} conversaciones de ${k.uniqueUsers ?? 0} personas ${periodPhrase(range)}`;
    if (k.botContainmentRate != null) t += ` y resolvió el ${Math.round(k.botContainmentRate)}% sin escalar a un humano`;
    t += ".";
    if (k.responseMedianSec != null) t += ` La respuesta fue de ${k.responseMedianSec}s de mediana`;
    if (k.escalationRate != null) t += `${k.responseMedianSec != null ? "; " : ". El "}${Math.round(k.escalationRate)}% pasó a soporte humano.`;
    return t;
}
function summarizeBetty(m, range) {
    const k = m?.kpis; if (!k) return null;
    let t = `Betty recibió ${k.totalMessages ?? 0} mensajes de ${k.uniqueCustomers ?? 0} clientes e inició ${k.flowsStarted ?? 0} flujos ${periodPhrase(range)}.`;
    if (k.notAvailableRate != null) t += ` El ${Math.round(k.notAvailableRate)}% de las interacciones cayó en "no disponible".`;
    return t;
}

export default function ChatbotAnalyticsPanel({ bot }) {
    const [range, setRange] = useState("7d");
    const [category, setCategory] = useState("Todas");
    const [expanded, setExpanded] = useState(null);

    const query = useQuery({
        queryKey: ["chatbot-analytics", bot, range, category],
        queryFn: ({ signal }) => api.getModel(bot, { range, category }, { signal }),
        staleTime: 15_000,
        retry: 1,
    });

    // Live updates por SSE: al recibir 'update' se refresca.
    useEffect(() => api.subscribe(bot, () => query.refetch()), [bot]); // eslint-disable-line react-hooks/exhaustive-deps

    // "Actualizar": pide al servicio releer los logs y luego refresca el modelo.
    const hardRefresh = () => api.refresh(bot).catch(() => {}).finally(() => query.refetch());

    const m = query.data;

    if (query.isLoading) {
        return <div className="rounded-2xl border border-border/80 bg-card/60 p-10 text-center text-sm text-muted-foreground">Cargando analítica de {bot}…</div>;
    }
    if (query.isError) {
        return (
            <div className="rounded-2xl border border-rose-500/30 bg-rose-500/5 p-8 text-center">
                <p className="text-sm font-bold text-rose-500">No se pudo cargar la analítica de {bot}.</p>
                <p className="mt-1 text-xs text-muted-foreground">{String(query.error?.message || "").slice(0, 200)}</p>
                <button onClick={() => query.refetch()} className="mt-4 inline-flex items-center gap-1.5 rounded-xl border border-border bg-card px-4 py-2 text-xs font-bold hover:bg-muted">
                    <RefreshCw size={13} /> Reintentar
                </button>
            </div>
        );
    }

    return bot === "betty"
        ? <BettyView m={m} range={range} setRange={setRange} onRefresh={hardRefresh} fetching={query.isFetching} />
        : <OskitarView m={m} range={range} setRange={setRange} category={category} setCategory={setCategory} expanded={expanded} setExpanded={setExpanded} onRefresh={hardRefresh} fetching={query.isFetching} />;
}

/* ------------------------------ toolbar ------------------------------ */

function Toolbar({ range, setRange, category, setCategory, categories, csvHref, onRefresh, fetching }) {
    return (
        <div className="flex flex-wrap items-center gap-2">
            <PeriodSelect value={range} onChange={setRange} className="w-44" />
            {categories && (
                <div className="relative">
                    <Filter size={13} className="pointer-events-none absolute left-2.5 top-2.5 text-muted-foreground" />
                    <select
                        value={category}
                        onChange={(e) => setCategory(e.target.value)}
                        className="appearance-none rounded-xl border border-border bg-background py-2 pl-8 pr-8 text-[11px] font-bold text-foreground outline-none focus:border-primary/50"
                    >
                        {categories.map((c) => <option key={c} value={c}>{c}</option>)}
                    </select>
                </div>
            )}
            <button onClick={onRefresh} disabled={fetching} className="inline-flex items-center gap-1.5 rounded-xl border border-border bg-card px-3 py-2 text-[11px] font-bold text-foreground hover:bg-muted disabled:opacity-50">
                <RefreshCw size={13} className={fetching ? "animate-spin" : ""} /> Actualizar
            </button>
            <a href={csvHref} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 rounded-xl border border-border bg-card px-3 py-2 text-[11px] font-bold text-foreground hover:border-primary/40 hover:bg-muted/60">
                <Download size={13} /> CSV
            </a>
        </div>
    );
}

/* ------------------------------ Oskitar ------------------------------ */

function OskitarView({ m, range, setRange, category, setCategory, expanded, setExpanded, onRefresh, fetching }) {
    const [view, setView] = useState("resumen"); // resumen | detalle
    const [dayPick, setDayPick] = useState(null);
    const [ficha, setFicha] = useState(null);
    const k = m.kpis || {};
    const csvHref = api.exportCsvUrl("oskitar", {});
    const dayData = (m.byDay || []).map((d) => ({ ...d, day: fmtDay(d.date) }));
    const hourData = (m.byHour || []).map((h) => ({ ...h, h: fmtHour(h.hour) }));
    const users = m.users || [];

    return (
        <div className="space-y-6">
            <PageHeader
                icon={<BotAvatar bot="oskitar" size={44} />}
                title="Oskitar — soporte técnico interno"
                subtitle={`${m.meta?.rangeStart ?? "—"} a ${m.meta?.rangeEnd ?? "—"} · ${m.meta?.daysCovered ?? 0} días`}
                actions={
                    <Toolbar
                        range={range} setRange={setRange}
                        category={category} setCategory={setCategory}
                        categories={m.meta?.availableCategories}
                        csvHref={csvHref} onRefresh={onRefresh} fetching={fetching}
                    />
                }
            />

            <BotSummary>{summarizeOskitar(m, range)}</BotSummary>

            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                <Kpi label="Conversaciones" value={k.sessions ?? "—"} sub={`${k.messagesPerSession ?? 0} mensajes/conv.`} icon={<MessageSquare size={19} />} tone="blue" />
                <Kpi label="Personas únicas" value={k.uniqueUsers ?? "—"} sub={`${pct(k.recurringUserRate)} recurrentes`} icon={<Users size={19} />} tone="emerald" />
                <Kpi label="Contención del bot" value={pct(k.botContainmentRate)} sub={`${pct(k.escalationRate)} escaló a humano`} icon={<Bot size={19} />} tone="violet" />
                <Kpi label="Respuesta (mediana)" value={`${k.responseMedianSec ?? "—"}s`} sub={`p90 ${k.responseP90Sec ?? "—"}s`} icon={<Timer size={19} />} tone="amber" />
                <Kpi label="Mensajes" value={k.totalMessages ?? "—"} sub={`${k.inbound ?? 0} in · ${k.outbound ?? 0} out`} icon={<Activity size={19} />} tone="blue" />
                <Kpi label="Duración media" value={`${k.avgSessionDurationMin ?? "—"} min`} sub={`validación ${pct(k.validationRate)}`} icon={<Timer size={19} />} tone="slate" />
                <Kpi label="Agradecen al cerrar" value={pct(k.gratitudeRate)} icon={<ArrowUpRight size={19} />} tone="emerald" />
                <Kpi label="Multimedia entregada" value={k.mediaDelivered ?? "—"} icon={<TrendingDown size={19} />} tone="slate" />
            </div>

            <div className="flex gap-1 rounded-xl border border-border bg-background p-1 w-fit">
                {[["resumen", "Resumen"], ["detalle", "Detalle · analítica"]].map(([id, label]) => (
                    <button
                        key={id}
                        onClick={() => setView(id)}
                        className={`rounded-lg px-4 py-1.5 text-[11px] font-bold transition-all ${view === id ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground hover:bg-muted/50 hover:text-foreground"}`}
                    >
                        {label}
                    </button>
                ))}
            </div>

            {view === "resumen" && <>
            <div className="grid gap-6 xl:grid-cols-[1.5fr_1fr]">
                <Panel title="Actividad por día" subtitle="Mensajes entrantes vs. salientes" icon={<Activity size={16} className="text-primary" />}>
                    <ResponsiveContainer width="100%" height={220}>
                        <AreaChart data={dayData} margin={{ top: 6, right: 8, left: -8, bottom: 0 }}>
                            <defs>
                                <linearGradient id="oIn" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#3b82f6" stopOpacity={0.35} /><stop offset="95%" stopColor="#3b82f6" stopOpacity={0} /></linearGradient>
                                <linearGradient id="oOut" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#10b981" stopOpacity={0.3} /><stop offset="95%" stopColor="#10b981" stopOpacity={0} /></linearGradient>
                            </defs>
                            {grid}
                            <XAxis dataKey="day" {...axis} />
                            <YAxis {...axis} width={40} />
                            <Tooltip content={<ChartTooltip />} />
                            <Area type="monotone" dataKey="inbound" name="Entrantes" stroke="#3b82f6" strokeWidth={2} fill="url(#oIn)" />
                            <Area type="monotone" dataKey="outbound" name="Salientes" stroke="#10b981" strokeWidth={2} fill="url(#oOut)" />
                        </AreaChart>
                    </ResponsiveContainer>
                </Panel>
                <Panel title="Por hora del día" subtitle="Mensajes entrantes" icon={<Activity size={16} className="text-primary" />}>
                    <ResponsiveContainer width="100%" height={220}>
                        <BarChart data={hourData} margin={{ top: 6, right: 8, left: -8, bottom: 0 }}>
                            {grid}
                            <XAxis dataKey="h" {...axis} interval={2} />
                            <YAxis {...axis} width={40} />
                            <Tooltip content={<ChartTooltip />} cursor={{ fill: "rgba(255,255,255,0.04)" }} />
                            <Bar dataKey="inbound" name="Entrantes" radius={[4, 4, 0, 0]} fill="#6366f1" />
                        </BarChart>
                    </ResponsiveContainer>
                </Panel>
            </div>

            <div className="grid gap-6 xl:grid-cols-2">
                <Panel title="Embudo de atención" subtitle="Del total que inició conversación" icon={<ListChecks size={16} className="text-primary" />}>
                    <MiniBars
                        rows={(m.funnel || []).map((f) => ({ stage: f.stage, count: f.count, pct: pct(f.pctOfStart) }))}
                        labelKey="stage" valueKey="count" subKey="pct" max={(m.funnel || [])[0]?.count}
                        color="bg-gradient-to-r from-blue-500 to-indigo-500"
                    />
                </Panel>
                <Panel title="Categorías de consulta" subtitle="Por número de mensajes" icon={<MapPin size={16} className="text-primary" />}>
                    <MiniBars
                        rows={(m.categories || []).slice(0, 8).map((c) => ({ category: c.category, messages: c.messages, pct: pct(c.pct) }))}
                        labelKey="category" valueKey="messages" subKey="pct"
                        color="bg-gradient-to-r from-violet-500 to-fuchsia-500"
                    />
                </Panel>
            </div>
            </>}

            {view === "detalle" && <OskitarDetalle m={m} dayPick={dayPick} setDayPick={setDayPick} />}

            <TopUsersBoard
                title="Top 5 personas"
                subtitle="Por mensajes enviados en el periodo"
                icon={<span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-gradient-to-tr from-amber-500 to-yellow-500 text-black shadow-inner"><Trophy size={20} /></span>}
                rows={(m.topUsers || []).slice(0, 5).map((u, i) => ({
                    key: u.phone,
                    rank: i + 1,
                    name: u.label || u.phone,
                    sublabel: u.phone,
                    value: u.count,
                    valueLabel: "mensajes",
                }))}
                onRowClick={(r) => setFicha({ id: r.key, name: r.name })}
            />

            <Panel
                title={`Personas (${users.length})`}
                subtitle="Toca una fila para ver el detalle"
                icon={<Users size={16} className="text-primary" />}
            >
                <div className="overflow-x-auto">
                    <table className="w-full min-w-[640px] text-left text-xs">
                        <thead>
                            <tr className="border-b border-border/80 bg-muted/40 text-[10px] font-extrabold uppercase tracking-wider text-muted-foreground">
                                <th className="px-3 py-2.5">Persona</th>
                                <th className="hidden px-3 py-2.5 md:table-cell">Categorías</th>
                                <th className="px-3 py-2.5 text-center">Conv.</th>
                                <th className="px-3 py-2.5 text-center">Mensajes</th>
                                <th className="hidden px-3 py-2.5 text-right sm:table-cell">Última</th>
                                <th className="w-24 py-2.5 pr-3" />
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-border/40">
                            {users.map((u, i) => {
                                const open = expanded === i;
                                return (
                                    <Fragment key={i}>
                                        <tr onClick={() => setExpanded(open ? null : i)} className="cursor-pointer transition-colors hover:bg-muted/40">
                                            <td className="px-3 py-2.5">
                                                <p className="flex items-center gap-1.5 font-bold text-foreground">
                                                    {u.name || "—"}
                                                    {u.escalated && <span className="rounded bg-rose-500/15 px-1 text-[9px] font-black text-rose-600 dark:text-rose-300">ESCALÓ</span>}
                                                    {u.validated && <span className="rounded bg-emerald-500/15 px-1 text-[9px] font-black text-emerald-700 dark:text-emerald-300">OK</span>}
                                                </p>
                                                <p className="text-[10px] text-muted-foreground">{u.phone}{u.document ? ` · ${u.document}` : ""}</p>
                                            </td>
                                            <td className="hidden max-w-[260px] px-3 py-2.5 text-[11px] text-foreground/80 md:table-cell">{(u.categories || []).join(" · ") || "—"}</td>
                                            <td className="px-3 py-2.5 text-center font-bold text-foreground">{u.sessions}</td>
                                            <td className="px-3 py-2.5 text-center"><span className="font-black text-foreground">{u.totalMessages}</span></td>
                                            <td className="hidden px-3 py-2.5 text-right text-[11px] text-muted-foreground sm:table-cell">{timeAgo(u.lastInteraction)}</td>
                                            <td className="py-2.5 pr-3 text-right text-muted-foreground">
                                                <div className="flex items-center justify-end gap-1.5">
                                                    <button
                                                        onClick={(e) => { e.stopPropagation(); setFicha({ id: u.phone, name: u.name }); }}
                                                        className="rounded-md border border-border/70 bg-card px-2 py-1 text-[10px] font-bold text-foreground/80 transition-colors hover:bg-muted"
                                                    >
                                                        Ficha
                                                    </button>
                                                    <ChevronDown size={14} className={`transition-transform ${open ? "rotate-180" : ""}`} />
                                                </div>
                                            </td>
                                        </tr>
                                        {open && (
                                            <tr className="bg-muted/30">
                                                <td colSpan={6} className="px-4 py-3 text-xs">
                                                    <div className="grid gap-3 sm:grid-cols-2">
                                                        <div><span className="font-bold text-muted-foreground">Entrantes / salientes:</span> {u.inbound} / {u.outbound} · resp. media {u.avgResponseSec ?? "—"}s</div>
                                                        <div><span className="font-bold text-muted-foreground">Actividad:</span> {new Date(u.firstInteraction).toLocaleDateString("es-CO")} → {new Date(u.lastInteraction).toLocaleString("es-CO")}</div>
                                                        <div className="sm:col-span-2"><span className="font-bold text-muted-foreground">Último mensaje:</span> {u.lastMessage || "—"}</div>
                                                    </div>
                                                </td>
                                            </tr>
                                        )}
                                    </Fragment>
                                );
                            })}
                            {users.length === 0 && <tr><td colSpan={6} className="py-8 text-center text-muted-foreground">Sin personas en el rango.</td></tr>}
                        </tbody>
                    </table>
                </div>
            </Panel>

            <ContactDrawer open={!!ficha} bot="oskitar" target={ficha} onClose={() => setFicha(null)} />
        </div>
    );
}

/* ------------------------ Oskitar · Detalle ------------------------- */

function OskitarDetalle({ m, dayPick, setDayPick }) {
    const rt = m.responseTime || {};
    const weekday = (m.byWeekday || []).map((w) => ({ name: (w.name || "").slice(0, 3), count: w.count }));
    const peopleByDay = (m.peopleByDay || []).map((d) => ({
        date: d.date, day: fmtDay(d.date),
        total: (d.people || []).reduce((s, p) => s + (p.messages || 0), 0),
        people: d.people || [],
    }));
    const rec = m.recurring || {};
    const pickedDay = peopleByDay.find((d) => d.date === dayPick);

    return (
        <div className="space-y-6">
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                <Kpi label="Personas recurrentes" value={rec.recurringUsers ?? "—"} sub={`${rec.newUsers ?? 0} nuevas`} icon={<Users size={19} />} tone="violet" />
                <Kpi label="Conv. de recurrentes" value={rec.sessionsFromRecurring ?? "—"} icon={<RefreshCw size={19} />} tone="blue" />
                <Kpi label="Conv. por persona" value={rec.avgSessionsPerUser ?? "—"} icon={<Activity size={19} />} tone="emerald" />
                <Kpi label="Muestras de respuesta" value={rt.samples ?? "—"} sub={`prom. ${rt.avgSec ?? "—"}s`} icon={<Timer size={19} />} tone="amber" />
            </div>

            <div className="grid gap-6 xl:grid-cols-2">
                <Panel title="Rapidez de respuesta" subtitle={`Mediana ${rt.medianSec ?? "—"}s · p90 ${rt.p90Sec ?? "—"}s`} icon={<Timer size={16} className="text-primary" />}>
                    <MiniBars
                        rows={(rt.buckets || []).map((x) => ({ label: x.label, count: x.count }))}
                        labelKey="label" valueKey="count"
                        color="bg-gradient-to-r from-amber-500 to-orange-500"
                    />
                </Panel>
                <Panel title="Actividad por día de la semana" icon={<Activity size={16} className="text-primary" />}>
                    <ResponsiveContainer width="100%" height={200}>
                        <BarChart data={weekday} margin={{ top: 6, right: 8, left: -8, bottom: 0 }}>
                            {grid}
                            <XAxis dataKey="name" {...axis} />
                            <YAxis {...axis} width={40} />
                            <Tooltip content={<ChartTooltip />} cursor={{ fill: "rgba(255,255,255,0.04)" }} />
                            <Bar dataKey="count" name="Mensajes" radius={[4, 4, 0, 0]} fill="#8b5cf6" />
                        </BarChart>
                    </ResponsiveContainer>
                </Panel>
            </div>

            <div className="grid gap-6 xl:grid-cols-2">
                <Panel title="Motivos de escalamiento" subtitle="Por qué el bot no pudo resolver" icon={<TrendingDown size={16} className="text-primary" />}>
                    <MiniBars
                        rows={(m.contingencyResponses || []).map((x) => ({ reason: x.reason, count: x.count }))}
                        labelKey="reason" valueKey="count"
                        color="bg-gradient-to-r from-rose-500 to-red-500"
                    />
                </Panel>
                <Panel title="Contenido más enviado" subtitle="Videos, audios y documentos del bot" icon={<Download size={16} className="text-primary" />}>
                    <MiniBars
                        rows={(m.contentDelivered || []).slice(0, 8).map((x) => ({ title: x.title, count: x.count, type: x.type }))}
                        labelKey="title" valueKey="count" subKey="type"
                        color="bg-gradient-to-r from-emerald-500 to-teal-500"
                    />
                </Panel>
            </div>

            <Panel title="Personas por día" subtitle="Toca una barra para ver quiénes escribieron ese día" icon={<Users size={16} className="text-primary" />}>
                <ResponsiveContainer width="100%" height={200}>
                    <BarChart data={peopleByDay} margin={{ top: 6, right: 8, left: -8, bottom: 0 }} onClick={(e) => setDayPick(e?.activePayload?.[0]?.payload?.date ?? null)}>
                        {grid}
                        <XAxis dataKey="day" {...axis} />
                        <YAxis {...axis} width={40} />
                        <Tooltip content={<ChartTooltip />} cursor={{ fill: "rgba(255,255,255,0.06)" }} />
                        <Bar dataKey="total" name="Mensajes" radius={[4, 4, 0, 0]} fill="#3b82f6" className="cursor-pointer" />
                    </BarChart>
                </ResponsiveContainer>
                {pickedDay && (
                    <div className="mt-4 rounded-xl border border-border/70 bg-muted/30 p-3">
                        <p className="mb-2 text-xs font-bold text-foreground">{pickedDay.day} · {pickedDay.people.length} personas</p>
                        <div className="space-y-1.5">
                            {pickedDay.people.map((p, i) => (
                                <div key={i} className="flex items-center justify-between gap-2 text-xs">
                                    <span className="truncate text-foreground/80">{p.name || "—"} <span className="text-muted-foreground">· {p.phone}</span></span>
                                    <span className="shrink-0 font-bold text-foreground">{p.messages} msg</span>
                                </div>
                            ))}
                        </div>
                    </div>
                )}
            </Panel>
        </div>
    );
}

/* ------------------------------- Betty ------------------------------- */

function BettyView({ m, range, setRange, onRefresh, fetching }) {
    const [ficha, setFicha] = useState(null);
    const k = m.kpis || {};
    const csvHref = api.exportCsvUrl("betty", {});
    const dayData = (m.byDay || []).map((d) => ({ ...d, day: fmtDay(d.date) }));
    const hourData = (m.byHour || []).map((h) => ({ ...h, h: fmtHour(h.hour) }));
    const customers = m.customers || [];

    return (
        <div className="space-y-6">
            <PageHeader
                icon={<BotAvatar bot="betty" size={44} />}
                title="Betty — atención a clientes"
                subtitle={`${m.meta?.rangeStart ?? "—"} a ${m.meta?.rangeEnd ?? "—"} · ${m.meta?.daysCovered ?? 0} días · horas aproximadas`}
                actions={<Toolbar range={range} setRange={setRange} csvHref={csvHref} onRefresh={onRefresh} fetching={fetching} />}
            />

            <BotSummary>{summarizeBetty(m, range)}</BotSummary>

            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                <Kpi label="Clientes únicos" value={k.uniqueCustomers ?? "—"} sub={`${k.messagesPerCustomer ?? 0} mensajes/cliente`} icon={<Users size={19} />} tone="emerald" />
                <Kpi label="Mensajes" value={k.totalMessages ?? "—"} icon={<MessageSquare size={19} />} tone="blue" />
                <Kpi label="Flujos iniciados" value={k.flowsStarted ?? "—"} icon={<ListChecks size={19} />} tone="violet" />
                <Kpi label={'"No disponible"'} value={pct(k.notAvailableRate)} sub={`${k.stepCorrections ?? 0} correcciones de paso`} icon={<TrendingDown size={19} />} tone="amber" />
            </div>

            <div className="grid gap-6 xl:grid-cols-[1.5fr_1fr]">
                <Panel title="Actividad por día" subtitle="Mensajes" icon={<Activity size={16} className="text-primary" />}>
                    <ResponsiveContainer width="100%" height={220}>
                        <AreaChart data={dayData} margin={{ top: 6, right: 8, left: -8, bottom: 0 }}>
                            <defs><linearGradient id="bDay" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#8b5cf6" stopOpacity={0.35} /><stop offset="95%" stopColor="#8b5cf6" stopOpacity={0} /></linearGradient></defs>
                            {grid}
                            <XAxis dataKey="day" {...axis} />
                            <YAxis {...axis} width={40} />
                            <Tooltip content={<ChartTooltip />} />
                            <Area type="monotone" dataKey="count" name="Mensajes" stroke="#8b5cf6" strokeWidth={2} fill="url(#bDay)" />
                        </AreaChart>
                    </ResponsiveContainer>
                </Panel>
                <Panel title="Por hora del día" icon={<Activity size={16} className="text-primary" />}>
                    <ResponsiveContainer width="100%" height={220}>
                        <BarChart data={hourData} margin={{ top: 6, right: 8, left: -8, bottom: 0 }}>
                            {grid}
                            <XAxis dataKey="h" {...axis} interval={2} />
                            <YAxis {...axis} width={40} />
                            <Tooltip content={<ChartTooltip />} cursor={{ fill: "rgba(255,255,255,0.04)" }} />
                            <Bar dataKey="count" name="Mensajes" radius={[4, 4, 0, 0]} fill="#a855f7" />
                        </BarChart>
                    </ResponsiveContainer>
                </Panel>
            </div>

            <div className="grid gap-6 xl:grid-cols-2">
                <Panel title="Para qué usan a Betty" subtitle="Flujos por número de inicios" icon={<ListChecks size={16} className="text-primary" />}>
                    <MiniBars
                        rows={(m.flows || []).map((f) => ({ name: f.name, starts: f.starts, customers: `${f.customers} clientes` }))}
                        labelKey="name" valueKey="starts" subKey="customers"
                        color="bg-gradient-to-r from-violet-500 to-fuchsia-500"
                    />
                </Panel>
                <Panel title="Qué escriben" subtitle="Intenciones detectadas" icon={<MessageSquare size={16} className="text-primary" />}>
                    <MiniBars
                        rows={(m.intents || []).slice(0, 8).map((x) => ({ intent: x.intent, count: x.count, pct: pct(x.pct) }))}
                        labelKey="intent" valueKey="count" subKey="pct"
                        color="bg-gradient-to-r from-blue-500 to-indigo-500"
                    />
                </Panel>
            </div>

            <div className="grid gap-6 xl:grid-cols-2">
                <Panel title="Recorrido — Consultar resultados" subtitle="Del total que entró al flujo" icon={<ListChecks size={16} className="text-primary" />}>
                    <MiniBars
                        rows={(m.resultadosFunnel || []).map((s) => ({ stage: s.stage, count: s.count, pct: pct(s.pctOfStart) }))}
                        labelKey="stage" valueKey="count" subKey="pct" max={(m.resultadosFunnel || [])[0]?.count}
                        color="bg-gradient-to-r from-emerald-500 to-teal-500"
                    />
                </Panel>
                <Panel title="Tipos de mensaje" subtitle="Cómo escriben los clientes" icon={<Activity size={16} className="text-primary" />}>
                    <MiniBars
                        rows={(m.messageTypes || []).map((x) => ({ type: x.type, count: x.count, pct: pct(x.pct) }))}
                        labelKey="type" valueKey="count" subKey="pct"
                        color="bg-gradient-to-r from-amber-500 to-orange-500"
                    />
                </Panel>
            </div>

            <div className="grid gap-6 xl:grid-cols-2">
                <Panel title="Clientes más activos" subtitle="Por número de mensajes" icon={<Users size={16} className="text-primary" />}>
                    <MiniBars
                        rows={(m.topCustomers || []).slice(0, 8).map((x) => ({ phone: x.phone, count: x.count }))}
                        labelKey="phone" valueKey="count"
                        color="bg-gradient-to-r from-violet-500 to-fuchsia-500"
                    />
                </Panel>
                <Panel title="Actividad por día de la semana" icon={<Activity size={16} className="text-primary" />}>
                    <ResponsiveContainer width="100%" height={200}>
                        <BarChart data={(m.byWeekday || []).map((w) => ({ name: (w.name || "").slice(0, 3), count: w.count }))} margin={{ top: 6, right: 8, left: -8, bottom: 0 }}>
                            {grid}
                            <XAxis dataKey="name" {...axis} />
                            <YAxis {...axis} width={40} />
                            <Tooltip content={<ChartTooltip />} cursor={{ fill: "rgba(255,255,255,0.04)" }} />
                            <Bar dataKey="count" name="Mensajes" radius={[4, 4, 0, 0]} fill="#a855f7" />
                        </BarChart>
                    </ResponsiveContainer>
                </Panel>
            </div>

            <TopUsersBoard
                title="Top 5 clientes"
                subtitle="Por mensajes en el periodo"
                icon={<span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-gradient-to-tr from-amber-500 to-yellow-500 text-black shadow-inner"><Trophy size={20} /></span>}
                rows={(m.topCustomers || []).slice(0, 5).map((c, i) => ({
                    key: c.phone,
                    rank: i + 1,
                    name: c.phone,
                    value: c.count,
                    valueLabel: "mensajes",
                }))}
                onRowClick={(r) => setFicha({ id: r.key, name: r.name })}
                emptyText="Sin clientes en el rango."
            />

            <Panel title={`Clientes (${customers.length})`} icon={<Users size={16} className="text-primary" />}>
                <div className="overflow-x-auto">
                    <table className="w-full min-w-[560px] text-left text-xs">
                        <thead>
                            <tr className="border-b border-border/80 bg-muted/40 text-[10px] font-extrabold uppercase tracking-wider text-muted-foreground">
                                <th className="px-3 py-2.5">Cliente</th>
                                <th className="hidden px-3 py-2.5 md:table-cell">Flujos</th>
                                <th className="px-3 py-2.5 text-center">Mensajes</th>
                                <th className="px-3 py-2.5 text-center">No disp.</th>
                                <th className="hidden px-3 py-2.5 text-right sm:table-cell">Última</th>
                                <th className="w-24 py-2.5 pr-3" />
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-border/40">
                            {customers.map((c, i) => (
                                <tr
                                    key={i}
                                    onClick={() => setFicha({ id: c.phone, name: c.phone })}
                                    className="cursor-pointer transition-colors hover:bg-muted/40"
                                >
                                    <td className="px-3 py-2.5">
                                        <p className="font-bold text-foreground">{c.phone}</p>
                                        <p className="text-[10px] text-muted-foreground">intención: {c.topIntent || "—"}</p>
                                    </td>
                                    <td className="hidden max-w-[240px] px-3 py-2.5 text-[11px] text-foreground/80 md:table-cell">{(c.flows || []).join(" · ") || "—"}</td>
                                    <td className="px-3 py-2.5 text-center font-bold text-foreground">{c.messages}</td>
                                    <td className="px-3 py-2.5 text-center text-muted-foreground">{c.notAvailable ?? 0}</td>
                                    <td className="hidden px-3 py-2.5 text-right text-[11px] text-muted-foreground sm:table-cell">{timeAgo(c.lastActivity)}</td>
                                    <td className="py-2.5 pr-3 text-right">
                                        <span className="rounded-md border border-border/70 bg-card px-2 py-1 text-[10px] font-bold text-foreground/80">Ficha</span>
                                    </td>
                                </tr>
                            ))}
                            {customers.length === 0 && <tr><td colSpan={6} className="py-8 text-center text-muted-foreground">Sin clientes en el rango.</td></tr>}
                        </tbody>
                    </table>
                </div>
            </Panel>

            <ContactDrawer open={!!ficha} bot="betty" target={ficha} onClose={() => setFicha(null)} />
        </div>
    );
}
