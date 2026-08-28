const axios = require('axios');
const config = require('../config/trello');
const db = require('../db/init');
const { syncCompletedCheckItemsFromFetchedCard } = require('./maintenanceSync.service');

class TrelloService {
  constructor() {
    this.apiKey = config.apiKey;
    this.token = config.token;
    this.baseUrl = config.baseUrl;
  }

  // Generar params básicos con credenciales
  getAuthParams() {
    return {
      key: this.apiKey,
      token: this.token
    };
  }

  // Obtener organizaciones / espacios de trabajo
  async getOrganizaciones() {
    const response = await axios.get(`${this.baseUrl}/members/me/organizations`, {
      params: { ...this.getAuthParams(), fields: 'id,displayName,name,logoHash' }
    });
    return response.data;
  }

  // Obtener tableros (opcionalmente filtrados por workspace)
  async getTableros(idOrg = null) {
    try {
      const url = idOrg
        ? `${this.baseUrl}/organizations/${idOrg}/boards`
        : `${this.baseUrl}/members/me/boards`;

      const response = await axios.get(url, {
        params: { ...this.getAuthParams(), filter: 'open', fields: 'id,name,url,idOrganization,prefs,closed' }
      });

      const tableros = response.data;

      // Actualizar caché de SQLite en segundo plano
      const insert = db.prepare('INSERT OR REPLACE INTO tableros (id, name, url, closed) VALUES (?, ?, ?, ?)');
      db.exec('BEGIN TRANSACTION');
      try {
        for (const board of tableros) {
          insert.run(board.id, board.name, board.url, board.closed ? 1 : 0);
        }
        db.exec('COMMIT');
      } catch (err) {
        db.exec('ROLLBACK');
        throw err;
      }

      return tableros;
    } catch (error) {
      console.error('⚠️ Error cargando tableros de Trello. Intentando desde caché SQLite...', error.message);
      // Fallback a SQLite
      const stmt = db.prepare('SELECT * FROM tableros WHERE closed = 0');
      const rows = stmt.all();
      return rows.map(r => ({ id: r.id, name: r.name, url: r.url, closed: !!r.closed }));
    }
  }

  // Obtener listas de un tablero
  async getListas(boardId) {
    try {
      const response = await axios.get(`${this.baseUrl}/boards/${boardId}/lists`, {
        params: this.getAuthParams()
      });

      const listas = response.data;

      // Actualizar caché de SQLite en segundo plano
      const insert = db.prepare('INSERT OR REPLACE INTO listas (id, name, idBoard, pos, closed) VALUES (?, ?, ?, ?, ?)');
      db.exec('BEGIN TRANSACTION');
      try {
        for (const list of listas) {
          insert.run(list.id, list.name, list.idBoard, list.pos, list.closed ? 1 : 0);
        }
        db.exec('COMMIT');
      } catch (err) {
        db.exec('ROLLBACK');
        throw err;
      }

      return listas;
    } catch (error) {
      console.error(`⚠️ Error cargando listas de tablero ${boardId}. Intentando desde caché SQLite...`, error.message);
      // Fallback a SQLite
      const stmt = db.prepare('SELECT * FROM listas WHERE idBoard = ? AND closed = 0 ORDER BY pos ASC');
      const rows = stmt.all(boardId);
      return rows.map(r => ({ id: r.id, name: r.name, idBoard: r.idBoard, pos: r.pos, closed: !!r.closed }));
    }
  }

