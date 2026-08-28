PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS import_runs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  started_at TEXT NOT NULL,
  completed_at TEXT,
  status TEXT NOT NULL,
  inventory_file TEXT,
  maintenance_file TEXT,
  source_fingerprint TEXT,
  summary_json TEXT
);

CREATE TABLE IF NOT EXISTS stg_inventory_locations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  import_run_id INTEGER NOT NULL,
  source_sheet TEXT NOT NULL,
  source_row INTEGER NOT NULL,
  region_raw TEXT,
  location_name_raw TEXT,
  location_name_key TEXT,
  haplite_ip TEXT,
  secondary_network TEXT,
  cctv_network TEXT,
  wifi_network TEXT,
  nat_status TEXT,
  recorder_port TEXT,
  recorder_ip TEXT,
  camera_count INTEGER,
  firmware_raw TEXT,
  alarm_raw TEXT,
  monitoring_raw TEXT,
  analytics_raw TEXT,
  camera_firmware_raw TEXT,
  dss_identifier TEXT,
  recorder_model TEXT,
  quality_flags TEXT,
  FOREIGN KEY(import_run_id) REFERENCES import_runs(id)
);

CREATE TABLE IF NOT EXISTS stg_alarm_panels (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  import_run_id INTEGER NOT NULL,
  source_row INTEGER NOT NULL,
  location_name_raw TEXT,
  location_name_key TEXT,
  ip_address TEXT,
  subnet_mask TEXT,
  gateway TEXT,
  account_number TEXT,
  panel_type TEXT,
  firmware TEXT,
  serial_number TEXT,
  panel_id TEXT,
  communication_status TEXT,
  quality_flags TEXT,
  FOREIGN KEY(import_run_id) REFERENCES import_runs(id)
);

CREATE TABLE IF NOT EXISTS stg_vehicles (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  import_run_id INTEGER NOT NULL,
  source_row INTEGER NOT NULL,
  plate TEXT,
  brand TEXT,
  line TEXT,
  model_year INTEGER,
  engine_displacement TEXT,
  cctv_description TEXT,
  serial_number TEXT,
  gprs_id TEXT,
  sim_reference TEXT,
  carrier TEXT,
  notes TEXT,
  quality_flags TEXT,
  FOREIGN KEY(import_run_id) REFERENCES import_runs(id)
);

CREATE TABLE IF NOT EXISTS stg_upgrade_projects (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  import_run_id INTEGER NOT NULL,
  source_row INTEGER NOT NULL,
  project_stream TEXT NOT NULL,
  target_location_raw TEXT,
  target_location_key TEXT,
  transfer_or_scope_raw TEXT,
  investment_amount REAL,
  region_raw TEXT,
  FOREIGN KEY(import_run_id) REFERENCES import_runs(id)
);

CREATE TABLE IF NOT EXISTS stg_maintenance_points (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  import_run_id INTEGER NOT NULL,
  source_sheet TEXT NOT NULL,
  source_row INTEGER NOT NULL,
  region_raw TEXT,
  siis_code TEXT,
  point_name_raw TEXT NOT NULL,
  point_name_key TEXT NOT NULL,
  r1_value INTEGER,
  r2_value INTEGER,
  r3_value INTEGER,
  FOREIGN KEY(import_run_id) REFERENCES import_runs(id)
);

CREATE TABLE IF NOT EXISTS reconciliation_candidates (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  import_run_id INTEGER NOT NULL,
  maintenance_point_id INTEGER NOT NULL,
  inventory_location_id INTEGER,
  match_method TEXT NOT NULL,
  score REAL NOT NULL,
  decision TEXT NOT NULL DEFAULT 'PENDING',
  FOREIGN KEY(import_run_id) REFERENCES import_runs(id),
  FOREIGN KEY(maintenance_point_id) REFERENCES stg_maintenance_points(id),
  FOREIGN KEY(inventory_location_id) REFERENCES stg_inventory_locations(id)
);

-- Instantáneas SIIS. Se conserva el código como texto para no perder ceros.
CREATE TABLE IF NOT EXISTS siis_sync_runs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  started_at TEXT NOT NULL,
  completed_at TEXT,
  status TEXT NOT NULL,
  source_reference TEXT,
  source_fingerprint TEXT,
  received_count INTEGER NOT NULL DEFAULT 0,
  valid_count INTEGER NOT NULL DEFAULT 0,
  invalid_count INTEGER NOT NULL DEFAULT 0,
  summary_json TEXT
);

