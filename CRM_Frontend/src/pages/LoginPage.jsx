import { useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { motion } from 'framer-motion';
import { LogIn, Lock, Loader2, Eye, EyeOff, Bot, BarChart3, Shield, Zap, Sparkles } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { toast } from 'sonner';
import SkylabBot from '../components/SkylabBot';
import { supabase } from '../services/supabase';
const FEATURES = [
    {
        icon: Bot,
        title: 'Bots Personalizados',
        desc: 'Integración y monitoreo de Bots a medida',
        color: 'text-blue-400',
        bg: 'bg-blue-500/10',
        border: 'border-blue-500/20',
    },
    {
        icon: BarChart3,
        title: 'Analítica en Tiempo Real',
        desc: 'KPIs de puntos de venta por zona y período',
        color: 'text-indigo-400',
        bg: 'bg-indigo-500/10',
        border: 'border-indigo-500/20',
    },
    {
        icon: Shield,
        title: 'Control de Acceso',
        desc: 'Roles y permisos granulares por módulo',
        color: 'text-violet-400',
        bg: 'bg-violet-500/10',
        border: 'border-violet-500/20',
    },
    {
        icon: Zap,
        title: 'Automatización',
        desc: 'Workflows inteligentes para agilizar procesos',
        color: 'text-cyan-400',
        bg: 'bg-cyan-500/10',
        border: 'border-cyan-500/20',
    },
];

// Floating animated orb
function Orb({ className, style, animate }) {
    return (
        <motion.div
            animate={animate}
            transition={{ duration: 18, repeat: Infinity, ease: 'easeInOut' }}
            className={`absolute rounded-full blur-[80px] pointer-events-none ${className}`}
            style={style}
        />
    );
}

export default function LoginPage() {
    const [identifier, setIdentifier] = useState('');
    const [password, setPassword] = useState('');
    const [showPassword, setShowPassword] = useState(false);
    const [loading, setLoading] = useState(false);
    const [newPassword, setNewPassword] = useState('');
    const [requirePasswordChange, setRequirePasswordChange] = useState(false);
    const { login } = useAuth();
    const navigate = useNavigate();
    const location = useLocation();
    const from = location.state?.from?.pathname || '/';

    const handleLogin = async (e) => {
        e.preventDefault();
        setLoading(true);
        try {
            await login(identifier, password);
            if (password === '#Seguridad.48') {
                setRequirePasswordChange(true);
                return;
            }
            toast.success('¡Bienvenido de nuevo!');
            navigate(from, { replace: true });
        } catch (error) {
            toast.error('Error al iniciar sesión', {
                description: error.message || 'Verifica tus credenciales',
            });
        } finally {
            setLoading(false);
        }
    };

    const handleChangePassword = async (e) => {
        e.preventDefault();
        setLoading(true);
        try {
            if (newPassword === '#Seguridad.48' || newPassword.length < 8) {
                toast.error('Contraseña inválida', {
                    description: 'Debe tener al menos 8 caracteres y ser diferente a la inicial.',
                });
                setLoading(false);
                return;
            }
            const { error } = await supabase.auth.updateUser({ password: newPassword });
            if (error) throw error;
            toast.success('¡Contraseña actualizada con éxito!', {
                description: 'Bienvenido al ecosistema Skylab.',
            });
            navigate(from, { replace: true });
        } catch (error) {
            toast.error('Error al actualizar contraseña', {
                description: error.message || 'Inténtalo nuevamente',
            });
        } finally {
            setLoading(false);
        }
    };

    return (
        <div
            className="min-h-screen w-full flex overflow-hidden relative"
            style={{ background: '#030711' }}
        >
            {/* ─── GLOBAL ANIMATED ORBS (behind everything) ────────────────── */}
            <Orb
                className="w-[600px] h-[600px] bg-blue-600/12"
                style={{ top: '-10%', left: '-5%' }}
                animate={{ x: [0, 40, -20, 0], y: [0, -25, 20, 0] }}
            />
            <Orb
                className="w-[500px] h-[500px] bg-indigo-600/10"
                style={{ bottom: '-10%', right: '40%' }}
                animate={{ x: [0, -30, 20, 0], y: [0, 20, -15, 0] }}
            />
            <Orb
                className="w-[400px] h-[400px] bg-violet-600/8"
                style={{ top: '30%', right: '10%' }}
                animate={{ x: [0, 25, -10, 0], y: [0, -30, 10, 0] }}
            />

            {/* ─── LEFT PANEL — Branding ──────────────────────────────────── */}
            <div className="hidden lg:flex lg:w-[55%] xl:w-1/2 flex-col justify-between p-12 xl:p-16 relative">
                {/* Subtle dot grid */}
                <div
                    className="absolute inset-0 pointer-events-none opacity-[0.04]"
                    style={{
                        backgroundImage: 'radial-gradient(circle, rgba(255,255,255,0.8) 1px, transparent 1px)',
                        backgroundSize: '28px 28px',
                    }}
                />

                {/* Left glass border */}
                <div className="absolute right-0 top-0 h-full w-px bg-gradient-to-b from-transparent via-white/5 to-transparent" />

                {/* Top: Logo */}
                <motion.div
                    initial={{ opacity: 0, y: -20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.7, delay: 0.1 }}
                    className="flex items-center gap-4 relative z-10"
                >
                    <div className="relative">
                        {/* Soft glow behind bot — sin recuadro */}
                        <div className="absolute inset-0 rounded-full bg-blue-500/15 blur-2xl scale-150" />
                        <SkylabBot size={48} className="text-blue-400 relative z-10" />
                    </div>
                    <div>
                        <h1 className="text-2xl font-black tracking-tight text-white">SKYLAB</h1>
                        <p className="text-xs font-bold uppercase tracking-[0.2em] text-blue-400/70">Gestión Inteligente</p>
                    </div>
                </motion.div>

                {/* Middle: Hero text + features */}
                <div className="flex-1 flex flex-col justify-center py-12 relative z-10 space-y-10">
                    <motion.div
                        initial={{ opacity: 0, x: -30 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ duration: 0.8, delay: 0.25 }}
                    >
                        <p className="text-xs font-bold uppercase tracking-[0.25em] text-blue-400 mb-4">
                            Ecosistema Operacional
                        </p>
                        <h2 className="text-4xl xl:text-5xl font-black text-white leading-tight tracking-tight">
                            Gestión corporativa{' '}
                            <span className="bg-gradient-to-r from-blue-400 to-indigo-400 bg-clip-text text-transparent">
                                potenciada por IA
                            </span>
                        </h2>
                        <p className="text-white/40 mt-4 text-base leading-relaxed font-medium max-w-md">
                            Centraliza operaciones, automatiza reportes y toma decisiones con datos en tiempo real.
                        </p>
                    </motion.div>

                    <div className="grid grid-cols-1 gap-3">
                        {FEATURES.map((f, i) => (
                            <motion.div
                                key={f.title}
                                initial={{ opacity: 0, x: -20 }}
                                animate={{ opacity: 1, x: 0 }}
                                transition={{ duration: 0.5, delay: 0.4 + i * 0.1 }}
                                className={`flex items-center gap-4 p-4 rounded-2xl border ${f.border} bg-white/[0.02] backdrop-blur-sm hover:bg-white/[0.04] transition-colors group`}
                            >
                                <div className={`p-2.5 rounded-xl ${f.bg} ${f.color} shrink-0 transition-transform group-hover:scale-110`}>
                                    <f.icon size={18} />
                                </div>
                                <div>
                                    <p className="font-bold text-sm text-white">{f.title}</p>
                                    <p className="text-[11px] text-white/40 font-medium">{f.desc}</p>
                                </div>
                            </motion.div>
                        ))}
                    </div>
                </div>

                {/* Bottom: Badge */}
                <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: 0.9, duration: 0.6 }}
                    className="flex items-center gap-3 relative z-10"
                >
                    <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-white/5 border border-white/10">
                        <video
                            src="/gemini.mp4"
                            autoPlay
                            loop
                            muted
                            playsInline
                            className="w-5 h-5 rounded-sm object-cover shrink-0"
                        />
                        <span className="text-[10px] font-bold uppercase tracking-widest text-white/50">Powered by Gemini AI</span>
                    </div>
                    <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-white/5 border border-white/10">
                        <div className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                        <span className="text-[10px] font-bold uppercase tracking-widest text-white/50">Sistema activo</span>
                    </div>
                </motion.div>
            </div>

            {/* ─── RIGHT PANEL — Login Form ────────────────────────────────── */}
            <div className="w-full lg:w-[45%] xl:w-1/2 flex items-center justify-center p-6 sm:p-10 relative">
                <motion.div
                    initial={{ opacity: 0, y: 24 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.65, delay: 0.15 }}
                    className="w-full max-w-[420px]"
                >
                    {/* Mobile-only logo */}
                    <div className="flex lg:hidden items-center justify-center gap-3 mb-10">
                        <div className="relative">
                            <div className="absolute inset-0 rounded-full bg-blue-500/15 blur-xl scale-150" />
                            <SkylabBot size={36} className="text-blue-400 relative z-10" />
                        </div>
                        <div>
                            <h1 className="text-xl font-black tracking-tight text-white">SKYLAB</h1>
                            <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-blue-400/70">Gestión Inteligente</p>
                        </div>
                    </div>

                    {/* Card */}
                    <div className="bg-white/[0.04] backdrop-blur-2xl border border-white/8 rounded-3xl p-8 sm:p-10 shadow-2xl relative overflow-hidden">
                        {/* Inner glow top */}
                        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-2/3 h-px bg-gradient-to-r from-transparent via-white/20 to-transparent" />

                        {requirePasswordChange ? (
                            <div className="mb-8">
                                <h2 className="text-2xl font-black text-amber-400 tracking-tight">Cambio Requerido</h2>
                                <p className="text-white/40 text-sm font-medium mt-1">
                                    Por tu seguridad, debes establecer una nueva contraseña permanente antes de continuar.
                                </p>
                            </div>
                        ) : (
                            <div className="mb-8">
                                <h2 className="text-2xl font-black text-white tracking-tight">Bienvenido</h2>
                                <p className="text-white/40 text-sm font-medium mt-1">
                                    Ingresa con tu usuario o email del ecosistema
                                </p>
                            </div>
                        )}

                        {requirePasswordChange ? (
                            <form onSubmit={handleChangePassword} className="space-y-5">
                                {/* New Password */}
                                <div className="space-y-1.5">
                                    <div className="flex items-center justify-between px-1">
                                        <label className="text-[10px] font-black uppercase tracking-[0.18em] text-white/40">
                                            Nueva Contraseña
                                        </label>
                                    </div>
                                    <div className="relative group">
                                        <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                                            <Lock size={16} className="text-white/25 group-focus-within:text-amber-400 transition-colors" />
                                        </div>
                                        <input
                                            type={showPassword ? 'text' : 'password'}
                                            required
                                            value={newPassword}
                                            onChange={(e) => setNewPassword(e.target.value)}
                                            className="w-full bg-white/5 border border-white/8 rounded-2xl py-3.5 pl-11 pr-12 text-white placeholder:text-white/20 focus:outline-none focus:ring-2 focus:ring-amber-500/25 focus:border-amber-500/40 transition-all font-medium text-sm"
                                            placeholder="Ingresa tu nueva clave..."
                                        />
                                        <button
                                            type="button"
                                            onClick={() => setShowPassword(p => !p)}
                                            className="absolute inset-y-0 right-0 pr-4 flex items-center text-white/25 hover:text-white/60 transition-colors"
                                        >
                                            {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                                        </button>
                                    </div>
                                </div>

                                {/* Submit Change */}
                                <div className="pt-2">
                                    <button
                                        type="submit"
                                        disabled={loading}
                                        className="w-full relative group bg-gradient-to-r from-amber-600 to-orange-600 hover:from-amber-500 hover:to-orange-500 text-white font-black py-4 rounded-2xl shadow-xl shadow-amber-600/20 transition-all flex items-center justify-center gap-3 active:scale-[0.98] disabled:opacity-70 disabled:active:scale-100 overflow-hidden"
                                    >
                                        <div className="absolute inset-0 bg-white/0 group-hover:bg-white/5 transition-colors" />
                                        <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-white/30 to-transparent" />
                                        {loading ? (
                                            <Loader2 className="animate-spin relative z-10" size={20} />
                                        ) : (
                                            <>
                                                <Shield size={18} className="relative z-10" />
                                                <span className="relative z-10 tracking-wide">Actualizar Guardar y Entrar</span>
                                            </>
                                        )}
                                    </button>
                                </div>
                            </form>
                        ) : (
                            <form onSubmit={handleLogin} className="space-y-5">
                                {/* Identifier */}
                                <div className="space-y-1.5">
                                    <label className="text-[10px] font-black uppercase tracking-[0.18em] text-white/40 ml-1">
                                        Usuario o Email
                                    </label>
                                    <div className="relative group">
                                        <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-white/25 group-focus-within:text-blue-400 transition-colors">
                                                <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>
                                            </svg>
                                        </div>
                                        <input
                                            type="text"
                                            required
                                            autoComplete="username"
                                            value={identifier}
                                            onChange={(e) => setIdentifier(e.target.value)}
                                            className="w-full bg-white/5 border border-white/8 rounded-2xl py-3.5 pl-11 pr-4 text-white placeholder:text-white/20 focus:outline-none focus:ring-2 focus:ring-blue-500/25 focus:border-blue-500/40 transition-all font-medium text-sm"
                                            placeholder="jbeltran"
                                        />
                                    </div>
                                </div>

                                {/* Password */}
                                <div className="space-y-1.5">
                                    <div className="flex items-center justify-between px-1">
                                        <label className="text-[10px] font-black uppercase tracking-[0.18em] text-white/40">
                                            Contraseña
                                        </label>
                                        <button
                                            type="button"
                                            className="text-[10px] font-bold text-blue-400/70 hover:text-blue-400 transition-colors uppercase tracking-tight"
                                        >
                                            ¿Olvidaste tu contraseña?
                                        </button>
                                    </div>
                                    <div className="relative group">
                                        <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                                            <Lock size={16} className="text-white/25 group-focus-within:text-blue-400 transition-colors" />
                                        </div>
                                        <input
                                            type={showPassword ? 'text' : 'password'}
                                            required
                                            autoComplete="current-password"
                                            value={password}
                                            onChange={(e) => setPassword(e.target.value)}
                                            className="w-full bg-white/5 border border-white/8 rounded-2xl py-3.5 pl-11 pr-12 text-white placeholder:text-white/20 focus:outline-none focus:ring-2 focus:ring-blue-500/25 focus:border-blue-500/40 transition-all font-medium text-sm"
                                            placeholder="••••••••••"
                                        />
                                        <button
                                            type="button"
                                            onClick={() => setShowPassword(p => !p)}
                                            className="absolute inset-y-0 right-0 pr-4 flex items-center text-white/25 hover:text-white/60 transition-colors"
                                        >
                                            {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                                        </button>
                                    </div>
                                </div>

                                {/* Submit */}
                                <div className="pt-2">
                                    <button
                                        type="submit"
                                        disabled={loading}
                                        className="w-full relative group bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white font-black py-4 rounded-2xl shadow-xl shadow-blue-600/20 transition-all flex items-center justify-center gap-3 active:scale-[0.98] disabled:opacity-70 disabled:active:scale-100 overflow-hidden"
                                    >
                                        {/* Shine effect */}
                                        <div className="absolute inset-0 bg-white/0 group-hover:bg-white/5 transition-colors" />
                                        <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-white/30 to-transparent" />
                                        {loading ? (
                                            <Loader2 className="animate-spin relative z-10" size={20} />
                                        ) : (
                                            <>
                                                <LogIn size={18} className="relative z-10" />
                                                <span className="relative z-10 tracking-wide">Iniciar Sesión</span>
                                            </>
                                        )}
                                    </button>
                                </div>
                            </form>
                        )}

                        {/* Footer divider */}
                        <div className="mt-8 pt-6 border-t border-white/5 flex items-center justify-center gap-6">
                            <div className="flex items-center gap-2 opacity-40 hover:opacity-80 transition-opacity">
                                <Shield size={13} className="text-blue-400" />
                                <span className="text-[10px] font-bold uppercase tracking-wider text-white">Secure Auth</span>
                            </div>
                            <div className="w-px h-3 bg-white/10" />
                            <div className="flex items-center gap-2 opacity-40 hover:opacity-80 transition-opacity">
                                <Sparkles size={13} className="text-yellow-400" />
                                <span className="text-[10px] font-bold uppercase tracking-wider text-white">AI Driven</span>
                            </div>
                            <div className="w-px h-3 bg-white/10" />
                            <div className="flex items-center gap-2 opacity-40 hover:opacity-80 transition-opacity">
                                <div className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                                <span className="text-[10px] font-bold uppercase tracking-wider text-white">v2.0</span>
                            </div>
                        </div>
                    </div>
                </motion.div>
            </div>
        </div>
    );
}
