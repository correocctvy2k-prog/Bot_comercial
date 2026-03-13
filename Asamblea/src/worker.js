// 🚑 FIX CRÍTICO DNS: Forzar IPv4 al inicio absoluto para evitar cuelgues de red
const dns = require('node:dns');
if (dns.setDefaultResultOrder) dns.setDefaultResultOrder('ipv4first');

console.log("🚀 [SCREAM TEST] WORKER.JS CARGADO EXITOSAMENTE - v8.0 (TIMEOUT & NETWORK FIX)");
require('dotenv').config();
const { supabase } = require("./config/supabase");
const { processIncomingWhatsApp } = require("./services/bot.service");
const { sendText } = require("./services/whatsapp.service");
// Servicios de monitor y siiss no requeridos en Asamblea

// Función Reutilizable para procesar trabajos
async function processJob(job) {
    if (!job) return;
    const jobId = job.id || "unknown";

    try {
        // 1. Parsing robusto y unificación de campos
        let payload = job.payload || job.request_payload || job;
        if (typeof payload === 'string') {
            try { payload = JSON.parse(payload); } catch (e) { console.error("Error parseando payload:", e); }
        }

        // 🚑 INFERENCIA DE INTELIGENCIA: Si el "type" es undefined, lo buscamos en el payload o lo deducimos
        let type = job.type || payload.type || payload.event_type;
        if (typeof type === 'string') type = type.trim(); // 🧹 Trim whitespace

        // Si sigue siendo undefined, deducimos por estructura
        if (!type) {
            if (payload.messages || payload.entry || payload.message) type = 'incoming_message';
            else if (payload.statuses) type = 'status_update';
            else type = 'incoming_message'; // Por defecto intentamos procesar como mensaje
        }

        let wa_id = job.wa_id || payload.wa_id || payload.from;

        // 🚑 INFERENCIA DE CANAL: Si no viene, deducimos por el wa_id
        let channel_id = job.channel_id || payload.channel_id;
        if (!channel_id) {
            channel_id = String(wa_id).startsWith("tg_") ? "telegram_bot" : "whatsapp";
        }

        if (type !== 'status_update') {
            console.log(`📦 [WORKER-v5] Procesando ID: ${jobId} | Type: ${type} | From: ${wa_id}`);
        }

        // 2. Desempaquetar mensaje crudo
        let raw_message = payload.raw_message || payload.payload || payload;
        if (typeof raw_message === 'string') {
            try { raw_message = JSON.parse(raw_message); } catch (e) { }
        }

        if (type === 'incoming_message') {
            // MODO BOT
            let value = raw_message?.entry?.[0]?.changes?.[0]?.value || raw_message;
            let msg = value?.messages?.[0] || raw_message;

            // Adaptador de nombre
            if (!value.contacts && raw_message.sender_name) {
                value.contacts = [{ profile: { name: raw_message.sender_name } }];
            }

            if (msg) msg.from = wa_id;
            if (msg && !msg.id) msg.id = `no_id_${Date.now()}_${Math.random().toString(36).slice(2)}`;

            // Telegram Fix
            if (raw_message.callback_query || (raw_message.message && raw_message.message.chat)) {
                if (!String(wa_id).startsWith("tg_")) wa_id = `tg_${wa_id}`;
            }

            if (msg && msg.type === 'text' && typeof msg.text === 'string') {
                msg.text = { body: msg.text };
            }

            console.log(`🤖 Bot procesando mensaje de ${wa_id}...`);
            await processIncomingWhatsApp(value, msg, channel_id);

        } else if (type === 'status_update') {
            // Silencio absoluto para no ensuciar logs
        } else {
            console.warn("⚠️ Tipo de trabajo desconocido:", type);
        }

        // Marcar completado
        if (type !== 'status_update') console.log(`🏁 [WORKER] Completando ID: ${jobId}...`);

        await supabase
            .from("bot_queue")
            .update({ status: "completed", response_data: { success: true } })
            .eq("id", jobId);

        if (type !== 'status_update') console.log(`✅ [WORKER] ID: ${jobId} terminado OK.`);

    } catch (err) {
        console.error("❌ Error en Worker:", err);
        await supabase
            .from("bot_queue")
            .update({ status: "failed", response_data: { error: err.message } })
            .eq("id", jobId);
    }
}

