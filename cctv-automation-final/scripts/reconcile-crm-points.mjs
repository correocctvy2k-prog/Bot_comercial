import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';

const root = path.resolve(import.meta.dirname, '..');
const crmRoot = process.argv[2] || process.env.CRM_FRONTEND_PATH;
if (!crmRoot) throw new Error('Uso: node scripts/reconcile-crm-points.mjs <ruta CRM_Frontend>');

function parseEnv(file) {
  const values = {};
  for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
    if (!match) continue;
    values[match[1]] = match[2].replace(/^(['"])(.*)\1$/, '$2');
  }
  return values;
}

function key(value) {
  return String(value || '')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toUpperCase().replace(/[^A-Z0-9]+/g, ' ').trim();
}

const select = ['id','siiss_id','name','alias','segment','active','is_permanently_closed','has_cctv','has_alarm','is_mall','has_sportbook','is_double','siiss_active','siiss_last_sync'].join(',');
const envCandidates = ['.env.local', '.env']
  .map(name => ({ name, file: path.join(crmRoot, name) }))
  .filter(item => fs.existsSync(item.file))
  .flatMap(item => {
    const env = parseEnv(item.file);
    return ['VITE_SUPABASE_ANON_KEY', 'VITE_SUPABASE_KEY']
      .filter(keyName => env[keyName])
      .map(keyName => ({ source: `${item.name}:${keyName}`, url: env.VITE_SUPABASE_URL, key: env[keyName] }));
  })
  .filter(item => item.url && item.key);
if (!envCandidates.length) throw new Error('No hay configuración pública de Supabase en CRM_Frontend');

let crmPoints;
let credentialSource;
const failures = [];
for (const candidate of envCandidates) {
  const response = await fetch(`${candidate.url}/rest/v1/puntos_venta?select=${select}&order=alias.asc`, {
    headers: { apikey: candidate.key, Authorization: `Bearer ${candidate.key}` },
  });
  if (response.ok) {
    crmPoints = await response.json();
    credentialSource = candidate.source;
    break;
  }
  failures.push(`${candidate.source}=${response.status}`);
}
if (!crmPoints) throw new Error(`Ninguna clave pública fue aceptada (${failures.join(', ')})`);

const db = new DatabaseSync(path.resolve(process.env.CCTV_DB || path.join(root, 'data', 'cctv-staging.db')), { readOnly: true });
const locations = db.prepare('SELECT * FROM locations WHERE active=1 ORDER BY canonical_name').all();
const aliases = db.prepare('SELECT location_id,source_system,alias_raw,alias_key FROM location_aliases').all();
const aliasesByKey = new Map();
for (const alias of aliases) {
  const aliasKey = key(alias.alias_key || alias.alias_raw);
  if (!aliasesByKey.has(aliasKey)) aliasesByKey.set(aliasKey, new Set());
  aliasesByKey.get(aliasKey).add(alias.location_id);
}
for (const location of locations) {
  const canonicalKey = key(location.canonical_name);
  if (!aliasesByKey.has(canonicalKey)) aliasesByKey.set(canonicalKey, new Set());
  aliasesByKey.get(canonicalKey).add(location.id);
}

const bySiis = new Map(locations.filter(x => x.siis_code).map(x => [String(x.siis_code).trim(), x]));
const byId = new Map(locations.map(x => [x.id, x]));
const crmBySiis = new Map();
for (const point of crmPoints) {
  const code = String(point.siiss_id || '').trim();
  if (!code) continue;
  if (!crmBySiis.has(code)) crmBySiis.set(code, []);
  crmBySiis.get(code).push(point);
}
const duplicateSiisCodes = [...crmBySiis.entries()].filter(([, points]) => points.length > 1);
const validSharedSiisCodes = new Set(duplicateSiisCodes
  .filter(([, points]) => points.every(point => point.is_double))
  .map(([code]) => code));
const rows = crmPoints.map(point => {
  const siisCode = String(point.siiss_id || '').trim();
  if (siisCode && bySiis.has(siisCode)) {
    const duplicated = (crmBySiis.get(siisCode)?.length || 0) > 1;
    const validSharedLocation = duplicated && validSharedSiisCodes.has(siisCode);
    return {
      crmPoint: point,
      location: bySiis.get(siisCode),
      method: validSharedLocation ? 'SIIS_SHARED_DOUBLE_LOCATION' : duplicated ? 'SIIS_DUPLICATED_IN_CRM' : 'SIIS_EXACT',
      confidence: validSharedLocation || !duplicated ? 1 : 0,
      decision: validSharedLocation || !duplicated ? 'AUTO_LINKABLE' : 'HELD',
    };
  }
  const candidates = new Set();
  for (const candidateKey of [key(point.alias), key(point.name)]) {
    for (const id of aliasesByKey.get(candidateKey) || []) candidates.add(id);
  }
  if (candidates.size === 1) {
    return { crmPoint: point, location: byId.get([...candidates][0]), method: 'ALIAS_EXACT', confidence: 0.95, decision: 'REVIEW_REQUIRED' };
  }
  return { crmPoint: point, location: null, method: candidates.size > 1 ? 'ALIAS_AMBIGUOUS' : 'NO_MATCH', confidence: 0, decision: 'HELD' };
});

const linkedLocationIds = new Set(rows.filter(x => x.location).map(x => x.location.id));
const summary = {
  generatedAt: new Date().toISOString(),
  credentialSource,
  crmPoints: crmPoints.length,
  canonicalLocations: locations.length,
  siisExact: rows.filter(x => x.method === 'SIIS_EXACT').length,
  sharedDoubleLocations: validSharedSiisCodes.size,
  operationalNodesInDoubleLocations: rows.filter(x => x.method === 'SIIS_SHARED_DOUBLE_LOCATION').length,
  unjustifiedDuplicateSiisCodes: duplicateSiisCodes.filter(([code]) => !validSharedSiisCodes.has(code)).length,
  aliasExactReview: rows.filter(x => x.method === 'ALIAS_EXACT').length,
  ambiguous: rows.filter(x => x.method === 'ALIAS_AMBIGUOUS').length,
  unmatchedCrm: rows.filter(x => x.method === 'NO_MATCH').length,
  canonicalWithoutCrm: locations.filter(x => !linkedLocationIds.has(x.id)).length,
  crmWithoutCctvFlag: crmPoints.filter(x => !x.has_cctv && !x.is_permanently_closed).length,
};

const safeRows = rows.map(({ crmPoint, location, ...match }) => ({
  crmPointId: crmPoint.id,
  siisCode: crmPoint.siiss_id || null,
  crmName: crmPoint.alias || crmPoint.name,
  crmZone: crmPoint.segment,
  crmTypeFlags: { mall: !!crmPoint.is_mall, sportsbook: !!crmPoint.has_sportbook, doubleShift: !!crmPoint.is_double },
  crmCapabilities: { cctv: !!crmPoint.has_cctv, alarm: !!crmPoint.has_alarm },
  crmOperational: { active: !!crmPoint.active, permanentlyClosed: !!crmPoint.is_permanently_closed, siisOnline: crmPoint.siiss_active },
  canonicalLocationId: location?.id || null,
  canonicalName: location?.canonical_name || null,
  canonicalZone: location?.zone || null,
  canonicalType: location?.location_type || null,
  ...match,
}));

const reportsDir = path.join(root, 'reports');
fs.mkdirSync(reportsDir, { recursive: true });
const jsonPath = path.join(reportsDir, 'crm-points-reconciliation-latest.json');
const mdPath = path.join(reportsDir, 'crm-points-reconciliation-latest.md');
fs.writeFileSync(jsonPath, JSON.stringify({ summary, rows: safeRows }, null, 2));

const held = safeRows.filter(x => x.decision === 'HELD');
const review = safeRows.filter(x => x.decision === 'REVIEW_REQUIRED');
const withoutCctv = safeRows.filter(x => !x.crmCapabilities.cctv && !x.crmOperational.permanentlyClosed);
const duplicateRows = safeRows.filter(x => x.method === 'SIIS_DUPLICATED_IN_CRM');
const sharedDoubleRows = safeRows.filter(x => x.method === 'SIIS_SHARED_DOUBLE_LOCATION');
const table = items => items.length ? items.map(x => `| ${x.siisCode || '—'} | ${x.crmName || '—'} | ${x.crmZone || '—'} | ${x.method} | ${x.canonicalName || '—'} |`).join('\n') : '| — | Sin casos | — | — | — |';
const md = `# Conciliación CRM Puntos ↔ CCTV\n\nGenerado: ${summary.generatedAt}\n\nConfiguración pública aceptada: \`${credentialSource}\` (el valor de la clave no se registra).\n\n## Resumen\n\n| Métrica | Total |\n|---|---:|\n${Object.entries(summary).filter(([k]) => !['generatedAt','credentialSource'].includes(k)).map(([k,v]) => `| ${k} | ${v} |`).join('\n')}\n\n## Ubicaciones dobles válidas\n\nVarios nodos operativos/PC pueden compartir una ubicación física y una instalación CCTV cuando todos están marcados con \`is_double\`.\n\n| Código SIIS | Nodo CRM | Zona | Método | Ubicación física |\n|---|---|---|---|---|\n${table(sharedDoubleRows)}\n\n## Códigos SIIS duplicados no justificados\n\nSolo estos vínculos quedan retenidos.\n\n| Código SIIS | Punto CRM | Zona | Método | Ubicación canónica |\n|---|---|---|---|---|\n${table(duplicateRows)}\n\n## Revisión requerida\n\n| Código SIIS | Punto CRM | Zona | Método | Ubicación canónica |\n|---|---|---|---|---|\n${table(review)}\n\n## Retenidos\n\n| Código SIIS | Punto CRM | Zona | Método | Ubicación canónica |\n|---|---|---|---|---|\n${table(held)}\n\n## Candidatos para alta CCTV\n\nPuntos activos del CRM cuyo indicador actual \`has_cctv\` es falso. Este listado es una entrada al asistente; debe confirmarse contra los activos canónicos antes de instalar.\n\n| Código SIIS | Punto CRM | Zona | Método | Ubicación canónica |\n|---|---|---|---|---|\n${table(withoutCctv)}\n`;
fs.writeFileSync(mdPath, md);
console.log(JSON.stringify({ summary, jsonPath, mdPath }, null, 2));
