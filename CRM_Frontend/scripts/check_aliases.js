import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'
import fs from 'fs'

// Load env from .env file manually since we are in a script
const envConfig = dotenv.parse(fs.readFileSync('.env'))
const supabaseUrl = envConfig.VITE_SUPABASE_URL
const supabaseKey = envConfig.VITE_SUPABASE_KEY

const supabase = createClient(supabaseUrl, supabaseKey)

async function checkAliases() {
    const { data, error } = await supabase
        .from('puntos_venta')
        .select('name, alias, ip')
        .limit(10)

    if (error) {
        console.error("Error:", error)
        return
    }

    console.log("Existing Aliases in DB:")
    data.forEach(d => console.log(`- [${d.alias}] (IP: ${d.ip})`))
}

checkAliases()
