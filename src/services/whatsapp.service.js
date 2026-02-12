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

async function waPost(payload) {
  assertConfig();

  if (!hasFetch()) {
    return { ok: false, status: 0, data: { error: "fetch_missing", detail: "Node >= 18 o polyfill requerido." } };
  }

  const url = `https://graph.facebook.com/${WPP_VERSION}/${PHONE_NUMBER_ID}/messages`;

  let resp;
  try {
    resp = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${WPP_TOKEN}`,
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

async function sendText(toWaId, text) {
  return waPost({
    messaging_product: "whatsapp",
    to: toWaId,
    type: "text",
    text: { body: String(text || ""), preview_url: false },
  });
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
    last = await sendText(toWaId, prefix + parts[i]);

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

    last = await sendText(toWaId, msg);
    if (!last.ok && stopOnFail) return last;

    if (delayMs && i < list.length - 1) {
      await new Promise((r) => setTimeout(r, delayMs));
    }
  }

  return last || { ok: true, status: 200, data: {} };
}

async function sendButtons(toWaId, bodyText, buttons) {
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
  });
}

async function sendList(toWaId, bodyText, buttonText, sections) {
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
  });
}

module.exports = { sendText, sendTextChunked, sendTextMany, sendButtons, sendList, chunkText };
