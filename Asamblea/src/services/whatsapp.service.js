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

async function simulateTypingDelay(toWaId, textOrPayload, opts = {}) {
  if (!opts.simulateTyping) return;
  // Si es un objeto (payload), extraemos el texto relevante para el delay
  let text = "";
  if (typeof textOrPayload === "string") {
    text = textOrPayload;
  } else if (textOrPayload?.text?.body) {
    text = textOrPayload.text.body;
  } else if (textOrPayload?.interactive?.body?.text) {
    text = textOrPayload.interactive.body.text;
  }

  await sendChatAction(toWaId, "typing", opts);
  const delay = Math.min(Math.max(text.length * 20, 1000), 4000);
  await new Promise(r => setTimeout(r, delay));
}

async function sendText(toWaId, text, opts = {}) {
  await simulateTypingDelay(toWaId, text, opts);

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

  if (action === "typing") {
    // v3.6: Deshabilitado el payload 'sender_action' por inconsistencias en Cloud API.
    // Solo simulamos el retraso visual para mejorar la experiencia sin causar errores.
    return { ok: true };
  }

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
  const payload = {
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
  };

  await simulateTypingDelay(toWaId, payload, opts);
  return waPost(payload, opts);
}

async function sendList(toWaId, bodyText, buttonText, sections, opts = {}) {
  const payload = {
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
  };

  await simulateTypingDelay(toWaId, payload, opts);
  return waPost(payload, opts);
}

/**
 * Upload media to WhatsApp and return media_id
 */
async function uploadMedia(filePath, mediaType = "image", mimeType = "image/png", opts = {}) {
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
  const fileBlob = new Blob([fileBuffer], { type: mimeType });

  const form = new FormData();
  form.append("messaging_product", "whatsapp");
  form.append("file", fileBlob, path.basename(filePath));
  form.append("type", mediaType);

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
  const isRemoteUrl = typeof imagePath === 'string' &&
    (imagePath.startsWith('http://') || imagePath.startsWith('https://'));

  let imagePayload;

  if (isRemoteUrl) {
    // ✅ URL remota: WhatsApp la descarga directamente usando link
    imagePayload = { link: imagePath };
  } else {
    // 📁 Archivo local: subir primero y usar media_id (type: image)
    const upload = await uploadMedia(imagePath, "image", "image/png", opts);
    if (!upload.ok) {
      console.error("❌ Failed to upload image:", upload);
      return { ok: false, status: 0, data: { error: "media_upload_failed", details: upload } };
    }
    imagePayload = { id: upload.media_id };
  }

  if (caption) {
    imagePayload.caption = String(caption);
  }

  const payload = {
    messaging_product: "whatsapp",
    to: toWaId,
    type: "image",
    image: imagePayload,
  };

  if (caption) {
    await simulateTypingDelay(toWaId, caption, opts);
  } else {
    await new Promise(r => setTimeout(r, 1000)); // Delay base para fotos sin caption
  }

  return waPost(payload, opts);
}

/**
 * Send sticker to WhatsApp using media_id
 * WhatsApp stickers MUST be .webp format.
 */
async function sendSticker(toWaId, stickerPath, opts = {}) {
  const isRemoteUrl = typeof stickerPath === 'string' &&
    (stickerPath.startsWith('http://') || stickerPath.startsWith('https://'));

  let stickerPayload;

  if (isRemoteUrl) {
    stickerPayload = { link: stickerPath };
  } else {
    // 📁 Archivo local: subir primero como category 'sticker' y mime 'image/webp'
    const upload = await uploadMedia(stickerPath, "sticker", "image/webp", opts);
    if (!upload.ok) {
      console.error("❌ Failed to upload sticker:", upload);
      return { ok: false, status: 0, data: { error: "sticker_upload_failed", details: upload } };
    }
    stickerPayload = { id: upload.media_id };
  }

  const payload = {
    messaging_product: "whatsapp",
    to: toWaId,
    type: "sticker",
    sticker: stickerPayload,
  };

  await new Promise(r => setTimeout(r, 800)); // Delay para stickers
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

module.exports = { sendText, sendTextChunked, sendTextMany, sendButtons, sendList, sendPhoto, sendSticker, sendReaction, sendChatAction, chunkText };
