// src/services/dbService.js
const { createClient } = require('@supabase/supabase-js');
const env = require('../config/env');

const supabase = createClient(env.supabaseUrl, env.supabaseKey);

async function logInteraction(data) {
    try {
        const { error } = await supabase.from('interactions_log').insert([data]);
        if (error) console.error('[DbService] Error insertando interacción:', error);
    } catch (err) {
        console.error('[DbService] Excepción al guardar interacción:', err);
    }
}

module.exports = { supabase, logInteraction };
