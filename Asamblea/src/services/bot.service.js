// bot.service.js
// v2.0 — FIX #1: Reemplazado el bloqueo de descarte (drop-lock) por una
// cola de promesas por usuario (enqueueForUser). Esto garantiza que los
// mensajes concurrentes de un mismo usuario se procesen SECUENCIALMENTE
// en lugar de descartarse silenciosamente.

const { processIncomingAsamblea, enqueueForUser } = require("./ai.service");
const { normWaId } = require("../utils/text.utils");

async function processIncomingWhatsApp(value, msg, channelId) {
  const waId = normWaId(msg?.from);
  if (!waId) return;

  // 🔒 COLA POR USUARIO: en lugar de descartar mensajes concurrentes,
  // los encola para que se procesen en orden de llegada.
  enqueueForUser(waId, async () => {
    try {
      await processIncomingAsamblea(waId, value, msg, channelId);
    } catch (err) {
      console.error("❌ Error crítico procesando mensaje WA Asamblea:", err);
    }
  });
}

module.exports = {
  processIncomingWhatsApp
};
