import { supabase } from "./supabase";

export const getAsambleaStats = async (totalCenso = 300) => {
    try {
        // Obtenemos todos los registros de la asamblea
        const { data, error } = await supabase
            .from("asamblea_registro")
            .select("*")
            .order("created_at", { ascending: false });

        if (error) {
            console.error("Error fetching asamblea stats:", error);
            throw error;
        }

        // Calcular KPIs en memoria (son pocos, así que no hay problema con rendimiento)
        const total = data.length;
        const asociados = data.filter(r => 
            r.rol === "ASOCIADO" || 
            r.rol === "Accionista" || 
            (r.categoria_oficial === "ACCIONISTA" && r.rol !== "REPRESENTANTE" && r.rol !== "Apoderado")
        ).length;
        
        const apoderadosGroup = data.filter(r => 
            r.rol === "REPRESENTANTE" || 
            r.rol === "Apoderado" || 
            r.rol === "Representante Legal" ||
            r.categoria_oficial === "APODERADO" || 
            r.categoria_oficial === "REPRESENTANTE_LEGAL"
        ).length;
        
        const invitados = data.filter(r => 
            r.rol === "Invitado" || 
            r.categoria_oficial === "INVITADO"
        ).length;

        const syncOk = data.filter(r => r.status === "SYNC_OK").length;
        const syncFailed = data.filter(r => r.status === "SYNC_FAILED").length;

        // Porcentaje de quórum dinámico
        const quorumPercentage = totalCenso > 0 ? ((total / totalCenso) * 100).toFixed(1) : 0;

        return {
            totalRegistrados: total,
            asociados,
            representantes: apoderadosGroup,
            invitados,
            quorumPercentage,
            syncOk,
            syncFailed,
            recentLogs: data.slice(0, 15) // Últimos 15 registros para la tabla
        };
    } catch (err) {
        console.error("getAsambleaStats Exception:", err);
        return null;
    }
};

// Suscripción en tiempo real a la tabla
export const subscribeToAsamblea = (callback) => {
    const subscription = supabase
        .channel('asamblea-changes')
        .on(
            'postgres_changes',
            { event: '*', schema: 'public', table: 'asamblea_registro' },
            (payload) => {
                callback(payload);
            }
        )
        .subscribe();

    return () => {
        supabase.removeChannel(subscription);
    };
};

// Consultar los asambleístas que faltan por ingresar (Cruce SIISS vs Supabase)
export const getFaltantesAsamblea = async () => {
    try {
        const backendUrl = import.meta.env.VITE_ASAMBLEA_BACKEND_URL || 'http://localhost:3002';
        const res = await fetch(`${backendUrl}/api/asamblea/faltantes`);
        if (!res.ok) throw new Error(`HTTP error! status: ${res.status}`);
        return await res.json();
    } catch (err) {
        console.error("Error al obtener faltantes desde el backend:", err);
        return null;
    }
};

// Eliminar un registro de asamblea
export const deleteAsambleaRecord = async (id) => {
    try {
        const { error } = await supabase
            .from("asamblea_registro")
            .delete()
            .eq("id", id);
        if (error) throw error;
        return true;
    } catch (err) {
        console.error("Error deleting asamblea record:", err);
        return false;
    }
};

// Sincronizar el padrón desde SIISS
export const syncAsambleaPadron = async () => {
    try {
        const backendUrl = import.meta.env.VITE_ASAMBLEA_BACKEND_URL || 'http://localhost:3002';
        const res = await fetch(`${backendUrl}/api/asamblea/sync-padron`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' }
        });
        if (!res.ok) throw new Error(`HTTP error! status: ${res.status}`);
        return await res.json();
    } catch (err) {
        console.error("Error en syncAsambleaPadron:", err);
        return null;
    }
};

// Reiniciar los resultados del quiz
export const clearQuizResults = async () => {
    try {
        const backendUrl = import.meta.env.VITE_ASAMBLEA_BACKEND_URL || 'http://localhost:3002';
        const res = await fetch(`${backendUrl}/api/asamblea/quiz/clear`, {
            method: 'DELETE'
        });
        if (!res.ok) throw new Error(`HTTP error! status: ${res.status}`);
        return await res.json();
    } catch (err) {
        console.error("Error en clearQuizResults:", err);
        return null;
    }
};
