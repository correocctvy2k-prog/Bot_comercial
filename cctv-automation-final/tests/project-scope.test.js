'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {isInstallableTransfer,scopeAudit}=require('../platform/project-scope');

test('distingue destinos físicos de notas sobre equipos',()=>{
  assert.equal(isInstallableTransfer('Berlin - Palmira'),true);
  assert.equal(isInstallableTransfer('NVR queda para soporte o punto sencillo'),false);
  assert.equal(isInstallableTransfer('Solo se cambia NVR'),false);
  assert.equal(isInstallableTransfer('Se desmonta tecnología obsoleta'),false);
});

test('el alcance físico suma financiados y destinos reutilizados sin duplicar fases',()=>{
  const rows=[
    {project_stream:'HIGH_VALUE_AI_SPORTBOOK',investment:10,transferScope:'Berlin - Palmira'},
    {project_stream:'HIGH_VALUE_AI_SPORTBOOK',investment:10,transferScope:'Solo se cambia NVR'},
    {project_stream:'HIGH_VALUE_AI',investment:5,transferScope:null},
    {project_stream:'REGIONAL_SUMMARY_OR_REUSE',investment:null,transferScope:null},
  ];
  assert.deepEqual(scopeAudit(rows,3),{financedTargets:3,modernizationTargets:2,singleCameraTargets:1,reuseDestinations:1,enumeratedInterventions:4,declaredScope:3,scopeVariance:1,reuseRows:[rows[0]]});
});
