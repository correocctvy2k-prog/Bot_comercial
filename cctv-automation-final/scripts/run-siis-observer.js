'use strict';
require('dotenv').config({ quiet: true });
const fs=require('node:fs'),path=require('node:path');
const {spawnSync}=require('node:child_process');
const {DatabaseSync}=require('node:sqlite');
const {observerPolicy}=require('../platform/siis-observer-policy');
const {runtimePaths}=require('../config/runtime-paths');
const root=path.resolve(__dirname,'..'),logDir=runtimePaths.logDir,lockPath=path.join(logDir,'siis-observer.lock'),auditPath=path.join(logDir,'siis-observer.jsonl'),dbPath=runtimePaths.dbPath;fs.mkdirSync(logDir,{recursive:true});
const localParts=()=>Object.fromEntries(new Intl.DateTimeFormat('en-US',{timeZone:'America/Bogota',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(new Date()).filter(x=>x.type!=='literal').map(x=>[x.type,Number(x.value)]));
function schedule(){const {hour,minute}=localParts(),clock=hour*60+minute,policy=observerPolicy(clock,process.env);if(policy.mode==='OUTSIDE_WINDOW')return{due:false,clock,...policy};let lastSuccessAt=null;if(fs.existsSync(dbPath)){const db=new DatabaseSync(dbPath,{readOnly:true});try{const row=db.prepare("SELECT completed_at FROM siis_sync_runs WHERE status='SUCCESS' ORDER BY id DESC LIMIT 1").get();lastSuccessAt=row?.completed_at||null;}finally{db.close();}}const ageMinutes=lastSuccessAt?(Date.now()-new Date(lastSuccessAt).getTime())/60000:Infinity;return{due:ageMinutes>=policy.intervalMinutes-0.5,clock,...policy,ageMinutes:Number.isFinite(ageMinutes)?Math.round(ageMinutes):null,lastSuccessAt};}
function audit(payload){fs.appendFileSync(auditPath,`${JSON.stringify({at:new Date().toISOString(),...payload})}\n`);}const decision=schedule();
if(process.argv.includes('--dry-run')){console.log(JSON.stringify({ok:true,...decision},null,2));process.exit(0);}if(!decision.due&&!process.argv.includes('--force')){audit({status:'SKIPPED',...decision});process.exit(0);}
let lock;try{lock=fs.openSync(lockPath,'wx');}catch(error){if(error.code==='EEXIST'){audit({status:'SKIPPED_OVERLAP',...decision});process.exit(0);}throw error;}
try{const result=spawnSync(process.execPath,[path.join(__dirname,'sync-siis-live.js')],{cwd:root,encoding:'utf8',windowsHide:true});audit({status:result.status===0?'SUCCESS':'ERROR',...decision,exitCode:result.status,stdout:String(result.stdout||'').trim().slice(-2000),stderr:String(result.stderr||'').trim().slice(-2000)});if(result.status!==0)process.exitCode=1;else console.log(JSON.stringify({ok:true,mode:decision.mode,intervalMinutes:decision.intervalMinutes},null,2));}finally{fs.closeSync(lock);fs.unlinkSync(lockPath);}
