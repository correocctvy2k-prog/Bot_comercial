// src/services/openAiService.js
const OpenAI = require('openai');
const env = require('../config/env');

const openai = new OpenAI({ apiKey: env.openaiApiKey });

async function getAiResponse(prompt) {
    try {
        if (!env.openaiApiKey) {
            return "Hola, soy el Bot de Soporte Técnico Skylab. ¿En qué te puedo colaborar?";
        }
        const response = await openai.chat.completions.create({
            model: "gpt-4o-mini",
            messages: [{ role: "user", content: prompt }]
        });
        return response.choices[0]?.message?.content || "No pude procesar la consulta.";
    } catch (err) {
        console.error('[OpenAiService] Error:', err.message);
        return "Disculpa, estoy experimentando intermitencias. Un asesor tomará tu solicitud.";
    }
}

module.exports = { getAiResponse };
