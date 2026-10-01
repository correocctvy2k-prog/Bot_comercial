'use strict';
// spec 0018: el punto "IGLESIA V.GORGONA" tiene registrado el alias generico
// "Iglesia" (una sola palabra) -- hay otros 3 puntos cuyo nombre tambien
// contiene "Iglesia" (Prado Iglesia II, Emilia Iglesia, Zamorano Iglesia). El
// matcher con contencion (spec 0018) ya evita la mayoria de los falsos
// positivos que esto causaba, pero el alias sigue siendo ambiguo por
// diseno -- se elimina como limpieza de datos, no cambia codigo.
//
// Uso: node scripts/fix-generic-alias-iglesia-20261001.js [--apply]
// Sin --apply: solo muestra qué se borraria (modo auditoria).
const path=require('node:path');
const {DatabaseSync}=require('node:sqlite');
const {runtimePaths}=require('../config/runtime-paths');

const apply=process.argv.includes('--apply');
const db=new DatabaseSync(runtimePaths.dbPath);
db.exec('PRAGMA busy_timeout=10000');
const rows=db.prepare("SELECT id,location_id,alias_raw FROM location_aliases WHERE alias_raw='Iglesia'").all();

if(rows.length===0){
  console.log(JSON.stringify({status:'NOTHING_TO_DO',message:'No existe el alias generico "Iglesia"'},null,2));
  process.exit(0);
}

console.log(JSON.stringify({status:apply?'APPLYING':'AUDIT_ONLY',rowsToDelete:rows},null,2));

if(apply){
  const del=db.prepare('DELETE FROM location_aliases WHERE id=?');
  db.exec('BEGIN IMMEDIATE');
  try{
    for(const row of rows)del.run(row.id);
    db.exec('COMMIT');
    console.log(JSON.stringify({status:'DELETED',count:rows.length},null,2));
  }catch(error){
    db.exec('ROLLBACK');
    throw error;
  }
}
db.close();
