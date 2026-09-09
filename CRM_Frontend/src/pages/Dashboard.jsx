import React, { useEffect, useState } from "react";
import { Activity, MessageSquare, Users, Zap, GitMerge, TrendingUp, ShieldCheck, Trophy, Crown, Medal, Award, MapPin, Calendar, Search, ChevronDown, ChevronUp, ChevronLeft, ChevronRight, Download, Filter, Sparkles, Bot } from "lucide-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useParams, useNavigate } from "react-router-dom";
import { crmService } from "@/services/crm.service";
import ChatbotAnalyticsPanel from "@/components/ChatbotAnalyticsPanel";
import { KpiCard, PeriodSelect, BotSummary, periodPhrase, BotAvatar } from "@/components/botKit";
import ContactDrawer from "@/components/ContactDrawer";
import PageHeader from "@/components/PageHeader";
import TopUsersBoard from "@/components/TopUsersBoard";

import { supabase } from "@/services/supabase";
import { formatDistanceToNow } from "date-fns";
import { es } from "date-fns/locale";
import {
    AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from "recharts";

// --- Canal Icons (SVG inline, sin dependencias extra) ---------------
const WhatsAppIcon = ({ size = 16 }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
        <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.297-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z" fill="#25D366" />
        <path d="M12 0C5.373 0 0 5.373 0 12c0 2.127.558 4.122 1.532 5.852L.054 23.35a.75.75 0 00.918.919l5.593-1.494A11.942 11.942 0 0012 24c6.627 0 12-5.373 12-12S18.627 0 12 0zm0 22c-1.943 0-3.76-.523-5.314-1.432l-.38-.224-3.946 1.055 1.04-3.854-.247-.393A9.956 9.956 0 012 12C2 6.477 6.477 2 12 2s10 4.477 10 10-4.477 10-10 10z" fill="#25D366" />
    </svg>
);

const TelegramIcon = ({ size = 16 }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
        <circle cx="12" cy="12" r="12" fill="#2AABEE" />
        <path d="M17.54 7.155l-2.04 9.61c-.15.673-.54.84-1.094.523l-3.03-2.232-1.462 1.407c-.162.162-.297.297-.61.297l.218-3.085 5.62-5.077c.244-.218-.054-.337-.378-.12L6.56 13.91 3.57 12.98c-.657-.206-.67-.657.138-.973l13.702-5.284c.546-.198 1.024.134.83.432z" fill="white" />
    </svg>
);

// --- Tooltip personalizado para la gráfica ---------------------------
const CustomTooltip = ({ active, payload, label }) => {
    if (!active || !payload?.length) return null;
    return (
        <div className="bg-card border border-border rounded-lg p-3 shadow-xl text-sm">
            <p className="font-semibold mb-2 text-foreground">{label}</p>
            {payload.map((p) => (
                <div key={p.dataKey} className="flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full" style={{ background: p.color }} />
                    <span className="text-muted-foreground">{p.dataKey}:</span>
                    <span className="font-bold text-foreground">{p.value}</span>
                </div>
            ))}
        </div>
    );
};

// --- Donut label central ---------------------------------------------
const DonutLabel = ({ cx, cy, total }) => (
    <>
        <text x={cx} y={cy - 8} textAnchor="middle" className="fill-foreground" style={{ fontSize: 22, fontWeight: 700 }}>
            {total}
        </text>
        <text x={cx} y={cy + 14} textAnchor="middle" style={{ fontSize: 11, fill: "#888" }}>
            total
        </text>
    </>
);

function summarizeComercial(stats, range) {
    if (!stats) return null;
    const n = (x) => (x ?? 0).toLocaleString("es-CO");
    const parts = [
        `El Bot Comercial registró ${n(stats.messagesTotal)} interacciones de ${n(stats.uniqueUsers)} usuarios ${periodPhrase(range)}`,
        `(${n(stats.waTotal)} por WhatsApp, ${n(stats.tgTotal)} por Telegram)`,
    ];
    if (stats.newLeads != null) parts.push(`y ${n(stats.newLeads)} contactos nuevos`);
    let text = parts.join(" ") + ".";
    if (typeof stats.changePct === "number" && stats.changePct !== 0) {
        text += ` Eso es ${stats.changePct > 0 ? "un aumento" : "una baja"} del ${Math.abs(stats.changePct)}% frente al periodo anterior.`;
    }
    return text;
}

// --------------------------------------------------------------------
//  DASHBOARD PRINCIPAL
// --------------------------------------------------------------------
const BOTS = ["comercial", "oskitar", "betty"];

export default function Dashboard() {
    const queryClient = useQueryClient();
    const navigate = useNavigate();
    const { bot } = useParams();
    const [timeRange, setTimeRange] = useState("24h");
    // El bot activo lo manda la URL (/bots/:bot). El conmutador navega.
    const agentType = BOTS.includes(bot) ? bot : "comercial";
    const setAgentType = (id) => navigate(`/bots/${id}`);

    const { data: stats } = useQuery({
        queryKey: ["stats", timeRange],
        queryFn: () => crmService.getDashboardStats(timeRange),
        refetchInterval: 15000,
        staleTime: 0,
    });

    const { data: feed = [] } = useQuery({
        queryKey: ["feed"],
        queryFn: () => crmService.getRecentInteractions(15),
        refetchInterval: 8000,
        staleTime: 0,
    });

    const { data: activity = [] } = useQuery({
        queryKey: ["activity", timeRange],
        queryFn: () => crmService.getActivity(timeRange),
        refetchInterval: 60000,
        staleTime: 0,
    });

    const { data: distribution = [] } = useQuery({
        queryKey: ["distribution", timeRange],
        queryFn: () => crmService.getChannelDistribution(timeRange),
        refetchInterval: 60000,
        staleTime: 0,
    });


    const { data: userRanking = [] } = useQuery({
        queryKey: ["userRanking", timeRange],
        queryFn: () => crmService.getUserRanking(timeRange),
        refetchInterval: 15000,
        staleTime: 0,
    });

    // Realtime subscription - invalida TODOS los datos al recibir un INSERT
    useEffect(() => {
        const invalidateAll = () => {
            queryClient.invalidateQueries({ queryKey: ["feed"] });
            queryClient.invalidateQueries({ queryKey: ["stats"] });
            queryClient.invalidateQueries({ queryKey: ["activity"] });
            queryClient.invalidateQueries({ queryKey: ["distribution"] });
            queryClient.invalidateQueries({ queryKey: ["userRanking"] });
        };

        const channelName = `dash-${Date.now()}`;
        let channel = supabase.channel(channelName);

        channel
            .on(
                "postgres_changes",
                { event: "INSERT", schema: "public", table: "interactions_log" },
                (payload) => {
                    console.log("⚡ [REALTIME] Nuevo INSERT:", payload?.new?.id);
                    invalidateAll();
                }
            )
            .subscribe();

        return () => {
            supabase.removeChannel(channel);
        };
    }, [queryClient]);

    const totalDist = distribution.reduce((s, d) => s + d.value, 0);
    const changePct = stats?.changePct ?? 0;

    return (
        <div className={`${agentType !== "comercial" ? "space-y-6" : "space-y-8"} animate-in fade-in slide-in-from-bottom-4 duration-700`}>

            {/* -- Conmutador de bot (compacto, arriba) -- */}
            <div className="flex bg-card/60 backdrop-blur-xl border border-border/80 rounded-2xl p-1.5 gap-1 shadow-sm w-full sm:w-fit">
                {[
                    { id: "comercial", label: "Bot Comercial" },
                    { id: "oskitar", label: "Oskitar" },
                    { id: "betty", label: "Betty" },
                ].map(({ id, label }) => (
                    <button
                        key={id}
                        onClick={() => setAgentType(id)}
                        className={`flex-1 sm:flex-none px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-2 ${
                            agentType === id
                                ? "bg-primary text-primary-foreground shadow-sm"
                                : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
                        }`}
                    >
                        <BotAvatar bot={id} size={20} className={agentType === id ? "ring-primary-foreground/40" : ""} />
                        <span>{label}</span>
                    </button>
                ))}
            </div>

            {/* -------------- VISTA OSKITAR / BETTY (chatbot-analytics, nativo) -------------- */}
            {(agentType === "oskitar" || agentType === "betty") && (
                <ChatbotAnalyticsPanel bot={agentType} />
            )}

            {/* -------------- VISTA BOT COMERCIAL (Métricas & Logs) -------------- */}
            {agentType === "comercial" && (
                <>
                    {/* Encabezado de módulo + selector de periodo */}
                    <PageHeader
                        icon={<BotAvatar bot="comercial" size={44} />}
                        title="Bot Comercial — Ventas & Atención"
                        subtitle="WhatsApp y Telegram · datos de Supabase"
                        actions={<PeriodSelect value={timeRange} onChange={setTimeRange} />}
                    />

                    <BotSummary>{summarizeComercial(stats, timeRange)}</BotSummary>


            {/* -- KPI Grid -- */}
            <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
                <KpiCard
                    title="Total interacciones"
                    value={stats?.messagesTotal ?? 0}
                    badge={changePct >= 0 ? `+${changePct}%` : `${changePct}%`}
                    badgeColor={changePct >= 0 ? "text-green-400" : "text-red-400"}
                    icon={<MessageSquare className="w-5 h-5" />}
                    accent="from-blue-500/20 to-blue-600/5"
                    iconColor="text-blue-400"
                />
                <KpiCard
                    title="WhatsApp"
                    value={stats?.waTotal ?? 0}
                    badge="Canal activo"
                    badgeColor="text-emerald-400"
                    icon={<WhatsAppIcon size={20} />}
                    accent="from-emerald-500/20 to-emerald-600/5"
                    iconColor=""
                    noIconWrapper
                />
                <KpiCard
                    title="Telegram"
                    value={stats?.tgTotal ?? 0}
                    badge="Canal activo"
                    badgeColor="text-sky-400"
                    icon={<TelegramIcon size={20} />}
                    accent="from-sky-500/20 to-sky-600/5"
                    iconColor=""
                    noIconWrapper
                />
                <KpiCard
                    title="Usuarios únicos"
                    value={stats?.uniqueUsers ?? 0}
                    badge="en el periodo"
                    badgeColor="text-muted-foreground"
                    icon={<Users className="w-5 h-5" />}
                    accent="from-violet-500/20 to-violet-600/5"
                    iconColor="text-violet-400"
                />
                <KpiCard
                    title="Tasa de respuesta"
                    value={stats?.responseRate ?? "-"}
                    badge="del bot"
                    badgeColor="text-muted-foreground"
                    icon={<Zap className="w-5 h-5" />}
                    accent="from-amber-500/20 to-amber-600/5"
                    iconColor="text-amber-400"
                />
                <KpiCard
                    title="Nuevos contactos"
                    value={stats?.newLeads ?? 0}
                    badge="en el periodo"
                    badgeColor="text-muted-foreground"
                    icon={<TrendingUp className="w-5 h-5" />}
                    accent="from-pink-500/20 to-pink-600/5"
                    iconColor="text-pink-400"
                />
            </div>

            {/* -- Charts Row -- */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

                {/* Área chart 7 días */}
                <div className="lg:col-span-2 bg-card/40 backdrop-blur-sm border border-border rounded-xl p-6">
                    <div className="flex items-center justify-between mb-6">
                        <h3 className="text-base font-semibold flex items-center gap-2">
                            <Activity className="w-4 h-4 text-primary" />
                            Actividad - {timeRange === '24h' ? 'últimas 24 horas' : timeRange === '7d' ? 'últimos 7 días' : timeRange === '1m' ? 'último mes' : 'último año'}
                        </h3>
                        <div className="flex items-center gap-4 text-xs text-muted-foreground">
                            <span className="flex items-center gap-1.5">
                                <span className="w-2.5 h-2.5 rounded-full bg-[#25D366]" /> WhatsApp
                            </span>
                            <span className="flex items-center gap-1.5">
                                <span className="w-2.5 h-2.5 rounded-full bg-[#2AABEE]" /> Telegram
                            </span>
                        </div>
                    </div>
                    <ResponsiveContainer width="100%" height={220}>
                        <AreaChart data={activity} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
                            <defs>
                                <linearGradient id="gWa" x1="0" y1="0" x2="0" y2="1">
                                    <stop offset="5%" stopColor="#25D366" stopOpacity={0.35} />
                                    <stop offset="95%" stopColor="#25D366" stopOpacity={0} />
                                </linearGradient>
                                <linearGradient id="gTg" x1="0" y1="0" x2="0" y2="1">
                                    <stop offset="5%" stopColor="#2AABEE" stopOpacity={0.35} />
                                    <stop offset="95%" stopColor="#2AABEE" stopOpacity={0} />
                                </linearGradient>
                            </defs>
                            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                            <XAxis dataKey="date" tick={{ fontSize: 11, fill: "#888" }} tickLine={false} axisLine={false} />
                            <YAxis tick={{ fontSize: 11, fill: "#888" }} tickLine={false} axisLine={false} allowDecimals={false} />
                            <Tooltip content={<CustomTooltip />} />
                            <Area type="monotone" dataKey="WhatsApp" stroke="#25D366" strokeWidth={2} fill="url(#gWa)" dot={false} activeDot={{ r: 4 }} />
                            <Area type="monotone" dataKey="Telegram" stroke="#2AABEE" strokeWidth={2} fill="url(#gTg)" dot={false} activeDot={{ r: 4 }} />
                        </AreaChart>
                    </ResponsiveContainer>
                </div>

                {/* Donut distribución - SVG custom premium */}
                <div className="bg-card/40 backdrop-blur-sm border border-border rounded-xl p-6 flex flex-col">
                    <h3 className="text-base font-semibold mb-4 flex items-center gap-2">
                        <GitMerge className="w-4 h-4 text-primary" />
                        Distribución por canal
                    </h3>
                    <div className="flex-1 flex flex-col items-center justify-center gap-5">
                        <ChannelDonut distribution={distribution} total={totalDist} />
                        <div className="w-full space-y-3">
                            {distribution.map((d) => (
                                <div key={d.name} className="flex items-center gap-3">
                                    <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: d.color, boxShadow: `0 0 7px ${d.color}99` }} />
                                    <span className="text-sm text-muted-foreground flex-1">{d.name}</span>
                                    <span className="text-sm font-bold">{d.value.toLocaleString()}</span>
                                    <span className="text-xs text-muted-foreground w-10 text-right">{d.pct}%</span>
                                </div>
                            ))}
                            {distribution.length === 0 && (
                                <p className="text-center text-xs text-muted-foreground">Sin interacciones aún</p>
                            )}
                        </div>
                    </div>
                </div>
            </div>

            {/* -- Ranking de Usuarios & Zonas Escaneadas -- */}
            <RankingSection ranking={userRanking} />

            {/* -- Live Feed -- */}
            <div className="bg-card/40 backdrop-blur-sm border border-border rounded-xl p-6">
                <h3 className="text-base font-semibold mb-4 flex items-center gap-2">
                    <Activity className="w-4 h-4 text-primary animate-pulse" />
                    Monitor de Actividad
                    <span className="ml-auto text-xs font-normal text-muted-foreground bg-muted px-2 py-0.5 rounded-full">
                        Tiempo Real ⚡
                    </span>
                </h3>

                <div className="space-y-2 max-h-[480px] overflow-y-auto pr-1 scrollbar-hide">
                    {feed.map((item) => (
                        <FeedItem key={item.id} item={item} />
                    ))}
                    {feed.length === 0 && (
                        <div className="text-center py-12 text-muted-foreground text-sm">
                            Esperando actividad... 📡
                        </div>
                    )}
                </div>
            </div>
        </>
    )}
</div>
    );
}

