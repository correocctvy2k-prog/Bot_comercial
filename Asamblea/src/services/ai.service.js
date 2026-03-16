// src/services/ai.asamblea.service.js
// v3.7.3: Tono Premium, Mejor Detección Empresa/Persona & UX (verified)

const { supabase } = require('../config/supabase');
const { validarDocumentoAsamblea, registrarAsistenciaSIISS } = require('./api.asamblea.service');
const { normText } = require('../utils/text.utils');
const { logInteraction, ensureContact } = require('./logger.service');

const BaseMessaging = {
    get sendText() { return require("./messaging.service").sendText; },
    get sendButtons() { return require("./messaging.service").sendButtons; },
    get sendPhoto() { return require("./messaging.service").sendPhoto; },
    get sendList() { return require("./messaging.service").sendList; },
    get sendChatAction() { return require("./messaging.service").sendChatAction; }
};

const Messaging = {
    async sendText(waId, text, opts = {}) {
        const mergedOpts = { simulateTyping: true, ...opts };
        const res = await BaseMessaging.sendText(waId, text, mergedOpts);
        await logInteraction({
            wa_id: waId,
            channel_id: opts.channelId || 'bot_asamblea',
            direction: 'OUTGOING',
            type: 'text',
            content: text,
            status: res.ok ? 'sent' : 'failed'
        });
        return res;
    },
    async sendButtons(waId, text, buttons, opts = {}) {
        const mergedOpts = { simulateTyping: true, ...opts };
        const res = await BaseMessaging.sendButtons(waId, text, buttons, mergedOpts);
        const btnTitles = buttons.map(b => `[${b.title}]`).join(' ');
        await logInteraction({
            wa_id: waId,
            channel_id: opts.channelId || 'bot_asamblea',
            direction: 'OUTGOING',
            type: 'button',
            content: `${text} ${btnTitles}`,
            status: res.ok ? 'sent' : 'failed'
        });
        return res;
    },
    async sendPhoto(waId, photoUrl, caption, opts = {}) {
        const mergedOpts = { simulateTyping: true, ...opts };
        const res = await BaseMessaging.sendPhoto(waId, photoUrl, caption, mergedOpts);
        await logInteraction({
            wa_id: waId,
            channel_id: opts.channelId || 'bot_asamblea',
            direction: 'OUTGOING',
            type: 'image',
            content: caption || '📷 Imagen enviada',
            status: res.ok ? 'sent' : 'failed'
        });
        return res;
    },
    async sendList(waId, text, buttonText, sections, opts = {}) {
        const mergedOpts = { simulateTyping: true, ...opts };
        const res = await BaseMessaging.sendList(waId, text, buttonText, sections, mergedOpts);
        await logInteraction({
            wa_id: waId,
            channel_id: opts.channelId || 'bot_asamblea',
            direction: 'OUTGOING',
            type: 'list',
            content: `${text} [Menu List]`,
            status: res.ok ? 'sent' : 'failed'
        });
        return res;
    },
    async sendChatAction(waId, action, opts = {}) {
        return BaseMessaging.sendChatAction(waId, action, opts);
    }
};
const { generateChart } = require('./charts.service');

// ─── URLs de Imágenes Corporativas (v3.8: Locales para mayor confiabilidad) ───
const path = require('path');
const IMG = {
    /** Logo completo cuadrado — se envía en la bienvenida */
    logo_completo: path.join(__dirname, '../../assets/logo_asamblea.png'),
    /** Sticker circular del logo Gane — se envía tras registro exitoso */
    logo_sticker: path.join(__dirname, '../../assets/logo_gane_sticker.webp'),
};

const ASAM_ROLE_ASOCIADO = "ASAM_ROLE_ASOCIADO";
const ASAM_ROLE_REPRESENT = "ASAM_ROLE_REPRESENT";
const ASAM_CONFIRM_YES = "ASAM_CONFIRM_YES";
const ASAM_CONFIRM_NO = "ASAM_CONFIRM_NO";

// ─── Helpers de UX ──────────────────────────────────────────────────────────

/** Pausa simulando que el asistente está procesando / escribiendo */
const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

