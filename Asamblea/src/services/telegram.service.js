const { TELEGRAM_BOT_TOKEN } = process.env;

function getUrl(method, options = {}) {
    // 1. Dynamic Token
    if (options.token) {
        return `https://api.telegram.org/bot${options.token}/${method}`;
    }

    // 2. Fallback Static Token
    if (TELEGRAM_BOT_TOKEN) {
        return `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/${method}`;
    }

    throw new Error("No Token provided for Telegram API");
}

async function tgPost(method, payload, options = {}) {
    try {
        const url = getUrl(method, options);

        // DEBUG Logger (Masked)
        // const tokenUsed = options.token || TELEGRAM_BOT_TOKEN || "NONE";
        // const maskedToken = tokenUsed.slice(0, 5) + "...";
        // console.log(`🚀 Telegram Exec [${method}] with token: ${maskedToken} params:`, JSON.stringify(payload).slice(0, 50));

        const resp = await fetch(url, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Connection": "keep-alive"
            },
            body: JSON.stringify(payload)
        });

        // Si la respuesta es JSON, leerla. Si no (ej: 404 html de nginx), texto.
        const text = await resp.text();
        let data = {};
        try { data = JSON.parse(text); } catch (e) { data = { raw: text }; }

        if (!resp.ok || !data.ok) {
            console.error(`❌ Telegram API Error [${method}]:`, JSON.stringify(data));
            return { ok: false, data };
        }

        // console.log(`✅ Telegram Success [${method}]`);
        return { ok: true, data };

    } catch (err) {
        console.error("❌ Telegram fetch error:", err);
        return { ok: false, error: err.message };
    }
}

async function sendText(chatId, text, options = {}) {
    // Humanización: Mostrar "typing" y delay
    if (options.simulateTyping) {
        await sendChatAction(chatId, "typing", options);
        const delay = Math.min(Math.max((text || "").length * 20, 800), 3500);
        await new Promise(r => setTimeout(r, delay));
    }

    return tgPost("sendMessage", {
        chat_id: chatId,
        text: text,
        parse_mode: "Markdown"
    }, options);
}

/**
 * ✅ NUEVO: Enviar Acciones de Chat (typing, upload_photo, etc)
 */
async function sendChatAction(chatId, action = "typing", options = {}) {
    return tgPost("sendChatAction", {
        chat_id: chatId,
        action: action
    }, options);
}

async function sendButtons(chatId, text, buttons, options = {}) {
    const rawButtons = (buttons || []).map(b => {
        // ✅ Soporte híbrido: estructura WhatsApp (b.reply.title) o simple (b.title)
        const title = b.reply?.title || b.title || "Button";
        const id = b.reply?.id || b.id || "NO_ID";
        return {
            text: title,
            callback_data: id
        };
    });

    // Chunk into rows of 2
    const keyboard = [];
    for (let i = 0; i < rawButtons.length; i += 2) {
        keyboard.push(rawButtons.slice(i, i + 2));
    }

    return tgPost("sendMessage", {
        chat_id: chatId,
        text: text,
        reply_markup: {
            inline_keyboard: keyboard
        }
    }, options);
}

async function sendList(chatId, bodyText, buttonText, sections, options = {}) {
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
    }, options);
}

function chunkText(text, maxLen = 4000) {
    return [text.slice(0, 4000)];
}

async function sendTextChunked(to, text, options = {}) {
    return sendText(to, text, options);
}

async function sendTextMany(to, messages, options = {}) {
    for (const msg of messages) {
        await sendText(to, msg, options);
    }
    return { ok: true };
}

async function sendPhoto(chatId, imagePath, caption, options = {}) {
    const url = getUrl("sendPhoto", options);
    const isRemoteUrl = typeof imagePath === 'string' && (imagePath.startsWith('http://') || imagePath.startsWith('https://'));

    try {
        let resp;

        if (isRemoteUrl) {
            // ✅ URL remota: Telegram la descarga directamente (más eficiente)
            const body = {
                chat_id: chatId,
                photo: imagePath,
                parse_mode: "Markdown"
            };
            if (caption) body.caption = caption;

            resp = await fetch(url, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(body)
            });
        } else {
            // 📁 Archivo local: enviar como multipart/form-data
            const fs = require('fs');
            const path = require('path');

            if (!fs.existsSync(imagePath)) {
                throw new Error(`File not found: ${imagePath}`);
            }

            const formData = new FormData();
            formData.append("chat_id", chatId);
            if (caption) formData.append("caption", caption);
            formData.append("parse_mode", "Markdown");

            const fileBuffer = fs.readFileSync(imagePath);
            const blob = new Blob([fileBuffer]);
            const filename = path.basename(imagePath);
            formData.append("photo", blob, filename);

            resp = await fetch(url, { method: "POST", body: formData });
        }

        const text = await resp.text();
        let data = {};
        try { data = JSON.parse(text); } catch (e) { data = { raw: text }; }

        if (!resp.ok || !data.ok) {
            console.error(`❌ Telegram sendPhoto Error:`, JSON.stringify(data));
            return { ok: false, data };
        }

        console.log(`✅ Telegram Success [sendPhoto] ${isRemoteUrl ? '(URL remota)' : '(archivo local)'}`);
        return { ok: true, data };

    } catch (err) {
        console.error("❌ Telegram sendPhoto error:", err.message);
        return { ok: false, error: err.message };
    }
}


async function sendDocument(chatId, docPath, filename, caption, options = {}) {
    const url = getUrl("sendDocument", options);
    const isRemoteUrl = typeof docPath === 'string' && (docPath.startsWith('http://') || docPath.startsWith('https://'));

    try {
        let resp;

        if (isRemoteUrl) {
            const body = {
                chat_id: chatId,
                document: docPath,
                parse_mode: "Markdown"
            };
            if (caption) body.caption = caption;

            resp = await fetch(url, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(body)
            });
        } else {
            const fs = require('fs');
            const path = require('path');

            if (!fs.existsSync(docPath)) {
                throw new Error(`File not found: ${docPath}`);
            }

            const formData = new FormData();
            formData.append("chat_id", chatId);
            if (caption) formData.append("caption", caption);
            formData.append("parse_mode", "Markdown");

            const fileBuffer = fs.readFileSync(docPath);
            const blob = new Blob([fileBuffer]);
            const actualFilename = filename || path.basename(docPath);
            formData.append("document", blob, actualFilename);

            resp = await fetch(url, { method: "POST", body: formData });
        }

        const text = await resp.text();
        let data = {};
        try { data = JSON.parse(text); } catch (e) { data = { raw: text }; }

        if (!resp.ok || !data.ok) {
            console.error(`❌ Telegram sendDocument Error:`, JSON.stringify(data));
            return { ok: false, data };
        }

        return { ok: true, data };

    } catch (err) {
        console.error("❌ Telegram sendDocument error:", err.message);
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
    sendDocument,
    sendReaction: () => ({ ok: true }), // Mock reaction for Telegram
    chunkText
};
