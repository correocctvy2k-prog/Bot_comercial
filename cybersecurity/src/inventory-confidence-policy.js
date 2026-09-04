const POLICY_VERSION = 'inventory-confidence-v2';

function normalize(value) {
  return String(value || '').trim().toLowerCase();
}

function ageInDays(lastSeenAt, referenceTime = new Date()) {
  const seen = new Date(lastSeenAt);
  const reference = new Date(referenceTime);
  if (Number.isNaN(seen.getTime()) || Number.isNaN(reference.getTime())) return null;
  return Math.max(0, Math.floor((reference.getTime() - seen.getTime()) / 86400000));
}

function lifecycleFromAge(ageDays) {
  if (ageDays === null) return 'UNKNOWN';
  if (ageDays <= 7) return 'ACTIVE';
  if (ageDays <= 30) return 'INTERMITTENT';
  if (ageDays <= 90) return 'INACTIVE';
  return 'STALE_REVIEW';
}

function assessInventoryCandidate(candidate, referenceTime = new Date()) {
  const reasons = new Set(candidate.reasonCodes || []);
  const os = normalize(candidate.osFamily);
  const isWindows = os.includes('windows');
  const ageDays = ageInDays(candidate.lastSeenSourceAt || candidate.lastSeenAt, referenceTime);
  let identityConfidence = Number(candidate.confidence) || 0;
  let identityStrength = candidate.identityStrength || 'INSUFFICIENT';
  let authority = 'SUPPORTING';
  let networkProfile = 'UNCLASSIFIED';
  let addressMode = 'UNKNOWN';

  if (candidate.source === 'KASPERSKY' && isWindows) {
    authority = 'AUTHORITATIVE_WINDOWS';
    identityConfidence = Math.max(identityConfidence, 0.9);
    identityStrength = 'HIGH';
    reasons.add('KSC_MANAGED_WINDOWS_AUTHORITY');
    networkProfile = 'ADMINISTRATIVE_MANAGED';
    addressMode = 'FIXED_IP_EXPECTED';
  } else if (candidate.source === 'KASPERSKY') {
    authority = 'MANAGED_DEVICE_EVIDENCE';
    identityConfidence = Math.max(identityConfidence, 0.72);
    identityStrength = 'MEDIUM';
    reasons.add('KSC_MANAGED_DEVICE_EVIDENCE');
    networkProfile = 'MANAGED_OTHER';
  } else if (candidate.source === 'FORTIGATE') {
    authority = 'NETWORK_ACTIVITY_AUTHORITY';
    reasons.add('FORTIGATE_ACTIVITY_EVIDENCE');
    networkProfile = 'SEGMENT_POLICY_REQUIRED';
    reasons.add('NETWORK_SEGMENT_REQUIRES_CLASSIFICATION');
    if ((candidate.qualityFlags || []).includes('LOCALLY_ADMINISTERED_MAC')) {
      identityConfidence = Math.min(identityConfidence || 0.3, 0.35);
      identityStrength = 'LOW';
    }
  } else if (candidate.source === 'GREENBONE') {
    authority = 'VULNERABILITY_EVIDENCE';
    networkProfile = 'AUTHORIZED_SCAN_TARGET';
  } else if (candidate.source === 'CANONICAL') {
    authority = 'HUMAN_VERIFIED';
    networkProfile = 'CANONICAL';
    identityConfidence = 1;
    identityStrength = 'HIGH';
  }

  const lifecycleStatus = candidate.source === 'CANONICAL'
    ? 'ACTIVE'
    : lifecycleFromAge(ageDays);
  if (lifecycleStatus === 'STALE_REVIEW') reasons.add('NO_RECENT_ACTIVITY_OVER_90_DAYS');
  if (lifecycleStatus === 'INACTIVE') reasons.add('NO_RECENT_ACTIVITY_OVER_30_DAYS');

  return {
    ...candidate,
    confidence: Math.round(identityConfidence * 100) / 100,
    identityConfidence: Math.round(identityConfidence * 100) / 100,
    identityStrength,
    sourceAuthority: authority,
    lifecycleStatus,
    ageDays,
    identityPolicy: POLICY_VERSION,
    networkIdentityRule: 'IP_IS_LOCATION_NOT_IDENTITY',
    networkProfile,
    addressMode,
    reasonCodes: [...reasons],
  };
}

module.exports = {
  POLICY_VERSION,
  ageInDays,
  assessInventoryCandidate,
  lifecycleFromAge,
};