  // Obtener tarjetas de una lista (con cover, badges, members y checklists inline)
  async getTarjetas(listId) {
    try {
      const response = await axios.get(`${this.baseUrl}/lists/${listId}/cards`, {
        params: {
          ...this.getAuthParams(),
          cover: true,
          attachments: 'cover',         // Obtiene el adjunto que es la portada (con URL directa de S3)
          attachment_fields: 'id,url,previews,mimeType,name',
          members: true,
          member_fields: 'id,fullName,avatarHash,username,initials',
          checklists: 'all',             // Obtiene los checklists e ítems individuales
          fields: 'id,name,desc,idList,idBoard,due,dueComplete,closed,labels,idMembers,cover,badges,subscribed'
        }
      });

      const tarjetas = response.data;

      // Actualizar caché de SQLite (incluyendo cover, attachments y checklists)
      const insert = db.prepare(`
        INSERT OR REPLACE INTO tarjetas (id, name, desc, idList, idBoard, due, closed, labels, members, cover, attachments, checklists) 
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);
      const listRow = db.prepare('SELECT * FROM listas WHERE id = ?').get(listId);
      const shouldSyncExcel = /\b2026\b/.test(listRow?.name || '');
      const previousCards = new Map(
        db.prepare('SELECT * FROM tarjetas WHERE idList = ? AND closed = 0').all(listId).map((card) => [card.id, card])
      );

      if (shouldSyncExcel) {
        for (const card of tarjetas) {
          await syncCompletedCheckItemsFromFetchedCard(card, previousCards.get(card.id), 'trello_refresh');
        }
      }

      db.exec('BEGIN TRANSACTION');
      try {
        for (const card of tarjetas) {
          insert.run(
            card.id,
            card.name,
            card.desc || '',
            card.idList,
            card.idBoard,
            card.due || null,
            card.closed ? 1 : 0,
            JSON.stringify(card.labels || []),
            JSON.stringify(card.idMembers || []),
            JSON.stringify(card.cover || null),
            JSON.stringify(card.attachments || []),
            JSON.stringify(card.checklists || [])
          );
        }
        db.exec('COMMIT');
      } catch (err) {
        db.exec('ROLLBACK');
        throw err;
      }

      return tarjetas.map(card => ({
        ...card,
        labels: card.labels || [],
        idMembers: card.idMembers || [],
        members: card.members || [],
        attachments: card.attachments || [],   // Adjunto de portada (URL directa S3)
        cover: card.cover || null,
        badges: card.badges || {},
        checklists: card.checklists || []      // checklists de Trello
      }));
    } catch (error) {
      console.error(`⚠️ Error cargando tarjetas de lista ${listId}. Intentando desde caché SQLite...`, error.message);
      // Fallback a SQLite
      const stmt = db.prepare('SELECT * FROM tarjetas WHERE idList = ? AND closed = 0');
      const rows = stmt.all(listId);
      return rows.map(r => ({
        id: r.id,
        name: r.name,
        desc: r.desc,
        idList: r.idList,
        idBoard: r.idBoard,
        due: r.due,
        closed: !!r.closed,
        labels: JSON.parse(r.labels || '[]'),
        idMembers: JSON.parse(r.members || '[]'),
        cover: JSON.parse(r.cover || 'null'),
        attachments: JSON.parse(r.attachments || '[]'),
        checklists: JSON.parse(r.checklists || '[]'),
        members: [] // Evitar crash si no hay members guardados inline
      }));
    }
  }

  // Crear tarjeta
  async crearTarjeta(data) {
    const { name, desc, idList, due } = data;
    try {
      const response = await axios.post(`${this.baseUrl}/cards`, null, {
        params: {
          ...this.getAuthParams(),
          name,
          desc,
          idList,
          due
        }
      });

      const card = response.data;

      // Guardar en SQLite
      const stmt = db.prepare(`
        INSERT INTO tarjetas (id, name, desc, idList, idBoard, due, closed, labels, members)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);
      stmt.run(
        card.id,
        card.name,
        card.desc || '',
        card.idList,
        card.idBoard,
        card.due || null,
        card.closed ? 1 : 0,
        JSON.stringify(card.labels || []),
        JSON.stringify(card.idMembers || [])
      );

      // Registrar en historial de cambios
      const histStmt = db.prepare('INSERT INTO historial_cambios (cardId, actionType, newValue) VALUES (?, ?, ?)');
      histStmt.run(card.id, 'CREATE', JSON.stringify({ name: card.name, idList: card.idList }));

      return card;
    } catch (error) {
      console.error('❌ Error creando tarjeta en Trello:', error.message);
      throw error;
    }
  }

