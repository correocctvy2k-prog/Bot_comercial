import React, { useMemo, useState, useEffect, useCallback, useRef } from 'react';
import { trelloService } from '../services/trello.service';
import { useSocket } from '../hooks/useSocket';
import SelectorTablero from '../components/SelectorTablero';
import TareasKanban from '../components/TareasKanban';
import TareaModal from '../components/TareaModal';
import TareaDetailModal from '../components/TareaDetailModal';
import Loader from '../components/Loader';
import ExcelSyncPanel from '../components/ExcelSyncPanel';
import { RefreshCw, LayoutDashboard, Database, Activity, Building2, ChevronDown, Check, AlertTriangle, CalendarClock, CheckCircle2, Gauge, ListChecks, TrendingUp } from 'lucide-react';

// Componente selector de workspace inline
function SelectorOrg({ organizaciones, orgSeleccionada, onSelect }) {
  const [open, setOpen] = useState(false);
  const selected = organizaciones.find(o => o.id === orgSeleccionada);

  return (
    <div className="relative z-50">
      <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2 font-outfit">
        Espacio de Trabajo
      </label>
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center justify-between w-full md:w-64 px-4 py-3 text-left font-medium text-sm text-slate-200 glass-panel rounded-xl hover:bg-[#1a1a26]/80 transition-all border-[#2e2e42] hover:border-brand-500/50"
      >
        <div className="flex items-center space-x-2.5">
          <Building2 className="w-4 h-4 text-indigo-400" />
          <span className="truncate">{selected?.displayName || 'Todos los tableros'}</span>
        </div>
        <ChevronDown className={`w-4 h-4 text-slate-400 transition-transform duration-200 ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <ul className="absolute left-0 mt-2 w-full md:w-64 max-h-56 overflow-y-auto glass-panel rounded-xl border-[#2e2e42] shadow-2xl z-20 py-1">
            <li>
              <button
                onClick={() => { onSelect(null); setOpen(false); }}
                className="flex items-center justify-between w-full px-4 py-3 text-left text-sm text-slate-300 hover:bg-brand-600/20 hover:text-white transition-all"
              >
                <span className="font-outfit">Todos los tableros</span>
                {!orgSeleccionada && <Check className="w-4 h-4 text-brand-400" />}
              </button>
            </li>
            {organizaciones.map(org => (
              <li key={org.id}>
                <button
                  onClick={() => { onSelect(org.id); setOpen(false); }}
                  className="flex items-center justify-between w-full px-4 py-3 text-left text-sm text-slate-300 hover:bg-brand-600/20 hover:text-white transition-all"
                >
                  <span className="font-outfit truncate">{org.displayName}</span>
                  {orgSeleccionada === org.id && <Check className="w-4 h-4 text-brand-400" />}
                </button>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}

const MONTHS_ES = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'
];

const normalizeText = (value = '') => value
  .toString()
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .toLowerCase();

const getCardText = (card) => normalizeText(`${card.name || ''} ${card.desc || ''}`);

const isSupportBoardName = (name = '') => normalizeText(name).includes('soporte');
const isMaintenanceBoardName = (name = '') => normalizeText(name).includes('mantenimiento');

const isPendingList = (name = '') => {
  const normalized = normalizeText(name);
  return normalized.includes('pendiente') || normalized.includes('tareas pendientes');
};

const isEventList = (name = '') => normalizeText(name).includes('evento');

const isCctvInstallationEvent = (card) => {
  const text = getCardText(card);
  const hasCctvContext = /\b(cctv|camara|camaras|nvr|dvr|video|grabador)\b/.test(text);
  const hasInstallContext = /\b(instalacion|instalar|instalo|instalada|instalado|montaje|adecuacion|tendido|cableado|mejora|ampliacion|nuevo|nueva)\b/.test(text);
  const isRepairOnly = /\b(revisar|revision|reparo|reparacion|soporte|falla|fallando|cambio de clave)\b/.test(text) && !/\b(instalacion|montaje|nuevo|nueva|mejora|ampliacion)\b/.test(text);
  return hasCctvContext && hasInstallContext && !isRepairOnly;
};

const getChecklistItems = (cards) => cards.flatMap(card =>
  (card.checklists || []).flatMap(checklist => checklist.checkItems || [])
);

const getChecklistProgress = (cards) => {
  const items = getChecklistItems(cards);
  const completed = items.filter(item => item.state === 'complete').length;
  return {
    total: items.length,
    completed,
    pending: Math.max(0, items.length - completed),
    percent: items.length ? Math.round((completed / items.length) * 100) : 0
  };
};
function KpiCard({ icon: Icon, label, value, helper, tone = 'slate', progress = null }) {
  const tones = {
    slate: 'text-slate-300 bg-slate-500/10 border-slate-500/15',
    blue: 'text-sky-300 bg-sky-500/10 border-sky-500/20',
    green: 'text-emerald-300 bg-emerald-500/10 border-emerald-500/20',
    amber: 'text-amber-300 bg-amber-500/10 border-amber-500/20',
    red: 'text-red-300 bg-red-500/10 border-red-500/20',
    violet: 'text-violet-300 bg-violet-500/10 border-violet-500/20'
  };

  return (
    <div className="rounded-xl border border-[#232b3a] bg-[#101722]/82 px-4 py-3.5 shadow-lg min-w-[190px]">
      <div className="flex items-start justify-between gap-3">
        <div className="space-y-1 min-w-0">
          <p className="text-[12px] font-bold uppercase tracking-wider text-slate-500 truncate">{label}</p>
          <p className="text-3xl font-extrabold text-white leading-none font-outfit">{value}</p>
        </div>
        <div className={`p-2.5 rounded-lg border ${tones[tone] || tones.slate}`}>
          <Icon className="w-[22px] h-[22px]" />
        </div>
      </div>
      {progress !== null && (
        <div className="mt-3 h-2 rounded-full bg-[#0a111c] overflow-hidden">
          <div className="h-full rounded-full bg-current transition-all duration-300" style={{ width: `${Math.min(100, Math.max(0, progress))}%` }} />
        </div>
      )}
      <p className="mt-2.5 text-[13px] leading-snug text-slate-500">{helper}</p>
    </div>
  );
}

function MaintenanceAnalysis({ stats }) {
  if (!stats || stats.mode !== 'maintenance') return null;

  const maxTotal = Math.max(1, ...stats.monthlyMaintenance.map(item => item.total));

  return (
    <section className="grid grid-cols-1 xl:grid-cols-[1fr_360px] gap-3">
      <div className="rounded-xl border border-[#232b3a] bg-[#101722]/82 px-4 py-3.5 shadow-lg">
        <div className="flex items-center justify-between gap-3 mb-3">
          <div>
            <p className="text-[12px] font-bold uppercase tracking-wider text-slate-500">Cumplimiento mensual</p>
            <p className="text-[14px] text-slate-400">Checklist por mes del año activo</p>
          </div>
          <ListChecks className="w-5 h-5 text-emerald-300" />
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-x-5 gap-y-2.5">
          {stats.monthlyMaintenance.map(item => {
            const scheduledWidth = Math.max(8, Math.round((item.total / maxTotal) * 100));
            return (
              <div key={item.id} className="grid grid-cols-[92px_1fr_58px] items-center gap-3">
                <span className="text-[13px] font-semibold text-slate-400 truncate">{item.name}</span>
                <div className="relative h-3 rounded-full bg-[#07101b] overflow-hidden">
                  <div className="absolute inset-y-0 left-0 bg-slate-700/35" style={{ width: `${scheduledWidth}%` }} />
                  <div className={`relative h-full rounded-full ${item.percent === 100 ? 'bg-emerald-400' : 'bg-sky-400'}`} style={{ width: `${item.percent}%` }} />
                </div>
                <span className="text-right text-[13px] font-bold text-slate-300">{item.completed}/{item.total}</span>
              </div>
            );
          })}
        </div>
      </div>

      <div className="rounded-xl border border-[#232b3a] bg-[#101722]/82 px-4 py-3.5 shadow-lg">
        <div className="flex items-center justify-between gap-3 mb-3">
          <p className="text-[12px] font-bold uppercase tracking-wider text-slate-500">Lectura rápida</p>
          <CheckCircle2 className="w-5 h-5 text-emerald-300" />
        </div>
        <div className="grid grid-cols-3 xl:grid-cols-1 gap-2">
          <div className="rounded-lg border border-amber-500/20 bg-amber-500/10 px-3 py-2">
            <p className="text-[11px] font-bold uppercase tracking-wider text-amber-300">Pendientes mes</p>
            <p className="text-2xl font-extrabold text-white leading-none mt-1">{stats.currentMonthPending}</p>
            <p className="text-[12px] text-slate-500 mt-1 truncate">{stats.currentMonthName}</p>
          </div>
          <div className="rounded-lg border border-emerald-500/20 bg-emerald-500/10 px-3 py-2">
            <p className="text-[11px] font-bold uppercase tracking-wider text-emerald-300">Mejor mes</p>
            <p className="text-[17px] font-extrabold text-white leading-tight mt-1 truncate">{stats.bestMonth?.name || 'Sin mes'}</p>
            <p className="text-[12px] text-slate-500 mt-1">{stats.bestMonth?.percent || 0}%</p>
          </div>
          <div className="rounded-lg border border-sky-500/20 bg-sky-500/10 px-3 py-2">
            <p className="text-[11px] font-bold uppercase tracking-wider text-sky-300">Pendiente año</p>
            <p className="text-2xl font-extrabold text-white leading-none mt-1">{stats.yearPending}</p>
            <p className="text-[12px] text-slate-500 mt-1 truncate">items checklist</p>
          </div>
        </div>
      </div>
    </section>
  );
}
function KpiDashboard({ stats, compact = false }) {
  if (!stats) return null;

  if (stats.mode === 'support') {
    return (
      <section className="space-y-3">
        <div className={compact ? 'grid grid-cols-1 sm:grid-cols-2 2xl:grid-cols-1 gap-3' : 'grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-5 gap-3'}>
          <KpiCard icon={AlertTriangle} label="Pendientes" value={stats.pendingCards} helper="Tareas por atender en la lista pendiente" tone={stats.pendingCards > 0 ? 'amber' : 'green'} />
          <KpiCard icon={CheckCircle2} label="Eventos solucionados" value={stats.solvedEvents} helper="Eventos ya movidos a meses del año" tone="green" />
          <KpiCard icon={TrendingUp} label="Instalaciones CCTV" value={stats.cctvInstallations} helper="Nuevas instalaciones o mejoras reportables" tone="blue" />
          <KpiCard icon={Activity} label="Incidentes resueltos" value={stats.resolvedIncidents} helper="Revisiones, reparaciones y otros soportes" tone="violet" />
          <KpiCard icon={CalendarClock} label="Mes actual" value={stats.currentMonthTotal} helper={`${stats.currentMonthName}: ${stats.currentMonthInstallations} CCTV / ${stats.currentMonthIncidents} incidentes`} tone="slate" />
        </div>

        <div className="grid grid-cols-1 xl:grid-cols-[1.3fr_0.7fr] gap-3">
          <div className="rounded-xl border border-[#232b3a] bg-[#101722]/82 px-4 py-3.5 shadow-lg">
            <div className="flex items-center justify-between gap-3 mb-3">
              <div>
                <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500">Eventos por mes</p>
                <p className="text-sm text-slate-400">Separación entre instalaciones CCTV e incidentes solucionados</p>
              </div>
              <TrendingUp className="w-[22px] h-[22px] text-sky-300" />
            </div>
            <div className="space-y-2.5">
              {stats.monthlySupport.map(item => (
                <div key={item.id} className="grid grid-cols-[minmax(92px,150px)_1fr_46px_46px] items-center gap-3">
                  <span className="text-[12px] font-semibold text-slate-400 truncate">{item.name}</span>
                  <div className="h-2.5 rounded-full bg-[#0a111c] overflow-hidden flex">
                    <div className="h-full bg-sky-400" style={{ width: `${item.installPercent}%` }} />
                    <div className="h-full bg-violet-400" style={{ width: `${item.incidentPercent}%` }} />
                  </div>
                  <span className="text-right text-[12px] font-bold text-sky-300">{item.installations}</span>
                  <span className="text-right text-[12px] font-bold text-violet-300">{item.incidents}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-xl border border-[#232b3a] bg-[#101722]/82 px-4 py-3.5 shadow-lg">
            <div className="flex items-center justify-between mb-3">
              <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500">Lectura operativa</p>
              <CheckCircle2 className="w-[22px] h-[22px] text-emerald-300" />
            </div>
            <div className="space-y-2 text-[13px] text-slate-400 leading-relaxed">
              <p><span className="font-bold text-white">{stats.pendingCards}</span> tareas siguen pendientes de ejecución.</p>
              <p><span className="font-bold text-white">{stats.busyMonth?.name || 'Sin mes'}</span> concentra más eventos registrados.</p>
              <p><span className="font-bold text-sky-300">Azul</span> = instalaciones/mejoras CCTV; <span className="font-bold text-violet-300">violeta</span> = incidentes resueltos.</p>
            </div>
          </div>
        </div>
      </section>
    );
  }

  if (stats.mode === 'maintenance') {
    return (
      <section>
        <div className={compact ? 'grid grid-cols-1 sm:grid-cols-3 gap-4' : 'grid grid-cols-1 sm:grid-cols-3 gap-4'}>
          <KpiCard icon={Gauge} label={`Cumplimiento ${stats.currentYear}`} value={`${stats.yearProgress}%`} helper={`${stats.yearCompleted}/${stats.yearItems} puntos de venta`} tone="green" progress={stats.yearProgress} />
          <KpiCard icon={CalendarClock} label="Mes actual" value={`${stats.currentMonthProgress}%`} helper={`${stats.currentMonthName}: ${stats.currentMonthCompleted}/${stats.currentMonthItems} completados`} tone="blue" progress={stats.currentMonthProgress} />
          <KpiCard icon={AlertTriangle} label="Pendientes mes" value={stats.currentMonthPending} helper="Puntos de venta sin mantenimiento marcado" tone={stats.currentMonthPending > 0 ? 'amber' : 'green'} />
        </div>
      </section>
    );
  }

  return (
    <section className="space-y-3">
      <div className={compact ? 'grid grid-cols-1 sm:grid-cols-2 2xl:grid-cols-1 gap-3' : 'grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-5 gap-3'}>
        <KpiCard icon={Database} label="Tareas activas" value={stats.totalCards} helper={`${stats.totalLists} listas operativas`} tone="blue" />
        <KpiCard icon={Gauge} label="Avance checklist" value={`${stats.checklistProgress}%`} helper={`${stats.completedCheckItems}/${stats.totalCheckItems} items completados`} tone="green" progress={stats.checklistProgress} />
        <KpiCard icon={AlertTriangle} label="Vencidas" value={stats.overdueCards} helper="Tarjetas con fecha vencida" tone={stats.overdueCards > 0 ? 'red' : 'green'} />
        <KpiCard icon={CalendarClock} label="Próx. 7 días" value={stats.dueSoonCards} helper="Vencimientos que requieren seguimiento" tone="amber" />
        <KpiCard icon={ListChecks} label="Con checklist" value={`${stats.cardsWithChecklistPct}%`} helper={`${stats.cardsWithChecklist}/${stats.totalCards} tarjetas documentadas`} tone="violet" progress={stats.cardsWithChecklistPct} />
      </div>
    </section>
  );
}
export default function TareasDashboard() {
  const [organizaciones, setOrganizaciones] = useState([]);
  const [orgSeleccionada, setOrgSeleccionada] = useState(null);

  const [tableros, setTableros] = useState([]);
  const [tableroSeleccionado, setTableroSeleccionado] = useState('');
  const [listas, setListas] = useState([]);
  const [tarjetas, setTarjetas] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const [modalOpen, setModalOpen] = useState(false);
  const [selectedCard, setSelectedCard] = useState(null);
  const [activeListId, setActiveListId] = useState(null);

  // Modal de detalle (click en la tarjeta)
  const [detailCard, setDetailCard] = useState(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const refreshTimerRef = useRef(null);
  const updateCardState = (cardId, updater) => {
    setTarjetas((prev) => prev.map((card) => {
      if (card.id !== cardId) return card;
      return updater(card);
    }));
    setDetailCard((prev) => {
      if (!prev || prev.id !== cardId) return prev;
      return updater(prev);
    });
  };

  const calculateChecklistBadges = (checklists = [], currentBadges = {}) => {
    const items = checklists.flatMap(checklist => checklist.checkItems || []);
    return {
      ...currentBadges,
      checkItems: items.length,
      checkItemsChecked: items.filter(item => item.state === 'complete').length
    };
  };

  const applyChecklistCreated = (cardId, checklist) => {
    updateCardState(cardId, (card) => {
      const exists = (card.checklists || []).some(item => item.id === checklist.id);
      const checklists = exists
        ? (card.checklists || []).map(item => item.id === checklist.id ? { ...item, ...checklist, checkItems: checklist.checkItems || item.checkItems || [] } : item)
        : [...(card.checklists || []), { ...checklist, checkItems: checklist.checkItems || [] }];
      return { ...card, checklists, badges: calculateChecklistBadges(checklists, card.badges) };
    });
  };

  const applyCheckItemCreated = (cardId, checklistId, checkItem) => {
    updateCardState(cardId, (card) => {
      const checklists = (card.checklists || []).map(checklist => {
        if (checklist.id !== checklistId) return checklist;
        const exists = (checklist.checkItems || []).some(item => item.id === checkItem.id);
        const checkItems = exists
          ? (checklist.checkItems || []).map(item => item.id === checkItem.id ? { ...item, ...checkItem } : item)
          : [...(checklist.checkItems || []), checkItem];
        return { ...checklist, checkItems };
      });
      return { ...card, checklists, badges: calculateChecklistBadges(checklists, card.badges) };
    });
  };

  const applyCheckItemUpdated = (cardId, checkItemId, checkItem) => {
    updateCardState(cardId, (card) => {
      const checklists = (card.checklists || []).map(checklist => ({
        ...checklist,
        checkItems: (checklist.checkItems || []).map(item => (
          item.id === checkItemId ? { ...item, ...checkItem } : item
        ))
      }));
      return { ...card, checklists, badges: calculateChecklistBadges(checklists, card.badges) };
    });
  };

  const scheduleSilentRefresh = () => {
    if (!tableroSeleccionado || document.hidden) return;
    if (refreshTimerRef.current) clearTimeout(refreshTimerRef.current);
    refreshTimerRef.current = setTimeout(() => {
      loadBoardData(tableroSeleccionado, { silent: true });
    }, 600);
  };
  // Handlers de Socket.IO para sincronización en tiempo real
  const socketHandlers = {
    card_created: (newCard) => {
      setTarjetas((prev) => prev.some(t => t.id === newCard.id) ? prev : [...prev, newCard]);
    },
    card_updated: (updatedCard) => {
      updateCardState(updatedCard.id, (card) => ({ ...card, ...updatedCard }));
    },
    card_moved: (movedCard) => {
      updateCardState(movedCard.id, (card) => ({ ...card, idList: movedCard.idList }));
    },
    card_deleted: (deletedData) => {
      setTarjetas((prev) => prev.filter(t => t.id !== deletedData.id));
      setDetailCard((prev) => prev?.id === deletedData.id ? null : prev);
    },
    checklist_created: ({ cardId, checklist }) => {
      applyChecklistCreated(cardId, checklist);
    },
    checkitem_created: ({ cardId, checklistId, checkItem }) => {
      applyCheckItemCreated(cardId, checklistId, checkItem);
    },
    checkitem_updated: ({ cardId, checkItemId, checkItem }) => {
      applyCheckItemUpdated(cardId, checkItemId, checkItem);
    },
    trello_sync_refresh_requested: () => {
      scheduleSilentRefresh();
    },
    excel_synced: () => {
      scheduleSilentRefresh();
    }
  };
  useSocket(socketHandlers);

  // Cargar organizaciones al montar
  useEffect(() => {
    const fetchOrgs = async () => {
      try {
        const data = await trelloService.getOrganizaciones();
        setOrganizaciones(data);

        // Pre-seleccionar "Seguridad Perimetral" si existe
        const seguridad = data.find(o =>
          o.displayName.toLowerCase().includes('seguridad') ||
          o.name.toLowerCase().includes('seguridad')
        );
        const savedOrg = localStorage.getItem('trello_selected_org_id');
        const orgToSelect = data.some(o => o.id === savedOrg)
          ? savedOrg
          : (seguridad?.id || null);
        setOrgSeleccionada(orgToSelect);
      } catch (err) {
        console.error('Error cargando organizaciones:', err);
        setLoading(false);
      }
    };
    fetchOrgs();
  }, []);

  // Cuando cambia el workspace → cargar tableros de ese workspace
  useEffect(() => {
    if (orgSeleccionada !== undefined) {
      localStorage.setItem('trello_selected_org_id', orgSeleccionada || '');
      fetchTableros(orgSeleccionada);
    }
  }, [orgSeleccionada]);

  const fetchTableros = async (idOrg) => {
    try {
      const data = await trelloService.getTableros(idOrg);
      setTableros(data);
      if (data.length > 0) {
        const savedBoard = localStorage.getItem('trello_selected_board_id');
        const boardToSelect = data.some(b => b.id === savedBoard) ? savedBoard : data[0].id;
        setTableroSeleccionado(boardToSelect);
      } else {
        setTableroSeleccionado('');
        setListas([]);
        setTarjetas([]);
        setLoading(false);
      }
    } catch (err) {
      console.error('Error cargando tableros:', err);
      setLoading(false);
    }
  };

  // Cuando cambia el tablero → cargar listas y tarjetas
  useEffect(() => {
    if (!tableroSeleccionado) return;
    localStorage.setItem('trello_selected_board_id', tableroSeleccionado);
    loadBoardData(tableroSeleccionado);
  }, [tableroSeleccionado]);

  const loadBoardData = async (boardId, options = {}) => {
    const { silent = false } = options;
    if (!silent) setLoading(true);
    try {
      const boardLists = await trelloService.getListas(boardId);
      setListas(boardLists);

      if (boardLists.length > 0) {
        const cardsPromises = boardLists.map(list => trelloService.getTarjetas(list.id));
        const cardsResults = await Promise.all(cardsPromises);
        setTarjetas(cardsResults.flat());
      } else {
        setTarjetas([]);
      }
    } catch (err) {
      console.error('Error cargando datos del tablero:', err);
    } finally {
      if (!silent) setLoading(false);
    }
  };

  useEffect(() => {
    if (!tableroSeleccionado) return undefined;

    const intervalId = window.setInterval(() => {
      if (!document.hidden) {
        loadBoardData(tableroSeleccionado, { silent: true });
      }
    }, 15000);

    return () => {
      window.clearInterval(intervalId);
      if (refreshTimerRef.current) clearTimeout(refreshTimerRef.current);
    };
  }, [tableroSeleccionado]);

  const handleRefresh = async () => {
    if (!tableroSeleccionado) return;
    setRefreshing(true);
    await loadBoardData(tableroSeleccionado);
    setRefreshing(false);
  };

  const handleSaveCard = async (cardData) => {
    try {
      if (cardData.id) {
        const updated = await trelloService.actualizarTarjeta(cardData.id, cardData);
        setTarjetas((prev) => prev.map(t => t.id === updated.id ? { ...t, ...updated } : t));
      } else {
        const created = await trelloService.crearTarjeta(cardData);
        setTarjetas((prev) => [...prev, created]);
      }
    } catch (err) {
      console.error('Error al guardar la tarjeta:', err);
    }
  };

  const handleMoveCard = async (cardId, idList) => {
    try {
      setTarjetas((prev) => prev.map(t => t.id === cardId ? { ...t, idList } : t));
      await trelloService.moverTarjeta(cardId, idList);
    } catch (err) {
      console.error('Error al mover tarjeta:', err);
      loadBoardData(tableroSeleccionado);
    }
  };

  const handleDeleteCard = async (cardId) => {
    if (!window.confirm('¿Archivar esta tarjeta en Trello?')) return;
    try {
      setTarjetas((prev) => prev.filter(t => t.id !== cardId));
      await trelloService.eliminarTarjeta(cardId);
    } catch (err) {
      console.error('Error al archivar tarjeta:', err);
      loadBoardData(tableroSeleccionado);
    }
  };
  const handleCreateChecklist = async (cardId, name) => {
    try {
      const checklist = await trelloService.crearChecklist(cardId, name);
      applyChecklistCreated(cardId, checklist);
      return checklist;
    } catch (err) {
      console.error('Error al crear checklist:', err);
      throw err;
    }
  };

  const handleAddCheckItem = async (cardId, checklistId, name) => {
    try {
      const checkItem = await trelloService.crearCheckItem(checklistId, { name, cardId });
      applyCheckItemCreated(cardId, checklistId, checkItem);
      return checkItem;
    } catch (err) {
      console.error('Error al agregar item de checklist:', err);
      throw err;
    }
  };

  const handleToggleCheckItem = async (cardId, checkItemId, state) => {
    try {
      applyCheckItemUpdated(cardId, checkItemId, { id: checkItemId, state });
      const checkItem = await trelloService.actualizarCheckItem(cardId, checkItemId, state);
      applyCheckItemUpdated(cardId, checkItemId, checkItem);
      return checkItem;
    } catch (err) {
      console.error('Error al actualizar item de checklist:', err);
      loadBoardData(tableroSeleccionado);
      throw err;
    }
  };

  const openCreateModal = (listId) => { setSelectedCard(null); setActiveListId(listId); setModalOpen(true); };
  const openEditModal = (card) => { setSelectedCard(card); setActiveListId(card.idList); setModalOpen(true); };
  const openDetailModal = (card) => { setDetailCard(card); setDetailOpen(true); };

  const currentBoard = tableros.find(b => b.id === tableroSeleccionado);

  const dashboardStats = useMemo(() => {
    const now = new Date();
    const currentYear = now.getFullYear();
    const currentMonthName = MONTHS_ES[now.getMonth()];
    const boardName = currentBoard?.name || '';
    const totalCards = tarjetas.length;
    const totalLists = listas.length;
    const cardsByList = new Map(listas.map(list => [list.id, tarjetas.filter(card => card.idList === list.id)]));

    if (isSupportBoardName(boardName)) {
      const pendingList = listas.find(list => isPendingList(list.name));
      const pendingCards = pendingList ? (cardsByList.get(pendingList.id) || []).length : 0;
      const eventLists = listas.filter(list => isEventList(list.name));
      const monthlySupport = eventLists.map(list => {
        const cards = cardsByList.get(list.id) || [];
        const installations = cards.filter(isCctvInstallationEvent).length;
        const incidents = Math.max(0, cards.length - installations);
        const total = Math.max(1, cards.length);
        const displayName = list.name.replace(/^Eventos\s+/i, '').trim();
        return {
          id: list.id,
          name: displayName,
          total: cards.length,
          installations,
          incidents,
          installPercent: Math.round((installations / total) * 100),
          incidentPercent: Math.round((incidents / total) * 100)
        };
      });
      const cctvInstallations = monthlySupport.reduce((sum, item) => sum + item.installations, 0);
      const solvedEvents = monthlySupport.reduce((sum, item) => sum + item.total, 0);
      const resolvedIncidents = monthlySupport.reduce((sum, item) => sum + item.incidents, 0);
      const currentMonth = monthlySupport.find(item => normalizeText(item.name).includes(normalizeText(currentMonthName))) || {
        total: 0,
        installations: 0,
        incidents: 0
      };
      const busyMonth = [...monthlySupport].sort((a, b) => b.total - a.total)[0];

      return {
        mode: 'support',
        totalCards,
        totalLists,
        pendingCards,
        solvedEvents,
        cctvInstallations,
        resolvedIncidents,
        currentMonthName,
        currentMonthTotal: currentMonth.total,
        currentMonthInstallations: currentMonth.installations,
        currentMonthIncidents: currentMonth.incidents,
        monthlySupport,
        busyMonth
      };
    }

    if (isMaintenanceBoardName(boardName)) {
      const yearList = listas.find(list => normalizeText(list.name).includes(String(currentYear))) || listas.find(list => isMaintenanceBoardName(list.name));
      const yearCards = yearList ? (cardsByList.get(yearList.id) || []) : tarjetas;
      const yearProgress = getChecklistProgress(yearCards);
      const monthlyMaintenance = yearCards.map(card => {
        const progress = getChecklistProgress([card]);
        return {
          id: card.id,
          name: card.name,
          total: progress.total,
          completed: progress.completed,
          pending: progress.pending,
          percent: progress.percent
        };
      }).filter(item => item.total > 0);
      const currentMonth = monthlyMaintenance.find(item => normalizeText(item.name).includes(normalizeText(currentMonthName))) || {
        total: 0,
        completed: 0,
        pending: 0,
        percent: 0
      };
      const bestMonth = [...monthlyMaintenance].sort((a, b) => b.percent - a.percent || b.total - a.total)[0];

      return {
        mode: 'maintenance',
        totalCards,
        totalLists,
        currentYear,
        currentMonthName,
        yearItems: yearProgress.total,
        yearCompleted: yearProgress.completed,
        yearPending: yearProgress.pending,
        yearProgress: yearProgress.percent,
        currentMonthItems: currentMonth.total,
        currentMonthCompleted: currentMonth.completed,
        currentMonthPending: currentMonth.pending,
        currentMonthProgress: currentMonth.percent,
        monthsWithChecklist: monthlyMaintenance.length,
        monthlyMaintenance,
        bestMonth
      };
    }

    const inSevenDays = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
    const checklistProgress = getChecklistProgress(tarjetas);
    const cardsWithChecklist = tarjetas.filter(card => (card.checklists || []).some(checklist => (checklist.checkItems || []).length > 0)).length;
    const cardsWithChecklistPct = totalCards ? Math.round((cardsWithChecklist / totalCards) * 100) : 0;
    const cardsWithDue = tarjetas.filter(card => Boolean(card.due)).length;
    const overdueCards = tarjetas.filter(card => card.due && !card.dueComplete && new Date(card.due) < now).length;
    const dueSoonCards = tarjetas.filter(card => {
      if (!card.due || card.dueComplete) return false;
      const due = new Date(card.due);
      return due >= now && due <= inSevenDays;
    }).length;

    return {
      mode: 'generic',
      totalCards,
      totalLists,
      totalCheckItems: checklistProgress.total,
      completedCheckItems: checklistProgress.completed,
      checklistProgress: checklistProgress.percent,
      cardsWithChecklist,
      cardsWithChecklistPct,
      cardsWithoutChecklist: Math.max(0, totalCards - cardsWithChecklist),
      cardsWithDue,
      overdueCards,
      dueSoonCards
    };
  }, [currentBoard, listas, tarjetas]);

  const focusBoards = useMemo(() => {
    const currentYear = new Date().getFullYear().toString();
    return {
      support: tableros.find(board => isSupportBoardName(board.name) && normalizeText(board.name).includes(currentYear)) || tableros.find(board => isSupportBoardName(board.name)),
      maintenance: tableros.find(board => isMaintenanceBoardName(board.name))
    };
  }, [tableros]);

  return (
    <div className="min-h-screen flex flex-col">
      {/* ── HEADER ───────────────────────────────────── */}
      <header className="px-6 pt-6 pb-4 border-b border-[#1f1f2e] space-y-4">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          {/* Título */}
          <div className="flex items-center space-x-3">
            <div className="p-2 bg-brand-600/10 rounded-xl border border-brand-500/20 text-brand-400">
              <LayoutDashboard className="w-6 h-6" />
            </div>
            <div>
              <h1 className="text-2xl font-extrabold font-outfit tracking-tight text-white flex items-center gap-2">
                Skylab Tareas
                <span className="text-[10px] uppercase font-bold tracking-widest bg-brand-500/10 text-brand-400 px-2 py-0.5 rounded-full border border-brand-500/20">
                  MVP 1.0
                </span>
              </h1>
              {currentBoard && (
                <p className="text-xs text-slate-400 font-medium mt-0.5">
                  📋 {currentBoard.name}
                </p>
              )}
            </div>
          </div>

          {/* Controles */}
          <div className="flex flex-wrap items-end gap-3">
            <button
              onClick={handleRefresh}
              disabled={loading || refreshing}
              className="p-3 bg-[#11111a] hover:bg-[#1a1a26] border border-[#1f1f2e] text-slate-300 hover:text-white rounded-xl transition-all disabled:opacity-50"
              title="Refrescar datos"
            >
              <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin text-brand-400' : ''}`} />
            </button>

            {/* Selector de Workspace */}
            <SelectorOrg
              organizaciones={organizaciones}
              orgSeleccionada={orgSeleccionada}
              onSelect={setOrgSeleccionada}
            />

            {/* Selector de Tablero */}
            <SelectorTablero
              tableros={tableros}
              tableroSeleccionado={tableroSeleccionado}
              onSelect={(b) => setTableroSeleccionado(b.id)}
            />

            {(focusBoards.support || focusBoards.maintenance) && (
              <div className="flex items-center gap-2">
                {focusBoards.support && (
                  <button
                    onClick={() => setTableroSeleccionado(focusBoards.support.id)}
                    className={`px-4 py-3 rounded-xl text-sm font-bold border transition-all ${tableroSeleccionado === focusBoards.support.id ? 'bg-sky-500/15 border-sky-400/40 text-sky-200' : 'bg-[#11111a] border-[#1f1f2e] text-slate-400 hover:text-white hover:border-sky-500/35'}`}
                  >
                    Soporte {new Date().getFullYear()}
                  </button>
                )}
                {focusBoards.maintenance && (
                  <button
                    onClick={() => setTableroSeleccionado(focusBoards.maintenance.id)}
                    className={`px-4 py-3 rounded-xl text-sm font-bold border transition-all ${tableroSeleccionado === focusBoards.maintenance.id ? 'bg-emerald-500/15 border-emerald-400/40 text-emerald-200' : 'bg-[#11111a] border-[#1f1f2e] text-slate-400 hover:text-white hover:border-emerald-500/35'}`}
                  >
                    Mantenimientos
                  </button>
                )}
              </div>
            )}
          </div>
        </div>
      </header>

      {/* ── CONTENIDO PRINCIPAL ───────────────────────── */}
      <main className="flex-grow px-6 py-4">
        {loading ? (
          <Loader />
        ) : isMaintenanceBoardName(currentBoard?.name) ? (
          <div className="space-y-4">
            <KpiDashboard stats={dashboardStats} compact />
            <div className="grid grid-cols-1 xl:grid-cols-[minmax(560px,650px)_minmax(620px,1fr)] gap-4 items-start">
              <div className="min-w-0">
                <TareasKanban
                  listas={listas}
                  tarjetas={tarjetas}
                  onCardEdit={openEditModal}
                  onCardDelete={handleDeleteCard}
                  onCardMove={handleMoveCard}
                  onAddCardClick={openCreateModal}
                  onCardOpen={openDetailModal}
                  compact
                />
              </div>
              <aside className="space-y-4 xl:sticky xl:top-4">
                <MaintenanceAnalysis stats={dashboardStats} />
                <ExcelSyncPanel visible compact />
              </aside>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            {listas.length > 0 && <KpiDashboard stats={dashboardStats} />}
            <TareasKanban
              listas={listas}
              tarjetas={tarjetas}
              onCardEdit={openEditModal}
              onCardDelete={handleDeleteCard}
              onCardMove={handleMoveCard}
              onAddCardClick={openCreateModal}
              onCardOpen={openDetailModal}
            />
          </div>
        )}
      </main>
      {/* Modal creación/edición */}
      <TareaModal
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        onSave={handleSaveCard}
        card={selectedCard}
        listId={activeListId}
      />

      {/* Modal de detalle (click en tarjeta) */}
      <TareaDetailModal
        card={detailCard}
        lists={listas}
        isOpen={detailOpen}
        onClose={() => setDetailOpen(false)}
        onEdit={(card) => { setDetailOpen(false); openEditModal(card); }}
        onDelete={handleDeleteCard}
        onMove={handleMoveCard}
        onChecklistCreate={handleCreateChecklist}
        onCheckItemAdd={handleAddCheckItem}
        onCheckItemToggle={handleToggleCheckItem}
      />
    </div>
  );
}






