'use strict';

/**
 * Motor de analitica gerencial sobre los eventos normalizados del log de Oskitar
 * (el chatbot de soporte tecnico de Gane Palmira).
 *
 * Entrada : NormalizedEvent[]  (ver lib/parser.js)
 * Salida  : un unico objeto "modelo" con KPIs, series de tiempo, embudo,
 *           categorias, desempeno del bot y detalle de usuarios, listo para
 *           pintar el tablero sin logica adicional en el frontend.
 */

const WEEKDAYS_ES = ['Domingo', 'Lunes', 'Martes', 'Miercoles', 'Jueves', 'Viernes', 'Sabado'];

// -------------------------------------------------------------------------
// Taxonomia de consultas. El orden importa: gana la primera categoria con
// coincidencia, de la mas especifica a la mas general.
// -------------------------------------------------------------------------
const CATEGORY_RULES = [
  ['Biometrico / Huella', ['huella', 'biometric', 'biometrico', 'biométric', 'lector', 'enrolar', 'dactilar', 'dispositivo de captura', 'dispositivo biometrico', 'dispositivo biométrico']],
  ['Impresion / Facturacion', ['imprimir', 'impresora', 'no imprime', 'tirilla', 'factura', 'rollo de papel']],
  ['Errores / Fallas del sistema', ['error', '502', ' otp', 'no funciona', 'no carga', 'no deja', 'se cerro', 'se cerró', 'falla', 'fallando', 'bloque', 'lento', 'caido', 'caído', 'no abre', 'pantalla azul', 'no responde el sistema']],
  ['Giros / Transacciones', ['giro', 'beneficiario', 'recaudo', 'registro civil', 'santander', 'bancolombia', 'pago a banco', 'transacc', 'transferencia', 'envio de giro', 'envío de giro', 'pagar giro', 'consignaci', 'retiro']],
  ['Registro de clientes', ['registrar cliente', 'registro de cliente', 'registrar clientes', 'crear cliente', 'actualizar datos', 'cliente nuevo', 'enrolar cliente']],
  ['Juegos / Chance / Apuestas', ['chance', 'pata millonaria', 'ñapa', 'napa', 'acumulado', 'superastro', 'astro', 'resultado', 'sorteo', 'baloto', 'doble chance', 'betplay', 'casino', 'bono', 'apuesta', 'loteria', 'lotería', 'superflex']],
  ['Contacto / Soporte humano', ['no responden', 'no contestan', 'rechazan la llamada', 'numero de telefono', 'número de teléfono', 'telefono para llamar', 'teléfono para llamar', 'hablar con un', 'asesor', 'quien me ayuda']],
  ['Informacion general', ['tope', 'horario', 'cuanto paga', 'cuánto paga', 'comision', 'comisión', 'requisito', 'como se juega', 'cómo se juega', 'codigo para', 'código para', 'me puedes explicar', 'que sabes de', 'qué sabes de', 'informacion sobre', 'información sobre']],
];

const GREETINGS = new Set([
  'hola', 'ola', 'hi', 'h', 'hey', 'buenas', 'buenos dias', 'buenas tardes', 'buenas noches',
  'buen dia', 'buen día', 'buena tarde', 'buena noche', 'buenas dias', 'ola k ase', 'holaa',
  'buenos días', 'que mas', 'qué más', 'saludos',
]);

// Plantillas de respuesta del bot que representan una "no resolucion directa"
// (contingencia): el bot no pudo responder la intencion del usuario.
const CONTINGENCY_RULES = [
  ['Derivado a soporte humano', (t) => t.includes('soporte informatica') || t.includes('soporte informática') || /llama a soporte/i.test(t)],
  ['Formato de mensaje no soportado', (t) => t.includes('solo se procesan mensajes')],
  ['Documento invalido', (t) => t.includes('documento debe contener solo numeros') || t.includes('documento debe contener solo números')],
  ['Datos incorrectos', (t) => t.includes('datos ingresados son incorrectos')],
  ['Sin informacion disponible', (t) => /no tengo informacion|no tengo información|lo siento, no|no cuento con|no dispongo de/i.test(t)],
];

