import React, { useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import {
  Clock, MessageSquare, Paperclip, CheckSquare,
  Edit3, Trash2, Eye, CalendarClock
} from 'lucide-react';
import { resolveCoverUrl, proxyImg, TRELLO_COLORS } from '../utils/trelloImages';

function MemberAvatar({ member }) {
  const [imgOk, setImgOk] = useState(true);
  const url = member.avatarHash
    ? proxyImg(`https://trello-members.s3.amazonaws.com/${member.id}/${member.avatarHash}/30.png`)
    : null;
  const initials = member.initials || member.fullName?.charAt(0)?.toUpperCase() || '?';

  return (
    <div
      title={member.fullName || member.username}
      className="w-9 h-9 rounded-full overflow-hidden ring-2 ring-[#1d2125] flex-shrink-0 bg-indigo-600 flex items-center justify-center"
    >
      {url && imgOk ? (
        <img src={url} alt={member.fullName} className="w-full h-full object-cover" onError={() => setImgOk(false)} />
      ) : (
        <span className="text-[13px] font-bold text-white">{initials}</span>
      )}
    </div>
  );
}

function DueBadge({ due, dueComplete }) {
  if (!due) return null;
  const date = new Date(due);
  const now = new Date();
  const diffMs = date - now;
  const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24));
  const label = date.toLocaleDateString('es-CO', { day: '2-digit', month: 'short' });

  let cls;
  if (dueComplete) cls = 'bg-emerald-700/80 text-emerald-100 border-emerald-500/20';
  else if (diffMs < 0) cls = 'bg-red-800/85 text-red-100 border-red-500/30';
  else if (diffDays <= 1) cls = 'bg-amber-600/85 text-amber-100 border-amber-400/30';
  else cls = 'bg-[#2a3040] text-slate-300 border-white/5';

  return (
    <span className={`inline-flex items-center gap-1.5 text-[14px] font-semibold px-3.5 py-2 rounded-full border ${cls}`}>
      <Clock className="w-4 h-4 flex-shrink-0" />
      {label}
    </span>
  );
}

function ChecklistProgress({ badges }) {
  const total = badges.checkItems || 0;
  if (!total) return null;
  const done = badges.checkItemsChecked || 0;
  const percent = Math.round((done / total) * 100);
  const doneAll = done === total;

  return (
    <div className="space-y-2 rounded-lg bg-[#111820]/70 border border-white/5 px-3.5 py-2.5">
      <div className="flex items-center justify-between gap-3">
        <span className="inline-flex items-center gap-1.5 text-[14px] font-semibold text-slate-300">
          <CheckSquare className={`w-4 h-4 ${doneAll ? 'text-emerald-400' : 'text-sky-400'}`} />
          Checklist
        </span>
        <span className={`text-[14px] font-bold ${doneAll ? 'text-emerald-400' : 'text-slate-400'}`}>
          {done}/{total} · {percent}%
        </span>
      </div>
      <div className="h-2.5 rounded-full bg-[#0b1118] overflow-hidden">
        <div
          className={`h-full rounded-full transition-all duration-300 ${doneAll ? 'bg-emerald-400' : 'bg-sky-400'}`}
          style={{ width: `${percent}%` }}
        />
      </div>
    </div>
  );
}

