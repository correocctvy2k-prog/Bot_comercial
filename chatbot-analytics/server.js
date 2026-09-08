'use strict';

/**
 * Servidor del panel gerencial. Multi-bot:
 *   - oskitar : soporte tecnico interno  (lib/analytics.js)
 *   - betty   : atencion a clientes      (lib/analyticsBetty.js)
 *
 * Por cada bot: fuente propia (uno o varios archivos), modelo en cache que se
 * recalcula cuando cambia el log, API JSON y avisos por SSE.
 *
 * Config por variables de entorno / .env : ver config.js
 */

const express = require('express');
const path = require('path');

const config = require('./config');
const { parseLog } = require('./lib/parser');
const { buildModel } = require('./lib/analytics');
const { buildBettyModel } = require('./lib/analyticsBetty');
const { createBotSource } = require('./lib/logSource');
const { maskModel } = require('./lib/privacy');
const { toCSV } = require('./lib/csv');
const { oskitarExport, bettyExport } = require('./lib/exporters');
const { Archive } = require('./lib/archive');

// Copia + enmascara telefonos antes de responder (no toca el modelo en cache).
const outModel = (model) => (config.maskPhones ? maskModel(JSON.parse(JSON.stringify(model))) : model);

// -------------------------------------------------------------------------
// Historico acumulativo: validadores y extractor de fecha por tipo de archivo
// -------------------------------------------------------------------------
const tryJSON = (line) => { try { return JSON.parse(line); } catch (_) { return null; } };
const ARCHIVE_RULES = {
  conversations: {
    isValid: (l) => { const o = tryJSON(l); return !!(o && o.message && o.timestamp); },
    tsOf: (l) => { const o = tryJSON(l); const d = o && o.timestamp ? new Date(o.timestamp) : null; return d && !Number.isNaN(d.getTime()) ? d : null; },
  },
  messages: {
    isValid: (l) => { const o = tryJSON(l); return !!(o && o.phone && o.message !== undefined); },
    tsOf: () => null, // messages.log no trae fecha
  },
  state: {
    isValid: (l) => tryJSON(l) !== null,
    tsOf: (l) => {
      const o = tryJSON(l); const m = o && o.message;
      const raw = m && typeof m === 'object' ? (m.timeout || m.newTimeout) : null;
      const d = raw ? new Date(raw) : null;
      return d && !Number.isNaN(d.getTime()) ? d : null;
    },
  },
};
function makeArchives(cfg) {
  const out = {};
  for (const key of Object.keys(cfg.files)) {
    const rule = ARCHIVE_RULES[key] || {};
    out[key] = new Archive(
      path.join(config.historyDir, `${cfg.id}.${key}.jsonl`),
      rule.isValid, rule.tsOf,
    ).load();
  }
  return out;
}
/** Ingiere la lectura remota al historico y devuelve el texto acumulado por archivo. */
function archived(bot, raw) {
  const merged = {};
  for (const [key, text] of Object.entries(raw)) {
    const arch = bot.archives[key];
    if (!arch) { merged[key] = text; continue; }
    arch.ingest(text);
    if (config.historyDays > 0) arch.prune(config.historyDays);
    merged[key] = arch.readAll();
  }
  return merged;
}

const app = express();
app.disable('x-powered-by');

