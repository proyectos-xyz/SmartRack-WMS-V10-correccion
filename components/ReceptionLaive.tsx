import React, { useState, useEffect, useRef } from 'react';
import { supabase } from '../supabaseClient';
import { Product, Usuario } from '../types';
import { 
    Search, CheckCircle2, Package, RefreshCw, Check, X, 
    ClipboardList, Scan, Keyboard, ArrowRight, AlertTriangle, 
    Layers, CheckCheck, Sparkles, Barcode
} from 'lucide-react';
import { formatCompactDate, generateLPN } from '../utils';
import { motion, AnimatePresence } from 'motion/react';

interface ReceptionLaiveProps {
    currentUser: Usuario | null;
    catalog: Product[];
}

interface PendingItemData {
    id: string;
    producto_id: string;
    codigo: string;
    nombre: string;
    cantidad: number;
    cantidad_xml: number;
    cantidad_validada: number | null;
    fecha_vencimiento: string;
    guia_factura?: string;
    proveedor?: string;
    estado?: string;
    fecha_registro?: string;
}

interface ScannedProductGroup {
    product: Product | null;
    codigo: string;
    nombre: string;
    items: {
        id: string;
        fecha_vencimiento: string;
        cantidad_xml: number;
        physicalQty: number;
        matchesXml: boolean;
        notes: string;
        isSaved: boolean;
    }[];
}

