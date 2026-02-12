
import pandas as pd
import os
import sys
from supabase import create_client
from dotenv import load_dotenv

load_dotenv()

# Config
SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_KEY = os.getenv("SUPABASE_KEY")
EXCEL_FILE = "Puntos.xlsx"

if not SUPABASE_URL or not SUPABASE_KEY:
    print("❌ Faltan credenciales en .env")
    sys.exit(1)

def norm_text(s):
    return str(s).strip().upper()

def main():
    print("🚀 Iniciando importación de puntos...")
    
    # 1. Leer Excel
    try:
        df = pd.read_excel(EXCEL_FILE)
        print(f"📄 Leídos {len(df)} registros de Excel.")
    except Exception as e:
        print(f"❌ Error leyendo Excel: {e}")
        return

    # 1.5 Analizar duplicados
    df["IP"] = df["IP"].astype(str).str.strip()
    total_rows = len(df)
    unique_ips = df["IP"].nunique()
    print(f"📊 Análisis de Datos:")
    print(f"   - Total Filas Excel: {total_rows}")
    print(f"   - IPs Únicas: {unique_ips}")
    print(f"   - Duplicados en Excel: {total_rows - unique_ips}")
    
    if total_rows != unique_ips:
        print("⚠️  ADVERTENCIA: Hay IPs repetidas en el Excel. Supabase solo guardará una por IP.")
        duplicates = df[df.duplicated("IP", keep=False)].sort_values("IP")
        print("   Ejemplos de duplicados:")
        print(duplicates[["IP", "Punto de venta"]].head(10).to_string(index=False))

    # 2. Conectar Supabase
    sb = create_client(SUPABASE_URL, SUPABASE_KEY)
    
    records = []
    skipped = 0
    for _, row in df.iterrows():
        ip = row["IP"]
        alias = str(row["Punto de venta"]).strip()
        segment = str(row["Centro de costo"]).strip()
        
        if len(ip) < 7: 
            skipped += 1
            continue 
        
        records.append({
            "ip": ip,
            "alias": alias,
            "segment": segment,
            "active": True
        })
    
    print(f"\n📦 Registros válidos para procesar: {len(records)} (Omitidos por IP inválida: {skipped})")
    
    # 4. Upsert con reporte detallado
    BATCH_SIZE = 50
    success_count = 0
    error_count = 0
    
    print("\n🔄 Iniciando Sincronización...")
    for i in range(0, len(records), BATCH_SIZE):
        batch = records[i:i+BATCH_SIZE]
        try:
            # count='exact' para saber cuántos se tocaron
            response = sb.table("puntos_venta").upsert(batch, on_conflict="ip", count="exact").execute()
            # response.count suele devolver el numero de rows afectadas
            inserted = len(response.data) if response.data else len(batch)
            success_count += inserted
            print(f"   ✅ Lote {i // BATCH_SIZE + 1}: Procesados {inserted} registros.")
        except Exception as e:
            print(f"   ❌ Error en lote {i}: {e}")
            error_count += 1
            
    print(f"\n🏁 Sincronización Finalizada.")
    print(f"   Total en Base de Datos (Esperado): {unique_ips}")
    print(f"   (Nota: Si {total_rows} != {success_count}, es probable que sea por los duplicados mostrados arriba).")


if __name__ == "__main__":
    main()
