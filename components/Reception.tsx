
import React, { useState, useEffect, useRef } from 'react';
import { jsPDF } from 'jspdf';
import { generateLPN, generateMixedLPN, formatDate, formatCompactDate } from '../utils';
import { Pallet, InventoryItem, Product, MixedItem, Usuario, RackLocation } from '../types';
import * as XLSX from 'xlsx';
import { Package, Printer, Clock, User, ArrowDownToLine, CheckCircle, Search, Info, PlusCircle, Trash, Trash2, ArrowRightFromLine, Thermometer, AlertTriangle, ClipboardList, LayoutGrid, History as HistoryIcon, RefreshCw, Download, ChevronLeft, ChevronRight, X, ChevronDown, ChevronUp, FileCheck } from './Icons';
import { supabase } from '../supabaseClient';
import { sendNotification } from '../src/services/notificationService';

interface ReceptionProps {
  onReceive: (item: InventoryItem) => void;
  lastMixedSequence: number;
  pendingItems: InventoryItem[];
  catalog: Product[];
  currentInventory: InventoryItem[];
  onDeleteItems: (lpns: string[]) => void;
  onBulkDispatch: (lpns: string[]) => void;
  currentUser: Usuario | null;
  onRefresh: () => void;
  onAssignLocation: (lpn: string, location: RackLocation, reason?: string) => void;
  initialAccordion?: 'VALIDATE' | null;
  initialData?: any;
  onClearInitialData?: () => void;
}

