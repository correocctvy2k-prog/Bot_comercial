// c:\Bot_comercial-main\ChatBotSoporte\server.js
const express = require('express');
const cors = require('cors');
const path = require('path');
const dotenv = require('dotenv');
dotenv.config();

const { verifyWebhook, processWebhook } = require('./src/utils/whatsappWebhook');
const { handleIncomingMessage } = require('./src/services/messageHandler');

const app = express();
app.use(cors({
    origin: function (origin, callback) {
        callback(null, true);
    },
    credentials: true
}));

// Mock endpoints para la sesión del CRM
app.post('/api/crm-session', (req, res) => {
    res.json({ ok: true });
});

app.get('/api/session', (req, res) => {
    res.json({ ok: true });
});
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

const PORT = process.env.PORT || 3004;

// Healthcheck
app.get('/health', (req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// WhatsApp Webhook Verification
app.get('/webhook', (req, res) => {
    verifyWebhook(req, res);
});

// WhatsApp Webhook Incoming Events
app.post('/webhook', async (req, res) => {
    try {
        await processWebhook(req, res, handleIncomingMessage);
    } catch (err) {
        console.error('[Server] Error procesando webhook:', err);
        res.sendStatus(500);
    }
});

app.listen(PORT, () => {
    console.log(`[ChatBotSoporte] Servidor corriendo en puerto ${PORT}`);
});
