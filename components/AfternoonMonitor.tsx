
import React, { useState, useEffect } from 'react';
import { supabase } from '../supabaseClient';
import { 
    X, RefreshCw, BarChart3, 
    TrendingUp, Gauge as GaugeIcon, User, ChevronDown, ChevronUp, CheckCircle
} from './Icons';
import { 
    ResponsiveContainer, AreaChart, Area, XAxis, YAxis, CartesianGrid, 
    Tooltip
} from 'recharts';
import { motion } from 'motion/react';

interface MonitorProps {
    onClose: () => void;
    tempPlates?: any[];
}


const Gauge = ({ value }: { value: number }) => {
    const angle = (value / 100) * 180;
    const rotateAngle = -90 + angle;

    return (
        <div className="flex flex-col items-center">
            <div className="relative w-52 h-28 overflow-hidden">
                {/* Background Track with Gradient (Automotive Style) */}
                <div 
                    className="w-52 h-52 rounded-full absolute top-0 opacity-20"
                    style={{
                        background: 'conic-gradient(from 270deg, #ef4444 0%, #facc15 25%, #22c55e 50%, transparent 50%)',
                        mask: 'radial-gradient(circle, transparent 62%, black 63%)',
                        WebkitMask: 'radial-gradient(circle, transparent 62%, black 63%)'
                    }}
                />
                
                {/* Active Progress Gradient */}
                <div 
                    className="w-52 h-52 rounded-full absolute top-0 transition-all duration-1000"
                    style={{
                        background: `conic-gradient(from 270deg, #ef4444 0%, #facc15 ${value * 0.25}%, #22c55e ${value * 0.5}%, transparent ${value * 0.5}%)`,
                        mask: 'radial-gradient(circle, transparent 62%, black 63%)',
                        WebkitMask: 'radial-gradient(circle, transparent 62%, black 63%)'
                    }}
                />

                {/* Speedometer Ticks */}
                <div className="absolute inset-0 flex justify-center">
                    {[0, 10, 20, 30, 40, 50, 60, 70, 80, 90, 100].map((tick) => {
                        const tickAngle = -90 + (tick / 100) * 180;
                        return (
                            <div 
                                key={tick}
                                className="absolute bottom-0 w-0.5 h-full origin-bottom"
                                style={{ transform: `rotate(${tickAngle}deg)` }}
                            >
                                <div className={`w-0.5 ${tick % 50 === 0 ? 'h-4' : 'h-2'} bg-slate-400/30 dark:bg-slate-500/30 mt-2`} />
                            </div>
                        );
                    })}
                </div>

                {/* Digital Value Display (Subtle) */}
                <div className="absolute bottom-2 left-1/2 -translate-x-1/2 flex flex-col items-center">
                    <span 
                        className="text-4xl font-black tabular-nums tracking-tighter transition-colors duration-500"
                        style={{ 
                            color: value >= 100 ? '#22c55e' : value === 0 ? '#ef4444' : value > 80 ? '#22c55e' : value > 40 ? '#facc15' : '#ef4444'
                        }}
                    >
                        {value}<span className="text-lg opacity-40 ml-0.5 text-slate-900 dark:text-white">%</span>
                    </span>
                </div>

                {/* Modern Needle */}
                <motion.div 
                    initial={{ rotate: -90 }}
                    animate={{ rotate: rotateAngle }}
                    transition={{ type: 'spring', stiffness: 60, damping: 12 }}
                    className="absolute bottom-0 left-1/2 -translate-x-1/2 w-1 h-20 origin-bottom z-10"
                >
                    {/* Main Needle Body */}
                    <div className="w-full h-full bg-gradient-to-t from-rose-600 to-rose-400 rounded-full shadow-[0_0_15px_rgba(225,29,72,0.5)]" />
                    {/* Needle Detail */}
                    <div className="absolute top-0 left-1/2 -translate-x-1/2 w-2 h-2 bg-rose-500 rounded-full blur-[2px]" />
                </motion.div>

                {/* Center Cap (Hub) */}
                <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-8 h-8 -mb-4 bg-slate-900 dark:bg-slate-100 rounded-full z-20 shadow-xl border-4 border-slate-200 dark:border-slate-800" />
            </div>
            <div className="mt-2 text-center">
                <p className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-[0.2em]">Monitor de Avance</p>
            </div>
        </div>
    );
};

