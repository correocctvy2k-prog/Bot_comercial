// Trae dss_device_registry de cctv-automation-final (servicio y base SQLite aparte)
// como fuente corroborante del módulo Ciberseguridad -- solo lectura, nunca escribe
// en la base de cctv-automation-final (spec 0013 SS4/SS6). Decisión del usuario
// 2026-09-18: leer el SQLite directo (mismo host), no un endpoint HTTP nuevo.
//
// Uso:
//   node scripts/pull-dss-devices.js [--source-db <ruta a cctv-staging.db>] [--db <file> --apply] [--custody-ref <ref>]
// Sin --apply: solo imprime el resumen (modo auditoría).

const path = require('node:path');
const { DatabaseSync } = require('node:sqlite');
const { openCyberDatabase } = require('../db/open-database');
const { readDssDeviceRegistry, summarizeDssDevices, importDssDeviceRegistry } = require('../src/dss-importer');

const DEFAULT_SOURCE_DB = path.join(__dirname, '..', '..', 'cctv-automation-final', 'data', 'cctv-staging.db');

function argument(name, fallback = null) {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] : fallback;
}

function run({ sourceDbPath, dbPath, apply, custodyReference }) {
  const sourceDb = new DatabaseSync(path.resolve(sourceDbPath), { readOnly: true });
  try {
    if (!apply) {
      const devices = readDssDeviceRegistry(sourceDb);
      return { mode: 'AUDIT_ONLY', counts: summarizeDssDevices(devices) };
    }
    if (!dbPath) throw new Error('--db is required with --apply');
    const db = openCyberDatabase(path.resolve(dbPath));
    try {
      return importDssDeviceRegistry({ db, sourceDb, custodyReference });
    } finally {
      db.close();
    }
  } finally {
    sourceDb.close();
  }
}

if (require.main === module) {
  const sourceDbPath = argument('source-db', DEFAULT_SOURCE_DB);
  const dbPath = argument('db');
  const custodyReference = argument('custody-ref');
  const apply = process.argv.includes('--apply');
  try {
    const result = run({ sourceDbPath, dbPath, apply, custodyReference });
    console.log(JSON.stringify(result, null, 2));
  } catch (error) {
    console.error(`[ERROR] ${error.message}`);
    process.exitCode = 1;
  }
}

module.exports = { run };
