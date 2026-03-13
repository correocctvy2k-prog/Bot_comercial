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

// ── GET /api/asamblea/faltantes — Lista de asociados que NO han ingresado ──
router.get('/api/asamblea/faltantes', async (req, res) => {
  try {
    // 1. Array de objetos crudos de la API QUORUM
    const censo = await apiAsamblea.obtenerCensoAsamblea();
    if (!censo || censo.length === 0) {
      return res.status(500).json({ error: "No se pudo obtener el censo desde SIISS." });
    }

    // 2. Traer todos los documentos ya registrados en Supabase
    const { data: registradosData, error } = await supabase
      .from('asamblea_registro')
      .select('documento');

    if (error) throw error;

    // Convertir a un Set de strings para cruce ultra rápido
    const setRegistrados = new Set(registradosData.map(r => String(r.documento)));

    // 3. Filtrar el censo original para quitar los que ya están en el Set
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


router.get("/webhook", verifyWebhookGet);
router.post("/webhook", handleWebhookPost);

// v12.3.0: Telegram Direct Webhook para BOT DE ASAMBLEA
router.post("/webhook/telegram-asamblea", handleTelegramAsambleaWebhook);

module.exports = router;

module.exports = router;
