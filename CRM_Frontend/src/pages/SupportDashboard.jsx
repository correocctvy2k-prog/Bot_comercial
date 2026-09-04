import React, { useState } from 'react';
import { 
    LifeBuoy, CheckCircle2, Clock, AlertTriangle, MessageSquare, 
    Filter, Search, Plus, User, ArrowUpRight, ShieldAlert, Sparkles, 
    RefreshCcw, Eye, Check, X, FileText, BarChart3, Bot,
    Send, ArrowLeft, ShieldCheck, CheckCheck, MessageCircle
} from 'lucide-react';
import { toast } from 'sonner';

const MOCK_TICKETS = [
    {
        id: 'TCK-4089',
        user: 'Carlos Mendoza',
        email: 'carlos.mendoza@empresa.com',
        module: 'CCTV & Cámaras',
        subject: 'Perdida de stream en Cámara Norte-02 (SIIS 402)',
        priority: 'Alta',
        status: 'En Proceso',
        assignedTo: 'Agente IA Skylab',
        createdAt: 'Hace 12 min'
    },
    {
        id: 'TCK-4088',
        user: 'Ana Lucía Gómez',
        email: 'ana.gomez@empresa.com',
        module: 'Monitoreo IT',
        subject: 'Alerta de latencia en Backend de Servicios TI',
        priority: 'Media',
        status: 'Abierto',
        assignedTo: 'Soporte Nivel 2',
        createdAt: 'Hace 45 min'
    },
    {
        id: 'TCK-4085',
        user: 'Roberto Silva',
        email: 'roberto.silva@empresa.com',
        module: 'WhatsApp / Bot',
        subject: 'Solicitud de reconexión de QR en Instancia #01',
        priority: 'Alta',
        status: 'Resuelto',
        assignedTo: 'Soporte Nivel 1',
        createdAt: 'Hace 2 horas'
    },
    {
        id: 'TCK-4080',
        user: 'Mariana Reyes',
        email: 'mariana.reyes@empresa.com',
        module: 'Acceso / Roles',
        subject: 'Permisos insuficientes para módulo de Asamblea',
        priority: 'Baja',
        status: 'Resuelto',
        assignedTo: 'Agente IA Skylab',
        createdAt: 'Hace 5 horas'
    }
];

