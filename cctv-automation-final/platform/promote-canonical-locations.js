'use strict';

const fs=require('node:fs');
const path=require('node:path');
const crypto=require('node:crypto');
const {DatabaseSync}=require('node:sqlite');
const {normalizeName}=require('./normalize');

const proposalPath=path.resolve(process.argv[2]||'reports/canonical-location-proposal-latest.json');
const dbPath=path.resolve(process.argv[3]||process.env.CCTV_DB||'data/cctv-staging.db');
const reportPath=path.resolve(process.argv[4]||'reports/canonical-promotion-latest.json');
const payload=JSON.parse(fs.readFileSync(proposalPath,'utf8'));
const ready=payload.proposals.filter(p=>p.identityStatus==='READY');
if(ready.length!==85)throw new Error(`Se esperaban 85 identidades listas y se obtuvieron ${ready.length}`);
const fingerprint=crypto.createHash('sha256').update(fs.readFileSync(proposalPath)).digest('hex');
const nameKeys=new Set();for(const p of ready){const k=`${normalizeName(p.zone)}|${normalizeName(p.canonicalName)}`;if(nameKeys.has(k))throw new Error(`Nombre canónico duplicado en la misma Zona: ${p.canonicalName}`);nameKeys.add(k);}
function locationType(name){const k=normalizeName(name);if(k.includes('PARQUEADERO'))return'PARKING';if(k.includes('OFICINA')||k.includes('PPAL'))return'OFFICE';if(k.includes('EDIFICIO'))return'BUILDING';return'POINT_OF_SALE';}
const db=new DatabaseSync(dbPath);db.exec(fs.readFileSync(path.join(__dirname,'schema.sql'),'utf8'));
const startedAt=new Date().toISOString();const run=db.prepare('INSERT INTO canonical_promotion_runs (started_at,status,source_file,source_fingerprint,summary_json) VALUES (?,?,?,?,?)').run(startedAt,'RUNNING',proposalPath,fingerprint,'{}');const runId=Number(run.lastInsertRowid);
const insertLocation=db.prepare('INSERT INTO locations (id,siis_code,canonical_name,zone,location_type,cctv_coverage_status,criticality,active,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?)');
const updateLocation=db.prepare('UPDATE locations SET canonical_name=?,zone=?,location_type=?,cctv_coverage_status=?,active=1,updated_at=? WHERE id=?');
const findLocation=db.prepare('SELECT * FROM locations WHERE siis_code=?');
const findAlias=db.prepare('SELECT id,location_id FROM location_aliases WHERE source_system=? AND alias_key=?');
const insertAlias=db.prepare('INSERT INTO location_aliases (location_id,source_system,alias_raw,alias_key) VALUES (?,?,?,?)');
const audit=db.prepare('INSERT INTO canonical_promotion_items (promotion_run_id,entity_type,entity_key,action,result,details_json) VALUES (?,?,?,?,?,?)');
const stats={locationsInserted:0,locationsUpdated:0,aliasesInserted:0,aliasesExisting:0,aliasConflicts:0};
db.exec('BEGIN');
try{
  for(const p of ready){const now=new Date().toISOString();let location=findLocation.get(String(p.siisCode));let action;
    if(location){updateLocation.run(p.canonicalName,normalizeName(p.zone),locationType(p.canonicalName),'ACTIVE',now,location.id);stats.locationsUpdated++;action='UPDATE';}
    else{const id=crypto.randomUUID();insertLocation.run(id,String(p.siisCode),p.canonicalName,normalizeName(p.zone),locationType(p.canonicalName),'ACTIVE',null,1,now,now);location={id};stats.locationsInserted++;action='INSERT';}
    audit.run(runId,'LOCATION',String(p.siisCode),action,'OK',JSON.stringify({locationId:location.id,canonicalName:p.canonicalName,zone:p.zone}));
    const aliases=[['SIIS',p.canonicalName],['MAINTENANCE_2026',p.maintenanceName],...(p.inventoryLinkStatus==='READY'?[['LEGACY_CCTV',p.inventoryName]]:[])].filter(([,v])=>String(v||'').trim());
    for(const[source,raw]of aliases){const aliasKey=normalizeName(raw),existing=findAlias.get(source,aliasKey);if(existing){if(existing.location_id===location.id){stats.aliasesExisting++;audit.run(runId,'ALIAS',`${source}|${aliasKey}`,'NOOP','EXISTS',JSON.stringify({locationId:location.id}));}else{stats.aliasConflicts++;audit.run(runId,'ALIAS',`${source}|${aliasKey}`,'SKIP','CONFLICT',JSON.stringify({expectedLocationId:location.id,existingLocationId:existing.location_id}));}continue;}insertAlias.run(location.id,source,raw,aliasKey);stats.aliasesInserted++;audit.run(runId,'ALIAS',`${source}|${aliasKey}`,'INSERT','OK',JSON.stringify({locationId:location.id,aliasRaw:raw}));}
  }
  if(stats.aliasConflicts)throw new Error(`Se detectaron ${stats.aliasConflicts} conflictos de alias`);
  db.exec('COMMIT');db.prepare('UPDATE canonical_promotion_runs SET completed_at=?,status=?,summary_json=? WHERE id=?').run(new Date().toISOString(),'SUCCESS',JSON.stringify(stats),runId);
}catch(error){try{db.exec('ROLLBACK');}catch{}db.prepare('UPDATE canonical_promotion_runs SET completed_at=?,status=?,summary_json=? WHERE id=?').run(new Date().toISOString(),'ERROR',JSON.stringify({error:error.message,stats}),runId);db.close();throw error;}
const totals={locations:db.prepare('SELECT COUNT(*) n FROM locations').get().n,aliases:db.prepare('SELECT COUNT(*) n FROM location_aliases').get().n};db.close();
const report={generatedAt:new Date().toISOString(),runId,sourceFile:proposalPath,sourceFingerprint:fingerprint,summary:stats,totals};fs.mkdirSync(path.dirname(reportPath),{recursive:true});fs.writeFileSync(reportPath,JSON.stringify(report,null,2));
const md=['# Promoción del catálogo canónico','',`- Ejecución: ${runId}`,`- Ubicaciones insertadas: ${stats.locationsInserted}`,`- Ubicaciones actualizadas: ${stats.locationsUpdated}`,`- Alias insertados: ${stats.aliasesInserted}`,`- Alias ya existentes: ${stats.aliasesExisting}`,`- Conflictos: ${stats.aliasConflicts}`,`- Total ubicaciones: ${totals.locations}`,`- Total alias: ${totals.aliases}`].join('\n');fs.writeFileSync(reportPath.replace(/\.json$/i,'.md'),md);
console.log(JSON.stringify({ok:true,reportPath,summary:stats,totals},null,2));
