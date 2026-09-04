const fs = require('node:fs');
const path = require('node:path');
const { openCyberDatabase } = require('../db/open-database');
const { importGreenboneProtectedResults } = require('../src/greenbone-protected-importer');

function argument(name) {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] : null;
}

const databaseArgument = argument('db');
if (!databaseArgument) throw new Error('MISSING_ARGUMENT_DB');
const databasePath = path.resolve(databaseArgument);
if (fs.existsSync(databasePath)) throw new Error('DEMO_DATABASE_ALREADY_EXISTS');
fs.mkdirSync(path.dirname(databasePath), { recursive: true, mode: 0o750 });
const fixturePath = path.join(__dirname, '..', 'fixtures', 'greenbone-protected-anonymized.json');
const db = openCyberDatabase(databasePath);
try {
  const result = importGreenboneProtectedResults({
    db, text: fs.readFileSync(fixturePath, 'utf8'),
    custodyReference: 'fixture://greenbone-protected-anonymized',
  });
  process.stdout.write(`${JSON.stringify({ ...result, status: 'DEMO_READY', databasePath })}\n`);
} finally { db.close(); }
