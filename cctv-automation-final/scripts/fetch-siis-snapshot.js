'use strict';

require('dotenv').config({ quiet: true });
const fs = require('node:fs');
const path = require('node:path');
const { fetchStations } = require('../platform/siis-client');

function outputArgument(argv) {
  const index = argv.indexOf('--output');
  return path.resolve(index >= 0 && argv[index + 1] ? argv[index + 1] : 'data/siis-snapshot-latest.json');
}

async function main() {
  const output = outputArgument(process.argv.slice(2));
  const stations = await fetchStations();
  fs.mkdirSync(path.dirname(output), { recursive: true });
  const temporary = `${output}.tmp`;
  fs.writeFileSync(temporary, `${JSON.stringify(stations, null, 2)}\n`, { mode: 0o600 });
  fs.renameSync(temporary, output);
  console.log(JSON.stringify({ ok: true, output, stations: stations.length, capturedAt: new Date().toISOString() }, null, 2));
}

main().catch((error) => { console.error(`No fue posible obtener la instantánea SIIS: ${error.message}`); process.exit(1); });
