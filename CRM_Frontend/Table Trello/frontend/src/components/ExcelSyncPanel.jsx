import React, { useEffect, useMemo, useState } from 'react';
import { FileSpreadsheet, RefreshCw, AlertTriangle, ExternalLink, BarChart3, CheckCircle2 } from 'lucide-react';
import { excelService } from '../services/excel.service';

const PERIOD_LABELS = {
  R1: 'Periodo 1',
  R2: 'Periodo 2',
  R3: 'Periodo 3'
};

function getApiErrorMessage(error, fallback) {
  const apiError = error.response?.data?.error;
  return (typeof apiError === 'string' ? apiError : apiError?.message) || error.message || fallback;
}

function getTone(percent) {
  if (percent >= 90) return { text: 'text-emerald-300', bg: 'bg-emerald-400', soft: 'bg-emerald-500/10 border-emerald-500/25' };
  if (percent >= 60) return { text: 'text-sky-300', bg: 'bg-sky-400', soft: 'bg-sky-500/10 border-sky-500/25' };
  return { text: 'text-amber-300', bg: 'bg-amber-400', soft: 'bg-amber-500/10 border-amber-500/25' };
}

function summarizePeriods(zonas = []) {
  return ['R1', 'R2', 'R3'].map((key) => {
    const totals = zonas.reduce((acc, zona) => {
      const period = zona.periodos?.[key] || {};
      acc.realizados += Number(period.realizados || 0);
      acc.programados += Number(period.programados || 0);
      return acc;
    }, { realizados: 0, programados: 0 });
    return {
      key,
      label: PERIOD_LABELS[key],
      ...totals,
      porcentaje: totals.programados ? Math.round((totals.realizados / totals.programados) * 100) : 0
    };
  });
}

function PeriodOverview({ periods }) {
  return (
    <div className="grid grid-cols-3 gap-2 h-full">
      {periods.map((period) => {
        const tone = getTone(period.porcentaje);
        return (
          <div key={period.key} className="rounded-lg border border-[#263142] bg-[#0d141f]/80 px-3 py-2.5 flex flex-col justify-between min-h-[128px]">
            <div className="flex items-start justify-between gap-2">
              <div>
                <p className="text-[12px] font-bold text-slate-400 whitespace-nowrap">{period.label}</p>
                <p className={`mt-1 text-2xl font-extrabold leading-none ${tone.text}`}>{period.porcentaje}%</p>
              </div>
              <span className="text-[12px] font-bold text-slate-400">{period.realizados}/{period.programados}</span>
            </div>
            <div className="mt-3 h-16 rounded-md bg-[#07101b] border border-[#1e2a39] overflow-hidden flex items-end">
              <div className={`w-full ${tone.bg} transition-all duration-300`} style={{ height: `${Math.max(4, period.porcentaje)}%` }} />
            </div>
          </div>
        );
      })}
    </div>
  );
}

