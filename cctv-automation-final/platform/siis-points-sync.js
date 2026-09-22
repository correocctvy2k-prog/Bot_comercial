'use strict';

// spec 0014 — cruza estaciones SIIS (ya normalizadas por platform/siis.js) contra
// `puntos_venta.siiss_id` para mantener siiss_active/siiss_last_sync al día, sin pasar por
// Asamblea (módulo que puede desaparecer). A diferencia de sync-crm-points.js (spec 0012, que
// cruza contra el catálogo canónico `locations` y requiere revisión humana de identidad), aquí
// el match es 1:1 por siiss_id ya confirmado en Operación de Puntos: no hay identidad nueva que
// decidir, solo un estado vivo que refrescar.

const { fetchStations } = require('./siis-client');
const { normalizeSiisSnapshot } = require('./siis');

function requireSupabaseEnv(env = process.env) {
  const url = String(env.SUPABASE_URL || '').trim();
  const key = String(env.SUPABASE_SERVICE_ROLE_KEY || '').trim();
  if (!url || !key) throw new Error('Falta SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY en .env (spec 0014)');
  return { url: url.replace(/\/$/, ''), key };
}

async function fetchCrmPoints({ url, key }, fetchImpl) {
  const query = 'select=id,siiss_id,siiss_active&siiss_id=not.is.null&or=(is_permanently_closed.eq.false,is_permanently_closed.is.null)';
  const response = await fetchImpl(`${url}/rest/v1/puntos_venta?${query}`, {
    headers: { apikey: key, Authorization: `Bearer ${key}` },
  });
  if (!response.ok) throw new Error(`Supabase (lectura puntos_venta) respondió ${response.status}`);
  return response.json();
}

async function patchPoint({ url, key }, fetchImpl, crmPointId, patch) {
  const response = await fetchImpl(`${url}/rest/v1/puntos_venta?id=eq.${encodeURIComponent(crmPointId)}`, {
    method: 'PATCH',
    headers: { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json', Prefer: 'return=minimal' },
    body: JSON.stringify(patch),
  });
  if (!response.ok) throw new Error(`Supabase (PATCH ${crmPointId}) respondió ${response.status}: ${await response.text().catch(() => '')}`);
}

/**
 * Cruza estaciones SIIS normalizadas (`{siisCode, online}`, ver `normalizeSiisSnapshot`) contra
 * puntos de `puntos_venta` (`{id, siiss_id}`). `siiss_active` solo se sobreescribe cuando SIIS
 * reporta un `estaping` conocido (`online` no nulo); si SIIS no informa el ping para esa
 * estación, se deja el valor anterior intacto y solo se refresca `siiss_last_sync`, para no
 * convertir "SIIS no dijo nada" en un falso "inactivo".
 * @returns {Array<{crmPointId, patch: {siiss_active?: boolean, siiss_last_sync: string}}>}
 */
function diffSiissStatus(stations, crmPoints, now = new Date().toISOString()) {
  const byCode = new Map((stations || []).filter((s) => s.siisCode).map((s) => [s.siisCode, s]));
  const updates = [];
  for (const point of crmPoints || []) {
    const code = String(point.siiss_id || '').trim();
    if (!code) continue;
    const station = byCode.get(code);
    if (!station) continue;
    const patch = { siiss_last_sync: now };
    if (station.online != null) patch.siiss_active = station.online;
    updates.push({ crmPointId: point.id, patch });
  }
  return updates;
}

/** Orquesta un ciclo completo: SIIS en vivo -> lectura Supabase -> diff -> escritura Supabase. */
async function syncSiissPoints({ env = process.env, fetchImpl = globalThis.fetch, dryRun = false } = {}) {
  const supabase = requireSupabaseEnv(env);
  const rawStations = await fetchStations({ env, fetchImpl });
  const stations = normalizeSiisSnapshot(rawStations);
  const crmPoints = await fetchCrmPoints(supabase, fetchImpl);
  const updates = diffSiissStatus(stations, crmPoints);

  const errors = [];
  if (!dryRun) {
    for (const update of updates) {
      try {
        await patchPoint(supabase, fetchImpl, update.crmPointId, update.patch);
      } catch (error) {
        errors.push({ crmPointId: update.crmPointId, error: error.message });
      }
    }
  }

  return {
    stations: stations.length,
    crmPoints: crmPoints.length,
    matched: updates.length,
    updated: dryRun ? 0 : updates.length - errors.length,
    errors,
  };
}

module.exports = { diffSiissStatus, syncSiissPoints };
