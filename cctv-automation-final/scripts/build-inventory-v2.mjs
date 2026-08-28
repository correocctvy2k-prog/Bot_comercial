import fs from "node:fs/promises";
import path from "node:path";
import { createRequire } from "node:module";
import { FileBlob, SpreadsheetFile } from "@oai/artifact-tool";

const require = createRequire(import.meta.url);
const ExcelJS = require("exceljs");
const { similarity } = require("../platform/normalize");

const [sourcePath, annualPath, outputPath] = process.argv.slice(2).map((p) => path.resolve(p));
if (!sourcePath || !annualPath || !outputPath) throw new Error("Uso: build-inventory-v2.mjs <DATOS CCTV.xlsx> <programacion.xlsx> <salida.xlsx>");

const clean = (v) => v == null ? "" : String(v).replace(/\s+/g, " ").trim();
const key = (v) => clean(v).normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase().replace(/[^A-Z0-9]+/g, " ").trim();
const ipKey = (v) => clean(v).match(/\b(?:\d{1,3}\.){3}\d{1,3}\b/)?.[0] || "";
const regions = new Set(["PALMIRA", "ROZO", "AMAIME", "FLORIDA", "PRADERA", "CANDELARIA", "OCCIDENTE"]);
const addr = (n) => { let s=""; while(n){n--;s=String.fromCharCode(65+n%26)+s;n=Math.floor(n/26);} return s; };
const greenFill = (cell) => cell.fill?.type === "pattern" && cell.fill?.pattern === "solid" && cell.fill?.fgColor?.theme === 9;
const fillLabel = (cell) => {
  if (greenFill(cell)) return "VERDE_ORIGINAL";
  const theme = cell.fill?.fgColor?.theme;
  if (theme === 7) return "AZUL_ORIGINAL";
  if (theme === 5) return "NARANJA_ORIGINAL";
  if (cell.fill?.pattern === "solid") return `TEMA_${theme ?? "RGB"}`;
  return "SIN_COLOR";
};

const src = new ExcelJS.Workbook();
const annual = new ExcelJS.Workbook();
await Promise.all([src.xlsx.readFile(sourcePath), annual.xlsx.readFile(annualPath)]);
const dssData=JSON.parse(await fs.readFile(path.resolve("data/dss-device-staging.json"),"utf8"));
const dssDevices=dssData.devices;

const legacyInventory = src.getWorksheet("cctv");
const projectLegacy = src.getWorksheet("Proyecto Actualizacion");
const alarmLegacy = src.getWorksheet("Alarmas OSZFORD");
const vehicleLegacy = src.getWorksheet("Vehiculos");

function maintenancePoints() {
  const sheet = annual.getWorksheet("Total");
  const blocks = [];
  for (let c=1;c<=sheet.columnCount-2;c++) {
    if (key(sheet.getCell(2,c).value)==="PERIODO" && key(sheet.getCell(3,c).value)==="R1" && key(sheet.getCell(3,c+1).value)==="R2" && key(sheet.getCell(3,c+2).value)==="R3") {
      blocks.push({region:clean(sheet.getCell(2,c-1).value),code:c-2,name:c-1,r1:c,r2:c+1,r3:c+2});
    }
  }
  const out=[];
  for(const b of blocks) for(let r=4;r<=sheet.rowCount;r++) {
    const name=clean(sheet.getCell(r,b.name).value);
    if(!name || key(name)==="TOTAL" || sheet.getCell(r,b.name).formula) continue;
    out.push({code:clean(sheet.getCell(r,b.code).value),name,region:b.region,r1:sheet.getCell(r,b.r1).value??"",r2:sheet.getCell(r,b.r2).value??"",r3:sheet.getCell(r,b.r3).value??"",sourceRow:r});
  }
  return out;
}

