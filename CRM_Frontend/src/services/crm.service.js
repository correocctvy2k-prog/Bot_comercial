import { supabase } from "./supabase";
import { startOfDay, endOfDay, subDays, formatISO } from "date-fns";

// Channel values as stored in interactions_log.channel_id
const WA_CHANNELS = ["whatsapp", "bot_comercial_main", "bot_com_wpp", "bot_wa_secondary"];
const TG_CHANNELS = ["telegram_bot", "telegram"];

// Helper to classify a channel_id string — with provider_id as secondary signal
function classifyChannel(channelId, providerId = "") {
    const id = (channelId || "").toLowerCase();
    const pid = String(providerId || "").toLowerCase();

    // Primary: provider_id prefix is the most reliable signal
    if (pid.startsWith("tg_")) return "telegram";

    // Secondary: channel_id string matching
    if (TG_CHANNELS.some(c => id.includes(c) || c.includes(id))) return "telegram";
    if (WA_CHANNELS.some(c => id.includes(c) || c.includes(id))) return "whatsapp";

    // Fallback: if we literally don't know, keep whatsapp (most common)
    return "whatsapp";
}


export const crmService = {
    /**
     * Obtiene las últimas interacciones para el Live Feed.
     * Ahora incluye channel_id para mostrar el ícono correcto.
     */
    async getRecentInteractions(limit = 15) {
        const { data: logs, error } = await supabase
            .from("interactions_log")
            .select("*")
            .order("created_at", { ascending: false })
            .limit(limit);

        if (error) throw error;

        const enriched = await Promise.all(logs.map(async (i) => {
            let displayName = i.provider_id;

            if (i.direction === "INCOMING") {
                const { data: identity } = await supabase
                    .from("contact_identities")
                    .select("profile_data, contacts(display_name)")
                    .eq("provider_id", i.provider_id)
                    .maybeSingle();

                if (identity) {
                    displayName =
                        identity.contacts?.display_name ||
                        identity.profile_data?.name ||
                        identity.profile_data?.first_name ||
                        i.provider_id;
                }
            }

            return {
                id: i.id,
                user: displayName,
                content: i.content,
                type: i.message_type,
                direction: i.direction,
                channel: classifyChannel(i.channel_id, i.provider_id), // use provider_id as primary signal
                time: i.created_at,
            };
        }));

        return enriched;
    },

    /**
     * KPIs principales del dashboard con desglose por canal y rango de fechas.
     */
    async getDashboardStats(range = '7d') {
        const now = new Date();
        let days = 0;
        if (range === '7d') days = 7;
        else if (range === '1m') days = 30;
        else if (range === '1y') days = 365;

        let startDate, prevStartDate, prevEndDate;

        if (range === '24h') {
            startDate = formatISO(new Date(now.getTime() - 24 * 60 * 60 * 1000));
            prevStartDate = formatISO(new Date(now.getTime() - 48 * 60 * 60 * 1000));
            prevEndDate = startDate;
        } else {
            // Si days = 0, es "hoy" (comportamiento original)
            startDate = days > 0 ? formatISO(startOfDay(subDays(now, days - 1))) : formatISO(startOfDay(now));
            prevStartDate = days > 0 ? formatISO(startOfDay(subDays(now, (days * 2) - 1))) : formatISO(startOfDay(subDays(now, 1)));
            prevEndDate = startDate;
        }

        // Total en el rango
        const { count: msgTotal } = await supabase
            .from("interactions_log")
            .select("*", { count: "exact", head: true })
            .gte("created_at", startDate);

        // WhatsApp en el rango
        const { count: waCount } = await supabase
            .from("interactions_log")
            .select("*", { count: "exact", head: true })
            .gte("created_at", startDate)
            .not("provider_id", "like", "tg_%");

        // Telegram en el rango
        const { count: tgCount } = await supabase
            .from("interactions_log")
            .select("*", { count: "exact", head: true })
            .gte("created_at", startDate)
            .like("provider_id", "tg_%");

        // Total en el periodo previo (para calcular %cambio)
        const { count: msgPrev } = await supabase
            .from("interactions_log")
            .select("*", { count: "exact", head: true })
            .gte("created_at", prevStartDate)
            .lt("created_at", prevEndDate);

        // Nuevos contactos en el rango
        const { count: newContacts } = await supabase
            .from("contacts")
            .select("*", { count: "exact", head: true })
            .gte("created_at", startDate);

        // Usuarios únicos
        const { data: uniqueProviders } = await supabase
            .from("interactions_log")
            .select("provider_id")
            .gte("created_at", startDate)
            .eq("direction", "INCOMING");

        const uniqueUsers = new Set(uniqueProviders?.map(r => r.provider_id)).size;

        // Ratio de respuesta bot (OUTGOING / INCOMING)
        const { count: outgoing } = await supabase
            .from("interactions_log")
            .select("*", { count: "exact", head: true })
            .gte("created_at", startDate)
            .eq("direction", "OUTGOING");
        const { count: incoming } = await supabase
            .from("interactions_log")
            .select("*", { count: "exact", head: true })
            .gte("created_at", startDate)
            .eq("direction", "INCOMING");
        const responseRate = incoming > 0 ? Math.round((outgoing / incoming) * 100) : 100;

        // Calcular cambio vs periodo previo en %
        const changePct = msgPrev > 0
            ? Math.round(((msgTotal - msgPrev) / msgPrev) * 100)
            : 0;

        return {
            messagesTotal: msgTotal || 0,
            waTotal: waCount || 0,
            tgTotal: tgCount || 0,
            newLeads: newContacts || 0,
            uniqueUsers,
            responseRate: `${responseRate}%`,
            changePct,
            activeNow: 1, // Placeholder real-time
        };
    },


    /**
     * Actividad en el tiempo para la gráfica de área.
     */
    async getActivity(range = '7d') {
        const periods = [];
        const results = [];
        const now = new Date();

        if (range === '24h') {
            // Agrupar por horas las últimas 24H
            for (let i = 23; i >= 0; i--) {
                const startH = new Date(now.getTime() - i * 60 * 60 * 1000);
                startH.setMinutes(0, 0, 0); // start of the hour
                const endH = new Date(startH.getTime() + 59 * 60 * 1000 + 59000); // end of hour

                periods.push({
                    start: formatISO(startH),
                    end: formatISO(endH),
                    label: startH.toLocaleTimeString("es", { hour: '2-digit', minute: '2-digit' })
                });
            }
        } else {
            let days = 7;
            let step = 1; // 1 day per point
            if (range === '1m') days = 30; // 30 points
            if (range === '1y') { days = 365; step = 30; } // aprox 12 points

            for (let i = days - 1; i >= 0; i -= step) {
                const startD = subDays(now, i);
                let endD = startD;
                if (step > 1) endD = subDays(now, Math.max(0, i - step + 1));

                periods.push({
                    start: formatISO(startOfDay(startD)),
                    end: formatISO(endOfDay(endD)),
                    label: step > 1
                        ? startD.toLocaleDateString("es", { month: "short", year: "2-digit" })
                        : startD.toLocaleDateString("es", { weekday: "short", day: "numeric" })
                });
            }
        }

        for (const p of periods) {
            const { count: wa } = await supabase.from("interactions_log")
                .select("*", { count: "exact", head: true })
                .gte("created_at", p.start).lte("created_at", p.end)
                .not("provider_id", "like", "tg_%");
            const { count: tg } = await supabase.from("interactions_log")
                .select("*", { count: "exact", head: true })
                .gte("created_at", p.start).lte("created_at", p.end)
                .like("provider_id", "tg_%");

            results.push({
                date: p.label,
                WhatsApp: wa || 0,
                Telegram: tg || 0,
                total: (wa || 0) + (tg || 0),
            });
        }

        return results;
    },


    /**
     * Distribución total por canal para el donut chart.
     */
    async getChannelDistribution(range = '7d') {
        const now = new Date();
        let days = 7;
        if (range === '1m') days = 30;
        else if (range === '1y') days = 365;

        const startDate = range === '24h'
            ? formatISO(new Date(now.getTime() - 24 * 60 * 60 * 1000))
            : formatISO(startOfDay(subDays(now, days - 1)));

        const { count: wa } = await supabase.from("interactions_log")
            .select("*", { count: "exact", head: true })
            .gte("created_at", startDate)
            .not("provider_id", "like", "tg_%");
        const { count: tg } = await supabase.from("interactions_log")
            .select("*", { count: "exact", head: true })
            .gte("created_at", startDate)
            .like("provider_id", "tg_%");

        const total = (wa || 0) + (tg || 0);

        return [
            {
                name: "WhatsApp",
                value: wa || 0,
                pct: total > 0 ? Math.round(((wa || 0) / total) * 100) : 0,
                color: "#25D366",
            },
            {
                name: "Telegram",
                value: tg || 0,
                pct: total > 0 ? Math.round(((tg || 0) / total) * 100) : 0,
                color: "#2AABEE",
            },
        ];
    },

    // --- CONTACTS MODULE ---

    async getContactsStats() {
        const { count: totalContacts } = await supabase.from("contacts").select("*", { count: "exact", head: true });

        const sevenDaysAgo = formatISO(startOfDay(subDays(new Date(), 7)));
        const { count: newContacts } = await supabase.from("contacts")
            .select("*", { count: "exact", head: true })
            .gte("created_at", sevenDaysAgo);

        // Obtener identidades para calcular multicanal y distribución
        const { data: identities } = await supabase.from("contact_identities").select("contact_id, provider_id");

        const contactIdCounts = {};
        let waCount = 0;
        let tgCount = 0;

        identities?.forEach(id => {
            contactIdCounts[id.contact_id] = (contactIdCounts[id.contact_id] || 0) + 1;
            if (id.provider_id.startsWith('tg_')) tgCount++;
            else waCount++;
        });

        const multiChannelCount = Object.values(contactIdCounts).filter(c => c > 1).length;

        return {
            total: totalContacts || 0,
            newLast7d: newContacts || 0,
            multiChannel: multiChannelCount,
            waIdentities: waCount,
            tgIdentities: tgCount
        };
    },

    async getContacts() {
        const { data, error } = await supabase
            .from("contacts")
            .select("*")
            .order("updated_at", { ascending: false });

        if (error) throw error;

        const contactsWithIdentities = await Promise.all(data.map(async (c) => {
            const { data: identities } = await supabase
                .from("contact_identities")
                .select("provider_id, channel_type, profile_data")
                .eq("contact_id", c.id);
            return { ...c, contact_identities: identities || [] };
        }));

        return contactsWithIdentities;
    },

    async getContactDetails(contactId) {
        const { data: contact, error: contactError } = await supabase
            .from("contacts")
            .select("*")
            .eq("id", contactId)
            .single();

        if (contactError) throw contactError;

        const { data: identities } = await supabase
            .from("contact_identities")
            .select("provider_id, channel_type, profile_data")
            .eq("contact_id", contactId);

        const providerIds = identities?.map(id => id.provider_id) || [];

        let history = [];
        if (providerIds.length > 0) {
            const { data: interactions } = await supabase
                .from("interactions_log")
                .select("*")
                .in("provider_id", providerIds)
                .order("created_at", { ascending: true });

            history = interactions || [];
        }

        return { contact, identities, history };
    },

    /**
     * Vincula dos contactos: mueve todas las identidades del sourceId al targetId
     * y elimina el contacto fuente (ahora vacío).
     */
    async mergeContacts(targetId, sourceId) {
        if (targetId === sourceId) throw new Error("No puedes vincular un contacto consigo mismo.");

        // 1. Reasignar todas las identidades del contacto fuente al destino
        const { error: updateErr } = await supabase
            .from("contact_identities")
            .update({ contact_id: targetId })
            .eq("contact_id", sourceId);

        if (updateErr) throw updateErr;

        // 2. Reasignar las interacciones (actualizar contact_id en interactions_log si existe esa columna)
        // Nota: interactions_log usa provider_id — no hay contact_id ahí, no necesita update.

        // 3. Eliminar el contacto fuente (ya sin identidades)
        const { error: deleteErr } = await supabase
            .from("contacts")
            .delete()
            .eq("id", sourceId);

        if (deleteErr) throw deleteErr;

        return { success: true };
    },

    /**
     * Busca contactos por nombre para el modal de vinculación.
     */
    async searchContacts(query) {
        const { data, error } = await supabase
            .from("contacts")
            .select("id, display_name, updated_at")
            .ilike("display_name", `%${query}%`)
            .order("display_name")
            .limit(10);

        if (error) throw error;
        return data || [];
    },

    /**
     * Obtiene el estado de salud de la integración SIISS (cobertura y sync).
     */
    async getSiissHealth() {
        const { data: stats, error } = await supabase
            .from("puntos_venta")
            .select("siiss_active, siiss_last_sync")
            .not("siiss_id", "is", null)
            .or('is_permanently_closed.eq.false,is_permanently_closed.is.null');

        if (error) throw error;

        const total = stats?.length || 0;
        const synced = stats?.filter(s => s.siiss_last_sync).length || 0;
        const activeInSiiss = stats?.filter(s => s.siiss_active === true).length || 0;
        const lastSync = stats?.length ? stats.reduce((acc, curr) => {
            if (!curr.siiss_last_sync) return acc;
            const currDate = new Date(curr.siiss_last_sync);
            return !acc || currDate > acc ? currDate : acc;
        }, null) : null;

        return {
            total,
            synced,
            coverage: total > 0 ? Math.round((synced / total) * 100) : 0,
            activeInSiiss,
            lastSync
        };
    },
};
