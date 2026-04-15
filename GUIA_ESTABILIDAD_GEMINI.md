# 🛡️ Guía: Estabilidad y Resiliencia en APIs de Gemini

> **Propósito:** Documentar la arquitectura de llamadas nativas a Gemini (v14.0) utilizada en los bots Comercial y Asamblea para evitar cuelgues, bloqueos (`hangs`) y errores comunes de la API de Google Generative AI en contenedores Docker/Ubuntu.

---

## 🛑 El Problema Original

En iteraciones anteriores, los bots sufrían caídas silenciosas e interrupciones en la atención. Se detectaron los siguientes problemas:
1. **Fugas en el SDK oficial:** La librería de npm `@google/generative-ai` sufría de *hangs* infinitos bajo concurrencia, impidiendo manejar timeouts adecuadamente.
2. **Conflictos IPv6:** Las peticiones originadas en Docker/Ubuntu hacia las API de Google intentaban usar IPv6 primero, produciendo latencias absurdas o *timeouts*.
3. **Restricciones de Cuota / Demanda:** Las caídas de los servidores de Google (Error 503) tiraban los bots al no existir un sistema que probase automáticamente con otra versión del modelo.

---

## ✅ La Solución (Arquitectura v14.0)

Para el desarrollo de tu nuevo bot, debes desechar el SDK y aplicar estas **6 estrategias clave** en el archivo que maneje el NLU/IA.

### 1. Forzar IPv4 a nivel de DNS
Se debe colocar al inicio del archivo principal o de IA para asegurar que las llamadas HTTP fluyan rápidamente en el VPS:

```javascript
const dns = require('dns');
if (dns.setDefaultResultOrder) {
    dns.setDefaultResultOrder('ipv4first');
    console.log("🌐 [NETWORK] DNS configurado a ipv4first.");
}
```

### 2. Adiós al SDK (Cliente HTTP Nativo)
Se estructuró una función de llamado nativo vía `fetch` contra el endpoint REST directo.
Esto requiere el uso activo de una clase `AbortController` para forzar un límite máximo de espera (ej. 45000 ms).

```javascript
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
```

### 3. Modelo de Fallback Dinámico o "Cascada" (`initModel`)
El servicio implementa una lista predefinida de modelos. Al arrancar (o al detectar una falla persistente), envía un *ping* con tiempo corto (8 segundos) a cada modelo hasta encontrar el primero que responda exitosamente. El modelo victorioso se usa para el siguiente lote de usuarios.

```javascript
async initModel() {
    const PING_TIMEOUT_MS = 8000;
    const candidates = [
        "gemini-2.0-flash",
        "gemini-2.5-flash",
        "gemini-1.5-flash-latest",
        "gemini-1.5-flash",
    ];

    for (const modelName of candidates) {
        try {
            await callGemini(this.apiKey, modelName, "ping", PING_TIMEOUT_MS);
            this.modelName = modelName; // ✅ Modelo validado
            return;
        } catch (e) {
            console.warn(`⚠️ Modelo ${modelName} falló.`);
        }
    }
    this.modelName = "gemini-2.0-flash"; // Fallback ciego en caso extremo
}
```

### 4. Reconexión Automatizada por Saturación
A la hora de procesar los mensajes (`processIntent`), englobamos la carga de trabajo en un bloque `try/catch`. 
Si el motor se cae por mantenimiento de Google u oleada de demanda (error 503), forzamos su reinicialización al "matar" `this.modelName`.

```javascript
/* dentro de try {...} */
const textResponse = await callGemini(this.apiKey, this.modelName, promptText, 45000);

/* dentro del catch(e) {...} */
if (e.message.includes("503") || e.message.includes("Service Unavailable")) {
    this.modelName = null; // Fuerza un nuevo intento de 'initModel' en la próxima llamada
    return {
        reply: "🧠 Mis servidores de inteligencia artificial están en alta demanda. Por favor, inténtalo de nuevo en un minuto."
    };
}
```

### 5. Degradación Cortés al Usuario
Si el timeout nativo actúa o se excede la cuota de la cuenta (Error 429), el bot evita *crashear* y le pide amablemente al usuario que lo vuelva a intentar o que espere:

```javascript
if (e.message.includes("429") || e.message.includes("Quota")) {
    return {
        reply: "🐢 Estoy recibiendo muchas consultas al mismo tiempo. Por favor dame 30 segundos..."
    };
}

if (e.message.includes("Timeout")) {
    return {
        reply: "🐢 La red está un poco lenta. Por favor intenta escribiendo tu solicitud nuevamente."
    };
}
```

---

*Aplicando esta configuración a todo bot paralelo que levantes en Node.js garantizará el nivel más alto de "uptime" que la API de Google actualmente puede tolerar.*
