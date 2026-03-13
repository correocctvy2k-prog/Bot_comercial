import React, { useState, useEffect } from 'react';
import {
    LineChart, Line, AreaChart, Area, BarChart, Bar, XAxis, YAxis,
    CartesianGrid, Tooltip as RechartsTooltip, ResponsiveContainer, Legend
} from 'recharts';
import { DollarSign, TrendingUp, Activity, AlertTriangle, RefreshCw } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { pointsService } from '../services/points.service';

const KpiCard = ({ title, value, icon, badge, accent = "from-primary/20", iconColor = "text-primary" }) => (
    <div className="group relative flex flex-col items-center justify-between p-6 bg-[#0f111a]/80 backdrop-blur-md border border-white/5 rounded-2xl shadow-xl transition-all duration-500 hover:-translate-y-2 hover:border-white/20 hover:shadow-2xl hover:shadow-primary/20 overflow-hidden cursor-pointer">
        {/* Subtle Glow Background Effect */}
        <div className={`absolute top-0 w-full h-full bg-gradient-to-br ${accent} to-transparent opacity-5 group-hover:opacity-10 transition-opacity duration-500 pointer-events-none`} />

        {/* Floating Icon with Backglow (No Box) */}
        <div className="relative mb-6 transform transition-transform duration-500 group-hover:scale-110 group-hover:-translate-y-1 z-10">
            <div className={`absolute inset-0 bg-current opacity-20 blur-2xl rounded-full transition-all duration-500 group-hover:opacity-50 group-hover:blur-3xl ${iconColor}`} />
            <div className={`relative flex items-center justify-center ${iconColor} drop-shadow-2xl`}>
                {React.cloneElement(icon, { className: "w-12 h-12" })}
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
                    <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-widest">{badge}</span>
                </div>
            )}
        </div>
    </div>
);