const Reception: React.FC<ReceptionProps> = ({ 
  onReceive, 
  lastMixedSequence,
  pendingItems,
  catalog,
  currentInventory: _currentInventory,
  onDeleteItems,
  onBulkDispatch,
  currentUser,
  onRefresh,
  onAssignLocation,
  initialAccordion = null,
  initialData = null,
  onClearInitialData
}) => {
  // Mobile Tab State
  const [activeMobileTab, setActiveMobileTab] = useState<'FORM' | 'PENDING' | 'LOCATE' | 'HISTORY'>('FORM');

  // Form State
  const [searchTerm, setSearchTerm] = useState('');
  const [searchMode, setSearchMode] = useState<'SCANNER' | 'MANUAL'>('SCANNER');
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [quantity, setQuantity] = useState(1);
  const [palletQuantity, setPalletQuantity] = useState(0);
  const [boxQuantity, setBoxQuantity] = useState(0);
  const [unitQuantity, setUnitQuantity] = useState(0);
  const [expirationDate, setExpirationDate] = useState('');
  const [expDay, setExpDay] = useState('');
  const [expMonth, setExpMonth] = useState('');
  const [expYear, setExpYear] = useState('');
  const [temperature, setTemperature] = useState('');
  const [proveedor, setProveedor] = useState('');
  const [guiaFactura, setGuiaFactura] = useState('');
  const [tempTransporte, setTempTransporte] = useState('');
  const [condicionHigienica, setCondicionHigienica] = useState('C');
  const [indumentariaLimpia, setIndumentariaLimpia] = useState('C');
  const [higienePersonal, setHigienePersonal] = useState('C');
  const [ubicacionAlmacen, setUbicacionAlmacen] = useState('SECO');
  const [lote, setLote] = useState('');
  const [ph, setPh] = useState('');
  const [aspectoFisico, setAspectoFisico] = useState('C');
  const [color, setColor] = useState('C');
  const [olor, setOlor] = useState('C');
  const [hermeticidad, setHermeticidad] = useState('C');
  const [libreImpurezas, setLibreImpurezas] = useState('C');
  const [estadoEnvase, setEstadoEnvase] = useState('C');
  const [conclusiones, setConclusiones] = useState('ACEPTADO');
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  
  // History State
  const [receptionHistory, setReceptionHistory] = useState<any[]>([]);
  const [isLoadingHistory, setIsLoadingHistory] = useState(false);
  
  // Locating State
  const [locatingLpn, setLocatingLpn] = useState<string | null>(null);
  const [manualLocation, setManualLocation] = useState('');
  const [scanBuffer, setScanBuffer] = useState('');
  const [locateStep, setLocateStep] = useState<'SCAN_LPN' | 'SCAN_LOC'>('SCAN_LPN');

  // TVM Alert State
  const [alertType, setAlertType] = useState<'none' | 'rotation' | 'tvm' | 'both' | 'overstock' | 'tvu_over_100' | 'weekly_over_rotation'>('none');
  const [showAlertModal, setShowAlertModal] = useState(false);
  const [showAlertSentSuccess, setShowAlertSentSuccess] = useState(false);
  const [tvmWarningData, setTvmWarningData] = useState<{
    remainingDays: number;
    percentage: number;
    tvm: number;
  } | null>(null);

  const [authorizedBy, setAuthorizedBy] = useState('');

  // Rotation Alert State
  const [lastHistoricalExpDate, setLastHistoricalExpDate] = useState<string | null>(null);
  const [lastHistoricalRegDate, setLastHistoricalRegDate] = useState<string | null>(null);

  // Missing Schema State (for user banner reminder)
  const [isAlertSchemaMissing, setIsAlertSchemaMissing] = useState(false);
  const [hasCantidad_Alert, setHasCantidad_Alert] = useState(true);
  const [hasEstado_Alert, setHasEstado_Alert] = useState(true);

  useEffect(() => {
    const checkColumns = async () => {
      try {
        const { error: alertColErr } = await supabase.from('recepcion_productos').select('alerta_id').limit(1);
        if (alertColErr && (alertColErr.code === 'PGRST100' || alertColErr.code === 'PGRST204' || alertColErr.message?.includes('alerta_id'))) {
          setIsAlertSchemaMissing(true);
        }

        const { error: cntColErr } = await supabase.from('alertas_recepcion').select('cantidad').limit(1);
        if (cntColErr && (cntColErr.code === 'PGRST100' || cntColErr.code === 'PGRST204' || cntColErr.message?.includes('cantidad'))) {
          setHasCantidad_Alert(false);
          setIsAlertSchemaMissing(true);
        }

        const { error: estColErr } = await supabase.from('alertas_recepcion').select('estado').limit(1);
        if (estColErr && (estColErr.code === 'PGRST100' || estColErr.code === 'PGRST204' || estColErr.message?.includes('estado'))) {
          setHasEstado_Alert(false);
          setIsAlertSchemaMissing(true);
        }
      } catch (e) {
        console.warn("Error checking table cols:", e);
      }
    };
    checkColumns();
  }, []);



  // Mixed Pallet State
  const [isMixedMode, setIsMixedMode] = useState(false);
  const [inspeccionCalidad, setInspeccionCalidad] = useState(false);
  const [mixedItems, setMixedItems] = useState<MixedItem[]>([]);

  // Validation State
  const [isValidationAccordionOpen, setIsValidationAccordionOpen] = useState(false);
  const [validationFile, setValidationFile] = useState<File | null>(null);
  const [isValidatingEntry, setIsValidatingEntry] = useState(false);
  const [showValidationModal, setShowValidationModal] = useState({ show: false, message: '' });

  // Submission Lock State (Double-Click / Multi-Submit Protection)
  const [isSubmitting, setIsSubmitting] = useState(false);
  const isSubmittingRef = React.useRef(false);

  // Memoized TVU info calculation based on expirationDate and selected product
  const tvuInfo = React.useMemo(() => {
    if (!expirationDate || !selectedProduct) return null;
    const totalLife = selectedProduct.tvm_dias || selectedProduct.vida_util_dias || 0;
    if (totalLife <= 0) return null;
    
    try {
      const expDate = new Date(expirationDate + 'T00:00:00');
      if (isNaN(expDate.getTime())) return null;
      
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const diffTime = expDate.getTime() - today.getTime();
      const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
      const percentage = Math.round((diffDays / totalLife) * 100);
      return {
        percentage,
        remainingDays: diffDays,
        totalLife
      };
    } catch (e) {
      return null;
    }
  }, [expirationDate, selectedProduct]);

  const currentTvuThreshold = React.useMemo(() => {
    return selectedProduct?.tvu_promesa !== undefined && selectedProduct?.tvu_promesa !== null && selectedProduct?.tvu_promesa > 0 
      ? selectedProduct.tvu_promesa 
      : 80;
  }, [selectedProduct]);

  // Handle initial accordion
  useEffect(() => {
    if (initialAccordion === 'VALIDATE') {
      setIsValidationAccordionOpen(true);
    }
  }, [initialAccordion]);

  // Handle initial data from XML module
  useEffect(() => {
    if (initialData) {
      if (initialData.product) {
        setSelectedProduct(initialData.product);
        setSearchTerm(initialData.product.nombre);
        setQuantity(initialData.quantity);
        setUnitQuantity(initialData.quantity);
        setExpirationDate(initialData.expirationDate);
        setLote(initialData.lote || '');
        
        if (initialData.expirationDate) {
          const [y, m, d] = initialData.expirationDate.split('-');
          setExpYear(y);
          setExpMonth(m);
          setExpDay(d);
        }
      }
      if (onClearInitialData) onClearInitialData();
    }
  }, [initialData, onClearInitialData]);

  const searchInputRef = useRef<HTMLInputElement>(null);

  // History Pagination & Search State
  const [historyPage, setHistoryPage] = useState(1);
  const [historySearch, setHistorySearch] = useState('');
  const [historyTotalCount, setHistoryTotalCount] = useState(0);
  const itemsPerPage = 20;

  // Pending Items Pagination State
  const [pendingPage, setPendingPage] = useState(1);
  const pendingPageSize = 15;

  // Excel Export State
  const [showExportModal, setShowExportModal] = useState(false);
  const [exportStartDate, setExportStartDate] = useState('');
  const [exportEndDate, setExportEndDate] = useState('');

  // Selection State for Bulk Delete
  const [selectedLpns, setSelectedLpns] = useState<Set<string>>(new Set());

  // Bulk Processing State
  const [isProcessingBulk, setIsProcessingBulk] = useState(false);
  const [bulkProgress, setBulkProgress] = useState(0);

  const sendRotationNotification = () => {
    if (!selectedProduct) return;
    const message = `*ALERTA DE MALA ROTACION* 🚨🚨\n*FACTURA:* ${guiaFactura || 'N/A'}\n*${selectedProduct.nombre.toUpperCase()}*\n*FV INGRESO:* ${formatCompactDate(expirationDate)}\n\n_Anteriormente :_\n*FV INGRESO:* ${formatCompactDate(lastHistoricalExpDate || '')}\n*EL DÍA:* ${formatCompactDate(lastHistoricalRegDate || '')}\n\n🤖🤖`;
    sendNotification(message);
  };

  const sendTvmNotification = () => {
    if (!selectedProduct || !tvmWarningData) return;
    const limitPct = selectedProduct.tvu_promesa !== undefined && selectedProduct.tvu_promesa !== null && selectedProduct.tvu_promesa > 0 ? selectedProduct.tvu_promesa : 80;
    const message = `*ALERTA DE TVU CORTO* ⚠️⚠️\n*FACTURA:* ${guiaFactura || 'N/A'}\n*${selectedProduct.nombre.toUpperCase()}*\n*FV INGRESO:* ${formatCompactDate(expirationDate)}\n*CON TVU:* ${tvmWarningData.percentage}%\n*TVU EN DÍAS:* ${tvmWarningData.remainingDays} Días\n------------------\n*TVM:* ${tvmWarningData.tvm} Días\n*politica TVU:* ${limitPct}%\n\n🤖🤖`;
    sendNotification(message);
  };

  const sendTvuOver100Notification = () => {
    if (!selectedProduct || !tvmWarningData) return;
    const message = `*INCONSISTENCIA DE TVU - REVISARLO CON CALIDAD* 🔵🔵\n*FACTURA:* ${guiaFactura || 'N/A'}\n*${selectedProduct.nombre.toUpperCase()}*\n*FV INGRESO:* ${formatCompactDate(expirationDate)}\n*CON TVU:* ${tvmWarningData.percentage}%\n*TVU EN DÍAS:* ${tvmWarningData.remainingDays} Días\n------------------\n*TVM:* ${tvmWarningData.tvm} Días\n*politica TVU:* 100%\n\n🤖🤖`;
    sendNotification(message);
  };

  const sendWeeklyOverRotationNotification = () => {
    if (!selectedProduct) return;
    const mult = (selectedProduct.multiplo !== undefined && selectedProduct.multiplo !== null && selectedProduct.multiplo > 0) ? selectedProduct.multiplo : 4;
    const pct = mult * 100;
    const message = `*ALERTA POR SOBRE STOCK - REVISAR LA ROTACIÓN Y DIAS DE STOCK* ⚡⚡\n*FACTURA:* ${guiaFactura || 'N/A'}\n*${selectedProduct.nombre.toUpperCase()}*\n*CANTIDAD INGRESADA:* ${quantity} ${selectedProduct.unidad_venta || 'UND'}\n*VENTA SEMANAL:* ${selectedProduct.ventas_semanal || 0}\n*SE HA EXCEDIDO EN MAS DE ${pct}% DE LA VENTA SEMANAL.*\n\n🤖🤖`;
    sendNotification(message);
  };

  const getUnitLabel = (um?: string | null) => {
    switch (um) {
      case 'KGM': return 'KILOS';
      case 'NIU': return 'CANTIDAD';
      case 'PK': return 'PAQUETES';
      case 'BX': return 'CAJAS';
      default: return 'TOTAL UNIDADES';
    }
  };

  // Filter catalog based on search
  const filteredProducts = catalog.filter(p => 
    p.nombre.toLowerCase().includes(searchTerm.toLowerCase()) || 
    p.codigo.toLowerCase().includes(searchTerm.toLowerCase()) ||
    (p.sku && p.sku.toLowerCase().includes(searchTerm.toLowerCase())) ||
    (p.extranjero && p.extranjero.toLowerCase().includes(searchTerm.toLowerCase())) ||
    (p.ean_bulto && p.ean_bulto.toLowerCase().includes(searchTerm.toLowerCase()))
  );

  // Auto-select if exact match found (enhanced for multiple fields)
  useEffect(() => {
    if (searchMode === 'SCANNER' && searchTerm && !selectedProduct) {
        const exactMatch = catalog.find(p => 
            p.codigo.toLowerCase() === searchTerm.toLowerCase() ||
            (p.sku && p.sku.toLowerCase() === searchTerm.toLowerCase()) ||
            (p.extranjero && p.extranjero.toLowerCase() === searchTerm.toLowerCase()) ||
            (p.ean_bulto && p.ean_bulto.toLowerCase() === searchTerm.toLowerCase())
        );
        
        if (exactMatch) {
            handleSelectProduct(exactMatch);
            // Optional: clear search term after select in scanner mode
            setTimeout(() => setSearchTerm(''), 100);
        }
    }
  }, [searchTerm, catalog, selectedProduct, searchMode]);

  // Check existing inventory when product changes
  useEffect(() => {
    const fetchLastHistoricalDate = async () => {
        if (selectedProduct) {
            try {
                const { data } = await supabase
                    .from('recepcion_productos')
                    .select('fecha_vencimiento, fecha_registro')
                    .eq('codigo', selectedProduct.codigo)
                    .eq('estado', 'ACTIVO')
                    .order('fecha_registro', { ascending: false })
                    .limit(1);
                
                if (data && data.length > 0) {
                    setLastHistoricalExpDate(data[0].fecha_vencimiento);
                    setLastHistoricalRegDate(data[0].fecha_registro);
                } else {
                    setLastHistoricalExpDate(null);
                    setLastHistoricalRegDate(null);
                }
            } catch (err) {
                console.error("Error fetching last historical date:", err);
            }
        }
    };

    if (selectedProduct) {
        fetchLastHistoricalDate();
    }
  }, [selectedProduct]);

  // Update total quantity when pallets, boxes or units change
  useEffect(() => {
    if (selectedProduct) {
        const upc = selectedProduct.unidades_por_caja || 1;
        const cpp = selectedProduct.cajas_por_palet || 0;
        
        const totalFromPallets = (palletQuantity * cpp * upc);
        const totalFromBoxes = (boxQuantity * upc);
        
        setQuantity(totalFromPallets + totalFromBoxes + unitQuantity);
    }
  }, [palletQuantity, boxQuantity, unitQuantity, selectedProduct]);

  // Sync expirationDate from day/month/year
  useEffect(() => {
    if (expDay && expMonth && expYear) {
        const formattedDate = `${expYear}-${expMonth.padStart(2, '0')}-${expDay.padStart(2, '0')}`;
        setExpirationDate(formattedDate);
    } else {
        setExpirationDate('');
    }
  }, [expDay, expMonth, expYear]);

  // Sync / default temperature based on product selection
  useEffect(() => {
    if (selectedProduct) {
      if (selectedProduct.es_congelado) {
        setTemperature('-');
      } else {
        setTemperature('');
      }
    } else {
      setTemperature('');
    }
  }, [selectedProduct]);

  const handleSelectProduct = (product: Product) => {
    setSelectedProduct(product);
    setSearchTerm(product.nombre);
    setIsDropdownOpen(false);
    // Reset quantities
    setPalletQuantity(0);
    setBoxQuantity(0);
    setUnitQuantity(0);
    setQuantity(1);
    // Reset date
    setExpDay('');
    setExpMonth('');
    setExpYear('');
  };

  const handleValidateEntry = async () => {
    if (!validationFile) {
      alert("Por favor, suba un archivo Excel primero.");
      return;
    }

    setIsValidatingEntry(true);
    try {
      const reader = new FileReader();
      reader.onload = async (e) => {
        const data = e.target?.result;
        const workbook = XLSX.read(data, { type: 'binary' });
        const sheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[sheetName];
        const excelData = XLSX.utils.sheet_to_json(worksheet) as any[];

        // Get today's receptions
        const today = new Date().toISOString().split('T')[0];
        const { data: receptionData, error } = await supabase
          .from('recepcion_productos')
          .select('codigo, nombre, cantidad')
          .gte('created_at', `${today}T00:00:00Z`)
          .lte('created_at', `${today}T23:59:59Z`);

        if (error) throw error;

        // Group receptions by code
        const logisticTotals: Record<string, { nombre: string, cantidad: number }> = {};
        receptionData.forEach(item => {
          if (!logisticTotals[item.codigo]) {
            logisticTotals[item.codigo] = { nombre: item.nombre, cantidad: 0 };
          }
          logisticTotals[item.codigo].cantidad += item.cantidad;
        });

        // Group Excel data by code
        const sapTotals: Record<string, number> = {};
        const sapNames: Record<string, string> = {};
        excelData.forEach(item => {
          const code = String(item.CODIGO || item.codigo || '').trim();
          const qty = parseFloat(item['CANTIDAD SAP'] || item.cantidad_sap || '0');
          if (code) {
            sapTotals[code] = (sapTotals[code] || 0) + qty;
            if (item.NOMBRE || item.nombre) {
              sapNames[code] = item.NOMBRE || item.nombre;
            }
          }
        });

        // Combine all unique codes
        const allCodes = new Set([...Object.keys(sapTotals), ...Object.keys(logisticTotals)]);
        const reportData: any[] = [];

        allCodes.forEach(code => {
          const sapQty = sapTotals[code] || 0;
          const logisticQty = logisticTotals[code]?.cantidad || 0;
          const productName = logisticTotals[code]?.nombre || sapNames[code] || 'DESCONOCIDO';
          const diff = sapQty - logisticQty;

          let comment = "CONFORME";
          if (diff > 0) comment = "HAY MAS EN EL SAP";
          else if (diff < 0) comment = "HAY MENOS EN EL SAP";

          reportData.push({
            'CODIGO': code,
            'NOMBRE PRODUCTO': productName,
            'SAP CANTIDADES': sapQty,
            'LOGISTIC CANTIDADES': logisticQty,
            'DIFERENCIAS': diff,
            'COMENTARIO': comment
          });
        });

        // Generate Excel Report
        const reportWS = XLSX.utils.json_to_sheet(reportData);
        const reportWB = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(reportWB, reportWS, "Diferencias");
        XLSX.writeFile(reportWB, `Reporte_Diferencias_${today}.xlsx`);
        
        setIsValidatingEntry(false);
        alert("Validación completada. El reporte se ha descargado.");
      };
      reader.readAsBinaryString(validationFile);
    } catch (error) {
      console.error("Error validando ingreso:", error);
      alert("Error al procesar la validación.");
      setIsValidatingEntry(false);
    }
  };

  const handleClearProduct = () => {
      setSelectedProduct(null);
      setSearchTerm('');
      setIsDropdownOpen(false);
      setPalletQuantity(0);
      setBoxQuantity(0);
      setUnitQuantity(0);
      setQuantity(1);
      setExpDay('');
      setExpMonth('');
      setExpYear('');
      if(searchInputRef.current) searchInputRef.current.focus();
  };

  const addToMixedPallet = () => {
      if (!selectedProduct) return;

      // Validation: Expiration Date is REQUIRED by DB
      if (!expirationDate || expirationDate === '') {
          setShowValidationModal({ 
              show: true, 
              message: "¡ERROR! La FECHA DE VENCIMIENTO es obligatoria para agregar el producto al pallet mixto." 
          });
          return;
      }
      
      const newItem: MixedItem = {
          productId: selectedProduct.id,
          productCode: selectedProduct.codigo,
          productName: selectedProduct.nombre,
          quantity: quantity,
          expirationDate: expirationDate || ''
      };

      setMixedItems([...mixedItems, newItem]);
      
      // Reset Form for next item
      setQuantity(1);
      setExpirationDate('');
      setInspeccionCalidad(false);
      handleClearProduct();
  };

  const handleRemoveMixedItem = (index: number) => {
      const newItems = [...mixedItems];
      newItems.splice(index, 1);
      setMixedItems(newItems);
  };

  const finalizeMixedPallet = async () => {
      if (mixedItems.length === 0) return;
      if (isSubmittingRef.current) return;
      isSubmittingRef.current = true;
      setIsSubmitting(true);

      try {
          // Calculate critical date (earliest expiration)
          const validDates = mixedItems
            .filter(i => i.expirationDate && i.expirationDate.trim() !== '')
            .map(i => new Date(i.expirationDate!).getTime());
          
          let criticalExpiration = '';
          if (validDates.length > 0) {
            const minDate = new Date(Math.min(...validDates));
            criticalExpiration = minDate.toISOString().split('T')[0];
          }
          
          const totalQty = mixedItems.reduce((sum, item) => sum + item.quantity, 0);

          const nextMixedSeq = lastMixedSequence + 1;
          const lpn = generateMixedLPN(nextMixedSeq);
          const qrCodeUrl = `https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${lpn}`;
          const now = new Date();

          const newPallet: Pallet = {
            lpn,
            productName: `PALLET MIXTO (${mixedItems.length} Refs)`,
            productCode: 'MIXED-PALLET',
            quantity: totalQty,
            expirationDate: criticalExpiration,
            receptionDate: now.toISOString(),
            receivedBy: currentUser?.nombre || 'Operador 01',
            qrCodeUrl,
            photoUrl: '', // Default empty
            isMixed: true,
            mixedItems: [...mixedItems],
            estado_lpn: 'PENDIENTE'
          };

          onReceive({ ...newPallet, location: null });
          // setShowLabel(true); // User requested not to show LPN preview
          
          // Save to DB (History Log only, paletas_lpn is handled by handleReceive)
          try {
              // Save to recepcion_productos (history log)
              await supabase.from('recepcion_productos').insert(mixedItems.map(item => ({
                  producto_id: item.productId,
                  codigo: item.productCode,
                  nombre: item.productName,
                  cantidad: item.quantity,
                  fecha_vencimiento: item.expirationDate,
                  temperatura: temperature ? parseFloat(temperature) : null,
                  usuario_registro: currentUser?.nombre || 'Desconocido',
                  proveedor,
                  guia_factura: guiaFactura,
                  temperatura_transporte: tempTransporte ? parseFloat(tempTransporte) : null,
                  condicion_higienica: condicionHigienica,
                  indumentaria_limpia: indumentariaLimpia,
                  higiene_personal: higienePersonal,
                  ubicacion: ubicacionAlmacen,
                  lote,
                  ph: ph ? parseFloat(ph) : null,
                  aspecto_fisico: aspectoFisico,
                  color,
                  olor,
                  hermeticidad,
                  libre_impurezas: libreImpurezas,
                  estado_envase: estadoEnvase,
                  conclusiones,
                  inspeccion_calidad: inspeccionCalidad,
                  autorizado_por: authorizedBy || null,
                  pallets: 0,
                  cajas: 0,
                  unidades: item.quantity,
                  unidad_medida: catalog.find(p => p.codigo === item.productCode)?.unidad_medida_sap || 'UN',
                  lpn: lpn // Link to the mixed LPN
              })));
          } catch (err) {
              console.error("Error saving mixed reception history:", err);
          }

          // Reset Mixed Mode
          setMixedItems([]);
          setTemperature('');
          setPalletQuantity(0);
          setBoxQuantity(0);
          setUnitQuantity(0);
          setQuantity(1);
          setInspeccionCalidad(false);
      } finally {
          isSubmittingRef.current = false;
          setIsSubmitting(false);
      }
  };

  const handleSendAlertConfirm = () => {
    if (!selectedProduct) return;
    if (isSubmittingRef.current) return;

    // Show confirmation modal immediately to avoid perceived delay!
    setShowAlertModal(false);
    setShowAlertSentSuccess(true);

    // Run the backend save & notification flows asynchronously in the background
    (async () => {
        // 1. Send notifications
        if (alertType === 'rotation' || alertType === 'both') {
            sendRotationNotification();
        }
        if (alertType === 'tvm' || alertType === 'both') {
            sendTvmNotification();
        }
        if (alertType === 'tvu_over_100') {
            sendTvuOver100Notification();
        }
        if (alertType === 'weekly_over_rotation') {
            sendWeeklyOverRotationNotification();
        }

        // 2. Insert alert into the database
        let newAlertId = null;
        try {
            let alertVal = '';
            if (alertType === 'rotation' || alertType === 'both') {
                alertVal += `Última FV: ${formatDate(lastHistoricalExpDate || '')}`;
            }
            if (alertType === 'tvm' || alertType === 'both' || alertType === 'tvu_over_100') {
                if (alertVal) alertVal += ' | ';
                const totalLife = selectedProduct.tvm_dias || selectedProduct.vida_util_dias || 0;
                let percentage = 0;
                let diffDays = 0;
                if (expirationDate && totalLife > 0) {
                  const expDate = new Date(expirationDate + 'T00:00:00');
                  const today = new Date();
                  today.setHours(0, 0, 0, 0);
                  const diffTime = expDate.getTime() - today.getTime();
                  diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
                  percentage = Math.round((diffDays / totalLife) * 100);
                }
                alertVal += `TVU: ${percentage}% | TVM: ${totalLife}d | Días: ${diffDays}d`;
            }
            if (alertType === 'overstock') {
                alertVal += `Venta Media: ${selectedProduct.venta_media || 0} | Ingresando: ${quantity}`;
            }
            if (alertType === 'weekly_over_rotation') {
                const mult = (selectedProduct.multiplo !== undefined && selectedProduct.multiplo !== null && selectedProduct.multiplo > 0) ? selectedProduct.multiplo : 4;
                alertVal += `Ventas Semanal: ${selectedProduct.ventas_semanal || 0} | Ingresando: ${quantity} (Excede ${mult * 100}%)`;
            }

            const insertPayload: any = {
                 producto_id: selectedProduct.id,
                 codigo: selectedProduct.codigo,
                 nombre: selectedProduct.nombre,
                 tipo_alerta: alertType.toUpperCase(),
                 valor_alerta: alertVal,
                 usuario_registro: currentUser?.nombre || 'Desconocido',
                 autorizado_por: null,
                 proveedor: selectedProduct.marca || 'S/M',
                 guia_factura: guiaFactura,
                 recepcionado: false,
                 fecha_vencimiento_llegada: expirationDate || null,
                 sede_id: currentUser?.sede_id || null
            };

            if (hasCantidad_Alert) {
                insertPayload.cantidad = quantity || 1;
            }
            if (hasEstado_Alert) {
                insertPayload.estado = 'PENDIENTE';
            }

            const { data, error } = await supabase.from('alertas_recepcion').insert(insertPayload).select();
            if (error) throw error;
            if (data && data[0]) {
                newAlertId = data[0].id;
                console.log(`Alert created on ENVIAR confirmation background:`, newAlertId);
            }
        } catch (err) {
            console.error("Error creating pending alert on confirmation in background:", err);
        }

        // 3. Register the LPN reception linked optionally with the new alert ID (or fallback)
        await confirmReception(newAlertId || 'ASINCRONO_TEMPORAL');
    })();
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedProduct) return;
    if (isSubmittingRef.current) return;

    // Validation: Expiration Date is REQUIRED by DB
    if (!expirationDate || expirationDate === '') {
        setShowValidationModal({ 
            show: true, 
            message: "¡ERROR! La FECHA DE VENCIMIENTO es obligatoria para registrar la recepción." 
        });
        return;
    }

    // Validation: Temperature is REQUIRED if product is REFRIGERADO or CONGELADO
    if (selectedProduct.es_refrigerado || selectedProduct.es_congelado) {
        if (!temperature || temperature.trim() === '' || temperature.trim() === '-') {
            const tipoPr = selectedProduct.es_congelado ? 'CONGELADO' : 'REFRIGERADO';
            setShowValidationModal({ 
                show: true, 
                message: `¡ERROR! El campo de TEMPERATURA es obligatorio para productos de tipo ${tipoPr}.` 
            });
            return;
        }
        
        const tempNum = parseFloat(temperature);
        if (isNaN(tempNum)) {
            setShowValidationModal({ 
                show: true, 
                message: "¡ERROR! Por favor, ingrese un valor de temperatura numérico válido." 
            });
            return;
        }

        if (selectedProduct.es_congelado && tempNum >= 0) {
            setShowValidationModal({ 
                show: true, 
                message: "¡ERROR! Los productos CONGELADOS deben registrarse con temperatura bajo cero (menor a 0°C)." 
            });
            return;
        }
    }
    
    let rotationAlert = false;
    if (expirationDate && lastHistoricalExpDate) {
        if (expirationDate < lastHistoricalExpDate) {
            rotationAlert = true;
        }
    }

    let tvmAlert = false;
    let tvuOver100Alert = false;
    const tvmLimit = selectedProduct.tvm_dias || selectedProduct.vida_util_dias || 0;
    if (expirationDate && tvmLimit > 0) {
        const expDate = new Date(expirationDate + 'T00:00:00');
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const diffTime = expDate.getTime() - today.getTime();
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
        const percentage = (diffDays / tvmLimit) * 100;

        const currentTvuThreshold = selectedProduct.tvu_promesa !== undefined && selectedProduct.tvu_promesa !== null && selectedProduct.tvu_promesa > 0 
            ? selectedProduct.tvu_promesa 
            : 80;

        if (percentage < currentTvuThreshold) {
            setTvmWarningData({
                remainingDays: diffDays,
                percentage: Math.round(percentage),
                tvm: tvmLimit
            });
            tvmAlert = true;
        } else if (percentage > 100) {
            setTvmWarningData({
                remainingDays: diffDays,
                percentage: Math.round(percentage),
                tvm: tvmLimit
            });
            tvuOver100Alert = true;
        }
    }

    let overstockAlert = false;
    if (selectedProduct.venta_media !== undefined && selectedProduct.venta_media !== null && selectedProduct.venta_media > 0) {
        if (quantity >= selectedProduct.venta_media * 2) {
            overstockAlert = true;
        }
    }

    let weeklyOverRotationAlert = false;
    if (selectedProduct.ventas_semanal !== undefined && selectedProduct.ventas_semanal !== null && selectedProduct.ventas_semanal > 0) {
        const mult = (selectedProduct.multiplo !== undefined && selectedProduct.multiplo !== null && selectedProduct.multiplo > 0) ? selectedProduct.multiplo : 4;
        if (quantity > selectedProduct.ventas_semanal * mult) {
            weeklyOverRotationAlert = true;
        }
    }

    if (rotationAlert || tvmAlert || tvuOver100Alert || overstockAlert || weeklyOverRotationAlert) {
        let detectedType: 'none' | 'rotation' | 'tvm' | 'both' | 'overstock' | 'tvu_over_100' | 'weekly_over_rotation' = 'none';
        if (rotationAlert && tvmAlert) {
            detectedType = 'both';
        } else if (rotationAlert) {
            detectedType = 'rotation';
        } else if (tvmAlert) {
            detectedType = 'tvm';
        } else if (tvuOver100Alert) {
            detectedType = 'tvu_over_100';
        } else if (weeklyOverRotationAlert) {
            detectedType = 'weekly_over_rotation';
        } else {
            detectedType = 'overstock';
        }
        setAlertType(detectedType);
        
        // Show the alert warning/observation visual modal immediately before saving or submitting in DB
        setShowAlertModal(true);
        return;
    }

    setAlertType('none');
    confirmReception();
  };



  const confirmReception = async (pendingAlertId?: string) => {
    if (!selectedProduct) return;

    // If in Mixed Mode, just add to list
    if (isMixedMode) {
        addToMixedPallet();
        return;
    }

    if (isSubmittingRef.current) return;
    isSubmittingRef.current = true;
    setIsSubmitting(true);

    try {
        // Verify column existence inside the DB to dynamically ignore missing schema columns (prevents fatal crashes)
        let dbHasAlertaId = true;
        let dbHasEstado = true;
        try {
            const { error: alertColErr } = await supabase.from('recepcion_productos').select('alerta_id').limit(1);
            if (alertColErr && (alertColErr.code === 'PGRST100' || alertColErr.message?.includes('alerta_id'))) {
                dbHasAlertaId = false;
            }
            const { error: estadoColErr } = await supabase.from('recepcion_productos').select('estado').limit(1);
            if (estadoColErr && (estadoColErr.code === 'PGRST100' || estadoColErr.message?.includes('estado'))) {
                dbHasEstado = false;
            }
        } catch (e) {
            console.warn("Error verifying columns:", e);
        }

        // Normal Mode - Multi-LPN Logic
        const upc = selectedProduct.unidades_por_caja || 1;
        const cpp = selectedProduct.cajas_por_palet || 0;
        
        const fullPalletQty = cpp * upc;
        const remainderQty = (boxQuantity * upc) + unitQuantity;
        
        const totalLpnsToGenerate = (palletQuantity > 0 ? palletQuantity : 0) + 
                                    (palletQuantity === 0 && quantity > 0 ? 1 : (remainderQty > 0 ? 1 : 0));

        if (totalLpnsToGenerate === 0) {
            isSubmittingRef.current = false;
            setIsSubmitting(false);
            return;
        }

        // Fetch correlatives atomically from Supabase
        const { data: correlatives, error: rpcError } = await supabase.rpc('get_next_lpn_correlatives', { count_val: totalLpnsToGenerate });
        
        if (rpcError || !correlatives || !Array.isArray(correlatives)) {
            console.error("Error fetching correlatives:", rpcError);
            alert("Error al generar correlativos atómicos. El sistema no pudo obtener números válidos.");
            isSubmittingRef.current = false;
            setIsSubmitting(false);
            return;
        }

        let correlativeIdx = 0;
        const now = new Date();
        const newPallets: InventoryItem[] = [];
        const logEntries: any[] = [];

        // Helper to prepare one LPN data
        const prepareLPNData = (qty: number, boxes: number) => {
            // Handle both simple types and objects (Supabase sometimes returns [{num: 1}] depending on RPC definition)
            const row = correlatives[correlativeIdx++];
            const nextCorrelative = typeof row === 'object' && row !== null ? (row as any).num : row;
            
            if (isNaN(Number(nextCorrelative))) {
                throw new Error(`Correlativo inválido detectado: ${nextCorrelative}`);
            }

            const lpn = generateLPN(Number(nextCorrelative));
            const qrCodeUrl = `https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${lpn}`;
            
            const newPallet: Pallet = {
              lpn,
              productId: selectedProduct.id,
              productName: selectedProduct.nombre,
              productCode: selectedProduct.codigo,
              quantity: qty,
              cajas: boxes,
              unitOfMeasure: selectedProduct.unidad_medida_sap || 'UN',
              expirationDate: expirationDate,
              receptionDate: now.toISOString(),
              receivedBy: currentUser?.nombre || 'Operador 01',
              qrCodeUrl,
              photoUrl: '', 
              isMixed: false,
              estado_lpn: 'PENDIENTE'
            };

            newPallets.push({ ...newPallet, location: null });

            const logEntry: any = {
                producto_id: selectedProduct.id,
                codigo: selectedProduct.codigo,
                nombre: selectedProduct.nombre,
                cantidad: qty,
                lpn: lpn, // Link LPN to history
                fecha_vencimiento: expirationDate || null,
                temperatura: temperature ? parseFloat(temperature) : null,
                usuario_registro: currentUser?.nombre || 'Desconocido',
                proveedor,
                guia_factura: guiaFactura,
                temperatura_transporte: tempTransporte ? parseFloat(tempTransporte) : null,
                condicion_higienica: condicionHigienica,
                indumentaria_limpia: indumentariaLimpia,
                higiene_personal: higienePersonal,
                ubicacion: ubicacionAlmacen,
                lote,
                ph: ph ? parseFloat(ph) : null,
                aspecto_fisico: aspectoFisico,
                color,
                olor,
                hermeticidad,
                libre_impurezas: libreImpurezas,
                estado_envase: estadoEnvase,
                conclusiones,
                inspeccion_calidad: inspeccionCalidad,
                autorizado_por: pendingAlertId ? null : (authorizedBy || null),
                pallets: palletQuantity,
                cajas: boxQuantity,
                unidades: unitQuantity,
                unidad_medida: selectedProduct.unidad_medida_sap || 'UN',
                sede_id: currentUser?.sede_id || null
            };

            if (dbHasEstado) {
                logEntry.estado = pendingAlertId ? 'PENDIENTE_AUTORIZACION' : 'ACTIVO';
            }
            if (dbHasAlertaId) {
                logEntry.alerta_id = (pendingAlertId && pendingAlertId !== 'ASINCRONO_TEMPORAL') ? pendingAlertId : null;
            }

            logEntries.push(logEntry);
        };

        // 1. Prepare full pallets
        if (palletQuantity > 0 && cpp > 0) {
            for (let i = 0; i < palletQuantity; i++) {
                prepareLPNData(fullPalletQty, cpp);
            }
        }

        // 2. Prepare remainder LPN
        if (palletQuantity === 0) {
            if (quantity > 0) {
                prepareLPNData(quantity, boxQuantity);
            }
        } else if (remainderQty > 0) {
            const remainderBoxes = Math.floor(remainderQty / upc);
            prepareLPNData(remainderQty, remainderBoxes);
        }

        // Bulk Save to reception log
        try {
            const { error: insertError } = await supabase.from('recepcion_productos').insert(logEntries);
            if (insertError) throw insertError;

            if (pendingAlertId) {
                // Show alert sent success modal
                setShowAlertSentSuccess(true);
            } else {
                // Add to pending list in frontend
                newPallets.forEach(p => onReceive(p));
            }
            
            // Refresh history if tab is active or just to be sure
            fetchReceptionHistory();
        } catch (err) {
            console.error("Error saving reception log:", err);
            alert("Error al guardar el historial de recepción.");
        }

        // Reset form
        setQuantity(1);
        setPalletQuantity(0);
        setBoxQuantity(0);
        setUnitQuantity(0);
        setExpirationDate('');
        setExpDay('');
        setExpMonth('');
        setExpYear('');
        setTemperature('');
        setProveedor('');
        setGuiaFactura('');
        setTempTransporte('');
        setLote('');
        setPh('');
        setSearchTerm('');
        setSelectedProduct(null);
        setInspeccionCalidad(false);

    } finally {
        isSubmittingRef.current = false;
        setIsSubmitting(false);
    }
  };

  const fetchReceptionHistory = async () => {
    setIsLoadingHistory(true);
    try {
        const from = (historyPage - 1) * itemsPerPage;
        const to = from + itemsPerPage - 1;

        let query = supabase
            .from('recepcion_productos')
            .select('*', { count: 'exact' })
            .eq('estado', 'ACTIVO');

        if (historySearch.trim()) {
            const s = `%${historySearch.trim()}%`;
            query = query.or(`lpn.ilike.${s},nombre.ilike.${s},codigo.ilike.${s}`);
        }

        const { data: historyData, error: historyError, count } = await query
            .order('fecha_registro', { ascending: false })
            .range(from, to);
        
        if (historyError) throw historyError;
        if (count !== null) setHistoryTotalCount(count);

        if (historyData && historyData.length > 0) {
            const lpns = historyData.map(r => r.lpn).filter(Boolean);
            const { data: palletData, error: palletError } = await supabase
                .from('paletas_lpn')
                .select('lpn, ubicacion_id, tipo')
                .in('lpn', lpns);
            
            if (!palletError && palletData) {
                const infoMap = palletData.reduce((acc, p) => {
                    acc[p.lpn] = { ubicacion_id: p.ubicacion_id, tipo: p.tipo };
                    return acc;
                }, {} as Record<string, { ubicacion_id: string; tipo: string }>);

                const joinedData = historyData.map(r => ({
                    ...r,
                    paletas_lpn: infoMap[r.lpn] ? { ubicacion_id: infoMap[r.lpn].ubicacion_id, tipo: infoMap[r.lpn].tipo } : null
                }));
                setReceptionHistory(joinedData);
            } else {
                setReceptionHistory(historyData);
            }
        } else {
            setReceptionHistory([]);
        }
    } catch (err) {
        console.error("Error fetching history:", err);
    } finally {
        setIsLoadingHistory(false);
    }
  };

  const handleExportExcel = async () => {
    if (!exportStartDate || !exportEndDate) {
      alert("Por favor, seleccione un rango de fechas.");
      return;
    }

    setIsLoadingHistory(true);
    try {
      const { data: historyData, error: historyError } = await supabase
        .from('recepcion_productos')
        .select('*')
        .eq('estado', 'ACTIVO')
        .gte('fecha_registro', exportStartDate + 'T00:00:00')
        .lte('fecha_registro', exportEndDate + 'T23:59:59')
        .order('fecha_registro', { ascending: false });

      if (historyError) throw historyError;

      if (!historyData || historyData.length === 0) {
        alert("No hay registros en el rango seleccionado.");
        return;
      }

      // Fetch locations for all LPNs in the range
      const lpns = historyData.map(r => r.lpn).filter(Boolean);
      let locationMap: Record<string, string> = {};
      
      if (lpns.length > 0) {
          const { data: palletData, error: palletError } = await supabase
              .from('paletas_lpn')
              .select('lpn, ubicacion_id')
              .in('lpn', lpns);
          
          if (!palletError && palletData) {
              locationMap = palletData.reduce((acc, p) => {
                  acc[p.lpn] = p.ubicacion_id;
                  return acc;
              }, {} as Record<string, string>);
          }
      }

      const reportData = historyData.map(record => ({
        'LPN': record.lpn,
        'Fecha Registro': new Date(record.fecha_registro).toLocaleDateString(),
        'Hora Registro': new Date(record.fecha_registro).toLocaleTimeString(),
        'Producto': record.nombre,
        'Código': record.codigo,
        'Cantidad': record.cantidad,
        'U. Medida': record.unidad_medida,
        'Ubicación': locationMap[record.lpn] || 'N/A',
        'Usuario': record.usuario_registro,
        'Proveedor': record.proveedor || '',
        'Guía/Factura': record.guia_factura || '',
        'Lote': record.lote || '',
        'F. Vencimiento': record.fecha_vencimiento ? new Date(record.fecha_vencimiento).toLocaleDateString() : 'N/A'
      }));

      const worksheet = XLSX.utils.json_to_sheet(reportData);
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, "Historial Recepción");
      
      // Auto-size columns
      const max_width = reportData.reduce((w, r) => Math.max(w, r.Producto.length), 10);
      worksheet["!cols"] = [ { wch: 15 }, { wch: 15 }, { wch: 15 }, { wch: max_width }, { wch: 15 }, { wch: 10 }, { wch: 10 }, { wch: 15 }, { wch: 15 }, { wch: 20 }, { wch: 15 }, { wch: 15 }, { wch: 15 } ];

      XLSX.writeFile(workbook, `Historial_Recepcion_${exportStartDate}_${exportEndDate}.xlsx`);
      setShowExportModal(false);
    } catch (err) {
      console.error("Error exporting Excel:", err);
      alert("Error al exportar a Excel.");
    } finally {
      setIsLoadingHistory(false);
    }
  };

  useEffect(() => {
    if (activeMobileTab === 'HISTORY') {
        const delayDebounceFn = setTimeout(() => {
            fetchReceptionHistory();
        }, 300);
        return () => clearTimeout(delayDebounceFn);
    }
  }, [activeMobileTab, historyPage, historySearch]);

  useEffect(() => {
    setPendingPage(1);
    setSelectedLpns(new Set());
  }, [activeMobileTab]);

  // Selection Logic
  const toggleSelectLpn = (lpn: string) => {
      const newSet = new Set(selectedLpns);
      if (newSet.has(lpn)) newSet.delete(lpn);
      else newSet.add(lpn);
      setSelectedLpns(newSet);
  };

  // Location Assignment Logic
  const handleAssignLocation = async (lpn: string, locationStr: string) => {
    if (!locationStr) return;
    
    // Parse location string (e.g., A-R1-L2-P3)
    const parts = locationStr.split('-');
    if (parts.length < 4) {
      alert("Formato de ubicación inválido. Use: Pasillo-R#_Rack-L#_Nivel-P#_Posición (Ej: A-R1-L2-P3)");
      return;
    }

    const aisle = parts[0];
    const rackId = parseInt(parts[1].replace('R', ''));
    const level = parseInt(parts[2].replace('L', ''));
    const position = parseInt(parts[3].replace('P', ''));

    if (isNaN(rackId) || isNaN(level) || isNaN(position)) {
      alert("Formato de ubicación inválido.");
      return;
    }

    const location: RackLocation = { aisle, rackId, level, position };
    
    try {
      onAssignLocation(lpn, location, "Ubicación inicial desde Recepción");
      setLocatingLpn(null);
      setManualLocation('');
      setLocateStep('SCAN_LPN');
    } catch (err) {
      console.error("Error assigning location:", err);
    }
  };

  // Global Scanner for Locating
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (activeMobileTab !== 'LOCATE') return;
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;

      if (e.key === 'Enter') {
        const code = scanBuffer.trim();
        if (!code) return;

        if (locateStep === 'SCAN_LPN') {
          const item = pendingItems.find(i => i.lpn === code && (i.estado_lpn === 'GENERADO' || i.generado));
          if (item) {
            setLocatingLpn(code);
            setLocateStep('SCAN_LOC');
          } else {
            alert("LPN no encontrado o no generado.");
          }
        } else if (locateStep === 'SCAN_LOC') {
          handleAssignLocation(locatingLpn!, code);
        }
        setScanBuffer('');
      } else if (e.key.length === 1) {
        setScanBuffer(prev => prev + e.key);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [activeMobileTab, scanBuffer, locateStep, locatingLpn, pendingItems]);

  const handleBulkGenerate = async () => {
    if (selectedLpns.size === 0 || !currentUser) return;
    
    setIsProcessingBulk(true);
    setBulkProgress(0);
    
    const total = selectedLpns.size;
    let count = 0;
    
    const selectedItems = pendingItems.filter(item => selectedLpns.has(item.lpn));
    const now = new Date().toISOString();
    
    // Create PDF
    const doc = new jsPDF({
        orientation: 'portrait',
        unit: 'mm',
        format: [100, 150] // Label size
    });

    const appLogo = localStorage.getItem('smartwms_app_logo');

    for (const item of selectedItems) {
        // 1. Update Supabase
        const { error } = await supabase
            .from('paletas_lpn')
            .update({
                generado: true,
                fecha_generado: now,
                usuario_generado: currentUser.username,
                estado_lpn: 'GENERADO'
            })
            .eq('lpn', item.lpn);

        if (error) {
            console.error(`Error updating LPN ${item.lpn}:`, error);
        }

        // 2. Add to PDF
        if (count > 0) doc.addPage();
        
        // --- DRAW LABEL (MATCHING SCREENSHOT) ---
        
        // Border
        doc.setDrawColor(0);
        doc.setLineWidth(0.5);
        doc.rect(5, 5, 90, 140);

        // Header Section
        if (appLogo) {
            try {
                doc.addImage(appLogo, 'PNG', 7, 7, 25, 20);
            } catch (e) {
                // Fallback if logo fails
                doc.setFontSize(22);
                doc.setFont('helvetica', 'bold');
                doc.text('ico', 10, 18);
                doc.setFontSize(8);
                doc.text('FOOD SERVICE', 10, 23);
            }
        } else {
            doc.setFontSize(22);
            doc.setFont('helvetica', 'bold');
            doc.text('ico', 10, 18);
            doc.setFontSize(8);
            doc.text('FOOD SERVICE', 10, 23);
        }
        
        // Vertical line
        doc.line(35, 5, 35, 30);
        
        // Product Code (instead of hardcoded AEA010)
        doc.setFontSize(35);
        doc.setFont('helvetica', 'bold');
        doc.text(item.productCode, 40, 23);
        
        doc.line(5, 30, 95, 30);

        // Expiration Date Section
        doc.setFontSize(10);
        doc.setFont('helvetica', 'bold');
        doc.text('FECHA DE VENCIMIENTO', 10, 40);
        
        // QR Code
        const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${item.lpn}`;
        doc.addImage(qrUrl, 'PNG', 10, 45, 30, 30);

        // Large Expiration Date
        doc.setFontSize(35);
        let expDateFormatted = '--/--/--';
        if (item.expirationDate) {
            if (/^\d{4}-\d{2}-\d{2}$/.test(item.expirationDate)) {
                const [yyyy, mm, dd] = item.expirationDate.split('-');
                expDateFormatted = `${dd}/${mm}/${yyyy.slice(-2)}`;
            } else {
                const date = new Date(item.expirationDate);
                const day = String(date.getUTCDate()).padStart(2, '0');
                const month = String(date.getUTCMonth() + 1).padStart(2, '0');
                const year = String(date.getUTCFullYear()).slice(-2);
                expDateFormatted = `${day}/${month}/${year}`;
            }
        }
        doc.text(expDateFormatted, 45, 65);
        doc.line(45, 68, 90, 68);

        if (item.isMixed && item.mixedItems && item.mixedItems.length > 0) {
            // Description Section - Mixed details
            doc.setFontSize(9);
            doc.setFont('helvetica', 'bold');
            doc.text(`PALLET MIXTO - DETALLE DE PRODUCTOS`, 10, 86);
            doc.line(5, 88, 95, 88);

            doc.setFontSize(7);
            doc.setFont('helvetica', 'bold');
            doc.text("CÓDIGO", 8, 92);
            doc.text("DESCRIPCIÓN DE PRODUCTO", 26, 92);
            doc.text("CANT", 84, 92);
            doc.line(5, 94, 95, 94);

            let currentY = 98;
            item.mixedItems.forEach((mi: any) => {
                if (currentY < 132) {
                    doc.setFont('helvetica', 'bold');
                    doc.text(`${mi.productCode}`, 8, currentY);
                    doc.setFont('helvetica', 'normal');
                    doc.text(`${mi.productName.toUpperCase().slice(0, 32)}`, 26, currentY);
                    doc.setFont('helvetica', 'bold');
                    doc.text(`${mi.quantity}`, 84, currentY);
                    currentY += 4.5;
                }
            });

            if (item.mixedItems.length > 8) {
                doc.setFontSize(6);
                doc.setFont('helvetica', 'italic');
                doc.text(`* Mas ${item.mixedItems.length - 8} items adicionales no mostrados`, 10, 132);
            }

            doc.line(5, 135, 95, 135);
        } else {
            // Description Section
            doc.setFontSize(9);
            doc.setFont('helvetica', 'bold');
            doc.text(`DESCRIPCIÓN: ${item.productName.toUpperCase()}`, 10, 88, { maxWidth: 80 });
            
            doc.line(5, 95, 95, 95);

            // Find product in catalog to check units per box (RTU) and get correct U.M. (unidad_venta)
            const matchedProduct = catalog.find(p => p.codigo === item.productCode);
            const uomVal = matchedProduct?.unidad_venta || item.unitOfMeasure || 'UN';
            const rtu = matchedProduct?.unidades_por_caja || 1;

            // UM and Qty Section
            doc.setFontSize(10);
            doc.text(`UM: ${uomVal}`, 10, 102);
            doc.text(`CANTIDAD: ${item.quantity}`, 40, 102);
            
            doc.line(5, 105, 95, 105);

            let largeQtyStr = `${item.quantity}`;
            let largeUnitStr = `${uomVal}`;

            if (rtu > 1 && item.quantity >= rtu) {
                const bxCount = Math.floor(item.quantity / rtu);
                largeQtyStr = `${bxCount}`;
                largeUnitStr = 'BX';
            }

            // Large Quantity and UM
            doc.setFontSize(70);
            doc.setFont('helvetica', 'bold');
            doc.text(largeQtyStr, 15, 130);
            doc.setFontSize(45);
            doc.text(largeUnitStr, 62, 130);
            
            doc.line(55, 105, 55, 135);
            doc.line(5, 135, 95, 135);
        }

        // Footer: LPN Number
        doc.setFontSize(32);
        doc.setFont('helvetica', 'bold');
        doc.text(item.lpn, 50, 145, { align: 'center' });

        // Metadata Footer (Small)
        doc.setFontSize(6);
        doc.setFont('helvetica', 'normal');
        const timeStr = new Date(now).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
        const dateStr = new Date(now).toLocaleDateString('es-ES');
        const generatorName = item.receivedBy || currentUser.nombre || currentUser.username || 'Operador';
        doc.text(`Generado por: ${generatorName} | ${dateStr} ${timeStr}`, 50, 148, { align: 'center' });

        count++;
        setBulkProgress(Math.round((count / total) * 100));
    }
    
    // Download PDF
    doc.save(`LPN_Labels_${new Date().getTime()}.pdf`);
    
    setTimeout(() => {
        setIsProcessingBulk(false);
        setBulkProgress(0);
        setSelectedLpns(new Set());
        onRefresh(); // Refresh inventory to show updated status
    }, 500);
  };

  const handlePrintLpnFromHistory = async (record: any) => {
    if (!currentUser) return;
    
    let isMixed = record.paletas_lpn?.es_mixto || record.lpn?.startsWith('MIX');
    let dbMixedItems: any[] = [];
    
    if (isMixed) {
        try {
            const { data, error } = await supabase
                .from('paletas_lpn_items')
                .select('*')
                .eq('lpn', record.lpn);
            if (!error && data) {
                dbMixedItems = data.map((item: any) => ({
                    productCode: item.codigo,
                    productName: item.nombre,
                    quantity: item.cantidad
                }));
            }
        } catch (err) {
            console.error("Error fetching mixed items for label print:", err);
        }
    }
    
    const doc = new jsPDF({
        orientation: 'portrait',
        unit: 'mm',
        format: [100, 150]
    });

    const appLogo = localStorage.getItem('smartwms_app_logo');

    // Border
    doc.setDrawColor(0);
    doc.setLineWidth(0.5);
    doc.rect(5, 5, 90, 140);

    // Header Section
    if (appLogo) {
        try {
            doc.addImage(appLogo, 'PNG', 7, 7, 25, 20);
        } catch (e) {
            doc.setFontSize(22);
            doc.setFont('helvetica', 'bold');
            doc.text('ico', 10, 18);
            doc.setFontSize(8);
            doc.text('FOOD SERVICE', 10, 23);
        }
    } else {
        doc.setFontSize(22);
        doc.setFont('helvetica', 'bold');
        doc.text('ico', 10, 18);
        doc.setFontSize(8);
        doc.text('FOOD SERVICE', 10, 23);
    }
    
    // Vertical line
    doc.line(35, 5, 35, 30);
    
    // Product Code
    doc.setFontSize(32);
    doc.setFont('helvetica', 'bold');
    doc.text(isMixed ? 'PALLET MIXTO' : (record.codigo || 'N/A'), 40, 23);
    
    doc.line(5, 30, 95, 30);

    // Expiration Date Section
    doc.setFontSize(10);
    doc.setFont('helvetica', 'bold');
    doc.text('FECHA DE VENCIMIENTO', 10, 40);
    
    // QR Code
    const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${record.lpn || ''}`;
    doc.addImage(qrUrl, 'PNG', 10, 45, 30, 30);

    // Large Expiration Date
    doc.setFontSize(35);
    let expDateFormatted = '--/--/--';
    const rawExpDate = record.fecha_vencimiento;
    if (rawExpDate) {
        if (/^\d{4}-\d{2}-\d{2}$/.test(rawExpDate)) {
            const [yyyy, mm, dd] = rawExpDate.split('-');
            expDateFormatted = `${dd}/${mm}/${yyyy.slice(-2)}`;
        } else {
            const date = new Date(rawExpDate);
            const day = String(date.getUTCDate()).padStart(2, '0');
            const month = String(date.getUTCMonth() + 1).padStart(2, '0');
            const year = String(date.getUTCFullYear()).slice(-2);
            expDateFormatted = `${day}/${month}/${year}`;
        }
    }
    doc.text(expDateFormatted, 45, 65);
    doc.line(45, 68, 90, 68);

    if (isMixed && dbMixedItems.length > 0) {
        // Description Section - Mixed details
        doc.setFontSize(9);
        doc.setFont('helvetica', 'bold');
        doc.text(`PALLET MIXTO - DETALLE DE PRODUCTOS`, 10, 86);
        doc.line(5, 88, 95, 88);

        doc.setFontSize(7);
        doc.setFont('helvetica', 'bold');
        doc.text("CÓDIGO", 8, 92);
        doc.text("DESCRIPCIÓN DE PRODUCTO", 26, 92);
        doc.text("CANT", 84, 92);
        doc.line(5, 94, 95, 94);

        let currentY = 98;
        dbMixedItems.forEach((mi: any) => {
            if (currentY < 132) {
                doc.setFont('helvetica', 'bold');
                doc.text(`${mi.productCode}`, 8, currentY);
                doc.setFont('helvetica', 'normal');
                doc.text(`${mi.productName.toUpperCase().slice(0, 32)}`, 26, currentY);
                doc.setFont('helvetica', 'bold');
                doc.text(`${mi.quantity}`, 84, currentY);
                currentY += 4.5;
            }
        });

        if (dbMixedItems.length > 8) {
            doc.setFontSize(6);
            doc.setFont('helvetica', 'italic');
            doc.text(`* Mas ${dbMixedItems.length - 8} items adicionales no mostrados`, 10, 132);
        }

        doc.line(5, 135, 95, 135);
    } else {
        // Standard non-mixed label body
        doc.line(5, 80, 95, 80);

        // Description Section
        doc.setFontSize(9);
        doc.setFont('helvetica', 'bold');
        doc.text(`DESCRIPCIÓN: ${(record.nombre || '').toUpperCase()}`, 10, 88, { maxWidth: 80 });
        
        doc.line(5, 95, 95, 95);

        // Find product in catalog to check units per box (RTU) and get correct U.M. (unidad_venta)
        const matchedProduct = catalog.find(p => p.codigo === record.codigo);
        const umVal = matchedProduct?.unidad_venta || record.unidad_medida || 'UN';
        const rtu = matchedProduct?.unidades_por_caja || 1;

        // UM and Qty Section
        doc.setFontSize(10);
        doc.text(`UM: ${umVal}`, 10, 102);
        doc.text(`CANTIDAD: ${record.cantidad}`, 40, 102);
        
        doc.line(5, 105, 95, 105);

        let largeQtyStr = `${record.cantidad}`;
        let largeUnitStr = `${umVal}`;

        if (rtu > 1 && record.cantidad >= rtu) {
            const bxCount = Math.floor(record.cantidad / rtu);
            largeQtyStr = `${bxCount}`;
            largeUnitStr = 'BX';
        }

        // Large Quantity and UM
        doc.setFontSize(70);
        doc.setFont('helvetica', 'bold');
        doc.text(largeQtyStr, 15, 130);
        doc.setFontSize(45);
        doc.text(largeUnitStr, 62, 130);
        
        doc.line(55, 105, 55, 135);
        doc.line(5, 135, 95, 135);
    }

    // Footer: LPN Number
    doc.setFontSize(32);
    doc.setFont('helvetica', 'bold');
    doc.text(record.lpn || 'N/A', 50, 145, { align: 'center' });

    // Metadata Footer (Small)
    doc.setFontSize(6);
    doc.setFont('helvetica', 'normal');
    const timeStr = new Date(record.fecha_registro).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    const dateStr = new Date(record.fecha_registro).toLocaleDateString('es-ES');
    const generatorName = record.recibido_por || record.usuario_generado || currentUser.nombre || currentUser.username || 'Operador';
    doc.text(`Generado por: ${generatorName} | ${dateStr} ${timeStr}`, 50, 148, { align: 'center' });

    // Download PDF
    doc.save(`LPN_Label_History_${record.lpn || 'N/A'}_${new Date().getTime()}.pdf`);
  };

  const [showConfirmModal, setShowConfirmModal] = useState<{show: boolean, type: 'DELETE' | 'DISPATCH', count: number}>({show: false, type: 'DELETE', count: 0});

  const handleDeleteSelected = () => {
      if (selectedLpns.size === 0) return;
      setShowConfirmModal({ show: true, type: 'DELETE', count: selectedLpns.size });
  };

  const handleBulkDispatchAction = () => {
      if (selectedLpns.size === 0) return;
      setShowConfirmModal({ show: true, type: 'DISPATCH', count: selectedLpns.size });
  };

  const confirmAction = async () => {
      if (showConfirmModal.type === 'DELETE') {
          await onDeleteItems(Array.from(selectedLpns));
          if (activeMobileTab === 'HISTORY') {
              fetchReceptionHistory();
          }
      } else {
          await onBulkDispatch(Array.from(selectedLpns));
      }
      setSelectedLpns(new Set());
      setShowConfirmModal({ ...showConfirmModal, show: false });
  };

  // Paginate pending items helper
  const currentPendingList = (activeMobileTab === 'LOCATE' 
      ? pendingItems.filter(i => i.estado_lpn === 'GENERADO' && !i.location) 
      : pendingItems.filter(i => i.estado_lpn === 'PENDIENTE')
  ).slice().sort((a, b) => {
      const dateA = a.receptionDate ? new Date(a.receptionDate).getTime() : 0;
      const dateB = b.receptionDate ? new Date(b.receptionDate).getTime() : 0;
      return dateB - dateA;
  });

  const totalPendingPages = Math.ceil(currentPendingList.length / pendingPageSize);
  const startPendingIdx = (pendingPage - 1) * pendingPageSize;
  const paginatedPendingList = currentPendingList.slice(startPendingIdx, startPendingIdx + pendingPageSize);

  return (
    <div className="flex flex-col h-full overflow-hidden">
      
      {/* MOBILE TABS (Hidden on Desktop) */}
      <div className="flex lg:hidden bg-white border-b border-gray-200 shadow-sm shrink-0">
         <button 
            onClick={() => setActiveMobileTab('FORM')}
            className={`flex-1 py-3 text-[11px] font-black uppercase border-b-2 transition-colors ${activeMobileTab === 'FORM' ? 'border-blue-600 text-blue-600 bg-blue-50' : 'border-transparent text-gray-500'}`}
         >
            Nuevo Ingreso
         </button>
         <button 
            onClick={() => setActiveMobileTab('PENDING')}
            className={`flex-1 py-3 text-[11px] font-black uppercase border-b-2 transition-colors flex flex-col items-center justify-center gap-0.5 ${activeMobileTab === 'PENDING' ? 'border-orange-500 text-orange-600 bg-orange-50' : 'border-transparent text-gray-500'}`}
         >
            <div className="flex items-center gap-1">
                Pendientes
                <span className="bg-orange-500 text-white text-[9px] px-1.5 py-0.5 rounded-full">{pendingItems.filter(i => i.estado_lpn === 'PENDIENTE').length}</span>
            </div>
         </button>
         <button 
            onClick={() => setActiveMobileTab('LOCATE')}
            className={`flex-1 py-3 text-[11px] font-black uppercase border-b-2 transition-colors flex flex-col items-center justify-center gap-0.5 ${activeMobileTab === 'LOCATE' ? 'border-indigo-500 text-indigo-600 bg-indigo-50' : 'border-transparent text-gray-500'}`}
         >
            <div className="flex items-center gap-1">
                Ubicar
                <span className="bg-indigo-500 text-white text-[9px] px-1.5 py-0.5 rounded-full">{pendingItems.filter(i => i.estado_lpn === 'GENERADO').length}</span>
            </div>
         </button>
         <button 
            onClick={() => setActiveMobileTab('HISTORY')}
            className={`flex-1 py-3 text-[11px] font-black uppercase border-b-2 transition-colors flex flex-col items-center justify-center gap-0.5 ${activeMobileTab === 'HISTORY' ? 'border-blue-500 text-blue-600 bg-blue-50' : 'border-transparent text-gray-500'}`}
         >
            <HistoryIcon className="w-4 h-4 mb-0.5" />
            Historial
         </button>
      </div>

      <div className="flex-1 flex flex-col lg:flex-row gap-4 overflow-hidden pt-2 lg:pt-0">
        
        {/* LEFT: Reception Form - Refactored for Sticky Footer */}
        <div className={`w-full lg:w-1/2 flex flex-col h-full ${activeMobileTab === 'FORM' ? 'flex' : 'hidden lg:flex'}`}>
            <div className="bg-white rounded-xl shadow-md border border-gray-200 flex flex-col h-full overflow-hidden">
                
                {/* Mixed Mode Toggle - Compact Header */}
                <div className="shrink-0 bg-slate-50 px-4 py-2 border-b border-gray-200 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                        <Package className={`w-4 h-4 ${isMixedMode ? 'text-blue-600' : 'text-gray-400'}`}/>
                        <span className="font-bold text-xs text-gray-700">Modo Pallet Mixto / Saldos</span>
                    </div>
                    <button 
                        type="button"
                        onClick={() => {
                            setIsMixedMode(!isMixedMode);
                            setMixedItems([]);
                        }}
                        className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${isMixedMode ? 'bg-blue-600' : 'bg-gray-300'}`}
                    >
                        <span className={`inline-block h-3 w-3 transform rounded-full bg-white transition-transform ${isMixedMode ? 'translate-x-5' : 'translate-x-1'}`} />
                    </button>
                </div>

                {/* Main Form Content - Scrollable Area */}
                <form onSubmit={handleSubmit} className="flex flex-col flex-1 overflow-hidden">
                    <div className="flex-1 overflow-y-auto p-4 custom-scrollbar">
                        
                        {isAlertSchemaMissing && (
                            <div className="mb-4 bg-amber-50 border-l-4 border-amber-500 rounded-r-lg p-3.5 text-xs text-amber-900 shadow-sm">
                                <div className="flex items-start gap-2.5">
                                    <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                                    <div className="space-y-1">
                                        <p className="font-bold text-amber-950">⚠️ Base de datos requiere una actualización de columnas para Alertas Avanzadas</p>
                                        <p>Faltan columnas de soporte para alertas avanzadas (como <code>alerta_id</code>, <code>cantidad</code> o <code>estado</code>) en tu tabla de base de datos en Supabase. Para solucionar esto de forma definitiva y habilitar todas las notificaciones y flujos de aprobación en tiempo real de TVU y mala rotación, copia y ejecuta la siguiente consulta completa en el <b>SQL Editor</b> de tu consola de Supabase:</p>
                                        <pre className="mt-1.5 p-2 bg-slate-900 text-slate-100 rounded text-[10px] font-mono overflow-x-auto select-all cursor-pointer" title="Haz clic para seleccionar todo">
                                            {`-- 1. Vincular alertas y productos de recepción
ALTER TABLE public.recepcion_productos ADD COLUMN IF NOT EXISTS alerta_id UUID REFERENCES public.alertas_recepcion(id) ON DELETE SET NULL;
ALTER TABLE public.alertas_recepcion ADD COLUMN IF NOT EXISTS recepcion_id UUID REFERENCES public.recepcion_productos(id) ON DELETE CASCADE;

-- 2. Columnas de aceptación avanzada de alertas
ALTER TABLE public.alertas_recepcion ADD COLUMN IF NOT EXISTS cantidad NUMERIC DEFAULT 0;
ALTER TABLE public.alertas_recepcion ADD COLUMN IF NOT EXISTS estado TEXT DEFAULT 'PENDIENTE';
ALTER TABLE public.alertas_recepcion ADD COLUMN IF NOT EXISTS motivo_decision TEXT;
ALTER TABLE public.alertas_recepcion ADD COLUMN IF NOT EXISTS fecha_decision TIMESTAMP WITH TIME ZONE;
ALTER TABLE public.alertas_recepcion ADD COLUMN IF NOT EXISTS decision_por TEXT;`}
                                        </pre>
                                        <p className="text-[10px] text-amber-700 font-medium font-semibold">El sistema ha activado inteligentemente un modo de compatibilidad para omitir de forma segura estas columnas faltantes y permitirte seguir registrando datos y alertas sin interrupciones mientras realizas su actualización.</p>
                                    </div>
                                </div>
                            </div>
                        )}
                        
                        {/* Mixed Items List Area */}
                        {isMixedMode && (
                            <div className="mb-4 bg-blue-50 border border-blue-200 rounded-lg p-3">
                                <h4 className="font-bold text-blue-800 mb-1 flex items-center gap-2 text-sm">
                                    <Info className="w-3 h-3"/> Construyendo Pallet Mixto
                                </h4>
                                
                                {mixedItems.length > 0 && (
                                    <div className="bg-white rounded border border-blue-100 overflow-hidden mb-2 max-h-40 overflow-y-auto custom-scrollbar">
                                        <table className="w-full text-xs">
                                            <thead className="bg-blue-100 text-blue-800 sticky top-0 z-10">
                                                <tr>
                                                    <th className="p-1 text-left">Producto</th>
                                                    <th className="p-1 text-center">Cant.</th>
                                                    <th className="p-1"></th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {mixedItems.map((item, idx) => (
                                                    <tr key={idx} className="border-b border-blue-50 last:border-0">
                                                        <td className="p-1 truncate max-w-[120px]">{item.productName}</td>
                                                        <td className="p-1 text-center">{item.quantity}</td>
                                                        <td className="p-1 text-center">
                                                            <button 
                                                                type="button"
                                                                onClick={() => handleRemoveMixedItem(idx)} 
                                                                className="text-red-400 hover:text-red-600"
                                                            >
                                                                <Trash className="w-3 h-3"/>
                                                            </button>
                                                        </td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>
                                )}

                                {mixedItems.length > 0 && (
                                    <button 
                                        type="button"
                                        onClick={finalizeMixedPallet}
                                        className="w-full py-2 bg-blue-600 text-white font-bold rounded shadow hover:bg-blue-700 transition-colors flex items-center justify-center gap-2"
                                        title={`Finalizar y Generar LPN Mixto (${mixedItems.length} Refs)`}
                                    >
                                        <Printer className="w-4 h-4"/>
                                    </button>
                                )}
                            </div>
                        )}

                        {/* Standard Inputs */}
                        <div className="space-y-4">
                            {/* 1. PRODUCT SEARCH / SCAN */}
                            <div className="space-y-1 relative">
                                <label className="text-[10px] font-bold text-gray-500 uppercase tracking-wide flex items-center justify-between gap-1">
                                    <span>Producto (EAN / Nombre)</span>
                                    <div className="flex bg-gray-100 p-0.5 rounded-md border border-gray-200">
                                        <button 
                                            type="button"
                                            onClick={() => setSearchMode('SCANNER')}
                                            className={`px-2 py-0.5 text-[8px] font-black rounded transition-all ${searchMode === 'SCANNER' ? 'bg-white text-blue-600 shadow-sm' : 'text-gray-400 hover:text-gray-600'}`}
                                        >
                                            ESCÁNER
                                        </button>
                                        <button 
                                            type="button"
                                            onClick={() => setSearchMode('MANUAL')}
                                            className={`px-2 py-0.5 text-[8px] font-black rounded transition-all ${searchMode === 'MANUAL' ? 'bg-white text-indigo-600 shadow-sm' : 'text-gray-400 hover:text-gray-600'}`}
                                        >
                                            MANUAL
                                        </button>
                                    </div>
                                </label>
                                <div className="relative">
                                    {selectedProduct ? (
                                        <div className="w-full pl-10 pr-10 py-2 border-2 border-green-500 bg-green-50 rounded-lg flex items-center justify-between min-h-[48px] animate-in fade-in slide-in-from-top-1 duration-200">
                                            <span className="text-[11px] font-black text-green-900 uppercase leading-tight break-words">
                                                {selectedProduct.nombre}
                                            </span>
                                            <button 
                                                type="button"
                                                onClick={handleClearProduct}
                                                className="text-gray-400 hover:text-red-500 font-bold shrink-0 ml-2 transition-colors"
                                            >
                                                ✕
                                            </button>
                                            <div className="absolute left-3 top-1/2 -translate-y-1/2 text-green-500">
                                                <CheckCircle className="w-5 h-5"/>
                                            </div>
                                        </div>
                                    ) : (
                                        <>
                                            <input
                                                ref={searchInputRef}
                                                required={!isMixedMode || mixedItems.length === 0}
                                                autoFocus
                                                type="text"
                                                inputMode={searchMode === 'SCANNER' ? 'none' : 'text'}
                                                placeholder={searchMode === 'SCANNER' ? "Escanee código..." : "Busque por nombre, SKU..."}
                                                className={`w-full pl-10 pr-8 py-3 text-base border-2 rounded-lg outline-none transition-all font-medium ${searchMode === 'SCANNER' ? 'border-blue-200 focus:border-blue-500 bg-blue-50/10' : 'border-gray-200 focus:border-indigo-500 bg-white'}`}
                                                value={searchTerm}
                                                onChange={(e) => {
                                                    setSearchTerm(e.target.value);
                                                    setIsDropdownOpen(true);
                                                }}
                                                onFocus={() => setIsDropdownOpen(true)}
                                            />
                                            <div className={`absolute left-3 top-1/2 -translate-y-1/2 ${searchMode === 'SCANNER' ? 'text-blue-500' : 'text-gray-400'}`}>
                                                <Search className="w-5 h-5"/>
                                            </div>
                                        </>
                                    )}
                                </div>

                                {selectedProduct && (
                                    <div className="mt-1 flex flex-wrap gap-2">
                                        <div className="bg-blue-50 text-blue-700 text-[10px] font-black px-2 py-1 rounded-lg border border-blue-100 flex items-center gap-1">
                                            <Info className="w-3 h-3"/> UXC: {selectedProduct.unidades_por_caja}
                                        </div>
                                        <div className="bg-indigo-50 text-indigo-700 text-[10px] font-black px-2 py-1 rounded-lg border border-indigo-100 flex items-center gap-1">
                                            <Package className="w-3 h-3"/> CXP: {selectedProduct.cajas_por_palet || 0}
                                        </div>
                                        <div className="bg-slate-50 text-slate-600 text-[10px] font-black px-2 py-1 rounded-lg border border-slate-100 uppercase">
                                            UM: {selectedProduct.unidad_venta || 'UND'}
                                        </div>
                                    </div>
                                )}

                                {/* Dropdown Results */}
                                {isDropdownOpen && !selectedProduct && searchTerm.length > 0 && (
                                    <div className="absolute z-20 w-full bg-white border border-gray-200 rounded-lg shadow-xl mt-1 max-h-48 overflow-y-auto">
                                        {filteredProducts.length === 0 ? (
                                            <div className="p-3 text-gray-500 text-center text-sm">No encontrado</div>
                                        ) : (
                                            filteredProducts.map(p => (
                                                <button
                                                    key={p.id}
                                                    type="button"
                                                    onClick={() => handleSelectProduct(p)}
                                                    className="w-full text-left p-2 hover:bg-blue-50 border-b border-gray-100 last:border-0 transition-colors"
                                                >
                                                    {/* Fix: p.nombre, p.codigo, p.categoria */}
                                                    <div className="font-bold text-gray-800 text-sm">{p.nombre}</div>
                                                    <div className="text-xs text-gray-500 flex justify-between">
                                                        <span>{p.codigo}</span>
                                                        <span className="bg-gray-100 px-2 rounded-full text-[10px]">{p.categoria}</span>
                                                    </div>
                                                </button>
                                            ))
                                        )}
                                    </div>
                                )}
                            </div>

                                {/* 3. QUALITY INSPECTION SECTION */}
                                <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 space-y-4">
                                    <div className="flex justify-between items-center">
                                        <h3 className="text-xs font-black text-slate-800 uppercase tracking-widest flex items-center gap-2">
                                            <ClipboardList className="w-4 h-4 text-blue-600"/> Datos de Calidad
                                        </h3>
                                        <div className="flex items-center gap-2">
                                            <span className={`text-[9px] font-bold uppercase ${inspeccionCalidad ? 'text-blue-600' : 'text-slate-400'}`}>
                                                {inspeccionCalidad ? 'Activado' : 'Inactivo'}
                                            </span>
                                            <button 
                                                onClick={() => setInspeccionCalidad(!inspeccionCalidad)}
                                                className={`w-10 h-5 rounded-full transition-all relative ${inspeccionCalidad ? 'bg-blue-600' : 'bg-slate-300'}`}
                                            >
                                                <div className={`absolute top-0.5 w-4 h-4 bg-white rounded-full transition-all ${inspeccionCalidad ? 'left-5.5' : 'left-0.5'}`} />
                                            </button>
                                        </div>
                                    </div>
                                    
                                    {inspeccionCalidad && (
                                        <>
                                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                        <div className="space-y-1">
                                            <label className="text-[10px] font-bold text-gray-500 uppercase">Proveedor</label>
                                            <input 
                                                type="text" 
                                                className="w-full p-2 border border-gray-300 rounded-lg text-sm"
                                                value={proveedor}
                                                onChange={e => setProveedor(e.target.value)}
                                                placeholder="Nombre del proveedor"
                                            />
                                        </div>
                                        <div className="space-y-1">
                                            <label className="text-[10px] font-bold text-gray-500 uppercase">Guía / Factura</label>
                                            <input 
                                                type="text" 
                                                className="w-full p-2 border border-gray-300 rounded-lg text-sm"
                                                value={guiaFactura}
                                                onChange={e => setGuiaFactura(e.target.value)}
                                                placeholder="Nro documento"
                                            />
                                        </div>
                                    </div>

                                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                        <div className="space-y-1">
                                            <label className="text-[10px] font-bold text-gray-500 uppercase">Temp. Transporte (°C)</label>
                                            <input 
                                                type="number" 
                                                step="0.1"
                                                className="w-full p-2 border border-gray-300 rounded-lg text-sm"
                                                value={tempTransporte}
                                                onChange={e => setTempTransporte(e.target.value)}
                                            />
                                        </div>
                                        <div className="space-y-1">
                                            <label className="text-[10px] font-bold text-gray-500 uppercase">Lote</label>
                                            <input 
                                                type="text" 
                                                className="w-full p-2 border border-gray-300 rounded-lg text-sm"
                                                value={lote}
                                                onChange={e => setLote(e.target.value)}
                                            />
                                        </div>
                                        <div className="space-y-1">
                                            <label className="text-[10px] font-bold text-gray-500 uppercase">pH (Opcional)</label>
                                            <input 
                                                type="number" 
                                                step="0.01"
                                                className="w-full p-2 border border-gray-300 rounded-lg text-sm"
                                                value={ph}
                                                onChange={e => setPh(e.target.value)}
                                            />
                                        </div>
                                    </div>

                                    <div className="space-y-2">
                                        <label className="text-[10px] font-bold text-gray-500 uppercase">Ubicación Destino</label>
                                        <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                                            {['SECO', 'CAMARA 1', 'CAMARA 2', 'CAMARA 3'].map(loc => (
                                                <button
                                                    key={loc}
                                                    type="button"
                                                    onClick={() => setUbicacionAlmacen(loc)}
                                                    className={`py-2 px-1 rounded-lg text-[10px] font-black border transition-all ${ubicacionAlmacen === loc ? 'bg-blue-600 text-white border-blue-600 shadow-md' : 'bg-white text-gray-500 border-gray-200 hover:border-blue-300'}`}
                                                >
                                                    {loc}
                                                </button>
                                            ))}
                                        </div>
                                    </div>

                                    <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                                        {[
                                            { label: 'Cond. Higiénica', state: condicionHigienica, setter: setCondicionHigienica },
                                            { label: 'Indumentaria', state: indumentariaLimpia, setter: setIndumentariaLimpia },
                                            { label: 'Higiene Pers.', state: higienePersonal, setter: setHigienePersonal },
                                            { label: 'Aspecto Físico', state: aspectoFisico, setter: setAspectoFisico },
                                            { label: 'Color', state: color, setter: setColor },
                                            { label: 'Olor', state: olor, setter: setOlor },
                                            { label: 'Hermeticidad', state: hermeticidad, setter: setHermeticidad },
                                            { label: 'Libre Impurez.', state: libreImpurezas, setter: setLibreImpurezas },
                                            { label: 'Estado Envase', state: estadoEnvase, setter: setEstadoEnvase },
                                        ].map((item, idx) => (
                                            <div key={idx} className="space-y-1">
                                                <label className="text-[9px] font-bold text-gray-400 uppercase">{item.label}</label>
                                                <select 
                                                    className="w-full p-1.5 border border-gray-300 rounded-lg text-xs font-bold"
                                                    value={item.state}
                                                    onChange={e => item.setter(e.target.value)}
                                                >
                                                    <option value="C">C (Cumple)</option>
                                                    <option value="NC">NC (No Cumple)</option>
                                                    <option value="NA">NA (No Aplica)</option>
                                                </select>
                                            </div>
                                        ))}
                                    </div>

                                    <div className="space-y-1">
                                        <label className="text-[10px] font-bold text-gray-500 uppercase">Conclusiones</label>
                                        <select 
                                            className="w-full p-2 border border-gray-300 rounded-lg text-sm font-bold"
                                            value={conclusiones}
                                            onChange={e => setConclusiones(e.target.value)}
                                        >
                                            <option value="ACEPTADO">ACEPTADO</option>
                                            <option value="RECHAZADO">RECHAZADO</option>
                                            <option value="ACEPTADO CON OBSERVACION">ACEPTADO CON OBSERVACION</option>
                                        </select>
                                    </div>
                                </>
                            )}
                        </div>

                                {/* 4. DETAILS & VALIDATION */}
                                <div className={`transition-all duration-300 space-y-4 ${selectedProduct ? 'opacity-100 translate-y-0' : 'opacity-50 translate-y-2 grayscale pointer-events-none'}`}>
                                


                                <div className="space-y-3">
                                    <div className="grid grid-cols-2 gap-3">
                                        {selectedProduct && ((selectedProduct.cajas_por_palet ?? 0) > 0 || (selectedProduct.unidades_por_caja ?? 0) > 1) ? (
                                            <div className={`col-span-2 grid gap-2 ${ 
                                                (selectedProduct.cajas_por_palet ?? 0) > 0 
                                                    ? (selectedProduct.unidad_venta === 'PK' || selectedProduct.unidad_venta === 'BX' ? 'grid-cols-2' : 'grid-cols-3') 
                                                    : (selectedProduct.unidad_venta === 'PK' || selectedProduct.unidad_venta === 'BX' ? 'grid-cols-1' : 'grid-cols-2') 
                                            }`}>
                                                {(selectedProduct.cajas_por_palet ?? 0) > 0 && (
                                                    <div className="space-y-1">
                                                        <label className="block text-[10px] font-bold text-gray-400 uppercase">Pallets</label>
                                                        <input 
                                                            type="number" 
                                                            className="w-full p-2 border border-gray-300 rounded-lg text-lg font-bold text-center outline-none focus:border-blue-500"
                                                            value={palletQuantity || ''}
                                                            onChange={e => setPalletQuantity(parseInt(e.target.value) || 0)}
                                                            placeholder="0"
                                                        />
                                                    </div>
                                                )}
                                                <div className="space-y-1">
                                                    <label className="block text-[10px] font-bold text-gray-400 uppercase">
                                                        {selectedProduct.unidad_venta === 'PK' ? 'Paquetes' : 
                                                         selectedProduct.unidad_venta === 'KGM' ? 'Kilos' : 
                                                         selectedProduct.unidad_venta === 'NIU' ? 'Cantidad' : 'Cajas'}
                                                    </label>
                                                    <input 
                                                        type="number" 
                                                        className="w-full p-2 border border-gray-300 rounded-lg text-lg font-bold text-center outline-none focus:border-blue-500"
                                                        value={boxQuantity || ''}
                                                        onChange={e => setBoxQuantity(parseInt(e.target.value) || 0)}
                                                        placeholder="0"
                                                    />
                                                </div>
                                                {selectedProduct.unidad_venta !== 'PK' && selectedProduct.unidad_venta !== 'BX' && (
                                                    <div className="space-y-1">
                                                        <label className="block text-[10px] font-bold text-gray-400 uppercase">
                                                            {selectedProduct.unidad_venta === 'NIU' ? 'Cantidad' : 
                                                             selectedProduct.unidad_venta === 'KGM' ? 'Kilos' : 'Unidades'}
                                                        </label>
                                                        <input 
                                                            type="number" 
                                                            className="w-full p-2 border border-gray-300 rounded-lg text-lg font-bold text-center outline-none focus:border-blue-500"
                                                            value={unitQuantity || ''}
                                                            onChange={e => setUnitQuantity(parseInt(e.target.value) || 0)}
                                                            placeholder="0"
                                                        />
                                                    </div>
                                                )}
                                                <div className={`${ 
                                                    (selectedProduct.cajas_por_palet ?? 0) > 0 
                                                        ? (selectedProduct.unidad_venta === 'PK' || selectedProduct.unidad_venta === 'BX' ? 'col-span-2' : 'col-span-3') 
                                                        : (selectedProduct.unidad_venta === 'PK' || selectedProduct.unidad_venta === 'BX' ? 'col-span-1' : 'col-span-2') 
                                                } bg-blue-50 p-2 rounded-lg border border-blue-100 flex justify-between items-center`}>
                                                    <span className="text-[10px] font-black text-[#009ED6] uppercase">
                                                        {getUnitLabel(selectedProduct?.unidad_venta)} CALCULADO:
                                                    </span>
                                                    <span className="text-sm font-black text-blue-800">{quantity} {selectedProduct?.unidad_venta || 'UND'}</span>
                                                </div>
                                            </div>
                                        ) : (
                                            <div className="col-span-2 space-y-1">
                                                <label className="text-[10px] font-black text-[#009ED6] uppercase tracking-wide">
                                                    {getUnitLabel(selectedProduct?.unidad_venta)}
                                                </label>
                                                <input
                                                    required
                                                    type="number"
                                                    min="0.001" step="any"
                                                    className="w-full px-2 py-2 border border-gray-300 rounded-lg focus:border-blue-500 outline-none font-bold text-gray-700 text-xl text-center"
                                                    value={quantity || ''}
                                                    onChange={(e) => setQuantity(e.target.value === '' ? 0 : parseFloat(e.target.value))}
                                                />
                                            </div>
                                        )}

                                        <div className="col-span-2 space-y-2">
                                            <div className="flex justify-between items-center">
                                                <label className="text-[10px] font-bold text-gray-500 uppercase tracking-wide">Vencimiento</label>
                                                {tvuInfo && (
                                                    <div className="flex items-center gap-1 bg-slate-100 dark:bg-slate-800 px-2 py-0.5 rounded border border-slate-200 dark:border-slate-700">
                                                        <span className="text-[8px] font-extrabold text-slate-400 offshore whitespace-nowrap uppercase tracking-wider">TVU:</span>
                                                        <span className={`text-[10px] font-black uppercase ${tvuInfo.percentage < currentTvuThreshold ? 'text-red-600' : 'text-emerald-600'}`}>
                                                            {tvuInfo.percentage}%
                                                        </span>
                                                    </div>
                                                )}
                                            </div>
                                            <div className="grid grid-cols-2 gap-2">
                                                <select 
                                                    className={`w-full p-2 border rounded-lg text-sm font-bold outline-none focus:border-blue-500 bg-white border-gray-300`}
                                                    value={expDay}
                                                    onChange={e => setExpDay(e.target.value)}
                                                >
                                                    <option value="">DÍA</option>
                                                    {[...Array(31)].map((_, i) => (
                                                        <option key={i+1} value={i+1}>{i+1}</option>
                                                    ))}
                                                </select>
                                                <select 
                                                    className={`w-full p-2 border rounded-lg text-sm font-bold outline-none focus:border-blue-500 bg-white border-gray-300`}
                                                    value={expMonth}
                                                    onChange={e => setExpMonth(e.target.value)}
                                                >
                                                    <option value="">MES</option>
                                                    {['ENE', 'FEB', 'MAR', 'ABR', 'MAY', 'JUN', 'JUL', 'AGO', 'SEP', 'OCT', 'NOV', 'DIC'].map((m, i) => (
                                                         <option key={i+1} value={i+1}>{m}</option>
                                                    ))}
                                                </select>
                                            </div>
                                            <div className="flex flex-wrap gap-1">
                                                {[2026, 2027, 2028, 2029, 2030, 2031, 2032, 2033, 2034].map(year => (
                                                    <button
                                                        key={year}
                                                        type="button"
                                                        onClick={() => setExpYear(year.toString())}
                                                        className={`flex-1 py-1.5 px-1 rounded-lg text-[10px] font-black transition-all border-2 ${expYear === year.toString() ? 'bg-blue-600 border-blue-600 text-white shadow-lg' : 'bg-white border-gray-200 text-gray-400 hover:border-blue-300'}`}
                                                    >
                                                        {year}
                                                    </button>
                                                ))}
                                            </div>

                                            {/* Live TVU Information Bar */}
                                            {tvuInfo && (
                                                <div className="mt-2 bg-slate-50 dark:bg-slate-900/50 p-2.5 rounded-lg border border-slate-200/60 dark:border-slate-800 space-y-1.5 animate-in fade-in slide-in-from-top-1 duration-200">
                                                    <div className="flex justify-between items-center text-[10px]">
                                                        <span className="text-slate-500 font-extrabold uppercase tracking-wider">Porcentaje TVU útil:</span>
                                                        <span className={`font-black text-xs ${tvuInfo.percentage < currentTvuThreshold ? 'text-red-600' : 'text-emerald-600'}`}>
                                                            {tvuInfo.percentage}%
                                                        </span>
                                                    </div>
                                                    <div className="w-full bg-slate-200 dark:bg-slate-705 h-2 rounded-full overflow-hidden">
                                                        <div 
                                                            className={`h-full rounded-full transition-all duration-300 ${
                                                                tvuInfo.percentage < currentTvuThreshold ? 'bg-red-500' : 'bg-emerald-500'
                                                            }`} 
                                                            style={{ width: `${Math.min(100, Math.max(0, tvuInfo.percentage))}%` }}
                                                        />
                                                    </div>
                                                    <div className="flex justify-between text-[9px] text-slate-400 font-extrabold uppercase tracking-wider">
                                                        <span>{tvuInfo.remainingDays} Días restantes</span>
                                                        <span>Vida útil (TVM): {tvuInfo.totalLife} Días</span>
                                                    </div>
                                                </div>
                                            )}
                                        </div>

                                        {/* Temperature Field - Only for Refrigerated or Frozen */}
                                        {(selectedProduct?.es_refrigerado || selectedProduct?.es_congelado) && (
                                            <div className="col-span-2 space-y-1 bg-slate-50 dark:bg-slate-800/40 p-3.5 rounded-2xl border border-slate-200 dark:border-slate-800/60 animate-in fade-in duration-200">
                                                <div className="flex justify-between items-center">
                                                    <label className="text-[10px] font-black text-slate-500 uppercase tracking-wide flex items-center gap-1.5">
                                                        <Thermometer className="w-3.5 h-3.5 text-blue-600"/> Temperatura (°C) <span className="text-red-500 font-extrabold">*Obligatorio</span>
                                                    </label>
                                                    <span className={`text-[9.5px] font-black uppercase px-2 py-0.5 rounded-full ${selectedProduct?.es_congelado ? 'bg-cyan-100 text-cyan-800 dark:bg-cyan-950/40 dark:text-cyan-400 animate-pulse' : 'bg-blue-100 text-blue-800 dark:bg-blue-950/40 dark:text-blue-400'}`}>
                                                        {selectedProduct?.es_congelado ? 'Congelado (Bajo Cero)' : 'Refrigerado'}
                                                    </span>
                                                </div>
                                                
                                                <div className="relative">
                                                    <input
                                                        type="text"
                                                        inputMode="decimal"
                                                        placeholder={selectedProduct?.es_congelado ? "-18.0" : "4.0"}
                                                        className="w-full px-4 py-2.5 border border-slate-300 rounded-lg focus:border-blue-500 outline-none font-bold text-slate-700 text-xl"
                                                        value={temperature}
                                                        onChange={(e) => {
                                                            let val = e.target.value;
                                                            if (selectedProduct?.es_congelado) {
                                                                // Automatically assume negative (prepend negative sign if missing and value represents a number)
                                                                if (val && !val.startsWith('-')) {
                                                                    val = '-' + val;
                                                                }
                                                            }
                                                            if (val === '' || val === '-' || /^-?\d*\.?\d*$/.test(val)) {
                                                                setTemperature(val);
                                                            }
                                                        }}
                                                    />
                                                    {temperature && temperature !== '-' && (
                                                        <div className="absolute right-4 top-1/2 -translate-y-1/2 font-black text-slate-400 text-sm">
                                                            °C
                                                        </div>
                                                    )}
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                </div>

                            </div>
                        </div>
                    </div>
                    
                    {/* Sticky Footer Action Button */}
                    <div className="p-3 bg-white border-t border-gray-200 shrink-0 z-10">
                        <button 
                            type="submit" 
                            disabled={!selectedProduct || isSubmitting}
                            className={`w-full flex justify-center items-center gap-2 px-6 py-3 rounded-lg font-bold shadow-lg transform active:scale-[0.99] transition-all
                                ${isMixedMode 
                                    ? 'bg-green-600 hover:bg-green-700 text-white' 
                                    : 'bg-blue-600 hover:bg-blue-700 text-white'}
                                disabled:opacity-50 disabled:cursor-not-allowed
                            `}
                            title={isMixedMode 
                                ? 'Agregar al Pallet' 
                                : 'GENERAR LPN Y RECEPCIONAR'
                            }
                        >
                            {isMixedMode ? (
                                <>
                                    <PlusCircle className="w-5 h-5"/>
                                    <span>Agregar al Pallet</span>
                                </>
                            ) : (
                                <span className="text-sm uppercase tracking-wider">Registrar</span>
                            )}
                        </button>
                    </div>
                </form>

                {/* VALIDAR INGRESO ACCORDION */}
                <div className="border-t border-gray-100">
                    <button 
                        type="button"
                        onClick={() => setIsValidationAccordionOpen(!isValidationAccordionOpen)}
                        className="w-full px-4 py-3 flex items-center justify-between hover:bg-gray-50 transition-colors"
                    >
                        <div className="flex items-center gap-2">
                            <FileCheck className="w-4 h-4 text-blue-600" />
                            <span className="text-xs font-black uppercase text-gray-700 tracking-tight">Validar Ingreso (SAP vs Logistic)</span>
                        </div>
                        {isValidationAccordionOpen ? (
                            <ChevronUp className="w-4 h-4 text-gray-400" />
                        ) : (
                            <ChevronDown className="w-4 h-4 text-gray-400" />
                        )}
                    </button>
                    
                    {isValidationAccordionOpen && (
                        <div className="px-4 pb-4 animate-in slide-in-from-top-2 duration-200">
                            <div className="bg-slate-50 rounded-xl p-4 border-2 border-dashed border-slate-200">
                                <p className="text-[10px] font-bold text-slate-500 uppercase mb-3 text-center">Subir archivo Excel (CODIGO, CANTIDAD SAP)</p>
                                <div className="flex flex-col gap-3">
                                    <input 
                                        type="file" 
                                        accept=".xlsx, .xls"
                                        onChange={(e) => setValidationFile(e.target.files?.[0] || null)}
                                        className="text-xs text-slate-600 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-xs file:font-black file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100"
                                    />
                                    <button 
                                        type="button"
                                        onClick={handleValidateEntry}
                                        disabled={!validationFile || isValidatingEntry}
                                        className={`w-full py-3 rounded-xl font-black uppercase text-xs transition-all shadow-md active:scale-95 flex items-center justify-center gap-2 ${
                                            !validationFile || isValidatingEntry 
                                            ? 'bg-gray-200 text-gray-400 cursor-not-allowed' 
                                            : 'bg-blue-600 text-white hover:bg-blue-700'
                                        }`}
                                    >
                                        {isValidatingEntry ? (
                                            <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                                        ) : (
                                            <Search className="w-4 h-4" />
                                        )}
                                        REVISAR Y GENERAR REPORTE
                                    </button>
                                </div>
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>

        {/* RIGHT: Pending List (Moved from Sidebar) */}
        <div className={`w-full lg:w-1/2 flex flex-col gap-4 h-full ${activeMobileTab === 'PENDING' || activeMobileTab === 'LOCATE' || activeMobileTab === 'HISTORY' ? 'flex' : 'hidden lg:flex'}`}>
            <div className="bg-slate-50 rounded-xl border border-gray-200 h-full flex flex-col overflow-hidden shadow-inner relative">
                
                {/* Desktop Tab Switcher for Right Panel */}
                <div className="hidden lg:flex bg-white border-b border-gray-100 shrink-0">
                    <button 
                        onClick={() => setActiveMobileTab('PENDING')}
                        className={`flex-1 py-2 text-[10px] font-black uppercase border-b-2 transition-all flex items-center justify-center gap-2 ${activeMobileTab === 'PENDING' ? 'border-orange-500 text-orange-600 bg-orange-50' : 'border-transparent text-gray-400 hover:text-gray-600'}`}
                    >
                        <ArrowDownToLine className="w-3 h-3"/>
                        Pendientes ({pendingItems.filter(i => i.estado_lpn === 'PENDIENTE').length})
                    </button>
                    <button 
                        onClick={() => setActiveMobileTab('LOCATE')}
                        className={`flex-1 py-2 text-[10px] font-black uppercase border-b-2 transition-all flex items-center justify-center gap-2 ${activeMobileTab === 'LOCATE' ? 'border-indigo-500 text-indigo-600 bg-indigo-50' : 'border-transparent text-gray-400 hover:text-gray-600'}`}
                    >
                        <LayoutGrid className="w-3 h-3"/>
                        Por Ubicar ({pendingItems.filter(i => i.estado_lpn === 'GENERADO' && !i.location).length})
                    </button>
                    <button 
                        onClick={() => setActiveMobileTab('HISTORY')}
                        className={`flex-1 py-2 text-[10px] font-black uppercase border-b-2 transition-all flex items-center justify-center gap-2 ${activeMobileTab === 'HISTORY' ? 'border-blue-500 text-blue-600 bg-blue-50' : 'border-transparent text-gray-400 hover:text-gray-600'}`}
                    >
                        <HistoryIcon className="w-3 h-3"/>
                        Historial
                    </button>
                </div>

                {/* Bulk Progress Overlay */}
                {isProcessingBulk && (
                    <div className="absolute inset-0 z-20 bg-white/80 backdrop-blur-sm flex flex-col items-center justify-center p-6">
                        <div className="w-full max-w-xs space-y-4">
                            <div className="flex justify-between items-end mb-1">
                                <span className="text-xs font-bold text-blue-700 uppercase tracking-wider">Generando Etiquetas...</span>
                                <span className="text-sm font-black text-blue-900">{bulkProgress}%</span>
                            </div>
                            <div className="w-full bg-gray-200 rounded-full h-3 overflow-hidden shadow-inner border border-gray-100">
                                <div 
                                    className="bg-gradient-to-r from-blue-500 to-blue-700 h-full transition-all duration-300 ease-out shadow-lg relative"
                                    style={{ width: `${bulkProgress}%` }}
                                >
                                    <div className="absolute inset-0 bg-white/20 animate-pulse"></div>
                                </div>
                            </div>
                            <p className="text-[10px] text-gray-500 text-center font-medium italic">Por favor, espere mientras se procesan los LPNs seleccionados.</p>
                        </div>
                    </div>
                )}

                {activeMobileTab === 'HISTORY' ? (
                    <div className="flex flex-col h-full bg-white relative">
                        <div className="p-3 bg-slate-50 border-b border-gray-200 flex justify-between items-center">
                            <h3 className="font-bold text-gray-700 flex items-center gap-2 text-sm uppercase tracking-tighter">
                                <HistoryIcon className="w-4 h-4 text-blue-500"/>
                                Historial de Recepción
                            </h3>
                            <div className="flex items-center gap-2">
                                <button 
                                    onClick={() => setShowExportModal(true)}
                                    className="p-1.5 text-green-600 hover:bg-green-100 rounded-lg transition-colors flex items-center gap-1"
                                    title="Exportar a Excel"
                                >
                                    <Download className="w-4 h-4" />
                                    <span className="text-[10px] font-bold uppercase hidden sm:inline">Excel</span>
                                </button>
                                <button 
                                    onClick={() => { setHistoryPage(1); fetchReceptionHistory(); }}
                                    className="p-1.5 text-blue-600 hover:bg-blue-100 rounded-lg transition-colors"
                                >
                                    <RefreshCw className={`w-4 h-4 ${isLoadingHistory ? 'animate-spin' : ''}`} />
                                </button>
                            </div>
                        </div>

                        {/* Export Modal */}
                        {showExportModal && (
                            <div className="absolute inset-0 z-30 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4">
                                <div className="bg-white rounded-xl shadow-2xl w-full max-w-xs overflow-hidden animate-in zoom-in-95 duration-200">
                                    <div className="bg-green-600 p-3 text-white flex justify-between items-center">
                                        <h4 className="text-xs font-black uppercase tracking-wider flex items-center gap-2">
                                            <Download className="w-3 h-3" /> Exportar Historial
                                        </h4>
                                        <button onClick={() => setShowExportModal(false)}>
                                            <X className="w-4 h-4" />
                                        </button>
                                    </div>
                                    <div className="p-4 space-y-4">
                                        <div>
                                            <label className="text-[10px] font-bold text-gray-500 uppercase mb-1 block">Fecha Inicio</label>
                                            <input 
                                                type="date" 
                                                className="w-full border border-gray-200 rounded px-2 py-1.5 text-xs outline-none focus:ring-2 focus:ring-green-500"
                                                value={exportStartDate}
                                                onChange={(e) => setExportStartDate(e.target.value)}
                                            />
                                        </div>
                                        <div>
                                            <label className="text-[10px] font-bold text-gray-500 uppercase mb-1 block">Fecha Fin</label>
                                            <input 
                                                type="date" 
                                                className="w-full border border-gray-200 rounded px-2 py-1.5 text-xs outline-none focus:ring-2 focus:ring-green-500"
                                                value={exportEndDate}
                                                onChange={(e) => setExportEndDate(e.target.value)}
                                            />
                                        </div>
                                        <button 
                                            onClick={handleExportExcel}
                                            disabled={isLoadingHistory}
                                            className="w-full bg-green-600 text-white py-2 rounded font-black text-xs uppercase tracking-widest hover:bg-green-700 transition-colors disabled:opacity-50"
                                        >
                                            {isLoadingHistory ? 'Procesando...' : 'Descargar Excel'}
                                        </button>
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* History Search Bar */}
                        <div className="p-2 border-b border-gray-150 bg-slate-50 flex items-center">
                            <div className="relative w-full">
                                <span className="absolute inset-y-0 left-0 pl-2.5 flex items-center pointer-events-none">
                                    <Search className="h-3.5 w-3.5 text-gray-400" />
                                </span>
                                <input 
                                    type="text"
                                    placeholder="Buscar por LPN, nombre de producto, SKU..."
                                    value={historySearch}
                                    onChange={(e) => {
                                        setHistorySearch(e.target.value);
                                        setHistoryPage(1);
                                    }}
                                    className="pl-8 pr-8 py-1.5 w-full bg-white border border-gray-200 rounded-lg text-xs placeholder-gray-400 focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all text-slate-850"
                                />
                                {historySearch && (
                                    <button 
                                        onClick={() => {
                                            setHistorySearch('');
                                            setHistoryPage(1);
                                        }}
                                        className="absolute inset-y-0 right-0 pr-2.5 flex items-center text-gray-400 hover:text-gray-600"
                                    >
                                        <X className="h-3.5 w-3.5" />
                                    </button>
                                )}
                            </div>
                        </div>
                        
                        <div className="flex-1 overflow-y-auto p-2">
                            {isLoadingHistory ? (
                                <div className="flex flex-col items-center justify-center py-12">
                                    <div className="w-8 h-8 border-3 border-blue-600 border-t-transparent rounded-full animate-spin mb-3"></div>
                                    <p className="text-xs text-gray-500 font-medium">Cargando registros...</p>
                                </div>
                            ) : receptionHistory.length === 0 ? (
                                <div className="flex flex-col items-center justify-center py-12 text-gray-400">
                                    <Package className="w-12 h-12 mb-2 opacity-20" />
                                    <p className="text-xs">No hay historial disponible</p>
                                </div>
                            ) : (
                                <div className="space-y-2">
                                    {receptionHistory.map((record) => (
                                        <div key={record.id} className="p-3 bg-white border border-gray-100 rounded-lg shadow-sm hover:border-blue-200 transition-colors">
                                            <div className="flex justify-between items-start mb-1">
                                                <div>
                                                    <div className="flex items-center gap-2 mb-1">
                                                        <span className="text-[9px] font-black bg-blue-600 text-white px-1.5 py-0.5 rounded uppercase">
                                                            LPN: {record.lpn || 'N/A'}
                                                        </span>
                                                        <span className="text-[9px] font-bold text-gray-400">
                                                            {new Date(record.fecha_registro).toLocaleDateString()}
                                                        </span>
                                                        {record.estado === 'PENDIENTE_AUTORIZACION' ? ( <span className="text-[9px] font-black border border-amber-200 text-amber-700 bg-amber-50 px-1.5 py-0.5 rounded uppercase animate-pulse">PENDIENTE APROBACIÓN</span> ) : record.paletas_lpn?.tipo && (
                                                            <span className={`text-[9px] font-black border px-1.5 py-0.5 rounded uppercase ${record.paletas_lpn.tipo === 'GENERADO' ? 'text-amber-700 bg-amber-50 border-amber-200' : 'text-emerald-700 bg-emerald-50 border-emerald-250'}`}>
                                                                {record.paletas_lpn.tipo === 'GENERADO' ? 'ROTULADO' : 'RECEPCIÓN'}
                                                            </span>
                                                        )}
                                                        {record.paletas_lpn?.ubicacion_id && (
                                                            <span className="text-[9px] font-black text-green-600 bg-green-50 px-1.5 py-0.5 rounded border border-green-100 uppercase">
                                                                {record.paletas_lpn.ubicacion_id}
                                                            </span>
                                                        )}
                                                    </div>
                                                    <h4 className="text-xs font-bold text-gray-800 leading-tight">{record.nombre}</h4>
                                                    <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                                                        <span className="text-[9px] text-gray-500 font-mono">{record.codigo}</span>
                                                        {record.fecha_vencimiento && (
                                                            <span className="text-[9px] text-rose-600 bg-rose-50 border border-rose-100 px-1.5 py-0.5 rounded font-extrabold uppercase tracking-tight">
                                                                Vence: {formatDate(record.fecha_vencimiento)}
                                                            </span>
                                                        )}
                                                    </div>
                                                </div>
                                                <div className="text-right flex flex-col items-end gap-2">
                                                    <div className="flex items-center gap-2">
                                                        <div className="text-sm font-black text-gray-900">{record.cantidad}</div>
                                                        <button 
                                                            onClick={() => record.estado === 'PENDIENTE_AUTORIZACION' ? alert('Este ingreso requiere aprobación antes de poder imprimir su etiqueta LPN.') : handlePrintLpnFromHistory(record)}
                                                            className={`p-1 transition-colors cursor-pointer ${record.estado === 'PENDIENTE_AUTORIZACION' ? 'text-amber-500 hover:text-amber-700' : 'text-blue-500 hover:text-blue-700'}`}
                                                            title={record.estado === 'PENDIENTE_AUTORIZACION' ? "RETENIDO: Requiere aprobación del asistente" : "Imprimir etiqueta LPN"}
                                                        >
                                                            {record.estado === 'PENDIENTE_AUTORIZACION' ? <span className="text-[9px] font-black tracking-tighter bg-amber-50 px-1 py-0.5 border border-amber-200 rounded text-amber-600">⚠ RETENIDO</span> : <Printer className="w-3.5 h-3.5" />}
                                                        </button>
                                                        <button 
                                                            onClick={() => {
                                                                setSelectedLpns(new Set([record.lpn]));
                                                                setShowConfirmModal({ show: true, type: 'DELETE', count: 1 });
                                                            }}
                                                            className="p-1 text-red-400 hover:text-red-600 transition-colors cursor-pointer"
                                                            title="Eliminar registro"
                                                        >
                                                            <Trash className="w-3.5 h-3.5" />
                                                        </button>
                                                    </div>
                                                    <div className="text-[8px] font-bold text-gray-400 uppercase">{record.unidad_medida}</div>
                                                </div>
                                            </div>
                                            <div className="flex items-center justify-between mt-2 pt-2 border-t border-gray-50">
                                                <div className="flex items-center gap-1">
                                                    <User className="w-2.5 h-2.5 text-gray-400" />
                                                    <span className="text-[9px] text-gray-500">{record.usuario_registro}</span>
                                                </div>
                                                <div className="flex items-center gap-1">
                                                    <Clock className="w-2.5 h-2.5 text-gray-400" />
                                                    <span className="text-[9px] text-gray-500">{new Date(record.fecha_registro).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</span>
                                                </div>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>

                        {/* Pagination Controls */}
                        {!isLoadingHistory && historyTotalCount > itemsPerPage && (
                            <div className="p-2 bg-slate-50 border-t border-gray-200 flex items-center justify-between">
                                <span className="text-[10px] text-gray-500 font-bold uppercase">
                                    Total: {historyTotalCount}
                                </span>
                                <div className="flex items-center gap-1">
                                    <button 
                                        onClick={() => setHistoryPage(p => Math.max(1, p - 1))}
                                        disabled={historyPage === 1}
                                        className="p-1 rounded hover:bg-gray-200 disabled:opacity-30 transition-colors"
                                    >
                                        <ChevronLeft className="w-4 h-4" />
                                    </button>
                                    <span className="text-xs font-black text-blue-600 px-2">
                                        {historyPage} / {Math.ceil(historyTotalCount / itemsPerPage)}
                                    </span>
                                    <button 
                                        onClick={() => setHistoryPage(p => Math.min(Math.ceil(historyTotalCount / itemsPerPage), p + 1))}
                                        disabled={historyPage >= Math.ceil(historyTotalCount / itemsPerPage)}
                                        className="p-1 rounded hover:bg-gray-200 disabled:opacity-30 transition-colors"
                                    >
                                        <ChevronRight className="w-4 h-4" />
                                    </button>
                                </div>
                            </div>
                        )}
                    </div>
                ) : (
                    <>
                        {/* Header with Bulk Actions */}
                <div className="p-3 bg-white border-b border-gray-200 flex justify-between items-center shadow-sm">
                    <div className="flex items-center gap-3">
                        <input 
                            type="checkbox" 
                            className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
                            checked={
                                (activeMobileTab === 'LOCATE' 
                                    ? pendingItems.filter(i => i.estado_lpn === 'GENERADO').length > 0 && selectedLpns.size === pendingItems.filter(i => i.estado_lpn === 'GENERADO').length
                                    : pendingItems.filter(i => i.estado_lpn === 'PENDIENTE').length > 0 && selectedLpns.size === pendingItems.filter(i => i.estado_lpn === 'PENDIENTE').length)
                            }
                            onChange={() => {
                                const currentList = activeMobileTab === 'LOCATE' 
                                    ? pendingItems.filter(i => i.estado_lpn === 'GENERADO')
                                    : pendingItems.filter(i => i.estado_lpn === 'PENDIENTE');
                                
                                if (selectedLpns.size === currentList.length && currentList.length > 0) {
                                    setSelectedLpns(new Set());
                                } else {
                                    setSelectedLpns(new Set(currentList.map(item => item.lpn)));
                                }
                            }}
                        />
                        <div className="flex items-center gap-2">
                            <h3 className="font-bold text-gray-700 flex items-center gap-2 text-sm uppercase tracking-tighter">
                                {activeMobileTab === 'LOCATE' ? <LayoutGrid className="w-4 h-4 text-indigo-500"/> : <ArrowDownToLine className="w-4 h-4 text-orange-500"/>}
                                {activeMobileTab === 'LOCATE' ? 'Por Ubicar' : 'LPN'}
                            </h3>
                            <span className={`${activeMobileTab === 'LOCATE' ? 'bg-indigo-100 text-indigo-700' : 'bg-orange-100 text-orange-700'} px-2 py-0.5 rounded-full text-[10px] font-bold`}>
                                {activeMobileTab === 'LOCATE' ? pendingItems.filter(i => i.estado_lpn === 'GENERADO').length : pendingItems.filter(i => i.estado_lpn === 'PENDIENTE').length}
                            </span>
                        </div>
                    </div>
                    
                    {selectedLpns.size > 0 && (
                        <div className="flex gap-2">
                            {activeMobileTab !== 'LOCATE' && (
                                <button 
                                    onClick={handleBulkGenerate}
                                    disabled={isProcessingBulk}
                                    className="flex items-center gap-1 bg-green-100 text-green-700 px-3 py-1.5 rounded hover:bg-green-200 transition-colors text-xs font-bold disabled:opacity-50"
                                    title="Generar etiquetas para los LPN seleccionados"
                                >
                                    <Printer className="w-4 h-4"/>
                                </button>
                            )}
                            <button 
                                onClick={handleBulkDispatchAction}
                                disabled={isProcessingBulk}
                                className="flex items-center gap-1 bg-blue-100 text-blue-700 px-3 py-1.5 rounded hover:bg-blue-200 transition-colors text-xs font-bold disabled:opacity-50"
                                title="Mercadería vendida (Cross-docking) que no se va a ubicar"
                            >
                                <ArrowRightFromLine className="w-3 h-3"/>
                            </button>
                            <button 
                                onClick={handleDeleteSelected}
                                disabled={isProcessingBulk}
                                className="flex items-center gap-1 bg-red-100 text-red-600 px-3 py-1.5 rounded hover:bg-red-200 transition-colors text-xs font-bold disabled:opacity-50"
                                title="Eliminar registro (error)"
                            >
                                <Trash className="w-4 h-4"/>
                            </button>
                        </div>
                    )}
                </div>
                
                {/* Locating Instructions/Scanner */}
                {activeMobileTab === 'LOCATE' && (
                    <div className="p-3 bg-indigo-50 border-b border-indigo-100">
                        <div className="flex items-center gap-3 mb-2">
                            <div className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-sm ${locateStep === 'SCAN_LPN' ? 'bg-indigo-600 text-white' : 'bg-green-600 text-white'}`}>
                                {locateStep === 'SCAN_LPN' ? '1' : '2'}
                            </div>
                            <div>
                                <p className="text-xs font-bold text-indigo-900 leading-none">
                                    {locateStep === 'SCAN_LPN' ? 'ESCANEÉ EL LPN' : `UBICANDO LPN: ${locatingLpn}`}
                                </p>
                                <p className="text-[10px] text-indigo-700 mt-1">
                                    {locateStep === 'SCAN_LPN' ? 'Escanee el código QR del pallet para comenzar' : 'Ahora escanee la ubicación del RACK (Ej: A-R1-L2-P3)'}
                                </p>
                            </div>
                            {locatingLpn && (
                                <button 
                                    onClick={() => { setLocatingLpn(null); setLocateStep('SCAN_LPN'); setManualLocation(''); }}
                                    className="ml-auto text-[10px] text-red-600 font-bold underline"
                                >
                                    Cancelar
                                </button>
                            )}
                        </div>
                        <div className="flex gap-2">
                            <input 
                                type="text"
                                placeholder={locateStep === 'SCAN_LPN' ? "Ingrese LPN manualmente..." : "Ingrese ubicación manualmente..."}
                                className="flex-1 bg-white border border-indigo-200 rounded px-3 py-1.5 text-xs focus:ring-2 focus:ring-indigo-500 outline-none"
                                value={manualLocation}
                                onChange={(e) => setManualLocation(e.target.value)}
                                onKeyDown={(e) => {
                                    if (e.key === 'Enter' && manualLocation.trim()) {
                                        if (locateStep === 'SCAN_LPN') {
                                            const item = pendingItems.find(i => i.lpn === manualLocation.trim() && (i.estado_lpn === 'GENERADO' || i.generado));
                                            if (item) {
                                                setLocatingLpn(manualLocation.trim());
                                                setLocateStep('SCAN_LOC');
                                                setManualLocation('');
                                            } else {
                                                alert("LPN no encontrado o no generado.");
                                            }
                                        } else {
                                            handleAssignLocation(locatingLpn!, manualLocation.trim());
                                        }
                                    }
                                }}
                            />
                            <button 
                                onClick={() => {
                                    if (manualLocation.trim()) {
                                        if (locateStep === 'SCAN_LPN') {
                                            const item = pendingItems.find(i => i.lpn === manualLocation.trim() && (i.estado_lpn === 'GENERADO' || i.generado));
                                            if (item) {
                                                setLocatingLpn(manualLocation.trim());
                                                setLocateStep('SCAN_LOC');
                                                setManualLocation('');
                                            } else {
                                                alert("LPN no encontrado o no generado.");
                                            }
                                        } else {
                                            handleAssignLocation(locatingLpn!, manualLocation.trim());
                                        }
                                    }
                                }}
                                className="bg-indigo-600 text-white px-4 py-1.5 rounded text-xs font-bold hover:bg-indigo-700 transition-colors"
                            >
                                {locateStep === 'SCAN_LPN' ? 'Siguiente' : 'Ubicar'}
                            </button>
                        </div>
                    </div>
                )}
                
                <div className="flex-1 overflow-y-auto p-2 space-y-2 pb-32 lg:pb-2">
                    {paginatedPendingList.length === 0 ? (
                        <div className="h-full flex flex-col items-center justify-center text-gray-400 opacity-60">
                            <Package className="w-12 h-12 mb-2" />
                            <p className="text-sm">{activeMobileTab === 'LOCATE' ? 'No hay LPNs por ubicar' : 'Zona de espera vacía'}</p>
                        </div>
                    ) : (
                        paginatedPendingList.map((item) => (
                            <div 
                                key={item.lpn} 
                                onClick={() => toggleSelectLpn(item.lpn)}
                                className={`bg-white p-3 rounded-lg border shadow-sm hover:shadow-md transition-all relative group flex gap-3 cursor-pointer ${item.isMixed ? 'border-indigo-200' : 'border-gray-200'} ${selectedLpns.has(item.lpn) ? 'ring-2 ring-blue-500 bg-blue-50' : ''}`}
                            >
                                {/* Checkbox for selection */}
                                <div className="flex items-center justify-center border-r pr-3 border-gray-100">
                                    <input 
                                        type="checkbox" 
                                        className="w-5 h-5 rounded border-gray-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
                                        checked={selectedLpns.has(item.lpn)}
                                        onClick={(e) => e.stopPropagation()} // Prevent double trigger
                                        onChange={() => toggleSelectLpn(item.lpn)}
                                    />
                                </div>

                                <div className="flex-1">
                                    <div className="flex justify-between items-start mb-1">
                                        <div>
                                            <h4 className={`font-bold text-sm leading-tight ${item.isMixed ? 'text-indigo-800' : 'text-gray-800'}`}>{item.productName}</h4>
                                            <p className="text-[10px] text-gray-500 font-mono mb-1">SKU: {item.productCode}</p>
                                            <div className="flex flex-wrap items-center gap-1.5">
                                                <span className={`text-[9px] px-1.5 py-0.5 rounded uppercase font-bold inline-block ${item.tipo === 'GENERADO' ? 'bg-amber-100/80 text-amber-700 border border-amber-200' : 'bg-emerald-100 text-emerald-700 border border-emerald-200'}`}>
                                                    {item.tipo === 'GENERADO' ? 'Rotulado' : 'Recepción'}
                                                </span>
                                                {item.expirationDate && (
                                                    <span className="text-[9px] text-rose-600 bg-rose-50 border border-rose-100 px-1.5 py-0.5 rounded font-extrabold uppercase tracking-tight">
                                                        Vence: {formatDate(item.expirationDate)}
                                                    </span>
                                                )}
                                                {item.isMixed && (
                                                    <span className="text-[9px] bg-indigo-100 text-indigo-700 px-1 py-0.5 rounded uppercase font-bold inline-block">Pallet Mixto</span>
                                                )}
                                            </div>
                                        </div>
                                        <div className="text-right flex flex-col items-end gap-1">
                                            <span className="block font-mono font-black text-sm text-slate-700 tracking-wider">{item.lpn}</span>
                                            <span className="text-[10px] bg-blue-100 text-blue-800 px-1.5 py-0.5 rounded font-bold">x{item.quantity}</span>
                                            
                                            {activeMobileTab === 'LOCATE' ? (
                                                <button 
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        setLocatingLpn(item.lpn);
                                                        setLocateStep('SCAN_LOC');
                                                        setManualLocation('');
                                                    }}
                                                    className="mt-2 bg-indigo-600 text-white px-3 py-1 rounded text-[10px] font-bold hover:bg-indigo-700 transition-colors flex items-center gap-1"
                                                >
                                                    <LayoutGrid className="w-3 h-3"/> UBICAR
                                                </button>
                                            ) : (
                                                (item.estado_lpn === 'GENERADO' || item.generado) && (
                                                    <div className="mt-1 flex flex-col items-end gap-0.5 text-[9px] text-green-600 font-bold">
                                                        <div className="flex items-center gap-1">
                                                            <CheckCircle className="w-3 h-3" />
                                                            GENERADO
                                                        </div>
                                                        <div className="text-[8px] text-gray-400 font-normal">
                                                            {item.usuario_generado} - {new Date(item.fecha_generado || '').toLocaleDateString()}
                                                        </div>
                                                    </div>
                                                )
                                            )}
                                        </div>
                                    </div>
                                    
                                    <div className="flex items-center gap-4 text-[10px] text-gray-500 border-t pt-1 mt-1">
                                        <div className="flex items-center gap-1 bg-slate-50 px-2 py-0.5 rounded border border-slate-100">
                                            <Clock className="w-3 h-3 text-indigo-500" />
                                            <span className="font-bold text-slate-600">
                                                {new Date(item.receptionDate).toLocaleDateString()} {new Date(item.receptionDate).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}
                                            </span>
                                        </div>
                                        <div className="flex items-center gap-1 bg-blue-50 px-2 py-0.5 rounded border border-blue-100">
                                            <User className="w-3 h-3 text-blue-500" />
                                            <span className="text-blue-700 font-black uppercase tracking-tight">{item.receivedBy}</span>
                                        </div>
                                    </div>
                                </div>
                                
                                {/* Decoration for status */}
                                <div className={`absolute left-0 top-0 bottom-0 w-1 rounded-l-lg ${item.isMixed ? 'bg-indigo-500' : 'bg-orange-400'}`}></div>
                            </div>
                        ))
                    )}
                </div>

                {/* Pending Items Pagination Controls */}
                {totalPendingPages > 1 && (
                    <div className="p-2.5 bg-white border-t border-gray-205 flex items-center justify-between shrink-0">
                        <span className="text-[10px] text-gray-500 font-bold uppercase select-none">
                            Total: {currentPendingList.length}
                        </span>
                        <div className="flex items-center gap-1">
                            <button 
                                onClick={(e) => { e.stopPropagation(); setPendingPage(p => Math.max(1, p - 1)); }}
                                disabled={pendingPage === 1}
                                className="p-1 rounded hover:bg-gray-100 disabled:opacity-30 transition-colors cursor-pointer"
                            >
                                <ChevronLeft className="w-4 h-4 text-slate-600" />
                            </button>
                            <span className="text-xs font-black text-slate-700 px-2 select-none">
                                {pendingPage} / {totalPendingPages}
                            </span>
                            <button 
                                onClick={(e) => { e.stopPropagation(); setPendingPage(p => Math.min(totalPendingPages, p + 1)); }}
                                disabled={pendingPage >= totalPendingPages}
                                className="p-1 rounded hover:bg-gray-100 disabled:opacity-30 transition-colors cursor-pointer"
                            >
                                <ChevronRight className="w-4 h-4 text-slate-600" />
                            </button>
                        </div>
                    </div>
                )}
            </>
        )}
    </div>