const VehicleCard = ({ name, percent }: { name: string, percent: number }) => {
    const status = percent >= 100 ? 'Completado' : percent > 0 ? 'En Proceso' : 'Pendiente';
    
    // Nueva lógica de colores
    const getThemeColor = () => {
        if (percent >= 100) return 'emerald';
        if (percent > 80) return 'amber';
        return 'red';
    };

    const theme = getThemeColor();
    
    const statusColor = 
        theme === 'emerald' ? 'border-t-emerald-500' :
        theme === 'amber' ? 'border-t-amber-500' :
        'border-t-red-500';
    
    const badgeBg = 
        theme === 'emerald' ? 'bg-emerald-500/10 text-emerald-600' :
        theme === 'amber' ? 'bg-amber-500/10 text-amber-600' :
        'bg-red-500/10 text-red-600';

    return (
        <motion.div 
            layout
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className={`bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-3 sm:p-6 shadow-sm flex flex-col gap-4 relative overflow-hidden group hover:shadow-xl transition-all border-t-8 ${statusColor}`}
        >
            <div className="flex justify-between items-start relative z-10">
                <div>
                    <h3 className="text-sm sm:text-xl font-black text-slate-800 dark:text-white font-mono tracking-tighter">{name}</h3>
                </div>
                <span className={`px-2 sm:px-3 py-1 rounded-full text-[7px] sm:text-[9px] font-black uppercase tracking-widest ${badgeBg}`}>
                    {status}
                </span>
            </div>

            <div className="flex justify-center py-2 scale-75 sm:scale-100 -my-4 sm:my-0">
                <Gauge value={percent} />
            </div>
        </motion.div>
    );
};

