const ExcelJS = require('exceljs');
const JSZip = require('jszip');
const fsp = require('fs/promises');
const path = require('path');
const config = require('../config/trello');
const db = require('../db/init');

const SHEET_NAME = 'Total';
const PERIODS = ['R1', 'R2', 'R3'];

function normalize(value = '') {
  return value
    .toString()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

function getMatchTokens(value = '') {
  const stopWords = new Set(['LA', 'EL', 'LOS', 'LAS', 'DE', 'DEL', 'Y']);
  return normalize(value)
    .split(' ')
    .filter((token) => token && !stopWords.has(token));
}

function stripTrelloPointName(value = '') {
  return value
    .toString()
    .replace(/^\s*\d+[\s_-]+/, '')
    .replace(/\s*-?\s*\d{1,2}\/\d{1,2}\s*$/, '')
    .replace(/_/g, ' ')
    .trim();
}

function withRomanVariants(value = '') {
  const normalizedValue = normalize(value);
  const variants = new Set([normalizedValue]);
  const romanMap = { '1': 'I', '2': 'II', '3': 'III', '4': 'IV', '5': 'V' };
  for (const [digit, roman] of Object.entries(romanMap)) {
    variants.add(normalizedValue.replace(new RegExp('\\b' + digit + '\\b', 'g'), roman));
    variants.add(normalizedValue.replace(new RegExp('\\b' + roman + '\\b', 'g'), digit));
  }
  return [...variants].filter(Boolean);
}

function compactKey(value = '') {
  return normalize(value).replace(/\s+/g, '');
}

function getPointCode(value = '') {
  const match = value.toString().trim().match(/^(\d{3,5})(?=\D|$)/);
  return match ? match[1] : null;
}
function getSearchKeys(value = '') {
  const stripped = stripTrelloPointName(value);
  const candidates = [value, stripped];
  const keys = new Set();
  for (const candidate of candidates) {
    for (const variant of withRomanVariants(candidate)) {
      keys.add(variant);
    }
  }
  return [...keys].filter(Boolean);
}

function levenshteinDistance(a, b) {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;

  const previous = Array.from({ length: b.length + 1 }, (_, index) => index);
  const current = Array.from({ length: b.length + 1 }, () => 0);

  for (let i = 1; i <= a.length; i += 1) {
    current[0] = i;
    for (let j = 1; j <= b.length; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      current[j] = Math.min(current[j - 1] + 1, previous[j] + 1, previous[j - 1] + cost);
    }
    for (let j = 0; j <= b.length; j += 1) previous[j] = current[j];
  }

  return previous[b.length];
}

function tokenMatches(candidateToken, queryToken) {
  if (candidateToken === queryToken) return true;
  const minLength = Math.min(candidateToken.length, queryToken.length);
  return minLength >= 5 && levenshteinDistance(candidateToken, queryToken) <= 1;
}

function tokenMatchScore(candidate, query) {
  const candidateTokens = getMatchTokens(candidate);
  const queryTokens = getMatchTokens(query);
  if (!candidateTokens.length || !queryTokens.length) return 0;

  const matched = queryTokens.filter((token) => candidateTokens.some((candidateToken) => tokenMatches(candidateToken, token))).length;
  return Math.max(matched / queryTokens.length, matched / candidateTokens.length);
}

function columnToLetter(column) {
  let temp = '';
  let col = column;
  while (col > 0) {
    const rem = (col - 1) % 26;
    temp = String.fromCharCode(65 + rem) + temp;
    col = Math.floor((col - rem - 1) / 26);
  }
  return temp;
}

function getColumnIndexFromAddress(address) {
  const letters = (address.match(/^[A-Z]+/i) || [''])[0];
  return letters.toUpperCase().split('').reduce((total, char) => (total * 26) + char.charCodeAt(0) - 64, 0);
}

function cellText(cell) {
  const value = cell?.value;
  if (value == null) return '';
  if (typeof value === 'object') {
    if (value.text) return value.text;
    if (value.richText) return value.richText.map((part) => part.text).join('');
    if (value.result != null) return value.result.toString();
    if (value.formula) return `=${value.formula}`;
  }
  return value.toString();
}

function isFormulaValue(value) {
  return value && typeof value === 'object' && value.formula;
}

function xmlEscape(value) {
  return value.toString()
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function escapeForRegExp(value) {
  return value.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&');
}

function normalizeZipPath(target) {
  const cleaned = target.replace(/^\//, '');
  return cleaned.startsWith('xl/') ? cleaned : `xl/${cleaned}`;
}

function getPeriodoFromDate(fecha = new Date()) {
  let date;
  if (fecha instanceof Date) {
    date = fecha;
  } else if (typeof fecha === 'string' && /^\d{4}-\d{2}-\d{2}/.test(fecha)) {
    const [year, month, day] = fecha.slice(0, 10).split('-').map(Number);
    date = new Date(year, month - 1, day);
  } else {
    date = new Date(fecha);
  }

  if (Number.isNaN(date.getTime())) return getPeriodoFromDate(new Date());
  const month = date.getMonth();
  if (month <= 3) return 'R1';
  if (month <= 7) return 'R2';
  return 'R3';
}

function xmlUnescape(value = '') {
  return value.toString()
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&gt;/g, '>')
    .replace(/&lt;/g, '<')
    .replace(/&amp;/g, '&');
}

function splitAddress(address) {
  const match = address.match(/^([A-Z]+)(\d+)$/i);
  if (!match) return null;
  return { column: getColumnIndexFromAddress(match[1]), row: Number(match[2]) };
}

function addressFromParts(column, row) {
  return `${columnToLetter(column)}${row}`;
}

function rangeAddresses(range) {
  const [startAddress, endAddress] = range.split(':');
  const start = splitAddress(startAddress);
  const end = splitAddress(endAddress || startAddress);
  if (!start || !end) return [];

  const addresses = [];
  for (let row = Math.min(start.row, end.row); row <= Math.max(start.row, end.row); row += 1) {
    for (let column = Math.min(start.column, end.column); column <= Math.max(start.column, end.column); column += 1) {
      addresses.push(addressFromParts(column, row));
    }
  }
  return addresses;
}

function parseSheetCells(sheetXml) {
  const cells = new Map();
  const cellPattern = /<c\b([^>]*)r="([A-Z]+\d+)"([^>]*)>([\s\S]*?)<\/c>/g;
  let match;
  while ((match = cellPattern.exec(sheetXml))) {
    const [, before, address, after, innerXml] = match;
    const valueMatch = innerXml.match(/<v>([\s\S]*?)<\/v>/);
    const formulaMatch = innerXml.match(/<f\b[^>]*>([\s\S]*?)<\/f>/);
    const numericValue = valueMatch ? Number(xmlUnescape(valueMatch[1])) : null;
    cells.set(address, {
      address,
      before,
      after,
      innerXml,
      value: Number.isFinite(numericValue) ? numericValue : null,
      formula: formulaMatch ? xmlUnescape(formulaMatch[1]).trim() : null
    });
  }
  return cells;
}

function evaluateSheetFormula(formula, cells, stack = new Set()) {
  const expression = formula.replace(/^=/, '').trim();
  const sumMatch = expression.match(/^SUM\(([^)]+)\)$/i);

  if (sumMatch) {
    return sumMatch[1].split(',').reduce((total, range) => {
      return total + rangeAddresses(range.trim()).reduce((rangeTotal, address) => rangeTotal + getEvaluatedCellValue(address, cells, stack), 0);
    }, 0);
  }

  if (!/^[A-Z0-9+\-*/().\s]+$/i.test(expression)) return null;
  const numericExpression = expression.replace(/\b[A-Z]+\d+\b/gi, (address) => String(getEvaluatedCellValue(address.toUpperCase(), cells, stack)));
  if (!/^[0-9+\-*/().\s]+$/.test(numericExpression)) return null;

  try {
    const result = Function(`"use strict"; return (${numericExpression});`)();
    return Number.isFinite(result) ? result : null;
  } catch {
    return null;
  }
}

function getEvaluatedCellValue(address, cells, stack = new Set()) {
  const cell = cells.get(address);
  if (!cell) return 0;
  if (!cell.formula) return Number(cell.value || 0);
  if (stack.has(address)) return Number(cell.value || 0);

  stack.add(address);
  const evaluated = evaluateSheetFormula(cell.formula, cells, stack);
  stack.delete(address);

  if (evaluated == null) return Number(cell.value || 0);
  cell.value = evaluated;
  return evaluated;
}

function recalculateCachedFormulaValues(sheetXml) {
  const cells = parseSheetCells(sheetXml);
  const formulaValues = new Map();

  for (const [address, cell] of cells.entries()) {
    if (!cell.formula) continue;
    const value = getEvaluatedCellValue(address, cells, new Set());
    if (Number.isFinite(value)) formulaValues.set(address, value);
  }

  if (!formulaValues.size) return sheetXml;

  return sheetXml.replace(/<c\b([^>]*)r="([A-Z]+\d+)"([^>]*)>([\s\S]*?)<\/c>/g, (match, before, address, after, innerXml) => {
    if (!formulaValues.has(address) || !/<f\b/.test(innerXml)) return match;
    const valueXml = `<v>${formulaValues.get(address)}</v>`;
    const nextInnerXml = /<v>[\s\S]*?<\/v>/.test(innerXml)
      ? innerXml.replace(/<v>[\s\S]*?<\/v>/, valueXml)
      : `${innerXml}${valueXml}`;
    return `<c${before}r="${address}"${after}>${nextInnerXml}</c>`;
  });
}

function updateCachedFormulaValues(sheetXml, formulaCacheValues = {}) {
  const entries = Object.entries(formulaCacheValues)
    .filter(([, value]) => Number.isFinite(Number(value)))
    .map(([address, value]) => [address.toUpperCase(), Number(value)]);
  if (!entries.length) return sheetXml;

  const values = new Map(entries);
  return sheetXml.replace(/<c\b([^>]*)r="([A-Z]+\d+)"([^>]*)>([\s\S]*?)<\/c>/g, (match, before, address, after, innerXml) => {
    if (!values.has(address) || !/<f\b/.test(innerXml)) return match;
    const valueXml = `<v>${values.get(address)}</v>`;
    const nextInnerXml = /<v>[\s\S]*?<\/v>/.test(innerXml)
      ? innerXml.replace(/<v>[\s\S]*?<\/v>/, valueXml)
      : `${innerXml}${valueXml}`;
    return `<c${before}r="${address}"${after}>${nextInnerXml}</c>`;
  });
}
function enableWorkbookRecalculation(workbookXml) {
  const attrs = 'calcMode="auto" fullCalcOnLoad="1" forceFullCalc="1"';
  if (/<calcPr\b[^>]*\/>/.test(workbookXml)) {
    return workbookXml.replace(/<calcPr\b[^>]*\/>/, (match) => {
      let next = match.replace(/\s(?:calcMode|fullCalcOnLoad|forceFullCalc)="[^"]*"/g, '');
      return next.replace(/\/>$/, ` ${attrs}/>`);
    });
  }
  return workbookXml.replace('</workbook>', `<calcPr ${attrs}/></workbook>`);
}
async function patchNumericCellInWorkbook(filePath, sheetName, cellAddress, value, formulaCacheValues = {}) {
  const inputBuffer = await fsp.readFile(filePath);
  const zip = await JSZip.loadAsync(inputBuffer);
  const workbookFile = zip.file('xl/workbook.xml');
  const relsFile = zip.file('xl/_rels/workbook.xml.rels');
  if (!workbookFile || !relsFile) {
    throw new Error('El archivo XLSX no contiene la estructura esperada de workbook.xml.');
  }

  let workbookXml = await workbookFile.async('string');
  const relsXml = await relsFile.async('string');
  const sheetPattern = new RegExp(`<sheet[^>]*name="${escapeForRegExp(xmlEscape(sheetName))}"[^>]*r:id="([^"]+)"[^>]*/>`);
  const sheetMatch = workbookXml.match(sheetPattern);

  if (!sheetMatch) {
    throw new Error(`No se encontró la hoja "${sheetName}" dentro del archivo XLSX.`);
  }

  const relPattern = new RegExp(`<Relationship[^>]*Id="${escapeForRegExp(sheetMatch[1])}"[^>]*Target="([^"]+)"[^>]*/>`);
  const relMatch = relsXml.match(relPattern);

  if (!relMatch) {
    throw new Error(`No se encontró la relación interna de la hoja "${sheetName}".`);
  }

  const sheetPath = normalizeZipPath(relMatch[1]);
  const sheetFile = zip.file(sheetPath);
  if (!sheetFile) {
    throw new Error(`No se encontró el XML interno de la hoja: ${sheetPath}.`);
  }

  const rowNumber = Number((cellAddress.match(/\d+$/) || ['0'])[0]);
  const cellColumn = getColumnIndexFromAddress(cellAddress);
  let sheetXml = await sheetFile.async('string');
  const escapedCellAddress = escapeForRegExp(cellAddress);
  const cellXml = value == null ? `<c r="${cellAddress}"/>` : `<c r="${cellAddress}"><v>${value}</v></c>`;
  const cellPattern = new RegExp(`<c\\b([^>]*)r="${escapedCellAddress}"([^>\\/]*)\\s*\\/>|<c\\b([^>]*)r="${escapedCellAddress}"([^>]*)>(?:[\\s\\S]*?)<\\/c>`);

  if (cellPattern.test(sheetXml)) {
    sheetXml = sheetXml.replace(cellPattern, (match, beforeA = '', afterA = '', beforeB = '', afterB = '') => {
      const attrs = `${beforeA || beforeB || ''} ${afterA || afterB || ''}`
        .replace(/\bt="[^"]*"/g, '')
        .replace(/\//g, '')
        .replace(/\s+/g, ' ')
        .trim();
      return value == null
        ? `<c r="${cellAddress}"${attrs ? ` ${attrs}` : ''}/>`
        : `<c r="${cellAddress}"${attrs ? ` ${attrs}` : ''}><v>${value}</v></c>`;
    });
  } else {
    const rowPattern = new RegExp(`<row\\b([^>]*)r="${rowNumber}"([^>]*)>([\\s\\S]*?)<\\/row>`);
    if (rowPattern.test(sheetXml)) {
      sheetXml = sheetXml.replace(rowPattern, (rowMatch, before, after, rowContent) => {
        const cellFinder = new RegExp('<c\\b[^>]*r="([A-Z]+)\\d+"[\\s\\S]*?(?:<\\/c>|\\/>)', 'g');
        const cells = [...rowContent.matchAll(cellFinder)];
        let insertAt = rowContent.length;
        for (const match of cells) {
          if (getColumnIndexFromAddress(match[1]) > cellColumn) {
            insertAt = match.index;
            break;
          }
        }
        const newContent = rowContent.slice(0, insertAt) + cellXml + rowContent.slice(insertAt);
        return `<row${before}r="${rowNumber}"${after}>${newContent}</row>`;
      });
    } else {
      const rowXml = `<row r="${rowNumber}">${cellXml}</row>`;
      sheetXml = sheetXml.replace('</sheetData>', `${rowXml}</sheetData>`);
    }
  }

  sheetXml = updateCachedFormulaValues(sheetXml, formulaCacheValues);
  workbookXml = enableWorkbookRecalculation(workbookXml);
  zip.file('xl/workbook.xml', workbookXml);
  zip.file(sheetPath, sheetXml);
  const outputBuffer = await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });
  const tempPath = path.join(path.dirname(filePath), `~$codex-${Date.now()}-${path.basename(filePath)}`);
  await fsp.writeFile(tempPath, outputBuffer);

  try {
    await fsp.copyFile(tempPath, filePath);
  } catch (error) {
    if (error.code === 'EBUSY' || error.code === 'EPERM') {
      const lockedError = new Error('El archivo Excel está abierto o bloqueado. Cierra el libro en Excel e intenta nuevamente.');
      lockedError.statusCode = 423;
      lockedError.code = error.code;
      throw lockedError;
    }
    throw error;
  } finally {
    await fsp.rm(tempPath, { force: true }).catch(() => {});
  }
}

