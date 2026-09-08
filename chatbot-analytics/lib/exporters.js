'use strict';

/**
 * Construye los conjuntos de datos descargables en CSV, filtrados por rango de
 * fechas (dia local) y con los telefonos/documentos enmascarados segun config.
 *
 *   oskitar: 'conversaciones' (todos los mensajes) | 'personas'
 *   betty  : 'clientes' | 'mensajes' | 'flujos'
 */

const { parseLog } = require('./parser');
const { buildModel, classify } = require('./analytics');
const { parseBettyMessages, parseBettyState } = require('./parserBetty');
const { buildBettyModel, classifyIntent } = require('./analyticsBetty');
const { maskPhone, maskId } = require('./privacy');

const inRange = (d, from, to) => (!from || d >= from) && (!to || d <= to);

function localDT(iso, tz) {
  const d = new Date(new Date(iso).getTime() + tz * 3600 * 1000);
  return { date: d.toISOString().slice(0, 10), time: d.toISOString().slice(11, 19) };
}

function pick(mask) {
  return {
    phone: (v) => (mask ? maskPhone(v) : String(v == null ? '' : v)),
    id: (v) => (mask ? maskId(v) : String(v == null ? '' : v)),
  };
}

// -------------------------------------------------------------------------
function oskitarExport(dataset, raw, { from, to, tz, mask }) {
  const m = pick(mask);
  const ds = dataset === 'personas' ? 'personas' : 'conversaciones';
  const { events } = parseLog(raw.conversations || '');
  const model = buildModel(events, {
    sessionGapMinutes: 30, tzOffsetHours: tz, from: from || null, to: to || null,
  });

  if (ds === 'personas') {
    const rows = model.users.map((u) => ({
      telefono: m.phone(u.phone),
      nombre: u.name || '',
      documento: m.id(u.document || ''),
      conversaciones: u.sessions,
      mensajes: u.totalMessages,
      preguntas: u.inbound,
      respuestas: u.outbound,
      categorias: (u.categories || []).join(' | '),
      se_identifico: u.validated ? 'si' : 'no',
      paso_a_asesor: u.escalated ? 'si' : 'no',
      primera_interaccion: u.firstInteraction ? `${localDT(u.firstInteraction, tz).date} ${localDT(u.firstInteraction, tz).time}` : '',
      ultima_interaccion: u.lastInteraction ? `${localDT(u.lastInteraction, tz).date} ${localDT(u.lastInteraction, tz).time}` : '',
    }));
    return { rows, name: `oskitar-personas_${from || 'inicio'}_a_${to || 'fin'}.csv` };
  }

  const idByPeer = new Map(model.users.map((u) => [u.phone, u]));
  const rows = events
    .map((e) => ({ e, dt: localDT(e.iso, tz) }))
    .filter(({ dt }) => inRange(dt.date, from, to))
    .map(({ e, dt }) => {
      const u = idByPeer.get(e.peer) || {};
      return {
        fecha: dt.date,
        hora: dt.time,
        telefono: m.phone(e.peer),
        nombre: u.name || '',
        documento: m.id(u.document || ''),
        direccion: e.direction === 'IN' ? 'recibido' : 'enviado',
        tipo: e.type,
        categoria: (e.direction === 'IN' && e.type === 'text' && e.content) ? classify(e.content) : '',
        contenido: e.content || '',
      };
    });
  return { rows, name: `oskitar-conversaciones_${from || 'inicio'}_a_${to || 'fin'}.csv` };
}

// -------------------------------------------------------------------------
function bettyExport(dataset, raw, { from, to, tz, mask, stateTtlMs = 720000 }) {
  const m = pick(mask);

  if (dataset === 'mensajes') {
    const { events } = parseBettyMessages(raw.messages || '');
    const rows = events.map((ev) => ({
      telefono: m.phone(ev.phone),
      tipo: ev.type,
      intencion: classifyIntent(ev.message),
      mensaje: ev.message,
    }));
    return { rows, name: 'betty-mensajes_todos.csv', note: 'messages.log no tiene fechas: se incluyen todos los mensajes.' };
  }

  if (dataset === 'flujos') {
    const { events } = parseBettyState(raw.state || '', { stateTtlMs });
    const rows = events
      .filter((s) => s.iso)
      .map((s) => ({ s, dt: localDT(s.iso, tz) }))
      .filter(({ dt }) => inRange(dt.date, from, to))
      .map(({ s, dt }) => ({
        fecha: dt.date,
        hora: dt.time,
        telefono: m.phone(s.userId || ''),
        accion: s.action || '',
        flujo: s.flow || '',
        paso: s.step || s.toStep || '',
      }));
    return { rows, name: `betty-flujos_${from || 'inicio'}_a_${to || 'fin'}.csv` };
  }

  // clientes (por defecto)
  const model = buildBettyModel(raw, { tzOffsetHours: tz, stateTtlMs });
  const rangeSet = Boolean(from || to);
  const rows = model.customers
    .filter((c) => {
      if (!rangeSet) return true;
      if (!c.lastActivity) return false;
      return inRange(localDT(c.lastActivity, tz).date, from, to);
    })
    .map((c) => ({
      telefono: m.phone(c.phone),
      mensajes: c.messages,
      no_disponible: c.notAvailable,
      consultas: c.flowEvents,
      flujos: (c.flows || []).join(' | '),
      tema_principal: c.topIntent || '',
      ultima_actividad: c.lastActivity ? `${localDT(c.lastActivity, tz).date} ${localDT(c.lastActivity, tz).time}` : '',
    }));
  return { rows, name: `betty-clientes_${from || 'inicio'}_a_${to || 'fin'}.csv` };
}

module.exports = { oskitarExport, bettyExport };
