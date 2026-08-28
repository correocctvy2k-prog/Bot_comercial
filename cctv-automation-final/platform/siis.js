'use strict';

const crypto = require('node:crypto');
const { normalizeName } = require('./normalize');

function asSiisCode(value) {
  if (value == null) return '';
  return String(value).trim();
}

function normalizeSiisStation(raw, sourceIndex = 0) {
  const station = raw && typeof raw === 'object' ? raw : {};
  const siisCode = asSiisCode(station.estacodi);
  const name = station.estanomb == null ? '' : String(station.estanomb).trim();
  const flags = [];
  if (!siisCode) flags.push('MISSING_SIIS_CODE');
  if (!name) flags.push('MISSING_NAME');
  if (![0, 1, true, false, null, undefined].includes(station.estaping)) flags.push('INVALID_PING_STATE');
  const online = station.estaping == null ? null : station.estaping === 1 || station.estaping === true;
  return { siisCode, name, nameKey: normalizeName(name), online, sourceIndex, qualityFlags: flags, raw: station };
}

function normalizeSiisSnapshot(payload) {
  if (!Array.isArray(payload)) throw new TypeError('La respuesta SIIS debe ser un arreglo de estaciones');
  const rows = payload.map((item, index) => normalizeSiisStation(item, index));
  const seen = new Set();
  for (const row of rows) {
    if (!row.siisCode) continue;
    if (seen.has(row.siisCode)) row.qualityFlags.push('DUPLICATE_SIIS_CODE');
    seen.add(row.siisCode);
  }
  return rows;
}

function snapshotFingerprint(payload) {
  return crypto.createHash('sha256').update(JSON.stringify(payload)).digest('hex');
}

module.exports = { asSiisCode, normalizeSiisStation, normalizeSiisSnapshot, snapshotFingerprint };
