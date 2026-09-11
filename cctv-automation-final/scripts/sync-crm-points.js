'use strict';

// spec 0012 — sincroniza "Operación de Puntos" (Supabase `puntos_venta`) con el catálogo
// canónico de CCTV, en las dos direcciones: corrige has_cctv/has_alarm en Supabase con el
// dato real de este servicio, y cachea el horario real por punto (custom_open_time/
// custom_close_time) para que `interpretPointDay` lo use.
//
//   node scripts/sync-crm-points.js --dry-run   # calcula y reporta, no escribe nada
//   node scripts/sync-crm-points.js             # además hace PATCH en Supabase
//
// Requiere SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY en .env (bypassa RLS; nunca se loguea).

require('dotenv').config({ quiet: true });

const path = require('node:path');
const fs = require('node:fs');
const crypto = require('node:crypto');
const { DatabaseSync } = require('node:sqlite');
const { matchCrmPoints, diffCapabilities, computeCapabilities, buildScheduleCache } = require('../platform/crm-points-sync');
const { alarmLocationIds } = require('../platform/alarm-coverage');

const DRY_RUN = process.argv.includes('--dry-run');
const CRM_POINT_FIELDS = ['id', 'siiss_id', 'alias', 'name', 'segment', 'is_double', 'is_permanently_closed', 'has_cctv', 'has_alarm', 'custom_open_time', 'custom_close_time', 'has_custom_schedule'];

function requireSupabaseEnv() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('Falta SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY en .env (spec 0012)');
  return { url, key };
}

async function fetchCrmPoints({ url, key }) {
  const response = await fetch(`${url}/rest/v1/puntos_venta?select=${CRM_POINT_FIELDS.join(',')}&order=alias.asc`, {
    headers: { apikey: key, Authorization: `Bearer ${key}` },
  });
  if (!response.ok) throw new Error(`Supabase (lectura puntos_venta) respondió ${response.status}`);
  return response.json();
}

async function patchCapability({ url, key }, crmPointId, patch) {
  const response = await fetch(`${url}/rest/v1/puntos_venta?id=eq.${encodeURIComponent(crmPointId)}`, {
    method: 'PATCH',
    headers: { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json', Prefer: 'return=minimal' },
    body: JSON.stringify(patch),
  });
  if (!response.ok) throw new Error(`Supabase (PATCH ${crmPointId}) respondió ${response.status}: ${await response.text().catch(() => '')}`);
}

async function main() {
  const supabase = requireSupabaseEnv();
  const dbPath = path.resolve(process.env.CCTV_DB || path.join(__dirname, '..', 'data', 'cctv-staging.db'));
  const db = new DatabaseSync(dbPath);
  db.exec(`CREATE TABLE IF NOT EXISTS crm_point_schedules (
    location_id TEXT PRIMARY KEY REFERENCES locations(id),
    open_min INTEGER,
    close_min INTEGER,
    synced_at TEXT NOT NULL
  )`);

  const crmPoints = await fetchCrmPoints(supabase);
  const locations = db.prepare('SELECT id, siis_code, canonical_name FROM locations WHERE active=1').all();
  const aliases = db.prepare('SELECT location_id, alias_raw, alias_key FROM location_aliases').all();
  // Mismo criterio WITH_CCTV que spec 0010 (dailyEventsData): envió correo Dahua en 30 días.
  const notifyingLocs = new Set(
    db.prepare(`SELECT DISTINCT location_id FROM cctv_events
      WHERE source_system='EMAIL_DAHUA' AND location_id IS NOT NULL
        AND COALESCE(occurred_at,received_at)>=datetime('now','-30 days')`).all()
      .map((r) => r.location_id),
  );
  const alarmLocs = alarmLocationIds(db);

  const matches = matchCrmPoints(crmPoints, locations, aliases);
  const crmPointsById = new Map(crmPoints.map((p) => [p.id, p]));
  const updates = diffCapabilities(matches, crmPointsById, (locationId) =>
    computeCapabilities(locationId, { notifyingLocs, alarmLocationIds: alarmLocs }));
  const scheduleRows = buildScheduleCache(matches, crmPointsById);

  const now = new Date().toISOString();
  if (!DRY_RUN) {
    const upsertSchedule = db.prepare(`INSERT INTO crm_point_schedules(location_id, open_min, close_min, synced_at)
      VALUES(?,?,?,?) ON CONFLICT(location_id) DO UPDATE SET open_min=excluded.open_min, close_min=excluded.close_min, synced_at=excluded.synced_at`);
    db.exec('BEGIN IMMEDIATE');
    try {
      for (const row of scheduleRows) upsertSchedule.run(row.locationId, row.openMin, row.closeMin, now);
      db.exec('COMMIT');
    } catch (error) {
      db.exec('ROLLBACK');
      throw error;
    }
  }

  const errors = [];
  if (!DRY_RUN) {
    const auditInsert = db.prepare(`INSERT INTO audit_log(id, entity_type, entity_id, action, actor, occurred_at, source_system, before_json, after_json, correlation_id)
      VALUES (?, 'CRM_POINT_CAPABILITY', ?, 'CAPABILITY_SYNCED', 'sync-crm-points', ?, 'SKYLAB_CCTV', ?, ?, ?)`);
    for (const update of updates) {
      try {
        await patchCapability(supabase, update.crmPointId, update.patch);
        auditInsert.run(crypto.randomUUID(), update.crmPointId, now, JSON.stringify(update.before), JSON.stringify(update.patch), crypto.randomUUID());
      } catch (error) {
        errors.push({ crmPointId: update.crmPointId, error: error.message });
      }
    }
  }

  const summary = {
    generatedAt: now,
    mode: DRY_RUN ? 'DRY_RUN' : 'APPLIED',
    crmPoints: crmPoints.length,
    canonicalLocations: locations.length,
    autoLinkable: matches.filter((m) => m.decision === 'AUTO_LINKABLE').length,
    reviewRequired: matches.filter((m) => m.decision === 'REVIEW_REQUIRED').length,
    held: matches.filter((m) => m.decision === 'HELD').length,
    capabilityUpdates: updates.length,
    capabilityErrors: errors.length,
    scheduleRows: scheduleRows.length,
  };

  const reportsDir = path.join(__dirname, '..', 'reports');
  fs.mkdirSync(reportsDir, { recursive: true });
  fs.writeFileSync(
    path.join(reportsDir, 'crm-points-sync-latest.json'),
    JSON.stringify({ summary, updates, errors, scheduleRows: scheduleRows.length }, null, 2),
  );

  console.log(JSON.stringify({ ...summary, errors }, null, 2));
  db.close();
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