/**
 * Envía múltiples mensajes con delays entre ellos para simular escritura natural.
 * @param {string} waId
 * @param {string[]} messages - Array de texto a enviar
 * @param {object} opts - { channelId }
 * @param {number} baseDelay - delay base entre mensajes (ms)
 */
async function sendSequential(waId, messages, opts, baseDelay = 900) {
    for (let i = 0; i < messages.length; i++) {
        if (i > 0) {
            // Delay proporcional al largo del mensaje anterior (simula tiempo de escritura)
            const typingTime = Math.min(baseDelay + messages[i - 1].length * 12, 2500);
            await delay(typingTime);
        }
        await Messaging.sendText(waId, messages[i], opts);
    }
}

// ─── Gestión de Sesión (independiente del bot comercial) ────────────────────

const sessionCache = new Map();

async function getAsamSession(waId) {
    const cached = sessionCache.get(waId);
    if (cached) return cached;

    const { data } = await supabase
        .from('bot_sessions')
        .select('*')
        .eq('wa_id', waId)
        .single();

    if (data) {
        const session = { 
            step: data.step, 
            doc: data.doc, 
            nombre: data.nombre,
            categoriaOficial: data.categoria_oficial 
        };
        sessionCache.set(waId, session);
        return session;
    }

    return { step: 'NEW' };
}

async function setAsamSession(waId, patch) {
    const current = await getAsamSession(waId);
    const updated = { ...current, ...patch };
    sessionCache.set(waId, updated);

    await supabase.from('bot_sessions').upsert({
        wa_id: waId,
        step: updated.step,
        doc: updated.doc || null,
        nombre: updated.nombre || null,
        categoria_oficial: updated.categoriaOficial || null,
        updated_at: new Date().toISOString()
    }, { onConflict: 'wa_id' });

    return updated;
}

async function clearAsamSession(waId) {
    sessionCache.delete(waId);
    await supabase.from('bot_sessions').delete().eq('wa_id', waId);
}

// ─── Verificación de Seguridad ───────────────────────────────────────────────

/**
 * Verifica si el número de teléfono está en la lista blanca (padrón).
 * @param {string} waId 
 * @returns {Promise<{authorized: boolean, name?: string}>}
 */
async function checkAuthorization(waId) {
    try {
        const { data, error } = await supabase
            .from('asamblea_padron')
            .select('nombre, categoria, documento')
            .eq('wa_id', waId)
            .maybeSingle();

        if (error) {
            console.error(`[Asamblea] Error verificando padrón para ${waId}:`, error.message);
            return { authorized: false };
        }

        if (data) {
            return { 
                authorized: true, 
                name: data.nombre, 
                categoria: data.categoria || 'ACCIONISTA',
                documento: data.documento
            };
        }

        return { authorized: false };
    } catch (e) {
        console.error(`[Asamblea] Excepción verificando padrón:`, e.message);
        return { authorized: false };
    }
}

// ─── Procesamiento principal ─────────────────────────────────────────────────

