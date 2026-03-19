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
    get sendDocument() { return require("./messaging.service").sendDocument; },
    get sendSticker() { return require("./whatsapp.service").sendSticker; },
    get sendReaction() { return require("./whatsapp.service").sendReaction; },
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
    async sendDocument(waId, docPath, filename, caption, opts = {}) {
        const mergedOpts = { simulateTyping: true, ...opts };
        const res = await BaseMessaging.sendDocument(waId, docPath, filename, caption, mergedOpts);
        await logInteraction({
            wa_id: waId,
            channel_id: opts.channelId || 'bot_asamblea',
            direction: 'OUTGOING',
            type: 'document',
            content: caption || '📄 Documento enviado',
            status: res.ok ? 'sent' : 'failed'
        });
        return res;
    },
    async sendSticker(waId, stickerPath, opts = {}) {
        const mergedOpts = { simulateTyping: true, ...opts };
        const res = await BaseMessaging.sendSticker(waId, stickerPath, mergedOpts);
        return res;
    },
    async sendReaction(waId, emoji, messageId, opts = {}) {
        return BaseMessaging.sendReaction(waId, emoji, messageId, opts);
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
    /** Informe de la asamblea 2026 */
    pdf_informe: path.join(__dirname, '../../assets/ASAMBLEA DE ACCIONISTAS 2026.pdf'),
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

// ─── FIX #1: Per-User Message Queue (Mutex) ─────────────────────────────────
// Garantiza que los mensajes de un mismo usuario se procesen de forma
// secuencial aunque lleguen en paralelo, evitando race conditions en la sesión.
const userQueues = new Map();

function enqueueForUser(waId, taskFn) {
    const current = userQueues.get(waId) || Promise.resolve();
    const next = current.then(taskFn).catch(err => {
        console.error(`[Queue] Error no capturado para ${waId}:`, err.message);
    });
    // Guardar la promesa en el mapa y liberar la referencia cuando termine
    userQueues.set(waId, next);
    next.finally(() => {
        if (userQueues.get(waId) === next) userQueues.delete(waId);
    });
    return next;
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

/**
 * Verifica si el usuario ya está registrado en la tabla de asistencia.
 * @param {string} waId 
 * @param {string} documento 
 * @returns {Promise<{registered: boolean, data?: object}>}
 */
async function checkExistingRegistration(waId, documento) {
    try {
        // Buscamos por teléfono o por documento para evitar duplicidad total
        const { data, error } = await supabase
            .from('asamblea_registro')
            .select('*')
            .or(`user_phone.eq.${waId},documento.eq.${documento}`)
            .eq('status', 'SYNC_OK')
            .maybeSingle();

        if (error) {
            console.error(`[Asamblea] Error verificando registro previo:`, error.message);
            return { registered: false };
        }

        return { registered: !!data, data };
    } catch (e) {
        console.error(`[Asamblea] Excepción verificando registro previo:`, e.message);
        return { registered: false };
    }
}

/**
 * Procesa la sincronización con SIISS, guarda en Supabase y envía mensajes finales.
 * Reemplaza al antiguo paso manual de 'Confirmación'.
 */
async function finalizeAsambleaRegistration(waId, session, opts) {
    const rolFinal = session.rol || 'ACCIONISTA';
    const isGuestOrProxy = ['INVITADO', 'APODERADO'].includes(rolFinal);

    await delay(400);

    let siissOk = true;
    if (rolFinal !== 'INVITADO') {
        await Messaging.sendText(waId, "¡Casi terminamos! ⏳ Registrando tu asistencia oficialmente...", opts);
        siissOk = await registrarAsistenciaSIISS(session.doc, session.nombre);
    } else {
        await Messaging.sendText(waId, "¡Casi terminamos! ⏳ Registrando tu ingreso de cortesía...", opts);
    }

    // FIX #4: usar upsert idempotente para evitar duplicados si dos webhooks
    // del mismo usuario llegan antes de que el primero termine (race condition).
    const { error: dbError } = await supabase.from('asamblea_registro').upsert({
        user_phone: waId,
        documento: session.doc,
        nombre: session.nombre,
        rol: rolFinal,
        categoria_oficial: session.categoriaOficial || 'ACCIONISTA',
        status: siissOk ? 'SYNC_OK' : 'SYNC_FAILED'
    }, { onConflict: 'user_phone' });

    if (dbError) {
        console.error("[Asamblea] Error guardando registro:", dbError);
        await Messaging.sendText(waId, "❌ Error técnico al guardar registro. Por favor infórmalo en la mesa principal.", opts);
        await clearAsamSession(waId);
        return;
    }

    await delay(1000);

    // UX Simplificado: Mensaje final consolidado
    let finalMsg = `🎉 *¡Registro exitoso!* ✅\n\n` +
                   `Es un gusto confirmar tu participación. Resumen de ingreso:\n` +
                   `👤 *Nombre:* ${session.nombre}\n` +
                   `📄 *Documento:* ${session.doc}\n` +
                   `🕐 *Hora:* ${new Date().toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' })}\n\n`;

    // Solo accionistas reciben el recordatorio del regalo aquí (Invitados/Apoderados ya lo vieron al inicio)
    if (!isGuestOrProxy) {
        finalMsg += `🎁 *¡No olvides reclamar tu obsequio!* Acércate a la mesa principal para recibir nuestro detalle.`;
    } else {
        finalMsg += `¡Gracias por acompañarnos! Te esperamos en el salón principal. 💛`;
    }

    await Messaging.sendText(waId, finalMsg, opts);

    // Enviar sticker de celebración
    try {
        await delay(600);
        await Messaging.sendSticker(waId, IMG.logo_sticker, opts);
    } catch (e) {
        console.warn('[Asamblea] No se pudo enviar sticker:', e.message);
    }

    await clearAsamSession(waId);
}

// ─── Procesamiento principal ─────────────────────────────────────────────────

async function processIncomingAsamblea(waId, value, msg, channelId) {
    try {
        const incomingText = msg.text?.body || msg.interactive?.button_reply?.id || msg.interactive?.list_reply?.id || "";
        const msgType = msg.type || (msg.interactive ? (msg.interactive.type === 'list_reply' ? 'list' : 'button') : 'text');
        const session = await getAsamSession(waId);
        const opts = {
            channelId: channelId || 'bot_asamblea',
            message_id: msg.id
        };

        // 1. Confirmación de lectura
        if (msg.id) {
            setTimeout(async () => {
                try {
                    await Messaging.sendChatAction(waId, "read", { message_id: msg.id });
                } catch (e) {
                    console.error("[Asamblea] Error en read confirmation:", e.message);
                }
            }, 800 + Math.random() * 1000);
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

        console.log(`[Asamblea v4.0] waId=${waId} step=${session.step} msg="${incomingText}"`);

        // ── COMANDO OCULTO: ADMIN BROADCAST ──────────────────────────────────
        if (normText(incomingText) === 'admgane') {
            await setAsamSession(waId, { step: 'ASAM_ADMIN_MENU' });
            await Messaging.sendButtons(waId, "👑 *Panel de Administración*\nBienvenido al centro de control de la Asamblea. ¿Qué deseas hacer?", [
                { id: "ADMIN_GO_POLL", title: "📣 Difusión Manual" },
                { id: "ADMIN_START_SARLAFT", title: "🎓 Quiz SARLAFT" },
                { id: "ADMIN_EXIT", title: "🛑 Salir" }
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
            } else if (incomingText === 'ADMIN_START_SARLAFT') {
                const quizQuestions = [
                    { q: "1. ¿Qué debo hacer al momento de observar una operación inusual?", o: ["A. Reportar a la policía", "B. Reportar a la Gerencia", "C. Reportar al Oficial de cumplimiento"] },
                    { q: "2. Esta es una señal de alerta:", o: ["A. Realizar retiros de Betplay sin la presencia del cliente", "B. Salir de vacaciones", "C. Un cliente que entrega toda la información solicitada"] },
                    { q: "3. El cumplimiento del SARLAFT, es responsabilidad de:", o: ["A. El gerente", "B. Oficial de cumplimiento", "C. De todos los que hacemos parte de Gane Palmira"] }
                ];
                
                const { count } = await supabase.from('asamblea_registro').select('*', { count: 'exact', head: true });
                await setAsamSession(waId, { step: 'ASAM_ADMIN_QUIZ_PREVIEW', quizQuestions });
                
                let previewText = `🎓 *VISTA PREVIA: QUIZ SARLAFT*\n\n`;
                quizQuestions.forEach(item => {
                    previewText += `*${item.q}*\n${item.o.map(o => `· ${o}`).join('\n')}\n\n`;
                });
                previewText += `⚠️ Se enviará este quiz secuencialmente a *${count || 0}* personas registradas. ¿Deseas continuar?`;
                
                await Messaging.sendButtons(waId, previewText, [
                    { id: "ADMIN_QUIZ_SEND_OK", title: "✅ Sí, Enviar Todo" },
                    { id: "ADMIN_QUIZ_CANCEL", title: "❌ Cancelar" }
                ], opts);
                return;
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
            await Messaging.sendText(waId, `Pregunta registrada:\n_"${question}"_\n\nAhora escribe las *Opciones de respuesta* separadas por comas (Máximo 3 opciones).`, opts);
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
            await Messaging.sendButtons(waId, `*Vista Previa de la Encuesta:*\n\n${session.question}\n\n¿Estás seguro de enviar esta difusión?`, [
                { id: "ADMIN_CONFIRM_YES", title: "✅ Enviar Encuesta" },
                { id: "ADMIN_CONFIRM_NO", title: "❌ Cancelar" }
            ], opts);
            return;
        }

        if (session.step === 'ASAM_ADMIN_CONFIRM') {
            if (incomingText === "ADMIN_CONFIRM_NO") {
                await setAsamSession(waId, { step: 'ASAM_ADMIN_MENU' });
                await Messaging.sendText(waId, "Encuesta cancelada.", opts);
                return;
            }

            if (incomingText === "ADMIN_CONFIRM_YES") {
                const question = session.question;
                const options = session.options;
                const { data: poll, error: pollErr } = await supabase.from('asamblea_encuestas').insert({ pregunta: question, opciones: options }).select().single();
                if (pollErr) {
                    await Messaging.sendText(waId, "❌ Error al guardar la encuesta en BD.", opts);
                    return;
                }
                const { data: users, error } = await supabase.from('asamblea_registro').select('user_phone, nombre').eq('status', 'SYNC_OK');
                if (error || !users || users.length === 0) {
                    await Messaging.sendText(waId, "❌ Error: No se encontraron accionistas registrados.", opts);
                    await setAsamSession(waId, { step: 'ASAM_ADMIN_MENU' });
                    return;
                }
                await Messaging.sendText(waId, `🚀 *Difusión iniciada* enviando a ${users.length} accionistas.`, opts);
                await setAsamSession(waId, { step: 'ASAM_ADMIN_MENU' });
                (async () => {
                    const pollButtons = options.map((opt, idx) => ({ id: `VOTE_${poll.id}_${idx}`, title: opt.substring(0, 20) }));
                    for (const user of users) {
                        try {
                            const userOpts = user.user_phone.startsWith("tg_") ? { channelId: "telegram_bot" } : {};
                            await Messaging.sendButtons(user.user_phone, `📊 *Encuesta Oficial*\nHola ${user.nombre.split(' ')[0]},\n\n${question}`, pollButtons, userOpts);
                        } catch (e) {}
                    }
                })();
                return;
            }
            return;
        }

        // --- PASO: CONFIRMACIÓN Y ENVIO DE QUIZ SARLAFT ---
        if (session.step === 'ASAM_ADMIN_QUIZ_PREVIEW') {
            if (incomingText === "ADMIN_QUIZ_CANCEL") {
                await setAsamSession(waId, { step: 'ASAM_ADMIN_MENU' });
                await Messaging.sendText(waId, "Operación cancelada.", opts);
                return;
            }

            if (incomingText === "ADMIN_QUIZ_SEND_OK") {
                const quizQuestions = session.quizQuestions;
                const { data: users, error: userErr } = await supabase.from('asamblea_registro').select('user_phone, nombre');
                
                if (userErr || !users || users.length === 0) {
                    await Messaging.sendText(waId, "❌ No hay usuarios registrados.", opts);
                    await setAsamSession(waId, { step: 'ASAM_ADMIN_MENU' });
                    return;
                }

                await Messaging.sendText(waId, `🚀 Difusión iniciada para ${users.length} personas.`, opts);
                await setAsamSession(waId, { step: 'ASAM_ADMIN_MENU' });

                (async () => {
                    for (const item of quizQuestions) {
                        const { data: poll, error: pollErr } = await supabase.from('asamblea_encuestas').insert({ 
                            pregunta: item.q, 
                            opciones: item.o 
                        }).select().single();

                        if (pollErr || !poll) continue;

                        const pollButtons = [
                            { id: `VOTE_${poll.id}_0`, title: "Opción A" },
                            { id: `VOTE_${poll.id}_1`, title: "Opción B" },
                            { id: `VOTE_${poll.id}_2`, title: "Opción C" }
                        ];
                        
                        for (const user of users) {
                            try {
                                // FIX #2: simulateTyping: false en difusiones masivas.
                                // Evita que el bot quede bloqueado durante el broadcast,
                                // garantizando que otros usuarios sigan siendo atendidos.
                                const userOpts = user.user_phone.startsWith("tg_")
                                    ? { channelId: "telegram_bot", simulateTyping: false }
                                    : { simulateTyping: false };
                                const fullQuestionBody = `🎓 *Capacitación SARLAFT*\n` +
                                                       `Hola ${user.nombre.split(' ')[0]},\n\n` +
                                                       `*Pregunta:* ${item.q}\n\n` +
                                                       `${item.o.map(opt => `🔹 ${opt}`).join('\n')}`;
                                await Messaging.sendButtons(user.user_phone, fullQuestionBody, pollButtons, userOpts);
                            } catch (e) { console.error(`[Quiz] Error enviando a ${user.user_phone}:`, e.message); }
                        }

                        await delay(4000);
                    }
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
                const { data: poll } = await supabase.from('asamblea_encuestas').select('*').eq('id', pollId).single();
                if (poll) {
                    const textoOpcion = poll.opciones[voteIdx] || "Opción desconocida";
                    await supabase.from('asamblea_votos').upsert({ encuesta_id: pollId, user_phone: waId, opcion_index: voteIdx, opcion_texto: textoOpcion }, { onConflict: 'encuesta_id, user_phone' });
                }
                await Messaging.sendText(waId, "✅ Tu respuesta ha sido registrada exitosamente. ¡Gracias!", opts);
            } catch (e) {
                await Messaging.sendText(waId, "✅ Gracias por tu respuesta.", opts);
            }
            return;
        }

        // ── ENTREGA DE INFORME (PDF) ────────────────────────────────────────
        if (incomingText === 'ASAM_DOWNLOAD_INFORME') {
            await Messaging.sendText(waId, "⏳ Generando descarga... Te llegará en unos segundos.", opts);
            const res = await Messaging.sendDocument(waId, IMG.pdf_informe, "ASAMBLEA_2026.pdf", "Informe de Gestión Asamblea 2026", opts);
            if (!res.ok) {
                await Messaging.sendText(waId, "❌ Lo siento, no pude enviar el archivo en este momento. Por favor inténtalo más tarde.", opts);
            }
            return;
        }

        if (normText(incomingText).includes('informe')) {
            await Messaging.sendButtons(waId, "📄 *Informe de Gestión 2026*\n\nHe encontrado el documento solicitado. ¿Deseas descargarlo ahora?", [
                { id: 'ASAM_DOWNLOAD_INFORME', title: "Descargar Informe" },
                { id: 'ASAMBLEA_CANCEL', title: "En otro momento" }
            ], opts);
            return;
        }


        // ── BIENVENIDA / REINICIO AUTOMÁTICO ──────────────────────────────────
        if (!session.step || session.step === 'NEW' || session.step === 'CLOSED' || normText(incomingText) === 'hola') {
            const auth = await checkAuthorization(waId);

            if (!auth.authorized) {
                await Messaging.sendText(waId, "🌟 ¡Hola! Gracias por comunicarte con la línea oficial de la *Asamblea de accionistas 2026*.\n\nEste número no está en nuestra lista de autorizados. Por favor acércate al punto presencial.", opts);
                return;
            }

            // --- VALIDACIÓN DE REGISTRO PREVIO ---
            const registration = await checkExistingRegistration(waId, auth.documento);
            if (registration.registered) {
                const regData = registration.data;
                const msgYaRegistrado = `✅ *¡Ya te encuentras registrado/a!*\n\n` +
                                       `Hola *${regData.nombre.split(' ')[0]}*, nuestro sistema confirma que tu registro se completó exitosamente.\n\n` +
                                       `📋 *Detalles:* \n` +
                                       `• Calidad: ${regData.rol}\n` +
                                       `• Documento: ${regData.documento}\n\n` +
                                       `¡Gracias por tu participación! Ya puedes ingresar al salón principal. 💛`;
                await Messaging.sendText(waId, msgYaRegistrado, opts);
                return;
            }
            // ------------------------------------

            const firstName = auth.name.split(' ')[0];
            const categoria = auth.categoria || 'ACCIONISTA';
            const documento = auth.documento || '';
            const labels = { 'ACCIONISTA': 'Accionista', 'INVITADO': 'Invitado', 'REPRESENTANTE_LEGAL': 'Representante Legal', 'APODERADO': 'Apoderado' };
            const labelRol = labels[categoria] || 'Participante';

            const nombreOficial = (auth.name || '').toUpperCase();
            const companyKeywords = [" S.A.", " SAS", " S.A.S", " LTDA", " LIMITADA", " INVERSIONES", " GRUPO", " FUNDACION"];
            const esEmpresa = companyKeywords.some(kw => nombreOficial.includes(kw));

            try {
                // Bienvenida premium: Imagen + Texto consolidado
                const welcomeText = `🌟 ¡Hola, *${firstName}*! Te damos la bienvenida a la *Asamblea de accionistas 2026*.\n\n` +
                                   `Te hemos identificado como: *${labelRol}*.`;
                
                await Messaging.sendPhoto(waId, IMG.logo_completo, welcomeText, opts);
                await delay(800);
            } catch (e) {}

            if (categoria === 'APODERADO' || categoria === 'INVITADO') {
                const instrMessage = `📌 Por favor, **dirígete a la mesa principal de registro** para completar tu ingreso presencial y reclamar tu obsequio. ¡Te esperamos! 🎁`;
                await Messaging.sendText(waId, instrMessage, opts);
                
                const currentSession = await setAsamSession(waId, { 
                    step: 'COMPLETED', fullName: auth.name, nombre: auth.name, categoriaOficial: categoria, doc: documento, rol: labelRol 
                });
                await finalizeAsambleaRegistration(waId, currentSession, opts);
                return;

            } else if (categoria === 'REPRESENTANTE_LEGAL') {
                const currentSession = await setAsamSession(waId, { 
                    step: 'COMPLETED', fullName: auth.name, nombre: auth.name, categoriaOficial: categoria, doc: documento, rol: 'Representante Legal' 
                });
                await finalizeAsambleaRegistration(waId, currentSession, opts);
                return;

            } else {
                // Es ACCIONISTA
                if (esEmpresa) {
                    await setAsamSession(waId, { 
                        step: 'ASAMBLEA_ASK_NAME', fullName: auth.name, categoriaOficial: categoria, doc: documento, esEmpresa: true, nombreOficial: auth.name 
                    });
                    const askName = `Por favor escríbeme el *nombre completo del representante o apoderado* que asiste hoy por *${firstName}*:`;
                    await Messaging.sendText(waId, askName, opts);
                    return;
                } else {
                    const currentSession = await setAsamSession(waId, { 
                        step: 'COMPLETED', fullName: auth.name, nombre: auth.name, categoriaOficial: categoria, doc: documento, rol: 'Accionista', esEmpresa: false, nombreOficial: auth.name 
                    });
                    await finalizeAsambleaRegistration(waId, currentSession, opts);
                    return;
                }
            }
        }

        // ── PASO 2: Capturar Nombre (Solo Empresas) ──────────────────────────
        if (session.step === 'ASAMBLEA_ASK_NAME') {
            const nombre = String(incomingText).trim();
            if (nombre.length < 5 || /^\d+$/.test(nombre)) {
                await Messaging.sendText(waId, "Necesito el nombre *completo* del representante. Por favor no uses números. 📝", opts);
                return;
            }
            // Para empresas: el rol es REPRESENTANTE
            const currentSession = await setAsamSession(waId, { step: 'COMPLETED', nombre, rol: 'REPRESENTANTE' });
            await Messaging.sendText(waId, `Perfecto, *${nombre}*. Procedo con el registro de la empresa...`, opts);
            await finalizeAsambleaRegistration(waId, currentSession, opts);
            return;
        }

        // ── ESTADO DESCONOCIDO ───────────────────────────────────────────────
        await clearAsamSession(waId);
        await Messaging.sendText(waId, "¡Hola! Escribe *Hola* para iniciar tu registro. 👋", opts);

    } catch (error) {
        console.error("[Asamblea] Error:", error);
        await Messaging.sendText(waId, "Ocurrió un error. Escribe *Hola* para reiniciar.", { channelId });
    }
}

module.exports = {
    processIncomingAsamblea,
    enqueueForUser
};
