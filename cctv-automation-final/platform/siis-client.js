'use strict';

const DEFAULT_TIMEOUT_MS = 8000;

function requiredConfig(env = process.env) {
  const config = {
    baseUrl: String(env.SIISS_URL || '').trim().replace(/\/$/, ''),
    username: String(env.SIISS_USER || '').trim(),
    password: String(env.SIISS_PASS || ''),
    timeoutMs: Number(env.SIISS_TIMEOUT_MS || DEFAULT_TIMEOUT_MS),
  };
  const missing = [];
  if (!config.baseUrl) missing.push('SIISS_URL');
  if (!config.username) missing.push('SIISS_USER');
  if (!config.password) missing.push('SIISS_PASS');
  if (missing.length) throw new Error(`Configuración SIIS incompleta: ${missing.join(', ')}`);
  if (!Number.isFinite(config.timeoutMs) || config.timeoutMs < 1000 || config.timeoutMs > 60000) throw new Error('SIISS_TIMEOUT_MS debe estar entre 1000 y 60000');
  return config;
}

async function requestJson(fetchImpl, url, options, timeoutMs) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetchImpl(url, { ...options, signal: controller.signal });
    if (!response.ok) throw new Error(`SIIS respondió HTTP ${response.status}`);
    return await response.json();
  } catch (error) {
    if (error.name === 'AbortError') throw new Error(`SIIS excedió el tiempo límite de ${timeoutMs} ms`);
    throw error;
  } finally { clearTimeout(timer); }
}

function minimalStation(raw) {
  return {
    estacodi: raw?.estacodi == null ? null : String(raw.estacodi).trim(),
    estanomb: raw?.estanomb == null ? null : String(raw.estanomb).trim(),
    estaping: raw?.estaping ?? null,
  };
}

async function fetchStations({ env = process.env, fetchImpl = globalThis.fetch } = {}) {
  if (typeof fetchImpl !== 'function') throw new Error('No hay implementación fetch disponible');
  const config = requiredConfig(env);
  const login = await requestJson(fetchImpl, `${config.baseUrl}/siiss-login/api/v1/qvaccesosys/login`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: config.username, password: config.password }),
  }, config.timeoutMs);
  if (!login?.token) throw new Error('SIIS autenticó sin entregar token');
  const stations = await requestJson(fetchImpl, `${config.baseUrl}/siiss-basicas/api/v1/qvestaciones/estacionesByPing`, {
    headers: { Authorization: `Bearer ${login.token}` },
  }, config.timeoutMs);
  if (!Array.isArray(stations)) throw new Error('SIIS entregó una respuesta de estaciones inesperada');
  return stations.map(minimalStation);
}

module.exports = { DEFAULT_TIMEOUT_MS, requiredConfig, minimalStation, fetchStations };
