// src/services/bot.service.js
// Flujo: Consentimiento -> Menú Reporte Puntos (según permisos) -> Ejecuta monitor (python) -> Cierra por inactividad
// ✅ NO se agregan botones nuevos. Se mantienen mismos IDs y títulos.

// 🚑 FIX CIRCULAR DEPENDENCY: Lazy load messaging services
// const { sendText, sendButtons, sendList, sendReaction } = require("./messaging.service");
const Messaging = {
  get sendText() { return require("./messaging.service").sendText; },
  get sendButtons() { return require("./messaging.service").sendButtons; },
  get sendList() { return require("./messaging.service").sendList; },
  get sendReaction() { return require("./messaging.service").sendReaction; },
};

const { setSession, getSession } = require("./session.service");
const { appendConsentLog, hasAcceptedConsent } = require("./consent.service");
const { logInteraction, ensureContact } = require("./logger.service"); // ✅ CRM Logger & Identity
const { normText } = require("../utils/text.utils"); // ✅ CRM Logger & Identity

// ⛔️ Antes: const { runMonitor } = require("./monitor.service");
// ✅ Ahora: el bot envía lo que devuelve Python (messages[])
const { runMonitorAndSend } = require("./monitor.service");
const ai = require("./ai.service");

// ✅ IMPORTAR SERVICIO DE ACCESO (FULL)
const { getUserAccess, canAccessZone, checkUserRole, getPendingUsers, getAllUsers, setUserRole, getSystemStats } = require("./access.service");

// NUEVOS BOTONES ADMIN
const ADMIN_LIST_PENDING = "ADMIN_LIST_PENDING";
const ADMIN_LIST_ALL = "ADMIN_LIST_ALL";

const ADMIN_BROADCAST = "ADMIN_BROADCAST";
const ADMIN_STATS = "ADMIN_STATS";

const UPTIME_START = Date.now();

// =====================
// Config
// =====================
let { IDLE_CLOSE_MS } = require("../config/env");

// 🛡️ SAFETY NET: Si por error viene un valor absurdo (ej. 0 o 120s), forzar mínimo 5 minutos (300s)
if (!IDLE_CLOSE_MS || IDLE_CLOSE_MS < 60000) {
  console.warn(`⚠️ [CONFIG WARNING] IDLE_CLOSE_MS detectado es muy bajo (${IDLE_CLOSE_MS}ms). Forzando a 20 minutos.`);
  IDLE_CLOSE_MS = 20 * 60 * 1000;
}
console.log(`⏱️ [CONFIG] IDLE_CLOSE_MS final: ${IDLE_CLOSE_MS / 60000} minutos`);

// Timers en memoria (por usuario)
const idleTimers = new Map();

function clearIdleTimer(waId) {
  const t = idleTimers.get(waId);
  if (t) clearTimeout(t);
  idleTimers.delete(waId);
}

