// src/routes/webhook.routes.js
const express = require("express");
const router = express.Router();

const {
  verifyWebhookGet,
  handleWebhookPost,
  handleTelegramWebhook,
  handleTelegramAsambleaWebhook,
  handleSendWhatsApp
} = require("../controllers/webhook.controller");
const { supabase } = require('../config/supabase');
const apiAsamblea = require('../services/api.asamblea.service');
const { getAsamSession } = require('../services/ai.service');

// ── Timeout helper ──────────────────────────────────────────────────────────
function withTimeout(promise, ms) {
  return Promise.race([
    promise,
    new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), ms))
  ]);
}

// ── GET /api/health — Estado de todos los componentes del sistema ────────────
router.get('/api/health', async (req, res) => {
  const checks = {};
  const t = 4000; // timeout 4s por servicio

  await Promise.allSettled([
    // 1. WhatsApp Meta Graph API — usa las variables correctas del bot
    (async () => {
      try {
        const token = process.env.WPP_TOKEN;
        const phoneId = process.env.PHONE_NUMBER_ID;
        const version = process.env.WPP_VERSION || 'v22.0';
        if (!token || !phoneId) { checks.whatsapp = { ok: false, detail: 'WPP_TOKEN o PHONE_NUMBER_ID no configurados' }; return; }
        const r = await withTimeout(
          fetch(`https://graph.facebook.com/${version}/${phoneId}`, {
            headers: { Authorization: `Bearer ${token}` }
          }), t
        );
        checks.whatsapp = { ok: r.ok, detail: r.ok ? 'API disponible' : `HTTP ${r.status}` };
      } catch (e) {
        checks.whatsapp = { ok: false, detail: 'Sin acceso a Meta' };
      }
    })()
  ]);

  res.json({ timestamp: new Date().toISOString(), checks });
});

// ── Normalización de teléfono ───────────────────────────────────────────────
function normalizePhone(phone) {
  if (!phone) return null;
  let clean = String(phone).replace(/\D/g, '');
  if (clean.length === 10) return `57${clean}`;
  if (clean.length === 12 && clean.startsWith('57')) return clean;
  return clean;
}

// ── GET /api/asamblea/faltantes — Lista de asociados que NO han ingresado ──
router.get('/api/asamblea/faltantes', async (req, res) => {
  try {
    const censo = await apiAsamblea.obtenerCensoAsamblea();
    if (!censo || censo.length === 0) {
      return res.status(500).json({ error: "No se pudo obtener el censo desde SIISS." });
    }

    const { data: registradosData, error } = await supabase
      .from('asamblea_registro')
      .select('documento');

    if (error) throw error;

    const setRegistrados = new Set(registradosData.map(r => String(r.documento)));

    const faltantes = censo
      .filter((acc) => !setRegistrados.has(String(acc.accicodi)))
      .map((acc) => ({
        documento: String(acc.accicodi),
        nombre: acc.accinomb
      }));

    res.json({
      totalCenso: censo.length,
      totalFaltantes: faltantes.length,
      faltantes
    });
  } catch (error) {
    console.error("Error en /api/asamblea/faltantes:", error);
    res.status(500).json({ error: "Error calculando faltantes", msg: error.message });
  }
});

// ── POST /api/asamblea/sync-padron — Sincroniza SIISS con Padrón Supabase ─────
router.post('/api/asamblea/sync-padron', async (req, res) => {
  console.log("🔄 [API] Solicitud de sincronización SIISS -> Padrón...");
  try {
    const censo = await apiAsamblea.obtenerCensoAsamblea();
    if (!censo || censo.length === 0) {
      return res.status(500).json({ error: "No se pudo obtener el censo de SIISS." });
    }

    const autorizados = censo
      .filter(item => item.accitele && String(item.accitele).trim() !== "")
      .map(item => ({
        wa_id: normalizePhone(item.accitele),
        nombre: item.accinomb,
        documento: String(item.accicodi)
      }));

    if (autorizados.length === 0) {
      return res.status(400).json({ error: "No se encontraron registros válidos para sincronizar." });
    }

    const { error } = await supabase
      .from('asamblea_padron')
      .upsert(autorizados, { onConflict: 'wa_id' });

    if (error) throw error;

    res.json({ success: true, count: autorizados.length });
  } catch (error) {
    console.error("Error en /api/asamblea/sync-padron:", error);
    res.status(500).json({ error: "Error en sincronización", msg: error.message });
  }
});


// NUEVO: Borrar resultados del quiz (votos y encuestas)
router.delete('/api/asamblea/quiz/clear', async (req, res) => {
  try {
    console.log("🗑️ [Quiz] Solicitud de reinicio de quiz recibida.");

    // 1. Borrar todos los votos
    const { error: errorVotos } = await supabase
      .from('asamblea_votos')
      .delete()
      .not('id', 'is', null);

    if (errorVotos) throw errorVotos;

    // 2. Borrar todas las encuestas
    const { error: errorEncuestas } = await supabase
      .from('asamblea_encuestas')
      .delete()
      .not('id', 'is', null);

    if (errorEncuestas) throw errorEncuestas;

    console.log("✅ [Quiz] Resultados eliminados correctamente.");
    res.json({ success: true, message: "Resultados del quiz eliminados." });
  } catch (error) {
    console.error("❌ Error al reiniciar quiz:", error);
    res.status(500).json({ error: "Error reiniciando quiz", msg: error.message });
  }
});


router.get("/webhook", verifyWebhookGet);
router.post("/webhook", handleWebhookPost);

// v12.3.0: Telegram Direct Webhook para BOT DE ASAMBLEA
router.post("/webhook/telegram-asamblea", handleTelegramAsambleaWebhook);

module.exports = router;

module.exports = router;
