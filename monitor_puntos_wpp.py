import os
import sys
import re
import time
import platform
import subprocess
import json
import argparse
import concurrent.futures
from datetime import datetime
from typing import Optional, Tuple, Dict, List

# Forzar UTF-8 en Windows para consola
if sys.platform == "win32":
    try:
        sys.stdout.reconfigure(encoding="utf-8")
    except Exception:
        pass

import pandas as pd
import requests
from dotenv import load_dotenv
from supabase import create_client, Client # ✅ NUEVO
import warnings
warnings.filterwarnings("ignore")

import matplotlib
matplotlib.use('Agg') # ✅ Backend no interactivo para Docker/Server
import matplotlib.pyplot as plt

import ipaddress
import socket

# ============================================================================
# CONFIGURACIÓN
# ============================================================================

load_dotenv()

# ✅ Configuración Supabase
SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_KEY = os.getenv("SUPABASE_KEY")

WHATSAPP_TOKEN  = os.getenv("WPP_TOKEN", "")
PHONE_NUMBER_ID = os.getenv("PHONE_NUMBER_ID", "")
WPP_TO_NUMBER   = os.getenv("WPP_TO_NUMBER", "573105317626")

WPP_VERSION = os.getenv("WPP_VERSION", "v21.0")

# Ping
PING_RETRIES = 2
PING_TIMEOUT = 2000  # ms
PING_COUNT   = 1
RESOLVE_DNS  = False

# Global flag
JSON_MODE = False

def log(msg):
    if JSON_MODE:
        # En modo JSON, los logs van a stderr para no contaminar stdout
        try:
            print(msg, file=sys.stderr)
        except:
            pass
    else:
        try:
            print(msg)
        except:
            pass

MAX_WORKERS  = 35

# Exclusiones
EXCLUDED_IPS = {"127.0.0.1", "10.0.0.1", "0.0.0.0", "255.255.255.255"}
EXCLUDED_PREFIXES: Dict[str, bool] = {}

# Salida local (logs / CSV)
OUTPUT_DIR          = "PuntosReportes"
HISTORY_FILE        = "monitor_history.json"
STATE_HISTORY_FILE  = "state_history.json"
LOG_FILENAME        = "monitor_inteligente.log"

BUSINESS_NAME = "Gane Palmira"

HISTORY_JSON       = os.path.join(OUTPUT_DIR, HISTORY_FILE)
STATE_HISTORY_JSON = os.path.join(OUTPUT_DIR, STATE_HISTORY_FILE)
EWMA_ALPHA         = 0.3

_IP_RE = re.compile(r"^(?:\d{1,3}\.){3}\d{1,3}$")
_DNS_CACHE: Dict[str, Optional[str]] = {}
JSON_MODE = False

# Función duplicada eliminada

# ============================================================================
# NORMALIZACIÓN
# ============================================================================

def norm_text(s: Optional[str]) -> str:
    if s is None:
        return ""
    t = str(s).strip().upper()
    t = t.encode("utf-8", "ignore").decode("utf-8", "ignore")
    t = (
        t.replace("Á", "A").replace("É", "E").replace("Í", "I")
         .replace("Ó", "O").replace("Ú", "U").replace("Ñ", "N")
    )
    t = re.sub(r"\s+", " ", t).strip()
    return t

def contains_word(haystack: str, needle: str) -> bool:
    if not needle: return True
    if not haystack: return False
    pattern = r"(^|[^A-Z0-9])" + re.escape(needle) + r"([^A-Z0-9]|$)"
    return re.search(pattern, haystack) is not None

# ============================================================================
# FUNCIÓN UPTIME
# ============================================================================
# (Mantenemos Uptime logic intacta)
def get_windows_uptime():
    try:
        result = subprocess.run(["systeminfo"], capture_output=True, text=True, timeout=15, check=True)
        output = result.stdout
        for line in output.split("\n"):
            if "Hora de inicio del sistema" in line or "System Boot Time" in line:
                return {"success": True, "uptime": line.split(":", 1)[1].strip(), "timestamp": datetime.now().isoformat(), "command": "systeminfo", "system": "Windows"}
        return {"success": False, "error": "No uptime info", "timestamp": datetime.now().isoformat()}
    except Exception as e:
        return {"success": False, "error": str(e), "timestamp": datetime.now().isoformat()}

