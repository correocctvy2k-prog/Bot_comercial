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
    const [activeTab, setActiveTab] = useState('users'); // 'users' | 'roles'
    const [modules, setModules] = useState([]);
    const [loading, setLoading] = useState(true);
    const [searchQuery, setSearchQuery] = useState('');
    const [isAddModalOpen, setIsAddModalOpen] = useState(false);
    const [isRoleModalOpen, setIsRoleModalOpen] = useState(false);
    
    // Form state for new user
    const [newUser, setNewUser] = useState({
        username: '',
        email: '',
        full_name: '',
        role_id: ''
    });

    // Form state for role
    const [editingRole, setEditingRole] = useState(null); // null means "Create"
    const [roleForm, setRoleForm] = useState({
        name: '',
        display_name: '',
        moduleIds: []
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

            // Fetch roles with their assigned module IDs
            const { data: rolesData, error: rError } = await supabase
                .from('roles')
                .select(`
                    *,
                    role_modules (
                        module_id
                    )
                `);

            if (rError) throw rError;

            // Fetch all available modules
            const { data: modulesData, error: mError } = await supabase
                .from('modules')
                .select('*')
                .order('name');

            if (mError) throw mError;

            setUsers(profiles);
            setRoles(rolesData);
            setModules(modulesData);
        } catch (error) {
            toast.error('Error al cargar datos');
            console.error(error);
        } finally {
            setLoading(false);
        }
    };

    const handleSaveRole = async (e) => {
        e.preventDefault();
        setLoading(true);
        try {
            let roleId = editingRole?.id;

            if (!editingRole) {
                // Create New Role
                const { data, error } = await supabase
                    .from('roles')
                    .insert([{ name: roleForm.name, display_name: roleForm.display_name }])
                    .select()
                    .single();
                if (error) throw error;
                roleId = data.id;
            } else {
                // Update Existing Role
                const { error } = await supabase
                    .from('roles')
                    .update({ name: roleForm.name, display_name: roleForm.display_name })
                    .eq('id', roleId);
                if (error) throw error;
            }

            // Sync Permissions (role_modules)
            // 1. Delete old
            await supabase.from('role_modules').delete().eq('role_id', roleId);
            
            // 2. Insert new
            if (roleForm.moduleIds.length > 0) {
                const newPerms = roleForm.moduleIds.map(mId => ({
                    role_id: roleId,
                    module_id: mId
                }));
                const { error: pError } = await supabase.from('role_modules').insert(newPerms);
                if (pError) throw pError;
            }

            toast.success(editingRole ? 'Rol actualizado' : 'Rol creado con éxito');
            setIsRoleModalOpen(false);
            fetchData();
        } catch (error) {
            toast.error('Error al guardar rol', { description: error.message });
        } finally {
            setLoading(false);
        }
    };

    const openRoleModal = (role = null) => {
        if (role) {
            setEditingRole(role);
            setRoleForm({
                name: role.name,
                display_name: role.display_name,
                moduleIds: role.role_modules?.map(rm => rm.module_id) || []
            });
        } else {
            setEditingRole(null);
            setRoleForm({ name: '', display_name: '', moduleIds: [] });
        }
        setIsRoleModalOpen(true);
    };

    const handleModuleToggle = (mId) => {
        // Superadmin Protection: Cannot remove 'users-management' access
        if (editingRole?.name === 'superadmin') {
            const mod = modules.find(m => m.id === mId);
            if (mod?.module_key === 'users-management') {
                toast.warning('Protección de Sistema: El rol Superadmin debe mantener acceso al módulo de Usuarios.');
                return;
            }
        }

        setRoleForm(prev => {
            const isSelected = prev.moduleIds.includes(mId);
            return {
                ...prev,
                moduleIds: isSelected 
                    ? prev.moduleIds.filter(id => id !== mId)
                    : [...prev.moduleIds, mId]
            };
        });
    };

    const handleCreateUser = async (e) => {
        e.preventDefault();
        setLoading(true);
        try {
            toast.info('Creando perfil de usuario...');
            
            const { error } = await supabase.from('profiles').insert([
                {
                    username: newUser.username,
                    email: newUser.email,
                    full_name: newUser.full_name,
                    role_id: newUser.role_id,
                    is_active: true
                }
            ]);

            if (error) throw error;

            toast.success('Usuario registrado con éxito.');
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
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
                <div>
                    <h1 className="text-3xl font-black tracking-tight text-foreground flex items-center gap-3">
                        <Users className="text-blue-500" size={32} />
                        Centro de Identidad
                    </h1>
                    <p className="text-muted-foreground mt-1 font-medium">
                        Administra cuentas, roles y permisos de acceso al ecosistema.
                    </p>
                </div>

                <div className="flex items-center gap-3">
                    <button 
                        onClick={() => activeTab === 'users' ? setIsAddModalOpen(true) : openRoleModal()}
                        className="bg-primary text-primary-foreground px-6 py-3 rounded-2xl font-bold flex items-center gap-2 shadow-lg shadow-primary/20 hover:scale-[1.02] active:scale-[0.98] transition-all"
                    >
                        {activeTab === 'users' ? <UserPlus size={20} /> : <Shield size={20} />}
                        {activeTab === 'users' ? 'Crear Usuario' : 'Nuevo Rol'}
                    </button>
                </div>
            </div>

            {/* Tabs Selector */}
            <div className="flex items-center gap-2 p-1.5 bg-muted/30 rounded-2xl w-fit">
                <button 
                    onClick={() => setActiveTab('users')}
                    className={`px-6 py-2.5 rounded-xl font-bold text-sm transition-all ${activeTab === 'users' ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}
                >
                    Usuarios
                </button>
                <button 
                    onClick={() => setActiveTab('roles')}
                    className={`px-6 py-2.5 rounded-xl font-bold text-sm transition-all ${activeTab === 'roles' ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}
                >
                    Roles & Permisos
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

            {activeTab === 'users' ? (
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
                                            </div>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {roles.map((role) => (
                        <motion.div 
                            key={role.id}
                            initial={{ opacity: 0, scale: 0.95 }}
                            animate={{ opacity: 1, scale: 1 }}
                            className="bg-card border border-border/50 rounded-[32px] p-8 hover:border-primary/30 transition-all group relative overflow-hidden"
                        >
                            <div className="absolute top-0 right-0 p-6 opacity-0 group-hover:opacity-100 transition-opacity">
                                <button 
                                    onClick={() => openRoleModal(role)}
                                    className="p-3 bg-primary/10 text-primary rounded-2xl hover:bg-primary hover:text-primary-foreground transition-all shadow-lg"
                                >
                                    <Edit2 size={18} />
                                </button>
                            </div>

                            <div className={`w-14 h-14 rounded-2xl flex items-center justify-center mb-6 ${
                                role.name === 'superadmin' ? 'bg-purple-500/10 text-purple-500' : 
                                role.name === 'admin' ? 'bg-amber-500/10 text-amber-500' : 'bg-blue-500/10 text-blue-500'
                            }`}>
                                <Shield size={32} />
                            </div>

                            <h3 className="text-xl font-black text-foreground">{role.display_name}</h3>
                            <p className="text-xs font-bold text-muted-foreground uppercase tracking-widest mt-1 italic">@{role.name}</p>

                            <div className="mt-8 space-y-3">
                                <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Módulos Asignados ({role.role_modules?.length || 0})</p>
                                <div className="flex flex-wrap gap-2">
                                    {role.role_modules?.length > 0 ? (
                                        role.role_modules.slice(0, 4).map((rm, idx) => {
                                            const mod = modules.find(m => m.id === rm.module_id);
                                            return mod && (
                                                <span key={idx} className="px-2 py-1 bg-muted rounded-lg text-[9px] font-bold text-muted-foreground">
                                                    {mod.name}
                                                </span>
                                            );
                                        })
                                    ) : (
                                        <p className="text-[10px] text-red-500/70 font-bold italic">Sin acceso a módulos</p>
                                    )}
                                    {(role.role_modules?.length || 0) > 4 && (
                                        <span className="px-2 py-1 bg-muted rounded-lg text-[9px] font-bold text-muted-foreground">
                                            +{(role.role_modules?.length || 0) - 4} más
                                        </span>
                                    )}
                                </div>
                            </div>
                        </motion.div>
                    ))}

                    <button 
                        onClick={() => openRoleModal()}
                        className="border-2 border-dashed border-border/50 rounded-[32px] p-8 flex flex-col items-center justify-center gap-4 text-muted-foreground hover:border-primary/50 hover:text-primary transition-all group bg-transparent min-h-[250px]"
                    >
                        <div className="w-14 h-14 rounded-2xl bg-muted/30 flex items-center justify-center group-hover:bg-primary/10 transition-colors">
                            <Shield size={32} />
                        </div>
                        <div className="text-center">
                            <p className="font-black text-lg">Nuevo Rol</p>
                            <p className="text-xs font-medium italic opacity-70">Define una nueva jerarquía</p>
                        </div>
                    </button>
                </div>
            )}

            {/* Modal de Roles */}
            <AnimatePresence>
                {isRoleModalOpen && (
                    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
                        <motion.div 
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
                            onClick={() => setIsRoleModalOpen(false)}
                        />
                        <motion.div 
                            initial={{ scale: 0.9, opacity: 0 }}
                            animate={{ scale: 1, opacity: 1 }}
                            exit={{ scale: 0.9, opacity: 0 }}
                            className="relative w-full max-w-2xl bg-card border border-border rounded-[32px] p-10 overflow-hidden shadow-2xl maxHeight-[90vh] overflow-y-auto"
                        >
                            <div className="absolute top-0 right-0 p-8">
                                <button onClick={() => setIsRoleModalOpen(false)} className="text-muted-foreground hover:text-foreground p-2 rounded-xl hover:bg-white/5">
                                    <XCircle size={24} />
                                </button>
                            </div>

                            <div className="relative z-10">
                                <div className="mb-8">
                                    <h2 className="text-2xl font-black tracking-tight flex items-center gap-3">
                                        <div className="bg-primary/20 text-primary p-2.5 rounded-2xl">
                                            <Shield size={24} />
                                        </div>
                                        {editingRole ? 'Editar Rol' : 'Crear Nuevo Rol'}
                                    </h2>
                                    <p className="text-muted-foreground text-sm font-medium mt-1 italic">
                                        {editingRole ? `Configurando permisos para @${editingRole.name}` : 'Define un nuevo nivel de acceso al sistema.'}
                                    </p>
                                </div>

                                <form onSubmit={handleSaveRole} className="space-y-6">
                                    <div className="grid grid-cols-2 gap-4">
                                        <div className="space-y-2">
                                            <label className="text-xs font-black uppercase tracking-widest text-muted-foreground ml-1">Nombre Público</label>
                                            <input 
                                                type="text" required placeholder="p. ej: Soporte Técnico"
                                                className="w-full bg-background border border-border/50 rounded-2xl py-3.5 px-4 text-sm focus:ring-2 focus:ring-primary/20 focus:border-primary/50 outline-none font-medium text-foreground"
                                                value={roleForm.display_name}
                                                onChange={(e) => setRoleForm({...roleForm, display_name: e.target.value})}
                                            />
                                        </div>
                                        <div className="space-y-2">
                                            <label className="text-xs font-black uppercase tracking-widest text-muted-foreground ml-1">Key Interna (slug)</label>
                                            <input 
                                                type="text" required placeholder="p. ej: tech-support"
                                                disabled={!!editingRole}
                                                className="w-full bg-background border border-border/50 rounded-2xl py-3.5 px-4 text-sm focus:ring-2 focus:ring-primary/20 focus:border-primary/50 outline-none font-medium disabled:opacity-50"
                                                value={roleForm.name}
                                                onChange={(e) => setRoleForm({...roleForm, name: e.target.value.toLowerCase().replace(/\s+/g, '-')})}
                                            />
                                        </div>
                                    </div>

                                    <div className="space-y-4">
                                        <p className="text-xs font-black uppercase tracking-widest text-muted-foreground ml-1">Módulos Disponibles</p>
                                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 max-h-[300px] overflow-y-auto pr-2 custom-scrollbar">
                                            {modules.map((mod) => (
                                                <div 
                                                    key={mod.id}
                                                    onClick={() => handleModuleToggle(mod.id)}
                                                    className={`p-4 rounded-2xl border transition-all cursor-pointer flex items-center justify-between group ${
                                                        roleForm.moduleIds.includes(mod.id)
                                                            ? 'bg-primary/5 border-primary/40' 
                                                            : 'bg-background border-border/30 hover:border-border/60'
                                                    }`}
                                                >
                                                    <div>
                                                        <p className={`font-bold text-sm ${roleForm.moduleIds.includes(mod.id) ? 'text-primary' : 'text-foreground'}`}>
                                                            {mod.name}
                                                        </p>
                                                        <p className="text-[10px] text-muted-foreground italic font-medium">@{mod.module_key}</p>
                                                    </div>
                                                    <div className={`w-5 h-5 rounded-md border-2 transition-all flex items-center justify-center ${
                                                        roleForm.moduleIds.includes(mod.id)
                                                            ? 'bg-primary border-primary'
                                                            : 'border-border/50'
                                                    }`}>
                                                        {roleForm.moduleIds.includes(mod.id) && <CheckCircle2 size={14} className="text-primary-foreground" />}
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    </div>

                                    <div className="pt-4">
                                        <button 
                                            type="submit"
                                            disabled={loading}
                                            className="w-full bg-primary text-primary-foreground py-4 rounded-2xl font-black shadow-xl shadow-primary/20 hover:scale-[1.01] active:scale-[0.98] transition-all flex items-center justify-center gap-3 disabled:opacity-50"
                                        >
                                            {loading ? <Loader2 className="animate-spin" size={20} /> : <Shield size={20} />}
                                            {editingRole ? 'GUARDAR CAMBIOS' : 'CREAR ROL DEFINITIVO'}
                                        </button>
                                    </div>
                                </form>
                            </div>
                        </motion.div>
                    </div>
                )}
            </AnimatePresence>

            {/* Modal de Nuevo Usuario */}
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
                                <button onClick={() => setIsAddModalOpen(false)} className="text-muted-foreground hover:text-foreground p-2 rounded-xl hover:bg-white/5 transition-colors">
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
                                    <p className="text-muted-foreground text-sm font-medium mt-1 italic">Ingresa los datos para la nueva cuenta en el ecosistema.</p>
                                </div>

                                <form onSubmit={handleCreateUser} className="space-y-6">
                                    <div className="space-y-2">
                                        <label className="text-xs font-black uppercase tracking-widest text-muted-foreground ml-1">Nombre Completo</label>
                                        <input 
                                            type="text" required placeholder="p. ej: Juan Pérez"
                                            className="w-full bg-background border border-border/50 rounded-2xl py-3.5 px-4 text-sm focus:ring-2 focus:ring-primary/20 focus:border-primary/50 outline-none font-medium text-foreground transition-all"
                                            value={newUser.full_name}
                                            onChange={(e) => setNewUser({...newUser, full_name: e.target.value})}
                                        />
                                    </div>

                                    <div className="grid grid-cols-2 gap-4">
                                        <div className="space-y-2">
                                            <label className="text-xs font-black uppercase tracking-widest text-muted-foreground ml-1">Username</label>
                                            <input 
                                                type="text" required placeholder="jperez"
                                                className="w-full bg-background border border-border/50 rounded-2xl py-3.5 px-4 text-sm focus:ring-2 focus:ring-primary/20 focus:border-primary/50 outline-none font-medium text-foreground transition-all"
                                                value={newUser.username}
                                                onChange={(e) => setNewUser({...newUser, username: e.target.value.toLowerCase().replace(/\s/g, '')})}
                                            />
                                        </div>
                                        <div className="space-y-2">
                                            <label className="text-xs font-black uppercase tracking-widest text-muted-foreground ml-1">Email</label>
                                            <input 
                                                type="email" required placeholder="juan@skylab.com"
                                                className="w-full bg-background border border-border/50 rounded-2xl py-3.5 px-4 text-sm focus:ring-2 focus:ring-primary/20 focus:border-primary/50 outline-none font-medium text-foreground transition-all"
                                                value={newUser.email}
                                                onChange={(e) => setNewUser({...newUser, email: e.target.value})}
                                            />
                                        </div>
                                    </div>

                                    <div className="space-y-2">
                                        <label className="text-xs font-black uppercase tracking-widest text-muted-foreground ml-1">Rol Asignado</label>
                                        <select 
                                            required
                                            className="w-full bg-background border border-border/50 rounded-2xl py-3.5 px-4 text-sm focus:ring-2 focus:ring-primary/20 focus:border-primary/50 outline-none font-medium text-foreground appearance-none transition-all cursor-pointer"
                                            value={newUser.role_id}
                                            onChange={(e) => setNewUser({...newUser, role_id: e.target.value})}
                                        >
                                            <option value="">Selecciona un rol...</option>
                                            {roles.map(role => (
                                                <option key={role.id} value={role.id}>{role.display_name}</option>
                                            ))}
                                        </select>
                                    </div>

                                    <div className="pt-4">
                                        <button 
                                            type="submit"
                                            disabled={loading}
                                            className="w-full bg-primary text-primary-foreground py-4 rounded-2xl font-black shadow-xl shadow-primary/20 hover:scale-[1.01] active:scale-[0.98] transition-all flex items-center justify-center gap-3 disabled:opacity-50"
                                        >
                                            {loading ? <Loader2 className="animate-spin" size={20} /> : <UserPlus size={20} />}
                                            CONFIRMAR REGISTRO
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
