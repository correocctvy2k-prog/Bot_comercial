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
        // No redirigir a `/`: si la ruta inicial también exige un permiso se
        // produce un ciclo sin contenido. Mostrar un estado recuperable.
        return (
            <div className="flex h-screen w-full items-center justify-center bg-background p-6">
                <div className="w-full max-w-lg rounded-2xl border border-amber-500/20 bg-card p-8 text-center shadow-2xl">
                    <div className="mx-auto mb-4 grid h-12 w-12 place-items-center rounded-full bg-amber-500/10 text-amber-400 text-xl">!</div>
                    <h1 className="text-xl font-black">Perfil sin acceso disponible</h1>
                    <p className="mt-2 text-sm text-muted-foreground">
                        La sesión existe, pero no fue posible cargar el permiso <span className="font-mono text-foreground">{module}</span>.
                    </p>
                    <div className="mt-6 flex justify-center gap-2">
                        <button onClick={() => window.location.reload()} className="rounded-lg bg-primary px-4 py-2 text-sm font-bold text-primary-foreground">Reintentar</button>
                        <button onClick={() => window.location.assign('/login')} className="rounded-lg border border-border px-4 py-2 text-sm font-bold">Volver al login</button>
                    </div>
                </div>
            </div>
        );
    }

    return children;
};

export default ProtectedRoute;
