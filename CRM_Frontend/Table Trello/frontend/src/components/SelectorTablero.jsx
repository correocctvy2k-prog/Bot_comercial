import React, { useState } from 'react';
import { LayoutGrid, ChevronDown, Check } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

export default function SelectorTablero({ tableros, tableroSeleccionado, onSelect }) {
  const [isOpen, setIsOpen] = useState(false);

  const handleSelect = (board) => {
    onSelect(board);
    setIsOpen(false);
  };

  const selected = tableros.find(b => b.id === tableroSeleccionado);
  const selectedName = selected?.name || 'Selecciona un tablero...';

  // Color de fondo del tablero (de sus prefs)
  const getBoardColor = (board) => board?.prefs?.backgroundColor || '#0079BF';

  return (
    <div className="relative z-40">
      <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2 font-outfit">
        Tablero Trello Activo
      </label>

      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center justify-between w-full md:w-72 px-4 py-3 text-left font-medium text-sm text-slate-200 rounded-xl transition-all"
        style={{
          background: 'rgba(18,22,28,0.7)',
          border: '1px solid rgba(46,57,74,0.8)',
          backdropFilter: 'blur(8px)',
          boxShadow: '0 2px 8px rgba(0,0,0,0.3)',
        }}
        onMouseEnter={e => (e.currentTarget.style.borderColor = 'rgba(87,157,255,0.4)')}
        onMouseLeave={e => (e.currentTarget.style.borderColor = 'rgba(46,57,74,0.8)')}
      >
        <div className="flex items-center gap-2.5 min-w-0">
          {/* Chip de color del tablero */}
          {selected && (
            <span
              className="w-3 h-3 rounded-sm flex-shrink-0"
              style={{ backgroundColor: getBoardColor(selected) }}
            />
          )}
          {!selected && <LayoutGrid className="w-4 h-4 text-indigo-400 flex-shrink-0" />}
          <span className="truncate">{selectedName}</span>
        </div>
        <motion.span animate={{ rotate: isOpen ? 180 : 0 }} transition={{ duration: 0.2 }}>
          <ChevronDown className="w-4 h-4 text-slate-400 flex-shrink-0 ml-2" />
        </motion.span>
      </button>

      <AnimatePresence>
        {isOpen && (
          <>
            <div className="fixed inset-0 z-10" onClick={() => setIsOpen(false)} />
            <motion.ul
              initial={{ opacity: 0, y: -6, scale: 0.97 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -6, scale: 0.97 }}
              transition={{ duration: 0.15 }}
              className="absolute left-0 mt-2 w-full md:w-72 max-h-64 overflow-y-auto rounded-xl z-20 py-1"
              style={{
                background: 'rgba(20,25,32,0.95)',
                border: '1px solid rgba(46,57,74,0.8)',
                boxShadow: '0 16px 40px rgba(0,0,0,0.6)',
                backdropFilter: 'blur(12px)',
              }}
            >
              {tableros.length === 0 ? (
                <li className="px-4 py-3 text-xs text-slate-500 italic">
                  No se encontraron tableros en este workspace
                </li>
              ) : (
                tableros.map(board => (
                  <li key={board.id}>
                    <button
                      onClick={() => handleSelect(board)}
                      className="flex items-center gap-3 w-full px-4 py-2.5 text-left text-sm text-slate-300 hover:text-white transition-all"
                      onMouseEnter={e => (e.currentTarget.style.background = 'rgba(87,157,255,0.1)')}
                      onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                    >
                      {/* Color chip */}
                      <span
                        className="w-3 h-3 rounded-sm flex-shrink-0"
                        style={{ backgroundColor: getBoardColor(board) }}
                      />
                      <span className="truncate flex-grow font-outfit text-[13px]">
                        {board.name}
                      </span>
                      {tableroSeleccionado === board.id && (
                        <Check className="w-3.5 h-3.5 text-indigo-400 flex-shrink-0" />
                      )}
                    </button>
                  </li>
                ))
              )}
            </motion.ul>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}
