'use strict';

// Ventanas operativas para la interpretación de "Eventos diarios" (spec 0010).
// Jornada partida. Hora local Bogotá. Todo configurable por env.
//   CCTV_WIN_OPEN_AM       apertura mañana   (default 05:00-09:30)
//   CCTV_WIN_CLOSE_MIDDAY  cierre mediodía   (default 13:00-14:00)
//   CCTV_WIN_OPEN_PM       apertura tarde    (default 15:00-17:00)
//   CCTV_WIN_CLOSE_PM      cierre noche      (default 18:00-22:00)
//   CCTV_PING_EVENT_TOLERANCE_MIN  desfase máx. ping↔evento sin marcar inconsistencia (20)

const DEFAULTS = {
  CCTV_WIN_OPEN_AM: '05:00-09:30',
  CCTV_WIN_CLOSE_MIDDAY: '13:00-14:00',
  CCTV_WIN_OPEN_PM: '15:00-17:00',
  CCTV_WIN_CLOSE_PM: '18:00-22:00',
};

function toMinutes(hhmm) {
  const m = /^(\d{1,2}):(\d{2})$/.exec(String(hhmm || '').trim());
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h > 23 || min > 59) return null;
  return h * 60 + min;
}

/** "HH:MM-HH:MM" -> { startMin, endMin }. Devuelve null si no parsea. */
function parseWindow(spec) {
  const [a, b] = String(spec || '').split('-');
  const startMin = toMinutes(a);
  const endMin = toMinutes(b);
  if (startMin == null || endMin == null) return null;
  return { startMin, endMin };
}

/** ¿el minuto del día `m` cae en la ventana (soporta ventanas que cruzan medianoche)? */
function inWindow(m, win) {
  if (m == null || !win) return false;
  return win.startMin <= win.endMin
    ? m >= win.startMin && m <= win.endMin
    : m >= win.startMin || m <= win.endMin;
}

/**
 * Ventana con "gracia": una apertura puede ser tardía (hasta `graceMin` después
 * del fin) y un cierre temprano (hasta `graceMin` antes del inicio). Se usa para
 * *asignar* la fase; el retraso (`lateBy`) se mide contra la ventana estricta.
 */
function withGrace(win, graceMin) {
  const g = Math.max(0, Number(graceMin) || 0);
  return win.kind === 'CLOSE'
    ? { ...win, startMin: Math.max(0, win.startMin - g), endMin: win.endMin }
    : { ...win, startMin: win.startMin, endMin: Math.min(1439, win.endMin + g) };
}

function loadWindowConfig(env = process.env) {
  const read = (key) => parseWindow(env[key] || DEFAULTS[key]) || parseWindow(DEFAULTS[key]);
  return {
    windows: {
      APERTURA_MANANA: { ...read('CCTV_WIN_OPEN_AM'), kind: 'OPEN', label: 'Apertura mañana' },
      CIERRE_MEDIODIA: { ...read('CCTV_WIN_CLOSE_MIDDAY'), kind: 'CLOSE', label: 'Cierre mediodía' },
      APERTURA_TARDE: { ...read('CCTV_WIN_OPEN_PM'), kind: 'OPEN', label: 'Apertura tarde' },
      CIERRE_NOCHE: { ...read('CCTV_WIN_CLOSE_PM'), kind: 'CLOSE', label: 'Cierre noche' },
    },
    toleranceMin: Math.max(1, Number(env.CCTV_PING_EVENT_TOLERANCE_MIN) || 20),
    graceMin: Math.max(0, Number(env.CCTV_WIN_GRACE_MIN) || 150),
  };
}

module.exports = { DEFAULTS, toMinutes, parseWindow, inWindow, withGrace, loadWindowConfig };
