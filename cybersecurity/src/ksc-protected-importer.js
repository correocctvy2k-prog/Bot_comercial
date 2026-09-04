const { deterministicId, sha256 } = require('./fortigate-importer');
const { validateKscProtectedContract } = require('./ksc-protected-contract');

function parseProtectedPayload(text) {
  let payload;
  try {
    payload = JSON.parse(text);
  } catch {
    throw new Error('INVALID_JSON');
  }
  const validation = validateKscProtectedContract(payload);
  if (!validation.valid) {
    const error = new Error('INVALID_KSC_PROTECTED_CONTRACT');
    error.validationErrors = validation.errors;
    throw error;
  }
  return payload;
}

function importKscProtectedInventory({
  db,
  text,
  importedAt = new Date().toISOString(),
  custodyReference = null,
}) {
  if (!db) throw new Error('db is required');
  if (!text || typeof text !== 'string') throw new Error('text is required');

  const payload = parseProtectedPayload(text);
  const sourceId = 'source-kaspersky-hardware-protected';
  const sourceHash = sha256(text);
  const snapshotId = deterministicId('snapshot', `${sourceId}:${sourceHash}`);
  const existing = db.prepare(`
    SELECT id, processing_status AS processingStatus
    FROM cyber_source_snapshots
    WHERE source_system_id = ? AND source_sha256 = ?
  `).get(sourceId, sourceHash);
  if (existing) {
    return {
      status: 'ALREADY_IMPORTED',
      snapshotId: existing.id,
      processingStatus: existing.processingStatus,
      inserted: 0,
    };
  }

  const insertSource = db.prepare(`
    INSERT INTO cyber_source_systems(
      id, source_type, display_name, authority_level, created_at, updated_at
    ) VALUES (?, 'KASPERSKY', 'KSC protected hardware identity', 'CORROBORATING', ?, ?)
    ON CONFLICT(id) DO UPDATE SET updated_at = excluded.updated_at, active = 1
  `);
  const insertSnapshot = db.prepare(`
    INSERT INTO cyber_source_snapshots(
      id, source_system_id, captured_at, imported_at, source_version,
      source_sha256, custody_reference, processing_status, received_count
    ) VALUES (?, ?, ?, ?, ?, ?, ?, 'PROCESSING', ?)
  `);
  const insertObservation = db.prepare(`
    INSERT INTO cyber_asset_observations(
      id, snapshot_id, source_record_key, observed_at, ingested_at,
      os_family, device_class_raw, last_seen_source_at,
      attribute_confidence_json, quality_flags_json, sanitized_attributes_json
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const completeSnapshot = db.prepare(`
    UPDATE cyber_source_snapshots
    SET processing_status = 'SUCCESS', accepted_count = ?, rejected_count = 0,
        quality_summary_json = ?, completed_at = ?
    WHERE id = ?
  `);

  const capturedAt = new Date(payload.GeneratedAt).toISOString();
  let inserted = 0;
  let withLastSeen = 0;
  let virtualMachines = 0;

  db.exec('BEGIN IMMEDIATE');
  try {
    insertSource.run(sourceId, importedAt, importedAt);
    insertSnapshot.run(
      snapshotId,
      sourceId,
      capturedAt,
      importedAt,
      `schema:${payload.SchemaVersion};identity:${payload.IdentityKeyVersion}`,
      sourceHash,
      custodyReference,
      payload.Devices.length,
    );

    for (const device of payload.Devices) {
      const lastSeen = device.LastSeen ? new Date(device.LastSeen).toISOString() : null;
      if (lastSeen) withLastSeen += 1;
      if (device.IsVirtual) virtualMachines += 1;
      const sourceRecordKey = `record:${device.RecordFingerprint}`;
      const observationId = deterministicId('observation', `${snapshotId}:${sourceRecordKey}`);
      const flags = ['PSEUDONYMIZED_IDENTIFIERS', 'NO_RAW_NETWORK_IDENTIFIERS'];
      if (!lastSeen) flags.push('MISSING_LAST_SEEN');

      insertObservation.run(
        observationId,
        snapshotId,
        sourceRecordKey,
        capturedAt,
        importedAt,
        String(device.OperatingSystem || '').trim() || null,
        device.IsVirtual ? 'Virtual Machine' : 'Managed Device',
        lastSeen,
        JSON.stringify({
          identityFingerprints: { source: 'KSC_HMAC_SHA256', weight: 220 },
          osFamily: { source: 'KSC_HARDWARE_REPORT', weight: 180 },
          lastSeen: { source: 'KSC_HARDWARE_REPORT', weight: 200 },
        }),
        JSON.stringify(flags),
        JSON.stringify({
          identityKeyVersion: payload.IdentityKeyVersion,
          recordFingerprint: device.RecordFingerprint,
          hostnameFingerprint: device.HostnameFingerprint || null,
          macFingerprints: device.MacFingerprints,
          serialFingerprint: device.SerialFingerprint || null,
          hardwareFingerprint: device.HardwareFingerprint || null,
          isVirtual: device.IsVirtual,
        }),
      );
      inserted += 1;
    }

    completeSnapshot.run(
      inserted,
      JSON.stringify({ devices: inserted, virtualMachines, withLastSeen }),
      new Date().toISOString(),
      snapshotId,
    );
    db.exec('COMMIT');
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }

  return { status: 'SUCCESS', snapshotId, inserted, sourceHash };
}

module.exports = { importKscProtectedInventory, parseProtectedPayload };
