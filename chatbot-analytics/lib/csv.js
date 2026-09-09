'use strict';

/**
 * Serializa un arreglo de objetos planos a texto CSV (compatible con Excel).
 * - Cabecera = claves del primer objeto (o `headers` si se pasa).
 * - Escapa comillas, comas, saltos de linea y `;`.
 * - Separador `,` ; fin de linea `\r\n`.
 * El BOM UTF-8 lo agrega quien responde (server.js), no esta funcion.
 */
function toCSV(rows, headers) {
  const cols = headers || (rows.length ? Object.keys(rows[0]) : []);
  const esc = (v) => {
    const s = v == null ? '' : String(v);
    return /[",\r\n;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const lines = [cols.map(esc).join(',')];
  for (const row of rows) lines.push(cols.map((c) => esc(row[c])).join(','));
  return lines.join('\r\n');
}

module.exports = { toCSV };