function inventoryRows() {
  const out=[]; let region="";
  for(let r=4;r<=legacyInventory.rowCount;r++) {
    const loc=clean(legacyInventory.getCell(r,4).value);
    const cameraRaw=legacyInventory.getCell(r,12).value;
    const cams=cameraRaw == null || cameraRaw === "" ? null : Number(cameraRaw);
    if(loc && regions.has(key(loc)) && !Number.isFinite(cams)){ region=key(loc); continue; }
    if(!loc && !Number.isFinite(cams)) continue;
    if(!loc && cams>64) continue;
    const sourceModel=clean(legacyInventory.getCell(r,20).value);
    const analytics=clean(legacyInventory.getCell(r,16).value);
    const alarm=clean(legacyInventory.getCell(r,14).value);
    const isK35=/K35/i.test(sourceModel+" "+loc+" "+analytics);
    const oneCamera=cams===1;
    const model=isK35?(sourceModel||"K35 (modelo exacto pendiente)"):sourceModel;
    const type=isK35?"CAMARA_IP_LEGACY":oneCamera?"CAMARA_AUTONOMA_MICROSD":/CAM.?IP|IPC/i.test(model+" "+loc)?"CAMARA_IP":"GRABADOR";
    const tech=isK35?"K35_LEGACY":/ANPR/i.test(analytics+" "+model)?"ANPR":/ROSTRO|FACIAL/i.test(analytics+" "+model)?"RECONOCIMIENTO_FACIAL":/IA|SMD|WIZ|ACUPICK/i.test(analytics+" "+model)?"VIDEO_ANALITICA":alarm?"CCTV_CON_ALARMA":"CCTV_CONVENCIONAL";
    const storage=oneCamera?"MICROSD":"GRABADOR_LOCAL";
    const lifecycle=isK35?"RENOVACION_PRIORITARIA":"POR_VALIDAR";
    const flags=[];
    if(!loc) flags.push("SIN_PUNTO"); if(!sourceModel) flags.push(isK35?"MODELO_EXACTO_K35_PENDIENTE":"MODELO_PENDIENTE"); if(!oneCamera&&!clean(legacyInventory.getCell(r,11).value)) flags.push("IP_GRABADOR_PENDIENTE");
    out.push({id:`DEV-${String(out.length+1).padStart(4,"0")}`,location:loc,region,type,manufacturer:"Dahua",model,technology:tech,channels:Number.isFinite(cams)?cams:"",storage,haplite:clean(legacyInventory.getCell(r,5).value),secondary:clean(legacyInventory.getCell(r,6).value),network:clean(legacyInventory.getCell(r,7).value),wifi:clean(legacyInventory.getCell(r,8).value),nat:clean(legacyInventory.getCell(r,9).value),port:clean(legacyInventory.getCell(r,10).value),ip:clean(legacyInventory.getCell(r,11).value),firmware:clean(legacyInventory.getCell(r,13).value),alarm,monitoring:clean(legacyInventory.getCell(r,15).value),analytics,status:lifecycle,quality:flags.join("; ")||"OK",sourceRow:r});
  }
  return out;
}

function projectRows() {
  const out=[]; const seen=new Set();
  const add=(r,c,stream,scope="")=>{
    const cell=projectLegacy.getCell(r,c); const target=clean(cell.value); const k=key(target);
    if(!target || regions.has(k) || /^(PUNTOS?|TOTAL|SISTEMA CCTV|INSTALACION CAM|PUNTO A INSTALAR)/.test(k)) return;
    const dedupe=`${stream}|${k}|${r}`; if(seen.has(dedupe)) return; seen.add(dedupe);
    const status=greenFill(cell)?"IMPLEMENTADO":"PLANIFICADO";
    const technology=/ROSTRO|FACIAL/i.test(target+scope)?"RECONOCIMIENTO_FACIAL":/IA|ANALIT/i.test(target+scope)?"VIDEO_ANALITICA":/ALARMA/i.test(target+scope)?"CAMARA_CON_ALARMA":"CCTV";
    out.push({id:`PRY-${String(out.length+1).padStart(3,"0")}`,stream,target,scope,technology,status,progress:status==="IMPLEMENTADO"?1:0,color:fillLabel(cell),source:`Proyecto Actualizacion!${addr(c)}${r}`});
  };
  for(let r=4;r<=44;r++){ add(r,2,"ACTUALIZACION_ALTO_VALOR",clean(projectLegacy.getCell(r,3).value)); add(r,6,"CAMARA_IP_ANALITICA",""); }
  for(let r=4;r<=44;r++) {
    const destination=clean(projectLegacy.getCell(r,3).value);
    if(destination && !regions.has(key(destination)) && !/NVR QUEDA|SOLO SE CAMBIA|SE DESMONTA|TECNOLOGIA OBSOLETA/i.test(destination)) {
      add(r,3,"KIT_REUTILIZADO",`Equipo trasladado desde ${clean(projectLegacy.getCell(r,2).value)}`);
    }
  }
  for(const r of [38,39,40,41,44,45,50,51,52,53,56,57,58,59]) { add(r,6,"COMBO_NUEVO_ANALITICA",""); add(r,10,"COMBO_REUTILIZADO",""); }
  return out;
}

