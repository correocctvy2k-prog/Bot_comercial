import React, { useState, useEffect } from 'react';
import { Users, UserCheck, PhoneMissed, BadgeCheck, Activity as ActivityIcon, BarChart3, Wifi, WifiOff, ListX, X, Search, Trash2, MessageSquare, PieChart as PieChartIcon, RefreshCw } from 'lucide-react';
import { getAsambleaStats, subscribeToAsamblea, getFaltantesAsamblea, deleteAsambleaRecord, syncAsambleaPadron, clearQuizResults } from '../services/asamblea.service';
import { supabase } from '../services/supabase';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, Legend } from 'recharts';
import { formatDistanceToNow } from 'date-fns';
import { es } from 'date-fns/locale';
import { toast } from 'sonner';

export default function AsambleaDashboard() {
    // ─── SVG Premium Quorum Donut ─────────────────────────────────────────────
    function QuorumDonut({ enSala = 0, faltantes = 0, size = 200, strokeW = 16, r = 70, fontSize = 42, showLabels = true }) {
        const total = enSala + faltantes;
        const cx = size / 2;
        const cy = size / 2;

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
            <div className="relative flex items-center justify-center" style={{ width: size, height: size }}>
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
                            <text x={cx} y={cy + (fontSize / 4)} textAnchor="middle" fill="white" style={{ fontSize: fontSize, fontVariationSettings: '"wght" 900', fontWeight: 900, fontFamily: "inherit" }}>
                                {quorumPct}%
                            </text>
                            {showLabels && (
                                <text x={cx} y={cy + (fontSize / 4) + 22} textAnchor="middle" fill="#94a3b8" style={{ fontSize: 10, fontWeight: 600, fontFamily: "inherit", textTransform: "uppercase", letterSpacing: "0.1em" }}>
                                    Quórum
                                </text>
                            )}
                        </g>
                    )}
                </svg>
            </div>
        );
    }

    const [loading, setLoading] = useState(true);
    const [isSyncing, setIsSyncing] = useState(false);
    const [stats, setStats] = useState({
        totalRegistrados: 0,
        asociados: 0,
        representantes: 0,
        quorumPercentage: 0,
        syncOk: 0,
        syncFailed: 0,
        recentLogs: []
    });
    const [isLive, setIsLive] = useState(false);
    const [censoData, setCensoData] = useState({ totalCenso: 0, totalFaltantes: 0 });

    const [activityFeed, setActivityFeed] = useState([]);
    const [pollCharts, setPollCharts] = useState([]);
    const [quizAudit, setQuizAudit] = useState({ polls: [], participants: [], globalStats: { correct: 0, incorrect: 0, pending: 0 } });

    // Helper para validar respuestas SARLAFT (1=C, 2=A, 3=C)
    const isCorrectAnswer = (question, answer) => {
        if (!answer) return null;
        const q = question.toLowerCase();
        if (q.includes("inusual") && answer.startsWith("C.")) return true;
        if (q.includes("alerta") && answer.startsWith("A.")) return true;
        if (q.includes("sarlaft") && answer.startsWith("C.")) return true;
        return false;
    };

    // Modal de Faltantes
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [faltantes, setFaltantes] = useState([]);
    const [loadingFaltantes, setLoadingFaltantes] = useState(false);
    const [searchTerm, setSearchTerm] = useState('');

    // ─── Granular Fetchers ──────────────────────────────────────────────────
    
    const fetchCensoAndStats = async () => {
        try {
            const res = await getFaltantesAsamblea();
            if (res && res.totalCenso) {
                setCensoData(res);
                const data = await getAsambleaStats(res.totalCenso);
                if (data) setStats(data);
            }
        } catch (err) {
            console.error("Error fetching censo/stats:", err);
        }
    };

    const fetchActivityFeed = async () => {
        const { data: feed } = await supabase
            .from('interactions_log')
            .select('*')
            .eq('channel_id', 'bot_asamblea_main')
            .order('created_at', { ascending: false })
            .limit(10);
        if (feed) setActivityFeed(feed);
    };

    const fetchPolls = async () => {
        // Obtenemos un historial más largo para poder agrupar (v3.9)
        const { data: allRecent } = await supabase
            .from('asamblea_encuestas')
            .select('*')
            .order('created_at', { ascending: false })
            .limit(50);

        if (allRecent && allRecent.length > 0) {
            // Agrupar por texto de pregunta para identificar las 3 preguntas distintas más recientes
            const uniqueQuestionsMap = new Map();
            allRecent.forEach(p => {
                if (!uniqueQuestionsMap.has(p.pregunta)) {
                    uniqueQuestionsMap.set(p.pregunta, {
                        latestId: p.id,
                        pregunta: p.pregunta,
                        opciones: p.opciones,
                        allIds: [p.id]
                    });
                } else {
                    uniqueQuestionsMap.get(p.pregunta).allIds.push(p.id);
                }
            });

            // Tomamos las 3 preguntas únicas más recientes
            const top3Questions = Array.from(uniqueQuestionsMap.values()).slice(0, 3);

            const chartDataArray = await Promise.all(top3Questions.map(async (qGroup) => {
                // Consultamos votos para TODOS los IDs que tengan esta misma pregunta
                const { data: votos } = await supabase
                    .from('asamblea_votos')
                    .select('opcion_texto')
                    .in('encuesta_id', qGroup.allIds);

                const counts = {};
                qGroup.opciones.forEach(o => counts[o] = 0);
                if (votos) {
                    votos.forEach(v => {
                        if (counts[v.opcion_texto] !== undefined) counts[v.opcion_texto]++;
                    });
                }
                const chartData = Object.keys(counts).map(key => ({ name: key, value: counts[key] }));
                return { id: qGroup.latestId, pregunta: qGroup.pregunta, data: chartData };
            }));

            setPollCharts(chartDataArray.reverse());
        } else {
            setPollCharts([]);
        }
    };

    const fetchQuizAudit = async () => {
        const { data: allRecent } = await supabase
            .from('asamblea_encuestas')
            .select('*')
            .order('created_at', { ascending: false })
            .limit(50);

        if (allRecent && allRecent.length > 0) {
            // Identificar el set de IDs para las 3 preguntas únicas más recientes
            const uniqueQuestionsMap = new Map();
            allRecent.forEach(p => {
                if (!uniqueQuestionsMap.has(p.pregunta)) {
                    uniqueQuestionsMap.set(p.pregunta, {
                        ...p,
                        allIds: [p.id]
                    });
                } else {
                    uniqueQuestionsMap.get(p.pregunta).allIds.push(p.id);
                }
            });

            const top3Questions = Array.from(uniqueQuestionsMap.values()).slice(0, 3);
            const allRelatedPollIds = top3Questions.flatMap(q => q.allIds);

            const { data: allVotes } = await supabase
                .from('asamblea_votos')
                .select('*')
                .in('encuesta_id', allRelatedPollIds);

            const { data: allRegistered } = await supabase
                .from('asamblea_registro')
                .select('user_phone, nombre, documento');

            if (allRegistered) {
                let globalCorrect = 0;
                let globalIncorrect = 0;
                let globalPending = 0;

                const auditData = allRegistered.map(user => {
                    const userVotesByQuestion = {}; // Usaremos la pregunta como llave para la tabla de auditoría

                    top3Questions.forEach(qGroup => {
                        // Buscar si el usuario votó en CUALQUIERA de los IDs asociados a esta pregunta
                        const v = allVotes?.find(vote => 
                            qGroup.allIds.includes(vote.encuesta_id) && 
                            vote.user_phone === user.user_phone
                        );
                        
                        const ans = v ? v.opcion_texto : null;
                        userVotesByQuestion[qGroup.id] = ans; // Mantenemos el ID "representativo" para la UI

                        if (ans) {
                            if (isCorrectAnswer(qGroup.pregunta, ans)) globalCorrect++;
                            else globalIncorrect++;
                        } else {
                            globalPending++;
                        }
                    });
                    return { ...user, votes: userVotesByQuestion };
                });

                setQuizAudit({ 
                    polls: top3Questions, 
                    participants: auditData,
                    globalStats: { correct: globalCorrect, incorrect: globalIncorrect, pending: globalPending }
                });
            }
        } else {
            setQuizAudit({ polls: [], participants: [], globalStats: { correct: 0, incorrect: 0, pending: 0 } });
        }
    };

    const loadData = async () => {
        setLoading(true);
        await Promise.all([
            fetchCensoAndStats(),
            fetchActivityFeed(),
            fetchPolls(),
            fetchQuizAudit()
        ]);
        setLoading(false);
    };

    const handleSyncPadron = async () => {
        setIsSyncing(true);
        const result = await syncAsambleaPadron();
        if (result && result.success) {
            toast.success(`Sincronización exitosa: ${result.count} registros actualizados`);
            await fetchCensoAndStats(); // Recargar el censo para ver el impacto
        } else {
            toast.error("Error al sincronizar con SIISS");
        }
        setIsSyncing(false);
    };

    const handleResetQuiz = async () => {
        if (window.confirm("¿Estás seguro de que deseas borrar TODOS los resultados del quiz? Esta acción no se puede deshacer.")) {
            setIsSyncing(true);
            const result = await clearQuizResults();
            if (result && result.success) {
                toast.success("Resultados del quiz eliminados correctamente");
                // Los datos se actualizarán automáticamente vía Realtime si está habilitado,
                // Pero forzamos una recarga para estar seguros.
                await fetchPolls();
                await fetchQuizAudit();
            } else {
                toast.error("Error al reiniciar el quiz");
            }
            setIsSyncing(false);
        }
    };

    useEffect(() => {
        loadData();

        console.log("🚀 [RT] Iniciando subscripciones en tiempo real...");

        const channel = supabase.channel('asamblea-changes')
            .on('postgres_changes', { event: '*', schema: 'public', table: 'asamblea_registro' }, (payload) => {
                console.log("📥 [RT] Cambio en asamblea_registro:", payload.eventType);
                setIsLive(true);
                setTimeout(() => setIsLive(false), 2000);
                fetchCensoAndStats(); // Solo recargamos stats y censo
                fetchQuizAudit(); // El audit depende de quién está registrado
            })
            .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'interactions_log', filter: 'channel_id=eq.bot_asamblea_main' }, (payload) => {
                console.log("📥 [RT] Nueva interacción:", payload.new.id);
                // Granular state update: agregamos al inicio del feed
                setActivityFeed(prev => [payload.new, ...prev].slice(0, 15));
            })
            .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'asamblea_votos' }, (payload) => {
                console.log("📥 [RT] Nuevo voto recibido:", payload.new.encuesta_id);
                // Optimización: en lugar de fetchPolls, podríamos actualizar localmente
                // Pero como asamblea_votos no tiene el texto de la opción si solo viene el payload (a veces),
                // o si queremos asegurar consistencia, fetchPolls es más seguro y menos pesado que loadData completa.
                fetchPolls();
                fetchQuizAudit();
            })
            .subscribe((status) => {
                console.log("📡 [RT] Estado de subscripción:", status);
                if (status === 'SUBSCRIBED') {
                    toast.success('Conexión Realtime Establecida');
                } else if (status === 'CHANNEL_ERROR') {
                    console.error("❌ [RT] Error en el canal Realtime. Verifica habilitación en Supabase.");
                    toast.error('Error de conexión Realtime');
                }
            });

        return () => {
            console.log("🔌 [RT] Desconectando subscripciones...");
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
        try {
            const data = await getFaltantesAsamblea();
            if (data && data.faltantes) {
                setFaltantes(data.faltantes);
                setCensoData(data);
            } else {
                // Si la API falla o no devuelve datos, limpiamos la lista
                setFaltantes([]);
                toast.error("No se pudo obtener la lista de faltantes desde SIISS");
            }
        } catch (err) {
            console.error(err);
            setFaltantes([]);
            toast.error("Error de conexión con el servidor de asamblea");
        } finally {
            setLoadingFaltantes(false);
        }
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
                <div className="flex flex-col md:flex-row items-center gap-6">
                    <div className="flex items-center gap-4">
                        <QuorumDonut 
                            enSala={stats.totalRegistrados} 
                            faltantes={censoData.totalFaltantes > 0 ? censoData.totalFaltantes : Math.max(0, censoData.totalCenso - stats.totalRegistrados)}
                            size={70}
                            r={26}
                            strokeW={6}
                            fontSize={18}
                            showLabels={false}
                        />
                        <div>
                            <div className="flex items-center gap-3 mb-1">
                                <Users className="text-primary h-6 w-6" />
                                <h1 className="text-2xl font-bold tracking-tight text-foreground">Asamblea General 2026</h1>
                            </div>
                            <p className="text-muted-foreground text-[11px] leading-tight max-w-sm">Dashboard oficial de control de asistencia, quórum y encuestas en tiempo real.</p>
                        </div>
                    </div>

                    <button
                        onClick={handleSyncPadron}
                        disabled={isSyncing}
                        className={`group flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold transition-all shadow-lg
                            ${isSyncing 
                                ? 'bg-white/5 text-muted-foreground cursor-not-allowed' 
                                : 'bg-primary/10 text-primary hover:bg-primary/20 border border-primary/20 hover:border-primary/40'
                            }`}
                        title="Sincronizar base de datos con SIISS"
                    >
                        <RefreshCw className={`w-4 h-4 ${isSyncing ? 'animate-spin' : ''}`} />
                        <span>{isSyncing ? 'Sincronizando...' : 'Sincronizar SIISS'}</span>
                    </button>
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
                                {censoData.totalCenso > 0 
                                    ? (censoData.totalFaltantes > 0 ? censoData.totalFaltantes : Math.max(0, censoData.totalCenso - stats.totalRegistrados)) 
                                    : '--'}+
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

                {/* Gráfico de Encuestas (Quiz Results) - AHORA TOMA 2 COLUMNAS PORQUE QUITARON QUORUM */}
                <div className="bg-card/40 backdrop-blur-sm border border-border rounded-xl p-6 lg:col-span-2 lg:row-span-2 flex flex-col h-[700px]">
                    <div className="flex items-center justify-between mb-4">
                        <h3 className="text-base font-semibold flex items-center gap-2">
                            <PieChartIcon className="w-4 h-4 text-primary" />
                            Resultados del Quiz SARLAFT
                        </h3>
                        <button
                            onClick={handleResetQuiz}
                            disabled={isSyncing}
                            className="text-[10px] uppercase font-bold tracking-wider px-3 py-1.5 rounded-lg border border-red-500/20 text-red-400 hover:bg-red-500/10 transition-all flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                            title="Borrar todos los votos y preguntas actuales"
                        >
                            <Trash2 size={12} />
                            Reiniciar Quiz
                        </button>
                    </div>
                    
                    <div className="flex-1 overflow-y-auto pr-2 custom-scrollbar space-y-12">
                        {pollCharts.length > 0 ? (
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                                {pollCharts.map((poll, pIdx) => (
                                    <div key={poll.id} className="flex flex-col items-center border-b md:border-b-0 md:border-r border-white/5 pb-8 md:pb-0 md:pr-8 last:border-0 last:pr-0">
                                        <div className="flex items-center gap-2 mb-2">
                                            <span className="bg-primary/20 text-primary text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wider">Pregunta {pIdx + 1}</span>
                                        </div>
                                        <p className="text-sm text-muted-foreground text-center mb-6 px-4 italic leading-tight h-10 flex items-center">"{poll.pregunta}"</p>
                                        
                                        <div className="h-[200px] w-full relative">
                                            <ResponsiveContainer width="100%" height="100%">
                                                <PieChart>
                                                    <Pie
                                                        data={poll.data}
                                                        cx="50%"
                                                        cy="50%"
                                                        innerRadius={50}
                                                        outerRadius={75}
                                                        paddingAngle={6}
                                                        dataKey="value"
                                                        stroke="transparent"
                                                        animationBegin={0}
                                                        animationDuration={1000}
                                                    >
                                                        {poll.data.map((entry, index) => (
                                                            <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                                                        ))}
                                                    </Pie>
                                                    <Tooltip
                                                        contentStyle={{ backgroundColor: 'rgba(0,0,0,0.85)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '12px', backdropFilter: 'blur(8px)' }}
                                                        itemStyle={{ color: '#fff' }}
                                                        cursor={{ fill: 'transparent' }}
                                                    />
                                                </PieChart>
                                            </ResponsiveContainer>
                                            <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                                                <span className="text-xl font-bold text-foreground">
                                                    {poll.data.reduce((acc, curr) => acc + curr.value, 0)}
                                                </span>
                                                <span className="text-[10px] text-muted-foreground">Votos</span>
                                            </div>
                                        </div>
                                        
                                        <div className="mt-4 w-full space-y-2">
                                            {(() => {
                                                const total = poll.data.reduce((acc, curr) => acc + curr.value, 0);
                                                return poll.data.map((entry, index) => {
                                                    const percent = total > 0 ? (entry.value / total) * 100 : 0;
                                                    const color = COLORS[index % COLORS.length];
                                                    return (
                                                        <div key={index} className="relative group">
                                                            <div className="flex justify-between items-center text-xs p-2.5 rounded-lg border border-white/5 bg-black/40 relative z-10 transition-all group-hover:border-white/10 overflow-hidden">
                                                                <div 
                                                                    className="absolute inset-0 opacity-[0.08] transition-all duration-1000" 
                                                                    style={{ backgroundColor: color, width: `${percent}%` }}
                                                                />
                                                                <div className="flex items-center gap-2 relative z-20">
                                                                    <div className="w-2 h-2 rounded-full" style={{ backgroundColor: color }}></div>
                                                                    <span className="text-foreground/90 font-medium truncate max-w-[150px]">{entry.name}</span>
                                                                </div>
                                                                <div className="flex flex-col items-end relative z-20">
                                                                    <span className="font-bold text-white">{entry.value}</span>
                                                                    <span className="text-[9px] text-muted-foreground">{percent.toFixed(0)}%</span>
                                                                </div>
                                                            </div>
                                                        </div>
                                                    );
                                                });
                                            })()}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        ) : (
                            <div className="h-64 flex flex-col items-center justify-center text-muted-foreground">
                                <BarChart3 className="w-12 h-12 mb-4 opacity-20" />
                                <p>No hay encuestas activas</p>
                            </div>
                        )}
                    </div>
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
                    <div className="flex flex-col md:flex-row items-center justify-between mb-6 gap-4">
                        <div>
                            <h3 className="text-lg font-bold flex items-center gap-2">
                                <BadgeCheck className="w-5 h-5 text-emerald-400" /> Monitor de Capacitación SARLAFT (En Vivo)
                            </h3>
                            <p className="text-xs text-muted-foreground">Analítica de efectividad y seguimiento de respuestas en tiempo real.</p>
                        </div>
                        
                        {/* Barra de Accuracy Global */}
                        <div className="flex-1 max-w-md w-full bg-black/40 border border-white/5 p-3 rounded-2xl">
                            <div className="flex justify-between text-[10px] font-bold uppercase tracking-wider mb-2 px-1">
                                <span className="text-emerald-400">Correctas ({quizAudit.globalStats.correct})</span>
                                <span className="text-red-400">Incorrectas ({quizAudit.globalStats.incorrect})</span>
                            </div>
                            <div className="h-2.5 w-full bg-white/5 rounded-full overflow-hidden flex">
                                {quizAudit.globalStats.correct + quizAudit.globalStats.incorrect > 0 ? (
                                    <>
                                        <div 
                                            className="h-full bg-emerald-500 shadow-[0_0_10px_rgba(16,185,129,0.5)] transition-all duration-1000" 
                                            style={{ width: `${(quizAudit.globalStats.correct / (quizAudit.globalStats.correct + quizAudit.globalStats.incorrect)) * 100}%` }}
                                        />
                                        <div 
                                            className="h-full bg-red-500 shadow-[0_0_10px_rgba(239,68,68,0.5)] transition-all duration-1000" 
                                            style={{ width: `${(quizAudit.globalStats.incorrect / (quizAudit.globalStats.correct + quizAudit.globalStats.incorrect)) * 100}%` }}
                                        />
                                    </>
                                ) : (
                                    <div className="h-full w-full bg-white/10 animate-pulse" />
                                )}
                            </div>
                        </div>
                    </div>

                    <div className="overflow-x-auto rounded-xl border border-white/5 bg-black/20">
                        <table className="w-full text-xs text-left">
                            <thead className="text-[10px] text-muted-foreground uppercase bg-black/40 border-b border-white/5 sticky top-0">
                                <tr>
                                    <th className="px-6 py-4 font-bold border-r border-white/5 min-w-[220px]">Participante / Accionista</th>
                                    {quizAudit.polls.map((poll, idx) => (
                                        <th key={poll.id} className="px-6 py-4 font-bold text-center border-r border-white/5">
                                            <div className="truncate max-w-[180px] mx-auto opacity-80" title={poll.pregunta}>
                                                P{quizAudit.polls.length - idx}: {poll.pregunta}
                                            </div>
                                        </th>
                                    ))}
                                    <th className="px-4 py-4 font-bold text-center">Score</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-white/5">
                                {quizAudit.participants.length === 0 ? (
                                    <tr><td colSpan={quizAudit.polls.length + 2} className="px-6 py-10 text-center text-muted-foreground italic">Esperando datos de participación...</td></tr>
                                ) : (
                                    quizAudit.participants.map((u, i) => {
                                        let userCorrect = 0;
                                        let userAnswered = 0;
                                        return (
                                            <tr key={u.user_phone} className="hover:bg-white/[0.04] transition-colors group">
                                                <td className="px-6 py-3 border-r border-white/5">
                                                    <div className="font-semibold text-foreground truncate max-w-[200px]">{u.nombre}</div>
                                                    <div className="text-[10px] opacity-60 tabular-nums">CC. {u.documento}</div>
                                                </td>
                                                {quizAudit.polls.map(poll => {
                                                    const answer = u.votes[poll.id];
                                                    const isCorrect = isCorrectAnswer(poll.pregunta, answer);
                                                    if (answer) {
                                                        userAnswered++;
                                                        if (isCorrect) userCorrect++;
                                                    }
                                                    return (
                                                        <td key={poll.id} className="px-4 py-2 border-r border-white/5">
                                                            {answer ? (
                                                                <div className={`flex flex-col items-center p-1.5 rounded-lg border transition-all ${
                                                                    isCorrect 
                                                                    ? "bg-emerald-500/10 border-emerald-500/20 text-emerald-400" 
                                                                    : "bg-red-500/10 border-red-500/20 text-red-400"
                                                                }`}>
                                                                    <div className="flex items-center gap-1.5 mb-0.5">
                                                                        {isCorrect ? <UserCheck size={12} /> : <X size={12} />}
                                                                        <span className="text-[9px] font-black uppercase tracking-tighter">
                                                                            {isCorrect ? "Correcto" : "Incorrecto"}
                                                                        </span>
                                                                    </div>
                                                                    <span className="text-[10px] font-medium leading-tight truncate max-w-[140px] opacity-90">
                                                                        {answer}
                                                                    </span>
                                                                </div>
                                                            ) : (
                                                                <div className="flex items-center justify-center gap-2 opacity-20 py-2">
                                                                    <div className="w-1.5 h-1.5 rounded-full bg-white/40 animate-pulse" />
                                                                    <span className="text-[9px] font-medium italic">Pendiente</span>
                                                                </div>
                                                            )}
                                                        </td>
                                                    );
                                                })}
                                                <td className="px-4 py-3 text-center">
                                                    <div className="flex flex-col items-center">
                                                        <div className={`text-sm font-black ${userAnswered === 0 ? "text-muted-foreground/40" : userCorrect === quizAudit.polls.length ? "text-emerald-400" : "text-orange-400"}`}>
                                                            {userCorrect}/{quizAudit.polls.length}
                                                        </div>
                                                        <div className="w-12 h-1 bg-white/5 rounded-full mt-1 overflow-hidden">
                                                            <div 
                                                                className={`h-full transition-all duration-500 ${userCorrect === quizAudit.polls.length ? "bg-emerald-500" : "bg-orange-500"}`}
                                                                style={{ width: `${(userCorrect / quizAudit.polls.length) * 100}%` }}
                                                            />
                                                        </div>
                                                    </div>
                                                </td>
                                            </tr>
                                        );
                                    })
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
                                    {censoData.totalFaltantes === 0 && !loadingFaltantes ? (
                                        <>
                                            <BadgeCheck size={48} className="mx-auto mb-4 text-emerald-500 opacity-50" />
                                            <p>¡Excelente! Al parecer todos han ingresado.</p>
                                        </>
                                    ) : (
                                        <>
                                            <WifiOff size={48} className="mx-auto mb-4 text-red-500 opacity-50" />
                                            <p>No se pudo cargar la información detallada.</p>
                                            <p className="text-xs mt-2 uppercase">Verifica la conexión con la API de SIISS</p>
                                        </>
                                    )}
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