// --- Feed Item -------------------------------------------------------
function FeedItem({ item }) {
    const isOut = item.direction === "OUTGOING";
    const isWA = item.channel === "whatsapp";

    return (
        <div className={`flex items-start gap-3 p-3 rounded-lg border border-transparent hover:border-border/40 transition-all ${isOut ? "bg-primary/5 ml-10" : "bg-muted/20 mr-10"}`}>
            {/* Avatar */}
            <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm shrink-0 ${isOut ? "bg-primary/20" : "bg-muted/50"}`}>
                {isOut ? "🤖" : "👤"}
            </div>

            <div className="flex-1 min-w-0">
                {/* Header */}
                <div className="flex items-center gap-2 mb-0.5">
                    {/* Canal icon */}
                    <span className="shrink-0">
                        {isWA ? <WhatsAppIcon size={13} /> : <TelegramIcon size={13} />}
                    </span>
                    <span className="font-medium text-sm truncate text-foreground/90">
                        {isOut ? "Bot Comercial" : (item.user || "Usuario")}
                    </span>
                    <span className="ml-auto text-[10px] text-muted-foreground whitespace-nowrap">
                        {formatDistanceToNow(new Date(item.time), { addSuffix: true, locale: es })}
                    </span>
                </div>

                {/* Content */}
                <p className="text-sm text-muted-foreground break-words leading-relaxed">
                    {item.content || <span className="italic opacity-60">[{item.type}]</span>}
                </p>

                {/* Type badge */}
                {item.type && item.type !== "text" && (
                    <span className="inline-block mt-1 text-[10px] uppercase tracking-wider font-semibold text-primary/60 bg-primary/5 px-1.5 py-0.5 rounded">
                        {item.type}
                    </span>
                )}
            </div>
        </div>
    );
}

// --- KPI Card --------------------------------------------------------
// --- Channel Donut - SVG Premium -------------------------------------
function ChannelDonut({ distribution = [], total = 0 }) {
    const size = 180;
    const cx = size / 2;
    const cy = size / 2;

    // Outer ring = WhatsApp, Inner ring = Telegram
    const rings = [
        { r: 72, strokeW: 12, key: "WhatsApp", color: "#25D366", glow: "#25D366" },
        { r: 52, strokeW: 12, key: "Telegram", color: "#2AABEE", glow: "#2AABEE" },
    ];

    // circumference = 2πr
    const getPct = (key) => {
        const item = distribution.find(d => d.name === key);
        return item ? item.pct / 100 : 0;
    };

    // Convert polar to cartesian for the glowing end-dot
    const polarToXY = (r, angleDeg) => {
        const rad = (angleDeg - 90) * (Math.PI / 180);
        return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) };
    };

    return (
        <div className="relative" style={{ width: size, height: size }}>
            <svg width={size} height={size} style={{ overflow: "visible" }}>
                <defs>
                    {rings.map(ring => (
                        <filter key={`f-${ring.key}`} id={`glow-${ring.key}`} x="-50%" y="-50%" width="200%" height="200%">
                            <feGaussianBlur stdDeviation="4" result="blur" />
                            <feMerge>
                                <feMergeNode in="blur" />
                                <feMergeNode in="SourceGraphic" />
                            </feMerge>
                        </filter>
                    ))}
                </defs>

                {rings.map((ring) => {
                    const circ = 2 * Math.PI * ring.r;
                    const pct = getPct(ring.key);
                    const dash = pct * circ;
                    const gap = circ - dash;
                    const endAngle = pct * 360;
                    const dot = polarToXY(ring.r, endAngle);

                    return (
                        <g key={ring.key}>
                            {/* Track (fondo oscuro) */}
                            <circle
                                cx={cx} cy={cy} r={ring.r}
                                fill="none"
                                stroke="rgba(255,255,255,0.06)"
                                strokeWidth={ring.strokeW}
                            />
                            {/* Arco del progreso */}
                            <circle
                                cx={cx} cy={cy} r={ring.r}
                                fill="none"
                                stroke={ring.color}
                                strokeWidth={ring.strokeW}
                                strokeLinecap="round"
                                strokeDasharray={`${dash} ${gap}`}
                                strokeDashoffset={0}
                                transform={`rotate(-90 ${cx} ${cy})`}
                                style={{
                                    transition: "stroke-dasharray 1s cubic-bezier(0.25,0.46,0.45,0.94)",
                                    opacity: pct > 0 ? 1 : 0,
                                }}
                            />
                            {/* Punto brillante al final del arco */}
                            {pct > 0.01 && (
                                <circle
                                    cx={dot.x} cy={dot.y} r={ring.strokeW / 2}
                                    fill={ring.color}
                                    filter={`url(#glow-${ring.key})`}
                                    style={{ transition: "all 1s cubic-bezier(0.25,0.46,0.45,0.94)" }}
                                />
                            )}
                        </g>
                    );
                })}

                {/* Total centrado */}
                {total > 0 && (
                    <>
                        <text x={cx} y={cy - 6} textAnchor="middle" className="fill-foreground" style={{ fontSize: 24, fontWeight: 700, fontFamily: "inherit" }}>
                            {total.toLocaleString()}
                        </text>
                        <text x={cx} y={cy + 14} textAnchor="middle" className="fill-muted-foreground" style={{ fontSize: 11, fontFamily: "inherit" }}>
                            hoy
                        </text>
                    </>
                )}
                {total === 0 && (
                    <text x={cx} y={cy + 5} textAnchor="middle" className="fill-muted-foreground" style={{ fontSize: 12, fontFamily: "inherit" }}>
                        Sin datos
                    </text>
                )}
            </svg>
        </div>
    );
}

