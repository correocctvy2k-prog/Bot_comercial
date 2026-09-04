const { deterministicId, sha256 } = require('./fortigate-importer');

function bogotaTimestamp(value) {
  const match = String(value || '').trim().match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2}):(\d{2})$/);
  if (!match) return null;
  const [, year, month, day, hour, minute, second] = match;
  return new Date(Date.UTC(
    Number(year), Number(month) - 1, Number(day), Number(hour) + 5,
    Number(minute), Number(second),
  )).toISOString();
}

function normalizeHostname(value) {
  return String(value || '').trim().toLowerCase();
}

function validateKscPayload(payload) {
  const inventory = payload?.Kaspersky?.HardwareInventory;
  if (!inventory || !Array.isArray(inventory.Devices)) {
    throw new Error('invalid KSC-HARDWARE payload');
  }
  return inventory;
}

function summarizeKscPayload(payload) {
  const inventory = validateKscPayload(payload);
  const devices = inventory.Devices;
  return {
    capturedAt: bogotaTimestamp(payload.ReportDate) || bogotaTimestamp(inventory.ParsedAt),
    counts: {
      devices: devices.length,
      virtualMachines: devices.filter((device) => device.IsVirtual === true).length,
      withLastSeen: devices.filter((device) => bogotaTimestamp(device.LastSeen)).length,
      withHostname: devices.filter((device) => normalizeHostname(device.Name)).length,
      staleOver30Days: devices.filter((device) => Number(device.LastSeenDays) > 30).length,
    },
  };
}

function importKscHardwareInventory({
  db,
  text,
  importedAt = new Date().toISOString(),
  capturedAt,
  custodyReference = null,
}) {
  if (!db) throw new Error('db is required');
  if (!text || typeof text !== 'string') throw new Error('text is required');
  const payload = JSON.parse(text);
  const inventory = validateKscPayload(payload);
  const summary = summarizeKscPayload(payload);
  const effectiveCapturedAt = capturedAt || summary.capturedAt;
  if (!effectiveCapturedAt) throw new Error('capturedAt is required for KSC-HARDWARE');

  const sourceId = 'source-kaspersky-hardware';
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
      counts: summary.counts,
    };
  }

  const insertSource = db.prepare(`
    INSERT INTO cyber_source_systems(
      id, source_type, display_name, authority_level, created_at, updated_at
    ) VALUES (?, 'KASPERSKY', 'KSC hardware inventory', 'CORROBORATING', ?, ?)
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
      hostname_raw, hostname_key, manufacturer, os_family, device_class_raw,
      last_seen_source_at, attribute_confidence_json, quality_flags_json,
      sanitized_attributes_json
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const completeSnapshot = db.prepare(`
    UPDATE cyber_source_snapshots
    SET processing_status = 'SUCCESS', accepted_count = ?, rejected_count = 0,
        quality_summary_json = ?, completed_at = ?
    WHERE id = ?
  `);

  const hostnameOccurrences = new Map();
  let inserted = 0;
  db.exec('BEGIN IMMEDIATE');
  try {
    insertSource.run(sourceId, importedAt, importedAt);
    insertSnapshot.run(
      snapshotId,
      sourceId,
      effectiveCapturedAt,
      importedAt,
      payload.Role || 'KSC-HARDWARE',
      sourceHash,
      custodyReference,
      inventory.Devices.length,
    );

    for (const device of inventory.Devices) {
      const hostname = String(device.Name || '').trim() || null;
      const hostnameKey = normalizeHostname(hostname) || null;
      const occurrence = (hostnameOccurrences.get(hostnameKey) || 0) + 1;
      hostnameOccurrences.set(hostnameKey, occurrence);
      const sourceRecordKey = hostnameKey
        ? `device:${hostnameKey}:${occurrence}`
        : `missing-hostname:${inserted + 1}`;
      const observationId = deterministicId('observation', `${snapshotId}:${sourceRecordKey}`);
      const lastSeenAt = bogotaTimestamp(device.LastSeen);
      const flags = ['KSC_REDUCED_CONTRACT', 'MISSING_IP', 'MISSING_MAC'];
      if (!hostnameKey) flags.push('MISSING_HOSTNAME');
      if (!lastSeenAt) flags.push('MISSING_LAST_SEEN');
      if (Number(device.LastSeenDays) > 30) flags.push('STALE_OVER_30_DAYS');
      if (occurrence > 1) flags.push('DUPLICATE_HOSTNAME_IN_SNAPSHOT');

      insertObservation.run(
        observationId,
        snapshotId,
        sourceRecordKey,
        effectiveCapturedAt,
        importedAt,
        hostname,
        hostnameKey,
        String(device.Provider || '').trim() || null,
        String(device.OperatingSystem || '').trim() || null,
        device.IsVirtual === true ? 'Virtual Machine' : 'Managed Device',
        lastSeenAt,
        JSON.stringify({
          hostname: { source: 'KSC_HARDWARE_REPORT', weight: 180 },
          osFamily: { source: 'KSC_HARDWARE_REPORT', weight: 180 },
          lastSeen: { source: 'KSC_HARDWARE_REPORT', weight: 200 },
        }),
        JSON.stringify(flags),
        JSON.stringify({
          isVirtual: device.IsVirtual === true,
          osBucket: device.OsBucket || null,
          visibilityBucket: device.VisibilityBucket || null,
          lastSeenDays: Number.isFinite(Number(device.LastSeenDays)) ? Number(device.LastSeenDays) : null,
        }),
      );
      inserted += 1;
    }

    completeSnapshot.run(
      inserted,
      JSON.stringify(summary.counts),
      new Date().toISOString(),
      snapshotId,
    );
    db.exec('COMMIT');
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }

  return { status: 'SUCCESS', snapshotId, inserted, counts: summary.counts };
}

module.exports = {
  bogotaTimestamp,
  importKscHardwareInventory,
  summarizeKscPayload,
};