const points=maintenancePoints(), devices=inventoryRows(), projects=projectRows();
const dssByIp=new Map();
for(const d of dssDevices){const ip=ipKey(d.export?.address);if(!dssByIp.has(ip))dssByIp.set(ip,[]);dssByIp.get(ip).push(d);}
function dssCategory(d){const t=key(d.export?.type),m=key(d.model);if(t.includes("ALARM"))return "PANEL_ALARMA";if(t==="ANPR"||m.startsWith("ITC"))return "CAMARA_ANPR";if(t==="IPC"||m.includes("IPC"))return /K35/.test(m)?"CAMARA_IP_LEGACY":"CAMARA_IP";if(t.includes("MVR"))return "MVR";if(t.includes("DVR")||m.includes("XVR")||m.includes("HCVR"))return "DVR_XVR";return "NVR";}
const linkedDss=new Set();
for(const d of devices){
  const ips=[ipKey(d.haplite),ipKey(d.ip)].filter(Boolean);let candidates=[...new Map(ips.flatMap(ip=>(dssByIp.get(ip)||[])).map(x=>[x.deviceIdDss,x])).values()].filter(x=>!linkedDss.has(x.deviceIdDss));
  if(candidates.length>1){const locKey=key(d.location);for(const signal of ["PARQUEADERO","CAJAS","ANPR","ALARMA","CAM SMD"]){if(locKey.includes(signal)){const signaled=candidates.filter(x=>key(x.export?.name).includes(signal));if(signaled.length)candidates=signaled;break;}}}
  if(candidates.length>1)candidates=candidates.map(x=>({x,score:similarity(d.location,x.export?.name||"")})).sort((a,b)=>b.score-a.score).filter((v,i,a)=>i===0||v.score===a[0].score).map(v=>v.x);
  if(candidates.length===1){const x=candidates[0];d.deviceIdDss=x.deviceIdDss;d.dssName=x.export.name;d.dssType=x.export.type;d.dssOrganization=x.export.organization;d.dssModel=x.model;d.dssCapture=x.sourceCapture;d.dssConfidence=x.matchScore;d.model=x.model||d.model;d.modelSource=x.model?"DSS_CAPTURA":"INVENTARIO_MANUAL";d.type=dssCategory(x);if(d.type==="CAMARA_IP_LEGACY"){d.technology="K35_LEGACY";d.status="RENOVACION_PRIORITARIA";}else if(d.type==="CAMARA_ANPR")d.technology="ANPR";d.quality=d.quality.split("; ").filter(x=>!x.startsWith("MODELO_")).join("; ")||"OK";
    d.storage=d.type.startsWith("CAMARA_")?"MICROSD":"GRABADOR_LOCAL";linkedDss.add(x.deviceIdDss);
  }else{d.modelSource=d.model?(/K35/.test(d.model)?"INFERIDO_K35":"INVENTARIO_MANUAL"):"PENDIENTE";d.deviceIdDss="";}
}
const inventoryByKey=new Map(devices.filter(d=>d.location).map(d=>[key(d.location),d]));
const locations=points.map((p,i)=>{const d=inventoryByKey.get(key(p.name));const ranked=d?[]:devices.filter(x=>x.location).map(x=>({device:x,score:similarity(p.name,x.location)})).sort((a,b)=>b.score-a.score);const candidate=ranked[0];return {id:`LOC-${String(i+1).padStart(4,"0")}`,...p,match:d?"COINCIDENCIA_EXACTA":"PENDIENTE_CONCILIACION",coverage:d?"CON_CCTV":"POR_VALIDAR",deviceId:d?.id||"",candidate:candidate?.device.location||"",confidence:candidate?.score||""};});

