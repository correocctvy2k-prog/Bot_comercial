import React, { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { channelsService } from "@/services/channels.service";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
// import { Input } from "@/components/ui/input"; // Does not exist
// import { Label } from "@/components/ui/label"; // Does not exist
// import { Textarea } from "@/components/ui/textarea"; // Does not exist
// import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"; // Does not exist
import { Save, ArrowLeft, Bot, MessageSquare, Zap } from "lucide-react";
import { supabase } from "@/services/supabase";

// Minimal components for missing ones
const Label = ({ children, className }) => <label className={`text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 ${className}`}>{children}</label>;
const Input = ({ className, ...props }) => <input className={`flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 ${className}`} {...props} />;
const Textarea = ({ className, ...props }) => <textarea className={`flex min-h-[80px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 ${className}`} {...props} />;

// Simple Tabs implementation
const Tabs = ({ defaultValue, className, children }) => {
    const [activeTab, setActiveTab] = useState(defaultValue);
    return (
        <div className={className} data-active-tab={activeTab}>
            {React.Children.map(children, child => {
                if (React.isValidElement(child)) {
                    return React.cloneElement(child, { activeTab, setActiveTab });
                }
                return child;
            })}
        </div>
    );
};

const TabsList = ({ className, children, activeTab, setActiveTab }) => (
    <div className={`inline-flex h-10 items-center justify-center rounded-md bg-muted p-1 text-muted-foreground ${className}`}>
        {React.Children.map(children, child => {
            if (React.isValidElement(child)) {
                return React.cloneElement(child, { activeTab, setActiveTab });
            }
            return child;
        })}
    </div>
);

const TabsTrigger = ({ value, children, activeTab, setActiveTab, className }) => (
    <button
        className={`inline-flex items-center justify-center whitespace-nowrap rounded-sm px-3 py-1.5 text-sm font-medium ring-offset-background transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 ${activeTab === value ? 'bg-background text-foreground shadow-sm' : ''} ${className}`}
        onClick={() => setActiveTab(value)}
    >
        {children}
    </button>
);

const TabsContent = ({ value, children, activeTab }) => {
    if (value !== activeTab) return null;
    return <div className="mt-2 ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2">{children}</div>;
};

export default function BotConfig() {
    const { id } = useParams();
    const navigate = useNavigate();
    const queryClient = useQueryClient();
    const [config, setConfig] = useState({
        welcome_message: "",
        fallback_message: "",
        persona_prompt: "",
        language: "es"
    });

    // Fetch Channel Details
    const { data: channel, isLoading } = useQuery({
        queryKey: ['channel', id],
        queryFn: async () => {
            const { data, error } = await supabase
                .from('channels')
                .select('*')
                .eq('channel_id', id)
                .single();
            if (error) throw error;
            return data;
        }
    });

    // Load initial config when data arrives
    useEffect(() => {
        if (channel?.config) {
            setConfig(prev => ({ ...prev, ...channel.config }));
        }
    }, [channel]);

    // Update Mutation
    const updateConfigMutation = useMutation({
        mutationFn: async (newConfig) => {
            const { error } = await supabase
                .from('channels')
                .update({
                    config: { ...channel.config, ...newConfig }
                })
                .eq('channel_id', id);
            if (error) throw error;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['channel', id] });
            alert("✅ Configuración guardada correctamente");
        },
        onError: (err) => {
            alert("❌ Error al guardar: " + err.message);
        }
    });

    if (isLoading) return <div className="p-8">Cargando configuración...</div>;
    if (!channel) return <div className="p-8 text-red-500">Bot no encontrado</div>;

    return (
        <div className="space-y-6 max-w-4xl mx-auto animate-in fade-in slide-in-from-bottom-4 duration-500">
            {/* Header */}
            <div className="flex items-center gap-4">
                <Button variant="ghost" size="icon" onClick={() => navigate('/connections')}>
                    <ArrowLeft className="w-5 h-5" />
                </Button>
                <div>
                    <h2 className="text-2xl font-bold tracking-tight">Configurar {channel.name}</h2>
                    <p className="text-muted-foreground font-mono text-xs">ID: {channel.channel_id}</p>
                </div>
            </div>

            <Tabs defaultValue="behavior" className="w-full">
                <TabsList className="grid w-full grid-cols-3">
                    <TabsTrigger value="behavior"><MessageSquare className="w-4 h-4 mr-2" /> Comportamiento</TabsTrigger>
                    <TabsTrigger value="persona"><Bot className="w-4 h-4 mr-2" /> Identidad (AI)</TabsTrigger>
                    <TabsTrigger value="advanced"><Zap className="w-4 h-4 mr-2" /> Avanzado</TabsTrigger>
                </TabsList>

                {/* Tab: Behavior */}
                <TabsContent value="behavior">
                    <Card>
                        <CardHeader>
                            <CardTitle>Respuestas Automáticas</CardTitle>
                            <CardDescription>Define cómo saluda y responde tu bot por defecto.</CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            <div className="space-y-2">
                                <Label>Mensaje de Bienvenida</Label>
                                <Textarea
                                    placeholder="Hola! Soy el bot de ventas..."
                                    value={config.welcome_message || ""}
                                    onChange={e => setConfig({ ...config, welcome_message: e.target.value })}
                                    rows={3}
                                />
                                <p className="text-xs text-muted-foreground">Se envía cuando un usuario escribe por primera vez.</p>
                            </div>
                            <div className="space-y-2">
                                <Label>Mensaje de Fallback (Error)</Label>
                                <Textarea
                                    placeholder="No entendí eso, ¿puedes repetir?"
                                    value={config.fallback_message || ""}
                                    onChange={e => setConfig({ ...config, fallback_message: e.target.value })}
                                />
                            </div>
                        </CardContent>
                    </Card>
                </TabsContent>

                {/* Tab: Persona */}
                <TabsContent value="persona">
                    <Card>
                        <CardHeader>
                            <CardTitle>Personalidad de IA</CardTitle>
                            <CardDescription>Instrucciones de sistema para el modelo de lenguaje (Prompt).</CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            <div className="space-y-2">
                                <Label>System Prompt</Label>
                                <Textarea
                                    className="font-mono text-sm leading-relaxed"
                                    placeholder="Eres un experto en ventas de finca raíz..."
                                    value={config.persona_prompt || ""}
                                    onChange={e => setConfig({ ...config, persona_prompt: e.target.value })}
                                    rows={8}
                                />
                            </div>
                        </CardContent>
                    </Card>
                </TabsContent>

                {/* Tab: Advanced */}
                <TabsContent value="advanced">
                    <Card>
                        <CardHeader>
                            <CardTitle>Configuración Técnica</CardTitle>
                            <CardDescription>Parámetros sensibles de conexión.</CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            <div className="grid grid-cols-2 gap-4">
                                <div className="space-y-2">
                                    <Label>WABA ID (WhatsApp)</Label>
                                    <Input
                                        value={config.waba_id || ""}
                                        onChange={e => setConfig({ ...config, waba_id: e.target.value })}
                                        disabled={channel.type !== 'WhatsApp'}
                                    />
                                </div>
                                <div className="space-y-2">
                                    <Label>Token (Oculto)</Label>
                                    <Input type="password" value="****************" disabled />
                                </div>
                            </div>
                        </CardContent>
                    </Card>
                </TabsContent>
            </Tabs>

            <div className="flex justify-end gap-4">
                <Button variant="outline" onClick={() => navigate('/connections')}>Cancelar</Button>
                <Button onClick={() => updateConfigMutation.mutate(config)} disabled={updateConfigMutation.isPending}>
                    <Save className="w-4 h-4 mr-2" />
                    {updateConfigMutation.isPending ? 'Guardando...' : 'Guardar Cambios'}
                </Button>
            </div>
        </div>
    );
}
