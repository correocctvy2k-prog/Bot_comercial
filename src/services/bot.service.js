// src/services/bot.service.js
// Flujo: Consentimiento -> Menú Reporte Puntos (según permisos) -> Ejecuta monitor (python) -> Cierra por inactividad
// ✅ NO se agregan botones nuevos. Se mantienen mismos IDs y títulos.

const { sendText, sendButtons, sendList } = require("./messaging.service");
const { getSession, setSession } = require("./session.service");
const { appendConsentLog, hasAcceptedConsent } = require("./consent.service");

// ⛔️ Antes: const { runMonitor } = require("./monitor.service");
// ✅ Ahora: el bot envía lo que devuelve Python (messages[])
const { runMonitorAndSend } = require("./monitor.service");

// ✅ IMPORTAR SERVICIO DE ACCESO (FULL)
const { getUserAccess, canAccessZone, checkUserRole, getPendingUsers, setUserRole } = require("./access.service");

// NUEVOS BOTONES ADMIN
const ADMIN_LIST_PENDING = "ADMIN_LIST_PENDING";

// =====================
// Config
// =====================
const IDLE_CLOSE_MS = Number(process.env.IDLE_CLOSE_MS || 5 * 60 * 1000); // 5 min por defecto

// Timers en memoria (por usuario)
const idleTimers = new Map();

function clearIdleTimer(waId) {
  const t = idleTimers.get(waId);
  if (t) clearTimeout(t);
  idleTimers.delete(waId);
}

function resetIdleTimer(waId) {
  clearIdleTimer(waId);

  const t = setTimeout(async () => {
    try {
      const s = getSession(waId);

      // ✅ Solo cerrar si ya aceptó y está en READY (evita cerrar en ASK_CONSENT/BLOCKED/NEW)
      if (s?.consent === "ACCEPTED" && s?.step === "READY") {
        setSession(waId, { step: "CLOSED" });
        await showReopenButtons(waId);
      }
    } catch (e) {
      console.error("❌ Error en auto-cierre:", e?.message || e);
    }
  }, IDLE_CLOSE_MS);

  idleTimers.set(waId, t);
}

// =====================
// Constantes (NO CAMBIAR IDs / BOTONES)
// =====================
const CONSENT_ACCEPT = "CONSENT_ACCEPT";
const CONSENT_DECLINE = "CONSENT_DECLINE";

const REOPEN_FLOW = "REOPEN_FLOW";
const CLOSE_FLOW = "CLOSE_FLOW";

// Opciones del menú Reporte Puntos
const RP_FULL = "RP_FULL";
const RP_PALMIRA = "RP_PALMIRA";
const RP_AMAIME_PLACER = "RP_AMAIME_PLACER";
const RP_ROZO = "RP_ROZO";
const RP_CANDELARIA = "RP_CANDELARIA";
const RP_PRADERA = "RP_PRADERA";
const RP_FLORIDA = "RP_FLORIDA";
const RP_OCCIDENTE = "RP_OCCIDENTE";

// =====================
// Utils parsing
// =====================
function parseIncoming(msg) {
  if (!msg || !msg.type) return { kind: "unknown" };

  if (msg.type === "text") {
    return { kind: "text", text: (msg.text?.body || "").trim() };
  }

  if (msg.type === "interactive") {
    const ir = msg.interactive || {};
    if (ir.type === "button_reply") {
      return { kind: "button", buttonId: ir.button_reply?.id, title: ir.button_reply?.title };
    }
    if (ir.type === "list_reply") {
      return { kind: "list", listId: ir.list_reply?.id, title: ir.list_reply?.title };
    }
  }

  return { kind: "unknown" };
}

function getProfileNameFromValue(value) {
  const name = value?.contacts?.[0]?.profile?.name;
  return (name || "").trim() || "Usuario";
}

function normWaId(x) {
  const s = String(x || "");
  if (s.startsWith("tg_")) return s; // ✅ Permitir Telegram ID sin filtrar
  return s.replace(/[^\d]/g, "");
}

