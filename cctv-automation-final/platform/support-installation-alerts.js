'use strict';

// spec 0021: cruza Soporte (tarjetas Trello clasificadas por activity_type,
// specs previas) con Inventario (locations.cctv_coverage_status) para
// detectar instalaciones nuevas sobre puntos que el inventario real todavía
// marca sin CCTV ('NONE'). Los descartes son reversibles, mismo patrón que
// cctv_notification_resolutions (spec 0011).

const crypto = require('node:crypto');

/** Instalaciones detectadas en Soporte sobre puntos sin CCTV, sin contar
 *  las descartadas manualmente (active=1 en support_installation_alert_dismissals). */
function pendingAlerts(db) {
  const rows = db.prepare(`
    SELECT sc.id AS cardId, sc.title_raw AS cardTitle, sc.source_card_url AS cardUrl,
           sc.members_json AS membersJson,
           COALESCE(sc.due_at, sc.start_at, sc.source_updated_at) AS operationalAt,
           l.id AS locationId, l.siis_code AS locationCode, l.canonical_name AS locationName, l.zone AS zone
    FROM support_cards sc
    JOIN support_card_locations scl ON scl.card_id = sc.id
    JOIN locations l ON l.id = scl.location_id
    WHERE sc.source_system = 'TRELLO_SUPPORT' AND sc.active = 1 AND sc.activity_type = 'INSTALLATION'
      AND l.active = 1 AND l.cctv_coverage_status = 'NONE'
      AND NOT EXISTS (
        SELECT 1 FROM support_installation_alert_dismissals d
        WHERE d.card_id = sc.id AND d.location_id = l.id AND d.active = 1
      )
    ORDER BY COALESCE(sc.due_at, sc.start_at, sc.source_updated_at) DESC
  `).all();
  return rows.map((row) => {
    let members = [];
    try { members = JSON.parse(row.membersJson || '[]'); } catch {}
    return {
      cardId: row.cardId,
      cardTitle: row.cardTitle,
      cardUrl: row.cardUrl,
      operationalAt: row.operationalAt,
      members,
      locationId: row.locationId,
      locationCode: row.locationCode,
      locationName: row.locationName,
      zone: row.zone,
    };
  });
}

/** Descarta una alerta (falso positivo / no aplica). Idempotente. */
function dismissAlert(db, { cardId, locationId, reason, actor }) {
  const now = new Date().toISOString();
  db.prepare(`
    INSERT INTO support_installation_alert_dismissals(card_id, location_id, reason, decided_by, decided_at, active)
    VALUES (?, ?, ?, ?, ?, 1)
    ON CONFLICT(card_id, location_id) DO UPDATE SET
      reason = excluded.reason, decided_by = excluded.decided_by, decided_at = excluded.decided_at, active = 1
  `).run(cardId, locationId, reason || null, actor, now);
  db.prepare(`
    INSERT INTO audit_log(id, entity_type, entity_id, action, actor, occurred_at, source_system, before_json, after_json, correlation_id)
    VALUES (?, 'SUPPORT_INSTALLATION_ALERT', ?, 'DISMISSED', ?, ?, 'SKYLAB_CCTV', NULL, ?, ?)
  `).run(crypto.randomUUID(), `${cardId}:${locationId}`, actor, now, JSON.stringify({ cardId, locationId, reason: reason || null }), crypto.randomUUID());
}

/** Reabre una alerta descartada por error. */
function reopenAlert(db, { cardId, locationId, actor }) {
  const now = new Date().toISOString();
  const result = db.prepare(`
    UPDATE support_installation_alert_dismissals SET active = 0 WHERE card_id = ? AND location_id = ? AND active = 1
  `).run(cardId, locationId);
  if (result.changes) {
    db.prepare(`
      INSERT INTO audit_log(id, entity_type, entity_id, action, actor, occurred_at, source_system, before_json, after_json, correlation_id)
      VALUES (?, 'SUPPORT_INSTALLATION_ALERT', ?, 'REOPENED', ?, ?, 'SKYLAB_CCTV', NULL, NULL, ?)
    `).run(crypto.randomUUID(), `${cardId}:${locationId}`, actor, now, crypto.randomUUID());
  }
  return { reopened: result.changes > 0 };
}

module.exports = { pendingAlerts, dismissAlert, reopenAlert };
