/**
 * Auditoría IMAP de solo lectura. No modifica state.json ni el buzón.
 * Genera un JSON detallado y un resumen Markdown dentro de audits/.
 */
require("dotenv").config({ quiet: true });
const { ImapFlow } = require("imapflow");
const { simpleParser } = require("mailparser");
const ExcelJS = require("exceljs");
const fs = require("fs");
const path = require("path");
const {
  parseBody,
  classify,
  dedupAperturaCierre,
  dedupMocion,
} = require("./engine");

const ROOT = __dirname;
const AUDIT_DIR = path.join(ROOT, "audits");
const STORE_MAP_PATH = path.join(ROOT, "config", "store-map.json");
const EXCEL_PATH = path.resolve(ROOT, process.env.EXCEL_OUTPUT_PATH || "./output/CCTV_Eventos.xlsx");

function inc(obj, key) {
  const k = key || "(vacío)";
  obj[k] = (obj[k] || 0) + 1;
}

function sample(bucket, key, value, max = 12) {
  bucket[key] = bucket[key] || [];
  if (bucket[key].length < max) bucket[key].push(value);
}

function fechaLocalKey(d) {
  if (!(d instanceof Date) || isNaN(d)) return null;
  return [d.getFullYear(), String(d.getMonth() + 1).padStart(2, "0"), String(d.getDate()).padStart(2, "0")].join("-");
}

async function resumenExcel() {
  if (!fs.existsSync(EXCEL_PATH)) return { existe: false };
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(EXCEL_PATH);
  const resultado = { existe: true, hojas: wb.worksheets.map((ws) => ws.name), filas: {}, duplicados: {} };
  for (const ws of wb.worksheets) {
    resultado.filas[ws.name] = Math.max(0, ws.rowCount - 1);
  }
  const ac = wb.getWorksheet("Apertura_Cierre");
  if (ac) {
    const vistos = new Set();
    const dup = [];
    ac.eachRow((row, num) => {
      if (num === 1) return;
      const key = `${row.getCell(2).value}__${row.getCell(1).value}`;
      if (vistos.has(key)) dup.push(key);
      vistos.add(key);
    });
    resultado.duplicados.Apertura_Cierre = dup;
  }
  return resultado;
}

