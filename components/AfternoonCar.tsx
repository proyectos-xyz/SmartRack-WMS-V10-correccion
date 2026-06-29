
import React, { useState, useEffect } from 'react';
import * as XLSX from 'xlsx-js-style';
import { supabase } from '../supabaseClient';
import { Product } from '../types';
import { 
    Upload, FileSpreadsheet, Truck, Box, CheckCircle, 
    Scan, Trash2, ArrowLeft, RefreshCw,
    Save, XCircle, Database, Gauge, Keyboard,
    Thermometer, Snowflake, Sun, Moon, Camera, Eye,
    Printer
} from './Icons';
import AfternoonMonitor from './AfternoonMonitor';
import { motion, AnimatePresence } from 'motion/react';
import { compressImage, generateStorageFileName } from '../utils';

const EyeOffIcon = ({ className }: { className?: string }) => (
    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
        <path d="M9.88 9.88a3 3 0 1 0 4.24 4.24" />
        <path d="M10.73 5.08A10.43 10.43 0 0 1 12 5c7 0 10 7 10 7a13.16 13.16 0 0 1-1.67 2.68" />
        <path d="M6.61 6.61A13.52 13.52 0 0 0 2 12s3 7 10 7a9.74 9.74 0 0 0 5.39-1.61" />
        <line x1="2" x2="22" y1="2" y2="22" />
    </svg>
);

interface AfternoonCarProps {
    catalog: Product[];
    user: any; // Se usa any para flexibilidad, pero idealmente es Usuario
    initialViewMode?: 'CARGA' | 'PLACAS' | 'CAMARAS' | 'PICKING' | 'PREVIEW' | 'VALIDADOR';
}

interface AfternoonOrder {
    id?: string; // ID de base de datos si ya se guardó
    documento: string;
    cliente: string;
    sku: string;
    codigo: string;
    descripcion: string;
    categoria: string;
    unidad: string;
    cantidad_pedida: number;
    cantidad_picada: number;
    placa: string;
    camara: string; // Específico (Informe, Peso, etc)
    mainCamara: 'SECOS' | 'REFRIGERADO' | 'CONGELADO' | 'PESOS SECOS' | 'PESOS REFRIGERADO' | string;
    subTipo: string;
    completado: boolean;
    ean_validado?: boolean;
    validado: boolean;
    last_picked_at?: string;
    peso_real?: number;
    fecha_vencimiento?: string;
    rtu?: number;
    originalOrders?: AfternoonOrder[]; // Soporte para consolidación
}

interface SubBlock {
    title: string;
    items: AfternoonOrder[];
}

interface PlateGroup {
    placa: string;
    subBlocks: SubBlock[];
    // Mantener compatibilidad con estadísticas anteriores si es necesario
    camaras?: Record<string, any>; 
}

interface MainCameraGroup {
    name: 'SECOS' | 'REFRIGERADO' | 'CONGELADO' | 'PESOS SECOS' | 'PESOS REFRIGERADO' | string;
    plates: PlateGroup[];
}

const isEnsayoProduct = (order: AfternoonOrder | null | undefined): boolean => {
    if (!order) return false;
    return (order.subTipo || '').toUpperCase().includes('ENSAYO') || 
           (order.categoria || '').toUpperCase().includes('ENSAYO') || 
           (order.descripcion || '').toUpperCase().includes('ENSAYO') ||
           (order.camara || '').toUpperCase().includes('ENSAYO');
};

const consolidateItems = (items: AfternoonOrder[]): AfternoonOrder[] => {
    const groups: Record<string, AfternoonOrder[]> = {};
    items.forEach(item => {
        const key = (item.sku || '').trim().toUpperCase();
        if (!groups[key]) {
            groups[key] = [];
        }
        groups[key].push(item);
    });

    return Object.entries(groups).map(([, groupItems]) => {
        if (groupItems.length === 1) {
            return {
                ...groupItems[0],
                originalOrders: groupItems
            };
        }
        const first = groupItems[0];
        const totalPedida = groupItems.reduce((sum, item) => sum + (item.cantidad_pedida || 0), 0);
        const totalPicada = groupItems.reduce((sum, item) => sum + (item.cantidad_picada || 0), 0);
        const uniqueClients = Array.from(new Set(groupItems.map(item => item.cliente).filter(Boolean)));
        
        return {
            ...first,
            cantidad_pedida: totalPedida,
            cantidad_picada: totalPicada,
            completado: totalPicada >= totalPedida,
            validado: groupItems.every(item => item.validado),
            ean_validado: groupItems.every(item => item.ean_validado),
            cliente: uniqueClients.length > 0 ? uniqueClients.join(', ') : 'Varios Clientes',
            originalOrders: groupItems
        };
    });
};

