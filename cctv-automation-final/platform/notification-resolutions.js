'use strict';

// spec 0011 · Tanda 3 — resolución de "Inconsistencias de notificación CCTV".
// Tabla cctv_notification_resolutions (ver schema.sql). Tres resoluciones:
//   PING_ONLY                el punto no tiene CCTV que notifique. Persistente:
//                            fuerza coverage=PING_ONLY en la interpretación, con
//                            lo que deja de evaluarse como inconsistente.
//   MISCONFIGURED_NO_NOTIFY  cámara sin notificación configurada. Persistente:
//                            sale de "activas" y pasa a "en seguimiento".
//   FALSE_POSITIVE           la incidencia de ESA fecha no es real. Se silencia
//                            solo para effective_date.

const crypto = require('node:crypto');

const RESOLUTIONS = Object.freeze(['PING_ONLY', 'MISCONFIGURED_NO_NOTIFY', 'FALSE_POSITIVE']);
// Cada resolución tiene un scope fijo; el cliente no lo elige.
const SCOPE_BY_RESOLUTION = Object.freeze({
  PING_ONLY: 'PERSISTENT',
  MISCONFIGURED_NO_NOTIFY: 'PERSISTENT',
  FALSE_POSITIVE: 'DATE',
});

function isValidResolution(value) {
  return RESOLUTIONS.includes(value);
}

/** Normaliza y valida el cuerpo de POST /notifications/:id/resolve.
 *  Devuelve { resolution, scope, effectiveDate, note } o lanza Error con .status. */
function normalizeResolveInput(body, today) {
  const resolution = String(body?.resolution || '').trim().toUpperCase();
  if (!isValidResolution(resolution)) {
    const err = new Error(`resolution debe ser una de: ${RESOLUTIONS.join(', ')}`);
    err.status = 400;
    throw err;
  }
  const scope = SCOPE_BY_RESOLUTION[resolution];
  const effectiveDate = scope === 'DATE'
    ? (/^\d{4}-\d{2}-\d{2}$/.test(String(body?.effectiveDate || '')) ? body.effectiveDate : today)
    : null;
  const note = body?.note != null ? String(body.note).slice(0, 500) : null;
  return { resolution, scope, effectiveDate, note };
}

/** Resoluciones vigentes para una fecha dada.
 *  @returns { pingOnlyForced:Set, followUp:Set, silenced:Set, count:number } */
function loadActiveResolutions(db, date) {
  const rows = db.prepare(
    'SELECT location_id, resolution, scope, effective_date FROM cctv_notification_resolutions WHERE active = 1',
  ).all();
  const pingOnlyForced = new Set();
  const followUp = new Set();
  const silenced = new Set();
  for (const r of rows) {
    if (r.resolution === 'PING_ONLY') pingOnlyForced.add(r.location_id);
    else if (r.resolution === 'MISCONFIGURED_NO_NOTIFY') followUp.add(r.location_id);
    else if (r.resolution === 'FALSE_POSITIVE' && r.effective_date === date) silenced.add(r.location_id);
  }
  return { pingOnlyForced, followUp, silenced, count: pingOnlyForced.size + followUp.size + silenced.size };
}

/** Inserta una resolución. Idempotente por (location_id, resolution, effective_date)
 *  entre las activas: si ya existe una equivalente activa, se reutiliza. */
function insertResolution(db, { locationId, resolution, scope, effectiveDate, note, actor }) {
  const now = new Date().toISOString();
  const existing = db.prepare(
    `SELECT id FROM cctv_notification_resolutions
     WHERE active = 1 AND location_id = ? AND resolution = ?
       AND ((effective_date IS NULL AND ? IS NULL) OR effective_date = ?)`,
  ).get(locationId, resolution, effectiveDate, effectiveDate);
  if (existing) {
    if (note != null) {
      db.prepare('UPDATE cctv_notification_resolutions SET note = ?, decided_by = ?, decided_at = ? WHERE id = ?')
        .run(note, actor, now, existing.id);
    }
    return { id: existing.id, reused: true };
  }
  const id = crypto.randomUUID();
  db.exec('BEGIN IMMEDIATE');
  try {
    db.prepare(
      `INSERT INTO cctv_notification_resolutions
       (id, location_id, resolution, scope, effective_date, note, decided_by, decided_at, active)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1)`,
    ).run(id, locationId, resolution, scope, effectiveDate, note, actor, now);
    db.prepare(
      `INSERT INTO audit_log(id, entity_type, entity_id, action, actor, occurred_at, source_system, before_json, after_json, correlation_id)
       VALUES (?, 'CCTV_NOTIFICATION', ?, 'NOTIFICATION_RESOLVED', ?, ?, 'SKYLAB_CCTV', NULL, ?, ?)`,
    ).run(crypto.randomUUID(), locationId, actor, now, JSON.stringify({ resolution, scope, effectiveDate, note, spec: '0011' }), crypto.randomUUID());
    db.exec('COMMIT');
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
  return { id, reused: false };
}

/** Desactiva las resoluciones activas de un punto (deshacer). */
function reopenResolutions(db, { locationId, actor }) {
  const now = new Date().toISOString();
  const active = db.prepare('SELECT id FROM cctv_notification_resolutions WHERE active = 1 AND location_id = ?').all(locationId);
  if (!active.length) return { reopened: 0 };
  db.exec('BEGIN IMMEDIATE');
  try {
    db.prepare('UPDATE cctv_notification_resolutions SET active = 0 WHERE active = 1 AND location_id = ?').run(locationId);
    db.prepare(
      `INSERT INTO audit_log(id, entity_type, entity_id, action, actor, occurred_at, source_system, before_json, after_json, correlation_id)
       VALUES (?, 'CCTV_NOTIFICATION', ?, 'NOTIFICATION_REOPENED', ?, ?, 'SKYLAB_CCTV', ?, NULL, ?)`,
    ).run(crypto.randomUUID(), locationId, actor, now, JSON.stringify({ reopened: active.map((r) => r.id) }), crypto.randomUUID());
    db.exec('COMMIT');
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
  return { reopened: active.length };
}

module.exports = {
  RESOLUTIONS,
  SCOPE_BY_RESOLUTION,
  isValidResolution,
  normalizeResolveInput,
  loadActiveResolutions,
  insertResolution,
  reopenResolutions,
};
