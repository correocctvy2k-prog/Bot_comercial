const http = require('node:http');
const { URL } = require('node:url');
const {
  getCybersecurityOverview, getInventoryOverview, getRemediationCase,
  listInventoryCandidates, listNetworkSegments, listRemediationCases,
} = require('./cybersecurity-read-model');
const { listAudit, listDispositions, listPolicies, saveDisposition, savePolicy } = require('./network-policy-store');
const { mergeExpectedNetworks } = require('./operations-points-catalog');
const { consolidateNetworkSegments, inferDominantNetwork } = require('./network-segment-consolidator');
const { promoteObservationToAsset, markObservationAsConflict, markObservationAsProtected, getObservationDetail } = require('./inventory-actions');

async function readJson(request, maxBytes = 16384) {
  const chunks = []; let bytes = 0;
  for await (const chunk of request) {
    bytes += chunk.length;
    if (bytes > maxBytes) throw new Error('INVALID_BODY_TOO_LARGE');
    chunks.push(chunk);
  }
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}'); }
  catch { throw new Error('INVALID_JSON'); }
}

function sendJson(response, status, body) {
  response.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
    'Content-Security-Policy': "default-src 'none'; frame-ancestors 'none'",
  });
  response.end(`${JSON.stringify(body)}\n`);
}

