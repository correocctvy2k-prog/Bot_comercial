// src/utils/whatsappWebhook.js
const env = require('../config/env');

function verifyWebhook(req, res) {
    const mode = req.query['hub.mode'];
    const token = req.query['hub.verify_token'];
    const challenge = req.query['hub.challenge'];

    if (mode === 'subscribe' && token === env.verifyToken) {
        console.log('[Webhook] Verificado con éxito');
        res.status(200).send(challenge);
    } else {
        res.sendStatus(403);
    }
}

async function processWebhook(req, res, handler) {
    res.status(200).send('EVENT_RECEIVED');
    const entry = req.body.entry?.[0];
    const changes = entry?.changes?.[0];
    const value = changes?.value;
    const messages = value?.messages;

    if (messages && messages.length > 0) {
        for (const msg of messages) {
            await handler(msg);
        }
    }
}

module.exports = { verifyWebhook, processWebhook };
