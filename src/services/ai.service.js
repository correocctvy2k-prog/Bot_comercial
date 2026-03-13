console.log("🧠 [AI] AI.SERVICE.JS CARGADO - v14.0 (NATIVE HTTP - sin librería Google)");
console.log("🔑 API KEY STATUS:", process.env.GEMINI_API_KEY ? "CONFIGURADA ✅" : "FALTA ❌");

// 🛠️ v14.0: Forzar IPv4 para evitar cuelgues IPv6 en Docker Ubuntu
const dns = require('dns');
if (dns.setDefaultResultOrder) {
    dns.setDefaultResultOrder('ipv4first');
    console.log("🌐 [NETWORK] DNS configurado a ipv4first.");
}

// v14.0: Cliente Gemini via HTTP nativo (evita cuelgues de @google/generative-ai en Docker)
const GEMINI_BASE = "https://generativelanguage.googleapis.com/v1beta/models";

async function callGemini(apiKey, modelName, prompt, timeoutMs = 45000) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    const url = `${GEMINI_BASE}/${modelName}:generateContent?key=${apiKey}`;
    try {
        const response = await fetch(url, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            signal: controller.signal,
            body: JSON.stringify({
                contents: [{ parts: [{ text: prompt }] }],
                generationConfig: { temperature: 0.1, topK: 1, topP: 0.8 }
            })
        });
        clearTimeout(timer);
        if (!response.ok) {
            const errBody = await response.text();
            throw new Error(`HTTP ${response.status}: ${errBody.substring(0, 200)}`);
        }
        const data = await response.json();
        const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
        if (!text) throw new Error("Respuesta sin texto del modelo.");
        return text;
    } catch (e) {
        clearTimeout(timer);
        if (e.name === "AbortError") throw new Error(`Timeout (${timeoutMs}ms)`);
        throw e;
    }
}

/**
 * Servicio de Inteligencia Artificial (Gemini v14.0 - HTTP Nativo)
 * Responsable de procesar lenguaje natural y mapear intenciones a acciones del bot.
 */
class AIService {
    constructor() {
        this.apiKey = process.env.GEMINI_API_KEY;
        this.modelName = null;

        if (!this.apiKey) {
            console.warn("⚠️ GEMINI_API_KEY no configurada. El agente IA funcionará en modo fallback.");
            return;
        }

        // Inicializar modelo de forma asíncrona sin bloquear el arranque
        this.initModel();
    }

    async initModel() {
        const PING_TIMEOUT_MS = 8000;
        // v14.0: Lista actualizada con modelos Gemini 2026 disponibles
        // v14.1: Eliminado gemini-2.0-flash-lite (404 en API keys nuevas).
        // Orden basado en disponibilidad confirmada:
        const candidates = [
            "gemini-2.0-flash",
            "gemini-2.5-flash",
            "gemini-1.5-flash-latest",
            "gemini-1.5-flash",
        ];

        for (const modelName of candidates) {
            try {
                console.log(`🧪 [AI-v14.0] Probando candidato: ${modelName}`);
                await callGemini(this.apiKey, modelName, "ping", PING_TIMEOUT_MS);
                console.log(`✅ [AI-v14.0] Modelo VÁLIDO: ${modelName}`);
                this.modelName = modelName;
                return;
            } catch (e) {
                console.warn(`⚠️ [AI-v14.0] Candidato ${modelName} falló: ${e.message.split(":")[0]}`);
            }
        }

        // Fallback final si ninguno responde
        console.error("❌ [AI-v14.1] Ningún modelo candidato funcionó. Usando gemini-2.0-flash de todas formas.");
        this.modelName = "gemini-2.0-flash";
    }

