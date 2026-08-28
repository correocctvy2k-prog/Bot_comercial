require('dotenv').config({ quiet: true });
const ExcelJS = require('exceljs');
const { DatabaseSync } = require('node:sqlite');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { normalizeName, similarity, asText } = require('./normalize');

function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i += 2) args[argv[i].replace(/^--/, '')] = argv[i + 1];
  return args;
}

function fingerprint(paths) {
  const hash = crypto.createHash('sha256');
  for (const file of paths) {
    hash.update(path.resolve(file));
    hash.update(fs.readFileSync(file));
  }
  return hash.digest('hex');
}

function qualityFlags(record, required) {
  return required.filter((key) => record[key] == null || record[key] === '').map((key) => `MISSING_${key.toUpperCase()}`);
}

function value(row, column) {
  return asText(row.getCell(column).value);
}

function numberValue(row, column) {
  const raw = row.getCell(column).value;
  if (raw == null || raw === '') return null;
  if (typeof raw === 'number') return raw;
  const text = asText(raw);
  if (text == null || text === '') return null;
  const parsed = Number(text);
  return Number.isFinite(parsed) ? parsed : null;
}

async function loadWorkbook(filePath) {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(filePath);
  return workbook;
}

function insertInventory(db, runId, workbook) {
  const sheet = workbook.getWorksheet('cctv');
  if (!sheet) throw new Error('DATOS CCTV no contiene la hoja cctv');
  const insert = db.prepare(`INSERT INTO stg_inventory_locations
    (import_run_id,source_sheet,source_row,region_raw,location_name_raw,location_name_key,haplite_ip,secondary_network,cctv_network,wifi_network,nat_status,recorder_port,recorder_ip,camera_count,firmware_raw,alarm_raw,monitoring_raw,analytics_raw,camera_firmware_raw,dss_identifier,recorder_model,quality_flags)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`);
  const regions = new Set(['PALMIRA', 'ROZO', 'AMAIME', 'FLORIDA', 'PRADERA', 'CANDELARIA', 'OCCIDENTE']);
  let region = null;
  let count = 0;
  for (let rowNumber = 4; rowNumber <= sheet.rowCount; rowNumber++) {
    const row = sheet.getRow(rowNumber);
    const location = value(row, 4);
    const cameras = numberValue(row, 12);
    if (location && regions.has(normalizeName(location)) && cameras == null) {
      region = normalizeName(location);
      continue;
    }
    if (!location && cameras == null) continue;
    // La hoja termina con un total general de cámaras sin nombre de punto.
    // Se excluye del staging para no convertir un agregado en ubicación.
    if (!location && cameras > 64 && !value(row, 5) && !value(row, 7) && !value(row, 11)) continue;
    const record = {
      location_name_raw: location,
      haplite_ip: value(row, 5),
      cctv_network: value(row, 7),
      recorder_ip: value(row, 11),
      firmware_raw: value(row, 13),
    };
    const flags = qualityFlags(record, ['location_name_raw', 'cctv_network', 'recorder_ip', 'firmware_raw']);
    if (cameras == null) flags.push('MISSING_CAMERA_COUNT');
    insert.run(runId, 'cctv', rowNumber, region, location, normalizeName(location), record.haplite_ip, value(row, 6), record.cctv_network, value(row, 8), value(row, 9), value(row, 10), record.recorder_ip, cameras, record.firmware_raw, value(row, 14), value(row, 15), value(row, 16), value(row, 17), value(row, 19), value(row, 20), JSON.stringify(flags));
    count++;
  }
  return count;
}

