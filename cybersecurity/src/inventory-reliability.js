// Índice de confiabilidad por host + detección de "mismo equipo, varias tarjetas de red".
//
// Contexto (decisión del usuario, 2026-09-15): en la organización es común mover, reparar o
// reasignar equipos sin actualizar el registro en FortiGate/Kaspersky. Muchos de los 417
// candidatos en CONFLICT_REVIEW no son conflictos reales sino: (a) un mismo servidor visto
// varias veces por tener varias tarjetas de red, o (b) ruido esperado de WiFi/DHCP (MAC
// aleatoria + reasignación de IP). Este módulo NO decide nada por sí solo — calcula una señal
// (0-100 + motivos en texto) para que un humano priorice qué revisar primero.
//
// v1 usa solo datos ya disponibles de una sola captura (sin sondeo en vivo todavía):
//   - cuánto tiempo llevaba el host visto de forma continua antes del corte (source_seen_seconds)
//   - si el mismo equipo también aparece corroborado por otra fuente (cyber_cross_source_matches)
//   - señales de identidad ya calculadas (quality_flags / reason_codes)
//   - si el "conflicto" es en realidad el mismo equipo con varias tarjetas de red

const MAX_PRESENCE_DAYS = 28; // rango real observado en la captura actual (0-28 días)
const MAC_GROUP_MAX_DISTANCE = 4; // 70:10:6f:bb:5a:84 vs :85 (distancia 1) sí; OUI compartido
// por azar entre dos VMs de VirtualBox (08:00:27:5a:01:15 vs 08:00:27:b0:fc:5f) no.

function normalizeMac(value) {
  return String(value || '').toLowerCase().replace(/[^0-9a-f]/g, '');
}

function macPrefixAndSuffix(mac) {
  const normalized = normalizeMac(mac);
  if (normalized.length !== 12) return null;
  return { prefix: normalized.slice(0, 10), suffix: parseInt(normalized.slice(10), 16) };
}

// ¿Estas dos MAC son, con alta probabilidad, dos tarjetas de red del MISMO equipo físico?
// Exige que coincidan los primeros 5 octetos (fabricante + serie de placa) y que el último
// octeto difiera muy poco — así una coincidencia de fabricante entre dos equipos distintos
// (ej. dos VM de VirtualBox, mismo OUI 08:00:27 pero MAC final aleatoria) no agrupa.
function isSameDeviceMacPair(macA, macB) {
  const a = macPrefixAndSuffix(macA);
  const b = macPrefixAndSuffix(macB);
  if (!a || !b) return false;
  if (a.prefix !== b.prefix) return false;
  return Math.abs(a.suffix - b.suffix) <= MAC_GROUP_MAX_DISTANCE;
}

function isGenericHostname(hostname) {
  const normalized = String(hostname || '').trim().toLowerCase();
  if (!normalized) return true;
  return ['linux', 'localhost', 'unknown', 'android', 'iphone'].includes(normalized);
}

// Agrupa observaciones de una misma captura que probablemente son UN solo equipo físico visto
// por varias tarjetas de red: mismo hostname real (no genérico) Y todas las MAC del grupo son
// pares "misma placa" entre sí. Devuelve un Map observationId -> { groupId, memberIds, hasIp }.
function detectDeviceGroups(observations) {
  const byHostname = new Map();
  for (const obs of observations) {
    const hostname = String(obs.hostnameRaw || obs.hostname_raw || '').trim();
    if (!hostname || isGenericHostname(hostname)) continue;
    const key = hostname.toLowerCase();
    const list = byHostname.get(key) || [];
    list.push(obs);
    byHostname.set(key, list);
  }

  const result = new Map();
  for (const [hostname, group] of byHostname) {
    if (group.length < 2) continue;
    const macs = group.map((o) => o.macValue || o.mac_value).filter(Boolean);
    if (macs.length !== group.length) continue; // algún miembro sin MAC: no se puede confirmar
    const allPairsMatch = macs.every((macA, i) => macs.every((macB, j) => i === j || isSameDeviceMacPair(macA, macB)));
    if (!allPairsMatch) continue;
    const groupId = `device-group:${hostname}`;
    const memberIds = group.map((o) => o.id);
    const hasIp = group.some((o) => o.ipValue || o.ip_value);
    for (const obs of group) result.set(obs.id, { groupId, memberIds, memberCount: group.length, hasIp });
  }
  return result;
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

// candidate: { sourceSeenSeconds, qualityFlags: string[], reasonCodes: string[] }
// context: { hasCrossSourceMatch: boolean, deviceGroup: { memberCount } | null }
function computeReliabilityScore(candidate, context = {}) {
  const qualityFlags = candidate.qualityFlags || [];
  const reasonCodes = candidate.reasonCodes || [];
  const isGrouped = Boolean(context.deviceGroup);
  const signals = [];

  const seenDays = Number(candidate.sourceSeenSeconds) > 0 ? Number(candidate.sourceSeenSeconds) / 86400 : 0;
  const presenceScore = clamp(Math.round((Math.min(seenDays, MAX_PRESENCE_DAYS) / MAX_PRESENCE_DAYS) * 40), 0, 40);
  if (seenDays >= 1) signals.push(`visto de forma continua ${seenDays.toFixed(1)} días antes del corte`);
  else signals.push('recién detectado en esta captura (sin historial de presencia)');

  let corroborationScore = 0;
  if (context.hasCrossSourceMatch) {
    corroborationScore = 30;
    signals.push('corroborado por otra fuente (mismo equipo visto también en Kaspersky)');
  }

  let identityScore = 15;
  const hasRealHostname = !isGenericHostname(candidate.hostnameRaw);
  if (hasRealHostname) { identityScore += 15; }
  if (qualityFlags.includes('MISSING_HOSTNAME')) { identityScore -= 15; signals.push('sin nombre de host'); }
  if (qualityFlags.includes('LOCALLY_ADMINISTERED_MAC') && !isGrouped) {
    identityScore -= 10;
    signals.push('MAC administrada localmente (aleatoria o virtual, identidad débil)');
  }
  if (reasonCodes.includes('DUPLICATE_IP_IN_SNAPSHOT') && !isGrouped) {
    identityScore -= 10;
    signals.push('IP duplicada en la misma captura, sin explicación de equipo compartido');
  }
  identityScore = clamp(identityScore, 0, 30);

  if (isGrouped) {
    signals.push(`agrupado con otras ${context.deviceGroup.memberCount - 1} observación(es): parece el mismo equipo con varias tarjetas de red`);
  }

  const score = clamp(presenceScore + corroborationScore + identityScore, 0, 100);
  const label = score >= 70 ? 'ALTA' : score >= 40 ? 'MEDIA' : 'BAJA';

  // Alerta independiente del puntaje: dos equipos DISTINTOS reclamando la misma IP en la misma
  // captura (no es el patrón "misma placa, mismo equipo") merece revisión humana igual, aunque
  // cada observación individual tenga buena identidad por su cuenta.
  const needsManualReview = reasonCodes.includes('DUPLICATE_IP_IN_SNAPSHOT') && !isGrouped;

  return { score, label, needsManualReview, signals };
}

module.exports = {
  MAC_GROUP_MAX_DISTANCE,
  MAX_PRESENCE_DAYS,
  computeReliabilityScore,
  detectDeviceGroups,
  isGenericHostname,
  isSameDeviceMacPair,
};