const wb=await SpreadsheetFile.importXlsx(await FileBlob.load(sourcePath));
const navy="#15324A", teal="#0F766E", green="#16A34A", amber="#D97706", light="#E8F1F5", red="#DC2626", white="#FFFFFF", gray="#64748B";
function addSheet(name){const s=wb.worksheets.add(name);s.showGridLines=false;return s;}
function title(sheet,text,subtitle,lastCol){sheet.mergeCells(`A1:${lastCol}1`);sheet.getRange("A1").values=[[text]];sheet.getRange(`A1:${lastCol}1`).format={fill:navy,font:{bold:true,color:white,size:18},verticalAlignment:"center"};sheet.getRange("A1").format.rowHeight=34;sheet.mergeCells(`A2:${lastCol}2`);sheet.getRange("A2").values=[[subtitle]];sheet.getRange(`A2:${lastCol}2`).format={fill:light,font:{italic:true,color:gray,size:10},wrapText:true};sheet.getRange("A2").format.rowHeight=30;}
function tableSheet(name,subtitle,headers,rows,tableName,widths){const s=addSheet(name);title(s,name.replaceAll("_"," "),subtitle,addr(headers.length));s.getRangeByIndexes(3,0,rows.length+1,headers.length).values=[headers,...rows];const h=s.getRange(`A4:${addr(headers.length)}4`);h.format={fill:teal,font:{bold:true,color:white},wrapText:true,verticalAlignment:"center"};h.format.rowHeight=32;s.freezePanes.freezeRows(4);for(let i=0;i<headers.length;i++)s.getRange(`${addr(i+1)}:${addr(i+1)}`).format.columnWidth=widths[i]||14;s.getRange(`A5:${addr(headers.length)}${rows.length+4}`).format={verticalAlignment:"top",wrapText:true};if(rows.length)s.tables.add(`A4:${addr(headers.length)}${rows.length+4}`,true,tableName).style="TableStyleMedium2";return s;}

const catalog=addSheet("Catalogos");title(catalog,"Catálogos controlados","Valores válidos para scripts y edición humana. Agregar opciones aquí antes de usarlas en hojas normalizadas.","H");
catalog.getRange("A4:H10").values=[
  ["ESTADO_PROYECTO","TIPO_ACTIVO","TECNOLOGIA","CICLO_VIDA","COBERTURA_CCTV","ZONA","CALIDAD","MATCH"],
  ["PLANIFICADO","GRABADOR","CCTV","POR_VALIDAR","CON_CCTV","PALMIRA","OK","COINCIDENCIA_EXACTA"],
  ["EN_EJECUCION","CAMARA_AUTONOMA_MICROSD","VIDEO_ANALITICA","ACTIVO","SIN_CCTV","ROZO","MODELO_PENDIENTE","PENDIENTE_CONCILIACION"],
  ["IMPLEMENTADO","PANEL_ALARMA","RECONOCIMIENTO_FACIAL","EN_MANTENIMIENTO","POR_VALIDAR","AMAIME","IP_GRABADOR_PENDIENTE","ALIAS_VALIDADO"],
  ["PAUSADO","MVR","ANPR","RETIRADO","NO_APLICA","FLORIDA","SIN_PUNTO",""],
  ["CANCELADO","NVR","CAMARA_CON_ALARMA","OBSOLETO","","PRADERA","POR_REVISAR",""],
  ["","CAMARA_IP_LEGACY","K35_LEGACY","RENOVACION_PRIORITARIA","","CANDELARIA","MODELO_EXACTO_K35_PENDIENTE",""],
];catalog.getRange("A4:H4").format={fill:teal,font:{bold:true,color:white}};catalog.getRange("A:H").format.columnWidth=24;