class ExcelService {
  constructor() {
    this.filePath = config.excelPath;
  }

  async loadWorkbook() {
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.readFile(this.filePath);
    const worksheet = workbook.getWorksheet(SHEET_NAME);
    if (!worksheet) {
      throw new Error(`No existe la hoja "${SHEET_NAME}" en ${this.filePath}`);
    }
    return { workbook, worksheet };
  }

  getZoneBlocks(worksheet) {
    const blocks = [];
    const headerRow = worksheet.getRow(2);
    const periodRow = worksheet.getRow(3);

    const maxHeaderColumn = Math.max(headerRow.cellCount, periodRow.cellCount);
    for (let col = 1; col <= maxHeaderColumn - 2; col += 1) {
      const header = normalize(cellText(headerRow.getCell(col)));
      const r1 = normalize(cellText(periodRow.getCell(col)));
      const r2 = normalize(cellText(periodRow.getCell(col + 1)));
      const r3 = normalize(cellText(periodRow.getCell(col + 2)));

      if (header === 'PERIODO' && r1 === 'R1' && r2 === 'R2' && r3 === 'R3') {
        const pointColumn = col - 1;
        const zone = cellText(headerRow.getCell(pointColumn));
        const codHeader = normalize(cellText(headerRow.getCell(pointColumn - 1)));
        blocks.push({
          zone,
          zoneKey: normalize(zone),
          pointColumn,
          codColumn: codHeader === 'COD' ? pointColumn - 1 : null,
          periodColumns: { R1: col, R2: col + 1, R3: col + 2 }
        });
      }
    }

    return blocks;
  }