async function resetIdleTimer(waId, channelId) {
  clearIdleTimer(waId);

  const t = setTimeout(async () => {
    try {
      // 🔒 VERIFICACIÓN DE DOBLE CANDADO
      // 1. Verificar si el timer sigue siendo válido en memoria (evita race conditions)
      if (!idleTimers.has(waId)) return;

      const s = await getSession(waId);

      // 2. Solo cerrar si sigue en READY y NO ha sido cerrada por otro hilo
      if (s?.consent === "ACCEPTED" && s?.step === "READY") {
        console.log(`💤 [IDLE] Cerrando sesión silenciosamente de ${waId} tras ${IDLE_CLOSE_MS / 60000} mins`);
        await setSession(waId, { step: "CLOSED" });
        // v12.0.1: CIERRE SILENCIOSO. NO enviamos mensaje proactivo.
        // await showReopenButtons(waId, channelId); 
      }

      // Limpiar referencia final
      idleTimers.delete(waId);
    } catch (e) {
      console.error("❌ Error en auto-cierre silencioso:", e?.message || e);
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
async function askForConsent(waId, name, channelId) {
  const body =
    `👋 Hola, *${name}*.\n\n` +
    `Antes de continuar, necesito tu autorización para el tratamiento de datos según nuestros *Términos y Condiciones* y *Política de Privacidad*.\n\n` +
    `¿Aceptas?`;

  await Messaging.sendButtons(waId, body, [
    { id: CONSENT_ACCEPT, title: "✅ Acepto" },
    { id: CONSENT_DECLINE, title: "❌ No acepto" },
  ], { channelId });
}

async function showReportePuntosMenu(waId, name, channelId) {
  const access = await safeAccess(waId); // ✅ AWAIT


  if (access.role === "NONE") {
    await Messaging.sendText(
      waId,
      "🚫 No tienes permisos para usar este módulo.\nSi crees que es un error, contacta al administrador.",
      { channelId }
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
    await Messaging.sendText(waId, "🚫 No tienes zonas asignadas. Contacta al administrador.", { channelId });
    return;
  }

  await Messaging.sendList(
    waId,
    `📍 *Reporte Puntos*\n\nHola *${name}*, selecciona el reporte que necesitas:`,
    "📍 Ver reportes",
    [{ title: "Reportes disponibles", rows }],
    { channelId }
  );
}

async function showReopenButtons(waId, channelId) {
  await Messaging.sendButtons(waId, "✅ Conversación cerrada por inactividad. ¿Deseas abrir nuevamente el flujo?", [
    { id: REOPEN_FLOW, title: "✅ Sí, abrir" },
    { id: CLOSE_FLOW, title: "❌ No" },
  ], { channelId });
}

async function closeConversation(waId, channelId) {
  clearIdleTimer(waId);
  await setSession(waId, { step: "CLOSED" });
  await showReopenButtons(waId, channelId);
}

// =====================
// Lógica reportes (python)
// =====================
function mapChoiceToZona(choiceId) {
  if (choiceId === RP_FULL) return null; // null = TODAS

  const c = String(choiceId).toUpperCase();
  if (c === RP_PALMIRA || c === "PALMIRA") return "PALMIRA";
  if (c === RP_AMAIME_PLACER || c === "AMAIME" || c === "AMAIME Y EL PLACER") return "AMAIME Y EL PLACER";
  if (c === RP_ROZO || c === "ROZO") return "ROZO";
  // v12.0.6: Hardcoded subzones to Candelaria safety net.
  if (c === RP_CANDELARIA || c === "CANDELARIA" || c === "JUANCHITO" || c === "VILLAGORGONA" || c === "POBLADO" || c === "CABUYAL" || c === "EL CARMELO") return "CANDELARIA";
  if (c === RP_PRADERA || c === "PRADERA") return "PRADERA";
  if (c === RP_FLORIDA || c === "FLORIDA") return "FLORIDA";
  if (c === RP_OCCIDENTE || c === "OCCIDENTE" || c === "ZONA OCCIDENTE") return "OCCIDENTE";

  return null;
}

async function handleReporteChoice(waId, name, choiceId, channelId) {
  const access = await safeAccess(waId); // ✅ AWAIT

  if (access.role === "NONE") {
    await Messaging.sendText(waId, "🚫 No tienes permisos para ejecutar reportes.", { channelId });
    return;
  }

  // RP_FULL solo superadmin
  if (choiceId === RP_FULL && access.role !== "SUPERADMIN") {
    await Messaging.sendText(waId, "🚫 No tienes permisos para generar el *reporte completo*.", { channelId });
    return;
  }

  const zona = mapChoiceToZona(choiceId);

  // 🛡️ DEBUG DE PERMISOS (v9.8)
  console.log(`🛡️ [PERM_CHECK] User: ${waId} | Role: ${access.role} | Zona: ${zona} | Choice: ${choiceId}`);

  // 🚑 EMERGENCY BYPASS: Si es el sysadmin, garantizamos acceso
  if (waId === '573162892244') {
    console.log(`🚑 [BYPASS] Concediendo acceso SUPERADMIN forzado a ${waId}`);
    access.role = 'SUPERADMIN';
  }

  // Validar zona seleccionada (si no es FULL)
  if (choiceId !== RP_FULL) {
    if (!zona) {
      await Messaging.sendText(waId, "Opción no reconocida. Escribe *menu* para ver los reportes.", { channelId });
      return;
    }

    // Re-check manual por si el canAccessZone falla
    const hasAccess = access.role === 'SUPERADMIN' || access.role === 'ADMIN' || canAccessZone(access, zona);

    if (!hasAccess) {
      console.warn(`⛔ [DENIED] Acceso denegado a ${zona} para rol ${access.role}`);
      await Messaging.sendText(waId, `🚫 No tienes permisos para ver la zona: *${zona}*.\nContacta a un administrador.`, { channelId });
      return;
    }
  }

  // ✅ Mensaje de progreso
  const label = choiceId === RP_FULL ? "COMPLETO (TODAS)" : zona;
  await Messaging.sendText(waId, `⏳ Generando reporte *${label}*...`, { channelId });

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
      channelId // ✅ PASS CHANNEL ID
    });
  } catch (e) {
    console.error("❌ Excepción ejecutando monitor:", e?.message || e);
    await Messaging.sendText(waId, "⚠️ Ocurrió un error ejecutando el reporte. Intenta nuevamente con *menu*.", { channelId });
    await closeConversation(waId, channelId);
    return;
  }

  if (!result?.ok) {
    console.error("❌ Error ejecutando monitor:", result);
    await Messaging.sendText(
      waId,
      "⚠️ No pude enviar el reporte completo.\nIntenta nuevamente con *menu*.",
      { channelId }
    );
    await closeConversation(waId, channelId);
    return;
  }

  // ✅ Cierre amable con sugerencia
  await Messaging.sendButtons(waId, "✅ *Reporte finalizado.* ¿Deseas hacer algo más?", [
    { id: "REOPEN_FLOW", title: "📍 Otro reporte" },
    { id: "ADM_CLOSE", title: "👋 Salir" }
  ], { channelId });

  // No cerramos la sesión inmediatamente para permitir la interacción con los botones
  resetIdleTimer(waId, channelId);
}

// =====================
// Handler principal
// =====================
const processingLocks = new Set(); // 🔒 Evita race conditions por usuario

async function processIncomingWhatsApp(value, msg, channelId) {
  const waId = normWaId(msg?.from);
  if (!waId) return;

  // 🔒 BLOQUEO DE CONCURRENCIA (v11.29)
  // Si ya estamos procesando un mensaje de este usuario, ignoramos el nuevo.
  // Esto evita "Doble Respuesta" si el usuario escribe rápido o hay lag.
  if (processingLocks.has(waId)) {
    console.warn(`🔒 [RATE-LIMIT] Ignorando mensaje concurrente de ${waId} (Ya procesando...)`);
    return;
  }

  processingLocks.add(waId);

  try {
    const incoming = parseIncoming(msg);
    // ... Resto del código original ...
    // (Se debe indentar todo el bloque original dentro del try)

    const profileName = getProfileNameFromValue(value);

    // ⚡ FAST FEEDBACK: Reacción inmediata (Fire & Forget)
    // No esperamos (await) para no bloquear la DB/Logic
    if (msg?.id && incoming.kind === 'text') {
      Messaging.sendReaction(waId, "⏳", msg.id, { channelId })
        .then(() => console.log(`⚡ [FAST-REACT] Reacción enviada para ${msg.id}`))
        .catch(e => { /* mute error */ });
    }

    // 📡 CRM: Identity & Log
    ensureContact(waId, profileName).then((cid) => {
      if (cid) console.log(`✅ CRM Contact ID: ${cid}`);
    });

    // 📡 CRM: Log Incoming
    logInteraction({
      wa_id: waId,
      channel_id: channelId, // ✅ Log correct channel
      direction: 'INCOMING',
      type: incoming.kind || 'unknown',
      content: incoming.text || incoming.buttonId || incoming.listId || 'media',
      raw: msg
    });

    // Leer sesión SIEMPRE al inicio
    // Leer sesión SIEMPRE al inicio
    console.log(`🔍 [DEBUG v12.0.1] Buscando sesión para ${waId}...`);
    let session;
    try {
      session = await getSession(waId);
      console.log(`🔍 [TRACE] Sesión recuperada: Step=${session.step}, Consent=${session.consent}, Name=${session.name}`);
    } catch (e) {
      console.error("❌ Error en getSession:", e.message);
      throw e;
    }

    // ... Resto del flujo ...


    // Guardar nombre en sesión si no está
    if (!session.name && profileName && profileName !== 'Usuario') {
      console.log(`📝 [DEBUG] Guardando nombre del perfil en sesión: ${profileName}`);
      session = await setSession(waId, { name: profileName });
    }

    // 2. ✅ CHECK DE SEGURIDAD (RBAC)
    console.log(`🔒 [DEBUG] Verificando rol de ${waId}...`);
    const userRole = await checkUserRole(waId, profileName);
    console.log(`🔒 RBAC Check: ${waId} (${profileName}) -> Role: ${userRole}`);

    // 2.1 BROADCAST SUB-FLOW (Intercept before regex commands)
    if (session.step && session.step.startsWith("BROADCAST_")) {
      const handled = await handleBroadcastFlow(waId, incoming, session, profileName, channelId);
      if (handled) return;
    }

    // ============================
    // 👮‍♂️ COMANDO DE ADMIN (ADMTI)
    // ============================
    if (incoming.kind === "text" && normText(incoming.text) === "admti") {
      if (userRole === 'SUPERADMIN' || userRole === 'ADMIN') {
        await showAdminMenu(waId, channelId);
        return;
      } else {
        await Messaging.sendText(waId, "Comando no reconocido. Escribe *menu* para ver opciones.", { channelId });
        return;
      }
    }

    // 👮‍♂️ FLOW DE ADMIN (Callbacks)
    if (incoming.kind === "button" || incoming.kind === "list") {
      const btnId = incoming.buttonId || incoming.listId;

      if (btnId === ADMIN_LIST_PENDING) {
        await handleListPending(waId, channelId);
        return;
      }

      if (btnId === ADMIN_LIST_ALL) {
        await handleListAll(waId, channelId);
        return;
      }

      if (btnId === ADMIN_BROADCAST) {
        setSession(waId, { step: "BROADCAST_ASK_MESSAGE", name: profileName });
        await Messaging.sendText(waId, "📢 *Modo Difusión*\n\nEscribe el mensaje que deseas enviar a todos los usuarios:", { channelId });
        return;
      }

      if (btnId === ADMIN_STATS) {
        await handleStats(waId, channelId);
        return;
      }

      if (btnId && btnId.startsWith("ADM_ROLE_")) {
        const parts = btnId.split("_");
        const targetRole = parts[2];
        const targetId = parts.slice(3).join("_");

        await setUserRole(targetId, targetRole);
        await Messaging.sendText(waId, `✅ Usuario ${targetId} actualizado a rol: *${targetRole}*.`, { channelId });
        try {
          // Notify target user (using default channel or we'd need to know their channel, for now default/best effort)
          // Since we don't store user->channel mapping yet, we try sending to their ID directly.
          await Messaging.sendText(targetId, `👮‍♂️ Tu nivel de acceso ha sido actualizado a: *${targetRole}*.\nEscribe *menu* para ver tus opciones.`, { channelId });
        } catch (e) { /* ignore */ }
        return;
      }

      // ADM_CLOSE handled here AND in READY block below
      if (btnId === "ADM_CLOSE") {
        await Messaging.sendText(waId, "👋 Panel cerrado.", { channelId });
        return;
      }
    }

    // ============================
    // 🚫 BLOQUEO DE SEGURIDAD
    // ============================
    if (userRole === 'pending') {
      await Messaging.sendText(waId, "🔒 Tu usuario está *pendiente de aprobación* por un administrador.\nTe notificaremos apenas tengas acceso.", { channelId });
      return;
    }
    if (userRole === 'BLOCKED') return;

    if (session.consent !== "ACCEPTED") {
      const accepted = hasAcceptedConsent(waId);
      if (accepted) {
        const nextStep = session.step === "CLOSED" ? "CLOSED" : "READY";
        session = await setSession(waId, { consent: "ACCEPTED", step: nextStep, name: profileName });
      }
    }

    // ============================
    // 🙋 PASO ASK_NAME (nuevo usuario sin nombre identificado)
    // Se activa si: no hay nombre en sesión Y el profileName es genérico
    // ============================
    const hasName = session.name && session.name !== 'Usuario';
    const isNewUser = !session.step || session.step === 'ASK_NAME';

    if (!hasName && isNewUser && session.consent !== 'ACCEPTED') {
      if (session.step === 'ASK_NAME' && incoming.kind === 'text' && incoming.text.length >= 2) {
        // El usuario respondió con su nombre
        const capturedName = incoming.text.trim();
        session = await setSession(waId, { name: capturedName, step: null });
        // Actualizar el contacto en Supabase con el nombre real
        ensureContact(waId, capturedName);
        console.log(`✅ [ASK_NAME] Nombre capturado: ${capturedName} para ${waId}`);
        // Continuar con el flujo normal (el nombre ya quedó en session)
      } else if (session.step !== 'ASK_NAME') {
        // Primera vez → pedir nombre
        await setSession(waId, { step: 'ASK_NAME' });
        await Messaging.sendText(
          waId,
          `👋 ¡Hola! Soy el *Asistente virtual del área Comercial*. Para brindarte una mejor atención, ¿cuál es tu nombre?`,
          { channelId }
        );
        return;
      } else {
        // Segundo intento sin nombre válido
        await Messaging.sendText(waId, '📝 Por favor, dime tu nombre para continuar (mínimo 2 caracteres).', { channelId });
        return;
      }
    }

    // ============================
    // 🧹 COMANDOS GLOBALES (Siempre disponibles)
    // ============================
    if (incoming.kind === "text") {
      const t = normText(incoming.text);
      if (t === "reset-bot" || t === "reiniciar") {
        const { resetSession } = require("./session.service");
        await resetSession(waId);
        await Messaging.sendText(waId, "🔄 Tu sesión y consentimiento han sido reseteados. Escribe *Hola* para empezar de nuevo.", { channelId });
        return;
      }
      // v11.21: SMART WAKE-UP
      // Si la sesión está cerrada y el usuario escribe ALGO (intencional), despertamos al bot.
      // Antes solo despertaba con "hola", causando sensación de "muerte" si decían "buenas".
      if (session.step === "CLOSED" && t.length > 0) {
        console.log(`⏰ [WAKE-UP] Reactivando sesión por interacción: "${t}"`);
        await setSession(waId, { step: "READY" });
        session.step = "READY";
        await resetIdleTimer(waId, channelId);
        // Dejamos pasar el mensaje para que sea procesado por el NLU abajo 👇
      }
    }

    // ============================
    // SESIÓN CERRADA (Check restrictivo después de comandos globales)
    // ============================
    if (session.step === "CLOSED") {
      if (incoming.kind === "button" && incoming.buttonId === REOPEN_FLOW) {
        await setSession(waId, { step: "READY" });
        await resetIdleTimer(waId, channelId);
        await showReportePuntosMenu(waId, session.name || profileName, channelId);
        return;
      }

      // v11.22: FIX BOTÓN "NO" (CLOSE_FLOW)
      // Si el usuario dice "No" al reabrir, debemos confirmar y NO reiniciar timers.
      if (incoming.kind === "button" && incoming.buttonId === CLOSE_FLOW) {
        await Messaging.sendText(waId, "👍 Entendido. Si necesitas algo más, solo escribe *Hola*.", { channelId });
        clearIdleTimer(waId); // Asegurar muerte del timer
        return;
      }

      // Si escribe otra cosa distinta a los botones...
      // (El Smart Wake-up de arriba ya lo habrá capturado si era texto)
      return;
    }

    // ============================
    // SI YA ACEPTO (O ESTÁ EN READY)
    // ============================
    if (session.consent === "ACCEPTED" || session.step === "READY") {
      console.log(`🔍 [TRACE] Entrando bloque READY/ACCEPTED. ChoiceId: ${incoming.kind}`);
      await resetIdleTimer(waId, channelId);

      const choiceId = (incoming.kind === "list" ? incoming.listId : null) ||
        (incoming.kind === "button" ? incoming.buttonId : null);

      if (choiceId) {
        console.log(`🔍 [TRACE] Procesando choiceId: ${choiceId}`);
        // Ignorar botones de consentimiento si ya estamos en READY/ACCEPTED
        if (choiceId === CONSENT_ACCEPT || choiceId === CONSENT_DECLINE) return;

        // 🛠️ FIX v11.25: Manejo de botones de navegación (REOPEN/CLOSE) también en READY
        if (choiceId === REOPEN_FLOW) {
          await showReportePuntosMenu(waId, session.name || profileName, channelId);
          return;
        }
        if (choiceId === "ADM_CLOSE") {
          await Messaging.sendText(waId, "👋 ¡Que tengas un excelente día!", { channelId });
          return;
        }

        await handleReporteChoice(waId, session.name || profileName, choiceId, channelId);
        return;
      }

      // ============================
      // ✨ CAPA DE INTELIGENCIA ARTIFICIAL (NLU)
      // ============================
      if (incoming.kind === "text") {
        console.log(`🔍 [DIAGNOSTIC] Texto recibido: "${incoming.text}" | Estado: ${session.step} | Consent: ${session.consent}`);
        const t = normText(incoming.text);

        // v12.1.1: Detección flexible de menú - funciona con frases como "muéstrame el menu", "el.menu", "ver opciones"
        const MENU_KEYWORDS = ["menu", "menú", "inicio", "reset-bot", "ver opciones", "mostrar", "zonas disponibles"];
        const isMenuTrigger = MENU_KEYWORDS.some(kw => t === kw || t.includes(kw));
        if (isMenuTrigger) {
          console.log(`📋 [DIAGNOSTIC] Trigger Menú Manual (v12.1.1): "${t}"`);
          await showReportePuntosMenu(waId, profileName, channelId);
          return;
        }


        console.log(`🤖 [DIAGNOSTIC] Invocando IA para: "${incoming.text}"`);

        try {
          const aiResult = await ai.processIntent(incoming.text);
          console.log(`🤖 [DIAGNOSTIC] Resultado IA:`, JSON.stringify(aiResult));

          if (aiResult.intent === "GENERATE_REPORT" && aiResult.zona) {
            console.log(`📊 [DIAGNOSTIC] Ejecutando reporte para zona: ${aiResult.zona}`);
            await handleReporteChoice(waId, profileName, aiResult.zona, channelId);
            return;
          }

          // v12.0.4: Soportar la llave 'reply' generada por Gemini o el 'message' de fallbacks.
          if (String(aiResult.intent).toUpperCase() === "CHAT" && (aiResult.reply || aiResult.message)) {
            let greeting = aiResult.reply || aiResult.message;
            if (userRole === 'SUPERADMIN' || userRole === 'ADMIN') {
              greeting = `👨‍💼 ${greeting} (Acceso Admin Activado)`;
            }
            await Messaging.sendText(waId, greeting, { channelId });
            return;
          }

          // v11.13: MATCHING DE INTENTS DE IA.SERVICE
          // El prompt genera: greeting, help, sales_report.
          if (aiResult.intent === "greeting") {
            const reply = aiResult.reply || "¡Hola! Soy tu Aliado Digital. ¿En qué puedo ayudarte?";
            await Messaging.sendText(waId, reply, { channelId });
            return;
          }

          if (aiResult.intent === "help") {
            await showReportePuntosMenu(waId, profileName, channelId);
            return;
          }

          // v12.1.2: Handler para reporte de TODAS las zonas → usa RP_FULL (reporte consolidado Python)
          if (aiResult.intent === "all_zones") {
            if (aiResult.reply) {
              await Messaging.sendText(waId, aiResult.reply, { channelId });
            }
            // RP_FULL = null zona → Python genera reporte completo de TODOS los puntos en un solo mensaje
            await handleReporteChoice(waId, profileName, RP_FULL, channelId);
            return;
          }

          // v12.1.0: Handler para listar zonas disponibles
          if (aiResult.intent === "list_zones") {
            await showReportePuntosMenu(waId, profileName, channelId);
            return;
          }

          if (aiResult.intent === "sales_report" && aiResult.entities && aiResult.entities.zone) {
            let zonas = aiResult.entities.zone;
            if (!Array.isArray(zonas)) zonas = [zonas];

            console.log(`📊 [AI-v12.1.0] Redirigiendo 'sales_report' a reporte de zona(s): ${zonas.join(", ")}`);

            // v12.0.5: Enviar la respuesta natural de la IA antes del reporte frío
            if (aiResult.reply) {
              await Messaging.sendText(waId, aiResult.reply, { channelId });
            }

            for (const zona of zonas) {
              await handleReporteChoice(waId, profileName, zona, channelId);
              // Pausa de 1.5s entre reportes para evitar rate-limits o cruce de mensajes visuales en WhatsApp
              if (zonas.length > 1) await new Promise(r => setTimeout(r, 1500));
            }
            return;
          }

          // v12.0.5: Catch-all fluido. Si la IA generó una respuesta conversacional y no encajó en las reglas rígidas de arriba (ej. pidió reporte pero sin dar zona).
          if (aiResult.reply) {
            console.log(`💬 [AI-v12.0.5] Respuesta natural atrapada por catch-all: ${aiResult.intent}`);
            await Messaging.sendText(waId, aiResult.reply, { channelId });
            return;
          }
        } catch (e) {
          console.error(`❌ [DIAGNOSTIC] Error en flujo de IA:`, e.message);
          // Timeout handling specific message
          if (e.message.includes("Timeout")) {
            await Messaging.sendText(waId, "🐢 La red está un poco lenta. Por favor intenta escribiendo la zona nuevamente (ej: 'Palmira').", { channelId });
            return;
          }
        }

        // Mensaje de ayuda basado en el ADN comercial
        const helpMsg = `🤖 Hola ${profileName}. Soy tu Aliado Digital, pero no logré identificar esa zona.\n\nPrueba con: *"Reporte de Palmira"*, *"¿Cómo está Juanchito?"* o escribe *"Menú"*.\n\nSi crees que es un error, contacta al *Área de TI* o al *Director Comercial*.`;
        await Messaging.sendText(waId, helpMsg, { channelId });
        return;
      }

      await Messaging.sendText(waId, "Escribe *menu* para ver los reportes.", { channelId });
      return;
    }
    // ============================
    // BLOQUEADO
    // ============================
    if (session.step === "BLOCKED") {
      if (incoming.kind === "text" && normText(incoming.text) === "hola") {
        await setSession(waId, { step: "ASK_CONSENT", consent: null, name: profileName });
        await askForConsent(waId, profileName, channelId);
        return;
      }
      await Messaging.sendText(waId, "❌ No puedo continuar sin aceptación. Escribe *Hola* para volver a intentarlo.", { channelId });
      return;
    }

    // ============================
    // 1. ASK_CONSENT (Prioridad: Responder a la pregunta)
    // ============================
    if (session.step === "ASK_CONSENT") {
      if (incoming.kind !== "button") {
        await Messaging.sendText(waId, "Por favor selecciona una opción con los botones: ✅ Acepto / ❌ No acepto.", { channelId });
        return;
      }

      if (incoming.buttonId === CONSENT_ACCEPT) {
        await setSession(waId, { consent: "ACCEPTED", step: "READY", name: profileName });

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

        await resetIdleTimer(waId, channelId);
        await showReportePuntosMenu(waId, profileName, channelId);
        return;
      }

      if (incoming.buttonId === CONSENT_DECLINE) {
        await setSession(waId, { consent: "DECLINED", step: "BLOCKED", name: profileName });
        await Messaging.sendText(
          waId,
          "Entendido. ❌ Sin aceptación de términos y privacidad no puedo continuar.\n\nSi cambias de opinión, escribe *Hola*.",
          { channelId }
        );
        return;
      }

      await Messaging.sendText(waId, "Selecciona una opción válida: ✅ Acepto / ❌ No acepto.", { channelId });
      return;
    }

    // ============================
    // 2. NEW => pedir consentimiento
    // ============================
    if (session.step === "NEW" || session.consent !== "ACCEPTED") {
      if (session.consent === "ACCEPTED") {
        await setSession(waId, { step: "READY" });
        await resetIdleTimer(waId, channelId);
        await showReportePuntosMenu(waId, profileName, channelId);
        return;
      }

      await setSession(waId, { step: "ASK_CONSENT", name: profileName });
      await askForConsent(waId, profileName, channelId);
      return;
    }

  } catch (err) {
    console.error("❌ Error crítico procesando mensaje WA:", err);
  } finally {
    // 🔓 DESBLOQUEO DE CONCURRENCIA (v12.0.10 - Fix)
    // Garantiza que el seguro anti-spam se libere incondicionalmente,
    // previniendo que el usuario quede bloqueado si hay errores asíncronos.
    processingLocks.delete(waId);
  }
} // <- Cierre correcto de processIncomingWhatsApp


// ============================
// BROADCAST FLOW
// ============================
async function handleBroadcastFlow(waId, incoming, session, profileName, channelId) {
  if (incoming.kind === "button" && incoming.buttonId === "ACCEPT_CONSENT") {
    await setSession(waId, { consent: CONSENT_VERSION, step: "READY", name: profileName });
    await showWelcome(waId, profileName, channelId);
    return false;
  }
  if (incoming.kind === "button" && incoming.buttonId === "ADM_CLOSE") {
    await setSession(waId, { step: "READY", name: profileName });
    await Messaging.sendText(waId, "📢 Difusión cancelada via menú.", { channelId });
    return false;
  }
  if (incoming.kind === "text" && normText(incoming.text) === "cancelar") {
    await setSession(waId, { step: "READY", name: profileName });
    await Messaging.sendText(waId, "📢 Difusión cancelada.", { channelId });
    await showAdminMenu(waId, channelId);
    return true;
  }

  if (session.step === "BROADCAST_ASK_MESSAGE") {
    if (incoming.kind === "text") {
      const msgText = incoming.text;
      await setSession(waId, { step: "BROADCAST_CONFIRM", broadcast_msg: msgText, name: profileName });

      await Messaging.sendButtons(waId, `📢 *Confirmar Difusión*\n\nMensaje:\n_"${msgText}"_\n\n¿Enviar a TODOS los usuarios activos?`, [
        { id: "BROADCAST_YES", title: "✅ Sí, Enviar" },
        { id: "BROADCAST_NO", title: "❌ Cancelar" }
      ], { channelId });
      return true;
    }

    await Messaging.sendText(waId, "⚠️ Estoy esperando el texto del mensaje para la difusión.\nEscribe *cancelar* para salir.", { channelId });
    return true;
  }

  if (session.step === "BROADCAST_CONFIRM") {
    if (incoming.kind === "button") {
      if (incoming.buttonId === "BROADCAST_YES") {
        await setSession(waId, { step: "READY", name: profileName });
        await handleBroadcast(waId, session.broadcast_msg, channelId);
        return true;
      }
      if (incoming.buttonId === "BROADCAST_NO") {
        setSession(waId, { step: "READY", name: profileName });
        await Messaging.sendText(waId, "📢 Difusión cancelada.", { channelId });
        await showAdminMenu(waId, channelId);
        return true;
      }
    }
    return true;
  }
  return false;
}

// ============================
// ADMIN HELPERS
// ============================
async function showAdminMenu(waId, channelId) {
  const rows = [
    { id: ADMIN_LIST_PENDING, title: "📋 Ver Pendientes", description: "Usuarios en espera de aprobación" },
    { id: ADMIN_LIST_ALL, title: "👥 Ver Todos", description: "Gestionar todos los usuarios" },
    { id: ADMIN_BROADCAST, title: "📢 Difusión", description: "Enviar mensaje a todos" },
    { id: ADMIN_STATS, title: "📊 Estadísticas", description: "Ver estado del sistema" }
  ];
  await Messaging.sendList(
    waId,
    "🛡️ *Panel de Administrador IT*\nSelecciona una acción:",
    "⚙️ Opciones",
    [{ title: "Gestión", rows }],
    { channelId }
  );
}

async function handleListPending(waId, channelId) {
  const pendings = await getPendingUsers();
  if (!pendings || pendings.length === 0) {
    await Messaging.sendText(waId, "✅ No hay usuarios pendientes de aprobación.", { channelId });
    return;
  }

  for (const u of pendings) {
    const body = `👤 *Solicitud de Acceso*\n\n*Nombre:* ${u.name}\n*ID:* \`${u.wa_id}\`\n*Fecha:* ${new Date(u.created_at).toLocaleString()}`;
    const buttons = [
      { id: `ADM_ROLE_VIEWER_${u.wa_id}`, title: "✅ Aprobar" },
      { id: `ADM_ROLE_ADMIN_${u.wa_id}`, title: "👮‍♂️ Admin" },
      { id: `ADM_ROLE_BLOCKED_${u.wa_id}`, title: "🚫 Block" }
    ];
    await Messaging.sendButtons(waId, body, buttons, { channelId });
  }
}

async function handleListAll(waId, channelId) {
  const users = await getAllUsers();
  if (!users || users.length === 0) {
    await Messaging.sendText(waId, "✅ No hay usuarios registrados.", { channelId });
    return;
  }

  await Messaging.sendText(waId, `👥 Encontrados ${users.length} usuarios.`, { channelId });

  for (const u of users) {
    const isMe = u.wa_id === waId;
    const body = `👤 *Usuario: ${u.name}*\nID: \`${u.wa_id}\`\nRol: *${u.role}*`;

    if (isMe) {
      await Messaging.sendText(waId, body + "\n(Eres tú 👑)", { channelId });
      continue;
    }

    const buttons = [];
    if (u.role !== "SUPERADMIN") buttons.push({ id: `ADM_ROLE_SUPERADMIN_${u.wa_id}`, title: "⬆️ Super" });
    if (u.role !== "ADMIN") buttons.push({ id: `ADM_ROLE_ADMIN_${u.wa_id}`, title: "👮‍♂️ Admin" });
    if (u.role !== "VIEWER") buttons.push({ id: `ADM_ROLE_VIEWER_${u.wa_id}`, title: "👁️ Viewer" });
    if (u.role !== "BLOCKED") buttons.push({ id: `ADM_ROLE_BLOCKED_${u.wa_id}`, title: "🚫 Block" });

    const actions = buttons.slice(0, 3);
    await Messaging.sendButtons(waId, body, actions, { channelId });
  }
}

async function handleBroadcast(waId, message, channelId) {
  if (!message) return;
  await Messaging.sendText(waId, "⏳ Iniciando difusión global...", { channelId });

  const users = await getAllUsers();
  const targets = users.filter(u => u.role !== "BLOCKED");

  let successCount = 0;
  let failCount = 0;

  for (const u of targets) {
    try {
      // Broadcast should ideally use the same channel as the admin, OR we need mapUserToChannel.
      // For now, we use the Admin's channel ID as the outgoing channel 
      await Messaging.sendText(u.wa_id, `📢 *Anuncio Importante:*\n\n${message}`, { channelId });
      successCount++;
    } catch (e) {
      console.error(`❌ Error broadcast to ${u.wa_id}:`, e.message);
      failCount++;
    }
  }

  await Messaging.sendText(waId, `✅ *Difusión Completada*\n\nExitosos: ${successCount}\nFallidos: ${failCount}`, { channelId });
}

async function handleStats(waId, channelId) {
  try {
    console.log(`📊 Stats requested by ${waId}`);
    const uptimeSeconds = Math.floor((Date.now() - UPTIME_START) / 1000);
    const h = Math.floor(uptimeSeconds / 3600).toString().padStart(2, '0');
    const m = Math.floor((uptimeSeconds % 3600) / 60).toString().padStart(2, '0');
    const s = (uptimeSeconds % 60).toString().padStart(2, '0');
    const uptimeStr = `${h}:${m}:${s}`;

    const stats = await getSystemStats();

    const msg = `📊 *Estadísticas del Sistema*\n\n` +
      `⏱️ *Uptime:* ${uptimeStr}\n` +
      `👥 *Usuarios Totales:* ${stats.users}\n` +
      `⏳ *Usuarios Pendientes:* ${stats.pending_users}\n` +
      `📇 *Contactos CRM:* ${stats.crm_contacts || 0}\n` +
      `📨 *Cola Mensajes:* ${stats.queue}\n` +
      `🤖 *Versión:* ${process.env.npm_package_version || "1.1.0"}`;

    await Messaging.sendText(waId, msg, { channelId });
  } catch (e) {
    console.error("❌ Error generating stats:", e);
    await Messaging.sendText(waId, "⚠️ Error obteniendo estadísticas.", { channelId });
  }
}

module.exports = {
  processIncomingWhatsApp,
  handleBroadcast,
  handleStats
};
