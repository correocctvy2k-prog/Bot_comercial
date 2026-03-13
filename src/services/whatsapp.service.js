// src/services/whatsapp.service.js
// Usa: WPP_TOKEN, WPP_VERSION, PHONE_NUMBER_ID desde .env

const { WPP_VERSION, PHONE_NUMBER_ID, WPP_TOKEN } = require("../config/env");

function assertConfig() {
  const missing = [];
  if (!WPP_VERSION) missing.push("WPP_VERSION");
  if (!PHONE_NUMBER_ID) missing.push("PHONE_NUMBER_ID");
  if (!WPP_TOKEN) missing.push("WPP_TOKEN");
  if (missing.length) {
    throw new Error(
      `Faltan variables de entorno: ${missing.join(", ")}. ` +
      `Revisa tu .env (ej: WPP_VERSION=v22.0, PHONE_NUMBER_ID=..., WPP_TOKEN=...)`
    );
  }
}

function hasFetch() {
  return typeof fetch === "function";
}

async function waPost(payload, opts = {}) {
  let token = opts.token || WPP_TOKEN;
  let phoneNumberId = opts.phone_number_id || PHONE_NUMBER_ID;
  const version = WPP_VERSION;

  if (!token || !phoneNumberId || !version) {
    console.error("❌ Missing credentials for WhatsApp API");
    return { ok: false, status: 0, data: { error: "missing_credentials" } };
  }

  if (!hasFetch()) {
    return { ok: false, status: 0, data: { error: "fetch_missing", detail: "Node >= 18 o polyfill requerido." } };
  }

  const url = `https://graph.facebook.com/${version}/${phoneNumberId}/messages`;

  let resp;
  try {
    resp = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });
  } catch (err) {
    console.log("❌ WhatsApp fetch error:", err?.message || err);
    return { ok: false, status: 0, data: { error: "fetch_failed", detail: String(err) } };
  }

  const data = await resp.json().catch(() => ({}));

  if (!resp.ok) {
    console.log("❌ WhatsApp API error:", resp.status, JSON.stringify(data, null, 2));
    return { ok: false, status: resp.status, data };
  }

  return { ok: true, status: resp.status, data };
}

async function sendText(toWaId, text, opts = {}) {
  // Humanización: Simular "typing" si se requiere
  if (opts.simulateTyping) {
    await sendChatAction(toWaId, "typing", opts);
    const delay = Math.min(Math.max((text || "").length * 20, 1000), 4000);
    await new Promise(r => setTimeout(r, delay));
  }

  return waPost({
    messaging_product: "whatsapp",
    to: toWaId,
    type: "text",
    text: { body: String(text || ""), preview_url: false },
  }, opts);
}

/**
 * ✅ NUEVO: Simulación de acciones de chat (Typing, Mark as Read)
 */
async function sendChatAction(toWaId, action = "typing", opts = {}) {
  // WhatsApp Cloud API usa el endpoint de messages con el campo status
  if (action === "read") {
    // El payload para marcar como leído requiere el message_id
    if (!opts.message_id) return { ok: false, error: "message_id_required" };
    return waPost({
      messaging_product: "whatsapp",
      status: "read",
      message_id: opts.message_id
    }, opts);
  }

  // Nota: WhatsApp Cloud API no tiene un evento "typing" oficial via HTTP POST 
  // para el cliente final como Telegram, pero podemos simularlo con un delay controlado
  // o marcar como leído antes de contestar.
  // Por ahora, simularemos el delay en sendText y aquí solo marcamos como "read" si aplica.
  return { ok: true };
}

function chunkText(text, maxLen = 3500) {
  const s = String(text || "");
  if (s.length <= maxLen) return [s];

  const chunks = [];
  let start = 0;

  while (start < s.length) {
    let end = Math.min(start + maxLen, s.length);
    const lastNl = s.lastIndexOf("\n", end);
    if (lastNl > start + 500) end = lastNl + 1;

    chunks.push(s.slice(start, end));
    start = end;
  }
  return chunks;
}

async function sendTextChunked(toWaId, text, opts = {}) {
  const maxLen = Number(opts.maxLen || 3500);
  const delayMs = Number(opts.delayMs || 350);
  const parts = chunkText(text, maxLen);

  let last = null;
  for (let i = 0; i < parts.length; i++) {
    const prefix = parts.length > 1 ? `📄 Parte ${i + 1}/${parts.length}\n\n` : "";
    last = await sendText(toWaId, prefix + parts[i], opts);

    if (!last.ok) return last;

    if (delayMs && i < parts.length - 1) {
      await new Promise((r) => setTimeout(r, delayMs));
    }
  }
  return last || { ok: true, status: 200, data: {} };
}

