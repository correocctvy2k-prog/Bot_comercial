const crypto = require('node:crypto');
const { DatabaseSync } = require('node:sqlite');
const { networkFacts } = require('./network-math');

const ALLOWED = {
  networkFunction: new Set(['TERRITORIAL_ACCESS', 'TELECOM_BACKHAUL', 'DEDICATED_SITE_LINK', 'CORPORATE_LAN', 'CORPORATE_WIFI', 'GUEST_WIFI', 'SERVERS', 'CCTV', 'MANAGEMENT', 'OTHER']),
  technology: new Set(['WIRELESS_RADIO', 'FORTIAP_WIFI', 'ETHERNET', 'FIBER', 'HYBRID', 'UNKNOWN']),
  topology: new Set(['POINT_TO_POINT', 'POINT_TO_MULTIPOINT', 'REDUNDANT_BACKHAUL', 'ACCESS_LAN', 'WLAN', 'MIXED', 'UNKNOWN']),
  addressMode: new Set(['STATIC', 'DHCP', 'MIXED']),
  population: new Set(['POS', 'OFFICES', 'CORPORATE_USERS', 'GUESTS', 'INFRASTRUCTURE', 'SECURITY_DEVICES', 'MIXED']),
  criticality: new Set(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']),
};

function cleanText(value, name, required = false) {
  const text = String(value || '').trim();
  if (required && !text) throw new Error(`INVALID_${name.toUpperCase()}`);
  if (text.length > 80) throw new Error(`INVALID_${name.toUpperCase()}`);
  return text || null;
}

function validatePolicy(input = {}) {
  const policy = {
    name: cleanText(input.name, 'name'), zone: cleanText(input.zone, 'zone', true),
    networkFunction: input.networkFunction, technology: input.technology,
    topology: input.topology, addressMode: input.addressMode,
    population: input.population || null, criticality: input.criticality || 'MEDIUM',
    networkAddress: cleanText(input.networkAddress, 'network_address', true),
    prefixLength: Number(input.prefixLength), gateway: cleanText(input.gateway, 'gateway', true),
  };
  for (const [field, allowed] of Object.entries(ALLOWED)) {
    if (field === 'population' && !policy[field]) continue;
    if (!allowed.has(policy[field])) throw new Error(`INVALID_${field.replace(/[A-Z]/g, (x) => `_${x}`).toUpperCase()}`);
  }
  const facts = networkFacts(policy.networkAddress, policy.prefixLength, policy.gateway);
  policy.networkAddress = facts.networkAddress;
  return policy;
}

function openNetworkPolicyStore(path) {
  const db = new DatabaseSync(path);
  db.exec('PRAGMA journal_mode = WAL; PRAGMA synchronous = FULL; PRAGMA foreign_keys = ON;');
  db.exec(`
    CREATE TABLE IF NOT EXISTS network_segment_policies(
      segment_alias TEXT PRIMARY KEY, name TEXT, zone TEXT NOT NULL,
      network_function TEXT NOT NULL, technology TEXT NOT NULL, topology TEXT NOT NULL,
      address_mode TEXT NOT NULL, population TEXT, criticality TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'APPROVED', updated_at TEXT NOT NULL, updated_by TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS network_policy_audit(
      id TEXT PRIMARY KEY, segment_alias TEXT NOT NULL, action TEXT NOT NULL,
      actor TEXT NOT NULL, occurred_at TEXT NOT NULL, before_json TEXT, after_json TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS network_segment_dispositions(
      segment_alias TEXT PRIMARY KEY, status TEXT NOT NULL CHECK(status IN ('NEEDS_SPLIT','OUT_OF_SCOPE')),
      note TEXT, updated_at TEXT NOT NULL, updated_by TEXT NOT NULL
    );
  `);
  const columns = new Set(db.prepare('PRAGMA table_info(network_segment_policies)').all().map((item) => item.name));
  if (!columns.has('network_address')) db.exec('ALTER TABLE network_segment_policies ADD COLUMN network_address TEXT');
  if (!columns.has('prefix_length')) db.exec('ALTER TABLE network_segment_policies ADD COLUMN prefix_length INTEGER');
  if (!columns.has('gateway')) db.exec('ALTER TABLE network_segment_policies ADD COLUMN gateway TEXT');
  return db;
}

function listPolicies(db) {
  if (!db) return [];
  return db.prepare(`SELECT segment_alias id, name, zone, network_function networkFunction,
    technology, topology, address_mode addressMode, population, criticality,
    network_address networkAddress,prefix_length prefixLength,gateway,
    status, updated_at updatedAt, updated_by updatedBy FROM network_segment_policies`).all();
}

function listDispositions(db) {
  if (!db) return [];
  return db.prepare('SELECT segment_alias id,status,note,updated_at updatedAt,updated_by updatedBy FROM network_segment_dispositions').all();
}

function listAudit(db, segmentAlias) {
  if (!db) return [];
  const rows = segmentAlias
    ? db.prepare('SELECT id,segment_alias segmentAlias,action,actor,occurred_at occurredAt,before_json beforeJson,after_json afterJson FROM network_policy_audit WHERE segment_alias=? ORDER BY occurred_at DESC').all(segmentAlias)
    : db.prepare('SELECT id,segment_alias segmentAlias,action,actor,occurred_at occurredAt,before_json beforeJson,after_json afterJson FROM network_policy_audit ORDER BY occurred_at DESC').all();
  return rows.map((row) => ({
    ...row,
    before: row.beforeJson ? JSON.parse(row.beforeJson) : null,
    after: row.afterJson ? JSON.parse(row.afterJson) : null,
  }));
}

function saveDisposition(db, segmentAlias, input, actor, now = new Date().toISOString()) {
  if (!/^segment [A-F0-9]{8}$/.test(segmentAlias)) throw new Error('INVALID_SEGMENT_ALIAS');
  const status = String(input?.status || '');
  if (!['NEEDS_SPLIT', 'OUT_OF_SCOPE'].includes(status)) throw new Error('INVALID_DISPOSITION_STATUS');
  const note = cleanText(input?.note, 'note');
  const before = db.prepare('SELECT * FROM network_segment_dispositions WHERE segment_alias=?').get(segmentAlias) || null;
  db.exec('BEGIN IMMEDIATE');
  try {
    db.prepare(`INSERT INTO network_segment_dispositions(segment_alias,status,note,updated_at,updated_by)
      VALUES(?,?,?,?,?) ON CONFLICT(segment_alias) DO UPDATE SET status=excluded.status,note=excluded.note,updated_at=excluded.updated_at,updated_by=excluded.updated_by`)
      .run(segmentAlias, status, note, now, actor);
    db.prepare('DELETE FROM network_segment_policies WHERE segment_alias=?').run(segmentAlias);
    db.prepare('INSERT INTO network_policy_audit(id,segment_alias,action,actor,occurred_at,before_json,after_json) VALUES(?,?,?,?,?,?,?)')
      .run(crypto.randomUUID(), segmentAlias, status, actor, now, before ? JSON.stringify(before) : null, JSON.stringify({ status, note }));
    db.exec('COMMIT');
  } catch (error) { db.exec('ROLLBACK'); throw error; }
  return { id: segmentAlias, status, note, updatedAt: now, updatedBy: actor };
}

function savePolicy(db, segmentAlias, input, actor, now = new Date().toISOString()) {
  if (!/^segment [A-F0-9]{8}$/.test(segmentAlias)) throw new Error('INVALID_SEGMENT_ALIAS');
  const policy = validatePolicy(input);
  const before = db.prepare('SELECT * FROM network_segment_policies WHERE segment_alias=?').get(segmentAlias) || null;
  const transaction = db.prepare(`INSERT INTO network_segment_policies(segment_alias,name,zone,network_function,technology,topology,address_mode,population,criticality,network_address,prefix_length,gateway,status,updated_at,updated_by)
    VALUES(?,?,?,?,?,?,?,?,?,?,?,?,'APPROVED',?,?) ON CONFLICT(segment_alias) DO UPDATE SET name=excluded.name,zone=excluded.zone,network_function=excluded.network_function,technology=excluded.technology,topology=excluded.topology,address_mode=excluded.address_mode,population=excluded.population,criticality=excluded.criticality,network_address=excluded.network_address,prefix_length=excluded.prefix_length,gateway=excluded.gateway,status='APPROVED',updated_at=excluded.updated_at,updated_by=excluded.updated_by`);
  db.exec('BEGIN IMMEDIATE');
  try {
    transaction.run(segmentAlias, policy.name, policy.zone, policy.networkFunction, policy.technology, policy.topology, policy.addressMode, policy.population, policy.criticality, policy.networkAddress, policy.prefixLength, policy.gateway, now, actor);
    db.prepare('DELETE FROM network_segment_dispositions WHERE segment_alias=?').run(segmentAlias);
    db.prepare('INSERT INTO network_policy_audit(id,segment_alias,action,actor,occurred_at,before_json,after_json) VALUES(?,?,?,?,?,?,?)')
      .run(crypto.randomUUID(), segmentAlias, before ? 'UPDATED' : 'CREATED', actor, now, before ? JSON.stringify(before) : null, JSON.stringify(policy));
    db.exec('COMMIT');
  } catch (error) { db.exec('ROLLBACK'); throw error; }
  return { id: segmentAlias, ...policy, status: 'APPROVED', updatedAt: now, updatedBy: actor };
}

module.exports = { listAudit, listDispositions, listPolicies, openNetworkPolicyStore, saveDisposition, savePolicy, validatePolicy };
