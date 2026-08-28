import fs from 'node:fs/promises';
import path from 'node:path';
import { createRequire } from 'node:module';
import { Workbook, SpreadsheetFile } from '@oai/artifact-tool';

const require = createRequire(import.meta.url);
const { DatabaseSync } = require('node:sqlite');
const [dbArg, dssArg, outputArg] = process.argv.slice(2);
if (!dbArg || !dssArg || !outputArg) throw new Error('Uso: build-siis-review-workbook.mjs <db> <dss-json> <salida.xlsx>');
const dbPath = path.resolve(dbArg), dssPath = path.resolve(dssArg), outputPath = path.resolve(outputArg);
const clean = value => value == null ? '' : String(value).trim();
const ip = value => clean(value).match(/\b(?:\d{1,3}\.){3}\d{1,3}\b/)?.[0] || '';
const col = n => { let s=''; while(n){n--;s=String.fromCharCode(65+n%26)+s;n=Math.floor(n/26);} return s; };

const db = new DatabaseSync(dbPath, { readOnly: true });
const siisRun = db.prepare("SELECT id FROM siis_sync_runs WHERE status='SUCCESS' ORDER BY id DESC LIMIT 1").get();
const importRun = db.prepare("SELECT id FROM import_runs WHERE status='SUCCESS' ORDER BY id DESC LIMIT 1").get();
if (!siisRun || !importRun) throw new Error('Faltan ejecuciones exitosas de SIIS o inventario');
const rows = db.prepare(`SELECT s.siis_code,s.name_raw AS siis_name,s.online,
  m.id AS maintenance_id,m.point_name_raw,m.region_raw,m.siis_code AS maintenance_code,
  i.location_name_raw AS inventory_name,i.haplite_ip,i.recorder_ip,
  c.match_method,c.score,c.decision
  FROM stg_siis_locations s
  JOIN stg_maintenance_points m ON m.siis_code=s.siis_code AND m.import_run_id=?
  LEFT JOIN reconciliation_candidates c ON c.maintenance_point_id=m.id AND c.import_run_id=m.import_run_id
  LEFT JOIN stg_inventory_locations i ON i.id=c.inventory_location_id
  WHERE s.sync_run_id=? AND COALESCE(c.decision,'')<>'AUTO_EXACT'
  UNION ALL
  SELECT NULL,NULL,NULL,m.id,m.point_name_raw,m.region_raw,m.siis_code,
  i.location_name_raw,i.haplite_ip,i.recorder_ip,c.match_method,c.score,c.decision
  FROM stg_maintenance_points m
  LEFT JOIN reconciliation_candidates c ON c.maintenance_point_id=m.id AND c.import_run_id=m.import_run_id
  LEFT JOIN stg_inventory_locations i ON i.id=c.inventory_location_id
  WHERE m.import_run_id=? AND m.siis_code<>'' AND NOT EXISTS (
    SELECT 1 FROM stg_siis_locations s WHERE s.sync_run_id=? AND s.siis_code=m.siis_code)
  ORDER BY 7,5`).all(importRun.id, siisRun.id, importRun.id, siisRun.id);
db.close();
if (rows.length !== 45) throw new Error(`Se esperaban 45 casos accionables y se obtuvieron ${rows.length}`);

const dss = JSON.parse(await fs.readFile(dssPath, 'utf8')).devices;
const dssByIp = new Map();
for (const device of dss) { const address=ip(device.export?.address); if(!address)continue; if(!dssByIp.has(address))dssByIp.set(address,[]); dssByIp.get(address).push(device); }
const enriched = rows.map((r,index) => {
  const addresses=[ip(r.haplite_ip),ip(r.recorder_ip)].filter(Boolean);
  const matches=[...new Map(addresses.flatMap(a=>dssByIp.get(a)||[]).map(d=>[d.deviceIdDss,d])).values()];
  return {
    caseId:`REV-${String(index+1).padStart(3,'0')}`,
    pendingType:r.siis_code?'ALIAS_INVENTARIO':'CODIGO_AUSENTE_EN_SIIS',
    code:clean(r.siis_code||r.maintenance_code), status:r.siis_code?(r.online?'EN_LINEA':'FUERA_DE_LINEA'):'NO_DEVUELTO_POR_SIIS',
    siisName:clean(r.siis_name), maintenanceName:clean(r.point_name_raw), zone:clean(r.region_raw), inventoryName:clean(r.inventory_name),
    method:clean(r.match_method), score:r.score==null?'':Number(r.score),
    dssIds:matches.map(d=>d.deviceIdDss).join(', '), dssModels:[...new Set(matches.map(d=>d.model).filter(Boolean))].join(', '),
  };
});