/**
 * ✅ NUEVO: envía un ARRAY de mensajes ya “armados” (ideal si Python devuelve messages[])
 * - No parte ni reordena.
 * - Solo envía en secuencia, con delay.
 */
async function sendTextMany(toWaId, messages, opts = {}) {
  const delayMs = Number(opts.delayMs || 350);
  const stopOnFail = opts.stopOnFail !== false;

  const list = Array.isArray(messages) ? messages : [];
  if (!list.length) return { ok: false, status: 0, data: { error: "empty_messages" } };

  let last = null;
  for (let i = 0; i < list.length; i++) {
    const msg = String(list[i] || "").trim();
    if (!msg) continue;

    last = await sendText(toWaId, msg, opts);
    if (!last.ok && stopOnFail) return last;

    if (delayMs && i < list.length - 1) {
      await new Promise((r) => setTimeout(r, delayMs));
    }
  }

  return last || { ok: true, status: 200, data: {} };
}

async function sendButtons(toWaId, bodyText, buttons, opts = {}) {
  return waPost({
    messaging_product: "whatsapp",
    to: toWaId,
    type: "interactive",
    interactive: {
      type: "button",
      body: { text: String(bodyText || "") },
      action: {
        buttons: (buttons || []).slice(0, 3).map((b) => ({
          type: "reply",
          reply: { id: String(b.id), title: String(b.title) },
        })),
      },
    },
  }, opts);
}

async function sendList(toWaId, bodyText, buttonText, sections, opts = {}) {
  return waPost({
    messaging_product: "whatsapp",
    to: toWaId,
    type: "interactive",
    interactive: {
      type: "list",
      body: { text: String(bodyText || "") },
      action: {
        button: buttonText || "Ver opciones",
        sections: (sections || []).map((s) => ({
          title: String(s.title || ""),
          rows: (s.rows || []).map((r) => ({
            id: String(r.id),
            title: String(r.title),
            ...(r.description ? { description: String(r.description) } : {}),
          })),
        })),
      },
    },
  }, opts);
}

/**
 * Upload media to WhatsApp and return media_id
 */
async function uploadMedia(filePath, opts = {}) {
  let token = opts.token || WPP_TOKEN;
  let phoneNumberId = opts.phone_number_id || PHONE_NUMBER_ID;
  const version = WPP_VERSION;

  if (!token || !phoneNumberId || !version) {
    return { ok: false, error: "missing_credentials" };
  }

  const fs = require("fs");
  const path = require("path");

  if (!fs.existsSync(filePath)) {
    return { ok: false, error: "file_not_found" };
  }

  const fileBuffer = fs.readFileSync(filePath);
  const fileBlob = new Blob([fileBuffer], { type: "image/png" });

  const form = new FormData();
  form.append("messaging_product", "whatsapp");
  form.append("file", fileBlob, path.basename(filePath));
  form.append("type", "image/png");

  const url = `https://graph.facebook.com/${version}/${phoneNumberId}/media`;

  try {
    const resp = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        // Nota: Con FormData nativo y fetch nativo, NO se debe poner Content-Type manual,
        // fetch lo calcula automáticamente incluyendo el boundary.
      },
      body: form,
    });

    const data = await resp.json().catch(() => ({}));

    if (!resp.ok) {
      console.error("❌ WhatsApp Media Upload error:", resp.status, JSON.stringify(data, null, 2));
      return { ok: false, status: resp.status, data };
    }

    return { ok: true, media_id: data.id };
  } catch (err) {
    console.error("❌ Media upload failed:", err?.message || err);
    return { ok: false, error: "upload_failed", detail: String(err) };
  }
}

/**
 * Send image to WhatsApp using media_id
 */
async function sendPhoto(toWaId, imagePath, caption, opts = {}) {
  // Upload image first
  const upload = await uploadMedia(imagePath, opts);

  if (!upload.ok) {
    console.error("❌ Failed to upload image:", upload);
    return { ok: false, status: 0, data: { error: "media_upload_failed", details: upload } };
  }

  // Send image message
  const payload = {
    messaging_product: "whatsapp",
    to: toWaId,
    type: "image",
    image: {
      id: upload.media_id,
    },
  };

  if (caption) {
    payload.image.caption = String(caption);
  }

  return waPost(payload, opts);
}

/**
 * Send reaction to a message
 */
async function sendReaction(toWaId, reactionEmoji, messageId, opts = {}) {
  return waPost({
    messaging_product: "whatsapp",
    to: toWaId,
    type: "reaction",
    reaction: {
      message_id: messageId,
      emoji: reactionEmoji
    }
  }, opts);
}

module.exports = { sendText, sendTextChunked, sendTextMany, sendButtons, sendList, sendPhoto, sendReaction, chunkText };
