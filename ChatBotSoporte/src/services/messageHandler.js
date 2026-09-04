// src/services/messageHandler.js
const { sendToWhatsApp } = require('./httpRequest/sendToWhatsApp');
const { getAiResponse } = require('./openAiService');
const { logInteraction } = require('./dbService');

async function handleIncomingMessage(msg) {
    const from = msg.from;
    const body = msg.text?.body || '';

    console.log(`[MessageHandler] Mensaje recibido de ${from}: "${body}"`);

    const aiReply = await getAiResponse(body);
    await sendToWhatsApp(from, aiReply);

    await logInteraction({
        phone: from,
        user_message: body,
        bot_response: aiReply,
        channel: 'whatsapp',
        timestamp: new Date().toISOString()
    });
}

module.exports = { handleIncomingMessage };
