const { PHONE_NUMBER_ID, WPP_TOKEN } = require("./src/config/env");

console.log("-----------------------------------------");
console.log("🔍 DIAGNÓSTICO DE IDENTIDAD DEL BOT");
console.log("-----------------------------------------");
console.log(`🆔 PHONE_NUMBER_ID actual: ${PHONE_NUMBER_ID}`);
console.log(`🔑 Token (primeros 10 caracteres): ${WPP_TOKEN ? WPP_TOKEN.substring(0, 10) + "..." : "FALTANTE"}`);
console.log("-----------------------------------------");

if (PHONE_NUMBER_ID === "768295286375013") {
    console.log("❌ ATENCIÓN: Sigues usando el ID del número VIEJO.");
} else if (PHONE_NUMBER_ID === "1036261636236861" || PHONE_NUMBER_ID === "1073623179160908") {
    console.log("✅ El bot está configurado con el número NUEVO.");
    console.log(`ID Detectado: ${PHONE_NUMBER_ID}`);
    console.log("PASO REQUERIDO: Asegúrate de que este ID sea el que tiene el Webhook activo en Meta Dashboard.");
} else {
    console.log("❓ Estás usando un ID que no reconozco.");
}
