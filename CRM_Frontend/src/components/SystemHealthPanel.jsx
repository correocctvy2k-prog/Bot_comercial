import { useEffect, useState, useCallback } from 'react';
import {
    Server, Wifi, Bot, MessageCircle, Phone,
    Database, Activity, Radar, RefreshCw, CheckCircle2,
    XCircle, AlertCircle, Clock, Sparkles
} from 'lucide-react';

/* ══════════════════════════════════════════════════════════════
   SystemHealthPanel — Panel de salud del sistema en tiempo real
   Se auto-refresca cada 30 segundos desde /api/health
   ══════════════════════════════════════════════════════════════ */

const BACKEND = import.meta.env.VITE_BACKEND_URL || 'http://localhost:3001';

// Definición estática de los 8 componentes del sistema
const SERVICE_DEFS = [
    {
        key: 'ssh',
        label: 'Servidor Ubuntu',
        icon: Server,
        color: 'text-blue-400',
        source: 'prop',       // estado derivado de prop (sshStatus)
        description: 'Conexión SSH al servidor de producción',
        fixAction: 'reconnect_ssh',
    },
    {
        key: 'socket',
        label: 'Socket Backend',
        icon: Wifi,
        color: 'text-cyan-400',
        source: 'prop',       // estado derivado de prop (connectionStatus)
        description: 'WebSocket en tiempo real con el servidor Node.js',
    },
    {
        key: 'tunnel',
        label: 'Túnel Cloudflare',
        icon: Activity,
        color: 'text-purple-400',
        source: 'prop',       // derivado de tunnelUrl
        description: 'Túnel público de Cloudflare para webhooks de Meta',
        fixAction: 'autopilot',
    },
    {
        key: 'bot',
        label: 'Bot Comercial',
        icon: Bot,
        color: 'text-emerald-400',
        source: 'prop',       // derivado de estado del socket (si socket OK → bot ok)
        description: 'Contenedor Docker del bot comercial (WhatsApp/Telegram)',
        fixAction: 'restart_bot',
    },
    {
        key: 'bot_asamblea',
        label: 'Bot Asamblea',
        icon: MessageCircle,
        color: 'text-indigo-400',
        source: 'api',        // se verifica vía /api/health del backend 3001 o directo al 3002
        description: 'Contenedor Docker del bot de Asamblea 2026',
        fixAction: 'restart_asamblea',
    },
    {
        key: 'monitor',
        label: 'Sincronización SIISS',
        icon: Radar,
        color: 'text-yellow-400',
        source: 'api',
        description: 'Estado de conexión con el servidor SIISS y censo quorum',
        fixAction: 'force_scan',
    },
    {
        key: 'telegram',
        label: 'Telegram API',
        icon: MessageCircle,
        color: 'text-sky-400',
        source: 'api',
        description: 'Conectividad con la API de Telegram Bot',
    },
    {
        key: 'whatsapp',
        label: 'WhatsApp Meta',
        icon: Phone,
        color: 'text-green-400',
        source: 'api',
        description: 'API Graph de Meta para mensajes de WhatsApp',
    },
    {
        key: 'supabase',
        label: 'Supabase DB',
        icon: Database,
        color: 'text-orange-400',
        source: 'api',
        description: 'Base de datos y backend Supabase',
    },
    {
        key: 'ai',
        label: 'Gemini AI',
        icon: Sparkles,
        color: 'text-violet-400',
        source: 'api',
        description: 'API de Inteligencia Artificial de Google',
    },
];

function StatusDot({ ok, loading }) {
    if (loading) return (
        <span className="inline-block w-2 h-2 rounded-full bg-zinc-600 animate-pulse" />
    );
    if (ok === true) return (
        <span className="inline-block w-2 h-2 rounded-full bg-emerald-400 shadow-[0_0_5px_#34d399]" />
    );
    if (ok === 'warn') return (
        <span className="inline-block w-2 h-2 rounded-full bg-yellow-400 shadow-[0_0_5px_#facc15]" />
    );
    if (ok === false) return (
        <span className="inline-block w-2 h-2 rounded-full bg-red-500 animate-pulse shadow-[0_0_5px_#ef4444]" />
    );
    return <span className="inline-block w-2 h-2 rounded-full bg-zinc-600" />;
}

function StatusBadge({ ok, loading }) {
    if (loading) return <span className="text-[9px] text-zinc-500 font-mono">—</span>;
    if (ok === true) return <span className="text-[9px] text-emerald-400 font-semibold font-mono">OK</span>;
    if (ok === 'warn') return <span className="text-[9px] text-yellow-400 font-semibold font-mono">CAC&Eacute;</span>;
    return <span className="text-[9px] text-red-400 font-semibold font-mono animate-pulse">FALLO</span>;
}

