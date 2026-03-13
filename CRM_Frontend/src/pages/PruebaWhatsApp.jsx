import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Send, Loader2, MessageSquare, AlertCircle, CheckCircle } from 'lucide-react';
import { pointsService } from '../services/points.service';

export default function PruebaWhatsApp() {
    const [phone, setPhone] = useState('573155232396'); // Default de prueba
    const [message, setMessage] = useState('Buen día, esta es una prueba MVP desde el CRM de Gane Palmira.');
    const [loading, setLoading] = useState(false);
    const [result, setResult] = useState(null);

    const handleSend = async () => {
        if (!phone || !message) {
            toast.error("Por favor completa el teléfono y el mensaje");
            return;
        }

        setLoading(true);
        setResult(null);

        try {
            console.log("🚀 Iniciando envío MVP a:", phone);
            const data = await pointsService.sendOfficialWhatsAppAlert(phone, message);
            console.log("✅ Respuesta recibida:", data);
            setResult({ success: true, data });
            toast.success("Mensaje enviado exitosamente según el servidor");
        } catch (err) {
            console.error("❌ Error en envío MVP:", err);
            setResult({ success: false, error: err.message });
            toast.error("Error en el envío: " + err.message);
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="p-6 max-w-2xl mx-auto space-y-6">
            <header className="flex flex-col gap-2">
                <h1 className="text-3xl font-bold tracking-tight">Prueba MVP WhatsApp</h1>
                <p className="text-muted-foreground">
                    Esta página aísla el envío de mensajes para verificar la conexión directa con el API oficial de Meta.
                </p>
            </header>

            <Card className="border-primary/20 bg-card/50 backdrop-blur">
                <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                        <MessageSquare className="w-5 h-5 text-primary" />
                        Configuración de Envío (Vía Servidor Ubuntu)
                    </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                    <div className="bg-blue-500/10 border border-blue-500/30 p-3 rounded text-xs text-blue-200 mb-4">
                        ⚠️ Esta prueba inserta en <strong>interactions_log</strong> con estado <strong>pending</strong>.
                        El worker del servidor Ubuntu debe estar encendido para procesarlo.
                    </div>
                    <div className="space-y-2">
                        <label className="text-sm font-medium">Teléfono Destino (con 57)</label>
                        <Input
                            value={phone}
                            onChange={(e) => setPhone(e.target.value)}
                            placeholder="Ej: 573155232396"
                            className="bg-background/50"
                        />
                    </div>
                    <div className="space-y-2">
                        <label className="text-sm font-medium">Contenido del Mensaje</label>
                        <Textarea
                            value={message}
                            onChange={(e) => setMessage(e.target.value)}
                            placeholder="Escribe el mensaje de prueba..."
                            className="bg-background/50 min-h-[120px]"
                        />
                    </div>
                </CardContent>
                <CardFooter className="flex flex-col items-stretch gap-4 border-t border-border/20 pt-6">
                    <Button
                        onClick={handleSend}
                        disabled={loading}
                        className="w-full bg-emerald-600 hover:bg-emerald-700 text-white gap-2 font-bold py-6 text-lg"
                    >
                        {loading ? <Loader2 className="animate-spin" /> : <Send className="w-5 h-5" />}
                        {loading ? "ENVIANDO..." : "ENVIAR MENSAJE AHORA"}
                    </Button>

                    {result && (
                        <div className={`p-4 rounded-lg border flex flex-col gap-2 ${result.success ? 'bg-emerald-500/10 border-emerald-500/30' : 'bg-rose-500/10 border-rose-500/30'}`}>
                            <div className="flex items-center gap-2 font-semibold">
                                {result.success ? <CheckCircle className="text-emerald-500" /> : <AlertCircle className="text-rose-500" />}
                                {result.success ? "Respuesta Exitosa del Servidor" : "Fallo en la Petición"}
                            </div>
                            <pre className="text-xs font-mono overflow-auto max-h-[200px] p-2 bg-black/20 rounded">
                                {JSON.stringify(result.data || result.error, null, 2)}
                            </pre>
                        </div>
                    )}
                </CardFooter>
            </Card>

            <div className="bg-amber-500/10 border border-amber-500/30 p-4 rounded-lg">
                <h3 className="font-semibold text-amber-500 flex items-center gap-2 mb-2">
                    <AlertCircle className="w-4 h-4" /> Notas de Diagnóstico
                </h3>
                <ul className="text-sm text-amber-200/80 list-disc pl-5 space-y-1">
                    <li>Si el servidor responde "ok: true" pero no llega, verifica el celular destino.</li>
                    <li>Si el error es "Failed to fetch", el servidor comercial (puerto 3001) podría estar caído.</li>
                    <li>Esta prueba NO actualiza el estado de las alertas en la base de datos.</li>
                </ul>
            </div>
        </div>
    );
}
