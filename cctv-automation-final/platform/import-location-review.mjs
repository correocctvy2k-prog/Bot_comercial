import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { createRequire } from 'node:module';
import { FileBlob, SpreadsheetFile } from '@oai/artifact-tool';

const require=createRequire(import.meta.url);
const {DatabaseSync}=require('node:sqlite');
const [workbookArg,dbArg,reportArg]=process.argv.slice(2);
if(!workbookArg)throw new Error('Uso: import-location-review.mjs <revision.xlsx> [db] [reporte.json]');
const workbookPath=path.resolve(workbookArg),dbPath=path.resolve(dbArg||process.env.CCTV_DB||'data/cctv-staging.db'),reportPath=path.resolve(reportArg||'reports/location-review-import-latest.json');
const allowed=new Set(['MISMO_PUNTO','PUNTO_DIFERENTE','CODIGO_CAMBIO','PUNTO_CERRADO','REQUIERE_VERIFICACION']);
const clean=v=>v==null?'':String(v).trim();
const fileBytes=await fs.readFile(workbookPath);
const fingerprint=crypto.createHash('sha256').update(fileBytes).digest('hex');
const wb=await SpreadsheetFile.importXlsx(await FileBlob.load(workbookPath));
const sheet=wb.worksheets.getItem('Revision');
const values=sheet.getRange('A5:R49').values;
const rows=values.map((r,i)=>({row:i+5,caseId:clean(r[0]),pendingType:clean(r[1]),siisCode:clean(r[2]),siisStatus:clean(r[3]),siisName:clean(r[4]),maintenanceName:clean(r[5]),zone:clean(r[6]),inventoryName:clean(r[7]),inventoryMethod:clean(r[8]),inventoryScore:r[9]==null?'':Number(r[9]),dssIds:clean(r[10]),dssModels:clean(r[11]),decision:clean(r[12]),canonicalName:clean(r[13]),correctedCode:clean(r[14]),observations:clean(r[15]),reviewedBy:clean(r[16]),reviewedAt:clean(r[17])}));
if(rows.length!==45)throw new Error(`Se esperaban 45 filas y se obtuvieron ${rows.length}`);
const ids=new Set();
for(const row of rows){if(!row.caseId||ids.has(row.caseId))throw new Error(`ID vacío o duplicado en fila ${row.row}`);ids.add(row.caseId);if(!allowed.has(row.decision))throw new Error(`Decisión inválida o pendiente en ${row.caseId}: ${row.decision||'(vacía)'}`);if(row.decision==='MISMO_PUNTO'&&!row.canonicalName)throw new Error(`Falta nombre canónico en ${row.caseId}`);if(row.decision==='CODIGO_CAMBIO'&&!row.correctedCode)throw new Error(`Falta código corregido en ${row.caseId}`);if(['PUNTO_DIFERENTE','PUNTO_CERRADO','REQUIERE_VERIFICACION'].includes(row.decision)&&!row.observations)throw new Error(`Falta observación en ${row.caseId}`);}

