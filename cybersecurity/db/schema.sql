PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS cyber_schema_migrations (
  version INTEGER PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  applied_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS cyber_source_systems (
  id TEXT PRIMARY KEY,
  source_type TEXT NOT NULL CHECK(source_type IN (
    'FORTIGATE', 'KASPERSKY', 'ACTIVE_DIRECTORY', 'GREENBONE', 'MANUAL', 'OTHER'
  )),
  display_name TEXT NOT NULL,
  authority_level TEXT NOT NULL CHECK(authority_level IN ('AUTHORITATIVE', 'CORROBORATING', 'OBSERVATIONAL')),
  active INTEGER NOT NULL DEFAULT 1 CHECK(active IN (0, 1)),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS cyber_source_snapshots (
  id TEXT PRIMARY KEY,
  source_system_id TEXT NOT NULL,
  captured_at TEXT NOT NULL,
  imported_at TEXT NOT NULL,
  source_version TEXT,
  source_sha256 TEXT NOT NULL CHECK(length(source_sha256) = 64),
  custody_reference TEXT,
  classification TEXT NOT NULL DEFAULT 'INTERNAL_RESTRICTED' CHECK(classification IN (
    'INTERNAL', 'INTERNAL_RESTRICTED', 'CONFIDENTIAL'
  )),
  processing_status TEXT NOT NULL CHECK(processing_status IN (
    'PENDING', 'PROCESSING', 'SUCCESS', 'PARTIAL', 'REJECTED'
  )),
  received_count INTEGER NOT NULL DEFAULT 0 CHECK(received_count >= 0),
  accepted_count INTEGER NOT NULL DEFAULT 0 CHECK(accepted_count >= 0),
  rejected_count INTEGER NOT NULL DEFAULT 0 CHECK(rejected_count >= 0),
  quality_summary_json TEXT NOT NULL DEFAULT '{}',
  completed_at TEXT,
  error_code TEXT,
  UNIQUE(source_system_id, source_sha256),
  FOREIGN KEY(source_system_id) REFERENCES cyber_source_systems(id)
);

CREATE TABLE IF NOT EXISTS cyber_network_segments (
  id TEXT PRIMARY KEY,
  canonical_name TEXT NOT NULL UNIQUE,
  cidr_encrypted TEXT,
  cidr_fingerprint TEXT UNIQUE,
  security_zone TEXT NOT NULL,
  asset_class_policy TEXT NOT NULL DEFAULT 'DEFAULT',
  criticality TEXT NOT NULL DEFAULT 'MEDIUM' CHECK(criticality IN ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL')),
  data_classification TEXT NOT NULL DEFAULT 'INTERNAL_RESTRICTED',
  scan_default TEXT NOT NULL DEFAULT 'DENY' CHECK(scan_default IN ('DENY', 'REQUIRE_AUTHORIZATION')),
  active INTEGER NOT NULL DEFAULT 1 CHECK(active IN (0, 1)),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS cyber_assets (
  id TEXT PRIMARY KEY,
  canonical_name TEXT NOT NULL,
  asset_class TEXT NOT NULL CHECK(asset_class IN (
    'SERVER', 'NETWORK', 'SECURITY', 'WORKSTATION', 'LAPTOP', 'PRINTER',
    'IOT', 'CCTV', 'MOBILE', 'GUEST_BYOD', 'VIRTUAL_MACHINE', 'OTHER'
  )),
  asset_subtype TEXT,
  criticality TEXT NOT NULL DEFAULT 'MEDIUM' CHECK(criticality IN ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL')),
  lifecycle_status TEXT NOT NULL DEFAULT 'UNKNOWN' CHECK(lifecycle_status IN (
    'CONFIRMED_ACTIVE', 'PROBABLE_ACTIVE', 'INTERMITTENT', 'STALE_CANDIDATE',
    'OBSOLETE_REVIEW', 'RETIRED', 'UNKNOWN'
  )),
  reconciliation_status TEXT NOT NULL DEFAULT 'PENDING' CHECK(reconciliation_status IN (
    'PENDING', 'AUTO_LINKED', 'HUMAN_VERIFIED', 'CONFLICT', 'REJECTED'
  )),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  reviewed_at TEXT,
  reviewed_by TEXT,
  review_reason TEXT
);

CREATE TABLE IF NOT EXISTS cyber_asset_observations (
  id TEXT PRIMARY KEY,
  snapshot_id TEXT NOT NULL,
  source_record_key TEXT NOT NULL,
  observed_at TEXT NOT NULL,
  ingested_at TEXT NOT NULL,
  segment_id TEXT,
  ip_value TEXT,
  mac_value TEXT,
  hostname_raw TEXT,
  hostname_key TEXT,
  username_masked TEXT,
  manufacturer TEXT,
  os_family TEXT,
  os_version TEXT,
  device_class_raw TEXT,
  first_seen_source_at TEXT,
  last_seen_source_at TEXT,
  source_seen_seconds INTEGER CHECK(source_seen_seconds IS NULL OR source_seen_seconds >= 0),
  attribute_confidence_json TEXT NOT NULL DEFAULT '{}',
  quality_flags_json TEXT NOT NULL DEFAULT '[]',
  sanitized_attributes_json TEXT NOT NULL DEFAULT '{}',
  UNIQUE(snapshot_id, source_record_key),
  FOREIGN KEY(snapshot_id) REFERENCES cyber_source_snapshots(id),
  FOREIGN KEY(segment_id) REFERENCES cyber_network_segments(id)
);

CREATE TABLE IF NOT EXISTS cyber_asset_identifiers (
  id TEXT PRIMARY KEY,
  asset_id TEXT NOT NULL,
  identifier_type TEXT NOT NULL CHECK(identifier_type IN (
    'MAC', 'IPV4', 'IPV6', 'HOSTNAME', 'SERIAL', 'HARDWARE_UUID',
    'KASPERSKY_DEVICE_ID', 'AD_OBJECT_ID', 'GREENBONE_HOST_ID', 'OTHER'
  )),
  normalized_value TEXT NOT NULL,
  display_value_masked TEXT,
  segment_id TEXT,
  valid_from TEXT NOT NULL,
  valid_to TEXT,
  confidence REAL NOT NULL CHECK(confidence >= 0 AND confidence <= 1),
  verification_status TEXT NOT NULL CHECK(verification_status IN (
    'OBSERVED', 'CORROBORATED', 'HUMAN_VERIFIED', 'CONFLICT', 'REVOKED'
  )),
  is_locally_administered INTEGER NOT NULL DEFAULT 0 CHECK(is_locally_administered IN (0, 1)),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  CHECK(valid_to IS NULL OR valid_to >= valid_from),
  UNIQUE(asset_id, identifier_type, normalized_value, valid_from),
  FOREIGN KEY(asset_id) REFERENCES cyber_assets(id),
  FOREIGN KEY(segment_id) REFERENCES cyber_network_segments(id)
);

CREATE TABLE IF NOT EXISTS cyber_asset_observation_links (
  observation_id TEXT NOT NULL,
  asset_id TEXT NOT NULL,
  link_method TEXT NOT NULL CHECK(link_method IN (
    'STRONG_IDENTIFIER', 'MULTI_SOURCE', 'MAC_COMPOSITE', 'HUMAN_DECISION', 'IMPORT_PROPOSAL'
  )),
  confidence REAL NOT NULL CHECK(confidence >= 0 AND confidence <= 1),
  decision_status TEXT NOT NULL CHECK(decision_status IN ('PROPOSED', 'ACCEPTED', 'REJECTED', 'SUPERSEDED')),
  decided_at TEXT,
  decided_by TEXT,
  reason TEXT,
  PRIMARY KEY(observation_id, asset_id),
  FOREIGN KEY(observation_id) REFERENCES cyber_asset_observations(id),
  FOREIGN KEY(asset_id) REFERENCES cyber_assets(id)
);

CREATE TABLE IF NOT EXISTS cyber_asset_owners (
  id TEXT PRIMARY KEY,
  owner_type TEXT NOT NULL CHECK(owner_type IN ('BUSINESS_AREA', 'TECHNICAL_CUSTODIAN', 'PERSON', 'VENDOR')),
  display_name TEXT NOT NULL,
  contact_reference TEXT,
  active INTEGER NOT NULL DEFAULT 1 CHECK(active IN (0, 1)),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS cyber_asset_owner_links (
  asset_id TEXT NOT NULL,
  owner_id TEXT NOT NULL,
  responsibility TEXT NOT NULL CHECK(responsibility IN ('BUSINESS_OWNER', 'TECHNICAL_CUSTODIAN', 'SUPPORT_VENDOR')),
  valid_from TEXT NOT NULL,
  valid_to TEXT,
  PRIMARY KEY(asset_id, owner_id, responsibility, valid_from),
  CHECK(valid_to IS NULL OR valid_to >= valid_from),
  FOREIGN KEY(asset_id) REFERENCES cyber_assets(id),
  FOREIGN KEY(owner_id) REFERENCES cyber_asset_owners(id)
);

CREATE TABLE IF NOT EXISTS cyber_identity_reviews (
  id TEXT PRIMARY KEY,
  review_type TEXT NOT NULL CHECK(review_type IN (
    'NEW_ASSET', 'IDENTIFIER_CONFLICT', 'POSSIBLE_DUPLICATE', 'POSSIBLE_SPLIT', 'REAPPEARED_ASSET'
  )),
  status TEXT NOT NULL DEFAULT 'PENDING' CHECK(status IN ('PENDING', 'IN_REVIEW', 'APPROVED', 'REJECTED', 'SUPERSEDED')),
  asset_id TEXT,
  conflicting_asset_id TEXT,
  observation_id TEXT,
  evidence_json TEXT NOT NULL DEFAULT '{}',
  proposed_action TEXT,
  decided_action TEXT,
  created_at TEXT NOT NULL,
  decided_at TEXT,
  decided_by TEXT,
  decision_reason TEXT,
  FOREIGN KEY(asset_id) REFERENCES cyber_assets(id),
  FOREIGN KEY(conflicting_asset_id) REFERENCES cyber_assets(id),
  FOREIGN KEY(observation_id) REFERENCES cyber_asset_observations(id)
);

CREATE TABLE IF NOT EXISTS cyber_inventory_analysis_runs (
  id TEXT PRIMARY KEY,
  snapshot_id TEXT NOT NULL,
  policy_version TEXT NOT NULL,
  status TEXT NOT NULL CHECK(status IN ('PROCESSING', 'SUCCESS', 'FAILED')),
  started_at TEXT NOT NULL,
  completed_at TEXT,
  summary_json TEXT NOT NULL DEFAULT '{}',
  error_code TEXT,
  UNIQUE(snapshot_id, policy_version),
  FOREIGN KEY(snapshot_id) REFERENCES cyber_source_snapshots(id)
);

CREATE TABLE IF NOT EXISTS cyber_inventory_analysis_items (
  analysis_run_id TEXT NOT NULL,
  observation_id TEXT NOT NULL,
  provisional_asset_class TEXT NOT NULL CHECK(provisional_asset_class IN (
    'SERVER', 'NETWORK', 'SECURITY', 'WORKSTATION', 'LAPTOP', 'PRINTER',
    'IOT', 'CCTV', 'MOBILE', 'GUEST_BYOD', 'VIRTUAL_MACHINE', 'OTHER'
  )),
  identity_strength TEXT NOT NULL CHECK(identity_strength IN ('MEDIUM', 'LOW', 'INSUFFICIENT')),
  proposed_action TEXT NOT NULL CHECK(proposed_action IN (
    'NEW_ASSET_REVIEW', 'EPHEMERAL_REVIEW', 'CONFLICT_REVIEW', 'INSUFFICIENT_EVIDENCE'
  )),
  confidence REAL NOT NULL CHECK(confidence >= 0 AND confidence <= 1),
  reason_codes_json TEXT NOT NULL DEFAULT '[]',
  created_at TEXT NOT NULL,
  PRIMARY KEY(analysis_run_id, observation_id),
  FOREIGN KEY(analysis_run_id) REFERENCES cyber_inventory_analysis_runs(id),
  FOREIGN KEY(observation_id) REFERENCES cyber_asset_observations(id)
);

CREATE TABLE IF NOT EXISTS cyber_cross_source_match_runs (
  id TEXT PRIMARY KEY,
  left_snapshot_id TEXT NOT NULL,
  right_snapshot_id TEXT NOT NULL,
  policy_version TEXT NOT NULL,
  status TEXT NOT NULL CHECK(status IN ('PROCESSING', 'SUCCESS', 'FAILED')),
  started_at TEXT NOT NULL,
  completed_at TEXT,
  summary_json TEXT NOT NULL DEFAULT '{}',
  UNIQUE(left_snapshot_id, right_snapshot_id, policy_version),
  FOREIGN KEY(left_snapshot_id) REFERENCES cyber_source_snapshots(id),
  FOREIGN KEY(right_snapshot_id) REFERENCES cyber_source_snapshots(id)
);

CREATE TABLE IF NOT EXISTS cyber_cross_source_matches (
  match_run_id TEXT NOT NULL,
  left_observation_id TEXT NOT NULL,
  right_observation_id TEXT NOT NULL,
  match_method TEXT NOT NULL CHECK(match_method IN ('EXACT_HOSTNAME')),
  match_status TEXT NOT NULL CHECK(match_status IN ('PROPOSED', 'AMBIGUOUS', 'OS_CONFLICT')),
  confidence REAL NOT NULL CHECK(confidence >= 0 AND confidence <= 1),
  reason_codes_json TEXT NOT NULL DEFAULT '[]',
  created_at TEXT NOT NULL,
  PRIMARY KEY(match_run_id, left_observation_id, right_observation_id),
  FOREIGN KEY(match_run_id) REFERENCES cyber_cross_source_match_runs(id),
  FOREIGN KEY(left_observation_id) REFERENCES cyber_asset_observations(id),
  FOREIGN KEY(right_observation_id) REFERENCES cyber_asset_observations(id)
);

CREATE TABLE IF NOT EXISTS cyber_lifecycle_assessments (
  id TEXT PRIMARY KEY,
  asset_id TEXT NOT NULL,
  assessed_at TEXT NOT NULL,
  policy_version TEXT NOT NULL,
  proposed_status TEXT NOT NULL CHECK(proposed_status IN (
    'CONFIRMED_ACTIVE', 'PROBABLE_ACTIVE', 'INTERMITTENT', 'STALE_CANDIDATE',
    'OBSOLETE_REVIEW', 'RETIRED', 'UNKNOWN'
  )),
  score INTEGER NOT NULL CHECK(score >= 0 AND score <= 100),
  recency_points INTEGER NOT NULL,
  frequency_points INTEGER NOT NULL,
  source_diversity_points INTEGER NOT NULL,
  source_authority_points INTEGER NOT NULL,
  recent_scan_points INTEGER NOT NULL,
  contradiction_penalty INTEGER NOT NULL,
  absence_penalty INTEGER NOT NULL,
  evidence_json TEXT NOT NULL DEFAULT '{}',
  requires_human_review INTEGER NOT NULL DEFAULT 0 CHECK(requires_human_review IN (0, 1)),
  UNIQUE(asset_id, assessed_at, policy_version),
  FOREIGN KEY(asset_id) REFERENCES cyber_assets(id)
);

CREATE TABLE IF NOT EXISTS cyber_scan_authorizations (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  status TEXT NOT NULL CHECK(status IN ('DRAFT', 'ACTIVE', 'EXPIRED', 'REVOKED')),
  valid_from TEXT NOT NULL,
  valid_until TEXT NOT NULL,
  scan_profile TEXT NOT NULL CHECK(scan_profile IN ('DISCOVERY_SAFE', 'VULNERABILITY_SAFE', 'CUSTOM_RESTRICTED')),
  disruptive_tests_allowed INTEGER NOT NULL DEFAULT 0 CHECK(disruptive_tests_allowed IN (0, 1)),
  max_concurrency INTEGER NOT NULL DEFAULT 1 CHECK(max_concurrency BETWEEN 1 AND 20),
  max_hosts_per_run INTEGER NOT NULL DEFAULT 1 CHECK(max_hosts_per_run BETWEEN 1 AND 1024),
  port_policy_json TEXT NOT NULL DEFAULT '{}',
  exclusions_json TEXT NOT NULL DEFAULT '[]',
  approved_by TEXT,
  approved_at TEXT,
  revoked_by TEXT,
  revoked_at TEXT,
  reason TEXT NOT NULL,
  change_reference TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  CHECK(valid_until > valid_from),
  CHECK(status != 'ACTIVE' OR (approved_by IS NOT NULL AND approved_at IS NOT NULL)),
  CHECK(disruptive_tests_allowed = 0 OR scan_profile = 'CUSTOM_RESTRICTED')
);

CREATE TABLE IF NOT EXISTS cyber_scan_authorization_targets (
  authorization_id TEXT NOT NULL,
  target_type TEXT NOT NULL CHECK(target_type IN ('ASSET', 'SEGMENT')),
  asset_id TEXT,
  segment_id TEXT,
  created_at TEXT NOT NULL,
  CHECK(
    (target_type = 'ASSET' AND asset_id IS NOT NULL AND segment_id IS NULL) OR
    (target_type = 'SEGMENT' AND segment_id IS NOT NULL AND asset_id IS NULL)
  ),
  UNIQUE(authorization_id, target_type, asset_id, segment_id),
  FOREIGN KEY(authorization_id) REFERENCES cyber_scan_authorizations(id),
  FOREIGN KEY(asset_id) REFERENCES cyber_assets(id),
  FOREIGN KEY(segment_id) REFERENCES cyber_network_segments(id)
);

CREATE TABLE IF NOT EXISTS cyber_vulnerability_findings (
  id TEXT PRIMARY KEY,
  snapshot_id TEXT NOT NULL,
  source_result_id TEXT NOT NULL,
  asset_id TEXT,
  target_key TEXT NOT NULL,
  host_reference TEXT NOT NULL,
  port INTEGER CHECK(port IS NULL OR port BETWEEN 0 AND 65535),
  transport TEXT CHECK(transport IS NULL OR transport IN ('TCP', 'UDP', 'OTHER')),
  nvt_oid TEXT,
  title TEXT NOT NULL,
  severity REAL NOT NULL CHECK(severity BETWEEN 0 AND 10),
  qod INTEGER CHECK(qod IS NULL OR qod BETWEEN 0 AND 100),
  cves_json TEXT NOT NULL DEFAULT '[]',
  evidence_json TEXT NOT NULL DEFAULT '{}',
  finding_category TEXT NOT NULL CHECK(finding_category IN (
    'COMPONENT_LIFECYCLE', 'SOFTWARE_VULNERABILITY', 'CRYPTOGRAPHIC_CONFIGURATION',
    'NETWORK_CONFIGURATION', 'INFORMATIONAL', 'OTHER'
  )),
  component_key TEXT NOT NULL,
  cause_key TEXT NOT NULL,
  confidence_status TEXT NOT NULL CHECK(confidence_status IN (
    'CONFIRMED_CANDIDATE', 'REVIEW_REQUIRED', 'VALIDATION_REQUIRED'
  )),
  observed_at TEXT NOT NULL,
  created_at TEXT NOT NULL,
  UNIQUE(snapshot_id, source_result_id),
  FOREIGN KEY(snapshot_id) REFERENCES cyber_source_snapshots(id),
  FOREIGN KEY(asset_id) REFERENCES cyber_assets(id)
);

CREATE TABLE IF NOT EXISTS cyber_remediation_cases (
  id TEXT PRIMARY KEY,
  target_key TEXT NOT NULL,
  asset_id TEXT,
  cause_key TEXT NOT NULL,
  canonical_title TEXT NOT NULL,
  case_category TEXT NOT NULL CHECK(case_category IN (
    'COMPONENT_LIFECYCLE', 'SOFTWARE_VULNERABILITY', 'CRYPTOGRAPHIC_CONFIGURATION',
    'NETWORK_CONFIGURATION', 'INFORMATIONAL', 'OTHER'
  )),
  technical_priority TEXT NOT NULL CHECK(technical_priority IN ('P1', 'P2', 'P3', 'P4')),
  workflow_status TEXT NOT NULL DEFAULT 'NEW' CHECK(workflow_status IN (
    'NEW', 'VALIDATION_REQUIRED', 'TEMPORARILY_ACCEPTED', 'PLANNED',
    'IN_PROGRESS', 'REMEDIATED', 'VERIFIED', 'CLOSED'
  )),
  max_severity REAL NOT NULL CHECK(max_severity BETWEEN 0 AND 10),
  max_qod INTEGER CHECK(max_qod IS NULL OR max_qod BETWEEN 0 AND 100),
  finding_count INTEGER NOT NULL CHECK(finding_count > 0),
  cves_json TEXT NOT NULL DEFAULT '[]',
  first_seen_at TEXT NOT NULL,
  last_seen_at TEXT NOT NULL,
  risk_acceptance_until TEXT,
  treatment_reason TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  CHECK(last_seen_at >= first_seen_at),
  UNIQUE(target_key, cause_key),
  FOREIGN KEY(asset_id) REFERENCES cyber_assets(id)
);

CREATE TABLE IF NOT EXISTS cyber_remediation_case_findings (
  case_id TEXT NOT NULL,
  finding_id TEXT NOT NULL UNIQUE,
  linked_at TEXT NOT NULL,
  PRIMARY KEY(case_id, finding_id),
  FOREIGN KEY(case_id) REFERENCES cyber_remediation_cases(id),
  FOREIGN KEY(finding_id) REFERENCES cyber_vulnerability_findings(id)
);

CREATE TABLE IF NOT EXISTS cyber_audit_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  occurred_at TEXT NOT NULL,
  actor TEXT NOT NULL,
  action TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  reason TEXT,
  previous_json TEXT,
  next_json TEXT,
  correlation_id TEXT
);

CREATE INDEX IF NOT EXISTS idx_cyber_snapshots_source_time
  ON cyber_source_snapshots(source_system_id, captured_at DESC);
CREATE INDEX IF NOT EXISTS idx_cyber_observations_snapshot
  ON cyber_asset_observations(snapshot_id, observed_at);
CREATE INDEX IF NOT EXISTS idx_cyber_observations_mac
  ON cyber_asset_observations(mac_value, observed_at);
CREATE INDEX IF NOT EXISTS idx_cyber_observations_ip
  ON cyber_asset_observations(ip_value, segment_id, observed_at);
CREATE INDEX IF NOT EXISTS idx_cyber_identifiers_value
  ON cyber_asset_identifiers(identifier_type, normalized_value, valid_from, valid_to);
CREATE INDEX IF NOT EXISTS idx_cyber_assets_lifecycle
  ON cyber_assets(lifecycle_status, asset_class, criticality);
CREATE INDEX IF NOT EXISTS idx_cyber_reviews_status
  ON cyber_identity_reviews(status, review_type, created_at);
CREATE INDEX IF NOT EXISTS idx_cyber_analysis_snapshot
  ON cyber_inventory_analysis_runs(snapshot_id, policy_version);
CREATE INDEX IF NOT EXISTS idx_cyber_analysis_action
  ON cyber_inventory_analysis_items(analysis_run_id, proposed_action, provisional_asset_class);
CREATE INDEX IF NOT EXISTS idx_cyber_cross_match_status
  ON cyber_cross_source_matches(match_run_id, match_status, confidence);
CREATE INDEX IF NOT EXISTS idx_cyber_lifecycle_asset
  ON cyber_lifecycle_assessments(asset_id, assessed_at DESC);
CREATE INDEX IF NOT EXISTS idx_cyber_authorizations_status
  ON cyber_scan_authorizations(status, valid_from, valid_until);
CREATE INDEX IF NOT EXISTS idx_cyber_vulnerability_target_cause
  ON cyber_vulnerability_findings(target_key, cause_key, observed_at DESC);
CREATE INDEX IF NOT EXISTS idx_cyber_vulnerability_severity
  ON cyber_vulnerability_findings(severity DESC, confidence_status);
CREATE INDEX IF NOT EXISTS idx_cyber_remediation_workflow
  ON cyber_remediation_cases(workflow_status, technical_priority, max_severity DESC);
CREATE UNIQUE INDEX IF NOT EXISTS uq_cyber_authorization_asset_target
  ON cyber_scan_authorization_targets(authorization_id, asset_id)
  WHERE target_type = 'ASSET';
CREATE UNIQUE INDEX IF NOT EXISTS uq_cyber_authorization_segment_target
  ON cyber_scan_authorization_targets(authorization_id, segment_id)
  WHERE target_type = 'SEGMENT';
CREATE INDEX IF NOT EXISTS idx_cyber_audit_entity
  ON cyber_audit_log(entity_type, entity_id, occurred_at DESC);

CREATE TRIGGER IF NOT EXISTS cyber_observations_no_update
BEFORE UPDATE ON cyber_asset_observations
BEGIN
  SELECT RAISE(ABORT, 'cyber asset observations are append-only');
END;

CREATE TRIGGER IF NOT EXISTS cyber_observations_no_delete
BEFORE DELETE ON cyber_asset_observations
BEGIN
  SELECT RAISE(ABORT, 'cyber asset observations are append-only');
END;

CREATE TRIGGER IF NOT EXISTS cyber_vulnerability_findings_no_update
BEFORE UPDATE ON cyber_vulnerability_findings
BEGIN
  SELECT RAISE(ABORT, 'cyber vulnerability findings are append-only');
END;

CREATE TRIGGER IF NOT EXISTS cyber_vulnerability_findings_no_delete
BEFORE DELETE ON cyber_vulnerability_findings
BEGIN
  SELECT RAISE(ABORT, 'cyber vulnerability findings are append-only');
END;

INSERT OR IGNORE INTO cyber_schema_migrations(version, name, applied_at)
VALUES (1, 'initial_cyber_inventory', strftime('%Y-%m-%dT%H:%M:%fZ', 'now'));

INSERT OR IGNORE INTO cyber_schema_migrations(version, name, applied_at)
VALUES (2, 'inventory_analysis_staging', strftime('%Y-%m-%dT%H:%M:%fZ', 'now'));

INSERT OR IGNORE INTO cyber_schema_migrations(version, name, applied_at)
VALUES (3, 'cross_source_match_staging', strftime('%Y-%m-%dT%H:%M:%fZ', 'now'));

INSERT OR IGNORE INTO cyber_schema_migrations(version, name, applied_at)
VALUES (4, 'vulnerability_remediation_cases', strftime('%Y-%m-%dT%H:%M:%fZ', 'now'));
