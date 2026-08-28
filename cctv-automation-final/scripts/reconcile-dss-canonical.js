'use strict';

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { DatabaseSync } = require('node:sqlite');

const root = path.resolve(__dirname, '..');
const dbPath = path.resolve(process.env.CCTV_DB || path.join(root, 'data', 'cctv-staging.db'));
const dss = JSON.parse(fs.readFileSync(path.join(root, 'data', 'dss-device-staging.json'), 'utf8'));
const siteConfig = JSON.parse(fs.readFileSync(path.join(root, 'config', 'dss-physical-sites.json'), 'utf8'));
const apply = process.argv.includes('--apply');

const normalize = value => String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase()
  .replace(/\bOFI\b/g, 'OFICINA').replace(/\bPPAL\b/g, 'PRINCIPAL').replace(/\bPTO\b/g, 'PUNTO')
  .replace(/\bVG\b/g, 'VILLAGORGONA').replace(/[^A-Z0-9]+/g, ' ').replace(/\s+/g, ' ').trim();
const tokens = value => new Set(normalize(value).split(' ').filter(token => token.length > 1 && !['NVR','DVR','XVR','IPC','CAM','SMD'].includes(token)));
const similarity = (a,b) => { const aa=tokens(a),bb=tokens(b),overlap=[...aa].filter(x=>bb.has(x)).length; return overlap/Math.max(aa.size,bb.size,1); };
const zoneFrom = organization => normalize(String(organization||'').split('/').at(-1));
const assetType = type => /ANPR/i.test(type)?'ANPR_CAMERA':/ALARM/i.test(type)?'ALARM_CONTROLLER':/DVR|XVR/i.test(type)?'DVR':/NVR/i.test(type)?'NVR':/IPC|CAM/i.test(type)?'CAMERA':'OTHER';
const capacity = model => Number(String(model||'').match(/(?:NVR|XVR|HCVR)(?:\d{2})?(08|16|32|64)/i)?.[1]||(/IPC|ITC/i.test(model||'')?1:0))||null;

const db = new DatabaseSync(dbPath);
db.exec('PRAGMA foreign_keys=ON');
const locations = db.prepare('SELECT * FROM locations WHERE active=1').all();
const aliases = db.prepare('SELECT location_id,alias_raw FROM location_aliases').all();
const locationNames = new Map(locations.map(location=>[location.id,[location.canonical_name]]));
for(const alias of aliases)(locationNames.get(alias.location_id)||[]).push(alias.alias_raw);
const byCode = new Map(locations.filter(x=>x.siis_code).map(x=>[String(x.siis_code),x]));
const specialDevice = new Map();
for(const site of siteConfig.sites)for(const id of site.deviceIds)specialDevice.set(String(id),site);

const proposals=[];
for(const device of dss.devices){
  const special=specialDevice.get(String(device.deviceIdDss));
  if(special){const primary=special.members[0]?byCode.get(String(special.members[0].siisCode)):null;proposals.push({device,site:special,location:primary,method:'PHYSICAL_SITE_OVERRIDE',confidence:1});continue;}
  const mappedCode=siteConfig.deviceMappings?.[String(device.deviceIdDss)];
  if(mappedCode){const mapped=byCode.get(String(mappedCode));if(!mapped)throw new Error(`Mapeo DSS apunta a código SIIS inexistente: ${device.deviceIdDss} -> ${mappedCode}`);proposals.push({device,site:null,location:mapped,method:'HUMAN_REVIEWED_MAPPING',confidence:1});continue;}
  const deviceName=device.export?.name||'';const deviceZone=zoneFrom(device.export?.organization);
  const scored=locations.map(location=>({location,score:Math.max(...(locationNames.get(location.id)||[]).map(name=>similarity(deviceName,name))),sameZone:!deviceZone||normalize(location.zone)===deviceZone})).map(row=>({...row,score:row.score+(row.sameZone?0.08:0)})).sort((a,b)=>b.score-a.score);
  const best=scored[0],runner=scored[1];
  if(best&&best.score>=0.8&&best.score-(runner?.score||0)>=0.12)proposals.push({device,location:best.location,site:null,method:'NAME_ZONE_UNIQUE',confidence:Math.min(1,best.score)});
  else proposals.push({device,location:null,site:null,method:'REVIEW_REQUIRED',confidence:best?.score||0,candidate:best?.location?.canonical_name||null});
}

