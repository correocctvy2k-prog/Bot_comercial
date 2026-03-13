import { useState } from 'react';
import { Bot, MapPin, Users, Settings, LogOut, Cable, Terminal, PanelLeftClose, PanelLeftOpen, ChevronDown, ChevronRight, PieChart, Sparkles, Building2, Ticket } from 'lucide-react';
import SkylabBot from '../components/SkylabBot';
import { ModeToggle } from "@/components/mode-toggle";
import { NavLink, useLocation } from "react-router-dom";

const AsambleaIcon = ({ size = 24, className = "" }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeJoin="round" className={className}>
        {/* Tiny corner arrows for "Meeting" concept */}
        <path d="M2.5 2.5l2.5 2.5m0-2h-2v2" strokeWidth="1.2" opacity="0.6" />
        <path d="M21.5 2.5l-2.5 2.5m0-2h2v2" strokeWidth="1.2" opacity="0.6" />
        <path d="M2.5 21.5l2.5-2.5m0 2h-2v-2" strokeWidth="1.2" opacity="0.6" />
        <path d="M21.5 21.5l-2.5-2.5m0 2h2v-2" strokeWidth="1.2" opacity="0.6" />

        {/* Dominant central people group */}
        <circle cx="12" cy="10" r="3.5" />
        <path d="M5 21c0-3.5 3-6 7-6s7 2.5 7 6" />
        <circle cx="7" cy="13.5" r="2.2" />
        <circle cx="17" cy="13.5" r="2.2" />
    </svg>
);

// ─── ESTRUCTURA CENTRAL DE MENÚS ─────────────────────────────────────────────
const MENU_ITEMS = [
    {
        section: "Opeación Central",
        items: [
            { to: '/', icon: Bot, label: 'Actividad Bot' },
            { to: '/points', icon: MapPin, label: 'Puntos de Venta' },
            { to: '/contacts', icon: Users, label: 'Contactos' },
            { to: '/asamblea', icon: AsambleaIcon, label: 'Asamblea 2026' }
        ]
    },
    {
        section: "Inteligencia & Analítica",
        items: [
            { to: '/analytics', icon: PieChart, label: 'Analítica Avanzada' },
            { to: '/workflows', icon: Sparkles, label: 'Workflows de IA' },
        ]
    },
    {
        section: "Sistema Operativo",
        items: [
            { to: '/command-center', icon: Terminal, label: 'Centro de Mando' },
            {
                label: 'Configuraciones',
                icon: Settings,
                subItems: [
                    { to: '/connections', icon: Cable, label: 'Gestión Conexiones' },
                    { to: '/company', icon: Building2, label: 'Datos de Empresa' }
                ]
            }
        ]
    }
];

