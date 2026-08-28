'use strict';
require('dotenv').config({quiet:true});
const path=require('node:path');
const crypto=require('node:crypto');
const {DatabaseSync}=require('node:sqlite');
const {ImapFlow}=require('imapflow');
const {simpleParser}=require('mailparser');
const {classify}=require('../engine');
const {eventTypeFor,severityFor}=require('../eventStore');

const root=path.resolve(__dirname,'..'),db=new DatabaseSync(path.resolve(process.env.CCTV_DB||path.join(root,'data','cctv-staging.db')));
db.exec('PRAGMA foreign_keys=ON');db.exec('PRAGMA busy_timeout=5000');
const candidates=db.prepare(`SELECT id,source_event_id FROM cctv_events WHERE source_system='EMAIL_DAHUA' AND location_id IS NULL AND source_event_id LIKE 'INBOX:%' AND COALESCE(received_at,occurred_at)>=datetime('now','-2 days')`).all();
const uidToEvent=new Map(candidates.map(row=>[Number(row.source_event_id.split(':').at(-1)),row]));
const assetLookup=db.prepare(`SELECT DISTINCT l.id,l.canonical_name AS name FROM assets a JOIN locations l ON l.id=a.location_id WHERE a.ip_address=? AND a.lifecycle_status='ACTIVE' AND l.active=1`);
const dssLookup=db.prepare(`SELECT DISTINCT l.id,l.canonical_name AS name FROM dss_device_registry d JOIN locations l ON l.id=d.location_id WHERE d.ip_address=? AND d.status='ACTIVE' AND l.active=1`);
const update=db.prepare(`UPDATE cctv_events SET location_id=?,event_type=?,event_phase=?,severity=?,payload_json=? WHERE id=?`);

async function main(){
  if(!uidToEvent.size){console.log(JSON.stringify({ok:true,candidates:0,updated:0,tests:0,unresolved:0}));return;}
  const client=new ImapFlow({host:process.env.IMAP_HOST,port:Number(process.env.IMAP_PORT),secure:true,auth:{user:process.env.IMAP_USER,pass:process.env.IMAP_PASSWORD},logger:false});
  let updated=0,tests=0,unresolved=0;await client.connect();
  try{const lock=await client.getMailboxLock(process.env.IMAP_FOLDER||'INBOX',{readOnly:true});try{const sequence=[...uidToEvent.keys()].sort((a,b)=>a-b).join(',');for await(const msg of client.fetch(sequence,{envelope:true,source:true,uid:true},{uid:true})){const parsed=await simpleParser(msg.source),email={uid:msg.uid,subject:msg.envelope?.subject||'',from:msg.envelope?.from?.[0]?.address||'',date:msg.envelope?.date,hasAttachment:(parsed.attachments||[]).length>0,body:parsed.text||''},item=classify(email,{}),ip=email.sourceIp;let location=null;if(ip){const unique=new Map([...assetLookup.all(ip),...dssLookup.all(ip)].map(row=>[row.id,row]));if(unique.size===1)location=[...unique.values()][0];}const previous=db.prepare('SELECT payload_json FROM cctv_events WHERE id=?').get(uidToEvent.get(msg.uid).id);let payload={};try{payload=JSON.parse(previous.payload_json||'{}')}catch{}payload={...payload,category:item.categoria,rawEventType:item.tipoEvento||null,alarm:item.alarma||null,storeRaw:item.tienda||payload.storeRaw||null,channelRaw:item.canal||null,reason:item.motivo||null,sourceIp:ip||null,identityStatus:location?'LINKED_EXACT':item.categoria==='DESCARTADO'?'NOT_APPLICABLE':'UNLINKED',identityMethod:location?'IP_EXACT':null,canonicalName:location?.name||null};update.run(location?.id||null,eventTypeFor(item),item.fase||null,severityFor(item),JSON.stringify(payload),uidToEvent.get(msg.uid).id);updated++;if(item.categoria==='DESCARTADO')tests++;if(!location&&item.categoria!=='DESCARTADO')unresolved++;}}finally{lock.release();}}finally{if(client.usable)await client.logout();else client.close();db.close();}
  console.log(JSON.stringify({ok:true,candidates:uidToEvent.size,updated,tests,unresolved},null,2));
}
main().catch(error=>{console.error(error.message);process.exitCode=1});