  getPoints(worksheet, zoneFilter = null) {
    const zoneKey = zoneFilter ? normalize(zoneFilter) : null;
    const blocks = this.getZoneBlocks(worksheet).filter((block) => !zoneKey || block.zoneKey === zoneKey);
    const points = [];

    for (const block of blocks) {
      for (let rowNumber = 4; rowNumber <= worksheet.rowCount; rowNumber += 1) {
        const row = worksheet.getRow(rowNumber);
        const pointCell = row.getCell(block.pointColumn);
        const rawPoint = cellText(pointCell).trim();
        if (!rawPoint || normalize(rawPoint) === 'TOTAL' || isFormulaValue(pointCell.value)) continue;
        const rawCode = block.codColumn ? cellText(row.getCell(block.codColumn)).trim() : '';

        points.push({
          punto: rawPoint,
          puntoKey: normalize(rawPoint),
          codigo: rawCode || null,
          zona: block.zone,
          zonaKey: block.zoneKey,
          row: rowNumber,
          pointColumn: columnToLetter(block.pointColumn),
          codColumn: block.codColumn ? columnToLetter(block.codColumn) : null,
          periodColumns: Object.fromEntries(Object.entries(block.periodColumns).map(([period, col]) => [period, columnToLetter(col)]))
        });
      }
    }

    return points;
  }