def get_system_uptime():
    try:
        result = subprocess.run(["uptime", "-s"], capture_output=True, text=True, timeout=10, check=True)
        return {"success": True, "uptime": result.stdout.strip(), "timestamp": datetime.now().isoformat(), "command": "uptime -s", "system": platform.system()}
    except Exception:
        if platform.system().lower() == "windows": return get_windows_uptime()
        return {"success": False, "error": "uptime cmd failed"}

def handle_uptime_command():
    print(json.dumps(get_system_uptime(), ensure_ascii=False, indent=None if JSON_MODE else 2))

# ============================================================================
# UTILIDADES
# ============================================================================

def ensure_dirs():
    os.makedirs(OUTPUT_DIR, exist_ok=True)

def is_excluded(ip: str) -> bool:
    if ip in EXCLUDED_IPS: return True
    return any(ip.startswith(pref) for pref in EXCLUDED_PREFIXES)

def _parse_latency_windows_ping(stdout_text: str) -> Optional[float]:
    if not stdout_text: return None
    m = re.search(r"(Promedio|Average)\s*=\s*(\d+)\s*ms", stdout_text, re.IGNORECASE)
    return float(m.group(2)) if m else None

def _parse_latency_linux_ping(stdout_text: str) -> Optional[float]:
    if not stdout_text: return None
    m = re.search(r"time[=<]\s*([\d\.]+)\s*ms", stdout_text, re.IGNORECASE)
    return float(m.group(1)) if m else None

def ping_host(ip: str) -> Tuple[bool, Optional[float], str]:
    if is_excluded(ip): return False, None, "excluded"
    system = platform.system().lower()
    last_reason = "no_attempt"
    
    for attempt in range(PING_RETRIES):
        try:
            if system == "windows":
                cmd = ["ping", "-n", str(PING_COUNT), "-w", str(PING_TIMEOUT), ip]
                creationflags = getattr(subprocess, "CREATE_NO_WINDOW", 0)
                result = subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, timeout=(PING_TIMEOUT/1000)+3, creationflags=creationflags, text=True, errors="ignore")
                out = result.stdout or ""
                success = ("TTL=" in out.upper()) and (result.returncode == 0)
                if success: return True, _parse_latency_windows_ping(out), "ttl_ok"
                last_reason = f"win_fail_rc={result.returncode}"
            else:
                cmd = ["ping", "-c", str(PING_COUNT), "-W", "2", ip]
                result = subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, timeout=(PING_TIMEOUT/1000)+3, text=True, errors="ignore")
                out = result.stdout or ""
                success = (("bytes from" in out.lower()) or ("time=" in out.lower())) and (result.returncode == 0)
                if success: return True, _parse_latency_linux_ping(out), "bytesfrom_ok"
                last_reason = f"nix_fail_rc={result.returncode}"
        except subprocess.TimeoutExpired: last_reason = "timeout"
        except Exception as e: last_reason = f"error:{e}"
        time.sleep(0.15 + (attempt * 0.1))
        
    return False, None, last_reason

def resolve_hostname(ip: str) -> Optional[str]:
    return None # Desactivado para velocidad

def _status_emoji_by_availability(pct: float) -> str:
    if pct >= 95: return "🟢"
    if pct >= 90: return "🟡"
    if pct >= 85: return "🟠"
    return "🔴"

# ============================================================================
# HISTORIAL
# ============================================================================
def load_state_history() -> Dict:
    ensure_dirs()
    if os.path.exists(STATE_HISTORY_JSON):
        try:
            with open(STATE_HISTORY_JSON, "r", encoding="utf-8") as f: return json.load(f)
        except Exception: return {}
    return {}

def save_state_history(history: Dict) -> None:
    ensure_dirs()
    try:
        with open(STATE_HISTORY_JSON, "w", encoding="utf-8") as f: json.dump(history, f, ensure_ascii=False, indent=2)
    except: pass