    async processIntent(text) {
        if (!this.apiKey) return { intent: "fallback" };

        // Aseguramos que tenemos un modelo seleccionado
        if (!this.modelName) {
            await this.initModel();
        }

        const keyPreview = this.apiKey ? `${this.apiKey.substring(0, 5)}...` : "FALTA";
        try {
            const systemPrompt = `Eres el "Aliado Digital del Departamento Comercial" de Gane. 
            Tu misión exclusiva es informar sobre el ESTADO DE CONECTIVIDAD O APERTURA de los puntos de venta.
            POR NINGÚN MOTIVO digas que das "reportes de ventas" o que tienes "datos de ventas". Tú solo monitoreas si los puntos están "En línea" o "Sin conexión" (Offline).
            ¡MUY IMPORTANTE!: Tus respuestas ('reply') DEBEN SER EXTREMADAMENTE CORTAS Y DIRECTAS (máximo 1 o 2 líneas). No uses verbosidad excesiva.
            
            INTENTS DISPONIBLES Y CUÁNDO USARLOS:
            
            1. "greeting" → Si el usuario saluda sin pedir nada (hola, buenos días, buenas tardes, etc.).
               Reply: "¡Hola! Soy tu Aliado Digital. ¿De qué zona deseas revisar la conectividad? (ej: Palmira, Florida)"
            
            2. "list_zones" → Si el usuario pregunta QUÉ ZONAS hay disponibles, qué opciones tiene, ver el menú, o listar zonas.
               Palabras clave: "qué zonas", "cuáles zonas", "mostrar zonas", "ver opciones", "menú", "lista de zonas", "opciones disponibles", "qué puedes hacer".
               Reply: "Estas son nuestras zonas activas: PALMIRA, ROZO, CANDELARIA, PRADERA, FLORIDA, OCCIDENTE, AMAIME y EL PLACER. ¿Cuál deseas revisar?"
            
            3. "all_zones" → Si el usuario pide el reporte de TODAS las zonas a la vez o el reporte completo/general sin especificar una sola zona.
               Palabras clave: "todas las zonas", "reporte completo", "todas", "todo", "reporte general", "todos los puntos", "todas las zonas activas".
               Reply: "¡Listo! Generando el reporte completo de todas las zonas."
            
            4. "sales_report" + entities.zone → Si pide el reporte de UNA O MÁS ZONAS ESPECÍFICAS válidas: PALMIRA, ROZO, CANDELARIA, PRADERA, FLORIDA, OCCIDENTE, AMAIME o EL PLACER.
               Si el usuario pide más de una zona (ej: "reporte de palmira y pradera"), "zone" DEBE SER SIEMPRE UN ARRAY en el JSON, ej: ["PALMIRA", "PRADERA"]. Incluso si es una sola zona, devuélvela como array: ["PALMIRA"].
               Si piden una subzona de CANDELARIA (Poblado, Cabuyal, Juanchito, Villagorgona): usa zone: ["CANDELARIA"] y en el reply di "No tengo el detalle de [subzona], pero te genero el reporte de Candelaria."
               Reply: "¡Claro! En un momento te genero los reportes solicitados."
            
            5. "CHAT" → Si piden zonas que NO existen (Cerrito, Ginebra, Buga, Cali) o cualquier charla no relacionada.
               Reply breve re-enfocando al usuario hacia las zonas disponibles.
            
            ZONAS VÁLIDAS: PALMIRA, ROZO, CANDELARIA, PRADERA, FLORIDA, OCCIDENTE, AMAIME, EL PLACER.
            
            TU RESPUESTA DEBE SER ESTRICTAMENTE UN JSON VÁLIDO. SIN TEXTO ADICIONAL.
            Formato: {"intent": "...", "entities": {"zone": ["ZONA1", "ZONA2"]}, "reply": "Respuesta breve"}
            `;

            console.log(`🧠 [NLU-v14.0] Procesando: "${text}" | API: ${keyPreview} | Model: ${this.modelName || 'waiting...'}`);

            const fullPrompt = `${systemPrompt}\n\nUSER: ${text}\nJSON:`;

            // ⏱️ TIMEOUT: 45s usando callGemini nativo
            const textResponse = await callGemini(this.apiKey, this.modelName, fullPrompt, 45000);

            // Limpieza JSON
            const cleanJson = textResponse.replace(/^```json/gm, '').replace(/^```/gm, '').trim();
            const parsed = JSON.parse(cleanJson);

            // Normalizar zona si existe (convertir siempre a array de mayúsculas)
            if (parsed.entities && parsed.entities.zone) {
                if (Array.isArray(parsed.entities.zone)) {
                    parsed.entities.zone = parsed.entities.zone.map(z => z.toUpperCase().trim());
                } else if (typeof parsed.entities.zone === 'string') {
                    parsed.entities.zone = parsed.entities.zone
                        .split(/(?:\s*,\s*|\s+y\s+|\s+e\s+)/i)
                        .map(z => z.toUpperCase().trim())
                        .filter(Boolean);
                }
            }
            return parsed;

        } catch (e) {
            console.error(`❌ [NLU] Error procesando intent: ${e.message}`);

            if (e.message.includes("429") || e.message.includes("Quota")) {
                return {
                    intent: "CHAT",
                    reply: "🐢 Estoy recibiendo muchas consultas al mismo tiempo. Por favor dame 30 segundos y vuelve a intentarlo. (Error: Quota Exceeded)"
                };
            }

            if (e.message.includes("503") || e.message.includes("high demand") || e.message.includes("Service Unavailable")) {
                this.modelName = null; // Forzamos re-init
                return {
                    intent: "CHAT",
                    reply: "🧠 Mis servidores de inteligencia artificial están en alta demanda en este instante. Por favor, inténtalo de nuevo en un minuto."
                };
            }

            if (e.message.includes("Timeout")) {
                return {
                    intent: "CHAT",
                    reply: "🐢 La red está un poco lenta. Por favor intenta escribiendo tu solicitud nuevamente."
                };
            }

            // Fallback genérico
            this.modelName = null;
            return {
                intent: "CHAT",
                reply: "Lo siento, tuve un pequeño mareo digital y perdí la conexión con mi cerebro artificial. 🤖🔌 ¿Podrías repetirme eso?"
            };
        }
    }

