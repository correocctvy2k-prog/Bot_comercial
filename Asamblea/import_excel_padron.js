const fs = require('fs');
const path = require('path');
const XLSX = require('xlsx');
require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

// Configuración de Supabase
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error("❌ Error: Faltan SUPABASE_URL o SUPABASE_KEY en el .env");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

const FILE_NAME = 'Accionistas e Invitados Asamblea 2026 datos.xlsx';
const FILE_PATH = path.resolve(__dirname, FILE_NAME);

if (!fs.existsSync(FILE_PATH)) {
  console.error(`❌ Error: No se encuentra el archivo ${FILE_NAME}`);
  process.exit(1);
}

function normalizeWaId(raw) {
    if (!raw) return null;
    let s = String(raw).replace(/[^\d]/g, "");
    if (!s) return null;
    // Si no empieza con 57 y tiene 10 dígitos, asumimos Colombia
    if (s.length === 10 && !s.startsWith("57")) {
        return "57" + s;
    }
    return s;
}

async function runImport() {
  console.log(`📂 Leyendo archivo: ${FILE_NAME}...`);
  const workbook = XLSX.readFile(FILE_PATH);
  
  const allData = [];

  workbook.SheetNames.forEach(sheetName => {
    console.log(`📖 Procesando hoja: ${sheetName}`);
    const sheet = workbook.Sheets[sheetName];
    const data = XLSX.utils.sheet_to_json(sheet, { header: 1 }); // Leer como matriz de filas
    
    let defaultCat = 'ACCIONISTA';
    if (sheetName.toLowerCase().includes('invitado')) defaultCat = 'INVITADO';

    data.forEach(row => {
      // 1. Encontrar el teléfono (cualquier columna que parezca un número largo)
      let waId = null;
      let nombre = null;
      let documento = "";

      row.forEach(cell => {
        if (!cell) return;
        const s = String(cell).trim();
        
        // Detección de teléfono (10 dígitos o empieza con 57)
        if (!waId && /^[57]*\d{10}$/.test(s.replace(/[^\d]/g, ""))) {
           waId = normalizeWaId(s);
        }
        
        // Detección de nombre (una celda que tiene 2 o más palabras y no es número puro)
        if (!nombre && s.split(" ").length >= 2 && /[a-zA-Z]/.test(s)) {
           nombre = s;
        }

        // Detección de documento (una celda de 6 a 12 números, después de haber encontrado nombre)
        if (nombre && !documento && /^\d{6,12}$/.test(s)) {
           documento = s;
        }
      });

      if (waId) {
        allData.push({
          wa_id: waId,
          nombre: nombre || 'Asambleísta',
          documento: documento,
          categoria: defaultCat
        });
      }
    });
  });

  // DE-DUPLICACIÓN: Si el mismo wa_id aparece varias veces, nos quedamos con el último
  const uniqueDataMap = new Map();
  allData.forEach(item => {
    uniqueDataMap.set(item.wa_id, item);
  });
  const finalData = Array.from(uniqueDataMap.values());

  console.log(`📊 Total registros detectados: ${allData.length}`);
  console.log(`💎 Registros únicos por teléfono: ${finalData.length}`);

  if (finalData.length === 0) {
    console.warn("⚠️ No se detectaron registros válidos con teléfono.");
    return;
  }

  console.log("🚀 Subiendo a Supabase (Upsert)...");

  // Procesar en bloques de 50 para no saturar
  const chunkSize = 50;
  for (let i = 0; i < finalData.length; i += chunkSize) {
    const chunk = finalData.slice(i, i + chunkSize);
    const { error } = await supabase
      .from('asamblea_padron')
      .upsert(chunk, { onConflict: 'wa_id' });

    if (error) {
      console.error(`❌ Error en bloque ${i / chunkSize}:`, error.message);
    } else {
      console.log(`✅ Bloque ${i / chunkSize + 1} completado (${chunk.length} registros).`);
    }
  }

  console.log("\n🏁 Proceso de importación finalizado.");
}

runImport();