def update_state_history(scan_results: List[Dict]) -> Dict:
    history = load_state_history()
    now_iso = datetime.now().isoformat()
    for result in scan_results:
        if result.get("excluded"): continue
        ip = result["ip"]
        is_active = bool(result["active"])
        if ip not in history:
            history[ip] = {"alias": result.get("alias"), "segment": result.get("segment"), "first_seen": now_iso, "state_changes": 0, "last_state": None, "last_seen_active": None, "active_since": None, "last_state_change": None, "last_scan": None}
        prev_state = history[ip].get("last_state")
        history[ip]["last_state"] = is_active
        history[ip]["last_scan"] = now_iso
        if is_active:
            history[ip]["last_seen_active"] = now_iso
            if prev_state is False or not history[ip].get("active_since"): history[ip]["active_since"] = now_iso
        if prev_state is not None and prev_state != is_active:
            history[ip]["state_changes"] = int(history[ip].get("state_changes", 0)) + 1
            history[ip]["last_state_change"] = now_iso
            if is_active is False: history[ip]["active_since"] = None
    save_state_history(history)
    return history

def scan_single_target(target: Dict, historical_data: Dict = None) -> Dict:
    ip, segment, alias = target["ip"], target.get("segment", "General"), target.get("alias", target["ip"])
    if is_excluded(ip): return {"segment": segment, "ip": ip, "alias": alias, "active": False, "excluded": True}
    is_active, latency, reason = ping_host(ip)
    scan_time = datetime.now()
    estimated_uptime = None
    state_change = False
    if historical_data and ip in historical_data:
        ip_history = historical_data[ip]
        if ip_history.get("last_state") is not None and ip_history.get("last_state") != is_active: state_change = True
    return {"segment": segment, "ip": ip, "alias": alias, "active": bool(is_active), "excluded": False, "latency": latency, "scan_time": scan_time.isoformat(), "state_change": state_change, "ping_reason": reason}

# ============================================================================
# ✅ NUEVO: CARGAS DESDE SUPABASE
# ============================================================================
def load_targets_from_supabase(zona: Optional[str] = None) -> pd.DataFrame:
    if not SUPABASE_URL or not SUPABASE_KEY:
        raise ValueError("❌ Faltan credenciales de Supabase en .env")

    log("☁️  Conectando a Supabase (tabla: puntos_venta)...")
    sb = create_client(SUPABASE_URL, SUPABASE_KEY)

    # ✅ FILTRO DE PUNTOS CERRADOS PERMANENTEMENTE
    # Primero intentamos filtrar directamente en Supabase (más eficiente).
    # Si la columna 'permanently_closed' no existe aún en la BD, usamos fallback de nombres.
    query_ok = False
    data = None
    try:
        response = sb.table("puntos_venta").select("*").neq("permanently_closed", True).execute()
        data = response.data
        query_ok = True
        log(f"✅ Filtro permanently_closed aplicado en query Supabase.")
    except Exception:
        log("⚠️  Columna 'permanently_closed' no disponible en query. Cargando todos los registros...")

    if not query_ok:
        try:
            response = sb.table("puntos_venta").select("*").execute()
            data = response.data
        except Exception as e:
            raise ValueError(f"❌ Error consultando Supabase: {e}")

    if not data:
        raise ValueError("❌ La tabla 'puntos_venta' está vacía o no retornó datos.")

    df = pd.DataFrame(data)
    log(f"📊 Registros descargados de Supabase: {len(df)}")

    # 🔒 FILTRO PYTHON DE SEGURIDAD: Excluir puntos cerrados permanentemente por nombre.
    # Esta lista es el respaldo para cuando la columna aún no exista en la BD.
    # IDs confirmados en Supabase:
    #   5bcf78e7 = CALLEJON GUALANDAY  V.GORG
    #   43885a98 = SAN JOAQUIN PPAL
    #   02308515 = FINAL PEREIRA JUANCHITO
    #   494942ff = SANTA ANA (CAND)
    #   48d39676 = TAT EL MOLINO
    PERMANENTLY_CLOSED_IDS = {
        "5bcf78e7-0339-47a5-b410-9783db449bc7",
        "43885a98-313f-40d9-b33f-14cade120916",
        "02308515-6217-454e-a861-11d568253a39",
        "494942ff-2f47-4bc8-9f54-80131237b3e3",
        "48d39676-1ada-41f2-827f-2ba91ccad8d6",
    }

    if not query_ok and "id" in df.columns:
        # Solo aplicar filtro por nombre si la columna no existía en Supabase
        antes = len(df)
        df = df[~df["id"].astype(str).isin(PERMANENTLY_CLOSED_IDS)].copy()
        excluidos = antes - len(df)
        if excluidos > 0:
            log(f"🔒 Filtro Python: {excluidos} punto(s) cerrado(s) permanentemente excluido(s).")

    # Filtrado por Zona (Lógica Python robusta)
    if zona:
        zona_norm = norm_text(zona)
        log(f"🎯 Filtrando por zona: '{zona}'")

        mask = df["segment"].astype(str).apply(lambda s: contains_word(norm_text(s), zona_norm))
        df = df[mask].copy()

        if df.empty:
            raise ValueError(f"❌ No se encontraron puntos para la zona {zona}")

    # ✅ Preferir 'name' sobre 'alias' si existe
    if "name" in df.columns:
        df["alias"] = df["name"].fillna(df["alias"])

    result_df = df[["ip", "segment", "alias"]].copy()
    result_df["ip"] = result_df["ip"].astype(str).str.strip()
    result_df = result_df[result_df["ip"].apply(lambda x: len(x) > 6)]  # Mínimo IP válida

    log(f"🎯 Puntos a escanear: {len(result_df)}")
    return result_df

