const test=require('node:test');
const assert=require('node:assert/strict');
const config=require('../config/dss-physical-sites.json');

test('Edificio Principal comparte apertura 2220 y 3055, pero no Ganador',()=>{
  const site=config.sites.find(item=>item.id==='SITE-EDIFICIO-PPAL-PALMIRA');
  assert.ok(site);
  assert.equal(site.deviceIds.length,8);
  const byCode=new Map(site.members.map(item=>[item.siisCode,item]));
  assert.equal(byCode.get('2220').openingGroup,byCode.get('3055').openingGroup);
  assert.equal(byCode.get('2220').openingPolicy,'ANY_MEMBER_OPENS_ALL');
  assert.notEqual(byCode.get('2220').openingGroup,byCode.get('3761').openingGroup);
  assert.equal(byCode.get('3761').openingPolicy,'INDEPENDENT');
});

test('Oficina Pradera registra NVR y DVR para los códigos 2039 y 3061',()=>{
  const site=config.sites.find(item=>item.id==='SITE-OFICINA-PRADERA');
  assert.deepEqual(site.deviceIds.sort(),['1000046','1000055']);
  assert.deepEqual(site.members.map(item=>item.siisCode).sort(),['2039','3061']);
  assert.ok(site.members.every(item=>item.openingPolicy==='ANY_MEMBER_OPENS_ALL'));
});
