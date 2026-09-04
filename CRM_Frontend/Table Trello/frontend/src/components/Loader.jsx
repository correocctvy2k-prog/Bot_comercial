import React from 'react';

export default function Loader({ message = 'Cargando datos de Trello...' }) {
  return (
    <div className="flex flex-col items-center justify-center min-h-[300px] space-y-4">
      {/* Spinner elegante con gradiente y glow */}
      <div className="relative w-16 h-16">
        <div className="absolute inset-0 rounded-full border-4 border-brand-900/30"></div>
        <div className="absolute inset-0 rounded-full border-4 border-t-brand-500 border-r-brand-500 animate-spin glow-active"></div>
      </div>
      <p className="text-slate-400 font-medium font-outfit text-sm animate-pulse tracking-wide">
        {message}
      </p>
    </div>
  );
}
