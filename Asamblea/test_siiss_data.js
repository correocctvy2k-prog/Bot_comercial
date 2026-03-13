// Assembly/test_siiss_data.js
const apiAsamblea = require('./src/services/api.asamblea.service');

async function test() {
    console.log("🚀 Analizando CENSO COMPLETO de SIISS...");
    try {
        const censo = await apiAsamblea.obtenerCensoAsamblea();
        
        if (!censo || censo.length === 0) {
            console.error("❌ No se recibieron registros de SIISS.");
            return;
        }

        console.log(`✅ Total registros recibidos: ${censo.length}`);
        
        const stats = {};
        const fieldCounts = {};

        censo.forEach(item => {
            Object.keys(item).forEach(key => {
                if (!fieldCounts[key]) fieldCounts[key] = 0;
                if (item[key] !== null && item[key] !== undefined && item[key] !== "" && item[key] !== " ") {
                    fieldCounts[key]++;
                }
            });
        });

        console.log("\n📊 Estadísticas de campos poblados:");
        Object.keys(fieldCounts).sort((a,b) => fieldCounts[b] - fieldCounts[a]).forEach(key => {
            const pct = ((fieldCounts[key] / censo.length) * 100).toFixed(1);
            console.log(`- ${key}: ${fieldCounts[key]} (${pct}%)`);
        });

        console.log("\n------------------------------------------");
        console.log("Muestra de un registro que TENGA teléfono (si existe):");
        const withPhone = censo.find(item => item.accitele || item.accicel || item.movil || item.celular);
        if (withPhone) {
            console.log(JSON.stringify(withPhone, null, 2));
        } else {
            console.log("❌ No se encontró ningún registro con campos de teléfono conocidos.");
        }

    } catch (e) {
        console.error("🔴 Error en la prueba:", e.message);
    }
}

test();
