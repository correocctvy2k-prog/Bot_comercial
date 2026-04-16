import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

const ProtectedRoute = ({ children, module }) => {
    const { user, profile, loading, hasPermission } = useAuth();
    const location = useLocation();

    if (loading) {
        return (
            <div className="flex h-screen w-full items-center justify-center bg-background">
                <div className="flex flex-col items-center gap-4">
                    <div className="h-12 w-12 animate-spin rounded-full border-4 border-primary border-t-transparent shadow-lg shadow-primary/20"></div>
                    <p className="text-sm font-medium text-muted-foreground animate-pulse">Iniciando sesión segura...</p>
                </div>
            </div>
        );
    }

    if (!user) {
        // Redirigir al login si no hay usuario
        return <Navigate to="/login" state={{ from: location }} replace />;
    }

    if (module && !hasPermission(module)) {
        // Redirigir a la home si no tiene permiso para el módulo específico
        return <Navigate to="/" replace />;
    }

    return children;
};

export default ProtectedRoute;
