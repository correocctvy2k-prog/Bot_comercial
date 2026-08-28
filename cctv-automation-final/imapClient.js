/**
 * Cliente IMAP de SOLO LECTURA para la carpeta designada.
 *
 * Filosofía de seguridad (consistente con el resto de la arquitectura):
 * - Nunca borra ni mueve correos en el servidor.
 * - Nunca escribe/envía nada por correo.
 * - Solo lee mensajes nuevos (UID mayor al último procesado) y los deja
 *   intactos. El control de "ya procesado" vive en un archivo de estado
 *   local (state.json), no en el servidor.
 */

const { ImapFlow } = require("imapflow");
const fs = require("fs");
const path = require("path");
const { runtimePaths } = require("./config/runtime-paths");

const STATE_PATH = runtimePaths.imapStatePath;

function loadState() {
  if (!fs.existsSync(STATE_PATH)) return { lastUid: 0 };
  try {
    return JSON.parse(fs.readFileSync(STATE_PATH, "utf8"));
  } catch {
    return { lastUid: 0 };
  }
}

function saveState(state) {
  fs.mkdirSync(path.dirname(STATE_PATH), { recursive: true });
  fs.writeFileSync(STATE_PATH, JSON.stringify(state, null, 2));
}

async function fetchNewEmails(config) {
  const client = new ImapFlow({
    host: config.host,
    port: Number(config.port),
    secure: true,
    auth: { user: config.user, pass: config.password },
    logger: false,
  });

  const state = loadState();
  const emails = [];

  await client.connect();
  try {
    const lock = await client.getMailboxLock(config.folder, { readOnly: true });
    try {
      const mailbox = client.mailbox;
      const uidNext = mailbox.uidNext;

      // En una reconstrucción controlada se pueden procesar todos los
      // mensajes que aún existen en la carpeta. El modo normal conserva
      // una línea base limitada a los últimos 200 UID.
      const desde =
        state.lastUid > 0
          ? state.lastUid + 1
          : config.processAllOnFirstRun
          ? 1
          : Math.max(1, uidNext - 200);

      if (desde >= uidNext) {
        return { emails: [], newLastUid: state.lastUid };
      }

      for await (const msg of client.fetch(
        `${desde}:${uidNext - 1}`,
        { envelope: true, source: true, uid: true },
        { uid: true }
      )) {
        const parsed = await parseRawMessage(msg.source);
        emails.push({
          uid: msg.uid,
          subject: msg.envelope?.subject || "",
          from: msg.envelope?.from?.[0]?.address || "",
          date: msg.envelope?.date,
          hasAttachment: parsed.hasAttachment,
          body: parsed.body,
        });
      }
    } finally {
      lock.release();
    }
  } finally {
    // Si el servidor cerró la sesión durante una descarga extensa, logout()
    // también falla y puede ocultar el error original.
    if (client.usable) {
      await client.logout();
    } else {
      client.close();
    }
  }

  const newLastUid = emails.length ? Math.max(...emails.map((e) => e.uid)) : state.lastUid;
  return { emails, newLastUid };
}

// Parseo mínimo del mensaje crudo (evita dependencia pesada de mailparser
// para el cuerpo de texto plano, que es lo único que necesitamos aquí).
async function parseRawMessage(source) {
  const { simpleParser } = require("mailparser");
  const parsed = await simpleParser(source);
  return {
    body: parsed.text || "",
    hasAttachment: (parsed.attachments || []).length > 0,
  };
}

function commitState(newLastUid) {
  saveState({ lastUid: newLastUid, updatedAt: new Date().toISOString() });
}

module.exports = { fetchNewEmails, commitState, loadState };
