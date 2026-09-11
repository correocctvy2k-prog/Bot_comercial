// spec 0011 · Tanda 2.a — limpieza puntual de las 8 identidades por conciliar
// que aparecían en "Eventos diarios" (2026-09-10). Crea aliases EMAIL_DAHUA
// duraderos y revincula los cctv_events pendientes. Mismo efecto que el endpoint
// POST /api/cctv/events/identity/link, aplicado en lote.
//
//   node scripts/reconcile-eventos-diarios-pendientes-20260910.mjs           # dry-run
//   node scripts/reconcile-eventos-diarios-pendientes-20260910.mjs --apply   # escribe

import crypto from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { normalizeName } = require('../platform/normalize');

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const APPLY = process.argv.includes('--apply');
const dbPath = path.resolve(process.env.CCTV_DB || path.join(__dirname, '..', 'data', 'cctv-staging.db'));

// storeRaw tal como llega en el correo -> canonical_name confirmado por el usuario (2026-09-10)
const MAPPINGS = [
  ['Independencia 3931', 'INDEPENDENCIA'],
  ['Metro 2242', 'CARREFOUR METRO'],
  ['19 con 35', 'LA 19 CON 35'],
  ['Parque Prado 2301', 'PARQUE EL PRADO'],
  ['Parq Bolivar 3333', 'PARQUEADERO PARQUE BOLIVAR'],
  ['Ant. Ppal 3054', 'ANTIGUA PPAL II'],
  ['Antigua Ppal cll31#32 29', 'ANTIGUA PPAL II'],
  ['Antigua Ppal Rozo', 'ANTIGUA PRINCIPAL ROZO'],
];

const db = new DatabaseSync(dbPath);
const now = new Date().toISOString();
const actor = process.env.ACTOR || 'skylab-spec-0011';

const findLocation = db.prepare(
  'SELECT id, canonical_name FROM locations WHERE upper(canonical_name) = upper(?) AND active = 1',
);
const pendingEvents = db.prepare(
  "SELECT id, payload_json FROM cctv_events WHERE source_system = 'EMAIL_DAHUA' AND location_id IS NULL",
).all();

const plan = [];
for (const [aliasRaw, canonical] of MAPPINGS) {
  const location = findLocation.get(canonical);
  if (!location) {
    plan.push({ aliasRaw, canonical, error: 'canonical_name no encontrado' });
    continue;
  }
  const aliasKey = normalizeName(aliasRaw);
  const matches = pendingEvents.filter((row) => {
    try { return normalizeName(JSON.parse(row.payload_json || '{}').storeRaw || '') === aliasKey; }
    catch { return false; }
  });
  plan.push({ aliasRaw, aliasKey, canonical, locationId: location.id, events: matches.length, matchIds: matches.map((m) => m.id) });
}

console.log(APPLY ? '== APLICANDO ==' : '== DRY-RUN (usa --apply para escribir) ==');
for (const p of plan) {
  if (p.error) console.log(`  ✗ ${p.aliasRaw} -> ${p.canonical}: ${p.error}`);
  else console.log(`  ${p.aliasRaw}  ->  ${p.canonical}  (${p.events} eventos pendientes)`);
}
if (plan.some((p) => p.error)) { db.close(); process.exit(1); }
if (!APPLY) { db.close(); process.exit(0); }

const upsertAlias = db.prepare(
  "INSERT INTO location_aliases(location_id, source_system, alias_raw, alias_key) VALUES(?, 'EMAIL_DAHUA', ?, ?) ON CONFLICT(source_system, alias_key) DO UPDATE SET location_id = excluded.location_id, alias_raw = excluded.alias_raw",
);
const relink = db.prepare(
  "UPDATE cctv_events SET location_id = ?, severity = CASE WHEN severity = 'REVIEW' THEN 'NORMAL' ELSE severity END, payload_json = ? WHERE id = ?",
);
const audit = db.prepare(
  'INSERT INTO audit_log(id, entity_type, entity_id, action, actor, occurred_at, source_system, before_json, after_json, correlation_id) VALUES(?,?,?,?,?,?,?,?,?,?)',
);
const eventById = new Map(pendingEvents.map((r) => [r.id, r]));

db.exec('BEGIN IMMEDIATE');
try {
  let totalEvents = 0;
  for (const p of plan) {
    upsertAlias.run(p.locationId, p.aliasRaw, p.aliasKey);
    const canonical = p.canonical;
    for (const id of p.matchIds) {
      let payload = {};
      try { payload = JSON.parse(eventById.get(id).payload_json || '{}'); } catch {}
      relink.run(p.locationId, JSON.stringify({ ...payload, identityStatus: 'LINKED_MANUAL', identityMethod: 'ALIAS_MANUAL', canonicalName: canonical }), id);
      totalEvents += 1;
    }
    audit.run(crypto.randomUUID(), 'EMAIL_IDENTITY', p.aliasKey, 'IDENTITY_LINKED', actor, now, 'SKYLAB_CCTV', null, JSON.stringify({ aliasRaw: p.aliasRaw, locationId: p.locationId, canonicalName: canonical, updatedEvents: p.matchIds.length, spec: '0011' }), crypto.randomUUID());
  }
  db.exec('COMMIT');
  console.log(`\n✓ ${plan.length} aliases, ${totalEvents} eventos revinculados.`);
} catch (error) {
  db.exec('ROLLBACK');
  throw error;
} finally {
  db.close();
}
