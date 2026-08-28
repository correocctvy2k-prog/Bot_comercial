const db = require('../db/init');
const { excelService, getPeriodoFromDate, normalize } = require('./excel.service');

const MONTH_PERIODS = {
  ENERO: 'R1', FEBRERO: 'R1', MARZO: 'R1', ABRIL: 'R1',
  MAYO: 'R2', JUNIO: 'R2', JULIO: 'R2', AGOSTO: 'R2',
  SEPTIEMBRE: 'R3', SETIEMBRE: 'R3', OCTUBRE: 'R3', NOVIEMBRE: 'R3', DICIEMBRE: 'R3'
};

function getPeriodoFromCardName(cardName, fallbackDate) {
  const normalized = normalize(cardName || '');
  const month = Object.keys(MONTH_PERIODS).find((name) => normalized.includes(name));
  return month ? MONTH_PERIODS[month] : getPeriodoFromDate(fallbackDate);
}

function parseJson(value, fallback) {
  try {
    return value ? JSON.parse(value) : fallback;
  } catch {
    return fallback;
  }
}

function getCachedCard(cardId) {
  return db.prepare('SELECT * FROM tarjetas WHERE id = ?').get(cardId);
}

function persistCheckItemFromTrello(cardData, checklistData, checkItem) {
  const current = getCachedCard(cardData.id);
  if (!current) {
    return { updated: false, reason: 'CARD_NOT_CACHED' };
  }

  const checklists = parseJson(current.checklists, []);
  const checklistId = checklistData?.id || checkItem.idChecklist;
  let targetChecklist = null;
  let createdChecklist = false;
  let createdCheckItem = false;
  let previousState = null;

  for (const checklist of checklists) {
    if (checklistId && checklist.id === checklistId) {
      targetChecklist = checklist;
      break;
    }
    if ((checklist.checkItems || []).some((item) => item.id === checkItem.id)) {
      targetChecklist = checklist;
      break;
    }
  }

  if (!targetChecklist) {
    targetChecklist = {
      id: checklistId || `webhook-${cardData.id}`,
      name: checklistData?.name || 'Checklist',
      idCard: cardData.id,
      checkItems: []
    };
    checklists.push(targetChecklist);
    createdChecklist = true;
  }

  const checkItems = targetChecklist.checkItems || [];
  const existingIndex = checkItems.findIndex((item) => item.id === checkItem.id);
  const normalizedCheckItem = {
    ...(existingIndex >= 0 ? checkItems[existingIndex] : {}),
    ...checkItem,
    state: checkItem.state || 'incomplete'
  };

  if (existingIndex >= 0) {
    previousState = checkItems[existingIndex].state || null;
    checkItems[existingIndex] = normalizedCheckItem;
  } else {
    createdCheckItem = true;
    checkItems.push(normalizedCheckItem);
  }

  targetChecklist.checkItems = checkItems;
  db.prepare('UPDATE tarjetas SET checklists = ? WHERE id = ?').run(JSON.stringify(checklists), cardData.id);
  db.prepare('INSERT INTO historial_cambios (cardId, actionType, field, oldValue, newValue) VALUES (?, ?, ?, ?, ?)')
    .run(cardData.id, 'CHECKITEM_UPDATE', checkItem.name, previousState, normalizedCheckItem.state);

  return {
    updated: true,
    cardId: cardData.id,
    cardName: cardData.name || current.name,
    checklistId: targetChecklist.id,
    checklists,
    checkItem: normalizedCheckItem,
    createdChecklist,
    createdCheckItem
  };
}

function hasSuccessfulExcelSync(checkItemId) {
  if (!checkItemId) return false;
  const pattern = `%"checkItemId":"${checkItemId}"%`;
  return !!db.prepare(`
    SELECT id FROM sincronizacion_excel
    WHERE estado = 'SUCCESS' AND detalles LIKE ?
    LIMIT 1
  `).get(pattern);
}

async function syncCompletedCheckItemsFromFetchedCard(card, previousCard = null, fuente = 'trello_refresh') {
  const previousChecklists = parseJson(previousCard?.checklists, []);
  const previousStates = new Map();
  for (const checklist of previousChecklists) {
    for (const item of checklist.checkItems || []) {
      previousStates.set(item.id, item.state || 'incomplete');
    }
  }

  const results = [];
  for (const checklist of card.checklists || []) {
    for (const item of checklist.checkItems || []) {
      const previousState = previousStates.get(item.id);
      const changedToComplete = previousState === 'incomplete' && item.state === 'complete';
      const changedToIncomplete = previousState === 'complete' && item.state !== 'complete';
      const valor = item.state === 'complete' ? 1 : null;
      const periodo = getPeriodoFromCardName(card.name, new Date());

      try {
        const status = await excelService.estaMantenimientoAlineado({
          nombrePunto: item.name,
          periodo,
          valorEsperado: valor
        });

        if (status.aligned && !changedToComplete && !changedToIncomplete) continue;

        const excelResult = await excelService.marcarMantenimiento({
          nombrePunto: item.name,
          periodo,
          valor,
          fuente,
          detalles: {
            origin: 'trelloService.getTarjetas',
            previousState: previousState || null,
            cardId: card.id,
            cardName: card.name,
            checkItemId: item.id,
            excelPreviousValue: status.valor
          }
        });

        results.push({
          checkItemId: item.id,
          checkItem: item.name,
          excelResult,
          reconciledBy: status.aligned ? 'state_transition' : 'excel_diff'
        });
      } catch (error) {
        db.prepare('INSERT INTO sync_log (syncType, status, details) VALUES (?, ?, ?)')
          .run('EXCEL_REFRESH', 'ERROR', JSON.stringify({ error: error.message, cardId: card.id, cardName: card.name, checkItemId: item.id, checkItem: item.name }));
        results.push({ checkItemId: item.id, checkItem: item.name, error: error.message });
      }
    }
  }

  if (results.length) {
    db.prepare('INSERT INTO sync_log (syncType, status, details) VALUES (?, ?, ?)')
      .run('TRELLO_REFRESH_RECONCILE', 'SUCCESS', JSON.stringify({ cardId: card.id, cardName: card.name, count: results.length }));
  }

  return results;
}

async function syncMaintenanceCheckItem({ cardData, checklistData = null, checkItem, fecha = new Date(), fuente = 'manual', detalles = null }) {
  const localUpdate = persistCheckItemFromTrello(cardData, checklistData, checkItem);

  if (!localUpdate.updated) {
    db.prepare('INSERT INTO sync_log (syncType, status, details) VALUES (?, ?, ?)')
      .run('LOCAL_CHECKITEM', 'WARN', JSON.stringify({ reason: localUpdate.reason, cardId: cardData.id, checkItem: checkItem.name, fuente }));
    return { localUpdate, excelResult: null, skippedExcel: localUpdate.reason };
  }

  const periodo = getPeriodoFromCardName(cardData.name, fecha);
  const valor = checkItem.state === 'complete' ? 1 : null;
  const excelResult = await excelService.marcarMantenimiento({
    nombrePunto: checkItem.name,
    periodo,
    fecha,
    valor,
    fuente,
    detalles: {
      ...detalles,
      cardId: cardData.id,
      cardName: cardData.name,
      checkItemId: checkItem.id,
      localPersisted: localUpdate.updated
    }
  });

  return { localUpdate, excelResult, skippedExcel: null };
}

module.exports = {
  getCachedCard,
  getPeriodoFromCardName,
  persistCheckItemFromTrello,
  syncMaintenanceCheckItem,
  syncCompletedCheckItemsFromFetchedCard
};

