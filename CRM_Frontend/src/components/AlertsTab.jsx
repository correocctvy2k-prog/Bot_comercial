import React, { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Clock, ShieldAlert, CheckCircle2, XCircle, Bot, Calendar, Settings2, TrendingUp, Wifi, WifiOff, BarChart2, Loader2 } from 'lucide-react';
import { pointsService } from '../services/points.service';
import {
    Card,
    CardContent,
    CardDescription,
    CardHeader,
    CardTitle,
    CardFooter
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { ChevronDown, ChevronRight, Save, Edit3, MonitorSmartphone, Video, BellRing, Building2, Store, AlertTriangle, User, Phone } from 'lucide-react';
import { toast } from "sonner";

// --- SUBCOMPONENT PARA TARJETA DE ALERTA INDIVIDUAL ---
function AlertCardItem({ alert, allPoints, resolveAlertMutation, updatePointAttrMutation, schedules, globalSettings }) {
    // Buscar la información actualizada del punto (asesor)
    const pointData = allPoints.find(p => p.ip === alert.point_ip) || {};
    const pointId = pointData.id;

    const [isEditingContact, setIsEditingContact] = useState(false);
    const [asesorName, setAsesorName] = useState(pointData.asesor_nombre || '');
    const [asesorPhone, setAsesorPhone] = useState(pointData.asesor_telefono || '');
    const [analytics, setAnalytics] = useState(null);

    // --- FASE 11: EDICIÓN Y MEJORA DE MENSAJE ---
    const [isEditingMsg, setIsEditingMsg] = useState(false);
    const [msgDraft, setMsgDraft] = useState(alert.ai_proposed_message || '');
    const [isProcessing, setIsProcessing] = useState(false);
    const queryClient = useQueryClient();

    const improveMutation = useMutation({
        mutationFn: () => pointsService.improveAlert(alert.id),
        onSuccess: (data) => {
            setMsgDraft(data.ai_proposed_message || '');
            toast.success("Mensaje mejorado con Gemini ✨");
            queryClient.invalidateQueries({ queryKey: ['store-alerts'] });
        },
        onError: (err) => toast.error("Error al llamar a la IA: " + err.message),
        onSettled: () => setIsProcessing(false)
    });

    const handleImprove = () => {
        setIsProcessing(true);
        improveMutation.mutate();
    };

    const updateMsgMutation = useMutation({
        mutationFn: (newMsg) => pointsService.updateAlertStatus(alert.id, 'PENDING', newMsg), // Reusamos updateStatus o similar
        onSuccess: () => {
            setIsEditingMsg(false);
            toast.success("Mensaje actualizado.");
            queryClient.invalidateQueries({ queryKey: ['store-alerts'] });
        }
    });

    const handleSaveMsg = () => {
        updateMsgMutation.mutate(msgDraft);
    };

    // Cargar analíticas del punto cuando se monta la tarjeta
    useEffect(() => {
        if (alert.point_ip) {
            pointsService.getPointAnalytics(alert.point_ip, 30).then(setAnalytics);
        }
    }, [alert.point_ip]);

    // Actualizar estado si pointData cambia externamente
    React.useEffect(() => {
        if (!isEditingContact) {
            setAsesorName(pointData.asesor_nombre || '');
            setAsesorPhone(pointData.asesor_telefono || '');
        }
    }, [pointData.asesor_nombre, pointData.asesor_telefono, isEditingContact]);

    const handleSaveContact = () => {
        if (pointId) {
            updatePointAttrMutation.mutate({
                id: pointId,
                attributes: {
                    asesor_nombre: asesorName,
                    asesor_telefono: asesorPhone
                }
            }, {
                onSuccess: () => setIsEditingContact(false)
            });
        }
    };

    // Reemplazo dinámico de {NOMBRE} y {PUNTO} (solo para visualización final si no está editando)
    const displayName = (pointData.asesor_nombre && pointData.asesor_nombre.trim() !== '')
        ? pointData.asesor_nombre.trim()
        : (pointData.alias || pointData.name || 'Asesor');

    const pointTitle = pointData.alias || pointData.name || 'Punto de Venta';

    const msgToDisplay = isEditingMsg
        ? msgDraft
        : (alert.ai_proposed_message || '')
            .replace(/\{NOMBRE\}/g, displayName)
            .replace(/\{PUNTO\}/g, pointTitle);

    const handleApprove = async () => {
        const phone = pointData?.asesor_telefono;
        if (!phone) {
            toast.warning("Este Nodo no tiene un teléfono configurado para WhatsApp.");
            return;
        }

        setIsProcessing(true);
        const cleanPhone = phone.replace(/\D/g, '');

        try {
            // 1. Intentar el envío de WhatsApp primero
            await pointsService.sendOfficialWhatsAppAlert(cleanPhone, msgToDisplay);

            // 2. Si tiene éxito, actualizar el estado de la alerta en DB
            resolveAlertMutation.mutate({ id: alert.id, status: 'APPROVED' }, {
                onSuccess: () => {
                    toast.success("Alerta enviada y procesada exitosamente.");
                },
                onError: (err) => {
                    toast.error("Mensaje enviado, pero falló la actualización del estado: " + err.message);
                },
                onSettled: () => setIsProcessing(false)
            });
        } catch (err) {
            toast.error("Fallo de envío: " + err.message);
            setIsProcessing(false);
        }
    };

    const handleReject = () => {
        setIsProcessing(true);
        resolveAlertMutation.mutate({ id: alert.id, status: 'REJECTED' }, {
            onSettled: () => setIsProcessing(false)
        });
    };

    return (
        <Card className="border-border/50 flex flex-col bg-card/80 overflow-hidden relative group">
            <div className="absolute top-0 left-0 w-1 h-full bg-amber-500" />

            <CardHeader className="pb-2 pl-5">
                <div className="flex justify-between items-start">
                    <div>
                        <Badge variant="outline" className="text-amber-500 border-amber-500/30 bg-amber-500/10 mb-2">
                            <ShieldAlert className="w-3 h-3 mr-1" /> Ausencia Detectada
                        </Badge>
                        <CardTitle className="text-lg leading-tight flex items-center gap-2">
                            {alert.point_name}
                            {pointData.active ? (
                                <Badge variant="secondary" className="bg-amber-500/10 text-amber-500 border-amber-500/20 text-[9px] py-0 h-4">TARDE</Badge>
                            ) : (
                                <Badge variant="secondary" className="bg-rose-500/10 text-rose-500 border-rose-500/20 text-[9px] py-0 h-4">NO ABRIÓ</Badge>
                            )}
                        </CardTitle>
                        <CardDescription className="text-xs opacity-70">
                            {alert.zone} • {alert.point_ip}
                        </CardDescription>
                    </div>
                </div>
            </CardHeader>

            <CardContent className="pb-4 pl-5 flex flex-col flex-1 gap-3">
                {/* SECCION CONTACTO ASESOR */}
                <div className="bg-background/50 rounded-lg border border-border/40 p-3 flex flex-col gap-2">
                    <div className="flex justify-between items-center">
                        <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
                            <User className="w-3.5 h-3.5" /> Responsable del Punto
                        </span>
                        {!isEditingContact && (
                            <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => setIsEditingContact(true)}>
                                <Edit3 className="w-3.5 h-3.5 text-muted-foreground hover:text-primary" />
                            </Button>
                        )}
                    </div>

                    {isEditingContact ? (
                        <div className="flex flex-col gap-2 mt-1">
                            <div className="grid grid-cols-2 gap-2">
                                <Input
                                    size="sm"
                                    placeholder="Nombre Asesor"
                                    className="h-8 text-xs font-medium bg-background border-primary/30"
                                    value={asesorName}
                                    onChange={e => setAsesorName(e.target.value)}
                                />
                                <Input
                                    size="sm"
                                    placeholder="Teléfono (Ej. 300123...)"
                                    className="h-8 text-xs font-medium bg-background border-primary/30"
                                    value={asesorPhone}
                                    onChange={e => setAsesorPhone(e.target.value)}
                                />
                            </div>
                            <div className="flex justify-end gap-2">
                                <Button variant="ghost" size="sm" className="h-7 text-xs px-2" onClick={() => setIsEditingContact(false)}>Cancelar</Button>
                                <Button size="sm" className="h-7 text-xs px-3" onClick={handleSaveContact} disabled={updatePointAttrMutation.isPending || !pointId}>Guardar</Button>
                            </div>
                        </div>
                    ) : (
                        <div className="flex items-center gap-4 mt-1">
                            <div className="flex items-center gap-2">
                                <User className="w-4 h-4 text-emerald-500/70" />
                                <span className={`text-sm font-medium ${!pointData.asesor_nombre ? 'text-muted-foreground italic' : 'text-foreground'}`}>
                                    {pointData.asesor_nombre || 'Sin asignar'}
                                </span>
                            </div>
                            <div className="flex items-center gap-2">
                                <Phone className="w-4 h-4 text-emerald-500/70" />
                                <span className={`text-sm font-medium ${!pointData.asesor_telefono ? 'text-muted-foreground italic' : 'text-foreground'}`}>
                                    {pointData.asesor_telefono || 'Sin asignar'}
                                </span>
                            </div>
                        </div>
                    )}
                </div>

                {/* SECCIÓN HORARIOS Y PUNTUALIDAD (Simplificada) */}
                <div className="grid grid-cols-2 gap-3 p-3 bg-background/40 rounded-lg border border-border/30">
                    <div className="flex flex-col">
                        <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest mb-1">Horario Asignado</span>
                        <div className="flex items-center gap-1.5 font-mono text-sm">
                            <Clock className="w-3.5 h-3.5 text-primary/60" />
                            {(() => {
                                const customOpen = pointData.custom_open_time;
                                const zoneSchedule = schedules.find(s => s.zone_name === (pointData.segment || alert.zone));
                                const zoneOpen = zoneSchedule?.shifts?.[0]?.open;
                                const globalOpen = globalSettings?.master_schedule_config?.general_weekday?.open || '08:00';
                                return customOpen || zoneOpen || globalOpen;
                            })()}
                        </div>
                    </div>
                    <div className="flex flex-col">
                        <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest mb-1">Apertura Hoy</span>
                        <div className="flex items-center gap-1.5 font-mono text-sm">
                            <Wifi className="w-3.5 h-3.5 text-emerald-500/60" />
                            {(() => {
                                const lastOpen = analytics?.analytics?.last_open_time;
                                const lastOpenDate = analytics?.analytics?.last_open_event ? new Date(analytics.analytics.last_open_event) : null;
                                const isToday = lastOpenDate && new Date().toDateString() === lastOpenDate.toDateString();
                                return isToday ? (lastOpen || '—') : <span className="text-amber-500/80 italic text-xs">Aún no abre</span>;
                            })()}
                        </div>
                    </div>
                    <div className="col-span-2 pt-2 border-t border-border/20 flex justify-between items-center">
                        <span className="text-xs text-muted-foreground">Cumplimiento:</span>
                        {(() => {
                            const lastOpen = analytics?.analytics?.last_open_time;
                            const lastOpenDate = analytics?.analytics?.last_open_event ? new Date(analytics.analytics.last_open_event) : null;
                            const isToday = lastOpenDate && new Date().toDateString() === lastOpenDate.toDateString();

                            if (!isToday) return <Badge variant="secondary" className="bg-amber-500/10 text-amber-500 border-amber-500/20 text-[10px]">PENDIENTE</Badge>;

                            const assignedOpen = (pointData.custom_open_time || schedules.find(s => s.zone_name === (pointData.segment || alert.zone))?.shifts?.[0]?.open || '08:00').slice(0, 5);
                            const [ah, am] = assignedOpen.split(':').map(Number);
                            const [lh, lm] = lastOpen.slice(0, 5).split(':').map(Number);

                            const delay = (lh * 60 + lm) - (ah * 60 + am);

                            if (delay <= 15) return <Badge variant="secondary" className="bg-emerald-500/10 text-emerald-500 border-emerald-500/20 text-[10px]">A TIEMPO</Badge>;
                            return <Badge variant="secondary" className="bg-rose-500/10 text-rose-500 border-rose-500/20 text-[10px]">CON RETRASO (+{delay}m)</Badge>;
                        })()}
                    </div>
                </div>

                {/* MENSAJE IA / MANUAL */}
                <div className="bg-primary/5 rounded-lg border border-primary/20 p-3 text-sm flex-1 relative group/msg">
                    <div className="flex justify-between items-center mb-1.5">
                        <div className="flex items-center gap-1.5 text-primary text-xs font-semibold">
                            <Bot className={`w-3.5 h-3.5 ${alert.is_ai_generated ? 'text-emerald-400' : 'text-primary'}`} />
                            {alert.is_ai_generated ? 'Mensaje Mejorado con IA' : 'Mensaje Predeterminado'}
                        </div>
                        <div className="flex gap-1">
                            {!isEditingMsg && (
                                <Button
                                    variant="ghost"
                                    size="sm"
                                    className="h-6 text-[10px] px-2 text-primary hover:text-primary hover:bg-primary/10"
                                    disabled={improveMutation.isPending || isProcessing}
                                    onClick={handleImprove}
                                >
                                    {improveMutation.isPending || isProcessing ? <Loader2 className="w-3 h-3 animate-spin mr-1" /> : <TrendingUp className="w-3 h-3 mr-1" />}
                                    Mejorar con IA
                                </Button>
                            )}
                            {!isEditingMsg && (
                                <Button
                                    variant="ghost"
                                    size="sm"
                                    className="h-6 px-2 text-[10px] text-muted-foreground hover:text-primary"
                                    disabled={isProcessing}
                                    onClick={() => {
                                        setMsgDraft(alert.ai_proposed_message || '');
                                        setIsEditingMsg(true);
                                    }}
                                >
                                    <Edit3 className="w-3 h-3 mr-1" /> Editar
                                </Button>
                            )}
                        </div>
                    </div>

                    {isEditingMsg ? (
                        <div className="flex flex-col gap-2">
                            <textarea
                                className="w-full bg-background/50 border border-primary/30 rounded p-2 text-xs min-h-[60px] resize-none focus:outline-none focus:ring-1 focus:ring-primary/50"
                                value={msgDraft}
                                onChange={e => setMsgDraft(e.target.value)}
                                autoFocus
                            />
                            <div className="flex justify-end gap-2">
                                <Button variant="ghost" size="sm" className="h-6 text-[10px] px-2" onClick={() => setIsEditingMsg(false)}>Cancelar</Button>
                                <Button size="sm" className="h-6 text-[10px] px-3 bg-primary/80" onClick={handleSaveMsg} disabled={updateMsgMutation.isPending}>Guardar</Button>
                            </div>
                        </div>
                    ) : (
                        <p className="text-foreground/90 whitespace-pre-wrap italic">
                            "{msgToDisplay}"
                        </p>
                    )}
                </div>
            </CardContent>

            <CardFooter className="pt-0 pl-5 grid grid-cols-2 gap-2">
                <Button
                    variant="outline"
                    className="w-full border-red-500/20 hover:bg-red-500/10 hover:text-red-500 text-red-500/70"
                    onClick={handleReject}
                    disabled={resolveAlertMutation.isPending || isProcessing}
                >
                    <XCircle className="w-4 h-4 mr-2" /> Descartar
                </Button>
                <Button
                    className="w-full bg-emerald-600 text-white hover:bg-emerald-700"
                    onClick={handleApprove}
                    disabled={resolveAlertMutation.isPending || isProcessing || !pointData.asesor_telefono}
                >
                    {isProcessing ? (
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    ) : (
                        <CheckCircle2 className="w-4 h-4 mr-2" />
                    )}
                    {pointData.asesor_telefono ? 'Aprobar y Enviar (WA)' : 'Falta Teléfono'}
                </Button>
            </CardFooter>
        </Card >
    );
}