function insertAlarmPanels(db, runId, workbook) {
  const sheet = workbook.getWorksheet('Alarmas OSZFORD');
  if (!sheet) return 0;
  const insert = db.prepare(`INSERT INTO stg_alarm_panels
    (import_run_id,source_row,location_name_raw,location_name_key,ip_address,subnet_mask,gateway,account_number,panel_type,firmware,serial_number,panel_id,communication_status,quality_flags)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`);
  let count = 0;
  for (let n = 3; n <= sheet.rowCount; n++) {
    const row = sheet.getRow(n);
    // La hoja conserva una columna B de consecutivo. Los datos operativos
    // empiezan realmente en C (OFICINA) y terminan en L (COM GPRS/IP).
    const location = value(row, 3);
    if (!location) continue;
    const record = { serial: value(row, 10), status: value(row, 12) };
    insert.run(runId, n, location, normalizeName(location), value(row, 4), value(row, 5), value(row, 6), value(row, 7), value(row, 8), value(row, 9), record.serial, value(row, 11), record.status, JSON.stringify(qualityFlags(record, ['serial', 'status'])));
    count++;
  }
  return count;
}

function insertVehicles(db, runId, workbook) {
  const sheet = workbook.getWorksheet('Vehiculos');
  if (!sheet) return 0;
  const insert = db.prepare(`INSERT INTO stg_vehicles
    (import_run_id,source_row,plate,brand,line,model_year,engine_displacement,cctv_description,serial_number,gprs_id,sim_reference,carrier,notes,quality_flags)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`);
  let count = 0;
  for (let n = 2; n <= sheet.rowCount; n++) {
    const row = sheet.getRow(n);
    const plate = value(row, 2);
    if (!plate) continue;
    const record = { plate, serial: value(row, 8), cctv: value(row, 7) };
    insert.run(runId, n, plate, value(row, 3), value(row, 4), numberValue(row, 5), value(row, 6), record.cctv, record.serial, value(row, 9), value(row, 10), value(row, 11), value(row, 12), JSON.stringify(qualityFlags(record, ['plate', 'serial', 'cctv'])));
    count++;
  }
  return count;
}

function insertProjects(db, runId, workbook) {
  const sheet = workbook.getWorksheet('Proyecto Actualizacion');
  if (!sheet) return 0;
  const insert = db.prepare(`INSERT INTO stg_upgrade_projects
    (import_run_id,source_row,project_stream,target_location_raw,target_location_key,transfer_or_scope_raw,investment_amount,region_raw)
    VALUES (?,?,?,?,?,?,?,?)`);
  const streams = [
    { name: 'HIGH_VALUE_AI_SPORTBOOK', target: 2, scope: 3, investment: 4 },
    { name: 'HIGH_VALUE_AI', target: 6, scope: null, investment: 7 },
    { name: 'REGIONAL_SUMMARY_OR_REUSE', target: 10, scope: 11, investment: null },
  ];
  let count = 0;
  for (let n = 3; n <= sheet.rowCount; n++) {
    const row = sheet.getRow(n);
    for (const stream of streams) {
      const target = value(row, stream.target);
      if (!target || /^(PALMIRA|ROZO|AMAIME|FLORIDA|PRADERA|CANDELARIA|OCCIDENTE|TOTAL|PUNTOS)$/i.test(target)) continue;
      insert.run(runId, n, stream.name, target, normalizeName(target), stream.scope ? value(row, stream.scope) : null, stream.investment ? numberValue(row, stream.investment) : null, null);
      count++;
    }
  }
  return count;
}

function getMaintenanceBlocks(sheet) {
  const blocks = [];
  const header = sheet.getRow(2);
  const periods = sheet.getRow(3);
  for (let col = 1; col <= Math.max(header.cellCount, periods.cellCount) - 2; col++) {
    if (normalizeName(value(header, col)) !== 'PERIODO') continue;
    if (normalizeName(value(periods, col)) === 'R1' && normalizeName(value(periods, col + 1)) === 'R2' && normalizeName(value(periods, col + 2)) === 'R3') {
      blocks.push({ region: value(header, col - 1), codeCol: col - 2, pointCol: col - 1, r1: col, r2: col + 1, r3: col + 2 });
    }
  }
  return blocks;
}

