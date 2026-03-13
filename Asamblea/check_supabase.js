require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_KEY;

if (!supabaseUrl || !supabaseKey) {
    console.error("❌ Faltan SUPABASE_URL o SUPABASE_KEY en el archivo .env");
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function checkSupabase() {
    console.log("🔍 Verificando conexión a Supabase...");

    // Test 1: Verificar tabla de sesiones
    const { data: sesiones, error: errSesiones } = await supabase
        .from('asamblea_sesiones')
        .select('count', { count: 'exact', head: true });

    if (errSesiones) {
        console.error("❌ Error accediendo a 'asamblea_sesiones':", errSesiones.message);
    } else {
        console.log("✅ Tabla 'asamblea_sesiones' accesible.");
    }

    // Test 2: Verificar tabla de registros
    const { data: registros, error: errRegistros } = await supabase
        .from('asamblea_registro')
        .select('count', { count: 'exact', head: true });

    if (errRegistros) {
        console.error("❌ Error accediendo a 'asamblea_registro':", errRegistros.message);
    } else {
        console.log("✅ Tabla 'asamblea_registro' accesible.");
    }

    if (!errSesiones && !errRegistros) {
        console.log("\n🚀 ¡Supabase está perfectamente configurado!");
    }
}

checkSupabase();