  // Actualizar tarjeta (nombre, descripción, due)
  async actualizarTarjeta(cardId, data) {
    const { name, desc, due } = data;
    try {
      const response = await axios.put(`${this.baseUrl}/cards/${cardId}`, null, {
        params: {
          ...this.getAuthParams(),
          name,
          desc,
          due
        }
      });

      const card = response.data;

      // Obtener el valor viejo de la base de datos para el historial
      const oldStmt = db.prepare('SELECT * FROM tarjetas WHERE id = ?').get(cardId);

      // Actualizar en SQLite
      const stmt = db.prepare(`
        UPDATE tarjetas 
        SET name = ?, desc = ?, due = ?, labels = ?, members = ?
        WHERE id = ?
      `);
      stmt.run(
        card.name,
        card.desc || '',
        card.due || null,
        JSON.stringify(card.labels || []),
        JSON.stringify(card.idMembers || []),
        cardId
      );

      // Registrar historial
      if (oldStmt) {
        const histStmt = db.prepare('INSERT INTO historial_cambios (cardId, actionType, field, oldValue, newValue) VALUES (?, ?, ?, ?, ?)');
        if (oldStmt.name !== card.name) {
          histStmt.run(cardId, 'UPDATE', 'name', oldStmt.name, card.name);
        }
        if (oldStmt.desc !== card.desc) {
          histStmt.run(cardId, 'UPDATE', 'desc', oldStmt.desc, card.desc);
        }
        if (oldStmt.due !== card.due) {
          histStmt.run(cardId, 'UPDATE', 'due', oldStmt.due, card.due);
        }
      }

      return card;
    } catch (error) {
      console.error(`❌ Error actualizando tarjeta ${cardId} en Trello:`, error.message);
      throw error;
    }
  }

  // Mover tarjeta de lista
  async moverTarjeta(cardId, idList) {
    try {
      const response = await axios.put(`${this.baseUrl}/cards/${cardId}`, null, {
        params: {
          ...this.getAuthParams(),
          idList
        }
      });

      const card = response.data;

      const oldStmt = db.prepare('SELECT idList FROM tarjetas WHERE id = ?').get(cardId);

      // Actualizar en SQLite
      const stmt = db.prepare('UPDATE tarjetas SET idList = ? WHERE id = ?');
      stmt.run(idList, cardId);

      // Registrar en historial
      if (oldStmt && oldStmt.idList !== idList) {
        const histStmt = db.prepare('INSERT INTO historial_cambios (cardId, actionType, field, oldValue, newValue) VALUES (?, ?, ?, ?, ?)');
        histStmt.run(cardId, 'MOVE', 'idList', oldStmt.idList, idList);
      }

      return card;
    } catch (error) {
      console.error(`❌ Error al mover tarjeta ${cardId} en Trello:`, error.message);
      throw error;
    }
  }

  // Eliminar/Archivar tarjeta
  async eliminarTarjeta(cardId) {
    try {
      // Trello maneja "eliminar" o "archivar" (closed=true)
      const response = await axios.put(`${this.baseUrl}/cards/${cardId}`, null, {
        params: {
          ...this.getAuthParams(),
          closed: true
        }
      });

      const card = response.data;

      // Actualizar en SQLite (eliminar o cambiar estado closed)
      const stmt = db.prepare('UPDATE tarjetas SET closed = 1 WHERE id = ?');
      stmt.run(cardId);

      // Registrar historial
      const histStmt = db.prepare('INSERT INTO historial_cambios (cardId, actionType) VALUES (?, ?)');
      histStmt.run(cardId, 'DELETE');

      return { id: cardId, archived: true };
    } catch (error) {
      console.error(`❌ Error al archivar tarjeta ${cardId} en Trello:`, error.message);
      throw error;
    }
  }
  // Crear checklist en una tarjeta
  async crearChecklist(cardId, name = 'Checklist') {
    try {
      const response = await axios.post(`${this.baseUrl}/cards/${cardId}/checklists`, null, {
        params: {
          ...this.getAuthParams(),
          name
        }
      });

      return response.data;
    } catch (error) {
      console.error(`❌ Error creando checklist en tarjeta ${cardId}:`, error.message);
      throw error;
    }
  }

  // Agregar item a un checklist
  async crearCheckItem(checklistId, name) {
    try {
      const response = await axios.post(`${this.baseUrl}/checklists/${checklistId}/checkItems`, null, {
        params: {
          ...this.getAuthParams(),
          name,
          checked: false
        }
      });

      return response.data;
    } catch (error) {
      console.error(`❌ Error creando item en checklist ${checklistId}:`, error.message);
      throw error;
    }
  }

  // Marcar item de checklist como completo/incompleto
  async actualizarCheckItem(cardId, checkItemId, state) {
    try {
      const response = await axios.put(`${this.baseUrl}/cards/${cardId}/checkItem/${checkItemId}`, null, {
        params: {
          ...this.getAuthParams(),
          state
        }
      });

      return response.data;
    } catch (error) {
      console.error(`❌ Error actualizando item ${checkItemId} en tarjeta ${cardId}:`, error.message);
      throw error;
    }
  }
}

module.exports = new TrelloService();
