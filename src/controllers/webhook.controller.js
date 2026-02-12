const { VERIFY_TOKEN } = require("../config/env");
const { verifyMetaSignature } = require("../utils/signature");
const { logIncoming } = require("../utils/logger");
const { seenBefore } = require("../utils/dedupe");
const { processIncomingWhatsApp } = require("../services/bot.service");

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
  // Log SIEMPRE para depuración
  logIncoming(req);

  // Firma opcional (si configuras APP_SECRET)
  if (!verifyMetaSignature(req)) return res.sendStatus(403);

  const body = req.body;
  if (!body || !body.object) return res.sendStatus(404);

  for (const entry of body.entry || []) {
    for (const change of entry.changes || []) {
      const value = change.value || {};

      // Mensajes entrantes
      for (const msg of value.messages || []) {
        const msgId = msg.id;
        if (seenBefore(msgId)) continue;

        await processIncomingWhatsApp(value, msg);
      }

      // Statuses (opcional)
      for (const st of value.statuses || []) {
        // Puedes loguear o guardar en DB si quieres
        // console.log("STATUS:", st.status, st.id);
      }
    }
  }

  // Responder rápido
  return res.sendStatus(200);
}

module.exports = { verifyWebhookGet, handleWebhookPost };
