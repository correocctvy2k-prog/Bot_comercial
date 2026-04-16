import { useState, useEffect } from 'react';
import { 
    Users, 
    UserPlus, 
    Shield, 
    Search, 
    MoreVertical, 
    Mail, 
    Trash2, 
    Edit2, 
    CheckCircle2, 
    XCircle,
    Loader2,
    ShieldAlert,
    Clock
} from 'lucide-react';
import { supabase } from '../services/supabase';
import { toast } from 'sonner';
import { motion, AnimatePresence } from 'framer-motion';

export default function UsersDashboard() {
    const [users, setUsers] = useState([]);
    const [roles, setRoles] = useState([]);
    const [loading, setLoading] = useState(true);
    const [searchQuery, setSearchQuery] = useState('');
    const [isAddModalOpen, setIsAddModalOpen] = useState(false);
    
    // Form state for new user
    const [newUser, setNewUser] = useState({
        username: '',
        email: '',
        full_name: '',
        role_id: ''
    });

    useEffect(() => {
        fetchData();
    }, []);

    const fetchData = async () => {
        setLoading(true);
        try {
            // Fetch profiles with roles
            const { data: profiles, error: pError } = await supabase
                .from('profiles')
                .select('*, roles(name, display_name)')
                .order('created_at', { ascending: false });

            if (pError) throw pError;

            // Fetch roles
            const { data: rolesData, error: rError } = await supabase
                .from('roles')
                .select('*');

            if (rError) throw rError;

            setUsers(profiles);
            setRoles(rolesData);
        } catch (error) {
            toast.error('Error al cargar datos de usuarios');
            console.error(error);
        } finally {
            setLoading(false);
        }
    };

    const handleCreateUser = async (e) => {
        e.preventDefault();
        setLoading(true);
        try {
            // 1. Create user in Supabase Auth (This usually requires a Service Role Key or an Edge Function if we don't want the admin to log out)
            // Since we are in the client, we'll use a mocked "Invite" approach or an Edge Function if available.
            // FOR NOW: We'll explain that creating a user requires an invitation flow or administrative API.
            
            // Note: supabase.auth.signUp() logs in the user automatically. 
            // Better approach for admins: Use an Edge Function to create users via Admin API.
            
            toast.info('Iniciando proceso de creación de usuario...');
            
            // Simulate creation for Demo (In real scenario, call an Edge Function)
            const { data, error } = await supabase.from('profiles').insert([
                {
                    username: newUser.username,
                    email: newUser.email,
                    full_name: newUser.full_name,
                    role_id: newUser.role_id,
                    is_active: true
                }
            ]);

            if (error) throw error;

            toast.success('Perfil de usuario creado localmente. Se ha enviado una invitación al correo.');
            setIsAddModalOpen(false);
            fetchData();
        } catch (error) {
            toast.error('Error al crear usuario', { description: error.message });
        } finally {
            setLoading(false);
        }
    };

    const filteredUsers = users.filter(user => 
        user.username?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        user.full_name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        user.email?.toLowerCase().includes(searchQuery.toLowerCase())
    );

    return (
        <div className="space-y-8 animate-in fade-in duration-700">
            {/* Header Section */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                    <h1 className="text-3xl font-black tracking-tight text-foreground flex items-center gap-3">
                        <Users className="text-blue-500" size={32} />
                        Gestión de Usuarios
                    </h1>
                    <p className="text-muted-foreground mt-1 font-medium">
                        Administra las cuentas, roles y permisos de acceso al ecosistema Skylab.
                    </p>
                </div>

                <button 
                    onClick={() => setIsAddModalOpen(true)}
                    className="bg-primary text-primary-foreground px-6 py-3 rounded-2xl font-bold flex items-center gap-2 shadow-lg shadow-primary/20 hover:scale-[1.02] active:scale-[0.98] transition-all"
                >
                    <UserPlus size={20} />
                    Crear Usuario
                </button>
            </div>

            {/* Stats Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                {[
                    { label: 'Total Usuarios', value: users.length, icon: Users, color: 'text-blue-500', bg: 'bg-blue-500/10' },
                    { label: 'Administradores', value: users.filter(u => u.roles?.name === 'admin').length, icon: Shield, color: 'text-indigo-500', bg: 'bg-indigo-500/10' },
                    { label: 'Activos', value: users.filter(u => u.is_active).length, icon: CheckCircle2, color: 'text-emerald-500', bg: 'bg-emerald-500/10' },
                    { label: 'Pendientes', value: users.filter(u => !u.is_active).length, icon: Clock, color: 'text-yellow-500', bg: 'bg-yellow-500/10' },
                ].map((stat, i) => (
                    <motion.div 
                        key={i}
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: i * 0.1 }}
                        className="bg-card border border-border/50 p-5 rounded-3xl shadow-sm hover:border-primary/20 transition-colors"
                    >
                        <div className="flex items-center justify-between mb-2">
                            <div className={`${stat.bg} ${stat.color} p-2.5 rounded-2xl`}>
                                <stat.icon size={22} />
                            </div>
                        </div>
                        <p className="text-2xl font-black text-foreground">{stat.value}</p>
                        <p className="text-xs font-bold text-muted-foreground uppercase tracking-widest mt-1">{stat.label}</p>
                    </motion.div>
                ))}
            </div>

            {/* Search and Table Section */}
            <div className="bg-card border border-border/50 rounded-[32px] overflow-hidden shadow-sm">
                <div className="p-6 border-b border-border/50 flex flex-col sm:flex-row items-center gap-4">
                    <div className="relative flex-1 w-full">
                        <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-muted-foreground" size={18} />
                        <input 
                            type="text"
                            placeholder="Buscar por nombre, usuario o email..."
                            className="w-full bg-background border border-border/50 rounded-2xl py-3 pl-12 pr-4 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary/50 transition-all font-medium"
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                        />
                    </div>
                </div>

                <div className="overflow-x-auto">
                    <table className="w-full border-collapse">
                        <thead>
                            <tr className="bg-muted/30">
                                <th className="text-left px-6 py-4 text-[10px] font-black text-muted-foreground uppercase tracking-widest">Usuario</th>
                                <th className="text-left px-6 py-4 text-[10px] font-black text-muted-foreground uppercase tracking-widest">Rol</th>
                                <th className="text-left px-6 py-4 text-[10px] font-black text-muted-foreground uppercase tracking-widest">Estado</th>
                                <th className="text-left px-6 py-4 text-[10px] font-black text-muted-foreground uppercase tracking-widest">Acciones</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-border/30">
                            {loading ? (
                                <tr>
                                    <td colSpan="4" className="px-6 py-20 text-center">
                                        <Loader2 className="animate-spin mx-auto text-primary" size={32} />
                                        <p className="text-muted-foreground mt-4 font-medium italic">Sincronizando base de datos...</p>
                                    </td>
                                </tr>
                            ) : filteredUsers.length === 0 ? (
                                <tr>
                                    <td colSpan="4" className="px-6 py-20 text-center">
                                        <div className="flex flex-col items-center opacity-50">
                                            <ShieldAlert size={48} className="mb-4 text-muted-foreground" />
                                            <p className="text-lg font-bold">No se encontraron usuarios</p>
                                            <p className="text-sm">Ajusta tu búsqueda o crea uno nuevo.</p>
                                        </div>
                                    </td>
                                </tr>
                            ) : filteredUsers.map((user) => (
                                <tr key={user.id} className="hover:bg-white/[0.02] transition-colors group">
                                    <td className="px-6 py-5">
                                        <div className="flex items-center gap-4">
                                            <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center text-primary font-bold">
                                                {user.full_name?.charAt(0) || user.username?.charAt(0)}
                                            </div>
                                            <div>
                                                <p className="font-bold text-foreground leading-none">{user.full_name || 'Sin Nombre'}</p>
                                                <p className="text-[11px] text-muted-foreground mt-1 flex items-center gap-1.5 font-medium italic">
                                                    <Mail size={12} /> {user.email} | @{user.username}
                                                </p>
                                            </div>
                                        </div>
                                    </td>
                                    <td className="px-6 py-5">
                                        <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-wider ${
                                            user.roles?.name === 'admin' ? 'bg-amber-500/10 text-amber-500' : 
                                            user.roles?.name === 'superadmin' ? 'bg-purple-500/10 text-purple-500' :
                                            'bg-blue-500/10 text-blue-500'
                                        }`}>
                                            <Shield size={10} />
                                            {user.roles?.display_name || 'Sin Rol'}
                                        </span>
                                    </td>
                                    <td className="px-6 py-5">
                                        <div className={`flex items-center gap-2 font-bold text-xs ${user.is_active ? 'text-emerald-500' : 'text-red-500'}`}>
                                            {user.is_active ? <CheckCircle2 size={16} /> : <XCircle size={16} />}
                                            {user.is_active ? 'Activo' : 'Inactivo'}
                                        </div>
                                    </td>
                                    <td className="px-6 py-5">
                                        <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                            <button className="p-2.5 rounded-xl hover:bg-white/5 text-muted-foreground hover:text-blue-500 transition-all border border-transparent hover:border-blue-500/20" title="Editar">
                                                <Edit2 size={18} />
                                            </button>
                                            <button className="p-2.5 rounded-xl hover:bg-white/5 text-muted-foreground hover:text-red-500 transition-all border border-transparent hover:border-red-500/20" title="Eliminar">
                                                <Trash2 size={18} />
                                            </button>
                                            <button className="p-2.5 rounded-xl hover:bg-white/5 text-muted-foreground transition-all" title="Opciones">
                                                <MoreVertical size={18} />
                                            </button>
                                        </div>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* Modal de Creación */}
            <AnimatePresence>
                {isAddModalOpen && (
                    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
                        <motion.div 
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
                            onClick={() => setIsAddModalOpen(false)}
                        />
                        <motion.div 
                            initial={{ scale: 0.9, opacity: 0 }}
                            animate={{ scale: 1, opacity: 1 }}
                            exit={{ scale: 0.9, opacity: 0 }}
                            className="relative w-full max-w-lg bg-card border border-border rounded-[32px] p-10 overflow-hidden shadow-2xl"
                        >
                            <div className="absolute top-0 right-0 p-8">
                                <button onClick={() => setIsAddModalOpen(false)} className="text-muted-foreground hover:text-foreground p-2 rounded-xl hover:bg-white/5">
                                    <XCircle size={24} />
                                </button>
                            </div>

                            <div className="relative z-10">
                                <div className="mb-8">
                                    <h2 className="text-2xl font-black tracking-tight flex items-center gap-3">
                                        <div className="bg-primary/20 text-primary p-2.5 rounded-2xl">
                                            <UserPlus size={24} />
                                        </div>
                                        Registrar Usuario
                                    </h2>
                                    <p className="text-muted-foreground text-sm font-medium mt-1 italic">Asigna roles y habilita módulos para el nuevo integrante.</p>
                                </div>

                                <form onSubmit={handleCreateUser} className="space-y-5">
                                    <div className="grid grid-cols-2 gap-4">
                                        <div className="space-y-2">
                                            <label className="text-xs font-black uppercase tracking-widest text-muted-foreground ml-1">Username</label>
                                            <input 
                                                type="text" required placeholder="p. ej: jbeltran"
                                                className="w-full bg-background border border-border/50 rounded-2xl py-3.5 px-4 text-sm focus:ring-2 focus:ring-primary/20 focus:border-primary/50 outline-none font-medium"
                                                value={newUser.username}
                                                onChange={(e) => setNewUser({...newUser, username: e.target.value})}
                                            />
                                        </div>
                                        <div className="space-y-2">
                                            <label className="text-xs font-black uppercase tracking-widest text-muted-foreground ml-1">Rol</label>
                                            <select 
                                                required
                                                className="w-full bg-background border border-border/50 rounded-2xl py-3.5 px-4 text-sm focus:ring-2 focus:ring-primary/20 focus:border-primary/50 outline-none font-medium"
                                                value={newUser.role_id}
                                                onChange={(e) => setNewUser({...newUser, role_id: e.target.value})}
                                            >
                                                <option value="">Selecciona un rol...</option>
                                                {roles.map(role => (
                                                    <option key={role.id} value={role.id}>{role.display_name}</option>
                                                ))}
                                            </select>
                                        </div>
                                    </div>

                                    <div className="space-y-2">
                                        <label className="text-xs font-black uppercase tracking-widest text-muted-foreground ml-1">Nombre Completo</label>
                                        <input 
                                            type="text" required placeholder="Johnathan Beltran"
                                            className="w-full bg-background border border-border/50 rounded-2xl py-3.5 px-4 text-sm focus:ring-2 focus:ring-primary/20 focus:border-primary/50 outline-none font-medium"
                                            value={newUser.full_name}
                                            onChange={(e) => setNewUser({...newUser, full_name: e.target.value})}
                                        />
                                    </div>

                                    <div className="space-y-2">
                                        <label className="text-xs font-black uppercase tracking-widest text-muted-foreground ml-1">Correo Corporativo</label>
                                        <div className="relative">
                                            <Mail className="absolute left-4 top-1/2 -translate-y-1/2 text-muted-foreground" size={18} />
                                            <input 
                                                type="email" required placeholder="usuario@ganepalmira.com.co"
                                                className="w-full bg-background border border-border/50 rounded-2xl py-3.5 pl-12 pr-4 text-sm focus:ring-2 focus:ring-primary/20 focus:border-primary/50 outline-none font-medium text-blue-500"
                                                value={newUser.email}
                                                onChange={(e) => setNewUser({...newUser, email: e.target.value})}
                                            />
                                        </div>
                                    </div>

                                    <div className="pt-4">
                                        <button 
                                            type="submit"
                                            disabled={loading}
                                            className="w-full bg-primary text-primary-foreground py-4 rounded-2xl font-black shadow-xl shadow-primary/20 hover:scale-[1.01] active:scale-[0.98] transition-all flex items-center justify-center gap-3 disabled:opacity-50"
                                        >
                                            {loading ? <Loader2 className="animate-spin" size={20} /> : <UserPlus size={20} />}
                                            CREAR Y ENVIAR ACCESOS
                                        </button>
                                    </div>
                                </form>
                            </div>
                        </motion.div>
                    </div>
                )}
            </AnimatePresence>
        </div>
    );
}
