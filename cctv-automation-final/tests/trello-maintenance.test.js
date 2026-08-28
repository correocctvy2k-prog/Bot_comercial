const test = require('node:test');
const assert = require('node:assert/strict');
const {parseWorkItems, fingerprint} = require('../platform/trello-maintenance');

test('normaliza un check item Trello con código SIIS y fecha', () => {
  const cards=[{id:'card-1',name:'AGOSTO',due:null,checklists:JSON.stringify([{id:'check-1',checkItems:[{id:'item-1',name:'3185 RIVERA ESCOBAR - 22/8',state:'complete',pos:1}]}])}];
  const location={id:'loc-1',name:'RIVERA ESCOBAR',zone:'PALMIRA'};
  const items=parseWorkItems(cards,{boardId:'board',board:'CCTV',listId:'list',list:'Mantenimiento CCTV 2026'},new Map([['3185',location]]));
  assert.equal(items.length,1);
  assert.equal(items[0].scheduledAt,'2026-08-22');
  assert.equal(items[0].status,'COMPLETED');
  assert.equal(items[0].locationId,'loc-1');
  assert.equal(items[0].identityStatus,'LINKED_SIIS');
});

test('una conciliación manual tiene prioridad sobre el código automático', () => {
  const cards=[{id:'card',name:'ENERO',checklists:JSON.stringify([{id:'check',checkItems:[{id:'item',name:'9999 PUNTO ANTIGUO - 2/1',state:'incomplete'}]}])}];
  const automatic={id:'auto'},manual={id:'manual'};
  const [item]=parseWorkItems(cards,{boardId:'b',listId:'l'},new Map([['9999',automatic]]),new Map([['item',manual]]));
  assert.equal(item.locationId,'manual');
  assert.equal(item.identityStatus,'LINKED_MANUAL');
  assert.equal(fingerprint([item]),fingerprint([item]));
});

test('una regla manual por código se reutiliza en nuevas actividades', () => {
  const cards=[{id:'card',name:'OCTUBRE',checklists:JSON.stringify([{id:'check',checkItems:[{id:'new-item',name:'1975 Oficina Amaime - 13/10',state:'incomplete'}]}])}];
  const manual={id:'office-amaime'};
  const [item]=parseWorkItems(cards,{boardId:'b',listId:'l'},new Map(),new Map([['CODE:1975',manual]]));
  assert.equal(item.locationId,'office-amaime');
  assert.equal(item.identityStatus,'LINKED_MANUAL');
});
