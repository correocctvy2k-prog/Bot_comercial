const crypto=require('node:crypto');
const path=require('node:path');
const {DatabaseSync}=require('node:sqlite');
const {normalizeName}=require('../platform/normalize');
const db=new DatabaseSync(path.resolve(process.env.CCTV_DB||path.join(__dirname,'..','data','cctv-staging.db')));
const decisions=[
  {code:'4157',aliases:['19 con 37 II 4157']},
  {code:'2306',aliases:['Llano Grande','Apertura_Llanogrande_2306']},
  {code:'3815',aliases:['NVR Rivera_Escobar','Pto_venta_19261']},
];
const now=new Date().toISOString();
db.exec('BEGIN IMMEDIATE');
try{
  for(const decision of decisions){
    const location=db.prepare('SELECT id,canonical_name FROM locations WHERE siis_code=? AND active=1').get(decision.code);if(!location)throw new Error(`No existe SIIS ${decision.code}`);
    for(const alias of decision.aliases)db.prepare(`INSERT OR IGNORE INTO location_aliases(location_id,source_system,alias_raw,alias_key) VALUES(?,'EMAIL_DAHUA',?,?)`).run(location.id,alias,normalizeName(alias));
    const events=db.prepare("SELECT id,payload_json FROM cctv_events WHERE source_system='EMAIL_DAHUA' AND location_id IS NULL").all();
    for(const event of events){const payload=JSON.parse(event.payload_json||'{}'),candidates=[payload.storeRaw,payload.subject,payload.alarm,payload.channelRaw].map(value=>normalizeName(value||''));if(!decision.aliases.some(alias=>candidates.includes(normalizeName(alias))))continue;payload.identityStatus='LINKED_EXACT';payload.canonicalName=location.canonical_name;db.prepare('UPDATE cctv_events SET location_id=?,payload_json=? WHERE id=?').run(location.id,JSON.stringify(payload),event.id);}
    db.prepare(`INSERT INTO audit_log(id,entity_type,entity_id,action,actor,occurred_at,source_system,before_json,after_json,correlation_id) VALUES(?,?,?,?,?,?,?,?,?,?)`).run(crypto.randomUUID(),'LOCATION',location.id,'EMAIL_IDENTITY_RECONCILED','codex',now,'SKYLAB_CCTV',null,JSON.stringify({siisCode:decision.code,aliases:decision.aliases}),crypto.randomUUID());
  }
  db.exec('COMMIT');
}catch(error){db.exec('ROLLBACK');throw error;}finally{db.close();}
console.log(JSON.stringify({ok:true,decisions:decisions.length},null,2));
