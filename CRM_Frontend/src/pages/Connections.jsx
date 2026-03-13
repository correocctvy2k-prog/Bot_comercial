import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { channelsService } from "@/services/channels.service";
import { Plus, Trash2, Edit, RefreshCw, Smartphone, MessageCircle, Send } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
    DialogFooter,
} from "@/components/ui/dialog";
// We need input and select components, mocking simpler versions for speed if not present
// Assuming Shadcn Input/Label or using HTML standard with Tailwind

export default function Connections() {
    const queryClient = useQueryClient();
    const [isDialogOpen, setIsDialogOpen] = useState(false);

    // Queries
    const { data: channels = [], isLoading } = useQuery({
        queryKey: ['channels'],
        queryFn: channelsService.getChannels,
    });

    // Mutations
    const addChannelMutation = useMutation({
        mutationFn: channelsService.addChannel,
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['channels'] });
            setIsDialogOpen(false);
        },
        onError: (error) => {
            console.error("Failed to add channel:", error);
            alert(`Error al guardar: ${error.message || "Unknown error"}`);
        }
    });

    const deleteChannelMutation = useMutation({
        mutationFn: channelsService.deleteChannel,
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['channels'] });
        },
        onError: (error) => {
            alert(`Error al eliminar: ${error.message}`);
        }
    });

    return (
        <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-700">
            <div className="flex justify-between items-center">
                <div>
                    <p className="text-muted-foreground font-medium">Administra tus bots y canales de comunicación.</p>
                </div>
                <AddChannelDialog
                    open={isDialogOpen}
                    onOpenChange={setIsDialogOpen}
                    onSubmit={(data) => addChannelMutation.mutate(data)}
                    isPending={addChannelMutation.isPending}
                />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {isLoading && <p>Cargando canales...</p>}

                {channels.map((channel) => (
                    <ChannelCard
                        key={channel.id}
                        channel={channel}
                        onDelete={() => deleteChannelMutation.mutate(channel.id)}
                    />
                ))}

                {channels.length === 0 && !isLoading && (
                    <div className="col-span-full text-center py-12 border border-dashed rounded-xl text-muted-foreground">
                        <p>No hay canales conectados. ¡Agrega tu primer bot!</p>
                    </div>
                )}
            </div>
        </div>
    );
}

function ChannelCard({ channel, onDelete }) {
    const getIcon = (type) => {
        const t = (type || "").toLowerCase();
        if (t.includes('tele')) return <Send className="w-6 h-6 text-blue-400" />;
        if (t.includes('whats')) return <MessageCircle className="w-6 h-6 text-green-500" />;
        return <Smartphone className="w-6 h-6 text-gray-400" />;
    };

    return (
        <Card className="hover:border-primary/50 transition-colors group">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">
                    {channel.type || "Desconocido"}
                </CardTitle>
                {getIcon(channel.type)}
            </CardHeader>
            <CardContent>
                <div className="text-2xl font-bold mb-1">{channel.name || 'Bot Sin Nombre'}</div>
                <p className="text-xs text-muted-foreground font-mono truncate">
                    ID: {channel.channel_id}
                </p>
                <div className="mt-4 flex items-center gap-2">
                    <span className={`w-2 h-2 rounded-full ${channel.status === 'active' ? 'bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.6)]' : 'bg-yellow-500'}`}></span>
                    <span className="text-xs text-muted-foreground capitalize">{channel.status || 'unknown'}</span>
                </div>
            </CardContent>
            <CardFooter className="flex justify-end gap-2 pt-0 opacity-0 group-hover:opacity-100 transition-opacity">
                <Link to={`/connections/${channel.channel_id}/config`}>
                    <Button variant="ghost" size="icon">
                        <Edit className="w-4 h-4" />
                    </Button>
                </Link>
                <Button variant="ghost" size="icon" onClick={onDelete} className="text-destructive hover:text-destructive hover:bg-destructive/10">
                    <Trash2 className="w-4 h-4" />
                </Button>
            </CardFooter>
        </Card>
    )
}

function AddChannelDialog({ open, onOpenChange, onSubmit, isPending }) {
    const [formData, setFormData] = useState({
        platform: 'Telegram',
        name: '',
        channel_id: '',
        token: ''
    });

    const handleSubmit = (e) => {
        e.preventDefault();
        onSubmit(formData);
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogTrigger asChild>
                <Button>
                    <Plus className="mr-2 h-4 w-4" /> Agregar Conexión
                </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-[425px]">
                <DialogHeader>
                    <DialogTitle>Agregar Nuevo Canal</DialogTitle>
                    <DialogDescription>
                        Configura un nuevo bot para integrarlo al CRM.
                    </DialogDescription>
                </DialogHeader>
                <form onSubmit={handleSubmit} className="space-y-4 py-4">
                    <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                            <label className="text-sm font-medium">Plataforma</label>
                            <select
                                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                                value={formData.platform}
                                onChange={(e) => setFormData({ ...formData, platform: e.target.value })}
                            >
                                <option value="Telegram">Telegram Bot</option>
                                <option value="WhatsApp">WhatsApp API</option>
                            </select>
                        </div>
                        <div className="space-y-2">
                            <label className="text-sm font-medium">Nombre</label>
                            <input
                                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                                placeholder="Ej: Bot Ventas"
                                value={formData.name}
                                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                                required
                            />
                        </div>
                    </div>

                    <div className="space-y-2">
                        <label className="text-sm font-medium">Internal ID (Único)</label>
                        <input
                            className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm font-mono"
                            placeholder="Ej: bot_ventas_01"
                            value={formData.channel_id}
                            onChange={(e) => setFormData({ ...formData, channel_id: e.target.value })}
                            required
                        />
                        <p className="text-[10px] text-muted-foreground">
                            Identificador único para usar en webhooks (n8n).
                        </p>
                    </div>

                    <div className="space-y-2">
                        <label className="text-sm font-medium">Token / API Key</label>
                        <input
                            type="password"
                            className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm font-mono"
                            placeholder="Pegar Token aquí..."
                            value={formData.token}
                            onChange={(e) => setFormData({ ...formData, token: e.target.value })}
                            required
                        />
                    </div>

                    <DialogFooter className="pt-4">
                        <Button type="submit" disabled={isPending}>
                            {isPending ? 'Conectando...' : 'Guardar Conexión'}
                        </Button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    )
}
