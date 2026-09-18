const crypto = require('node:crypto');

function deterministicId(prefix, value) {
  return `${prefix}-${crypto.createHash('sha256').update(value).digest('hex').slice(0, 32)}`;
}

// Datos reales entregados por el usuario 2026-09-18 (torres_HapLite.pdf, ver spec
// 0013 SS0.1) -- lista explícitamente parcial: solo puntos con CCTV ya conocido al
// momento de la captura, no el censo completo de cada torre. isTower=false solo para
// la fila "No es una torre" (celda alojada en el Edificio Principal de Palmira).
function validateSeedRows(rows) {
  if (!Array.isArray(rows) || rows.length === 0) throw new Error('seed rows must be a non-empty array');
  for (const row of rows) {
    if (!row.torre || !row.gateway || !row.deviceName || !row.haplite) {
      throw new Error(`invalid seed row: ${JSON.stringify(row)}`);
    }
  }
  return rows;
}

// Un torre puede tener más de un gateway/CIDR real (ej. Pradera: red principal +
// subred de oficina) -- se guarda el primero visto como representativo, informacional
// solamente (el modelo completo de router/segmentos por torre es no-objetivo de esta
// fase, spec 0013 SS4).
function loadTowerSeed({ db, rows, loadedAt = new Date().toISOString() }) {
  if (!db) throw new Error('db is required');
  validateSeedRows(rows);

  const upsertTower = db.prepare(`
    INSERT INTO cyber_towers(id, name, gateway_cidr, is_tower, source_reference, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      gateway_cidr = excluded.gateway_cidr,
      is_tower = excluded.is_tower,
      updated_at = excluded.updated_at
  `);
  const upsertPoint = db.prepare(`
    INSERT INTO cyber_tower_points(id, tower_id, point_name, haplite_ip, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?)
    ON CONFLICT(tower_id, haplite_ip, point_name) DO UPDATE SET updated_at = excluded.updated_at
  `);

  const towersSeen = new Map();
  let towersUpserted = 0;
  let pointsUpserted = 0;

  db.exec('BEGIN IMMEDIATE');
  try {
    for (const row of rows) {
      const towerId = deterministicId('tower', row.torre.toLowerCase());
      if (!towersSeen.has(towerId)) {
        towersSeen.set(towerId, row.torre);
        upsertTower.run(
          towerId, row.torre, row.gateway,
          row.isTower === false ? 0 : 1,
          'torres_HapLite.pdf (2026-09-18)', loadedAt, loadedAt,
        );
        towersUpserted += 1;
      }
      const pointId = deterministicId('tower-point', `${towerId}:${row.haplite}:${row.deviceName.toLowerCase()}`);
      upsertPoint.run(pointId, towerId, row.deviceName, row.haplite, loadedAt, loadedAt);
      pointsUpserted += 1;
    }
    db.exec('COMMIT');
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }

  return { status: 'SUCCESS', towers: towersUpserted, points: pointsUpserted };
}

module.exports = {
  loadTowerSeed,
  validateSeedRows,
};