async function processPending(silent = false) {
    // v8.1.0: TTL de 5 minutos - mensajes más viejos se marcan como expirados para evitar procesarlos tarde
    const TTL_MINUTES = 5;
    const cutoffTime = new Date(Date.now() - TTL_MINUTES * 60 * 1000).toISOString();

    // Expirar mensajes viejos primero
    const { data: expiredData } = await supabase
        .from("bot_queue")
        .update({ status: "expired" })
        .eq("status", "pending")
        .lt("created_at", cutoffTime)
        .select("id");

    if (expiredData && expiredData.length > 0) {
        console.log(`⏰ [WORKER] ${expiredData.length} mensajes expirados (>${TTL_MINUTES}min). Descartados.`);
    }

    // Solo procesar mensajes RECIENTES (dentro del TTL)
    const { data, error } = await supabase
        .from("bot_queue")
        .select("*")
        .eq("status", "pending")
        .gte("created_at", cutoffTime)
        .limit(50);

    if (data && data.length > 0) {
        if (!silent) console.log(`🔄 Recuperando ${data.length} trabajos recientes...`);
        // 🚀 PARALELISMO: Procesar todo junto, no secuencialmente
        await Promise.all(data.map(job => processJob(job)));
    } else if (!silent) {
        console.log("✅ No hay trabajos pendientes acumulados.");
    }
}


// ━━━ NUEVO MOTOR DE ENVÍO SALIENTE (WORKER) ━━━
async function processOutgoing(logRow) {
    return; // Deshabilitado en asamblea (requiere messaging.service)

    console.log(`🚀 [OUTGOING WORKER] Despachando alerta a WA_ID: ${logRow.provider_id}...`);

    try {
        let toWaId = String(logRow.provider_id);
        // Formateo Colombia si falta el codigo de pais
        if (!toWaId.startsWith("57") && toWaId.length === 10) toWaId = "57" + toWaId;

        const Messaging = require("./services/messaging.service");
        // Forzamos bot_comercial_main porque es el canal funcional probado
        const channelId = 'bot_comercial_main';

        const response = await Messaging.sendText(toWaId, logRow.content, { channelId });

        await supabase
            .from("interactions_log")
            .update({
                status: response.ok ? "delivered" : "failed",
                raw_payload: response.data || { error: "Unknown Meta API error" }
            })
            .eq("id", logRow.id);

        console.log(`✅ [OUTGOING WORKER] Envío a ${toWaId}: ${response.ok ? 'EXITOSO' : 'FALLIDO'}`);
    } catch (err) {
        console.error(`❌ [OUTGOING WORKER] Error de envío a ${logRow.provider_id}:`, err);
        await supabase.from("interactions_log").update({
            status: "failed",
            raw_payload: { error: err.message || "Catch error" }
        }).eq("id", logRow.id);
    }
}

async function processPendingOutgoing() {
    const { data } = await supabase
        .from("interactions_log")
        .select("*")
        .eq("status", "pending")
        .eq("direction", "OUTGOING")
        .eq("channel_id", "whatsapp")
        .order("created_at", { ascending: true })
        .limit(20);

    if (data && data.length > 0) {
        console.log(`🔄 [OUTGOING] Recuperando ${data.length} mensajes salientes pendientes...`);
        for (const log of data) await processOutgoing(log); // Secuencial para evitar límites de Meta
    }
}

console.log("👷 Local Worker Iniciado (v12.1.0 OUTGOING QUEUE) - Esperando mensajes...");

supabase
    .channel('public:bot_queue')
    .on('postgres_changes', { event: 'INSERT', schema: 'public', schema: 'public', table: 'bot_queue' }, payload => {
        console.log('🔔 Nuevo mensaje detectado!');
        processJob(payload.new);
    })
    .subscribe((status) => {
        console.log(`🔌 [Supabase] Estado de Realtime: ${status}`);
        if (status === 'SUBSCRIBED') {
            console.log('✅ Escuchando nuevos mensajes en bot_queue...');
        } else if (status === 'CHANNEL_ERROR') {
            console.error('❌ Error de conexión Realtime. Intentando reiniciar worker en 5s...');
            setTimeout(() => process.exit(1), 5000); // 💀 Kill worker to force restart
        }
    });

// Suscribirse a mensajes salientes
supabase
    .channel('public:interactions_log')
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'interactions_log' }, payload => {
        if (payload.new && payload.new.direction === 'OUTGOING' && payload.new.status === 'pending') {
            processOutgoing(payload.new);
        }
    })
    .subscribe((status) => {
        if (status === 'SUBSCRIBED') console.log('✅ Escuchando alertas pendientes en interactions_log...');
    });

processPending();
processPendingOutgoing();
setInterval(() => {
    processPending(true);
    processPendingOutgoing();
}, 15000);

