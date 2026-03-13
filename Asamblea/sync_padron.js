// Assembly/sync_padron.js
require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const apiAsamblea = require('./src/services/api.asamblea.service');

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_KEY;

if (!supabaseUrl || !supabaseKey) {
    console.error("❌ Faltan credenciales de Supabase en .env");
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

/**
 * Normaliza un número de teléfono para que empiece con 57 y tenga el formato correcto.
 */
function normalizePhone(phone) {
    if (!phone) return null;
    let clean = String(phone).replace(/\D/g, '');
    if (clean.length === 10) return `57${clean}`;
    if (clean.length === 12 && clean.startsWith('57')) return clean;
    return clean; // Retornamos lo que haya si no cumple el estándar 10/12
}

async function sync() {
    console.log("🔄 Iniciando sincronización SIISS -> Padrón Supabase...");
    
    try {
        const censo = await apiAsamblea.obtenerCensoAsamblea();
        if (!censo || censo.length === 0) {
            console.error("❌ No se pudo obtener el censo de SIISS.");
            return;
        }

        console.log(`✅ Censo obtenido: ${censo.length} registros.`);

        const autorizados = censo
            .filter(item => item.accitele && String(item.accitele).trim() !== "")
            .map(item => ({
                wa_id: normalizePhone(item.accitele),
                nombre: item.accinomb,
                documento: String(item.accicodi),
                created_at: new Date()
            }));

        if (autorizados.length === 0) {
            console.warn("⚠️ No se encontraron registros con número de teléfono (accitele) en SIISS.");
            return;
        }

        console.log(`🚀 Sincronizando ${autorizados.length} registros válidos...`);

        const { data, error } = await supabase
            .from('asamblea_padron')
            .upsert(autorizados, { onConflict: 'wa_id' });

        if (error) {
            console.error("❌ Error en el upsert de Supabase:", error.message);
        } else {
            console.log(`✨ Sincronización exitosa. ${autorizados.length} accionistas autorizados en el padrón.`);
        }

    } catch (e) {
        console.error("🔴 Error crítico durante la sincronización:", e.message);
    }
}

sync();
