const path = require('node:path');
const { DatabaseSync } = require('node:sqlite');
const { openNetworkPolicyStore, listPolicies, savePolicy } = require('../src/network-policy-store');
const { protectedAlias } = require('../src/cybersecurity-read-model');

// El id público de un segmento ("segment XXXXXXXX") se deriva del id interno de
// cyber_network_segments, que NO es estable entre reimportaciones de FortiGate (dos
// segmentos con el mismo canonical_name — p. ej. "VLAN_Tesoreria" — pueden recibir un id
// interno distinto en cada import). Cuando eso pasa, una política ya aplicada (guardada bajo
// el id viejo) queda "huérfana": el panel de Subredes la sigue mostrando como Aplicada (fila
// fantasma "solo política"), pero el segmento realmente observado hoy aparece como Pendiente
// — dos filas para la misma red física. Ver hallazgo 2026-09-15 en memoria de sesión.
//
// Este script detecta huérfanas cuyo `name` coincide EXACTAMENTE (normalizado) con el
// canonical_name de un segmento vivo sin política propia, y ofrece re-guardar esa misma
// política (mismos datos: zona, función, CIDR, gateway...) bajo el id vigente.
//
// A propósito NO intenta adivinar coincidencias por CIDR/IP dominante: se probó y da falsos
// positivos (varias VLAN de área comparten tráfico con la red administrativa general
// 10.2.2.0/24, así que "la /24 más frecuente" no identifica la red real de forma confiable).
// Solo actúa sobre coincidencias de nombre exactas — más lento de ampliar, pero no escribe
// clasificaciones incorrectas.
//
// Uso:
//   node scripts/reconcile-segment-policies.js --db <cyber-inventory.db> --policy-db <network-policies.db> [--actor <email>] [--apply]
// Sin --apply: solo imprime el plan (dry-run). Con --apply: re-guarda cada coincidencia bajo
// el id vigente, atribuida a --actor (por defecto 'reconcile-script').

function argument(name, fallback = null) {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] : fallback;
}

function normalizeName(value) {
  return String(value || '').trim().toLowerCase().replace(/[\s_-]+/g, ' ');
}

function run({ dbPath, policyDbPath, actor, apply }) {
  const db = new DatabaseSync(dbPath, { readOnly: true });
  const policyDb = openNetworkPolicyStore(policyDbPath);
  try {
    const liveSegments = db.prepare('SELECT id, canonical_name FROM cyber_network_segments').all();
    const liveByNormalizedName = new Map(liveSegments.map((s) => [normalizeName(s.canonical_name), s]));
    const liveIds = new Set(liveSegments.map((s) => protectedAlias('segment', s.id)));

    const policies = listPolicies(policyDb);
    const orphaned = policies.filter((p) => !liveIds.has(p.id));

    const plan = [];
    for (const policy of orphaned) {
      const liveSegment = liveByNormalizedName.get(normalizeName(policy.name));
      if (!liveSegment) continue;
      const liveAlias = protectedAlias('segment', liveSegment.id);
      if (policies.some((p) => p.id === liveAlias)) continue; // el segmento vivo ya tiene su propia política, no pisar
      plan.push({ liveAlias, liveName: liveSegment.canonical_name, oldId: policy.id, policy });
    }

    console.log(`Políticas guardadas: ${policies.length} | huérfanas (id ya no vigente): ${orphaned.length} | recuperables por nombre exacto: ${plan.length}`);
    for (const item of plan) {
      console.log(`${apply ? 'APLICANDO' : 'PLAN'}: ${item.liveName} (id nuevo ${item.liveAlias}) <- "${item.policy.name}" (id viejo ${item.oldId})`);
      if (apply) {
        savePolicy(policyDb, item.liveAlias, {
          name: item.policy.name, zone: item.policy.zone, networkFunction: item.policy.networkFunction,
          technology: item.policy.technology, topology: item.policy.topology, addressMode: item.policy.addressMode,
          population: item.policy.population, criticality: item.policy.criticality,
          networkAddress: item.policy.networkAddress, prefixLength: item.policy.prefixLength, gateway: item.policy.gateway,
        }, actor);
      }
    }
    if (!apply && plan.length) console.log('\nDry-run: no se escribió nada. Repite con --apply para aplicar.');
    return plan;
  } finally {
    db.close();
    policyDb.close();
  }
}

if (require.main === module) {
  const dbPath = argument('db');
  const policyDbPath = argument('policy-db');
  const actor = argument('actor', 'reconcile-script');
  const apply = process.argv.includes('--apply');
  if (!dbPath || !policyDbPath) {
    console.error('Uso: node scripts/reconcile-segment-policies.js --db <cyber-inventory.db> --policy-db <network-policies.db> [--actor <email>] [--apply]');
    process.exitCode = 2;
  } else {
    run({ dbPath: path.resolve(dbPath), policyDbPath: path.resolve(policyDbPath), actor, apply });
  }
}

module.exports = { run };
