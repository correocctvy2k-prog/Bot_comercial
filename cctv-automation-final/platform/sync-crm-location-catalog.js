const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { DatabaseSync } = require('node:sqlite');

const root = path.resolve(__dirname, '..');
const db = new DatabaseSync(path.resolve(process.env.CCTV_DB || path.join(root, 'data', 'cctv-staging.db')));
const reportFile = path.join(root, 'reports', 'crm-points-reconciliation-latest.json');
const report = JSON.parse(fs.readFileSync(reportFile, 'utf8'));
const candidates = report.rows.filter(row => row.method === 'NO_MATCH' && row.siisCode);
const held = report.rows.filter(row => row.method === 'NO_MATCH' && !row.siisCode);
const now = new Date().toISOString();
const source = 'reports/crm-points-reconciliation-latest.json';

db.exec('PRAGMA foreign_keys=ON');
const insertLocation = db.prepare(`INSERT INTO locations
  (id,siis_code,canonical_name,zone,location_type,cctv_coverage_status,criticality,active,created_at,updated_at)
  VALUES (?,?,?,?,?,?,?,?,?,?)`);
const insertAlias = db.prepare(`INSERT OR IGNORE INTO location_aliases
  (location_id,source_system,alias_raw,alias_key) VALUES (?,?,?,?)`);
const insertLink = db.prepare(`INSERT INTO crm_point_links
  (id,location_id,crm_point_id,siis_code,operational_node_name,relation_type,match_method,confidence,status,source_reference,created_at,updated_at)
  VALUES (?,?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(crm_point_id) DO UPDATE SET
  location_id=excluded.location_id,updated_at=excluded.updated_at`);
const insertAudit = db.prepare(`INSERT INTO audit_log
  (id,entity_type,entity_id,action,actor,occurred_at,source_system,before_json,after_json,correlation_id)
  VALUES (?,?,?,?,?,?,?,?,?,?)`);
const findLocation = db.prepare('SELECT id FROM locations WHERE siis_code=?');
const normalize = value => String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase().replace(/[^A-Z0-9]+/g, ' ').trim();
const inferType = row => row.crmTypeFlags.mall ? 'SHOPPING_CENTER' : 'POINT_OF_SALE';

let created = 0;
let linked = 0;
const correlationId = crypto.randomUUID();
db.exec('BEGIN IMMEDIATE');
try {
  for (const row of candidates) {
    let location = findLocation.get(String(row.siisCode));
    if (!location) {
      const locationId = crypto.randomUUID();
      const locationData = {
        siisCode: String(row.siisCode), name: row.crmName, zone: row.crmZone,
        type: inferType(row), coverage: row.crmCapabilities.cctv ? 'REPORTED_ACTIVE' : 'NONE',
      };
      insertLocation.run(locationId, locationData.siisCode, locationData.name, locationData.zone,
        locationData.type, locationData.coverage, 'NORMAL', row.crmOperational.permanentlyClosed ? 0 : 1, now, now);
      insertAlias.run(locationId, 'CRM_POINTS', row.crmName, normalize(row.crmName));
      insertAudit.run(crypto.randomUUID(), 'LOCATION', locationId, 'CREATED_FROM_CRM', 'system:crm-catalog-sync', now,
        'CRM_POINTS', null, JSON.stringify(locationData), correlationId);
      location = { id: locationId };
      created++;
    }
    insertLink.run(crypto.randomUUID(), location.id, row.crmPointId, String(row.siisCode), row.crmName,
      row.crmTypeFlags.doubleShift ? 'SHARED_DOUBLE' : 'PRIMARY', 'SIIS_EXACT_FROM_CRM', 1, 'ACTIVE', source, now, now);
    linked++;
  }
  db.exec('COMMIT');
} catch (error) {
  db.exec('ROLLBACK');
  throw error;
}

console.log(JSON.stringify({
  generatedAt: now, createdLocations: created, linksProcessed: linked, heldWithoutSiis: held.length,
  totals: {
    locations: db.prepare('SELECT COUNT(*) n FROM locations').get().n,
    crmPointLinks: db.prepare('SELECT COUNT(*) n FROM crm_point_links').get().n,
    withoutCctv: db.prepare("SELECT COUNT(*) n FROM locations WHERE cctv_coverage_status='NONE' AND active=1").get().n,
  },
}, null, 2));
