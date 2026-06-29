
import React, { useState, useEffect } from 'react';
import { supabase } from '../supabaseClient';
import { Product, StocktakeRecord, SystemStock, Usuario } from '../types';
import { Upload, AlertTriangle, CheckCircle, Search, RefreshCw, Download, Save, X } from './Icons';
import * as XLSX from 'xlsx';

interface ConciliationProps {
    catalog: Product[];
    currentUser?: Usuario | null;
}

const Conciliation: React.FC<ConciliationProps> = ({ catalog, currentUser }) => {
    const [systemStock, setSystemStock] = useState<SystemStock[]>([]);
    const [dailyCounts, setDailyCounts] = useState<StocktakeRecord[]>([]);
    const [lastDifferences, setLastDifferences] = useState<Record<string, number>>({});
    const [isLoading, setIsLoading] = useState(false);
    const [isProcessing, setIsProcessing] = useState(false);
    const [searchTerm, setSearchTerm] = useState('');
    const [successMsg, setSuccessMsg] = useState<string | null>(null);
    const [showUploadModal, setShowUploadModal] = useState(false);
    const [dragActive, setDragActive] = useState(false);

    useEffect(() => {
        loadData();
    }, []);

    const loadData = async () => {
        setIsLoading(true);
        try {
            // Load Saved System Stock (select '*' to load any new column like 'movimiento' dynamically without crashing)
            let sysQuery = supabase.from('stock_sistema').select('*');
            if (currentUser?.sede_id) {
                sysQuery = sysQuery.eq('sede_id', currentUser.sede_id);
            }
            const { data: sysData } = await sysQuery;
            if (sysData) setSystemStock(sysData as SystemStock[]);

            // Load Daily Counts (today) - Optimized columns
            const today = new Date().toISOString().split('T')[0];
            let countQuery = supabase
                .from('conteo_inventario')
                .select('id, codigo, nombre, cantidad, fecha_vencimiento, zona, fecha_registro')
                .gte('fecha_registro', `${today}T00:00:00`)
                .lte('fecha_registro', `${today}T23:59:59`);
            
            if (currentUser?.sede_id) {
                countQuery = countQuery.eq('sede_id', currentUser.sede_id);
            }

            const { data: countData } = await countQuery;
            if (countData) setDailyCounts(countData as StocktakeRecord[]);

            // Load preceding difference records to calculate trend
            let dateQuery = supabase
                .from('historial_diferencias')
                .select('fecha')
                .lt('fecha', today)
                .order('fecha', { ascending: false })
                .limit(1);
            
            if (currentUser?.sede_id) {
                dateQuery = dateQuery.eq('sede_id', currentUser.sede_id);
            }
            const { data: dateData } = await dateQuery;

            if (dateData && dateData.length > 0) {
                const lastDate = dateData[0].fecha;
                let prevDiffQuery = supabase
                    .from('historial_diferencias')
                    .select('codigo, diferencia')
                    .eq('fecha', lastDate);
                
                if (currentUser?.sede_id) {
                    prevDiffQuery = prevDiffQuery.eq('sede_id', currentUser.sede_id);
                }
                const { data: prevDiffs } = await prevDiffQuery;
                if (prevDiffs) {
                    const mappedLastDiffs: Record<string, number> = {};
                    prevDiffs.forEach(item => {
                        mappedLastDiffs[item.codigo] = item.diferencia;
                    });
                    setLastDifferences(mappedLastDiffs);
                }
            } else {
                setLastDifferences({});
            }
        } catch (error) {
            console.error("Error loading conciliation data:", error);
        } finally {
            setIsLoading(false);
        }
    };

    const handleDownloadTemplateWithExamples = () => {
        const examples = [
            { 'codigo': 'PNT001', 'stock_dia': 50, 'costo': 12.50, 'movimiento': -5 },
            { 'codigo': 'PNT002', 'stock_dia': 80, 'costo': 8.00, 'movimiento': 10 },
            { 'codigo': 'PNT003', 'stock_dia': 120, 'costo': 15.00, 'movimiento': 0 },
            { 'codigo': 'PNT004', 'stock_dia': 45, 'costo': 24.50, 'movimiento': '' },
            { 'codigo': 'PNT005', 'stock_dia': 200, 'costo': 3.50, 'movimiento': -12 }
        ];

        const ws = XLSX.utils.json_to_sheet(examples);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, "Plantilla_Inventario");
        XLSX.writeFile(wb, "plantilla_stock_sistema_con_movimiento.xlsx");
    };

    const handleDrag = (e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
        if (e.type === "dragenter" || e.type === "dragover") {
            setDragActive(true);
        } else if (e.type === "dragleave") {
            setDragActive(false);
        }
    };

    const handleDrop = async (e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
        setDragActive(false);
        if (e.dataTransfer.files && e.dataTransfer.files[0]) {
            await processFile(e.dataTransfer.files[0]);
        }
    };

    const processFile = async (file: File) => {
        setIsLoading(true);
        const reader = new FileReader();
        reader.onload = async (evt) => {
            try {
                const bstr = evt.target?.result;
                const wb = XLSX.read(bstr, { type: 'binary' });
                const wsname = wb.SheetNames[0];
                const ws = wb.Sheets[wsname];
                const data = XLSX.utils.sheet_to_json(ws) as any[];

                const mapped: SystemStock[] = data.map(row => {
                    const codigo = String(row.codigo || row.Codigo || row.CODE || '').trim();
                    const cantidad = parseFloat(row.cantidad || row.Cantidad || row.stock_dia || row.Stock || row.QTY || row.stock_sistema || '0');
                    const costo = parseFloat(row.costo || row.Costo || 0);
                    
                    let movimiento: number | undefined = undefined;
                    const movRaw = row.movimiento !== undefined ? row.movimiento : row.Movimiento;
                    if (movRaw !== undefined && movRaw !== null && movRaw !== '') {
                        movimiento = parseFloat(movRaw);
                    }

                    return {
                        codigo,
                        cantidad,
                        costo,
                        movimiento,
                        ...(currentUser?.sede_id ? { sede_id: currentUser.sede_id } : {})
                    };
                }).filter(item => item.codigo !== '');

                if (mapped.length === 0) {
                    throw new Error("No se encontraron registros válidos en el archivo. Las columnas requeridas son 'codigo' y 'stock_dia'.");
                }

                // Clear old system stock
                let delQuery = supabase.from('stock_sistema').delete();
                if (currentUser?.sede_id) {
                    delQuery = delQuery.eq('sede_id', currentUser.sede_id);
                }
                await delQuery.neq('codigo', '_EMPTY_');
                
                // Resilient insertion
                const { error } = await supabase.from('stock_sistema').insert(mapped);
                if (error) {
                    console.warn("DB insert error with 'movimiento' column, trying fallback without it:", error);
                    const fallbackMapped = mapped.map(({ movimiento, ...rest }) => rest);
                    const { error: fallbackError } = await supabase.from('stock_sistema').insert(fallbackMapped);
                    if (fallbackError) throw fallbackError;

                    setSystemStock(mapped);
                    setSuccessMsg("Stock guardado. (Nota: los movimientos se muestran en pantalla, para guardarlos permanentemente configure la columna 'movimiento' numeric en su BD).");
                } else {
                    setSystemStock(mapped);
                    setSuccessMsg("Stock del sistema cargado y guardado correctamente.");
                }

                setShowUploadModal(false);
                setTimeout(() => setSuccessMsg(null), 5000);
            } catch (err: any) {
                alert("Error al procesar archivo: " + err.message);
            } finally {
                setIsLoading(false);
            }
        };
        reader.readAsBinaryString(file);
    };

    const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        await processFile(file);
    };

    const [showConfirmModal, setShowConfirmModal] = useState(false);
    const [errorMsg, setErrorMsg] = useState<string | null>(null);

    const handleProcessDifferences = async () => {
        if (allData.length === 0) return;
        
        setIsProcessing(true);
        setErrorMsg(null);
        setSuccessMsg(null);
        setShowConfirmModal(false);

        try {
            const today = new Date().toISOString().split('T')[0];
            const historyRecords = allData
                .filter(item => item.systemQty > 0 || item.countedQty > 0 || item.diff !== 0)
                .map(item => ({
                    fecha: today,
                    codigo: item.codigo,
                    nombre: item.nombre,
                    stock_sistema: item.systemQty,
                    conteo_fisico: item.countedQty,
                    diferencia: item.diff,
                    procesado_por: currentUser?.nombre || 'Admin', // Use authenticated user
                    fecha_procesado: new Date().toISOString(),
                    ...(currentUser?.sede_id ? { sede_id: currentUser.sede_id } : {})
                }));

            if (historyRecords.length > 0) {
                // Delete existing records for today (and today's sede_id if configured) to prevent duplicates upon re-submission
                let deleteQuery = supabase
                    .from('historial_diferencias')
                    .delete()
                    .eq('fecha', today);
                
                if (currentUser?.sede_id) {
                    deleteQuery = deleteQuery.eq('sede_id', currentUser.sede_id);
                }
                const { error: deleteErr } = await deleteQuery;
                if (deleteErr) console.warn("Could not delete old records before inserting new differences:", deleteErr);

                const { error } = await supabase.from('historial_diferencias').insert(historyRecords);
                if (error) throw error;
            }

            setSuccessMsg("Diferencias procesadas y guardadas en el historial.");
            setTimeout(() => setSuccessMsg(null), 5000);
        } catch (err: any) {
            console.error("Error processing differences:", err);
            setErrorMsg("Error al procesar diferencias: " + err.message);
        } finally {
            setIsProcessing(false);
        }
    };

    // Group counts by product code
    const groupedCounts = dailyCounts.reduce((acc, curr) => {
        acc[curr.codigo] = (acc[curr.codigo] || 0) + curr.cantidad;
        return acc;
    }, {} as Record<string, number>);

    // Merge everything
    const getConciliationData = () => {
        const allCodes = new Set([
            ...systemStock.map(s => s.codigo),
            ...Object.keys(groupedCounts)
        ]);

        return Array.from(allCodes).map(code => {
            const sys = systemStock.find(s => s.codigo === code);
            const counted = groupedCounts[code] || 0;
            const product = catalog.find(p => p.codigo === code);
            
            const systemQty = sys ? sys.cantidad : 0;
            const diff = counted - systemQty;
            const needsRecount = Math.abs(diff) > 5;

            return {
                codigo: code,
                nombre: product?.nombre || 'N/A',
                categoria: product?.categoria || 'N/A',
                marca: product?.marca || 'N/A',
                zona: product?.zona_predeterminada || 'SECO',
                systemQty,
                countedQty: counted,
                movimiento: sys ? sys.movimiento : undefined,
                diff,
                lastDiff: lastDifferences[code],
                needsRecount,
                status: counted > 0 ? 'Contado' : 'Pendiente'
            };
        }).sort((a, b) => Math.abs(b.diff) - Math.abs(a.diff));
    };

    const allData = getConciliationData();

    const filteredData = allData.filter(item => 
        item.codigo.toLowerCase().includes(searchTerm.toLowerCase()) ||
        item.nombre.toLowerCase().includes(searchTerm.toLowerCase())
    );

    const calculateERI = (zona: string) => {
        const itemsInZone = allData.filter(item => item.zona === zona);
        if (itemsInZone.length === 0) return 0;
        const exactMatches = itemsInZone.filter(item => item.diff === 0).length;
        return (exactMatches / itemsInZone.length) * 100;
    };

    const formatNumber = (num: number) => {
        return Number(num.toFixed(2));
    };

    const getTrendBadgeConciliation = (item: any) => {
        const diffToday = item.diff;
        const diffPrev = item.lastDiff;
        
        if (diffPrev === undefined) {
            if (diffToday !== 0) {
                return (
                    <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[9px] font-black uppercase bg-red-50 text-red-650 border border-red-200">
                        🚨 Nueva Dif.
                    </span>
                );
            }
            return <span className="text-slate-400 text-[10px] font-bold">-</span>;
        }
        
        if (diffToday === 0) {
            if (diffPrev !== 0) {
                return (
                    <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[9px] font-black uppercase bg-emerald-100 text-emerald-800 border border-emerald-200">
                        🟢 Subsanado
                    </span>
                );
            }
            return <span className="text-slate-400 text-[10px] font-bold">-</span>;
        }
        
        if (diffToday === diffPrev) {
            return (
                <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[9px] font-[900] uppercase bg-amber-100 text-amber-805 border border-amber-200 shadow-xs">
                    ⚠️ Persistente
                </span>
            );
        }
        
        const diffTodayAbs = Math.abs(diffToday);
        const diffPrevAbs = Math.abs(diffPrev);
        
        if (diffTodayAbs < diffPrevAbs) {
            return (
                <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[9px] font-black uppercase bg-blue-100 text-blue-700 border border-blue-200">
                    📉 Reduciendo
                </span>
            );
        } else {
            return (
                <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[9px] font-black uppercase bg-rose-105 text-rose-800 border border-rose-200">
                    📈 Creciendo
                </span>
            );
        }
    };

    const exportToExcel = () => {
        const data = filteredData.map(item => ({
            'Código': item.codigo,
            'Producto': item.nombre,
            'Categoría': item.categoria,
            'Marca': item.marca,
            'Movimiento Reciente': item.movimiento !== undefined ? item.movimiento : '',
            'Stock Sistema': item.systemQty,
            'Conteo Día': item.countedQty,
            'Diferencia': item.diff,
            'Estado': item.status,
            'Alerta Reconteo': item.needsRecount ? 'SÍ' : 'NO'
        }));

        const ws = XLSX.utils.json_to_sheet(data);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, "Conciliación");
        XLSX.writeFile(wb, `Conciliacion_${new Date().toISOString().split('T')[0]}.xlsx`);
    };

    return (
        <div className="flex flex-col h-full bg-white dark:bg-slate-900">
            {/* Header */}
            <div className="p-4 border-b dark:border-slate-700 flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                    <h2 className="text-xl font-black text-slate-800 dark:text-white flex items-center gap-2">
                        <RefreshCw className="w-6 h-6 text-blue-600 animate-spin-slow" />
                        CONCILIACIÓN DE STOCK
                    </h2>
                    <p className="text-slate-500 dark:text-slate-400 text-xs font-medium">
                        Compara el stock del sistema con los conteos realizados hoy.
                    </p>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                    {successMsg && (
                        <div className="px-3 py-1.5 bg-emerald-550 border border-emerald-200 text-emerald-800 rounded-lg text-xs font-bold animate-fade-in">
                            {successMsg}
                        </div>
                    )}
                    {errorMsg && (
                        <div className="px-3 py-1.5 bg-red-50 border border-red-200 text-red-700 rounded-lg text-xs font-bold animate-fade-in flex items-center gap-2">
                            <AlertTriangle className="w-3 h-3" />
                            {errorMsg}
                            <button onClick={() => setErrorMsg(null)} className="ml-1 text-slate-400 hover:text-slate-600 font-extrabold text-sm">×</button>
                        </div>
                    )}
                    <button 
                        onClick={() => setShowUploadModal(true)}
                        className="flex items-center gap-1.5 px-3.5 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl cursor-pointer transition-all shadow-md font-bold text-xs"
                    >
                        <Upload className="w-3.5 h-3.5" />
                        Subir Stock Sistema
                    </button>
                    <button 
                        onClick={() => setShowConfirmModal(true)}
                        disabled={allData.length === 0 || isProcessing}
                        className="flex items-center gap-1.5 px-3.5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl transition-all shadow-md font-bold text-xs disabled:opacity-50 cursor-pointer"
                    >
                        <Save className={`w-3.5 h-3.5 ${isProcessing ? 'animate-pulse' : ''}`} />
                        {isProcessing ? 'Procesando...' : 'Procesar Diferencias'}
                    </button>
                    <button 
                        onClick={exportToExcel}
                        disabled={filteredData.length === 0}
                        className="flex items-center gap-1.5 px-3.5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl transition-all shadow-md font-bold text-xs disabled:opacity-50 cursor-pointer"
                    >
                        <Download className="w-3.5 h-3.5" />
                        Exportar Reporte
                    </button>
                    <button 
                        onClick={loadData}
                        className="p-2 bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 rounded-xl hover:bg-slate-200 transition-all cursor-pointer"
                    >
                        <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
                    </button>
                </div>
            </div>

            {/* Custom Drag-and-Drop Stock Upload Modal */}
            {showUploadModal && (
                <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[110] flex items-center justify-center p-4">
                    <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-2xl max-w-lg w-full overflow-hidden border dark:border-slate-700 animate-fade-in">
                        <div className="p-5 border-b dark:border-slate-700 flex items-center justify-between bg-slate-50 dark:bg-slate-800/40">
                            <div className="flex items-center gap-2">
                                <Upload className="w-5 h-5 text-blue-600" />
                                <h3 className="text-base font-black text-slate-800 dark:text-white">Cargar Stock del Sistema</h3>
                            </div>
                            <button 
                                onClick={() => {
                                    setShowUploadModal(false);
                                    setDragActive(false);
                                }}
                                className="p-1.5 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-lg text-slate-400 hover:text-slate-600 transition-all cursor-pointer"
                            >
                                <X className="w-5 h-5" />
                            </button>
                        </div>

                        <div className="p-6 space-y-5">
                            <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-100 dark:border-blue-800/40 p-4 rounded-xl text-xs text-blue-700 dark:text-blue-300 space-y-1.5">
                                <p className="font-bold uppercase tracking-wider text-[10px]">💡 Formato de la Plantilla</p>
                                <p className="leading-relaxed">
                                    El archivo Excel debe contener las columnas <span className="font-extrabold text-blue-900 dark:text-white bg-blue-100 dark:bg-blue-900/50 px-1 py-0.5 rounded">codigo</span> y <span className="font-extrabold text-blue-900 dark:text-white bg-blue-100 dark:bg-blue-900/50 px-1 py-0.5 rounded">stock_dia</span>.
                                </p>
                                <p className="leading-relaxed">
                                    Hemos introducido la columna opcional <span className="font-extrabold text-blue-900 dark:text-white bg-blue-105 dark:bg-blue-905/50 px-1 py-0.5 rounded">movimiento</span> (positivo, negativo, cero o vacío) útil para monitorear la variación física de las unidades desde el último inventario.
                                </p>
                            </div>

                            <div className="flex items-center justify-between gap-4 p-3.5 bg-slate-50 dark:bg-slate-900/40 rounded-xl border border-slate-100 dark:border-slate-700/60">
                                <div className="text-left">
                                    <h4 className="text-xs font-black text-slate-700 dark:text-slate-300 uppercase">Plantilla Oficial necesaria</h4>
                                    <p className="text-[10px] text-slate-400 font-medium">Incluye 5 filas con ejemplos reales de distintos movimientos.</p>
                                </div>
                                <button 
                                    onClick={handleDownloadTemplateWithExamples}
                                    className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-800 hover:bg-slate-900 text-white rounded-lg text-[10px] font-black tracking-wider uppercase transition-all shadow-sm cursor-pointer"
                                >
                                    <Download className="w-3 h-3" />
                                    Descargar XLS
                                </button>
                            </div>

                            {/* Drag and drop upload zone */}
                            <label 
                                onDragEnter={handleDrag}
                                onDragOver={handleDrag}
                                onDragLeave={handleDrag}
                                onDrop={handleDrop}
                                className={`relative flex flex-col items-center justify-center border-2 border-dashed rounded-xl p-8 transition-all duration-200 cursor-pointer text-center group ${
                                    dragActive 
                                        ? 'border-blue-500 bg-blue-50/50 dark:bg-blue-900/10' 
                                        : 'border-slate-200 dark:border-slate-700 hover:border-blue-400 hover:bg-slate-50/50 dark:hover:bg-slate-850'
                                }`}
                            >
                                <input 
                                    type="file" 
                                    accept=".xlsx, .xls" 
                                    className="hidden" 
                                    onChange={handleFileUpload} 
                                />
                                <div className="p-3 bg-blue-50 group-hover:bg-blue-100 transition-all rounded-full mb-3 text-blue-600">
                                    <Upload className="w-6 h-6 animate-pulse" />
                                </div>
                                <p className="text-xs font-black text-slate-700 dark:text-slate-300">
                                    Arrastra tu archivo aquí o <span className="text-blue-600 hover:underline">haz clic para elegir</span>
                                </p>
                                <p className="text-[10px] text-slate-400 mt-1 font-medium">Soporta formatos modificados de Excel (.xlsx, .xls)</p>
                                
                                {isLoading && (
                                    <div className="absolute inset-0 bg-white/95 dark:bg-slate-850/95 flex flex-col items-center justify-center rounded-xl">
                                        <RefreshCw className="w-8 h-8 text-blue-600 animate-spin mb-2" />
                                        <p className="text-xs font-black text-slate-700 dark:text-slate-300">Procesando y cargando archivo...</p>
                                    </div>
                                )}
                            </label>

                            <div className="flex justify-end pt-2 border-t dark:border-slate-700">
                                <button 
                                    onClick={() => {
                                        setShowUploadModal(false);
                                        setDragActive(false);
                                    }}
                                    className="px-4 py-2 bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 text-slate-600 dark:text-slate-300 text-xs font-black rounded-lg uppercase tracking-wider transition-all cursor-pointer"
                                >
                                    Cerrar
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {showConfirmModal && (
                <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
                    <div className="bg-white dark:bg-slate-800 rounded-3xl shadow-2xl max-w-md w-full p-8 border dark:border-slate-700">
                        <div className="w-16 h-16 bg-indigo-100 dark:bg-indigo-900/30 rounded-2xl flex items-center justify-center mb-6 mx-auto">
                            <Save className="w-8 h-8 text-indigo-600" />
                        </div>
                        <h3 className="text-lg font-black text-slate-800 dark:text-white text-center mb-2">¿Procesar Diferencias?</h3>
                        <p className="text-slate-500 dark:text-slate-400 text-xs text-center mb-6 leading-relaxed">
                            Esto guardará el estado actual de las diferencias en el historial permanente. Esta acción no se puede deshacer.
                        </p>
                        <div className="grid grid-cols-2 gap-4">
                            <button 
                                onClick={() => setShowConfirmModal(false)}
                                className="px-5 py-2.5 bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 font-bold text-xs rounded-xl hover:bg-slate-200 transition-all cursor-pointer"
                            >
                                Cancelar
                            </button>
                            <button 
                                onClick={handleProcessDifferences}
                                className="px-5 py-2.5 bg-indigo-600 text-white font-bold text-xs rounded-xl hover:bg-indigo-700 transition-all shadow-md cursor-pointer"
                            >
                                Sí, Procesar
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Compact Stats and ERI Dashboard in ONE tight row */}
            <div className="grid grid-cols-2 md:grid-cols-7 gap-2 px-6 py-2 bg-slate-50 dark:bg-slate-800/10 border-b dark:border-slate-700/80">
                <div className="bg-white dark:bg-slate-800 p-2.5 rounded-xl border border-slate-100 dark:border-slate-700 flex flex-col justify-center">
                    <div className="text-[9px] font-black text-slate-400 uppercase tracking-wider leading-tight">Items Sistema</div>
                    <div className="text-sm font-black text-blue-600 mt-0.5">{systemStock.length}</div>
                </div>
                <div className="bg-white dark:bg-slate-800 p-2.5 rounded-xl border border-slate-100 dark:border-slate-700 flex flex-col justify-center">
                    <div className="text-[9px] font-black text-slate-400 uppercase tracking-wider leading-tight">Items Contados</div>
                    <div className="text-sm font-black text-emerald-600 mt-0.5">{Object.keys(groupedCounts).length}</div>
                </div>
                <div className="bg-white dark:bg-slate-800 p-2.5 rounded-xl border border-slate-100 dark:border-slate-700 flex flex-col justify-center">
                    <div className="text-[9px] font-black text-slate-400 uppercase tracking-wider leading-tight">Dif. Críticas</div>
                    <div className="text-sm font-black text-red-600 mt-0.5">{allData.filter(i => i.needsRecount).length}</div>
                </div>
                <div className="bg-white dark:bg-slate-800 p-2.5 rounded-xl border border-slate-100 dark:border-slate-700 flex flex-col justify-center">
                    <div className="text-[9px] font-black text-slate-400 uppercase tracking-wider leading-tight">Pendientes</div>
                    <div className="text-sm font-black text-orange-600 mt-0.5">{allData.filter(i => i.countedQty === 0).length}</div>
                </div>
                {/* Accuracy percentages - ERI */}
                <div className="bg-white dark:bg-slate-800 p-2 rounded-xl border border-slate-100 dark:border-slate-700 flex items-center justify-between">
                    <div>
                        <div className="text-[8px] font-black text-slate-450 uppercase tracking-tight leading-tight">ERI SECO</div>
                        <div className="text-xs font-black text-slate-800 dark:text-white">{calculateERI('SECO').toFixed(1)}%</div>
                    </div>
                    <div className="w-6 h-6 rounded-full border-2 border-blue-100 dark:border-slate-700 flex items-center justify-center text-[8px] font-black text-blue-600">
                        {calculateERI('SECO').toFixed(0)}
                    </div>
                </div>
                <div className="bg-white dark:bg-slate-800 p-2 rounded-xl border border-slate-100 dark:border-slate-700 flex items-center justify-between">
                    <div>
                        <div className="text-[8px] font-black text-slate-450 uppercase tracking-tight leading-tight">ERI REFRIG.</div>
                        <div className="text-xs font-black text-slate-800 dark:text-white">{calculateERI('REFRIGERADO').toFixed(1)}%</div>
                    </div>
                    <div className="w-6 h-6 rounded-full border-2 border-emerald-100 dark:border-slate-700 flex items-center justify-center text-[8px] font-black text-emerald-600">
                        {calculateERI('REFRIGERADO').toFixed(0)}
                    </div>
                </div>
                <div className="bg-white dark:bg-slate-800 p-2 rounded-xl border border-slate-100 dark:border-slate-700 flex items-center justify-between">
                    <div>
                        <div className="text-[8px] font-black text-slate-450 uppercase tracking-tight leading-tight">ERI CONG.</div>
                        <div className="text-xs font-black text-slate-800 dark:text-white">{calculateERI('CONGELADO').toFixed(1)}%</div>
                    </div>
                    <div className="w-6 h-6 rounded-full border-2 border-indigo-100 dark:border-slate-700 flex items-center justify-center text-[8px] font-black text-indigo-600">
                        {calculateERI('CONGELADO').toFixed(0)}
                    </div>
                </div>
            </div>

            {/* Search */}
            <div className="px-6 py-3 border-b dark:border-slate-700 bg-slate-50/30">
                <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                    <input 
                        type="text"
                        placeholder="Buscar por código o nombre..."
                        className="w-full pl-9 pr-4 py-2 bg-white dark:bg-slate-800 border border-slate-250 dark:border-slate-700 rounded-xl text-slate-800 dark:text-white text-xs font-medium focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
                        value={searchTerm}
                        onChange={e => setSearchTerm(e.target.value)}
                    />
                </div>
            </div>

            {/* Table */}
            <div className="flex-1 overflow-auto p-4 bg-slate-50/50">
                <div className="bg-white dark:bg-slate-800 rounded-xl shadow border dark:border-slate-700 overflow-hidden">
                    <table className="w-full text-left border-collapse">
                        <thead>
                            <tr className="bg-slate-50 dark:bg-slate-700/50 border-b dark:border-slate-700 font-bold">
                                <th className="p-3 text-[10px] font-black text-slate-400 uppercase tracking-wider">Producto</th>
                                <th className="p-3 text-[10px] font-black text-slate-400 uppercase tracking-wider text-center">Stock Sistema</th>
                                <th className="p-3 text-[10px] font-black text-slate-400 uppercase tracking-wider text-center">Mov. Reciente</th>
                                <th className="p-3 text-[10px] font-black text-slate-400 uppercase tracking-wider text-center">Conteo Hoy</th>
                                <th className="p-3 text-[10px] font-black text-slate-400 uppercase tracking-wider text-center">Diferencia Hoy</th>
                                <th className="p-3 text-[10px] font-black text-slate-400 uppercase tracking-wider text-center">Dif. Anterior</th>
                                <th className="p-3 text-[10px] font-black text-slate-400 uppercase tracking-wider text-center">Tendencia vs Ayer</th>
                                <th className="p-3 text-[10px] font-black text-slate-400 uppercase tracking-wider text-center">Estado</th>
                                <th className="p-3 text-[10px] font-black text-slate-400 uppercase tracking-wider text-center">Alerta</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y dark:divide-slate-700">
                            {filteredData.length === 0 ? (
                                <tr>
                                    <td colSpan={9} className="p-12 text-center text-slate-400 font-medium italic text-xs">
                                        No hay datos para mostrar. Sube el stock del sistema para comenzar.
                                    </td>
                                </tr>
                            ) : (
                                filteredData.map((item, idx) => (
                                    <tr key={idx} className="hover:bg-slate-50/80 dark:hover:bg-slate-700/30 transition-colors text-xs">
                                        <td className="p-3">
                                            <div className="font-extrabold text-slate-800 dark:text-white text-xs">{item.nombre}</div>
                                            <div className="text-[10px] font-bold text-slate-400 flex items-center gap-2 mt-0.5">
                                                <span className="bg-slate-100 dark:bg-slate-700 px-1.5 py-0.5 rounded text-[9px] font-mono tracking-tight">{item.codigo}</span>
                                                <span className="bg-slate-50 dark:bg-slate-800 px-1 py-0.5 rounded text-[9px]">{item.zona}</span>
                                                <span>•</span>
                                                <span>{item.categoria}</span>
                                                <span>•</span>
                                                <span>{item.marca}</span>
                                            </div>
                                        </td>
                                        <td className="p-3 text-center font-bold text-slate-600 dark:text-slate-300">
                                            {formatNumber(item.systemQty)}
                                        </td>
                                        <td className="p-3 text-center font-bold">
                                            {item.movimiento !== undefined && item.movimiento !== null ? (
                                                <span className={`px-2 py-0.5 rounded-lg text-[10px] font-black tracking-tight ${
                                                    item.movimiento > 0 
                                                        ? 'bg-emerald-50 text-emerald-600 border border-emerald-200' 
                                                        : item.movimiento < 0 
                                                            ? 'bg-rose-50 text-rose-600 border border-rose-200' 
                                                            : 'bg-slate-100 text-slate-500 border border-slate-200'
                                                }`}>
                                                    {item.movimiento > 0 ? `+${item.movimiento}` : item.movimiento}
                                                </span>
                                            ) : (
                                                <span className="text-slate-400 text-[9px] font-bold bg-slate-50 dark:bg-slate-900 border border-slate-100/30 px-1.5 py-0.5 rounded" title="Este producto no ha registrado movimientos recientes">
                                                    0 (Estable)
                                                </span>
                                            )}
                                        </td>
                                        <td className="p-3 text-center">
                                            <span className={`px-2 py-1 rounded-lg font-black text-xs ${item.countedQty > 0 ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-400' : 'bg-slate-100 text-slate-455 dark:bg-slate-700 dark:text-slate-500'}`}>
                                                {formatNumber(item.countedQty)}
                                            </span>
                                        </td>
                                        <td className={`p-3 text-center font-extrabold ${item.diff === 0 ? 'text-emerald-600 font-extrabold' : (item.diff > 0 ? 'text-blue-600' : 'text-red-600')}`}>
                                            {item.diff > 0 ? `+${formatNumber(item.diff)}` : formatNumber(item.diff)}
                                        </td>
                                        <td className={`p-3 text-center font-bold ${item.lastDiff === undefined ? 'text-slate-450 dark:text-slate-600' : item.lastDiff === 0 ? 'text-emerald-500' : (item.lastDiff > 0 ? 'text-blue-550' : 'text-red-550')}`}>
                                            {item.lastDiff !== undefined ? (item.lastDiff > 0 ? `+${formatNumber(item.lastDiff)}` : formatNumber(item.lastDiff)) : '---'}
                                        </td>
                                        <td className="p-3 text-center whitespace-nowrap">
                                            {getTrendBadgeConciliation(item)}
                                        </td>
                                        <td className="p-3 text-center">
                                            {item.status === 'Contado' ? (
                                                <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-400 rounded-full text-[9px] font-black uppercase">
                                                    <CheckCircle className="w-2.5 h-2.5" />
                                                    Contado
                                                </span>
                                            ) : (
                                                <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-orange-100 text-orange-700 dark:bg-orange-500/20 dark:text-orange-400 rounded-full text-[9px] font-black uppercase">
                                                    <AlertTriangle className="w-2.5 h-2.5" />
                                                    Pendiente
                                                </span>
                                            )}
                                        </td>
                                        <td className="p-3 text-center">
                                            {item.needsRecount ? (
                                                <div className="flex flex-col items-center gap-0.5">
                                                    <span className="px-2 py-0.5 bg-red-650 text-white bg-red-600 rounded text-[8px] font-black animate-pulse tracking-wide">
                                                        RECONTEO
                                                    </span>
                                                    <span className="text-[8px] text-red-500 font-extrabold uppercase">Dif. {formatNumber(item.diff)}</span>
                                                </div>
                                            ) : (
                                                <span className="text-slate-300 dark:text-slate-600">---</span>
                                            )}
                                        </td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
};

export default Conciliation;

