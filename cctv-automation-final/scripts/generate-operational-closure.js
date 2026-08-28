'use strict';
require('dotenv').config({quiet:true});
const fs=require('node:fs'),path=require('node:path');
const {DatabaseSync}=require('node:sqlite');
const {localDate,buildOperationalClosure}=require('../platform/operational-closure');
const {runtimePaths}=require('../config/runtime-paths');
const root=path.resolve(__dirname,'..'),db=new DatabaseSync(runtimePaths.dbPath);
db.exec('PRAGMA foreign_keys=ON');db.exec('PRAGMA busy_timeout=5000');db.exec(fs.readFileSync(path.join(root,'platform','schema.sql'),'utf8'));
const forced=process.argv.includes('--force'),parts=Object.fromEntries(new Intl.DateTimeFormat('en-US',{timeZone:'America/Bogota',hour:'2-digit',hourCycle:'h23'}).formatToParts(new Date()).filter(x=>x.type!=='literal').map(x=>[x.type,Number(x.value)])),date=process.argv.find(x=>/^\d{4}-\d{2}-\d{2}$/.test(x))||localDate();
if(!forced&&parts.hour<22){console.log(JSON.stringify({ok:true,skipped:true,reason:'BEFORE_22H',date}));db.close();process.exit(0)}
const existing=db.prepare('SELECT closure_date,status,generated_at FROM operational_daily_closures WHERE closure_date=?').get(date);if(existing&&!forced){console.log(JSON.stringify({ok:true,skipped:true,reason:'ALREADY_CLOSED',...existing}));db.close();process.exit(0)}
const closure=buildOperationalClosure(db,date);db.prepare(`INSERT INTO operational_daily_closures(closure_date,time_zone,status,generated_at,summary_json,source_cutoffs_json) VALUES(?,?,?,?,?,?) ON CONFLICT(closure_date) DO UPDATE SET time_zone=excluded.time_zone,status=excluded.status,generated_at=excluded.generated_at,summary_json=excluded.summary_json,source_cutoffs_json=excluded.source_cutoffs_json`).run(closure.date,closure.timeZone,closure.status,closure.generatedAt,JSON.stringify(closure.summary),JSON.stringify(closure.cutoffs));db.close();console.log(JSON.stringify({ok:true,...closure},null,2));
