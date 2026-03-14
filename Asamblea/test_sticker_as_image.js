// Asamblea/test_sticker_as_image.js
require('dotenv').config();
const Messaging = require('./src/services/whatsapp.service');
const path = require('path');

async function test() {
    const waId = process.argv[2];
    if (!waId) {
        console.error("❌ Por favor indica el número de WhatsApp.");
        process.exit(1);
    }

    const filePath = path.join(__dirname, 'assets/logo_gane_sticker.webp');
    console.log(`🚀 Probando envío de .webp como IMAGEN a: ${waId}`);
    
    try {
        // Usamos sendPhoto pero pasando el .webp
        const res = await Messaging.sendPhoto(waId, filePath, "Prueba de archivo .webp como imagen");
        if (res.ok) {
            console.log("✅ ¡Enviado con éxito (como imagen)!");
            console.log("🆔 Message ID:", res.data?.messages?.[0]?.id);
        } else {
            console.error("❌ Error:", JSON.stringify(res.data, null, 2));
        }
    } catch (e) {
        console.error("❌ Fallo:", e.message);
    }
}

test();
