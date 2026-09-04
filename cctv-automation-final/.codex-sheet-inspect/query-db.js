const { DatabaseSync } = require('node:sqlite');
const db = new DatabaseSync('data/cctv-staging.db');
for (const sql of [
  `SELECT alarm_raw,COUNT(*) n FROM stg_inventory_locations WHERE import_run_id=(SELECT MAX(id) FROM import_runs) GROUP BY alarm_raw ORDER BY n DESC`,
  `SELECT asset_type,model,COUNT(*) n FROM assets WHERE lifecycle_status='ACTIVE' AND asset_type LIKE '%ALARM%' GROUP BY asset_type,model`,
  `SELECT location_name_raw,ip_address,panel_type,communication_status FROM stg_alarm_panels WHERE import_run_id=(SELECT MAX(id) FROM import_runs)`,
]) console.log(JSON.stringify(db.prepare(sql).all(), null, 2));
console.log(JSON.stringify(db.prepare(`SELECT canonical_name,zone FROM locations WHERE active=1 AND (canonical_name LIKE '%19%35%' OR canonical_name LIKE '%AMAIME%' OR canonical_name LIKE '%BOLO%' OR canonical_name LIKE '%AGRARIA%' OR canonical_name LIKE '%CAMPO%' OR canonical_name LIKE '%PALMIRA%' OR canonical_name LIKE '%JUANCHITO%' OR canonical_name LIKE '%ITALIA%' OR canonical_name LIKE '%MER%II%' OR canonical_name LIKE '%FLORIDA%' OR canonical_name LIKE '%PRADERA%' OR canonical_name LIKE '%ROZO%' OR canonical_name LIKE '%POBLADO%' OR canonical_name LIKE '%PARQUE%' OR canonical_name LIKE '%GORGONA%' OR canonical_name LIKE '%CANDELARIA%') ORDER BY canonical_name`).all(), null, 2));
