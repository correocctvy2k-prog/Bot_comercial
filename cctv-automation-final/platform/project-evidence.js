'use strict';

function isProjectExecutionEvidence(value = '') {
  const text = String(value).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  const positive = /(instal|montaj|implement|cambio.{0,35}(k35|nvr|dvr|camara|tecnolog|tegnolog)|reubic.{0,25}camara|cctv completo|deteccion.{0,30}rostro)/i.test(text);
  const maintenanceOnly = /(desmont|mantenimiento|revision|cambio de sensor|tendido.{0,30}alarma)/i.test(text)
    && !/(instal.{0,50}cctv|montaj.{0,30}cctv|cctv completo|cambio.{0,35}(k35|nvr|dvr|camara|tecnolog|tegnolog))/i.test(text);
  return positive && !maintenanceOnly;
}

function evidenceByLocation(rows = []) {
  const result = new Map();
  for (const row of rows) {
    if (!row.locationId || !isProjectExecutionEvidence(`${row.title || ''} ${row.description || ''}`)) continue;
    const current = result.get(row.locationId);
    const stamp = row.occurredAt || '';
    if (!current || stamp > (current.occurredAt || '')) result.set(row.locationId, row);
  }
  return result;
}

module.exports = { isProjectExecutionEvidence, evidenceByLocation };