export default function SupportDashboard() {
    const [tickets, setTickets] = useState(MOCK_TICKETS);
    const [searchTerm, setSearchTerm] = useState('');
    const [statusFilter, setStatusFilter] = useState('Todos');
    const [selectedTicket, setSelectedTicket] = useState(null);
    const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
    const [newTicketForm, setNewTicketForm] = useState({
        user: '',
        module: 'CCTV & Cámaras',
        subject: '',
        priority: 'Media'
    });

    const filteredTickets = tickets.filter(t => {
        const matchesSearch = t.id.toLowerCase().includes(searchTerm.toLowerCase()) ||
                              t.user.toLowerCase().includes(searchTerm.toLowerCase()) ||
                              t.subject.toLowerCase().includes(searchTerm.toLowerCase());
        const matchesStatus = statusFilter === 'Todos' || t.status === statusFilter;
        return matchesSearch && matchesStatus;
    });

    const handleResolveTicket = (ticketId) => {
        setTickets(prev => prev.map(t => t.id === ticketId ? { ...t, status: 'Resuelto' } : t));
        toast.success(`Ticket ${ticketId} marcado como Resuelto`);
    };

    const handleCreateTicket = (e) => {
        e.preventDefault();
        if (!newTicketForm.user || !newTicketForm.subject) {
            toast.error('Por favor completa todos los campos requeridos');
            return;
        }

        const newId = `TCK-${Math.floor(4090 + Math.random() * 100)}`;
        const created = {
            id: newId,
            user: newTicketForm.user,
            email: `${newTicketForm.user.toLowerCase().replace(/\s+/g, '.')}@empresa.com`,
            module: newTicketForm.module,
            subject: newTicketForm.subject,
            priority: newTicketForm.priority,
            status: 'Abierto',
            assignedTo: 'Agente IA Skylab',
            createdAt: 'Justo ahora'
        };

        setTickets([created, ...tickets]);
        setIsCreateModalOpen(false);
        setNewTicketForm({ user: '', module: 'CCTV & Cámaras', subject: '', priority: 'Media' });
        toast.success(`Ticket ${newId} creado con éxito`);
    };

    const getPriorityBadge = (priority) => {
        switch (priority) {
            case 'Alta':
                return 'bg-red-500/10 text-red-500 border-red-500/20';
            case 'Media':
                return 'bg-amber-500/10 text-amber-500 border-amber-500/20';
            default:
                return 'bg-blue-500/10 text-blue-500 border-blue-500/20';
        }
    };

    const getStatusBadge = (status) => {
        switch (status) {
            case 'Resuelto':
                return 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20';
            case 'En Proceso':
                return 'bg-indigo-500/10 text-indigo-400 border-indigo-500/20';
            default:
                return 'bg-amber-500/10 text-amber-400 border-amber-500/20';
        }
    };

    const MOCK_MESSAGES = {
        'TCK-4089': [
            { id: 'm1', direction: 'INCOMING', content: 'Hola, tenemos problemas con la cámara Norte-02, no se ve el stream.', created_at: '2026-09-02T14:22:00Z', metadata: {} },
            { id: 'm2', direction: 'OUTGOING', content: 'Hola Carlos, hemos recibido tu reporte. Vamos a revisar la conexión SIIS 402.', created_at: '2026-09-02T14:23:00Z', metadata: { sent_by: 'bot' } },
            { id: 'm3', direction: 'INCOMING', content: 'Gracias, quedo atento.', created_at: '2026-09-02T14:24:00Z', metadata: {} },
            { id: 'm4', direction: 'OUTGOING', content: 'El equipo de CCTV está verificando el stream. Te avisamos en cuanto esté restaurado.', created_at: '2026-09-02T14:25:00Z', metadata: { sent_by: 'human_operator' } },
        ],
        'TCK-4088': [
            { id: 'm1', direction: 'INCOMING', content: 'El backend de Servicios TI está presentando latencia alta.', created_at: '2026-09-02T13:45:00Z', metadata: {} },
            { id: 'm2', direction: 'OUTGOING', content: 'Hola Ana, estamos revisando los logs del backend.', created_at: '2026-09-02T13:46:00Z', metadata: { sent_by: 'bot' } },
        ],
        'TCK-4085': [
            { id: 'm1', direction: 'INCOMING', content: 'Necesito reconectar el QR de la instancia #01.', created_at: '2026-09-02T12:10:00Z', metadata: {} },
            { id: 'm2', direction: 'OUTGOING', content: 'Claro Roberto, aquí tienes el paso a paso para regenerar el QR.', created_at: '2026-09-02T12:11:00Z', metadata: { sent_by: 'human_operator' } },
            { id: 'm3', direction: 'INCOMING', content: 'Perfecto, ya quedó conectado.', created_at: '2026-09-02T12:15:00Z', metadata: {} },
        ],
        'TCK-4080': [
            { id: 'm1', direction: 'INCOMING', content: 'No tengo permisos para acceder al módulo de Asamblea.', created_at: '2026-09-02T10:00:00Z', metadata: {} },
            { id: 'm2', direction: 'OUTGOING', content: 'Hola Mariana, ya hemos actualizado tus roles. Prueba ingresando de nuevo.', created_at: '2026-09-02T10:05:00Z', metadata: { sent_by: 'bot' } },
        ],
    };

    const [chatMessages, setChatMessages] = useState([]);
    const [chatInput, setChatInput] = useState('');
    const [isSendingChat, setIsSendingChat] = useState(false);

    const openChat = (ticket) => {
        setSelectedTicket(ticket);
        const msgs = MOCK_MESSAGES[ticket.id] || [];
        setChatMessages(msgs);
        setChatInput('');
    };

    const handleSendChatMessage = () => {
        if (!chatInput.trim() || isSendingChat) return;
        const newMsg = {
            id: `m-${Date.now()}`,
            direction: 'OUTGOING',
            content: chatInput.trim(),
            created_at: new Date().toISOString(),
            metadata: { sent_by: 'human_operator' }
        };
        setChatMessages(prev => [...prev, newMsg]);
        setChatInput('');
        setIsSendingChat(false);
    };

    return (
        <div className="space-y-6 pb-12">
            {/* Header del Dashboard */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-card/60 backdrop-blur-xl p-6 rounded-3xl border border-border">
                <div>
                    <div className="flex items-center gap-2 mb-1">
                        <div className="w-9 h-9 rounded-2xl bg-blue-500/10 border border-blue-500/20 flex items-center justify-center text-primary">
                            <LifeBuoy size={20} />
                        </div>
                        <h1 className="text-2xl font-black text-foreground tracking-tight">Centro de Soporte & Asistente IA</h1>
                    </div>
                    <p className="text-xs text-muted-foreground font-medium">Gestión integral de tickets de incidencias y conversaciones del bot de ayuda</p>
                </div>

                <div className="flex items-center gap-3">
                    <button 
                        onClick={() => toast.info('Actualizando métricas de soporte...')}
                        className="p-2.5 rounded-xl border border-border bg-background hover:bg-white/5 text-muted-foreground hover:text-foreground transition-all"
                        title="Refrescar"
                    >
                        <RefreshCcw size={16} />
                    </button>
                    <button 
                        onClick={() => setIsCreateModalOpen(true)}
                        className="bg-primary text-primary-foreground font-bold text-xs px-4 py-2.5 rounded-xl flex items-center gap-2 hover:shadow-[0_0_20px_rgba(59,130,246,0.4)] transition-all"
                    >
                        <Plus size={16} />
                        <span>Nuevo Ticket</span>
                    </button>
                </div>
            </div>

            {/* KPI Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                <div className="bg-card/70 border border-border p-5 rounded-2xl flex items-center justify-between shadow-sm">
                    <div>
                        <p className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider">Tickets Abiertos</p>
                        <h3 className="text-2xl font-black text-foreground mt-1">
                            {tickets.filter(t => t.status !== 'Resuelto').length}
                        </h3>
                        <span className="text-[10px] text-amber-400 font-semibold flex items-center gap-1 mt-1">
                            <Clock size={12} /> Requieren atención
                        </span>
                    </div>
                    <div className="w-12 h-12 rounded-2xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-500">
                        <AlertTriangle size={24} />
                    </div>
                </div>

                <div className="bg-card/70 border border-border p-5 rounded-2xl flex items-center justify-between shadow-sm">
                    <div>
                        <p className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider">Tiempo Resp. Promedio</p>
                        <h3 className="text-2xl font-black text-foreground mt-1">3.8 min</h3>
                        <span className="text-[10px] text-emerald-400 font-semibold flex items-center gap-1 mt-1">
                            <ArrowUpRight size={12} /> 18% más rápido
                        </span>
                    </div>
                    <div className="w-12 h-12 rounded-2xl bg-blue-500/10 border border-blue-500/20 flex items-center justify-center text-primary">
                        <Clock size={24} />
                    </div>
                </div>

                <div className="bg-card/70 border border-border p-5 rounded-2xl flex items-center justify-between shadow-sm">
                    <div>
                        <p className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider">Atendidos por IA</p>
                        <h3 className="text-2xl font-black text-foreground mt-1">84.2%</h3>
                        <span className="text-[10px] text-emerald-400 font-semibold flex items-center gap-1 mt-1">
                            <Sparkles size={12} /> Automatización activa
                        </span>
                    </div>
                    <div className="w-12 h-12 rounded-2xl bg-purple-500/10 border border-purple-500/20 flex items-center justify-center text-purple-400">
                        <Bot size={24} />
                    </div>
                </div>

                <div className="bg-card/70 border border-border p-5 rounded-2xl flex items-center justify-between shadow-sm">
                    <div>
                        <p className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider">Satisfacción CSAT</p>
                        <h3 className="text-2xl font-black text-foreground mt-1">98.5%</h3>
                        <span className="text-[10px] text-emerald-400 font-semibold flex items-center gap-1 mt-1">
                            <CheckCircle2 size={12} /> Evaluación Excelente
                        </span>
                    </div>
                    <div className="w-12 h-12 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400">
                        <CheckCircle2 size={24} />
                    </div>
                </div>
            </div>

            {/* Filtros y Búsqueda */}
            <div className="bg-card/70 border border-border p-4 rounded-2xl flex flex-col sm:flex-row items-center justify-between gap-4">
                <div className="relative w-full sm:w-80">
                    <Search className="absolute left-3.5 top-3 text-muted-foreground" size={16} />
                    <input 
                        type="text"
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        placeholder="Buscar ticket por ID, usuario o tema..."
                        className="w-full bg-background border border-border rounded-xl pl-10 pr-4 py-2.5 text-xs text-foreground placeholder:text-muted-foreground outline-none focus:border-primary/50 focus:ring-1 focus:ring-primary/50 transition-all"
                    />
                </div>

                <div className="flex items-center gap-2 w-full sm:w-auto">
                    <Filter size={15} className="text-muted-foreground" />
                    <span className="text-xs text-muted-foreground font-semibold">Estado:</span>
                    <div className="flex bg-background border border-border rounded-xl p-1 gap-1">
                        {['Todos', 'Abierto', 'En Proceso', 'Resuelto'].map((status) => (
                            <button
                                key={status}
                                onClick={() => setStatusFilter(status)}
                                className={`px-3 py-1 rounded-lg text-xs font-semibold transition-all ${
                                    statusFilter === status 
                                        ? 'bg-primary text-primary-foreground shadow-sm' 
                                        : 'text-muted-foreground hover:text-foreground'
                                }`}
                            >
                                {status}
                            </button>
                        ))}
                    </div>
                </div>
            </div>

            {/* Tabla de Tickets de Soporte */}
            <div className="bg-card/70 border border-border rounded-3xl overflow-hidden shadow-lg">
                <div className="p-5 border-b border-border/80 flex items-center justify-between">
                    <h3 className="font-bold text-foreground text-sm flex items-center gap-2">
                        <FileText size={18} className="text-primary" /> 
                        Listado de Solicitudes y Tickets ({filteredTickets.length})
                    </h3>
                </div>

                <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs border-collapse">
                        <thead>
                            <tr className="border-b border-border/60 bg-white/5 text-muted-foreground font-extrabold uppercase tracking-wider text-[10px]">
                                <th className="py-3.5 px-5">ID Ticket</th>
                                <th className="py-3.5 px-5">Solicitante</th>
                                <th className="py-3.5 px-5">Módulo / Tema</th>
                                <th className="py-3.5 px-5">Prioridad</th>
                                <th className="py-3.5 px-5">Estado</th>
                                <th className="py-3.5 px-5">Asignado a</th>
                                <th className="py-3.5 px-5 text-right">Acciones</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-border/40">
                            {filteredTickets.map((t) => (
                                <tr key={t.id} className="hover:bg-white/5 transition-colors group">
                                    <td className="py-4 px-5 font-extrabold text-foreground font-mono">
                                        {t.id}
                                    </td>
                                    <td className="py-4 px-5">
                                        <div className="font-bold text-foreground">{t.user}</div>
                                        <div className="text-[10px] text-muted-foreground">{t.email}</div>
                                    </td>
                                    <td className="py-4 px-5">
                                        <span className="font-semibold text-foreground/90 block">{t.subject}</span>
                                        <span className="text-[10px] text-muted-foreground">{t.module}</span>
                                    </td>
                                    <td className="py-4 px-5">
                                        <span className={`px-2.5 py-1 rounded-md border text-[10px] font-extrabold ${getPriorityBadge(t.priority)}`}>
                                            {t.priority}
                                        </span>
                                    </td>
                                    <td className="py-4 px-5">
                                        <span className={`px-2.5 py-1 rounded-md border text-[10px] font-extrabold ${getStatusBadge(t.status)}`}>
                                            {t.status}
                                        </span>
                                    </td>
                                    <td className="py-4 px-5 font-medium text-muted-foreground">
                                        <span className="flex items-center gap-1.5">
                                            <Bot size={13} className="text-purple-400" /> {t.assignedTo}
                                        </span>
                                    </td>
                                    <td className="py-4 px-5 text-right">
                                        <div className="flex items-center justify-end gap-2">
                                            {t.status !== 'Resuelto' && (
                                                <button
                                                    onClick={() => handleResolveTicket(t.id)}
                                                    className="bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 border border-emerald-500/20 p-2 rounded-xl transition-all"
                                                    title="Marcar como Resuelto"
                                                >
                                                    <Check size={14} />
                                                </button>
                                            )}
                                            <button
                                                onClick={() => openChat(t)}
                                                className="bg-primary/10 hover:bg-primary/20 text-primary border border-primary/20 p-2 rounded-xl transition-all"
                                                title="Ver Detalle"
                                            >
                                                <Eye size={14} />
                                            </button>
                                        </div>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* Modal Crear Ticket */}
            {isCreateModalOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-background/60 backdrop-blur-sm">
                    <div className="bg-card border border-border w-full max-w-md rounded-3xl shadow-2xl p-6 relative">
                        <div className="flex items-center justify-between mb-4 border-b border-border/60 pb-3">
                            <h3 className="font-bold text-foreground text-base flex items-center gap-2">
                                <Plus size={18} className="text-primary" /> Crear Nuevo Ticket
                            </h3>
                            <button onClick={() => setIsCreateModalOpen(false)} className="text-muted-foreground hover:text-foreground">
                                <X size={18} />
                            </button>
                        </div>
                        <form onSubmit={handleCreateTicket} className="space-y-4">
                            <div>
                                <label className="text-xs font-bold text-muted-foreground block mb-1">Nombre del Solicitante</label>
                                <input
                                    type="text"
                                    required
                                    value={newTicketForm.user}
                                    onChange={(e) => setNewTicketForm({ ...newTicketForm, user: e.target.value })}
                                    placeholder="Ej. Pedro Picapiedra"
                                    className="w-full bg-background border border-border rounded-xl px-3.5 py-2.5 text-xs text-foreground outline-none focus:border-primary/50"
                                />
                            </div>
                            <div>
                                <label className="text-xs font-bold text-muted-foreground block mb-1">Módulo</label>
                                <select
                                    value={newTicketForm.module}
                                    onChange={(e) => setNewTicketForm({ ...newTicketForm, module: e.target.value })}
                                    className="w-full bg-background border border-border rounded-xl px-3.5 py-2.5 text-xs text-foreground outline-none focus:border-primary/50"
                                >
                                    <option value="CCTV & Cámaras">CCTV & Cámaras</option>
                                    <option value="Monitoreo IT">Monitoreo IT</option>
                                    <option value="WhatsApp / Bot">WhatsApp / Bot</option>
                                    <option value="Asamblea">Asamblea</option>
                                    <option value="Acceso / Roles">Acceso / Roles</option>
                                </select>
                            </div>
                            <div>
                                <label className="text-xs font-bold text-muted-foreground block mb-1">Prioridad</label>
                                <select
                                    value={newTicketForm.priority}
                                    onChange={(e) => setNewTicketForm({ ...newTicketForm, priority: e.target.value })}
                                    className="w-full bg-background border border-border rounded-xl px-3.5 py-2.5 text-xs text-foreground outline-none focus:border-primary/50"
                                >
                                    <option value="Baja">Baja</option>
                                    <option value="Media">Media</option>
                                    <option value="Alta">Alta</option>
                                </select>
                            </div>
                            <div>
                                <label className="text-xs font-bold text-muted-foreground block mb-1">Asunto / Descripción</label>
                                <textarea
                                    required
                                    rows={3}
                                    value={newTicketForm.subject}
                                    onChange={(e) => setNewTicketForm({ ...newTicketForm, subject: e.target.value })}
                                    placeholder="Describe la consulta o falla observada..."
                                    className="w-full bg-background border border-border rounded-xl px-3.5 py-2.5 text-xs text-foreground outline-none focus:border-primary/50"
                                />
                            </div>
                            <div className="pt-2 flex justify-end gap-2">
                                <button type="button" onClick={() => setIsCreateModalOpen(false)} className="px-4 py-2 text-xs font-bold text-muted-foreground hover:text-foreground">
                                    Cancelar
                                </button>
                                <button type="submit" className="bg-primary text-primary-foreground font-bold text-xs px-5 py-2 rounded-xl">
                                    Guardar Ticket
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* -- Modal Chat WhatsApp (Ver Conversación) -- */}
            {selectedTicket && (
                <div className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center bg-black/70 backdrop-blur-sm">
                    <div className="w-full h-[100dvh] sm:h-[92vh] sm:max-w-5xl sm:mx-0 bg-[#0b141a] sm:rounded-2xl border-0 sm:border border-white/10 shadow-2xl flex flex-col overflow-hidden">
                        {/* Header estilo WhatsApp */}
                        <div className="bg-[#202c33] border-b border-white/10 px-3 py-2.5 sm:px-4 sm:py-3 flex items-center justify-between shrink-0 gap-2">
                            <div className="flex items-center gap-2 sm:gap-3 min-w-0">
                                <button onClick={() => setSelectedTicket(null)} className="text-slate-300 hover:text-white transition-colors shrink-0">
                                    <ArrowLeft size={20} />
                                </button>
                                <div className="relative shrink-0">
                                    <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-full bg-gradient-to-br from-emerald-500 to-teal-700 flex items-center justify-center text-white font-bold text-xs sm:text-sm shadow-md">
                                        {(selectedTicket.user || 'U').substring(0,2).toUpperCase()}
                                    </div>
                                    <span className="absolute bottom-0 right-0 w-2.5 h-2.5 sm:w-3 sm:h-3 bg-emerald-500 border-2 border-[#202c33] rounded-full" />
                                </div>
                                <div className="min-w-0">
                                    <h3 className="font-extrabold text-xs sm:text-sm text-white truncate">{selectedTicket.user}</h3>
                                    <p className="text-[10px] sm:text-[11px] text-emerald-300 truncate">WhatsApp Web Live</p>
                                </div>
                            </div>
                            <div className="flex items-center gap-2 shrink-0">
                                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider hidden sm:inline-block">{selectedTicket.id}</span>
                                <button onClick={() => setSelectedTicket(null)} className="text-slate-400 hover:text-white transition-colors">
                                    <X size={18} />
                                </button>
                            </div>
                        </div>

                        {/* Cuerpo del Chat */}
                        <div className="flex-1 overflow-y-auto p-3 sm:p-4 relative custom-scrollbar">
                            <div className="absolute inset-0 bg-[radial-gradient(#1f2c34_1px,transparent_1px)] [background-size:16px_16px] sm:[background-size:18px_18px] opacity-40 pointer-events-none" />
                            <div className="relative z-10 space-y-1">
                                {chatMessages.length === 0 ? (
                                    <div className="h-full flex flex-col items-center justify-center text-slate-400 text-xs py-20 gap-2">
                                        <MessageCircle size={36} className="text-emerald-500/40" />
                                        <span>No hay mensajes en este chat.</span>
                                    </div>
                                ) : (
                                    chatMessages.map((msg, idx) => {
                                        const isOut = msg.direction === 'OUTGOING';
                                        const isHuman = msg.metadata?.sent_by === 'human_operator';
                                        const prev = chatMessages[idx - 1];
                                        const showSender = isOut && (!prev || prev.direction !== 'OUTGOING' || (prev.metadata?.sent_by !== msg.metadata?.sent_by));
                                        const time = new Date(msg.created_at).toLocaleTimeString('es', { hour: '2-digit', minute: '2-digit' });

                                        return (
                                            <div key={msg.id} className={`flex w-full ${isOut ? 'justify-end' : 'justify-start'}`}>
                                                <div className={`max-w-[88%] sm:max-w-[65%] rounded-2xl px-3 py-2 sm:px-4 sm:py-2.5 text-xs shadow-md relative transition-all ${
                                                    isOut
                                                        ? isHuman
                                                            ? 'bg-[#005c4b] text-white rounded-tr-none border border-emerald-400/30'
                                                            : 'bg-[#112a22] text-emerald-100 rounded-tr-none border border-emerald-500/30'
                                                        : 'bg-[#202c33] text-slate-100 rounded-tl-none border border-white/5'
                                                }`}>
                                                    {showSender && isOut && (
                                                        <div className="flex items-center gap-1 text-[9px] font-extrabold uppercase tracking-wider mb-1 opacity-80 border-b border-white/10 pb-0.5">
                                                            {isHuman ? (
                                                                <span className="text-amber-300 flex items-center gap-1"><User size={10} /> Operador Humano</span>
                                                            ) : (
                                                                <span className="text-emerald-400 flex items-center gap-1"><Bot size={10} /> Respuesta Bot IA</span>
                                                            )}
                                                        </div>
                                                    )}
                                                    <div className="break-words leading-relaxed whitespace-pre-wrap text-[13px]">
                                                        {msg.content}
                                                    </div>
                                                    <div className={`text-[10px] mt-1.5 flex items-center gap-1.5 justify-end opacity-70 ${isOut ? 'text-slate-200' : 'text-slate-400'}`}>
                                                        <span>{time}</span>
                                                        {isOut && <CheckCheck size={14} className={isHuman ? "text-[#53bdeb]" : "text-emerald-400"} />}
                                                    </div>
                                                </div>
                                            </div>
                                        );
                                    })
                                )}
                            </div>
                        </div>

                        {/* Input inferior */}
                        <div className="bg-[#111b21] border-t border-white/10 p-2.5 sm:p-3 shrink-0">
                            <form onSubmit={(e) => { e.preventDefault(); handleSendChatMessage(); }} className="flex items-center gap-2">
                                <input
                                    type="text"
                                    value={chatInput}
                                    onChange={(e) => setChatInput(e.target.value)}
                                    placeholder="Escribe un mensaje por WhatsApp..."
                                    className="flex-1 bg-[#202c33] text-slate-100 placeholder:text-slate-400 text-xs sm:text-sm rounded-xl px-3 py-2.5 sm:px-4 sm:py-3 border border-white/5 outline-none focus:ring-1 focus:ring-[#00a884] transition-all min-w-0"
                                />
                                <button
                                    type="submit"
                                    disabled={!chatInput.trim() || isSendingChat}
                                    className="w-10 h-10 sm:w-11 sm:h-11 rounded-xl bg-[#00a884] hover:bg-[#008f70] active:scale-95 text-white flex items-center justify-center transition-all disabled:opacity-40 disabled:cursor-not-allowed shadow-lg shrink-0"
                                >
                                    {isSendingChat ? <RefreshCcw size={18} className="animate-spin" /> : <Send size={18} />}
                                </button>
                            </form>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
