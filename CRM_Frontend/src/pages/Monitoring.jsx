import { useState, useEffect } from "react";
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

const DCCard = ({ title, data, icon, isPrimary, onClick }) => {
  if (!data) return (
    <div className="bg-background/40 border border-border/50 rounded-lg p-4 animate-pulse h-[140px]"></div>
  );

  const isHealthy = data.LocalHealth?.Services?.every(s => s.Status === 'Running' || s.Status === 4) && data.LocalHealth?.Replication === "OK";

  return (
    <div 
      onClick={onClick}
      className={`bg-background/60 border ${isHealthy ? 'border-border' : 'border-rose-500/40'} rounded-lg p-4 transition-all hover:bg-background/80 ${onClick ? 'cursor-pointer hover:border-primary/50' : ''}`}
    >
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <div className="p-1.5 bg-primary/10 rounded-lg text-primary">
            {icon}
          </div>
          <div>
            <h3 className="text-sm font-semibold">{title}</h3>
            <span className="text-[10px] text-muted-foreground uppercase">{data.Role || "Controlador de Dominio"}</span>
          </div>
        </div>
        <div className={`w-2 h-2 rounded-full ${isHealthy ? 'bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.6)]' : 'bg-rose-500 animate-pulse'}`}></div>
      </div>

      <div className="grid grid-cols-2 gap-2 text-[11px] mb-3">
         <div className="flex flex-col">
           <span className="text-muted-foreground">Uptime:</span>
           <span>{data.Uptime || 'N/A'}</span>
         </div>
         <div className="flex flex-col">
           <span className="text-muted-foreground">Servicios:</span>
           <span className={isHealthy ? 'text-emerald-400' : 'text-rose-400'}>
             {data.LocalHealth?.Services?.filter(s => s.Status === 'Running' || s.Status === 4).length || 0} de 4 OK
           </span>
         </div>
      </div>

      <div className="flex justify-between items-center border-t border-border/50 pt-2">
        <UpdateBadge updates={data.LocalHealth?.Updates || data.Updates} />
        {isPrimary && (
          <span className="text-[10px] text-primary flex items-center gap-1 hover:underline">
            Ver AD Data <ExternalLink className="w-3 h-3" />
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
    host: null,
    dc01: null,
    dc02: null
  });
  const [isADModalOpen, setIsADModalOpen] = useState(false);

  const fetchData = async () => {
    setLoading(true);
    try {
      const [host, dc01, dc02] = await Promise.all([
        monitoringService.getLatestStatus('AD-HOST'),
        monitoringService.getLatestStatus('AD-DC01'),
        monitoringService.getLatestStatus('AD-DC02')
      ]);
      
      const hist = await monitoringService.getHistory("AD-DC01");
      setNodes({ host, dc01, dc02 });
      setAdData(dc01);
      setHistory(hist.files || []);
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
    return () => clearInterval(interval);
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

      {/* Nivel 2: Arquitectura Anfitrión -> VMs */}
      <div className="bg-card/40 backdrop-blur-sm border border-border rounded-xl p-6 mb-8">
        {/* Host Físico */}
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-6 gap-4">
          <div className="flex items-center gap-4">
            <div className="p-3 bg-sky-500/20 text-sky-400 rounded-xl">
              <Server className="w-6 h-6" />
            </div>
            <div>
              <h2 className="text-xl font-bold">Host Físico: ANFIGANE</h2>
              <p className="text-xs text-muted-foreground">ProLiant / Hyper-V Server</p>
            </div>
          </div>
          
          {nodes.host ? (
            <div className="flex flex-wrap items-center gap-4 text-xs">
              <div className="flex items-center gap-1.5 px-3 py-1.5 bg-background rounded-lg border border-border">
                <Cpu className="w-4 h-4 text-primary" />
                <span className="text-muted-foreground">RAM:</span>
                <span className="font-mono">{Math.round(nodes.host.RAM?.FreeGB / 102.4) / 10}GB libres de {nodes.host.RAM?.TotalGB}GB</span>
              </div>
              <div className="flex items-center gap-1.5 px-3 py-1.5 bg-background rounded-lg border border-border">
                <Activity className="w-4 h-4 text-emerald-400" />
                <span className="text-muted-foreground">VMs Activas:</span>
                <span className="font-bold text-emerald-400">{nodes.host.VMs?.filter(v => v.State === 2 || v.State === 'Running').length} / {nodes.host.VMs?.length}</span>
              </div>
              <UpdateBadge updates={nodes.host.Updates} />
            </div>
          ) : (
            <div className="h-8 w-64 bg-muted rounded animate-pulse"></div>
          )}
        </div>

        {/* VMs (Domain Controllers) */}
        <div className="border-t border-border/50 pt-6">
          <h3 className="text-sm font-semibold text-muted-foreground mb-4 flex items-center gap-2">
            <Database className="w-4 h-4" /> Máquinas Virtuales (Controladores de Dominio)
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <DCCard 
              title="AD01 (Master)" 
              data={nodes.dc01} 
              icon={<ShieldCheck className="w-5 h-5" />} 
              isPrimary={true}
              onClick={() => setIsADModalOpen(true)}
            />
            <DCCard 
              title="AD02 (Secundario)" 
              data={nodes.dc02} 
              icon={<ShieldAlert className="w-5 h-5" />} 
            />
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
                  {/* General Stats */}
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                    <MetricSmall label="Total Usuarios" value={adData.Users?.Total || 0} icon={<Users className="w-4 h-4" />} />
                    <MetricSmall label="Bloqueados" value={adData.Users?.Locked || 0} color={adData.Users?.Locked > 0 ? 'text-rose-400' : 'text-emerald-400'} icon={<Lock className="w-4 h-4" />} />
                    <MetricSmall label="Replicación" value={adData.Replication?.Status || 'N/A'} color={adData.Replication?.Status === 'OK' ? 'text-emerald-400' : 'text-rose-400'} icon={<RefreshCw className="w-4 h-4" />} />
                    <MetricSmall label="Estado Backups" value={adData.Backups?.Status || 'N/A'} color={adData.Backups?.Status === 'OK' ? 'text-emerald-400' : 'text-rose-400'} icon={<Database className="w-4 h-4" />} />
                  </div>

                  {/* AD Details */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="bg-background border border-border rounded-lg p-4">
                      <h4 className="text-sm font-semibold mb-3 border-b border-border/50 pb-2">Salud de Objetos</h4>
                      <div className="space-y-2 text-sm">
                        <div className="flex justify-between"><span className="text-muted-foreground">Cuentas Inactivas (>90 días):</span><span className="font-medium text-amber-400">{adData.Users?.Inactive90 || 0}</span></div>
                        <div className="flex justify-between"><span className="text-muted-foreground">Contraseñas No Expiran:</span><span className="font-medium text-amber-400">{adData.Users?.NonExpiringPwd || 0}</span></div>
                        <div className="flex justify-between"><span className="text-muted-foreground">Total GPOs:</span><span className="font-medium">{adData.GPOs?.Total || 0}</span></div>
                        <div className="flex justify-between"><span className="text-muted-foreground">GPOs Vacías/Sin enlazar:</span><span className="font-medium">{adData.GPOs?.Empty || 0}</span></div>
                      </div>
                    </div>
                    
                    <div className="bg-background border border-border rounded-lg p-4">
                      <h4 className="text-sm font-semibold mb-3 border-b border-border/50 pb-2">Eventos de Seguridad (7 días)</h4>
                      <div className="space-y-2 text-sm">
                        <div className="flex justify-between"><span className="text-muted-foreground">Intentos Fallidos (4625):</span><span className="font-medium text-rose-400">{adData.Security?.FailedLogins || 0}</span></div>
                        <div className="flex justify-between"><span className="text-muted-foreground">Cambios en Políticas:</span><span className="font-medium">{adData.Security?.PolicyChanges || 0}</span></div>
                        <div className="flex justify-between"><span className="text-muted-foreground">Roles FSMO Locales:</span><span className="font-medium">{adData.FSMO?.Status || 'OK'}</span></div>
                        <div className="flex justify-between"><span className="text-muted-foreground">Ruta Backups:</span><span className="font-medium text-[10px] truncate max-w-[150px]" title={adData.Backups?.Path || ''}>{adData.Backups?.Path || 'N/A'}</span></div>
                      </div>
                    </div>
                  </div>

                  <div className="flex justify-end pt-4">
                    <a 
                      href={monitoringService.getReportHtmlUrl("AD-DC01", "latest")} 
                      target="_blank" 
                      rel="noopener noreferrer"
                      className="flex items-center gap-2 bg-primary text-primary-foreground hover:bg-primary/90 px-4 py-2 rounded-lg font-medium transition-colors"
                    >
                      Abrir Reporte HTML de Sistema <ExternalLink className="w-4 h-4" />
                    </a>
                  </div>
                </div>
              ) : (
                <div className="py-12 flex flex-col items-center text-muted-foreground">
                  <Database className="w-12 h-12 mb-4 opacity-20 animate-pulse" />
                  <p>Cargando datos detallados de AD...</p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

        {/* Kaspersky Card */}
        <div className="bg-card/40 backdrop-blur-sm border border-border rounded-xl p-6 flex flex-col opacity-60 grayscale hover:grayscale-0 hover:opacity-100 transition-all duration-300">
           <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-3">
              <div className="p-2.5 rounded-lg bg-emerald-500/20 text-emerald-400">
                <ShieldCheck className="w-5 h-5" />
              </div>
              <div>
                <h3 className="font-bold text-lg">Kaspersky KSC</h3>
                <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">Security Center</span>
              </div>
            </div>
            <StatusBadge status="gray" label="Desconectado" />
          </div>
          <div className="flex-1 flex flex-col items-center justify-center py-10">
            <p className="text-sm font-medium">Módulo en Desarrollo</p>
            <p className="text-xs mt-1 text-center">Próximamente: Monitoreo de Endpoints y Licencias</p>
          </div>
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
                history.map((file, idx) => (
                  <tr key={idx} className="hover:bg-muted/30 transition-colors">
                    <td className="px-6 py-4 font-medium">
                      {file.split('_').slice(1, 3).join(' ').replace('.json', '').replace('-', '/').replace('-', '/')}
                    </td>
                    <td className="px-6 py-4">Active Directory</td>
                    <td className="px-6 py-4 font-mono text-[11px] opacity-70">{file}</td>
                    <td className="px-6 py-4">
                      <StatusBadge status="success" label="OK" />
                    </td>
                    <td className="px-6 py-4 text-right">
                      <a 
                        href={monitoringService.getReportHtmlUrl("AD", file.replace('.json', ''))} 
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