def _get_shift_context(hour: int, is_mall: bool = False) -> str:
    """Determina el contexto del turno en la hora actual (Colombia)."""
    if is_mall:
        return "MALL" if 9 <= hour < 21 else "OFF_HOURS"
    if 7 <= hour < 13:
        return "MORNING"
    if 15 <= hour < 21:
        return "AFTERNOON"
    if 13 <= hour < 15:
        return "LUNCH_BREAK"
    return "OFF_HOURS"

def _detect_and_log_transitions(sb, results_df: pd.DataFrame, now_iso: str):
    """Consulta los estados previos en Supabase y registra las transiciones en point_activity_log."""
    try:
        active_ips = [str(row["ip"]) for _, row in results_df.iterrows() if not row["excluded"]]
        if not active_ips:
            return

        # Consultar estado actual en BD (antes de actualizar) para detectar cambios
        resp = sb.table("puntos_venta") \
            .select("ip, active, name, alias, segment, siiss_id, is_mall") \
            .in_("ip", active_ips).execute()
        prev_states = {r["ip"]: r for r in (resp.data or [])}

        # Hora Colombia para contexto del turno
        from datetime import timezone
        bogota_offset = -5 * 3600  # UTC-5
        now_dt = datetime.fromisoformat(now_iso).replace(tzinfo=timezone.utc) if "+" not in now_iso and "Z" not in now_iso else datetime.fromisoformat(now_iso)
        hour_col = (now_dt.hour - 5) % 24  # Aproximacion Bogota

        events = []
        for _, row in results_df.iterrows():
            if row["excluded"]:
                continue
            ip = str(row["ip"])
            new_active = bool(row["active"])
            prev = prev_states.get(ip)
            if not prev:
                continue  # Punto nuevo, no hay estado previo
            prev_active = bool(prev.get("active", False))
            if prev_active == new_active:
                continue  # Sin cambio de estado

            # ¡Transición detectada!
            event_type = "OPENED" if new_active else "CLOSED"
            is_mall = bool(prev.get("is_mall", False))
            shift_ctx = _get_shift_context(hour_col, is_mall)

            lat_val = row.get("latency")
            latency = 0 if (pd.isna(lat_val) or lat_val is None) else int(lat_val)

            events.append({
                "point_ip": ip,
                "point_name": prev.get("name") or prev.get("alias"),
                "siiss_id": str(prev.get("siiss_id", "") or ""),
                "segment": prev.get("segment"),
                "event_type": event_type,
                "detected_at": now_iso,
                "previous_state": prev_active,
                "latency_ms": latency,
                "shift_context": shift_ctx
            })

        if events:
            log(f"   📘 Registrando {len(events)} transiciones en point_activity_log...")
            # Chunk para seguridad
            for i in range(0, len(events), 50):
                sb.table("point_activity_log").insert(events[i:i+50]).execute()
            log(f"   ✅ {len(events)} eventos de estado registrados.")

    except Exception as e:
        log(f"   ⚠️  Error registrando transiciones de estado: {e}")


