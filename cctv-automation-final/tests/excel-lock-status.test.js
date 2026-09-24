const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { lockFilePath, extractLockOwner, getExcelLockStatus } = require('../platform/excel-lock-status');

test('lockFilePath antepone ~$ al nombre del archivo, misma carpeta', () => {
  const original = path.join('a', 'b', '2026 programacion.xlsx');
  assert.equal(lockFilePath(original), path.join('a', 'b', '~$2026 programacion.xlsx'));
});

test('extractLockOwner aisla un nombre de usuario plausible entre bytes de relleno', () => {
  const buffer = Buffer.concat([Buffer.from([0, 0, 1, 0]), Buffer.from('Juan Perez', 'latin1'), Buffer.from([0, 0, 0])]);
  assert.equal(extractLockOwner(buffer), 'Juan Perez');
});

test('extractLockOwner devuelve null si no hay nada parseable', () => {
  assert.equal(extractLockOwner(Buffer.from([0, 0, 0, 1, 2])), null);
});

test('getExcelLockStatus: sin archivo ~$ -> no bloqueado', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'excel-lock-'));
  const filePath = path.join(dir, 'libro.xlsx');
  await fs.writeFile(filePath, 'contenido');
  const status = await getExcelLockStatus(filePath);
  assert.deepEqual(status, { locked: false, lockedBy: null });
  await fs.rm(dir, { recursive: true, force: true });
});

test('getExcelLockStatus: con archivo ~$ -> bloqueado, con dueño si se puede leer', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'excel-lock-'));
  const filePath = path.join(dir, 'libro.xlsx');
  await fs.writeFile(filePath, 'contenido');
  await fs.writeFile(lockFilePath(filePath), Buffer.concat([Buffer.from([0, 0]), Buffer.from('MariaLopez', 'latin1')]));
  const status = await getExcelLockStatus(filePath);
  assert.equal(status.locked, true);
  assert.equal(status.lockedBy, 'MariaLopez');
  await fs.rm(dir, { recursive: true, force: true });
});
