
import React, { useState, useEffect } from 'react';
import { Lock, User, AlertTriangle, Building2, ChevronRight } from './Icons';
import { supabase } from '../supabaseClient';
import { Usuario, Sede } from '../types';

interface LoginProps {
    onLogin: (user: Usuario) => void;
    version?: string;
}

const LOGO_URL = 'https://iili.io/fsmAapV.png';

const Login: React.FC<LoginProps> = ({ onLogin, version = '1.0.1' }) => {
    const [username, setUsername] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState<string | null>(null);
    const [isLoading, setIsLoading] = useState(false);
    
    // Branch selection state
    const [sedes, setSedes] = useState<Sede[]>([]);
    const [selectedUser, setSelectedUser] = useState<any>(null);
    const [showBranchSelection, setShowBranchSelection] = useState(false);

    useEffect(() => {
        const fetchSedes = async () => {
            const { data, error } = await supabase.from('sedes').select('*');
            if (!error && data) {
                setSedes(data);
            }
        };
        fetchSedes();
    }, []);

    const handleLogin = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsLoading(true);
        setError(null);

        try {
            const { data, error: dbError } = await supabase
                .from('usuarios')
                .select('*, sedes(nombre, color_primario)')
                .eq('username', username)
                .eq('password', password)
                .single();

            if (dbError || !data) {
                throw new Error('Credenciales inválidas');
            }

            const user = data as any;
            const sedeNombre = user.sedes?.nombre;
            const sedeColor = user.sedes?.color_primario;
            const userData: Usuario = {
                ...user,
                sede_nombre: sedeNombre,
                sede_color: sedeColor
            };

            if (user.rol === 'ADMIN') {
                setSelectedUser(userData);
                setShowBranchSelection(true);
            } else {
                if (!user.sede_id) {
                    throw new Error('El usuario no tiene una sede asignada. Contacte al administrador.');
                }
                onLogin(userData);
            }
        } catch (err: any) {
            setError(err.message);
        } finally {
            setIsLoading(false);
        }
    };

    const handleBranchSelect = (sede: Sede) => {
        if (selectedUser) {
            onLogin({
                ...selectedUser,
                sede_id: sede.id,
                sede_nombre: sede.nombre,
                sede_color: sede.color_primario
            });
        }
    };

    if (showBranchSelection) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-[#0f172a] p-4 font-sans">
                <div className="w-full max-w-md bg-white dark:bg-[#1e293b] rounded-[3rem] shadow-2xl p-8 md:p-12 border border-slate-100 dark:border-slate-800 animate-fade-in">
                    <div className="text-center mb-10">
                        <div className="bg-[#009ED6]/10 p-3 rounded-3xl inline-block mb-6">
                            <Building2 className="w-12 h-12 text-[#009ED6]" />
                        </div>
                        <h1 className="text-2xl font-black text-slate-800 dark:text-white tracking-tighter uppercase italic">
                            Seleccionar <span className="text-[#009ED6] not-italic font-medium">Sede</span>
                        </h1>
                        <p className="text-slate-400 text-xs font-bold uppercase tracking-widest mt-2 px-4">
                            Como administrador, elija la sede a la que desea ingresar
                        </p>
                    </div>

                    <div className="space-y-4">
                        {sedes.length > 0 ? (
                            sedes.map(sede => (
                                <button
                                    key={sede.id}
                                    onClick={() => handleBranchSelect(sede)}
                                    className="w-full group flex items-center justify-between bg-slate-50 dark:bg-slate-800/50 hover:bg-[#009ED6] dark:hover:bg-[#009ED6] p-6 rounded-2xl border-2 border-transparent transition-all hover:scale-[1.02] active:scale-95"
                                >
                                    <div className="flex items-center gap-4">
                                        <div className="w-10 h-10 rounded-xl bg-white dark:bg-slate-900 flex items-center justify-center text-[#009ED6] group-hover:text-white transition-colors shadow-sm">
                                            <Building2 className="w-5 h-5" />
                                        </div>
                                        <div className="text-left">
                                            <p className="text-sm font-black text-slate-800 dark:text-white group-hover:text-white transition-colors uppercase tracking-tight">
                                                {sede.nombre}
                                            </p>
                                            <p className="text-[10px] font-bold text-slate-400 dark:text-slate-500 group-hover:text-blue-100 transition-colors uppercase">
                                                {sede.codigo || 'Central'}
                                            </p>
                                        </div>
                                    </div>
                                    <ChevronRight className="w-5 h-5 text-slate-300 group-hover:text-white transition-colors" />
                                </button>
                            ))
                        ) : (
                            <div className="text-center py-8">
                                <p className="text-sm font-bold text-slate-400 uppercase italic">No hay sedes configuradas</p>
                            </div>
                        )}
                        
                        <button 
                            onClick={() => setShowBranchSelection(false)}
                            className="w-full mt-4 text-[10px] font-black text-slate-400 hover:text-slate-600 uppercase tracking-widest transition-colors"
                        >
                            Volver al inicio de sesión
                        </button>
                    </div>

                    <div className="mt-10 text-center">
                        <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest"> Created by Jhon Obregon v{version}</p>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-[#0f172a] p-4">
            <div className="w-full max-w-md bg-white dark:bg-[#1e293b] rounded-[3rem] shadow-2xl p-8 md:p-12 border border-slate-100 dark:border-slate-800 animate-fade-in">
                <div className="text-center mb-10">
                    <div className="bg-white p-3 rounded-3xl inline-block shadow-xl mb-6 border border-slate-100">
                        <img src={LOGO_URL} className="w-16 h-16 object-contain" alt="Logo" />
                    </div>
                    <h1 className="text-3xl font-black text-slate-800 dark:text-white tracking-tighter uppercase italic">
                        Ico Logistic <span className="text-[#009ED6] not-italic font-medium">Pro</span>
                    </h1>
                    <p className="text-slate-400 text-xs font-bold uppercase tracking-widest mt-2">Gestión Inteligente</p>
                </div>

                <form onSubmit={handleLogin} className="space-y-6">
                    <div className="space-y-2">
                        <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-4">Nombre de Usuario</label>
                        <div className="relative group">
                            <div className="absolute left-5 inset-y-0 flex items-center text-slate-400 group-focus-within:text-[#009ED6] transition-colors">
                                <User className="w-5 h-5" />
                            </div>
                            <input 
                                type="text" 
                                required
                                className="w-full bg-slate-50 dark:bg-slate-800/50 dark:text-white pl-14 pr-6 py-5 rounded-2xl border-2 border-transparent focus:border-[#009ED6] focus:bg-white dark:focus:bg-slate-800 outline-none transition-all font-bold"
                                placeholder="Escribe tu usuario"
                                value={username}
                                onChange={(e) => setUsername(e.target.value)}
                            />
                        </div>
                    </div>

                    <div className="space-y-2">
                        <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-4">Contraseña</label>
                        <div className="relative group">
                            <div className="absolute left-5 inset-y-0 flex items-center text-slate-400 group-focus-within:text-[#009ED6] transition-colors">
                                <Lock className="w-5 h-5" />
                            </div>
                            <input 
                                type="password" 
                                required
                                className="w-full bg-slate-50 dark:bg-slate-800/50 dark:text-white pl-14 pr-6 py-5 rounded-2xl border-2 border-transparent focus:border-[#009ED6] focus:bg-white dark:focus:bg-slate-800 outline-none transition-all font-bold"
                                placeholder="••••••••"
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                            />
                        </div>
                    </div>

                    {error && (
                        <div className="bg-red-50 dark:bg-red-900/20 border border-red-100 dark:border-red-800 p-4 rounded-2xl flex items-center gap-3 text-red-600 dark:text-red-400 text-xs font-bold animate-shake">
                            <AlertTriangle className="w-5 h-5 shrink-0" />
                            <span>{error}</span>
                        </div>
                    )}

                    <button 
                        type="submit" 
                        disabled={isLoading}
                        className="w-full bg-[#009ED6] text-white py-5 rounded-2xl font-black uppercase tracking-widest shadow-xl shadow-blue-200 dark:shadow-none hover:scale-[1.02] active:scale-95 transition-all disabled:opacity-50 disabled:grayscale"
                    >
                        {isLoading ? 'Iniciando Sesión...' : 'Entrar al Sistema'}
                    </button>
                </form>

                <div className="mt-10 text-center">
                    <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest"> Created by Jhon Obregon v{version}</p>
                </div>
            </div>
        </div>
    );
};

export default Login;
