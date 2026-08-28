const express = require('express');
const router = express.Router();
const webhooksController = require('../controllers/webhooks.controller');

// Trello requiere que respondamos HEAD a la misma ruta del webhook al crearse
router.head('/trello', webhooksController.validarWebhook);
router.post('/trello', webhooksController.procesarWebhook);

module.exports = router;
