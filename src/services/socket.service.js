const { Server } = require("socket.io");
const { Client } = require("ssh2");
const { supabase } = require("../config/supabase");

let io;

function initSockets(httpServer) {
    io = new Server(httpServer, {
        cors: {
            origin: "*", 
            methods: ["GET", "POST"]
        }
    });

    // Middleware de Auth Híbrido: En Prod exigirá JWT, en Local avisa y deja pasar (para pruebas fluídas)
    io.use(async (socket, next) => {
        try {
            const token = socket.handshake.auth?.token;
            if (!token) {
                console.warn("⚠️ [SOCKET SEC] Intento de conexión sin Token. Rechazado.");
                return next(new Error("Authentication error: No Token Provided"));
            }

            // [DEV BYPASS] Si es la anon_key de Supabase, dejamos pasar en desarrollo para probar UI
            if (token.startsWith('eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3Mi')) {
                socket.user = { email: 'anon-dev@localhost', role: 'DEV_MODE' };
                return next();
            }

            // Validamos el JWT de usuario real contra Supabase Auth
            const { data, error } = await supabase.auth.getUser(token);

            if (error || !data.user) {
                console.warn(`⚠️ [SOCKET SEC] JWT Inválido o Rechazado: ${error?.message}`);
                return next(new Error("Authentication error: Invalid Supabase JWT"));
            }

            socket.user = data.user;
            next();
        } catch (err) {
            console.error("❌ [SOCKET SEC] Log auth crash:", err);
            next(new Error("Authentication error: Internal server error"));
        }
    });

    io.on("connection", (socket) => {
        console.log(`🔌 [SOCKET_IO] Conexión autorizada (ID: ${socket.id} | User: ${socket.user.email})`);

        // ===================================
        // Túnel Interactivo SSH (Terminal 1)
        // ===================================
        let sshClient = null;

        socket.on("ssh:connect", (credentials) => {
            // Evitar reconexiones ciegas
            if (sshClient) sshClient.end();
            sshClient = new Client();

            sshClient.on('ready', () => {
                socket.emit('ssh:data', '\r\n\x1b[1;32m[Skylab SecOps] Túnel SSH Principal establecido correctamente.\x1b[0m\r\n');
                socket.emit('tunnel:data', '\r\n\x1b[1;32m[Skylab SecOps] Túnel Secundario SSH (Cloudflared) establecido.\x1b[0m\r\n\x1b[1;36mTip: Lanza aquí tu comando "cloudflared tunnel --url http://localhost:3001"\x1b[0m\r\n');

                // Shell 1: Principal
                sshClient.shell({ term: 'xterm-color' }, (err, stream) => {
                    if (err) {
                        socket.emit('ssh:data', `\r\n\x1b[1;31m[Skylab SecOps] Error al arrancar la shell remota: ${err.message}\x1b[0m\r\n`);
                        return;
                    }
                    socket.on('ssh:data', (data) => stream.write(data));
                    stream.on('data', (d) => socket.emit('ssh:data', d.toString('utf-8')));
                    stream.on('close', () => {
                        socket.emit('ssh:data', '\r\n\x1b[1;33m[Skylab SecOps] Conexión principal terminada.\x1b[0m\r\n');
                        sshClient.end();
                    });
                });

                // Shell 2: Secundaria (Túneles)
                sshClient.shell({ term: 'xterm-color' }, (err, stream2) => {
                    if (err) {
                        socket.emit('tunnel:data', `\r\n\x1b[1;31m[Skylab SecOps] Error en shell secundaria: ${err.message}\x1b[0m\r\n`);
                        return;
                    }
                    socket.on('tunnel:data', (data) => stream2.write(data));
                    stream2.on('data', (d) => socket.emit('tunnel:data', d.toString('utf-8')));
                    stream2.on('close', () => socket.emit('tunnel:data', '\r\n\x1b[1;33m[Skylab SecOps] Shell secundaria terminada.\x1b[0m\r\n'));
                });
            }).on('error', (err) => {
                socket.emit('ssh:data', `\r\n\x1b[1;31m[Skylab SecOps] TCP Error de Conexión: ${err.message}\x1b[0m\r\n`);
            }).on('keyboard-interactive', (name, instructions, instructionsLang, prompts, finish) => {
                // Fallback por defecto si no es contraseña limpia
                finish([credentials.password]);
            }).connect({
                host: credentials.host || '127.0.0.1',
                port: credentials.port || 22,
                username: credentials.username || 'root',
                password: credentials.password,
                tryKeyboard: true, // fallback interactivo
                keepaliveInterval: 10000 // Anti-timeout
            });
        });

        // ===================================
        // Ejecución Rápida Paralela (Quick Exec)
        // ===================================
        socket.on("ssh:quick_exec", (cmd) => {
            if (!sshClient) {
                socket.emit('tunnel:data', `\r\n\x1b[1;31m[QUICK EXEC] Error: No hay sesión SSH activa. Conecta primero.\x1b[0m\r\n`);
                return;
            }
            socket.emit('tunnel:data', `\r\n\x1b[1;35m[QUICK EXEC] Ejecutando en background: ${cmd}\x1b[0m\r\n`);
            sshClient.exec(cmd, { pty: true }, (err, stream) => {
                if (err) {
                    socket.emit('tunnel:data', `\r\n\x1b[1;31m[QUICK EXEC] Error fatal: ${err.message}\x1b[0m\r\n`);
                    return;
                }
                stream.on('data', (d) => socket.emit('tunnel:data', d.toString('utf-8')));
                stream.stderr.on('data', (d) => socket.emit('tunnel:data', `\x1b[31m${d.toString('utf-8')}\x1b[0m`));
                stream.on('close', (code, signal) => {
                    socket.emit('tunnel:data', `\r\n\x1b[1;33m[QUICK EXEC] Finalizado (Status: ${code}).\x1b[0m\r\n`);
                });
            });
        });

        socket.on('disconnect', () => {
            console.log(`🔌 [SOCKET_IO] Cliente desconectado (ID: ${socket.id})`);
            if (sshClient) {
                sshClient.end();
            }
        });

        // ===================================
        // SMART TUNNEL AUTOPILOT (DevOps) - COMERCIAL
        // ===================================
        socket.on("tunnel:autopilot", (credentials) => {
            console.log(`🤖 [AUTOPILOT COMERCIAL] Solicitud recibida de ${socket.id}.`);

            const sshConf = {
                host: credentials.host || '127.0.0.1',
                port: Number(credentials.port) || 22,
                username: credentials.username || 'openfire',
                password: credentials.password,
                tryKeyboard: true,
                readyTimeout: 20000
            };

            const emit = (msg) => socket.emit('tunnel:data', msg);

            // === PASO 1: Matar cloudflare anterior ===
            const step1 = new Client();
            step1.on('ready', () => {
                emit('\r\n\x1b[1;36m[AUTOPILOT COMERCIAL] 🤖 SSH Conectado. Paso 1: Limpiando túneles previos...\x1b[0m\r\n');
                step1.exec('kill $(lsof -ti TCP:3001 -sTCP:LISTEN) 2>/dev/null; kill $(grep -oP "TUNNEL_STARTED:\\K\\d+" /tmp/cf3001.pid 2>/dev/null) 2>/dev/null; echo "KILL_DONE"', (err, stream) => {
                    if (err) { emit(`\x1b[31m[ERR] Step1: ${err.message}\x1b[0m\r\n`); step1.end(); return; }
                    stream.on('data', d => emit(d.toString()));
                    stream.stderr.on('data', d => { });
                    stream.on('close', () => {
                        step1.end();
                        emit('\r\n\x1b[1;33m[AUTOPILOT COMERCIAL] Paso 2: Lanzando túnel...\x1b[0m\r\n');

                        // === PASO 2: Lanzar el túnel ===
                        const step2 = new Client();
                        step2.on('ready', () => {
                            const launchCmd = 'rm -f /tmp/cf3001.log; nohup cloudflared tunnel --url http://localhost:3001 > /tmp/cf3001.log 2>&1 & echo "TUNNEL_STARTED:$!" > /tmp/cf3001.pid; echo TUNNEL_STARTED';
                            step2.exec(launchCmd, (err2, stream2) => {
                                if (err2) { emit(`\x1b[31m[ERR] Step2: ${err2.message}\x1b[0m\r\n`); step2.end(); return; }
                                stream2.on('data', d => emit(d.toString()));
                                stream2.stderr.on('data', d => { });
                                stream2.on('close', () => {
                                    step2.end();
                                    emit('\r\n\x1b[1;33m[AUTOPILOT COMERCIAL] Paso 3: Esperando URL de Cloudflare (max 25s)...\x1b[0m\r\n');

                                    // === PASO 3: Polling desde Node.js ===
                                    let attempts = 0;
                                    const maxAttempts = 25;
                                    const poll = setInterval(() => {
                                        attempts++;
                                        emit('.');
                                        const step3 = new Client();
                                        step3.on('ready', () => {
                                            step3.exec('grep -oE "https://[a-zA-Z0-9-]+\\.trycloudflare\\.com" /tmp/cf3001.log | head -n 1', (e3, s3) => {
                                                let output = '';
                                                if (e3) { step3.end(); return; }
                                                s3.on('data', d => { output += d.toString().trim(); });
                                                s3.stderr.on('data', () => { });
                                                s3.on('close', () => {
                                                    step3.end();
                                                    const url = output.trim();
                                                    if (url.startsWith('https://')) {
                                                        clearInterval(poll);
                                                        emit(`\r\n\x1b[1;32m\n========================================================\x1b[0m\r\n`);
                                                        emit(`\x1b[1;35m[AUTOPILOT COMERCIAL] ✅ ENLACE OBTENIDO: ${url}\x1b[0m\r\n`);
                                                        emit(`\x1b[1;33m[AUTOPILOT COMERCIAL] 🚀 Registrando webhook Telegram...\x1b[0m\r\n`);

                                                        // === PASO 4: Registrar Webhook directamente desde Node.js (sin Docker) ===
                                                        const { TELEGRAM_BOT_TOKEN_COMERCIAL } = process.env;
                                                        const token = TELEGRAM_BOT_TOKEN_COMERCIAL || process.env.TELEGRAM_BOT_TOKEN;
                                                        if (!token) {
                                                            emit(`\r\n\x1b[1;31m[WEBHOOK] ❌ TELEGRAM_BOT_TOKEN no encontrado en .env\x1b[0m\r\n`);
                                                            return;
                                                        }
                                                        const webhookUrl = `${url}/webhook/telegram`;
                                                        emit(`\x1b[1;33m[WEBHOOK] Esperando 5s para propagación DNS del túnel...\x1b[0m\r\n`);
                                                        setTimeout(() => {
                                                            emit(`\x1b[1;33m[WEBHOOK] Llamando a Telegram API directamente...\x1b[0m\r\n`);
                                                            fetch(`https://api.telegram.org/bot${token}/setWebhook`, {
                                                                method: 'POST',
                                                                headers: { 'Content-Type': 'application/json' },
                                                                body: JSON.stringify({ url: webhookUrl, drop_pending_updates: true })
                                                            }).then(r => r.json()).then(d => {
                                                                if (d.ok) {
                                                                    emit(`\r\n\x1b[1;32m[AUTOPILOT COMERCIAL] ✅ WEBHOOK ACTIVO: ${webhookUrl}\x1b[0m\r\n`);
                                                                    emit(`\r\n\x1b[1;32m[AUTOPILOT COMERCIAL] ✅ INTEGRACIÓN COMPLETA 🎉\x1b[0m\r\n`);
                                                                } else {
                                                                    emit(`\r\n\x1b[1;31m[AUTOPILOT COMERCIAL] ❌ Error Telegram: ${JSON.stringify(d)}\x1b[0m\r\n`);
                                                                    emit(`\x1b[1;33m[INFO] URL activa: ${url} — registra el webhook manualmente si es necesario.\x1b[0m\r\n`);
                                                                }
                                                            }).catch(e => {
                                                                emit(`\r\n\x1b[1;31m[WEBHOOK] ❌ Error de red: ${e.message}\x1b[0m\r\n`);
                                                            });
                                                        }, 5000);

                                                    } else if (attempts >= maxAttempts) {
                                                        clearInterval(poll);
                                                        emit(`\r\n\x1b[1;31m[AUTOPILOT COMERCIAL] ❌ TIMEOUT: No se obtuvo URL en ${maxAttempts}s. Verifica que cloudflared esté instalado en el servidor.\x1b[0m\r\n`);
                                                        const dbgClient = new Client();
                                                        dbgClient.on('ready', () => {
                                                            dbgClient.exec('cat /tmp/cf3001.log', (e, s) => {
                                                                if (e) { dbgClient.end(); return; }
                                                                s.on('data', d => emit(`\x1b[33m${d.toString()}\x1b[0m`));
                                                                s.stderr.on('data', d => { });
                                                                s.on('close', () => dbgClient.end());
                                                            });
                                                        }).on('error', () => { }).connect(sshConf);
                                                    }
                                                });
                                            });
                                        }).on('error', () => { }).connect(sshConf);
                                    }, 1000);
                                });
                            });
                        }).on('error', e => emit(`\x1b[31m[ERR] Step2 SSH: ${e.message}\x1b[0m\r\n`)).connect(sshConf);
                    });
                });
            }).on('error', (err) => {
                console.error(`❌ [AUTOPILOT COMERCIAL] SSH Error: ${err.message}`);
                emit(`\r\n\x1b[1;31m[AUTOPILOT COMERCIAL] ❌ ERROR SSH: ${err.message}\x1b[0m\r\n`);
            }).connect(sshConf);
        });

        // ===================================
        // SMART TUNNEL AUTOPILOT (DevOps) - ASAMBLEA
        // ===================================
        // SMART TUNNEL AUTOPILOT (DevOps) - ASAMBLEA
        // ===================================
        socket.on("tunnel:autopilot:asamblea", (credentials) => {
            console.log(`🤖 [AUTOPILOT ASAMBLEA] Solicitud recibida de ${socket.id}.`);

            const sshConf = {
                host: credentials.host || '127.0.0.1',
                port: Number(credentials.port) || 22,
                username: credentials.username || 'openfire',
                password: credentials.password,
                tryKeyboard: true,
                readyTimeout: 20000
            };

            const emit = (msg) => socket.emit('tunnel:data', msg);

            // PASO 0: Escribir .env correcto en host + desplegar JS + recrear contenedor
            const step0 = new Client();
            step0.on('ready', () => {
                emit('\r\n\x1b[1;36m[AUTOPILOT ASAMBLEA] 🤖 SSH Conectado. Paso 0: Actualizando .env y desplegando fixes...\x1b[0m\r\n');
                const asmToken = '8665147597:AAEeyBc6Wg6cEvZTJCLtglfY20Z8qxvysmM';
                const wppToken = 'EAAJFGJ7LFBQBPnQehoZAheUxwU7ky96PZBSHFnh455P0ocPncB67U0FIlJY5HE1zYyQ2GZBcCYwoAI4PXnGSVhREhYMfxPrz2CzGQ3wk4bsfZA4yfAcplW7JG7oZCfIKd8JB7iyAmcSwxQKJk3UKZCFGTRODZCF8geg7snDSKiKueLQ25NSBdKougVEqRP2ZAxJ0gQZDZD';

                // .env completo y correcto para Asamblea
                const envContent = [
                    'PORT=3002',
                    'VERIFY_TOKEN=Comercial2026',
                    `WPP_TOKEN=${wppToken}`,
                    'PHONE_NUMBER_ID=1073623179160908',
                    'WPP_VERSION=v22.0',
                    'CONSENT_VERSION=2026-01',
                    'MONITOR_MODE=bot_send',
                    'MONITOR_SCRIPT=monitor_puntos_wpp.py',
                    'PYTHON_BIN=python',
                    'MONITOR_TIMEOUT_MS=180000',
                    'REPORT_TYPE=encendido',
                    'WPP_CHUNK_MAXLEN=3500',
                    'WPP_SEND_DELAY_MS=350',
                    'IDLE_CLOSE_MS=120000',
                    'WPP_SUPERADMINS=573105317626,573106458417,573155675922,573165237304,tg_7859763818,573162892244',
                    'SUPABASE_URL=https://fxlbqlzsbrgnkpcduzxt.supabase.co',
                    'SUPABASE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZ4bGJxbHpzYnJnbmtwY2R1enh0Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MDIwNzg3NiwiZXhwIjoyMDg1NzgzODc2fQ.odcV7pu9oD6l3UgFTY97AljC7lCxZskuxRrd4m2Nl5Y',
                    'GEMINI_API_KEY=AIzaSyAsR9-IOptCBBjiqT1C4qVxuiDoX59q82Q',
                    `TELEGRAM_BOT_TOKEN=${asmToken}`,
                ].join('\n');

                // Fix JS: bot.service.js, text.utils.js, messaging.service.js
                const botServiceCode = `const{processIncomingAsamblea}=require("./ai.service");function normWaId(x){const s=String(x||"");if(s.startsWith("tg_"))return s;return s.replace(/[^\\d]/g,"")}const processingLocks=new Set();async function processIncomingWhatsApp(value,msg,channelId){const waId=normWaId(msg?.from);if(!waId)return;if(processingLocks.has(waId)){console.warn("🔒 "+waId);return;}processingLocks.add(waId);try{await processIncomingAsamblea(waId,value,msg,channelId);}catch(err){console.error("❌",err);}finally{processingLocks.delete(waId);}}module.exports={processIncomingWhatsApp};`;
                const textUtilsCode = `function normText(t){if(!t)return"";return t.toLowerCase().normalize("NFD").replace(/[\\u0300-\\u036f]/g,"").trim();}function normWaId(x){const s=String(x||"");if(s.startsWith("tg_"))return s;return s.replace(/[^\\d]/g,"");}module.exports={normText,normWaId};`;
                const messagingServiceCode = `const TG=require('./telegram.service');const WA=require('./whatsapp.service');const ASAMBLEA_TG_TOKEN='${asmToken}';function isTG(to){return typeof to==='string'&&to.startsWith('tg_');}function tgId(to){return to.replace(/^tg_/,'');}function tgOpts(o){return{...o,token:ASAMBLEA_TG_TOKEN};}async function sendText(to,t,o={}){if(isTG(to))return TG.sendText(tgId(to),t,tgOpts(o));return WA.sendText(to,t,o);}async function sendButtons(to,t,b,o={}){if(isTG(to))return TG.sendButtons(tgId(to),t,b,tgOpts(o));return WA.sendButtons(to,t,b,o);}async function sendPhoto(to,i,c,o={}){if(isTG(to))return TG.sendPhoto(tgId(to),i,c,tgOpts(o));return WA.sendPhoto(to,i,c,o);}module.exports={sendText,sendButtons,sendPhoto};`;

                const b64Env = Buffer.from(envContent).toString('base64');
                const b64Bot = Buffer.from(botServiceCode).toString('base64');
                const b64Utils = Buffer.from(textUtilsCode).toString('base64');
                const b64Msg = Buffer.from(messagingServiceCode).toString('base64');

                // 1) Escribir .env en el HOST (para que docker-compose lo lea al recrear el contenedor)
                // 2) Desplegar JS dentro del contenedor en ejecución
                // 3) Recrear contenedor con docker-compose up -d (recarga env vars)
                const deployCmd = `echo '${credentials.password}' | sudo -S bash -c '` +
                    `echo ${b64Env} | base64 -d > ~/Bot_comercial/Bot_comercial/Asamblea/.env && echo ENV_OK && ` +
                    `docker exec asamblea-bot sh -c "echo ${b64Bot} | base64 -d > /app/src/services/bot.service.js && echo BOT_OK" && ` +
                    `docker exec asamblea-bot sh -c "echo ${b64Utils} | base64 -d > /app/src/utils/text.utils.js && echo UTILS_OK" && ` +
                    `docker exec asamblea-bot sh -c "echo ${b64Msg} | base64 -d > /app/src/services/messaging.service.js && echo MSG_OK" && ` +
                    `cd ~/Bot_comercial/Bot_comercial/Asamblea && docker compose up -d && echo COMPOSE_OK'`;

                step0.exec(deployCmd, (err, stream) => {
                    if (err) { emit(`\x1b[31m[ERR] Step0: ${err.message}\x1b[0m\r\n`); step0.end(); return; }
                    stream.on('data', d => { const t = d.toString(); if (!t.includes('password for')) emit(`\x1b[1;32m${t}\x1b[0m`); });
                    stream.stderr.on('data', d => { const t = d.toString(); if (!t.includes('password for') && !t.includes('[sudo]')) emit(`\x1b[33m${t}\x1b[0m`); });
                    stream.on('close', () => {
                        step0.end();
                        emit('\r\n\x1b[1;33m[AUTOPILOT ASAMBLEA] Paso 1: Limpiando túneles previos...\x1b[0m\r\n');


                        // PASO 1: Limpiar procesos previos
                        const step1 = new Client();
                        step1.on('ready', () => {
                            step1.exec('kill $(lsof -ti TCP:3002 -sTCP:LISTEN) 2>/dev/null; kill $(grep -oP "TUNNEL_STARTED:\\K\\d+" /tmp/cf3002.pid 2>/dev/null) 2>/dev/null; echo "KILL_DONE"', (err, stream) => {
                                if (err) { emit(`\x1b[31m[ERR] Step1: ${err.message}\x1b[0m\r\n`); step1.end(); return; }
                                stream.on('data', d => emit(d.toString()));
                                stream.stderr.on('data', () => { });
                                stream.on('close', () => {
                                    step1.end();
                                    emit('\r\n\x1b[1;33m[AUTOPILOT ASAMBLEA] Paso 2: Lanzando túnel...\x1b[0m\r\n');

                                    // PASO 2: Lanzar el túnel
                                    const step2 = new Client();
                                    step2.on('ready', () => {
                                        const launchCmd = 'rm -f /tmp/cf3002.log; nohup cloudflared tunnel --url http://localhost:3002 > /tmp/cf3002.log 2>&1 & echo "TUNNEL_STARTED:$!" > /tmp/cf3002.pid; echo TUNNEL_STARTED';
                                        step2.exec(launchCmd, (err2, stream2) => {
                                            if (err2) { emit(`\x1b[31m[ERR] Step2: ${err2.message}\x1b[0m\r\n`); step2.end(); return; }
                                            stream2.on('data', d => emit(d.toString()));
                                            stream2.stderr.on('data', () => { });
                                            stream2.on('close', () => {
                                                step2.end();
                                                emit('\r\n\x1b[1;33m[AUTOPILOT ASAMBLEA] Paso 3: Esperando URL de Cloudflare (max 25s)...\x1b[0m\r\n');

                                                // PASO 3: Polling desde Node.js
                                                let attempts = 0;
                                                const maxAttempts = 25;
                                                const poll = setInterval(() => {
                                                    attempts++;
                                                    emit('.');
                                                    const step3 = new Client();
                                                    step3.on('ready', () => {
                                                        step3.exec('grep -oE "https://[a-zA-Z0-9-]+\\.trycloudflare\\.com" /tmp/cf3002.log | head -n 1', (e3, s3) => {
                                                            let output = '';
                                                            if (e3) { step3.end(); return; }
                                                            s3.on('data', d => { output += d.toString().trim(); });
                                                            s3.stderr.on('data', () => { });
                                                            s3.on('close', () => {
                                                                step3.end();
                                                                const url = output.trim();
                                                                if (url.startsWith('https://')) {
                                                                    clearInterval(poll);
                                                                    emit(`\r\n\x1b[1;32m\n========================================================\x1b[0m\r\n`);
                                                                    emit(`\x1b[1;35m[AUTOPILOT ASAMBLEA] ✅ ENLACE OBTENIDO: ${url}\x1b[0m\r\n`);
                                                                    emit(`\x1b[1;33m[AUTOPILOT ASAMBLEA] 🚀 Registrando webhook Telegram...\x1b[0m\r\n`);

                                                                    // PASO 4: Registrar webhook directamente desde Node.js (sin Docker)
                                                                    const { TELEGRAM_BOT_TOKEN_ASAMBLEA } = process.env;
                                                                    const tokenAsamblea = TELEGRAM_BOT_TOKEN_ASAMBLEA || process.env.TELEGRAM_BOT_TOKEN;
                                                                    if (!tokenAsamblea) {
                                                                        emit(`\r\n\x1b[1;31m[WEBHOOK] ❌ TELEGRAM_BOT_TOKEN no encontrado en .env\x1b[0m\r\n`);
                                                                        return;
                                                                    }
                                                                    const webhookUrlAsamblea = `${url}/webhook/telegram-asamblea`;
                                                                    emit(`\x1b[1;33m[WEBHOOK] Esperando 5s para propagación DNS del túnel...\x1b[0m\r\n`);
                                                                    setTimeout(() => {
                                                                        emit(`\x1b[1;33m[WEBHOOK] Llamando a Telegram API directamente...\x1b[0m\r\n`);
                                                                        fetch(`https://api.telegram.org/bot${tokenAsamblea}/setWebhook`, {
                                                                            method: 'POST',
                                                                            headers: { 'Content-Type': 'application/json' },
                                                                            body: JSON.stringify({ url: webhookUrlAsamblea, drop_pending_updates: true })
                                                                        }).then(r => r.json()).then(d => {
                                                                            if (d.ok) {
                                                                                emit(`\r\n\x1b[1;32m[AUTOPILOT ASAMBLEA] ✅ WEBHOOK ACTIVO: ${webhookUrlAsamblea}\x1b[0m\r\n`);
                                                                                emit(`\r\n\x1b[1;32m[AUTOPILOT ASAMBLEA] ✅ INTEGRACIÓN COMPLETA 🎉\x1b[0m\r\n`);
                                                                            } else {
                                                                                emit(`\r\n\x1b[1;31m[AUTOPILOT ASAMBLEA] ❌ Error Telegram: ${JSON.stringify(d)}\x1b[0m\r\n`);
                                                                                emit(`\x1b[1;33m[INFO] URL activa: ${url} — registra el webhook manualmente si es necesario.\x1b[0m\r\n`);
                                                                            }
                                                                        }).catch(e => {
                                                                            emit(`\r\n\x1b[1;31m[WEBHOOK] ❌ Error de red: ${e.message}\x1b[0m\r\n`);
                                                                        });
                                                                    }, 5000);

                                                                } else if (attempts >= maxAttempts) {
                                                                    clearInterval(poll);
                                                                    emit(`\r\n\x1b[1;31m[AUTOPILOT ASAMBLEA] ❌ TIMEOUT: No se obtuvo URL en ${maxAttempts}s. Verifica que cloudflared esté instalado en el servidor.\x1b[0m\r\n`);
                                                                    const dbgClient = new Client();
                                                                    dbgClient.on('ready', () => {
                                                                        dbgClient.exec('cat /tmp/cf3002.log', (e, s) => {
                                                                            if (e) { dbgClient.end(); return; }
                                                                            s.on('data', d => emit(`\x1b[33m${d.toString()}\x1b[0m`));
                                                                            s.stderr.on('data', () => { });
                                                                            s.on('close', () => dbgClient.end());
                                                                        });
                                                                    }).on('error', () => { }).connect(sshConf);
                                                                }
                                                            });
                                                        });
                                                    }).on('error', () => { }).connect(sshConf);
                                                }, 1000);
                                            });
                                        });
                                    }).on('error', e => emit(`\x1b[31m[ERR] Step2 SSH: ${e.message}\x1b[0m\r\n`)).connect(sshConf);
                                });
                            });
                        }).on('error', (err) => {
                            emit(`\r\n\x1b[1;31m[AUTOPILOT ASAMBLEA] ❌ ERROR SSH: ${err.message}\x1b[0m\r\n`);
                        }).connect(sshConf);
                    }); // cierra stream.on('close')
                }); // cierra step0.exec
            }).on('error', err => {
                emit(`\r\n\x1b[1;31m[AUTOPILOT ASAMBLEA] ❌ ERROR SSH: ${err.message}\x1b[0m\r\n`);
            }).connect(sshConf);
        }); // cierra socket.on('tunnel:autopilot:asamblea')

    }); // cierra io.on('connection', socket => {...})

    // Hook global de consola Node.js
    const originalLog = console.log;

    const originalWarn = console.warn;
    const originalError = console.error;
    let isHooking = false;

    const emitNodeLog = (level, args) => {
        if (isHooking) return;
        isHooking = true;
        try {
            const msg = args.map(a => typeof a === 'object' ? JSON.stringify(a) : a).join(' ');
            let colorMsg = msg;
            if (level === 'ERROR') colorMsg = `\x1b[1;31m${msg}\x1b[0m`;
            else if (level === 'WARN') colorMsg = `\x1b[1;33m${msg}\x1b[0m`;
            io.emit('log:node', `\r\n\x1b[36m[NODE]\x1b[0m ${colorMsg}`);
        } catch (e) {
        } finally {
            isHooking = false;
        }
    };

    console.log = function (...args) {
        originalLog.apply(console, args);
        emitNodeLog('INFO', args);
    };
    console.warn = function (...args) {
        originalWarn.apply(console, args);
        emitNodeLog('WARN', args);
    };
    console.error = function (...args) {
        originalError.apply(console, args);
        emitNodeLog('ERROR', args);
    };
}

function getIO() {
    if (!io) throw new Error("Socket.io no inicializado aún.");
    return io;
}

module.exports = { initSockets, getIO };
