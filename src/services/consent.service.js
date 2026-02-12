// src/services/consent.service.js
const fs = require("fs");
const path = require("path");

// ✅ Ruta fija (evita que process.cwd() cambie)
const LOG_PATH = path.resolve("C:\\Comercial\\consent.log");

function appendConsentLog(entry) {
  const line = JSON.stringify(entry) + "\n";
  fs.appendFileSync(LOG_PATH, line, { encoding: "utf8" });
}

/**
 * ✅ TRUE si existe AL MENOS un registro ACCEPTED para ese wa_id
 */
function hasAcceptedConsent(waId) {
  try {
    if (!fs.existsSync(LOG_PATH)) return false;

    const data = fs.readFileSync(LOG_PATH, "utf8");
    if (!data) return false;

    const lines = data.split("\n");
    for (const line of lines) {
      if (!line.trim()) continue;
      let obj;
      try {
        obj = JSON.parse(line);
      } catch {
        continue;
      }

      if (String(obj.wa_id) === String(waId) && obj.consent === "ACCEPTED") {
        return true;
      }
    }
    return false;
  } catch (e) {
    console.log("❌ Error leyendo concent.log:", e.message);
    return false;
  }
}

module.exports = { appendConsentLog, hasAcceptedConsent, LOG_PATH };
