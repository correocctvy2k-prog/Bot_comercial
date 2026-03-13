const { processIncomingAsamblea } = require("./ai.service");
const { normWaId } = require("../utils/text.utils");

const processingLocks = new Set();

async function processIncomingWhatsApp(value, msg, channelId) {
  const waId = normWaId(msg?.from);
  if (!waId) return;

  // 🔒 BLOQUEO DE CONCURRENCIA
  if (processingLocks.has(waId)) {
    console.warn(`🔒 [RATE-LIMIT] Ignorando mensaje concurrente de Asamblea ${waId} (Ya procesando...)`);
    return;
  }

  processingLocks.add(waId);

  try {
    // Todo recae sobre la lógica específica de la Asamblea
    await processIncomingAsamblea(waId, value, msg, channelId);
  } catch (err) {
    console.error("❌ Error crítico procesando mensaje WA Asamblea:", err);
  } finally {
    // 🔓 DESBLOQUEO DE CONCURRENCIA
    processingLocks.delete(waId);
  }
}

module.exports = {
  processIncomingWhatsApp
};
