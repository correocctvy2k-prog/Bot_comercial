const fs = require('node:fs');
const path = require('node:path');
const { openCyberDatabase } = require('../db/open-database');

function argument(name) {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] : null;
}

const value = argument('db');
if (!value) throw new Error('MISSING_ARGUMENT_DB');
const databasePath = path.resolve(value);
if (!fs.existsSync(databasePath)) throw new Error('DATABASE_NOT_FOUND');
const db = openCyberDatabase(databasePath);
try {
  const integrity = db.prepare('PRAGMA integrity_check').get().integrity_check;
  if (integrity !== 'ok') throw new Error(`INTEGRITY_CHECK_FAILED:${integrity}`);
  const migration = db.prepare(`
    SELECT version, name, applied_at appliedAt
    FROM cyber_schema_migrations ORDER BY version DESC LIMIT 1
  `).get();
  process.stdout.write(`${JSON.stringify({ status: 'SCHEMA_READY', migration, integrity })}\n`);
} finally { db.close(); }
