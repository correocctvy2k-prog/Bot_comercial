const wa = require("./whatsapp.service");
const tg = require("./telegram.service");

function isTelegram(id) {
    return String(id).startsWith("tg_");
}

function normalizeId(id) {
    if (isTelegram(id)) return String(id).replace("tg_", "");
    return id;
}

// Fachada compatible con whatsapp.service.js
module.exports = {
    sendText: (to, text) => {
        console.log(`📡 Router sendText: ${to}`);
        return isTelegram(to) ? tg.sendText(normalizeId(to), text) : wa.sendText(to, text);
    },

    sendButtons: (to, body, buttons) => {
        console.log(`📡 Router sendButtons: ${to}`);
        return isTelegram(to) ? tg.sendButtons(normalizeId(to), body, buttons) : wa.sendButtons(to, body, buttons);
    },

    sendList: (to, body, btn, sections) =>
        isTelegram(to) ? tg.sendList(normalizeId(to), body, btn, sections) : wa.sendList(to, body, btn, sections),

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
