'use strict';

// Sincroniza la identidad de los hAP lite reales (torre + IP + nombre de punto) desde
// la semilla local de cybersecurity (cyber_towers/cyber_tower_points) a Supabase
// (cyber_known_haplites) -- spec 0013, hallazgo 2026-09-21: puntos_venta.ip nunca es
// la IP del hAP lite (0/96 coinciden), así que monitor_puntos_wpp.py necesita su
// propia lista de IPs reales para poder pingearlas/probarlas.
//
// Solo escribe identidad (ip/tower_name/point_names/synced_at) -- nunca toca
// active/latency/nvr_port/nvr_checked_at, que son responsabilidad exclusiva de
// monitor_puntos_wpp.py (mismo principio que separa dss-importer.js de
// ksc-importer.js: cada escritor solo toca sus propias columnas).
//
// Uso:
//   node scripts/sync-known-haplites-to-supabase.js [--db <cyber-inventory.db>] [--apply]
// Sin --apply: solo imprime lo que se sincronizaría (modo auditoría).

require('dotenv').config({ path: require('node:path').join(__dirname, '..', '..', '.env'), quiet: true });

const path = require('node:path');
const { openCyberDatabase } = require('../db/open-database');

function argument(name, fallback = null) {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] : fallback;
}

function requireSupabaseEnv() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('Falta SUPABASE_URL / SUPABASE_KEY (service role) en .env');
  return { url, key };
}

function readKnownHaplites(db) {
  const rows = db.prepare(`
    SELECT t.name AS towerName, p.haplite_ip AS ip, p.point_name AS pointName
    FROM cyber_tower_points p
    JOIN cyber_towers t ON t.id = p.tower_id
    ORDER BY p.haplite_ip, p.point_name
  `).all();
  const byIp = new Map();
  for (const row of rows) {
    const existing = byIp.get(row.ip) || { ip: row.ip, towerName: row.towerName, pointNames: [] };
    existing.pointNames.push(row.pointName);
    byIp.set(row.ip, existing);
  }
  return [...byIp.values()];
}

async function upsertKnownHaplites({ url, key }, entries, syncedAt) {
  const payload = entries.map((entry) => ({
    ip: entry.ip,
    tower_name: entry.towerName,
    point_names: entry.pointNames.join(' · '),
    synced_at: syncedAt,
  }));
  const response = await fetch(`${url}/rest/v1/cyber_known_haplites?on_conflict=ip`, {
    method: 'POST',
    headers: {
      apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json',
      Prefer: 'resolution=merge-duplicates,return=minimal',
    },
    body: JSON.stringify(payload),
  });
  if (!response.ok) throw new Error(`Supabase (upsert cyber_known_haplites) respondió ${response.status}: ${await response.text().catch(() => '')}`);
}

async function run({ dbPath, apply }) {
  const db = openCyberDatabase(path.resolve(dbPath));
  try {
    const entries = readKnownHaplites(db);
    if (!apply) return { mode: 'AUDIT_ONLY', counts: { total: entries.length } };
    const supabase = requireSupabaseEnv();
    const syncedAt = new Date().toISOString();
    await upsertKnownHaplites(supabase, entries, syncedAt);
    return { status: 'SUCCESS', synced: entries.length, syncedAt };
  } finally {
    db.close();
  }
}

if (require.main === module) {
  const dbPath = argument('db');
  const apply = process.argv.includes('--apply');
  if (!dbPath) {
    console.error('[ERROR] --db es requerido');
    process.exitCode = 1;
  } else {
    run({ dbPath, apply })
      .then((result) => console.log(JSON.stringify(result, null, 2)))
      .catch((error) => {
        console.error(`[ERROR] ${error.message}`);
        process.exitCode = 1;
      });
  }
}

module.exports = { readKnownHaplites, run };
