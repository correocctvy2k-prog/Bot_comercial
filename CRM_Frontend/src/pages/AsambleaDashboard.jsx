import React, { useState, useEffect } from 'react';
import { Users, UserCheck, PhoneMissed, BadgeCheck, Activity as ActivityIcon, BarChart3, Wifi, WifiOff, ListX, X, Search, Trash2, MessageSquare, PieChart as PieChartIcon } from 'lucide-react';
import { getAsambleaStats, subscribeToAsamblea, getFaltantesAsamblea, deleteAsambleaRecord } from '../services/asamblea.service';
import { supabase } from '../services/supabase';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, Legend } from 'recharts';
import { formatDistanceToNow } from 'date-fns';
import { es } from 'date-fns/locale';
import { toast } from 'sonner';

export default function AsambleaDashboard() {
    // ─── SVG Premium Quorum Donut ─────────────────────────────────────────────
    function QuorumDonut({ enSala = 0, faltantes = 0 }) {
        const total = enSala + faltantes;
        const size = 200;
        const cx = size / 2;
        const cy = size / 2;
        const r = 70;
        const strokeW = 16;

        const pct = total === 0 ? 0 : enSala / total;
        const quorumPct = Math.round(pct * 100);
        const circ = 2 * Math.PI * r;
        const dash = pct * circ;
        const gap = circ - dash;

        const endAngle = pct * 360;
        const polarToXY = (radius, angleDeg) => {
            const rad = (angleDeg - 90) * (Math.PI / 180);
            return { x: cx + radius * Math.cos(rad), y: cy + radius * Math.sin(rad) };
        };
        const dot = polarToXY(r, endAngle);

        return (
            <div className="relative flex items-center justify-center" style={{ width: "100%", height: size }}>
                <svg width={size} height={size} style={{ overflow: "visible" }}>
                    <defs>
                        <filter id="glow-quorum" x="-50%" y="-50%" width="200%" height="200%">
                            <feGaussianBlur stdDeviation="4" result="blur" />
                            <feMerge>
                                <feMergeNode in="blur" />
                                <feMergeNode in="SourceGraphic" />
                            </feMerge>
                        </filter>
                    </defs>

                    {/* Background Track - Represents Faltantes (Red) */}
                    <circle
                        cx={cx} cy={cy} r={r}
                        fill="none"
                        stroke="#ef4444"
                        strokeWidth={strokeW}
                        style={{ opacity: 0.2 }}
                    />

                    {/* Progress Bar - Represents En Sala (Green) */}
                    <circle
                        cx={cx} cy={cy} r={r}
                        fill="none"
                        stroke="#22c55e"
                        strokeWidth={strokeW}
                        strokeLinecap="round"
                        strokeDasharray={`${dash} ${gap}`}
                        strokeDashoffset={0}
                        transform={`rotate(-90 ${cx} ${cy})`}
                        style={{ transition: "stroke-dasharray 1s cubic-bezier(0.25,0.46,0.45,0.94)", opacity: pct > 0 ? 1 : 0 }}
                    />

                    {/* Glowing endpoint dot */}
                    {pct > 0.01 && (
                        <circle cx={dot.x} cy={dot.y} r={strokeW / 2} fill="#22c55e" filter="url(#glow-quorum)" style={{ transition: "all 1s cubic-bezier(0.25,0.46,0.45,0.94)" }} />
                    )}

                    {total > 0 && (
                        <g>
                            <text x={cx} y={cy + 8} textAnchor="middle" fill="white" style={{ fontSize: 42, fontWeight: 900, fontFamily: "inherit" }}>
                                {quorumPct}%
                            </text>
                            <text x={cx} y={cy + 30} textAnchor="middle" fill="#94a3b8" style={{ fontSize: 10, fontWeight: 600, fontFamily: "inherit", textTransform: "uppercase", letterSpacing: "0.1em" }}>
                                Quórum
                            </text>
                        </g>
                    )}
                </svg>
            </div>
        );
    }

    const [stats, setStats] = useState({
        totalRegistrados: 0,
        asociados: 0,
        representantes: 0,
        quorumPercentage: '0.0',
        syncOk: 0,
        syncFailed: 0,
        recentLogs: []
    });
    const [loading, setLoading] = useState(true);
    const [isLive, setIsLive] = useState(false);
    const [censoData, setCensoData] = useState({ totalCenso: 300, totalFaltantes: 0 });

    const [activityFeed, setActivityFeed] = useState([]);
    const [pollChartData, setPollChartData] = useState(null);
    const [quizAudit, setQuizAudit] = useState({ polls: [], participants: [] });

    // Modal de Faltantes
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [faltantes, setFaltantes] = useState([]);
    const [loadingFaltantes, setLoadingFaltantes] = useState(false);
    const [searchTerm, setSearchTerm] = useState('');

    const loadData = async () => {
        setLoading(true);

        // 1. Cargar datos del censo de SIISS
        getFaltantesAsamblea().then(res => {
            if (res && res.totalCenso) {
                setCensoData(res);
                // Recalcular stats con el censo dinámico
                getAsambleaStats(res.totalCenso).then(data => {
                    if (data) setStats(data);
                });
            }
        }).catch(err => console.error(err));

        // 2. Cargar stats iniciales
        const data = await getAsambleaStats(censoData.totalCenso);
        if (data) setStats(data);

        // 3. Cargar actividad del bot asamblea
        const { data: feed } = await supabase
            .from('interactions_log')
            .select('*')
            .eq('channel_id', 'bot_asamblea_main')
            .order('created_at', { ascending: false })
            .limit(10);
        if (feed) setActivityFeed(feed);

        // 4. Cargar gráficos de encuestas
        const { data: poll } = await supabase
            .from('asamblea_encuestas')
            .select('*')
            .order('created_at', { ascending: false })
            .limit(1)
            .single();

        if (poll) {
            const { data: votos } = await supabase.from('asamblea_votos').select('opcion_texto').eq('encuesta_id', poll.id);
            if (votos) {
                const counts = {};
                poll.opciones.forEach(o => counts[o] = 0);
                votos.forEach(v => {
                    if (counts[v.opcion_texto] !== undefined) counts[v.opcion_texto]++;
                });
                const chartData = Object.keys(counts).map(key => ({ name: key, value: counts[key] }));
                setPollChartData({ pregunta: poll.pregunta, data: chartData });
            }
        }

        // 5. Cargar Auditoría del Quiz SARLAFT (3 últimas preguntas)
        const { data: recentPolls } = await supabase
            .from('asamblea_encuestas')
            .select('*')
            .order('created_at', { ascending: false })
            .limit(3);

        if (recentPolls && recentPolls.length > 0) {
            const pollIds = recentPolls.map(p => p.id);
            const { data: allVotes } = await supabase
                .from('asamblea_votos')
                .select('*')
                .in('encuesta_id', pollIds);

            const { data: allRegistered } = await supabase
                .from('asamblea_registro')
                .select('user_phone, nombre, documento');

            if (allRegistered) {
                const auditData = allRegistered.map(user => {
                    const userVotes = {};
                    pollIds.forEach(pId => {
                        const v = allVotes?.find(vote => vote.encuesta_id === pId && vote.user_phone === user.user_phone);
                        userVotes[pId] = v ? v.opcion_texto : null;
                    });
                    return { ...user, votes: userVotes };
                });
                setQuizAudit({ polls: recentPolls, participants: auditData });
            }
        }

        setLoading(false);
    };

    useEffect(() => {
        loadData();

        const channel = supabase.channel('asamblea-changes')
            .on('postgres_changes', { event: '*', schema: 'public', table: 'asamblea_registro' }, (payload) => {
                setIsLive(true);
                setTimeout(() => setIsLive(false), 2000);
                loadData();
            })
            .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'interactions_log', filter: 'channel_id=eq.bot_asamblea_main' }, () => {
                loadData();
            })
            .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'asamblea_votos' }, (payload) => {
                console.log("🔥 [RT] Nuevo voto recibido:", payload);
                loadData();
            })
            .subscribe((status) => {
                console.log("📡 [RT] Estado de subscripción:", status);
                if (status === 'SUBSCRIBED') {
                    toast.success('Conexión en tiempo real establecida');
                }
            });

        return () => {
            supabase.removeChannel(channel);
        };
    }, []);

    const handleDelete = async (id, nombre) => {
        if (window.confirm(`¿Seguro que deseas eliminar el registro de ingreso de ${nombre}?`)) {
            const success = await deleteAsambleaRecord(id);
            if (success) {
                toast.success('Registro eliminado correctamente');
                loadData();
            } else {
                toast.error('Error al eliminar el registro');
            }
        }
    };

    const KpiCard = ({ title, value, badge, badgeColor, icon: Icon, accent, iconColor }) => (
        <div className={`relative bg-gradient-to-br ${accent} bg-card/60 backdrop-blur-md border border-border/70 p-5 rounded-xl hover:border-border transition-all duration-300 overflow-hidden group`}>
            <div className="flex justify-between items-start gap-2">
                <div className="min-w-0">
                    <p className="text-xs font-medium text-muted-foreground truncate">{title}</p>
                    <h3 className="text-3xl font-bold mt-1 tracking-tight">{value}</h3>
                </div>
                <div className={`p-2 rounded-lg bg-background/40 ${iconColor} shrink-0 group-hover:scale-110 transition-transform`}>
                    <Icon className="w-5 h-5" />
                </div>
            </div>
            <p className={`text-xs mt-3 font-medium ${badgeColor}`}>{badge}</p>
        </div>
    );

    const openFaltantesModal = async () => {
        setIsModalOpen(true);
        setLoadingFaltantes(true);
        const data = await getFaltantesAsamblea();
        if (data && data.faltantes) {
            setFaltantes(data.faltantes);
            setCensoData(data); // update censo data silently
        }
        setLoadingFaltantes(false);
    };

    const filteredFaltantes = faltantes.filter(f =>
        f.nombre.toLowerCase().includes(searchTerm.toLowerCase()) ||
        f.documento.includes(searchTerm)
    );

    // Colores para gráficos
    const COLORS = ['#25D366', '#3b82f6', '#f59e0b', '#ef4444', '#8b5cf6'];

    return (
        <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-700">
            {/* Cabecera */}
            <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-4 bg-card/40 border border-white/5 backdrop-blur-md rounded-2xl p-6">
                <div>
                    <div className="flex items-center gap-3 mb-2">
                        <Users className="text-primary h-6 w-6" />
                        <h1 className="text-2xl font-bold tracking-tight text-foreground">Asamblea General 2026</h1>
                    </div>
                    <p className="text-muted-foreground text-sm">Dashboard oficial de control de asistencia, quórum y encuestas en tiempo real.</p>
                </div>

                <div className="flex items-center gap-3 bg-black/20 rounded-full px-4 py-2 border border-white/5">
                    <div className={`relative flex h-3 w-3 ${isLive ? 'animate-pulse' : ''}`}>
                        <span className={`animate-ping absolute inline-flex h-full w-full rounded-full ${isLive ? 'bg-green-400 opacity-75' : 'bg-primary opacity-50'}`}></span>
                        <span className={`relative inline-flex rounded-full h-3 w-3 ${isLive ? 'bg-green-500' : 'bg-primary'}`}></span>
                    </div>
                    <span className="text-sm font-medium text-muted-foreground">
                        {isLive ? 'Recibiendo datos...' : 'Conexión Realtime Activa'}
                    </span>
                </div>
            </div>

            {/* Grid de KPIs Principales */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                <KpiCard
                    title="Total Registrados"
                    value={stats.totalRegistrados}
                    badge={`Quórum: ${stats.quorumPercentage}%`}
                    badgeColor="text-blue-400"
                    icon={Users}
                    accent="from-blue-500/20 to-blue-600/5"
                    iconColor="text-blue-400"
                />
                <KpiCard
                    title="Asociados"
                    value={stats.asociados}
                    badge="Titulares"
                    badgeColor="text-indigo-400"
                    icon={UserCheck}
                    accent="from-indigo-500/20 to-indigo-600/5"
                    iconColor="text-indigo-400"
                />
                <KpiCard
                    title="Representantes"
                    value={stats.representantes}
                    badge="Delegados"
                    badgeColor="text-purple-400"
                    icon={BadgeCheck}
                    accent="from-purple-500/20 to-purple-600/5"
                    iconColor="text-purple-400"
                />

                <div
                    onClick={openFaltantesModal}
                    className="cursor-pointer relative bg-gradient-to-br from-orange-500/20 to-orange-600/5 bg-card/60 backdrop-blur-md border border-border/70 p-5 rounded-xl hover:border-orange-500/50 transition-all duration-300 overflow-hidden group flex flex-col justify-between"
                >
                    <div className="flex justify-between items-start gap-2">
                        <div className="min-w-0">
                            <p className="text-xs font-medium text-muted-foreground truncate">Faltantes Estimados</p>
                            <h3 className="text-3xl font-bold mt-1 tracking-tight">
                                {censoData.totalFaltantes > 0 ? censoData.totalFaltantes : Math.max(0, censoData.totalCenso - stats.totalRegistrados)}+
                            </h3>
                        </div>
                        <div className="p-2 rounded-lg bg-background/40 text-orange-400 shrink-0 group-hover:scale-110 transition-transform">
                            <ListX className="w-5 h-5" />
                        </div>
                    </div>
                    <div className="flex items-center gap-1.5 mt-3 text-xs font-medium text-orange-400">
                        <Search size={14} /> Ver lista filtrada
                    </div>
                </div>
            </div>

            {/* Fila de Gráficos y Actividad */}
            <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">

                {/* Gráfico de Quórum */}
                <div className="bg-card/40 backdrop-blur-sm border border-border rounded-xl p-6 lg:col-span-1 lg:row-span-2 flex flex-col items-center justify-start">
                    <h3 className="text-base font-semibold mb-4 flex items-center gap-2 self-start">
                        <PieChartIcon className="w-4 h-4 text-primary" />
                        Estado del Quórum
                    </h3>
                    <div className="flex flex-col items-center w-full">
                        <div className="w-full">
                            <QuorumDonut
                                enSala={stats.totalRegistrados}
                                faltantes={censoData.totalFaltantes > 0 ? censoData.totalFaltantes : Math.max(0, censoData.totalCenso - stats.totalRegistrados)}
                            />
                        </div>
                        <div className="mt-4 w-full space-y-2">
                            <div className="flex justify-between items-center text-sm bg-black/20 p-2 rounded-lg border border-white/5">
                                <span className="text-muted-foreground flex items-center gap-2">
                                    <div className="w-3 h-3 rounded-full" style={{ backgroundColor: COLORS[0] }}></div> En Sala
                                </span>
                                <span className="font-bold text-white">{stats.totalRegistrados}</span>
                            </div>
                            <div className="flex justify-between items-center text-sm bg-black/20 p-2 rounded-lg border border-white/5">
                                <span className="text-muted-foreground flex items-center gap-2">
                                    <div className="w-3 h-3 rounded-full" style={{ backgroundColor: COLORS[3] }}></div> Faltantes
                                </span>
                                <span className="font-bold text-white">{censoData.totalFaltantes > 0 ? censoData.totalFaltantes : Math.max(0, censoData.totalCenso - stats.totalRegistrados)}</span>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Gráfico de Encuestas */}
                <div className="bg-card/40 backdrop-blur-sm border border-border rounded-xl p-6 lg:col-span-1 lg:row-span-2">
                    <h3 className="text-base font-semibold mb-4 flex items-center gap-2">
                        <PieChartIcon className="w-4 h-4 text-primary" />
                        Resultados Última Encuesta
                    </h3>
                    {pollChartData ? (
                        <div className="flex flex-col items-center">
                            <p className="text-sm text-muted-foreground text-center mb-6 px-4 italic">"{pollChartData.pregunta}"</p>
                            <div className="h-[250px] w-full">
                                <ResponsiveContainer width="100%" height="100%">
                                    <PieChart>
                                        <Pie
                                            data={pollChartData.data}
                                            cx="50%"
                                            cy="50%"
                                            innerRadius={60}
                                            outerRadius={90}
                                            paddingAngle={5}
                                            dataKey="value"
                                            stroke="transparent"
                                        >
                                            {pollChartData.data.map((entry, index) => (
                                                <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                                            ))}
                                        </Pie>
                                        <Tooltip
                                            contentStyle={{ backgroundColor: 'rgba(0,0,0,0.8)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '8px' }}
                                            itemStyle={{ color: '#fff' }}
                                        />
                                        <Legend verticalAlign="bottom" height={36} />
                                    </PieChart>
                                </ResponsiveContainer>
                            </div>
                            <div className="mt-4 w-full space-y-2">
                                {pollChartData.data.map((entry, index) => (
                                    <div key={index} className="flex justify-between items-center text-sm bg-black/20 p-2 rounded-lg border border-white/5">
                                        <div className="flex items-center gap-2">
                                            <div className="w-3 h-3 rounded-full" style={{ backgroundColor: COLORS[index % COLORS.length] }}></div>
                                            <span className="text-muted-foreground">{entry.name}</span>
                                        </div>
                                        <span className="font-bold">{entry.value} votos</span>
                                    </div>
                                ))}
                            </div>
                        </div>
                    ) : (
                        <div className="h-64 flex flex-col items-center justify-center text-muted-foreground">
                            <BarChart3 className="w-12 h-12 mb-4 opacity-20" />
                            <p>No hay encuestas activas</p>
                        </div>
                    )}
                </div>

                {/* Tabla de Registros Recientes */}
                <div className="bg-card/60 backdrop-blur-sm border border-border/70 rounded-xl p-6 overflow-hidden flex flex-col lg:col-span-2">
                    <div className="flex items-center justify-between mb-4">
                        <h3 className="text-base font-semibold flex items-center gap-2">
                            <UserCheck className="w-4 h-4 text-primary" /> Últimos Ingresos Verificados
                        </h3>
                    </div>

                    <div className="flex-1 overflow-auto rounded-xl border border-white/5 bg-black/20 min-h-[300px]">
                        <table className="w-full text-sm text-left">
                            <thead className="text-xs text-muted-foreground uppercase bg-black/40 border-b border-white/5 sticky top-0">
                                <tr>
                                    <th className="px-6 py-4 font-medium">Nombre & Documento</th>
                                    <th className="px-6 py-4 font-medium">Calidad</th>
                                    <th className="px-6 py-4 font-medium text-right">Hora Ingreso</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-white/5">
                                {loading && stats.recentLogs.length === 0 ? (
                                    <tr><td colSpan="3" className="px-6 py-10 text-center text-muted-foreground">Cargando datos...</td></tr>
                                ) : stats.recentLogs.length === 0 ? (
                                    <tr><td colSpan="3" className="px-6 py-10 text-center text-muted-foreground">No hay registros hoy.</td></tr>
                                ) : (
                                    stats.recentLogs.map((log) => (
                                        <tr key={log.id} className="hover:bg-white/[0.04] transition-colors group">
                                            <td className="px-6 py-4">
                                                <div className="font-medium text-foreground">{log.nombre}</div>
                                                <div className="text-xs text-muted-foreground mt-0.5">CC. {log.documento}</div>
                                            </td>
                                            <td className="px-6 py-4">
                                                <span className={`inline-flex items-center px-2 py-1 rounded-md text-xs font-semibold ${log.rol === 'ASOCIADO' ? 'bg-indigo-500/15 text-indigo-400' : 'bg-purple-500/15 text-purple-400'
                                                    }`}>
                                                    {log.rol === 'ASOCIADO' ? 'Asociado Titular' : 'Representante'}
                                                </span>
                                            </td>
                                            <td className="px-6 py-4 text-right tabular-nums text-muted-foreground flex items-center justify-end gap-3">
                                                {new Date(log.created_at).toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                                                <button
                                                    onClick={() => handleDelete(log.id, log.nombre)}
                                                    className="p-1.5 opacity-0 group-hover:opacity-100 bg-red-500/10 text-red-500 hover:bg-red-500/30 hover:text-red-400 rounded-lg transition-all"
                                                    title="Eliminar registro"
                                                >
                                                    <Trash2 size={16} />
                                                </button>
                                            </td>
                                        </tr>
                                    ))
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>

                {/* Actividad en Tiempo Real del Bot */}
                <div className="bg-card/60 backdrop-blur-sm border border-border/70 rounded-xl p-6 lg:col-span-2">
                    <h3 className="text-base font-semibold mb-4 flex items-center gap-2">
                        <ActivityIcon className="w-4 h-4 text-primary animate-pulse" /> Actividad Bot Asamblea
                        <span className="ml-auto text-xs font-normal text-muted-foreground bg-muted px-2 py-0.5 rounded-full flex items-center gap-1">
                            Tiempo Real ⚡
                        </span>
                    </h3>

                    <div className="space-y-3 max-h-[250px] overflow-y-auto pr-2 custom-scrollbar">
                        {activityFeed.map((item) => {
                            const isOut = item.direction === "OUTGOING";
                            return (
                                <div key={item.id} className={`flex items-start gap-3 p-3 rounded-xl border border-white/5 transition-all ${isOut ? "bg-primary/5 ml-8" : "bg-black/20 mr-8"}`}>
                                    <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm shrink-0 ${isOut ? "bg-primary/20 text-primary" : "bg-white/10"}`}>
                                        {isOut ? "🤖" : "👤"}
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <div className="flex items-center gap-2 mb-1">
                                            <span className="font-medium text-sm text-foreground/90">
                                                {isOut ? "Bot Asamblea" : (item.provider_id || "Usuario")}
                                            </span>
                                            <span className="ml-auto text-[10px] text-muted-foreground">
                                                {formatDistanceToNow(new Date(item.created_at), { addSuffix: true, locale: es })}
                                            </span>
                                        </div>
                                        <p className="text-sm text-muted-foreground break-words leading-relaxed">
                                            {item.content || <span className="italic opacity-60">[{item.message_type}]</span>}
                                        </p>
                                    </div>
                                </div>
                            );
                        })}
                        {activityFeed.length === 0 && (
                            <div className="text-center py-8 text-muted-foreground text-sm">
                                Esperando interacciones... 📡
                            </div>
                        )}
                    </div>
                </div>
            </div>

            {/* Fila del Monitor de Quiz SARLAFT */}
            <div className="grid grid-cols-1 gap-6">
                <div className="bg-card/60 backdrop-blur-sm border border-border/70 rounded-xl p-6 overflow-hidden flex flex-col">
                    <div className="flex items-center justify-between mb-6">
                        <div>
                            <h3 className="text-lg font-bold flex items-center gap-2">
                                <BadgeCheck className="w-5 h-5 text-emerald-400" /> Monitor de Capacitación SARLAFT (En Vivo)
                            </h3>
                            <p className="text-xs text-muted-foreground">Seguimiento de respuestas de los 3 últimos bloques de preguntas enviados.</p>
                        </div>
                        <div className="flex items-center gap-4 text-xs font-medium">
                            <span className="flex items-center gap-1.5 text-emerald-400">
                                <div className="w-2 h-2 rounded-full bg-emerald-400"></div> Respondido
                            </span>
                            <span className="flex items-center gap-1.5 text-muted-foreground/60">
                                <div className="w-2 h-2 rounded-full bg-white/20"></div> Pendiente
                            </span>
                        </div>
                    </div>

                    <div className="overflow-x-auto rounded-xl border border-white/5 bg-black/20">
                        <table className="w-full text-xs text-left">
                            <thead className="text-[10px] text-muted-foreground uppercase bg-black/40 border-b border-white/5 sticky top-0">
                                <tr>
                                    <th className="px-6 py-4 font-bold border-r border-white/5 min-w-[200px]">Participante / Accionista</th>
                                    {quizAudit.polls.map((poll, idx) => (
                                        <th key={poll.id} className="px-6 py-4 font-bold text-center">
                                            <div className="truncate max-w-[200px] mx-auto" title={poll.pregunta}>
                                                P{quizAudit.polls.length - idx}: {poll.pregunta}
                                            </div>
                                        </th>
                                    ))}
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-white/5">
                                {quizAudit.participants.length === 0 ? (
                                    <tr><td colSpan={4} className="px-6 py-10 text-center text-muted-foreground italic">Esperando datos de participación...</td></tr>
                                ) : (
                                    quizAudit.participants.map((u, i) => (
                                        <tr key={u.user_phone} className="hover:bg-white/[0.04] transition-colors group">
                                            <td className="px-6 py-3 border-r border-white/5">
                                                <div className="font-semibold text-foreground truncate max-w-[190px]">{u.nombre}</div>
                                                <div className="text-[10px] opacity-60">CC. {u.documento}</div>
                                            </td>
                                            {quizAudit.polls.map(poll => {
                                                const answer = u.votes[poll.id];
                                                return (
                                                    <td key={poll.id} className="px-4 py-3 text-center">
                                                        {answer ? (
                                                            <div className="flex flex-col items-center gap-1">
                                                                <div className="w-6 h-6 rounded-full bg-emerald-500/20 flex items-center justify-center text-emerald-400 mb-1">
                                                                    <BadgeCheck size={14} />
                                                                </div>
                                                                <span className="text-[9px] font-bold text-emerald-400/90 leading-tight block truncate max-w-[120px]">
                                                                    {answer}
                                                                </span>
                                                            </div>
                                                        ) : (
                                                            <div className="flex flex-col items-center gap-1 opacity-20">
                                                                <div className="w-5 h-5 rounded-full border border-dashed border-white/40 flex items-center justify-center text-white/40 mb-1">
                                                                    <ActivityIcon size={10} />
                                                                </div>
                                                                <span className="text-[9px] font-medium italic">Esperando...</span>
                                                            </div>
                                                        )}
                                                    </td>
                                                );
                                            })}
                                        </tr>
                                    ))
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>

            {/* MODAL FALTANTES */}
            {isModalOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-background/80 backdrop-blur-sm animate-in fade-in duration-200">
                    <div className="bg-card w-full max-w-2xl rounded-2xl border border-white/10 shadow-2xl flex flex-col max-h-[85vh] overflow-hidden">

                        <div className="p-6 border-b border-white/5 flex justify-between items-center bg-black/20">
                            <div className="flex items-center gap-3">
                                <div className="p-2 rounded-lg bg-orange-500/10 text-orange-500">
                                    <ListX size={20} />
                                </div>
                                <div>
                                    <h2 className="text-lg font-bold text-foreground">Asociados Faltantes</h2>
                                    <p className="text-sm text-muted-foreground">Listado calculado desde SIISS en tiempo real.</p>
                                </div>
                            </div>
                            <button
                                onClick={() => setIsModalOpen(false)}
                                className="p-2 text-muted-foreground hover:text-white hover:bg-white/10 rounded-xl transition-colors"
                            >
                                <X size={20} />
                            </button>
                        </div>

                        <div className="p-4 border-b border-white/5 bg-black/10">
                            <div className="relative">
                                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" size={18} />
                                <input
                                    type="text"
                                    placeholder="Buscar por nombre o documento..."
                                    value={searchTerm}
                                    onChange={(e) => setSearchTerm(e.target.value)}
                                    className="w-full bg-black/20 border border-white/10 rounded-xl py-2.5 pl-10 pr-4 text-sm text-white focus:outline-none focus:ring-2 focus:ring-primary/50"
                                />
                            </div>
                        </div>

                        <div className="flex-1 overflow-y-auto p-4 custom-scrollbar">
                            {loadingFaltantes ? (
                                <div className="flex flex-col items-center justify-center py-20 text-muted-foreground animate-pulse">
                                    <ActivityIcon className="animate-spin mb-4 text-orange-500" size={32} />
                                    <p>Cruzando datos con SIISS en tiempo real...</p>
                                </div>
                            ) : faltantes.length === 0 ? (
                                <div className="text-center py-20 text-muted-foreground">
                                    <BadgeCheck size={48} className="mx-auto mb-4 text-emerald-500 opacity-50" />
                                    <p>¡Excelente! Al parecer todos han ingresado.</p>
                                </div>
                            ) : (
                                <div className="grid gap-2">
                                    <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wider px-2 mb-2 flex justify-between">
                                        <span>Resultados: {filteredFaltantes.length}</span>
                                        <span>Total pendientes: {faltantes.length}</span>
                                    </div>
                                    {filteredFaltantes.map((f, i) => (
                                        <div key={i} className="flex justify-between items-center p-3 rounded-xl bg-white/[0.02] border border-white/5 hover:bg-white/[0.04] transition-colors">
                                            <div className="flex items-center gap-3">
                                                <div className="w-8 h-8 rounded-full bg-orange-500/10 flex items-center justify-center text-orange-500 font-bold text-xs uppercase">
                                                    {f.nombre.substring(0, 2)}
                                                </div>
                                                <div>
                                                    <p className="text-sm font-medium text-foreground">{f.nombre}</p>
                                                    <p className="text-xs text-muted-foreground">CC. {f.documento}</p>
                                                </div>
                                            </div>
                                            <div className="px-3 py-1 rounded-full bg-black/40 text-[10px] uppercase font-bold text-muted-foreground border border-white/5">
                                                Faltante
                                            </div>
                                        </div>
                                    ))}
                                    {filteredFaltantes.length === 0 && (
                                        <div className="text-center py-10 text-muted-foreground">
                                            No se encontraron resultados para "{searchTerm}"
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
