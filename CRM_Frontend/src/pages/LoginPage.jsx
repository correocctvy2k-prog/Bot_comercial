import { useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { LogIn, Mail, Lock, AlertCircle, Loader2, Sparkles, Building2 } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { toast } from 'sonner';

export default function LoginPage() {
    const [isLogin, setIsLogin] = useState(true);
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [loading, setLoading] = useState(false);
    const { login } = useAuth();
    const navigate = useNavigate();
    const location = useLocation();

    const from = location.state?.from?.pathname || "/";

    const handleLogin = async (e) => {
        e.preventDefault();
        setLoading(true);
        try {
            await login(email, password);
            toast.success('¡Bienvenido de nuevo!');
            navigate(from, { replace: true });
        } catch (error) {
            toast.error('Error al iniciar sesión', {
                description: error.message || 'Verifica tus credenciales'
            });
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="min-h-screen w-full bg-[#030711] flex items-center justify-center p-4 relative overflow-hidden">
            {/* Background Orbs */}
            <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-blue-600/10 rounded-full blur-[120px] animate-pulse"></div>
            <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-indigo-600/10 rounded-full blur-[120px] animate-pulse delay-1000"></div>

            <motion.div 
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.6 }}
                className="w-full max-w-[440px] z-10"
            >
                <div className="bg-card/40 backdrop-blur-2xl border border-white/5 rounded-3xl p-8 shadow-2xl relative overflow-hidden">
                    {/* Glassy Overlay */}
                    <div className="absolute inset-0 bg-gradient-to-br from-white/5 to-transparent pointer-events-none"></div>

                    {/* Logo Section */}
                    <div className="flex flex-col items-center mb-8">
                        <motion.div 
                            whileHover={{ rotate: 15, scale: 1.1 }}
                            className="w-16 h-16 bg-gradient-to-br from-blue-600 to-indigo-600 rounded-2xl flex items-center justify-center shadow-lg shadow-blue-500/20 mb-4 cursor-default"
                        >
                            <Building2 className="text-white" size={32} />
                        </motion.div>
                        <h1 className="text-3xl font-black tracking-tighter text-white bg-clip-text text-transparent bg-gradient-to-r from-white to-white/60">
                            SKYLAB
                        </h1>
                        <p className="text-muted-foreground text-sm font-medium tracking-wide mt-1">
                            Sistema de Gestión Comercial
                        </p>
                    </div>

                    <AnimatePresence mode="wait">
                        <motion.form 
                            key="login-form"
                            initial={{ opacity: 0, x: 20 }}
                            animate={{ opacity: 1, x: 0 }}
                            exit={{ opacity: 0, x: -20 }}
                            onSubmit={handleLogin}
                            className="space-y-5"
                        >
                            <div className="space-y-2">
                                <label className="text-xs font-bold uppercase tracking-widest text-muted-foreground ml-1">
                                    Usuario o Email
                                </label>
                                <div className="relative group">
                                    <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none text-muted-foreground group-focus-within:text-blue-500 transition-colors">
                                        <Mail size={18} />
                                    </div>
                                    <input 
                                        type="text"
                                        required
                                        value={email}
                                        onChange={(e) => setEmail(e.target.value)}
                                        className="w-full bg-black/20 border border-white/10 rounded-2xl py-3.5 pl-12 pr-4 text-white placeholder:text-white/20 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500/50 transition-all font-medium"
                                        placeholder="ej: jbeltran"
                                    />
                                </div>
                            </div>

                            <div className="space-y-2">
                                <div className="flex items-center justify-between px-1">
                                    <label className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
                                        Contraseña
                                    </label>
                                    <button 
                                        type="button"
                                        className="text-[10px] font-bold uppercase tracking-tighter text-blue-400 hover:text-blue-300 transition-colors"
                                    >
                                        ¿Olvidaste tu contraseña?
                                    </button>
                                </div>
                                <div className="relative group">
                                    <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none text-muted-foreground group-focus-within:text-blue-500 transition-colors">
                                        <Lock size={18} />
                                    </div>
                                    <input 
                                        type="password"
                                        required
                                        value={password}
                                        onChange={(e) => setPassword(e.target.value)}
                                        className="w-full bg-black/20 border border-white/10 rounded-2xl py-3.5 pl-12 pr-4 text-white placeholder:text-white/20 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500/50 transition-all"
                                        placeholder="••••••••••••"
                                    />
                                </div>
                            </div>

                            <button 
                                type="submit"
                                disabled={loading}
                                className="w-full bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white font-bold py-4 rounded-2xl shadow-xl shadow-blue-600/20 transition-all flex items-center justify-center gap-3 active:scale-[0.98] disabled:opacity-70 disabled:active:scale-100"
                            >
                                {loading ? (
                                    <Loader2 className="animate-spin" size={20} />
                                ) : (
                                    <>
                                        <LogIn size={20} />
                                        <span>Iniciar Sesión</span>
                                    </>
                                )}
                            </button>
                        </motion.form>
                    </AnimatePresence>
                </div>

                {/* Footer Info */}
                <div className="mt-8 text-center space-y-4">
                    <div className="flex items-center justify-center gap-6">
                        <div className="flex flex-col items-center opacity-40 hover:opacity-100 transition-opacity">
                            <Sparkles size={16} className="text-yellow-500 mb-1" />
                            <span className="text-[10px] font-bold uppercase tracking-tighter text-white">AI Driven</span>
                        </div>
                        <div className="h-4 w-px bg-white/10"></div>
                        <div className="flex flex-col items-center opacity-40 hover:opacity-100 transition-opacity">
                            <Lock size={16} className="text-blue-500 mb-1" />
                            <span className="text-[10px] font-bold uppercase tracking-tighter text-white">Secure Auth</span>
                        </div>
                    </div>
                </div>
            </motion.div>
        </div>
    );
}
