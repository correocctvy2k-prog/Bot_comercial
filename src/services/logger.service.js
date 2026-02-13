const { createClient } = require('@supabase/supabase-js');

const supabaseURL = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_KEY;
const supabase = createClient(supabaseURL, supabaseKey);

// Config
const BOT_CHANNEL_ID = process.env.BOT_CHANNEL_ID || 'bot_comercial_main';

/**
 * Log an interaction to the CRM.
 * @param {Object} p
 * @param {string} p.wa_id - The user ID (provider_id)
 * @param {string} p.direction - 'INCOMING' | 'OUTGOING'
 * @param {string} p.type - 'text', 'button', 'image', etc.
 * @param {string} p.content - The human readable content
 * @param {Object} [p.raw] - Full raw payload for debugging
 */
async function logInteraction({ wa_id, direction, type, content, raw }) {
    try {
        // Fire and forget (don't await to avoid slowing down the bot)
        supabase.from('interactions_log').insert({
            channel_id: BOT_CHANNEL_ID,
            provider_id: wa_id,
            direction,
            message_type: type,
            content,
            raw_payload: raw,
            status: 'sent' // Default for outgoing. For incoming, it implies "received by bot"
        }).then(({ error }) => {
            if (error) console.error("❌ Logger Error:", error.message);
        });
    } catch (e) {
        console.error("❌ Logger Exception:", e);
    }
}

/**
 * Ensure channel exists (Call this on startup)
 */
async function registerChannel() {
    const { error } = await supabase.from('channels').upsert({
        channel_id: BOT_CHANNEL_ID,
        type: 'hybrid',
        name: 'Bot Comercial Main',
        status: 'active'
    }, { onConflict: 'channel_id' });

    if (error) console.error("❌ Error registering channel:", error.message);
    else console.log(`✅ Channel registered: ${BOT_CHANNEL_ID}`);
}

module.exports = {
    logInteraction,
    registerChannel
};