const wb=Workbook.create();
const navy='#15324A', teal='#0F766E', light='#E8F1F5', white='#FFFFFF', gray='#64748B', amber='#F59E0B', green='#16A34A', red='#DC2626';
function title(sheet,text,subtitle,lastCol){sheet.mergeCells(`A1:${lastCol}1`);sheet.getRange('A1').values=[[text]];sheet.getRange(`A1:${lastCol}1`).format={fill:navy,font:{bold:true,color:white,size:18},verticalAlignment:'center'};sheet.getRange('A1').format.rowHeight=34;sheet.mergeCells(`A2:${lastCol}2`);sheet.getRange('A2').values=[[subtitle]];sheet.getRange(`A2:${lastCol}2`).format={fill:light,font:{italic:true,color:gray,size:10},wrapText:true};sheet.getRange('A2').format.rowHeight=32;sheet.showGridLines=false;}

const review=wb.worksheets.add('Revision');
const headers=['ID caso','Tipo pendiente','Código SIIS','Estado SIIS','Nombre SIIS','Nombre mantenimiento','Zona','Nombre inventario','Método inventario','Confianza','Device ID DSS sugerido','Modelo DSS sugerido','Decisión','Nombre canónico aprobado','Código SIIS corregido','Observaciones','Revisado por','Fecha revisión'];
title(review,'Revisión de conciliación SIIS · CCTV','Completar las columnas verdes. No cambies los datos de evidencia; cada decisión será importada y auditada.',col(headers.length));
const data=enriched.map(r=>[r.caseId,r.pendingType,r.code,r.status,r.siisName,r.maintenanceName,r.zone,r.inventoryName,r.method,r.score,r.dssIds,r.dssModels,'PENDIENTE','','','','','']);
review.getRangeByIndexes(3,0,data.length+1,headers.length).values=[headers,...data];
review.getRange(`A4:${col(headers.length)}4`).format={fill:teal,font:{bold:true,color:white},wrapText:true,verticalAlignment:'center'};
review.getRange(`A4:${col(headers.length)}4`).format.rowHeight=34;
review.getRange(`A5:${col(headers.length)}${data.length+4}`).format={verticalAlignment:'top',wrapText:true};
review.tables.add(`A4:${col(headers.length)}${data.length+4}`,true,'tblRevisionSiis').style='TableStyleMedium2';
review.freezePanes.freezeRows(4);review.freezePanes.freezeColumns(3);
const widths=[12,24,13,20,30,30,14,30,22,12,23,29,24,31,21,38,18,17];
widths.forEach((w,i)=>review.getRange(`${col(i+1)}:${col(i+1)}`).format.columnWidth=w);
review.getRange(`J5:J${data.length+4}`).format.numberFormat='0%';
review.getRange(`M5:R${data.length+4}`).format.fill='#ECFDF5';
review.getRange(`M5:M${data.length+4}`).dataValidation={rule:{type:'list',values:['PENDIENTE','MISMO_PUNTO','PUNTO_DIFERENTE','CODIGO_CAMBIO','PUNTO_CERRADO','REQUIERE_VERIFICACION']}};
review.getRange(`M5:M${data.length+4}`).conditionalFormats.addCustom('=M5="MISMO_PUNTO"',{fill:'#DCFCE7',font:{color:'#166534',bold:true}});
review.getRange(`M5:M${data.length+4}`).conditionalFormats.addCustom('=M5="PENDIENTE"',{fill:'#FEF3C7',font:{color:'#92400E'}});
review.getRange(`M5:M${data.length+4}`).conditionalFormats.addCustom('=M5="PUNTO_DIFERENTE"',{fill:'#FEE2E2',font:{color:'#991B1B'}});
review.getRange(`R5:R${data.length+4}`).format.numberFormat='yyyy-mm-dd';

