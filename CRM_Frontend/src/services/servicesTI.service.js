const API_URL = import.meta.env.VITE_SERVICES_TI_BACKEND_URL || 'http://localhost:3003';

export const servicesTIService = {
    /**
     * Obtiene el estado general del dashboard (servidores, métricas de cada uno, alertas)
     */
    async getDashboardState() {
        try {
            const response = await fetch(`${API_URL}/api/state`);
            if (!response.ok) throw new Error('Error al obtener el estado de servicios TI');
            return await response.json();
        } catch (error) {
            console.error('[SERVICES TI SERVICE] Error en getDashboardState:', error);
            throw error;
        }
    },

    /**
     * Obtiene el análisis avanzado de recursos e infraestructura
     */
    async getAnalysis() {
        try {
            const response = await fetch(`${API_URL}/api/analysis`);
            if (!response.ok) throw new Error('Error al obtener el análisis de servicios TI');
            return await response.json();
        } catch (error) {
            console.error('[SERVICES TI SERVICE] Error en getAnalysis:', error);
            throw error;
        }
    },

    /**
     * Fuerza un barrido de chequeo manual inmediato
     */
    async triggerSweep() {
        try {
            const response = await fetch(`${API_URL}/api/sweep`, { method: 'POST' });
            if (!response.ok) throw new Error('Error al iniciar el barrido de servicios TI');
            return await response.json();
        } catch (error) {
            console.error('[SERVICES TI SERVICE] Error en triggerSweep:', error);
            throw error;
        }
    },

    /**
     * Crea un nuevo servidor objetivo de monitoreo
     */
    async createTarget(payload) {
        try {
            const response = await fetch(`${API_URL}/api/targets`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
            if (!response.ok) {
                const body = await response.json().catch(() => ({}));
                throw new Error(body.error || 'Error al crear el servidor');
            }
            return await response.json();
        } catch (error) {
            console.error('[SERVICES TI SERVICE] Error en createTarget:', error);
            throw error;
        }
    },

    /**
     * Actualiza los datos de un servidor
     */
    async updateTarget(id, payload) {
        try {
            const response = await fetch(`${API_URL}/api/targets/${id}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
            if (!response.ok) {
                const body = await response.json().catch(() => ({}));
                throw new Error(body.error || 'Error al actualizar el servidor');
            }
            return await response.json();
        } catch (error) {
            console.error('[SERVICES TI SERVICE] Error en updateTarget:', error);
            throw error;
        }
    },

    /**
     * Elimina un servidor del monitoreo
     */
    async deleteTarget(id) {
        try {
            const response = await fetch(`${API_URL}/api/targets/${id}`, {
                method: 'DELETE'
            });
            if (!response.ok) throw new Error('Error al eliminar el servidor');
            return await response.json();
        } catch (error) {
            console.error('[SERVICES TI SERVICE] Error en deleteTarget:', error);
            throw error;
        }
    }
};
