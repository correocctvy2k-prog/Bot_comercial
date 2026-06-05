import { useState, useEffect } from "react";
import { io } from "socket.io-client";
import { 
  Server, 
  ShieldCheck, 
  ShieldAlert,
  Lock, 
  Clock, 
  CheckCircle2, 
  AlertTriangle, 
  XCircle, 
  Database, 
  HardDrive, 
  RefreshCw,
  History,
  ExternalLink,
  Cpu,
  Activity,
  Trash2
} from "lucide-react";
import { monitoringService } from "@/services/monitoring.service";
import { formatDistanceToNow } from "date-fns";
import { es } from "date-fns/locale";
import { toast } from "sonner";

const STATUS_COLORS = {
  success: "text-emerald-400 bg-emerald-500/10 border-emerald-500/20",
  warning: "text-amber-400 bg-amber-500/10 border-amber-500/20",
  error: "text-rose-400 bg-rose-500/10 border-rose-500/20",
  info: "text-sky-400 bg-sky-500/10 border-sky-500/20",
  gray: "text-slate-400 bg-slate-500/10 border-slate-500/20"
};

const SOCKET_URL = import.meta.env.VITE_MONITORING_BACKEND_URL || 'http://localhost:3001';

const normalizeText = (text) => {
  if (text == null) return text;
  return String(text)
    .replace(/Ã¡/g, 'á')
    .replace(/Ã©/g, 'é')
    .replace(/Ã­/g, 'í')
    .replace(/Ã³/g, 'ó')
    .replace(/Ãº/g, 'ú')
    .replace(/Ã±/g, 'ñ')
    .replace(/Â°/g, '°')
    .replace(/Â/g, '')
    .trim();
};

const formatUptime = (uptime) => {
  const normalized = normalizeText(uptime);
  if (!normalized) return 'N/A';
  return normalized.replace(/\s+dÃ­as/i, ' días');
};