// --- Ranking Section (Personas, Días de interacción & Zonas escaneadas) ----
const RANKING_PAGE_SIZE = 15;

const SortIcon = ({ active, dir }) => (
    <span className={active ? "text-primary" : "opacity-30"}>
        {active && dir === "asc" ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
    </span>
);

// Metadatos de podio: un solo lenguaje de color por posición (oro / plata / bronce).
const RANK_META = {
    1: { icon: Crown, label: "1er lugar", bar: "bg-gradient-to-r from-amber-400 to-yellow-300", pill: "bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-500/25", avatar: "bg-gradient-to-tr from-amber-500 to-yellow-400 text-black" },
    2: { icon: Medal, label: "2º lugar", bar: "bg-gradient-to-r from-slate-300 to-slate-400", pill: "bg-slate-400/15 text-slate-600 dark:text-slate-200 border-slate-400/25", avatar: "bg-gradient-to-tr from-slate-300 to-slate-400 text-black" },
    3: { icon: Award, label: "3er lugar", bar: "bg-gradient-to-r from-orange-500 to-amber-600", pill: "bg-orange-500/15 text-orange-700 dark:text-orange-300 border-orange-500/25", avatar: "bg-gradient-to-tr from-orange-500 to-amber-600 text-white" },
};

const ChannelMark = ({ channel, size = 14 }) => channel === "telegram" ? <TelegramIcon size={size} /> : <WhatsAppIcon size={size} />;

// Resumen de zonas en una línea: "Candelaria · Occidente · +2". El detalle completo va en title.
function ZoneSummary({ zones = [], max = 3, className = "" }) {
    if (!zones.length) return <span className={`text-xs text-muted-foreground/70 ${className}`}>—</span>;
    const shown = zones.slice(0, max).map(z => z.name).join(" · ");
    const rest = zones.length - max;
    const full = zones.map(z => `${z.code} · ${z.name} (${z.count}x)`).join("\n");
    return (
        <span className={`text-xs text-foreground/80 ${className}`} title={full}>
            {shown}{rest > 0 && <span className="text-muted-foreground"> · +{rest}</span>}
        </span>
    );
}

function PodiumCard({ item }) {
    const meta = RANK_META[item.rank] || RANK_META[3];
    const Icon = meta.icon;
    return (
        <div className="flex h-full flex-col overflow-hidden rounded-2xl border border-border/80 bg-card/60 shadow-sm backdrop-blur-xl">
            <div className={`h-1 ${meta.bar}`} />
            <div className="flex flex-1 flex-col gap-4 p-5">
                <div className="flex items-center justify-between">
                    <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[10px] font-black uppercase tracking-wider ${meta.pill}`}>
                        <Icon size={13} /> {meta.label}
                    </span>
                    <span className="text-2xl font-black text-muted-foreground/30">#{item.rank}</span>
                </div>

                <div className="flex items-center gap-3">
                    <div className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl text-sm font-black shadow-inner ${meta.avatar}`}>
                        {item.avatar}
                    </div>
                    <div className="min-w-0">
                        <p className="flex items-center gap-1.5 truncate text-sm font-black text-foreground">
                            {item.user} <ChannelMark channel={item.channel} />
                        </p>
                        <p className="truncate text-xs text-muted-foreground">{item.phone}</p>
                    </div>
                </div>

                <div className="grid grid-cols-2 gap-2">
                    <div className="rounded-xl border border-border/60 bg-muted/40 p-2.5">
                        <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Interacciones</p>
                        <p className="mt-0.5 text-lg font-black tracking-tight text-foreground">{item.totalCount}</p>
                    </div>
                    <div className="rounded-xl border border-border/60 bg-muted/40 p-2.5">
                        <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Día pico</p>
                        <p className="mt-0.5 text-xs font-bold leading-tight text-foreground">{item.topDay}</p>
                    </div>
                </div>

                <div className="mt-auto">
                    <p className="mb-1.5 flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                        <MapPin size={12} /> Zonas más consultadas
                    </p>
                    <ZoneSummary zones={item.scannedZones} className="leading-relaxed" />
                </div>
            </div>
        </div>
    );
}

