const crypto = require('node:crypto');
const { ipv4ToNumber, networkFacts } = require('./network-math');

function containsIp(policy, ip) {
  const value = ipv4ToNumber(ip);
  if (value === null) return false;
  try {
    const facts = networkFacts(policy.networkAddress, policy.prefixLength);
    const network = ipv4ToNumber(facts.networkAddress);
    const broadcast = ipv4ToNumber(facts.broadcast);
    return value >= network && value <= broadcast;
  } catch { return false; }
}

function residualId(parentId, bucket) {
  const suffix = crypto.createHash('sha256').update(`split:${parentId}:${bucket}`).digest('hex').slice(0, 8).toUpperCase();
  return `segment ${suffix}`;
}

function prefix24(ip) {
  const parts = String(ip || '').split('.');
  return parts.length === 4 && ipv4ToNumber(ip) !== null ? `${parts[0]}.${parts[1]}.${parts[2]}.0/24` : 'SIN-IP';
}

function inferDominantNetwork(members = [], minimumShare = 0.8) {
  const ips = [...new Set(members.map((member) => member.ip).filter((ip) => ipv4ToNumber(ip) !== null))];
  if (ips.length < 2) return null;
  const counts = new Map();
  for (const ip of ips) {
    const bucket = prefix24(ip);
    counts.set(bucket, (counts.get(bucket) || 0) + 1);
  }
  const [cidr, count] = [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0];
  if (count / ips.length < minimumShare) return null;
  const [networkAddress, prefix] = cidr.split('/');
  return { networkAddress, prefixLength: Number(prefix), matchingIpCount: count, totalIpCount: ips.length };
}

function summarizeMembers(item, members) {
  const uniqueIps = [...new Set(members.map((member) => member.ip).filter(Boolean))];
  const counts = { ACTIVE: 0, INTERMITTENT: 0, INACTIVE: 0, STALE_REVIEW: 0 };
  let ephemeralMacs = 0; let lastActivityAt = null;
  for (const member of members) {
    if (Object.hasOwn(counts, member.lifecycleStatus)) counts[member.lifecycleStatus] += 1;
    if (member.ephemeralMac) ephemeralMacs += 1;
    if (member.lastActivityAt && (!lastActivityAt || member.lastActivityAt > lastActivityAt)) lastActivityAt = member.lastActivityAt;
  }
  return {
    ...item, members, observations: members.length, knownIpCount: uniqueIps.length,
    referenceIps: uniqueIps.slice(0, 3), active: counts.ACTIVE,
    intermittent: counts.INTERMITTENT, inactive: counts.INACTIVE,
    staleReview: counts.STALE_REVIEW, ephemeralMacs, lastActivityAt,
  };
}

function consolidateNetworkSegments(items = []) {
  const rows = items.map((item) => ({ ...item, members: [...(item.members || [])] }));
  const applied = rows.filter((item) => item.classificationStatus === 'APPROVED' && item.policy?.networkAddress)
    .sort((a, b) => Number(b.policy.prefixLength) - Number(a.policy.prefixLength));
  const splitIds = new Set(rows.filter((item) => item.classificationStatus === 'NEEDS_SPLIT').map((item) => item.id));
  const incoming = new Map(); const retainedMembers = new Map(); const residuals = [];

  for (const source of rows) {
    const partitionApplied = source.classificationStatus === 'APPROVED' && source.policy?.networkAddress;
    if (!splitIds.has(source.id) && !partitionApplied) {
      retainedMembers.set(source.id, source.members);
      continue;
    }
    const buckets = new Map();
    for (const member of source.members) {
      if (partitionApplied && containsIp(source.policy, member.ip)) {
        const kept = retainedMembers.get(source.id) || [];
        kept.push(member); retainedMembers.set(source.id, kept);
        continue;
      }
      const target = applied.find((candidate) => candidate.id !== source.id && containsIp(candidate.policy, member.ip));
      if (target) {
        const targetMembers = incoming.get(target.id) || [];
        targetMembers.push(member); incoming.set(target.id, targetMembers);
      } else {
        const bucket = prefix24(member.ip);
        const bucketMembers = buckets.get(bucket) || [];
        bucketMembers.push(member); buckets.set(bucket, bucketMembers);
      }
    }
    for (const [bucket, members] of buckets) {
      const uniqueIpCount = new Set(members.map((member) => member.ip).filter(Boolean)).size;
      const observationStatus = bucket === 'SIN-IP' ? 'NO_IP_OBSERVATION' : uniqueIpCount === 1 ? 'HOST_OBSERVATION' : 'PENDING';
      residuals.push(summarizeMembers({
        ...source, id: residualId(source.id, bucket), label: `Pendiente ${bucket}`,
        interfaceName: `${source.interfaceName || source.label} · ${bucket}`,
        classificationStatus: observationStatus, policy: null, disposition: null,
        derivedFrom: source.id, inferredCidr: bucket === 'SIN-IP' ? null : bucket,
        cidrConfidence: bucket === 'SIN-IP' ? 'UNKNOWN' : 'INFERRED_PREFIX_24',
      }, members));
    }
  }

  const retained = rows.filter((item) => !splitIds.has(item.id)).map((item) => {
    const added = incoming.get(item.id) || [];
    const base = retainedMembers.get(item.id) || [];
    if (!added.length && base.length === item.members.length) return item;
    const known = new Set(base.map((member) => member.id));
    const merged = [...base, ...added.filter((member) => !known.has(member.id))];
    return { ...summarizeMembers(item, merged), reassignedObservations: added.length, excludedObservations: item.members.length - base.length };
  });
  return [...retained, ...residuals];
}

module.exports = { consolidateNetworkSegments, containsIp, inferDominantNetwork, prefix24 };
