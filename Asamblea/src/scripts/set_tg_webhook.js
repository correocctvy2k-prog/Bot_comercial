require("dotenv").config();

const token = process.env.TELEGRAM_BOT_TOKEN;
const WEBHOOK_URL = process.argv[2];

if (!token) {
    console.error("❌ Error: Falta TELEGRAM_BOT_TOKEN en el archivo .env");
    process.exit(1);
}

if (!WEBHOOK_URL) {
    console.error("❌ Error: Debes proporcionar la URL Base pública de tu servidor.");
    console.error("Uso: node set_tg_webhook.js https://tu-dominio.com");
    process.exit(1);
}

const telegramUrl = `https://api.telegram.org/bot${token}/setWebhook`;
const fullWebhookUrl = `${WEBHOOK_URL.replace(/\/$/, '')}/webhook/telegram`;

console.log(`📡 Configurador de Webhook Piloto Telegram (Cero-Latencia) 🏎️`);
console.log(`Apuntando Bot al endpoint: ${fullWebhookUrl}`);

fetch(telegramUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
        url: fullWebhookUrl,
        drop_pending_updates: true
    })
})
    .then((res) => res.json())
    .then((data) => {
        if (data.ok) {
            console.log("✅ Webhook configurado exitosamente. Telegram ahora Bypass n8n.");
        } else {
            console.error("❌ Falló la configuración del Webhook:", data);
        }
    })
    .catch((err) => {
        console.error("❌ Error de red crítico:", err.message);
    });