function insertMaintenance(db, runId, workbook) {
  const sheet = workbook.getWorksheet('Total');
  if (!sheet) throw new Error('Programación anual no contiene la hoja Total');
  const insert = db.prepare(`INSERT INTO stg_maintenance_points
    (import_run_id,source_sheet,source_row,region_raw,siis_code,point_name_raw,point_name_key,r1_value,r2_value,r3_value)
    VALUES (?,?,?,?,?,?,?,?,?,?)`);
  let count = 0;
  for (const block of getMaintenanceBlocks(sheet)) {
    for (let n = 4; n <= sheet.rowCount; n++) {
      const row = sheet.getRow(n);
      const point = value(row, block.pointCol);
      if (!point || normalizeName(point) === 'TOTAL' || row.getCell(block.pointCol).formula) continue;
      insert.run(runId, 'Total', n, block.region, value(row, block.codeCol), point, normalizeName(point), numberValue(row, block.r1), numberValue(row, block.r2), numberValue(row, block.r3));
      count++;
    }
  }
  return count;
}

function reconcile(db, runId, aliasesPath) {
  const inventory = db.prepare('SELECT id, location_name_raw, location_name_key FROM stg_inventory_locations WHERE import_run_id=? AND location_name_key<>\'\'').all(runId);
  const maintenance = db.prepare('SELECT id, point_name_raw, point_name_key FROM stg_maintenance_points WHERE import_run_id=?').all(runId);
  const aliasFile = JSON.parse(fs.readFileSync(aliasesPath, 'utf8'));
  const aliasMap = new Map(aliasFile.aliases.map((item) => [normalizeName(item.alias), normalizeName(item.canonicalCandidate)]));
  const insert = db.prepare('INSERT INTO reconciliation_candidates (import_run_id,maintenance_point_id,inventory_location_id,match_method,score,decision) VALUES (?,?,?,?,?,?)');
  const stats = { exact: 0, alias: 0, suggested: 0, unmatched: 0 };
  for (const point of maintenance) {
    const exact = inventory.filter((item) => item.location_name_key === point.point_name_key);
    if (exact.length === 1) {
      insert.run(runId, point.id, exact[0].id, 'EXACT_NORMALIZED', 1, 'AUTO_EXACT');
      stats.exact++;
      continue;
    }
    const aliasTarget = aliasMap.get(point.point_name_key);
    const aliasMatch = aliasTarget ? inventory.find((item) => item.location_name_key === aliasTarget) : null;
    if (aliasMatch) {
      insert.run(runId, point.id, aliasMatch.id, 'CURATED_ALIAS_CANDIDATE', 0.99, 'PENDING');
      stats.alias++;
      continue;
    }
    const ranked = inventory.map((item) => ({ item, score: similarity(point.point_name_raw, item.location_name_raw) })).sort((a, b) => b.score - a.score);
    const best = ranked[0];
    if (best && best.score >= 0.72) {
      insert.run(runId, point.id, best.item.id, 'FUZZY_SUGGESTION', best.score, 'PENDING');
      stats.suggested++;
    } else {
      insert.run(runId, point.id, null, 'NO_CANDIDATE', best?.score || 0, 'UNMATCHED');
      stats.unmatched++;
    }
  }
  return stats;
}

