/**
 * Cliente del servicio `chatbot-analytics` (Oskitar · Betty).
 * El servicio expone el modelo ya calculado; aquí sólo se consume.
 * Base URL build-time: VITE_CHATBOT_ANALYTICS_URL (compose la fija a :3008).
 */

const BASE = (import.meta.env.VITE_CHATBOT_ANALYTICS_URL || "http://127.0.0.1:3008").replace(/\/$/, "");

async function getJSON(path, { signal } = {}) {
    const res = await fetch(`${BASE}${path}`, { signal });
    if (!res.ok) {
        const text = await res.text().catch(() => "");
        throw new Error(text || `HTTP ${res.status}`);
    }
    return res.json();
}

function rangeToQuery(range) {
    // range: "24h" | "7d" | "1m" | "1y" (mismo selector que Bot Comercial)
    const days = { "24h": 1, "7d": 7, "1m": 30, "1y": 365 }[range];
    if (!days) return {};
    const to = new Date();
    const from = new Date(to.getTime() - (days - 1) * 86400000);
    const iso = (d) => d.toISOString().slice(0, 10);
    return { from: iso(from), to: iso(to) };
}

export const chatbotAnalyticsService = {
    baseUrl: BASE,

    /** Lista de bots disponibles: [{id, name, subtitle, engine, ready}] */
    listBots: (opts) => getJSON(`/api/bots`, opts),

    /**
     * Modelo analítico de un bot.
     * @param {"oskitar"|"betty"} bot
     * @param {{range?:string, from?:string, to?:string, category?:string}} filters
     */
    getModel(bot, filters = {}, opts) {
        const q = { ...rangeToQuery(filters.range), ...filters };
        delete q.range;
        if (q.category === "Todas" || !q.category) delete q.category;
        const qs = new URLSearchParams(Object.entries(q).filter(([, v]) => v != null && v !== "")).toString();
        return getJSON(`/api/${bot}/analytics${qs ? `?${qs}` : ""}`, opts);
    },

    getHealth: (bot, opts) => getJSON(`/api/${bot}/health`, opts),

    /** Fuerza al servicio a releer los logs y recalcular el modelo. */
    async refresh(bot) {
        const res = await fetch(`${BASE}/api/${bot}/refresh`, { method: "POST" });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json();
    },

    /** URL de descarga CSV (se abre en pestaña nueva). */
    exportCsvUrl(bot, { dataset = "", from = "", to = "" } = {}) {
        const qs = new URLSearchParams(
            Object.entries({ dataset, from, to }).filter(([, v]) => v),
        ).toString();
        return `${BASE}/api/${bot}/export.csv${qs ? `?${qs}` : ""}`;
    },

    /**
     * Suscripción SSE a los avisos de recálculo. Devuelve una función para cerrar.
     * onUpdate() se invoca cuando llega el evento `update`.
     */
    subscribe(bot, onUpdate) {
        let es;
        try {
            es = new EventSource(`${BASE}/api/${bot}/stream`);
            es.addEventListener("update", () => onUpdate?.());
        } catch {
            /* EventSource no disponible: sin live updates, no es crítico */
        }
        return () => es && es.close();
    },
};