// CORS abierto: API de solo lectura, consumida desde el CRM (otro origen) y desde
// el propio tablero. Cubre también SSE. Ver specs/0004 y ADR-0002.
app.use((req, res, next) => {
  res.set('Access-Control-Allow-Origin', '*');
  res.set('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.set('Access-Control-Allow-Headers', 'Content-Type');
  res.set('Vary', 'Origin');
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  return next();
});

app.use(express.json());

// -------------------------------------------------------------------------
// Un "bot" en memoria: config + fuente + estado (modelo cacheado) + clientes SSE
// -------------------------------------------------------------------------
const bots = config.bots.map((cfg) => ({
  cfg,
  source: createBotSource(cfg, config),
  archives: makeArchives(cfg),
  sse: new Set(),
  state: {
    events: [],            // solo oskitar (eventos normalizados, para filtros)
    model: null,
    parseErrors: 0,
    totalLines: 0,
    lastComputedAt: null,
    lastError: null,
    sourceStat: { exists: false, size: 0, mtime: null },
  },
}));
const byId = Object.fromEntries(bots.map((b) => [b.cfg.id, b]));

function broadcast(bot, eventName, payload) {
  const data = `event: ${eventName}\ndata: ${JSON.stringify(payload)}\n\n`;
  for (const res of bot.sse) res.write(data);
}

async function reload(bot, reason) {
  const { cfg, state } = bot;
  try {
    const raw = await bot.source.read(); // { <clave>: contenido remoto actual }
    state.sourceStat = bot.source.stat();
    const merged = archived(bot, raw); // acumula en el historico local

    if (cfg.engine === 'betty') {
      state.model = buildBettyModel(merged, {
        tzOffsetHours: config.tzOffsetHours,
        stateTtlMs: config.bettyStateTtlSec * 1000,
      });
      state.parseErrors = state.model.meta.parseErrors || 0;
      state.totalLines = 0;
      console.log(
        `[${cfg.id}:${reason}] ${state.model.kpis.totalMessages} mensajes, `
        + `${state.model.kpis.uniqueCustomers} clientes, ${state.model.flows.length} flujos`,
      );
    } else {
      const parsed = parseLog(merged.conversations || '');
      state.events = parsed.events;
      state.parseErrors = parsed.parseErrors;
      state.totalLines = parsed.totalLines;
      state.model = buildModel(parsed.events, {
        sessionGapMinutes: config.sessionGapMinutes,
        tzOffsetHours: config.tzOffsetHours,
      });
      console.log(
        `[${cfg.id}:${reason}] ${parsed.events.length} eventos, ${parsed.parseErrors} lineas invalidas, `
        + `${state.model.kpis.sessions} conversaciones, ${state.model.kpis.uniqueUsers} personas`,
      );
    }

    state.lastComputedAt = new Date().toISOString();
    state.lastError = null;
    broadcast(bot, 'update', { updatedAt: state.lastComputedAt, reason });
  } catch (err) {
    state.lastError = err.message;
    console.error(`[${cfg.id}:${reason}] ERROR: ${err.message}`);
  }
}

bots.forEach((bot) => bot.source.on('change', () => reload(bot, 'watch')));

// -------------------------------------------------------------------------
// Helpers de ruta
// -------------------------------------------------------------------------
function resolveBot(req, res, next) {
  const bot = byId[req.params.bot];
  if (!bot) return res.status(404).json({ error: `Bot desconocido: ${req.params.bot}` });
  req.bot = bot;
  return next();
}

function oskitarModel(bot, query) {
  const { from, to, category } = query;
  const hasFilter = from || to || (category && category !== 'Todas');
  if (!hasFilter) return bot.state.model;
  return buildModel(bot.state.events, {
    sessionGapMinutes: config.sessionGapMinutes,
    tzOffsetHours: config.tzOffsetHours,
    from: from || null,
    to: to || null,
    category: category || null,
  });
}

// -------------------------------------------------------------------------
// API
// -------------------------------------------------------------------------
app.get('/api/bots', (req, res) => {
  res.json(bots.map((b) => ({
    id: b.cfg.id,
    name: b.cfg.name,
    subtitle: b.cfg.subtitle,
    engine: b.cfg.engine,
    ready: !b.state.lastError && !!b.state.model,
  })));
});

app.get('/api/:bot/analytics', resolveBot, (req, res) => {
  const { bot } = req;
  if (!bot.state.model) return res.status(503).json({ error: 'Modelo aun no disponible' });
  res.json(outModel(bot.cfg.engine === 'oskitar' ? oskitarModel(bot, req.query) : bot.state.model));
});

app.get('/api/:bot/users', resolveBot, (req, res) => {
  const { bot } = req;
  if (bot.cfg.engine !== 'oskitar') return res.json([]);
  if (!bot.state.model) return res.status(503).json({ error: 'Modelo aun no disponible' });
  res.json(outModel(oskitarModel(bot, req.query)).users);
});

app.get('/api/:bot/health', resolveBot, (req, res) => {
  const { bot } = req;
  const s = bot.state;
  res.json({
    bot: bot.cfg.id,
    engine: bot.cfg.engine,
    status: s.lastError ? 'degraded' : 'ok',
    error: s.lastError,
    source: {
      type: config.source.type,
      files: bot.cfg.files,
      connected: typeof bot.source.ready === 'boolean' ? bot.source.ready : true,
      ...s.sourceStat,
    },
    parseErrors: s.parseErrors,
    lastComputedAt: s.lastComputedAt,
    history: {
      dir: config.historyDir,
      keepDays: config.historyDays || 'todo',
      files: Object.fromEntries(Object.entries(bot.archives).map(([k, a]) => [k, a.stats()])),
    },
    sseClients: bot.sse.size,
    uptimeSec: Math.round(process.uptime()),
  });
});

app.post('/api/:bot/refresh', resolveBot, async (req, res) => {
  await reload(req.bot, 'manual');
  res.json({ ok: !req.bot.state.lastError, lastComputedAt: req.bot.state.lastComputedAt, error: req.bot.state.lastError });
});

// Descarga CSV con rango de fechas. ?dataset=...&from=YYYY-MM-DD&to=YYYY-MM-DD
app.get('/api/:bot/export.csv', resolveBot, async (req, res) => {
  const { bot } = req;
  const from = /^\d{4}-\d{2}-\d{2}$/.test(req.query.from || '') ? req.query.from : null;
  const to = /^\d{4}-\d{2}-\d{2}$/.test(req.query.to || '') ? req.query.to : null;
  const opts = { from, to, tz: config.tzOffsetHours, mask: config.maskPhones, stateTtlMs: config.bettyStateTtlSec * 1000 };
  try {
    const raw = await bot.source.read();
    const merged = archived(bot, raw); // exporta desde el historico completo
    const build = bot.cfg.engine === 'betty' ? bettyExport : oskitarExport;
    const { rows, name } = build(req.query.dataset, merged, opts);
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${name}"`);
    res.send('﻿' + toCSV(rows)); // BOM para que Excel lea UTF-8
  } catch (err) {
    console.error(`[${bot.cfg.id}:export] ${err.message}`);
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/:bot/stream', resolveBot, (req, res) => {
  const { bot } = req;
  res.set({ 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' });
  res.flushHeaders();
  res.write(`event: hello\ndata: ${JSON.stringify({ updatedAt: bot.state.lastComputedAt })}\n\n`);
  bot.sse.add(res);
  const keepAlive = setInterval(() => res.write(': ping\n\n'), 25000);
  req.on('close', () => { clearInterval(keepAlive); bot.sse.delete(res); });
});

// Compat: rutas sin bot -> primer bot (oskitar)
app.get('/api/analytics', (req, res) => res.redirect(307, `/api/${bots[0].cfg.id}/analytics${req.url.includes('?') ? req.url.slice(req.url.indexOf('?')) : ''}`));
app.get('/api/users', (req, res) => res.redirect(307, `/api/${bots[0].cfg.id}/users${req.url.includes('?') ? req.url.slice(req.url.indexOf('?')) : ''}`));
app.get('/api/health', (req, res) => res.redirect(307, `/api/${bots[0].cfg.id}/health`));

// -------------------------------------------------------------------------
// Estaticos (el tablero)
// -------------------------------------------------------------------------
app.use(express.static(path.join(__dirname, 'public')));

// -------------------------------------------------------------------------
// Arranque
// -------------------------------------------------------------------------
(async function bootstrap() {
  for (const bot of bots) {
    try {
      await bot.source.start(); // resuelve rapido; conecta en segundo plano si es SSH
    } catch (err) {
      bot.state.lastError = err.message;
      console.error(`[${bot.cfg.id}] ${err.message}`);
    }
    await reload(bot, 'startup');
  }

  app.listen(config.port, () => {
    console.log(`\n  Panel Gerencial — ${bots.map((b) => b.cfg.name).join(' + ')}`);
    console.log(`  Tablero:  http://localhost:${config.port}`);
    console.log(`  Fuente:   ${config.source.type}`);
    bots.forEach((b) => console.log(`  ${b.cfg.id.padEnd(8)} ${Object.values(b.cfg.files).join('  ')}`));
    console.log(`  API:      /api/bots  /api/<bot>/analytics  /api/<bot>/health  /api/<bot>/stream\n`);
  });
}());

process.on('SIGINT', () => {
  bots.forEach((b) => b.source.stop());
  process.exit(0);
});
