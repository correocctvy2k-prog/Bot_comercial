/**
 * Motor de parsing + clasificación + deduplicación de notificaciones
 * NVR Dahua. Ver /docs/REGLAS.md para el detalle de cada regla.
 */

function parseBody(body) {
  const fields = {};
  (body || "").split("\n").forEach((line) => {
    const trimmed = line.trim();
    if (!trimmed) return;
    let idx = trimmed.indexOf(": ");
    let key, value;
    if (idx !== -1) {
      key = trimmed.slice(0, idx).trim();
      value = trimmed.slice(idx + 2).trim();
    } else if (trimmed.endsWith(":")) {
      key = trimmed.slice(0, -1).trim();
      value = "";
    } else {
      return;
    }
    if (key) fields[key] = value;
  });
  return fields;
}

function parseFechaLocal(str) {
  if (!str) return null;
  const [datePart, timePart] = str.split(" ");
  if (!datePart || !timePart) return null;
  const [d, m, y] = datePart.split("/").map(Number);
  const [h, mi, s] = timePart.split(":").map(Number);
  return new Date(y, m - 1, d, h, mi, s || 0);
}

function parseTimestampDahua(fields) {
  const entradas = Object.entries(fields);
  const esUtc = ([k]) => /\bUTC\b/i.test(k);
  const patronesLocales = [
    /hora de inicio de alarma/i,
    /fecha de inicio de alarma/i,
    /fecha de finalizaci[oó]n de alarma/i,
    /fecha de finalizacion de alarma/i,
    /hora de detenci[oó]n de la alarma/i,
  ];
  for (const patron of patronesLocales) {
    const encontrada = entradas.find((item) => !esUtc(item) && patron.test(item[0]));
    const fecha = parseFechaLocal(encontrada?.[1]);
    if (fecha) return fecha;
  }
  // Respaldo para equipos que solo incluyen el campo UTC. Se convierte a
  // Date real para que luego pueda mostrarse en hora local.
  const utc = entradas.find(([k]) => /hora de (inicio|fin).*UTC/i.test(k));
  if (utc) {
    const localLike = parseFechaLocal(utc[1]);
    if (localLike) return new Date(Date.UTC(localLike.getFullYear(), localLike.getMonth(), localLike.getDate(), localLike.getHours(), localLike.getMinutes(), localLike.getSeconds()));
  }
  return null;
}

function normalizarEtiquetaAlarma(valor) {
  return (valor || "")
    .replace(/^apertuta\b/i, "Apertura")
    .replace(/^aperetura\b/i, "Apertura")
    .trim();
}

