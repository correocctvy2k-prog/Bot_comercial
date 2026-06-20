import { useState, useEffect, useMemo, useContext } from "react";
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
  WifiOff
} from "lucide-react";
import { ResponsiveContainer, AreaChart, Area, Tooltip } from "recharts";
import { toast } from "sonner";
import { servicesTIService } from "@/services/servicesTI.service";
import { PageHeaderContext } from "@/layout/Layout";

// Standard Uptime formatter
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

const alertToneClass = (severity) => {
  if (severity === "critical" || severity === "high") return "bg-rose-500/10 border-rose-500/20 text-rose-400";
  if (severity === "medium") return "bg-amber-500/10 border-amber-500/20 text-amber-400";
  return "bg-sky-500/10 border-sky-500/20 text-sky-400";
};

// Compact MiniStat widget
const MiniStat = ({ icon, label, value, color = "text-foreground" }) => (
  <div className="min-w-0 rounded-lg border border-border/30 bg-background/40 px-2.5 py-1.5 shadow-sm">
    <p className="flex items-center gap-1.5 text-[9px] font-black uppercase tracking-wider text-muted-foreground [&_svg]:h-3.5 [&_svg]:w-3.5">
      {icon}
      {label}
    </p>
    <p className={`mt-0.5 truncate text-xs font-bold ${color}`}>{value}</p>
  </div>
);

// Circular gauge for metric visualization
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