</div>
      </div>

      {/* MODAL: Confirmation Alert */}
      {showConfirmModal.show && (
          <div className="fixed inset-0 z-[70] bg-black/60 backdrop-blur-sm flex justify-center items-center p-4">
              <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden animate-in zoom-in-95 duration-200 border border-gray-100">
                  <div className={`p-6 text-center ${showConfirmModal.type === 'DELETE' ? 'bg-red-50' : 'bg-blue-50'}`}>
                      {showConfirmModal.type === 'DELETE' ? (
                          <Trash2 className="w-12 h-12 mx-auto mb-3 text-red-600" />
                      ) : (
                          <ArrowRightFromLine className="w-12 h-12 mx-auto mb-3 text-blue-600" />
                      )}
                      <h3 className={`text-lg font-black uppercase tracking-tight ${showConfirmModal.type === 'DELETE' ? 'text-red-900' : 'text-blue-900'}`}>
                          {showConfirmModal.type === 'DELETE' ? 'Confirmar Eliminación' : 'Confirmar Despacho'}
                      </h3>
                      <p className="text-sm text-gray-600 mt-2 font-medium">
                          {showConfirmModal.type === 'DELETE' 
                            ? `¿Estas seguro que desea eliminar? esta accion no se puede revertir.`
                            : `¿Confirmar SALIDA de ${showConfirmModal.count} items por venta (Cross-docking)?`}
                      </p>
                  </div>
                  <div className="p-4 flex gap-3 bg-gray-50">
                      <button 
                          onClick={() => setShowConfirmModal({ ...showConfirmModal, show: false })}
                          className="flex-1 px-4 py-2.5 bg-white border border-gray-200 text-gray-700 rounded-xl font-bold text-sm hover:bg-gray-100 transition-all"
                      >
                          CANCELAR
                      </button>
                      <button 
                          onClick={confirmAction}
                          className={`flex-1 px-4 py-2.5 text-white rounded-xl font-bold text-sm shadow-lg transition-all active:scale-95 ${showConfirmModal.type === 'DELETE' ? 'bg-red-600 hover:bg-red-700' : 'bg-blue-600 hover:bg-blue-700'}`}
                      >
                          CONFIRMAR
                      </button>
                  </div>
              </div>
          </div>
      )}

      {/* Validation Modal */}
      {showValidationModal.show && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden transform animate-in zoom-in-95 duration-200">
            <div className="p-6 text-center">
              <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <AlertTriangle className="w-8 h-8 text-red-600" />
              </div>
              <h3 className="text-lg font-black text-gray-900 mb-2 uppercase tracking-tight">Atención Requerida</h3>
              <p className="text-gray-600 text-sm leading-relaxed mb-6">
                {showValidationModal.message}
              </p>
              <button
                onClick={() => setShowValidationModal({ show: false, message: '' })}
                className="w-full py-3 bg-red-600 hover:bg-red-700 text-white font-bold rounded-xl shadow-lg transition-all active:scale-[0.98]"
              >
                ENTENDIDO
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: Unified Alert Modal (Rotation and/or TVM) */}
      {showAlertModal && (
          <div className="fixed inset-0 z-[60] bg-black/90 backdrop-blur-md flex justify-center items-center p-4">
              <div 
                  className={`bg-white rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden animate-in zoom-in-95 duration-200 border-4 ${alertType !== 'weekly_over_rotation' ? ((alertType === 'rotation' || alertType === 'both') ? 'border-red-600' : (alertType === 'overstock' || alertType === 'tvu_over_100') ? 'border-blue-600' : 'border-orange-500') : ''}`}
                  style={alertType === 'weekly_over_rotation' ? { borderColor: '#72B964' } : undefined}
              >
                  <div 
                      className={`p-5 text-white text-center ${alertType !== 'weekly_over_rotation' ? ((alertType === 'rotation' || alertType === 'both') ? 'bg-red-600' : (alertType === 'overstock' || alertType === 'tvu_over_100') ? 'bg-blue-600' : 'bg-orange-500') : ''}`}
                      style={alertType === 'weekly_over_rotation' ? { backgroundColor: '#72B964' } : undefined}
                  >
                      <AlertTriangle className="w-14 h-14 mx-auto mb-2 animate-bounce" />
                      <h2 className="text-lg font-black uppercase tracking-tight leading-tight">
                          {selectedProduct?.codigo} - {selectedProduct?.nombre}
                      </h2>
                      <p className="text-xs font-black opacity-90 mt-1.5 uppercase tracking-widest bg-black/20 py-1 px-3 rounded-full inline-block">
                          {alertType === 'both' ? '¡ALERTA DOBLE!' : alertType === 'rotation' ? '¡MALA ROTACIÓN!' : alertType === 'weekly_over_rotation' ? 'ALERTA POR SOBRE STOCK - REVISAR LA ROTACIÓN Y DIAS DE STOCK' : alertType === 'overstock' ? '¡POSIBLE SOBRE STOCK!' : alertType === 'tvu_over_100' ? 'INCONSISTENCIA DE TVU - REVISARLO CON CALIDAD' : '¡ALERTA DE TVM!'}
                      </p>
                  </div>
                  
                  <div className="p-5 space-y-4">
                      {/* Incoming Info Block: Quantity & Rte (Proveedor) */}
                      <div className="bg-slate-50 border border-slate-200/60 rounded-xl p-3 space-y-2">
                          <div className="flex justify-between items-center text-xs">
                              <span className="text-slate-500 font-bold uppercase tracking-wider text-[9px]">Cant. que está llegando:</span>
                              <span className="text-slate-950 font-black text-sm bg-indigo-50 text-indigo-700 px-2.5 py-0.5 rounded-lg border border-indigo-100">{quantity} {selectedProduct?.unidad_venta || 'UND'}</span>
                          </div>
                          <div className="flex justify-between items-center text-xs">
                              <span className="text-slate-500 font-bold uppercase tracking-wider text-[9px]">TVU Acordado:</span>
                              <span className="text-slate-950 font-black text-xs bg-sky-50 text-sky-700 px-2 py-0.5 rounded border border-sky-250">
                                  {selectedProduct?.tvu_promesa !== undefined && selectedProduct?.tvu_promesa !== null && selectedProduct?.tvu_promesa > 0 ? `${selectedProduct.tvu_promesa}%` : '80%'}
                              </span>
                          </div>
                          {(palletQuantity > 0 || boxQuantity > 0 || unitQuantity > 0) && (
                              <div className="flex gap-2 text-[10px] text-slate-500 font-semibold justify-end">
                                  {palletQuantity > 0 && <span>{palletQuantity} Pallets</span>}
                                  {boxQuantity > 0 && <span>{boxQuantity} Cajas</span>}
                                  {unitQuantity > 0 && <span>{unitQuantity} {selectedProduct?.unidad_venta || 'Unidades'}</span>}
                              </div>
                          )}
                          <div className="flex justify-between items-center text-xs pt-2 border-t border-slate-200/60">
                              <span className="text-slate-500 font-bold uppercase tracking-wider text-[9px]">Rte (Proveedor):</span>
                              <span className="text-slate-950 font-black uppercase text-right tracking-tight max-w-[180px] truncate" title={proveedor}>
                                  {proveedor || 'Sin especificar'}
                              </span>
                          </div>
                      </div>

                      {/* Rotation Warning Section */}
                      {(alertType === 'rotation' || alertType === 'both') && lastHistoricalExpDate && (
                          <div className="bg-red-50 p-4 rounded-xl border border-red-100 text-center space-y-2.5">
                              <div>
                                  <p className="text-gray-500 text-[10px] font-black uppercase mb-0.5">Última fecha ingresada (Histórico)</p>
                                  <p className="text-lg font-black text-red-700">{formatDate(lastHistoricalExpDate)}</p>
                              </div>
                              <div className="pt-2 border-t border-red-200/60">
                                  <p className="text-red-800 text-[10px] font-black uppercase tracking-wider mb-0.5">
                                      Fecha nueva de vencimiento:
                                  </p>
                                  <span className="text-sm block font-black text-red-955 bg-red-100/50 py-1 rounded-lg">{formatDate(expirationDate)}</span>
                              </div>
                          </div>
                      )}

                      {/* TVM Warning Section */}
                      {(alertType === 'tvm' || alertType === 'both' || alertType === 'tvu_over_100') && tvmWarningData && (
                          <div className={`${alertType === 'tvu_over_100' ? 'bg-blue-50 border-blue-200 text-blue-900' : 'bg-orange-50 border-orange-200 text-orange-950'} p-4 rounded-xl border text-center space-y-2.5`}>
                              <p className={`text-[10px] font-black uppercase tracking-wider ${alertType === 'tvu_over_100' ? 'text-blue-900' : 'text-orange-950'}`}>
                                  DETALLE DE LA ALERTA TVU
                              </p>
                              <div className={`grid grid-cols-3 gap-2 border-t border-b ${alertType === 'tvu_over_100' ? 'border-blue-200/50' : 'border-orange-200/50'} py-2.5 my-1 text-left`}>
                                  <div className="text-center w-full">
                                      <p className="text-[9px] text-slate-500 font-bold uppercase truncate">TVM</p>
                                      <p className={`text-xs md:text-sm font-black ${alertType === 'tvu_over_100' ? 'text-blue-700' : 'text-orange-700'}`}>{tvmWarningData.tvm} días</p>
                                  </div>
                                  <div className={`text-center border-l border-r ${alertType === 'tvu_over_100' ? 'border-blue-200/50' : 'border-orange-200/50'} w-full`}>
                                      <p className="text-[9px] text-slate-500 font-bold uppercase truncate">% tvu Recepción hoy</p>
                                      <p className={`text-xs md:text-sm font-black ${alertType === 'tvu_over_100' ? 'text-blue-700' : 'text-orange-700'}`}>{tvmWarningData.percentage}%</p>
                                  </div>
                                  <div className="text-center w-full">
                                      <p className="text-[9px] text-slate-500 font-bold uppercase truncate">DIAS TVU Recepción hoy</p>
                                      <p className={`text-xs md:text-sm font-black ${alertType === 'tvu_over_100' ? 'text-blue-700' : 'text-orange-700'}`}>{tvmWarningData.remainingDays} días</p>
                                  </div>
                              </div>
                              {expirationDate && (
                                  <div className="pt-1">
                                      <p className="text-slate-500 text-[9px] font-bold uppercase tracking-wider mb-0.5">
                                          FECHA VENCIMIENTO REGISTRADA:
                                      </p>
                                      <span className={`text-xs block font-black py-1.5 px-3 rounded-lg ${alertType === 'tvu_over_100' ? 'bg-blue-100 text-blue-950' : 'bg-orange-100/70 text-orange-950'}`}>
                                          {formatDate(expirationDate)}
                                      </span>
                                  </div>
                              )}
                          </div>
                      )}

                      {/* Overstock Warning Section */}
                      {alertType === 'overstock' && selectedProduct && (
                          <div className="bg-blue-50 p-4 rounded-xl border border-blue-100 text-center">
                              <p className="text-gray-500 text-[10px] font-black uppercase mb-1">Venta Media Histórica</p>
                              <p className="text-xl font-black text-blue-700">{selectedProduct.venta_media || 0} {selectedProduct?.unidad_venta || 'UND'}</p>
                              <p className="text-[10px] text-blue-800 font-bold mt-2 uppercase tracking-widest border-t border-blue-100 pt-2">
                                  Posible sobre stock detectado
                              </p>
                          </div>
                      )}

                      {/* Weekly Over-rotation Warning Section */}
                      {alertType === 'weekly_over_rotation' && selectedProduct && (() => {
                          const mult = (selectedProduct.multiplo !== undefined && selectedProduct.multiplo !== null && selectedProduct.multiplo > 0) ? selectedProduct.multiplo : 4;
                          return (
                              <div className="p-4 rounded-xl border text-center" style={{ backgroundColor: 'rgba(114, 185, 100, 0.1)', borderColor: 'rgba(114, 185, 100, 0.3)' }}>
                                  <p className="text-gray-500 text-[10px] font-black uppercase mb-1">Venta Semanal Registrada</p>
                                  <p className="text-xl font-black text-red-700" style={{ color: '#72B964' }}>{selectedProduct.ventas_semanal || 0} {selectedProduct?.unidad_venta || 'UND'}</p>
                                  <div className="text-[10px] font-bold mt-2 uppercase tracking-wide border-t pt-2 space-y-1" style={{ borderTopColor: 'rgba(114, 185, 100, 0.2)' }}>
                                      <p className="font-extrabold text-xs text-slate-805">Cantidad recibida: {quantity} {selectedProduct?.unidad_venta || 'UND'}</p>
                                      <p style={{ color: '#72B964' }}>¡Supera el {mult * 100}% de la venta semanal!</p>
                                  </div>
                              </div>
                          );
                      })()}

                      <div className="flex flex-col gap-2 pt-2">
                          <button 
                            onClick={handleSendAlertConfirm}
                            className={`w-full py-4 text-white font-black rounded-xl shadow-lg active:scale-95 transition-all uppercase tracking-tighter cursor-pointer ${
                                alertType !== 'weekly_over_rotation' ? ((alertType === 'rotation' || alertType === 'both') ? "bg-red-600 hover:bg-red-700 hover:shadow-red-200" : (alertType === 'overstock' || alertType === 'tvu_over_100') ? "bg-blue-600 hover:bg-blue-700 hover:shadow-blue-200" : "bg-orange-500 hover:bg-orange-600 hover:shadow-orange-200") : "hover:opacity-90 hover:shadow-lg"
                            }`}
                            style={alertType === 'weekly_over_rotation' ? { backgroundColor: '#72B964' } : undefined}
                          >
                              ENVIAR ALERTA
                          </button>

                          <button 
                            onClick={() => {
                                setShowAlertModal(false);
                                setAuthorizedBy('');
                             }}
                            className="w-full py-3 bg-gray-100 text-gray-500 font-bold rounded-xl hover:bg-gray-200 transition-all uppercase text-xs cursor-pointer"
                          >
                              CANCELAR Y CORREGIR
                          </button>
                      </div>
                  </div>
              </div>
          </div>
      )}

      {/* MODAL: Alert Sent Success Notification */}
      {showAlertSentSuccess && (
          <div className="fixed inset-0 z-[70] bg-black/85 backdrop-blur-md flex justify-center items-center p-4">
              <div className="bg-white rounded-3xl shadow-2xl w-full max-w-sm overflow-hidden animate-in zoom-in-95 duration-200 border-4 border-emerald-500">
                  <div className="bg-emerald-500 p-6 text-white text-center">
                      <CheckCircle className="w-16 h-16 mx-auto mb-2 animate-bounce text-white" />
                      <h2 className="text-xl font-black uppercase tracking-tight leading-none">
                          ¡ALERTA ENVIADA!
                      </h2>
                      <p className="text-[10px] font-black opacity-90 mt-1 uppercase tracking-widest bg-black/20 py-1 px-3 rounded-full inline-block">
                          Panel del Asistente
                      </p>
                  </div>
                  
                  <div className="p-6 text-center space-y-4">
                      <p className="text-sm font-semibold text-slate-600 leading-relaxed">
                          La recepción con observaciones fue registrada como <span className="text-orange-600 font-black">PENDIENTE DE AUTORIZACIÓN</span>. 
                      </p>
                      
                      <button 
                        onClick={() => setShowAlertSentSuccess(false)}
                        className="w-full py-3.5 bg-emerald-600 text-white font-black rounded-xl shadow-md hover:bg-emerald-700 hover:shadow-lg transition-all uppercase tracking-wider text-xs active:scale-95 cursor-pointer"
                      >
                          ENTENDIDO y CONTINUAR
                      </button>
                  </div>
              </div>
          </div>
      )}
    </div>
  );
};

export default Reception;
