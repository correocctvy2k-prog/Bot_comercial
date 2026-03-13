# charts_asamblea.py
import os
import sys
import json
import time
import argparse
import pandas as pd
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
from datetime import datetime
from supabase import create_client, Client
from dotenv import load_dotenv

load_dotenv()

SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_KEY = os.getenv("SUPABASE_KEY")

JSON_MODE = False

def log(msg):
    if JSON_MODE:
        print(msg, file=sys.stderr)
    else:
        print(msg)

def generate_quorum_chart(sb: Client):
    # 1. Obtener total esperado (asumimos un total o consultamos asamblea_registro)
    # Para este ejemplo, consultamos cuántos hay en asamblea_registro vs un total ficticio o parametrizado
    # En un caso real, podríamos tener una tabla 'asamblea_config' con el total_esperado.
    
    total_esperado = int(os.getenv("ASAMBLEA_TOTAL_ACCIONISTAS", 100))
    
    resp = sb.table("asamblea_registro").select("id", count="exact").eq("status", "SYNC_OK").execute()
    presentes = resp.count or 0
    ausentes = max(0, total_esperado - presentes)
    
    return create_donut_chart(
        values=[presentes, ausentes],
        labels=["PRESENTES", "AUSENTES"],
        colors=['#00E676', '#FF1744'],
        title="CONSOLIDADO DE QUÓRUM",
        center_text=f"{presentes}/{total_esperado}",
        filename_prefix="quorum"
    )

def generate_poll_chart(sb: Client, question_text: str = None, poll_id: str = None):
    # 1. Obtener la encuesta (priorizamos por ID si está presente)
    if poll_id:
         resp = sb.table("asamblea_encuestas").select("*").eq("id", poll_id).limit(1).execute()
    elif question_text:
         resp = sb.table("asamblea_encuestas").select("*").eq("pregunta", question_text).order('created_at', desc=True).limit(1).execute()
    else:
         resp = sb.table("asamblea_encuestas").select("*").order('created_at', desc=True).limit(1).execute()
    
    if not resp.data:
        raise ValueError("No se encontró ninguna encuesta registrada.")
    
    poll = resp.data[0]
    encuesta_id = poll['id']
    pregunta = poll['pregunta']
    opciones = poll['opciones'] # Lista de strings
    
    # 2. Obtener votos para esta encuesta específica
    resp_votos = sb.table("asamblea_votos").select("opcion_index").eq("encuesta_id", encuesta_id).execute()
    votos = resp_votos.data or []
    
    if not votos:
        # Si no hay votos, creamos un gráfico vacío o con ceros para las opciones
        labels = opciones
        values = [0] * len(opciones)
    else:
        # Contar votos por índice
        df = pd.DataFrame(votos)
        counts = df['opcion_index'].value_counts()
        
        labels = []
        values = []
        for i, opt in enumerate(opciones):
            labels.append(opt)
            values.append(int(counts.get(i, 0)))
    
    return create_donut_chart(
        values=values,
        labels=labels,
        colors=['#2979FF', '#FF9100', '#00E676', '#AA00FF', '#FF1744', '#D500F9'],
        title="RESULTADOS ENCUESTA",
        subtitle=pregunta,
        center_text=str(len(votos)),
        filename_prefix="poll"
    )

def create_donut_chart(values, labels, colors, title, subtitle=None, center_text="", filename_prefix="chart"):
    c_bg = '#1E1E1E'
    c_text = '#FFFFFF'
    c_sub = '#AAAAAA'
    
    fig = plt.figure(figsize=(6, 6))
    fig.patch.set_facecolor(c_bg)
    
    # Header
    fig.text(0.5, 0.93, title, fontsize=18, color=c_text, ha='center', weight='bold')
    if subtitle:
        if len(subtitle) > 40: subtitle = subtitle[:37] + "..."
        fig.text(0.5, 0.88, subtitle, fontsize=10, color=c_sub, ha='center', style='italic')
    
    # Pie
    ax = fig.add_axes([0.1, 0.25, 0.8, 0.55])
    wedges, texts, autotexts = ax.pie(
        values, 
        labels=labels,
        colors=colors[:len(values)],
        autopct='%1.0f%%',
        startangle=90,
        pctdistance=0.85,
        textprops={'color': c_text, 'weight': 'bold'},
        wedgeprops={'width': 0.3, 'edgecolor': c_bg, 'linewidth': 3}
    )
    
    ax.text(0, 0, center_text, ha='center', va='center', fontsize=28, color=c_text, weight='bold')
    ax.text(0, -0.15, "TOTAL", ha='center', va='center', fontsize=10, color=c_sub)
    
    # Legend style rows
    y_start = 0.15
    for i, (label, val) in enumerate(zip(labels, values)):
        y = y_start - (i * 0.05)
        fig.text(0.2, y, "●", color=colors[i % len(colors)], fontsize=12)
        fig.text(0.25, y, f"{label}:", color=c_sub, fontsize=10)
        fig.text(0.75, y, str(val), color=c_text, fontsize=10, weight='bold', ha='right')

    # Save
    temp_dir = os.path.join(os.getcwd(), "temp")
    os.makedirs(temp_dir, exist_ok=True)
    filename = f"{filename_prefix}_{int(time.time())}.png"
    filepath = os.path.join(temp_dir, filename)
    
    plt.savefig(filepath, dpi=120, facecolor=c_bg, bbox_inches='tight')
    plt.close(fig)
    return filepath

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--type", required=True, choices=["quorum", "poll"])
    parser.add_argument("--question", help="Pregunta para el gráfico de encuesta")
    parser.add_argument("--poll_id", help="UUID de la encuesta para el gráfico")
    parser.add_argument("--json", action="store_true")
    args = parser.parse_args()
    
    global JSON_MODE
    JSON_MODE = args.json
    
    try:
        sb = create_client(SUPABASE_URL, SUPABASE_KEY)
        
        if args.type == "quorum":
            path = generate_quorum_chart(sb)
        else:
            path = generate_poll_chart(sb, question_text=args.question, poll_id=args.poll_id)
            
        result = {"ok": True, "image": path}
        print(json.dumps(result))
        
    except Exception as e:
        err = {"ok": False, "error": str(e)}
        print(json.dumps(err))
        sys.exit(1)

if __name__ == "__main__":
    main()
