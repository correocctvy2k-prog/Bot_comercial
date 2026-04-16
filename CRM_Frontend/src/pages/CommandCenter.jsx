import { useEffect, useRef, useState, useCallback } from 'react';
import { Database, Server, Webhook, Terminal as TerminalIcon, ShieldAlert, Cpu, HardDrive, KeyRound, Wifi, X, Play, RefreshCw, Trash2, Activity, TextSearch, Sparkles } from 'lucide-react';
import SystemHealthPanel from '../components/SystemHealthPanel';
import { Terminal } from 'xterm';
import { FitAddon } from 'xterm-addon-fit';
import { io } from 'socket.io-client';
import { supabase } from '../services/supabase';
import { Group, Panel, Separator } from "react-resizable-panels";
import 'xterm/css/xterm.css';

export default function CommandCenter() {
    const mainRef = useRef(null);
    const nodeRef = useRef(null);
    const tunnelRef = useRef(null);
    const socketRef = useRef(null);
    const mainTermRef = useRef(null); // Guardar referencia a la terminal principal
    const tunnelTermRef = useRef(null); // Guardar referencia a la terminal del túnel
    const sshStatusRef = useRef('idle'); // Ref para evitar stale-closure en onData

    const [connectionStatus, setConnectionStatus] = useState('DESCONECTADO');
    const [cpuUsage, setCpuUsage] = useState('0%');
    const [ramUsage, setRamUsage] = useState('0G');
    const [tunnelUrl, setTunnelUrl] = useState(() => localStorage.getItem('skylab_tunnelUrl') || null);
    const [tunnelStale, setTunnelStale] = useState(() => !!localStorage.getItem('skylab_tunnelUrl')); // true = URL de sesión anterior

    // Estado del Modal SSH
    const [showSshModal, setShowSshModal] = useState(true);
    const [sshStatus, setSshStatus] = useState('idle'); // idle, connecting, connected, error

    // Sincronizar el ref con el estado para que los callbacks internos lean el valor actualizado
    useEffect(() => { sshStatusRef.current = sshStatus; }, [sshStatus]);
    const [sshCredentials, setSshCredentials] = useState({
        host: '192.168.8.65',
        port: '22',
        username: 'skylab',
        password: ''
    });

    useEffect(() => {
        const socketToken = supabase.supabaseKey;

        // Conectamos al backend usando la variable de entorno o localhost por defecto
        const backendUrl = import.meta.env.VITE_BACKEND_URL || 'http://localhost:3001';
        console.log("Intentando conectar Socket.io a:", backendUrl);
        
        const socket = io(backendUrl, {
            auth: { token: socketToken },
            transports: ['websocket', 'polling'],
            reconnectionDelayMax: 5000,
        });
        socketRef.current = socket;

        socket.on('connect', () => setConnectionStatus('ONLINE'));
        socket.on('disconnect', () => {
            setConnectionStatus('OFFLINE');
            setSshStatus('idle'); // Restaurar estado si se cae el socket
            setShowSshModal(true);
        });
        socket.on('connect_error', (err) => {
            setConnectionStatus('ERROR');
            console.error("Socket Error:", err.message);
        });

        // Tema Ultra-Muted (Inspirado en Catppuccin Mocha y terminales Nord)
        // Eliminamos por completo cualquier verde o cian neón (colores bright)
        const theme = {
            background: '#141414',
            foreground: '#8b949e', // Texto base muy suave claro azulado (gris plomo)
            cursor: '#f38ba8',     // Cursor acento rojo pastel
            selection: '#313244',  // Selección gris oscuro
            black: '#45475a',
            red: '#f38ba8',        // Rojo pastel
            green: '#a6e3a1',      // Verde menta muy suave
            yellow: '#f9e2af',     // Amarillo pálido crema
            blue: '#89b4fa',       // Azul pastel
            magenta: '#cba6f7',    // Morado suave
            cyan: '#89dceb',       // Cian hielo/agua pastel
            white: '#939ab5',      // Blanco menos deslumbrante
            // Variantes Brights para anular los "Bold" y "Neon" del Bash
            brightBlack: '#585b70',
            brightRed: '#f38ba8',
            brightGreen: '#a6e3a1',// ¡Anula el \x1b[1;32m fluorescente nativo!
            brightYellow: '#f9e2af',
            brightBlue: '#89b4fa',
            brightMagenta: '#cba6f7',
            brightCyan: '#89dceb', // ¡Anula comandos SSH que exigen cyan vivo!
            brightWhite: '#a6adc8',
        };

        const initTerm = (ref) => {
            if (!ref.current) return null;
            const term = new Terminal({
                theme: theme,
                fontFamily: "'Consolas', 'Courier New', 'Monaco', monospace",
                fontWeight: '600',
                fontSize: 13,
                cursorBlink: true,
                disableStdin: false,
                lineHeight: 1.5
            });
            const fitAddon = new FitAddon();
            term.loadAddon(fitAddon);
            term.open(ref.current);
            // Diferir el primer fit() hasta que el DOM panel tenga dimensiones reales
            requestAnimationFrame(() => {
                try { fitAddon.fit(); } catch (_) { /* panel aún sin tamaño */ }
            });
            const resizeObserver = new ResizeObserver(() => {
                try { fitAddon.fit(); } catch (_) { /* ignorar race condition */ }
            });
            resizeObserver.observe(ref.current);
            return { term, fitAddon, resizeObserver };
        };

        const mainCtx = initTerm(mainRef);
        const nodeCtx = initTerm(nodeRef);
        const tunnelCtx = initTerm(tunnelRef);

        if (mainCtx) mainTermRef.current = mainCtx.term;
        if (tunnelCtx) tunnelTermRef.current = tunnelCtx.term;
        if (nodeCtx) nodeCtx.term.options.disableStdin = true;
        if (tunnelCtx) tunnelCtx.term.options.disableStdin = false;

        // Pintar status iniciales temporales en los logs
        if (nodeCtx) nodeCtx.term.writeln('\x1b[1;30mEsperando logs de Node.js por Socket...\x1b[0m');
        if (tunnelCtx) tunnelCtx.term.writeln('\x1b[1;30mEsperando logs del Túnel por Socket...\x1b[0m');
        if (mainCtx) mainCtx.term.writeln('\x1b[1;30mEsperando conexión SSH... Configura el host en el menú flotante.\x1b[0m');

        // Conectar I/O del Frontend al Backend a través de WebSockets
        if (mainCtx && socket) {

            // ==========================================
            // Shell 1: Terminal Principal (xterm principal)
            // ==========================================
            socket.on('ssh:data', (data) => {
                if (sshStatus !== 'connected') {
                    setShowSshModal(false);
                    setSshStatus('connected');
                }
                mainCtx.term.write(data);
                // Detectar URL del túnel también del terminal principal
                const urlMatch = String(data).match(/https:\/\/[a-z0-9\-]+\.trycloudflare\.com/);
                if (urlMatch) {
                    setTunnelUrl(urlMatch[0]);
                    setTunnelStale(false);
                    localStorage.setItem('skylab_tunnelUrl', urlMatch[0]);
                }
            });

            socket.on('ssh:error', (err) => {
                mainCtx.term.writeln(`\x1b[1;31m\r\n[SSH ERROR] ${err}\x1b[0m`);
                setSshStatus('error');
            });

            socket.on('ssh:close', () => {
                mainCtx.term.writeln(`\x1b[1;33m\r\n[SSH] Conexión cerrada.\x1b[0m`);
                setSshStatus('idle');
                setShowSshModal(true);
            });

            mainCtx.term.onData((data) => {
                // Usar ref en vez de state para evitar stale-closure (siempre lee el valor actual)
                if (sshStatusRef.current === 'connected') {
                    socket.emit('ssh:data', data);
                }
            });

            // ==========================================
            // Shell 2: Terminal Secundaria (Túnel Logs)
            // ==========================================
            socket.on('tunnel:data', (data) => {
                if (tunnelCtx) tunnelCtx.term.write(data);
                // Detectar URL activa de Cloudflare en los logs
                const urlMatch = String(data).match(/https:\/\/[a-z0-9\-]+\.trycloudflare\.com/);
                if (urlMatch) {
                    setTunnelUrl(urlMatch[0]);
                    setTunnelStale(false);
                    localStorage.setItem('skylab_tunnelUrl', urlMatch[0]);
                }
            });

            if (tunnelCtx) {
                tunnelCtx.term.onData((data) => {
                    if (sshStatus === 'connected') {
                        socket.emit('tunnel:data', data);
                    }
                });
            }

            // Live Espejo: Consola Node.js interceptada
            socket.on('log:node', (data) => {
                if (nodeCtx) nodeCtx.term.write(data);
            });

            socket.on('log:node_asamblea', (data) => {
                // Escribir en la misma terminal con un prefijo o simplemente escribir
                if (nodeCtx) nodeCtx.term.write(`\x1b[1;34m[ASAM] \x1b[0m${data}`);
            });
        }

        return () => {
            socket.disconnect();
            [mainCtx, nodeCtx, tunnelCtx].forEach(ctx => {
                if (ctx) {
                    ctx.resizeObserver.disconnect();
                    ctx.term.dispose();
                }
            });
        };
    }, []); // eslint-disable-next-line react-hooks/exhaustive-deps

    // Acción para lanzar la conexión manual
    const handleConnectSsh = (e) => {
        e.preventDefault();
        if (!socketRef.current || connectionStatus !== 'ONLINE') {
            alert('El servidor WebSocket no está conectado aún.');
            return;
        }
        setSshStatus('connecting');
        setShowSshModal(false); // Escondemos modal optimísticamente

        mainTermRef.current.clear();
        mainTermRef.current.writeln(`\x1b[1;36mConectando a ${sshCredentials.username}@${sshCredentials.host}:${sshCredentials.port}...\x1b[0m`);

        socketRef.current.emit('ssh:connect', {
            host: sshCredentials.host,
            port: parseInt(sshCredentials.port, 10),
            username: sshCredentials.username,
            password: sshCredentials.password
        });
    };

    const handleChange = (e) => {
        setSshCredentials({ ...sshCredentials, [e.target.name]: e.target.value });
    };

    // Acciones de reparación desde el Health Panel
    const handleFixAction = useCallback((action) => {
        if (action === 'reconnect_ssh') { setShowSshModal(true); }
        if (action === 'restart_bot') {
            if (window.confirm('¿Reiniciar el contenedor comercial-bot?')) {
                socketRef.current?.emit('ssh:data', 'sudo docker restart comercial-bot\r');
            }
        }
        if (action === 'restart_asamblea') {
            if (window.confirm('¿Reiniciar el contenedor asamblea-bot?')) {
                socketRef.current?.emit('ssh:data', 'sudo docker restart asamblea-bot\r');
            }
        }
        if (action === 'autopilot') {
            if (window.confirm('¿Lanzar Autopilot? Esto matará túneles viejos e inyectará la nueva URL.')) {
                socketRef.current?.emit('tunnel:autopilot', sshCredentials);
                tunnelTermRef.current?.writeln('\x1b[1;36m[SYS] Enviando orden de Autopilot (Comercial)...\x1b[0m');
            }
        }
        if (action === 'autopilot_asamblea') {
            if (window.confirm('¿Lanzar Autopilot para ASAMBLEA (Puerto 3002)?')) {
                socketRef.current?.emit('tunnel:autopilot:asamblea', sshCredentials);
                tunnelTermRef.current?.writeln('\x1b[1;36m[SYS] Enviando orden de Autopilot (Asamblea)...\x1b[0m');
            }
        }
        if (action === 'force_scan') {
            if (window.confirm('¿Forzar un escaneo de puntos SIISS ahora?')) {
                socketRef.current?.emit('ssh:data', 'sudo docker exec comercial-worker node -e "require(\'/app/src/services/monitor.service\').runMonitor({tipo:\'standard\',zona:null})"\r');
            }
        }
    }, [sshCredentials]);

    // Helpers visuales para Status Bar
    const getStatusColor = () => {
        if (connectionStatus === 'ONLINE') return 'text-green-300';
        if (connectionStatus === 'ERROR') return 'text-red-400 animate-pulse';
        return 'text-yellow-400';
    };

    return (
        <div className="h-full flex flex-col bg-[#111111] text-zinc-300 font-sans overflow-hidden relative">

            {/* ===== MODAL DE CONEXIÓN SSH (MobaXterm Style) ===== */}
            {showSshModal && (
                <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
                    <div className="bg-[#1e1e1e] border border-zinc-700/80 rounded-lg shadow-2xl w-[400px] flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-200">

                        {/* Header Modal */}
                        <div className="bg-[#2d2d2d] border-b border-zinc-700 px-4 py-3 flex items-center gap-3">
                            <Wifi className="w-5 h-5 text-blue-400" />
                            <h3 className="font-semibold text-zinc-200 text-sm">Nueva Sesión SSH</h3>
                            {sshStatus === 'error' && <span className="ml-auto text-xs bg-red-900/50 text-red-300 px-2 py-0.5 rounded border border-red-800/50">Error auth</span>}
                        </div>

                        {/* Body Formulario */}
                        <form onSubmit={handleConnectSsh} className="p-5 flex flex-col gap-4">
                            <div className="flex gap-3">
                                <div className="flex-1 space-y-1.5">
                                    <label className="text-[11px] text-zinc-400 font-medium uppercase tracking-wider">Servidor / IP</label>
                                    <input
                                        type="text" name="host" required
                                        value={sshCredentials.host} onChange={handleChange}
                                        className="w-full bg-[#141414] border border-zinc-800 focus:border-blue-500 rounded px-3 py-1.5 text-sm text-zinc-200 outline-none transition-colors"
                                        placeholder="192.168.x.x"
                                    />
                                </div>
                                <div className="w-20 space-y-1.5">
                                    <label className="text-[11px] text-zinc-400 font-medium uppercase tracking-wider">Puerto</label>
                                    <input
                                        type="number" name="port" required
                                        value={sshCredentials.port} onChange={handleChange}
                                        className="w-full bg-[#141414] border border-zinc-800 focus:border-blue-500 rounded px-3 py-1.5 text-sm text-zinc-200 outline-none transition-colors font-mono"
                                        placeholder="22"
                                    />
                                </div>
                            </div>

                            <div className="space-y-1.5">
                                <label className="text-[11px] text-zinc-400 font-medium uppercase tracking-wider">Usuario (Linux)</label>
                                <input
                                    type="text" name="username" required
                                    value={sshCredentials.username} onChange={handleChange}
                                    className="w-full bg-[#141414] border border-zinc-800 focus:border-blue-500 rounded px-3 py-1.5 text-sm text-zinc-200 outline-none transition-colors"
                                    placeholder="root"
                                />
                            </div>

                            <div className="space-y-1.5 relative">
                                <label className="text-[11px] text-zinc-400 font-medium uppercase tracking-wider">Contraseña</label>
                                <div className="relative">
                                    <KeyRound className="w-4 h-4 text-zinc-500 absolute left-3 top-1/2 -translate-y-1/2" />
                                    <input
                                        type="password" name="password" required
                                        value={sshCredentials.password} onChange={handleChange}
                                        className="w-full bg-[#141414] border border-zinc-800 focus:border-blue-500 rounded pl-9 pr-3 py-1.5 text-sm text-zinc-200 outline-none transition-colors"
                                        placeholder="••••••••"
                                    />
                                </div>
                            </div>

                            <button
                                type="submit"
                                disabled={connectionStatus !== 'ONLINE'}
                                className="mt-4 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 disabled:hover:bg-blue-600 text-white font-medium text-sm py-2 rounded shadow-sm transition-all focus:ring-2 ring-blue-500/50 outline-none"
                            >
                                {connectionStatus !== 'ONLINE' ? 'Socket Desconectado...' : (sshStatus === 'error' ? 'Reintentar Conexión' : 'Conectar Seguramente')}
                            </button>
                        </form>
                    </div>
                </div>
            )}


            {/* Top Bar / Header Tabs */}
            <div className="h-10 flex border-b border-zinc-800/80 bg-[#181818] shrink-0 overflow-x-auto custom-scrollbar relative z-10">
                <div className="px-4 py-2 flex items-center gap-2 bg-[#1e1e1e] border-t-[1px] border-t-blue-400 min-w-max border-r border-zinc-800/50 shadow-sm relative z-10">
                    <TerminalIcon className="w-3.5 h-3.5 text-blue-400" />
                    <span className="text-[12px] font-medium text-zinc-200">Terminal Principal</span>
                    {sshStatus === 'connected' && (
                        <button title="Desconectar SSH" onClick={() => socketRef.current?.emit('ssh:disconnect')} className="ml-2 hover:bg-zinc-800 rounded p-0.5 transition-colors">
                            <X className="w-3 h-3 text-zinc-400 hover:text-red-400" />
                        </button>
                    )}
                </div>
                <div className="px-4 py-2 flex items-center gap-2 text-zinc-500 hover:text-zinc-300 cursor-pointer transition-colors border-r border-zinc-800/20 min-w-max bg-[#181818]">
                    <ShieldAlert className="w-3.5 h-3.5" />
                    <span className="text-[12px] font-medium">Auditoría SecOps</span>
                </div>
                {/* Botón rápido para re-abrir modal si la cerramos manuamente */}
                {!showSshModal && sshStatus !== 'connected' && (
                    <div onClick={() => setShowSshModal(true)} className="px-4 py-2 flex items-center gap-2 text-blue-400 hover:text-blue-300 cursor-pointer transition-colors border-r border-zinc-800/20 min-w-max bg-[#181818] ml-auto">
                        <Wifi className="w-3.5 h-3.5" />
                        <span className="text-[12px] font-medium">Nueva Conexión</span>
                    </div>
                )}
            </div>

            {/* Main Workspace (Split Panes) */}
            <div className="flex-1 bg-[#111111] overflow-hidden">
                <Group orientation="horizontal">
                    {/* Panel 1: Main SSH (Izquierdo) */}
                    <Panel defaultSize={40} minSize={25}>
                        <div className="h-full flex flex-col bg-[#1e1e1e] relative shadow-[4px_0_15px_-3px_rgba(0,0,0,0.5)] z-0">
                            <div className="px-4 py-1.5 flex items-center justify-between text-[10px] uppercase tracking-wider text-zinc-500 font-semibold select-none border-b border-[#2d2d2d] shrink-0 bg-[#1e1e1e]">
                                <span className="flex items-center gap-2"><TerminalIcon className="w-3.5 h-3.5" /> Skylab TTY Segura</span>
                                <span className={`text-[9px] ${sshStatus === 'connected' ? 'text-green-400' : (sshStatus === 'error' ? 'text-red-400' : 'text-zinc-500')}`}>
                                    {sshStatus === 'connected' ? 'SESIÓN ACTIVA' : (sshStatus === 'idle' ? 'ESPERANDO CREDENCIALES' : sshStatus.toUpperCase())}
                                </span>
                            </div>
                            <div className="flex-1 p-2 bg-[#141414] relative" ref={mainRef}>
                                {/* Terminal Inyectado Aquí */}
                            </div>
                        </div>
                    </Panel>

                    <Separator className="w-1 bg-[#2d2d2d] hover:bg-blue-500/50 transition-colors cursor-col-resize z-50" />

                    {/* Panel 2: Herramientas Centrales */}
                    <Panel defaultSize={35} minSize={22}>
                        <div className="h-full flex flex-col bg-[#1e1e1e] relative z-0">

                            {/* ─── Sección Superior: Health Dashboard ─── */}
                            <div className="px-4 py-1.5 flex items-center gap-2 text-[10px] uppercase tracking-wider text-zinc-500 font-semibold select-none border-b border-[#2d2d2d] shrink-0 bg-[#1a1a1a]">
                                <Activity className="w-3.5 h-3.5 text-emerald-400" />
                                Estado del Sistema
                            </div>
                            <div className="flex-[3] min-h-0 overflow-hidden bg-[#141414]">
                                <SystemHealthPanel
                                    sshStatus={sshStatus}
                                    connectionStatus={connectionStatus}
                                    tunnelUrl={tunnelUrl}
                                    tunnelStale={tunnelStale}
                                    onFixAction={handleFixAction}
                                />
                            </div>

                            {/* ─── Divisor ─── */}
                            <div className="px-4 py-1.5 flex items-center gap-2 text-[10px] uppercase tracking-wider text-zinc-500 font-semibold select-none border-y border-[#2d2d2d] shrink-0 bg-[#1a1a1a]">
                                <Database className="w-3.5 h-3.5" />
                                Operaciones
                            </div>

                            {/* ─── Sección Inferior: Macros ─── */}
                            <div className="flex-[2] min-h-0 p-3 bg-[#141414] overflow-y-auto custom-scrollbar space-y-4">

                                {/* EJECUCIÓN RÁPIDA (QUICK EXEC) */}
                                <div>
                                    <p className="text-[9px] text-zinc-600 uppercase tracking-widest font-semibold pb-1 border-b border-zinc-800 mb-2">Comando Libre (Background)</p>
                                    <form onSubmit={(e) => {
                                        e.preventDefault();
                                        const cmd = e.target.elements.quickCmd.value;
                                        if (cmd.trim()) {
                                            socketRef.current?.emit('ssh:quick_exec', cmd);
                                            e.target.reset();
                                        }
                                    }} className="flex gap-2">
                                        <input
                                            name="quickCmd"
                                            disabled={sshStatus !== 'connected'}
                                            placeholder="ej: cloudflared tunnel --url http://192.168.x.x:3001"
                                            className="flex-1 min-w-0 bg-[#1e1e1e] border border-zinc-700 focus:border-blue-500 rounded px-2 text-[10px] text-zinc-200 outline-none transition-colors font-mono"
                                        />
                                        <button
                                            disabled={sshStatus !== 'connected'}
                                            type="submit"
                                            className="bg-blue-600 hover:bg-blue-500 text-white px-3 py-1.5 rounded text-[10px] font-medium transition-colors disabled:opacity-50 shrink-0 shadow-sm"
                                        >
                                            <Play className="w-3 h-3 inline-block -mt-0.5 mr-1" />
                                            Ejecutar
                                        </button>
                                    </form>
                                    <p className="text-[8px] text-zinc-500 mt-1.5 leading-tight">La terminal no se bloqueará. Salida dirigida a <span className="text-purple-400 font-semibold">TUNNEL LOGS</span> ↘</p>
                                </div>

                                {/* DIAGNÓSTICO */}
                                <div>
                                    <p className="text-[9px] text-zinc-600 uppercase tracking-widest font-semibold pb-1 border-b border-zinc-800 mb-2">Diagnóstico del Servidor</p>
                                    <div className="grid grid-cols-2 gap-2">
                                        <button
                                            onClick={() => socketRef.current?.emit('ssh:data', 'uptime\r')}
                                            disabled={sshStatus !== 'connected'}
                                            title="Muestra cuánto tiempo lleva encendido el servidor y la carga actual de CPU"
                                            className="flex flex-col items-center justify-center gap-1 p-2.5 bg-[#1e1e1e] border border-zinc-800 rounded-md hover:bg-zinc-800 transition-colors disabled:opacity-50 disabled:cursor-not-allowed group">
                                            <Activity className="w-4 h-4 text-blue-400 group-hover:text-blue-300" />
                                            <span className="text-[10px] text-zinc-400 font-medium group-hover:text-zinc-200">Uptime</span>
                                            <span className="text-[8px] text-zinc-600 group-hover:text-zinc-500">Tiempo activo y carga</span>
                                        </button>

                                        <button
                                            onClick={() => socketRef.current?.emit('ssh:data', 'free -h\r')}
                                            disabled={sshStatus !== 'connected'}
                                            title="Muestra cuánta memoria RAM está disponible y usada en el servidor"
                                            className="flex flex-col items-center justify-center gap-1 p-2.5 bg-[#1e1e1e] border border-zinc-800 rounded-md hover:bg-zinc-800 transition-colors disabled:opacity-50 disabled:cursor-not-allowed group">
                                            <Cpu className="w-4 h-4 text-emerald-400 group-hover:text-emerald-300" />
                                            <span className="text-[10px] text-zinc-400 font-medium group-hover:text-zinc-200">Memoria RAM</span>
                                            <span className="text-[8px] text-zinc-600 group-hover:text-zinc-500">Uso actual de memoria</span>
                                        </button>

                                        <button
                                            onClick={() => socketRef.current?.emit('ssh:data', 'df -h /\r')}
                                            disabled={sshStatus !== 'connected'}
                                            title="Muestra cuánto espacio en disco queda disponible"
                                            className="flex flex-col items-center justify-center gap-1 p-2.5 bg-[#1e1e1e] border border-zinc-800 rounded-md hover:bg-zinc-800 transition-colors disabled:opacity-50 disabled:cursor-not-allowed group">
                                            <HardDrive className="w-4 h-4 text-cyan-400 group-hover:text-cyan-300" />
                                            <span className="text-[10px] text-zinc-400 font-medium group-hover:text-zinc-200">Disco</span>
                                            <span className="text-[8px] text-zinc-600 group-hover:text-zinc-500">Espacio disponible</span>
                                        </button>

                                        <button
                                            onClick={() => socketRef.current?.emit('ssh:data', 'sudo docker ps -a\r')}
                                            disabled={sshStatus !== 'connected'}
                                            title="Lista todos los contenedores Docker (activos y detenidos) con su estado"
                                            className="flex flex-col items-center justify-center gap-1 p-2.5 bg-[#1e1e1e] border border-zinc-800 rounded-md hover:bg-zinc-800 transition-colors disabled:opacity-50 disabled:cursor-not-allowed group">
                                            <Server className="w-4 h-4 text-violet-400 group-hover:text-violet-300" />
                                            <span className="text-[10px] text-zinc-400 font-medium group-hover:text-zinc-200">Contenedores</span>
                                            <span className="text-[8px] text-zinc-600 group-hover:text-zinc-500">Estado de Docker</span>
                                        </button>
                                    </div>
                                </div>

                                {/* ACTUALIZAR SISTEMA */}
                                <div>
                                    <p className="text-[9px] text-zinc-600 uppercase tracking-widest font-semibold pb-1 border-b border-zinc-800 mb-2">Actualizar Sistema</p>
                                    <div className="space-y-2">
                                        <button
                                            onClick={() => socketRef.current?.emit('ssh:data', 'cd ~/Bot_comercial/Bot_comercial && sudo git pull origin main\r')}
                                            disabled={sshStatus !== 'connected'}
                                            title="Descarga el código más reciente del repositorio GitHub sin reiniciar nada aún"
                                            className="w-full flex items-center gap-3 p-2.5 bg-[#1e1e1e] border border-zinc-800 rounded-md hover:bg-zinc-800 transition-colors disabled:opacity-50 disabled:cursor-not-allowed group">
                                            <RefreshCw className="w-4 h-4 text-sky-400 group-hover:text-sky-300 shrink-0" />
                                            <div className="text-left">
                                                <p className="text-[10px] text-zinc-300 font-medium group-hover:text-white">Git Pull (actualizar código)</p>
                                                <p className="text-[8px] text-zinc-600 group-hover:text-zinc-500">Descarga cambios de GitHub</p>
                                            </div>
                                        </button>

                                        <button
                                            onClick={() => { if (window.confirm('¿Reiniciar el bot con el nuevo código? Dejará de responder ~30 segundos.')) socketRef.current?.emit('ssh:data', 'cd ~/Bot_comercial/Bot_comercial && sudo git pull origin main && sudo docker compose restart comercial-bot\r') }}
                                            disabled={sshStatus !== 'connected'}
                                            title="Descarga el código nuevo de GitHub Y reinicia el contenedor del bot para aplicarlo"
                                            className="w-full flex items-center gap-3 p-2.5 bg-[#1e1e1e] border border-sky-900/40 rounded-md hover:bg-sky-900/20 transition-colors disabled:opacity-50 disabled:cursor-not-allowed group">
                                            <Play className="w-4 h-4 text-sky-400 group-hover:text-sky-300 shrink-0" />
                                            <div className="text-left">
                                                <p className="text-[10px] text-sky-400 font-medium group-hover:text-sky-300">Pull + Aplicar Cambios</p>
                                                <p className="text-[8px] text-zinc-600 group-hover:text-zinc-500">Git pull y reinicia el bot (~30s sin servicio)</p>
                                            </div>
                                        </button>
                                    </div>
                                </div>

                                {/* LOGS */}
                                <div>
                                    <p className="text-[9px] text-zinc-600 uppercase tracking-widest font-semibold pb-1 border-b border-zinc-800 mb-2">Logs en Tiempo Real</p>
                                    <div className="space-y-2">
                                        <button
                                            onClick={() => socketRef.current?.emit('ssh:data', 'sudo docker logs -f --tail 100 comercial-bot\r')}
                                            disabled={sshStatus !== 'connected'}
                                            title="Muestra los últimos 100 mensajes del bot y transmite los nuevos en tiempo real"
                                            className="w-full flex items-center gap-3 p-2.5 bg-[#1e1e1e] border border-zinc-800 rounded-md hover:bg-zinc-800 transition-colors disabled:opacity-50 disabled:cursor-not-allowed group">
                                            <TextSearch className="w-4 h-4 text-yellow-400 group-hover:text-yellow-300 shrink-0" />
                                            <div className="text-left">
                                                <p className="text-[10px] text-zinc-300 font-medium group-hover:text-white">Logs del Bot</p>
                                                <p className="text-[8px] text-zinc-600 group-hover:text-zinc-500">Últimas 100 líneas + stream live</p>
                                            </div>
                                        </button>

                                        <button
                                            onClick={() => socketRef.current?.emit('ssh:data', 'sudo docker logs -f --tail 50 comercial-worker\r')}
                                            disabled={sshStatus !== 'connected'}
                                            title="Muestra los logs del worker que ejecuta escaneos de puntos y procesa colas"
                                            className="w-full flex items-center gap-3 p-2.5 bg-[#1e1e1e] border border-zinc-800 rounded-md hover:bg-zinc-800 transition-colors disabled:opacity-50 disabled:cursor-not-allowed group">
                                            <TextSearch className="w-4 h-4 text-orange-400 group-hover:text-orange-300 shrink-0" />
                                            <div className="text-left">
                                                <p className="text-[10px] text-zinc-300 font-medium group-hover:text-white">Logs del Worker</p>
                                                <p className="text-[8px] text-zinc-600 group-hover:text-zinc-500">Escaneos SIISS y cola de mensajes</p>
                                            </div>
                                        </button>

                                        <button
                                            onClick={() => socketRef.current?.emit('ssh:data', 'clear\r')}
                                            disabled={sshStatus !== 'connected'}
                                            title="Limpia la pantalla del terminal SSH para ver mejor"
                                            className="w-full flex items-center gap-3 p-2.5 bg-[#1e1e1e] border border-zinc-800 rounded-md hover:bg-zinc-800 transition-colors disabled:opacity-50 disabled:cursor-not-allowed group">
                                            <Trash2 className="w-4 h-4 text-zinc-500 group-hover:text-zinc-400 shrink-0" />
                                            <div className="text-left">
                                                <p className="text-[10px] text-zinc-400 font-medium group-hover:text-zinc-200">Limpiar Terminal</p>
                                                <p className="text-[8px] text-zinc-600 group-hover:text-zinc-500">Borra el historial visible del TTY</p>
                                            </div>
                                        </button>

                                        <button
                                            onClick={() => socketRef.current?.emit('ssh:data', `sudo docker exec comercial-bot node -e "require('dns').setDefaultResultOrder('ipv4first'); const {GoogleGenerativeAI}=require('@google/generative-ai'); new GoogleGenerativeAI(process.env.GEMINI_API_KEY).getGenerativeModel({model:'gemini-1.5-flash'}).generateContent('pong').then(r=>console.log('OK IA:',r.response.text().trim())).catch(e=>console.error('FALLO IA:',e.message))"\r`)}
                                            disabled={sshStatus !== 'connected'}
                                            title="Lanza un prompt mínimo a Gemini 1.5 Flash desde dentro del contenedor y muestra si responde"
                                            className="w-full flex items-center gap-3 p-2.5 bg-[#1e1e1e] border border-violet-900/40 rounded-md hover:bg-violet-900/20 transition-colors disabled:opacity-50 disabled:cursor-not-allowed group">
                                            <Sparkles className="w-4 h-4 text-violet-400 group-hover:text-violet-300 shrink-0" />
                                            <div className="text-left">
                                                <p className="text-[10px] text-violet-300 font-medium group-hover:text-violet-200">Test IA (Gemini)</p>
                                                <p className="text-[8px] text-zinc-600 group-hover:text-zinc-500">Prueba Gemini 1.5 Flash desde el contenedor</p>
                                            </div>
                                        </button>
                                    </div>
                                </div>

                                {/* DEPLOY BOT ASAMBLEA */}
                                <div>
                                    <p className="text-[9px] text-indigo-500 uppercase tracking-widest font-semibold pb-1 border-b border-indigo-900/40 mb-2 flex items-center gap-1.5">
                                        <span className="w-1.5 h-1.5 rounded-full bg-indigo-400 inline-block"></span>
                                        Bot Asamblea (Puerto 3002)
                                    </p>
                                    <div className="space-y-2">
                                        <button
                                            onClick={() => socketRef.current?.emit('ssh:data', 'sudo docker logs -f --tail 80 asamblea-bot\r')}
                                            disabled={sshStatus !== 'connected'}
                                            title="Logs en tiempo real del bot de Asamblea"
                                            className="w-full flex items-center gap-3 p-2.5 bg-[#1e1e1e] border border-zinc-800 rounded-md hover:bg-zinc-800 transition-colors disabled:opacity-50 disabled:cursor-not-allowed group">
                                            <TextSearch className="w-4 h-4 text-indigo-400 group-hover:text-indigo-300 shrink-0" />
                                            <div className="text-left">
                                                <p className="text-[10px] text-zinc-300 font-medium group-hover:text-white">Logs Asamblea (live)</p>
                                                <p className="text-[8px] text-zinc-600 group-hover:text-zinc-500">Últimas 80 líneas + stream en tiempo real</p>
                                            </div>
                                        </button>

                                        <button
                                            onClick={() => socketRef.current?.emit('ssh:data', 'sudo docker logs -f --tail 50 asamblea-worker\r')}
                                            disabled={sshStatus !== 'connected'}
                                            title="Logs en tiempo real del worker de Asamblea"
                                            className="w-full flex items-center gap-3 p-2.5 bg-[#1e1e1e] border border-zinc-800 rounded-md hover:bg-zinc-800 transition-colors disabled:opacity-50 disabled:cursor-not-allowed group">
                                            <TextSearch className="w-4 h-4 text-indigo-300/70 group-hover:text-indigo-300 shrink-0" />
                                            <div className="text-left">
                                                <p className="text-[10px] text-zinc-300 font-medium group-hover:text-white">Logs Worker Asamblea</p>
                                                <p className="text-[8px] text-zinc-600 group-hover:text-zinc-500">Cola Supabase y sesiones activas</p>
                                            </div>
                                        </button>

                                        <button
                                            onClick={() => socketRef.current?.emit('ssh:data', 'cd ~/Bot_comercial/Bot_comercial && sudo git pull origin main\r')}
                                            disabled={sshStatus !== 'connected'}
                                            title="Descarga el código más reciente del repositorio (incluyendo cambios de Asamblea)"
                                            className="w-full flex items-center gap-3 p-2.5 bg-[#1e1e1e] border border-zinc-800 rounded-md hover:bg-zinc-800 transition-colors disabled:opacity-50 disabled:cursor-not-allowed group">
                                            <RefreshCw className="w-4 h-4 text-indigo-400 group-hover:text-indigo-300 shrink-0" />
                                            <div className="text-left">
                                                <p className="text-[10px] text-zinc-300 font-medium group-hover:text-white">Git Pull (Asamblea)</p>
                                                <p className="text-[8px] text-zinc-600 group-hover:text-zinc-500">Descarga cambios del repo global</p>
                                            </div>
                                        </button>

                                        <button
                                            onClick={() => { if (window.confirm('¿Aplicar cambios al Bot Asamblea? Estará ~30s sin servicio.')) socketRef.current?.emit('ssh:data', 'cd ~/Bot_comercial/Bot_comercial && sudo git pull origin main && cd Asamblea && sudo docker compose restart\r') }}
                                            disabled={sshStatus !== 'connected'}
                                            title="Pull + reinicio del bot Asamblea para aplicar los últimos cambios"
                                            className="w-full flex items-center gap-3 p-2.5 bg-[#1e1e1e] border border-indigo-900/40 rounded-md hover:bg-indigo-900/20 transition-colors disabled:opacity-50 disabled:cursor-not-allowed group">
                                            <Play className="w-4 h-4 text-indigo-400 group-hover:text-indigo-300 shrink-0" />
                                            <div className="text-left">
                                                <p className="text-[10px] text-indigo-400 font-medium group-hover:text-indigo-300">Pull + Aplicar (Asamblea)</p>
                                                <p className="text-[8px] text-zinc-600 group-hover:text-zinc-500">Git pull y reinicia asamblea-bot y worker</p>
                                            </div>
                                        </button>

                                        <button
                                            onClick={() => { if (window.confirm('¿Reiniciar solo el contenedor asamblea-bot? ~30s sin servicio.')) socketRef.current?.emit('ssh:data', 'sudo docker restart asamblea-bot asamblea-worker\r') }}
                                            disabled={sshStatus !== 'connected'}
                                            className="w-full flex items-center gap-3 p-2 bg-red-950/20 border border-red-900/30 rounded-md hover:bg-red-900/30 transition-colors disabled:opacity-50 disabled:cursor-not-allowed group">
                                            <RefreshCw className="w-3.5 h-3.5 text-red-400/70 shrink-0" />
                                            <div className="text-left">
                                                <p className="text-[10px] text-red-400/80 font-semibold group-hover:text-red-300">Reiniciar Asamblea (Docker)</p>
                                                <p className="text-[8px] text-red-900 group-hover:text-red-800">Reinicia bot + worker de Asamblea</p>
                                            </div>
                                        </button>
                                    </div>
                                </div>

                                {/* TÚNEL */}

                                <div>
                                    <p className="text-[9px] text-zinc-600 uppercase tracking-widest font-semibold pb-1 border-b border-zinc-800 mb-2">Túnel Cloudflare</p>
                                    <button
                                        title="Mata el túnel actual y lanza uno nuevo. La URL aparece en Tunnel Logs. Luego debes actualizarla en Meta."
                                        onClick={() => socketRef.current?.emit('tunnel:data', 'pkill cloudflared 2>/dev/null; sleep 1; cloudflared tunnel --url http://localhost:3001\r')}
                                        disabled={sshStatus !== 'connected'}
                                        className="w-full flex items-center gap-3 p-2.5 bg-[#1e1e1e] border border-purple-900/40 rounded-md hover:bg-purple-900/20 transition-colors disabled:opacity-50 disabled:cursor-not-allowed group">
                                        <Wifi className="w-4 h-4 text-purple-400 group-hover:text-purple-300 shrink-0" />
                                        <div className="text-left">
                                            <p className="text-[10px] text-purple-400 font-medium group-hover:text-purple-300">↺ Reiniciar Túnel</p>
                                            <p className="text-[8px] text-zinc-600 group-hover:text-zinc-500">Nueva URL en Tunnel Logs → actualizar en Meta</p>
                                        </div>
                                    </button>
                                </div>

                                {/* DANGER ZONE */}
                                <div>
                                    <p className="text-[9px] text-red-900 uppercase tracking-widest font-semibold pb-1 border-b border-red-900/40 mb-2">⚠ Zona de Riesgo</p>
                                    <div className="space-y-2">
                                        <button
                                            onClick={() => { if (window.confirm('¿Reiniciar el contenedor del bot? Dejará de responder mensajes durante ~30 segundos hasta que Docker lo reinicie.')) socketRef.current?.emit('ssh:data', 'sudo docker restart comercial-bot\r') }}
                                            disabled={sshStatus !== 'connected'}
                                            className="w-full flex items-center gap-3 p-2 bg-red-950/30 border border-red-900/50 rounded-md hover:bg-red-900/50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed group">
                                            <RefreshCw className="w-3.5 h-3.5 text-red-400 shrink-0" />
                                            <div className="text-left">
                                                <p className="text-[10px] text-red-400 font-semibold group-hover:text-red-300">Reiniciar Bot (Docker)</p>
                                                <p className="text-[8px] text-red-900 group-hover:text-red-800">El bot deja de responder ~30s</p>
                                            </div>
                                        </button>

                                        <button
                                            onClick={() => { if (window.confirm('¿Reiniciar TODOS los contenedores? El bot dejará de responder hasta que Docker los levante (~60s).')) socketRef.current?.emit('ssh:data', 'cd ~/Bot_comercial/Bot_comercial && sudo docker compose restart\r') }}
                                            disabled={sshStatus !== 'connected'}
                                            className="w-full flex items-center gap-3 p-2 bg-red-950/30 border border-red-900/50 rounded-md hover:bg-red-900/50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed group">
                                            <Server className="w-3.5 h-3.5 text-red-400 shrink-0" />
                                            <div className="text-left">
                                                <p className="text-[10px] text-red-400 font-semibold group-hover:text-red-300">Reiniciar Todo (Docker Compose)</p>
                                                <p className="text-[8px] text-red-900 group-hover:text-red-800">Reinicia bot + worker (~60s sin servicio)</p>
                                            </div>
                                        </button>
                                    </div>
                                </div>

                            </div>
                        </div>
                    </Panel>

                    <Separator className="w-1 bg-[#2d2d2d] border-l border-[#1a1a1a] hover:bg-blue-500/50 transition-colors cursor-col-resize z-50" />

                    {/* Panel 3: Logs y Túneles (Derecho) */}
                    <Panel defaultSize={25} minSize={15}>
                        <Group orientation="vertical">
                            {/* Top Right: Node Logs */}
                            <Panel defaultSize={50} minSize={20}>
                                <div className="h-full flex flex-col bg-[#1e1e1e]">
                                    <div className="px-4 py-1.5 flex items-center justify-between text-[10px] uppercase tracking-wider text-zinc-500 font-semibold select-none border-b border-[#2d2d2d] shrink-0 bg-[#1e1e1e]">
                                        <span className="flex items-center gap-2"><Server className="w-3.5 h-3.5" /> NODE.JS LIVE</span>
                                        <div className="flex gap-1.5">
                                            <span className={`w-2.5 h-2.5 rounded-full ${connectionStatus === 'ONLINE' ? 'bg-[#89d185] border-green-400 animate-pulse' : 'bg-zinc-800 border-zinc-700'} border`}></span>
                                        </div>
                                    </div>
                                    <div className="flex-1 p-2 bg-[#141414]" ref={nodeRef}></div>
                                </div>
                            </Panel>

                            <Separator className="h-1 bg-[#2d2d2d] border-y border-[#1a1a1a] hover:bg-blue-500/50 transition-colors cursor-row-resize z-50" />

                            {/* Bottom Right: Tunnel Logs */}
                            <Panel defaultSize={50} minSize={20}>
                                <div className="h-full flex flex-col bg-[#1e1e1e]">
                                    <div className="px-4 py-1.5 flex items-center justify-between text-[10px] uppercase tracking-wider text-zinc-500 font-semibold select-none border-b border-[#2d2d2d] shrink-0 bg-[#1e1e1e]">
                                        <div className="flex items-center gap-3">
                                            <span className="flex items-center gap-2"><Webhook className="w-3.5 h-3.5" /> TUNNEL LOGS</span>
                                            {sshStatus === 'connected' && (
                                                <button
                                                    type="button"
                                                    onClick={() => {
                                                        if (window.confirm('¿Lanzar Autopilot? Esto matará túneles viejos e inyectará la nueva URL de Cloudflare en tu Docker automáticamente.')) {
                                                            socketRef.current.emit('tunnel:autopilot', sshCredentials);
                                                            tunnelTermRef.current?.writeln('\x1b[1;36m[SYS] Enviando orden de Autopilot al Backend...\x1b[0m');
                                                        }
                                                    }}
                                                    className="bg-purple-600/20 hover:bg-purple-600/40 text-[#c586c0] text-[9px] px-2 py-0.5 rounded border border-purple-500/30 transition-colors flex items-center gap-1 cursor-pointer"
                                                >
                                                    🚀 Smart Autopilot (Comercial)
                                                </button>
                                            )}
                                            {sshStatus === 'connected' && (
                                                <button
                                                    type="button"
                                                    onClick={() => {
                                                        if (window.confirm('¿Lanzar Autopilot para ASAMBLEA? Esto matará túneles viejos del puerto 3002 e inyectará la nueva URL.')) {
                                                            socketRef.current.emit('tunnel:autopilot:asamblea', sshCredentials);
                                                            tunnelTermRef.current?.writeln('\x1b[1;36m[SYS] Enviando orden de Autopilot ASAMBLEA...\x1b[0m');
                                                        }
                                                    }}
                                                    className="bg-indigo-600/20 hover:bg-indigo-600/40 text-indigo-400 text-[9px] px-2 py-0.5 rounded border border-indigo-500/30 transition-colors flex items-center gap-1 cursor-pointer"
                                                >
                                                    🚀 Smart Autopilot (Asamblea)
                                                </button>
                                            )}
                                        </div>
                                        <div className="flex gap-1.5">
                                            <span className={`w-2.5 h-2.5 rounded-full ${connectionStatus === 'ONLINE' ? 'bg-[#4fc1ff] border-cyan-400 animate-pulse' : 'bg-zinc-800 border-zinc-700'} border`}></span>
                                        </div>
                                    </div>
                                    <div className="flex-1 p-2 bg-[#141414]" ref={tunnelRef}></div>
                                </div>
                            </Panel>
                        </Group>
                    </Panel>
                </Group>
            </div>

            {/* VS Code Style Status Bar - DARK THEME */}
            <div className="h-6 flex text-[11px] bg-[#181818] border-t border-zinc-800/80 text-zinc-400 shrink-0 items-center px-4 justify-between font-sans shadow-inner z-10">
                <div className="flex items-center gap-5 overflow-hidden">

                    <div onClick={() => !showSshModal && setShowSshModal(true)} className={`flex items-center gap-1.5 ${sshStatus === 'connected' ? 'bg-[#007acc]/20 text-[#3b8eea] hover:bg-[#007acc]/30' : 'hover:bg-white/5'} px-2 h-full cursor-pointer transition-colors`}>
                        <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="m7 11 2-2-2-2" /><path d="M11 13h4" /><rect width="18" height="18" x="3" y="3" rx="2" ry="2" /></svg>
                        <span className="font-medium">SSH: {sshStatus === 'connected' ? sshCredentials.host : 'Desconectado'}</span>
                    </div>

                    <div className="flex items-center gap-1.5 cursor-pointer hover:bg-white/5 px-2 h-full transition-colors whitespace-nowrap">
                        <Server className="w-3 h-3 text-[#23d18b]" />
                        <span>Socket: <span className={`font-bold text-[10px] tracking-wide ${getStatusColor()}`}>{connectionStatus}</span></span>
                    </div>

                    {/* Metrics */}
                    <div className="flex items-center gap-1.5 cursor-pointer hover:bg-white/5 px-2 h-full transition-colors whitespace-nowrap ml-2">
                        <Cpu className="w-3 h-3 text-zinc-500" />
                        <span className="text-[10px] text-zinc-500">{cpuUsage}</span>
                    </div>

                    <div className="flex items-center gap-1.5 cursor-pointer hover:bg-white/5 px-2 h-full transition-colors whitespace-nowrap">
                        <HardDrive className="w-3 h-3 text-zinc-500" />
                        <span className="text-[10px] text-zinc-500">{ramUsage}</span>
                    </div>
                </div>

                <div className="flex items-center h-full">
                    <span className="hover:bg-white/5 px-3 h-full flex items-center cursor-pointer transition-colors border-l border-zinc-800 text-[#3b8eea] text-[10px] font-medium">BASH</span>
                </div>
            </div>

        </div>
    );
}