def update_supabase_results(results_df: pd.DataFrame):
    if not SUPABASE_URL or not SUPABASE_KEY: return

    log("☁️  Sincronizando resultados con Supabase...")
    sb = create_client(SUPABASE_URL, SUPABASE_KEY)
    
    now_iso = datetime.utcnow().isoformat() + "+00:00"

    # 1) Detectar y registrar transiciones ANTES del upsert
    _detect_and_log_transitions(sb, results_df, now_iso)

    # 2) Preparar batch updates
    records = []
    for _, row in results_df.iterrows():
        if row["excluded"]: continue
        
        lat_val = row["latency"]
        if pd.isna(lat_val) or lat_val is None:
            lat = 0
        else:
            lat = int(lat_val)

        rec = {
            "ip": row["ip"],
            "active": bool(row["active"]),
            "latency": lat,
            "updated_at": now_iso
        }
        # Actualizar last_online_at solo cuando el punto está activo
        if bool(row["active"]):
            rec["last_online_at"] = now_iso

        records.append(rec)
        
    if not records: return
    
    # Batch upsert en chunks de 100
    chunk_size = 100
    for i in range(0, len(records), chunk_size):
        batch = records[i:i+chunk_size]
        try:
            sb.table("puntos_venta").upsert(batch, on_conflict="ip").execute()
            log(f"   ✅ Lote {i // chunk_size + 1} actualizado ({len(batch)} registros)")
        except Exception as e:
            log(f"   ❌ Error actualizando lote: {e}")

# ============================================================================
# ESCANEO PARALELO
# ============================================================================

def scan_from_df_parallel(df_targets: pd.DataFrame) -> pd.DataFrame:
    total = len(df_targets)
    log(f"🚀 Iniciando escaneo de {total} puntos (Workers: {MAX_WORKERS})")
    historical_data = load_state_history()
    targets_list = df_targets.to_dict("records")
    results = []
    completed = 0
    start_time = time.time()
    
    with concurrent.futures.ThreadPoolExecutor(max_workers=MAX_WORKERS) as executor:
        futures = [executor.submit(scan_single_target, t, historical_data) for t in targets_list]
        for future in concurrent.futures.as_completed(futures):
            try:
                results.append(future.result())
                completed += 1
                if completed % 50 == 0: log(f"   Progreso: {completed}/{total}...")
            except Exception as e: log(f"❌ Error worker: {e}")
            
    dur = time.time() - start_time
    log(f"✅ Escaneo completado en {dur:.1f}s")
    update_state_history(results)
    return pd.DataFrame(results)

# ============================================================================
# FORMATO REPORTES (MEJORADO)
# ============================================================================
def build_report_text(results_df: pd.DataFrame, scan_duration: float, zona: Optional[str] = None) -> str:
    valid_points  = results_df[~results_df["excluded"]].copy()
    total = len(valid_points)
    active = int(valid_points["active"].sum()) if total else 0
    inactive = total - active
    avail = (active / total * 100) if total else 0
    emoji = _status_emoji_by_availability(avail)
    
    zona_title = norm_text(zona) if zona else "GENERAL"
    
    # Header Estilizado
    lines = []
    lines.append(f"📊 *REPORTE DE ESTADO*")
    lines.append(f"🏢 *{BUSINESS_NAME}*")
    lines.append(f"📍 Zona: *{zona_title}*")
    lines.append(f"📅 {datetime.now().strftime('%d/%m/%Y %I:%M %p')}")
    lines.append("─────────────────────")
    lines.append(f"{emoji} *Disponibilidad:* {avail:.1f}%")
    lines.append(f"📡 *Total Puntos:* {total}")
    lines.append(f"🟢 *En Línea:* {active}")
    lines.append(f"🔴 *Sin Conexión:* {inactive}")
    lines.append(f"⏱ *Tiempo Escaneo:* {scan_duration:.1f}s")
    lines.append("─────────────────────\n")
    
    if inactive > 0:
        lines.append("❌ *PUNTOS SIN APERTURA (OFFLINE):*\n")
        off_df = valid_points[~valid_points["active"]].sort_values("alias")
        
        # Agrupar por zona para reporte general, más ordenado
        if not zona:
             for seg, g in off_df.groupby("segment"):
                lines.append(f"\n📂 *{seg}*")
                for _, r in g.iterrows(): 
                    # 🔒 Solo mostramos Alias, ocultamos IP por seguridad/estética
                    lines.append(f"   • {r['alias']}")
        else:
            for _, r in off_df.iterrows(): 
                 lines.append(f"• {r['alias']}")
    else:
        lines.append("\n✅ *¡Excelente! Todos los puntos están operativos.*")

    return "\n".join(lines)

