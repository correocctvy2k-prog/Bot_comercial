import { useEffect, useMemo, useState } from "react";
import { io } from "socket.io-client";
import {
  Activity,
  CheckCircle2,
  Clock,
  Cpu,
  Database,
  HardDrive,
  Lock,
  RefreshCw,
  Server,
  ShieldCheck,
  WifiOff
} from "lucide-react";
import { monitoringService } from "@/services/monitoring.service";

const SOCKET_URL = import.meta.env.VITE_MONITORING_BACKEND_URL || "http://localhost:3001";

const ProxmoxIcon = ({ className = "h-6 w-6" }) => (
  <img src="/proxmox_logo.png" alt="Proxmox" className={`${className} object-contain`} />
);

const ZKIcon = ({ className = "h-6 w-6" }) => (
  <img src="/zk_logo.png" alt="ZKBio" className={`${className} object-contain`} />
);

const normalizeText = (text) => {
  if (text == null) return text;
  return String(text)
    .replace(/Ã¡/g, "á")
    .replace(/Ã©/g, "é")
    .replace(/Ã­/g, "í")
    .replace(/Ã³/g, "ó")
    .replace(/Ãº/g, "ú")
    .replace(/Ã±/g, "ñ")
    .replace(/Â°/g, "°")
    .replace(/Â/g, "")
    .trim();
};

const formatUptime = (uptime) => {
  const value = normalizeText(uptime);
  if (!value) return "N/A";
  return value.replace(/\s+dÃ­as/i, " días");
};

const getSupabaseToken = () => {
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key?.includes("-auth-token")) {
      try {
        return JSON.parse(localStorage.getItem(key))?.access_token;
      } catch {
        return null;
      }
    }
  }
  return null;
};

const getPingState = (ping) => {
  const PING_FRESH_MS = 45000;
  const lastSeen = ping?.receivedAt || ping?.checkedAt || null;
  const isFresh = lastSeen && Date.now() - lastSeen < PING_FRESH_MS;
  const statusUp = isFresh && ping?.status === "UP";
  const statusDown = isFresh && ping?.status !== "UP";

  if (statusUp) return { state: "up", label: `${Math.round(Number(ping.time) || 0)}ms` };
  if (statusDown) return { state: "down", label: "OFFLINE" };
  return { state: "unknown", label: "SIN LATIDO" };
};

const StatusDot = ({ ping, size = "md" }) => {
  const { state } = getPingState(ping);
  const dimensions = size === "lg" ? "w-3.5 h-3.5" : "w-3 h-3";
  const color = state === "up"
    ? "bg-emerald-400 shadow-[0_0_14px_rgba(52,211,153,0.75)]"
    : state === "down"
      ? "bg-rose-500 shadow-[0_0_14px_rgba(244,63,94,0.8)]"
      : "bg-slate-600";

  return (
    <span
      className={`${dimensions} rounded-full ${color} shrink-0`}
      style={{
        animation: state === "up" ? "breathe 3s ease-in-out infinite" : state === "down" ? "breathe-red 2s ease-in-out infinite" : "none"
      }}
    />
  );
};

