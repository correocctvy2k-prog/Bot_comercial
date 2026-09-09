'use strict';

/**
 * Parser tolerante del log de conversaciones de Oskitar.
 *
 * Cada linea del archivo es un objeto JSON independiente (formato JSON Lines)
 * generado por el logger del chatbot. Ejemplo:
 *
 *   {"level":"info","message":{"content":"Hola","direction":"IN",
 *     "from":"573173184631","messageId":"wamid...","type":"text"},
 *     "timestamp":"2026-09-02T14:25:39.639Z"}
 *
 * El parser NUNCA lanza por una linea corrupta: la cuenta y sigue, de modo que
 * un log parcialmente escrito (mientras el chatbot lo llena) no tumba el panel.
 */

/**
 * Normaliza un evento crudo del log a la forma que consume la analitica.
 * @typedef {Object} NormalizedEvent
 * @property {Date}    ts        Momento del evento (UTC)
 * @property {string}  iso       Timestamp original ISO-8601
 * @property {'IN'|'OUT'} direction  IN = usuario -> bot, OUT = bot -> usuario
 * @property {string}  peer      Telefono del ciudadano (from o to)
 * @property {string}  type      text | interactive | image | audio | video | unknown
 * @property {string|null} content  Texto del mensaje (null si es solo multimedia)
 * @property {boolean} hasMedia  true si trae adjunto
 * @property {string|null} mediaUrl
 * @property {string|null} mimeType
 * @property {string|null} messageId
 */

/**
 * @param {string} text  Contenido completo (o parcial) del archivo de log.
 * @returns {{events: NormalizedEvent[], parseErrors: number, totalLines: number}}
 */
function parseLog(text) {
  const rawLines = String(text || '').split(/\r?\n/);
  const events = [];
  let parseErrors = 0;
  let totalLines = 0;

  for (const raw of rawLines) {
    const line = raw.trim();
    if (!line) continue;
    totalLines += 1;

    let obj;
    try {
      obj = JSON.parse(line);
    } catch (_) {
      parseErrors += 1;
      continue;
    }

    const msg = obj && obj.message;
    if (!msg || !obj.timestamp) {
      parseErrors += 1;
      continue;
    }

    const ts = new Date(obj.timestamp);
    if (Number.isNaN(ts.getTime())) {
      parseErrors += 1;
      continue;
    }

    const direction = msg.direction === 'IN' ? 'IN' : 'OUT';
    const peer = msg.from || msg.to || 'desconocido';

    events.push({
      ts,
      iso: obj.timestamp,
      direction,
      peer: String(peer),
      type: msg.type || 'unknown',
      content: typeof msg.content === 'string' ? msg.content : null,
      hasMedia: Boolean(msg.mediaUrl || msg.mediaId),
      mediaUrl: msg.mediaUrl || null,
      mimeType: msg.mimeType || null,
      messageId: msg.messageId || null,
    });
  }

  events.sort((a, b) => a.ts - b.ts);
  return { events, parseErrors, totalLines };
}

module.exports = { parseLog };
