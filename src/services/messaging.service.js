const wa = require("./whatsapp.service");
const tg = require("./telegram.service");
// const { logInteraction } = require("./logger.service"); // ✅ CRM Logger

function isTelegram(id) {
    return String(id).startsWith("tg_");
}

function normalizeId(id) {
    if (isTelegram(id)) return String(id).replace("tg_", "");
    return id;
}

// Fachada compatible con whatsapp.service.js
module.exports = {
    sendText: async (to, text) => {
        console.log(`📡 Router sendText: ${to}`);
        const result = isTelegram(to) ? await tg.sendText(normalizeId(to), text) : await wa.sendText(to, text);

        // CRM Log
        /*
        logInteraction({
            wa_id: to,
            direction: 'OUTGOING',
            type: 'text',
            content: text,
            raw: result
        });
        */
        return result;
    },

    sendButtons: async (to, body, buttons) => {
        console.log(`📡 Router sendButtons: ${to}`);
        const result = isTelegram(to) ? await tg.sendButtons(normalizeId(to), body, buttons) : await wa.sendButtons(to, body, buttons);

        // CRM Log
        /*
        const btnLabels = buttons.map(b => b.reply?.title || b.title).join(", ");
        logInteraction({
            wa_id: to,
            direction: 'OUTGOING',
            type: 'button',
            content: `${body} [${btnLabels}]`,
            raw: result
        });
        */
        return result;
    },

    sendList: async (to, body, btn, sections) => {
        const result = isTelegram(to) ? await tg.sendList(normalizeId(to), body, btn, sections) : await wa.sendList(to, body, btn, sections);

        // CRM Log
        /*
        logInteraction({
            wa_id: to,
            direction: 'OUTGOING',
            type: 'list',
            content: `${body} [List Menu]`,
            raw: result
        });
        */
        return result;
    },

    sendTextChunked: (to, text, opts) =>
        isTelegram(to) ? tg.sendTextChunked(normalizeId(to), text, opts) : wa.sendTextChunked(to, text, opts),

    sendTextMany: (to, msgs, opts) =>
        isTelegram(to) ? tg.sendTextMany(normalizeId(to), msgs, opts) : wa.sendTextMany(to, msgs, opts),

    sendPhoto: (to, imagePath, caption) => {
        if (isTelegram(to)) {
            return tg.sendPhoto(normalizeId(to), imagePath, caption);
        } else {
            console.warn("⚠️ sendPhoto no implementado para WhatsApp aún.");
            return { ok: false, error: "not_implemented_whatsapp" };
        }
    },

    chunkText: wa.chunkText // Reutilizamos lógica de chunking
};
