/**
 * sync_empresas_siiss.js
 * 
 * Sincroniza las empresas del censo de SIISS con la tabla asamblea_padron:
 * 1. Para empresas que ya existen en el padrón (por accitele/teléfono), actualiza nit_representado
 * 2. Inserta las empresas del censo de SIISS que no están en el padrón (como Porvenir)
 * 
 * Uso: node sync_empresas_siiss.js
 */

require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const { obtenerCensoAsamblea } = require('./src/services/api.asamblea.service.js');

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

// Empresas que sabemos son personas jurídicas (NIT corporativo en SIISS)
// Cualquier accionista con NIT > 800000000 se considera empresa
function esNitEmpresa(nit) {
    return nit >= 800000000;
}

async function syncEmpresasSIISS() {
    console.log('🔄 Iniciando sincronización de empresas SIISS → Supabase...\n');

    // 1. Obtener censo completo de SIISS
    const censo = await obtenerCensoAsamblea();
    const empresasSIISS = censo.filter(a => esNitEmpresa(a.accicodi));
    console.log(`📋 Empresas encontradas en SIISS: ${empresasSIISS.length}`);
    empresasSIISS.forEach(e => console.log(`   NIT ${e.accicodi}: ${e.accinomb} (tel: ${e.accitele || 'N/A'})`));
    console.log('');

    // 2. Obtener el padrón actual de Supabase
    const { data: padron, error: padronErr } = await supabase
        .from('asamblea_padron')
        .select('*');
    
    if (padronErr) { console.error('❌ Error leyendo padron:', padronErr.message); return; }
    console.log(`📁 Registros actuales en el padrón: ${padron.length}\n`);

    const actualizados = [];
    const insertados = [];

    for (const empresa of empresasSIISS) {
        const nitStr = String(empresa.accicodi);
        const telStr = empresa.accitele ? String(empresa.accitele) : null;

        // 3a. Buscar representante en padrón por teléfono (wa_id)
        let entradaPadron = null;
        if (telStr) {
            // El wa_id podría ser '57' + telStr
            const posibleWaId = `57${telStr}`;
            entradaPadron = padron.find(p => p.wa_id === posibleWaId || p.wa_id === telStr || p.documento === telStr);
        }

        // 3b. También buscar por nombre similar en el padrón
        if (!entradaPadron) {
            const nombreSIISS = empresa.accinomb.toUpperCase().replace(/\s+/g, ' ').trim();
            entradaPadron = padron.find(p => {
                const nombrePadron = (p.nombre || '').toUpperCase();
                return nombrePadron.includes(nombreSIISS.split(' ')[0]) && 
                       (nombrePadron.includes(' S.A') || nombrePadron.includes(' SAS') || nombrePadron.includes('LTDA') || nombrePadron.includes('INVERSION'));
            });
        }

        if (entradaPadron) {
            // Actualizar nit_representado ya que encontramos el representante en el padrón
            const { error } = await supabase
                .from('asamblea_padron')
                .update({ nit_representado: nitStr })
                .eq('wa_id', entradaPadron.wa_id);
            
            if (error) {
                console.error(`❌ Error actualizando ${entradaPadron.nombre} (NIT ${nitStr}):`, error.message);
            } else {
                console.log(`✅ Actualizado nit_representado=${nitStr} para ${entradaPadron.nombre} (wa_id: ${entradaPadron.wa_id})`);
                actualizados.push({ nombre: entradaPadron.nombre, nit: nitStr });
            }
        } else {
            // La empresa no está en el padrón — insertar como nueva entrada
            // Si tiene teléfono, creamos entrada con wa_id = 57+tel
            const waId = telStr ? `57${telStr}` : null;
            
            if (!waId) {
                console.warn(`⚠️  Empresa sin teléfono, no se puede insertar sin wa_id: ${empresa.accinomb} (NIT ${nitStr})`);
                continue;
            }

            // Verificar si ya existe por wa_id
            const yaExiste = padron.find(p => p.wa_id === waId);
            if (yaExiste) {
                // Simplemente actualiza el nit
                const { error } = await supabase
                    .from('asamblea_padron')
                    .update({ nit_representado: nitStr })
                    .eq('wa_id', waId);
                if (!error) {
                    console.log(`🔁 nit_representado=${nitStr} actualizado para wa_id existente: ${yaExiste.nombre}`);
                    actualizados.push({ nombre: yaExiste.nombre, nit: nitStr });
                }
                continue;
            }

            const nuevaEntrada = {
                wa_id: waId,
                nombre: empresa.accinomb,
                categoria: 'ACCIONISTA',
                documento: nitStr,          // NIT de la empresa como documento de contacto
                nit_representado: nitStr,   // La empresa misma es la accionista
                activo: true
            };

            const { error: insertErr } = await supabase
                .from('asamblea_padron')
                .insert(nuevaEntrada);

            if (insertErr) {
                console.error(`❌ Error insertando ${empresa.accinomb}:`, insertErr.message);
            } else {
                console.log(`➕ Insertada empresa: ${empresa.accinomb} (NIT ${nitStr}, wa_id: ${waId})`);
                insertados.push({ nombre: empresa.accinomb, nit: nitStr, waId });
            }
        }
    }

    console.log('\n' + '─'.repeat(60));
    console.log(`📊 RESUMEN SINCRONIZACIÓN:`);
    console.log(`   ✅ Actualizados (nit_representado): ${actualizados.length}`);
    console.log(`   ➕ Insertados (nuevas empresas):    ${insertados.length}`);
    if (insertados.length > 0) {
        console.log('\nEmpresas insertadas:');
        insertados.forEach(e => console.log(`   • ${e.nombre} | NIT: ${e.nit} | wa_id: ${e.waId}`));
    }
    console.log('\n✅ Sincronización completada.');
}

syncEmpresasSIISS().catch(console.error);
