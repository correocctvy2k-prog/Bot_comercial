const { TELEGRAM_BOT_TOKEN } = process.env;

function assertConfig() {
    if (!TELEGRAM_BOT_TOKEN) {
        throw new Error("Falta TELEGRAM_BOT_TOKEN en .env");
    }
}

async function tgPost(method, payload) {
    assertConfig();
    // DEBUG Logger
    const maskedToken = TELEGRAM_BOT_TOKEN
        ? (TELEGRAM_BOT_TOKEN.slice(0, 5) + "..." + TELEGRAM_BOT_TOKEN.slice(-5))
        : "UNDEFINED";

    const url = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/${method}`;

    try {
        const resp = await fetch(url, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload)
        });

        // Si la respuesta es JSON, leerla. Si no (ej: 404 html de nginx), texto.
        const text = await resp.text();
        let data = {};
        try { data = JSON.parse(text); } catch (e) { data = { raw: text }; }

        if (!resp.ok || !data.ok) {
            console.error(`❌ Telegram API Error [${method}]:`, JSON.stringify(data));
            console.error(`   URL Intentada: https://api.telegram.org/bot${maskedToken}/${method}`);
            return { ok: false, data };
        }

        console.log(`✅ Telegram Success [${method}]`);
        return { ok: true, data };

    } catch (err) {
        console.error("❌ Telegram fetch error:", err);
        return { ok: false, error: err.message };
    }
}

async function sendText(chatId, text) {
    return tgPost("sendMessage", {
        chat_id: chatId,
        text: text,
        parse_mode: "Markdown"
    });
}

async function sendButtons(chatId, text, buttons) {
    const inlineFn = (buttons || []).map(b => {
        // ✅ Soporte híbrido: estructura WhatsApp (b.reply.title) o simple (b.title)
        const title = b.reply?.title || b.title || "Button";
        const id = b.reply?.id || b.id || "NO_ID";
        return {
            text: title,
            callback_data: id
        };
    });

    return tgPost("sendMessage", {
        chat_id: chatId,
        text: text,
        reply_markup: {
            inline_keyboard: [inlineFn]
        }
    });
}

async function sendList(chatId, bodyText, buttonText, sections) {
    const keyb = [];
    (sections || []).forEach(section => {
        (section.rows || []).forEach(row => {
            keyb.push([{
                text: `${row.title}`,
                callback_data: row.id
            }]);
        });
    });

    return tgPost("sendMessage", {
        chat_id: chatId,
        text: bodyText + `\n\n👇 *${buttonText}*`,
        parse_mode: "Markdown",
        reply_markup: {
            inline_keyboard: keyb
        }
    });
}

function chunkText(text, maxLen = 4000) {
    return [text.slice(0, 4000)];
}

async function sendTextChunked(to, text) {
    return sendText(to, text);
}

async function sendTextMany(to, messages) {
    for (const msg of messages) {
        await sendText(to, msg);
    }
    return { ok: true };
}

async function sendPhoto(chatId, imagePath, caption) {
    assertConfig();
    const fs = require('fs');
    const path = require('path');

    // DEBUG Logger
    const maskedToken = TELEGRAM_BOT_TOKEN
        ? (TELEGRAM_BOT_TOKEN.slice(0, 5) + "..." + TELEGRAM_BOT_TOKEN.slice(-5))
        : "UNDEFINED";

    const url = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendPhoto`;

    try {
        if (!fs.existsSync(imagePath)) {
            throw new Error(`File not found: ${imagePath}`);
        }

        const formData = new FormData();
        formData.append("chat_id", chatId);
        if (caption) formData.append("caption", caption);
        formData.append("parse_mode", "Markdown");

        // Leer archivo y adjuntar
        const fileBuffer = fs.readFileSync(imagePath);
        const blob = new Blob([fileBuffer]);
        const filename = path.basename(imagePath);
        formData.append("photo", blob, filename);

        const resp = await fetch(url, {
            method: "POST",
            body: formData
        });

        // Respuesta
        const text = await resp.text();
        let data = {};
        try { data = JSON.parse(text); } catch (e) { data = { raw: text }; }

        if (!resp.ok || !data.ok) {
            console.error(`❌ Telegram sendPhoto Error:`, JSON.stringify(data));
            return { ok: false, data };
        }

        console.log(`✅ Telegram Success [sendPhoto]`);
        return { ok: true, data };

    } catch (err) {
        console.error("❌ Telegram sendPhoto error:", err);
        return { ok: false, error: err.message };
    }
}

module.exports = {
    sendText,
    sendButtons,
    sendList,
    sendTextChunked,
    sendTextMany,
    sendPhoto,
    chunkText
};
