'use strict';

// Importa la lista "MANTENIMIENTO CCTV 2026" desde la API de Trello directo
// (spec 0008). Antes leía la caché SQLite `skylab-tareas.db` del backend de
// "Table Trello", que en el servidor no se mantiene fresca -> la vista "Ejecución
// del programa" quedaba días atrás. Ahora usa el mismo patrón que
// import-trello-support.js: fetch a https://api.trello.com con TRELLO_API_KEY/TOKEN.

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { DatabaseSync } = require('node:sqlite');
const { parseWorkItems, fingerprint } = require('./trello-maintenance');
const { marcarMantenimiento } = require('./excel-maintenance-sync');
const { runtimePaths } = require('../config/runtime-paths');

require('dotenv').config({ quiet: true });
// Credenciales de Trello: pueden vivir en el .env de cctv o en el de Table Trello.
require('dotenv').config({ path: runtimePaths.trelloEnvFile, quiet: true });

const targetPath = runtimePaths.dbPath;
const BOARD_ID = process.env.TRELLO_MAINTENANCE_BOARD_ID || '62a0bd9b2203177716f8afdc'; // board "Mantenimientos"
const LIST_NAME = process.env.TRELLO_MAINTENANCE_LIST_NAME || 'MANTENIMIENTO CCTV 2026';
// spec 0016: si no está configurada (ej. desarrollo local sin el montaje CIFS de .65), la
// sincronización a Excel se omite en silencio -- el resto del import sigue igual que hoy.
const MAINTENANCE_EXCEL_PATH = process.env.MAINTENANCE_EXCEL_PATH || null;

if (!process.env.TRELLO_API_KEY || !process.env.TRELLO_TOKEN) {
  throw new Error('Faltan credenciales Trello (TRELLO_API_KEY / TRELLO_TOKEN)');
}

const normalize = (value) => String(value || '')
  .normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().trim();

