'use strict';

const { inWindow, withGrace } = require('./window-config');

const DERIVED_OPENING_TYPES = new Set(['TRIPWIRE', 'CABLE_TRAMPA']);
const NON_OPERATIONAL_EVENT_TYPES = new Set(['MOTION', 'MOVIMIENTO', 'DISCARDED']);

function isOperationalOpeningSignal(event) {
  if (event?.eventType === 'OPENING') return true;
  return DERIVED_OPENING_TYPES.has(event?.eventType) && event?.phase !== 'FIN';
}

function asOperationalOpeningEvidence(event) {
  if (!isOperationalOpeningSignal(event)) return event;
  return {
    ...event,
    evidenceType: 'OPENING',
    operationalInterpretation: 'FIRST_OPENING',
    operationalSourceType: event.eventType,
  };
}

function isOperationalOpeningEvidence(event) {
  return (event?.evidenceType || event?.eventType) === 'OPENING';
}

// -------------------------------------------------------------------------
// Interpretación operativa por 4 ventanas + ping SIIS (spec 0010)
//
// El PING es el vector primario: no todos los puntos tienen CCTV que notifique
// por detección, pero todos tienen ping. El evento CCTV se adjunta como prueba
// visual y sirve para detectar inconsistencias de configuración de notificación.
// -------------------------------------------------------------------------

const BOGOTA_TZ = 'America/Bogota';

/** Minutos del día (hora local Bogotá) de un timestamp. */
function localMinutes(value) {
  if (!value) return null;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: BOGOTA_TZ, hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).formatToParts(d);
  const h = Number(parts.find((p) => p.type === 'hour')?.value);
  const m = Number(parts.find((p) => p.type === 'minute')?.value);
  return h * 60 + m;
}

const stampOf = (x) => x?.at || x?.occurredAt || x?.receivedAt || null;

/** Señal de ping para una ventana: transición hacia el estado esperado dentro de
 *  la ventana; si no hay transición, el primer/último ping online en la ventana. */
function pingSignalForWindow(pings, win) {
  const rows = [...(pings || [])]
    .filter((p) => stampOf(p) != null)
    .sort((a, b) => new Date(stampOf(a)) - new Date(stampOf(b)));
  if (!rows.length) return null;

  const online = (p) => p.online === 1 || p.online === true;

  if (win.kind === 'OPEN') {
    for (let i = 0; i < rows.length; i += 1) {
      const m = localMinutes(stampOf(rows[i]));
      if (!inWindow(m, win)) continue;
      if (online(rows[i]) && (i === 0 || !online(rows[i - 1]))) return { at: stampOf(rows[i]), kind: 'TRANSITION' };
    }
    const firstOnline = rows.find((p) => online(p) && inWindow(localMinutes(stampOf(p)), win));
    return firstOnline ? { at: stampOf(firstOnline), kind: 'PRESENCE' } : null;
  }

  // CLOSE
  for (let i = 0; i < rows.length; i += 1) {
    const m = localMinutes(stampOf(rows[i]));
    if (!inWindow(m, win)) continue;
    if (!online(rows[i]) && i > 0 && online(rows[i - 1])) return { at: stampOf(rows[i]), kind: 'TRANSITION' };
  }
  const lastOnline = [...rows].reverse().find((p) => online(p) && inWindow(localMinutes(stampOf(p)), win));
  return lastOnline ? { at: stampOf(lastOnline), kind: 'PRESENCE' } : null;
}

function isOperationalEvent(ev) {
  return !NON_OPERATIONAL_EVENT_TYPES.has(ev?.eventType) && ev?.phase !== 'FIN';
}

/**
 * Interpreta la operación de un punto en un día.
 * @param {object} point { locationId, name, coverage:'WITH_CCTV'|'PING_ONLY',
 *                          events:[{id,eventType,phase,at,hasAttachment}],
 *                          pings:[{at,online}] }
 * @param {object} cfg   { windows, toleranceMin }  (de loadWindowConfig)
 */
