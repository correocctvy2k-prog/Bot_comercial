const crypto = require('node:crypto');
const { selectBestAttribute, summarizeFortiGateInventory } = require('./fortigate-parser');

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function deterministicId(prefix, value) {
  return `${prefix}-${sha256(value).slice(0, 32)}`;
}

function ipv4Number(value) {
  const parts = String(value || '').split('.').map(Number);
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) return null;
  return parts.reduce((result, part) => ((result << 8) | part) >>> 0, 0);
}

function cidrContains(cidr, ip) {
  const [networkValue, prefixValue] = String(cidr || '').split('/');
  const network = ipv4Number(networkValue); const address = ipv4Number(ip); const prefix = Number(prefixValue);
  if (network === null || address === null || !Number.isInteger(prefix) || prefix < 0 || prefix > 32) return false;
  const mask = prefix === 0 ? 0 : (0xffffffff << (32 - prefix)) >>> 0;
  return (network & mask) === (address & mask);
}

function subtractSeconds(isoTimestamp, seconds) {
  if (seconds === null || seconds === undefined) return null;
  return new Date(new Date(isoTimestamp).getTime() - (seconds * 1000)).toISOString();
}

function bestValue(device, name) {
  return selectBestAttribute(device, name)?.value || null;
}

function importFortiGateInventory({
  db,
  text,
  importedAt = new Date().toISOString(),
  capturedAt,
  custodyReference = null,
  sourceVersion = null,
}) {
  if (!db) throw new Error('db is required');
  if (!text || typeof text !== 'string') throw new Error('text is required');

  const inventory = summarizeFortiGateInventory(text);
  const effectiveCapturedAt = capturedAt || inventory.capturedAt;
  if (!effectiveCapturedAt || Number.isNaN(new Date(effectiveCapturedAt).getTime())) {
    throw new Error('capturedAt is required when the FortiGate system time is unavailable');
  }

  const sourceHash = sha256(text);
  const sourceId = 'source-fortigate';
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
      counts: inventory.counts,
    };
  }

  const insertSource = db.prepare(`
    INSERT INTO cyber_source_systems(
      id, source_type, display_name, authority_level, created_at, updated_at
    ) VALUES (?, 'FORTIGATE', 'FortiGate inventory', 'OBSERVATIONAL', ?, ?)
    ON CONFLICT(id) DO UPDATE SET updated_at = excluded.updated_at, active = 1
  `);
  const insertSnapshot = db.prepare(`
    INSERT INTO cyber_source_snapshots(
      id, source_system_id, captured_at, imported_at, source_version,
      source_sha256, custody_reference, processing_status, received_count
    ) VALUES (?, ?, ?, ?, ?, ?, ?, 'PROCESSING', ?)
  `);
  const insertSegment = db.prepare(`
    INSERT INTO cyber_network_segments(
      id, canonical_name, cidr_fingerprint, security_zone,
      created_at, updated_at
    ) VALUES (?, ?, ?, 'UNCLASSIFIED', ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      canonical_name = excluded.canonical_name,
      cidr_fingerprint = excluded.cidr_fingerprint,
      updated_at = excluded.updated_at
  `);
  const insertObservation = db.prepare(`
    INSERT INTO cyber_asset_observations(
      id, snapshot_id, source_record_key, observed_at, ingested_at, segment_id,
      ip_value, mac_value, hostname_raw, hostname_key, manufacturer, os_family,
      os_version, device_class_raw, first_seen_source_at, last_seen_source_at,
      source_seen_seconds, attribute_confidence_json, quality_flags_json,
      sanitized_attributes_json
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const completeSnapshot = db.prepare(`
    UPDATE cyber_source_snapshots
    SET processing_status = 'SUCCESS', accepted_count = ?, rejected_count = 0,
        quality_summary_json = ?, completed_at = ?
    WHERE id = ?
  `);

  const segmentByInterface = new Map();
  let inserted = 0;
  db.exec('BEGIN IMMEDIATE');
  try {
    insertSource.run(sourceId, importedAt, importedAt);
    insertSnapshot.run(
      snapshotId, sourceId, effectiveCapturedAt, importedAt, sourceVersion,
      sourceHash, custodyReference, inventory.devices.length,
    );

    for (const route of inventory.connectedRoutes) {
      const segmentId = deterministicId('segment', route.cidr.toLowerCase());
      const routes = segmentByInterface.get(route.interfaceName) || [];
      routes.push({ ...route, segmentId });
      segmentByInterface.set(route.interfaceName, routes);
      insertSegment.run(
        segmentId,
        `${route.interfaceName} · ${route.cidr}`,
        sha256(route.cidr),
        importedAt,
        importedAt,
      );
    }

    for (const device of inventory.devices) {
      const qualityFlags = [...device.qualityFlags];
      if (device.ipObservations.length === 0) qualityFlags.push('MISSING_IP');
      if (device.ipObservations.length > 1) qualityFlags.push('MULTIPLE_IP_OBSERVATIONS');
      if ((device.attributes.hostname || []).length > 1) qualityFlags.push('MULTIPLE_HOSTNAME_OBSERVATIONS');

      const sourceRecordKey = `device:${device.mac}`;
      const observationId = deterministicId('observation', `${snapshotId}:${sourceRecordKey}`);
      const hostname = bestValue(device, 'hostname');
      const interfaceRoutes = segmentByInterface.get(device.interfaceName) || [];
      const observedIp = device.ipObservations[0]?.value || null;
      const matchingRoutes = observedIp ? interfaceRoutes.filter((route) => cidrContains(route.cidr, observedIp)) : [];
      const segmentId = matchingRoutes.length === 1
        ? matchingRoutes[0].segmentId
        : interfaceRoutes.length === 1 ? interfaceRoutes[0].segmentId : null;
      if (!segmentId && device.interfaceName) qualityFlags.push('UNMAPPED_INTERFACE');

      const attributeConfidence = {};
      for (const name of ['manufacturer', 'deviceType', 'family', 'osFamily', 'hardwareVersion', 'softwareVersion', 'hostname']) {
        const selected = selectBestAttribute(device, name);
        if (selected) attributeConfidence[name] = { source: selected.source, weight: selected.weight };
      }

      const sanitizedAttributes = {
        family: bestValue(device, 'family'),
        hardwareVersion: bestValue(device, 'hardwareVersion'),
        locallyAdministeredMac: device.isLocallyAdministered,
      };

      insertObservation.run(
        observationId,
        snapshotId,
        sourceRecordKey,
        subtractSeconds(effectiveCapturedAt, device.seenSeconds) || effectiveCapturedAt,
        importedAt,
        segmentId,
        device.ipObservations[0]?.value || null,
        device.mac,
        hostname,
        hostname?.trim().toLowerCase() || null,
        bestValue(device, 'manufacturer'),
        bestValue(device, 'osFamily'),
        bestValue(device, 'softwareVersion'),
        bestValue(device, 'deviceType'),
        subtractSeconds(effectiveCapturedAt, device.createdSeconds),
        subtractSeconds(effectiveCapturedAt, device.seenSeconds),
        device.seenSeconds,
        JSON.stringify(attributeConfidence),
        JSON.stringify([...new Set(qualityFlags)]),
        JSON.stringify(sanitizedAttributes),
      );
      inserted += 1;
    }

    completeSnapshot.run(
      inserted,
      JSON.stringify({
        connectedRoutes: inventory.counts.connectedRoutes,
        locallyAdministeredMacs: inventory.counts.locallyAdministeredMacs,
        userAttributesRedacted: inventory.counts.userAttributesRedacted,
        devicesWithIp: inventory.counts.devicesWithIp,
        devicesWithHostname: inventory.counts.devicesWithHostname,
      }),
      new Date().toISOString(),
      snapshotId,
    );
    db.exec('COMMIT');
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }

  return {
    status: 'SUCCESS',
    snapshotId,
    inserted,
    counts: inventory.counts,
  };
}

module.exports = {
  cidrContains,
  deterministicId,
  importFortiGateInventory,
  sha256,
};
