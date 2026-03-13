// src/services/monitor.service.js
const { spawn } = require("child_process");
const path = require("path");
const { sendTextChunked, sendTextMany } = require("./messaging.service");

function pickPython() {
  if (process.env.PYTHON_BIN && process.env.PYTHON_BIN.trim()) return process.env.PYTHON_BIN.trim();
  return "python";
}

/**
 * Intenta extraer un JSON válido incluso si stdout trae ruido.
 * - Busca desde el primer "{" o "[" hasta el final y prueba parseos.
 * - Útil si el script imprime banners accidentalmente.
 */
function safeParseJsonLoose(text) {
  if (!text) return null;
  const raw = String(text).trim();
  if (!raw) return null;

  // 1) intento directo
  try {
    return JSON.parse(raw);
  } catch (_) { }

  // 2) recortar a partir del primer { o [
  let start = -1;
  const firstObj = raw.indexOf("{");
  const firstArr = raw.indexOf("[");

  if (firstObj !== -1 && firstArr !== -1) start = Math.min(firstObj, firstArr);
  else if (firstObj !== -1) start = firstObj;
  else if (firstArr !== -1) start = firstArr;

  // 🚑 MEJORA: Buscar el ÚLTIMO inicio de JSON probable si hay basura antes
  // Buscamos patrones típicos de nuestra respuesta: {"ok": or [{"
  const lastOk = raw.lastIndexOf('{"ok":');
  if (lastOk !== -1 && lastOk > start) {
    start = lastOk;
  }

  if (start === -1) return null;

  const sliced = raw.slice(start);

  // 3) intentar parseando decreciendo el final (por si hay basura al final)
  let end = sliced.length;
  const tries = 50;
  for (let i = 0; i < tries; i++) {
    try {
      return JSON.parse(sliced.slice(0, end));
    } catch (_) {
      end = sliced.lastIndexOf("}", end - 1);
      if (end === -1) break;
      end = end + 1;
    }
  }

  return null;
}

function buildArgs({ scriptPath, tipo, zona }) {
  // ✅ Por defecto: el Python debe devolver JSON para que el bot envíe segmentado
  // Si necesitas el modo antiguo (Python enviando), pon MONITOR_MODE=self_send
  const mode = String(process.env.MONITOR_MODE || "bot_send").toLowerCase();

  const args = [scriptPath];

  // Args opcionales por ENV (sin tocar el código)
  // Ejemplos:
  //  MONITOR_SHEET="Hoja1"
  //  MONITOR_MAX_WORKERS="35"
  //  MONITOR_RETRIES="2"
  //  MONITOR_RESOLVE_DNS="1"
  if (process.env.MONITOR_SHEET) args.push("--sheet", String(process.env.MONITOR_SHEET));
  if (process.env.MONITOR_MAX_WORKERS) args.push("--max-workers", String(process.env.MONITOR_MAX_WORKERS));
  if (process.env.MONITOR_RETRIES) args.push("--retries", String(process.env.MONITOR_RETRIES));
  if (String(process.env.MONITOR_RESOLVE_DNS || "").trim() === "1") args.push("--resolve-dns");

  if (mode === "self_send") {
    // compatibilidad: tu script viejo usa --to/--tipo/--zona
    args.push("--tipo", String(tipo || "standard"));
    if (zona && String(zona).trim()) args.push("--zona", String(zona).trim());
  } else {
    // ✅ NUEVO: JSON + tipo + opcional zona
    args.push("--json");
    args.push("--tipo", String(tipo || "standard"));
    if (zona && String(zona).trim()) args.push("--zona", String(zona).trim());
  }

  // Extra args (por si necesitas algo puntual sin desplegar)
  // Ej: MONITOR_EXTRA_ARGS="--sheet Hoja2 --max-workers 50"
  if (process.env.MONITOR_EXTRA_ARGS && String(process.env.MONITOR_EXTRA_ARGS).trim()) {
    const extra = String(process.env.MONITOR_EXTRA_ARGS).trim().split(/\s+/).filter(Boolean);
    args.push(...extra);
  }

  return args;
}

