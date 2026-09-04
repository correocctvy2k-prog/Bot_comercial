import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Calendar, AlignLeft, CheckSquare, Plus } from 'lucide-react';

export default function TareaModal({ isOpen, onClose, onSave, card = null, listId = null }) {
  const [name, setName] = useState('');
  const [desc, setDesc] = useState('');
  const [due, setDue] = useState('');

  // Sincronizar datos si es modo edición (card != null)
  useEffect(() => {
    if (card) {
      setName(card.name || '');
      setDesc(card.desc || '');
      // Formatear fecha para datetime-local input (YYYY-MM-DDThh:mm)
      if (card.due) {
        const date = new Date(card.due);
        const tzoffset = date.getTimezoneOffset() * 60000;
        const localISOTime = new Date(date.getTime() - tzoffset).toISOString().slice(0, 16);
        setDue(localISOTime);
      } else {
        setDue('');
      }
    } else {
      setName('');
      setDesc('');
      setDue('');
    }
  }, [card, isOpen]);

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!name.trim()) return;

    onSave({
      id: card?.id,
      name,
      desc,
      due: due ? new Date(due).toISOString() : null,
      idList: card?.idList || listId
    });
    onClose();
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          {/* Backdrop con blur */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 bg-[#020205]/75 backdrop-blur-sm"
          ></motion.div>

          {/* Contenido Modal */}
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 20 }}
            transition={{ type: 'spring', duration: 0.4 }}
            className="w-full max-w-lg glass-panel p-6 rounded-2xl relative z-10 shadow-2xl border-[#2e2e42]"
          >
            {/* Botón cerrar */}
            <button
              onClick={onClose}
              className="absolute top-4 right-4 p-1.5 hover:bg-[#252538] rounded-lg text-slate-400 hover:text-white transition-colors"
            >
              <X className="w-5 h-5" />
            </button>

            <h3 className="text-lg font-bold font-outfit text-white mb-6 flex items-center gap-2">
              {card ? (
                <>
                  <CheckSquare className="w-5 h-5 text-brand-400" />
                  Editar Tarjeta
                </>
              ) : (
                <>
                  <Plus className="w-5 h-5 text-brand-400" />
                  Nueva Tarjeta
                </>
              )}
            </h3>

            <form onSubmit={handleSubmit} className="space-y-5">
              {/* Nombre de la tarjeta */}
              <div className="space-y-2">
                <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider font-outfit">
                  Nombre de la Tarea <span className="text-brand-400">*</span>
                </label>
                <input
                  type="text"
                  required
                  placeholder="Ej: Mantener servidor central de base de datos"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full glass-input"
                />
              </div>

              {/* Descripción */}
              <div className="space-y-2">
                <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider font-outfit flex items-center gap-1.5">
                  <AlignLeft className="w-4 h-4 text-slate-400" />
                  Descripción
                </label>
                <textarea
                  rows={4}
                  placeholder="Detalles sobre las tareas a ejecutar, requerimientos del cliente, etc..."
                  value={desc}
                  onChange={(e) => setDesc(e.target.value)}
                  className="w-full glass-input resize-none"
                />
              </div>

              {/* Fecha de vencimiento */}
              <div className="space-y-2">
                <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider font-outfit flex items-center gap-1.5">
                  <Calendar className="w-4 h-4 text-slate-400" />
                  Fecha y Hora Límite
                </label>
                <input
                  type="datetime-local"
                  value={due}
                  onChange={(e) => setDue(e.target.value)}
                  className="w-full glass-input"
                />
              </div>

              {/* Acciones */}
              <div className="flex justify-end space-x-3 pt-4 border-t border-[#1f1f2e]">
                <button
                  type="button"
                  onClick={onClose}
                  className="px-4 py-2.5 rounded-xl font-semibold text-sm text-slate-400 hover:text-white hover:bg-[#1a1a26] transition-all border border-transparent hover:border-[#2e2e42]"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-5 py-2.5 bg-brand-600 hover:bg-brand-500 active:bg-brand-700 text-white font-semibold text-sm rounded-xl shadow-lg hover:shadow-glow-purple/20 transition-all"
                >
                  Guardar Tarjeta
                </button>
              </div>
            </form>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