# ============================================================================
# MAIN
# ============================================================================

def main():
    print("🚀 Iniciando monitor_puntos_wpp.py...", file=sys.stderr) # Debug start
    parser = argparse.ArgumentParser()
    parser.add_argument("--json", action="store_true", help="Salida JSON pura")
    parser.add_argument("--tipo", default="standard")
    parser.add_argument("--zona", default=None)
    # Ignoramos argumentos legacy de Excel
    parser.add_argument("--sheet", default=None) 
    
    args, unknown = parser.parse_known_args()
    
    global JSON_MODE
    JSON_MODE = args.json
    
    zona = args.zona if (args.zona and args.zona.strip()) else None

    # Timer
    start_ts = time.time()
    
    # Forzar UTF-8 siempre (para Docker logs y JSON)
    try:
        if hasattr(sys.stdout, 'reconfigure'):
            sys.stdout.reconfigure(encoding='utf-8')
    except: pass

    try:
        # ✅ CARGA DESDE SUPABASE
        df_targets = load_targets_from_supabase(zona=zona)
        
        # ESCANEO
        results_df = scan_from_df_parallel(df_targets)
        
        duration = time.time() - start_ts
        
        # REPORTE
        report_text = build_report_text(results_df, duration, zona)
        
        # GRÁFICO (Solo en JSON mode)
        chart_path = None
        chart_error = None
        if JSON_MODE:
            try:
                # Calcular stats rápido desde el DF
                valid = results_df[~results_df["excluded"]]
                act = int(valid["active"].sum()) if len(valid) else 0
                inact = len(valid) - act
                chart_path = generate_pie_chart(act, inact, zona)
            except Exception as e:
                chart_error = str(e)
                log(f"⚠️ Error generando gráfico: {e}")

        if JSON_MODE:
            payload = {
                "ok": True,
                "report": report_text,
                "summary": f"Escaneados {len(results_df)} puntos.",
                "image": chart_path,
                "image_error": chart_error, # DEBUG
                "messages": [{"text": report_text}] 
            }
        
        # Sincronizar con Supabase
        update_supabase_results(results_df)

        if JSON_MODE:
            print(json.dumps(payload, ensure_ascii=False))
        else:
            print(report_text)
            
    except Exception as e:
        err_msg = str(e)
        log(f"❌ CRITICAL EXCEPTION: {err_msg}") # Log to stderr forced
        if JSON_MODE:
            print(json.dumps({"ok": False, "error": err_msg}, ensure_ascii=False))
        else:
            print(f"❌ Error Fatal: {err_msg}")
        sys.exit(1)

