const seen = new Map(); // msgId -> timestamp
const TTL_MS = 10 * 60 * 1000; // 10 minutos

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
