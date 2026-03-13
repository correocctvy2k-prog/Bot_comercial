const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

// 🚑 FIX CRÍTICO: Forzar uso de IPv4 en Node 18/20 para evitar problemas de DNS/Red en Docker
const dns = require('node:dns');
if (dns.setDefaultResultOrder) {
    dns.setDefaultResultOrder('ipv4first');
}

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_KEY;

if (!SUPABASE_URL || !SUPABASE_KEY) {
    console.error("❌ Faltan SUPABASE_URL o SUPABASE_KEY en las variables de entorno.");
}

// Cliente robusto para el worker y servicios
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
    auth: { persistSession: false },
    realtime: {
        params: { eventsPerSecond: 10 },
        timeout: 60000
    }
});

module.exports = { supabase };