const MiniStat = ({ icon, label, value, color = "text-foreground" }) => (
  <div className="min-w-0 rounded-md border border-border/40 bg-background/35 px-2.5 py-2">
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
    <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-1 text-[10px] font-bold uppercase tracking-wide ${cls}`}>
      {ok ? <CheckCircle2 className="h-3 w-3" /> : <WifiOff className="h-3 w-3" />}
      {label}
    </span>
  );
};

const VmTile = ({ title, role, ping, uptime, servicesOk, servicesTotal, disk, backup, updates, extra, icon }) => {
  const pingState = getPingState(ping);
  const servicesKnown = servicesTotal > 0;
  const servicesHealthy = servicesKnown && servicesOk >= servicesTotal;
  const diskPct = Number(disk?.PercentFree ?? disk?.percentFree);
  const diskColor = Number.isFinite(diskPct) && diskPct < 15
    ? "text-rose-400"
    : Number.isFinite(diskPct) && diskPct < 25
      ? "text-amber-400"
      : "text-emerald-400";
  const pendingUpdate = updates?.RebootRequired || updates?.RebootPending || (updates?.PendingCount && updates.PendingCount > 0);

  return (
    <div className={`rounded-lg border bg-background/45 p-3.5 ${pingState.state === "down" ? "border-rose-500/40 bg-rose-500/5" : "border-border/50"}`}>
      <div className="mb-3 flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <div className="rounded-lg bg-primary/10 p-2 text-primary">{icon}</div>
          <div className="min-w-0">
            <h3 className="flex items-center gap-2 truncate text-sm font-black">
              {title}
              {pingState.state === "up" && <span className="text-[10px] font-medium text-emerald-400">{pingState.label}</span>}
              {pingState.state === "down" && <span className="rounded bg-rose-500 px-1.5 py-0.5 text-[9px] font-bold text-white">OFFLINE</span>}
            </h3>
            <p className="truncate text-[10px] font-bold uppercase tracking-wider text-muted-foreground">{role}</p>
          </div>
        </div>
        <StatusDot ping={ping} />
      </div>

      <div className="grid grid-cols-2 gap-2">
        <MiniStat icon={<Clock className="h-4 w-4" />} label="Uptime" value={formatUptime(uptime)} />
        <MiniStat
          icon={<Activity className="h-4 w-4" />}
          label="Servicios"
          value={!servicesKnown ? "N/D" : servicesHealthy ? "Sistema OK" : `${servicesTotal - servicesOk} falla(s)`}
          color={!servicesKnown ? "text-slate-400" : servicesHealthy ? "text-emerald-400" : "text-rose-400"}
        />
        <MiniStat
          icon={<HardDrive className="h-4 w-4" />}
          label="Disco C"
          value={disk ? `${disk.FreeGB ?? "?"}GB libres (${disk.PercentFree ?? "?"}%)` : "N/A"}
          color={diskColor}
        />
        <MiniStat icon={<Database className="h-4 w-4" />} label="Backup" value={backup || "N/A"} />
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-border/40 pt-3">
        <HealthBadge label={pendingUpdate ? "Reinicio/updates" : "SO al día"} ok={!pendingUpdate} warn={pendingUpdate} />
        {extra}
      </div>
    </div>
  );
};

const HostPanel = ({ title, subtitle, ping, status, right, children, icon }) => {
  const pingState = getPingState(ping);

  return (
    <section className={`rounded-xl border bg-card/35 p-4 ${pingState.state === "down" ? "border-rose-500/40 bg-rose-500/5" : "border-border"}`}>
      <div className="mb-4 flex flex-col gap-3 border-b border-border/40 pb-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex min-w-0 items-center gap-3">
          <div className={`rounded-xl ${icon ? "p-0" : "p-3"} ${pingState.state === "down" ? "bg-rose-500/20 text-rose-400" : icon ? "bg-transparent" : "bg-sky-500/15 text-sky-400"}`}>
            {icon || <Server className="h-6 w-6" />}
          </div>
          <div className="min-w-0">
            <h2 className="flex items-center gap-2 truncate text-lg font-black">
              {title}
              <StatusDot ping={ping} size="lg" />
              {pingState.state === "up" && <span className="text-xs font-medium text-emerald-400">{pingState.label}</span>}
              {pingState.state === "down" && <span className="rounded bg-rose-500 px-1.5 py-0.5 text-[10px] font-bold text-white">OFFLINE</span>}
            </h2>
            <div className="mt-0.5 flex flex-wrap items-center gap-2">
              <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">{subtitle}</p>
              {status && <span className="text-[11px] font-bold text-emerald-400">{status}</span>}
            </div>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2 lg:justify-end">{right}</div>
      </div>

      <div>
        <p className="mb-3 flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
          <Database className="h-4 w-4" />
          Máquinas Virtuales
        </p>
        <div className="grid grid-cols-1 gap-3 xl:grid-cols-2">{children}</div>
      </div>
    </section>
  );
};

const pickPing = (pingData, keys) => keys.map((key) => pingData[key]).find(Boolean);

export default function MonitoringDashboard() {
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
  const [loading, setLoading] = useState(true);
  const [lastUpdate, setLastUpdate] = useState(null);

  const fetchData = async () => {
    try {
      const [host1, host2, dc01, dc02, dc03, ksc, zk] = await Promise.all([
        monitoringService.getLatestStatus("ANFIGANE"),
        monitoringService.getLatestStatus("ANFI-SEG"),
        monitoringService.getLatestStatus("AD"),
        monitoringService.getLatestStatus("AD-DC02"),
        monitoringService.getLatestStatus("AD-DC03"),
        monitoringService.getLatestStatus("KSC"),
        monitoringService.getLatestStatus("SERV-ZK")
      ]);
      setNodes({ host1, host2, dc01, dc02, dc03, ksc, zk });
      setLastUpdate(new Date());
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 60000);
    const socket = io(SOCKET_URL, { auth: { token: getSupabaseToken() } });

    socket.on("monitoring:heartbeat", (data) => {
      const timestamped = Object.fromEntries(
        Object.entries(data).map(([key, value]) => [
          key,
          { ...value, receivedAt: Date.now(), checkedAt: value?.checkedAt }
        ])
      );
      setPingData(timestamped);
    });

    return () => {
      clearInterval(interval);
      socket.disconnect();
    };
  }, []);

  const model = useMemo(() => {
    const dc01Status = nodes.dc01?.DCs?.Status?.find?.((d) => d.DC === "AD01") || {};
    const dc02Services = nodes.dc02?.LocalHealth?.Services || [];
    const dc03Local = nodes.dc03?.LocalHealth || nodes.dc03?.data?.LocalHealth || {};
    const dc03Services = dc03Local.Services || [];

    const rawK = nodes.ksc || {};
    const kscLocal = rawK.LocalHealth || rawK.data?.LocalHealth || {};
    const kscServices = kscLocal.Services || rawK.Services || [];
    const kscDisk = Array.isArray(kscLocal.Disk)
      ? kscLocal.Disk[0]
      : kscLocal.Disk?.DeviceID
        ? kscLocal.Disk
        : null;

    const rawZ = nodes.zk || {};
    const zkHost = rawZ.Host || rawZ.data?.Host || {};
    const zkServices = rawZ.ZKBio || rawZ.data?.ZKBio || {};
    const zkServiceList = zkServices.Services || rawZ.Services || rawZ.data?.Services || [];
    const zkCritical = zkServices.CriticalServices || [];
    const zkDiskSource = rawZ.Disks || rawZ.data?.Disks || rawZ.Disk?.Disks || rawZ.data?.Disk?.Disks || [];
    const zkDisk = Array.isArray(zkDiskSource)
      ? (zkDiskSource.find((d) => d.DeviceID === "C:" || d.Drive === "C:") || zkDiskSource[0])
      : null;
    const zkOnline = zkServices.ZKBIOOnline || zkCritical.find?.((s) => String(s.Name || s.DisplayName || "").toLowerCase().includes("zkbioonline"));
    const zkRunning = zkServices.CriticalServicesOk ?? zkCritical.filter?.((s) => s.Healthy || s.State === "Running").length ?? zkServices.RunningCount ?? 0;
    const zkTotal = zkServices.CriticalServicesTotal ?? zkCritical.length ?? zkServices.TotalCount ?? zkServiceList.length ?? 0;

    return {
      host1: {
        ping: pickPing(pingData, ["ANFIGANE", "AD-HOST", "192.168.8.43"]),
        vmCount: `${(nodes.host1?.VMs || []).filter((v) => v.State === 2 || v.State === "Running").length}/${nodes.host1?.VMs?.length || 0} VMs`,
        ram: nodes.host1?.RAM ? `${nodes.host1.RAM.FreeGB}GB / ${nodes.host1.RAM.TotalGB}GB` : "N/D"
      },
      host2: {
        ping: pickPing(pingData, ["ANFI-SEG", "ANFI-SEG13798", "192.168.8.41"]),
        vmCount: `${(nodes.host2?.VMs || nodes.host2?.data?.VMs || []).filter((v) => v.State === 2 || v.State === "Running" || v.State === "Operating").length}/${(nodes.host2?.VMs || nodes.host2?.data?.VMs || []).length || 0} VMs`,
        ram: nodes.host2?.RAM || nodes.host2?.data?.System
          ? `${nodes.host2?.RAM?.FreeGB || nodes.host2?.data?.System?.RAM_Free_GB || 0}GB / ${nodes.host2?.RAM?.TotalGB || nodes.host2?.data?.System?.RAM_Total_GB || 0}GB`
          : "N/D"
      },
      proxmox: {
        ping: pickPing(pingData, ["PROXMOX-ZK", "PROXMOX", "192.168.8.50"]),
        status: zkHost.Status || "N/D",
        web: zkHost.Ports?.WebUI8006,
        ssh: zkHost.Ports?.SSH22
      },
      vms: {
        ad01: {
          ping: pickPing(pingData, ["AD", "AD01", "192.168.8.44"]),
          uptime: dc01Status.Uptime || "N/A",
          servicesOk: dc01Status.Services?.filter?.((s) => String(s).toLowerCase().includes("ok") || String(s).toLowerCase().includes("running")).length || 0,
          servicesTotal: dc01Status.Services?.length || 6,
          disk: nodes.dc01?.Disk?.Disks?.find?.((d) => d.DC === "AD01"),
          backup: nodes.dc01?.Backups?.Backups?.find?.((b) => b.Ruta?.includes("AD01"))?.UltimoBackup || "N/A",
          updates: nodes.dc01?.Updates,
          security: nodes.dc01?.Security
        },
        ad02: {
          ping: pickPing(pingData, ["AD-DC02", "AD02", "DA02", "192.168.8.45"]),
          uptime: nodes.dc02?.Uptime || "N/A",
          servicesOk: dc02Services.filter?.((s) => s.Status === "Running" || s.Status === 4 || s.Status === "OK").length || 0,
          servicesTotal: dc02Services.length || 6,
          disk: nodes.dc02?.LocalHealth?.Disk?.[0],
          backup: nodes.dc01?.Backups?.Backups?.find?.((b) => b.Ruta?.includes("AD02"))?.UltimoBackup || "N/A",
          updates: nodes.dc02?.LocalHealth?.Updates || nodes.dc01?.Updates,
          replication: nodes.dc02?.LocalHealth?.Replication
        },
        ad03: {
          ping: pickPing(pingData, ["AD-DC03", "AD03", "DA03", "192.168.8.46"]),
          uptime: nodes.dc03?.Uptime || dc03Local.Uptime || "N/A",
          servicesOk: dc03Services.filter?.((s) => s.Status === "Running" || s.Status === 4 || s.Status === "OK").length || 0,
          servicesTotal: dc03Services.length || 4,
          disk: dc03Local.Disk?.[0] || dc03Local.Storage?.find?.((d) => d.Drive === "C:" || d.Drive === "C:\\"),
          backup: nodes.dc03?.Backups?.Status?.AD03 || "N/A",
          updates: dc03Local.Updates || nodes.dc01?.Updates,
          replication: dc03Local.Replication
        },
        ksc: {
          ping: pickPing(pingData, ["KSC", "SERV-KSC", "192.168.8.42"]),
          uptime: rawK.Uptime || kscLocal.Uptime || "N/A",
          servicesOk: kscServices.filter?.((s) => s.Status === 4 || s.Status === "Running" || s.Status === "OK").length || 0,
          servicesTotal: kscServices.length || 6,
          disk: kscDisk,
          backup: kscLocal.Backup?.UltimoBackup || "N/A",
          updates: kscLocal.Updates || rawK.Updates
        },
        zk: {
          ping: pickPing(pingData, ["SERV-ZK", "ZK", "192.168.8.112"]),
          uptime: rawZ.Uptime || rawZ.data?.Uptime || "N/A",
          servicesOk: zkRunning,
          servicesTotal: zkTotal || 1,
          disk: zkDisk,
          backup: "N/A",
          updates: rawZ.Updates || rawZ.data?.Updates,
          zkOnlineStatus: zkOnline?.State || zkOnline?.Status || "N/D"
        }
      }
    };
  }, [nodes, pingData]);

  const onlineCount = [
    model.host1.ping,
    model.host2.ping,
    model.proxmox.ping,
    model.vms.ad01.ping,
    model.vms.ad02.ping,
    model.vms.ad03.ping,
    model.vms.ksc.ping,
    model.vms.zk.ping
  ].filter((ping) => getPingState(ping).state === "up").length;

  return (
    <div className="space-y-5 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <style>{`
        @keyframes breathe {
          0%, 100% { opacity: 1; filter: brightness(1.2) drop-shadow(0 0 10px rgba(52,211,153,0.8)); }
          50% { opacity: 0.55; filter: brightness(0.8) drop-shadow(0 0 4px rgba(52,211,153,0.4)); }
        }
        @keyframes breathe-red {
          0%, 100% { opacity: 1; filter: brightness(1.2) drop-shadow(0 0 12px rgba(244,63,94,0.9)); }
          50% { opacity: 0.45; filter: brightness(0.7) drop-shadow(0 0 5px rgba(244,63,94,0.5)); }
        }
      `}</style>

      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <h1 className="text-2xl font-black tracking-tight">Dashboard Monitoreo</h1>
          <p className="mt-1 text-sm text-muted-foreground">Vista compacta de salud, servicios y conectividad de infraestructura.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <HealthBadge label={`${onlineCount}/8 online`} ok={onlineCount === 8} warn={onlineCount >= 6} />
          <button
            onClick={fetchData}
            disabled={loading}
            className="flex items-center gap-2 rounded-lg border border-border bg-card px-3 py-2 text-xs font-bold uppercase tracking-wide transition-colors hover:bg-muted"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
            Actualizar
          </button>
          <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
            {lastUpdate ? lastUpdate.toLocaleTimeString("es-CO", { hour: "2-digit", minute: "2-digit", second: "2-digit" }) : "Sin actualización"}
          </span>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-5 2xl:grid-cols-3">
        <HostPanel
          title="ANFIGANE"
          subtitle="ProLiant / Hyper-V"
          ping={model.host1.ping}
          status={nodes.host1?.Uptime ? `UPTIME: ${nodes.host1.Uptime}` : ""}
          right={
            <>
              <MiniStat icon={<Cpu className="h-4 w-4" />} label="RAM" value={model.host1.ram} />
              <MiniStat icon={<Activity className="h-4 w-4" />} label="VMs" value={model.host1.vmCount} color="text-emerald-400" />
            </>
          }
        >
          <VmTile title="AD01" role="MASTER DC" icon={<ShieldCheck className="h-5 w-5" />} {...model.vms.ad01} />
          <VmTile
            title="AD02"
            role="SECUNDARIO BDC"
            icon={<ShieldCheck className="h-5 w-5" />}
            {...model.vms.ad02}
            extra={model.vms.ad02.replication && <HealthBadge label={`Rep ${model.vms.ad02.replication}`} ok={model.vms.ad02.replication === "OK"} warn={model.vms.ad02.replication !== "OK"} />}
          />
        </HostPanel>

        <HostPanel
          title="ANFI-SEG13798"
          subtitle="HP ProLiant / Hyper-V"
          ping={model.host2.ping}
          status={nodes.host2?.Uptime ? `UPTIME: ${nodes.host2.Uptime}` : ""}
          right={
            <>
              <MiniStat icon={<Cpu className="h-4 w-4" />} label="RAM" value={model.host2.ram} />
              <MiniStat icon={<Activity className="h-4 w-4" />} label="VMs" value={model.host2.vmCount} color="text-emerald-400" />
            </>
          }
        >
          <VmTile
            title="AD03"
            role="SECUNDARIO BDC"
            icon={<ShieldCheck className="h-5 w-5" />}
            {...model.vms.ad03}
            extra={model.vms.ad03.replication && <HealthBadge label={`Rep ${model.vms.ad03.replication}`} ok={model.vms.ad03.replication === "OK"} warn={model.vms.ad03.replication !== "OK"} />}
          />
          <VmTile title="SERV-KSC" role="KSC SERVER" icon={<Lock className="h-5 w-5" />} {...model.vms.ksc} />
        </HostPanel>

        <HostPanel
          title="PROXMOX-ZK"
          subtitle="Proxmox VE"
          ping={model.proxmox.ping}
          status={model.proxmox.status !== "N/D" ? `ESTADO HOST: ${model.proxmox.status}` : ""}
          icon={<ProxmoxIcon className="h-10 w-10" />}
          right={
            <>
              <MiniStat icon={<Activity className="h-4 w-4" />} label="Web UI" value={model.proxmox.web ? "8006 OK" : "N/D"} color={model.proxmox.web ? "text-emerald-400" : "text-amber-400"} />
              <MiniStat icon={<Lock className="h-4 w-4" />} label="SSH" value={model.proxmox.ssh ? "22 OK" : "N/D"} color={model.proxmox.ssh ? "text-emerald-400" : "text-amber-400"} />
              <MiniStat icon={<Cpu className="h-4 w-4" />} label="VMs" value="1/1 VMs" color="text-emerald-400" />
            </>
          }
        >
          <VmTile
            title="SERV-ZK"
            role={`ZKBIOONLINE: ${model.vms.zk.zkOnlineStatus}`}
            icon={<ZKIcon className="h-7 w-7" />}
            {...model.vms.zk}
            extra={<HealthBadge label={`ZK ${model.vms.zk.zkOnlineStatus}`} ok={model.vms.zk.zkOnlineStatus === "Running" || model.vms.zk.zkOnlineStatus === 4} warn={model.vms.zk.zkOnlineStatus !== "N/D"} />}
          />
        </HostPanel>
      </div>
    </div>
  );
}
