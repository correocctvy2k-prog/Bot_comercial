'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { isProjectExecutionEvidence, evidenceByLocation } = require('../platform/project-evidence');

test('acepta instalaciones y cambios tecnológicos CCTV como evidencia', () => {
  assert.equal(isProjectExecutionEvidence('Montaje CCTV en Santa Teresita II'), true);
  assert.equal(isProjectExecutionEvidence('Cambio de tegnologia CCTV en Droguería Prado II'), true);
  assert.equal(isProjectExecutionEvidence('Cambio de K35 por NVR en Rivera Escobar'), true);
});

test('rechaza mantenimientos ordinarios y desmontajes', () => {
  assert.equal(isProjectExecutionEvidence('Cambio de sensor PIR en Droguería Prado II'), false);
  assert.equal(isProjectExecutionEvidence('Revisión de cámara en Oficina Florida'), false);
  assert.equal(isProjectExecutionEvidence('Desmontar sistema CCTV por cierre del punto'), false);
});

test('conserva la evidencia más reciente por ubicación', () => {
  const evidence = evidenceByLocation([
    { locationId: 'A', title: 'Instalación CCTV', occurredAt: '2025-08-01' },
    { locationId: 'A', title: 'Cambio de K35 por NVR', occurredAt: '2025-09-01' },
  ]);
  assert.equal(evidence.get('A').occurredAt, '2025-09-01');
});
