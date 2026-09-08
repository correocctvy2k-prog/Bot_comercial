'use strict';

/**
 * Ficha de contacto por bot (spec 0005, tanda 4).
 *
 * Reconstruye, para un telefono concreto, los datos del contacto + la
 * transcripcion de su conversacion a partir de lo que YA esta cargado en
 * memoria (no relee logs, no recalcula el modelo):
 *   - oskitar : `state.events` (eventos normalizados de lib/parser.js)
 *   - betty   : `state.betty` = { messages, state } (eventos de lib/parserBetty.js)
 *
 * Solo lectura. Respeta MASK_PHONES: si el enmascarado esta activo el `id` que
 * llega del CRM es el telefono ya enmascarado (57••••••4631), asi que se resuelve
 * el peer real comparando `maskPhone(peer) === id`.
 */

const { maskPhone, maskId } = require('./privacy');
const { classify, isSubstantiveInbound, cleanName } = require('./analytics');
const { FLOW_NAMES } = require('./analyticsBetty');

const SESSION_GAP_MS = 30 * 60 * 1000;
const DEFAULT_LIMIT = 200;
const MAX_LIMIT = 1000;

const norm = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

/** Resuelve el peer real a partir de un id que puede venir enmascarado. */
function resolvePeer(peers, id, maskEnabled) {
  const wanted = String(id || '').trim();
  if (!wanted) return null;
  for (const p of peers) if (String(p) === wanted) return p;
  if (maskEnabled) {
    for (const p of peers) if (maskPhone(p) === wanted) return p;
  }
  return null;
}

/**
 * Pagina una lista cronologica devolviendo los `limit` mas recientes tras
 * saltar los `offset` mas recientes (para "cargar mas" hacia atras en el CRM).
 */
function paginate(items, limit, offset) {
  const total = items.length;
  const lim = Math.min(Math.max(1, Number(limit) || DEFAULT_LIMIT), MAX_LIMIT);
  const off = Math.max(0, Number(offset) || 0);
  const end = Math.max(0, total - off);
  const start = Math.max(0, end - lim);
  return { items: items.slice(start, end), total, offset: off, limit: lim, hasMore: start > 0 };
}

function countSessions(sortedTs) {
  if (!sortedTs.length) return 0;
  let sessions = 1;
  for (let i = 1; i < sortedTs.length; i += 1) {
    if (sortedTs[i] - sortedTs[i - 1] > SESSION_GAP_MS) sessions += 1;
  }
  return sessions;
}