const summary={generatedAt:new Date().toISOString(),mode:apply?'APPLY':'DRY_RUN',dssDevices:proposals.length,models:proposals.filter(x=>x.device.model).length,linked:proposals.filter(x=>x.location).length,resolved:proposals.filter(x=>x.location||x.site).length,physicalSiteDevices:proposals.filter(x=>x.site).length,reviewRequired:proposals.filter(x=>!x.location&&!x.site).length};
const report={summary,sites:siteConfig.sites.map(site=>({...site,members:site.members.map(member=>({...member,location:byCode.get(String(member.siisCode))?.canonical_name||null}))})),linked:proposals.filter(x=>x.location||x.site).map(x=>({deviceId:x.device.deviceIdDss,name:x.device.export?.name,model:x.device.model,organization:x.device.export?.organization,site:x.site?.name||null,location:x.location?.canonical_name||null,siisCode:x.location?.siis_code||null,method:x.method,confidence:x.confidence})),review:proposals.filter(x=>!x.location&&!x.site).map(x=>({deviceId:x.device.deviceIdDss,name:x.device.export?.name,model:x.device.model,organization:x.device.export?.organization,candidate:x.candidate,confidence:x.confidence}))};
fs.mkdirSync(path.join(root,'reports'),{recursive:true});
fs.writeFileSync(path.join(root,'reports','dss-canonical-reconciliation-latest.json'),JSON.stringify(report,null,2));

