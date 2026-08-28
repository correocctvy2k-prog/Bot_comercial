'use strict';

const path=require('node:path');
const {DatabaseSync}=require('node:sqlite');
const dbPath=path.resolve(process.argv[2]||process.env.CCTV_DB||'data/cctv-staging.db');
const db=new DatabaseSync(dbPath);
const columns=db.prepare("PRAGMA table_info('locations')").all().map(c=>c.name);
let action='NOOP';
if(columns.includes('region')&&!columns.includes('zone')){db.exec('ALTER TABLE locations RENAME COLUMN region TO zone');action='RENAMED_REGION_TO_ZONE';}
else if(!columns.includes('zone'))throw new Error('La tabla locations no contiene region ni zone');
const count=db.prepare('SELECT COUNT(*) n FROM locations').get().n;
db.close();
console.log(JSON.stringify({ok:true,dbPath,action,locations:count},null,2));
