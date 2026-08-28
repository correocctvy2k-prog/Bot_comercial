const fs = require('fs');
const path = require('path');
const ExcelJS = require('exceljs');

const root = path.resolve(__dirname, '..');
const ocrDir = path.join(root, 'data', 'device-captures-ocr');
const exportPath = path.join(root, 'DeviceInfo.xlsx');
const outputPath = path.join(root, 'data', 'dss-device-staging.json');
const digits = (v) => String(v || '').replace(/\D/g, '');
const normalize = (v) => String(v || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase().replace(/[^A-Z0-9]+/g, ' ').trim();
const modelFix = (value) => String(value || '')
  .replace(/^DHl-/i, 'DHI-').replace(/^DHI-/i, 'DHI-')
  .replace(/4K52/g, '4KS2').replace(/-El\b/g, '-EI').replace(/-E12\b/g, '-EI2')
  .replace(/IZ-/g, 'IZ-').replace(/-AS-P\b/g, '-AS-P');
const overrides = {
  '1000012': {name:'Parque Bolivar Cajas PtoVenta', model:'DHI-NVR4232-4KS2', sourceCapture:'red 36.png'},
  '1000039': {name:'Los Parrales', model:'DH-IPC-HDBW2441E-S'},
  '1000046': {name:'DVR Ofi Pradera', model:'DH-XVR5216AN-4KL-X'},
  '1000057': {name:'Antigua Ppal Florida', model:'DHI-NVR4108HS-EI'},
  '1000060': {name:'Las Americas', model:'DH-IPC-HDBW2441E-S'},
  '1000064': {name:'Ofi Cabuyal', model:'DHI-NVR4232-4KS2', sourceCapture:'cande.png'},
  '1000084': {name:'Colombia Cabinas', model:'IPC-K35', sourceCapture:'Red 44.png'},
  '1000091': {name:'Reservas de la Italia', model:'DHI-NVR4208-4KS2/L', sourceCapture:'red 20.png'},
  '1000114': {name:'Ignacio Torres', model:'DH-IPC-HDBW3441E-AS-S2'},
  '1000118': {name:'Detección Rostros', model:'DH-IPC-HDBW5241E-ZE'},
  '1000119': {name:'Tienda Nueva', model:'DH-IPC-HDBW3441E-AS-S2'},
  '1000123': {name:'La Herradura', model:'DH-T4A-PV'},
  '1000138': {name:'ANPR out Parq Bolivar', model:'ITC415-PW6M-IZ-C2'},
  '1000139': {name:'19 con 37 II', model:'DHI-NVR5208-EI'},
  '1000140': {name:'ANPR In-Out Calle 32', model:'ITC415-PW6M-IZ-C2'},
  '1000143': {name:'ANPR In Motos Parque Bolivar', model:'ITC415-PW6M-IZ-C2'},
  '1000144': {name:'Cam SMD 19 con 37 II', model:'DH-IPC-HDBW3441R-AS-P'},
  '1000152': {name:'Cam SMD Ant Ppal Florida', model:'DH-IPC-HDBW3441E-AS-S2'},
  '1000155': {name:'ANPR in calle 31', model:'ITC415-PW6M-IZ-C2'},
  '1000161': {name:'Calle del Comercio', model:'IPC-K35'},
  '1000167': {name:'NVR Parqueadero Parque Bolivar', model:'DHI-NVR4232-4KS2/L'},
  '1000180': {name:'Sembrador Plaza', model:'DH-IPC-HDBW3441R-AS-P'},
};

function similarity(a, b) {
  const aa = new Set(normalize(a).split(' ').filter(Boolean));
  const bb = new Set(normalize(b).split(' ').filter(Boolean));
  const overlap = [...aa].filter((x) => bb.has(x)).length;
  return overlap / Math.max(aa.size, bb.size, 1);
}

(async () => {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(exportPath);
  const sheet = wb.getWorksheet('Export Format');
  const exported = [];
  for (let r = 3; r <= sheet.rowCount; r++) {
    const name = String(sheet.getCell(r, 5).value || '').trim();
    if (!name) continue;
    exported.push({
      exportRow: r,
      category: String(sheet.getCell(r, 1).value || '').trim(),
      type: String(sheet.getCell(r, 2).value || '').trim(),
      name,
      address: String(sheet.getCell(r, 6).value || '').trim(),
      port: String(sheet.getCell(r, 7).value || '').trim(),
      organization: String(sheet.getCell(r, 8).value || '').trim(),
    });
  }

  const parsed = [];
  for (const file of fs.readdirSync(ocrDir).filter((f) => f.endsWith('.txt')).sort()) {
    const lines = fs.readFileSync(path.join(ocrDir, file), 'utf8').split(/\r?\n/);
    for (const rawLine of lines) {
      const id = rawLine.match(/\b(100\d{4})\b/)?.[1];
      if (!id) continue;
      const modelToken = rawLine.match(/\b(?:DHI|DH|IPC|ITC)[A-Z0-9][A-Z0-9/.-]+/i)?.[0] || '';
      const model = modelFix(modelToken);
      const lineDigits = digits(rawLine.replace(id, ''));
      let candidates = exported.filter((x) => digits(x.address) && lineDigits.includes(digits(x.address)));
      if (candidates.length > 1) candidates = candidates.map((x) => ({...x, score: similarity(rawLine, x.name)})).sort((a,b)=>b.score-a.score);
      const match = candidates[0] || null;
      parsed.push({deviceIdDss:id, model, sourceCapture:file.replace(/\.txt$/, '.png'), rawLine:rawLine.trim(), matchMethod:match ? (candidates.length === 1 ? 'ADDRESS_EXACT' : 'ADDRESS_NAME_SCORE') : 'UNMATCHED', matchScore:match ? (candidates.length === 1 ? 1 : candidates[0].score) : 0, export:match});
    }
  }

  const byId = new Map();
  for (const item of parsed) {
    const current = byId.get(item.deviceIdDss);
    if (!current || (item.model && !current.model) || item.matchScore > current.matchScore) byId.set(item.deviceIdDss, item);
  }
  for (const [deviceIdDss, override] of Object.entries(overrides)) {
    const match = exported.find((x)=>normalize(x.name)===normalize(override.name));
    const current = byId.get(deviceIdDss) || {};
    byId.set(deviceIdDss, {...current, deviceIdDss, model:override.model, sourceCapture:override.sourceCapture||current.sourceCapture, rawLine:current.rawLine||'Corrección visual controlada', matchMethod:'VISUAL_OVERRIDE', matchScore:1, export:match||current.export});
  }
  const devices = [...byId.values()].sort((a,b)=>a.deviceIdDss.localeCompare(b.deviceIdDss));
  const summary = {
    exportedDevices: exported.length,
    ocrRows: parsed.length,
    uniqueDeviceIds: devices.length,
    withModel: devices.filter((x)=>x.model).length,
    matchedToExport: devices.filter((x)=>x.export).length,
    confident: devices.filter((x)=>x.export && x.model && x.matchScore >= 0.8).length,
    unmatchedIds: devices.filter((x)=>!x.export).map((x)=>x.deviceIdDss),
  };
  fs.mkdirSync(path.dirname(outputPath), {recursive:true});
  fs.writeFileSync(outputPath, JSON.stringify({generatedAt:new Date().toISOString(), summary, devices}, null, 2));
  console.log(JSON.stringify(summary, null, 2));
})();
