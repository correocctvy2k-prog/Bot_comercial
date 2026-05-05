const express = require('express');
const router = express.Router();
const monitoringController = require('../controllers/monitoring.controller');

// Subir datos (desde PowerShell)
router.post('/api/monitoring/upload', monitoringController.uploadMonitoringData);

// Consultar últimos datos (para el CRM)
router.get('/api/monitoring/latest/:service', monitoringController.getLatestStatus);

// Consultar historial
router.get('/api/monitoring/history/:service', monitoringController.getHistory);

// Obtener reporte HTML
router.get('/api/monitoring/html/:service/:filename', monitoringController.getReportHtml);

// Eliminar historial
router.delete('/api/monitoring/history/:service/:filename', monitoringController.deleteHistory);

module.exports = router;