function runMonitor({ tipo = "standard", zona }) {
  return new Promise((resolve) => {
    const pythonBin = pickPython();
    const scriptPath = process.env.MONITOR_SCRIPT || require("path").resolve(__dirname, "../../monitor_puntos_wpp.py");
    const timeoutMs = Number(process.env.MONITOR_TIMEOUT_MS || 180000); // 3 min

    const args = buildArgs({ scriptPath, tipo, zona });

    // DEBUG: Logs de ejecución
    console.log(`🚀 Ejecutando monitor: ${pythonBin} ${args.join(" ")}`);
    console.log(`📂 CWD: ${path.dirname(scriptPath)}`);

    const child = spawn(pythonBin, args, {
      windowsHide: true,
      cwd: path.dirname(scriptPath),
      env: { ...process.env, PYTHONIOENCODING: "utf-8" }, // Forzar UTF-8
    });

    let stdout = "";
    let stderr = "";
    let killedByTimeout = false;

    const timer = setTimeout(() => {
      killedByTimeout = true;
      try { child.kill("SIGKILL"); } catch (_) { }
    }, timeoutMs);

    child.stdout.on("data", (d) => (stdout += d.toString("utf8")));
    child.stderr.on("data", (d) => (stderr += d.toString("utf8")));

    child.on("error", (err) => {
      clearTimeout(timer);
      return resolve({
        ok: false,
        exitCode: -1,
        stdout,
        stderr: stderr + (err?.message ? `\n${err.message}` : ""),
        cmd: `${pythonBin} ${args.join(" ")}`,
        killedByTimeout,
        payload: null,
      });
    });

    child.on("close", (exitCode) => {
      clearTimeout(timer);

      const payload = safeParseJsonLoose(stdout);

      const ok = (exitCode === 0) && !killedByTimeout;

      // DEBUG: Ver qué dice stderr (traces de Python)
      if (stderr && stderr.trim().length > 0) {
        console.log("🐍 PYTHON STDERR:", stderr);
      }

      return resolve({
        ok,
        exitCode,
        stdout,
        stderr,
        cmd: `${pythonBin} ${args.join(" ")}`,
        killedByTimeout,
        payload, // { ok, messages:[], report:"...", ... } si aplica
      });
    });
  });
}

/**
 * ✅ Ejecuta monitor y ENVÍA por WhatsApp desde el BOT:
 * - Si payload.messages[] existe => envía en orden (segmentado por zona)
 * - Si no => fallback sendTextChunked(stdout/report)
 */
async function runMonitorAndSend({ to, tipo = "standard", zona, channelId }) {
  const r = await runMonitor({ tipo, zona });

  if (!r.ok) {
    // Devuelve un error más útil (stderr recortado) para no spamear
    const errTxt = String(r.stderr || r.stdout || "monitor_failed").trim();
    const shortErr = errTxt.length > 1200 ? errTxt.slice(0, 1200) + "\n...[recortado]" : errTxt;

    return {
      ok: false,
      error: shortErr || "monitor_failed",
      detail: {
        exitCode: r.exitCode,
        killedByTimeout: r.killedByTimeout,
        cmd: r.cmd,
      },
    };
  }

  const payload = r.payload;

  console.log("🔍 MONITOR PAYLOAD:", JSON.stringify(payload, null, 2)); // DEBUG EXTRA

  // 📸 NUEVO: Si trae imagen, enviarla primero
  if (payload && payload.image) {
    const fs = require('fs');
    // Normalizar path de forma robusta para Docker/Linux y Windows
    let imagePath = payload.image;

    // Si la ruta es absoluta del sistema (ej: /tmp/...), intentar usarla tal cual
    // Si no, intentar resolverla relativa al CWD
    if (!path.isAbsolute(imagePath)) {
      imagePath = path.resolve(process.cwd(), imagePath);
    }

    console.log(`📸 Detectada imagen en: ${imagePath}`);

    if (fs.existsSync(imagePath)) {
      console.log("📸 Archivo existe. Enviando...");
      const msgService = require("./messaging.service");
      await msgService.sendPhoto(to, imagePath, "📊 Resumen Gráfico", { channelId });
    } else {
      console.error(`❌ El archivo de imagen no existe en disco: ${imagePath}`);
    }
  }

  // Caso ideal: python devuelve JSON con messages[]
  if (payload && payload.ok && Array.isArray(payload.messages) && payload.messages.length) {
    // ✅ Fix: Extraer el string 'text' si viene como objeto { text: "..." }
    const cleanMessages = payload.messages.map(m => (m && typeof m === "object" && m.text) ? m.text : m);

    const sent = await sendTextMany(to, cleanMessages, {
      delayMs: Number(process.env.WPP_SEND_DELAY_MS || 350),
      stopOnFail: true,
      channelId
    });
    return { ok: !!sent.ok, mode: "json_messages", sent, summary: payload.summary || null };
  }

  // Fallback: texto plano (o JSON sin messages)
  const text = (payload && payload.report) ? payload.report : (r.stdout || "");
  const sent = await sendTextChunked(to, text, {
    maxLen: Number(process.env.WPP_CHUNK_MAXLEN || 3500),
    delayMs: Number(process.env.WPP_SEND_DELAY_MS || 350),
    channelId
  });

  return { ok: !!sent.ok, mode: "fallback_text", sent };
}

module.exports = { runMonitor, runMonitorAndSend };
