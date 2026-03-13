/**
 * Utilidades de texto para el bot.
 */

/**
 * Normaliza un texto: quita acentos, convierte a minúsculas y elimina espacios extra.
 * @param {string} text 
 * @returns {string}
 */
function normText(text) {
    if (!text) return "";
    return text
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "") // Quitar acentos
        .trim();
}

/**
 * Normaliza y purifica un identificador para base de datos (Ej: extrae el int o permite tg_)
 */
function normWaId(x) {
    const s = String(x || "");
    if (s.startsWith("tg_")) return s; // ✅ Permitir Telegram ID sin filtrar
    return s.replace(/[^\d]/g, "");
}

module.exports = {
    normText,
    normWaId
};
