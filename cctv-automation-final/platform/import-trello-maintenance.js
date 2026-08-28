require('dotenv').config({quiet:true});
const fs = require('node:fs');
const path = require('node:path');
const {DatabaseSync} = require('node:sqlite');
const {parseWorkItems, fingerprint} = require('./trello-maintenance');
const {runtimePaths} = require('../config/runtime-paths');

const root = path.resolve(__dirname, '..');
const targetPath = runtimePaths.dbPath;
const sourcePath = runtimePaths.trelloCacheDb;
if (!fs.existsSync(sourcePath)) throw new Error(`No se encontró la caché Trello: ${sourcePath}`);
const db = new DatabaseSync(targetPath);
db.exec('PRAGMA foreign_keys=ON');
db.exec('PRAGMA busy_timeout=5000');
db.exec(fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8'));
db.exec(`INSERT INTO maintenance_identity_rules(source_system,siis_code,location_id,decided_by,decided_at,notes)
  SELECT 'TRELLO',w.siis_code,o.location_id,o.decided_by,o.decided_at,o.notes
  FROM maintenance_identity_overrides o
  JOIN maintenance_work_items w ON w.source_system=o.source_system AND w.source_item_id=o.source_item_id
  WHERE o.source_system='TRELLO' AND w.siis_code IS NOT NULL AND w.siis_code<>''
    AND o.decided_at=(SELECT MAX(o2.decided_at) FROM maintenance_identity_overrides o2 JOIN maintenance_work_items w2 ON w2.source_system=o2.source_system AND w2.source_item_id=o2.source_item_id WHERE o2.source_system='TRELLO' AND w2.siis_code=w.siis_code)
  ON CONFLICT(source_system,siis_code) DO UPDATE SET location_id=excluded.location_id,decided_by=excluded.decided_by,decided_at=excluded.decided_at,notes=excluded.notes`);
const trello = new DatabaseSync(sourcePath, {readOnly:true});
const startedAt = new Date().toISOString();
let runId;
try {
  const list = trello.prepare(`SELECT l.id,l.name,l.idBoard,b.name AS boardName,b.url AS boardUrl FROM listas l JOIN tableros b ON b.id=l.idBoard WHERE l.closed=0 AND b.closed=0 AND upper(l.name)='MANTENIMIENTO CCTV 2026' LIMIT 1`).get();
  if (!list) throw new Error('La lista Mantenimiento CCTV 2026 no está disponible en caché');
  const cards = trello.prepare('SELECT id,name,due,checklists FROM tarjetas WHERE idList=? AND closed=0 ORDER BY name').all(list.id);
  const locations = db.prepare('SELECT id,siis_code AS code,canonical_name AS name,zone FROM locations WHERE active=1 AND siis_code IS NOT NULL').all();
  const locationByCode = new Map(locations.map(row => [String(row.code), row]));
  const overrideRows = db.prepare(`SELECT o.source_item_id,l.id,l.canonical_name AS name,l.zone FROM maintenance_identity_overrides o JOIN locations l ON l.id=o.location_id WHERE o.source_system='TRELLO'`).all();
  const overrides = new Map(overrideRows.map(row => [String(row.source_item_id),row]));
  const ruleRows = db.prepare(`SELECT r.siis_code,l.id,l.canonical_name AS name,l.zone FROM maintenance_identity_rules r JOIN locations l ON l.id=r.location_id WHERE r.source_system='TRELLO'`).all();
  for (const row of ruleRows) overrides.set(`CODE:${row.siis_code}`, row);
  const source = {boardId:list.idBoard,board:list.boardName,boardUrl:list.boardUrl,listId:list.id,list:list.name};
  const items = parseWorkItems(cards, source, locationByCode, overrides);
  const sourceFingerprint = fingerprint(items);
  runId = Number(db.prepare(`INSERT INTO maintenance_source_runs(source_system,started_at,status,source_reference,source_fingerprint,received_count) VALUES('TRELLO',?,'RUNNING',?,?,?)`).run(startedAt,sourcePath,sourceFingerprint,items.length).lastInsertRowid);
  const existing = new Map(db.prepare("SELECT source_item_id,source_name_raw,source_state_raw,location_id,scheduled_at,status,identity_status,active FROM maintenance_work_items WHERE source_system='TRELLO'").all().map(row => [row.source_item_id,row]));
  const upsert = db.prepare(`INSERT INTO maintenance_work_items(id,source_system,source_item_id,source_checklist_id,source_card_id,source_list_id,source_board_id,source_board_name,source_list_name,source_card_name,source_board_url,source_name_raw,source_state_raw,siis_code,location_id,maintenance_type,scheduled_at,status,identity_status,active,first_seen_at,last_seen_at,source_updated_at,payload_json)
    VALUES(?,'TRELLO',?,?,?,?,?,?,?,?,?,?,?,?,?,'PREVENTIVE',?,?,?,1,?,?,?,?)
    ON CONFLICT(source_system,source_item_id) DO UPDATE SET source_checklist_id=excluded.source_checklist_id,source_card_id=excluded.source_card_id,source_list_id=excluded.source_list_id,source_board_id=excluded.source_board_id,source_board_name=excluded.source_board_name,source_list_name=excluded.source_list_name,source_card_name=excluded.source_card_name,source_board_url=excluded.source_board_url,source_name_raw=excluded.source_name_raw,source_state_raw=excluded.source_state_raw,siis_code=excluded.siis_code,location_id=excluded.location_id,scheduled_at=excluded.scheduled_at,status=excluded.status,identity_status=excluded.identity_status,active=1,last_seen_at=excluded.last_seen_at,source_updated_at=excluded.source_updated_at,payload_json=excluded.payload_json`);
  const seen = new Set(), stats={inserted:0,updated:0,unchanged:0};
  db.exec('BEGIN IMMEDIATE');
  try {
    for (const item of items) {
      seen.add(item.sourceItemId);
      const before=existing.get(item.sourceItemId);
      const comparable=before&&before.source_name_raw===item.rawName&&before.source_state_raw===item.sourceState&&before.location_id===item.locationId&&before.scheduled_at===item.scheduledAt&&before.status===item.status&&before.identity_status===item.identityStatus&&before.active===1;
      if(!before)stats.inserted++;else if(comparable)stats.unchanged++;else stats.updated++;
      upsert.run(item.id,item.sourceItemId,item.sourceChecklistId,item.sourceCardId,item.sourceListId,item.sourceBoardId,item.sourceBoardName,item.sourceListName,item.sourceCardName,item.sourceBoardUrl,item.rawName,item.sourceState,item.siisCode,item.locationId,item.scheduledAt,item.status,item.identityStatus,startedAt,startedAt,fs.statSync(sourcePath).mtime.toISOString(),JSON.stringify(item.payload));
    }
    for(const [sourceItemId] of existing)if(!seen.has(sourceItemId))db.prepare("UPDATE maintenance_work_items SET active=0,last_seen_at=? WHERE source_system='TRELLO' AND source_item_id=?").run(startedAt,sourceItemId);
    const completed=items.filter(x=>x.status==='COMPLETED').length,linked=items.filter(x=>x.locationId).length;
    const summary={cards:cards.length,total:items.length,completed,pending:items.length-completed,linked,unlinked:items.length-linked,...stats};
    db.prepare(`UPDATE maintenance_source_runs SET completed_at=?,status='SUCCESS',inserted_count=?,updated_count=?,unchanged_count=?,summary_json=? WHERE id=?`).run(new Date().toISOString(),stats.inserted,stats.updated,stats.unchanged,JSON.stringify({...summary,source}),runId);
    db.exec('COMMIT');
    console.log(JSON.stringify({ok:true,runId,...summary},null,2));
  } catch(error) { db.exec('ROLLBACK'); throw error; }
} catch(error) {
  if(runId)db.prepare(`UPDATE maintenance_source_runs SET completed_at=?,status='FAILED',error_message=? WHERE id=?`).run(new Date().toISOString(),error.message,runId);
  throw error;
} finally { trello.close(); db.close(); }
