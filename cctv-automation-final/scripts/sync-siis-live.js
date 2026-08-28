require("dotenv").config({ quiet: true });
const fs = require("node:fs");
const path = require("node:path");
const { execFileSync } = require("node:child_process");
const { fetchStations } = require("../platform/siis-client");
const { runtimePaths } = require("../config/runtime-paths");

async function main(){
  const root=path.resolve(__dirname,".."),output=runtimePaths.siisSnapshotPath,temporary=`${output}.tmp`;
  fs.mkdirSync(path.dirname(output),{recursive:true});
  const stations=await fetchStations();
  fs.writeFileSync(temporary,`${JSON.stringify(stations,null,2)}\n`,{mode:0o600});
  fs.renameSync(temporary,output);
  execFileSync(process.execPath,[path.join(root,"platform","import-siis-snapshot.js"),"--input",output,"--db",runtimePaths.dbPath],{cwd:root,stdio:"inherit"});
  console.log(JSON.stringify({ok:true,stations:stations.length,capturedAt:new Date().toISOString()},null,2));
}
main().catch(error=>{console.error(`No fue posible sincronizar SIIS: ${error.message}`);process.exit(1);});