async function main() {
  fs.mkdirSync(AUDIT_DIR, { recursive: true });
  const storeMap = fs.existsSync(STORE_MAP_PATH) ? JSON.parse(fs.readFileSync(STORE_MAP_PATH, "utf8")) : {};
  const client = new ImapFlow({
    host: process.env.IMAP_HOST,
    port: Number(process.env.IMAP_PORT),
    secure: true,
    auth: { user: process.env.IMAP_USER, pass: process.env.IMAP_PASSWORD },
    logger: false,
  });

  const audit = {
    generadoEn: new Date().toISOString(),
    modo: "IMAP solo lectura; state.json sin cambios",
    carpeta: process.env.IMAP_FOLDER || "INBOX",
    total: 0,
    uidMin: null,
    uidMax: null,
    fechaCorreoMin: null,
    fechaCorreoMax: null,
    categorias: {},
    descartesPorMotivo: {},
    tiposEventoCrudos: {},
    timestampInvalidoPorCategoria: {},
    eventosPosterioresAlCorreo: 0,
    eventosMuyAnterioresAlCorreo: 0,
    muestrasDescartes: {},
    muestrasDesfase: [],
  };
  const clasificados = [];

  await client.connect();
  try {
    const lock = await client.getMailboxLock(audit.carpeta, { readOnly: true });
    try {
      const uidNext = client.mailbox.uidNext;
      for await (const msg of client.fetch(`1:${uidNext - 1}`, { envelope: true, source: true, uid: true }, { uid: true })) {
        const parsed = await simpleParser(msg.source);
        const email = {
          uid: msg.uid,
          subject: msg.envelope?.subject || "",
          from: msg.envelope?.from?.[0]?.address || "",
          date: msg.envelope?.date || null,
          hasAttachment: (parsed.attachments || []).length > 0,
          body: parsed.text || "",
        };
        const fields = parseBody(email.body);
        const tipoCrudo = fields["Evento de alarma"] || "(sin campo Evento de alarma)";
        const c = classify(email, storeMap);
        clasificados.push(c);
        audit.total++;
        audit.uidMin = audit.uidMin === null ? msg.uid : Math.min(audit.uidMin, msg.uid);
        audit.uidMax = audit.uidMax === null ? msg.uid : Math.max(audit.uidMax, msg.uid);
        if (email.date instanceof Date && !isNaN(email.date)) {
          const iso = email.date.toISOString();
          audit.fechaCorreoMin = !audit.fechaCorreoMin || iso < audit.fechaCorreoMin ? iso : audit.fechaCorreoMin;
          audit.fechaCorreoMax = !audit.fechaCorreoMax || iso > audit.fechaCorreoMax ? iso : audit.fechaCorreoMax;
        }
        inc(audit.categorias, c.categoria);
        inc(audit.tiposEventoCrudos, tipoCrudo);

        if (c.categoria === "DESCARTADO") {
          inc(audit.descartesPorMotivo, c.motivo);
          sample(audit.muestrasDescartes, c.motivo, { uid: email.uid, asunto: email.subject, tipoEvento: tipoCrudo });
        } else if (!(c.timestamp instanceof Date) || isNaN(c.timestamp)) {
          inc(audit.timestampInvalidoPorCategoria, c.categoria);
        } else if (email.date instanceof Date && !isNaN(email.date)) {
          const diferenciaHoras = (c.timestamp - email.date) / 3600000;
          if (diferenciaHoras > 1) {
            audit.eventosPosterioresAlCorreo++;
            if (audit.muestrasDesfase.length < 20) audit.muestrasDesfase.push({ uid: email.uid, categoria: c.categoria, tienda: c.tienda, evento: c.timestamp.toISOString(), correo: email.date.toISOString(), diferenciaHoras: Number(diferenciaHoras.toFixed(2)) });
          }
          if (diferenciaHoras < -48) audit.eventosMuyAnterioresAlCorreo++;
        }
      }
    } finally {
      lock.release();
    }
  } finally {
    if (client.usable) {
      await client.logout();
    } else {
      client.close();
    }
  }

  const ventana = Number(process.env.VENTANA_RAFAGA_MIN || 8);
  const umbral = Number(process.env.UMBRAL_RUIDO || 10);
  const ac = dedupAperturaCierre(clasificados);
  const movimiento = dedupMocion(clasificados, ventana, umbral);
  const adicionales = clasificados.filter((c) => c.categoria === "EVENTO_ADICIONAL");
  const clavesAC = new Set([
    ...ac.aperturasFinal.map((x) => `${x.tienda}__${fechaLocalKey(x.timestamp)}`),
    ...ac.cierresFinal.map((x) => `${x.tienda}__${fechaLocalKey(x.timestamp)}`),
  ]);
  audit.resultadoEsperado = {
    filasAperturaCierre: clavesAC.size,
    aperturasFinales: ac.aperturasFinal.length,
    cierresFinales: ac.cierresFinal.length,
    filasMovimiento: movimiento.eventosValidos.length,
    filasAnomalias: movimiento.anomalias.length,
    filasEventosAdicionales: adicionales.length,
  };
  audit.excel = await resumenExcel();
  audit.reconciliacion = {
    aperturaCierreCoincide: audit.excel.filas?.Apertura_Cierre === audit.resultadoEsperado.filasAperturaCierre,
    movimientoCoincide: audit.excel.filas?.Deteccion_Movimiento === audit.resultadoEsperado.filasMovimiento,
    anomaliasCoinciden: audit.excel.filas?.Anomalias_Mantenimiento === audit.resultadoEsperado.filasAnomalias,
    eventosAdicionalesCoinciden: audit.excel.filas?.Eventos_Adicionales === audit.resultadoEsperado.filasEventosAdicionales,
    sinDuplicadosAperturaCierre: (audit.excel.duplicados?.Apertura_Cierre || []).length === 0,
  };

  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const jsonPath = path.join(AUDIT_DIR, `auditoria-${stamp}.json`);
  const mdPath = path.join(AUDIT_DIR, `auditoria-${stamp}.md`);
  fs.writeFileSync(jsonPath, JSON.stringify(audit, null, 2));
  const md = [
    "# Auditoría CCTV Automation",
    "",
    `- Generada: ${audit.generadoEn}`,
    `- Correos auditados: ${audit.total}`,
    `- Rango UID: ${audit.uidMin}–${audit.uidMax}`,
    `- Rango de recepción: ${audit.fechaCorreoMin}–${audit.fechaCorreoMax}`,
    `- Categorías: ${JSON.stringify(audit.categorias)}`,
    `- Descartes: ${JSON.stringify(audit.descartesPorMotivo)}`,
    `- Timestamps inválidos: ${JSON.stringify(audit.timestampInvalidoPorCategoria)}`,
    `- Eventos posteriores al correo (>1 h): ${audit.eventosPosterioresAlCorreo}`,
    `- Eventos con más de 48 h de retraso: ${audit.eventosMuyAnterioresAlCorreo}`,
    `- Resultado esperado: ${JSON.stringify(audit.resultadoEsperado)}`,
    `- Reconciliación Excel: ${JSON.stringify(audit.reconciliacion)}`,
    "",
    "El JSON homónimo contiene los tipos de evento, muestras por motivo y desfases para investigación.",
  ].join("\n");
  fs.writeFileSync(mdPath, md);
  console.log(JSON.stringify({ jsonPath, mdPath, resumen: audit }, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