function createCybersecurityApi({ db, policyDb = null, authorizeAdmin = async () => false, getExpectedNetworks = async () => [] }) {
  if (!db) throw new Error('db is required');
  return http.createServer(async (request, response) => {
    const url = new URL(request.url, 'http://127.0.0.1');
    try {
      const policyMatch = url.pathname.match(/^\/api\/cybersecurity\/admin\/network-segments\/(segment%20[A-F0-9]{8}|segment [A-F0-9]{8})\/policy$/);
      const dispositionMatch = url.pathname.match(/^\/api\/cybersecurity\/admin\/network-segments\/(segment%20[A-F0-9]{8}|segment [A-F0-9]{8})\/disposition$/);
      if (request.method === 'POST' && policyMatch) {
        const principal = await authorizeAdmin(request);
        if (!principal) return sendJson(response, 403, { error: 'SUPERADMIN_REQUIRED' });
        if (!policyDb) return sendJson(response, 503, { error: 'POLICY_STORE_NOT_READY' });
        const item = savePolicy(policyDb, decodeURIComponent(policyMatch[1]), await readJson(request), principal.id || 'verified-superadmin');
        return sendJson(response, 200, { item });
      }
      if (request.method === 'POST' && dispositionMatch) {
        const principal = await authorizeAdmin(request);
        if (!principal) return sendJson(response, 403, { error: 'SUPERADMIN_REQUIRED' });
        if (!policyDb) return sendJson(response, 503, { error: 'POLICY_STORE_NOT_READY' });
        const item = saveDisposition(policyDb, decodeURIComponent(dispositionMatch[1]), await readJson(request), principal.id || 'verified-superadmin');
        return sendJson(response, 200, { item });
      }
      if (request.method !== 'GET') return sendJson(response, 405, { error: 'METHOD_NOT_ALLOWED' });
      if (url.pathname === '/api/cybersecurity/health') {
        const schema = db.prepare(`
          SELECT count(*) count FROM sqlite_master
          WHERE type = 'table' AND name IN (
            'cyber_vulnerability_findings', 'cyber_remediation_cases',
            'cyber_remediation_case_findings'
          )
        `).get();
        if (schema.count !== 3) throw new Error('DATABASE_SCHEMA_NOT_READY');
        return sendJson(response, 200, { status: 'ok', database: 'readable', schema: 'ready', mode: 'read-only' });
      }
      if (url.pathname === '/api/cybersecurity/overview') {
        return sendJson(response, 200, getCybersecurityOverview(db));
      }
      if (url.pathname === '/api/cybersecurity/inventory/overview') {
        return sendJson(response, 200, getInventoryOverview(db));
      }
      if (url.pathname === '/api/cybersecurity/inventory/candidates') {
        return sendJson(response, 200, listInventoryCandidates(db, {
          source: url.searchParams.get('source') || null,
          state: url.searchParams.get('state') || null,
          limit: url.searchParams.get('limit') || 100,
          offset: url.searchParams.get('offset') || 0,
        }));
      }
      const candidateMatch = url.pathname.match(/^\/api\/cybersecurity\/inventory\/candidates\/([a-zA-Z0-9_-]+)$/);
      if (candidateMatch && request.method === 'GET') {
        const item = getObservationDetail(db, candidateMatch[1]);
        return item ? sendJson(response, 200, item) : sendJson(response, 404, { error: 'CANDIDATE_NOT_FOUND' });
      }
      const promoteMatch = url.pathname.match(/^\/api\/cybersecurity\/inventory\/candidates\/([a-zA-Z0-9_-]+)\/promote$/);
      if (promoteMatch && request.method === 'POST') {
        const principal = await authorizeAdmin(request);
        if (!principal) return sendJson(response, 403, { error: 'SUPERADMIN_REQUIRED' });
        const item = promoteObservationToAsset(db, decodeURIComponent(promoteMatch[1]), await readJson(request), principal.id || 'verified-superadmin');
        return sendJson(response, 200, { item });
      }
      const conflictMatch = url.pathname.match(/^\/api\/cybersecurity\/inventory\/candidates\/([a-zA-Z0-9_-]+)\/conflict$/);
      if (conflictMatch && request.method === 'POST') {
        const principal = await authorizeAdmin(request);
        if (!principal) return sendJson(response, 403, { error: 'SUPERADMIN_REQUIRED' });
        const item = markObservationAsConflict(db, decodeURIComponent(conflictMatch[1]), await readJson(request), principal.id || 'verified-superadmin');
        return sendJson(response, 200, { item });
      }
      const protectMatch = url.pathname.match(/^\/api\/cybersecurity\/inventory\/candidates\/([a-zA-Z0-9_-]+)\/protect$/);
      if (protectMatch && request.method === 'POST') {
        const principal = await authorizeAdmin(request);
        if (!principal) return sendJson(response, 403, { error: 'SUPERADMIN_REQUIRED' });
        const item = markObservationAsProtected(db, decodeURIComponent(protectMatch[1]), await readJson(request), principal.id || 'verified-superadmin');
        return sendJson(response, 200, { item });
      }
      if (url.pathname === '/api/cybersecurity/network-segments') {
        return sendJson(response, 200, listNetworkSegments(db));
      }
      if (url.pathname === '/api/cybersecurity/admin/network-segments') {
        if (!(await authorizeAdmin(request))) return sendJson(response, 403, { error: 'SUPERADMIN_REQUIRED' });
        const result = listNetworkSegments(db, { includeSensitive: true });
        const mergedItems = mergeExpectedNetworks(result.items, await getExpectedNetworks());
        const policies = new Map(listPolicies(policyDb).map((item) => [item.id, item]));
        const dispositions = new Map(listDispositions(policyDb).map((item) => [item.id, item]));
        const knownIds = new Set(mergedItems.map((item) => item.id));
        const policyDestinations = [...policies.values()].filter((policy) => !knownIds.has(policy.id)).map((policy) => ({
          id: policy.id, label: policy.name || `Subred aplicada ${policy.networkAddress}/${policy.prefixLength}`,
          interfaceName: policy.name || `${policy.networkAddress}/${policy.prefixLength}`,
          observations: 0, active: 0, intermittent: 0, inactive: 0, staleReview: 0,
          ephemeralMacs: 0, knownIpCount: 0, referenceIps: [], members: [],
          expectedPoints: 0, expectedZones: [policy.zone], coverageStatus: 'POLICY_ONLY',
        }));
        const classifiedItems = [...mergedItems, ...policyDestinations].map((item) => {
          const storedPolicy = policies.get(item.id) || null;
          const inferred = storedPolicy && !storedPolicy.networkAddress ? inferDominantNetwork(item.members) : null;
          const policy = inferred ? { ...storedPolicy, networkAddress: inferred.networkAddress, prefixLength: inferred.prefixLength, addressSource: 'INFERRED_DOMINANT_24', inferredCoverage: `${inferred.matchingIpCount}/${inferred.totalIpCount}` } : storedPolicy;
          return { ...item, policy, disposition: dispositions.get(item.id) || null, classificationStatus: policies.has(item.id) ? 'APPROVED' : dispositions.get(item.id)?.status || 'PENDING' };
        });
        const consolidatedItems = consolidateNetworkSegments(classifiedItems).map(({ members, ...item }) => {
          const disposition = dispositions.get(item.id) || item.disposition || null;
          return disposition && !item.policy ? { ...item, disposition, classificationStatus: disposition.status, interfaceName: disposition.note || item.interfaceName } : item;
        });
        return sendJson(response, 200, { ...result, total: consolidatedItems.length, observedTotal: result.total, expectedTotal: consolidatedItems.filter((item) => item.expectedPoints > 0).length, items: consolidatedItems });
      }
      const auditMatch = url.pathname.match(/^\/api\/cybersecurity\/admin\/network-segments\/(segment%20[A-F0-9]{8}|segment [A-F0-9]{8})\/audit$/);
      if (auditMatch && request.method === 'GET') {
        if (!(await authorizeAdmin(request))) return sendJson(response, 403, { error: 'SUPERADMIN_REQUIRED' });
        if (!policyDb) return sendJson(response, 503, { error: 'POLICY_STORE_NOT_READY' });
        return sendJson(response, 200, { items: listAudit(policyDb, decodeURIComponent(auditMatch[1])) });
      }
      if (url.pathname === '/api/cybersecurity/cases') {
        return sendJson(response, 200, {
          items: listRemediationCases(db, {
            priority: url.searchParams.get('priority') || null,
            status: url.searchParams.get('status') || null,
            limit: url.searchParams.get('limit') || 50,
          }),
        });
      }
      const match = url.pathname.match(/^\/api\/cybersecurity\/cases\/([a-zA-Z0-9_-]+)$/);
      if (match) {
        const item = getRemediationCase(db, match[1]);
        return item ? sendJson(response, 200, item) : sendJson(response, 404, { error: 'CASE_NOT_FOUND' });
      }
      return sendJson(response, 404, { error: 'NOT_FOUND' });
    } catch (error) {
      const clientError = /^INVALID_/.test(error.message);
      return sendJson(response, clientError ? 400 : 500, {
        error: clientError ? error.message : 'INTERNAL_ERROR',
      });
    }
  });
}

module.exports = { createCybersecurityApi };