    /**
     * Genera un reporte corporativo para alertas de horarios.
     */
    async generateAlertReport(alerts) {
        if (!this.apiKey || !this.modelName || !alerts || alerts.length === 0) return alerts;

        console.log(`🧠 [AI] Generando mensajes individuales para ${alerts.length} alertas...`);

        const results = [];
        for (const alert of alerts) {
            try {
                const systemPrompt = `Eres el asesor central de la línea operativa de Gane Palmira.

Tu tarea es redactar UN SOLO mensaje directo y personalizado, listo para ser enviado al responsable del punto de venta por WhatsApp.
Aquí tienes el modelo base corporativo, PERO DEBES ADAPTARLO creativamente (manteniendo el tono):

[MODELO BASE]:
"Buen dia {NOMBRE}, hemos notado que la apertura del punto ${alert.point_name} el dia de hoy ha abierto una hora mas tarde de lo habitual, queria preguntarte si has tenido alguna dificultas personal o técnica con el sistema del punto? Recuerda que la oportuna apertura te ayuda con el cumplimiento de tus metas
Si requieres apoyo no dudes en comunicarte con tu administrador y recuerda que en Gane Palmira Apostamos todo por tí!"

**REGLAS OBLIGATORIAS:**
1. Escribe exactamente la palabra "{NOMBRE}" en mayúsculas donde va el nombre de la persona (no intentes adivinar el nombre).
2. Reemplaza "{PUNTO}" por "${alert.point_name}" (nombre real del punto afectado).
3. Personaliza el cuerpo basado en la situación reportada.
4. Solo el cuerpo del mensaje, sin comillas envolventes.

SITUACIÓN REPORTADA:
- Punto: ${alert.point_name} (IP: ${alert.point_ip})
- Zona: ${alert.zone}
- Estado detectado: ${alert.alert_type}`;

                const fullPrompt = `${systemPrompt}\nMensaje:`;
                const text = await callGemini(this.apiKey, this.modelName, fullPrompt, 25000);
                results.push({ ...alert, ai_proposed_message: text.trim() || alert.ai_proposed_message });

            } catch (e) {
                console.warn(`⚠️ [AI] Error generando mensaje para ${alert.point_name}:`, e.message);
                results.push(alert); // Fallback: dejar el mensaje default
            }
        }
        return results;
    }
}

module.exports = new AIService();