CREATE TABLE IF NOT EXISTS stg_siis_locations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  sync_run_id INTEGER NOT NULL,
  siis_code TEXT NOT NULL,
  name_raw TEXT,
  name_key TEXT,
  online INTEGER,
  source_index INTEGER NOT NULL,
  payload_json TEXT,
  quality_flags TEXT,
  UNIQUE(sync_run_id, siis_code),
  FOREIGN KEY(sync_run_id) REFERENCES siis_sync_runs(id)
);

CREATE TABLE IF NOT EXISTS siis_location_reconciliation (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  sync_run_id INTEGER NOT NULL,
  siis_location_id INTEGER NOT NULL,
  location_id TEXT,
  match_method TEXT NOT NULL,
  decision TEXT NOT NULL,
  notes TEXT,
  UNIQUE(sync_run_id, siis_location_id),
  FOREIGN KEY(sync_run_id) REFERENCES siis_sync_runs(id),
  FOREIGN KEY(siis_location_id) REFERENCES stg_siis_locations(id),
  FOREIGN KEY(location_id) REFERENCES locations(id)
);

CREATE TABLE IF NOT EXISTS location_review_runs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  imported_at TEXT NOT NULL,
  source_file TEXT NOT NULL,
  source_fingerprint TEXT NOT NULL,
  row_count INTEGER NOT NULL,
  summary_json TEXT
);

CREATE TABLE IF NOT EXISTS location_review_decisions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  review_run_id INTEGER NOT NULL,
  case_id TEXT NOT NULL,
  pending_type TEXT NOT NULL,
  siis_code TEXT,
  siis_status TEXT,
  siis_name TEXT,
  maintenance_name TEXT,
  zone TEXT,
  inventory_name TEXT,
  inventory_match_method TEXT,
  inventory_score REAL,
  dss_ids TEXT,
  dss_models TEXT,
  decision TEXT NOT NULL,
  canonical_name TEXT,
  corrected_siis_code TEXT,
  observations TEXT,
  reviewed_by TEXT,
  reviewed_at TEXT,
  validation_status TEXT NOT NULL,
  validation_flags TEXT,
  UNIQUE(review_run_id, case_id),
  FOREIGN KEY(review_run_id) REFERENCES location_review_runs(id)
);

CREATE TABLE IF NOT EXISTS canonical_promotion_runs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  started_at TEXT NOT NULL,
  completed_at TEXT,
  status TEXT NOT NULL,
  source_file TEXT NOT NULL,
  source_fingerprint TEXT NOT NULL,
  summary_json TEXT
);

CREATE TABLE IF NOT EXISTS canonical_promotion_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  promotion_run_id INTEGER NOT NULL,
  entity_type TEXT NOT NULL,
  entity_key TEXT NOT NULL,
  action TEXT NOT NULL,
  result TEXT NOT NULL,
  details_json TEXT,
  FOREIGN KEY(promotion_run_id) REFERENCES canonical_promotion_runs(id)
);

