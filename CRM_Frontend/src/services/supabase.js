import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || "https://fxlbqlzsbrgnkpcduzxt.supabase.co";
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZ4bGJxbHpzYnJnbmtwY2R1enh0Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MDIwNzg3NiwiZXhwIjoyMDg1NzgzODc2fQ.odcV7pu9oD6l3UgFTY97AljC7lCxZskuxRrd4m2Nl5Y";

console.log("Supabase URL:", supabaseUrl);

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
