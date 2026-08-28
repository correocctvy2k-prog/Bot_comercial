const ExcelJS = require("exceljs");
const fs = require("fs");

const HOJAS = {
  aperturaCierre: {
    nombre: "Apertura_Cierre",
    columnas: [
      { header: "Fecha", key: "fecha", width: 12 },
      { header: "Punto de Venta", key: "tienda", width: 22 },
      { header: "Hora Apertura", key: "horaApertura", width: 14 },
      { header: "Hora Cierre", key: "horaCierre", width: 14 },
      { header: "Canal Apertura", key: "canalApertura", width: 16 },
      { header: "Canal Cierre", key: "canalCierre", width: 16 },
      { header: "Estado", key: "estado", width: 22 },
      { header: "Procesado el", key: "procesadoEl", width: 20 },
    ],
  },
  mocion: {
    nombre: "Deteccion_Movimiento",
    columnas: [
      { header: "Fecha", key: "fecha", width: 12 },
      { header: "Hora", key: "hora", width: 12 },
      { header: "Punto de Venta", key: "tienda", width: 22 },
      { header: "Canal", key: "canal", width: 18 },
      { header: "Eventos en Ráfaga", key: "cantidad", width: 16 },
      { header: "Procesado el", key: "procesadoEl", width: 20 },
    ],
  },
  anomalias: {
    nombre: "Anomalias_Mantenimiento",
    columnas: [
      { header: "Fecha", key: "fecha", width: 12 },
      { header: "Punto de Venta", key: "tienda", width: 22 },
      { header: "Canal", key: "canal", width: 18 },
      { header: "Desde", key: "desde", width: 12 },
      { header: "Hasta", key: "hasta", width: 12 },
      { header: "Cantidad Correos", key: "cantidad", width: 16 },
      { header: "Posible Causa", key: "causa", width: 34 },
    ],
  },
  eventosAdicionales: {
    nombre: "Eventos_Adicionales",
    columnas: [
      { header: "UID", key: "uid", width: 12 },
      { header: "Fecha", key: "fecha", width: 12 },
      { header: "Hora", key: "hora", width: 12 },
      { header: "Tipo Normalizado", key: "tipo", width: 22 },
      { header: "Fase", key: "fase", width: 10 },
      { header: "Punto de Venta", key: "tienda", width: 24 },
      { header: "Canal", key: "canal", width: 22 },
      { header: "Evento Dahua", key: "tipoEvento", width: 22 },
      { header: "Alarma", key: "alarma", width: 32 },
      { header: "Timestamp válido", key: "timestampValido", width: 18 },
      { header: "Procesado el", key: "procesadoEl", width: 22 },
    ],
  },
};

async function abrirOCrearLibro(rutaExcel) {
  const workbook = new ExcelJS.Workbook();
  if (fs.existsSync(rutaExcel)) {
    await workbook.xlsx.readFile(rutaExcel);
  }
  const hojaCajaFuerte = workbook.getWorksheet("Caja_Fuerte");
  if (hojaCajaFuerte) workbook.removeWorksheet(hojaCajaFuerte.id);
  Object.values(HOJAS).forEach((def) => {
    let ws = workbook.getWorksheet(def.nombre);
    if (!ws) {
      ws = workbook.addWorksheet(def.nombre);
      ws.getRow(1).font = { bold: true };
    }
    // Excel no persiste las claves internas de ExcelJS. Se restauran al
    // abrir el libro para poder actualizar filas en ejecuciones posteriores.
    ws.columns = def.columnas;
  });
  return workbook;
}

