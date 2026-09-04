import React, { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { pointsService } from '../services/points.service';
import MapView from '../components/MapView';
import AlertsTab from '../components/AlertsTab';
import { Search, Monitor, Wifi, WifiOff, BarChart2, RefreshCw, BarChart3, Map, MapIcon, Activity, Clock, AlertTriangle, ShieldCheck, CheckCircle2, ChevronRight, Server, X, Video, Bell, Store, Trophy, Repeat, ChevronDown, Edit2, Save } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell, PieChart, Pie, Legend } from 'recharts';
import GerenciaDashboard from '../components/GerenciaDashboard';

// ─── KPI Card UI (Global Premium Redesign) ──────────────────────────
const KpiCard = ({ title, value, icon, badge, badgeColor, accent = "from-primary/20", iconColor = "text-primary" }) => (
    <div className="group relative flex flex-col items-center justify-between p-6 bg-[#0f111a]/80 backdrop-blur-md border border-white/5 rounded-2xl shadow-xl transition-all duration-500 hover:-translate-y-2 hover:border-white/20 hover:shadow-2xl hover:shadow-primary/20 overflow-hidden cursor-pointer">
        {/* Subtle Glow Background Effect */}
        <div className={`absolute top-0 w-full h-full bg-gradient-to-br ${accent} to-transparent opacity-5 group-hover:opacity-10 transition-opacity duration-500 pointer-events-none`} />

        {/* Floating Icon with Backglow (No Box) */}
        <div className="relative mb-6 transform transition-transform duration-500 group-hover:scale-110 group-hover:-translate-y-1 z-10 w-full flex justify-center mt-2">
            <div className={`absolute inset-0 bg-current opacity-20 blur-2xl rounded-full transition-all duration-500 group-hover:opacity-50 group-hover:blur-3xl ${iconColor}`} />
            <div className={`relative flex items-center justify-center ${iconColor} drop-shadow-2xl`}>
                {React.cloneElement(icon, { className: "w-11 h-11" })}
            </div>
        </div>

        {/* Title */}
        <h3 className="text-[11px] font-bold tracking-[0.15em] text-muted-foreground uppercase text-center mb-3 z-10 transition-colors duration-300 group-hover:text-white/90">
            {title}
        </h3>

        {/* Main Value */}
        <div className="text-4xl font-black tracking-tight text-white z-10 flex flex-col items-center gap-1">
            <span>{value}</span>
            {badge && (
                <div className="mt-4 w-full pt-4 border-t border-white/5 flex justify-center transition-colors duration-300 group-hover:border-white/10">
                    <span className={`text-[10px] font-medium uppercase tracking-widest ${badgeColor || 'text-muted-foreground group-hover:text-gray-300'}`}>{badge}</span>
                </div>
            )}
        </div>
    </div>
);

