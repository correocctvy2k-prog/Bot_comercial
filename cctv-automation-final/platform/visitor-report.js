const crypto = require('node:crypto');

const decode = value => String(value||'').replace(/<br\s*\/?\s*>/gi,' ').replace(/<[^>]+>/g,' ').replace(/&nbsp;/gi,' ').replace(/&amp;/gi,'&').replace(/&quot;/gi,'"').replace(/&#(\d+);/g,(_,n)=>String.fromCharCode(Number(n))).replace(/\s+/g,' ').trim();
const normalize = value => String(value||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toUpperCase().replace(/\s+/g,' ').trim();
const maskDocument = value => {const clean=String(value||'').replace(/\s+/g,'');return clean ? `${'*'.repeat(Math.max(3,clean.length-4))}${clean.slice(-4)}` : null;};
const visitorKey = (type,number) => crypto.createHash('sha256').update(`${normalize(type)}|${normalize(number)}`).digest('hex');
const parseLocalDateTime = value => {const match=String(value||'').match(/(\d{4})-(\d{2})-(\d{2})\s+(\d{2}):(\d{2}):(\d{2})/);return match?`${match[1]}-${match[2]}-${match[3]}T${match[4]}:${match[5]}:${match[6]}-05:00`:null;};

function parseVisitorTable(tableHtml){
  const source=String(tableHtml||''),bodyRows=[...source.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)].map(row=>[...row[1].matchAll(/<t[hd]\b[^>]*>([\s\S]*?)<\/t[hd]>/gi)].map(cell=>decode(cell[1]))).filter(row=>row.length),beforeFirstRow=source.split(/<tr\b/i)[0],directHeaders=[...beforeFirstRow.matchAll(/<th\b[^>]*>([\s\S]*?)<\/th>/gi)].map(cell=>decode(cell[1])),rows=directHeaders.length?[directHeaders,...bodyRows]:bodyRows;
  if(rows.length<2)return [];
  const headers=rows[0].map(normalize),index=label=>headers.findIndex(value=>value===normalize(label));
  if(index('Número')<0||index('Hora de Entrada')<0)return [];
  const at=(row,label)=>row[index(label)]||null;
  return rows.slice(1).map((row,sourceRow)=>{
    const documentType=at(row,'Tipo de Documento'),documentNumber=at(row,'Número'),entryAt=parseLocalDateTime(at(row,'Hora de Entrada')),exitAt=parseLocalDateTime(at(row,'Hora de Salida'));
    if(!documentNumber&&!entryAt)return null;
    return {sourceRow:sourceRow+1,visitorExternalId:at(row,'ID de Visitante'),visitorKey:visitorKey(documentType,documentNumber),documentType,documentMasked:maskDocument(documentNumber),firstName:at(row,'Nombre'),lastName:at(row,'Apellido'),hostFirstName:at(row,'Nombre del Anfitrión'),hostLastName:at(row,'Apellido del Anfitrión'),reason:at(row,'Razón de Visita')||'Sin clasificar',status:at(row,'Estado de la Visita')||'Sin estado',entryAt,entryPlace:at(row,'Lugar de Entrada'),exitAt,exitPlace:at(row,'Lugar de Salida'),reportDate:(entryAt||exitAt)?.slice(0,10)||null};
  }).filter(Boolean);
}

function parseVisitorReports(html){
  return [...String(html||'').matchAll(/<table\b[^>]*>([\s\S]*?)<\/table>/gi)]
    .map(match=>parseVisitorTable(match[1]))
    .filter(rows=>rows.length);
}

function parseVisitorReport(html){return parseVisitorReports(html)[0]||[];}

module.exports={parseVisitorReport,parseVisitorReports,visitorKey,maskDocument,parseLocalDateTime};