// -------------------------------------------------------------------------
// Oskitar
// -------------------------------------------------------------------------
function buildOskitarContact(events, id, opts = {}) {
  const mask = opts.mask !== false;
  const peers = [...new Set((events || []).map((e) => e.peer))];
  const peer = resolvePeer(peers, id, mask);
  if (!peer) return null;

  const evs = events.filter((e) => e.peer === peer).sort((a, b) => a.ts - b.ts);
  if (!evs.length) return null;

  let name = null;
  let document = null;
  let validated = false;
  let escalated = false;
  const categories = new Set();

  for (const ev of evs) {
    if (ev.direction === 'OUT' && ev.content) {
      let m = ev.content.match(/^Hola\s+(.+?),\s*Bienvenido al Sistema de Soporte/i);
      if (m) { const c = cleanName(m[1]); if (c && (!name || name.length < c.length)) name = c; }
      m = ev.content.match(/Gracias por validar tu documento\s+([\p{L}][\p{L}\s.'-]*?)\s*[,.]/u);
      if (m && !name) { const c = cleanName(m[1]); if (c) name = c; }
      const t = norm(ev.content);
      if (ev.content.includes('Gracias por validar tu documento')) validated = true;
      if (t.includes('soporte informatica') || /llama a soporte/i.test(t)) escalated = true;
    }
    if (ev.direction === 'IN' && isSubstantiveInbound(ev)) categories.add(classify(ev.content || ''));
  }

  // Documento: ultimo IN puramente numerico antes de la primera validacion.
  const valIdx = evs.findIndex((e) => e.direction === 'OUT' && e.content && e.content.includes('Gracias por validar tu documento'));
  const limit = valIdx === -1 ? evs.length : valIdx;
  for (let i = limit - 1; i >= 0; i -= 1) {
    const e = evs[i];
    if (e.direction === 'IN' && e.type === 'text' && e.content && /^\d{5,12}$/.test(e.content.trim())) {
      document = e.content.trim();
      break;
    }
  }

  const inbound = evs.filter((e) => e.direction === 'IN').length;
  const page = paginate(evs, opts.limit, opts.offset);

  return {
    bot: 'oskitar',
    contact: {
      id: mask ? maskPhone(peer) : String(peer),
      phone: mask ? maskPhone(peer) : String(peer),
      name: name || null,
      document: document ? (mask ? maskId(document) : document) : null,
      firstInteraction: evs[0].iso,
      lastInteraction: evs[evs.length - 1].iso,
      sessions: countSessions(evs.map((e) => e.ts)),
      totalMessages: evs.length,
      inbound,
      outbound: evs.length - inbound,
      categories: [...categories],
      status: escalated ? 'escalado' : (validated ? 'resuelto' : 'atendido'),
    },
    transcript: {
      items: page.items.map((e) => ({
        iso: e.iso,
        direction: e.direction === 'IN' ? 'in' : 'out',
        type: e.type,
        content: e.content || null,
        hasMedia: !!e.hasMedia,
      })),
      total: page.total,
      offset: page.offset,
      limit: page.limit,
      hasMore: page.hasMore,
    },
    journey: [],
  };
}

// -------------------------------------------------------------------------
// Betty  (messages.log: sin hora ni direccion · state-manager.log: hora aprox.)
// -------------------------------------------------------------------------
function stateLabel(s) {
  const flow = FLOW_NAMES[s.flow] || s.flow || 'flujo';
  if (s.action === 'clearState') return `Cerro el flujo "${flow}"`;
  if (s.action === 'updateStep') return `"${flow}": ${s.fromStep || '?'} -> ${s.toStep || s.step || '?'}`;
  if (s.action === 'setState') return `Inicio "${flow}"${s.step ? ` (${s.step})` : ''}`;
  return `"${flow}"${s.step ? ` · ${s.step}` : ''}`;
}

function buildBettyContact(data, id, opts = {}) {
  const mask = opts.mask !== false;
  const messages = data.messages || [];
  const state = data.state || [];

  const peers = [...new Set([
    ...messages.map((m) => m.phone),
    ...state.map((s) => s.userId).filter(Boolean),
  ])];
  const peer = resolvePeer(peers, id, mask);
  if (!peer) return null;

  const msgs = messages.filter((m) => m.phone === peer);
  const st = state.filter((s) => s.userId === peer);
  if (!msgs.length && !st.length) return null;

  const notAvailable = msgs.filter((m) => /^no disponible$/.test(norm(m.message))).length;
  const flows = new Set();
  const stTs = [];
  let cleared = false;
  for (const s of st) {
    if (s.flow) flows.add(FLOW_NAMES[s.flow] || s.flow);
    if (s.action === 'clearState') cleared = true;
    if (s.ts) stTs.push(new Date(s.ts));
  }
  stTs.sort((a, b) => a - b);

  const status = cleared ? 'resuelto'
    : (notAvailable && !flows.size ? 'no_disponible' : 'atendido');

  const page = paginate(msgs, opts.limit, opts.offset);

  return {
    bot: 'betty',
    contact: {
      id: mask ? maskPhone(peer) : String(peer),
      phone: mask ? maskPhone(peer) : String(peer),
      name: null,
      document: null,
      firstInteraction: stTs.length ? stTs[0].toISOString() : null,
      lastInteraction: stTs.length ? stTs[stTs.length - 1].toISOString() : null,
      sessions: countSessions(stTs.map((d) => d.getTime())),
      totalMessages: msgs.length,
      inbound: msgs.length,
      outbound: 0,
      categories: [...flows],
      status,
    },
    transcript: {
      items: page.items.map((m) => ({
        iso: null,
        direction: 'in',
        type: m.type,
        content: m.message,
        hasMedia: false,
      })),
      total: page.total,
      offset: page.offset,
      limit: page.limit,
      hasMore: page.hasMore,
      note: 'messages.log no guarda hora ni respuestas del bot: se listan los mensajes del cliente en orden.',
    },
    journey: st
      .filter((s) => s.iso)
      .sort((a, b) => new Date(a.iso) - new Date(b.iso))
      .map((s) => ({ iso: s.iso, label: stateLabel(s) })),
  };
}

module.exports = { buildOskitarContact, buildBettyContact };
