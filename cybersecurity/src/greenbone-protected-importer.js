const { deterministicId, sha256 } = require('./fortigate-importer');
const { validateGreenboneProtectedContract } = require('./greenbone-protected-contract');
const { importGreenboneFindings } = require('./vulnerability-importer');

function parseGreenboneProtectedPayload(text) {
  let payload;
  try { payload = JSON.parse(text); } catch { throw new Error('INVALID_JSON'); }
  const validation = validateGreenboneProtectedContract(payload);
  if (!validation.valid) {
    const error = new Error('INVALID_GREENBONE_PROTECTED_CONTRACT');
    error.validationErrors = validation.errors;
    throw error;
  }
  return payload;
}

function importGreenboneProtectedResults({
  db, text, importedAt = new Date().toISOString(), custodyReference = null,
}) {
  if (!db) throw new Error('db is required');
  if (!text || typeof text !== 'string') throw new Error('text is required');
  const payload = parseGreenboneProtectedPayload(text);
  const sourceId = 'source-greenbone-results-protected';
  const sourceHash = sha256(text);
  const snapshotId = deterministicId('snapshot', `${sourceId}:${sourceHash}`);
  const existing = db.prepare(`
    SELECT id, processing_status processingStatus FROM cyber_source_snapshots
    WHERE source_system_id = ? AND source_sha256 = ?
  `).get(sourceId, sourceHash);
  if (existing) {
    return { status: 'ALREADY_IMPORTED', snapshotId: existing.id, inserted: 0, remediationCases: 0 };
  }

  const findings = payload.Results.map((result) => ({
    id: result.ResultFingerprint,
    host: result.TargetFingerprint,
    port: result.Port,
    transport: result.Transport,
    nvtOid: result.NvtOid,
    title: result.Title,
    severity: result.Severity,
    qod: result.QoD,
    cves: result.CVEs,
    evidence: result.Evidence || '',
    observedAt: payload.ScanCompletedAt,
  }));

  db.exec('BEGIN IMMEDIATE');
  try {
    db.prepare(`
      INSERT INTO cyber_source_systems(
        id, source_type, display_name, authority_level, created_at, updated_at
      ) VALUES (?, 'GREENBONE', 'Greenbone protected vulnerability results', 'OBSERVATIONAL', ?, ?)
      ON CONFLICT(id) DO UPDATE SET updated_at = excluded.updated_at, active = 1
    `).run(sourceId, importedAt, importedAt);
    db.prepare(`
      INSERT INTO cyber_source_snapshots(
        id, source_system_id, captured_at, imported_at, source_version,
        source_sha256, custody_reference, processing_status, received_count
      ) VALUES (?, ?, ?, ?, ?, ?, ?, 'PROCESSING', ?)
    `).run(
      snapshotId, sourceId, payload.ScanCompletedAt, importedAt,
      `schema:${payload.SchemaVersion};identity:${payload.IdentityKeyVersion};profile:${payload.ScanProfile}`,
      sourceHash, custodyReference, findings.length,
    );
    const result = importGreenboneFindings(db, findings, {
      snapshotId, observedAt: payload.ScanCompletedAt, importedAt,
    }, { manageTransaction: false });
    db.prepare(`
      UPDATE cyber_source_snapshots
      SET processing_status = 'SUCCESS', accepted_count = ?, rejected_count = 0,
          quality_summary_json = ?, completed_at = ? WHERE id = ?
    `).run(
      result.accepted,
      JSON.stringify({
        results: result.discovered,
        remediationCases: result.remediationCases,
        protectedTargets: new Set(payload.Results.map((item) => item.TargetFingerprint)).size,
      }),
      importedAt,
      snapshotId,
    );
    db.exec('COMMIT');
    return {
      status: 'SUCCESS', snapshotId, inserted: result.accepted,
      remediationCases: result.remediationCases, sourceHash,
    };
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
}

module.exports = { importGreenboneProtectedResults, parseGreenboneProtectedPayload };