const AfternoonCar: React.FC<AfternoonCarProps> = ({ catalog, user, initialViewMode }) => {
    const [orders, setOrders] = useState<AfternoonOrder[]>([]);
    const [groupedOrders, setGroupedOrders] = useState<MainCameraGroup[]>([]);
    const [isProcessing, setIsProcessing] = useState(false);
    const [selectedPlate, setSelectedPlate] = useState<string | null>(null);
    const [selectedCamera, setSelectedCamera] = useState<'SECOS' | 'REFRIGERADO' | 'CONGELADO' | 'PESOS SECOS' | 'PESOS REFRIGERADO' | null>(null);
    const [selectedSubBlockTitle, setSelectedSubBlockTitle] = useState<string | null>(null);
    const [viewMode, setViewMode] = useState<'CARGA' | 'PLACAS' | 'CAMARAS' | 'PICKING' | 'PREVIEW' | 'VALIDADOR'>(initialViewMode || 'CARGA');

    useEffect(() => {
        if (initialViewMode) {
            setViewMode(initialViewMode);
            if (initialViewMode === 'VALIDADOR') {
                setValidadorSelectedPlate(null);
                setValidadorScans({});
                setValidadorIsFinished(false);
                setValidadorLogs([]);
                setValidadorToast(null);
                setValidadorErrorAlert(null);
            }
        }
    }, [initialViewMode]);
    const [validadorSelectedPlate, setValidadorSelectedPlate] = useState<string | null>(null);
    const [validadorErrorAlert, setValidadorErrorAlert] = useState<{ code: string; name: string } | null>(null);
    const [validadorScans, setValidadorScans] = useState<Record<string, number>>({});
    const [validadorManualEditSku, setValidadorManualEditSku] = useState<string | null>(null);
    const [validadorManualQty, setValidadorManualQty] = useState<string>('');
    const [validadorIsFinished, setValidadorIsFinished] = useState(false);
    const [validadorToast, setValidadorToast] = useState<{ show: boolean, message: string, type: 'success' | 'error' } | null>(null);
    const [validadorLogs, setValidadorLogs] = useState<{ id: string, message: string, type: 'success' | 'warn' | 'error', timestamp: string }[]>([]);
    const [validadorKeyboardMode, setValidadorKeyboardMode] = useState<'SCANNER' | 'MANUAL'>('SCANNER');
    const [validadorBlindMode, setValidadorBlindMode] = useState<boolean>(false);
    const validadorInputRef = React.useRef<HTMLInputElement>(null);
    const [isConsolidated, setIsConsolidated] = useState(false);
    const [tempGrouping, setTempGrouping] = useState<PlateGroup[]>([]);
    const [bulkProcessing, setBulkProcessing] = useState<{ active: boolean, total: number, current: number, currentPlate: string }>({ 
        active: false, total: 0, current: 0, currentPlate: '' 
    });
    
    const [scanBuffer, setScanBuffer] = useState('');
    const [isScanning, setIsScanning] = useState(false);

    // Estados para validación EAN y picking por unidad
    const [validatingOrder, setValidatingOrder] = useState<AfternoonOrder | null>(null);
    const [modalTheme, setModalTheme] = useState<'light' | 'dark'>('light');
    const [validationState, setValidationState] = useState<'IDLE' | 'SUCCESS' | 'ERROR'>('IDLE');

    const [unitScanCount, setUnitScanCount] = useState(0);
    const [lastScanMsg, setLastScanMsg] = useState('');
    const [eanValidated, setEanValidated] = useState(false);
    const [manualMode, setManualMode] = useState(false);

    // Estados para peso y vencimiento
    const [realWeight, setRealWeight] = useState('');
    const [expiryDay, setExpiryDay] = useState('01');
    const [expiryMonth, setExpiryMonth] = useState('01');
    const [expiryYear, setExpiryYear] = useState('2026');

    // Estados de cámara y foto para picking
    const [pickedPhotos, setPickedPhotos] = useState<string[]>([]);
    const [showCameraModal, setShowCameraModal] = useState(false);
    const cameraStreamRef = React.useRef<MediaStream | null>(null);
    const [cameraLoading, setCameraLoading] = useState(false);
    const [cameraError, setCameraError] = useState<string | null>(null);
    const [cameraUploading, setCameraUploading] = useState(false);
    const videoRef = React.useRef<HTMLVideoElement>(null);

    // Estados para selector de vencimiento ENSAYO
    const [showEnsayoDateModal, setShowEnsayoDateModal] = useState(false);
    const [ensayoPendingOrder, setEnsayoPendingOrder] = useState<{order: AfternoonOrder, qty: number} | null>(null);

    // Estados para el modal e impresión de Ensayos por Cliente en A4
    const [printEnsayosSubBlock, setPrintEnsayosSubBlock] = useState<SubBlock | null>(null);
    const [selectedClientToPrint, setSelectedClientToPrint] = useState<string | null>(null);
    const [printCorrelativo, setPrintCorrelativo] = useState('');
    const [printTimestamp, setPrintTimestamp] = useState('');

    const getClientPickedProductsInCamera = (clientName: string) => {
        return orders.filter(o => 
            o.placa === selectedPlate && 
            o.camara === selectedCamera && 
            o.cliente === clientName && 
            (o.cantidad_picada || 0) > 0
        );
    };

    const getClientsInCamera = () => {
        const cameraOrders = orders.filter(o => o.placa === selectedPlate && o.camara === selectedCamera);
        const uniqueClients = Array.from(new Set(cameraOrders.map(o => o.cliente))).filter(Boolean);
        return uniqueClients.map(client => {
            const clientOrders = cameraOrders.filter(o => o.cliente === client);
            const totalItems = clientOrders.length;
            const pickedItems = clientOrders.filter(o => (o.cantidad_picada || 0) > 0).length;
            return {
                name: client,
                totalItems,
                pickedItems
            };
        });
    };

    const handleSelectClientForPrint = (clientName: string) => {
        setSelectedClientToPrint(clientName);
        
        // Generar correlativo
        const key = `smartwms_correlativo_${selectedCamera?.replace(/\s+/g, '_')}`;
        const nextVal = parseInt(localStorage.getItem(key) || '0') + 1;
        localStorage.setItem(key, nextVal.toString());
        const prefix = selectedCamera ? selectedCamera.substring(0, 3).toUpperCase() : 'ROT';
        const corrStr = `${prefix}-${nextVal.toString().padStart(4, '0')}`;
        setPrintCorrelativo(corrStr);

        // Generar fecha y hora
        const now = new Date();
        const formatted = now.toLocaleString('es-PE', {
            year: 'numeric', month: '2-digit', day: '2-digit',
            hour: '2-digit', minute: '2-digit', second: '2-digit'
        });
        setPrintTimestamp(formatted);
    };

    const MONTH_LABELS = [
        { value: '01', label: '01-ENE' },
        { value: '02', label: '02-FEB' },
        { value: '03', label: '03-MAR' },
        { value: '04', label: '04-ABR' },
        { value: '05', label: '05-MAY' },
        { value: '06', label: '06-JUN' },
        { value: '07', label: '07-JUL' },
        { value: '08', label: '08-AGO' },
        { value: '09', label: '09-SEP' },
        { value: '10', label: '10-OCT' },
        { value: '11', label: '11-NOV' },
        { value: '12', label: '12-DIC' },
    ];

    // Estados para confirmación y feedback
    const [confirmingPick, setConfirmingPick] = useState<{order: AfternoonOrder, qty: number} | null>(null);
    const [successFeedback, setSuccessFeedback] = useState(false);
    const [showStatsPlates, setShowStatsPlates] = useState<Record<string, boolean>>({});
    const [showCancelModal, setShowCancelModal] = useState(false);

    // Editar/Registrar EANs faltantes en Picking
    const [activeEanEditType, setActiveEanEditType] = useState<'bulto' | 'producto' | null>(null);
    const [tempEanValue, setTempEanValue] = useState('');
    const [isSavingEan, setIsSavingEan] = useState(false);

    // Rampas y Validación de Carga
    const [plateRamps, setPlateRamps] = useState<Record<string, number>>({});
    const [assigningRampPlate, setAssigningRampPlate] = useState<string | null>(null);
    const [loadValidationPlate, setLoadValidationPlate] = useState<string | null>(null);
    const [scannedTruck, setScannedTruck] = useState<string | null>(null);
    const [scannedRamp, setScannedRamp] = useState<string | null>(null);
    const [loadValidationState, setLoadValidationState] = useState<'IDLE' | 'SCAN_TRUCK' | 'SCAN_RAMP' | 'SUCCESS' | 'ERROR'>('IDLE');
    const [showDeleteModal, setShowDeleteModal] = useState(false);
    const [plateToDelete, setPlateToDelete] = useState<string | null>(null);
    const [showProcessModal, setShowProcessModal] = useState(false);
    const [plateToProcess, setPlateToProcess] = useState<string | null>(null);
    const [showMonitor, setShowMonitor] = useState(false);
    const [showClearAllModal, setShowClearAllModal] = useState(false);

    // Manejo del botón atrás del sistema (Mobile Back Button)
    useEffect(() => {
        const handleBackButton = (e: PopStateEvent) => {
            if (viewMode !== 'PLACAS') {
                e.preventDefault();
                // Determinar a dónde regresar según el modo actual
                if (viewMode === 'PICKING') {
                    setViewMode('CAMARAS');
                } else if (viewMode === 'CAMARAS' || viewMode === 'PREVIEW') {
                    setViewMode('PLACAS');
                }
                // Volver a empujar un estado para que el siguiente "atrás" sea capturado si sigue fuera de PLACAS
                window.history.pushState({ viewMode }, '');
            }
        };

        if (viewMode !== 'PLACAS') {
            window.history.pushState({ viewMode }, '');
            window.addEventListener('popstate', handleBackButton);
        }

        return () => window.removeEventListener('popstate', handleBackButton);
    }, [viewMode]);

    useEffect(() => {
        if (viewMode !== 'PICKING') {
            setSelectedSubBlockTitle(null);
        }
    }, [viewMode]);
    
    // Stats
    const handleDeleteAllPending = async () => {
        setIsProcessing(true);
        try {
            // Cancelar en DB lo que esté cargado y no completado
            const platesToCancel = Array.from(new Set(orders.map(o => o.placa).filter(Boolean)));
            
            if (platesToCancel.length > 0) {
                const { error } = await supabase
                    .from('despacho_encabezado')
                    .update({ 
                        estado: 'CANCELADO',
                        motivo_cancelacion: 'Eliminado por limpieza masiva',
                        usuario_cancelacion: user.nombre || user.username,
                        fecha_cancelacion: new Date().toISOString()
                    })
                    .in('placa_vehiculo', platesToCancel)
                    .eq('tipo_despacho', 'CARRO_TARDE')
                    .neq('estado', 'COMPLETADO')
                    .neq('estado', 'CANCELADO');

                if (error) throw error;
            }

            // Limpiar todo el estado local
            setOrders([]);
            setGroupedOrders([]);
            setTempGrouping([]);
            setViewMode('CARGA');
            setToast({ show: true, message: 'Carga eliminada correctamente', type: 'success' });
        } catch (err) {
            console.error("Error al eliminar carga", err);
            alert("Error al intentar limpiar la carga");
        } finally {
            setIsProcessing(false);
        }
    };

    const handleDeletePlate = async () => {
        if (!plateToDelete) return;
        setIsProcessing(true);
        try {
            const { error } = await supabase
                .from('despacho_encabezado')
                .update({ 
                    estado: 'CANCELADO',
                    motivo_cancelacion: 'Eliminado por usuario',
                    usuario_cancelacion: user.nombre || user.username,
                    fecha_cancelacion: new Date().toISOString()
                })
                .eq('placa_vehiculo', plateToDelete)
                .eq('tipo_despacho', 'CARRO_TARDE')
                .neq('estado', 'COMPLETADO');

            if (error) throw error;

            setOrders(prev => prev.filter(o => o.placa !== plateToDelete));
            setGroupedOrders(prev => prev.map(main => ({
                ...main,
                plates: main.plates.filter(p => p.placa !== plateToDelete)
            })));
            setShowDeleteModal(false);
            setPlateToDelete(null);
            setToast({ show: true, message: 'Vehículo eliminado correctamente', type: 'success' });
        } catch (err) {
            console.error("Error deleting plate", err);
            alert("Error al eliminar el vehículo");
        } finally {
            setIsProcessing(false);
        }
    };

    const handleProcessPlate = async () => {
        if (!plateToProcess) return;
        setIsProcessing(true);
        try {
            const { error } = await supabase
                .from('despacho_encabezado')
                .update({ 
                    estado: 'COMPLETADO',
                    fecha_despacho: new Date().toISOString()
                })
                .eq('placa_vehiculo', plateToProcess)
                .eq('tipo_despacho', 'CARRO_TARDE')
                .neq('estado', 'COMPLETADO');

            if (error) throw error;

            setOrders(prev => prev.filter(o => o.placa !== plateToProcess));
            setGroupedOrders(prev => prev.map(main => ({
                ...main,
                plates: main.plates.filter(p => p.placa !== plateToProcess)
            })));
            setShowProcessModal(false);
            setPlateToProcess(null);
            setToast({ show: true, message: 'Vehículo procesado correctamente', type: 'success' });
        } catch (err) {
            console.error("Error processing plate", err);
            alert("Error al procesar el vehículo");
        } finally {
            setIsProcessing(false);
        }
    };

    const [toast, setToast] = useState<{show: boolean, message: string, type: 'success' | 'error'}>({show: false, message: '', type: 'success'});

    useEffect(() => {
        if (toast.show) {
            const timer = setTimeout(() => setToast({ show: false, message: '', type: 'success' }), 3000);
            return () => clearTimeout(timer);
        }
    }, [toast.show]);

    const stats = {
        totalItems: orders.length,
        pickedItems: orders.filter(o => o.completado).length,
        totalQty: orders.reduce((acc, o) => acc + o.cantidad_pedida, 0),
        pickedQty: orders.reduce((acc, o) => acc + o.cantidad_picada, 0),
        progress: orders.length > 0 ? Math.round((orders.filter(o => o.completado).length / orders.length) * 100) : 0
    };

    useEffect(() => {
        fetchCarroTardeData();
    }, []);

    const handleExportPlateExcel = async (plate: string) => {
        setIsProcessing(true);
        try {
            const { data: items, error } = await supabase
                .from('despachos_item')
                .select(`
                    id,
                    codigo,
                    descripcion,
                    cantidad_pedida,
                    cantidad_despachada,
                    unidad_medida,
                    categoria,
                    tipo_camara,
                    estado,
                    ean_validado,
                    fecha_preparacion,
                    usuario_preparacion,
                    despacho_encabezado!inner (
                        documento,
                        cliente,
                        placa_vehiculo
                    )
                `)
                .eq('despacho_encabezado.placa_vehiculo', plate)
                .eq('despacho_encabezado.tipo_despacho', 'CARRO_TARDE');

            if (error) throw error;

            if (!items || items.length === 0) {
                setToast({ show: true, message: 'No hay datos guardados para esta placa', type: 'error' });
                return;
            }

            const excelData = items.map(item => {
                const header = (item as any).despacho_encabezado;
                const lastPickedDate = item.fecha_preparacion ? new Date(item.fecha_preparacion) : null;
                
                return {
                    'Placa': header?.placa_vehiculo,
                    'Documento': header?.documento,
                    'Cliente': header?.cliente,
                    'Código': item.codigo,
                    'Descripción': item.descripcion,
                    'Categoría': item.categoria,
                    'Cámara': item.tipo_camara,
                    'Cant. Pedida': item.cantidad_pedida,
                    'Cant. Despachada': item.cantidad_despachada,
                    'Unidad': item.unidad_medida,
                    'Estado': item.estado,
                    'Validación EAN': item.ean_validado ? 'SÍ' : 'NO',
                    'Fecha/Hora Escaneo': lastPickedDate ? lastPickedDate.toLocaleString() : 'N/A',
                    'Operario': item.usuario_preparacion || 'N/A',
                    'Validación Final': item.estado === 'COMPLETADO' ? 'VALIDADO' : 'PENDIENTE'
                };
            });

            const ws = XLSX.utils.json_to_sheet(excelData);
            const wb = XLSX.utils.book_new();
            XLSX.utils.book_append_sheet(wb, ws, `Plate_${plate}`);
            XLSX.writeFile(wb, `Reporte_Placa_${plate}_${new Date().toISOString().split('T')[0]}.xlsx`);
            
            setToast({ show: true, message: 'Excel generado exitosamente', type: 'success' });
        } catch (err) {
            console.error("Error exporting plate excel", err);
            setToast({ show: true, message: 'Error al generar Excel', type: 'error' });
        } finally {
            setIsProcessing(false);
        }
    };

    const getProgressColor = (progress: number) => {
        const isAdminOrAsistent = user?.rol === 'ADMIN' || user?.rol === 'ASISTENTE';
        if (isAdminOrAsistent) {
            if (progress < 90) return 'bg-rose-500';
            if (progress < 98) return 'bg-amber-500';
            return 'bg-emerald-500';
        }
        return 'bg-lime-500';
    };

    const fetchCarroTardeData = async () => {
        setIsProcessing(true);
        try {
            let query = supabase
                .from('despacho_encabezado')
                .select(`
                    id,
                    documento,
                    cliente,
                    placa_vehiculo,
                    rampa_asignada,
                    despachos_item (*)
                `)
                .eq('tipo_despacho', 'CARRO_TARDE')
                .neq('estado', 'COMPLETADO')
                .neq('estado', 'CANCELADO');

            if (user?.sede_id) {
                query = query.eq('sede_id', user.sede_id);
            }

            const { data, error } = await query;

            if (error) throw error;

            if (data && data.length > 0) {
                const loadedOrders: AfternoonOrder[] = [];
                const ramps: Record<string, number> = {};

                data.forEach(header => {
                    if (header.placa_vehiculo && header.rampa_asignada) {
                        ramps[header.placa_vehiculo] = header.rampa_asignada;
                    }
                    const items = (header as any).despachos_item || [];
                    items.forEach((item: any) => {
                        const productData = catalog.find(p => p.codigo === (item.codigo || item.sku));
                        
                        const tipo_camara = String(item.tipo_camara || 'SECOS|UNIDADES');
                        let mainCamara: 'SECOS' | 'REFRIGERADO' | 'CONGELADO' = 'SECOS';
                        let subTipo = 'UNIDADES';

                        if (tipo_camara.includes('|')) {
                            const [main, sub] = tipo_camara.split('|');
                            mainCamara = main as any;
                            subTipo = sub;
                        } else {
                            if (tipo_camara === 'CONGELADO') mainCamara = 'CONGELADO';
                            else if (tipo_camara === 'REFRIGERADO') mainCamara = 'REFRIGERADO';
                            else mainCamara = 'SECOS';
                            subTipo = 'UNIDADES';
                        }

                        loadedOrders.push({
                            id: item.id,
                            documento: header.documento || '',
                            cliente: header.cliente || '',
                            sku: item.codigo || item.sku || '',
                            codigo: item.codigo || item.sku || '',
                            descripcion: item.descripcion || 'SIN DESCRIPCIÓN',
                            categoria: item.categoria || 'OTROS',
                            unidad: item.unidad_medida || item.unidad || 'UND',
                            rtu: productData?.unidades_por_caja || 1,
                            cantidad_pedida: item.cantidad_pedida,
                            cantidad_picada: item.cantidad_despachada || 0,
                            placa: header.placa_vehiculo || 'SIN PLACA',
                            mainCamara,
                            subTipo,
                            camara: tipo_camara,
                            completado: item.estado === 'COMPLETADO',
                            ean_validado: item.ean_validado || false,
                            validado: item.estado === 'COMPLETADO',
                            last_picked_at: item.last_picked_at
                        });
                    });
                });

                if (loadedOrders.length > 0) {
                    setOrders(loadedOrders);
                    setPlateRamps(ramps);
                    processGrouping(loadedOrders);
                    if (initialViewMode === 'VALIDADOR') {
                        setViewMode('VALIDADOR');
                    } else {
                        setViewMode('CAMARAS');
                    }
                }
            }
        } catch (err) {
            console.error("Error fetching Carro Tarde", err);
        } finally {
            setIsProcessing(false);
        }
    };

    const downloadTemplate = () => {
        const headers = [
            "Nmero de documento", "Nmero de referencia del SN", "Nmero de lnea", "Status de documento",
            "Fecha de documento", "Fecha de creacin", "Hora de creacin - Incl. segundos", "Cdigo SN",
            "Nombre de cliente/proveedor", "Cdigo de almacn", "Nmero de artculo", "Categoria",
            "Unidad", "Cdigo del empleado del departamento de ventas", "Nombre de empleado del departamento de ventas",
            "Departamento", "Provincia", "Distrito", "Direccion", "Placa del vehculo", "Secos",
            "Refrigerados", "Congelados", "Peso", "Artculos por unidad compra", "Cantidad", "Peso 1",
            "Cdigo de Viaje", "Informe de Ensayo", "SubTotal", "Impuesto total", "Total del documento", "Comentarios"
        ];
        
        const data = [
            [1180523, "", "", "O", "06/05/2026", "06/05/2026", "10:07:50", "C10438071712", "REYNOSO LEGOVIC DANIELA GLORIA", 100, "LAA022", "QUESOS", "NIU", 47, "ALBERTO PARREÑO", "LIMA", "LIMA", "JESUS MARIA", "RESIDENCIAL SAN FELIPE", "AWZ803", "N", "Y", "N", "N", 36, 6, 1.36, "2605061142", "N", 324.68, 58.44, 383.12, ""],
            [1180523, "", 1, "O", "06/05/2026", "06/05/2026", "10:07:50", "C10438071712", "REYNOSO LEGOVIC DANIELA GLORIA", 100, "LAC002", "CREMA DE LECHE", "NIU", 47, "ALBERTO PARREÑO", "LIMA", "LIMA", "JESUS MARIA", "RESIDENCIAL SAN FELIPE", "AWZ803", "N", "Y", "N", "N", 1, 8, 7.57, "2605061142", "N", 324.68, 58.44, 383.12, ""],
            [1180573, "", "", "O", "06/05/2026", "06/05/2026", "11:04:04", "C20254115798", "MIRKODONI S.A.C.", 100, "LAC002", "CREMA DE LECHE", "NIU", 41, "CINTHYA VILLEGAS", "LIMA", "LIMA", "MIRAFLORES", "CAL. TARAPACA 263", "AWZ803", "N", "Y", "N", "N", 1, 5, 4.73, "2605061142", "N", 204.3, 36.78, 241.08, ""],
            [1180505, "", "", "O", "06/05/2026", "06/05/2026", "09:43:59", "C20608374354", "DANBAM S.A.C.", 100, "LAA034", "QUESOS", "KGM", 33, "VICTOR OLIVERA", "LIMA", "LIMA", "SAN BORJA", "AV. AVIACION 3299", "BWF450", "N", "Y", "N", "N", 1, 16.8, 16.8, "2605061142", "N", 655.08, 117.92, 773.00, ""],
            [1180505, "", 1, "O", "06/05/2026", "06/05/2026", "09:43:59", "C20608374354", "DANBAM S.A.C.", 100, "AIA001", "AVES IMPORTADAS", "KGM", 33, "VICTOR OLIVERA", "LIMA", "LIMA", "SAN BORJA", "AV. AVIACION 3299", "BWF450", "N", "N", "Y", "N", 1, 16, 16, "2605061142", "N", 655.08, 117.92, 773.00, ""],
            [1180464, "", "", "O", "06/05/2026", "06/05/2026", "08:48:17", "C20612400661", "LEDC PERU E.I.R.L.", 100, "SRA002", "PAPAS CONGELADAS", "NIU", 17, "EDUARDO MONCADA", "LIMA", "LIMA", "LA VICTORIA", "AV. VILLARAN 500", "BWF450", "N", "N", "Y", "N", 4, 2, 5, "2605061142", "N", 33.9, 6.1, 40.00, ""],
            [1180523, "", 2, "O", "06/05/2026", "06/05/2026", "10:07:50", "C10438071712", "REYNOSO LEGOVIC DANIELA GLORIA", 100, "LAB001", "LECHES FRESCAS", "NIU", 47, "ALBERTO PARREÑO", "LIMA", "LIMA", "JESUS MARIA", "RESIDENCIAL SAN FELIPE", "AWZ803", "Y", "N", "N", "N", 12, 8, 7.2, "2605061142", "N", 324.68, 58.44, 383.12, ""],
            [1180479, "", "", "O", "06/05/2026", "06/05/2026", "09:17:24", "C20613305794", "DODO DONUTS S.A.C.", 100, "CNA002", "COBERTURAS", "NIU", 41, "CINTHYA VILLEGAS", "LIMA", "LIMA", "MIRAFLORES", "AV. DOS DE MAYO 535", "XYZ123", "Y", "N", "N", "N", 10, 2, 2, "2605061142", "N", 202.09, 36.37, 238.46, ""],
            [1180479, "", 1, "O", "06/05/2026", "06/05/2026", "09:17:24", "C20613305794", "DODO DONUTS S.A.C.", 100, "CNA012", "COBERTURAS", "NIU", 41, "CINTHYA VILLEGAS", "LIMA", "LIMA", "MIRAFLORES", "AV. DOS DE MAYO 535", "XYZ123", "Y", "N", "N", "N", 10, 2, 2, "2605061142", "N", 202.09, 36.37, 238.46, ""],
            [1180600, "", "", "O", "06/05/2026", "06/05/2026", "12:00:00", "C20600000001", "TIENDA EJEMPLO 10", 100, "LAA001", "QUESOS", "NIU", 10, "VENDEDOR PRUEBA", "LIMA", "LIMA", "SURCO", "AV. LOS INCAS 123", "XYZ123", "N", "Y", "N", "N", 1, 10, 5, "2605061142", "N", 100, 18, 118, "EJEMPLO 10"]
        ];
        
        const ws = XLSX.utils.aoa_to_sheet([headers, ...data]);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, "CarroTarde");
        XLSX.writeFile(wb, "Plantilla_Picking_Piking.xlsx");
    };

    const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        setIsProcessing(true);
        const reader = new FileReader();
        reader.onload = (evt) => {
            try {
                const bstr = evt.target?.result;
                const wb = XLSX.read(bstr, { type: 'binary' });
                const wsname = wb.SheetNames[0];
                const ws = wb.Sheets[wsname];
                const data = XLSX.utils.sheet_to_json(ws);

                if (data.length === 0) {
                    alert("El archivo está vacío");
                    setIsProcessing(false);
                    return;
                }

                const mapped: AfternoonOrder[] = data.map((row: any) => {
                    const isInforme = row['Informe de Ensayo'] === 'Y' || row['Ensayo'] === 'Y';
                    const isPesoCol = row['Peso'] === 'Y';
                    const unidad = String(row['Unidad'] || row['UM'] || 'UND').trim().toUpperCase();

                    const isCong = row['Congelados'] === 'Y' || row['Congelado'] === 'Y';
                    const isRefri = row['Refrigerados'] === 'Y' || row['Refrigerado'] === 'Y';
                    const isSeco = row['Secos'] === 'Y' || row['Seco'] === 'Y';

                    let mainCamara = 'SECOS';
                    let subTipo = 'UNIDADES';

                    if (isCong) {
                        mainCamara = 'CONGELADO';
                        subTipo = 'UNIDADES'; // Congelado no tiene subdivisions en la imagen
                    } else if (isRefri) {
                        if (isPesoCol) {
                            mainCamara = 'PESOS REFRIGERADO';
                            subTipo = isInforme ? 'ENSAYOS PESOS' : 'PESOS';
                        } else {
                            mainCamara = 'REFRIGERADO';
                            subTipo = isInforme ? 'ENSAYOS UNIDADES' : 'PICKING DE UNIDADES';
                        }
                    } else if (isSeco) {
                        if (isPesoCol) {
                            mainCamara = 'PESOS SECOS';
                            const category = String(row['Categoria'] || row['Categoría'] || '').trim().toUpperCase();
                            if (isInforme) subTipo = 'ENSAYOS PESOS';
                            else if (category === 'HUEVOS') subTipo = 'HUEVOS';
                            else subTipo = 'PESOS';
                        } else {
                            mainCamara = 'SECOS';
                            subTipo = isInforme ? 'ENSAYOS UNIDADES' : 'PICKING DE UNIDADES';
                        }
                    } else {
                        const camaraRaw = (row['Camara'] || row['Cámara'] || row['Tipo Camara'] || row['Tipo Cámara'] || row['Tipo'] || '').toString().toUpperCase();
                        if (camaraRaw.includes('CONGELADO')) {
                            mainCamara = 'CONGELADO';
                            subTipo = 'UNIDADES';
                        } else if (camaraRaw.includes('REFRIGERADO')) {
                            if (isPesoCol) {
                                mainCamara = 'PESOS REFRIGERADO';
                                subTipo = isInforme ? 'ENSAYOS PESOS' : 'PESOS';
                            } else {
                                mainCamara = 'REFRIGERADO';
                                subTipo = isInforme ? 'ENSAYOS UNIDADES' : 'PICKING DE UNIDADES';
                            }
                        } else {
                            if (isPesoCol) {
                                mainCamara = 'PESOS SECOS';
                                const category = String(row['Categoria'] || row['Categoría'] || '').trim().toUpperCase();
                                if (isInforme) subTipo = 'ENSAYOS PESOS';
                                else if (category === 'HUEVOS') subTipo = 'HUEVOS';
                                else subTipo = 'PESOS';
                            } else {
                                mainCamara = 'SECOS';
                                subTipo = isInforme ? 'ENSAYOS UNIDADES' : 'PICKING DE UNIDADES';
                            }
                        }
                    }

                    // Camara específica para guardar en DB (Concatenamos para no perder info si no hay columnas nuevas)
                    const camaraGuardar = `${mainCamara}|${subTipo}`;

                    const sku = String(row['Nmero de artculo'] || row['Codigo'] || row['Código'] || row['Cdigo'] || '').trim().toUpperCase();
                    const codigo = sku; 
                    const productData = catalog.find(p => p.codigo === sku);
                    const descripcion = row['Producto'] || row['Descripción'] || productData?.nombre || 'Producto No Encontrado';
                    const placaKey = Object.keys(row).find(k => k.toUpperCase().includes('PLACA') || k.toUpperCase().includes('VEHICULO') || k.toUpperCase().includes('VEHÍCULO') || k.toUpperCase().includes('CAMION') || k.toUpperCase().includes('CAMIÓN'));
                    const placa = String(placaKey ? row[placaKey] : (row['Placa del vehculo'] || row['Placa'] || row['Vehiculo'] || row['Camión'] || row['Camion'] || 'SIN PLACA')).trim().toUpperCase();

                    return {
                        documento: String(row['Nmero de documento'] || row['Documento'] || row['Nro'] || ''),
                        cliente: String(row['Nombre de cliente/proveedor'] || row['Cliente'] || ''),
                        sku,
                        codigo,
                        descripcion,
                        rtu: productData?.unidades_por_caja || 1,
                        categoria: String(row['Categoria'] || row['Categoría'] || 'OTROS').trim().toUpperCase(),
                        unidad,
                        cantidad_pedida: Number(row['Cantidad'] || row['Cant'] || row['TOTAL'] || 0),
                        cantidad_picada: 0,
                        placa,
                        mainCamara,
                        subTipo,
                        camara: camaraGuardar,
                        completado: false,
                        validado: false
                    };
                });

                // Agrupar temporalmente para previzualización
                const plates: Record<string, PlateGroup> = {};
                mapped.forEach(order => {
                    if (!plates[order.placa]) {
                        plates[order.placa] = { placa: order.placa, camaras: {}, subBlocks: [] };
                    }
                    const p = plates[order.placa];
                    if (p && p.camaras) {
                        if (!p.camaras[order.camara]) {
                            p.camaras[order.camara] = { camara: order.camara, items: [] };
                        }
                        const cam = p.camaras[order.camara];
                        if (cam) cam.items.push(order);
                    }
                });

                setTempGrouping(Object.values(plates));
                setViewMode('PREVIEW');
            } catch (err) {
                console.error("Error processing file", err);
                alert("Error al procesar el archivo. Verifique el formato.");
            } finally {
                setIsProcessing(false);
            }
        };
        reader.readAsBinaryString(file);
    };

    const [showBulkConfirm, setShowBulkConfirm] = useState(false);

    const processCarToDB = async (plateGroup: PlateGroup, isBulk: boolean = false) => {
        if (!isBulk) setIsProcessing(true);
        try {
            console.log(`Procesando carro: ${plateGroup.placa}`, plateGroup);
            const allOrders = Object.values(plateGroup.camaras || {}).flatMap((c: any) => c.items || []);
            
            if (allOrders.length === 0) {
                console.warn(`No hay órdenes para la placa ${plateGroup.placa}`);
                return;
            }

            const docsInPlate = Array.from(new Set(allOrders.map(o => o.documento)));
            console.log(`Documentos a procesar para ${plateGroup.placa}:`, docsInPlate);

            for (const doc of docsInPlate) {
                const docOrders = allOrders.filter(o => o.documento === doc);
                const first = docOrders[0];

                console.log(`Insertando encabezado para doc ${doc}`);
                const { data: header, error: hError } = await supabase
                    .from('despacho_encabezado')
                    .insert({
                        documento: doc,
                        cliente: first.cliente,
                        provincia: 'LIMA - CARRO TARDE',
                        total_items: docOrders.length,
                        placa_vehiculo: plateGroup.placa,
                        fecha_creacion: new Date().toISOString(),
                        estado: 'PENDIENTE',
                        tipo_despacho: 'CARRO_TARDE',
                        comentario: 'CARRO DE LA TARDE',
                        sede_id: user?.sede_id
                    })
                    .select()
                    .single();

                if (hError) {
                    console.error("Error insertando encabezado:", hError);
                    throw hError;
                }

                const itemsToInsert = docOrders.map(o => ({
                    encabezado_id: header.id,
                    producto_id: catalog.find(p => p.codigo === o.sku || p.codigo === o.codigo)?.id,
                    codigo: o.codigo || o.sku,
                    descripcion: o.descripcion,
                    cantidad_pedida: o.cantidad_pedida,
                    cantidad_despachada: 0,
                    unidad_medida: o.unidad,
                    categoria: o.categoria,
                    tipo_camara: o.camara,
                    estado: 'PENDIENTE',
                    sede_id: user?.sede_id
                }));

                console.log(`Insertando ${itemsToInsert.length} items para doc ${doc}`);
                const { error: iError } = await supabase
                    .from('despachos_item')
                    .insert(itemsToInsert);

                if (iError) {
                    console.error("Error insertando items:", iError);
                    throw iError;
                }
            }

            // Quitar de temporales
            setTempGrouping(prev => prev.filter(p => p.placa !== plateGroup.placa));
            
            if (!isBulk) {
                await fetchCarroTardeData();
                setSuccessFeedback(true);
                setTimeout(() => setSuccessFeedback(false), 2000);
            }
        } catch (err) {
            console.error("Error crítico al procesar carro:", err);
            if (!isBulk) alert("Error al guardar en base de datos. Verifique consola.");
            throw err; 
        } finally {
            if (!isBulk) setIsProcessing(false);
        }
    };

    const processGrouping = (data: AfternoonOrder[]) => {
        const mainGroups: Record<string, Record<string, Record<string, AfternoonOrder[]>>> = {
            'SECOS': {},
            'REFRIGERADO': {},
            'CONGELADO': {},
            'PESOS SECOS': {},
            'PESOS REFRIGERADO': {}
        };

        data.forEach(order => {
            const mc = order.mainCamara || 'SECOS';
            const pl = order.placa;
            const st = order.subTipo || 'UNIDADES';

            if (!mainGroups[mc]) mainGroups[mc] = {};
            if (!mainGroups[mc][pl]) mainGroups[mc][pl] = {};
            if (!mainGroups[mc][pl][st]) mainGroups[mc][pl][st] = [];
            mainGroups[mc][pl][st].push(order);
        });

        const finalGrouping: MainCameraGroup[] = (['SECOS', 'REFRIGERADO', 'CONGELADO', 'PESOS SECOS', 'PESOS REFRIGERADO'] as const).map(mcName => {
            const platesMap = mainGroups[mcName];
            const plates: PlateGroup[] = Object.entries(platesMap).map(([plName, subMap]) => {
                const subBlocks: SubBlock[] = [];
                const camaras: Record<string, { camara: string, items: AfternoonOrder[] }> = {};

                Object.entries(subMap).forEach(([stName, items]) => {
                    const sortedItems = [...items].sort((a, b) => 
                        (a.categoria || '').localeCompare(b.categoria || '') ||
                        a.descripcion.localeCompare(b.descripcion)
                    );
                    subBlocks.push({ title: stName, items: sortedItems });
                    camaras[stName] = { camara: stName, items };
                });

                return { placa: plName, subBlocks, camaras };
            }).sort((a, b) => a.placa.localeCompare(b.placa));
            
            return { name: mcName, plates };
        });

        setGroupedOrders(finalGrouping);
    };

    // Escucha de teclado para escáner
    const inputRef = React.useRef<HTMLInputElement>(null);
    const modalInputRef = React.useRef<HTMLInputElement>(null);
    const scanTimeoutRef = React.useRef<NodeJS.Timeout | null>(null);

    // Buffer interno via ref para no perder chars entre renders
    const globalScanBuffer = React.useRef('');

    useEffect(() => {
        if (validatingOrder || loadValidationPlate) {
            setScanBuffer('');
            setEanValidated(false);
            setRealWeight('');
            setPickedPhotos([]);
            setCameraError(null);
            setExpiryDay(new Date().getDate().toString().padStart(2, '0'));
            setExpiryMonth((new Date().getMonth() + 1).toString().padStart(2, '0'));
            setExpiryYear(new Date().getFullYear().toString());
        }
    }, [validatingOrder, loadValidationPlate]);

    // Gestión del Stream de Cámara para Captura de Fotos
    useEffect(() => {
        if (showCameraModal) {
            setCameraLoading(true);
            setCameraError(null);
            navigator.mediaDevices.getUserMedia({ 
                video: { facingMode: 'environment', width: { ideal: 1280 }, height: { ideal: 720 } } 
            })
            .then(s => {
                cameraStreamRef.current = s;
                if (videoRef.current) {
                    videoRef.current.srcObject = s;
                    videoRef.current.play().catch(err => console.error("Video play failed", err));
                }
            })
            .catch(err => {
                console.error("Camera access failed", err);
                setCameraError("No se pudo acceder a la cámara trasera. Puedes usar la opción de subir archivo.");
            })
            .finally(() => {
                setCameraLoading(false);
            });
        }
        return () => {
            if (cameraStreamRef.current) {
                cameraStreamRef.current.getTracks().forEach(track => track.stop());
                cameraStreamRef.current = null;
            }
        };
    }, [showCameraModal]);

    const handleCapturePhoto = async () => {
        if (!videoRef.current) return;
        try {
            setCameraUploading(true);
            const video = videoRef.current;
            const canvas = document.createElement('canvas');
            canvas.width = video.videoWidth || 640;
            canvas.height = video.videoHeight || 480;
            const ctx = canvas.getContext('2d');
            if (ctx) {
                ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
            }
            
            canvas.toBlob(async (blob) => {
                if (!blob) {
                    setCameraError("No se pudo capturar la imagen.");
                    setCameraUploading(false);
                    return;
                }
                
                const file = new File([blob], "camera_capture.jpg", { type: "image/jpeg" });
                // Optimizar peso de imagen con maxWidth = 850, quality = 0.6
                const compressedBlob = await compressImage(file, 850, 0.61);
                
                const fileName = generateStorageFileName();
                const filePath = `picking/${fileName}`;
                
                const { error: uploadError } = await supabase.storage
                    .from('evidencias')
                    .upload(filePath, compressedBlob, { contentType: 'image/jpeg', upsert: true });
                
                if (uploadError) {
                    throw uploadError;
                }
                
                const { data: { publicUrl } } = supabase.storage
                    .from('evidencias')
                    .getPublicUrl(filePath);
                
                setPickedPhotos([publicUrl]);
                setShowCameraModal(false);
                setCameraUploading(false);
            }, 'image/jpeg', 0.65);
        } catch (err: any) {
            console.error("Error capturing/uploading photo:", err);
            setCameraError("Error al guardar la foto: " + err.message);
            setCameraUploading(false);
        }
    };

    const handleFileUploadChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        try {
            setCameraUploading(true);
            setCameraError(null);
            
            // Optimizar peso de imagen con maxWidth = 850, quality = 0.6
            const compressedBlob = await compressImage(file, 850, 0.61);
            
            const fileName = generateStorageFileName();
            const filePath = `picking/${fileName}`;
            
            const { error: uploadError } = await supabase.storage
                .from('evidencias')
                .upload(filePath, compressedBlob, { contentType: 'image/jpeg', upsert: true });
                
            if (uploadError) {
                throw uploadError;
            }
            
            const { data: { publicUrl } } = supabase.storage
                .from('evidencias')
                .getPublicUrl(filePath);
            
            setPickedPhotos([publicUrl]);
            setShowCameraModal(false);
            setCameraUploading(false);
        } catch (err: any) {
            console.error("Error uploading photo:", err);
            setCameraError("Error al subir la foto: " + err.message);
            setCameraUploading(false);
        }
    };

    const handleSaveEan = async () => {
        if (!tempEanValue.trim()) {
            setToast({ show: true, message: 'Ingrese un código EAN válido', type: 'error' });
            return;
        }

        const targetProduct = catalog.find(p => p.sku === validatingOrder?.sku || p.codigo === validatingOrder?.sku);
        if (!targetProduct) {
            setToast({ show: true, message: 'No se encontró el producto en el catálogo', type: 'error' });
            return;
        }

        setIsSavingEan(true);
        const cleanEan = tempEanValue.trim();

        try {
            const updateData: any = {};
            if (activeEanEditType === 'bulto') {
                updateData.ean_bulto = cleanEan;
            } else {
                updateData.sku = cleanEan;
            }

            const { error } = await supabase
                .from('productos')
                .update(updateData)
                .eq('codigo', targetProduct.codigo);

            if (error) throw error;

            // Update in-memory product immediately so validation works instantly
            if (activeEanEditType === 'bulto') {
                targetProduct.ean_bulto = cleanEan;
            } else {
                targetProduct.sku = cleanEan;
            }

            setToast({ 
                show: true, 
                message: `EAN de ${activeEanEditType === 'bulto' ? 'Bulto' : 'Producto'} guardado correctamente`, 
                type: 'success' 
            });

            setActiveEanEditType(null);
            setTempEanValue('');
        } catch (err: any) {
            console.error("Error saving EAN:", err);
            setToast({ show: true, message: 'Error tratando de guardar el EAN en la BD', type: 'error' });
        } finally {
            setIsSavingEan(false);
        }
    };

    // ─── AUTO-ACTIVACIÓN HID AL ABRIR MODAL ───
    // Problema: autoFocus en el input visible ocurre durante la animación de motion,
    // antes de que Android registre el canal HID de la pistola.
    // Solución: esperar a que motion termine (~300ms) y luego enfocar el modalInputRef.
    // Esto replica programáticamente el "truco" manual→laser que el usuario hacía.
    useEffect(() => {
        if (!validatingOrder) return;
        const t = setTimeout(() => {
            if (modalInputRef.current) {
                modalInputRef.current.focus();
            }
        }, 320);
        return () => clearTimeout(t);
    }, [validatingOrder]);

    useEffect(() => {
        if (!loadValidationPlate) return;
        const t = setTimeout(() => {
            if (modalInputRef.current) {
                modalInputRef.current.focus();
            }
        }, 320);
        return () => clearTimeout(t);
    }, [loadValidationPlate]);

    // Helper: devuelve el ref activo según contexto
    // Si hay modal abierto (validatingOrder o loadValidationPlate) → modalInputRef
    // Si estamos en PICKING puro → inputRef oculto
    const getActiveInputRef = () => {
        if (viewMode === 'VALIDADOR') {
            if (validadorManualEditSku !== null) return { current: null } as any;
            if (validadorKeyboardMode === 'MANUAL') return { current: null } as any;
            return validadorInputRef;
        }
        if (validatingOrder || loadValidationPlate) return modalInputRef;
        return inputRef;
    };

    // Re-enfocar si la ventana recupera visibilidad (Android background/foreground)
    useEffect(() => {
        const handleVisibility = () => {
            const isActive = viewMode === 'PICKING' || (viewMode === 'VALIDADOR' && validadorKeyboardMode === 'SCANNER') || !!validatingOrder || !!loadValidationPlate;
            if (!document.hidden && isActive) {
                setTimeout(() => getActiveInputRef().current?.focus(), 150);
            }
        };
        document.addEventListener('visibilitychange', handleVisibility);
        return () => document.removeEventListener('visibilitychange', handleVisibility);
    }, [viewMode, validatingOrder, loadValidationPlate, validadorManualEditSku, validadorKeyboardMode]);

    // Capturar foco cuando el usuario toca la pantalla (excepto inputs legítimos)
    useEffect(() => {
        const handleWindowClick = (e: MouseEvent) => {
            const target = e.target as HTMLElement;
            const tag = target?.tagName;
            const isUserInput = tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT';
            const isActive = viewMode === 'PICKING' || (viewMode === 'VALIDADOR' && validadorKeyboardMode === 'SCANNER') || !!validatingOrder || !!loadValidationPlate;
            if (!isUserInput && isActive) {
                getActiveInputRef().current?.focus();
            }
        };
        window.addEventListener('click', handleWindowClick, true);
        return () => window.removeEventListener('click', handleWindowClick, true);
    }, [viewMode, validatingOrder, loadValidationPlate, validadorManualEditSku, validadorKeyboardMode]);

    // Enfocar al activar el modo scanner (PICKING puro sin modal)
    useEffect(() => {
        const isActive = viewMode === 'PICKING';
        if (isActive && !validatingOrder && !loadValidationPlate) {
            setTimeout(() => inputRef.current?.focus(), 80);
        }
    }, [viewMode, loadValidationPlate, validatingOrder]);

    // Enfocar al activar el modo scanner en VALIDADOR
    useEffect(() => {
        const isActive = viewMode === 'VALIDADOR' && validadorKeyboardMode === 'SCANNER';
        if (isActive && validadorSelectedPlate && validadorManualEditSku === null) {
            setTimeout(() => validadorInputRef.current?.focus(), 80);
        }
    }, [viewMode, validadorSelectedPlate, validadorManualEditSku, validadorKeyboardMode]);

    // Auto-dismiss validadorToast
    useEffect(() => {
        if (validadorToast?.show) {
            const timer = setTimeout(() => {
                setValidadorToast(null);
            }, 5000);
            return () => clearTimeout(timer);
        }
    }, [validadorToast]);

    // Handler para el <input> oculto que recibe el HID de la pistola
    const handleHiddenInputKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            const code = (e.currentTarget.value || '').trim().toUpperCase();
            e.currentTarget.value = ''; // limpiar el input después de cada escaneo
            globalScanBuffer.current = '';
            setScanBuffer('');
            if (scanTimeoutRef.current) clearTimeout(scanTimeoutRef.current);
            if (code) handleScan(code);
            return;
        }

        // Debounce fallback: para PDAs que no envían Enter al final del código
        if (scanTimeoutRef.current) clearTimeout(scanTimeoutRef.current);
        scanTimeoutRef.current = setTimeout(() => {
            const code = (inputRef.current?.value || '').trim().toUpperCase();
            if (inputRef.current) inputRef.current.value = '';
            globalScanBuffer.current = '';
            setScanBuffer('');
            if (code) handleScan(code);
        }, 300);
    };

    // Función para registrar auditoría de escaneos
    const logAudit = async (params: {
        tipo: 'MAL_PICKING' | 'PRODUCTO_NO_ENCONTRADO' | 'VALIDACION_EXITOSA',
        ean_escaneado: string,
        ean_esperado?: string,
        order?: AfternoonOrder
    }) => {
        try {
            await supabase.from('auditoria_escaneos').insert({
                usuario: user?.nombre || user?.username,
                placa: params.order?.placa || selectedPlate,
                documento: params.order?.documento,
                ean_escaneado: params.ean_escaneado,
                ean_esperado: params.ean_esperado,
                descripcion_producto: params.order?.descripcion,
                tipo_evento: params.tipo,
                modulo: 'CARRO_TARDE'
            });
        } catch (err) {
            console.error("Error logging audit:", err);
        }
    };

    const handleValidadorScan = (cleanCode: string) => {
        if (!validadorSelectedPlate) {
            setValidadorToast({
                show: true,
                message: 'Por favor, selecciona un carro primero.',
                type: 'error'
            });
            return;
        }

        if (validadorIsFinished) return;

        if (validadorManualEditSku !== null) {
            setValidadorToast({
                show: true,
                message: 'Cierre la edición manual del producto actual primero.',
                type: 'error'
            });
            return;
        }

        const currentPlateOrders = orders.filter(o => o.placa === validadorSelectedPlate);
        const match = currentPlateOrders.find(o => {
            const prod = catalog.find(p => p.sku === o.sku || p.codigo === o.sku);
            const codes = [
                (o.sku || '').toUpperCase(),
                (o.codigo || '').toUpperCase(),
                (prod?.sku || '').toUpperCase(),
                (prod?.codigo || '').toUpperCase(),
                (prod?.ean_bulto || '').toUpperCase()
            ].filter(Boolean);
            return codes.includes(cleanCode);
        });

        const timestampStr = new Date().toLocaleTimeString();

        if (!match) {
            // Buscar nombre descriptivo en el catálogo maestro general
            const genProduct = catalog.find(p => {
                const codes = [
                    (p.sku || '').toUpperCase(),
                    (p.codigo || '').toUpperCase(),
                    (p.ean_bulto || '').toUpperCase()
                ].filter(Boolean);
                return codes.includes(cleanCode);
            });
            const pName = genProduct ? genProduct.nombre : `PRODUCTO DESCONOCIDO O INEXISTENTE`;
            
            // Activar alerta masiva y sonora en pantalla completa
            setValidadorErrorAlert({ code: cleanCode, name: pName });

            setValidadorToast({
                show: true,
                message: `⚠️ ¡ALERTA! El producto (${pName}) NO pertenece a este carro. ¡SÁQUELO!',`,
                type: 'error'
            });
            
            try {
                const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
                if (ctx) {
                    const osc = ctx.createOscillator();
                    const gain = ctx.createGain();
                    osc.type = 'sawtooth';
                    osc.frequency.setValueAtTime(150, ctx.currentTime);
                    gain.gain.setValueAtTime(0.5, ctx.currentTime);
                    osc.connect(gain);
                    gain.connect(ctx.destination);
                    osc.start();
                    osc.stop(ctx.currentTime + 0.6);
                }
            } catch (e) {
                console.log("Audio alert not allowed or supported yet.", e);
            }

            setValidadorLogs(prev => [
                {
                    id: Math.random().toString(),
                    message: `⚠️ CÓDIGO ERRADO: ${cleanCode} (${pName}). ¡NO PERTENECE AL CARRO!`,
                    type: 'error',
                    timestamp: timestampStr
                },
                ...prev
            ]);
            return;
        }

        const itemKey = match.sku || match.codigo;
        const totalQty = currentPlateOrders
            .filter(o => (o.sku || o.codigo) === itemKey)
            .reduce((sum, o) => sum + o.cantidad_pedida, 0);

        const currentVal = validadorScans[itemKey] || 0;

        try {
            const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
            if (ctx) {
                const osc = ctx.createOscillator();
                const gain = ctx.createGain();
                osc.type = 'sine';
                osc.frequency.setValueAtTime(880, ctx.currentTime);
                gain.gain.setValueAtTime(0.15, ctx.currentTime);
                osc.connect(gain);
                gain.connect(ctx.destination);
                osc.start();
                osc.stop(ctx.currentTime + 0.15);
            }
        } catch (e) {
            console.log("Confirm audio not enabled.", e);
        }

        if (totalQty > 10) {
            setValidadorManualEditSku(itemKey);
            setValidadorManualQty('');
            setValidadorToast({
                show: true,
                message: `Edición manual para ${match.descripcion} (Cantidad > 10)`,
                type: 'success'
            });
            setValidadorLogs(prev => [
                {
                    id: Math.random().toString(),
                    message: `Producto > 10: ${match.descripcion}. Esperando ingreso manual...`,
                    type: 'warn',
                    timestamp: timestampStr
                },
                ...prev
            ]);
        } else {
            const prod = catalog.find(p => p.sku === match.sku || p.codigo === match.sku);
            const isBoxScan = (prod?.ean_bulto || '').toUpperCase() === cleanCode;
            const rtuVal = match.rtu || 1;
            const increment = isBoxScan ? rtuVal : 1;

            const nextVal = currentVal + increment;

            setValidadorScans(prev => ({
                ...prev,
                [itemKey]: nextVal
            }));

            setValidadorToast({
                show: true,
                message: `Registrado: ${match.descripcion} (+${increment})`,
                type: 'success'
            });

            setValidadorLogs(prev => [
                {
                    id: Math.random().toString(),
                    message: `Escaneado: ${match.descripcion} (+${increment}). Total: ${nextVal}`,
                    type: 'success',
                    timestamp: timestampStr
                },
                ...prev
            ]);
        }
    };

    const handleScan = async (code: string) => {
        const cleanCode = code.trim().toUpperCase();
        if (!cleanCode) return;

        console.log("Escaneado:", cleanCode);
        
        // CASO EXTRA: VALIDADOR
        if (viewMode === 'VALIDADOR') {
            handleValidadorScan(cleanCode);
            return;
        }
        
        // CASO 0: Validación de Carga (Truck QR -> Ramp QR)
        if (loadValidationPlate) {
            // ... (resto de la lógica de carga se mantiene igual o similar)
            if (loadValidationState === 'SCAN_TRUCK') {
                if (cleanCode === loadValidationPlate) {
                    setScannedTruck(cleanCode);
                    setLoadValidationState('SCAN_RAMP');
                    setLastScanMsg('CAMIÓN CORRECTO');
                    setToast({ show: true, message: 'PLACA VALIDADA ✅', type: 'success' });
                } else {
                    setLoadValidationState('ERROR');
                    setLastScanMsg('CAMIÓN INCORRECTO');
                    setToast({ show: true, message: 'CÓDIGO NO COINCIDE', type: 'error' });
                    logAudit({ tipo: 'MAL_PICKING', ean_escaneado: cleanCode, ean_esperado: loadValidationPlate });
                    setTimeout(() => setLoadValidationState('SCAN_TRUCK'), 2000);
                }
                return;
            }

            if (loadValidationState === 'SCAN_RAMP') {
                const assignedRamp = plateRamps[loadValidationPlate];
                const rampMatch = cleanCode.match(/(\d+)/);
                const scannedRampNum = rampMatch ? parseInt(rampMatch[0]) : null;

                if (scannedRampNum === assignedRamp) {
                    setScannedRamp(cleanCode);
                    setLoadValidationState('SUCCESS');
                    setLastScanMsg('CARGA VALIDADA EN RAMPA ' + scannedRampNum);

                    supabase.from('despacho_encabezado')
                        .update({ 
                            estado: 'COMPLETADO',
                            fecha_despacho: new Date().toISOString()
                        })
                        .eq('placa_vehiculo', loadValidationPlate)
                        .eq('tipo_despacho', 'CARRO_TARDE')
                        .neq('estado', 'COMPLETADO')
                        .then(({ error }) => {
                            if (error) console.error("Error finalizando despacho", error);
                        });

                    setTimeout(() => {
                        setLoadValidationPlate(null);
                        setLoadValidationState('IDLE');
                        setScannedTruck(null);
                        setScannedRamp(null);
                        fetchCarroTardeData();
                    }, 2000);
                } else {
                    setLoadValidationState('ERROR');
                    setLastScanMsg('RAMPA INCORRECTA');
                    setToast({ show: true, message: 'RAMPA INCORRECTA', type: 'error' });
                    logAudit({ tipo: 'MAL_PICKING', ean_escaneado: cleanCode, ean_esperado: `RAMPA ${assignedRamp}` });
                    setTimeout(() => setLoadValidationState('SCAN_RAMP'), 2000);
                }
                return;
            }
            return;
        }

        // CASO 1: Validación de EAN y Picking (Modal Unificado)
        if (validatingOrder) {
            const product = catalog.find(p => p.sku === validatingOrder.sku || p.codigo === validatingOrder.sku);
            
            const isCaseScan = (product?.ean_bulto || '').toUpperCase() === cleanCode;
            const isUnitScan = [
                (validatingOrder.sku || '').toUpperCase(),
                (validatingOrder.codigo || '').toUpperCase(),
                (product?.sku || '').toUpperCase(),
                (product?.codigo || '').toUpperCase()
            ].filter(Boolean).includes(cleanCode);

            if (isCaseScan || isUnitScan) {
                setEanValidated(true);
                const rtu = validatingOrder.rtu || 1;
                const increment = isCaseScan ? rtu : 1;
                const newCount = unitScanCount + increment;
                const totalQty = validatingOrder.cantidad_pedida;
                
                setUnitScanCount(newCount);

                // Si es PESO, INFORME, KGM o ENSAYO, no auto-completamos, esperamos el input extra para peso/vencimiento
                const isSpecial = validatingOrder.camara.includes('PESO') || 
                                  validatingOrder.camara.includes('INFORME') || 
                                  validatingOrder.unidad?.toUpperCase() === 'KGM' ||
                                  (validatingOrder.subTipo || '').toUpperCase().includes('ENSAYO') ||
                                  (validatingOrder.categoria || '').toUpperCase().includes('ENSAYO') ||
                                  (validatingOrder.descripcion || '').toUpperCase().includes('ENSAYO');

                if (isSpecial) {
                    setValidationState('SUCCESS');
                    const msg = isCaseScan ? `+${rtu} CAJA VALIDADA` : 'UNIDAD VALIDADA';
                    setLastScanMsg(msg);
                    setToast({ show: true, message: `PRODUCTO VALIDADO (+${increment}). Ingresa datos adicionales.`, type: 'success' });
                    setTimeout(() => setValidationState('IDLE'), 1000);
                    return;
                }

                // Autocompletado si llega a la meta
                if (newCount >= totalQty) {
                    setValidationState('SUCCESS');
                    setLastScanMsg('¡PEDIDO COMPLETADO!');
                    logAudit({ tipo: 'VALIDACION_EXITOSA', ean_escaneado: cleanCode, order: validatingOrder });
                    
                    // Guardar en DB
                    const targetOrders = (validatingOrder as any).originalOrders || [validatingOrder];
                    const now = new Date().toISOString();
                    const operatorName = user?.nombre || user?.username || 'OPERADOR';
                    
                    const updatePromises = targetOrders.map((o: any) => {
                        if (o.id) {
                            return supabase.from('despachos_item')
                                .update({ 
                                    ean_validado: true, 
                                    cantidad_despachada: o.cantidad_pedida, 
                                    estado: 'COMPLETADO', 
                                    fecha_preparacion: now, 
                                    usuario_preparacion: operatorName
                                })
                                .eq('id', o.id);
                        }
                        return Promise.resolve();
                    });

                    Promise.all(updatePromises).then(() => {
                        setTimeout(() => {
                            const updatedOrders = orders.map(o => {
                                const isTarget = targetOrders.some((to: any) => to.sku === o.sku && to.documento === o.documento);
                                if (isTarget && o.placa === validatingOrder.placa) {
                                    return { ...o, completado: true, cantidad_picada: o.cantidad_pedida, validado: true, ean_validado: true };
                                }
                                return o;
                            });
                            setOrders(updatedOrders);
                            processGrouping(updatedOrders);
                            setValidatingOrder(null);
                            setUnitScanCount(0);
                            setValidationState('IDLE');
                            setLastScanMsg('');
                            setToast({ show: true, message: 'PICKING COMPLETADO ✅', type: 'success' });
                        }, 1200); 
                    });
                } else {
                    setValidationState('SUCCESS');
                    const qtyMsg = isCaseScan ? `+${rtu} (CAJA) | ${newCount}/${totalQty}` : `${newCount}/${totalQty}`;
                    setLastScanMsg(qtyMsg);
                    setToast({ show: true, message: isCaseScan ? `SUMASTE UNA CAJA (+${rtu})` : `SUMASTE UNA UNIDAD`, type: 'success' });
                    logAudit({ tipo: 'VALIDACION_EXITOSA', ean_escaneado: cleanCode, order: validatingOrder });
                    setTimeout(() => {
                        setValidationState('IDLE');
                    }, 600);
                }
            } else {
                setValidationState('ERROR');
                setLastScanMsg('CÓDIGO INCORRECTO');
                setToast({ show: true, message: 'CÓDIGO INCORRECTO: ' + cleanCode, type: 'error' });
                logAudit({ 
                    tipo: 'MAL_PICKING', 
                    ean_escaneado: cleanCode, 
                    ean_esperado: validatingOrder.codigo || validatingOrder.sku,
                    order: validatingOrder 
                });
                setTimeout(() => {
                    setValidationState('IDLE');
                }, 2000);
            }
            return;
        }

        // CASO 2: Selección inicial
        if (viewMode === 'PICKING' && selectedPlate && selectedCamera) {
            let currentPlateOrders = orders.filter(o => o.placa === selectedPlate && o.camara === selectedCamera && !o.completado);
            if (isConsolidated) {
                currentPlateOrders = consolidateItems(currentPlateOrders);
            }
            
            const match = currentPlateOrders.find(o => {
                const prod = catalog.find(p => p.sku === o.sku || p.codigo === o.sku);
                const codes = [
                    (o.sku || '').toUpperCase(),
                    (o.codigo || '').toUpperCase(),
                    (prod?.sku || '').toUpperCase(),
                    (prod?.codigo || '').toUpperCase(),
                    (prod?.ean_bulto || '').toUpperCase()
                ].filter(Boolean);
                return codes.includes(cleanCode);
            });

            if (match) {
                setValidatingOrder(match);
                setValidationState('IDLE');
                
                // El primer escaneo es únicamente para saber si es o no el producto y abrir el modal; no debe sumar unidades
                setUnitScanCount(match.cantidad_picada || 0);
                setToast({ show: true, message: 'PRODUCTO CONFORME ✅', type: 'success' });

                logAudit({ tipo: 'VALIDACION_EXITOSA', ean_escaneado: cleanCode, order: match });
                return;
            }
            setToast({ show: true, message: 'PRODUCTO NO ENCONTRADO EN ESTA LISTA', type: 'error' });
            logAudit({ tipo: 'PRODUCTO_NO_ENCONTRADO', ean_escaneado: cleanCode });
        }
    };

    const handleAssignRamp = async (plate: string, ramp: number) => {
        setIsProcessing(true);
        try {
            // Sincronizar rampa en encabezados de esta placa que estén pendientes
            const { error } = await supabase
                .from('despacho_encabezado')
                .update({ rampa_asignada: ramp })
                .eq('placa_vehiculo', plate)
                .eq('tipo_despacho', 'CARRO_TARDE')
                .neq('estado', 'COMPLETADO');
            
            if (error) throw error;

            setPlateRamps(prev => ({ ...prev, [plate]: ramp }));
            setAssigningRampPlate(null);
        } catch (err) {
            console.error("Error assigning ramp", err);
            alert("Error al guardar rampa en base de datos.");
        } finally {
            setIsProcessing(false);
        }
    };

    const startLoadValidation = (plate: string) => {
        if (!plateRamps[plate]) {
            alert("Debe asignar una RAMPA antes de validar la carga.");
            return;
        }
        setLoadValidationPlate(plate);
        setLoadValidationState('SCAN_TRUCK');
        setScannedTruck(null);
        setScannedRamp(null);
    };

    const completePicking = (order: AfternoonOrder, qty: number) => {
        setConfirmingPick({ order, qty });
    };

    const handleConfirmFinalPick = async () => {
        if (!confirmingPick) return;
        const { order, qty } = confirmingPick;

        const now = new Date().toISOString();
        const timeStr = new Date().toLocaleTimeString();

        // Lista de órdenes reales a actualizar
        const targetOrders = order.originalOrders || [order];

        try {
            // Actualización en paralelo para mayor velocidad
            await Promise.all(targetOrders.map(async (o) => {
                if (o.id) {
                    // Si es consolidado y la cantidad es el total, marcamos 100% para cada uno
                    const finalQtyForThis = order.originalOrders 
                        ? (qty >= order.cantidad_pedida ? o.cantidad_pedida : (qty / order.cantidad_pedida) * o.cantidad_pedida)
                        : qty;

                    const isTotal = finalQtyForThis >= o.cantidad_pedida;

                    const { error } = await supabase
                        .from('despachos_item')
                        .update({
                            cantidad_despachada: finalQtyForThis,
                            estado: isTotal ? 'COMPLETADO' : 'PENDIENTE',
                            fecha_preparacion: now,
                            usuario_preparacion: 'OPERADOR CARRO TARDE',
                            last_picked_at: now,
                            peso_real: (order.camara.includes('PESO') || order.unidad?.toUpperCase() === 'KGM') ? (parseFloat(realWeight) || null) : null,
                            fecha_vencimiento: (order.camara.includes('INFORME') || (order.subTipo || '').toUpperCase().includes('ENSAYO') || (order.categoria || '').toUpperCase().includes('ENSAYO') || (order.descripcion || '').toUpperCase().includes('ENSAYO')) ? `${expiryYear}-${expiryMonth}-${expiryDay}` : null,
                            fotos: pickedPhotos.length > 0 ? pickedPhotos : null
                        })
                        .eq('id', o.id);
                    
                    if (error) throw error;
                }
            }));
        } catch (err) {
            console.error("Error syncing pick to DB", err);
            alert("Error al sincronizar con la base de datos.");
            return;
        }

        const targetSkus = targetOrders.map(o => (o.sku || '').trim().toUpperCase());
        const targetDocs = targetOrders.map(o => o.documento);

        const updatedOrders = orders.map(o => {
            const matches = order.originalOrders 
                ? (targetSkus.includes((o.sku || '').trim().toUpperCase()) && o.placa === order.placa && targetDocs.includes(o.documento))
                : ((o.sku || '').trim().toUpperCase() === (order.sku || '').trim().toUpperCase() && o.placa === order.placa && o.documento === order.documento);

            if (matches) {
                const finalQtyForThis = order.originalOrders 
                    ? (qty >= order.cantidad_pedida ? o.cantidad_pedida : (qty / order.cantidad_pedida) * o.cantidad_pedida)
                    : qty;

                const isTotal = finalQtyForThis >= o.cantidad_pedida;

                return {
                    ...o,
                    cantidad_picada: finalQtyForThis,
                    completado: isTotal,
                    validado: isTotal,
                    last_picked_at: timeStr
                };
            }
            return o;
        });

        // Mostrar feedback de éxito
        setSuccessFeedback(true);
        setConfirmingPick(null);
        setValidatingOrder(null);
        setUnitScanCount(0);
        setEanValidated(false);
        setRealWeight('');
        setPickedPhotos([]);

        // Ocultar mensaje después de 1.5s y procesar cambios
        setTimeout(() => {
            setSuccessFeedback(false);
            setOrders(updatedOrders);
            processGrouping(updatedOrders);
        }, 1500);
    };

    // Manejo de entrada del escáner mediante el input oculto
    const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const val = e.target.value.toUpperCase();
        setScanBuffer(val);
        const term = val.trim();
        
        if (!manualMode && term.length > 0) {
            if (scanTimeoutRef.current) clearTimeout(scanTimeoutRef.current);

            // Damos un delay de 0.25 segundos (250ms) en modo escáner para ver el código en el input
            scanTimeoutRef.current = setTimeout(() => {
                if (!term) return;

                // 1. Intentar match exacto primero
                let exactMatchFound = false;
                
                if (validatingOrder) {
                    const prod = catalog.find(p => p.sku === validatingOrder.sku || p.codigo === validatingOrder.sku);
                    const isMatch = [
                        (validatingOrder.sku || '').toUpperCase(),
                        (validatingOrder.codigo || '').toUpperCase(),
                        (prod?.sku || '').toUpperCase(),
                        (prod?.codigo || '').toUpperCase(),
                        (prod?.ean_bulto || '').toUpperCase()
                    ].filter(Boolean).includes(term);

                    if (isMatch) {
                        exactMatchFound = true;
                        handleScan(term);
                        setScanBuffer('');
                    }
                } else if (loadValidationPlate) {
                    const assignedRamp = plateRamps[loadValidationPlate];
                    const rampMatch = term.match(/(\d+)/);
                    const scannedRampNum = rampMatch ? parseInt(rampMatch[0]) : null;

                    if (term === loadValidationPlate || (loadValidationState === 'SCAN_RAMP' && scannedRampNum === assignedRamp)) {
                        exactMatchFound = true;
                        handleScan(term);
                        setScanBuffer('');
                    }
                }

                // CASO NUEVO: Vista PICKING sin producto seleccionado aún (filtrado por sub-bloque si aplica)
                if (!exactMatchFound && viewMode === 'PICKING' && selectedPlate && selectedCamera && !validatingOrder && !loadValidationPlate) {
                    const currentPlateOrders = orders.filter(
                        o => o.placa === selectedPlate && 
                             o.camara === selectedCamera && 
                             (!selectedSubBlockTitle || (o.subTipo || 'UNIDADES') === selectedSubBlockTitle) && 
                             !o.completado
                    );
                    const match = currentPlateOrders.find(o => {
                        const prod = catalog.find(p => p.sku === o.sku || p.codigo === o.sku);
                        const codes = [
                            (o.sku || '').toUpperCase(),
                            (o.codigo || '').toUpperCase(),
                            (prod?.sku || '').toUpperCase(),
                            (prod?.codigo || '').toUpperCase(),
                            (prod?.ean_bulto || '').toUpperCase()
                        ].filter(Boolean);
                        return codes.includes(term);
                    });
                    if (match) {
                        exactMatchFound = true;
                        handleScan(term);
                        setScanBuffer('');
                    }
                }

                if (exactMatchFound) return;

                // Fallback: procesar de todos modos
                handleScan(term);
                setScanBuffer('');
            }, 250);
        }
    };

    const handleInputKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            if (scanTimeoutRef.current) clearTimeout(scanTimeoutRef.current);
            
            const val = scanBuffer.trim();
            if (!val || isScanning) return;

            setIsScanning(true);
            
            // Si estamos en modo escáner (!manualMode), damos un delay de 250ms (0.25s) para que puedan ver los códigos escaneados.
            // Si es manual, se procesa casi de inmediato (50ms)
            const delay = !manualMode ? 250 : 50;
            setTimeout(async () => {
                await handleScan(val);
                setScanBuffer('');
                setIsScanning(false);
                // Re-enfocar para el siguiente escaneo
                setTimeout(() => inputRef.current?.focus(), 50);
            }, delay);
        }
    };

    const currentProduct = validatingOrder ? catalog.find(p => p.sku === validatingOrder.sku || p.codigo === validatingOrder.sku) : null;

    return (
        <div className="flex flex-col h-full bg-slate-50 dark:bg-slate-900/50 overflow-x-hidden">

            {/* Input oculto para capturar escáner PDA con teclado bloqueado */}
            {(viewMode === 'PICKING' || !!validatingOrder || !!loadValidationPlate) && (
                <input
                    ref={inputRef}
                    onKeyDown={handleHiddenInputKeyDown}
                    inputMode="none"
                    autoComplete="off"
                    autoCorrect="off"
                    spellCheck={false}
                    aria-hidden="true"
                    tabIndex={-1}
                    readOnly={false}
                    style={{
                        position: 'fixed',
                        opacity: 0,
                        width: 1,
                        height: 1,
                        top: 0,
                        left: 0,
                        pointerEvents: 'none',
                        fontSize: 16,
                        border: 'none',
                        outline: 'none',
                        background: 'transparent',
                    }}
                />
            )}

            {/* Feedback de Éxito */}
            <AnimatePresence>
                {successFeedback && (
                    <motion.div 
                        key="success-toast"
                        initial={{ opacity: 0, y: -50 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -50 }}
                        className="fixed top-24 left-1/2 -translate-x-1/2 z-[600] bg-emerald-500 text-white px-10 py-5 rounded-[2.5rem] shadow-2xl shadow-emerald-500/30 flex items-center gap-4 border-4 border-white"
                    >
                        <div className="bg-white/20 p-2 rounded-full">
                            <CheckCircle className="w-8 h-8" />
                        </div>
                        <div>
                            <p className="text-xl font-black uppercase tracking-tighter leading-none">Picking Registrado</p>
                            <p className="text-[10px] font-bold uppercase tracking-widest opacity-80">Producto validado correctamente</p>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
            {/* Header */}
            <div className="bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 p-3 sm:p-4 sticky top-0 z-10">
                <div className="max-w-7xl mx-auto flex flex-row justify-between items-center gap-2 sm:gap-4">
                    <div className="flex items-center gap-2 sm:gap-3">
                        {viewMode !== 'CARGA' && (
                            <button 
                                onClick={() => {
                                    if (viewMode === 'PICKING') setViewMode('PLACAS');
                                    else if (viewMode === 'PLACAS') setViewMode('CAMARAS');
                                    else if (viewMode === 'CAMARAS') setViewMode('CARGA');
                                    else if (viewMode === 'PREVIEW') setViewMode('CARGA');
                                    else if (viewMode === 'VALIDADOR') {
                                        if (validadorSelectedPlate) {
                                            setValidadorSelectedPlate(null);
                                            setValidadorIsFinished(false);
                                        } else {
                                            setViewMode('CARGA');
                                        }
                                    }
                                    else setViewMode('CARGA');
                                }}
                                className="p-2 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-full transition-colors cursor-pointer"
                            >
                                <ArrowLeft className="w-5 h-5 text-slate-500" />
                            </button>
                        )}
                        <div className="flex flex-col">
                            <div className="flex items-center gap-3">
                                <h1 className="text-base sm:text-l font-black text-slate-900 dark:text-white uppercase tracking-tight">
                                    {viewMode === 'PICKING' ? `${selectedCamera} / ${selectedPlate}` : viewMode === 'CAMARAS' ? selectedPlate : viewMode === 'VALIDADOR' ? (validadorSelectedPlate ? `VALIDANDO: ${validadorSelectedPlate}` : 'VALIDACIÓN A CIEGAS') : 'MÓDULO DE PICKING (PIKING)'}
                                </h1>
                                {viewMode === 'PICKING' && (
                                    <div className="flex items-center gap-2 flex-shrink-0 bg-slate-100 dark:bg-slate-800 p-1 rounded-full border border-slate-200 dark:border-slate-700">
                                        <button 
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                setIsConsolidated(!isConsolidated);
                                            }}
                                            className={`w-12 h-6 rounded-full relative transition-all duration-300 flex items-center px-1 shadow-inner ${isConsolidated ? 'bg-blue-600' : 'bg-slate-300 dark:bg-slate-600'}`}
                                        >
                                            <motion.div 
                                                animate={{ x: isConsolidated ? 24 : 0 }}
                                                className="w-4 h-4 bg-white rounded-full shadow-md"
                                            />
                                        </button>
                                        <span className={`text-[8px] sm:text-[10px] font-black uppercase tracking-widest pr-2 ${isConsolidated ? 'text-blue-600' : 'text-slate-400'}`}>
                                            {isConsolidated ? 'Consolidado' : 'Consolidar'}
                                        </span>
                                    </div>
                                )}
                            </div>
                            {viewMode === 'PICKING' && selectedSubBlockTitle && (
                                <span className="text-[10px] sm:text-[11px] font-black text-blue-600 uppercase tracking-widest mt-0.5">
                                    {selectedSubBlockTitle}
                                </span>
                            )}
                        </div>
                    </div>

                    <div className="flex items-center gap-2 sm:gap-6">
                        <div className="flex flex-col text-right items-end">
                            <span className="text-[7px] sm:text-[10px] font-bold text-slate-400 uppercase tracking-widest leading-none mb-1 sm:mb-2">PICKING</span>
                            <div className="flex items-center gap-1.5 sm:gap-3">
                                <div className="w-20 sm:w-48 h-3.5 sm:h-6 bg-slate-100 dark:bg-slate-800 rounded-full sm:rounded-lg overflow-hidden relative border border-slate-200 dark:border-slate-700 shadow-inner">
                                    <motion.div 
                                        initial={{ width: 0 }}
                                        animate={{ width: `${stats.progress}%` }}
                                        className="h-full bg-lime-500 shadow-[0_0_10px_rgba(132,204,22,0.4)] transition-all duration-1000 flex items-center justify-center"
                                    >
                                        <span className="text-[8px] sm:text-[10px] font-black text-white drop-shadow-md">
                                            {stats.progress}%
                                        </span>
                                    </motion.div>
                                </div>
                                <span className="text-[10px] sm:text-xs font-black text-blue-600 sm:hidden hidden">
                                    {stats.progress}%
                                </span>
                            </div>
                        </div>
                        <div className="h-8 sm:h-10 w-px bg-slate-200 dark:bg-slate-800 hidden sm:block"></div>
                        {tempGrouping.length > 0 && viewMode === 'PLACAS' && (
                            <button 
                                onClick={() => setViewMode('PREVIEW')}
                                className="bg-amber-500 hover:bg-amber-600 text-white font-black px-6 py-2 rounded-xl shadow-lg shadow-amber-500/20 flex items-center gap-2 transition-all active:scale-95 uppercase text-[10px] tracking-widest"
                            >
                                <Database className="w-4 h-4" />
                                {tempGrouping.length} REGISTROS PENDIENTES
                            </button>
                        )}
                        {(orders.length > 0 || tempGrouping.length > 0) && (
                            <button 
                                onClick={() => setShowClearAllModal(true)}
                                className="p-2 text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-xl transition-colors"
                                title="Limpiar Todo"
                            >
                                <Trash2 className="w-5 h-5" />
                            </button>
                        )}
                    </div>
                </div>
            </div>

            {/* Content Area */}
            <div className="flex-1 overflow-y-auto p-2 sm:p-4 no-scrollbar">
                <div className="max-w-4xl mx-auto">
                    <AnimatePresence mode="wait">
                        {viewMode === 'PREVIEW' && (
                            <motion.div 
                                initial={{ opacity: 0, y: 20 }}
                                animate={{ opacity: 1, y: 0 }}
                                exit={{ opacity: 0, y: -20 }}
                                className="space-y-6"
                            >
                                <div className="flex flex-col sm:flex-row justify-between items-center bg-blue-50 dark:bg-blue-900/20 p-8 rounded-[2.5rem] border border-blue-100 dark:border-blue-800 gap-4 mb-8">
                                    <div>
                                        <h3 className="text-xl font-black text-blue-900 dark:text-blue-100 uppercase tracking-tight">Carga en Memoria Detectada</h3>
                                        <p className="text-sm text-blue-600 dark:text-blue-400 font-bold uppercase mt-1">Registros de picking encontrados en el archivo. Procese individualmente para guardar.</p>
                                    </div>
                                    <div className="flex flex-col sm:flex-row items-center gap-4">
                                        <button 
                                            onClick={() => setViewMode('PLACAS')}
                                            className="px-8 py-4 rounded-2xl bg-white dark:bg-slate-800 text-blue-600 dark:text-blue-400 font-black uppercase text-xs tracking-widest shadow-sm hover:shadow-md transition-all active:scale-95"
                                        >
                                            VER PICKING ACTUAL
                                        </button>
                                        <button 
                                            onClick={() => setShowBulkConfirm(true)}
                                            className="px-8 py-4 rounded-2xl bg-blue-600 text-white font-black uppercase text-xs tracking-widest shadow-xl shadow-blue-600/20 hover:bg-blue-700 transition-all active:scale-95 flex items-center gap-2"
                                        >
                                            <Save className="w-4 h-4" />
                                            PROCESAR TODO EL PICKING
                                        </button>
                                    </div>
                                </div>

                                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                    {tempGrouping.map((p, idx) => {
                                        const plateItemsCount = Object.values(p.camaras || {}).reduce((acc, c) => acc + (c.items?.length || 0), 0);
                                        return (
                                            <div key={`preview-${p.placa}-${idx}`} className="bg-white dark:bg-slate-900 p-8 rounded-[3rem] border border-slate-200 dark:border-slate-800 shadow-sm hover:shadow-lg transition-all group">
                                                <div className="flex items-center justify-between gap-6 mb-8">
                                                    <div className="flex items-center gap-6">
                                                        <div className="w-16 h-16 bg-slate-50 dark:bg-slate-800 rounded-2xl flex items-center justify-center text-slate-400 group-hover:bg-blue-50 group-hover:text-blue-500 transition-colors">
                                                            <Truck className="w-8 h-8" />
                                                        </div>
                                                        <div>
                                                            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Placa</span>
                                                            <h4 className="text-2xl font-black text-slate-800 dark:text-white uppercase leading-none">{p.placa}</h4>
                                                            <p className="text-xs text-slate-500 font-bold mt-1 uppercase">
                                                                {plateItemsCount} Items encontrados
                                                            </p>
                                                        </div>
                                                    </div>
                                                </div>

                                                <button 
                                                    onClick={() => processCarToDB(p)}
                                                    disabled={isProcessing}
                                                    className="w-full bg-blue-600 text-white py-5 rounded-2xl font-black uppercase text-xs tracking-widest shadow-xl shadow-blue-600/20 hover:bg-blue-700 hover:scale-[1.02] transition-all flex items-center justify-center gap-3 active:scale-95 disabled:opacity-50"
                                                >
                                                    {isProcessing ? <RefreshCw className="w-5 h-5 animate-spin" /> : <Save className="w-5 h-5" />}
                                                    PROCESAR PICKING INDIVIDUAL
                                                </button>
                                            </div>
                                        );
                                    })}
                                </div>
                            </motion.div>
                        )}

                        {viewMode === 'VALIDADOR' && (
                            <motion.div
                                initial={{ opacity: 0, y: 15 }}
                                animate={{ opacity: 1, y: 0 }}
                                exit={{ opacity: 0, y: -15 }}
                                className="space-y-6 pb-20 text-slate-900"
                            >
                                {/* Validador Custom Toast */}
                                {validadorToast?.show && (
                                    <div className={`p-4 rounded-2xl flex items-center gap-3 border shadow-lg ${
                                        validadorToast.type === 'error' 
                                            ? 'bg-rose-50 dark:bg-rose-950/30 text-rose-800 dark:text-rose-200 border-rose-200 dark:border-rose-900 animate-bounce' 
                                            : 'bg-emerald-50 dark:bg-emerald-950/30 text-emerald-800 dark:text-emerald-200 border-emerald-200 dark:border-emerald-900'
                                    }`}>
                                        <div className={`p-1.5 rounded-full ${
                                            validadorToast.type === 'error' ? 'bg-rose-500 text-white' : 'bg-emerald-500 text-white'
                                        }`}>
                                            {validadorToast.type === 'error' ? (
                                                <XCircle className="w-5 h-5 text-white" />
                                            ) : (
                                                <CheckCircle className="w-5 h-5 text-white" />
                                            )}
                                        </div>
                                        <div className="flex-1">
                                            <p className="text-xs sm:text-sm font-black uppercase tracking-tight">
                                                {validadorToast.message}
                                            </p>
                                        </div>
                                        <button 
                                            onClick={() => setValidadorToast(null)}
                                            className="text-xs font-black uppercase tracking-widest opacity-60 hover:opacity-100 cursor-pointer"
                                        >
                                            [Cerrar]
                                        </button>
                                    </div>
                                )}

                                {/* PANTALLA 1: Selección de Carro */}
                                {validadorSelectedPlate === null && (() => {
                                    const platesList = Array.from(new Set(orders.map(o => o.placa).filter(Boolean))).sort();
                                    return (
                                        <div className="space-y-3">
                                            <div className="flex items-center justify-between pb-2 border-b border-slate-150 dark:border-slate-800">
                                                <h3 className="text-xs font-black text-slate-400 uppercase tracking-widest">
                                                    📦 CONTROL DE VEHÍCULOS / CARROS
                                                </h3>
                                                <button 
                                                    onClick={() => setViewMode('CARGA')}
                                                    className="px-3 py-1 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-750 dark:text-slate-200 font-black uppercase text-[9px] tracking-widest rounded-lg transition-colors cursor-pointer"
                                                >
                                                    ⬅️ Volver
                                                </button>
                                            </div>

                                            {platesList.length === 0 ? (
                                                <div className="bg-white dark:bg-slate-900 border border-slate-150 dark:border-slate-800/80 p-12 rounded-2xl text-center space-y-4 shadow-sm">
                                                    <div className="text-slate-400 dark:text-slate-600 flex justify-center">
                                                        <Truck className="w-12 h-12 text-slate-400" />
                                                    </div>
                                                    <h4 className="text-sm font-black text-slate-700 dark:text-slate-200 uppercase tracking-wider">
                                                        No hay carros activos
                                                    </h4>
                                                    <p className="text-xs text-slate-500 dark:text-slate-400 max-w-xs mx-auto leading-relaxed">
                                                        Actualmente no se registran pedidos asignados a placas o carros. Cargue un archivo Excel para iniciar.
                                                     </p>
                                                </div>
                                            ) : (
                                                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
                                                    {platesList.map((pl) => {
                                                        const plOrders = orders.filter(o => o.placa === pl);
                                                        const totalItems = plOrders.length;
                                                        const itemsCompletados = plOrders.filter(o => o.completado).length;
                                                        const statusColor = itemsCompletados === totalItems ? 'border-emerald-500' : 'border-slate-150 dark:border-slate-800';

                                                        return (
                                                            <div 
                                                                key={`validador-plate-${pl}`}
                                                                className={`bg-white dark:bg-slate-900 px-3 py-2.5 rounded-xl border hover:border-emerald-500 transition-all shadow-xs flex items-center justify-between gap-4 ${statusColor}`}
                                                            >
                                                                <div className="min-w-0 flex-1 flex items-center gap-2.5">
                                                                    <span className="text-sm font-semibold text-slate-900 dark:text-white uppercase truncate tracking-wider">
                                                                        {pl}
                                                                    </span>
                                                                    <span className="text-[10px] font-semibold text-slate-400 bg-slate-100 dark:bg-slate-800/80 px-2 py-0.5 rounded-full shrink-0">
                                                                        {totalItems} items
                                                                    </span>
                                                                </div>

                                                                <button
                                                                    onClick={() => {
                                                                        setValidadorSelectedPlate(pl);
                                                                        setValidadorScans({});
                                                                        setValidadorIsFinished(false);
                                                                        setValidadorLogs([]);
                                                                        setValidadorToast(null);
                                                                    }}
                                                                    className="py-1.5 px-3 bg-emerald-650 hover:bg-emerald-700 active:bg-emerald-800 text-white font-bold uppercase text-[10px] tracking-wider rounded-lg transition-all active:scale-95 flex items-center shrink-0 cursor-pointer"
                                                                >
                                                                    VALIDAR
                                                                </button>
                                                            </div>
                                                        );
                                                    })}
                                                </div>
                                            )}
                                        </div>
                                    );
                                })()}

                                {/* PANTALLA 2: Escaneo en Progreso (Validación activa) */}
                                {validadorSelectedPlate !== null && !validadorIsFinished && (() => {
                                    const currentPlateOrders = orders.filter(o => o.placa === validadorSelectedPlate);
                                    
                                    const aggregatedItemsMap: Record<string, {
                                        sku: string;
                                        codigo: string;
                                        descripcion: string;
                                        unidad: string;
                                        cantidad_pedida: number;
                                        cantidad_picada: number;
                                    }> = {};

                                    currentPlateOrders.forEach(o => {
                                        const key = o.sku || o.codigo;
                                        if (!aggregatedItemsMap[key]) {
                                            aggregatedItemsMap[key] = {
                                                sku: o.sku,
                                                codigo: o.codigo,
                                                descripcion: o.descripcion,
                                                unidad: o.unidad,
                                                cantidad_pedida: 0,
                                                cantidad_picada: 0
                                            };
                                        }
                                        aggregatedItemsMap[key].cantidad_pedida += o.cantidad_pedida;
                                        aggregatedItemsMap[key].cantidad_picada += (o.cantidad_picada || 0);
                                    });

                                    const aggregatedItemsList = Object.values(aggregatedItemsMap).sort((a,b) => a.descripcion.localeCompare(b.descripcion));

                                    return (
                                        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
                                            {/* Columna Izquierda: Escaneo, Buffer y Registro */}
                                            <div className="lg:col-span-8 space-y-6">
                                                <div className="bg-white dark:bg-slate-900 border border-slate-150 dark:border-slate-800 p-6 rounded-3xl space-y-5 shadow-sm">
                                                    <div className="flex items-center justify-between gap-3 border-b border-slate-100 dark:border-slate-800 pb-4">
                                                        <div>
                                                            <span className="text-[10px] font-bold uppercase text-emerald-600 tracking-wider block">
                                                                {validadorBlindMode ? '🔍 CONTROL DE CARRO A CIEGAS' : '📋 CONTROL DE CARRO CON MATCH GUIADO'}
                                                            </span>
                                                            <h2 className="text-xl sm:text-2xl font-bold text-slate-900 dark:text-white uppercase tracking-tight">
                                                                {validadorSelectedPlate}
                                                            </h2>
                                                        </div>
                                                        <div className="flex items-center gap-2.5 shrink-0">
                                                            {/* Switch 1: Modo Entrada (Scanner vs Keyboard) */}
                                                            <button
                                                                onClick={() => setValidadorKeyboardMode(prev => prev === 'SCANNER' ? 'MANUAL' : 'SCANNER')}
                                                                className={`p-2.5 rounded-xl border transition-all cursor-pointer flex items-center justify-center ${
                                                                    validadorKeyboardMode === 'SCANNER'
                                                                        ? 'bg-emerald-600 border-emerald-650 text-white shadow-xs hover:bg-emerald-700'
                                                                        : 'bg-slate-50 dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-500 hover:bg-slate-100 hover:text-slate-700'
                                                                }`}
                                                                title={validadorKeyboardMode === 'SCANNER' ? "Modo Entrada: Escáner" : "Modo Entrada: Teclado"}
                                                            >
                                                                {validadorKeyboardMode === 'SCANNER' ? <Scan className="w-4.5 h-4.5" /> : <Keyboard className="w-4.5 h-4.5" />}
                                                            </button>

                                                            {/* Switch 2: Control a Ciegas (Ocultar/Mostrar Ítems) */}
                                                            <button
                                                                onClick={() => setValidadorBlindMode(prev => !prev)}
                                                                className={`p-2.5 rounded-xl border transition-all cursor-pointer flex items-center justify-center ${
                                                                    !validadorBlindMode
                                                                        ? 'bg-amber-500 border-amber-550 text-white shadow-xs hover:bg-amber-600'
                                                                        : 'bg-slate-50 dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-400 hover:bg-slate-100 hover:text-slate-600'
                                                                }`}
                                                                title={!validadorBlindMode ? "Match Guiado: Ítems Visibles" : "Control a Ciegas: Ítems Ocultos"}
                                                            >
                                                                {!validadorBlindMode ? <Eye className="w-4.5 h-4.5" /> : <EyeOffIcon className="w-4.5 h-4.5" />}
                                                            </button>
                                                        </div>
                                                    </div>

                                                    {/* Input secreto para capturar scans de HID sin ocupar espacio visual */}
                                                    {validadorKeyboardMode === 'SCANNER' && (
                                                        <input
                                                            ref={validadorInputRef}
                                                            type="text"
                                                            className="absolute opacity-0 pointer-events-none w-0 h-0"
                                                            value=""
                                                            onChange={(e) => {
                                                                const val = e.target.value.trim().toUpperCase();
                                                                if (val) {
                                                                    handleValidadorScan(val);
                                                                    e.target.value = '';
                                                                }
                                                            }}
                                                            onBlur={(e) => {
                                                                if (viewMode === 'VALIDADOR' && validadorSelectedPlate && validadorManualEditSku === null && validadorKeyboardMode === 'SCANNER') {
                                                                    setTimeout(() => e.target.focus(), 150);
                                                                }
                                                            }}
                                                        />
                                                    )}

                                                    {/* Input manual visible de SKU/Código */}
                                                    <div className="space-y-1">
                                                        <label className="text-xs font-bold text-slate-550 dark:text-slate-400 block px-1">
                                                            Escanear o digitar SKU del producto:
                                                        </label>
                                                        <div className="flex gap-2">
                                                            <input
                                                                id="validador-manual-typed-input"
                                                                type="text"
                                                                placeholder={validadorKeyboardMode === 'SCANNER' ? "ESCANEE O ESCRIBA..." : "DIGITE SKU O CÓDIGO..."}
                                                                onKeyDown={(e) => {
                                                                    if (e.key === 'Enter') {
                                                                        const val = (e.currentTarget.value || '').trim().toUpperCase();
                                                                        if (val) {
                                                                            handleValidadorScan(val);
                                                                            e.currentTarget.value = '';
                                                                        }
                                                                    }
                                                                }}
                                                                className="flex-1 px-4 py-3 bg-slate-50 dark:bg-slate-800/50 border border-slate-205 dark:border-slate-800 rounded-xl focus:ring-2 focus:ring-emerald-500 text-sm font-semibold uppercase tracking-widest font-mono text-slate-900 dark:text-white"
                                                            />
                                                            <button
                                                                onClick={() => {
                                                                    const el = document.getElementById('validador-manual-typed-input') as HTMLInputElement;
                                                                    if (el) {
                                                                        const val = (el.value || '').trim().toUpperCase();
                                                                        if (val) {
                                                                            handleValidadorScan(val);
                                                                            el.value = '';
                                                                        }
                                                                    }
                                                                }}
                                                                className="px-4 bg-emerald-650 hover:bg-emerald-700 text-white font-black uppercase text-[10px] tracking-widest rounded-xl transition-all cursor-pointer flex items-center justify-center gap-1 min-h-[44px]"
                                                            >
                                                                REGISTRAR
                                                            </button>
                                                        </div>
                                                    </div>

                                                    {/* LISTADO DE PRODUCTOS DEL CARRO PARA AUDITORÍA */}
                                                    <div className="space-y-3 pt-2">
                                                        {(() => {
                                                            const displayedItems = validadorBlindMode 
                                                                ? aggregatedItemsList.filter(item => {
                                                                    const key = item.sku || item.codigo;
                                                                    return (validadorScans[key] || 0) > 0;
                                                                  })
                                                                : aggregatedItemsList;

                                                            return (
                                                                <>
                                                                    <h3 className="text-[11px] font-bold text-slate-400 uppercase tracking-wider border-b border-slate-150 dark:border-slate-805 pb-2 flex justify-between items-center">
                                                                        <span>
                                                                            {validadorBlindMode ? '🔍 PRODUCTOS REGISTRADOS (CIEGAS)' : '📋 PRODUCTOS DEL VEHÍCULO'}
                                                                        </span>
                                                                        <span className="bg-emerald-550/10 text-emerald-600 dark:text-emerald-400 px-2 py-0.5 rounded text-[10px] font-bold uppercase shrink-0">
                                                                            {Object.keys(validadorScans).filter(k => (validadorScans[k] || 0) > 0).length} / {aggregatedItemsList.length} OK
                                                                        </span>
                                                                    </h3>
                                                                    <div className="divide-y divide-slate-100 dark:divide-slate-850 max-h-[500px] overflow-y-auto pr-1">
                                                                        {displayedItems.length === 0 ? (
                                                                            validadorBlindMode ? (
                                                                                <div className="text-center py-6 bg-slate-50/50 dark:bg-slate-950/10 border border-slate-150 dark:border-slate-800 rounded-xl p-4">
                                                                                    <Scan className="w-6 h-6 text-purple-500 mx-auto mb-1.5" />
                                                                                    <p className="text-[11px] text-slate-600 dark:text-slate-400 font-bold uppercase tracking-wider">
                                                                                        Modo a ciegas activo 👁️
                                                                                    </p>
                                                                                    <p className="text-[10px] text-slate-400 mt-0.5 max-w-xs mx-auto">
                                                                                        Escanee o digite los productos físicos para registrar conteo.
                                                                                    </p>
                                                                                </div>
                                                                            ) : (
                                                                                <div className="text-center py-6 bg-slate-50/50 dark:bg-slate-950/10 border border-slate-150 dark:border-slate-800 rounded-xl p-4">
                                                                                    <Scan className="w-6 h-6 text-slate-400 mx-auto mb-1.5" />
                                                                                    <p className="text-[11px] text-slate-500 uppercase tracking-wider font-bold">
                                                                                        Sin productos en este carro
                                                                                    </p>
                                                                                </div>
                                                                            )
                                                                        ) : (
                                                                            displayedItems.map((item) => {
                                                                                const key = item.sku || item.codigo;
                                                                                const scanCount = validadorScans[key] || 0;
                                                                                const hasScans = scanCount > 0;
                                                                                const isOver = scanCount > item.cantidad_pedida;

                                                                                return (
                                                                                    <div 
                                                                                        key={`validador-prod-row-${key}`}
                                                                                        className={`py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs px-2.5 rounded-xl transition-colors ${
                                                                                            hasScans 
                                                                                                ? 'bg-emerald-50/20 dark:bg-emerald-950/5 border-l-4 border-emerald-500' 
                                                                                                : 'hover:bg-slate-50 dark:hover:bg-slate-850/20 border-l-4 border-transparent'
                                                                                        }`}
                                                                                    >
                                                                                        <div className="space-y-0.5 flex-1 min-w-0 pr-2">
                                                                                            <div className="flex items-center gap-2 flex-wrap">
                                                                                                <h4 className="font-bold text-slate-900 dark:text-white uppercase leading-tight">
                                                                                                    {item.descripcion}
                                                                                                </h4>
                                                                                                {/* Status Indicators depending on mode */}
                                                                                                {!validadorBlindMode ? (
                                                                                                    isOver ? (
                                                                                                        <span className="bg-rose-500/10 text-rose-600 dark:text-rose-450 text-[8px] font-black uppercase px-2 py-0.5 rounded tracking-wider">
                                                                                                            SOBRE-VALIDADO: +{scanCount - item.cantidad_pedida} ⚠️
                                                                                                        </span>
                                                                                                    ) : scanCount === item.cantidad_pedida ? (
                                                                                                        <span className="bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 text-[8px] font-black uppercase px-2 py-0.5 rounded tracking-wider">
                                                                                                            REGISTRO COMPLETO ✅
                                                                                                        </span>
                                                                                                    ) : scanCount > 0 ? (
                                                                                                        <span className="bg-amber-500/10 text-amber-600 dark:text-amber-400 text-[8px] font-black uppercase px-2 py-0.5 rounded tracking-wider">
                                                                                                            RESTAN: {item.cantidad_pedida - scanCount} UND
                                                                                                        </span>
                                                                                                    ) : (
                                                                                                        <span className="bg-slate-100 dark:bg-slate-800 text-slate-400 text-[8px] font-black uppercase px-2 py-0.5 rounded tracking-wider">
                                                                                                            FALTAN: {item.cantidad_pedida} UND
                                                                                                        </span>
                                                                                                    )
                                                                                                ) : (
                                                                                                    <span className="bg-purple-500/10 text-purple-600 dark:text-purple-450 text-[8px] font-black uppercase px-2 py-0.5 rounded tracking-wider">
                                                                                                        {scanCount} REGISTRADOS
                                                                                                    </span>
                                                                                                )}
                                                                                            </div>
                                                                                            <div className="flex items-center gap-2 font-mono text-[9px] text-slate-500 dark:text-slate-400 flex-wrap">
                                                                                                <span>SKU: {item.sku}</span>
                                                                                                <span>•</span>
                                                                                                <span>CÓDIGO: {item.codigo}</span>
                                                                                                <span>•</span>
                                                                                                <span className="bg-slate-100 dark:bg-slate-800 px-1.5 py-0.2 rounded text-slate-605 dark:text-slate-350 font-bold">
                                                                                                    {item.unidad}
                                                                                                </span>
                                                                                            </div>
                                                                                        </div>

                                                                                        <div className="flex items-center justify-between sm:justify-end gap-3 min-w-[185px] shrink-0">
                                                                                            {/* Cantidades teóricas vs reales guiadas */}
                                                                                            {!validadorBlindMode && (
                                                                                                <div className="text-right text-[10px] pr-1 border-r border-slate-100 pr-2 uppercase">
                                                                                                    <span className="text-slate-400 font-bold block">CARGADOS:</span>
                                                                                                    <span className="font-extrabold text-slate-800 dark:text-slate-100">{item.cantidad_pedida}</span>
                                                                                                </div>
                                                                                            )}

                                                                                            {/* Control de cantidad con botones rápidos de ajuste */}
                                                                                            <div className="flex items-center gap-1 bg-slate-100 dark:bg-slate-800 p-1 rounded-xl">
                                                                                                <button
                                                                                                    onClick={() => {
                                                                                                        setValidadorScans(prev => ({
                                                                                                            ...prev,
                                                                                                            [key]: Math.max(0, (prev[key] || 0) - 1)
                                                                                                        }));
                                                                                                    }}
                                                                                                    disabled={scanCount === 0}
                                                                                                    className="w-7 h-7 flex items-center justify-center bg-white dark:bg-slate-700 hover:bg-slate-50 dark:hover:bg-slate-600 rounded-lg text-slate-605 dark:text-white font-black shadow-xs active:scale-95 transition-all text-xs border border-slate-150 dark:border-slate-650 cursor-pointer disabled:opacity-30 disabled:pointer-events-none"
                                                                                                    title="Restar 1 unidad"
                                                                                                >
                                                                                                    -
                                                                                                </button>
                                                                                                
                                                                                                <div className="w-12 text-center">
                                                                                                    <span className={`text-[9px] uppercase font-bold block ${hasScans ? 'text-emerald-600 dark:text-emerald-400' : 'text-slate-405'}`}>
                                                                                                        FÍSICO
                                                                                                    </span>
                                                                                                    <span className={`text-sm font-black font-mono leading-none ${hasScans ? 'text-emerald-600 dark:text-emerald-400' : 'text-slate-400'}`}>
                                                                                                        {scanCount}
                                                                                                    </span>
                                                                                                </div>

                                                                                                <button
                                                                                                    onClick={() => {
                                                                                                        setValidadorScans(prev => ({
                                                                                                            ...prev,
                                                                                                            [key]: (prev[key] || 0) + 1
                                                                                                        }));
                                                                                                    }}
                                                                                                    className="w-7 h-7 flex items-center justify-center bg-white dark:bg-slate-700 hover:bg-slate-50 dark:hover:bg-slate-600 rounded-lg text-slate-605 dark:text-white font-black shadow-xs active:scale-95 transition-all text-xs border border-slate-150 dark:border-slate-650 cursor-pointer"
                                                                                                    title="Sumar 1 unidad"
                                                                                                >
                                                                                                    +
                                                                                                </button>
                                                                                            </div>

                                                                                            {/* Botón de digitación manual mediante teclado modal */}
                                                                                            <button
                                                                                                onClick={() => {
                                                                                                    setValidadorManualEditSku(key);
                                                                                                    setValidadorManualQty(String(scanCount));
                                                                                                }}
                                                                                                className="p-2.5 bg-amber-50 hover:bg-amber-100 dark:bg-amber-955/20 dark:hover:bg-amber-900/40 text-amber-650 dark:text-amber-400 border border-amber-200 dark:border-amber-900/40 rounded-xl transition-all cursor-pointer shadow-xs shrink-0"
                                                                                                title="Digitar cantidad física de forma exacta"
                                                                                            >
                                                                                                <Keyboard className="w-3.5 h-3.5" />
                                                                                            </button>
                                                                                        </div>
                                                                                    </div>
                                                                                );
                                                                            })
                                                                        )}
                                                                    </div>
                                                                </>
                                                            );
                                                        })()}
                                                    </div>

                                                    {/* Botón De Guardar y Mostrar comparación */}
                                                    <div className="border-t border-slate-100 dark:border-slate-800 pt-5">
                                                        <button
                                                            onClick={() => setValidadorIsFinished(true)}
                                                            className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-black py-4 rounded-2xl uppercase tracking-widest text-xs shadow-xl shadow-emerald-600/20 active:scale-95 transition-all text-center flex items-center justify-center gap-2 cursor-pointer"
                                                        >
                                                            📋 FINALIZAR Y COMPARAR CARRO
                                                        </button>
                                                    </div>
                                                </div>
                                            </div>

                                            {/* Columna Derecha: Bitácora de escaneos */}
                                            <div className="lg:col-span-4 space-y-6">
                                                <div className="bg-white dark:bg-slate-900 border border-slate-150 dark:border-slate-800 p-6 rounded-3xl space-y-4 shadow-sm">
                                                    <h3 className="text-xs font-black text-slate-900 dark:text-white uppercase tracking-wider flex items-center gap-1.5">
                                                        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="text-emerald-500">
                                                            <path d="M12 20h9"/><path d="M3 20v-8a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v8"/><path d="M5 10V5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v5" />
                                                        </svg>
                                                        HISTORIAL DE ESCANEOS
                                                    </h3>

                                                    {validadorLogs.length === 0 ? (
                                                        <p className="text-[11px] text-slate-400 dark:text-slate-600 leading-relaxed uppercase tracking-wider text-center py-6">
                                                            Ningún escaneo registrado aún
                                                        </p>
                                                    ) : (
                                                        <div className="space-y-2.5 max-h-[380px] overflow-y-auto pr-1">
                                                            {validadorLogs.map((log) => (
                                                                <div 
                                                                    key={`log-${log.id}`}
                                                                    className={`p-2.5 rounded-xl border text-[10px] space-y-0.5 leading-tight ${
                                                                        log.type === 'error' 
                                                                            ? 'bg-rose-50/50 border-rose-200 dark:bg-rose-950/20 dark:border-rose-900/40 text-rose-700 dark:text-rose-300' 
                                                                            : log.type === 'warn'
                                                                            ? 'bg-amber-50/50 border-amber-200 dark:bg-amber-955/10 dark:border-amber-900/30 text-amber-700 dark:text-amber-300'
                                                                            : 'bg-slate-50 border-slate-100 dark:bg-slate-850/30 dark:border-slate-800 text-slate-600 dark:text-slate-450'
                                                                    }`}
                                                                >
                                                                    <div className="flex justify-between font-mono text-[8px] opacity-60">
                                                                        <span>{log.timestamp}</span>
                                                                        <span className="uppercase font-bold">{log.type}</span>
                                                                    </div>
                                                                    <p className="font-semibold">{log.message}</p>
                                                                </div>
                                                            ))}
                                                        </div>
                                                    )}
                                                </div>
                                            </div>
                                        </div>
                                    );
                                })()}

                                 {/* PANTALLA 3: Reporte de Comparación del Carro (IsFinished) */}
                                {validadorSelectedPlate !== null && validadorIsFinished && (() => {
                                    const currentPlateOrders = orders.filter(o => o.placa === validadorSelectedPlate);
                                    
                                    const aggregatedItemsMap: Record<string, {
                                        sku: string;
                                        codigo: string;
                                        descripcion: string;
                                        unidad: string;
                                        cantidad_pedida: number; // expected
                                        cantidad_picada: number; // picked
                                    }> = {};

                                    currentPlateOrders.forEach(o => {
                                        const key = o.sku || o.codigo;
                                        if (!aggregatedItemsMap[key]) {
                                            aggregatedItemsMap[key] = {
                                                sku: o.sku,
                                                codigo: o.codigo,
                                                descripcion: o.descripcion,
                                                unidad: o.unidad,
                                                cantidad_pedida: 0,
                                                cantidad_picada: 0
                                            };
                                        }
                                        aggregatedItemsMap[key].cantidad_pedida += o.cantidad_pedida;
                                        aggregatedItemsMap[key].cantidad_picada += (o.cantidad_picada || 0);
                                    });

                                    const list = Object.values(aggregatedItemsMap).sort((a,b) => a.descripcion.localeCompare(b.descripcion));

                                    let conformes = 0;
                                    let faltas = 0;
                                    let sobras = 0;

                                    const diffSummary = list.map(item => {
                                        const key = item.sku || item.codigo;
                                        const physical = validadorScans[key] || 0;
                                        const expected = item.cantidad_pedida; 
                                        const diff = physical - expected;

                                        if (diff === 0) conformes++;
                                        else if (diff < 0) faltas += Math.abs(diff);
                                        else sobras += diff;

                                        return {
                                            item,
                                            expected,
                                            physical,
                                            diff
                                        };
                                    });

                                    const isEverythingPerfect = conformes === list.length;

                                    return (
                                        <div className="bg-white dark:bg-slate-900 border border-slate-150 dark:border-slate-800 p-6 sm:p-8 rounded-3xl space-y-6 shadow-sm">
                                            {/* Cabecera del Reporte de Auditoría */}
                                            <div className="text-center space-y-2 border-b border-slate-100 dark:border-slate-800 pb-6">
                                                <div className="inline-flex p-3 bg-emerald-50 dark:bg-emerald-950/20 text-emerald-600 dark:text-emerald-450 rounded-full">
                                                    <CheckCircle className="w-8 h-8" />
                                                </div>
                                                <h2 className="text-xl sm:text-2xl font-black text-slate-905 dark:text-white uppercase tracking-tight">
                                                    REPORTE DE AUDITORÍA: CARRO {validadorSelectedPlate}
                                                </h2>
                                                <p className="text-xs text-slate-500 dark:text-slate-400 font-medium">
                                                    Auditado con sistema de Validación a Ciegas por {user?.nombre || user?.username} a las {new Date().toLocaleTimeString()}
                                                </p>
                                            </div>

                                            {/* Indicadores de Mismatch de Cantidades */}
                                            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                                                <div className="bg-emerald-50/50 dark:bg-emerald-950/15 border border-emerald-100 dark:border-emerald-900/40 p-4 rounded-2xl text-center space-y-1">
                                                    <span className="text-[10px] font-black text-emerald-700 dark:text-emerald-450 uppercase tracking-widest block">
                                                        ÍTEMS CONFORMES (CUADRAN)
                                                    </span>
                                                    <span className="text-3xl font-black text-emerald-600 dark:text-emerald-400 font-mono">
                                                        {conformes} / {list.length}
                                                    </span>
                                                </div>
                                                <div className="bg-rose-50/50 dark:bg-rose-950/15 border border-rose-100 dark:border-rose-900/40 p-4 rounded-2xl text-center space-y-1">
                                                    <span className="text-[10px] font-black text-rose-700 dark:text-rose-450 uppercase tracking-widest block">
                                                        PRODUCTOS CON FALTANTES
                                                    </span>
                                                    <span className="text-3xl font-black text-rose-600 dark:text-rose-400 font-mono">
                                                        {faltas} unidades
                                                    </span>
                                                </div>
                                                <div className="bg-amber-50/50 dark:bg-amber-955/10 border border-amber-105 dark:border-amber-900/30 p-4 rounded-2xl text-center space-y-1">
                                                    <span className="text-[10px] font-black text-amber-700 dark:text-amber-450 uppercase tracking-widest block">
                                                        PRODUCTOS EXCEDENTES
                                                    </span>
                                                    <span className="text-3xl font-black text-amber-600 dark:text-amber-400 font-mono">
                                                        {sobras} unidades
                                                    </span>
                                                </div>
                                            </div>

                                            {/* SECCIÓN DE RESUMEN EXPOSITIVO DE DIFERENCIAS */}
                                            <div className="space-y-3">
                                                <h3 className="text-xs font-black text-slate-400 uppercase tracking-widest">
                                                    📢 ¿CUÁNTO FALTA Y DE QUÉ PRODUCTO?
                                                </h3>
                                                
                                                {isEverythingPerfect ? (
                                                    <div className="bg-emerald-600 text-white p-6 rounded-2.5xl text-center font-black uppercase text-xs tracking-widest space-y-1 shadow-lg shadow-emerald-500/25">
                                                        <p className="text-sm">🌟 ¡VALIDACIÓN TOTAL CONFORME!</p>
                                                        <p className="text-[10px] opacity-90 font-bold normal-case">Todos los productos físicos en el carro coinciden al 100% con los cargados en el archivo.</p>
                                                    </div>
                                                ) : (
                                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                                        {/* LISTA DE FALTANTES */}
                                                        <div className="bg-rose-50/30 dark:bg-rose-955/5 border border-rose-150 dark:border-rose-900/30 p-4 rounded-2.5xl space-y-3">
                                                            <h4 className="text-[10px] font-black text-rose-600 uppercase tracking-widest border-b border-rose-100 dark:border-rose-900/40 pb-1.5 flex items-center gap-1.5">
                                                                <span className="w-2 h-2 bg-rose-500 rounded-full animate-ping" />
                                                                PRODUCTOS QUE FALTAN EN EL CARRO
                                                            </h4>
                                                            
                                                            {diffSummary.filter(r => r.diff < 0).length === 0 ? (
                                                                <p className="text-[10px] font-bold text-emerald-600 uppercase tracking-wider text-center py-2">
                                                                    ✅ NO HAY PRODUCTOS FALTANTES
                                                                </p>
                                                            ) : (
                                                                <div className="space-y-2 max-h-[220px] overflow-y-auto pr-1">
                                                                    {diffSummary.filter(r => r.diff < 0).map(row => (
                                                                        <div key={`report-falt-card-${row.item.sku}`} className="p-3 bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 rounded-xl flex items-center justify-between text-[11px] gap-2">
                                                                            <div className="min-w-0 flex-1">
                                                                                <p className="font-extrabold text-slate-800 dark:text-white uppercase truncate">{row.item.descripcion}</p>
                                                                                <p className="text-[9px] text-slate-400 font-mono">SKU: {row.item.sku}</p>
                                                                            </div>
                                                                            <div className="text-right flex-shrink-0 bg-rose-500/10 text-rose-600 dark:text-rose-400 border border-rose-250 px-2 rounded-lg">
                                                                                <p className="text-[8px] font-black uppercase">FALTAN</p>
                                                                                <p className="text-xs font-black font-mono">{Math.abs(row.diff)} {row.item.unidad}</p>
                                                                            </div>
                                                                        </div>
                                                                    ))}
                                                                </div>
                                                            )}
                                                        </div>

                                                        {/* LISTA DE EXCEDENTES */}
                                                        <div className="bg-amber-50/20 dark:bg-amber-955/5 border border-amber-150 dark:border-amber-900/30 p-4 rounded-2.5xl space-y-3">
                                                            <h4 className="text-[10px] font-black text-amber-600 uppercase tracking-widest border-b border-amber-100 dark:border-amber-900/40 pb-1.5 flex items-center gap-1.5">
                                                                <span className="w-2 h-2 bg-amber-500 rounded-full" />
                                                                PRODUCTOS EXCEDENTES / SOBRANTES
                                                            </h4>
                                                            
                                                            {diffSummary.filter(r => r.diff > 0).length === 0 ? (
                                                                <p className="text-[10px] font-bold text-slate-450 uppercase tracking-wider text-center py-2">
                                                                    👍 NO HAY PRODUCTOS EXCEDENTES
                                                                </p>
                                                            ) : (
                                                                <div className="space-y-2 max-h-[220px] overflow-y-auto pr-1">
                                                                    {diffSummary.filter(r => r.diff > 0).map(row => (
                                                                        <div key={`report-sobr-card-${row.item.sku}`} className="p-3 bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 rounded-xl flex items-center justify-between text-[11px] gap-2">
                                                                            <div className="min-w-0 flex-1">
                                                                                <p className="font-extrabold text-slate-800 dark:text-white uppercase truncate">{row.item.descripcion}</p>
                                                                                <p className="text-[9px] text-slate-400 font-mono">SKU: {row.item.sku}</p>
                                                                            </div>
                                                                            <div className="text-right flex-shrink-0 bg-amber-500/10 text-amber-605 dark:text-amber-400 border border-amber-250 px-2 rounded-lg">
                                                                                <p className="text-[8px] font-black uppercase">SOBRAN</p>
                                                                                <p className="text-xs font-black font-mono">+{row.diff} {row.item.unidad}</p>
                                                                            </div>
                                                                        </div>
                                                                    ))}
                                                                </div>
                                                            )}
                                                        </div>
                                                    </div>
                                                )}
                                            </div>

                                            {/* Grilla Comparativa */}
                                            <div className="space-y-3 pt-3">
                                                <h3 className="text-xs font-black text-slate-400 uppercase tracking-widest">
                                                    HOJA DETALLADA DE DIFERENCIAS Y CONSISTENCIA
                                                </h3>
                                                <div className="border border-slate-150 dark:border-slate-800 rounded-2.5xl overflow-hidden">
                                                    <div className="overflow-x-auto">
                                                        <table className="w-full text-left border-collapse text-xs">
                                                            <thead>
                                                                <tr className="bg-slate-50 dark:bg-slate-950 text-[10px] font-black uppercase tracking-widest text-slate-505 border-b border-slate-150 dark:border-slate-805">
                                                                    <th className="p-3">DESCRIPCIÓN</th>
                                                                    <th className="p-3 text-center">ESPERADO</th>
                                                                    <th className="p-3 text-center">FÍSICO EN CARRO</th>
                                                                    <th className="p-3 text-center">DIFERENCIA</th>
                                                                    <th className="p-3 text-center">ESTADO</th>
                                                                </tr>
                                                            </thead>
                                                            <tbody className="divide-y divide-slate-150 dark:divide-slate-850">
                                                                {diffSummary.map((row) => {
                                                                    const k = row.item.sku || row.item.codigo;
                                                                    const statusText = 
                                                                        row.diff === 0 ? 'CONFORME' : 
                                                                        row.diff < 0 ? `FALTA (${Math.abs(row.diff)})` : 
                                                                        `SOBRA (+${row.diff})`;
                                                                    
                                                                    const statusBadgeClass = 
                                                                        row.diff === 0 ? 'bg-emerald-50 text-emerald-800 border-emerald-200 dark:bg-emerald-950/20 dark:text-emerald-300 dark:border-emerald-800' : 
                                                                        row.diff < 0 ? 'bg-rose-50 text-rose-800 border-rose-200 dark:bg-rose-950/20 dark:text-rose-300 dark:border-rose-800' : 
                                                                        'bg-amber-50 text-amber-800 border-amber-205 dark:bg-amber-955/15 dark:text-amber-300 dark:border-amber-800';

                                                                    return (
                                                                        <tr key={`aud-row-${k}`} className="hover:bg-slate-50/50 dark:hover:bg-slate-850/20">
                                                                            <td className="p-3 max-w-[280px]">
                                                                                <p className="font-bold text-slate-900 dark:text-white leading-tight">
                                                                                    {row.item.descripcion}
                                                                                </p>
                                                                                <span className="font-mono text-[9px] text-slate-400 uppercase tracking-tighter">
                                                                                    SKU: {row.item.sku}
                                                                                </span>
                                                                            </td>
                                                                            <td className="p-3 text-center font-mono font-bold text-slate-500 dark:text-slate-400">
                                                                                {row.expected}
                                                                            </td>
                                                                            <td className="p-3 text-center font-mono font-bold text-slate-800 dark:text-white">
                                                                                {row.physical}
                                                                            </td>
                                                                            <td className={`p-3 text-center font-mono font-extrabold ${
                                                                                row.diff === 0 ? 'text-emerald-600 dark:text-emerald-450' : 
                                                                                row.diff < 0 ? 'text-rose-600 dark:text-rose-400' : 
                                                                                'text-amber-600 dark:text-amber-400'
                                                                            }`}>
                                                                                {row.diff > 0 ? `+${row.diff}` : row.diff}
                                                                            </td>
                                                                            <td className="p-3 text-center">
                                                                                <span className={`px-2 py-1 rounded-md text-[9px] font-black uppercase border select-none tracking-widest ${statusBadgeClass}`}>
                                                                                    {statusText}
                                                                                </span>
                                                                            </td>
                                                                        </tr>
                                                                    );
                                                                })}
                                                            </tbody>
                                                        </table>
                                                    </div>
                                                </div>
                                            </div>

                                            {/* Controles de Continuación */}
                                            <div className="flex flex-col sm:flex-row gap-3 pt-4 border-t border-slate-100 dark:border-slate-800">
                                                <button
                                                    onClick={() => {
                                                        setValidadorScans({});
                                                        setValidadorIsFinished(false);
                                                        setValidadorLogs([]);
                                                        setValidadorToast(null);
                                                    }}
                                                    className="flex-1 py-3 border-2 border-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-950/20 text-emerald-600 dark:text-emerald-400 font-black uppercase text-[10px] tracking-widest rounded-2xl transition-all active:scale-95 text-center cursor-pointer"
                                                >
                                                    🔄 REINICIAR VALIDACIÓN DE ESTE CARRO
                                                </button>
                                                <button
                                                    onClick={() => {
                                                        setValidadorSelectedPlate(null);
                                                        setValidadorIsFinished(false);
                                                    }}
                                                    className="flex-1 py-3 bg-slate-900 hover:bg-black dark:bg-slate-800 dark:hover:bg-slate-705 text-white font-black uppercase text-[10px] tracking-widest rounded-2xl transition-all active:scale-95 text-center cursor-pointer shadow-md"
                                                >
                                                    ↩️ VOLVER A SELECCIÓN DE CARROS
                                                </button>
                                            </div>
                                        </div>
                                    );
                                })()}

                                {validadorManualEditSku !== null && (() => {
                                    const matchedOrder = orders.find(o => o.sku === validadorManualEditSku || o.codigo === validadorManualEditSku);
                                    return (
                                        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-slate-950/80 backdrop-blur-xs p-4">
                                            <div className="bg-white dark:bg-slate-900 rounded-3xl max-w-md w-full p-6 border border-slate-200 dark:border-slate-800 shadow-2xl relative">
                                                <h3 className="text-lg font-black text-slate-900 dark:text-white uppercase mb-2">
                                                    Ingresar Cantidad Validada
                                                </h3>
                                                <p className="text-xs text-slate-500 dark:text-slate-400 mb-4 font-bold uppercase tracking-wider">
                                                    {matchedOrder?.descripcion || 'Producto'}
                                                </p>
                                                
                                                <div className="space-y-4">
                                                    <label className="block text-[10px] font-black uppercase text-slate-400 tracking-widest">
                                                        Digite la cantidad física que observa en el carro (mayor a 10):
                                                    </label>
                                                    <input
                                                        type="number"
                                                        autoFocus
                                                        value={validadorManualQty}
                                                        onFocus={(e) => e.target.select()}
                                                        onChange={(e) => setValidadorManualQty(e.target.value)}
                                                        onKeyDown={(e) => {
                                                            if (e.key === 'Enter') {
                                                                const parsed = parseFloat(validadorManualQty) || 0;
                                                                setValidadorScans(prev => ({ ...prev, [validadorManualEditSku]: parsed }));
                                                                setValidadorManualEditSku(null);
                                                                setValidadorManualQty('');
                                                                
                                                                setValidadorLogs(prev => [
                                                                    {
                                                                        id: Math.random().toString(),
                                                                        message: `Editado manual: ${matchedOrder?.descripcion || 'Producto'}. Registrado: ${parsed}`,
                                                                        type: 'success',
                                                                        timestamp: new Date().toLocaleTimeString()
                                                                    },
                                                                    ...prev
                                                                ]);
                                                            }
                                                        }}
                                                        className="w-full px-4 py-3 bg-slate-100 dark:bg-slate-800 border border-slate-205 dark:border-slate-750 rounded-xl focus:ring-2 focus:ring-emerald-500 text-slate-900 dark:text-white text-lg font-mono font-bold"
                                                        placeholder="0"
                                                    />
                                                    
                                                    <div className="flex justify-end gap-3 pt-2">
                                                        <button
                                                            onClick={() => {
                                                                setValidadorManualEditSku(null);
                                                                setValidadorManualQty('');
                                                            }}
                                                            className="px-4 py-2 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-705 text-slate-500 dark:text-slate-300 font-bold uppercase text-[10px] tracking-widest rounded-xl transition-colors cursor-pointer"
                                                        >
                                                            Cancelar
                                                        </button>
                                                        <button
                                                            onClick={() => {
                                                                const parsed = parseFloat(validadorManualQty) || 0;
                                                                setValidadorScans(prev => ({ ...prev, [validadorManualEditSku]: parsed }));
                                                                setValidadorManualEditSku(null);
                                                                setValidadorManualQty('');
                                                                
                                                                setValidadorLogs(prev => [
                                                                    {
                                                                        id: Math.random().toString(),
                                                                        message: `Editado manual: ${matchedOrder?.descripcion || 'Producto'}. Registrado: ${parsed}`,
                                                                        type: 'success',
                                                                        timestamp: new Date().toLocaleTimeString()
                                                                    },
                                                                    ...prev
                                                                ]);
                                                            }}
                                                            className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-bold uppercase text-[10px] tracking-widest rounded-xl transition-all active:scale-95 cursor-pointer"
                                                        >
                                                            Guardar Cantidad
                                                        </button>
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                    );
                                })()}

                                {validadorErrorAlert !== null && (
                                    <div className="fixed inset-0 z-[300] flex items-center justify-center bg-rose-950/90 backdrop-blur-xs p-4">
                                        <div className="bg-white dark:bg-slate-900 rounded-[2rem] max-w-lg w-full p-6 sm:p-8 border-4 border-rose-500 shadow-2xl relative text-center space-y-6 animate-in zoom-in-95 duration-150">
                                            <div className="w-20 h-20 bg-rose-100 dark:bg-rose-955/20 text-rose-600 rounded-full flex items-center justify-center mx-auto animate-bounce">
                                                <XCircle className="w-12 h-12" />
                                            </div>
                                            
                                            <div className="space-y-2">
                                                <h3 className="text-xl font-black text-rose-600 uppercase tracking-tight">
                                                    🚫 ¡PRODUCTO NO PERTENECE AL CARRO!
                                                </h3>
                                                <p className="text-[10px] font-black uppercase tracking-wider text-rose-500 bg-rose-50 dark:bg-rose-955/20 py-1.5 px-3 rounded-lg inline-block font-mono">
                                                    CÓDIGO ESCANEADO: {validadorErrorAlert.code}
                                                </p>
                                            </div>

                                            <div className="bg-slate-50 dark:bg-slate-950/40 p-4 rounded-xl border border-slate-150 dark:border-slate-850">
                                                <span className="text-[9px] font-black uppercase text-slate-400 tracking-wider block mb-1">
                                                    Descripción del Producto INCORRECTO:
                                                </span>
                                                <p className="text-sm font-black text-slate-800 dark:text-white uppercase leading-tight">
                                                    {validadorErrorAlert.name}
                                                </p>
                                            </div>

                                            <div className="bg-rose-50 dark:bg-rose-955/10 p-4 rounded-xl border border-rose-100 dark:border-rose-900/10 text-left">
                                                <p className="text-[10px] font-black uppercase tracking-wide text-rose-800 dark:text-rose-200 font-bold">
                                                    ⚠️ INSTRUCCIÓN DE SEGURIDAD:
                                                </p>
                                                <p className="text-[11px] text-slate-700 dark:text-slate-355 font-bold mt-1 leading-normal uppercase">
                                                    Este producto NO debe ser despachado en este carro ({validadorSelectedPlate}). Por favor, retírelo físicamente del carro y póngalo en su lugar correcto.
                                                </p>
                                            </div>

                                            <button
                                                onClick={() => setValidadorErrorAlert(null)}
                                                className="w-full py-4 bg-rose-600 hover:bg-rose-700 text-white font-black uppercase tracking-wider text-xs rounded-xl transition-all shadow-lg shadow-rose-600/20 active:scale-95 cursor-pointer flex items-center justify-center gap-2"
                                            >
                                                <span>✅ ENTENDIDO, RETIRADO DEL CARRO</span>
                                            </button>
                                        </div>
                                    </div>
                                )}
                            </motion.div>
                        )}

                        {viewMode === 'CARGA' && (
                            <motion.div 
                                initial={{ opacity: 0, y: 20 }}
                                animate={{ opacity: 1, y: 0 }}
                                exit={{ opacity: 0, y: -20 }}
                                className="flex flex-col items-center justify-center py-20"
                            >
                                <div className="w-24 h-24 bg-blue-100 dark:bg-blue-900/30 rounded-3xl flex items-center justify-center mb-8 text-blue-600">
                                    <FileSpreadsheet className="w-12 h-12" />
                                </div>
                                <h2 className="text-2xl font-black text-slate-900 dark:text-white mb-2 text-center underline decoration-blue-500 decoration-4 underline-offset-4">
                                    CARGAR PEDIDOS DEL DÍA
                                </h2>
                                <p className="text-slate-500 dark:text-slate-400 text-center mb-10 max-w-sm">
                                    Selecciona el archivo Excel generado por el sistema para iniciar el proceso de picking.
                                </p>
                                
                                <div className="flex flex-col sm:flex-row gap-4">
                                    <label className="relative group cursor-pointer">
                                        <input 
                                            type="file" 
                                            accept=".xlsx, .xls, .csv" 
                                            className="hidden" 
                                            onChange={handleFileUpload}
                                            disabled={isProcessing}
                                        />
                                        <div className="bg-[#009ED6] hover:bg-[#008cb8] text-white font-black px-10 py-5 rounded-2xl shadow-xl shadow-blue-500/30 flex items-center gap-3 transition-all active:scale-95 uppercase text-xs tracking-widest">
                                            {isProcessing ? <RefreshCw className="w-5 h-5 animate-spin" /> : <Upload className="w-5 h-5" />}
                                            {isProcessing ? 'PROCESANDO...' : 'SUBIR EXCEL PICKING (PIKING)'}
                                        </div>
                                    </label>

                                    <button 
                                        onClick={downloadTemplate}
                                        className="bg-emerald-500 hover:bg-emerald-600 text-white font-black px-10 py-5 rounded-2xl shadow-xl shadow-emerald-500/30 flex items-center gap-3 transition-all active:scale-95 uppercase text-xs tracking-widest"
                                    >
                                        <FileSpreadsheet className="w-5 h-5" />
                                        DESCARGAR PLANTILLA
                                    </button>
                                </div>
                            </motion.div>
                        )}

                        {viewMode === 'CAMARAS' && (
                            <motion.div 
                                initial={{ opacity: 0, y: 20 }}
                                animate={{ opacity: 1, y: 0 }}
                                className="grid grid-cols-2 sm:grid-cols-3 gap-3 sm:gap-6"
                            >
                                {(['SECOS', 'REFRIGERADO', 'CONGELADO', 'PESOS SECOS', 'PESOS REFRIGERADO'] as const).map((cam) => {
                                    const camGroup = groupedOrders.find(g => g.name === cam);
                                    const totalPlates = camGroup?.plates.length || 0;
                                    const allItems = camGroup?.plates.flatMap(p => p.subBlocks?.flatMap(sb => sb.items) || []) || [];
                                    const totalItems = allItems.length;
                                    const pickedItems = allItems.filter(o => o.completado).length;

                                    if (totalItems === 0) return null;

                                    return (
                                        <button
                                            key={`main-cam-${cam}`}
                                            onClick={() => {
                                                setSelectedCamera(cam);
                                                setViewMode('PLACAS');
                                            }}
                                            className="bg-white dark:bg-slate-900 p-4 sm:p-6 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm hover:shadow-lg transition-all group text-left flex flex-col justify-between"
                                        >
                                            <div>
                                                <div className={`w-10 h-10 rounded-xl flex items-center justify-center mb-3 transition-colors ${
                                                    cam === 'SECOS' ? 'bg-slate-100 text-slate-500 group-hover:bg-slate-200' :
                                                    cam === 'REFRIGERADO' ? 'bg-blue-50 text-blue-500 group-hover:bg-blue-100' :
                                                    cam === 'CONGELADO' ? 'bg-indigo-50 text-indigo-500 group-hover:bg-indigo-100' :
                                                    cam === 'PESOS SECOS' ? 'bg-emerald-50 text-emerald-600 group-hover:bg-emerald-100' :
                                                    'bg-rose-50 text-rose-500 group-hover:bg-rose-100'
                                                }`}>
                                                    {cam === 'SECOS' ? <Box className="w-5 h-5" /> : 
                                                     cam === 'REFRIGERADO' ? <Thermometer className="w-5 h-5" /> : 
                                                     cam === 'CONGELADO' ? <Snowflake className="w-5 h-5" /> :
                                                     <Truck className="w-5 h-5" />}
                                                </div>
                                                <h3 className="text-xs xs:text-sm sm:text-base md:text-lg font-black text-slate-850 dark:text-white uppercase tracking-tight mb-1 leading-tight break-words">{cam}</h3>
                                            </div>
                                            <div className="space-y-1 mt-2">
                                                <p className="text-[10px] sm:text-xs font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider">{totalPlates} {totalPlates === 1 ? 'Vehículo' : 'Vehículos'}</p>
                                                <p className="text-[9px] sm:text-[10px] font-black text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-950/40 px-1.5 py-0.5 rounded-md inline-block">
                                                    {pickedItems}/{totalItems} PROCESADOS
                                                </p>
                                            </div>
                                        </button>
                                    );
                                })}
                            </motion.div>
                        )}

                        {viewMode === 'PLACAS' && (
                            <motion.div 
                                initial={{ opacity: 0 }} 
                                animate={{ opacity: 1 }}
                                className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-6"
                            >
                                {groupedOrders.find(g => g.name === selectedCamera)?.plates.map((group, plateIdx) => {
                                    const allItems = group.subBlocks?.flatMap(sb => sb.items) || [];
                                    const totalItems = allItems.length;
                                    const pickedItems = allItems.filter(o => o.completado).length;
                                    const totalPercent = totalItems > 0 ? Math.round((pickedItems / totalItems) * 100) : 0;
                                    const assignedRamp = plateRamps[group.placa];

                                    return (
                                        <div
                                            key={`plate-card-${group.placa}-${plateIdx}`}
                                            className="bg-white dark:bg-slate-900 rounded-3xl sm:rounded-[2.5rem] border border-slate-200 dark:border-slate-800 shadow-sm hover:shadow-xl transition-all group overflow-hidden relative"
                                        >
                                            {/* Acciones para ADMIN/ASISTENTE */}
                                            {(user?.rol === 'ADMIN' || user?.rol === 'ASISTENTE') && (
                                                <div className="absolute top-4 right-4 sm:top-6 sm:right-6 flex items-center gap-2 sm:opacity-0 group-hover:opacity-100 transition-opacity z-20">
                                                    <button
                                                        onClick={(e) => {
                                                            e.stopPropagation();
                                                            setPlateToProcess(group.placa);
                                                            setShowProcessModal(true);
                                                        }}
                                                        className="p-2.5 sm:p-3 bg-emerald-500 hover:bg-emerald-600 text-white rounded-xl sm:rounded-2xl shadow-lg shadow-emerald-500/30 transition-all active:scale-95"
                                                        title="Finalizar Carga / Procesar"
                                                    >
                                                        <CheckCircle className="w-4 h-4 sm:w-5 sm:h-5" />
                                                    </button>
                                                    <button
                                                        onClick={(e) => {
                                                            e.stopPropagation();
                                                            setPlateToDelete(group.placa);
                                                            setShowDeleteModal(true);
                                                        }}
                                                        className="p-2.5 sm:p-3 bg-rose-500 hover:bg-rose-600 text-white rounded-xl sm:rounded-2xl shadow-lg shadow-rose-500/30 transition-all active:scale-95"
                                                        title="Eliminar Carro"
                                                    >
                                                        <Trash2 className="w-4 h-4 sm:w-5 sm:h-5" />
                                                    </button>
                                                </div>
                                            )}

                                            <div className="p-3 sm:p-8">
                                                <div className="flex justify-between items-start mb-3 sm:mb-6">
                                                    <div 
                                                        className="flex items-center gap-2 sm:gap-6 cursor-pointer flex-1"
                                                        onClick={() => {
                                                            setSelectedPlate(group.placa);
                                                            setViewMode('PICKING');
                                                        }}
                                                    >
                                                        <div className="w-10 h-10 sm:w-16 sm:h-16 bg-slate-50 dark:bg-slate-800 rounded-xl sm:rounded-2xl flex items-center justify-center text-slate-400 group-hover:bg-blue-50 group-hover:text-blue-500 transition-colors">
                                                            <Truck className="w-5 h-5 sm:w-8 sm:h-8" />
                                                        </div>
                                                        <div className="text-left">
                                                            <span className="text-[7px] sm:text-[10px] font-bold text-slate-400 uppercase tracking-widest leading-none">Placa</span>
                                                            <h3 className="text-sm sm:text-2xl font-black text-slate-800 dark:text-white uppercase leading-none mt-0.5">{group.placa}</h3>
                                                            {assignedRamp && (
                                                                <div className="mt-1 flex items-center gap-1">
                                                                    <span className="text-[7px] sm:text-[10px] font-black bg-blue-600 text-white px-1.5 py-0.5 rounded-md sm:rounded-lg uppercase">RAMPA {assignedRamp}</span>
                                                                </div>
                                                            )}
                                                            <div className="mt-1.5 sm:mt-3 flex flex-col gap-0.5 sm:gap-1.5">
                                                                <div className={`w-full ${user?.rol === 'ADMIN' || user?.rol === 'ASISTENTE' ? 'h-3 sm:h-8' : 'h-1.5 sm:h-5'} bg-slate-100 dark:bg-slate-800 rounded-full sm:rounded-lg overflow-hidden relative border border-slate-200 dark:border-slate-700`}>
                                                                    <motion.div 
                                                                        initial={{ width: 0 }}
                                                                        animate={{ width: `${totalPercent}%` }}
                                                                        className={`h-full transition-all duration-700 flex items-center justify-center ${getProgressColor(totalPercent)}`}
                                                                    >
                                                                        {totalPercent > 30 && (
                                                                            <span className="hidden sm:inline text-[10px] font-black text-white drop-shadow-sm">
                                                                                {totalPercent}%
                                                                            </span>
                                                                        )}
                                                                    </motion.div>
                                                                </div>
                                                                <div className="flex justify-between items-center px-0.5">
                                                                    <span className="text-[8px] font-black text-slate-600 dark:text-slate-400 leading-none">{pickedItems}/{totalItems} Items</span>
                                                                    <span className="text-[8px] font-black text-blue-600 sm:hidden leading-none">{totalPercent}%</span>
                                                                </div>
                                                            </div>
                                                        </div>
                                                    </div>
                                                    <div className="flex gap-1.5 sm:gap-2">
                                                        <button 
                                                            onClick={(e) => {
                                                                e.stopPropagation();
                                                                handleExportPlateExcel(group.placa);
                                                            }}
                                                            className="w-9 h-9 sm:w-10 sm:h-10 rounded-lg sm:rounded-xl bg-emerald-50 dark:bg-emerald-900/20 text-emerald-600 hover:bg-emerald-500 hover:text-white flex items-center justify-center transition-all border border-emerald-100 dark:border-emerald-800"
                                                            title="Descargar Reporte Excel"
                                                        >
                                                            <FileSpreadsheet className="w-4 h-4 sm:w-5 sm:h-5" />
                                                        </button>
                                                        <button 
                                                            onClick={() => setAssigningRampPlate(group.placa)}
                                                            className="w-9 h-9 sm:w-10 sm:h-10 rounded-lg sm:rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-400 hover:bg-blue-500 hover:text-white flex items-center justify-center transition-all"
                                                            title="Asignar Rampa"
                                                        >
                                                            <Save className="w-4 h-4 sm:w-5 sm:h-5" />
                                                        </button>
                                                        <button 
                                                            onClick={() => setShowStatsPlates(prev => ({ ...prev, [group.placa]: !prev[group.placa] }))}
                                                            className={`w-9 h-9 sm:w-10 sm:h-10 rounded-lg sm:rounded-xl flex items-center justify-center transition-all ${showStatsPlates[group.placa] ? 'bg-blue-500 text-white shadow-lg shadow-blue-500/20' : 'bg-slate-100 dark:bg-slate-800 text-slate-400 hover:bg-slate-200'}`}
                                                        >
                                                            <RefreshCw className={`w-4 h-4 sm:w-5 sm:h-5 ${showStatsPlates[group.placa] ? 'animate-spin' : ''}`} />
                                                        </button>
                                                    </div>
                                                </div>

                                                {/* Gerencial Progress Bars */}
                                                {showStatsPlates[group.placa] && (
                                                    <div className="space-y-2 sm:space-y-3 mb-4 sm:mb-6 animate-fade-in bg-slate-50 dark:bg-slate-800/50 p-3 sm:p-4 rounded-2xl sm:rounded-3xl border border-slate-100 dark:border-slate-800/50">
                                                        {Object.values(group.camaras || {})
                                                            .sort((a,b) => {
                                                                const priorityCheck = (name: string) => {
                                                                    if (name.includes('ENSAYO')) return 1;
                                                                    if (name.includes('PICKING')) return 2;
                                                                    if (name.includes('PESO')) return 3;
                                                                    if (name.includes('HUEVO')) return 4;
                                                                    if (name.includes('UNIDADES')) return 5;
                                                                    return 99;
                                                                };
                                                                return priorityCheck(a.camara) - priorityCheck(b.camara);
                                                            })
                                                            .map((cam, idx) => {
                                                                const camTotal = cam.items.length;
                                                                const camPicked = cam.items.filter((o: AfternoonOrder) => o.completado).length;
                                                                const camPercent = camTotal > 0 ? Math.round((camPicked / camTotal) * 100) : 0;
                                                                
                                                                const getColor = (name: string) => {
                                                                    const n = name.toUpperCase();
                                                                    if (n.includes('ENSAYO')) return 'bg-violet-500';
                                                                    if (n.includes('HUEVO')) return 'bg-amber-600';
                                                                    if (n.includes('PESO')) return 'bg-rose-500';
                                                                    if (n.includes('PICKING')) return 'bg-blue-500';
                                                                    if (n.includes('UNIDADES')) return 'bg-slate-400';
                                                                    return 'bg-blue-500';
                                                                };
                                                                const camColor = getColor(cam.camara);
                                                                
                                                                return (
                                                                    <div key={`cam-stats-${group.placa}-${cam.camara}-${idx}`} className="space-y-1">
                                                                        <div className="flex justify-between items-center px-1">
                                                                            <span className="text-[8px] font-black text-slate-500 uppercase tracking-widest">{cam.camara}</span>
                                                                            <span className="text-[9px] font-black text-slate-900 dark:text-white">{camPercent}%</span>
                                                                        </div>
                                                                        <div className="h-4 w-full bg-slate-200 dark:bg-slate-700 rounded-lg overflow-hidden relative border border-slate-300/50 dark:border-slate-600/50">
                                                                            <motion.div 
                                                                                initial={{ width: 0 }}
                                                                                animate={{ width: `${camPercent}%` }}
                                                                                className={`h-full transition-all duration-500 flex items-center justify-center ${camColor}`}
                                                                            >
                                                                                {camPercent > 25 && (
                                                                                    <span className="text-[8px] font-black text-white drop-shadow-sm">
                                                                                        {camPercent}%
                                                                                    </span>
                                                                                )}
                                                                            </motion.div>
                                                                            {camPercent <= 25 && (
                                                                                <div className="absolute inset-0 flex items-center justify-center">
                                                                                    <span className="text-[8px] font-black text-slate-500">
                                                                                        {camPercent}%
                                                                                    </span>
                                                                                </div>
                                                                            )}
                                                                        </div>
                                                                    </div>
                                                                );
                                                            })}
                                                    </div>
                                                )}

                                                <div className="flex flex-wrap gap-1.5 sm:gap-2 mb-4 sm:mb-6">
                                                    {group.subBlocks?.map((sub, subIdx) => {
                                                        const subTotal = sub.items.length;
                                                        const subPicked = sub.items.filter(o => o.completado).length;
                                                        const isSubDone = subTotal === subPicked;

                                                        return (
                                                            <button 
                                                                key={`sub-btn-${group.placa}-${sub.title}-${subIdx}`}
                                                                onClick={() => {
                                                                    setSelectedPlate(group.placa);
                                                                    setSelectedSubBlockTitle(sub.title);
                                                                    setViewMode('PICKING');
                                                                }}
                                                                className={`px-2 py-1 sm:px-3 sm:py-1.5 rounded-full text-[8px] sm:text-[9px] font-black uppercase tracking-widest transition-all ${
                                                                    isSubDone 
                                                                        ? 'bg-emerald-50 text-emerald-600 border border-emerald-100' 
                                                                        : 'bg-slate-100 text-slate-600'
                                                                }`}
                                                            >
                                                                {sub.title.split('(')[0].substring(0, 8)} ({subPicked}/{subTotal})
                                                            </button>
                                                        );
                                                    })}
                                                </div>

                                                {totalPercent === 100 && (
                                                    <button 
                                                        onClick={() => startLoadValidation(group.placa)}
                                                        className="w-full bg-blue-600 text-white font-black py-3 sm:py-4 rounded-xl sm:rounded-2xl uppercase text-[9px] sm:text-[10px] tracking-widest shadow-lg shadow-blue-600/20 flex items-center justify-center gap-2 hover:bg-blue-700 transition-all font-inter"
                                                    >
                                                        <Scan className="w-4 h-4" /> VALIDAR CARGA
                                                    </button>
                                                )}
                                            </div>
                                        </div>
                                    );
                                })}
                            </motion.div>
                        )}

                        {viewMode === 'PICKING' && selectedPlate && selectedCamera && (
                            <motion.div 
                                initial={{ opacity: 0 }} 
                                animate={{ opacity: 1 }}
                                className="space-y-6 pb-20"
                            >
                                {(() => {
                                    const plateGroup = groupedOrders.find(g => g.name === selectedCamera)?.plates.find(p => p.placa === selectedPlate);
                                    if (!plateGroup) return null;

                                    const filteredSubBlocks = selectedSubBlockTitle 
                                        ? plateGroup.subBlocks?.filter(sub => sub.title === selectedSubBlockTitle)
                                        : plateGroup.subBlocks;

                                    // 1. Get all items across filtered sub blocks
                                    let itemsToPick = (filteredSubBlocks || []).flatMap(sub => sub.items);

                                    // 2. If consolidated is active, consolidate items by SKU
                                    if (isConsolidated) {
                                        itemsToPick = consolidateItems(itemsToPick);
                                    }

                                    // 3. Group by CATEGORIA (columna categoria, alphabetically sorted)
                                    const itemsByCategory: Record<string, AfternoonOrder[]> = {};
                                    itemsToPick.forEach(item => {
                                        const cat = (item.categoria || 'SIN CATEGORÍA').trim().toUpperCase();
                                        if (!itemsByCategory[cat]) {
                                            itemsByCategory[cat] = [];
                                        }
                                        itemsByCategory[cat].push(item);
                                    });

                                    const sortedCategories = Object.keys(itemsByCategory).sort((a, b) => a.localeCompare(b));

                                    // 4. Render each category group
                                    return sortedCategories.map((category, catIdx) => {
                                        const categoryItems = itemsByCategory[category];
                                        
                                        // Sort items in this category: non-completado first, then alphabetically by description
                                        const sortedItems = [...categoryItems].sort((a, b) => {
                                            if (a.completado !== b.completado) {
                                                return a.completado ? 1 : -1;
                                            }
                                            return (a.descripcion || '').localeCompare(b.descripcion || '');
                                        });

                                        return (
                                            <div key={`category-block-${selectedPlate}-${category}-${catIdx}`} className="space-y-4">
                                                <div className="flex items-center justify-between px-2">
                                                    <div className="flex items-center gap-2">
                                                        <div className="h-5 w-1.5 bg-blue-600 rounded-full"></div>
                                                        <h4 className="text-sm font-black text-slate-800 dark:text-white uppercase tracking-tight">{category}</h4>
                                                        {category.toUpperCase().includes('ENSAYO') && (
                                                            <button 
                                                                onClick={() => {
                                                                    setPrintEnsayosSubBlock({ title: category, items: sortedItems });
                                                                    setSelectedClientToPrint(null);
                                                                }}
                                                                className="p-1.5 rounded-xl bg-blue-50 dark:bg-slate-800 hover:bg-blue-100 text-blue-600 dark:text-blue-400 transition-colors cursor-pointer flex items-center justify-center border border-blue-100 dark:border-slate-700 ml-1"
                                                                title="Imprimir Rótulos de Ensayos"
                                                            >
                                                                <Printer className="w-3.5 h-3.5" />
                                                            </button>
                                                        )}
                                                    </div>
                                                    <span className="text-[10px] font-black text-slate-400 bg-slate-100 dark:bg-slate-800 px-3 py-1 rounded-full">
                                                        {sortedItems.length} ITEMS
                                                    </span>
                                                </div>

                                                <div className="bg-white dark:bg-slate-900 rounded-[2rem] border border-slate-200 dark:border-slate-800 shadow-sm divide-y divide-slate-100 dark:divide-slate-800">
                                                    {sortedItems.map((order, orderIdx) => (
                                                        <div 
                                                            key={`${order.sku}-${order.documento || orderIdx}-${orderIdx}`}
                                                            onClick={async () => {
                                                                if (!order.completado) {
                                                                    setValidatingOrder(order);
                                                                    setValidationState('IDLE');
                                                                    setUnitScanCount(order.cantidad_picada || 0);
                                                                    setLastScanMsg('');
                                                                }
                                                            }}
                                                            className={`w-full text-left p-4 sm:p-6 flex items-center justify-between gap-4 transition-colors cursor-pointer ${order.completado ? 'bg-emerald-50/30' : 'hover:bg-slate-50'}`}
                                                        >
                                                            <div className="flex-1 min-w-0">
                                                                <div className="flex items-center gap-2 mb-1">
                                                                    <span className="text-[8px] font-black text-blue-600 bg-blue-50 px-2 py-0.5 rounded-lg border border-blue-100">{order.sku}</span>
                                                                    <span className="text-[8px] font-black text-slate-400 uppercase tracking-widest">{order.categoria}</span>
                                                                </div>
                                                                <h5 className="font-bold text-xs sm:text-sm text-slate-800 dark:text-white uppercase leading-tight max-w-[200px] sm:max-w-xs md:max-w-md truncate sm:whitespace-normal">{order.descripcion}</h5>
                                                                <p className="text-[9px] text-slate-400 font-medium truncate">{order.cliente}</p>
                                                            </div>
                                                            <div className="flex items-center gap-4">
                                                                <div className="text-right">
                                                                    <div className={`text-base sm:text-lg font-black ${order.completado ? 'text-emerald-500' : 'text-amber-600 dark:text-amber-400'}`}>
                                                                        {order.completado ? order.cantidad_pedida : `${order.cantidad_picada || 0} / ${order.cantidad_pedida}`}
                                                                    </div>
                                                                    <div className="text-[10px] font-black text-slate-400 uppercase tracking-widest">{order.unidad}</div>
                                                                </div>
                                                                <div className={`w-12 h-12 rounded-2xl flex items-center justify-center border-2 transition-all ${
                                                                    order.completado ? 'bg-emerald-500 border-emerald-500 text-white shadow-lg shadow-emerald-200' : 'bg-slate-50 border-slate-100 text-slate-200'
                                                                }`}>
                                                                    {order.completado ? <CheckCircle className="w-6 h-6" /> : <div className="w-2 h-2 rounded-full bg-slate-200" />}
                                                                </div>
                                                            </div>
                                                        </div>
                                                    ))}
                                                </div>
                                            </div>
                                        );
                                    });
                                })()}
                            </motion.div>
                        )}
                    </AnimatePresence>
                </div>
            </div>

            {/* Modal de Confirmación Masiva */}
            <AnimatePresence>
                {showBulkConfirm && (
                    <div key="modal-bulk-confirm" className="fixed inset-0 z-[400] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
                        <motion.div 
                            initial={{ opacity: 0, scale: 0.9, y: 20 }}
                            animate={{ opacity: 1, scale: 1, y: 0 }}
                            exit={{ opacity: 0, scale: 0.9, y: 20 }}
                            className="bg-white dark:bg-slate-900 rounded-[2.5rem] p-10 max-w-sm w-full border border-slate-200 dark:border-slate-800 shadow-2xl text-center"
                        >
                            <div className="w-20 h-20 bg-blue-100 dark:bg-blue-900/30 rounded-3xl flex items-center justify-center mx-auto mb-6 text-blue-600">
                                <Database className="w-10 h-10" />
                            </div>
                            <h3 className="text-2xl font-black text-slate-900 dark:text-white uppercase tracking-tighter mb-4">Guardar Todo</h3>
                            <p className="text-slate-500 dark:text-slate-400 text-sm font-bold uppercase mb-8">
                                ¿Deseas guardar los {tempGrouping.length} registros de picking detectados en la base de datos?
                            </p>
                            <div className="grid grid-cols-2 gap-4">
                                <button 
                                    onClick={() => setShowBulkConfirm(false)}
                                    className="py-4 rounded-2xl bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 font-bold uppercase text-xs tracking-widest"
                                >
                                    No, Revisar
                                </button>
                                <button 
                                    onClick={async () => {
                                        setShowBulkConfirm(false);
                                        try {
                                            const total = tempGrouping.length;
                                            setBulkProcessing({ active: true, total, current: 0, currentPlate: '' });
                                            
                                            // Copia local para evitar problemas con mutaciones de estado durante el bucle
                                            const groupsToProcess = [...tempGrouping];
                                            for (let i = 0; i < groupsToProcess.length; i++) {
                                                const group = groupsToProcess[i];
                                                setBulkProcessing(prev => ({ ...prev, current: i + 1, currentPlate: group.placa }));
                                                await processCarToDB(group, true);
                                            }
                                            
                                            setBulkProcessing({ active: false, total: 0, current: 0, currentPlate: '' });
                                            await fetchCarroTardeData();
                                            setToast({ show: true, message: 'Procesamiento masivo completado con éxito', type: 'success' });
                                        } catch (err) {
                                            console.error("Error bulk:", err);
                                            setBulkProcessing({ active: false, total: 0, current: 0, currentPlate: '' });
                                            alert("Ocurrió un error al procesar los carros. Algunos podrían no haberse guardado.");
                                        }
                                    }}
                                    className="py-4 rounded-2xl bg-blue-600 text-white font-black uppercase text-xs tracking-widest shadow-xl shadow-blue-600/20"
                                >
                                    Sí, Guardar
                                </button>
                            </div>
                        </motion.div>
                    </div>
                )}
            </AnimatePresence>

            {/* Modals de Validación y Picking */}
            <AnimatePresence>
                {bulkProcessing.active && (
                    <div key="modal-bulk" className="fixed inset-0 z-[300] flex items-center justify-center bg-slate-900/40 backdrop-blur-md p-6">
                        <motion.div 
                            initial={{ scale: 0.9, opacity: 0, y: 20 }}
                            animate={{ scale: 1, opacity: 1, y: 0 }}
                            className="bg-white dark:bg-slate-900 w-full max-w-md rounded-[3rem] p-10 shadow-2xl border border-white/20 relative overflow-hidden"
                        >
                            <div className="absolute top-0 left-0 w-full h-2 bg-slate-50 dark:bg-slate-800">
                                <motion.div 
                                    className="h-full bg-blue-600 shadow-[0_0_15px_rgba(37,99,235,0.5)]"
                                    initial={{ width: 0 }}
                                    animate={{ width: `${(bulkProcessing.current / bulkProcessing.total) * 100}%` }}
                                    transition={{ duration: 0.5 }}
                                />
                            </div>
                            
                            <div className="flex flex-col items-center text-center">
                                <div className="w-20 h-20 bg-blue-50 dark:bg-blue-900/30 rounded-full flex items-center justify-center mb-6 relative">
                                    <RefreshCw className="w-10 h-10 text-blue-600 animate-spin" />
                                    <div className="absolute inset-0 bg-blue-600/5 rounded-full animate-ping" />
                                </div>
                                
                                <h3 className="text-2xl font-black text-slate-800 dark:text-white uppercase tracking-tight mb-2">Procesando Picking</h3>
                                <p className="text-sm font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest mb-8">
                                    Registro {bulkProcessing.current} de {bulkProcessing.total}
                                </p>
                                
                                <div className="w-full space-y-4">
                                    <div className="flex justify-between items-center px-2">
                                        <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Placa Actual</span>
                                        <span className="text-xs font-black text-blue-600 bg-blue-50 dark:bg-blue-900/30 px-3 py-1 rounded-full uppercase">{bulkProcessing.currentPlate}</span>
                                    </div>
                                    <div className="w-full h-8 bg-slate-50 dark:bg-slate-800 rounded-2xl p-1 relative border border-slate-100 dark:border-slate-800 overflow-hidden">
                                        <motion.div 
                                            className="h-full bg-gradient-to-r from-blue-500 to-indigo-600 rounded-xl flex items-center justify-center transition-all duration-500"
                                            style={{ width: `${(bulkProcessing.current / bulkProcessing.total) * 100}%` }}
                                        >
                                            <span className="text-[10px] font-black text-white drop-shadow-sm">
                                                {Math.round((bulkProcessing.current / bulkProcessing.total) * 100)}%
                                            </span>
                                        </motion.div>
                                    </div>
                                </div>
                                
                                <div className="mt-8 pt-8 border-t border-slate-100 dark:border-slate-800 w-full">
                                    <p className="text-[9px] font-bold text-slate-400 uppercase tracking-tighter leading-tight italic">
                                        Por favor no cierre la aplicación mientras se sincroniza con la base de datos...
                                    </p>
                                </div>
                            </div>
                        </motion.div>
                    </div>
                )}
                {showMonitor && (
                    <AfternoonMonitor 
                        key="modal-monitor"
                        onClose={() => setShowMonitor(false)} 
                        tempPlates={tempGrouping}
                    />
                )}
                {validatingOrder && (
                    <div key="modal-validate" className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/85 backdrop-blur-sm p-2 sm:p-4">
                        <motion.div 
                            initial={{ scale: 0.95, opacity: 0 }}
                            animate={{ scale: 1, opacity: 1 }}
                            exit={{ scale: 0.95, opacity: 0 }}
                            className={`w-full max-w-sm sm:max-w-md max-h-[98vh] sm:max-h-[95vh] rounded-[1.5rem] sm:rounded-[2rem] shadow-[0_32px_64px_-12px_rgba(0,0,0,0.8)] border-t-[8px] transition-all duration-300 relative overflow-hidden flex flex-col justify-between ${
                                modalTheme === 'dark' ? 'bg-[#0E1726]/95 text-white' : 'bg-[#FAFCFF] text-slate-900 border-x border-b border-slate-205'
                            } ${
                                validationState === 'SUCCESS' ? 'border-emerald-500' : 
                                validationState === 'ERROR' ? 'border-rose-500' : 
                                'border-blue-600'
                            }`}
                        >
                            {/* Éxito Final (Confetti/Check) */}
                            <AnimatePresence>
                                {lastScanMsg === '¡PEDIDO COMPLETADO!' && (
                                    <motion.div 
                                        key="complete-banner"
                                        initial={{ opacity: 0 }}
                                        animate={{ opacity: 1 }}
                                        exit={{ opacity: 0 }}
                                        className="absolute inset-0 z-50 bg-emerald-600 flex flex-col items-center justify-center p-6 text-center"
                                    >
                                        <motion.div 
                                            initial={{ scale: 0 }}
                                            animate={{ scale: 1, rotate: [0, 10, -10, 0] }}
                                            className="w-20 h-20 bg-white/20 rounded-full flex items-center justify-center mb-4"
                                        >
                                            <CheckCircle className="w-10 h-10 text-white" />
                                        </motion.div>
                                        <h3 className="text-2xl font-black text-white uppercase tracking-tighter leading-none mb-2">¡ICO VALIDADO!</h3>
                                        <p className="text-emerald-100 font-bold uppercase tracking-[0.2em] text-[8px]">Producto procesado y guardado correctamente</p>
                                    </motion.div>
                                )}
                            </AnimatePresence>

                            {/* Header estático, visible sin scroll para no perder de vista el ítem */}
                            <div className={`py-2 px-3 border-b flex-shrink-0 flex items-center justify-between transition-colors ${
                                modalTheme === 'dark' ? 'bg-[#0F1C3F] border-slate-800' : 'bg-blue-600 border-blue-700 text-white'
                            }`}>
                                <div className="flex items-center gap-1.5">
                                    <div className={`px-2 py-0.5 rounded text-[8px] font-black uppercase tracking-widest ${
                                        modalTheme === 'dark' ? 'bg-blue-500/10 border border-blue-500/20 text-blue-400' : 'bg-white/20 text-white'
                                    }`}>
                                        {eanValidated ? 'PICKING' : 'VALIDACIÓN'}
                                    </div>
                                    <div className="flex items-center gap-1 select-none bg-emerald-500/10 border border-emerald-400/20 px-1.5 py-[1px] rounded">
                                        <span className="w-1 h-1 rounded-full bg-emerald-400 animate-pulse"></span>
                                        <span className={`text-[8px] font-black tracking-widest font-mono ${
                                            modalTheme === 'dark' ? 'text-emerald-400' : 'text-white'
                                        }`}>ON-LINE</span>
                                    </div>
                                </div>

                                {/* Botón cambiar tema Claro / Oscuro */}
                                <button
                                    onClick={() => setModalTheme(modalTheme === 'dark' ? 'light' : 'dark')}
                                    className={`p-1.5 rounded-lg border transition-all active:scale-90 ${
                                        modalTheme === 'dark' 
                                            ? 'bg-[#182A5C] border-slate-700 text-amber-400 hover:bg-slate-800' 
                                            : 'bg-white/15 border-white/20 text-amber-300 hover:bg-white/25 shadow-xs'
                                    }`}
                                    title="Alternar Tema"
                                >
                                    {modalTheme === 'dark' ? <Sun className="w-3.5 h-3.5" /> : <Moon className="w-3.5 h-3.5" />}
                                </button>
                            </div>

                            {/* Cuerpo scrollable de información del producto */}
                            <div className="p-2 space-y-2 flex-1 overflow-y-auto max-h-[calc(98vh-190px)] sm:max-h-[520px]">
                                {/* FICHA TÉCNICA CONCATENADA (Código de Producto Grande con RTU Informático adentro) */}
                                <div className={`p-2 rounded-2xl border select-none transition-colors ${
                                    modalTheme === 'dark' 
                                        ? 'bg-slate-950/80 border-slate-800 text-white shadow-inner' 
                                        : 'bg-[#F1F5F9]/75 border-slate-205/60 text-slate-800 shadow-inner'
                                }`}>
                                    <h2 className={`text-xs font-bold uppercase tracking-tight leading-tight line-clamp-2 px-1 max-w-xs mb-1.5 text-left ${
                                        modalTheme === 'dark' ? 'text-slate-200' : 'text-slate-850'
                                    }`}>
                                        {validatingOrder.descripcion}{' '}
                                        <span className="text-blue-600 dark:text-blue-400 font-extrabold uppercase ml-1 whitespace-nowrap">
                                            ({validatingOrder.unidad || 'NIU'})
                                        </span>
                                    </h2>
                                    <div className="flex items-center justify-between border-t border-dashed border-slate-200 dark:border-slate-800 pt-1.5 px-0.5">
                                        <div className="flex flex-col items-start text-left">
                                            <span className="text-[7.5px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest leading-none mb-1">CÓDIGO ICO</span>
                                            <div className={`text-xl font-black font-mono tracking-tight select-all leading-none ${
                                                modalTheme === 'dark' ? 'text-blue-400' : 'text-blue-600'
                                            }`}>
                                                {validatingOrder.codigo || validatingOrder.sku}
                                            </div>
                                        </div>

                                        <div className="flex flex-col items-center">
                                            <span className="text-[7.5px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest leading-none mb-1">PEDIDO TOTAL</span>
                                            <div className={`text-2xl font-black font-mono leading-none ${
                                                modalTheme === 'dark' ? 'text-emerald-300' : 'text-emerald-600'
                                            }`}>
                                                {validatingOrder.cantidad_pedida} <span className="text-[10px] font-black text-slate-550 dark:text-slate-405 ml-0.5">{validatingOrder.unidad || 'NIU'}</span>
                                            </div>
                                        </div>

                                        <div className="flex flex-col items-end text-right">
                                            <span className="text-[7.5px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest leading-none mb-1">UNIDAD / CAJA</span>
                                            <div className={`px-1.5 py-0.5 text-[9px] font-black tracking-wide rounded-md uppercase flex items-center gap-0.5 leading-none ${
                                                modalTheme === 'dark' ? 'bg-amber-500/10 text-amber-400 border border-amber-500/25' : 'bg-amber-100 text-amber-850 border border-amber-200 shadow-xs'
                                            }`}>
                                                <span className="text-[8px] opacity-75 font-bold">RTU:</span>
                                                <span className="font-mono font-black">{validatingOrder.rtu || 1}</span>
                                            </div>
                                        </div>
                                    </div>
                                </div>

                                {/* REGISTRO DE EAN FALTANTES */}
                                {(() => {
                                    const hasEanBulto = !!(currentProduct?.ean_bulto && currentProduct.ean_bulto.trim().length > 0);
                                    const hasEanProducto = !!(currentProduct?.sku && currentProduct.sku.trim().length > 0 && currentProduct.sku !== currentProduct.codigo);

                                    return (
                                        <div className={`p-2 rounded-xl border flex flex-col gap-1.5 transition-colors select-none ${
                                            modalTheme === 'dark' 
                                                ? 'bg-slate-900/60 border-slate-800 text-slate-200' 
                                                : 'bg-white border-slate-200 text-slate-705 shadow-xs'
                                        }`}>
                                            <div className="flex items-center justify-between">
                                                <span className="text-[8.5px] font-black uppercase tracking-wider text-slate-400 dark:text-slate-500">
                                                    Códigos de Autenticación (EAN)
                                                </span>
                                            </div>

                                            <div className="grid grid-cols-2 gap-2">
                                                {/* Botón EAN Bulto/Caja */}
                                                <button
                                                    onClick={() => {
                                                        if (!hasEanBulto) {
                                                            setActiveEanEditType('bulto');
                                                            setTempEanValue('');
                                                        }
                                                    }}
                                                    disabled={hasEanBulto}
                                                    className={`flex items-center justify-center gap-1 py-1.5 px-2 rounded-lg text-[9px] font-black uppercase transition-all ${
                                                        hasEanBulto 
                                                            ? 'bg-slate-100 dark:bg-slate-800/10 text-slate-400 dark:text-slate-600 border border-slate-200/50 dark:border-slate-800/30 cursor-not-allowed'
                                                            : 'bg-sky-500 hover:bg-sky-600 dark:bg-sky-600 dark:hover:bg-sky-500 text-white shadow-xs border border-sky-600 dark:border-sky-700 active:scale-95'
                                                    }`}
                                                    title={hasEanBulto ? `EAN Bulto registrado: ${currentProduct?.ean_bulto}` : "Registrar EAN Bulto"}
                                                >
                                                    <span className="truncate">
                                                        📦 {hasEanBulto ? `Bulto: ${currentProduct?.ean_bulto}` : '+ EAN Bulto'}
                                                    </span>
                                                </button>

                                                {/* Botón EAN Producto */}
                                                <button
                                                    onClick={() => {
                                                        if (!hasEanProducto) {
                                                            setActiveEanEditType('producto');
                                                            setTempEanValue('');
                                                        }
                                                    }}
                                                    disabled={hasEanProducto}
                                                    className={`flex items-center justify-center gap-1 py-1.5 px-2 rounded-lg text-[9px] font-black uppercase transition-all ${
                                                        hasEanProducto 
                                                            ? 'bg-slate-100 dark:bg-slate-800/10 text-slate-400 dark:text-slate-600 border border-slate-200/50 dark:border-slate-800/30 cursor-not-allowed'
                                                            : 'bg-indigo-500 hover:bg-indigo-600 dark:bg-indigo-600 dark:hover:bg-indigo-505 text-white shadow-xs border border-indigo-600 dark:border-indigo-700 active:scale-95'
                                                    }`}
                                                    title={hasEanProducto ? `EAN Producto registrado: ${currentProduct?.sku}` : "Registrar EAN Producto"}
                                                >
                                                    <span className="truncate">
                                                        🏷️ {hasEanProducto ? `Prod: ${currentProduct?.sku}` : '+ EAN Producto'}
                                                    </span>
                                                </button>
                                            </div>

                                            {/* Mini Formulario Inline */}
                                            {activeEanEditType && (
                                                <div className="mt-1 p-2 rounded-lg bg-blue-50/50 dark:bg-slate-950 border border-blue-100 dark:border-slate-800 flex flex-col gap-1.5">
                                                    <div className="flex items-center justify-between">
                                                        <span className="text-[8.5px] font-black uppercase text-blue-600 dark:text-blue-400">
                                                            Registrar EAN para {activeEanEditType === 'bulto' ? 'Caja / Bulto' : 'Unidad Producto'}
                                                        </span>
                                                    </div>
                                                    <div className="flex gap-1.5">
                                                        <input
                                                            type="text"
                                                            placeholder="Escribe o escanea código..."
                                                            className="p-1 px-2 text-xs font-mono font-black border dark:bg-slate-900 border-slate-250 dark:border-slate-800 flex-1 rounded-md outline-none uppercase focus:ring-1 focus:ring-blue-500 text-slate-900 dark:text-white"
                                                            value={tempEanValue}
                                                            onChange={e => setTempEanValue(e.target.value)}
                                                            disabled={isSavingEan}
                                                            autoFocus
                                                        />
                                                        <button
                                                            onClick={handleSaveEan}
                                                            disabled={isSavingEan}
                                                            className="px-2 py-1 text-[9px] font-black bg-emerald-600 hover:bg-emerald-700 text-white rounded-md disabled:opacity-50"
                                                        >
                                                            {isSavingEan ? '...' : 'GRABAR'}
                                                        </button>
                                                        <button
                                                            onClick={() => { setActiveEanEditType(null); setTempEanValue(''); }}
                                                            disabled={isSavingEan}
                                                            className="px-2 py-1 text-[9px] font-black bg-slate-250 hover:bg-slate-300 dark:bg-slate-850 text-slate-800 dark:text-slate-200 rounded-md"
                                                        >
                                                            ❌
                                                        </button>
                                                    </div>
                                                </div>
                                            )}
                                        </div>
                                    );
                                })()}

                                {/* CAJAS Y UNIDADES A PICAR - REEMPLAZO DE LA UBICACIÓN ANTERIOR DEL PEDIDO TOTAL */}
                                <div className="grid grid-cols-2 gap-2">
                                    {/* CAJAS */}
                                    <div className={`p-2 rounded-xl border text-center transition-colors ${
                                        modalTheme === 'dark' 
                                            ? 'bg-[#18234D]/40 border-slate-800' 
                                            : 'bg-white border-blue-105 shadow-sm'
                                    }`}>
                                        <span className={`text-[8.5px] font-black uppercase tracking-widest block mb-0.5 ${
                                            modalTheme === 'dark' ? 'text-amber-400' : 'text-amber-600'
                                        }`}>CAJAS</span>
                                        <div className={`text-2xl font-black font-mono tracking-tight leading-none ${
                                            modalTheme === 'dark' ? 'text-amber-400' : 'text-amber-600'
                                        }`}>
                                            {validatingOrder.rtu && validatingOrder.rtu > 1 ? Math.floor(validatingOrder.cantidad_pedida / validatingOrder.rtu) : 0}
                                        </div>
                                    </div>

                                    {/* UNIDADES */}
                                    <div className={`p-2 rounded-xl border text-center transition-colors ${
                                        modalTheme === 'dark' 
                                            ? 'bg-[#18234D]/40 border-slate-800' 
                                            : 'bg-white border-blue-105 shadow-sm'
                                    }`}>
                                        <span className={`text-[8.5px] font-black uppercase tracking-widest block mb-0.5 ${
                                            modalTheme === 'dark' ? 'text-emerald-400' : 'text-emerald-600'
                                        }`}>UNIDADES</span>
                                        <div className={`text-2xl font-black font-mono tracking-tight leading-none ${
                                            modalTheme === 'dark' ? 'text-emerald-400' : 'text-emerald-600'
                                        }`}>
                                            {validatingOrder.rtu && validatingOrder.rtu > 1 ? (validatingOrder.cantidad_pedida % validatingOrder.rtu) : validatingOrder.cantidad_pedida}
                                        </div>
                                    </div>
                                </div>

                                {/* BARRA DE PROGRESO DE PICKING (Más gruesa y visible) */}
                                <div className={`px-2.5 py-1.5 rounded-xl border transition-colors ${
                                    modalTheme === 'dark' ? 'bg-[#13224B]/40 border-slate-800' : 'bg-white border-slate-200/80 shadow-xs'
                                }`}>
                                    <div className="flex items-center justify-between mb-1 px-1">
                                        <span className={`text-[10px] font-black uppercase tracking-widest ${
                                            modalTheme === 'dark' ? 'text-blue-300' : 'text-blue-600'
                                        }`}>AVANCE EN PICKING</span>
                                        <div className="flex items-baseline gap-1 bg-slate-100 dark:bg-slate-950 px-2.5 py-0.5 rounded-lg border border-slate-200 dark:border-slate-900 shadow-inner">
                                            <span className={`text-xl font-black font-mono tracking-tight ${
                                                modalTheme === 'dark' ? 'text-emerald-400' : 'text-emerald-600'
                                            }`}>
                                                {unitScanCount}
                                            </span>
                                            <span className="text-slate-400 text-[10px] font-bold">/</span>
                                            <span className={`text-sm font-extrabold font-mono text-slate-500`}>
                                                {validatingOrder.cantidad_pedida}
                                            </span>
                                        </div>
                                    </div>
                                    <div className={`w-full h-3 rounded-full overflow-hidden p-[1px] border ${
                                        modalTheme === 'dark' ? 'bg-slate-950 border-slate-900' : 'bg-slate-100 border-slate-250'
                                    }`}>
                                        <div 
                                            className="h-full bg-gradient-to-r from-emerald-500 to-teal-400 rounded-full transition-all duration-300 shadow-[0_0_8px_rgba(16,185,129,0.5)]" 
                                            style={{ width: `${Math.min(100, (unitScanCount / validatingOrder.cantidad_pedida) * 100)}%` }} 
                                        />
                                    </div>
                                    {validatingOrder.rtu && validatingOrder.rtu > 1 && (
                                        <div className={`mt-1.5 text-center text-[10px] font-black uppercase tracking-widest py-0.5 px-2 rounded border ${
                                            modalTheme === 'dark' 
                                                ? 'bg-indigo-500/10 border-indigo-500/20 text-indigo-300' 
                                                : 'bg-indigo-50 border-indigo-200 text-indigo-700'
                                        }`}>
                                            PREPARADO: <span className="font-mono text-xs text-amber-600 dark:text-amber-500">{Math.floor(unitScanCount / validatingOrder.rtu)} CAJAS</span> + <span className="font-mono text-xs text-emerald-600 dark:text-emerald-400">{unitScanCount % validatingOrder.rtu} UNIDADES</span>
                                        </div>
                                    )}
                                </div>

                                {/* SECCIONES AUXILIARES DE CAPTURA (PESO / EXPY) */}
                                <AnimatePresence mode="wait">
                                    {eanValidated && (
                                        <motion.div 
                                            key="step-capture"
                                            initial={{ opacity: 0, y: 5 }}
                                            animate={{ opacity: 1, y: 0 }}
                                            className="space-y-2"
                                        >
                                            {/* PESO BALANZA Y CAPTURA FOTO */}
                                            {(validatingOrder.camara.includes('PESO') || validatingOrder.camara.includes('PESOS') || validatingOrder.unidad?.toUpperCase() === 'KGM') && (
                                                <div className={`p-2.5 rounded-xl border ${
                                                    modalTheme === 'dark' ? 'bg-[#13224B] border-amber-500/20' : 'bg-amber-50/50 border-amber-200'
                                                }`}>
                                                    <div className="flex items-center justify-between mb-1">
                                                        <div className="flex items-center gap-1.55">
                                                            <Gauge className="w-3.5 h-3.5 text-amber-500" />
                                                            <span className={`text-[8px] font-black uppercase tracking-widest ${
                                                                modalTheme === 'dark' ? 'text-amber-400' : 'text-amber-700'
                                                            }`}>PESO BALANZA REAL (KG)</span>
                                                        </div>
                                                        <span className="text-[7.5px] font-extrabold text-amber-600 dark:text-amber-400 uppercase tracking-widest">EVIDENCIA</span>
                                                    </div>
                                                    
                                                    <div className="flex gap-2">
                                                        <div className="flex-1">
                                                            <input 
                                                                type="number"
                                                                step="0.01"
                                                                value={realWeight}
                                                                onChange={(e) => setRealWeight(e.target.value)}
                                                                className={`w-full p-2.5 rounded-xl text-center text-xl font-black outline-none font-mono tracking-tight ${
                                                                    modalTheme === 'dark' 
                                                                        ? 'bg-slate-950 border-amber-500/30 text-white focus:ring-2 focus:ring-amber-500/30' 
                                                                        : 'bg-white border-amber-300 text-slate-900 focus:ring-2 focus:ring-amber-400/30'
                                                                }`}
                                                                placeholder="0.00"
                                                            />
                                                        </div>
                                                        
                                                        <div className="flex-shrink-0">
                                                            {pickedPhotos.length > 0 ? (
                                                                <div className="relative w-[48px] h-[48px] rounded-xl overflow-hidden border-2 border-emerald-500 group">
                                                                    <img 
                                                                        src={pickedPhotos[0]} 
                                                                        alt="Evidencia" 
                                                                        className="w-full h-full object-cover"
                                                                        referrerPolicy="no-referrer"
                                                                    />
                                                                    <button 
                                                                        type="button"
                                                                        onClick={() => setPickedPhotos([])}
                                                                        className="absolute inset-0 bg-red-650/80 hover:bg-red-700 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity text-white font-black text-[7.5px] uppercase tracking-wider"
                                                                    >
                                                                        QUITAR
                                                                    </button>
                                                                </div>
                                                            ) : (
                                                                <button
                                                                    type="button"
                                                                    onClick={() => setShowCameraModal(true)}
                                                                    className={`w-[48px] h-[48px] rounded-xl border border-dashed flex flex-col items-center justify-center transition-all active:scale-90 ${
                                                                        modalTheme === 'dark'
                                                                            ? 'bg-slate-950/60 border-slate-850 text-amber-400 hover:text-amber-300 hover:border-amber-500/40 shadow-inner'
                                                                            : 'bg-white border-amber-300 text-amber-500 hover:text-amber-600 hover:border-amber-400 shadow-sm'
                                                                    }`}
                                                                    title="Tomar Foto"
                                                                >
                                                                    <Camera className="w-5 h-5 text-amber-500" />
                                                                    <span className="text-[7.5px] font-black uppercase mt-0.5 leading-none">FOTO</span>
                                                                </button>
                                                            )}
                                                        </div>
                                                    </div>
                                                </div>
                                            )}
 
                                            {/* FECHA VENCIMIENTO (INFORME / ENSAYOS) */}
                                            {(validatingOrder.camara.includes('INFORME') || isEnsayoProduct(validatingOrder)) && (
                                                <div className={`p-2 rounded-xl border ${
                                                    modalTheme === 'dark' ? 'bg-[#13224B] border-purple-500/20' : 'bg-purple-50/50 border-purple-200'
                                                }`}>
                                                    <p className={`text-[8px] font-black uppercase tracking-widest mb-1 text-center ${
                                                        modalTheme === 'dark' ? 'text-purple-400' : 'text-purple-700'
                                                    }`}>FECHA VENCIMIENTO</p>
                                                    <div className="mb-1.5 flex gap-1">
                                                        <select value={expiryDay} onChange={e => setExpiryDay(e.target.value)} className={`flex-1 p-1 rounded-lg text-xs font-black outline-none border ${
                                                            modalTheme === 'dark' ? 'bg-slate-950 text-white border-slate-800' : 'bg-white text-slate-850 border-slate-205'
                                                        }`}>
                                                            {Array.from({length: 31}, (_, i) => (i + 1).toString().padStart(2, '0')).map(d => <option key={d} value={d}>{d}</option>)}
                                                        </select>
                                                        <div className="relative flex-1">
                                                            <select value={expiryMonth} onChange={e => setExpiryMonth(e.target.value)} className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10 font-black">
                                                                {MONTH_LABELS.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
                                                            </select>
                                                            <div className={`p-1 rounded-lg text-xs font-black text-center border h-full flex items-center justify-center ${
                                                                modalTheme === 'dark' ? 'bg-slate-950 text-white border-slate-800' : 'bg-white text-slate-850 border-slate-205'
                                                            }`}>
                                                                {(MONTH_LABELS.find(m => m.value === expiryMonth)?.label || '').split('-')[1] || ''}
                                                            </div>
                                                        </div>
                                                    </div>
                                                    <div className="flex flex-wrap justify-center gap-1">
                                                        {['2026', '2027', '2028', '2029', '2030'].map(year => (
                                                            <button 
                                                                key={year} 
                                                                onClick={() => setExpiryYear(year)} 
                                                                className={`px-2 py-0.5 text-[8px] font-black rounded transition-colors ${
                                                                    expiryYear === year 
                                                                        ? 'bg-purple-600 text-white shadow shadow-purple-500/30' 
                                                                        : (modalTheme === 'dark' ? 'bg-slate-950 text-slate-400 border border-slate-800' : 'bg-white text-slate-500 border border-slate-200 hover:bg-slate-100')
                                                                }`}
                                                            >
                                                                {year}
                                                            </button>
                                                        ))}
                                                    </div>
                                                </div>
                                            )}                                             {/* CONTEO DIRECTO UNITARIO */}
                                             <div className={`rounded-xl p-2 border flex items-center justify-between ${validatingOrder.unidad?.toUpperCase() === "KGM" ? "hidden" : ""} ${modalTheme === "dark" ? "bg-slate-950/80 border-slate-800" : "bg-[#FAFCFF] border-slate-250"}`}>
                                                 <div className="flex-1 text-left">
                                                     <p className={`text-[8px] font-black uppercase tracking-widest mb-0.5 ${modalTheme === "dark" ? "text-blue-300" : "text-blue-600"}`}>CONTEO MANUAL</p>
                                                     <input 
                                                         type="number"
                                                         value={unitScanCount}
                                                         onChange={e => setUnitScanCount(parseInt(e.target.value) || 0)}
                                                         className={`w-full bg-transparent border-none p-0 text-2.5xl font-black outline-none font-mono focus:ring-0 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none ${modalTheme === "dark" ? "text-white" : "text-slate-900"}`}
                                                         onFocus={e => e.target.select()}
                                                     />
                                                 </div>
                                                 <div className="text-right pl-3 border-l border-slate-300 dark:border-slate-800">
                                                     <p className="text-[8px] font-black text-slate-450 uppercase tracking-widest mb-0.5">MEDIDA</p>
                                                     <p className="text-sm font-black text-indigo-500 font-mono uppercase">{validatingOrder.unidad || "UND"}</p>
                                                 </div>
                                             </div>
 
                                             <button 
                                                 onClick={() => {
                                                     if ((validatingOrder.camara.includes("PESO") || validatingOrder.camara.includes("PESOS") || validatingOrder.unidad?.toUpperCase() === "KGM") && !realWeight) {
                                                         alert("Ingresa el peso de la balanza.");
                                                         return;
                                                     }
                                                     if (validatingOrder.camara.includes("INFORME") || isEnsayoProduct(validatingOrder)) {
                                                         if (!expiryDay || !expiryMonth || !expiryYear) {
                                                             alert("La fecha de vencimiento es obligatoria.");
                                                             return;
                                                         }
                                                     }
                                                     const finalQty = validatingOrder.unidad?.toUpperCase() === "KGM" ? (parseFloat(realWeight) || 0) : unitScanCount;
                                                     completePicking(validatingOrder, finalQty);
                                                 }}
                                                 className={`w-full py-3.5 rounded-xl text-white font-black uppercase text-xs tracking-widest shadow-lg transition-all active:scale-95 flex items-center justify-center gap-2 ${(validatingOrder.camara.includes("PESO") || validatingOrder.camara.includes("PESOS") || validatingOrder.unidad?.toUpperCase() === "KGM") ? "bg-amber-500 shadow-amber-500/15 hover:bg-amber-600" : validatingOrder.camara.includes("INFORME") ? "bg-purple-600 shadow-purple-500/15 hover:bg-purple-700" : "bg-emerald-600 dark:bg-emerald-500 shadow-emerald-500/30 hover:bg-emerald-700 dark:hover:bg-emerald-600"}`}
                                             >
                                                 <CheckCircle className="w-4 h-4 flex-shrink-0" />
                                                 CONFIRMAR Y GUARDAR
                                             </button>
                                        </motion.div>
                                    )}
                                </AnimatePresence>
                            </div>

                            {/* Barra Fija de Escaneo / Ingreso de Códigos (Para que NUNCA se oculte ni se desplace) */}
                            <div className="p-3 border-t border-slate-150 dark:border-slate-850 flex-shrink-0 bg-slate-50 dark:bg-slate-950/20 space-y-2">
                                {(() => {
                                    const boxesRequested = (validatingOrder.rtu && validatingOrder.rtu > 1) 
                                        ? Math.floor(validatingOrder.cantidad_pedida / validatingOrder.rtu) 
                                        : validatingOrder.cantidad_pedida;
                                    
                                    if (boxesRequested > 10 && eanValidated) {
                                        return (
                                            <button
                                                type="button"
                                                onClick={() => {
                                                    setUnitScanCount(validatingOrder.cantidad_pedida);
                                                    setToast({ show: true, message: "Modo manual habilitado por alto volumen (más de 10 cajas).", type: "success" });
                                                }}
                                                className="w-full py-2.5 bg-indigo-50 dark:bg-indigo-950/40 hover:bg-indigo-100 dark:hover:bg-indigo-900/40 border border-indigo-200 dark:border-indigo-800 text-indigo-600 dark:text-indigo-400 font-black uppercase text-[10px] tracking-widest rounded-xl transition-all flex items-center justify-center gap-1.5 shadow-sm active:scale-95 cursor-pointer"
                                            >
                                                ⚡ REGISTRO MANUAL DIRECTO (MÁS DE 10 CAJAS)
                                            </button>
                                        );
                                    }
                                    return null;
                                })()}

                                <div className="flex items-stretch gap-1.5 w-full">
                                    {/* INPUT DE ESCANEO ESTILIZADO (ZONA DE CAPTURA ACTIVA - Neón latiendo) */}
                                    {(() => {
                                        const hudColor = 
                                            validationState === 'SUCCESS' ? 'border-emerald-500' :
                                            validationState === 'ERROR' ? 'border-rose-500' :
                                            !manualMode ? 'border-blue-500' :
                                            (modalTheme === 'dark' ? 'border-indigo-500/25' : 'border-slate-300');
                                        
                                        return (
                                            <div className={`relative flex-1 rounded-xl border-2 p-2 md:p-2.5 transition-all duration-300 flex items-center justify-between overflow-hidden ${
                                                validationState === 'SUCCESS' ? 'border-emerald-500 bg-emerald-950/20 shadow-[0_0_12px_rgba(16,185,129,0.35)]' :
                                                validationState === 'ERROR' ? 'border-rose-500 bg-rose-950/20 shadow-[0_0_12px_rgba(239,68,68,0.35)]' :
                                                !manualMode ? (
                                                    modalTheme === 'dark' 
                                                        ? 'border-blue-500 bg-blue-950/20 shadow-[0_0_15px_rgba(59,130,246,0.65)] animate-pulse' 
                                                        : 'border-blue-500 bg-blue-50/40 shadow-[0_0_12px_rgba(59,130,246,0.45)] animate-pulse'
                                                ) : (
                                                    modalTheme === 'dark' 
                                                        ? 'border-slate-800 bg-slate-900/50' 
                                                        : 'border-slate-300 bg-white shadow-inner'
                                                )
                                            }`}>
                                                {/* Corner Cyberpunk Brackets */}
                                                <div className={`absolute top-0 left-0 w-2.5 h-2.5 border-t-2 border-l-2 ${hudColor} pointer-events-none rounded-tl-[3px]`} />
                                                <div className={`absolute top-0 right-0 w-2.5 h-2.5 border-t-2 border-r-2 ${hudColor} pointer-events-none rounded-tr-[3px]`} />
                                                <div className={`absolute bottom-0 left-0 w-2.5 h-2.5 border-b-2 border-l-2 ${hudColor} pointer-events-none rounded-bl-[3px]`} />
                                                <div className={`absolute bottom-0 right-0 w-2.5 h-2.5 border-b-2 border-r-2 ${hudColor} pointer-events-none rounded-br-[3px]`} />

                                                {/* Background Barcode Watermark */}
                                                {!manualMode && (
                                                    <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 flex items-center justify-center pointer-events-none opacity-[0.06] dark:opacity-[0.15] scale-100 w-3/4">
                                                        <svg className="h-4 w-full text-blue-500 dark:text-blue-400" fill="currentColor" viewBox="0 0 100 20" preserveAspectRatio="none">
                                                            <rect x="0" y="0" width="1.5" height="20" />
                                                            <rect x="3.5" y="0" width="3" height="20" />
                                                            <rect x="9" y="0" width="0.75" height="20" />
                                                            <rect x="11.5" y="0" width="1.5" height="20" />
                                                            <rect x="15" y="0" width="4" height="20" />
                                                            <rect x="21" y="0" width="2.5" height="20" />
                                                            <rect x="25.5" y="0" width="1" height="20" />
                                                            <rect x="28.5" y="0" width="3.5" height="20" />
                                                            <rect x="34" y="0" width="1.5" height="20" />
                                                            <rect x="37.5" y="0" width="2.5" height="20" />
                                                            <rect x="42" y="0" width="4.5" height="20" />
                                                            <rect x="48.5" y="0" width="1.5" height="20" />
                                                            <rect x="52" y="0" width="3" height="20" />
                                                            <rect x="57" y="0" width="1" height="20" />
                                                            <rect x="60" y="0" width="4" height="20" />
                                                            <rect x="66" y="0" width="2" height="20" />
                                                            <rect x="70" y="0" width="1" height="20" />
                                                            <rect x="73" y="0" width="3.5" height="20" />
                                                            <rect x="78.5" y="0" width="2" height="20" />
                                                            <rect x="82.5" y="0" width="1" height="20" />
                                                            <rect x="85.5" y="0" width="4" height="20" />
                                                            <rect x="91.5" y="0" width="2.5" height="20" />
                                                            <rect x="96" y="0" width="1.25" height="20" />
                                                            <rect x="98.5" y="0" width="1.5" height="20" />
                                                        </svg>
                                                    </div>
                                                )}

                                                <div className="flex items-center gap-2 w-full min-w-0 z-10">
                                                    <div className={`p-1.5 rounded-lg flex-shrink-0 transition-colors ${
                                                        validationState === 'SUCCESS' ? 'bg-emerald-900/30 text-emerald-400' :
                                                        validationState === 'ERROR' ? 'bg-rose-900/30 text-rose-450' :
                                                        !manualMode 
                                                            ? (modalTheme === 'dark' ? 'bg-blue-950 text-blue-400' : 'bg-blue-100 text-blue-600') 
                                                            : (modalTheme === 'dark' ? 'bg-slate-800 text-slate-400' : 'bg-slate-100 text-slate-500')
                                                    }`}>
                                                        {manualMode ? <Keyboard className="w-4 h-4" /> : <Scan className="w-4 h-4 animate-pulse" />}
                                                    </div>

                                                    <div className="flex-1 text-left min-w-0">
                                                        <input
                                                            ref={modalInputRef}
                                                            type="text"
                                                            inputMode="text"
                                                            className={`w-full bg-transparent border-none p-0 text-xs sm:text-sm font-black uppercase outline-none font-mono tracking-widest ${
                                                                isScanning ? 'text-blue-500 animate-pulse' : 
                                                                (!manualMode ? (modalTheme === 'dark' ? 'text-blue-350' : 'text-blue-650') : (modalTheme === 'dark' ? 'text-white' : 'text-slate-900'))
                                                            }`}
                                                            autoComplete="off"
                                                            value={scanBuffer}
                                                            onChange={handleInputChange}
                                                            onKeyDown={handleInputKeyDown}
                                                            onPointerDown={() => {
                                                                modalInputRef.current?.focus();
                                                            }}
                                                            placeholder={eanValidated ? 'PRODUCTO OK' : 'LEER CÓDIGO BARRAS...'}
                                                        />
                                                    </div>

                                                    {validationState === 'SUCCESS' && (
                                                        <span className="text-[8px] font-black bg-emerald-500 text-white px-1 py-0.5 rounded flex-shrink-0">OK</span>
                                                    )}
                                                    {validationState === 'ERROR' && (
                                                        <span className="text-[8px] font-black bg-rose-500 text-white px-1 py-0.5 rounded flex-shrink-0">ERR</span>
                                                    )}
                                                </div>
                                            </div>
                                        );
                                    })()}

                                    {/* BOTONES DE SCANER Y TECLADO AL COSTADO */}
                                    <div className="flex items-center gap-1 flex-shrink-0">
                                        <button 
                                            onClick={() => {
                                                setManualMode(false);
                                                setTimeout(() => modalInputRef.current?.focus(), 100);
                                            }}
                                            className={`p-2.5 rounded-xl border flex items-center justify-center transition-all active:scale-90 ${
                                                !manualMode 
                                                    ? 'bg-lime-500 border-lime-500 text-white shadow-md shadow-lime-500/20' 
                                                    : (modalTheme === 'dark' ? 'bg-[#13224B] border-slate-750 text-slate-400 hover:text-slate-300' : 'bg-slate-100 border-slate-300 text-slate-500 hover:bg-slate-205')
                                            }`}
                                            title="Modo Scan Lector Láser"
                                        >
                                            <Scan className="w-4 h-4 flex-shrink-0" />
                                        </button>

                                        <button 
                                            onClick={() => {
                                                setManualMode(true);
                                                setTimeout(() => modalInputRef.current?.focus(), 100);
                                            }}
                                            className={`p-2.5 rounded-xl border flex items-center justify-center transition-all active:scale-90 ${
                                                manualMode 
                                                    ? 'bg-amber-500 border-amber-500 text-white shadow-md shadow-amber-500/20' 
                                                    : (modalTheme === 'dark' ? 'bg-[#13224B] border-slate-750 text-slate-400 hover:text-slate-300' : 'bg-slate-100 border-slate-300 text-slate-500 hover:bg-slate-205')
                                            }`}
                                            title="Modo Teclado Manual"
                                        >
                                            <Keyboard className="w-4 h-4 flex-shrink-0" />
                                        </button>
                                    </div>
                                </div>
                            </div>

                            {/* Footer del Modal */}
                            <div className={`p-2.5 border-t flex-shrink-0 flex items-center justify-between gap-2 transition-colors ${
                                modalTheme === 'dark' ? 'bg-[#0F1C3F] border-slate-800' : 'bg-slate-50 border-slate-200'
                            }`}>
                                <button 
                                    onClick={() => {
                                        setShowCancelModal(true);
                                    }}
                                    className={`flex-1 flex items-center justify-center gap-2 py-3 transition-all rounded-xl font-extrabold uppercase text-[10px] tracking-widest border active:scale-95 ${
                                        modalTheme === 'dark' 
                                            ? 'bg-slate-800 hover:bg-slate-700 text-slate-300 border-slate-700' 
                                            : 'bg-white hover:bg-slate-100 text-slate-600 border-slate-205 shadow-xs'
                                    }`}
                                >
                                    <XCircle className="w-3.5 h-3.5 flex-shrink-0" />
                                    CANCELAR
                                </button>
                            </div>
                        </motion.div>
                    </div>
                )}

                {/* 3. Modal de Fecha para ENSAYO */}
                {showEnsayoDateModal && ensayoPendingOrder && (
                    <div key="modal-ensayo-date" className="fixed inset-0 z-[120] flex items-center justify-center bg-black/75 backdrop-blur-md p-4">
                        <motion.div 
                            initial={{ scale: 0.95, opacity: 0 }}
                            animate={{ scale: 1, opacity: 1 }}
                            exit={{ scale: 0.95, opacity: 0 }}
                            className="bg-white dark:bg-slate-900 text-slate-800 dark:text-white rounded-3xl w-full max-w-md p-6 shadow-2xl relative border border-slate-200 dark:border-slate-800"
                        >
                            <div className="absolute top-4 right-4 text-left">
                                <button 
                                    onClick={() => {
                                        setShowEnsayoDateModal(false);
                                        setEnsayoPendingOrder(null);
                                    }}
                                    className="p-1 rounded-full hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                                >
                                    <XCircle className="w-5 h-5 text-slate-405 hover:text-red-500" />
                                </button>
                            </div>

                            <p className="text-[10px] font-black text-indigo-505 dark:text-indigo-400 uppercase tracking-widest text-center mb-1">
                                PRODUCTO TIPO ENSAYO
                            </p>
                            <h3 className="text-lg font-black text-center text-slate-900 dark:text-white uppercase tracking-tight mb-4 px-4 line-clamp-2 leading-tight">
                                {ensayoPendingOrder.order.descripcion}
                            </h3>

                            <div className="bg-amber-50 dark:bg-amber-500/10 border border-amber-200 dark:border-amber-500/20 p-3.5 rounded-2xl mb-5 text-center">
                                <p className="text-xs font-bold text-amber-800 dark:text-amber-400 flex items-center justify-center gap-1.5">
                                    <span>⚠️</span> La fecha de vencimiento es obligatoria para este producto.
                                </p>
                            </div>

                            {/* Dropdowns de Día y Mes */}
                            <div className="grid grid-cols-2 gap-3 mb-5 text-left">
                                <div>
                                    <label className="block text-[9px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-wider mb-1.5">
                                        DÍA DE VENCIMIENTO
                                    </label>
                                    <select 
                                        value={expiryDay} 
                                        onChange={e => setExpiryDay(e.target.value)} 
                                        className="w-full p-3 rounded-xl text-sm font-black outline-none border bg-slate-50 dark:bg-slate-950 text-slate-800 dark:text-white border-slate-200 dark:border-slate-800 focus:ring-2 focus:ring-indigo-500/30"
                                    >
                                        {Array.from({length: 31}, (_, i) => (i + 1).toString().padStart(2, '0')).map(d => (
                                            <option key={d} value={d}>{d}</option>
                                        ))}
                                    </select>
                                </div>
                                <div>
                                    <label className="block text-[9px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-wider mb-1.5">
                                        MES DE VENCIMIENTO
                                    </label>
                                    <div className="relative w-full">
                                        <select 
                                            value={expiryMonth} 
                                            onChange={e => setExpiryMonth(e.target.value)} 
                                            className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
                                        >
                                            {MONTH_LABELS.map(m => (
                                                <option key={m.value} value={m.value}>{m.label}</option>
                                            ))}
                                        </select>
                                        <div className="w-full p-3 rounded-xl text-sm font-black border bg-slate-50 dark:bg-slate-950 text-slate-800 dark:text-white border-slate-200 dark:border-slate-800 flex items-center justify-between">
                                            <span>{(MONTH_LABELS.find(m => m.value === expiryMonth)?.label || '').split('-')[1] || ''}</span>
                                            <svg className="w-4 h-4 text-slate-400 dark:text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" />
                                            </svg>
                                        </div>
                                    </div>
                                </div>
                            </div>

                            {/* Botones de Año */}
                            <div className="mb-6 text-left">
                                <label className="block text-[9px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-wider text-center mb-2">
                                    SELECCIONAR AÑO (2026 - 2038)
                                </label>
                                <div className="grid grid-cols-4 gap-1.5 max-h-[140px] overflow-y-auto p-1.5 border border-slate-100 dark:border-slate-850 rounded-xl bg-slate-50/50 dark:bg-slate-950/40">
                                    {Array.from({length: 13}, (_, i) => (2026 + i).toString()).map(year => (
                                        <button 
                                            key={year} 
                                            type="button"
                                            onClick={() => setExpiryYear(year)} 
                                            className={`py-2 text-[10px] font-black rounded-lg transition-colors ${
                                                expiryYear === year 
                                                    ? 'bg-indigo-600 text-white shadow shadow-indigo-500/30' 
                                                    : 'bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-400 border border-slate-200 dark:border-slate-800 hover:bg-slate-100 dark:hover:bg-slate-800'
                                            }`}
                                        >
                                            {year}
                                        </button>
                                    ))}
                                </div>
                            </div>

                            {/* Botón Guardar y Terminar */}
                            <button 
                                onClick={() => {
                                    setShowEnsayoDateModal(false);
                                    setConfirmingPick({ order: ensayoPendingOrder.order, qty: ensayoPendingOrder.qty });
                                    setEnsayoPendingOrder(null);
                                }}
                                className="w-full py-3.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-black uppercase text-xs tracking-widest shadow-lg shadow-indigo-650/20 active:scale-95 transition-all flex items-center justify-center gap-2"
                            >
                                <CheckCircle className="w-4 h-4" />
                                CONFIRMAR FECHA Y TERMINAR
                            </button>
                        </motion.div>
                    </div>
                )}

                {/* 4. Modal de Cámara para Captura */}
                {showCameraModal && (
                    <div key="modal-camera" className="fixed inset-0 z-[130] flex items-center justify-center bg-black/90 backdrop-blur-md p-4">
                        <motion.div 
                            initial={{ scale: 0.95, opacity: 0 }}
                            animate={{ scale: 1, opacity: 1 }}
                            exit={{ scale: 0.95, opacity: 0 }}
                            className="bg-slate-900 border border-slate-800 rounded-3xl w-full max-w-md overflow-hidden shadow-2xl flex flex-col relative"
                        >
                            <div className="absolute top-4 right-4 z-20 text-left">
                                <button 
                                    onClick={() => setShowCameraModal(false)}
                                    className="p-1.5 rounded-full bg-black/40 text-white hover:bg-black/60 transition-colors"
                                >
                                    <XCircle className="w-5 h-5" />
                                </button>
                            </div>

                            <div className="p-4 bg-slate-950 border-b border-slate-900 text-center">
                                <h3 className="text-xs font-black tracking-widest uppercase text-amber-500">
                                    REGISTRAR FOTO DE EVIDENCIA
                                </h3>
                            </div>

                            {/* Área de Cámara o Fallback */}
                            <div className="relative aspect-video w-full bg-black flex flex-col items-center justify-center border-b border-slate-900">
                                {cameraLoading && (
                                    <div className="absolute inset-0 bg-slate-950 flex flex-col items-center justify-center gap-2 text-white">
                                        <RefreshCw className="w-6 h-6 animate-spin text-amber-500" />
                                        <span className="text-[10px] font-black tracking-wider uppercase">Iniciando Cámara...</span>
                                    </div>
                                )}
                                
                                {cameraError ? (
                                    <div className="p-6 text-center text-slate-400 space-y-4">
                                        <p className="text-xs">{cameraError}</p>
                                        <label className="inline-block px-4 py-2.5 bg-amber-500 hover:bg-amber-600 text-slate-950 font-black tracking-widest text-[10px] uppercase rounded-xl cursor-pointer shadow-lg shadow-amber-500/10 active:scale-95 transition-all">
                                            Seleccionar archivo o cámara nativa
                                            <input 
                                                type="file" 
                                                accept="image/*" 
                                                capture="environment" 
                                                onChange={handleFileUploadChange} 
                                                className="hidden" 
                                            />
                                        </label>
                                    </div>
                                ) : (
                                    <>
                                        <video 
                                            ref={videoRef} 
                                            playsInline 
                                            muted 
                                            className="w-full h-full object-cover"
                                        />
                                        
                                        {/* Botones de control flotantes sobre el video */}
                                        <div className="absolute bottom-4 inset-x-0 flex justify-center gap-3">
                                            {cameraUploading ? (
                                                <button 
                                                    disabled 
                                                    className="px-5 py-2.5 bg-amber-550/30 text-amber-400 text-[10px] font-black uppercase tracking-widest rounded-xl flex items-center gap-2 border border-amber-500/20"
                                                >
                                                    <RefreshCw className="w-4 h-4 animate-spin" />
                                                    Optimizando y Subiendo...
                                                </button>
                                            ) : (
                                                <button
                                                    onClick={handleCapturePhoto}
                                                    type="button"
                                                    className="px-6 py-3 bg-amber-500 hover:bg-amber-400 text-slate-950 font-black tracking-widest text-[10px] uppercase rounded-xl shadow-xl shadow-amber-500/20 active:scale-95 transition-all flex items-center gap-2"
                                                >
                                                    <Camera className="w-4 h-4" />
                                                    CAPTURAR FOTO
                                                </button>
                                            )}
                                        </div>
                                    </>
                                )}
                            </div>

                            {/* Sección de acciones alternativas */}
                            <div className="p-4 bg-slate-950 flex flex-col items-center gap-3">
                                <span className="text-[8px] font-black tracking-widest uppercase text-slate-500">¿Problemas con la cámara web?</span>
                                <label className="px-4 py-2 bg-slate-900 border border-slate-800 text-slate-400 hover:text-white hover:border-slate-700 font-extrabold tracking-wider text-[9px] uppercase rounded-lg cursor-pointer transition-all active:scale-95">
                                    Subir Foto / Usar Cámara Nativa
                                    <input 
                                        type="file" 
                                        accept="image/*" 
                                        capture="environment" 
                                        onChange={handleFileUploadChange} 
                                        className="hidden" 
                                    />
                                </label>
                            </div>
                        </motion.div>
                    </div>
                )}

                {/* 2. Modal de Confirmación ¿Picking hecho? */}
                {confirmingPick && (
                    <div key="modal-confirm-pick" className="fixed inset-0 z-[110] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
                        <motion.div 
                            initial={{ scale: 0.9, opacity: 0 }}
                            animate={{ scale: 1, opacity: 1 }}
                            exit={{ scale: 0.9, opacity: 0 }}
                            className="bg-white dark:bg-slate-900 rounded-[2rem] shadow-2xl p-6 sm:p-10 max-w-sm w-full text-center border-b-[8px] sm:border-b-[12px] border-emerald-500"
                        >
                            <div className="w-16 h-16 sm:w-24 sm:h-24 bg-emerald-100 dark:bg-emerald-900/30 rounded-full flex items-center justify-center mx-auto mb-5 sm:mb-8 text-emerald-600">
                                <CheckCircle className="w-8 h-8 sm:w-12 sm:h-12" />
                            </div>
                            
                            <h3 className="text-xl sm:text-3xl font-black text-slate-900 dark:text-white uppercase tracking-tighter mb-3 sm:mb-4 leading-tight">
                                ¿Picking hecho?
                            </h3>
                            
                            <div className="bg-slate-50 dark:bg-slate-800 p-4 sm:p-6 rounded-2xl sm:rounded-3xl mb-5 sm:mb-8">
                                <p className="text-[9px] sm:text-xs font-bold text-slate-400 uppercase tracking-widest mb-1 px-4">Confirmar Entrega</p>
                                <p className="text-sm sm:text-xl font-black text-slate-800 dark:text-white uppercase leading-tight truncate">
                                    {confirmingPick.qty} {confirmingPick.order.unidad} DE {confirmingPick.order.descripcion}
                                </p>
                                <div className="grid grid-cols-2 gap-3 sm:gap-4 mt-4 sm:mt-6">
                                    <button 
                                        onClick={() => setConfirmingPick(null)}
                                        className="py-3 sm:py-5 rounded-xl sm:rounded-2xl bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 font-black uppercase text-[10px] sm:text-xs tracking-widest hover:bg-slate-200 transition-colors"
                                    >
                                        NO
                                    </button>
                                    <button 
                                        onClick={handleConfirmFinalPick}
                                        className="py-3 sm:py-5 rounded-xl sm:rounded-2xl bg-emerald-500 text-white font-black uppercase text-[10px] sm:text-xs tracking-widest shadow-xl shadow-emerald-500/30 hover:bg-emerald-600 transition-colors"
                                    >
                                        SÍ
                                    </button>
                                </div>
                            </div>
                        </motion.div>
                    </div>
                )}

                {/* Modal de Confirmación para Cancelar Picking */}
                {showCancelModal && (
                    <div key="modal-cancel-picking" className="fixed inset-0 z-[115] flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
                        <motion.div 
                            initial={{ scale: 0.95, opacity: 0 }}
                            animate={{ scale: 1, opacity: 1 }}
                            exit={{ scale: 0.95, opacity: 0 }}
                            className="bg-white dark:bg-slate-900 rounded-[2rem] shadow-2xl p-6 sm:p-8 max-w-sm w-full text-center border-t-[8px] border-rose-500"
                        >
                            <div className="w-14 h-14 bg-rose-100 dark:bg-rose-950/40 rounded-full flex items-center justify-center mx-auto mb-4 text-rose-500">
                                <XCircle className="w-8 h-8" />
                            </div>
                            
                            <h3 className="text-xl sm:text-2xl font-black text-slate-900 dark:text-white uppercase tracking-tight mb-2 leading-tight">
                                ¿Cancelar Picking?
                            </h3>
                            
                            <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 mb-6 leading-relaxed">
                                ¿Está seguro de que desea cancelar el picking de este producto? Se perderán las unidades escaneadas hasta el momento.
                            </p>
                            
                            <div className="grid grid-cols-2 gap-3">
                                <button 
                                    onClick={() => setShowCancelModal(false)}
                                    className="py-3 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-755 text-slate-600 dark:text-slate-305 font-bold uppercase text-[10px] tracking-widest transition-colors"
                                >
                                    NO, SEGUIR
                                </button>
                                <button 
                                    onClick={() => {
                                        setShowCancelModal(false);
                                        setValidatingOrder(null);
                                        setScanBuffer('');
                                        setEanValidated(false);
                                    }}
                                    className="py-3 rounded-xl bg-rose-600 hover:bg-rose-700 text-white font-bold uppercase text-[10px] tracking-widest shadow-lg shadow-rose-500/20 transition-colors"
                                >
                                    SÍ, CANCELAR
                                </button>
                            </div>
                        </motion.div>
                    </div>
                )}

                {/* 4. Modal de Asignación de Rampa */}
                {assigningRampPlate && (
                    <div key="modal-ramp-assign" className="fixed inset-0 z-[120] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
                        <motion.div 
                            initial={{ scale: 0.9, opacity: 0 }}
                            animate={{ scale: 1, opacity: 1 }}
                            exit={{ scale: 0.9, opacity: 0 }}
                            className="bg-white dark:bg-slate-900 rounded-2xl sm:rounded-[3rem] shadow-2xl p-6 sm:p-10 max-w-sm w-full text-center"
                        >
                            <h3 className="text-lg sm:text-2xl font-black text-slate-900 dark:text-white uppercase mb-5 sm:mb-8">Rampa: {assigningRampPlate}</h3>
                            <div className="grid grid-cols-3 gap-2 sm:gap-3">
                                {Array.from({length: 12}, (_, i) => i + 1).map(r => (
                                    <button
                                        key={`ramp-btn-${r}`}
                                        onClick={() => handleAssignRamp(assigningRampPlate, r)}
                                        className={`py-3 sm:py-4 rounded-xl sm:rounded-2xl font-black text-sm sm:text-base transition-all ${plateRamps[assigningRampPlate] === r ? 'bg-blue-600 text-white' : 'bg-slate-100 dark:bg-slate-800 text-slate-600 hover:bg-slate-200'}`}
                                    >
                                        {r}
                                    </button>
                                ))}
                            </div>
                            <button 
                                onClick={() => setAssigningRampPlate(null)}
                                className="w-full mt-4 sm:mt-6 py-3 sm:py-4 text-slate-400 font-black uppercase text-[9px] sm:text-[10px] tracking-widest"
                            >
                                Cancelar
                            </button>
                        </motion.div>
                    </div>
                )}

                {/* 5. Modal de Validación de Carga */}
                {loadValidationPlate && (
                    <div key="modal-load-validation" className="fixed inset-0 z-[130] flex items-center justify-center bg-black/80 backdrop-blur-md p-4">
                        <motion.div 
                            initial={{ scale: 0.9, opacity: 0 }}
                            animate={{ scale: 1, opacity: 1 }}
                            className={`bg-white dark:bg-slate-900 rounded-[3rem] shadow-2xl p-10 max-w-sm w-full border-4 transition-colors relative overflow-hidden ${
                                loadValidationState === 'SUCCESS' ? 'border-emerald-500' : 
                                loadValidationState === 'ERROR' ? 'border-red-500' : 
                                'border-blue-500'
                            }`}
                        >
                            <div className="text-center mb-10 relative z-10">
                                <span className="text-[10px] font-black text-blue-500 bg-blue-50 px-3 py-1 rounded-full uppercase tracking-widest mb-4 inline-block">Validación de Carga</span>
                                <div className={`mb-6 p-6 rounded-[2rem] border-4 transition-all duration-300 ${
                                    !manualMode ? 'bg-lime-400/10 border-lime-400 shadow-[0_0_20px_rgba(163,230,53,0.3)]' : 'bg-slate-50 dark:bg-slate-800 border-slate-100 dark:border-slate-800'
                                } focus-within:border-blue-500`}>
                                    <div className={`text-[8px] font-black uppercase tracking-[0.3em] mb-2 font-mono ${!manualMode ? 'text-lime-700' : 'text-slate-400'}`}>Input de Escaneo</div>
                                        <input
                                            ref={modalInputRef}
                                            type="text"
                                            inputMode="text"
                                            className={`w-full bg-transparent border-none p-0 text-3xl font-black uppercase tracking-tighter text-center outline-none placeholder:text-slate-300 ${
                                                !manualMode ? 'text-lime-900 cursor-none' : 'text-slate-900 dark:text-white'
                                            }`}
                                            autoComplete="off"
                                            value={scanBuffer}
                                            onChange={handleInputChange}
                                            onKeyDown={handleInputKeyDown}
                                            onPointerDown={() => {
                                                modalInputRef.current?.focus();
                                            }}
                                            placeholder={loadValidationState === 'SCAN_TRUCK' ? 'ESCANEARE PLACA...' : 'ESCANEAR RAMPA...'}
                                        />
                                </div>
                                <h3 className={`text-xl font-black uppercase tracking-widest mb-2 ${
                                    loadValidationState === 'SUCCESS' ? 'text-emerald-500' : 
                                    loadValidationState === 'ERROR' ? 'text-red-500' : 
                                    'text-blue-600 animate-pulse'
                                }`}>
                                    {loadValidationState === 'SCAN_TRUCK' ? 'ESCANEAR CAMIÓN' : 
                                     loadValidationState === 'SCAN_RAMP' ? 'ESCANEAR RAMPA' : lastScanMsg}
                                </h3>
                                <p className="text-slate-500 font-bold uppercase text-xs tracking-widest">PLACAS: {loadValidationPlate}</p>
                            </div>

                            <div className="space-y-4">
                                <div className={`p-6 rounded-3xl flex items-center justify-between ${scannedTruck ? 'bg-emerald-50 border border-emerald-100' : 'bg-slate-50 border border-slate-100'}`}>
                                    <div className="flex items-center gap-4">
                                        <Truck className={`w-8 h-8 ${scannedTruck ? 'text-emerald-500' : 'text-slate-300'}`} />
                                        <span className={`font-black uppercase text-sm ${scannedTruck ? 'text-emerald-600' : 'text-slate-400'}`}>Camión QR</span>
                                    </div>
                                    {scannedTruck && <CheckCircle className="w-6 h-6 text-emerald-500" />}
                                </div>
                                <div className={`p-6 rounded-3xl flex items-center justify-between ${scannedRamp ? 'bg-emerald-50 border border-emerald-100' : 'bg-slate-50 border border-slate-100 animate-pulse'}`}>
                                    <div className="flex items-center gap-4">
                                        <div className={`w-8 h-8 rounded-lg flex items-center justify-center font-black ${scannedRamp ? 'bg-emerald-500 text-white' : 'bg-slate-200 text-slate-400'}`}>R</div>
                                        <span className={`font-black uppercase text-sm ${scannedRamp ? 'text-emerald-600' : 'text-slate-400'}`}>Rampa QR ({plateRamps[loadValidationPlate]})</span>
                                    </div>
                                    {scannedRamp && <CheckCircle className="w-6 h-6 text-emerald-500" />}
                                </div>
                            </div>

                            <button 
                                onClick={() => {
                                    setLoadValidationPlate(null);
                                    setLoadValidationState('IDLE');
                                }}
                                className="w-full mt-10 py-4 text-slate-400 font-black uppercase text-[10px] tracking-widest"
                            >
                                Cancelar Proceso
                            </button>
                        </motion.div>
                    </div>
                )}
            </AnimatePresence>
            {/* Modales de Confirmación */}
            <AnimatePresence>
                {showDeleteModal && (
                    <div key="modal-delete" className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
                        <motion.div 
                            initial={{ opacity: 0, scale: 0.9 }}
                            animate={{ opacity: 1, scale: 1 }}
                            exit={{ opacity: 0, scale: 0.9 }}
                            className="bg-white dark:bg-slate-900 rounded-[2.5rem] p-8 max-w-sm w-full border border-slate-200 dark:border-slate-800 shadow-2xl"
                        >
                            <div className="w-20 h-20 bg-rose-100 dark:bg-rose-900/30 rounded-3xl flex items-center justify-center mx-auto mb-6 text-rose-600">
                                <Trash2 className="w-10 h-10" />
                            </div>
                            <h3 className="text-2xl font-black text-slate-900 dark:text-white text-center uppercase tracking-tighter mb-2">Eliminar Placa/Cámara</h3>
                            <p className="text-slate-500 dark:text-slate-400 text-center text-sm font-medium mb-8">
                                ¿Estás seguro que deseas eliminar la placa <span className="font-black text-slate-900 dark:text-white underline">{plateToDelete}</span>? Esta acción es irreversible y los pedidos volverán a estar disponibles para carga.
                            </p>
                            <div className="grid grid-cols-2 gap-4">
                                <button 
                                    onClick={() => setShowDeleteModal(false)}
                                    className="py-4 rounded-2xl bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 font-bold uppercase text-xs tracking-widest hover:bg-slate-200"
                                >
                                    Cancelar
                                </button>
                                <button 
                                    onClick={handleDeletePlate}
                                    disabled={isProcessing}
                                    className="py-4 rounded-2xl bg-rose-600 text-white font-black uppercase text-xs tracking-widest shadow-lg shadow-rose-600/20 hover:bg-rose-700 disabled:opacity-50"
                                >
                                    {isProcessing ? 'Eliminando...' : 'Eliminar'}
                                </button>
                            </div>
                        </motion.div>
                    </div>
                )}

                {showClearAllModal && (
                    <div key="modal-clear-all" className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
                        <motion.div 
                            initial={{ opacity: 0, scale: 0.9 }}
                            animate={{ opacity: 1, scale: 1 }}
                            exit={{ opacity: 0, scale: 0.9 }}
                            className="bg-white dark:bg-slate-900 rounded-[2.5rem] p-8 max-w-sm w-full border border-slate-200 dark:border-slate-800 shadow-2xl"
                        >
                            <div className="w-20 h-20 bg-rose-100 dark:bg-rose-900/30 rounded-3xl flex items-center justify-center mx-auto mb-6 text-rose-600">
                                <Trash2 className="w-10 h-10" />
                            </div>
                            <h3 className="text-2xl font-black text-slate-900 dark:text-white text-center uppercase tracking-tighter mb-2">Limpiar Todo</h3>
                            <p className="text-slate-500 dark:text-slate-400 text-center text-sm font-medium mb-8">
                                ¿Desea limpiar y cancelar toda la carga actual y pendiente? Esta acción es irreversible.
                            </p>
                            <div className="grid grid-cols-2 gap-4">
                                <button 
                                    onClick={() => setShowClearAllModal(false)}
                                    className="py-4 rounded-2xl bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 font-bold uppercase text-xs tracking-widest hover:bg-slate-200"
                                >
                                    Cancelar
                                </button>
                                <button 
                                    onClick={async () => {
                                        setShowClearAllModal(false);
                                        await handleDeleteAllPending();
                                    }}
                                    disabled={isProcessing}
                                    className="py-4 rounded-2xl bg-rose-600 text-white font-black uppercase text-xs tracking-widest shadow-lg shadow-rose-600/20 hover:bg-rose-700 disabled:opacity-50"
                                >
                                    {isProcessing ? 'Limpiando...' : 'Sí, Limpiar'}
                                </button>
                            </div>
                        </motion.div>
                    </div>
                )}

                {showProcessModal && (
                    <div key="modal-process" className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
                        <motion.div 
                            initial={{ opacity: 0, scale: 0.9 }}
                            animate={{ opacity: 1, scale: 1 }}
                            exit={{ opacity: 0, scale: 0.9 }}
                            className="bg-white dark:bg-slate-900 rounded-[2.5rem] p-8 max-w-sm w-full border border-slate-200 dark:border-slate-800 shadow-2xl"
                        >
                            <div className="w-20 h-20 bg-emerald-100 dark:bg-emerald-900/30 rounded-3xl flex items-center justify-center mx-auto mb-6 text-emerald-600">
                                <CheckCircle className="w-10 h-10" />
                            </div>
                            <h3 className="text-2xl font-black text-slate-900 dark:text-white text-center uppercase tracking-tighter mb-2">Procesar Despacho</h3>
                            <p className="text-slate-500 dark:text-slate-400 text-center text-sm font-medium mb-8">
                                ¿Confirmas que el vehículo <span className="font-black text-slate-900 dark:text-white underline">{plateToProcess}</span> ha terminado su carga y está listo para despacho?
                            </p>
                            <div className="grid grid-cols-2 gap-4">
                                <button 
                                    onClick={() => setShowProcessModal(false)}
                                    className="py-4 rounded-2xl bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 font-bold uppercase text-xs tracking-widest hover:bg-slate-200"
                                >
                                    Cancelar
                                </button>
                                <button 
                                    onClick={handleProcessPlate}
                                    disabled={isProcessing}
                                    className="py-4 rounded-2xl bg-emerald-600 text-white font-black uppercase text-xs tracking-widest shadow-lg shadow-emerald-600/20 hover:bg-emerald-700 disabled:opacity-50"
                                >
                                    {isProcessing ? 'Procesando...' : 'Confirmar'}
                                </button>
                            </div>
                        </motion.div>
                    </div>
                )}

                {toast.show && (
                    <motion.div 
                        key="modal-toast"
                        initial={{ opacity: 0, y: -100, x: "-50%" }}
                        animate={{ opacity: 1, y: 0, x: "-50%" }}
                        exit={{ opacity: 0, y: -100, x: "-50%" }}
                        transition={{ type: 'spring', stiffness: 350, damping: 26 }}
                        className={`fixed top-4 left-1/2 z-[250] flex items-center gap-3 px-6 py-4 rounded-2xl shadow-2xl border ${
                            toast.type === 'success' 
                                ? 'bg-emerald-500 border-emerald-400 text-white shadow-emerald-500/10' 
                                : 'bg-rose-500 border-rose-400 text-white shadow-rose-500/10 shadow-[0_0_25px_rgba(239,68,68,0.25)]'
                        }`}
                    >
                        {toast.type === 'success' ? <CheckCircle className="w-5 h-5 animate-bounce" /> : <XCircle className="w-5 h-5 animate-bounce" />}
                        <span className="font-extrabold uppercase text-xs tracking-wider">{toast.message}</span>
                    </motion.div>
                )}

                {/* MODAL IMPRESIÓN ROTULOS ENSAYO A4 */}
                {printEnsayosSubBlock && (
                    <div key="modal-print-ensayos" className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm no-print">
                        <motion.div 
                            initial={{ opacity: 0, scale: 0.95, y: 10 }}
                            animate={{ opacity: 1, scale: 1, y: 0 }}
                            exit={{ opacity: 0, scale: 0.95, y: 10 }}
                            className="bg-white dark:bg-slate-900 rounded-[2rem] border border-slate-200 dark:border-slate-800 shadow-2xl max-w-4xl w-full max-h-[90vh] flex flex-col overflow-hidden"
                        >
                            {/* Header */}
                            <div className="p-6 border-b border-slate-100 dark:border-slate-800 flex justify-between items-center bg-slate-50 dark:bg-slate-900/50">
                                <div>
                                    <h3 className="text-xl font-black text-slate-900 dark:text-white uppercase tracking-tight flex items-center gap-2">
                                        <Printer className="w-5 h-5 text-blue-600" />
                                        Rótulo de Pallet (A4)
                                    </h3>
                                    <p className="text-xs font-bold text-slate-400 dark:text-slate-500 uppercase mt-0.5 tracking-wider">
                                        Cámara: {selectedCamera} • Placa: {selectedPlate}
                                    </p>
                                </div>
                                <button 
                                    onClick={() => setPrintEnsayosSubBlock(null)}
                                    className="p-2 rounded-full hover:bg-slate-200 dark:hover:bg-slate-800 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 transition-colors cursor-pointer"
                                >
                                    <XCircle className="w-6 h-6" />
                                </button>
                            </div>

                            {/* Contenido */}
                            <div className="flex-1 overflow-y-auto p-6 min-h-[400px]">
                                {!selectedClientToPrint ? (
                                    /* Lista de Clientes */
                                    <div className="space-y-4">
                                        <div className="bg-blue-50 dark:bg-blue-950/30 border border-blue-100 dark:border-blue-900/50 p-4 rounded-2xl flex items-start gap-3">
                                            <span className="text-xl">📋</span>
                                            <div>
                                                <h4 className="text-sm font-black text-blue-900 dark:text-blue-300 uppercase tracking-tight">Selección de Cliente</h4>
                                                <p className="text-xs text-blue-700 dark:text-blue-400 font-medium mt-1">
                                                    Seleccione un cliente para ver y generar su rótulo A4 con el detalle de productos picados en esta cámara. El rótulo se utiliza para identificar el pallet antes del despacho.
                                                </p>
                                            </div>
                                        </div>

                                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
                                            {getClientsInCamera().map((cli, idx) => {
                                                const percent = cli.totalItems > 0 ? Math.round((cli.pickedItems / cli.totalItems) * 100) : 0;
                                                const isFullyPicked = cli.pickedItems === cli.totalItems;
                                                const hasPicked = cli.pickedItems > 0;

                                                return (
                                                    <div 
                                                        key={`print-client-${idx}`}
                                                        className="border border-slate-200 dark:border-slate-800 rounded-2xl p-4 flex flex-col justify-between hover:border-blue-500 dark:hover:border-blue-500 hover:shadow-md transition-all group bg-slate-50/50 dark:bg-slate-900/50"
                                                    >
                                                        <div>
                                                            <h5 className="text-base font-black text-slate-800 dark:text-white uppercase tracking-tight leading-tight group-hover:text-blue-600 transition-colors">
                                                                {cli.name}
                                                            </h5>
                                                            <div className="flex items-center gap-2 mt-2">
                                                                <span className={`text-[10px] font-black px-2.5 py-1 rounded-full uppercase ${
                                                                    isFullyPicked 
                                                                        ? 'bg-emerald-50 dark:bg-emerald-950/30 text-emerald-600 border border-emerald-100 dark:border-emerald-900/50' 
                                                                        : hasPicked 
                                                                            ? 'bg-amber-50 dark:bg-amber-950/30 text-amber-600 border border-amber-100 dark:border-amber-900/50' 
                                                                            : 'bg-slate-100 dark:bg-slate-800 text-slate-500'
                                                                }`}>
                                                                    {cli.pickedItems} / {cli.totalItems} PICADOS
                                                                </span>
                                                                <span className="text-[10px] font-black text-slate-400">{percent}%</span>
                                                            </div>
                                                            {/* Progreso */}
                                                            <div className="w-full bg-slate-200 dark:bg-slate-800 h-1.5 rounded-full mt-3 overflow-hidden">
                                                                <div 
                                                                    className={`h-full rounded-full ${isFullyPicked ? 'bg-emerald-500' : 'bg-blue-500'}`}
                                                                    style={{ width: `${percent}%` }}
                                                                ></div>
                                                            </div>
                                                        </div>

                                                        <button
                                                            onClick={() => handleSelectClientForPrint(cli.name)}
                                                            className="mt-4 w-full py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-black uppercase text-xs tracking-wider transition-all flex items-center justify-center gap-1.5 cursor-pointer shadow-md shadow-blue-600/10"
                                                        >
                                                            <Printer className="w-4 h-4" />
                                                            Ver Rótulo
                                                        </button>
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    </div>
                                ) : (
                                    /* Vista Previa del Rótulo A4 */
                                    <div className="space-y-6">
                                        <div className="flex items-center justify-between">
                                            <button 
                                                onClick={() => setSelectedClientToPrint(null)}
                                                className="px-4 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 text-slate-600 dark:text-slate-300 font-bold uppercase text-xs tracking-wider transition-all cursor-pointer flex items-center gap-1.5"
                                            >
                                                <ArrowLeft className="w-4 h-4" />
                                                Volver a Clientes
                                            </button>
                                            
                                            <button 
                                                onClick={() => window.print()}
                                                disabled={getClientPickedProductsInCamera(selectedClientToPrint).length === 0}
                                                className="px-6 py-3 rounded-xl bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed text-white font-black uppercase text-xs tracking-wider transition-all flex items-center gap-2 cursor-pointer shadow-lg shadow-blue-600/20"
                                            >
                                                <Printer className="w-5 h-5" />
                                                Imprimir Rótulo (A4)
                                            </button>
                                        </div>

                                        {getClientPickedProductsInCamera(selectedClientToPrint).length === 0 ? (
                                            <div className="bg-rose-50 dark:bg-rose-950/30 border border-rose-100 dark:border-rose-900/50 p-6 rounded-2xl text-center py-12">
                                                <span className="text-4xl">⚠️</span>
                                                <h4 className="text-base font-black text-rose-950 dark:text-rose-300 uppercase tracking-tight mt-3">Sin Productos Picados</h4>
                                                <p className="text-sm text-rose-700 dark:text-rose-400 font-medium mt-1 max-w-md mx-auto">
                                                    Este cliente no tiene productos picados en esta cámara para el camión actual. Debe picar al menos una unidad para poder generar el rótulo de pallet.
                                                </p>
                                            </div>
                                        ) : (
                                            /* Tarjeta que simula el papel A4 */
                                            <div className="border border-slate-300 dark:border-slate-700 rounded-2xl shadow-inner bg-slate-100 dark:bg-slate-950 p-4 sm:p-8 flex justify-center overflow-x-auto">
                                                <div className="bg-white text-black p-8 border-4 border-black w-full max-w-[210mm] min-h-[297mm] shadow-2xl flex flex-col justify-between font-sans box-border">
                                                    {/* Cabecera del Rótulo */}
                                                    <div>
                                                        <div className="flex justify-between items-center border-b-4 border-black pb-4 mb-6">
                                                            <div>
                                                                <h1 className="text-2xl sm:text-3xl font-black uppercase tracking-wider text-black">RÓTULO DE PALLET</h1>
                                                                <p className="text-[10px] sm:text-xs font-bold text-gray-700 tracking-widest mt-1">SMART TRACK WMS • LOGÍSTICA DE CARRO TARDE</p>
                                                            </div>
                                                            <div className="text-right">
                                                                <div className="bg-black text-white px-3 py-1.5 rounded font-mono text-sm sm:text-base font-bold">
                                                                    {printCorrelativo}
                                                                </div>
                                                            </div>
                                                        </div>

                                                        {/* Grid de Metadatos */}
                                                        <div className="grid grid-cols-2 gap-4 mb-6">
                                                            <div className="border-2 border-black p-3 rounded-xl">
                                                                <p className="text-[9px] uppercase font-bold text-gray-500 mb-0.5">CÁMARA / SUB-ZONA</p>
                                                                <p className="text-base sm:text-lg font-black text-black uppercase">{selectedCamera}</p>
                                                            </div>
                                                            <div className="border-2 border-black p-3 rounded-xl">
                                                                <p className="text-[9px] uppercase font-bold text-gray-500 mb-0.5">PLACA / VEHÍCULO</p>
                                                                <p className="text-base sm:text-lg font-black text-black uppercase">{selectedPlate}</p>
                                                            </div>
                                                        </div>

                                                        {/* Datos del Cliente Destinatario */}
                                                        <div className="border-4 border-black p-4 sm:p-6 rounded-2xl mb-6 bg-gray-50">
                                                            <p className="text-[10px] uppercase font-bold text-gray-500 mb-0.5">CLIENTE DESTINATARIO</p>
                                                            <h2 className="text-2xl sm:text-3xl font-black text-black leading-tight uppercase text-wrap break-all">
                                                                {selectedClientToPrint}
                                                            </h2>
                                                        </div>

                                                        {/* Detalle de Productos */}
                                                        <div className="border-2 border-black rounded-xl overflow-hidden mb-6">
                                                            <table className="w-full text-left border-collapse text-xs sm:text-sm">
                                                                <thead>
                                                                    <tr className="bg-black text-white uppercase text-[10px] sm:text-xs font-bold">
                                                                        <th className="p-2 border-r border-black w-20">CÓDIGO</th>
                                                                        <th className="p-2 border-r border-black">DESCRIPCIÓN</th>
                                                                        <th className="p-2 border-r border-black text-center w-16">CANT.</th>
                                                                        <th className="p-2 border-r border-black text-center w-14">UND.</th>
                                                                        <th className="p-2 text-center w-28">VENCIMIENTO</th>
                                                                    </tr>
                                                                </thead>
                                                                <tbody>
                                                                    {getClientPickedProductsInCamera(selectedClientToPrint).map((item, idx) => (
                                                                        <tr key={`preview-row-${idx}`} className="border-b border-black">
                                                                            <td className="p-2 font-mono font-bold border-r border-black">{item.sku}</td>
                                                                            <td className="p-2 font-bold uppercase border-r border-black leading-tight">{item.descripcion}</td>
                                                                            <td className="p-2 font-black text-center border-r border-black text-sm sm:text-base">{item.cantidad_picada}</td>
                                                                            <td className="p-2 font-bold text-center uppercase border-r border-black">{item.unidad}</td>
                                                                            <td className="p-2 font-mono text-center font-bold">
                                                                                {item.fecha_vencimiento || 'N/A'}
                                                                            </td>
                                                                        </tr>
                                                                    ))}
                                                                </tbody>
                                                            </table>
                                                        </div>
                                                    </div>

                                                    {/* Pie de Página */}
                                                    <div className="space-y-4">
                                                        <div className="grid grid-cols-2 gap-4 text-[10px] sm:text-xs border-t-2 border-black pt-3">
                                                            <div>
                                                                <p className="text-gray-600 font-bold">OPERARIO PICKING:</p>
                                                                <p className="text-black font-black uppercase text-xs sm:text-sm">{user?.nombre || user?.username || 'OPERADOR'}</p>
                                                            </div>
                                                            <div className="text-right">
                                                                <p className="text-gray-600 font-bold">FECHA Y HORA IMPRESIÓN:</p>
                                                                <p className="text-black font-mono font-bold text-xs sm:text-sm">{printTimestamp}</p>
                                                            </div>
                                                        </div>

                                                        {/* Cuadro de firmas */}
                                                        <div className="grid grid-cols-2 gap-4 pt-4 border-t border-dashed border-gray-300">
                                                            <div className="border-t border-black text-center pt-1">
                                                                <p className="text-[8px] uppercase font-bold text-gray-500">FIRMA OPERARIO</p>
                                                            </div>
                                                            <div className="border-t border-black text-center pt-1">
                                                                <p className="text-[8px] uppercase font-bold text-gray-500">FIRMA JEFE DE TURNO / CONTROL</p>
                                                            </div>
                                                        </div>
                                                    </div>
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                )}
                            </div>
                        </motion.div>
                    </div>
                )}

                {/* --- SECCIÓN DE IMPRESIÓN EXCLUSIVA (A4) --- */}
                {printEnsayosSubBlock && selectedClientToPrint && (
                    <div id="print-section" className="hidden print-only">
                        <style dangerouslySetInnerHTML={{__html: `
                            @media print {
                                body * {
                                    visibility: hidden !important;
                                }
                                #print-section, #print-section * {
                                    visibility: visible !important;
                                }
                                #print-section {
                                    position: absolute !important;
                                    left: 0 !important;
                                    top: 0 !important;
                                    width: 210mm !important;
                                    height: 297mm !important;
                                    background: white !important;
                                    color: black !important;
                                    padding: 15mm !important;
                                    box-sizing: border-box !important;
                                    font-family: 'Inter', sans-serif !important;
                                }
                            }
                        `}} />
                        <div className="w-full h-full flex flex-col justify-between border-4 border-black p-8 font-sans">
                            {/* Cabecera */}
                            <div>
                                <div className="flex justify-between items-center border-b-4 border-black pb-4 mb-6">
                                    <div>
                                        <h1 className="text-4xl font-black uppercase tracking-wider text-black">RÓTULO DE PALLET</h1>
                                        <p className="text-sm font-bold text-gray-700 tracking-widest mt-1">SMART TRACK WMS • LOGÍSTICA DE CARRO TARDE</p>
                                    </div>
                                    <div className="text-right">
                                        <div className="bg-black text-white px-4 py-2 rounded font-mono text-xl font-bold">
                                            {printCorrelativo}
                                        </div>
                                    </div>
                                </div>

                                {/* Grid de Metadatos */}
                                <div className="grid grid-cols-2 gap-4 mb-8">
                                    <div className="border-2 border-black p-4 rounded-xl">
                                        <p className="text-xs uppercase font-bold text-gray-500 mb-1">CÁMARA / SUB-ZONA</p>
                                        <p className="text-2xl font-black text-black uppercase">{selectedCamera}</p>
                                    </div>
                                    <div className="border-2 border-black p-4 rounded-xl">
                                        <p className="text-xs uppercase font-bold text-gray-500 mb-1">PLACA / VEHÍCULO</p>
                                        <p className="text-2xl font-black text-black uppercase">{selectedPlate}</p>
                                    </div>
                                </div>

                                {/* Datos del Cliente Destinatario */}
                                <div className="border-4 border-black p-6 rounded-2xl mb-8 bg-gray-50">
                                    <p className="text-sm uppercase font-bold text-gray-500 mb-1">CLIENTE DESTINATARIO</p>
                                    <h2 className="text-4xl font-black text-black leading-tight uppercase text-wrap break-all">
                                        {selectedClientToPrint}
                                    </h2>
                                </div>

                                {/* Detalle de Productos */}
                                <div className="border-2 border-black rounded-xl overflow-hidden mb-8">
                                    <table className="w-full text-left border-collapse">
                                        <thead>
                                            <tr className="bg-black text-white text-sm uppercase font-bold">
                                                <th className="p-3 border-r border-black w-24">CÓDIGO</th>
                                                <th className="p-3 border-r border-black">DESCRIPCIÓN DEL PRODUCTO</th>
                                                <th className="p-3 border-r border-black text-center w-24">CANT.</th>
                                                <th className="p-3 border-r border-black text-center w-20">UND.</th>
                                                <th className="p-3 text-center w-36">VENCIMIENTO</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {getClientPickedProductsInCamera(selectedClientToPrint).map((item, idx) => (
                                                <tr key={`print-row-${idx}`} className="border-b border-black text-base">
                                                    <td className="p-3 font-mono font-bold border-r border-black">{item.sku}</td>
                                                    <td className="p-3 font-bold uppercase border-r border-black leading-tight">{item.descripcion}</td>
                                                    <td className="p-3 font-black text-center border-r border-black text-xl">{item.cantidad_picada}</td>
                                                    <td className="p-3 font-bold text-center uppercase border-r border-black">{item.unidad}</td>
                                                    <td className="p-3 font-mono text-center font-bold text-sm">
                                                        {item.fecha_vencimiento || 'N/A'}
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            </div>

                            {/* Pie de Página */}
                            <div className="space-y-6">
                                <div className="grid grid-cols-2 gap-4 text-sm border-t-2 border-black pt-4">
                                    <div>
                                        <p className="text-gray-600 font-bold">OPERARIO PICKING:</p>
                                        <p className="text-black font-black uppercase text-base">{user?.nombre || user?.username || 'OPERADOR'}</p>
                                    </div>
                                    <div className="text-right">
                                        <p className="text-gray-600 font-bold">FECHA Y HORA IMPRESIÓN:</p>
                                        <p className="text-black font-mono font-bold text-base">{printTimestamp}</p>
                                    </div>
                                </div>

                                {/* Cuadro de firmas */}
                                <div className="grid grid-cols-2 gap-8 pt-8">
                                    <div className="border-t border-black text-center pt-2">
                                        <p className="text-xs uppercase font-bold text-gray-500">FIRMA OPERARIO</p>
                                    </div>
                                    <div className="border-t border-black text-center pt-2">
                                        <p className="text-xs uppercase font-bold text-gray-500">FIRMA JEFE DE TURNO / CONTROL</p>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                )}
            </AnimatePresence>
        </div>
    );
};

export default AfternoonCar;