const db = require('../db/init');
const { syncMaintenanceCheckItem } = require('../services/maintenanceSync.service');

// Trello envía un HEAD request al crear/validar el Webhook
exports.validarWebhook = (req, res) => {
  console.log('📡 Validación de Webhook de Trello recibida (HEAD)');
  res.status(200).send('OK');
};

// Recibir actualizaciones de Trello (POST)
exports.procesarWebhook = async (req, res) => {
  const io = req.app.get('io');
  const action = req.body?.action;

  if (!action) {
    return res.status(400).send('Cuerpo del webhook inválido');
  }

  console.log(`⚡ Webhook Trello Recibido: ${action.type}`, {
    cardId: action.data?.card?.id,
    cardName: action.data?.card?.name
  });

  try {
    const cardId = action.data?.card?.id;
    
    // Registrar log en SQLite
    const logStmt = db.prepare('INSERT INTO sync_log (syncType, status, details) VALUES (?, ?, ?)');
    logStmt.run('WEBHOOK', 'SUCCESS', JSON.stringify({ type: action.type, cardId }));

    switch (action.type) {
      case 'createCard': {
        const cardData = action.data.card;
        const listData = action.data.list;
        const boardData = action.data.board;

        const stmt = db.prepare(`
          INSERT OR REPLACE INTO tarjetas (id, name, desc, idList, idBoard, due, closed, labels, members)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `);
        stmt.run(cardData.id, cardData.name, '', listData.id, boardData.id, null, 0, '[]', '[]');

        if (io) {
          io.emit('card_created', {
            id: cardData.id,
            name: cardData.name,
            idList: listData.id,
            idBoard: boardData.id,
            labels: [],
            idMembers: []
          });
        }
        break;
      }

      case 'updateCard': {
        const cardData = action.data.card;
        const listBefore = action.data.listBefore;
        const listAfter = action.data.listAfter;

        // Comprobar si es un movimiento de lista
        if (listBefore && listAfter) {
          const stmt = db.prepare('UPDATE tarjetas SET idList = ? WHERE id = ?');
          stmt.run(listAfter.id, cardData.id);

          if (io) {
            io.emit('card_moved', {
              id: cardData.id,
              idList: listAfter.id
            });
          }
        } else if (cardData.closed !== undefined) {
          // Si fue archivada o restaurada
          const isClosed = cardData.closed ? 1 : 0;
          const stmt = db.prepare('UPDATE tarjetas SET closed = ? WHERE id = ?');
          stmt.run(isClosed, cardData.id);

          if (io) {
            if (isClosed) {
              io.emit('card_deleted', { id: cardData.id });
            } else {
              io.emit('card_created', cardData); // Si se desarchiva se vuelve a emitir
            }
          }
        } else {
          // Actualización normal (nombre, descripción, due, etc.)
          // Trello no envía todas las propiedades en updates menores, hacemos un update dinámico
          const current = db.prepare('SELECT * FROM tarjetas WHERE id = ?').get(cardData.id);
          if (current) {
            const name = cardData.name !== undefined ? cardData.name : current.name;
            const desc = cardData.desc !== undefined ? cardData.desc : current.desc;
            const due = cardData.due !== undefined ? cardData.due : current.due;

            const stmt = db.prepare('UPDATE tarjetas SET name = ?, desc = ?, due = ? WHERE id = ?');
            stmt.run(name, desc, due, cardData.id);

            if (io) {
              io.emit('card_updated', {
                id: cardData.id,
                name,
                desc,
                due,
                idList: current.idList,
                idBoard: current.idBoard,
                labels: JSON.parse(current.labels || '[]'),
                idMembers: JSON.parse(current.members || '[]')
              });
            }
          }
        }
        break;
      }
      case 'updateCheckItem':
      case 'updateCheckItemStateOnCard': {
        const checkItem = action.data?.checkItem;
        const cardData = action.data?.card;
        const checklistData = action.data?.checklist;

        if (!checkItem?.name || !cardData?.id) {
          console.log('⚠️ updateCheckItem sin checkItem/card suficientes para sincronizar Excel');
          break;
        }

        try {
          if (io) {
            io.emit('trello_sync_refresh_requested', {
              type: action.type,
              cardId: cardData.id,
              cardName: cardData.name,
              checkItemId: checkItem.id
            });
          }

          const fecha = action.date || new Date();
          const { localUpdate, excelResult } = await syncMaintenanceCheckItem({
            cardData,
            checklistData,
            checkItem,
            fecha,
            fuente: 'webhook_trello',
            detalles: { actionId: action.id }
          });

          if (io && localUpdate.updated) {
            const eventName = localUpdate.createdCheckItem ? 'checkitem_created' : 'checkitem_updated';
            io.emit(eventName, {
              cardId: cardData.id,
              checklistId: localUpdate.checklistId,
              checkItemId: checkItem.id,
              checkItem: localUpdate.checkItem
            });
          }

          if (!localUpdate.updated) {
            console.log(`⚠️ Cambio de checklist recibido, pero la tarjeta no está cacheada localmente: ${cardData.id}`);
          }

          if (!excelResult) {
            console.log(`ℹ️ Checklist desmarcado o incompleto, se actualiza SQLite/frontend pero no Excel: ${checkItem.name}`);
            break;
          }

          if (io) {
            io.emit('excel_synced', excelResult);
          }
          console.log(`✅ SQLite/frontend actualizados; Excel sincronizado: ${excelResult.punto} ${excelResult.periodo} -> ${excelResult.celda}`);
        } catch (excelError) {
          console.error('❌ Error sincronizando Excel desde checklist:', excelError.message);
          db.prepare('INSERT INTO sync_log (syncType, status, details) VALUES (?, ?, ?)')
            .run('EXCEL_WEBHOOK', 'ERROR', JSON.stringify({ error: excelError.message, checkItem: checkItem.name, card: cardData.name }));
          if (io) {
            io.emit('excel_sync_error', { error: excelError.message, checkItem: checkItem.name, card: cardData.name });
          }
        }
        break;
      }
      case 'deleteCard': {
        const stmt = db.prepare('UPDATE tarjetas SET closed = 1 WHERE id = ?');
        stmt.run(cardId);

        if (io) {
          io.emit('card_deleted', { id: cardId });
        }
        break;
      }

      default:
        console.log(`⚠️ Tipo de acción de webhook no manejada específicamente: ${action.type}`);
    }

    res.status(200).send('Webhook procesado correctamente');
  } catch (error) {
    console.error('❌ Error procesando el webhook:', error);
    
    const logStmt = db.prepare('INSERT INTO sync_log (syncType, status, details) VALUES (?, ?, ?)');
    logStmt.run('WEBHOOK', 'ERROR', error.message);
    
    res.status(500).send('Error interno procesando webhook');
  }
};





