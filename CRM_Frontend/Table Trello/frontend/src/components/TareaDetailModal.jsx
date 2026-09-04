import React, { useEffect, useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  X, Clock, MessageSquare, Paperclip, CheckSquare,
  Edit3, Trash2, User, Eye, Plus, Loader2
} from 'lucide-react';
import { resolveCoverUrl, proxyImg, TRELLO_COLORS } from '../utils/trelloImages';

function MemberRow({ member }) {
  const [imgOk, setImgOk] = useState(true);
  const url = member.avatarHash
    ? proxyImg(`https://trello-members.s3.amazonaws.com/${member.id}/${member.avatarHash}/50.png`)
    : null;
  const initials = member.initials || member.fullName?.charAt(0)?.toUpperCase() || '?';

  return (
    <div className="flex items-center gap-2.5">
      <div className="w-8 h-8 rounded-full overflow-hidden flex-shrink-0 bg-indigo-600 flex items-center justify-center ring-2 ring-[#2a3040]">
        {url && imgOk ? (
          <img src={url} alt={member.fullName} className="w-full h-full object-cover" onError={() => setImgOk(false)} />
        ) : (
          <span className="text-xs font-bold text-white">{initials}</span>
        )}
      </div>
      <span className="text-sm text-slate-300">{member.fullName || member.username}</span>
    </div>
  );
}

function DueSection({ due, dueComplete }) {
  if (!due) return null;
  const date = new Date(due);
  const now = new Date();
  const diffMs = date - now;
  const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24));
  const label = date.toLocaleDateString('es-CO', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });

  let color, text;
  if (dueComplete)      { color = 'bg-emerald-700/40 border-emerald-600/40'; text = 'text-emerald-300'; }
  else if (diffMs < 0) { color = 'bg-red-900/40 border-red-700/40';         text = 'text-red-300'; }
  else if (diffDays <= 1){ color = 'bg-amber-900/40 border-amber-700/40';   text = 'text-amber-300'; }
  else                  { color = 'bg-[#1a2030] border-[#2a3040]';          text = 'text-slate-300'; }

  return (
    <div className={`flex items-center gap-2 px-4 py-3 rounded-xl border ${color}`}>
      <Clock className={`w-4 h-4 flex-shrink-0 ${text}`} />
      <div>
        <p className={`text-sm font-semibold ${text}`}>{label}</p>
        <p className="text-xs text-slate-500">{dueComplete ? 'Completada' : diffMs < 0 ? 'Vencida' : `Vence en ${diffDays} dia(s)`}</p>
      </div>
    </div>
  );
}

