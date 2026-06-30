import { useState, useEffect, useMemo, useContext, useRef } from "react";
import { 
  Server, 
  Activity, 
  HardDrive, 
  Database, 
  RefreshCw, 
  Edit, 
  Plus, 
  Trash2, 
  ChevronUp, 
  ChevronDown, 
  CheckCircle2, 
  AlertTriangle, 
  XCircle, 
  Info, 
  Terminal, 
  Cpu, 
  Layers, 
  Tag, 
  X,
  Loader2,
  Lock,
  ExternalLink,
  Cable,
  Clock,
  WifiOff,
  ShieldCheck,
  Bell,
  TrendingUp
} from "lucide-react";
import { ResponsiveContainer, AreaChart, Area, Tooltip, LineChart, Line, XAxis, YAxis, CartesianGrid, Legend } from "recharts";
import { toast } from "sonner";
import { servicesTIService } from "@/services/servicesTI.service";
import SkylabBot from "@/components/SkylabBot";
import { PageHeaderContext } from "@/layout/Layout";

const formatUptimeDays = (raw) => {
  if (!raw) return "N/A";
  const text = String(raw);
  const dayMatch = text.match(/up\s+(\d+)\s+days?/i) || text.match(/(\d+)\s+days?/i);
  if (dayMatch) return `${Number(dayMatch[1])} días`;
  const hourMatch = text.match(/up\s+(\d+):(\d+)/i);
  if (hourMatch) return "0 días";
  const minMatch = text.match(/up\s+(\d+)\s+min/i);
  if (minMatch) return "0 días";
  return text.length > 18 ? text.slice(0, 18) : text;
};

const formatContainerUptime = (statusText = "") => {
  const text = String(statusText);
  const dayMatch = text.match(/Up\s+(\d+)\s+days?/i);
  if (dayMatch) return `${Number(dayMatch[1])} días`;
  if (/Up\s+About an hour/i.test(text) || /Up\s+\d+\s+hours?/i.test(text)) return "0 días";
  if (/Up\s+\d+\s+minutes?/i.test(text) || /Up\s+Less than/i.test(text)) return "0 días";
  return text || "N/A";
};
// Helper to mask IP addresses for privacy
const maskHost = (host) => {
  if (!host) return "";
  const ipRegex = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/;
  if (ipRegex.test(host)) {
    return host.replace(ipRegex, "$1.***.***.$4");
  }
  if (host.length > 8) {
    return host.slice(0, 4) + "..." + host.slice(-3);
  }
  return host;
};


const alertToneClass = (severity) => {
  if (severity === "critical" || severity === "high") return "bg-rose-500/10 border-rose-500/20 text-rose-400";
  if (severity === "medium") return "bg-amber-500/10 border-amber-500/20 text-amber-400";
  return "bg-sky-500/10 border-sky-500/20 text-sky-400";
};

const MiniStat = ({ icon, label, value, color = "text-foreground" }) => (
  <div className="min-w-0 rounded-md border border-border/40 bg-background/35 px-2.5 py-2 shadow-sm">
    <p className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-muted-foreground [&_svg]:h-4 [&_svg]:w-4">
      {icon}
      {label}
    </p>
    <p className={`mt-1 truncate text-xs font-bold ${color}`}>{value}</p>
  </div>
);

