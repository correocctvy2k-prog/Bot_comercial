const crypto = require('node:crypto');

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function deterministicId(prefix, value) {
  return `${prefix}-${sha256(value).slice(0, 32)}`;
}

// dss_device_registry (cctv-automation-final, servicio aparte) es la fuente de
// verdad de esa base -- este módulo solo la lee (SELECT), nunca escribe ahí (spec
// 0013 SS4/SS6). La IP de cada fila es la del MikroTik hAP lite del punto (NAT por
// puerto 4455/4456), no la IP interna propia del NVR -- ver spec 0013 SS0. DSS no
// expone MAC en los campos ya revisados.
function readDssDeviceRegistry(sourceDb) {
  // ORDER BY es necesario, no cosmético: importDssDeviceRegistry hashea
  // JSON.stringify(devices) para decidir si un re-import es un no-op (idempotencia por
  // hash, mismo patrón que ksc-importer.js) -- sin un orden estable, dos lecturas de
  // los mismos datos podrían producir hashes distintos y duplicar el import.
  return sourceDb.prepare(`
    SELECT dss_identifier AS dssIdentifier, device_name AS deviceName,
           device_type AS deviceType, model, ip_address AS ipAddress,
           organization, physical_site_id AS physicalSiteId, status, observed_at AS observedAt
    FROM dss_device_registry
    ORDER BY dss_identifier
  `).all();
}

function summarizeDssDevices(devices) {
  const byType = {};
  for (const device of devices) {
    byType[device.deviceType] = (byType[device.deviceType] || 0) + 1;
  }
  return {
    total: devices.length,
    withIp: devices.filter((device) => device.ipAddress).length,
    byType,
  };
}

function importDssDeviceRegistry({ db, sourceDb, importedAt = new Date().toISOString(), custodyReference = null }) {
  if (!db) throw new Error('db is required');
  if (!sourceDb) throw new Error('sourceDb is required');

  const devices = readDssDeviceRegistry(sourceDb);
  if (devices.length === 0) throw new Error('dss_device_registry is empty');
  const summary = summarizeDssDevices(devices);
  const sourceHash = sha256(JSON.stringify(devices));
  // dss_device_registry trae observed_at por dispositivo (varía entre reconciliaciones
  // sucesivas) -- el snapshot usa el más reciente como representativo; cada observación
  // conserva su propio observed_at real.
  const capturedAt = devices.reduce((max, device) => (device.observedAt > max ? device.observedAt : max), devices[0].observedAt);

  const sourceId = 'source-dss';
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
    VALUES ('source-dss', 'DSS', 'DSS Professional (Dahua Smart System)', 'CORROBORATING', ?, ?)
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
    insertSource.run(importedAt, importedAt);
    insertSnapshot.run(snapshotId, sourceId, capturedAt, importedAt, sourceHash, custodyReference, devices.length);

    for (const device of devices) {
      const observationId = deterministicId('observation', `${snapshotId}:${device.dssIdentifier}`);
      const hostname = String(device.deviceName || '').trim() || null;
      const flags = ['DSS_HAPLITE_NAT_IP'];
      if (!device.ipAddress) flags.push('MISSING_IP');

      insertObservation.run(
        observationId,
        snapshotId,
        device.dssIdentifier,
        device.observedAt,
        importedAt,
        device.ipAddress || null,
        hostname,
        hostname?.trim().toLowerCase() || null,
        'Dahua',
        device.deviceType,
        JSON.stringify({ hostname: { source: 'DSS_DEVICE_REGISTRY', weight: 180 } }),
        JSON.stringify(flags),
        JSON.stringify({
          dssIdentifier: device.dssIdentifier,
          model: device.model || null,
          organization: device.organization || null,
          physicalSiteId: device.physicalSiteId || null,
          dssStatus: device.status || null,
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
  readDssDeviceRegistry,
  summarizeDssDevices,
  importDssDeviceRegistry,
};
