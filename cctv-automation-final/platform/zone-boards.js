'use strict';

// spec 0011 · Tanda 4 — estado operativo por punto y día, agrupado por zona,
// para las "tarjetas por zona con cubos de estado" de Eventos diarios.
// Se calcula sobre los operationalDays que ya produce interpretDailyOperations
// (spec 0010): no hace consultas nuevas.

const STATES = Object.freeze(['ON_TIME', 'LATE', 'CLOSED', 'IDLE', 'ANOMALY']);
// Prioridad cuando aplica más de un estado.
const STATE_PRIORITY = Object.freeze(['ANOMALY', 'LATE', 'CLOSED', 'ON_TIME', 'IDLE']);

const NONE_ZONE = '__NONE__';

/** Estado de un punto en el día a partir de su operationalDay (spec 0010). */
function pointState(day) {
  const opened = day.phases?.APERTURA_MANANA || day.phases?.APERTURA_TARDE || null;
  const closed = day.phases?.CIERRE_NOCHE || day.phases?.CIERRE_MEDIODIA || null;
  if (day.interpretation === 'CIERRE_SIN_APERTURA' || (day.anomalies && day.anomalies.length > 0)) return 'ANOMALY';
  if (opened && opened.lateBy > 0) return 'LATE';
  if (closed) return 'CLOSED';
  if (opened) return 'ON_TIME';
  return 'IDLE';
}

/**
 * @param {Array} operationalDays  salida de interpretDailyOperations
 * @param {Map}   zoneByLoc        locationId -> zona (o null)
 * @returns {Array} zoneBoards
 */
function buildZoneBoards(operationalDays, zoneByLoc) {
  const boards = new Map();
  for (const d of operationalDays || []) {
    const zone = (zoneByLoc && zoneByLoc.get(d.locationId)) || null;
    const key = zone || NONE_ZONE;
    let board = boards.get(key);
    if (!board) {
      board = { zone, total: 0, counts: { ON_TIME: 0, LATE: 0, CLOSED: 0, IDLE: 0, ANOMALY: 0 }, points: [] };
      boards.set(key, board);
    }
    const state = pointState(d);
    const opened = d.phases?.APERTURA_MANANA || d.phases?.APERTURA_TARDE || null;
    board.total += 1;
    board.counts[state] += 1;
    board.points.push({
      locationId: d.locationId,
      name: d.name,
      state,
      openingAt: opened ? opened.at : null,
      lateBy: opened ? opened.lateBy : 0,
    });
  }
  const orderOf = (s) => STATE_PRIORITY.indexOf(s);
  return [...boards.values()]
    .map((b) => ({
      ...b,
      points: b.points.sort((x, y) => orderOf(x.state) - orderOf(y.state) || String(x.name || '').localeCompare(String(y.name || ''))),
    }))
    .sort((a, b) => (a.zone === null) - (b.zone === null) || b.total - a.total || String(a.zone || '').localeCompare(String(b.zone || '')));
}

module.exports = { STATES, STATE_PRIORITY, pointState, buildZoneBoards };
