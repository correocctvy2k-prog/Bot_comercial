import { createContext, useContext, useEffect, useState } from 'react';
import { supabase } from '../services/supabase';

const AuthContext = createContext({});

export const AuthProvider = ({ children }) => {
    const [user, setUser] = useState(null);
    const [profile, setProfile] = useState(null);
    const [permissions, setPermissions] = useState([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        let mounted = true;
        // La autenticación nunca debe bloquear indefinidamente toda la interfaz.
        const loadingSafetyTimer = window.setTimeout(() => {
            if (mounted) {
                console.warn('Auth initialization timeout: liberando la interfaz.');
                setLoading(false);
            }
        }, 8000);

        const initAuth = async () => {
            try {
                const { data: { session } } = await supabase.auth.getSession();
                if (session && mounted) {
                    await fetchProfileAndPermissions(session.user);
                }
            } catch (err) {
                console.error("Auth Init Error:", err);
            } finally {
                if (mounted) setLoading(false);
            }
        };

        initAuth();

        const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
            if (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED' || event === 'PASSWORD_RECOVERY') {
                if (session && mounted) {
                    // No ejecutar consultas Supabase dentro del callback de Auth:
                    // puede producir un bloqueo mientras el cliente procesa el evento.
                    setUser(session.user);
                    window.setTimeout(async () => {
                        if (!mounted) return;
                        try {
                            await fetchProfileAndPermissions(session.user);
                        } finally {
                            if (mounted) setLoading(false);
                        }
                    }, 0);
                }
            } else if (event === 'SIGNED_OUT') {
                setUser(null);
                setProfile(null);
                setPermissions([]);
                setLoading(false);
            }
        });

        return () => {
            mounted = false;
            window.clearTimeout(loadingSafetyTimer);
            subscription.unsubscribe();
        };
    }, []);

    const fetchProfileAndPermissions = async (authUser) => {
        try {
            setUser(authUser);
            
            const { data: profileData, error: profileError } = await supabase
                .from('profiles')
                .select('*, roles(name, display_name)')
                .eq('id', authUser.id)
                .single();

            if (profileError) {
                if (profileError.code === 'PGRST116') {
                    console.warn("Perfil no encontrado para el usuario auth.");
                } else {
                    throw profileError;
                }
            }
            
            if (profileData) {
                setProfile(profileData);

                const { data: modulesData, error: modulesError } = await supabase
                    .from('role_modules')
                    .select('modules(module_key)')
                    .eq('role_id', profileData.role_id);

                if (modulesError) throw modulesError;
                
                const moduleKeys = modulesData?.map(rm => rm.modules?.module_key).filter(Boolean) || [];
                setPermissions(moduleKeys);
            }

        } catch (error) {
            console.error('Error fetching auth metadata:', error.message);
        }
    };

    const login = async (identifier, password) => {
        let email = identifier;

        // Si no contiene '@', intentamos resolver username -> email
        if (!identifier.includes('@')) {
            const { data: profileData, error: findError } = await supabase
                .from('profiles')
                .select('email')
                .eq('username', identifier)
                .maybeSingle();
            
            if (findError) throw new Error("Error al verificar el usuario");
            if (!profileData) throw new Error("El nombre de usuario no existe");
            email = profileData.email;
        }

        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
    };

    const logout = async () => {
        const { error } = await supabase.auth.signOut();
        if (error) throw error;
    };

    const hasPermission = (moduleKey) => {
        if (!profile) return false;
        // Superadmin y Admin ven todo si así se configuró en la DB
        return permissions.includes(moduleKey);
    };

    return (
        <AuthContext.Provider value={{
            user,
            profile,
            permissions,
            loading,
            login,
            logout,
            hasPermission,
            refreshProfile: () => user && fetchProfileAndPermissions(user)
        }}>
            {children}
        </AuthContext.Provider>
    );
};

export const useAuth = () => useContext(AuthContext);
