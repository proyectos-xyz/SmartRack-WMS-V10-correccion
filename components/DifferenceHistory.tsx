
import React, { useState, useEffect } from 'react';
import { supabase } from '../supabaseClient';
import { DifferenceHistory } from '../types';
import { History, Search, RefreshCw, Download, Calendar, Filter } from './Icons';
import * as XLSX from 'xlsx';

const DifferenceHistoryView: React.FC = () => {
    const [currentUser] = useState(() => {
        try {
            const saved = localStorage.getItem('smartwms_user');
            return saved ? JSON.parse(saved) : null;
        } catch (e) {
            return null;
        }
    });
    const [history, setHistory] = useState<DifferenceHistory[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const [searchTerm, setSearchTerm] = useState('');
    const [activeTab, setActiveTab] = useState<'matrix' | 'list'>('matrix');
    const [filterDate, setFilterDate] = useState<string>('');

    useEffect(() => {
        loadHistory();
    }, []);

    const loadHistory = async () => {
        setIsLoading(true);
        try {
            let query = supabase
                .from('historial_diferencias')
                .select('*');
            
            const sedeId = currentUser?.sede_id;
            if (sedeId) {
                query = query.eq('sede_id', sedeId);
            }

            const { data, error } = await query.order('fecha', { ascending: false });
            
            if (error) throw error;
            if (data) setHistory(data as DifferenceHistory[]);
        } catch (error) {
            console.error("Error loading history:", error);
        } finally {
            setIsLoading(false);
        }
    };

    // Get unique dates for columns and filters
    const uniqueDates = Array.from(new Set(history.map(h => h.fecha))).sort((a, b) => b.localeCompare(a));

    // PESTAÑA 1 (MATRIZ): Group by product code
    const groupedByProduct = history.reduce((acc, curr) => {
        if (!acc[curr.codigo]) {
            acc[curr.codigo] = {
                codigo: curr.codigo,
                nombre: curr.nombre,
                diffs: {}
            };
        }
        acc[curr.codigo].diffs[curr.fecha] = curr.diferencia;
        return acc;
    }, {} as Record<string, { codigo: string, nombre: string, diffs: Record<string, number> }>);

    const matrixProducts = Object.values(groupedByProduct).filter(p => 
        p.codigo.toLowerCase().includes(searchTerm.toLowerCase()) ||
        p.nombre.toLowerCase().includes(searchTerm.toLowerCase())
    );

    // PESTAÑA 2 (LISTADO): Filtered flat list of differences
    const listItems = history.filter(item => {
        const matchesSearch = item.codigo.toLowerCase().includes(searchTerm.toLowerCase()) ||
                              item.nombre.toLowerCase().includes(searchTerm.toLowerCase());
        const matchesDate = filterDate ? item.fecha === filterDate : true;
        return matchesSearch && matchesDate;
    });

    const getTrendBadge = (p: any) => {
        if (uniqueDates.length < 2) return <span className="text-slate-400 text-[10px] font-bold">-</span>;
        const latestDate = uniqueDates[0];
        const previousDate = uniqueDates[1];
        
        const diffLatest = p.diffs[latestDate];
        const diffPrevious = p.diffs[previousDate];
        
        if (diffLatest === undefined || diffLatest === 0) {
            if (diffPrevious !== undefined && diffPrevious !== 0) {
                return (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[9px] font-black uppercase bg-emerald-100 text-emerald-800 border border-emerald-200">
                        🟢 Corregido
                    </span>
                );
            }
            return <span className="text-slate-400 text-[10px] font-bold">Sin diferencias</span>;
        }
        
        if (diffPrevious === undefined || diffPrevious === 0) {
            return (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[9px] font-black uppercase bg-red-100 text-red-700 border border-red-200 animate-pulse">
                    🚨 Nueva Diferencia
                </span>
            );
        }
        
        if (diffLatest === diffPrevious) {
            return (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[9px] font-[900] uppercase bg-amber-100 text-amber-800 border border-amber-200 shadow-sm">
                    ⚠️ Persistente
                </span>
            );
        }
        
        const diffLatestAbs = Math.abs(diffLatest);
        const diffPreviousAbs = Math.abs(diffPrevious);
        
        if (diffLatestAbs < diffPreviousAbs) {
            return (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[9px] font-black uppercase bg-blue-100 text-blue-700 border border-blue-200">
                    📉 Reduciendo
                </span>
            );
        } else {
            return (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[9px] font-black uppercase bg-rose-100 text-rose-800 border border-rose-200">
                    📈 Incrementando
                </span>
            );
        }
    };

    const exportToExcel = () => {
        let dataToExport = [];
        let filename = '';

        if (activeTab === 'matrix') {
            dataToExport = matrixProducts.map(p => {
                const row: any = {
                    'Código': p.codigo,
                    'Producto': p.nombre
                };
                uniqueDates.forEach(date => {
                    row[date] = p.diffs[date] !== undefined ? p.diffs[date] : '---';
                });
                return row;
            });
            filename = `Matriz_Tendencias_Diferencias_${new Date().toISOString().split('T')[0]}.xlsx`;
        } else {
            dataToExport = listItems.map(item => ({
                'Fecha': item.fecha,
                'Código': item.codigo,
                'Producto': item.nombre,
                'Stock Sistema': item.stock_sistema,
                'Conteo Físico': item.conteo_fisico,
                'Diferencia': item.diferencia,
                'Procesado Por': item.procesado_por,
                'Fecha Procesado': item.fecha_procesado ? new Date(item.fecha_procesado).toLocaleString() : 'N/A'
            }));
            filename = `Listado_Diferencias_Detallado_${new Date().toISOString().split('T')[0]}.xlsx`;
        }

        const ws = XLSX.utils.json_to_sheet(dataToExport);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, activeTab === 'matrix' ? "Matriz Tendencias" : "Listado Detalle");
        XLSX.writeFile(wb, filename);
    };

    return (
        <div className="flex flex-col h-full bg-white dark:bg-slate-900">
            {/* Header */}
            <div className="p-6 border-b dark:border-slate-700 flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                    <h2 className="text-2xl font-black text-slate-800 dark:text-white flex items-center gap-2">
                        <History className="w-8 h-8 text-indigo-600" />
                        HISTORIAL DE DIFERENCIAS
                    </h2>
                    <p className="text-slate-500 dark:text-slate-400 text-sm font-medium">
                        Monitorea las diferencias de inventario a lo largo del tiempo.
                    </p>
                </div>

                <div className="flex items-center gap-2">
                    <button 
                        onClick={exportToExcel}
                        disabled={activeTab === 'matrix' ? matrixProducts.length === 0 : listItems.length === 0}
                        className="flex items-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl transition-all shadow-lg font-bold text-sm disabled:opacity-50"
                    >
                        <Download className="w-4 h-4" />
                        Exportar a Excel
                    </button>
                    <button 
                        onClick={loadHistory}
                        className="p-2 bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 rounded-xl hover:bg-slate-200 transition-all"
                    >
                        <RefreshCw className={`w-5 h-5 ${isLoading ? 'animate-spin' : ''}`} />
                    </button>
                </div>
            </div>

            {/* Pestañas de Navegación del Módulo */}
            <div className="px-6 border-b dark:border-slate-700 bg-slate-50/50 dark:bg-slate-800/20 flex gap-2">
                <button
                    onClick={() => { setActiveTab('matrix'); setSearchTerm(''); }}
                    className={`py-3 px-4 font-black text-xs uppercase tracking-wider relative transition-all border-b-2 ${
                        activeTab === 'matrix' 
                            ? 'border-indigo-600 text-indigo-600' 
                            : 'border-transparent text-slate-500 hover:text-slate-800'
                    }`}
                >
                    📈 Matriz de Tendencias (Ayer vs Hoy)
                </button>
                <button
                    onClick={() => { setActiveTab('list'); setSearchTerm(''); }}
                    className={`py-3 px-4 font-black text-xs uppercase tracking-wider relative transition-all border-b-2 ${
                        activeTab === 'list' 
                            ? 'border-indigo-600 text-indigo-600' 
                            : 'border-transparent text-slate-500 hover:text-slate-800'
                    }`}
                >
                    📋 Listado Detallado de Diferencias
                </button>
            </div>

            {/* Filtros */}
            <div className="px-6 py-4 border-b dark:border-slate-700 flex flex-col sm:flex-row gap-3">
                <div className="flex-1 relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
                    <input 
                        type="text"
                        placeholder="Buscar por código o nombre..."
                        className="w-full pl-10 pr-4 py-3 bg-slate-100 dark:bg-slate-800 border-none rounded-xl text-slate-800 dark:text-white font-medium focus:ring-2 focus:ring-blue-500 outline-none"
                        value={searchTerm}
                        onChange={e => setSearchTerm(e.target.value)}
                    />
                </div>

                {activeTab === 'list' && (
                    <div className="w-full sm:w-64 relative">
                        <Filter className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                        <select
                            className="w-full pl-9 pr-3 py-3 bg-slate-100 dark:bg-slate-800 border-none rounded-xl text-slate-800 dark:text-white font-[700] text-sm focus:ring-2 focus:ring-blue-500 outline-none appearance-none cursor-pointer"
                            value={filterDate}
                            onChange={e => setFilterDate(e.target.value)}
                        >
                            <option value="">Todas las Fechas</option>
                            {uniqueDates.map(date => (
                                <option key={date} value={date}>{date}</option>
                            ))}
                        </select>
                    </div>
                )}
            </div>

            {/* Table */}
            <div className="flex-1 overflow-auto p-6">
                <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-xl border dark:border-slate-700 overflow-hidden">
                    <div className="overflow-x-auto">
                        {activeTab === 'matrix' ? (
                            <table className="w-full text-left border-collapse min-w-max">
                                <thead>
                                    <tr className="bg-slate-50 dark:bg-slate-700/50 border-b dark:border-slate-700">
                                        <th className="p-4 text-[10px] font-black text-slate-400 uppercase tracking-widest sticky left-0 bg-slate-50 dark:bg-slate-700 z-10 font-[900]">Producto</th>
                                        <th className="p-4 text-[10px] font-black text-slate-400 uppercase tracking-widest text-center font-[900]">Alerta de Tendencia</th>
                                        {uniqueDates.map(date => (
                                            <th key={date} className="p-4 text-[10px] font-black text-slate-400 uppercase tracking-widest text-center min-w-[100px] font-[900]">
                                                <div className="flex flex-col items-center">
                                                    <Calendar className="w-3 h-3 mb-1" />
                                                    {date}
                                                </div>
                                            </th>
                                        ))}
                                    </tr>
                                </thead>
                                <tbody className="divide-y dark:divide-slate-700">
                                    {matrixProducts.length === 0 ? (
                                        <tr>
                                            <td colSpan={uniqueDates.length + 2} className="p-12 text-center text-slate-400 font-medium italic">
                                                No hay historial registrado. Procesa diferencias en el módulo de Conciliación.
                                            </td>
                                        </tr>
                                    ) : (
                                        matrixProducts.map((p, idx) => (
                                            <tr key={idx} className="hover:bg-slate-50 dark:hover:bg-slate-700/30 transition-colors">
                                                <td className="p-4 sticky left-0 bg-white dark:bg-slate-800 z-10 border-r dark:border-slate-700">
                                                    <div className="font-black text-slate-800 dark:text-white text-sm">{p.nombre}</div>
                                                    <div className="text-[10px] font-bold text-slate-400 mt-0.5 flex gap-1.5 items-center">
                                                        <span className="bg-slate-100 dark:bg-slate-700 px-1.5 py-0.5 rounded text-[9px] font-mono">{p.codigo}</span>
                                                    </div>
                                                </td>
                                                <td className="p-4 text-center border-r dark:border-slate-700 whitespace-nowrap">
                                                    {getTrendBadge(p)}
                                                </td>
                                                {uniqueDates.map(date => {
                                                    const diff = p.diffs[date];
                                                    const hasDiff = diff !== undefined;
                                                    return (
                                                        <td key={date} className={`p-4 text-center font-black text-sm ${!hasDiff ? 'text-slate-200 dark:text-slate-700' : (diff === 0 ? 'text-emerald-500' : (diff > 0 ? 'text-blue-500' : 'text-red-500'))}`}>
                                                            {hasDiff ? (diff > 0 ? `+${diff}` : diff) : '---'}
                                                        </td>
                                                    );
                                                })}
                                            </tr>
                                        ))
                                    )}
                                </tbody>
                            </table>
                        ) : (
                            <table className="w-full text-left border-collapse min-w-max">
                                <thead>
                                    <tr className="bg-slate-50 dark:bg-slate-700/50 border-b dark:border-slate-700">
                                        <th className="p-4 text-[10px] font-black text-slate-400 uppercase tracking-widest font-[900]">Fecha</th>
                                        <th className="p-4 text-[10px] font-black text-slate-400 uppercase tracking-widest font-[900]">Código</th>
                                        <th className="p-4 text-[10px] font-black text-slate-400 uppercase tracking-widest font-[900]">Producto</th>
                                        <th className="p-4 text-[10px] font-black text-slate-400 uppercase tracking-widest text-center font-[900]">Stock Sistema</th>
                                        <th className="p-4 text-[10px] font-black text-slate-400 uppercase tracking-widest text-center font-[900]">Conteo Físico</th>
                                        <th className="p-4 text-[10px] font-black text-slate-400 uppercase tracking-widest text-center font-[900]">Diferencia</th>
                                        <th className="p-4 text-[10px] font-black text-slate-400 uppercase tracking-widest text-center font-[900]">Responsable</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y dark:divide-slate-700">
                                    {listItems.length === 0 ? (
                                        <tr>
                                            <td colSpan={7} className="p-12 text-center text-slate-400 font-medium italic">
                                                No se encontraron diferencias con los filtros aplicados.
                                            </td>
                                        </tr>
                                    ) : (
                                        listItems.map((item, idx) => (
                                            <tr key={idx} className="hover:bg-slate-50 dark:hover:bg-slate-700/30 transition-colors">
                                                <td className="p-4 font-bold text-slate-700 dark:text-slate-300 text-sm whitespace-nowrap">
                                                    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-slate-100 dark:bg-slate-800 rounded-lg text-xs font-black">
                                                        <Calendar className="w-3.5 h-3.5 text-indigo-500" />
                                                        {item.fecha}
                                                    </span>
                                                </td>
                                                <td className="p-4 font-mono text-xs font-black text-slate-550 dark:text-slate-400">
                                                    {item.codigo}
                                                </td>
                                                <td className="p-4">
                                                    <span className="font-extrabold text-slate-800 dark:text-slate-200 text-sm">{item.nombre}</span>
                                                </td>
                                                <td className="p-4 text-center font-bold text-slate-600 dark:text-slate-400">
                                                    {item.stock_sistema}
                                                </td>
                                                <td className="p-4 text-center font-bold text-slate-600 dark:text-slate-400">
                                                    {item.conteo_fisico}
                                                </td>
                                                <td className={`p-4 text-center font-black ${item.diferencia === 0 ? 'text-emerald-600' : (item.diferencia > 0 ? 'text-blue-600' : 'text-red-600')}`}>
                                                    {item.diferencia > 0 ? `+${item.diferencia}` : item.diferencia}
                                                </td>
                                                <td className="p-4 text-center text-slate-500 dark:text-slate-400 text-xs font-bold">
                                                    {item.procesado_por || 'N/A'}
                                                </td>
                                            </tr>
                                        ))
                                    )}
                                </tbody>
                            </table>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
};

export default DifferenceHistoryView;
