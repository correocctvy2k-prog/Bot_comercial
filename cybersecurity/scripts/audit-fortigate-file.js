const fs = require('node:fs');
const path = require('node:path');
const { summarizeFortiGateInventory } = require('../src/fortigate-parser');

const inputPath = process.argv[2];
if (!inputPath) {
  console.error('Usage: node scripts/audit-fortigate-file.js <restricted-input.txt>');
  process.exitCode = 2;
} else {
  const resolvedPath = path.resolve(inputPath);
  const stat = fs.statSync(resolvedPath);
  if (!stat.isFile()) throw new Error('Input is not a regular file');

  const inventory = summarizeFortiGateInventory(fs.readFileSync(resolvedPath, 'utf8'));
  console.log(JSON.stringify(inventory.counts, null, 2));
}
