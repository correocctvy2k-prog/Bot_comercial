import { createElement, useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  AlertTriangle, ArrowRight, CheckCircle2, ChevronRight, Clock3,
  Boxes, Database, FileSearch, Fingerprint, ListChecks, MapPin, Network, Radar, RefreshCw,
  Search, ShieldAlert, ShieldCheck, SlidersHorizontal, X,
} from 'lucide-react';
import { cybersecurityService } from '../services/cybersecurity.service';

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

const INVENTORY_STATE_LABEL = {
  NEW_ASSET_REVIEW: 'Nuevo por revisar', EPHEMERAL_REVIEW: 'Identidad efímera',
  CONFLICT_REVIEW: 'Conflicto', INSUFFICIENT_EVIDENCE: 'Evidencia insuficiente',
  PROTECTED_TARGET: 'Objetivo protegido', CANONICAL: 'Activo canónico',
};

const LIFECYCLE_LABEL = {
  ACTIVE: 'Activo', INTERMITTENT: 'Intermitente', INACTIVE: 'Inactivo',
  STALE_REVIEW: 'Revisar antigüedad', UNKNOWN: 'Sin actividad conocida',
};

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

function MetricCard({ label, value, detail, icon, tone = 'blue' }) {
  const tones = {
    rose: 'from-rose-500/15 text-rose-300 border-rose-500/20',
    amber: 'from-amber-500/15 text-amber-300 border-amber-500/20',
    blue: 'from-blue-500/15 text-blue-300 border-blue-500/20',
    emerald: 'from-emerald-500/15 text-emerald-300 border-emerald-500/20',
  };
  return (
    <div className={`rounded-2xl border bg-gradient-to-br ${tones[tone]} to-transparent p-5 shadow-sm`}>
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-[11px] font-black uppercase tracking-[0.18em] text-muted-foreground">{label}</p>
          <p className="mt-2 text-3xl font-black tracking-tight text-foreground">{value ?? '—'}</p>
          <p className="mt-1 text-xs text-muted-foreground">{detail}</p>
        </div>
        <span className="rounded-xl border border-current/15 bg-black/10 p-2.5">{createElement(icon, { size: 20 })}</span>
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
              <p className="text-xs font-black uppercase tracking-wider text-muted-foreground">Activo y tratamiento</p>
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
                    {finding.evidence?.text && <p className="mt-4 max-h-32 overflow-y-auto whitespace-pre-wrap rounded-lg bg-black/15 p-3 text-xs leading-relaxed text-muted-foreground">{finding.evidence.text}</p>}
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

function CandidateDetail({ candidateId, onClose }) {
  const query = useQuery({
    queryKey: ['cybersecurity-candidate', candidateId],
    queryFn: () => cybersecurityService.getInventoryCandidate(candidateId),
    enabled: Boolean(candidateId),
  });
  if (!candidateId) return null;
  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/55 backdrop-blur-sm" onMouseDown={onClose}>
      <aside className="h-full w-full max-w-2xl overflow-y-auto border-l border-border bg-background p-7 shadow-2xl" onMouseDown={(event) => event.stopPropagation()}>
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-[10px] font-black uppercase tracking-[0.2em] text-blue-400">Detalle de candidato</p>
            <h2 className="mt-2 text-2xl font-black tracking-tight">{query.data?.label || 'Cargando candidato…'}</h2>
          </div>
          <button onClick={onClose} className="rounded-xl border border-border p-2 hover:bg-muted" aria-label="Cerrar detalle"><X size={18} /></button>
        </div>
        {query.isError && <EmptyState error onRetry={query.refetch} />}
        {query.isLoading && <div className="mt-7 text-center text-muted-foreground">Cargando detalle…</div>}
        {query.data && (
          <div className="mt-7 space-y-6">
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <div className="rounded-xl border border-border bg-card p-3"><p className="text-[10px] uppercase text-muted-foreground">Fuente</p><p className="mt-1 font-black">{query.data.source}</p></div>
              <div className="rounded-xl border border-border bg-card p-3"><p className="text-[10px] uppercase text-muted-foreground">Estado</p><p className="mt-1 font-black">{query.data.state}</p></div>
              <div className="rounded-xl border border-border bg-card p-3"><p className="text-[10px] uppercase text-muted-foreground">Confianza</p><p className="mt-1 font-black">{(query.data.confidence * 100).toFixed(0)}%</p></div>
              <div className="rounded-xl border border-border bg-card p-3"><p className="text-[10px] uppercase text-muted-foreground">Fuerza identidad</p><p className="mt-1 font-black">{query.data.identityStrength}</p></div>
            </div>
            <div className="rounded-2xl border border-border bg-card/60 p-5">
              <p className="text-xs font-black uppercase tracking-wider text-muted-foreground">Identidad y clasificación</p>
              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                <div className="rounded-xl border border-border bg-card p-3"><p className="text-[10px] uppercase text-muted-foreground">Clase de activo</p><p className="mt-1 font-black">{query.data.assetClass}</p></div>
                <div className="rounded-xl border border-border bg-card p-3"><p className="text-[10px] uppercase text-muted-foreground">Fabricante</p><p className="mt-1 font-black">{query.data.manufacturer || '—'}</p></div>
                <div className="rounded-xl border border-border bg-card p-3"><p className="text-[10px] uppercase text-muted-foreground">OS</p><p className="mt-1 font-black">{query.data.osFamily || '—'} {query.data.osVersion || ''}</p></div>
                <div className="rounded-xl border border-border bg-card p-3"><p className="text-[10px] uppercase text-muted-foreground">MAC</p><p className="mt-1 font-black font-mono text-xs">{query.data.macValue || '—'}</p></div>
                <div className="rounded-xl border border-border bg-card p-3"><p className="text-[10px] uppercase text-muted-foreground">IP observada</p><p className="mt-1 font-black font-mono text-xs">{query.data.ipValue || '—'}</p></div>
                <div className="rounded-xl border border-border bg-card p-3"><p className="text-[10px] uppercase text-muted-foreground">Hostname</p><p className="mt-1 font-black font-mono text-xs truncate">{query.data.hostnameRaw || '—'}</p></div>
              </div>
            </div>
            <div className="rounded-2xl border border-border bg-card/60 p-5">
              <p className="text-xs font-black uppercase tracking-wider text-muted-foreground">Análisis de confianza</p>
              <div className="mt-3 grid gap-3 sm:grid-cols-3">
                <div className="rounded-xl border border-border bg-card p-3"><p className="text-[10px] uppercase text-muted-foreground">Confianza</p><p className="mt-1 font-black text-3xl">{(query.data.confidence * 100).toFixed(0)}%</p></div>
                <div className="rounded-xl border border-border bg-card p-3"><p className="text-[10px] uppercase text-muted-foreground">Fuerza identidad</p><p className="mt-1 font-black text-3xl">{query.data.identityStrength}</p></div>
                <div className="rounded-xl border border-border bg-card p-3"><p className="text-[10px] uppercase text-muted-foreground">Autoridad</p><p className="mt-1 font-black text-3xl">{query.data.sourceAuthority}</p></div>
              </div>
              <div className="mt-4 grid gap-2 sm:grid-cols-2">
                <div className="rounded-xl border border-border bg-card p-3"><p className="text-[10px] uppercase text-muted-foreground">Política de identidad</p><p className="mt-1 font-black text-sm">{query.data.identityPolicy}</p></div>
                <div className="rounded-xl border border-border bg-card p-3"><p className="text-[10px] uppercase text-muted-foreground">Regla de red</p><p className="mt-1 font-black text-sm">{query.data.networkIdentityRule}</p></div>
              </div>
            </div>
            <div className="rounded-2xl border border-border bg-card/60 p-5">
              <p className="text-xs font-black uppercase tracking-wider text-muted-foreground">Señales de calidad</p>
              <div className="mt-3 flex flex-wrap gap-2">
                {(query.data.qualityFlags || []).map((flag) => (
                  <span key={flag} className="rounded-lg border border-amber-500/20 bg-amber-500/10 px-2 py-1 text-[10px] font-bold text-amber-300">{flag.replaceAll('_', ' ')}</span>
                ))}
              </div>
              {(query.data.reasonCodes || []).length > 0 && (
                <div className="mt-3">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Códigos de razón</p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {(query.data.reasonCodes || []).map((code) => (
                      <span key={code} className="rounded-lg border border-rose-500/20 bg-rose-500/10 px-2 py-1 text-[9px] font-bold text-rose-300">{code.replaceAll('_', ' ')}</span>
                    ))}
                  </div>
                </div>
              )}
            </div>
            <div className="rounded-2xl border border-border bg-card/60 p-5">
              <p className="text-xs font-black uppercase tracking-wider text-muted-foreground">Actividad y señales</p>
              <div className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                <div className="rounded-xl border border-border bg-card p-3"><p className="text-[10px] uppercase text-muted-foreground">Última señal</p><p className="mt-1 font-black">{query.data.lastSeenAt ? new Date(query.data.lastSeenAt).toLocaleString('es-CO') : '—'}</p></div>
                <div className="rounded-xl border border-border bg-card p-3"><p className="text-[10px] uppercase text-muted-foreground">Última fuente</p><p className="mt-1 font-black">{query.data.lastSeenSourceAt ? new Date(query.data.lastSeenSourceAt).toLocaleString('es-CO') : '—'}</p></div>
                <div className="rounded-xl border border-border bg-card p-3"><p className="text-[10px] uppercase text-muted-foreground">Primera vista</p><p className="mt-1 font-black">{query.data.firstSeenSourceAt ? new Date(query.data.firstSeenSourceAt).toLocaleString('es-CO') : '—'}</p></div>
                <div className="rounded-xl border border-border bg-card p-3"><p className="text-[10px] uppercase text-muted-foreground">Segundos vistos</p><p className="mt-1 font-black">{query.data.sourceSeenSeconds ?? '—'}</p></div>
              </div>
            </div>
            <div className="rounded-2xl border border-border bg-card/60 p-5">
              <p className="text-xs font-black uppercase tracking-wider text-muted-foreground">Análisis de inventario</p>
              {query.data.analysis ? (
                <div className="mt-3 grid gap-3 sm:grid-cols-2">
                  <div className="rounded-xl border border-border bg-card p-3"><p className="text-[10px] uppercase text-muted-foreground">Clase provisional</p><p className="mt-1 font-black">{query.data.analysis.provisionalAssetClass}</p></div>
                  <div className="rounded-xl border border-border bg-card p-3"><p className="text-[10px] uppercase text-muted-foreground">Fuerza identidad</p><p className="mt-1 font-black">{query.data.analysis.identityStrength}</p></div>
                  <div className="rounded-xl border border-border bg-card p-3"><p className="text-[10px] uppercase text-muted-foreground">Acción propuesta</p><p className="mt-1 font-black">{query.data.analysis.proposedAction}</p></div>
                  <div className="rounded-xl border border-border bg-card p-3"><p className="text-[10px] uppercase text-muted-foreground">Confianza análisis</p><p className="mt-1 font-black">{(query.data.analysis.confidence * 100).toFixed(0)}%</p></div>
                  <div className="rounded-xl border border-border bg-card p-3"><p className="text-[10px] uppercase text-muted-foreground">Códigos de razón</p>
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {(query.data.analysis.reasonCodes || []).map((code) => (
                        <span key={code} className="rounded-lg border border-amber-500/20 bg-amber-500/10 px-2 py-1 text-[9px] font-bold text-amber-300">{code.replaceAll('_', ' ')}</span>
                      ))}
                    </div>
                  </div>
                </div>
              ) : (
                <p className="mt-3 text-sm text-muted-foreground">Sin análisis de inventario disponible para esta observación.</p>
              )}
            </div>
            <div className="mt-6 flex flex-col gap-3 border-t border-border pt-5 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex flex-wrap gap-2">
                <button
                  onClick={async () => {
                    try {
                      await cybersecurityService.promoteInventoryCandidate(query.data.id, { assetClass: 'OTHER', criticality: 'MEDIUM', canonicalName: `Activo promovido ${query.data.label}` });
                      alert('Candidato promovido a activo canónico');
                    } catch (error) {
                      alert('Error: ' + error.message);
                    }
                  }}
                  className="rounded-xl border border-emerald-500/25 bg-emerald-500/10 px-4 py-2.5 text-xs font-black uppercase text-emerald-300 hover:bg-emerald-500/15"
                >
                  Promover a canónico
                </button>
                <button
                  onClick={async () => {
                    try {
                      await cybersecurityService.markInventoryCandidateAsConflict(query.data.id, {});
                      alert('Candidato marcado como conflicto');
                    } catch (error) {
                      alert('Error: ' + error.message);
                    }
                  }}
                  className="rounded-xl border border-amber-500/25 bg-amber-500/10 px-4 py-2.5 text-[10px] font-black uppercase text-amber-300 hover:bg-amber-500/10"
                >
                  Marcar conflicto
                </button>
                <button
                  onClick={async () => {
                    try {
                      await cybersecurityService.markInventoryCandidateAsProtected(query.data.id, {});
                      alert('Candidato marcado como objetivo protegido');
                    } catch (error) {
                      alert('Error: ' + error.message);
                    }
                  }}
                  className="rounded-xl border border-rose-500/25 bg-rose-500/10 px-4 py-2.5 text-[10px] font-black uppercase text-rose-300 hover:bg-rose-500/10"
                >
                  Marcar protegido
                </button>
              </div>
            </div>
          </div>
        )}
      </aside>
    </div>
  );
}

function InventoryView({ overview, candidates, source, state, onSourceChange, onStateChange, onRetry, onSelectCandidate }) {
  const data = overview.data;
  const rows = candidates.data?.items || [];
  if (overview.isError || candidates.isError) return <EmptyState error onRetry={onRetry} />;
  return (
    <>
      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard label="Observaciones" value={data?.totals.observedCandidates} detail={`${data?.totals.active || 0} con actividad reciente`} icon={Database} tone="blue" />
        <MetricCard label="Objetivos protegidos" value={data?.totals.protectedTargets} detail={`${data?.totals.findings || 0} hallazgos asociados`} icon={Fingerprint} tone="rose" />
        <MetricCard label="Pendientes de revisión" value={data?.totals.pendingReview} detail={`${data?.totals.conflicts || 0} conflictos detectados`} icon={ListChecks} tone="amber" />
        <MetricCard label="Activos canónicos" value={data?.totals.canonicalAssets} detail="Validados por identidad fuerte" icon={Boxes} tone="emerald" />
      </section>

      <section className="grid gap-5 xl:grid-cols-[0.8fr_2.2fr]">
        <div className="rounded-2xl border border-border bg-card/65 p-6">
          <p className="text-xs font-black uppercase tracking-wider text-muted-foreground">Cobertura</p>
          <h2 className="mt-1 text-lg font-black">Fuentes conectadas</h2>
          <div className="mt-5 space-y-3">
            {(data?.sourceCoverage || []).map((item) => (
              <div key={item.source} className="rounded-xl border border-border/70 bg-background/45 p-4">
                <div className="flex items-center justify-between gap-3"><span className="font-bold">{SOURCE_LABEL[item.source] || item.source}</span><span className="text-lg font-black">{item.candidates}</span></div>
                <p className="mt-1 text-[11px] text-muted-foreground">Captura {item.capturedAt ? new Date(item.capturedAt).toLocaleString('es-CO') : 'sin fecha'} · {item.status}</p>
              </div>
            ))}
          </div>
          <div className="mt-5 rounded-xl border border-amber-500/20 bg-amber-500/[0.06] p-4 text-xs leading-relaxed text-muted-foreground">
            La IP fija representa ubicación operativa, no identidad permanente. KSC tiene precedencia para Windows administrativo y FortiGate acredita actividad en red.
          </div>
          <div className="mt-3 rounded-xl border border-blue-500/20 bg-blue-500/[0.06] p-4 text-xs leading-relaxed text-muted-foreground">
            <span className="font-bold text-foreground">{data?.totals.segmentsPendingPolicy || 0} observaciones</span> esperan clasificación de segmento antes de aplicar una política de IP fija o DHCP.
          </div>
        </div>

        <div className="overflow-hidden rounded-2xl border border-border bg-card/65">
          <div className="flex flex-col gap-4 border-b border-border p-5 lg:flex-row lg:items-center lg:justify-between">
            <div><p className="text-xs font-black uppercase tracking-wider text-muted-foreground">Conciliación</p><h2 className="mt-1 text-lg font-black">Candidatos de inventario</h2><p className="mt-1 text-xs text-muted-foreground">{candidates.data?.total ?? 0} registros bajo revisión</p></div>
            <div className="flex flex-wrap gap-2">
              <select value={source} onChange={(event) => onSourceChange(event.target.value)} className="rounded-lg border border-border bg-background px-3 py-2 text-xs"><option value="">Todas las fuentes</option>{Object.entries(SOURCE_LABEL).map(([value,label]) => <option key={value} value={value}>{label}</option>)}</select>
              <select value={state} onChange={(event) => onStateChange(event.target.value)} className="rounded-lg border border-border bg-background px-3 py-2 text-xs"><option value="">Todos los estados</option>{Object.entries(INVENTORY_STATE_LABEL).map(([value,label]) => <option key={value} value={value}>{label}</option>)}</select>
            </div>
          </div>
          {rows.length === 0 ? <div className="p-5"><EmptyState /></div> : (
            <div className="max-h-[720px] divide-y divide-border/70 overflow-y-auto">
              {rows.map((item) => (
                <article key={item.id} className="grid gap-3 p-5 lg:grid-cols-[1.35fr_1fr_0.8fr_0.7fr] lg:items-center cursor-pointer hover:bg-muted/35 transition-colors" onClick={() => onSelectCandidate?.(item.id)}>
                  <div className="min-w-0"><p className="truncate font-bold">{item.label}</p><p className="mt-1 truncate text-xs text-muted-foreground">{SOURCE_LABEL[item.source] || item.source} · {item.assetClass}</p><p className="mt-1 truncate text-[10px] text-blue-300">{AUTHORITY_LABEL[item.sourceAuthority] || item.sourceAuthority}</p></div>
                  <div><p className="text-[10px] font-black uppercase tracking-wider text-muted-foreground">Ciclo operativo</p><p className="mt-1 text-xs font-bold">{LIFECYCLE_LABEL[item.lifecycleStatus] || item.lifecycleStatus}</p><p className="mt-1 text-[10px] text-muted-foreground">{item.ageDays == null ? 'Sin fecha confiable' : `Última actividad hace ${item.ageDays} día${item.ageDays === 1 ? '' : 's'}`}</p></div>
                  <div><p className="text-[10px] font-black uppercase tracking-wider text-muted-foreground">Red y conciliación</p><p className="mt-1 text-xs font-bold">{NETWORK_PROFILE_LABEL[item.networkProfile] || item.networkProfile}</p><p className="mt-1 truncate text-[10px] text-muted-foreground">{INVENTORY_STATE_LABEL[item.state] || item.state} · {item.osFamily || item.manufacturer || 'Sin clasificar'}</p></div>
                  <div className="lg:text-right"><p className="text-[10px] font-black uppercase tracking-wider text-muted-foreground">Identidad</p><p className="mt-1 font-black">{Math.round((item.identityConfidence || 0) * 100)}%</p><p className="text-[10px] text-muted-foreground">{item.identityStrength}</p>{item.findingCount > 0 && <p className="text-[10px] text-rose-300">{item.findingCount} hallazgos · {Number(item.maxSeverity).toFixed(1)}</p>}</div>
                </article>
              ))}
            </div>
          )}
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
  const audit = useQuery({ queryKey: ['cybersecurity-segment-audit', selectedId], queryFn: () => cybersecurityService.getNetworkSegmentAudit(selectedId), enabled: Boolean(selectedId) && showAudit });
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
          <div className="mt-4 h-2 overflow-hidden rounded-full bg-black/20"><div className="h-full rounded-full bg-amber-400 transition-all" style={{ width: `${progress}%` }} /></div>
        </div>
      </section>
      <section className="grid min-h-[650px] overflow-hidden rounded-2xl border border-border bg-card/65 xl:grid-cols-[390px_1fr]">
        <aside className="border-b border-border xl:border-b-0 xl:border-r">
          <div className="border-b border-border p-4">
            <div className="relative"><Search className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" size={16} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar interfaz, alias o IP" className="w-full rounded-xl border border-border bg-background py-2.5 pl-9 pr-3 text-xs outline-none focus:border-blue-500/50" /></div>
            <div className="mt-3 flex flex-wrap gap-2"><SlidersHorizontal className="mt-1.5 text-muted-foreground" size={15} />{[['ALL','Todos'],['PENDING','Pendientes'],['OBSERVATIONS','Observaciones'],['REVIEW','Por resolver'],['COMPLETE','Aplicados']].map(([value,label]) => <button key={value} onClick={() => setFilter(value)} className={`rounded-lg px-3 py-1.5 text-[10px] font-black ${filter === value ? 'bg-blue-500/15 text-blue-300' : 'bg-muted/40 text-muted-foreground hover:text-foreground'}`}>{label}</button>)}</div>
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
            <div className="flex flex-col gap-4 border-b border-border pb-6 sm:flex-row sm:items-start sm:justify-between"><div><div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.18em] text-blue-400"><MapPin size={14} /> Contexto de red</div><h2 className="mt-2 text-2xl font-black">{draft.name || selected.interfaceName || selected.label}</h2><p className="mt-1 text-xs text-muted-foreground">{selected.label} · última actividad {selected.lastActivityAt ? new Date(selected.lastActivityAt).toLocaleString('es-CO') : 'desconocida'}</p></div><span className={`w-fit rounded-lg border px-3 py-2 text-[10px] font-black ${selected.classificationStatus === 'APPROVED' ? 'border-emerald-500/20 bg-emerald-500/[0.07] text-emerald-300' : 'border-amber-500/20 bg-amber-500/[0.07] text-amber-300'}`}>{selected.classificationStatus === 'APPROVED' ? 'POLÍTICA APLICADA' : 'BORRADOR LOCAL'}</span></div>
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
            <div className="mt-7 rounded-2xl border border-blue-500/20 bg-blue-500/[0.06] p-5"><p className="text-xs font-black uppercase tracking-wider text-blue-300">Vista previa de la política</p><p className="mt-2 text-sm leading-relaxed text-muted-foreground">{draft.addressMode === 'DHCP' ? 'La IP tendrá peso mínimo para identificar equipos; se priorizarán agentes, hostname e identificadores persistentes.' : draft.addressMode === 'STATIC' ? 'La IP aportará contexto operativo fuerte, pero nunca fusionará dos equipos por sí sola.' : draft.addressMode === 'MIXED' ? 'Se aplicará conciliación conservadora y los cambios de IP requerirán evidencia corroborante.' : 'Selecciona el direccionamiento para conocer cómo cambiará la conciliación.'}</p><p className="mt-3 text-xs font-bold">Impacto: {selected.observations} observaciones · no crea activos automáticamente.</p></div>
            <div className="mt-5 flex flex-col gap-3 border-t border-border pt-5 lg:flex-row lg:items-center lg:justify-between"><div className="flex flex-wrap gap-2"><button disabled={saving} onClick={async () => { setSaving(true); setSaveError(''); try { await onDisposition(selected.id, 'NEEDS_SPLIT'); } catch (error) { setSaveError(error.message); } finally { setSaving(false); } }} className="rounded-xl border border-rose-500/25 bg-rose-500/[0.06] px-4 py-3 text-[10px] font-black uppercase text-rose-300 hover:bg-rose-500/10">Requiere desagregación</button><button disabled={saving} onClick={async () => { setSaving(true); setSaveError(''); try { await onDisposition(selected.id, 'OUT_OF_SCOPE'); } catch (error) { setSaveError(error.message); } finally { setSaving(false); } }} className="rounded-xl border border-border bg-muted/30 px-4 py-3 text-[10px] font-black uppercase text-muted-foreground hover:text-foreground">No tengo alcance</button></div><div className="flex flex-col items-end gap-2">{saveError && <p className="text-xs text-rose-300">{saveError}</p>}<button disabled={!isComplete(draft) || saving} onClick={async () => { setSaving(true); setSaveError(''); try { await onSave(selected.id, draft); } catch (error) { setSaveError(error.message); } finally { setSaving(false); } }} className="rounded-xl bg-blue-600 px-5 py-3 text-xs font-black uppercase tracking-wider text-white shadow-lg shadow-blue-950/30 hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-40">{saving ? 'Guardando…' : selected.classificationStatus === 'APPROVED' ? 'Actualizar política' : 'Aplicar clasificación'}</button></div></div>
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
  const [selectedCandidate, setSelectedCandidate] = useState(null);
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
    queryFn: () => cybersecurityService.getInventoryCandidates({ source: inventorySource, state: inventoryState }),
  });
  const networkSegments = useQuery({ queryKey: ['cybersecurity-admin-network-segments'], queryFn: cybersecurityService.getAdminNetworkSegments });
  const refresh = () => {
    if (activeView === 'inventory') { inventoryOverview.refetch(); inventoryCandidates.refetch(); }
    else if (activeView === 'subnets') networkSegments.refetch();
    else { overview.refetch(); cases.refetch(); }
  };
  const data = overview.data;

  return (
    <div className="h-full overflow-y-auto bg-[radial-gradient(circle_at_top_right,rgba(37,99,235,0.10),transparent_34%)] p-6 lg:p-9">
      <div className="mx-auto max-w-[1500px] space-y-7">
        <section className="flex flex-col justify-between gap-4 lg:flex-row lg:items-end">
          <div>
            <div className="flex items-center gap-2 text-[11px] font-black uppercase tracking-[0.22em] text-blue-400"><ShieldCheck size={15} /> Skylab Cybersecurity</div>
            <h1 className="mt-2 text-3xl font-black tracking-tight lg:text-4xl">{activeView === 'inventory' ? 'Inventario de activos' : activeView === 'subnets' ? 'Clasificación de subredes' : 'Postura y remediación'}</h1>
            <p className="mt-2 max-w-2xl text-sm text-muted-foreground">{activeView === 'inventory' ? 'Observaciones, candidatos y activos canónicos conciliados sin convertir direcciones temporales en identidad.' : activeView === 'subnets' ? 'Define el contexto operativo de cada segmento protegido y revisa su impacto antes de aplicar políticas.' : 'Hallazgos normalizados, agrupados por causa técnica y priorizados sin exponer identificadores sensibles.'}</p>
          </div>
          <button onClick={refresh} className="inline-flex items-center justify-center gap-2 rounded-xl border border-border bg-card px-4 py-2.5 text-xs font-black uppercase tracking-wider hover:bg-muted"><RefreshCw size={15} className={(overview.isFetching || cases.isFetching || inventoryOverview.isFetching || inventoryCandidates.isFetching) ? 'animate-spin' : ''} /> Actualizar</button>
        </section>

        <nav className="flex w-fit gap-1 rounded-xl border border-border bg-card/70 p-1">
          <button onClick={() => setActiveView('posture')} className={`rounded-lg px-4 py-2 text-xs font-black transition-colors ${activeView === 'posture' ? 'bg-blue-500/15 text-blue-300' : 'text-muted-foreground hover:text-foreground'}`}>Postura y remediación</button>
          <button onClick={() => setActiveView('inventory')} className={`rounded-lg px-4 py-2 text-xs font-black transition-colors ${activeView === 'inventory' ? 'bg-blue-500/15 text-blue-300' : 'text-muted-foreground hover:text-foreground'}`}>Inventario</button>
          <button onClick={() => setActiveView('subnets')} className={`rounded-lg px-4 py-2 text-xs font-black transition-colors ${activeView === 'subnets' ? 'bg-blue-500/15 text-blue-300' : 'text-muted-foreground hover:text-foreground'}`}>Subredes</button>
        </nav>

        {activeView === 'inventory' ? (
          <InventoryView overview={inventoryOverview} candidates={inventoryCandidates} source={inventorySource} state={inventoryState} onSourceChange={setInventorySource} onStateChange={setInventoryState} onRetry={refresh} onSelectCandidate={setSelectedCandidate} />
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
          <div className="rounded-2xl border border-border bg-card/65 p-6">
            <div className="flex items-center justify-between"><div><p className="text-xs font-black uppercase tracking-wider text-muted-foreground">Distribución</p><h2 className="mt-1 text-lg font-black">Prioridad técnica</h2></div><Radar className="text-blue-400" size={22} /></div>
            <div className="mt-6 space-y-4">
              {['P1', 'P2', 'P3', 'P4'].map((key) => {
                const count = data?.cases.byPriority?.[key] || 0;
                const total = Math.max(data?.cases.total || 0, 1);
                return <div key={key}><div className="mb-1.5 flex justify-between text-xs"><span className="font-black">{key}</span><span className="text-muted-foreground">{count}</span></div><div className="h-2 overflow-hidden rounded-full bg-muted"><div className={`h-full rounded-full ${key === 'P1' ? 'bg-rose-500' : key === 'P2' ? 'bg-orange-500' : key === 'P3' ? 'bg-amber-500' : 'bg-sky-500'}`} style={{ width: `${(count / total) * 100}%` }} /></div></div>;
              })}
            </div>
            <div className="mt-6 rounded-xl border border-border/70 bg-background/50 p-4 text-xs text-muted-foreground"><Clock3 className="mb-2 text-blue-400" size={17} />Último escaneo: <span className="font-bold text-foreground">{data?.latestScan ? new Date(data.latestScan.capturedAt).toLocaleString('es-CO') : 'sin capturas'}</span></div>
          </div>

          <div className="overflow-hidden rounded-2xl border border-border bg-card/65">
            <div className="flex flex-col gap-4 border-b border-border p-5 lg:flex-row lg:items-center lg:justify-between">
              <div><p className="text-xs font-black uppercase tracking-wider text-muted-foreground">Bandeja operativa</p><h2 className="mt-1 text-lg font-black">Casos de remediación</h2></div>
              <div className="flex flex-wrap gap-2">
                <select value={priority} onChange={(event) => setPriority(event.target.value)} className="rounded-lg border border-border bg-background px-3 py-2 text-xs"><option value="">Todas las prioridades</option>{['P1','P2','P3','P4'].map((item) => <option key={item}>{item}</option>)}</select>
                <select value={status} onChange={(event) => setStatus(event.target.value)} className="rounded-lg border border-border bg-background px-3 py-2 text-xs"><option value="">Todos los estados</option>{Object.entries(STATUS_LABEL).map(([value,label]) => <option key={value} value={value}>{label}</option>)}</select>
              </div>
            </div>
            {(overview.isError || cases.isError) ? <div className="p-5"><EmptyState error onRetry={refresh} /></div> : cases.data?.items?.length === 0 ? <div className="p-5"><EmptyState /></div> : (
              <div className="divide-y divide-border/70">
                {(cases.data?.items || []).map((item) => (
                  <button key={item.id} onClick={() => setSelectedCase(item.id)} className="grid w-full gap-3 p-5 text-left transition-colors hover:bg-muted/45 lg:grid-cols-[auto_1fr_auto_auto] lg:items-center">
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

        <section className="flex flex-col gap-3 rounded-2xl border border-emerald-500/20 bg-emerald-500/[0.06] p-5 text-sm sm:flex-row sm:items-center sm:justify-between"><div className="flex items-start gap-3"><CheckCircle2 className="mt-0.5 shrink-0 text-emerald-400" size={20} /><div><p className="font-bold">Canal protegido activo en el diseño</p><p className="mt-1 text-xs text-muted-foreground">La interfaz consume una API read-only; no accede a Greenbone ni a SQLite desde el navegador.</p></div></div><span className="inline-flex items-center gap-1 text-xs font-black uppercase tracking-wider text-emerald-300">Arquitectura segura <ArrowRight size={14} /></span></section>
      </div>
      <CaseDetail caseId={selectedCase} onClose={() => setSelectedCase(null)} />
      <CandidateDetail candidateId={selectedCandidate} onClose={() => setSelectedCandidate(null)} />
    </div>
  );
}