function interpretPointDay(point, cfg) {
  const { windows, toleranceMin, graceMin = 150 } = cfg;
  const coverage = point.coverage === 'PING_ONLY' ? 'PING_ONLY' : 'WITH_CCTV';
  const events = (point.events || []).filter(isOperationalEvent)
    .filter((e) => stampOf(e) != null)
    .sort((a, b) => new Date(stampOf(a)) - new Date(stampOf(b)));

  const phases = {};
  const missingDetections = [];
  const anomalies = [];
  let notificationConfigInconsistency = false;

  // Ventanas con gracia, pero recortadas para no invadir la ventana vecina
  // (p. ej. la gracia de "apertura tarde" no debe llegar a "cierre noche").
  const ordered = Object.entries(windows).sort((a, b) => a[1].startMin - b[1].startMin);
  const graceWindows = {};
  ordered.forEach(([name, win], idx) => {
    const g = withGrace(win, graceMin);
    const prev = ordered[idx - 1]?.[1];
    const next = ordered[idx + 1]?.[1];
    graceWindows[name] = {
      ...g,
      startMin: prev ? Math.max(g.startMin, prev.endMin + 1) : g.startMin,
      endMin: next ? Math.min(g.endMin, next.startMin - 1) : g.endMin,
    };
  });

  for (const [name, win] of Object.entries(windows)) {
    const gwin = graceWindows[name];
    const ping = pingSignalForWindow(point.pings, gwin);
    const evidence = events.find((e) => inWindow(localMinutes(stampOf(e)), gwin)) || null;

    // Preferencia de fuente para el timestamp de la fase:
    //   transición de ping (offline<->online, evento real) > evidencia CCTV
    //   (actividad física real) > presencia de ping ("el monitoreo estaba activo").
    let at = null;
    let source = null;
    if (ping && ping.kind === 'TRANSITION') { at = ping.at; source = 'PING'; }
    else if (evidence) { at = stampOf(evidence); source = 'CCTV'; }
    else if (ping) { at = ping.at; source = 'PING_PRESENCE'; }
    if (at == null) { phases[name] = null; continue; }

    const atMin = localMinutes(at);
    const lateBy = win.kind === 'OPEN' && atMin > win.endMin ? atMin - win.endMin
      : win.kind === 'CLOSE' && atMin < win.startMin ? win.startMin - atMin
        : 0;

    const phase = { phase: name, label: win.label, kind: win.kind, at, source, lateBy, evidence };
    if (coverage === 'WITH_CCTV') {
      if (source === 'PING' && evidence) {
        const gap = Math.abs(localMinutes(stampOf(evidence)) - atMin);
        if (gap > toleranceMin) { phase.pingEventGapMin = gap; notificationConfigInconsistency = true; }
      }
      // El ping dice que el punto operó en esta ventana pero el CCTV nunca notificó.
      if ((source === 'PING' || source === 'PING_PRESENCE') && !evidence) {
        missingDetections.push(name);
        notificationConfigInconsistency = true;
      }
    }
    phases[name] = phase;
  }

  for (const e of events) {
    const m = localMinutes(stampOf(e));
    if (!Object.values(graceWindows).some((w) => inWindow(m, w))) {
      anomalies.push({ kind: 'DETECTION_OUT_OF_WINDOW', at: stampOf(e), eventType: e.eventType, eventId: e.id ?? null });
    }
  }

  const opened = phases.APERTURA_MANANA || phases.APERTURA_TARDE;
  const closedOrNight = phases.CIERRE_MEDIODIA || phases.CIERRE_NOCHE;
  let interpretation = 'NORMAL';
  if (!opened && !closedOrNight && !anomalies.length) interpretation = 'SIN_ACTIVIDAD';
  else if (!opened && closedOrNight) interpretation = 'CIERRE_SIN_APERTURA';

  return {
    locationId: point.locationId ?? null,
    name: point.name ?? null,
    coverage,
    phases,
    missingDetections,
    anomalies,
    notificationConfigInconsistency,
    interpretation,
  };
}

/** Interpreta una lista de puntos. `points` como en interpretPointDay. */
function interpretDailyOperations(points, cfg) {
  return (points || []).map((point) => interpretPointDay(point, cfg));
}

module.exports = {
  isOperationalOpeningSignal,
  asOperationalOpeningEvidence,
  isOperationalOpeningEvidence,
  localMinutes,
  pingSignalForWindow,
  interpretPointDay,
  interpretDailyOperations,
};