def generate_pie_chart(active, inactive, zona=None):
    try:
        # 🎨 Estilo Dashboard Premium
        # No dependemos de estilos preinstalados, configuramos manualmente el objeto Figure
        
        total = active + inactive
        if total == 0: return None
        
        pct_active = (active / total) * 100
        
        # Colores
        c_bg = '#1E1E1E'    # Gris oscuro (Background)
        c_on = '#00E676'    # Verde Neon
        c_off = '#FF1744'   # Rojo Neon
        c_text = '#FFFFFF'  # Blanco
        c_sub = '#AAAAAA'   # Gris claro
        
        # Crear Figura (Cuadrada 6x6 para móvil vertical)
        fig = plt.figure(figsize=(6, 6))
        fig.patch.set_facecolor(c_bg)
        
        # Font Common
        # ✅ FIX: Detectar si Segoe UI existe (Windows), sino usar sans-serif (Linux/Docker)
        from matplotlib import font_manager
        font_main = 'sans-serif'
        try:
            fonts = [f.name for f in font_manager.fontManager.ttflist]
            if "Segoe UI" in fonts:
                font_main = "Segoe UI"
        except: pass
        
        # --- 1. CABECERA (Top 15%) ---
        zone_title = (zona or "GENERAL").upper()
        if len(zone_title) > 22: zone_title = zone_title[:20] + ".."
        
        fig.text(0.5, 0.93, "REPORTE DE ESTADO", fontsize=10, color=c_sub, ha='center', weight='bold', fontname=font_main)
        fig.text(0.5, 0.86, zone_title, fontsize=24, color=c_text, ha='center', weight='bold', fontname=font_main)
        
        # --- 2. GRÁFICO (Middle-Top 45%) ---
        # [left, bottom, width, height] en coords de figura
        # Aumentamos tamaño (0.70 -> 0.80 width/height)
        ax_pie = fig.add_axes([0.10, 0.38, 0.80, 0.45]) 
        
        wedges, texts = ax_pie.pie(
            [active, inactive], 
            colors=[c_on, c_off], 
            startangle=90, 
            counterclock=False, 
            wedgeprops={'width': 0.22, 'edgecolor': c_bg, 'linewidth': 4}
        )
        
        # Texto Centro Donut (Porcentaje más pequeño)
        ax_pie.text(0, 0.10, f"{pct_active:.0f}%", ha='center', va='center', fontsize=32, fontweight='bold', color=c_text, fontname=font_main)
        ax_pie.text(0, -0.25, "ONLINE", ha='center', va='center', fontsize=12, color=c_sub, fontname=font_main)

        # --- 3. ESTADÍSTICAS (Bottom 30%) ---
        # Línea divisoria
        fig.add_artist(plt.Line2D([0.15, 0.85], [0.36, 0.36], color='#333333', linewidth=1))
        
        # Filas (Usando fig.text para control absoluto)
        def draw_stat_row(y, label, value, color_val):
            fig.text(0.15, y, "●", color=color_val, fontsize=14, ha='center', va='center')
            fig.text(0.20, y, label, color='#DDDDDD', fontsize=14, ha='left', va='center', fontname=font_main)
            # Valor alineado a la derecha con 'Segoe UI'
            fig.text(0.85, y, str(value), color='white', fontsize=16, weight='bold', ha='right', va='center', fontname=font_main)

        y_base = 0.28
        y_step = 0.08
        
        draw_stat_row(y_base, "Total Puntos", total, '#FFFFFF')
        draw_stat_row(y_base - y_step, "En Línea", active, c_on)
        draw_stat_row(y_base - y_step*2, "Sin Conexión", inactive, c_off)

        # --- 4. PIE DE PÁGINA (Bottom 10%) ---
        now_str = datetime.now().strftime("%d %b %Y, %I:%M %p").upper()
        fig.text(0.5, 0.03, now_str, fontsize=9, color='#666666', ha='center', fontname=font_main)

        # Guardar en ./temp (compatible con Docker y Node.js)
        temp_dir = os.path.join(os.getcwd(), "temp")
        if not os.path.exists(temp_dir):
            os.makedirs(temp_dir, exist_ok=True)
            
        filename = f"chart_{int(time.time())}_{active}_{inactive}.png"
        filepath = os.path.join(temp_dir, filename)
        
        # Guardamos EXACTO
        plt.savefig(filepath, dpi=120, facecolor=c_bg, bbox_inches='tight')
        plt.close(fig) # Liberar memoria explícitamente
        
        log(f"📸 Gráfico generado en: {filepath}")
        return filepath

    except Exception as e:
        sys.stderr.write(f"Error generando gráfico: {e}\n")
        return None

if __name__ == "__main__":
    # Check simple commands
    if len(sys.argv) > 1 and sys.argv[1] == "uptime":
        handle_uptime_command()
    else:
        main()
