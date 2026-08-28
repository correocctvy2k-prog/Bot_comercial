'use strict';

const fs = require('node:fs');
const path = require('node:path');

const projectRoot = path.resolve(__dirname, '..');

function resolveConfiguredPath(variable, fallback) {
  const configured = process.env[variable];
  if (!configured) return path.resolve(fallback);
  return path.isAbsolute(configured)
    ? path.normalize(configured)
    : path.resolve(projectRoot, configured);
}

const dataRoot = resolveConfiguredPath('CCTV_DATA_ROOT', path.join(projectRoot, 'data'));
const logDir = resolveConfiguredPath('CCTV_LOG_DIR', path.join(projectRoot, 'logs'));

const runtimePaths = Object.freeze({
  projectRoot,
  dataRoot,
  dbPath: resolveConfiguredPath('CCTV_DB', path.join(dataRoot, 'cctv-staging.db')),
  imapStatePath: resolveConfiguredPath('IMAP_STATE_PATH', path.join(projectRoot, 'state.json')),
  eventSnapshotDir: resolveConfiguredPath('EVENT_SNAPSHOT_DIR', path.join(dataRoot, 'event-snapshots')),
  supportImageDir: resolveConfiguredPath('SUPPORT_IMAGE_DIR', path.join(dataRoot, 'support-images')),
  logDir,
  reportDir: resolveConfiguredPath('CCTV_REPORT_DIR', path.join(projectRoot, 'reports')),
  outputDir: resolveConfiguredPath('CCTV_OUTPUT_DIR', path.join(projectRoot, 'output')),
  siisSnapshotPath: resolveConfiguredPath('SIIS_SNAPSHOT_PATH', path.join(dataRoot, 'siis-snapshot-latest.json')),
  trelloCacheDb: resolveConfiguredPath(
    'TRELLO_CACHE_DB',
    path.join(projectRoot, '..', 'CRM_Frontend', 'Table Trello', 'backend', 'data', 'skylab-tareas.db'),
  ),
  trelloEnvFile: resolveConfiguredPath(
    'TRELLO_ENV_FILE',
    path.join(projectRoot, '..', 'CRM_Frontend', 'Table Trello', 'backend', '.env'),
  ),
  trelloBackendRoot: resolveConfiguredPath(
    'TRELLO_BACKEND_ROOT',
    path.join(projectRoot, '..', 'CRM_Frontend', 'Table Trello', 'backend'),
  ),
});

function ensureRuntimeDirectories() {
  const directories = new Set([
    path.dirname(runtimePaths.dbPath),
    path.dirname(runtimePaths.imapStatePath),
    runtimePaths.eventSnapshotDir,
    runtimePaths.supportImageDir,
    runtimePaths.logDir,
    runtimePaths.reportDir,
    runtimePaths.outputDir,
    path.dirname(runtimePaths.siisSnapshotPath),
  ]);
  for (const directory of directories) fs.mkdirSync(directory, { recursive: true });
}

module.exports = { runtimePaths, resolveConfiguredPath, ensureRuntimeDirectories };
