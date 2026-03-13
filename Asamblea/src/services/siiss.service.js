// src/services/siiss.service.js
// Integración con el API de SIISS para obtener el estado de ping de los puntos de venta
// Combina: ping propio (monitor_puntos_wpp.py) + ping SIISS (estacionesByPing)
'use strict';

const dns = require('node:dns');
if (dns.setDefaultResultOrder) dns.setDefaultResultOrder('ipv4first');

const { supabase } = require('../config/supabase');

// ── Redirigir logs a consola para este servicio ───────────────
const log = {
    info: (...args) => console.log('ℹ️ [SIISS]', ...args),
    warn: (...args) => console.warn('⚠️ [SIISS]', ...args),
    error: (...args) => console.error('❌ [SIISS]', ...args)
};

// ── Configuración ─────────────────────────────────────────────────────────────
const SIISS_BASE = process.env.SIISS_URL || 'http://10.192.168.8:8101';
const SIISS_USER = process.env.SIISS_USER || '123123123';
const SIISS_PASS = process.env.SIISS_PASS || 'CP123';
const FETCH_TIMEOUT_MS = 8000;

// ── Caché de token JWT (válido hasta las 11:59pm del día) ────────────────────
let _tokenCache = { token: null, expiresAt: null }; // expiresAt = hora 23:59 del día

function _isTodayToken() {
    if (!_tokenCache.token || !_tokenCache.expiresAt) return false;
    const now = new Date();
    return now < _tokenCache.expiresAt;
}

function _calcExpiry() {
    const d = new Date();
    d.setHours(23, 59, 0, 0);
    return d;
}

function _withTimeout(promise, ms) {
    return Promise.race([
        promise,
        new Promise((_, reject) =>
            setTimeout(() => reject(new Error(`SIISS timeout (${ms}ms)`)), ms)
        )
    ]);
}