const locHeaders=["ID Ubicación","Código SIIS","Nombre canónico","Zona","R1","R2","R3","Estado conciliación","Candidato del inventario","Confianza sugerencia","Cobertura CCTV","ID dispositivo","Fila fuente mantenimiento","Decisión humana"];
const locRows=locations.map(x=>[x.id,x.code,x.name,x.region,x.r1,x.r2,x.r3,x.match,x.candidate,x.confidence,x.coverage,x.deviceId,x.sourceRow,x.match==="COINCIDENCIA_EXACTA"?"NO_REQUERIDA":"PENDIENTE"]);
const locSheet=tableSheet("Ubicaciones","PENDIENTE_CONCILIACION significa: confirmar si Nombre canónico y Candidato del inventario son el mismo punto. No implica pérdida de información.",locHeaders,locRows,"tblUbicaciones",[13,12,29,13,8,8,8,24,29,16,18,14,17,22]);
locSheet.getRange(`H5:H${locRows.length+4}`).dataValidation={rule:{type:"list",values:["COINCIDENCIA_EXACTA","PENDIENTE_CONCILIACION","ALIAS_VALIDADO"]}};
locSheet.getRange(`J5:J${locRows.length+4}`).format.numberFormat="0%";
locSheet.getRange(`N5:N${locRows.length+4}`).dataValidation={rule:{type:"list",values:["PENDIENTE","CONFIRMAR_MISMO_PUNTO","NO_ES_EL_MISMO","NO_REQUERIDA"]}};

const devHeaders=["ID Dispositivo","Device ID DSS","Código SIIS","Punto origen","Nombre DSS","Zona","Tipo activo","Tipo DSS","Fabricante","Modelo","Fuente modelo","Tecnología","Canales","Almacenamiento","IP HapLite","Red secundaria","Red CCTV","Red WiFi","NAT","Puerto","IP dispositivo / grabador","Organización DSS","Captura evidencia","Firmware","Alarma","Monitoreo","Analítica","Ciclo de vida","Calidad","Fila fuente"];
const devRows=devices.map(d=>[d.id,d.deviceIdDss,"",d.location,d.dssName||"",d.region,d.type,d.dssType||"",d.manufacturer,d.model,d.modelSource,d.technology,d.channels,d.storage,d.haplite,d.secondary,d.network,d.wifi,d.nat,d.port,d.ip,d.dssOrganization||"",d.dssCapture||"",d.firmware,d.alarm,d.monitoring,d.analytics,d.status,d.quality,d.sourceRow]);
const devSheet=tableSheet("Dispositivos","Maestro heredado enriquecido solo con coincidencias DSS unívocas. Un canal = cámara autónoma con microSD; K35 = renovación prioritaria.",devHeaders,devRows,"tblDispositivos",[14,14,12,27,27,12,24,16,12,27,18,23,9,18,15,16,15,15,10,9,22,34,22,20,16,15,20,22,29,11]);
devSheet.getRange(`J5:J${devRows.length+4}`).conditionalFormats.add("containsBlanks",{format:{fill:"#FEF3C7",font:{color:"#92400E"}}});

const dssHeaders=["Device ID DSS","Nombre DSS","Categoría","Tipo DSS","Modelo","IP / registro","Puerto","Organización DSS","Zona derivada","Servidor DSS","Fuente modelo","Captura evidencia","Método conciliación","Confianza","Fila exportación"];
const dssRows=dssDevices.map(d=>[d.deviceIdDss,d.export.name,dssCategory(d),d.export.type,d.model,d.export.address,d.export.port,d.export.organization,clean(d.export.organization).split("/").at(-1)||"","DSS7116S V8.5.0","CAPTURA_DEVICE_INFO",d.sourceCapture,d.matchMethod,d.matchScore,d.export.exportRow]);
const dssSheet=tableSheet("DSS_Dispositivos","Inventario de 111 activos conciliado entre DeviceInfo.xlsx y capturas del DSS. No contiene usuarios ni contraseñas.",dssHeaders,dssRows,"tblDssDispositivos",[15,31,20,18,28,18,10,42,16,19,22,24,24,12,15]);
dssSheet.getRange(`N5:N${dssRows.length+4}`).format.numberFormat="0%";
dssSheet.getRange(`N5:N${dssRows.length+4}`).conditionalFormats.add("cellIs",{operator:"lessThan",formula:0.8,format:{fill:"#FEF3C7",font:{color:"#92400E"}}});