export default function GerenciaDashboard() {
    const [salesData, setSalesData] = useState([]);
    const [baseline, setBaseline] = useState(null);
    const [pointStats, setPointStats] = useState(null);
    const [loading, setLoading] = useState(true);

    const fetchData = async () => {
        setLoading(true);
        try {
            // Fetch baseline
            const baseRes = await fetch('http://localhost:8000/api/metrics/baseline');
            if (baseRes.ok) {
                const baseJson = await baseRes.json();
                setBaseline(baseJson.data);
            }

            // Fetch extended stats
            try {
                const stats = await pointsService.getPointsStats();
                setPointStats(stats);
            } catch (err) {
                console.warn("Could not fetch point stats", err);
            }

            // Fetch sales and group by date
            const salesRes = await fetch('http://localhost:8000/api/metrics/sales');
            if (salesRes.ok) {
                const salesJson = await salesRes.json();

                // Group by date for the chart
                const grouped = salesJson.data.reduce((acc, curr) => {
                    const date = curr.date.split('T')[0];
                    if (!acc[date]) {
                        acc[date] = { date, revenue: 0, target_revenue: 0, transactions: 0 };
                    }
                    acc[date].revenue += curr.revenue;
                    acc[date].target_revenue += curr.target_revenue;
                    acc[date].transactions += curr.transactions;
                    return acc;
                }, {});

                // Convert to array and sort by date Asc
                const chartData = Object.values(grouped).sort((a, b) => new Date(a.date) - new Date(b.date));
                setSalesData(chartData);
            }
        } catch (error) {
            console.error("Error fetching analytics data:", error);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchData();
        const interval = setInterval(fetchData, 60000); // Poll every minute
        return () => clearInterval(interval);
    }, []);

    // Formatting helpers
    const formatCurrency = (val) => new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 }).format(val);
    const formatMinCurrency = (val) => `$${(val / 1000000).toFixed(1)}M`;

    // Derived Metrics
    const totalRevenue = salesData.reduce((sum, item) => sum + item.revenue, 0);
    const totalTransactions = salesData.reduce((sum, item) => sum + item.transactions, 0);
    const uptime = baseline ? baseline.overall_uptime_pct : 0;

    return (
        <div className="space-y-6 animate-in fade-in duration-500 pb-10">
            {/* Header / Actions */}
            <div className="flex justify-between items-center bg-card/20 p-4 rounded-xl border border-border/40 backdrop-blur-md">
                <div>
                    <h3 className="text-xl font-bold text-foreground">Dashboard Directivo (IA & Big Data)</h3>
                    <p className="text-sm text-muted-foreground">Procesado por Python Analytics Engine</p>
                </div>
                <Button variant="outline" size="sm" onClick={fetchData} disabled={loading} className="gap-2">
                    <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
                    Sincronizar
                </Button>
            </div>

            {/* KPIs Principales */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                <KpiCard
                    title="Ingresos (30 Días)"
                    value={formatCurrency(totalRevenue)}
                    icon={<DollarSign />}
                    badge="Ventas Simuladas"
                    accent="bg-gradient-to-br from-green-500/10 to-transparent"
                />
                <KpiCard
                    title="Transacciones Totales"
                    value={new Intl.NumberFormat().format(totalTransactions)}
                    icon={<Activity />}
                    badge="Ticket Promedio: $25k"
                    accent="bg-gradient-to-br from-blue-500/10 to-transparent"
                />
                <KpiCard
                    title="Uptime de Red"
                    value={`${uptime}%`}
                    icon={<TrendingUp />}
                    badge={`Basado en ${baseline?.total_points || 0} nodos`}
                    accent="bg-gradient-to-br from-purple-500/10 to-transparent"
                />
                <KpiCard
                    title="Riesgo Operativo"
                    value="Bajo / Estable"
                    icon={<AlertTriangle />}
                    badge="IA Predictiva (Próximamente)"
                    accent="bg-gradient-to-br from-orange-500/10 to-transparent"
                />
            </div>

            {/* KPIs Analítica de Nodos Agregados */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <KpiCard
                    title="Nodos Nuevos (30d)"
                    value={pointStats ? pointStats.newPoints : '-'}
                    icon={<TrendingUp />}
                    badge="Expansión de red"
                    accent="bg-gradient-to-br from-teal-500/10 to-transparent"
                    iconColor="text-teal-400"
                />
                <KpiCard
                    title="Alerta Inactividad (>3d)"
                    value={pointStats ? pointStats.prolongedOffline : '-'}
                    icon={<AlertTriangle />}
                    badge="Nodos desconectados prolongados"
                    accent="bg-gradient-to-br from-rose-500/10 to-transparent"
                    iconColor="text-rose-500"
                />
                <KpiCard
                    title="Cerrados Definitivamente"
                    value={pointStats ? pointStats.permanentlyClosed : '-'}
                    icon={<RefreshCw className="transform rotate-45" />}
                    badge="Abandono de red"
                    accent="bg-gradient-to-br from-slate-500/10 to-transparent"
                    iconColor="text-slate-500"
                />
            </div>

            {/* Charts Row 1 */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

                {/* Main Trend Chart */}
                <Card className="lg:col-span-2 bg-card/40 backdrop-blur-sm border-border/50 shadow-sm">
                    <CardHeader>
                        <CardTitle>Tendencia de Ingresos vs Meta (30 Días)</CardTitle>
                        <CardDescription>Progreso diario de facturación consolidada en toda la red de Puntos de Venta.</CardDescription>
                    </CardHeader>
                    <CardContent className="h-[350px]">
                        {loading && salesData.length === 0 ? (
                            <div className="w-full h-full flex items-center justify-center text-muted-foreground">Cargando Big Data...</div>
                        ) : (
                            <ResponsiveContainer width="100%" height="100%" minWidth={1} minHeight={1}>
                                <AreaChart data={salesData} margin={{ top: 10, right: 30, left: 20, bottom: 0 }}>
                                    <defs>
                                        <linearGradient id="colorRevenue" x1="0" y1="0" x2="0" y2="1">
                                            <stop offset="5%" stopColor="#10b981" stopOpacity={0.3} />
                                            <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                                        </linearGradient>
                                    </defs>
                                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--border)" opacity={0.5} />
                                    <XAxis dataKey="date" stroke="var(--muted-foreground)" fontSize={12} tickMargin={10} minTickGap={30} />
                                    <YAxis tickFormatter={formatMinCurrency} stroke="var(--muted-foreground)" fontSize={12} />
                                    <RechartsTooltip
                                        contentStyle={{ backgroundColor: 'rgba(15, 23, 42, 0.9)', borderColor: 'rgba(255,255,255,0.1)', borderRadius: '8px', color: '#fff' }}
                                        formatter={(value) => formatCurrency(value)}
                                        labelStyle={{ color: '#94a3b8', marginBottom: '4px' }}
                                    />
                                    <Legend verticalAlign="top" height={36} />
                                    <Area type="monotone" dataKey="revenue" name="Ingreso Real" stroke="#10b981" strokeWidth={2} fillOpacity={1} fill="url(#colorRevenue)" />
                                    <Line type="monotone" dataKey="target_revenue" name="Meta Global" stroke="#8b5cf6" strokeWidth={2} strokeDasharray="5 5" dot={false} />
                                </AreaChart>
                            </ResponsiveContainer>
                        )}
                    </CardContent>
                </Card>

                {/* Secondary Chart */}
                <Card className="bg-card/40 backdrop-blur-sm border-border/50 shadow-sm">
                    <CardHeader>
                        <CardTitle>Volumen de Transacciones</CardTitle>
                        <CardDescription>Tráfico de clientes diario.</CardDescription>
                    </CardHeader>
                    <CardContent className="h-[350px]">
                        <ResponsiveContainer width="100%" height="100%" minWidth={1} minHeight={1}>
                            <BarChart data={salesData.slice(-14)} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--border)" opacity={0.5} />
                                <XAxis dataKey="date" stroke="var(--muted-foreground)" fontSize={10} tickFormatter={(tick) => tick.substring(5)} />
                                <YAxis stroke="var(--muted-foreground)" fontSize={10} />
                                <RechartsTooltip
                                    contentStyle={{ backgroundColor: 'rgba(15, 23, 42, 0.9)', borderColor: 'rgba(255,255,255,0.1)', borderRadius: '8px' }}
                                    itemStyle={{ color: '#38bdf8' }}
                                />
                                <Bar dataKey="transactions" name="Clientes" fill="#38bdf8" radius={[4, 4, 0, 0]} />
                            </BarChart>
                        </ResponsiveContainer>
                    </CardContent>
                </Card>

            </div>
        </div>
    );
}
