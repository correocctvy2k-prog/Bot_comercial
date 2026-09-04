const fs = require('node:fs');
const path = require('node:path');
const { openCyberDatabase } = require('../db/open-database');
const { importKscHardwareInventory, summarizeKscPayload } = require('../src/ksc-importer');

function argument(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : null;
}

const input = argument('--input');
const database = argument('--db');
const custodyReference = argument('--custody-ref');
const apply = process.argv.includes('--apply');

if (!input) {
  console.error('Usage: node scripts/import-ksc-hardware.js --input <latest.json> [--db <file> --custody-ref <opaque-ref> --apply]');
  process.exitCode = 2;
} else {
  const text = fs.readFileSync(path.resolve(input), 'utf8');
  if (!apply) {
    console.log(JSON.stringify({ mode: 'AUDIT_ONLY', ...summarizeKscPayload(JSON.parse(text)) }, null, 2));
  } else {
    if (!database) throw new Error('--db is required with --apply');
    if (!custodyReference) throw new Error('--custody-ref is required with --apply');
    const db = openCyberDatabase(path.resolve(database));
    try {
      const result = importKscHardwareInventory({ db, text, custodyReference });
      console.log(JSON.stringify(result, null, 2));
    } finally {
      db.close();
    }
  }
}
