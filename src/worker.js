require("dotenv").config();
const { createClient } = require("@supabase/supabase-js");
// 🚑 FIX TIMEOUT: Forzar uso de IPv4 en Node 18/20 para evitar problemas de DNS/Red en Docker
const dns = require('node:dns');
dns.setDefaultResultOrder('ipv4first');

const { processIncomingWhatsApp } = require("./services/bot.service");

// Configurar cliente Supabase con opciones robustas de conexión
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY, {
    auth: {
        persistSession: false // No necesitamos sesión de usuario en el worker
    },
    realtime: {
        params: {
            eventsPerSecond: 10,
        },
        timeout: 60000, // aumentar timeout a 60s
        heartbeatIntervalMs: 5000 // latidos más frecuentes
    }
});

// Función Reutilizable para procesar trabajos
async function processJob(job) {
    console.log(`📥 Procesando trabajo ID: ${job.id}`);

    // Marcar como procesando
    await supabase.from("bot_queue").update({ status: "processing" }).eq("id", job.id);

    try {
        let reqPayload = job.request_payload;

        // 1. Parsing robusto del payload inicial
        if (typeof reqPayload === 'string') {
            try { reqPayload = JSON.parse(reqPayload); } catch (e) { console.warn("Error parseando request_payload:", e); }
        }

        console.log("🔍 FULL PAYLOAD DEBUG:", JSON.stringify(reqPayload, null, 2));

        // 2. Extracción segura
        let { type, raw_message, wa_id } = reqPayload || {};

        // 🚑 FIX DE EMERGENCIA: Desempaquetar si viene anidado en payload_string
        if (raw_message && raw_message.payload_string) {
            console.log("📦 Desempaquetando payload anidado...");
            try {
                const inner = JSON.parse(raw_message.payload_string);
                type = inner.type || type;
                wa_id = inner.wa_id || wa_id;
                raw_message = inner.raw_message || inner;
            } catch (e) { console.warn("Error desempaquetando inner:", e); }
        }

        // 3. Parsing robusto de raw_message
        if (typeof raw_message === 'string') {
            try { raw_message = JSON.parse(raw_message); } catch (e) { }
        }

        if (type === 'incoming_message') {
            // MODO BOT
            let value = raw_message?.entry?.[0]?.changes?.[0]?.value || raw_message;
            let msg = value?.messages?.[0] || raw_message;

            // Adaptador simplificado
            if (!value.contacts && raw_message.sender_name) {
                value.contacts = [{ profile: { name: raw_message.sender_name } }];
            }
            // Asegurar que message tenga lo mínimo
            if (msg && !msg.from && wa_id) msg.from = wa_id;
            // 🚑 FIX CRÍTICO: Generar ID falso si n8n no lo envía
            if (msg && !msg.id) msg.id = `no_id_${Date.now()}_${Math.random().toString(36).slice(2)}`;

            // ✅ CORRECCIÓN CRÍTICA 1: Reconstruir estructura de Texto
            if (msg && msg.type === 'text' && typeof msg.text === 'string') {
                msg.text = { body: msg.text };
            }
            // ✅ CORRECCIÓN CRÍTICA 2: Reconstruir estructura de Botones (Interactive)
            if (msg && msg.type === 'button') {
                console.log("🔄 Reconstruyendo payload de botón simplificado...");
                const btnId = (msg.index === 0) ? "CONSENT_ACCEPT" : "CONSENT_DECLINE";
                const realId = msg.id || msg.payload || btnId;

                msg.type = "interactive";
                msg.interactive = {
                    type: "button_reply",
                    button_reply: { id: realId, title: msg.text || "Button" }
                };
            }

            console.log(`🤖 Bot procesando mensaje de ${wa_id || "?"}...`);
            console.log("   MSG Payload:", JSON.stringify(msg));
            await processIncomingWhatsApp(value, msg);

            console.log("✅ Lógica de Bot ejecutada correctamente.");

        } else {
            console.warn("⚠️ Tipo de trabajo desconocido:", type);
        }

        // Marcar completado
        await supabase
            .from("bot_queue")
            .update({ status: "completed", response_data: { success: true } })
            .eq("id", job.id);

    } catch (err) {
        console.error("❌ Error en Worker:", err);
        await supabase
            .from("bot_queue")
            .update({ status: "failed", response_data: { error: err.message } })
            .eq("id", job.id);
    }
}

// 🚀 STARTUP: Recuperar pendientes
async function processPending(silent = false) {
    const { data, error } = await supabase
        .from("bot_queue")
        .select("*")
        .eq("status", "pending")
        .limit(50); // Lote de 50

    if (data && data.length > 0) {
        console.log(`🔄 Recuperando ${data.length} trabajos anteriores...`);
        for (const job of data) {
            await processJob(job);
        }
    } else if (!silent) {
        console.log("✅ No hay trabajos pendientes acumulados.");
    }
}

// Main
console.log("👷 Local Worker Iniciado (Modo: Bot Brain) - Esperando mensajes...");

// 1. Escuchar Tiempo Real
supabase
    .channel("queue-listener")
    .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "bot_queue", filter: "status=eq.pending" },
        async (payload) => {
            console.log(`📥 Nuevo evento realtime: ${payload.new.id}`);
            await processJob(payload.new);
        }
    )
    .subscribe((status) => {
        console.log("📡 Estado de suscripción:", status);
        // 2. Al conectar, revisar pendientes
        if (status === 'SUBSCRIBED') {
            processPending();
        }
    });

// 2. 🛡️ SISTEMA DE RESPALDO (Polling):
// Si Realtime falla (como ahora), esto revisa la BD cada 5 segundos.
console.log("⏰ Iniciando Polling de Respaldo (Cada 5s)...");
setInterval(() => {
    processPending(true); // true = modo silencioso para no llenar el log
}, 5000);
