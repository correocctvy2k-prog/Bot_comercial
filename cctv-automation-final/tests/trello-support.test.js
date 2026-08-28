const test=require('node:test');
const assert=require('node:assert/strict');
const {classify,locationMatcher,normalizeCards}=require('../platform/trello-support');

test('clasifica actividades frecuentes del soporte CCTV',()=>{
  assert.equal(classify('Instalación CCTV punto Parque Pradera'),'INSTALLATION');
  assert.equal(classify('Cambio de batería UPS punto Pikos II'),'POWER');
  assert.equal(classify('Cambio botón de pánico cajas'),'ALARM');
  assert.equal(classify('Cambio de Haplite Zamorano 3'),'NETWORK');
});

test('vincula solo identidades contenidas de forma exacta y no fuerza desconocidos',()=>{
  const locations=[{id:'1',canonical_name:'PARQUE PRADERA'},{id:'2',canonical_name:'TORRE JUANCHITO'}],aliases=new Map();
  const match=locationMatcher(locations,aliases);
  assert.equal(match('Instalación CCTV punto Parque Pradera').location.id,'1');
  assert.equal(match('Soporte general en auditorio').status,'UNLINKED');
  const [card]=normalizeCards([{id:'pending',name:'Lista de tareas pendientes'}],[{id:'c',idList:'pending',name:'Instalación CCTV punto Parque Pradera'}],{id:'b',name:'Soporte'},match);
  assert.equal(card.status,'PENDING');
});