async function processIncomingAsamblea(waId, value, msg, channelId) {
    try {
        const incomingText = msg.text?.body || msg.interactive?.button_reply?.id || msg.interactive?.list_reply?.id || "";
        const msgType = msg.type || (msg.interactive ? (msg.interactive.type === 'list_reply' ? 'list' : 'button') : 'text');
        const session = await getAsamSession(waId);
        const opts = {
            channelId: channelId || 'bot_asamblea',
            message_id: msg.id // Agregado para habilitar el estado "Escribiendo" vinculado al mensaje
        };

        // 1. Confirmación de lectura con retraso (Humanización)
        if (msg.id) {
            setTimeout(async () => {
                try {
                    await Messaging.sendChatAction(waId, "read", { message_id: msg.id });
                } catch (e) {
                    console.error("[Asamblea] Error en read confirmation:", e.message);
                }
            }, 800 + Math.random() * 1000); // 0.8s - 1.8s de delay
        }

        // Aseguramos la creación/actualización del contacto
        const profileName = value?.contacts?.[0]?.profile?.name || 'Asambleísta';
        await ensureContact(waId, profileName);

        // Registro de interacción entrante
        await logInteraction({
            wa_id: waId,
            channel_id: opts.channelId,
            direction: 'INCOMING',
            type: msgType,
            content: incomingText,
            raw: msg
        });

        console.log(`[Asamblea v3.7.3] waId=${waId} step=${session.step} msg="${incomingText}"`);

        // ── COMANDO OCULTO: ADMIN BROADCAST ──────────────────────────────────
        if (normText(incomingText) === 'admgane') {
            await setAsamSession(waId, { step: 'ASAM_ADMIN_MENU' });
            await Messaging.sendButtons(waId, "👑 *Panel de Administración*\nBienvenido al centro de control de la Asamblea. ¿Qué deseas hacer?", [
                { id: "ADMIN_GO_POLL", title: "📣 Crear Encuesta" },
                { id: "ADMIN_VIEW_POLL", title: "📈 Resultados" },
                { id: "ADMIN_EXIT", title: "🛑 Salir del Panel" }
            ], opts);
            return;
        }

        // --- COMANDO DE SALIDA GLOBAL ---
        if (normText(incomingText) === 'salir' || incomingText === 'ADMIN_EXIT') {
            await setAsamSession(waId, { step: null });
            await Messaging.sendText(waId, "✅ Has salido del panel de administración. El bot ha vuelto a estado normal.", opts);
            return;
        }

        if (session.step === 'ASAM_ADMIN_MENU') {
            if (incomingText === 'ADMIN_GO_POLL') {
                await setAsamSession(waId, { step: 'ASAM_ADMIN_ASK_Q' });
                await Messaging.sendText(waId, "📝 Escribe la *Pregunta* que deseas enviar a todos los accionistas:", opts);
            } else if (incomingText === 'ADMIN_VIEW_QUORUM') {
                await Messaging.sendText(waId, "⏳ Generando reporte de quórum...", opts);
                const res = await generateChart('quorum');
                if (res.ok) {
                    await Messaging.sendPhoto(waId, res.image, "📊 *Estado Actual del Quórum*", opts);
                } else {
                    await Messaging.sendText(waId, `❌ Error: ${res.error}`, opts);
                }
            } else if (incomingText === 'ADMIN_VIEW_POLL') {
                // Obtenemos la última encuesta enviada
                const { data: poll } = await supabase.from('asamblea_encuestas').select('*').order('created_at', { ascending: false }).limit(1).single();
                if (!poll) {
                    await Messaging.sendText(waId, "❌ Aún no hay encuestas registradas.", opts);
                    return;
                }
                await Messaging.sendText(waId, "⏳ Generando resultados de la última encuesta...", opts);
                const res = await generateChart('poll', poll.id);
                if (res.ok) {
                    await Messaging.sendPhoto(waId, res.image, `📈 *Resultados:* ${poll.pregunta}`, opts);
                } else {
                    await Messaging.sendText(waId, `❌ Error: ${res.error}`, opts);
                }
            }
            return;
        }

        if (session.step === 'ASAM_ADMIN_ASK_Q') {
            const question = String(incomingText).trim();
            if (question.length < 5) {
                await Messaging.sendText(waId, "La pregunta parece muy corta. Por favor escribe una pregunta clara para la encuesta.", opts);
                return;
            }
            await setAsamSession(waId, { step: 'ASAM_ADMIN_ASK_OPTS', question });
            await Messaging.sendText(waId, `Pregunta registrada:\n_"${question}"_\n\nAhora escribe las *Opciones de respuesta* separadas por comas (Máximo 3 opciones).\nEjemplo: Sí apruebo, No apruebo, Me abstengo`, opts);
            return;
        }

        if (session.step === 'ASAM_ADMIN_ASK_OPTS') {
            const optsString = String(incomingText).trim();
            const optionArray = optsString.split(',').map(o => o.trim()).filter(o => o.length > 0).slice(0, 3);

            if (optionArray.length < 2) {
                await Messaging.sendText(waId, "Necesitas al menos 2 opciones. Por favor envíalas separadas por coma.", opts);
                return;
            }

            await setAsamSession(waId, { step: 'ASAM_ADMIN_CONFIRM', options: optionArray });

            // Build the preview buttons
            const previewBtns = optionArray.map((opt, idx) => ({ id: `POLL_${idx}`, title: opt.substring(0, 20) }));

            await Messaging.sendButtons(waId, `*Vista Previa de la Encuesta:*\n\n${session.question}\n\n¿Estás seguro de enviar esta difusión a TODOS los accionistas registrados?`, [
                { id: "ADMIN_CONFIRM_YES", title: "✅ Enviar Encuesta" },
                { id: "ADMIN_CONFIRM_NO", title: "❌ Cancelar" }
            ], opts);
            return;
        }

        if (session.step === 'ASAM_ADMIN_CONFIRM') {
            if (incomingText === "ADMIN_CONFIRM_NO") {
                await setAsamSession(waId, { step: 'ASAM_ADMIN_MENU' });
                await Messaging.sendText(waId, "Encuesta cancelada. Sistema vuelto al menú principal.", opts);
                return;
            }

            if (incomingText === "ADMIN_CONFIRM_YES") {
                const question = session.question;
                const options = session.options;

                // 1. Guardar encuesta en BD para histórico y votos
                const { data: poll, error: pollErr } = await supabase
                    .from('asamblea_encuestas')
                    .insert({ pregunta: question, opciones: options })
                    .select()
                    .single();

                if (pollErr) {
                    await Messaging.sendText(waId, "❌ Error al guardar la encuesta en BD.", opts);
                    return;
                }

                // 2. Extraer base de datos de usuarios
                const { data: users, error } = await supabase
                    .from('asamblea_registro')
                    .select('user_phone, nombre')
                    .eq('status', 'SYNC_OK');

                if (error || !users || users.length === 0) {
                    await Messaging.sendText(waId, "❌ Error: No se encontraron accionistas registrados.", opts);
                    await setAsamSession(waId, { step: 'ASAM_ADMIN_MENU' });
                    return;
                }

                await Messaging.sendText(waId, `🚀 *Difusión iniciada*\nEnviando a ${users.length} accionistas en segundo plano. Te avisaré al terminar o puedes seguir usando el panel.`, opts);
                await setAsamSession(waId, { step: 'ASAM_ADMIN_MENU' });

                // 3. DIFUSIÓN ASÍNCRONA (Fire & Forget)
                (async () => {
                    const pollButtons = options.map((opt, idx) => ({
                        id: `VOTE_${poll.id}_${idx}`,
                        title: opt.substring(0, 20)
                    }));
                    let successCount = 0;

                    for (const user of users) {
                        try {
                            // Si es un ID de Telegram (tg_...), marcamos canal
                            const userOpts = user.user_phone.startsWith("tg_") ? { channelId: "telegram_bot" } : {};
                            await Messaging.sendButtons(user.user_phone, `📊 *Encuesta Oficial de Asamblea*\nHola ${user.nombre.split(' ')[0]},\n\n${question}`, pollButtons, userOpts);
                            successCount++;
                            await delay(150); // Delay suave para no saturar
                        } catch (e) {
                            console.error(`Error enviando encuesta a ${user.user_phone}:`, e.message);
                        }
                    }
                    // Notificar al admin al finalizar (opcional, pero útil)
                    await Messaging.sendText(waId, `🏁 *Difusión finalizada*\nSe entregó exitosamente a *${successCount}/${users.length}* personas.`, opts);
                })();

                return;
            }
            return;
        }

        // ── RESPUESTAS A ENCUESTAS (VOTOS) ───────────────────────────────────
        if (incomingText.startsWith('VOTE_')) {
            const parts = incomingText.split('_');
            const pollId = parts[1];
            const voteIdx = parseInt(parts[2]);

            try {
                // 1. Obtener la encuesta específica
                const { data: poll } = await supabase
                    .from('asamblea_encuestas')
                    .select('*')
                    .eq('id', pollId)
                    .single();

                if (poll) {
                    const textoOpcion = poll.opciones[voteIdx] || "Opción desconocida";

                    // 2. Registrar el voto (usando upsert para permitir cambiar de opinión)
                    const { error: voteErr } = await supabase
                        .from('asamblea_votos')
                        .upsert({
                            encuesta_id: pollId,
                            user_phone: waId,
                            opcion_index: voteIdx,
                            opcion_texto: textoOpcion
                        }, { onConflict: 'encuesta_id, user_phone' });

                    if (voteErr) {
                        console.error("[Asamblea] Error registrando voto:", voteErr);
                    }
                }

                await Messaging.sendText(waId, "✅ Tu respuesta ha sido registrada exitosamente. ¡Gracias por participar!", opts);
            } catch (e) {
                console.error("[Asamblea] Error procesando voto:", e);
                await Messaging.sendText(waId, "✅ Gracias por tu respuesta.", opts);
            }
            return;
        }


        // ── BIENVENIDA / REINICIO ────────────────────────────────────────────
        if (!session.step || session.step === 'NEW' || session.step === 'CLOSED'
            || normText(incomingText) === 'hola' || normText(incomingText) === 'hola!') {

            // 🛡️ Pre-Check de Seguridad (REQ: 2026-03-13)
            const auth = await checkAuthorization(waId);

            if (!auth.authorized) {
                console.log(`[Asamblea] 🛑 Acceso DENEGADO para ${waId} (No está en padrón)`);
                await Messaging.sendText(waId, "🌟 ¡Hola! Gracias por comunicarte con la línea oficial de la *Asamblea de accionistas 2026*.\n\nLamentablemente, este número no se encuentra registrado en nuestra base de datos de accionistas autorizados. Si crees que esto es un error, por favor acércate a nuestro punto de atención presencial para asistirte. ¡Que tengas un excelente día! 💛", opts);
                return;
            }

            const firstName = auth.name.split(' ')[0];
            const categoria = auth.categoria || 'ACCIONISTA';
            const documento = auth.documento || ''; // Extraer el documento del padrón
            
            // Mapeo amigable sugerido por el usuario
            const labels = {
                'ACCIONISTA': 'Accionista',
                'INVITADO': 'Invitado',
                'REPRESENTANTE_LEGAL': 'Representante Legal',
                'APODERADO': 'Apoderado'
            };
            const labelRol = labels[categoria] || 'Participante';

            // Detectar si es empresa basándonos en el nombre del padrón o la longitud del documento
            const nombreOficial = (auth.name || '').toUpperCase();
            const companyKeywords = [" S.A.", " SAS", " S.A.S", " LTDA", " LIMITADA", " INVERSIONES", " PRODUCCIONES", " COMERCIALIZADORA", " GRUPO", " FUNDACION", " CORPORACION"];
            const esEmpresa = companyKeywords.some(kw => nombreOficial.includes(kw)) || (documento.length > 0 && documento.length <= 9);

            // Enviar imagen corporativa como primer impacto visual
            try {
                await Messaging.sendPhoto(waId, IMG.logo_completo, "🌟 *Asamblea de accionistas 2026*", opts);
                await delay(800);
            } catch (e) {
                console.warn('[Asamblea] No se pudo enviar imagen de logo:', e.message);
            }

            const welcomeMsgs = [
                `🌟 ¡Hola, *${firstName}*! Es un verdadero gusto saludarte. Te damos la más cordial bienvenida a la *Asamblea de accionistas 2026*.`,
                `Te hemos identificado en nuestro sistema como: *${labelRol}*.`
            ];

            if (categoria === 'APODERADO') {
                welcomeMsgs.push("📌 Por favor, **dirígete a la mesa principal de registro** para completar tu proceso de ingreso de forma presencial y reclamar tu obsequio. ¡Te esperamos! 🎁");
                // Como es apoderado, el flujo puede terminar aquí o ir directo a confirmación
                await setAsamSession(waId, { 
                    step: 'ASAMBLEA_CONFIRM', 
                    fullName: auth.name, 
                    nombre: auth.name,
                    categoriaOficial: categoria,
                    doc: documento,
                    rol: 'APODERADO'
                });
                welcomeMsgs.push("¿Deseas confirmar tu asistencia virtual antes de pasar a la mesa?");
                await sendSequential(waId, welcomeMsgs, opts, 1200);
                await delay(300);
                await Messaging.sendButtons(waId, "Confirma tu ingreso:", [
                    { id: ASAM_CONFIRM_YES, title: "✅ Sí, confirmar" },
                    { id: ASAM_CONFIRM_NO, title: "❌ Cancelar" }
                ], opts);
                return;

            } else if (categoria === 'INVITADO') {
                await setAsamSession(waId, { 
                    step: 'ASAMBLEA_CONFIRM', 
                    fullName: auth.name, 
                    nombre: auth.name,
                    categoriaOficial: categoria,
                    doc: documento,
                    rol: 'INVITADO'
                });
                await sendSequential(waId, welcomeMsgs, opts, 1200);
                await delay(300);
                await Messaging.sendButtons(waId, "¿Deseas confirmar tu ingreso a la Asamblea?", [
                    { id: ASAM_CONFIRM_YES, title: "✅ Sí, confirmar" },
                    { id: ASAM_CONFIRM_NO, title: "❌ Cancelar" }
                ], opts);
                return;

            } else if (categoria === 'REPRESENTANTE_LEGAL') {
                 await setAsamSession(waId, { 
                    step: 'ASAMBLEA_CONFIRM', 
                    fullName: auth.name, 
                    nombre: auth.name,
                    categoriaOficial: categoria,
                    doc: documento,
                    rol: 'REPRESENTANTE LEGAL'
                });
                await sendSequential(waId, welcomeMsgs, opts, 1200);
                await delay(300);
                await Messaging.sendButtons(waId, "¿Deseas confirmar tu ingreso en calidad de Representante Legal?", [
                    { id: ASAM_CONFIRM_YES, title: "✅ Sí, confirmar" },
                    { id: ASAM_CONFIRM_NO, title: "❌ Cancelar" }
                ], opts);
                return;

            } else {
                // Es ACCIONISTA
                if (esEmpresa) {
                    await setAsamSession(waId, { 
                        step: 'ASAMBLEA_ASK_NAME', 
                        fullName: auth.name, 
                        // No seteamos `nombre` aquí porque se lo pediremos al representante enseguida (ver paso 2)
                        categoriaOficial: categoria,
                        doc: documento,
                        esEmpresa: true,
                        nombreOficial: auth.name
                    });
                    welcomeMsgs.push("Por favor escríbeme el *nombre completo del representante o apoderado* que asiste hoy a la asamblea:");
                    await sendSequential(waId, welcomeMsgs, opts, 1200);
                    return;
                } else {
                    await setAsamSession(waId, { 
                        step: 'ASAMBLEA_CONFIRM', 
                        fullName: auth.name, 
                        nombre: auth.name, 
                        categoriaOficial: categoria,
                        doc: documento,
                        rol: 'ASOCIADO',
                        esEmpresa: false,
                        nombreOficial: auth.name
                    });
                    await sendSequential(waId, welcomeMsgs, opts, 1200);
                    await delay(300);
                    await Messaging.sendButtons(waId, "¿Deseas confirmar tu ingreso en calidad de Asociado?", [
                        { id: ASAM_CONFIRM_YES, title: "✅ Sí, confirmar" },
                        { id: ASAM_CONFIRM_NO, title: "❌ Cancelar" }
                    ], opts);
                    return;
                }
            }
        }



        // ── PASO 2: Capturar Nombre / Representante ──────────────────────────
        if (session.step === 'ASAMBLEA_ASK_NAME') {
            const nombre = String(incomingText).trim();
            const esEmpresa = session.esEmpresa || false;
            const nombreOficial = session.nombreOficial || '';

            if (nombre.length < 5 || /^\d+$/.test(nombre)) {
                const prompt = "Necesito el nombre *completo del representante o apoderado* (nombre y apellidos). Por favor no escribas números. 📝";
                await Messaging.sendText(waId, prompt, opts);
                return;
            }

            // Para empresas: el rol es siempre REPRESENTANTE y el nombre es del rep
            await setAsamSession(waId, { step: 'ASAMBLEA_CONFIRM', nombre, rol: 'REPRESENTANTE' });
            await delay(300);
            await Messaging.sendButtons(waId,
                `Perfecto. Por favor confirma los datos antes de finalizar:\n\n` +
                `🏢 *Empresa:* ${nombreOficial}\n` +
                `🤝 *Representante:* ${nombre}\n` +
                `📄 *NIT:* ${session.doc}\n\n` +
                `¿Todo está correcto?`,
                [
                    { id: ASAM_CONFIRM_YES, title: "✅ Sí, confirmar" },
                    { id: ASAM_CONFIRM_NO, title: "❌ Cancelar" }
                ], opts);
            return;
        }

        // ── PASO 4: Confirmación y Registro Final ────────────────────────────
        if (session.step === 'ASAMBLEA_CONFIRM') {
            if (incomingText === ASAM_CONFIRM_NO) {
                // Reiniciar al inicio (eliminamos paso documental manual)
                await clearAsamSession(waId);
                await Messaging.sendText(waId,
                    "Entendido. He cancelado el proceso actual. Si deseas intentarlo o tienes alguna duda, simplemente escríbeme 'Hola' y con gusto reiniciamos. 😊",
                    opts);
                return;
            }

            if (incomingText !== ASAM_CONFIRM_YES) {
                await Messaging.sendButtons(waId, "Por favor usa los botones para confirmar o cancelar tu registro:",
                    [
                        { id: ASAM_CONFIRM_YES, title: "✅ Sí, confirmar" },
                        { id: ASAM_CONFIRM_NO, title: "❌ Cancelar" }
                    ], opts);
                return;
            }

            // Leer rol desde sesión
            const { data: sesDb } = await supabase.from('bot_sessions').select('*').eq('wa_id', waId).single();
            const rolFinal = sesDb?.rol || 'ASOCIADO';

            await delay(400);
            await Messaging.sendText(waId, "¡Casi terminamos! ⏳ Estoy registrando tu asistencia oficialmente en el Sistema de Quórum...", opts);

            const siissOk = await registrarAsistenciaSIISS(session.doc, session.nombre);

            const { error: dbError } = await supabase.from('asamblea_registro').insert({
                user_phone: waId,
                documento: session.doc,
                nombre: session.nombre,
                rol: rolFinal,
                categoria_oficial: session.categoriaOficial || 'ACCIONISTA',
                status: siissOk ? 'SYNC_OK' : 'SYNC_FAILED'
            });

            if (dbError) {
                console.error("[Asamblea] Error guardando registro:", dbError);
                await Messaging.sendText(waId,
                    "❌ Ocurrió un error técnico al guardar tu registro. Por favor infórmalo al personal presente para que lo registren manualmente.",
                    opts);
                await clearAsamSession(waId);
                return;
            }

            if (!siissOk) {
                console.warn(`[Asamblea] ⚠️ Guardado local OK, pero falló envío a SIISS para doc ${session.doc}`);
            }

            await delay(1200);
            await sendSequential(waId, [
                `🎉 ¡*Registro completado con éxito*!`,
                `Es un gusto confirmar que ya haces parte oficial de la Asamblea. Aquí tienes el resumen de tu ingreso:\n\n` +
                `🏢 Calidad: ${rolFinal}\n` +
                `👤 Nombre: ${session.nombre}\n` +
                `📄 Documento / NIT: ${session.doc}\n` +
                `🕐 Hora: ${new Date().toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' })}`,
                `✅ ¡Bienvenido/a a la *Asamblea de accionistas 2026*! Gracias por acompañarnos y por tu valiosa participación. 💛`
            ], opts, 1500);

            // Enviar sticker de celebración al final
            try {
                await delay(600);
                await Messaging.sendSticker(waId, IMG.logo_sticker, opts);
            } catch (e) {
                console.warn('[Asamblea] No se pudo enviar sticker de cierre:', e.message);
            }

            await clearAsamSession(waId);
            return;
        }

        // ── ESTADO DESCONOCIDO ───────────────────────────────────────────────
        await clearAsamSession(waId);
        await Messaging.sendText(waId, "¡Hola! Escribe *Hola* para iniciar tu registro en la asamblea. 👋", opts);

    } catch (error) {
        console.error("[Asamblea] Error en processIncomingAsamblea:", error);
        await Messaging.sendText(waId,
            "Ocurrió un error inesperado. Por favor escribe *Hola* para reiniciar el proceso, o acércate al punto de atención presencial.",
            { channelId });
    }
}

module.exports = {
    processIncomingAsamblea
};
