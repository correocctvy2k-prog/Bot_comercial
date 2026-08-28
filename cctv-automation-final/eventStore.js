const crypto = require("node:crypto");
const { DatabaseSync } = require("node:sqlite");
const { normalizeName } = require("./platform/normalize");
const { runtimePaths } = require("./config/runtime-paths");

const DB_PATH = runtimePaths.dbPath;

function eventTypeFor(item) {
  if (item.categoria === "APERTURA") return "OPENING";
  if (item.categoria === "CIERRE") return "CLOSING";
  if (item.categoria === "MOCION") return "MOTION";
  if (item.categoria === "DESCARTADO") return "DISCARDED";
  return item.tipo || "UNKNOWN";
}

function severityFor(item) {
  if (item.categoria === "DESCARTADO") return "INFO";
  if (item.tipo === "DESCONOCIDO") return "REVIEW";
  return "NORMAL";
}

function persistClassifiedEmails(classified, options = {}) {
  const db = options.db || new DatabaseSync(options.dbPath || DB_PATH);
  const ownsDb = !options.db;
  const folder = options.folder || "INBOX";
  db.exec("PRAGMA foreign_keys=ON");
  const findLocation = db.prepare(`SELECT l.id,l.canonical_name AS name
    FROM location_aliases a JOIN locations l ON l.id=a.location_id
    WHERE a.alias_key=? AND l.active=1 ORDER BY CASE a.source_system WHEN 'EMAIL_DAHUA' THEN 0 WHEN 'LEGACY_CCTV' THEN 1 ELSE 2 END LIMIT 1`);
  const canonicalLocations = new Map(db.prepare("SELECT id,canonical_name AS name FROM locations WHERE active=1").all().map(row => [normalizeName(row.name), row]));
  const hasAssets = !!db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='assets'").get();
  const findAssetsByIp = hasAssets ? db.prepare(`SELECT DISTINCT l.id,l.canonical_name AS name
    FROM assets a JOIN locations l ON l.id=a.location_id
    WHERE a.ip_address=? AND a.lifecycle_status='ACTIVE' AND l.active=1`) : null;
  const hasDssRegistry = !!db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='dss_device_registry'").get();
  const findDssByIp = hasDssRegistry ? db.prepare(`SELECT DISTINCT l.id,l.canonical_name AS name
    FROM dss_device_registry d JOIN locations l ON l.id=d.location_id
    WHERE d.ip_address=? AND d.status='ACTIVE' AND l.active=1`) : null;
  const insert = db.prepare(`INSERT OR IGNORE INTO cctv_events
    (id,source_system,source_event_id,location_id,asset_id,channel_id,event_type,event_phase,occurred_at,received_at,severity,raw_reference,payload_json)
    VALUES(?,?,?,?,NULL,NULL,?,?,?,?,?,?,?)`);
  const stats = { received: classified.length, inserted: 0, existing: 0, linked: 0, unlinked: 0, discarded: 0, unknown: 0 };
  db.exec("BEGIN IMMEDIATE");
  try {
    for (const item of classified) {
      const email = item.email || {};
      const sourceEventId = `${folder}:${email.uid}`;
      const identityCandidates = [item.tienda, item.email?.subject, item.alarma, item.canal]
        .map(value => normalizeName(value || "")).filter(Boolean);
      let location = null, identityMethod = null;
      const sourceIp = email.sourceIp || null;
      if (sourceIp) {
        const byId = new Map([...(findAssetsByIp ? findAssetsByIp.all(sourceIp) : []), ...(findDssByIp ? findDssByIp.all(sourceIp) : [])].map(row => [row.id,row]));
        if (byId.size === 1) { location = [...byId.values()][0]; identityMethod = "IP_EXACT"; }
      }
      for (const candidate of identityCandidates) {
        if (location) break;
        location = findLocation.get(candidate) || canonicalLocations.get(candidate);
        if (location) identityMethod = "ALIAS_EXACT";
      }
      const occurredAt = item.timestamp instanceof Date && !isNaN(item.timestamp) ? item.timestamp.toISOString() : null;
      const receivedAt = email.date instanceof Date && !isNaN(email.date) ? email.date.toISOString() : null;
      const payload = {
        category: item.categoria,
        rawEventType: item.tipoEvento || null,
        alarm: item.alarma || null,
        storeRaw: item.tienda || null,
        channelRaw: item.canal || null,
        reason: item.motivo || null,
        subject: email.subject || null,
        sender: email.from || null,
        sourceIp,
        hasAttachment: !!email.hasAttachment,
        identityStatus: location ? "LINKED_EXACT" : "UNLINKED",
        identityMethod,
        canonicalName: location?.name || null,
      };
      const result = insert.run(
        crypto.randomUUID(), "EMAIL_DAHUA", sourceEventId, location?.id || null,
        eventTypeFor(item), item.fase || null, occurredAt, receivedAt,
        severityFor(item), `imap://${folder}/uid/${email.uid}`, JSON.stringify(payload)
      );
      if (result.changes) stats.inserted++; else stats.existing++;
      if (location) stats.linked++; else stats.unlinked++;
      if (item.categoria === "DESCARTADO") stats.discarded++;
      if (item.tipo === "DESCONOCIDO") stats.unknown++;
    }
    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  } finally {
    if (ownsDb) db.close();
  }
  return stats;
}

module.exports = { persistClassifiedEmails, eventTypeFor, severityFor };