export default function Layout({ children }) {
    const location = useLocation();
    const [isSidebarOpen, setIsSidebarOpen] = useState(true);
    const [openMenus, setOpenMenus] = useState({ 'Configuraciones': true }); // Abierto por defecto

    const toggleMenu = (label) => {
        if (!isSidebarOpen) setIsSidebarOpen(true);
        setOpenMenus(prev => ({ ...prev, [label]: !prev[label] }));
    };

    // Auto-detectar la info de la página actual para el Header
    let currentTitle = 'Bot | Skylab';
    let CurrentIcon = Bot;

    MENU_ITEMS.forEach(group => {
        group.items.forEach(item => {
            if (item.subItems) {
                item.subItems.forEach(sub => {
                    if (location.pathname === sub.to || location.pathname.startsWith(sub.to + '/')) {
                        currentTitle = sub.label;
                        CurrentIcon = sub.icon;
                    }
                });
            } else {
                if (location.pathname === item.to) {
                    currentTitle = item.label;
                    CurrentIcon = item.icon;
                }
            }
        });
    });

    return (
        <div className="flex h-screen bg-background text-foreground font-sans antialiased overflow-hidden">
            {/* Sidebar Glass */}
            <aside className={`${isSidebarOpen ? 'w-[260px]' : 'w-20'} transition-all duration-300 ease-in-out bg-card/60 backdrop-blur-2xl border-r border-border flex flex-col z-20 relative`}>
                <div className={`p-6 flex items-center ${!isSidebarOpen && 'justify-center px-0'} h-24`}>
                    {isSidebarOpen ? (
                        <div>
                            <div className="flex items-center gap-2 mb-0.5">
                                <span className="text-blue-500"><SkylabBot size={34} /></span>
                                <h1 className="text-2xl font-black tracking-tight bg-gradient-to-r from-blue-500 to-indigo-500 bg-clip-text text-transparent">
                                    SKYLAB
                                </h1>
                            </div>
                            <p className="text-[11px] uppercase tracking-widest text-muted-foreground mt-0.5 ml-[36px] font-semibold">CRM Inteligente</p>
                        </div>
                    ) : (
                        <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-blue-600 to-indigo-600 flex items-center justify-center text-white font-bold shadow-lg shadow-blue-900/20">
                            <SkylabBot size={28} />
                        </div>
                    )}
                </div>

                <div className="flex-1 overflow-y-auto overflow-x-hidden pt-4 pb-8 space-y-6 custom-scrollbar">
                    {MENU_ITEMS.map((group, gIdx) => (
                        <nav key={gIdx} className="px-3 space-y-1">
                            {isSidebarOpen && (
                                <h4 className="px-4 text-[10px] uppercase tracking-[0.2em] font-bold text-muted-foreground/60 mb-3 mt-4">
                                    {group.section}
                                </h4>
                            )}
                            {group.items.map((item, iIdx) => (
                                item.subItems ? (
                                    <div key={iIdx} className="space-y-1">
                                        <button
                                            onClick={() => toggleMenu(item.label)}
                                            className={`flex items-center justify-between w-full p-3 text-sm font-medium rounded-xl transition-all duration-200 ${!isSidebarOpen && 'justify-center'} text-muted-foreground hover:text-foreground hover:bg-white/5 border border-transparent`}
                                            title={!isSidebarOpen ? item.label : ''}
                                        >
                                            <div className="flex items-center gap-3">
                                                <item.icon size={20} className={openMenus[item.label] ? "text-primary/80" : ""} />
                                                {isSidebarOpen && <span>{item.label}</span>}
                                            </div>
                                            {isSidebarOpen && (
                                                openMenus[item.label] ? <ChevronDown size={16} className="text-muted-foreground/50" /> : <ChevronRight size={16} className="text-muted-foreground/50" />
                                            )}
                                        </button>

                                        {/* Dropdown Items */}
                                        {isSidebarOpen && openMenus[item.label] && (
                                            <div className="pl-4 pr-1 py-1 space-y-1 border-l-2 border-border/50 ml-5 mt-1">
                                                {item.subItems.map(subItem => (
                                                    <NavLink
                                                        key={subItem.to}
                                                        to={subItem.to}
                                                        className={({ isActive }) => `flex items-center gap-3 p-2.5 text-sm font-medium rounded-lg transition-all duration-200 group ${isActive
                                                            ? "bg-primary/10 text-primary"
                                                            : "text-muted-foreground hover:text-foreground hover:bg-white/5"
                                                            }`}
                                                    >
                                                        <subItem.icon size={16} className="opacity-70 group-[.active]:opacity-100" />
                                                        <span className="truncate">{subItem.label}</span>
                                                    </NavLink>
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                ) : (
                                    <NavLink
                                        key={iIdx}
                                        to={item.to}
                                        title={!isSidebarOpen ? item.label : ''}
                                        className={({ isActive }) => `flex items-center ${isSidebarOpen ? 'justify-start p-3' : 'justify-center w-12 h-12 mx-auto'} gap-3 text-sm font-medium rounded-xl transition-all duration-300 group ${isActive
                                            ? "bg-primary/15 text-primary border border-primary/20 shadow-[inset_0_1px_0_0_rgba(255,255,255,0.1)]"
                                            : "text-muted-foreground hover:text-foreground hover:bg-white/5 border border-transparent"
                                            }`}
                                    >
                                        <item.icon size={20} className={`transition-transform duration-300 ${!isSidebarOpen && 'scale-110'}`} />
                                        {isSidebarOpen && <span className="truncate">{item.label}</span>}
                                    </NavLink>
                                )
                            ))}
                        </nav>
                    ))}
                </div>

                <div className="p-4 border-t border-white/5 flex flex-col gap-2 bg-black/10">
                    <button
                        onClick={() => setIsSidebarOpen(!isSidebarOpen)}
                        className={`flex items-center ${isSidebarOpen ? 'justify-start p-3' : 'justify-center w-12 h-12 mx-auto'} gap-3 text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-white/5 rounded-xl transition-colors`}
                        title="Alternar Panel Lateral"
                    >
                        {isSidebarOpen ? <PanelLeftClose size={20} /> : <PanelLeftOpen size={20} />}
                        {isSidebarOpen && <span>Ocultar Panel</span>}
                    </button>
                    <button className={`flex items-center ${isSidebarOpen ? 'justify-start p-3' : 'justify-center w-12 h-12 mx-auto'} gap-3 text-sm font-medium text-red-500/70 hover:text-red-400 hover:bg-red-500/10 rounded-xl transition-colors`} title="Cerrar Sesión">
                        <LogOut size={20} />
                        {isSidebarOpen && <span>Cerrar Sesión</span>}
                    </button>
                </div>
            </aside>

            {/* Main Content */}
            <main className="flex-1 flex flex-col relative overflow-hidden bg-background">
                {/* Header Superior Dinámico con Color Oro/Amarillo Requerido */}
                {location.pathname !== '/command-center' && (
                    <header className="h-[80px] border-b border-border/60 bg-background/80 backdrop-blur-xl flex items-center justify-between px-10 z-10 shrink-0 shadow-sm">
                        <div className="flex items-center gap-4 animate-in fade-in slide-in-from-left-4 duration-500">
                            {/* Icono Minimalista Amarillo */}
                            <div className="flex items-center justify-center w-10 h-10 rounded-xl bg-yellow-500/10 text-yellow-500 border border-yellow-500/20 shadow-inner">
                                <CurrentIcon size={20} strokeWidth={2.5} />
                            </div>
                            <div>
                                <h2 className="text-xl font-bold tracking-tight text-foreground">{currentTitle}</h2>
                            </div>
                        </div>

                        <div className="flex items-center gap-6">
                            <ModeToggle />
                            <div className="w-9 h-9 rounded-full bg-primary/10 border border-primary/20 flex items-center justify-center text-primary text-xs font-bold shadow-inner cursor-pointer hover:bg-primary/20 transition-colors">
                                JB
                            </div>
                        </div>
                    </header>
                )}

                <div className={`flex-1 overflow-auto ${location.pathname === '/command-center' ? 'p-0' : 'p-8'}`}>
                    {children}
                </div>
            </main>
        </div>
    );
}