if(apply){
  db.exec(`CREATE TABLE IF NOT EXISTS physical_sites(id TEXT PRIMARY KEY,canonical_name TEXT NOT NULL,zone TEXT,site_type TEXT,metadata_json TEXT,created_at TEXT NOT NULL,updated_at TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS physical_site_members(site_id TEXT NOT NULL,location_id TEXT NOT NULL,relation_type TEXT NOT NULL,opening_group TEXT,opening_policy TEXT NOT NULL DEFAULT 'INDEPENDENT',created_at TEXT NOT NULL,PRIMARY KEY(site_id,location_id),FOREIGN KEY(site_id) REFERENCES physical_sites(id),FOREIGN KEY(location_id) REFERENCES locations(id));
    CREATE TABLE IF NOT EXISTS dss_device_registry(dss_identifier TEXT PRIMARY KEY,physical_site_id TEXT,location_id TEXT,device_name TEXT NOT NULL,device_type TEXT,model TEXT,ip_address TEXT,organization TEXT,source_capture TEXT,match_method TEXT NOT NULL,confidence REAL NOT NULL,status TEXT NOT NULL DEFAULT 'ACTIVE',observed_at TEXT NOT NULL,metadata_json TEXT,FOREIGN KEY(physical_site_id) REFERENCES physical_sites(id),FOREIGN KEY(location_id) REFERENCES locations(id));`);
  const assetColumns=db.prepare('PRAGMA table_info(assets)').all().map(x=>x.name);if(!assetColumns.includes('physical_site_id'))db.exec('ALTER TABLE assets ADD COLUMN physical_site_id TEXT');
  const now=new Date().toISOString(),upsertSite=db.prepare(`INSERT INTO physical_sites(id,canonical_name,zone,site_type,metadata_json,created_at,updated_at) VALUES(?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET canonical_name=excluded.canonical_name,zone=excluded.zone,site_type=excluded.site_type,metadata_json=excluded.metadata_json,updated_at=excluded.updated_at`),upsertMember=db.prepare(`INSERT INTO physical_site_members(site_id,location_id,relation_type,opening_group,opening_policy,created_at) VALUES(?,?,?,?,?,?) ON CONFLICT(site_id,location_id) DO UPDATE SET relation_type=excluded.relation_type,opening_group=excluded.opening_group,opening_policy=excluded.opening_policy`);
  const upsertRegistry=db.prepare(`INSERT INTO dss_device_registry(dss_identifier,physical_site_id,location_id,device_name,device_type,model,ip_address,organization,source_capture,match_method,confidence,status,observed_at,metadata_json) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(dss_identifier) DO UPDATE SET physical_site_id=excluded.physical_site_id,location_id=excluded.location_id,device_name=excluded.device_name,device_type=excluded.device_type,model=excluded.model,ip_address=excluded.ip_address,organization=excluded.organization,source_capture=excluded.source_capture,match_method=excluded.match_method,confidence=excluded.confidence,status=excluded.status,observed_at=excluded.observed_at,metadata_json=excluded.metadata_json`);
  const upsertAsset=db.prepare(`INSERT INTO assets(id,location_id,asset_type,parent_asset_id,manufacturer,model,serial_number,firmware,dss_identifier,ip_address,channel_capacity,installed_at,lifecycle_status,metadata_json,physical_site_id) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET location_id=excluded.location_id,asset_type=excluded.asset_type,manufacturer=excluded.manufacturer,model=excluded.model,dss_identifier=excluded.dss_identifier,ip_address=excluded.ip_address,channel_capacity=excluded.channel_capacity,lifecycle_status=excluded.lifecycle_status,metadata_json=excluded.metadata_json,physical_site_id=excluded.physical_site_id`);
  db.exec('BEGIN IMMEDIATE');try{
    for(const site of siteConfig.sites){upsertSite.run(site.id,site.name,site.zone,site.type,JSON.stringify({observedChannelsMinimum:site.observedChannelsMinimum||null,source:'DSS_SCREENSHOTS_2026_08'}),now,now);for(const member of site.members){const location=byCode.get(String(member.siisCode));if(!location)throw new Error(`Código SIIS no encontrado: ${member.siisCode}`);upsertMember.run(site.id,location.id,member.relation,member.openingGroup,member.openingPolicy,now);}}
    for(const proposal of proposals){const d=proposal.device,e=d.export||{},siteId=proposal.site?.id||null,locationId=proposal.location?.id||null,resolved=!!(locationId||siteId);upsertRegistry.run(d.deviceIdDss,siteId,locationId,e.name||d.deviceIdDss,e.type||null,d.model||null,e.address||null,e.organization||null,d.sourceCapture||null,proposal.method,proposal.confidence,resolved?'ACTIVE':'UNLINKED',now,JSON.stringify({rawLine:d.rawLine,exportRow:e.exportRow||null}));if(resolved)upsertAsset.run(`DSS:${d.deviceIdDss}`,locationId,assetType(e.type),null,'Dahua',d.model||null,null,null,d.deviceIdDss,e.address||null,capacity(d.model),null,'ACTIVE',JSON.stringify({source:'DSS_SCREENSHOT',deviceName:e.name,organization:e.organization,matchMethod:proposal.method,confidence:proposal.confidence}),siteId);}
    // Los activos sintéticos del inventario heredado se conservan para auditoría,
    // pero dejan de contarse cuando ya existe evidencia DSS para la ubicación.
    db.prepare(`UPDATE assets SET lifecycle_status='RETIRED',metadata_json=json_set(COALESCE(metadata_json,'{}'),'$.retiredReason','SUPERSEDED_BY_DSS_CANONICAL','$.retiredAt',?)
      WHERE dss_identifier IS NULL AND lifecycle_status='ACTIVE' AND location_id IN (
        SELECT DISTINCT location_id FROM dss_device_registry WHERE status='ACTIVE' AND location_id IS NOT NULL
        UNION SELECT location_id FROM physical_site_members
      )`).run(now);
    db.prepare("UPDATE locations SET cctv_coverage_status='REPORTED_ACTIVE',updated_at=? WHERE active=1 AND cctv_coverage_status='ACTIVE' AND id NOT IN (SELECT DISTINCT location_id FROM dss_device_registry WHERE status='ACTIVE' AND location_id IS NOT NULL) AND id NOT IN (SELECT location_id FROM physical_site_members)").run(now);
    db.prepare("UPDATE locations SET cctv_coverage_status='ACTIVE',updated_at=? WHERE id IN (SELECT DISTINCT location_id FROM dss_device_registry WHERE status='ACTIVE' AND location_id IS NOT NULL) OR id IN (SELECT location_id FROM physical_site_members)").run(now);
    if(summary.reviewRequired===0)db.prepare("UPDATE locations SET cctv_coverage_status='NONE',updated_at=? WHERE active=1 AND cctv_coverage_status='REPORTED_ACTIVE'").run(now);
    db.exec('COMMIT');
  }catch(error){db.exec('ROLLBACK');throw error;}
}

console.log(JSON.stringify(summary,null,2));
