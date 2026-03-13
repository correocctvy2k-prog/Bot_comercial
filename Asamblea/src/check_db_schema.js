require("dotenv").config({ path: __dirname + "/.env" });
const { createClient } = require("@supabase/supabase-js");

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY);

async function checkSchema() {
    const { data, error } = await supabase.from("puntos_venta").select("*").limit(1);
    if (error) {
        console.error("Error:", error);
    } else {
        console.log("Campos del primer registro:", Object.keys(data[0]));
        console.log("Valores:", data[0]);
    }
}

checkSchema();