const ReceptionLaive: React.FC<ReceptionLaiveProps> = ({ currentUser, catalog }) => {
    const [activeTab, setActiveTab] = useState<'SCAN' | 'PENDING' | 'VERIFIED'>('SCAN');
    const [pendingItems, setPendingItems] = useState<PendingItemData[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const [searchTerm, setSearchTerm] = useState('');
    const [pendingSearchTerm, setPendingSearchTerm] = useState('');
    const [scanMode, setScanMode] = useState(true);

    // Active product currently being inspected/scanned
    const [activeScannedGroup, setActiveScannedGroup] = useState<ScannedProductGroup | null>(null);

    // Map of physically verified items: id -> { physicalQty, matchesXml, notes, isSaved }
    const [verifiedMap, setVerifiedMap] = useState<Record<string, {
        physicalQty: number;
        matchesXml: boolean;
        notes: string;
        isSaved: boolean;
        timestamp: string;
    }>>({});

    // Processing & Progress Bar state
    const [isProcessingBatch, setIsProcessingBatch] = useState(false);
    const [processingProgress, setProcessingProgress] = useState(0);
    const [processingStepText, setProcessingStepText] = useState('');
    const [processedResults, setProcessedResults] = useState<{
        lpns: { lpn: string; product: string; qty: number; expirationDate: string }[];
        totalBoxes: number;
    } | null>(null);

    // Toast and feedback states
    const [toastMessage, setToastMessage] = useState<{ type: 'success' | 'error' | 'info'; text: string } | null>(null);

    const searchRef = useRef<HTMLInputElement>(null);
    const scanTimeoutRef = useRef<NodeJS.Timeout | null>(null);

    // Auto-focus barcode input when in scan tab
    useEffect(() => {
        if (scanMode && activeTab === 'SCAN' && !isProcessingBatch && !processedResults) {
            const interval = setInterval(() => {
                if (document.activeElement?.tagName !== 'INPUT' && document.activeElement?.tagName !== 'TEXTAREA') {
                    searchRef.current?.focus();
                }
            }, 2000);
            return () => clearInterval(interval);
        }
    }, [scanMode, activeTab, isProcessingBatch, processedResults]);

    useEffect(() => {
        fetchPendingItems();
    }, []);

    const showToast = (text: string, type: 'success' | 'error' | 'info' = 'success') => {
        setToastMessage({ type, text });
        setTimeout(() => setToastMessage(null), 2500);
    };

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
            const items: PendingItemData[] = (data || []).map(d => ({
                id: d.id,
                producto_id: d.producto_id,
                codigo: d.codigo,
                nombre: d.nombre,
                cantidad: Number(d.cantidad || 0),
                cantidad_xml: Number(d.cantidad_xml ?? d.cantidad ?? 0),
                cantidad_validada: d.cantidad_validada !== null ? Number(d.cantidad_validada) : null,
                fecha_vencimiento: d.fecha_vencimiento || '',
                guia_factura: d.guia_factura,
                proveedor: d.proveedor,
                estado: d.estado,
                fecha_registro: d.fecha_registro
            }));
            setPendingItems(items);
        } catch (err) {
            console.error("Error fetching pending Laive items:", err);
            showToast("Error al cargar pendientes de XML", "error");
        } finally {
            setIsLoading(false);
        }
    };

    // TVU calculator helper
    const calculateTVU = (expirationDate: string, vidaUtilDias: number) => {
        if (!expirationDate || !vidaUtilDias) return null;
        try {
            const exp = new Date(expirationDate);
            const today = new Date();
            const diffTime = exp.getTime() - today.getTime();
            const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
            const percentage = Math.max(0, Math.round((diffDays / vidaUtilDias) * 100));
            return { days: diffDays, percentage };
        } catch (e) {
            return null;
        }
    };

    // Find pending product matches across barcode / extranjero / sku / code
    const findMatchingItems = (term: string) => {
        const cleanTerm = term.trim().toLowerCase();
        if (!cleanTerm) return [];

        return pendingItems.filter(item => {
            const prod = catalog.find(p => p.id === item.producto_id);
            return (
                item.codigo.toLowerCase() === cleanTerm ||
                (prod?.extranjero && prod.extranjero.toLowerCase() === cleanTerm) ||
                (prod?.sku && prod.sku.toLowerCase() === cleanTerm) ||
                (prod?.ean_bulto && prod.ean_bulto.toLowerCase() === cleanTerm) ||
                item.nombre.toLowerCase().includes(cleanTerm)
            );
        });
    };

    const processSearch = (val: string, isAuto: boolean = false) => {
        const term = val.trim();
        if (!term) return false;

        const matched = findMatchingItems(term);

        if (matched.length > 0) {
            // Group matching pending items by product
            const firstItem = matched[0];
            const product = catalog.find(p => p.id === firstItem.producto_id) || null;

            // Get ALL items in pending matching this product (by product_id or code)
            const allProductLines = pendingItems.filter(
                pi => pi.producto_id === firstItem.producto_id || pi.codigo === firstItem.codigo
            );

            // Group by expiration date and prepare lines
            const groupLines = allProductLines.map(line => {
                const existingVerification = verifiedMap[line.id];
                const xmlQty = line.cantidad_xml;
                return {
                    id: line.id,
                    fecha_vencimiento: line.fecha_vencimiento,
                    cantidad_xml: xmlQty,
                    physicalQty: existingVerification ? existingVerification.physicalQty : xmlQty,
                    matchesXml: existingVerification ? existingVerification.matchesXml : true,
                    notes: existingVerification ? existingVerification.notes : '',
                    isSaved: !!existingVerification?.isSaved
                };
            });

            setActiveScannedGroup({
                product,
                codigo: firstItem.codigo,
                nombre: firstItem.nombre,
                items: groupLines
            });

            setSearchTerm('');
            showToast(`Producto encontrado: ${firstItem.codigo}`, 'success');
            return true;
        } else if (!isAuto) {
            showToast("Código no encontrado en pendientes", "error");
            setSearchTerm('');
        }
        return false;
    };

    const handleSearchSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (scanTimeoutRef.current) clearTimeout(scanTimeoutRef.current);
        processSearch(searchTerm, false);
    };

    const onSearchChange = (val: string) => {
        setSearchTerm(val);
        const term = val.trim();

        if (scanMode && term.length > 0) {
            if (scanTimeoutRef.current) clearTimeout(scanTimeoutRef.current);

            // Quick check for exact barcode/extranjero match
            const exact = findMatchingItems(term);
            if (exact.length > 0) {
                processSearch(term, true);
                return;
            }

            // Timeout debounce for scanner lasers sending rapid characters
            scanTimeoutRef.current = setTimeout(() => {
                if (val.trim()) {
                    processSearch(val, false);
                }
            }, 180);
        }
    };

    // Update physical quantity for an expiration line
    const handleUpdateLineQty = (lineId: string, qty: number) => {
        if (!activeScannedGroup) return;
        const newItems = activeScannedGroup.items.map(item => {
            if (item.id === lineId) {
                const finalQty = Math.max(0, qty);
                return {
                    ...item,
                    physicalQty: finalQty,
                    matchesXml: finalQty === item.cantidad_xml
                };
            }
            return item;
        });
        setActiveScannedGroup({ ...activeScannedGroup, items: newItems });
    };

    // Toggle match XML checkbox for an expiration line
    const handleToggleMatchXml = (lineId: string, checked: boolean) => {
        if (!activeScannedGroup) return;
        const newItems = activeScannedGroup.items.map(item => {
            if (item.id === lineId) {
                return {
                    ...item,
                    matchesXml: checked,
                    physicalQty: checked ? item.cantidad_xml : item.physicalQty
                };
            }
            return item;
        });
        setActiveScannedGroup({ ...activeScannedGroup, items: newItems });
    };

    // Update notes for an expiration line
    const handleUpdateNotes = (lineId: string, notes: string) => {
        if (!activeScannedGroup) return;
        const newItems = activeScannedGroup.items.map(item => {
            if (item.id === lineId) {
                return { ...item, notes };
            }
            return item;
        });
        setActiveScannedGroup({ ...activeScannedGroup, items: newItems });
    };

    // Confirm and save physical verification for active scanned product
    const handleConfirmScannedGroup = () => {
        if (!activeScannedGroup) return;

        const newVerified = { ...verifiedMap };
        activeScannedGroup.items.forEach(item => {
            newVerified[item.id] = {
                physicalQty: item.physicalQty,
                matchesXml: item.physicalQty === item.cantidad_xml,
                notes: item.notes,
                isSaved: true,
                timestamp: new Date().toISOString()
            };
        });

        setVerifiedMap(newVerified);
        showToast(`Revisión guardada (${activeScannedGroup.items.length} fecha(s))`, 'success');
        setActiveScannedGroup(null);
        if (searchRef.current) {
            searchRef.current.focus();
        }
    };

    // Quick select a pending item to inspect
    const handleSelectPendingItem = (item: PendingItemData) => {
        const product = catalog.find(p => p.id === item.producto_id) || null;
        const allProductLines = pendingItems.filter(
            pi => pi.producto_id === item.producto_id || pi.codigo === item.codigo
        );

        const groupLines = allProductLines.map(line => {
            const existingVerification = verifiedMap[line.id];
            const xmlQty = line.cantidad_xml;
            return {
                id: line.id,
                fecha_vencimiento: line.fecha_vencimiento,
                cantidad_xml: xmlQty,
                physicalQty: existingVerification ? existingVerification.physicalQty : xmlQty,
                matchesXml: existingVerification ? existingVerification.matchesXml : true,
                notes: existingVerification ? existingVerification.notes : '',
                isSaved: !!existingVerification?.isSaved
            };
        });

        setActiveScannedGroup({
            product,
            codigo: item.codigo,
            nombre: item.nombre,
            items: groupLines
        });

        setActiveTab('SCAN');
    };

    // Final "PROCESAR" batch execution with animated progress bar and LPN generation
    const handleFinalProcessBatch = async () => {
        // Collect all items to process (all verified items with physicalQty > 0)
        const verifiedIds = Object.keys(verifiedMap);
        if (verifiedIds.length === 0) {
            alert("No ha escaneado ni verificado ningún producto aún.");
            return;
        }

        const itemsToProcess = pendingItems.filter(p => verifiedMap[p.id]?.isSaved);
        if (itemsToProcess.length === 0) {
            alert("No hay productos verificados listos para procesar.");
            return;
        }

        setIsProcessingBatch(true);
        setProcessingProgress(5);
        setProcessingStepText("Iniciando procesamiento de recepción física...");

        try {
            // STEP 1: Group items by product and expiration date
            await new Promise(r => setTimeout(r, 400));
            setProcessingProgress(25);
            setProcessingStepText("Agrupando productos por fecha de vencimiento y lote...");

            // Determine how many LPNs to generate (1 LPN per distinct item/expiration with physical qty > 0)
            const validEntries = itemsToProcess
                .map(item => {
                    const verification = verifiedMap[item.id];
                    const physicalQty = verification ? verification.physicalQty : item.cantidad_xml;
                    return {
                        item,
                        physicalQty,
                        notes: verification?.notes || ''
                    };
                })
                .filter(entry => entry.physicalQty > 0);

            if (validEntries.length === 0) {
                alert("La cantidad física de todos los productos seleccionados es 0.");
                setIsProcessingBatch(false);
                return;
            }

            // STEP 2: Fetch atomic correlatives from Supabase
            await new Promise(r => setTimeout(r, 400));
            setProcessingProgress(50);
            setProcessingStepText("Obteniendo correlativos atómicos para generar LPNs...");

            let correlatives: number[] = [];
            try {
                const { data: rpcCorrelatives, error: rpcError } = await supabase.rpc('get_next_lpn_correlatives', { 
                    count_val: validEntries.length 
                });
                if (!rpcError && Array.isArray(rpcCorrelatives) && rpcCorrelatives.length >= validEntries.length) {
                    correlatives = rpcCorrelatives.map(r => typeof r === 'object' && r !== null ? Number((r as any).num) : Number(r));
                }
            } catch (rpcErr) {
                console.warn("RPC correlatives fallback:", rpcErr);
            }

            // Fallback correlatives if RPC failed
            if (correlatives.length < validEntries.length) {
                const baseTimestamp = Date.now() % 100000;
                correlatives = validEntries.map((_, i) => baseTimestamp + i + 1);
            }

            // STEP 3: Generate LPN pallets and insert into paletas_lpn
            await new Promise(r => setTimeout(r, 400));
            setProcessingProgress(75);
            setProcessingStepText("Registrando paletas en RECEPCIÓN / PENDIENTES (paletas_lpn)...");

            const now = new Date().toISOString();
            const operatorName = currentUser?.nombre || currentUser?.username || 'OPERARIO_LAIVE';

            const palletsToInsert: any[] = [];
            const receptionUpdates: any[] = [];
            const generatedLpnSummaries: { lpn: string; product: string; qty: number; expirationDate: string }[] = [];
            let totalProcessedBoxes = 0;

            for (let i = 0; i < validEntries.length; i++) {
                const { item, physicalQty, notes } = validEntries[i];
                const correlative = correlatives[i];
                const lpn = generateLPN(correlative);
                const qrCodeUrl = `https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${lpn}`;

                palletsToInsert.push({
                    lpn,
                    producto_id: item.producto_id,
                    cantidad_total: physicalQty,
                    cajas: physicalQty,
                    unidades: 0,
                    pallets: 1,
                    fecha_vencimiento_critica: item.fecha_vencimiento,
                    fecha_recepcion: now,
                    recibido_por: operatorName,
                    qr_url: qrCodeUrl,
                    es_mixto: false,
                    generado: false,
                    estado: 'ACTIVO',
                    estado_lpn: 'PENDIENTE',
                    sede_id: currentUser?.sede_id || null,
                    tipo: 'RECEPCION',
                    comentario: notes ? `XML LAIVE: ${notes}` : 'Recepción Carga XML Laive'
                });

                receptionUpdates.push({
                    id: item.id,
                    lpn,
                    estado: 'ACTIVO',
                    cantidad: physicalQty,
                    cantidad_validada: physicalQty,
                    cantidad_xml: item.cantidad_xml,
                    verificado_por: operatorName,
                    fecha_verificacion: now,
                    observaciones: notes || null,
                    conclusiones: physicalQty === item.cantidad_xml ? 'CONFORME' : 'DIFERENCIA_FISICA'
                });

                generatedLpnSummaries.push({
                    lpn,
                    product: `${item.codigo} - ${item.nombre}`,
                    qty: physicalQty,
                    expirationDate: item.fecha_vencimiento
                });

                totalProcessedBoxes += physicalQty;
            }

            // Insert Pallets into paletas_lpn
            const { error: insertPalletError } = await supabase
                .from('paletas_lpn')
                .insert(palletsToInsert);

            if (insertPalletError) {
                console.error("Error inserting pallets:", insertPalletError);
                throw insertPalletError;
            }

            // STEP 4: Update recepcion_productos so RECEPCION / HISTORICO is synchronized
            await new Promise(r => setTimeout(r, 400));
            setProcessingProgress(90);
            setProcessingStepText("Sincronizando historial en RECEPCIÓN / HISTÓRICO...");

            for (const upd of receptionUpdates) {
                let { error: updErr } = await supabase
                    .from('recepcion_productos')
                    .update(upd)
                    .eq('id', upd.id);

                if (updErr && (updErr.message?.includes('column') || updErr.code === 'PGRST204')) {
                    const fallbackUpd = {
                        estado: 'ACTIVO',
                        cantidad: upd.cantidad,
                        observaciones: upd.observaciones,
                        verificado_por: upd.verificado_por,
                        fecha_verificacion: upd.fecha_verificacion
                    };
                    await supabase.from('recepcion_productos').update(fallbackUpd).eq('id', upd.id);
                }
            }

            // Finalizing
            setProcessingProgress(100);
            setProcessingStepText("¡Recepción completada con éxito!");
            await new Promise(r => setTimeout(r, 500));

            // Set result summary and clean up states
            setProcessedResults({
                lpns: generatedLpnSummaries,
                totalBoxes: totalProcessedBoxes
            });

            // Reset local session
            setVerifiedMap({});
            setActiveScannedGroup(null);
            fetchPendingItems();
        } catch (err: any) {
            console.error("Error finalizing batch reception:", err);
            alert("Error al procesar la recepción: " + (err.message || 'Verifique su conexión.'));
        } finally {
            setIsProcessingBatch(false);
        }
    };

    // Calculate Reconciliation Totals
    const totalPendingXmlBoxes = pendingItems.reduce((sum, item) => sum + item.cantidad_xml, 0);
    const verifiedItemsList = pendingItems.filter(p => verifiedMap[p.id]?.isSaved);
    const totalVerifiedBoxes = verifiedItemsList.reduce((sum, item) => {
        return sum + (verifiedMap[item.id]?.physicalQty ?? item.cantidad_xml);
    }, 0);

    const pendingUnverifiedItems = pendingItems.filter(p => !verifiedMap[p.id]?.isSaved);
    const pendingUnverifiedCount = pendingUnverifiedItems.length;
    const pendingUnverifiedBoxes = pendingUnverifiedItems.reduce((sum, item) => sum + item.cantidad_xml, 0);

    // Is pending fully at zero?
    const isPendingZero = pendingItems.length > 0 && pendingUnverifiedCount === 0;

    // Filter for pending tab
    const filteredPendingItems = pendingItems.filter(item => {
        const term = pendingSearchTerm.toLowerCase().trim();
        if (!term) return true;
        const prod = catalog.find(p => p.id === item.producto_id);
        return (
            item.codigo.toLowerCase().includes(term) ||
            item.nombre.toLowerCase().includes(term) ||
            (prod?.sku && prod.sku.toLowerCase().includes(term)) ||
            (prod?.extranjero && prod.extranjero.toLowerCase().includes(term)) ||
            (item.guia_factura && item.guia_factura.toLowerCase().includes(term))
        );
    });

    return (
        <div className="flex flex-col h-full bg-slate-100 overflow-hidden relative select-none">
            {/* Custom Toast Notifications */}
            <AnimatePresence>
                {toastMessage && (
                    <motion.div
                        initial={{ opacity: 0, y: -20, scale: 0.95 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        exit={{ opacity: 0, y: -20, scale: 0.95 }}
                        className="fixed top-4 inset-x-0 mx-auto w-fit z-[120] pointer-events-none px-4"
                    >
                        <div className={`px-5 py-2.5 rounded-2xl shadow-2xl flex items-center gap-2.5 border backdrop-blur-md ${
                            toastMessage.type === 'success' 
                                ? 'bg-emerald-600/95 text-white border-emerald-400/40 shadow-emerald-900/30' 
                                : toastMessage.type === 'error'
                                    ? 'bg-rose-600/95 text-white border-rose-400/40 shadow-rose-900/30'
                                    : 'bg-indigo-600/95 text-white border-indigo-400/40 shadow-indigo-900/30'
                        }`}>
                            {toastMessage.type === 'success' && <Check className="w-4 h-4 stroke-[3]" />}
                            {toastMessage.type === 'error' && <X className="w-4 h-4 stroke-[3]" />}
                            {toastMessage.type === 'info' && <Barcode className="w-4 h-4 stroke-[2]" />}
                            <span className="text-xs font-black uppercase tracking-tight">{toastMessage.text}</span>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* PROCESSING PROGRESS BAR MODAL */}
            <AnimatePresence>
                {isProcessingBatch && (
                    <motion.div 
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="fixed inset-0 bg-slate-950/80 backdrop-blur-md z-[150] flex items-center justify-center p-4"
                    >
                        <motion.div 
                            initial={{ scale: 0.9, y: 20 }}
                            animate={{ scale: 1, y: 0 }}
                            className="bg-white rounded-3xl p-6 shadow-2xl max-w-sm w-full border border-slate-200 text-center flex flex-col items-center"
                        >
                            <div className="w-14 h-14 bg-indigo-50 border border-indigo-100 rounded-2xl flex items-center justify-center mb-4 text-indigo-600 shadow-inner">
                                <RefreshCw className="w-7 h-7 animate-spin" />
                            </div>

                            <h3 className="text-base font-black text-slate-800 uppercase tracking-tight mb-1">
                                Procesando Recepción Laive
                            </h3>
                            <p className="text-xs text-slate-500 font-bold mb-4 min-h-[32px] flex items-center justify-center">
                                {processingStepText}
                            </p>

                            {/* Animated Progress Bar */}
                            <div className="w-full bg-slate-100 rounded-full h-4 p-0.5 border border-slate-200 overflow-hidden relative mb-2">
                                <motion.div 
                                    className="bg-gradient-to-r from-indigo-500 to-emerald-500 h-full rounded-full transition-all duration-300 relative overflow-hidden"
                                    style={{ width: `${processingProgress}%` }}
                                >
                                    <div className="absolute inset-0 bg-white/20 animate-[shimmer_1.5s_infinite] bg-gradient-to-r from-transparent via-white/30 to-transparent"></div>
                                </motion.div>
                            </div>
                            <span className="text-[10px] font-mono font-black text-indigo-600 tracking-wider">
                                {processingProgress}% COMPLETADO
                            </span>
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* BATCH RESULTS SUCCESS MODAL */}
            <AnimatePresence>
                {processedResults && (
                    <motion.div 
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="fixed inset-0 bg-slate-950/80 backdrop-blur-md z-[160] flex items-center justify-center p-4"
                    >
                        <motion.div 
                            initial={{ scale: 0.9, y: 20 }}
                            animate={{ scale: 1, y: 0 }}
                            className="bg-white rounded-3xl p-5 shadow-2xl max-w-md w-full border border-slate-200 flex flex-col max-h-[90vh]"
                        >
                            <div className="flex items-center justify-between border-b border-slate-100 pb-3 mb-3">
                                <div className="flex items-center gap-2.5">
                                    <div className="w-10 h-10 bg-emerald-50 text-emerald-600 rounded-2xl flex items-center justify-center border border-emerald-200">
                                        <CheckCircle2 className="w-6 h-6" />
                                    </div>
                                    <div>
                                        <h3 className="text-sm font-black text-slate-800 uppercase tracking-tight">
                                            ¡Recepción Procesada!
                                        </h3>
                                        <p className="text-[10px] text-slate-500 font-bold">
                                            {processedResults.lpns.length} LPN(s) Generados • {processedResults.totalBoxes} Cajas
                                        </p>
                                    </div>
                                </div>
                                <button 
                                    onClick={() => setProcessedResults(null)}
                                    className="p-1.5 text-slate-400 hover:text-slate-600 rounded-xl hover:bg-slate-100"
                                >
                                    <X className="w-5 h-5" />
                                </button>
                            </div>

                            <div className="bg-emerald-50 border border-emerald-200 p-3 rounded-2xl mb-3">
                                <p className="text-xs text-emerald-800 font-bold leading-relaxed">
                                    Los LPNs generados ya están disponibles en <span className="font-black text-emerald-950">RECEPCIÓN / PENDIENTES</span> y sincronizados en <span className="font-black text-emerald-950">RECEPCIÓN / HISTÓRICO</span>.
                                </p>
                            </div>

                            <div className="flex-1 overflow-y-auto space-y-2 pr-1 custom-scrollbar max-h-60 mb-4">
                                {processedResults.lpns.map((res, idx) => (
                                    <div key={idx} className="bg-slate-50 border border-slate-200 p-2.5 rounded-xl flex items-center justify-between">
                                        <div className="min-w-0 flex-1 pr-2">
                                            <div className="flex items-center gap-1.5">
                                                <span className="text-xs font-black font-mono text-indigo-700 bg-indigo-50 border border-indigo-100 px-2 py-0.5 rounded-md">
                                                    {res.lpn}
                                                </span>
                                                <span className="text-[9px] font-bold text-amber-700 bg-amber-50 px-1.5 py-0.5 rounded border border-amber-200">
                                                    Vence: {formatCompactDate(res.expirationDate)}
                                                </span>
                                            </div>
                                            <p className="text-[11px] font-black text-slate-700 uppercase truncate mt-1">
                                                {res.product}
                                            </p>
                                        </div>
                                        <span className="text-xs font-black text-slate-800 bg-white px-2 py-1 rounded-lg border border-slate-200 shrink-0">
                                            {res.qty} CJ
                                        </span>
                                    </div>
                                ))}
                            </div>

                            <button 
                                onClick={() => setProcessedResults(null)}
                                className="w-full py-3.5 bg-indigo-600 hover:bg-indigo-700 text-white font-black text-xs uppercase tracking-wider rounded-2xl shadow-lg shadow-indigo-200 active:scale-95 transition-all"
                            >
                                CONTINUAR / NUEVA RECEPCIÓN
                            </button>
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* APP-LIKE HEADER BAR */}
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
                                Validación Móvil Carga XML
                            </p>
                        </div>
                    </div>

                    <div className="flex items-center gap-1.5 shrink-0">
                        {/* Live Session Counter */}
                        <div className={`px-2.5 py-1 rounded-xl border flex flex-col items-center transition-colors ${
                            isPendingZero 
                                ? 'bg-emerald-50 border-emerald-200 text-emerald-700' 
                                : 'bg-amber-50 border-amber-200 text-amber-700'
                        }`}>
                            <span className="text-[7px] font-black uppercase leading-none">
                                {isPendingZero ? '¡Completo!' : 'Pendientes'}
                            </span>
                            <span className="text-xs font-black font-mono leading-none mt-0.5">
                                {pendingUnverifiedCount}
                            </span>
                        </div>

                        <button 
                            onClick={fetchPendingItems}
                            className="p-2 text-slate-500 hover:text-indigo-600 hover:bg-indigo-50 rounded-xl transition-all border border-slate-200 active:scale-90"
                            title="Actualizar Pendientes"
                        >
                            <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`}/>
                        </button>
                    </div>
                </div>

                {/* Segmented Control Tabs */}
                <div className="grid grid-cols-2 gap-1 bg-slate-100 p-1 rounded-2xl border border-slate-200">
                    <button
                        type="button"
                        onClick={() => setActiveTab('SCAN')}
                        className={`py-2 px-2 rounded-xl font-black text-[11px] uppercase tracking-wider transition-all flex items-center justify-center gap-1.5 active:scale-95 ${
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
                        className={`py-2 px-2 rounded-xl font-black text-[11px] uppercase tracking-wider transition-all flex items-center justify-center gap-1.5 active:scale-95 ${
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

            {/* TAB CONTENT: SCAN & PHYSICAL RECONCILIATION */}
            {activeTab === 'SCAN' ? (
                <div className="flex-1 overflow-y-auto p-3 flex flex-col gap-3 custom-scrollbar">
                    
                    {/* ZERO PENDING CELEBRATION OR REMAINING STATUS BANNER */}
                    {pendingItems.length > 0 && (
                        <div>
                            {isPendingZero ? (
                                <motion.div 
                                    initial={{ scale: 0.95, opacity: 0 }}
                                    animate={{ scale: 1, opacity: 1 }}
                                    className="bg-gradient-to-r from-emerald-600 to-teal-600 text-white p-3 rounded-2xl shadow-md border border-emerald-400/40 flex items-center justify-between gap-2"
                                >
                                    <div className="flex items-center gap-2 min-w-0">
                                        <div className="w-8 h-8 bg-white/20 rounded-xl flex items-center justify-center shrink-0">
                                            <Sparkles className="w-4 h-4 text-white" />
                                        </div>
                                        <div className="min-w-0">
                                            <h4 className="text-xs font-black uppercase tracking-tight leading-none">
                                                ¡Pendientes en CERO (0)!
                                            </h4>
                                            <p className="text-[9px] text-emerald-100 font-bold uppercase mt-0.5 truncate">
                                                Todos los productos escaneados y verificados
                                            </p>
                                        </div>
                                    </div>
                                    <span className="bg-white text-emerald-700 text-[10px] font-black px-2.5 py-1 rounded-xl shadow-sm shrink-0">
                                        Listo para Procesar
                                    </span>
                                </motion.div>
                            ) : (
                                <div className="bg-amber-50 border border-amber-200/80 p-2.5 rounded-2xl flex items-center justify-between text-amber-900 shadow-sm">
                                    <div className="flex items-center gap-2">
                                        <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
                                        <span className="text-[10px] font-black uppercase">
                                            Faltan {pendingUnverifiedCount} productos ({pendingUnverifiedBoxes} Cajas) por escanear
                                        </span>
                                    </div>
                                    <button 
                                        onClick={() => setActiveTab('PENDING')}
                                        className="text-[9px] font-extrabold uppercase text-amber-700 underline shrink-0 hover:text-amber-900"
                                    >
                                        Ver Lista
                                    </button>
                                </div>
                            )}
                        </div>
                    )}

                    {/* Barcode Scanner Floating Input Form */}
                    <form onSubmit={handleSearchSubmit} className="relative shrink-0">
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
                                placeholder={scanMode ? "ESCANEAR BARRA O CÓDIGO ICO..." : "DIGITAR CÓDIGO O EAN..."}
                                className={`w-full pl-9 pr-24 py-3 bg-white border-2 rounded-2xl text-xs font-black outline-none transition-all shadow-sm placeholder:text-slate-400 uppercase tracking-tight ${
                                    scanMode 
                                        ? 'border-indigo-600 ring-2 ring-indigo-500/10' 
                                        : 'border-slate-300 focus:border-indigo-500'
                                }`}
                                value={searchTerm}
                                onChange={e => onSearchChange(e.target.value)}
                                autoFocus
                            />

                            <div className="absolute right-1.5 flex items-center gap-1">
                                <button 
                                    type="button"
                                    onClick={() => {
                                        setScanMode(!scanMode);
                                        searchRef.current?.focus();
                                    }}
                                    className={`px-2 py-1 rounded-xl border text-[9px] font-black transition-all ${
                                        scanMode 
                                            ? 'bg-indigo-50 border-indigo-300 text-indigo-700 shadow-sm' 
                                            : 'bg-slate-100 border-slate-200 text-slate-600'
                                    }`}
                                >
                                    {scanMode ? 'SCAN' : 'TECLADO'}
                                </button>
                                
                                <button 
                                    type="submit"
                                    className="bg-indigo-600 text-white p-2 rounded-xl font-black hover:bg-indigo-700 active:scale-90 shadow transition-all"
                                >
                                    <Search className="w-3.5 h-3.5" />
                                </button>
                            </div>
                        </div>
                    </form>

                    {/* ACTIVE SCANNED PRODUCT CARD (SEPARATED BY EXPIRATION DATES) */}
                    {activeScannedGroup ? (
                        <motion.div 
                            initial={{ scale: 0.95, opacity: 0 }}
                            animate={{ scale: 1, opacity: 1 }}
                            className="bg-white border-2 border-indigo-600 rounded-3xl p-4 shadow-xl flex flex-col gap-3.5 relative"
                        >
                            {/* Product Header */}
                            <div className="flex items-start justify-between border-b border-slate-100 pb-2.5">
                                <div className="min-w-0 flex-1 pr-2">
                                    <div className="flex items-center gap-1.5 mb-1">
                                        <span className="text-[8px] font-black text-indigo-600 uppercase bg-indigo-50 px-2 py-0.5 rounded-md border border-indigo-100">
                                            ICO: {activeScannedGroup.codigo}
                                        </span>
                                        {activeScannedGroup.product?.extranjero && (
                                            <span className="text-[8px] font-black text-slate-500 uppercase bg-slate-100 px-2 py-0.5 rounded-md border border-slate-200">
                                                Prov: {activeScannedGroup.product.extranjero}
                                            </span>
                                        )}
                                    </div>
                                    <h3 className="text-xs font-black text-slate-800 uppercase leading-snug">
                                        {activeScannedGroup.nombre}
                                    </h3>
                                </div>

                                <button 
                                    onClick={() => setActiveScannedGroup(null)}
                                    className="text-slate-400 hover:text-slate-600 p-1.5 rounded-xl hover:bg-slate-100 shrink-0"
                                >
                                    <X className="w-5 h-5" />
                                </button>
                            </div>

                            {/* Fechas de Vencimiento List (Requirement: Separate by expiration dates) */}
                            <div className="space-y-3">
                                <div className="flex items-center justify-between">
                                    <span className="text-[10px] font-black text-slate-500 uppercase tracking-wider">
                                        Vencimientos en XML ({activeScannedGroup.items.length})
                                    </span>
                                    <span className="text-[9px] font-extrabold text-indigo-600">
                                        Validación Física Requerida
                                    </span>
                                </div>

                                {activeScannedGroup.items.map((lineItem, idx) => {
                                    const tvu = activeScannedGroup.product 
                                        ? calculateTVU(lineItem.fecha_vencimiento, activeScannedGroup.product.vida_util_dias)
                                        : null;
                                    const diff = lineItem.physicalQty - lineItem.cantidad_xml;

                                    return (
                                        <div 
                                            key={lineItem.id || idx} 
                                            className={`p-3 rounded-2xl border-2 transition-all space-y-2.5 ${
                                                lineItem.matchesXml 
                                                    ? 'bg-slate-50/80 border-slate-200' 
                                                    : 'bg-amber-50/50 border-amber-300'
                                            }`}
                                        >
                                            {/* Expiration Date Row & XML Quantity */}
                                            <div className="flex items-center justify-between">
                                                <div className="flex items-center gap-1.5">
                                                    <span className="text-xs font-black text-slate-800 font-mono bg-white px-2.5 py-1 rounded-xl border border-slate-200 shadow-sm">
                                                        📅 {formatCompactDate(lineItem.fecha_vencimiento)}
                                                    </span>
                                                    {tvu && (
                                                        <span className={`text-[8px] font-black px-1.5 py-0.5 rounded-md uppercase ${
                                                            tvu.percentage < 33 ? 'bg-red-100 text-red-700' : 'bg-blue-100 text-blue-700'
                                                        }`}>
                                                            TVU: {tvu.percentage}%
                                                        </span>
                                                    )}
                                                </div>

                                                <div className="text-right">
                                                    <span className="text-[7px] font-black text-slate-400 uppercase block leading-none">Cant. XML</span>
                                                    <span className="text-xs font-black text-indigo-700 font-mono">
                                                        {lineItem.cantidad_xml} Cajas
                                                    </span>
                                                </div>
                                            </div>

                                            {/* Physical Validation Controls: Stepper, Input & Coincide Button */}
                                            <div className="bg-white p-2.5 rounded-xl border border-slate-200 space-y-2">
                                                <div className="flex items-center justify-between">
                                                    <span className="text-[9px] font-black text-slate-600 uppercase">
                                                        Físico Recibido:
                                                    </span>

                                                    {/* Quick Check "Coincide" Button */}
                                                    <button
                                                        type="button"
                                                        onClick={() => handleToggleMatchXml(lineItem.id, !lineItem.matchesXml)}
                                                        className={`px-2.5 py-1 rounded-lg text-[9px] font-black uppercase transition-all flex items-center gap-1 active:scale-95 ${
                                                            lineItem.matchesXml 
                                                                ? 'bg-emerald-600 text-white shadow-sm' 
                                                                : 'bg-slate-100 text-slate-600 border border-slate-200'
                                                        }`}
                                                    >
                                                        <Check className="w-3 h-3 stroke-[3]" />
                                                        <span>{lineItem.matchesXml ? 'Coincide XML (✓)' : 'Marcar Coincide'}</span>
                                                    </button>
                                                </div>

                                                <div className="flex items-center gap-2">
                                                    <button 
                                                        type="button"
                                                        onClick={() => handleUpdateLineQty(lineItem.id, lineItem.physicalQty - 1)}
                                                        className="w-10 h-10 bg-slate-50 hover:bg-slate-100 active:scale-90 border border-slate-200 rounded-xl font-black text-slate-700 text-lg flex items-center justify-center shadow-sm"
                                                    >
                                                        -
                                                    </button>

                                                    <input 
                                                        type="number"
                                                        min="0"
                                                        value={lineItem.physicalQty}
                                                        onChange={(e) => handleUpdateLineQty(lineItem.id, e.target.value === '' ? 0 : Number(e.target.value))}
                                                        className={`flex-1 text-center py-2 rounded-xl text-base font-black font-mono border-2 outline-none transition-all ${
                                                            lineItem.matchesXml 
                                                                ? 'bg-slate-50 border-slate-200 text-slate-800' 
                                                                : 'bg-amber-50 border-amber-400 text-amber-900 focus:ring-2 focus:ring-amber-400/20'
                                                        }`}
                                                    />

                                                    <button 
                                                        type="button"
                                                        onClick={() => handleUpdateLineQty(lineItem.id, lineItem.physicalQty + 1)}
                                                        className="w-10 h-10 bg-slate-50 hover:bg-slate-100 active:scale-90 border border-slate-200 rounded-xl font-black text-slate-700 text-lg flex items-center justify-center shadow-sm"
                                                    >
                                                        +
                                                    </button>
                                                </div>

                                                {/* Discrepancy Alert Tag */}
                                                {!lineItem.matchesXml && (
                                                    <div className="flex items-center justify-between bg-amber-100/70 px-2.5 py-1 rounded-lg border border-amber-200">
                                                        <span className="text-[8px] font-black text-amber-800 uppercase flex items-center gap-1">
                                                            <AlertTriangle className="w-3 h-3 text-amber-600" />
                                                            Diferencia detectada:
                                                        </span>
                                                        <span className="text-[9px] font-black text-amber-900 font-mono">
                                                            {diff > 0 ? `+${diff} Cajas Sobrantes` : `${diff} Cajas Faltantes`}
                                                        </span>
                                                    </div>
                                                )}

                                                {/* Notes Field */}
                                                <input 
                                                    type="text"
                                                    value={lineItem.notes}
                                                    onChange={(e) => handleUpdateNotes(lineItem.id, e.target.value)}
                                                    placeholder="Observación / motivo de diferencia (opcional)..."
                                                    className="w-full px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-[10px] font-medium outline-none focus:border-indigo-500 transition-all italic"
                                                />
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>

                            {/* Action: Save Verification to Working Queue */}
                            <button 
                                type="button"
                                onClick={handleConfirmScannedGroup}
                                className="w-full py-3.5 bg-emerald-600 hover:bg-emerald-700 active:scale-95 text-white font-black text-xs uppercase tracking-wider rounded-2xl shadow-lg shadow-emerald-200 transition-all flex items-center justify-center gap-2 cursor-pointer mt-1"
                            >
                                <CheckCheck className="w-4 h-4 stroke-[3]" />
                                <span>CONFIRMAR Y AGREGAR A REVISIÓN</span>
                            </button>
                        </motion.div>
                    ) : (
                        /* Empty state waiting for scan */
                        <div className="bg-white border border-slate-200 rounded-3xl p-6 text-center flex flex-col items-center justify-center min-h-[160px] shadow-sm">
                            <div className="w-12 h-12 bg-indigo-50 text-indigo-500 rounded-2xl flex items-center justify-center mb-2 border border-indigo-100 shadow-inner">
                                <Scan className="w-6 h-6" />
                            </div>
                            <h4 className="text-xs font-black text-slate-700 uppercase tracking-widest mb-1">
                                Escáner Listo
                            </h4>
                            <p className="text-[10px] text-slate-400 max-w-xs leading-relaxed">
                                Escanee el código de barras o seleccione un producto desde la pestaña <span className="font-bold text-indigo-600">Pendientes</span> para conciliar cantidades por fecha de vencimiento.
                            </p>
                        </div>
                    )}

                    {/* WORKING SESSION QUEUE & FINAL "PROCESAR" BUTTON */}
                    <div className="bg-white border border-slate-200 rounded-3xl p-3.5 shadow-sm flex flex-col gap-3">
                        <div className="flex items-center justify-between border-b border-slate-100 pb-2">
                            <div className="flex items-center gap-1.5">
                                <Layers className="w-4 h-4 text-indigo-600" />
                                <h3 className="text-xs font-black text-slate-800 uppercase tracking-wider">
                                    Revisados en Sesión ({verifiedItemsList.length})
                                </h3>
                            </div>

                            <span className="text-[10px] font-black font-mono text-slate-600 bg-slate-100 px-2 py-0.5 rounded-lg">
                                {totalVerifiedBoxes} CJ Verificadas
                            </span>
                        </div>

                        {/* List of Scanned Items in current session */}
                        <div className="space-y-2 max-h-48 overflow-y-auto custom-scrollbar">
                            {verifiedItemsList.length === 0 ? (
                                <p className="text-[10px] text-slate-400 font-bold uppercase italic text-center py-4">
                                    Aún no hay productos verificados en esta sesión
                                </p>
                            ) : (
                                verifiedItemsList.map((item) => {
                                    const verif = verifiedMap[item.id];
                                    const isMatch = verif ? verif.physicalQty === item.cantidad_xml : true;
                                    const finalQty = verif ? verif.physicalQty : item.cantidad_xml;

                                    return (
                                        <div 
                                            key={item.id} 
                                            className="bg-slate-50 border border-slate-200 rounded-2xl p-2.5 flex items-center justify-between gap-2"
                                        >
                                            <div className="min-w-0 flex-1">
                                                <div className="flex items-center gap-1.5 mb-0.5">
                                                    <span className="text-[9px] font-black text-indigo-700 font-mono">
                                                        {item.codigo}
                                                    </span>
                                                    <span className="text-[8px] font-bold text-slate-500 bg-white px-1.5 py-0.2 rounded border">
                                                        📅 {formatCompactDate(item.fecha_vencimiento)}
                                                    </span>
                                                </div>
                                                <h4 className="text-[10px] font-black text-slate-800 uppercase truncate">
                                                    {item.nombre}
                                                </h4>
                                            </div>

                                            <div className="flex items-center gap-2 shrink-0">
                                                <div className="text-right">
                                                    <span className={`text-[10px] font-black font-mono px-2 py-0.5 rounded-md border block ${
                                                        isMatch 
                                                            ? 'bg-emerald-50 text-emerald-700 border-emerald-200' 
                                                            : 'bg-amber-50 text-amber-800 border-amber-200'
                                                    }`}>
                                                        {finalQty} / {item.cantidad_xml} CJ
                                                    </span>
                                                </div>

                                                <button 
                                                    type="button"
                                                    onClick={() => handleSelectPendingItem(item)}
                                                    className="text-slate-400 hover:text-indigo-600 p-1.5 rounded-lg hover:bg-indigo-50"
                                                    title="Re-editar"
                                                >
                                                    <ArrowRight className="w-3.5 h-3.5" />
                                                </button>
                                            </div>
                                        </div>
                                    );
                                })
                            )}
                        </div>

                        {/* MASTER "PROCESAR" BUTTON (With Progress Bar Trigger) */}
                        {verifiedItemsList.length > 0 && (
                            <button 
                                type="button"
                                onClick={handleFinalProcessBatch}
                                disabled={isProcessingBatch}
                                className="w-full py-4 bg-gradient-to-r from-blue-600 to-indigo-700 hover:from-blue-700 hover:to-indigo-800 text-white font-black text-xs uppercase tracking-widest rounded-2xl shadow-xl shadow-indigo-200 active:scale-95 transition-all flex items-center justify-center gap-2 cursor-pointer mt-1"
                            >
                                <CheckCircle2 className="w-4 h-4" />
                                <span>PROCESAR RECEPCIÓN FÍSICA ({totalVerifiedBoxes} CAJAS)</span>
                            </button>
                        )}
                    </div>
                </div>
            ) : (
                /* TAB 2: PENDIENTES (100% APP-LIKE MOBILE CARDS LIST) */
                <div className="flex-1 overflow-y-auto p-3 flex flex-col gap-3 custom-scrollbar">
                    {/* Search & Top Mobile Metric Strip */}
                    <div className="bg-white border border-slate-200 rounded-3xl p-3 shadow-sm flex flex-col gap-2.5 shrink-0">
                        <div className="relative">
                            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                            <input 
                                type="text"
                                value={pendingSearchTerm}
                                onChange={(e) => setPendingSearchTerm(e.target.value)}
                                placeholder="Filtrar por código ICO, nombre, guía..."
                                className="w-full pl-9 pr-3 py-2.5 bg-slate-50 border border-slate-200 rounded-2xl text-xs font-bold outline-none focus:border-amber-500 focus:bg-white transition-all uppercase"
                            />
                        </div>

                        {/* Metrics Bar */}
                        <div className="grid grid-cols-2 gap-2">
                            <div className="bg-indigo-50 border border-indigo-100 p-2 rounded-2xl text-center">
                                <span className="text-[7px] font-black text-indigo-500 uppercase block leading-none mb-0.5">Total Cajas XML</span>
                                <span className="text-xs font-black text-indigo-800 font-mono">{totalPendingXmlBoxes} CAJAS</span>
                            </div>

                            <div className={`p-2 rounded-2xl border text-center ${
                                isPendingZero 
                                    ? 'bg-emerald-50 border-emerald-200 text-emerald-800' 
                                    : 'bg-amber-50 border-amber-200 text-amber-800'
                            }`}>
                                <span className="text-[7px] font-black uppercase block leading-none mb-0.5">Pendiente por Escanear</span>
                                <span className="text-xs font-black font-mono">
                                    {pendingUnverifiedBoxes} CAJAS ({pendingUnverifiedCount})
                                </span>
                            </div>
                        </div>
                    </div>

                    {/* App-Like Cards List */}
                    <div className="flex-1 space-y-2.5">
                        {filteredPendingItems.length === 0 ? (
                            <div className="bg-white rounded-3xl p-8 border border-slate-200 text-center">
                                <Package className="w-8 h-8 text-slate-300 mx-auto mb-2" />
                                <p className="text-xs font-black text-slate-400 uppercase italic">
                                    No hay ítems pendientes de validación
                                </p>
                            </div>
                        ) : (
                            filteredPendingItems.map((item) => {
                                const verif = verifiedMap[item.id];
                                const isSaved = !!verif?.isSaved;
                                const isMatch = verif ? verif.physicalQty === item.cantidad_xml : null;
                                const prod = catalog.find(p => p.id === item.producto_id);
                                const tvu = prod ? calculateTVU(item.fecha_vencimiento, prod.vida_util_dias) : null;

                                return (
                                    <div 
                                        key={item.id} 
                                        className={`bg-white border-2 rounded-3xl p-3.5 shadow-sm transition-all flex flex-col gap-2.5 ${
                                            isSaved 
                                                ? isMatch 
                                                    ? 'border-emerald-300 bg-emerald-50/20' 
                                                    : 'border-amber-300 bg-amber-50/20'
                                                : 'border-slate-200 hover:border-indigo-300'
                                        }`}
                                    >
                                        {/* Card Header */}
                                        <div className="flex items-center justify-between">
                                            <div className="flex items-center gap-1.5">
                                                <span className="bg-indigo-50 border border-indigo-100 text-indigo-700 text-[10px] font-black font-mono px-2.5 py-0.5 rounded-xl">
                                                    {item.codigo}
                                                </span>
                                                {item.guia_factura && (
                                                    <span className="bg-slate-100 text-slate-500 text-[8px] font-bold px-2 py-0.5 rounded-md uppercase">
                                                        {item.guia_factura}
                                                    </span>
                                                )}
                                            </div>

                                            {isSaved ? (
                                                <span className={`text-[8px] font-black px-2 py-0.5 rounded-full uppercase tracking-wider flex items-center gap-1 ${
                                                    isMatch 
                                                        ? 'bg-emerald-100 text-emerald-800' 
                                                        : 'bg-amber-100 text-amber-800'
                                                }`}>
                                                    <Check className="w-2.5 h-2.5 stroke-[3]" />
                                                    {isMatch ? 'VERIFICADO (✓)' : 'DIFERENCIA'}
                                                </span>
                                            ) : (
                                                <span className="bg-amber-100 text-amber-800 text-[8px] font-black px-2 py-0.5 rounded-full uppercase tracking-wider">
                                                    PENDIENTE
                                                </span>
                                            )}
                                        </div>

                                        {/* Product Name */}
                                        <h4 className="text-xs font-black text-slate-800 uppercase leading-snug">
                                            {item.nombre}
                                        </h4>

                                        {/* Info Row */}
                                        <div className="grid grid-cols-2 gap-2 bg-slate-50 p-2.5 rounded-2xl border border-slate-100">
                                            <div>
                                                <span className="text-[7px] font-black text-slate-400 uppercase block leading-none mb-0.5">
                                                    {isSaved ? 'Físico / XML' : 'Cant. XML'}
                                                </span>
                                                <span className="text-xs font-black text-slate-800 font-mono">
                                                    {isSaved ? `${verif.physicalQty} / ` : ''}{item.cantidad_xml} CJ
                                                </span>
                                            </div>

                                            <div>
                                                <span className="text-[7px] font-black text-slate-400 uppercase block leading-none mb-0.5">
                                                    Vencimiento
                                                </span>
                                                <div className="flex items-center gap-1">
                                                    <span className="text-[10px] font-black text-amber-800 font-mono">
                                                        {formatCompactDate(item.fecha_vencimiento)}
                                                    </span>
                                                    {tvu && (
                                                        <span className="text-[7px] font-black bg-blue-100 text-blue-700 px-1 rounded">
                                                            {tvu.percentage}%
                                                        </span>
                                                    )}
                                                </div>
                                            </div>
                                        </div>

                                        {/* Action Button: Jump to Scan Tab */}
                                        <button 
                                            type="button"
                                            onClick={() => handleSelectPendingItem(item)}
                                            className={`w-full py-2.5 font-extrabold text-[10px] uppercase rounded-xl transition-all shadow-sm flex items-center justify-center gap-1.5 active:scale-95 cursor-pointer ${
                                                isSaved 
                                                    ? 'bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-200' 
                                                    : 'bg-indigo-600 hover:bg-indigo-700 text-white shadow-indigo-100'
                                            }`}
                                        >
                                            <span>{isSaved ? 'MODIFICAR VALIDACIÓN' : 'ESCANEAR / VALIDAR'}</span>
                                            <ArrowRight className="w-3.5 h-3.5" />
                                        </button>
                                    </div>
                                );
                            })
                        )}
                    </div>
                </div>
            )}
        </div>
    );
};

export default ReceptionLaive;