function horaStr(d) {
  return d instanceof Date && !isNaN(d) ? d.toTimeString().slice(0, 8) : "-";
}
function fechaStr(d) {
  if (!(d instanceof Date) || isNaN(d)) return "-";
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const dia = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${dia}`;
}

// Fusiona listas de apertura/cierre (de tienda o de caja fuerte) en filas
// por tienda+día, actualizando filas existentes en vez de duplicar.
function fusionarAperturaCierre(worksheet, aperturasFinal, cierresFinal, ahora, extraCols = {}) {
  const filasExistentes = {};
  worksheet.eachRow((row, num) => {
    if (num === 1) return;
    const key = `${row.getCell("tienda").value}__${row.getCell("fecha").value}`;
    filasExistentes[key] = row;
  });

  const combos = {};
  aperturasFinal.forEach((ev) => {
    const key = `${ev.tienda}__${fechaStr(ev.timestamp)}`;
    combos[key] = combos[key] || { tienda: ev.tienda, fecha: fechaStr(ev.timestamp) };
    combos[key].horaApertura = horaStr(ev.timestamp);
    if ("canalApertura" in extraCols) combos[key].canalApertura = ev.canal;
    if ("canal" in extraCols) combos[key].canal = ev.canal;
  });
  cierresFinal.forEach((ev) => {
    const key = `${ev.tienda}__${fechaStr(ev.timestamp)}`;
    combos[key] = combos[key] || { tienda: ev.tienda, fecha: fechaStr(ev.timestamp) };
    combos[key].horaCierre = horaStr(ev.timestamp);
    if ("canalCierre" in extraCols) combos[key].canalCierre = ev.canal;
    if ("canal" in extraCols) combos[key].canal = ev.canal;
  });

  Object.entries(combos).forEach(([key, datos]) => {
    const rowExistente = filasExistentes[key];
    const horaApertura = datos.horaApertura || rowExistente?.getCell("horaApertura").value;
    const horaCierre = datos.horaCierre || rowExistente?.getCell("horaCierre").value;
    const estado =
      horaApertura && horaCierre
        ? "Completo"
        : horaApertura
        ? "Sin cierre detectado"
        : "Sin apertura detectada";
    const fila = { ...datos, estado, procesadoEl: ahora };
    if (filasExistentes[key]) {
      const row = filasExistentes[key];
      Object.entries(fila).forEach(([k, v]) => {
        if (v !== undefined && worksheet.getColumn(k)) row.getCell(k).value = v;
      });
    } else {
      worksheet.addRow(fila);
    }
  });

  return Object.keys(combos).length;
}

async function escribirResultados(
  rutaExcel,
  { aperturasFinal, cierresFinal, eventosValidos, anomalias, eventosAdicionales = [] }
) {
  const workbook = await abrirOCrearLibro(rutaExcel);
  const ahora = new Date().toISOString();

  const wsAC = workbook.getWorksheet(HOJAS.aperturaCierre.nombre);
  const totalAC = fusionarAperturaCierre(wsAC, aperturasFinal, cierresFinal, ahora, {
    canalApertura: 1,
    canalCierre: 1,
  });

  // --- Movimiento: siempre agrega fila nueva (cada ráfaga es un evento único) ---
  const wsMocion = workbook.getWorksheet(HOJAS.mocion.nombre);
  eventosValidos.forEach((ev) => {
    wsMocion.addRow({
      fecha: fechaStr(ev.timestamp),
      hora: horaStr(ev.timestamp),
      tienda: ev.tienda,
      canal: ev.canal,
      cantidad: ev.cantidadEnRafaga,
      procesadoEl: ahora,
    });
  });

  // --- Anomalías ---
  const wsAnom = workbook.getWorksheet(HOJAS.anomalias.nombre);
  anomalias.forEach((a) => {
    wsAnom.addRow({
      fecha: fechaStr(a.desde),
      tienda: a.tienda,
      canal: a.canal,
      desde: horaStr(a.desde),
      hasta: horaStr(a.hasta),
      cantidad: a.cantidad,
      causa: a.motivo,
    });
  });

  // Eventos aún no usados por las métricas principales. Se conservan por
  // UID para investigación, nuevas automatizaciones y trazabilidad.
  const wsExtra = workbook.getWorksheet(HOJAS.eventosAdicionales.nombre);
  const uidsExistentes = new Set();
  wsExtra.eachRow((row, num) => {
    if (num > 1 && row.getCell("uid").value != null) uidsExistentes.add(Number(row.getCell("uid").value));
  });
  let totalExtra = 0;
  eventosAdicionales.forEach((ev) => {
    const uid = Number(ev.email?.uid);
    if (uidsExistentes.has(uid)) return;
    wsExtra.addRow({
      uid,
      fecha: fechaStr(ev.timestamp),
      hora: horaStr(ev.timestamp),
      tipo: ev.tipo,
      fase: ev.fase,
      tienda: ev.tienda,
      canal: ev.canal,
      tipoEvento: ev.tipoEvento,
      alarma: ev.alarma,
      timestampValido: ev.timestamp instanceof Date && !isNaN(ev.timestamp) ? "Sí" : "No",
      procesadoEl: ahora,
    });
    uidsExistentes.add(uid);
    totalExtra++;
  });

  await workbook.xlsx.writeFile(rutaExcel);

  return {
    filasAperturaCierre: totalAC,
    filasMocion: eventosValidos.length,
    filasEventosAdicionales: totalExtra,
    filasAnomalias: anomalias.length,
  };
}

module.exports = { escribirResultados };
