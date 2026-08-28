'use strict';

require('dotenv').config({ quiet: true });

const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { DatabaseSync } = require('node:sqlite');
const { runtimePaths } = require('../config/runtime-paths');

const root = path.resolve(__dirname, '..');
const runtimeDir = runtimePaths.logDir;
const lockPath = path.join(runtimeDir, 'operational-cycle.lock');
const auditPath = path.join(runtimeDir, 'operational-cycle.jsonl');
fs.mkdirSync(runtimeDir, { recursive: true });

function audit(entry) {
  fs.appendFileSync(auditPath, `${JSON.stringify({ at: new Date().toISOString(), ...entry })}\n`);
}

function acquireLock() {
  const token = `${process.pid}-${Date.now()}`;
  const metadata = JSON.stringify({ pid: process.pid, token, startedAt: new Date().toISOString() });
  try {
    const fd = fs.openSync(lockPath, 'wx');
    fs.writeFileSync(fd, metadata);
    return { fd, token };
  } catch (error) {
    if (error.code !== 'EEXIST') throw error;

    // Un archivo vacío o un PID que ya no existe corresponde a una ejecución
    // interrumpida. No esperamos 30 minutos para recuperar el ciclo operativo.
    let owner = null;
    try { owner = JSON.parse(fs.readFileSync(lockPath, 'utf8')); } catch {}
    let ownerAlive = false;
    if (Number.isInteger(owner?.pid) && owner.pid > 0) {
      try {
        process.kill(owner.pid, 0);
        ownerAlive = true;
      } catch (processError) {
        if (processError.code === 'EPERM') ownerAlive = true;
      }
    }
    if (ownerAlive) return null;

    fs.unlinkSync(lockPath);
    const fd = fs.openSync(lockPath, 'wx');
    fs.writeFileSync(fd, metadata);
    return { fd, token };
  }
}

function releaseLock(lock) {
  try { fs.closeSync(lock.fd); } catch {}
  try {
    const owner = JSON.parse(fs.readFileSync(lockPath, 'utf8'));
    if (owner.token === lock.token) fs.unlinkSync(lockPath);
  } catch {}
}

function run(script, timeoutMs = 120000) {
  const result = spawnSync(process.execPath, [path.join(root, script)], {
    cwd: root,
    encoding: 'utf8',
    windowsHide: true,
    timeout: timeoutMs,
  });
  return {
    script,
    status: result.error?.code === 'ETIMEDOUT' ? 124 : result.status,
    timedOut: result.error?.code === 'ETIMEDOUT',
    stdout: String(result.stdout || '').trim().slice(-2000),
    stderr: String(result.stderr || '').trim().slice(-2000),
  };
}

function maintenanceDue() {
  const intervalMinutes = Math.max(1, Number(process.env.MAINTENANCE_SYNC_INTERVAL_MINUTES || 1));
  const dbPath = runtimePaths.dbPath;
  if (!fs.existsSync(dbPath)) return { due: true, intervalMinutes, reason: 'NO_DATABASE' };
  const db = new DatabaseSync(dbPath, { readOnly: true });
  try {
    const table = db.prepare("SELECT 1 ok FROM sqlite_master WHERE type='table' AND name='maintenance_source_runs'").get();
    if (!table) return { due: true, intervalMinutes, reason: 'NO_RUN_TABLE' };
    const latest = db.prepare("SELECT completed_at FROM maintenance_source_runs WHERE source_system='TRELLO' AND status='SUCCESS' ORDER BY id DESC LIMIT 1").get();
    if (!latest?.completed_at) return { due: true, intervalMinutes, reason: 'NO_SUCCESSFUL_RUN' };
    const ageMinutes = (Date.now() - new Date(latest.completed_at).getTime()) / 60000;
    const due = ageMinutes >= intervalMinutes - 0.5;
    return { due, intervalMinutes, ageMinutes: Math.round(ageMinutes), lastSuccessAt: latest.completed_at, reason: due ? 'STALE' : 'FRESH' };
  } finally { db.close(); }
}

function operationalSourceDue(source, intervalMinutes = 5) {
  if (!fs.existsSync(auditPath)) return { due: true, reason: 'NO_AUDIT' };
  const lines = fs.readFileSync(auditPath, 'utf8').trim().split(/\r?\n/).reverse();
  for (const line of lines) {
    try {
      const entry = JSON.parse(line);
      if (entry?.[source]?.status !== 0 || entry[source].skipped) continue;
      const ageMinutes = (Date.now() - new Date(entry.at).getTime()) / 60000;
      return { due: ageMinutes >= intervalMinutes - 0.1, intervalMinutes, ageMinutes: Math.round(ageMinutes), lastSuccessAt: entry.at };
    } catch {}
  }
  return { due: true, intervalMinutes, reason: 'NO_SUCCESSFUL_RUN' };
}

if (process.argv.includes('--dry-run')) {
  console.log(JSON.stringify({ ok: true, mode: 'DRY_RUN', maintenance: maintenanceDue() }, null, 2));
  process.exit(0);
}

const lock = acquireLock();
if (lock === null) {
  audit({ status: 'SKIPPED_OVERLAP' });
  process.exit(0);
}

try {
  const emailSchedule = operationalSourceDue('email', 5);
  const email = emailSchedule.due
    ? run('index.js', 180000)
    : { script: 'index.js', status: 0, skipped: true, ...emailSchedule };
  // Los visitantes tienen una tarea exclusiva a las 20:00. Evitamos releer la
  // carpeta IMAP en cada ciclo operativo de cinco minutos.
  const visitors = { script: 'scripts/import-visitor-reports.js', status: 0, skipped: true, reason: 'DEDICATED_20H_TASK' };
  const siisSchedule = operationalSourceDue('siis', 5);
  const siis = siisSchedule.due
    ? run(path.join('scripts', 'run-siis-observer.js'))
    : { script: 'scripts/run-siis-observer.js', status: 0, skipped: true, ...siisSchedule };
  const maintenanceSchedule = maintenanceDue();
  const trelloRefresh = maintenanceSchedule.due
    ? run(path.join('scripts', 'refresh-trello-maintenance-cache.js'))
    : { script: 'scripts/refresh-trello-maintenance-cache.js', status: 0, skipped: true, ...maintenanceSchedule };
  const maintenance = maintenanceSchedule.due
    ? run(path.join('platform', 'import-trello-maintenance.js'))
    : { script: 'platform/import-trello-maintenance.js', status: 0, skipped: true, ...maintenanceSchedule };
  const support = maintenanceSchedule.due
    ? run(path.join('platform', 'import-trello-support.js'))
    : { script: 'platform/import-trello-support.js', status: 0, skipped: true, ...maintenanceSchedule };
  // A partir de las 22:00 genera un único corte diario persistente. Antes de
  // esa hora y si el día ya fue cerrado, el script termina sin modificarlo.
  const closure = run(path.join('scripts', 'generate-operational-closure.js'));
  const criticalOk = email.status === 0 && siis.status === 0;
  const status = !criticalOk ? 'PARTIAL_FAILURE' : trelloRefresh.status === 0 && maintenance.status === 0 && support.status === 0 && visitors.status === 0 && closure.status === 0 ? 'SUCCESS' : 'SUCCESS_WITH_WARNINGS';
  audit({ status, email, visitors, siis, trelloRefresh, maintenance, support, closure });
  if (!criticalOk) process.exitCode = 1;
} catch (error) {
  audit({ status: 'ERROR', error: error.message });
  process.exitCode = 1;
} finally {
  releaseLock(lock);
}