  findPoint(worksheet, nombrePunto, zona = null) {
    const pointCode = getPointCode(nombrePunto);
    const searchKeys = getSearchKeys(nombrePunto);
    const compactSearchKeys = searchKeys.map(compactKey);
    const points = this.getPoints(worksheet, zona);
    let matches = pointCode ? points.filter((point) => point.codigo === pointCode) : [];

    if (matches.length === 0) {
      matches = points.filter((point) => searchKeys.includes(point.puntoKey));
    }

    if (matches.length === 0) {
      matches = points.filter((point) => compactSearchKeys.includes(compactKey(point.puntoKey)));
    }

    if (matches.length === 0) {
      matches = points.filter((point) => {
        const pointCompact = compactKey(point.puntoKey);
        return compactSearchKeys.some((key) => key.length >= 5 && (pointCompact.includes(key) || key.includes(pointCompact)));
      });
    }

    if (matches.length === 0) {
      matches = points
        .map((point) => ({ point, score: Math.max(...searchKeys.map((key) => tokenMatchScore(point.punto, key))) }))
        .filter(({ score }) => score >= 0.8)
        .sort((a, b) => b.score - a.score)
        .map(({ point }) => point);
    }

    if (matches.length === 0) {
      const sample = points.slice(0, 8).map((point) => point.punto).join(', ');
      throw new Error(`Punto no encontrado en Excel: ${nombrePunto}. Ejemplos: ${sample}`);
    }

    const exactCodeMatches = pointCode ? matches.filter((point) => point.codigo === pointCode) : [];
    if (exactCodeMatches.length === 1) {
      return exactCodeMatches[0];
    }

    const exactCompactMatches = matches.filter((point) => compactSearchKeys.includes(compactKey(point.puntoKey)));
    if (exactCompactMatches.length === 1) {
      return exactCompactMatches[0];
    }

    if (matches.length > 1 && !zona) {
      const zones = matches.map((point) => `${point.punto} (${point.zona})`).join(', ');
      throw new Error(`Punto ambiguo en Excel: ${nombrePunto}. Coincidencias: ${zones}`);
    }

    return matches[0];
  }

