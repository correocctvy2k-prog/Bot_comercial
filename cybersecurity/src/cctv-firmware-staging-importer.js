const crypto = require('node:crypto');

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function deterministicId(prefix, value) {
  return `${prefix}-${sha256(value).slice(0, 32)}`;
}

// stg_inventory_locations (cctv-automation-final, servicio aparte) es una tabla de
// staging de un import manual de Excel ("DATOS CCTV.xlsx") -- no depurada, no
// reconciliada como dss_device_registry, y se acumula (no se limpia) entre corridas
// del mismo Excel: solo la corrida más reciente representa el estado actual, las
// anteriores son historial redundante del mismo archivo. Fuente de firmware inicial
// mientras no exista un escaneo activo real (decisión del usuario, spec 0013): se
// marca explícitamente como no verificada (`CCTV_STAGING_UNVERIFIED`) para que nunca
// se confunda con un dato corroborado como DSS o FortiGate.
function findLatestSuccessfulRun(sourceDb) {
  return sourceDb.prepare(`
    SELECT id, completed_at AS completedAt
    FROM import_runs
    WHERE status = 'SUCCESS'
    ORDER BY id DESC
    LIMIT 1
  `).get();
}

function readCctvFirmwareStaging(sourceDb, importRunId) {
  // ORDER BY id (PK real de la tabla) por la misma razón que dss-importer.js: el hash
  // de idempotencia necesita un orden estable entre lecturas.
  return sourceDb.prepare(`
    SELECT id, location_name_raw AS locationNameRaw, haplite_ip AS haploteIp,
           recorder_ip AS recorderIp, recorder_port AS recorderPort, nat_status AS natStatus,
           firmware_raw AS firmwareRaw, camera_firmware_raw AS cameraFirmwareRaw,
           recorder_model AS recorderModel, dss_identifier AS dssIdentifier, quality_flags AS qualityFlagsRaw
    FROM stg_inventory_locations
    WHERE import_run_id = ? AND haplite_ip IS NOT NULL
    ORDER BY id
  `).all(importRunId);
}

function summarizeCctvFirmwareStaging(rows) {
  return {
    total: rows.length,
    withFirmware: rows.filter((row) => row.firmwareRaw).length,
    withRecorderModel: rows.filter((row) => row.recorderModel).length,
  };
}

function importCctvFirmwareStaging({ db, sourceDb, importedAt = new Date().toISOString(), custodyReference = null }) {
  if (!db) throw new Error('db is required');
  if (!sourceDb) throw new Error('sourceDb is required');

  const latestRun = findLatestSuccessfulRun(sourceDb);
  if (!latestRun) throw new Error('no successful import_runs found in stg_inventory_locations source');

  const rows = readCctvFirmwareStaging(sourceDb, latestRun.id);
  if (rows.length === 0) throw new Error('stg_inventory_locations has no rows with haplite_ip for the latest import run');
  const summary = summarizeCctvFirmwareStaging(rows);
  const sourceHash = sha256(JSON.stringify(rows));

  const sourceId = 'source-cctv-staging';
  const snapshotId = deterministicId('snapshot', `${sourceId}:${sourceHash}`);
  const existing = db.prepare(`
    SELECT id, processing_status AS processingStatus
    FROM cyber_source_snapshots
    WHERE source_system_id = ? AND source_sha256 = ?
  `).get(sourceId, sourceHash);
  if (existing) {
    return { status: 'ALREADY_IMPORTED', snapshotId: existing.id, processingStatus: existing.processingStatus, counts: summary };
  }

  const insertSource = db.prepare(`
    INSERT INTO cyber_source_systems(id, source_type, display_name, authority_level, created_at, updated_at)
    VALUES (?, 'CCTV_STAGING', 'Staging Excel CCTV (sin verificar, spec 0013)', 'OBSERVATIONAL', ?, ?)
    ON CONFLICT(id) DO UPDATE SET updated_at = excluded.updated_at, active = 1
  `);
  const insertSnapshot = db.prepare(`
    INSERT INTO cyber_source_snapshots(
      id, source_system_id, captured_at, imported_at, source_sha256, custody_reference, processing_status, received_count
    ) VALUES (?, ?, ?, ?, ?, ?, 'PROCESSING', ?)
  `);
  const insertObservation = db.prepare(`
    INSERT INTO cyber_asset_observations(
      id, snapshot_id, source_record_key, observed_at, ingested_at, ip_value,
      hostname_raw, hostname_key, manufacturer, device_class_raw,
      attribute_confidence_json, quality_flags_json, sanitized_attributes_json
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const completeSnapshot = db.prepare(`
    UPDATE cyber_source_snapshots
    SET processing_status = 'SUCCESS', accepted_count = ?, rejected_count = 0,
        quality_summary_json = ?, completed_at = ?
    WHERE id = ?
  `);

  let inserted = 0;
  db.exec('BEGIN IMMEDIATE');
  try {
    insertSource.run(sourceId, importedAt, importedAt);
    insertSnapshot.run(snapshotId, sourceId, latestRun.completedAt, importedAt, sourceHash, custodyReference, rows.length);

    for (const row of rows) {
      const observationId = deterministicId('observation', `${snapshotId}:${row.id}`);
      const hostname = String(row.locationNameRaw || '').trim() || null;
      const flags = ['CCTV_STAGING_UNVERIFIED'];
      if (!row.firmwareRaw) flags.push('MISSING_FIRMWARE');

      insertObservation.run(
        observationId,
        snapshotId,
        String(row.id),
        latestRun.completedAt,
        importedAt,
        row.haploteIp,
        hostname,
        hostname?.trim().toLowerCase() || null,
        null,
        null,
        JSON.stringify({ hostname: { source: 'CCTV_STAGING_EXCEL', weight: 60 } }),
        JSON.stringify(flags),
        JSON.stringify({
          firmwareRaw: row.firmwareRaw || null,
          cameraFirmwareRaw: row.cameraFirmwareRaw || null,
          recorderModel: row.recorderModel || null,
          recorderIp: row.recorderIp || null,
          recorderPort: row.recorderPort || null,
          natStatus: row.natStatus || null,
          dssIdentifier: row.dssIdentifier || null,
          importRunCompletedAt: latestRun.completedAt,
          ipIsHapliteNat: true,
        }),
      );
      inserted += 1;
    }

    completeSnapshot.run(inserted, JSON.stringify(summary), new Date().toISOString(), snapshotId);
    db.exec('COMMIT');
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }

  return { status: 'SUCCESS', snapshotId, inserted, counts: summary };
}

module.exports = {
  findLatestSuccessfulRun,
  readCctvFirmwareStaging,
  summarizeCctvFirmwareStaging,
  importCctvFirmwareStaging,
};
