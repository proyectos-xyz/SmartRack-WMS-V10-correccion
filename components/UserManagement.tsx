import React, { useState, useEffect } from 'react';
import { Plus, Trash, RefreshCw, Building2, Lock } from './Icons';
import { supabase } from '../supabaseClient';
import { Usuario, ViewState, Sede } from '../types';
import { 
  ChevronDown, 
  ChevronUp, 
  Shield, 
  Users
} from 'lucide-react';

interface UserManagementProps {
    currentUser: Usuario | null;
    onUpdateCurrentUser?: (user: Usuario) => void;
}

const UserManagement: React.FC<UserManagementProps> = ({ currentUser, onUpdateCurrentUser }) => {
    const [usuarios, setUsuarios] = useState<Usuario[]>([]);
    const [sedes, setSedes] = useState<Sede[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    
    // Accordion expand/collapse state per user
    const [expandedUsers, setExpandedUsers] = useState<Record<string, boolean>>({});

    // New User State
    const [showAddModal, setShowAddModal] = useState(false);
    const [newUserName, setNewUserName] = useState('');
    const [newUserUsername, setNewUserUsername] = useState('');
    const [newUserPassword, setNewUserPassword] = useState('');
    const [newUserRole, setNewUserRole] = useState<'ADMIN' | 'ASISTENTE' | 'OPERADOR' | 'ALERTAS'>('ASISTENTE');
    const [newUserSedeId, setNewUserSedeId] = useState<string>('');

    // Change Password State
    const [showChangePasswordModal, setShowChangePasswordModal] = useState(false);
    const [selectedUserIdForPassword, setSelectedUserIdForPassword] = useState<string | null>(null);
    const [newPasswordValue, setNewPasswordValue] = useState('');

    const fetchData = async () => {
        setIsLoading(true);
        try {
            // Fetch Users - Filter by branch if the current user has one assigned
            let query = supabase
                .from('usuarios')
                .select('*, sedes(nombre)');
            
            if (currentUser?.sede_id) {
                query = query.eq('sede_id', currentUser.sede_id);
            }

            const { data: userData, error: userError } = await query
                .order('nombre', { ascending: true });
            
            if (userError) throw userError;
            
            // Map users to include sede_nombre and normalize role from database
            const mappedUsers = (userData || []).map((u: any) => {
                let rol = u.rol;
                if (u.rol === 'ASISTENTE' && u.permisos?.es_campana_alertas) {
                    rol = 'ALERTAS';
                }
                return {
                    ...u,
                    rol,
                    sede_nombre: u.sedes?.nombre
                };
            });
            // @ts-ignore
            setUsuarios(mappedUsers);

            // Fetch Sedes - Filter by branch if the current user has one assigned
            let sedesQuery = supabase
                .from('sedes')
                .select('*');

            if (currentUser?.sede_id) {
                sedesQuery = sedesQuery.eq('id', currentUser.sede_id);
            }

            const { data: sedesData, error: sedesError } = await sedesQuery
                .order('nombre', { ascending: true });
            
            if (sedesError) throw sedesError;
            setSedes(sedesData || []);
        } catch (err: any) {
            alert('Error al cargar datos: ' + err.message);
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => {
        fetchData();
        if (currentUser?.sede_id) {
            setNewUserSedeId(currentUser.sede_id);
        }
    }, [currentUser]);

    const toggleUserExpanded = (userId: string) => {
        setExpandedUsers(prev => ({
            ...prev,
            [userId]: !prev[userId]
        }));
    };

    const handleAddUser = (e: React.FormEvent) => {
        e.preventDefault();
        
        const userData = {
            nombre: newUserName,
            username: newUserUsername,
            password: newUserPassword,
            rol: newUserRole,
            sede_id: newUserSedeId || null
        };

        const defaultPermisos: Record<string, boolean> = {};
        Object.values(ViewState).forEach(v => {
            defaultPermisos[v] = newUserRole === 'ADMIN';
        });
        defaultPermisos['alerta_sonora'] = true; // Enabled by default for new users
        if (newUserRole === 'ALERTAS') {
            defaultPermisos['es_campana_alertas'] = true;
        }

        // Reset form immediately
        setShowAddModal(false);
        setNewUserName('');
        setNewUserUsername('');
        setNewUserPassword('');
        setNewUserSedeId(currentUser?.sede_id || '');

        const dbRole = userData.rol === 'ALERTAS' ? 'ASISTENTE' : userData.rol;

        // Background DB call
        (async () => {
            try {
                const { error } = await supabase
                    .from('usuarios')
                    .insert([{
                        nombre: userData.nombre,
                        username: userData.username,
                        password: userData.password,
                        rol: dbRole,
                        sede_id: userData.sede_id,
                        permisos: defaultPermisos,
                        alerta_sonora: true
                    }]);

                if (error) throw error;
                fetchData();
            } catch (err: any) {
                console.error("Error adding user in background:", err);
            }
        })();
    };

    const handleUpdatePasswordSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!selectedUserIdForPassword || !newPasswordValue.trim()) return;

        try {
            const { error } = await supabase
                .from('usuarios')
                .update({ password: newPasswordValue.trim() })
                .eq('id', selectedUserIdForPassword);

            if (error) throw error;
            
            alert('Contraseña actualizada correctamente en base de datos.');
            setShowChangePasswordModal(false);
            setSelectedUserIdForPassword(null);
            setNewPasswordValue('');
            fetchData();
        } catch (err: any) {
            console.error("Error updating password:", err);
            alert("Error al actualizar la contraseña: " + err.message);
        }
    };

    const handleUpdateSede = async (userId: string, sedeId: string) => {
        const sede = sedes.find(s => s.id === sedeId);
        // Update local state immediately
        // @ts-ignore
        setUsuarios(prev => prev.map(u => u.id === userId ? { ...u, sede_id: sedeId, sede_nombre: sede?.nombre } : u));

        if (onUpdateCurrentUser && userId === currentUser?.id) {
            const user = usuarios.find(u => u.id === userId);
            if (user) {
                onUpdateCurrentUser({ ...user, sede_id: sedeId, sede_nombre: sede?.nombre });
            }
        }

        // Background DB call
        try {
            const { error } = await supabase
                .from('usuarios')
                .update({ sede_id: sedeId || null })
                .eq('id', userId);

            if (error) throw error;
        } catch (err: any) {
            console.error("Error updating sede in background:", err);
            fetchData();
        }
    };

    const handleUpdateRole = async (userId: string, newRole: 'ADMIN' | 'ASISTENTE' | 'OPERADOR' | 'ALERTAS') => {
        const user = usuarios.find(u => u.id === userId);
        const updatedPermisos = { ...(user?.permisos || {}) };
        let dbRole = newRole;
        if (newRole === 'ALERTAS') {
            dbRole = 'ASISTENTE';
            updatedPermisos.es_campana_alertas = true;
        } else {
            delete updatedPermisos.es_campana_alertas;
        }

        // Update local state immediately
        // @ts-ignore
        setUsuarios(prev => prev.map(u => u.id === userId ? { ...u, rol: newRole, permisos: updatedPermisos } : u));

        if (onUpdateCurrentUser && userId === currentUser?.id && user) {
            onUpdateCurrentUser({ ...user, rol: newRole, permisos: updatedPermisos } as any);
        }

        // Background DB call
        try {
            const { error } = await supabase
                .from('usuarios')
                .update({ rol: dbRole, permisos: updatedPermisos })
                .eq('id', userId);

            if (error) throw error;
        } catch (err: any) {
            console.error("Error updating role in background:", err);
            alert("Error al actualizar el rol: " + err.message);
            fetchData(); // Re-fetch to sync state
        }
    };

    const togglePermission = (userId: string, view: string, current: boolean) => {
        const user = usuarios.find(u => u.id === userId);
        if (!user) return;

        const updatedPermisos = { ...user.permisos, [view]: !current };
        
        // Update local state immediately
        // @ts-ignore
        setUsuarios(prev => prev.map(u => u.id === userId ? { ...u, permisos: updatedPermisos } : u));

        if (onUpdateCurrentUser && userId === currentUser?.id) {
            onUpdateCurrentUser({ ...user, permisos: updatedPermisos });
        }

        // Background DB call
        (async () => {
            try {
                const { error } = await supabase
                    .from('usuarios')
                    .update({ permisos: updatedPermisos })
                    .eq('id', userId);

                if (error) throw error;
            } catch (err: any) {
                console.error("Error updating permissions in background:", err);
            }
        })();
    };

    const toggleAlertaSonora = (userId: string, currentActive: boolean) => {
        const nextVal = !currentActive;
        const user = usuarios.find(u => u.id === userId);
        if (!user) return;

        const updatedPermisos = { ...(user.permisos || {}), alerta_sonora: nextVal };

        // Update local state immediately
        // @ts-ignore
        setUsuarios(prev => prev.map(u => u.id === userId ? { 
            ...u, 
            alerta_sonora: nextVal, 
            permisos: updatedPermisos 
        } : u));

        if (onUpdateCurrentUser && userId === currentUser?.id) {
            onUpdateCurrentUser({ ...user, alerta_sonora: nextVal, permisos: updatedPermisos });
        }

        // Background DB call
        (async () => {
            try {
                const { error } = await supabase
                    .from('usuarios')
                    .update({ 
                        alerta_sonora: nextVal,
                        permisos: updatedPermisos
                    })
                    .eq('id', userId);

                if (error) throw error;
            } catch (err: any) {
                console.error("Error updating alerta_sonora in background:", err);
            }
        })();
    };

    const handleToggleCategoryAll = (userId: string, categoryKeys: string[], targetState: boolean) => {
        const user = usuarios.find(u => u.id === userId);
        if (!user) return;
        
        const updatedPermisos = { ...user.permisos };
        categoryKeys.forEach(key => {
            updatedPermisos[key] = targetState;
        });
        
        // Update local state immediately
        // @ts-ignore
        setUsuarios(prev => prev.map(u => u.id === userId ? { ...u, permisos: updatedPermisos } : u));
        
        if (onUpdateCurrentUser && userId === currentUser?.id) {
            onUpdateCurrentUser({ ...user, permisos: updatedPermisos });
        }

        // Background DB call
        (async () => {
            try {
                const { error } = await supabase
                    .from('usuarios')
                    .update({ permisos: updatedPermisos })
                    .eq('id', userId);
                if (error) throw error;
            } catch (err: any) {
                console.error("Error updating category permissions in background:", err);
            }
        })();
    };

    const handleDeleteUser = (id: string) => {
        if (!confirm('¿Estas seguro que desea eliminar? esta accion no se puede revertir.')) return;
        
        // Update local state immediately
        // @ts-ignore
        setUsuarios(prev => prev.filter(u => u.id !== id));

        // Background DB call
        (async () => {
            try {
                const { error } = await supabase
                    .from('usuarios')
                    .delete()
                    .eq('id', id);

                if (error) throw error;
            } catch (err: any) {
                console.error("Error deleting user in background:", err);
            }
        })();
    };

    // Organized list mirroring exactly the categories and views in the App.tsx sidebar!
    const permissionGroups = [
        {
            title: 'Operaciones',
            accentBg: 'bg-sky-50 dark:bg-sky-950/20 text-[#009ED6] dark:text-sky-400 border-sky-100 dark:border-sky-900/30',
            items: [
                { key: ViewState.RECEPTION_XML, label: 'LAIVE (XML)' },
                { key: ViewState.RECEPTION, label: 'Recepción (Ingresos LPN)' },
                { key: ViewState.RECEPTION_LAIVE, label: 'Recepción Laive' },
                { key: ViewState.RECEPTION_VALIDATE, label: 'Validar Ingreso' },
                { key: ViewState.DISPATCH_PROVINCE, label: 'Despachos' },
                { key: ViewState.REVERSE_LOGISTICS, label: 'Logíst. Inversa' },
                { key: ViewState.CORTES, label: 'Cortes' }
            ]
        },
        {
            title: 'Picking',
            accentBg: 'bg-sky-50 dark:bg-sky-950/20 text-[#009ED6] dark:text-sky-400 border-sky-100 dark:border-sky-900/30',
            items: [
                { key: ViewState.PICKING, label: 'Picking / Piking' },
                { key: ViewState.VALIDADOR, label: 'Validador' },
                { key: ViewState.PICKING_CONTROL, label: 'Control Picking' }
            ]
        },
        {
            title: 'Control e Inventario',
            accentBg: 'bg-lime-50 dark:bg-lime-950/20 text-[#82BD02] dark:text-lime-400 border-lime-100 dark:border-lime-900/30',
            items: [
                { key: ViewState.INVENTORY, label: 'Inventario' },
                { key: ViewState.LAYOUT, label: 'Mapa Almacén' },
                { key: ViewState.CONCILIATION, label: 'Conciliación' },
                { key: ViewState.COUNT_HISTORY, label: 'Historial Conteos' },
                { key: ViewState.MERMAS, label: 'Mermas' },
                { key: ViewState.SAMPLES, label: 'Muestras' },
                { key: ViewState.ROTULADO, label: 'Rotulado' },
                { key: ViewState.REPORTE_TVU, label: 'Reporte TVU' },
                { key: ViewState.IMP_UBICACIONES, label: 'IMP Ubicaciones' }
            ]
        },
        {
            title: 'Monitoreo y Métricas',
            accentBg: 'bg-amber-50 dark:bg-amber-950/20 text-amber-500 border-amber-100 dark:border-amber-900/30',
            items: [
                { key: ViewState.MONITOR, label: 'Monitor' },
                { key: ViewState.METRICS, label: 'Métricas' },
                { key: ViewState.DIFFERENCE_HISTORY, label: 'Histórico Dif.' }
            ]
        },
        {
            title: 'Administración',
            accentBg: 'bg-indigo-50 dark:bg-indigo-950/20 text-indigo-500 border-indigo-100 dark:border-indigo-900/30',
            items: [
                { key: ViewState.ARTICLE_MASTER, label: 'Base Artículos' },
                { key: ViewState.CAPTURA_EAN, label: 'Captura EAN' },
                { key: ViewState.MAINTENANCE, label: 'Mantenimiento' },
                { key: ViewState.BULK_IMPORT, label: 'Carga Masiva' },
                { key: ViewState.USER_MANAGEMENT, label: 'Gestión Usuarios' },
                { key: ViewState.BRANCH_MANAGEMENT, label: 'Gestión Sedes' },
                { key: ViewState.CONFIGURATION, label: 'Configuración' },
                { key: ViewState.ORCHESTRATOR, label: 'Orquestador' }
            ]
        }
    ];

    return (
        <div className="flex flex-col h-full bg-slate-50 dark:bg-[#0f172a] p-3 sm:p-6 md:p-8 animate-fade-in overflow-y-auto custom-scrollbar">
            <div className="max-w-6xl mx-auto w-full space-y-6">
                {/* Header Section */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white dark:bg-[#1e293b] p-5 sm:p-6 rounded-3xl border border-slate-100 dark:border-slate-800 shadow-sm">
                    <div className="flex items-center gap-3">
                        <div className="p-3 bg-[#009ED6]/10 text-[#009ED6] rounded-2xl">
                            <Users className="w-8 h-8" />
                        </div>
                        <div>
                            <h1 className="text-xl sm:text-2xl font-black text-slate-800 dark:text-white uppercase tracking-tight">
                                GESTIÓN DE <span className="text-[#009ED6]">USUARIOS</span>
                            </h1>
                            <p className="text-slate-400 text-[10px] font-bold uppercase tracking-wider">Control de accesos y permisos del sistema</p>
                        </div>
                    </div>
                    <button 
                        onClick={() => setShowAddModal(true)}
                        className="bg-[#82BD02] hover:bg-[#72a602] text-white px-5 py-3 rounded-2xl text-xs font-black uppercase tracking-widest shadow-lg shadow-green-100 dark:shadow-none hover:scale-[1.02] active:scale-95 transition-all flex items-center justify-center gap-2"
                    >
                        <Plus className="w-4 h-4" />
                        Nuevo Usuario
                    </button>
                </div>

                {isLoading ? (
                    <div className="flex flex-col items-center justify-center py-20 gap-4">
                        <RefreshCw className="w-8 h-8 text-[#009ED6] animate-spin" />
                        <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Cargando usuarios...</p>
                    </div>
                ) : (
                    <div className="space-y-4">
                        {usuarios.map(user => {
                            // Calculate assigned permissions count (excluding Alerta Sonora)
                            let assignedCount = 0;
                            let totalCount = 0;
                            permissionGroups.forEach(g => {
                                g.items.forEach(it => {
                                    totalCount++;
                                    if (user.permisos?.[it.key]) {
                                        assignedCount++;
                                    }
                                });
                            });

                            const isExpanded = !!expandedUsers[user.id];

                            return (
                                <div key={user.id} className="bg-white dark:bg-[#1e293b] rounded-3xl border border-slate-100 dark:border-slate-800 shadow-sm transition-all overflow-hidden">
                                    {/* COMPACT MAIN ROW info card, extremely optimized for mobile and desktop */}
                                    <div className="p-4 sm:p-5 flex flex-col md:flex-row md:items-center justify-between gap-4">
                                        <div className="flex items-center gap-4 flex-1">
                                            <div className="w-12 h-12 rounded-2xl bg-slate-50 dark:bg-slate-800 flex items-center justify-center text-[#009ED6] shrink-0 border border-slate-100 dark:border-slate-700">
                                                <Building2 className="w-6 h-6" />
                                            </div>
                                            <div className="min-w-0 flex-1">
                                                <div className="flex flex-wrap items-center gap-2">
                                                    <h3 className="text-base font-black text-slate-800 dark:text-white uppercase tracking-tight truncate">{user.nombre}</h3>
                                                    <span className="text-[10px] text-slate-400 font-bold">@{user.username}</span>
                                                </div>
                                                
                                                {/* Role & Sede selection form or view */}
                                                <div className="flex flex-wrap gap-2 mt-2 items-center">
                                                    {currentUser?.rol === 'ADMIN' ? (
                                                        <>
                                                            <select 
                                                                value={user.rol}
                                                                onChange={(e) => handleUpdateRole(user.id, e.target.value as 'ADMIN' | 'ASISTENTE' | 'OPERADOR' | 'ALERTAS')}
                                                                className={`px-3 py-1 rounded-full text-[9px] font-black uppercase tracking-widest outline-none cursor-pointer border-none transition-colors ${
                                                                    user.rol === 'ADMIN' ? 'bg-indigo-50 dark:bg-indigo-950/40 text-indigo-600 dark:text-indigo-400' : 
                                                                    user.rol === 'ALERTAS' ? 'bg-[#72B964]/10 text-[#72B964]' :
                                                                    user.rol === 'OPERADOR' ? 'bg-amber-50 dark:bg-amber-950/40 text-amber-600 dark:text-amber-400' : 
                                                                    'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300'
                                                                }`}
                                                            >
                                                                <option value="ADMIN">ADMIN</option>
                                                                <option value="ASISTENTE">ASISTENTE</option>
                                                                <option value="OPERADOR">OPERADOR</option>
                                                                <option value="ALERTAS">ALERTAS</option>
                                                            </select>

                                                            <select 
                                                                value={user.sede_id || ''}
                                                                onChange={(e) => handleUpdateSede(user.id, e.target.value)}
                                                                className="px-3 py-1 rounded-full text-[9px] font-black uppercase tracking-widest outline-none cursor-pointer border-none bg-blue-50 dark:bg-blue-950/40 text-[#009ED6]"
                                                            >
                                                                <option value="">SIN SEDE</option>
                                                                {sedes.map(s => (
                                                                    <option key={s.id} value={s.id}>{s.nombre}</option>
                                                                ))}
                                                            </select>
                                                        </>
                                                    ) : (
                                                        <>
                                                            <span className={`px-2.5 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wider ${
                                                                user.rol === 'ADMIN' ? 'bg-indigo-50 dark:bg-indigo-950/40 text-indigo-600 dark:text-indigo-400' : 
                                                                user.rol === 'OPERADOR' ? 'bg-amber-50 dark:bg-amber-950/40 text-amber-600 dark:text-amber-400' : 
                                                                'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300'
                                                            }`}>
                                                                {user.rol}
                                                            </span>
                                                            {user.sede_nombre && (
                                                                <span className="px-2.5 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wider bg-blue-50 dark:bg-blue-950/40 text-[#009ED6]">
                                                                    {user.sede_nombre}
                                                                </span>
                                                            )}
                                                        </>
                                                    )}

                                                    {/* Quick permissions tag counter */}
                                                    <span className="px-2.5 py-0.5 rounded-full text-[9px] font-black uppercase bg-slate-50 dark:bg-slate-800 text-slate-500 tracking-wider">
                                                        Permisos: {assignedCount} / {totalCount}
                                                    </span>
                                                </div>
                                            </div>
                                        </div>

                                        {/* QUICK CONTROLS: sound alert, toggles, edit password & expand button */}
                                        <div className="flex flex-wrap items-center gap-3 justify-end">
                                            {/* Sound toggle if Assistant, Admin, or Alertas */}
                                            {(user.rol === 'ADMIN' || user.rol === 'ASISTENTE' || user.rol === 'ALERTAS') && (() => {
                                                const isAlertaSonoraActive = user.alerta_sonora !== undefined && user.alerta_sonora !== null
                                                    ? user.alerta_sonora
                                                    : (user.permisos?.['alerta_sonora'] !== false);
                                                return (
                                                    <div className="flex items-center gap-2 bg-slate-50 dark:bg-slate-800 px-3 py-1.5 rounded-2xl border border-slate-100 dark:border-slate-700">
                                                        <span className="text-[9px] font-black uppercase text-slate-400 dark:text-slate-400 tracking-wider">🔔 Sonido:</span>
                                                        <button 
                                                            onClick={() => toggleAlertaSonora(user.id, isAlertaSonoraActive)}
                                                            className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                                                                isAlertaSonoraActive ? 'bg-amber-500' : 'bg-slate-200 dark:bg-slate-700'
                                                            }`}
                                                            title="Activar/Desactivar sonido para Alertas"
                                                        >
                                                            <span className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow transition duration-200 ease-in-out ${
                                                                isAlertaSonoraActive ? 'translate-x-4' : 'translate-x-0'
                                                            }`} />
                                                        </button>
                                                    </div>
                                                );
                                            })()}

                                            {/* Password change */}
                                            <button 
                                                onClick={() => {
                                                    setSelectedUserIdForPassword(user.id);
                                                    setNewPasswordValue(user.password || '');
                                                    setShowChangePasswordModal(true);
                                                }}
                                                className="p-2 sm:p-2.5 bg-amber-50 dark:bg-amber-950/40 text-amber-600 rounded-xl hover:bg-amber-500 hover:text-white transition-all active:scale-95 flex items-center justify-center border border-amber-100/50 dark:border-transparent cursor-pointer"
                                                title="Cambiar Contraseña"
                                            >
                                                <Lock className="w-4.5 h-4.5" />
                                            </button>

                                            {/* Delete user */}
                                            <button 
                                                onClick={() => handleDeleteUser(user.id)}
                                                className="p-2 sm:p-2.5 bg-rose-50 dark:bg-rose-950/40 text-rose-600 rounded-xl hover:bg-rose-500 hover:text-white transition-all active:scale-95 flex items-center justify-center border border-rose-100/50 dark:border-transparent cursor-pointer"
                                                title="Eliminar usuario"
                                            >
                                                <Trash className="w-4.5 h-4.5" />
                                            </button>

                                            {/* Toggle Expand Section */}
                                            <button
                                                onClick={() => toggleUserExpanded(user.id)}
                                                className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-[10px] font-black tracking-wider uppercase transition-all duration-200 border cursor-pointer ${
                                                    isExpanded 
                                                        ? 'bg-[#009ED6]/15 hover:bg-[#009ED6]/20 text-[#009ED6] border-[#009ED6]/20' 
                                                        : 'bg-slate-50 dark:bg-slate-800 hover:bg-slate-100 text-slate-500 dark:text-slate-400 border-slate-200/60 dark:border-slate-700/60'
                                                }`}
                                            >
                                                {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                                                PERMISOS
                                            </button>
                                        </div>
                                    </div>

                                    {/* COLLAPSED / EXPANDED PERMISSIONS BLOCK WITH CATEGORIES & ALL MOD MENU TOGGLES */}
                                    {isExpanded && (
                                        <div className="border-t border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-[#1a2333]/30 p-4 sm:p-6 space-y-6 animate-fade-in">
                                            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2 border-b border-dashed border-slate-200 dark:border-slate-700/80 pb-4">
                                                <h4 className="text-xs font-black uppercase text-slate-500 tracking-wider flex items-center gap-2">
                                                    <Shield className="w-4 h-4 text-[#009ED6]" />
                                                    Panel Completo de Accesos y Menús
                                                </h4>
                                                
                                                <div className="flex gap-2">
                                                    <button 
                                                        onClick={() => {
                                                            const allKeys = permissionGroups.flatMap(g => g.items.map(it => it.key));
                                                            handleToggleCategoryAll(user.id, allKeys, true);
                                                        }}
                                                        className="px-2.5 py-1 text-[9px] font-black bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400 uppercase rounded-lg border border-emerald-100 dark:border-transparent hover:bg-emerald-100"
                                                    >
                                                        Activar Todo
                                                    </button>
                                                    <button 
                                                        onClick={() => {
                                                            const allKeys = permissionGroups.flatMap(g => g.items.map(it => it.key));
                                                            handleToggleCategoryAll(user.id, allKeys, false);
                                                        }}
                                                        className="px-2.5 py-1 text-[9px] font-black bg-slate-100 dark:bg-slate-800 text-slate-505 dark:text-slate-400 uppercase rounded-lg border border-slate-200/50 dark:border-transparent hover:bg-slate-200"
                                                    >
                                                        Desactivar Todo
                                                    </button>
                                                </div>
                                            </div>

                                            {/* Categories Grid (2 cols on md, 1 col on mobile) */}
                                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                                {permissionGroups.map(group => {
                                                    // Count active in this category
                                                    const categoryKeys = group.items.map(it => it.key);
                                                    const activeInCategory = categoryKeys.filter(k => !!user.permisos?.[k]).length;
                                                    const totalInCategory = categoryKeys.length;
                                                    const isAllCheckedOfCategory = activeInCategory === totalInCategory;

                                                    return (
                                                        <div key={group.title} className="bg-white dark:bg-[#1e293b]/70 rounded-2xl border border-slate-100 dark:border-slate-800 p-4 space-y-4 shadow-sm">
                                                            {/* Group Title with status indicator and easy quick config button */}
                                                            <div className="flex justify-between items-center bg-slate-50 dark:bg-slate-800 px-3 py-2 rounded-xl">
                                                                <div className="flex items-center gap-2">
                                                                    <span className={`block w-2.5 h-2.5 rounded-full ${activeInCategory > 0 ? 'bg-[#82BD02]' : 'bg-slate-300 dark:bg-slate-600'}`} />
                                                                    <div>
                                                                        <span className="text-[10px] font-black text-slate-700 dark:text-slate-300 uppercase tracking-wider">{group.title}</span>
                                                                        <span className="text-[9px] text-slate-400 ml-1.5 font-bold">({activeInCategory}/{totalInCategory})</span>
                                                                    </div>
                                                                </div>

                                                                {/* Quick category triggers */}
                                                                <div className="flex gap-1.5">
                                                                    <button 
                                                                        onClick={() => handleToggleCategoryAll(user.id, categoryKeys, !isAllCheckedOfCategory)}
                                                                        className={`px-2 py-0.5 text-[8px] font-black uppercase rounded tracking-tight transition-all ${
                                                                            isAllCheckedOfCategory 
                                                                                ? 'bg-rose-50 text-rose-500 hover:bg-rose-100' 
                                                                                : 'bg-emerald-50 text-emerald-600 hover:bg-emerald-100'
                                                                        }`}
                                                                    >
                                                                        {isAllCheckedOfCategory ? 'Quitar Todo' : 'Colocar Todo'}
                                                                    </button>
                                                                </div>
                                                            </div>

                                                            {/* Compact list of switches inside category */}
                                                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                                                                {group.items.map(mod => {
                                                                    const isChecked = !!user.permisos?.[mod.key];
                                                                    return (
                                                                        <button 
                                                                            key={mod.key} 
                                                                            type="button"
                                                                            onClick={() => togglePermission(user.id, mod.key, isChecked)}
                                                                            className={`flex items-center justify-between p-3 rounded-2xl border text-left transition-all duration-155 active:scale-[0.98] cursor-pointer ${
                                                                                isChecked 
                                                                                    ? 'bg-slate-50 dark:bg-slate-800 border-[#82BD02]/30 text-slate-800 dark:text-white font-semibold' 
                                                                                    : 'bg-white dark:bg-slate-900/40 border-slate-100 dark:border-slate-800 text-slate-400 dark:text-slate-500 hover:border-slate-200'
                                                                            }`}
                                                                        >
                                                                            <span className="text-[10px] font-bold uppercase truncate pr-2 max-w-[80%] leading-tight text-slate-700 dark:text-slate-300">
                                                                                {mod.label}
                                                                            </span>
                                                                            
                                                                            {/* Accurate high-contrast sliding switch */}
                                                                            <div className={`relative inline-flex h-5 w-9 shrink-0 rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out ${
                                                                                isChecked ? 'bg-[#82BD02]' : 'bg-slate-200 dark:bg-slate-700'
                                                                            }`}>
                                                                                <span className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow transition duration-200 ease-in-out ${
                                                                                    isChecked ? 'translate-x-4' : 'translate-x-0'
                                                                                }`} />
                                                                            </div>
                                                                        </button>
                                                                    );
                                                                })}
                                                            </div>
                                                        </div>
                                                    );
                                                })}
                                            </div>
                                        </div>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>

            {/* Add User Modal */}
            {showAddModal && (
                <div className="fixed inset-0 z-[100] bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 animate-fade-in">
                    <div className="bg-white dark:bg-[#1e293b] w-full max-w-md rounded-[3rem] shadow-2xl p-6 sm:p-8 space-y-6 border border-white/20">
                        <div className="text-center">
                            <div className="bg-[#82BD02]/10 text-[#82BD02] w-14 h-14 rounded-2xl flex items-center justify-center mx-auto mb-3">
                                <Plus className="w-6 h-6" />
                            </div>
                            <h2 className="text-xl font-black text-slate-800 dark:text-white uppercase tracking-tight">Nuevo Usuario</h2>
                            <p className="text-slate-400 text-[10px] uppercase font-bold mt-1">Registra un nuevo integrante para el equipo</p>
                        </div>

                        <form onSubmit={handleAddUser} className="space-y-4">
                            <div className="space-y-1">
                                <label className="text-[9px] font-black text-slate-400 uppercase tracking-wider ml-2">Nombre Completo</label>
                                <input 
                                    required
                                    placeholder="Ej: Jhon Doe"
                                    className="w-full bg-slate-50 dark:bg-slate-800/50 dark:text-white px-5 py-3 rounded-2xl border-2 border-transparent focus:border-[#009ED6] outline-none transition-all font-bold text-sm"
                                    value={newUserName}
                                    onChange={e => setNewUserName(e.target.value)}
                                />
                            </div>
                            <div className="space-y-1">
                                <label className="text-[9px] font-black text-slate-400 uppercase tracking-wider ml-2">Usuario (Login / Username)</label>
                                <input 
                                    required
                                    placeholder="Ej: jdoe"
                                    className="w-full bg-slate-50 dark:bg-slate-800/50 dark:text-white px-5 py-3 rounded-2xl border-2 border-transparent focus:border-[#009ED6] outline-none transition-all font-bold text-sm"
                                    value={newUserUsername}
                                    onChange={e => setNewUserUsername(e.target.value)}
                                />
                            </div>
                            <div className="space-y-1">
                                <label className="text-[9px] font-black text-slate-400 uppercase tracking-wider ml-2">Contraseña Inicial</label>
                                <input 
                                    type="password"
                                    required
                                    placeholder="Ingresa la contraseña"
                                    className="w-full bg-slate-50 dark:bg-slate-800/50 dark:text-white px-5 py-3 rounded-2xl border-2 border-transparent focus:border-[#009ED6] outline-none transition-all font-bold text-sm"
                                    value={newUserPassword}
                                    onChange={e => setNewUserPassword(e.target.value)}
                                />
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                                <div className="space-y-1">
                                    <label className="text-[9px] font-black text-slate-400 uppercase tracking-wider ml-2">Rol</label>
                                    <select 
                                        className="w-full bg-slate-50 dark:bg-slate-800/50 dark:text-white px-5 py-3 rounded-2xl border-2 border-transparent focus:border-[#009ED6] outline-none transition-all font-bold text-sm cursor-pointer"
                                        value={newUserRole}
                                        onChange={e => setNewUserRole(e.target.value as any)}
                                    >
                                        <option value="ADMIN">ADMIN</option>
                                        <option value="ASISTENTE">ASISTENTE</option>
                                        <option value="OPERADOR">OPERADOR</option>
                                        <option value="ALERTAS">ALERTAS</option>
                                    </select>
                                </div>

                                <div className="space-y-1">
                                    <label className="text-[9px] font-black text-slate-400 uppercase tracking-wider ml-2">Sede Asignada</label>
                                    <select 
                                        className="w-full bg-slate-50 dark:bg-slate-800/50 dark:text-white px-5 py-3 rounded-2xl border-2 border-transparent focus:border-[#009ED6] outline-none transition-all font-bold text-sm cursor-pointer"
                                        value={newUserSedeId}
                                        onChange={e => setNewUserSedeId(e.target.value)}
                                    >
                                        <option value="">Seleccionar Sede...</option>
                                        {sedes.map(s => (
                                            <option key={s.id} value={s.id}>{s.nombre}</option>
                                        ))}
                                    </select>
                                </div>
                            </div>

                            <div className="flex gap-3 pt-3">
                                <button 
                                    type="button"
                                    onClick={() => setShowAddModal(false)}
                                    className="flex-1 py-3 bg-slate-100 hover:bg-slate-200 text-slate-550 font-black rounded-xl text-[10px] uppercase tracking-widest transition-all"
                                >
                                    Cancelar
                                </button>
                                <button 
                                    type="submit"
                                    className="flex-1 py-3 bg-[#82BD02] hover:bg-[#72a602] text-white font-black rounded-xl text-[10px] uppercase tracking-widest shadow-md transition-all active:scale-95"
                                >
                                    Crear Usuario
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* Change Password Modal */}
            {showChangePasswordModal && (
                <div className="fixed inset-0 z-[100] bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 animate-fade-in">
                    <div className="bg-white dark:bg-[#1e293b] w-full max-w-md rounded-[3rem] shadow-2xl p-6 sm:p-8 space-y-6 border border-white/20">
                        <div className="text-center">
                            <div className="bg-amber-500/10 text-amber-500 w-14 h-14 rounded-2xl flex items-center justify-center mx-auto mb-3">
                                <Lock className="w-6 h-6" />
                            </div>
                            <h2 className="text-xl font-black text-slate-800 dark:text-white uppercase tracking-tight">Cambiar Contraseña</h2>
                            <p className="text-slate-400 text-[10px] font-bold uppercase tracking-wider mt-1">Establece una nueva clave para el usuario</p>
                        </div>

                        <form onSubmit={handleUpdatePasswordSubmit} className="space-y-4">
                            <div className="space-y-1">
                                <label className="text-[9px] font-black text-slate-400 uppercase tracking-wider ml-2">Nueva Contraseña</label>
                                <input 
                                    type="text"
                                    required
                                    placeholder="Ingresa la nueva contraseña"
                                    className="w-full bg-slate-50 dark:bg-slate-800/50 dark:text-white px-5 py-3 rounded-2xl border-2 border-transparent focus:border-[#009ED6] outline-none transition-all font-bold text-center tracking-wider text-sm"
                                    value={newPasswordValue}
                                    onChange={e => setNewPasswordValue(e.target.value)}
                                />
                            </div>

                            <div className="flex gap-3 pt-2">
                                <button 
                                    type="button"
                                    onClick={() => {
                                        setShowChangePasswordModal(false);
                                        setSelectedUserIdForPassword(null);
                                        setNewPasswordValue('');
                                    }}
                                    className="flex-1 py-3 bg-slate-100 hover:bg-slate-200 text-slate-500 font-black rounded-xl text-[10px] uppercase tracking-widest transition-all cursor-pointer"
                                >
                                    Cancelar
                                </button>
                                <button 
                                    type="submit"
                                    className="flex-1 py-3 bg-[#009ED6] hover:bg-[#0089ba] text-white font-black rounded-xl text-[10px] uppercase tracking-widest shadow-md transition-all active:scale-95 cursor-pointer"
                                >
                                    Guardar Cambios
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
};

export default UserManagement;
