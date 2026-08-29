require('dotenv').config({quiet:true});
const http = require('node:http');
const crypto = require('node:crypto');
const path = require('node:path');
const fs = require('node:fs');
const { DatabaseSync } = require('node:sqlite');
const { ImapFlow } = require('imapflow');
const { simpleParser } = require('mailparser');
const { observerPolicy } = require('../platform/siis-observer-policy');
const { scopeAudit } = require('../platform/project-scope');
const { evidenceByLocation } = require('../platform/project-evidence');
const { normalizeName } = require('../platform/normalize');
const { isOperationalOpeningSignal, asOperationalOpeningEvidence } = require('../platform/operational-event-policy');
const { runtimePaths, ensureRuntimeDirectories } = require('../config/runtime-paths');

ensureRuntimeDirectories();
const db = new DatabaseSync(runtimePaths.dbPath);
db.exec('PRAGMA foreign_keys=ON');
db.exec('PRAGMA busy_timeout=5000');
db.exec(fs.readFileSync(path.resolve(__dirname,'..','platform','schema.sql'),'utf8'));
db.exec(`CREATE TABLE IF NOT EXISTS cctv_location_overrides(
  location_id TEXT PRIMARY KEY REFERENCES locations(id), camera_count INTEGER, solution_kind TEXT,
  notes TEXT, updated_by TEXT NOT NULL, updated_at TEXT NOT NULL
)`);
const host = process.env.CCTV_API_HOST || '127.0.0.1';
const port = Number(process.env.CCTV_API_PORT || 3003);
const allowedOrigins = new Set(['http://127.0.0.1:5174', 'http://localhost:5174', 'http://127.0.0.1:5173', 'http://localhost:5173']);
function isAllowedOrigin(origin) {
  if (!origin) return false;
  if (allowedOrigins.has(origin)) return true;
  try {
    const { protocol, hostname, port } = new URL(origin);
    const privateLan = /^10\./.test(hostname) || /^192\.168\./.test(hostname) || /^172\.(1[6-9]|2\d|3[01])\./.test(hostname);
    return protocol === 'http:' && privateLan && (port === '5173' || port === '5174');
  } catch { return false; }
}
const dssFile = path.resolve(__dirname, '..', 'data', 'dss-device-staging.json');
const dahuaCatalogFile = path.resolve(__dirname, '..', 'data', 'dahua-product-catalog.json');
const imageDir = path.resolve(__dirname, '..', 'image');
const reconciliationFile = path.join(runtimePaths.reportDir, 'crm-points-reconciliation-latest.json');
const eventSnapshotDir = runtimePaths.eventSnapshotDir;
const supportImageDir = runtimePaths.supportImageDir;
const trelloCacheDb = runtimePaths.trelloCacheDb;

