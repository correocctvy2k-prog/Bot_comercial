// src/config/env.js
module.exports = {
    port: process.env.PORT || 3004,
    verifyToken: process.env.WEBHOOK_VERIFY_TOKEN || 'webhook123',
    whatsappToken: process.env.WHATSAPP_TOKEN,
    phoneNumberId: process.env.PHONE_NUMBER_ID,
    apiVersion: process.env.API_VERSION || 'v21.0',
    openaiApiKey: process.env.OPENAI_API_KEY,
    assistantId: process.env.ASSISTANT_ID,
    supabaseUrl: process.env.SUPABASE_URL,
    supabaseKey: process.env.SUPABASE_SERVICE_ROLE_KEY
};
