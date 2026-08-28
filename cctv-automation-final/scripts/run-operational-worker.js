'use strict';

require('dotenv').config({ quiet: true });
const path = require('node:path');
const { spawn } = require('node:child_process');
const { runtimePaths, ensureRuntimeDirectories } = require('../config/runtime-paths');

ensureRuntimeDirectories();
const intervalMs = Math.max(30_000, Number(process.env.OPERATIONAL_CYCLE_INTERVAL_MS || 60_000));
let stopping = false;
let child = null;

function runCycle() {
  if (stopping) return;
  child = spawn(process.execPath, [path.join(runtimePaths.projectRoot, 'scripts', 'run-operational-cycle.js')], {
    cwd: runtimePaths.projectRoot,
    env: process.env,
    stdio: 'inherit',
  });
  child.once('exit', (code, signal) => {
    child = null;
    if (stopping) return;
    if (code && code !== 0) console.error(`Ciclo operativo terminó con código ${code}${signal ? ` (${signal})` : ''}`);
    setTimeout(runCycle, intervalMs);
  });
}

function shutdown(signal) {
  stopping = true;
  if (child && !child.killed) child.kill(signal);
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
runCycle();