function send(res, status, body, origin) {
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store, max-age=0',
    ...(isAllowedOrigin(origin) ? { 'Access-Control-Allow-Origin': origin } : {}),
    'Access-Control-Allow-Headers': 'Content-Type, X-Actor',
    'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
  });
  res.end(JSON.stringify(body));
}
function sendImage(res,filePath,contentType,origin){res.writeHead(200,{'Content-Type':contentType,'Cache-Control':'private, max-age=3600',...(allowedOrigins.has(origin)?{'Access-Control-Allow-Origin':origin}:{})});fs.createReadStream(filePath).pipe(res);}
function readBody(req) { return new Promise((resolve, reject) => { let raw=''; req.on('data', c => { raw+=c; if(raw.length>1e6) reject(new Error('Payload demasiado grande')); }); req.on('end',()=>{try{resolve(JSON.parse(raw||'{}'))}catch{reject(new Error('JSON inválido'))}}); req.on('error',reject); }); }
async function eventSnapshot(eventId){
  if(!/^[a-f0-9-]{30,40}$/i.test(eventId))throw new Error('Identificador de evento inválido');
  const event=db.prepare("SELECT raw_reference,payload_json FROM cctv_events WHERE id=? AND source_system='EMAIL_DAHUA'").get(eventId);if(!event)return null;
  const payload=JSON.parse(event.payload_json||'{}');if(!payload.hasAttachment)return {available:false,reason:'Este correo no reporta adjuntos'};
  fs.mkdirSync(eventSnapshotDir,{recursive:true});
  const cached=fs.readdirSync(eventSnapshotDir).find(name=>name.startsWith(`${eventId}.`));if(cached){const extension=path.extname(cached).slice(1);return {available:true,path:path.join(eventSnapshotDir,cached),contentType:extension==='png'?'image/png':extension==='webp'?'image/webp':'image/jpeg',cached:true};}
  const match=String(event.raw_reference||'').match(/^imap:\/\/(.+)\/uid\/(\d+)$/);if(!match)return {available:false,reason:'Referencia IMAP no disponible'};
  const folder=decodeURIComponent(match[1]),uid=Number(match[2]);
  const client=new ImapFlow({host:process.env.IMAP_HOST,port:Number(process.env.IMAP_PORT),secure:true,auth:{user:process.env.IMAP_USER,pass:process.env.IMAP_PASSWORD},logger:false});
  await client.connect();try{const lock=await client.getMailboxLock(folder,{readOnly:true});try{const message=await client.fetchOne(uid,{source:true},{uid:true});if(!message?.source)return {available:false,reason:'El correo ya no está disponible en la bandeja'};const parsed=await simpleParser(message.source);const image=(parsed.attachments||[]).find(file=>['image/jpeg','image/png','image/webp'].includes(file.contentType)&&file.size<=5*1024*1024);if(!image)return {available:false,reason:'No se encontró una imagen compatible menor de 5 MB'};const extension=image.contentType==='image/png'?'png':image.contentType==='image/webp'?'webp':'jpg',filePath=path.join(eventSnapshotDir,`${eventId}.${extension}`);fs.writeFileSync(filePath,image.content,{mode:0o600});return {available:true,path:filePath,contentType:image.contentType,cached:false};}finally{lock.release();}}finally{if(client.usable)await client.logout();else client.close();}
}
function candidateRows(search='', zone='') {
  const pattern = `%${search}%`;
  return db.prepare(`SELECT l.id,l.siis_code AS siisCode,l.canonical_name AS name,l.zone,l.location_type AS locationType,
    l.cctv_coverage_status AS coverageStatus,COUNT(c.id) AS operationalNodes,
    MAX(CASE WHEN c.relation_type='SHARED_DOUBLE' THEN 1 ELSE 0 END) AS isDouble
    FROM locations l JOIN crm_point_links c ON c.location_id=l.id AND c.status='ACTIVE'
    WHERE l.active=1 AND l.cctv_coverage_status='NONE'
      AND (?='' OR l.zone=?) AND (?='' OR l.canonical_name LIKE ? OR l.siis_code LIKE ?)
    GROUP BY l.id ORDER BY l.zone,l.canonical_name LIMIT 300`).all(zone,zone,search,pattern,pattern);
}
function normalizeZone(zone){ return zone==='AMAIME'?'AMAIME Y EL PLACER':zone; }
function normalizeText(value=''){return String(value).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toUpperCase().replace(/[^A-Z0-9]+/g,' ').trim();}
function syncOperationalNotifications(){
  const now=new Date().toISOString(),upsert=db.prepare(`INSERT INTO operational_notifications(id,title,description,severity,source,target_tab,occurred_at,created_at,payload_json) VALUES(?,?,?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET title=excluded.title,description=excluded.description,severity=excluded.severity,occurred_at=excluded.occurred_at,payload_json=excluded.payload_json`);
  const labels={OPENING:'Apertura detectada',CLOSING:'Cierre detectado',ALARM:'Alarma local',LOCAL_ALARM:'Alarma local',CABLE_TRAP:'Cable trampa',TRIPWIRE:'Cruce de línea'};
  const events=db.prepare(`SELECT e.id,e.location_id,e.event_type,e.occurred_at,e.received_at,e.payload_json,l.canonical_name FROM cctv_events e LEFT JOIN locations l ON l.id=e.location_id WHERE COALESCE(e.event_phase,'')<>'FIN' AND e.event_type NOT IN ('MOTION','MOVIMIENTO','DISCARDED') AND COALESCE(e.received_at,e.occurred_at)>=datetime('now','-7 days') ORDER BY COALESCE(e.received_at,e.occurred_at)`).all(),seen=new Set();
  for(const event of events){let payload={};try{payload=JSON.parse(event.payload_json||'{}')}catch{}const occurred=event.occurred_at||event.received_at||now,bucket=Math.floor(new Date(occurred).getTime()/300000),identity=event.location_id||event.canonical_name||payload.storeRaw||'UNKNOWN',id=`EVENT:${identity}:${event.event_type}:${bucket}`;if(seen.has(id))continue;seen.add(id);const pending=!event.location_id||String(payload.identityStatus||'').includes('PENDING'),important=pending||['ALARM','LOCAL_ALARM','CABLE_TRAP','TRIPWIRE'].includes(event.event_type),title=pending?'Evento por conciliar':labels[event.event_type]||'Nueva actividad CCTV',place=event.canonical_name||payload.storeRaw||'Punto sin identificar';db.prepare("DELETE FROM operational_notifications WHERE source='Correo CCTV' AND json_extract(payload_json,'$.eventId')=? AND id<>?").run(event.id,id);upsert.run(id,title,place,important?'warning':'info','Correo CCTV','events',occurred,now,JSON.stringify({eventId:event.id,eventType:event.event_type,locationId:event.location_id,sourceIp:payload.sourceIp||null,identityMethod:payload.identityMethod||null}));}
  const support=db.prepare(`SELECT source_card_id,title_raw,status,source_updated_at,due_at,location_id FROM support_cards WHERE source_system='TRELLO_SUPPORT' AND active=1 AND COALESCE(source_updated_at,due_at)>=datetime('now','-7 days')`).all();
  for(const item of support){const occurred=item.source_updated_at||item.due_at||now,key=`${item.source_card_id}:${item.status}:${occurred}`,completed=item.status==='COMPLETED';upsert.run(`SUPPORT:${key}`,completed?'Actividad técnica completada':'Nueva actividad de soporte',item.title_raw,completed?'info':'warning','Trello','support',occurred,now,JSON.stringify({cardId:item.source_card_id,locationId:item.location_id,status:item.status}));}
  const maintenance=db.prepare(`SELECT COUNT(*) AS total,MIN(scheduled_at) AS oldest FROM maintenance_work_items WHERE source_system='TRELLO' AND active=1 AND status<>'COMPLETED' AND scheduled_at<date('now','-5 hours')`).get();
  if(Number(maintenance.total)>0)upsert.run('MAINTENANCE:OVERDUE','Mantenimiento vencido',`${maintenance.total} actividades pendientes · la más antigua estaba programada para ${maintenance.oldest}`,Number(maintenance.total)>=5?'critical':'warning','Programa CCTV','maintenance',now,now,JSON.stringify({filter:'OVERDUE',count:Number(maintenance.total)}));
  else db.prepare("DELETE FROM operational_notifications WHERE id='MAINTENANCE:OVERDUE'").run();
  const visitorDay=db.prepare("SELECT date('now','-5 hours','-1 day') AS day").get().day,openVisitors=db.prepare("SELECT COUNT(*) AS total FROM visitor_visits WHERE report_date=? AND exit_at IS NULL AND lower(visit_status) LIKE '%entrada%'").get(visitorDay).total;
  if(Number(openVisitors)>0)upsert.run(`VISITORS:OPEN:${visitorDay}`,'Visitantes sin salida registrada',`${openVisitors} visitas del ${visitorDay} requieren verificación de cierre`,'warning','Control de acceso ZK','visitors',now,now,JSON.stringify({date:visitorDay,filter:'OPEN'}));
  db.prepare("DELETE FROM operational_notifications WHERE id LIKE 'SOURCE:%'").run();
  for(const source of syncStatusData().sources.filter(item=>item.status==='ERROR'||item.status==='STALE'||item.status==='NO_DATA')){const critical=source.status==='ERROR'||source.status==='NO_DATA';upsert.run(`SOURCE:${source.key}`,`${source.name}: ${critical?'fuente no disponible':'sincronización atrasada'}`,source.message,critical?'critical':'warning',source.name,'operations',source.lastRunAt||now,now,JSON.stringify({sourceKey:source.key,status:source.status}));}
  db.prepare("DELETE FROM operational_notifications WHERE occurred_at<datetime('now','-90 days')").run();
}
function notificationsData(actor){syncOperationalNotifications();if(!db.prepare('SELECT 1 FROM operational_notification_states WHERE actor=? LIMIT 1').get(actor)){const now=new Date().toISOString(),baseline=db.prepare('SELECT id FROM operational_notifications ORDER BY occurred_at DESC LIMIT 60').all(),insert=db.prepare('INSERT OR IGNORE INTO operational_notification_states(notification_id,actor,read_at,attended_at,updated_at) VALUES(?,?,?,?,?)');db.exec('BEGIN IMMEDIATE');try{for(const row of baseline)insert.run(row.id,actor,now,now,now);db.exec('COMMIT')}catch(error){db.exec('ROLLBACK');throw error}}const items=db.prepare(`SELECT n.*,s.read_at,s.attended_at FROM operational_notifications n LEFT JOIN operational_notification_states s ON s.notification_id=n.id AND s.actor=? ORDER BY n.occurred_at DESC LIMIT 60`).all(actor).map(row=>({id:row.id,title:row.title,description:row.description,severity:row.severity,source:row.source,targetTab:row.target_tab,createdAt:row.occurred_at,read:!!row.read_at,attended:!!row.attended_at,payload:JSON.parse(row.payload_json||'{}')}));const preference=db.prepare('SELECT popup_mode AS mode FROM operational_notification_preferences WHERE actor=?').get(actor)?.mode||'ALL';return{generatedAt:new Date().toISOString(),actor,preference,summary:{total:items.length,unread:items.filter(x=>!x.read).length,open:items.filter(x=>!x.attended).length},items};}
function locationSearch(query=''){
  const key=normalizeText(query),tokens=new Set(key.split(' ').filter(x=>x.length>1));
  return db.prepare('SELECT id,siis_code AS code,canonical_name AS name,zone,location_type AS type,cctv_coverage_status AS coverage FROM locations WHERE active=1').all().map(item=>{const candidate=normalizeText(`${item.name} ${item.code||''} ${item.zone||''}`),candidateTokens=new Set(candidate.split(' '));let score=candidate.includes(key)&&key?80:0;for(const token of tokens)if(candidateTokens.has(token))score+=20;return {...item,zone:normalizeZone(item.zone),score};}).filter(item=>!key||item.score>0).sort((a,b)=>b.score-a.score||a.name.localeCompare(b.name)).slice(0,30);
}
function classifyDahuaModel(model=''){
  const value=model.toUpperCase();
  if(value.includes('IPC-K35'))return {category:'Cámara IP',family:'K35 legado'};
  if(value.includes('ITC'))return {category:'ANPR',family:'Cámara de tráfico inteligente'};
  if(value.includes('ARC'))return {category:'Alarma',family:'Hub de alarma'};
  if(value.includes('IPC')||value.includes('T4A'))return {category:'Cámara IP',family:value.includes('3441')||value.includes('5241')||value.includes('T4A')?'WizSense':'Cámara IP'};
  if(value.includes('XVR')||value.includes('HCVR'))return {category:'Grabador HDCVI',family:'XVR/HCVR'};
  if(value.includes('NVR'))return {category:'NVR',family:value.includes('-EI')?'WizSense':'Lite/Pro NVR'};
  return {category:'Por clasificar',family:'Modelo no clasificado'};
}
function modelCharacteristics(model='',category=''){
  const value=model.toUpperCase(),features=[];
  const channelMatch=value.match(/NVR\d{2}(08|16|32|64)|XVR\d{2}(08|16|32)|HCVR\d{2}(08|16|32)/),channels=channelMatch?Number(channelMatch[1]):null;
  const poeMatch=value.match(/-(8|16|24)P-/),poePorts=poeMatch?Number(poeMatch[1]):null;
  if(channels)features.push(`${channels} canales`);if(poePorts)features.push(`${poePorts} puertos PoE`);
  if(/4KS[23]|4KL/.test(value))features.push('Salida 4K');
  if(/-EI2?$|HS-EI$|5208-EI|5864-EI/.test(value))features.push('IA WizSense');
  if(category==='NVR')features.push('Compresión H.265+');
  if(value.includes('HDBW2441')||value.includes('HDBW3441')||value.includes('T4A'))features.push('Resolución 4 MP');
  if(value.includes('HDBW5241'))features.push('Resolución 2 MP');
  if(/HDBW3|HDBW5|T4A/.test(value))features.push('Protección perimetral');
  if(/AS/.test(value))features.push('Audio / E/S de alarma');
  if(value.includes('ZE'))features.push('Lente varifocal motorizado');
  if(value.includes('T4A'))features.push('Disuasión activa');
  if(value.includes('IPC-K35'))features.push('MicroSD','Modelo legado');
  if(category==='ANPR')features.push('Lectura de placas','Analítica vehicular');
  if(category==='Alarma')features.push('Enlace de video','Ethernet · Wi-Fi · celular');
  return {channels,poePorts,features:[...new Set(features)].slice(0,6)};
}
function exactModelImage(model=''){
  const key=normalizeText(model).replaceAll(' ','');
  const files=fs.readdirSync(imageDir).filter(name=>/\.(png|jpe?g|webp)$/i.test(name));
  const normalized=files.map(name=>({name,key:normalizeText(path.parse(name).name).replaceAll(' ','')}));
  const aliases={
    'DHINVR5232E1':'DHI-NVR5232-EI.png',
    'ITC413PWA4D1Z1':'ITC413-PWA4D-IZ1.png',
    'ITC415PW6MIZC2':'ITC415.jpg',
  };
  if(aliases[key]&&files.includes(aliases[key]))return aliases[key];
  return normalized.find(file=>file.key===key)?.name||normalized.find(file=>file.key.startsWith(key)&&file.key.length-key.length<=8)?.name||null;
}
function technologyData(){
  const dss=require(dssFile),catalog=require(dahuaCatalogFile),verified=new Map(catalog.products.map(item=>[item.model,item]));
  const categoryImages={'NVR':'NVR Oficina.png','Cámara IP':'Cam Domo.png','ANPR':'Cam ANPR.png','Alarma':'kit Dahua.png','Grabador HDCVI':'NVR Oficina.png','MVR':'MVR.png','Servidor':'DSS 7116D.png','Por clasificar':'logo.png'};
  const modelMap=new Map();
  for(const device of dss.devices||[]){const model=device.model||'SIN MODELO';const known=verified.get(model);const inferred=classifyDahuaModel(model);const category=known?.category||inferred.category,family=known?.family||inferred.family;const exactImage=exactModelImage(model),imageFile=exactImage||known?.image||categoryImages[category],characteristics=modelCharacteristics(model,category),technologies=[...new Set([...(known?.technologies||[]),...characteristics.features])],technologyMarks=[];if(technologies.some(item=>/ACUPICK/i.test(item)))technologyMarks.push({key:'ACUPICK',label:'AcuPick',imageUrl:`/api/cctv/media/${encodeURIComponent('acupick.png')}`});if(/WIZSENSE/i.test(family)||technologies.some(item=>/WIZSENSE/i.test(item)))technologyMarks.push({key:'WIZSENSE',label:'WizSense',imageUrl:`/api/cctv/media/${encodeURIComponent('Wiz Sense.png')}`});if(/WIZMIND/i.test(family)||technologies.some(item=>/WIZMIND/i.test(item)))technologyMarks.push({key:'WIZMIND',label:'WizMind',imageUrl:`/api/cctv/media/${encodeURIComponent('Wiz mind.png')}`});const compactModel=normalizeText(model).replaceAll(' ','');const imageScale=/NVR(4208|5208|4108|4216|4232)/.test(compactModel)&&!compactModel.includes('8P')?1.45:compactModel.includes('IPC-K35')?1.2:1;const current=modelMap.get(model)||{model,count:0,category,family,lifecycle:known?.lifecycle||'POR VERIFICAR',technologies,technologyMarks,imageScale,characteristics,officialUrl:known?.officialUrl||null,verified:!!known,imageUrl:imageFile?`/api/cctv/media/${encodeURIComponent(imageFile)}`:null,imageMode:exactImage||known?.image?'EXACT':'REFERENCE'};current.count++;modelMap.set(model,current);}
  const externalAssets=[
    {model:'MVR VEHICULAR · MODELO POR CONFIRMAR',count:6,category:'MVR',family:'Videovigilancia móvil',lifecycle:'POR VERIFICAR',technologies:['Grabación vehicular','Conectividad móvil','Almacenamiento local'],image:'MVR.png',source:'DATOS CCTV · Vehículos MVR'},
    {model:'DSS7116D',count:1,category:'Servidor',family:'Plataforma central DSS',lifecycle:'ACTIVO',technologies:['Gestión centralizada','Administración de dispositivos','Monitoreo CCTV'],image:'DSS 7116D.png',source:'Infraestructura central'},
  ];
  for(const asset of externalAssets){
    modelMap.set(asset.model,{...asset,verified:true,technologyMarks:[],characteristics:{features:asset.technologies},officialUrl:null,imageUrl:`/api/cctv/media/${encodeURIComponent(asset.image)}`,imageMode:'EXACT',external:true,hasAi:false});
  }
  const models=[...modelMap.values()].sort((a,b)=>b.count-a.count);
  for(const model of models)model.hasAi=model.hasAi??(model.technologyMarks.length>0||model.technologies.some(item=>/\bIA\b|INTELIGEN|ACUPICK|WIZSENSE|WIZMIND|RECONOCIMIENTO FACIAL|SMD|ANAL[IÍ]TICA|LECTURA DE PLACAS/i.test(item)));
  const aggregate=key=>[...models.reduce((map,item)=>map.set(item[key],(map.get(item[key])||0)+item.count),new Map())].map(([name,value])=>({name,value})).sort((a,b)=>b.value-a.value);
  return {generatedAt:new Date().toISOString(),catalog:catalog.meta,summary:{models:models.length,verifiedModels:models.filter(x=>x.verified).length,verifiedDevices:models.filter(x=>x.verified).reduce((n,x)=>n+x.count,0),devices:models.reduce((n,x)=>n+x.count,0)},categories:aggregate('category'),families:aggregate('family'),models};
}
function overviewData(){
  const locations=db.prepare('SELECT zone,cctv_coverage_status,location_type,active FROM locations').all();
  const active=locations.filter(x=>x.active===1), covered=active.filter(x=>x.cctv_coverage_status==='ACTIVE'),reported=active.filter(x=>x.cctv_coverage_status==='REPORTED_ACTIVE');
  const zoneMap=new Map();
  for(const location of active){const zone=normalizeZone(location.zone||'SIN ZONA');if(!zoneMap.has(zone))zoneMap.set(zone,{name:zone,total:0,covered:0,devices:0,channels:0,attention:0});const item=zoneMap.get(zone);item.total++;if(location.cctv_coverage_status==='ACTIVE')item.covered++;if(location.cctv_coverage_status==='REPORTED_ACTIVE')item.attention++;}
  const dss=require(dssFile), reconciliation=JSON.parse(require('node:fs').readFileSync(reconciliationFile,'utf8'));
  const modelMap=new Map();for(const device of dss.devices||[]){const model=device.model||'SIN MODELO';modelMap.set(model,(modelMap.get(model)||0)+1);}
  for(const row of db.prepare(`SELECT COALESCE(l.zone,ps.zone) zone,COUNT(*) devices FROM dss_device_registry d LEFT JOIN locations l ON l.id=d.location_id LEFT JOIN physical_sites ps ON ps.id=d.physical_site_id WHERE d.status='ACTIVE' GROUP BY COALESCE(l.zone,ps.zone)`).all()){const zone=normalizeZone(row.zone);if(zoneMap.has(zone))zoneMap.get(zone).devices+=Number(row.devices||0);}
  const declaredChannels=db.prepare('SELECT COALESCE(SUM(camera_count),0) total FROM stg_inventory_locations WHERE import_run_id=(SELECT MAX(id) FROM import_runs)').get().total;
  return {generatedAt:new Date().toISOString(),source:'SQLite canónico + CRM/SIIS + DSS',totals:{crmPoints:reconciliation.summary.crmPoints,locations:active.length,covered:covered.length,reported:reported.length,withoutCctv:active.filter(x=>x.cctv_coverage_status==='NONE').length,linkedNodes:db.prepare("SELECT COUNT(*) n FROM crm_point_links WHERE status='ACTIVE'").get().n,dssDevices:dss.summary.uniqueDeviceIds,declaredChannels,models:dss.summary.withModel,heldWithoutSiis:14},coverage:[{name:'CCTV confirmado por DSS',value:covered.length,color:'#22c55e'},{name:'Reportado · sin confirmar DSS',value:reported.length,color:'#f59e0b'},{name:'Sin CCTV',value:active.filter(x=>x.cctv_coverage_status==='NONE').length,color:'#334155'}],zones:[...zoneMap.values()].sort((a,b)=>b.total-a.total),models:[...modelMap.entries()].map(([name,value])=>({name,value})).sort((a,b)=>b.value-a.value).slice(0,8)};
}
function inventoryRows(search='',zone='',coverage='covered'){
  const pattern=`%${search}%`;
  const legacyByLocation=new Map(db.prepare(`SELECT la.location_id,i.location_name_raw,i.camera_count,i.recorder_model,i.alarm_raw,i.analytics_raw
    FROM location_aliases la JOIN stg_inventory_locations i ON i.location_name_key=la.alias_key
    WHERE la.source_system='LEGACY_CCTV' AND i.import_run_id=(SELECT MAX(id) FROM import_runs)`).all().map(row=>[row.location_id,row]));
  const overrides=new Map(db.prepare('SELECT * FROM cctv_location_overrides').all().map(row=>[row.location_id,row]));
  const latestEvents=new Map(db.prepare(`SELECT location_id,event_type,occurred_at,received_at FROM (
    SELECT location_id,event_type,occurred_at,received_at,ROW_NUMBER() OVER(PARTITION BY location_id ORDER BY COALESCE(occurred_at,received_at) DESC) rank
    FROM cctv_events WHERE location_id IS NOT NULL AND event_type<>'DISCARDED') WHERE rank=1`).all().map(row=>[row.location_id,row]));
  return db.prepare(`SELECT l.id,l.siis_code AS code,l.canonical_name AS name,l.zone,l.location_type AS type,l.cctv_coverage_status,
    COUNT(DISTINCT c.id) AS operationalNodes,COUNT(DISTINCT a.id) AS assetCount,COUNT(DISTINCT CASE WHEN a.asset_type IN ('CAMERA','STANDALONE_CAMERA','ANPR_CAMERA') THEN a.id END) AS channels,
    COUNT(DISTINCT CASE WHEN a.asset_type IN ('NVR','DVR') THEN a.id END) AS recorderCount,GROUP_CONCAT(DISTINCT a.model) AS models,MAX(CASE WHEN c.relation_type='SHARED_DOUBLE' OR psm.opening_policy='ANY_MEMBER_OPENS_ALL' THEN 1 ELSE 0 END) AS isDouble,
    MAX(ps.canonical_name) AS physicalSite,MAX(CAST(json_extract(ps.metadata_json,'$.observedChannelsMinimum') AS INTEGER)) AS observedChannelsMinimum
    FROM locations l LEFT JOIN crm_point_links c ON c.location_id=l.id AND c.status='ACTIVE' LEFT JOIN physical_site_members psm ON psm.location_id=l.id LEFT JOIN physical_sites ps ON ps.id=psm.site_id LEFT JOIN assets a ON (a.location_id=l.id OR (psm.site_id IS NOT NULL AND a.physical_site_id=psm.site_id)) AND a.lifecycle_status='ACTIVE'
    WHERE l.active=1 AND (?='' OR l.zone=?) AND (?='' OR l.canonical_name LIKE ? OR l.siis_code LIKE ?)
      AND (?='all' OR (?='covered' AND l.cctv_coverage_status='ACTIVE') OR (?='none' AND l.cctv_coverage_status='NONE'))
    GROUP BY l.id ORDER BY l.zone,l.canonical_name LIMIT 400`).all(zone,zone,search,pattern,pattern,coverage,coverage,coverage).map(row=>{
      const legacy=legacyByLocation.get(row.id),override=overrides.get(row.id);
      const cameras=Number(override?.camera_count||legacy?.camera_count||row.channels||0);
      const raw=`${legacy?.location_name_raw||''} ${legacy?.recorder_model||''} ${legacy?.analytics_raw||''}`.toUpperCase();
      const alarm=String(legacy?.alarm_raw||'').toUpperCase();
      const isK35=raw.includes('K35');
      const solutionKind=override?.solution_kind||(isK35?'K35':Number(row.recorderCount)>0?'KIT':cameras===1?'SINGLE_CAMERA':cameras>1?'KIT':'UNCONFIRMED');
      const capabilities=[];
      if(solutionKind==='KIT')capabilities.push({key:'kit',label:'Kit CCTV'});
      if(solutionKind==='SINGLE_CAMERA')capabilities.push({key:'single',label:'Cámara autónoma'});
      if(isK35)capabilities.push({key:'k35',label:'K35 legado'});
      if(/SMD|IVS|ANAL[IÍ]T/.test(raw))capabilities.push({key:'analytics',label:'Analítica avanzada'});
      if(/\bIA\b|\bAI\b|INTELIG|DEEP/.test(raw))capabilities.push({key:'ai',label:'IA'});
      if(alarm.includes('OSZFORD')||raw.includes('OSZFORD'))capabilities.push({key:'oszford',label:'Alarma OSZFORD'});
      if(!capabilities.length)capabilities.push({key:'unconfirmed',label:'Tecnología por confirmar'});
      const reported=row.cctv_coverage_status==='REPORTED_ACTIVE';
      let workflowState='READY',statusLabel='Inventario conciliado',reviewReason=null,actionLabel='Abrir ficha';
      if(!legacy&&!override&&!row.assetCount){workflowState='COMPLETE_REQUIRED';statusLabel='Información no disponible';reviewReason='Ninguna fuente técnica asociada confirma todavía la configuración del punto.';actionLabel='Completar información';}
      else if(solutionKind==='UNCONFIRMED'){workflowState='REVIEW_REQUIRED';statusLabel='Conciliación requerida';reviewReason='La fuente existe, pero no permite confirmar el tipo de solución instalada.';actionLabel='Conciliar datos';}
      else if(!row.assetCount){workflowState='SYNC_PENDING';statusLabel='Pendiente de sincronización';reviewReason='La información existe en DATOS CCTV y puede incorporarse al inventario canónico.';actionLabel='Sincronizar activo';}
      else if(reported){workflowState='REVIEW_REQUIRED';statusLabel='Conciliación requerida';reviewReason='La cobertura fue heredada de Operación de Puntos y requiere validación técnica.';actionLabel='Conciliar datos';}
      const system=row.models?`${Number(row.recorderCount)||1} grabador(es) · ${row.models}`:solutionKind==='K35'?'Cámara K35 · tecnología legado':solutionKind==='SINGLE_CAMERA'?'Cámara autónoma con microSD':solutionKind==='KIT'?`Kit CCTV · ${cameras} cámaras`:'Configuración técnica por confirmar';
      const latestEvent=latestEvents.get(row.id),eventLabels={OPENING:'Apertura',CLOSING:'Cierre',MOTION:'Movimiento',TRIPWIRE:'Cruce de línea',ALARMA_LOCAL:'Alarma local',CABLE_TRAMPA:'Cable trampa'};
      return {id:row.id,code:row.code,name:row.name,zone:normalizeZone(row.zone),type:row.type,system,solutionKind,workflowState,coverage:row.cctv_coverage_status==='ACTIVE'?'CCTV confirmado por DSS':'CCTV reportado',channels:cameras||null,channelDisplay:Number(row.observedChannelsMinimum)?`${row.observedChannelsMinimum}+ en el sitio`:cameras||null,state:reviewReason?'attention':'online',statusLabel,reviewReason,actionLabel,project:'Por conciliar',event:latestEvent?`${eventLabels[latestEvent.event_type]||latestEvent.event_type} · ${latestEvent.occurred_at||latestEvent.received_at}`:'Sin eventos canónicos',lastEvent:latestEvent||null,evidence:row.assetCount?'DSS · captura Device Info':override?'Validación manual':legacy?'DATOS CCTV + catálogo canónico':'Operación de Puntos',tech:capabilities,action:reviewReason||'Verificar datos del activo',operationalNodes:row.operationalNodes,isDouble:!!row.isDouble,assetCount:row.assetCount,physicalSite:row.physicalSite||null,notes:override?.notes||null};
    });
}
function locationDetail(locationId){
  const location=db.prepare('SELECT id,siis_code AS code,canonical_name AS name,zone,location_type AS type,cctv_coverage_status AS coverage FROM locations WHERE id=? AND active=1').get(locationId);
  if(!location)return null;
  const assets=db.prepare(`SELECT id,asset_type AS type,manufacturer,model,serial_number AS serial,fixed_asset_code AS fixedAssetCode,ip_address AS ip,dss_identifier AS dssIdentifier,lifecycle_status AS status FROM assets WHERE location_id=? AND lifecycle_status='ACTIVE' ORDER BY asset_type,model`).all(locationId);
  const events=db.prepare(`SELECT id,event_type AS eventType,occurred_at AS occurredAt,received_at AS receivedAt,severity,payload_json AS payload FROM cctv_events WHERE location_id=? AND event_type IN ('OPENING','CLOSING') AND COALESCE(occurred_at,received_at)>=datetime('now','-45 days') ORDER BY COALESCE(occurred_at,received_at)`).all(locationId).map(row=>({...row,payload:JSON.parse(row.payload||'{}')}));
  const aliases=db.prepare('SELECT source_system AS source,alias_raw AS alias FROM location_aliases WHERE location_id=? ORDER BY source_system,alias_raw').all(locationId);
  const localParts=value=>{const parts=new Intl.DateTimeFormat('en-CA',{timeZone:'America/Bogota',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(new Date(value));const get=type=>parts.find(part=>part.type===type)?.value;return{date:`${get('year')}-${get('month')}-${get('day')}`,minutes:Number(get('hour'))*60+Number(get('minute'))};};
  const formatMinutes=value=>Number.isFinite(value)?`${String(Math.floor(value/60)%24).padStart(2,'0')}:${String(Math.round(value)%60).padStart(2,'0')}`:null;
  const average=values=>values.length?Math.round(values.reduce((sum,value)=>sum+value,0)/values.length):null;
  const days=new Map();
  for(const event of events){const stamp=event.occurredAt||event.receivedAt;if(!stamp)continue;const part=localParts(stamp),day=days.get(part.date)||{date:part.date,cctvOpening:null,cctvClosing:null,firstPing:null,lastPing:null,monitoringStarted:null,monitoringEnded:null};if(event.eventType==='OPENING'&&part.minutes<=12*60&&(day.cctvOpening==null||part.minutes<day.cctvOpening))day.cctvOpening=part.minutes;if(event.eventType==='CLOSING'&&part.minutes>=13*60&&(day.cctvClosing==null||part.minutes>day.cctvClosing))day.cctvClosing=part.minutes;days.set(part.date,day);}
  const pingRows=location.code?db.prepare(`SELECT r.completed_at AS capturedAt,s.online FROM siis_sync_runs r JOIN stg_siis_locations s ON s.sync_run_id=r.id WHERE r.status='SUCCESS' AND s.siis_code=? AND r.completed_at>=datetime('now','-45 days') ORDER BY r.completed_at`).all(location.code):[];
  for(const ping of pingRows){if(!ping.capturedAt)continue;const part=localParts(ping.capturedAt),day=days.get(part.date)||{date:part.date,cctvOpening:null,cctvClosing:null,firstPing:null,lastPing:null,monitoringStarted:null,monitoringEnded:null};if(day.monitoringStarted==null||part.minutes<day.monitoringStarted)day.monitoringStarted=part.minutes;if(day.monitoringEnded==null||part.minutes>day.monitoringEnded)day.monitoringEnded=part.minutes;if(ping.online===1){if(day.firstPing==null||part.minutes<day.firstPing)day.firstPing=part.minutes;if(day.lastPing==null||part.minutes>day.lastPing)day.lastPing=part.minutes;}days.set(part.date,day);}
  const daily=[...days.values()].sort((a,b)=>b.date.localeCompare(a.date)).map(day=>{const validFirstPing=day.monitoringStarted!=null&&day.monitoringStarted<=10*60?day.firstPing:null,validLastPing=day.monitoringEnded!=null&&day.monitoringEnded>=18*60?day.lastPing:null;return{...day,firstPing:validFirstPing,lastPing:validLastPing,observedArrival:[day.cctvOpening,validFirstPing].filter(Number.isFinite).sort((a,b)=>a-b)[0]??null,observedLastActivity:[day.cctvClosing,validLastPing].filter(Number.isFinite).sort((a,b)=>b-a)[0]??null};});
  const values=key=>daily.map(day=>day[key]).filter(Number.isFinite),metric=key=>({average:formatMinutes(average(values(key))),sampleDays:values(key).length});
  const behavior={periodDays:45,cctvOpening:metric('cctvOpening'),cctvClosing:metric('cctvClosing'),firstPing:metric('firstPing'),lastPing:metric('lastPing'),observedArrival:metric('observedArrival'),observedLastActivity:metric('observedLastActivity'),daily:daily.slice(0,10).map(day=>Object.fromEntries(Object.entries(day).map(([key,value])=>[key,key==='date'||value==null?value:formatMinutes(value)])))};
  const latest=db.prepare(`SELECT event_type AS eventType,occurred_at AS occurredAt,received_at AS receivedAt FROM cctv_events WHERE location_id=? AND event_type<>'DISCARDED' ORDER BY COALESCE(occurred_at,received_at) DESC LIMIT 1`).get(locationId)||null;
  return {...location,zone:normalizeZone(location.zone),assets,aliases,behavior,summary:{assets:assets.length,observedDays:daily.length,lastEvent:latest}};
}
function qualityData(){
  const items=inventoryRows('','','covered');
  const counts={ready:0,syncPending:0,reviewRequired:0,completeRequired:0};
  for(const item of items){if(item.workflowState==='READY')counts.ready++;else if(item.workflowState==='SYNC_PENDING')counts.syncPending++;else if(item.workflowState==='REVIEW_REQUIRED')counts.reviewRequired++;else if(item.workflowState==='COMPLETE_REQUIRED')counts.completeRequired++;}
  const priority={COMPLETE_REQUIRED:0,REVIEW_REQUIRED:1,SYNC_PENDING:2,READY:3};
  const issues=items.filter(item=>item.workflowState!=='READY').sort((a,b)=>priority[a.workflowState]-priority[b.workflowState]||a.zone.localeCompare(b.zone)||a.name.localeCompare(b.name)).map(item=>({id:item.id,code:item.code,point:item.name,zone:item.zone,locationType:item.type,workflowState:item.workflowState,severity:item.workflowState==='COMPLETE_REQUIRED'?'critical':item.workflowState==='REVIEW_REQUIRED'?'warning':'info',title:item.statusLabel,detail:item.reviewReason,source:item.evidence,action:item.actionLabel,solutionKind:item.solutionKind,channels:item.channels}));
  const dssRows=db.prepare("SELECT * FROM dss_device_registry ORDER BY status,organization,device_name").all(),unlinkedDss=dssRows.filter(row=>row.status!=='ACTIVE'||(!row.location_id&&!row.physical_site_id));
  for(const row of unlinkedDss)issues.push({id:`DSS:${row.dss_identifier}`,code:null,point:row.device_name,zone:normalizeZone(String(row.organization||'').split('/').at(-1)||'SIN ZONA'),locationType:'DSS_DEVICE',workflowState:'REVIEW_REQUIRED',severity:'warning',title:'Dispositivo DSS sin ubicación canónica',detail:`El dispositivo ${row.dss_identifier} (${row.model||'modelo no informado'}) está confirmado en DSS, pero su punto aún no tiene una coincidencia segura.`,source:`DSS · ${row.source_capture||'Device Info'}`,action:'Conciliar identidad DSS',solutionKind:classifyDahuaModel(row.model).category,channels:null});
  const dssLinked=dssRows.length-unlinkedDss.length,total=dssRows.length||items.length;
  return {generatedAt:new Date().toISOString(),summary:{total,ready:dssRows.length?dssLinked:counts.ready,syncPending:counts.syncPending,reviewRequired:counts.reviewRequired+unlinkedDss.length,completeRequired:counts.completeRequired,pending:issues.length,qualityPercent:total?Math.round((dssRows.length?dssLinked:counts.ready)/total*100):0,confirmedLocations:items.length,dssLinked,dssUnlinked:unlinkedDss.length},issues};
}
function alarmsData(){
  const locations=db.prepare("SELECT id,siis_code AS code,canonical_name AS name,zone,location_type AS type FROM locations WHERE active=1").all();
  const profiles=new Map(db.prepare('SELECT * FROM alarm_communication_profiles').all().map(row=>[row.location_id,row]));
  const byKey=new Map();
  for(const location of locations)byKey.set(normalizeName(location.name),location);
  for(const alias of db.prepare('SELECT location_id,alias_key FROM location_aliases').all()){
    const location=locations.find(item=>item.id===alias.location_id);
    if(location&&!byKey.has(alias.alias_key))byKey.set(alias.alias_key,location);
  }
  const records=new Map(),unlinked=[];
  const ensure=location=>{if(!records.has(location.id))records.set(location.id,{...location,zone:normalizeZone(location.zone),systems:[],sources:[],lastEvent:null});return records.get(location.id);};
  const addSystem=(location,system,source)=>{const item=ensure(location);if(!item.systems.some(entry=>entry.kind===system.kind&&entry.reference===system.reference))item.systems.push(system);item.sources.push(source);};
  const latestRun=db.prepare('SELECT MAX(id) id FROM import_runs').get().id;
  const panels=db.prepare('SELECT * FROM stg_alarm_panels WHERE import_run_id=? ORDER BY location_name_raw').all(latestRun);
  for(const panel of panels){const location=byKey.get(panel.location_name_key);if(!location){unlinked.push({kind:'OSZFORD_MONITORED',name:panel.location_name_raw,reference:panel.account_number,reason:'Nombre OSZFORD sin ubicación canónica'});continue;}addSystem(location,{kind:'OSZFORD_MONITORED',label:'Monitoreada por OSZFORD',technology:panel.panel_type||'Panel por documentar',reference:panel.account_number||panel.panel_id||null,ip:panel.ip_address||null,status:String(panel.communication_status||'').toUpperCase()==='OK'?'ONLINE_REPORTED':'NOT_VERIFIED',serial:panel.serial_number||null},'Alarmas OSZFORD');}
  const legacy=db.prepare('SELECT location_name_raw,location_name_key,alarm_raw FROM stg_inventory_locations WHERE import_run_id=? AND alarm_raw IS NOT NULL').all(latestRun);
  for(const row of legacy){const location=byKey.get(row.location_name_key);if(!location){unlinked.push({kind:String(row.alarm_raw).toUpperCase().includes('OSZFORD')?'OSZFORD_MONITORED':'DAHUA_DEVICE_IO',name:row.location_name_raw,reference:row.alarm_raw,reason:'Referencia histórica sin ubicación canónica'});continue;}const oszford=String(row.alarm_raw).toUpperCase().includes('OSZFORD');addSystem(location,{kind:oszford?'OSZFORD_MONITORED':'DAHUA_DEVICE_IO',label:oszford?'Monitoreada por OSZFORD':'Alarma mediante NVR o cámara Dahua',technology:oszford?'Referencia histórica OSZFORD':'Entrada/salida de alarma · PIR',reference:null,status:'INVENTORY_REPORTED'},'DATOS CCTV');}
  for(const asset of db.prepare("SELECT a.*,l.canonical_name FROM assets a JOIN locations l ON l.id=a.location_id WHERE a.lifecycle_status='ACTIVE' AND a.asset_type='ALARM_CONTROLLER'").all()){
    const location=locations.find(item=>item.id===asset.location_id);if(!location)continue;addSystem(location,{kind:'DAHUA_DEDICATED',label:'Sistema de alarma Dahua dedicado',technology:asset.model||'Controlador Dahua',reference:asset.dss_identifier||asset.id,ip:asset.ip_address||null,status:'ACTIVE',serial:asset.serial_number||null},'Inventario canónico DSS');
  }
  const alarmTypes=['ALARM','LOCAL_ALARM','ALARMA_LOCAL','CABLE_TRAP','CABLE_TRAMPA','TRIPWIRE'];
  const placeholders=alarmTypes.map(()=>'?').join(',');
  for(const event of db.prepare(`SELECT location_id,event_type,COALESCE(occurred_at,received_at) occurredAt FROM cctv_events WHERE location_id IS NOT NULL AND event_type IN (${placeholders}) ORDER BY COALESCE(occurred_at,received_at) DESC`).all(...alarmTypes)){
    const item=records.get(event.location_id);if(item&&!item.lastEvent)item.lastEvent={type:event.event_type,occurredAt:event.occurredAt};
  }
  const items=[...records.values()].map(item=>{const profile=profiles.get(item.id)||null,statuses=profile?[profile.primary_receiver_status,profile.secondary_receiver_status,profile.backup_receiver_status].filter(Boolean):[],communicationHealth=!profile?'NOT_DOCUMENTED':profile.primary_receiver_status==='REGISTERED'&&statuses.some(status=>status==='ERROR')?'DEGRADED':profile.primary_receiver_status==='REGISTERED'?'OPERATIONAL':statuses.some(status=>status==='REGISTERED')?'DEGRADED':'CRITICAL';return{...item,systemKinds:[...new Set(item.systems.map(system=>system.kind))],sourceConfidence:item.sources.includes('Alarmas OSZFORD')||item.sources.includes('Inventario canónico DSS')?'CONFIRMED':'REPORTED',communicationProfile:profile,communicationHealth};}).sort((a,b)=>a.zone.localeCompare(b.zone)||a.name.localeCompare(b.name));
  const count=kind=>items.filter(item=>item.systemKinds.includes(kind)).length;
  return{generatedAt:new Date().toISOString(),summary:{points:items.length,oszford:panels.length,oszfordLinked:count('OSZFORD_MONITORED'),dahuaDedicated:count('DAHUA_DEDICATED'),dahuaIo:count('DAHUA_DEVICE_IO'),hybrid:items.filter(item=>item.systemKinds.length>1).length,unlinked:unlinked.length},items,unlinked};
}
function projectData(){
  const latest=db.prepare('SELECT MAX(import_run_id) id FROM stg_upgrade_projects').get().id;
  const rawRows=db.prepare(`SELECT p.id,p.source_row AS sourceRow,p.project_stream,p.target_location_raw AS target,p.target_location_key AS targetKey,p.transfer_or_scope_raw AS transferScope,p.investment_amount AS investment,
    (SELECT la.location_id FROM location_aliases la WHERE la.alias_key=p.target_location_key LIMIT 1) AS locationId
    FROM stg_upgrade_projects p WHERE p.import_run_id=? ORDER BY p.source_row,p.project_stream`).all(latest);
  const phaseRows=[...new Set(rawRows.filter(row=>normalizeText(row.target).startsWith('PUNTO A INSTALAR CON DETECCION DE ROSTROS')).map(row=>row.sourceRow))].sort((a,b)=>a-b);
  const classify=row=>{const text=normalizeText(row.target);if(text.startsWith('PUNTO A INSTALAR'))return'HEADER';if(text.includes('PUNTO DESMONTADO'))return'DISMANTLED';if(text.includes('INSTALACION CON EQUIPOS DESMONTADOS'))return'REUSED_KIT';if(text.includes('CAMARA CON ENTRADA Y SALIDA DE ALARMA'))return'REUSED_CAMERA_ALARM';if(text.includes('CAMBIO DE TECNOLOGIA'))return'TECHNOLOGY_CHANGE';if(text.includes('INSTALACION NUEVA'))return'NEW_INSTALLATION';return row.project_stream==='REGIONAL_SUMMARY_OR_REUSE'?'REFERENCE_OR_SUMMARY':'PLANNED';};
  const enriched=rawRows.map(row=>{const location=row.locationId?db.prepare('SELECT canonical_name,zone,cctv_coverage_status FROM locations WHERE id=?').get(row.locationId):null;const phase=row.sourceRow>=phaseRows[0]?phaseRows.filter(value=>value<=row.sourceRow).length:null;return {...row,category:classify(row),phase,canonicalName:location?.canonical_name||null,zone:normalizeZone(location?.zone||null),coverageStatus:location?.cctv_coverage_status||null,linked:!!location};});
  const rows=enriched.filter(row=>row.investment!=null&&['HIGH_VALUE_AI','HIGH_VALUE_AI_SPORTBOOK'].includes(row.project_stream));
  const scopeMetrics=scopeAudit(rows,80);
  const decisions=new Map(db.prepare('SELECT * FROM project_scope_decisions').all().map(row=>[row.scope_item_id,row]));
  const scopeItems=[...rows.map(row=>({scopeItemId:`FINANCED:${row.id}`,kind:row.project_stream==='HIGH_VALUE_AI_SPORTBOOK'?'MODERNIZATION':'SINGLE_CAMERA',target:row.target,sourceRow:row.sourceRow,sourceCell:`Proyecto Actualizacion!${row.project_stream==='HIGH_VALUE_AI_SPORTBOOK'?'B':'F'}${row.sourceRow}`,investment:Number(row.investment||0),transferScope:row.transferScope||null,locationId:row.locationId,canonicalName:row.canonicalName,zone:row.zone})),...scopeMetrics.reuseRows.map(row=>({scopeItemId:`REUSE:${row.id}`,kind:'REUSED_DESTINATION',target:row.transferScope,sourceRow:row.sourceRow,sourceCell:`Proyecto Actualizacion!C${row.sourceRow}`,investment:0,transferScope:`Equipo trasladado desde ${row.target}`,locationId:null,canonicalName:null,zone:null}))].map(item=>{const saved=decisions.get(item.scopeItemId);return{...item,decision:saved?.decision||'PENDING',explicitDecision:!!saved,decidedBy:saved?.decided_by||null,decidedAt:saved?.decided_at||null,notes:saved?.notes||null};}).sort((a,b)=>(a.decision==='PENDING'?0:1)-(b.decision==='PENDING'?0:1)||a.sourceRow-b.sourceRow||a.kind.localeCompare(b.kind));
  const scopeDecisionCounts=scopeItems.reduce((acc,item)=>{acc[item.decision]=(acc[item.decision]||0)+1;if(item.explicitDecision)acc.reviewed++;return acc;},{PENDING:0,INCLUDED:0,DUPLICATE:0,NOT_APPLICABLE:0,reviewed:0}),adjustedScope=scopeMetrics.enumeratedInterventions-scopeDecisionCounts.DUPLICATE-scopeDecisionCounts.NOT_APPLICABLE,remainingVariance=adjustedScope-scopeMetrics.declaredScope;
  const completedProjectIds=new Set(db.prepare("SELECT entity_id FROM audit_log WHERE entity_type='UPGRADE_PROJECT' AND action='PROJECT_INSTALLATION_REGISTERED'").all().map(row=>String(row.entity_id)));
  const trelloEvidence=evidenceByLocation(db.prepare("SELECT location_id AS locationId,title_raw AS title,description_raw AS description,COALESCE(due_at,source_updated_at) AS occurredAt,source_card_id AS cardId,source_card_url AS cardUrl FROM support_cards WHERE source_system='TRELLO_SUPPORT' AND active=1 AND status='COMPLETED' AND location_id IS NOT NULL").all());
  const execution=enriched.filter(row=>row.sourceRow>=phaseRows[0]&&row.investment==null&&row.category!=='HEADER'&&row.category!=='REFERENCE_OR_SUMMARY').map(row=>{const manual=completedProjectIds.has(String(row.id)),evidence=row.locationId?trelloEvidence.get(row.locationId):null;return{...row,completed:manual||!!evidence,completionSource:manual?'SKYLAB_REGISTRATION':evidence?'TRELLO_EVIDENCE':null,completionEvidence:evidence||null};});
  const streamNames={HIGH_VALUE_AI:'Analítica e IA',HIGH_VALUE_AI_SPORTBOOK:'IA y Sportsbook'};
  const streams=[...rows.reduce((map,row)=>{const item=map.get(row.project_stream)||{key:row.project_stream,name:streamNames[row.project_stream]||row.project_stream,scope:0,linked:0,withCoverage:0,investment:0,reusePlanned:0};item.scope++;if(row.linked)item.linked++;if(row.coverageStatus&&row.coverageStatus!=='NONE')item.withCoverage++;item.investment+=Number(row.investment||0);if(row.transferScope)item.reusePlanned++;map.set(row.project_stream,item);return map;},new Map()).values()];
  const scope=rows.length,linked=rows.filter(x=>x.linked).length,withCoverage=rows.filter(x=>x.coverageStatus&&x.coverageStatus!=='NONE').length,investment=rows.reduce((n,x)=>n+Number(x.investment||0),0),reusePlanned=scopeMetrics.reuseDestinations;
  const identityMap=new Map();for(const row of [...rows,...execution])if(!row.linked&&row.category!=='DISMANTLED'&&!identityMap.has(row.targetKey))identityMap.set(row.targetKey,row);const identityItems=[...identityMap.values()];
  const executionCounts=execution.reduce((acc,row)=>{acc[row.category]=(acc[row.category]||0)+1;return acc;},{});
  const phases=phaseRows.map((_,index)=>{
    const number=index+1;
    const phaseExecution=execution.filter(row=>row.phase===number);
    const activeLocationIds=new Set(phaseExecution.filter(row=>row.category!=='DISMANTLED'&&row.locationId).map(row=>row.locationId));
    const budgetRows=rows.filter(row=>row.locationId&&activeLocationIds.has(row.locationId));
    return {number,items:phaseExecution.length,activeItems:phaseExecution.filter(row=>row.category!=='DISMANTLED').length,historicalItems:phaseExecution.filter(row=>row.category==='DISMANTLED').length,pricedItems:budgetRows.length,investment:budgetRows.reduce((sum,row)=>sum+Number(row.investment||0),0)};
  });
  const installations=db.prepare(`SELECT provenance,COUNT(*) n FROM cctv_installations WHERE status='ACTIVE' GROUP BY provenance`).all();
  const actionableExecution=execution.filter(row=>row.category!=='DISMANTLED'),completedExecution=actionableExecution.filter(row=>row.completed).length;
  const reuseStream={key:'REUSED_DESTINATIONS',name:'Instalaciones con equipos reutilizados',scope:scopeMetrics.reuseDestinations,linked:0,withCoverage:0,investment:0,reusePlanned:scopeMetrics.reuseDestinations,identityStatus:'PENDING_SEPARATE_RECONCILIATION'};
  return {generatedAt:new Date().toISOString(),source:'Proyecto DATOS CCTV + catálogo canónico',summary:{scope,financedTargets:scopeMetrics.financedTargets,modernizationTargets:scopeMetrics.modernizationTargets,singleCameraTargets:scopeMetrics.singleCameraTargets,reuseDestinations:scopeMetrics.reuseDestinations,enumeratedInterventions:scopeMetrics.enumeratedInterventions,adjustedScope,sourceDeclaredScope:scopeMetrics.declaredScope,scopeVariance:scopeMetrics.scopeVariance,remainingVariance,scopeReviewed:scopeDecisionCounts.reviewed,scopePending:scopeDecisionCounts.PENDING,scopeConfirmed:scopeDecisionCounts.INCLUDED,scopeExcluded:scopeDecisionCounts.DUPLICATE+scopeDecisionCounts.NOT_APPLICABLE,linked,unlinked:identityItems.length,withCoverage,coverageSignalPercent:scope?Math.round(withCoverage/scope*100):0,investment,reusePlanned,confirmedInstallations:installations.reduce((n,x)=>n+x.n,0),phases:phaseRows.length,executionItems:execution.length,actionableExecution:actionableExecution.length,completedExecution,officialProgressPercent:actionableExecution.length?Math.round(completedExecution/actionableExecution.length*100):0,dismantled:executionCounts.DISMANTLED||0,reusedExecuted:(executionCounts.REUSED_KIT||0)+(executionCounts.REUSED_CAMERA_ALARM||0),newOrChanged:(executionCounts.NEW_INSTALLATION||0)+(executionCounts.TECHNOLOGY_CHANGE||0)},audit:{status:scopeDecisionCounts.PENDING===0?'RECONCILED_BY_REVIEW':remainingVariance===0?'RECONCILED':'SOURCE_VARIANCE',method:'ENUMERATED_CELLS_PLUS_DECISIONS',financedTargets:scopeMetrics.financedTargets,reuseDestinations:scopeMetrics.reuseDestinations,enumeratedInterventions:scopeMetrics.enumeratedInterventions,adjustedScope,sourceDeclaredScope:scopeMetrics.declaredScope,variance:remainingVariance,decisionCounts:scopeDecisionCounts,phaseRowsExcludedFromScope:execution.length,historicalRowsExcluded:executionCounts.DISMANTLED||0},streams:[...streams,reuseStream],scopeItems,phases,installations,items:identityItems,execution,executionCounts};
}
function dailyEventsData(dateValue){
  const date=/^\d{4}-\d{2}-\d{2}$/.test(dateValue||'')?dateValue:new Intl.DateTimeFormat('en-CA',{timeZone:'America/Bogota',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
  const items=db.prepare(`SELECT e.id,e.source_event_id AS sourceEventId,e.location_id AS locationId,e.event_type AS eventType,e.event_phase AS phase,e.occurred_at AS occurredAt,e.received_at AS receivedAt,e.severity,e.raw_reference AS rawReference,e.payload_json AS payload,l.canonical_name AS location,l.zone
    FROM cctv_events e LEFT JOIN locations l ON l.id=e.location_id
    WHERE e.source_system='EMAIL_DAHUA' AND date(COALESCE(e.occurred_at,e.received_at),'-5 hours')=?
    ORDER BY COALESCE(e.occurred_at,e.received_at) DESC`).all(date).map(row=>({...row,payload:JSON.parse(row.payload||'{}')}));
  const categoryMap=new Map();for(const item of items){const key=`${item.eventType}|${item.severity}`;const row=categoryMap.get(key)||{eventType:item.eventType,severity:item.severity,total:0,linked:0,unlinked:0};row.total++;if(item.locationId)row.linked++;else row.unlinked++;categoryMap.set(key,row);}const categories=[...categoryMap.values()].sort((a,b)=>b.total-a.total||a.eventType.localeCompare(b.eventType));
  const totals=categories.reduce((acc,row)=>({total:acc.total+row.total,linked:acc.linked+row.linked,unlinked:acc.unlinked+row.unlinked}),{total:0,linked:0,unlinked:0});
  const sharedOpeningRows=db.prepare(`SELECT source.location_id AS sourceId,target.location_id AS targetId,l.canonical_name AS targetName,l.zone AS targetZone,source.opening_group AS openingGroup
    FROM physical_site_members source JOIN physical_site_members target ON target.opening_group=source.opening_group
    JOIN locations l ON l.id=target.location_id WHERE source.opening_policy='ANY_MEMBER_OPENS_ALL' AND target.opening_policy='ANY_MEMBER_OPENS_ALL'`).all();
  const openingTargets=new Map();for(const row of sharedOpeningRows){const list=openingTargets.get(row.sourceId)||[];list.push(row);openingTargets.set(row.sourceId,list);}
  const targetsFor=item=>item.locationId&&(openingTargets.get(item.locationId)||[]).length?openingTargets.get(item.locationId):[{targetId:item.locationId,targetName:item.location,targetZone:item.zone,openingGroup:null}];
  const pointMap=new Map();for(const item of items.filter(row=>isOperationalOpeningSignal(row)||row.eventType==='CLOSING')){for(const target of targetsFor(item)){const key=target.targetId||`RAW:${item.payload.storeRaw||'UNKNOWN'}`;const point=pointMap.get(key)||{key,locationId:target.targetId,name:target.targetName||item.payload.storeRaw||'Por identificar',zone:target.targetZone||null,opening:null,openingSourceType:null,closing:null,linked:!!target.targetId,sharedOpeningGroup:target.openingGroup||null};const stamp=item.occurredAt||item.receivedAt;if(isOperationalOpeningSignal(item)&&(!point.opening||stamp<point.opening)){point.opening=stamp;point.openingSourceType=item.eventType;}if(item.eventType==='CLOSING'&&(!point.closing||stamp>point.closing))point.closing=stamp;pointMap.set(key,point);}}const pointOperations=[...pointMap.values()].map(point=>({...point,status:point.opening&&point.closing?'COMPLETE':point.opening?'OPEN_ONLY':'CLOSE_ONLY'})).sort((a,b)=>(a.status==='COMPLETE')-(b.status==='COMPLETE')||a.name.localeCompare(b.name));
  const motionGroups=new Map();for(const item of items.filter(row=>row.eventType==='MOTION')){const key=`${item.locationId||item.payload.storeRaw||'UNKNOWN'}|${item.payload.channelRaw||'NO_CHANNEL'}`;const list=motionGroups.get(key)||[];list.push(item);motionGroups.set(key,list);}const motionBursts=[];for(const group of motionGroups.values()){group.sort((a,b)=>new Date(a.occurredAt||a.receivedAt)-new Date(b.occurredAt||b.receivedAt));let burst=[];const close=()=>{if(!burst.length)return;const first=burst[0],last=burst[burst.length-1],representative=burst.find(item=>item.payload.hasAttachment)||first;motionBursts.push({location:first.location||first.payload.storeRaw||'Por identificar',zone:first.zone||null,channel:first.payload.channelRaw||'Sin canal',from:first.occurredAt||first.receivedAt,to:last.occurredAt||last.receivedAt,count:burst.length,noisy:burst.length>=10,linked:!!first.locationId,representativeEvent:representative});};for(const item of group){if(!burst.length){burst=[item];continue;}const gap=(new Date(item.occurredAt||item.receivedAt)-new Date(burst[burst.length-1].occurredAt||burst[burst.length-1].receivedAt))/60000;if(gap<=8)burst.push(item);else{close();burst=[item];}}close();}motionBursts.sort((a,b)=>b.count-a.count);
  const hourly=Array.from({length:24},(_,hour)=>({hour:`${String(hour).padStart(2,'0')}:00`,events:0,openings:0,closures:0,motion:0}));for(const item of items){const stamp=item.occurredAt||item.receivedAt;if(!stamp)continue;const hour=Number(new Intl.DateTimeFormat('en-US',{timeZone:'America/Bogota',hour:'2-digit',hourCycle:'h23'}).format(new Date(stamp)));if(!hourly[hour])continue;hourly[hour].events++;if(item.eventType==='OPENING')hourly[hour].openings++;if(item.eventType==='CLOSING')hourly[hour].closures++;if(item.eventType==='MOTION')hourly[hour].motion++;}
  const identityMap=new Map();for(const item of items.filter(row=>!row.locationId&&row.eventType!=='DISCARDED')){const name=item.payload.storeRaw||'Sin nombre en el correo';const row=identityMap.get(name)||{name,total:0,eventTypes:new Set(),sampleUid:item.sourceEventId};row.total++;row.eventTypes.add(item.eventType);identityMap.set(name,row);}const identityPending=[...identityMap.values()].map(row=>({...row,eventTypes:[...row.eventTypes]})).sort((a,b)=>b.total-a.total);
  const evidenceMap=new Map(),eventStamp=item=>new Date(item.occurredAt||item.receivedAt||0).getTime(),identityKey=item=>item.locationId||item.payload.storeRaw||'UNKNOWN';
  const interpretedOpeningEvidenceIds=new Set();
  for(const item of items.filter(row=>row.payload.hasAttachment&&(isOperationalOpeningSignal(row)||row.eventType==='CLOSING'))){const evidenceType=isOperationalOpeningSignal(item)?'OPENING':'CLOSING',key=`${evidenceType}|${identityKey(item)}`,existing=evidenceMap.get(key);if(!existing||(evidenceType==='OPENING'&&eventStamp(item)<eventStamp(existing))||(evidenceType==='CLOSING'&&eventStamp(item)>eventStamp(existing))){if(evidenceType==='OPENING'&&existing)interpretedOpeningEvidenceIds.delete(existing.id);const evidence=evidenceType==='OPENING'?asOperationalOpeningEvidence(item):item;evidenceMap.set(key,evidence);if(evidenceType==='OPENING')interpretedOpeningEvidenceIds.add(item.id);}}
  const dailyMotionEvidence=new Map();
  for(const item of items.filter(row=>row.eventType==='MOTION')){const key=identityKey(item),entry=dailyMotionEvidence.get(key)||{items:[],representative:null};entry.items.push(item);if(!entry.representative&&item.payload.hasAttachment)entry.representative=item;dailyMotionEvidence.set(key,entry);}
  for(const [key,entry] of dailyMotionEvidence){const item=entry.representative;if(!item)continue;const ordered=entry.items.sort((a,b)=>eventStamp(a)-eventStamp(b));evidenceMap.set(`MOTION_DAY|${key}`,{...item,evidenceType:'MOTION_BURST',burstCount:ordered.length,burstNoisy:ordered.length>=10,motionFrom:ordered[0].occurredAt||ordered[0].receivedAt,motionTo:ordered[ordered.length-1].occurredAt||ordered[ordered.length-1].receivedAt});}
  const additionalGroups=new Map();
  for(const item of items.filter(row=>row.payload.hasAttachment&&!interpretedOpeningEvidenceIds.has(row.id)&&!['OPENING','CLOSING','MOTION','MOVIMIENTO','DISCARDED'].includes(row.eventType))){const key=`${identityKey(item)}|${item.eventType}`,group=additionalGroups.get(key)||[];group.push(item);additionalGroups.set(key,group);}
  for(const [key,group] of additionalGroups){group.sort((a,b)=>eventStamp(a)-eventStamp(b));let incident=[];const close=()=>{if(!incident.length)return;const representative=incident.find(item=>item.locationId&&item.payload.hasAttachment)||incident.find(item=>item.payload.hasAttachment)||incident[0],senders=new Set(incident.map(item=>item.payload.sender).filter(Boolean));evidenceMap.set(`INCIDENT|${key}|${representative.id}`,{...representative,correlationCount:incident.length,correlationSourceCount:senders.size,correlatedEventIds:incident.map(item=>item.id)});};for(const item of group){if(!incident.length){incident=[item];continue;}if((eventStamp(item)-eventStamp(incident[incident.length-1]))<=120000)incident.push(item);else{close();incident=[item];}}close();}
  const correlatedEvidence=[];
  for(const item of [...evidenceMap.values()].sort((a,b)=>eventStamp(a)-eventStamp(b))){
    const prior=correlatedEvidence.at(-1),sameLocation=prior?.locationId&&item.locationId===prior.locationId,openingTripwire=new Set([prior?.evidenceType||prior?.eventType,item.evidenceType||item.eventType]).has('OPENING')&&new Set([prior?.eventType,item.eventType]).has('TRIPWIRE');
    if(sameLocation&&openingTripwire&&eventStamp(item)-eventStamp(prior)<=30*60*1000){const preferred=prior.eventType==='OPENING'?prior:item;correlatedEvidence[correlatedEvidence.length-1]={...preferred,correlationCount:(prior.correlationCount||1)+(item.correlationCount||1),correlatedEventIds:[...(prior.correlatedEventIds||[prior.id]),...(item.correlatedEventIds||[item.id])],correlatedTypes:[...new Set([...(prior.correlatedTypes||[prior.eventType]),...(item.correlatedTypes||[item.eventType])])]};}else correlatedEvidence.push(item);
  }
  const evidenceItems=correlatedEvidence.sort((a,b)=>eventStamp(b)-eventStamp(a));
  const latestSiisRun=db.prepare("SELECT id,completed_at AS capturedAt,summary_json AS summary FROM siis_sync_runs WHERE status='SUCCESS' ORDER BY id DESC LIMIT 1").get();
  const siisRows=latestSiisRun?db.prepare(`SELECT l.id AS locationId,l.siis_code AS siisCode,l.canonical_name AS name,l.zone,l.cctv_coverage_status AS cctvCoverage,s.online
    FROM locations l LEFT JOIN stg_siis_locations s ON s.siis_code=l.siis_code AND s.sync_run_id=? WHERE l.active=1 ORDER BY l.canonical_name`).all(latestSiisRun.id):[];
  const pingActivity=db.prepare(`WITH observations AS (
      SELECT s.siis_code AS siisCode,r.completed_at AS capturedAt,s.online,
        LAG(s.online) OVER (PARTITION BY s.siis_code ORDER BY r.completed_at) AS previousOnline,
        LAG(r.completed_at) OVER (PARTITION BY s.siis_code ORDER BY r.completed_at) AS previousCapturedAt
      FROM siis_sync_runs r JOIN stg_siis_locations s ON s.sync_run_id=r.id
      WHERE r.status='SUCCESS' AND date(r.completed_at,'-5 hours')=?
    ) SELECT siisCode,
      MIN(capturedAt) AS monitoringStartedAt,MAX(capturedAt) AS latestObservedAt,
      MIN(CASE WHEN online=1 THEN capturedAt END) AS firstOnlineObservedAt,
      MIN(CASE WHEN online=1 AND COALESCE(previousOnline,0)=0 THEN previousCapturedAt END) AS firstOnlineWindowStart,
      MIN(CASE WHEN online=1 AND COALESCE(previousOnline,0)=0 THEN capturedAt END) AS firstOnlineWindowEnd,
      COUNT(*) AS samples,SUM(CASE WHEN online=1 THEN 1 ELSE 0 END) AS onlineSamples,
      SUM(CASE WHEN online=1 AND previousOnline=0 THEN 1 ELSE 0 END) AS onlineTransitions
    FROM observations GROUP BY siisCode`).all(date);
  const pingBySiis=new Map(pingActivity.map(row=>[String(row.siisCode),row]));
  const operationByLocation=new Map(pointOperations.filter(row=>row.locationId).map(row=>[row.locationId,row]));
  const evidenceByLocation=new Map();
  for(const item of evidenceItems){if(!item.locationId)continue;for(const target of targetsFor(item)){const entry=evidenceByLocation.get(target.targetId)||{};const sharedItem=target.targetId===item.locationId?item:{...item,sharedFromLocationId:item.locationId,locationId:target.targetId,location:target.targetName,zone:target.targetZone};if(item.eventType==='OPENING')entry.opening=sharedItem;if(item.eventType==='CLOSING')entry.closing=sharedItem;evidenceByLocation.set(target.targetId,entry);}}
  const operationalCoverage=siisRows.map(row=>{const email=operationByLocation.get(row.locationId),ping=pingBySiis.get(String(row.siisCode))||{},evidence=evidenceByLocation.get(row.locationId)||{},openingEvidenceAt=evidence.opening?(evidence.opening.occurredAt||evidence.opening.receivedAt):null,closingEvidenceAt=evidence.closing?(evidence.closing.occurredAt||evidence.closing.receivedAt):null,observedInterval=ping.firstOnlineWindowStart&&ping.firstOnlineWindowEnd?Math.max(1,Math.round((new Date(ping.firstOnlineWindowEnd)-new Date(ping.firstOnlineWindowStart))/60000)):null;return {...row,online:row.online==null?null:!!row.online,hasCctv:row.cctvCoverage==='ACTIVE',emailOpening:openingEvidenceAt||email?.opening||null,emailClosing:closingEvidenceAt||email?.closing||null,emailOpeningSignal:email?.opening||null,emailClosingSignal:email?.closing||null,emailOpeningSource:openingEvidenceAt?'VISUAL_EVIDENCE':email?.opening?'TECHNICAL_SIGNAL':'NONE',emailClosingSource:closingEvidenceAt?'VISUAL_EVIDENCE':email?.closing?'TECHNICAL_SIGNAL':'NONE',emailSignal:email?'OBSERVED':'NONE',firstPing:ping.firstOnlineObservedAt||null,lastPing:ping.latestObservedAt||null,firstOnlineObservedAt:ping.firstOnlineObservedAt||null,firstOnlineWindowStart:ping.firstOnlineWindowStart||null,firstOnlineWindowEnd:ping.firstOnlineWindowEnd||null,latestObservedAt:ping.latestObservedAt||null,monitoringStartedAt:ping.monitoringStartedAt||null,pingSamples:Number(ping.samples||0),onlinePingSamples:Number(ping.onlineSamples||0),onlineTransitions:Number(ping.onlineTransitions||0),observationCadenceMinutes:observedInterval,pingSemantics:'SIIS_SNAPSHOT_WINDOW',openingEvidence:evidence.opening||null,closingEvidence:evidence.closing||null};});
  const siisKnown=siisRows.filter(row=>row.online!=null),siisOnline=siisKnown.filter(row=>row.online===1).length,siisOffline=siisKnown.filter(row=>row.online===0).length;
  const siisTimeline=db.prepare(`SELECT r.completed_at AS capturedAt,SUM(CASE WHEN s.online=1 THEN 1 ELSE 0 END) AS online,SUM(CASE WHEN s.online=0 THEN 1 ELSE 0 END) AS offline
    FROM siis_sync_runs r JOIN stg_siis_locations s ON s.sync_run_id=r.id WHERE r.status='SUCCESS' AND date(r.completed_at,'-5 hours')=? GROUP BY r.id,r.completed_at ORDER BY r.completed_at`).all(date);
  const openingPoints=pointOperations.filter(row=>row.opening).length,closingPoints=pointOperations.filter(row=>row.closing).length,noisyBursts=motionBursts.filter(row=>row.noisy).length;
  return {generatedAt:new Date().toISOString(),date,timeZone:'America/Bogota',summary:{...totals,recognized:categories.filter(row=>row.eventType!=='UNKNOWN'&&row.eventType!=='DISCARDED').reduce((n,row)=>n+row.total,0),discarded:categories.filter(row=>row.eventType==='DISCARDED').reduce((n,row)=>n+row.total,0),review:categories.filter(row=>row.severity==='REVIEW').reduce((n,row)=>n+row.total,0),identityPercent:totals.total?Math.round(totals.linked/totals.total*100):0,openingPoints,closingPoints,pairedPoints:pointOperations.filter(row=>row.status==='COMPLETE').length,motionBursts:motionBursts.length,noisyBursts},siis:{capturedAt:latestSiisRun?.capturedAt||null,runId:latestSiisRun?.id||null,total:siisRows.length,known:siisKnown.length,online:siisOnline,offline:siisOffline,unknown:siisRows.length-siisKnown.length,withCctv:siisRows.filter(row=>row.cctvCoverage==='ACTIVE').length,withoutCctv:siisRows.filter(row=>row.cctvCoverage!=='ACTIVE').length,onlineWithCctv:siisRows.filter(row=>row.online===1&&row.cctvCoverage==='ACTIVE').length,onlineWithoutCctv:siisRows.filter(row=>row.online===1&&row.cctvCoverage!=='ACTIVE').length},siisTimeline,operationalCoverage,categories,pointOperations,motionBursts:motionBursts.slice(0,30).map(({representativeEvent,...burst})=>burst),hourly,identityPending:identityPending.slice(0,30),evidenceItems,items:items.slice(0,100)};
}

function visitorAnalytics(periodValue,dateValue){
  const period=['DAY','WEEK','MONTH','YEAR'].includes(periodValue)?periodValue:'DAY',anchor=/^\d{4}-\d{2}-\d{2}$/.test(dateValue||'')?new Date(`${dateValue}T12:00:00-05:00`):new Date(),start=new Date(anchor);
  if(period==='WEEK'){const day=(start.getDay()+6)%7;start.setDate(start.getDate()-day);}else if(period==='MONTH')start.setDate(1);else if(period==='YEAR')start.setMonth(0,1);
  const localDate=value=>new Intl.DateTimeFormat('en-CA',{timeZone:'America/Bogota',year:'numeric',month:'2-digit',day:'2-digit'}).format(value),startDate=localDate(start),end=new Date(start);
  if(period==='DAY')end.setDate(end.getDate()+1);else if(period==='WEEK')end.setDate(end.getDate()+7);else if(period==='MONTH')end.setMonth(end.getMonth()+1,1);else end.setFullYear(end.getFullYear()+1,0,1);const endDate=localDate(end);
  const rows=db.prepare(`SELECT v.*,(SELECT COUNT(*) FROM visitor_visits history WHERE history.visitor_key=v.visitor_key) AS lifetime_visits FROM visitor_visits v WHERE v.report_date>=? AND v.report_date<? ORDER BY COALESCE(v.entry_at,v.exit_at) DESC`).all(startDate,endDate);
  const uniqueKeys=new Set(rows.map(row=>row.visitor_key)),repeatKeys=new Set(rows.filter(row=>Number(row.lifetime_visits)>1).map(row=>row.visitor_key)),reasonMap=new Map(),dayMap=new Map(),hourly=Array.from({length:24},(_,hour)=>({hour:`${String(hour).padStart(2,'0')}:00`,visits:0})),hostMap=new Map();
  for(const row of rows){reasonMap.set(row.reason,(reasonMap.get(row.reason)||0)+1);dayMap.set(row.report_date,(dayMap.get(row.report_date)||0)+1);const hour=Number(String(row.entry_at||'').slice(11,13));if(Number.isInteger(hour)&&hourly[hour])hourly[hour].visits++;const host=`${row.host_first_name||''} ${row.host_last_name||''}`.trim()||'Sin anfitrión';hostMap.set(host,(hostMap.get(host)||0)+1);}
  const sortMap=map=>[...map].map(([name,value])=>({name,value})).sort((a,b)=>b.value-a.value||a.name.localeCompare(b.name));
  const availableDays=db.prepare('SELECT report_date AS date,COUNT(*) AS visits FROM visitor_visits GROUP BY report_date ORDER BY report_date').all();
  return {generatedAt:new Date().toISOString(),period,startDate,endDate,availableDays,summary:{visits:rows.length,uniqueVisitors:uniqueKeys.size,returningVisitors:repeatKeys.size,firstTimeVisitors:uniqueKeys.size-repeatKeys.size,openVisits:rows.filter(row=>!row.exit_at&&/entrada/i.test(row.visit_status)).length,reports:db.prepare('SELECT COUNT(*) AS n FROM visitor_report_runs WHERE report_date>=? AND report_date<?').get(startDate,endDate).n},reasons:sortMap(reasonMap),days:[...dayMap].map(([date,visits])=>({date,visits})).sort((a,b)=>a.date.localeCompare(b.date)),hourly,hosts:sortMap(hostMap).slice(0,10),visits:rows.slice(0,150).map(row=>({id:row.id,date:row.report_date,name:`${row.first_name||''} ${row.last_name||''}`.trim()||'Visitante sin nombre',documentType:row.document_type,documentMasked:row.document_masked,host:`${row.host_first_name||''} ${row.host_last_name||''}`.trim()||'Sin anfitrión',reason:row.reason,status:row.visit_status,entryAt:row.entry_at,entryPlace:row.entry_place,exitAt:row.exit_at,exitPlace:row.exit_place,isReturning:Number(row.lifetime_visits)>1,lifetimeVisits:Number(row.lifetime_visits)}))};
}

function trelloMaintenanceData(){
  const run=db.prepare("SELECT * FROM maintenance_source_runs WHERE source_system='TRELLO' AND status='SUCCESS' ORDER BY id DESC LIMIT 1").get();
  if(!run)return {available:false,mode:'CANONICAL_SNAPSHOT',reason:'Todavía no se ha importado una instantánea de mantenimiento',items:[],months:[]};
  let runSummary={};try{runSummary=JSON.parse(run.summary_json||'{}')}catch{}
  const rows=db.prepare(`SELECT w.*,l.canonical_name AS canonical_name,l.zone AS canonical_zone
    FROM maintenance_work_items w LEFT JOIN locations l ON l.id=w.location_id
    WHERE w.source_system='TRELLO' AND w.active=1 ORDER BY w.scheduled_at,w.source_card_name,w.source_name_raw`).all();
  const items=rows.map(row=>({id:row.source_item_id,checklistId:row.source_checklist_id,cardId:row.source_card_id,month:row.source_card_name,state:row.status,rawName:row.source_name_raw,siisCode:row.siis_code,scheduledAt:row.scheduled_at,locationId:row.location_id,location:row.canonical_name||row.source_name_raw.replace(/^\d{3,5}\s*/,'').replace(/\s*-\s*\d{1,2}\/\d{1,2}\s*$/,'').trim(),zone:normalizeZone(row.canonical_zone),identityStatus:row.identity_status}));
  const monthMap=new Map();for(const item of items){const month=monthMap.get(item.cardId)||{id:item.cardId,name:item.month,total:0,completed:0,pending:0,percent:0};month.total++;if(item.state==='COMPLETED')month.completed++;else month.pending++;monthMap.set(item.cardId,month);}const months=[...monthMap.values()].map(row=>({...row,percent:row.total?Math.round(row.completed/row.total*100):0}));
  const completed=items.filter(item=>item.state==='COMPLETED').length,linked=items.filter(item=>item.locationId).length;
  return {available:true,mode:'CANONICAL_SNAPSHOT',generatedAt:new Date().toISOString(),cacheUpdatedAt:run.completed_at,source:{...(runSummary.source||{}),runId:run.id,reference:run.source_reference,fingerprint:run.source_fingerprint},summary:{cards:months.length,total:items.length,completed,pending:items.length-completed,percent:items.length?Math.round(completed/items.length*100):0,linked,unlinked:items.length-linked},months,items};
}

function supportData(){
  const run=db.prepare("SELECT * FROM support_source_runs WHERE source_system='TRELLO_SUPPORT' AND status='SUCCESS' ORDER BY id DESC LIMIT 1").get();if(!run)return{available:false,reason:'No existe una instantánea de Soporte 2026',items:[]};let runSummary={};try{runSummary=JSON.parse(run.summary_json||'{}')}catch{}
  const items=db.prepare(`SELECT s.*,l.canonical_name AS location_name,l.zone FROM support_cards s LEFT JOIN locations l ON l.id=s.location_id WHERE s.source_system='TRELLO_SUPPORT' AND s.active=1 ORDER BY CASE s.status WHEN 'PENDING' THEN 0 ELSE 1 END,s.due_at DESC,s.source_updated_at DESC`).all().map(row=>{let members=[],payload={};try{members=JSON.parse(row.members_json||'[]')}catch{}try{payload=JSON.parse(row.payload_json||'{}')}catch{}const operationalAt=row.due_at||row.source_updated_at,image=payload.cachedImage;return{id:row.source_card_id,title:row.title_raw,description:row.description_raw,listId:row.source_list_id,list:row.source_list_name,board:row.source_board_name,boardUrl:row.source_board_url,url:row.source_card_url,activityType:row.activity_type,status:row.status,dueAt:row.due_at,dueComplete:!!row.due_complete,updatedAt:row.source_updated_at,operationalAt,dateSource:row.due_at?'TRELLO_DUE':'LAST_ACTIVITY',locationId:row.location_id,location:row.location_name,zone:normalizeZone(row.zone),identityStatus:row.identity_status,members,image:image?{url:`/api/cctv/support/${encodeURIComponent(row.source_card_id)}/image`,name:image.name}:null,attachmentCount:(payload.attachments||[]).length};});
  const aggregate=key=>[...items.reduce((map,item)=>map.set(item[key]||'SIN_CLASIFICAR',(map.get(item[key]||'SIN_CLASIFICAR')||0)+1),new Map())].map(([name,value])=>({name,value})).sort((a,b)=>b.value-a.value),pending=items.filter(x=>x.status==='PENDING').length,linked=items.filter(x=>x.locationId).length;
  return{available:true,mode:'CANONICAL_SNAPSHOT',generatedAt:new Date().toISOString(),syncedAt:run.completed_at,source:{...(runSummary.board||{}),runId:run.id},summary:{total:items.length,pending,completed:items.length-pending,linked,unlinked:items.length-linked,withImages:items.filter(x=>x.image).length,identityPercent:items.length?Math.round(linked/items.length*100):0},types:aggregate('activityType'),lists:aggregate('list'),items};
}

function syncStatusData(){
  const now=Date.now(),ageMinutes=value=>value==null?null:Math.max(0,Math.round((now-new Date(value).getTime())/60000));
  const clockParts=Object.fromEntries(new Intl.DateTimeFormat('en-US',{timeZone:'America/Bogota',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(new Date()).filter(x=>x.type!=='literal').map(x=>[x.type,Number(x.value)])),siisPolicy=observerPolicy(clockParts.hour*60+clockParts.minute,process.env);
  const cycleLog=path.join(runtimePaths.logDir,'operational-cycle.jsonl');let cycle=null,emailCycle=null;
  if(fs.existsSync(cycleLog)){
    const lines=fs.readFileSync(cycleLog,'utf8').trim().split(/\r?\n/).filter(Boolean);
    for(let index=lines.length-1;index>=0;index--){
      try{
        const entry=JSON.parse(lines[index]);
        if(!cycle)cycle=entry;
        if(!emailCycle&&entry.email&&!entry.email.skipped)emailCycle=entry;
        if(cycle&&emailCycle)break;
      }catch{}
    }
  }
  const siis=db.prepare("SELECT id,completed_at,status,received_count,valid_count,invalid_count,summary_json FROM siis_sync_runs ORDER BY id DESC LIMIT 1").get();
  const trello=db.prepare("SELECT id,completed_at,status,received_count,inserted_count,updated_count,unchanged_count,summary_json,error_message FROM maintenance_source_runs WHERE source_system='TRELLO' ORDER BY id DESC LIMIT 1").get();
  const state=(at,status,limit)=>{const age=ageMinutes(at);if(!at||status==null)return'NO_DATA';if(status!==0&&status!=='SUCCESS')return'ERROR';return age<=limit?'HEALTHY':'STALE';};
  const sources=[
    {key:'EMAIL',name:'Correo CCTV',lastRunAt:emailCycle?.at||null,status:state(emailCycle?.at,emailCycle?.email?.status,12),runStatus:emailCycle?.email?.status===0?'SUCCESS':'ERROR',cadenceMinutes:5,detail:emailCycle?.email?.stdout?.match(/Correos nuevos obtenidos:\s*(\d+)/)?.[1]||'0',detailLabel:'correos nuevos',message:emailCycle?.email?.status===0?'Lectura IMAP incremental cada 5 minutos':'Revisar conexión IMAP'},
    {key:'SIIS',name:'SIIS / Ping',lastRunAt:siis?.completed_at||null,status:state(siis?.completed_at,siis?.status,Math.max(10,(siisPolicy.intervalMinutes||5)+5)),runStatus:siis?.status||'NO_DATA',cadenceMinutes:siisPolicy.intervalMinutes,detail:Number(siis?.received_count||0),detailLabel:'estaciones',message:Number(siis?.invalid_count||0)?`${siis.invalid_count} registros inválidos`:siisPolicy.window?`Ventana ${siisPolicy.window.label.toLowerCase().replaceAll('_',' ')}`:'Instantánea operativa válida',runId:siis?.id||null},
    {key:'TRELLO',name:'Trello',lastRunAt:trello?.completed_at||null,status:state(trello?.completed_at,trello?.status,4),runStatus:trello?.status||'NO_DATA',cadenceMinutes:1,detail:Number(trello?.received_count||0),detailLabel:'actividades',message:trello?.error_message||`${Number(trello?.updated_count||0)} cambios en el último sondeo API`,runId:trello?.id||null},
  ].map(item=>({...item,ageMinutes:ageMinutes(item.lastRunAt)}));
  return {generatedAt:new Date().toISOString(),overall:sources.some(x=>x.status==='ERROR')?'ERROR':sources.some(x=>x.status==='STALE'||x.status==='NO_DATA')?'ATTENTION':'HEALTHY',cycleStatus:cycle?.status||'NO_DATA',sources};
}

const server = http.createServer(async (req,res) => {
  const origin=req.headers.origin;
  if(req.method==='OPTIONS') return send(res,204,{},origin);
  const url=new URL(req.url,`http://${host}:${port}`);
  try {
    if(req.method==='GET'&&url.pathname==='/api/cctv/health') return send(res,200,{ok:true,database:'connected'},origin);
    if(req.method==='GET'&&url.pathname.startsWith('/api/cctv/media/')){
      const fileName=path.basename(decodeURIComponent(url.pathname.slice('/api/cctv/media/'.length)));
      const allowed=new Set(require('node:fs').readdirSync(imageDir));
      if(!allowed.has(fileName))return send(res,404,{error:'Imagen no encontrada'},origin);
      const extension=path.extname(fileName).toLowerCase();
      const contentType=extension==='.svg'?'image/svg+xml':extension==='.jpg'||extension==='.jpeg'?'image/jpeg':extension==='.webp'?'image/webp':'image/png';
      res.writeHead(200,{'Content-Type':contentType,'Cache-Control':'public, max-age=3600',...(allowedOrigins.has(origin)?{'Access-Control-Allow-Origin':origin}:{})});
      return res.end(require('node:fs').readFileSync(path.join(imageDir,fileName)));
    }
    if(req.method==='GET'&&url.pathname==='/api/cctv/overview') return send(res,200,overviewData(),origin);
    if(req.method==='GET'&&url.pathname==='/api/cctv/technology') return send(res,200,technologyData(),origin);
    if(req.method==='GET'&&url.pathname==='/api/cctv/quality') return send(res,200,qualityData(),origin);
    if(req.method==='GET'&&url.pathname==='/api/cctv/alarms') return send(res,200,alarmsData(),origin);
    const alarmProfileMatch=url.pathname.match(/^\/api\/cctv\/alarms\/([^/]+)\/communication-profile$/);
    if(req.method==='POST'&&alarmProfileMatch){
      const locationId=decodeURIComponent(alarmProfileMatch[1]),location=db.prepare('SELECT id,canonical_name FROM locations WHERE id=? AND active=1').get(locationId);
      if(!location)return send(res,404,{error:'Punto canónico no encontrado'},origin);
      const body=await readBody(req),actor=String(req.headers['x-actor']||'local-operator').slice(0,100),now=new Date().toISOString(),before=db.prepare('SELECT * FROM alarm_communication_profiles WHERE location_id=?').get(locationId)||null;
      const textValue=(key,max=200)=>String(body[key]||'').trim().slice(0,max)||null,portValue=key=>{if(body[key]==null||body[key]==='')return null;const value=Number(body[key]);if(!Number.isInteger(value)||value<1||value>65535)throw new Error(`Puerto inválido: ${key}`);return value;},statusValue=key=>{const value=String(body[key]||'NOT_CONFIGURED').toUpperCase();if(!['REGISTERED','UNREGISTERED','ERROR','NOT_CONFIGURED','UNKNOWN'].includes(value))throw new Error(`Estado inválido: ${key}`);return value;};
      const profile={subscriberAccount:textValue('subscriberAccount',50),panelModel:textValue('panelModel',100),localIp:textValue('localIp',100),reportChannel:textValue('reportChannel',50),primaryReceiverAddress:textValue('primaryReceiverAddress',150),primaryReceiverPort:portValue('primaryReceiverPort'),primaryReceiverStatus:statusValue('primaryReceiverStatus'),secondaryReceiverAddress:textValue('secondaryReceiverAddress',150),secondaryReceiverPort:portValue('secondaryReceiverPort'),secondaryReceiverStatus:statusValue('secondaryReceiverStatus'),backupReceiverAddress:textValue('backupReceiverAddress',150),backupReceiverPort:portValue('backupReceiverPort'),backupReceiverStatus:statusValue('backupReceiverStatus'),failurePolicy:textValue('failurePolicy',150),source:'BABYWARE_MANUAL',verifiedAt:textValue('verifiedAt',40)||now,verifiedBy:actor,notes:textValue('notes',1000)};
      db.exec('BEGIN IMMEDIATE');try{db.prepare(`INSERT INTO alarm_communication_profiles(location_id,subscriber_account,panel_model,local_ip,report_channel,primary_receiver_address,primary_receiver_port,primary_receiver_status,secondary_receiver_address,secondary_receiver_port,secondary_receiver_status,backup_receiver_address,backup_receiver_port,backup_receiver_status,failure_policy,source,verified_at,verified_by,notes,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(location_id) DO UPDATE SET subscriber_account=excluded.subscriber_account,panel_model=excluded.panel_model,local_ip=excluded.local_ip,report_channel=excluded.report_channel,primary_receiver_address=excluded.primary_receiver_address,primary_receiver_port=excluded.primary_receiver_port,primary_receiver_status=excluded.primary_receiver_status,secondary_receiver_address=excluded.secondary_receiver_address,secondary_receiver_port=excluded.secondary_receiver_port,secondary_receiver_status=excluded.secondary_receiver_status,backup_receiver_address=excluded.backup_receiver_address,backup_receiver_port=excluded.backup_receiver_port,backup_receiver_status=excluded.backup_receiver_status,failure_policy=excluded.failure_policy,source=excluded.source,verified_at=excluded.verified_at,verified_by=excluded.verified_by,notes=excluded.notes,updated_at=excluded.updated_at`).run(locationId,profile.subscriberAccount,profile.panelModel,profile.localIp,profile.reportChannel,profile.primaryReceiverAddress,profile.primaryReceiverPort,profile.primaryReceiverStatus,profile.secondaryReceiverAddress,profile.secondaryReceiverPort,profile.secondaryReceiverStatus,profile.backupReceiverAddress,profile.backupReceiverPort,profile.backupReceiverStatus,profile.failurePolicy,profile.source,profile.verifiedAt,profile.verifiedBy,profile.notes,now);db.prepare(`INSERT INTO audit_log(id,entity_type,entity_id,action,actor,occurred_at,source_system,before_json,after_json,correlation_id) VALUES(?,?,?,?,?,?,?,?,?,?)`).run(crypto.randomUUID(),'ALARM_COMMUNICATION_PROFILE',locationId,'BABYWARE_PROFILE_UPDATED',actor,now,'SKYLAB_SECURITY',JSON.stringify(before),JSON.stringify(profile),crypto.randomUUID());db.exec('COMMIT');}catch(error){db.exec('ROLLBACK');throw error;}
      return send(res,200,{ok:true,locationId,profile:db.prepare('SELECT * FROM alarm_communication_profiles WHERE location_id=?').get(locationId)},origin);
    }
    if(req.method==='GET'&&url.pathname==='/api/cctv/project') return send(res,200,projectData(),origin);
    const projectScopeMatch=url.pathname.match(/^\/api\/cctv\/project-scope\/([^/]+)\/decision$/);
    if(req.method==='POST'&&projectScopeMatch){const scopeItemId=decodeURIComponent(projectScopeMatch[1]),body=await readBody(req),actor=req.headers['x-actor']||'local-operator',decision=String(body.decision||''),notes=String(body.notes||'').slice(0,500)||null,allowed=new Set(['INCLUDED','DUPLICATE','NOT_APPLICABLE']);if(!allowed.has(decision))return send(res,400,{error:'Decisión de alcance inválida'},origin);const item=projectData().scopeItems.find(row=>row.scopeItemId===scopeItemId);if(!item)return send(res,404,{error:'Intervención de proyecto no encontrada'},origin);const previous=db.prepare('SELECT * FROM project_scope_decisions WHERE scope_item_id=?').get(scopeItemId)||null,now=new Date().toISOString(),correlationId=crypto.randomUUID();db.exec('BEGIN IMMEDIATE');try{db.prepare(`INSERT INTO project_scope_decisions(scope_item_id,decision,decided_by,decided_at,notes) VALUES(?,?,?,?,?) ON CONFLICT(scope_item_id) DO UPDATE SET decision=excluded.decision,decided_by=excluded.decided_by,decided_at=excluded.decided_at,notes=excluded.notes`).run(scopeItemId,decision,actor,now,notes);db.prepare(`INSERT INTO audit_log(id,entity_type,entity_id,action,actor,occurred_at,source_system,before_json,after_json,correlation_id) VALUES(?,?,?,?,?,?,?,?,?,?)`).run(crypto.randomUUID(),'PROJECT_SCOPE_ITEM',scopeItemId,'PROJECT_SCOPE_DECIDED',actor,now,'SKYLAB_CCTV',JSON.stringify(previous),JSON.stringify({decision,notes,target:item.target,sourceCell:item.sourceCell}),correlationId);db.exec('COMMIT');}catch(error){db.exec('ROLLBACK');throw error;}return send(res,200,{ok:true,scopeItemId,decision,adjustedScope:projectData().summary.adjustedScope,remainingVariance:projectData().summary.remainingVariance},origin);}
    if(req.method==='GET'&&url.pathname==='/api/cctv/maintenance') return send(res,200,trelloMaintenanceData(),origin);
    const supportImageMatch=url.pathname.match(/^\/api\/cctv\/support\/([^/]+)\/image$/);
    if(req.method==='GET'&&supportImageMatch){const sourceCardId=decodeURIComponent(supportImageMatch[1]);if(!/^[a-f0-9]{20,40}$/i.test(sourceCardId))return send(res,400,{error:'Identificador inválido'},origin);const row=db.prepare("SELECT payload_json FROM support_cards WHERE source_system='TRELLO_SUPPORT' AND source_card_id=? AND active=1").get(sourceCardId);if(!row)return send(res,404,{error:'Tarjeta no encontrada'},origin);let payload={};try{payload=JSON.parse(row.payload_json||'{}')}catch{}const image=payload.cachedImage,fileName=path.basename(String(image?.fileName||''));if(!fileName||fileName!==image.fileName)return send(res,404,{error:'La tarjeta no tiene imagen cacheada'},origin);const filePath=path.join(supportImageDir,fileName);if(!fs.existsSync(filePath))return send(res,404,{error:'Imagen no disponible'},origin);return sendImage(res,filePath,image.mimeType||'image/jpeg',origin);}
    if(req.method==='GET'&&url.pathname==='/api/cctv/support') return send(res,200,supportData(),origin);
    if(req.method==='GET'&&url.pathname==='/api/cctv/sync-status') return send(res,200,syncStatusData(),origin);
    const maintenanceLinkMatch=url.pathname.match(/^\/api\/cctv\/maintenance\/([^/]+)\/link$/);
    if(req.method==='POST'&&maintenanceLinkMatch){
      const sourceItemId=decodeURIComponent(maintenanceLinkMatch[1]),body=await readBody(req),actor=req.headers['x-actor']||'local-operator',now=new Date().toISOString();
      const item=db.prepare("SELECT * FROM maintenance_work_items WHERE source_system='TRELLO' AND source_item_id=? AND active=1").get(sourceItemId),location=db.prepare('SELECT * FROM locations WHERE id=? AND active=1').get(body.locationId);
      if(!item)return send(res,404,{error:'Actividad de mantenimiento no encontrada'},origin);if(!location)return send(res,404,{error:'Ubicación canónica no encontrada'},origin);
      db.exec('BEGIN IMMEDIATE');try{const notes=String(body.notes||'').slice(0,500)||null;db.prepare(`INSERT INTO maintenance_identity_overrides(source_system,source_item_id,location_id,decided_by,decided_at,notes) VALUES('TRELLO',?,?,?,?,?) ON CONFLICT(source_system,source_item_id) DO UPDATE SET location_id=excluded.location_id,decided_by=excluded.decided_by,decided_at=excluded.decided_at,notes=excluded.notes`).run(sourceItemId,location.id,actor,now,notes);if(item.siis_code){db.prepare(`INSERT INTO maintenance_identity_rules(source_system,siis_code,location_id,decided_by,decided_at,notes) VALUES('TRELLO',?,?,?,?,?) ON CONFLICT(source_system,siis_code) DO UPDATE SET location_id=excluded.location_id,decided_by=excluded.decided_by,decided_at=excluded.decided_at,notes=excluded.notes`).run(item.siis_code,location.id,actor,now,notes);db.prepare("UPDATE maintenance_work_items SET location_id=?,identity_status='LINKED_MANUAL',last_seen_at=? WHERE source_system='TRELLO' AND siis_code=? AND active=1").run(location.id,now,item.siis_code);}else db.prepare("UPDATE maintenance_work_items SET location_id=?,identity_status='LINKED_MANUAL',last_seen_at=? WHERE source_system='TRELLO' AND source_item_id=?").run(location.id,now,sourceItemId);db.prepare(`INSERT INTO audit_log(id,entity_type,entity_id,action,actor,occurred_at,source_system,before_json,after_json,correlation_id) VALUES(?,?,?,?,?,?,?,?,?,?)`).run(crypto.randomUUID(),'MAINTENANCE_WORK_ITEM',sourceItemId,'IDENTITY_LINKED',actor,now,'SKYLAB_CCTV',JSON.stringify({locationId:item.location_id,identityStatus:item.identity_status}),JSON.stringify({locationId:location.id,canonicalName:location.canonical_name,identityStatus:'LINKED_MANUAL',siisCode:item.siis_code||null,reusableRule:!!item.siis_code}),crypto.randomUUID());db.exec('COMMIT');}catch(error){db.exec('ROLLBACK');throw error;}
      return send(res,200,{ok:true,sourceItemId,locationId:location.id,canonicalName:location.canonical_name},origin);
    }
    const supportLinkMatch=url.pathname.match(/^\/api\/cctv\/support\/([^/]+)\/link$/);
    if(req.method==='POST'&&supportLinkMatch){const sourceCardId=decodeURIComponent(supportLinkMatch[1]),body=await readBody(req),actor=req.headers['x-actor']||'local-operator',now=new Date().toISOString(),item=db.prepare("SELECT * FROM support_cards WHERE source_system='TRELLO_SUPPORT' AND source_card_id=? AND active=1").get(sourceCardId),location=db.prepare('SELECT * FROM locations WHERE id=? AND active=1').get(body.locationId);if(!item)return send(res,404,{error:'Tarjeta de soporte no encontrada'},origin);if(!location)return send(res,404,{error:'Ubicación canónica no encontrada'},origin);db.exec('BEGIN IMMEDIATE');try{db.prepare(`INSERT INTO support_identity_overrides(source_system,source_card_id,location_id,decided_by,decided_at,notes) VALUES('TRELLO_SUPPORT',?,?,?,?,?) ON CONFLICT(source_system,source_card_id) DO UPDATE SET location_id=excluded.location_id,decided_by=excluded.decided_by,decided_at=excluded.decided_at,notes=excluded.notes`).run(sourceCardId,location.id,actor,now,String(body.notes||'').slice(0,500)||null);db.prepare("UPDATE support_cards SET location_id=?,identity_status='LINKED_MANUAL',last_seen_at=? WHERE source_system='TRELLO_SUPPORT' AND source_card_id=?").run(location.id,now,sourceCardId);db.prepare(`INSERT INTO audit_log(id,entity_type,entity_id,action,actor,occurred_at,source_system,before_json,after_json,correlation_id) VALUES(?,?,?,?,?,?,?,?,?,?)`).run(crypto.randomUUID(),'SUPPORT_CARD',sourceCardId,'IDENTITY_LINKED',actor,now,'SKYLAB_CCTV',JSON.stringify({locationId:item.location_id}),JSON.stringify({locationId:location.id,canonicalName:location.canonical_name}),crypto.randomUUID());db.exec('COMMIT');}catch(error){db.exec('ROLLBACK');throw error;}return send(res,200,{ok:true,sourceCardId,locationId:location.id,canonicalName:location.canonical_name},origin);}
    if(req.method==='GET'&&url.pathname==='/api/cctv/notifications'){const actor=String(req.headers['x-actor']||url.searchParams.get('actor')||'skylab-local-user').slice(0,100);return send(res,200,notificationsData(actor),origin);}
    const notificationStateMatch=url.pathname.match(/^\/api\/cctv\/notifications\/(.+)\/state$/);
    if(req.method==='POST'&&notificationStateMatch){const id=decodeURIComponent(notificationStateMatch[1]),actor=String(req.headers['x-actor']||'skylab-local-user').slice(0,100),body=await readBody(req),now=new Date().toISOString();if(!db.prepare('SELECT 1 FROM operational_notifications WHERE id=?').get(id))return send(res,404,{error:'Notificación no encontrada'},origin);const before=db.prepare('SELECT * FROM operational_notification_states WHERE notification_id=? AND actor=?').get(id,actor)||{};const readAt=body.read===false?null:body.read?now:(before.read_at||null),attendedAt=body.attended===false?null:body.attended?now:(before.attended_at||null);db.prepare(`INSERT INTO operational_notification_states(notification_id,actor,read_at,attended_at,updated_at) VALUES(?,?,?,?,?) ON CONFLICT(notification_id,actor) DO UPDATE SET read_at=excluded.read_at,attended_at=excluded.attended_at,updated_at=excluded.updated_at`).run(id,actor,readAt,attendedAt,now);return send(res,200,{ok:true,id,read:!!readAt,attended:!!attendedAt},origin);}
    if(req.method==='POST'&&url.pathname==='/api/cctv/notifications/read-all'){const actor=String(req.headers['x-actor']||'skylab-local-user').slice(0,100),now=new Date().toISOString();syncOperationalNotifications();const rows=db.prepare("SELECT id FROM operational_notifications ORDER BY occurred_at DESC LIMIT 60").all(),upsert=db.prepare(`INSERT INTO operational_notification_states(notification_id,actor,read_at,attended_at,updated_at) VALUES(?,?,?,NULL,?) ON CONFLICT(notification_id,actor) DO UPDATE SET read_at=excluded.read_at,updated_at=excluded.updated_at`);db.exec('BEGIN IMMEDIATE');try{for(const row of rows)upsert.run(row.id,actor,now,now);db.exec('COMMIT')}catch(error){db.exec('ROLLBACK');throw error}return send(res,200,{ok:true,count:rows.length},origin);}
    if(req.method==='POST'&&url.pathname==='/api/cctv/notifications/preferences'){const actor=String(req.headers['x-actor']||'skylab-local-user').slice(0,100),body=await readBody(req),mode=String(body.mode||'');if(!['ALL','PRIORITY','MUTED'].includes(mode))return send(res,400,{error:'Preferencia inválida'},origin);db.prepare(`INSERT INTO operational_notification_preferences(actor,popup_mode,updated_at) VALUES(?,?,?) ON CONFLICT(actor) DO UPDATE SET popup_mode=excluded.popup_mode,updated_at=excluded.updated_at`).run(actor,mode,new Date().toISOString());return send(res,200,{ok:true,mode},origin);}
    if(req.method==='GET'&&url.pathname==='/api/cctv/operational-closure'){const requested=url.searchParams.get('date'),row=requested?db.prepare('SELECT * FROM operational_daily_closures WHERE closure_date=?').get(requested):db.prepare('SELECT * FROM operational_daily_closures ORDER BY closure_date DESC LIMIT 1').get();let summary={},cutoffs={};if(row){try{summary=JSON.parse(row.summary_json||'{}')}catch{}try{cutoffs=JSON.parse(row.source_cutoffs_json||'{}')}catch{}}return send(res,200,row?{available:true,date:row.closure_date,timeZone:row.time_zone,status:row.status,generatedAt:row.generated_at,summary,cutoffs}:{available:false,scheduledAt:'22:00',timeZone:'America/Bogota'},origin);}
    if(req.method==='GET'&&url.pathname==='/api/cctv/events/daily') return send(res,200,dailyEventsData(url.searchParams.get('date')),origin);
    if(req.method==='POST'&&url.pathname==='/api/cctv/events/identity/link'){
      const body=await readBody(req),aliasRaw=String(body.alias||'').trim(),aliasKey=normalizeName(aliasRaw),actor=String(req.headers['x-actor']||'local-operator').slice(0,100),now=new Date().toISOString(),location=db.prepare('SELECT id,canonical_name FROM locations WHERE id=? AND active=1').get(body.locationId);
      if(!aliasKey)return send(res,400,{error:'El alias del correo es obligatorio'},origin);if(!location)return send(res,404,{error:'Ubicación canónica no encontrada'},origin);
      const existing=db.prepare("SELECT la.location_id,l.canonical_name FROM location_aliases la JOIN locations l ON l.id=la.location_id WHERE la.source_system='EMAIL_DAHUA' AND la.alias_key=?").get(aliasKey);if(existing&&existing.location_id!==location.id)return send(res,409,{error:`Este alias ya está vinculado con ${existing.canonical_name}`},origin);
      const candidates=db.prepare("SELECT id,payload_json FROM cctv_events WHERE source_system='EMAIL_DAHUA' AND location_id IS NULL").all().filter(row=>{try{return normalizeName(JSON.parse(row.payload_json||'{}').storeRaw||'')===aliasKey}catch{return false}}),update=db.prepare('UPDATE cctv_events SET location_id=?,severity=CASE WHEN severity=\'REVIEW\' THEN \'NORMAL\' ELSE severity END,payload_json=? WHERE id=?');
      db.exec('BEGIN IMMEDIATE');try{db.prepare("INSERT INTO location_aliases(location_id,source_system,alias_raw,alias_key) VALUES(?,'EMAIL_DAHUA',?,?) ON CONFLICT(source_system,alias_key) DO UPDATE SET location_id=excluded.location_id,alias_raw=excluded.alias_raw").run(location.id,aliasRaw,aliasKey);for(const row of candidates){let payload={};try{payload=JSON.parse(row.payload_json||'{}')}catch{}update.run(location.id,JSON.stringify({...payload,identityStatus:'LINKED_MANUAL',identityMethod:'ALIAS_MANUAL',canonicalName:location.canonical_name}),row.id)}db.prepare(`INSERT INTO audit_log(id,entity_type,entity_id,action,actor,occurred_at,source_system,before_json,after_json,correlation_id) VALUES(?,?,?,?,?,?,?,?,?,?)`).run(crypto.randomUUID(),'EMAIL_IDENTITY',aliasKey,'IDENTITY_LINKED',actor,now,'SKYLAB_CCTV',JSON.stringify(existing||null),JSON.stringify({aliasRaw,locationId:location.id,canonicalName:location.canonical_name,updatedEvents:candidates.length}),crypto.randomUUID());db.exec('COMMIT')}catch(error){db.exec('ROLLBACK');throw error}
      return send(res,200,{ok:true,alias:aliasRaw,locationId:location.id,canonicalName:location.canonical_name,updatedEvents:candidates.length},origin);
    }
    if(req.method==='GET'&&url.pathname==='/api/cctv/visitors') return send(res,200,visitorAnalytics(url.searchParams.get('period'),url.searchParams.get('date')),origin);
    if(req.method==='GET'&&url.pathname==='/api/cctv/behavior/daily'){
      const daily=dailyEventsData(url.searchParams.get('date'));
      const siisCode=String(url.searchParams.get('siisCode')||'').trim();
      const item=daily.operationalCoverage.find(row=>String(row.siisCode||'')===siisCode)||null;
      return send(res,200,{date:daily.date,timeZone:daily.timeZone,generatedAt:daily.generatedAt,item},origin);
    }
    const snapshotMatch=url.pathname.match(/^\/api\/cctv\/events\/([a-f0-9-]+)\/snapshot$/i);
    if(req.method==='GET'&&snapshotMatch){const snapshot=await eventSnapshot(snapshotMatch[1]);if(!snapshot)return send(res,404,{error:'Evento no encontrado'},origin);if(!snapshot.available)return send(res,404,{error:snapshot.reason},origin);res.writeHead(200,{'Content-Type':snapshot.contentType,'Cache-Control':'private, max-age=86400',...(allowedOrigins.has(origin)?{'Access-Control-Allow-Origin':origin}:{})});return fs.createReadStream(snapshot.path).pipe(res);}
    if(req.method==='GET'&&url.pathname==='/api/cctv/locations') return send(res,200,{items:locationSearch(url.searchParams.get('search')||'')},origin);
    if(req.method==='GET'&&url.pathname==='/api/cctv/inventory') return send(res,200,{generatedAt:new Date().toISOString(),items:inventoryRows(url.searchParams.get('search')||'',url.searchParams.get('zone')||'',url.searchParams.get('coverage')||'covered')},origin);
    const locationDetailMatch=url.pathname.match(/^\/api\/cctv\/locations\/([^/]+)\/detail$/);
    if(req.method==='GET'&&locationDetailMatch){const detail=locationDetail(decodeURIComponent(locationDetailMatch[1]));return detail?send(res,200,detail,origin):send(res,404,{error:'Ubicación no encontrada'},origin);}
    if(req.method==='GET'&&url.pathname==='/api/cctv/candidates') return send(res,200,{generatedAt:new Date().toISOString(),items:candidateRows(url.searchParams.get('search')||'',url.searchParams.get('zone')||'')},origin);
    const reconcileMatch=url.pathname.match(/^\/api\/cctv\/locations\/([^/]+)\/reconcile$/);
    if(req.method==='POST'&&reconcileMatch){
      const locationId=decodeURIComponent(reconcileMatch[1]),body=await readBody(req),actor=req.headers['x-actor']||'local-operator';
      const location=db.prepare('SELECT id FROM locations WHERE id=? AND active=1').get(locationId);
      const allowedKinds=new Set(['KIT','SINGLE_CAMERA','K35','UNCONFIRMED']);const cameraCount=Number(body.cameraCount);
      if(!location)return send(res,404,{error:'Ubicación no encontrada'},origin);
      if(!allowedKinds.has(body.solutionKind)||!Number.isInteger(cameraCount)||cameraCount<1||cameraCount>128)return send(res,400,{error:'Tipo de solución o número de cámaras inválido'},origin);
      const now=new Date().toISOString();
      db.exec('BEGIN IMMEDIATE');
      try{db.prepare(`INSERT INTO cctv_location_overrides(location_id,camera_count,solution_kind,notes,updated_by,updated_at) VALUES(?,?,?,?,?,?)
        ON CONFLICT(location_id) DO UPDATE SET camera_count=excluded.camera_count,solution_kind=excluded.solution_kind,notes=excluded.notes,updated_by=excluded.updated_by,updated_at=excluded.updated_at`).run(locationId,cameraCount,body.solutionKind,String(body.notes||'').slice(0,1000)||null,actor,now);
        db.prepare(`INSERT INTO audit_log(id,entity_type,entity_id,action,actor,occurred_at,source_system,before_json,after_json,correlation_id) VALUES(?,?,?,?,?,?,?,?,?,?)`).run(crypto.randomUUID(),'LOCATION',locationId,'CCTV_TECHNICAL_DATA_RECONCILED',actor,now,'SKYLAB_CCTV',null,JSON.stringify({cameraCount,solutionKind:body.solutionKind,notes:body.notes||null}),crypto.randomUUID());db.exec('COMMIT');
      }catch(error){db.exec('ROLLBACK');throw error;}
      return send(res,200,{ok:true,locationId,nextAction:'SYNC'},origin);
    }
    const projectLinkMatch=url.pathname.match(/^\/api\/cctv\/project\/identity\/(\d+)\/link$/);
    if(req.method==='POST'&&projectLinkMatch){
      const projectId=Number(projectLinkMatch[1]),body=await readBody(req),actor=req.headers['x-actor']||'local-operator',now=new Date().toISOString();
      const project=db.prepare('SELECT * FROM stg_upgrade_projects WHERE id=?').get(projectId),location=db.prepare('SELECT * FROM locations WHERE id=? AND active=1').get(body.locationId);
      if(!project)return send(res,404,{error:'Elemento de proyecto no encontrado'},origin);if(!location)return send(res,404,{error:'Ubicación canónica no encontrada'},origin);
      const existing=db.prepare("SELECT location_id FROM location_aliases WHERE source_system='UPGRADE_PROJECT' AND alias_key=?").get(project.target_location_key);
      if(existing&&existing.location_id!==location.id)return send(res,409,{error:'Este nombre del proyecto ya fue relacionado con otra ubicación'},origin);
      db.exec('BEGIN IMMEDIATE');try{if(!existing)db.prepare("INSERT INTO location_aliases(location_id,source_system,alias_raw,alias_key) VALUES(?,'UPGRADE_PROJECT',?,?)").run(location.id,project.target_location_raw,project.target_location_key);db.prepare(`INSERT INTO audit_log(id,entity_type,entity_id,action,actor,occurred_at,source_system,before_json,after_json,correlation_id) VALUES(?,?,?,?,?,?,?,?,?,?)`).run(crypto.randomUUID(),'UPGRADE_PROJECT',String(projectId),'IDENTITY_LINKED',actor,now,'SKYLAB_CCTV',null,JSON.stringify({projectTarget:project.target_location_raw,locationId:location.id,canonicalName:location.canonical_name}),crypto.randomUUID());db.exec('COMMIT');}catch(error){db.exec('ROLLBACK');throw error;}
      return send(res,200,{ok:true,projectId,locationId:location.id,canonicalName:location.canonical_name},origin);
    }
    const syncMatch=url.pathname.match(/^\/api\/cctv\/locations\/([^/]+)\/sync$/);
    if(req.method==='POST'&&syncMatch){
      const locationId=decodeURIComponent(syncMatch[1]),actor=req.headers['x-actor']||'local-operator',now=new Date().toISOString();
      const location=db.prepare('SELECT * FROM locations WHERE id=? AND active=1').get(locationId);if(!location)return send(res,404,{error:'Ubicación no encontrada'},origin);
      const existing=db.prepare("SELECT COUNT(*) n FROM assets WHERE location_id=? AND lifecycle_status='ACTIVE'").get(locationId).n;if(existing)return send(res,200,{ok:true,locationId,idempotent:true,assets:existing},origin);
      const technical=db.prepare(`SELECT i.camera_count,i.recorder_model FROM location_aliases la JOIN stg_inventory_locations i ON i.location_name_key=la.alias_key WHERE la.location_id=? AND la.source_system='LEGACY_CCTV' AND i.import_run_id=(SELECT MAX(id) FROM import_runs) LIMIT 1`).get(locationId);
      const override=db.prepare('SELECT * FROM cctv_location_overrides WHERE location_id=?').get(locationId);const cameras=Number(override?.camera_count||technical?.camera_count||0);const kind=override?.solution_kind||(cameras===1?'SINGLE_CAMERA':cameras>1?'KIT':'UNCONFIRMED');
      if(!cameras||kind==='UNCONFIRMED')return send(res,409,{error:'Primero complete o concilie el tipo de solución y el número de cámaras'},origin);
      const insert=db.prepare(`INSERT INTO assets(id,location_id,asset_type,manufacturer,model,serial_number,dss_identifier,ip_address,channel_capacity,installed_at,lifecycle_status,metadata_json,fixed_asset_code,installation_id) VALUES(?,?,?,?,?,NULL,NULL,NULL,?,NULL,'ACTIVE',?,NULL,NULL)`);const created=[];
      db.exec('BEGIN IMMEDIATE');
      try{if(kind==='KIT'){const id=crypto.randomUUID();insert.run(id,locationId,'NVR','Dahua',technical?.recorder_model||null,cameras,JSON.stringify({source:'DATOS_CCTV_SYNC',confidence:technical?.recorder_model?'MODEL_CONFIRMED':'TYPE_CONFIRMED'}));created.push(id);}for(let n=1;n<=cameras;n++){const id=crypto.randomUUID();insert.run(id,locationId,kind==='SINGLE_CAMERA'?'STANDALONE_CAMERA':'CAMERA','Dahua',kind==='K35'?'IPC-K35':null,1,JSON.stringify({source:'DATOS_CCTV_SYNC',ordinal:n,confidence:kind==='K35'?'MODEL_CONFIRMED':'TYPE_CONFIRMED'}));created.push(id);}db.prepare("UPDATE locations SET cctv_coverage_status='ACTIVE',updated_at=? WHERE id=?").run(now,locationId);db.prepare(`INSERT INTO audit_log(id,entity_type,entity_id,action,actor,occurred_at,source_system,before_json,after_json,correlation_id) VALUES(?,?,?,?,?,?,?,?,?,?)`).run(crypto.randomUUID(),'LOCATION',locationId,'CCTV_ASSETS_SYNCHRONIZED',actor,now,'SKYLAB_CCTV',null,JSON.stringify({kind,cameras,assets:created}),crypto.randomUUID());db.exec('COMMIT');}catch(error){db.exec('ROLLBACK');throw error;}
      return send(res,200,{ok:true,locationId,assetsCreated:created.length},origin);
    }
    if(req.method==='POST'&&url.pathname==='/api/cctv/installations') {
      const body=await readBody(req); const actor=req.headers['x-actor']||'local-operator';
      const allowedSolutions=new Set(['STANDALONE_CAMERA','NVR_KIT','DVR_KIT','MVR','ANPR','ALARM','MIXED']);
      const allowedProvenance=new Set(['NEW','REUSED','MIXED']);
      if(!body.locationId||!allowedSolutions.has(body.solutionType)||!allowedProvenance.has(body.provenance)||!body.idempotencyKey) return send(res,400,{error:'Datos obligatorios inválidos'},origin);
      const location=db.prepare('SELECT * FROM locations WHERE id=? AND active=1').get(body.locationId);
      if(!location) return send(res,404,{error:'Ubicación no encontrada'},origin);
      const projectItem=body.projectItemId?db.prepare('SELECT * FROM stg_upgrade_projects WHERE id=?').get(Number(body.projectItemId)):null;
      if(body.projectItemId&&(!projectItem||!db.prepare("SELECT 1 FROM location_aliases WHERE source_system='UPGRADE_PROJECT' AND alias_key=? AND location_id=?").get(projectItem.target_location_key,body.locationId))) return send(res,409,{error:'El registro del proyecto no corresponde con la ubicación seleccionada'},origin);
      const existing=db.prepare('SELECT id FROM cctv_installations WHERE idempotency_key=?').get(body.idempotencyKey);
      if(existing) return send(res,200,{ok:true,id:existing.id,idempotent:true},origin);
      const now=new Date().toISOString(), installationId=crypto.randomUUID(), correlationId=crypto.randomUUID();
      db.exec('BEGIN IMMEDIATE');
      try {
        db.prepare(`INSERT INTO cctv_installations(id,location_id,solution_type,provenance,installed_at,technician,status,source_system,idempotency_key,notes,evidence_json,created_by,created_at,updated_at)
          VALUES(?,?,?,?,?,?, 'ACTIVE','MANUAL',?,?,?, ?,?,?)`).run(installationId,body.locationId,body.solutionType,body.provenance,body.installedAt||null,body.technician||null,body.idempotencyKey,body.notes||null,JSON.stringify(body.evidence||[]),actor,now,now);
        const assets=Array.isArray(body.assets)?body.assets:(body.asset?[body.asset]:[]);
        if(!assets.length) throw new Error('Debe registrar al menos un activo');
        const requireAf=new Set(['NVR','CAMERA','STANDALONE_CAMERA','HAPLITE_ROUTER']);
        const requireIp=new Set(['NVR','STANDALONE_CAMERA','HAPLITE_ROUTER']);
        const ipPattern=/^(?:\d{1,3}\.){3}\d{1,3}$/;
        for(const asset of assets){
          const individuallyTracked=new Set(['NVR','CAMERA','STANDALONE_CAMERA','HAPLITE_ROUTER','UPS']);
          const quantity=individuallyTracked.has(asset.assetType)?1:Math.max(1,Math.min(128,Number(asset.quantity)||1));
          const afValues=String(asset.fixedAssetCode||'').split(',').map(x=>x.trim()).filter(Boolean);
          const ipValues=String(asset.ipAddress||'').split(',').map(x=>x.trim()).filter(Boolean);
          if(requireAf.has(asset.assetType)&&afValues.length!==quantity) throw new Error(`${asset.assetType}: registre un código AF por unidad`);
          if(requireIp.has(asset.assetType)&&(ipValues.length!==quantity||ipValues.some(ip=>!ipPattern.test(ip)))) throw new Error(`${asset.assetType}: registre una IP válida por unidad`);
        }
        const createdAssets=[];
        const insertAsset=db.prepare(`INSERT INTO assets(id,location_id,asset_type,manufacturer,model,serial_number,dss_identifier,ip_address,channel_capacity,installed_at,lifecycle_status,metadata_json,fixed_asset_code,installation_id)
          VALUES(?,?,?,?,?,?,?,?,?,?,'ACTIVE',?,?,?)`);
        const insertChannel=db.prepare(`INSERT INTO channels(id,asset_id,channel_number,channel_name,channel_type,operational_role,analytics_capabilities,active) VALUES(?,?,?,?,?,?,?,1)`);
        for(const asset of assets){
          const individuallyTracked=new Set(['NVR','CAMERA','STANDALONE_CAMERA','HAPLITE_ROUTER','UPS']);
          const quantity=individuallyTracked.has(asset.assetType)?1:Math.max(1,Math.min(128,Number(asset.quantity)||1));
          const afValues=String(asset.fixedAssetCode||'').split(',').map(x=>x.trim()).filter(Boolean);
          const ipValues=String(asset.ipAddress||'').split(',').map(x=>x.trim()).filter(Boolean);
          for(let unit=1;unit<=quantity;unit++){
            const assetId=crypto.randomUUID();
            const af=afValues[unit-1]||null;
            const ip=ipValues[unit-1]||null;
            insertAsset.run(assetId,body.locationId,asset.assetType,asset.manufacturer||'Dahua',asset.model||null,asset.serialNumber||null,asset.dssIdentifier||null,ip,Number(asset.channelCapacity)||null,body.installedAt||null,JSON.stringify({unit,quantity}),af,installationId);
            const channelCount=['CAMERA','STANDALONE_CAMERA'].includes(asset.assetType)?1:Math.max(0,Math.min(128,Number(asset.channelCount)||0));
            for(let n=1;n<=channelCount;n++)insertChannel.run(crypto.randomUUID(),assetId,n,`Canal ${n}`,'VIDEO','SURVEILLANCE',JSON.stringify(body.analytics||[]));
            createdAssets.push({id:assetId,type:asset.assetType});
          }
        }
        db.prepare("UPDATE locations SET cctv_coverage_status='ACTIVE',updated_at=? WHERE id=?").run(now,body.locationId);
        db.prepare(`INSERT INTO audit_log(id,entity_type,entity_id,action,actor,occurred_at,source_system,before_json,after_json,correlation_id) VALUES(?,?,?,?,?,?,?,?,?,?)`).run(crypto.randomUUID(),'CCTV_INSTALLATION',installationId,'CREATED',actor,now,'SKYLAB_CCTV',null,JSON.stringify({locationId:body.locationId,solutionType:body.solutionType,provenance:body.provenance,assets:createdAssets}),correlationId);
        if(projectItem)db.prepare(`INSERT INTO audit_log(id,entity_type,entity_id,action,actor,occurred_at,source_system,before_json,after_json,correlation_id) VALUES(?,?,?,?,?,?,?,?,?,?)`).run(crypto.randomUUID(),'UPGRADE_PROJECT',String(projectItem.id),'PROJECT_INSTALLATION_REGISTERED',actor,now,'SKYLAB_CCTV',null,JSON.stringify({installationId,locationId:body.locationId,projectTarget:projectItem.target_location_raw}),correlationId);
        db.exec('COMMIT');
      } catch(error){db.exec('ROLLBACK');throw error;}
      return send(res,201,{ok:true,id:installationId,locationId:body.locationId},origin);
    }
    send(res,404,{error:'Ruta no encontrada'},origin);
  } catch(error){console.error(error);send(res,500,{error:error.message},origin);}
});
server.listen(port,host,()=>console.log(`CCTV API http://${host}:${port}`));
