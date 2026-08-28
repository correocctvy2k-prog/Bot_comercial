const test = require("node:test");
const assert = require("node:assert/strict");
const { classify, dedupAperturaCierre } = require("../engine");

const map = { NVR_SEDE_001: "Sede 001" };
function correo(uid, lines) {
  return { uid, subject: "NVR SEDE", date: new Date(2026, 7, 10, 8, 0, 5), body: lines.join("\n") };
}
function base(tipo, alarma, fechaKey, fecha, canal = "Entrada-01") {
  return [
    `Evento de alarma: ${tipo}`,
    `Alarma: ${alarma}`,
    "Nombre: NVR_SEDE_001",
    `Nombre de canal de entrada de alarma: ${canal}`,
    `${fechaKey}: ${fecha}`,
  ];
}

test("acepta fecha Dahua D/M/A de inicio", () => {
  const c = classify(correo(1, base("Tripwire", "Apertura Sede 001", "Hora de inicio de alarma (D/M/A H:M:S)", "10/08/2026 07:01:02")), map);
  assert.equal(c.categoria, "APERTURA");
  assert.equal(c.timestamp.getHours(), 7);
});

test("acepta variante D/M/Y de finalización", () => {
  const c = classify(correo(2, base("Tripwire fin", "Cierre Sede 001", "Fecha de Finalizacion de Alarma(D/M/Y H:M:S)", "10/08/2026 21:15:03")), map);
  assert.equal(c.categoria, "CIERRE");
  assert.equal(c.timestamp.getHours(), 21);
});

test("acepta variante Hora de detención", () => {
  const c = classify(correo(3, base("Tripwire fin", "Cierre Sede 001", "Hora de detención de la alarma (Y/M/D H:M:S)", "10/08/2026 21:16:04")), map);
  assert.equal(c.categoria, "CIERRE");
  assert.ok(c.timestamp instanceof Date);
});

test("corrige Apertuta y Aperetura de forma controlada", () => {
  for (const [uid, typo] of [[4, "Apertuta Sede 001"], [5, "Aperetura Sede 001"]]) {
    const c = classify(correo(uid, base("Tripwire", typo, "Hora de inicio de alarma (D/M/A H:M:S)", "10/08/2026 07:01:02")), map);
    assert.equal(c.categoria, "APERTURA");
  }
});

test("conserva taxonomía adicional en lugar de descartar", () => {
  const casos = [
    ["Alarma Local", "ALARMA_LOCAL", "INICIO"],
    ["Alarma Local fin", "ALARMA_LOCAL", "FIN"],
    ["DIM (humanos)", "DETECCION_HUMANA", "INICIO"],
    ["Cable trampa fin", "CABLE_TRAMPA", "FIN"],
    ["Detec. Moción Fin", "MOVIMIENTO", "FIN"],
  ];
  casos.forEach(([tipoEvento, tipo, fase], i) => {
    const c = classify(correo(10 + i, base(tipoEvento, "Evento auxiliar", "Hora de inicio de alarma (D/M/A H:M:S)", "10/08/2026 08:01:02")), map);
    assert.equal(c.categoria, "EVENTO_ADICIONAL");
    assert.equal(c.tipo, tipo);
    assert.equal(c.fase, fase);
  });
});

test("deduplica apertura y cierre usando el día local", () => {
  const a = classify(correo(20, base("Tripwire", "Apertura Sede 001", "Hora de inicio de alarma (D/M/A H:M:S)", "10/08/2026 07:00:00")), map);
  const c = classify(correo(21, base("Tripwire fin", "Cierre Sede 001", "Fecha de Finalizacion de Alarma(D/M/Y H:M:S)", "10/08/2026 22:00:00")), map);
  const r = dedupAperturaCierre([a, c]);
  assert.equal(r.aperturasFinal.length, 1);
  assert.equal(r.cierresFinal.length, 1);
});

test("solo una prueba explícita se descarta", () => {
  const c = classify(correo(30, base("Prueba", "Prueba", "Hora de inicio de alarma (D/M/A H:M:S)", "10/08/2026 08:00:00")), map);
  assert.equal(c.categoria, "DESCARTADO");
  assert.equal(c.motivo, "Correo de prueba");
});

test("un Tripwire sin etiqueta se conserva como evento adicional", () => {
  const lines = base("Tripwire", "", "Hora de inicio de alarma (D/M/A H:M:S)", "10/08/2026 08:00:00");
  const c = classify(correo(31, lines), map);
  assert.equal(c.categoria, "EVENTO_ADICIONAL");
  assert.equal(c.tipo, "TRIPWIRE");
});

test("reconoce identidad, canal y fecha en correo de dispositivo de alarma", () => {
  const c = classify(correo(92354, [
    "Evento de alarma: Cable trampa",
    "Canal de entrada de Alarma: 1",
    "Fecha de Inicio de Alarma(D/M/Y H:M:S): 25/08/2026 07:05:05",
    "Nombre del dispositivo de alarma: Americas_Florida",
    "Nombre alarma:",
    "Dirección IP: 192.168.32.182",
  ]), { Americas_Florida: "LAS AMERICAS FLORIDA" });
  assert.equal(c.tipo, "CABLE_TRAMPA");
  assert.equal(c.tienda, "LAS AMERICAS FLORIDA");
  assert.equal(c.canal, "1");
  assert.equal(c.timestamp.getHours(), 7);
  assert.equal(c.timestamp.getMinutes(), 5);
  assert.equal(c.timestamp.getSeconds(), 5);
  assert.equal(c.email.sourceIp, "192.168.32.182");
});

test("preclasifica un asunto Correo prueba como descarte auditable", () => {
  const c = classify(correo(40, ["Evento de alarma: Alarma local", "Nombre: Nonamed"]), {});
  c.email.subject = "Correo prueba";
  const classified = classify(c.email, {});
  assert.equal(classified.categoria, "DESCARTADO");
  assert.equal(classified.motivo, "Correo de prueba");
});

test("acepta variaciones de mayúsculas en las etiquetas Dahua", () => {
  const c=classify(correo(41,["Evento de Alarma: Alarma Local fin","Hora de detención de la alarma (Y/M/D H:M:S): 27/08/2026 09:03:15","Nombre Dispositivo Alarma: BA02D29PAGB030B"]),{});
  assert.equal(c.tipo,"ALARMA_LOCAL");
  assert.equal(c.fase,"FIN");
});

test("interpreta alarma DSS y conserva dispositivo, canal y hora", () => {
  const subject = "Activación Alarma punto de venta.2026-08-25 08:29:03 UTC-05:00 External Alarm Device Name:Saman VG Channel Name:BP_Saman VG_2";
  const c = classify({ uid: 92369, subject, body: "Alerta", date: new Date("2026-08-25T13:29:04Z") }, {
    "Saman VG": "EL SAMAN GORGONA V.GORG",
  });
  assert.equal(c.tipo, "ALARMA_LOCAL");
  assert.equal(c.tienda, "EL SAMAN GORGONA V.GORG");
  assert.equal(c.canal, "BP_Saman VG_2");
  assert.equal(c.timestamp.toISOString(), "2026-08-25T13:29:03.000Z");
});
