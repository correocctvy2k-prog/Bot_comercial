const { VERIFY_TOKEN, PHONE_NUMBER_ID } = require("../config/env");
const { verifyMetaSignature } = require("../utils/signature");
const { logIncoming } = require("../utils/logger");
const { seenBefore } = require("../utils/dedupe");
const { processIncomingWhatsApp } = require("../services/bot.service");
const { supabase } = require("../config/supabase");

function verifyWebhookGet(req, res) {
  const mode = req.query["hub.mode"];
  const token = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];

  if (mode === "subscribe" && token === VERIFY_TOKEN) {
    return res.status(200).send(challenge);
  }
  return res.sendStatus(403);
}

async function handleWebhookPost(req, res) {
  // 🔥 FIRE & FORGET (v12.0.8): Responder a Meta 200 OK INMEDIATAMENTE.
  // Esto evita que Meta reintente el webhook si nuestro bot de IA se tarda más de 15 segundos en contestar.
  res.status(200).send("EVENT_RECEIVED");

  // Log SIEMPRE para depuración
  logIncoming(req);

  // Firma opcional (si configuras APP_SECRET)
  if (!verifyMetaSignature(req)) {
    console.warn("⚠️ [WEBHOOK] Firma Meta no válida.");
    return;
  }

  const body = req.body;
  if (!body || !body.object) return;

  for (const entry of body.entry || []) {
    for (const change of entry.changes || []) {
      const value = change.value || {};

      // Mensajes entrantes
      for (const msg of value.messages || []) {
        const msgId = msg.id;
        if (seenBefore(msgId)) {
          console.log(`♻️ Msg duplicado ignorado: ${msgId}`);
          continue;
        }

        try {
          const phoneNumberId = value.metadata?.phone_number_id || "";
          console.log(`📡 Webhook recibido para ID: ${phoneNumberId}`);

          // Todo entra directo al canal asamblea, ya no importa si viene de la URL principal
          const channel = "bot_asamblea_main";

          console.log(`🚀 Procesando msg de Asamblea de ${msg.from}...`);
          // Lo procesamos de forma asíncrona sin bloquear el request porque ya enviamos 200
          await processIncomingWhatsApp(value, msg, channel);
          console.log(`✅ Msg procesado exitosamente: ${msgId}`);
        } catch (err) {
          console.error(`❌ Error fatal procesando msg ${msgId}:`, err.message);
        }
      }

      // Statuses (opcional)
      for (const st of value.statuses || []) {
        // Puedes loguear o guardar en DB si quieres
        // console.log("STATUS:", st.status, st.id);
      }
    }
  }
}



// v12.3.0: Webhook específico para el Bot de Asamblea (Telegram)
async function handleTelegramAsambleaWebhook(req, res) {
  // ⚡ FIRE & FORGET
  res.status(200).send("OK");

  const body = req.body;
  if (!body) return;

  try {
    let tgId, name, text, payload, msgId;
    let isButton = false;

    if (body.message) {
      if (!body.message.from || !body.message.chat) return;
      tgId = "tg_" + body.message.from.id;
      name = body.message.from.first_name || "Asistente";
      text = body.message.text || "";
      msgId = "tg_msg_" + body.message.message_id;
    } else if (body.callback_query) {
      tgId = "tg_" + body.callback_query.from.id;
      name = body.callback_query.from.first_name || "Asistente";
      payload = body.callback_query.data;
      msgId = "tg_cb_" + body.callback_query.id;
      isButton = true;
    } else {
      return;
    }

    if (seenBefore(msgId)) {
      console.log(`♻️ [TG-Asamblea] Msg duplicado ignorado: ${msgId}`);
      return;
    }
    // msgId is now registered by seenBefore() above — no second call needed
    

    // Mock WA object format to reuse the logic engine seamlessly
    const mockValue = {
      contacts: [{ profile: { name } }]
    };

    let mockMsg;
    if (isButton) {
      mockMsg = {
        id: msgId,
        from: tgId,
        type: "interactive",
        interactive: {
          type: "button_reply",
          button_reply: { id: payload, title: payload }
        }
      };
    } else {
      mockMsg = {
        id: msgId,
        from: tgId,
        type: "text",
        text: { body: text }
      };
    }

    console.log(`🚀 [TG-Asamblea] Procesando msg de ${tgId}...`);
    // Apuntar al canal "bot_asamblea_main" que insertamos en base de datos
    await processIncomingWhatsApp(mockValue, mockMsg, "bot_asamblea_main");
    console.log(`✅ [TG-Asamblea] Msg procesado exitosamente: ${msgId}`);

  } catch (err) {
    console.error(`❌ Error en TG-Asamblea Webhook:`, err.message);
  }
}

module.exports = {
  verifyWebhookGet,
  handleWebhookPost,
  handleTelegramAsambleaWebhook
};
