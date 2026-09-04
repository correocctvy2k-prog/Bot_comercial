const crypto = require('node:crypto');

function ipv4Prefix24(value) {
  const parts = String(value || '').trim().split('.').map(Number);
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) return null;
  return `${parts[0]}.${parts[1]}.${parts[2]}.0/24`;
}

function protectedSegmentId(value) {
  const suffix = crypto.createHash('sha256').update(`operations:${value}`).digest('hex').slice(0, 8).toUpperCase();
  return `segment ${suffix}`;
}

function aggregateExpectedNetworks(rows = []) {
  const groups = new Map();
  for (const row of rows) {
    if (row.is_permanently_closed === true || row.permanently_closed === true) continue;
    const cidr = ipv4Prefix24(row.ip);
    if (!cidr) continue;
    const zone = String(row.segment || 'SIN ZONA').trim().toUpperCase();
    const key = `${zone}|${cidr}`;
    const item = groups.get(key) || { id: protectedSegmentId(key), cidr, zone, expectedPoints: 0, onlinePoints: 0, referenceIps: [], knownIps: new Set(), lastActivityAt: null };
    item.expectedPoints += 1;
    if (row.active === true) item.onlinePoints += 1;
    if (row.ip) {
      item.knownIps.add(row.ip);
      if (item.referenceIps.length < 3 && !item.referenceIps.includes(row.ip)) item.referenceIps.push(row.ip);
    }
    if (row.last_online_at && (!item.lastActivityAt || row.last_online_at > item.lastActivityAt)) item.lastActivityAt = row.last_online_at;
    groups.set(key, item);
  }
  return [...groups.values()].map(({ knownIps, ...item }) => ({ ...item, knownIpCount: knownIps.size }))
    .sort((a, b) => a.zone.localeCompare(b.zone) || a.cidr.localeCompare(b.cidr));
}

function createOperationsPointsCatalog({ url, key, fetchImpl = fetch }) {
  if (!url || !key) return async () => [];
  const base = String(url).replace(/\/$/, '');
  return async () => {
    const response = await fetchImpl(`${base}/rest/v1/puntos_venta?select=ip,segment,active,last_online_at,is_permanently_closed,permanently_closed&or=(is_permanently_closed.eq.false,is_permanently_closed.is.null)&limit=5000`, {
      headers: { apikey: key, Authorization: `Bearer ${key}`, Accept: 'application/json' },
    });
    if (!response.ok) throw new Error('OPERATIONS_POINTS_UNAVAILABLE');
    return aggregateExpectedNetworks(await response.json());
  };
}

function mergeExpectedNetworks(observed, expected) {
  const items = observed.map((item) => ({ ...item, expectedPoints: 0, expectedZones: [], coverageStatus: 'OBSERVED_ONLY' }));
  for (const network of expected) {
    const prefix = network.cidr.replace(/\.0\/24$/, '.');
    const match = items.find((item) => (item.referenceIps || []).some((ip) => ip.startsWith(prefix)));
    if (match) {
      match.expectedPoints += network.expectedPoints;
      match.knownIpCount = Math.max(match.knownIpCount || 0, network.knownIpCount || 0);
      if (!match.expectedZones.includes(network.zone)) match.expectedZones.push(network.zone);
      match.coverageStatus = 'EXPECTED_AND_OBSERVED';
    } else {
      items.push({
        id: network.id, label: `Red esperada ${network.cidr}`, interfaceName: `${network.zone} · ${network.cidr}`,
        referenceIps: network.referenceIps, observations: 0, active: 0, intermittent: 0, inactive: 0,
        staleReview: 0, ephemeralMacs: 0, lastActivityAt: network.lastActivityAt,
        expectedPoints: network.expectedPoints, onlinePoints: network.onlinePoints,
        knownIpCount: network.knownIpCount,
        expectedZones: [network.zone], coverageStatus: 'EXPECTED_NOT_OBSERVED',
        classificationStatus: 'PENDING', inferredCidr: network.cidr, cidrConfidence: 'INFERRED_PREFIX_24',
      });
    }
  }
  return items.sort((a, b) => (a.coverageStatus === 'EXPECTED_NOT_OBSERVED' ? -1 : 1) - (b.coverageStatus === 'EXPECTED_NOT_OBSERVED' ? -1 : 1) || b.observations - a.observations);
}

module.exports = { aggregateExpectedNetworks, createOperationsPointsCatalog, ipv4Prefix24, mergeExpectedNetworks };
