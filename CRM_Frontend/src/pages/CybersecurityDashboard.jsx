import { createElement, useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  AlertTriangle, ArrowRight, CheckCircle2, ChevronRight, Clock3,
  Boxes, Database, EyeOff, FileSearch, Fingerprint, History, ListChecks, MapPin, Network, Radar, RefreshCw,
  Search, ShieldAlert, ShieldCheck, SlidersHorizontal, X,
} from 'lucide-react';
import { cybersecurityService } from '../services/cybersecurity.service';
import PageHeader from '../components/PageHeader';

const PRIORITY_STYLE = {
  P1: 'border-rose-500/30 bg-rose-500/10 text-rose-300',
  P2: 'border-orange-500/30 bg-orange-500/10 text-orange-300',
  P3: 'border-amber-500/30 bg-amber-500/10 text-amber-300',
  P4: 'border-sky-500/30 bg-sky-500/10 text-sky-300',
};

const STATUS_LABEL = {
  NEW: 'Nuevo', VALIDATION_REQUIRED: 'Requiere validación',
  TEMPORARILY_ACCEPTED: 'Aceptado temporalmente', PLANNED: 'Planificado',
  IN_PROGRESS: 'En tratamiento', REMEDIATED: 'Remediado',
  VERIFIED: 'Verificado', CLOSED: 'Cerrado',
};

const SOURCE_LABEL = {
  FORTIGATE: 'FortiGate', KASPERSKY: 'Kaspersky KSC', GREENBONE: 'Greenbone', CANONICAL: 'Canónico',
};
// Icono por fuente — pedido del usuario 2026-09-16 ("manejar mejor infografía e iconos"):
// reconocer de un vistazo si un dato viene de la red (FortiGate), del antivirus (Kaspersky) o
// de un escaneo de vulnerabilidades (Greenbone), sin tener que leer la etiqueta de texto.
const SOURCE_ICON = { FORTIGATE: Network, KASPERSKY: ShieldCheck, GREENBONE: Radar, CANONICAL: Boxes };
function SourceTag({ source, size = 14, className = '' }) {
  const Icon = SOURCE_ICON[source] || Network;
  return <span className={`inline-flex items-center gap-1 ${className}`}><Icon size={size} className="shrink-0" />{SOURCE_LABEL[source] || source}</span>;
}
// Logo real por fuente (carpeta que aportó el usuario 2026-09-16, servido desde public/ igual
// que ya hace Monitoring.jsx con /kaspersky_logo.png) — Canónico se queda con el icono genérico
// de SOURCE_ICON porque no es una fuente externa real. Los 3 PNG/WEBP ya traen fondo
// transparente (verificado con PIL, alpha 0-255) -- sin chapa/recuadro, directo sobre la tarjeta,
// como ya se ve en Monitoreo IT.
const SOURCE_LOGO = { FORTIGATE: '/fortinet_logo.webp', KASPERSKY: '/kaspersky_logo.png', GREENBONE: '/greenbone_logo.png' };
function SourceBadge({ source, className = '' }) {
  const logo = SOURCE_LOGO[source];
  const Icon = SOURCE_ICON[source] || Network;
  return (
    <span className={`inline-flex items-center gap-2 ${className}`}>
      {logo ? (
        <img src={logo} alt="" className="h-10 w-10 shrink-0 object-contain" />
      ) : (
        <Icon size={26} className="shrink-0 text-muted-foreground" />
      )}
      <span className="text-sm font-bold">{SOURCE_LABEL[source] || source}</span>
    </span>
  );
}
// Barra de confiabilidad — antes solo se veía el número ("BAJA · 34%"); una barra da una
// lectura de un vistazo sin tener que leer el porcentaje exacto.
function ReliabilityMeter({ score, label }) {
  const barTone = label === 'ALTA' ? 'bg-emerald-400' : label === 'MEDIA' ? 'bg-amber-400' : 'bg-rose-400';
  return (
    <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
      <div className={`h-full rounded-full ${barTone}`} style={{ width: `${Math.max(4, score)}%` }} />
    </div>
  );
}

const INVENTORY_STATE_LABEL = {
  NEW_ASSET_REVIEW: 'Nuevo por revisar', EPHEMERAL_REVIEW: 'Identidad efímera',
  CONFLICT_REVIEW: 'Conflicto', INSUFFICIENT_EVIDENCE: 'Evidencia insuficiente',
  PROTECTED_TARGET: 'Objetivo protegido', CANONICAL: 'Activo canónico', IGNORED: 'Ignorado',
};

const LIFECYCLE_LABEL = {
  ACTIVE: 'Activo', INTERMITTENT: 'Intermitente', INACTIVE: 'Inactivo',
  STALE_REVIEW: 'Revisar antigüedad', UNKNOWN: 'Sin actividad conocida',
};
const LIFECYCLE_TONE = {
  ACTIVE: 'bg-emerald-500/10 text-emerald-300', INTERMITTENT: 'bg-amber-500/10 text-amber-300',
  INACTIVE: 'bg-muted text-muted-foreground', STALE_REVIEW: 'bg-rose-500/10 text-rose-300',
  UNKNOWN: 'bg-muted text-muted-foreground',
};

// Agrupación de Inventario por tipo de activo (decisión del usuario 2026-09-16: "mostrar los
// activos por grupos desplegables, por tipos, equipos administrativos, equipos cctv,
// servidores..."). GROUP_ORDER fija el orden de aparición; ASSET_CLASS_GROUP mapea el
// assetClass ya calculado por el backend (inventory-analyzer.js) a su grupo visual.
const ASSET_CLASS_LABEL = {
  SERVER: 'Servidor', NETWORK: 'Red', SECURITY: 'Seguridad', WORKSTATION: 'Estación de trabajo',
  LAPTOP: 'Portátil', PRINTER: 'Impresora', IOT: 'IoT', CCTV: 'CCTV', MOBILE: 'Móvil',
  GUEST_BYOD: 'Invitado / BYOD', VIRTUAL_MACHINE: 'Máquina virtual', OTHER: 'Sin clasificar',
};
const ASSET_CLASS_GROUP = {
  SERVER: 'SERVERS', CCTV: 'CCTV', WORKSTATION: 'ADMIN', LAPTOP: 'ADMIN',
  NETWORK: 'NETWORK', SECURITY: 'NETWORK', MOBILE: 'MOBILE', GUEST_BYOD: 'MOBILE',
  PRINTER: 'PRINTERS', IOT: 'IOT', VIRTUAL_MACHINE: 'VMS', OTHER: 'OTHER',
};
const GROUP_ORDER = ['ATTENTION', 'SERVERS', 'CCTV', 'ADMIN', 'NETWORK', 'VMS', 'PRINTERS', 'IOT', 'MOBILE', 'PROTECTED', 'CANONICAL', 'IGNORED', 'OTHER'];
const GROUP_LABEL = {
  ATTENTION: 'Requiere atención', SERVERS: 'Servidores', CCTV: 'CCTV', ADMIN: 'Equipos administrativos',
  NETWORK: 'Red e infraestructura', VMS: 'Máquinas virtuales', PRINTERS: 'Impresoras', IOT: 'IoT',
  MOBILE: 'Móviles', PROTECTED: 'Objetivos protegidos', CANONICAL: 'Activos canónicos',
  IGNORED: 'Ignorados', OTHER: 'Sin clasificar',
};
const GROUP_ICON = {
  ATTENTION: AlertTriangle, SERVERS: Database, CCTV: Radar, ADMIN: ShieldCheck, NETWORK: Network,
  VMS: Boxes, PRINTERS: FileSearch, IOT: Radar, MOBILE: Fingerprint, PROTECTED: ShieldAlert,
  CANONICAL: CheckCircle2, IGNORED: EyeOff, OTHER: SlidersHorizontal,
};
// needsManualReview (IP duplicada sin explicar) se dispara sobre todo en las redes WiFi
// (móviles con DHCP reasignando IP durante el día) -- ruido esperado y ya despriorizado por
// el usuario (2026-09-15), no un caso real para "requiere atención". Se excluyen MOBILE/
// GUEST_BYOD/OTHER de ese disparador (verificado: 327 needsManualReview totales, 301 eran
// MOBILE/OTHER; con el filtro quedan solo los 32 casos reales en clases administrativas/red).
const ATTENTION_EXCLUDED_CLASSES = new Set(['MOBILE', 'GUEST_BYOD', 'OTHER']);
function groupForCandidate(item) {
  if (item.kind === 'PROTECTED_TARGET') return 'PROTECTED';
  if (item.kind === 'CANONICAL') return 'CANONICAL';
  // Ignorado a mano (botón "Ignorar") sale de "Requiere atención" pero sigue visible/auditable
  // en su propio grupo, en vez de desaparecer del Inventario.
  if (item.state === 'IGNORED') return 'IGNORED';
  const manualReviewRelevant = item.reliability?.needsManualReview && !ATTENTION_EXCLUDED_CLASSES.has(item.assetClass);
  // Segmento ya clasificado en Subredes como WiFi corporativo/invitados (decisión del usuario
  // 2026-09-16: "podemos ignorar los identificados de las redes wifi") -- ruido DHCP/MAC
  // aleatoria esperado, igual que MOBILE/GUEST_BYOD/OTHER arriba, pero por red en vez de clase.
  if (!item.onWifiSegment && (item.antivirusGapSuspected || manualReviewRelevant)) return 'ATTENTION';
  return ASSET_CLASS_GROUP[item.assetClass] || 'OTHER';
}

const AUTHORITY_LABEL = {
  AUTHORITATIVE_WINDOWS: 'KSC · identidad Windows',
  MANAGED_DEVICE_EVIDENCE: 'KSC · equipo administrado',
  NETWORK_ACTIVITY_AUTHORITY: 'FortiGate · actividad en red',
  VULNERABILITY_EVIDENCE: 'Greenbone · evidencia técnica',
  HUMAN_VERIFIED: 'Verificación humana', SUPPORTING: 'Fuente complementaria',
};

const NETWORK_PROFILE_LABEL = {
  ADMINISTRATIVE_MANAGED: 'Administrativa · IP fija esperada',
  MANAGED_OTHER: 'Administrado · red por confirmar',
  SEGMENT_POLICY_REQUIRED: 'Segmento por clasificar',
  AUTHORIZED_SCAN_TARGET: 'Objetivo de escaneo autorizado',
  CANONICAL: 'Segmento canónico', UNCLASSIFIED: 'Red sin clasificar',
};

// Índice de confiabilidad por host (src/inventory-reliability.js, backend) — no reemplaza la
// "Confianza"/"Fuerza identidad" que ya existían; combina antigüedad de presencia, corroboración
// entre fuentes y si el "conflicto" es en realidad un mismo equipo con varias tarjetas de red.
const RELIABILITY_TONE = {
  ALTA: 'bg-emerald-500/10 text-emerald-300',
  MEDIA: 'bg-amber-500/10 text-amber-300',
  BAJA: 'bg-rose-500/10 text-rose-300',
};

