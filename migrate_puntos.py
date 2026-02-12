import os
import pandas as pd
from dotenv import load_dotenv
from supabase import create_client, Client

load_dotenv()

# Configuración
EXCEL_PATH = "Puntos.xlsx"
SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_KEY = os.getenv("SUPABASE_KEY")

if not SUPABASE_URL or not SUPABASE_KEY:
    print("❌ Falta configuración de Supabase en .env")
    exit(1)

# Cliente Supabase
supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)

def norm_text(s):
    if not s: return ""
    return str(s).strip()

def migrate():
    print(f"📂 Leyendo archivo Excel: {EXCEL_PATH}", flush=True)
    
    # Leer Excel (usa la misma lógica que tu monitor)
    try:
        df = pd.read_excel(EXCEL_PATH, engine="openpyxl")
    except Exception as e:
        print(f"❌ Error leyendo Excel: {e}", flush=True)
        return

    # Normalizar columnas
    df.columns = [str(col).strip().upper() for col in df.columns]
    
    # Mapear columnas (Ajusta según tus nombres reales en Excel)
    ip_col = next((c for c in ["IP", "DIRECCION_IP", "IP_ADDRESS"] if c in df.columns), None)
    seg_col = next((c for c in ["CENTRO DE COSTO", "ZONA", "SEGMENTO"] if c in df.columns), "General")
    alias_col = next((c for c in ["NOMBRE", "ALIAS", "PUNTO"] if c in df.columns), ip_col)

    if not ip_col:
        print("❌ No se encontró columna de IP en el Excel.", flush=True)
        return

    records = []
    print(f"📊 Procesando {len(df)} filas...", flush=True)

    for index, row in df.iterrows():
        ip = row[ip_col]
        
        # Validaciones básicas
        if pd.isna(ip) or str(ip).strip() == "":
            continue

        record = {
            "ip": str(ip).strip(),
            "segment": str(row.get(seg_col, "General")).strip(),
            "alias": str(row.get(alias_col, str(ip))).strip(),
            "active": True 
        }
        records.append(record)

    print(f"🚀 Subiendo {len(records)} registros a Supabase (tabla: puntos_venta)...")
    
    # Upsert en lotes de 100 para no saturar
    batch_size = 100
    for i in range(0, len(records), batch_size):
        batch = records[i:i + batch_size]
        try:
            # Upsert basándose (idealmente) en IP si es única, o insert simple
            data, count = supabase.table("puntos_venta").upsert(batch, on_conflict="ip").execute()
            print(f"   ✅ Lote {i}-{i+len(batch)} subido.")
        except Exception as e:
            print(f"   ❌ Error subiendo lote {i}: {e}")

    print("✅ Migración completada.")

if __name__ == "__main__":
    migrate()