function ZoneRanking({ zonas }) {
  const ranked = [...zonas]
    .map((zona) => {
      const periods = Object.values(zona.periodos || {});
      const realizados = periods.reduce((sum, item) => sum + Number(item.realizados || 0), 0);
      const programados = periods.reduce((sum, item) => sum + Number(item.programados || 0), 0);
      return { zona: zona.zona, realizados, programados, porcentaje: programados ? Math.round((realizados / programados) * 100) : 0 };
    })
    .sort((a, b) => b.porcentaje - a.porcentaje || b.programados - a.programados)
    .slice(0, 6);

  return (
    <div className="rounded-lg border border-[#263142] bg-[#0d141f]/80 px-3 py-2.5 h-full">
      <div className="flex items-center justify-between gap-3 mb-3">
        <div>
          <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500">Zonas destacadas</p>
          <p className="text-[13px] text-slate-400">Cumplimiento anual consolidado</p>
        </div>
        <BarChart3 className="w-5 h-5 text-sky-300" />
      </div>
      <div className="space-y-2.5">
        {ranked.map((item) => {
          const tone = getTone(item.porcentaje);
          return (
            <div key={item.zona} className="grid grid-cols-[minmax(88px,150px)_1fr_44px] items-center gap-3">
              <span className="text-[13px] font-bold text-slate-300 truncate">{item.zona}</span>
              <div className="h-2.5 rounded-full bg-[#07101b] overflow-hidden">
                <div className={`h-full rounded-full ${tone.bg}`} style={{ width: `${item.porcentaje}%` }} />
              </div>
              <span className={`text-right text-[13px] font-extrabold ${tone.text}`}>{item.porcentaje}%</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function ZonePeriodCell({ label, data }) {
  const pct = data?.porcentaje || 0;
  const tone = getTone(pct);

  return (
    <div className={`rounded-lg border px-3 py-2 ${tone.soft}`}>
      <div className="flex items-center justify-between gap-2">
        <span className="text-[12px] font-bold text-slate-300 whitespace-nowrap">{label}</span>
        <span className={`text-[15px] font-extrabold ${tone.text}`}>{pct}%</span>
      </div>
      <div className="mt-2 h-2 rounded-full bg-[#07101b] overflow-hidden">
        <div className={`h-full rounded-full ${tone.bg}`} style={{ width: `${pct}%` }} />
      </div>
      <p className="mt-1.5 text-[12px] font-semibold text-slate-500">{data?.realizados || 0}/{data?.programados || 0}</p>
    </div>
  );
}

function ZoneCard({ zona }) {
  const periods = ['R1', 'R2', 'R3'].map((key) => zona.periodos?.[key] || {});
  const completed = periods.reduce((sum, item) => sum + Number(item.realizados || 0), 0);
  const programmed = periods.reduce((sum, item) => sum + Number(item.programados || 0), 0);
  const pct = programmed ? Math.round((completed / programmed) * 100) : 0;
  const tone = getTone(pct);

  return (
    <div className="rounded-lg border border-[#263142] bg-[#0d141f]/72 p-3">
      <div className="grid grid-cols-1 lg:grid-cols-[170px_1fr] gap-3 items-stretch">
        <div className="flex lg:flex-col justify-between gap-2 min-w-0">
          <div className="min-w-0">
            <p className="text-[15px] font-extrabold text-slate-100 truncate">{zona.zona}</p>
            <p className="text-[12px] text-slate-500">{zona.puntos} puntos programados</p>
          </div>
          <div className="flex items-center gap-2">
            <span className={`text-xl font-extrabold leading-none ${tone.text}`}>{pct}%</span>
            <span className="text-[12px] text-slate-500">{completed}/{programmed}</span>
          </div>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
          <ZonePeriodCell label="Periodo 1" data={zona.periodos.R1} />
          <ZonePeriodCell label="Periodo 2" data={zona.periodos.R2} />
          <ZonePeriodCell label="Periodo 3" data={zona.periodos.R3} />
        </div>
      </div>
    </div>
  );
}

export default function ExcelSyncPanel({ visible, compact = false }) {
  const [resumen, setResumen] = useState(null);
  const [historial, setHistorial] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [opening, setOpening] = useState(false);

  const loadData = async () => {
    if (!visible) return;
    setLoading(true);
    setError('');
    try {
      const [summary, history] = await Promise.all([
        excelService.getResumen(),
        excelService.getHistorial(5)
      ]);
      setResumen(summary);
      setHistorial(history);
    } catch (err) {
      setError(getApiErrorMessage(err, 'No se pudo leer Excel'));
    } finally {
      setLoading(false);
    }
  };

  const openFile = async () => {
    setOpening(true);
    setError('');
    try {
      await excelService.abrirArchivo();
    } catch (err) {
      setError(getApiErrorMessage(err, 'No se pudo abrir el archivo Excel'));
    } finally {
      setOpening(false);
    }
  };

  useEffect(() => {
    loadData();
    if (!visible) return undefined;
    const timer = window.setInterval(loadData, 30000);
    return () => window.clearInterval(timer);
  }, [visible]);

  const zonas = resumen?.zonas || [];
  const periods = useMemo(() => summarizePeriods(zonas), [zonas]);
  const totalCompleted = periods.reduce((sum, item) => sum + item.realizados, 0);
  const totalProgrammed = periods.reduce((sum, item) => sum + item.programados, 0);
  const totalPercent = totalProgrammed ? Math.round((totalCompleted / totalProgrammed) * 100) : 0;

  if (!visible) return null;

  return (
    <section className="rounded-xl border border-[#232b3a] bg-[#101722]/82 px-4 py-3.5 shadow-lg space-y-3">
      <div className="flex flex-col 2xl:flex-row 2xl:items-center 2xl:justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <div className="p-2 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-300">
            <FileSpreadsheet className="w-[18px] h-[18px]" />
          </div>
          <div className="min-w-0">
            <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
              <p className="text-[17px] font-extrabold text-white">Sincronización Excel CCTV</p>
              <span className="text-[13px] font-bold text-emerald-300">{totalPercent}% anual</span>
            </div>
            <p className="text-[13px] text-slate-500 truncate">Hoja Total · Periodo 1, 2 y 3 · {totalCompleted}/{totalProgrammed} mantenimientos registrados</p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            onClick={openFile}
            disabled={opening}
            className="inline-flex items-center justify-center gap-2 px-3.5 py-2.5 rounded-lg text-[14px] font-bold text-emerald-200 border border-emerald-500/25 bg-emerald-500/10 hover:text-white hover:border-emerald-400/50 disabled:opacity-50"
          >
            <ExternalLink className="w-4 h-4" />
            Abrir Excel
          </button>
          <button
            onClick={loadData}
            disabled={loading}
            className="inline-flex items-center justify-center gap-2 px-3.5 py-2.5 rounded-lg text-[14px] font-bold text-slate-300 border border-[#263142] hover:text-white hover:border-emerald-500/35 disabled:opacity-50"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            Actualizar
          </button>
        </div>
      </div>

      {error ? (
        <div className="flex items-center gap-2 rounded-lg border border-red-500/20 bg-red-500/10 px-3 py-2 text-sm text-red-200">
          <AlertTriangle className="w-4 h-4" />
          {error}
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 2xl:grid-cols-[1fr_340px] gap-3">
            <PeriodOverview periods={periods} />
            <ZoneRanking zonas={zonas} />
          </div>

          <div className="grid grid-cols-1 2xl:grid-cols-2 gap-3">
            {zonas.map((zona) => <ZoneCard key={zona.zona} zona={zona} />)}
          </div>
        </>
      )}

      {historial.length > 0 && (
        <div className="border-t border-[#232b3a] pt-3 flex flex-col xl:flex-row xl:items-center gap-2">
          <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500 xl:w-40">Últimas sync</p>
          <div className="flex flex-wrap gap-2 min-w-0">
            {historial.slice(0, compact ? 4 : 5).map((item) => (
              <span key={item.id} className="rounded-full bg-[#0d141f] border border-[#263142] px-3 py-1 text-xs text-slate-400 truncate max-w-[240px]">
                {item.punto} · {item.periodo.replace('R', 'P')} · {item.celda}
              </span>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}

