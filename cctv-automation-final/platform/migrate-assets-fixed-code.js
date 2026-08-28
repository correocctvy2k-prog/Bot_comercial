const path = require('node:path');
const { DatabaseSync } = require('node:sqlite');
const db = new DatabaseSync(path.resolve(process.env.CCTV_DB || path.join(__dirname, '..', 'data', 'cctv-staging.db')));
const columns = new Set(db.prepare('PRAGMA table_info(assets)').all().map(column => column.name));
if (!columns.has('fixed_asset_code')) db.exec('ALTER TABLE assets ADD COLUMN fixed_asset_code TEXT');
if (!columns.has('installation_id')) db.exec('ALTER TABLE assets ADD COLUMN installation_id TEXT');
db.exec('CREATE UNIQUE INDEX IF NOT EXISTS idx_assets_fixed_asset_code ON assets(fixed_asset_code) WHERE fixed_asset_code IS NOT NULL');
db.exec('CREATE INDEX IF NOT EXISTS idx_assets_installation ON assets(installation_id)');
console.log(JSON.stringify({ migrated: true, columns: db.prepare('PRAGMA table_info(assets)').all().map(c => c.name) }, null, 2));
