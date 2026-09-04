import axios from 'axios';

const API_URL = `${import.meta.env.VITE_API_URL || 'http://localhost:3003'}/api/tableros`;

const apiClient = axios.create({
  baseURL: API_URL,
  headers: {
    'Content-Type': 'application/json'
  }
});

export const trelloService = {
  // Obtener workspaces / organizaciones
  async getOrganizaciones() {
    const response = await apiClient.get('/organizaciones');
    return response.data;
  },

  // Obtener todos los tableros (opcionalmente filtrados por workspace)
  async getTableros(idOrg = null) {
    const response = await apiClient.get('/', { params: idOrg ? { idOrg } : {} });
    return response.data;
  },

  // Obtener las listas de un tablero
  async getListas(boardId) {
    const response = await apiClient.get(`/${boardId}/listas`);
    return response.data;
  },

  // Obtener tarjetas de una lista (incluye cover, badges, members)
  async getTarjetas(listId) {
    const response = await apiClient.get(`/listas/${listId}/tarjetas`);
    return response.data;
  },

  // Crear una tarjeta
  async crearTarjeta({ name, desc, idList, due }) {
    const response = await apiClient.post('/tarjetas', { name, desc, idList, due });
    return response.data;
  },

  // Actualizar una tarjeta
  async actualizarTarjeta(cardId, { name, desc, due }) {
    const response = await apiClient.put(`/tarjetas/${cardId}`, { name, desc, due });
    return response.data;
  },

  // Mover tarjeta a otra lista
  async moverTarjeta(cardId, idList) {
    const response = await apiClient.put(`/tarjetas/${cardId}/mover`, { idList });
    return response.data;
  },

  // Archivar/eliminar tarjeta
  async eliminarTarjeta(cardId) {
    const response = await apiClient.delete(`/tarjetas/${cardId}`);
    return response.data;
  },

  // Crear checklist en una tarjeta
  async crearChecklist(cardId, name = 'Checklist') {
    const response = await apiClient.post(`/tarjetas/${cardId}/checklists`, { name });
    return response.data;
  },

  // Agregar item a un checklist
  async crearCheckItem(checklistId, { name, cardId }) {
    const response = await apiClient.post(`/checklists/${checklistId}/items`, { name, cardId });
    return response.data;
  },

  // Cambiar estado de item de checklist
  async actualizarCheckItem(cardId, checkItemId, state) {
    const response = await apiClient.put(`/tarjetas/${cardId}/checkitems/${checkItemId}`, { state });
    return response.data;
  }
};