const HealthBadge = ({ label, ok, warn }) => {
  const cls = ok
    ? "border-emerald-500/20 bg-emerald-500/10 text-emerald-400"
    : warn
      ? "border-amber-500/20 bg-amber-500/10 text-amber-400"
      : "border-rose-500/20 bg-rose-500/10 text-rose-400";

  return (
    <span className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide ${cls}`}>
      {ok ? <CheckCircle2 className="h-3.5 w-3.5" /> : <WifiOff className="h-3.5 w-3.5" />}
      {label}
    </span>
  );
};

const CircleGauge = ({ label, value }) => {
  const isAvailable = value !== null && value !== undefined && !Number.isNaN(Number(value));
  const val = isAvailable ? Math.round(Number(value)) : 0;
  const displayVal = isAvailable ? `${val}%` : "N/D";
  
  let colorClass = "stroke-emerald-400";
  let glowClass = "drop-shadow-[0_0_8px_rgba(52,211,153,0.5)]";
  if (val >= 90) {
    colorClass = "stroke-rose-500";
    glowClass = "drop-shadow-[0_0_8px_rgba(244,63,94,0.6)]";
  } else if (val >= 75) {
    colorClass = "stroke-amber-400";
    glowClass = "drop-shadow-[0_0_8px_rgba(251,191,36,0.5)]";
  }

  const radius = 22;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference - (val / 100) * circumference;

  return (
    <div className="flex flex-col items-center justify-center p-2 rounded-xl bg-background/55 border border-border/35 flex-1 min-w-[65px] shadow-sm">
      <div className="relative w-11 h-11 flex items-center justify-center">
        <svg className="w-full h-full transform -rotate-90" viewBox="0 0 56 56">
          <circle 
            className="stroke-muted-foreground/15" 
            cx="28" 
            cy="28" 
            r={radius} 
            strokeWidth="3.5" 
            fill="transparent" 
          />
          <circle 
            className={`${colorClass} ${glowClass} transition-all duration-700`} 
            cx="28" 
            cy="28" 
            r={radius} 
            strokeWidth="3.5" 
            fill="transparent" 
            strokeDasharray={circumference}
            strokeDashoffset={isAvailable ? strokeDashoffset : circumference}
            strokeLinecap="round"
          />
        </svg>
        <span className="absolute text-[10px] font-black text-foreground">{displayVal}</span>
      </div>
      <span className="mt-1 text-[8px] font-black uppercase tracking-wider text-muted-foreground text-center truncate w-full">{label}</span>
    </div>
  );
};


// ---- Skylab Notification Component ----
const SkylabNotification = ({ notification, visible, onClose }) => {
  if (!notification) return null;

  const toneConfig = {
    success: {
      badge: "border-emerald-400/35 bg-emerald-400/10 text-emerald-300",
      dot: "bg-emerald-400",
      rail: "from-emerald-400/80 via-yellow-300/70 to-transparent"
    },
    info: {
      badge: "border-sky-400/35 bg-sky-400/10 text-sky-300",
      dot: "bg-sky-400",
      rail: "from-sky-400/80 via-yellow-300/70 to-transparent"
    },
    warning: {
      badge: "border-yellow-300/45 bg-yellow-300/10 text-yellow-200",
      dot: "bg-yellow-300",
      rail: "from-yellow-300/90 via-amber-400/70 to-transparent"
    },
    critical: {
      badge: "border-rose-400/45 bg-rose-500/10 text-rose-200",
      dot: "bg-rose-400",
      rail: "from-rose-400/90 via-yellow-300/70 to-transparent"
    }
  };
  const currentTone = toneConfig[notification.tone] || toneConfig.info;

  const badgeLabel = {
    success: "En linea",
    info: "Observacion",
    warning: "Atencion",
    critical: "Alerta Critica"
  }[notification.tone] || "Informacion";

  return (
    <div
      className={`fixed bottom-6 right-6 z-[999] w-[min(440px,calc(100vw-2rem))] transition-all duration-700 ease-out ${
        visible ? "translate-y-0 opacity-100" : "translate-y-5 opacity-0 pointer-events-none"
      }`}
    >
      <div className="relative overflow-hidden rounded-xl border border-yellow-300/20 bg-[#07101d]/95 p-4 shadow-2xl shadow-black/40 backdrop-blur-xl">
        <div className={`absolute inset-x-0 top-0 h-0.5 bg-gradient-to-r ${currentTone.rail}`} />
        <div className="flex items-start gap-3.5">
          <div className="relative mt-0.5 shrink-0 rounded-xl border border-slate-700/80 bg-slate-950/70 p-2.5 text-blue-400">
            <SkylabBot size={34} className="text-blue-400" />
            <span className={`absolute -right-1 -top-1 h-2.5 w-2.5 rounded-full border border-[#07101d] ${currentTone.dot} animate-pulse`} />
          </div>
          <div className="min-w-0 flex-1">
            <div className="mb-2 flex items-start justify-between gap-3">
              <div className="min-w-0">
                <span className="block text-[10px] font-black uppercase tracking-[0.18em] text-yellow-200/80">Skylab Monitor</span>
                <span className={`mt-1 inline-flex rounded-full border px-2.5 py-0.5 text-[10px] font-black uppercase tracking-wider ${currentTone.badge}`}>
                  {badgeLabel}
                </span>
              </div>
              <button
                type="button"
                onClick={onClose}
                className="rounded-md p-1 text-slate-500 transition-colors hover:bg-white/10 hover:text-slate-100"
              >
                <XCircle className="h-4 w-4" />
              </button>
            </div>
            <h3 className="text-[15px] font-black leading-snug text-slate-50">{notification.title}</h3>
            <p className="mt-1.5 text-[12px] leading-5 text-slate-300">{notification.body}</p>
            {notification.actions && notification.actions.length > 0 && (
              <div className="mt-3 space-y-1.5 border-t border-yellow-300/10 pt-2.5">
                {notification.actions.map((action, idx) => (
                  <p key={idx} className="flex items-start gap-2 text-[11px] font-semibold leading-4 text-slate-400">
                    <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-yellow-300/80" />
                    {action}
                  </p>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default function ServicesTIDashboard() {
  const setPageHeader = useContext(PageHeaderContext);

  const [state, setState] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [lastUpdate, setLastUpdate] = useState(null);

  const [activeTabs, setActiveTabs] = useState({});
  const [diskSorts, setDiskSorts] = useState({});
  const [expandedCards, setExpandedCards] = useState({});
  const [history, setHistory] = useState({});
  const [isAlertDropdownOpen, setIsAlertDropdownOpen] = useState(false);
  const [isGlobalChartOpen, setIsGlobalChartOpen] = useState(true);

  const [skylabNotification, setSkylabNotification] = useState(null);
  const [skylabNotifVisible, setSkylabNotifVisible] = useState(false);
  const prevStatusesRef = useRef({});
  const prevAlertsRef = useRef([]);
  const lastNotificationTimeRef = useRef(0);
  const [rankChanges, setRankChanges] = useState({});
  const lastRankOrderRef = useRef([]);

  const [layoutOrder, setLayoutOrder] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem("skylab.nodeMonitor.layout.v2") || "[]");
    } catch {
      return [];
    }
  });

  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [selectedTarget, setSelectedTarget] = useState(null);
  const [isAnalysisModalOpen, setIsAnalysisModalOpen] = useState(false);
  const [analysisData, setAnalysisData] = useState(null);
  const [loadingAnalysis, setLoadingAnalysis] = useState(false);

  const [formFields, setFormFields] = useState({
    name: "",
    host: "",
    port: 22,
    type: "linux",
    username: "",
    password: "",
    tags: "",
    enabled: true
  });

  const loadState = async (showFeedback = false) => {
    if (showFeedback) setRefreshing(true);
    try {
      const dashboardState = await servicesTIService.getDashboardState();
      setState(dashboardState);
      setLastUpdate(new Date());

      // Status Change popup notifications (Toasts)
      dashboardState.targets.forEach(target => {
        const id = target.id;
        const currentStatus = target.result?.status || (target.enabled ? "unknown" : "paused");
        const prevStatus = prevStatusesRef.current[id];

        if (prevStatus && prevStatus !== currentStatus && target.enabled) {
          if (currentStatus === "offline") {
            setSkylabNotification({ tone: "critical", title: `${target.name} — Sin respuesta`, body: `${target.host} no responde al barrido de red SSH/TCP. Verificar conectividad.`, actions: ["Verificar estado de red y firewall", "Revisar logs del servidor"] });
            setSkylabNotifVisible(true);
            setTimeout(() => setSkylabNotifVisible(false), 8000);
          } else if (currentStatus === "online" && prevStatus === "offline") {
            setSkylabNotification({ tone: "success", title: `${target.name} — Restablecido`, body: `${target.host} volvio a responder correctamente.`, actions: [] });
            setSkylabNotifVisible(true);
            setTimeout(() => setSkylabNotifVisible(false), 6000);
          } else if (currentStatus === "degraded" && prevStatus === "online") {
            setSkylabNotification({ tone: "warning", title: `${target.name} — SSH degradado`, body: `TCP responde pero SSH fallo. Metricas no disponibles hasta la proxima actualizacion.`, actions: ["Revisar credenciales SSH del servidor"] });
            setSkylabNotifVisible(true);
            setTimeout(() => setSkylabNotifVisible(false), 7000);
          }
        }
        prevStatusesRef.current[id] = currentStatus;
      });

      // Smart Alert popups
      const currentAlertIds = (dashboardState.smartAlerts || []).map(a => a.id);
      dashboardState.smartAlerts?.forEach(alert => {
        if (alert.severity === "critical" && !prevAlertsRef.current.includes(alert.id)) {
          toast.error(`Incidente Crítico en ${alert.targetName}: ${alert.title}`, {
            description: alert.message,
            duration: 8000
          });
        }
      });
      prevAlertsRef.current = currentAlertIds;

      setHistory(prevHistory => {
        const nextHistory = { ...prevHistory };
        dashboardState.targets.forEach(target => {
          if (
            target.enabled && 
            target.result?.status === "online" && 
            target.result?.metrics
          ) {
            const id = target.id;
            const cpu = target.result.metrics.cpu?.usagePercent ?? 0;
            const ram = target.result.metrics.memory?.usedPercent ?? 0;
            const timeStr = new Date().toLocaleTimeString("es-CO", { hour: "2-digit", minute: "2-digit" });

            if (!nextHistory[id]) nextHistory[id] = [];
            nextHistory[id] = [...nextHistory[id], { time: timeStr, cpu, ram }];

            if (nextHistory[id].length > 15) {
              nextHistory[id].shift();
            }
          }
        });
        return nextHistory;
      });
    } catch (error) {
      console.error(error);
      toast.error("Error de conexión", { description: "No se pudo obtener datos del backend de monitoreo TI.", duration: 6000 });
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    loadState();
    const interval = setInterval(() => loadState(), 60000);
    return () => clearInterval(interval);
  }, []);
  // Detect rank change up transitions to play animations
  useEffect(() => {
    if (!state?.targets) return;
    const currentSortedIds = state.targets
      .filter(t => t.enabled && t.result?.status === "online" && t.result?.metrics)
      .sort((a, b) => (b.result?.metrics?.cpu?.usagePercent || 0) - (a.result?.metrics?.cpu?.usagePercent || 0))
      .map(t => t.id);

    if (lastRankOrderRef.current.length > 0) {
      const newChanges = {};
      let hasChanges = false;
      currentSortedIds.forEach((id, currentIdx) => {
        const prevIdx = lastRankOrderRef.current.indexOf(id);
        if (prevIdx !== -1 && currentIdx < prevIdx) {
          newChanges[id] = true;
          hasChanges = true;
        }
      });
      if (hasChanges) {
        setRankChanges(newChanges);
        const timer = setTimeout(() => setRankChanges({}), 4000);
        return () => clearTimeout(timer);
      }
    }
    lastRankOrderRef.current = currentSortedIds;
  }, [state?.targets]);

  // Periodic Auto-Notification trigger loop (Deploy notifications automatically)
  useEffect(() => {
    if (!state) return;

    const showPeriodicAlert = () => {
      const activeAlerts = state.smartAlerts || [];
      if (activeAlerts.length > 0) {
        // Pick a random active smart alert to display
        const alert = activeAlerts[Math.floor(Math.random() * activeAlerts.length)];
        let tone = "info";
        if (alert.severity === "critical" || alert.severity === "high") tone = "critical";
        else if (alert.severity === "medium") tone = "warning";

        setSkylabNotification({
          tone,
          title: `${alert.targetName} — Novedad activa`,
          body: alert.message,
          actions: alert.recommendation ? [alert.recommendation] : ["Revisar panel de APM y logs"]
        });
      } else {
        // Summarize overall cluster health if everything is fine
        const online = state.targets?.filter(t => t.result?.status === "online").length || 0;
        const total = state.targets?.length || 0;
        setSkylabNotification({
          tone: "success",
          title: "Sistemas estables",
          body: `${online} de ${total} servidores base reportando conexion OK sin alertas activas.`,
          actions: ["Monitoreo secuencial en tiempo real", "Memoria vectorial KM sincronizada"]
        });
      }
      setSkylabNotifVisible(true);
      
      // Play brief notification sound
      try {
        const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        osc.type = "sine";
        osc.frequency.setValueAtTime(800, audioCtx.currentTime);
        gain.gain.setValueAtTime(0.01, audioCtx.currentTime);
        osc.connect(gain);
        gain.connect(audioCtx.destination);
        osc.start();
        osc.stop(audioCtx.currentTime + 0.12);
      } catch (e) {}

      setTimeout(() => setSkylabNotifVisible(false), 9000);
    };

    // Trigger first popup 4 seconds after page load
    const startTimer = setTimeout(showPeriodicAlert, 4000);
    // Trigger periodically every 3 minutes (180000ms)
    const loopInterval = setInterval(showPeriodicAlert, 180000);

    return () => {
      clearTimeout(startTimer);
      clearInterval(loopInterval);
    };
  }, [state]);


  const handleMove = (id, direction) => {
    if (!state) return;
    const currentOrder = [...layoutOrder];
    state.targets.forEach(t => {
      if (!currentOrder.includes(t.id)) currentOrder.push(t.id);
    });

    const index = currentOrder.indexOf(id);
    if (index === -1) return;
    
    const nextIndex = direction === "up" ? index - 1 : index + 1;
    if (nextIndex < 0 || nextIndex >= currentOrder.length) return;

    const temp = currentOrder[index];
    currentOrder[index] = currentOrder[nextIndex];
    currentOrder[nextIndex] = temp;

    setLayoutOrder(currentOrder);
    localStorage.setItem("skylab.nodeMonitor.layout.v2", JSON.stringify(currentOrder));
  };

  const sortedTargets = useMemo(() => {
    if (!state?.targets) return [];
    const targetsMap = new Map(state.targets.map(t => [t.id, t]));
    
    const ordered = [];
    layoutOrder.forEach(id => {
      if (targetsMap.has(id)) {
        ordered.push(targetsMap.get(id));
        targetsMap.delete(id);
      }
    });

    targetsMap.forEach(target => {
      ordered.push(target);
    });

    return ordered;
  }, [state?.targets, layoutOrder]);

  const categorizedGroups = useMemo(() => {
    const correoWeb = [];
    const coreDb = [];
    const naos = [];
    const otros = [];

    sortedTargets.forEach(target => {
      const name = (target.name || "").toLowerCase();
      const tags = (target.tags || []).map(t => t.toLowerCase());

      if (name.includes("correo") || name.includes("intranet") || tags.includes("correo") || tags.includes("web")) {
        correoWeb.push(target);
      } else if (name.includes("manager") || name.includes("bd") || name.includes("base de datos") || tags.includes("db") || tags.includes("core")) {
        coreDb.push(target);
      } else if (name.includes("naos") || tags.includes("naos") || tags.includes("sivical")) {
        naos.push(target);
      } else {
        otros.push(target);
      }
    });

    return [
      { id: "correo", title: "CORREO Y COLABORACIÓN", subtitle: "Canales de comunicación internos/externos", servers: correoWeb },
      { id: "core", title: "INFRAESTRUCTURA CORE Y BD", subtitle: "Servicios críticos y almacenamiento central", servers: coreDb },
      { id: "naos", title: "PLATAFORMA NAOS MIN. TRANSPORTE", subtitle: "Módulos de base y servicios NAOS", servers: naos },
      { id: "otros", title: "OTROS SERVIDORES", subtitle: "Equipos y módulos adicionales", servers: otros }
    ].filter(g => g.servers.length > 0);
  }, [sortedTargets]);

  // Premium multi-line APM chart data builder
  const globalChartData = useMemo(() => {
    if (!state?.targets) return [];
    const times = new Set();
    Object.values(history).forEach(points => {
      points.forEach(pt => times.add(pt.time));
    });
    
    const sortedTimes = Array.from(times).sort();
    
    return sortedTimes.map(t => {
      const dataPoint = { time: t };
      state.targets.forEach(target => {
        if (target.enabled && target.result?.status === "online") {
          const pt = history[target.id]?.find(p => p.time === t);
          if (pt) {
            dataPoint[target.name] = Math.round(pt.cpu);
          }
        }
      });
      return dataPoint;
    });
  }, [history, state?.targets]);

  const openModal = (target = null) => {
    setSelectedTarget(target);
    if (target) {
      setFormFields({
        name: target.name,
        host: target.host,
        port: target.port,
        type: target.type,
        username: target.username || "",
        password: "",
        tags: (target.tags || []).join(", "),
        enabled: target.enabled
      });
    } else {
      setFormFields({
        name: "",
        host: "",
        port: 22,
        type: "linux",
        username: "",
        password: "",
        tags: "",
        enabled: true
      });
    }
    setIsEditModalOpen(true);
  };

  const handleSaveServer = async (e) => {
    e.preventDefault();
    const payload = {
      ...formFields,
      port: Number(formFields.port),
      tags: formFields.tags.split(",").map(t => t.trim()).filter(Boolean)
    };

    if (selectedTarget && !payload.password) {
      delete payload.password;
    }

    try {
      if (selectedTarget) {
        await servicesTIService.updateTarget(selectedTarget.id, payload);
        toast.success("Servidor actualizado correctamente");
      } else {
        await servicesTIService.createTarget(payload);
        toast.success("Servidor agregado correctamente");
      }
      setIsEditModalOpen(false);
      loadState();
    } catch (error) {
      toast.error(error.message || "Error al guardar el servidor");
    }
  };

  const handleDeleteServer = async () => {
    if (!selectedTarget) return;
    if (!window.confirm(`¿Estás seguro de que deseas eliminar el servidor ${selectedTarget.name}?`)) return;

    try {
      await servicesTIService.deleteTarget(selectedTarget.id);
      setIsEditModalOpen(false);
      const nextOrder = layoutOrder.filter(id => id !== selectedTarget.id);
      setLayoutOrder(nextOrder);
      localStorage.setItem("skylab.nodeMonitor.layout.v2", JSON.stringify(nextOrder));
      toast.success("Servidor eliminado correctamente");
      loadState();
    } catch (error) {
      toast.error(error.message || "Error al eliminar el servidor");
    }
  };

  const handleSweep = async () => {
    setRefreshing(true);
    const toastId = toast.loading("Iniciando barrido secuencial de servidores...");
    try {
      await servicesTIService.triggerSweep();
      setTimeout(async () => {
        await loadState();
        toast.dismiss(toastId);
        toast.success("Monitoreo actualizado", { description: "Barrido secuencial completado en todos los servidores." });
      }, 5000);
    } catch (error) {
      toast.dismiss(toastId);
      toast.error("Escaneo fallido", { description: "No se pudo iniciar el barrido secuencial de servidores.", duration: 5000 });
      setRefreshing(false);
    }
  };

  const openAnalysis = async () => {
    setIsAnalysisModalOpen(true);
    setLoadingAnalysis(true);
    try {
      const data = await servicesTIService.getAnalysis();
      setAnalysisData(data);
    } catch (error) {
      toast.error("Error en Análisis", { description: "No se pudo conectar con el endpoint de análisis avanzado.", duration: 5000 });
      setIsAnalysisModalOpen(false);
    } finally {
      setLoadingAnalysis(false);
    }
  };

  const totalServers = state?.targets?.length || 0;
  const onlineServers = state?.targets?.filter(t => t.result?.status === "online").length || 0;
  const degradedServers = state?.targets?.filter(t => t.result?.status === "degraded").length || 0;
  const offlineServers = state?.targets?.filter(t => t.result?.status === "offline").length || 0;

  const criticalAlerts = (state?.smartAlerts || []).filter(alert => alert.severity === "critical");

  useEffect(() => {
    if (!setPageHeader) return;
    setPageHeader(
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between w-full">
        <div>
          <h1 className="text-xl font-black tracking-tight text-foreground flex items-center gap-2">
            <Server className="h-5 w-5 text-primary" />
            Monitoreo Servicios TI
          </h1>
          <p className="text-xs text-muted-foreground">Infraestructura centralizada y servidores base en tiempo real.</p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* Global APM chart toggle */}
          <button
            onClick={() => setIsGlobalChartOpen(!isGlobalChartOpen)}
            className={`flex items-center gap-1.5 rounded-lg border px-3 py-2 text-xs font-bold uppercase tracking-wide transition-all ${
              isGlobalChartOpen 
                ? "bg-primary/25 border-primary text-primary" 
                : "border-border bg-card hover:bg-muted text-foreground"
            }`}
            title="Vista Global APM"
          >
            <TrendingUp className="h-3.5 w-3.5" />
            APM
          </button>

          {/* Bell Alerts Dropdown trigger */}
          <div className="relative">
            <button
              onClick={() => setIsAlertDropdownOpen(!isAlertDropdownOpen)}
              className={`relative p-2.5 rounded-xl border transition-all duration-300 shadow-sm flex items-center justify-center hover:scale-105 active:scale-95 ${
                isAlertDropdownOpen 
                  ? "bg-rose-500/10 border-rose-500/30 text-rose-400 shadow-[0_0_12px_rgba(244,63,94,0.15)]" 
                  : "border-border/60 bg-background/50 hover:bg-muted/80 text-muted-foreground hover:text-foreground hover:border-primary/45"
              }`}
              title="Alertas Activas"
            >
              <Bell className={`h-4 w-4 ${state?.smartAlerts?.length > 0 ? "animate-[ring_1.5s_ease-in-out_infinite]" : ""}`} />
              {state?.smartAlerts?.length > 0 && (
                <span className="absolute -top-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full bg-rose-500 text-[9px] font-black text-white ring-2 ring-background shadow-[0_0_8px_rgba(244,63,94,0.6)] animate-pulse">
                  {state.smartAlerts.length}
                </span>
              )}
            </button>
            {isAlertDropdownOpen && (
              <div className="absolute right-0 mt-2 z-50 w-80 rounded-xl border border-border bg-card p-4 shadow-2xl animate-in fade-in slide-in-from-top-2 duration-200">
                <div className="flex items-center justify-between border-b border-border/40 pb-2 mb-3">
                  <h3 className="text-xs font-black uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                    <AlertTriangle className="h-3.5 w-3.5 text-amber-500" />
                    Alertas Activas
                  </h3>
                  <button 
                    onClick={() => setIsAlertDropdownOpen(false)}
                    className="p-1 rounded hover:bg-muted text-muted-foreground"
                  >
                    <X size={12} />
                  </button>
                </div>
                <div className="space-y-2 max-h-[350px] overflow-y-auto pr-1">
                  {state?.smartAlerts && state.smartAlerts.length > 0 ? (
                    state.smartAlerts.map(alert => (
                      <div key={alert.id} className={`p-2.5 rounded-lg border text-xs leading-relaxed ${alertToneClass(alert.severity)}`}>
                        <div className="font-bold flex items-center justify-between gap-1">
                          <span className="truncate">{alert.targetName}</span>
                          <span className="text-[8px] uppercase tracking-widest">{alert.severity}</span>
                        </div>
                        <p className="mt-1 opacity-90">{alert.message}</p>
                        {alert.recommendation && (
                          <div className="mt-1 border-t border-current/10 pt-1 text-[10px] opacity-75">
                            <span className="font-bold">Acción:</span> {alert.recommendation}
                          </div>
                        )}
                      </div>
                    ))
                  ) : (
                    <p className="text-xs text-muted-foreground text-center py-6">No hay alertas activas.</p>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Premium status bar */}
          <div className="flex items-center gap-1.5 rounded-xl border border-border/40 bg-background/60 px-3.5 py-2 shadow-inner backdrop-blur-sm">
            <div className="flex items-center gap-1.5 pr-2.5 border-r border-border/40">
              <span className="text-[9px] font-black uppercase tracking-widest text-muted-foreground">Nodos</span>
              <span className="text-sm font-black text-foreground">{totalServers}</span>
            </div>
            <div className="flex items-center gap-1.5 pl-1.5 pr-2.5 border-r border-border/40">
              <span className="w-2 h-2 rounded-full bg-emerald-400 shadow-[0_0_6px_rgba(52,211,153,0.7)]" />
              <span className="text-[11px] font-black text-emerald-400">{onlineServers}</span>
            </div>
            {degradedServers > 0 && (
              <div className="flex items-center gap-1.5 pl-1.5 pr-2.5 border-r border-border/40">
                <span className="w-2 h-2 rounded-full bg-amber-400 shadow-[0_0_6px_rgba(251,191,36,0.7)]" />
                <span className="text-[11px] font-black text-amber-400">{degradedServers}</span>
              </div>
            )}
            {offlineServers > 0 ? (
              <div className="flex items-center gap-1.5 pl-1.5">
                <span className="w-2 h-2 rounded-full bg-rose-500 shadow-[0_0_6px_rgba(244,63,94,0.8)] animate-pulse" />
                <span className="text-[11px] font-black text-rose-400">{offlineServers} offline</span>
              </div>
            ) : (
              <div className="flex items-center gap-1.5 pl-1.5">
                <span className="text-[9px] font-bold text-muted-foreground">All OK</span>
              </div>
            )}
          </div>

          <button
            onClick={handleSweep}
            disabled={refreshing}
            className="flex items-center gap-1.5 rounded-lg border border-border bg-card px-3 py-2 text-xs font-bold uppercase tracking-wide hover:bg-muted disabled:opacity-50 transition-colors"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${refreshing ? "animate-spin" : ""}`} />
            Escanear
          </button>
          
          <button
            onClick={openAnalysis}
            className="flex items-center gap-1.5 rounded-lg bg-primary/10 border border-primary/20 text-primary px-3 py-2 text-xs font-bold uppercase tracking-wide hover:bg-primary/20 transition-colors"
          >
            <Activity className="h-3.5 w-3.5" />
            Análisis
          </button>

          <button
            onClick={() => openModal()}
            className="flex items-center gap-1.5 rounded-lg bg-primary text-primary-foreground px-3 py-2 text-xs font-bold uppercase tracking-wide hover:shadow-[0_0_12px_rgba(59,130,246,0.3)] transition-all"
          >
            <Plus className="h-3.5 w-3.5" />
            Agregar
          </button>
        </div>
      </div>
    );
    return () => setPageHeader(null);
  }, [setPageHeader, refreshing, totalServers, onlineServers, degradedServers, offlineServers, isAlertDropdownOpen, isGlobalChartOpen, state?.smartAlerts]);

  if (loading && !state) {
    return (
      <div className="flex h-[60vh] flex-col items-center justify-center gap-4">
        <Loader2 className="h-10 w-10 animate-spin text-primary" />
        <p className="text-sm font-bold text-muted-foreground uppercase tracking-widest animate-pulse">Cargando Dashboard de Servicios...</p>
      </div>
    );
  }

  return (
    <div className="space-y-3.5 animate-in fade-in slide-in-from-top-2 duration-500 -mt-4">
      
      <style>{`
        @keyframes breathe {
          0%, 100% { opacity: 1; filter: brightness(1.2) drop-shadow(0 0 10px rgba(52,211,153,0.8)); }
          50% { opacity: 0.55; filter: brightness(0.8) drop-shadow(0 0 4px rgba(52,211,153,0.4)); }
        }
        @keyframes breathe-amber {
          0%, 100% { opacity: 1; filter: brightness(1.2) drop-shadow(0 0 10px rgba(245,158,11,0.8)); }
          50% { opacity: 0.55; filter: brightness(0.8) drop-shadow(0 0 4px rgba(245,158,11,0.4)); }
        }
        @keyframes breathe-red {
          0%, 100% { opacity: 1; filter: brightness(1.2) drop-shadow(0 0 12px rgba(244,63,94,0.9)); }
          50% { opacity: 0.45; filter: brightness(0.7) drop-shadow(0 0 5px rgba(244,63,94,0.5)); }
        }
        @keyframes rank-up-glow {
          0% { border-color: rgba(52, 211, 153, 0.3); box-shadow: 0 0 0 0 rgba(52, 211, 153, 0.4); transform: translateY(0) scale(1); }
          30% { border-color: rgba(52, 211, 153, 0.9); box-shadow: 0 0 14px 4px rgba(52, 211, 153, 0.35); transform: translateY(-4px) scale(1.025); }
          100% { border-color: rgba(255, 255, 255, 0.1); box-shadow: 0 0 0 0 rgba(0, 0, 0, 0); transform: translateY(0) scale(1); }
        }
        .animate-rank-up {
          animation: rank-up-glow 2.5s cubic-bezier(0.25, 1, 0.5, 1) forwards;
        }
        @keyframes ring {
          0%, 100% { transform: rotate(0); }
          15% { transform: rotate(-15deg); }
          30% { transform: rotate(12deg); }
          45% { transform: rotate(-10deg); }
          60% { transform: rotate(8deg); }
          75% { transform: rotate(-4deg); }
          90% { transform: rotate(0); }
        }
      `}</style>

      {/* Critical alerts compact side strip */}
      {criticalAlerts.length > 0 && (
        <div className="flex justify-end mb-3">
          <div className="flex items-center gap-2 rounded-xl border border-rose-500/30 bg-rose-500/8 px-3 py-1.5 shadow-lg shadow-rose-950/20 max-w-sm">
            <div
              className="w-2 h-2 rounded-full bg-rose-500 shrink-0"
              style={{ animation: "breathe-red 2s ease-in-out infinite" }}
            />
            <div className="min-w-0">
              <span className="text-[9px] font-black uppercase tracking-widest text-rose-400">Incidente Critico</span>
              <p className="text-[11px] font-bold text-foreground truncate">{criticalAlerts[0].targetName} &bull; {criticalAlerts[0].message}</p>
            </div>
            <span className="ml-1 shrink-0 rounded-lg bg-rose-500/20 border border-rose-500/30 px-2 py-0.5 text-[10px] font-black text-rose-300">
              {criticalAlerts.length}
            </span>
          </div>
        </div>
      )}


      {/* Collapsible APM Premium Chart */}
      {isGlobalChartOpen && (
        <div className="rounded-xl border border-border bg-card/45 p-5 backdrop-blur-sm animate-in slide-in-from-top-4 duration-300 shadow-xl">
          <div className="flex flex-col gap-2 border-b border-border/40 pb-3 mb-5 md:flex-row md:items-center md:justify-between">
            <div>
              <h2 className="text-sm font-black text-foreground flex items-center gap-2 uppercase tracking-widest">
                <TrendingUp className="h-4 w-4 text-primary" />
                Monitor APM - Carga Comparativa CPU/RAM
              </h2>
              <p className="text-[11px] text-muted-foreground mt-0.5">Historial en tiempo real de todos los nodos activos. Actualiza cada minuto.</p>
            </div>
            <button
              onClick={() => setIsGlobalChartOpen(false)}
              className="flex items-center gap-1.5 text-xs font-bold text-muted-foreground hover:text-foreground hover:bg-muted px-2.5 py-1.5 rounded-lg transition-colors border border-border/40"
            >
              <ChevronUp size={12} />
              Contraer
            </button>
          </div>

          <div className="grid grid-cols-1 xl:grid-cols-3 gap-5">
            <div className="xl:col-span-2 space-y-3">
              <div className="rounded-xl border border-border/30 bg-background/40 p-3.5 shadow-inner">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-emerald-400 shadow-[0_0_6px_rgba(52,211,153,0.6)]" />
                    <span className="text-[10px] font-black text-muted-foreground uppercase tracking-widest">CPU por servidor (%)</span>
                  </div>
                </div>
                <div className="h-48">
                  {globalChartData.length >= 2 ? (
                    <ResponsiveContainer width="100%" height="100%">
                      <AreaChart data={globalChartData} margin={{ top: 5, right: 5, left: -25, bottom: 0 }}>
                        <defs>
                          {state && state.targets && state.targets.map((target, idx) => {
                            if (!target.enabled || target.result?.status !== "online") return null;
                            const colors = ["#34d399","#38bdf8","#fbbf24","#a78bfa","#f472b6","#fb7185","#2dd4bf","#60a5fa"];
                            const color = colors[idx % colors.length];
                            return (
                              <linearGradient key={target.id} id={`apm-grad-${target.id}`} x1="0" y1="0" x2="0" y2="1">
                                <stop offset="5%" stopColor={color} stopOpacity={0.2}/>
                                <stop offset="95%" stopColor={color} stopOpacity={0}/>
                              </linearGradient>
                            );
                          })}
                        </defs>
                        <CartesianGrid strokeDasharray="2 4" stroke="#1e293b" vertical={false} />
                        <XAxis dataKey="time" stroke="#475569" fontSize={8} tickLine={false} axisLine={false} tick={{ fill: "#64748b" }} />
                        <YAxis stroke="#475569" fontSize={8} domain={[0, 100]} tickLine={false} axisLine={false} tick={{ fill: "#64748b" }} tickFormatter={(v) => `${v}%`} />
                        <Tooltip
                          contentStyle={{ background: "#0f172a", border: "1px solid #1e293b", borderRadius: "10px", fontSize: "11px", boxShadow: "0 20px 40px rgba(0,0,0,0.5)" }}
                          labelStyle={{ color: "#94a3b8", fontWeight: "900", textTransform: "uppercase", letterSpacing: "0.05em", fontSize: "9px", marginBottom: "6px" }}
                          itemStyle={{ color: "#e2e8f0", fontWeight: "700" }}
                          formatter={(value, name) => [`${Number(value).toFixed(1)}%`, name]}
                        />
                        {state && state.targets && state.targets.map((target, idx) => {
                          if (!target.enabled || target.result?.status !== "online") return null;
                          const colors = ["#34d399","#38bdf8","#fbbf24","#a78bfa","#f472b6","#fb7185","#2dd4bf","#60a5fa"];
                          const color = colors[idx % colors.length];
                          return (
                            <Area
                              key={target.id}
                              type="monotone"
                              dataKey={target.name}
                              stroke={color}
                              strokeWidth={2}
                              fillOpacity={1}
                              fill={`url(#apm-grad-${target.id})`}
                              dot={false}
                              activeDot={{ r: 5, strokeWidth: 2, stroke: "#0f172a" }}
                            />
                          );
                        })}
                      </AreaChart>
                    </ResponsiveContainer>
                  ) : (
                    <div className="h-full flex items-center justify-center text-xs text-muted-foreground flex-col gap-3">
                      <Loader2 className="h-6 w-6 animate-spin text-primary" />
                      <span className="text-[10px] font-bold uppercase tracking-widest">Recolectando metricas... aguarda al menos 2 ciclos</span>
                    </div>
                  )}
                </div>
              </div>

              <div className="flex flex-wrap gap-2">
                {state && state.targets && state.targets.map((target, idx) => {
                  if (!target.enabled || target.result?.status !== "online") return null;
                  const colors = ["#34d399","#38bdf8","#fbbf24","#a78bfa","#f472b6","#fb7185","#2dd4bf","#60a5fa"];
                  const color = colors[idx % colors.length];
                  return (
                    <div key={target.id} className="flex items-center gap-1.5 rounded-full border border-border/30 bg-background/50 px-2.5 py-1">
                      <span className="w-2 h-2 rounded-full shrink-0" style={{ background: color, boxShadow: `0 0 6px ${color}60` }} />
                      <span className="text-[9px] font-black text-foreground uppercase tracking-wide truncate max-w-[100px]">{target.name}</span>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="space-y-3">
              <div className="flex items-center justify-between border-b border-border/30 pb-2.5">
                <p className="text-sm font-black uppercase tracking-widest text-muted-foreground flex items-center gap-2">
                  <Activity className="h-4 w-4 text-primary" />
                  Ranking de Recursos
                </p>
                <span className="text-[11px] font-black text-muted-foreground bg-background/50 border border-border/30 rounded px-2.5 py-0.5">
                  CPU desc
                </span>
              </div>
              <div className="space-y-2 max-h-72 overflow-y-auto pr-1 scrollbar-thin scrollbar-thumb-border/40">
                {state && state.targets && state.targets
                  .filter(t => t.enabled && t.result && t.result.status === "online" && t.result.metrics)
                  .sort((a, b) => (b.result.metrics.cpu && b.result.metrics.cpu.usagePercent || 0) - (a.result.metrics.cpu && a.result.metrics.cpu.usagePercent || 0))
                  .map((target, rankIdx) => {
                    const cpu = Math.round((target.result.metrics.cpu && target.result.metrics.cpu.usagePercent) || 0);
                    const ram = Math.round((target.result.metrics.memory && target.result.metrics.memory.usedPercent) || 0);
                    const disk = Math.round((target.result.metrics.disk && target.result.metrics.disk.usedPercent) || 0);
                    const colors = ["#34d399","#38bdf8","#fbbf24","#a78bfa","#f472b6","#fb7185","#2dd4bf","#60a5fa"];
                    const origIdx = state.targets.indexOf(target);
                    const color = colors[origIdx % colors.length];
                    const cpuTone = cpu >= 90 ? "#fb7185" : cpu >= 75 ? "#fbbf24" : "#34d399";
                    const ramTone = ram >= 90 ? "#fb7185" : ram >= 75 ? "#fbbf24" : "#38bdf8";
                    const diskTone = disk >= 90 ? "#fb7185" : disk >= 75 ? "#fbbf24" : "#a78bfa";
                    const rankMedal = rankIdx === 0 ? "bg-amber-500/20 text-amber-300 border-amber-500/30" :
                                      rankIdx === 1 ? "bg-slate-400/15 text-slate-300 border-slate-400/30" :
                                      rankIdx === 2 ? "bg-orange-700/15 text-orange-400 border-orange-700/30" :
                                      "bg-background/40 text-muted-foreground border-border/20";
                    const latency = (target.result.tcp && target.result.tcp.latencyMs) ? `${target.result.tcp.latencyMs}ms` : "-";
                    const isRankUp = rankChanges[target.id];

                    return (
                      <div key={target.id} className={`rounded-xl bg-background/40 border p-3 space-y-2.5 hover:border-border/50 transition-all duration-300 ${isRankUp ? "animate-rank-up border-emerald-500/50 bg-emerald-950/5" : "border-border/20"}`}>
                        <div className="flex items-center gap-3">
                          <span className={`shrink-0 w-8.5 h-8.5 rounded-full border text-base font-black flex items-center justify-center ${rankMedal}`}>
                            {rankIdx + 1}
                          </span>
                          <div className="flex items-center gap-2 min-w-0 flex-1">
                            <span className="w-3.5 h-3.5 rounded-full shrink-0 shadow-sm animate-pulse" style={{ background: color, boxShadow: `0 0 8px ${color}80` }} />
                            <span className="text-sm font-black text-foreground truncate">{target.name}</span>
                          </div>
                          <div className="flex items-center gap-2 shrink-0">
                            <span className="text-[11px] text-muted-foreground font-bold">{latency}</span>
                            <span className={`w-2 h-2 rounded-full ${cpu >= 75 || ram >= 75 ? "bg-amber-400 animate-pulse" : "bg-emerald-400"}`} />
                          </div>
                        </div>
                        <div className="space-y-2">
                          <div className="flex items-center gap-3">
                            <span className="text-[11px] font-black text-muted-foreground uppercase tracking-wide w-10 shrink-0">CPU</span>
                            <div className="flex-1 h-2.5 bg-background/80 rounded-full overflow-hidden border border-border/20">
                              <div className="h-full rounded-full transition-all duration-700" style={{ width: `${cpu}%`, background: `linear-gradient(90deg, ${cpuTone}99, ${cpuTone})`, boxShadow: `0 0 8px ${cpuTone}60` }} />
                            </div>
                            <span className="text-[13px] font-black w-10 text-right shrink-0" style={{ color: cpuTone }}>{cpu}%</span>
                          </div>
                          <div className="flex items-center gap-3">
                            <span className="text-[11px] font-black text-muted-foreground uppercase tracking-wide w-10 shrink-0">RAM</span>
                            <div className="flex-1 h-2.5 bg-background/80 rounded-full overflow-hidden border border-border/20">
                              <div className="h-full rounded-full transition-all duration-700" style={{ width: `${ram}%`, background: `linear-gradient(90deg, ${ramTone}99, ${ramTone})`, boxShadow: `0 0 8px ${ramTone}60` }} />
                            </div>
                            <span className="text-[13px] font-black w-10 text-right shrink-0" style={{ color: ramTone }}>{ram}%</span>
                          </div>
                          <div className="flex items-center gap-3">
                            <span className="text-[11px] font-black text-muted-foreground uppercase tracking-wide w-10 shrink-0">DISK</span>
                            <div className="flex-1 h-2.5 bg-background/80 rounded-full overflow-hidden border border-border/20">
                              <div className="h-full rounded-full transition-all duration-700" style={{ width: `${disk}%`, background: `linear-gradient(90deg, ${diskTone}99, ${diskTone})`, boxShadow: `0 0 8px ${diskTone}60` }} />
                            </div>
                            <span className="text-[13px] font-black w-10 text-right shrink-0" style={{ color: diskTone }}>{disk}%</span>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                {!state?.targets?.some(t => t.enabled && t.result?.status === "online" && t.result?.metrics) && (
                  <div className="flex flex-col items-center justify-center py-10 gap-2 text-center">
                    <Activity className="h-8 w-8 text-muted-foreground/30" />
                    <p className="text-xs text-muted-foreground">Sin nodos activos con metricas SSH.</p>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-12 items-start">
        
        {/* Main Grid Category Columns */}
        <div className="lg:col-span-12 grid grid-cols-1 gap-5 2xl:grid-cols-3">
          {categorizedGroups.map((group) => {
            const groupOnline = group.servers.filter(s => s.result?.status === "online").length;
            const groupTotal = group.servers.length;
            const isGroupOk = groupOnline === groupTotal;

            return (
              <section key={group.id} className={`rounded-xl border bg-card/35 p-4 ${!isGroupOk ? "border-rose-500/20 bg-rose-500/5 shadow-rose-950/5" : "border-border shadow-sm"}`}>
                
                <div className="mb-4 flex flex-col gap-3 border-b border-border/40 pb-4 lg:flex-row lg:items-center lg:justify-between">
                  <div className="flex min-w-0 items-center gap-3">
                    <div className={`rounded-xl p-3 ${!isGroupOk ? "bg-rose-500/10 text-rose-400" : "bg-sky-500/15 text-sky-400"}`}>
                      <Server className="h-6 w-6" />
                    </div>
                    <div className="min-w-0">
                      <h2 className="flex items-center gap-2 truncate text-base font-black">
                        {group.title}
                      </h2>
                      <div className="mt-0.5 flex flex-wrap items-center gap-2">
                        <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">{group.subtitle}</p>
                      </div>
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center gap-2 lg:justify-end">
                    <HealthBadge label={`${groupOnline}/${groupTotal} online`} ok={isGroupOk} warn={groupOnline > 0} />
                  </div>
                </div>

                <div>
                  <p className="mb-3 flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                    <Database className="h-4 w-4" />
                    Servidores Activos
                  </p>
                  
                  <div className="grid grid-cols-1 gap-3">
                    {group.servers.map((target) => {
                      const res = target.result;
                      const metrics = res?.metrics;
                      const status = res?.status || (target.enabled ? "unknown" : "paused");
                      const activeTab = activeTabs[target.id] || "metrics";
                      const sortDirection = diskSorts[target.id] || "desc";
                      const isExpanded = expandedCards[target.id] || false;

                      const hasDocker = metrics?.docker?.available && metrics?.docker?.containers?.length > 0;
                      const hasShareplex = metrics?.shareplex?.detected;

                      const filesystems = metrics?.filesystems || [];
                      const highUsageFilesystems = filesystems.filter(fs => Number(fs.usedPercent || 0) >= 80);
                      const hasDiskWarning = highUsageFilesystems.length > 0;
                      const alerts = res?.alerts || [];
                      // Find partition with maximum disk usage
                      const maxFs = filesystems.reduce((max, fs) => (Number(fs.usedPercent || 0) > Number(max.usedPercent || 0) ? fs : max), { name: "/", usedPercent: metrics?.disk?.usedPercent || 0 });

                      const pingColor = status === "online" 
                        ? "bg-emerald-400 shadow-[0_0_12px_rgba(52,211,153,0.7)]" 
                        : status === "degraded"
                          ? "bg-amber-400 shadow-[0_0_12px_rgba(245,158,11,0.7)] animate-[breathe-amber_3s_ease-in-out_infinite]"
                          : status === "offline"
                            ? "bg-rose-500 shadow-[0_0_12px_rgba(244,63,94,0.8)] animate-[breathe-red_2s_ease-in-out_infinite]"
                            : "bg-slate-600";

                      return (
                        <article 
                          key={target.id} 
                          className={`rounded-xl border transition-all duration-300 ${
                            status === "offline" 
                              ? "border-rose-500/25 bg-rose-500/5 hover:border-rose-500/40" 
                              : isExpanded 
                                ? "border-primary/45 bg-card/60 shadow-lg"
                                : "border-border/50 bg-background/45 hover:border-primary/30"
                          } p-3.5 flex flex-col`}
                        >
                          <header className="flex items-start justify-between gap-3 border-b border-border/10 pb-2">
                            <div className="min-w-0">
                              <div className="flex items-center gap-2">
                                <h3 className="text-sm font-black truncate text-foreground">{target.name}</h3>
                                <span 
                                  className={`w-2.5 h-2.5 rounded-full shrink-0 ${pingColor}`}
                                  style={{ animation: status === "online" ? "breathe 3s ease-in-out infinite" : undefined }}
                                />
                                {res?.tcp?.latencyMs && (
                                  <span className="text-[10px] font-bold text-emerald-400/80">{res.tcp.latencyMs}ms</span>
                                )}
                              </div>
                              <p className="text-[10px] text-muted-foreground truncate uppercase font-bold tracking-wider mt-0.5">
                                {maskHost(target.host)}:{target.port} &bull; {target.type === "linux" ? "SSH" : "TCP"}
                              </p>
                            </div>

                            <div className="flex items-center gap-0.5">
                              <button 
                                onClick={() => handleMove(target.id, "up")}
                                className="p-1 rounded bg-background/55 hover:bg-muted text-muted-foreground hover:text-foreground transition-all"
                                title="Mover Arriba"
                              >
                                <ChevronUp size={11} />
                              </button>
                              <button 
                                onClick={() => handleMove(target.id, "down")}
                                className="p-1 rounded bg-background/55 hover:bg-muted text-muted-foreground hover:text-foreground transition-all"
                                title="Mover Abajo"
                              >
                                <ChevronDown size={11} />
                              </button>
                              <button 
                                onClick={() => openModal(target)}
                                className="p-1 rounded bg-background/55 hover:bg-muted text-muted-foreground hover:text-foreground transition-all ml-0.5"
                                title="Editar"
                              >
                                <Edit size={11} />
                              </button>
                              <button 
                                onClick={() => setExpandedCards(prev => ({ ...prev, [target.id]: !isExpanded }))}
                                className="p-1 rounded bg-background/55 hover:bg-muted text-muted-foreground hover:text-foreground transition-all ml-0.5"
                                title={isExpanded ? "Contraer Detalles" : "Expandir Detalles"}
                              >
                                {isExpanded ? <ChevronUp size={13} className="text-primary" /> : <ChevronDown size={13} />}
                              </button>
                            </div>
                          </header>

                          {(target.tags || []).length > 0 && (
                            <div className="flex flex-wrap gap-1 mt-2">
                              {target.tags.map((tag, idx) => (
                                <span key={idx} className="inline-flex items-center gap-1 rounded bg-primary/10 border border-primary/20 px-1.5 py-0.5 text-[8px] font-black uppercase text-primary">
                                  <Tag size={8} />
                                  {tag}
                                </span>
                              ))}
                            </div>
                          )}

                          {filesystems.length > 1 && (
                            <div className="mt-2 p-2 rounded-lg bg-background/25 border border-border/15 flex flex-col gap-1 shadow-inner">
                              <span className="text-[8px] font-black uppercase tracking-wider text-muted-foreground block mb-0.5">Almacenamiento (Unidades):</span>
                              <div className="flex flex-wrap gap-x-2.5 gap-y-1">
                                {filesystems.map((fs, idx) => {
                                  const pct = Math.round(Number(fs.usedPercent || 0));
                                  const color = pct >= 90 ? "text-rose-400 font-bold" : pct >= 75 ? "text-amber-400 font-bold" : "text-foreground/80";
                                  return (
                                    <span key={idx} className="text-[10px] font-semibold flex items-center gap-1">
                                      <span className="text-muted-foreground">{fs.name || fs.mount}:</span>
                                      <span className={color}>{pct}%</span>
                                    </span>
                                  );
                                })}
                              </div>
                            </div>
                          )}

                          <div className="grid grid-cols-2 gap-2 mt-3">
                            <MiniStat 
                              icon={<Clock className="h-3.5 w-3.5" />} 
                              label="Uptime" 
                              value={formatUptimeDays(metrics?.uptime)} 
                            />
                            <MiniStat 
                              icon={<Cpu className="h-3.5 w-3.5" />} 
                              label="CPU" 
                              value={metrics?.cpu?.usagePercent !== undefined && metrics?.cpu?.usagePercent !== null ? `${Math.round(metrics.cpu.usagePercent)}%` : "N/D"} 
                              color={metrics?.cpu?.usagePercent >= 90 ? "text-rose-400" : metrics?.cpu?.usagePercent >= 75 ? "text-amber-400" : "text-emerald-400"}
                            />
                            <MiniStat 
                              icon={<Layers className="h-3.5 w-3.5" />} 
                              label="RAM" 
                              value={metrics?.memory?.usedPercent !== undefined && metrics?.memory?.usedPercent !== null ? `${Math.round(metrics.memory.usedPercent)}%` : "N/D"} 
                              color={metrics?.memory?.usedPercent >= 90 ? "text-rose-400" : metrics?.memory?.usedPercent >= 75 ? "text-amber-400" : "text-emerald-400"}
                            />
                            <MiniStat 
                              icon={<HardDrive className="h-3.5 w-3.5" />} 
                              label={`Disco (${maxFs.name || maxFs.mount || "/"})`} 
                              value={maxFs.usedPercent !== undefined && maxFs.usedPercent !== null ? `${Math.round(maxFs.usedPercent)}%` : "N/D"} 
                              color={maxFs.usedPercent >= 90 ? "text-rose-400" : maxFs.usedPercent >= 75 ? "text-amber-400" : "text-emerald-400"}
                            />
                          </div>

                          {isExpanded && (
                            <div className="mt-4 border-t border-border/20 pt-3 space-y-3.5 animate-in fade-in duration-300">
                              <nav className="flex border-b border-border/25 text-xs font-bold">
                                <button
                                  onClick={() => setActiveTabs(prev => ({ ...prev, [target.id]: "metrics" }))}
                                  className={`pb-1.5 px-3 border-b-2 transition-all ${
                                    activeTab === "metrics" ? "border-primary text-foreground" : "border-transparent text-muted-foreground hover:text-foreground"
                                  }`}
                                >
                                  Métricas
                                </button>
                                <button
                                  onClick={() => setActiveTabs(prev => ({ ...prev, [target.id]: "disk" }))}
                                  className={`pb-1.5 px-3 border-b-2 transition-all flex items-center gap-1.5 ${
                                    activeTab === "disk" ? "border-primary text-foreground" : "border-transparent text-muted-foreground hover:text-foreground"
                                  }`}
                                >
                                  Particiones
                                  {hasDiskWarning && <span className="w-1.5 h-1.5 rounded-full bg-amber-400 shrink-0" />}
                                </button>
                                <button
                                  onClick={() => setActiveTabs(prev => ({ ...prev, [target.id]: "services" }))}
                                  className={`pb-1.5 px-3 border-b-2 transition-all flex items-center gap-1.5 ${
                                    activeTab === "services" ? "border-primary text-foreground" : "border-transparent text-muted-foreground hover:text-foreground"
                                  }`}
                                >
                                  Servicios
                                  {(hasDocker || hasShareplex) && <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 shrink-0" />}
                                </button>
                              </nav>

                              <div className="min-h-[140px]">
                                {activeTab === "metrics" && (
                                  <div className="space-y-3.5">
                                    <div className="flex gap-1.5">
                                      <CircleGauge label="CPU" value={metrics?.cpu?.usagePercent} />
                                      <CircleGauge label="RAM" value={metrics?.memory?.usedPercent} />
                                      <CircleGauge label="Swap" value={metrics?.memory?.swap?.usedPercent} />
                                      <CircleGauge label="Disco" value={metrics?.disk?.usedPercent} />
                                    </div>

                                    {alerts.length > 0 && (
                                      <div className="space-y-1">
                                        {alerts.map((alert, idx) => (
                                          <div key={idx} className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-[11px] font-semibold bg-rose-500/10 border border-rose-500/20 text-rose-400">
                                            <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
                                            <span className="truncate">{alert.message}</span>
                                          </div>
                                        ))}
                                      </div>
                                    )}

                                    {target.enabled && status === "online" && history[target.id] && history[target.id].length >= 2 && (
                                      <div className="rounded-xl border border-border/20 bg-background/30 p-2.5 shadow-inner">
                                        <div className="flex items-center justify-between text-[9px] font-bold text-muted-foreground uppercase tracking-wider mb-2">
                                          <span>Tendencia</span>
                                          <div className="flex gap-3">
                                            <span className="flex items-center gap-1">
                                              <span className="w-1.5 h-1.5 rounded bg-emerald-400" />
                                              CPU: {Math.round(metrics?.cpu?.usagePercent || 0)}%
                                            </span>
                                            <span className="flex items-center gap-1">
                                              <span className="w-1.5 h-1.5 rounded bg-sky-400" />
                                              RAM: {Math.round(metrics?.memory?.usedPercent || 0)}%
                                            </span>
                                          </div>
                                        </div>
                                        <div className="h-14">
                                          <ResponsiveContainer width="100%" height="100%">
                                            <AreaChart data={history[target.id]} margin={{ top: 0, right: 0, left: 0, bottom: 0 }}>
                                              <defs>
                                                <linearGradient id={`cpu-grad-${target.id}`} x1="0" y1="0" x2="0" y2="1">
                                                  <stop offset="5%" stopColor="#34d399" stopOpacity={0.25}/>
                                                  <stop offset="95%" stopColor="#34d399" stopOpacity={0}/>
                                                </linearGradient>
                                                <linearGradient id={`ram-grad-${target.id}`} x1="0" y1="0" x2="0" y2="1">
                                                  <stop offset="5%" stopColor="#38bdf8" stopOpacity={0.25}/>
                                                  <stop offset="95%" stopColor="#38bdf8" stopOpacity={0}/>
                                                </linearGradient>
                                              </defs>
                                              <Tooltip 
                                                contentStyle={{ background: "#1e293b", border: "1px solid #334155", borderRadius: "8px", fontSize: "10px" }}
                                                labelStyle={{ color: "#94a3b8", fontWeight: "bold" }}
                                              />
                                              <Area type="monotone" dataKey="cpu" stroke="#34d399" strokeWidth={1.5} fillOpacity={1} fill={`url(#cpu-grad-${target.id})`} name="CPU %" />
                                              <Area type="monotone" dataKey="ram" stroke="#38bdf8" strokeWidth={1.5} fillOpacity={1} fill={`url(#ram-grad-${target.id})`} name="RAM %" />
                                            </AreaChart>
                                          </ResponsiveContainer>
                                        </div>
                                      </div>
                                    )}
                                    
                                    <div className="grid grid-cols-2 gap-2 text-xs border-t border-border/10 pt-2.5">
                                      <div className="p-2 rounded bg-background/20 border border-border/10">
                                        <span className="text-[8px] font-black text-muted-foreground uppercase block">Latencia</span>
                                        <strong className="text-foreground">{res?.tcp?.latencyMs ? `${res.tcp.latencyMs} ms` : "N/D"}</strong>
                                      </div>
                                      <div className="p-2 rounded bg-background/20 border border-border/10">
                                        <span className="text-[8px] font-black text-muted-foreground uppercase block">Load Avg</span>
                                        <strong className="text-foreground">{metrics?.cpu ? `${metrics.cpu.load1} / ${metrics.cpu.load5}` : "N/D"}</strong>
                                      </div>
                                    </div>

                                    {res?.status === "degraded" && (
                                      <div className="flex gap-2 p-2.5 rounded-lg bg-amber-500/10 border border-amber-500/20 text-amber-400 text-xs">
                                        <Info className="h-4 w-4 shrink-0 mt-0.5" />
                                        <div>
                                          <strong className="font-bold block">Sin Métricas SSH</strong>
                                          <span className="opacity-90">{res.sshError || "Falla al autenticar"}</span>
                                        </div>
                                      </div>
                                    )}
                                  </div>
                                )}

                                {activeTab === "disk" && (
                                  <div className="space-y-3">
                                    <div className="flex gap-2 justify-end">
                                      <button
                                        onClick={() => setDiskSorts(prev => ({ ...prev, [target.id]: "desc" }))}
                                        className={`px-2 py-0.5 rounded text-[9px] font-bold border transition-colors ${sortDirection === "desc" ? "bg-primary/20 border-primary text-primary" : "bg-transparent border-border text-muted-foreground"}`}
                                      >
                                        Mayor uso
                                      </button>
                                      <button
                                        onClick={() => setDiskSorts(prev => ({ ...prev, [target.id]: "asc" }))}
                                        className={`px-2 py-0.5 rounded text-[9px] font-bold border transition-colors ${sortDirection === "asc" ? "bg-primary/20 border-primary text-primary" : "bg-transparent border-border text-muted-foreground"}`}
                                      >
                                        Menor uso
                                      </button>
                                    </div>

                                    <div className="space-y-2 max-h-[220px] overflow-y-auto pr-1">
                                      {(() => {
                                        const rows = metrics?.filesystems || (metrics?.disk ? [{ ...metrics.disk, name: metrics.disk.mount || "/" }] : []);
                                        if (!rows.length) return <p className="text-xs text-muted-foreground text-center py-4">Sin datos de disco.</p>;

                                        const sorted = [...rows].sort((a, b) => {
                                          const left = Number(a.usedPercent || 0);
                                          const right = Number(b.usedPercent || 0);
                                          return sortDirection === "asc" ? left - right : right - left;
                                        });

                                        return sorted.map((fs, idx) => {
                                          const pct = Number(fs.usedPercent || 0);
                                          const barTone = pct >= 90 ? "bg-rose-500" : pct >= 75 ? "bg-amber-500" : "bg-emerald-400";
                                          
                                          return (
                                            <div key={idx} className="space-y-1">
                                              <div className="flex justify-between text-xs font-medium">
                                                <span className="font-bold text-foreground/90 truncate max-w-[120px]">{fs.name || fs.mount}</span>
                                                <span className="text-muted-foreground text-[9px]">{fs.used} / {fs.size}</span>
                                              </div>
                                              <div className="w-full h-2.5 bg-background/80 border border-border/20 rounded-full overflow-hidden relative">
                                                <div 
                                                  className={`h-full ${barTone} transition-all duration-500 flex items-center justify-end pr-1`} 
                                                  style={{ width: `${Math.max(0, Math.min(100, pct))}%` }}
                                                >
                                                  {pct > 20 && <span className="text-[8px] font-black text-black">{Math.round(pct)}%</span>}
                                                </div>
                                                {pct <= 20 && <span className="absolute right-1 top-0 text-[8px] font-black text-muted-foreground">{Math.round(pct)}%</span>}
                                              </div>
                                            </div>
                                          );
                                        });
                                      })()}
                                    </div>
                                  </div>
                                )}

                                {activeTab === "services" && (
                                  <div className="space-y-3 max-h-[300px] overflow-y-auto pr-1">
                                    {hasDocker ? (
                                      <div className="space-y-2">
                                        <h4 className="text-[9px] font-black uppercase tracking-wider text-muted-foreground flex items-center gap-1.5 border-b border-border/10 pb-1">
                                          <Layers className="h-3.5 w-3.5" />
                                          Contenedores Docker
                                        </h4>
                                        <div className="grid grid-cols-1 gap-1.5">
                                          {metrics.docker.containers.map((container, idx) => {
                                            const cpu = Number(container.cpuPercent || 0);
                                            const ram = Number(container.memoryPercent || 0);
                                            const isHot = cpu >= 70 || ram >= 70;
                                            
                                            return (
                                              <div 
                                                key={idx} 
                                                className={`p-2 rounded-lg bg-background/20 border text-[11px] ${
                                                  isHot ? "border-rose-500/20 bg-rose-500/5" : "border-border/10"
                                                }`}
                                              >
                                                <div className="flex items-center justify-between gap-2">
                                                  <div className="flex items-center gap-1.5 min-w-0">
                                                    <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${
                                                      container.status === "running" ? "bg-emerald-400 animate-pulse" :
                                                      container.status === "restarting" ? "bg-amber-400" : "bg-rose-500"
                                                    }`} />
                                                    <span className="font-bold text-foreground truncate" title={`${container.name} (${container.image})`}>
                                                      {container.name}
                                                    </span>
                                                  </div>
                                                  <span className="text-[10px] text-muted-foreground shrink-0">{formatContainerUptime(container.statusText)}</span>
                                                </div>
                                                <div className="flex gap-3 text-[10px] mt-1 text-muted-foreground">
                                                  <span>CPU: <strong className={cpu >= 70 ? "text-rose-400 font-bold" : "text-foreground"}>{cpu.toFixed(1)}%</strong></span>
                                                  <span>RAM: <strong className={ram >= 70 ? "text-rose-400 font-bold" : "text-foreground"}>{container.memoryUsage || `${ram.toFixed(1)}%`}</strong></span>
                                                </div>
                                              </div>
                                            );
                                          })}
                                        </div>
                                      </div>
                                    ) : null}

                                    {hasShareplex ? (
                                      <div className="space-y-2 border-t border-border/10 pt-2.5">
                                        <h4 className="text-[9px] font-black uppercase tracking-wider text-muted-foreground flex items-center gap-1.5 border-b border-border/10 pb-1">
                                          <Database className="h-3.5 w-3.5" />
                                          SharePlex Replicación
                                        </h4>
                                        <div className="flex items-center justify-between p-2 rounded-lg bg-background/20 border border-border/10 text-xs">
                                          <div className="flex items-center gap-2">
                                            <span className={`w-2 h-2 rounded-full ${metrics.shareplex.running ? "bg-emerald-400" : "bg-rose-500 animate-pulse"}`} />
                                            <span className="font-bold text-foreground">sp_cop / shareplex</span>
                                          </div>
                                          <div className="text-right">
                                            <strong className={`font-black ${metrics.shareplex.running ? "text-emerald-400" : "text-rose-400"}`}>
                                              {metrics.shareplex.running ? "ACTIVO" : "INACTIVO"}
                                            </strong>
                                            <span className="block text-[9px] text-muted-foreground">{metrics.shareplex.processCount || 0} procesos</span>
                                          </div>
                                        </div>
                                      </div>
                                    ) : null}

                                    {!hasDocker && !hasShareplex && (
                                      <p className="text-xs text-muted-foreground text-center py-6">Sin servicios detectados.</p>
                                    )}
                                  </div>
                                )}
                              </div>
                            </div>
                          )}
                        </article>
                      );
                    })}
                  </div>
                </div>
              </section>
            );
          })}
          {sortedTargets.length === 0 && (
            <div className="rounded-xl border border-dashed border-border p-12 text-center text-muted-foreground">
              Agrega tu primer servidor utilizando el botón "Agregar Servidor" superior para iniciar el monitoreo.
            </div>
          )}
        </div>
      </div>

      {/* CRUD MODAL FOR ADDING / EDITING SERVER */}
      {isEditModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-background/80 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-card w-full max-w-lg border border-border shadow-2xl rounded-2xl overflow-hidden animate-in zoom-in-95 duration-200">
            <div className="bg-gradient-to-r from-primary/10 to-transparent border-b border-border/50 p-5 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="p-2.5 rounded-xl bg-primary/10 text-primary">
                  <Server className="h-5 w-5" />
                </div>
                <div>
                  <h2 className="text-lg font-black text-foreground">{selectedTarget ? "Editar Servidor" : "Agregar Servidor"}</h2>
                  <p className="text-xs text-muted-foreground">Configura los parámetros de monitoreo.</p>
                </div>
              </div>
              <button 
                onClick={() => setIsEditModalOpen(false)}
                className="w-8 h-8 rounded-full bg-white/5 hover:bg-white/10 flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors"
              >
                <X size={16} />
              </button>
            </div>

            <form onSubmit={handleSaveServer} className="p-5 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5 col-span-2">
                  <label className="text-[10px] font-black uppercase tracking-wider text-muted-foreground">Nombre</label>
                  <input
                    type="text"
                    required
                    placeholder="Ej. Servidor de Producción"
                    value={formFields.name}
                    onChange={e => setFormFields({ ...formFields, name: e.target.value })}
                    className="w-full bg-background border border-border rounded-xl px-3 py-2 text-sm focus:border-primary/50 outline-none text-foreground"
                  />
                </div>
                
                <div className="space-y-1.5 col-span-2 sm:col-span-1">
                  <label className="text-[10px] font-black uppercase tracking-wider text-muted-foreground">IP / Hostname</label>
                  <input
                    type="text"
                    required
                    placeholder="192.168.8.43"
                    value={formFields.host}
                    onChange={e => setFormFields({ ...formFields, host: e.target.value })}
                    className="w-full bg-background border border-border rounded-xl px-3 py-2 text-sm focus:border-primary/50 outline-none text-foreground"
                  />
                </div>
                
                <div className="space-y-1.5 col-span-2 sm:col-span-1">
                  <label className="text-[10px] font-black uppercase tracking-wider text-muted-foreground">Puerto</label>
                  <input
                    type="number"
                    required
                    min="1"
                    max="65535"
                    value={formFields.port}
                    onChange={e => setFormFields({ ...formFields, port: e.target.value })}
                    className="w-full bg-background border border-border rounded-xl px-3 py-2 text-sm focus:border-primary/50 outline-none text-foreground"
                  />
                </div>

                <div className="space-y-1.5 col-span-2 sm:col-span-1">
                  <label className="text-[10px] font-black uppercase tracking-wider text-muted-foreground">Tipo de Monitoreo</label>
                  <select
                    value={formFields.type}
                    onChange={e => setFormFields({ ...formFields, type: e.target.value })}
                    className="w-full bg-background border border-border rounded-xl px-3 py-2 text-sm focus:border-primary/50 outline-none text-foreground"
                  >
                    <option value="linux">Linux completo por SSH</option>
                    <option value="tcp">Solo validación TCP Puerto</option>
                  </select>
                </div>

                <div className="space-y-1.5 col-span-2 sm:col-span-1">
                  <label className="text-[10px] font-black uppercase tracking-wider text-muted-foreground">Usuario SSH</label>
                  <input
                    type="text"
                    placeholder="Opcional"
                    disabled={formFields.type === "tcp"}
                    value={formFields.username}
                    onChange={e => setFormFields({ ...formFields, username: e.target.value })}
                    className="w-full bg-background border border-border rounded-xl px-3 py-2 text-sm focus:border-primary/50 outline-none text-foreground disabled:opacity-50"
                  />
                </div>

                <div className="space-y-1.5 col-span-2">
                  <label className="text-[10px] font-black uppercase tracking-wider text-muted-foreground">Contraseña SSH</label>
                  <input
                    type="password"
                    placeholder={selectedTarget ? "Dejar vacía para conservar anterior" : "Opcional"}
                    disabled={formFields.type === "tcp"}
                    value={formFields.password}
                    onChange={e => setFormFields({ ...formFields, password: e.target.value })}
                    className="w-full bg-background border border-border rounded-xl px-3 py-2 text-sm focus:border-primary/50 outline-none text-foreground disabled:opacity-50"
                  />
                </div>

                <div className="space-y-1.5 col-span-2">
                  <label className="text-[10px] font-black uppercase tracking-wider text-muted-foreground">Etiquetas (Separadas por comas)</label>
                  <input
                    type="text"
                    placeholder="producción, docker, db"
                    value={formFields.tags}
                    onChange={e => setFormFields({ ...formFields, tags: e.target.value })}
                    className="w-full bg-background border border-border rounded-xl px-3 py-2 text-sm focus:border-primary/50 outline-none text-foreground"
                  />
                </div>

                <div className="col-span-2 flex items-center gap-2 pt-1">
                  <input
                    type="checkbox"
                    id="target-enabled"
                    checked={formFields.enabled}
                    onChange={e => setFormFields({ ...formFields, enabled: e.target.checked })}
                    className="w-4 h-4 text-primary bg-background border-border rounded focus:ring-primary focus:ring-1"
                  />
                  <label htmlFor="target-enabled" className="text-xs font-bold text-foreground">Monitoreo activo para este servidor</label>
                </div>
              </div>

              <div className="flex gap-2 justify-between border-t border-border/20 pt-4 mt-5">
                {selectedTarget ? (
                  <button
                    type="button"
                    onClick={handleDeleteServer}
                    className="flex items-center gap-1.5 bg-rose-500/10 border border-rose-500/20 text-rose-400 hover:bg-rose-500/20 px-4 py-2.5 rounded-xl text-xs font-black uppercase tracking-wider transition-all"
                  >
                    <Trash2 size={14} />
                    Eliminar
                  </button>
                ) : <div />}
                
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setIsEditModalOpen(false)}
                    className="px-4 py-2.5 rounded-xl border border-border text-xs font-black uppercase tracking-wider transition-all hover:bg-muted"
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    className="px-5 py-2.5 rounded-xl bg-primary text-primary-foreground text-xs font-black uppercase tracking-wider hover:shadow-[0_0_15px_rgba(59,130,246,0.3)] transition-all"
                  >
                    Guardar
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ANALYSIS ADVANCED MODAL */}
      {isAnalysisModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-background/80 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-card w-full max-w-4xl max-h-[85vh] border border-border shadow-2xl rounded-2xl overflow-hidden flex flex-col animate-in zoom-in-95 duration-200">
            <div className="bg-gradient-to-r from-primary/10 to-transparent border-b border-border/50 p-5 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="p-2.5 rounded-xl bg-primary/10 text-primary">
                  <Activity className="h-5 w-5 animate-pulse" />
                </div>
                <div>
                  <h2 className="text-lg font-black text-foreground">Análisis de Infraestructura</h2>
                  <p className="text-xs text-muted-foreground">Análisis cruzado profundo y top de recursos consumidos.</p>
                </div>
              </div>
              <button 
                onClick={() => setIsAnalysisModalOpen(false)}
                className="w-8 h-8 rounded-full bg-white/5 hover:bg-white/10 flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors"
              >
                <X size={16} />
              </button>
            </div>

            <div className="p-6 overflow-y-auto space-y-6 flex-1">
              {loadingAnalysis ? (
                <div className="flex flex-col items-center justify-center py-12 gap-3">
                  <Loader2 className="h-8 w-8 animate-spin text-primary" />
                  <span className="text-xs font-black uppercase text-muted-foreground tracking-widest animate-pulse">Procesando Análisis...</span>
                </div>
              ) : analysisData ? (
                <div className="space-y-6">
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    <div className="p-3 rounded-xl bg-background border border-border/40 text-center">
                      <span className="text-[10px] font-black text-muted-foreground uppercase block">Servidores</span>
                      <strong className="text-2xl font-black text-foreground mt-1 block">{analysisData.summary?.total ?? 0}</strong>
                    </div>
                    <div className="p-3 rounded-xl bg-emerald-500/5 border border-emerald-500/10 text-center">
                      <span className="text-[10px] font-black text-emerald-500/80 uppercase block">En Línea</span>
                      <strong className="text-2xl font-black text-emerald-400 mt-1 block">{analysisData.summary?.online ?? 0}</strong>
                    </div>
                    <div className="p-3 rounded-xl bg-rose-500/5 border border-rose-500/10 text-center">
                      <span className="text-[10px] font-black text-rose-500/80 uppercase block">Degradados / Off</span>
                      <strong className="text-2xl font-black text-rose-400 mt-1 block">
                        {(analysisData.summary?.degraded ?? 0) + (analysisData.summary?.offline ?? 0)}
                      </strong>
                    </div>
                    <div className="p-3 rounded-xl bg-primary/5 border border-primary/10 text-center">
                      <span className="text-[10px] font-black text-primary uppercase block">Docker Activos</span>
                      <strong className="text-2xl font-black text-foreground mt-1 block">{analysisData.summary?.containers ?? 0}</strong>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                    <div className="space-y-2">
                      <h3 className="text-xs font-black text-muted-foreground uppercase tracking-widest flex items-center gap-1.5 border-b border-border/20 pb-1.5">
                        <Cpu size={14} className="text-sky-400" />
                        Mayor Consumo RAM
                      </h3>
                      <div className="space-y-1.5">
                        {(analysisData.resources?.highestRam || []).map((row, idx) => (
                          <div key={idx} className="flex justify-between items-center text-xs p-2 rounded bg-background/40 border border-border/20">
                            <span className="font-bold text-foreground">{row.name}</span>
                            <span className={`font-black ${Number(row.ramPercent) >= 80 ? "text-rose-400" : "text-sky-400"}`}>
                              {(row.ramPercent || 0).toFixed(1)}%
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>

                    <div className="space-y-2">
                      <h3 className="text-xs font-black text-muted-foreground uppercase tracking-widest flex items-center gap-1.5 border-b border-border/20 pb-1.5">
                        <Cpu size={14} className="text-emerald-400" />
                        Mayor Consumo CPU
                      </h3>
                      <div className="space-y-1.5">
                        {(analysisData.resources?.highestCpu || []).map((row, idx) => (
                          <div key={idx} className="flex justify-between items-center text-xs p-2 rounded bg-background/40 border border-border/20">
                            <span className="font-bold text-foreground">{row.name}</span>
                            <span className={`font-black ${Number(row.cpuPercent) >= 80 ? "text-rose-400" : "text-emerald-400"}`}>
                              {(row.cpuPercent || 0).toFixed(1)}%
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>

                    <div className="space-y-2 col-span-1 md:col-span-2">
                      <h3 className="text-xs font-black text-muted-foreground uppercase tracking-widest flex items-center gap-1.5 border-b border-border/20 pb-1.5">
                        <HardDrive size={14} className="text-amber-500" />
                        Particiones con Mayor Uso
                      </h3>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        {(analysisData.partitions?.highestUsage || []).slice(0, 8).map((row, idx) => (
                          <div key={idx} className="flex justify-between items-center text-xs p-2.5 rounded bg-background/40 border border-border/20">
                            <div>
                              <span className="font-bold text-foreground block">{row.serverName}</span>
                              <span className="text-[10px] text-muted-foreground">{row.name} &bull; {row.used}/{row.size}</span>
                            </div>
                            <span className={`font-black text-right ${Number(row.usedPercent) >= 75 ? "text-rose-400" : "text-foreground"}`}>
                              {(row.usedPercent || 0).toFixed(1)}%
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>

                    <div className="space-y-2 col-span-1 md:col-span-2">
                      <h3 className="text-xs font-black text-muted-foreground uppercase tracking-widest flex items-center gap-1.5 border-b border-border/20 pb-1.5">
                        <Layers size={14} className="text-primary" />
                        Contenedores Hot (CPU/RAM Elevada)
                      </h3>
                      <div className="space-y-2">
                        {(() => {
                          const containers = (analysisData.containers?.all || []).filter(c => Number(c.cpuPercent) >= 70 || Number(c.memoryPercent) >= 70);
                          if (!containers.length) return <p className="text-xs text-muted-foreground py-4 text-center">Ningún contenedor reporta consumo crítico sobre 70%.</p>;
                          
                          return containers.map((c, idx) => (
                            <div key={idx} className="flex justify-between items-center text-xs p-2.5 rounded bg-background/40 border border-border/20">
                              <div>
                                <span className="font-bold text-foreground block">{c.serverName} &bull; {c.name}</span>
                                <span className="text-[10px] text-muted-foreground">{c.image}</span>
                              </div>
                              <div className="text-right">
                                <span className="block text-[10px] text-muted-foreground font-bold">CPU: {c.cpuPercent.toFixed(1)}%</span>
                                <span className="block text-[10px] text-muted-foreground font-bold">RAM: {c.memoryPercent.toFixed(1)}%</span>
                              </div>
                            </div>
                          ));
                        })()}
                      </div>
                    </div>

                    <div className="space-y-2 col-span-1 md:col-span-2">
                      <h3 className="text-xs font-black text-muted-foreground uppercase tracking-widest flex items-center gap-1.5 border-b border-border/20 pb-1.5">
                        <Database size={14} className="text-emerald-400" />
                        Instancias SharePlex Replicadoras
                      </h3>
                      <div className="space-y-2">
                        {analysisData.shareplex?.length > 0 ? (
                          analysisData.shareplex.map((row, idx) => (
                            <div key={idx} className="flex justify-between items-center text-xs p-2.5 rounded bg-background/40 border border-border/20">
                              <div>
                                <span className="font-bold text-foreground block">{row.serverName}</span>
                                <span className="text-[10px] text-muted-foreground">{row.processes || 0} procesos activos</span>
                              </div>
                              <span className={`font-black text-xs uppercase px-2 py-0.5 rounded ${row.running ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20" : "bg-rose-500/10 text-rose-400 border border-rose-500/20"}`}>
                                {row.running ? "Activo" : "Inactivo"}
                              </span>
                            </div>
                          ))
                        ) : (
                          <p className="text-xs text-muted-foreground py-4 text-center">No se detectaron instancias SharePlex en el clúster.</p>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              ) : (
                <p className="text-xs text-muted-foreground text-center py-8">No hay datos disponibles para el análisis.</p>
              )}
            </div>

            <div className="flex gap-2 justify-end border-t border-border/20 p-5 bg-background/20">
              <button
                type="button"
                onClick={() => setIsAnalysisModalOpen(false)}
                className="px-4 py-2.5 rounded-xl border border-border text-xs font-black uppercase tracking-wider transition-all hover:bg-muted"
              >
                Cerrar Análisis
              </button>
            </div>
          </div>
        </div>
      )}
      <SkylabNotification
        notification={skylabNotification}
        visible={skylabNotifVisible}
        onClose={() => setSkylabNotifVisible(false)}
      />
    </div>
  );
}

