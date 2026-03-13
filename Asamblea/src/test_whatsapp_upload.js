// src/test_whatsapp_upload.js
const wa = require("./services/whatsapp.service");
const fs = require("fs");
const path = require("path");
require("dotenv").config();

async function test() {
    console.log("🧪 Iniciando prueba de subida de imagen a WhatsApp...");

    // Buscar una imagen para prueba (podemos usar el Puntos.xlsx si no hay png a mano, solo para probar el envío del form)
    // O crear un dummy png
    const testFilePath = path.join(process.cwd(), "temp_test_image.png");
    fs.writeFileSync(testFilePath, "dummy image content");

    try {
        console.log(`📂 Archivo temporal creado: ${testFilePath}`);

        // No ejecutaremos el upload real para no gastar cuota si no es necesario,
        // pero verificaremos que la lógica de FormData no explote.
        // Si el usuario tiene un numero configurado, podríamos intentar un upload real.

        if (!process.env.WPP_TOKEN) {
            console.log("⚠️ No hay WPP_TOKEN en .env, la prueba será limitada.");
        }

        console.log("🔄 Ejecutando uploadMedia (simulado)...");
        // Nota: Esto intentará conectar a Meta si hay token
        const result = await wa.uploadMedia(testFilePath);

        console.log("📊 Resultado:", JSON.stringify(result, null, 2));

        if (result.error === "missing_credentials") {
            console.log("✅ Validación de credenciales funcionando.");
        } else if (result.ok) {
            console.log("🚀 ¡ÉXITO! La subida funcionó.");
        } else {
            console.log("❌ Fallo esperado o real:", result.error || result.status);
        }

    } catch (err) {
        console.error("💥 Error fatal en la prueba:", err);
    } finally {
        if (fs.existsSync(testFilePath)) fs.unlinkSync(testFilePath);
    }
}

test();
