const { supabase } = require('../config/supabase');
const { SUPABASE_URL, SUPABASE_KEY } = process.env;

const cache = new Map(); // wa_id -> { data, expiresAt }
const TTL_MS = 30000; // 30 segundos de caché para reducir lecturas en ráfagas

const DEFAULT_SESSION = {
  step: "NEW",
  name: null,
  consent: null,
  data: {}
};

async function initSession(waId) {
  const s = { ...DEFAULT_SESSION };
  try {
    const configPromise = supabase
      .from('bot_sessions')
      .upsert({ wa_id: waId, ...s, updated_at: new Date() })
      .select()
      .single();

    const timeoutPromise = new Promise((_, reject) =>
      setTimeout(() => reject(new Error("Timeout initSession (8s)")), 8000)
    );

    const { data, error } = await Promise.race([configPromise, timeoutPromise]);

    if (error) console.error("❌ Error initSession:", error.message);

    const result = data || { wa_id: waId, ...s };
    cache.set(waId, { data: result, expiresAt: Date.now() + TTL_MS });
    return result;
  } catch (e) {
    console.error("❌ Excepción en initSession:", e.message);
    return { wa_id: waId, ...s };
  }
}

async function getSession(waId) {
  if (!waId) return { ...DEFAULT_SESSION };

  const now = Date.now();
  const cached = cache.get(waId);
  if (cached && cached.expiresAt > now) return cached.data;

  try {
    const configPromise = supabase
      .from('bot_sessions')
      .select('*')
      .eq('wa_id', waId)
      .single();

    const timeoutPromise = new Promise((_, reject) =>
      setTimeout(() => reject(new Error("Timeout getSession (8s)")), 8000)
    );

    const { data, error } = await Promise.race([configPromise, timeoutPromise]);

    if (error) {
      if (error.code === 'PGRST116') {
        return initSession(waId);
      }
      console.error("❌ Error getSession:", error.message);
      return { wa_id: waId, ...DEFAULT_SESSION };
    }

    if (!data) return initSession(waId);

    cache.set(waId, { data, expiresAt: now + TTL_MS });
    return data;
  } catch (e) {
    console.error("❌ Excepción en getSession:", e.message);
    return { wa_id: waId, ...DEFAULT_SESSION };
  }
}

async function setSession(waId, patch = {}) {
  const s = await getSession(waId);
  const next = { ...s, ...patch, updated_at: new Date() };

  // Limpiar campos que no van a la DB si existen
  delete next.wa_id;

  const { data, error } = await supabase
    .from('bot_sessions')
    .update(next)
    .eq('wa_id', waId)
    .select()
    .single();

  if (error) {
    console.error("❌ Error setSession:", error.message);
    // Fallback a actualización en caché al menos
    cache.set(waId, { data: { wa_id: waId, ...next }, expiresAt: Date.now() + TTL_MS });
    return { wa_id: waId, ...next };
  }

  cache.set(waId, { data, expiresAt: Date.now() + TTL_MS });
  return data;
}

async function resetSession(waId) {
  cache.delete(waId);
  await supabase.from('bot_sessions').delete().eq('wa_id', waId);
}

async function hasSession(waId) {
  const s = await getSession(waId);
  return !!s && s.step !== "NEW";
}

async function getSessionsCount() {
  const { count, error } = await supabase
    .from('bot_sessions')
    .select('*', { count: 'exact', head: true });
  return error ? 0 : count;
}

module.exports = {
  getSession,
  setSession,
  resetSession,
  hasSession,
  getSessionsCount,
};
