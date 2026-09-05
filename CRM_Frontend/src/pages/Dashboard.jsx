import React, { useEffect, useState, useRef, useCallback } from "react";
import { Activity, MessageSquare, Users, Zap, GitMerge, TrendingUp, ShieldCheck, Trophy, Crown, Medal, Award, MapPin, Calendar, Search, ChevronDown, ChevronUp, Filter, Sparkles } from "lucide-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { crmService } from "@/services/crm.service";

import { supabase } from "@/services/supabase";
import { useTheme } from "@/components/theme-provider";
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

// --------------------------------------------------------------------
//  DASHBOARD PRINCIPAL
// --------------------------------------------------------------------
// Bot Soporte Técnico - Vista nativa del módulo
function SoporteDashboardPanel({ theme }) {
    const iframeRef = useRef(null);
    const [status, setStatus] = useState("authorizing");
    const [iframeSrc, setIframeSrc] = useState("");
    const [systemTheme, setSystemTheme] = useState(() =>
        window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light"
    );

    const supportBaseUrl = useCallback(() => {
        const configuredUrl = import.meta.env.VITE_SUPPORT_BOT_URL?.trim();
        if (configuredUrl) return configuredUrl.replace(/\/$/, "");
        return `${window.location.protocol}//${window.location.hostname}:3004`;
    }, []);

    useEffect(() => {
        if (theme !== "system") return;
        const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");
        const handleChange = (event) => setSystemTheme(event.matches ? "dark" : "light");
        handleChange(mediaQuery);
        mediaQuery.addEventListener("change", handleChange);
        return () => mediaQuery.removeEventListener("change", handleChange);
    }, [theme]);

    const resolveTheme = useCallback(() => {
        if (theme === "light" || theme === "dark") return theme;
        return systemTheme;
    }, [systemTheme, theme]);

    const syncTheme = useCallback(() => {
        const frameWindow = iframeRef.current?.contentWindow;
        if (!frameWindow) return;
        const targetOrigin = new URL(supportBaseUrl(), window.location.origin).origin;
        frameWindow.postMessage({
            source: "skylab-crm",
            type: "theme",
            theme: resolveTheme(),
        }, targetOrigin);
    }, [resolveTheme, supportBaseUrl]);

    const openDashboard = useCallback(async () => {
        setStatus("authorizing");
        setIframeSrc("");
        try {
            const { data: { session }, error: sessionError } = await supabase.auth.getSession();
            if (sessionError || !session?.access_token) {
                console.error("[SoportePanel] Sin sesión activa del CRM:", sessionError);
                throw new Error("No hay una sesión activa del CRM.");
            }
            const baseUrl = supportBaseUrl();
            console.log("[SoportePanel] Intentando conectar con:", baseUrl);
            const response = await fetch(`${baseUrl}/api/crm-session`, {
                method: "POST",
                headers: { Authorization: `Bearer ${session.access_token}` },
                credentials: "include",
            });
            console.log("[SoportePanel] Respuesta /api/crm-session:", response.status, response.statusText);
            if (!response.ok) {
                const result = await response.json().catch(() => ({}));
                console.error("[SoportePanel] Error en /api/crm-session:", result);
                throw new Error(result.error || `El servicio respondió con estado ${response.status}.`);
            }
            const dashboardResponse = await fetch(`${baseUrl}/api/session`, {
                credentials: "include",
                cache: "no-store",
            });
            console.log("[SoportePanel] Respuesta /api/session:", dashboardResponse.status, dashboardResponse.statusText);
            if (!dashboardResponse.ok) {
                throw new Error("El servicio no pudo conservar la sesión integrada.");
            }
            const params = new URLSearchParams({
                embedded: "true",
                theme: resolveTheme(),
                parentOrigin: window.location.origin,
                t: String(Date.now()),
                bust: String(Math.random()),
            });
            setIframeSrc(`${baseUrl}/dashboard.html?${params.toString()}`);
        } catch (err) {
            console.error("[SoportePanel] No fue posible abrir el dashboard:", err);
            setStatus("error");
        }
    }, [resolveTheme, supportBaseUrl]);

    useEffect(() => {
        openDashboard();
    }, [openDashboard]);

    useEffect(() => {
        const expectedOrigin = new URL(supportBaseUrl(), window.location.origin).origin;
        const handleSupportMessage = (event) => {
            if (
                event.origin !== expectedOrigin ||
                event.source !== iframeRef.current?.contentWindow ||
                event.data?.source !== "skylab-support"
            ) return;
            if (event.data.type === "ready") {
                setStatus("ready");
                syncTheme();
            }
            if (event.data.type === "session-required") openDashboard();
        };
        window.addEventListener("message", handleSupportMessage);
        return () => window.removeEventListener("message", handleSupportMessage);
    }, [openDashboard, supportBaseUrl, syncTheme]);

    useEffect(() => {
        if (status === "ready") syncTheme();
    }, [status, syncTheme]);

    useEffect(() => {
        if (!iframeSrc || status !== "authorizing") return;
        const timeoutId = window.setTimeout(() => setStatus("error"), 20000);
        return () => window.clearTimeout(timeoutId);
    }, [iframeSrc, status]);

    return (
        <div className="w-full h-[calc(100vh-140px)] min-h-[500px] flex flex-col">
            {iframeSrc && (
                <iframe
                    ref={iframeRef}
                    src={iframeSrc}
                    title="Dashboard Bot Soporte Técnico"
                    onLoad={syncTheme}
                    onError={() => setStatus("error")}
                    className={`w-full h-full border-0 transition-opacity duration-300 ${
                        status === "ready" ? "opacity-100" : "opacity-0"
                    }`}
                    loading="eager"
                />
            )}

            {status === "authorizing" && (
                <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 bg-background/90 backdrop-blur-sm">
                    <div className="w-12 h-12 border-4 border-primary/20 border-t-primary rounded-full animate-spin shadow-lg" />
                    <p className="text-muted-foreground text-sm font-semibold tracking-tight">
                        Conectando con el panel de soporte técnico...
                    </p>
                </div>
            )}

            {status === "error" && (
                <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 bg-background/95 backdrop-blur-md p-6 text-center">
                    <ShieldCheck size={52} className="text-rose-500/60" />
                    <p className="text-foreground font-bold text-base">No se pudo conectar al servicio de soporte técnico.</p>
                    <p className="text-muted-foreground text-xs max-w-sm">
                        Asegúrese de que el bot de soporte esté corriendo correctamente en el puerto o contenedor asignado.
                    </p>
                    <button
                        type="button"
                        onClick={openDashboard}
                        className="mt-2 px-6 py-2.5 bg-primary hover:bg-primary/90 text-primary-foreground text-xs font-black uppercase tracking-wider rounded-xl shadow-lg hover:shadow-primary/30 transition-all active:scale-95"
                    >
                        Reintentar Conexión
                    </button>
                </div>
            )}
        </div>
    );
}
export default function Dashboard() {
    const queryClient = useQueryClient();
    const { theme } = useTheme();
    const [timeRange, setTimeRange] = useState("24h");
    const [agentType, setAgentType] = useState("comercial"); // "comercial" | "soporte"

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
        <div className={`${agentType === "soporte" ? "space-y-4" : "space-y-8"} animate-in fade-in slide-in-from-bottom-4 duration-700`}>

            {/* -- Selector de Agentes de IA -- */}
            <div className="bg-card/70 border border-border p-3.5 rounded-3xl flex flex-col md:flex-row items-center justify-between gap-4 shadow-md">
                <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-2xl bg-gradient-to-tr from-blue-600 to-indigo-600 flex items-center justify-center text-white font-black shadow-inner">
                        <Activity size={22} />
                    </div>
                    <div>
                        <h2 className="text-lg font-black tracking-tight text-foreground">Analítica de Agentes IA</h2>
                        <p className="text-xs text-muted-foreground font-medium">Monitoreo y gestión de bots independientes en producción</p>
                    </div>
                </div>

                <div className="flex bg-background border border-border rounded-2xl p-1 gap-1 w-full md:w-auto">
                    <button
                        onClick={() => setAgentType("comercial")}
                        className={`flex-1 md:flex-none px-5 py-2.5 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-2 ${
                            agentType === "comercial"
                                ? "bg-primary text-primary-foreground shadow-md"
                                : "text-muted-foreground hover:text-foreground hover:bg-white/5"
                        }`}
                    >
                        <Zap size={15} />
                        <span>Bot Comercial</span>
                    </button>
                    <button
                        onClick={() => setAgentType("soporte")}
                        className={`flex-1 md:flex-none px-5 py-2.5 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-2 ${
                            agentType === "soporte"
                                ? "bg-primary text-primary-foreground shadow-md"
                                : "text-muted-foreground hover:text-foreground hover:bg-white/5"
                        }`}
                    >
                        <ShieldCheck size={15} />
                        <span>Bot Soporte Técnico</span>
                    </button>
                </div>
            </div>

            {/* -------------- VISTA BOT DE SOPORTE TÉCNICO (ChatBotSoporte) -------------- */}
            {agentType === "soporte" && (
                <div className="-mx-2 sm:-mx-4 -mt-2">
                    {/* KPI Summary Grid para Soporte Técnico */}
                    <div className="px-2 sm:px-4 pt-2">
                        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
                            <div className="bg-card/60 backdrop-blur-xl border border-border/80 p-4 rounded-2xl flex items-center justify-between shadow-sm hover:border-primary/30 transition-all">
                                <div>
                                    <p className="text-[11px] font-extrabold text-muted-foreground uppercase tracking-wider">Atención IA</p>
                                    <h3 className="text-xl sm:text-2xl font-black text-foreground mt-1">94.8%</h3>
                                    <span className="text-[10px] text-emerald-400 font-bold flex items-center gap-1 mt-0.5">
                                        <Zap size={11} /> Automatización activa
                                    </span>
                                </div>
                                <div className="w-10 h-10 sm:w-11 sm:h-11 rounded-xl bg-blue-500/10 border border-blue-500/20 flex items-center justify-center text-primary shrink-0">
                                    <Zap size={20} />
                                </div>
                            </div>

                            <div className="bg-card/60 backdrop-blur-xl border border-border/80 p-4 rounded-2xl flex items-center justify-between shadow-sm hover:border-primary/30 transition-all">
                                <div>
                                    <p className="text-[11px] font-extrabold text-muted-foreground uppercase tracking-wider">Respuesta Promedio</p>
                                    <h3 className="text-xl sm:text-2xl font-black text-foreground mt-1">&lt; 1.8s</h3>
                                    <span className="text-[10px] text-emerald-400 font-bold flex items-center gap-1 mt-0.5">
                                        <Activity size={11} /> Latencia en tiempo real
                                    </span>
                                </div>
                                <div className="w-10 h-10 sm:w-11 sm:h-11 rounded-xl bg-purple-500/10 border border-purple-500/20 flex items-center justify-center text-purple-400 shrink-0">
                                    <Activity size={20} />
                                </div>
                            </div>

                            <div className="bg-card/60 backdrop-blur-xl border border-border/80 p-4 rounded-2xl flex items-center justify-between shadow-sm hover:border-primary/30 transition-all">
                                <div>
                                    <p className="text-[11px] font-extrabold text-muted-foreground uppercase tracking-wider">Disponibilidad</p>
                                    <h3 className="text-xl sm:text-2xl font-black text-foreground mt-1">99.9%</h3>
                                    <span className="text-[10px] text-emerald-400 font-bold flex items-center gap-1 mt-0.5">
                                        <ShieldCheck size={11} /> Servicio en Docker
                                    </span>
                                </div>
                                <div className="w-10 h-10 sm:w-11 sm:h-11 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400 shrink-0">
                                    <ShieldCheck size={20} />
                                </div>
                            </div>

                            <div className="bg-card/60 backdrop-blur-xl border border-border/80 p-4 rounded-2xl flex items-center justify-between shadow-sm hover:border-primary/30 transition-all">
                                <div>
                                    <p className="text-[11px] font-extrabold text-muted-foreground uppercase tracking-wider">Satisfacción CSAT</p>
                                    <h3 className="text-xl sm:text-2xl font-black text-foreground mt-1">98.5%</h3>
                                    <span className="text-[10px] text-emerald-400 font-bold flex items-center gap-1 mt-0.5">
                                        <TrendingUp size={11} /> Evaluación Excelente
                                    </span>
                                </div>
                                <div className="w-10 h-10 sm:w-11 sm:h-11 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-400 shrink-0">
                                    <TrendingUp size={20} />
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Panel Interactivo del Bot Soporte Técnico */}
                    <div className="mt-4">
                        <SoporteDashboardPanel theme={theme} />
                    </div>
                </div>
            )}

            {/* -------------- VISTA BOT COMERCIAL (Métricas & Logs) -------------- */}
            {agentType === "comercial" && (
                <>
                    {/* Header & Time Range Selector */}
                    <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                        <h1 className="text-2xl font-black tracking-tight text-foreground">
                            Rendimiento - Bot Comercial (Ventas & Atención)
                        </h1>
                        <select
                            className="bg-card w-40 text-sm border border-border rounded-md px-3 py-2 outline-none focus:ring-1 focus:ring-primary shadow-sm font-semibold"
                            value={timeRange}
                            onChange={(e) => setTimeRange(e.target.value)}
                        >
                            <option value="24h">Hoy (Últimas 24h)</option>
                            <option value="7d">Últimos 7 días</option>
                            <option value="1m">Último mes</option>
                            <option value="1y">Último año</option>
                        </select>
                    </div>


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
                <KpiCard
                    title="Cobertura SIISS"
                    value={siissHealth ? `${siissHealth.coverage}%` : "-"}
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

// --- Ranking Section (Personas, Días de interacción & Zonas escaneadas) ----
function RankingSection({ ranking = [] }) {
    const [search, setSearch] = useState("");
    const [expandedUser, setExpandedUser] = useState(null);

    const filtered = ranking.filter(item => {
        const q = search.toLowerCase();
        const matchesUser = item.user.toLowerCase().includes(q) || item.phone.toLowerCase().includes(q);
        const matchesZone = item.scannedZones?.some(z => z.name.toLowerCase().includes(q) || z.code.toLowerCase().includes(q));
        const matchesDay = item.topDay.toLowerCase().includes(q);
        return matchesUser || matchesZone || matchesDay;
    });

    const top1 = ranking[0];
    const top2 = ranking[1];
    const top3 = ranking[2];

    const getRankBadgeStyle = (rank) => {
        switch (rank) {
            case 1:
                return "bg-gradient-to-r from-amber-500 to-yellow-400 text-black font-black shadow-[0_0_15px_rgba(245,158,11,0.5)] border-amber-300";
            case 2:
                return "bg-gradient-to-r from-slate-300 to-slate-400 text-black font-black shadow-[0_0_15px_rgba(148,163,184,0.4)] border-slate-200";
            case 3:
                return "bg-gradient-to-r from-amber-700 to-orange-600 text-white font-black shadow-[0_0_15px_rgba(180,83,9,0.4)] border-orange-400";
            default:
                return "bg-muted/80 text-foreground font-bold border-border";
        }
    };

    return (
        <div className="space-y-6 my-8">
            {/* Header del Ranking & Buscador */}
            <div className="bg-card/50 backdrop-blur-md border border-border/80 p-5 rounded-2xl flex flex-col md:flex-row md:items-center justify-between gap-4 shadow-sm">
                <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-2xl bg-gradient-to-tr from-amber-500 to-yellow-500 flex items-center justify-center text-black font-black shadow-inner shrink-0">
                        <Trophy size={22} />
                    </div>
                    <div>
                        <h3 className="text-base font-black tracking-tight text-foreground flex items-center gap-2">
                            Ranking de Usuarios & Zonas Escaneadas
                            <span className="text-[10px] bg-amber-500/10 text-amber-400 border border-amber-500/20 px-2.5 py-0.5 rounded-full font-bold uppercase">
                                Bot Comercial
                            </span>
                        </h3>
                        <p className="text-xs text-muted-foreground font-medium">
                            Conteo numérico de frecuencia de interacción por persona, días de la semana y zonas consultadas
                        </p>
                    </div>
                </div>

                {/* Buscador */}
                <div className="relative w-full md:w-72">
                    <Search className="absolute left-3.5 top-2.5 text-muted-foreground" size={15} />
                    <input
                        type="text"
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        placeholder="Buscar por persona, día o zona..."
                        className="w-full bg-background border border-border rounded-xl pl-9 pr-4 py-2 text-xs text-foreground placeholder:text-muted-foreground outline-none focus:border-primary/50 focus:ring-1 focus:ring-primary/50 transition-all"
                    />
                </div>
            </div>

            {/* Podio Top 3 Showcase */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {/* TOP 1 */}
                {top1 && (
                    <div className="relative bg-gradient-to-b from-amber-500/15 via-card/80 to-card/60 backdrop-blur-xl border border-amber-500/40 p-5 rounded-2xl shadow-lg hover:border-amber-500/60 transition-all group overflow-hidden">
                        <div className="absolute top-0 right-0 w-24 h-24 bg-amber-500/10 rounded-full blur-2xl pointer-events-none" />
                        <div className="flex items-center justify-between mb-3">
                            <div className="flex items-center gap-2">
                                <div className="w-8 h-8 rounded-xl bg-amber-500 text-black font-black flex items-center justify-center text-sm shadow-md">
                                    #1
                                </div>
                                <Crown size={20} className="text-amber-400 animate-bounce" />
                            </div>
                            <span className="text-[10px] font-black uppercase tracking-wider text-amber-400 bg-amber-500/10 px-2.5 py-1 rounded-full border border-amber-500/20">
                                🥇 Líder de Consultas
                            </span>
                        </div>

                        <div className="flex items-center gap-3 mb-4">
                            <div className="w-12 h-12 rounded-2xl bg-gradient-to-tr from-amber-500 to-yellow-300 text-black font-black text-base flex items-center justify-center shadow-lg border-2 border-amber-400 shrink-0">
                                {top1.avatar}
                            </div>
                            <div className="min-w-0">
                                <h4 className="font-extrabold text-base text-foreground truncate">{top1.user}</h4>
                                <p className="text-xs text-muted-foreground truncate">{top1.phone}</p>
                            </div>
                        </div>

                        <div className="space-y-2 bg-background/50 border border-border/50 p-3 rounded-xl mb-3 text-xs">
                            <div className="flex items-center justify-between">
                                <span className="text-muted-foreground font-medium flex items-center gap-1.5">
                                    <MessageSquare size={13} className="text-amber-400" /> Total Interacciones:
                                </span>
                                <strong className="text-amber-400 font-black text-sm">{top1.totalCount} veces</strong>
                            </div>
                            <div className="flex items-center justify-between">
                                <span className="text-muted-foreground font-medium flex items-center gap-1.5">
                                    <Calendar size={13} className="text-amber-400" /> Día con más actividad:
                                </span>
                                <strong className="text-foreground font-bold">{top1.topDay}</strong>
                            </div>
                        </div>

                        <div>
                            <span className="text-[10px] font-extrabold uppercase text-muted-foreground tracking-wider block mb-1.5 flex items-center gap-1">
                                <MapPin size={12} className="text-amber-400" /> Principales Zonas Escaneadas:
                            </span>
                            <div className="flex flex-wrap gap-1.5">
                                {top1.scannedZones?.slice(0, 3).map((z, idx) => (
                                    <span key={idx} className="bg-amber-500/10 text-amber-300 border border-amber-500/20 px-2.5 py-1 rounded-lg text-[11px] font-bold flex items-center gap-1">
                                        <span>📍 {z.name}</span>
                                        <span className="bg-amber-500/20 text-amber-200 px-1.5 py-0.2 rounded text-[10px]">({z.count}x)</span>
                                    </span>
                                ))}
                            </div>
                        </div>
                    </div>
                )}

                {/* TOP 2 */}
                {top2 && (
                    <div className="relative bg-gradient-to-b from-slate-400/15 via-card/80 to-card/60 backdrop-blur-xl border border-slate-400/30 p-5 rounded-2xl shadow-lg hover:border-slate-400/50 transition-all group overflow-hidden">
                        <div className="flex items-center justify-between mb-3">
                            <div className="flex items-center gap-2">
                                <div className="w-8 h-8 rounded-xl bg-slate-300 text-black font-black flex items-center justify-center text-sm shadow-md">
                                    #2
                                </div>
                                <Medal size={20} className="text-slate-300" />
                            </div>
                            <span className="text-[10px] font-black uppercase tracking-wider text-slate-300 bg-slate-400/10 px-2.5 py-1 rounded-full border border-slate-400/20">
                                🥈 2º Posición
                            </span>
                        </div>

                        <div className="flex items-center gap-3 mb-4">
                            <div className="w-12 h-12 rounded-2xl bg-gradient-to-tr from-slate-300 to-slate-100 text-black font-black text-base flex items-center justify-center shadow-lg border-2 border-slate-300 shrink-0">
                                {top2.avatar}
                            </div>
                            <div className="min-w-0">
                                <h4 className="font-extrabold text-base text-foreground truncate">{top2.user}</h4>
                                <p className="text-xs text-muted-foreground truncate">{top2.phone}</p>
                            </div>
                        </div>

                        <div className="space-y-2 bg-background/50 border border-border/50 p-3 rounded-xl mb-3 text-xs">
                            <div className="flex items-center justify-between">
                                <span className="text-muted-foreground font-medium flex items-center gap-1.5">
                                    <MessageSquare size={13} className="text-slate-300" /> Total Interacciones:
                                </span>
                                <strong className="text-slate-200 font-black text-sm">{top2.totalCount} veces</strong>
                            </div>
                            <div className="flex items-center justify-between">
                                <span className="text-muted-foreground font-medium flex items-center gap-1.5">
                                    <Calendar size={13} className="text-slate-300" /> Día con más actividad:
                                </span>
                                <strong className="text-foreground font-bold">{top2.topDay}</strong>
                            </div>
                        </div>

                        <div>
                            <span className="text-[10px] font-extrabold uppercase text-muted-foreground tracking-wider block mb-1.5 flex items-center gap-1">
                                <MapPin size={12} className="text-slate-300" /> Principales Zonas Escaneadas:
                            </span>
                            <div className="flex flex-wrap gap-1.5">
                                {top2.scannedZones?.slice(0, 3).map((z, idx) => (
                                    <span key={idx} className="bg-slate-400/10 text-slate-200 border border-slate-400/20 px-2.5 py-1 rounded-lg text-[11px] font-bold flex items-center gap-1">
                                        <span>📍 {z.name}</span>
                                        <span className="bg-slate-400/20 text-slate-100 px-1.5 py-0.2 rounded text-[10px]">({z.count}x)</span>
                                    </span>
                                ))}
                            </div>
                        </div>
                    </div>
                )}

                {/* TOP 3 */}
                {top3 && (
                    <div className="relative bg-gradient-to-b from-orange-500/15 via-card/80 to-card/60 backdrop-blur-xl border border-orange-500/30 p-5 rounded-2xl shadow-lg hover:border-orange-500/50 transition-all group overflow-hidden">
                        <div className="flex items-center justify-between mb-3">
                            <div className="flex items-center gap-2">
                                <div className="w-8 h-8 rounded-xl bg-orange-600 text-white font-black flex items-center justify-center text-sm shadow-md">
                                    #3
                                </div>
                                <Award size={20} className="text-orange-400" />
                            </div>
                            <span className="text-[10px] font-black uppercase tracking-wider text-orange-400 bg-orange-500/10 px-2.5 py-1 rounded-full border border-orange-500/20">
                                🥉 3º Posición
                            </span>
                        </div>

                        <div className="flex items-center gap-3 mb-4">
                            <div className="w-12 h-12 rounded-2xl bg-gradient-to-tr from-orange-600 to-amber-500 text-white font-black text-base flex items-center justify-center shadow-lg border-2 border-orange-400 shrink-0">
                                {top3.avatar}
                            </div>
                            <div className="min-w-0">
                                <h4 className="font-extrabold text-base text-foreground truncate">{top3.user}</h4>
                                <p className="text-xs text-muted-foreground truncate">{top3.phone}</p>
                            </div>
                        </div>

                        <div className="space-y-2 bg-background/50 border border-border/50 p-3 rounded-xl mb-3 text-xs">
                            <div className="flex items-center justify-between">
                                <span className="text-muted-foreground font-medium flex items-center gap-1.5">
                                    <MessageSquare size={13} className="text-orange-400" /> Total Interacciones:
                                </span>
                                <strong className="text-orange-300 font-black text-sm">{top3.totalCount} veces</strong>
                            </div>
                            <div className="flex items-center justify-between">
                                <span className="text-muted-foreground font-medium flex items-center gap-1.5">
                                    <Calendar size={13} className="text-orange-400" /> Día con más actividad:
                                </span>
                                <strong className="text-foreground font-bold">{top3.topDay}</strong>
                            </div>
                        </div>

                        <div>
                            <span className="text-[10px] font-extrabold uppercase text-muted-foreground tracking-wider block mb-1.5 flex items-center gap-1">
                                <MapPin size={12} className="text-orange-400" /> Principales Zonas Escaneadas:
                            </span>
                            <div className="flex flex-wrap gap-1.5">
                                {top3.scannedZones?.slice(0, 3).map((z, idx) => (
                                    <span key={idx} className="bg-orange-500/10 text-orange-200 border border-orange-500/20 px-2.5 py-1 rounded-lg text-[11px] font-bold flex items-center gap-1">
                                        <span>📍 {z.name}</span>
                                        <span className="bg-orange-500/20 text-orange-100 px-1.5 py-0.2 rounded text-[10px]">({z.count}x)</span>
                                    </span>
                                ))}
                            </div>
                        </div>
                    </div>
                )}
            </div>

            {/* Tabla General Numerada (#1 al #N) */}
            <div className="bg-card/40 backdrop-blur-sm border border-border rounded-2xl overflow-hidden shadow-md">
                <div className="p-4 border-b border-border/80 bg-white/5 flex items-center justify-between">
                    <h4 className="font-bold text-sm text-foreground flex items-center gap-2">
                        <Users size={16} className="text-primary" />
                        Tabla Completa de Posiciones & Desglose ({filtered.length} usuarios)
                    </h4>
                </div>

                <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs border-collapse">
                        <thead>
                            <tr className="border-b border-border/60 bg-white/5 text-muted-foreground font-extrabold uppercase tracking-wider text-[10px]">
                                <th className="py-3.5 px-4 w-16 text-center"># Posición</th>
                                <th className="py-3.5 px-4">Persona / Contacto</th>
                                <th className="py-3.5 px-4">Frecuencia por Día de la Semana</th>
                                <th className="py-3.5 px-4">Zonas / Puntos Escaneados</th>
                                <th className="py-3.5 px-4 text-center">Total Mensajes</th>
                                <th className="py-3.5 px-4 text-right">Última Actividad</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-border/40">
                            {filtered.map((item) => {
                                const isExpanded = expandedUser === item.rank;
                                return (
                                    <React.Fragment key={item.rank}>
                                        <tr
                                            onClick={() => setExpandedUser(isExpanded ? null : item.rank)}
                                            className="hover:bg-white/5 transition-colors cursor-pointer group"
                                        >
                                            <td className="py-3.5 px-4 text-center">
                                                <span className={`inline-flex items-center justify-center w-7 h-7 rounded-xl border text-xs font-black ${getRankBadgeStyle(item.rank)}`}>
                                                    #{item.rank}
                                                </span>
                                            </td>
                                            <td className="py-3.5 px-4">
                                                <div className="flex items-center gap-2.5">
                                                    <div className="w-8 h-8 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center font-bold text-primary text-xs shrink-0">
                                                        {item.avatar}
                                                    </div>
                                                    <div>
                                                        <div className="font-extrabold text-foreground text-sm flex items-center gap-1.5">
                                                            {item.user}
                                                            {item.channel === "whatsapp" ? <WhatsAppIcon size={14} /> : <TelegramIcon size={14} />}
                                                        </div>
                                                        <span className="text-[10px] text-muted-foreground">{item.phone}</span>
                                                    </div>
                                                </div>
                                            </td>
                                            <td className="py-3.5 px-4">
                                                <div className="flex flex-wrap items-center gap-1.5">
                                                    <span className="bg-primary/15 text-primary border border-primary/20 px-2.5 py-1 rounded-lg text-[11px] font-black">
                                                        🗓️ {item.topDay}
                                                    </span>
                                                    <button className="text-[10px] text-muted-foreground hover:text-foreground flex items-center gap-1 underline ml-1">
                                                        {isExpanded ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
                                                        <span>Ver días</span>
                                                    </button>
                                                </div>
                                            </td>
                                            <td className="py-3.5 px-4">
                                                <div className="flex flex-wrap gap-1">
                                                    {item.scannedZones?.map((z, idx) => (
                                                        <span key={idx} className="bg-card border border-border/80 px-2 py-0.5 rounded-md text-[10px] font-semibold text-foreground/90 flex items-center gap-1">
                                                            <span className="text-primary font-bold">📍 {z.code}</span>
                                                            <span className="opacity-80">{z.name}</span>
                                                            <span className="bg-primary/20 text-primary px-1 rounded text-[9px] font-bold">({z.count}x)</span>
                                                        </span>
                                                    ))}
                                                </div>
                                            </td>
                                            <td className="py-3.5 px-4 text-center">
                                                <span className="font-black text-sm text-foreground bg-white/5 px-3 py-1 rounded-xl border border-white/10">
                                                    {item.totalCount}
                                                </span>
                                            </td>
                                            <td className="py-3.5 px-4 text-right text-[11px] text-muted-foreground font-medium">
                                                {item.lastSeen}
                                            </td>
                                        </tr>

                                        {/* Fila expandible con el desglose detallado de días */}
                                        {isExpanded && (
                                            <tr className="bg-primary/5 border-b border-primary/20">
                                                <td colSpan={6} className="p-4">
                                                    <div className="space-y-3 pl-12 pr-4">
                                                        <h5 className="font-bold text-xs text-primary uppercase tracking-wider flex items-center gap-1.5">
                                                            <Calendar size={14} /> Desglose detallado de interacciones por día de la semana para {item.user}:
                                                        </h5>
                                                        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-2">
                                                            {item.dayBreakdown?.map((d, idx) => (
                                                                <div key={idx} className="bg-card border border-border/80 p-2.5 rounded-xl text-center shadow-xs">
                                                                    <span className="text-[10px] font-bold text-muted-foreground block uppercase">{d.day}</span>
                                                                    <span className="text-base font-black text-primary block mt-0.5">{d.count}</span>
                                                                    <span className="text-[9px] text-muted-foreground">interacciones</span>
                                                                </div>
                                                            ))}
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
                                    <td colSpan={6} className="text-center py-10 text-muted-foreground text-xs">
                                        No se encontraron usuarios o zonas coincidentes con "{search}".
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
}

