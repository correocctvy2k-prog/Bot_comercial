// Carga la lista real de torres (torres_HapLite.pdf, entregada por el usuario
// 2026-09-18 -- ver spec 0013) a cyber_towers/cyber_tower_points. Los datos crudos
// (IPs y nombres reales de la red de seguridad de la empresa) viven en
// cybersecurity/raw/torres/, gitignored a propósito -- este script solo lee de ahí,
// nunca los trae embebidos en el código.
//
// Uso:
//   node scripts/seed-towers.js --db <file> [--file cybersecurity/raw/torres/torres-haplite-real-20260918.json]
// Idempotente (upsert por torre/punto) -- correr de nuevo no duplica nada.

const fs = require('node:fs');
const path = require('node:path');
const { openCyberDatabase } = require('../db/open-database');
const { loadTowerSeed } = require('../src/tower-seed');

function argument(name, fallback = null) {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] : fallback;
}

function run({ dbPath, filePath }) {
  if (!dbPath) throw new Error('--db is required');
  if (!fs.existsSync(filePath)) {
    throw new Error(`SEED_FILE_NOT_FOUND: ${filePath} -- ver spec 0013 SS0.1, el archivo real no viaja por git`);
  }
  const rows = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  const db = openCyberDatabase(path.resolve(dbPath));
  try {
    return loadTowerSeed({ db, rows });
  } finally {
    db.close();
  }
}

if (require.main === module) {
  const dbPath = argument('db');
  const filePath = argument('file', path.join(__dirname, '..', 'raw', 'torres', 'torres-haplite-real-20260918.json'));
  try {
    const result = run({ dbPath, filePath });
    console.log(JSON.stringify(result, null, 2));
  } catch (error) {
    console.error(`[ERROR] ${error.message}`);
    process.exitCode = 1;
  }
}

module.exports = { run };