// -------------------------------------------------------------------
export default function AlertsTab() {
    const queryClient = useQueryClient();
    const [subTab, setSubTab] = useState('inbox');
    const [zoneFilter, setZoneFilter] = useState('ALL');
    const [statusTypeFilter, setStatusTypeFilter] = useState('ALL'); // ALL, NO_OPEN, LATE

    // Fetch Alerts
    const { data: alerts = [], isLoading: loadingAlerts } = useQuery({
        queryKey: ['store-alerts'],
        queryFn: () => pointsService.getAlerts('PENDING'),
        refetchInterval: 15000 // Refrescar cada 15s para pillar nuevas
    });

    // Fetch Schedules
    const { data: schedules = [], isLoading: loadingSchedules } = useQuery({
        queryKey: ['zone-schedules'],
        queryFn: pointsService.getZoneSchedules
    });

    // Mutations
    const resolveAlertMutation = useMutation({
        mutationFn: ({ id, status }) => pointsService.updateAlertStatus(id, status),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['store-alerts'] });
        }
    });

    // --- PHASE 13: FETCH ALL DATA FIRST ---
    // Fetch Points (moved up to avoid ReferenceError)
    const { data: allPoints = [], isLoading: loadingPoints } = useQuery({
        queryKey: ['all-points-config'],
        queryFn: pointsService.getPoints,
    });

    // Fetch Global Settings (moved up for consistency)
    const { data: globalSettingsObj = {}, isLoading: loadingGlobals } = useQuery({
        queryKey: ['global-settings'],
        queryFn: async () => {
            const data = await pointsService.getGlobalSettings(['master_schedule_config', 'sunday_holiday_schedule']);
            return data.reduce((acc, curr) => ({ ...acc, [curr.setting_key]: curr.setting_value }), {});
        }
    });

    const handleApprove = (alert) => {
        resolveAlertMutation.mutate({ id: alert.id, status: 'APPROVED' }, {
            onSuccess: () => {
                const pointData = allPoints.find(p => p.ip === alert.point_ip);
                const phone = pointData?.asesor_telefono;

                if (phone) {
                    const cleanPhone = phone.replace(/\D/g, ''); // Deja solo los números
                    const text = encodeURIComponent(alert.ai_proposed_message || "Hola, notamos que tu punto está fuera de línea.");
                    const waLink = `https://wa.me/${cleanPhone}?text=${text}`;
                    window.open(waLink, '_blank');
                    toast.success("Alerta aprobada. Redirigiendo a WhatsApp...");
                } else {
                    toast.warning("Alerta aprobada, pero este Nodo no tiene un teléfono configurado para WhatsApp.");
                }
            }
        });
    };

    const handleReject = (id) => resolveAlertMutation.mutate({ id, status: 'REJECTED' });

    // --- LÓGICA DE FILTRADO FASE 13 ---
    const zones = Array.from(new Set(schedules.map(s => s.zone_name))).sort();

    // Nota: La categorización NO_OPEN vs LATE requiere datos de analíticas.
    // Para filtrar eficientemente, la tarjeta reportará su estado o usaremos el parent.
    // Por ahora filtramos por Zona. La categorización visual estará en la tarjeta.
    const filteredAlerts = alerts.filter(alert => {
        // 1. Filtro de Zona
        if (zoneFilter !== 'ALL' && alert.zone !== zoneFilter) return false;

        // 2. Filtro de Tipo (No Apertura vs Tarde)
        if (statusTypeFilter !== 'ALL') {
            const point = allPoints.find(p => p.ip === alert.point_ip);
            if (!point) return true; // Si no hay info, lo dejamos

            // Categorización simplificada: 
            // - Inactivo = No abrió aún (o se cayó)
            // - Activo = Abrió (pero tarde, ya que generó alerta)
            const category = !point.active ? 'NO_OPEN' : 'LATE';
            if (statusTypeFilter !== category) return false;
        }

        return true;
    });

    // --- SCHEDULE & POINTS CONFIGURATION LOGIC ---
    const [editingZoneId, setEditingZoneId] = useState(null);
    const [zoneFormData, setZoneFormData] = useState({});
    const [expandedZoneId, setExpandedZoneId] = useState(null);


    // Zone Mutations
    const updateScheduleMutation = useMutation({
        mutationFn: ({ id, updates }) => pointsService.updateZoneSchedule(id, updates),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['zone-schedules'] });
            setEditingZoneId(null);
            toast.success("Horario de zona guardado correctamente.");
        }
    });

    // Point Mutations
    const updatePointAttrMutation = useMutation({
        mutationFn: ({ id, attributes }) => pointsService.updatePointAttributes(id, attributes),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['all-points-config'] });
            toast.success("Atributo de punto actualizado.");
        }
    });

    // Global Setting Mutation
    const updateGlobalMutation = useMutation({
        mutationFn: ({ key, value, desc }) => pointsService.upsertGlobalSetting(key, value, desc),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['global-settings'] });
            toast.success("Configuración global guardada correctamente.");
            setEditingGlobal(false);
        },
        onError: (err) => {
            console.error("Error al guardar la config global:", err);
            toast.error(err.message || "Error al actualizar global config.");
        }
    });

    const clearAlertsMutation = useMutation({
        mutationFn: () => pointsService.clearAllAlerts(),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['store-alerts'] });
            toast.success("Todas las alertas han sido eliminadas.");
        },
        onError: (err) => toast.error("Error al limpiar alertas: " + err.message)
    });

    const triggerMonitorMutation = useMutation({
        mutationFn: () => pointsService.triggerDailyMonitor(),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['store-alerts'] });
            toast.success("Monitoreo completado. Alertas generadas.");
        },
        onError: (err) => toast.error("Error al generar alertas: " + err.message)
    });

    const [editingGlobal, setEditingGlobal] = useState(false);
    const [globalFormData, setGlobalFormData] = useState({
        weekday_open: '08:00', weekday_close: '20:00',
        weekend_open: '10:00', weekend_close: '18:00',
        holidays: []
    });
    const [newHoliday, setNewHoliday] = useState('');

    const toggleGlobalEdit = () => {
        if (editingGlobal) {
            setEditingGlobal(false);
        } else {
            setEditingGlobal(true);
            const master = globalSettingsObj['master_schedule_config'];
            const legacy = globalSettingsObj['sunday_holiday_schedule'] || { open: '10:00', close: '18:00' };

            if (master) {
                setGlobalFormData({
                    weekday_open: master.general_weekday?.open || '08:00',
                    weekday_close: master.general_weekday?.close || '20:00',
                    weekend_open: master.general_weekend?.open || '10:00',
                    weekend_close: master.general_weekend?.close || '18:00',
                    holidays: master.holidays || []
                });
            } else {
                setGlobalFormData({
                    weekday_open: '08:00', weekday_close: '20:00',
                    weekend_open: legacy.open, weekend_close: legacy.close,
                    holidays: []
                });
            }
        }
    };

    const handleAddHoliday = () => {
        if (newHoliday && !globalFormData.holidays.includes(newHoliday)) {
            setGlobalFormData(prev => ({ ...prev, holidays: [...prev.holidays, newHoliday] }));
            setNewHoliday('');
        }
    };

    const handleRemoveHoliday = (date) => {
        setGlobalFormData(prev => ({ ...prev, holidays: prev.holidays.filter(d => d !== date) }));
    };

    const applyGlobalCascadeMutation = useMutation({
        mutationFn: (globalPayload) => pointsService.applyGlobalSchedulesToAll(globalPayload.general_weekday, globalPayload.general_weekend),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['all-points-config'] });
            queryClient.invalidateQueries({ queryKey: ['zone-schedules'] });
            toast.success("¡Horario global propagado a absolutamente todos los nodos y zonas!");
        },
        onError: (err) => toast.error("Error al aplicar a todos los puntos.")
    });

    const handleSaveGlobal = () => {
        try {
            const payload = {
                general_weekday: { open: globalFormData.weekday_open, close: globalFormData.weekday_close },
                general_weekend: { open: globalFormData.weekend_open, close: globalFormData.weekend_close },
                holidays: globalFormData.holidays
            };
            console.log("Guardando global config...", payload);

            updateGlobalMutation.mutate({ key: 'master_schedule_config', value: payload, desc: 'Configuración maestra de horarios y festivos' }, {
                onSuccess: () => {
                    if (window.confirm("¿Deseas propagar esta configuración y resetear los horarios de TODOS los puntos a estos valores globales?")) {
                        applyGlobalCascadeMutation.mutate(payload);
                    }
                }
            });
        } catch (error) {
            console.error("Error intero:", error);
            toast.error("Error intero al intentar preparar los datos");
        }
    };

    const applyZoneCascadeMutation = useMutation({
        mutationFn: ({ zoneName, openTime, closeTime }) => pointsService.applyZoneSchedulesToPoints(zoneName, openTime, closeTime),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['all-points-config'] });
            toast.success("¡Horario de la zona propagado a sus nodos respectivos!");
        },
        onError: (err) => toast.error("Error al propagar horario a los nodos de la zona.")
    });

    const toggleZoneEdit = (schedule) => {
        if (editingZoneId === schedule.id) {
            setEditingZoneId(null);
        } else {
            setEditingZoneId(schedule.id);
            // Copiar datos para editar localmente
            setZoneFormData({
                open: schedule.shifts?.[0]?.open || '',
                close: schedule.shifts?.[0]?.close || '',
                work_days: schedule.work_days?.join(',') || '',
                tolerance_minutes: schedule.tolerance_minutes || 0
            });
        }
    };

    const handleSaveZone = (id) => {
        // Parsear el string de work_days devuelta a array de numeros
        const daysArray = String(zoneFormData.work_days).split(',').map(d => parseInt(d.trim())).filter(d => !isNaN(d));

        const updates = {
            tolerance_minutes: parseInt(zoneFormData.tolerance_minutes) || 15,
            work_days: daysArray,
            shifts: [{ open: zoneFormData.open, close: zoneFormData.close }] // Solo soporta 1 turno inicial por ahora
        };

        updateScheduleMutation.mutate({ id, updates });
    };

    const handleToggleAttribute = (pointId, attributeStr, currentValue) => {
        const payload = { [attributeStr]: !currentValue };
        // UI update optimista
        updatePointAttrMutation.mutate({ id: pointId, attributes: payload });
    };

    return (
        <div className="w-full h-full flex flex-col space-y-4 animate-in fade-in duration-500">
            <div className="flex justify-between items-center bg-card/40 border border-border/50 p-4 rounded-xl backdrop-blur-sm">
                <div>
                    <h3 className="text-xl font-bold flex items-center gap-2">
                        <Clock className="w-5 h-5 text-primary" /> Motor Operativo y Alertas
                    </h3>
                    <p className="text-sm text-muted-foreground mt-1">Supervisión automática de cumplimiento de horarios</p>
                </div>
                <Tabs value={subTab} onValueChange={setSubTab} className="w-[300px]">
                    <TabsList className="w-full grid grid-cols-2">
                        <TabsTrigger value="inbox" className="relative">
                            Inbox IA
                            {alerts.length > 0 && (
                                <span className="absolute -top-1 -right-1 bg-red-500 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full">
                                    {alerts.length}
                                </span>
                            )}
                        </TabsTrigger>
                        <TabsTrigger value="config">Horarios</TabsTrigger>
                    </TabsList>
                </Tabs>
            </div>

            {/* INBOX TAB */}
            {subTab === 'inbox' && (
                <div className="flex-1 overflow-auto space-y-4">
                    {/* ACCIONES DE CONTROL MANUAL */}
                    <div className="flex gap-3 px-4 py-2 bg-primary/5 border-y border-primary/10 items-center justify-end">
                        <span className="text-[10px] font-bold text-primary/60 uppercase tracking-widest mr-auto">Gestión de Alertas</span>
                        <Button 
                            variant="outline" 
                            size="sm" 
                            className="h-8 text-xs border-rose-500/30 text-rose-500 hover:bg-rose-500/10"
                            disabled={clearAlertsMutation.isPending}
                            onClick={() => {
                                if (window.confirm("¿Estás seguro de que deseas eliminar ABSOLUTAMENTE TODAS las alertas (incluyendo el historial)?")) {
                                    clearAlertsMutation.mutate();
                                }
                            }}
                        >
                            {clearAlertsMutation.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin mr-2" /> : <XCircle className="w-3.5 h-3.5 mr-2" />}
                            Limpiar Alertas
                        </Button>
                        <Button 
                            size="sm" 
                            className="h-8 text-xs bg-primary hover:bg-primary/90"
                            disabled={triggerMonitorMutation.isPending}
                            onClick={() => triggerMonitorMutation.mutate()}
                        >
                            {triggerMonitorMutation.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin mr-2" /> : <TrendingUp className="w-3.5 h-3.5 mr-2" />}
                            Generar Alertas del Día
                        </Button>
                    </div>

                    {/* BARRA DE FILTROS INBOX (FASE 13) */}
                    <div className="flex flex-wrap gap-4 items-center bg-card/20 p-3 rounded-lg border border-border/40 mb-4">
                        <div className="flex items-center gap-2">
                            <Label className="text-xs text-muted-foreground font-semibold">ZONA:</Label>
                            <select
                                className="bg-background border border-border/50 rounded px-2 py-1 text-xs focus:ring-1 focus:ring-primary outline-none"
                                value={zoneFilter}
                                onChange={(e) => setZoneFilter(e.target.value)}
                            >
                                <option value="ALL">Todas las Zonas</option>
                                {zones.map(z => <option key={z} value={z}>{z}</option>)}
                            </select>
                        </div>
                        <div className="h-4 w-px bg-border/50 mx-2 hidden md:block" />
                        <div className="flex items-center gap-2">
                            <Label className="text-xs text-muted-foreground font-semibold">TIPO:</Label>
                            <div className="flex bg-background/50 border border-border/40 rounded-md p-1">
                                <button
                                    onClick={() => setStatusTypeFilter('ALL')}
                                    className={`px-3 py-1 text-[10px] font-bold rounded transition-colors ${statusTypeFilter === 'ALL' ? 'bg-primary text-primary-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}
                                >
                                    TODOS
                                </button>
                                <button
                                    onClick={() => setStatusTypeFilter('NO_OPEN')}
                                    className={`px-3 py-1 text-[10px] font-bold rounded transition-colors ${statusTypeFilter === 'NO_OPEN' ? 'bg-rose-500 text-white shadow-sm' : 'text-muted-foreground hover:text-rose-400'}`}
                                >
                                    NO ABRIERON
                                </button>
                                <button
                                    onClick={() => setStatusTypeFilter('LATE')}
                                    className={`px-3 py-1 text-[10px] font-bold rounded transition-colors ${statusTypeFilter === 'LATE' ? 'bg-amber-500 text-white shadow-sm' : 'text-muted-foreground hover:text-amber-400'}`}
                                >
                                    TARDE
                                </button>
                            </div>
                        </div>
                        <div className="ml-auto flex items-center gap-2 text-[10px] text-muted-foreground">
                            Mostrando <strong>{filteredAlerts.length}</strong> de {alerts.length} alertas
                        </div>
                    </div>
                    {loadingAlerts ? (
                        <div className="space-y-4">
                            {[1, 2].map(i => (
                                <div key={i} className="h-40 bg-card/40 rounded-xl animate-pulse border border-border/50" />
                            ))}
                        </div>
                    ) : filteredAlerts.length === 0 ? (
                        <div className="flex flex-col items-center justify-center p-20 text-center border border-dashed border-border/50 rounded-xl bg-card/20 h-64">
                            <CheckCircle2 className="h-12 w-12 text-emerald-500 mb-4 opacity-80" />
                            <h3 className="text-lg font-medium text-foreground">Sin resultados</h3>
                            <p className="text-sm text-muted-foreground">Aplica otros filtros para ver más alertas.</p>
                        </div>
                    ) : (
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 pb-20">
                            {filteredAlerts.map((alert) => (
                                <AlertCardItem
                                    key={alert.id}
                                    alert={alert}
                                    allPoints={allPoints}
                                    resolveAlertMutation={resolveAlertMutation}
                                    updatePointAttrMutation={updatePointAttrMutation}
                                    schedules={schedules}
                                    globalSettings={globalSettingsObj}
                                />
                            ))}
                        </div>
                    )}
                </div>
            )}

            {/* CONFIG TAB */}
            {subTab === 'config' && (
                <div className="flex-1 overflow-auto">
                    {/* GLOBAL SETTINGS CARD */}
                    <Card className="border-border/50 bg-card/60 backdrop-blur-sm shadow-sm hover:shadow-md mb-6 border-l-4 border-l-primary/50">
                        <CardHeader className="pb-3 border-b border-border/20">
                            <div className="flex justify-between items-center">
                                <CardTitle className="text-lg flex items-center gap-2">
                                    <Clock className="w-5 h-5 text-primary" /> Configuración Maestra de Horarios
                                </CardTitle>
                                {editingGlobal ? (
                                    <Button size="sm" onClick={handleSaveGlobal} disabled={updateGlobalMutation.isPending} className="h-8 gap-1.5 bg-emerald-600 hover:bg-emerald-700">
                                        <Save className="w-3.5 h-3.5" /> Guardar
                                    </Button>
                                ) : (
                                    <Button size="sm" variant="ghost" onClick={toggleGlobalEdit} className="h-8 gap-1.5 text-muted-foreground hover:text-foreground">
                                        <Edit3 className="w-3.5 h-3.5" /> Editar
                                    </Button>
                                )}
                            </div>
                        </CardHeader>
                        <CardContent className="pt-4">
                            {loadingGlobals ? (
                                <div className="text-sm text-muted-foreground">Cargando variables globales...</div>
                            ) : (
                                <div className="space-y-6">
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                        {/* Lunes a Sabado */}
                                        <div className="space-y-3 p-4 rounded-lg bg-background/30 border border-border/30">
                                            <label className="text-xs font-semibold tracking-wider text-muted-foreground uppercase flex items-center gap-2">
                                                <Calendar className="w-4 h-4 text-emerald-400" /> Lunes a Sábado
                                            </label>
                                            <div className="flex items-center gap-2">
                                                <Input
                                                    value={editingGlobal ? globalFormData.weekday_open : (globalSettingsObj['master_schedule_config']?.general_weekday?.open || '08:00')}
                                                    onChange={(e) => setGlobalFormData({ ...globalFormData, weekday_open: e.target.value })}
                                                    className={`h-9 text-sm font-mono ${editingGlobal ? 'bg-background border-primary/50' : 'bg-background/20 border-transparent'} transition-colors flex-1`}
                                                    readOnly={!editingGlobal}
                                                    type="time"
                                                />
                                                <span className="text-muted-foreground">a</span>
                                                <Input
                                                    value={editingGlobal ? globalFormData.weekday_close : (globalSettingsObj['master_schedule_config']?.general_weekday?.close || '20:00')}
                                                    onChange={(e) => setGlobalFormData({ ...globalFormData, weekday_close: e.target.value })}
                                                    className={`h-9 text-sm font-mono ${editingGlobal ? 'bg-background border-primary/50' : 'bg-background/20 border-transparent'} transition-colors flex-1`}
                                                    readOnly={!editingGlobal}
                                                    type="time"
                                                />
                                            </div>
                                        </div>

                                        {/* Domingos y Festivos */}
                                        <div className="space-y-3 p-4 rounded-lg bg-background/30 border border-border/30">
                                            <label className="text-xs font-semibold tracking-wider text-muted-foreground uppercase flex items-center gap-2">
                                                <Calendar className="w-4 h-4 text-amber-400" /> Domingos y Festivos
                                            </label>
                                            <div className="flex items-center gap-2">
                                                <Input
                                                    value={editingGlobal ? globalFormData.weekend_open : (globalSettingsObj['master_schedule_config']?.general_weekend?.open || globalSettingsObj['sunday_holiday_schedule']?.open || '10:00')}
                                                    onChange={(e) => setGlobalFormData({ ...globalFormData, weekend_open: e.target.value })}
                                                    className={`h-9 text-sm font-mono ${editingGlobal ? 'bg-background border-primary/50' : 'bg-background/20 border-transparent'} transition-colors flex-1`}
                                                    readOnly={!editingGlobal}
                                                    type="time"
                                                />
                                                <span className="text-muted-foreground">a</span>
                                                <Input
                                                    value={editingGlobal ? globalFormData.weekend_close : (globalSettingsObj['master_schedule_config']?.general_weekend?.close || globalSettingsObj['sunday_holiday_schedule']?.close || '18:00')}
                                                    onChange={(e) => setGlobalFormData({ ...globalFormData, weekend_close: e.target.value })}
                                                    className={`h-9 text-sm font-mono ${editingGlobal ? 'bg-background border-primary/50' : 'bg-background/20 border-transparent'} transition-colors flex-1`}
                                                    readOnly={!editingGlobal}
                                                    type="time"
                                                />
                                            </div>
                                        </div>
                                    </div>

                                    {/* Días Festivos */}
                                    <div className="space-y-3 p-4 rounded-lg bg-background/30 border border-border/30">
                                        <label className="text-xs font-semibold tracking-wider text-muted-foreground uppercase flex items-center gap-2">
                                            <span className="w-2 h-2 rounded-full bg-red-500"></span> Días Festivos (Excepciones)
                                        </label>
                                        <div className="flex flex-col gap-3">
                                            {editingGlobal && (
                                                <div className="flex gap-2 items-center max-w-sm">
                                                    <Input
                                                        type="date"
                                                        className="h-9 bg-background focus:ring-1"
                                                        value={newHoliday}
                                                        onChange={(e) => setNewHoliday(e.target.value)}
                                                    />
                                                    <Button variant="secondary" size="sm" onClick={handleAddHoliday} className="h-9 shrink-0">Agregar</Button>
                                                </div>
                                            )}
                                            <div className="flex flex-wrap gap-2">
                                                {(editingGlobal ? globalFormData.holidays : (globalSettingsObj['master_schedule_config']?.holidays || [])).map((holiday, idx) => (
                                                    <Badge key={idx} variant="outline" className="text-xs py-1 border-primary/30 bg-primary/5 flex items-center gap-1">
                                                        {new Date(holiday).toLocaleDateString()}
                                                        {editingGlobal && (
                                                            <XCircle className="w-3.5 h-3.5 ml-1 text-muted-foreground hover:text-red-400 cursor-pointer transition-colors" onClick={() => handleRemoveHoliday(holiday)} />
                                                        )}
                                                    </Badge>
                                                ))}
                                                {((editingGlobal ? globalFormData.holidays : (globalSettingsObj['master_schedule_config']?.holidays || [])).length === 0) && (
                                                    <span className="text-xs text-muted-foreground italic">No hay días festivos configurados.</span>
                                                )}
                                            </div>
                                        </div>
                                    </div>

                                    <div className="text-xs text-muted-foreground italic bg-amber-500/10 text-amber-500/80 p-3 rounded-lg border border-amber-500/20">
                                        <AlertTriangle className="w-4 h-4 inline-block mr-1.5 -mt-0.5" />
                                        Atención: Al "Guardar", se aplicará este esquema global permanentemente a la base de datos y se sobrescribirá cualquier configuración errónea previa excepto en los puntos con horario especial forzado localmente. Adicionalmente de manera opcional, se presentará un paso para propagarlo machacando todos los datos pasados.
                                    </div>
                                </div>
                            )}
                        </CardContent>
                    </Card>

                    {loadingSchedules ? (
                        <div className="h-64 flex items-center justify-center">Cargando Horarios...</div>
                    ) : (
                        <div className="space-y-4 pb-20">
                            {schedules.map(schedule => {
                                const isEditing = editingZoneId === schedule.id;
                                const isExpanded = expandedZoneId === schedule.id;
                                const zonePoints = allPoints.filter(p => (p.segment || 'General') === schedule.zone_name);

                                return (
                                    <Card key={schedule.id} className="border-border/50 bg-card/60 backdrop-blur-sm transition-all duration-300 shadow-sm hover:shadow-md">
                                        <CardHeader className="pb-3 border-b border-border/20">
                                            <div className="flex justify-between items-center">
                                                <div
                                                    className="flex items-center gap-2 cursor-pointer group"
                                                    onClick={() => setExpandedZoneId(isExpanded ? null : schedule.id)}
                                                >
                                                    <div className="p-1.5 rounded-md bg-primary/10 text-primary transition-colors group-hover:bg-primary/20">
                                                        {isExpanded ? <ChevronDown className="w-5 h-5" /> : <ChevronRight className="w-5 h-5" />}
                                                    </div>
                                                    <CardTitle className="flex items-center gap-2 text-lg">
                                                        <Calendar className="w-5 h-5 text-primary opacity-80" />
                                                        {schedule.zone_name}
                                                    </CardTitle>
                                                    <Badge variant="secondary" className="ml-2 bg-background/50">{zonePoints.length} Nodos</Badge>
                                                </div>

                                                <div className="flex items-center gap-2">
                                                    {isEditing ? (
                                                        <>
                                                            <Button size="sm" variant="outline" className="h-8 gap-1.5 border-primary/50 text-primary hover:bg-primary/10"
                                                                onClick={() => {
                                                                    if (confirm(`¿Deseas aplicar el horario (${zoneFormData.open} a ${zoneFormData.close}) a absolutamente todos los nodos que pertenecen a la zona ${schedule.zone_name}?`)) {
                                                                        applyZoneCascadeMutation.mutate({ zoneName: schedule.zone_name, openTime: zoneFormData.open, closeTime: zoneFormData.close });
                                                                    }
                                                                }}
                                                                disabled={applyZoneCascadeMutation.isPending}
                                                            >
                                                                <MonitorSmartphone className="w-3.5 h-3.5" /> Propagar a Nodos
                                                            </Button>
                                                            <Button size="sm" onClick={() => handleSaveZone(schedule.id)} disabled={updateScheduleMutation.isPending} className="h-8 gap-1.5 bg-emerald-600 hover:bg-emerald-700">
                                                                <Save className="w-3.5 h-3.5" /> Guardar
                                                            </Button>
                                                        </>
                                                    ) : (
                                                        <Button size="sm" variant="ghost" onClick={() => toggleZoneEdit(schedule)} className="h-8 gap-1.5 text-muted-foreground hover:text-foreground">
                                                            <Edit3 className="w-3.5 h-3.5" /> Editar Zona
                                                        </Button>
                                                    )}
                                                </div>
                                            </div>
                                        </CardHeader>

                                        {/* ZONE CONFIG HEADER (Always visible or partially visible) */}
                                        <CardContent className="pt-4">
                                            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                                                <div className="space-y-2">
                                                    <label className="text-xs font-semibold tracking-wider text-muted-foreground uppercase">Turno (Apertura - Cierre)</label>
                                                    <div className="flex items-center gap-2">
                                                        <Input
                                                            value={isEditing ? zoneFormData.open : (schedule.shifts?.[0]?.open || '')}
                                                            onChange={(e) => setZoneFormData({ ...zoneFormData, open: e.target.value })}
                                                            className={`h-9 text-sm font-mono ${isEditing ? 'bg-background border-primary/50' : 'bg-background/20 border-transparent'} transition-colors`}
                                                            readOnly={!isEditing}
                                                            type="time"
                                                        />
                                                        <span className="text-muted-foreground">-</span>
                                                        <Input
                                                            value={isEditing ? zoneFormData.close : (schedule.shifts?.[0]?.close || '')}
                                                            onChange={(e) => setZoneFormData({ ...zoneFormData, close: e.target.value })}
                                                            className={`h-9 text-sm font-mono ${isEditing ? 'bg-background border-primary/50' : 'bg-background/20 border-transparent'} transition-colors`}
                                                            readOnly={!isEditing}
                                                            type="time"
                                                        />
                                                    </div>
                                                </div>
                                                <div className="space-y-2">
                                                    <label className="text-xs font-semibold tracking-wider text-muted-foreground uppercase">Días Laborales (1-7)</label>
                                                    <Input
                                                        value={isEditing ? zoneFormData.work_days : (schedule.work_days?.join(',') || '')}
                                                        onChange={(e) => setZoneFormData({ ...zoneFormData, work_days: e.target.value })}
                                                        className={`h-9 text-sm ${isEditing ? 'bg-background border-primary/50' : 'bg-background/20 border-transparent'} transition-colors`}
                                                        readOnly={!isEditing}
                                                    />
                                                </div>
                                                <div className="space-y-2">
                                                    <label className="text-xs font-semibold tracking-wider text-muted-foreground uppercase">Tolerancia (Minutos)</label>
                                                    <Input
                                                        value={isEditing ? zoneFormData.tolerance_minutes : (schedule.tolerance_minutes || 0)}
                                                        onChange={(e) => setZoneFormData({ ...zoneFormData, tolerance_minutes: e.target.value })}
                                                        className={`h-9 text-sm ${isEditing ? 'bg-background border-primary/50' : 'bg-background/20 border-transparent'} transition-colors w-24`}
                                                        readOnly={!isEditing}
                                                        type="number"
                                                    />
                                                </div>
                                            </div>

                                            {/* EXPANDABLE POINTS GRID */}
                                            {isExpanded && (
                                                <div className="mt-6 pt-4 border-t border-border/20 animate-in slide-in-from-top-2 duration-300">
                                                    <h4 className="text-sm font-semibold mb-4 flex items-center gap-2">
                                                        <MonitorSmartphone className="w-4 h-4 text-primary" /> Inventario Tecnológico y Atributos de Puntos
                                                    </h4>

                                                    {loadingPoints ? (
                                                        <div className="text-sm text-muted-foreground p-4 text-center">Cargando Nodos...</div>
                                                    ) : (
                                                        <div className="rounded-md border border-border/50 bg-background/50 overflow-hidden">
                                                            <div className="grid grid-cols-[2fr_1fr_1fr_1fr_1fr_1fr_1fr] p-3 bg-secondary/30 text-xs font-medium text-muted-foreground uppercase tracking-wider">
                                                                <div>Nodo / IP</div>
                                                                <div className="flex justify-center" title="Centro Comercial">Mall</div>
                                                                <div className="flex justify-center" title="Jornada Doble / Continua">Doble</div>
                                                                <div className="flex justify-center" title="Tiene Sportbook">Sportb.</div>
                                                                <div className="flex justify-center" title="Circuito Cerrado TV">CCTV</div>
                                                                <div className="flex justify-center" title="Posee Alarma">Alarma</div>
                                                                <div className="flex justify-center text-sky-500" title="Excepción de Horario">Especial</div>
                                                            </div>
                                                            <ScrollArea className="h-[320px]">
                                                                {zonePoints.map((p, idx) => (
                                                                    <React.Fragment key={p.id}>
                                                                        <div className={`grid grid-cols-[2fr_1fr_1fr_1fr_1fr_1fr_1fr] items-center p-3 text-sm transition-colors hover:bg-secondary/10 ${(idx !== zonePoints.length - 1 && !p.has_custom_schedule) ? 'border-b border-border/50' : ''}`}>
                                                                            <div className="truncate pr-4 flex flex-col">
                                                                                <span className="font-semibold">{p.alias || p.name || 'Sin nombre'}</span>
                                                                                <span className="text-[10px] text-muted-foreground font-mono">{p.ip}</span>
                                                                            </div>

                                                                            <div className="flex justify-center">
                                                                                <Switch
                                                                                    checked={!!p.is_mall}
                                                                                    onCheckedChange={() => handleToggleAttribute(p.id, 'is_mall', p.is_mall)}
                                                                                    className="data-[state=checked]:bg-blue-500 w-8 h-4 [&_span]:h-3 [&_span]:w-3 data-[state=checked]:[&_span]:translate-x-4"
                                                                                />
                                                                            </div>
                                                                            <div className="flex justify-center">
                                                                                <Switch
                                                                                    checked={!!p.is_double}
                                                                                    onCheckedChange={() => handleToggleAttribute(p.id, 'is_double', p.is_double)}
                                                                                    className="data-[state=checked]:bg-emerald-500 w-8 h-4 [&_span]:h-3 [&_span]:w-3 data-[state=checked]:[&_span]:translate-x-4"
                                                                                />
                                                                            </div>
                                                                            <div className="flex justify-center">
                                                                                <Switch
                                                                                    checked={!!p.has_sportbook}
                                                                                    onCheckedChange={() => handleToggleAttribute(p.id, 'has_sportbook', p.has_sportbook)}
                                                                                    className="data-[state=checked]:bg-orange-500 w-8 h-4 [&_span]:h-3 [&_span]:w-3 data-[state=checked]:[&_span]:translate-x-4"
                                                                                />
                                                                            </div>
                                                                            <div className="flex justify-center">
                                                                                <Switch
                                                                                    checked={!!p.has_cctv}
                                                                                    onCheckedChange={() => handleToggleAttribute(p.id, 'has_cctv', p.has_cctv)}
                                                                                    className="data-[state=checked]:bg-purple-500 w-8 h-4 [&_span]:h-3 [&_span]:w-3 data-[state=checked]:[&_span]:translate-x-4"
                                                                                />
                                                                            </div>
                                                                            <div className="flex justify-center">
                                                                                <Switch
                                                                                    checked={!!p.has_alarm}
                                                                                    onCheckedChange={() => handleToggleAttribute(p.id, 'has_alarm', p.has_alarm)}
                                                                                    className="data-[state=checked]:bg-red-500 w-8 h-4 [&_span]:h-3 [&_span]:w-3 data-[state=checked]:[&_span]:translate-x-4"
                                                                                />
                                                                            </div>
                                                                            <div className="flex justify-center">
                                                                                <Switch
                                                                                    checked={!!p.has_custom_schedule}
                                                                                    onCheckedChange={() => handleToggleAttribute(p.id, 'has_custom_schedule', p.has_custom_schedule)}
                                                                                    className="data-[state=checked]:bg-sky-500 w-8 h-4 [&_span]:h-3 [&_span]:w-3 data-[state=checked]:[&_span]:translate-x-4"
                                                                                />
                                                                            </div>
                                                                        </div>

                                                                        {p.has_custom_schedule && (
                                                                            <div className={`bg-sky-500/5 p-3 flex gap-4 items-center pl-8 text-sm ${(idx !== zonePoints.length - 1) ? 'border-b border-border/50' : ''}`}>
                                                                                <span className="text-muted-foreground text-xs font-semibold">HORARIO PERSONALIZADO:</span>
                                                                                <Input
                                                                                    type="time"
                                                                                    defaultValue={p.custom_open_time || ''}
                                                                                    className="w-28 h-8 font-mono bg-background/50"
                                                                                    onBlur={(e) => updatePointAttrMutation.mutate({ id: p.id, attributes: { custom_open_time: e.target.value } })}
                                                                                />
                                                                                <span className="text-muted-foreground">-</span>
                                                                                <Input
                                                                                    type="time"
                                                                                    defaultValue={p.custom_close_time || ''}
                                                                                    className="w-28 h-8 font-mono bg-background/50"
                                                                                    onBlur={(e) => updatePointAttrMutation.mutate({ id: p.id, attributes: { custom_close_time: e.target.value } })}
                                                                                />
                                                                            </div>
                                                                        )}
                                                                    </React.Fragment>
                                                                ))}
                                                                {zonePoints.length === 0 && (
                                                                    <div className="p-8 text-center text-muted-foreground text-sm">
                                                                        No se encontraron puntos de venta para esta zona.
                                                                    </div>
                                                                )}
                                                            </ScrollArea>
                                                        </div>
                                                    )}
                                                </div>
                                            )}

                                        </CardContent>
                                    </Card>
                                );
                            })}
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}
