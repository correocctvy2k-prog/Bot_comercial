require('dotenv').config({quiet:true});
const crypto=require('node:crypto');const path=require('node:path');const fs=require('node:fs');const {ImapFlow}=require('imapflow');const {simpleParser}=require('mailparser');const {DatabaseSync}=require('node:sqlite');const {parseVisitorReports}=require('../platform/visitor-report');
const {runtimePaths}=require('../config/runtime-paths');
const folder=process.env.VISITORS_IMAP_FOLDER||'Reporte Visitantes',db=new DatabaseSync(runtimePaths.dbPath);db.exec(fs.readFileSync(path.resolve(__dirname,'..','platform','schema.sql'),'utf8'));
const client=new ImapFlow({host:process.env.IMAP_HOST,port:Number(process.env.IMAP_PORT||993),secure:true,auth:{user:process.env.IMAP_USER,pass:process.env.IMAP_PASSWORD},logger:false});
const findRun=db.prepare('SELECT id FROM visitor_report_runs WHERE source_uid=?'),insertRun=db.prepare('INSERT INTO visitor_report_runs(source_uid,report_date,received_at,subject,row_count,imported_at) VALUES(?,?,?,?,?,?)'),insertVisit=db.prepare(`INSERT OR IGNORE INTO visitor_visits(id,source_uid,source_row,report_date,visitor_external_id,visitor_key,document_type,document_masked,first_name,last_name,host_first_name,host_last_name,reason,visit_status,entry_at,entry_place,exit_at,exit_place,imported_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`);
async function extractReports(parsed){
  const reports=parseVisitorReports(parsed.html).map((rows,index)=>({key:`body-${index+1}`,rows,subject:parsed.subject||null,receivedAt:parsed.date||null}));
  for(const [index,attachment] of (parsed.attachments||[]).entries()){
    const name=attachment.filename||`adjunto-${index+1}`,type=String(attachment.contentType||'').toLowerCase();
    if(type==='message/rfc822'||/\.eml$/i.test(name)){
      const nested=await simpleParser(attachment.content),nestedReports=await extractReports(nested);
      nestedReports.forEach((report,nestedIndex)=>reports.push({...report,key:`eml-${index+1}-${nestedIndex+1}-${report.key}`,subject:nested.subject||report.subject,receivedAt:nested.date||report.receivedAt}));
    }else if(type.includes('html')||/\.html?$/i.test(name)){
      parseVisitorReports(attachment.content.toString('utf8')).forEach((rows,tableIndex)=>reports.push({key:`html-${index+1}-${tableIndex+1}`,rows,subject:name,receivedAt:parsed.date||null}));
    }
  }
  return reports;
}

function persistReport(sourceUid,report){
  if(findRun.get(sourceUid)){return'existing';}
  const rows=report.rows,now=new Date().toISOString(),reportDate=rows.map(row=>row.reportDate).filter(Boolean).sort()[0]||null;
  db.exec('BEGIN IMMEDIATE');try{insertRun.run(sourceUid,reportDate,report.receivedAt?.toISOString?.()||report.receivedAt||null,report.subject||null,rows.length,now);let inserted=0;for(const row of rows){const result=insertVisit.run(crypto.randomUUID(),sourceUid,row.sourceRow,row.reportDate||reportDate,row.visitorExternalId,row.visitorKey,row.documentType,row.documentMasked,row.firstName,row.lastName,row.hostFirstName,row.hostLastName,row.reason,row.status,row.entryAt,row.entryPlace,row.exitAt,row.exitPlace,now);inserted+=Number(result.changes||0);}db.exec('COMMIT');return inserted;}catch(error){db.exec('ROLLBACK');throw error;}
}

(async()=>{await client.connect();let reports=0,visits=0,existing=0,containers=0;const unrecognized=[];try{const lock=await client.getMailboxLock(folder,{readOnly:true});try{for await(const msg of client.fetch('1:*',{uid:true,envelope:true,source:true})){containers++;const baseUid=`${folder}:${msg.uid}`,parsed=await simpleParser(msg.source),extracted=await extractReports(parsed);if(!extracted.length)unrecognized.push({uid:msg.uid,subject:msg.envelope?.subject||parsed.subject||null,date:msg.envelope?.date?.toISOString?.()||null,html:!!parsed.html,attachments:(parsed.attachments||[]).map(item=>({name:item.filename||null,type:item.contentType||null,size:item.size||item.content?.length||0}))});for(const [index,report] of extracted.entries()){const sourceUid=index===0?baseUid:`${baseUid}#${report.key}`,result=persistReport(sourceUid,{...report,subject:report.subject||msg.envelope?.subject||null,receivedAt:report.receivedAt||msg.envelope?.date||null});if(result==='existing')existing++;else{reports++;visits+=result;}}}}finally{lock.release();}}finally{if(client.usable)await client.logout();else client.close();db.close();}console.log(JSON.stringify({folder,containers,reports,visits,existing,unrecognized},null,2));})().catch(error=>{console.error(error);process.exitCode=1;});