function ReliabilityBadge({ reliability }) {
  return (
    <div className={`flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1.5 text-[10px] font-black uppercase ${RELIABILITY_TONE[reliability.label]}`}>
      {reliability.needsManualReview && <AlertTriangle size={12} />}
      Confiabilidad {reliability.score}%
    </div>
  );
}

function ReliabilityPanel({ reliability }) {
  return (
    <div className={`rounded-xl border p-3 ${reliability.needsManualReview ? 'border-rose-500/25 bg-rose-500/[0.05]' : 'border-border bg-card/60'}`}>
      <div className="flex items-center justify-between gap-3">
        <p className="text-[10px] font-extrabold uppercase tracking-wider text-muted-foreground">Índice de confiabilidad</p>
        <span className={`shrink-0 rounded-full px-2.5 py-0.5 text-[10px] font-black uppercase ${RELIABILITY_TONE[reliability.label]}`}>{reliability.label} · {reliability.score}%</span>
      </div>
      <div className="mt-2"><ReliabilityMeter score={reliability.score} label={reliability.label} /></div>
      {reliability.needsManualReview && (
        <p className="mt-2 flex items-center gap-1.5 text-xs font-bold text-rose-300"><AlertTriangle size={14} className="shrink-0" /> Revisión manual: dos equipos reclaman la misma IP y no parecen ser el mismo hardware.</p>
      )}
      {reliability.signals.length > 0 && <p className="mt-1.5 text-[11px] text-muted-foreground">{reliability.signals.join(' · ')}</p>}
    </div>
  );
}

// Ciberseguridad proactiva (decisión del usuario, 2026-09-16): equipo Windows administrativo
// visto por FortiGate que nunca se corrobora con Kaspersky (el agente antivirus/EDR) — sospecha
// de falta de protección, a revisar por un humano.
function AntivirusGapPanel() {
  return (
    <div className="rounded-xl border border-rose-500/25 bg-rose-500/[0.05] p-3">
      <div className="flex items-center gap-2 text-rose-300"><ShieldAlert size={15} className="shrink-0" /><p className="text-[10px] font-extrabold uppercase tracking-wider">Posible falta de antivirus</p></div>
      <p className="mt-1.5 text-[11px] leading-relaxed text-muted-foreground">Windows administrativo visto por FortiGate, nunca corroborado por Kaspersky. No es certeza, pero vale la pena confirmar que tenga protección instalada.</p>
    </div>
  );
}