const UpdateBadge = ({ updates }) => {
  if (!updates) return null;
  const isPending = updates.RebootRequired || updates.RebootPending || (updates.PendingCount && updates.PendingCount > 0);
  
  let statusText = 'SO actualizado';
  if (updates.RebootRequired || updates.RebootPending) {
    statusText = 'Reinicio pendiente';
  } else if (updates.PendingCount > 0) {
    statusText = `${updates.PendingCount} actualizaciones pendientes`;
  } else if (updates.Status) {
    statusText = updates.Status === 'OK' ? 'SO actualizado' : normalizeText(updates.Status);
  }
  const details = updates.LastInstalled ? ` · Última instalación: ${normalizeText(updates.LastInstalled)}` : '';

  return (
    <div className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-semibold border ${
      isPending ? 'bg-amber-500/10 text-amber-400 border-amber-500/20' : 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
    }`}>
      {isPending ? <RefreshCw className="w-3 h-3 animate-spin-slow" /> : <CheckCircle2 className="w-3 h-3" />}
      {statusText}{details}
    </div>
  );
};

const WindowsADIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" xmlns="http://www.w3.org/2000/svg">
    <path d="M0 3.449L9.75 2.1v9.645H0V3.45zM10.749 1.95L24 0v11.745H10.75V1.95zM0 12.63h9.75v9.27L0 20.551V12.63zM10.749 12.63H24V24l-13.251-1.95V12.63z"/>
  </svg>
);

const AzureADIcon = () => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor" xmlns="http://www.w3.org/2000/svg">
    <path d="M12 1L1 12l11 11 11-11L12 1zm0 3.5a2.5 2.5 0 110 5 2.5 2.5 0 010-5zm-6 10.5a2.5 2.5 0 110 5 2.5 2.5 0 010-5zm12 0a2.5 2.5 0 110 5 2.5 2.5 0 010-5zm-5-3.3v-2.4a3.5 3.5 0 00-2 0v2.4a3.5 3.5 0 002 0zm-3.5 1.5l-2.1 1.2a3.5 3.5 0 001 1.7l2.1-1.2a3.5 3.5 0 00-1-1.7zm8 0a3.5 3.5 0 00-1 1.7l2.1 1.2a3.5 3.5 0 001-1.7l-2.1-1.2z" />
  </svg>
);

const DCCard = ({ title, role, uptime, servicesOk, servicesTotal, diskSpace, lastBackup, updates, icon, isPrimary, isHealthy, pingStatus, replication, replicationObjects, fsmoStatus, securityEvents, onClick }) => {
  const PING_FRESH_MS = 45000; // ms to consider a ping "fresh"
  const PING_STALE_MS = 120000; // ms to consider a ping stale (old)

  const lastSeen = pingStatus?.receivedAt || pingStatus?.checkedAt || null;
  const isPingFresh = lastSeen && (Date.now() - lastSeen < PING_FRESH_MS);
  const isPingStale = lastSeen && (Date.now() - lastSeen >= PING_FRESH_MS && Date.now() - lastSeen < PING_STALE_MS);
  const freshPing = isPingFresh ? pingStatus : null;
  const statusUp = freshPing?.status === 'UP';
  const isOffline = isPingFresh && !statusUp; // only consider offline when we have a fresh DOWN
  const latency = statusUp ? `${Math.round(freshPing.time)}ms` : '';
  
  // Lógica de salud: solo consideramos saludable un ping fresco con status UP.
  const displayHealthy = statusUp;
  
  const ledColor = isOffline ? 'bg-rose-500 animate-pulse shadow-[0_0_15px_rgba(244,63,94,0.9)]' :
                   statusUp ? 'bg-emerald-400 shadow-[0_0_20px_rgba(52,211,153,0.8)]' :
                   isPingStale ? 'bg-amber-400 shadow-[0_0_10px_rgba(249,115,22,0.25)]' :
                   'bg-slate-600';

  const pulseStyle = isOffline ? {
    animation: 'breathe-red 2s ease-in-out infinite'
  } : statusUp ? {
    animation: 'breathe 3s ease-in-out infinite'
  } : isPingStale ? {
    animation: 'breathe 4s ease-in-out infinite'
  } : {};

  return (
    <div 
      onClick={onClick}
      className={`bg-background/60 border ${!pingStatus ? 'border-border/50' : displayHealthy ? 'border-border' : 'border-rose-500/40'} ${isOffline ? 'bg-rose-500/5' : ''} rounded-xl p-5 transition-all hover:bg-background/80 flex flex-col ${onClick ? 'cursor-pointer hover:border-primary/50' : ''}`}
    >
      <style>{`
        @keyframes breathe {
          0%, 100% { 
            opacity: 1; 
            filter: brightness(1.2) drop-shadow(0 0 10px rgba(52,211,153,0.8)); 
          }
          50% { 
            opacity: 0.5; 
            filter: brightness(0.8) drop-shadow(0 0 4px rgba(52,211,153,0.4)); 
          }
        }
        @keyframes breathe-red {
          0%, 100% { 
            opacity: 1; 
            filter: brightness(1.2) drop-shadow(0 0 12px rgba(244,63,94,0.9)); 
          }
          50% { 
            opacity: 0.4; 
            filter: brightness(0.7) drop-shadow(0 0 5px rgba(244,63,94,0.5)); 
          }
        }
      `}</style>
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-[#0078D4]/10 rounded-lg text-[#0078D4]">
            {icon}
          </div>
          <div>
            <h3 className="text-sm font-bold text-foreground flex items-center gap-2">
              {title}
              {isOffline && <span className="px-1.5 py-0.5 rounded text-[9px] bg-rose-500 text-white font-bold animate-pulse">OFFLINE</span>}
              {!isOffline && latency && <span className="text-[10px] text-emerald-400 font-normal">{latency}</span>}
              {(!freshPing && !isHealthy) && <span className="text-[10px] text-muted-foreground animate-pulse text-[8px]">SIN DATOS</span>}
            </h3>
            <span className="text-[10px] text-muted-foreground uppercase font-semibold tracking-wider">{role}</span>
          </div>
        </div>
        <div 
          className={`w-3 h-3 rounded-full transition-all duration-1000 ${ledColor}`}
          style={pulseStyle}
        ></div>
      </div>

      {/* consolidated KSC card is rendered once at top-level (outside DCCard) */}

      <div className="grid grid-cols-2 gap-3 text-xs mb-3 flex-1">
         <div className="flex flex-col gap-1">
           <span className="text-muted-foreground flex items-center gap-1.5"><Clock className="w-3 h-3" /> Uptime</span>
           <span className="font-medium pl-4">{formatUptime(uptime)}</span>
         </div>
         <div className="flex flex-col gap-1">
           <span className="text-muted-foreground flex items-center gap-1.5"><Activity className="w-3 h-3" /> Servicios</span>
           <span className={`font-bold pl-4 ${isOffline ? 'text-rose-400' : !freshPing ? 'text-amber-400' : servicesOk < servicesTotal ? 'text-rose-400' : 'text-emerald-400'}`}>
             {isOffline ? 'SIN RED' : !freshPing ? 'SIN DATOS' : servicesOk < servicesTotal ? `${servicesTotal - servicesOk} CON FALLA` : "SISTEMA OK"}
           </span>
         </div>
         <div className="flex flex-col gap-1">
           <span className="text-muted-foreground flex items-center gap-1.5"><HardDrive className="w-3 h-3" /> Disco C:</span>
           <span className="font-medium pl-4">
             {diskSpace ? (
               <span className={diskSpace.PercentFree < 15 ? 'text-rose-400' : diskSpace.PercentFree < 25 ? 'text-amber-400' : 'text-emerald-400'}>
                 {diskSpace.FreeGB}GB libres ({diskSpace.PercentFree}%)
               </span>
             ) : 'N/A'}
           </span>
         </div>
         <div className="flex flex-col gap-1">
           <span className="text-muted-foreground flex items-center gap-1.5"><Database className="w-3 h-3" /> Último Backup</span>
           <span className="font-medium pl-4 truncate">{lastBackup}</span>
         </div>
         {replication !== null && (
         <div className="flex flex-col gap-1">
           <span className="text-muted-foreground flex items-center gap-1.5"><RefreshCw className="w-3 h-3" /> Replicación</span>
           <span className={`font-bold pl-4 ${replication === 'OK' ? "text-emerald-400" : replication ? "text-rose-400" : "text-slate-400"}`}>
             {replication || "N/A"}{replicationObjects != null ? ` • ${replicationObjects} obj.` : ""}
           </span>
         </div>
       )}
         {fsmoStatus !== undefined && (
           <div className="flex flex-col gap-1">
             <span className="text-muted-foreground flex items-center gap-1.5"><ShieldCheck className="w-3 h-3" /> FSMO</span>
             <span className={`font-bold pl-4 ${fsmoStatus === 'OK' ? 'text-emerald-400' : 'text-amber-400'}`}>{fsmoStatus || 'N/A'}</span>
           </div>
         )}
         {securityEvents && (
           <div className="flex flex-col gap-1 col-span-2">
             <span className="text-muted-foreground flex items-center gap-1.5"><Lock className="w-3 h-3" /> Seg. 7 días</span>
             <span className="pl-4 flex gap-3">
               <span className="text-rose-400 font-bold">{securityEvents.FailedLogins ?? 0} fallidos</span>
               <span className="text-amber-400">{securityEvents.AccountLockouts ?? 0} bloqueos</span>
             </span>
           </div>
         )}
      </div>

      <div className="flex justify-between items-center border-t border-border/50 pt-3 mt-auto">
        <UpdateBadge updates={updates} />
        {isPrimary && (
          <span className="text-xs font-semibold text-primary flex items-center gap-1 hover:underline bg-primary/10 px-2 py-1 rounded">
            Análisis Profundo <ExternalLink className="w-3.5 h-3.5" />
          </span>
        )}
      </div>
    </div>
  );
};

export default function Monitoring() {
  const [adData, setAdData] = useState(null);
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(true);
  const [lastUpdate, setLastUpdate] = useState(null);
  const [nodes, setNodes] = useState({
    host1: null,
    host2: null,
    dc01: null,
    dc02: null,
    dc03: null,
    ksc: null,
    zk: null
  });
  const [pingData, setPingData] = useState({});
  const [pingTick, setPingTick] = useState(Date.now());
  const [isADModalOpen, setIsADModalOpen] = useState(false);
  const [isKSCModalOpen, setIsKSCModalOpen] = useState(false);
  const [isZKModalOpen, setIsZKModalOpen] = useState(false);
  const [showAllHistory, setShowAllHistory] = useState(false); // Nuevo: control de filtro de fecha

  const fetchData = async () => {
    // No ponemos loading=true aquí para evitar parpadeos en el autorefresh
    try {
      const [host1, host2, dc01, dc02, dc03, ksc, zk] = await Promise.all([
        monitoringService.getLatestStatus('ANFIGANE'),  // ANFIGANE (Antes AD-HOST)
        monitoringService.getLatestStatus('ANFI-SEG'),  // Host 2
        monitoringService.getLatestStatus('AD'),        // AD01
        monitoringService.getLatestStatus('AD-DC02'),   // AD02
        monitoringService.getLatestStatus('AD-DC03'),   // AD03
        monitoringService.getLatestStatus('KSC'),       // Kaspersky
        monitoringService.getLatestStatus('SERV-ZK')    // ZKBio / Control de Acceso
      ]);
      
      setNodes({ host1, host2, dc01, dc02, dc03, ksc, zk });
      setAdData(dc01);
      
      // 2. Historial unificado de todos los servicios
      const services = ['ANFIGANE', 'ANFI-SEG', 'AD', 'AD-DC02', 'AD-DC03', 'KSC', 'SERV-ZK'];
      const historyPromises = services.map(s => monitoringService.getHistory(s));
      const historyResults = await Promise.all(historyPromises);
      
      // Combinar y ordenar por fecha (el nombre del archivo contiene el timestamp)
      const allFiles = [];
      historyResults.forEach((res, index) => {
        if (res.files) {
          res.files.forEach(file => {
            // Filtrado preventivo: Solo JSON y archivos que empiecen con report_
            if (file.toLowerCase().endsWith('.json') && file.startsWith('report_')) {
              allFiles.push({
                name: file,
                service: services[index]
              });
            }
          });
        }
      });
      
      // Ordenar por fecha descendente (más recientes primero)
      setHistory(allFiles.sort((a, b) => b.name.localeCompare(a.name)));
      
      setLastUpdate(new Date());
    } catch (error) {
      console.error("Error fetching monitoring data", error);
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteHistory = async (service, filename) => {
    if (!window.confirm(`¿Estás seguro de que deseas eliminar el reporte ${filename}?`)) return;
    
    const success = await monitoringService.deleteHistory(service, filename);
    if (success) {
      toast.success('Reporte eliminado correctamente');
      fetchData(); // Refrescar lista
    } else {
      toast.error('Error al eliminar el reporte');
    }
  };

  const filteredHistory = (showAllHistory 
    ? history 
    : history.filter(item => {
        // Para el filtro de "Solo Hoy", usamos la fecha local
        const today = new Date().toLocaleDateString('en-CA'); // YYYY-MM-DD local
        // Extraer la fecha del nombre del archivo (UTC) y convertirla a local para comparar
        try {
          const name = item.name.replace('report_', '').replace('.json', '');
          const parts = name.split('T');
          const isoStr = parts[0] + 'T' + parts[1].replace(/-/g, ':').replace(/:(\d{3})Z$/, '.$1Z');
          const fileDate = new Date(isoStr).toLocaleDateString('en-CA');
          return fileDate === today;
        } catch (e) {
          return false;
        }
      })).filter(item => item.name.toLowerCase().endsWith('.json')); // Filtrado reforzado e insensible a mayúsculas

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 60000); // Actualizar cada minuto

    // Conectar WebSocket para Ping Heartbeat con Token de Autenticación
    // Extracción inteligente del Token de Supabase
    const getSupabaseToken = () => {
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key.includes('-auth-token')) {
          try {
            const session = JSON.parse(localStorage.getItem(key));
            return session?.access_token;
          } catch (e) { return null; }
        }
      }
      return null;
    };

    const token = getSupabaseToken();
    const socket = io(SOCKET_URL, {
      auth: { token }
    });
    
    socket.on('connect', () => {
      console.log("✅ [SOCKET] Conectado al servidor de monitoreo");
    });

    socket.on('monitoring:heartbeat', (data) => {
      console.log("📡 [HEARTBEAT] Datos de ping recibidos:", data);
      const timestamped = Object.fromEntries(
        Object.entries(data).map(([key, value]) => {
          const serverTs = value?.checkedAt;
          const receivedAt = Date.now(); // use client receipt time as authoritative for freshness
          return [key, { ...value, receivedAt, checkedAt: serverTs }];
        })
      );
      setPingData(timestamped);
    });

    socket.on('connect_error', (error) => {
      console.error("❌ [SOCKET] Error de conexión:", error);
    });

    return () => {
      clearInterval(interval);
      socket.disconnect();
    };
  }, []);

  useEffect(() => {
    const pingInterval = setInterval(() => {
      setPingTick(Date.now());
    }, 5000);

    return () => clearInterval(pingInterval);
  }, []);

  // Precompute KSC-friendly fallbacks to normalize different report shapes
  const rawK = nodes.ksc || {};
  // Monitor-SERV-KSC.ps1 stores payload as: { Node, Role, ReportDate, LocalHealth, Kaspersky }
  const kscLocal = rawK.LocalHealth || rawK.data?.LocalHealth || {};
  const kscKasp  = rawK.Kaspersky || rawK.data?.Kaspersky || {};

  const kscServicesArray = kscLocal?.Services || kscKasp?.Services || rawK.Services || [];

  let kscServicesOk = Array.isArray(kscServicesArray) ? kscServicesArray.filter(s => {
    try {
      if (typeof s === 'object' && s !== null) {
        // Status 4 is running for Windows services
        if (s.Status === 4 || s.Status === 'Running' || s.Status === 'OK') return true;
      }
      const text = (typeof s === 'string' ? s : (s.Status || s.Name || s.State || s.name || '')).toString().toLowerCase();
      return text.includes('running') || text.includes('ok') || text.includes('activo');
    } catch (e) { return false; }
  }).length : 0;

  let kscServicesTotal = Array.isArray(kscServicesArray) ? kscServicesArray.length : (kscKasp?.Services?.length || 6);

  // Si el payload es simple (ej. Monitor envía Endpoints / Licenses), derivar métricas útiles
  if (rawK?.Endpoints) {
    const tot = rawK.Endpoints.Total ?? rawK.Endpoints.total ?? rawK.Endpoints.TotalEndpoints ?? null;
    const act = rawK.Endpoints.Active ?? rawK.Endpoints.active ?? rawK.Endpoints.ActiveEndpoints ?? null;
    if (typeof tot === 'number' || typeof act === 'number') {
      kscServicesTotal = typeof tot === 'number' ? tot : kscServicesTotal;
      kscServicesOk = typeof act === 'number' ? act : kscServicesOk;
    }
  }

  // Mapear campos comunes: disco, uptime, backup
  let kscDisk = Array.isArray(kscLocal?.Disk) 
    ? kscLocal.Disk[0] 
    : (kscLocal?.Disk?.DeviceID ? kscLocal.Disk : null) 
      || rawK.Disk?.Disks?.find?.(d => d.Drive === 'C:') || null;
      
  const kscUptime = rawK?.Uptime || kscLocal?.Uptime || kscLocal?.System?.Uptime || 'N/A';

  let kscLastBackup =
    kscLocal?.Backup?.UltimoBackup ||
    rawK?.Backups?.Status?.KSC ||
    (rawK?.Backups?.Backups?.find?.(b => b.Ruta?.includes('KSC') || b.Ruta?.includes('SERV-KSC'))?.UltimoBackup) ||
    (nodes.dc01?.Backups?.Backups?.find?.(b => b.Ruta?.includes('KSC') || b.Ruta?.includes('SERV-KSC'))?.UltimoBackup) ||
    'N/A';

  // Si el payload trae Licenses o RAM, podemos mostrar algunos valores alternativos
  if (!kscDisk && rawK?.RAM && rawK.RAM.FreeGB) {
    // No hay disco en payload simple, pero mostramos RAM en el lugar de disco de forma legible
    kscDisk = { FreeGB: rawK.RAM.FreeGB, TotalGB: rawK.RAM.TotalGB ?? null, PercentFree: rawK.RAM.PercentFree ?? 0 };
  }

  const rawZ = nodes.zk || {};
  const zkHost = rawZ.Host || rawZ.data?.Host || {};
  const zkVirt = rawZ.Virtualization || rawZ.data?.Virtualization || {};
  const zkOverall = rawZ.Overall || rawZ.data?.Overall || {};
  const zkSystem = rawZ.System || rawZ.data?.System || {};
  const zkRam = rawZ.RAM || rawZ.data?.RAM || {};
  const zkDisk = rawZ.Disk || rawZ.data?.Disk || {};
  const zkDisks = rawZ.Disks || rawZ.data?.Disks || zkDisk.Disks || [];
  const zkServices = rawZ.ZKBio || rawZ.data?.ZKBio || {};
  const zkServiceList = zkServices.Services || rawZ.Services || rawZ.data?.Services || [];
  const zkUpdates = rawZ.Updates || rawZ.data?.Updates || {};
  const zkEvents = rawZ.Events || rawZ.data?.Events || {};
  const zkReportVmPing = rawZ.VM?.Ping || rawZ.data?.VM?.Ping || rawZ.Network?.SelfPing || rawZ.data?.Network?.SelfPing;
  const zkReportHostPing = zkHost.Ping || rawZ.data?.Host?.Ping;
  const toPingStatus = (ping, ip) => {
    if (!ping) return null;
    const status = ping.status || ping.Status || (ping.Pingable ? 'UP' : 'DOWN');
    return {
      status,
      time: ping.time ?? ping.LatencyMs ?? (status === 'UP' ? 1 : null),
      ip,
      checkedAt: Date.now(),
      receivedAt: Date.now()
    };
  };
  const zkVmPing = pingData['SERV-ZK'] || pingData['ZK'] || pingData['192.168.8.112'] || toPingStatus(zkReportVmPing, '192.168.8.112');
  const zkHostPing = pingData['PROXMOX-ZK'] || pingData['PROXMOX'] || pingData['192.168.8.50'] || toPingStatus(zkReportHostPing, '192.168.8.50');
  const zkStatus = (zkOverall.Status || (nodes.zk ? 'OK' : 'SIN DATOS')).toUpperCase();
  const zkStatusColor = zkStatus === 'CRITICAL' || zkStatus === 'ERROR'
    ? 'text-rose-400'
    : zkStatus === 'WARNING' || zkStatus === 'ADVERTENCIA'
      ? 'text-amber-400'
      : nodes.zk
        ? 'text-emerald-400'
        : 'text-slate-400';
  const zkPrimaryDisk = Array.isArray(zkDisks)
    ? (zkDisks.find(d => d.DeviceID === 'C:' || d.Drive === 'C:') || zkDisks[0])
    : null;
  const zkCriticalServices = zkServices.CriticalServices || [];
  const zkOnlineService = zkServices.ZKBIOOnline || zkCriticalServices.find?.(s => String(s.Name || s.DisplayName || '').toLowerCase().includes('zkbioonline')) || zkServiceList.find?.(s => String(s.Name || s.DisplayName || '').toLowerCase().includes('zkbioonline'));
  const zkRunningServices = zkServices.CriticalServicesOk ?? zkCriticalServices.filter?.(s => s.Healthy || s.State === 'Running' || s.Status === 'Running' || s.Status === 4).length ?? zkServices.RunningCount ?? zkServiceList.filter?.(s => s.State === 'Running' || s.Status === 'Running' || s.Status === 4).length ?? 0;
  const zkTotalServices = zkServices.CriticalServicesTotal ?? zkCriticalServices.length ?? zkServices.TotalCount ?? zkServiceList.length ?? 0;
  const zkOnlineServiceStatus = zkOnlineService?.State || zkOnlineService?.Status || 'N/D';
  const zkHostStatus = (zkHost.Status || 'SIN DATOS').toUpperCase();
  const zkHostStatusColor = zkHostStatus === 'CRITICAL' || zkHostStatus === 'ERROR'
    ? 'text-rose-400'
    : zkHostStatus === 'WARNING'
      ? 'text-amber-400'
      : zkHost.Status
        ? 'text-emerald-400'
        : 'text-slate-400';

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-700">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">Monitoreo de Infraestructura</h1>
          <p className="text-muted-foreground text-sm mt-1">Estado de salud de servidores locales y cumplimiento ISO 27001</p>
        </div>
        <button 
          onClick={fetchData}
          disabled={loading}
          className="flex items-center gap-2 bg-card border border-border hover:bg-muted transition-colors px-4 py-2 rounded-lg text-sm font-medium"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          {loading ? 'Actualizando...' : 'Actualizar ahora'}
        </button>
      </div>


      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6 mb-8">

        <div className={`bg-card/40 backdrop-blur-sm border rounded-xl p-5 ${pingData['AD-HOST']?.status === 'DOWN' ? 'border-rose-500/40' : 'border-border'}`}>
          <div className="flex items-center justify-between mb-5">
            <div className="flex items-center gap-3">
              <div className={`p-3 rounded-xl ${pingData['AD-HOST']?.status === 'DOWN' ? 'bg-rose-500/20 text-rose-400' : 'bg-sky-500/20 text-sky-400'}`}>
                <Server className="w-6 h-6" />
              </div>
              <div className="flex flex-col">
                <h2 className="text-lg font-bold flex items-center gap-2">
                  ANFIGANE
                  <div 
                    className={`w-3 h-3 rounded-full ${(!pingData['AD-HOST'] && !pingData['ANFIGANE']) ? 'bg-slate-600' : (pingData['AD-HOST']?.status === 'UP' || pingData['ANFIGANE']?.status === 'UP') ? 'bg-emerald-400' : 'bg-rose-500'} ${ (pingData['AD-HOST']?.status === 'UP' || pingData['ANFIGANE']?.status === 'UP') ? 'animate-pulse shadow-[0_0_8px_rgba(52,211,153,0.5)]' : ''}`}
                    style={{
                      animation: (!pingData['AD-HOST'] && !pingData['ANFIGANE']) ? 'none' : (pingData['AD-HOST']?.status === 'UP' || pingData['ANFIGANE']?.status === 'UP') ? 'breathe 3s ease-in-out infinite' : 'breathe-red 2s ease-in-out infinite'
                    }}
                  />
                  { (pingData['AD-HOST']?.status === 'UP' || pingData['ANFIGANE']?.status === 'UP') && (
                    <span className="text-xs text-emerald-400 font-normal">
                      {Math.round(pingData['AD-HOST']?.time || pingData['ANFIGANE']?.time || 0)}ms
                    </span>
                  )}
                </h2>
                <div className="flex flex-col gap-0.5">
                  <p className="text-[10px] text-muted-foreground uppercase tracking-wider font-medium">ProLiant / Hyper-V • 192.168.8.43</p>
                  {nodes.host1?.Uptime && (
                    <span className="text-[11px] text-emerald-400/90 font-bold flex items-center gap-1.5">
                      <div className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                      UPTIME: {nodes.host1.Uptime}
                    </span>
                  )}
                </div>
              </div>
            </div>
            {nodes.host1 && (
              <div className="flex flex-wrap items-center gap-2 text-[10px]">
                <div className="flex items-center gap-1 px-2 py-1 bg-background rounded-md border border-border">
                  <Cpu className="w-3 h-3 text-primary" />
                  <span className="text-muted-foreground">RAM:</span>
                  <span className="font-mono">{nodes.host1.RAM?.FreeGB}GB / {nodes.host1.RAM?.TotalGB}GB</span>
                </div>
                <div className="flex items-center gap-1 px-2 py-1 bg-background rounded-md border border-border">
                  <Activity className="w-3 h-3 text-emerald-400" />
                  <span className="font-bold text-emerald-400">{nodes.host1.VMs?.filter(v => v.State === 2 || v.State === 'Running').length}/{nodes.host1.VMs?.length} VMs</span>
                </div>
                <UpdateBadge updates={nodes.host1.Updates} />
              </div>
            )}
          </div>

          <div className="border-t border-border/30 pt-4">
            <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-3 flex items-center gap-1.5">
              <Database className="w-3 h-3" /> Máquinas Virtuales
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {nodes.dc01 ? (
                <DCCard 
                  title="AD01" 
                  role="MASTER DC"
                  uptime={nodes.dc01?.DCs?.Status?.find(d => d.DC === 'AD01')?.Uptime ?? 'N/A'}
                  servicesOk={
                    nodes.dc01?.DCs?.Status?.find(d => d.DC === 'AD01')?.Services?.filter(s => 
                      s.toLowerCase().includes('ok') || s.toLowerCase().includes('running')
                    ).length ?? 0
                  }
                  servicesTotal={nodes.dc01?.DCs?.Status?.find(d => d.DC === 'AD01')?.Services?.length ?? 6}
                  diskSpace={nodes.dc01?.Disk?.Disks?.find(d => d.DC === 'AD01')}
                  lastBackup={
                    nodes.dc01?.Backups?.Backups?.find(b => b.Ruta?.includes('AD01'))?.UltimoBackup ?? 
                    'Desconocido'
                  }
                  replication={nodes.dc01.Replication?.Status ?? 'OK'}
                  securityEvents={nodes.dc01.Security}
                  isHealthy={!!nodes.dc01}
                  pingStatus={pingData['AD']}
                  onClick={() => { setAdData(nodes.dc01); setIsADModalOpen(true); }}
                  icon={<WindowsADIcon />} 
                />
              ) : (
                <div className="bg-background/40 border border-border/50 rounded-lg p-4 animate-pulse h-[200px]"></div>
              )}

              {/* AD02 card (secondary) — restored under ANFIGANE */}
              {nodes.dc02 ? (
                <DCCard
                  title="AD02"
                  role="SECUNDARIO BDC"
                  uptime={nodes.dc02?.Uptime ?? nodes.dc01?.DCs?.Status?.find(d => d.DC === 'AD02' || d.DC === 'DA02')?.Uptime ?? 'N/A'}
                  servicesOk={
                    nodes.dc02?.LocalHealth?.Services?.filter?.(s => s.Status === 'Running' || s.Status === 4 || s.Status === 'OK')?.length ??
                    nodes.dc01?.DCs?.Status?.find(d => d.DC === 'AD02' || d.DC === 'DA02')?.Services?.filter(s => 
                      s.toLowerCase().includes('ok') || s.toLowerCase().includes('running')
                    ).length ?? 0
                  }
                  servicesTotal={nodes.dc02?.LocalHealth?.Services?.length ?? 6}
                  diskSpace={
                    nodes.dc02?.LocalHealth?.Disk?.[0] ??
                    nodes.dc02?.LocalHealth?.Storage?.find?.(d => d.Drive === 'C:' || d.Drive === 'C:\\') ??
                    nodes.dc01?.Disk?.Disks?.find(d => d.DC === 'AD02' || d.DC === 'DA02')
                  }
                  lastBackup={
                    nodes.dc01?.Backups?.Backups?.find(b => b.Ruta?.includes('AD02'))?.UltimoBackup ??
                    'Desconocido'
                  }
                  replication={nodes.dc02?.LocalHealth?.Replication ?? nodes.dc01?.Replication?.Status}
                  updates={nodes.dc02?.LocalHealth?.Updates ?? nodes.dc01?.Updates}
                  isHealthy={!!nodes.dc02 || !!nodes.dc01}
                  pingStatus={pingData['AD-DC02'] || pingData['DA02'] || pingData['AD02']}
                  icon={<WindowsADIcon />}
                  onClick={() => { setAdData(nodes.dc02); setIsADModalOpen(true); }}
                />
              ) : (
                <div className="bg-background/40 border border-border/50 rounded-lg p-4 animate-pulse h-[200px]"></div>
              )}

              {/* AD03 intentionally omitted from ANFIGANE — belongs under ANFI-SEG */}
            </div>
          </div>
        </div>

        <div className={`bg-card/40 backdrop-blur-sm border rounded-xl p-5 ${pingData['ANFI-SEG']?.status === 'DOWN' ? 'border-rose-500/40' : 'border-border'}`}>
          <div className="flex items-center justify-between mb-5">
            <div className="flex items-center gap-3">
              <div className={`p-3 rounded-xl ${pingData['ANFI-SEG']?.status === 'DOWN' ? 'bg-rose-500/20 text-rose-400' : 'bg-purple-500/20 text-purple-400'}`}>
                <Server className="w-6 h-6" />
              </div>
              <div>
                <h2 className="text-lg font-bold flex items-center gap-2">
                  ANFI-SEG13798
                  <div 
                    className={`w-3 h-3 rounded-full ${(!pingData['ANFI-SEG'] && !pingData['ANFI-SEG13798']) ? 'bg-slate-600' : (pingData['ANFI-SEG']?.status === 'UP' || pingData['ANFI-SEG13798']?.status === 'UP') ? 'bg-emerald-400' : 'bg-rose-500'}`}
                    style={{
                      animation: (!pingData['ANFI-SEG'] && !pingData['ANFI-SEG13798']) ? 'none' : (pingData['ANFI-SEG']?.status === 'UP' || pingData['ANFI-SEG13798']?.status === 'UP') ? 'breathe 3s ease-in-out infinite' : 'breathe-red 2s ease-in-out infinite'
                    }}
                  ></div>
                  {pingData['ANFI-SEG']?.status === 'DOWN' && <span className="px-1.5 py-0.5 rounded text-[10px] bg-rose-500 text-white font-bold animate-pulse">OFFLINE</span>}
                  {pingData['ANFI-SEG']?.status === 'UP' && <span className="text-xs text-emerald-400 font-normal">{Math.round(pingData['ANFI-SEG'].time)}ms</span>}
                </h2>
                                <div className="flex flex-col gap-0.5">
                  <p className="text-[10px] text-muted-foreground uppercase tracking-wider font-medium">HP ProLiant DL160 Gen9 / Hyper-V • 192.168.8.41</p>
                  {nodes.host2?.Uptime && (
                    <span className="text-[11px] text-emerald-400/90 font-bold flex items-center gap-1.5">
                      <div className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                      UPTIME: {nodes.host2.Uptime}
                    </span>
                  )}
                </div>
              </div>
            </div>
            {nodes.host2 && (
              <div className="flex flex-wrap items-center gap-2 text-[10px]">
                <div className="flex items-center gap-1 px-2 py-1 bg-background rounded-md border border-border">
                  <Cpu className="w-3 h-3 text-primary" />
                  <span className="font-mono">
                    {(nodes.host2.data?.System?.RAM_Free_GB || nodes.host2.RAM?.FreeGB || 0)}GB / {(nodes.host2.data?.System?.RAM_Total_GB || nodes.host2.RAM?.TotalGB || 0)}GB
                  </span>
                </div>
                <div className="flex items-center gap-1 px-2 py-1 bg-background rounded-md border border-border">
                  <Activity className="w-3 h-3 text-emerald-400" />
                  <span className="font-bold text-emerald-400">
                    {(nodes.host2.data?.VMs || nodes.host2.VMs)?.filter(v => v.State === 2 || v.State === 'Running' || v.State === 'Operating').length || 0}/{(nodes.host2.data?.VMs || nodes.host2.VMs)?.length || 0} VMs
                  </span>
                </div>
                <UpdateBadge updates={nodes.host2.data?.Updates || nodes.host2.Updates} />
              </div>
            )}
          </div>

          <div className="border-t border-border/30 pt-4">
            <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-3 flex items-center gap-1.5">
              <Database className="w-3 h-3" /> Máquinas Virtuales
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">

              {nodes.dc03 ? (
                <DCCard 
                  title="AD03" 
                  role="SECUNDARIO BDC"
                  uptime={
                    nodes.dc03?.Uptime ||
                    nodes.dc03?.LocalHealth?.Uptime ||
                    nodes.dc03?.data?.LocalHealth?.Uptime ||
                    nodes.dc01?.DCs?.Status?.find(d => d.DC === 'AD03' || d.DC === 'DA03')?.Uptime ||
                    'N/A'
                  }
                  servicesOk={
                    nodes.dc03?.LocalHealth?.Services?.filter?.(s => s.Status === 'Running' || s.Status === 4 || s.Status === 'OK')?.length ||
                    nodes.dc03?.data?.LocalHealth?.Services?.filter?.(s => s.Status === 'Running' || s.Status === 4 || s.Status === 'OK')?.length ||
                    nodes.dc01?.DCs?.Status?.find(d => d.DC === 'AD03' || d.DC === 'DA03')?.Services?.filter?.(s => String(s).toLowerCase().includes('ok') || String(s).toLowerCase().includes('running'))?.length ||
                    0
                  }
                  servicesTotal={
                    nodes.dc03?.LocalHealth?.Services?.length ||
                    nodes.dc03?.data?.LocalHealth?.Services?.length ||
                    nodes.dc01?.DCs?.Status?.find(d => d.DC === 'AD03' || d.DC === 'DA03')?.Services?.length ||
                    4
                  }
                  diskSpace={
                    nodes.dc03?.LocalHealth?.Storage?.find?.(d => d.Drive === 'C:' || d.Drive === 'C:\\') ||
                    nodes.dc03?.LocalHealth?.Disk?.[0] ||
                    nodes.dc03?.data?.LocalHealth?.Storage?.find?.(d => d.Drive === 'C:' || d.Drive === 'C:\\') ||
                    nodes.dc03?.data?.LocalHealth?.Disk?.[0] ||
                    nodes.dc01?.Disk?.Disks?.find(d => d.DC === 'AD03' || d.DC === 'DA03') ||
                    null
                  }
                  lastBackup={
                    nodes.dc03?.Backups?.Status?.AD03 ||
                    nodes.dc03?.Backups?.Backups?.find?.(b => b.Ruta?.includes('AD03'))?.UltimoBackup ||
                    nodes.dc01?.Backups?.Status?.AD03 ||
                    nodes.dc01?.Backups?.Backups?.find?.(b => b.Ruta?.includes('AD03'))?.UltimoBackup ||
                    'Desconocido'
                  }
                  replication={
                    nodes.dc03?.LocalHealth?.Replication ||
                    nodes.dc03?.data?.LocalHealth?.Replication ||
                    nodes.dc01?.Replication?.Status ||
                    'N/A'
                  }
                  updates={nodes.dc03?.LocalHealth?.Updates || nodes.dc03?.data?.LocalHealth?.Updates || nodes.dc01?.Updates}
                  isHealthy={
                    !!nodes.dc03 ||
                    pingData['AD-DC03']?.status === 'UP' ||
                    pingData['AD03']?.status === 'UP' ||
                    pingData['192.168.8.46']?.status === 'UP'
                  }
                  pingStatus={pingData['AD-DC03'] || pingData['AD03'] || pingData['DA03'] || pingData['192.168.8.46']}
                  icon={<WindowsADIcon />} 
                />
              ) : (
                <div className="bg-background/30 border border-dashed border-border/40 rounded-xl p-5 flex flex-col items-center justify-center gap-3 opacity-50 hover:opacity-80 transition-opacity min-h-[180px]">
                  <div className="p-2 bg-slate-500/10 rounded-lg text-slate-400">
                    <WindowsADIcon />
                  </div>
                  <div className="text-center">
                    <p className="text-sm font-semibold text-slate-400">AD03</p>
                    <p className="text-[10px] text-muted-foreground uppercase tracking-wider">PRÓXIMAMENTE</p>
                  </div>
                  <div className="w-1.5 h-1.5 rounded-full bg-slate-600"></div>
                </div>
              )}

              {/* SERV-KSC card: occupy second column alongside AD03, show ping to 192.168.8.42 and KSC payload */}
              {nodes.ksc ? (
                <DCCard
                  title="SERV-KSC"
                  role="KSC SERVER"
                  uptime={kscUptime}
                  servicesOk={kscServicesOk}
                  servicesTotal={kscServicesTotal}
                  diskSpace={kscDisk}
                  lastBackup={kscLastBackup}
                  replication={null}
                  updates={nodes.ksc?.data?.Updates || nodes.ksc?.Updates || nodes.dc01?.Updates}
                  isHealthy={!!nodes.ksc}
                  pingStatus={pingData['192.168.8.42'] || pingData['SERV-KSC'] || pingData['KSC'] || pingData['ksc']}
                  icon={<ShieldCheck />}
                  onClick={() => setIsKSCModalOpen(true)}
                />
              ) : (
                <div className="bg-background/30 border border-dashed border-border/40 rounded-xl p-5 flex flex-col items-center justify-center gap-3 opacity-50 hover:opacity-80 transition-opacity min-h-[180px]">
                  <div className="p-2 bg-slate-500/10 rounded-lg text-slate-400">
                    <ShieldCheck />
                  </div>
                  <div className="text-center">
                    <p className="text-sm font-semibold text-slate-400">SERV-KSC</p>
                    <p className="text-[10px] text-muted-foreground uppercase tracking-wider">KSC SERVER</p>
                  </div>
                  <div className="w-1.5 h-1.5 rounded-full bg-slate-600"></div>
                </div>
              )}

            </div>
          </div>
        </div>

      </div>

      {/* LAYOUT MONITOREO DE SERVIDORES KSC + ZK */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
        
        {/* Columna 1: Detalle de Kaspersky (Resumido) */}
        {nodes.ksc && (nodes.ksc.Kaspersky || nodes.ksc.data?.Kaspersky) && (
          <div 
            onClick={() => setIsKSCModalOpen(true)}
            className="bg-card/40 backdrop-blur-sm border border-border rounded-xl p-6 flex flex-col justify-between hover:border-primary/50 cursor-pointer transition-all duration-300 group"
          >
            <div>
              <div className="flex justify-between items-start border-b border-border/50 pb-4 mb-4">
                <div className="flex items-center gap-3">
                  <div className="p-2.5 bg-sky-500/10 text-sky-400 rounded-lg group-hover:scale-105 transition-transform">
                    <ShieldCheck className="w-6 h-6" />
                  </div>
                  <div>
                    <h3 className="text-base font-bold flex items-center gap-2 text-foreground group-hover:text-primary transition-colors">
                      Kaspersky Security Center
                    </h3>
                    <p className="text-xs text-muted-foreground">SERV-KSC • Resumen de Protección</p>
                  </div>
                </div>
                <span className="text-[10px] text-primary flex items-center gap-1 bg-primary/10 px-2 py-1 rounded font-semibold">
                  Detalles <ExternalLink className="w-3 h-3" />
                </span>
              </div>

              {/* Data Summary Grid */}
              <div className="grid grid-cols-2 gap-4 mt-2">
                {/* Antivirus DB status */}
                {(() => {
                  const bd = nodes.ksc.Kaspersky?.BasesDatos || nodes.ksc.data?.Kaspersky?.BasesDatos || {};
                  const state = bd.EstadoGeneral?.toUpperCase() || 'OK';
                  const stateColor = state === 'ADVERTENCIA' ? 'text-amber-400' : 
                                     state === 'ERRORES' || state === 'CRITICO' ? 'text-rose-400' : 
                                     'text-emerald-400';
                  return (
                    <div className="bg-background/30 border border-border/40 rounded-lg p-3">
                      <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Bases de Datos AV</p>
                      <p className={`text-lg font-bold mt-1 ${stateColor}`}>{state}</p>
                      <div className="flex justify-between text-[11px] mt-1 text-muted-foreground">
                        <span>Al día: <strong className="text-emerald-400">{bd.AlDia ?? 0}</strong></span>
                        <span>&gt;1 sem: <strong className="text-rose-400">{bd.MasDeUnaSemana ?? 0}</strong></span>
                      </div>
                    </div>
                  );
                })()}

                {/* Amenazas status */}
                {(() => {
                  const am = nodes.ksc.Kaspersky?.Amenazas || nodes.ksc.data?.Kaspersky?.Amenazas || {};
                  const infected = parseInt(am.DispositivosInfect || '0');
                  const detected = parseInt(am.AmenazasDetectadas || '0');
                  const isDanger = infected > 0 || detected > 0;
                  return (
                    <div className="bg-background/30 border border-border/40 rounded-lg p-3">
                      <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Amenazas Activas</p>
                      <p className={`text-lg font-bold mt-1 ${isDanger ? 'text-rose-400 animate-pulse' : 'text-emerald-400'}`}>
                        {isDanger ? 'AMENAZA' : 'LIMPIO'}
                      </p>
                      <div className="flex justify-between text-[11px] mt-1 text-muted-foreground">
                        <span>Infectados: <strong className={infected > 0 ? 'text-rose-400' : ''}>{infected}</strong></span>
                        <span>Detectadas: <strong className={detected > 0 ? 'text-rose-400' : ''}>{detected}</strong></span>
                      </div>
                    </div>
                  );
                })()}

                {/* Vulnerabilidades */}
                {(() => {
                  const vul = nodes.ksc.Kaspersky?.Vulnerabilidades || nodes.ksc.data?.Kaspersky?.Vulnerabilidades || {};
                  const totalV = (vul.DispCritica || 0) + (vul.DispAlta || 0) + (vul.DispMedia || 0);
                  const isDanger = totalV > 10;
                  return (
                    <div className="bg-background/30 border border-border/40 rounded-lg p-3">
                      <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Vulnerabilidades</p>
                      <p className={`text-lg font-bold mt-1 ${isDanger ? 'text-amber-400' : 'text-emerald-400'}`}>
                        {totalV} Equipos
                      </p>
                      <div className="flex justify-between text-[11px] mt-1 text-muted-foreground">
                        <span>Críticas: <strong className="text-rose-500">{vul.DispCritica ?? 0}</strong></span>
                        <span>Altas: <strong className="text-amber-500">{vul.DispAlta ?? 0}</strong></span>
                      </div>
                    </div>
                  );
                })()}

                {/* Licencias */}
                {(() => {
                  const lic = nodes.ksc.Kaspersky?.Licencias || nodes.ksc.data?.Kaspersky?.Licencias || {};
                  const keys = Array.isArray(lic.Licencias) ? lic.Licencias : [];
                  const activeLic = keys[0] || { DispositivosUsados: 0, LimiteDispositivos: 0, PorcentajeUso: 0 };
                  const state = lic.EstadoGeneral?.toUpperCase() || 'OK';
                  const stateColor = state === 'CRITICO' || state === 'EXCEDIDO' ? 'text-rose-400' : 
                                     state === 'ADVERTENCIA' ? 'text-amber-400' : 
                                     'text-emerald-400';
                  return (
                    <div className="bg-background/30 border border-border/40 rounded-lg p-3">
                      <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Licenciamiento</p>
                      <p className={`text-lg font-bold mt-1 ${stateColor}`}>{activeLic.DispositivosUsados} / {activeLic.LimiteDispositivos}</p>
                      <div className="h-1.5 w-full bg-muted rounded-full overflow-hidden mt-1.5">
                        <div 
                          className={`h-full ${activeLic.PorcentajeUso > 90 ? 'bg-rose-500' : activeLic.PorcentajeUso > 75 ? 'bg-amber-500' : 'bg-emerald-500'}`} 
                          style={{ width: `${activeLic.PorcentajeUso ?? 0}%` }}
                        ></div>
                      </div>
                    </div>
                  );
                })()}
              </div>
            </div>

            {(nodes.ksc.ReportDate || nodes.ksc.data?.ReportDate) && (
              <div className="text-[9px] text-muted-foreground border-t border-border/20 pt-3 mt-4 flex items-center gap-1.5">
                <Clock className="w-3.5 h-3.5 text-sky-400" />
                Actualizado: {nodes.ksc.ReportDate || nodes.ksc.data?.ReportDate}
              </div>
            )}
          </div>
        )}

        {/* Columna 2: PROXMOX-ZK host with SERV-ZK VM */}
        <div
          onClick={() => setIsZKModalOpen(true)}
          className={`bg-card/40 backdrop-blur-sm border rounded-xl p-5 hover:border-primary/50 cursor-pointer transition-all duration-300 group ${zkHostPing?.status === 'DOWN' || zkStatus === 'CRITICAL' || zkVmPing?.status === 'DOWN' ? 'border-rose-500/40' : 'border-border'}`}
        >
          <div className="flex items-center justify-between mb-5">
            <div className="flex items-center gap-3">
              <div className={`p-3 rounded-xl ${zkHostPing?.status === 'DOWN' ? 'bg-rose-500/20 text-rose-400' : 'bg-purple-500/20 text-purple-400'}`}>
                <Server className="w-6 h-6" />
              </div>
              <div>
                <h2 className="text-lg font-bold flex items-center gap-2">
                  {zkHost.Name || zkVirt.HostName || 'PROXMOX-ZK'}
                  <div
                    className={`w-3 h-3 rounded-full ${(!zkHostPing && !zkHost.Status) ? 'bg-slate-600' : (zkHostPing?.status === 'UP' || zkHost.Pingable) ? 'bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.5)]' : 'bg-rose-500'}`}
                    style={{
                      animation: (!zkHostPing && !zkHost.Status) ? 'none' : (zkHostPing?.status === 'UP' || zkHost.Pingable) ? 'breathe 3s ease-in-out infinite' : 'breathe-red 2s ease-in-out infinite'
                    }}
                  />
                  {zkHostPing?.status === 'DOWN' && <span className="px-1.5 py-0.5 rounded text-[10px] bg-rose-500 text-white font-bold animate-pulse">OFFLINE</span>}
                  {zkHostPing?.status === 'UP' && <span className="text-xs text-emerald-400 font-normal">{Math.round(zkHostPing.time)}ms</span>}
                </h2>
                <div className="flex flex-col gap-0.5">
                  <p className="text-[10px] text-muted-foreground uppercase tracking-wider font-medium">Proxmox VE • {zkHost.IP || zkVirt.HostIP || '192.168.8.50'}</p>
                  <span className={`text-[11px] font-bold flex items-center gap-1.5 ${zkHostStatusColor}`}>
                    <div className={`w-1.5 h-1.5 rounded-full ${(zkHostPing?.status === 'UP' || zkHost.Pingable) ? 'bg-emerald-400 animate-pulse' : 'bg-slate-600'}`} />
                    ESTADO HOST: {zkHostStatus}
                  </span>
                </div>
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-end gap-2 text-[10px]">
              <div className="flex items-center gap-1 px-2 py-1 bg-background rounded-md border border-border">
                <Activity className="w-3 h-3 text-purple-400" />
                <span className="text-muted-foreground">Web UI:</span>
                <span className={zkHost.Ports?.WebUI8006 ? 'font-bold text-emerald-400' : 'font-bold text-amber-400'}>{zkHost.Ports?.WebUI8006 ? '8006 OK' : 'N/D'}</span>
              </div>
              <div className="flex items-center gap-1 px-2 py-1 bg-background rounded-md border border-border">
                <Lock className="w-3 h-3 text-sky-400" />
                <span className="text-muted-foreground">SSH:</span>
                <span className={zkHost.Ports?.SSH22 ? 'font-bold text-emerald-400' : 'font-bold text-amber-400'}>{zkHost.Ports?.SSH22 ? '22 OK' : 'N/D'}</span>
              </div>
              <div className="flex items-center gap-1 px-2 py-1 bg-background rounded-md border border-border">
                <Cpu className="w-3 h-3 text-primary" />
                <span className="font-bold text-emerald-400">1/1 VMs</span>
              </div>
              <div className="flex items-center gap-1 px-2 py-1 bg-background rounded-md border border-border">
                <CheckCircle2 className="w-3 h-3 text-emerald-400" />
                <span className="text-muted-foreground">ZK:</span>
                <span className={zkOnlineServiceStatus === 'Running' || zkOnlineServiceStatus === 4 ? 'font-bold text-emerald-400' : 'font-bold text-amber-400'}>
                  {zkOnlineServiceStatus === 'Running' || zkOnlineServiceStatus === 4 ? 'Activo' : zkOnlineServiceStatus}
                </span>
              </div>
            </div>
          </div>

          <div className="border-t border-border/30 pt-4">
            <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-3 flex items-center gap-1.5">
              <Database className="w-3 h-3" /> Máquinas Virtuales
            </p>
            <div className="grid grid-cols-1 gap-4">
              {nodes.zk ? (
                <DCCard
                  title="SERV-ZK"
                  role={`ZKBIOONLINE: ${zkOnlineServiceStatus}`}
                  uptime={rawZ.Uptime || rawZ.data?.Uptime || 'N/A'}
                  servicesOk={zkRunningServices}
                  servicesTotal={zkTotalServices || 1}
                  diskSpace={zkPrimaryDisk}
                  lastBackup="N/A"
                  replication={null}
                  updates={zkUpdates}
                  isHealthy={zkStatus === 'OK' || zkVmPing?.status === 'UP'}
                  pingStatus={zkVmPing}
                  icon={<Server className="w-5 h-5" />}
                  onClick={() => setIsZKModalOpen(true)}
                />
              ) : (
                <div className="bg-background/30 border border-dashed border-border/40 rounded-xl p-5 flex flex-col items-center justify-center gap-3 opacity-70 hover:opacity-90 transition-opacity min-h-[180px]">
                  <div className="p-2 bg-slate-500/10 rounded-lg text-slate-400">
                    <Server className="w-5 h-5" />
                  </div>
                  <div className="text-center">
                    <p className="text-sm font-semibold text-slate-400">SERV-ZK</p>
                    <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Esperando reporte PS1</p>
                  </div>
                  <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
                    <span className={`w-2 h-2 rounded-full ${zkVmPing?.status === 'UP' ? 'bg-emerald-400' : zkVmPing?.status === 'DOWN' ? 'bg-rose-500 animate-pulse' : 'bg-slate-600'}`}></span>
                    {zkVmPing?.status || 'SIN DATOS'}
                    {zkVmPing?.status === 'UP' && <span className="text-emerald-400">{Math.round(zkVmPing.time)}ms</span>}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

      </div>
      
      {/* Modal KSC Detailed Info */}
      {isKSCModalOpen && nodes.ksc && (nodes.ksc.Kaspersky || nodes.ksc.data?.Kaspersky) && (
        <div className="fixed inset-0 z-50 bg-background/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-card border border-border rounded-xl shadow-xl w-full max-w-6xl max-h-[90vh] overflow-hidden flex flex-col animate-in zoom-in-95 duration-200">
            <div className="p-4 border-b border-border flex justify-between items-center bg-muted/30">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-sky-500/10 text-sky-400 rounded-lg">
                  <ShieldCheck className="w-5 h-5" />
                </div>
                <div>
                  <h2 className="text-lg font-bold">Análisis Profundo - Kaspersky Security Center</h2>
                  <p className="text-xs text-muted-foreground">Estado detallado de la protección y licencias (SERV-KSC)</p>
                </div>
              </div>
              <button onClick={() => setIsKSCModalOpen(false)} className="p-2 hover:bg-muted rounded-lg transition-colors">
                <XCircle className="w-5 h-5 text-muted-foreground" />
              </button>
            </div>
            
            <div className="p-6 overflow-y-auto custom-scrollbar space-y-6">
              {(nodes.ksc.ReportDate || nodes.ksc.data?.ReportDate) && (
                <div className="flex justify-end">
                  <span className="text-[10px] text-muted-foreground uppercase tracking-widest font-bold bg-background/50 px-3 py-1.5 rounded-lg border border-border/50 flex items-center gap-1.5">
                    <Clock className="w-3.5 h-3.5 text-sky-400" />
                    Informe: {nodes.ksc.ReportDate || nodes.ksc.data?.ReportDate}
                  </span>
                </div>
              )}

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-4">
                {/* 1. Bases de Datos Antivirus */}
                {(() => {
                  const bd = nodes.ksc.Kaspersky?.BasesDatos || nodes.ksc.data?.Kaspersky?.BasesDatos || {};
                  const state = bd.EstadoGeneral?.toUpperCase() || 'OK';
                  const stateColor = state === 'ADVERTENCIA' ? 'text-amber-400 border-amber-500/20 bg-amber-500/5' : 
                                     state === 'ERRORES' || state === 'CRITICO' ? 'text-rose-400 border-rose-500/20 bg-rose-500/5' : 
                                     'text-emerald-400 border-emerald-500/20 bg-emerald-500/5';
                  return (
                    <div className="bg-background/40 border border-border/50 rounded-xl p-4 flex flex-col justify-between">
                      <div>
                        <div className="flex justify-between items-start mb-2">
                          <span className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Bases de Datos AV</span>
                          <span className={`text-[9px] font-bold px-2 py-0.5 rounded border ${stateColor}`}>{state}</span>
                        </div>
                        <div className="space-y-2 mt-4 text-xs">
                          <div className="flex justify-between">
                            <span className="text-muted-foreground">Al Día:</span>
                            <span className="font-bold text-emerald-400">{bd.AlDia ?? 0}</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-muted-foreground">Últimos 24h:</span>
                            <span className="font-medium">{bd.Ultimas24h ?? 0}</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-muted-foreground">Últimos 3 Días:</span>
                            <span className="font-medium">{bd.Ultimos3Dias ?? 0}</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-muted-foreground">Últimos 7 Días:</span>
                            <span className="font-medium">{bd.Ultimos7Dias ?? 0}</span>
                          </div>
                          <div className="flex justify-between border-t border-border/30 pt-1.5">
                            <span className="text-rose-400 font-bold">&gt; 1 Semana:</span>
                            <span className="font-bold text-rose-400">{bd.MasDeUnaSemana ?? 0}</span>
                          </div>
                        </div>
                      </div>
                      {bd.FechaInforme && (
                        <div className="text-[9px] text-muted-foreground border-t border-border/20 pt-2 mt-4 truncate">
                          Mod: {bd.FechaInforme}
                        </div>
                      )}
                    </div>
                  );
                })()}

                {/* 2. Actualizaciones */}
                {(() => {
                  const act = nodes.ksc.Kaspersky?.Actualizaciones || nodes.ksc.data?.Kaspersky?.Actualizaciones || {};
                  const state = act.EstadoGeneral?.toUpperCase() || 'OK';
                  const stateColor = state === 'ERRORES' || state === 'CRITICO' ? 'text-rose-400 border-rose-500/20 bg-rose-500/5' : 
                                     state === 'ADVERTENCIA' ? 'text-amber-400 border-amber-500/20 bg-amber-500/5' : 
                                     'text-emerald-400 border-emerald-500/20 bg-emerald-500/5';
                  return (
                    <div className="bg-background/40 border border-border/50 rounded-xl p-4 flex flex-col justify-between">
                      <div>
                        <div className="flex justify-between items-start mb-2">
                          <span className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Parches y Updates</span>
                          <span className={`text-[9px] font-bold px-2 py-0.5 rounded border ${stateColor}`}>{state}</span>
                        </div>
                        <div className="space-y-2 mt-4 text-xs">
                          <div className="flex justify-between">
                            <span className="text-muted-foreground">Total Actualiz.:</span>
                            <span className="font-bold">{act.TotalActualizaciones ?? 0}</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-muted-foreground">Vulnerabil. a Rep.:</span>
                            <span className="font-bold text-amber-500">{act.TotalVulnsRepara ?? 0}</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-muted-foreground">Asignadas / No Asig.:</span>
                            <span className="font-medium">{act.Asignadas ?? 0} / {act.NoAsignadas ?? 0}</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-muted-foreground">Instaladas:</span>
                            <span className="font-medium text-emerald-400">{act.Instaladas ?? 0}</span>
                          </div>
                          <div className="flex justify-between border-t border-border/30 pt-1.5">
                            <span className="text-rose-400 font-bold">Con Error / Reinicio:</span>
                            <span className="font-bold text-rose-400">{act.Errores ?? 0} / {act.RequierenReinicio ?? 0}</span>
                          </div>
                        </div>
                      </div>
                      {act.FechaInforme && (
                        <div className="text-[9px] text-muted-foreground border-t border-border/20 pt-2 mt-4 truncate">
                          Mod: {act.FechaInforme}
                        </div>
                      )}
                    </div>
                  );
                })()}

                {/* 3. Vulnerabilidades */}
                {(() => {
                  const vul = nodes.ksc.Kaspersky?.Vulnerabilidades || nodes.ksc.data?.Kaspersky?.Vulnerabilidades || {};
                  const totalV = (vul.DispCritica || 0) + (vul.DispAlta || 0) + (vul.DispMedia || 0);
                  const state = totalV > 50 ? 'PELIGRO' : totalV > 10 ? 'ADVERTENCIA' : 'OK';
                  const stateColor = state === 'PELIGRO' ? 'text-rose-400 border-rose-500/20 bg-rose-500/5' : 
                                     state === 'ADVERTENCIA' ? 'text-amber-400 border-amber-500/20 bg-amber-500/5' : 
                                     'text-emerald-400 border-emerald-500/20 bg-emerald-500/5';
                  return (
                    <div className="bg-background/40 border border-border/50 rounded-xl p-4 flex flex-col justify-between">
                      <div>
                        <div className="flex justify-between items-start mb-2">
                          <span className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Vulnerabilidades</span>
                          <span className={`text-[9px] font-bold px-2 py-0.5 rounded border ${stateColor}`}>{state}</span>
                        </div>
                        <div className="space-y-2 mt-4 text-xs">
                          <div className="flex justify-between">
                            <span className="text-muted-foreground">Dispositivos Sin Vuln.:</span>
                            <span className="font-bold text-emerald-400">{vul.DispSinVulnerabilidad ?? 0}</span>
                          </div>
                          <div className="flex justify-between border-t border-border/20 pt-2">
                            <span className="text-muted-foreground">Severidad Crítica:</span>
                            <span className="font-bold text-rose-500">{vul.DispCritica ?? 0}</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-muted-foreground">Severidad Alta:</span>
                            <span className="font-bold text-amber-500">{vul.DispAlta ?? 0}</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-muted-foreground">Severidad Media:</span>
                            <span className="font-medium text-sky-400">{vul.DispMedia ?? 0}</span>
                          </div>
                        </div>
                      </div>
                      {vul.FechaInforme && (
                        <div className="text-[9px] text-muted-foreground border-t border-border/20 pt-2 mt-4 truncate">
                          Mod: {vul.FechaInforme}
                        </div>
                      )}
                    </div>
                  );
                })()}

                {/* 4. Licencias */}
                {(() => {
                  const lic = nodes.ksc.Kaspersky?.Licencias || nodes.ksc.data?.Kaspersky?.Licencias || {};
                  const state = lic.EstadoGeneral?.toUpperCase() || 'OK';
                  const stateColor = state === 'CRITICO' || state === 'EXCEDIDO' ? 'text-rose-400 border-rose-500/20 bg-rose-500/5' : 
                                     state === 'ADVERTENCIA' ? 'text-amber-400 border-amber-500/20 bg-amber-500/5' : 
                                     'text-emerald-400 border-emerald-500/20 bg-emerald-500/5';
                  const keys = Array.isArray(lic.Licencias) ? lic.Licencias : [];
                  return (
                    <div className="bg-background/40 border border-border/50 rounded-xl p-4 flex flex-col justify-between">
                      <div>
                        <div className="flex justify-between items-start mb-2">
                          <span className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Licenciamiento</span>
                          <span className={`text-[9px] font-bold px-2 py-0.5 rounded border ${stateColor}`}>{state}</span>
                        </div>
                        <div className="space-y-3 mt-4 text-[11px]">
                          {keys.map((l, i) => {
                            const usage = l.PorcentajeUso ?? 0;
                            const usageColor = usage > 90 ? 'bg-rose-500' : usage > 75 ? 'bg-amber-500' : 'bg-emerald-500';
                            return (
                              <div key={i} className="space-y-1">
                                <div className="flex justify-between text-[10px]">
                                  <span className="text-muted-foreground truncate max-w-[120px]">Límite {l.LimiteDispositivos}</span>
                                  <span className="font-bold">{l.DispositivosUsados} / {l.LimiteDispositivos} ({usage}%)</span>
                                </div>
                                <div className="h-1.5 w-full bg-muted rounded-full overflow-hidden">
                                  <div className={`h-full ${usageColor}`} style={{ width: `${usage}%` }}></div>
                                </div>
                              </div>
                            );
                          })}
                          {keys.length === 0 && (
                            <p className="text-xs text-muted-foreground italic text-center py-4">Sin licencias registradas</p>
                          )}
                        </div>
                      </div>
                      {lic.FechaInforme && (
                        <div className="text-[9px] text-muted-foreground border-t border-border/20 pt-2 mt-4 truncate">
                          Mod: {lic.FechaInforme}
                        </div>
                      )}
                    </div>
                  );
                })()}

                {/* 5. Amenazas */}
                {(() => {
                  const am = nodes.ksc.Kaspersky?.Amenazas || nodes.ksc.data?.Kaspersky?.Amenazas || {};
                  const infected = parseInt(am.DispositivosInfect || '0');
                  const detected = parseInt(am.AmenazasDetectadas || '0');
                  const isDanger = infected > 0 || detected > 0;
                  const state = isDanger ? 'AMENAZA' : 'LIMPIO';
                  const stateColor = isDanger ? 'text-rose-400 border-rose-500/20 bg-rose-500/5' : 
                                     'text-emerald-400 border-emerald-500/20 bg-emerald-500/5';
                  return (
                    <div className="bg-background/40 border border-border/50 rounded-xl p-4 flex flex-col justify-between">
                      <div>
                        <div className="flex justify-between items-start mb-2">
                          <span className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Amenazas</span>
                          <span className={`text-[9px] font-bold px-2 py-0.5 rounded border ${stateColor}`}>{state}</span>
                        </div>
                        <div className="space-y-2 mt-4 text-xs">
                          <div className="flex justify-between">
                            <span className="text-muted-foreground">Dispositivos Infectados:</span>
                            <span className={`font-bold ${infected > 0 ? 'text-rose-400 animate-pulse' : ''}`}>{infected}</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-muted-foreground">Amenazas Detectadas:</span>
                            <span className={`font-bold ${detected > 0 ? 'text-rose-400' : ''}`}>{detected}</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-muted-foreground">Grupos Infectados:</span>
                            <span className="font-medium">{am.GruposInfectados ?? 0}</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-muted-foreground">Objetos Distintos:</span>
                            <span className="font-medium">{am.ArchivesDiferentes ?? 0}</span>
                          </div>
                        </div>
                      </div>
                      {am.FechaInforme && (
                        <div className="text-[9px] text-muted-foreground border-t border-border/20 pt-2 mt-4 truncate">
                          Mod: {am.FechaInforme}
                        </div>
                      )}
                    </div>
                  );
                })()}
              </div>

              <div className="flex justify-end pt-4 border-t border-border/30">
                <a 
                  href={monitoringService.getReportHtmlUrl("ksc", "latest")} 
                  target="_blank" 
                  rel="noopener noreferrer"
                  className="flex items-center gap-2 bg-primary text-primary-foreground hover:bg-primary/90 px-4 py-2 rounded-lg font-medium transition-colors"
                >
                  Abrir Reporte HTML de Kaspersky <ExternalLink className="w-4 h-4" />
                </a>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modal ZK Detailed Info */}
      {isZKModalOpen && (
        <div className="fixed inset-0 z-50 bg-background/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-card border border-border rounded-xl shadow-xl w-full max-w-5xl max-h-[90vh] overflow-hidden flex flex-col animate-in zoom-in-95 duration-200">
            <div className="p-4 border-b border-border flex justify-between items-center bg-muted/30">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-purple-500/10 text-purple-400 rounded-lg">
                  <Server className="w-5 h-5" />
                </div>
                <div>
                  <h2 className="text-lg font-bold">Análisis Profundo - SERV-ZK</h2>
                  <p className="text-xs text-muted-foreground">Proxmox 192.168.8.50 • VM Windows 192.168.8.112 • ZKBio CVSecurity</p>
                </div>
              </div>
              <button onClick={() => setIsZKModalOpen(false)} className="p-2 hover:bg-muted rounded-lg transition-colors">
                <XCircle className="w-5 h-5 text-muted-foreground" />
              </button>
            </div>

            <div className="p-6 overflow-y-auto custom-scrollbar space-y-6">
              <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
                <MetricSmall label="Estado General" value={zkStatus} color={zkStatusColor} icon={<Activity className="w-3 h-3" />} />
                <MetricSmall label="Host Proxmox" value={zkHostStatus} color={zkHostStatusColor} icon={<Server className="w-3 h-3" />} />
                <MetricSmall label="ZKBIOOnline" value={zkOnlineServiceStatus} color={zkOnlineServiceStatus === 'Running' || zkOnlineServiceStatus === 4 ? 'text-emerald-400' : 'text-amber-400'} icon={<CheckCircle2 className="w-3 h-3" />} />
                <MetricSmall label="Servicios ZK" value={nodes.zk ? `${zkRunningServices}/${zkTotalServices}` : 'Sin datos'} color={zkServices.Status === 'CRITICAL' ? 'text-rose-400' : 'text-emerald-400'} icon={<CheckCircle2 className="w-3 h-3" />} />
                <MetricSmall label="Uptime VM" value={rawZ.Uptime || rawZ.data?.Uptime || 'N/A'} icon={<Clock className="w-3 h-3" />} />
              </div>

              {!nodes.zk && (
                <div className="bg-background border border-dashed border-border rounded-lg p-6 text-center text-muted-foreground">
                  <Database className="w-10 h-10 mx-auto mb-3 opacity-30" />
                  <p className="text-sm font-medium">Aún no hay reporte de SERV-ZK.</p>
                  <p className="text-xs mt-1">Cuando el PS1 envíe datos, este modal mostrará host, VM, servicios y eventos reales.</p>
                </div>
              )}

              {nodes.zk && (
                <>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="bg-background border border-border rounded-lg p-4">
                      <h4 className="text-sm font-semibold mb-3 border-b border-border/50 pb-2 flex items-center gap-2">
                        <Server className="w-4 h-4 text-purple-400" /> Anfitrión Proxmox
                      </h4>
                      <div className="grid grid-cols-2 gap-3 text-xs">
                        <div><p className="text-muted-foreground">Nombre</p><p className="font-bold">{zkHost.Name || zkVirt.HostName || 'PROXMOX-ZK'}</p></div>
                        <div><p className="text-muted-foreground">IP</p><p className="font-mono">{zkHost.IP || zkVirt.HostIP || '192.168.8.50'}</p></div>
                        <div><p className="text-muted-foreground">Ping</p><p className={zkHost.Pingable ? 'font-bold text-emerald-400' : 'font-bold text-rose-400'}>{zkHost.Pingable ? 'OK' : 'N/D'}</p></div>
                        <div><p className="text-muted-foreground">Web UI 8006</p><p className={zkHost.Ports?.WebUI8006 ? 'font-bold text-emerald-400' : 'font-bold text-amber-400'}>{zkHost.Ports?.WebUI8006 ? 'OK' : 'N/D'}</p></div>
                        <div><p className="text-muted-foreground">SSH 22</p><p className={zkHost.Ports?.SSH22 ? 'font-bold text-emerald-400' : 'font-bold text-amber-400'}>{zkHost.Ports?.SSH22 ? 'OK' : 'N/D'}</p></div>
                        <div><p className="text-muted-foreground">Heartbeat</p><p className={zkHostPing?.status === 'UP' ? 'font-bold text-emerald-400' : 'font-bold text-slate-400'}>{zkHostPing?.status || 'Sin latido'}</p></div>
                      </div>
                    </div>

                    <div className="bg-background border border-border rounded-lg p-4">
                      <h4 className="text-sm font-semibold mb-3 border-b border-border/50 pb-2 flex items-center gap-2">
                        <Cpu className="w-4 h-4 text-sky-400" /> VM Windows SERV-ZK
                      </h4>
                      <div className="grid grid-cols-2 gap-3 text-xs">
                        <div><p className="text-muted-foreground">Sistema</p><p className="font-medium">{zkSystem.OS || 'N/A'}</p></div>
                        <div><p className="text-muted-foreground">Build</p><p className="font-mono">{zkSystem.BuildNumber || zkSystem.Version || 'N/A'}</p></div>
                        <div><p className="text-muted-foreground">CPU</p><p className="font-bold">{zkSystem.CPU_LoadPct ?? 'N/A'}%</p></div>
                        <div><p className="text-muted-foreground">RAM</p><p className="font-bold">{zkRam.UsedPct ?? 'N/A'}% usada</p></div>
                        <div><p className="text-muted-foreground">Libre RAM</p><p className="font-medium">{zkRam.FreeGB ?? 'N/A'}GB / {zkRam.TotalGB ?? 'N/A'}GB</p></div>
                        <div><p className="text-muted-foreground">Heartbeat</p><p className={zkVmPing?.status === 'UP' ? 'font-bold text-emerald-400' : zkVmPing?.status === 'DOWN' ? 'font-bold text-rose-400' : 'font-bold text-slate-400'}>{zkVmPing?.status || 'Sin latido'}</p></div>
                      </div>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="bg-background border border-border rounded-lg p-4">
                      <h4 className="text-sm font-semibold mb-3 border-b border-border/50 pb-2 flex items-center gap-2">
                        <HardDrive className="w-4 h-4" /> Almacenamiento
                      </h4>
                      <div className="space-y-2">
                        {(Array.isArray(zkDisks) ? zkDisks : []).map((disk, idx) => (
                          <div key={idx} className="flex justify-between text-xs border border-border/30 rounded p-2">
                            <span className="font-bold">{disk.DeviceID || disk.Drive || `Disco ${idx + 1}`}</span>
                            <span className={(disk.PercentFree ?? 100) < 15 ? 'text-rose-400 font-bold' : (disk.PercentFree ?? 100) < 25 ? 'text-amber-400 font-bold' : 'text-emerald-400 font-bold'}>
                              {disk.FreeGB ?? '?'}GB libres ({disk.PercentFree ?? '?'}%)
                            </span>
                          </div>
                        ))}
                        {(!Array.isArray(zkDisks) || zkDisks.length === 0) && (
                          <p className="text-xs text-muted-foreground italic">Sin datos de disco.</p>
                        )}
                      </div>
                    </div>

                    <div className="bg-background border border-border rounded-lg p-4">
                      <h4 className="text-sm font-semibold mb-3 border-b border-border/50 pb-2 flex items-center gap-2">
                        <RefreshCw className="w-4 h-4 text-amber-400" /> Windows Update
                      </h4>
                      <div className="grid grid-cols-2 gap-3 text-xs">
                        <div><p className="text-muted-foreground">Estado</p><p className="font-bold">{zkUpdates.Status || 'N/A'}</p></div>
                        <div><p className="text-muted-foreground">Pendientes</p><p className="font-bold">{zkUpdates.PendingCount ?? 0}</p></div>
                        <div><p className="text-muted-foreground">Reinicio</p><p className={zkUpdates.RebootRequired ? 'font-bold text-amber-400' : 'font-bold text-emerald-400'}>{zkUpdates.RebootRequired ? 'Requerido' : 'No'}</p></div>
                        <div><p className="text-muted-foreground">Último KB</p><p className="font-mono">{zkUpdates.LastKB || 'N/A'}</p></div>
                      </div>
                    </div>
                  </div>

                  <div className="bg-background border border-border rounded-lg p-4">
                    <h4 className="text-sm font-semibold mb-3 border-b border-border/50 pb-2 flex items-center gap-2">
                      <Activity className="w-4 h-4 text-purple-400" /> Servicios Detectados
                    </h4>
                    {zkOnlineService && (
                      <div className="mb-3 border border-emerald-500/20 bg-emerald-500/5 rounded-lg p-3 flex justify-between items-center text-xs">
                        <div>
                          <p className="font-bold text-emerald-400">{zkOnlineService.DisplayName || 'ZKBIOOnline Service'}</p>
                          <p className="text-[10px] text-muted-foreground">{zkOnlineService.Name || 'ZKBIOOnline Service'} • {zkOnlineService.StartMode || 'N/A'}</p>
                        </div>
                        <span className={zkOnlineServiceStatus === 'Running' || zkOnlineServiceStatus === 4 ? 'font-bold text-emerald-400' : 'font-bold text-rose-400'}>
                          {zkOnlineServiceStatus}
                        </span>
                      </div>
                    )}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                      {(Array.isArray(zkServiceList) ? zkServiceList.slice(0, 12) : []).map((svc, idx) => (
                        <div key={idx} className="flex justify-between items-center text-xs border border-border/30 rounded p-2 bg-background/40">
                          <div className="min-w-0">
                            <p className="font-bold text-sky-400 truncate">{svc.DisplayName || svc.Name}</p>
                            <p className="text-[10px] text-muted-foreground truncate">{svc.Kind || 'Service'} • {svc.StartMode || 'N/A'}</p>
                          </div>
                          <span className={`text-[10px] font-bold ${svc.State === 'Running' || svc.Status === 'Running' || svc.Status === 4 ? 'text-emerald-400' : 'text-rose-400'}`}>
                            {svc.State || svc.Status || 'N/A'}
                          </span>
                        </div>
                      ))}
                      {(!Array.isArray(zkServiceList) || zkServiceList.length === 0) && (
                        <p className="text-xs text-muted-foreground italic">No se detectaron servicios con los patrones actuales.</p>
                      )}
                    </div>
                  </div>

                  <div className="bg-background border border-border rounded-lg p-4">
                    <h4 className="text-sm font-semibold mb-3 border-b border-border/50 pb-2 flex items-center gap-2">
                      <AlertTriangle className="w-4 h-4 text-amber-400" /> Hallazgos y Eventos
                    </h4>
                    <div className="space-y-2 text-xs">
                      {(zkOverall.Issues || []).slice(0, 5).map((issue, idx) => (
                        <div key={idx} className="border border-amber-500/20 bg-amber-500/5 rounded p-2 text-amber-300">{issue}</div>
                      ))}
                      {(zkEvents.SystemLast24h || []).slice(0, 5).map((event, idx) => (
                        <div key={`event-${idx}`} className="border border-border/30 rounded p-2 bg-background/40">
                          <p className="font-mono text-[10px] text-muted-foreground">{event.TimeCreated} • {event.ProviderName} • ID {event.Id}</p>
                          <p className="mt-1 text-muted-foreground line-clamp-2">{normalizeText(event.Message) || 'Evento sin mensaje'}</p>
                        </div>
                      ))}
                      {(!zkOverall.Issues?.length && !zkEvents.SystemLast24h?.length) && (
                        <p className="text-xs text-muted-foreground italic">Sin hallazgos recientes reportados.</p>
                      )}
                    </div>
                  </div>

                  <div className="flex justify-end pt-2">
                    <a
                      href={monitoringService.getReportHtmlUrl("SERV-ZK", "latest")}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-2 bg-primary text-primary-foreground hover:bg-primary/90 px-4 py-2 rounded-lg font-medium transition-colors"
                    >
                      Abrir Reporte HTML SERV-ZK <ExternalLink className="w-4 h-4" />
                    </a>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Modal AD01 Detailed Info */}
      {isADModalOpen && (
        <div className="fixed inset-0 z-50 bg-background/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-card border border-border rounded-xl shadow-xl w-full max-w-4xl max-h-[90vh] overflow-hidden flex flex-col animate-in zoom-in-95 duration-200">
            <div className="p-4 border-b border-border flex justify-between items-center bg-muted/30">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-primary/10 text-primary rounded-lg">
                  <ShieldCheck className="w-5 h-5" />
                </div>
                <div>
                  <h2 className="text-lg font-bold">Análisis Profundo - AD01</h2>
                  <p className="text-xs text-muted-foreground">Detalles de Directorio Activo (ISO 27001)</p>
                </div>
              </div>
              <button onClick={() => setIsADModalOpen(false)} className="p-2 hover:bg-muted rounded-lg transition-colors">
                <XCircle className="w-5 h-5 text-muted-foreground" />
              </button>
            </div>
            
            <div className="p-6 overflow-y-auto custom-scrollbar">
              {adData ? (
                <div className="space-y-6">
                  {/* KPIs principales */}
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                    <div className="bg-background border border-border rounded-lg p-4 text-center">
                      <p className={`text-2xl font-bold ${adData.Replication?.Status === 'OK' ? 'text-emerald-400' : 'text-rose-400'}`}>
                        {adData.Replication?.Status || 'N/A'}
                      </p>
                      <p className="text-xs text-muted-foreground mt-1">Replicación AD</p>
                    </div>
                    <div className="bg-background border border-border rounded-lg p-4 text-center">
                      <p className={`text-2xl font-bold ${adData.FSMO?.Status === 'OK' ? 'text-emerald-400' : 'text-amber-400'}`}>
                        {adData.FSMO?.Status || 'N/A'}
                      </p>
                      <p className="text-xs text-muted-foreground mt-1">Roles FSMO</p>
                    </div>
                    <div className="bg-background border border-border rounded-lg p-4 text-center">
                      <p className={`text-2xl font-bold ${(adData.Security?.FailedLogins || 0) > 50 ? 'text-rose-400' : 'text-amber-400'}`}>
                        {adData.Security?.FailedLogins ?? 0}
                      </p>
                      <p className="text-xs text-muted-foreground mt-1">Fallos Login (7d)</p>
                    </div>
                    <div className="bg-background border border-border rounded-lg p-4 text-center">
                      <p className={`text-2xl font-bold ${(adData.Security?.AccountLockouts || 0) > 0 ? 'text-rose-400' : 'text-emerald-400'}`}>
                        {adData.Security?.AccountLockouts ?? 0}
                      </p>
                      <p className="text-xs text-muted-foreground mt-1">Bloqueos (7d)</p>
                    </div>
                  </div>

                  {/* Estado de DCs */}
                  {adData.DCs?.Status && (
                    <div className="bg-background border border-border rounded-lg p-4">
                      <h4 className="text-sm font-semibold mb-3 border-b border-border/50 pb-2 flex items-center gap-2">
                        <Server className="w-4 h-4" /> Estado de Controladores de Dominio
                      </h4>
                      <div className="space-y-2">
                        {(adData.DCs?.Status || []).map((dc, i) => (
                          <div key={i} className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs border border-border/30 rounded-lg p-3 bg-background/60">
                            <div><p className="text-muted-foreground">Nombre</p><p className="font-bold text-sky-400">{dc.DC}</p></div>
                            <div><p className="text-muted-foreground">Uptime</p><p className="font-medium">{dc.Uptime || 'N/A'}</p></div>
                            <div><p className="text-muted-foreground">Ping</p><p className={`font-bold ${dc.Pingable ? 'text-emerald-400' : 'text-rose-400'}`}>{dc.Pingable ? 'OK' : 'FAIL'}</p></div>
                            <div><p className="text-muted-foreground">Sitio AD</p><p className="font-medium">{dc.Site || 'Default-First-Site'}</p></div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {/* Disco por DC */}
                    {adData.Disk?.Disks && (
                      <div className="bg-background border border-border rounded-lg p-4">
                        <h4 className="text-sm font-semibold mb-3 border-b border-border/50 pb-2 flex items-center gap-2">
                          <HardDrive className="w-4 h-4" /> Almacenamiento por DC
                        </h4>
                        <div className="space-y-2">
                          {adData.Disk.Disks.map((disk, i) => (
                            <div key={i} className="flex justify-between text-xs border border-border/30 rounded p-2">
                              <span className="font-bold">{disk.DC} — {disk.Drive || 'C:'}</span>
                              <span className={disk.PercentFree < 15 ? 'text-rose-400 font-bold' : disk.PercentFree < 25 ? 'text-amber-400' : 'text-emerald-400'}>
                                {disk.FreeGB}GB libres ({disk.PercentFree}%)
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Backups */}
                    <div className="bg-background border border-border rounded-lg p-4">
                      <h4 className="text-sm font-semibold mb-3 border-b border-border/50 pb-2 flex items-center gap-2">
                        <Database className="w-4 h-4 text-sky-400" /> Estado de Backups
                      </h4>
                      <div className="space-y-2">
                        {(adData.Backups?.Backups || []).map((backup, idx) => (
                          <div key={idx} className="flex justify-between items-center text-xs border border-border/30 rounded p-2 bg-background/40">
                            <div className="flex flex-col">
                              <span className="font-bold text-sky-400">{backup.Ruta?.split('\\').pop() || 'Backup'}</span>
                              <span className="text-[9px] text-muted-foreground">{backup.TamañoTotal || '?'} GB</span>
                            </div>
                            <div className="text-right">
                              <span className="text-[10px] text-muted-foreground block">Último:</span>
                              <span className="text-emerald-400 font-bold">{backup.UltimoBackup || 'N/A'}</span>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>

                  {/* Eventos de Seguridad */}
                  {adData.Security && (
                    <div className="bg-background border border-border rounded-lg p-4">
                      <h4 className="text-sm font-semibold mb-3 border-b border-border/50 pb-2 flex items-center gap-2">
                        <ShieldAlert className="w-4 h-4 text-rose-400" /> Eventos de Seguridad — Últimos 7 días
                      </h4>
                      <div className="grid grid-cols-2 md:grid-cols-3 gap-3 text-xs">
                        <div className="border border-border/30 rounded p-2"><p className="text-muted-foreground">Fallos login (4625)</p><p className="font-bold text-rose-400">{adData.Security.FailedLogins ?? 0}</p></div>
                        <div className="border border-border/30 rounded p-2"><p className="text-muted-foreground">Bloqueos cuenta</p><p className="font-bold text-amber-400">{adData.Security.AccountLockouts ?? 0}</p></div>
                        <div className="border border-border/30 rounded p-2"><p className="text-muted-foreground">Cambios política</p><p className="font-bold">{adData.Security.PolicyChanges ?? 0}</p></div>
                      </div>
                    </div>
                  )}

                  <div className="flex justify-end pt-2">
                    <a 
                      href={monitoringService.getReportHtmlUrl("ad", "latest")} 
                      target="_blank" 
                      rel="noopener noreferrer"
                      className="flex items-center gap-2 bg-primary text-primary-foreground hover:bg-primary/90 px-4 py-2 rounded-lg font-medium transition-colors"
                    >
                      Abrir Reporte HTML <ExternalLink className="w-4 h-4" />
                    </a>
                  </div>
                </div>
              ) : (
                <div className="py-12 flex flex-col items-center text-muted-foreground">
                  <Database className="w-12 h-12 mb-4 opacity-20 animate-pulse" />
                  <p>No hay datos de AD disponibles aún.</p>
                  <p className="text-xs mt-2">Espera a que el script Monitor-AD01.ps1 ejecute y envíe datos.</p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
      {/* Modulos Secundarios (reserved) - no KSC card here to avoid duplication */}

      {/* History Table */}
      <div className="bg-card/40 backdrop-blur-sm border border-border rounded-xl overflow-hidden">
        <div className="p-6 border-b border-border flex justify-between items-center">
          <h3 className="text-base font-semibold flex items-center gap-2">
            <History className="w-4 h-4 text-primary" />
            Historial de Ejecuciones Local
          </h3>
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2 bg-muted/50 p-1 rounded-lg border border-border">
              <button
                onClick={() => setShowAllHistory(false)}
                className={`px-3 py-1 rounded-md text-xs font-bold transition-all ${!showAllHistory ? 'bg-primary text-primary-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}
              >
                Solo Hoy
              </button>
              <button
                onClick={() => setShowAllHistory(true)}
                className={`px-3 py-1 rounded-md text-xs font-bold transition-all ${showAllHistory ? 'bg-primary text-primary-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}
              >
                Todo
              </button>
            </div>
            <span className="text-[10px] text-muted-foreground uppercase tracking-widest font-bold">
              {filteredHistory.length} registros
            </span>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left">
            <thead className="text-xs uppercase tracking-wider text-muted-foreground bg-muted/30">
              <tr>
                <th className="px-6 py-4">Fecha de Ejecución</th>
                <th className="px-6 py-4">Servicio</th>
                <th className="px-6 py-4">ID de Reporte</th>
                <th className="px-6 py-4">Estado General</th>
                <th className="px-6 py-4 text-right">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/50">
              {filteredHistory.length > 0 ? (
                filteredHistory.map((item, idx) => {
                  let displayDate = item.name;
                  try {
                    // El formato es report_YYYY-MM-DDTHH-mm-ss-fffZ.json
                    const name = item.name.replace('report_', '').replace('.json', '');
                    const parts = name.split('T');
                    if (parts.length === 2) {
                      const datePart = parts[0];
                      // Convertimos guiones a dos puntos para la parte del tiempo y aseguramos el punto para milisegundos
                      const timePart = parts[1].replace(/-/g, ':').replace(/:(\d{3})Z$/, '.$1Z');
                      const dateObj = new Date(`${datePart}T${timePart}`);
                      
                      if (!isNaN(dateObj.getTime())) {
                        displayDate = dateObj.toLocaleString('es-CO', { 
                          day: '2-digit', month: '2-digit', year: 'numeric',
                          hour: '2-digit', minute: '2-digit', second: '2-digit',
                          hour12: true 
                        });
                      }
                    }
                  } catch (e) {
                    console.error("Error parsing date:", item.name, e);
                  }

                  return (
                    <tr key={idx} className="hover:bg-muted/30 transition-colors">
                      <td className="px-6 py-4 font-medium tabular-nums">
                        {displayDate}
                      </td>
                      <td className="px-6 py-4">
                        <span className="bg-primary/10 text-primary px-2 py-0.5 rounded text-[10px] font-bold uppercase">
                          {item.service === 'AD' ? 'AD01' : item.service === 'AD-DC02' ? 'AD02' : item.service === 'AD-DC03' ? 'AD03' : item.service}
                        </span>
                      </td>
                      <td className="px-6 py-4 font-mono text-[11px] opacity-70">{item.name.replace('.json', '')}</td>
                      <td className="px-6 py-4">
                        <StatusBadge status="success" label="EJECUTADO" />
                      </td>
                      <td className="px-6 py-4 text-right">
                        <div className="flex justify-end gap-2">
                          {item.service !== 'ANFI-SEG' && item.service !== 'KSC' && (
                            <a 
                              href={monitoringService.getReportHtmlUrl(item.service, item.name.replace('.json', ''))} 
                              target="_blank"
                              rel="noopener noreferrer"
                              className="p-1.5 hover:bg-primary/20 text-primary rounded-lg transition-colors"
                              title="Ver Reporte HTML"
                            >
                              <ExternalLink className="w-4 h-4" />
                            </a>
                          )}
                          <button
                            onClick={() => handleDeleteHistory(item.service, item.name)}
                            className="p-1.5 hover:bg-rose-500/20 text-rose-500 rounded-lg transition-colors"
                            title="Eliminar Registro"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              ) : (
                <tr>
                  <td colSpan="5" className="px-6 py-10 text-center text-muted-foreground italic">
                    No se han registrado ejecuciones históricas aún.
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

function StatusBadge({ status, label }) {
  return (
    <span className={`px-2.5 py-0.5 rounded-full text-[11px] font-bold border ${STATUS_COLORS[status] || STATUS_COLORS.gray}`}>
      {label}
    </span>
  );
}

function MetricSmall({ label, value, color = "text-foreground", icon }) {
  return (
    <div className="bg-background/40 border border-border/50 rounded-lg p-2.5">
      <p className="text-[10px] text-muted-foreground uppercase font-semibold">{label}</p>
      <div className="flex items-center gap-1.5 mt-0.5">
        {icon && <span className="text-muted-foreground">{icon}</span>}
        <p className={`text-sm font-bold truncate ${color}`}>{value}</p>
      </div>
    </div>
  );
}

function SecurityMetric({ label, value, max }) {
  const percentage = Math.min(100, (value / max) * 100);
  const colorClass = percentage > 80 ? "bg-rose-500" : percentage > 50 ? "bg-amber-500" : "bg-emerald-500";
  
  return (
    <div className="space-y-1">
      <div className="flex justify-between text-[11px]">
        <span>{label}</span>
        <span className="font-bold">{value}</span>
      </div>
      <div className="h-1 w-full bg-muted rounded-full overflow-hidden">
        <div 
          className={`h-full transition-all duration-1000 ${colorClass}`} 
          style={{ width: `${percentage}%` }}
        />
      </div>
    </div>
  );
}