const alarmHeaders=["ID Alarma","Código SIIS","Punto","IP","Máscara","Gateway","Cuenta","Tipo panel","Firmware","Serial","ID Panel","Estado comunicación","Fila fuente"];
const alarmRows=[];for(let r=3;r<=alarmLegacy.rowCount;r++){const p=clean(alarmLegacy.getCell(r,3).value);if(!p)continue;alarmRows.push([`ALM-${String(alarmRows.length+1).padStart(3,"0")}`,"",p,...[4,5,6,7,8,9,10,11,12].map(c=>clean(alarmLegacy.getCell(r,c).value)),r]);}
tableSheet("Alarmas","Paneles y periféricos de alarma asociados a puntos CCTV.",alarmHeaders,alarmRows,"tblAlarmas",[13,12,27,15,15,15,12,17,15,21,14,20,11]);

const vehHeaders=["ID Vehículo","Placa","Marca","Línea","Modelo año","Cilindraje","Descripción CCTV/MVR","Serial","ID GPRS","Referencia SIM","Operador","Notas","Fila fuente"];
const vehRows=[];for(let r=3;r<=vehicleLegacy.rowCount;r++){const plate=clean(vehicleLegacy.getCell(r,3).value);if(!plate)continue;vehRows.push([`VEH-${String(vehRows.length+1).padStart(3,"0")}`,plate,...[4,5,6,7,8,9,10,11,12,13].map(c=>clean(vehicleLegacy.getCell(r,c).value)),r]);}
tableSheet("Vehiculos_MVR","Inventario móvil preparado para diferenciar MVR, cámaras y conectividad celular.",vehHeaders,vehRows,"tblVehiculos",[13,12,14,16,12,12,28,22,15,18,15,24,11]);

const projHeaders=["ID Proyecto","Línea de trabajo","Punto objetivo","Código SIIS","Alcance/traslado","Tecnología objetivo","Modelo planeado","Inversión","Estado","Avance %","Fecha planeada","Fecha implementación","Color fuente","Celda fuente","Responsable","Observaciones"];
const projRows=projects.map(p=>[p.id,p.stream,p.target,"",p.scope,p.technology,"","",p.status,p.progress,"","",p.color,p.source,"",""]);
const proj=tableSheet("Proyecto_Estructurado","El estado se derivó del color original: verde = IMPLEMENTADO. Desde esta versión el campo Estado es la fuente oficial; el color queda solo como trazabilidad.",projHeaders,projRows,"tblProyecto",[13,25,33,12,34,24,22,14,17,11,16,18,17,25,18,30]);
proj.getRange(`I5:I${projRows.length+4}`).dataValidation={rule:{type:"list",formula1:"Catalogos!$A$5:$A$9"}};
proj.getRange(`J5:J${projRows.length+4}`).format.numberFormat="0%";
proj.getRange(`I5:I${projRows.length+4}`).conditionalFormats.addCustom(`=I5="IMPLEMENTADO"`,{fill:"#DCFCE7",font:{color:"#166534",bold:true}});

const qualityRows=[];
for(const d of devices){if(d.quality!=="OK")for(const issue of d.quality.split("; "))qualityRows.push([`Q-${String(qualityRows.length+1).padStart(4,"0")}`,"DISPOSITIVO",d.id,d.location,issue,issue==="MODELO_PENDIENTE"?"ALTA":"MEDIA","PENDIENTE","Completar o validar contra DSS/inventario físico"]);}
for(const d of devices){if(!d.deviceIdDss)qualityRows.push([`Q-${String(qualityRows.length+1).padStart(4,"0")}`,"DISPOSITIVO",d.id,d.location,"SIN_VINCULO_DSS_UNIVOCO","MEDIA","PENDIENTE","Conciliar por nombre, ubicación y serial; no asignar solo por una IP compartida"]);}
for(const l of locations){if(l.match!=="COINCIDENCIA_EXACTA")qualityRows.push([`Q-${String(qualityRows.length+1).padStart(4,"0")}`,"UBICACION",l.id,l.name,"PENDIENTE_CONCILIACION","ALTA","PENDIENTE","Validar alias y asignar Código SIIS al dispositivo"]);}
tableSheet("Calidad_Datos","Cola accionable para depurar el maestro antes de promoverlo a la base canónica de Skylab.",["ID Hallazgo","Entidad","ID registro","Punto","Hallazgo","Prioridad","Estado","Acción recomendada"],qualityRows,"tblCalidad",[13,15,14,28,25,12,14,42]);

