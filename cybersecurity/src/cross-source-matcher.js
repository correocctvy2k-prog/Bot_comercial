const { deterministicId } = require('./fortigate-importer');

const MATCH_POLICY_VERSION = 'exact-hostname-os-v1';

function osFamily(value) {
  const text = String(value || '').toLowerCase();
  for (const family of ['windows', 'linux', 'android', 'ios', 'macos', 'routeros']) {
    if (text.includes(family)) return family;
  }
  return null;
}

function groupByHostname(observations) {
  const groups = new Map();
  for (const observation of observations) {
    const key = String(observation.hostname_key || '').trim().toLowerCase();
    if (!key) continue;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(observation);
  }
  return groups;
}

function matchSnapshots({
  db,
  leftSnapshotId,
  rightSnapshotId,
  matchedAt = new Date().toISOString(),
  policyVersion = MATCH_POLICY_VERSION,
}) {
  if (!db) throw new Error('db is required');
  if (!leftSnapshotId || !rightSnapshotId) throw new Error('both snapshot ids are required');
  if (leftSnapshotId === rightSnapshotId) throw new Error('snapshots must be different');

  const runId = deterministicId('match', `${leftSnapshotId}:${rightSnapshotId}:${policyVersion}`);
  const existing = db.prepare(`
    SELECT id, summary_json AS summaryJson
    FROM cyber_cross_source_match_runs
    WHERE left_snapshot_id = ? AND right_snapshot_id = ? AND policy_version = ?
  `).get(leftSnapshotId, rightSnapshotId, policyVersion);
  if (existing) {
    return { status: 'ALREADY_MATCHED', matchRunId: existing.id, summary: JSON.parse(existing.summaryJson) };
  }

  const selectObservations = db.prepare(`
    SELECT id, hostname_key, os_family
    FROM cyber_asset_observations
    WHERE snapshot_id = ?
  `);
  const left = selectObservations.all(leftSnapshotId);
  const right = selectObservations.all(rightSnapshotId);
  const leftGroups = groupByHostname(left);
  const rightGroups = groupByHostname(right);
  const insertRun = db.prepare(`
    INSERT INTO cyber_cross_source_match_runs(
      id, left_snapshot_id, right_snapshot_id, policy_version, status, started_at
    ) VALUES (?, ?, ?, ?, 'PROCESSING', ?)
  `);
  const insertMatch = db.prepare(`
    INSERT INTO cyber_cross_source_matches(
      match_run_id, left_observation_id, right_observation_id, match_method,
      match_status, confidence, reason_codes_json, created_at
    ) VALUES (?, ?, ?, 'EXACT_HOSTNAME', ?, ?, ?, ?)
  `);
  const completeRun = db.prepare(`
    UPDATE cyber_cross_source_match_runs
    SET status = 'SUCCESS', completed_at = ?, summary_json = ? WHERE id = ?
  `);
  const summary = {
    leftObservations: left.length,
    rightObservations: right.length,
    proposed: 0,
    ambiguous: 0,
    osConflict: 0,
    rightWithoutHostnameMatch: 0,
  };

  db.exec('BEGIN IMMEDIATE');
  try {
    insertRun.run(runId, leftSnapshotId, rightSnapshotId, policyVersion, matchedAt);
    for (const [hostname, rightMatches] of rightGroups.entries()) {
      const leftMatches = leftGroups.get(hostname) || [];
      if (leftMatches.length === 0) {
        summary.rightWithoutHostnameMatch += rightMatches.length;
        continue;
      }

      const ambiguous = leftMatches.length !== 1 || rightMatches.length !== 1;
      for (const leftObservation of leftMatches) {
        for (const rightObservation of rightMatches) {
          const leftOs = osFamily(leftObservation.os_family);
          const rightOs = osFamily(rightObservation.os_family);
          let matchStatus = 'PROPOSED';
          let confidence = leftOs && rightOs ? 0.78 : 0.65;
          const reasons = ['EXACT_HOSTNAME'];

          if (ambiguous) {
            matchStatus = 'AMBIGUOUS';
            confidence = 0.3;
            reasons.push('NON_UNIQUE_HOSTNAME');
            summary.ambiguous += 1;
          } else if (leftOs && rightOs && leftOs !== rightOs) {
            matchStatus = 'OS_CONFLICT';
            confidence = 0.2;
            reasons.push('OS_FAMILY_CONFLICT');
            summary.osConflict += 1;
          } else {
            reasons.push(leftOs && rightOs ? 'OS_FAMILY_COMPATIBLE' : 'OS_FAMILY_INCOMPLETE');
            summary.proposed += 1;
          }

          insertMatch.run(
            runId,
            leftObservation.id,
            rightObservation.id,
            matchStatus,
            confidence,
            JSON.stringify(reasons),
            matchedAt,
          );
        }
      }
    }
    completeRun.run(matchedAt, JSON.stringify(summary), runId);
    db.exec('COMMIT');
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }

  return { status: 'SUCCESS', matchRunId: runId, summary };
}

module.exports = { MATCH_POLICY_VERSION, matchSnapshots, osFamily };
