// webhook.js
require("dotenv").config();
const express = require("express");
const crypto = require("crypto");

const app = express();
const PORT = process.env.PORT || 3001;

// Para validar firma necesitas el body "crudo"
app.use(
  express.json({
    verify: (req, res, buf) => {
      req.rawBody = buf;
    },
  })
);

// 1) Verificación (Meta hace GET con hub.challenge)
app.get("/webhook", (req, res) => {
  const mode = req.query["hub.mode"];
  const token = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];

  if (mode === "subscribe" && token === process.env.VERIFY_TOKEN) {
    return res.status(200).send(challenge);
  }
  return res.sendStatus(403);
});

// 2) Recepción de eventos (mensajes, statuses, etc.)
app.post("/webhook", (req, res) => {
  // ✅ LOG SIEMPRE (para depurar: ver si Meta realmente está pegando)
  console.log("✅ POST /webhook recibido");
  console.log("HEADERS:", req.headers);
  try {
    console.log("BODY:", JSON.stringify(req.body));
  } catch (e) {
    console.log("BODY: (no se pudo convertir a JSON)");
  }

  // (Opcional) Validar firma
  if (process.env.APP_SECRET) {
    const sig = req.get("X-Hub-Signature-256") || "";
    const expected =
      "sha256=" +
      crypto
        .createHmac("sha256", process.env.APP_SECRET)
        .update(req.rawBody)
        .digest("hex");

    if (!safeEqual(sig, expected)) {
      console.log("❌ Firma inválida. Sig:", sig, "Expected:", expected);
      return res.sendStatus(403);
    }
  }

  const body = req.body;

  // WhatsApp Business Account object
  if (body.object) {
    // Estructura típica: entry -> changes -> value
    for (const entry of body.entry || []) {
      for (const change of entry.changes || []) {
        const value = change.value || {};

        // Mensajes entrantes
        if (value.messages) {
          for (const msg of value.messages) {
            const from = msg.from; // wa_id del cliente
            const type = msg.type;

            const text =
              type === "text" ? (msg.text?.body || "").trim() : null;

            console.log("📩 Mensaje:", { from, type, text });
            // Si quieres ver el msg completo:
            // console.log("📩 Msg completo:", msg);
          }
        }

        // Estados de entrega (sent/delivered/read/failed)
        if (value.statuses) {
          for (const st of value.statuses) {
            console.log("📦 Status:", {
              id: st.id,
              status: st.status,
              recipient_id: st.recipient_id,
              timestamp: st.timestamp,
              errors: st.errors,
            });
          }
        }
      }
    }

    // IMPORTANTE: responder 200 rápido para que Meta no reintente
    return res.sendStatus(200);
  }

  return res.sendStatus(404);
});

function safeEqual(a, b) {
  try {
    const aa = Buffer.from(a);
    const bb = Buffer.from(b);
    if (aa.length !== bb.length) return false;
    return crypto.timingSafeEqual(aa, bb);
  } catch {
    return false;
  }
}

app.listen(PORT, "0.0.0.0", () =>
  console.log(`✅ Webhook activo en http://localhost:${PORT}/webhook`)
);
