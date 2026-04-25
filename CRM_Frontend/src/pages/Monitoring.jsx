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
  Users,
  RefreshCw,
  History,
  ExternalLink,
  Cpu,
  Activity
} from "lucide-react";
import { monitoringService } from "@/services/monitoring.service";
import { formatDistanceToNow } from "date-fns";
import { es } from "date-fns/locale";

const STATUS_COLORS = {
  success: "text-emerald-400 bg-emerald-500/10 border-emerald-500/20",
  warning: "text-amber-400 bg-amber-500/10 border-amber-500/20",
  error: "text-rose-400 bg-rose-500/10 border-rose-500/20",
  info: "text-sky-400 bg-sky-500/10 border-sky-500/20",
  gray: "text-slate-400 bg-slate-500/10 border-slate-500/20"
};

const SOCKET_URL = import.meta.env.VITE_MONITORING_BACKEND_URL || 'http://localhost:3001';

const UpdateBadge = ({ updates }) => {
  if (!updates) return null;
  const isPending = updates.RebootPending;
  return (
    <div className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-semibold border ${
      isPending ? 'bg-amber-500/10 text-amber-400 border-amber-500/20' : 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
    }`}>
      {isPending ? <RefreshCw className="w-3 h-3 animate-spin-slow" /> : <CheckCircle2 className="w-3 h-3" />}
      {isPending ? 'Reinicio Pendiente (Updates)' : `Updates OK (${updates.LastInstalled})`}
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
  const isOffline = pingStatus && pingStatus.status === 'DOWN';
  const latency = pingStatus && pingStatus.status === 'UP' ? `${Math.round(pingStatus.time)}ms` : '';
  
  // Lógica de salud: si el ping es UP es saludable. 
  // Si no hay ping, pero isHealthy es true (datos recientes), lo damos por válido.
  const displayHealthy = isOffline ? false : (isHealthy || (pingStatus && pingStatus.status === 'UP'));
  
  const ledColor = isOffline ? 'bg-rose-500 animate-pulse shadow-[0_0_15px_rgba(244,63,94,0.9)]' :
                   (pingStatus && pingStatus.status === 'UP') ? 'bg-emerald-400 shadow-[0_0_20px_rgba(52,211,153,0.8)]' :
                   isHealthy ? 'bg-emerald-500/60 shadow-[0_0_10px_rgba(16,185,129,0.4)]' : 
                   'bg-slate-600';

  const pulseStyle = isOffline ? {
    animation: 'breathe-red 2s ease-in-out infinite'
  } : (pingStatus && pingStatus.status === 'UP') || isHealthy ? {
    animation: 'breathe 3s ease-in-out infinite'
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
              {!pingStatus && !isHealthy && <span className="text-[10px] text-muted-foreground animate-pulse text-[8px]">SIN DATOS</span>}
            </h3>
            <span className="text-[10px] text-muted-foreground uppercase font-semibold tracking-wider">{role}</span>
          </div>
        </div>
        <div 
          className={`w-3 h-3 rounded-full transition-all duration-1000 ${ledColor}`}
          style={pulseStyle}
        ></div>
      </div>

      <div className="grid grid-cols-2 gap-3 text-xs mb-3 flex-1">
         <div className="flex flex-col gap-1">
           <span className="text-muted-foreground flex items-center gap-1.5"><Clock className="w-3 h-3" /> Uptime</span>
           <span className="font-medium pl-4">{uptime}</span>
         </div>
         <div className="flex flex-col gap-1">
           <span className="text-muted-foreground flex items-center gap-1.5"><Activity className="w-3 h-3" /> Servicios</span>
           <span className={`font-bold pl-4 ${displayHealthy ? 'text-emerald-400' : 'text-rose-400'}`}>
             {isOffline ? 'SIN RED' : servicesOk < servicesTotal ? `${servicesTotal - servicesOk} CON FALLA` : "SISTEMA OK"}
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
         <div className="flex flex-col gap-1">
           <span className="text-muted-foreground flex items-center gap-1.5"><RefreshCw className="w-3 h-3" /> Replicación</span>
           <span className={`font-bold pl-4 ${replication === 'OK' ? 'text-emerald-400' : replication ? 'text-rose-400' : 'text-slate-400'}`}>
             {replication || 'N/A'}{replicationObjects != null ? ` · ${replicationObjects} obj.` : ''}
           </span>
         </div>
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
    ksc: null
  });
  const [pingData, setPingData] = useState({});
  const [isADModalOpen, setIsADModalOpen] = useState(false);

  const fetchData = async () => {
    // No ponemos loading=true aquí para evitar parpadeos en el autorefresh
    try {
      const [host1, host2, dc01, dc02, ksc] = await Promise.all([
        monitoringService.getLatestStatus('ANFIGANE'),  // ANFIGANE (Antes AD-HOST)
        monitoringService.getLatestStatus('ANFI-SEG'),  // Host 2
        monitoringService.getLatestStatus('AD'),        // AD01
        monitoringService.getLatestStatus('AD-DC02'),   // AD02
        monitoringService.getLatestStatus('KSC')        // Kaspersky
      ]);
      
      setNodes({ host1, host2, dc01, dc02, ksc });
      setAdData(dc01);
      
      // 2. Historial unificado de todos los servicios
      const services = ['ANFIGANE', 'ANFI-SEG', 'AD', 'AD-DC02', 'KSC'];
      const historyPromises = services.map(s => monitoringService.getHistory(s));
      const historyResults = await Promise.all(historyPromises);
      
      // Combinar y ordenar por fecha (el nombre del archivo contiene el timestamp)
      const allFiles = [];
      historyResults.forEach((res, index) => {
        if (res.files) {
          res.files.forEach(file => {
            allFiles.push({
              name: file,
              service: services[index]
            });
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

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 60000); // Actualizar cada minuto

    // Conectar WebSocket para Ping Heartbeat
    const socket = io(SOCKET_URL);
    
    socket.on('connect', () => {
      console.log("✅ [SOCKET] Conectado al servidor de monitoreo");
    });

    socket.on('monitoring:heartbeat', (data) => {
      console.log("📡 [HEARTBEAT] Datos de ping recibidos:", data);
      setPingData(data);
    });

    socket.on('connect_error', (error) => {
      console.error("❌ [SOCKET] Error de conexión:", error);
    });

    return () => {
      clearInterval(interval);
      socket.disconnect();
    };
  }, []);

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
              <div>
                <h2 className="text-lg font-bold flex items-center gap-2">
                  ANFIGANE
                  <div 
                    className={`w-3 h-3 rounded-full ${(!pingData['AD-HOST'] && !pingData['ANFIGANE']) ? 'bg-slate-600' : (pingData['AD-HOST']?.status === 'UP' || pingData['ANFIGANE']?.status === 'UP') ? 'bg-emerald-400' : 'bg-rose-500'}`}
                    style={{
                      animation: (!pingData['AD-HOST'] && !pingData['ANFIGANE']) ? 'none' : (pingData['AD-HOST']?.status === 'UP' || pingData['ANFIGANE']?.status === 'UP') ? 'breathe 3s ease-in-out infinite' : 'breathe-red 2s ease-in-out infinite'
                    }}
                  ></div>
                  {pingData['AD-HOST']?.status === 'DOWN' && <span className="px-1.5 py-0.5 rounded text-[10px] bg-rose-500 text-white font-bold animate-pulse">OFFLINE</span>}
                  {pingData['AD-HOST']?.status === 'UP' && <span className="text-xs text-emerald-400 font-normal">{Math.round(pingData['AD-HOST'].time)}ms</span>}
                </h2>
                <p className="text-[10px] text-muted-foreground">ProLiant / Hyper-V • 192.168.8.43</p>
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

              {nodes.dc02 ? (
                <DCCard 
                  title="AD02" 
                  role="SECUNDARIO BDC"
                  uptime={nodes.dc02?.Uptime ?? nodes.dc01?.DCs?.Status?.find(d => d.DC === 'DA02' || d.DC === 'AD02')?.Uptime ?? 'N/A'}
                  servicesOk={
                    nodes.dc02?.LocalHealth?.Services?.filter(s => s.Status === 'Running' || s.Status === 4 || s.Status === 'OK').length ??
                    nodes.dc01?.DCs?.Status?.find(d => d.DC === 'DA02' || d.DC === 'AD02')?.Services?.filter(s => 
                      s.toLowerCase().includes('ok') || s.toLowerCase().includes('running')
                    ).length ?? 0
                  }
                  servicesTotal={nodes.dc02?.LocalHealth?.Services?.length ?? 6}
                  diskSpace={nodes.dc02?.LocalHealth?.Disk?.[0] ?? nodes.dc01?.Disk?.Disks?.find(d => d.DC === 'DA02' || d.DC === 'AD02')}
                  lastBackup={
                    nodes.dc01?.Backups?.Backups?.find(b => b.Ruta?.includes('AD02'))?.UltimoBackup ?? 
                    'Desconocido'
                  }
                  replication={nodes.dc02?.LocalHealth?.Replication ?? nodes.dc01?.Replication?.Status}
                  updates={nodes.dc02?.LocalHealth?.Updates ?? nodes.dc01?.Updates}
                  isHealthy={!!nodes.dc02 || !!nodes.dc01}
                  pingStatus={pingData['AD-DC02'] || pingData['DA02']}
                  icon={<WindowsADIcon />} 
                />
              ) : (
                <div className="bg-background/40 border border-border/50 rounded-lg p-4 animate-pulse h-[200px]"></div>
              )}
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
                <p className="text-[10px] text-muted-foreground">HP ProLiant DL160 Gen9 / Hyper-V • 192.168.8.41</p>
              </div>
            </div>
            {nodes.host2 && (
              <div className="flex flex-wrap items-center gap-2 text-[10px]">
                <div className="flex items-center gap-1 px-2 py-1 bg-background rounded-md border border-border">
                  <Cpu className="w-3 h-3 text-primary" />
                  <span className="font-mono">{nodes.host2.RAM?.FreeGB}GB / {nodes.host2.RAM?.TotalGB}GB</span>
                </div>
                <div className="flex items-center gap-1 px-2 py-1 bg-background rounded-md border border-border">
                  <Activity className="w-3 h-3 text-emerald-400" />
                  <span className="font-bold text-emerald-400">{nodes.host2.VMs?.filter(v => v.State === 2 || v.State === 'Running').length}/{nodes.host2.VMs?.length} VMs</span>
                </div>
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
                  uptime={nodes.dc03.LocalHealth?.Uptime ?? 'N/A'}
                  servicesOk={nodes.dc03.LocalHealth?.Services?.filter?.(s => s.Status === 'Running' || s.Status === 4 || s.Status === 'OK')?.length ?? 0}
                  servicesTotal={nodes.dc03.LocalHealth?.Services?.length ?? 4}
                  diskSpace={nodes.dc03.LocalHealth?.Storage?.find?.(d => d.Drive === 'C:\\') ?? nodes.dc03.LocalHealth?.Disk?.[0]}
                  lastBackup={nodes.dc01?.Backups?.Status?.AD03 ?? 'Desconocido'}
                  replication={nodes.dc01?.Replication?.Status}
                  isHealthy={pingData['AD-DC03']?.status === 'UP'}
                  pingStatus={pingData['AD-DC03']}
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

              {/* SERV-KSC — Kaspersky Security Center */}
              <div className={`bg-background/30 border border-dashed rounded-xl p-4 flex flex-col gap-3 min-h-[180px] ${pingData['SERV-KSC']?.status === 'DOWN' ? 'border-rose-500/30' : 'border-emerald-500/20'}`}>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className={`p-1.5 rounded-lg ${pingData['SERV-KSC']?.status === 'DOWN' ? 'bg-rose-500/10 text-rose-400' : 'bg-emerald-500/10 text-emerald-400'}`}>
                      <ShieldCheck className="w-4 h-4" />
                    </div>
                    <div>
                      <p className="text-sm font-bold flex items-center gap-1.5">
                        SERV-KSC
                        {pingData['SERV-KSC']?.status === 'UP' && <span className="text-[9px] text-emerald-400 font-normal">{Math.round(pingData['SERV-KSC'].time)}ms</span>}
                        {pingData['SERV-KSC']?.status === 'DOWN' && <span className="px-1 py-0.5 rounded text-[8px] bg-rose-500 text-white font-bold animate-pulse">OFFLINE</span>}
                      </p>
                      <p className="text-[9px] text-muted-foreground uppercase tracking-wider">192.168.8.42</p>
                    </div>
                  </div>
                  <div 
                    className={`w-2 h-2 rounded-full ${(!pingData['SERV-KSC'] && !pingData['ksc'] && !pingData['192.168.8.42']) ? 'bg-slate-600' : (pingData['SERV-KSC']?.status === 'UP' || pingData['ksc']?.status === 'UP' || pingData['192.168.8.42']?.status === 'UP') ? 'bg-emerald-400' : 'bg-rose-500'}`}
                    style={{
                      animation: (!pingData['SERV-KSC'] && !pingData['ksc'] && !pingData['192.168.8.42']) ? 'none' : (pingData['SERV-KSC']?.status === 'UP' || pingData['ksc']?.status === 'UP' || pingData['192.168.8.42']?.status === 'UP') ? 'breathe 3s ease-in-out infinite' : 'breathe-red 2s ease-in-out infinite'
                    }}
                  ></div>
                </div>
                <div className="flex-1 flex flex-col items-center justify-center py-2 gap-1">
                  {nodes.ksc ? (
                    <div className="w-full space-y-2">
                      <div className="flex justify-between items-center bg-emerald-500/5 border border-emerald-500/20 px-2.5 py-1 rounded-md">
                        <span className="text-[9px] text-emerald-400 font-bold uppercase">Estado</span>
                        <span className="text-[10px] text-emerald-400 font-bold">ONLINE</span>
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        <div className="bg-background/40 border border-border/50 rounded-lg p-2">
                           <p className="text-[8px] text-muted-foreground uppercase">Endpoints</p>
                           <p className="text-xs font-bold text-foreground">{nodes.ksc.Endpoints?.Active ?? 0} / {nodes.ksc.Endpoints?.Total ?? 0}</p>
                        </div>
                        <div className="bg-background/40 border border-border/50 rounded-lg p-2">
                           <p className="text-[8px] text-muted-foreground uppercase">RAM</p>
                           <p className="text-xs font-bold text-foreground">{nodes.ksc.RAM?.FreeGB ?? 'N/A'} GB</p>
                        </div>
                      </div>
                      <p className="text-[9px] text-muted-foreground text-center italic">Uptime: {nodes.ksc.Uptime || 'N/A'}</p>
                    </div>
                  ) : (
                    <>
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-500/10 text-slate-400 border border-slate-500/20">
                        {pingData['SERV-KSC']?.status === 'UP' ? 'ESPERANDO AGENTE' : 'SIN DATOS'}
                      </span>
                      <p className="text-[10px] text-muted-foreground text-center mt-1 uppercase tracking-tighter">Kaspersky Sec. Center</p>
                    </>
                  )}
                </div>
              </div>

            </div>
          </div>
        </div>

      </div>




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
      {/* Modulos Secundarios */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        
        {/* Kaspersky Card */}
        <div className={`bg-card/40 backdrop-blur-sm border rounded-xl p-6 flex flex-col transition-all duration-300 ${nodes.ksc ? 'border-emerald-500/30' : 'opacity-60 grayscale hover:grayscale-0 hover:opacity-100 border-border'}`}>
           <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-3">
              <div className={`p-2.5 rounded-lg ${nodes.ksc ? 'bg-emerald-500/20 text-emerald-400' : 'bg-slate-500/20 text-slate-400'}`}>
                <ShieldCheck className="w-5 h-5" />
              </div>
              <div>
                <h3 className="font-bold text-lg">Kaspersky KSC</h3>
                <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">Security Center</span>
              </div>
            </div>
            <StatusBadge status={nodes.ksc ? "success" : "gray"} label={nodes.ksc ? "Activo" : "Desconectado"} />
          </div>
          
          {nodes.ksc ? (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <MetricSmall label="Endpoints Protegidos" value={nodes.ksc.Endpoints?.Active ?? 0} icon={<ShieldCheck className="w-3 h-3" />} color="text-emerald-400" />
                <MetricSmall label="Licencias Usadas" value={`${nodes.ksc.Licenses?.Used ?? 0} / ${nodes.ksc.Licenses?.Total ?? 0}`} icon={<Users className="w-3 h-3" />} />
              </div>
              <div className="bg-background/40 border border-border/50 rounded-lg p-3">
                <div className="flex justify-between items-center text-xs mb-2">
                  <span className="text-muted-foreground">Vencimiento Licencia</span>
                  <span className="font-bold">{nodes.ksc.Licenses?.Expiry ?? 'N/A'}</span>
                </div>
                <div className="h-1.5 w-full bg-muted rounded-full overflow-hidden">
                  <div className="h-full bg-emerald-500 w-[75%]"></div>
                </div>
              </div>
            </div>
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center py-10 text-center">
              <p className="text-sm font-medium">Módulo en Desarrollo</p>
              <p className="text-xs mt-1 text-muted-foreground">Próximamente: Inventario detallado de endpoints y alertas de virus</p>
            </div>
          )}
        </div>

        {/* ZKBioSecurity Card */}
        <div className="bg-card/40 backdrop-blur-sm border border-border rounded-xl p-6 flex flex-col opacity-60 grayscale hover:grayscale-0 hover:opacity-100 transition-all duration-300">
           <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-3">
              <div className="p-2.5 rounded-lg bg-rose-500/20 text-rose-400">
                <Lock className="w-5 h-5" />
              </div>
              <div>
                <h3 className="font-bold text-lg">ZKBioSecurity</h3>
                <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">Acceso Biométrico</span>
              </div>
            </div>
            <StatusBadge status="gray" label="Desconectado" />
          </div>
          <div className="flex-1 flex flex-col items-center justify-center py-10">
            <p className="text-sm font-medium">Módulo en Desarrollo</p>
            <p className="text-xs mt-1 text-center">Próximamente: Estado de Dispositivos y Servicios</p>
          </div>
        </div>

      </div>

      {/* History Table */}
      <div className="bg-card/40 backdrop-blur-sm border border-border rounded-xl overflow-hidden">
        <div className="p-6 border-b border-border">
          <h3 className="text-base font-semibold flex items-center gap-2">
            <History className="w-4 h-4 text-primary" />
            Historial de Ejecuciones Local
          </h3>
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
              {history.length > 0 ? (
                history.map((item, idx) => (
                  <tr key={idx} className="hover:bg-muted/30 transition-colors">
                    <td className="px-6 py-4 font-medium">
                      {item.name.split('_').slice(1, 3).join(' ').replace('.json', '').replace('-', '/').replace('-', '/')}
                    </td>
                    <td className="px-6 py-4">
                      <span className="bg-primary/10 text-primary px-2 py-0.5 rounded text-[10px] font-bold uppercase">
                        {item.service === 'AD' ? 'AD01' : item.service === 'AD-DC02' ? 'AD02' : item.service}
                      </span>
                    </td>
                    <td className="px-6 py-4 font-mono text-[11px] opacity-70">{item.name}</td>
                    <td className="px-6 py-4">
                      <StatusBadge status="success" label="EJECUTADO" />
                    </td>
                    <td className="px-6 py-4 text-right">
                      <a 
                        href={monitoringService.getReportHtmlUrl(item.service, item.name.replace('.json', ''))} 
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-primary hover:underline text-xs font-medium"
                      >
                        Ver Reporte
                      </a>
                    </td>
                  </tr>
                ))
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