// ── Login — obtiene token JWT ─────────────────────────────────────────────────
async function login() {
    log.info('[SIISS] Realizando login...');
    const resp = await _withTimeout(
        fetch(`${SIISS_BASE}/siiss-login/api/v1/qvaccesosys/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username: SIISS_USER, password: SIISS_PASS })
        }),
        FETCH_TIMEOUT_MS
    );

    if (!resp.ok) {
        throw new Error(`[SIISS] Login fallido: HTTP ${resp.status}`);
    }

    const data = await resp.json();
    if (!data.token) throw new Error('[SIISS] Login OK pero sin token en respuesta');

    _tokenCache = { token: data.token, expiresAt: _calcExpiry() };
    log.info(`[SIISS] Token obtenido. Válido hasta ${_tokenCache.expiresAt.toTimeString().slice(0, 5)}`);
    return _tokenCache.token;
}

// ── Obtener token (con caché) ─────────────────────────────────────────────────
async function getToken() {
    if (_isTodayToken()) return _tokenCache.token;
    return await login();
}

// ── fetchEstaciones — lista de puntos con estaping ──────────────────────────
async function fetchEstaciones() {
    const token = await getToken();
    const resp = await _withTimeout(
        fetch(`${SIISS_BASE}/siiss-basicas/api/v1/qvestaciones/estacionesByPing`, {
            headers: { Authorization: `Bearer ${token}` }
        }),
        FETCH_TIMEOUT_MS
    );

    if (!resp.ok) throw new Error(`[SIISS] fetchEstaciones: HTTP ${resp.status}`);
    const data = await resp.json();

    if (!Array.isArray(data)) throw new Error('[SIISS] Respuesta inesperada (no es un array)');
    log.info(`[SIISS] Estaciones recibidas: ${data.length}`);
    return data;
}

// ── syncPointsFromSiiss — cruza con Supabase, actualiza siiss_active y detecta transiciones ──
async function syncPointsFromSiiss() {
    log.info('[SIISS] Iniciando sync con Supabase...');
    const now = new Date().toISOString();
    let estaciones;

    try {
        estaciones = await fetchEstaciones();
    } catch (err) {
        log.error(`[SIISS] No se pudo obtener estaciones: ${err.message}`);
        return { ok: false, error: err.message };
    }

    // Construir mapa estacodi → { online: bool, ventaPromedio }
    const siissMap = {}; // { "ESTACODI": { online: bool, nombre: str } }
    for (const e of estaciones) {
        if (e.estacodi) {
            siissMap[String(e.estacodi).trim()] = {
                online: e.estaping === 1,
                nombre: e.estanomb || null,
            };
        }
    }

    const estacionCodes = Object.keys(siissMap);
    if (estacionCodes.length === 0) {
        log.warn('[SIISS] No hay estaciones con estacodi en la respuesta');
        return { ok: false, error: 'Sin estaciones en respuesta' };
    }

    // ─── Leer estado PREVIO de siiss_active para cada punto ──────────────────
    // Necesitamos esto para detectar transiciones offline→online y online→offline
    const { data: puntos, error: fetchErr } = await supabase
        .from('puntos_venta')
        .select('ip, name, alias, siiss_id, segment, siiss_active')
        .or('is_permanently_closed.eq.false,is_permanently_closed.is.null')
        .not('siiss_id', 'is', null);

    if (fetchErr) {
        log.error(`[SIISS] Error leyendo puntos_venta: ${fetchErr.message}`);
        return { ok: false, error: fetchErr.message };
    }

    // Preparar updates y eventos de transición
    const updates = [];
    const transitionEvents = []; // Eventos OPENED/CLOSED a registrar
    let matched = 0;
    let unmatched = 0;
    let openingsDetected = 0;
    let closingsDetected = 0;

    for (const punto of (puntos || [])) {
        const siissId = String(punto.siiss_id || '').trim();
        if (!siissId) { unmatched++; continue; }

        const siissEntry = siissMap[siissId];
        const newOnline = siissEntry ? siissEntry.online : false;
        const prevOnline = punto.siiss_active ?? false; // null → tratar como offline

        updates.push({
            ip: punto.ip,
            siiss_active: newOnline,
            siiss_last_sync: now,
        });

        if (siissEntry) {
            matched++;
        } else {
            unmatched++;
        }

        // ─── DETECCIÓN DE TRANSICIÓN ─────────────────────────────────────────
        const pointName = punto.name || punto.alias || siissId;

        if (!prevOnline && newOnline) {
            // TRANSICIÓN: offline → online — registrar como APERTURA SIISS
            log.info(`[SIISS] ⚡ Transición ABIERTO detectada: ${pointName} (${punto.ip})`);
            openingsDetected++;
            transitionEvents.push({
                point_ip: punto.ip,
                point_name: pointName,
                siiss_id: siissId,
                segment: punto.segment,
                event_type: 'OPENED',
                detected_at: now,
                previous_state: false,
                latency_ms: null,
                shift_context: 'SIISS', // Fuente: SIISS (no ping propio)
            });
        } else if (prevOnline && !newOnline) {
            // TRANSICIÓN: online → offline — registrar como CIERRE SIISS
            log.info(`[SIISS] 🔌 Transición CERRADO detectada: ${pointName} (${punto.ip})`);
            closingsDetected++;
            transitionEvents.push({
                point_ip: punto.ip,
                point_name: pointName,
                siiss_id: siissId,
                segment: punto.segment,
                event_type: 'CLOSED',
                detected_at: now,
                previous_state: true,
                latency_ms: null,
                shift_context: 'SIISS',
            });
        }
    }

    if (updates.length === 0) {
        log.warn('[SIISS] Ningún punto matcheó por siiss_id');
        return { ok: false, error: 'Sin matches por siiss_id', estaciones: estaciones.length, puntos: puntos?.length || 0 };
    }

    // ─── Upsert en puntos_venta en chunks de 100 ─────────────────────────────
    let errors = 0;
    for (let i = 0; i < updates.length; i += 100) {
        const chunk = updates.slice(i, i + 100);
        const { error: upsertErr } = await supabase
            .from('puntos_venta')
            .upsert(chunk, { onConflict: 'ip' });
        if (upsertErr) {
            log.error(`[SIISS] Error en upsert chunk ${i}: ${upsertErr.message}`);
            errors++;
        }
    }

    // ─── Insertar eventos de transición en point_activity_log ────────────────
    if (transitionEvents.length > 0) {
        const { error: evtErr } = await supabase
            .from('point_activity_log')
            .insert(transitionEvents);
        if (evtErr) {
            log.error(`[SIISS] Error insertando eventos de transición: ${evtErr.message}`);
        } else {
            log.info(`[SIISS] ✅ ${transitionEvents.length} evento(s) de transición registrados en point_activity_log`);
        }
    }

    log.info(`[SIISS] Sync completado — Matcheados: ${matched} | Sin match: ${unmatched} | ` +
        `Aperturas detectadas: ${openingsDetected} | Cierres detectados: ${closingsDetected} | Errores: ${errors}`);

    return {
        ok: errors === 0,
        matched,
        unmatched,
        errors,
        openingsDetected,
        closingsDetected,
        estacionesSiiss: estaciones.length,
        puntosSupabase: puntos?.length || 0,
        timestamp: now,
    };
}

// ── getStatus — diagnóstico rápido sin escribir en DB ────────────────────────
async function getStatus() {
    const estaciones = await fetchEstaciones();
    const activos = estaciones.filter(e => e.estaping === 1).length;
    const inactivos = estaciones.filter(e => e.estaping !== 1).length;
    return {
        ok: true,
        total: estaciones.length,
        activos,
        inactivos,
        sample: estaciones.slice(0, 5), // muestra los primeros 5 para debug
        timestamp: new Date().toISOString()
    };
}

module.exports = { syncPointsFromSiiss, getStatus, fetchEstaciones, login };
