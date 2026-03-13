// src/config/env.js
const path = require("path");
const fs = require("fs");

function loadDotenvOnce() {
  // Carga .env del directorio actual (CWD)
  try {
    const dotenv = require("dotenv");
    const envPath = path.resolve(process.cwd(), ".env");
    if (fs.existsSync(envPath)) {
      dotenv.config({ path: envPath });
    } else {
      // Fallback a archivos estándar si no se encuentra en el CWD
      dotenv.config();
    }
  } catch (_) { }
}
loadDotenvOnce();

function get(name, def = undefined) {
  const v = process.env[name];
  return (v === undefined || v === null || `${v}`.trim() === "") ? def : `${v}`.trim();
}
function required(name) {
  const v = get(name);
  if (!v) throw new Error(`Falta variable de entorno: ${name}`);
  return v;
}

module.exports = {
  // server
  PORT: Number(get("PORT", "3001")),
  VERIFY_TOKEN: required("VERIFY_TOKEN"),

  // WhatsApp Cloud API (TU formato)
  WPP_TOKEN: required("WPP_TOKEN"),
  PHONE_NUMBER_ID: required("PHONE_NUMBER_ID"),
  WPP_VERSION: get("WPP_VERSION", "v22.0"),
  APP_SECRET: get("APP_SECRET"), // Opcional: para validar firma de Meta

  // otros (los dejo por si los usas en tu bot)
  CONSENT_VERSION: get("CONSENT_VERSION", "2026-01"),
  PYTHON_BIN: get("PYTHON_BIN", "python"),
  MONITOR_SCRIPT: get("MONITOR_SCRIPT"),
  REPORT_TYPE: get("REPORT_TYPE", "encendido"),
  IDLE_CLOSE_MS: Number(get("IDLE_CLOSE_MS", "1800000")), // v11.19: 30 minutos para producción
  WPP_SUPERADMINS: get("WPP_SUPERADMINS", ""),

  // SIISS Integration
  SIISS_URL: get("SIISS_URL", "http://10.192.168.8:8101"),
  SIISS_USER: get("SIISS_USER", "123123123"),
  SIISS_PASS: get("SIISS_PASS", "CP123"),
};