export default function ServicesTIDashboard() {
  const setPageHeader = useContext(PageHeaderContext);

  // Core monitoring state
  const [state, setState] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [lastUpdate, setLastUpdate] = useState(null);

  // Interface state
  const [activeTabs, setActiveTabs] = useState({});
  const [diskSorts, setDiskSorts] = useState({});
  const [expandedCards, setExpandedCards] = useState({}); // targetId -> boolean
  const [history, setHistory] = useState({}); // targetId -> Array of { time, cpu, ram }
  const [layoutOrder, setLayoutOrder] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem("skylab.nodeMonitor.layout.v2") || "[]");
    } catch {
      return [];
    }
  });

  // Modal control
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [selectedTarget, setSelectedTarget] = useState(null); // null means "Add"
  const [isAnalysisModalOpen, setIsAnalysisModalOpen] = useState(false);
  const [analysisData, setAnalysisData] = useState(null);
  const [loadingAnalysis, setLoadingAnalysis] = useState(false);

  // Form state
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

  // Fetch all state
  const loadState = async (showFeedback = false) => {
    if (showFeedback) setRefreshing(true);
    try {
      const dashboardState = await servicesTIService.getDashboardState();
      setState(dashboardState);
      setLastUpdate(new Date());

      // Update CPU & RAM metric history for trend sparklines
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

            // Limit to last 15 points
            if (nextHistory[id].length > 15) {
              nextHistory[id].shift();
            }
          }
        });
        return nextHistory;
      });
    } catch (error) {
      console.error(error);
      toast.error("Error al conectar con el servidor de monitoreo");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  // Initial load and polling
  useEffect(() => {
    loadState();
    const interval = setInterval(() => loadState(), 60000); // Poll every 60 seconds for premium feel
    return () => clearInterval(interval);
  }, []);

  // Handle re-ordering layout
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

  // Sort targets based on layoutOrder
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

  // Group targets dynamically for premium categorized dashboard
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
      { id: "correo", title: "Correo y Colaboración", subtitle: "Canales de comunicación internos/externos", servers: correoWeb },
      { id: "core", title: "Infraestructura Core y BD", subtitle: "Servicios críticos y almacenamiento central", servers: coreDb },
      { id: "naos", title: "Plataforma NAOS Min. Transporte", subtitle: "Servicios integrados NAOS", servers: naos },
      { id: "otros", title: "Otros Servidores", subtitle: "Equipos y módulos adicionales", servers: otros }
    ].filter(g => g.servers.length > 0);
  }, [sortedTargets]);

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
        toast.success("Monitoreo actualizado");
      }, 5000);
    } catch (error) {
      toast.dismiss(toastId);
      toast.error("Error al iniciar el escaneo");
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
      toast.error("No se pudo obtener el análisis avanzado");
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
          <div className="flex items-center gap-2 bg-background/50 border border-border/40 rounded-xl px-3 py-1.5 text-[10px] font-bold shadow-inner">
            <span className="text-muted-foreground">ESTADO:</span>
            <span className="text-foreground">{totalServers} Totales</span>
            <span className="h-3 w-px bg-border/80" />
            <span className="text-emerald-400">{onlineServers} Online</span>
            {degradedServers > 0 && (
              <>
                <span className="h-3 w-px bg-border/80" />
                <span className="text-amber-400">{degradedServers} Degradados</span>
              </>
            )}
            {offlineServers > 0 && (
              <>
                <span className="h-3 w-px bg-border/80" />
                <span className="text-rose-400">{offlineServers} Offline</span>
              </>
            )}
          </div>

          <button
            onClick={handleSweep}
            disabled={refreshing}
            className="flex items-center gap-1.5 rounded-lg border border-border bg-card px-3 py-2 text-xs font-semibold hover:bg-muted disabled:opacity-50 transition-all"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${refreshing ? "animate-spin" : ""}`} />
            Escanear
          </button>
          
          <button
            onClick={openAnalysis}
            className="flex items-center gap-1.5 rounded-lg bg-primary/10 border border-primary/20 text-primary px-3 py-2 text-xs font-semibold hover:bg-primary/20 transition-all"
          >
            <Activity className="h-3.5 w-3.5" />
            Análisis
          </button>

          <button
            onClick={() => openModal()}
            className="flex items-center gap-1.5 rounded-lg bg-primary text-primary-foreground px-3 py-2 text-xs font-semibold hover:shadow-[0_0_12px_rgba(59,130,246,0.3)] transition-all"
          >
            <Plus className="h-3.5 w-3.5" />
            Agregar
          </button>
        </div>
      </div>
    );
    return () => setPageHeader(null);
  }, [setPageHeader, refreshing, totalServers, onlineServers, degradedServers, offlineServers]);

  if (loading && !state) {
    return (
      <div className="flex h-[60vh] flex-col items-center justify-center gap-4">
        <Loader2 className="h-10 w-10 animate-spin text-primary" />
        <p className="text-sm font-bold text-muted-foreground uppercase tracking-widest animate-pulse">Cargando Dashboard de Servicios...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
      
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
      `}</style>

      {/* Incident Banner */}
      {criticalAlerts.length > 0 && (
        <div className="relative overflow-hidden rounded-xl border border-rose-500/30 bg-rose-500/5 p-4 flex items-center gap-4 animate-[pulse_3s_infinite]">
          <div 
            className="w-3.5 h-3.5 bg-rose-500 rounded-full shrink-0 shadow-[0_0_14px_rgba(244,63,94,0.9)]" 
            style={{ animation: "breathe-red 2s ease-in-out infinite" }}
          />
          <div className="flex-1 min-w-0">
            <span className="text-[10px] font-black uppercase tracking-widest text-rose-500 block">Incidente Crítico</span>
            <strong className="text-sm font-bold text-foreground truncate block mt-0.5">
              {criticalAlerts[0].targetName} &bull; {criticalAlerts[0].title}
            </strong>
            <p className="text-xs text-muted-foreground mt-0.5">{criticalAlerts[0].message}</p>
          </div>
          <div className="text-xs font-black bg-rose-500/20 text-rose-400 px-3 py-1.5 rounded-lg border border-rose-500/20">
            {criticalAlerts.length} Fallas
          </div>
        </div>
      )}

      {/* Main Grid Content */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12 items-start">
        
        {/* Active Smart Alerts Sidebar */}
        {state?.smartAlerts && state.smartAlerts.length > 0 && (
          <section className="lg:col-span-3 space-y-4 rounded-xl border border-border bg-card/25 p-4 backdrop-blur-sm">
            <div className="flex items-center justify-between border-b border-border/40 pb-3">
              <h2 className="text-xs font-black uppercase tracking-widest text-muted-foreground flex items-center gap-2">
                <AlertTriangle className="h-4 w-4 text-amber-500" />
                Alertas Activas
              </h2>
              <span className="rounded-full bg-border/50 text-[10px] px-2 py-0.5 font-bold text-foreground">
                {state.smartAlerts.length}
              </span>
            </div>
            
            <div className="space-y-3 max-h-[550px] overflow-y-auto pr-1">
              {state.smartAlerts.slice(0, 8).map(alert => (
                <div key={alert.id} className={`p-3 rounded-lg border flex flex-col gap-1.5 ${alertToneClass(alert.severity)}`}>
                  <div className="flex items-start justify-between gap-2">
                    <strong className="text-[11px] font-bold uppercase truncate">{alert.targetName} &bull; {alert.title}</strong>
                    <span className="text-[9px] uppercase tracking-wider opacity-85">{alert.severity}</span>
                  </div>
                  <p className="text-xs font-medium leading-relaxed opacity-95">{alert.message}</p>
                  {alert.recommendation && (
                    <div className="text-[10px] border-t border-current/10 pt-1.5 opacity-80">
                      <span className="font-bold">Acción: </span>{alert.recommendation}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Categorized Servers Panels */}
        <div className={`${state?.smartAlerts && state.smartAlerts.length > 0 ? "lg:col-span-9" : "lg:col-span-12"} space-y-6`}>
          {categorizedGroups.map((group) => (
            <section key={group.id} className="rounded-xl border border-border/60 bg-card/35 p-4 backdrop-blur-sm">
              
              {/* Group Header */}
              <div className="mb-4 flex flex-col gap-2 border-b border-border/30 pb-3 lg:flex-row lg:items-center lg:justify-between">
                <div>
                  <h2 className="flex items-center gap-2 text-base font-black text-foreground">
                    <Server className="h-4 w-4 text-primary" />
                    {group.title}
                  </h2>
                  <p className="text-[11px] text-muted-foreground">{group.subtitle}</p>
                </div>
                <div className="text-[10px] font-bold uppercase text-muted-foreground">
                  {group.servers.length} {group.servers.length === 1 ? "servidor" : "servidores"}
                </div>
              </div>

              {/* Grid of Server Tiles */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
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

                  // Status dot glow effects
                  const pingColor = status === "online" 
                    ? "bg-emerald-400 shadow-[0_0_12px_rgba(52,211,153,0.7)]" 
                    : status === "degraded"
                      ? "bg-amber-400 shadow-[0_0_12px_rgba(245,158,11,0.7)] animate-pulse"
                      : status === "offline"
                        ? "bg-rose-500 shadow-[0_0_12px_rgba(244,63,94,0.8)] animate-pulse"
                        : "bg-slate-600";

                  return (
                    <article 
                      key={target.id} 
                      className={`rounded-xl border transition-all duration-300 ${
                        status === "offline" 
                          ? "border-rose-500/25 bg-rose-500/5 hover:border-rose-500/40" 
                          : isExpanded 
                            ? "border-primary/40 bg-card/60 shadow-lg"
                            : "border-border/40 bg-background/45 hover:border-primary/20"
                      } p-3.5 flex flex-col`}
                    >
                      {/* Header row */}
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
                            {target.host}:{target.port} &bull; {target.type === "linux" ? "SSH" : "TCP"}
                          </p>
                        </div>

                        {/* Action buttons */}
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

                      {/* Tags row */}
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

                      {/* 2x2 Grid Statistics */}
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
                          label="Disco /" 
                          value={metrics?.disk?.usedPercent !== undefined && metrics?.disk?.usedPercent !== null ? `${Math.round(metrics.disk.usedPercent)}%` : "N/D"} 
                          color={metrics?.disk?.usedPercent >= 90 ? "text-rose-400" : metrics?.disk?.usedPercent >= 75 ? "text-amber-400" : "text-emerald-400"}
                        />
                      </div>

                      {/* Expanded diagnostic panels */}
                      {isExpanded && (
                        <div className="mt-4 border-t border-border/20 pt-3 space-y-3.5 animate-in fade-in duration-300">
                          
                          {/* Navigation tab bar */}
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

                          {/* Tab Contents */}
                          <div className="min-h-[140px]">
                            
                            {/* TAB 1: METRICS */}
                            {activeTab === "metrics" && (
                              <div className="space-y-3.5">
                                {/* Gauge counters */}
                                <div className="flex gap-1.5">
                                  <CircleGauge label="CPU" value={metrics?.cpu?.usagePercent} />
                                  <CircleGauge label="RAM" value={metrics?.memory?.usedPercent} />
                                  <CircleGauge label="Swap" value={metrics?.memory?.swap?.usedPercent} />
                                  <CircleGauge label="Disco" value={metrics?.disk?.usedPercent} />
                                </div>

                                {/* Local alerts */}
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

                                {/* Trend AreaChart */}
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

                            {/* TAB 2: PARTITIONS */}
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

                            {/* TAB 3: SERVICES */}
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
            </section>
          ))}
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
    </div>
  );
}
