require("dotenv").config({ quiet: true });
const fs = require("fs");
const path = require("path");
const { classify, dedupAperturaCierre, dedupMocion } = require("./engine");
const { fetchNewEmails, commitState } = require("./imapClient");
const { escribirResultados } = require("./excelWriter");
const { persistClassifiedEmails } = require("./eventStore");
const { runtimePaths, ensureRuntimeDirectories } = require("./config/runtime-paths");

ensureRuntimeDirectories();

function dentroDeVentana(inicioStr, finStr) {
  const ahora = new Date();
  const [hi, mi] = inicioStr.split(":").map(Number);
  const [hf, mf] = finStr.split(":").map(Number);
  const inicio = new Date(ahora);
  inicio.setHours(hi, mi, 0, 0);
  const fin = new Date(ahora);
  fin.setHours(hf, mf, 0, 0);
  return ahora >= inicio && ahora <= fin;
}

function log(msg) {
  const linea = `[${new Date().toISOString()}] ${msg}`;
  console.log(linea);
  fs.appendFileSync(path.join(runtimePaths.logDir, "run.log"), linea + "\n");
}

function cargarStoreMap() {
  const p = path.join(__dirname, "config", "store-map.json");
  if (fs.existsSync(p)) {
    try {
      return JSON.parse(fs.readFileSync(p, "utf8"));
    } catch {
      return {};
    }
  }
  return {};
}

async function obtenerCorreosConReintento(config, intentos = 3) {
  let ultimoError;
  for (let intento = 1; intento <= intentos; intento++) {
    try {
      return await fetchNewEmails(config);
    } catch (err) {
      ultimoError = err;
      log(`Lectura IMAP falló (intento ${intento}/${intentos}): ${err.message}`);
    }
  }
  throw ultimoError;
}

async function main() {
  const ventanaInicio = process.env.VENTANA_INICIO || "05:30";
  const ventanaFin = process.env.VENTANA_FIN || "23:00";

  if (!dentroDeVentana(ventanaInicio, ventanaFin)) {
    log(`Fuera de ventana horaria (${ventanaInicio}-${ventanaFin}). No se ejecuta.`);
    return;
  }

  log("Iniciando ciclo de procesamiento...");

  const { emails, newLastUid } = await obtenerCorreosConReintento({
    host: process.env.IMAP_HOST,
    port: process.env.IMAP_PORT,
    user: process.env.IMAP_USER,
    password: process.env.IMAP_PASSWORD,
    folder: process.env.IMAP_FOLDER || "INBOX",
    processAllOnFirstRun: process.env.PROCESAR_TODO_PRIMERA_EJECUCION === "true",
  });

  log(`Correos nuevos obtenidos: ${emails.length}`);

  if (emails.length === 0) {
    log("Nada que procesar. Fin del ciclo.");
    return;
  }

  const storeMap = cargarStoreMap();
  const clasificados = emails.map((e) => classify(e, storeMap));

  const descartados = clasificados.filter((c) => c.categoria === "DESCARTADO");
  log(`Descartados: ${descartados.length}`);

  const ventanaRafagaMin = Number(process.env.VENTANA_RAFAGA_MIN || 8);
  const umbralRuido = Number(process.env.UMBRAL_RUIDO || 10);

  const { aperturasFinal, cierresFinal } = dedupAperturaCierre(clasificados);
  const { eventosValidos, anomalias } = dedupMocion(clasificados, ventanaRafagaMin, umbralRuido);
  const eventosAdicionales = clasificados.filter((c) => c.categoria === "EVENTO_ADICIONAL");
  const persistencia = persistClassifiedEmails(clasificados, {
    folder: process.env.IMAP_FOLDER || "INBOX",
  });
  log(
    `Persistencia canónica -> Nuevos: ${persistencia.inserted}, existentes: ${persistencia.existing}, ` +
      `vinculados: ${persistencia.linked}, sin identidad: ${persistencia.unlinked}, ` +
      `descartados auditables: ${persistencia.discarded}`
  );
  const rutaExcel = path.resolve(__dirname, process.env.EXCEL_OUTPUT_PATH || "./output/CCTV_Eventos.xlsx");
  const resumen = await escribirResultados(rutaExcel, {
    aperturasFinal,
    cierresFinal,
    eventosValidos,
    anomalias,
    eventosAdicionales,
  });

  log(
    `Escrito en Excel -> Apertura/Cierre: ${resumen.filasAperturaCierre}, ` +
      `Movimiento: ${resumen.filasMocion}, Eventos adicionales: ${resumen.filasEventosAdicionales}, ` +
      `Anomalías: ${resumen.filasAnomalias}`
  );

  commitState(newLastUid);
  log(`Estado actualizado. Último UID procesado: ${newLastUid}`);
  log("Ciclo completado.\n");
}

main().catch((err) => {
  log(`ERROR: ${err.message}`);
  console.error(err);
  process.exit(1);
});