async function fetchJson(resource, params = {}) {
  const url = new URL(`https://api.trello.com/1${resource}`);
  for (const [key, value] of Object.entries({ ...params, key: process.env.TRELLO_API_KEY, token: process.env.TRELLO_TOKEN })) {
    url.searchParams.set(key, value);
  }
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Trello respondió HTTP ${response.status} en ${resource}`);
  return response.json();
}

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

const startedAt = new Date().toISOString();
let runId;

async function main() {
  const board = await fetchJson(`/boards/${BOARD_ID}`, { fields: 'id,name,url' });
  const lists = await fetchJson(`/boards/${BOARD_ID}/lists`, { filter: 'open', fields: 'id,name' });
  const list = lists.find((l) => normalize(l.name) === normalize(LIST_NAME));
  if (!list) throw new Error(`La lista "${LIST_NAME}" no está en el board ${BOARD_ID} (${board.url})`);

  const rawCards = await fetchJson(`/lists/${list.id}/cards`, {
    fields: 'id,name,due,closed',
    checklists: 'all',
    checklist_fields: 'id,name',
  });
  // parseWorkItems espera `card.checklists` como string JSON (venía de la caché).
  const cards = rawCards
    .filter((c) => !c.closed)
    .map((c) => ({ id: c.id, name: c.name, due: c.due || null, checklists: JSON.stringify(c.checklists || []) }))
    .sort((a, b) => String(a.name).localeCompare(String(b.name)));

  const locations = db.prepare('SELECT id,siis_code AS code,canonical_name AS name,zone FROM locations WHERE active=1 AND siis_code IS NOT NULL').all();
  const locationByCode = new Map(locations.map((row) => [String(row.code), row]));
  const locationById = new Map(locations.map((row) => [row.id, row]));
  const overrideRows = db.prepare(`SELECT o.source_item_id,l.id,l.canonical_name AS name,l.zone FROM maintenance_identity_overrides o JOIN locations l ON l.id=o.location_id WHERE o.source_system='TRELLO'`).all();
  const overrides = new Map(overrideRows.map((row) => [String(row.source_item_id), row]));
  const ruleRows = db.prepare(`SELECT r.siis_code,l.id,l.canonical_name AS name,l.zone FROM maintenance_identity_rules r JOIN locations l ON l.id=r.location_id WHERE r.source_system='TRELLO'`).all();
  for (const row of ruleRows) overrides.set(`CODE:${row.siis_code}`, row);

  const source = { boardId: board.id, board: board.name, boardUrl: board.url, listId: list.id, list: list.name };
  const items = parseWorkItems(cards, source, locationByCode, overrides);
  const sourceFingerprint = fingerprint(items);
  runId = Number(db.prepare(`INSERT INTO maintenance_source_runs(source_system,started_at,status,source_reference,source_fingerprint,received_count) VALUES('TRELLO',?,'RUNNING',?,?,?)`).run(startedAt, board.url, sourceFingerprint, items.length).lastInsertRowid);

  const existing = new Map(db.prepare("SELECT source_item_id,source_name_raw,source_state_raw,location_id,scheduled_at,status,identity_status,active FROM maintenance_work_items WHERE source_system='TRELLO'").all().map((row) => [row.source_item_id, row]));
  const upsert = db.prepare(`INSERT INTO maintenance_work_items(id,source_system,source_item_id,source_checklist_id,source_card_id,source_list_id,source_board_id,source_board_name,source_list_name,source_card_name,source_board_url,source_name_raw,source_state_raw,siis_code,location_id,maintenance_type,scheduled_at,status,identity_status,active,first_seen_at,last_seen_at,source_updated_at,payload_json)
    VALUES(?,'TRELLO',?,?,?,?,?,?,?,?,?,?,?,?,?,'PREVENTIVE',?,?,?,1,?,?,?,?)
    ON CONFLICT(source_system,source_item_id) DO UPDATE SET source_checklist_id=excluded.source_checklist_id,source_card_id=excluded.source_card_id,source_list_id=excluded.source_list_id,source_board_id=excluded.source_board_id,source_board_name=excluded.source_board_name,source_list_name=excluded.source_list_name,source_card_name=excluded.source_card_name,source_board_url=excluded.source_board_url,source_name_raw=excluded.source_name_raw,source_state_raw=excluded.source_state_raw,siis_code=excluded.siis_code,location_id=excluded.location_id,scheduled_at=excluded.scheduled_at,status=excluded.status,identity_status=excluded.identity_status,active=1,last_seen_at=excluded.last_seen_at,source_updated_at=excluded.source_updated_at,payload_json=excluded.payload_json`);

  const seen = new Set();
  const stats = { inserted: 0, updated: 0, unchanged: 0 };
  const excelQueue = [];
  db.exec('BEGIN IMMEDIATE');
  try {
    for (const item of items) {
      seen.add(item.sourceItemId);
      const before = existing.get(item.sourceItemId);
      const comparable = before && before.source_name_raw === item.rawName && before.source_state_raw === item.sourceState && before.location_id === item.locationId && before.scheduled_at === item.scheduledAt && before.status === item.status && before.identity_status === item.identityStatus && before.active === 1;
      if (!before) stats.inserted += 1; else if (comparable) stats.unchanged += 1; else stats.updated += 1;
      upsert.run(item.id, item.sourceItemId, item.sourceChecklistId, item.sourceCardId, item.sourceListId, item.sourceBoardId, item.sourceBoardName, item.sourceListName, item.sourceCardName, item.sourceBoardUrl, item.rawName, item.sourceState, item.siisCode, item.locationId, item.scheduledAt, item.status, item.identityStatus, startedAt, startedAt, startedAt, JSON.stringify(item.payload));
      // spec 0016: solo cuando el estado del ítem realmente cambió (completado <-> pendiente)
      // y ya hay una ubicación canónica resuelta -- evita marcar Excel con el nombre crudo de
      // Trello, mucho menos confiable que el nombre/zona ya conciliados de `locations`.
      if (item.locationId && (!before || before.status !== item.status)) excelQueue.push(item);
    }
    for (const [sourceItemId] of existing) if (!seen.has(sourceItemId)) db.prepare("UPDATE maintenance_work_items SET active=0,last_seen_at=? WHERE source_system='TRELLO' AND source_item_id=?").run(startedAt, sourceItemId);
    const completed = items.filter((x) => x.status === 'COMPLETED').length;
    const linked = items.filter((x) => x.locationId).length;
    const summary = { cards: cards.length, total: items.length, completed, pending: items.length - completed, linked, unlinked: items.length - linked, ...stats };
    db.prepare(`UPDATE maintenance_source_runs SET completed_at=?,status='SUCCESS',inserted_count=?,updated_count=?,unchanged_count=?,summary_json=? WHERE id=?`).run(new Date().toISOString(), stats.inserted, stats.updated, stats.unchanged, JSON.stringify({ ...summary, source }), runId);
    db.exec('COMMIT');
    console.log(JSON.stringify({ ok: true, runId, ...summary }, null, 2));
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }

  await syncExcelQueue(excelQueue, locationById);
}

// spec 0016: no crítico -- si el Excel está bloqueado, la ruta no está montada, o el punto no
// se encuentra en la hoja, se registra en audit_log y el ciclo de Trello sigue sin interrumpirse
// (se reintenta solo en el siguiente ciclo, ~1 min después).
async function syncExcelQueue(excelQueue, locationById) {
  if (!MAINTENANCE_EXCEL_PATH || !excelQueue.length) return;
  const now = new Date().toISOString();
  for (const item of excelQueue) {
    const location = locationById.get(item.locationId);
    if (!location) continue;
    const valor = item.status === 'COMPLETED' ? 1 : null;
    try {
      const result = await marcarMantenimiento({
        filePath: MAINTENANCE_EXCEL_PATH,
        nombrePunto: location.name,
        zona: location.zone,
        fecha: item.scheduledAt || now,
        valor,
      });
      db.prepare(`INSERT INTO audit_log(id,entity_type,entity_id,action,actor,occurred_at,source_system,before_json,after_json,correlation_id) VALUES(?,?,?,?,?,?,?,?,?,?)`)
        .run(crypto.randomUUID(), 'EXCEL_MAINTENANCE_CELL', location.id, 'SYNCED', 'import-trello-maintenance', now, 'TRELLO_TO_EXCEL', JSON.stringify({ previousValue: result.previousValue }), JSON.stringify(result), crypto.randomUUID());
    } catch (error) {
      db.prepare(`INSERT INTO audit_log(id,entity_type,entity_id,action,actor,occurred_at,source_system,before_json,after_json,correlation_id) VALUES(?,?,?,?,?,?,?,?,?,?)`)
        .run(crypto.randomUUID(), 'EXCEL_MAINTENANCE_CELL', location.id, 'SYNC_FAILED', 'import-trello-maintenance', now, 'TRELLO_TO_EXCEL', null, JSON.stringify({ error: error.message, statusCode: error.statusCode || null, nombrePunto: location.name, zona: location.zone, valor }), crypto.randomUUID());
    }
  }
}

main().catch((error) => {
  if (runId) db.prepare(`UPDATE maintenance_source_runs SET completed_at=?,status='FAILED',error_message=? WHERE id=?`).run(new Date().toISOString(), error.message, runId);
  console.error(error.message);
  process.exitCode = 1;
}).finally(() => db.close());