const norm = (s) => String(s || '')
  .toLowerCase()
  .normalize('NFD')
  .replace(/[̀-ͯ]/g, '');

const median = (arr) => {
  if (!arr.length) return 0;
  const s = [...arr].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
};

const percentile = (arr, p) => {
  if (!arr.length) return 0;
  const s = [...arr].sort((a, b) => a - b);
  const idx = Math.min(s.length - 1, Math.ceil((p / 100) * s.length) - 1);
  return s[Math.max(0, idx)];
};

const pct = (part, whole) => (whole ? Math.round((part / whole) * 1000) / 10 : 0);

/** Convierte un Date UTC a las "partes" locales de la operacion. */
function localParts(date, tzOffsetHours) {
  const shifted = new Date(date.getTime() + tzOffsetHours * 3600 * 1000);
  return {
    date: shifted.toISOString().slice(0, 10),
    hour: shifted.getUTCHours(),
    weekday: shifted.getUTCDay(),
  };
}

/** ¿El mensaje IN aporta una consulta real (no saludo, no numero de documento)? */
function isSubstantiveInbound(ev) {
  if (ev.direction !== 'IN') return false;
  if (ev.type !== 'text' || !ev.content) return ev.direction === 'IN' && ev.type !== 'text' && ev.type !== 'unknown';
  const clean = norm(ev.content).replace(/[¿?¡!.,]/g, '').trim();
  if (!clean) return false;
  if (/^\d{3,14}$/.test(clean)) return false; // numero de documento / telefono
  if (GREETINGS.has(clean)) return false;
  if (clean.length <= 2) return false;
  return true;
}

function classify(text) {
  const t = norm(text);
  for (const [name, keywords] of CATEGORY_RULES) {
    if (keywords.some((k) => t.includes(norm(k)))) return name;
  }
  return 'Sin clasificar';
}