const db=new DatabaseSync(dbPath);
db.exec(require('node:fs').readFileSync(path.join(path.dirname(new URL(import.meta.url).pathname.replace(/^\/(.:)/,'$1')),'schema.sql'),'utf8'));
const latestImport=db.prepare("SELECT id FROM import_runs WHERE status='SUCCESS' ORDER BY id DESC LIMIT 1").get();
const inventoryZones=new Map();
if(latestImport){for(const item of db.prepare('SELECT location_name_raw,region_raw FROM stg_inventory_locations WHERE import_run_id=?').all(latestImport.id))inventoryZones.set(clean(item.location_name_raw).toUpperCase(),clean(item.region_raw).toUpperCase());}
for(const row of rows){const flags=[];const invZone=row.inventoryName?(inventoryZones.get(row.inventoryName.toUpperCase())||''):'';if(!row.inventoryName)flags.push('NO_INVENTORY_CANDIDATE');if(row.inventoryName&&invZone&&row.zone&&invZone!==row.zone.toUpperCase())flags.push('CROSS_ZONE_INVENTORY_CANDIDATE');if(row.dssIds.includes(','))flags.push('MULTIPLE_DSS_CANDIDATES');if(row.pendingType==='CODIGO_AUSENTE_EN_SIIS')flags.push('SIIS_CODE_NOT_IN_LATEST_SNAPSHOT');row.validationFlags=flags;row.validationStatus=flags.some(f=>f==='CROSS_ZONE_INVENTORY_CANDIDATE'||f==='SIIS_CODE_NOT_IN_LATEST_SNAPSHOT')?'HOLD':flags.length?'REVIEW_LINK':'VALIDATED';}
const started=new Date().toISOString();
const run=db.prepare('INSERT INTO location_review_runs (imported_at,source_file,source_fingerprint,row_count,summary_json) VALUES (?,?,?,?,?)').run(started,workbookPath,fingerprint,rows.length,'{}');
const runId=Number(run.lastInsertRowid);
const insert=db.prepare(`INSERT INTO location_review_decisions
 (review_run_id,case_id,pending_type,siis_code,siis_status,siis_name,maintenance_name,zone,inventory_name,inventory_match_method,inventory_score,dss_ids,dss_models,decision,canonical_name,corrected_siis_code,observations,reviewed_by,reviewed_at,validation_status,validation_flags)
 VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`);
db.exec('BEGIN');
try{for(const r of rows)insert.run(runId,r.caseId,r.pendingType,r.siisCode,r.siisStatus,r.siisName,r.maintenanceName,r.zone,r.inventoryName,r.inventoryMethod,r.inventoryScore===''?null:r.inventoryScore,r.dssIds,r.dssModels,r.decision,r.canonicalName,r.correctedCode,r.observations,r.reviewedBy,r.reviewedAt,r.validationStatus,JSON.stringify(r.validationFlags));db.exec('COMMIT');}catch(e){db.exec('ROLLBACK');throw e;}
const summary={total:rows.length,decisions:Object.fromEntries([...allowed].map(d=>[d,rows.filter(r=>r.decision===d).length])),validated:rows.filter(r=>r.validationStatus==='VALIDATED').length,reviewLink:rows.filter(r=>r.validationStatus==='REVIEW_LINK').length,hold:rows.filter(r=>r.validationStatus==='HOLD').length,crossZone:rows.filter(r=>r.validationFlags.includes('CROSS_ZONE_INVENTORY_CANDIDATE')).length,missingInSiis:rows.filter(r=>r.validationFlags.includes('SIIS_CODE_NOT_IN_LATEST_SNAPSHOT')).length,noInventory:rows.filter(r=>r.validationFlags.includes('NO_INVENTORY_CANDIDATE')).length,multipleDss:rows.filter(r=>r.validationFlags.includes('MULTIPLE_DSS_CANDIDATES')).length};
db.prepare('UPDATE location_review_runs SET summary_json=? WHERE id=?').run(JSON.stringify(summary),runId);db.close();
const report={generatedAt:started,runId,sourceFile:workbookPath,sourceFingerprint:fingerprint,summary,holds:rows.filter(r=>r.validationStatus==='HOLD').map(r=>({caseId:r.caseId,siisCode:r.siisCode,canonicalName:r.canonicalName,zone:r.zone,inventoryName:r.inventoryName,flags:r.validationFlags}))};
await fs.mkdir(path.dirname(reportPath),{recursive:true});await fs.writeFile(reportPath,JSON.stringify(report,null,2));
const md=['# Importación de decisiones de conciliación','',`- Ejecución: ${runId}`,`- Filas: ${summary.total}`,`- Validadas: ${summary.validated}`,`- Vínculo técnico por revisar: ${summary.reviewLink}`,`- Retenidas: ${summary.hold}`,'','## Retenciones','','| Caso | Código SIIS | Nombre canónico | Zona | Candidato inventario | Motivo |','|---|---|---|---|---|---|',...report.holds.map(r=>`| ${r.caseId} | ${r.siisCode} | ${r.canonicalName} | ${r.zone} | ${r.inventoryName} | ${r.flags.join(', ')} |`)].join('\n');await fs.writeFile(reportPath.replace(/\.json$/i,'.md'),md);
console.log(JSON.stringify({ok:true,runId,reportPath,summary},null,2));
