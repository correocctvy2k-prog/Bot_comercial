require("dotenv").config({ quiet: true });
const path = require("node:path");
const { DatabaseSync } = require("node:sqlite");
const { runtimePaths } = require("../config/runtime-paths");

const db = new DatabaseSync(runtimePaths.dbPath);
const date = process.argv.find((value) => /^\d{4}-\d{2}-\d{2}$/.test(value)) || new Date().toISOString().slice(0, 10);
const rows = db.prepare(`SELECT event_type AS eventType,severity,COUNT(*) AS total,
  SUM(CASE WHEN location_id IS NOT NULL THEN 1 ELSE 0 END) AS linked,
  SUM(CASE WHEN location_id IS NULL THEN 1 ELSE 0 END) AS unlinked
  FROM cctv_events WHERE source_system='EMAIL_DAHUA' AND date(COALESCE(occurred_at,received_at),'-5 hours')=?
  GROUP BY event_type,severity ORDER BY total DESC,event_type`).all(date);
const totals = rows.reduce((acc,row)=>({total:acc.total+row.total,linked:acc.linked+row.linked,unlinked:acc.unlinked+row.unlinked}),{total:0,linked:0,unlinked:0});
console.log(JSON.stringify({ date, totals, categories: rows }, null, 2));
db.close();