const AfternoonMonitor: React.FC<MonitorProps> = ({ onClose, tempPlates = [] }) => {
    const [currentUser] = useState(() => {
        try {
            const saved = localStorage.getItem('smartwms_user');
            return saved ? JSON.parse(saved) : null;
        } catch (e) {
            return null;
        }
    });
    const [loading, setLoading] = useState(true);
    
    const [activeView, setActiveView] = useState<'dashboard' | 'clients'>('dashboard');
    const [plateProgress, setPlateProgress] = useState<any[]>([]);
    const [pickingFreq, setPickingFreq] = useState<any[]>([]);
    const [operatorKilos, setOperatorKilos] = useState<any[]>([]);
    const [clientData, setClientData] = useState<any[]>([]);
    const [expandedClient, setExpandedClient] = useState<string | null>(null);
    const [malScansByPlate, setMalScansByPlate] = useState<any[]>([]);
    const [badUsers, setBadUsers] = useState<any[]>([]);
    const [auditLogs, setAuditLogs] = useState<any[]>([]);

    useEffect(() => {
        // Initial fetch
        fetchMonitorData(false);

        // Subscribe to real-time changes
        const channel = supabase
            .channel('despacho_updates')
            .on(
                'postgres_changes', 
                { event: '*', schema: 'public', table: 'despacho_encabezado' },
                () => fetchMonitorData(true)
            )
            .on(
                'postgres_changes', 
                { event: '*', schema: 'public', table: 'despachos_item' },
                () => fetchMonitorData(true)
            )
            .on(
                'postgres_changes', 
                { event: '*', schema: 'public', table: 'auditoria_escaneos' },
                () => fetchMonitorData(true)
            )
            .subscribe();

        return () => {
            supabase.removeChannel(channel);
        };
    }, [currentUser]); // Add currentUser to dependencies

    const fetchMonitorData = async (silent = false) => {
        if (!silent) setLoading(true);
        try {
            let query = supabase
                .from('despacho_encabezado')
                .select('id, placa_vehiculo, estado, cliente')
                .eq('tipo_despacho', 'CARRO_TARDE');

            const sedeId = currentUser?.sede_id;
            if (sedeId) {
                query = query.eq('sede_id', sedeId);
            }

            const { data: allHeaders, error: hError } = await query;

            if (hError) throw hError;

            const headers = (allHeaders || []).filter(h => 
                !h.estado || (h.estado !== 'COMPLETADO' && h.estado !== 'CANCELADO')
            );

            if (headers.length === 0) {
                setPlateProgress([]);
                setPickingFreq([]);
                setOperatorKilos([]);
                setClientData([]);
                return;
            }

            const headerIds = headers.map(h => h.id);
            const platesMapById: Record<string, string> = {};
            const clientMapById: Record<string, string> = {};
            headers.forEach(h => { 
                platesMapById[h.id] = h.placa_vehiculo || 'S/P'; 
                clientMapById[h.id] = h.cliente || 'VARIOS';
            });

            const { data: items, error: iError } = await supabase
                .from('despachos_item')
                .select(`
                    id,
                    encabezado_id,
                    cantidad_despachada,
                    fecha_preparacion,
                    usuario_preparacion,
                    cantidad_pedida,
                    codigo,
                    descripcion,
                    producto:producto_id (
                        peso_unitario
                    )
                `)
                .in('encabezado_id', headerIds);

            if (iError) throw iError;

            if (items) {
                // 1. Plate Progress
                const platesProgressMap: Record<string, { total: number, picked: number }> = {};
                // 4. Client Data
                const clientProgressMap: Record<string, { total: number, picked: number, items: any[] }> = {};
                
                items.forEach((it: any) => {
                    const plate = platesMapById[it.encabezado_id as string] || 'S/P';
                    const client = clientMapById[it.encabezado_id as string] || 'VARIOS';

                    if (!platesProgressMap[plate]) platesProgressMap[plate] = { total: 0, picked: 0 };
                    platesProgressMap[plate].total += Number(it.cantidad_pedida || 0);
                    platesProgressMap[plate].picked += Number(it.cantidad_despachada || 0);

                    if (!clientProgressMap[client]) clientProgressMap[client] = { total: 0, picked: 0, items: [] };
                    clientProgressMap[client].total += Number(it.cantidad_pedida || 0);
                    clientProgressMap[client].picked += Number(it.cantidad_despachada || 0);
                    clientProgressMap[client].items.push({
                        codigo: it.codigo,
                        descripcion: it.descripcion,
                        pedida: Number(it.cantidad_pedida || 0),
                        pickada: Number(it.cantidad_despachada || 0),
                        falta: Math.max(0, Number(it.cantidad_pedida || 0) - Number(it.cantidad_despachada || 0))
                    });
                });
                
                tempPlates.forEach(tp => {
                    const plate = tp.placa;
                    if (!platesProgressMap[plate]) {
                        platesProgressMap[plate] = { total: 0, picked: 0 };
                        Object.values(tp.camaras || {}).forEach((cam: any) => {
                            platesProgressMap[plate].total += (cam.items || []).length;
                        });
                    }
                });

                setPlateProgress(Object.entries(platesProgressMap).map(([name, val]) => ({
                    name,
                    percent: val.total > 0 ? Math.round((val.picked / val.total) * 100) : 0
                })));

                setClientData(Object.entries(clientProgressMap).map(([name, val]) => ({
                    name,
                    percent: val.total > 0 ? Math.round((val.picked / val.total) * 100) : 0,
                    items: val.items.sort((a, b) => b.falta - a.falta)
                })));

                // 2. Picking Frequency
                const freq: Record<string, number> = {};
                items.forEach(it => {
                    if (it.fecha_preparacion) {
                        const hour = new Date(it.fecha_preparacion).getHours();
                        const hourStr = `${hour}:00`;
                        freq[hourStr] = (freq[hourStr] || 0) + 1;
                    }
                });
                setPickingFreq(Object.entries(freq)
                    .map(([hour, count]) => ({ hour, count }))
                    .sort((a, b) => parseInt(a.hour) - parseInt(b.hour))
                );

                // 3. Operator Kilos
                const ops: Record<string, number> = {};
                items.forEach(it => {
                    const op = it.usuario_preparacion || 'SISTEMA';
                    const weight = (it as any).producto?.peso_unitario || 0;
                    const totalWeight = Number(it.cantidad_despachada || 0) * weight;
                    ops[op] = (ops[op] || 0) + totalWeight;
                });
                setOperatorKilos(Object.entries(ops).map(([name, kilos]) => ({
                    name,
                    tons: parseFloat((kilos / 1000).toFixed(2))
                })));

                // 5. Mis-scans and Top 5 users who scan poorly
                const { data: malfunctions } = await supabase
                    .from('auditoria_escaneos')
                    .select('placa, tipo_evento, usuario')
                    .in('tipo_evento', ['MAL_PICKING', 'PRODUCTO_NO_ENCONTRADO'])
                    .eq('modulo', 'CARRO_TARDE');
                
                if (malfunctions) {
                    const plateCounts: Record<string, number> = {};
                    const userCounts: Record<string, number> = {};

                    malfunctions.forEach((m: any) => {
                        if (m.placa) {
                            plateCounts[m.placa] = (plateCounts[m.placa] || 0) + 1;
                        }
                        if (m.usuario) {
                            userCounts[m.usuario] = (userCounts[m.usuario] || 0) + 1;
                        }
                    });

                    setMalScansByPlate(Object.entries(plateCounts)
                        .map(([name, count]) => ({ name, count }))
                        .sort((a,b) => b.count - a.count)
                    );

                    setBadUsers(Object.entries(userCounts)
                        .map(([name, count]) => ({ name, count }))
                        .sort((a, b) => b.count - a.count)
                        .slice(0, 5)
                    );
                }

                // 6. Detailed live audit logs
                const { data: logsData } = await supabase
                    .from('auditoria_escaneos')
                    .select('id, fecha, usuario, placa, ean_escaneado, ean_esperado, descripcion_producto, tipo_evento')
                    .eq('modulo', 'CARRO_TARDE')
                    .order('fecha', { ascending: false })
                    .limit(20);
                
                if (logsData) {
                    setAuditLogs(logsData);
                }
            }
        } catch (err) {
            console.error("Error monitor data", err);
        } finally {
            setLoading(false);
        }
    };

    return (
        <motion.div 
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            className="fixed inset-0 z-[200] bg-slate-50 dark:bg-slate-950 flex flex-col overflow-hidden"
        >
            {/* Nav Header */}
            <div className="bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 p-2 sm:p-4 sticky top-0 z-20 shadow-sm">
                <div className="max-w-7xl mx-auto flex justify-between items-center">
                    <div className="flex items-center gap-2 sm:gap-4 flex-1 min-w-0">
                        <div className="w-8 h-8 sm:w-12 sm:h-12 bg-emerald-500 rounded-lg sm:rounded-2xl flex items-center justify-center text-white shrink-0 shadow-lg shadow-emerald-500/20">
                            <GaugeIcon className="w-4 h-4 sm:w-6 sm:h-6" />
                        </div>
                        <div className="min-w-0">
                            <h2 className="text-sm sm:text-xl font-black text-slate-800 dark:text-white uppercase tracking-tight truncate">DASHBOARD PICKING</h2>
                        </div>
                    </div>

                    <div className="flex items-center gap-1.5 sm:gap-4 shrink-0">
                        <button 
                            onClick={() => setActiveView('dashboard')}
                            className={`px-2.5 py-1.5 sm:px-4 sm:py-2 rounded-lg sm:rounded-xl text-[8px] sm:text-[10px] font-black uppercase tracking-widest transition-all ${activeView === 'dashboard' ? 'bg-emerald-500 text-white shadow-lg shadow-emerald-500/20' : 'bg-slate-100 dark:bg-slate-800 text-slate-400 hover:bg-slate-200'}`}
                        >
                            <div className="flex items-center gap-1 sm:gap-2">
                                <GaugeIcon className="w-3.5 h-3.5 sm:w-4 h-4" />
                                <span className="hidden sm:inline">Dash</span>
                            </div>
                        </button>
                        <button 
                            onClick={() => setActiveView('clients')}
                            className={`px-2.5 py-1.5 sm:px-4 sm:py-2 rounded-lg sm:rounded-xl text-[8px] sm:text-[10px] font-black uppercase tracking-widest transition-all ${activeView === 'clients' ? 'bg-blue-500 text-white shadow-lg shadow-blue-500/20' : 'bg-slate-100 dark:bg-slate-800 text-slate-400 hover:bg-slate-200'}`}
                        >
                            <div className="flex items-center gap-1 sm:gap-2">
                                <User className="w-3.5 h-3.5 sm:w-4 h-4" />
                                <span className="hidden sm:inline">Clientes</span>
                            </div>
                        </button>

                        <div className="bg-amber-50 dark:bg-amber-900/20 px-3 py-2 rounded-xl border border-amber-200 dark:border-amber-800/50 hidden lg:block">
                            <p className="text-[8px] font-black text-amber-600 dark:text-amber-400 uppercase tracking-widest leading-none">Pendientes: {plateProgress.filter(p => p.percent < 100).length}</p>
                        </div>
                        <button 
                            onClick={onClose}
                            className="p-2 sm:p-3 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-full transition-colors text-slate-400 bg-slate-50 dark:bg-slate-900"
                        >
                            <X className="w-5 h-5 sm:w-6 sm:h-6" />
                        </button>
                    </div>
                </div>
            </div>

            <div className="flex-1 overflow-y-auto p-4 sm:p-8 no-scrollbar bg-slate-50 dark:bg-slate-950">
                <div className="max-w-7xl mx-auto space-y-8">
                    
                    {activeView === 'dashboard' ? (
                        <>
                            {/* Stat Cards */}
                            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                                <div className="bg-white dark:bg-slate-900 p-4 sm:p-5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm flex items-center justify-between group overflow-hidden relative border-t-4 border-t-blue-500">
                                    <div className="absolute -right-4 -bottom-4 w-12 h-12 bg-blue-50 dark:bg-blue-900/10 rounded-full group-hover:scale-110 transition-transform duration-700" />
                                    <div className="relative z-10">
                                        <p className="text-[8px] sm:text-[9.5px] font-black text-slate-400 uppercase tracking-widest mb-1 font-mono">AVANCE GLOBAL</p>
                                        <h3 className="text-xl sm:text-2.5xl md:text-3.5xl font-black text-slate-800 dark:text-white leading-none tracking-tight">
                                            {Math.round(plateProgress.reduce((acc, p) => acc + p.percent, 0) / (plateProgress.length || 1))}%
                                        </h3>
                                    </div>
                                    <TrendingUp className="w-5 h-5 sm:w-7 sm:h-7 text-blue-500 relative z-10 opacity-30 shrink-0" />
                                </div>
                                <div className="bg-white dark:bg-slate-900 p-4 sm:p-5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm flex items-center justify-between group overflow-hidden relative border-t-4 border-t-emerald-500">
                                    <div className="absolute -right-4 -bottom-4 w-12 h-12 bg-emerald-50 dark:bg-emerald-900/10 rounded-full group-hover:scale-110 transition-transform duration-700" />
                                    <div className="relative z-10">
                                        <p className="text-[8px] sm:text-[9.5px] font-black text-slate-400 uppercase tracking-widest mb-1 font-mono">TN PREPARADAS</p>
                                        <h3 className="text-xl sm:text-2.5xl md:text-3.5xl font-black text-slate-800 dark:text-white leading-none tracking-tight">
                                            {operatorKilos.reduce((acc, p) => acc + p.tons, 0).toFixed(1)}
                                        </h3>
                                    </div>
                                    <BarChart3 className="w-5 h-5 sm:w-7 sm:h-7 text-emerald-500 relative z-10 opacity-30 shrink-0" />
                                </div>
                                <div className="bg-white dark:bg-slate-900 p-4 sm:p-5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm flex items-center justify-between group overflow-hidden relative border-t-4 border-t-amber-500 col-span-2 sm:col-span-1">
                                    <div className="absolute -right-4 -bottom-4 w-12 h-12 bg-amber-50 dark:bg-amber-900/10 rounded-full group-hover:scale-110 transition-transform duration-700" />
                                    <div className="relative z-10">
                                        <p className="text-[8px] sm:text-[9.5px] font-black text-slate-400 uppercase tracking-widest mb-1 font-mono">TOTAL DE CARROS</p>
                                        <h3 className="text-xl sm:text-2.5xl md:text-3.5xl font-black text-slate-800 dark:text-white leading-none tracking-tight">
                                            {plateProgress.length}
                                        </h3>
                                    </div>
                                    <RefreshCw className="w-5 h-5 sm:w-7 sm:h-7 text-amber-500 relative z-10 opacity-30 shrink-0" />
                                </div>
                            </div>

                            <div className="grid grid-cols-1 gap-8">
                                {/* 1. Plate Progress (Full Width) */}
                                <div className="bg-white dark:bg-slate-900 p-6 sm:p-10 rounded-[3rem] border border-slate-200 dark:border-slate-800 shadow-sm">
                                    <div className="flex justify-between items-center mb-10">
                                        <div>
                                            <h3 className="text-2xl font-black text-slate-800 dark:text-white uppercase tracking-tight">AVANCE POR PLACA</h3>
                                            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-1 tracking-[0.2em]">Porcentaje de picking completado por placa</p>
                                        </div>
                                    </div>
                                    
                                    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3 sm:gap-6">
                                        {plateProgress.map((plate, idx) => (
                                            <VehicleCard key={`card-${plate.name}-${idx}`} percent={plate.percent} name={plate.name} />
                                        ))}
                                    </div>
                                </div>

                                {/* Performance Stats Grid: Frecuencia, Top Mal Picking, Alertas de Auditoria por Placa */}
                                <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                                    {/* Frecuencia de Picking */}
                                    <div className="bg-white dark:bg-slate-900 p-6 sm:p-8 rounded-[1.5rem] border border-slate-200 dark:border-slate-800 shadow-sm">
                                        <div className="flex justify-between items-center mb-6">
                                            <div>
                                                <h3 className="text-lg font-black text-slate-800 dark:text-white uppercase tracking-tight">Frecuencia de Picking</h3>
                                                <p className="text-[10px] font-bold text-slate-400 uppercase mt-1">Suma acumulada de pickings por hora</p>
                                            </div>
                                            <TrendingUp className="w-6 h-6 text-blue-500 opacity-40" />
                                        </div>
                                        <div className="h-60">
                                            <ResponsiveContainer width="100%" height="100%">
                                                <AreaChart data={pickingFreq}>
                                                    <defs>
                                                        <linearGradient id="colorFreq" x1="0" y1="0" x2="0" y2="1">
                                                            <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3}/>
                                                            <stop offset="95%" stopColor="#3b82f6" stopOpacity={0}/>
                                                        </linearGradient>
                                                    </defs>
                                                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E2E8F0" opacity={0.3} />
                                                    <XAxis dataKey="hour" axisLine={false} tickLine={false} tick={{ fill: '#94a3b8', fontSize: 10, fontWeight: 900, fontFamily: 'monospace' }} />
                                                    <YAxis hide />
                                                    <Tooltip contentStyle={{ borderRadius: '1rem', border: 'none', backgroundColor: '#1e293b', color: '#fff' }} />
                                                    <Area type="stepAfter" dataKey="count" stroke="#3b82f6" strokeWidth={3} fill="url(#colorFreq)" />
                                                </AreaChart>
                                            </ResponsiveContainer>
                                        </div>
                                    </div>

                                    {/* Top 5 - Usuarios que Pican Mal (Errores) */}
                                    <div className="bg-white dark:bg-slate-900 p-6 sm:p-8 rounded-[1.5rem] border border-slate-200 dark:border-slate-800 shadow-sm flex flex-col justify-between">
                                        <div>
                                            <div className="flex justify-between items-center mb-6">
                                                <div>
                                                    <h3 className="text-lg font-black text-rose-500 uppercase tracking-tight">Top 5 - Usuarios con Errores</h3>
                                                    <p className="text-[10px] font-bold text-slate-400 uppercase mt-1">Ranking de operarios con lecturas incorrectas</p>
                                                </div>
                                                <div className="w-10 h-10 bg-rose-50 dark:bg-rose-950/30 rounded-xl flex items-center justify-center text-rose-500 shrink-0">
                                                    <User className="w-5 h-5 animate-pulse" />
                                                </div>
                                            </div>

                                            <div className="space-y-4 max-h-60 overflow-y-auto pr-2 no-scrollbar">
                                                {badUsers.length > 0 ? (
                                                    badUsers.map((u, idx) => {
                                                        const maxVal = Math.max(...badUsers.map(x => x.count)) || 1;
                                                        const pct = Math.round((u.count / maxVal) * 100);
                                                        return (
                                                            <div key={`bad-user-${u.name}-${idx}`} className="space-y-1.5">
                                                                <div className="flex items-center justify-between text-xs font-black">
                                                                    <div className="flex items-center gap-2">
                                                                        <span className="text-[10px] text-slate-400 font-mono">#{idx + 1}</span>
                                                                        <span className="text-slate-700 dark:text-slate-200 uppercase">{u.name}</span>
                                                                    </div>
                                                                    <span className="text-rose-500 font-mono font-black">{u.count} Errores</span>
                                                                </div>
                                                                <div className="h-2 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
                                                                    <motion.div 
                                                                        initial={{ width: 0 }}
                                                                        animate={{ width: `${pct}%` }}
                                                                        className="h-full bg-gradient-to-r from-red-400 to-rose-600 rounded-full"
                                                                        transition={{ duration: 1, ease: 'easeOut' }}
                                                                    />
                                                                </div>
                                                            </div>
                                                        );
                                                    })
                                                ) : (
                                                    <div className="flex flex-col items-center justify-center h-40 text-slate-300">
                                                        <CheckCircle className="w-12 h-12 mb-2 text-emerald-500 opacity-30" />
                                                        <p className="text-xs font-black uppercase tracking-widest opacity-40">¡Excelente! Sin registros de error</p>
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    </div>

                                    {/* Alertas de Auditoria (por Carros/Placas) */}
                                    <div className="bg-white dark:bg-slate-900 p-6 sm:p-8 rounded-[1.5rem] border border-slate-200 dark:border-slate-800 shadow-sm lg:col-span-2">
                                        <div className="flex justify-between items-center mb-6">
                                            <div>
                                                <h3 className="text-lg font-black text-amber-500 dark:text-amber-400 uppercase tracking-tight">Lecturas Críticas por Carro</h3>
                                                <p className="text-[10px] font-bold text-slate-400 uppercase mt-1">Placas o carros que registran mayor número de incidentes</p>
                                            </div>
                                            <div className="w-10 h-10 bg-amber-50 dark:bg-amber-950/30 rounded-xl flex items-center justify-center text-amber-500 shrink-0">
                                                <BarChart3 className="w-5 h-5" />
                                            </div>
                                        </div>
                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 max-h-60 overflow-y-auto pr-2 no-scrollbar">
                                            {malScansByPlate.length > 0 ? malScansByPlate.map((p, idx) => (
                                                <div key={`mal-${p.name}-${idx}`} className="flex items-center justify-between p-4 bg-amber-50/15 dark:bg-amber-950/10 rounded-2xl border border-amber-500/10 dark:border-amber-500/20">
                                                    <div className="flex items-center gap-4">
                                                        <div className="w-9 h-9 bg-amber-500/10 text-amber-600 dark:text-amber-400 rounded-xl flex items-center justify-center font-black text-xs font-mono">
                                                            {idx + 1}
                                                        </div>
                                                        <div>
                                                            <p className="text-sm font-black text-slate-800 dark:text-white uppercase tracking-wider">{p.name}</p>
                                                            <p className="text-[10px] font-black text-amber-600 dark:text-amber-400 uppercase tracking-widest font-mono">{p.count} INCIDENTES</p>
                                                        </div>
                                                    </div>
                                                    <div className="px-3 py-1 bg-amber-500 text-white text-[9px] font-black rounded-lg uppercase tracking-widest">
                                                        REVISAR
                                                    </div>
                                                </div>
                                            )) : (
                                                <div className="flex flex-col items-center justify-center h-40 col-span-2 text-slate-300">
                                                    <CheckCircle className="w-12 h-12 mb-2 text-emerald-500 opacity-20" />
                                                    <p className="text-xs font-black uppercase tracking-widest opacity-40 font-semibold text-center">Operaciones estables y fluidas</p>
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                </div>

                                {/* 3. Detailed Audit Table (Tabla de Auditoria) */}
                                <div className="bg-white dark:bg-slate-900 p-6 sm:p-8 rounded-[1.5rem] border border-slate-200 dark:border-slate-800 shadow-sm">
                                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
                                        <div>
                                            <h3 className="text-lg font-black text-slate-800 dark:text-white uppercase tracking-tight">Historial de Auditoría de Escaneos</h3>
                                            <p className="text-[10px] font-bold text-slate-400 uppercase mt-1">Registros en tiempo real de todos los escaneos realizados por los operadores</p>
                                        </div>
                                        <div className="flex gap-2">
                                            <span className="px-2.5 py-1 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 text-[9px] font-black uppercase rounded-lg">
                                                Pickings Correctos
                                            </span>
                                            <span className="px-2.5 py-1 bg-rose-500/10 text-rose-600 dark:text-rose-400 text-[9px] font-black uppercase rounded-lg">
                                                Pickings Incorrectos
                                            </span>
                                        </div>
                                    </div>

                                    <div className="overflow-x-auto">
                                        <table className="min-w-full divide-y divide-slate-100 dark:divide-slate-850 text-left">
                                            <thead>
                                                <tr className="border-b border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50">
                                                    <th className="py-3 px-4 text-[9px] font-black text-slate-400 uppercase tracking-widest font-mono">Fecha / Hora</th>
                                                    <th className="py-3 px-4 text-[9px] font-black text-slate-400 uppercase tracking-widest font-mono">Usuario (Operador Picking)</th>
                                                    <th className="py-3 px-4 text-[9px] font-black text-slate-400 uppercase tracking-widest font-mono">Placa</th>
                                                    <th className="py-3 px-4 text-[9px] font-black text-slate-400 uppercase tracking-widest font-mono">Producto Escaneado</th>
                                                    <th className="py-3 px-4 text-[9px] font-black text-slate-400 uppercase tracking-widest font-mono">Código Barras</th>
                                                    <th className="py-3 px-5 text-[9px] font-black text-slate-400 uppercase tracking-widest font-mono text-center">Estado</th>
                                                </tr>
                                            </thead>
                                            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                                                {auditLogs.length > 0 ? (
                                                    auditLogs.map((log: any, i: number) => {
                                                        const isSuccess = log.tipo_evento === 'VALIDACION_EXITOSA';
                                                        const formattedTime = log.fecha 
                                                            ? new Date(log.fecha).toLocaleString('es-ES', { 
                                                                hour: '2-digit', 
                                                                minute: '2-digit',
                                                                second: '2-digit',
                                                                day: '2-digit',
                                                                month: '2-digit'
                                                            })
                                                            : 'S/F';
                                                        
                                                        return (
                                                            <tr key={`log-${log.id || i}`} className="group hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors">
                                                                <td className="py-3.5 px-4 text-xs text-slate-500 font-mono">{formattedTime}</td>
                                                                <td className="py-3.5 px-4">
                                                                    <div className="flex items-center gap-2">
                                                                        <div className={`w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold uppercase shrink-0 ${isSuccess ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400' : 'bg-rose-100 text-rose-700 dark:bg-rose-950/40 dark:text-rose-400'}`}>
                                                                            {log.usuario ? log.usuario.charAt(0) : '?'}
                                                                        </div>
                                                                        <span className="text-xs font-black text-slate-705 dark:text-slate-200 uppercase font-sans truncate max-w-[150px]">
                                                                            {log.usuario || 'Operador'}
                                                                        </span>
                                                                    </div>
                                                                </td>
                                                                <td className="py-3.5 px-4">
                                                                    <span className="text-xs font-bold text-slate-500 dark:text-slate-350 bg-slate-100 dark:bg-slate-850 px-2 py-0.5 rounded uppercase font-mono">
                                                                        {log.placa || 'N/A'}
                                                                    </span>
                                                                </td>
                                                                <td className="py-3.5 px-4">
                                                                    <p className="text-xs font-medium text-slate-700 dark:text-slate-300 truncate max-w-[200px]">
                                                                        {log.descripcion_producto || 'No Especificado'}
                                                                    </p>
                                                                </td>
                                                                <td className="py-3.5 px-4 text-xs font-mono text-slate-400">
                                                                    <div className="flex flex-col">
                                                                        {log.ean_escaneado && (
                                                                            <span className={isSuccess ? 'text-emerald-650 dark:text-emerald-400 font-black' : 'text-slate-500'}>
                                                                                {log.ean_escaneado}
                                                                            </span>
                                                                        )}
                                                                        {log.ean_esperado && !isSuccess && (
                                                                            <span className="text-slate-400 dark:text-slate-500 text-[10px]">
                                                                                Esp: {log.ean_esperado}
                                                                            </span>
                                                                        )}
                                                                    </div>
                                                                </td>
                                                                <td className="py-3.5 px-5 text-center shrink-0">
                                                                    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[8.5px] font-black uppercase tracking-wider ${
                                                                        isSuccess 
                                                                            ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-400' 
                                                                            : 'bg-rose-100 text-rose-800 dark:bg-rose-950/50 dark:text-rose-400'
                                                                    }`}>
                                                                        <span className={`w-1 h-1 rounded-full ${isSuccess ? 'bg-emerald-500' : 'bg-rose-500'}`} />
                                                                        {isSuccess ? 'Listo' : 'Fallo'}
                                                                    </span>
                                                                </td>
                                                            </tr>
                                                        );
                                                    })
                                                ) : (
                                                    <tr>
                                                        <td colSpan={6} className="py-12 text-center text-slate-400">
                                                            <CheckCircle className="w-10 h-10 mx-auto mb-3 opacity-20" />
                                                            <p className="text-xs font-black uppercase tracking-widest opacity-40 font-semibold">Sin registros de auditoría aún</p>
                                                        </td>
                                                    </tr>
                                                )}
                                            </tbody>
                                        </table>
                                    </div>
                                </div>
                            </div>
                        </>
                    ) : (
                        <div className="bg-white dark:bg-slate-900 p-6 sm:p-10 rounded-[3rem] border border-slate-200 dark:border-slate-800 shadow-sm">
                            <div className="mb-10">
                                <h3 className="text-2xl font-black text-slate-800 dark:text-white uppercase tracking-tight">DETALLE POR CLIENTES</h3>
                                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-1 tracking-[0.2em]">Sincronización en tiempo real por cada cliente activo</p>
                            </div>

                            <div className="space-y-4">
                                {clientData.map((client, idx) => (
                                    <div key={`client-${client.name}-${idx}`} className="bg-slate-50 dark:bg-slate-800/50 rounded-3xl overflow-hidden border border-slate-100 dark:border-slate-800">
                                        <div 
                                            className="p-6 flex items-center justify-between cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                                            onClick={() => setExpandedClient(expandedClient === client.name ? null : client.name)}
                                        >
                                            <div className="flex-1">
                                                <h4 className="text-lg font-black text-slate-700 dark:text-white truncate pr-4">{client.name}</h4>
                                                <div className="flex items-center gap-4 mt-2">
                                                    <div className="h-4 bg-slate-200 dark:bg-slate-700 rounded-full flex-1 overflow-hidden">
                                                        <motion.div 
                                                            initial={{ width: 0 }}
                                                            animate={{ width: `${client.percent}%` }}
                                                            className={`h-full ${client.percent >= 100 ? 'bg-emerald-500' : client.percent > 80 ? 'bg-amber-500' : 'bg-red-500'}`}
                                                        />
                                                    </div>
                                                    <span className="text-sm font-black text-slate-400 min-w-[3rem]">{client.percent}%</span>
                                                </div>
                                            </div>
                                            <div className="ml-6 p-2 rounded-full bg-white dark:bg-slate-700 shadow-sm text-slate-400">
                                                {expandedClient === client.name ? <ChevronUp className="w-5 h-5" /> : <ChevronDown className="w-5 h-5" />}
                                            </div>
                                        </div>

                                        {expandedClient === client.name && (
                                            <div className="px-6 pb-6 pt-2 overflow-x-auto">
                                                <table className="w-full text-left">
                                                    <thead>
                                                        <tr className="border-b border-slate-200 dark:border-slate-700">
                                                            <th className="py-3 text-[9px] font-black text-slate-400 uppercase tracking-widest">Código</th>
                                                            <th className="py-3 text-[9px] font-black text-slate-400 uppercase tracking-widest">Descripción</th>
                                                            <th className="py-3 text-[9px] font-black text-slate-400 uppercase tracking-widest text-center">Pedida</th>
                                                            <th className="py-3 text-[9px] font-black text-slate-400 uppercase tracking-widest text-center">Pickada</th>
                                                            <th className="py-3 text-[9px] font-black text-slate-400 uppercase tracking-widest text-right px-4">Estado</th>
                                                        </tr>
                                                    </thead>
                                                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                                                        {client.items.map((it: any, i: number) => (
                                                            <tr key={`item-${i}`} className="group">
                                                                <td className="py-4 text-xs font-black text-slate-600 dark:text-slate-300 font-mono">{it.codigo}</td>
                                                                <td className="py-4 text-xs font-bold text-slate-500 dark:text-slate-400 truncate max-w-[200px]">{it.descripcion}</td>
                                                                <td className="py-4 text-xs font-black text-slate-700 dark:text-slate-200 text-center">{it.pedida}</td>
                                                                <td className="py-4 text-xs font-black text-blue-600 dark:text-blue-400 text-center">{it.pickada}</td>
                                                                <td className="py-4 text-right px-4">
                                                                    <span className={`px-2 py-1 rounded-lg text-[8px] font-black uppercase ${it.pickada >= it.pedida ? 'bg-emerald-500/10 text-emerald-600' : 'bg-amber-500/10 text-amber-600'}`}>
                                                                        {it.pickada >= it.pedida ? 'Completo' : `Falta ${it.pedida - it.pickada}`}
                                                                    </span>
                                                                </td>
                                                            </tr>
                                                        ))}
                                                    </tbody>
                                                </table>
                                            </div>
                                        )}
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}
                </div>
            </div>


            {loading && (
                <div className="absolute inset-0 z-50 bg-white/60 dark:bg-slate-900/60 backdrop-blur-sm flex items-center justify-center">
                    <div className="flex flex-col items-center gap-4">
                        <RefreshCw className="w-12 h-12 text-blue-500 animate-spin" />
                        <p className="text-xs font-black text-blue-600 uppercase tracking-widest">Sincronizando Dashboard...</p>
                    </div>
                </div>
            )}
        </motion.div>
    );
};

export default AfternoonMonitor;
