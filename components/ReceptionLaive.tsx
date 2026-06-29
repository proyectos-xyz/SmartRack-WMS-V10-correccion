
import React, { useState, useEffect, useRef } from 'react';
import { supabase } from '../supabaseClient';
import { Product, Usuario } from '../types';
import { Search, CheckCircle, Package, RefreshCw, Check, X, ClipboardList, Scan, Keyboard } from './Icons';
import { formatCompactDate } from '../utils';
import { motion, AnimatePresence } from 'motion/react';

interface ReceptionLaiveProps {
    currentUser: Usuario | null;
    catalog: Product[];
}

const ReceptionLaive: React.FC<ReceptionLaiveProps> = ({ currentUser, catalog }) => {
    const [pendingItems, setPendingItems] = useState<any[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const [searchTerm, setSearchTerm] = useState('');
    const [matchedItem, setMatchedItem] = useState<any | null>(null);
    const [scannedItems, setScannedItems] = useState<any[]>([]);
    const [observations, setObservations] = useState<Record<string, string>>({});
    const [conformity, setConformity] = useState<Record<string, boolean>>({});
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [showToast, setShowToast] = useState(false);
    const [showErrorToast, setShowErrorToast] = useState(false);
    const [scanMode, setScanMode] = useState(true); // Default to scan mode
    
    const searchRef = useRef<HTMLInputElement>(null);
    const scanTimeoutRef = useRef<NodeJS.Timeout | null>(null);

    // Periodically ensure focus if in scan mode
    useEffect(() => {
        if (scanMode) {
            const interval = setInterval(() => {
                if (document.activeElement?.tagName !== 'INPUT' && document.activeElement?.tagName !== 'TEXTAREA') {
                    searchRef.current?.focus();
                }
            }, 2000);
            return () => clearInterval(interval);
        }
    }, [scanMode]);

    useEffect(() => {
        fetchPendingItems();
    }, []);

    const fetchPendingItems = async () => {
        setIsLoading(true);
        try {
            let query = supabase
                .from('recepcion_productos')
                .select('*')
                .eq('proveedor', 'CARGA_XML')
                .eq('estado', 'PENDIENTE_LAIVE');
            
            const sedeId = currentUser?.sede_id;
            if (sedeId) {
                query = query.eq('sede_id', sedeId);
            }

            const { data, error } = await query.order('fecha_registro', { ascending: false });

            if (error) throw error;
            setPendingItems(data || []);
        } catch (err) {
            console.error("Error fetching pending Laive items:", err);
        } finally {
            setIsLoading(false);
        }
    };

    const processSearch = (val: string, isAuto: boolean = false) => {
        const term = val.toLowerCase().trim();
        if (!term) return;

        // Try exact match first
        let match = pendingItems.find(item => {
            const product = catalog.find(p => p.id === item.producto_id);
            return (
                item.codigo.toLowerCase() === term ||
                product?.extranjero?.toLowerCase() === term ||
                product?.sku?.toLowerCase() === term
            );
        });

        // If no exact match and not auto, try broad match
        if (!match && !isAuto) {
            match = pendingItems.find(item => {
                const product = catalog.find(p => p.id === item.producto_id);
                return (
                    item.codigo.toLowerCase().includes(term) ||
                    item.nombre.toLowerCase().includes(term) ||
                    product?.extranjero?.toLowerCase().includes(term) ||
                    product?.sku?.toLowerCase().includes(term)
                );
            });
        }

        if (match) {
            if (!scannedItems.find(si => si.id === match.id)) {
                setScannedItems(prev => [match, ...prev]);
                setConformity(prev => ({ ...prev, [match.id]: true }));
            }
            setMatchedItem(match);
            setSearchTerm('');
            // Focus back immediately
            if (searchRef.current) {
                searchRef.current.focus();
                searchRef.current.value = '';
            }
            return true;
        } else if (!isAuto && val.trim().length > 0) {
            setShowErrorToast(true);
            setTimeout(() => setShowErrorToast(false), 1000);
            setSearchTerm('');
        }
        return false;
    };

    const handleSearch = (e: React.FormEvent) => {
        e.preventDefault();
        if (scanTimeoutRef.current) clearTimeout(scanTimeoutRef.current);
        processSearch(searchTerm, false);
    };

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter') {
            // Some scanners send Enter. We want to process it immediately.
            if (scanTimeoutRef.current) clearTimeout(scanTimeoutRef.current);
            processSearch(searchTerm, false);
        }
    };

    const onSearchChange = (val: string) => {
        setSearchTerm(val);
        const term = val.trim().toLowerCase();
        
        if (scanMode && term.length > 0) {
            // Clear previous timeout
            if (scanTimeoutRef.current) clearTimeout(scanTimeoutRef.current);

            // Check for exact match immediately (for high-speed scanners)
            const exactMatch = pendingItems.find(item => {
                const product = catalog.find(p => p.id === item.producto_id);
                return (
                    item.codigo.toLowerCase() === term ||
                    product?.extranjero?.toLowerCase() === term ||
                    product?.sku?.toLowerCase() === term ||
                    product?.ean_bulto?.toLowerCase() === term
                );
            });

            if (exactMatch) {
                processSearch(val, true);
                return;
            }

            // If no exact match yet, wait briefly for more characters (for slower scanners acting as keyboards)
            scanTimeoutRef.current = setTimeout(() => {
                if (val.trim()) {
                    processSearch(val, false);
                }
            }, 100); // 100ms is usually enough for a scanner to finish sending chars
        } else if (!scanMode && term.length >= 4) {
            const exactMatchExists = pendingItems.some(item => {
                const product = catalog.find(p => p.id === item.producto_id);
                return (
                    item.codigo.toLowerCase() === term ||
                    product?.extranjero?.toLowerCase() === term ||
                    product?.sku?.toLowerCase() === term ||
                    product?.ean_bulto?.toLowerCase() === term
                );
            });
            if (exactMatchExists) {
                processSearch(val, true);
            }
        }
    };

    const handleConformityChange = (id: string, value: boolean) => {
        setConformity(prev => ({ ...prev, [id]: value }));
    };

    const handleFinalize = async () => {
        if (scannedItems.length === 0) return;

        const unconfirmedCount = scannedItems.filter(si => !conformity[si.id]).length;
        if (unconfirmedCount > 0) {
            if (!confirm(`Hay ${unconfirmedCount} productos sin marcar como conformes. ¿Desea continuar?`)) return;
        }

        setIsSubmitting(true);
        try {
            for (const item of scannedItems) {
                const { error } = await supabase
                    .from('recepcion_productos')
                    .update({
                        estado: 'ACTIVO',
                        observaciones: observations[item.id] || null,
                        verificado_por: currentUser?.username || 'OPERARIO',
                        fecha_verificacion: new Date().toISOString()
                    })
                    .eq('id', item.id);
                
                if (error) throw error;
            }

            setShowToast(true);
            setTimeout(() => setShowToast(false), 1000);

            setScannedItems([]);
            setMatchedItem(null);
            setObservations({});
            setConformity({});
            fetchPendingItems();
        } catch (err) {
            console.error("Error finalizing Laive reception:", err);
            alert("Error al finalizar la recepción.");
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <div className="flex flex-col h-full bg-slate-50 overflow-hidden relative">
            <AnimatePresence>
                {showToast && (
                    <motion.div
                        initial={{ opacity: 0, scale: 0.8, y: 20 }}
                        animate={{ opacity: 1, scale: 1, y: 0 }}
                        exit={{ opacity: 0, scale: 0.8, y: -20 }}
                        className="fixed inset-0 flex items-center justify-center z-[100] pointer-events-none"
                    >
                        <div className="bg-emerald-600 text-white px-8 py-4 rounded-2xl shadow-2xl flex items-center gap-3 border border-emerald-400/30 backdrop-blur-md">
                            <Check className="w-5 h-5 stroke-[4]" />
                            <span className="text-xl font-black uppercase tracking-tight italic">Recibido</span>
                        </div>
                    </motion.div>
                )}

                {showErrorToast && (
                    <motion.div
                        initial={{ opacity: 0, scale: 0.8, y: 20 }}
                        animate={{ opacity: 1, scale: 1, y: 0 }}
                        exit={{ opacity: 0, scale: 0.8, y: -20 }}
                        className="fixed inset-0 flex items-center justify-center z-[100] pointer-events-none"
                    >
                        <div className="bg-red-600 text-white px-8 py-4 rounded-2xl shadow-2xl flex items-center gap-3 border border-red-400/30 backdrop-blur-md">
                            <X className="w-5 h-5 stroke-[4]" />
                            <span className="text-xl font-black uppercase tracking-tight italic">No existe</span>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* Header - Modern with Custom Icon */}
            <div className="bg-white border-b border-gray-200 px-4 py-3 shadow-sm z-20 shrink-0">
                <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-3">
                        <div className="w-12 h-12 rounded-xl overflow-hidden shadow-lg border border-indigo-100 bg-white p-1">
                            <img 
                                src="https://i.ibb.co/dJQtnxPT/Anotaci-n-2u.png" 
                                alt="Laive Logo" 
                                className="w-full h-full object-contain"
                                referrerPolicy="no-referrer"
                            />
                        </div>
                        <div>
                            <h2 className="text-base font-black text-slate-800 tracking-tight uppercase italic leading-none">Recepción Laive</h2>
                            <p className="text-[9px] text-indigo-500 font-black uppercase tracking-widest mt-1">Validación Física de Carga</p>
                        </div>
                    </div>

                    <div className="flex items-center gap-2">
                        <div className="bg-emerald-50 px-3 py-1.5 rounded-xl border border-emerald-100 flex flex-col items-center">
                            <span className="text-[7px] font-black text-emerald-600 uppercase tracking-widest leading-none mb-0.5">Pendientes</span>
                            <span className="text-base font-black text-emerald-700 leading-none">{pendingItems.length}</span>
                        </div>
                        <button 
                            onClick={fetchPendingItems}
                            className="p-2.5 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-xl transition-all border border-slate-100 active:scale-90"
                        >
                            <RefreshCw className={`w-5 h-5 ${isLoading ? 'animate-spin' : ''}`}/>
                        </button>
                    </div>
                </div>

                {/* Modern Scanner Input */}
                <form onSubmit={handleSearch} className="mt-4 relative group">
                    <AnimatePresence>
                        {scanMode && (
                            <motion.div 
                                initial={{ opacity: 0 }}
                                animate={{ opacity: 1 }}
                                exit={{ opacity: 0 }}
                                className="absolute -inset-1 bg-gradient-to-r from-blue-600 via-indigo-600 to-indigo-400 rounded-2xl blur opacity-25 group-focus-within:opacity-75 transition-opacity duration-500 animate-pulse"
                            ></motion.div>
                        )}
                    </AnimatePresence>
                    
                    <div className="absolute inset-0 bg-indigo-500/5 blur-xl rounded-2xl group-focus-within:bg-indigo-500/10 transition-all"></div>
                    
                    <div className="absolute left-4 top-1/2 -translate-y-1/2 flex items-center gap-2 z-10">
                        {scanMode ? (
                            <Scan className="w-5 h-5 text-indigo-600 animate-pulse" />
                        ) : (
                            <Keyboard className="w-5 h-5 text-indigo-400" />
                        )}
                    </div>

                    <input 
                        ref={searchRef}
                        type="text" 
                        inputMode={scanMode ? 'none' : 'text'}
                        placeholder={scanMode ? "SISTEMA DE SCANER ACTIVADO..." : "BUSCAR MANUALMENTE..."}
                        className={`relative w-full pl-12 pr-40 py-4 bg-white border-2 rounded-2xl text-base font-black outline-none transition-all shadow-xl placeholder:italic tracking-tight ${
                            scanMode 
                                ? 'border-indigo-600 ring-8 ring-indigo-500/10 focus:border-blue-500 cursor-none' 
                                : 'border-indigo-100 focus:border-indigo-500 focus:ring-8 focus:ring-indigo-500/5'
                        }`}
                        value={searchTerm}
                        onChange={e => onSearchChange(e.target.value)}
                        onKeyDown={handleKeyDown}
                        autoFocus
                    />
                    
                    <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-2">
                        <button 
                            type="button"
                            onClick={() => {
                                setScanMode(!scanMode);
                                searchRef.current?.focus();
                            }}
                            className={`p-2.5 rounded-xl transition-all flex items-center justify-center border-2 ${
                                scanMode 
                                    ? 'bg-white border-indigo-600 text-indigo-600' 
                                    : 'bg-indigo-50 border-transparent text-indigo-400'
                            }`}
                            title={scanMode ? "Cambiar a Teclado" : "Cambiar a Scaner"}
                        >
                            {scanMode ? <Scan className="w-5 h-5" /> : <Keyboard className="w-5 h-5" />}
                        </button>
                        
                        <button 
                            type="submit"
                            className="bg-indigo-600 text-white p-2.5 rounded-xl font-black hover:bg-indigo-700 active:scale-95 shadow-lg shadow-indigo-200 transition-all flex items-center justify-center border-2 border-indigo-700"
                        >
                            <Search className="w-5 h-5" />
                        </button>
                    </div>

                    {/* Scan Line Detail */}
                    {scanMode && (
                        <div className="absolute bottom-0 left-12 right-40 h-[1px] bg-indigo-500/50 overflow-hidden">
                            <motion.div 
                                animate={{ x: ['-100%', '100%'] }}
                                transition={{ duration: 1.5, repeat: Infinity, ease: "linear" }}
                                className="w-1/3 h-full bg-gradient-to-r from-transparent via-blue-400 to-transparent"
                            ></motion.div>
                        </div>
                    )}
                </form>
            </div>

            <div className="flex-1 overflow-hidden p-3 md:p-5 flex flex-col md:flex-row gap-5">
                
                {/* Modern Scanned Display */}
                <div className="md:w-1/3 flex flex-col gap-4 shrink-0">
                    <div className={`bg-white border-2 rounded-3xl p-4 shadow-xl transition-all relative overflow-hidden ${matchedItem ? 'border-indigo-500 ring-4 ring-indigo-500/5' : 'border-slate-100 opacity-80'}`}>
                        {matchedItem && (
                            <div className="absolute -right-6 -top-6 w-24 h-24 bg-indigo-500/5 rounded-full blur-2xl"></div>
                        )}
                        
                        <div className="flex flex-col items-center">
                            {matchedItem ? (
                                <div className="w-full">
                                    <div className="mb-3 pb-3 border-b border-slate-100 flex flex-col gap-1">
                                        <h3 className="text-[12px] font-black text-slate-800 uppercase leading-tight">
                                            {matchedItem.nombre}
                                        </h3>
                                        {(() => {
                                            const prod = catalog.find(p => p.id === matchedItem.producto_id);
                                            return (
                                                <div className="flex items-center justify-between gap-1.5">
                                                    <div className="flex flex-wrap items-center gap-1.5">
                                                        <div className="flex items-center gap-1 bg-indigo-50 px-2 py-0.5 rounded-md border border-indigo-100">
                                                            <span className="text-[8px] font-black text-indigo-400 uppercase tracking-tighter">RTU:</span>
                                                            <span className="text-[10px] font-black text-indigo-700 leading-none">{prod?.unidades_por_caja || 'N/A'}</span>
                                                        </div>
                                                        <div className="flex items-center gap-1 bg-emerald-50 px-2 py-0.5 rounded-md border border-emerald-100">
                                                            <span className="text-[8px] font-black text-emerald-400 uppercase tracking-tighter">UM:</span>
                                                            <span className="text-[10px] font-black text-emerald-700 leading-none">{prod?.unidad_venta || matchedItem.unidad_medida || 'UN'}</span>
                                                        </div>
                                                    </div>

                                                    <button 
                                                        onClick={handleFinalize}
                                                        disabled={isSubmitting || scannedItems.length === 0}
                                                        className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-700 disabled:bg-slate-300 text-white px-3 py-2 rounded-xl text-[10px] font-black shadow-lg shadow-emerald-200 transition-all transform active:scale-95 border-b-2 border-emerald-800 shrink-0"
                                                    >
                                                        {isSubmitting ? <RefreshCw className="w-3 h-3 animate-spin"/> : <CheckCircle className="w-3 h-3"/>}
                                                        RECIBIDO ({scannedItems.length})
                                                    </button>
                                                </div>
                                            )
                                        })()}
                                    </div>

                                    <div className="flex flex-col gap-3">
                                        <div className="bg-indigo-600 text-white p-4 rounded-2xl flex flex-col items-center justify-center shadow-lg transform active:scale-95 transition-transform">
                                            <div className="flex items-baseline gap-2">
                                                <span className="text-4xl font-black tabular-nums leading-none">{matchedItem.cantidad}</span>
                                                <span className="text-xs font-bold uppercase tracking-tight leading-none opacity-80">CAJAS</span>
                                            </div>
                                        </div>
                                        
                                        <div className="grid grid-cols-2 gap-2">
                                            <div className="bg-slate-50 border border-slate-100 p-2.5 rounded-xl text-center">
                                                <span className="text-[8px] font-black text-slate-400 uppercase block mb-1 tracking-widest">Cód. ICO</span>
                                                <span className="text-xs font-black text-slate-800 font-mono tracking-tighter">{matchedItem.codigo}</span>
                                            </div>
                                            <div className="bg-amber-50 border border-amber-100 p-2.5 rounded-xl text-center">
                                                <span className="text-[8px] font-black text-amber-500 uppercase block mb-1 tracking-widest">Vencimiento</span>
                                                <span className="text-xs font-black text-amber-700">{formatCompactDate(matchedItem.fecha_vencimiento)}</span>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            ) : (
                                <div className="py-12 flex flex-col items-center text-slate-300">
                                    <div className="relative mb-6">
                                        <div className="absolute inset-0 bg-slate-200 rounded-full blur-2xl opacity-20 animate-pulse"></div>
                                        <Package className="w-16 h-16" />
                                    </div>
                                    <span className="text-xs font-black uppercase tracking-[0.2em] italic text-slate-400 mb-6">Scan Requerido</span>
                                    
                                    {scannedItems.length > 0 && (
                                        <button 
                                            onClick={handleFinalize}
                                            disabled={isSubmitting}
                                            className="flex items-center gap-3 bg-emerald-600 hover:bg-emerald-700 disabled:bg-slate-300 text-white px-8 py-3 rounded-2xl text-xs font-black shadow-lg shadow-emerald-200 transition-all transform active:scale-95 border-b-4 border-emerald-800"
                                        >
                                            {isSubmitting ? <RefreshCw className="w-4 h-4 animate-spin"/> : <CheckCircle className="w-4 h-4"/>}
                                            FINALIZAR ({scannedItems.length})
                                        </button>
                                    )}
                                </div>
                            )}
                        </div>
                    </div>
                </div>

                {/* Verified History List */}
                <div className="flex-1 flex flex-col bg-white border border-slate-200 rounded-3xl shadow-xl overflow-hidden min-h-0">
                    <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/50 sticky top-0 z-10 backdrop-blur-sm">
                        <div className="flex items-center gap-2">
                            <ClipboardList className="w-5 h-5 text-indigo-500" />
                            <h3 className="text-xs font-black text-slate-600 uppercase tracking-widest">Cola de Verificación</h3>
                        </div>
                        <span className="px-3 py-1 bg-white border border-slate-200 rounded-full text-[10px] font-black text-slate-400 italic">
                            ORDEN DESCENDENTE
                        </span>
                    </div>

                    <div className="flex-1 overflow-auto custom-scrollbar">
                        {scannedItems.length === 0 ? (
                            <div className="h-full flex flex-col items-center justify-center p-10 text-center opacity-40">
                                <span className="text-xs font-black text-slate-300 uppercase tracking-widest italic">Esperando validaciones...</span>
                            </div>
                        ) : (
                            <div className="p-3 space-y-3">
                                {scannedItems.map((item) => (
                                    <div key={item.id} className="bg-white border-2 border-slate-100 rounded-2xl overflow-hidden shadow-sm hover:border-indigo-100 transition-colors">
                                        <div className="p-4">
                                            <div className="flex items-center gap-4 mb-3">
                                                <div className="w-10 h-10 bg-slate-50 rounded-xl flex items-center justify-center shrink-0 shadow-inner">
                                                    <Package className="w-5 h-5 text-slate-400" />
                                                </div>
                                                <div className="flex-1 min-w-0">
                                                    <div className="flex items-center justify-between">
                                                        <h4 className="text-xs font-black text-slate-800 uppercase line-clamp-1">{item.nombre}</h4>
                                                        <div className="flex items-center gap-2 ml-4">
                                                            <button 
                                                                onClick={() => handleConformityChange(item.id, !conformity[item.id])}
                                                                className={`w-8 h-8 rounded-xl flex items-center justify-center transition-all shadow-sm ${conformity[item.id] ? 'bg-emerald-500 text-white' : 'bg-slate-100 text-slate-300'}`}
                                                            >
                                                                <Check className="w-4 h-4" />
                                                            </button>
                                                            <button 
                                                                onClick={() => setScannedItems(prev => prev.filter(si => si.id !== item.id))}
                                                                className="w-8 h-8 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-xl flex items-center justify-center transition-all"
                                                            >
                                                                <X className="w-5 h-5" />
                                                            </button>
                                                        </div>
                                                    </div>
                                                    <div className="flex items-center gap-3 mt-1.5">
                                                        <span className="text-[10px] font-black text-indigo-600 font-mono tracking-tighter">{item.codigo}</span>
                                                        <span className="w-1.5 h-1.5 rounded-full bg-slate-300"></span>
                                                        <span className="text-[10px] font-black text-slate-700 bg-slate-100 px-2 py-0.5 rounded-md leading-none uppercase tracking-tight italic">
                                                            {item.cantidad} CAJAS
                                                        </span>
                                                    </div>
                                                </div>
                                            </div>
                                            <div className="relative group">
                                                <input 
                                                    type="text" 
                                                    placeholder="Añadir nota u observación física..."
                                                    className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold outline-none focus:border-indigo-400 focus:bg-white transition-all group-hover:border-slate-300 shadow-inner italic"
                                                    value={observations[item.id] || ''}
                                                    onChange={(e) => setObservations(prev => ({ ...prev, [item.id]: e.target.value }))}
                                                />
                                            </div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
};

export default ReceptionLaive;
