'use strict';
// 2026-10-02: el usuario reportó que una tarjeta de Soporte editada para
// decir "avenida la victoria Villagorgona" seguía vinculándose al punto
// equivocado ("LA VICTORIA", zona FLORIDA) en vez del real ("AVENIDA LA
// VICTORIA V.GORG", código 3806, zona CANDELARIA). Causa raíz: el catálogo
// abrevia "Villagorgona" de forma inconsistente ("V.GORG"/"V.GORGONA"/
// "GORG") en 9 puntos reales -- la palabra completa "Villagorgona", que la
// gente sí escribe en Trello, nunca aparece literal en esos nombres
// canónicos, así que el matcher por substring (spec 0018) nunca los
// considera candidatos; solo el punto corto sin relación ("LA VICTORIA")
// calza como substring y gana por default.
//
// Fix: agregar un alias con la palabra completa "VILLAGORGONA" para cada
// uno de esos 9 puntos (transformación mecánica, mismo texto con la
// abreviatura expandida) -- mismo mecanismo ya usado por el matcher
// (location_aliases), sin tocar el código de matching ni arriesgar falsos
// positivos en otros puntos.
//
// Uso: node scripts/fix-villagorgona-alias-20261002.js [--apply]
// Sin --apply: solo muestra qué se insertaría (modo auditoría).
const { DatabaseSync } = require('node:sqlite');
const { runtimePaths } = require('../config/runtime-paths');

function toVillagorgonaAlias(name) {
  // Orden importa: probar el patron mas largo primero para no dejar un "V."
  // colgando cuando el nombre abrevia "V.GORG" sin el sufijo "ONA" (ej.
  // "AVENIDA LA VICTORIA V.GORG" -> "...VILLAGORGONA", no "...V.VILLAGORGONA").
  if (/V\.?\s?GORGONA/i.test(name)) return name.replace(/V\.?\s?GORGONA/i, 'VILLAGORGONA');
  if (/V\.?\s?GORG\b/i.test(name)) return name.replace(/V\.?\s?GORG\b/i, 'VILLAGORGONA');
  if (/\bGORG\b/i.test(name)) return name.replace(/\bGORG\b/i, 'VILLAGORGONA');
  return null;
}
function normalizeKey(value) {
  return String(value || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().replace(/[^A-Z0-9]+/g, ' ').trim();
}

const apply = process.argv.includes('--apply');
const db = new DatabaseSync(runtimePaths.dbPath);
const SOURCE_SYSTEM = 'TRELLO_SUPPORT_VILLAGORGONA_FIX';

const locations = db.prepare("SELECT id,canonical_name,zone FROM locations WHERE active=1 AND (canonical_name LIKE '%GORG%')").all();
const plan = [];
for (const location of locations) {
  const aliasRaw = toVillagorgonaAlias(location.canonical_name);
  if (!aliasRaw) continue;
  const aliasKey = normalizeKey(aliasRaw);
  const existing = db.prepare('SELECT id FROM location_aliases WHERE source_system=? AND alias_key=?').get(SOURCE_SYSTEM, aliasKey);
  plan.push({ locationId: location.id, canonicalName: location.canonical_name, zone: location.zone, aliasRaw, aliasKey, alreadyExists: !!existing });
}

console.log(JSON.stringify({ status: apply ? 'APPLYING' : 'AUDIT_ONLY', totalCandidates: locations.length, toInsert: plan.filter((p) => !p.alreadyExists).length, plan }, null, 2));

if (apply) {
  const insert = db.prepare('INSERT INTO location_aliases(location_id,source_system,alias_raw,alias_key) VALUES(?,?,?,?)');
  db.exec('BEGIN IMMEDIATE');
  try {
    let inserted = 0;
    for (const row of plan) {
      if (row.alreadyExists) continue;
      insert.run(row.locationId, SOURCE_SYSTEM, row.aliasRaw, row.aliasKey);
      inserted++;
    }
    db.exec('COMMIT');
    console.log(JSON.stringify({ status: 'INSERTED', count: inserted }, null, 2));
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
}
db.close();