function normText(x) {
  return String(x || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

async function safeAccess(waId) {
  try {
    const a = await getUserAccess(waId); // ✅ ASYNC AWAIT
    return { role: a?.role || "NONE", ...a };
  } catch (e) {
    console.error("❌ Error getUserAccess:", e?.message || e);
    return { role: "NONE" };
  }
}

// =====================
// UI helpers
// =====================
async function askForConsent(waId, name) {
  const body =
    `👋 Hola, *${name}*.\n\n` +
    `Antes de continuar, necesito tu autorización para el tratamiento de datos según nuestros *Términos y Condiciones* y *Política de Privacidad*.\n\n` +
    `¿Aceptas?`;

  await sendButtons(waId, body, [
    { id: CONSENT_ACCEPT, title: "✅ Acepto" },
    { id: CONSENT_DECLINE, title: "❌ No acepto" },
  ]);
}

async function showReportePuntosMenu(waId, name) {
  const access = await safeAccess(waId); // ✅ AWAIT


  if (access.role === "NONE") {
    await sendText(
      waId,
      "🚫 No tienes permisos para usar este módulo.\nSi crees que es un error, contacta al administrador."
    );
    return;
  }

  const rows = [];

  // Reporte completo SOLO superadmin
  if (access.role === "SUPERADMIN") {
    rows.push({ id: RP_FULL, title: "📊 Reporte completo", description: "Todos los puntos y zonas" });
  }

  // Zonas según permisos
  if (access.role === "SUPERADMIN" || canAccessZone(access, "PALMIRA")) {
    rows.push({ id: RP_PALMIRA, title: "📍 Palmira", description: "Solo puntos Palmira" });
  }
  if (access.role === "SUPERADMIN" || canAccessZone(access, "AMAIME Y EL PLACER")) {
    rows.push({ id: RP_AMAIME_PLACER, title: "📍 Amaime y Placer", description: "Zona Amaime + El Placer" });
  }
  if (access.role === "SUPERADMIN" || canAccessZone(access, "ROZO")) {
    rows.push({ id: RP_ROZO, title: "📍 Rozo", description: "Solo puntos Rozo" });
  }
  if (access.role === "SUPERADMIN" || canAccessZone(access, "CANDELARIA")) {
    rows.push({ id: RP_CANDELARIA, title: "📍 Candelaria", description: "Solo puntos Candelaria" });
  }
  if (access.role === "SUPERADMIN" || canAccessZone(access, "PRADERA")) {
    rows.push({ id: RP_PRADERA, title: "📍 Pradera", description: "Solo puntos Pradera" });
  }
  if (access.role === "SUPERADMIN" || canAccessZone(access, "FLORIDA")) {
    rows.push({ id: RP_FLORIDA, title: "📍 Florida", description: "Solo puntos Florida" });
  }
  if (access.role === "SUPERADMIN" || canAccessZone(access, "OCCIDENTE")) {
    rows.push({ id: RP_OCCIDENTE, title: "📍 Occidente", description: "Zona Occidente" });
  }

  if (rows.length === 0) {
    await sendText(waId, "🚫 No tienes zonas asignadas. Contacta al administrador.");
    return;
  }

  await sendList(
    waId,
    `📍 *Reporte Puntos*\n\nHola *${name}*, selecciona el reporte que necesitas:`,
    "📍 Ver reportes",
    [{ title: "Reportes disponibles", rows }]
  );
}

async function showReopenButtons(waId) {
  await sendButtons(waId, "✅ Conversación cerrada por inactividad. ¿Deseas abrir nuevamente el flujo?", [
    { id: REOPEN_FLOW, title: "✅ Sí, abrir" },
    { id: CLOSE_FLOW, title: "❌ No" },
  ]);
}

async function closeConversation(waId) {
  clearIdleTimer(waId);
  setSession(waId, { step: "CLOSED" });
  await showReopenButtons(waId);
}

// =====================
// Lógica reportes (python)
// =====================
function mapChoiceToZona(choiceId) {
  if (choiceId === RP_FULL) return null; // null = TODAS
  if (choiceId === RP_PALMIRA) return "PALMIRA";
  if (choiceId === RP_AMAIME_PLACER) return "AMAIME Y EL PLACER";
  if (choiceId === RP_ROZO) return "ROZO";
  if (choiceId === RP_CANDELARIA) return "CANDELARIA";
  if (choiceId === RP_PRADERA) return "PRADERA";
  if (choiceId === RP_FLORIDA) return "FLORIDA";
  if (choiceId === RP_OCCIDENTE) return "OCCIDENTE";
  return null;
}

async function handleReporteChoice(waId, name, choiceId) {
  const access = await safeAccess(waId); // ✅ AWAIT

  if (access.role === "NONE") {
    await sendText(waId, "🚫 No tienes permisos para ejecutar reportes.");
    return;
  }

  // RP_FULL solo superadmin
  if (choiceId === RP_FULL && access.role !== "SUPERADMIN") {
    await sendText(waId, "🚫 No tienes permisos para generar el *reporte completo*.");
    return;
  }

  const zona = mapChoiceToZona(choiceId);

  // Validar zona seleccionada (si no es FULL)
  if (choiceId !== RP_FULL) {
    if (!zona) {
      await sendText(waId, "Opción no reconocida. Escribe *menu* para ver los reportes.");
      return;
    }
    if (!canAccessZone(access, zona)) {
      await sendText(waId, "🚫 No tienes permisos para ver esa zona.");
      return;
    }
  }

  // ✅ Mensaje de progreso
  const label = choiceId === RP_FULL ? "COMPLETO (TODAS)" : zona;
  await sendText(waId, `⏳ Generando reporte *${label}*...`);

  /**
   * ✅ CLAVE:
   * - RP_FULL => tipo "standard" y zona null (TODAS)
   * - ZONA => tipo "standard" + zona (solo esa)
   *
   * El Python devuelve payload.messages[] y el BOT los envía en orden,
   * sin revolver zonas.
   */
  let result;
  try {
    result = await runMonitorAndSend({
      to: waId,
      tipo: "standard",
      zona: choiceId === RP_FULL ? null : zona,
    });
  } catch (e) {
    console.error("❌ Excepción ejecutando monitor:", e?.message || e);
    await sendText(waId, "⚠️ Ocurrió un error ejecutando el reporte. Intenta nuevamente con *menu*.");
    await closeConversation(waId);
    return;
  }

  if (!result?.ok) {
    console.error("❌ Error ejecutando monitor:", result);
    await sendText(
      waId,
      "⚠️ No pude enviar el reporte completo.\nIntenta nuevamente con *menu*."
    );
    await closeConversation(waId);
    return;
  }

  // ✅ Cierre amable (opcional, no interfiere con el reporte)
  await sendText(waId, "✅ Listo.");
  await closeConversation(waId);
}

// =====================
// Handler principal
// =====================
async function processIncomingWhatsApp(value, msg) {
  const waId = normWaId(msg?.from);
  if (!waId) return;

  const incoming = parseIncoming(msg);
  const profileName = getProfileNameFromValue(value);

  // 2. ✅ CHECK DE SEGURIDAD (RBAC)
  // Verificamos rol en cada interacción.
  const userRole = await checkUserRole(waId, profileName);
  console.log(`🔒 RBAC Check: ${waId} (${profileName}) -> Role: ${userRole}`);

  // ============================
  // 👮‍♂️ COMANDO DE ADMIN (ADMTI)
  // ============================
  if (incoming.kind === "text" && normText(incoming.text) === "admti") {
    if (userRole === 'SUPERADMIN' || userRole === 'ADMIN') {
      await showAdminMenu(waId);
      return;
    } else {
      // Fake 404 para despistar
      await sendText(waId, "Comando no reconocido. Escribe *menu* para ver opciones.");
      return;
    }
  }

  // 👮‍♂️ FLOW DE ADMIN (Callbacks)
  if (incoming.kind === "button" || incoming.kind === "list") {
    const btnId = incoming.buttonId || incoming.listId;

    // A. Listar Pendientes
    if (btnId === ADMIN_LIST_PENDING) {
      await handleListPending(waId);
      return;
    }

    // B. Acciones sobre Usuario
    if (btnId && btnId.startsWith("ADM_ROLE_")) {
      const parts = btnId.split("_");
      const targetRole = parts[2]; // ADMIN, VIEWER, SUPERADMIN, BLOCKED
      const targetId = parts.slice(3).join("_"); // tg_123

      await setUserRole(targetId, targetRole);
      await sendText(waId, `✅ Usuario ${targetId} actualizado a rol: *${targetRole}*.`);
      try {
        await sendText(targetId, `👮‍♂️ Tu nivel de acceso ha sido actualizado a: *${targetRole}*.\nEscribe *menu* para ver tus opciones.`);
      } catch (e) { /* ignore if user not reachable */ }
      return;
    }

    // C. Close Admin
    if (btnId === "ADM_CLOSE") {
      await sendText(waId, "👋 Panel cerrado.");
      return;
    }
  }

  // ============================
  // 🚫 BLOQUEO DE SEGURIDAD
  // ============================
  if (userRole === 'pending') {
    await sendText(waId, "🔒 Tu usuario está *pendiente de aprobación* por un administrador.\nTe notificaremos apenas tengas acceso.");
    return;
  }
  if (userRole === 'BLOCKED') return;

  // Leer sesión SIEMPRE después de normalizar waId
  let session = getSession(waId);

  // Guardar nombre en sesión si no está
  if (!session.name) {
    setSession(waId, { name: profileName });
    session = getSession(waId);
  }

  // ✅ Si ya aceptó antes (guardado en log), no volver a pedir
  if (session.consent !== "ACCEPTED") {
    const accepted = hasAcceptedConsent(waId);
    if (accepted) {
      const nextStep = session.step === "CLOSED" ? "CLOSED" : "READY";
      setSession(waId, { consent: "ACCEPTED", step: nextStep, name: profileName });
      session = getSession(waId); // ✅ importante: usar sesión actualizada en este mismo request
    }
  }

  // ============================
  // SESIÓN CERRADA
  // ============================
  if (session.step === "CLOSED") {
    if (incoming.kind === "button") {
      if (incoming.buttonId === REOPEN_FLOW) {
        setSession(waId, { step: "READY" });
        resetIdleTimer(waId);
        await showReportePuntosMenu(waId, session.name || profileName);
        return;
      }
      if (incoming.buttonId === CLOSE_FLOW) {
        clearIdleTimer(waId);
        await sendText(waId, "✅ Perfecto. Quedo atento cuando lo necesites. 🙌");
        return;
      }
    }

    await showReopenButtons(waId);
    return;
  }

  // ============================
  // SI YA ACEPTÓ => READY
  // ============================
  if (session.consent === "ACCEPTED" && session.step === "READY") {
    resetIdleTimer(waId);

    // ✅ Unificar Lists (WhatsApp) y Buttons (Telegram/Inline)
    const choiceId = (incoming.kind === "list" ? incoming.listId : null) ||
      (incoming.kind === "button" ? incoming.buttonId : null);

    if (choiceId) {
      await handleReporteChoice(waId, session.name || profileName, choiceId);
      return;
    }

    if (incoming.kind === "text") {
      const t = normText(incoming.text);
      if (t === "menu" || t === "menú" || t === "hola") {
        await showReportePuntosMenu(waId, session.name || profileName);
        return;
      }
      await sendText(waId, `✅ Hola ${session.name || profileName}. Escribe *menu* para ver los reportes.`);
      return;
    }

    await sendText(waId, "Escribe *menu* para ver los reportes.");
    return;
  }

  // ============================
  // BLOQUEADO
  // ============================
  if (session.step === "BLOCKED") {
    if (incoming.kind === "text" && normText(incoming.text) === "hola") {
      setSession(waId, { step: "ASK_CONSENT", consent: null, name: profileName });
      await askForConsent(waId, profileName);
      return;
    }
    await sendText(waId, "❌ No puedo continuar sin aceptación. Escribe *Hola* para volver a intentarlo.");
    return;
  }

  // ============================
  // NEW => pedir consentimiento
  // ============================
  if (session.step === "NEW") {
    if (session.consent === "ACCEPTED") {
      setSession(waId, { step: "READY" });
      resetIdleTimer(waId);
      await showReportePuntosMenu(waId, profileName);
      return;
    }

    setSession(waId, { step: "ASK_CONSENT", name: profileName });
    await askForConsent(waId, profileName);
    return;
  }

  // ============================
  // ASK_CONSENT
  // ============================
  if (session.step === "ASK_CONSENT") {
    if (incoming.kind !== "button") {
      await sendText(waId, "Por favor selecciona una opción con los botones: ✅ Acepto / ❌ No acepto.");
      return;
    }

    if (incoming.buttonId === CONSENT_ACCEPT) {
      setSession(waId, { consent: "ACCEPTED", step: "READY", name: profileName });

      try {
        appendConsentLog({
          ts: new Date().toISOString(),
          wa_id: waId,
          name: profileName,
          consent: "ACCEPTED",
          consent_version: process.env.CONSENT_VERSION || "v1",
          phone_number_id: value?.metadata?.phone_number_id,
          display_phone_number: value?.metadata?.display_phone_number,
        });
      } catch (e) {
        console.error("❌ Error appendConsentLog (ACCEPTED):", e?.message || e);
      }

      resetIdleTimer(waId);
      await showReportePuntosMenu(waId, profileName);
      return;
    }

    if (incoming.buttonId === CONSENT_DECLINE) {
      setSession(waId, { consent: "DECLINED", step: "BLOCKED", name: profileName });

      try {
        appendConsentLog({
          ts: new Date().toISOString(),
          wa_id: waId,
          name: profileName,
          consent: "DECLINED",
          consent_version: process.env.CONSENT_VERSION || "v1",
          phone_number_id: value?.metadata?.phone_number_id,
          display_phone_number: value?.metadata?.display_phone_number,
        });
      } catch (e) {
        console.error("❌ Error appendConsentLog (DECLINED):", e?.message || e);
      }

      await sendText(
        waId,
        "Entendido. ❌ Sin aceptación de términos y privacidad no puedo continuar.\n\nSi cambias de opinión, escribe *Hola*."
      );
      return;
    }

    await sendText(waId, "Selecciona una opción válida: ✅ Acepto / ❌ No acepto.");
    return;
  }

  // ============================
  // Fallback
  // ============================
  setSession(waId, { step: "ASK_CONSENT", name: profileName });
  await askForConsent(waId, profileName);
}

// ============================
// ADMIN HELPERS
// ============================
async function showAdminMenu(waId) {
  const buttons = [
    { type: "reply", reply: { id: ADMIN_LIST_PENDING, title: "📋 Ver Pendientes" } },
    { type: "reply", reply: { id: "ADM_CLOSE", title: "❌ Salir" } }
  ];
  await sendButtons(waId, "🛡️ *Panel de Administrador IT*\nSelecciona una acción:", buttons);
}

async function handleListPending(waId) {
  const pendings = await getPendingUsers();
  if (!pendings || pendings.length === 0) {
    await sendText(waId, "✅ No hay usuarios pendientes de aprobación.");
    return;
  }

  for (const u of pendings) {
    // Por cada usuario, mandamos una "tarjeta" con acciones
    const body = `👤 *Solicitud de Acceso*\n\n*Nombre:* ${u.name}\n*ID:* \`${u.wa_id}\`\n*Fecha:* ${new Date(u.created_at).toLocaleString()}`;

    const buttons = [
      { type: "reply", reply: { id: `ADM_ROLE_VIEWER_${u.wa_id}`, title: "✅ Aprobar (Viewer)" } },
      { type: "reply", reply: { id: `ADM_ROLE_ADMIN_${u.wa_id}`, title: "👮‍♂️ Hacer Admin" } },
      { type: "reply", reply: { id: `ADM_ROLE_BLOCKED_${u.wa_id}`, title: "🚫 Bloquear" } }
      // Nota: WhatsApp permite max 3 botones. Si queremos SuperAdmin, habría que hacer otro menú o asumir flujo.
    ];

    await sendButtons(waId, body, buttons);
  }
}

module.exports = { processIncomingWhatsApp };
