import { useEffect, useState } from "react";
import { Activity, MessageSquare, Users, Zap, GitMerge, TrendingUp, ShieldCheck } from "lucide-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { crmService } from "@/services/crm.service";
import { supabase } from "@/services/supabase";
import { formatDistanceToNow } from "date-fns";
import { es } from "date-fns/locale";
import {
    AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
    PieChart, Pie, Cell, Legend,
} from "recharts";

// ─── Canal Icons (SVG inline, sin dependencias extra) ───────────────
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

// ─── Tooltip personalizado para la gráfica ───────────────────────────
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

// ─── Donut label central ─────────────────────────────────────────────
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

// ════════════════════════════════════════════════════════════════════
//  DASHBOARD PRINCIPAL
// ════════════════════════════════════════════════════════════════════
export default function Dashboard() {
    const queryClient = useQueryClient();
    const [timeRange, setTimeRange] = useState("24h");

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

    const { data: siissHealth } = useQuery({
        queryKey: ["siiss-health"],
        queryFn: () => crmService.getSiissHealth(),
        refetchInterval: 30000,
        staleTime: 0,
    });

    // Realtime subscription v5 — invalida TODOS los datos al recibir un INSERT
    useEffect(() => {
        const invalidateAll = () => {
            queryClient.invalidateQueries({ queryKey: ["feed"] });
            queryClient.invalidateQueries({ queryKey: ["stats"] });
            queryClient.invalidateQueries({ queryKey: ["activity"] });
            queryClient.invalidateQueries({ queryKey: ["distribution"] });
        };

        const channelName = `dash-${Date.now()}`;
        console.log(`📡 [REALTIME] Iniciando suscripción a ${channelName}...`);

        let channel = supabase.channel(channelName);

        channel
            .on(
                "postgres_changes",
                { event: "INSERT", schema: "public", table: "interactions_log" },
                (payload) => {
                    console.log("⚡ [REALTIME] Nuevo INSERT detectado:", payload?.new?.id);
                    invalidateAll();
                }
            )
            .subscribe((status, err) => {
                if (status === "SUBSCRIBED") {
                    console.log(`✅ [REALTIME] Suscrito correctamente a ${channelName}`);
                } else if (status === "CHANNEL_ERROR") {
                    console.error("❌ [REALTIME] Error en canal:", err);
                } else if (status === "CLOSED" || status === "TIMED_OUT") {
                    console.warn(`⚠️ [REALTIME] Canal ${status}.`);
                }
            });

        return () => {
            console.log(`🔌 [REALTIME] Desconectando ${channelName}...`);
            supabase.removeChannel(channel);
        };
    }, [queryClient]);

    const totalDist = distribution.reduce((s, d) => s + d.value, 0);
    const changePct = stats?.changePct ?? 0;

    return (
        <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-700">

            {/* ── Header & Time Range Selector ── */}
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                <h1 className="text-2xl font-bold tracking-tight text-foreground">Visión General</h1>
                <select
                    className="bg-card w-40 text-sm border border-border rounded-md px-3 py-2 outline-none focus:ring-1 focus:ring-primary shadow-sm"
                    value={timeRange}
                    onChange={(e) => setTimeRange(e.target.value)}
                >
                    <option value="24h">Hoy (Últimas 24h)</option>
                    <option value="7d">Últimos 7 días</option>
                    <option value="1m">Último mes</option>
                    <option value="1y">Último año</option>
                </select>
            </div>

            {/* ── KPI Grid ── */}
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
                    value={stats?.responseRate ?? "—"}
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
                <KpiCard
                    title="Cobertura SIISS"
                    value={siissHealth ? `${siissHealth.coverage}%` : "—"}
                    badge={siissHealth?.lastSync
                        ? `Sinc: ${formatDistanceToNow(new Date(siissHealth.lastSync), { addSuffix: true, locale: es })}`
                        : "Sin sincronización"
                    }
                    badgeColor="text-purple-400"
                    icon={<ShieldCheck className="w-5 h-5" />}
                    accent="from-purple-500/20 to-purple-600/5"
                    iconColor="text-purple-400"
                />
            </div>

            {/* ── Charts Row ── */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

                {/* Área chart 7 días */}
                <div className="lg:col-span-2 bg-card/40 backdrop-blur-sm border border-border rounded-xl p-6">
                    <div className="flex items-center justify-between mb-6">
                        <h3 className="text-base font-semibold flex items-center gap-2">
                            <Activity className="w-4 h-4 text-primary" />
                            Actividad — {timeRange === '24h' ? 'últimas 24 horas' : timeRange === '7d' ? 'últimos 7 días' : timeRange === '1m' ? 'último mes' : 'último año'}
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

                {/* Donut distribución — SVG custom premium */}
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

            {/* ── Live Feed ── */}
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
        </div>
    );
}

// ─── Feed Item ───────────────────────────────────────────────────────
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

// ─── KPI Card ────────────────────────────────────────────────────────
function KpiCard({ title, value, badge, badgeColor, icon, accent, iconColor, noIconWrapper }) {
    return (
        <div className={`relative bg-gradient-to-br ${accent} bg-card/60 backdrop-blur-md border border-border/70 p-5 rounded-xl hover:border-border transition-all duration-300 overflow-hidden group`}>
            <div className="flex justify-between items-start gap-2">
                <div className="min-w-0">
                    <p className="text-xs font-medium text-muted-foreground truncate">{title}</p>
                    <h3 className="text-3xl font-bold mt-1 tracking-tight">{value}</h3>
                </div>
                <div className={noIconWrapper ? "shrink-0 mt-0.5" : `p-2 rounded-lg bg-background/40 ${iconColor} shrink-0 group-hover:scale-110 transition-transform`}>
                    {icon}
                </div>
            </div>
            <p className={`text-xs mt-3 font-medium ${badgeColor}`}>{badge}</p>
        </div>
    );
}

// ─── Channel Donut — SVG Premium ─────────────────────────────────────
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
                        <text x={cx} y={cy - 6} textAnchor="middle" fill="white" style={{ fontSize: 24, fontWeight: 700, fontFamily: "inherit" }}>
                            {total.toLocaleString()}
                        </text>
                        <text x={cx} y={cy + 14} textAnchor="middle" fill="#666" style={{ fontSize: 11, fontFamily: "inherit" }}>
                            hoy
                        </text>
                    </>
                )}
                {total === 0 && (
                    <text x={cx} y={cy + 5} textAnchor="middle" fill="#444" style={{ fontSize: 12, fontFamily: "inherit" }}>
                        Sin datos
                    </text>
                )}
            </svg>
        </div>
    );
}