function cleanName(raw) {
  const cleaned = String(raw || '')
    .replace(/[^\p{L}\s.'-]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (!cleaned) return null;
  return cleaned
    .split(' ')
    .slice(0, 4)
    .map((w) => (w ? w.charAt(0).toUpperCase() + w.slice(1).toLowerCase() : w))
    .join(' ')
    .trim() || null;
}

// -------------------------------------------------------------------------
// Identidad (nombre + documento) por telefono
// -------------------------------------------------------------------------
function extractIdentities(events, eventsByPeer) {
  const names = new Map();
  const docs = new Map();

  for (const ev of events) {
    if (ev.direction !== 'OUT' || !ev.content) continue;

    // El saludo de bienvenida trae el nombre mas completo.
    let m = ev.content.match(/^Hola\s+(.+?),\s*Bienvenido al Sistema de Soporte/i);
    if (m) {
      const clean = cleanName(m[1]);
      if (clean && (!names.has(ev.peer) || names.get(ev.peer).length < clean.length)) {
        names.set(ev.peer, clean);
      }
      continue;
    }
    // "Gracias por validar tu documento NOMBRE, ¿En que puedo ayudarte hoy?"
    m = ev.content.match(/Gracias por validar tu documento\s+([\p{L}][\p{L}\s.'-]*?)\s*[,.]/u);
    if (m && !names.has(ev.peer)) {
      const clean = cleanName(m[1]);
      if (clean) names.set(ev.peer, clean);
    }
  }

  // Documento: ultimo IN puramente numerico antes de la primera validacion.
  for (const [peer, evs] of eventsByPeer) {
    const valIdx = evs.findIndex(
      (e) => e.direction === 'OUT' && e.content && e.content.includes('Gracias por validar tu documento'),
    );
    const limit = valIdx === -1 ? evs.length : valIdx;
    for (let i = limit - 1; i >= 0; i -= 1) {
      const e = evs[i];
      if (e.direction === 'IN' && e.type === 'text' && e.content && /^\d{5,12}$/.test(e.content.trim())) {
        docs.set(peer, e.content.trim());
        break;
      }
    }
  }

  return { names, docs };
}

// -------------------------------------------------------------------------
// Sesiones
// -------------------------------------------------------------------------
function buildSessions(eventsByPeer, gapMs) {
  const sessions = [];
  let seq = 0;

  for (const [peer, evs] of eventsByPeer) {
    let current = null;
    for (const ev of evs) {
      if (!current || ev.ts - current.end > gapMs) {
        seq += 1;
        current = { id: `S${seq}`, peer, start: ev.ts, end: ev.ts, events: [] };
        sessions.push(current);
      }
      current.events.push(ev);
      current.end = ev.ts;
    }
  }

  for (const s of sessions) enrichSession(s);
  sessions.sort((a, b) => a.start - b.start);
  return sessions;
}

function enrichSession(s) {
  s.inCount = 0;
  s.outCount = 0;
  s.durationSec = Math.round((s.end - s.start) / 1000);
  s.categories = new Set();
  s.responseTimesSec = [];
  s.docRequested = false;
  s.docSubmitted = false;
  s.validated = false;
  s.validatedAt = null;
  s.gratitude = false;
  s.escalated = false;

  let pendingInboundTs = null;

  for (const ev of s.events) {
    if (ev.direction === 'IN') {
      s.inCount += 1;
      if (pendingInboundTs == null) pendingInboundTs = ev.ts;
      if (isSubstantiveInbound(ev)) {
        s.categories.add(classify(ev.content || ''));
      }
      if (ev.content && /\bgracias\b|mil gracias|muchas gracias/i.test(norm(ev.content))) {
        s.gratitude = true;
      }
      if (ev.content && /^\d{5,12}$/.test(ev.content.trim())) {
        s.docSubmitted = true;
      }
    } else {
      s.outCount += 1;
      if (pendingInboundTs != null) {
        s.responseTimesSec.push((ev.ts - pendingInboundTs) / 1000);
        pendingInboundTs = null;
      }
      const t = norm(ev.content || '');
      if (t.includes('ingrese su numero de documento')) s.docRequested = true;
      if (ev.content && ev.content.includes('Gracias por validar tu documento')) {
        s.validated = true;
        if (!s.validatedAt) s.validatedAt = ev.ts;
      }
      if (CONTINGENCY_RULES[0][1](t)) s.escalated = true;
    }
  }

  s.msgCount = s.events.length;
  s.categories = [...s.categories];
  s.queryAfterValidation = s.validated
    && s.events.some((ev) => ev.ts >= s.validatedAt && isSubstantiveInbound(ev));
  // Proxy de contencion: el bot resolvio sin derivar a un humano.
  s.containedByBot = !s.escalated;
}

// -------------------------------------------------------------------------
// Modelo completo
// -------------------------------------------------------------------------
/**
 * @param {import('./parser').NormalizedEvent[]} allEvents
 * @param {Object} opts
 * @param {number} opts.sessionGapMinutes
 * @param {number} opts.tzOffsetHours
 * @param {string} [opts.from]      ISO date (YYYY-MM-DD) inclusive
 * @param {string} [opts.to]        ISO date (YYYY-MM-DD) inclusive
 * @param {string} [opts.category]  filtra a sesiones/usuarios de esa categoria
 */
function buildModel(allEvents, opts = {}) {
  const {
    sessionGapMinutes = 30,
    tzOffsetHours = -5,
    from = null,
    to = null,
    category = null,
  } = opts;

  const gapMs = sessionGapMinutes * 60 * 1000;

  // ---- Filtro temporal (por dia local de operacion) --------------------
  let events = allEvents;
  if (from || to) {
    events = allEvents.filter((ev) => {
      const d = localParts(ev.ts, tzOffsetHours).date;
      if (from && d < from) return false;
      if (to && d > to) return false;
      return true;
    });
  }

  const eventsByPeer = new Map();
  for (const ev of events) {
    if (!eventsByPeer.has(ev.peer)) eventsByPeer.set(ev.peer, []);
    eventsByPeer.get(ev.peer).push(ev);
  }
  for (const evs of eventsByPeer.values()) evs.sort((a, b) => a.ts - b.ts);

  const { names, docs } = extractIdentities(events, eventsByPeer);
  let sessions = buildSessions(eventsByPeer, gapMs);

  // ---- Filtro por categoria (opcional) --------------------------------
  const categoryFilterActive = category && category !== 'Todas';
  if (categoryFilterActive) {
    sessions = sessions.filter((s) => s.categories.includes(category));
  }
  const sessionPeers = new Set(sessions.map((s) => s.peer));
  const scopedEvents = categoryFilterActive
    ? events.filter((ev) => sessionPeers.has(ev.peer))
    : events;

  // ---- KPIs ----------------------------------------------------------
  const inbound = scopedEvents.filter((e) => e.direction === 'IN').length;
  const outbound = scopedEvents.filter((e) => e.direction === 'OUT').length;
  const uniqueUsers = new Set(
    scopedEvents.filter((e) => e.direction === 'IN').map((e) => e.peer),
  ).size;

  const allResponseTimes = sessions.flatMap((s) => s.responseTimesSec);
  const sessionsDocSubmitted = sessions.filter((s) => s.docSubmitted).length;
  const sessionsValidated = sessions.filter((s) => s.validated).length;
  const sessionsEscalated = sessions.filter((s) => s.escalated).length;
  const sessionsGratitude = sessions.filter((s) => s.gratitude).length;

  const userSessionCount = new Map();
  for (const s of sessions) {
    userSessionCount.set(s.peer, (userSessionCount.get(s.peer) || 0) + 1);
  }
  const recurringUsers = [...userSessionCount.values()].filter((n) => n > 1).length;

  const kpis = {
    uniqueUsers,
    sessions: sessions.length,
    totalMessages: scopedEvents.length,
    inbound,
    outbound,
    messagesPerSession: sessions.length
      ? Math.round((scopedEvents.length / sessions.length) * 10) / 10
      : 0,
    avgSessionDurationMin: sessions.length
      ? Math.round((sessions.reduce((a, s) => a + s.durationSec, 0) / sessions.length / 60) * 10) / 10
      : 0,
    validationRate: pct(sessionsValidated, sessionsDocSubmitted || sessions.length),
    escalationRate: pct(sessionsEscalated, sessions.length),
    botContainmentRate: pct(sessions.length - sessionsEscalated, sessions.length),
    gratitudeRate: pct(sessionsGratitude, sessions.length),
    responseMedianSec: Math.round(median(allResponseTimes) * 10) / 10,
    responseP90Sec: Math.round(percentile(allResponseTimes, 90) * 10) / 10,
    recurringUserRate: pct(recurringUsers, uniqueUsers),
    mediaDelivered: scopedEvents.filter(
      (e) => e.direction === 'OUT' && (e.hasMedia || ['video', 'audio', 'image'].includes(e.type)),
    ).length,
  };

  // ---- Series de tiempo -------------------------------------------------
  const dayMap = new Map();
  const hourArr = Array.from({ length: 24 }, (_, h) => ({ hour: h, inbound: 0 }));
  const weekdayArr = WEEKDAYS_ES.map((name, i) => ({ weekday: i, name, count: 0 }));
  const heat = new Map(); // `${wd}-${hr}` -> count
  const dayPeople = new Map(); // date -> Map(peer -> { inbound, total })

  for (const ev of scopedEvents) {
    const { date, hour, weekday } = localParts(ev.ts, tzOffsetHours);
    if (!dayMap.has(date)) dayMap.set(date, { date, inbound: 0, outbound: 0, sessions: 0, users: 0 });
    const row = dayMap.get(date);
    if (ev.direction === 'IN') {
      row.inbound += 1;
      hourArr[hour].inbound += 1;
      weekdayArr[weekday].count += 1;
      heat.set(`${weekday}-${hour}`, (heat.get(`${weekday}-${hour}`) || 0) + 1);

      if (!dayPeople.has(date)) dayPeople.set(date, new Map());
      const pm = dayPeople.get(date);
      if (!pm.has(ev.peer)) pm.set(ev.peer, { inbound: 0, total: 0 });
      pm.get(ev.peer).inbound += 1;
    } else {
      row.outbound += 1;
    }
  }
  for (const s of sessions) {
    const d = localParts(s.start, tzOffsetHours).date;
    if (dayMap.has(d)) dayMap.get(d).sessions += 1;
  }
  for (const [date, pm] of dayPeople) {
    if (dayMap.has(date)) dayMap.get(date).users = pm.size;
  }
  const byDay = [...dayMap.values()].sort((a, b) => a.date.localeCompare(b.date));

  // Detalle de personas por dia (para el calendario del panel).
  const peopleByDay = [...dayPeople.entries()]
    .map(([date, pm]) => ({
      date,
      people: [...pm.entries()]
        .map(([phone, v]) => ({
          phone,
          name: names.get(phone) || null,
          document: docs.get(phone) || null,
          messages: v.inbound,
        }))
        .sort((a, b) => b.messages - a.messages),
    }))
    .sort((a, b) => a.date.localeCompare(b.date));

  const heatmap = [];
  let heatMax = 0;
  for (let wd = 0; wd < 7; wd += 1) {
    for (let hr = 0; hr < 24; hr += 1) {
      const count = heat.get(`${wd}-${hr}`) || 0;
      if (count > heatMax) heatMax = count;
      heatmap.push({ weekday: wd, weekdayName: WEEKDAYS_ES[wd], hour: hr, count });
    }
  }

  // ---- Categorias -----------------------------------------------------
  const catAgg = new Map();
  let classifiedTotal = 0;
  for (const s of sessions) {
    for (const ev of s.events) {
      if (!isSubstantiveInbound(ev)) continue;
      const c = classify(ev.content || '');
      if (!catAgg.has(c)) catAgg.set(c, { category: c, messages: 0, sessions: new Set() });
      catAgg.get(c).messages += 1;
      catAgg.get(c).sessions.add(s.id);
      classifiedTotal += 1;
    }
  }
  const categories = [...catAgg.values()]
    .map((c) => ({
      category: c.category,
      messages: c.messages,
      sessions: c.sessions.size,
      pct: pct(c.messages, classifiedTotal),
    }))
    .sort((a, b) => b.messages - a.messages);

  // ---- Embudo de atencion ------------------------------------------------
  const funnel = [
    { stage: 'Iniciaron conversacion', count: sessions.length },
    { stage: 'Enviaron su documento', count: sessionsDocSubmitted },
    { stage: 'Documento validado', count: sessionsValidated },
    { stage: 'Realizaron una consulta', count: sessions.filter((s) => s.queryAfterValidation).length },
    { stage: 'Cerraron agradeciendo', count: sessionsGratitude },
  ].map((row) => ({ ...row, pctOfStart: pct(row.count, sessions.length) }));

  // ---- Desempeno del bot ---------------------------------------------
  const rtBuckets = [
    { label: '< 2 s', min: 0, max: 2, count: 0 },
    { label: '2 - 5 s', min: 2, max: 5, count: 0 },
    { label: '5 - 10 s', min: 5, max: 10, count: 0 },
    { label: '10 - 30 s', min: 10, max: 30, count: 0 },
    { label: '> 30 s', min: 30, max: Infinity, count: 0 },
  ];
  for (const rt of allResponseTimes) {
    const b = rtBuckets.find((x) => rt >= x.min && rt < x.max);
    if (b) b.count += 1;
  }
  const responseTime = {
    buckets: rtBuckets.map(({ label, count }) => ({ label, count })),
    medianSec: kpis.responseMedianSec,
    p90Sec: kpis.responseP90Sec,
    avgSec: allResponseTimes.length
      ? Math.round((allResponseTimes.reduce((a, b) => a + b, 0) / allResponseTimes.length) * 10) / 10
      : 0,
    samples: allResponseTimes.length,
  };

  const contAgg = new Map(CONTINGENCY_RULES.map(([label]) => [label, 0]));
  for (const ev of scopedEvents) {
    if (ev.direction !== 'OUT' || !ev.content) continue;
    const t = norm(ev.content);
    for (const [label, test] of CONTINGENCY_RULES) {
      if (test(t)) contAgg.set(label, contAgg.get(label) + 1);
    }
  }
  const contingencyResponses = [...contAgg.entries()]
    .map(([reason, count]) => ({ reason, count }))
    .filter((x) => x.count > 0)
    .sort((a, b) => b.count - a.count);

  const mediaAgg = new Map();
  for (const ev of scopedEvents) {
    if (ev.direction !== 'OUT') continue;
    if (!ev.hasMedia && !['video', 'audio', 'image'].includes(ev.type)) continue;
    const title = (ev.content || `[${ev.type}]`).replace(/^[^\p{L}\d]+/u, '').trim() || `[${ev.type}]`;
    if (!mediaAgg.has(title)) mediaAgg.set(title, { title, type: ev.type, count: 0 });
    mediaAgg.get(title).count += 1;
  }
  const contentDelivered = [...mediaAgg.values()]
    .sort((a, b) => b.count - a.count)
    .slice(0, 10);

  // ---- Top usuarios (para grafico) -----------------------------------
  const inboundByPeer = new Map();
  for (const ev of scopedEvents) {
    if (ev.direction === 'IN') inboundByPeer.set(ev.peer, (inboundByPeer.get(ev.peer) || 0) + 1);
  }
  const topUsers = [...inboundByPeer.entries()]
    .map(([phone, count]) => ({
      phone,
      label: names.get(phone) || `…${phone.slice(-4)}`,
      count,
    }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 8);

  // ---- Tendencia: primera mitad vs segunda mitad del periodo --------
  const trends = computeTrends(sessions, scopedEvents, byDay, tzOffsetHours);

  // ---- Detalle de usuarios ------------------------------------------
  const users = buildUserDetail({
    sessions,
    scopedEvents,
    names,
    docs,
    userSessionCount,
  });

  // ---- Metadatos ---------------------------------------------------
  const firstTs = events.length ? events[0].iso : null;
  const lastTs = events.length ? events[events.length - 1].iso : null;
  const rangeStart = events.length ? localParts(events[0].ts, tzOffsetHours).date : null;
  const rangeEnd = events.length ? localParts(events[events.length - 1].ts, tzOffsetHours).date : null;

  return {
    meta: {
      generatedAt: new Date().toISOString(),
      tzOffsetHours,
      sessionGapMinutes,
      filter: { from: from || null, to: to || null, category: category || 'Todas' },
      firstEvent: firstTs,
      lastEvent: lastTs,
      rangeStart,
      rangeEnd,
      daysCovered: byDay.length,
      availableCategories: ['Todas', ...CATEGORY_RULES.map(([n]) => n), 'Sin clasificar'],
    },
    kpis,
    byDay,
    byHour: hourArr,
    byWeekday: weekdayArr,
    peopleByDay,
    heatmap,
    heatMax,
    categories,
    funnel,
    responseTime,
    contingencyResponses,
    contentDelivered,
    topUsers,
    trends,
    recurring: {
      recurringUsers,
      newUsers: uniqueUsers - recurringUsers,
      sessionsFromRecurring: sessions.filter((s) => (userSessionCount.get(s.peer) || 0) > 1).length,
      avgSessionsPerUser: uniqueUsers
        ? Math.round((sessions.length / uniqueUsers) * 10) / 10
        : 0,
    },
    users,
  };
}

/**
 * Compara la primera mitad del periodo con la segunda para dar una "flecha de
 * tendencia". `comparable` avisa si la ventana es lo bastante grande (>= 14 dias)
 * como para que el delta sea confiable; con menos dias el frontend muestra solo
 * la mini-serie, sin porcentaje.
 */
function computeTrends(sessions, scopedEvents, byDay, tzOffsetHours) {
  if (byDay.length < 2) return null;
  const mid = Math.floor(byDay.length / 2);
  const firstDates = new Set(byDay.slice(0, mid).map((d) => d.date));
  const lastDates = new Set(byDay.slice(mid).map((d) => d.date));

  const summarize = (dateSet) => {
    const evs = scopedEvents.filter((e) => dateSet.has(localParts(e.ts, tzOffsetHours).date));
    const ss = sessions.filter((s) => dateSet.has(localParts(s.start, tzOffsetHours).date));
    const esc = ss.filter((s) => s.escalated).length;
    const rts = ss.flatMap((s) => s.responseTimesSec);
    return {
      users: new Set(evs.filter((e) => e.direction === 'IN').map((e) => e.peer)).size,
      sessions: ss.length,
      inbound: evs.filter((e) => e.direction === 'IN').length,
      containment: ss.length ? ((ss.length - esc) / ss.length) * 100 : 0,
      responseMedian: median(rts),
    };
  };

  const a = summarize(firstDates);
  const b = summarize(lastDates);
  const relDelta = (x, y) => (x === 0 ? null : Math.round(((y - x) / x) * 100));

  return {
    comparable: byDay.length >= 14,
    users: relDelta(a.users, b.users),
    sessions: relDelta(a.sessions, b.sessions),
    inbound: relDelta(a.inbound, b.inbound),
    containmentPoints: Math.round((b.containment - a.containment) * 10) / 10,
    responseMedian: relDelta(a.responseMedian, b.responseMedian),
  };
}

function buildUserDetail({ sessions, scopedEvents, names, docs, userSessionCount }) {
  const byPeer = new Map();

  for (const ev of scopedEvents) {
    if (!byPeer.has(ev.peer)) {
      byPeer.set(ev.peer, {
        phone: ev.peer,
        name: names.get(ev.peer) || null,
        document: docs.get(ev.peer) || null,
        sessions: userSessionCount.get(ev.peer) || 0,
        totalMessages: 0,
        inbound: 0,
        outbound: 0,
        firstInteraction: ev.iso,
        lastInteraction: ev.iso,
        lastMessage: '',
        lastMessageAt: null,
        categories: new Set(),
        validated: false,
        escalated: false,
        gratitude: false,
        _responseTimes: [],
      });
    }
    const u = byPeer.get(ev.peer);
    u.totalMessages += 1;
    if (ev.direction === 'IN') u.inbound += 1;
    else u.outbound += 1;
    if (ev.iso < u.firstInteraction) u.firstInteraction = ev.iso;
    if (ev.iso >= u.lastInteraction) {
      u.lastInteraction = ev.iso;
      if (ev.content) {
        u.lastMessage = ev.content;
        u.lastMessageAt = ev.iso;
      }
    }
  }

  for (const s of sessions) {
    const u = byPeer.get(s.peer);
    if (!u) continue;
    s.categories.forEach((c) => u.categories.add(c));
    if (s.validated) u.validated = true;
    if (s.escalated) u.escalated = true;
    if (s.gratitude) u.gratitude = true;
    u._responseTimes.push(...s.responseTimesSec);
  }

  return [...byPeer.values()]
    .map((u) => ({
      phone: u.phone,
      name: u.name,
      document: u.document,
      sessions: u.sessions,
      totalMessages: u.totalMessages,
      inbound: u.inbound,
      outbound: u.outbound,
      firstInteraction: u.firstInteraction,
      lastInteraction: u.lastInteraction,
      lastMessage: u.lastMessage,
      lastMessageAt: u.lastMessageAt,
      categories: [...u.categories],
      validated: u.validated,
      escalated: u.escalated,
      gratitude: u.gratitude,
      avgResponseSec: u._responseTimes.length
        ? Math.round((u._responseTimes.reduce((a, b) => a + b, 0) / u._responseTimes.length) * 10) / 10
        : null,
    }))
    .sort((a, b) => b.totalMessages - a.totalMessages);
}

module.exports = { buildModel, classify, CATEGORY_RULES };