function writeReport(db, runId, summary, reportPath) {
  const unresolved = db.prepare(`SELECT m.siis_code,m.point_name_raw,m.region_raw,c.match_method,c.score,i.location_name_raw AS candidate
    FROM reconciliation_candidates c JOIN stg_maintenance_points m ON m.id=c.maintenance_point_id
    LEFT JOIN stg_inventory_locations i ON i.id=c.inventory_location_id
    WHERE c.import_run_id=? AND c.decision<>'AUTO_EXACT' ORDER BY c.score DESC, m.point_name_raw`).all(runId);
  const flags = db.prepare(`SELECT quality_flags, COUNT(*) AS count FROM stg_inventory_locations WHERE import_run_id=? GROUP BY quality_flags ORDER BY count DESC`).all(runId);
  const report = { runId, generatedAt: new Date().toISOString(), summary, unresolved, inventoryQualityFlagGroups: flags };
  fs.mkdirSync(path.dirname(reportPath), { recursive: true });
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
  const mdPath = reportPath.replace(/\.json$/i, '.md');
  const md = [
    '# Conciliación inicial CCTV', '',
    `- Ejecución: ${runId}`,
    `- Inventario: ${summary.inventoryLocations}`,
    `- Paneles de alarma: ${summary.alarmPanels}`,
    `- Vehículos: ${summary.vehicles}`,
    `- Elementos de proyecto: ${summary.projects}`,
    `- Puntos de mantenimiento: ${summary.maintenancePoints}`,
    `- Coincidencias exactas: ${summary.reconciliation.exact}`,
    `- Alias por revisar: ${summary.reconciliation.alias}`,
    `- Sugerencias aproximadas: ${summary.reconciliation.suggested}`,
    `- Sin candidato: ${summary.reconciliation.unmatched}`,
    '', '## Pendientes de decisión', '',
    '| Código SIIS | Programación | Candidato inventario | Método | Puntaje |',
    '|---|---|---|---|---:|',
    ...unresolved.map((x) => `| ${x.siis_code || ''} | ${x.point_name_raw} | ${x.candidate || ''} | ${x.match_method} | ${Number(x.score).toFixed(2)} |`),
  ].join('\n');
  fs.writeFileSync(mdPath, md);
  return { json: reportPath, markdown: mdPath };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const inventoryPath = path.resolve(args.inventory || 'DATOS CCTV.xlsx');
  const maintenancePath = path.resolve(args.annual || '2026 programacion anual CCTV.xlsx');
  const dbPath = path.resolve(args.db || process.env.CCTV_DB || 'data/cctv-staging.db');
  const reportPath = path.resolve(args.report || 'reports/reconciliation-latest.json');
  fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  const db = new DatabaseSync(dbPath);
  db.exec(fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8'));
  const startedAt = new Date().toISOString();
  const fp = fingerprint([inventoryPath, maintenancePath]);
  const run = db.prepare('INSERT INTO import_runs (started_at,status,inventory_file,maintenance_file,source_fingerprint) VALUES (?,?,?,?,?)').run(startedAt, 'RUNNING', inventoryPath, maintenancePath, fp);
  const runId = Number(run.lastInsertRowid);
  try {
    const [inventoryBook, maintenanceBook] = await Promise.all([loadWorkbook(inventoryPath), loadWorkbook(maintenancePath)]);
    db.exec('BEGIN');
    const summary = {
      inventoryLocations: insertInventory(db, runId, inventoryBook),
      alarmPanels: insertAlarmPanels(db, runId, inventoryBook),
      vehicles: insertVehicles(db, runId, inventoryBook),
      projects: insertProjects(db, runId, inventoryBook),
      maintenancePoints: insertMaintenance(db, runId, maintenanceBook),
    };
    summary.reconciliation = reconcile(db, runId, path.join(__dirname, '..', 'config', 'location-aliases.json'));
    db.exec('COMMIT');
    db.prepare('UPDATE import_runs SET completed_at=?,status=?,summary_json=? WHERE id=?').run(new Date().toISOString(), 'SUCCESS', JSON.stringify(summary), runId);
    const outputs = writeReport(db, runId, summary, reportPath);
    console.log(JSON.stringify({ ok: true, runId, dbPath, outputs, summary }, null, 2));
  } catch (error) {
    try { db.exec('ROLLBACK'); } catch {}
    db.prepare('UPDATE import_runs SET completed_at=?,status=?,summary_json=? WHERE id=?').run(new Date().toISOString(), 'ERROR', JSON.stringify({ error: error.message }), runId);
    throw error;
  } finally {
    db.close();
  }
}

main().catch((error) => { console.error(error); process.exit(1); });
