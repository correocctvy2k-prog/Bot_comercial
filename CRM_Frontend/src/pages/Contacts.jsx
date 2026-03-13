import React, { useState, useEffect } from 'react';
import { useQuery, useQueryClient, useMutation } from '@tanstack/react-query';
import { crmService } from '../services/crm.service';
import { pointsService } from '../services/points.service';
import { supabase } from '../services/supabase';
import { useNavigate } from 'react-router-dom';
import { Users, Search, ChevronRight, TrendingUp, GitMerge, Activity, Store, Phone, User as UserIcon, Building2, Clock, Edit3, Save } from 'lucide-react';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { formatDistanceToNow } from "date-fns";
import { es } from "date-fns/locale";

// ─── Canal Icons (same as Dashboard) ────────────────────────────────
const WhatsAppIcon = ({ size = 14 }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
        <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.297-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z" fill="#25D366" />
        <path d="M12 0C5.373 0 0 5.373 0 12c0 2.127.558 4.122 1.532 5.852L.054 23.35a.75.75 0 00.918.919l5.593-1.494A11.942 11.942 0 0012 24c6.627 0 12-5.373 12-12S18.627 0 12 0zm0 22c-1.943 0-3.76-.523-5.314-1.432l-.38-.224-3.946 1.055 1.04-3.854-.247-.393A9.956 9.956 0 012 12C2 6.477 6.477 2 12 2s10 4.477 10 10-4.477 10-10 10z" fill="#25D366" />
    </svg>
);

const TelegramIcon = ({ size = 14 }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
        <circle cx="12" cy="12" r="12" fill="#2AABEE" />
        <path d="M17.54 7.155l-2.04 9.61c-.15.673-.54.84-1.094.523l-3.03-2.232-1.462 1.407c-.162.162-.297.297-.61.297l.218-3.085 5.62-5.077c.244-.218-.054-.337-.378-.12L6.56 13.91 3.57 12.98c-.657-.206-.67-.657.138-.973l13.702-5.284c.546-.198 1.024.134.83.432z" fill="white" />
    </svg>
);

// ─── Detectar canales de un contacto ────────────────────────────────
function getChannels(identities = []) {
    const hasWA = identities.some(i =>
        i.channel_type === 'whatsapp' || String(i.provider_id).startsWith('57') || !String(i.provider_id).startsWith('tg_')
    );
    const hasTG = identities.some(i =>
        i.channel_type === 'telegram' || String(i.provider_id).startsWith('tg_')
    );
    return { hasWA, hasTG };
}

// ─── Avatar con iniciales y color único por nombre ───────────────────
const AVATAR_GRADIENTS = [
    "from-violet-500 to-purple-700",
    "from-blue-500 to-cyan-600",
    "from-emerald-500 to-teal-700",
    "from-amber-500 to-orange-600",
    "from-pink-500 to-rose-700",
    "from-indigo-500 to-blue-700",
];

function getGradient(name = "") {
    const idx = name.charCodeAt(0) % AVATAR_GRADIENTS.length;
    return AVATAR_GRADIENTS[idx];
}

