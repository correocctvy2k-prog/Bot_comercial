const { supabase } = require('../config/supabase');

const supabaseURL = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_KEY;

// Config
const BOT_CHANNEL_ID = process.env.BOT_CHANNEL_ID || 'bot_comercial_main';

function getChannelType(waId) {
    return String(waId).startsWith('tg_') ? 'telegram' : 'whatsapp';
}

/**
 * Asegura que el contacto exista en la tabla 'contacts' y 'contact_identities'.
 * @param {string} waId - Provider ID
 * @param {string} name - Profile Name
 */
async function ensureContact(waId, name) {
    if (!waId) return;
    const channelType = getChannelType(waId);

    try {
        // 1. Check Identity
        const { data: identity } = await supabase
            .from('contact_identities')
            .select('contact_id')
            .eq('provider_id', waId)
            .eq('channel_type', channelType)
            .single();

        if (identity) {
            // Ya existe, update last_seen (StartTransition/FireForget)
            supabase.from('contact_identities')
                .update({ last_seen: new Date() })
                .eq('provider_id', waId)
                .then();
            return identity.contact_id;
        }

        // 2. Create New Contact (Si no existe identidad)
        console.log(`👤 CRM: Creando nuevo contacto para ${name} (${waId})`);

        // Crear Contacto Base
        const { data: newContact, error: errContact } = await supabase
            .from('contacts')
            .insert({ display_name: name || 'Unknown' })
            .select()
            .single();

        if (errContact || !newContact) {
            console.error("❌ Error creando contacto:", errContact?.message);
            return null;
        }

        // Crear Identidad
        const { error: errIdentity } = await supabase
            .from('contact_identities')
            .insert({
                contact_id: newContact.id,
                provider_id: waId,
                channel_type: channelType,
                profile_data: { name }
            });

        if (errIdentity) console.error("❌ Error creando identidad:", errIdentity.message);
        return newContact.id;

    } catch (e) {
        console.error("❌ CRM Identity Error:", e);
        return null;
    }
}


/**
 * Log an interaction to the CRM.
 * @param {Object} p
 * @param {string} p.wa_id - The user ID (provider_id)
 * @param {string} [p.channel_id] - The channel ID (e.g. 'bot_comercial_main', 'telegram_bot')
 * @param {string} p.direction - 'INCOMING' | 'OUTGOING'
 * @param {string} p.type - 'text', 'button', 'image', etc.
 * @param {string} p.content - The human readable content
 * @param {Object} [p.raw] - Full raw payload for debugging
 */
async function logInteraction({ wa_id, channel_id, direction, type, content, raw, status }) {
    try {
        const resolvedChannelId = channel_id || BOT_CHANNEL_ID;

        // Fire and forget (don't await to avoid slowing down the bot)
        supabase.from('interactions_log').insert({
            channel_id: resolvedChannelId,
            provider_id: wa_id,
            direction,
            message_type: type,
            content,
            raw_payload: raw,
            status: status || 'sent'
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
    registerChannel,
    ensureContact
};