const instructions=wb.worksheets.add('Instrucciones');
title(instructions,'Guía de revisión','Este archivo contiene 39 alias con código confirmado y 6 códigos que SIIS no devolvió. La identidad se decide por conocimiento operativo, no por similitud automática.','H');
instructions.getRange('A4:H4').values=[['RESUMEN','','','','','','','']];instructions.getRange('A4:H4').format={fill:teal,font:{bold:true,color:white}};
const cards=[['Casos accionables',`=COUNTA('Revision'!$A$5:$A$49)`],['Alias por revisar',`=COUNTIF('Revision'!$B$5:$B$49,"ALIAS_INVENTARIO")`],['Códigos ausentes',`=COUNTIF('Revision'!$B$5:$B$49,"CODIGO_AUSENTE_EN_SIIS")`],['Decisiones pendientes',`=COUNTIF('Revision'!$M$5:$M$49,"PENDIENTE")`]];
cards.forEach((item,i)=>{const c=1+i*2;instructions.mergeCells(`${col(c)}6:${col(c+1)}6`);instructions.mergeCells(`${col(c)}7:${col(c+1)}7`);instructions.getRange(`${col(c)}6`).values=[[item[0]]];instructions.getRange(`${col(c)}7`).formulas=[[item[1]]];instructions.getRange(`${col(c)}6:${col(c+1)}6`).format={fill:light,font:{bold:true,color:gray},horizontalAlignment:'center'};instructions.getRange(`${col(c)}7:${col(c+1)}7`).format={font:{bold:true,color:navy,size:18},horizontalAlignment:'center'};});
instructions.getRange('A10:H10').values=[['DECISIONES Y CUÁNDO USARLAS','','','','','','','']];instructions.getRange('A10:H10').format={fill:teal,font:{bold:true,color:white}};
instructions.getRange('A11:H16').values=[
  ['MISMO_PUNTO','Las tres fuentes representan el mismo lugar. Completa el nombre canónico.','','','','','',''],
  ['PUNTO_DIFERENTE','El candidato del inventario corresponde a otro lugar. Explica en Observaciones.','','','','','',''],
  ['CODIGO_CAMBIO','El punto sigue vigente, pero debe usarse otro código SIIS. Completa Código SIIS corregido.','','','','','',''],
  ['PUNTO_CERRADO','El punto ya no opera. Registra la evidencia o fecha conocida en Observaciones.','','','','','',''],
  ['REQUIERE_VERIFICACION','No hay información suficiente para decidir con seguridad.','','','','','',''],
  ['PENDIENTE','Todavía no revisado. El archivo no se importará como decisión final.','','','','','',''],
];
for(let r=11;r<=16;r++){instructions.mergeCells(`B${r}:H${r}`);instructions.getRange(`A${r}`).format.font={bold:true,color:navy};instructions.getRange(`A${r}:H${r}`).format={wrapText:true,verticalAlignment:'center'};instructions.getRange(`A${r}:H${r}`).format.rowHeight=30;}
instructions.getRange('A19:H19').values=[['PASOS','','','','','','','']];instructions.getRange('A19:H19').format={fill:teal,font:{bold:true,color:white}};
instructions.getRange('A20:H23').values=[['1','Abre la hoja Revision y filtra por Tipo pendiente o Zona.','','','','','',''],['2','Selecciona una Decisión en cada fila y completa los campos verdes aplicables.','','','','','',''],['3','Para MISMO_PUNTO escribe el nombre que quieres ver en Skylab.','','','','','',''],['4','Guarda el archivo sin cambiar el nombre ni eliminar columnas.','','','','','','']];
for(let r=20;r<=23;r++){instructions.mergeCells(`B${r}:H${r}`);instructions.getRange(`A${r}:H${r}`).format={wrapText:true,verticalAlignment:'center'};instructions.getRange(`A${r}:H${r}`).format.rowHeight=26;}
instructions.getRange('A:H').format.columnWidth=17;instructions.getRange('A:A').format.columnWidth=25;instructions.getRange('B:B').format.columnWidth=24;

const catalog=wb.worksheets.add('Catalogos');title(catalog,'Catálogos','Valores controlados usados por las listas de revisión.','C');
catalog.getRange('A4:C10').values=[['DECISION','SIGNIFICADO','REQUIERE'],['PENDIENTE','Sin revisar',''],['MISMO_PUNTO','Las fuentes representan el mismo lugar','Nombre canónico'],['PUNTO_DIFERENTE','El candidato pertenece a otro lugar','Observaciones'],['CODIGO_CAMBIO','El punto utiliza otro código SIIS','Código corregido'],['PUNTO_CERRADO','El punto dejó de operar','Observaciones'],['REQUIERE_VERIFICACION','No hay evidencia suficiente','Observaciones']];
catalog.getRange('A4:C4').format={fill:teal,font:{bold:true,color:white}};catalog.getRange('A:C').format.columnWidth=34;catalog.getRange('A4:C10').format.wrapText=true;catalog.tables.add('A4:C10',true,'tblCatalogoDecisiones').style='TableStyleMedium2';

await fs.mkdir(path.dirname(outputPath),{recursive:true});
const output=await SpreadsheetFile.exportXlsx(wb);await output.save(outputPath);
console.log(JSON.stringify({outputPath,cases:data.length,alias:data.filter(r=>r[1]==='ALIAS_INVENTARIO').length,missing:data.filter(r=>r[1]==='CODIGO_AUSENTE_EN_SIIS').length},null,2));