function MetricCard({ label, value, detail, icon, tone = 'blue' }) {
  const tones = {
    rose: 'from-rose-500/15 border-rose-500/20',
    amber: 'from-amber-500/15 border-amber-500/20',
    blue: 'from-blue-500/15 border-blue-500/20',
    emerald: 'from-emerald-500/15 border-emerald-500/20',
  };
  // Icon-badge sólido con gradiente (design-system.md §4), un par de colores por semántica.
  const badges = {
    rose: 'bg-gradient-to-tr from-rose-600 to-red-500',
    amber: 'bg-gradient-to-tr from-amber-500 to-yellow-500 text-black',
    blue: 'bg-gradient-to-tr from-blue-600 to-indigo-600',
    emerald: 'bg-gradient-to-tr from-emerald-600 to-teal-500',
  };
  return (
    <div className={`rounded-2xl border bg-gradient-to-br ${tones[tone]} to-transparent p-4 shadow-sm`}>
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-xs font-extrabold uppercase tracking-wider text-muted-foreground">{label}</p>
          <p className="mt-1.5 text-4xl font-black tracking-tight text-foreground">{value ?? '—'}</p>
          <p className="mt-1 text-[13px] text-muted-foreground">{detail}</p>
        </div>
        <span className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl text-white shadow-inner ${badges[tone]}`}>{createElement(icon, { size: 24 })}</span>
      </div>
    </div>
  );
}

function EmptyState({ error, onRetry }) {
  return (
    <div className="rounded-2xl border border-dashed border-border bg-card/40 px-6 py-14 text-center">
      <Radar className="mx-auto text-muted-foreground" size={34} />
      <h3 className="mt-4 font-bold">{error ? 'API de ciberseguridad no disponible' : 'Aún no hay casos importados'}</h3>
      <p className="mx-auto mt-2 max-w-lg text-sm text-muted-foreground">
        {error ? 'El servicio interno de ciberseguridad no está disponible. Verifica su estado y vuelve a intentar.' : 'Los casos aparecerán cuando el receptor acepte una exportación protegida de Greenbone.'}
      </p>
      {error && <button onClick={onRetry} className="mt-5 rounded-xl border border-border px-4 py-2 text-xs font-bold hover:bg-muted">Reintentar</button>}
    </div>
  );
}

function CaseDetail({ caseId, onClose }) {
  const query = useQuery({
    queryKey: ['cybersecurity-case', caseId],
    queryFn: () => cybersecurityService.getCase(caseId),
    enabled: Boolean(caseId),
  });
  if (!caseId) return null;
  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/55 backdrop-blur-sm" onMouseDown={onClose}>
      <aside className="h-full w-full max-w-2xl overflow-y-auto border-l border-border bg-background p-7 shadow-2xl" onMouseDown={(event) => event.stopPropagation()}>
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-[10px] font-black uppercase tracking-[0.2em] text-blue-400">Caso de remediación</p>
            <h2 className="mt-2 text-2xl font-black tracking-tight">{query.data?.title || 'Cargando caso…'}</h2>
          </div>
          <button onClick={onClose} className="rounded-xl border border-border p-2 hover:bg-muted" aria-label="Cerrar detalle"><X size={18} /></button>
        </div>
        {query.isError && <EmptyState error onRetry={query.refetch} />}
        {query.data && (
          <div className="mt-7 space-y-6">
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <div className="rounded-xl border border-border bg-card p-3"><p className="text-[10px] uppercase text-muted-foreground">Prioridad</p><p className="mt-1 font-black">{query.data.priority}</p></div>
              <div className="rounded-xl border border-border bg-card p-3"><p className="text-[10px] uppercase text-muted-foreground">Severidad</p><p className="mt-1 font-black">{query.data.maxSeverity.toFixed(1)}</p></div>
              <div className="rounded-xl border border-border bg-card p-3"><p className="text-[10px] uppercase text-muted-foreground">QoD máx.</p><p className="mt-1 font-black">{query.data.maxQod ?? '—'}%</p></div>
              <div className="rounded-xl border border-border bg-card p-3"><p className="text-[10px] uppercase text-muted-foreground">Evidencias</p><p className="mt-1 font-black">{query.data.findingCount}</p></div>
            </div>
            <div className="rounded-2xl border border-border bg-card/60 p-5">
              <p className="text-[11px] font-extrabold uppercase tracking-wider text-muted-foreground">Activo y tratamiento</p>
              <p className="mt-3 font-bold">{query.data.asset}</p>
              <p className="mt-1 text-sm text-muted-foreground">{STATUS_LABEL[query.data.status] || query.data.status}</p>
              {query.data.treatmentReason && <p className="mt-3 rounded-lg bg-muted/60 p-3 text-sm">{query.data.treatmentReason}</p>}
            </div>
            <div>
              <h3 className="mb-3 flex items-center gap-2 font-black"><FileSearch size={18} className="text-blue-400" /> Evidencias asociadas</h3>
              <div className="space-y-3">
                {query.data.findings.map((finding) => (
                  <article key={finding.id} className="rounded-2xl border border-border bg-card/70 p-5">
                    <div className="flex items-start justify-between gap-4"><h4 className="font-bold leading-snug">{finding.title}</h4><span className="rounded-lg bg-rose-500/10 px-2 py-1 text-xs font-black text-rose-300">{finding.severity.toFixed(1)}</span></div>
                    <div className="mt-3 flex flex-wrap gap-2 text-[11px] text-muted-foreground">
                      <span>{finding.port ?? 'general'}/{finding.transport || '—'}</span><span>•</span><span>QoD {finding.qod ?? '—'}%</span><span>•</span><span>{finding.confidenceStatus.replaceAll('_', ' ')}</span>
                    </div>
                    {finding.cves.length > 0 && <div className="mt-3 flex flex-wrap gap-1.5">{finding.cves.map((cve) => <span key={cve} className="rounded-md border border-border bg-muted/50 px-2 py-1 text-[10px] font-bold">{cve}</span>)}</div>}
                    {finding.evidence?.text && <p className="mt-4 max-h-32 overflow-y-auto whitespace-pre-wrap rounded-lg bg-muted/60 p-3 text-xs leading-relaxed text-muted-foreground">{finding.evidence.text}</p>}
                  </article>
                ))}
              </div>
            </div>
          </div>
        )}
      </aside>
    </div>
  );
}

// Panel de detalle de candidato, embebido inline en el maestro-detalle de
// Inventario (mismo patrón que Subredes: lista a la izquierda, detalle a la
// derecha) en vez del cajón lateral que usaba antes.
// Traduce los códigos de error de la API a algo que un humano pueda leer sin tener que
// adivinar (antes se mostraba el código crudo, o ni eso — ver alert() nativo reemplazado
// abajo, decisión del usuario 2026-09-16: "mejorar más la interfaz para que sea más fácil de
// leer").
const ACTION_ERROR_LABEL = {
  SUPERADMIN_REQUIRED: 'Tu sesión no tiene permiso de superadministrador para esta acción.',
  OBSERVATION_ALREADY_LINKED: 'Este candidato ya está vinculado a un activo canónico.',
  INVALID_NOTE_TOO_LONG: 'La nota es demasiado larga (máximo 500 caracteres).',
  NOT_FOUND: 'La API no encontró esta ruta — puede que la sesión haya caducado, intenta recargar.',
};

function CandidateDetailPane({ query, onChanged }) {
  const [note, setNote] = useState('');
  const [actionError, setActionError] = useState('');
  const [pendingAction, setPendingAction] = useState('');

  const runAction = async (actionKey, serviceCall) => {
    setActionError('');
    setPendingAction(actionKey);
    try {
      await serviceCall();
      setNote('');
      await onChanged?.();
    } catch (error) {
      setActionError(ACTION_ERROR_LABEL[error.message] || error.message);
    } finally {
      setPendingAction('');
    }
  };
  const promote = () => runAction('promote', () => cybersecurityService.promoteInventoryCandidate(query.data.id, { assetClass: 'OTHER', criticality: 'MEDIUM', canonicalName: `Activo promovido ${query.data.label}`, note }));
  const markConflict = () => runAction('conflict', () => cybersecurityService.markInventoryCandidateAsConflict(query.data.id, { note }));
  const markProtected = () => runAction('protect', () => cybersecurityService.markInventoryCandidateAsProtected(query.data.id, { note }));
  const markIgnored = () => runAction('ignore', () => cybersecurityService.markInventoryCandidateAsIgnored(query.data.id, { note }));
  return (
    <>
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="text-[10px] font-extrabold uppercase tracking-[0.2em] text-blue-400">Detalle de candidato</p>
          <h2 className="mt-2 truncate text-2xl font-black tracking-tight">{query.data?.label || 'Cargando candidato…'}</h2>
        </div>
        {query.data?.reliability && <ReliabilityBadge reliability={query.data.reliability} />}
      </div>
        {query.isError && <EmptyState error onRetry={query.refetch} />}
        {query.isLoading && <div className="mt-7 text-center text-muted-foreground">Cargando detalle…</div>}

        {/* Un activo ya promovido/protegido (kind CANONICAL) tiene una forma de datos distinta
            a una observación (canonicalName/criticality/reconciliationStatus, no ipValue/
            macValue) — antes este panel asumía siempre forma de observación y mostraría campos
            vacíos. Aquí es también donde se ve la nota que se guardó al promover. */}
        {query.data?.kind === 'CANONICAL' && (
          <div className="mt-7 space-y-5">
            <div className="rounded-2xl border border-emerald-500/25 bg-emerald-500/[0.05] p-5">
              <div className="flex items-center gap-2 text-emerald-300"><CheckCircle2 size={16} /><p className="text-[11px] font-extrabold uppercase tracking-wider">Activo canónico confirmado</p></div>
              <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-5">
                <div><p className="text-[10px] uppercase text-muted-foreground">Nombre</p><p className="mt-1 truncate font-black">{query.data.canonicalName}</p></div>
                <div><p className="text-[10px] uppercase text-muted-foreground">Clase</p><p className="mt-1 font-black">{ASSET_CLASS_LABEL[query.data.assetClass] || query.data.assetClass}</p></div>
                <div><p className="text-[10px] uppercase text-muted-foreground">Criticidad</p><p className="mt-1 font-black">{query.data.criticality}</p></div>
                <div><p className="text-[10px] uppercase text-muted-foreground">Estado</p><p className="mt-1 font-black">{LIFECYCLE_LABEL[query.data.lifecycleStatus] || query.data.lifecycleStatus}</p></div>
                <div><p className="text-[10px] uppercase text-muted-foreground">Subred</p><p className="mt-1 truncate font-black">{query.data.segment?.name || 'Sin segmento'}</p></div>
              </div>
            </div>
            {query.data.reviewReason && (
              <div className="rounded-2xl border border-border bg-card/60 p-5">
                <p className="text-[11px] font-extrabold uppercase tracking-wider text-muted-foreground">Nota</p>
                <p className="mt-2 text-sm">{query.data.reviewReason}</p>
                <p className="mt-2 text-[11px] text-muted-foreground">{query.data.reviewedBy || 'Sin autor'} · {query.data.reviewedAt ? new Date(query.data.reviewedAt).toLocaleString('es-CO') : '—'}</p>
              </div>
            )}
          </div>
        )}

        {query.data?.kind === 'OBSERVATION' && (
          <div className="mt-4 space-y-3">
            {query.data.antivirusGapSuspected && <AntivirusGapPanel />}
            {query.data.reliability && <ReliabilityPanel reliability={query.data.reliability} />}

            {/* Identidad + subred: lo que un humano necesita para reconocer el equipo físico y
                dónde vive en la red — una sola franja de 6, para que quepa sin scroll. La subred
                ya se asignó desde la importación de FortiGate (segment_id, por IP contra CIDR);
                promover no la crea ni la cambia, solo se hace visible aquí (pedido del usuario
                2026-09-16: "se debe mostrar la subred a la que fue asociado"). */}
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
              <div className="rounded-lg border border-border bg-card p-2"><p className="text-[9px] uppercase text-muted-foreground">IP observada</p><p className="mt-0.5 font-black font-mono text-xs">{query.data.ipValue || '—'}</p></div>
              <div className="rounded-lg border border-border bg-card p-2"><p className="text-[9px] uppercase text-muted-foreground">MAC</p><p className="mt-0.5 font-black font-mono text-xs">{query.data.macValue || '—'}</p></div>
              <div className="rounded-lg border border-border bg-card p-2"><p className="text-[9px] uppercase text-muted-foreground">Hostname</p><p className="mt-0.5 truncate font-black font-mono text-xs">{query.data.hostnameRaw || '—'}</p></div>
              <div className="rounded-lg border border-border bg-card p-2"><p className="text-[9px] uppercase text-muted-foreground">Fabricante</p><p className="mt-0.5 truncate font-black text-xs">{query.data.manufacturer || '—'}</p></div>
              <div className="rounded-lg border border-border bg-card p-2"><p className="text-[9px] uppercase text-muted-foreground">Sistema operativo</p><p className="mt-0.5 truncate font-black text-xs">{query.data.osFamily || '—'} {query.data.osVersion || ''}</p></div>
              <div className={`rounded-lg border p-2 ${query.data.segment ? (query.data.segment.classified ? 'border-emerald-500/25 bg-emerald-500/[0.05]' : 'border-amber-500/25 bg-amber-500/[0.05]') : 'border-border bg-card'}`}>
                <p className="text-[9px] uppercase text-muted-foreground">Subred</p>
                <p className="mt-0.5 truncate text-xs font-black">{query.data.segment?.name || 'Sin segmento'}</p>
                {query.data.segment && !query.data.segment.classified && <p className="truncate text-[9px] font-bold text-amber-400">Sin clasificar aún</p>}
              </div>
            </div>

            {/* Clasificación: una sola franja, sin repetir "confianza"/"fuerza identidad" tres veces. */}
            <div className="rounded-xl border border-border bg-card/60 p-3">
              <p className="text-[10px] font-extrabold uppercase tracking-wider text-muted-foreground">Clasificación</p>
              <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-5">
                <div><p className="text-[9px] uppercase text-muted-foreground">Fuente</p><p className="mt-0.5 text-xs font-black"><SourceTag source={query.data.source} /></p></div>
                <div><p className="text-[9px] uppercase text-muted-foreground">Estado</p><p className="mt-0.5 text-xs font-black">{INVENTORY_STATE_LABEL[query.data.state] || query.data.state}</p></div>
                <div>
                  <p className="text-[9px] uppercase text-muted-foreground">Clase de activo</p>
                  <p className="mt-0.5 flex items-center gap-1.5 text-xs font-black">
                    {createElement(GROUP_ICON[ASSET_CLASS_GROUP[query.data.assetClass]] || SlidersHorizontal, { size: 14, className: 'shrink-0 text-muted-foreground' })}
                    {ASSET_CLASS_LABEL[query.data.assetClass] || query.data.assetClass}
                  </p>
                </div>
                <div><p className="text-[9px] uppercase text-muted-foreground">Confianza</p><p className="mt-0.5 text-xs font-black">{Number.isFinite(query.data.confidence) ? `${(query.data.confidence * 100).toFixed(0)}%` : '—'}</p></div>
                <div><p className="text-[9px] uppercase text-muted-foreground">Fuerza identidad</p><p className="mt-0.5 text-xs font-black">{query.data.identityStrength || '—'}</p></div>
              </div>
              {(query.data.qualityFlags?.length > 0 || query.data.reasonCodes?.length > 0) && (
                <div className="mt-2 flex flex-wrap gap-1.5 border-t border-border pt-2">
                  {(query.data.qualityFlags || []).map((flag) => (
                    <span key={flag} className="rounded-md border border-amber-500/20 bg-amber-500/10 px-1.5 py-0.5 text-[9px] font-bold text-amber-300">{flag.replaceAll('_', ' ')}</span>
                  ))}
                  {(query.data.reasonCodes || []).map((code) => (
                    <span key={code} className="rounded-md border border-rose-500/20 bg-rose-500/10 px-1.5 py-0.5 text-[9px] font-bold text-rose-300">{code.replaceAll('_', ' ')}</span>
                  ))}
                </div>
              )}
            </div>

            {/* Actividad: ¿sigue apareciendo, o ya se fue? Esto es justo lo que responde si un
                dispositivo visto una sola vez (ej. una IP de CCTV usada brevemente) sigue
                activo o ya no — decisión del usuario 2026-09-16, se había quitado sin querer
                al simplificar este panel. */}
            <div className="flex flex-wrap items-center gap-x-5 gap-y-1.5 text-[11px] text-muted-foreground">
              <span className={`rounded-full px-2 py-0.5 text-[9px] font-black uppercase ${LIFECYCLE_TONE[query.data.lifecycleStatus] || 'bg-muted text-muted-foreground'}`}>
                {LIFECYCLE_LABEL[query.data.lifecycleStatus] || query.data.lifecycleStatus}{Number.isFinite(query.data.ageDays) ? ` · hace ${query.data.ageDays} día${query.data.ageDays === 1 ? '' : 's'}` : ''}
              </span>
              <span><span className="text-foreground font-bold">Primera vista:</span> {query.data.firstSeenSourceAt ? new Date(query.data.firstSeenSourceAt).toLocaleString('es-CO') : '—'}</span>
              <span><span className="text-foreground font-bold">Última señal:</span> {query.data.lastSeenSourceAt ? new Date(query.data.lastSeenSourceAt).toLocaleString('es-CO') : '—'}</span>
            </div>

            {/* Guía de qué hace cada botón — antes no se explicaba nada y el usuario no sabía
                qué acción correspondía a un caso como "IP usada un momento, ya no responde"
                (no requiere ninguna de las 3: no es un activo confirmado para promover, no hay
                ambigüedad real que investigar, y no es sensible para proteger). Compactado
                (2026-09-16, pedido del usuario) para que no haga falta scroll para llegar aquí. */}
            <div className="rounded-xl border border-border bg-card/40 p-3">
              <p className="text-[10px] font-extrabold uppercase tracking-wider text-muted-foreground">¿Qué hacer con este candidato?</p>

              {/* Ya se marcó en conflicto o se ignoró antes -- se muestra la nota para no tener
                  que recordar por qué, en vez de dejarla enterrada sin usar (decisionNote). */}
              {query.data.decisionNote && (
                <p className="mt-2 rounded-lg border border-border bg-muted/40 px-3 py-2 text-[11px] text-muted-foreground">
                  <span className="font-bold text-foreground">{INVENTORY_STATE_LABEL[query.data.state] || query.data.state}:</span> {query.data.decisionNote}
                </p>
              )}

              {/* Nota libre (decisión del usuario 2026-09-16: "este equipo lo instalé
                  recientemente para nuestro servidor openvas de prueba piloto" — antes no había
                  dónde dejar constancia del motivo). Se guarda junto con la acción elegida. */}
              <label className="mt-2 block">
                <span className="text-[9px] font-bold uppercase tracking-wider text-muted-foreground">Nota / observación (opcional)</span>
                <textarea value={note} onChange={(event) => setNote(event.target.value)} maxLength={500} rows={1} placeholder="Ej. Instalado para el piloto de OpenVAS, lo agregué esta semana." className="mt-1 w-full resize-none rounded-lg border border-border bg-background px-3 py-1.5 text-xs outline-none focus:border-blue-500/50" />
              </label>

              <div className="mt-2 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
                <div>
                  <button onClick={promote} disabled={Boolean(pendingAction)} className="w-full rounded-lg border border-emerald-500/25 bg-emerald-500/10 px-3 py-2 text-[11px] font-black uppercase text-emerald-300 hover:bg-emerald-500/15 disabled:cursor-not-allowed disabled:opacity-50">{pendingAction === 'promote' ? 'Promoviendo…' : 'Promover a canónico'}</button>
                  <p className="mt-1 text-[10px] leading-snug text-muted-foreground">Equipo real y estable — pasa al inventario oficial. Guarda la nota.</p>
                </div>
                <div>
                  <button onClick={markConflict} disabled={Boolean(pendingAction)} className="w-full rounded-lg border border-amber-500/25 bg-amber-500/10 px-3 py-2 text-[10px] font-black uppercase text-amber-300 hover:bg-amber-500/10 disabled:cursor-not-allowed disabled:opacity-50">{pendingAction === 'conflict' ? 'Marcando…' : 'Marcar conflicto'}</button>
                  <p className="mt-1 text-[10px] leading-snug text-muted-foreground">Algo ambiguo que investigar (ej. dos equipos, la misma IP).</p>
                </div>
                <div>
                  <button onClick={markProtected} disabled={Boolean(pendingAction)} className="w-full rounded-lg border border-rose-500/25 bg-rose-500/10 px-3 py-2 text-[10px] font-black uppercase text-rose-300 hover:bg-rose-500/10 disabled:cursor-not-allowed disabled:opacity-50">{pendingAction === 'protect' ? 'Marcando…' : 'Marcar protegido'}</button>
                  <p className="mt-1 text-[10px] leading-snug text-muted-foreground">Activo sensible: no tocar ni escanear sin autorización.</p>
                </div>
                <div>
                  <button onClick={markIgnored} disabled={Boolean(pendingAction)} className="w-full rounded-lg border border-border bg-muted/40 px-3 py-2 text-[10px] font-black uppercase text-muted-foreground hover:bg-muted/60 disabled:cursor-not-allowed disabled:opacity-50">{pendingAction === 'ignore' ? 'Ignorando…' : 'Ignorar'}</button>
                  <p className="mt-1 text-[10px] leading-snug text-muted-foreground">Falso positivo o irrelevante — sale de "Requiere atención", sigue visible en Ignorados.</p>
                </div>
              </div>
              {actionError && (
                <p className="mt-3 flex items-center gap-1.5 rounded-lg border border-rose-500/25 bg-rose-500/10 px-3 py-2 text-xs font-bold text-rose-300"><AlertTriangle size={14} className="shrink-0" /> {actionError}</p>
              )}
              <p className="mt-3 border-t border-border pt-2 text-[10px] leading-snug text-muted-foreground">Si fue una IP usada un momento y ya no aparece (como "{LIFECYCLE_LABEL.INACTIVE}"/"{LIFECYCLE_LABEL.STALE_REVIEW}" arriba), no necesitas ninguno de estos botones.</p>
            </div>
          </div>
        )}

        {query.data?.kind === 'PROTECTED_TARGET' && (
          <div className="mt-7 space-y-5">
            <div className="rounded-2xl border border-rose-500/25 bg-rose-500/[0.05] p-5">
              <div className="flex items-center gap-2 text-rose-300"><ShieldAlert size={16} /><p className="text-[11px] font-extrabold uppercase tracking-wider">Objetivo protegido (Greenbone)</p></div>
              <p className="mt-2 text-xs text-muted-foreground">{query.data.findingCount} hallazgo(s), severidad máxima {query.data.maxSeverity}.</p>
            </div>
            {(query.data.findings || []).map((finding) => (
              <div key={finding.title + finding.observedAt} className="rounded-xl border border-border bg-card p-3">
                <p className="text-sm font-bold">{finding.title}</p>
                <p className="mt-1 text-[11px] text-muted-foreground">Severidad {finding.severity} · {finding.observedAt ? new Date(finding.observedAt).toLocaleString('es-CO') : '—'}</p>
              </div>
            ))}
          </div>
        )}
    </>
  );
}

// spec: pestaña Inventario madura, mismo patrón maestro-detalle que Subredes
// (SubnetsView) — búsqueda + filtros a la izquierda sobre el conjunto COMPLETO de
// candidatos (antes: primeros 100 de 1046, sin paginación; `candidates` ahora se
// trae completo vía `getInventoryCandidates({ all: true })`), detalle a la derecha.
function InventoryView({ overview, candidates, source, state, onSourceChange, onStateChange, onRetry }) {
  const [search, setSearch] = useState('');
  const [selectedId, setSelectedId] = useState(null);
  const [expandedGroups, setExpandedGroups] = useState(() => new Set(['ATTENTION']));
  const data = overview.data;
  if (overview.isError || candidates.isError) return <EmptyState error onRetry={onRetry} />;
  const allRows = candidates.data?.items || [];
  const needle = search.trim().toLowerCase();
  const rows = allRows.filter((item) => !needle || [item.label, item.manufacturer, item.osFamily, item.assetClass, item.hostnameRaw, ...(item.referenceIps || [])].some((value) => String(value || '').toLowerCase().includes(needle)));
  const selected = rows.find((item) => item.id === selectedId) || rows[0] || null;
  const detail = useQuery({
    queryKey: ['cybersecurity-candidate', selected?.id],
    queryFn: () => cybersecurityService.getInventoryCandidate(selected.id),
    enabled: Boolean(selected?.id),
  });
  const stateTone = { CANONICAL: 'bg-emerald-500/10 text-emerald-300', PROTECTED_TARGET: 'bg-rose-500/10 text-rose-300', CONFLICT_REVIEW: 'bg-amber-500/10 text-amber-300', INSUFFICIENT_EVIDENCE: 'bg-slate-500/10 text-slate-300', IGNORED: 'bg-muted text-muted-foreground' };

  // Agrupación por tipo de activo (decisión del usuario 2026-09-16) en vez de una lista plana
  // muy larga — "Requiere atención" (conflicto real sin explicar + sospecha de sin antivirus)
  // va primero y arranca desplegada; el resto arranca plegado, mostrando solo el conteo.
  const groups = new Map();
  for (const item of rows) {
    const key = groupForCandidate(item);
    const bucket = groups.get(key) || [];
    bucket.push(item);
    groups.set(key, bucket);
  }
  const orderedGroups = GROUP_ORDER.map((key) => ({ key, items: groups.get(key) || [] })).filter((group) => group.items.length > 0);
  const toggleGroup = (key) => setExpandedGroups((current) => {
    const next = new Set(current);
    next.has(key) ? next.delete(key) : next.add(key);
    return next;
  });

  return (
    <>
      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        <MetricCard label="Observaciones" value={data?.totals.observedCandidates} detail={`${data?.totals.active || 0} con actividad reciente`} icon={Database} tone="blue" />
        <MetricCard label="Objetivos protegidos" value={data?.totals.protectedTargets} detail={`${data?.totals.findings || 0} hallazgos asociados`} icon={Fingerprint} tone="rose" />
        <MetricCard label="Pendientes de revisión" value={data?.totals.pendingReview} detail={`${data?.totals.conflicts || 0} conflictos detectados`} icon={ListChecks} tone="amber" />
        <MetricCard label="Activos canónicos" value={data?.totals.canonicalAssets} detail="Validados por identidad fuerte" icon={Boxes} tone="emerald" />
        {/* Ciberseguridad proactiva (2026-09-16): equipos Windows administrativos vistos en red
            pero nunca corroborados por Kaspersky — sospecha de falta de antivirus. */}
        <MetricCard label="Posible sin antivirus" value={candidates.data?.assessmentSummary?.ANTIVIRUS_GAP_SUSPECTED ?? 0} detail="Windows administrativo sin corroborar en Kaspersky" icon={ShieldAlert} tone="rose" />
      </section>

      <section className="rounded-2xl border border-border/80 bg-card/60 backdrop-blur-xl p-4">
        <div className="flex items-baseline gap-2">
          <p className="text-[11px] font-extrabold uppercase tracking-wider text-muted-foreground">Cobertura</p>
          <h2 className="text-base font-semibold">Fuentes conectadas</h2>
        </div>
        <div className="mt-3 grid gap-2.5 sm:grid-cols-3">
          {(data?.sourceCoverage || []).map((item) => (
            <div key={item.source} className="flex items-center justify-between gap-3 rounded-xl border border-border/70 bg-background/45 p-3">
              <div>
                <SourceBadge source={item.source} />
                <p className="mt-1.5 text-[11px] text-muted-foreground">Captura {item.capturedAt ? new Date(item.capturedAt).toLocaleString('es-CO') : 'sin fecha'} · {item.status}</p>
              </div>
              <span className="shrink-0 text-xl font-black">{item.candidates}</span>
            </div>
          ))}
        </div>
        <div className="mt-2.5 grid gap-2.5 sm:grid-cols-2">
          <div className="rounded-xl border border-amber-500/20 bg-amber-500/[0.06] p-3 text-xs leading-relaxed text-muted-foreground">
            La IP fija representa ubicación operativa, no identidad permanente. KSC tiene precedencia para Windows administrativo y FortiGate acredita actividad en red.
          </div>
          <div className="rounded-xl border border-blue-500/20 bg-blue-500/[0.06] p-3 text-xs leading-relaxed text-muted-foreground">
            <span className="font-bold text-foreground">{data?.totals.segmentsPendingPolicy || 0} observaciones</span> esperan clasificación de segmento antes de aplicar una política de IP fija o DHCP.
          </div>
        </div>
      </section>

      <section className="grid min-h-[650px] overflow-hidden rounded-2xl border border-border/80 bg-card/60 backdrop-blur-xl xl:grid-cols-[390px_1fr]">
        <aside className="border-b border-border xl:border-b-0 xl:border-r">
          <div className="border-b border-border p-4">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" size={16} />
              <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar por etiqueta, fabricante, IP, host…" className="w-full rounded-xl border border-border bg-background py-2.5 pl-9 pr-3 text-xs outline-none focus:border-blue-500/50" />
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              <select value={source} onChange={(event) => onSourceChange(event.target.value)} className="rounded-lg border border-border bg-background px-3 py-2 text-[11px]"><option value="">Todas las fuentes</option>{Object.entries(SOURCE_LABEL).map(([value,label]) => <option key={value} value={value}>{label}</option>)}</select>
              <select value={state} onChange={(event) => onStateChange(event.target.value)} className="rounded-lg border border-border bg-background px-3 py-2 text-[11px]"><option value="">Todos los estados</option>{Object.entries(INVENTORY_STATE_LABEL).map(([value,label]) => <option key={value} value={value}>{label}</option>)}</select>
            </div>
            <p className="mt-2 text-[10px] text-muted-foreground">{rows.length} de {candidates.data?.total ?? allRows.length} registros{candidates.isFetching ? ' · cargando…' : ''}</p>
          </div>
          <div className="max-h-[560px] divide-y divide-border/60 overflow-y-auto">
            {orderedGroups.map(({ key, items }) => {
              const expanded = expandedGroups.has(key);
              const GroupIcon = GROUP_ICON[key];
              const attentionGroup = key === 'ATTENTION';
              return (
                <div key={key}>
                  <button onClick={() => toggleGroup(key)} className={`flex w-full items-center justify-between gap-2 px-4 py-3.5 text-left transition-colors hover:bg-muted/25 ${attentionGroup ? 'bg-rose-500/[0.04]' : ''}`}>
                    <span className="flex min-w-0 items-center gap-2.5">
                      <GroupIcon size={18} className={attentionGroup ? 'shrink-0 text-rose-400' : 'shrink-0 text-muted-foreground'} />
                      <span className={`truncate text-sm font-extrabold uppercase tracking-wider ${attentionGroup ? 'text-rose-300' : 'text-foreground'}`}>{GROUP_LABEL[key]}</span>
                      <span className="shrink-0 rounded-full bg-muted px-2 py-0.5 text-[11px] font-black text-muted-foreground">{items.length}</span>
                    </span>
                    <ChevronRight size={16} className={`shrink-0 text-muted-foreground transition-transform ${expanded ? 'rotate-90' : ''}`} />
                  </button>
                  {expanded && items.map((item) => {
                    const active = selected?.id === item.id;
                    return (
                      <button key={item.id} onClick={() => setSelectedId(item.id)} className={`w-full border-t border-border/40 p-4 pl-9 text-left transition-colors ${active ? 'bg-blue-500/10 shadow-[inset_3px_0_0_#3b82f6]' : 'hover:bg-muted/35'}`}>
                        <div className="flex items-center gap-2">
                          <p className="truncate text-sm font-bold">{item.label}</p>
                          {item.antivirusGapSuspected && <ShieldAlert className="shrink-0 text-rose-400" size={15} />}
                          {item.reliability?.needsManualReview && <AlertTriangle className="shrink-0 text-rose-400" size={15} />}
                        </div>
                        <p className="mt-1 truncate text-[11px] text-muted-foreground"><SourceTag source={item.source} /> · {ASSET_CLASS_LABEL[item.assetClass] || item.assetClass}{item.hostnameRaw ? ` · ${item.hostnameRaw}` : ''}</p>
                        <div className="mt-2 flex items-center justify-between gap-2">
                          <span className={`shrink-0 rounded-full px-2 py-1 text-[9px] font-black uppercase ${stateTone[item.state] || 'bg-muted text-muted-foreground'}`}>{INVENTORY_STATE_LABEL[item.state] || item.state}</span>
                          {item.reliability && <span className={`shrink-0 rounded-full px-2 py-0.5 text-[9px] font-black uppercase ${RELIABILITY_TONE[item.reliability.label]}`}>{item.reliability.score}%</span>}
                        </div>
                        {item.reliability && <div className="mt-1.5"><ReliabilityMeter score={item.reliability.score} label={item.reliability.label} /></div>}
                      </button>
                    );
                  })}
                </div>
              );
            })}
            {rows.length === 0 && <div className="p-8 text-center text-xs text-muted-foreground">No hay candidatos que coincidan con la búsqueda.</div>}
          </div>
        </aside>
        <div className="p-5 lg:p-7">
          {!selected ? <div className="flex h-full items-center justify-center text-sm text-muted-foreground">Selecciona un candidato para ver su detalle.</div> : <CandidateDetailPane query={detail} onChanged={async () => { await Promise.all([onRetry(), detail.refetch()]); }} />}
        </div>
      </section>
    </>
  );
}

const NETWORK_FUNCTIONS = {
  TERRITORIAL_ACCESS: 'Acceso territorial a puntos de venta',
  TELECOM_BACKHAUL: 'Transporte / backhaul de telecomunicaciones',
  DEDICATED_SITE_LINK: 'Enlace dedicado a sitio u oficina',
  CORPORATE_LAN: 'LAN corporativa', CORPORATE_WIFI: 'Wi‑Fi corporativo interno',
  GUEST_WIFI: 'Wi‑Fi de invitados', SERVERS: 'Servidores y centro de datos',
  CCTV: 'CCTV y seguridad electrónica', MANAGEMENT: 'Gestión de infraestructura', OTHER: 'Otra función',
};

const ACCESS_TECHNOLOGIES = {
  WIRELESS_RADIO: 'Radioenlace inalámbrico', FORTIAP_WIFI: 'Wi‑Fi mediante FortiAP',
  ETHERNET: 'Ethernet / cableada', FIBER: 'Fibra óptica', HYBRID: 'Híbrida', UNKNOWN: 'Por determinar',
};

const NETWORK_TOPOLOGIES = {
  POINT_TO_POINT: 'Punto a punto', POINT_TO_MULTIPOINT: 'Punto a multipunto / celda',
  REDUNDANT_BACKHAUL: 'Backhaul redundante', ACCESS_LAN: 'LAN de acceso',
  WLAN: 'WLAN interna', MIXED: 'Mixta', UNKNOWN: 'Por determinar',
};

const SERVED_POPULATIONS = {
  POS: 'Puntos de venta', OFFICES: 'Oficinas o sedes', CORPORATE_USERS: 'Usuarios corporativos',
  GUESTS: 'Invitados', INFRASTRUCTURE: 'Equipos de infraestructura', SECURITY_DEVICES: 'Dispositivos de seguridad', MIXED: 'Población mixta',
};

// Historial de cambios de un segmento (network_policy_audit). `action` de savePolicy/
// saveDisposition; `after` trae el objeto completo salvo para CREATED/UPDATED donde también
// puede haber `before` para diferenciar qué cambió.
const AUDIT_ACTION_LABEL = {
  CREATED: 'Política creada', UPDATED: 'Política actualizada',
  NEEDS_SPLIT: 'Marcado: requiere desagregación', OUT_OF_SCOPE: 'Marcado: sin alcance',
};
const AUDIT_FIELD_LABEL = {
  name: 'Nombre', zone: 'Zona', networkFunction: 'Función de red', technology: 'Tecnología',
  topology: 'Topología', addressMode: 'Direccionamiento', population: 'Población',
  criticality: 'Criticidad', networkAddress: 'Dirección de red', prefixLength: 'Prefijo',
  gateway: 'Gateway', status: 'Estado', note: 'Nota',
};
function auditChanges(entry) {
  const after = entry.after || {};
  const before = entry.before || {};
  return Object.entries(after)
    .filter(([key, value]) => value != null && value !== '' && String(before[key] ?? '') !== String(value))
    .map(([key, value]) => ({ key, label: AUDIT_FIELD_LABEL[key] || key, value: key === 'prefixLength' ? `/${value}` : String(value) }));
}

function ipv4Number(value) {
  const parts = String(value || '').trim().split('.').map(Number);
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) return null;
  return parts.reduce((result, part) => ((result << 8) | part) >>> 0, 0);
}

function ipv4Text(value) { return [24, 16, 8, 0].map((shift) => (value >>> shift) & 255).join('.'); }

function calculateNetwork(address, prefixValue, gateway) {
  const ip = ipv4Number(address); const prefix = Number(prefixValue);
  if (ip === null || !Number.isInteger(prefix) || prefix < 0 || prefix > 32) return null;
  const mask = prefix === 0 ? 0 : (0xffffffff << (32 - prefix)) >>> 0;
  const network = (ip & mask) >>> 0; const totalAddresses = 2 ** (32 - prefix); const broadcast = (network + totalAddresses - 1) >>> 0;
  const gatewayNumber = gateway ? ipv4Number(gateway) : null;
  const gatewayValid = gatewayNumber !== null && gatewayNumber >= (prefix <= 30 ? network + 1 : network) && gatewayNumber <= (prefix <= 30 ? broadcast - 1 : broadcast);
  return { networkAddress: ipv4Text(network), netmask: ipv4Text(mask), broadcast: ipv4Text(broadcast), totalAddresses, usableHosts: prefix === 32 ? 1 : prefix === 31 ? 2 : Math.max(0, totalAddresses - 2), gatewayValid };
}

function suggestedPolicy(item, rows) {
  const cidr = item?.inferredCidr || '';
  let [networkAddress, inferredPrefix] = cidr.split('/');
  if (!networkAddress && item?.referenceIps?.[0]) {
    const facts = calculateNetwork(item.referenceIps[0], 24, '');
    networkAddress = facts?.networkAddress; inferredPrefix = networkAddress ? '24' : '';
  }
  const zone = item?.expectedZones?.[0] || '';
  const template = rows.find((candidate) => candidate.id !== item?.id && candidate.policy && zone && candidate.policy.zone === zone)?.policy || {};
  return {
    ...(networkAddress ? { networkAddress, prefixLength: Number(inferredPrefix) } : {}),
    ...(zone ? { zone } : {}),
    ...(item?.expectedPoints ? { networkFunction: 'TERRITORIAL_ACCESS', addressMode: 'STATIC', population: 'POS' } : {}),
    ...Object.fromEntries(['technology','topology','criticality'].filter((key) => template[key]).map((key) => [key, template[key]])),
  };
}

function SubnetsView({ query, drafts, onDraftChange, onRetry, onSave, onDisposition }) {
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState('ALL');
  const [selectedId, setSelectedId] = useState(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');
  const [showAudit, setShowAudit] = useState(false);
  if (query.isError) return <EmptyState error onRetry={onRetry} />;
  const rows = query.data?.items || [];
  const effectiveDraft = (item) => {
    const initial = { ...suggestedPolicy(item, rows), ...Object.fromEntries(Object.entries(item?.policy || {}).filter(([, value]) => value !== null)), ...(drafts[item?.id] || {}) };
    const template = rows.find((candidate) => candidate.id !== item?.id && candidate.policy?.zone === initial.zone)?.policy || {};
    for (const field of ['networkFunction','technology','topology','addressMode','population','criticality']) if (!initial[field] && template[field]) initial[field] = template[field];
    return initial;
  };
  const isComplete = (draft = {}) => Boolean(draft.zone && (draft.networkFunction || draft.role) && draft.technology && draft.topology && draft.addressMode && draft.networkAddress && Number.isInteger(Number(draft.prefixLength)) && draft.gateway && calculateNetwork(draft.networkAddress, draft.prefixLength, draft.gateway)?.gatewayValid);
  const classified = rows.filter((item) => item.classificationStatus === 'APPROVED').length;
  const impacted = rows.reduce((sum, item) => sum + ((effectiveDraft(item).networkFunction || effectiveDraft(item).role) ? item.observations : 0), 0);
  const update = (id, field, value) => onDraftChange(id, { ...drafts[id], [field]: value });
  const visibleRows = rows.filter((item) => {
    const complete = item.classificationStatus === 'APPROVED';
    const matchesFilter = filter === 'ALL' || (filter === 'COMPLETE' ? complete : filter === 'REVIEW' ? ['NEEDS_SPLIT','OUT_OF_SCOPE'].includes(item.classificationStatus) : filter === 'OBSERVATIONS' ? ['HOST_OBSERVATION','NO_IP_OBSERVATION'].includes(item.classificationStatus) : item.classificationStatus === 'PENDING');
    const needle = search.trim().toLowerCase();
    const matchesSearch = !needle || [item.interfaceName, item.label, ...(item.referenceIps || [])].some((value) => String(value || '').toLowerCase().includes(needle));
    return matchesFilter && matchesSearch;
  });
  const selected = visibleRows.find((item) => item.id === selectedId) || visibleRows[0] || null;
  // El historial de cambios se consulta con el id realmente mostrado (`selected`), no con el
  // crudo `selectedId`: si el usuario no ha hecho click todavía, `selected` cae al primero de
  // la lista filtrada pero `selectedId` sigue null — con el query keyed en `selectedId` nunca
  // se disparaba en ese caso.
  const audit = useQuery({ queryKey: ['cybersecurity-segment-audit', selected?.id], queryFn: () => cybersecurityService.getNetworkSegmentAudit(selected.id), enabled: Boolean(selected?.id) && showAudit });
  const draft = selected ? effectiveDraft(selected) : {};
  const network = calculateNetwork(draft.networkAddress, draft.prefixLength, draft.gateway);
  const occupiedEstimate = selected ? Math.max(selected.knownIpCount || 0, selected.expectedPoints || 0) : 0;
  const unobservedEstimate = network ? Math.max(0, network.usableHosts - occupiedEstimate) : null;
  const progress = rows.length ? Math.round((classified / rows.length) * 100) : 0;
  return (
    <>
      <section className="grid gap-4 sm:grid-cols-3 xl:grid-cols-[1fr_1fr_1.25fr]">
        <MetricCard label="Redes consolidadas" value={query.data?.total} detail={`${query.data?.observedTotal || 0} observadas · ${(query.data?.total || 0) - (query.data?.observedTotal || 0)} esperadas sin observar`} icon={Network} tone="blue" />
        <MetricCard label="Borradores completos" value={classified} detail={`${progress}% del inventario de red`} icon={ListChecks} tone="emerald" />
        <div className="rounded-2xl border border-amber-500/20 bg-gradient-to-br from-amber-500/15 to-transparent p-5">
          <div className="flex items-start justify-between"><div><p className="text-[11px] font-black uppercase tracking-[0.18em] text-muted-foreground">Cobertura prevista</p><p className="mt-2 text-3xl font-black">{impacted}</p><p className="mt-1 text-xs text-muted-foreground">observaciones bajo políticas definidas</p></div><Database className="text-amber-300" size={22} /></div>
          <div className="mt-4 h-2 overflow-hidden rounded-full bg-muted"><div className="h-full rounded-full bg-amber-400 transition-all" style={{ width: `${progress}%` }} /></div>
        </div>
      </section>
      <section className="grid min-h-[650px] overflow-hidden rounded-2xl border border-border/80 bg-card/60 backdrop-blur-xl xl:grid-cols-[390px_1fr]">
        <aside className="border-b border-border xl:border-b-0 xl:border-r">
          <div className="border-b border-border p-4">
            <div className="relative"><Search className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" size={16} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar interfaz, alias o IP" className="w-full rounded-xl border border-border bg-background py-2.5 pl-9 pr-3 text-xs outline-none focus:border-blue-500/50" /></div>
            <div className="mt-3 flex flex-wrap gap-2"><SlidersHorizontal className="mt-1.5 text-muted-foreground" size={15} />{[['ALL','Todos'],['PENDING','Pendientes'],['OBSERVATIONS','Observaciones'],['REVIEW','Por resolver'],['COMPLETE','Aplicados']].map(([value,label]) => <button key={value} onClick={() => setFilter(value)} className={`rounded-lg px-3 py-1.5 text-[10px] font-black ${filter === value ? 'bg-primary text-primary-foreground shadow-sm' : 'bg-muted/40 text-muted-foreground hover:text-foreground hover:bg-muted/60'}`}>{label}</button>)}</div>
          </div>
          <div className="max-h-[570px] divide-y divide-border/60 overflow-y-auto">
            {visibleRows.map((item) => {
              const itemDraft = effectiveDraft(item);
              const complete = item.classificationStatus === 'APPROVED';
              const active = selected?.id === item.id;
              const stateLabel = complete ? 'Aplicado' : item.classificationStatus === 'NEEDS_SPLIT' ? 'Desagregar' : item.classificationStatus === 'OUT_OF_SCOPE' ? 'Sin alcance' : item.classificationStatus === 'HOST_OBSERVATION' ? 'Host aislado' : item.classificationStatus === 'NO_IP_OBSERVATION' ? 'Sin IP' : 'Pendiente';
              return <button key={item.id} onClick={() => setSelectedId(item.id)} className={`w-full p-4 text-left transition-colors ${active ? 'bg-blue-500/10 shadow-[inset_3px_0_0_#3b82f6]' : 'hover:bg-muted/35'}`}><div className="flex items-start justify-between gap-3"><div className="min-w-0"><p className="truncate text-sm font-bold">{itemDraft.name || item.interfaceName || item.label}</p><p className="mt-1 truncate font-mono text-[10px] text-muted-foreground">{item.referenceIps?.join(' · ') || item.label}</p>{item.coverageStatus === 'EXPECTED_NOT_OBSERVED' && <p className="mt-1 text-[9px] font-black uppercase text-violet-300">Operación de Puntos · no observada en FortiGate</p>}</div><span className={`shrink-0 rounded-full px-2 py-1 text-[9px] font-black uppercase ${complete ? 'bg-emerald-500/10 text-emerald-300' : item.classificationStatus === 'NEEDS_SPLIT' ? 'bg-rose-500/10 text-rose-300' : item.classificationStatus === 'OUT_OF_SCOPE' ? 'bg-slate-500/10 text-slate-300' : 'bg-amber-500/10 text-amber-300'}`}>{stateLabel}</span></div><div className="mt-3 flex gap-3 text-[10px] text-muted-foreground"><span>{item.observations} observados</span><span>•</span><span>{item.expectedPoints || 0} puntos esperados</span></div></button>;
            })}
            {visibleRows.length === 0 && <div className="p-8 text-center text-xs text-muted-foreground">No hay segmentos que coincidan con la búsqueda.</div>}
          </div>
        </aside>
        <div className="p-5 lg:p-7">
          {!selected ? <div className="flex h-full items-center justify-center text-sm text-muted-foreground">Selecciona un segmento para comenzar.</div> : <>
            <div className="flex flex-col gap-4 border-b border-border pb-6 sm:flex-row sm:items-start sm:justify-between"><div><div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.18em] text-blue-400"><MapPin size={14} /> Contexto de red</div><h2 className="mt-2 text-2xl font-black">{draft.name || selected.interfaceName || selected.label}</h2><p className="mt-1 text-xs text-muted-foreground">{selected.label} · última actividad {selected.lastActivityAt ? new Date(selected.lastActivityAt).toLocaleString('es-CO') : 'desconocida'}</p></div><div className="flex shrink-0 items-center gap-2"><button onClick={() => setShowAudit(!showAudit)} className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-2 text-[10px] font-bold uppercase ${showAudit ? 'border-blue-500/30 bg-blue-500/10 text-blue-300' : 'border-border text-muted-foreground hover:text-foreground hover:bg-muted/50'}`}><History size={13} /> Historial</button><span className={`w-fit rounded-lg border px-3 py-2 text-[10px] font-black ${selected.classificationStatus === 'APPROVED' ? 'border-emerald-500/20 bg-emerald-500/[0.07] text-emerald-300' : 'border-amber-500/20 bg-amber-500/[0.07] text-amber-300'}`}>{selected.classificationStatus === 'APPROVED' ? 'POLÍTICA APLICADA' : 'BORRADOR LOCAL'}</span></div></div>
            {showAudit && (
              <div className="mt-5 rounded-xl border border-blue-500/20 bg-blue-500/[0.04] p-4">
                <p className="text-[11px] font-extrabold uppercase tracking-wider text-blue-400">Historial de cambios</p>
                {audit.isLoading && <p className="mt-3 text-xs text-muted-foreground">Cargando historial…</p>}
                {audit.isError && <p className="mt-3 text-xs text-rose-300">{audit.error?.message || 'No fue posible consultar el historial.'}</p>}
                {audit.data && (audit.data.items || []).length === 0 && <p className="mt-3 text-xs text-muted-foreground">Sin cambios registrados todavía para este segmento.</p>}
                {audit.data && (audit.data.items || []).length > 0 && (
                  <ol className="mt-3 space-y-3">
                    {audit.data.items.map((entry) => {
                      const changes = auditChanges(entry);
                      return (
                        <li key={entry.id} className="rounded-lg border border-border/60 bg-card/60 p-3">
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <span className="text-xs font-bold">{AUDIT_ACTION_LABEL[entry.action] || entry.action}</span>
                            <span className="text-[10px] text-muted-foreground">{new Date(entry.occurredAt).toLocaleString('es-CO')}</span>
                          </div>
                          <p className="mt-1 text-[10px] text-muted-foreground">Por {entry.actor ? entry.actor.slice(0, 8) : 'desconocido'}</p>
                          {changes.length > 0 && (
                            <div className="mt-2 flex flex-wrap gap-1.5">
                              {changes.map((change) => (
                                <span key={change.key} className="rounded-md border border-border/70 bg-muted/40 px-2 py-1 text-[10px] text-muted-foreground"><b className="text-foreground">{change.label}:</b> {change.value}</span>
                              ))}
                            </div>
                          )}
                        </li>
                      );
                    })}
                  </ol>
                )}
              </div>
            )}
            {selected.derivedFrom && <div className="mt-5 rounded-xl border border-amber-500/20 bg-amber-500/[0.07] p-4 text-xs text-amber-100"><b>Pendiente generado automáticamente.</b> Estas IP no coinciden todavía con ninguna subred aplicada y fueron separadas del grupo marcado para desagregación.</div>}
            {selected.reassignedObservations > 0 && <div className="mt-5 rounded-xl border border-emerald-500/20 bg-emerald-500/[0.07] p-4 text-xs text-emerald-100"><b>Consolidación automática:</b> {selected.reassignedObservations} observaciones procedentes de grupos desagregados coinciden con esta subred.</div>}
            {selected.coverageStatus === 'EXPECTED_NOT_OBSERVED' && <div className="mt-5 rounded-xl border border-violet-500/20 bg-violet-500/[0.07] p-4 text-xs text-violet-200"><b>Red esperada por Operación de Puntos.</b> No aparece en la captura actual de FortiGate. El CIDR {selected.inferredCidr} fue inferido por prefijo /24 y requiere confirmación.</div>}
            {!selected.policy && Object.keys(suggestedPolicy(selected, rows)).length > 0 && <div className="mt-5 rounded-xl border border-cyan-500/20 bg-cyan-500/[0.07] p-4 text-xs text-cyan-100"><b>Propuesta de Skylab.</b> Se precargaron datos deducidos de Operación de Puntos y de políticas confirmadas en la misma zona. Revisa máscara, gateway y arquitectura antes de aplicar.</div>}
            <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">{[['Observaciones FortiGate',selected.observations],['Puntos esperados',selected.expectedPoints || 0],['Puntos activos',selected.onlinePoints ?? selected.active],['MAC efímeras',selected.ephemeralMacs]].map(([label,value]) => <div key={label} className="rounded-xl border border-border bg-background/45 p-4"><p className="text-[10px] font-black uppercase tracking-wider text-muted-foreground">{label}</p><p className="mt-1 text-xl font-black">{value}</p></div>)}</div>
            <div className="mt-6"><p className="text-[10px] font-black uppercase tracking-wider text-muted-foreground">IP observadas de referencia</p><div className="mt-2 flex flex-wrap gap-2">{(selected.referenceIps || []).map((ip) => <span key={ip} className="rounded-lg border border-blue-500/20 bg-blue-500/[0.07] px-3 py-2 font-mono text-xs text-blue-200">{ip}</span>)}</div></div>
            <div className="mt-7 rounded-xl border border-border/70 bg-background/25 p-5"><p className="text-[10px] font-black uppercase tracking-[0.18em] text-blue-400">Identidad organizacional</p><div className="mt-4 grid gap-5 lg:grid-cols-2">
              <label className="text-xs font-bold">Nombre funcional<input value={draft.name || ''} onChange={(event) => update(selected.id, 'name', event.target.value)} placeholder="Ej. Red inalámbrica Pradera" maxLength={80} className="mt-2 w-full rounded-xl border border-border bg-background px-3 py-3 text-sm font-normal outline-none focus:border-blue-500/50" /></label>
              <label className="text-xs font-bold">Zona geográfica<input value={draft.zone || ''} onChange={(event) => update(selected.id, 'zone', event.target.value)} placeholder="Ej. Pradera, Rozo, Palmira o Sede principal" maxLength={80} className="mt-2 w-full rounded-xl border border-border bg-background px-3 py-3 text-sm font-normal outline-none focus:border-blue-500/50" /></label>
              <label className="text-xs font-bold lg:col-span-2">Función de red<select value={draft.networkFunction || draft.role || ''} onChange={(event) => update(selected.id, 'networkFunction', event.target.value)} className="mt-2 w-full rounded-xl border border-border bg-background px-3 py-3 text-sm font-normal"><option value="">Selecciona la función operativa</option>{Object.entries(NETWORK_FUNCTIONS).map(([value,label]) => <option key={value} value={value}>{label}</option>)}</select></label>
            </div></div>
            <div className="mt-5 rounded-xl border border-border/70 bg-background/25 p-5"><p className="text-[10px] font-black uppercase tracking-[0.18em] text-blue-400">Direccionamiento IPv4</p><div className="mt-4 grid gap-5 lg:grid-cols-3">
              <label className="text-xs font-bold">Dirección de red<input value={draft.networkAddress || ''} onChange={(event) => update(selected.id, 'networkAddress', event.target.value)} placeholder="Ej. 10.2.6.0" className="mt-2 w-full rounded-xl border border-border bg-background px-3 py-3 font-mono text-sm font-normal outline-none focus:border-blue-500/50" /></label>
              <label className="text-xs font-bold">Prefijo<select value={draft.prefixLength ?? ''} onChange={(event) => update(selected.id, 'prefixLength', Number(event.target.value))} className="mt-2 w-full rounded-xl border border-border bg-background px-3 py-3 text-sm font-normal"><option value="">Selecciona</option>{Array.from({ length: 25 }, (_, index) => index + 8).map((prefix) => <option key={prefix} value={prefix}>/{prefix}</option>)}</select></label>
              <label className="text-xs font-bold">Gateway<input value={draft.gateway || ''} onChange={(event) => update(selected.id, 'gateway', event.target.value)} placeholder="Ej. 10.2.6.1" className={`mt-2 w-full rounded-xl border bg-background px-3 py-3 font-mono text-sm font-normal outline-none ${draft.gateway && network && !network.gatewayValid ? 'border-rose-500/60' : 'border-border focus:border-blue-500/50'}`} /></label>
            </div>
            {network && <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-6">{[['Red normalizada',network.networkAddress],['Máscara',network.netmask],['Broadcast',network.broadcast],['Hosts usables',network.usableHosts],['IPs conocidas',occupiedEstimate],['Sin observar (estimado)',unobservedEstimate]].map(([label,value]) => <div key={label} className="rounded-xl border border-border bg-background/45 p-3"><p className="text-[9px] font-black uppercase tracking-wider text-muted-foreground">{label}</p><p className="mt-1 break-all font-mono text-sm font-black">{value}</p></div>)}</div>}
            {draft.gateway && network && !network.gatewayValid && <p className="mt-3 text-xs text-rose-300">El gateway debe ser una dirección de host válida dentro de esta subred.</p>}
            <p className="mt-3 text-[10px] text-muted-foreground">“Sin observar” es capacidad teórica menos IP conocidas; no garantiza que una dirección esté libre. La disponibilidad real requerirá DHCP, IPAM, ARP u otra fuente autoritativa.</p></div>
            <div className="mt-5 rounded-xl border border-border/70 bg-background/25 p-5"><p className="text-[10px] font-black uppercase tracking-[0.18em] text-blue-400">Arquitectura y operación</p><div className="mt-4 grid gap-5 lg:grid-cols-2">
              <label className="text-xs font-bold">Tecnología de acceso<select value={draft.technology || ''} onChange={(event) => update(selected.id, 'technology', event.target.value)} className="mt-2 w-full rounded-xl border border-border bg-background px-3 py-3 text-sm font-normal"><option value="">Selecciona una tecnología</option>{Object.entries(ACCESS_TECHNOLOGIES).map(([value,label]) => <option key={value} value={value}>{label}</option>)}</select></label>
              <label className="text-xs font-bold">Topología<select value={draft.topology || ''} onChange={(event) => update(selected.id, 'topology', event.target.value)} className="mt-2 w-full rounded-xl border border-border bg-background px-3 py-3 text-sm font-normal"><option value="">Selecciona una topología</option>{Object.entries(NETWORK_TOPOLOGIES).map(([value,label]) => <option key={value} value={value}>{label}</option>)}</select></label>
              <label className="text-xs font-bold">Direccionamiento<select value={draft.addressMode || ''} onChange={(event) => update(selected.id, 'addressMode', event.target.value)} className="mt-2 w-full rounded-xl border border-border bg-background px-3 py-3 text-sm font-normal"><option value="">Selecciona una política</option><option value="STATIC">IP fija</option><option value="DHCP">DHCP</option><option value="MIXED">Mixto</option></select></label>
              <label className="text-xs font-bold">Población atendida<select value={draft.population || ''} onChange={(event) => update(selected.id, 'population', event.target.value)} className="mt-2 w-full rounded-xl border border-border bg-background px-3 py-3 text-sm font-normal"><option value="">Selecciona una población</option>{Object.entries(SERVED_POPULATIONS).map(([value,label]) => <option key={value} value={value}>{label}</option>)}</select></label>
              <label className="text-xs font-bold lg:col-span-2">Criticidad<select value={draft.criticality || 'MEDIUM'} onChange={(event) => update(selected.id, 'criticality', event.target.value)} className="mt-2 w-full rounded-xl border border-border bg-background px-3 py-3 text-sm font-normal"><option value="LOW">Baja</option><option value="MEDIUM">Media</option><option value="HIGH">Alta</option><option value="CRITICAL">Crítica</option></select></label>
            </div></div>
            <div className="mt-7 rounded-2xl border border-blue-500/20 bg-blue-500/[0.06] p-5"><p className="text-[11px] font-extrabold uppercase tracking-wider text-blue-600 dark:text-blue-300">Vista previa de la política</p><p className="mt-2 text-sm leading-relaxed text-muted-foreground">{draft.addressMode === 'DHCP' ? 'La IP tendrá peso mínimo para identificar equipos; se priorizarán agentes, hostname e identificadores persistentes.' : draft.addressMode === 'STATIC' ? 'La IP aportará contexto operativo fuerte, pero nunca fusionará dos equipos por sí sola.' : draft.addressMode === 'MIXED' ? 'Se aplicará conciliación conservadora y los cambios de IP requerirán evidencia corroborante.' : 'Selecciona el direccionamiento para conocer cómo cambiará la conciliación.'}</p><p className="mt-3 text-xs font-bold">Impacto: {selected.observations} observaciones · no crea activos automáticamente.</p></div>
            <div className="mt-5 flex flex-col gap-3 border-t border-border pt-5 lg:flex-row lg:items-center lg:justify-between"><div className="flex flex-wrap gap-2"><button disabled={saving} onClick={async () => { setSaving(true); setSaveError(''); try { await onDisposition(selected.id, 'NEEDS_SPLIT'); } catch (error) { setSaveError(error.message); } finally { setSaving(false); } }} className="rounded-xl border border-rose-500/25 bg-rose-500/[0.06] px-4 py-3 text-[10px] font-black uppercase text-rose-300 hover:bg-rose-500/10">Requiere desagregación</button><button disabled={saving} onClick={async () => { setSaving(true); setSaveError(''); try { await onDisposition(selected.id, 'OUT_OF_SCOPE'); } catch (error) { setSaveError(error.message); } finally { setSaving(false); } }} className="rounded-xl border border-border bg-muted/30 px-4 py-3 text-[10px] font-black uppercase text-muted-foreground hover:text-foreground">No tengo alcance</button></div><div className="flex flex-col items-end gap-2">{saveError && <p className="text-xs text-rose-300">{saveError}</p>}<button disabled={!isComplete(draft) || saving} onClick={async () => { setSaving(true); setSaveError(''); try { await onSave(selected.id, draft); } catch (error) { setSaveError(error.message); } finally { setSaving(false); } }} className="rounded-xl bg-blue-600 px-5 py-3 text-[11px] font-extrabold uppercase tracking-wider text-white shadow-lg shadow-blue-950/30 hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-40">{saving ? 'Guardando…' : selected.classificationStatus === 'APPROVED' ? 'Actualizar política' : 'Aplicar clasificación'}</button></div></div>
          </>}
        </div>
      </section>
    </>
  );
}

