import React, { useState, useEffect, useRef } from 'react';
import { supabase } from '../supabaseClient';
import { Product, Usuario } from '../types';
import { Search, CheckCircle, Package, RefreshCw, Check, X, ClipboardList, Scan, Keyboard, ArrowRight } from './Icons';
import { formatCompactDate } from '../utils';
import { motion, AnimatePresence } from 'motion/react';

interface ReceptionLaiveProps {
    currentUser: Usuario | null;
    catalog: Product[];
}

const ReceptionLaive: React.FC<ReceptionLaiveProps> = ({ currentUser, catalog }) => {
    const [activeTab, setActiveTab] = useState<'SCAN' | 'PENDING'>('SCAN');
    const [pendingItems, setPendingItems] = useState<any[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const [searchTerm, setSearchTerm] = useState('');
    const [pendingSearchTerm, setPendingSearchTerm] = useState('');
    const [matchedItem, setMatchedItem] = useState<any | null>(null);
    const [scannedItems, setScannedItems] = useState<any[]>([]);
    
    // Matched item validation state
    const [matchesXml, setMatchesXml] = useState(true);
    const [validatedQty, setValidatedQty] = useState<number | ''>('');
    const [notes, setNotes] = useState('');

    const [observations, setObservations] = useState<Record<string, string>>({});
    const [validatedQuantities, setValidatedQuantities] = useState<Record<string, number>>({});
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [showToast, setShowToast] = useState(false);
    const [showErrorToast, setShowErrorToast] = useState(false);
    const [scanMode, setScanMode] = useState(true); // Default to scan mode
    
    const searchRef = useRef<HTMLInputElement>(null);
    const scanTimeoutRef = useRef<NodeJS.Timeout | null>(null);

    // Periodically ensure focus if in scan mode and in SCAN tab
    useEffect(() => {
        if (scanMode && activeTab === 'SCAN') {
            const interval = setInterval(() => {
                if (document.activeElement?.tagName !== 'INPUT' && document.activeElement?.tagName !== 'TEXTAREA') {
                    searchRef.current?.focus();
                }
            }, 2000);
            return () => clearInterval(interval);
        }
    }, [scanMode, activeTab]);

    useEffect(() => {
        fetchPendingItems();
    }, []);

    // Sync input quantity when matched item changes or checkbox toggles
    useEffect(() => {
        if (matchedItem) {
            const xmlQty = Number(matchedItem.cantidad_xml ?? matchedItem.cantidad ?? 0);
            if (matchesXml) {
                setValidatedQty(xmlQty);
            }
        }
    }, [matchedItem, matchesXml]);

    const fetchPendingItems = async () => {
        setIsLoading(true);
        try {
            let query = supabase
                .from('recepcion_productos')
                .select('*')
                .eq('proveedor', 'CARGA_XML')
                .in('estado', ['PENDIENTE_LAIVE', 'PENDIENTE_RECEPCION']);
            
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
            const xmlQty = Number(match.cantidad_xml ?? match.cantidad ?? 0);
            setMatchedItem(match);
            setMatchesXml(true);
            setValidatedQty(xmlQty);
            setNotes('');

            if (!scannedItems.find(si => si.id === match.id)) {
                setScannedItems(prev => [match, ...prev]);
                setValidatedQuantities(prev => ({ ...prev, [match.id]: xmlQty }));
            }
            setSearchTerm('');
            // Focus back immediately
            if (searchRef.current) {
                searchRef.current.focus();
                searchRef.current.value = '';
            }
            return true;
        } else if (!isAuto && val.trim().length > 0) {
            setShowErrorToast(true);
            setTimeout(() => setShowErrorToast(false), 1200);
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
            if (scanTimeoutRef.current) clearTimeout(scanTimeoutRef.current);
            processSearch(searchTerm, false);
        }
    };

    const onSearchChange = (val: string) => {
        setSearchTerm(val);
        const term = val.trim().toLowerCase();
        
        if (scanMode && term.length > 0) {
            if (scanTimeoutRef.current) clearTimeout(scanTimeoutRef.current);

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

            scanTimeoutRef.current = setTimeout(() => {
                if (val.trim()) {
                    processSearch(val, false);
                }
            }, 100);
        } else if (!scanMode && term.length >= 3) {
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

    const handleValidateSingleItem = async () => {
        if (!matchedItem) return;
        const xmlQty = Number(matchedItem.cantidad_xml ?? matchedItem.cantidad ?? 0);
        const finalQty = validatedQty === '' ? xmlQty : Number(validatedQty);

        setIsSubmitting(true);
        try {
            const updatePayload: any = {
                estado: 'ACTIVO',
                cantidad: finalQty,
                cantidad_validada: finalQty,
                cantidad_xml: xmlQty,
                observaciones: notes || null,
                verificado_por: currentUser?.username || 'OPERARIO',
                fecha_verificacion: new Date().toISOString()
            };

            let { error } = await supabase
                .from('recepcion_productos')
                .update(updatePayload)
                .eq('id', matchedItem.id);

            // Fallback if custom columns don't exist in PostgreSQL
            if (error && (error.message?.includes('column') || error.code === 'PGRST204')) {
                const fallbackPayload = {
                    estado: 'ACTIVO',
                    cantidad: finalQty,
                    observaciones: notes || null,
                    verificado_por: currentUser?.username || 'OPERARIO',
                    fecha_verificacion: new Date().toISOString()
                };
                const res = await supabase
                    .from('recepcion_productos')
                    .update(fallbackPayload)
                    .eq('id', matchedItem.id);
                if (res.error) throw res.error;
            } else if (error) {
                throw error;
            }

            setShowToast(true);
            setTimeout(() => setShowToast(false), 1200);

            // Remove from local list & reset form
            setScannedItems(prev => prev.filter(si => si.id !== matchedItem.id));
            setMatchedItem(null);
            setNotes('');
            setValidatedQty('');
            fetchPendingItems();
        } catch (err) {
            console.error("Error validating single Laive item:", err);
            alert("Error al guardar la validación del producto.");
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleFinalizeBatch = async () => {
        if (scannedItems.length === 0) return;

        setIsSubmitting(true);
        try {
            for (const item of scannedItems) {
                const xmlQty = Number(item.cantidad_xml ?? item.cantidad ?? 0);
                const finalQty = validatedQuantities[item.id] ?? xmlQty;

                const updatePayload: any = {
                    estado: 'ACTIVO',
                    cantidad: finalQty,
                    cantidad_validada: finalQty,
                    cantidad_xml: xmlQty,
                    observaciones: observations[item.id] || null,
                    verificado_por: currentUser?.username || 'OPERARIO',
                    fecha_verificacion: new Date().toISOString()
                };

                let { error } = await supabase
                    .from('recepcion_productos')
                    .update(updatePayload)
                    .eq('id', item.id);

                if (error && (error.message?.includes('column') || error.code === 'PGRST204')) {
                    const fallbackPayload = {
                        estado: 'ACTIVO',
                        cantidad: finalQty,
                        observaciones: observations[item.id] || null,
                        verificado_por: currentUser?.username || 'OPERARIO',
                        fecha_verificacion: new Date().toISOString()
                    };
                    const res = await supabase
                        .from('recepcion_productos')
                        .update(fallbackPayload)
                        .eq('id', item.id);
                    if (res.error) throw res.error;
                } else if (error) {
                    throw error;
                }
            }

            setShowToast(true);
            setTimeout(() => setShowToast(false), 1200);

            setScannedItems([]);
            setMatchedItem(null);
            setObservations({});
            setValidatedQuantities({});
            fetchPendingItems();
        } catch (err) {
            console.error("Error finalizing Laive reception batch:", err);
            alert("Error al finalizar la recepción.");
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleSelectPendingItemForScan = (item: any) => {
        setMatchedItem(item);
        const xmlQty = Number(item.cantidad_xml ?? item.cantidad ?? 0);
        setMatchesXml(true);
        setValidatedQty(xmlQty);
        setNotes('');
        setActiveTab('SCAN');
        if (!scannedItems.find(si => si.id === item.id)) {
            setScannedItems(prev => [item, ...prev]);
            setValidatedQuantities(prev => ({ ...prev, [item.id]: xmlQty }));
        }
    };

    const filteredPendingItems = pendingItems.filter(item => {
        const term = pendingSearchTerm.toLowerCase().trim();
        if (!term) return true;
        const prod = catalog.find(p => p.id === item.producto_id);
        return (
            item.codigo.toLowerCase().includes(term) ||
            item.nombre.toLowerCase().includes(term) ||
            (prod?.sku && prod.sku.toLowerCase().includes(term)) ||
            (prod?.extranjero && prod.extranjero.toLowerCase().includes(term))
        );
    });

    const totalPendingBoxes = pendingItems.reduce((sum, item) => sum + Number(item.cantidad_xml ?? item.cantidad ?? 0), 0);

    return (
        <div className="flex flex-col h-full bg-slate-100 overflow-hidden relative select-none">
            <AnimatePresence>
                {showToast && (
                    <motion.div
                        initial={{ opacity: 0, scale: 0.8, y: 20 }}
                        animate={{ opacity: 1, scale: 1, y: 0 }}
                        exit={{ opacity: 0, scale: 0.8, y: -20 }}
                        className="fixed inset-0 flex items-center justify-center z-[100] pointer-events-none px-4"
                    >
                        <div className="bg-emerald-600 text-white px-6 py-3.5 rounded-2xl shadow-2xl flex items-center gap-3 border border-emerald-400/30 backdrop-blur-md">
                            <Check className="w-5 h-5 stroke-[4]" />
                            <span className="text-base font-black uppercase tracking-tight italic">Validado y Recibido</span>
                        </div>
                    </motion.div>
                )}

                {showErrorToast && (
                    <motion.div
                        initial={{ opacity: 0, scale: 0.8, y: 20 }}
                        animate={{ opacity: 1, scale: 1, y: 0 }}
                        exit={{ opacity: 0, scale: 0.8, y: -20 }}
                        className="fixed inset-0 flex items-center justify-center z-[100] pointer-events-none px-4"
                    >
                        <div className="bg-red-600 text-white px-6 py-3.5 rounded-2xl shadow-2xl flex items-center gap-3 border border-red-400/30 backdrop-blur-md">
                            <X className="w-5 h-5 stroke-[4]" />
                            <span className="text-base font-black uppercase tracking-tight italic">Producto No Encontrado</span>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* Mobile-Optimized App Bar Header */}
            <div className="bg-white border-b border-slate-200 px-3 py-2.5 shadow-sm z-20 shrink-0">
                <div className="flex items-center justify-between gap-2 mb-2">
                    <div className="flex items-center gap-2.5 min-w-0">
                        <div className="w-9 h-9 rounded-xl overflow-hidden shadow-sm border border-indigo-100 bg-white p-0.5 shrink-0">
                            <img 
                                src="https://i.ibb.co/dJQtnxPT/Anotaci-n-2u.png" 
                                alt="Laive Logo" 
                                className="w-full h-full object-contain"
                                referrerPolicy="no-referrer"
                            />
                        </div>
                        <div className="min-w-0">
                            <h2 className="text-sm font-black text-slate-800 tracking-tight uppercase italic leading-none truncate">
                                Recepción Laive
                            </h2>
                            <p className="text-[8px] text-indigo-600 font-extrabold uppercase tracking-wider mt-0.5 truncate">
                                Validación Carga XML
                            </p>
                        </div>
                    </div>

                    <div className="flex items-center gap-1.5 shrink-0">
                        <div className="bg-indigo-50 px-2.5 py-1 rounded-lg border border-indigo-100 flex flex-col items-center">
                            <span className="text-[7px] font-black text-indigo-400 uppercase leading-none">Pendientes</span>
                            <span className="text-xs font-black text-indigo-700 leading-none mt-0.5">{pendingItems.length}</span>
                        </div>
                        <button 
                            onClick={fetchPendingItems}
                            className="p-2 text-slate-500 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-all border border-slate-100 active:scale-90"
                            title="Actualizar"
                        >
                            <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`}/>
                        </button>
                    </div>
                </div>

                {/* Native Segmented Control Tabs */}
                <div className="grid grid-cols-2 gap-1 bg-slate-100 p-1 rounded-xl border border-slate-200">
                    <button
                        type="button"
                        onClick={() => setActiveTab('SCAN')}
                        className={`py-2 px-2 rounded-lg font-black text-[11px] uppercase tracking-wider transition-all flex items-center justify-center gap-1.5 active:scale-95 ${
                            activeTab === 'SCAN' 
                                ? 'bg-indigo-600 text-white shadow-md' 
                                : 'text-slate-500 hover:text-slate-800'
                        }`}
                    >
                        <Scan className="w-3.5 h-3.5 shrink-0" />
                        <span className="truncate">Escanear</span>
                    </button>

                    <button
                        type="button"
                        onClick={() => setActiveTab('PENDING')}
                        className={`py-2 px-2 rounded-lg font-black text-[11px] uppercase tracking-wider transition-all flex items-center justify-center gap-1.5 active:scale-95 ${
                            activeTab === 'PENDING' 
                                ? 'bg-amber-500 text-white shadow-md' 
                                : 'text-slate-500 hover:text-slate-800'
                        }`}
                    >
                        <ClipboardList className="w-3.5 h-3.5 shrink-0" />
                        <span className="truncate">Pendientes ({pendingItems.length})</span>
                    </button>
                </div>
            </div>

            {/* TAB CONTENT AREA */}
            {activeTab === 'SCAN' ? (
                <div className="flex-1 overflow-y-auto p-3 flex flex-col gap-3 custom-scrollbar">
                    {/* Floating Scanner Barcode Input */}
                    <form onSubmit={handleSearch} className="relative shrink-0">
                        <div className="relative flex items-center">
                            <div className="absolute left-3 flex items-center gap-1 z-10">
                                {scanMode ? (
                                    <Scan className="w-4 h-4 text-indigo-600 animate-pulse" />
                                ) : (
                                    <Keyboard className="w-4 h-4 text-slate-400" />
                                )}
                            </div>

                            <input 
                                ref={searchRef}
                                type="text" 
                                inputMode={scanMode ? 'none' : 'text'}
                                placeholder={scanMode ? "ESCANEAR BARRA O CÓDIGO ICO..." : "CÓDIGO ICO O DESCRIPCIÓN..."}
                                className={`w-full pl-9 pr-24 py-3 bg-white border-2 rounded-xl text-xs font-black outline-none transition-all shadow-sm placeholder:text-slate-400 uppercase tracking-tight ${
                                    scanMode 
                                        ? 'border-indigo-600 ring-2 ring-indigo-500/10' 
                                        : 'border-slate-300 focus:border-indigo-500'
                                }`}
                                value={searchTerm}
                                onChange={e => onSearchChange(e.target.value)}
                                onKeyDown={handleKeyDown}
                                autoFocus
                            />

                            <div className="absolute right-1.5 flex items-center gap-1">
                                <button 
                                    type="button"
                                    onClick={() => {
                                        setScanMode(!scanMode);
                                        searchRef.current?.focus();
                                    }}
                                    className={`p-1.5 rounded-lg border text-[10px] font-black transition-all ${
                                        scanMode 
                                            ? 'bg-indigo-50 border-indigo-300 text-indigo-700' 
                                            : 'bg-slate-100 border-slate-200 text-slate-600'
                                    }`}
                                >
                                    {scanMode ? 'SCAN' : 'KEY'}
                                </button>
                                
                                <button 
                                    type="submit"
                                    className="bg-indigo-600 text-white p-1.5 rounded-lg font-black hover:bg-indigo-700 active:scale-90 shadow transition-all"
                                >
                                    <Search className="w-4 h-4" />
                                </button>
                            </div>
                        </div>
                    </form>

                    {/* App-like Matched Product Card */}
                    {matchedItem ? (
                        <div className="bg-white border-2 border-indigo-600 rounded-2xl p-4 shadow-lg flex flex-col gap-3 relative">
                            <div className="flex items-start justify-between border-b border-slate-100 pb-2.5">
                                <div className="min-w-0 flex-1 pr-2">
                                    <span className="text-[8px] font-black text-indigo-600 uppercase tracking-widest bg-indigo-50 px-2 py-0.5 rounded-md border border-indigo-100 inline-block mb-1">
                                        Producto Seleccionado
                                    </span>
                                    <h3 className="text-xs font-black text-slate-800 uppercase leading-snug">
                                        {matchedItem.nombre}
                                    </h3>
                                </div>
                                <button 
                                    onClick={() => setMatchedItem(null)}
                                    className="text-slate-400 hover:text-slate-600 p-1.5 rounded-lg hover:bg-slate-100 shrink-0"
                                >
                                    <X className="w-5 h-5" />
                                </button>
                            </div>

                            {/* Product Metadata Badge Row */}
                            <div className="grid grid-cols-3 gap-2">
                                <div className="bg-slate-50 border border-slate-200 p-2 rounded-xl text-center">
                                    <span className="text-[7px] font-black text-slate-400 uppercase block leading-none mb-0.5">Código ICO</span>
                                    <span className="text-xs font-black text-slate-800 font-mono tracking-tight">{matchedItem.codigo}</span>
                                </div>

                                <div className="bg-indigo-50 border border-indigo-100 p-2 rounded-xl text-center">
                                    <span className="text-[7px] font-black text-indigo-500 uppercase block leading-none mb-0.5">Cant. XML</span>
                                    <span className="text-xs font-black text-indigo-700 font-mono">
                                        {matchedItem.cantidad_xml ?? matchedItem.cantidad} CAJAS
                                    </span>
                                </div>

                                <div className="bg-amber-50 border border-amber-100 p-2 rounded-xl text-center">
                                    <span className="text-[7px] font-black text-amber-600 uppercase block leading-none mb-0.5">Vencimiento</span>
                                    <span className="text-[10px] font-black text-amber-800 font-mono">
                                        {formatCompactDate(matchedItem.fecha_vencimiento)}
                                    </span>
                                </div>
                            </div>

                            {/* Mobile Physical Validation Section */}
                            <div className="bg-slate-50 border border-slate-200 p-3 rounded-xl space-y-3">
                                <div className="flex items-center justify-between">
                                    <span className="text-[11px] font-black text-slate-700 uppercase flex items-center gap-1.5">
                                        <CheckCircle className="w-3.5 h-3.5 text-indigo-600" />
                                        <span>Validación Física</span>
                                    </span>

                                    <label className="flex items-center gap-1.5 cursor-pointer bg-white px-2.5 py-1 rounded-lg border border-slate-200 text-[10px] font-bold text-slate-700 shadow-sm">
                                        <input 
                                            type="checkbox"
                                            checked={matchesXml}
                                            onChange={(e) => {
                                                const isChecked = e.target.checked;
                                                setMatchesXml(isChecked);
                                                if (isChecked) {
                                                    setValidatedQty(Number(matchedItem.cantidad_xml ?? matchedItem.cantidad ?? 0));
                                                }
                                            }}
                                            className="w-3.5 h-3.5 text-indigo-600 rounded border-slate-300 focus:ring-indigo-500 cursor-pointer"
                                        />
                                        <span>Coincide XML</span>
                                    </label>
                                </div>

                                <div className="space-y-2">
                                    <div>
                                        <span className="text-[8px] font-extrabold text-slate-500 uppercase block mb-1">
                                            Cantidad Recibida (Cajas)
                                        </span>
                                        
                                        <div className="flex items-center gap-2">
                                            <button 
                                                type="button"
                                                disabled={matchesXml}
                                                onClick={() => {
                                                    const cur = Number(validatedQty || 0);
                                                    if (cur > 0) setValidatedQty(cur - 1);
                                                }}
                                                className="w-10 h-10 bg-white border border-slate-300 rounded-xl font-black text-slate-700 disabled:opacity-40 flex items-center justify-center text-base shadow-sm active:scale-90"
                                            >
                                                -
                                            </button>

                                            <input 
                                                type="number"
                                                min="0"
                                                disabled={matchesXml}
                                                value={validatedQty}
                                                onChange={(e) => setValidatedQty(e.target.value === '' ? '' : Number(e.target.value))}
                                                placeholder="0"
                                                className={`flex-1 text-center py-2 rounded-xl text-base font-black font-mono border-2 outline-none transition-all ${
                                                    matchesXml 
                                                        ? 'bg-slate-100 border-slate-200 text-slate-500' 
                                                        : 'bg-white border-indigo-500 text-indigo-900 focus:ring-2 focus:ring-indigo-500/20'
                                                }`}
                                            />

                                            <button 
                                                type="button"
                                                disabled={matchesXml}
                                                onClick={() => {
                                                    const cur = Number(validatedQty || 0);
                                                    setValidatedQty(cur + 1);
                                                }}
                                                className="w-10 h-10 bg-white border border-slate-300 rounded-xl font-black text-slate-700 disabled:opacity-40 flex items-center justify-center text-base shadow-sm active:scale-90"
                                            >
                                                +
                                            </button>
                                        </div>
                                    </div>

                                    <div>
                                        <span className="text-[8px] font-extrabold text-slate-500 uppercase block mb-1">
                                            Observaciones / Notas
                                        </span>
                                        <input 
                                            type="text"
                                            value={notes}
                                            onChange={(e) => setNotes(e.target.value)}
                                            placeholder="Ej: Cajas abolladas..."
                                            className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs font-medium outline-none focus:border-indigo-500 transition-all italic"
                                        />
                                    </div>
                                </div>

                                <button 
                                    type="button"
                                    onClick={handleValidateSingleItem}
                                    disabled={isSubmitting}
                                    className="w-full py-3.5 bg-emerald-600 hover:bg-emerald-700 disabled:bg-slate-300 text-white font-black text-xs uppercase tracking-wider rounded-xl shadow-md transition-all transform active:scale-95 flex items-center justify-center gap-2 cursor-pointer mt-2"
                                >
                                    {isSubmitting ? (
                                        <RefreshCw className="w-4 h-4 animate-spin" />
                                    ) : (
                                        <Check className="w-4 h-4 stroke-[3]" />
                                    )}
                                    <span>CONFIRMAR Y VALIDAR PRODUCTO</span>
                                </button>
                            </div>
                        </div>
                    ) : (
                        <div className="bg-white border border-slate-200 rounded-2xl p-6 text-center flex flex-col items-center justify-center min-h-[160px] shadow-sm">
                            <div className="w-12 h-12 bg-indigo-50 text-indigo-500 rounded-xl flex items-center justify-center mb-2 border border-indigo-100">
                                <Scan className="w-6 h-6" />
                            </div>
                            <h4 className="text-xs font-black text-slate-700 uppercase tracking-widest mb-1">Esperando Escaneo</h4>
                            <p className="text-[10px] text-slate-400 max-w-xs">
                                Escanee el código con su lector o seleccione un producto de la pestaña Pendientes.
                            </p>
                        </div>
                    )}

                    {/* Session Scanned Queue List */}
                    <div className="bg-white border border-slate-200 rounded-2xl p-3 shadow-sm flex flex-col gap-2">
                        <div className="flex items-center justify-between border-b border-slate-100 pb-2">
                            <div className="flex items-center gap-1.5">
                                <ClipboardList className="w-3.5 h-3.5 text-indigo-600" />
                                <h3 className="text-xs font-black text-slate-700 uppercase tracking-wider">
                                    Cola de Sesión ({scannedItems.length})
                                </h3>
                            </div>

                            {scannedItems.length > 0 && (
                                <button 
                                    type="button"
                                    onClick={handleFinalizeBatch}
                                    disabled={isSubmitting}
                                    className="bg-emerald-600 text-white px-2.5 py-1 rounded-lg text-[9px] font-black uppercase shadow transition-all flex items-center gap-1 active:scale-95"
                                >
                                    {isSubmitting ? <RefreshCw className="w-3 h-3 animate-spin"/> : <Check className="w-3 h-3 stroke-[3]"/>}
                                    <span>Procesar Todo</span>
                                </button>
                            )}
                        </div>

                        <div className="space-y-2 max-h-48 overflow-y-auto custom-scrollbar">
                            {scannedItems.length === 0 ? (
                                <p className="text-[10px] text-slate-400 font-bold uppercase italic text-center py-4">
                                    Sin productos en la cola actual
                                </p>
                            ) : (
                                scannedItems.map((item) => (
                                    <div key={item.id} className="bg-slate-50 border border-slate-200 rounded-xl p-2.5 flex items-center justify-between gap-2">
                                        <div className="min-w-0 flex-1">
                                            <h4 className="text-[11px] font-black text-slate-800 uppercase truncate">{item.nombre}</h4>
                                            <div className="flex items-center gap-2 mt-0.5">
                                                <span className="text-[9px] font-black text-indigo-600 font-mono">{item.codigo}</span>
                                                <span className="text-[9px] font-bold text-slate-500 bg-white px-1.5 py-0.5 rounded border border-slate-200">
                                                    {item.cantidad_xml ?? item.cantidad} CAJAS
                                                </span>
                                            </div>
                                        </div>

                                        <button 
                                            type="button"
                                            onClick={() => setScannedItems(prev => prev.filter(si => si.id !== item.id))}
                                            className="text-slate-400 hover:text-red-500 p-1 rounded-lg hover:bg-red-50"
                                        >
                                            <X className="w-4 h-4" />
                                        </button>
                                    </div>
                                ))
                            )}
                        </div>
                    </div>
                </div>
            ) : (
                /* TAB 2: PENDIENTE POR VALIDAR (100% APP-LIKE MOBILE CARDS LIST) */
                <div className="flex-1 overflow-y-auto p-3 flex flex-col gap-3 custom-scrollbar">
                    {/* Top Search & Mobile Summary Banner */}
                    <div className="bg-white border border-slate-200 rounded-2xl p-3 shadow-sm flex flex-col gap-2 shrink-0">
                        <div className="relative">
                            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                            <input 
                                type="text"
                                value={pendingSearchTerm}
                                onChange={(e) => setPendingSearchTerm(e.target.value)}
                                placeholder="Filtrar por código ICO o nombre..."
                                className="w-full pl-9 pr-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold outline-none focus:border-amber-500 focus:bg-white transition-all uppercase"
                            />
                        </div>

                        <div className="flex items-center justify-between bg-amber-50 border border-amber-200/80 px-3 py-1.5 rounded-xl">
                            <span className="text-[9px] font-black text-amber-700 uppercase tracking-wider">Total Cajas Pendientes:</span>
                            <span className="text-xs font-black text-amber-900 font-mono">{totalPendingBoxes} CAJAS</span>
                        </div>
                    </div>

                    {/* App-Like Cards List (Replaces wide desktop table on mobile) */}
                    <div className="flex-1 space-y-2.5">
                        {filteredPendingItems.length === 0 ? (
                            <div className="bg-white rounded-2xl p-8 border border-slate-200 text-center">
                                <Package className="w-8 h-8 text-slate-300 mx-auto mb-2" />
                                <p className="text-xs font-black text-slate-400 uppercase italic">
                                    No hay ítems pendientes de validación
                                </p>
                            </div>
                        ) : (
                            filteredPendingItems.map((item) => (
                                <div 
                                    key={item.id} 
                                    className="bg-white border border-slate-200 rounded-2xl p-3.5 shadow-sm hover:border-amber-300 transition-all flex flex-col gap-2.5"
                                >
                                    {/* Card Header: ICO Code & Status */}
                                    <div className="flex items-center justify-between">
                                        <span className="bg-indigo-50 border border-indigo-100 text-indigo-700 text-[10px] font-black font-mono px-2.5 py-0.5 rounded-lg">
                                            {item.codigo}
                                        </span>
                                        <span className="bg-amber-100 text-amber-800 text-[8px] font-black px-2 py-0.5 rounded-full uppercase tracking-wider">
                                            PENDIENTE
                                        </span>
                                    </div>

                                    {/* Product Name */}
                                    <h4 className="text-xs font-black text-slate-800 uppercase leading-snug">
                                        {item.nombre}
                                    </h4>

                                    {/* Info Grid: Quantity & Expiration */}
                                    <div className="grid grid-cols-2 gap-2 bg-slate-50 p-2 rounded-xl border border-slate-100">
                                        <div>
                                            <span className="text-[7px] font-black text-slate-400 uppercase block leading-none mb-0.5">Cant. XML</span>
                                            <span className="text-xs font-black text-slate-700 font-mono">
                                                {item.cantidad_xml ?? item.cantidad} CAJAS
                                            </span>
                                        </div>

                                        <div>
                                            <span className="text-[7px] font-black text-slate-400 uppercase block leading-none mb-0.5">Vencimiento</span>
                                            <span className="text-[10px] font-black text-amber-800 font-mono">
                                                {formatCompactDate(item.fecha_vencimiento)}
                                            </span>
                                        </div>
                                    </div>

                                    {/* Full-width Touch Action Button */}
                                    <button 
                                        type="button"
                                        onClick={() => handleSelectPendingItemForScan(item)}
                                        className="w-full py-2.5 bg-indigo-600 hover:bg-indigo-700 active:scale-95 text-white font-extrabold text-[10px] uppercase rounded-xl transition-all shadow-sm flex items-center justify-center gap-1.5 cursor-pointer mt-0.5"
                                    >
                                        <span>ESCANEAR / VALIDAR</span>
                                        <ArrowRight className="w-3.5 h-3.5" />
                                    </button>
                                </div>
                            ))
                        )}
                    </div>
                </div>
            )}
        </div>
    );
};

export default ReceptionLaive;
