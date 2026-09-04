'use strict';
const path=require('node:path');
const {DatabaseSync}=require('node:sqlite');
const {runtimePaths}=require('../config/runtime-paths');

require('dotenv').config({path:runtimePaths.trelloEnvFile,quiet:true});
const backendRoot=runtimePaths.trelloBackendRoot;
const cachePath=runtimePaths.trelloCacheDb;
const cache=new DatabaseSync(cachePath,{readOnly:true});
const list=cache.prepare(`SELECT l.id,l.name,b.name AS board FROM listas l JOIN tableros b ON b.id=l.idBoard WHERE l.closed=0 AND b.closed=0 AND upper(l.name)='MANTENIMIENTO CCTV 2026' LIMIT 1`).get();
cache.close();
if(!list)throw new Error('No se encontró la lista Mantenimiento CCTV 2026 en la caché Trello');

const trelloService=require(path.join(backendRoot,'src','services','trello.service.js'));
trelloService.getTarjetas(list.id).then(cards=>{
  const month=cards.find(card=>String(card.name||'').toUpperCase()==='AGOSTO');
  const items=(month?.checklists||[]).flatMap(checklist=>checklist.checkItems||[]);
  console.log(JSON.stringify({ok:true,listId:list.id,cards:cards.length,august:{total:items.length,completed:items.filter(item=>item.state==='complete').length}},null,2));
}).catch(error=>{console.error(error.message);process.exit(1);});
