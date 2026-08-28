/**
 * Script de DIAGNÓSTICO — no escribe nada al Excel, no modifica estado.
 * Úsalo primero para validar que la conexión y el nombre de carpeta son
 * correctos antes de correr index.js de verdad.
 *
 * Uso: node diagnostico.js
 */
require("dotenv").config();
const { ImapFlow } = require("imapflow");

async function main() {
  console.log("Conectando a", process.env.IMAP_HOST, "puerto", process.env.IMAP_PORT, "...");

  const client = new ImapFlow({
    host: process.env.IMAP_HOST,
    port: Number(process.env.IMAP_PORT),
    secure: true,
    auth: { user: process.env.IMAP_USER, pass: process.env.IMAP_PASSWORD },
    logger: false,
  });

  try {
    await client.connect();
    console.log("✅ Login exitoso como", process.env.IMAP_USER);
  } catch (err) {
    console.error("❌ Falló el login. Revisa IMAP_USER / IMAP_PASSWORD en .env");
    console.error("   Detalle:", err.message);
    return;
  }

  console.log("\nListando carpetas disponibles en el buzón:");
  const list = await client.list();
  list.forEach((f) => console.log("  -", f.path));

  const folder = process.env.IMAP_FOLDER || "INBOX";
  console.log(`\nIntentando abrir la carpeta configurada: "${folder}"`);

  try {
    const lock = await client.getMailboxLock(folder, { readOnly: true });
    try {
      const mailbox = client.mailbox;
      console.log(`✅ Carpeta abierta. Total de mensajes: ${mailbox.exists}, UIDNext: ${mailbox.uidNext}`);

      console.log("\nMostrando los 3 correos más recientes (sin marcarlos como leídos, sin procesarlos):\n");
      const desde = Math.max(1, mailbox.uidNext - 3);
      for await (const msg of client.fetch(
        `${desde}:${mailbox.uidNext - 1}`,
        { envelope: true, uid: true },
        { uid: true }
      )) {
        console.log(`  UID ${msg.uid} | ${msg.envelope?.date} | ${msg.envelope?.subject}`);
      }
    } finally {
      lock.release();
    }
  } catch (err) {
    console.error(`❌ No se pudo abrir la carpeta "${folder}".`);
    console.error("   Revisa el listado de carpetas arriba y ajusta IMAP_FOLDER en .env");
    console.error("   Detalle:", err.message);
  } finally {
    await client.logout();
  }
}

main().catch((err) => {
  console.error("Error inesperado:", err.message);
  process.exit(1);
});
