'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { DatabaseSync } = require('node:sqlite');

function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i += 2) args[argv[i].replace(/^--/, '')] = argv[i + 1];
  return args;
}

function reconcileRows(siisRows, maintenanceRows) {
  const byCode = new Map();
  for (const row of maintenanceRows) {
    const code = String(row.siis_code || '').trim();
    if (!code) continue;
    if (!byCode.has(code)) byCode.set(code, []);
    byCode.get(code).push(row);
  }
  const matchedMaintenanceIds = new Set();
  const rows = siisRows.map((siis) => {
    const matches = byCode.get(String(siis.siis_code).trim()) || [];
    if (matches.length === 1) {
      matchedMaintenanceIds.add(matches[0].maintenance_id);
      return { status: 'CODE_EXACT', siis, maintenance: matches[0] };
    }
    return { status: matches.length > 1 ? 'DUPLICATE_MAINTENANCE_CODE' : 'SIIS_ONLY', siis, maintenance: null, candidates: matches.length };
  });
  for (const maintenance of maintenanceRows) {
    if (maintenance.siis_code && !matchedMaintenanceIds.has(maintenance.maintenance_id)) rows.push({ status: 'MAINTENANCE_ONLY', siis: null, maintenance });
  }
  return rows;
}

function markdown(report) {
  const pending = report.rows.filter(r => r.status !== 'CODE_EXACT' || r.maintenance?.inventory_decision !== 'AUTO_EXACT');
  return [
    '# Conciliación SIIS → mantenimiento → CCTV', '',
    `- Generado: ${report.generatedAt}`,
    `- Ejecución SIIS: ${report.siisRunId}`,
    `- Importación CCTV: ${report.importRunId}`,
    `- Códigos SIIS recibidos: ${report.summary.siis}`,
    `- Coincidencias exactas por código: ${report.summary.codeExact}`,
    `- Cadena completa con inventario exacto: ${report.summary.fullChainExact}`,
    `- Pendientes accionables CCTV: ${report.summary.actionablePending}`,
    `- Estaciones SIIS fuera del alcance de mantenimiento actual: ${report.summary.siisOnly}`,
    '', '## Pendientes', '',
    '| Estado | Código SIIS | Nombre SIIS | Punto mantenimiento | Candidato CCTV | Decisión inventario |',
    '|---|---|---|---|---|---|',
    ...pending.map(r => `| ${r.status} | ${r.siis?.siis_code || r.maintenance?.siis_code || ''} | ${r.siis?.name_raw || ''} | ${r.maintenance?.point_name_raw || ''} | ${r.maintenance?.inventory_name || ''} | ${r.maintenance?.inventory_decision || ''} |`),
  ].join('\n');
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const dbPath = path.resolve(args.db || process.env.CCTV_DB || 'data/cctv-staging.db');
  const outputPath = path.resolve(args.output || 'reports/siis-reconciliation-latest.json');
  const db = new DatabaseSync(dbPath, { readOnly: true });
  const siisRun = db.prepare("SELECT id FROM siis_sync_runs WHERE status='SUCCESS' ORDER BY id DESC LIMIT 1").get();
  const importRun = db.prepare("SELECT id FROM import_runs WHERE status='SUCCESS' ORDER BY id DESC LIMIT 1").get();
  if (!siisRun) throw new Error('No existe una importación SIIS exitosa');
  if (!importRun) throw new Error('No existe una importación CCTV exitosa');
  const siisRows = db.prepare('SELECT siis_code,name_raw,name_key,online,quality_flags FROM stg_siis_locations WHERE sync_run_id=? ORDER BY siis_code').all(siisRun.id);
  const maintenanceRows = db.prepare(`SELECT m.id AS maintenance_id,m.siis_code,m.point_name_raw,m.region_raw,
    i.id AS inventory_id,i.location_name_raw AS inventory_name,c.match_method AS inventory_match_method,c.decision AS inventory_decision,c.score AS inventory_score
    FROM stg_maintenance_points m
    LEFT JOIN reconciliation_candidates c ON c.maintenance_point_id=m.id AND c.import_run_id=m.import_run_id
    LEFT JOIN stg_inventory_locations i ON i.id=c.inventory_location_id
    WHERE m.import_run_id=? ORDER BY m.siis_code,m.point_name_raw`).all(importRun.id);
  db.close();
  const rows = reconcileRows(siisRows, maintenanceRows);
  const summary = {
    siis: siisRows.length,
    maintenanceWithCode: maintenanceRows.filter(r => r.siis_code).length,
    codeExact: rows.filter(r => r.status === 'CODE_EXACT').length,
    fullChainExact: rows.filter(r => r.status === 'CODE_EXACT' && r.maintenance.inventory_decision === 'AUTO_EXACT').length,
    inventoryReview: rows.filter(r => r.status === 'CODE_EXACT' && r.maintenance?.inventory_decision !== 'AUTO_EXACT').length,
    maintenanceOnly: rows.filter(r => r.status === 'MAINTENANCE_ONLY').length,
    siisOnly: rows.filter(r => r.status === 'SIIS_ONLY').length,
    duplicateMaintenanceCodes: rows.filter(r => r.status === 'DUPLICATE_MAINTENANCE_CODE').length,
  };
  summary.actionablePending = summary.inventoryReview + summary.maintenanceOnly + summary.duplicateMaintenanceCodes;
  const report = { generatedAt: new Date().toISOString(), siisRunId: siisRun.id, importRunId: importRun.id, summary, rows };
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, JSON.stringify(report, null, 2));
  fs.writeFileSync(outputPath.replace(/\.json$/i, '.md'), markdown(report));
  console.log(JSON.stringify({ ok: true, outputPath, summary }, null, 2));
}

if (require.main === module) {
  try { main(); } catch (error) { console.error(error.message); process.exit(1); }
}

module.exports = { reconcileRows, markdown };
