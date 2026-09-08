'use strict';

/**
 * Motor de analitica del chatbot Betty (atencion a clientes).
 *
 * Entrada: { messages: <texto messages.log>, state: <texto state-manager.log> }
 * Salida : un objeto "modelo" listo para pintar la pestaña de Betty.
 *
 * Nota importante sobre el tiempo: messages.log NO trae timestamp, asi que los
 * cortes por dia/hora salen de state-manager.log (campo `timeout`, que es cuando
 * el estado expira: aproxima -por segundos/pocos minutos- el momento real de
 * actividad del cliente). Es suficiente para tendencias, no para precision fina.
 */

const { parseBettyMessages, parseBettyState } = require('./parserBetty');

const WEEKDAYS_ES = ['Domingo', 'Lunes', 'Martes', 'Miercoles', 'Jueves', 'Viernes', 'Sabado'];

const NOT_AVAILABLE_RE = /^no disponible$/;

// Nombres legibles de los flujos de la maquina de estados.
const FLOW_NAMES = {
  resultados: 'Consultar resultados',
  chance: 'Jugar chance',
  location: 'Ubicacion de puntos',
};

// Clasificacion ligera de lo que escribe el cliente (sobre texto libre).
const INTENT_RULES = [
  ['Resultados de loteria', /resultad|loteri|del d[ií]a|de ayer|de hoy|valle|chance.*d[ií]a/],
  ['Comparte un enlace', /https?:\/\/|facebook\.com|wa\.me/],
  ['Solicita ayuda', /ayuda|necesito|no me sale|no funciona|problema|no puedo/],
  ['Descargar la app', /descargar|ganel|aplicaci|app\b/],
  ['Saludo', /^(hola|holaa|ola|buenas|buenos dias|buenas tardes|buenas noches|hey|que mas)\b/],
];

const norm = (s) => String(s || '')
  .toLowerCase()
  .normalize('NFD')
  .replace(/[̀-ͯ]/g, '')
  .replace(/\s+/g, ' ')
  .trim();

const pct = (part, whole) => (whole ? Math.round((part / whole) * 1000) / 10 : 0);

function localParts(date, tzOffsetHours) {
  const t = new Date(date.getTime() + tzOffsetHours * 3600 * 1000);
  return { date: t.toISOString().slice(0, 10), hour: t.getUTCHours(), weekday: t.getUTCDay() };
}

function classifyIntent(message) {
  const t = norm(message);
  if (NOT_AVAILABLE_RE.test(t)) return 'Opcion "No disponible"';
  for (const [name, re] of INTENT_RULES) {
    if (re.test(t)) return name;
  }
  return 'Otro';
}

/**
 * @param {{messages?: string, state?: string}} raw
 * @param {{tzOffsetHours?: number}} [opts]
 */