  getCellNumberForFormula(worksheet, address, overrides = {}) {
    const key = address.toUpperCase();
    if (Object.prototype.hasOwnProperty.call(overrides, key)) {
      const override = overrides[key];
      return override == null || override === '' ? 0 : Number(override) || 0;
    }

    const value = worksheet.getCell(key).value;
    if (value == null || value === '') return 0;
    if (typeof value === 'object') {
      if (value.result == null || value.result === '') return 0;
      return Number(value.result) || 0;
    }
    return Number(value) || 0;
  }

  evaluateWorksheetFormula(formula, worksheet, overrides = {}) {
    const expression = formula.replace(/^=/, '').trim();
    const sumMatch = expression.match(/^SUM\(([^)]+)\)$/i);

    if (sumMatch) {
      return sumMatch[1].split(',').reduce((total, range) => {
        return total + rangeAddresses(range.trim()).reduce((rangeTotal, address) => {
          return rangeTotal + this.getCellNumberForFormula(worksheet, address, overrides);
        }, 0);
      }, 0);
    }

    if (!/^[A-Z0-9+\-*/().\s]+$/i.test(expression)) return null;
    const numericExpression = expression.replace(/\b[A-Z]+\d+\b/gi, (address) => {
      return String(this.getCellNumberForFormula(worksheet, address.toUpperCase(), overrides));
    });
    if (!/^[0-9+\-*/().\s]+$/.test(numericExpression)) return null;

