require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

async function testDelete() {
    console.log("Testing Delete Votos...");
    const { data: votos, error: err1 } = await supabase.from('asamblea_votos').delete().neq('id', '00000000-0000-0000-0000-000000000000');
    console.log("Votos delete result:", votos, "Error:", err1?.message);

    console.log("Testing Delete Encuestas...");
    const { data: encuestas, error: err2 } = await supabase.from('asamblea_encuestas').delete().neq('id', '00000000-0000-0000-0000-000000000000');
    console.log("Encuestas delete result:", encuestas, "Error:", err2?.message);
}

testDelete();