export default function TareaCard({ card, onEdit, onDelete, lists, onMove, onOpen }) {
  const [coverError, setCoverError] = useState(false);

  const coverUrl = coverError ? null : resolveCoverUrl(card);
  const coverColor = (!coverUrl && card.cover?.color)
    ? (TRELLO_COLORS[card.cover.color] || card.cover.color)
    : null;

  const labels = card.labels || [];
  const members = card.members || [];
  const badges = card.badges || {};
  const hasMetadata = Boolean(card.due || badges.comments || badges.attachments || badges.checkItems || members.length);

  const ageLabel = useMemo(() => {
    if (!card.due) return null;
    const diffDays = Math.ceil((new Date(card.due) - new Date()) / (1000 * 60 * 60 * 24));
    if (card.dueComplete) return 'Completada';
    if (diffDays < 0) return `${Math.abs(diffDays)} dia(s) vencida`;
    if (diffDays === 0) return 'Vence hoy';
    return `Vence en ${diffDays} dia(s)`;
  }, [card.due, card.dueComplete]);

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.96 }}
      whileHover={{ y: -4 }}
      transition={{ duration: 0.18, ease: 'easeOut' }}
      onClick={() => onOpen(card)}
      className="relative rounded-xl overflow-hidden cursor-pointer group select-none"
      style={{
        background: 'linear-gradient(150deg, #2a323a 0%, #20262c 100%)',
        boxShadow: '0 4px 12px rgba(0,0,0,0.48), 0 0 0 1px rgba(255,255,255,0.06)',
        transition: 'box-shadow 0.18s ease',
      }}
      onMouseEnter={e => {
        e.currentTarget.style.boxShadow =
          '0 12px 34px rgba(0,0,0,0.7), 0 0 0 1.5px rgba(87,157,255,0.34)';
      }}
      onMouseLeave={e => {
        e.currentTarget.style.boxShadow =
          '0 4px 12px rgba(0,0,0,0.48), 0 0 0 1px rgba(255,255,255,0.06)';
      }}
    >
      {coverUrl && (
        <div className="relative w-full overflow-hidden" style={{ height: 180 }}>
          <motion.img
            src={coverUrl}
            alt="Portada"
            className="w-full h-full object-cover"
            whileHover={{ scale: 1.05 }}
            transition={{ duration: 0.45 }}
            onError={() => setCoverError(true)}
            style={{ display: 'block' }}
          />
          <div className="absolute inset-x-0 bottom-0 h-20 pointer-events-none" style={{ background: 'linear-gradient(to top, #20262c 0%, transparent 100%)' }} />
        </div>
      )}

      {!coverUrl && coverColor && <div className="w-full h-11" style={{ backgroundColor: coverColor }} />}

      <div className="absolute top-3 right-3 z-20 flex gap-1.5 opacity-0 group-hover:opacity-100" style={{ transition: 'opacity 0.15s' }} onClick={e => e.stopPropagation()}>
        <button onClick={() => onEdit(card)} title="Editar" className="p-2 rounded-lg text-slate-300 hover:text-white hover:bg-indigo-600 transition-all" style={{ background: 'rgba(15,20,28,0.9)', backdropFilter: 'blur(6px)' }}>
          <Edit3 className="w-4 h-4" />
        </button>
        <button onClick={() => onDelete(card.id)} title="Archivar" className="p-2 rounded-lg text-slate-300 hover:text-red-300 hover:bg-red-900/70 transition-all" style={{ background: 'rgba(15,20,28,0.9)', backdropFilter: 'blur(6px)' }}>
          <Trash2 className="w-4 h-4" />
        </button>
        <button onClick={() => onOpen(card)} title="Ver detalle" className="p-2 rounded-lg text-slate-300 hover:text-white hover:bg-[#2a3548] transition-all" style={{ background: 'rgba(15,20,28,0.9)', backdropFilter: 'blur(6px)' }}>
          <Eye className="w-4 h-4" />
        </button>
      </div>

      <div className={`px-5 pb-5 space-y-4 ${coverUrl ? 'pt-2.5' : 'pt-5'}`}>
        {labels.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {labels.map((label, idx) => (
              <motion.span
                key={label.id || idx}
                title={label.name || label.color}
                whileHover={{ scaleX: 1.08, scaleY: 1.18 }}
                transition={{ duration: 0.12 }}
                className="h-3 min-w-[52px] max-w-[96px] rounded-full cursor-pointer inline-block"
                style={{ backgroundColor: TRELLO_COLORS[label.color] || label.color || '#8590A2', transformOrigin: 'left center' }}
              />
            ))}
          </div>
        )}

        <p className="text-[19px] font-bold leading-[1.42] text-[#d6dee7] group-hover:text-white" style={{ transition: 'color 0.2s' }}>
          {card.name}
        </p>

        {card.desc && <p className="text-[15px] text-slate-400 line-clamp-3 leading-relaxed">{card.desc}</p>}

        <ChecklistProgress badges={badges} />

        {ageLabel && (
          <div className="inline-flex items-center gap-2 text-[14px] text-slate-400">
            <CalendarClock className="w-5 h-5 text-slate-500" />
            <span>{ageLabel}</span>
          </div>
        )}

        {hasMetadata && (
          <div className="flex flex-wrap items-center gap-2 pt-0.5">
            <DueBadge due={card.due} dueComplete={card.dueComplete} />

            {badges.subscribed && <Eye className="w-5 h-5 text-slate-500" title="Suscrito" />}
            {badges.comments > 0 && <span className="inline-flex items-center gap-1 text-[14px] text-slate-400 hover:text-slate-200 transition-colors"><MessageSquare className="w-4 h-4" />{badges.comments}</span>}
            {badges.attachments > 0 && <span className="inline-flex items-center gap-1 text-[14px] text-slate-400 hover:text-slate-200 transition-colors"><Paperclip className="w-4 h-4" />{badges.attachments}</span>}

            {members.length > 0 && (
              <div className="ml-auto flex -space-x-2">
                {members.slice(0, 5).map(m => <MemberAvatar key={m.id} member={m} />)}
                {members.length > 5 && <div className="w-9 h-9 rounded-full ring-2 ring-[#1d2125] bg-slate-700 flex items-center justify-center text-[11px] font-bold text-slate-300">+{members.length - 5}</div>}
              </div>
            )}
          </div>
        )}
      </div>
    </motion.div>
  );
}
