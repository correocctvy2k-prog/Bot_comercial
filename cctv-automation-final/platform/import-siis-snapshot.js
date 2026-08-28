'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { DatabaseSync } = require('node:sqlite');
const { normalizeSiisSnapshot, snapshotFingerprint } = require('./siis');

function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i += 2) args[argv[i].replace(/^--/, '')] = argv[i + 1];
  return args;
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!args.input) throw new Error('Uso: node platform/import-siis-snapshot.js --input <estaciones.json> [--db data/cctv-staging.db]');
  const inputPath = path.resolve(args.input);
  const dbPath = path.resolve(args.db || process.env.CCTV_DB || 'data/cctv-staging.db');
  const payload = JSON.parse(fs.readFileSync(inputPath, 'utf8'));
  const rows = normalizeSiisSnapshot(payload);
  fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  const db = new DatabaseSync(dbPath);
  db.exec(fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8'));
  const startedAt = new Date().toISOString();
  const run = db.prepare(`INSERT INTO siis_sync_runs
    (started_at,status,source_reference,source_fingerprint,received_count)
    VALUES (?,?,?,?,?)`).run(startedAt, 'RUNNING', inputPath, snapshotFingerprint(payload), rows.length);
  const runId = Number(run.lastInsertRowid);
  const insert = db.prepare(`INSERT INTO stg_siis_locations
    (sync_run_id,siis_code,name_raw,name_key,online,source_index,payload_json,quality_flags)
    VALUES (?,?,?,?,?,?,?,?)`);
  let valid = 0;
  let invalid = 0;
  try {
    db.exec('BEGIN');
    for (const row of rows) {
      if (row.qualityFlags.includes('MISSING_SIIS_CODE') || row.qualityFlags.includes('DUPLICATE_SIIS_CODE')) { invalid++; continue; }
      insert.run(runId, row.siisCode, row.name, row.nameKey, row.online == null ? null : Number(row.online), row.sourceIndex, JSON.stringify(row.raw), JSON.stringify(row.qualityFlags));
      valid++;
    }
    db.exec('COMMIT');
    const summary = { received: rows.length, valid, invalid, online: rows.filter(r => r.online === true && r.siisCode).length, offline: rows.filter(r => r.online === false && r.siisCode).length };
    db.prepare('UPDATE siis_sync_runs SET completed_at=?,status=?,valid_count=?,invalid_count=?,summary_json=? WHERE id=?')
      .run(new Date().toISOString(), 'SUCCESS', valid, invalid, JSON.stringify(summary), runId);
    console.log(JSON.stringify({ ok: true, runId, dbPath, summary }, null, 2));
  } catch (error) {
    try { db.exec('ROLLBACK'); } catch {}
    db.prepare('UPDATE siis_sync_runs SET completed_at=?,status=?,summary_json=? WHERE id=?').run(new Date().toISOString(), 'ERROR', JSON.stringify({ error: error.message }), runId);
    throw error;
  } finally { db.close(); }
}

try { main(); } catch (error) { console.error(error.message); process.exit(1); }
