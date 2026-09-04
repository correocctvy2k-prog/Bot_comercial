const {DatabaseSync}=require('node:sqlite');
const {normalizeName,similarity}=require('../platform/normalize');
const db=new DatabaseSync('data/cctv-staging.db');
const run=db.prepare('select max(id) id from import_runs').get().id;
const locations=db.prepare('select id,canonical_name from locations where active=1').all();
const aliases=db.prepare(`select la.location_id,i.location_name_raw from location_aliases la join stg_inventory_locations i on i.location_name_key=la.alias_key and i.import_run_id=? where la.source_system='LEGACY_CCTV'`).all(run);
const choices=[...locations.map(x=>({id:x.id,name:x.canonical_name})),...aliases.map(x=>({id:x.location_id,name:x.location_name_raw}))];
for(const panel of db.prepare('select location_name_raw from stg_alarm_panels where import_run_id=?').all(run)){
 const best=choices.map(x=>({...x,score:similarity(panel.location_name_raw,x.name)})).sort((a,b)=>b.score-a.score).slice(0,3);
 console.log(panel.location_name_raw,JSON.stringify(best));
}
