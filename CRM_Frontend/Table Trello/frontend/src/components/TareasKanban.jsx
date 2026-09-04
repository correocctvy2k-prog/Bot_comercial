import React from 'react';
import TareaCard from './TareaCard';
import { Plus, ListTodo, BarChart3 } from 'lucide-react';
import { AnimatePresence, motion } from 'framer-motion';

function ColumnHeader({ name, count, completed, total, onAdd }) {
  const percent = total ? Math.round((completed / total) * 100) : 0;

  return (
    <div
      className="px-5 py-5 rounded-t-2xl space-y-4"
      style={{
        background: 'linear-gradient(180deg, #2c3440 0%, #252d36 100%)',
        borderBottom: '1px solid rgba(255,255,255,0.06)',
      }}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 space-y-1">
          <h3 className="font-bold text-[18px] text-[#d6dee7] truncate leading-tight">
            {name}
          </h3>
          <div className="flex items-center gap-2 text-[14px] text-slate-500">
            <BarChart3 className="w-4 h-4" />
            <span>{count} tarea{count === 1 ? '' : 's'}</span>
          </div>
        </div>
        <button
          onClick={onAdd}
          title="Añadir tarjeta"
          className="p-2.5 rounded-lg text-slate-400 hover:text-white transition-all flex-shrink-0"
          onMouseEnter={e => (e.currentTarget.style.background = 'rgba(87,157,255,0.18)')}
          onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
        >
          <Plus className="w-[22px] h-[22px]" />
        </button>
      </div>

      {total > 0 && (
        <div className="space-y-1.5">
          <div className="flex items-center justify-between text-[13px] font-semibold text-slate-500">
            <span>Avance checklist</span>
            <span>{percent}%</span>
          </div>
          <div className="h-2.5 rounded-full bg-[#141b24] overflow-hidden">
            <div className="h-full rounded-full bg-emerald-400 transition-all duration-300" style={{ width: `${percent}%` }} />
          </div>
        </div>
      )}
    </div>
  );
}

function ColumnFooter({ onAdd }) {
  return (
    <button
      onClick={onAdd}
      className="w-full flex items-center gap-2 px-4 py-3 text-[15px] text-slate-500 hover:text-slate-200 rounded-b-2xl transition-all"
      style={{
        background: 'linear-gradient(180deg, #252d36 0%, #20262c 100%)',
        borderTop: '1px solid rgba(255,255,255,0.05)',
      }}
      onMouseEnter={e => (e.currentTarget.style.background = 'linear-gradient(180deg, #2d3845 0%, #252d36 100%)')}
      onMouseLeave={e => (e.currentTarget.style.background = 'linear-gradient(180deg, #252d36 0%, #20262c 100%)')}
    >
      <Plus className="w-5 h-5 opacity-70" />
      <span>Añadir una tarjeta</span>
    </button>
  );
}

function checklistTotals(cards) {
  const items = cards.flatMap(card => (card.checklists || []).flatMap(checklist => checklist.checkItems || []));
  return {
    total: items.length,
    completed: items.filter(item => item.state === 'complete').length
  };
}

export default function TareasKanban({
  listas, tarjetas, onCardEdit, onCardDelete, onCardMove, onAddCardClick, onCardOpen, compact = false
}) {
  if (listas.length === 0) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex flex-col items-center justify-center min-h-[350px] rounded-2xl"
        style={{ border: '1px dashed rgba(100,116,139,0.2)', background: 'rgba(15,20,28,0.4)' }}
      >
        <ListTodo className="w-14 h-14 text-slate-700 mb-4" />
        <p className="text-slate-500 text-sm text-center leading-relaxed">
          Este tablero no tiene listas activas.<br />
          <span className="text-slate-700 text-xs">Selecciona otro tablero o espacio de trabajo.</span>
        </p>
      </motion.div>
    );
  }

  return (
    <div className={compact ? "flex gap-3 overflow-x-auto pb-4" : "flex gap-4 overflow-x-auto pb-7"} style={{ minHeight: compact ? '58vh' : '66vh' }}>
      {listas.map((lista, colIdx) => {
        const tarjetasLista = tarjetas.filter(t => t.idList === lista.id);
        const totals = checklistTotals(tarjetasLista);

        return (
          <motion.div
            key={lista.id}
            initial={{ opacity: 0, x: -10 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: colIdx * 0.05, duration: 0.28 }}
            className="flex-shrink-0 flex flex-col rounded-2xl overflow-hidden"
            style={{
              width: compact ? 318 : 390,
              background: 'linear-gradient(170deg, #20262d 0%, #1a2027 100%)',
              boxShadow: '0 3px 18px rgba(0,0,0,0.42), 0 0 0 1px rgba(255,255,255,0.05)',
            }}
          >
            <ColumnHeader
              name={lista.name}
              count={tarjetasLista.length}
              completed={totals.completed}
              total={totals.total}
              onAdd={() => onAddCardClick(lista.id)}
            />

            <div
              className="flex-grow overflow-y-auto px-3.5 py-3.5 space-y-3.5"
              style={{
                maxHeight: compact ? '62vh' : '70vh',
                scrollbarWidth: 'thin',
                scrollbarColor: 'rgba(255,255,255,0.12) transparent',
              }}
            >
              <AnimatePresence mode="popLayout">
                {tarjetasLista.length === 0 ? (
                  <motion.div
                    key="empty"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className="flex items-center justify-center py-12 text-xs text-slate-700 italic"
                  >
                    Sin tareas
                  </motion.div>
                ) : (
                  tarjetasLista.map(tarjeta => (
                    <TareaCard
                      key={tarjeta.id}
                      card={tarjeta}
                      onEdit={onCardEdit}
                      onDelete={onCardDelete}
                      lists={listas}
                      onMove={onCardMove}
                      onOpen={onCardOpen}
                    />
                  ))
                )}
              </AnimatePresence>
            </div>

            <ColumnFooter onAdd={() => onAddCardClick(lista.id)} />
          </motion.div>
        );
      })}
    </div>
  );
}


