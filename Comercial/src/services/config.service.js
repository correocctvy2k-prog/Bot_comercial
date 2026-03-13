const { supabase } = require('../config/supabase');
const { SUPABASE_URL, SUPABASE_KEY } = process.env;

// Simple In-Memory Cache (Map<channelId, { config, expiresAt }>)
const cache = new Map();
const TTL_MS = 1000 * 60 * 5; // 5 Minutes Cache

const ConfigService = {
    /**
     * Retrieve channel configuration by ID (DB or Cache)
     */
    async getChannelConfig(channelId) {
        if (!channelId) return null;

        const now = Date.now();
        const cached = cache.get(channelId);

        if (cached && cached.expiresAt > now) {
            return cached.config;
        }

        console.log(`📡 Fetching Config for Channel: ${channelId}...`);
        const start = Date.now();

        try {
            // ⏱️ TIMEOUT MAESTRO: Si Supabase no responde en 8s, cancelamos para no colgar el worker
            const configPromise = supabase
                .from('channels')
                .select('channel_id, type, config')
                .eq('channel_id', channelId)
                .limit(1);

            const timeoutPromise = new Promise((_, reject) =>
                setTimeout(() => reject(new Error("Timeout de conexión con Supabase (8s)")), 8000)
            );

            const { data, error } = await Promise.race([configPromise, timeoutPromise]);
            const channelData = data?.[0];

            if (error || !channelData) {
                // v11.17: FALLBACK A VARIABLES DE ENTORNO (Para Telegram/WhatsApp Dockerizados con .env)
                if (channelId === "telegram_bot" && process.env.TELEGRAM_BOT_TOKEN) {
                    console.log(`⚠️ [FALLBACK] Usando TELEGRAM_BOT_TOKEN del entorno para ${channelId}`);
                    return { type: "telegram", config: { token: process.env.TELEGRAM_BOT_TOKEN } };
                }

                console.error(`❌ Config Error for ${channelId} (${Date.now() - start}ms):`, error?.message || "No data found");
                return null;
            }

            console.log(`✅ Config Loaded for ${channelId} (${Date.now() - start}ms)`);

            // Cache result
            cache.set(channelId, {
                config: channelData,
                expiresAt: now + TTL_MS
            });

            return channelData;
        } catch (err) {
            console.error(`❌ EXCEPCIÓN Crítica en Config (${channelId}):`, err.message);
            return null;
        }
    },

    /**
     * Clear specific cache key (e.g. on update)
     */
    invalidate(channelId) {
        cache.delete(channelId);
    }
};

module.exports = ConfigService;