const dash=addSheet("00_Resumen");title(dash,"CCTV · Maestro de infraestructura","Versión normalizada para transición a Skylab. Las hojas originales se conservan como evidencia histórica.","N");
dash.getRange("A4:N4").values=[["INDICADORES","","","","","","","","","","","","",""]];dash.getRange("A4:N4").format={fill:teal,font:{bold:true,color:white,size:12}};
const cards=[["Puntos mantenimiento",locations.length],["Dispositivos DSS",dssDevices.length],["Canales declarados",devices.reduce((a,d)=>a+(Number(d.channels)||0),0)],["Modelos DSS",dssDevices.filter(d=>d.model).length],["Proyectos",projects.length],["Implementados",projects.filter(p=>p.status==="IMPLEMENTADO").length],["Avance proyecto",projects.length?projects.filter(p=>p.status==="IMPLEMENTADO").length/projects.length:0],["Hallazgos calidad",qualityRows.length]];
cards.forEach((c,i)=>{const col=1+(i%4)*3,row=6+Math.floor(i/4)*4;dash.getRangeByIndexes(row-1,col-1,2,2).values=[[c[0],""],[c[1],""]];dash.mergeCells(`${addr(col)}${row}:${addr(col+1)}${row}`);dash.mergeCells(`${addr(col)}${row+1}:${addr(col+1)}${row+1}`);dash.getRange(`${addr(col)}${row}:${addr(col+1)}${row}`).format={fill:light,font:{bold:true,color:gray},horizontalAlignment:"center"};dash.getRange(`${addr(col)}${row+1}:${addr(col+1)}${row+1}`).format={fill:white,font:{bold:true,color:i===6?teal:navy,size:18},horizontalAlignment:"center"};if(i===6)dash.getRange(`${addr(col)}${row+1}`).format.numberFormat="0%";});
dash.getRange("A15:B20").values=[["Estado","Cantidad"],["Implementado",projects.filter(p=>p.status==="IMPLEMENTADO").length],["Planificado",projects.filter(p=>p.status==="PLANIFICADO").length],["En ejecución",0],["Pausado",0],["Cancelado",0]];dash.getRange("A15:B15").format={fill:teal,font:{bold:true,color:white}};dash.getRange("A:B").format.columnWidth=22;
const chart=dash.charts.add("bar",dash.getRange("A15:B20"));chart.setPosition("D15","L31");chart.title="Avance del proyecto por estado";chart.hasLegend=false;chart.titleTextStyle.fontSize=13;
dash.getRange("A33:N37").values=[["PRÓXIMOS PASOS","","","","","","","","","","","","",""] ,["1","Validar los vínculos pendientes entre el maestro heredado y los 111 activos del DSS.","","","","","","","","","","","",""] ,["2","Completar seriales, firmware y estado en línea mediante integración controlada con DSS.","","","","","","","","","","","",""] ,["3","Asignar Código SIIS y consumir estas tablas desde el submódulo CCTV de Skylab.","","","","","","","","","","","",""] ,["4","Mantener credenciales fuera del inventario y usar únicamente variables de entorno.","","","","","","","","","","","",""]];dash.getRange("A33:N33").format={fill:teal,font:{bold:true,color:white}};for(let r=34;r<=37;r++){dash.mergeCells(`B${r}:N${r}`);dash.getRange(`B${r}:N${r}`).format={wrapText:true,verticalAlignment:"center"};dash.getRange(`A${r}:N${r}`).format.rowHeight=24;}dash.getRange("A:N").format.columnWidth=13;

await fs.mkdir(path.dirname(outputPath),{recursive:true});
const out=await SpreadsheetFile.exportXlsx(wb);await out.save(outputPath);
console.log(JSON.stringify({outputPath,counts:{locations:locations.length,devices:devices.length,dssDevices:dssDevices.length,dssModels:dssDevices.filter(d=>d.model).length,dssLinked:devices.filter(d=>d.deviceIdDss).length,projects:projects.length,implemented:projects.filter(p=>p.status==="IMPLEMENTADO").length,quality:qualityRows.length}},null,2));