const NodeCard = ({ point, behavior, onUpdate }) => {
    const isOnline = point.active;
    const isSiissOnline = point.siiss_active;
    const hasDiscordance = isOnline !== isSiissOnline && isSiissOnline !== null && isSiissOnline !== undefined;
    const latencyColor = point.latency < 50 ? "text-green-400" : point.latency < 150 ? "text-yellow-400" : "text-orange-400";

    // ML logic display
    const hasAnomaly = behavior?.is_anomaly;
    const isCritical = behavior?.anomaly_type === 'CRITICAL';
    const anomalyReason = behavior?.anomaly_reason;

    const [isExpanded, setIsExpanded] = useState(false);
    const [isEditing, setIsEditing] = useState(false);

    // Asesor state
    const [asesorName, setAsesorName] = useState(point.asesor_nombre || '');
    const [asesorPhone, setAsesorPhone] = useState(point.asesor_telefono || '');
    const [analytics, setAnalytics] = useState(null);
    const formatCctvTime = value => value ? new Date(value).toLocaleTimeString('es-CO', { timeZone: 'America/Bogota', hour: '2-digit', minute: '2-digit' }) : 'Sin dato';

    // Cargar analíticas al expandir
    useEffect(() => {
        if (isExpanded && (point.ip || point.siiss_id) && !analytics) {
            pointsService.getPointAnalytics(point.ip, 30, point.siiss_id).then(setAnalytics);
        }
    }, [isExpanded, point.ip, point.siiss_id, analytics]);

    // Iconos de tecnología
    const techIcons = [
        point.has_cctv && { icon: Video, color: "text-blue-400", title: "CCTV" },
        point.has_alarm && { icon: Bell, color: "text-red-400", title: "Alarma" },
        point.is_mall && { icon: Store, color: "text-purple-400", title: "Centro Comercial" },
        point.has_sportbook && { icon: Trophy, color: "text-yellow-400", title: "Sportbook" },
        point.is_double && { icon: Repeat, color: "text-emerald-400", title: "Doble Jornada" }
    ].filter(Boolean);

    return (
        <div className={`bg-card/40 backdrop-blur-md border rounded-xl transition-all duration-300 relative overflow-hidden ${isOnline ? 'border-border/50 hover:border-green-500/30' : 'border-red-900/30 hover:border-red-500/50'} ${hasAnomaly ? 'ring-1 ring-amber-500/50 shadow-[0_0_15px_rgba(245,158,11,0.15)]' : ''}`}>

            {/* Cabecera Clickable para expandir */}
            <div
                className="p-4 cursor-pointer hover:bg-white/[0.02] transition-colors"
                onClick={() => setIsExpanded(!isExpanded)}
            >
                {/* Background glow if offline */}
                {!isOnline && <div className="absolute inset-0 bg-red-500/5 opacity-50 pointer-events-none" />}
                {/* Background glow if anomaly */}
                {hasAnomaly && isOnline && <div className="absolute inset-0 bg-amber-500/5 opacity-40 pointer-events-none" />}

                <div className="flex justify-between items-start mb-3 relative z-10">
                    <div className="flex flex-col gap-1">
                        <div className="flex items-center gap-2">
                            <Server className={`w-4 h-4 ${isOnline ? 'text-primary' : 'text-red-400'}`} />
                            <span className="text-xs font-mono text-muted-foreground">{point.ip}</span>
                        </div>
                    </div>
                    <div className="flex flex-col items-end gap-1.5">
                        <div className="flex items-center gap-3">
                            {/* SIISS Indicator */}
                            <div className="flex items-center gap-1" title={`SIISS: ${isSiissOnline ? 'Online' : isSiissOnline === false ? 'Offline' : 'Sin Datos'}`}>
                                <span className="text-[9px] font-bold text-muted-foreground/60 uppercase">SIISS</span>
                                <span className={`relative inline-flex rounded-full h-2 w-2 ${isSiissOnline ? 'bg-purple-500 shadow-[0_0_5px_rgba(168,85,247,0.5)]' : isSiissOnline === false ? 'bg-red-500/50' : 'bg-slate-700'}`}></span>
                            </div>

                            {/* Bot Ping Indicator */}
                            <div className="flex items-center gap-1.5" title={`Bot: ${isOnline ? 'Online' : 'Offline'}`}>
                                <span className="text-[9px] font-bold text-muted-foreground/60 uppercase">Bot</span>
                                <span className="relative flex h-2.5 w-2.5">
                                    {isOnline && <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>}
                                    <span className={`relative inline-flex rounded-full h-2.5 w-2.5 ${isOnline ? 'bg-green-500' : 'bg-red-500 shadow-[0_0_8px_rgba(239,68,68,0.8)]'}`}></span>
                                </span>
                            </div>
                        </div>
                        {hasDiscordance && (
                            <div className="flex items-center gap-1 text-[9px] font-bold text-amber-500 animate-pulse bg-amber-500/10 px-1.5 py-0.5 rounded border border-amber-500/20">
                                <RefreshCw className="w-2.5 h-2.5" /> DISCORDANCIA
                            </div>
                        )}
                    </div>
                </div>

                <div className="relative z-10 mb-4">
                    <h3 className="text-lg font-bold leading-tight truncate" title={point.name || point.alias}>
                        {point.name || point.alias}
                    </h3>
                    <p className="text-xs text-muted-foreground mt-1 flex items-center gap-1">
                        <Map className="w-3 h-3" /> {point.segment}
                    </p>
                    {behavior && (
                        <div className="flex flex-col gap-1 mt-2 p-2 bg-background/40 rounded-lg border border-border/40">
                            <div className="flex justify-between items-center text-[10px] text-muted-foreground">
                                <span>🕒 Patrón de Apertura:</span>
                                <span className="font-mono">{behavior.typical_open} - {behavior.typical_close}</span>
                            </div>
                            {hasAnomaly && (
                                <div className={`text-[10px] font-medium flex items-center gap-1 mt-0.5 ${isCritical ? 'text-red-400' : 'text-amber-400'}`}>
                                    <AlertTriangle className="w-3 h-3" />
                                    {anomalyReason}
                                </div>
                            )}
                        </div>
                    )}
                </div>

                <div className={`flex items-center justify-between pt-3 border-t border-border/50 relative z-10`}>
                    <div className="flex items-center gap-1.5">
                        <Activity className={`w-3.5 h-3.5 ${isOnline ? latencyColor : 'text-muted-foreground'}`} />
                        <span className={`text-sm font-mono ${isOnline ? 'text-foreground font-medium' : 'text-muted-foreground'}`}>
                            {isOnline && point.latency ? `${point.latency}ms` : '—'}
                        </span>
                    </div>
                    {!isOnline && (
                        <Badge variant="destructive" className="text-[10px] px-1.5 py-0">Revisar</Badge>
                    )}
                    {isOnline && (
                        <div className="flex gap-1.5">
                            {techIcons.map((t, idx) => (
                                <div key={idx} title={t.title} className="p-1 rounded-md bg-background/50 border border-border/50 shadow-sm">
                                    <t.icon className={`w-3.5 h-3.5 ${t.color}`} />
                                </div>
                            ))}
                        </div>
                    )}
                </div>

            </div>{/* End Cabecera Clickable */}

            {/* Panel de Expansión */}
            {isExpanded && (
                <div className="px-4 pb-4 animate-in slide-in-from-top-2 duration-300 border-t border-border/50 bg-[#0a0c10]/50 pt-3">
                    <div className="flex justify-between items-center mb-3">
                        <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Detalles Avanzados</h4>
                        <Button variant="ghost" size="sm" className="h-6 text-xs px-2 text-primary hover:text-primary/80" onClick={(e) => {
                            e.stopPropagation();
                            if (isEditing) {
                                onUpdate?.(point.id, { asesor_nombre: asesorName, asesor_telefono: asesorPhone });
                            }
                            setIsEditing(!isEditing);
                        }}>
                            {isEditing ? <><Save className="w-3 h-3 mr-1" /> Guardar</> : <><Edit2 className="w-3 h-3 mr-1" /> Editar</>}
                        </Button>
                    </div>

                    {/* Horario Programado vs. Real — Fix 2 */}
                    <div className="grid grid-cols-2 gap-2 text-xs mb-3">
                        <div className="p-2 rounded bg-background/50 border border-border/30">
                            <div className="text-muted-foreground mb-1 flex items-center gap-1">
                                <Clock className="w-3 h-3" /> Apertura Prog.
                            </div>
                            <div className="font-mono font-semibold text-foreground">
                                {analytics?.schedule?.scheduled_open || point.custom_open_time || '07:00'}
                            </div>
                            {analytics?.schedule?.tolerance_minutes && (
                                <div className="text-[9px] text-muted-foreground/60 mt-0.5">±{analytics.schedule.tolerance_minutes} min tolerancia</div>
                            )}
                        </div>
                        <div className="p-2 rounded bg-background/50 border border-border/30">
                            <div className="text-muted-foreground mb-1 flex items-center gap-1">
                                <Clock className="w-3 h-3" /> Cierre Prog.
                            </div>
                            <div className="font-mono font-semibold text-foreground">
                                {analytics?.schedule?.scheduled_close || point.custom_close_time || '21:00'}
                            </div>
                        </div>
                    </div>
                    {/* Alert: si la Últ. Apertura supera el deadline con tolerancia */}
                    {(() => {
                        const sched = analytics?.schedule;
                        const lastOpenTime = analytics?.analytics?.last_open_time;
                        if (!sched?.scheduled_open || !lastOpenTime) return null;
                        const [oh, om] = sched.scheduled_open.split(':').map(Number);
                        const tol = sched.tolerance_minutes || 15;
                        const deadlineMin = oh * 60 + om + tol;
                        const [lh, lm] = lastOpenTime.split(':').map(Number);
                        const lastOpenMin = lh * 60 + lm;
                        if (lastOpenMin <= deadlineMin) return null;
                        // Formatear el deadline para mostrarlo claramente
                        const dh = Math.floor(deadlineMin / 60).toString().padStart(2, '0');
                        const dm = (deadlineMin % 60).toString().padStart(2, '0');
                        const deadlineStr = `${dh}:${dm}`;
                        return (
                            <div className="flex items-center gap-1.5 mb-3 bg-amber-500/10 border border-amber-500/30 rounded px-2 py-1.5 text-xs text-amber-400 font-medium">
                                <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                                Apertura tardía: {lastOpenTime} · límite: {deadlineStr} ({sched.scheduled_open} +{tol} min)
                            </div>
                        );
                    })()}

                    {/* BITÁCORA DEL PUNTO */}
                    <div className="bg-background/50 rounded-lg border border-border/40 p-3 flex flex-col gap-2 mb-3">
                        <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
                            <BarChart2 className="w-3.5 h-3.5" /> Bitácora del Punto (30 días)
                        </span>
                        {!analytics ? (
                            <p className="text-xs text-muted-foreground italic">Cargando analíticas...</p>
                        ) : (
                            <div className="grid grid-cols-2 gap-x-4 gap-y-1.5">
                                {point.siiss_id && (
                                    <div className="col-span-2 flex items-center justify-between bg-purple-500/5 border border-purple-500/20 rounded px-2 py-1 mb-1">
                                        <div className="flex items-center gap-1.5">
                                            <ShieldCheck className="w-3.5 h-3.5 text-purple-400" />
                                            <span className="text-[10px] font-medium text-purple-400">SIISS Sync OK ({point.siiss_id})</span>
                                        </div>
                                        <span className="text-[9px] text-muted-foreground">
                                            {point.siiss_last_sync ? new Date(point.siiss_last_sync).toLocaleTimeString() : 'Nunca'}
                                        </span>
                                    </div>
                                )}
                                {analytics?.cctv_behavior && (
                                    <div className="col-span-2 rounded-lg border border-blue-500/20 bg-blue-500/5 p-2.5">
                                        <div className="mb-2 flex items-center justify-between">
                                            <span className="flex items-center gap-1.5 text-[10px] font-semibold text-blue-300">
                                                <Video className="h-3.5 w-3.5" /> Comportamiento CCTV + ping · hoy
                                            </span>
                                            <Badge variant="outline" className="h-5 border-blue-500/20 text-[9px] text-blue-300">Integrado</Badge>
                                        </div>
                                        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                                            <div className="rounded-md bg-background/50 px-2 py-1.5"><span className="block text-[9px] text-muted-foreground">Apertura CCTV</span><b className={analytics.cctv_behavior.emailOpening?'text-xs text-emerald-400':'text-xs text-muted-foreground'}>{formatCctvTime(analytics.cctv_behavior.emailOpening)}</b><span className="mt-0.5 block text-[8px] text-muted-foreground">evidencia del correo</span></div>
                                            <div className="rounded-md bg-background/50 px-2 py-1.5"><span className="block text-[9px] text-muted-foreground">Cierre CCTV</span><b className={analytics.cctv_behavior.emailClosing?'text-xs text-blue-400':'text-xs text-muted-foreground'}>{formatCctvTime(analytics.cctv_behavior.emailClosing)}</b><span className="mt-0.5 block text-[8px] text-muted-foreground">última evidencia</span></div>
                                            <div className="rounded-md bg-background/50 px-2 py-1.5" title="SIIS se consulta por intervalos; esta es la ventana entre la última muestra offline y la primera online."><span className="block text-[9px] text-muted-foreground">Ventana SIIS inicial</span><b className="text-xs text-violet-400">{analytics.cctv_behavior.firstOnlineWindowStart?`${formatCctvTime(analytics.cctv_behavior.firstOnlineWindowStart)}–${formatCctvTime(analytics.cctv_behavior.firstOnlineWindowEnd)}`:analytics.cctv_behavior.firstOnlineObservedAt?`antes de ${formatCctvTime(analytics.cctv_behavior.firstOnlineObservedAt)}`:'Sin dato'}</b><span className="mt-0.5 block text-[8px] text-muted-foreground">transición observada</span></div>
                                            <div className="rounded-md bg-background/50 px-2 py-1.5"><span className="block text-[9px] text-muted-foreground">Estado SIIS actual</span><b className={`text-xs ${analytics.cctv_behavior.online===true?'text-emerald-400':analytics.cctv_behavior.online===false?'text-rose-400':'text-muted-foreground'}`}>{analytics.cctv_behavior.online===true?'En línea':analytics.cctv_behavior.online===false?'Sin conexión':'Sin dato'}</b><span className="mt-0.5 block text-[8px] text-muted-foreground">muestra {formatCctvTime(analytics.cctv_behavior.latestObservedAt)}</span></div>
                                        </div>
                                        <p className="mt-2 border-t border-blue-500/10 pt-2 text-[8px] leading-relaxed text-blue-200/55">SIIS se observa cada {analytics.cctv_behavior.observationCadenceMinutes||30} min. La ventana indica cuándo el equipo pasó a estar en línea; no representa por sí sola la hora de llegada de la persona.</p>
                                    </div>
                                )}
                                {!point.active && point.last_online_at && (
                                    <div className="col-span-2 flex items-center gap-1.5 bg-red-500/5 border border-red-500/20 rounded px-2 py-1">
                                        <WifiOff className="w-3.5 h-3.5 text-rose-500" />
                                        <span className="text-xs font-medium text-rose-500">
                                            Bot Offline desde: {new Date(point.last_online_at).toLocaleString()}
                                        </span>
                                    </div>
                                )}
                                <div className="flex flex-col">
                                    <span className="text-xs text-muted-foreground">Últ. Apertura</span>
                                    <span className="text-sm font-semibold text-foreground">
                                        {analytics?.analytics?.last_open_time || <span className="text-muted-foreground italic text-xs">Sin datos</span>}
                                    </span>
                                </div>
                                <div className="flex flex-col">
                                    <span className="text-xs text-muted-foreground">Últ. Cierre</span>
                                    <span className="text-sm font-semibold text-foreground">
                                        {analytics?.analytics?.last_close_time || <span className="text-muted-foreground italic text-xs">Sin datos</span>}
                                    </span>
                                </div>
                                <div className="flex flex-col">
                                    <span className="text-xs text-muted-foreground">Apertura Prom.</span>
                                    <span className="text-sm font-semibold text-emerald-500">
                                        {analytics?.analytics?.avg_open_time || <span className="text-muted-foreground italic text-xs">Sin historial</span>}
                                    </span>
                                </div>
                                <div className="flex flex-col">
                                    <span className="text-xs text-muted-foreground">Cierre Prom.</span>
                                    <span className="text-sm font-semibold text-amber-500">
                                        {analytics?.analytics?.avg_close_time || <span className="text-muted-foreground italic text-xs">Sin historial</span>}
                                    </span>
                                </div>
                                {analytics?.analytics?.open_on_time_pct != null && (
                                    <div className="flex flex-col">
                                        <span className="text-xs text-muted-foreground">Abre a tiempo</span>
                                        <span className={`text-sm font-bold ${analytics.analytics.open_on_time_pct >= 80 ? 'text-emerald-500' :
                                            analytics.analytics.open_on_time_pct >= 60 ? 'text-amber-500' : 'text-rose-500'
                                            }`}>{analytics.analytics.open_on_time_pct}%</span>
                                    </div>
                                )}
                                <div className="flex flex-col">
                                    <span className="text-xs text-muted-foreground">Días offline/mes</span>
                                    <span className={`text-sm font-bold ${(analytics?.analytics?.days_offline || 0) > 3 ? 'text-rose-500' : 'text-foreground'}`}>
                                        {analytics?.analytics?.days_offline ?? '—'}
                                    </span>
                                </div>
                                {!analytics?.analytics && analytics?.cctv_behavior && (
                                    <p className="col-span-2 text-[9px] text-amber-300/80">El histórico de Operación de Puntos no está disponible; CCTV y ping continúan visibles.</p>
                                )}
                            </div>
                        )}
                    </div>

                    {/* Formulario de Asesores */}
                    <div className="bg-primary/5 border border-primary/20 rounded-md p-3">
                        <div className="text-xs font-semibold text-primary/80 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                            Contacto del Nodo
                        </div>
                        <div className="grid grid-cols-2 gap-3">
                            <div className="space-y-1.5">
                                <label className="text-[10px] text-muted-foreground uppercase">Nombre Encargado</label>
                                {isEditing ? (
                                    <Input
                                        size="sm"
                                        className="h-7 text-xs bg-background/60 border-primary/30"
                                        placeholder="Ej. Juan Pérez"
                                        value={asesorName}
                                        onChange={e => setAsesorName(e.target.value)}
                                    />
                                ) : (
                                    <div className="text-xs font-medium text-foreground">{point.asesor_nombre || 'No asignado'}</div>
                                )}
                            </div>
                            <div className="space-y-1.5">
                                <label className="text-[10px] text-muted-foreground uppercase">Teléfono (WhatsApp)</label>
                                {isEditing ? (
                                    <Input
                                        size="sm"
                                        className="h-7 text-xs bg-background/60 border-primary/30"
                                        placeholder="Ej. 3001234567"
                                        value={asesorPhone}
                                        onChange={e => setAsesorPhone(e.target.value)}
                                    />
                                ) : (
                                    <div className="text-xs font-medium text-foreground">{point.asesor_telefono || 'No asignado'}</div>
                                )}
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default function Points() {
    const queryClient = useQueryClient();
    const [searchTerm, setSearchTerm] = useState("");
    const [filter, setFilter] = useState("all");
    const [techFilters, setTechFilters] = useState({
        cctv: false, alarm: false, mall: false, sportbook: false, double: false
    });
    const [activeTab, setActiveTab] = useState("overview");
    const [focusedZone, setFocusedZone] = useState(null);

    const { data: points = [], isLoading, refetch } = useQuery({
        queryKey: ['points'],
        queryFn: pointsService.getPoints,
        refetchInterval: 30000
    });

    const { data: stats } = useQuery({
        queryKey: ['points-stats'],
        queryFn: pointsService.getPointsStats,
        refetchInterval: 30000
    });

    const { data: zones = [] } = useQuery({
        queryKey: ['points-zones'],
        queryFn: pointsService.getPointsByZone,
        refetchInterval: 30000
    });

    const updateLocationMutation = useMutation({
        mutationFn: ({ id, lat, lng }) => pointsService.updatePointLocation(id, lat, lng),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['points'] });
            queryClient.invalidateQueries({ queryKey: ['points-zones'] });
        },
        onError: (err) => {
            console.error("Error al actualizar la ubicación geoespacial:", err);
            alert("No se pudo actualizar la ubicación. Comprueba tu conexión.");
        }
    });

    const updatePointMutation = useMutation({
        mutationFn: ({ id, attributes }) => pointsService.updatePointAttributes(id, attributes),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['points'] });
        },
        onError: (err) => console.error("Error actualizando atributos:", err)
    });

    const { data: nodeBehaviors = [] } = useQuery({
        queryKey: ['node-behavior'],
        queryFn: pointsService.getNodeBehavior,
        refetchInterval: 60000 // 1 min (ML data changes infrequently)
    });

    const filteredPoints = points.filter(p => {
        if (focusedZone && p.segment !== focusedZone) return false;

        const matchesSearch =
            p.alias?.toLowerCase().includes(searchTerm.toLowerCase()) ||
            p.ip?.includes(searchTerm) ||
            p.segment?.toLowerCase().includes(searchTerm.toLowerCase());

        if (techFilters.cctv && !p.has_cctv) return false;
        if (techFilters.alarm && !p.has_alarm) return false;
        if (techFilters.mall && !p.is_mall) return false;
        if (techFilters.sportbook && !p.has_sportbook) return false;
        if (techFilters.double && !p.is_double) return false;

        if (filter === 'online') return matchesSearch && p.active;
        if (filter === 'offline') return matchesSearch && !p.active;
        if (filter === 'anomalies') {
            const currentBehavior = nodeBehaviors.find(b => b.ip === p.ip);
            return matchesSearch && currentBehavior?.is_anomaly;
        }
        return matchesSearch;
    });

    return (
        <div className="space-y-6 animate-in fade-in duration-500 h-full flex flex-col">
            {/* Header */}
            <div className="flex flex-col md:flex-row gap-4 justify-between items-start md:items-center">
                <div className="flex-1">
                    <div className="flex items-center gap-3">
                        <Badge variant="outline" className="bg-primary/10 text-primary border-primary/20 flex items-center gap-2">
                            <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
                            Monitoreo Activo
                        </Badge>
                    </div>
                    <p className="text-sm text-muted-foreground mt-2 font-medium">
                        Supervisión operativa y analítica de zonas y nodos de negocio.
                    </p>
                </div>
                <div className="flex gap-2">
                    <Button variant="outline" size="sm" onClick={() => refetch()} className="border-border/50 bg-card/50 backdrop-blur-sm">
                        <RefreshCw className="h-4 w-4 mr-2" /> Actualizar Data
                    </Button>
                    {/* Fix 3: Botón de Sincronización SIISS Manual */}
                    <Button variant="outline" size="sm"
                        className="border-purple-500/40 text-purple-400 hover:bg-purple-500/10 bg-card/50 backdrop-blur-sm"
                        onClick={async () => {
                            const backendUrl = import.meta.env.VITE_BACKEND_URL || 'http://localhost:3001';
                            try {
                                const r = await fetch(`${backendUrl}/api/siiss/sync`, { method: 'POST' });
                                const j = await r.json();
                                alert(`✅ SIISS Sync: ${j.matched || 0} puntos sincronizados`);
                                refetch();
                            } catch (e) {
                                alert('❌ Error al conectar con SIISS: ' + e.message);
                            }
                        }}
                    >
                        <RefreshCw className="h-4 w-4 mr-2" /> Sync SIISS
                    </Button>
                </div>
            </div>

            <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 flex flex-col min-h-0">
                <div className="flex flex-col xl:flex-row justify-between items-start xl:items-center mb-4 border-b border-border/50 pb-2 gap-4">
                    <TabsList className="bg-card border border-border shrink-0">
                        <TabsTrigger value="overview" className="data-[state=active]:bg-primary/20 data-[state=active]:text-primary hover:bg-muted/50 transition-colors">Nodos</TabsTrigger>
                        <TabsTrigger value="zones" className="data-[state=active]:bg-primary/20 data-[state=active]:text-primary hover:bg-muted/50 transition-colors">Zonas</TabsTrigger>
                        <TabsTrigger value="map" className="flex items-center gap-1.5 data-[state=active]:bg-primary/20 data-[state=active]:text-primary hover:bg-muted/50 transition-colors"><Map className="w-3.5 h-3.5" /> Mapa en Vivo</TabsTrigger>
                        <TabsTrigger value="alerts" className="flex items-center gap-1.5 data-[state=active]:bg-primary/20 data-[state=active]:text-primary hover:bg-muted/50 transition-colors"><Clock className="w-3.5 h-3.5" /> Prog. & Alertas</TabsTrigger>
                        <TabsTrigger value="analytics" className="data-[state=active]:bg-primary/20 data-[state=active]:text-primary hover:bg-muted/50 transition-colors">Analítica</TabsTrigger>
                    </TabsList>

                    <div className="flex flex-1 w-full flex-col md:flex-row gap-4 justify-end items-center">
                        {focusedZone && (
                            <div className="flex items-center bg-primary/10 border border-primary/20 px-3 py-1.5 rounded-lg text-sm shrink-0 min-w-max">
                                <span className="font-semibold text-primary mr-2 flex items-center gap-1.5"><MapIcon className="w-3.5 h-3.5" /> {focusedZone}</span>
                                <Button variant="ghost" size="sm" onClick={() => setFocusedZone(null)} className="h-6 w-6 p-0 rounded-full text-primary hover:bg-primary/20 hover:text-primary transition-colors">
                                    <X className="w-4 h-4" />
                                </Button>
                            </div>
                        )}

                        <div className="relative w-full md:w-80 shrink-0">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                            <Input
                                placeholder="Buscar por Alias, IP o Zona..."
                                className="pl-9 bg-background/50 border-border/50 focus-visible:ring-1 h-9 text-sm"
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                            />
                        </div>

                        {activeTab === 'map' && (
                            <div className="flex items-center gap-4 bg-background/50 border border-border/50 px-3 py-1.5 rounded-lg text-sm shrink-0">
                                <span className="font-semibold text-foreground flex items-center gap-2">
                                    <MapIcon className="w-4 h-4 text-primary" />
                                    Nodos: {filteredPoints.length}
                                </span>
                                <div className="flex items-center gap-1.5 text-foreground/80 hidden sm:flex">
                                    <span className="w-2.5 h-2.5 rounded-full bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.6)]" />
                                    <span>Online ({filteredPoints.filter(p => p.active).length})</span>
                                </div>
                                <div className="flex items-center gap-1.5 text-foreground/80 hidden sm:flex">
                                    <span className="w-2.5 h-2.5 rounded-full bg-red-500 shadow-[0_0_8px_rgba(239,68,68,0.6)]" />
                                    <span>Offline ({filteredPoints.filter(p => !p.active).length})</span>
                                </div>
                            </div>
                        )}
                    </div>
                </div>

                {/* OVERVIEW TAB */}
                <TabsContent value="overview" className="flex-1 flex flex-col min-h-0 space-y-4">
                    {/* Global KPI Cards */}
                    <div className="grid grid-cols-2 lg:grid-cols-5 gap-4 mb-2">
                        <KpiCard
                            title="Puntos Activos"
                            value={stats?.active || 0}
                            icon={<Wifi className="w-5 h-5" />}
                            badge="En línea"
                            badgeColor="text-emerald-400"
                            iconColor="text-emerald-400"
                            accent="from-emerald-500/20 to-emerald-600/5"
                        />
                        <KpiCard
                            title="Anomalías ML"
                            value={nodeBehaviors.filter(b => b.is_anomaly).length || 0}
                            icon={<AlertTriangle className="w-5 h-5" />}
                            badge="Patrones Rotos"
                            badgeColor="text-amber-400"
                            iconColor="text-amber-400"
                            accent="from-amber-500/20 to-amber-600/5"
                        />
                        <KpiCard
                            title="Puntos Offline"
                            value={stats?.inactive || 0}
                            icon={<WifiOff className="w-5 h-5" />}
                            badge="Desconectados"
                            badgeColor="text-red-400"
                            iconColor="text-red-400"
                            accent="from-red-500/20 to-red-600/5"
                        />
                        <KpiCard
                            title="Disponibilidad Global"
                            value={`${stats?.availability || 0}%`}
                            icon={<ShieldCheck className="w-5 h-5" />}
                            badge="Últimos 30s"
                            badgeColor="text-blue-400"
                            iconColor="text-blue-400"
                            accent="from-blue-500/20 to-blue-600/5"
                        />
                        <KpiCard
                            title="Latencia Promedio"
                            value={`${stats?.avgLatency || 0} ms`}
                            icon={<Activity className="w-5 h-5" />}
                            badge="Óptimo"
                            badgeColor="text-amber-400"
                            iconColor="text-amber-400"
                            accent="from-amber-500/20 to-amber-600/5"
                        />
                    </div>

                    <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-card/40 backdrop-blur-sm p-3 rounded-xl border border-border/80 shadow-sm">

                        {/* Tech Filters Group */}
                        <div className="flex flex-wrap gap-1.5">
                            <span className="text-xs text-muted-foreground mr-2 self-center font-medium uppercase tracking-wider hidden md:inline-block">Tecnología:</span>
                            <Button
                                variant={techFilters.cctv ? "secondary" : "ghost"}
                                onClick={() => setTechFilters(prev => ({ ...prev, cctv: !prev.cctv }))}
                                size="sm" className={`h-8 text-[11px] font-medium px-2.5 border ${techFilters.cctv ? 'border-blue-500/50 text-blue-400 bg-blue-500/10 hover:bg-blue-500/20' : 'border-transparent'}`}
                            >
                                <Video className="w-3 h-3 mr-1.5" /> CCTV
                            </Button>
                            <Button
                                variant={techFilters.alarm ? "secondary" : "ghost"}
                                onClick={() => setTechFilters(prev => ({ ...prev, alarm: !prev.alarm }))}
                                size="sm" className={`h-8 text-[11px] font-medium px-2.5 border ${techFilters.alarm ? 'border-red-500/50 text-red-400 bg-red-500/10 hover:bg-red-500/20' : 'border-transparent'}`}
                            >
                                <Bell className="w-3 h-3 mr-1.5" /> Alarma
                            </Button>
                            <Button
                                variant={techFilters.mall ? "secondary" : "ghost"}
                                onClick={() => setTechFilters(prev => ({ ...prev, mall: !prev.mall }))}
                                size="sm" className={`h-8 text-[11px] font-medium px-2.5 border ${techFilters.mall ? 'border-purple-500/50 text-purple-400 bg-purple-500/10 hover:bg-purple-500/20' : 'border-transparent'}`}
                            >
                                <Store className="w-3 h-3 mr-1.5" /> Comercial
                            </Button>
                            <Button
                                variant={techFilters.sportbook ? "secondary" : "ghost"}
                                onClick={() => setTechFilters(prev => ({ ...prev, sportbook: !prev.sportbook }))}
                                size="sm" className={`h-8 text-[11px] font-medium px-2.5 border ${techFilters.sportbook ? 'border-yellow-500/50 text-yellow-400 bg-yellow-500/10 hover:bg-yellow-500/20' : 'border-transparent'}`}
                            >
                                <Trophy className="w-3 h-3 mr-1.5" /> Sportbook
                            </Button>
                            <Button
                                variant={techFilters.double ? "secondary" : "ghost"}
                                onClick={() => setTechFilters(prev => ({ ...prev, double: !prev.double }))}
                                size="sm" className={`h-8 text-[11px] font-medium px-2.5 border ${techFilters.double ? 'border-emerald-500/50 text-emerald-400 bg-emerald-500/10 hover:bg-emerald-500/20' : 'border-transparent'}`}
                            >
                                <Repeat className="w-3 h-3 mr-1.5" /> Doble Jornada
                            </Button>
                        </div>

                        {/* Status Filters Group */}
                        <div className="flex gap-1.5 bg-background/50 p-1 rounded-lg border border-border/50 shrink-0">
                            <Button
                                variant={filter === 'all' ? "secondary" : "ghost"}
                                onClick={() => setFilter('all')}
                                size="sm"
                                className="h-8 text-xs font-medium"
                            >
                                Todos
                            </Button>
                            <Button
                                variant={filter === 'online' ? "default" : "ghost"}
                                onClick={() => setFilter('online')}
                                size="sm"
                                className={`h-8 text-xs font-medium ${filter === 'online' ? 'bg-emerald-600 hover:bg-emerald-700 text-white shadow-sm' : ''}`}
                            >
                                Online
                            </Button>
                            <Button
                                variant={filter === 'offline' ? "destructive" : "ghost"}
                                onClick={() => setFilter('offline')}
                                size="sm"
                                className={`h-8 text-xs font-medium ${filter === 'offline' ? 'shadow-sm' : ''}`}
                            >
                                Offline
                            </Button>
                            <Button
                                variant={filter === 'anomalies' ? "outline" : "ghost"}
                                onClick={() => setFilter('anomalies')}
                                size="sm"
                                className={`h-8 text-xs font-medium border-amber-500/50 ${filter === 'anomalies' ? 'bg-amber-500/20 text-amber-500 shadow-sm' : 'text-amber-500/70 hover:text-amber-500'}`}
                            >
                                <AlertTriangle className="w-3 h-3 mr-1" />
                                Alertas Anómalas
                            </Button>
                        </div>
                    </div>

                    {/* Nodes Grid Layout */}
                    {isLoading ? (
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 pb-20">
                            {[...Array(12)].map((_, i) => (
                                <div key={i} className="h-32 bg-card/40 rounded-xl animate-pulse border border-border/50" />
                            ))}
                        </div>
                    ) : filteredPoints.length === 0 ? (
                        <div className="flex flex-col items-center justify-center p-20 text-center border border-dashed border-border/50 rounded-xl bg-card/20">
                            <Server className="h-10 w-10 text-muted-foreground/50 mb-4" />
                            <h3 className="text-lg font-medium text-foreground">No se encontraron nodos</h3>
                            <p className="text-sm text-muted-foreground mb-4">Ajusta los filtros o términos de búsqueda</p>
                            <Button variant="outline" onClick={() => { setSearchTerm(''); setFilter('all'); }}>Limpiar filtros</Button>
                        </div>
                    ) : (
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 pb-20">
                            {filteredPoints.map((point) => (
                                <NodeCard key={point.ip} point={point} behavior={nodeBehaviors.find(b => b.ip === point.ip)} onUpdate={(id,attributes)=>updatePointMutation.mutate({id,attributes})} />
                            ))}
                        </div>
                    )}
                </TabsContent>

                {/* DYNAMIC MAP TAB */}
                <TabsContent value="map" className="flex-1 flex flex-col min-h-0 relative z-0">
                    <MapView
                        points={filteredPoints}
                        focusedZone={focusedZone}
                        onClearFocus={() => setFocusedZone(null)}
                        onUpdatePointLocation={(id, lat, lng) => updateLocationMutation.mutate({ id, lat, lng })}
                    />
                </TabsContent>

                {/* ALERTS TAB */}
                <TabsContent value="alerts" className="flex-1 flex flex-col min-h-0">
                    <AlertsTab />
                </TabsContent>

                {/* ZONES TAB */}
                <TabsContent value="zones" className="space-y-4 overflow-auto pb-10">
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                        {zones.map(zone => (
                            <Card key={zone.name} className="overflow-hidden">
                                <div className={`h-1 w-full ${zone.availability > 90 ? 'bg-green-500' : zone.availability > 70 ? 'bg-yellow-500' : 'bg-red-500'}`} />
                                <CardHeader className="pb-2">
                                    <div className="flex justify-between items-center">
                                        <CardTitle className="text-lg">{zone.name}</CardTitle>
                                        <Badge variant={zone.availability > 90 ? "success" : "secondary"}>
                                            {zone.availability}% Disp.
                                        </Badge>
                                    </div>
                                    <CardDescription>
                                        {zone.total} Puntos Totales
                                    </CardDescription>
                                </CardHeader>
                                <CardContent>
                                    <div className="space-y-2 text-sm">
                                        <div className="flex justify-between">
                                            <span className="text-muted-foreground flex items-center gap-2">
                                                <div className="w-2 h-2 rounded-full bg-green-500" /> Activos
                                            </span>
                                            <span className="font-bold">{zone.active}</span>
                                        </div>
                                        <div className="flex justify-between">
                                            <span className="text-muted-foreground flex items-center gap-2">
                                                <div className="w-2 h-2 rounded-full bg-red-500" /> Inactivos
                                            </span>
                                            <span className="font-bold text-red-500">{zone.inactive}</span>
                                        </div>
                                        <div className="border-t pt-2 mt-2 flex justify-between">
                                            <span className="text-muted-foreground">Latencia Prom.</span>
                                            <span>{zone.avgLatency} ms</span>
                                        </div>
                                        <div className="pt-3 mt-3 border-t border-border/50 text-center">
                                            <Button variant="outline" size="sm" className="w-full text-xs font-medium bg-card hover:bg-primary/5" onClick={() => {
                                                setFocusedZone(zone.name);
                                                setActiveTab("map");
                                            }}>
                                                <Map className="w-3.5 h-3.5 mr-1.5 text-primary" /> Ver en Mapa
                                            </Button>
                                        </div>
                                    </div>
                                </CardContent>
                            </Card>
                        ))}
                    </div>
                </TabsContent>

                {/* ANALYTICS TAB */}
                <TabsContent value="analytics" className="space-y-6 overflow-y-auto pb-10 flex-1 min-h-0 bg-background/50 backdrop-blur-sm p-4 rounded-xl border border-border/50">
                    <GerenciaDashboard />
                </TabsContent>
            </Tabs>
        </div>
    );
}
