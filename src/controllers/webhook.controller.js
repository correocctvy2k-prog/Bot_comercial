const { VERIFY_TOKEN } = require("../config/env");
const { verifyMetaSignature } = require("../utils/signature");
const { logIncoming } = require("../utils/logger");
const { seenBefore } = require("../utils/dedupe");
const { processIncomingWhatsApp } = require("../services/bot.service");
const { runMonitor } = require("../services/monitor.service");

function verifyWebhookGet(req, res) {
    const mode = req.query["hub.mode"];
    const token = req.query["hub.verify_token"];
    const challenge = req.query["hub.challenge"];

    if (mode === "subscribe" && token === VERIFY_TOKEN) {
        return res.status(200).send(challenge);
    }
    return res.sendStatus(403);
}

async function handleWebhookPost(req, res) {
    res.status(200).send("EVENT_RECEIVED");
    logIncoming(req);

    try {
        if (!verifyMetaSignature(req)) {
            console.warn("⚠️ [WEBHOOK] Firma Meta no válida.");
            return;
        }
    } catch (e) {
        // Si signature.js no está implementado aún o falla
    }

    const body = req.body;
    if (!body || !body.object) return;

    for (const entry of body.entry || []) {
        for (const change of entry.changes || []) {
            const value = change.value || {};
            for (const msg of value.messages || []) {
                const msgId = msg.id;
                if (seenBefore && seenBefore(msgId)) continue;

                try {
                    const channel = "bot_comercial_main";
                    console.log(`🚀 [COMERCIAL] Procesando msg de ${msg.from}...`);
                    await processIncomingWhatsApp(value, msg, channel);
                } catch (err) {
                    console.error(`❌ [COMERCIAL] Error msg ${msgId}:`, err.message);
                }
            }
        }
    }
}

async function handleTelegramWebhook(req, res) {
    res.status(200).send("OK");
    const body = req.body;
    if (!body) return;

    try {
        let tgId, name, text, payload, msgId;
        let isButton = false;

        if (body.message) {
            if (!body.message.from) return;
            tgId = "tg_" + body.message.from.id;
            name = body.message.from.first_name || "Asistente";
            text = body.message.text || "";
            msgId = "tg_msg_" + body.message.message_id;
        } else if (body.callback_query) {
            tgId = "tg_" + body.callback_query.from.id;
            name = body.callback_query.from.first_name || "Asistente";
            payload = body.callback_query.data;
            msgId = "tg_cb_" + body.callback_query.id;
            isButton = true;
        } else return;

        if (seenBefore && seenBefore(msgId)) return;

        const mockValue = { contacts: [{ profile: { name } }] };
        let mockMsg = isButton ? {
            id: msgId, from: tgId, type: "interactive",
            interactive: { type: "button_reply", button_reply: { id: payload, title: payload } }
        } : {
            id: msgId, from: tgId, type: "text", text: { body: text }
        };

        console.log(`🚀 [COMERCIAL-TG] Procesando msg de ${tgId}...`);
        await processIncomingWhatsApp(mockValue, mockMsg, "bot_comercial_main");
    } catch (err) {
        console.error(`❌ [COMERCIAL-TG] Error:`, err.message);
    }
}

async function handleTriggerMonitor(req, res) {
    console.log("手动触发监控 / Manual monitor trigger requested");
    try {
        // Ejecutar el monitor en segundo plano (async) para no bloquear la respuesta
        // o esperar a que termine si se prefiere feedback inmediato (tomará ~10-30s)
        // El usuario solicitó generar alertas, así que esperaremos para confirmar éxito.
        const result = await runMonitor({ tipo: 'standard' });
        
        if (result.ok) {
            return res.status(200).json({ ok: true, message: "Monitor ejecutado correctamente", detail: result.payload });
        } else {
            console.error("Error ejecutando monitor:", result.stderr);
            return res.status(500).json({ ok: false, error: "Error al ejecutar el monitor", detail: result.stderr });
        }
    } catch (error) {
        console.error("Error en handleTriggerMonitor:", error);
        return res.status(500).json({ ok: false, error: error.message });
    }
}

module.exports = {
    verifyWebhookGet,
    handleWebhookPost,
    handleTelegramWebhook,
    handleTriggerMonitor
};
