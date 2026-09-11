'use strict';

// spec 0012 — qué puntos tienen alguna alarma real, para `has_alarm` en `puntos_venta`.
// Mismo criterio que `alarmsData()` (api/server.js, endpoint /api/cctv/alarms): paneles
// OSZFORD + referencias legadas de inventario + controladores Dahua dedicados. Se extrae
// aparte (no se importa server.js, que abre un servidor HTTP al requerirse) para que
// scripts como sync-crm-points.js puedan calcular el mismo conjunto sin duplicar server.js.

const { normalizeName } = require('./normalize');

/** @returns {Set<string>} locationId de cada punto con al menos un sistema de alarma. */
function alarmLocationIds(db) {
  const locations = db.prepare("SELECT id, canonical_name AS name FROM locations WHERE active=1").all();
  const byKey = new Map();
  for (const location of locations) byKey.set(normalizeName(location.name), location.id);
  for (const alias of db.prepare('SELECT location_id, alias_key FROM location_aliases').all()) {
    if (!byKey.has(alias.alias_key)) byKey.set(alias.alias_key, alias.location_id);
  }

  const ids = new Set();
  const latestRun = db.prepare('SELECT MAX(id) id FROM import_runs').get().id;

  for (const panel of db.prepare('SELECT location_name_key FROM stg_alarm_panels WHERE import_run_id=?').all(latestRun)) {
    const locationId = byKey.get(panel.location_name_key);
    if (locationId) ids.add(locationId);
  }
  for (const row of db.prepare('SELECT location_name_key FROM stg_inventory_locations WHERE import_run_id=? AND alarm_raw IS NOT NULL').all(latestRun)) {
    const locationId = byKey.get(row.location_name_key);
    if (locationId) ids.add(locationId);
  }
  for (const asset of db.prepare("SELECT location_id FROM assets WHERE lifecycle_status='ACTIVE' AND asset_type='ALARM_CONTROLLER' AND location_id IS NOT NULL").all()) {
    ids.add(asset.location_id);
  }
  return ids;
}

module.exports = { alarmLocationIds };
