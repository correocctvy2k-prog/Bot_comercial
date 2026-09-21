const test = require('node:test');
const assert = require('node:assert/strict');
const { openCyberDatabase } = require('../db/open-database');
const { loadTowerSeed } = require('../src/tower-seed');
const { readKnownHaplites } = require('../scripts/sync-known-haplites-to-supabase');

// Hallazgo real 2026-09-21: puntos_venta.ip nunca es la IP del hAP lite -- esta
// función lee la semilla local (única fuente real de la IP del hAP lite) para poder
// sincronizarla a Supabase, donde monitor_puntos_wpp.py sí puede leerla.
const seedRows = [
  { torre: 'Torre Uno', gateway: '10.10.10.1/24', deviceName: 'Tienda A', haplite: '10.10.10.11', isTower: true },
  { torre: 'Torre Uno', gateway: '10.10.10.1/24', deviceName: 'Cam SMD Tienda A', haplite: '10.10.10.11', isTower: true },
  { torre: 'Torre Uno', gateway: '10.10.10.1/24', deviceName: 'Tienda B', haplite: '10.10.10.12', isTower: true },
];

function withDatabase(run) {
  const db = openCyberDatabase();
  try {
    return run(db);
  } finally {
    db.close();
  }
}

test('readKnownHaplites agrupa por IP y junta los nombres de punto que comparten hAP lite', () => withDatabase((db) => {
  loadTowerSeed({ db, rows: seedRows, loadedAt: '2026-09-21T00:00:00.000Z' });
  const entries = readKnownHaplites(db);
  assert.equal(entries.length, 2); // 2 IPs únicas (10.10.10.11 y 10.10.10.12)

  const tiendaA = entries.find((e) => e.ip === '10.10.10.11');
  assert.equal(tiendaA.towerName, 'Torre Uno');
  // dos filas de la semilla comparten la IP 10.10.10.11 (Tienda A + su cámara SMD) --
  // ambos nombres deben conservarse, no perderse ni pisarse.
  assert.deepEqual(new Set(tiendaA.pointNames), new Set(['Tienda A', 'Cam SMD Tienda A']));

  const tiendaB = entries.find((e) => e.ip === '10.10.10.12');
  assert.deepEqual(tiendaB.pointNames, ['Tienda B']);
}));

test('readKnownHaplites sobre una base vacía devuelve una lista vacía, sin lanzar', () => withDatabase((db) => {
  assert.deepEqual(readKnownHaplites(db), []);
}));