export default function CybersecurityDashboard() {
  const [activeView, setActiveView] = useState('posture');
  const [priority, setPriority] = useState('');
  const [status, setStatus] = useState('');
  const [inventorySource, setInventorySource] = useState('');
  const [inventoryState, setInventoryState] = useState('');
  const [selectedCase, setSelectedCase] = useState(null);
  const [segmentDrafts, setSegmentDrafts] = useState(() => {
    try { return JSON.parse(localStorage.getItem('skylab-cyber-segment-drafts') || '{}'); } catch { return {}; }
  });
  useEffect(() => { localStorage.setItem('skylab-cyber-segment-drafts', JSON.stringify(segmentDrafts)); }, [segmentDrafts]);
  const overview = useQuery({ queryKey: ['cybersecurity-overview'], queryFn: cybersecurityService.getOverview });
  const cases = useQuery({
    queryKey: ['cybersecurity-cases', priority, status],
    queryFn: () => cybersecurityService.getCases({ priority, status }),
  });
  const inventoryOverview = useQuery({ queryKey: ['cybersecurity-inventory-overview'], queryFn: cybersecurityService.getInventoryOverview });
  const inventoryCandidates = useQuery({
    queryKey: ['cybersecurity-inventory-candidates', inventorySource, inventoryState],
    queryFn: () => cybersecurityService.getInventoryCandidates({ source: inventorySource, state: inventoryState, all: true }),
  });
  const networkSegments = useQuery({ queryKey: ['cybersecurity-admin-network-segments'], queryFn: cybersecurityService.getAdminNetworkSegments });
  const refresh = () => {
    if (activeView === 'inventory') { inventoryOverview.refetch(); inventoryCandidates.refetch(); }
    else if (activeView === 'subnets') networkSegments.refetch();
    else { overview.refetch(); cases.refetch(); }
  };
  const data = overview.data;

  return (
    <div className="h-full overflow-y-auto bg-[radial-gradient(circle_at_top_right,rgba(37,99,235,0.10),transparent_34%)] p-4 lg:p-6">
      <div className="mx-auto max-w-[1900px] space-y-5">
        <PageHeader
          icon={
            <div className="hidden h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-tr from-blue-600 to-indigo-600 text-white shadow-inner sm:flex">
              <ShieldCheck size={24} />
            </div>
          }
          title={activeView === 'inventory' ? 'Inventario de activos' : activeView === 'subnets' ? 'Clasificación de subredes' : 'Postura y remediación'}
          subtitle={activeView === 'inventory' ? 'Observaciones, candidatos y activos canónicos conciliados sin convertir direcciones temporales en identidad.' : activeView === 'subnets' ? 'Define el contexto operativo de cada segmento protegido y revisa su impacto antes de aplicar políticas.' : 'Hallazgos normalizados, agrupados por causa técnica y priorizados sin exponer identificadores sensibles.'}
          actions={
            <button onClick={refresh} className="inline-flex items-center justify-center gap-2 rounded-xl border border-border bg-card px-4 py-2.5 text-[11px] font-bold uppercase tracking-wider hover:bg-muted"><RefreshCw size={15} className={(overview.isFetching || cases.isFetching || inventoryOverview.isFetching || inventoryCandidates.isFetching) ? 'animate-spin' : ''} /> Actualizar</button>
          }
        />

        <nav className="flex w-fit gap-1 rounded-xl border border-border bg-card/70 p-1">
          <button onClick={() => setActiveView('posture')} className={`rounded-lg px-4 py-2 text-xs font-bold transition-colors ${activeView === 'posture' ? 'bg-primary text-primary-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground hover:bg-muted/50'}`}>Postura y remediación</button>
          <button onClick={() => setActiveView('inventory')} className={`rounded-lg px-4 py-2 text-xs font-bold transition-colors ${activeView === 'inventory' ? 'bg-primary text-primary-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground hover:bg-muted/50'}`}>Inventario</button>
          <button onClick={() => setActiveView('subnets')} className={`rounded-lg px-4 py-2 text-xs font-bold transition-colors ${activeView === 'subnets' ? 'bg-primary text-primary-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground hover:bg-muted/50'}`}>Subredes</button>
        </nav>

        {activeView === 'inventory' ? (
          <InventoryView overview={inventoryOverview} candidates={inventoryCandidates} source={inventorySource} state={inventoryState} onSourceChange={setInventorySource} onStateChange={setInventoryState} onRetry={refresh} />
        ) : activeView === 'subnets' ? (
          <SubnetsView query={networkSegments} drafts={segmentDrafts} onDraftChange={(id, value) => setSegmentDrafts((current) => ({ ...current, [id]: value }))} onRetry={refresh} onSave={async (id, policy) => { await cybersecurityService.saveNetworkSegmentPolicy(id, policy); setSegmentDrafts((current) => { const next = { ...current }; delete next[id]; return next; }); await networkSegments.refetch(); }} onDisposition={async (id, status) => { await cybersecurityService.saveNetworkSegmentDisposition(id, { status }); setSegmentDrafts((current) => { const next = { ...current }; delete next[id]; return next; }); await networkSegments.refetch(); }} />
        ) : <>
        <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <MetricCard label="Casos abiertos" value={data?.cases.open} detail={`${data?.cases.total ?? 0} casos totales`} icon={ShieldAlert} tone="blue" />
          <MetricCard label="Prioridad P1" value={data?.cases.critical} detail={`Severidad máxima ${data?.cases.maxSeverity?.toFixed(1) ?? '0.0'}`} icon={AlertTriangle} tone="rose" />
          <MetricCard label="Por validar" value={data?.cases.validationRequired} detail="Confianza técnica insuficiente" icon={FileSearch} tone="amber" />
          <MetricCard label="Evidencias" value={data?.findings.total} detail={`${data?.findings.confirmedCandidate ?? 0} candidatas confirmadas`} icon={Fingerprint} tone="emerald" />
        </section>

        <section className="grid gap-5 xl:grid-cols-[0.85fr_2.15fr]">
          <div className="rounded-2xl border border-border/80 bg-card/60 backdrop-blur-xl p-6">
            <div className="flex items-center justify-between"><div><p className="text-[11px] font-extrabold uppercase tracking-wider text-muted-foreground">Distribución</p><h2 className="mt-1 text-base font-semibold">Prioridad técnica</h2></div><Radar className="text-blue-400" size={22} /></div>
            <div className="mt-6 space-y-4">
              {['P1', 'P2', 'P3', 'P4'].map((key) => {
                const count = data?.cases.byPriority?.[key] || 0;
                const total = Math.max(data?.cases.total || 0, 1);
                return <div key={key}><div className="mb-1.5 flex justify-between text-xs"><span className="font-black">{key}</span><span className="text-muted-foreground">{count}</span></div><div className="h-2 overflow-hidden rounded-full bg-muted"><div className={`h-full rounded-full ${key === 'P1' ? 'bg-rose-500' : key === 'P2' ? 'bg-orange-500' : key === 'P3' ? 'bg-amber-500' : 'bg-sky-500'}`} style={{ width: `${(count / total) * 100}%` }} /></div></div>;
              })}
            </div>
            <div className="mt-6 rounded-xl border border-border/70 bg-background/50 p-4 text-xs text-muted-foreground"><Clock3 className="mb-2 text-blue-400" size={17} />Último escaneo: <span className="font-bold text-foreground">{data?.latestScan ? new Date(data.latestScan.capturedAt).toLocaleString('es-CO') : 'sin capturas'}</span></div>
          </div>

          <div className="overflow-hidden rounded-2xl border border-border/80 bg-card/60 backdrop-blur-xl">
            <div className="flex flex-col gap-4 border-b border-border p-5 lg:flex-row lg:items-center lg:justify-between">
              <div><p className="text-[11px] font-extrabold uppercase tracking-wider text-muted-foreground">Bandeja operativa</p><h2 className="mt-1 text-base font-semibold">Casos de remediación</h2></div>
              <div className="flex flex-wrap gap-2">
                <select value={priority} onChange={(event) => setPriority(event.target.value)} className="rounded-lg border border-border bg-background px-3 py-2 text-xs"><option value="">Todas las prioridades</option>{['P1','P2','P3','P4'].map((item) => <option key={item}>{item}</option>)}</select>
                <select value={status} onChange={(event) => setStatus(event.target.value)} className="rounded-lg border border-border bg-background px-3 py-2 text-xs"><option value="">Todos los estados</option>{Object.entries(STATUS_LABEL).map(([value,label]) => <option key={value} value={value}>{label}</option>)}</select>
              </div>
            </div>
            {(overview.isError || cases.isError) ? <div className="p-5"><EmptyState error onRetry={refresh} /></div> : cases.data?.items?.length === 0 ? <div className="p-5"><EmptyState /></div> : (
              <div className="divide-y divide-border/70">
                {(cases.data?.items || []).map((item) => (
                  <button key={item.id} onClick={() => setSelectedCase(item.id)} className="grid w-full gap-3 p-5 text-left transition-colors hover:bg-muted/40 lg:grid-cols-[auto_1fr_auto_auto] lg:items-center">
                    <span className={`w-fit rounded-lg border px-2.5 py-1 text-xs font-black ${PRIORITY_STYLE[item.priority]}`}>{item.priority}</span>
                    <div className="min-w-0"><p className="truncate font-bold">{item.title}</p><p className="mt-1 truncate text-xs text-muted-foreground">{item.asset} · {item.findingCount} evidencia{item.findingCount === 1 ? '' : 's'}</p></div>
                    <div className="flex items-center gap-2 text-xs"><span className="font-black">{item.maxSeverity.toFixed(1)}</span><span className="rounded-md bg-muted px-2 py-1 text-[10px] font-bold text-muted-foreground">{STATUS_LABEL[item.status] || item.status}</span></div>
                    <ChevronRight className="hidden text-muted-foreground lg:block" size={18} />
                  </button>
                ))}
              </div>
            )}
          </div>
        </section>
        </>}

        <section className="flex flex-col gap-3 rounded-2xl border border-emerald-500/20 bg-emerald-500/[0.06] p-5 text-sm sm:flex-row sm:items-center sm:justify-between"><div className="flex items-start gap-3"><CheckCircle2 className="mt-0.5 shrink-0 text-emerald-400" size={20} /><div><p className="font-bold">Canal protegido activo en el diseño</p><p className="mt-1 text-xs text-muted-foreground">La interfaz consume una API read-only; no accede a Greenbone ni a SQLite desde el navegador.</p></div></div><span className="inline-flex items-center gap-1 text-[11px] font-extrabold uppercase tracking-wider text-emerald-300">Arquitectura segura <ArrowRight size={14} /></span></section>
      </div>
      <CaseDetail caseId={selectedCase} onClose={() => setSelectedCase(null)} />
    </div>
  );
}
