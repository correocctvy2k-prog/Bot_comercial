'use strict';

// spec 0015 — ventana simple de horario de operación (sin distinción pico/normal, a
// diferencia de siis-observer-policy.js), usada para gatear el sync SIISS horario
// (scripts/sync-siiss-points.js vía run-operational-cycle.js). Copia independiente de
// src/services/businessHours.service.js (proyecto raíz comercial-bot): son paquetes Node
// separados, se duplica esta lógica chica en vez de importar entre uno y otro.

function parseClock(value) {
  const match = String(value || '').trim().match(/^(\d{1,2}):(\d{2})$/);
  if (!match) throw new Error(`Hora inválida: ${value}`);
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (hour > 23 || minute > 59) throw new Error(`Hora fuera de rango: ${value}`);
  return hour * 60 + minute;
}

function isWithinOperationalWindow(date = new Date(), env = process.env) {
  const start = parseClock(env.POINTS_OPERATIONAL_WINDOW_START || '05:30');
  const end = parseClock(env.POINTS_OPERATIONAL_WINDOW_END || '22:30');
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-US', { timeZone: 'America/Bogota', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })
      .formatToParts(date).filter((p) => p.type !== 'literal').map((p) => [p.type, Number(p.value)]),
  );
  const clock = parts.hour * 60 + parts.minute;
  return clock >= start && clock < end;
}

module.exports = { parseClock, isWithinOperationalWindow };