    try {
      const result = Function(`"use strict"; return (${numericExpression});`)();
      return Number.isFinite(result) ? result : null;
    } catch {
      return null;
    }
  }

  findTotalRowForPoint(worksheet, point, period) {
    const periodColumn = point.periodColumns[period];
    for (let row = point.row + 1; row <= worksheet.rowCount; row += 1) {
      const formula = worksheet.getCell(`${periodColumn}${row}`).formula;
      if (formula && /^SUM\(/i.test(formula) && formula.includes(periodColumn)) {
        return row;
      }
    }
    return null;
  }

  getFormulaCacheValuesForPoint(worksheet, point, changedAddress, changedValue) {
    const totalRow = this.findTotalRowForPoint(worksheet, point, Object.keys(point.periodColumns)[0]);
    if (!totalRow) return {};

    const overrides = { [changedAddress.toUpperCase()]: changedValue };
    const cacheValues = {};

    for (const periodColumn of Object.values(point.periodColumns)) {
      const totalAddress = `${periodColumn}${totalRow}`;
      const totalFormula = worksheet.getCell(totalAddress).formula;
      if (totalFormula) {
        const total = this.evaluateWorksheetFormula(totalFormula, worksheet, overrides);
        if (total != null) {
          cacheValues[totalAddress] = total;
          overrides[totalAddress] = total;
        }
      }
    }

    for (const periodColumn of Object.values(point.periodColumns)) {
      const percentAddress = `${periodColumn}${totalRow + 1}`;
      const percentFormula = worksheet.getCell(percentAddress).formula;
      if (percentFormula) {
        const percent = this.evaluateWorksheetFormula(percentFormula, worksheet, overrides);
        if (percent != null) {
          cacheValues[percentAddress] = percent;
          overrides[percentAddress] = percent;
        }
      }
    }

    for (const periodColumn of Object.values(point.periodColumns)) {
      const grandTotalAddress = `${periodColumn}${totalRow + 2}`;
      const grandTotalFormula = worksheet.getCell(grandTotalAddress).formula;
      if (grandTotalFormula) {
        const grandTotal = this.evaluateWorksheetFormula(grandTotalFormula, worksheet, overrides);
        if (grandTotal != null) {
          cacheValues[grandTotalAddress] = grandTotal;
          overrides[grandTotalAddress] = grandTotal;
        }
      }
    }

    return cacheValues;
  }
  async marcarMantenimiento({ nombrePunto, zona = null, periodo = null, fecha = new Date(), valor = 1, fuente = 'manual', detalles = null }) {
    const finalPeriodo = periodo || getPeriodoFromDate(fecha);
    if (!PERIODS.includes(finalPeriodo)) {
      throw new Error(`Periodo inválido: ${finalPeriodo}. Use R1, R2 o R3.`);
    }

    const { worksheet } = await this.loadWorkbook();
    const point = this.findPoint(worksheet, nombrePunto, zona);
    const columnLetter = point.periodColumns[finalPeriodo];
    const cellAddress = `${columnLetter}${point.row}`;
    const cell = worksheet.getCell(cellAddress);
    const previousValue = cell.value;

    const formulaCacheValues = this.getFormulaCacheValuesForPoint(worksheet, point, cellAddress, valor);
    await patchNumericCellInWorkbook(this.filePath, SHEET_NAME, cellAddress, valor, formulaCacheValues);

    const syncStatus = valor == null ? 'CLEARED' : 'SUCCESS';
    db.prepare(`
      INSERT INTO sincronizacion_excel (punto, zona, periodo, celda, valor, estado, fuente, detalles)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(point.punto, point.zona, finalPeriodo, cellAddress, valor, syncStatus, fuente, JSON.stringify({ previousValue, detalles }));

    return {
      punto: point.punto,
      zona: point.zona,
      periodo: finalPeriodo,
      celda: cellAddress,
      valor,
      previousValue
    };
  }

  async getMantenimientoCell({ nombrePunto, zona = null, periodo = null, fecha = new Date() }) {
    const finalPeriodo = periodo || getPeriodoFromDate(fecha);
    if (!PERIODS.includes(finalPeriodo)) {
      throw new Error(`Periodo inválido: ${finalPeriodo}. Use R1, R2 o R3.`);
    }

    const { worksheet } = await this.loadWorkbook();
    const point = this.findPoint(worksheet, nombrePunto, zona);
    const columnLetter = point.periodColumns[finalPeriodo];
    const cellAddress = `${columnLetter}${point.row}`;
    const value = worksheet.getCell(cellAddress).value;

    return {
      punto: point.punto,
      zona: point.zona,
      periodo: finalPeriodo,
      celda: cellAddress,
      valor: value == null ? null : value
    };
  }

  async estaMantenimientoAlineado({ nombrePunto, zona = null, periodo = null, fecha = new Date(), valorEsperado = 1 }) {
    const cell = await this.getMantenimientoCell({ nombrePunto, zona, periodo, fecha });
    const actual = cell.valor == null || cell.valor === '' ? null : Number(cell.valor);
    const expected = valorEsperado == null ? null : Number(valorEsperado);
    const normalizedActual = Number.isNaN(actual) ? cell.valor : actual;

    return {
      ...cell,
      valorNormalizado: normalizedActual,
      valorEsperado: expected,
      aligned: normalizedActual === expected
    };
  }
  async listarPuntos(zona = null) {
    const { worksheet } = await this.loadWorkbook();
    return this.getPoints(worksheet, zona).map(({ punto, codigo, zona: pointZone, row, pointColumn, codColumn, periodColumns }) => ({
      punto,
      codigo,
      zona: pointZone,
      row,
      pointColumn,
      codColumn,
      periodColumns
    }));
  }

  async getResumen() {
    const { worksheet } = await this.loadWorkbook();
    const blocks = this.getZoneBlocks(worksheet);
    const points = this.getPoints(worksheet);
    const resumen = blocks.map((block) => {
      const zonePoints = points.filter((point) => point.zonaKey === block.zoneKey);
      const periods = {};
      for (const period of PERIODS) {
        const column = block.periodColumns[period];
        const completed = zonePoints.filter((point) => worksheet.getRow(point.row).getCell(column).value === 1).length;
        periods[period] = {
          programados: zonePoints.length,
          realizados: completed,
          porcentaje: zonePoints.length ? Math.round((completed / zonePoints.length) * 100) : 0
        };
      }
      return { zona: block.zone, puntos: zonePoints.length, periodos: periods };
    });

    return { filePath: this.filePath, sheet: SHEET_NAME, zonas: resumen };
  }

  getHistorial(limite = 50) {
    return db.prepare(`
      SELECT * FROM sincronizacion_excel
      ORDER BY id DESC
      LIMIT ?
    `).all(Number(limite) || 50);
  }
}

module.exports = {
  excelService: new ExcelService(),
  getPeriodoFromDate,
  normalize,
  getPointCode
};







