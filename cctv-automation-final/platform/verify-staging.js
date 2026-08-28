const { DatabaseSync } = require('node:sqlite');
const path = require('path');

const dbPath = path.resolve(process.argv[2] || process.env.CCTV_DB || 'data/cctv-staging.db');
const db = new DatabaseSync(dbPath, { readOnly: true });
const run = db.prepare("SELECT * FROM import_runs WHERE status='SUCCESS' ORDER BY id DESC LIMIT 1").get();
if (!run) throw new Error('No existe una importación exitosa');
const count = (table) => db.prepare(`SELECT COUNT(*) AS total FROM ${table} WHERE import_run_id=?`).get(run.id).total;
const checks = {
  inventoryLocations: count('stg_inventory_locations'),
  alarmPanels: count('stg_alarm_panels'),
  vehicles: count('stg_vehicles'),
  maintenancePoints: count('stg_maintenance_points'),
  candidates: count('reconciliation_candidates'),
  canonicalLocations: db.prepare('SELECT COUNT(*) AS total FROM locations').get().total,
};
if (checks.alarmPanels !== 17) throw new Error(`Paneles esperados 17, obtenidos ${checks.alarmPanels}`);
if (checks.vehicles !== 7) throw new Error(`Vehículos esperados 7, obtenidos ${checks.vehicles}`);
if (checks.maintenancePoints !== checks.candidates) throw new Error('Cada punto debe tener exactamente un resultado de conciliación');
if (checks.canonicalLocations !== 0) throw new Error('El importador no debe promover registros al modelo canónico');
console.log(JSON.stringify({ ok: true, runId: run.id, checks }, null, 2));
db.close();
