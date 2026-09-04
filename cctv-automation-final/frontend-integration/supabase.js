import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || "https://fxlbqlzsbrgnkpcduzxt.supabase.co";
// El navegador solo puede usar la clave pública anon. Nunca agregar aquí una
// service_role ni una variable VITE_* que la contenga.
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZ4bGJxbHpzYnJnbmtwY2R1enh0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzAyMDc4NzYsImV4cCI6MjA4NTc4Mzg3Nn0.lM98gKtOwh9NFHTRlZBKyHIk-P26bL4m5d7b30FbiCI";

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
    auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true
    },
    realtime: {
        params: {
            eventsPerSecond: 10,
        }
    }
});

export const supabaseAdmin = createClient(supabaseUrl, supabaseAnonKey, {
    auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false,
        storageKey: 'skylab-admin-isolated'
    }
});
