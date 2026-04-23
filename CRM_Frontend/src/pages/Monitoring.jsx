import { useState, useEffect } from "react";
import { 
  Server, 
  ShieldCheck, 
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
  ExternalLink
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

export default function Monitoring() {
  const [adData, setAdData] = useState(null);
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(true);
  const [lastUpdate, setLastUpdate] = useState(null);

  const fetchData = async () => {
    setLoading(true);
    try {
      const data = await monitoringService.getLatestStatus("AD");
      const hist = await monitoringService.getHistory("AD");
      setAdData(data);
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

      {/* Main Grid */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        
        {/* Active Directory Card */}
        <div className="bg-card/40 backdrop-blur-sm border border-border rounded-xl p-6 flex flex-col group hover:border-primary/40 transition-all duration-300">
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-3">
              <div className="p-2.5 rounded-lg bg-sky-500/20 text-sky-400 group-hover:scale-110 transition-transform">
                <Server className="w-5 h-5" />
              </div>
              <div>
                <h3 className="font-bold text-lg">Active Directory</h3>
                <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">Windows Server 2022</span>
              </div>
            </div>
            {adData ? (
              <StatusBadge status={adData.OverallStatus === 'OK' ? 'success' : 'warning'} label={adData.OverallStatus} />
            ) : (
              <StatusBadge status="gray" label="Pendiente" />
            )}
          </div>

          {adData ? (
            <div className="space-y-4 flex-1">
              <div className="grid grid-cols-2 gap-3">
                <MetricSmall label="Controladores" value={adData.DCs.Total} icon={<CheckCircle2 className="w-3.5 h-3.5" />} />
                <MetricSmall label="Replicación" value={adData.Replication.Status} color={adData.Replication.Status === 'OK' ? 'text-emerald-400' : 'text-rose-400'} />
                <MetricSmall label="FSMO Roles" value="Transferibles" color="text-sky-400" />
                <MetricSmall label="Backup AD" value={adData.Backup.Status} color={adData.Backup.Status === 'OK' ? 'text-emerald-400' : 'text-rose-400'} />
              </div>

              <div className="pt-2 border-t border-border/50">
                <p className="text-xs text-muted-foreground mb-2">Seguridad (ISO 27001)</p>
                <div className="space-y-2">
                  <SecurityMetric label="Intentos fallidos" value={adData.Security.FailedLogins} max={100} />
                  <SecurityMetric label="Usuarios bloqueados" value={adData.Users.Locked} max={5} />
                </div>
              </div>

              <div className="mt-auto pt-4 flex items-center justify-between text-[11px] text-muted-foreground">
                <span className="flex items-center gap-1">
                  <Clock className="w-3 h-3" />
                  {formatDistanceToNow(new Date(adData.ReportDate), { addSuffix: true, locale: es })}
                </span>
                <a href="#" className="flex items-center gap-1 text-primary hover:underline font-medium">
                  Ver Reporte Completo <ExternalLink className="w-3 h-3" />
                </a>
              </div>
            </div>
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center py-10 opacity-50">
              <Database className="w-12 h-12 mb-3 text-muted-foreground" />
              <p className="text-sm font-medium">Esperando datos del script...</p>
              <p className="text-xs mt-1 text-center">Ejecute MonitoreoAD.ps1 para ver resultados</p>
            </div>
          )}
        </div>

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
                      <button className="text-primary hover:underline text-xs font-medium">Ver JSON</button>
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