function fechaLocalKey(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const dia = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${dia}`;
}

function findField(fields, ...keys) {
  const normalizeKey = value => String(value || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/\s+/g, " ").trim();
  const normalized = new Map(Object.entries(fields).map(([key,value]) => [normalizeKey(key),value]));
  for (const key of keys) {
    const value = normalized.get(normalizeKey(key));
    if (value !== undefined) return value;
  }
  return null;
}

function extractSourceIp(fields) {
  const raw = findField(fields, "Dirección IP del remitente", "Direccion IP del remitente", "Dirección IP", "Direccion IP") || "";
  const match = String(raw).match(/\b(?:\d{1,3}\.){3}\d{1,3}\b/);
  if (!match) return null;
  return match[0].split(".").every(part => Number(part) >= 0 && Number(part) <= 255) ? match[0] : null;
}

function parseDssSubject(subject) {
  const raw = String(subject || "");
  const match = raw.match(/Activaci[oó]n Alarma punto de venta\.(\d{4}-\d{2}-\d{2})\s+(\d{2}:\d{2}:\d{2})\s+UTC([+-]\d{2}:\d{2})\s+External Alarm\s+Device Name:(.+?)\s+Channel Name:(.+)$/i);
  if (!match) return null;
  const timestamp = new Date(`${match[1]}T${match[2]}${match[3]}`);
  return {
    device: match[4].trim(),
    channel: match[5].trim(),
    timestamp: isNaN(timestamp) ? null : timestamp,
  };
}

// Normalización de nombre de tienda: quita prefijo NVR_, cambia _/- por
// espacio. Para casos especiales, edita config/store-map.json (ver README).
function normalizeStoreName(raw, storeMap = {}) {
  if (!raw) return "Desconocido";
  if (storeMap[raw]) return storeMap[raw];
  return raw
    .replace(/^NVR_?/i, "")
    .replace(/[_-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

// El campo "Nombre" del correo a veces viene genérico e inútil (ej: "NVR"),
// mientras que "Alarma" trae el identificador real de la tienda embebido
// (ej: "Apertura_Rivera-Escobar", "Cierre Tienda Uribe"). Se prioriza
// extraer el nombre desde ahí cuando es posible, con "Nombre" como respaldo.
// EXCEPCIÓN: si lo que sigue a Apertura/Cierre en Alarma es un término
// genérico (ej. "Caja Fuerte", que es el TIPO de evento, no la tienda),
// se ignora y se usa "Nombre" en su lugar.
const TERMINOS_GENERICOS = ["caja fuerte", "cajafuerte", "tienda", "punto de venta", "puntoventa"];

function extraerCandidatoTienda(alarma, nombreRaw) {
  if (alarma) {
    const m = alarma.match(/^(apertura|cierre)[_\s]+(.+)$/i);
    if (m && m[2] && m[2].trim()) {
      const candidato = m[2].trim();
      if (!TERMINOS_GENERICOS.includes(candidato.toLowerCase())) return candidato;
    }
  }
  return nombreRaw;
}

function classify(email, storeMap = {}) {
  const dss = parseDssSubject(email.subject);
  if (dss) {
    const tienda = storeMap[dss.device] || normalizeStoreName(dss.device, {});
    return {
      categoria: "EVENTO_ADICIONAL",
      tipo: "ALARMA_LOCAL",
      fase: "INICIO",
      tienda,
      canal: dss.channel,
      alarma: "External Alarm",
      tipoEvento: "External Alarm",
      timestamp: dss.timestamp,
      email,
    };
  }
  const fields = parseBody(email.body);
  email.sourceIp = extractSourceIp(fields);
  const tipoEvento = findField(fields, "Evento de alarma") || "";
  const alarmaRaw = (findField(fields, "Alarma") || "").trim();
  const alarma = normalizarEtiquetaAlarma(alarmaRaw);
  const nombreRaw = findField(fields, "Nombre", "Nombre del dispositivo de alarma", "Nombre Dispositivo Alarma") || "";
  const candidatoTienda = extraerCandidatoTienda(alarma, nombreRaw);
  // Revisa el mapa manual contra AMBAS fuentes posibles (candidato extraído
  // de Alarma, y el campo Nombre original) antes de normalizar
  // automáticamente — así un override en store-map.json aplica sin importar
  // de cuál campo se haya derivado el nombre.
  const nombre = storeMap[candidatoTienda] || storeMap[nombreRaw] || normalizeStoreName(candidatoTienda, {});
  const canal = findField(fields, "Nombre de canal de entrada de alarma", "Canal de entrada de Alarma", "Canal de entrada de alarma") || "";
  const timestamp = parseTimestampDahua(fields);

  if (/prueba/i.test(tipoEvento) || /\bcorreo\s+pruebas?\b/i.test([email.subject, nombreRaw, alarmaRaw].filter(Boolean).join(" "))) {
    return { categoria: "DESCARTADO", motivo: "Correo de prueba", email };
  }

  if (/tripwire/i.test(tipoEvento)) {
    const tripwireFinal = /fin/i.test(tipoEvento);

    if (!alarma) {
      return { categoria: "EVENTO_ADICIONAL", tipo: "TRIPWIRE", fase: tripwireFinal ? "FIN" : "INICIO", tienda: nombre, canal, alarma: alarmaRaw, tipoEvento, timestamp, email };
    }

    // El tipo técnico explícito tiene prioridad sobre el nombre configurado
    // de la alarma. Algunos equipos usan nombres como "Cierre Tienda ..."
    // también para el cruce de línea de entrada; si el correo reporta el
    // inicio del Tripwire, operacionalmente corresponde a la apertura.
    if (!tripwireFinal) {
      return { categoria: "APERTURA", fase: "INICIO", tienda: nombre, canal, timestamp, alarma: alarmaRaw, tipoEvento, email };
    }

    // IMPORTANTE (corregido tras validar con correo real de Llanogrande):
    // la variante "inicio" vs "fin" del Evento de alarma NO determina si es
    // Apertura o Cierre — eso lo dice ÚNICAMENTE el campo Alarma. Un Tripwire
    // "Fin" puede perfectamente ser una Apertura. Se toma el timestamp del
    // campo que esté disponible en ese correo específico, sin importar la
    // variante.
    if (/apertura/i.test(alarma)) {
      return { categoria: "APERTURA", tienda: nombre, canal, timestamp, alarma, email };
    }

    if (/cierre/i.test(alarma)) {
      return { categoria: "CIERRE", tienda: nombre, canal, timestamp, alarma, email };
    }

    return { categoria: "EVENTO_ADICIONAL", tipo: "TRIPWIRE", fase: "FIN", tienda: nombre, canal, alarma: alarmaRaw, tipoEvento, timestamp, email };
  }

  if (/detec\.?\s*moci[oó]n/i.test(tipoEvento)) {
    if (/fin/i.test(tipoEvento)) {
      return { categoria: "EVENTO_ADICIONAL", tipo: "MOVIMIENTO", fase: "FIN", tienda: nombre, canal, alarma: alarmaRaw, tipoEvento, timestamp, email };
    }
    return { categoria: "MOCION", tienda: nombre, canal, timestamp, email };
  }

  if (/alarma local/i.test(tipoEvento)) {
    return { categoria: "EVENTO_ADICIONAL", tipo: "ALARMA_LOCAL", fase: /fin/i.test(tipoEvento) ? "FIN" : "INICIO", tienda: nombre, canal, alarma: alarmaRaw, tipoEvento, timestamp, email };
  }

  if (/DIM\s*\(humanos\)/i.test(tipoEvento)) {
    return { categoria: "EVENTO_ADICIONAL", tipo: "DETECCION_HUMANA", fase: /fin/i.test(tipoEvento) ? "FIN" : "INICIO", tienda: nombre, canal, alarma: alarmaRaw, tipoEvento, timestamp, email };
  }

  if (/cable trampa/i.test(tipoEvento)) {
    return { categoria: "EVENTO_ADICIONAL", tipo: "CABLE_TRAMPA", fase: /fin/i.test(tipoEvento) ? "FIN" : "INICIO", tienda: nombre, canal, alarma: alarmaRaw, tipoEvento, timestamp, email };
  }

  return { categoria: "EVENTO_ADICIONAL", tipo: "DESCONOCIDO", fase: /fin/i.test(tipoEvento) ? "FIN" : "INICIO", tienda: nombre, canal, alarma: alarmaRaw, tipoEvento, timestamp, email };
}

function dedupAperturaCierre(clasificados) {
  const validos = (lista) => lista.filter((c) => c.timestamp instanceof Date && !isNaN(c.timestamp));
  const aperturas = validos(clasificados.filter((c) => c.categoria === "APERTURA"));
  const cierres = validos(clasificados.filter((c) => c.categoria === "CIERRE"));

  const porTiendaDia = (lista, elegirFn) => {
    const grupos = {};
    lista.forEach((ev) => {
      const dia = fechaLocalKey(ev.timestamp);
      const key = `${ev.tienda}__${dia}`;
      (grupos[key] = grupos[key] || []).push(ev);
    });
    return Object.values(grupos).map(elegirFn);
  };

  return {
    aperturasFinal: porTiendaDia(aperturas, (g) => g.reduce((a, b) => (b.timestamp < a.timestamp ? b : a))),
    cierresFinal: porTiendaDia(cierres, (g) => g.reduce((a, b) => (b.timestamp > a.timestamp ? b : a))),
  };
}

function dedupMocion(clasificados, ventanaRafagaMin, umbralRuido) {
  const mociones = clasificados
    .filter((c) => c.categoria === "MOCION" && c.timestamp instanceof Date && !isNaN(c.timestamp))
    .sort((a, b) => a.timestamp - b.timestamp);

  const porCanal = {};
  mociones.forEach((ev) => {
    const key = `${ev.tienda}__${ev.canal}`;
    (porCanal[key] = porCanal[key] || []).push(ev);
  });

  const eventosValidos = [];
  const anomalias = [];

  Object.values(porCanal).forEach((eventos) => {
    let rafaga = [eventos[0]];
    const cerrar = () => {
      if (rafaga.length > umbralRuido) {
        anomalias.push({
          tienda: rafaga[0].tienda,
          canal: rafaga[0].canal,
          desde: rafaga[0].timestamp,
          hasta: rafaga[rafaga.length - 1].timestamp,
          cantidad: rafaga.length,
          motivo: "Posible cámara sucia / falso positivo (ráfaga > umbral)",
        });
      } else {
        eventosValidos.push({
          tienda: rafaga[0].tienda,
          canal: rafaga[0].canal,
          timestamp: rafaga[0].timestamp,
          cantidadEnRafaga: rafaga.length,
        });
      }
    };
    for (let i = 1; i < eventos.length; i++) {
      const gapMin = (eventos[i].timestamp - eventos[i - 1].timestamp) / 60000;
      if (gapMin <= ventanaRafagaMin) rafaga.push(eventos[i]);
      else {
        cerrar();
        rafaga = [eventos[i]];
      }
    }
    cerrar();
  });

  return { eventosValidos, anomalias };
}

module.exports = {
  parseBody,
  parseFechaLocal,
  parseTimestampDahua,
  parseDssSubject,
  extractSourceIp,
  normalizarEtiquetaAlarma,
  classify,
  dedupAperturaCierre,
  dedupMocion,
  normalizeStoreName,
};
