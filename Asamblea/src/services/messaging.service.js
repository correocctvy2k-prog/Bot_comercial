// src/services/messaging.service.js
// v2.1: Router multicanal simplificado con soporte para acciones de chat (Humanización)

const TG = require('./telegram.service');
const WA = require('./whatsapp.service');

/**
 * Determina si el destinatario es Telegram o WhatsApp.
 */
function isTelegram(to) {
    return typeof to === 'string' && to.startsWith('tg_');
}

function tgId(to) {
    return to.replace(/^tg_/, '');
}

// ─── API pública ──────────────────────────────────────────────────────────────

async function sendText(to, text, opts = {}) {
    if (isTelegram(to)) {
        return TG.sendText(tgId(to), text, opts);
    }
    return WA.sendText(to, text, opts);
}

async function sendButtons(to, text, buttons, opts = {}) {
    if (isTelegram(to)) {
        return TG.sendButtons(tgId(to), text, buttons, opts);
    }
    return WA.sendButtons(to, text, buttons, opts);
}

async function sendPhoto(to, imagePath, caption, opts = {}) {
    if (isTelegram(to)) {
        return TG.sendPhoto(tgId(to), imagePath, caption, opts);
    }
    return WA.sendPhoto(to, imagePath, caption, opts);
}

async function sendDocument(to, docPath, filename, caption, opts = {}) {
    if (isTelegram(to)) {
        return TG.sendDocument(tgId(to), docPath, filename, caption, opts);
    }
    return WA.sendDocument(to, docPath, filename, caption, opts);
}

async function sendList(to, bodyText, buttonText, sections, opts = {}) {
    if (isTelegram(to)) {
        return TG.sendList(tgId(to), bodyText, buttonText, sections, opts);
    }
    return WA.sendList(to, bodyText, buttonText, sections, opts);
}

async function sendChatAction(to, action, opts = {}) {
    if (isTelegram(to)) {
        // Telegram soporta sendChatAction nativamente (typing, upload_photo, etc.)
        return TG.sendChatAction ? TG.sendChatAction(tgId(to), action) : { ok: true };
    }
    return WA.sendChatAction(to, action, opts);
}

module.exports = { sendText, sendButtons, sendPhoto, sendDocument, sendList, sendChatAction };
