const fs = require('node:fs');
const path = require('node:path');
const { openCyberDatabase } = require('../db/open-database');
const { importFortiGateInventory } = require('../src/fortigate-importer');
const { summarizeFortiGateInventory } = require('../src/fortigate-parser');

function argument(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : null;
}

const input = argument('--input');
const database = argument('--db');
const custodyReference = argument('--custody-ref');
const apply = process.argv.includes('--apply');

if (!input) {
  console.error('Usage: node scripts/import-fortigate.js --input <file> [--db <file> --custody-ref <opaque-ref> --apply]');
  process.exitCode = 2;
} else {
  const inputPath = path.resolve(input);
  const text = fs.readFileSync(inputPath, 'utf8');

  if (!apply) {
    const inventory = summarizeFortiGateInventory(text);
    console.log(JSON.stringify({ mode: 'AUDIT_ONLY', capturedAt: inventory.capturedAt, counts: inventory.counts }, null, 2));
  } else {
    if (!database) throw new Error('--db is required with --apply');
    if (!custodyReference) throw new Error('--custody-ref is required with --apply');

    const dbPath = path.resolve(database);
    fs.mkdirSync(path.dirname(dbPath), { recursive: true });
    const db = openCyberDatabase(dbPath);
    try {
      const result = importFortiGateInventory({ db, text, custodyReference });
      console.log(JSON.stringify({
        status: result.status,
        snapshotId: result.snapshotId,
        inserted: result.inserted || 0,
        counts: result.counts,
      }, null, 2));
    } finally {
      db.close();
    }
  }
}
