'use strict';

/**
 * Enmascarado de datos personales para la API y las descargas.
 *
 * maskPhone('573173184631') -> '57••••••4631'   (deja primeros 2 y ultimos 4)
 * maskId('1112956985')      -> '•••••••985'      (deja ultimos 3)
 *
 * Se activa/desactiva con config.maskPhones (env MASK_PHONES; 0 = mostrar todo).
 */
function maskPhone(value) {
  const s = String(value == null ? '' : value);
  if (!/^\d{5,}$/.test(s)) return s;
  if (s.length <= 6) return s.slice(0, 1) + '•'.repeat(s.length - 1);
  return `${s.slice(0, 2)}${'•'.repeat(Math.max(3, s.length - 6))}${s.slice(-4)}`;
}

function maskId(value) {
  const s = String(value == null ? '' : value);
  if (!/^\d{4,}$/.test(s)) return s;
  return `${'•'.repeat(s.length - 3)}${s.slice(-3)}`;
}

/**
 * Recorre el modelo y enmascara los campos personales conocidos (in-place).
 */
function maskModel(model) {
  if (!model || typeof model !== 'object') return model;

  const each = (arr, fn) => { if (Array.isArray(arr)) arr.forEach((row) => { if (row) fn(row); }); };

  each(model.users, (r) => {
    if (r.phone != null) r.phone = maskPhone(r.phone);
    if (r.document != null) r.document = maskId(r.document);
  });
  each(model.peopleByDay, (day) => each(day.people, (r) => {
    if (r.phone != null) r.phone = maskPhone(r.phone);
    if (r.document != null) r.document = maskId(r.document);
  }));
  each(model.topUsers, (r) => { if (r.phone != null) r.phone = maskPhone(r.phone); });
  each(model.customers, (r) => { if (r.phone != null) r.phone = maskPhone(r.phone); });
  each(model.topCustomers, (r) => { if (r.phone != null) r.phone = maskPhone(r.phone); });
  each(model.topByFlow, (r) => { if (r.phone != null) r.phone = maskPhone(r.phone); });

  [model.topUsers, model.topCustomers, model.topByFlow].forEach((arr) => {
    each(arr, (r) => { if (typeof r.label === 'string' && /^\d{5,}$/.test(r.label)) r.label = maskPhone(r.label); });
  });

  return model;
}

module.exports = { maskPhone, maskId, maskModel };
