import { createClient } from '@supabase/supabase-js'

const supabaseUrl = "https://fxlbqlzsbrgnkpcduzxt.supabase.co";
const supabaseAnonKey = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZ4bGJxbHpzYnJnbmtwY2R1enh0Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MDIwNzg3NiwiZXhwIjoyMDg1NzgzODc2fQ.odcV7pu9oD6l3UgFTY97AljC7lCxZskuxRrd4m2Nl5Y";

console.log("Supabase URL Hardcoded:", supabaseUrl);
// console.log("Supabase Key Used:", supabaseAnonKey ? supabaseAnonKey.substring(0, 20) + "..." : "MISSING");
// console.log("Is Key from Env?", !!import.meta.env.VITE_SUPABASE_KEY);

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
    auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false
    },
    realtime: {
        params: {
            eventsPerSecond: 10,
        }
    }
})