function buildBettyModel(raw, opts = {}) {
  const tz = opts.tzOffsetHours ?? -5;
  const stateTtlMs = Number.isFinite(opts.stateTtlMs) ? opts.stateTtlMs : 720000;
  const { events: messages, parseErrors: msgErrors } = parseBettyMessages(raw.messages || '');
  const { events: state, parseErrors: stateErrors } = parseBettyState(raw.state || '', { stateTtlMs });

  // ---- Clientes ------------------------------------------------------
  const allCustomers = new Set();
  messages.forEach((m) => allCustomers.add(m.phone));
  state.forEach((s) => { if (s.userId) allCustomers.add(s.userId); });

  // ---- messages.log: tipos, "No disponible", intenciones, top clientes ----
  const typeAgg = new Map();
  const intentAgg = new Map();
  const msgByCustomer = new Map();
  let notAvailable = 0;
  const notAvailCustomers = new Set();

  // Detalle por cliente (telefono) — para el cuadro de clientes.
  const custAgg = new Map();
  const cust = (p) => {
    if (!custAgg.has(p)) {
      custAgg.set(p, {
        phone: p, messages: 0, notAvailable: 0, flowEvents: 0,
        flows: new Set(), intents: new Map(), lastTs: null,
      });
    }
    return custAgg.get(p);
  };

  for (const m of messages) {
    typeAgg.set(m.type, (typeAgg.get(m.type) || 0) + 1);
    msgByCustomer.set(m.phone, (msgByCustomer.get(m.phone) || 0) + 1);

    const c = cust(m.phone);
    c.messages += 1;

    if (NOT_AVAILABLE_RE.test(norm(m.message))) {
      notAvailable += 1;
      notAvailCustomers.add(m.phone);
      c.notAvailable += 1;
    }
    const intent = classifyIntent(m.message);
    intentAgg.set(intent, (intentAgg.get(intent) || 0) + 1);
    if (intent !== 'Opcion "No disponible"') {
      c.intents.set(intent, (c.intents.get(intent) || 0) + 1);
    }
  }

  const messageTypes = [...typeAgg.entries()]
    .map(([type, count]) => ({ type, count, pct: pct(count, messages.length) }))
    .sort((a, b) => b.count - a.count);

  const intents = [...intentAgg.entries()]
    .map(([intent, count]) => ({ intent, count, pct: pct(count, messages.length) }))
    .filter((x) => x.intent !== 'Opcion "No disponible"') // se muestra aparte como alerta
    .sort((a, b) => b.count - a.count);

  const topCustomers = [...msgByCustomer.entries()]
    .map(([phone, count]) => ({ phone, label: `…${phone.slice(-4)}`, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 8);

  // ---- state-manager.log: flujos, pasos, actividad, embudo ----------
  const flowAgg = new Map(); // flow -> { starts, users:Set }
  const stepAgg = new Map(); // `${flow}/${step}` -> count
  const flowByCustomer = new Map(); // userId -> Set(flow)
  let updateSteps = 0;

  const dayAgg = new Map();
  const hourArr = Array.from({ length: 24 }, (_, h) => ({ hour: h, count: 0 }));
  const weekdayArr = WEEKDAYS_ES.map((name, i) => ({ weekday: i, name, count: 0 }));
  const tsList = [];

  for (const s of state) {
    if (s.flow) {
      if (!flowAgg.has(s.flow)) flowAgg.set(s.flow, { starts: 0, users: new Set() });
      const f = flowAgg.get(s.flow);
      if (s.action === 'setState') f.starts += 1;
      if (s.userId) f.users.add(s.userId);
      if (s.step) stepAgg.set(`${s.flow}/${s.step}`, (stepAgg.get(`${s.flow}/${s.step}`) || 0) + 1);
      if (s.userId) {
        if (!flowByCustomer.has(s.userId)) flowByCustomer.set(s.userId, new Set());
        flowByCustomer.get(s.userId).add(s.flow);
        const c = cust(s.userId);
        c.flows.add(s.flow);
        if (s.action === 'setState') c.flowEvents += 1;
      }
    }
    if (s.action === 'updateStep') updateSteps += 1;

    if (s.ts) {
      tsList.push(s.ts);
      const { date, hour, weekday } = localParts(s.ts, tz);
      dayAgg.set(date, (dayAgg.get(date) || 0) + 1);
      hourArr[hour].count += 1;
      weekdayArr[weekday].count += 1;
      if (s.userId) {
        const c = cust(s.userId);
        if (!c.lastTs || s.ts > c.lastTs) c.lastTs = s.ts;
      }
    }
  }

  const flows = [...flowAgg.entries()]
    .map(([flow, v]) => ({
      flow,
      name: FLOW_NAMES[flow] || flow,
      starts: v.starts,
      customers: v.users.size,
    }))
    .sort((a, b) => b.starts - a.starts);

  const byDay = [...dayAgg.entries()]
    .map(([date, count]) => ({ date, count }))
    .sort((a, b) => a.date.localeCompare(b.date));

  // Embudo aproximado del flujo "resultados" (clientes distintos por paso).
  const resUsersAny = new Set();
  const resUsersDate = new Set();
  const resUsersProc = new Set();
  const resUsersDone = new Set();
  for (const s of state) {
    if (s.flow !== 'resultados' || !s.userId) continue;
    resUsersAny.add(s.userId);
    if (s.step === 'date_input') resUsersDate.add(s.userId);
    if (s.step === 'processing') resUsersProc.add(s.userId);
    if (s.action === 'clearState') resUsersDone.add(s.userId);
  }
  const resultadosFunnel = [
    { stage: 'Entraron a "Resultados"', count: resUsersAny.size },
    { stage: 'Indicaron una fecha', count: resUsersDate.size },
    { stage: 'Se proceso la consulta', count: resUsersProc.size },
    { stage: 'Cerraron el flujo', count: resUsersDone.size },
  ].map((r) => ({ ...r, pctOfStart: pct(r.count, resUsersAny.size) }));

  const topByFlow = [...flowByCustomer.entries()]
    .map(([userId, set]) => ({ phone: userId, label: `…${userId.slice(-4)}`, flows: set.size }))
    .sort((a, b) => b.flows - a.flows)
    .slice(0, 8);

  tsList.sort((a, b) => a - b);
  const rangeStart = tsList.length ? localParts(tsList[0], tz).date : null;
  const rangeEnd = tsList.length ? localParts(tsList[tsList.length - 1], tz).date : null;

  const totalFlowStarts = flows.reduce((a, f) => a + f.starts, 0);

  // ---- Cuadro de clientes (telefonos que interactuaron con Betty) ----
  const customers = [...custAgg.values()]
    .map((c) => {
      let topIntent = null;
      let best = 0;
      for (const [name, n] of c.intents) {
        if (n > best) { best = n; topIntent = name; }
      }
      return {
        phone: c.phone,
        messages: c.messages,
        notAvailable: c.notAvailable,
        flowEvents: c.flowEvents,
        flows: [...c.flows].map((f) => FLOW_NAMES[f] || f),
        topIntent: topIntent || (c.notAvailable ? 'Opcion "No disponible"' : '—'),
        lastActivity: c.lastTs ? c.lastTs.toISOString() : null,
      };
    })
    .sort((a, b) => {
      // por ultima actividad desc; los que no tienen (solo en messages.log) al final
      if (a.lastActivity && b.lastActivity) return b.lastActivity.localeCompare(a.lastActivity);
      if (a.lastActivity) return -1;
      if (b.lastActivity) return 1;
      return b.messages - a.messages;
    });

  return {
    meta: {
      generatedAt: new Date().toISOString(),
      tzOffsetHours: tz,
      rangeStart,
      rangeEnd,
      daysCovered: byDay.length,
      parseErrors: msgErrors + stateErrors,
      timingNote: 'Horas aproximadas: state-manager.log solo guarda cuando expira el estado; se ajusta restando la ventana de expiracion.',
    },
    kpis: {
      uniqueCustomers: allCustomers.size,
      totalMessages: messages.length,
      flowsStarted: totalFlowStarts,
      notAvailableRate: pct(notAvailable, messages.length),
      messagesPerCustomer: allCustomers.size
        ? Math.round((messages.length / allCustomers.size) * 10) / 10
        : 0,
      stepCorrections: updateSteps,
    },
    notAvailable: {
      count: notAvailable,
      pct: pct(notAvailable, messages.length),
      customers: notAvailCustomers.size,
      totalCustomers: allCustomers.size,
    },
    flows,
    stepBreakdown: [...stepAgg.entries()]
      .map(([k, count]) => ({ key: k, count }))
      .sort((a, b) => b.count - a.count),
    resultadosFunnel,
    intents,
    messageTypes,
    byDay,
    byHour: hourArr,
    byWeekday: weekdayArr,
    topCustomers,
    topByFlow,
    customers,
  };
}

module.exports = { buildBettyModel, classifyIntent, FLOW_NAMES };
