require('dotenv').config();

async function listModels() {
    console.log("🔍 DIAGNOSTICO DE MODELOS GEMINI (HTTP REST V1BETA)");
    const key = process.env.GEMINI_API_KEY;

    if (!key) {
        console.error("❌ No API Key found.");
        return;
    }

    const url = `https://generativelanguage.googleapis.com/v1beta/models?key=${key}`;

    try {
        console.log(`📡 Consultando: ${url.replace(key, "HIDDEN_KEY")}`);
        const response = await fetch(url);
        const data = await response.json();

        if (!response.ok) {
            console.error(`❌ ERROR HTTP ${response.status}:`, JSON.stringify(data, null, 2));
            if (response.status === 403) {
                console.error("👉 CAUSA PROBABLE: API Key incorrecta, restringida o API no habilitada en Google Console.");
            }
            return;
        }

        if (data.models && data.models.length > 0) {
            console.log("✅ MODELOS DISPONIBLES PARA ESTA KEY:");
            data.models.forEach(m => {
                console.log(`   - ${m.name} (${m.version}) [Supports: ${m.supportedGenerationMethods.join(", ")}]`);
            });
        } else {
            console.warn("⚠️ LA API RESPONDIÓ OK PERO SIN MODELOS. (Extraño)");
            console.log("Response:", JSON.stringify(data, null, 2));
        }

    } catch (error) {
        console.error("❌ Error de red/fetch:", error.message);
    }
}

listModels();
