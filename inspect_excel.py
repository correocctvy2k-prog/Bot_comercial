
import pandas as pd
import os
from supabase import create_client
from dotenv import load_dotenv

load_dotenv()

# Inspect Excel
try:
    df = pd.read_excel("Puntos.xlsx")
    print("=== EXCEL COLUMNS ===")
    print(df.columns.tolist())
    print(f"Total Rows: {len(df)}")
    print(df.head(3).to_string())
except Exception as e:
    print(f"Error reading Excel: {e}")

# Inspect Supabase (if possible/needed, but pandas is main priority)
print("\n=== ENV ===")
print("SUPABASE_URL:", os.getenv("SUPABASE_URL"))
