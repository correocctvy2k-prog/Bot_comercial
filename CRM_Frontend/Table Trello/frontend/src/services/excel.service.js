import axios from 'axios';

const API_URL = `${import.meta.env.VITE_API_URL || 'http://localhost:3003'}/api/excel`;

const apiClient = axios.create({
  baseURL: API_URL,
  headers: { 'Content-Type': 'application/json' }
});

export const excelService = {
  async getResumen() {
    const response = await apiClient.get('/resumen');
    return response.data;
  },

  async getHistorial(limite = 10) {
    const response = await apiClient.get('/historial', { params: { limite } });
    return response.data;
  },

  async marcarMantenimiento(data) {
    const response = await apiClient.post('/marcar', data);
    return response.data;
  },

  async abrirArchivo() {
    const response = await apiClient.post('/abrir');
    return response.data;
  }
};

