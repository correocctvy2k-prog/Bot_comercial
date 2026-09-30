// Trae stg_inventory_locations de cctv-automation-final (servicio y base SQLite
// aparte) como fuente inicial (sin verificar) de firmware -- solo lectura, nunca
// escribe en la base de cctv-automation-final. Decisión del usuario 2026-09-21:
// importar este dato ya existente como semilla, sin depender de él a largo plazo
// (se desactualiza rápido -- último import Excel visto: hace semanas) -- el
// escaneo activo real queda para más adelante.
//
// Uso:
//   node scripts/pull-cctv-firmware-staging.js [--source-db <ruta a cctv-staging.db>] [--db <file> --apply] [--custody-ref <ref>]
// Sin --apply: solo imprime el resumen (modo auditoría).

const path = require('node:path');
const { DatabaseSync } = require('node:sqlite');
const { openCyberDatabase } = require('../db/open-database');
const {
  findLatestSuccessfulRun, readCctvFirmwareStaging, summarizeCctvFirmwareStaging, importCctvFirmwareStaging,
} = require('../src/cctv-firmware-staging-importer');

const DEFAULT_SOURCE_DB = path.join(__dirname, '..', '..', 'cctv-automation-final', 'data', 'cctv-staging.db');

function argument(name, fallback = null) {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] : fallback;
}

function run({ sourceDbPath, dbPath, apply, custodyReference }) {
  const sourceDb = new DatabaseSync(path.resolve(sourceDbPath), { readOnly: true });
  try {
    if (!apply) {
      const latestRun = findLatestSuccessfulRun(sourceDb);
      if (!latestRun) return { mode: 'AUDIT_ONLY', counts: { total: 0, withFirmware: 0, withRecorderModel: 0 }, latestRun: null };
      const rows = readCctvFirmwareStaging(sourceDb, latestRun.id);
      return { mode: 'AUDIT_ONLY', counts: summarizeCctvFirmwareStaging(rows), latestRun };
    }
    if (!dbPath) throw new Error('--db is required with --apply');
    const db = openCyberDatabase(path.resolve(dbPath));
    try {
      return importCctvFirmwareStaging({ db, sourceDb, custodyReference });
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
