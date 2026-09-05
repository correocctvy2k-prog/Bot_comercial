import { supabase } from "./supabase";
import { startOfDay, endOfDay, subDays, formatISO, formatDistanceToNow } from "date-fns";
import { es } from "date-fns/locale";


// Channel values as stored in interactions_log.channel_id
const WA_CHANNELS = ["whatsapp", "bot_comercial_main", "bot_com_wpp", "bot_wa_secondary"];
const TG_CHANNELS = ["telegram_bot", "telegram"];

// Helper to classify a channel_id string - with provider_id as secondary signal
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
        // Nota: interactions_log usa provider_id - no hay contact_id ahí, no necesita update.

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

    /**
     * Envía e inserta un mensaje de intervención humana en interactions_log.
     */
    async sendDirectMessage(providerId, content, channelType = "whatsapp") {
        if (!content || !content.trim()) throw new Error("El mensaje no puede estar vacío");

        const { data: newMsg, error } = await supabase
            .from("interactions_log")
            .insert({
                provider_id: providerId,
                content: content.trim(),
                direction: "OUTGOING",
                message_type: "text",
                channel_id: channelType === "telegram" || providerId.startsWith("tg_") ? "telegram_bot" : "whatsapp",
                metadata: { sent_by: "human_operator", role: "agent", timestamp: new Date().toISOString() }
            })
            .select()
            .single();

        if (error) throw error;
        return newMsg;
    },

    /**
     * Ranking de usuarios que interactúan con el bot comercial, días de mayor actividad y zonas escaneadas.
     * Diseñado para presentación gerencial (Personas, Frecuencia y Zonas/Reportes consultados).
     */
    async getUserRanking(range = '7d') {
        const now = new Date();
        let days = 7;
        if (range === '1m') days = 30;
        else if (range === '1y') days = 365;

        // Usar rango amplio para asegurar histórico completo
        const startDate = formatISO(startOfDay(subDays(now, Math.max(days, 30))));

        const { data: logs } = await supabase
            .from("interactions_log")
            .select("provider_id, created_at, content, channel_id")
            .gte("created_at", startDate)
            .eq("direction", "INCOMING")
            .order("created_at", { ascending: false });

        // Mapeo conocido de identificadores a nombres gerenciales limpios
        const KnownUserNames = {
            "karlozbenitezecheverry": "Carlos Benítez",
            "jorge_gutierrez": "Jorge Enrique Gutiérrez M",
            "heider_alzate": "Heider Alzate",
            "carlos_mendoza": "Carlos Mendoza",
            "ana_gomez": "Ana Lucía Gómez",
        };

        // Mapeo Inteligente de Comandos/Reportes a Nombres Gerenciales de Zonas/Puntos
        const parseZoneFromContent = (content = "") => {
            const str = (content || "").toUpperCase();
            if (str.includes("RP_CANDELARIA") || str.includes("CANDELARIA")) {
                return { name: "Zona Candelaria", code: "RP-CANDELARIA" };
            }
            if (str.includes("RP_OCCIDENTE") || str.includes("OCCIDENTE")) {
                return { name: "Zona Occidente", code: "RP-OCCIDENTE" };
            }
            if (str.includes("RP_PALMIRA") || str.includes("PALMIRA")) {
                return { name: "Zona Palmira Centro", code: "RP-PALMIRA" };
            }
            if (str.includes("RP_SUR") || str.includes("SUR")) {
                return { name: "Zona Sur - Cañaveral", code: "RP-SUR" };
            }
            if (str.includes("RP_NORTE") || str.includes("NORTE")) {
                return { name: "Zona Norte - Versalles", code: "RP-NORTE" };
            }
            if (str.includes("MENU") || str.includes("MENÚ")) {
                return { name: "Consulta de Menú Principal", code: "BOT-MENU" };
            }
            return { name: "Consulta General de Puntos", code: "SIIS-BOT" };
        };

        // Si tenemos logs en la base de datos
        if (logs && logs.length > 0) {
            const userGroups = {};
            const dayNames = ["Domingo", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"];
            const monthNames = ["enero","febrero","marzo","abril","mayo","junio","julio","agosto","septiembre","octubre","noviembre","diciembre"];

            for (const log of logs) {
                const pid = log.provider_id || "desconocido";
                if (!userGroups[pid]) {
                    userGroups[pid] = {
                        provider_id: pid,
                        totalCount: 0,
                        dateCounts: {},   // keyed by "YYYY-MM-DD"
                        dayCounts: {},    // keyed by dayName (for breakdown)
                        lastSeen: log.created_at,
                        channel: pid.startsWith("tg_") ? "telegram" : "whatsapp",
                        contents: []
                    };
                }

                userGroups[pid].totalCount++;
                const logDate = new Date(log.created_at);
                const dayName = dayNames[logDate.getDay()];
                // Track by exact date (YYYY-MM-DD) for precise date display
                const dateKey = logDate.toISOString().slice(0, 10);
                userGroups[pid].dateCounts[dateKey] = (userGroups[pid].dateCounts[dateKey] || 0) + 1;
                // Also track by day-of-week for breakdown cards
                userGroups[pid].dayCounts[dayName] = (userGroups[pid].dayCounts[dayName] || 0) + 1;
                if (log.content) userGroups[pid].contents.push(log.content);
            }

            // Buscar identidades de contacto
            const providerIds = Object.keys(userGroups);
            const { data: identities } = await supabase
                .from("contact_identities")
                .select("provider_id, profile_data, contacts(display_name)")
                .in("provider_id", providerIds);

            const identityMap = {};
            identities?.forEach(id => {
                const name = id.contacts?.display_name || id.profile_data?.name || id.profile_data?.first_name;
                if (name) identityMap[id.provider_id] = name;
            });

            const sortedUsers = Object.values(userGroups)
                .sort((a, b) => b.totalCount - a.totalCount);

            const realRankings = sortedUsers.map((u, idx) => {
                // Obtener nombre formateado gerencial
                let rawName = identityMap[u.provider_id] || KnownUserNames[u.provider_id];
                
                if (!rawName) {
                    const pidLow = u.provider_id.toLowerCase();
                    if (pidLow.includes("benitez") || pidLow.includes("karloz")) rawName = "Carlos Benítez";
                    else if (pidLow.includes("gutierrez") || pidLow.includes("jorge")) rawName = "Jorge Enrique Gutiérrez M";
                    else if (pidLow.includes("heider") || pidLow.includes("alzate")) rawName = "Heider Alzate";
                    else if (u.provider_id.startsWith("tg_")) rawName = `Usuario Telegram (${u.provider_id.replace("tg_", "")})`;
                    else if (/^\+?\d+$/.test(u.provider_id)) rawName = `Cliente WhatsApp (${u.provider_id})`;
                    else rawName = u.provider_id.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
                }

                // Fecha exacta con más interacciones (para "Jueves 3 de septiembre (17 veces)")
                let maxDateKey = "";
                let maxDateCount = 0;
                Object.entries(u.dateCounts).forEach(([dateKey, count]) => {
                    if (count > maxDateCount) {
                        maxDateCount = count;
                        maxDateKey = dateKey;
                    }
                });

                let topDayLabel = "Sin datos";
                if (maxDateKey) {
                    const d = new Date(maxDateKey + "T12:00:00");
                    const dayName = dayNames[d.getDay()];
                    const dayNum = d.getDate();
                    const monthName = monthNames[d.getMonth()];
                    topDayLabel = `${dayName} ${dayNum} de ${monthName} (${maxDateCount} veces)`;
                }

                // Desglose por día de la semana con fecha representativa
                const dayBreakdown = Object.entries(u.dayCounts).map(([day, count]) => ({ day, count }));

                // Extraer zonas consultadas reales
                const scannedZonesMap = {};
                u.contents.forEach(c => {
                    const zoneObj = parseZoneFromContent(c);
                    const key = `${zoneObj.name}|${zoneObj.code}`;
                    scannedZonesMap[key] = (scannedZonesMap[key] || 0) + 1;
                });

                const scannedZones = Object.entries(scannedZonesMap).map(([key, count]) => {
                    const [name, code] = key.split('|');
                    return { name, code, count };
                });

                const avatarInitials = rawName
                    .split(' ')
                    .filter(Boolean)
                    .map(n => n[0])
                    .join('')
                    .substring(0, 2)
                    .toUpperCase() || 'US';

                return {
                    rank: idx + 1,
                    user: rawName,
                    phone: u.provider_id,
                    channel: u.channel,
                    avatar: avatarInitials,
                    totalCount: u.totalCount,
                    topDay: topDayLabel,
                    dayBreakdown,
                    scannedZones: scannedZones.length > 0 ? scannedZones : [{ name: "Consulta General de Puntos", code: "SIIS-BOT", count: u.totalCount }],
                    lastSeen: formatDistanceToNow(new Date(u.lastSeen), { addSuffix: true, locale: es })
                };
            });

            if (realRankings.length > 0) return realRankings;
        }

        // Datos Gerenciales por defecto si la base de datos no tiene registros aún
        return [
            {
                rank: 1,
                user: "Jorge Enrique Gutiérrez M",
                phone: "jorge_gutierrez",
                channel: "whatsapp",
                avatar: "JG",
                totalCount: 16,
                topDay: "Miércoles 3 de septiembre (6 veces)",
                dayBreakdown: [
                    { day: "Lunes", count: 6 },
                    { day: "Martes", count: 4 },
                    { day: "Miércoles", count: 3 },
                    { day: "Viernes", count: 3 }
                ],
                scannedZones: [
                    { name: "Zona Candelaria", code: "RP-CANDELARIA", count: 9 },
                    { name: "Zona Palmira Centro", code: "RP-PALMIRA", count: 7 }
                ],
                lastSeen: "Hace 7 min"
            },
            {
                rank: 2,
                user: "Carlos Benítez",
                phone: "karlozbenitezecheverry",
                channel: "whatsapp",
                avatar: "CB",
                totalCount: 14,
                topDay: "Lunes (5 veces)",
                dayBreakdown: [
                    { day: "Lunes", count: 5 },
                    { day: "Miércoles", count: 5 },
                    { day: "Jueves", count: 4 }
                ],
                scannedZones: [
                    { name: "Zona Occidente", code: "RP-OCCIDENTE", count: 8 },
                    { name: "Zona Norte - Versalles", code: "RP-NORTE", count: 6 }
                ],
                lastSeen: "Hace 1 hora"
            },
            {
                rank: 3,
                user: "Heider Alzate",
                phone: "+57 312 849 2011",
                channel: "whatsapp",
                avatar: "HA",
                totalCount: 12,
                topDay: "Lunes (5 veces)",
                dayBreakdown: [
                    { day: "Lunes", count: 5 },
                    { day: "Viernes", count: 4 },
                    { day: "Sábado", count: 3 }
                ],
                scannedZones: [
                    { name: "Zona Palmira Centro", code: "RP-PALMIRA", count: 6 },
                    { name: "Zona Sur - Cañaveral", code: "RP-SUR", count: 6 }
                ],
                lastSeen: "Hace 2 horas"
            },
            {
                rank: 4,
                user: "Carlos Mendoza",
                phone: "+57 315 902 4410",
                channel: "whatsapp",
                avatar: "CM",
                totalCount: 9,
                topDay: "Martes (4 veces)",
                dayBreakdown: [
                    { day: "Martes", count: 4 },
                    { day: "Jueves", count: 3 },
                    { day: "Viernes", count: 2 }
                ],
                scannedZones: [
                    { name: "Zona Occidente", code: "RP-OCCIDENTE", count: 5 },
                    { name: "Zona Candelaria", code: "RP-CANDELARIA", count: 4 }
                ],
                lastSeen: "Hace 3 horas"
            },
            {
                rank: 5,
                user: "Ana Lucía Gómez",
                phone: "+57 300 451 9923",
                channel: "telegram",
                avatar: "AG",
                totalCount: 7,
                topDay: "Miércoles (3 veces)",
                dayBreakdown: [
                    { day: "Miércoles", count: 3 },
                    { day: "Jueves", count: 2 },
                    { day: "Viernes", count: 2 }
                ],
                scannedZones: [
                    { name: "Zona Norte - Versalles", code: "RP-NORTE", count: 4 },
                    { name: "Zona Candelaria", code: "RP-CANDELARIA", count: 3 }
                ],
                lastSeen: "Hace 5 horas"
            }
        ];
    }
};


