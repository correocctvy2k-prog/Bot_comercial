// src/services/httpRequest/sendToWhatsApp.js
const axios = require('axios');
const env = require('../../config/env');

async function sendToWhatsApp(to, text) {
    if (!env.whatsappToken || !env.phoneNumberId) {
        console.log(`[SendToWhatsApp - Mock] Para ${to}: "${text}"`);
        return;
    }
    const url = `https://graph.facebook.com/${env.apiVersion}/${env.phoneNumberId}/messages`;
    await axios.post(url, {
        messaging_product: "whatsapp",
        to: to,
        type: "text",
        text: { body: text }
    }, {
        headers: { Authorization: `Bearer ${env.whatsappToken}` }
    });
}

module.exports = { sendToWhatsApp };