function ChecklistSection({ card, onChecklistCreate, onCheckItemAdd, onCheckItemToggle }) {
  const [newItemText, setNewItemText] = useState({});
  const [savingItem, setSavingItem] = useState(null);
  const [savingCheckItem, setSavingCheckItem] = useState(null);
  const [creatingChecklist, setCreatingChecklist] = useState(false);

  const checklists = card?.checklists || [];
  const totals = useMemo(() => {
    const items = checklists.flatMap(checklist => checklist.checkItems || []);
    const completed = items.filter(item => item.state === 'complete').length;
    const total = items.length;
    return { completed, total, percent: total ? Math.round((completed / total) * 100) : 0 };
  }, [checklists]);

  const handleCreateChecklist = async () => {
    setCreatingChecklist(true);
    try {
      await onChecklistCreate(card.id, 'Mantenimiento');
    } finally {
      setCreatingChecklist(false);
    }
  };

  const handleAddItem = async (checklistId) => {
    const name = newItemText[checklistId]?.trim();
    if (!name) return;

    setSavingItem(checklistId);
    try {
      await onCheckItemAdd(card.id, checklistId, name);
      setNewItemText(prev => ({ ...prev, [checklistId]: '' }));
    } finally {
      setSavingItem(null);
    }
  };

  const handleToggle = async (checkItem) => {
    const nextState = checkItem.state === 'complete' ? 'incomplete' : 'complete';
    setSavingCheckItem(checkItem.id);
    try {
      await onCheckItemToggle(card.id, checkItem.id, nextState);
    } finally {
      setSavingCheckItem(null);
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs font-semibold text-slate-500 uppercase tracking-widest flex items-center gap-1.5">
          <CheckSquare className="w-3.5 h-3.5" />
          Checklist
        </p>
        {totals.total > 0 && (
          <span className="text-xs font-bold text-slate-400">{totals.completed}/{totals.total} ({totals.percent}%)</span>
        )}
      </div>

      <div className="h-2 rounded-full bg-[#101621] overflow-hidden border border-[#263142]">
        <div
          className="h-full bg-emerald-500 transition-all duration-300"
          style={{ width: `${totals.percent}%` }}
        />
      </div>

      {checklists.length === 0 ? (
        <div className="rounded-xl border border-dashed border-[#334155] bg-[#111827]/50 p-4 flex items-center justify-between gap-3">
          <span className="text-sm text-slate-400">Esta tarjeta no tiene checklist todavia.</span>
          <button
            type="button"
            onClick={handleCreateChecklist}
            disabled={creatingChecklist}
            className="inline-flex items-center gap-2 px-3 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 disabled:opacity-60 text-sm font-semibold text-white transition-all"
          >
            {creatingChecklist ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
            Crear
          </button>
        </div>
      ) : (
        <div className="space-y-4">
          {checklists.map(checklist => {
            const items = checklist.checkItems || [];
            const completed = items.filter(item => item.state === 'complete').length;
            const percent = items.length ? Math.round((completed / items.length) * 100) : 0;

            return (
              <div key={checklist.id} className="rounded-xl border border-[#263142] bg-[#111827]/55 overflow-hidden">
                <div className="px-4 py-3 border-b border-[#263142]">
                  <div className="flex items-center justify-between gap-3">
                    <h3 className="text-sm font-bold text-slate-200 truncate">{checklist.name}</h3>
                    <span className="text-xs font-bold text-slate-500">{completed}/{items.length}</span>
                  </div>
                  <div className="mt-2 h-1.5 rounded-full bg-[#0b1220] overflow-hidden">
                    <div className="h-full bg-emerald-500 transition-all duration-300" style={{ width: `${percent}%` }} />
                  </div>
                </div>

                <div className="divide-y divide-[#263142]/70">
                  {items.length === 0 ? (
                    <p className="px-4 py-3 text-sm text-slate-600 italic">Sin elementos.</p>
                  ) : (
                    items.map(item => {
                      const checked = item.state === 'complete';
                      return (
                        <label key={item.id} className="flex items-start gap-3 px-4 py-3 hover:bg-[#172033] transition-colors cursor-pointer">
                          <input
                            type="checkbox"
                            checked={checked}
                            disabled={savingCheckItem === item.id}
                            onChange={() => handleToggle(item)}
                            className="mt-0.5 h-4 w-4 rounded border-slate-600 bg-[#0b1220] text-emerald-500 focus:ring-emerald-500"
                          />
                          <span className={`flex-1 text-sm leading-relaxed ${checked ? 'text-slate-500 line-through' : 'text-slate-300'}`}>
                            {item.name}
                          </span>
                          {savingCheckItem === item.id && <Loader2 className="w-4 h-4 text-slate-500 animate-spin" />}
                        </label>
                      );
                    })
                  )}
                </div>

                <div className="p-3 flex gap-2 bg-[#0f1624]/70">
                  <input
                    type="text"
                    value={newItemText[checklist.id] || ''}
                    onChange={e => setNewItemText(prev => ({ ...prev, [checklist.id]: e.target.value }))}
                    onKeyDown={e => { if (e.key === 'Enter') handleAddItem(checklist.id); }}
                    placeholder="Agregar elemento"
                    className="flex-1 min-w-0 glass-input text-sm py-2"
                  />
                  <button
                    type="button"
                    onClick={() => handleAddItem(checklist.id)}
                    disabled={savingItem === checklist.id || !newItemText[checklist.id]?.trim()}
                    className="inline-flex items-center justify-center w-10 h-10 rounded-lg bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white transition-all"
                    title="Agregar elemento"
                  >
                    {savingItem === checklist.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

export default function TareaDetailModal({
  card,
  lists,
  isOpen,
  onClose,
  onEdit,
  onDelete,
  onMove,
  onChecklistCreate,
  onCheckItemAdd,
  onCheckItemToggle
}) {
  const coverUrl = card ? resolveCoverUrl(card) : null;
  const coverColor = (!coverUrl && card?.cover?.color) ? (TRELLO_COLORS[card.cover.color] || card.cover.color) : null;
  const labels = card?.labels || [];
  const members = card?.members || [];
  const badges = card?.badges || {};

  useEffect(() => {
    const handler = (e) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [onClose]);

  if (!card) return null;

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm"
            onClick={onClose}
          />

          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 16 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 16 }}
            transition={{ duration: 0.22, ease: 'easeOut' }}
            className="fixed inset-x-0 inset-y-0 z-50 flex items-center justify-center p-4 pointer-events-none"
          >
            <div
              className="relative w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-2xl pointer-events-auto"
              style={{
                background: 'linear-gradient(160deg, #1e2530 0%, #171d26 100%)',
                boxShadow: '0 24px 80px rgba(0,0,0,0.8), 0 0 0 1px rgba(255,255,255,0.07)',
              }}
              onClick={e => e.stopPropagation()}
            >
              {coverUrl ? (
                <div className="relative w-full overflow-hidden rounded-t-2xl" style={{ height: 200 }}>
                  <img
                    src={coverUrl}
                    alt="Portada"
                    className="w-full h-full object-cover"
                    onError={(e) => { e.target.parentNode.style.display = 'none'; }}
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-[#171d26] via-transparent to-transparent" />
                </div>
              ) : coverColor ? (
                <div className="w-full h-20 rounded-t-2xl" style={{ backgroundColor: coverColor }} />
              ) : null}

              <button
                onClick={onClose}
                className="absolute top-3 right-3 z-10 p-2 rounded-full bg-[#1e2530]/90 text-slate-400 hover:text-white hover:bg-[#2a3548] transition-all"
                style={{ backdropFilter: 'blur(8px)' }}
              >
                <X className="w-5 h-5" />
              </button>

              <div className="px-6 pb-6 pt-4 space-y-5">
                {labels.length > 0 && (
                  <div className="flex flex-wrap gap-1.5">
                    {labels.map((l, i) => (
                      <span
                        key={l.id || i}
                        className="flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold text-[#1d2125]"
                        style={{ backgroundColor: TRELLO_COLORS[l.color] || l.color || '#8590A2' }}
                      >
                        {l.name || l.color}
                      </span>
                    ))}
                  </div>
                )}

                <h2 className="text-2xl font-bold text-white leading-tight">
                  {card.name}
                </h2>

                {card.desc ? (
                  <div className="space-y-1">
                    <p className="text-xs font-semibold text-slate-500 uppercase tracking-widest">Descripcion</p>
                    <p className="text-[15px] text-slate-300 leading-relaxed whitespace-pre-wrap">{card.desc}</p>
                  </div>
                ) : (
                  <p className="text-sm text-slate-600 italic">Sin descripcion</p>
                )}

                <DueSection due={card.due} dueComplete={card.dueComplete} />

                {(badges.comments > 0 || badges.attachments > 0 || badges.checkItems > 0) && (
                  <div className="flex flex-wrap gap-3">
                    {badges.comments > 0 && (
                      <div className="flex items-center gap-1.5 text-sm text-slate-400">
                        <MessageSquare className="w-4 h-4" />
                        <span>{badges.comments} comentario{badges.comments > 1 ? 's' : ''}</span>
                      </div>
                    )}
                    {badges.attachments > 0 && (
                      <div className="flex items-center gap-1.5 text-sm text-slate-400">
                        <Paperclip className="w-4 h-4" />
                        <span>{badges.attachments} adjunto{badges.attachments > 1 ? 's' : ''}</span>
                      </div>
                    )}
                    {badges.checkItems > 0 && (
                      <div className={`flex items-center gap-1.5 text-sm font-medium ${badges.checkItemsChecked === badges.checkItems ? 'text-emerald-400' : 'text-slate-400'}`}>
                        <CheckSquare className="w-4 h-4" />
                        <span>{badges.checkItemsChecked}/{badges.checkItems} checklist</span>
                      </div>
                    )}
                  </div>
                )}

                <ChecklistSection
                  card={card}
                  onChecklistCreate={onChecklistCreate}
                  onCheckItemAdd={onCheckItemAdd}
                  onCheckItemToggle={onCheckItemToggle}
                />

                {members.length > 0 && (
                  <div className="space-y-2">
                    <p className="text-xs font-semibold text-slate-500 uppercase tracking-widest flex items-center gap-1.5">
                      <User className="w-3.5 h-3.5" />
                      Miembros asignados
                    </p>
                    <div className="space-y-2">
                      {members.map(m => <MemberRow key={m.id} member={m} />)}
                    </div>
                  </div>
                )}

                <div className="flex gap-3 pt-2">
                  <button
                    onClick={() => { onEdit(card); onClose(); }}
                    className="flex-1 flex items-center justify-center gap-2 py-3 rounded-xl text-sm font-semibold text-white bg-indigo-600 hover:bg-indigo-500 transition-all"
                  >
                    <Edit3 className="w-4 h-4" />
                    Editar tarjeta
                  </button>
                  <button
                    onClick={() => { onDelete(card.id); onClose(); }}
                    className="flex items-center justify-center gap-2 px-5 py-3 rounded-xl text-sm font-semibold text-red-400 hover:text-white hover:bg-red-700/70 border border-red-800/50 hover:border-red-600 transition-all"
                  >
                    <Trash2 className="w-4 h-4" />
                    Archivar
                  </button>
                  <button
                    onClick={() => window.open(`https://trello.com/c/${card.id}`, '_blank')}
                    className="flex items-center gap-2 px-5 py-3 rounded-xl text-sm font-semibold text-slate-400 hover:text-white border border-[#2a3040] hover:border-[#3a4755] hover:bg-[#1e2a38] transition-all"
                    title="Abrir en Trello"
                  >
                    <Eye className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}