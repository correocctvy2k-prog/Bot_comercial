const fs = require('node:fs');
const path = require('node:path');
const { DatabaseSync } = require('node:sqlite');

const schemaPath = path.join(__dirname, 'schema.sql');

function openCyberDatabase(databasePath = ':memory:', options = {}) {
  const db = new DatabaseSync(databasePath);
  db.exec('PRAGMA foreign_keys = ON');
  db.exec(`PRAGMA busy_timeout = ${Number(options.busyTimeoutMs || 5000)}`);

  if (databasePath !== ':memory:') {
    db.exec('PRAGMA journal_mode = WAL');
    db.exec('PRAGMA synchronous = NORMAL');
  }

  if (options.applySchema !== false) {
    db.exec(fs.readFileSync(schemaPath, 'utf8'));
  }

  return db;
}

module.exports = {
  openCyberDatabase,
  schemaPath,
};
