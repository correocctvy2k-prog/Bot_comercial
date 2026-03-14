// Asamblea/test_sticker.js
require('dotenv').config();
const Messaging = require('./src/services/whatsapp.service');
const path = require('path');

async function testSticker() {
    const waId = process.argv[2]; // Captura el número desde la línea de comandos
    if (!waId) {
        console.error("❌ Por favor indica el número de WhatsApp (ej: 57317...).");
        process.exit(1);
    }

    const stickerPath = path.join(__dirname, 'assets/logo_gane_sticker.webp');
    console.log(`🚀 Probando envío de sticker a: ${waId}`);
    console.log(`📂 Archivo: ${stickerPath}`);

    try {
        const res = await Messaging.sendSticker(waId, stickerPath);
        if (res.ok) {
            console.log("✅ ¡Sticker enviado con éxito por la API!");
            console.log("🆔 Message ID:", res.data?.messages?.[0]?.id);
        } else {
            console.error("❌ Error al enviar sticker:", JSON.stringify(res.data, null, 2));
        }
    } catch (e) {
        console.error("❌ Fallo crítico en la prueba:", e.message);
    }
}

testSticker();
