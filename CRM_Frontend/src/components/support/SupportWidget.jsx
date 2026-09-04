import React, { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
    MessageSquare, X, Send, Bot, User, Sparkles, 
    AlertCircle, HelpCircle, CheckCircle2, FileText, ChevronRight, Minimize2, RefreshCw 
} from 'lucide-react';
import SkylabBot from '../SkylabBot';

const INITIAL_MESSAGES = [
    {
        id: 1,
        sender: 'bot',
        text: '¡Hola! 👋 Soy el **Asistente Virtual de Soporte Skylab**. ¿En qué puedo ayudarte hoy?',
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        options: [
            '🔥 Reportar Incidencia Técnica',
            '💻 Estado de Servicios TI',
            '📋 Crear Ticket de Soporte',
            '❓ Consultar Manual de Uso'
        ]
    }
];

export default function SupportWidget() {
    const [isOpen, setIsOpen] = useState(false);
    const [messages, setMessages] = useState(INITIAL_MESSAGES);
    const [input, setInput] = useState('');
    const [isTyping, setIsTyping] = useState(false);
    const [activeTicket, setActiveTicket] = useState(null);
    const messagesEndRef = useRef(null);

    const scrollToBottom = () => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    };

    useEffect(() => {
        if (isOpen) {
            scrollToBottom();
        }
    }, [messages, isOpen, isTyping]);

    const handleSendMessage = (textToSend = null) => {
        const text = textToSend || input;
        if (!text.trim()) return;

        const userMsg = {
            id: Date.now(),
            sender: 'user',
            text: text.trim(),
            timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
        };

        setMessages(prev => [...prev, userMsg]);
        if (!textToSend) setInput('');
        setIsTyping(true);

        // Generar respuesta automática inteligente
        setTimeout(() => {
            let botReply = '';
            let options = null;
            let ticketCreated = null;

            const lower = text.toLowerCase();
            if (lower.includes('incidencia') || lower.includes('reportar') || lower.includes('fallo') || lower.includes('error')) {
                botReply = 'Entendido. He registrado la prioridad del reporte. ¿Podrías indicarme en qué módulo ocurrió el problema? (Ej. CCTV, Monitoreo IT, Conexiones WhatsApp)';
                options = ['CCTV / Cámaras', 'Monitoreo IT', 'WhatsApp / Bot', 'Acceso / Roles'];
            } else if (lower.includes('cctv') || lower.includes('cámara') || lower.includes('camara')) {
                const ticketNum = Math.floor(1000 + Math.random() * 9000);
                ticketCreated = `TCK-${ticketNum}`;
                botReply = `✅ Se ha abierto un **Ticket de Soporte #${ticketCreated}** de nivel técnico para la verificación de streams y conexiones CCTV. Nuestro equipo de soporte lo revisará de inmediato.`;
                setActiveTicket(ticketCreated);
            } else if (lower.includes('estado') || lower.includes('servicios') || lower.includes('ti')) {
                botReply = '⚡ **Estado actual de los servicios**:\n- **Base de Datos (Supabase)**: Operational 🟢\n- **Servicio CCTV**: Operational 🟢\n- **Bot de Respuestas**: Active 🟢\n- **Monitoreo IT**: 99.98% Uptime';
                options = ['📋 Crear Ticket de Soporte', '🔄 Volver al Inicio'];
            } else if (lower.includes('ticket') || lower.includes('crear')) {
                const ticketNum = Math.floor(1000 + Math.random() * 9000);
                ticketCreated = `TCK-${ticketNum}`;
                botReply = `🎫 **Ticket de Soporte Generado exitosamente**: #${ticketCreated}.\nPuedes hacer seguimiento al progreso de esta solicitud desde el **Dashboard de Soporte**.`;
                setActiveTicket(ticketCreated);
            } else if (lower.includes('manual') || lower.includes('uso') || lower.includes('ayuda')) {
                botReply = '📖 Puedes acceder a la documentación de uso del sistema CRM Skylab desde la sección de **Monitoreo IT** o **Centro de Mando**. ¿Necesitas ayuda con algún módulo específico?';
            } else {
                botReply = 'Gracias por comunicarte. He procesado tu solicitud. Si requieres atención de un operador humano, puedo generar un ticket directo.';
                options = ['📋 Generar Ticket con Agente', '❓ Ver Preguntas Frecuentes'];
            }

            setIsTyping(false);
            setMessages(prev => [
                ...prev,
                {
                    id: Date.now() + 1,
                    sender: 'bot',
                    text: botReply,
                    timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
                    options,
                    ticket: ticketCreated
                }
            ]);
        }, 1200);
    };

    const handleResetChat = () => {
        setMessages(INITIAL_MESSAGES);
        setActiveTicket(null);
    };

    return (
        <div className="fixed bottom-6 right-6 z-50 flex flex-col items-end">
            <AnimatePresence>
                {isOpen && (
                    <motion.div
                        initial={{ opacity: 0, scale: 0.85, y: 20 }}
                        animate={{ opacity: 1, scale: 1, y: 0 }}
                        exit={{ opacity: 0, scale: 0.85, y: 20 }}
                        transition={{ duration: 0.2, ease: "easeOut" }}
                        className="mb-4 w-[380px] sm:w-[420px] h-[540px] max-h-[80vh] bg-card/95 backdrop-blur-2xl border border-border/80 rounded-3xl shadow-2xl overflow-hidden flex flex-col z-50 text-foreground"
                    >
                        {/* Header del Chat */}
                        <div className="bg-gradient-to-r from-blue-600 via-indigo-600 to-purple-600 p-4 text-white flex items-center justify-between shadow-md">
                            <div className="flex items-center gap-3">
                                <div className="w-10 h-10 rounded-2xl bg-white/15 backdrop-blur-md border border-white/20 flex items-center justify-center shadow-inner">
                                    <SkylabBot size={24} />
                                </div>
                                <div>
                                    <div className="flex items-center gap-2">
                                        <h3 className="font-extrabold text-sm tracking-wide">Soporte Inteligente Skylab</h3>
                                        <span className="flex h-2 w-2 relative">
                                            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                                            <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-400"></span>
                                        </span>
                                    </div>
                                    <p className="text-[11px] text-blue-100/80 font-medium">Asistencia AI & Tickets en vivo</p>
                                </div>
                            </div>

                            <div className="flex items-center gap-1">
                                <button
                                    onClick={handleResetChat}
                                    title="Reiniciar Conversación"
                                    className="w-8 h-8 rounded-full hover:bg-white/15 flex items-center justify-center transition-colors text-white/80 hover:text-white"
                                >
                                    <RefreshCw size={15} />
                                </button>
                                <button
                                    onClick={() => setIsOpen(false)}
                                    title="Cerrar Chat"
                                    className="w-8 h-8 rounded-full hover:bg-white/15 flex items-center justify-center transition-colors text-white/80 hover:text-white"
                                >
                                    <X size={18} />
                                </button>
                            </div>
                        </div>

                        {/* Banner de Ticket Activo si existe */}
                        {activeTicket && (
                            <div className="bg-emerald-500/10 border-b border-emerald-500/20 px-4 py-2 flex items-center justify-between text-xs text-emerald-400 font-semibold">
                                <span className="flex items-center gap-1.5">
                                    <CheckCircle2 size={14} /> Ticket Activo: <strong className="font-bold">{activeTicket}</strong>
                                </span>
                                <span className="text-[10px] bg-emerald-500/20 px-2 py-0.5 rounded-full text-emerald-300">En Atención</span>
                            </div>
                        )}

                        {/* Mensajes del Chat */}
                        <div className="flex-1 p-4 overflow-y-auto space-y-4 custom-scrollbar bg-background/40">
                            {messages.map((msg) => (
                                <div
                                    key={msg.id}
                                    className={`flex flex-col ${msg.sender === 'user' ? 'items-end' : 'items-start'}`}
                                >
                                    <div className="flex items-end gap-2 max-w-[85%]">
                                        {msg.sender === 'bot' && (
                                            <div className="w-7 h-7 rounded-xl bg-blue-500/10 border border-blue-500/20 flex items-center justify-center text-primary text-xs shrink-0 mb-1">
                                                <Bot size={15} />
                                            </div>
                                        )}
                                        <div
                                            className={`p-3.5 rounded-2xl text-xs leading-relaxed shadow-sm ${
                                                msg.sender === 'user'
                                                    ? 'bg-primary text-primary-foreground rounded-br-none font-medium'
                                                    : 'bg-card border border-border/70 text-foreground rounded-bl-none'
                                            }`}
                                        >
                                            <p className="whitespace-pre-line">{msg.text}</p>
                                            <span className={`block text-[9px] mt-1 text-right opacity-60 ${msg.sender === 'user' ? 'text-primary-foreground' : 'text-muted-foreground'}`}>
                                                {msg.timestamp}
                                            </span>
                                        </div>
                                    </div>

                                    {/* Chips de Opciones Rápidas */}
                                    {msg.options && (
                                        <div className="mt-2.5 ml-9 flex flex-wrap gap-1.5 max-w-[85%]">
                                            {msg.options.map((opt, idx) => (
                                                <button
                                                    key={idx}
                                                    onClick={() => handleSendMessage(opt)}
                                                    className="bg-primary/10 hover:bg-primary/20 text-primary border border-primary/20 text-[11px] font-semibold px-3 py-1.5 rounded-xl transition-all flex items-center gap-1.5 shadow-sm text-left hover:scale-[1.02]"
                                                >
                                                    <span>{opt}</span>
                                                    <ChevronRight size={12} className="opacity-70" />
                                                </button>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            ))}

                            {/* Indicador de escritura */}
                            {isTyping && (
                                <div className="flex items-center gap-2 text-muted-foreground text-xs ml-2">
                                    <div className="w-7 h-7 rounded-xl bg-blue-500/10 border border-blue-500/20 flex items-center justify-center text-primary">
                                        <Bot size={15} />
                                    </div>
                                    <div className="bg-card border border-border/70 p-3 rounded-2xl rounded-bl-none flex items-center gap-1">
                                        <span className="w-1.5 h-1.5 bg-primary/60 rounded-full animate-bounce"></span>
                                        <span className="w-1.5 h-1.5 bg-primary/60 rounded-full animate-bounce [animation-delay:0.2s]"></span>
                                        <span className="w-1.5 h-1.5 bg-primary/60 rounded-full animate-bounce [animation-delay:0.4s]"></span>
                                    </div>
                                </div>
                            )}
                            <div ref={messagesEndRef} />
                        </div>

                        {/* Input Footer */}
                        <div className="p-3 border-t border-border/60 bg-card/80 backdrop-blur-md flex items-center gap-2">
                            <input
                                type="text"
                                value={input}
                                onChange={(e) => setInput(e.target.value)}
                                onKeyDown={(e) => e.key === 'Enter' && handleSendMessage()}
                                placeholder="Escribe tu mensaje o pregunta..."
                                className="flex-1 bg-background border border-border rounded-xl px-3.5 py-2.5 text-xs text-foreground placeholder:text-muted-foreground outline-none focus:border-primary/50 focus:ring-1 focus:ring-primary/50 transition-all"
                            />
                            <button
                                onClick={() => handleSendMessage()}
                                disabled={!input.trim()}
                                className="w-9 h-9 bg-primary text-primary-foreground rounded-xl flex items-center justify-center hover:opacity-90 transition-opacity disabled:opacity-40 disabled:cursor-not-allowed shadow-md shrink-0"
                            >
                                <Send size={15} />
                            </button>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* Botón Flotante Launcher */}
            <motion.button
                whileHover={{ scale: 1.08 }}
                whileTap={{ scale: 0.95 }}
                onClick={() => setIsOpen(!isOpen)}
                className="relative group bg-gradient-to-r from-blue-600 via-indigo-600 to-purple-600 text-white p-3.5 rounded-2xl shadow-xl shadow-indigo-950/40 border border-white/20 flex items-center gap-2.5 overflow-hidden transition-all duration-300"
            >
                <div className="relative">
                    <SkylabBot size={26} />
                    <span className="absolute -top-1 -right-1 flex h-3 w-3">
                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                        <span className="relative inline-flex rounded-full h-3 w-3 bg-emerald-500 border-2 border-indigo-600"></span>
                    </span>
                </div>
                <span className="text-xs font-black tracking-wide pr-1 hidden sm:inline">Soporte Skylab</span>
            </motion.button>
        </div>
    );
}