// ─── KPI Card UI (Global Premium Redesign) ──────────────────────────
const KpiCard = ({ title, value, icon, badge, badgeColor, accent = "from-primary/20", iconColor = "text-primary" }) => (
    <div className="group relative flex flex-col items-center justify-between p-6 bg-[#0f111a]/80 backdrop-blur-md border border-white/5 rounded-2xl shadow-xl transition-all duration-500 hover:-translate-y-2 hover:border-white/20 hover:shadow-2xl hover:shadow-primary/20 overflow-hidden cursor-pointer">
        {/* Subtle Glow Background Effect */}
        <div className={`absolute top-0 w-full h-full bg-gradient-to-br ${accent} to-transparent opacity-5 group-hover:opacity-10 transition-opacity duration-500 pointer-events-none`} />

        {/* Floating Icon with Backglow (No Box) */}
        <div className="relative mb-6 transform transition-transform duration-500 group-hover:scale-110 group-hover:-translate-y-1 z-10 w-full flex justify-center mt-2">
            <div className={`absolute inset-0 bg-current opacity-20 blur-2xl rounded-full transition-all duration-500 group-hover:opacity-50 group-hover:blur-3xl ${iconColor}`} />
            <div className={`relative flex items-center justify-center ${iconColor} drop-shadow-2xl`}>
                {React.cloneElement(icon, { className: "w-11 h-11" })}
            </div>
        </div>

        {/* Title */}
        <h3 className="text-[11px] font-bold tracking-[0.15em] text-muted-foreground uppercase text-center mb-3 z-10 transition-colors duration-300 group-hover:text-white/90">
            {title}
        </h3>

        {/* Main Value */}
        <div className="text-4xl font-black tracking-tight text-white z-10 flex flex-col items-center gap-1">
            <span>{value}</span>
            {badge && (
                <div className="mt-4 w-full pt-4 border-t border-white/5 flex justify-center transition-colors duration-300 group-hover:border-white/10">
                    <span className={`text-[10px] font-medium uppercase tracking-widest ${badgeColor || 'text-muted-foreground group-hover:text-gray-300'}`}>{badge}</span>
                </div>
            )}
        </div>
    </div>
);

