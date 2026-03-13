import { supabase } from "./supabase";

export const channelsService = {
    /**
     * Obtiene la lista de canales registrados.
     */
    async getChannels() {
        const { data, error } = await supabase
            .from("channels")
            .select("*")
            .order("created_at", { ascending: false });

        if (error) throw error;

        // Mocking status logic for now since we don't have a real heartbeat yet
        return data.map(c => ({
            ...c,
            status: 'active', // Mock: active, error, maintenance
            last_ping: new Date().toISOString()
        }));
    },

    /**
     * Registra un nuevo canal (Bot).
     */
    /**
     * Registra un nuevo canal (Bot).
     * @param {Object} d { name, platform, channel_id, token }
     */
    async addChannel(d) {
        // Prepare config based on platform
        const config = d.config || {};
        if (d.token) config.token = d.token;
        if (d.waba_id) config.waba_id = d.waba_id;

        const { data, error } = await supabase
            .from('channels')
            .insert([{
                type: d.platform, // Map platform -> type
                channel_id: d.channel_id,
                name: d.name,
                config: config,
                status: 'active'
            }])
            .select()
            .single();

        if (error) throw error;
        return data;
    },

    /**
     * Elimina un canal.
     */
    async deleteChannel(id) {
        const { error } = await supabase
            .from('channels')
            .delete()
            .eq('channel_id', id);

        if (error) throw error;
    }
};
