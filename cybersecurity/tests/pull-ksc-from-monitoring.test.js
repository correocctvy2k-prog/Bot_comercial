const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const { openCyberDatabase } = require('../db/open-database');
const { fetchLatestKscHardware, run } = require('../scripts/pull-ksc-from-monitoring');

// Simula /api/monitoring/latest/KSC-HARDWARE con el contrato real que sube
// Monitor-KSC-HardwareInventory.ps1 (mismo payload que raw/ksc-hardware-latest-20260829.json).
function startMonitoringMock(payload) {
  const server = http.createServer((request, response) => {
    if (request.url === '/api/monitoring/latest/KSC-HARDWARE') {
      response.writeHead(200, { 'Content-Type': 'application/json' });
      response.end(JSON.stringify(payload));
      return;
    }
    response.writeHead(404).end();
  });
  return new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve(server)));
}

function samplePayload(overrides = {}) {
  return {
    Node: 'SERV-KSC', Role: 'Kaspersky Security Center Hardware Inventory',
    ReportDate: '2026-09-15 09:00:04',
    Kaspersky: {
      HardwareInventory: {
        Devices: [
          { Name: 'PC-VENTAS-01', Provider: 'HP', OperatingSystem: 'Microsoft Windows 10', OsBucket: 'Windows 10', IsVirtual: false, LastSeen: '2026-09-15 08:50:00', LastSeenDays: 0.01, VisibilityBucket: 'UltimoDia' },
        ],
      },
    },
    ...overrides,
  };
}

test('fetchLatestKscHardware trae el JSON de Monitoreo IT y lanza si no hay datos', async () => {
  const server = await startMonitoringMock(samplePayload());
  const { port } = server.address();
  try {
    const payload = await fetchLatestKscHardware(`http://127.0.0.1:${port}`);
    assert.equal(payload.Kaspersky.HardwareInventory.Devices.length, 1);
  } finally { server.close(); }

  const emptyServer = await startMonitoringMock(null);
  const emptyPort = emptyServer.address().port;
  try {
    await assert.rejects(() => fetchLatestKscHardware(`http://127.0.0.1:${emptyPort}`), /MONITORING_API_NO_DATA/);
  } finally { emptyServer.close(); }
});

test('run() en modo auditoría no escribe nada, solo resume', async () => {
  const server = await startMonitoringMock(samplePayload());
  const { port } = server.address();
  try {
    const result = await run({ monitoringUrl: `http://127.0.0.1:${port}`, apply: false });
    assert.equal(result.mode, 'AUDIT_ONLY');
    assert.equal(result.counts.devices, 1);
  } finally { server.close(); }
});

test('run() con --apply importa el equipo a cyber_asset_observations vía el contrato reducido', async (t) => {
  const server = await startMonitoringMock(samplePayload());
  const { port } = server.address();
  const dbPath = path.join(require('node:os').tmpdir(), `pull-ksc-test-${Date.now()}.db`);
  t.after(() => { server.close(); fs.rmSync(dbPath, { force: true }); fs.rmSync(`${dbPath}-wal`, { force: true }); fs.rmSync(`${dbPath}-shm`, { force: true }); });
  const result = await run({ monitoringUrl: `http://127.0.0.1:${port}`, dbPath, custodyReference: 'test-run', apply: true });
  assert.equal(result.status, 'SUCCESS');
  assert.equal(result.inserted, 1);

  const db = openCyberDatabase(dbPath);
  try {
    const row = db.prepare("SELECT hostname_raw, quality_flags_json FROM cyber_asset_observations WHERE hostname_key = 'pc-ventas-01'").get();
    assert.equal(row.hostname_raw, 'PC-VENTAS-01');
    assert.match(row.quality_flags_json, /MISSING_IP/);
  } finally { db.close(); }
});

test('--save-raw archiva una copia con fecha para trazabilidad', async (t) => {
  const server = await startMonitoringMock(samplePayload());
  const { port } = server.address();
  const rawDir = fs.mkdtempSync(path.join(require('node:os').tmpdir(), 'pull-ksc-raw-'));
  t.after(() => { server.close(); fs.rmSync(rawDir, { recursive: true, force: true }); });
  await run({ monitoringUrl: `http://127.0.0.1:${port}`, apply: false, saveRawDir: rawDir });
  const files = fs.readdirSync(rawDir);
  assert.equal(files.length, 1);
  assert.match(files[0], /^ksc-hardware-latest-.*\.json$/);
});