-- Modelo canónico futuro. El importador de staging NO escribe aquí.
CREATE TABLE IF NOT EXISTS locations (
  id TEXT PRIMARY KEY,
  siis_code TEXT UNIQUE,
  canonical_name TEXT NOT NULL,
  zone TEXT,
  location_type TEXT,
  cctv_coverage_status TEXT NOT NULL DEFAULT 'UNKNOWN',
  criticality TEXT,
  active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS location_aliases (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  location_id TEXT NOT NULL,
  source_system TEXT NOT NULL,
  alias_raw TEXT NOT NULL,
  alias_key TEXT NOT NULL,
  UNIQUE(source_system, alias_key),
  FOREIGN KEY(location_id) REFERENCES locations(id)
);

CREATE TABLE IF NOT EXISTS assets (
  id TEXT PRIMARY KEY,
  location_id TEXT,
  asset_type TEXT NOT NULL,
  parent_asset_id TEXT,
  manufacturer TEXT DEFAULT 'Dahua',
  model TEXT,
  serial_number TEXT,
  firmware TEXT,
  dss_identifier TEXT,
  ip_address TEXT,
  channel_capacity INTEGER,
  installed_at TEXT,
  lifecycle_status TEXT NOT NULL DEFAULT 'UNKNOWN',
  metadata_json TEXT,
  physical_site_id TEXT,
  FOREIGN KEY(location_id) REFERENCES locations(id),
  FOREIGN KEY(parent_asset_id) REFERENCES assets(id)
);

CREATE TABLE IF NOT EXISTS physical_sites (
  id TEXT PRIMARY KEY,
  canonical_name TEXT NOT NULL,
  zone TEXT,
  site_type TEXT,
  metadata_json TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS physical_site_members (
  site_id TEXT NOT NULL,
  location_id TEXT NOT NULL,
  relation_type TEXT NOT NULL,
  opening_group TEXT,
  opening_policy TEXT NOT NULL DEFAULT 'INDEPENDENT',
  created_at TEXT NOT NULL,
  PRIMARY KEY(site_id, location_id),
  FOREIGN KEY(site_id) REFERENCES physical_sites(id),
  FOREIGN KEY(location_id) REFERENCES locations(id)
);

CREATE TABLE IF NOT EXISTS dss_device_registry (
  dss_identifier TEXT PRIMARY KEY,
  physical_site_id TEXT,
  location_id TEXT,
  device_name TEXT NOT NULL,
  device_type TEXT,
  model TEXT,
  ip_address TEXT,
  organization TEXT,
  source_capture TEXT,
  match_method TEXT NOT NULL,
  confidence REAL NOT NULL,
  status TEXT NOT NULL DEFAULT 'ACTIVE',
  observed_at TEXT NOT NULL,
  metadata_json TEXT,
  FOREIGN KEY(physical_site_id) REFERENCES physical_sites(id),
  FOREIGN KEY(location_id) REFERENCES locations(id)
);

CREATE TABLE IF NOT EXISTS channels (
  id TEXT PRIMARY KEY,
  asset_id TEXT NOT NULL,
  channel_number INTEGER,
  channel_name TEXT,
  channel_type TEXT NOT NULL DEFAULT 'VIDEO',
  operational_role TEXT,
  analytics_capabilities TEXT,
  active INTEGER NOT NULL DEFAULT 1,
  FOREIGN KEY(asset_id) REFERENCES assets(id)
);

CREATE TABLE IF NOT EXISTS cctv_events (
  id TEXT PRIMARY KEY,
  source_system TEXT NOT NULL,
  source_event_id TEXT NOT NULL,
  location_id TEXT,
  asset_id TEXT,
  channel_id TEXT,
  event_type TEXT NOT NULL,
  event_phase TEXT,
  occurred_at TEXT,
  received_at TEXT,
  severity TEXT,
  raw_reference TEXT,
  payload_json TEXT,
  UNIQUE(source_system, source_event_id),
  FOREIGN KEY(location_id) REFERENCES locations(id),
  FOREIGN KEY(asset_id) REFERENCES assets(id),
  FOREIGN KEY(channel_id) REFERENCES channels(id)
);

CREATE TABLE IF NOT EXISTS operational_notifications (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  severity TEXT NOT NULL CHECK (severity IN ('info','warning','critical')),
  source TEXT NOT NULL,
  target_tab TEXT NOT NULL,
  occurred_at TEXT NOT NULL,
  created_at TEXT NOT NULL,
  payload_json TEXT NOT NULL DEFAULT '{}'
);

CREATE TABLE IF NOT EXISTS operational_notification_states (
  notification_id TEXT NOT NULL REFERENCES operational_notifications(id) ON DELETE CASCADE,
  actor TEXT NOT NULL,
  read_at TEXT,
  attended_at TEXT,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (notification_id, actor)
);

CREATE TABLE IF NOT EXISTS operational_notification_preferences (
  actor TEXT PRIMARY KEY,
  popup_mode TEXT NOT NULL CHECK (popup_mode IN ('ALL','PRIORITY','MUTED')),
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_operational_notifications_occurred
  ON operational_notifications(occurred_at DESC);

CREATE TABLE IF NOT EXISTS operational_daily_closures (
  closure_date TEXT PRIMARY KEY,
  time_zone TEXT NOT NULL DEFAULT 'America/Bogota',
  status TEXT NOT NULL,
  generated_at TEXT NOT NULL,
  summary_json TEXT NOT NULL,
  source_cutoffs_json TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS alarm_communication_profiles (
  location_id TEXT PRIMARY KEY,
  subscriber_account TEXT,
  panel_model TEXT,
  local_ip TEXT,
  report_channel TEXT,
  primary_receiver_address TEXT,
  primary_receiver_port INTEGER,
  primary_receiver_status TEXT,
  secondary_receiver_address TEXT,
  secondary_receiver_port INTEGER,
  secondary_receiver_status TEXT,
  backup_receiver_address TEXT,
  backup_receiver_port INTEGER,
  backup_receiver_status TEXT,
  failure_policy TEXT,
  source TEXT NOT NULL DEFAULT 'BABYWARE_MANUAL',
  verified_at TEXT,
  verified_by TEXT,
  notes TEXT,
  updated_at TEXT NOT NULL,
  FOREIGN KEY(location_id) REFERENCES locations(id)
);

CREATE TABLE IF NOT EXISTS maintenance_plan (
  id TEXT PRIMARY KEY,
  location_id TEXT NOT NULL,
  year INTEGER NOT NULL,
  period TEXT NOT NULL,
  planned_date TEXT,
  source_reference TEXT,
  status TEXT NOT NULL DEFAULT 'PLANNED',
  UNIQUE(location_id, year, period),
  FOREIGN KEY(location_id) REFERENCES locations(id)
);

CREATE TABLE IF NOT EXISTS maintenance_execution (
  id TEXT PRIMARY KEY,
  maintenance_plan_id TEXT,
  location_id TEXT NOT NULL,
  completed_at TEXT,
  trello_card_id TEXT,
  trello_checkitem_id TEXT,
  technician TEXT,
  result TEXT,
  evidence_json TEXT,
  FOREIGN KEY(maintenance_plan_id) REFERENCES maintenance_plan(id),
  FOREIGN KEY(location_id) REFERENCES locations(id)
);

CREATE TABLE IF NOT EXISTS maintenance_source_runs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  source_system TEXT NOT NULL,
  started_at TEXT NOT NULL,
  completed_at TEXT,
  status TEXT NOT NULL,
  source_reference TEXT,
  source_fingerprint TEXT,
  received_count INTEGER NOT NULL DEFAULT 0,
  inserted_count INTEGER NOT NULL DEFAULT 0,
  updated_count INTEGER NOT NULL DEFAULT 0,
  unchanged_count INTEGER NOT NULL DEFAULT 0,
  summary_json TEXT,
  error_message TEXT
);

CREATE TABLE IF NOT EXISTS maintenance_work_items (
  id TEXT PRIMARY KEY,
  source_system TEXT NOT NULL,
  source_item_id TEXT NOT NULL,
  source_checklist_id TEXT,
  source_card_id TEXT,
  source_list_id TEXT,
  source_board_id TEXT,
  source_board_name TEXT,
  source_list_name TEXT,
  source_card_name TEXT,
  source_board_url TEXT,
  source_name_raw TEXT NOT NULL,
  source_state_raw TEXT,
  siis_code TEXT,
  location_id TEXT,
  maintenance_type TEXT NOT NULL DEFAULT 'PREVENTIVE',
  scheduled_at TEXT,
  status TEXT NOT NULL,
  identity_status TEXT NOT NULL,
  active INTEGER NOT NULL DEFAULT 1,
  first_seen_at TEXT NOT NULL,
  last_seen_at TEXT NOT NULL,
  source_updated_at TEXT,
  payload_json TEXT,
  UNIQUE(source_system, source_item_id),
  FOREIGN KEY(location_id) REFERENCES locations(id)
);

CREATE TABLE IF NOT EXISTS maintenance_identity_overrides (
  source_system TEXT NOT NULL,
  source_item_id TEXT NOT NULL,
  location_id TEXT NOT NULL,
  decided_by TEXT NOT NULL,
  decided_at TEXT NOT NULL,
  notes TEXT,
  PRIMARY KEY(source_system, source_item_id),
  FOREIGN KEY(location_id) REFERENCES locations(id)
);

-- A manual reconciliation is a reusable catalog rule, not only a decision for
-- one Trello checklist item. This prevents recurring maintenance entries from
-- asking for the same identity again.
CREATE TABLE IF NOT EXISTS maintenance_identity_rules (
  source_system TEXT NOT NULL,
  siis_code TEXT NOT NULL,
  location_id TEXT NOT NULL,
  decided_by TEXT NOT NULL,
  decided_at TEXT NOT NULL,
  notes TEXT,
  PRIMARY KEY(source_system, siis_code),
  FOREIGN KEY(location_id) REFERENCES locations(id)
);

CREATE TABLE IF NOT EXISTS support_source_runs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  source_system TEXT NOT NULL,
  started_at TEXT NOT NULL,
  completed_at TEXT,
  status TEXT NOT NULL,
  source_reference TEXT,
  source_fingerprint TEXT,
  received_count INTEGER NOT NULL DEFAULT 0,
  inserted_count INTEGER NOT NULL DEFAULT 0,
  updated_count INTEGER NOT NULL DEFAULT 0,
  unchanged_count INTEGER NOT NULL DEFAULT 0,
  summary_json TEXT,
  error_message TEXT
);

CREATE TABLE IF NOT EXISTS support_cards (
  id TEXT PRIMARY KEY,
  source_system TEXT NOT NULL,
  source_card_id TEXT NOT NULL,
  source_list_id TEXT NOT NULL,
  source_board_id TEXT NOT NULL,
  source_list_name TEXT NOT NULL,
  source_board_name TEXT NOT NULL,
  source_board_url TEXT,
  source_card_url TEXT,
  title_raw TEXT NOT NULL,
  description_raw TEXT,
  activity_type TEXT NOT NULL,
  status TEXT NOT NULL,
  due_at TEXT,
  due_complete INTEGER NOT NULL DEFAULT 0,
  source_updated_at TEXT,
  location_id TEXT,
  identity_status TEXT NOT NULL,
  members_json TEXT,
  payload_json TEXT,
  active INTEGER NOT NULL DEFAULT 1,
  first_seen_at TEXT NOT NULL,
  last_seen_at TEXT NOT NULL,
  UNIQUE(source_system,source_card_id),
  FOREIGN KEY(location_id) REFERENCES locations(id)
);

CREATE TABLE IF NOT EXISTS support_identity_overrides (
  source_system TEXT NOT NULL,
  source_card_id TEXT NOT NULL,
  location_id TEXT NOT NULL,
  decided_by TEXT NOT NULL,
  decided_at TEXT NOT NULL,
  notes TEXT,
  PRIMARY KEY(source_system,source_card_id),
  FOREIGN KEY(location_id) REFERENCES locations(id)
);

CREATE TABLE IF NOT EXISTS project_scope_decisions (
  scope_item_id TEXT PRIMARY KEY,
  decision TEXT NOT NULL CHECK(decision IN ('INCLUDED','DUPLICATE','NOT_APPLICABLE')),
  decided_by TEXT NOT NULL,
  decided_at TEXT NOT NULL,
  notes TEXT
);

CREATE INDEX IF NOT EXISTS idx_stg_inventory_key ON stg_inventory_locations(import_run_id, location_name_key);
CREATE INDEX IF NOT EXISTS idx_stg_maintenance_key ON stg_maintenance_points(import_run_id, point_name_key);
CREATE INDEX IF NOT EXISTS idx_events_location_time ON cctv_events(location_id, occurred_at);
CREATE INDEX IF NOT EXISTS idx_assets_location_type ON assets(location_id, asset_type);
CREATE INDEX IF NOT EXISTS idx_stg_siis_code ON stg_siis_locations(sync_run_id, siis_code);
CREATE INDEX IF NOT EXISTS idx_review_decision_code ON location_review_decisions(review_run_id, siis_code);
CREATE INDEX IF NOT EXISTS idx_promotion_items_run ON canonical_promotion_items(promotion_run_id, entity_type);
CREATE INDEX IF NOT EXISTS idx_maintenance_work_location ON maintenance_work_items(location_id, scheduled_at);
CREATE INDEX IF NOT EXISTS idx_maintenance_work_status ON maintenance_work_items(active, status, identity_status);
CREATE INDEX IF NOT EXISTS idx_maintenance_runs_source ON maintenance_source_runs(source_system, status, completed_at);
CREATE INDEX IF NOT EXISTS idx_support_cards_status ON support_cards(active,status,activity_type);
CREATE INDEX IF NOT EXISTS idx_support_cards_location ON support_cards(location_id,due_at);
CREATE INDEX IF NOT EXISTS idx_support_runs_source ON support_source_runs(source_system,status,completed_at);
CREATE INDEX IF NOT EXISTS idx_project_scope_decision ON project_scope_decisions(decision,decided_at);

CREATE TABLE IF NOT EXISTS visitor_report_runs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  source_uid TEXT NOT NULL UNIQUE,
  report_date TEXT,
  received_at TEXT,
  subject TEXT,
  row_count INTEGER NOT NULL DEFAULT 0,
  imported_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS visitor_visits (
  id TEXT PRIMARY KEY,
  source_uid TEXT NOT NULL,
  source_row INTEGER NOT NULL,
  report_date TEXT NOT NULL,
  visitor_external_id TEXT,
  visitor_key TEXT NOT NULL,
  document_type TEXT,
  document_masked TEXT,
  first_name TEXT,
  last_name TEXT,
  host_first_name TEXT,
  host_last_name TEXT,
  reason TEXT NOT NULL,
  visit_status TEXT NOT NULL,
  entry_at TEXT,
  entry_place TEXT,
  exit_at TEXT,
  exit_place TEXT,
  imported_at TEXT NOT NULL,
  UNIQUE(source_uid,source_row)
);

CREATE INDEX IF NOT EXISTS idx_visitor_visits_date ON visitor_visits(report_date,entry_at);
CREATE INDEX IF NOT EXISTS idx_visitor_visits_key ON visitor_visits(visitor_key,report_date);
CREATE INDEX IF NOT EXISTS idx_visitor_visits_reason ON visitor_visits(reason,report_date);
