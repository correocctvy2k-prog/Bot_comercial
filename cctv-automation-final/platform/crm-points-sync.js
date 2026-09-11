'use strict';

// spec 0012 — cruce y sincronización entre "Operación de Puntos" (Supabase `puntos_venta`)
// y el catálogo canónico de CCTV (`locations`). La lógica de match es la misma que ya
// probó `scripts/reconcile-crm-points.mjs` (SIIS exacto -> alias -> sin match), extraída
// aquí como funciones puras y testeables, más el cómputo de capacidades y el caché de
// horario que ese script no hacía.

function normalizeKey(value) {
  return String(value || '')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toUpperCase().replace(/[^A-Z0-9]+/g, ' ').trim();
}

function buildAliasIndex(locations, aliases) {
  const aliasesByKey = new Map();
  for (const alias of aliases || []) {
    const aliasKey = normalizeKey(alias.alias_key || alias.alias_raw);
    if (!aliasKey) continue;
    if (!aliasesByKey.has(aliasKey)) aliasesByKey.set(aliasKey, new Set());
    aliasesByKey.get(aliasKey).add(alias.location_id);
  }
  for (const location of locations || []) {
    const canonicalKey = normalizeKey(location.canonical_name);
    if (!canonicalKey) continue;
    if (!aliasesByKey.has(canonicalKey)) aliasesByKey.set(canonicalKey, new Set());
    aliasesByKey.get(canonicalKey).add(location.id);
  }
  return aliasesByKey;
}

/**
 * Cruza los puntos de Supabase (`puntos_venta`) contra el catálogo canónico CCTV.
 * Prioridad: SIIS exacto (`siiss_id` = `locations.siis_code`) > alias exacto > sin match.
 * Un `siiss_id` compartido por varios puntos CRM solo es válido si todos están marcados
 * `is_double` (jornadas compartiendo ubicación física); si no, queda `HELD`.
 * @returns {Array<{crmPointId, siisCode, locationId, method, decision}>}
 *   decision: 'AUTO_LINKABLE' (confiable, usable para escribir capacidades) |
 *             'REVIEW_REQUIRED' (alias, requiere confirmación humana de identidad) |
 *             'HELD' (ambiguo o sin match)
 */
function matchCrmPoints(crmPoints, locations, aliases) {
  const aliasesByKey = buildAliasIndex(locations, aliases);
  const bySiis = new Map((locations || []).filter((x) => x.siis_code).map((x) => [String(x.siis_code).trim(), x]));

  const crmBySiis = new Map();
  for (const point of crmPoints || []) {
    const code = String(point.siiss_id || '').trim();
    if (!code) continue;
    if (!crmBySiis.has(code)) crmBySiis.set(code, []);
    crmBySiis.get(code).push(point);
  }
  const duplicateSiisCodes = [...crmBySiis.entries()].filter(([, points]) => points.length > 1);
  const validSharedSiisCodes = new Set(
    duplicateSiisCodes.filter(([, points]) => points.every((point) => point.is_double)).map(([code]) => code),
  );

  return (crmPoints || []).map((point) => {
    const siisCode = String(point.siiss_id || '').trim();
    if (siisCode && bySiis.has(siisCode)) {
      const duplicated = (crmBySiis.get(siisCode)?.length || 0) > 1;
      const validSharedLocation = duplicated && validSharedSiisCodes.has(siisCode);
      return {
        crmPointId: point.id,
        siisCode,
        locationId: bySiis.get(siisCode).id,
        method: validSharedLocation ? 'SIIS_SHARED_DOUBLE_LOCATION' : duplicated ? 'SIIS_DUPLICATED_IN_CRM' : 'SIIS_EXACT',
        decision: validSharedLocation || !duplicated ? 'AUTO_LINKABLE' : 'HELD',
      };
    }
    const candidates = new Set();
    for (const candidateKey of [normalizeKey(point.alias), normalizeKey(point.name)]) {
      for (const id of aliasesByKey.get(candidateKey) || []) candidates.add(id);
    }
    if (candidates.size === 1) {
      return { crmPointId: point.id, siisCode: siisCode || null, locationId: [...candidates][0], method: 'ALIAS_EXACT', decision: 'REVIEW_REQUIRED' };
    }
    return { crmPointId: point.id, siisCode: siisCode || null, locationId: null, method: candidates.size > 1 ? 'ALIAS_AMBIGUOUS' : 'NO_MATCH', decision: 'HELD' };
  });
}

/** Capacidades reales de un punto según los datos ya calculados en CCTV.
 *  hasCctv = WITH_CCTV (spec 0010: envió correo Dahua en 30 días).
 *  hasAlarm = tiene al menos un sistema de alarma clasificado (spec `alarmsData()`). */
function computeCapabilities(locationId, { notifyingLocs, alarmLocationIds }) {
  return {
    hasCctv: notifyingLocs.has(locationId),
    hasAlarm: alarmLocationIds.has(locationId),
  };
}

/**
 * Solo las filas donde el valor real difiere del que hoy tiene Supabase. Solo considera
 * matches `AUTO_LINKABLE` (SIIS exacto): escribir sobre un match `REVIEW_REQUIRED` (alias)
 * arriesgaría corregir la capacidad del punto equivocado. El dato real siempre gana sobre
 * lo que hoy esté en Supabase, sin importar si fue editado a mano (decisión del usuario).
 */
function diffCapabilities(matches, crmPointsById, computeFor) {
  const updates = [];
  for (const m of matches) {
    if (m.decision !== 'AUTO_LINKABLE' || !m.locationId) continue;
    const point = crmPointsById.get(m.crmPointId);
    if (!point || point.is_permanently_closed) continue;
    const real = computeFor(m.locationId);
    const patch = {};
    if (Boolean(point.has_cctv) !== real.hasCctv) patch.has_cctv = real.hasCctv;
    if (Boolean(point.has_alarm) !== real.hasAlarm) patch.has_alarm = real.hasAlarm;
    if (Object.keys(patch).length) {
      updates.push({
        crmPointId: m.crmPointId,
        locationId: m.locationId,
        patch,
        before: { has_cctv: Boolean(point.has_cctv), has_alarm: Boolean(point.has_alarm) },
      });
    }
  }
  return updates;
}

/** "HH:MM" (o "HH:MM:SS") -> minutos del día. null si no parsea. */
function timeToMinutes(value) {
  const m = /^(\d{1,2}):(\d{2})/.exec(String(value || '').trim());
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h > 23 || min > 59) return null;
  return h * 60 + min;
}

/** Horario real por punto (solo los que tienen `has_custom_schedule=true` en Supabase),
 *  para cachear localmente y usarlo en `interpretPointDay` (spec 0012 §4.5). */
function buildScheduleCache(matches, crmPointsById) {
  const rows = [];
  for (const m of matches) {
    if (!m.locationId) continue;
    const point = crmPointsById.get(m.crmPointId);
    if (!point || !point.has_custom_schedule) continue;
    const openMin = timeToMinutes(point.custom_open_time);
    const closeMin = timeToMinutes(point.custom_close_time);
    if (openMin == null && closeMin == null) continue;
    rows.push({ locationId: m.locationId, openMin, closeMin });
  }
  return rows;
}

module.exports = {
  normalizeKey,
  matchCrmPoints,
  computeCapabilities,
  diffCapabilities,
  timeToMinutes,
  buildScheduleCache,
};
