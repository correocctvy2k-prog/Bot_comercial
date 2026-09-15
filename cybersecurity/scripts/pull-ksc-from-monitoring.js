// Trae el inventario de hardware KSC directo del backend de Monitoreo IT (`/api/monitoring/
// latest/KSC-HARDWARE`) en vez de depender del canal SFTP protegido (Send-KSC-CyberExport.ps1
// -> 10.2.6.30), que requiere una llave privada que este servicio no tiene. Decisión del
// usuario 2026-09-15: "un mecanismo que obtenga los datos directamente del json que envía
// todos los días kaspersky al 8.65 [...] todo el proyecto CRM_Frontend debe estar conectado".
//
// Monitor-KSC-HardwareInventory.ps1 sube exactamente el contrato que importKscHardwareInventory
// ya esperaba (banderas KSC_REDUCED_CONTRACT/MISSING_IP/MISSING_MAC preexistentes en
// ksc-importer.js) -- solo faltaba el paso que hiciera el fetch. Este contrato NO trae IP ni
// MAC (eso solo va por el canal SFTP protegido); alcanza para identidad por hostname/OS/última
// vez visto, que es lo que necesita el cruce con FortiGate (cross-source-matcher.js, por
// hostname exacto).
//
// Uso:
//   node scripts/pull-ksc-from-monitoring.js --monitoring-url http://192.168.8.65:3001 [--db <file> --custody-ref <ref> --apply] [--save-raw <dir>]
// Sin --apply: solo imprime el resumen (modo auditoría). El backend de Monitoreo IT corre en
// el servicio "comercial-bot" (docker-compose.yml, puerto 3001) -- en local dev, si ese
// contenedor no está levantado, --monitoring-url debe apuntar a donde sí haya datos.

const fs = require('node:fs');
const path = require('node:path');
const { openCyberDatabase } = require('../db/open-database');
const { importKscHardwareInventory, summarizeKscPayload } = require('../src/ksc-importer');

function argument(name, fallback = null) {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] : fallback;
}

async function fetchLatestKscHardware(monitoringUrl, fetchImpl = fetch) {
  const url = `${String(monitoringUrl).replace(/\/$/, '')}/api/monitoring/latest/KSC-HARDWARE`;
  const response = await fetchImpl(url);
  if (!response.ok) throw new Error(`MONITORING_API_ERROR (${response.status})`);
  const payload = await response.json();
  if (payload === null) throw new Error('MONITORING_API_NO_DATA: Monitoreo IT no tiene un reporte KSC-HARDWARE guardado todavía');
  return payload;
}

async function run({ monitoringUrl, dbPath, custodyReference, apply, saveRawDir, fetchImpl = fetch }) {
  const payload = await fetchLatestKscHardware(monitoringUrl, fetchImpl);
  const summary = summarizeKscPayload(payload);
  const text = JSON.stringify(payload);

  if (saveRawDir) {
    fs.mkdirSync(saveRawDir, { recursive: true });
    const stamp = (summary.capturedAt || new Date().toISOString()).replace(/[:.]/g, '').slice(0, 15);
    fs.writeFileSync(path.join(saveRawDir, `ksc-hardware-latest-${stamp}.json`), text);
  }

  if (!apply) {
    return { mode: 'AUDIT_ONLY', capturedAt: summary.capturedAt, counts: summary.counts };
  }
  if (!dbPath) throw new Error('--db is required with --apply');
  const db = openCyberDatabase(path.resolve(dbPath));
  try {
    return importKscHardwareInventory({ db, text, capturedAt: summary.capturedAt, custodyReference });
  } finally {
    db.close();
  }
}

if (require.main === module) {
  const monitoringUrl = argument('monitoring-url', 'http://192.168.8.65:3001');
  const dbPath = argument('db');
  const custodyReference = argument('custody-ref');
  const saveRawDir = argument('save-raw');
  const apply = process.argv.includes('--apply');
  if (apply && !custodyReference) {
    console.error('--custody-ref is required with --apply');
    process.exitCode = 2;
  } else {
    run({ monitoringUrl, dbPath, custodyReference, apply, saveRawDir })
      .then((result) => console.log(JSON.stringify(result, null, 2)))
      .catch((error) => { console.error(`[ERROR] ${error.message}`); process.exitCode = 1; });
  }
}

module.exports = { fetchLatestKscHardware, run };
