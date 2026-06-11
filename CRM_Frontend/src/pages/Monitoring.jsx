import { useState, useEffect } from "react";
import { io } from "socket.io-client";
import { useRef } from "react";
import { useContext } from "react";
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
  MonitorSmartphone,
  Move,
  RefreshCw,
  RotateCcw,
  ExternalLink,
  Cpu,
  Activity,
  KeyRound,
  Bug,
  Shield
} from "lucide-react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  Cell,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis
} from "recharts";
import { monitoringService } from "@/services/monitoring.service";
import { PageHeaderContext } from "@/layout/Layout";
import SkylabBot from "@/components/SkylabBot";

const SOCKET_URL = import.meta.env.VITE_MONITORING_BACKEND_URL || 'http://localhost:3001';
const MONITORING_LAYOUT_STORAGE_KEY = 'skylab.monitoring.dashboardLayout.v1';

const DEFAULT_MONITORING_LAYOUT = [
  { id: 'anfigane', size: 'half' },
  { id: 'anfi-seg', size: 'half' },
  { id: 'ksc-summary', size: 'half' },
  { id: 'zk-summary', size: 'half' },
  { id: 'ksc-inventory', size: 'full' }
];

const PANEL_SIZE_CLASSES = {
  third: 'lg:col-span-4',
  half: 'lg:col-span-6',
  wide: 'lg:col-span-8',
  full: 'lg:col-span-12'
};

const PANEL_SIZE_LABELS = {
  third: '1/3',
  half: '1/2',
  wide: '2/3',
  full: 'Full'
};

const FOCUS_INVENTORY_CHART_MODES = ['freshness', 'types'];

const getNextFocusInventoryChartMode = (currentMode) => {
  const currentIndex = FOCUS_INVENTORY_CHART_MODES.indexOf(currentMode);
  return FOCUS_INVENTORY_CHART_MODES[(currentIndex + 1) % FOCUS_INVENTORY_CHART_MODES.length];
};

const normalizeMonitoringLayout = (storedLayout) => {
  const incoming = Array.isArray(storedLayout) ? storedLayout : [];
  const byId = new Map(incoming.map((item) => [item.id, item]));
  return DEFAULT_MONITORING_LAYOUT.map((item) => {
    const saved = byId.get(item.id);
    return {
      id: item.id,
      size: PANEL_SIZE_CLASSES[saved?.size] ? saved.size : item.size
    };
  }).sort((a, b) => {
    const orderA = incoming.findIndex((item) => item.id === a.id);
    const orderB = incoming.findIndex((item) => item.id === b.id);
    return (orderA === -1 ? 999 : orderA) - (orderB === -1 ? 999 : orderB);
  });
};

const loadMonitoringLayout = () => {
  try {
    return normalizeMonitoringLayout(JSON.parse(localStorage.getItem(MONITORING_LAYOUT_STORAGE_KEY) || '[]'));
  } catch {
    return DEFAULT_MONITORING_LAYOUT;
  }
};

