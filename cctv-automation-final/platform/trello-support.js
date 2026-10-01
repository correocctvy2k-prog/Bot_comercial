'use strict';
const crypto=require('node:crypto');
const normalize=value=>String(value||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toUpperCase().replace(/[^A-Z0-9]+/g,' ').trim();
function classify(title=''){const text=normalize(title);if(/INSTAL|MONTAJE|TENDIDO|ADECUACION/.test(text))return'INSTALLATION';if(/CAMBIO DE TECNOLOGIA|NVR|CAMARA|CCTV|VIDEO/.test(text))return'CCTV';if(/ALARMA|PANICO|PIR|SIRENA|SENSOR MAGNETICO|OSZFORD|PARADOX/.test(text))return'ALARM';if(/HAPLITE|ROUTER|RED|CABLEADO ESTRUCTURADO/.test(text))return'NETWORK';if(/FACIAL|ZKTECO|CONTROL DE ACCESO|LECTOR/.test(text))return'ACCESS_CONTROL';if(/UPS|BATERIA|FUENTE DE PODER|FUENTE DE ALIMENTACION/.test(text))return'POWER';return'GENERAL_SUPPORT';}
function locationMatcher(locations,aliases){
  // spec 0018: una tarjeta real puede cubrir varios puntos (p.ej. una ronda de
  // mantenimiento que menciona 6 puntos de venta en el mismo titulo) -- se
  // devuelven TODOS los puntos cuyo nombre/alias aparece, no solo el de
  // nombre mas largo. Para evitar que un nombre corto que es prefijo/sufijo de
  // otro punto distinto (ej. "OFICINA PRINCIPAL" dentro de "OFICINA PRINCIPAL
  // AMAIME", 43 pares reales confirmados en los datos) se cuente como una
  // mencion real aparte, una coincidencia se descarta si su tramo de texto
  // queda totalmente contenido dentro de la coincidencia de OTRO punto con un
  // nombre mas largo en esa misma posicion -- menciones realmente
  // independientes (distintas posiciones del titulo) si se conservan todas.
  const candidates=[];
  for(const location of locations){
    const names=new Set([location.canonical_name,...(aliases.get(location.id)||[])]);
    for(const name of names){
      const key=normalize(name);
      if(key.length>=5)candidates.push({location,key});
    }
  }
  return title=>{
    const text=` ${normalize(title)} `;
    const occurrences=[];
    for(const c of candidates){
      const needle=` ${c.key} `;
      let from=0,idx;
      while((idx=text.indexOf(needle,from))!==-1){
        occurrences.push({location:c.location,key:c.key,start:idx+1,end:idx+1+c.key.length});
        from=idx+1;
      }
    }
    const kept=occurrences.filter(o=>!occurrences.some(other=>
      other.location.id!==o.location.id&&
      other.key.length>o.key.length&&
      other.start<=o.start&&o.end<=other.end
    ));
    const locationsFound=[...new Map(kept.map(o=>[o.location.id,o.location])).values()];
    return locationsFound.length
      ?{locations:locationsFound,status:'LINKED_NAME_EXACT'}
      :{locations:[],status:'UNLINKED'};
  };
}
function normalizeCards(lists,cards,board,matchLocation,overrides=new Map()){
  // spec 0018: locations (plural) es la lista completa de puntos vinculados --
  // los que el matcher automatico encontro en el titulo, mas el vinculo
  // manual si existe (se agrega, no reemplaza: un operador puede fijar un
  // punto adicional que el titulo no menciona textualmente sin perder los que
  // si se detectaron solos). locationId/identityStatus (singular) se
  // conservan por compatibilidad con los consumidores que no se tocan en esta
  // spec (evidenceByLocation, notificaciones) -- locationId es el primero de
  // la lista.
  const listById=new Map(lists.map(x=>[x.id,x]));
  return cards.map(card=>{
    const list=listById.get(card.idList);
    const override=overrides.get(card.id);
    const autoMatch=matchLocation(card.name);
    const locationMap=new Map(autoMatch.locations.map(location=>[location.id,{...location,linkSource:'MATCHED'}]));
    if(override)locationMap.set(override.id,{...override,linkSource:'MANUAL'});
    const locations=[...locationMap.values()];
    const identityStatus=override?'LINKED_MANUAL':autoMatch.status;
    const pending=/PENDIENT/i.test(list?.name||'');
    const attachments=(card.attachments||[]).filter(x=>String(x.mimeType||'').startsWith('image/')).map(x=>({id:x.id,name:x.name||'Evidencia',mimeType:x.mimeType,bytes:x.bytes||null,url:x.url,previews:x.previews||[]}));
    return{
      id:crypto.createHash('sha256').update(`TRELLO_SUPPORT:${card.id}`).digest('hex').slice(0,32),
      sourceCardId:card.id,
      sourceListId:card.idList,
      sourceBoardId:board.id,
      sourceListName:list?.name||'SIN LISTA',
      sourceBoardName:board.name,
      sourceBoardUrl:board.url||null,
      sourceCardUrl:card.shortUrl||null,
      title:card.name,
      description:card.desc||null,
      activityType:classify(card.name),
      status:pending?'PENDING':'COMPLETED',
      dueAt:card.due||null,
      dueComplete:!!card.dueComplete,
      sourceUpdatedAt:card.dateLastActivity||null,
      locationId:locations[0]?.id||null,
      identityStatus,
      locations,
      members:(card.members||[]).map(x=>({id:x.id,name:x.fullName||x.username})),
      payload:{labels:card.labels||[],checklists:card.checklists||[],attachments,coverAttachmentId:card.cover?.idAttachment||null}
    };
  });
}
const fingerprint=items=>crypto.createHash('sha256').update(JSON.stringify(items.map(x=>[x.sourceCardId,x.sourceListId,x.title,x.dueAt,x.dueComplete,x.sourceUpdatedAt]))).digest('hex');
module.exports={normalize,classify,locationMatcher,normalizeCards,fingerprint};
