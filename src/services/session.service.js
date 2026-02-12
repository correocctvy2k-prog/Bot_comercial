// src/services/session.service.js

const sessions = new Map(); // wa_id -> { step, name, consent, updatedAt }

const DEFAULT_SESSION = Object.freeze({
  step: "NEW",
  name: null,
  consent: null,
});

function initSession(waId) {
  const s = { ...DEFAULT_SESSION, updatedAt: Date.now() };
  sessions.set(waId, s);
  return s;
}

function getSession(waId) {
  if (!waId) return { ...DEFAULT_SESSION, updatedAt: Date.now() }; // evita crasheos si llega vacío
  if (!sessions.has(waId)) return initSession(waId);
  return sessions.get(waId);
}

function setSession(waId, patch = {}) {
  const s = getSession(waId);

  // Normaliza patch sin reventar
  const next = {
    ...s,
    ...patch,
    updatedAt: Date.now(),
  };

  sessions.set(waId, next);
  return next;
}

function resetSession(waId) {
  sessions.delete(waId);
}

function hasSession(waId) {
  return sessions.has(waId);
}

// Útil para debug/observabilidad
function getSessionsCount() {
  return sessions.size;
}

module.exports = {
  getSession,
  setSession,
  resetSession,
  hasSession,
  getSessionsCount,
};
