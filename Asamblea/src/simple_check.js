// src/simple_check.js
try {
    const wa = require("./services/whatsapp.service");
    console.log("✅ El servicio de WhatsApp se cargó correctamente.");
    console.log("Funciones disponibles:", Object.keys(wa).join(", "));
} catch (err) {
    console.error("❌ Error al cargar el servicio:", err);
}
