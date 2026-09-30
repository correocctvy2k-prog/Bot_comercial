const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const ExcelJS = require('exceljs');
const { findPoint, marcarMantenimiento, getPeriodoFromDate, getResumen, loadWorkbook } = require('../platform/excel-maintenance-sync');

// Construye un .xlsx de prueba con la misma forma que el real: hoja "Total", fila 2 con
// COD/PUNTO/PERIODO por bloque de zona, fila 3 con R1/R2/R3, filas de puntos, y una fila TOTAL
// con formulas SUM por columna (igual a como interpreta findTotalRowForPoint/getFormulaCacheValuesForPoint).
async function buildSampleWorkbook() {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('Total');

  sheet.getRow(2).values = [null, 'COD', 'PALMIRA', 'PERIODO'];
  sheet.getRow(3).values = [null, null, null, 'R1', 'R2', 'R3'];
  sheet.getRow(4).values = [null, '1001', 'PUNTO UNO', null, null, null];
  sheet.getRow(5).values = [null, '1002', 'PUNTO DOS - EL PLACER', null, null, null];
  sheet.getRow(6).getCell(3).value = 'TOTAL';
  sheet.getRow(6).getCell(4).value = { formula: 'SUM(D4:D5)' };
  sheet.getRow(6).getCell(5).value = { formula: 'SUM(E4:E5)' };
  sheet.getRow(6).getCell(6).value = { formula: 'SUM(F4:F5)' };

  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'excel-maint-'));
  const filePath = path.join(dir, '2026 programacion anual CCTV.xlsx');
  await workbook.xlsx.writeFile(filePath);
  return { dir, filePath };
}

test('getPeriodoFromDate: R1 ene-abr, R2 may-ago, R3 sep-dic', () => {
  assert.equal(getPeriodoFromDate('2026-02-10'), 'R1');
  assert.equal(getPeriodoFromDate('2026-06-01'), 'R2');
  assert.equal(getPeriodoFromDate('2026-11-30'), 'R3');
});

test('findPoint: coincidencia exacta por código', async () => {
  const { dir, filePath } = await buildSampleWorkbook();
  const { worksheet } = await loadWorkbook(filePath);
  const point = findPoint(worksheet, '1001 PUNTO UNO');
  assert.equal(point.punto, 'PUNTO UNO');
  assert.equal(point.zona, 'PALMIRA');
  await fs.rm(dir, { recursive: true, force: true });
});

test('findPoint: matching difuso tolera el sufijo de fecha que agrega Trello', async () => {
  const { dir, filePath } = await buildSampleWorkbook();
  const { worksheet } = await loadWorkbook(filePath);
  const point = findPoint(worksheet, 'Punto Dos - El Placer - 15/3');
  assert.equal(point.punto, 'PUNTO DOS - EL PLACER');
  await fs.rm(dir, { recursive: true, force: true });
});

test('findPoint: lanza error claro si no hay coincidencia', async () => {
  const { dir, filePath } = await buildSampleWorkbook();
  const { worksheet } = await loadWorkbook(filePath);
  assert.throws(() => findPoint(worksheet, 'PUNTO QUE NO EXISTE XYZ'), /Punto no encontrado/);
  await fs.rm(dir, { recursive: true, force: true });
});

test('marcarMantenimiento: escribe la celda del periodo y recalcula el total', async () => {
  const { dir, filePath } = await buildSampleWorkbook();
  const result = await marcarMantenimiento({ filePath, nombrePunto: '1001 PUNTO UNO', fecha: '2026-06-15', valor: 1 });
  assert.equal(result.periodo, 'R2');
  assert.equal(result.celda, 'E4');
  assert.equal(result.valor, 1);

  const { worksheet } = await loadWorkbook(filePath);
  assert.equal(worksheet.getCell('E4').value, 1);
  // El total (fila 6, columna E) debe reflejar el recalculo cacheado, no quedar en 0.
  const totalCell = worksheet.getCell('E6').value;
  const totalResult = typeof totalCell === 'object' ? totalCell.result : totalCell;
  assert.equal(totalResult, 1);
  await fs.rm(dir, { recursive: true, force: true });
});

test('marcarMantenimiento: limpiar (valor null) borra la marca', async () => {
  const { dir, filePath } = await buildSampleWorkbook();
  await marcarMantenimiento({ filePath, nombrePunto: '1001 PUNTO UNO', periodo: 'R1', valor: 1 });
  await marcarMantenimiento({ filePath, nombrePunto: '1001 PUNTO UNO', periodo: 'R1', valor: null });
  const { worksheet } = await loadWorkbook(filePath);
  assert.equal(worksheet.getCell('D4').value, null);
  await fs.rm(dir, { recursive: true, force: true });
});

test('getResumen: cuenta programados/realizados por zona y periodo', async () => {
  const { dir, filePath } = await buildSampleWorkbook();
  await marcarMantenimiento({ filePath, nombrePunto: '1001 PUNTO UNO', periodo: 'R1', valor: 1 });
  const resumen = await getResumen(filePath);
  const palmira = resumen.zonas.find((z) => z.zona === 'PALMIRA');
  assert.equal(palmira.puntos, 2);
  assert.equal(palmira.periodos.R1.realizados, 1);
  assert.equal(palmira.periodos.R1.porcentaje, 50);
  await fs.rm(dir, { recursive: true, force: true });
});
