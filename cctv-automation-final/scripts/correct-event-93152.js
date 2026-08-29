const crypto = require('node:crypto');
const { DatabaseSync } = require('node:sqlite');
const { runtimePaths } = require('../config/runtime-paths');

const sourceEventId = 'INBOX:93152';
const db = new DatabaseSync(runtimePaths.dbPath);
const row = db.prepare(`SELECT id,source_system,source_event_id,event_type,event_phase,
  occurred_at,payload_json FROM cctv_events WHERE source_event_id=?`).get(sourceEventId);

if (!row) throw new Error(`${sourceEventId} no existe; no se aplicó ninguna corrección`);
if (row.event_type === 'OPENING') {
  console.log(`${sourceEventId} ya está clasificado como OPENING`);
  db.close();
  process.exit(0);
}

let payload = {};
try { payload = JSON.parse(row.payload_json || '{}'); } catch {}
const expected = row.source_system === 'EMAIL_DAHUA'
  && row.event_type === 'CLOSING'
  && new Date(row.occurred_at).getTime() === new Date('2026-08-29T12:55:10Z').getTime()
  && payload.canonicalName === 'URIBE'
  && payload.alarm === 'Cierre Tienda Uribe';
if (!expected) throw new Error(`${sourceEventId} no coincide con las precondiciones auditadas`);

const before = { eventType: row.event_type, eventPhase: row.event_phase, payload };
const correctedPayload = {
  ...payload,
  category: 'APERTURA',
  rawEventType: 'Tripwire',
  correction: {
    reason: 'Tripwire de inicio prevalece sobre el nombre configurado de la alarma',
    appliedAt: new Date().toISOString(),
  },
};
const after = { eventType: 'OPENING', eventPhase: 'INICIO', payload: correctedPayload };
const now = new Date().toISOString();

db.exec('BEGIN IMMEDIATE');
try {
  db.prepare('UPDATE cctv_events SET event_type=?,event_phase=?,payload_json=? WHERE id=?')
    .run(after.eventType, after.eventPhase, JSON.stringify(correctedPayload), row.id);
  db.prepare(`INSERT INTO audit_log(id,entity_type,entity_id,action,actor,occurred_at,
    source_system,before_json,after_json,correlation_id) VALUES(?,?,?,?,?,?,?,?,?,?)`)
    .run(crypto.randomUUID(), 'CCTV_EVENT', row.id, 'EVENT_RECLASSIFIED',
      'SKYLAB_DEPLOYMENT', now, 'EMAIL_DAHUA', JSON.stringify(before),
      JSON.stringify(after), crypto.randomUUID());
  db.exec('COMMIT');
  console.log(`${sourceEventId} corregido de CLOSING a OPENING con registro de auditoría`);
} catch (error) {
  db.exec('ROLLBACK');
  throw error;
} finally {
  db.close();
}
