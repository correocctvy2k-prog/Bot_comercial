const API_URL = import.meta.env.VITE_MONITORING_BACKEND_URL || 'http://localhost:3001';

export const monitoringService = {
    /**
     * Obtiene el último estado de un servicio (AD, KSC, ZK)
     */
    async getLatestStatus(service) {
        try {
            const response = await fetch(`${API_URL}/api/monitoring/latest/${service}`);
            if (!response.ok) {
                if (response.status === 404) return null;
                throw new Error('Error al obtener el monitoreo');
            }
            return await response.json();
        } catch (error) {
            console.error(`[MONITORING SERVICE] Error en ${service}:`, error);
            return null;
        }
    },

    /**
     * Obtiene la lista de reportes históricos
     */
    async getHistory(service) {
        try {
            const response = await fetch(`${API_URL}/api/monitoring/history/${service}`, { cache: 'no-store' });
            if (!response.ok) return { files: [] };
            return await response.json();
        } catch (error) {
            console.error(`[MONITORING SERVICE] Error en historial ${service}:`, error);
            return { files: [] };
        }
    },

    /**
     * Retorna la URL para ver el reporte HTML
     */
    getReportHtmlUrl(service, filename = 'latest') {
        return `${API_URL}/api/monitoring/html/${service}/${filename}`;
    },

    /**
     * Elimina un reporte del historial
     */
    async deleteHistory(service, filename) {
        try {
            const response = await fetch(`${API_URL}/api/monitoring/history/${service}/${filename}`, {
                method: 'DELETE',
                cache: 'no-store'
            });
            return response.ok;
        } catch (error) {
            console.error(`[MONITORING SERVICE] Error al eliminar ${filename}:`, error);
            return false;
        }
    }
};