function RankingSection({ ranking = [] }) {
    const [search, setSearch] = useState("");
    const [expandedUser, setExpandedUser] = useState(null);
    const [page, setPage] = useState(1);
    const [channelFilter, setChannelFilter] = useState("all"); // all | whatsapp | telegram
    const [sort, setSort] = useState({ key: "rank", dir: "asc" }); // key: rank | totalCount
    const [ficha, setFicha] = useState(null); // { providerId, name } — ficha de contacto (spec 0005 T4)

    const filtered = ranking.filter(item => {
        if (channelFilter !== "all" && item.channel !== channelFilter) return false;
        const q = search.toLowerCase();
        if (!q) return true;
        const matchesUser = item.user.toLowerCase().includes(q) || item.phone.toLowerCase().includes(q);
        const matchesZone = item.scannedZones?.some(z => z.name.toLowerCase().includes(q) || z.code.toLowerCase().includes(q));
        const matchesDay = item.topDay.toLowerCase().includes(q);
        return matchesUser || matchesZone || matchesDay;
    });

    const sorted = [...filtered].sort((a, b) => {
        const res = sort.key === "totalCount" ? a.totalCount - b.totalCount : a.rank - b.rank;
        return sort.dir === "asc" ? res : -res;
    });

    const toggleSort = (key) => {
        setSort(s => s.key === key
            ? { key, dir: s.dir === "asc" ? "desc" : "asc" }
            : { key, dir: key === "totalCount" ? "desc" : "asc" });
        setPage(1);
    };

    const changeChannel = (ch) => { setChannelFilter(ch); setPage(1); };

    const exportCSV = () => {
        const headers = ["Posicion", "Persona", "Contacto", "Canal", "Total Mensajes", "Dia con mas actividad", "Zonas escaneadas", "Ultima actividad"];
        const esc = (v) => {
            const s = String(v ?? "");
            return /[",\n\r;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
        };
        const lines = sorted.map(i => [
            i.rank, i.user, i.phone, i.channel, i.totalCount, i.topDay,
            (i.scannedZones || []).map(z => `${z.code} ${z.name} (${z.count}x)`).join(" | "),
            i.lastSeen,
        ].map(esc).join(","));
        const BOM = String.fromCharCode(0xFEFF); // Excel detecta UTF-8 (acentos correctos)
        const csv = BOM + [headers.join(","), ...lines].join("\r\n");
        const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `ranking-agentes-${new Date().toISOString().slice(0, 10)}.csv`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    };

    // Paginación de la tabla completa
    const totalPages = Math.max(1, Math.ceil(sorted.length / RANKING_PAGE_SIZE));
    const currentPage = Math.min(page, totalPages);
    const paginated = sorted.slice((currentPage - 1) * RANKING_PAGE_SIZE, currentPage * RANKING_PAGE_SIZE);

    const top1 = ranking[0];
    const top2 = ranking[1];
    const top3 = ranking[2];

    // Badge de posición para la tabla: medalla en el podio, neutro del 4 en adelante.
    const rankBadge = (rank) => RANK_META[rank]
        ? `${RANK_META[rank].pill} border`
        : "bg-muted/70 text-muted-foreground border border-border";

    // Top 5 para el board premium (spec 0006)
    const topRows = ranking.slice(0, 5).map((it) => ({
        key: it.phone,
        rank: it.rank,
        name: it.user,
        sublabel: it.phone,
        value: it.totalCount,
        valueLabel: "interacciones",
        channelIcon: <ChannelMark channel={it.channel} size={13} />,
        badge: it.topDay && it.topDay !== "Sin datos" ? null : null,
    }));

    return (
        <div className="space-y-6 my-8">
            {/* Board premium Top 5 */}
            <TopUsersBoard
                title="Ranking de usuarios — Top 5"
                subtitle="Bot Comercial · por frecuencia de interacción en el periodo"
                icon={<span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-gradient-to-tr from-amber-500 to-yellow-500 text-black shadow-inner"><Trophy size={20} /></span>}
                rows={topRows}
                onRowClick={(r) => setFicha({ providerId: r.key, name: r.name })}
                emptyText="Sin interacciones registradas en el periodo."
            />

            {/* Tabla completa (plegada por defecto): podio Top 3 + tabla numerada + búsqueda/filtro/CSV */}
            <details className="group overflow-hidden rounded-2xl border border-border/80 bg-card/60 shadow-sm backdrop-blur-xl">
                <summary className="flex cursor-pointer select-none list-none items-center justify-between p-4 text-sm font-bold text-foreground transition-colors hover:bg-muted/40">
                    <span className="flex items-center gap-2">
                        <Users size={16} className="text-primary" /> Ver tabla completa &amp; zonas escaneadas ({filtered.length} usuarios)
                    </span>
                    <ChevronDown size={16} className="text-muted-foreground transition-transform group-open:rotate-180" />
                </summary>

                <div className="space-y-6 border-t border-border/80 p-4">
                    {/* Buscador */}
                    <div className="relative w-full md:w-72">
                        <Search className="absolute left-3.5 top-2.5 text-muted-foreground" size={15} />
                        <input
                            type="text"
                            value={search}
                            onChange={(e) => { setSearch(e.target.value); setPage(1); }}
                            placeholder="Buscar por persona, día o zona..."
                            className="w-full bg-background border border-border rounded-xl pl-9 pr-4 py-2 text-xs text-foreground placeholder:text-muted-foreground outline-none focus:border-primary/50 focus:ring-1 focus:ring-primary/50 transition-all"
                        />
                    </div>

                    {/* Podio Top 3 */}
                    <div className="grid grid-cols-1 items-stretch gap-4 md:grid-cols-3">
                        {top1 && <PodiumCard item={top1} />}
                        {top2 && <PodiumCard item={top2} />}
                        {top3 && <PodiumCard item={top3} />}
                    </div>

                    {/* Tabla General Numerada (#1 al #N) */}
                    <div className="bg-card/60 backdrop-blur-xl border border-border/80 rounded-2xl overflow-hidden shadow-sm">
                <div className="p-4 border-b border-border/80 bg-muted/40 flex flex-col lg:flex-row lg:items-center justify-between gap-3">
                    <h4 className="font-bold text-sm text-foreground flex items-center gap-2">
                        <Users size={16} className="text-primary" />
                        Tabla Completa de Posiciones & Desglose ({filtered.length} usuarios)
                    </h4>
                    <div className="flex flex-wrap items-center gap-2">
                        {/* Filtro por canal */}
                        <div className="flex bg-background border border-border rounded-xl p-1 gap-1">
                            {[
                                { id: "all", label: "Todos", icon: null },
                                { id: "whatsapp", label: "WhatsApp", icon: <WhatsAppIcon size={12} /> },
                                { id: "telegram", label: "Telegram", icon: <TelegramIcon size={12} /> },
                            ].map(ch => (
                                <button
                                    key={ch.id}
                                    type="button"
                                    onClick={() => changeChannel(ch.id)}
                                    className={`px-3 py-1.5 rounded-lg text-[11px] font-bold transition-all flex items-center gap-1.5 ${
                                        channelFilter === ch.id
                                            ? "bg-primary text-primary-foreground shadow-sm"
                                            : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
                                    }`}
                                >
                                    {ch.icon}
                                    <span>{ch.label}</span>
                                </button>
                            ))}
                        </div>
                        {/* Exportar CSV */}
                        <button
                            type="button"
                            onClick={exportCSV}
                            disabled={sorted.length === 0}
                            className="px-3 py-1.5 rounded-lg border border-border bg-card text-[11px] font-bold text-foreground hover:border-primary/40 hover:bg-muted/60 transition-all disabled:opacity-40 disabled:pointer-events-none flex items-center gap-1.5"
                        >
                            <Download size={13} /> Exportar CSV
                        </button>
                    </div>
                </div>

                <div className="overflow-x-auto">
                    <table className="w-full min-w-[720px] text-left text-xs">
                        <thead>
                            <tr className="border-b border-border/80 bg-muted/40 text-[10px] font-extrabold uppercase tracking-wider text-muted-foreground">
                                <th className="w-14 py-3 pl-4 pr-2">
                                    <button type="button" onClick={() => toggleSort("rank")} className="inline-flex items-center gap-1 uppercase tracking-wider transition-colors hover:text-foreground">
                                        # <SortIcon active={sort.key === "rank"} dir={sort.dir} />
                                    </button>
                                </th>
                                <th className="px-3 py-3">Persona</th>
                                <th className="hidden px-3 py-3 md:table-cell">Día pico</th>
                                <th className="hidden px-3 py-3 lg:table-cell">Zonas consultadas</th>
                                <th className="px-3 py-3 text-center">
                                    <button type="button" onClick={() => toggleSort("totalCount")} className="inline-flex items-center gap-1 uppercase tracking-wider transition-colors hover:text-foreground">
                                        Total <SortIcon active={sort.key === "totalCount"} dir={sort.dir} />
                                    </button>
                                </th>
                                <th className="hidden px-3 py-3 text-right sm:table-cell">Últ. actividad</th>
                                <th className="w-24 py-3 pr-4" />
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-border/40">
                            {paginated.map((item) => {
                                const isExpanded = expandedUser === item.rank;
                                return (
                                    <React.Fragment key={item.rank}>
                                        <tr
                                            onClick={() => setExpandedUser(isExpanded ? null : item.rank)}
                                            className="cursor-pointer transition-colors hover:bg-muted/40"
                                        >
                                            <td className="py-3 pl-4 pr-2">
                                                <span className={`inline-flex h-6 min-w-[1.75rem] items-center justify-center rounded-lg px-1.5 text-[11px] font-black ${rankBadge(item.rank)}`}>
                                                    {item.rank}
                                                </span>
                                            </td>
                                            <td className="px-3 py-3">
                                                <div className="flex items-center gap-2.5">
                                                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl border border-primary/20 bg-primary/10 text-xs font-bold text-primary">
                                                        {item.avatar}
                                                    </div>
                                                    <div className="min-w-0">
                                                        <p className="flex items-center gap-1.5 truncate text-sm font-bold text-foreground">
                                                            {item.user} <ChannelMark channel={item.channel} size={13} />
                                                        </p>
                                                        <p className="truncate text-[10px] text-muted-foreground">{item.phone}</p>
                                                    </div>
                                                </div>
                                            </td>
                                            <td className="hidden px-3 py-3 text-xs text-foreground/80 md:table-cell">{item.topDay}</td>
                                            <td className="hidden max-w-[320px] px-3 py-3 lg:table-cell">
                                                <ZoneSummary zones={item.scannedZones} />
                                            </td>
                                            <td className="px-3 py-3 text-center">
                                                <span className="text-base font-black tracking-tight text-foreground">{item.totalCount}</span>
                                            </td>
                                            <td className="hidden px-3 py-3 text-right text-[11px] font-medium text-muted-foreground sm:table-cell">
                                                {item.lastSeen}
                                            </td>
                                            <td className="py-3 pr-4 text-right text-muted-foreground">
                                                <div className="flex items-center justify-end gap-1.5">
                                                    <button
                                                        type="button"
                                                        onClick={(e) => { e.stopPropagation(); setFicha({ providerId: item.phone, name: item.user }); }}
                                                        className="rounded-md border border-border/70 bg-card px-2 py-1 text-[10px] font-bold text-foreground/80 transition-colors hover:bg-muted"
                                                    >
                                                        Ficha
                                                    </button>
                                                    <ChevronDown size={15} className={`inline transition-transform ${isExpanded ? "rotate-180" : ""}`} />
                                                </div>
                                            </td>
                                        </tr>

                                        {isExpanded && (
                                            <tr className="bg-muted/30">
                                                <td colSpan={7} className="px-4 py-4">
                                                    <div className="grid gap-4 lg:grid-cols-[1fr_1.4fr]">
                                                        <div>
                                                            <p className="mb-2 flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                                                                <Calendar size={13} /> Interacciones por día
                                                            </p>
                                                            <div className="grid grid-cols-4 gap-1.5 sm:grid-cols-7">
                                                                {item.dayBreakdown?.map((d, idx) => (
                                                                    <div key={idx} className="rounded-lg border border-border/60 bg-card p-2 text-center">
                                                                        <span className="block text-[9px] font-bold uppercase text-muted-foreground">{d.day}</span>
                                                                        <span className="mt-0.5 block text-sm font-black text-foreground">{d.count}</span>
                                                                    </div>
                                                                ))}
                                                            </div>
                                                        </div>
                                                        <div>
                                                            <p className="mb-2 flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                                                                <MapPin size={13} /> Zonas / puntos consultados
                                                            </p>
                                                            <div className="flex flex-wrap gap-1.5">
                                                                {(item.scannedZones || []).map((z, idx) => (
                                                                    <span key={idx} className="inline-flex items-center gap-1.5 rounded-lg border border-border/70 bg-card px-2 py-1 text-[11px]">
                                                                        <span className="font-bold text-muted-foreground">{z.code}</span>
                                                                        <span className="text-foreground/80">{z.name}</span>
                                                                        <span className="rounded bg-muted px-1 text-[10px] font-bold text-muted-foreground">{z.count}x</span>
                                                                    </span>
                                                                ))}
                                                            </div>
                                                        </div>
                                                    </div>
                                                </td>
                                            </tr>
                                        )}
                                    </React.Fragment>
                                );
                            })}

                            {filtered.length === 0 && (
                                <tr>
                                    <td colSpan={7} className="py-10 text-center text-xs text-muted-foreground">
                                        No se encontraron usuarios o zonas con los filtros actuales{search ? ` ("${search}")` : ""}.
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>

                {/* Paginación */}
                {filtered.length > RANKING_PAGE_SIZE && (
                    <div className="p-4 border-t border-border/80 bg-muted/40 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs">
                        <span className="text-muted-foreground font-medium">
                            Mostrando{" "}
                            <strong className="text-foreground">{(currentPage - 1) * RANKING_PAGE_SIZE + 1}</strong>
                            {"–"}
                            <strong className="text-foreground">{Math.min(currentPage * RANKING_PAGE_SIZE, filtered.length)}</strong>
                            {" "}de <strong className="text-foreground">{filtered.length}</strong> usuarios
                        </span>
                        <div className="flex items-center gap-1.5">
                            <button
                                type="button"
                                onClick={() => setPage((p) => Math.max(1, p - 1))}
                                disabled={currentPage <= 1}
                                className="px-3 py-1.5 rounded-lg border border-border bg-card font-bold text-foreground hover:border-primary/40 hover:bg-muted/60 transition-all disabled:opacity-40 disabled:pointer-events-none flex items-center gap-1"
                            >
                                <ChevronLeft size={13} /> Anterior
                            </button>
                            <span className="px-3 py-1.5 rounded-lg bg-primary/10 border border-primary/20 text-primary font-black">
                                {currentPage} / {totalPages}
                            </span>
                            <button
                                type="button"
                                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                                disabled={currentPage >= totalPages}
                                className="px-3 py-1.5 rounded-lg border border-border bg-card font-bold text-foreground hover:border-primary/40 hover:bg-muted/60 transition-all disabled:opacity-40 disabled:pointer-events-none flex items-center gap-1"
                            >
                                Siguiente <ChevronRight size={13} />
                            </button>
                        </div>
                    </div>
                )}
                    </div>
                </div>
            </details>

            <ContactDrawer open={!!ficha} bot="comercial" target={ficha} onClose={() => setFicha(null)} />
        </div>
    );
}

