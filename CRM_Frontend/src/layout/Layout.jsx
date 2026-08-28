import { useState, useRef, useEffect, createContext } from 'react';
import { Bot, MapPin, Users, Settings, LogOut, Cable, Terminal, PanelLeftClose, PanelLeftOpen, ChevronDown, ChevronRight, PieChart, Sparkles, Building2, ShieldCheck, User, Image, UserCircle, Loader2, X, Activity, LayoutDashboard, Server, Cctv, LockKeyhole } from 'lucide-react';
import SkylabBot from '../components/SkylabBot';
import { ModeToggle } from "@/components/mode-toggle";
import { NavLink, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from '../context/AuthContext';
import { toast } from 'sonner';
import { supabase } from '../services/supabase';
import { motion, AnimatePresence } from 'framer-motion';

const AsambleaIcon = ({ size = 24, className = "" }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeJoin="round" className={className}>
        <path d="M2.5 2.5l2.5 2.5m0-2h2v2" strokeWidth="1.2" opacity="0.6" />
        <path d="M21.5 2.5l-2.5 2.5m0-2h2v2" strokeWidth="1.2" opacity="0.6" />
        <path d="M2.5 21.5l2.5-2.5m0 2h-2v-2" strokeWidth="1.2" opacity="0.6" />
        <path d="M21.5 21.5l-2.5-2.5m0 2h2v-2" strokeWidth="1.2" opacity="0.6" />
        <circle cx="12" cy="10" r="3.5" />
        <path d="M5 21c0-3.5 3-6 7-6s7 2.5 7 6" />
        <circle cx="7" cy="13.5" r="2.2" />
        <circle cx="17" cy="13.5" r="2.2" />
    </svg>
);

export const PageHeaderContext = createContext(null);

// ─── ESTRUCTURA CENTRAL DE MENÚS ─────────────────────────────────────────────
const MENU_ITEMS_RAW = [
    {
        section: "Opeación Central",
        items: [
            { to: '/', icon: Bot, label: 'Actividad Bot', module: 'bot-activity' },
            { to: '/points', icon: MapPin, label: 'Operación de Puntos', module: 'points' },
            {
                label: 'Seguridad Perimetral',
                icon: ShieldCheck,
                module: 'points',
                subItems: [
                    { icon: Cable, label: 'Ciberseguridad', module: 'points', comingSoon: true },
                    { to: '/points/cctv', icon: Cctv, label: 'Seguridad Electrónica', module: 'points' },
                    { icon: LockKeyhole, label: 'Seguridad de la Información', module: 'points', comingSoon: true }
                ]
            },
            { to: '/contacts', icon: Users, label: 'Contactos', module: 'contacts' },
            { to: '/asamblea', icon: AsambleaIcon, label: 'Asamblea 2026', module: 'asamblea' }
        ]
    },
    {
        section: "Inteligencia & Analítica",
        items: [
            { to: '/analytics', icon: PieChart, label: 'Analítica Avanzada', module: 'analytics' },
            { to: '/workflows', icon: Sparkles, label: 'Workflows de IA', module: 'workflows' },
        ]
    },
    {
        section: "Sistema Operativo",
        items: [
            { to: '/command-center', icon: Terminal, label: 'Centro de Mando', module: 'command-center' },
            {
                label: 'Monitoreo IT',
                icon: Activity,
                module: 'bot-activity',
                subItems: [
                    { to: '/monitoring/dashboard', icon: LayoutDashboard, label: 'Detalles Monitoreo', module: 'bot-activity' },
                    { to: '/monitoring/services-ti', icon: Server, label: 'Dashboard Servicios TI', module: 'bot-activity' },
                    { to: '/monitoring', icon: Activity, label: 'Dashboard', module: 'bot-activity' }
                ]
            },
            {
                label: 'Configuraciones',
                icon: Settings,
                module: 'settings',
                subItems: [
                    { to: '/connections', icon: Cable, label: 'Gestión Conexiones', module: 'settings' },
                    { to: '/company', icon: Building2, label: 'Datos de Empresa', module: 'settings' },
                    { to: '/users', icon: ShieldCheck, label: 'Gestión Usuarios', module: 'users-management' }
                ]
            }
        ]
    }
];

export default function Layout({ children }) {
    const location = useLocation();
    const navigate = useNavigate();
    const { profile, logout, hasPermission, user, refreshProfile } = useAuth();
    const [isSidebarOpen, setIsSidebarOpen] = useState(true);
    const [openMenus, setOpenMenus] = useState({ 'Seguridad Perimetral': true, 'Configuraciones': true, 'Monitoreo IT': true });
    const [pageHeader, setPageHeader] = useState(null);
    
    const [isProfileMenuOpen, setIsProfileMenuOpen] = useState(false);
    const [isProfileModalOpen, setIsProfileModalOpen] = useState(false);
    const [isSavingProfile, setIsSavingProfile] = useState(false);
    const menuRef = useRef(null);
    const [profileForm, setProfileForm] = useState({
        full_name: '',
        avatar_url: ''
    });

    // Close menu when clicking outside
    useEffect(() => {
        const handleClickOutside = (event) => {
            if (menuRef.current && !menuRef.current.contains(event.target)) {
                setIsProfileMenuOpen(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    const openProfileModal = () => {
        setProfileForm({
            full_name: profile?.full_name || '',
            avatar_url: profile?.avatar_url || ''
        });
        setIsProfileMenuOpen(false);
        setIsProfileModalOpen(true);
    };

    const handleSaveProfile = async (e) => {
        e.preventDefault();
        if (!user || (!profileForm.full_name && !profileForm.avatar_url)) return;
        
        setIsSavingProfile(true);
        try {
            const { error } = await supabase
                .from('profiles')
                .update({ 
                    full_name: profileForm.full_name,
                    avatar_url: profileForm.avatar_url
                })
                .eq('id', user.id);
                
            if (error) throw error;
            toast.success('Perfil actualizado con éxito');
            await refreshProfile();
            setIsProfileModalOpen(false);
        } catch (error) {
            toast.error('Error al actualizar el perfil', { description: error.message });
        } finally {
            setIsSavingProfile(false);
        }
    };

    const handleLogout = async () => {
        try {
            await logout();
            toast.success('Sesión cerrada correctamente');
            navigate('/login');
        } catch (error) {
            toast.error('Error al cerrar sesión');
        }
    };

    const toggleMenu = (label) => {
        if (!isSidebarOpen) setIsSidebarOpen(true);
        setOpenMenus(prev => ({ ...prev, [label]: !prev[label] }));
    };

    // Obtener iniciales del perfil
    const getInitials = () => {
        if (!profile) return '??';
        if (profile.full_name) {
            return profile.full_name.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase();
        }
        return profile.username?.substring(0, 2).toUpperCase() || '??';
    };

    // Filtrar MENU_ITEMS basado en permisos.
    const filteredMenu = MENU_ITEMS_RAW.map(group => ({
        ...group,
        items: group.items
            .map(item => {
                if (item.subItems) {
                    const visibleSubs = item.subItems.filter(sub => hasPermission(sub.module));
                    return { ...item, subItems: visibleSubs };
                }
                return item;
            })
            .filter(item => {
                if (item.subItems) return item.subItems.length > 0;
                return hasPermission(item.module);
            })
    })).filter(group => group.items.length > 0);

    // Auto-detectar la info de la página actual para el Header
    let currentTitle = 'Bot | Skylab';
    let CurrentIcon = Bot;

    MENU_ITEMS_RAW.forEach(group => {
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
                        <div className="animate-in fade-in duration-500">
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
                    {filteredMenu.map((group, gIdx) => (
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
                                                {item.subItems.map(subItem => subItem.comingSoon ? (
                                                    <div key={subItem.label} className="flex items-center gap-3 rounded-lg p-2.5 text-sm font-medium text-muted-foreground/45" title="Integración futura">
                                                        <subItem.icon size={16} className="opacity-60" />
                                                        <span className="min-w-0 flex-1 truncate">{subItem.label}</span>
                                                        <span className="rounded border border-white/[.06] px-1.5 py-0.5 text-[7px] font-black uppercase tracking-wider text-muted-foreground/55">Próximo</span>
                                                    </div>
                                                ) : (
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
                    <button 
                        onClick={handleLogout}
                        className={`flex items-center ${isSidebarOpen ? 'justify-start p-3' : 'justify-center w-12 h-12 mx-auto'} gap-3 text-sm font-medium text-red-500/70 hover:text-red-400 hover:bg-red-500/10 rounded-xl transition-colors`} 
                        title="Cerrar Sesión"
                    >
                        <LogOut size={20} />
                        {isSidebarOpen && <span>Cerrar Sesión</span>}
                    </button>
                </div>
            </aside>

            {/* Main Content */}
            <main className="flex-1 flex flex-col relative overflow-hidden bg-background">
                {/* Header Superior Dinámico */}
                {location.pathname !== '/command-center' && (
                    <header className="h-[80px] border-b border-border/60 bg-background/80 backdrop-blur-xl flex items-center justify-between px-10 z-10 shrink-0 shadow-sm">
                        {pageHeader ? (
                            <div className="min-w-0 flex-1 animate-in fade-in slide-in-from-left-4 duration-500">
                                {pageHeader}
                            </div>
                        ) : (
                            <div className="flex items-center gap-4 animate-in fade-in slide-in-from-left-4 duration-500">
                                <div className="flex items-center justify-center w-10 h-10 rounded-xl bg-primary/10 text-primary border border-primary/20 shadow-inner">
                                    <CurrentIcon size={20} strokeWidth={2.5} />
                                </div>
                                <div>
                                    <h2 className="text-xl font-bold tracking-tight text-foreground">{currentTitle}</h2>
                                    {profile && isSidebarOpen && (
                                        <span className="text-[10px] text-muted-foreground uppercase font-bold tracking-widest bg-white/5 px-2 py-0.5 rounded-md">
                                            {profile.roles?.display_name}
                                        </span>
                                    )}
                                </div>
                            </div>
                        )}

                        <div className="flex items-center gap-6">
                            <ModeToggle />
                            <div className="relative" ref={menuRef}>
                                <div 
                                    onClick={() => setIsProfileMenuOpen(!isProfileMenuOpen)}
                                    className="flex items-center gap-3 bg-white/5 px-4 py-1.5 rounded-full border border-white/5 hover:border-white/10 hover:bg-white/10 transition-all cursor-pointer shadow-sm group"
                                >
                                    <span className="text-xs font-semibold text-muted-foreground group-hover:text-foreground hidden sm:inline transition-colors">@{profile?.username}</span>
                                    {profile?.avatar_url ? (
                                        <img src={profile.avatar_url} alt={profile.username} className="w-8 h-8 rounded-full border border-primary/20 object-cover shadow-inner group-hover:scale-105 transition-transform" />
                                    ) : (
                                        <div className="w-8 h-8 rounded-full bg-primary/10 border border-primary/20 flex items-center justify-center text-primary text-xs font-bold shadow-inner group-hover:bg-primary/20 transition-colors">
                                            {getInitials()}
                                        </div>
                                    )}
                                </div>

                                {/* Profile Dropdown Menu */}
                                <AnimatePresence>
                                    {isProfileMenuOpen && (
                                        <motion.div
                                            initial={{ opacity: 0, y: 10, scale: 0.95 }}
                                            animate={{ opacity: 1, y: 0, scale: 1 }}
                                            exit={{ opacity: 0, y: 10, scale: 0.95 }}
                                            transition={{ duration: 0.15 }}
                                            className="absolute right-0 mt-3 w-64 bg-card/95 backdrop-blur-3xl border border-border/50 rounded-2xl shadow-2xl z-50 overflow-hidden"
                                        >
                                            <div className="p-4 border-b border-border/50 bg-gradient-to-br from-primary/5 to-transparent">
                                                <p className="font-bold text-foreground text-sm truncate">{profile?.full_name || `@${profile?.username}`}</p>
                                                <p className="text-xs text-muted-foreground truncate">{user?.email}</p>
                                                <div className="mt-2 inline-flex items-center px-2 py-0.5 rounded-md bg-white/10 border border-white/5 text-[10px] font-bold tracking-wider uppercase text-foreground/80">
                                                    {profile?.roles?.display_name || 'Usuario'}
                                                </div>
                                            </div>
                                            <div className="p-2 space-y-1">
                                                <button 
                                                    onClick={openProfileModal}
                                                    className="w-full flex items-center gap-3 px-3 py-2 text-sm text-foreground/80 hover:text-foreground hover:bg-white/5 rounded-xl transition-colors text-left"
                                                >
                                                    <UserCircle size={16} />
                                                    <span>Editar Mi Perfil</span>
                                                </button>
                                                <button 
                                                    onClick={handleLogout}
                                                    className="w-full flex items-center gap-3 px-3 py-2 text-sm text-red-500/80 hover:text-red-400 hover:bg-red-500/10 rounded-xl transition-colors text-left"
                                                >
                                                    <LogOut size={16} />
                                                    <span>Cerrar Sesión</span>
                                                </button>
                                            </div>
                                        </motion.div>
                                    )}
                                </AnimatePresence>
                            </div>
                        </div>
                    </header>
                )}

                <div className={`flex-1 overflow-auto ${location.pathname === '/command-center' ? 'p-0' : location.pathname.startsWith('/monitoring') ? 'p-5' : 'p-8'}`}>
                    <PageHeaderContext.Provider value={setPageHeader}>
                        {children}
                    </PageHeaderContext.Provider>
                </div>
            </main>

            {/* Modal Editar Perfil */}
            <AnimatePresence>
                {isProfileModalOpen && (
                    <div className="fixed inset-0 z-[100] flex items-center justify-center px-4 bg-background/50 backdrop-blur-sm">
                        <motion.div
                            initial={{ opacity: 0, scale: 0.95, y: 20 }}
                            animate={{ opacity: 1, scale: 1, y: 0 }}
                            exit={{ opacity: 0, scale: 0.95, y: 20 }}
                            className="bg-card w-full max-w-md border border-border shadow-2xl rounded-2xl overflow-hidden relative"
                        >
                            {/* Header */}
                            <div className="bg-gradient-to-r from-blue-500/10 via-indigo-500/5 to-transparent border-b border-border/50 p-6 flex items-center gap-4">
                                {profile?.avatar_url ? (
                                    <img src={profile.avatar_url} alt="Avatar" className="w-12 h-12 rounded-xl object-cover border border-primary/20 shadow-inner" />
                                ) : (
                                    <div className="w-12 h-12 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center text-primary font-black text-lg shadow-inner">
                                        {getInitials()}
                                    </div>
                                )}
                                <div>
                                    <h2 className="text-xl font-black text-foreground">Tu Perfil</h2>
                                    <p className="text-xs text-muted-foreground font-medium">Actualiza tu identidad pública</p>
                                </div>
                                <button 
                                    onClick={() => setIsProfileModalOpen(false)}
                                    className="ml-auto w-8 h-8 rounded-full bg-white/5 hover:bg-white/10 flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors"
                                >
                                    <X size={16} />
                                </button>
                            </div>

                            {/* Formulario */}
                            <form onSubmit={handleSaveProfile} className="p-6 space-y-5">
                                <div className="space-y-2">
                                    <label className="text-xs font-black uppercase tracking-widest text-muted-foreground flex items-center gap-2">
                                        <User size={14} /> Nombre Completo
                                    </label>
                                    <input 
                                        type="text" 
                                        placeholder="Ej. Juan Pérez"
                                        className="w-full bg-background border border-border rounded-xl px-4 py-3 text-sm focus:border-primary/50 focus:ring-1 focus:ring-primary/50 transition-all outline-none text-foreground"
                                        value={profileForm.full_name}
                                        onChange={(e) => setProfileForm({...profileForm, full_name: e.target.value})}
                                    />
                                </div>
                                
                                <div className="space-y-2">
                                    <label className="text-xs font-black uppercase tracking-widest text-muted-foreground flex items-center gap-2">
                                        <Image size={14} /> URL de Avatar
                                    </label>
                                    <input 
                                        type="url" 
                                        placeholder="https://ejemplo.com/mifoto.jpg"
                                        className="w-full bg-background border border-border rounded-xl px-4 py-3 text-sm focus:border-primary/50 focus:ring-1 focus:ring-primary/50 transition-all outline-none text-foreground"
                                        value={profileForm.avatar_url}
                                        onChange={(e) => setProfileForm({...profileForm, avatar_url: e.target.value})}
                                    />
                                </div>

                                <div className="pt-2">
                                    <button 
                                        type="submit" 
                                        disabled={isSavingProfile}
                                        className="w-full bg-primary text-primary-foreground font-bold rounded-xl px-4 py-3 text-sm hover:shadow-[0_0_20px_rgba(59,130,246,0.4)] transition-all flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                                    >
                                        {isSavingProfile ? <Loader2 size={18} className="animate-spin" /> : 'Guardar Cambios'}
                                    </button>
                                </div>
                            </form>
                        </motion.div>
                    </div>
                )}
            </AnimatePresence>
        </div>
    );
}
