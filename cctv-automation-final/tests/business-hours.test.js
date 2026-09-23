const test = require('node:test');
const assert = require('node:assert/strict');
const { parseClock, isWithinOperationalWindow } = require('../platform/business-hours');

function bogota(hour, minute) {
  // UTC-5 fijo (America/Bogota no usa horario de verano).
  return new Date(Date.UTC(2026, 0, 1, hour + 5, minute));
}

test('parseClock rechaza horas fuera de rango', () => {
  assert.throws(() => parseClock('25:00'), /Hora fuera de rango/);
  assert.throws(() => parseClock('abc'), /Hora inválida/);
});

test('respeta el borde de inicio (inclusive) y fin (exclusivo) del default 05:30-22:30', () => {
  assert.equal(isWithinOperationalWindow(bogota(5, 0)), false);
  assert.equal(isWithinOperationalWindow(bogota(5, 30)), true);
  assert.equal(isWithinOperationalWindow(bogota(12, 0)), true);
  assert.equal(isWithinOperationalWindow(bogota(22, 29)), true);
  assert.equal(isWithinOperationalWindow(bogota(22, 30)), false);
  assert.equal(isWithinOperationalWindow(bogota(23, 0)), false);
});

test('ventana configurable por env', () => {
  const env = { POINTS_OPERATIONAL_WINDOW_START: '08:00', POINTS_OPERATIONAL_WINDOW_END: '18:00' };
  assert.equal(isWithinOperationalWindow(bogota(7, 59), env), false);
  assert.equal(isWithinOperationalWindow(bogota(8, 0), env), true);
  assert.equal(isWithinOperationalWindow(bogota(17, 59), env), true);
  assert.equal(isWithinOperationalWindow(bogota(18, 0), env), false);
});