export default function SystemHealthPanel({
    sshStatus,          // 'connected' | 'idle' | 'error' | 'connecting'
    connectionStatus,   // 'ONLINE' | 'OFFLINE' | 'ERROR'
    tunnelUrl,          // string | null
    tunnelStale,        // true = URL de sesión anterior (localStorage), false = URL confirmada en sesión actual
    onFixAction,        // (action) => void
}) {
    const [apiChecks, setApiChecks] = useState({});
    const [loading, setLoading] = useState(true);
    const [lastFetch, setLastFetch] = useState(null);

    const fetchHealth = useCallback(async () => {
        setLoading(true);
        try {
            const r = await fetch(`${BACKEND}/api/health`, { signal: AbortSignal.timeout(8000) });
            const data = await r.json();
            setApiChecks(data.checks || {});
            setLastFetch(new Date(data.timestamp || Date.now()));
        } catch {
            // No limpiar los checks anteriores si falla — mejor mantener el último estado
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchHealth();
        const interval = setInterval(fetchHealth, 30_000);
        return () => clearInterval(interval);
    }, [fetchHealth]);

    // Resolver estado de cada servicio
    function resolveStatus(def) {
        if (def.source === 'prop') {
            if (def.key === 'ssh') return { ok: sshStatus === 'connected', detail: sshStatus === 'connected' ? 'Sesión activa' : sshStatus === 'connecting' ? 'Conectando...' : 'Desconectado' };
            if (def.key === 'socket') return { ok: connectionStatus === 'ONLINE', detail: connectionStatus };
            if (def.key === 'tunnel') {
                if (!tunnelUrl) return { ok: false, detail: 'Sin túnal activo' };
                const shortUrl = tunnelUrl.replace('https://', '').slice(0, 28) + '...';
                if (tunnelStale) return { ok: 'warn', detail: shortUrl }; // URL conocida, sesión anterior
                return { ok: true, detail: shortUrl }; // URL confirmada esta sesión
            }
            if (def.key === 'bot') return { ok: connectionStatus === 'ONLINE', detail: connectionStatus === 'ONLINE' ? 'Contenedor activo' : 'Sin respuesta' };
        }
        if (def.source === 'api') {
            const c = apiChecks[def.key];
            if (!c) return { ok: null, detail: 'Verificando...' };
            return { ok: c.ok, detail: c.detail };
        }
        return { ok: null, detail: '—' };
    }

    const overallOk = SERVICE_DEFS.every(d => {
        const { ok } = resolveStatus(d);
        return ok !== false; // 'warn' y null no cuentan como fallo total
    });

    return (
        <div className="flex flex-col h-full select-none">
            {/* Header */}
            <div className="flex items-center justify-between px-3 py-2 border-b border-zinc-800">
                <div className="flex items-center gap-2">
                    {overallOk
                        ? <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                        : <XCircle className="w-3.5 h-3.5 text-red-400 animate-pulse" />
                    }
                    <span className="text-[10px] uppercase tracking-wider font-bold text-zinc-400">
                        Estado del Sistema
                    </span>
                </div>
                <div className="flex items-center gap-2">
                    {lastFetch && (
                        <span className="text-[9px] text-zinc-600 flex items-center gap-1">
                            <Clock className="w-2.5 h-2.5" />
                            {lastFetch.toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                        </span>
                    )}
                    <button
                        onClick={fetchHealth}
                        disabled={loading}
                        title="Refrescar estado"
                        className="p-1 rounded hover:bg-zinc-700 transition-colors text-zinc-500 hover:text-zinc-300 disabled:opacity-40"
                    >
                        <RefreshCw className={`w-3 h-3 ${loading ? 'animate-spin' : ''}`} />
                    </button>
                </div>
            </div>

            {/* Service list */}
            <div className="flex-1 overflow-y-auto custom-scrollbar divide-y divide-zinc-800/60">
                {SERVICE_DEFS.map(def => {
                    const { ok, detail } = resolveStatus(def);
                    const Icon = def.icon;
                    const isLoading = loading && def.source === 'api' && ok === null;

                    // ── Acción contextual por servicio ──
                    let actionEl = null;

                    // WhatsApp: si el túnel está activo, siempre mostrar el link a Meta (aunque ok o no)
                    if (def.key === 'whatsapp' && tunnelUrl) {
                        actionEl = (
                            <a
                                href="https://developers.facebook.com/apps"
                                target="_blank"
                                rel="noreferrer"
                                title={`Actualiza el webhook de WhatsApp en Meta con la URL: ${tunnelUrl}/webhook`}
                                className="shrink-0 text-[9px] px-1.5 py-0.5 rounded border border-green-800/60 text-green-500 hover:border-green-500 hover:text-green-300 transition-colors whitespace-nowrap"
                            >
                                → Actualizar en Meta
                            </a>
                        );
                    } else if (ok === false && def.fixAction) {
                        // Fix genérico para otros servicios
                        actionEl = (
                            <button
                                onClick={() => onFixAction?.(def.fixAction)}
                                className="shrink-0 text-[9px] px-1.5 py-0.5 rounded border border-zinc-700 text-zinc-400 hover:border-blue-500 hover:text-blue-400 transition-colors"
                            >
                                Reparar
                            </button>
                        );
                    }

                    return (
                        <div
                            key={def.key}
                            className={`flex items-center gap-3 px-3 py-2.5 group transition-colors
                                ${ok === false ? 'bg-red-950/10' : 'hover:bg-zinc-800/30'}`}
                        >
                            {/* Status dot */}
                            <StatusDot ok={ok} loading={isLoading} />

                            {/* Icon */}
                            <Icon className={`w-3.5 h-3.5 shrink-0 ${def.color} opacity-80`} />

                            {/* Info */}
                            <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2">
                                    <span className={`text-[11px] font-medium ${ok === false ? 'text-red-300' : 'text-zinc-300'}`}>
                                        {def.label}
                                    </span>
                                    <StatusBadge ok={ok} loading={isLoading} />
                                </div>
                                <p className="text-[9px] text-zinc-500 truncate mt-0.5">{detail}</p>
                            </div>

                            {actionEl}
                        </div>
                    );
                })}
            </div>

            {/* Overall status footer */}
            <div className={`px-3 py-1.5 text-[9px] font-medium flex items-center gap-1.5 border-t border-zinc-800
                ${overallOk ? 'text-emerald-500' : 'text-red-400'}`}>
                {overallOk
                    ? <><CheckCircle2 className="w-3 h-3" /> Todos los sistemas operativos</>
                    : <><AlertCircle className="w-3 h-3 animate-pulse" /> Se detectaron problemas — Revisa los servicios en rojo</>
                }
            </div>
        </div>
    );
}
