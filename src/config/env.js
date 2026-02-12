// src/config/env.js
const path = require("path");
const fs = require("fs");

function loadDotenvOnce() {
  // carga .env del root del proyecto (C:\Comercial\.env)
  // si ya lo tienes cargado en index.js, esto no estorba, pero evita dobles cargas raras.
  try {
    const dotenv = require("dotenv");
    const envPath = path.resolve(process.cwd(), ".env");
    if (fs.existsSync(envPath)) {
      dotenv.config({ path: envPath });
    } else {
      dotenv.config(); // fallback
    }
  } catch (_) {}
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
  IDLE_CLOSE_MS: Number(get("IDLE_CLOSE_MS", "120000")),

  WPP_SUPERADMINS: get("WPP_SUPERADMINS", ""),
};
