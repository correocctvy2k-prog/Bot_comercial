const wa = require("./whatsapp.service");
const tg = require("./telegram.service");
const configService = require("./config.service");
const { logInteraction } = require("./logger.service");

function isTelegram(id) {
    return String(id).startsWith("tg_");
}

function normalizeId(id) {
    if (isTelegram(id)) return String(id).replace("tg_", "");
    return id;
}

/**
 * Helper to get channel options (Token) dynamically
 */
async function getOptions(channelId) {
    const opts = {};
    if (channelId) {
        const config = await configService.getChannelConfig(channelId);
        // telegram specific
        if (config?.config?.token) {
            opts.token = config.config.token;
        }
        // whatsapp specific
        if (config?.config?.waba_id) {
            opts.waba_id = config.config.waba_id;
        }
        if (config?.config?.phone_number_id) {
            opts.phone_number_id = config.config.phone_number_id;
        }
    }
    return opts;
}

module.exports = {
    sendText: async (to, text, adapterOpts = {}) => {
        console.log(`📡 Router sendText: ${to} (Channel: ${adapterOpts.channelId || 'Default'})`);
        const opts = await getOptions(adapterOpts.channelId);

        const extendedOpts = {
            ...opts,
            simulateTyping: true, // Habilitado globalmente para humanización
            ...adapterOpts
        };

        const result = isTelegram(to)
            ? await tg.sendText(normalizeId(to), text, extendedOpts)
            : await wa.sendText(to, text, extendedOpts);

        logInteraction({
            channel_id: adapterOpts.channelId,
            wa_id: to,
            direction: 'OUTGOING',
            type: 'text',
            content: text,
            raw: result,
            status: result.ok ? 'delivered' : 'failed'
        });
        return result;
    },

    sendButtons: async (to, body, buttons, adapterOpts = {}) => {
        const opts = await getOptions(adapterOpts.channelId);

        const extendedOpts = { ...opts, simulateTyping: true, ...adapterOpts };

        const result = isTelegram(to)
            ? await tg.sendButtons(normalizeId(to), body, buttons, extendedOpts)
            : await wa.sendButtons(to, body, buttons, extendedOpts);

        const btnLabels = buttons.map(b => b.reply?.title || b.title).join(", ");
        logInteraction({
            channel_id: adapterOpts.channelId,
            wa_id: to,
            direction: 'OUTGOING',
            type: 'button',
            content: `${body} [${btnLabels}]`,
            raw: result
        });
        return result;
    },

    sendList: async (to, body, btn, sections, adapterOpts = {}) => {
        const opts = await getOptions(adapterOpts.channelId);

        const extendedOpts = { ...opts, simulateTyping: true, ...adapterOpts };

        const result = isTelegram(to)
            ? await tg.sendList(normalizeId(to), body, btn, sections, extendedOpts)
            : await wa.sendList(to, body, btn, sections, extendedOpts);

        logInteraction({
            channel_id: adapterOpts.channelId,
            wa_id: to,
            direction: 'OUTGOING',
            type: 'list',
            content: `${body} [List Menu]`,
            raw: result
        });
        return result;
    },

    // Chunk & Many don't need logging per se as they call sendText internally? 
    // Actually sendTextMany calls sendText, so logging happens there.
    sendTextChunked: async (to, text, adapterOpts = {}) => {
        const opts = await getOptions(adapterOpts.channelId);
        return isTelegram(to)
            ? tg.sendTextChunked(normalizeId(to), text, opts)
            : wa.sendTextChunked(to, text, opts);
    },

    sendTextMany: async (to, msgs, adapterOpts = {}) => {
        const opts = await getOptions(adapterOpts.channelId);
        return isTelegram(to)
            ? tg.sendTextMany(normalizeId(to), msgs, opts)
            : wa.sendTextMany(to, msgs, opts);
    },

    sendPhoto: async (to, imagePath, caption, adapterOpts = {}) => {
        const opts = await getOptions(adapterOpts.channelId);

        // ✅ Log outgoing image
        logInteraction({
            channel_id: adapterOpts.channelId,
            wa_id: to,
            direction: 'OUTGOING',
            type: 'image',
            content: caption || '[Image]',
            raw: { imagePath, caption }
        });

        if (isTelegram(to)) {
            return tg.sendPhoto(normalizeId(to), imagePath, caption, opts);
        } else {
            return wa.sendPhoto(to, imagePath, caption, opts);
        }
    },

    sendReaction: async (to, emoji, messageId, adapterOpts = {}) => {
        const opts = await getOptions(adapterOpts.channelId);
        if (isTelegram(to)) {
            // Telegram reaction logic if needed, or ignore
            return { ok: true };
        } else {
            return wa.sendReaction(to, emoji, messageId, opts);
        }
    },

    chunkText: wa.chunkText
};
