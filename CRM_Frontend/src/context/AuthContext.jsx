import { createContext, useContext, useEffect, useState } from 'react';
import { supabase } from '../services/supabase';

const AuthContext = createContext({});

export const AuthProvider = ({ children }) => {
    const [user, setUser] = useState(null);
    const [profile, setProfile] = useState(null);
    const [permissions, setPermissions] = useState([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        // 1. Obtener la sesión inicial
        const initAuth = async () => {
            const { data: { session } } = await supabase.auth.getSession();
            if (session) {
                await fetchProfileAndPermissions(session.user);
            }
            setLoading(false);
        };

        initAuth();

        // 2. Escuchar cambios de estado
        const { data: { subscription } } = supabase.auth.onAuthStateChange(async (_event, session) => {
            if (session) {
                await fetchProfileAndPermissions(session.user);
            } else {
                setUser(null);
                setProfile(null);
                setPermissions([]);
            }
            setLoading(false);
        });

        return () => subscription.unsubscribe();
    }, []);

    const fetchProfileAndPermissions = async (authUser) => {
        try {
            setUser(authUser);
            
            // Traer perfil con el nombre del rol
            const { data: profileData, error: profileError } = await supabase
                .from('profiles')
                .select('*, roles(name, display_name)')
                .eq('id', authUser.id)
                .single();

            if (profileError) throw profileError;
            setProfile(profileData);

            // Traer módulos permitidos para este rol
            const { data: modulesData, error: modulesError } = await supabase
                .from('role_modules')
                .select('modules(module_key)')
                .eq('role_id', profileData.role_id);

            if (modulesError) throw modulesError;
            
            const moduleKeys = modulesData.map(rm => rm.modules.module_key);
            setPermissions(moduleKeys);

        } catch (error) {
            console.error('Error fetching auth metadata:', error.message);
        }
    };

    const login = async (email, password) => {
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
            hasPermission
        }}>
            {children}
        </AuthContext.Provider>
    );
};

export const useAuth = () => useContext(AuthContext);
