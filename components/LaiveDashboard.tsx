import React, { useState, useEffect } from 'react';
import { supabase } from '../supabaseClient';
import { Product } from '../types';
import { RefreshCw, LayoutGrid, Thermometer, Snowflake, Sun, CheckCircle, ArrowLeft, Package, Trash, Search, Check } from './Icons';
import { motion } from 'motion/react';
import { formatCompactDate } from '../utils';

interface LaiveDashboardProps {
    catalog: Product[];
}

interface CameraItem {
    id: string;
    nombre: string;
    estado: string;
    codigo: string;
    cantidad: number;
    fecha_vencimiento: string;
}

interface CameraProgress {
    tipo: 'SECO' | 'REFRIGERADO' | 'CONGELADO';
    total: number;
    completados: number;
    porcentaje: number;
    items: CameraItem[];
}

const LaiveDashboard: React.FC<LaiveDashboardProps> = ({ catalog }) => {
    const [currentUser] = useState(() => {
        try {
            const saved = localStorage.getItem('smartwms_user');
            return saved ? JSON.parse(saved) : null;
        } catch (e) {
            return null;
        }
    });
    const [activeView, setActiveView] = useState<'DASHBOARD' | 'COMPARISON' | 'HISTORY'>('DASHBOARD');
    const [progressData, setProgressData] = useState<CameraProgress[]>([]);
    const [historyData, setHistoryData] = useState<any[]>([]);
    const [comparisonData, setComparisonData] = useState<any[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [lastUpdate, setLastUpdate] = useState<string>('');
    const [selectedCamera, setSelectedCamera] = useState<CameraProgress | null>(null);

    // Filters for Comparison View
    const [compSearchTerm, setCompSearchTerm] = useState('');
    const [compFilterStatus, setCompFilterStatus] = useState<'ALL' | 'MATCH' | 'DISCREPANCY' | 'PENDING'>('ALL');

    const fetchProgress = async () => {
        setIsLoading(true);
        try {
            let query = supabase
                .from('recepcion_productos')
                .select('id, producto_id, estado, nombre, codigo, cantidad, cantidad_xml, cantidad_validada, fecha_vencimiento, fecha_registro')
                .eq('proveedor', 'CARGA_XML')
                .neq('estado', 'ELIMINADO');

            const sedeId = currentUser?.sede_id;
            if (sedeId) {
                query = query.eq('sede_id', sedeId);
            }

            const { data, error } = await query;

            if (error) throw error;

            const items = data || [];
            
            const stats: Record<string, { total: number; completados: number; items: CameraItem[] }> = {
                'SECO': { total: 0, completados: 0, items: [] },
                'REFRIGERADO': { total: 0, completados: 0, items: [] },
                'CONGELADO': { total: 0, completados: 0, items: [] }
            };

            items.forEach(item => {
                const prod = catalog.find(p => p.id === item.producto_id);
                if (prod) {
                    let type: 'SECO' | 'REFRIGERADO' | 'CONGELADO' = 'SECO';
                    if (prod.es_congelado) type = 'CONGELADO';
                    else if (prod.es_refrigerado) type = 'REFRIGERADO';
                    else if (prod.es_seco) type = 'SECO';

                    stats[type].total += 1;
                    if (item.estado === 'ACTIVO') {
                        stats[type].completados += 1;
                    }
                    stats[type].items.push({
                        id: item.id,
                        nombre: item.nombre,
                        estado: item.estado,
                        codigo: item.codigo,
                        cantidad: item.cantidad || 0,
                        fecha_vencimiento: item.fecha_vencimiento || ''
                    });
                }
            });

            const finalData: CameraProgress[] = Object.keys(stats).map(key => {
                const s = stats[key];
                return {
                    tipo: key as any,
                    total: s.total,
                    completados: s.completados,
                    porcentaje: s.total > 0 ? Math.round((s.completados / s.total) * 100) : 0,
                    items: s.items
                };
            });

            setProgressData(finalData);
            setLastUpdate(new Date().toLocaleTimeString());
        } catch (err) {
            console.error("Error fetching dashboard progress:", err);
        } finally {
            setIsLoading(false);
        }
    };

    const fetchComparisonData = async () => {
        setIsLoading(true);
        try {
            let query = supabase
                .from('recepcion_productos')
                .select('*')
                .eq('proveedor', 'CARGA_XML')
                .neq('estado', 'ELIMINADO');

            const sedeId = currentUser?.sede_id;
            if (sedeId) {
                query = query.eq('sede_id', sedeId);
            }

            const { data, error } = await query.order('fecha_registro', { ascending: false });

            if (error) throw error;
            setComparisonData(data || []);
            setLastUpdate(new Date().toLocaleTimeString());
        } catch (err) {
            console.error("Error fetching comparison data:", err);
        } finally {
            setIsLoading(false);
        }
    };

    const fetchHistory = async () => {
        setIsLoading(true);
        try {
            let query = supabase
                .from('recepcion_productos')
                .select('*')
                .eq('proveedor', 'CARGA_XML');

            const sedeId = currentUser?.sede_id;
            if (sedeId) {
                query = query.eq('sede_id', sedeId);
            }

            const { data, error } = await query
                .order('fecha_registro', { ascending: false })
                .limit(100);

            if (error) throw error;
            setHistoryData(data || []);
            setLastUpdate(new Date().toLocaleTimeString());
        } catch (err) {
            console.error("Error fetching Laive history:", err);
        } finally {
            setIsLoading(false);
        }
    };

    const handleLogicalDelete = async () => {
        if (!confirm('¿Está seguro de eliminar lógicamente el ingreso actual? Esto marcará todos los items pendientes como ELIMINADOS.')) return;
        
        setIsLoading(true);
        try {
            let query = supabase
                .from('recepcion_productos')
                .update({ estado: 'ELIMINADO' })
                .eq('proveedor', 'CARGA_XML')
                .in('estado', ['PENDIENTE_LAIVE', 'PENDIENTE_RECEPCION']);

            const sedeId = currentUser?.sede_id;
            if (sedeId) {
                query = query.eq('sede_id', sedeId);
            }

            const { error } = await query;
            if (error) throw error;
            alert('Ingreso eliminado lógicamente con éxito.');
            if (activeView === 'DASHBOARD') fetchProgress();
            else if (activeView === 'COMPARISON') fetchComparisonData();
            else fetchHistory();
        } catch (err) {
            console.error("Error performing logical delete:", err);
            alert('Error al realizar el borrado lógico.');
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => {
        if (activeView === 'DASHBOARD') fetchProgress();
        else if (activeView === 'COMPARISON') fetchComparisonData();
        else fetchHistory();

        // Real-time subscription to recepcion_productos
        const channel = supabase
            .channel('laive-dashboard-realtime')
            .on(
                'postgres_changes',
                {
                    event: '*',
                    schema: 'public',
                    table: 'recepcion_productos',
                    filter: "proveedor=eq.CARGA_XML"
                },
                () => {
                    if (activeView === 'DASHBOARD') fetchProgress();
                    else if (activeView === 'COMPARISON') fetchComparisonData();
                    else fetchHistory();
                }
            )
            .subscribe();

        return () => {
            supabase.removeChannel(channel);
        };
    }, [catalog, activeView]);

    const getIcon = (tipo: string) => {
        switch (tipo) {
            case 'SECO': return <Sun className="w-8 h-8 text-amber-500" />;
            case 'REFRIGERADO': return <Thermometer className="w-8 h-8 text-blue-500" />;
            case 'CONGELADO': return <Snowflake className="w-8 h-8 text-indigo-500" />;
            default: return <LayoutGrid className="w-8 h-8 text-slate-400" />;
        }
    };

    const getColors = (tipo: string) => {
        switch (tipo) {
            case 'SECO': return 'from-amber-50 to-amber-100 border-amber-200 text-amber-700';
            case 'REFRIGERADO': return 'from-blue-50 to-blue-100 border-blue-200 text-blue-700';
            case 'CONGELADO': return 'from-indigo-50 to-indigo-100 border-indigo-200 text-indigo-700';
            default: return 'from-slate-50 to-slate-100 border-slate-200 text-slate-700';
        }
    };

    const getBarColor = (tipo: string) => {
        switch (tipo) {
            case 'SECO': return 'bg-amber-500 shadow-amber-200';
            case 'REFRIGERADO': return 'bg-blue-500 shadow-blue-200';
            case 'CONGELADO': return 'bg-indigo-500 shadow-indigo-200';
            default: return 'bg-slate-500';
        }
    };

    const sortedItems = (items: CameraItem[]) => {
        const pending = items
            .filter(i => i.estado !== 'ACTIVO')
            .sort((a, b) => a.nombre.localeCompare(b.nombre));
        
        const completed = items
            .filter(i => i.estado === 'ACTIVO')
            .sort((a, b) => a.nombre.localeCompare(b.nombre));
        
        return [...pending, ...completed];
    };

    // Filter logic for comparison view
    const filteredComparisonData = comparisonData.filter(item => {
        const term = compSearchTerm.toLowerCase().trim();
        const matchesTerm = !term || 
            item.codigo?.toLowerCase().includes(term) || 
            item.nombre?.toLowerCase().includes(term);

        if (!matchesTerm) return false;

        const xmlQty = Number(item.cantidad_xml ?? item.cantidad ?? 0);
        const valQty = item.estado === 'ACTIVO' ? Number(item.cantidad_validada ?? item.cantidad ?? 0) : 0;
        const diff = valQty - xmlQty;
        const isValidated = item.estado === 'ACTIVO';

        if (compFilterStatus === 'MATCH') return isValidated && diff === 0;
        if (compFilterStatus === 'DISCREPANCY') return isValidated && diff !== 0;
        if (compFilterStatus === 'PENDING') return !isValidated;

        return true;
    });

    // Consolidated Metrics for Comparison View
    const totalCompXmlQty = comparisonData.reduce((acc, curr) => acc + Number(curr.cantidad_xml ?? curr.cantidad ?? 0), 0);
    const totalCompValQty = comparisonData.reduce((acc, curr) => {
        if (curr.estado === 'ACTIVO') {
            return acc + Number(curr.cantidad_validada ?? curr.cantidad ?? 0);
        }
        return acc;
    }, 0);
    const totalCompDiff = totalCompValQty - totalCompXmlQty;
    const validatedItemsCount = comparisonData.filter(c => c.estado === 'ACTIVO').length;

    if (selectedCamera) {
        return (
            <div className="p-6 h-full flex flex-col bg-slate-50 overflow-hidden">
                <div className="flex items-center gap-4 mb-6">
                    <button 
                        onClick={() => setSelectedCamera(null)}
                        className="p-3 bg-white rounded-2xl shadow-md border border-slate-100 hover:bg-slate-50 transition-colors cursor-pointer"
                    >
                        <ArrowLeft className="w-5 h-5 text-slate-600" />
                    </button>
                    <div className="flex items-center gap-3">
                        <div className={`p-2 rounded-xl bg-gradient-to-br ${getColors(selectedCamera.tipo)}`}>
                            {getIcon(selectedCamera.tipo)}
                        </div>
                        <div>
                            <h2 className="text-xl font-black text-slate-800 uppercase italic">Detalle Cámara {selectedCamera.tipo}</h2>
                            <p className="text-[10px] text-indigo-500 font-bold uppercase tracking-[0.2em]">Listado de validación física</p>
                        </div>
                    </div>
                </div>

                <div className="flex-1 bg-white rounded-[2rem] shadow-xl border border-slate-100 overflow-hidden flex flex-col">
                    <div className="px-6 py-4 bg-slate-50/50 border-b border-slate-100 flex items-center justify-between">
                        <span className="text-xs font-black text-slate-400 uppercase tracking-widest">
                            Mostrando {selectedCamera.items.length} productos
                        </span>
                        <div className="flex items-center gap-4">
                            <div className="flex items-center gap-1.5">
                                <div className="w-2 h-2 rounded-full bg-emerald-500"></div>
                                <span className="text-[10px] font-black text-slate-500 uppercase tracking-tighter">Recibido</span>
                            </div>
                            <div className="flex items-center gap-1.5">
                                <div className="w-2 h-2 rounded-full bg-slate-300"></div>
                                <span className="text-[10px] font-black text-slate-500 uppercase tracking-tighter">Pendiente</span>
                            </div>
                        </div>
                    </div>

                    <div className="flex-1 overflow-auto p-4 space-y-2 custom-scrollbar">
                        {sortedItems(selectedCamera.items).map((item) => (
                            <div 
                                key={item.id} 
                                className={`flex items-center gap-4 p-4 rounded-2xl border transition-all ${
                                    item.estado === 'ACTIVO' 
                                        ? 'bg-emerald-50 border-emerald-100' 
                                        : 'bg-white border-slate-100 hover:border-slate-200'
                                }`}
                            >
                                <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${
                                    item.estado === 'ACTIVO' ? 'bg-emerald-500 text-white' : 'bg-slate-100 text-slate-400'
                                }`}>
                                    {item.estado === 'ACTIVO' ? <CheckCircle className="w-5 h-5" /> : <Package className="w-5 h-5" />}
                                </div>
                                <div className="flex-1 min-w-0">
                                    <h4 className={`text-sm font-black uppercase tracking-tight truncate ${
                                        item.estado === 'ACTIVO' ? 'text-emerald-700' : 'text-slate-700'
                                    }`}>
                                        {item.nombre}
                                    </h4>
                                    <div className="flex items-center gap-3 mt-0.5">
                                        <span className={`text-[10px] font-bold font-mono ${
                                            item.estado === 'ACTIVO' ? 'text-emerald-500' : 'text-slate-400'
                                        }`}>
                                            {item.codigo}
                                        </span>
                                        <div className="flex items-center gap-1.5 border-l border-slate-200 pl-3">
                                            <span className="text-[9px] font-black text-slate-400 uppercase">Cant:</span>
                                            <span className={`text-xs font-black ${item.estado === 'ACTIVO' ? 'text-emerald-600' : 'text-slate-600'}`}>
                                                {item.cantidad}
                                            </span>
                                        </div>
                                        {item.fecha_vencimiento && (
                                            <div className="flex items-center gap-1.5 border-l border-slate-200 pl-3">
                                                <span className="text-[9px] font-black text-slate-400 uppercase">Vence:</span>
                                                <span className={`text-[10px] font-bold font-mono ${item.estado === 'ACTIVO' ? 'text-emerald-600' : 'text-slate-500'}`}>
                                                    {item.fecha_vencimiento}
                                                </span>
                                            </div>
                                        )}
                                    </div>
                                </div>
                                <div className={`px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest ${
                                    item.estado === 'ACTIVO' ? 'bg-emerald-200 text-emerald-800' : 'bg-slate-100 text-slate-400'
                                }`}>
                                    {item.estado === 'ACTIVO' ? 'RECIBIDO' : 'PENDIENTE'}
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="p-4 sm:p-6 h-full flex flex-col bg-slate-50 overflow-auto">
            {/* Top Header */}
            <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-4 mb-6">
                <div className="flex items-center gap-3">
                    <div className="p-2.5 bg-white rounded-2xl shadow-lg border border-slate-100 shrink-0">
                        <img 
                            src="https://i.ibb.co/dJQtnxPT/Anotaci-n-2u.png" 
                            alt="Laive" 
                            className="w-9 h-9 object-contain"
                            referrerPolicy="no-referrer"
                        />
                    </div>
                    <div>
                        <h2 className="text-xl sm:text-2xl font-black text-slate-800 uppercase tracking-tight italic">Monitoreo Laive</h2>
                        <p className="text-xs text-indigo-600 font-bold uppercase tracking-widest flex items-center gap-2 mt-0.5">
                            <span className="w-2 h-2 bg-emerald-500 rounded-full animate-ping"></span>
                            {activeView === 'DASHBOARD' ? 'Estado de Recepción en Tiempo Real' : 
                             activeView === 'COMPARISON' ? 'Comparativa XML vs Cantidad Validada' : 
                             'Historial de Registros XML'}
                        </p>
                    </div>
                </div>

                <div className="flex flex-wrap items-center gap-3 w-full lg:w-auto justify-between lg:justify-end">
                    <div className="flex bg-white p-1 rounded-2xl shadow-sm border border-slate-200 shrink-0">
                        <button 
                            onClick={() => setActiveView('DASHBOARD')}
                            className={`px-4 py-2 rounded-xl text-[10px] font-black uppercase transition-all cursor-pointer ${
                                activeView === 'DASHBOARD' ? 'bg-[#009ED6] text-white shadow' : 'text-slate-400 hover:text-slate-600'
                            }`}
                        >
                            Monitor
                        </button>
                        <button 
                            onClick={() => setActiveView('COMPARISON')}
                            className={`px-4 py-2 rounded-xl text-[10px] font-black uppercase transition-all cursor-pointer ${
                                activeView === 'COMPARISON' ? 'bg-[#009ED6] text-white shadow' : 'text-slate-400 hover:text-slate-600'
                            }`}
                        >
                            Comparativa XML vs Validado
                        </button>
                        <button 
                            onClick={() => setActiveView('HISTORY')}
                            className={`px-4 py-2 rounded-xl text-[10px] font-black uppercase transition-all cursor-pointer ${
                                activeView === 'HISTORY' ? 'bg-[#009ED6] text-white shadow' : 'text-slate-400 hover:text-slate-600'
                            }`}
                        >
                            Historial
                        </button>
                    </div>

                    <div className="flex items-center gap-2">
                        {activeView === 'DASHBOARD' && (
                            <button 
                                onClick={handleLogicalDelete}
                                disabled={isLoading}
                                className="bg-rose-50 hover:bg-rose-600 text-rose-600 hover:text-white px-4 py-2 rounded-xl text-[10px] font-black uppercase border border-rose-200 shadow-sm transition-all active:scale-95 flex items-center gap-1.5 cursor-pointer"
                            >
                                <Trash className="w-3.5 h-3.5" /> Borrado Lógico
                            </button>
                        )}

                        <div className="text-right pl-2 border-l border-slate-200">
                            <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest leading-none mb-0.5">Última actualización</p>
                            <p className="text-xs font-black text-slate-600 font-mono">{lastUpdate || '--:--:--'}</p>
                        </div>
                    </div>
                </div>
            </div>

            {/* VIEW 1: DASHBOARD / MONITOR */}
            {activeView === 'DASHBOARD' && (
                isLoading && progressData.length === 0 ? (
                    <div className="flex-1 flex flex-col items-center justify-center opacity-40 py-16">
                        <RefreshCw className="w-10 h-10 text-indigo-600 animate-spin mb-3" />
                        <span className="text-xs font-black uppercase tracking-widest">Sincronizando Avance...</span>
                    </div>
                ) : (
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                        {progressData.filter(c => c.total > 0).map((camera, idx) => (
                            <motion.div 
                                key={camera.tipo}
                                initial={{ opacity: 0, y: 20 }}
                                animate={{ opacity: 1, y: 0 }}
                                transition={{ delay: idx * 0.1 }}
                                onClick={() => setSelectedCamera(camera)}
                                className={`bg-gradient-to-br ${getColors(camera.tipo)} border-2 rounded-[2.5rem] p-8 shadow-xl flex flex-col relative overflow-hidden cursor-pointer hover:scale-[1.02] active:scale-95 transition-all group`}
                            >
                                <div className="absolute -right-6 -bottom-6 opacity-5 transform rotate-12 scale-150 group-hover:rotate-45 transition-transform duration-500">
                                    {getIcon(camera.tipo)}
                                </div>

                                <div className="flex items-start justify-between mb-8">
                                    <div className="p-4 bg-white rounded-2xl shadow-lg border border-slate-50 shrink-0">
                                        {getIcon(camera.tipo)}
                                    </div>
                                    <div className="text-right">
                                        <span className="text-5xl font-black tabular-nums tracking-tighter leading-none">
                                            {camera.porcentaje}%
                                        </span>
                                    </div>
                                </div>

                                <div className="mb-2">
                                    <h3 className="text-xl font-black uppercase tracking-tighter mb-1">CÁMARA {camera.tipo}</h3>
                                    <div className="flex items-center gap-2">
                                        <div className="flex items-center gap-1 bg-white/50 px-2 py-1 rounded-lg">
                                            <span className="text-[10px] font-black opacity-60">PROGRESO:</span>
                                            <span className="text-sm font-black tracking-tight">{camera.completados} / {camera.total}</span>
                                        </div>
                                    </div>
                                </div>

                                <div className="mt-8">
                                    <div className="h-4 bg-white/40 rounded-full overflow-hidden p-1 shadow-inner border border-white/20">
                                        <motion.div 
                                            initial={{ width: 0 }}
                                            animate={{ width: `${camera.porcentaje}%` }}
                                            transition={{ duration: 1, ease: "easeOut" }}
                                            className={`h-full rounded-full shadow-lg ${getBarColor(camera.tipo)}`}
                                        />
                                    </div>
                                </div>

                                <div className="mt-6 flex flex-col gap-2">
                                    <div className="flex justify-between text-[10px] font-black uppercase tracking-widest opacity-60">
                                        <span>Faltante</span>
                                        <span>{camera.total - camera.completados} Skus</span>
                                    </div>
                                </div>
                            </motion.div>
                        ))}
                    </div>
                )
            )}

            {/* VIEW 2: TABLA COMPARATIVA XML VS VALIDADO */}
            {activeView === 'COMPARISON' && (
                <div className="flex-1 flex flex-col gap-4 animate-fade-in">
                    {/* Summary Cards */}
                    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                        <div className="bg-white border border-slate-200 p-4 rounded-2xl shadow-sm">
                            <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest block mb-1">Cajas Según XML</span>
                            <span className="text-2xl font-black text-slate-800 font-mono">{totalCompXmlQty}</span>
                            <p className="text-[9px] text-slate-400 font-bold uppercase mt-1">{comparisonData.length} ítems en guía XML</p>
                        </div>

                        <div className="bg-white border border-slate-200 p-4 rounded-2xl shadow-sm">
                            <span className="text-[9px] font-black text-indigo-500 uppercase tracking-widest block mb-1">Cajas Validadas</span>
                            <span className="text-2xl font-black text-indigo-700 font-mono">{totalCompValQty}</span>
                            <p className="text-[9px] text-indigo-600 font-bold uppercase mt-1">{validatedItemsCount} de {comparisonData.length} validados</p>
                        </div>

                        <div className="bg-white border border-slate-200 p-4 rounded-2xl shadow-sm">
                            <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest block mb-1">Diferencia Neta Global</span>
                            <div className="flex items-center gap-2">
                                <span className={`text-2xl font-black font-mono ${
                                    totalCompDiff === 0 ? 'text-emerald-600' :
                                    totalCompDiff > 0 ? 'text-blue-600' : 'text-rose-600'
                                }`}>
                                    {totalCompDiff > 0 ? `+${totalCompDiff}` : totalCompDiff}
                                </span>
                                <span className={`text-[10px] font-black px-2 py-0.5 rounded-full uppercase ${
                                    totalCompDiff === 0 ? 'bg-emerald-100 text-emerald-800' :
                                    totalCompDiff > 0 ? 'bg-blue-100 text-blue-800' : 'bg-rose-100 text-rose-800'
                                }`}>
                                    {totalCompDiff === 0 ? 'Conforme' : totalCompDiff > 0 ? 'Sobrante' : 'Faltante'}
                                </span>
                            </div>
                        </div>

                        <div className="bg-white border border-slate-200 p-4 rounded-2xl shadow-sm">
                            <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest block mb-1">Avance de Escaneo</span>
                            <span className="text-2xl font-black text-emerald-600 font-mono">
                                {comparisonData.length > 0 ? Math.round((validatedItemsCount / comparisonData.length) * 100) : 0}%
                            </span>
                            <p className="text-[9px] text-slate-400 font-bold uppercase mt-1">
                                {comparisonData.length - validatedItemsCount} pendientes por escaneo
                            </p>
                        </div>
                    </div>

                    {/* Filter Bar */}
                    <div className="bg-white border border-slate-200 p-3.5 rounded-2xl shadow-sm flex flex-col sm:flex-row items-center justify-between gap-3">
                        <div className="relative w-full sm:w-80">
                            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                            <input 
                                type="text"
                                value={compSearchTerm}
                                onChange={(e) => setCompSearchTerm(e.target.value)}
                                placeholder="Buscar por código ICO o producto..."
                                className="w-full pl-9 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold outline-none focus:border-indigo-500 focus:bg-white transition-all"
                            />
                        </div>

                        <div className="flex bg-slate-100 p-1 rounded-xl border border-slate-200 w-full sm:w-auto overflow-x-auto">
                            <button 
                                onClick={() => setCompFilterStatus('ALL')}
                                className={`px-3 py-1.5 text-[10px] font-black uppercase rounded-lg transition-all cursor-pointer ${
                                    compFilterStatus === 'ALL' ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500'
                                }`}
                            >
                                Todos ({comparisonData.length})
                            </button>
                            <button 
                                onClick={() => setCompFilterStatus('MATCH')}
                                className={`px-3 py-1.5 text-[10px] font-black uppercase rounded-lg transition-all cursor-pointer ${
                                    compFilterStatus === 'MATCH' ? 'bg-white text-emerald-700 shadow-sm' : 'text-slate-500'
                                }`}
                            >
                                Conformes
                            </button>
                            <button 
                                onClick={() => setCompFilterStatus('DISCREPANCY')}
                                className={`px-3 py-1.5 text-[10px] font-black uppercase rounded-lg transition-all cursor-pointer ${
                                    compFilterStatus === 'DISCREPANCY' ? 'bg-white text-rose-700 shadow-sm' : 'text-slate-500'
                                }`}
                            >
                                Con Diferencia
                            </button>
                            <button 
                                onClick={() => setCompFilterStatus('PENDING')}
                                className={`px-3 py-1.5 text-[10px] font-black uppercase rounded-lg transition-all cursor-pointer ${
                                    compFilterStatus === 'PENDING' ? 'bg-white text-amber-700 shadow-sm' : 'text-slate-500'
                                }`}
                            >
                                Pendientes
                            </button>
                        </div>
                    </div>

                    {/* Comparison Main Table */}
                    <div className="flex-1 bg-white rounded-2xl shadow-lg border border-slate-200 overflow-hidden flex flex-col">
                        <div className="overflow-x-auto flex-1 custom-scrollbar">
                            <table className="w-full text-left text-xs">
                                <thead className="bg-slate-50 text-slate-500 font-black uppercase text-[10px] tracking-wider border-b border-slate-200 sticky top-0 z-10">
                                    <tr>
                                        <th className="px-4 py-3">Cód. ICO</th>
                                        <th className="px-4 py-3">Producto / Descripción</th>
                                        <th className="px-4 py-3 text-center">F. Vencimiento</th>
                                        <th className="px-4 py-3 text-center bg-slate-100">Cant. XML</th>
                                        <th className="px-4 py-3 text-center bg-indigo-50/70">Cant. Validada</th>
                                        <th className="px-4 py-3 text-center">Diferencia</th>
                                        <th className="px-4 py-3 text-center">Estado</th>
                                        <th className="px-4 py-3">Observaciones</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100 font-medium">
                                    {filteredComparisonData.length === 0 ? (
                                        <tr>
                                            <td colSpan={8} className="px-4 py-12 text-center text-slate-400 font-bold uppercase italic">
                                                No se encontraron registros de comparación
                                            </td>
                                        </tr>
                                    ) : (
                                        filteredComparisonData.map((item) => {
                                            const xmlQty = Number(item.cantidad_xml ?? item.cantidad ?? 0);
                                            const isValidated = item.estado === 'ACTIVO';
                                            const valQty = isValidated ? Number(item.cantidad_validada ?? item.cantidad ?? 0) : 0;
                                            const diff = valQty - xmlQty;

                                            return (
                                                <tr key={item.id} className="hover:bg-slate-50/80 transition-colors">
                                                    <td className="px-4 py-3 font-mono font-black text-indigo-600">
                                                        {item.codigo}
                                                    </td>
                                                    <td className="px-4 py-3 font-extrabold text-slate-800 uppercase">
                                                        {item.nombre}
                                                    </td>
                                                    <td className="px-4 py-3 text-center font-mono text-slate-600 font-bold">
                                                        {formatCompactDate(item.fecha_vencimiento)}
                                                    </td>
                                                    <td className="px-4 py-3 text-center font-mono font-black text-slate-800 bg-slate-50">
                                                        {xmlQty}
                                                    </td>
                                                    <td className="px-4 py-3 text-center font-mono font-black text-indigo-700 bg-indigo-50/40">
                                                        {isValidated ? valQty : <span className="text-slate-300 italic">--</span>}
                                                    </td>
                                                    <td className="px-4 py-3 text-center">
                                                        {!isValidated ? (
                                                            <span className="text-[10px] text-slate-400 italic">Pendiente</span>
                                                        ) : diff === 0 ? (
                                                            <span className="inline-flex items-center gap-1 bg-emerald-100 text-emerald-800 text-[10px] font-black px-2.5 py-0.5 rounded-full">
                                                                <Check className="w-3 h-3 stroke-[3]" /> 0 (Conforme)
                                                            </span>
                                                        ) : diff > 0 ? (
                                                            <span className="inline-flex items-center gap-1 bg-blue-100 text-blue-800 text-[10px] font-black px-2.5 py-0.5 rounded-full">
                                                                +{diff} (Sobrante)
                                                            </span>
                                                        ) : (
                                                            <span className="inline-flex items-center gap-1 bg-rose-100 text-rose-800 text-[10px] font-black px-2.5 py-0.5 rounded-full">
                                                                {diff} (Faltante)
                                                            </span>
                                                        )}
                                                    </td>
                                                    <td className="px-4 py-3 text-center">
                                                        <span className={`text-[9px] font-black px-2.5 py-0.5 rounded-full uppercase tracking-wider ${
                                                            isValidated ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'
                                                        }`}>
                                                            {isValidated ? 'VALIDADO' : 'PENDIENTE'}
                                                        </span>
                                                    </td>
                                                    <td className="px-4 py-3 text-slate-500 text-[11px] italic max-w-xs truncate">
                                                        {item.observaciones || '---'}
                                                    </td>
                                                </tr>
                                            );
                                        })
                                    )}
                                </tbody>
                                <tfoot className="bg-slate-100 font-black text-slate-800 border-t-2 border-slate-300">
                                    <tr>
                                        <td colSpan={3} className="px-4 py-3 uppercase text-right tracking-wider">
                                            Totales Consolidados:
                                        </td>
                                        <td className="px-4 py-3 text-center font-mono text-sm bg-slate-200/60">
                                            {totalCompXmlQty}
                                        </td>
                                        <td className="px-4 py-3 text-center font-mono text-sm bg-indigo-100/60 text-indigo-900">
                                            {totalCompValQty}
                                        </td>
                                        <td className="px-4 py-3 text-center font-mono text-sm">
                                            <span className={`${
                                                totalCompDiff === 0 ? 'text-emerald-700' :
                                                totalCompDiff > 0 ? 'text-blue-700' : 'text-rose-700'
                                            }`}>
                                                {totalCompDiff > 0 ? `+${totalCompDiff}` : totalCompDiff}
                                            </span>
                                        </td>
                                        <td colSpan={2} className="px-4 py-3 text-[10px] text-slate-500 uppercase italic">
                                            {validatedItemsCount} de {comparisonData.length} registros validados
                                        </td>
                                    </tr>
                                </tfoot>
                            </table>
                        </div>
                    </div>
                </div>
            )}

            {/* VIEW 3: HISTORIAL */}
            {activeView === 'HISTORY' && (
                <div className="flex-1 bg-white rounded-[2.5rem] shadow-xl border border-slate-100 overflow-hidden flex flex-col animate-fade-in">
                    <div className="overflow-x-auto">
                        <table className="w-full text-left text-sm">
                            <thead className="bg-slate-50 text-slate-400 font-black uppercase text-[10px] tracking-widest border-b border-slate-100">
                                <tr>
                                    <th className="px-6 py-4">Fecha</th>
                                    <th className="px-6 py-4">Producto</th>
                                    <th className="px-6 py-4 text-center">Cant.</th>
                                    <th className="px-6 py-4">Vencimiento</th>
                                    <th className="px-6 py-4 text-center">Estado</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-50">
                                {historyData.map((item, idx) => (
                                    <tr key={idx} className="hover:bg-slate-50/50 transition-colors">
                                        <td className="px-6 py-4 font-mono text-[10px] text-slate-500">
                                            {new Date(item.fecha_registro).toLocaleString()}
                                        </td>
                                        <td className="px-6 py-4">
                                            <div className="font-black text-slate-700 uppercase tracking-tight">{item.nombre}</div>
                                            <div className="text-[10px] font-bold text-slate-400 font-mono">{item.codigo}</div>
                                        </td>
                                        <td className="px-6 py-4 text-center font-black text-slate-600">{item.cantidad}</td>
                                        <td className="px-6 py-4 font-mono text-[10px] text-slate-500">{item.fecha_vencimiento || '---'}</td>
                                        <td className="px-6 py-4 text-center">
                                            <span className={`px-3 py-1 rounded-full text-[9px] font-black uppercase tracking-widest shadow-sm ${
                                                item.estado === 'ACTIVO' ? 'bg-emerald-100 text-emerald-700' :
                                                item.estado === 'ELIMINADO' ? 'bg-rose-100 text-rose-700' :
                                                'bg-amber-100 text-amber-700'
                                            }`}>
                                                {item.estado === 'ACTIVO' ? 'RECIBIDO' : item.estado === 'ELIMINADO' ? 'ELIMINADO' : 'PENDIENTE'}
                                            </span>
                                        </td>
                                    </tr>
                                ))}
                                {historyData.length === 0 && (
                                    <tr>
                                        <td colSpan={5} className="px-6 py-20 text-center text-slate-400 font-black uppercase italic opacity-50">
                                            No hay registros históricos disponibles
                                        </td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}

            {/* Global Footer Banner */}
            <div className="mt-auto pt-6 border-t border-slate-200">
                <div className="bg-indigo-600 rounded-3xl p-5 shadow-xl flex flex-col md:flex-row items-center justify-between gap-4">
                    <div className="flex items-center gap-4">
                        <div className="p-3 bg-white/20 rounded-2xl backdrop-blur-md">
                            <LayoutGrid className="w-5 h-5 text-white" />
                        </div>
                        <div>
                            <h4 className="text-white font-black uppercase tracking-tight italic text-sm">Total Consolidado Laive</h4>
                            <p className="text-indigo-200 text-[10px] font-bold uppercase tracking-widest">Global Laive Reception</p>
                        </div>
                    </div>
                    
                    {(() => {
                        const total = progressData.reduce((acc, curr) => acc + curr.total, 0);
                        const completados = progressData.reduce((acc, curr) => acc + curr.completados, 0);
                        const porcentaje = total > 0 ? Math.round((completados / total) * 100) : 0;
                        
                        return (
                            <div className="flex items-center gap-6">
                                <div className="text-center">
                                    <span className="block text-[9px] font-black text-indigo-300 uppercase tracking-widest leading-none mb-1">Ítems Carga</span>
                                    <span className="text-xl font-black text-white tabular-nums leading-none">{total}</span>
                                </div>
                                <div className="text-center">
                                    <span className="block text-[9px] font-black text-indigo-300 uppercase tracking-widest leading-none mb-1">Validados</span>
                                    <span className="text-xl font-black text-white tabular-nums leading-none">{completados}</span>
                                </div>
                                <div className="bg-emerald-500 px-5 py-2.5 rounded-2xl shadow-lg border-b-4 border-emerald-700">
                                    <span className="text-2xl font-black text-white tabular-nums leading-none">{porcentaje}%</span>
                                </div>
                            </div>
                        );
                    })()}
                </div>
            </div>
        </div>
    );
};

export default LaiveDashboard;
