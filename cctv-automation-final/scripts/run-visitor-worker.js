'use strict';

require('dotenv').config({ quiet: true });
const fs = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { runtimePaths, ensureRuntimeDirectories } = require('../config/runtime-paths');

ensureRuntimeDirectories();
const statePath = path.join(runtimePaths.logDir, 'visitor-worker-state.json');
const pollMs = Math.max(60_000, Number(process.env.VISITOR_WORKER_POLL_MS || 300_000));
const scheduledHour = Math.min(23, Math.max(0, Number(process.env.VISITOR_IMPORT_HOUR || 20)));
let running = false;
let stopping = false;
let child = null;

function bogotaParts() {
  return Object.fromEntries(new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Bogota', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', hourCycle: 'h23',
  }).formatToParts(new Date()).filter(part => part.type !== 'literal').map(part => [part.type, part.value]));
}

function lastCompletedDate() {
  try { return JSON.parse(fs.readFileSync(statePath, 'utf8')).lastCompletedDate || null; } catch { return null; }
}

function tick() {
  if (stopping || running) return;
  const now = bogotaParts();
  const date = `${now.year}-${now.month}-${now.day}`;
  if (Number(now.hour) < scheduledHour || lastCompletedDate() === date) return;
  running = true;
  child = spawn(process.execPath, [path.join(runtimePaths.projectRoot, 'scripts', 'import-visitor-reports.js')], {
    cwd: runtimePaths.projectRoot,
    env: process.env,
    stdio: 'inherit',
  });
  child.once('exit', code => {
    child = null;
    running = false;
    if (code === 0) fs.writeFileSync(statePath, `${JSON.stringify({ lastCompletedDate: date, completedAt: new Date().toISOString() }, null, 2)}\n`);
    else console.error(`Importación de visitantes terminó con código ${code}`);
  });
}

function shutdown(signal) {
  stopping = true;
  if (child && !child.killed) child.kill(signal);
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
tick();
const timer = setInterval(tick, pollMs);
