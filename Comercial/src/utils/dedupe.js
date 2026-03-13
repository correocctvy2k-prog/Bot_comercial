const seen = new Map(); // msgId -> timestamp
// v12.0.8: Aumentado TTL a 24 horas para cubrir el ciclo entero de reintentos de Meta.
const TTL_MS = 24 * 60 * 60 * 1000;

function cleanup() {
  const now = Date.now();
  for (const [id, ts] of seen.entries()) {
    if (now - ts > TTL_MS) seen.delete(id);
  }
}

function seenBefore(msgId) {
  if (!msgId) return false;
  cleanup();
  if (seen.has(msgId)) return true;
  seen.set(msgId, Date.now());
  return false;
}

module.exports = { seenBefore };
