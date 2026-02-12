// src/services/access.service.js

function normWaId(x) {
  const s = String(x || "").trim();
  // Permitir IDs de Telegram explicitos
  if (s.startsWith("tg_")) return s;
  // Comportamiento normal para WA: solo numeros
  return s.replace(/[^\d]/g, "");
}

function csvToSet(v) {
  return new Set(
    String(v || "")
      .split(",")
      .map((s) => normWaId(s))
      .filter(Boolean)
  );
}

function envZoneMap() {
  // Claves internas del bot => ENV KEY
  return [
    ["AMAIME Y EL PLACER", "WPP_ADMIN_AMAIME_Y_EL_PLACER"],
    ["CANDELARIA", "WPP_ADMIN_CANDELARIA"],
    ["FLORIDA", "WPP_ADMIN_FLORIDA"],
    ["OCCIDENTE", "WPP_ADMIN_OCCIDENTE"],
    ["PALMIRA", "WPP_ADMIN_PALMIRA"],
    ["PRADERA", "WPP_ADMIN_PRADERA"],
    ["ROZO", "WPP_ADMIN_ROZO"],
  ];
}

function getUserAccess(waId) {
  const id = normWaId(waId); // ej: "tg_12345" o "57300..."

  const superAdmins = csvToSet(process.env.WPP_SUPERADMINS);
  if (superAdmins.has(id)) {
    return { role: "SUPERADMIN", zones: new Set(["*"]) }; // '*' = todas
  }

  const zones = new Set();
  for (const [zoneName, envKey] of envZoneMap()) {
    const set = csvToSet(process.env[envKey]);
    if (set.has(id)) zones.add(zoneName);
  }

  if (zones.size > 0) return { role: "ADMIN", zones };

  return { role: "NONE", zones: new Set() };
}

function canAccessZone(access, zoneName) {
  if (!access) return false;
  if (access.zones.has("*")) return true;
  return access.zones.has(zoneName);
}

module.exports = { getUserAccess, canAccessZone };
