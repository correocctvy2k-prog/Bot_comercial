const test = require('node:test');
const assert = require('node:assert/strict');
const { reconcileRows } = require('../platform/reconcile-siis-staging');

test('vincula SIIS con mantenimiento únicamente por código exacto', () => {
  const rows = reconcileRows(
    [{ siis_code: '001', name_raw: 'Nombre SIIS' }],
    [{ maintenance_id: 7, siis_code: '001', point_name_raw: 'Nombre diferente', inventory_decision: 'AUTO_EXACT' }],
  );
  assert.equal(rows[0].status, 'CODE_EXACT');
  assert.equal(rows[0].maintenance.maintenance_id, 7);
});

test('no fuerza nombres parecidos sin código', () => {
  const rows = reconcileRows(
    [{ siis_code: '999', name_raw: 'Galería' }],
    [{ maintenance_id: 8, siis_code: '001', point_name_raw: 'Galería' }],
  );
  assert.equal(rows[0].status, 'SIIS_ONLY');
  assert.ok(rows.some(r => r.status === 'MAINTENANCE_ONLY'));
});

test('marca códigos duplicados en mantenimiento como ambiguos', () => {
  const rows = reconcileRows(
    [{ siis_code: '001', name_raw: 'Uno' }],
    [{ maintenance_id: 1, siis_code: '001' }, { maintenance_id: 2, siis_code: '001' }],
  );
  assert.equal(rows[0].status, 'DUPLICATE_MAINTENANCE_CODE');
});
