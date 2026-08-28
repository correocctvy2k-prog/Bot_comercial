const express = require('express');
const router = express.Router();
const excelController = require('../controllers/excel.controller');

router.post('/marcar', excelController.marcarMantenimiento);
router.post('/abrir', excelController.abrirArchivo);
router.get('/resumen', excelController.getResumen);
router.get('/puntos', excelController.getPuntos);
router.get('/puntos/:zona', excelController.getPuntos);
router.get('/historial', excelController.getHistorial);
router.get('/periodo', excelController.getPeriodo);

module.exports = router;