const EditableDashboardPanel = ({
  id,
  title,
  layout,
  editMode,
  onSizeChange,
  onDragStart,
  onDragOver,
  onDrop,
  children
}) => {
  const panel = layout.find((item) => item.id === id) || DEFAULT_MONITORING_LAYOUT.find((item) => item.id === id);
  const size = panel?.size || 'half';
  const order = layout.findIndex((item) => item.id === id);

  return (
    <div
      className={`col-span-1 ${PANEL_SIZE_CLASSES[size]} min-w-0 transition-all duration-300 ${editMode ? 'rounded-xl border border-dashed border-primary/45 bg-primary/5 p-2' : ''}`}
      style={{ order }}
      draggable={editMode}
      onDragStart={(event) => onDragStart(event, id)}
      onDragOver={onDragOver}
      onDrop={(event) => onDrop(event, id)}
    >
      {editMode && (
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border bg-card/80 px-3 py-2">
          <div className="flex items-center gap-2 text-xs font-bold text-muted-foreground">
            <Move className="h-4 w-4 text-primary" />
            <span>{title}</span>
          </div>
          <div className="flex items-center gap-1">
            {Object.keys(PANEL_SIZE_CLASSES).map((option) => (
              <button
                key={option}
                type="button"
                onClick={(event) => {
                  event.stopPropagation();
                  onSizeChange(id, option);
                }}
                className={`rounded-md border px-2 py-1 text-[10px] font-black transition-colors ${size === option ? 'border-primary bg-primary text-primary-foreground' : 'border-border bg-background text-muted-foreground hover:text-foreground'}`}
              >
                {PANEL_SIZE_LABELS[option]}
              </button>
            ))}
          </div>
        </div>
      )}
      {children}
    </div>
  );
};

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
    <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[11px] font-semibold border ${
      isPending ? 'bg-amber-500/10 text-amber-400 border-amber-500/20' : 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
    }`}>
      {isPending ? <RefreshCw className="w-4 h-4 animate-spin-slow" /> : <CheckCircle2 className="w-4 h-4" />}
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

const KasperskyIcon = ({ className = "w-6 h-6" }) => (
  <img src="/kaspersky_logo.png" alt="Kaspersky" className={`${className} object-contain`} />
);

const ProxmoxIcon = ({ className = "w-6 h-6" }) => (
  <img src="/proxmox_logo.png" alt="Proxmox" className={`${className} object-contain`} />
);

const ZKIcon = ({ className = "w-6 h-6" }) => (
  <img src="/zk_logo.png" alt="ZKBio" className={`${className} object-contain`} />
);

const BabyWareIcon = ({ className = "w-6 h-6" }) => (
  <img src="/babyware_logo.jpg" alt="BabyWare" className={`${className} object-contain`} />
);

const toInt = (value, fallback = 0) => {
  const parsed = parseInt(value ?? fallback, 10);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const normalizeVersionBuckets = (source) => {
  if (!source) return [];
  if (!Array.isArray(source) && typeof source === 'object' && (source.Version || source.version) && (source.Count !== undefined || source.count !== undefined)) {
    return normalizeVersionBuckets([source]);
  }
  const rows = Array.isArray(source)
    ? source
    : Object.entries(source).map(([version, value]) => (
        typeof value === 'object' && value !== null
          ? { Version: version, ...value }
          : { Version: version, Count: value }
      ));

  return rows
    .map((item) => ({
      version: normalizeText(item.Version || item.version || item.Name || item.name || item.ProductVersion || item.ApplicationVersion || item.Label || item.label || 'N/D'),
      count: toInt(item.Count ?? item.count ?? item.Devices ?? item.devices ?? item.Dispositivos ?? item.Total ?? item.total)
    }))
    .filter((item) => item.version && item.version !== 'N/D' && item.count > 0)
    .sort((a, b) => compareSemanticVersions(b.version, a.version) || b.count - a.count);
};

const getVersionParts = (version = '') => {
  const match = String(version).match(/\d+(?:\.\d+)*/);
  if (!match) return [];
  return match[0].split('.').map((part) => toInt(part));
};

const compareSemanticVersions = (left = '', right = '') => {
  const a = getVersionParts(left);
  const b = getVersionParts(right);
  const length = Math.max(a.length, b.length);
  for (let i = 0; i < length; i += 1) {
    const diff = (a[i] || 0) - (b[i] || 0);
    if (diff !== 0) return diff;
  }
  return String(left).localeCompare(String(right));
};

const getLatestVersion = (versions = []) => versions.reduce((latest, item) => {
  if (!latest) return item;
  return compareSemanticVersions(item.version, latest.version) > 0 ? item : latest;
}, null);

const VersionDistribution = ({ title, versions, accent = 'emerald' }) => {
  const latest = getLatestVersion(versions);
  const visibleVersions = versions.slice(0, 4);
  const hiddenCount = Math.max(versions.length - visibleVersions.length, 0);
  const totalDevices = versions.reduce((sum, item) => sum + item.count, 0);
  const accentClass = accent === 'sky' ? 'text-sky-300 bg-sky-500/10 border-sky-500/25' : 'text-emerald-300 bg-emerald-500/10 border-emerald-500/25';

  return (
    <div className="rounded-lg border border-border/40 bg-background/40 p-3">
      <div className="flex items-start justify-between gap-2">
        <p className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">{title}</p>
        <span className="shrink-0 text-[10px] font-black text-slate-300">{totalDevices || 0} equipos</span>
      </div>

      {visibleVersions.length > 0 ? (
        <div className="mt-2.5 space-y-1.5">
          {visibleVersions.map((item) => {
            const isLatest = latest && compareSemanticVersions(item.version, latest.version) === 0;
            return (
              <div key={`${title}-${item.version}`} className={`flex items-center justify-between gap-2 rounded-md border px-2.5 py-1.5 ${isLatest ? 'border-emerald-500/30 bg-emerald-500/10' : 'border-border/35 bg-background/30'}`}>
                <div className="min-w-0">
                  <p className={`truncate text-[13px] font-black ${isLatest ? 'text-emerald-300' : 'text-slate-200'}`}>v{item.version}</p>
                  <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">{isLatest ? 'Más actual' : 'Anterior'}</p>
                </div>
                <span className={`shrink-0 rounded-full border px-2 py-0.5 text-[11px] font-black ${isLatest ? accentClass : 'border-border/40 bg-muted/20 text-slate-300'}`}>
                  {item.count} eq
                </span>
              </div>
            );
          })}
          {hiddenCount > 0 && (
            <p className="text-[10px] font-bold text-muted-foreground">+{hiddenCount} versiones adicionales</p>
          )}
        </div>
      ) : (
        <div className="mt-2.5 rounded-md border border-border/35 bg-background/30 px-2.5 py-2">
          <p className="text-base font-black text-sky-300">N/D</p>
          <p className="text-[11px] text-muted-foreground">Sin datos de versión</p>
        </div>
      )}
    </div>
  );
};

const getKscVersionInventory = (data) => {
  const kasp = data?.Kaspersky || data?.data?.Kaspersky || {};
  const inventory = kasp.HardwareInventory || {};
  const virusDatabaseUsage = kasp.VirusDatabaseUsage || {};
  const versions = virusDatabaseUsage.Versions || inventory.Versions || inventory.SoftwareVersions || inventory.ApplicationVersions || inventory.SecurityVersions || {};
  return {
    kes: normalizeVersionBuckets(
      versions.KESVersions ||
      versions.KasperskyEndpointSecurityVersions ||
      versions.EndpointSecurityVersions ||
      versions.KasperskyEndpointSecurity ||
      inventory.KESVersions ||
      inventory.KasperskyEndpointSecurityVersions ||
      inventory.EndpointSecurityVersions ||
      virusDatabaseUsage.KESVersions
    )
  };
};

const getKscVirusDatabaseUsage = (nodes = {}) => {
  const inventoryDb = nodes.kscHardware?.Kaspersky?.VirusDatabaseUsage || nodes.kscHardware?.data?.Kaspersky?.VirusDatabaseUsage || {};
  const legacyDb = nodes.ksc?.Kaspersky?.BasesDatos || nodes.ksc?.data?.Kaspersky?.BasesDatos || {};
  const inventoryHasData = ['AlDia', 'Ultimas24h', 'Ultimos3Dias', 'Ultimos7Dias', 'MasDeUnaSemana', 'SinDatos', 'TotalDevices']
    .some((key) => toInt(inventoryDb[key]) > 0);
  const inventoryHasReport = inventoryDb.Status && inventoryDb.Status !== 'SIN INFORME';
  return inventoryHasData || inventoryHasReport ? inventoryDb : legacyDb;
};

const getPrimaryLicense = (lic = {}) => {
  const keys = Array.isArray(lic.Licencias) ? lic.Licencias : [];
  const selected = keys.reduce((best, current) => {
    const currentUsed = toInt(current?.DispositivosUsados);
    const bestUsed = toInt(best?.DispositivosUsados);
    return currentUsed > bestUsed ? current : best;
  }, keys[0] || null);

  const used = toInt(selected?.DispositivosUsados);
  const limit = toInt(selected?.LimiteDispositivos);
  const usage = selected?.PorcentajeUso ?? (limit > 0 ? Math.round((used / limit) * 100) : 0);

  return { selected, used, limit, usage };
};

const getPingHealth = (pingStatus, now = Date.now()) => {
  if (!pingStatus) return 'unknown';
  const rawLastSeen = pingStatus.receivedAt || pingStatus.checkedAt || null;
  const lastSeen = typeof rawLastSeen === 'number' ? rawLastSeen : Date.parse(rawLastSeen);
  if (lastSeen && now - lastSeen > 120000) return 'stale';
  return String(pingStatus.status || pingStatus.Status || '').toUpperCase() === 'UP' ? 'up' : 'down';
};

const addSmartRecommendation = (items, priority, tone, title, body) => {
  items.push({ priority, tone, title, body });
};

const hasUpdateSignal = (updates) => {
  if (!updates || typeof updates !== 'object') return false;
  return ['Status', 'PendingCount', 'RebootRequired', 'RebootPending', 'LastInstalled', 'LastKB'].some((key) => updates[key] !== undefined && updates[key] !== null);
};

const getUpdateState = (updates) => {
  if (!hasUpdateSignal(updates)) return null;
  const pendingCount = toInt(updates.PendingCount);
  const rebootRequired = !!(updates.RebootRequired || updates.RebootPending);
  const rawStatus = normalizeText(updates.Status || '');
  const isOk = !rebootRequired && pendingCount === 0 && (!rawStatus || rawStatus === 'OK' || rawStatus.toLowerCase().includes('actualizado'));
  return {
    pendingCount,
    rebootRequired,
    isOk,
    status: rawStatus || (isOk ? 'OK' : 'Pendiente'),
    lastInstalled: normalizeText(updates.LastInstalled || updates.LastKB || '')
  };
};

const getSmartMonitoringRecommendation = ({
  nodes,
  pingData,
  kscServicesOk,
  kscServicesTotal,
  kscHasServiceSignal,
  kscDisk,
  kscKasp,
  zkStatus,
  zkHostStatus,
  zkPrimaryDisk,
  zkRunningServices,
  zkTotalServices,
  zkBioPlatformHealthy,
  zkBioPlatformTotal,
  babyWareOk,
  babyWareStatus,
  zkVmPing,
  zkHostPing,
  babyWarePing,
  updateChecks = []
}) => {
  const now = Date.now();
  const recommendations = [];

  const pingChecks = [
    ['ANFIGANE', pingData['AD-HOST'] || pingData['ANFIGANE']],
    ['ANFI-SEG', pingData['ANFI-SEG']],
    ['AD01', pingData['AD'] || pingData['AD01']],
    ['AD02', pingData['AD-DC02'] || pingData['AD02'] || pingData['DA02']],
    ['AD03', pingData['AD-DC03'] || pingData['AD03'] || pingData['DA03']],
    ['SERV-KSC', pingData['SERV-KSC'] || pingData['KSC'] || pingData['192.168.8.42']],
    ['PROXMOX-ZK', zkHostPing],
    ['SERV-ZK', zkVmPing],
    ['BabyWare TCP/16001', babyWarePing]
  ];

  pingChecks.forEach(([label, ping]) => {
    const health = getPingHealth(ping, now);
    if (health === 'down') {
      addSmartRecommendation(
        recommendations,
        1,
        'critical',
        `${label} sin respuesta`,
        `Validar conectividad, energía y ruta de red. El tablero recibió un estado DOWN para ${label}.`
      );
    } else if (health === 'stale') {
      addSmartRecommendation(
        recommendations,
        4,
        'warning',
        `${label} con latencia de datos`,
        `El heartbeat de ${label} no se ha renovado recientemente. Conviene revisar el socket de monitoreo o la conectividad intermedia.`
      );
    }
  });

  if (kscHasServiceSignal && kscServicesTotal > 0 && kscServicesOk < kscServicesTotal) {
    addSmartRecommendation(
      recommendations,
      2,
      'warning',
      'KSC tiene servicios por revisar',
      `${kscServicesTotal - kscServicesOk} servicio(s) no están reportando OK. Prioriza consola Kaspersky y servicios Windows del servidor.`
    );
  }

  if (zkTotalServices > 0 && zkRunningServices < zkTotalServices) {
    addSmartRecommendation(
      recommendations,
      2,
      'warning',
      'SERV-ZK reporta servicios detenidos',
      `${zkTotalServices - zkRunningServices} servicio(s) críticos no están en ejecución. Revisa ZKBIOOnline y servicios BioPlatform.`
    );
  }

  if (zkBioPlatformTotal > 0 && zkBioPlatformHealthy < zkBioPlatformTotal) {
    addSmartRecommendation(
      recommendations,
      3,
      'warning',
      'BioPlatform requiere revisión',
      `${zkBioPlatformHealthy}/${zkBioPlatformTotal} servicios BioPlatform están saludables. Recomiendo validar los servicios restantes antes de hora pico.`
    );
  }

  if (!babyWareOk && babyWareStatus !== 'N/D') {
    addSmartRecommendation(
      recommendations,
      2,
      'warning',
      'BabyWare no confirma disponibilidad',
      `El puerto TCP/16001 está reportando ${babyWareStatus}. Validar servicio de alarmas y firewall local en SERV-ZK.`
    );
  }

  const diskChecks = [
    ['SERV-KSC', kscDisk],
    ['SERV-ZK', zkPrimaryDisk]
  ];

  diskChecks.forEach(([label, disk]) => {
    const percentFree = Number(disk?.PercentFree);
    if (Number.isFinite(percentFree) && percentFree < 15) {
      addSmartRecommendation(
        recommendations,
        2,
        'critical',
        `${label} con poco espacio en disco`,
        `La unidad C: tiene ${percentFree}% libre. Liberar espacio o ampliar almacenamiento antes de que afecte servicios.`
      );
    } else if (Number.isFinite(percentFree) && percentFree < 25) {
      addSmartRecommendation(
        recommendations,
        5,
        'warning',
        `${label} cerca del umbral de disco`,
        `La unidad C: tiene ${percentFree}% libre. Programar limpieza preventiva para evitar alertas críticas.`
      );
    }
  });

  const bd = getKscVirusDatabaseUsage(nodes);
  const outdatedDb = toInt(bd.MasDeUnaSemana);
  if (outdatedDb > 0) {
    addSmartRecommendation(
      recommendations,
      5,
      'info',
      'Kaspersky mantiene mayoría protegida',
      `${toInt(bd.Vigentes ?? bd.AlDia)} equipos tienen bases vigentes y ${outdatedDb} llevan más de una semana. Conviene revisar esos endpoints puntuales.`
    );
  }

  const am = kscKasp?.Amenazas || {};
  const infected = toInt(am.DispositivosInfect);
  const detected = toInt(am.AmenazasDetectadas);
  if (infected > 0) {
    addSmartRecommendation(
      recommendations,
      1,
      'critical',
      'Kaspersky detecta equipos infectados',
      `${infected} equipo(s) requieren intervención. Revisar cuarentena, eventos recientes y aislamiento si aplica.`
    );
  } else if (detected > 0) {
    addSmartRecommendation(
      recommendations,
      6,
      'success',
      'Kaspersky actuó correctamente',
      `${detected} amenaza(s) fueron detectadas sin equipos infectados activos. Buen momento para revisar trazabilidad y origen.`
    );
  }

  const lic = getPrimaryLicense(kscKasp?.Licencias || {});
  if (lic.limit > 0 && lic.usage >= 90) {
    addSmartRecommendation(
      recommendations,
      4,
      'warning',
      'Licenciamiento KSC cerca del límite',
      `Uso actual: ${lic.used}/${lic.limit} (${lic.usage}%). Considerar depuración de equipos antiguos o ampliación.`
    );
  }

  const inventory = nodes.kscHardware?.Kaspersky?.HardwareInventory || nodes.kscHardware?.data?.Kaspersky?.HardwareInventory;
  if (inventory?.TotalDevices) {
    const seenToday = toInt(inventory.LastSeen?.UltimoDia);
    const seenWeek = toInt(inventory.LastSeen?.UltimaSemana);
    const freshPct = Math.round(((seenToday + seenWeek) / inventory.TotalDevices) * 100);
    if (freshPct < 85) {
      addSmartRecommendation(
        recommendations,
        5,
        'info',
        'Inventario KSC con equipos poco recientes',
        `${freshPct}% del parque fue visto durante la última semana. Revisar endpoints apagados, retirados o fuera de red.`
      );
    }
  }

  if (zkStatus === 'CRITICAL' || zkHostStatus === 'CRITICAL') {
    addSmartRecommendation(
      recommendations,
      1,
      'critical',
      'Entorno ZK en estado crítico',
      'El estado consolidado de ZK requiere revisión prioritaria: validar Proxmox, VM Windows y servicios de control de acceso.'
    );
  }

  const updateStates = updateChecks
    .map(([label, updates]) => [label, getUpdateState(updates)])
    .filter(([, state]) => state);

  updateStates.forEach(([label, state]) => {
    if (state.rebootRequired) {
      addSmartRecommendation(
        recommendations,
        2,
        'warning',
        `${label} requiere reinicio`,
        `Las actualizaciones ya pueden estar instaladas, pero el servidor aun reporta reinicio pendiente. Programar ventana controlada.`
      );
    } else if (state.pendingCount > 0) {
      addSmartRecommendation(
        recommendations,
        4,
        'warning',
        `${label} tiene parches pendientes`,
        `El servidor reporta ${state.pendingCount} actualizacion(es) pendiente(s). Validar Windows Update o la politica de mantenimiento.`
      );
    }
  });

  const updatedServers = updateStates.filter(([, state]) => state.isOk);
  if (updatedServers.length >= 3) {
    addSmartRecommendation(
      recommendations,
      8,
      'success',
      'Actualizaciones bajo control',
      `${updatedServers.length} servidores reportan sistema actualizado. Mantener la ventana de mantenimiento y revisar reinicios pendientes despues de cada ciclo.`
    );
  }

  const healthyPings = pingChecks.filter(([, ping]) => getPingHealth(ping, now) === 'up');
  if (healthyPings.length >= 6) {
    addSmartRecommendation(
      recommendations,
      9,
      'success',
      'Conectividad estable',
      `${healthyPings.length} objetivos responden al heartbeat del VPS. La lectura de LEDs y latencias se mantiene confiable.`
    );
  }

  const healthyDisks = diskChecks.filter(([, disk]) => {
    const percentFree = Number(disk?.PercentFree);
    return Number.isFinite(percentFree) && percentFree >= 25;
  });
  if (healthyDisks.length > 0) {
    addSmartRecommendation(
      recommendations,
      9,
      'info',
      'Capacidad de disco saludable',
      `${healthyDisks.map(([label]) => label).join(' y ')} mantienen espacio disponible por encima del umbral preventivo.`
    );
  }

  const sorted = recommendations.sort((a, b) => a.priority - b.priority);
  if (!sorted.length) {
    return [
      {
        priority: 9,
        tone: 'success',
        title: 'Infraestructura estable',
        body: 'Todos los indicadores principales lucen saludables. Mantén el monitoreo activo y conserva la revisión preventiva programada.',
        actions: ['Verificar backups según agenda', 'Mantener actualizaciones en ventana controlada']
      },
      {
        priority: 9,
        tone: 'info',
        title: 'Monitoreo sin novedades críticas',
        body: 'El tablero no tiene alertas prioritarias en este ciclo. Buen momento para revisar tendencias y validar historiales si hay ventana disponible.',
        actions: ['Revisar Detalles Monitoreo si se requiere auditoría']
      }
    ];
  }

  return sorted.map((item, index) => ({
    ...item,
    actions: item.actions || sorted.filter((_, itemIndex) => itemIndex !== index).slice(0, 2).map((candidate) => candidate.title)
  }));
};

const playSmartNotificationSound = () => {
  try {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextClass) return;
    const audioContext = new AudioContextClass();
    const gain = audioContext.createGain();
    const oscillator = audioContext.createOscillator();
    const overtone = audioContext.createOscillator();
    const secondTone = audioContext.createOscillator();
    const now = audioContext.currentTime;

    const resumePromise = audioContext.resume?.();
    resumePromise?.catch?.(() => {});
    oscillator.type = 'sine';
    overtone.type = 'triangle';
    secondTone.type = 'sine';
    oscillator.frequency.setValueAtTime(720, now);
    overtone.frequency.setValueAtTime(1080, now);
    secondTone.frequency.setValueAtTime(880, now);
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(0.18, now + 0.04);
    gain.gain.exponentialRampToValueAtTime(0.035, now + 0.34);
    gain.gain.exponentialRampToValueAtTime(0.14, now + 0.42);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.82);

    oscillator.connect(gain);
    overtone.connect(gain);
    secondTone.connect(gain);
    gain.connect(audioContext.destination);
    oscillator.start(now);
    overtone.start(now + 0.03);
    secondTone.start(now + 0.34);
    oscillator.stop(now + 0.82);
    overtone.stop(now + 0.58);
    secondTone.stop(now + 0.82);
    setTimeout(() => audioContext.close?.(), 1000);
  } catch {
    // Browsers may block audio until the user interacts with the page.
  }
};

const SmartMonitoringNotification = ({ notification, visible, onClose }) => {
  if (!notification) return null;

  const toneConfig = {
    success: {
      badge: 'border-emerald-400/35 bg-emerald-400/10 text-emerald-300',
      dot: 'bg-emerald-400',
      rail: 'from-emerald-400/80 via-yellow-300/70 to-transparent'
    },
    info: {
      badge: 'border-sky-400/35 bg-sky-400/10 text-sky-300',
      dot: 'bg-sky-400',
      rail: 'from-sky-400/80 via-yellow-300/70 to-transparent'
    },
    warning: {
      badge: 'border-yellow-300/45 bg-yellow-300/10 text-yellow-200',
      dot: 'bg-yellow-300',
      rail: 'from-yellow-300/90 via-amber-400/70 to-transparent'
    },
    critical: {
      badge: 'border-rose-400/45 bg-rose-500/10 text-rose-200',
      dot: 'bg-rose-400',
      rail: 'from-rose-400/90 via-yellow-300/70 to-transparent'
    }
  };
  const currentTone = toneConfig[notification.tone] || toneConfig.info;

  const badgeLabel = {
    success: 'Recomendación',
    info: 'Observación',
    warning: 'Atención',
    critical: 'Prioritario'
  }[notification.tone] || 'Recomendación';

  return (
    <div
      className={`fixed bottom-6 right-6 z-50 w-[min(450px,calc(100vw-2rem))] transition-all duration-700 ease-out ${
        visible ? 'translate-y-0 opacity-100' : 'translate-y-5 opacity-0'
      }`}
    >
      <div className="relative overflow-hidden rounded-xl border border-yellow-300/20 bg-[#07101d]/95 p-4 shadow-2xl shadow-black/40 backdrop-blur-xl">
        <div className={`absolute inset-x-0 top-0 h-0.5 bg-gradient-to-r ${currentTone.rail}`} />
        <div className="flex items-start gap-3.5">
          <div className="relative mt-0.5 shrink-0 rounded-xl border border-slate-700/80 bg-slate-950/70 p-2.5 text-blue-400">
            <SkylabBot size={34} className="text-blue-400" />
            <span className={`absolute -right-1 -top-1 h-2.5 w-2.5 rounded-full border border-[#07101d] ${currentTone.dot}`} />
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
                title="Cerrar notificación"
              >
                <XCircle className="h-4 w-4" />
              </button>
            </div>
            <h3 className="text-[15px] font-black leading-snug text-slate-50">{notification.title}</h3>
            <p className="mt-1.5 text-[12px] leading-5 text-slate-300">{notification.body}</p>
            {notification.actions?.length > 0 && (
              <div className="mt-3 space-y-1.5 border-t border-yellow-300/10 pt-2.5">
                {notification.actions.map((action) => (
                  <p key={action} className="flex items-start gap-2 text-[11px] font-semibold leading-4 text-slate-400">
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

const DCCard = ({ title, role, uptime, servicesOk, servicesTotal, diskSpace, lastBackup, updates, icon, iconClassName = "p-2 bg-[#0078D4]/10 rounded-lg text-[#0078D4]", isPrimary, isHealthy, pingStatus, replication, replicationObjects, fsmoStatus, securityEvents, extraContent, compact = false, onClick }) => {
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
      className={`bg-background/60 border ${!pingStatus ? 'border-border/50' : displayHealthy ? 'border-border' : 'border-rose-500/40'} ${isOffline ? 'bg-rose-500/5' : ''} rounded-xl ${compact ? 'p-3' : 'p-4'} transition-all hover:bg-background/80 flex flex-col ${onClick ? 'cursor-pointer hover:border-primary/50' : ''}`}
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
      <div className={`flex items-center justify-between ${compact ? 'mb-2.5' : 'mb-3'}`}>
        <div className="flex items-center gap-3">
          <div className={iconClassName}>
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

      <div className={`grid ${extraContent ? 'grid-cols-2 lg:grid-cols-4' : 'grid-cols-2'} ${compact ? 'gap-1.5' : 'gap-2.5'} text-xs mb-2.5 flex-1`}>
         <div className="flex flex-col gap-1">
           <span className="text-muted-foreground flex items-center gap-1.5"><Clock className="w-4 h-4" /> Uptime</span>
           <span className="font-medium pl-5">{formatUptime(uptime)}</span>
         </div>
         <div className="flex flex-col gap-1">
           <span className="text-muted-foreground flex items-center gap-1.5"><Activity className="w-4 h-4" /> Servicios</span>
           <span className={`font-bold pl-5 ${isOffline ? 'text-rose-400' : !freshPing ? 'text-amber-400' : servicesOk < servicesTotal ? 'text-rose-400' : 'text-emerald-400'}`}>
             {isOffline ? 'SIN RED' : !freshPing ? 'SIN DATOS' : servicesOk < servicesTotal ? `${servicesTotal - servicesOk} CON FALLA` : "SISTEMA OK"}
           </span>
         </div>
         <div className="flex flex-col gap-1">
           <span className="text-muted-foreground flex items-center gap-1.5"><HardDrive className="w-4 h-4" /> Disco C:</span>
           <span className="font-medium pl-5">
             {diskSpace ? (
               <span className={diskSpace.PercentFree < 15 ? 'text-rose-400' : diskSpace.PercentFree < 25 ? 'text-amber-400' : 'text-emerald-400'}>
                 {diskSpace.FreeGB}GB libres ({diskSpace.PercentFree}%)
               </span>
             ) : 'N/A'}
           </span>
         </div>
         <div className="flex flex-col gap-1">
           <span className="text-muted-foreground flex items-center gap-1.5"><Database className="w-4 h-4" /> Último Backup</span>
           <span className="font-medium pl-5 truncate">{lastBackup}</span>
         </div>
         {replication !== null && (
         <div className="flex flex-col gap-1">
           <span className="text-muted-foreground flex items-center gap-1.5"><RefreshCw className="w-4 h-4" /> Replicación</span>
           <span className={`font-bold pl-5 ${replication === 'OK' ? "text-emerald-400" : replication ? "text-rose-400" : "text-slate-400"}`}>
             {replication || "N/A"}{replicationObjects != null ? ` • ${replicationObjects} obj.` : ""}
           </span>
         </div>
       )}
         {fsmoStatus !== undefined && (
           <div className="flex flex-col gap-1">
             <span className="text-muted-foreground flex items-center gap-1.5"><ShieldCheck className="w-4 h-4" /> FSMO</span>
             <span className={`font-bold pl-5 ${fsmoStatus === 'OK' ? 'text-emerald-400' : 'text-amber-400'}`}>{fsmoStatus || 'N/A'}</span>
           </div>
         )}
         {securityEvents && (
           <div className="flex flex-col gap-1 col-span-2">
             <span className="text-muted-foreground flex items-center gap-1.5"><Lock className="w-4 h-4" /> Seg. 7 días</span>
             <span className="pl-5 flex gap-3">
               <span className="text-rose-400 font-bold">{securityEvents.FailedLogins ?? 0} fallidos</span>
               <span className="text-amber-400">{securityEvents.AccountLockouts ?? 0} bloqueos</span>
             </span>
           </div>
         )}
      </div>

      {extraContent && (
        <div className="mb-3">
          {extraContent}
        </div>
      )}

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

const KscAssetIcon = ({ src, alt, className = "h-7 w-7" }) => (
  <img src={src} alt={alt} className={`${className} object-contain`} />
);

const WindowsMark = ({ variant = "win11", color = "#38bdf8", className = "h-12 w-12" }) => {
  if (variant === "win10") {
    return (
      <svg viewBox="0 0 64 64" className={`${className} drop-shadow-[0_0_10px_rgba(56,189,248,0.35)]`} aria-label="Windows 10">
        <path d="M8 15 L29 11 L29 30 L8 30 Z" fill={color} />
        <path d="M32 10 L58 6 L58 30 L32 30 Z" fill={color} opacity="0.95" />
        <path d="M8 34 L29 34 L29 53 L8 49 Z" fill={color} opacity="0.9" />
        <path d="M32 34 L58 34 L58 58 L32 54 Z" fill={color} opacity="0.98" />
        <path d="M30.5 11 L30.5 54" stroke="rgba(2,6,23,0.8)" strokeWidth="2" />
        <path d="M8 32 L58 32" stroke="rgba(2,6,23,0.8)" strokeWidth="2" />
      </svg>
    );
  }

  return (
    <svg viewBox="0 0 64 64" className={`${className} drop-shadow-[0_0_10px_rgba(59,130,246,0.3)]`} aria-label="Windows 11">
      <rect x="9" y="9" width="21" height="21" rx="2" fill={color} />
      <rect x="34" y="9" width="21" height="21" rx="2" fill={color} />
      <rect x="9" y="34" width="21" height="21" rx="2" fill={color} />
      <rect x="34" y="34" width="21" height="21" rx="2" fill={color} />
    </svg>
  );
};

const InventoryKpi = ({ title, value, badge, badgeColor = "text-muted-foreground", icon, accent, noIconWrapper = false }) => (
  <div className={`relative min-h-[116px] overflow-hidden rounded-xl border border-border bg-card/40 p-4 shadow-sm bg-gradient-to-br ${accent}`}>
    <div className="absolute inset-0 bg-[radial-gradient(circle_at_85%_10%,rgba(255,255,255,0.08),transparent_32%)]" />
    <div className="relative flex items-start justify-between gap-4">
      <div className="min-w-0">
        <p className="text-xs font-bold text-muted-foreground">{title}</p>
        <p className="mt-2 text-3xl font-black leading-none tracking-tight text-foreground">{value}</p>
      </div>
      <div className={noIconWrapper ? "shrink-0" : "shrink-0 rounded-lg bg-background/45 p-2.5 text-primary shadow-sm"}>
        {icon}
      </div>
    </div>
    {badge && <p className={`relative mt-4 text-xs font-black ${badgeColor}`}>{badge}</p>}
  </div>
);

const OsDistributionDonut = ({ segments, total }) => {
  const size = 172;
  const cx = size / 2;
  const cy = size / 2;
  const radius = 61;
  const strokeWidth = 14;
  const circumference = 2 * Math.PI * radius;
  let offset = 0;

  return (
    <div className="flex h-full flex-col gap-3">
      <div className="relative mx-auto h-[172px] w-[172px]">
        <svg viewBox={`0 0 ${size} ${size}`} className="h-full w-full overflow-visible">
          <defs>
            <filter id="kscDonutSoftShadow" x="-30%" y="-30%" width="160%" height="160%">
              <feDropShadow dx="0" dy="8" stdDeviation="8" floodColor="#000000" floodOpacity="0.32" />
            </filter>
          </defs>
          <circle
            cx={cx}
            cy={cy}
            r={radius + 12}
            fill="none"
            stroke="rgba(255,255,255,0.035)"
            strokeWidth="1"
          />
          <circle
            cx={cx}
            cy={cy}
            r={radius}
            fill="none"
            stroke="rgba(255,255,255,0.07)"
            strokeWidth={strokeWidth}
            filter="url(#kscDonutSoftShadow)"
          />
          {segments.map((segment, index) => {
            const pct = total > 0 ? segment.value / total : 0;
            const dash = Math.max(0, pct * circumference - (segments.length > 1 ? 4 : 0));
            const gap = circumference - dash;
            const dashOffset = -offset * circumference;
            offset += pct;

            return (
              <circle
                key={segment.label}
                cx={cx}
                cy={cy}
                r={radius}
                fill="none"
                stroke={segment.color}
                strokeWidth={strokeWidth}
                strokeLinecap="round"
                strokeDasharray={`0 ${circumference}`}
                strokeDashoffset={dashOffset}
                transform={`rotate(-90 ${cx} ${cy})`}
              >
                <animate
                  attributeName="stroke-dasharray"
                  from={`0 ${circumference}`}
                  to={`${dash} ${gap}`}
                  dur="1200ms"
                  begin={`${index * 140}ms`}
                  fill="freeze"
                  calcMode="spline"
                  keySplines="0.22 1 0.36 1"
                />
              </circle>
            );
          })}
          <circle cx={cx} cy={cy} r="43" fill="rgba(2,6,23,0.55)" stroke="rgba(255,255,255,0.07)" />
        </svg>
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <div className="text-center">
            <p className="text-2xl font-black leading-none">{total}</p>
            <p className="mt-1 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">equipos</p>
          </div>
        </div>
      </div>
      <div className="w-full space-y-2.5">
        {segments.map((segment) => {
          const pct = total > 0 ? Math.round((segment.value / total) * 100) : 0;
          return (
            <div key={segment.label} className="flex items-center gap-3">
              <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: segment.color }} />
              <span className="flex-1 text-xs text-muted-foreground">{segment.label}</span>
              <span className="text-sm font-black">{segment.value}</span>
              <span className="w-10 text-right text-xs text-muted-foreground">{pct}%</span>
            </div>
          );
        })}
      </div>
    </div>
  );
};

const KscChartTooltip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null;
  const item = payload[0];
  const title = item?.payload?.label || label || item?.name || item?.payload?.name;
  return (
    <div className="rounded-lg border border-border bg-popover/95 px-3 py-2 text-xs shadow-xl">
      <p className="mb-1 font-bold text-foreground">{title}</p>
      <p className="font-semibold text-emerald-400">{item.value} dispositivos</p>
    </div>
  );
};

const VisibilityBarChart = ({ data, total, vmCount, physicalCount, physicalPct }) => (
  <div className="rounded-xl border border-border bg-card/40 p-4">
    <h4 className="mb-3 flex items-center gap-2 text-base font-bold">
      <Clock className="h-4 w-4 text-primary" />
      Última visibilidad
    </h4>
    <div className="h-[128px]">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} layout="vertical" margin={{ top: 0, right: 8, left: -18, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="rgba(255,255,255,0.055)" />
          <XAxis type="number" hide domain={[0, total || 1]} />
          <YAxis
            type="category"
            dataKey="short"
            width={58}
            tickLine={false}
            axisLine={false}
            tick={{ fontSize: 11, fill: "#94a3b8", fontWeight: 700 }}
          />
          <Tooltip content={<KscChartTooltip />} cursor={{ fill: "rgba(255,255,255,0.035)" }} />
          <Bar dataKey="value" radius={[0, 8, 8, 0]} barSize={12} isAnimationActive animationDuration={1050} animationEasing="ease-out">
            {data.map((entry) => (
              <Cell key={entry.label} fill={entry.color} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
    <div className="mt-2 grid grid-cols-1 gap-y-1.5 border-t border-border/50 pt-3 text-[11px]">
      {data.map((item) => (
        <div key={item.label} className="flex min-w-0 items-center gap-2">
          <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: item.color }} />
          <span className="min-w-0 flex-1 text-muted-foreground">{item.label}</span>
          <span className="shrink-0 font-black">{item.display}</span>
        </div>
      ))}
    </div>
    <div className="mt-3 grid grid-cols-2 gap-3 border-t border-border/50 pt-3 text-xs">
      <div className="rounded-lg border border-emerald-500/20 bg-emerald-500/10 p-2.5">
        <p className="text-muted-foreground">Virtuales</p>
        <p className="mt-1 text-lg font-black text-emerald-400">{vmCount}</p>
      </div>
      <div className="rounded-lg border border-sky-500/20 bg-sky-500/10 p-2.5">
        <p className="text-muted-foreground">Físicos</p>
        <p className="mt-1 text-lg font-black text-sky-400">{physicalCount} <span className="text-xs text-muted-foreground">({physicalPct}%)</span></p>
      </div>
    </div>
  </div>
);

const FocusInventoryChart = ({
  freshnessPoints,
  deviceTypePoints,
  chartMode,
  autoRotate,
  onToggleMode,
  onToggleAutoRotate
}) => {
  const isFreshnessMode = chartMode === 'freshness';
  const freshnessData = freshnessPoints.map((point) => ({ name: point.short, label: point.label, value: point.value }));
  const deviceTypeData = deviceTypePoints.filter((point) => point.value > 0);
  const activeLabel = isFreshnessMode ? 'Dispositivos' : 'Tipos de dispositivo';

  return (
    <div className="flex h-full min-h-[300px] flex-col rounded-xl border border-border bg-card/40 p-4">
      <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <h4 className="flex items-center gap-2 text-base font-bold">
          <Activity className="h-4 w-4 text-primary" />
          {isFreshnessMode ? 'Curva de frescura' : 'Tipos de dispositivos'}
        </h4>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={onToggleMode}
            className="rounded-lg border border-border bg-background/70 px-3 py-1.5 text-[10px] font-black uppercase tracking-wide text-muted-foreground transition-colors hover:border-primary/50 hover:text-primary"
            title="Cambiar grafico"
          >
            {isFreshnessMode ? 'Ver tipos' : 'Ver frescura'}
          </button>
          <button
            type="button"
            onClick={onToggleAutoRotate}
            className={`flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-[10px] font-black uppercase tracking-wide transition-colors ${
              autoRotate
                ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-400'
                : 'border-border bg-background/70 text-muted-foreground hover:border-primary/50 hover:text-primary'
            }`}
            title="Rotar cada 10 minutos"
          >
            <RefreshCw className={`h-3 w-3 ${autoRotate ? 'animate-spin-slow' : ''}`} />
            Auto 10m
          </button>
          <span className="hidden items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-muted-foreground md:flex">
            <span className="h-2 w-2 rounded-full bg-emerald-500" /> {activeLabel}
          </span>
        </div>
      </div>
      <div className="min-h-[230px] flex-1">
        <ResponsiveContainer width="100%" height="100%">
          {isFreshnessMode ? (
            <AreaChart key="freshness-chart" data={freshnessData} margin={{ top: 6, right: 10, left: -24, bottom: 0 }}>
              <defs>
                <linearGradient id="kscFreshnessGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#22c55e" stopOpacity={0.35} />
                  <stop offset="95%" stopColor="#22c55e" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.055)" />
              <XAxis dataKey="name" tick={{ fontSize: 11, fill: "#94a3b8" }} tickLine={false} axisLine={false} />
              <YAxis tick={{ fontSize: 11, fill: "#94a3b8" }} tickLine={false} axisLine={false} allowDecimals={false} />
              <Tooltip content={<KscChartTooltip />} cursor={{ stroke: "rgba(34,197,94,0.25)", strokeWidth: 1 }} />
              <Area
                type="monotone"
                dataKey="value"
                stroke="#22c55e"
                strokeWidth={2.4}
                fill="url(#kscFreshnessGradient)"
                dot={{ r: 3, fill: "#22c55e", strokeWidth: 0 }}
                activeDot={{ r: 5, fill: "#22c55e", stroke: "#052e1a", strokeWidth: 2 }}
                isAnimationActive
                animationDuration={1200}
                animationEasing="ease-out"
              />
            </AreaChart>
          ) : (
            <BarChart key="device-types-chart" data={deviceTypeData} margin={{ top: 8, right: 10, left: -24, bottom: 0 }}>
              <defs>
                <linearGradient id="kscDeviceTypeBar" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#38bdf8" stopOpacity={0.95} />
                  <stop offset="100%" stopColor="#22c55e" stopOpacity={0.65} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(255,255,255,0.055)" />
              <XAxis dataKey="short" tick={{ fontSize: 11, fill: "#94a3b8" }} tickLine={false} axisLine={false} />
              <YAxis tick={{ fontSize: 11, fill: "#94a3b8" }} tickLine={false} axisLine={false} allowDecimals={false} />
              <Tooltip content={<KscChartTooltip />} cursor={{ fill: "rgba(255,255,255,0.035)" }} />
              <Bar dataKey="value" radius={[8, 8, 2, 2]} barSize={42} isAnimationActive animationDuration={1200} animationEasing="ease-out">
                {deviceTypeData.map((entry) => (
                  <Cell key={entry.label} fill={entry.color || "url(#kscDeviceTypeBar)"} />
                ))}
              </Bar>
            </BarChart>
          )}
        </ResponsiveContainer>
      </div>
    </div>
  );
};

const KscHardwareInventoryPanel = ({
  data,
  focusChartMode,
  isFocusChartAutoRotating,
  onToggleFocusChartMode,
  onToggleFocusChartAutoRotate
}) => {
  const inventory = data?.Kaspersky?.HardwareInventory || data?.data?.Kaspersky?.HardwareInventory;
  const os = inventory?.OperatingSystems || {};
  const visibility = inventory?.LastSeen || {};
  const virtualization = inventory?.Virtualization || {};
  const total = inventory?.TotalDevices || 0;
  const windowsServer = os.WindowsServer || 0;
  const windows10 = os.Windows10 || 0;
  const windows11 = os.Windows11 || 0;
  const otherOs = Math.max(0, total - windowsServer - windows10 - windows11);
  const vmCount = virtualization.VirtualMachines || 0;
  const physicalCount = virtualization.PhysicalDevices || 0;
  const vmPct = total > 0 ? Math.round((vmCount / total) * 100) : 0;
  const physicalPct = total > 0 ? Math.max(0, 100 - vmPct) : 0;
  const seenToday = visibility.UltimoDia || 0;
  const seenWeek = visibility.UltimaSemana || 0;
  const seenOld = visibility.MasDeUnaSemana || 0;
  const seenMonth = visibility.MasDeUnMes || 0;
  const freshPct = total > 0 ? Math.round(((seenToday + seenWeek) / total) * 100) : 0;
  const osSegments = [
    { label: "Windows 10", value: windows10, color: "#22c55e" },
    { label: "Windows 11", value: windows11, color: "#38bdf8" },
    { label: "Windows Server", value: windowsServer, color: "#a78bfa" },
    { label: "Otros", value: otherOs, color: "#f59e0b" }
  ].filter((segment) => segment.value > 0);
  const freshnessPoints = [
    { label: "Último día", short: "Día", value: seenToday, color: "#22c55e" },
    { label: "Semana", short: "Sem", value: seenWeek, color: "#38bdf8" },
    { label: "> Semana", short: "+Sem", value: seenOld, color: "#f59e0b" },
    { label: "> Mes", short: "+Mes", value: seenMonth, color: "#f43f5e" }
  ];
  const deviceTypePoints = [
    { label: "Windows 10", short: "Win 10", value: windows10, color: "#22c55e" },
    { label: "Windows 11", short: "Win 11", value: windows11, color: "#38bdf8" },
    { label: "Windows Server", short: "Server", value: windowsServer, color: "#a78bfa" },
    { label: "Virtuales", short: "VM", value: vmCount, color: "#f59e0b" },
    { label: "Físicos", short: "Físicos", value: physicalCount, color: "#06b6d4" },
    { label: "Otros sistemas", short: "Otros", value: otherOs, color: "#64748b" }
  ];
  const visibilityChartData = [
    { label: "Último día", short: "Día", value: seenToday, color: "#22c55e" },
    { label: "Última semana", short: "Semana", value: seenWeek, color: "#38bdf8" },
    { label: "Más de una semana", short: "+Semana", value: seenOld, color: "#f59e0b" },
    { label: "Más de un mes", short: "+Mes", value: seenMonth, color: "#f43f5e" }
  ].map((item) => ({
    ...item,
    display: `${item.value}  ${total > 0 ? Math.round((item.value / total) * 100) : 0}%`
  }));

  if (!inventory) {
    return (
      <div className="rounded-xl border border-dashed border-border/60 bg-card/30 p-5">
        <div className="flex items-center gap-3">
          <KasperskyIcon className="w-10 h-10" />
          <div>
            <h3 className="text-base font-bold">Inventario KSC</h3>
            <p className="text-xs text-muted-foreground">Esperando datos de `Monitor-KSC-HardwareInventory.ps1`.</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <section className="space-y-4 rounded-xl border border-border bg-card/30 p-4">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex items-center gap-3">
          <KasperskyIcon className="w-11 h-11" />
          <div>
            <h3 className="text-xl font-black tracking-tight">Inventario KSC</h3>
            <p className="text-xs text-muted-foreground">Sistemas operativos, virtualización y frescura de visibilidad.</p>
          </div>
        </div>
        <div className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
          Fuente: {inventory.SourceFile || 'Informe de hardware'} • {inventory.ParsedAt || data?.ReportDate || 'N/D'}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-3 2xl:grid-cols-5">
        <InventoryKpi
          title="Dispositivos"
          value={total}
          badge={`${freshPct}% vistos en semana`}
          badgeColor="text-emerald-400"
          icon={<MonitorSmartphone className="h-14 w-14 text-sky-300 drop-shadow-[0_0_14px_rgba(56,189,248,0.45)]" />}
          accent="from-blue-500/20 to-blue-600/5"
          noIconWrapper
        />
        <InventoryKpi
          title="Windows Server"
          value={windowsServer}
          badge="Servidores inventariados"
          badgeColor="text-violet-300"
          icon={<KscAssetIcon src="/ksc_server.png" alt="Windows Server" className="h-14 w-14" />}
          accent="from-violet-500/20 to-violet-600/5"
          noIconWrapper
        />
        <InventoryKpi
          title="Windows 10"
          value={windows10}
          badge={`${total > 0 ? Math.round((windows10 / total) * 100) : 0}% del parque`}
          badgeColor="text-emerald-400"
          icon={<WindowsMark variant="win10" color="#38bdf8" className="h-14 w-14" />}
          accent="from-emerald-500/20 to-emerald-600/5"
          noIconWrapper
        />
        <InventoryKpi
          title="Windows 11"
          value={windows11}
          badge={`${total > 0 ? Math.round((windows11 / total) * 100) : 0}% del parque`}
          badgeColor="text-sky-400"
          icon={<WindowsMark variant="win11" color="#3b82f6" className="h-14 w-14" />}
          accent="from-sky-500/20 to-sky-600/5"
          noIconWrapper
        />
        <InventoryKpi
          title="Máquinas virtuales"
          value={vmCount}
          badge={`${physicalCount} físicos · ${vmPct}% VM`}
          badgeColor="text-amber-300"
          icon={<Server className="h-8 w-8 text-amber-300" />}
          accent="from-amber-500/20 to-amber-600/5"
        />
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[0.78fr_1.54fr_0.78fr]">
        <div className="rounded-xl border border-border bg-card/40 p-4">
          <div className="mb-4 flex items-center justify-between gap-3">
            <h4 className="flex items-center gap-2 text-base font-bold">
              <Activity className="h-4 w-4 text-primary" />
              Distribución
            </h4>
            <span className="rounded-full border border-emerald-500/20 bg-emerald-500/10 px-2.5 py-1 text-[10px] font-black uppercase tracking-wide text-emerald-400">
              {total} activos
            </span>
          </div>
          <OsDistributionDonut segments={osSegments} total={total} />
        </div>

        <FocusInventoryChart
          freshnessPoints={freshnessPoints}
          deviceTypePoints={deviceTypePoints}
          chartMode={focusChartMode}
          autoRotate={isFocusChartAutoRotating}
          onToggleMode={onToggleFocusChartMode}
          onToggleAutoRotate={onToggleFocusChartAutoRotate}
        />

        <VisibilityBarChart
          data={visibilityChartData}
          total={total}
          vmCount={vmCount}
          physicalCount={physicalCount}
          physicalPct={physicalPct}
        />
      </div>
    </section>
  );
};

export default function Monitoring({ setPageHeader: injectedSetPageHeader }) {
  const contextSetPageHeader = useContext(PageHeaderContext);
  const setPageHeader = injectedSetPageHeader || contextSetPageHeader;
  const [adData, setAdData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [lastUpdate, setLastUpdate] = useState(null);
  const [nodes, setNodes] = useState({
    host1: null,
    host2: null,
    dc01: null,
    dc02: null,
    dc03: null,
    ksc: null,
    zk: null,
    kscHardware: null
  });
  const [pingData, setPingData] = useState({});
  const [pingTick, setPingTick] = useState(Date.now());
  const [isADModalOpen, setIsADModalOpen] = useState(false);
  const [isKSCModalOpen, setIsKSCModalOpen] = useState(false);
  const [isZKModalOpen, setIsZKModalOpen] = useState(false);
  const [animationCycle, setAnimationCycle] = useState(0);
  const [isLayoutEditing, setIsLayoutEditing] = useState(false);
  const [draggedPanelId, setDraggedPanelId] = useState(null);
  const [dashboardLayout, setDashboardLayout] = useState(loadMonitoringLayout);
  const [focusInventoryChartMode, setFocusInventoryChartMode] = useState('freshness');
  const [isFocusInventoryChartAutoRotating, setIsFocusInventoryChartAutoRotating] = useState(true);
  const [smartNotification, setSmartNotification] = useState(null);
  const [isSmartNotificationVisible, setIsSmartNotificationVisible] = useState(false);
  const latestSmartRecommendationRef = useRef(null);

  const resetDashboardLayout = () => {
    setDashboardLayout(DEFAULT_MONITORING_LAYOUT);
  };

  const toggleFocusInventoryChartMode = () => {
    setFocusInventoryChartMode((currentMode) => getNextFocusInventoryChartMode(currentMode));
  };

  const updatePanelSize = (panelId, size) => {
    setDashboardLayout((current) => current.map((panel) => (
      panel.id === panelId ? { ...panel, size } : panel
    )));
  };

  const handlePanelDragStart = (event, panelId) => {
    setDraggedPanelId(panelId);
    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.setData('text/plain', panelId);
  };

  const handlePanelDrop = (event, targetPanelId) => {
    event.preventDefault();
    const sourcePanelId = draggedPanelId || event.dataTransfer.getData('text/plain');
    setDraggedPanelId(null);
    if (!sourcePanelId || sourcePanelId === targetPanelId) return;

    setDashboardLayout((current) => {
      const next = [...current];
      const from = next.findIndex((panel) => panel.id === sourcePanelId);
      const to = next.findIndex((panel) => panel.id === targetPanelId);
      if (from === -1 || to === -1) return current;
      const [moved] = next.splice(from, 1);
      next.splice(to, 0, moved);
      return next;
    });
  };

  const fetchData = async () => {
    // No ponemos loading=true aquí para evitar parpadeos en el autorefresh
    try {
      const [host1, host2, dc01, dc02, dc03, ksc, zk, kscHardware] = await Promise.all([
        monitoringService.getLatestStatus('ANFIGANE'),  // ANFIGANE (Antes AD-HOST)
        monitoringService.getLatestStatus('ANFI-SEG'),  // Host 2
        monitoringService.getLatestStatus('AD'),        // AD01
        monitoringService.getLatestStatus('AD-DC02'),   // AD02
        monitoringService.getLatestStatus('AD-DC03'),   // AD03
        monitoringService.getLatestStatus('KSC'),       // Kaspersky
        monitoringService.getLatestStatus('SERV-ZK'),   // ZKBio / Control de Acceso
        monitoringService.getLatestStatus('KSC-HARDWARE')
      ]);
      
      setNodes({ host1, host2, dc01, dc02, dc03, ksc, zk, kscHardware });
      setAdData(dc01);
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

  useEffect(() => {
    const animationInterval = setInterval(() => {
      setAnimationCycle((cycle) => cycle + 1);
    }, 300000);

    return () => clearInterval(animationInterval);
  }, []);

  useEffect(() => {
    if (!isFocusInventoryChartAutoRotating) return undefined;
    const chartInterval = setInterval(() => {
      setFocusInventoryChartMode((currentMode) => getNextFocusInventoryChartMode(currentMode));
    }, 600000);

    return () => clearInterval(chartInterval);
  }, [isFocusInventoryChartAutoRotating]);

  useEffect(() => {
    let hideTimer;
    let clearTimer;

    const showNotification = () => {
      const recommendationPool = latestSmartRecommendationRef.current;
      const candidates = Array.isArray(recommendationPool) ? recommendationPool : [recommendationPool].filter(Boolean);
      if (!candidates.length) return;
      const urgentCandidates = candidates.filter((item) => item.priority <= 2);
      const visiblePool = urgentCandidates.length > 0 ? urgentCandidates : candidates;
      const recommendation = visiblePool[Math.floor(Math.random() * visiblePool.length)];

      setSmartNotification({ ...recommendation, id: Date.now() });
      setIsSmartNotificationVisible(true);
      playSmartNotificationSound();

      clearTimeout(hideTimer);
      clearTimeout(clearTimer);
      hideTimer = setTimeout(() => {
        setIsSmartNotificationVisible(false);
      }, 30000);
      clearTimer = setTimeout(() => {
        setSmartNotification(null);
      }, 30700);
    };

    const initialTimer = setTimeout(showNotification, 8000);
    const notificationInterval = setInterval(showNotification, 300000);

    return () => {
      clearTimeout(initialTimer);
      clearInterval(notificationInterval);
      clearTimeout(hideTimer);
      clearTimeout(clearTimer);
    };
  }, []);

  useEffect(() => {
    localStorage.setItem(MONITORING_LAYOUT_STORAGE_KEY, JSON.stringify(dashboardLayout));
  }, [dashboardLayout]);

  useEffect(() => {
    if (!setPageHeader) return undefined;
    setPageHeader(
      <div className="flex min-w-0 items-center justify-between gap-4">
        <div className="min-w-0">
          <h1 className="truncate text-xl font-bold tracking-tight text-foreground">Monitoreo de Infraestructura</h1>
          <p className="truncate text-xs text-muted-foreground">Estado de salud de servidores locales y cumplimiento ISO 27001</p>
        </div>
        <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">
          {isLayoutEditing && (
            <button
              onClick={resetDashboardLayout}
              className="flex items-center gap-2 rounded-lg border border-border bg-card px-3 py-2 text-xs font-medium transition-colors hover:bg-muted"
            >
              <RotateCcw className="h-4 w-4" />
              Restablecer
            </button>
          )}
          <button
            onClick={() => setIsLayoutEditing((value) => !value)}
            className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-xs font-medium transition-colors ${isLayoutEditing ? 'border-primary bg-primary text-primary-foreground' : 'border-border bg-card hover:bg-muted'}`}
          >
            <Move className="h-4 w-4" />
            {isLayoutEditing ? 'Guardar diseño' : 'Editar diseño'}
          </button>
          <button
            onClick={fetchData}
            disabled={loading}
            className="flex items-center gap-2 rounded-lg border border-border bg-card px-3 py-2 text-xs font-medium transition-colors hover:bg-muted disabled:opacity-60"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            {loading ? 'Actualizando...' : 'Actualizar ahora'}
          </button>
        </div>
      </div>
    );
    return () => setPageHeader(null);
  }, [setPageHeader, loading, isLayoutEditing, dashboardLayout]);

  // Precompute KSC-friendly fallbacks to normalize different report shapes
  const rawK = nodes.ksc || {};
  // Monitor-SERV-KSC.ps1 stores payload as: { Node, Role, ReportDate, LocalHealth, Kaspersky }
  const kscLocal = rawK.LocalHealth || rawK.data?.LocalHealth || {};
  const kscKasp  = rawK.Kaspersky || rawK.data?.Kaspersky || {};
  const kscUpdates = kscLocal?.Updates || rawK.Updates || rawK.data?.Updates || null;

  const kscServicesArray = kscLocal?.Services || kscKasp?.Services || rawK.Services || [];
  const kscHasServiceSignal = Array.isArray(kscServicesArray) && kscServicesArray.length > 0;

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
  const babyWare = rawZ.BabyWare || rawZ.data?.BabyWare || {};
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
  const babyWareReportPing = babyWare.TcpOk != null ? {
    Status: babyWare.TcpOk ? 'UP' : 'DOWN',
    LatencyMs: babyWare.LatencyMs,
    Pingable: babyWare.TcpOk
  } : null;
  const babyWarePing = pingData['BABYWARE'] || pingData['BABYWARE-16001'] || pingData['SERV-ZK:16001'] || pingData['192.168.8.112:16001'] || toPingStatus(babyWareReportPing, '192.168.8.112');
  const babyWarePort = babyWare.Port || babyWare.port || babyWarePing?.port || 16001;
  const babyWareStatus = babyWarePing?.status === 'UP'
    ? 'Activo'
    : babyWare.Status || (babyWare.TcpOk ? 'Activo' : babyWarePing?.status === 'DOWN' ? 'Sin conexion' : 'N/D');
  const babyWareOk = babyWarePing?.status === 'UP' || babyWare.TcpOk === true || babyWare.Status === 'OK';
  const babyWareProcess = babyWare.ProcessName || (babyWare.ProcessFound ? 'BabyWare' : 'N/D');
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
  const zkBioPlatformHealthy = zkServices.BioPlatformHealthy ?? zkServices.PlatformServicesOk ?? 0;
  const zkBioPlatformTotal = zkServices.BioPlatformTotal ?? zkServices.BioPlatformServices?.length ?? 0;
  const zkHostStatus = (zkHost.Status || 'SIN DATOS').toUpperCase();
  const zkHostStatusColor = zkHostStatus === 'CRITICAL' || zkHostStatus === 'ERROR'
    ? 'text-rose-400'
    : zkHostStatus === 'WARNING'
      ? 'text-amber-400'
      : zkHost.Status
        ? 'text-emerald-400'
        : 'text-slate-400';
  const hasMonitoringSnapshot = Object.values(nodes).some(Boolean) || Object.keys(pingData).length > 0;
  const smartRecommendation = hasMonitoringSnapshot ? getSmartMonitoringRecommendation({
    nodes,
    pingData,
    kscServicesOk,
    kscServicesTotal,
    kscHasServiceSignal,
    kscDisk,
    kscKasp,
    zkStatus,
    zkHostStatus,
    zkPrimaryDisk,
    zkRunningServices,
    zkTotalServices,
    zkBioPlatformHealthy,
    zkBioPlatformTotal,
    babyWareOk,
    babyWareStatus,
    zkVmPing,
    zkHostPing,
    babyWarePing,
    updateChecks: [
      ['ANFIGANE', nodes.host1?.Updates],
      ['AD01', nodes.dc01?.Updates],
      ['AD02', nodes.dc02?.LocalHealth?.Updates || nodes.dc02?.data?.LocalHealth?.Updates],
      ['ANFI-SEG', nodes.host2?.data?.Updates || nodes.host2?.Updates],
      ['AD03', nodes.dc03?.LocalHealth?.Updates || nodes.dc03?.data?.LocalHealth?.Updates],
      ['SERV-KSC', kscUpdates],
      ['SERV-ZK', zkUpdates]
    ]
  }) : null;
  latestSmartRecommendationRef.current = smartRecommendation;

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-12 animate-in fade-in slide-in-from-bottom-4 duration-700">
      {isLayoutEditing && (
        <div className="col-span-1 lg:col-span-12 rounded-xl border border-primary/30 bg-primary/10 px-4 py-3 text-xs font-medium text-primary">
          Arrastra los paneles para cambiar el orden. Usa 1/3, 1/2, 2/3 o Full para ajustar el ancho. Los cambios se guardan automáticamente en este navegador.
        </div>
      )}
      <div className="contents">

        <EditableDashboardPanel
          id="anfigane"
          title="ANFIGANE"
          layout={dashboardLayout}
          editMode={isLayoutEditing}
          onSizeChange={updatePanelSize}
          onDragStart={handlePanelDragStart}
          onDragOver={(event) => event.preventDefault()}
          onDrop={handlePanelDrop}
        >
        <div className={`bg-card/40 backdrop-blur-sm border rounded-xl p-4 ${pingData['AD-HOST']?.status === 'DOWN' ? 'border-rose-500/40' : 'border-border'}`}>
          <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_auto] items-start gap-3 mb-3">
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
                  <p className="text-[10px] text-muted-foreground uppercase tracking-wider font-medium">ProLiant / Hyper-V</p>
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
              <div className="flex flex-wrap items-center justify-start lg:justify-end gap-1.5 text-xs lg:max-w-[360px]">
                <div className="flex items-center gap-1.5 px-3 py-1.5 bg-background rounded-md border border-border">
                  <Cpu className="w-4 h-4 text-primary" />
                  <span className="text-muted-foreground">RAM:</span>
                  <span className="font-mono">{nodes.host1.RAM?.FreeGB}GB / {nodes.host1.RAM?.TotalGB}GB</span>
                </div>
                <div className="flex items-center gap-1.5 px-3 py-1.5 bg-background rounded-md border border-border">
                  <Activity className="w-4 h-4 text-emerald-400" />
                  <span className="font-bold text-emerald-400">{nodes.host1.VMs?.filter(v => v.State === 2 || v.State === 'Running').length}/{nodes.host1.VMs?.length} VMs</span>
                </div>
                <UpdateBadge updates={nodes.host1.Updates} />
              </div>
            )}
          </div>

          <div className="border-t border-border/30 pt-3">
            <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-2.5 flex items-center gap-1.5">
              <Database className="w-4 h-4" /> Máquinas Virtuales
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
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
                  />
              ) : (
                <div className="bg-background/40 border border-border/50 rounded-lg p-4 animate-pulse h-[200px]"></div>
              )}

              {/* AD03 intentionally omitted from ANFIGANE — belongs under ANFI-SEG */}
            </div>
          </div>
        </div>
        </EditableDashboardPanel>

        <EditableDashboardPanel
          id="anfi-seg"
          title="ANFI-SEG13798"
          layout={dashboardLayout}
          editMode={isLayoutEditing}
          onSizeChange={updatePanelSize}
          onDragStart={handlePanelDragStart}
          onDragOver={(event) => event.preventDefault()}
          onDrop={handlePanelDrop}
        >
        <div className={`bg-card/40 backdrop-blur-sm border rounded-xl p-4 ${pingData['ANFI-SEG']?.status === 'DOWN' ? 'border-rose-500/40' : 'border-border'}`}>
          <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_auto] items-start gap-3 mb-3">
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
                  <p className="text-[10px] text-muted-foreground uppercase tracking-wider font-medium">HP ProLiant DL160 Gen9 / Hyper-V</p>
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
              <div className="flex flex-wrap items-center justify-start lg:justify-end gap-1.5 text-xs lg:max-w-[360px]">
                <div className="flex items-center gap-1.5 px-3 py-1.5 bg-background rounded-md border border-border">
                  <Cpu className="w-4 h-4 text-primary" />
                  <span className="font-mono">
                    {(nodes.host2.data?.System?.RAM_Free_GB || nodes.host2.RAM?.FreeGB || 0)}GB / {(nodes.host2.data?.System?.RAM_Total_GB || nodes.host2.RAM?.TotalGB || 0)}GB
                  </span>
                </div>
                <div className="flex items-center gap-1.5 px-3 py-1.5 bg-background rounded-md border border-border">
                  <Activity className="w-4 h-4 text-emerald-400" />
                  <span className="font-bold text-emerald-400">
                    {(nodes.host2.data?.VMs || nodes.host2.VMs)?.filter(v => v.State === 2 || v.State === 'Running' || v.State === 'Operating').length || 0}/{(nodes.host2.data?.VMs || nodes.host2.VMs)?.length || 0} VMs
                  </span>
                </div>
                <UpdateBadge updates={nodes.host2.data?.Updates || nodes.host2.Updates} />
              </div>
            )}
          </div>

          <div className="border-t border-border/30 pt-3">
            <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-2.5 flex items-center gap-1.5">
              <Database className="w-4 h-4" /> Máquinas Virtuales
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">

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
                  updates={kscUpdates}
                  isHealthy={!!nodes.ksc}
                  pingStatus={pingData['192.168.8.42'] || pingData['SERV-KSC'] || pingData['KSC'] || pingData['ksc']}
                  icon={<KasperskyIcon className="w-8 h-8" />}
                  iconClassName="p-0 rounded-lg"
                  onClick={() => setIsKSCModalOpen(true)}
                />
              ) : (
                <div className="bg-background/30 border border-dashed border-border/40 rounded-xl p-5 flex flex-col items-center justify-center gap-3 opacity-50 hover:opacity-80 transition-opacity min-h-[180px]">
                  <div className="p-2 bg-slate-500/10 rounded-lg text-slate-400">
                    <KasperskyIcon className="w-8 h-8" />
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
        </EditableDashboardPanel>

      </div>

      {/* LAYOUT MONITOREO DE SERVIDORES KSC + ZK */}
      <div className="contents">
        
        {/* Columna 1: Detalle de Kaspersky (Resumido) */}
        {nodes.ksc && (nodes.ksc.Kaspersky || nodes.ksc.data?.Kaspersky) && (
          <EditableDashboardPanel
            id="ksc-summary"
            title="Kaspersky Security Center"
            layout={dashboardLayout}
            editMode={isLayoutEditing}
            onSizeChange={updatePanelSize}
            onDragStart={handlePanelDragStart}
            onDragOver={(event) => event.preventDefault()}
            onDrop={handlePanelDrop}
          >
          <div 
            className="bg-card/40 backdrop-blur-sm border border-border rounded-xl p-4 flex flex-col justify-between transition-all duration-300 group"
          >
            <div>
              <div className="flex justify-between items-start border-b border-border/50 pb-3 mb-3">
                <div className="flex items-center gap-3">
                  <div className="p-0 rounded-lg group-hover:scale-105 transition-transform">
                    <KasperskyIcon className="w-10 h-10" />
                  </div>
                  <div>
                    <h3 className="text-base font-bold flex items-center gap-2 text-foreground group-hover:text-primary transition-colors">
                      Kaspersky Security Center
                    </h3>
                    <p className="text-xs text-muted-foreground">SERV-KSC • Resumen de Protección</p>
                  </div>
                </div>
                <span className="text-[10px] text-primary flex items-center gap-1 bg-primary/10 px-2 py-1 rounded font-semibold">
                  Resumen
                </span>
              </div>

              {/* Data Summary Grid */}
              <div className="grid grid-cols-2 gap-3 mt-2">
                {/* Antivirus DB status */}
                {(() => {
                  const bd = getKscVirusDatabaseUsage(nodes);
                  const alDia = toInt(bd.Vigentes ?? bd.AlDia);
                  const masDeUnaSemana = toInt(bd.MasDeUnaSemana);
                  const state = masDeUnaSemana > 0 ? 'MAYORÍA AL DÍA' : 'AL DÍA';
                  return (
                    <div className="bg-background/30 border border-border/40 rounded-lg p-4">
                      <p className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider flex items-center gap-2"><Database className="w-6 h-6 text-sky-300" /> Bases de Datos AV</p>
                      <p className="text-xl font-bold mt-1 text-emerald-400">{state}</p>
                      <div className="flex justify-between gap-3 text-[13px] mt-1.5 text-muted-foreground">
                        <span>Al día: <strong className="text-base text-emerald-400">{alDia}</strong></span>
                        <span>&gt;1 sem: <strong className="text-base text-amber-400">{masDeUnaSemana}</strong></span>
                      </div>
                    </div>
                  );
                })()}

                {/* Amenazas status */}
                {(() => {
                  const am = nodes.ksc.Kaspersky?.Amenazas || nodes.ksc.data?.Kaspersky?.Amenazas || {};
                  const infected = toInt(am.DispositivosInfect);
                  const detected = toInt(am.AmenazasDetectadas);
                  const state = infected > 0 ? 'REVISAR' : detected > 0 ? 'CONTENIDO' : 'LIMPIO';
                  const threatDevices = Array.isArray(am.DispositivosDetalle)
                    ? am.DispositivosDetalle
                    : Array.isArray(am.Detalles)
                      ? am.Detalles
                      : [];
                  return (
                    <div className="bg-background/30 border border-border/40 rounded-lg p-4">
                      <p className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider flex items-center gap-2"><Bug className="w-6 h-6 text-rose-400" /> Amenazas</p>
                      <p className={`text-xl font-bold mt-1 ${infected > 0 ? 'text-amber-400' : 'text-emerald-400'}`}>
                        {state}
                      </p>
                      <div className="flex justify-between gap-3 text-[13px] mt-1.5 text-muted-foreground">
                        <span>Infectados: <strong className={`text-base ${infected > 0 ? 'text-rose-400' : 'text-emerald-400'}`}>{infected}</strong></span>
                        <span>Detectados: <strong className="text-base text-rose-400">{detected}</strong></span>
                      </div>
                      <div className="mt-2 border-t border-border/30 pt-2">
                        {threatDevices.length > 0 ? (
                          <div className="space-y-1">
                            {threatDevices.slice(0, 2).map((item, index) => (
                              <div key={`${item.Dispositivo || item.Device || item.Name || index}`} className="flex min-w-0 items-center justify-between gap-2 text-[11px]">
                                <span className="min-w-0 truncate font-bold text-slate-200">{item.Dispositivo || item.Device || item.Name || 'Equipo sin nombre'}</span>
                                <span className="shrink-0 truncate text-amber-300 max-w-[46%]">{item.Grupo || item.Group || 'Sin grupo'}</span>
                              </div>
                            ))}
                            {threatDevices.length > 2 && (
                              <p className="text-[10px] font-bold text-rose-300">+{threatDevices.length - 2} equipos adicionales</p>
                            )}
                          </div>
                        ) : (
                          <p className="text-[11px] font-semibold text-emerald-400">Sin equipos comprometidos activos</p>
                        )}
                      </div>
                    </div>
                  );
                })()}

                {/* Vulnerabilidades */}
                {(() => {
                  const vul = nodes.ksc.Kaspersky?.Vulnerabilidades || nodes.ksc.data?.Kaspersky?.Vulnerabilidades || {};
                  const sinVuln = toInt(vul.DispSinVulnerabilidad);
                  const criticas = toInt(vul.DispCritica);
                  const altas = toInt(vul.DispAlta);
                  return (
                    <div className="bg-background/30 border border-border/40 rounded-lg p-4">
                      <p className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider flex items-center gap-2"><ShieldAlert className="w-6 h-6 text-amber-400" /> Vulnerabilidades</p>
                      <p className="text-xl font-bold mt-1 text-emerald-400">{sinVuln} sin vuln.</p>
                      <div className="flex justify-between gap-3 text-[13px] mt-1.5 text-muted-foreground">
                        <span>Críticas: <strong className={`text-base ${criticas > 0 ? 'text-rose-400' : 'text-emerald-400'}`}>{criticas}</strong></span>
                        <span>Altas: <strong className={`text-base ${altas > 0 ? 'text-amber-400' : 'text-emerald-400'}`}>{altas}</strong></span>
                      </div>
                    </div>
                  );
                })()}

                {/* Licencias */}
                {(() => {
                  const lic = nodes.ksc.Kaspersky?.Licencias || nodes.ksc.data?.Kaspersky?.Licencias || {};
                  const activeLic = getPrimaryLicense(lic);
                  const stateColor = activeLic.usage > 90 ? 'text-amber-400' : 'text-emerald-400';
                  return (
                    <div className="bg-background/30 border border-border/40 rounded-lg p-4">
                      <p className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider flex items-center gap-2"><KeyRound className="w-6 h-6 text-violet-300" /> Licenciamiento</p>
                      <p className={`text-xl font-bold mt-1 ${stateColor}`}>{activeLic.used} / {activeLic.limit}</p>
                      <p className="text-[12px] text-muted-foreground mt-0.5">{activeLic.usage}% de uso</p>
                      <div className="h-2 w-full bg-muted rounded-full overflow-hidden mt-1.5">
                        <div 
                          className={`h-full ${activeLic.usage > 90 ? 'bg-rose-500' : activeLic.usage > 75 ? 'bg-emerald-500' : 'bg-emerald-500'}`} 
                          style={{ width: `${activeLic.usage}%` }}
                        ></div>
                      </div>
                    </div>
                  );
                })()}

                {/* Kaspersky Endpoint Security versions */}
                {(() => {
                  const versions = getKscVersionInventory(nodes.kscHardware);
                  const hasVersionData = versions.kes.length > 0;
                  return (
                    <div className="col-span-2 bg-background/30 border border-border/40 rounded-lg p-4">
                      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                        <div>
                          <p className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider flex items-center gap-2">
                            <MonitorSmartphone className="w-6 h-6 text-yellow-300" /> Versiones Kaspersky
                          </p>
                          <p className="mt-1 text-base font-bold text-slate-200">
                            {hasVersionData ? 'Dispositivos por versión' : 'Esperando informe de versiones'}
                          </p>
                        </div>
                        <span className={`rounded-full border px-2 py-1 text-[10px] font-black ${hasVersionData ? 'border-emerald-500/25 bg-emerald-500/10 text-emerald-300' : 'border-amber-500/25 bg-amber-500/10 text-amber-300'}`}>
                          {hasVersionData ? 'Inventario activo' : 'Pendiente'}
                        </span>
                      </div>
                      <div className="mt-3">
                        <VersionDistribution title="Kaspersky Endpoint Security" versions={versions.kes} accent="emerald" />
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
          </EditableDashboardPanel>
        )}

        {/* Columna 2: PROXMOX-ZK host with SERV-ZK VM */}
        <EditableDashboardPanel
          id="zk-summary"
          title="PROXMOX-ZK / SERV-ZK"
          layout={dashboardLayout}
          editMode={isLayoutEditing}
          onSizeChange={updatePanelSize}
          onDragStart={handlePanelDragStart}
          onDragOver={(event) => event.preventDefault()}
          onDrop={handlePanelDrop}
        >
        <div
          className={`bg-card/40 backdrop-blur-sm border rounded-xl p-4 transition-all duration-300 group ${zkHostPing?.status === 'DOWN' || zkStatus === 'CRITICAL' || zkVmPing?.status === 'DOWN' ? 'border-rose-500/40' : 'border-border'}`}
        >
          <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_auto] items-start gap-3 mb-3">
            <div className="flex items-center gap-3">
              <div className={`p-1 rounded-xl ${zkHostPing?.status === 'DOWN' ? 'bg-rose-500/10' : 'bg-transparent'}`}>
                <ProxmoxIcon className="w-10 h-10" />
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
                  <p className="text-[10px] text-muted-foreground uppercase tracking-wider font-medium">Proxmox VE</p>
                  <span className={`text-[11px] font-bold flex items-center gap-1.5 ${zkHostStatusColor}`}>
                    <div className={`w-1.5 h-1.5 rounded-full ${(zkHostPing?.status === 'UP' || zkHost.Pingable) ? 'bg-emerald-400 animate-pulse' : 'bg-slate-600'}`} />
                    ESTADO HOST: {zkHostStatus}
                  </span>
                </div>
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-start lg:justify-end gap-1.5 text-xs lg:max-w-[420px]">
              <div className="flex items-center gap-1.5 px-3 py-1.5 bg-background rounded-md border border-border">
                <Activity className="w-4 h-4 text-purple-400" />
                <span className="text-muted-foreground">Web UI:</span>
                <span className={zkHost.Ports?.WebUI8006 ? 'font-bold text-emerald-400' : 'font-bold text-amber-400'}>{zkHost.Ports?.WebUI8006 ? '8006 OK' : 'N/D'}</span>
              </div>
              <div className="flex items-center gap-1.5 px-3 py-1.5 bg-background rounded-md border border-border">
                <Lock className="w-4 h-4 text-sky-400" />
                <span className="text-muted-foreground">SSH:</span>
                <span className={zkHost.Ports?.SSH22 ? 'font-bold text-emerald-400' : 'font-bold text-amber-400'}>{zkHost.Ports?.SSH22 ? '22 OK' : 'N/D'}</span>
              </div>
              <div className="flex items-center gap-1.5 px-3 py-1.5 bg-background rounded-md border border-border">
                <Cpu className="w-4 h-4 text-primary" />
                <span className="font-bold text-emerald-400">1/1 VMs</span>
              </div>
              <div className="flex items-center gap-1.5 px-3 py-1.5 bg-background rounded-md border border-border">
                <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                <span className="text-muted-foreground">ZK:</span>
                <span className={zkOnlineServiceStatus === 'Running' || zkOnlineServiceStatus === 4 ? 'font-bold text-emerald-400' : 'font-bold text-amber-400'}>
                  {zkOnlineServiceStatus === 'Running' || zkOnlineServiceStatus === 4 ? 'Activo' : zkOnlineServiceStatus}
                </span>
              </div>
              <div className="flex items-center gap-1.5 px-3 py-1.5 bg-background rounded-md border border-border">
                <BabyWareIcon className="w-5 h-5" />
                <span className="text-muted-foreground">BabyWare:</span>
                <span className={babyWareOk ? 'font-bold text-emerald-400' : 'font-bold text-amber-400'}>
                  {babyWareOk ? `${babyWarePort} OK` : 'N/D'}
                </span>
              </div>
            </div>
          </div>

          <div className="border-t border-border/30 pt-3">
            <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-2.5 flex items-center gap-1.5">
              <Database className="w-4 h-4" /> Máquinas Virtuales
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
                  icon={<ZKIcon className="w-8 h-8" />}
                  iconClassName="p-0 rounded-lg"
                  compact
                  extraContent={
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                      <div className="rounded-lg border border-border/40 bg-background/35 p-2.5">
                        <div className="flex items-center gap-2 text-muted-foreground">
                          <ZKIcon className="w-5 h-5" />
                          <span className="font-bold uppercase tracking-wider text-[10px]">BioPlatform</span>
                        </div>
                        <p className="mt-1 font-bold text-emerald-400">{zkBioPlatformHealthy}/{zkBioPlatformTotal || 'N/D'} servicios</p>
                      </div>
                      <div className="rounded-lg border border-border/40 bg-background/35 p-2.5">
                        <div className="flex items-center gap-2 text-muted-foreground">
                          <BabyWareIcon className="w-5 h-5" />
                          <span className="font-bold uppercase tracking-wider text-[10px]">BabyWare TCP/{babyWarePort}</span>
                        </div>
                        <p className={`mt-1 font-bold ${babyWareOk ? 'text-emerald-400' : 'text-amber-400'}`}>
                          {babyWareStatus}
                          {babyWarePing?.time != null && <span className="text-[10px] font-medium ml-1">({Math.round(babyWarePing.time)}ms)</span>}
                        </p>
                      </div>
                    </div>
                  }
                />
              ) : (
                <div className="bg-background/30 border border-dashed border-border/40 rounded-xl p-5 flex flex-col items-center justify-center gap-3 opacity-70 hover:opacity-90 transition-opacity min-h-[180px]">
                  <div className="p-2 bg-slate-500/10 rounded-lg text-slate-400">
                    <ZKIcon className="w-8 h-8" />
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
        </EditableDashboardPanel>

      </div>

      <EditableDashboardPanel
        id="ksc-inventory"
        title="Inventario KSC"
        layout={dashboardLayout}
        editMode={isLayoutEditing}
        onSizeChange={updatePanelSize}
        onDragStart={handlePanelDragStart}
        onDragOver={(event) => event.preventDefault()}
        onDrop={handlePanelDrop}
      >
        <KscHardwareInventoryPanel
          key={animationCycle}
          data={nodes.kscHardware}
          focusChartMode={focusInventoryChartMode}
          isFocusChartAutoRotating={isFocusInventoryChartAutoRotating}
          onToggleFocusChartMode={toggleFocusInventoryChartMode}
          onToggleFocusChartAutoRotate={() => setIsFocusInventoryChartAutoRotating((value) => !value)}
        />
      </EditableDashboardPanel>
      
      {/* Modal KSC Detailed Info */}
      {isKSCModalOpen && nodes.ksc && (nodes.ksc.Kaspersky || nodes.ksc.data?.Kaspersky) && (
        <div className="fixed inset-0 z-50 bg-background/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-card border border-border rounded-xl shadow-xl w-full max-w-6xl max-h-[90vh] overflow-hidden flex flex-col animate-in zoom-in-95 duration-200">
            <div className="p-4 border-b border-border flex justify-between items-center bg-muted/30">
              <div className="flex items-center gap-3">
                <div className="p-0 rounded-lg">
                  <KasperskyIcon className="w-10 h-10" />
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
                  const bd = getKscVirusDatabaseUsage(nodes);
                  const alDia = toInt(bd.Vigentes ?? bd.AlDia);
                  const masDeUnaSemana = toInt(bd.MasDeUnaSemana);
                  const state = masDeUnaSemana > 0 ? 'MAYORÍA AL DÍA' : 'AL DÍA';
                  const stateColor = 'text-emerald-400 border-emerald-500/20 bg-emerald-500/5';
                  return (
                    <div className="bg-background/40 border border-border/50 rounded-xl p-4 flex flex-col justify-between">
                      <div>
                        <div className="flex justify-between items-start mb-2">
                          <span className="text-xs font-bold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5"><Database className="w-4 h-4" /> Bases de Datos AV</span>
                          <span className={`text-[9px] font-bold px-2 py-0.5 rounded border ${stateColor}`}>{state}</span>
                        </div>
                        <div className="space-y-2 mt-4 text-xs">
                          <div className="flex justify-between">
                            <span className="text-muted-foreground">Al Día:</span>
                            <span className="font-bold text-emerald-400">{alDia}</span>
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
                            <span className="text-muted-foreground font-medium">&gt; 1 Semana:</span>
                            <span className="font-bold text-amber-400">{masDeUnaSemana}</span>
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
                  const criticas = toInt(vul.DispCritica);
                  const state = criticas > 0 ? 'PRIORIZAR' : 'CONTROLADO';
                  const stateColor = criticas > 0 ? 'text-amber-400 border-amber-500/20 bg-amber-500/5' : 
                                     'text-emerald-400 border-emerald-500/20 bg-emerald-500/5';
                  return (
                    <div className="bg-background/40 border border-border/50 rounded-xl p-4 flex flex-col justify-between">
                      <div>
                        <div className="flex justify-between items-start mb-2">
                          <span className="text-xs font-bold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5"><Bug className="w-4 h-4" /> Vulnerabilidades</span>
                          <span className={`text-[9px] font-bold px-2 py-0.5 rounded border ${stateColor}`}>{state}</span>
                        </div>
                        <div className="space-y-2 mt-4 text-xs">
                          <div className="flex justify-between">
                            <span className="text-muted-foreground">Dispositivos Sin Vuln.:</span>
                            <span className="font-bold text-emerald-400">{vul.DispSinVulnerabilidad ?? 0}</span>
                          </div>
                          <div className="flex justify-between border-t border-border/20 pt-2">
                            <span className="text-muted-foreground">Severidad Crítica:</span>
                            <span className={`font-bold ${criticas > 0 ? 'text-amber-400' : 'text-emerald-400'}`}>{criticas}</span>
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
                  const keys = Array.isArray(lic.Licencias)
                    ? [...lic.Licencias].sort((a, b) => toInt(b.DispositivosUsados) - toInt(a.DispositivosUsados))
                    : [];
                  const primaryLicense = getPrimaryLicense(lic);
                  const state = primaryLicense.usage > 90 ? 'REVISAR' : 'EN USO';
                  const stateColor = primaryLicense.usage > 90 ? 'text-amber-400 border-amber-500/20 bg-amber-500/5' : 
                                     'text-emerald-400 border-emerald-500/20 bg-emerald-500/5';
                  return (
                    <div className="bg-background/40 border border-border/50 rounded-xl p-4 flex flex-col justify-between">
                      <div>
                        <div className="flex justify-between items-start mb-2">
                          <span className="text-xs font-bold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5"><KeyRound className="w-4 h-4" /> Licenciamiento</span>
                          <span className={`text-[9px] font-bold px-2 py-0.5 rounded border ${stateColor}`}>{state}</span>
                        </div>
                        <div className="space-y-3 mt-4 text-[11px]">
                          {primaryLicense.limit > 0 && (
                            <div className="rounded-lg border border-emerald-500/20 bg-emerald-500/5 p-2">
                              <div className="flex justify-between text-[11px]">
                                <span className="text-muted-foreground">Licencia principal</span>
                                <span className="font-bold text-emerald-400">{primaryLicense.used} / {primaryLicense.limit} ({primaryLicense.usage}% de uso)</span>
                              </div>
                              <div className="h-1.5 w-full bg-muted rounded-full overflow-hidden mt-2">
                                <div className="h-full bg-emerald-500" style={{ width: `${primaryLicense.usage}%` }}></div>
                              </div>
                            </div>
                          )}
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
                  const infected = toInt(am.DispositivosInfect);
                  const detected = toInt(am.AmenazasDetectadas);
                  const state = infected > 0 ? 'REVISAR' : detected > 0 ? 'CONTENIDO' : 'LIMPIO';
                  const stateColor = infected > 0 ? 'text-amber-400 border-amber-500/20 bg-amber-500/5' : 
                                     'text-emerald-400 border-emerald-500/20 bg-emerald-500/5';
                  return (
                    <div className="bg-background/40 border border-border/50 rounded-xl p-4 flex flex-col justify-between">
                      <div>
                        <div className="flex justify-between items-start mb-2">
                          <span className="text-xs font-bold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5"><Shield className="w-4 h-4" /> Amenazas</span>
                          <span className={`text-[9px] font-bold px-2 py-0.5 rounded border ${stateColor}`}>{state}</span>
                        </div>
                        <div className="space-y-2 mt-4 text-xs">
                          <div className="flex justify-between">
                            <span className="text-muted-foreground">Dispositivos Infectados:</span>
                            <span className={`font-bold ${infected > 0 ? 'text-amber-400' : 'text-emerald-400'}`}>{infected}</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-muted-foreground">Amenazas Detectadas:</span>
                            <span className="font-bold text-sky-400">{detected}</span>
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
                <div className="p-0 rounded-lg">
                  <ZKIcon className="w-10 h-10" />
                </div>
                <div>
                  <h2 className="text-lg font-bold">Análisis Profundo - SERV-ZK</h2>
                  <p className="text-xs text-muted-foreground">Proxmox VE • VM Windows • ZKBio CVSecurity</p>
                </div>
              </div>
              <button onClick={() => setIsZKModalOpen(false)} className="p-2 hover:bg-muted rounded-lg transition-colors">
                <XCircle className="w-5 h-5 text-muted-foreground" />
              </button>
            </div>

            <div className="p-6 overflow-y-auto custom-scrollbar space-y-6">
              <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-4">
                <MetricSmall label="Estado General" value={zkStatus} color={zkStatusColor} icon={<Activity className="w-4 h-4" />} />
                <MetricSmall label="Host Proxmox" value={zkHostStatus} color={zkHostStatusColor} icon={<ProxmoxIcon className="w-5 h-5" />} />
                <MetricSmall label="ZKBIOOnline" value={zkOnlineServiceStatus} color={zkOnlineServiceStatus === 'Running' || zkOnlineServiceStatus === 4 ? 'text-emerald-400' : 'text-amber-400'} icon={<ZKIcon className="w-5 h-5" />} />
                <MetricSmall label="Servicios ZK" value={nodes.zk ? `${zkRunningServices}/${zkTotalServices}` : 'Sin datos'} color={zkServices.Status === 'CRITICAL' ? 'text-rose-400' : 'text-emerald-400'} icon={<CheckCircle2 className="w-4 h-4" />} />
                <MetricSmall label="BabyWare 16001" value={babyWareOk ? 'Activo' : babyWareStatus} color={babyWareOk ? 'text-emerald-400' : 'text-amber-400'} icon={<BabyWareIcon className="w-5 h-5" />} />
                <MetricSmall label="Uptime VM" value={rawZ.Uptime || rawZ.data?.Uptime || 'N/A'} icon={<Clock className="w-4 h-4" />} />
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
                        <ProxmoxIcon className="w-5 h-5" /> Anfitrión Proxmox
                      </h4>
                      <div className="grid grid-cols-2 gap-3 text-xs">
                        <div><p className="text-muted-foreground">Nombre</p><p className="font-bold">{zkHost.Name || zkVirt.HostName || 'PROXMOX-ZK'}</p></div>
                        <div><p className="text-muted-foreground">Tipo</p><p className="font-medium">Anfitrión Proxmox</p></div>
                        <div><p className="text-muted-foreground">Ping</p><p className={zkHost.Pingable ? 'font-bold text-emerald-400' : 'font-bold text-rose-400'}>{zkHost.Pingable ? 'OK' : 'N/D'}</p></div>
                        <div><p className="text-muted-foreground">Web UI 8006</p><p className={zkHost.Ports?.WebUI8006 ? 'font-bold text-emerald-400' : 'font-bold text-amber-400'}>{zkHost.Ports?.WebUI8006 ? 'OK' : 'N/D'}</p></div>
                        <div><p className="text-muted-foreground">SSH 22</p><p className={zkHost.Ports?.SSH22 ? 'font-bold text-emerald-400' : 'font-bold text-amber-400'}>{zkHost.Ports?.SSH22 ? 'OK' : 'N/D'}</p></div>
                        <div><p className="text-muted-foreground">Heartbeat</p><p className={zkHostPing?.status === 'UP' ? 'font-bold text-emerald-400' : 'font-bold text-slate-400'}>{zkHostPing?.status || 'Sin latido'}</p></div>
                      </div>
                    </div>

                    <div className="bg-background border border-border rounded-lg p-4">
                      <h4 className="text-sm font-semibold mb-3 border-b border-border/50 pb-2 flex items-center gap-2">
                        <ZKIcon className="w-5 h-5" /> VM Windows SERV-ZK
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
                      <BabyWareIcon className="w-6 h-6" /> BabyWare Alarmas
                    </h4>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
                      <div><p className="text-muted-foreground">Puerto</p><p className="font-bold">TCP/{babyWarePort}</p></div>
                      <div><p className="text-muted-foreground">Heartbeat VPS</p><p className={babyWarePing?.status === 'UP' ? 'font-bold text-emerald-400' : babyWarePing?.status === 'DOWN' ? 'font-bold text-rose-400' : 'font-bold text-slate-400'}>{babyWarePing?.status || 'Sin latido'}</p></div>
                      <div><p className="text-muted-foreground">Estado PS1</p><p className={babyWareOk ? 'font-bold text-emerald-400' : 'font-bold text-amber-400'}>{babyWare.Status || 'N/D'}</p></div>
                      <div><p className="text-muted-foreground">Proceso</p><p className="font-medium truncate">{babyWareProcess}</p></div>
                    </div>
                    {Array.isArray(babyWare.Issues) && babyWare.Issues.length > 0 && (
                      <div className="mt-3 space-y-2">
                        {babyWare.Issues.slice(0, 3).map((issue, idx) => (
                          <div key={idx} className="rounded border border-amber-500/20 bg-amber-500/5 p-2 text-xs text-amber-300">{issue}</div>
                        ))}
                      </div>
                    )}
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
      <SmartMonitoringNotification
        notification={smartNotification}
        visible={isSmartNotificationVisible}
        onClose={() => {
          setIsSmartNotificationVisible(false);
          setTimeout(() => setSmartNotification(null), 700);
        }}
      />
    </div>
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
