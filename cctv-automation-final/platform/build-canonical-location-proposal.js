'use strict';

const fs=require('node:fs');
const path=require('node:path');
const {DatabaseSync}=require('node:sqlite');
const dbPath=path.resolve(process.argv[2]||process.env.CCTV_DB||'data/cctv-staging.db');
const outputPath=path.resolve(process.argv[3]||'reports/canonical-location-proposal-latest.json');
const db=new DatabaseSync(dbPath,{readOnly:true});
const siisRun=db.prepare("SELECT id FROM siis_sync_runs WHERE status='SUCCESS' ORDER BY id DESC LIMIT 1").get();
const importRun=db.prepare("SELECT id FROM import_runs WHERE status='SUCCESS' ORDER BY id DESC LIMIT 1").get();
const reviewRun=db.prepare('SELECT id FROM location_review_runs ORDER BY id DESC LIMIT 1').get();
if(!siisRun||!importRun||!reviewRun)throw new Error('Faltan ejecuciones SIIS, inventario o revisión');
const automatic=db.prepare(`SELECT s.siis_code,s.name_raw AS canonical_name,s.online,m.point_name_raw AS maintenance_name,m.region_raw AS zone,
 i.location_name_raw AS inventory_name,c.score AS inventory_score
 FROM stg_siis_locations s JOIN stg_maintenance_points m ON m.siis_code=s.siis_code AND m.import_run_id=?
 JOIN reconciliation_candidates c ON c.maintenance_point_id=m.id AND c.import_run_id=m.import_run_id AND c.decision='AUTO_EXACT'
 JOIN stg_inventory_locations i ON i.id=c.inventory_location_id WHERE s.sync_run_id=?`).all(importRun.id,siisRun.id);
const reviewed=db.prepare(`SELECT siis_code,siis_name,siis_status,maintenance_name,zone,inventory_name,inventory_score,dss_ids,dss_models,canonical_name,validation_status,validation_flags,pending_type
 FROM location_review_decisions WHERE review_run_id=? AND decision='MISMO_PUNTO'`).all(reviewRun.id);
db.close();
const proposals=[];
for(const r of automatic)proposals.push({proposalId:`LOC-SIIS-${r.siis_code}`,siisCode:r.siis_code,canonicalName:r.canonical_name,zone:r.zone,siisStatus:r.online?'EN_LINEA':'FUERA_DE_LINEA',maintenanceName:r.maintenance_name,inventoryName:r.inventory_name,identityStatus:'READY',identityMethod:'SIIS_CODE_EXACT_AND_INVENTORY_EXACT',inventoryLinkStatus:'READY',dssIds:'',dssModels:'',validationFlags:[]});
for(const r of reviewed){const flags=JSON.parse(r.validation_flags||'[]');const current=r.pending_type!=='CODIGO_AUSENTE_EN_SIIS';proposals.push({proposalId:`LOC-SIIS-${r.siis_code}`,siisCode:r.siis_code,canonicalName:r.canonical_name,zone:r.zone,siisStatus:r.siis_status,maintenanceName:r.maintenance_name,inventoryName:r.inventory_name,identityStatus:current?'READY':'HOLD_SIIS_VALIDITY',identityMethod:current?'SIIS_CODE_EXACT_HUMAN_REVIEW':'MAINTENANCE_CODE_HUMAN_REVIEW',inventoryLinkStatus:flags.includes('CROSS_ZONE_INVENTORY_CANDIDATE')?'HOLD_CROSS_ZONE':flags.includes('NO_INVENTORY_CANDIDATE')?'NO_CANDIDATE':flags.includes('MULTIPLE_DSS_CANDIDATES')?'REVIEW_MULTIPLE_DSS':'READY',dssIds:r.dss_ids,dssModels:r.dss_models,validationFlags:flags});}
proposals.sort((a,b)=>String(a.siisCode).localeCompare(String(b.siisCode),undefined,{numeric:true}));
const seen=new Set();for(const p of proposals){if(seen.has(p.siisCode))throw new Error(`Código duplicado en propuesta: ${p.siisCode}`);seen.add(p.siisCode);}
const summary={total:proposals.length,identityReady:proposals.filter(p=>p.identityStatus==='READY').length,identityHold:proposals.filter(p=>p.identityStatus!=='READY').length,inventoryLinkReady:proposals.filter(p=>p.inventoryLinkStatus==='READY').length,inventoryLinkHold:proposals.filter(p=>p.inventoryLinkStatus.startsWith('HOLD')).length,noInventoryCandidate:proposals.filter(p=>p.inventoryLinkStatus==='NO_CANDIDATE').length,multipleDssReview:proposals.filter(p=>p.inventoryLinkStatus==='REVIEW_MULTIPLE_DSS').length};
const report={generatedAt:new Date().toISOString(),sourceRuns:{siis:siisRun.id,inventory:importRun.id,review:reviewRun.id},summary,proposals};
fs.mkdirSync(path.dirname(outputPath),{recursive:true});fs.writeFileSync(outputPath,JSON.stringify(report,null,2));
const exceptions=proposals.filter(p=>p.identityStatus!=='READY'||p.inventoryLinkStatus!=='READY');
const md=['# Propuesta de catálogo canónico de ubicaciones','',`- Identidades propuestas: ${summary.total}`,`- Identidades listas: ${summary.identityReady}`,`- Identidades retenidas por vigencia SIIS: ${summary.identityHold}`,`- Vínculos de inventario listos: ${summary.inventoryLinkReady}`,`- Vínculos técnicos retenidos: ${summary.inventoryLinkHold}`,'','## Excepciones','','| Código SIIS | Nombre canónico | Zona | Estado identidad | Estado vínculo inventario | Candidato | Motivos |','|---|---|---|---|---|---|---|',...exceptions.map(p=>`| ${p.siisCode} | ${p.canonicalName} | ${p.zone} | ${p.identityStatus} | ${p.inventoryLinkStatus} | ${p.inventoryName||''} | ${p.validationFlags.join(', ')} |`)].join('\n');fs.writeFileSync(outputPath.replace(/\.json$/i,'.md'),md);
console.log(JSON.stringify({ok:true,outputPath,summary},null,2));
