const trelloService = require('../services/trello.service');
const { getCachedCard, syncMaintenanceCheckItem } = require('../services/maintenanceSync.service');

// Emitir eventos a través de socket.io
const emitSocket = (req, event, data) => {
  const io = req.app.get('io');
  if (io) {
    io.emit(event, data);
    console.log(`📡 Evento Socket.IO emitido: ${event}`, data);
  }
};

const parseJson = (value, fallback) => {
  try {
    return value ? JSON.parse(value) : fallback;
  } catch {
    return fallback;
  }
};

const findChecklistForCheckItem = (checklistsJson, checkItemId) => {
  const checklists = parseJson(checklistsJson, []);
  for (const checklist of checklists) {
    const checkItem = (checklist.checkItems || []).find((item) => item.id === checkItemId);
    if (checkItem) {
      return { id: checklist.id, name: checklist.name, checkItem };
    }
  }
  return null;
};

exports.getOrganizaciones = async (req, res, next) => {
  try {
    const orgs = await trelloService.getOrganizaciones();
    res.json(orgs);
  } catch (error) {
    next(error);
  }
};

exports.getTableros = async (req, res, next) => {
  try {
    const { idOrg } = req.query; // Filtrar por workspace si se pasa ?idOrg=...
    const tableros = await trelloService.getTableros(idOrg || null);
    res.json(tableros);
  } catch (error) {
    next(error);
  }
};

exports.getListas = async (req, res, next) => {
  try {
    const { id } = req.params;
    const listas = await trelloService.getListas(id);
    res.json(listas);
  } catch (error) {
    next(error);
  }
};

exports.getTarjetas = async (req, res, next) => {
  try {
    const { id } = req.params; // id de lista
    const tarjetas = await trelloService.getTarjetas(id);
    res.json(tarjetas);
  } catch (error) {
    next(error);
  }
};

exports.crearTarjeta = async (req, res, next) => {
  try {
    const card = await trelloService.crearTarjeta(req.body);
    emitSocket(req, 'card_created', card);
    res.status(201).json(card);
  } catch (error) {
    next(error);
  }
};

exports.actualizarTarjeta = async (req, res, next) => {
  try {
    const { id } = req.params;
    const card = await trelloService.actualizarTarjeta(id, req.body);
    emitSocket(req, 'card_updated', card);
    res.json(card);
  } catch (error) {
    next(error);
  }
};

exports.moverTarjeta = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { idList } = req.body;
    const card = await trelloService.moverTarjeta(id, idList);
    emitSocket(req, 'card_moved', card);
    res.json(card);
  } catch (error) {
    next(error);
  }
};

exports.eliminarTarjeta = async (req, res, next) => {
  try {
    const { id } = req.params;
    const result = await trelloService.eliminarTarjeta(id);
    emitSocket(req, 'card_deleted', { id });
    res.json(result);
  } catch (error) {
    next(error);
  }
};
exports.crearChecklist = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { name } = req.body;
    const checklist = await trelloService.crearChecklist(id, name || 'Checklist');
    emitSocket(req, 'checklist_created', { cardId: id, checklist });
    res.status(201).json(checklist);
  } catch (error) {
    next(error);
  }
};

exports.crearCheckItem = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { name, cardId } = req.body;

    if (!name?.trim()) {
      return res.status(400).json({ error: 'El nombre del item es requerido' });
    }

    const checkItem = await trelloService.crearCheckItem(id, name.trim());
    emitSocket(req, 'checkitem_created', { cardId, checklistId: id, checkItem });
    res.status(201).json(checkItem);
  } catch (error) {
    next(error);
  }
};

exports.actualizarCheckItem = async (req, res, next) => {
  try {
    const { cardId, checkItemId } = req.params;
    const { state } = req.body;
    const normalizedState = state === 'complete' ? 'complete' : 'incomplete';
    const checkItem = await trelloService.actualizarCheckItem(cardId, checkItemId, normalizedState);
    const cachedCard = getCachedCard(cardId);
    const cardData = cachedCard ? { id: cachedCard.id, name: cachedCard.name } : { id: cardId, name: '' };
    const checklistData = findChecklistForCheckItem(cachedCard?.checklists, checkItemId);
    const mergedCheckItem = {
      ...(checklistData?.checkItem || {}),
      ...checkItem,
      id: checkItem.id || checkItemId,
      name: checkItem.name || checklistData?.checkItem?.name || ''
    };

    let excelSync = null;
    try {
      const syncResult = await syncMaintenanceCheckItem({
        cardData,
        checklistData,
        checkItem: mergedCheckItem,
        fuente: 'app_trello',
        detalles: { origin: 'tableros.actualizarCheckItem' }
      });
      excelSync = syncResult.excelResult || { skipped: syncResult.skippedExcel };
      if (syncResult.excelResult) {
        emitSocket(req, 'excel_synced', syncResult.excelResult);
      }
    } catch (syncError) {
      excelSync = { error: syncError.message };
      emitSocket(req, 'excel_sync_error', { error: syncError.message, checkItem: mergedCheckItem.name, card: cardData.name });
    }

    emitSocket(req, 'checkitem_updated', { cardId, checkItemId, checkItem: mergedCheckItem });
    res.json({ ...mergedCheckItem, excelSync });
  } catch (error) {
    next(error);
  }
};
