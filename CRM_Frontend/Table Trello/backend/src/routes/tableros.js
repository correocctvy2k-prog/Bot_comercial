const express = require('express');
const router = express.Router();
const tablerosController = require('../controllers/tableros.controller');

// Rutas de Workspaces / Organizaciones
router.get('/organizaciones', tablerosController.getOrganizaciones);

// Rutas de Tableros
router.get('/', tablerosController.getTableros);
router.get('/:id/listas', tablerosController.getListas);

// Rutas de Tarjetas
router.get('/listas/:id/tarjetas', tablerosController.getTarjetas);
router.post('/tarjetas', tablerosController.crearTarjeta);
router.put('/tarjetas/:id', tablerosController.actualizarTarjeta);
router.put('/tarjetas/:id/mover', tablerosController.moverTarjeta);
router.delete('/tarjetas/:id', tablerosController.eliminarTarjeta);

// Rutas de Checklists
router.post('/tarjetas/:id/checklists', tablerosController.crearChecklist);
router.post('/checklists/:id/items', tablerosController.crearCheckItem);
router.put('/tarjetas/:cardId/checkitems/:checkItemId', tablerosController.actualizarCheckItem);

module.exports = router;
