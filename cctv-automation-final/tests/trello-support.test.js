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
  const result=match('Instalación CCTV punto Parque Pradera');
  assert.equal(result.locations.length,1);
  assert.equal(result.locations[0].id,'1');
  assert.equal(result.status,'LINKED_NAME_EXACT');
  assert.equal(match('Soporte general en auditorio').status,'UNLINKED');
  const [card]=normalizeCards([{id:'pending',name:'Lista de tareas pendientes'}],[{id:'c',idList:'pending',name:'Instalación CCTV punto Parque Pradera'}],{id:'b',name:'Soporte'},match);
  assert.equal(card.status,'PENDING');
  assert.equal(card.locationId,'1');
  assert.equal(card.locations.length,1);
});

test('spec 0018: una tarjeta que menciona varios puntos reales se vincula a todos, no solo al de nombre mas largo',()=>{
  const locations=[
    {id:'cementerio',canonical_name:'CEMENTERIO CENTRAL PALMIRA'},
    {id:'popular',canonical_name:'POPULAR MODELO II'},
    {id:'mariacano',canonical_name:'MARIACANO'},
  ];
  const aliases=new Map([['cementerio',['Cementerio']],['popular',['Popular Modelo']]]);
  const match=locationMatcher(locations,aliases);
  const result=match('Cambio de direccionamiento en los puntos de venta: Cementerio; mariacano, popular modelo');
  const ids=result.locations.map(l=>l.id).sort();
  assert.deepEqual(ids,['cementerio','mariacano','popular']);
  assert.equal(result.status,'LINKED_NAME_EXACT');
});

test('spec 0018: un nombre corto que es prefijo de otro punto distinto no se cuenta como mencion aparte (43 colisiones reales confirmadas en produccion)',()=>{
  const locations=[
    {id:'principal',canonical_name:'OFICINA PRINCIPAL'},
    {id:'principal-amaime',canonical_name:'OFICINA PRINCIPAL AMAIME'},
  ],aliases=new Map();
  const match=locationMatcher(locations,aliases);

  const onlyLong=match('Se realizó cambio de UPS en Oficina Principal Amaime');
  assert.deepEqual(onlyLong.locations.map(l=>l.id),['principal-amaime'],
    'el titulo solo menciona el punto largo -- el corto no debe colarse por ser su prefijo');

  const onlyShort=match('Revisión de cámaras en Oficina Principal');
  assert.deepEqual(onlyShort.locations.map(l=>l.id),['principal']);

  const both=match('Ronda: Oficina Principal y también Oficina Principal Amaime en la misma visita');
  const ids=both.locations.map(l=>l.id).sort();
  assert.deepEqual(ids,['principal','principal-amaime'],
    'menciones genuinamente independientes (dos apariciones separadas en el texto) si deben contarse ambas');
});

test('spec 0018: un alias generico de una sola palabra no vincula falsamente otro punto con nombre mas especifico en el mismo texto (caso real: Iglesia)',()=>{
  const locations=[
    {id:'iglesia-vgorgona',canonical_name:'IGLESIA V.GORGONA'},
    {id:'prado-iglesia',canonical_name:'PRADO IGLESIA II'},
  ];
  const aliases=new Map([['iglesia-vgorgona',['Iglesia']],['prado-iglesia',['Prado Iglesia']]]);
  const match=locationMatcher(locations,aliases);

  const pradoCard=match('Instalación CCTV con sensor y botón de pánico en el punto Prado Iglesia');
  assert.deepEqual(pradoCard.locations.map(l=>l.id),['prado-iglesia'],
    'el alias generico "Iglesia" no debe colarse cuando el texto en realidad nombra Prado Iglesia II');

  const bareWord=match('Revisión de alarma en Iglesia');
  assert.deepEqual(bareWord.locations.map(l=>l.id),['iglesia-vgorgona'],
    'sin un nombre mas especifico presente, el alias generico sigue siendo el unico candidato real');
});

test('spec 0018: el vinculo manual se agrega a los automaticos, no los reemplaza',()=>{
  const locations=[{id:'a',canonical_name:'PUNTO A'},{id:'b',canonical_name:'PUNTO B'}],aliases=new Map();
  const match=locationMatcher(locations,aliases);
  const overrides=new Map([['c',{id:'b',canonical_name:'PUNTO B'}]]);
  const [card]=normalizeCards(
    [{id:'list',name:'Hecho'}],
    [{id:'c',idList:'list',name:'Trabajo en Punto A'}],
    {id:'board',name:'Soporte'},
    match,
    overrides,
  );
  const ids=card.locations.map(l=>l.id).sort();
  assert.deepEqual(ids,['a','b'],'el override agrega PUNTO B sin perder PUNTO A detectado en el titulo');
  assert.equal(card.identityStatus,'LINKED_MANUAL');
});
