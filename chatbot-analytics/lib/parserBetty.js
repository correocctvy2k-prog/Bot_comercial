'use strict';

/**
 * Parsers tolerantes de los dos logs del chatbot Betty (atencion a clientes de
 * Gane Palmira). Formato JSON Lines; una linea corrupta se cuenta y se ignora.
 *
 * 1) messages.log        mensajes del cliente. SIN timestamp, SIN direccion.
 *    {"level":"info","message":"Hola","phone":"57...","type":"text"}
 *
 * 2) state-manager.log   maquina de estados del bot. CON timestamp (campo
 *    `timeout` / `newTimeout`, que es cuando el estado expira -> aproxima el
 *    momento de actividad del cliente).
 *    {"level":"info","message":{"action":"setState","flow":"resultados",
 *      "step":"processing","timeout":"2026-09-02T19:53:18.925Z","userId":"57..."}}
 *    (hay tambien lineas informativas con message string: se descartan)
 */

/**
 * @param {string} text
 * @returns {{events: Array<{phone:string, message:string, type:string}>, parseErrors:number}}
 */
function parseBettyMessages(text) {
  const events = [];
  let parseErrors = 0;
  for (const raw of String(text || '').split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) continue;
    let o;
    try {
      o = JSON.parse(line);
    } catch (_) {
      parseErrors += 1;
      continue;
    }
    if (!o || typeof o.message !== 'string' || !o.phone) {
      parseErrors += 1;
      continue;
    }
    events.push({
      phone: String(o.phone),
      message: o.message,
      type: o.type || 'unknown',
    });
  }
  return { events, parseErrors };
}

/**
 * @param {string} text
 * @param {{stateTtlMs?: number}} [opts]  ventana a restar al 'timeout' para
 *        aproximar la hora real de interaccion (el timeout va adelantado).
 * @returns {{events: Array<{action,flow,step,fromStep,toStep,userId,ts:Date|null,iso:string|null}>, parseErrors:number}}
 */
function parseBettyState(text, opts = {}) {
  const ttl = Number.isFinite(opts.stateTtlMs) ? opts.stateTtlMs : 720000;
  const nowMs = Date.now();
  const events = [];
  let parseErrors = 0;
  for (const raw of String(text || '').split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) continue;
    let o;
    try {
      o = JSON.parse(line);
    } catch (_) {
      parseErrors += 1;
      continue;
    }
    const m = o && o.message;
    if (!m || typeof m !== 'object') continue; // "StateManager inicializado", etc.

    const rawTs = m.timeout || m.newTimeout || null;
    let ts = rawTs ? new Date(rawTs) : null;
    let valid = ts && !Number.isNaN(ts.getTime());
    if (valid) {
      // El 'timeout' es futuro: restamos la ventana y nunca dejamos que quede
      // adelante de "ahora".
      ts = new Date(Math.min(ts.getTime() - ttl, nowMs));
    }

    events.push({
      action: m.action || null,
      flow: m.flow || null,
      step: m.step || null,
      fromStep: m.fromStep || null,
      toStep: m.toStep || null,
      userId: m.userId ? String(m.userId) : null,
      ts: valid ? ts : null,
      iso: valid ? ts.toISOString() : null,
    });
  }
  return { events, parseErrors };
}

module.exports = { parseBettyMessages, parseBettyState };
