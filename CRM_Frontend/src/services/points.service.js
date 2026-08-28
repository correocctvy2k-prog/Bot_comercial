import { supabase } from './supabase';

const CCTV_API_BASE = (import.meta.env.VITE_CCTV_API_BASE || '').replace(/\/$/, '');

// --- MITIGACIÓN DE ERRORES DE RED (CIRCUIT BREAKER) ---
let mlServerDown = false;
let mlServerWarningSent = false;

export const pointsService = {
    async getPoints() {
        try {
            // Fetch all points
            const { data, error } = await supabase
                .from('puntos_venta')
                .select('*')
                .or('is_permanently_closed.eq.false,is_permanently_closed.is.null')
                .order('segment', { ascending: true });

            if (error) {
                console.error("Error fetching points:", error);
                throw error;
            }
            return data.sort((a, b) => (a.alias || '').localeCompare(b.alias || ''));
        } catch (error) {
            console.error('Error in pointsService.getPoints:', error);
            throw error;
        }
    },

    async updatePointLocation(id, lat, lng) {
        try {
            const { data, error } = await supabase
                .from('puntos_venta')
                .update({ lat, lng })
                .eq('id', id)
                .select()
                .single();
            if (error) throw error;
            return data;
        } catch (error) {
            console.error('Error updating point location:', error);
            throw error;
        }
    },

    async updatePointAttributes(id, attributes) {
        try {
            const { data, error } = await supabase
                .from('puntos_venta')
                .update(attributes)
                .eq('id', id)
                .select()
                .single();
            if (error) throw error;
            return data;
        } catch (error) {
            console.error('Error updating point attributes:', error);
            throw error;
        }
    },

    async sendOfficialWhatsAppAlert(phone, message) {
        try {
            // v12.2.3: Restauración de Envío Síncrono Directo (REST API)
            // Se utiliza el motor unificado de mensajería del backend para garantizar éxito inmediato
            const backendUrl = import.meta.env.VITE_BACKEND_URL || 'http://localhost:3001';
            const resp = await fetch(`${backendUrl}/api/send-whatsapp`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ phone, message })
            });

            if (!resp.ok) {
                const errorData = await resp.json().catch(() => ({ error: 'Error desconocido' }));
                throw new Error(errorData.error || 'Failed to send whatsapp message via API');
            }

            return await resp.json();
        } catch (error) {
            console.error('Error enviando WA API:', error);
            throw error;
        }
    },

    async getPointAnalytics(ip, days = 30, siisCode = null) {
        const today = new Intl.DateTimeFormat('en-CA', {
            timeZone: 'America/Bogota', year: 'numeric', month: '2-digit', day: '2-digit'
        }).format(new Date());
        const backendUrl = import.meta.env.VITE_BACKEND_URL || 'http://localhost:3001';
        const baseRequest = ip
            ? fetch(`${backendUrl}/api/points/${encodeURIComponent(ip)}/analytics?days=${days}`).then(r => r.ok ? r.json() : null).catch(() => null)
            : Promise.resolve(null);
        const cctvRequest = siisCode
            ? fetch(`${CCTV_API_BASE}/api/cctv/behavior/daily?siisCode=${encodeURIComponent(siisCode)}&date=${today}`).then(r => r.ok ? r.json() : null).catch(() => null)
            : Promise.resolve(null);
        const [base, cctv] = await Promise.all([baseRequest, cctvRequest]);
        if (!base && !cctv?.item) return null;
        return {
            ...(base && !base.error && base.analytics !== null ? base : {}),
            cctv_behavior: cctv?.item || null,
            behavior_date: cctv?.date || today
        };
    },

    async getPointsStats() {
        const { data, error } = await supabase
            .from('puntos_venta')
            .select('active, latency, segment, created_at, is_permanently_closed, last_online_at')
            .or('is_permanently_closed.eq.false,is_permanently_closed.is.null'); // excluir cerrados definitivamente

        if (error) throw error;

        const total = data.length; // ya excluye los cerrados definitivamente
        const active = data.filter(p => p.active).length;
        const inactive = data.filter(p => !p.active).length;

        // Advanced Metrics
        const now = new Date();
        const thirtyDaysAgo = new Date();
        thirtyDaysAgo.setDate(now.getDate() - 30);

        const threeDaysAgo = new Date();
        threeDaysAgo.setDate(now.getDate() - 3);

        const newPoints = data.filter(p => p.created_at && new Date(p.created_at) >= thirtyDaysAgo).length;
        const permanentlyClosed = data.filter(p => p.is_permanently_closed).length;

        // Offline > 3 days
        const prolongedOffline = data.filter(p =>
            !p.active && !p.is_permanently_closed && p.last_online_at && new Date(p.last_online_at) < threeDaysAgo
        ).length;

        // Calculate Avg Latency (only active points with valid latency)
        const validLatencies = data.filter(p => p.active && p.latency > 0).map(p => p.latency);
        const avgLatency = validLatencies.length ? (validLatencies.reduce((a, b) => a + b, 0) / validLatencies.length).toFixed(0) : 0;

        return {
            total,
            active,
            inactive,
            availability: total ? (active / total * 100).toFixed(1) : 0,
            avgLatency,
            newPoints,
            permanentlyClosed,
            prolongedOffline
        };
    },

    async getPointsByZone() {
        const { data, error } = await supabase
            .from('puntos_venta')
            .select('*')
            .or('is_permanently_closed.eq.false,is_permanently_closed.is.null') // excluir cerrados definitivamente
            .order('segment', { ascending: true });

        if (error) throw error;

        // Group by Segment
        const zones = {};

        data.forEach(point => {
            const zoneName = point.segment || 'General';
            if (!zones[zoneName]) {
                zones[zoneName] = { name: zoneName, total: 0, active: 0, latencies: [], points: [] };
            }

            zones[zoneName].total++;
            if (point.active) {
                zones[zoneName].active++;
                if (point.latency > 0) zones[zoneName].latencies.push(point.latency);
            }
            zones[zoneName].points.push(point);
        });

        // Compute Stats per Zone
        return Object.values(zones).map(z => ({
            ...z,
            inactive: z.total - z.active,
            availability: z.total ? (z.active / z.total * 100).toFixed(1) : 0,
            avgLatency: z.latencies.length ? (z.latencies.reduce((a, b) => a + b, 0) / z.latencies.length).toFixed(0) : 0
        })).sort((a, b) => b.active - a.active); // Sort by most active points
    },

    // --- PHASE 3: ALERTS & SCHEDULES ---

    async getAlerts(statusFilter = 'PENDING') {
        let query = supabase.from('store_alerts').select('*').order('created_at', { ascending: false });
        if (statusFilter !== 'ALL') {
            query = query.eq('status', statusFilter);
        }

        const { data, error } = await query;
        if (error) throw error;
        return data;
    },

    async updateAlertStatus(id, newStatus, ai_proposed_message = null) {
        const updatePayload = { status: newStatus };
        if (ai_proposed_message !== null) {
            updatePayload.ai_proposed_message = ai_proposed_message;
        }

        const { data, error } = await supabase
            .from('store_alerts')
            .update(updatePayload)
            .eq('id', id)
            .select()
            .single();

        if (error) throw error;
        return data;
    },

    async getZoneSchedules() {
        const { data, error } = await supabase
            .from('zone_schedules')
            .select('*')
            .order('zone_name', { ascending: true });

        if (error) throw error;
        return data;
    },

    async updateZoneSchedule(id, updates) {
        const { data, error } = await supabase
            .from('zone_schedules')
            .update(updates)
            .eq('id', id)
            .select()
            .single();

        if (error) throw error;
        return data;
    },

    // --- PHASE 11: GLOBAL SETTINGS ---
    async getGlobalSettings(keys) {
        let query = supabase.from('global_settings').select('*');
        if (keys && keys.length > 0) {
            query = query.in('setting_key', keys);
        }
        const { data, error } = await query;
        if (error) throw error;
        return data;
    },

    async upsertGlobalSetting(key, value, description) {
        const { data, error } = await supabase
            .from('global_settings')
            .upsert(
                { setting_key: key, setting_value: value, description, updated_at: new Date().toISOString() },
                { onConflict: 'setting_key' }
            )
            .select()
            .single();

        if (error) throw error;
        return data;
    },

    // --- PHASE 7: CASCADING UPDATES ---
    async applyGlobalSchedulesToAll(weekdayConfig, weekendConfig) {
        console.log("Cascading global configs to DB... ", weekdayConfig);

        // 1. Actualizar ZONAS (zone_schedules) con el horario base Lunes a Sabado
        if (weekdayConfig && weekdayConfig.open && weekdayConfig.close) {
            const shiftsObj = [{ open: weekdayConfig.open, close: weekdayConfig.close }];
            const { error: zoneErr, data: zoneData } = await supabase
                .from('zone_schedules')
                .update({
                    shifts: shiftsObj
                })
                .neq('zone_name', 'non_existent_zone_999')
                .select();

            console.log("Updated Zones Data:", zoneData, "Err:", zoneErr);
            if (zoneErr) throw zoneErr;
        }

        // 2. Actualizamos TODOS los puntos:
        const { error: pointsErr, data: pointsData } = await supabase
            .from('puntos_venta')
            .update({
                has_custom_schedule: false, // Forzar a usar globales
                custom_open_time: null,
                custom_close_time: null
            })
            // A trick to match all rows is .neq('id', '00000000-0000-0000-0000-000000000000') but eq is safer
            .neq('id', '00000000-0000-0000-0000-000000000000')
            .select();

        console.log("Updated Points Data:", pointsData?.length, "Err:", pointsErr);
        if (pointsErr) throw pointsErr;
        return true;
    },

    async applyZoneSchedulesToPoints(zoneName, openTime, closeTime) {
        // Actualizar todos los nodos que pertenezcan a esa zona
        const { error } = await supabase
            .from('puntos_venta')
            .update({
                has_custom_schedule: true,
                custom_open_time: openTime,
                custom_close_time: closeTime
            })
            .eq('segment', zoneName);

        if (error) throw error;
        return true;
    },

    // --- PHASE 8: ML ANALYTICS ---
    async getNodeBehavior() {
        if (mlServerDown) return []; // No reintentar si ya sabemos que no responde

        try {
            const mlUrl = 'http://localhost:8000';
            const response = await fetch(`${mlUrl}/api/v1/node-behavior`, {
                signal: AbortSignal.timeout(3000) // Timeout agresivo
            });

            if (!response.ok) throw new Error('ML Engine unreachable');
            const result = await response.json();
            if (result.status === 'success') return result.data;
            return [];
        } catch (error) {
            // Activar Circuit Breaker ante fallos de red
            if (!mlServerWarningSent) {
                console.warn("🚫 Conexión con AI Analytics Engine (Puerto 8000) no disponible. El motor ML operará en modo silencioso.");
                mlServerWarningSent = true;
            }
            mlServerDown = true;
            return [];
        }
    },

    async improveAlert(id) {
        const backendUrl = import.meta.env.VITE_BACKEND_URL || 'http://localhost:3001';
        const resp = await fetch(`${backendUrl}/api/alerts/${id}/improve`, {
            method: 'POST'
        });
        if (!resp.ok) throw new Error('Error al mejorar con IA');
        return await resp.json();
    },

    async clearAllAlerts() {
        try {
            // Delete all records from store_alerts
            // Supabase delete requires a filter, .neq('id', 0) matches all uuid/int ids usually
            const { error } = await supabase
                .from('store_alerts')
                .delete()
                .neq('id', '00000000-0000-0000-0000-000000000000'); // Delete everything

            if (error) throw error;
            return { ok: true };
        } catch (error) {
            console.error('Error in pointsService.clearAllAlerts:', error);
            throw error;
        }
    },

    async triggerDailyMonitor() {
        try {
            const backendUrl = import.meta.env.VITE_BACKEND_URL || 'http://localhost:3001';
            const resp = await fetch(`${backendUrl}/api/webhook/trigger-monitor`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' }
            });

            if (!resp.ok) {
                const errorData = await resp.json().catch(() => ({ error: 'Error desconocido' }));
                throw new Error(errorData.error || 'Failed to trigger monitor');
            }

            return await resp.json();
        } catch (error) {
            console.error('Error in pointsService.triggerDailyMonitor:', error);
            throw error;
        }
    }
};