// ════════════════════════════════════════════════════════════════════
//  CONTACTS PAGE
// ════════════════════════════════════════════════════════════════════
export default function Contacts() {
    const navigate = useNavigate();
    const [searchTerm, setSearchTerm] = useState("");
    const [activeTab, setActiveTab] = useState("leads");

    const { data: stats } = useQuery({
        queryKey: ['contactsStats'],
        queryFn: crmService.getContactsStats,
        staleTime: 60000,
    });

    const queryClient = useQueryClient();

    // Obtener los contactos regulares
    const { data: contacts = [], isLoading: loadingContacts } = useQuery({
        queryKey: ['contacts'],
        queryFn: crmService.getContacts,
        staleTime: 0,
    });

    // Obtener la información de los nodos para listar a los asesores
    const { data: allPoints = [], isLoading: loadingPoints } = useQuery({
        queryKey: ['all-points-config'],
        queryFn: pointsService.getPoints,
        staleTime: 0,
    });

    const updatePointAttrMutation = useMutation({
        mutationFn: ({ id, attributes }) => pointsService.updatePointAttributes(id, attributes),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['all-points-config'] });
        }
    });

    // Subscripción a Supabase Realtime para la vista de Contactos
    useEffect(() => {
        const channelName = `contacts-${Date.now()}`;
        console.log(`📡 [REALTIME] Iniciando suscripción a ${channelName}...`);

        let channel = supabase.channel(channelName);

        channel
            .on(
                "postgres_changes",
                { event: "*", schema: "public", table: "contacts" },
                () => {
                    queryClient.invalidateQueries({ queryKey: ['contacts'] });
                    queryClient.invalidateQueries({ queryKey: ['contactsStats'] });
                }
            )
            .on(
                "postgres_changes",
                { event: "INSERT", schema: "public", table: "contact_identities" },
                () => {
                    queryClient.invalidateQueries({ queryKey: ['contacts'] });
                    queryClient.invalidateQueries({ queryKey: ['contactsStats'] });
                }
            )
            .subscribe((status, err) => {
                if (status === "SUBSCRIBED") {
                    console.log(`✅ [REALTIME] Suscrito correctamente a ${channelName}`);
                } else if (status === "CHANNEL_ERROR") {
                    console.error("❌ [REALTIME] Error en canal:", err);
                } else if (status === "CLOSED" || status === "TIMED_OUT") {
                    console.warn(`⚠️ [REALTIME] Canal ${status}.`);
                }
            });

        return () => {
            console.log(`🔌 [REALTIME] Desconectando ${channelName}...`);
            supabase.removeChannel(channel);
        };
    }, [queryClient]);

    const filteredLeads = contacts.filter(c =>
        c.display_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        c.contact_identities?.some(i => i.provider_id?.includes(searchTerm))
    );

    const filteredAsesores = allPoints.filter(p =>
        p.alias?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        p.asesor_nombre?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        p.asesor_telefono?.includes(searchTerm)
    );

    return (
        <div className="space-y-6 animate-in fade-in duration-500 pb-10">
            {/* Header & Tabs */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                    <h2 className="text-2xl font-bold text-white tracking-tight flex items-center gap-2">
                        <Users className="h-6 w-6 text-primary" /> Multi-Canal
                    </h2>
                    <p className="text-muted-foreground font-medium mt-1">Gestiona tu base de clientes comunes o los encargados de nodos.</p>
                </div>

                <Tabs value={activeTab} onValueChange={setActiveTab} className="w-[350px]">
                    <TabsList className="w-full grid grid-cols-2">
                        <TabsTrigger value="leads" className="relative gap-2">
                            <Users className="w-4 h-4" /> Usuarios (Leads)
                        </TabsTrigger>
                        <TabsTrigger value="asesores" className="relative gap-2">
                            <Store className="w-4 h-4" /> Asesores (Nodos)
                        </TabsTrigger>
                    </TabsList>
                </Tabs>
            </div>

            {/* ── KPIs ── */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                <KpiCard
                    title="Total Contactos"
                    value={stats?.total ?? 0}
                    icon={<Users className="w-4 h-4" />}
                />
                <KpiCard
                    title="Nuevos (últimos 7d)"
                    value={stats?.newLast7d ?? 0}
                    icon={<TrendingUp className="w-4 h-4" />}
                    badgeColor="text-emerald-400"
                    badge="recientes"
                />
                <KpiCard
                    title="Contactos Multicanal"
                    value={stats?.multiChannel ?? 0}
                    icon={<GitMerge className="w-4 h-4" />}
                    badgeColor="text-purple-400"
                    badge="perfiles unificados"
                />
                <KpiCard
                    title="Total Identidades"
                    value={(stats?.waIdentities || 0) + (stats?.tgIdentities || 0)}
                    icon={<Activity className="w-4 h-4" />}
                    badgeColor="text-sky-400"
                    badge="conectadas"
                />
            </div >

            {/* Search */}
            < div className="relative w-full md:w-96" >
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <input
                    type="text"
                    placeholder="Buscar por nombre o número..."
                    className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-card/50 border border-border text-sm focus:outline-none focus:ring-2 focus:ring-primary/40 transition"
                    value={searchTerm}
                    onChange={e => setSearchTerm(e.target.value)}
                />
            </div >

            {/* Grid */}
            {activeTab === 'leads' ? (
                loadingContacts ? (
                    <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
                        {[...Array(6)].map((_, i) => (
                            <div key={i} className="h-24 rounded-xl bg-card/40 animate-pulse" />
                        ))}
                    </div>
                ) : filteredLeads.length === 0 ? (
                    <div className="text-center py-20 text-muted-foreground border border-dashed border-border/50 rounded-xl bg-card/20">
                        <Users className="w-10 h-10 mx-auto mb-3 opacity-30" />
                        <p>No se encontraron leads con esos parámetros.</p>
                    </div>
                ) : (
                    <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
                        {filteredLeads.map(contact => (
                            <ContactCard
                                key={contact.id}
                                contact={contact}
                                onClick={() => navigate(`/contacts/${contact.id}`)}
                            />
                        ))}
                    </div>
                )
            ) : (
                loadingPoints ? (
                    <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
                        {[...Array(6)].map((_, i) => (
                            <div key={i} className="h-24 rounded-xl bg-card/40 animate-pulse" />
                        ))}
                    </div>
                ) : filteredAsesores.length === 0 ? (
                    <div className="text-center py-20 text-muted-foreground border border-dashed border-border/50 rounded-xl bg-card/20">
                        <Store className="w-10 h-10 mx-auto mb-3 opacity-30" />
                        <p>No se encontraron nodos o asesores con esos parámetros.</p>
                    </div>
                ) : (
                    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                        {filteredAsesores.map(point => (
                            <AsesorCard
                                key={point.id}
                                point={point}
                                updatePointAttrMutation={updatePointAttrMutation}
                            />
                        ))}
                    </div>
                )
            )}
        </div >
    );
}

// ─── Asesor Card ────────────────────────────────────────────────────
function AsesorCard({ point, updatePointAttrMutation }) {
    const isReady = point.asesor_nombre && point.asesor_telefono;
    const gradient = getGradient(point.alias || "A");
    const [isEditing, setIsEditing] = useState(false);
    const [tempName, setTempName] = useState(point.asesor_nombre || '');
    const [tempPhone, setTempPhone] = useState(point.asesor_telefono || '');

    const handleSave = (e) => {
        e.stopPropagation();
        updatePointAttrMutation.mutate({
            id: point.id,
            attributes: { asesor_nombre: tempName, asesor_telefono: tempPhone }
        }, {
            onSuccess: () => setIsEditing(false)
        });
    };

    return (
        <div className="group w-full text-left bg-card/40 backdrop-blur-sm border border-border/60 rounded-xl p-4 hover:border-primary/40 hover:bg-card/70 transition-all duration-200">
            <div className="flex justify-between items-start mb-3">
                <div className="flex items-center gap-3">
                    <div className={`w-10 h-10 rounded-full bg-gradient-to-br ${gradient} flex items-center justify-center text-white font-bold text-sm shadow-lg shadow-black/20 ring-2 ring-white/10`}>
                        <Store className="w-5 h-5 text-white/90" />
                    </div>
                    <div>
                        <h4 className="font-semibold text-foreground leading-tight group-hover:text-primary transition-colors">
                            {point.alias || point.name || 'Sin Alias'}
                        </h4>
                        <p className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5">
                            <Building2 className="w-3 h-3" /> {point.segment}
                        </p>
                    </div>
                </div>
                {!isEditing && (
                    <Button variant="ghost" size="icon" className="h-7 w-7 opacity-50 space-x-0 bg-white/5 hover:opacity-100 transition-opacity" onClick={(e) => { e.stopPropagation(); setIsEditing(true); }}>
                        <Edit3 className="w-3.5 h-3.5" />
                    </Button>
                )}
            </div>

            <div className="bg-background/50 rounded-md p-3 border border-border/40 mt-2">
                {isEditing ? (
                    <div className="flex flex-col gap-2">
                        <Input
                            size="sm"
                            placeholder="Nombre Completo..."
                            className="h-8 text-xs bg-background/80 focus-visible:ring-1 focus-visible:ring-primary/40"
                            value={tempName}
                            onChange={e => setTempName(e.target.value)}
                        />
                        <Input
                            size="sm"
                            placeholder="Teléfono (Ej. 300123...)"
                            className="h-8 text-xs bg-background/80 focus-visible:ring-1 focus-visible:ring-primary/40"
                            value={tempPhone}
                            onChange={e => setTempPhone(e.target.value)}
                        />
                        <div className="flex justify-end gap-2 mt-1">
                            <Button variant="ghost" size="sm" className="h-7 text-[10px] px-2" onClick={() => setIsEditing(false)}>Cancelar</Button>
                            <Button size="sm" className="h-7 text-[10px] px-3 bg-primary hover:bg-primary/90" onClick={handleSave} disabled={updatePointAttrMutation.isPending}>
                                <Save className="w-3 h-3 mr-1" /> Guardar
                            </Button>
                        </div>
                    </div>
                ) : (
                    <div className="flex flex-col gap-2">
                        <div className="flex items-center gap-2">
                            <UserIcon className="w-3.5 h-3.5 text-primary/70" />
                            <span className={`text-sm ${point.asesor_nombre ? 'text-foreground' : 'text-muted-foreground italic text-xs'}`}>
                                {point.asesor_nombre || 'Asesor no asignado'}
                            </span>
                        </div>
                        <div className="flex items-center gap-2">
                            <Phone className="w-3.5 h-3.5 text-primary/70" />
                            <span className={`text-sm ${point.asesor_telefono ? 'text-foreground' : 'text-muted-foreground italic text-xs'}`}>
                                {point.asesor_telefono || 'Teléfono no asignado'}
                            </span>
                        </div>
                    </div>
                )}
            </div>

            <div className="mt-3 flex gap-2">
                <div className={`px-2.5 py-1 text-[10px] uppercase tracking-wider font-bold rounded-full w-fit flex items-center gap-1.5 ${isReady ? 'bg-emerald-500/10 text-emerald-500 border border-emerald-500/20' : 'bg-red-500/10 text-red-400 border border-red-500/20'}`}>
                    <div className={`w-1.5 h-1.5 rounded-full ${isReady ? 'bg-emerald-500' : 'bg-red-400'}`} />
                    {isReady ? 'Contacto Listo para IA' : 'Falta Configurar Contacto'}
                </div>
            </div>
        </div>
    );
}

// ─── Contact Card ────────────────────────────────────────────────────
function ContactCard({ contact, onClick }) {
    const identities = contact.contact_identities || [];
    const { hasWA, hasTG } = getChannels(identities);
    const isMulti = hasWA && hasTG;
    const initials = (contact.display_name || "?").substring(0, 2).toUpperCase();
    const gradient = getGradient(contact.display_name || "");

    // Mostrar el provider_id principal (preferir WA si tiene ambos)
    const mainIdentity = identities.find(i => !String(i.provider_id).startsWith('tg_')) || identities[0];
    const providerId = mainIdentity?.provider_id || "";

    return (
        <button
            onClick={onClick}
            className="group w-full text-left bg-card/40 backdrop-blur-sm border border-border/60 rounded-xl p-4 hover:border-primary/40 hover:bg-card/70 transition-all duration-200 flex items-center gap-4"
        >
            {/* Avatar */}
            <div className={`relative w-12 h-12 rounded-full bg-gradient-to-br ${gradient} flex items-center justify-center text-white font-bold text-sm shrink-0`}>
                {initials}
                {/* Canal badges en el avatar */}
                {isMulti && (
                    <span className="absolute -bottom-0.5 -right-0.5 w-4 h-4 rounded-full bg-background border border-border flex items-center justify-center">
                        <span className="text-[8px] font-bold text-primary">2</span>
                    </span>
                )}
            </div>

            {/* Info */}
            <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-0.5">
                    <span className="font-semibold text-sm truncate">
                        {contact.display_name || "Usuario desconocido"}
                    </span>
                    {isMulti && (
                        <span className="shrink-0 text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-primary/10 text-primary border border-primary/20">
                            Multicanal
                        </span>
                    )}
                </div>
                <div className="text-xs text-muted-foreground truncate mb-1.5">
                    {providerId ? `+${providerId}`.replace(/^\+tg_/, 'tg_') : "—"}
                </div>
                {/* Canal icons */}
                <div className="flex items-center gap-2">
                    {hasWA && <WhatsAppIcon size={13} />}
                    {hasTG && <TelegramIcon size={13} />}
                    {contact.updated_at && (
                        <span className="flex items-center gap-1 text-[10px] text-muted-foreground ml-auto">
                            <Clock className="w-2.5 h-2.5" />
                            {formatDistanceToNow(new Date(contact.updated_at), { addSuffix: true, locale: es })}
                        </span>
                    )}
                </div>
            </div>

            <ChevronRight className="w-4 h-4 text-muted-foreground/40 group-hover:text-muted-foreground transition shrink-0" />
        </button>
    );
}
