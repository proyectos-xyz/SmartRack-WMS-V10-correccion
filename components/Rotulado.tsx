import React, { useState, useMemo, useEffect, useRef } from 'react';
import { Product, InventoryItem, Usuario, MixedItem } from '../types';
import { generateLPN, generateMixedLPN, formatDate } from '../utils';
import { jsPDF } from 'jspdf';
import JsBarcode from 'jsbarcode';
import { supabase } from '../supabaseClient';
import { 
  Printer, 
  Search, 
  Trash2, 
  Package, 
  Layers, 
  PlusCircle, 
  XCircle, 
  CheckCircle, 
  Calendar, 
  Tag, 
  ChevronRight, 
  User, 
  Clock,
  RefreshCw,
  MessageSquare,
  AlertTriangle
} from './Icons';

const MONTH_OPTIONS = [
  { value: '1', label: '01 - ENE' },
  { value: '2', label: '02 - FEB' },
  { value: '3', label: '03 - MAR' },
  { value: '4', label: '04 - ABR' },
  { value: '5', label: '05 - MAY' },
  { value: '6', label: '06 - JUN' },
  { value: '7', label: '07 - JUL' },
  { value: '8', label: '08 - AGO' },
  { value: '9', label: '09 - SEP' },
  { value: '10', label: '10 - OCT' },
  { value: '11', label: '11 - NOV' },
  { value: '12', label: '12 - DIC' },
];

const parseDate = (dateStr: any): Date | null => {
  if (!dateStr) return null;
  if (dateStr instanceof Date) return dateStr;
  if (typeof dateStr !== 'string') return null;
  
  const trimmed = dateStr.trim();
  if (!trimmed || ['ROTO', 'REMAR', 'DESTRUCCION', 'CORTE', 'POR_REVISAR', 'N/A'].includes(trimmed)) return null;

  let exp: Date | null = null;

  // Try YYYY-MM-DD (e.g. "2026-08-10")
  if (/^\d{4}-\d{2}-\d{2}/.test(trimmed)) {
      const parts = trimmed.split(/[- : T]/);
      const year = parseInt(parts[0], 10);
      const month = parseInt(parts[1], 10);
      const day = parseInt(parts[2], 10);
      if (!isNaN(year) && !isNaN(month) && !isNaN(day)) {
          exp = new Date(year, month - 1, day, 12, 0, 0);
      }
  } 
  // Try DD/MM/YYYY
  else if (/^\d{2}\/\d{2}\/\d{4}/.test(trimmed)) {
      const parts = trimmed.split(/[\/ :]/);
      const day = parseInt(parts[0], 10);
      const month = parseInt(parts[1], 10);
      const year = parseInt(parts[2], 10);
      if (!isNaN(year) && !isNaN(month) && !isNaN(day)) {
          exp = new Date(year, month - 1, day, 12, 0, 0);
      }
  }

  return exp;
};

interface RotuladoProps {
  catalog: Product[];
  currentUser: Usuario | null;
  lastSequence: number;
  lastMixedSequence: number;
  onReceive: (item: InventoryItem) => void;
}

// Helper to generate a base64 PNG barcode image for jsPDF
const generateBarcodeDataUrl = (text: string): string => {
  if (!text) return '';
  try {
    const canvas = document.createElement('canvas');
    JsBarcode(canvas, text, {
      format: 'CODE128',
      displayValue: true,
      fontSize: 16,
      fontOptions: 'bold',
      margin: 4,
      height: 50,
      width: 2.2,
      background: '#ffffff',
      lineColor: '#000000',
    });
    return canvas.toDataURL('image/png');
  } catch (err) {
    console.error("Error generating barcode data URL:", err);
    return '';
  }
};

// Component for rendering live barcode on screen in A4 sheet preview
const ProductBarcodePreview: React.FC<{ code: string }> = ({ code }) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    if (canvasRef.current && code) {
      try {
        JsBarcode(canvasRef.current, code, {
          format: 'CODE128',
          displayValue: true,
          fontSize: 12,
          fontOptions: 'bold',
          margin: 3,
          height: 38,
          width: 1.6,
          background: '#ffffff',
          lineColor: '#000000',
        });
      } catch (err) {
        console.error("Error drawing barcode preview:", err);
      }
    }
  }, [code]);

  return <canvas ref={canvasRef} className="max-w-full h-auto mx-auto rounded border border-slate-200 dark:border-slate-700 bg-white" />;
};

interface ProductLabelQueueItem {
  id: string;
  product: Product;
  copies: number;
}

export const Rotulado: React.FC<RotuladoProps> = ({
  catalog,
  currentUser,
  lastSequence,
  lastMixedSequence,
  onReceive
}) => {
  // Active Tab: NUEVO (create LPN label) vs PRODUCTOS_A4 (3 labels per A4 page) vs HISTORICOS
  const [activeTab, setActiveTab] = useState<'NUEVO' | 'PRODUCTOS_A4' | 'HISTORICOS'>('NUEVO');

  // Product Labels (A4 format - 3 per sheet) States
  const [prodLabelMode, setProdLabelMode] = useState<'INDIVIDUAL' | 'MASIVO'>('INDIVIDUAL');
  const [prodSearchTerm, setProdSearchTerm] = useState('');
  const [selectedProdForLabel, setSelectedProdForLabel] = useState<Product | null>(null);
  const [prodLabelCopies, setProdLabelCopies] = useState<number>(3); // Default 3 copies (1 A4 sheet)
  const [prodLabelQueue, setProdLabelQueue] = useState<ProductLabelQueueItem[]>([]);
  const [bulkCodeText, setBulkCodeText] = useState('');
  const [previewPage, setPreviewPage] = useState<number>(1);

  // Search and display list
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);

  // States
  const [isGenerating, setIsGenerating] = useState(false);

  // Form Fields
  const [pallets, setPallets] = useState('');
  const [boxes, setBoxes] = useState('');
  const [units, setUnits] = useState('');
  const [expDay, setExpDay] = useState('');
  const [expMonth, setExpMonth] = useState('');
  const [expYear, setExpYear] = useState('');
  const [expirationDate, setExpirationDate] = useState('');

  // Reception Expiries for validation
  const [receptionExpiries, setReceptionExpiries] = useState<string[]>([]);
  const [isLoadingReceptionExpiries, setIsLoadingReceptionExpiries] = useState(false);

  // Year options for dropdown
  const yearOptions = useMemo(() => {
    const currentYear = new Date().getFullYear();
    return Array.from({ length: 12 }, (_, i) => currentYear - 1 + i);
  }, []);

  // Fetch reception expiration dates for selected product to validate
  useEffect(() => {
    if (!selectedProduct?.codigo) {
      setReceptionExpiries([]);
      return;
    }

    let isMounted = true;
    const fetchReceptionDates = async () => {
      setIsLoadingReceptionExpiries(true);
      try {
        let query = supabase
          .from('recepcion_productos')
          .select('fecha_vencimiento, estado')
          .or(`codigo.eq.${selectedProduct.codigo}${selectedProduct.sku ? `,codigo.eq.${selectedProduct.sku}` : ''}`)
          .neq('estado', 'ELIMINADO');

        if (currentUser?.sede_id) {
          query = query.eq('sede_id', currentUser.sede_id);
        }

        const { data, error } = await query;
        if (!error && data && isMounted) {
          const datesSet = new Set<string>();
          data.forEach((r: any) => {
            if (r.fecha_vencimiento && !['ROTO', 'REMAR', 'DESTRUCCION', 'N/A', 'CORTE', 'POR_REVISAR'].includes(r.fecha_vencimiento)) {
              const parsed = parseDate(r.fecha_vencimiento);
              if (parsed) {
                const y = parsed.getFullYear();
                const m = String(parsed.getMonth() + 1).padStart(2, '0');
                const d = String(parsed.getDate()).padStart(2, '0');
                datesSet.add(`${y}-${m}-${d}`);
              }
            }
          });
          setReceptionExpiries(Array.from(datesSet));
        }
      } catch (err) {
        console.error("Error al consultar recepciones para validación de rotulado:", err);
      } finally {
        if (isMounted) setIsLoadingReceptionExpiries(false);
      }
    };

    fetchReceptionDates();

    return () => {
      isMounted = false;
    };
  }, [selectedProduct, currentUser?.sede_id]);

  // Real-time validation of TVU (>100%) and match with reception dates
  const dateValidation = useMemo(() => {
    if (!selectedProduct || !expirationDate) {
      return {
        isExceededTvu: false,
        tvuPercentage: 0,
        diffDays: 0,
        maxDays: 0,
        isExpired: false,
        notInReception: false,
        formattedDate: ''
      };
    }

    const parsed = parseDate(expirationDate);
    if (!parsed || isNaN(parsed.getTime())) {
      return {
        isExceededTvu: false,
        tvuPercentage: 0,
        diffDays: 0,
        maxDays: 0,
        isExpired: false,
        notInReception: false,
        formattedDate: expirationDate
      };
    }

    const day = String(parsed.getDate()).padStart(2, '0');
    const month = String(parsed.getMonth() + 1).padStart(2, '0');
    const year = parsed.getFullYear();
    const ymd = `${year}-${month}-${day}`;
    const formattedDisplay = `${day}/${month}/${year}`;

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const diffTime = parsed.getTime() - today.getTime();
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    const maxDays = selectedProduct.vida_util_dias || selectedProduct.tvm_dias || 0;

    let isExceededTvu = false;
    let tvuPercentage = 0;
    let isExpired = false;

    if (diffDays < 0) {
      isExpired = true;
    }

    if (maxDays > 0) {
      tvuPercentage = Math.round((diffDays / maxDays) * 100);
      if (diffDays > maxDays) {
        isExceededTvu = true;
      }
    }

    // Validate whether the expiration date entered was ever in reception
    let notInReception = false;
    if (!isExceededTvu && !isExpired && !isLoadingReceptionExpiries) {
      if (!receptionExpiries.includes(ymd)) {
        notInReception = true;
      }
    }

    return {
      isExceededTvu,
      tvuPercentage,
      diffDays,
      maxDays,
      isExpired,
      notInReception,
      formattedDate: formattedDisplay
    };
  }, [selectedProduct, expirationDate, receptionExpiries, isLoadingReceptionExpiries]);

  // Handle dropdown date changes
  const handleDateSelectChange = (day: string, month: string, year: string) => {
    setExpDay(day);
    setExpMonth(month);
    setExpYear(year);

    if (day && month && year) {
      const formattedYmd = `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
      setExpirationDate(formattedYmd);
    } else {
      setExpirationDate('');
    }
  };

  // Draft items list (can hold multiple items, making it implicitly mixed if count > 1)
  const [draftItems, setDraftItems] = useState<MixedItem[]>([]);

  // Generated Label Modal state
  const [generatedLpn, setGeneratedLpn] = useState<InventoryItem | null>(null);
  const [showLabelModal, setShowLabelModal] = useState(false);

  // Historical lists state
  const [historicalRotulos, setHistoricalRotulos] = useState<InventoryItem[]>([]);
  const [isLoadingHist, setIsLoadingHist] = useState(false);
  const [selectedHistoricalLpns, setSelectedHistoricalLpns] = useState<Set<string>>(new Set());
  const [searchHistoryTerm, setSearchHistoryTerm] = useState('');
  const [historyPage, setHistoryPage] = useState(1);
  const itemsPerPage = 20;

  // State for optional pallet comment
  const [palletComment, setPalletComment] = useState('');
  const [showCommentModal, setShowCommentModal] = useState(false);

  // Queue of pending LPNs to be printed, persisted in localStorage
  const [pendingPrintQueue, setPendingPrintQueue] = useState<InventoryItem[]>(() => {
    try {
      const saved = localStorage.getItem('smartwms_pending_lpns');
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

  const [showPrintQueueModal, setShowPrintQueueModal] = useState(false);

  // Sync print queue to localStorage
  React.useEffect(() => {
    try {
      localStorage.setItem('smartwms_pending_lpns', JSON.stringify(pendingPrintQueue));
    } catch (e) {
      console.error("Error saving pending LPNs to localStorage:", e);
    }
  }, [pendingPrintQueue]);

  // Filter catalog based on search for product labels
  const filteredProdsForLabel = useMemo(() => {
    if (prodSearchTerm.trim().length < 2) return [];
    const term = prodSearchTerm.toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "");

    return catalog.filter(p => {
      const codeMatch = p.codigo.toLowerCase().includes(term);
      const skuMatch = p.sku ? p.sku.toLowerCase().includes(term) : false;
      const eanMatch = p.ean_bulto ? p.ean_bulto.toLowerCase().includes(term) : false;
      const nameMatch = p.nombre.toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .includes(term);

      return codeMatch || skuMatch || eanMatch || nameMatch;
    }).slice(0, 15);
  }, [prodSearchTerm, catalog]);

  // Parse bulk pasted text into individual product label queue items
  const parseBulkCodesToQueue = (rawText: string, catalogData: Product[]): ProductLabelQueueItem[] => {
    if (!rawText || !rawText.trim()) return [];

    const catalogMap = new Map<string, Product>();
    catalogData.forEach(p => {
      if (p.codigo) catalogMap.set(p.codigo.trim().toUpperCase(), p);
      if (p.sku) catalogMap.set(p.sku.trim().toUpperCase(), p);
      if (p.ean_bulto) catalogMap.set(p.ean_bulto.trim().toUpperCase(), p);
    });

    const tokens = rawText
      .split(/[\r\n,;\t ]+/)
      .map(t => t.trim().toUpperCase())
      .filter(Boolean);

    const items: ProductLabelQueueItem[] = [];
    tokens.forEach((token, index) => {
      const foundProduct = catalogMap.get(token);
      const product: Product = foundProduct || {
        id: `bulk-${token}-${index}`,
        codigo: token,
        sku: token,
        nombre: token,
        categoria: null,
        marca: null,
        unidad_venta: null,
        unidades_por_caja: 1,
        vida_util_dias: 0,
        requiere_pesaje: false,
        zona_predeterminada: 'SECO',
        es_seco: true,
        es_refrigerado: false,
        es_congelado: false,
        es_peso: false,
        unidad_compra: null,
        factor_unidad: 1,
        factor_inventario: 1,
        tiene_detraccion: false,
        tvm_dias: 0,
        peso_unitario: 0,
        cajas_por_palet: 1,
        usa_control_tara: false,
        peso_tara_caja_std: 0,
        peso_tara_pallet_std: 0
      };

      items.push({
        id: `${token}-${Date.now()}-${index}`,
        product,
        copies: 1 // 1 rotulo por codigo
      });
    });

    return items;
  };

  // Detected bulk codes array
  const bulkCodesDetected = useMemo(() => {
    if (!bulkCodeText.trim()) return [];
    return bulkCodeText
      .split(/[\r\n,;\t ]+/)
      .map(t => t.trim().toUpperCase())
      .filter(Boolean);
  }, [bulkCodeText]);

  // Derived preview product list for live A4 mockup
  const previewProductList = useMemo(() => {
    if (prodLabelQueue.length > 0) {
      const list: Product[] = [];
      prodLabelQueue.forEach(q => {
        for (let i = 0; i < q.copies; i++) {
          list.push(q.product);
        }
      });
      return list;
    }

    if (prodLabelMode === 'MASIVO' && bulkCodeText.trim()) {
      const items = parseBulkCodesToQueue(bulkCodeText, catalog);
      return items.map(i => i.product);
    }

    if (selectedProdForLabel) {
      return Array(prodLabelCopies).fill(selectedProdForLabel);
    }

    return [];
  }, [prodLabelQueue, prodLabelMode, bulkCodeText, catalog, selectedProdForLabel, prodLabelCopies]);

  // Generate and download A4 PDF with 3 product labels per page
  const handlePrintProductLabelsA4 = (customQueue?: ProductLabelQueueItem[]) => {
    const queue = customQueue && customQueue.length > 0 
      ? customQueue 
      : prodLabelQueue.length > 0 
      ? prodLabelQueue 
      : selectedProdForLabel 
      ? [{ id: `${selectedProdForLabel.id}-${Date.now()}`, product: selectedProdForLabel, copies: prodLabelCopies }]
      : [];

    if (queue.length === 0) {
      alert("Seleccione al menos un producto para generar los rótulos A4.");
      return;
    }

    // Flatten label list
    const labelList: Product[] = [];
    queue.forEach(item => {
      for (let i = 0; i < item.copies; i++) {
        labelList.push(item.product);
      }
    });

    if (labelList.length === 0) return;

    const doc = new jsPDF({
      orientation: 'portrait',
      unit: 'mm',
      format: 'a4' // 210 x 297 mm
    });

    const totalLabels = labelList.length;
    const labelsPerPage = 3;

    for (let i = 0; i < totalLabels; i++) {
      const slotOnPage = i % labelsPerPage; // 0, 1, or 2

      if (i > 0 && slotOnPage === 0) {
        doc.addPage();
      }

      const p = labelList[i];
      const codigoIco = p.codigo || p.sku || 'SIN_CODIGO';
      const nombre = p.nombre || 'PRODUCTO SIN NOMBRE';

      // Dimensions (A4 = 210mm x 297mm)
      // Height per label slot = 91mm, Gap = 5mm, Top Margin = 6mm
      const slotHeight = 91;
      const y = 6 + slotOnPage * (slotHeight + 5);

      // Outer Box Frame
      doc.setDrawColor(15, 23, 42); // slate-900
      doc.setLineWidth(1.0);
      doc.rect(8, y, 194, slotHeight);

      // Top Half: NOMBRE DEL PRODUCTO (Extra bold & thick)
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(26);
      doc.setTextColor(0, 0, 0);

      const splitName = doc.splitTextToSize(nombre.toUpperCase(), 182);
      doc.text(splitName.slice(0, 2), 12, y + 18);
      doc.text(splitName.slice(0, 2), 12.3, y + 18); // Micro-offset for extra thickness

      // Horizontal Divider Line inside label
      doc.setLineWidth(0.6);
      doc.setDrawColor(203, 213, 225);
      doc.line(8, y + 42, 202, y + 42);

      // Vertical Divider Line between ICO Code and Barcode
      doc.line(100, y + 42, 100, y + 91);

      // Bottom Left: CÓDIGO ICO (EXTRA BOLD & HUGE)
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(50);
      doc.setTextColor(0, 0, 0);
      doc.text(codigoIco, 12, y + 74);
      doc.text(codigoIco, 12.4, y + 74); // Micro-offset for extra thickness

      // Bottom Right: CÓDIGO DE BARRAS DEL CÓDIGO ICO
      const barcodeDataUrl = generateBarcodeDataUrl(codigoIco);
      if (barcodeDataUrl) {
        try {
          doc.addImage(barcodeDataUrl, 'PNG', 104, y + 46, 92, 38);
        } catch (e) {
          console.error("Error inserting barcode into PDF:", e);
        }
      }
    }

    doc.save(`Rotulos_Productos_A4_${new Date().getTime()}.pdf`);
  };

  // Filter catalog based on search
  const filteredProducts = useMemo(() => {
    if (searchTerm.trim().length < 2) return [];
    const term = searchTerm.toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, ""); // Normalize accents

    return catalog.filter(p => {
      const codeMatch = p.codigo.toLowerCase().includes(term);
      const skuMatch = p.sku ? p.sku.toLowerCase().includes(term) : false;
      const nameMatch = p.nombre.toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .includes(term);

      return codeMatch || skuMatch || nameMatch;
    }).slice(0, 15); // Show top 15 results for easy scroll on mobile
  }, [searchTerm, catalog]);

  // Handle selecting a product
  const handleSelectProduct = (product: Product) => {
    setSelectedProduct(product);
    setSearchTerm('');
    // Prefill with defaults
    setPallets('');
    setBoxes('');
    setUnits('');
    setExpDay('');
    setExpMonth('');
    setExpYear('');
    setExpirationDate('');
  };

  // Convert entered packaging data to total units
  const calculatedTotalUnits = useMemo(() => {
    if (!selectedProduct) return 0;
    const p = parseFloat(pallets) || 0;
    const b = parseFloat(boxes) || 0;
    const u = parseFloat(units) || 0;
    const cpp = selectedProduct.cajas_por_palet || 0;
    const upc = selectedProduct.unidades_por_caja || 1;
    
    const total = (cpp > 0 || upc > 1) ? ((p * cpp * upc) + (b * upc) + u) : u;
    return Math.round(total * 1000) / 1000;
  }, [selectedProduct, pallets, boxes, units]);

  // Handle adding product to draft LPN
  const handleAddProductToDraft = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedProduct) return;
    if (calculatedTotalUnits <= 0) {
      alert("Por favor ingrese una cantidad válida (mayor a 0 unidades).");
      return;
    }
    if (!expDay || !expMonth || !expYear || !expirationDate) {
      alert("La fecha de vencimiento es obligatoria. Por favor seleccione el Día, Mes y Año.");
      return;
    }
    if (dateValidation.isExceededTvu) {
      alert(`No se puede agregar el ítem: La fecha ${dateValidation.formattedDate} supera el 100% del TVU (${dateValidation.diffDays} días restantes vs ${dateValidation.maxDays} días de vida útil máxima).`);
      return;
    }

    const newItem: MixedItem = {
      productId: selectedProduct.id,
      productCode: selectedProduct.codigo,
      productName: selectedProduct.nombre,
      quantity: calculatedTotalUnits,
      pallets: parseFloat(pallets) || 0,
      cajas: parseFloat(boxes) || 0,
      unidades: parseFloat(units) || 0,
      expirationDate: expirationDate,
      unitOfMeasure: selectedProduct.unidad_venta || 'UN',
    };

    // Append directly to the active draft pallet
    setDraftItems(prev => [...prev, newItem]);

    // Reset selection and form
    setSelectedProduct(null);
    setPallets('');
    setBoxes('');
    setUnits('');
    setExpDay('');
    setExpMonth('');
    setExpYear('');
    setExpirationDate('');
  };

  // Remove item from draft
  const handleRemoveDraftItem = (index: number) => {
    setDraftItems(prev => prev.filter((_, i) => i !== index));
  };

  // Handle LPN Generation
  const handleGenerateLPN = async () => {
    if (draftItems.length === 0) {
      alert("Agregue al menos un producto al pallet para poder generar la etiqueta LPN.");
      return;
    }

    setIsGenerating(true);
    let correlative: number | null = null;

    try {
      // Fetch atomic sequential value from database
      const { data, error: rpcError } = await supabase.rpc('get_next_lpn_correlatives', { count_val: 1 });
      if (!rpcError && data) {
        let val: any;
        if (Array.isArray(data)) {
          const row = data[0];
          val = typeof row === 'object' && row !== null ? (row as any).num : row;
        } else {
          val = data;
        }
        if (!isNaN(Number(val))) {
          correlative = Number(val);
        }
      } else if (rpcError) {
        console.error("RPC Error fetching correlative:", rpcError);
      }
    } catch (e) {
      console.error("Exception fetching correlative atomically:", e);
    }

    const nowStr = new Date().toISOString();
    const isMixed = draftItems.length > 1;
    let newLpn = '';
    let finalItem: InventoryItem;

    if (isMixed) {
      // Generate MIX LPN
      const seqVal = correlative !== null ? correlative : lastMixedSequence;
      newLpn = generateMixedLPN(seqVal);
      const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${newLpn}`;
      const totalQty = draftItems.reduce((sum, item) => sum + item.quantity, 0);

      // Expiration date is the most critical/soonest date
      const dates = draftItems.map(i => new Date(i.expirationDate!).getTime());
      const minDate = new Date(Math.min(...dates));
      const minDateStr = minDate.toISOString().split('T')[0];

      finalItem = {
        lpn: newLpn,
        productCode: 'MIXTO',
        productName: 'PALLET MIXTO CONSOLIDADO',
        quantity: totalQty,
        pallets: 0,
        cajas: 0,
        unidades: totalQty,
        unitOfMeasure: 'UN',
        expirationDate: minDateStr,
        receptionDate: nowStr,
        receivedBy: currentUser?.nombre || 'Operador',
        qrCodeUrl: qrUrl,
        isMixed: true,
        mixedItems: draftItems.map(mi => ({
          ...mi,
          lpn: newLpn,
        })),
        generado: true,
        fecha_generado: nowStr,
        usuario_generado: currentUser?.username || 'sistema',
        estado_lpn: 'PENDIENTE',
        location: null,
        tipo: 'GENERADO',
        comentario: palletComment.trim() || undefined,
      };
    } else {
      // Single item LPN
      const seqVal = correlative !== null ? correlative : lastSequence;
      newLpn = generateLPN(seqVal);
      const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${newLpn}`;
      const firstItem = draftItems[0];

      finalItem = {
        lpn: newLpn,
        productId: firstItem.productId,
        productCode: firstItem.productCode,
        productName: firstItem.productName,
        quantity: firstItem.quantity,
        pallets: firstItem.pallets || 0,
        cajas: firstItem.cajas || 0,
        unidades: firstItem.unidades || 0,
        unitOfMeasure: firstItem.unitOfMeasure || 'UN',
        expirationDate: firstItem.expirationDate,
        receptionDate: nowStr,
        receivedBy: currentUser?.nombre || 'Operador',
        qrCodeUrl: qrUrl,
        isMixed: false,
        generado: true,
        fecha_generado: nowStr,
        usuario_generado: currentUser?.username || 'sistema',
        estado_lpn: 'PENDIENTE',
        location: null,
        tipo: 'GENERADO',
        comentario: palletComment.trim() || undefined,
      };
    }

    // Call callback to save in DB and App state
    onReceive(finalItem);

    // Save in pending print queue
    setPendingPrintQueue(prev => [...prev, finalItem]);

    // Set generated label trigger
    setGeneratedLpn(finalItem);
    setShowLabelModal(true);
    setIsGenerating(false);
  };

  // Fetch historical rotulos from Supabase
  const fetchHistoricalRotulos = async () => {
    setIsLoadingHist(true);
    try {
      let query = supabase
        .from('paletas_lpn')
        .select('*')
        .eq('tipo', 'GENERADO')
        .eq('estado', 'ACTIVO')
        .order('fecha_generado', { ascending: false });
        
      if (currentUser?.sede_id) {
        query = query.eq('sede_id', currentUser.sede_id);
      }
      
      const { data, error } = await query;
      if (error) throw error;
      
      if (data && data.length > 0) {
        const mixedLpns = data.filter(r => r.es_mixto).map(r => r.lpn);
        let itemsMap: Record<string, any[]> = {};
        
        if (mixedLpns.length > 0) {
          const { data: itemsData, error: itemsError } = await supabase
            .from('paletas_lpn_items')
            .select('*')
            .in('lpn', mixedLpns);
            
          if (!itemsError && itemsData) {
            itemsData.forEach(it => {
              if (!itemsMap[it.lpn]) itemsMap[it.lpn] = [];
              itemsMap[it.lpn].push({
                productId: it.producto_id,
                productCode: it.codigo,
                productName: it.nombre,
                quantity: it.cantidad,
                pallets: it.pallets,
                cajas: it.cajas,
                unidades: it.unidades,
                expirationDate: it.fecha_vencimiento
              });
            });
          }
        }
        
        const mapped: InventoryItem[] = data.map(r => {
          const matchedProd = catalog.find(p => p.id === r.producto_id);
          return {
            lpn: r.lpn,
            productId: r.producto_id,
            productCode: r.es_mixto ? 'MIXTO' : (matchedProd?.codigo || 'N/A'),
            productName: r.es_mixto ? 'PALLET MIXTO CONSOLIDADO' : (matchedProd?.nombre || 'Desconocido'),
            quantity: r.cantidad_total,
            pallets: r.pallets || 0,
            cajas: r.cajas || 0,
            unidades: r.unidades || 0,
            unitOfMeasure: r.es_mixto ? 'UN' : (matchedProd?.unidad_venta || 'UN'),
            expirationDate: r.fecha_vencimiento_critica,
            receptionDate: r.fecha_recepcion || r.fecha_generado || new Date().toISOString(),
            receivedBy: r.recibido_por || r.usuario_generado || 'Operador',
            qrCodeUrl: r.qr_url || `https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${r.lpn}`,
            isMixed: r.es_mixto || false,
            mixedItems: r.es_mixto ? (itemsMap[r.lpn] || []) : undefined,
            generado: r.generado,
            fecha_generado: r.fecha_generado,
            usuario_generado: r.usuario_generado,
            estado_lpn: r.estado_lpn,
            location: null,
            tipo: r.tipo || 'GENERADO',
            comentario: r.comentario || undefined
          };
        });
        
        setHistoricalRotulos(mapped);
      } else {
        setHistoricalRotulos([]);
      }
    } catch (err) {
      console.error("Error fetching historical rotulos:", err);
    } finally {
      setIsLoadingHist(false);
    }
  };

  // Bulk print function for printed rotulos
  const printBulkLpns = async (itemsList: InventoryItem[]) => {
    if (itemsList.length === 0) return;
    
    const doc = new jsPDF({
        orientation: 'portrait',
        unit: 'mm',
        format: [100, 150]
    });

    const appLogo = localStorage.getItem('smartwms_app_logo');
    const now = new Date();
    let count = 0;

    for (const item of itemsList) {
        if (count > 0) doc.addPage();
        
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
        
        // Product Code (Red Circle - Increased size and thickness)
        doc.setFontSize(40);
        doc.setFont('helvetica', 'bold');
        doc.text(item.productCode, 38, 23);
        
        doc.line(5, 30, 95, 30);

        const hasObs = !!(item.comentario && typeof item.comentario === 'string' && item.comentario.trim());

        // Dynamic spacing and observation printing logic
        if (hasObs && item.comentario) {
            // Print observation in bold and large at the blue circle area (Y=39)
            doc.setFont('helvetica', 'bold');
            doc.setFontSize(36);
            doc.text(item.comentario.toUpperCase().trim(), 50, 42, { align: 'center', maxWidth: 88 });

            // Optimized spacings / reduced padding
            doc.setFontSize(9);
            doc.setFont('helvetica', 'bold');
            doc.text('FECHA DE VENCIMIENTO', 10, 46);
            
            // Slightly smaller QR code to maximize space
            const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${item.lpn}`;
            doc.addImage(qrUrl, 'PNG', 10, 49, 24, 24);

            // Large Expiration Date
            doc.setFontSize(30);
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
            doc.text(expDateFormatted, 45, 67);
            doc.line(45, 69, 90, 69);

            if (item.isMixed && item.mixedItems && item.mixedItems.length > 0) {
                // Reduced padding mixed details
                doc.line(5, 76, 95, 76);

                doc.setFontSize(8.5);
                doc.setFont('helvetica', 'bold');
                doc.text(`PALLET MIXTO - DETALLE DE PRODUCTOS`, 10, 81);
                
                doc.setFontSize(7);
                doc.setFont('helvetica', 'bold');
                doc.text("CÓDIGO", 8, 86);
                doc.text("DESCRIPCIÓN DE PRODUCTO", 26, 86);
                doc.text("CANT", 84, 86);
                doc.line(5, 88, 95, 88);

                let currentY = 92;
                item.mixedItems.forEach((mi: any) => {
                    if (currentY < 132) {
                        doc.setFont('helvetica', 'bold');
                        doc.text(`${mi.productCode || mi.codigo}`, 8, currentY);
                        doc.setFont('helvetica', 'normal');
                        doc.text(`${(mi.productName || mi.nombre || '').toUpperCase().slice(0, 32)}`, 26, currentY);
                        doc.setFont('helvetica', 'bold');
                        doc.text(`${mi.quantity || mi.cantidad}`, 84, currentY);
                        currentY += 4.3;
                    }
                });

                if (item.mixedItems.length > 9) {
                    doc.setFontSize(5.5);
                    doc.setFont('helvetica', 'italic');
                    doc.text(`* Mas ${item.mixedItems.length - 9} items adicionales no mostrados`, 10, 132);
                }

                doc.line(5, 135, 95, 135);
            } else {
                // Reduced padding single item details
                doc.line(5, 76, 95, 76);

                // Description Section (font optimized)
                doc.setFontSize(8.5);
                doc.setFont('helvetica', 'bold');
                doc.text(`DESCRIPCIÓN: ${item.productName.toUpperCase()}`, 10, 82, { maxWidth: 80 });
                
                doc.line(5, 87, 95, 87);

                // Find product in catalog to check units per box (RTU) and get correct U.M. (unidad_venta)
                const matchedProduct = catalog.find(p => p.codigo === item.productCode);
                const uom = matchedProduct?.unidad_venta || item.unitOfMeasure || 'UN';
                const rtu = matchedProduct?.unidades_por_caja || 1;

                // UM and Qty Section
                doc.setFontSize(9.5);
                doc.text(`UM: ${uom}`, 10, 92);
                doc.text(`CANTIDAD: ${item.quantity}`, 40, 92);
                
                doc.line(5, 95, 95, 95);

                let largeQtyStr = `${item.quantity}`;
                let largeUnitStr = `${uom}`;

                if (rtu > 1 && item.quantity >= rtu) {
                    const bxCount = Math.floor(item.quantity / rtu);
                    largeQtyStr = `${bxCount}`;
                    largeUnitStr = 'BX';
                }

                // Large Quantity and UM with adjusted size and baseline
                doc.setFontSize(60);
                doc.setFont('helvetica', 'bold');
                doc.text(largeQtyStr, 15, 124);
                doc.setFontSize(38);
                doc.text(largeUnitStr, 62, 124);
                
                doc.line(55, 95, 55, 135);
                doc.line(5, 135, 95, 135);
            }
        } else {
            // standard layout (when NOT hasObs)
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
                        doc.text(`${mi.productCode || mi.codigo}`, 8, currentY);
                        doc.setFont('helvetica', 'normal');
                        doc.text(`${(mi.productName || mi.nombre || '').toUpperCase().slice(0, 32)}`, 26, currentY);
                        doc.setFont('helvetica', 'bold');
                        doc.text(`${mi.quantity || mi.cantidad}`, 84, currentY);
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
                doc.line(5, 80, 95, 80);

                // Description Section
                doc.setFontSize(9);
                doc.setFont('helvetica', 'bold');
                doc.text(`DESCRIPCIÓN: ${item.productName.toUpperCase()}`, 10, 88, { maxWidth: 80 });
                
                doc.line(5, 95, 95, 95);

                // Find product in catalog to check units per box (RTU) and get correct U.M. (unidad_venta)
                const matchedProduct = catalog.find(p => p.codigo === item.productCode);
                const uom = matchedProduct?.unidad_venta || item.unitOfMeasure || 'UN';
                const rtu = matchedProduct?.unidades_por_caja || 1;

                // UM and Qty Section
                doc.setFontSize(10);
                doc.text(`UM: ${uom}`, 10, 102);
                doc.text(`CANTIDAD: ${item.quantity}`, 40, 102);
                
                doc.line(5, 105, 95, 105);

                let largeQtyStr = `${item.quantity}`;
                let largeUnitStr = `${uom}`;

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
        }

        // Footer: LPN Number
        doc.setFontSize(32);
        doc.setFont('helvetica', 'bold');
        doc.text(item.lpn, 50, 145, { align: 'center' });

        // Metadata Footer
        doc.setFontSize(6);
        doc.setFont('helvetica', 'normal');
        const timeStr = now.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
        const dateStr = now.toLocaleDateString('es-ES');
        doc.text(`Generado por: ${currentUser?.username || 'SISTEMA'} | ${dateStr} ${timeStr}`, 50, 148, { align: 'center' });

        count++;
    }

    doc.save(`LPN_Labels_Rotulado_${new Date().getTime()}.pdf`);
  };

  // Filtered list of historical items for search
  const filteredHistorical = useMemo(() => {
    if (!searchHistoryTerm.trim()) return historicalRotulos;
    const term = searchHistoryTerm.toLowerCase();
    return historicalRotulos.filter(item => 
      item.lpn.toLowerCase().includes(term) ||
      item.productName.toLowerCase().includes(term) ||
      item.productCode.toLowerCase().includes(term) ||
      (item.receivedBy && item.receivedBy.toLowerCase().includes(term)) ||
      (item.usuario_generado && item.usuario_generado.toLowerCase().includes(term)) ||
      (item.mixedItems && item.mixedItems.some(mi => 
        mi.productCode.toLowerCase().includes(term) || mi.productName.toLowerCase().includes(term)
      ))
    );
  }, [searchHistoryTerm, historicalRotulos]);

  // Paginated subsection of filtered history
  const paginatedHistorical = useMemo(() => {
    const startIndex = (historyPage - 1) * itemsPerPage;
    return filteredHistorical.slice(startIndex, startIndex + itemsPerPage);
  }, [filteredHistorical, historyPage]);

  // Reset page and selection when search filter or tab changes
  React.useEffect(() => {
    setHistoryPage(1);
    setSelectedHistoricalLpns(new Set());
  }, [searchHistoryTerm, activeTab]);

  // Fetch when switching to historical view and clear selection
  React.useEffect(() => {
    if (activeTab === 'HISTORICOS') {
      fetchHistoricalRotulos();
      setSelectedHistoricalLpns(new Set());
    }
  }, [activeTab]);

  // Effect to handle the auto-dismiss timer of newly generated label success modal
  React.useEffect(() => {
    if (showLabelModal && generatedLpn) {
      // Clear draft list, modal show states, etc., automatically after 2.5 seconds (2500ms)
      const timer = setTimeout(() => {
        resetAll();
      }, 2500);
      
      return () => clearTimeout(timer);
    }
  }, [showLabelModal, generatedLpn]);

  const printLpnLabel = (item: InventoryItem) => {
    const doc = new jsPDF({
        orientation: 'portrait',
        unit: 'mm',
        format: [100, 150] // Label size
    });

    const appLogo = localStorage.getItem('smartwms_app_logo');
    const now = new Date();

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
    
    // Product Code (instead of hardcoded - Red Circle: Increased size and thickness)
    doc.setFontSize(40);
    doc.setFont('helvetica', 'bold');
    doc.text(item.productCode, 38, 23);
    
    doc.line(5, 30, 95, 30);

    const hasObs = !!(item.comentario && typeof item.comentario === 'string' && item.comentario.trim());

    if (hasObs && item.comentario) {
        // Print observation in bold and large at the blue circle area (Y=42)
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(36);
        doc.text(item.comentario.toUpperCase().trim(), 50, 42, { align: 'center', maxWidth: 88 });

        // Optimized spacings / reduced padding
        doc.setFontSize(9);
        doc.setFont('helvetica', 'bold');
        doc.text('FECHA DE VENCIMIENTO', 10, 46);
        
        // Slightly smaller QR code to maximize space
        const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${item.lpn}`;
        doc.addImage(qrUrl, 'PNG', 10, 49, 24, 24);

        // Large Expiration Date
        doc.setFontSize(30);
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
        doc.text(expDateFormatted, 45, 67);
        doc.line(45, 69, 90, 69);

        if (item.isMixed && item.mixedItems && item.mixedItems.length > 0) {
            // Reduced padding mixed details
            doc.line(5, 76, 95, 76);

            doc.setFontSize(8.5);
            doc.setFont('helvetica', 'bold');
            doc.text(`PALLET MIXTO - DETALLE DE PRODUCTOS`, 10, 81);
            
            doc.setFontSize(7);
            doc.setFont('helvetica', 'bold');
            doc.text("CÓDIGO", 8, 86);
            doc.text("DESCRIPCIÓN DE PRODUCTO", 26, 86);
            doc.text("CANT", 84, 86);
            doc.line(5, 88, 95, 88);

            let currentY = 92;
            item.mixedItems.forEach((mi: any) => {
                if (currentY < 132) {
                    doc.setFont('helvetica', 'bold');
                    doc.text(`${mi.productCode || mi.codigo}`, 8, currentY);
                    doc.setFont('helvetica', 'normal');
                    doc.text(`${(mi.productName || mi.nombre || '').toUpperCase().slice(0, 32)}`, 26, currentY);
                    doc.setFont('helvetica', 'bold');
                    doc.text(`${mi.quantity || mi.cantidad}`, 84, currentY);
                    currentY += 4.3;
                }
            });

            if (item.mixedItems.length > 9) {
                doc.setFontSize(5.5);
                doc.setFont('helvetica', 'italic');
                doc.text(`* Mas ${item.mixedItems.length - 9} items adicionales no mostrados`, 10, 132);
            }

            doc.line(5, 135, 95, 135);
        } else {
            // Reduced padding single item details
            doc.line(5, 76, 95, 76);

            // Description Section (font optimized)
            doc.setFontSize(8.5);
            doc.setFont('helvetica', 'bold');
            doc.text(`DESCRIPCIÓN: ${item.productName.toUpperCase()}`, 10, 82, { maxWidth: 80 });
            
            doc.line(5, 87, 95, 87);

            // Find product in catalog to check units per box (RTU) and get correct U.M. (unidad_venta)
            const matchedProduct = catalog.find(p => p.codigo === item.productCode);
            const uom = matchedProduct?.unidad_venta || item.unitOfMeasure || 'UN';
            const rtu = matchedProduct?.unidades_por_caja || 1;

            // UM and Qty Section
            doc.setFontSize(9.5);
            doc.text(`UM: ${uom}`, 10, 92);
            doc.text(`CANTIDAD: ${item.quantity}`, 40, 92);
            
            doc.line(5, 95, 95, 95);

            let largeQtyStr = `${item.quantity}`;
            let largeUnitStr = `${uom}`;

            if (rtu > 1 && item.quantity >= rtu) {
                const bxCount = Math.floor(item.quantity / rtu);
                largeQtyStr = `${bxCount}`;
                largeUnitStr = 'BX';
            }

            // Large Quantity and UM with adjusted size and baseline
            doc.setFontSize(60);
            doc.setFont('helvetica', 'bold');
            doc.text(largeQtyStr, 15, 124);
            doc.setFontSize(38);
            doc.text(largeUnitStr, 62, 124);
            
            doc.line(55, 95, 55, 135);
            doc.line(5, 135, 95, 135);
        }
    } else {
        // standard layout (when NOT hasObs)
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
                    doc.text(`${mi.productCode || mi.codigo}`, 8, currentY);
                    doc.setFont('helvetica', 'normal');
                    doc.text(`${(mi.productName || mi.nombre || '').toUpperCase().slice(0, 32)}`, 26, currentY);
                    doc.setFont('helvetica', 'bold');
                    doc.text(`${mi.quantity || mi.cantidad}`, 84, currentY);
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
            doc.line(5, 80, 95, 80);

            // Description Section
            doc.setFontSize(9);
            doc.setFont('helvetica', 'bold');
            doc.text(`DESCRIPCIÓN: ${item.productName.toUpperCase()}`, 10, 88, { maxWidth: 80 });
            
            doc.line(5, 95, 95, 95);

            // Find product in catalog to check units per box (RTU) and get correct U.M. (unidad_venta)
            const matchedProduct = catalog.find(p => p.codigo === item.productCode);
            const uom = matchedProduct?.unidad_venta || item.unitOfMeasure || 'UN';
            const rtu = matchedProduct?.unidades_por_caja || 1;

            // UM and Qty Section
            doc.setFontSize(10);
            doc.text(`UM: ${uom}`, 10, 102);
            doc.text(`CANTIDAD: ${item.quantity}`, 40, 102);
            
            doc.line(5, 105, 95, 105);

            let largeQtyStr = `${item.quantity}`;
            let largeUnitStr = `${uom}`;

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
    }

    // Footer: LPN Number
    doc.setFontSize(32);
    doc.setFont('helvetica', 'bold');
    doc.text(item.lpn, 50, 145, { align: 'center' });

    // Metadata Footer (Small)
    doc.setFontSize(6);
    doc.setFont('helvetica', 'normal');
    const timeStr = now.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    const dateStr = now.toLocaleDateString('es-ES');
    const generatorName = item.receivedBy || currentUser?.nombre || currentUser?.username || 'SISTEMA';
    doc.text(`Generado por: ${generatorName} | ${dateStr} ${timeStr}`, 50, 148, { align: 'center' });

    doc.save(`LPN_Label_${item.lpn}.pdf`);
  };

  const resetAll = () => {
    setDraftItems([]);
    setSelectedProduct(null);
    setSearchTerm('');
    setPallets('');
    setBoxes('');
    setUnits('');
    setExpirationDate('');
    setPalletComment('');
    setShowCommentModal(false);
    setShowLabelModal(false);
    setGeneratedLpn(null);
  };
  return (
    <div className="w-full flex-1 flex flex-col bg-slate-50 dark:bg-slate-950 p-1 sm:p-2 selection:bg-[#82BD02]/20 font-sans">
      
      {/* 1. HEADER (Styled elegantly - hyper compact for mobile) */}
      <div className="bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 p-2 rounded-2xl shadow-sm mb-2 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2 shrink-0">
        <div className="flex items-center gap-2">
          <div className="bg-[#82BD02] text-white p-1.5 rounded-xl shadow shrink-0">
            <Tag className="w-4 h-4" />
          </div>
          <div>
            <h1 className="text-xs font-black text-slate-900 dark:text-white uppercase tracking-tight leading-tight">
              {activeTab === 'PRODUCTOS_A4' ? 'Rotulado de Productos (A4)' : 'Rotulado de Pallets'}
            </h1>
          </div>
        </div>

        {/* Tab Selector (Cell-adaptive full-width touch tabs - ultra-compact) */}
        <div className="grid grid-cols-3 bg-slate-100/80 dark:bg-slate-950 p-0.5 rounded-xl border border-slate-200/30 dark:border-slate-800 shadow-inner">
          <button
            type="button"
            onClick={() => {
              setActiveTab('NUEVO');
            }}
            className={`py-1 rounded-lg text-[9px] font-black uppercase tracking-wider transition-all whitespace-nowrap px-2 ${
              activeTab === 'NUEVO'
                ? 'bg-white dark:bg-slate-800 text-[#82BD02] shadow-sm'
                : 'text-slate-450 dark:text-slate-500 hover:text-slate-600'
            }`}
          >
            Pallets (LPN)
          </button>

          <button
            type="button"
            onClick={() => {
              setActiveTab('PRODUCTOS_A4');
            }}
            className={`py-1 rounded-lg text-[9px] font-black uppercase tracking-wider transition-all whitespace-nowrap px-2 ${
              activeTab === 'PRODUCTOS_A4'
                ? 'bg-white dark:bg-slate-800 text-amber-600 dark:text-amber-400 shadow-sm'
                : 'text-slate-450 dark:text-slate-500 hover:text-slate-600'
            }`}
          >
            Rótulos Productos (A4)
          </button>
          
          <button
            type="button"
            onClick={() => {
              setActiveTab('HISTORICOS');
            }}
            className={`py-1 rounded-lg text-[9px] font-black uppercase tracking-wider transition-all whitespace-nowrap px-2 ${
              activeTab === 'HISTORICOS'
                ? 'bg-white dark:bg-slate-800 text-[#009ED6] shadow-sm'
                : 'text-slate-450 dark:text-slate-500 hover:text-slate-600'
            }`}
          >
            Históricos LPN
          </button>
        </div>
      </div>

      {/* 2. BODY CONTENT (Modular Panels) */}
      {activeTab === 'NUEVO' && (
        <div className="w-full flex-1 grid grid-cols-1 md:grid-cols-12 gap-3 min-h-0">
        
        {/* PENDING PRINT QUEUE BANNER */}
        {pendingPrintQueue.length > 0 && (
          <div className="col-span-1 md:col-span-12">
            <button
              onClick={() => setShowPrintQueueModal(true)}
              className="w-full bg-sky-50 dark:bg-[#009ED6]/10 border border-sky-100 dark:border-[#009ED6]/30 p-2.5 rounded-2xl flex items-center justify-between hover:bg-sky-100/50 dark:hover:bg-[#009ED6]/20 transition-all text-left mb-1 animate-in slide-in-from-top-1"
            >
              <div className="flex items-center gap-2">
                <div className="bg-[#009ED6] text-white p-1.5 rounded-xl shadow-sm shrink-0">
                  <Printer className="w-4 h-4" />
                </div>
                <div>
                  <span className="text-[10px] font-black text-sky-700 dark:text-sky-450 uppercase tracking-widest block leading-none">Cola de Impresión</span>
                  <span className="text-[8.5px] font-semibold text-slate-500 dark:text-slate-400 mt-1 block">Hay {pendingPrintQueue.length} LPN(s) pendientes de imprimir</span>
                </div>
              </div>
              <div className="bg-[#009ED6] text-white px-2 py-0.5 rounded-full text-[10px] font-bold">
                {pendingPrintQueue.length}
              </div>
            </button>
          </div>
        )}
        
        {/* COL 1: ENTRY BLOCK (Search and Form) */}
        <div className="col-span-1 md:col-span-6 lg:col-span-5 flex flex-col gap-3">
          {/* PANEL A: PRODUCT SEARCH */}
          {!selectedProduct && (
            <div className="bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 p-3 rounded-2xl shadow-sm flex flex-col shrink-0">
              <h2 className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest mb-1.5 flex items-center gap-1">
                <Search className="w-3.5 h-3.5 text-[#82BD02]" />
                1. Buscar en el Almacén
              </h2>
              
              <div className="relative">
                <input
                  type="text"
                  value={searchTerm}
                  onChange={e => setSearchTerm(e.target.value)}
                  className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-205 dark:border-slate-800 focus:border-[#82BD02] dark:focus:border-[#82BD02]/70 rounded-xl p-2 pl-9 text-[11px] font-extrabold focus:ring-2 focus:ring-[#82BD02]/20 transition-all outline-none text-slate-800 dark:text-white"
                  placeholder="Escriba código SKU o nombre..."
                />
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 w-3.5 h-3.5" />
                {searchTerm && (
                  <button 
                    onClick={() => setSearchTerm('')} 
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 p-0.5"
                  >
                    <XCircle className="w-4 h-4" />
                  </button>
                )}
              </div>

              {/* Results list */}
              {filteredProducts.length > 0 ? (
                <div className="bg-slate-50 dark:bg-slate-950 rounded-xl border border-slate-100 dark:border-slate-800/80 divide-y divide-slate-100 dark:divide-slate-800/80 mt-1.5 overflow-hidden shadow-sm max-h-[160px] overflow-y-auto">
                  {filteredProducts.map(product => (
                    <button
                      key={product.id}
                      onClick={() => handleSelectProduct(product)}
                      className="w-full text-left p-2.5 hover:bg-[#82BD02]/5 dark:hover:bg-[#82BD02]/5 active:bg-[#82BD02]/10 transition-colors flex justify-between items-center group"
                    >
                      <div className="min-w-0 pr-1.5">
                        <div className="font-mono font-black text-[#82BD02] text-[9px] tracking-wider">{product.codigo}</div>
                        <div className="text-[11px] text-slate-800 dark:text-slate-100 font-black truncate">{product.nombre}</div>
                      </div>
                      <ChevronRight className="w-4 h-4 text-slate-350 dark:text-slate-650 group-hover:text-[#82BD02] group-hover:translate-x-0.5 transition-all shrink-0" />
                    </button>
                  ))}
                </div>
              ) : searchTerm.trim().length >= 2 ? (
                <p className="text-center text-[9px] font-black text-red-500 dark:text-red-400 mt-2 uppercase tracking-wider bg-red-50 dark:bg-red-950/20 p-2 rounded-lg border border-red-100 dark:border-red-900/40">Sin coincidencias</p>
              ) : null}
            </div>
          )}

          {/* PANEL B: ACTIVE ENTRY FORM (Shows when product selected) */}
          {selectedProduct && (
            <div className="bg-white dark:bg-slate-900 border-2 border-[#82BD02] dark:border-[#82BD02]/70 p-3 rounded-2xl shadow-md relative animate-in zoom-in-95 duration-100 flex flex-col shrink-0">
              <button
                onClick={() => setSelectedProduct(null)}
                className="absolute top-2.5 right-2.5 bg-slate-100 dark:bg-slate-850 text-slate-500 dark:text-slate-400 hover:text-red-500 p-1 rounded-full transition-colors"
                title="Cancelar"
              >
                <XCircle className="w-4 h-4" />
              </button>

              <div className="mb-2 pr-6">
                <span className="text-[8px] font-mono font-black text-[#82BD02] uppercase tracking-wider">ARTÍCULO SELECCIONADO</span>
                <h3 className="font-extrabold text-slate-905 dark:text-white text-[11px] tracking-tight leading-snug line-clamp-1 mt-0.5">{selectedProduct.nombre}</h3>
                <p className="font-mono text-[9px] font-black text-slate-400">{selectedProduct.codigo}</p>
              </div>

              <form onSubmit={handleAddProductToDraft} className="space-y-2">
                <div className="grid grid-cols-3 gap-1.5">
                  {/* Pallets Input */}
                  <div className="bg-slate-50 dark:bg-slate-950 border border-slate-100 dark:border-slate-800 p-1.5 rounded-lg focus-within:ring-2 focus-within:ring-[#82BD02]/40 transition-all">
                    <label className="text-[7px] font-black text-slate-400 dark:text-slate-500 mb-0.5 block uppercase tracking-wider">Pallets</label>
                    <input
                      type="number"
                      value={pallets}
                      onChange={e => setPallets(e.target.value)}
                      className="w-full bg-transparent text-xs font-black text-slate-900 dark:text-white outline-none border-none p-0 focus:ring-0 leading-tight"
                      placeholder="0"
                      min="0"
                    />
                    <span className="text-[6.5px] text-slate-400 font-semibold block mt-0.5 truncate">CPP: {selectedProduct.cajas_por_palet || 0}</span>
                  </div>

                  {/* Boxes Input */}
                  <div className="bg-slate-50 dark:bg-slate-950 border border-slate-100 dark:border-slate-800 p-1.5 rounded-lg focus-within:ring-2 focus-within:ring-[#82BD02]/40 transition-all">
                    <label className="text-[7px] font-black text-slate-400 dark:text-slate-500 mb-0.5 block uppercase tracking-wider">Cajas</label>
                    <input
                      type="number"
                      value={boxes}
                      onChange={e => setBoxes(e.target.value)}
                      className="w-full bg-transparent text-xs font-black text-slate-900 dark:text-white outline-none border-none p-0 focus:ring-0 leading-tight"
                      placeholder="0"
                      min="0"
                    />
                    <span className="text-[6.5px] text-slate-400 font-semibold block mt-0.5 truncate">UPC: {selectedProduct.unidades_por_caja || 1}</span>
                  </div>

                  {/* Units Input */}
                  <div className="bg-slate-50 dark:bg-slate-950 border border-slate-100 dark:border-slate-800 p-1.5 rounded-lg focus-within:ring-2 focus-within:ring-[#82BD02]/30 transition-all">
                    <label className="text-[7px] font-black text-[#82BD02] mb-0.5 block uppercase tracking-wider">Unidades</label>
                    <input
                      type="number"
                      step="any"
                      value={units}
                      onChange={e => setUnits(e.target.value)}
                      className="w-full bg-transparent text-xs font-black text-slate-900 dark:text-white outline-none border-none p-0 focus:ring-0 leading-tight"
                      placeholder="0"
                      min="0"
                      autoFocus
                    />
                    <span className="text-[6.5px] text-[#82BD02] font-black block mt-0.5 uppercase">Sueltas</span>
                  </div>
                </div>

                {/* Expiration Date Dropdown Selectors */}
                <div className="bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 p-2 rounded-xl space-y-1.5">
                  <div className="flex items-center justify-between">
                    <label className="text-[7.5px] font-black text-red-500 dark:text-red-400 uppercase tracking-wider flex items-center gap-1 shrink-0">
                      <Calendar className="w-3 h-3 stroke-[2.5]" />
                      <span>Vencimiento Lote (Obligatorio)</span>
                    </label>
                    {expirationDate && (
                      <span className="font-mono text-[9px] font-black text-slate-600 dark:text-slate-350">
                        {dateValidation.formattedDate}
                      </span>
                    )}
                  </div>

                  <div className="grid grid-cols-3 gap-1.5">
                    {/* DÍA */}
                    <div>
                      <label className="text-[6.5px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-wider block mb-0.5">Día</label>
                      <select
                        value={expDay}
                        onChange={e => handleDateSelectChange(e.target.value, expMonth, expYear)}
                        className={`w-full bg-white dark:bg-slate-900 border rounded-lg p-1.5 text-xs font-black outline-none transition-all cursor-pointer ${
                          expDay 
                            ? 'text-slate-900 dark:text-white border-slate-300 dark:border-slate-700' 
                            : 'text-slate-400 border-slate-200 dark:border-slate-800'
                        } ${dateValidation.isExceededTvu ? 'border-red-500 ring-1 ring-red-400' : 'focus:ring-2 focus:ring-[#82BD02]'}`}
                        required
                      >
                        <option value="">DÍA</option>
                        {Array.from({ length: 31 }, (_, i) => String(i + 1).padStart(2, '0')).map(d => (
                          <option key={d} value={d}>{d}</option>
                        ))}
                      </select>
                    </div>

                    {/* MES */}
                    <div>
                      <label className="text-[6.5px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-wider block mb-0.5">Mes</label>
                      <select
                        value={expMonth}
                        onChange={e => handleDateSelectChange(expDay, e.target.value, expYear)}
                        className={`w-full bg-white dark:bg-slate-900 border rounded-lg p-1.5 text-xs font-black outline-none transition-all cursor-pointer ${
                          expMonth 
                            ? 'text-slate-900 dark:text-white border-slate-300 dark:border-slate-700' 
                            : 'text-slate-400 border-slate-200 dark:border-slate-800'
                        } ${dateValidation.isExceededTvu ? 'border-red-500 ring-1 ring-red-400' : 'focus:ring-2 focus:ring-[#82BD02]'}`}
                        required
                      >
                        <option value="">MES</option>
                        {MONTH_OPTIONS.map(m => (
                          <option key={m.value} value={m.value}>{m.label}</option>
                        ))}
                      </select>
                    </div>

                    {/* AÑO */}
                    <div>
                      <label className="text-[6.5px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-wider block mb-0.5">Año</label>
                      <select
                        value={expYear}
                        onChange={e => handleDateSelectChange(expDay, expMonth, e.target.value)}
                        className={`w-full bg-white dark:bg-slate-900 border rounded-lg p-1.5 text-xs font-black outline-none transition-all cursor-pointer ${
                          expYear 
                            ? 'text-slate-900 dark:text-white border-slate-300 dark:border-slate-700' 
                            : 'text-slate-400 border-slate-200 dark:border-slate-800'
                        } ${dateValidation.isExceededTvu ? 'border-red-500 ring-1 ring-red-400' : 'focus:ring-2 focus:ring-[#82BD02]'}`}
                        required
                      >
                        <option value="">AÑO</option>
                        {yearOptions.map(y => (
                          <option key={y} value={String(y)}>{y}</option>
                        ))}
                      </select>
                    </div>
                  </div>

                  {/* ALERTA 1: FECHA SUPERA 100% TVU (BLOQUEANTE) */}
                  {dateValidation.isExceededTvu && (
                    <div className="bg-red-50 border-2 border-red-500 text-red-900 p-2.5 rounded-xl text-xs shadow-md flex items-start gap-2 animate-in fade-in duration-200 mt-1.5">
                      <div className="p-1 bg-red-100 text-red-600 rounded-lg shrink-0 mt-0.5">
                        <XCircle className="w-5 h-5 animate-pulse" />
                      </div>
                      <div className="space-y-0.5 flex-1">
                        <p className="font-black uppercase text-red-700 tracking-wide text-[10.5px]">
                          LA FECHA QUE ESTÁ REGISTRANDO NO ES CORRECTA
                        </p>
                        <p className="font-semibold text-red-800 text-[9.5px] leading-tight">
                          La fecha <strong>{dateValidation.formattedDate}</strong> supera el <strong>100% del TVU</strong> ({dateValidation.diffDays} días restantes vs <strong>{dateValidation.maxDays} días</strong> de vida útil máxima - <strong>{dateValidation.tvuPercentage}% TVU</strong>).
                        </p>
                        <p className="text-[8.5px] font-black text-red-600 uppercase tracking-tight">
                          ⛔ No se permite rotular esta fecha. Por favor corrija el día, mes o año.
                        </p>
                      </div>
                    </div>
                  )}

                  {/* ALERTA 2: PRODUCTO VENCIDO */}
                  {dateValidation.isExpired && (
                    <div className="bg-red-50 border border-red-400 text-red-900 p-2 rounded-xl text-xs shadow-sm flex items-start gap-2 animate-in fade-in duration-200 mt-1">
                      <div className="p-1 bg-red-100 text-red-600 rounded-lg shrink-0 mt-0.5">
                        <AlertTriangle className="w-4 h-4 text-red-600" />
                      </div>
                      <div className="space-y-0.5 flex-1">
                        <p className="font-black uppercase text-red-700 tracking-wide text-[10px]">
                          PRODUCTO VENCIDO / CADUCADO
                        </p>
                        <p className="font-medium text-red-800 text-[9px] leading-tight">
                          La fecha <strong>{dateValidation.formattedDate}</strong> ya se encuentra vencida ({Math.abs(dateValidation.diffDays)} días atrás).
                        </p>
                      </div>
                    </div>
                  )}

                  {/* ALERTA 3: FECHA NO INGRESADA POR RECEPCIÓN (AVISO INFORMATIVO) */}
                  {!dateValidation.isExceededTvu && !dateValidation.isExpired && dateValidation.notInReception && expirationDate && (
                    <div className="bg-amber-50 border border-amber-400 text-amber-950 p-2.5 rounded-xl text-xs shadow-sm flex items-start gap-2 animate-in fade-in duration-200 mt-1.5">
                      <div className="p-1 bg-amber-100 text-amber-700 rounded-lg shrink-0 mt-0.5">
                        <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
                      </div>
                      <div className="space-y-0.5 flex-1">
                        <div className="flex items-center justify-between">
                          <p className="font-black uppercase text-amber-800 tracking-wide text-[10px]">
                            ESTA FECHA NO HA SIDO INGRESADA POR RECEPCIÓN
                          </p>
                          <span className="text-[7.5px] font-black uppercase px-1.5 py-0.5 bg-amber-200/70 text-amber-900 rounded-full">
                            Aviso Informativo
                          </span>
                        </div>
                        <p className="font-medium text-amber-900 text-[9.5px] leading-tight">
                          La fecha <strong>{dateValidation.formattedDate}</strong> no coincide con ningún lote registrado previamente en el módulo de Recepción para este producto ({selectedProduct?.codigo}).
                        </p>
                        <p className="text-[8.5px] font-bold text-amber-700">
                          ✓ Se permite rotular si el producto se encuentra físicamente en almacén.
                        </p>
                      </div>
                    </div>
                  )}
                </div>

                {/* Unit Conversion HUD */}
                <div className="bg-amber-50/50 dark:bg-slate-950 border border-dashed border-amber-200 dark:border-slate-800 p-1.5 px-3 rounded-lg flex items-center justify-between text-[9px] font-mono leading-none">
                  <span className="text-slate-500 uppercase font-black">CÁLCULO TOTAL:</span>
                  <span className="font-mono font-black text-[#82BD02] text-xs">
                    {calculatedTotalUnits} {selectedProduct?.unidad_venta || 'UN'}
                  </span>
                </div>

                {/* Buttons */}
                <div className="grid grid-cols-2 gap-1.5 pt-1">
                  <button
                    type="button"
                    onClick={() => setSelectedProduct(null)}
                    className="py-2.5 bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-350 text-[9px] font-black uppercase tracking-wider rounded-xl active:scale-95 transition-all"
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    disabled={dateValidation.isExceededTvu}
                    className={`py-2.5 text-white text-[9px] font-black uppercase tracking-wider rounded-xl active:scale-95 transition-all shadow flex items-center justify-center gap-1 ${
                      dateValidation.isExceededTvu 
                        ? 'bg-slate-300 dark:bg-slate-700 cursor-not-allowed opacity-60 text-slate-500' 
                        : 'bg-[#82BD02] hover:bg-lime-600'
                    }`}
                  >
                    <PlusCircle className="w-3.5 h-3.5" />
                    Agregar Item
                  </button>
                </div>
              </form>
            </div>
          )}
        </div>

        {/* COL 2: PANEL C: ACTIVE ASSEMBLY & STICKER HUD */}
        <div className="col-span-1 md:col-span-6 lg:col-span-7 bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 p-3 rounded-2xl shadow-sm flex flex-col min-h-0">
              <h2 className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest mb-2 flex items-center justify-between shrink-0">
            <span className="flex items-center gap-1">
              <Layers className="w-3.5 h-3.5 text-[#009ED6]" />
              2. ITEMS DEL LPN
              <button
                type="button"
                onClick={() => setShowCommentModal(true)}
                className={`p-1 rounded-lg transition-all active:scale-95 flex items-center justify-center border ${
                  palletComment.trim()
                    ? 'bg-amber-100 text-amber-700 border-amber-200 dark:bg-amber-950/40 dark:text-amber-400 dark:border-amber-900/50'
                    : 'bg-slate-100 dark:bg-slate-800 text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200 border-transparent'
                }`}
                title="Agregar comentario u observación"
              >
                <MessageSquare className="w-3.5 h-3.5" />
              </button>
            </span>
            <span className="text-[8px] font-bold text-slate-400">({draftItems.length})</span>
          </h2>

          {/* List of draft components */}
          <div className="flex-1 overflow-y-auto space-y-1.5 mt-2 min-h-[120px] max-h-[220px] pr-1">
            {draftItems.length === 0 ? (
              <div className="h-24 flex flex-col items-center justify-center bg-slate-50/50 dark:bg-slate-950/10 rounded-xl p-4 text-slate-350 dark:text-slate-600 border border-dashed border-slate-150 dark:border-slate-800">
                <Package className="w-5 h-5 mb-1 opacity-20" />
                <p className="text-[9px] font-extrabold uppercase text-center tracking-wider leading-relaxed">PALLET VACÍO</p>
              </div>
            ) : (
              draftItems.map((item, index) => (
                <div key={`${item.productCode}-${index}`} className="flex items-center gap-2 p-1.5 px-2.5 bg-slate-50 dark:bg-slate-950/40 border border-slate-100 dark:border-slate-850 rounded-xl shadow-sm hover:border-slate-205 dark:hover:border-slate-800 animate-in slide-in-from-bottom-1 duration-150">
                  <div className="flex-1 min-w-0">
                    <div className="flex justify-between items-center mb-0.5 leading-none">
                      <span className="text-[8px] font-mono font-black text-[#009ED6]">{item.productCode}</span>
                      <span className="text-[9px] font-black text-slate-900 dark:text-white px-1.5 py-0.5 rounded bg-white dark:bg-slate-850 border border-slate-100 dark:border-slate-800">
                        {item.quantity} {item.unitOfMeasure || catalog.find(p => p.codigo === item.productCode || p.id === item.productId)?.unidad_venta || 'UN'}
                      </span>
                    </div>
                    <h4 className="text-[9px] font-extrabold text-slate-800 dark:text-slate-100 truncate leading-tight">{item.productName}</h4>
                    <p className="text-[7.5px] font-bold text-red-500 dark:text-red-400 uppercase tracking-wider mt-0.5 flex items-center gap-0.5 leading-none">
                      <Clock className="w-2.5 h-2.5" />
                      <span>Vence: {item.expirationDate}</span>
                    </p>
                  </div>
                  <button
                    onClick={() => handleRemoveDraftItem(index)}
                    className="p-1 px-1.5 bg-white dark:bg-slate-850 text-slate-400 hover:text-red-500 rounded-lg transition-all border border-slate-100 dark:border-slate-800 shrink-0"
                    title="Eliminar"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))
            )}
          </div>

          {/* Observation Field directly on the panel (Aesthetic Integration) */}
          <div className="mt-2.5 bg-slate-50 dark:bg-slate-950 p-2.5 rounded-xl border border-slate-150 dark:border-slate-800/80 shrink-0">
            <label className="text-[8.5px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest block mb-1">
              OBSERVACIÓN (OPCIONAL, SE IMPRIME EN EL RÓTULO):
            </label>
            <input
              type="text"
              value={palletComment}
              onChange={e => setPalletComment(e.target.value)}
              placeholder="Ej: RETENIDO POR CALIDAD..."
              className="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 focus:border-[#82BD02] focus:ring-1 focus:ring-[#82BD02] rounded-lg px-2.5 py-1.5 text-[10px] font-black uppercase text-slate-800 dark:text-white outline-none transition-all"
            />
          </div>

          {/* Action trigger deck */}
          <div className="grid grid-cols-3 gap-1.5 border-t border-slate-100 dark:border-slate-800/80 pt-2.5 mt-2 shrink-0">
            <button
              onClick={() => {
                if (draftItems.length === 0) return;
                if (window.confirm("¿Vaciar pallet?")) {
                  setDraftItems([]);
                }
              }}
              disabled={draftItems.length === 0}
              className={`py-2 text-[9px] font-black uppercase rounded-xl border transition-all ${
                draftItems.length === 0
                  ? 'bg-slate-100 text-slate-400 dark:bg-slate-950/20 dark:text-slate-700 border-transparent cursor-not-allowed select-none'
                  : 'bg-red-50 border-red-100 hover:bg-red-100 hover:border-red-200 text-red-500 dark:bg-red-950/20 dark:border-red-900/55 dark:text-red-400 dark:hover:bg-red-950/40'
              }`}
            >
              Vaciar
            </button>

            <button
              onClick={handleGenerateLPN}
              disabled={isGenerating}
              className="col-span-2 py-2 rounded-xl text-[9.5px] font-black uppercase tracking-wider shadow active:scale-95 transition-all flex items-center justify-center gap-1.5 bg-slate-950 hover:bg-black dark:bg-white dark:text-slate-950 text-white shadow-slate-105"
            >
              <span>{isGenerating ? 'GENERANDO...' : 'GENERAR LPN'}</span>
              <Printer className="w-3.5 h-3.5 shrink-0 text-[#82BD02]" />
            </button>
          </div>

        </div>

      </div>
      )}

      {/* RÓTULOS DE PRODUCTOS (3 POR HOJA A4) VIEW */}
      {activeTab === 'PRODUCTOS_A4' && (
        <div className="w-full flex-1 grid grid-cols-1 lg:grid-cols-12 gap-3 min-h-0 animate-in fade-in duration-100">
          
          {/* LEFT COL: PRODUCT SELECTION & CONTROLS (5 cols) */}
          <div className="lg:col-span-5 flex flex-col gap-3">
            
            {/* MODE TOGGLE: INDIVIDUAL VS MASIVO */}
            <div className="grid grid-cols-2 bg-slate-100 dark:bg-slate-950 p-1 rounded-2xl border border-slate-200/50 dark:border-slate-800 shrink-0">
              <button
                type="button"
                onClick={() => setProdLabelMode('INDIVIDUAL')}
                className={`py-1.5 rounded-xl text-[10px] font-black uppercase tracking-wider transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
                  prodLabelMode === 'INDIVIDUAL'
                    ? 'bg-white dark:bg-slate-800 text-amber-600 dark:text-amber-400 shadow-sm'
                    : 'text-slate-450 dark:text-slate-500 hover:text-slate-600'
                }`}
              >
                <Search className="w-3.5 h-3.5" />
                Búsqueda Individual
              </button>

              <button
                type="button"
                onClick={() => setProdLabelMode('MASIVO')}
                className={`py-1.5 rounded-xl text-[10px] font-black uppercase tracking-wider transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
                  prodLabelMode === 'MASIVO'
                    ? 'bg-white dark:bg-slate-800 text-amber-600 dark:text-amber-400 shadow-sm'
                    : 'text-slate-450 dark:text-slate-500 hover:text-slate-600'
                }`}
              >
                <Layers className="w-3.5 h-3.5" />
                Pegar Lista de Códigos
              </button>
            </div>

            {/* MODE A: BÚSQUEDA INDIVIDUAL */}
            {prodLabelMode === 'INDIVIDUAL' && (
              <>
                {/* PANEL A: SEARCH PRODUCT */}
                <div className="bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 p-3 rounded-2xl shadow-sm flex flex-col shrink-0">
                  <h2 className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest mb-1.5 flex items-center gap-1">
                    <Search className="w-3.5 h-3.5 text-amber-500" />
                    Buscar Producto para Rótulo
                  </h2>
                  
                  <div className="relative">
                    <input
                      type="text"
                      value={prodSearchTerm}
                      onChange={e => setProdSearchTerm(e.target.value)}
                      className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 focus:border-amber-500 dark:focus:border-amber-500/70 rounded-xl p-2.5 pl-9 text-xs font-black focus:ring-2 focus:ring-amber-500/20 transition-all outline-none text-slate-800 dark:text-white"
                      placeholder="Escriba Código ICO, SKU, EAN o nombre..."
                    />
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 w-4 h-4" />
                    {prodSearchTerm && (
                      <button 
                        type="button"
                        onClick={() => setProdSearchTerm('')} 
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 p-0.5"
                      >
                        <XCircle className="w-4 h-4" />
                      </button>
                    )}
                  </div>

                  {/* Matching Products List */}
                  {prodSearchTerm.trim().length >= 2 && (
                    <div className="mt-2 border border-slate-150 dark:border-slate-800 rounded-xl max-h-48 overflow-y-auto divide-y divide-slate-100 dark:divide-slate-800 bg-slate-50/50 dark:bg-slate-950/50">
                      {filteredProdsForLabel.length === 0 ? (
                        <div className="p-3 text-center text-xs text-slate-400 font-medium">
                          No se encontraron productos coincidentes.
                        </div>
                      ) : (
                        filteredProdsForLabel.map(p => (
                          <button
                            key={p.id}
                            type="button"
                            onClick={() => {
                              setSelectedProdForLabel(p);
                              setProdSearchTerm('');
                            }}
                            className="w-full p-2 text-left hover:bg-amber-50/80 dark:hover:bg-amber-950/30 transition-all flex items-center justify-between gap-2 group cursor-pointer"
                          >
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center gap-1.5 mb-0.5">
                                <span className="px-2 py-0.5 bg-amber-100 dark:bg-amber-950 text-amber-900 dark:text-amber-200 rounded text-[9px] font-black font-mono">
                                  ICO: {p.codigo}
                                </span>
                                {p.marca && (
                                  <span className="text-[9px] font-bold text-slate-400 uppercase truncate">
                                    {p.marca}
                                  </span>
                                )}
                              </div>
                              <p className="text-xs font-bold text-slate-800 dark:text-slate-100 truncate group-hover:text-amber-700 dark:group-hover:text-amber-300">
                                {p.nombre}
                              </p>
                            </div>
                            <ChevronRight className="w-4 h-4 text-slate-400 group-hover:text-amber-500 shrink-0" />
                          </button>
                        ))
                      )}
                    </div>
                  )}
                </div>

                {/* PANEL B: SELECTED PRODUCT & PRINT CONTROLS */}
                {selectedProdForLabel ? (
                  <div className="bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 p-3 rounded-2xl shadow-sm flex flex-col gap-3">
                    <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-2">
                      <h3 className="text-[10px] font-black text-amber-600 dark:text-amber-400 uppercase tracking-widest flex items-center gap-1">
                        <Package className="w-3.5 h-3.5" />
                        Producto Seleccionado
                      </h3>
                      <button
                        type="button"
                        onClick={() => setSelectedProdForLabel(null)}
                        className="text-[10px] font-extrabold text-slate-400 hover:text-red-500 transition-all uppercase cursor-pointer"
                      >
                        Cambiar
                      </button>
                    </div>

                    <div className="bg-amber-50/50 dark:bg-amber-950/20 border border-amber-200/60 dark:border-amber-800/40 p-3 rounded-xl space-y-1">
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] font-mono font-black text-amber-900 dark:text-amber-200 bg-amber-200/50 dark:bg-amber-900/50 px-2 py-0.5 rounded">
                          CÓDIGO ICO: {selectedProdForLabel.codigo}
                        </span>
                        {selectedProdForLabel.sku && (
                          <span className="text-[9px] font-mono text-slate-500">
                            SKU: {selectedProdForLabel.sku}
                          </span>
                        )}
                      </div>
                      <h4 className="text-sm font-black text-slate-900 dark:text-white uppercase leading-snug pt-1">
                        {selectedProdForLabel.nombre}
                      </h4>
                      {selectedProdForLabel.marca && (
                        <p className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase">
                          MARCA: {selectedProdForLabel.marca}
                        </p>
                      )}
                    </div>

                    {/* Copies / Page selector */}
                    <div className="space-y-1.5">
                      <label className="text-[10px] font-black text-slate-500 dark:text-slate-400 uppercase tracking-wider block">
                        Cantidad de Rótulos A4 (3 por Hoja):
                      </label>
                      <div className="grid grid-cols-3 gap-1.5">
                        {[3, 6, 9].map(num => (
                          <button
                            key={num}
                            type="button"
                            onClick={() => setProdLabelCopies(num)}
                            className={`py-2 rounded-xl text-xs font-black transition-all cursor-pointer ${
                              prodLabelCopies === num
                                ? 'bg-amber-500 text-white shadow-md shadow-amber-500/20'
                                : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-200'
                            }`}
                          >
                            {num} ({num / 3} {num / 3 === 1 ? 'Hoja' : 'Hojas'})
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Print Direct or Add to Queue buttons */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1">
                      <button
                        type="button"
                        onClick={() => {
                          const item: ProductLabelQueueItem = {
                            id: `${selectedProdForLabel.id}-${Date.now()}`,
                            product: selectedProdForLabel,
                            copies: prodLabelCopies
                          };
                          setProdLabelQueue(prev => [...prev, item]);
                          alert(`Agregado ${prodLabelCopies} rótulos de "${selectedProdForLabel.nombre}" a la lista A4.`);
                        }}
                        className="py-2.5 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 text-slate-800 dark:text-slate-200 rounded-xl text-[10px] font-black uppercase tracking-wider transition-all flex items-center justify-center gap-1.5 cursor-pointer"
                      >
                        <PlusCircle className="w-3.5 h-3.5 text-amber-500" />
                        + Agregar a Lista
                      </button>

                      <button
                        type="button"
                        onClick={() => handlePrintProductLabelsA4()}
                        className="py-2.5 bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600 text-white rounded-xl text-[10px] font-black uppercase tracking-wider shadow-md shadow-amber-500/20 transition-all active:scale-95 flex items-center justify-center gap-1.5 cursor-pointer"
                      >
                        <Printer className="w-4 h-4" />
                        IMPRIMIR HOJA A4
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 p-6 rounded-2xl shadow-sm text-center text-slate-400">
                    <Tag className="w-8 h-8 mx-auto mb-2 opacity-30 text-amber-500" />
                    <p className="text-xs font-bold text-slate-600 dark:text-slate-300">
                      Seleccione un producto en el buscador
                    </p>
                    <p className="text-[10px] text-slate-400 mt-1">
                      Se generará una hoja A4 con 3 rótulos grandes en negrita con Código ICO, Nombre y Código de Barras.
                    </p>
                  </div>
                )}
              </>
            )}

            {/* MODE B: PEGAR LISTA DE CÓDIGOS (MASIVO) */}
            {prodLabelMode === 'MASIVO' && (
              <div className="bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 p-3.5 rounded-2xl shadow-sm flex flex-col gap-3">
                <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-2">
                  <h2 className="text-[10px] font-black text-amber-600 dark:text-amber-400 uppercase tracking-widest flex items-center gap-1.5">
                    <Layers className="w-4 h-4 text-amber-500" />
                    Pegar Lista de Códigos ICO (1 Rótulo por Código)
                  </h2>
                  {bulkCodesDetected.length > 0 && (
                    <span className="text-[9px] font-black font-mono px-2 py-0.5 bg-amber-100 dark:bg-amber-950 text-amber-900 dark:text-amber-200 rounded-md border border-amber-200 dark:border-amber-800">
                      {bulkCodesDetected.length} código(s) • {Math.ceil(bulkCodesDetected.length / 3)} Hoja(s) A4
                    </span>
                  )}
                </div>

                <div>
                  <label className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase block mb-1">
                    Pegue los códigos en la caja de texto (un código por línea):
                  </label>
                  <textarea
                    rows={8}
                    value={bulkCodeText}
                    onChange={e => {
                      setBulkCodeText(e.target.value);
                      setPreviewPage(1);
                    }}
                    placeholder={`ACA001\nACA002\nADP001\nADP002\nADP003\nADP004\nADP005\nADP006\nADP007\nADP008`}
                    className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 focus:border-amber-500 dark:focus:border-amber-500/70 rounded-xl p-3 text-xs font-mono font-bold focus:ring-2 focus:ring-amber-500/20 transition-all outline-none text-slate-800 dark:text-white leading-relaxed resize-y"
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      const newItems = parseBulkCodesToQueue(bulkCodeText, catalog);
                      if (newItems.length === 0) {
                        alert("Pegue al menos un código válido en el recuadro.");
                        return;
                      }
                      setProdLabelQueue(prev => [...prev, ...newItems]);
                      setBulkCodeText('');
                      alert(`Se agregaron ${newItems.length} rótulo(s) de productos a la cola A4 (1 rótulo por código).`);
                    }}
                    disabled={bulkCodesDetected.length === 0}
                    className="py-2.5 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 text-slate-800 dark:text-slate-200 disabled:opacity-40 rounded-xl text-[10px] font-black uppercase tracking-wider transition-all flex items-center justify-center gap-1.5 cursor-pointer"
                  >
                    <PlusCircle className="w-3.5 h-3.5 text-amber-500" />
                    + Cargar a Lista A4
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      const newItems = parseBulkCodesToQueue(bulkCodeText, catalog);
                      if (newItems.length === 0) {
                        alert("Pegue al menos un código válido en el recuadro.");
                        return;
                      }
                      handlePrintProductLabelsA4(newItems);
                    }}
                    disabled={bulkCodesDetected.length === 0}
                    className="py-2.5 bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600 disabled:opacity-40 text-white rounded-xl text-[10px] font-black uppercase tracking-wider shadow-md shadow-amber-500/20 transition-all active:scale-95 flex items-center justify-center gap-1.5 cursor-pointer"
                  >
                    <Printer className="w-4 h-4" />
                    IMPRIMIR HOJAS A4 ({bulkCodesDetected.length})
                  </button>
                </div>
              </div>
            )}

            {/* PANEL C: PRODUCT LABELS QUEUE (IF ANY) */}
            {prodLabelQueue.length > 0 && (
              <div className="bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 p-3 rounded-2xl shadow-sm space-y-2">
                <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-1.5">
                  <span className="text-[10px] font-black text-slate-700 dark:text-slate-300 uppercase tracking-widest flex items-center gap-1">
                    <Layers className="w-3.5 h-3.5 text-amber-500" />
                    Lista de Impresión A4 ({prodLabelQueue.reduce((acc, q) => acc + q.copies, 0)} Rótulos)
                  </span>
                  <button
                    type="button"
                    onClick={() => setProdLabelQueue([])}
                    className="text-[9px] font-bold text-red-500 hover:underline cursor-pointer"
                  >
                    Vaciar Lista
                  </button>
                </div>

                <div className="space-y-1.5 max-h-36 overflow-y-auto pr-1">
                  {prodLabelQueue.map((item, idx) => (
                    <div key={item.id} className="flex items-center justify-between p-2 bg-slate-50 dark:bg-slate-950 rounded-xl text-xs border border-slate-100 dark:border-slate-800">
                      <div className="min-w-0 flex-1">
                        <span className="font-mono text-[9px] font-black text-amber-600 block">
                          ICO: {item.product.codigo}
                        </span>
                        <p className="font-bold text-slate-800 dark:text-slate-200 truncate text-[11px]">
                          {item.product.nombre}
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="px-2 py-0.5 bg-amber-100 dark:bg-amber-950 text-amber-900 dark:text-amber-200 text-[10px] font-black rounded-lg">
                          {item.copies} rótulo(s)
                        </span>
                        <button
                          type="button"
                          onClick={() => setProdLabelQueue(prev => prev.filter((_, i) => i !== idx))}
                          className="text-slate-400 hover:text-red-500 p-1 cursor-pointer"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>

                <button
                  type="button"
                  onClick={() => handlePrintProductLabelsA4(prodLabelQueue)}
                  className="w-full py-2.5 bg-amber-500 hover:bg-amber-600 text-white rounded-xl text-[10px] font-black uppercase tracking-wider shadow transition-all flex items-center justify-center gap-1.5 cursor-pointer"
                >
                  <Printer className="w-4 h-4" />
                  IMPRIMIR COLA A4 COMPLETA
                </button>
              </div>
            )}

          </div>

          {/* RIGHT COL: A4 SHEET LIVE PREVIEW (7 cols) */}
          <div className="lg:col-span-7 bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 p-3 sm:p-4 rounded-2xl shadow-sm flex flex-col items-center justify-start min-h-0">
            <div className="w-full flex items-center justify-between mb-2 border-b border-slate-100 dark:border-slate-800 pb-2">
              <span className="text-[10px] font-black text-slate-600 dark:text-slate-300 uppercase tracking-widest flex items-center gap-1.5">
                <Printer className="w-4 h-4 text-amber-500" />
                VISTA PREVIA HOJA A4 (3 RÓTULOS POR HOJA)
              </span>
              <span className="text-[9px] font-bold text-amber-700 bg-amber-50 dark:bg-amber-950/60 dark:text-amber-300 border border-amber-200 dark:border-amber-800 px-2 py-0.5 rounded-full">
                {previewProductList.length} Rótulo(s) ({Math.max(1, Math.ceil(previewProductList.length / 3))} Hoja(s) A4)
              </span>
            </div>

            {/* Page Navigation if multiple pages */}
            {Math.ceil(previewProductList.length / 3) > 1 && (
              <div className="w-full flex items-center justify-between bg-amber-50/60 dark:bg-amber-950/30 p-1.5 px-3 rounded-xl border border-amber-200/50 dark:border-amber-800/40 mb-2">
                <button
                  type="button"
                  onClick={() => setPreviewPage(p => Math.max(1, p - 1))}
                  disabled={previewPage <= 1}
                  className="px-2.5 py-1 bg-white dark:bg-slate-800 disabled:opacity-40 rounded-lg text-[10px] font-black uppercase text-amber-800 dark:text-amber-300 shadow-sm"
                >
                  &larr; Anterior
                </button>
                <span className="text-[10px] font-black text-amber-900 dark:text-amber-200 font-mono">
                  HOJA {previewPage} DE {Math.ceil(previewProductList.length / 3)}
                </span>
                <button
                  type="button"
                  onClick={() => setPreviewPage(p => Math.min(Math.ceil(previewProductList.length / 3), p + 1))}
                  disabled={previewPage >= Math.ceil(previewProductList.length / 3)}
                  className="px-2.5 py-1 bg-white dark:bg-slate-800 disabled:opacity-40 rounded-lg text-[10px] font-black uppercase text-amber-800 dark:text-amber-300 shadow-sm"
                >
                  Siguiente &rarr;
                </button>
              </div>
            )}

            {/* A4 Sheet Container Mockup */}
            <div className="w-full max-w-md bg-white dark:bg-slate-950 border-2 border-slate-300 dark:border-slate-700 rounded-2xl p-3 shadow-xl space-y-2.5">
              
              {/* Slot 1, Slot 2, Slot 3 */}
              {[0, 1, 2].map(slotIndex => {
                const itemIndex = (previewPage - 1) * 3 + slotIndex;
                const targetProduct = previewProductList[itemIndex] || (itemIndex === 0 ? selectedProdForLabel : null);
                
                const codeIco = targetProduct ? targetProduct.codigo : 'ACA001';
                const nameProd = targetProduct ? targetProduct.nombre : 'PRODUCTO DE EJEMPLO RÓTULO A4';

                if (!targetProduct && previewProductList.length > 0) {
                  return (
                    <div key={slotIndex} className="border-2 border-dashed border-slate-200 dark:border-slate-800 rounded-xl p-4 text-center text-[10px] font-bold text-slate-400 bg-slate-50/50 dark:bg-slate-900/30">
                      [ Espacio Libre en Hoja A4 ]
                    </div>
                  );
                }

                return (
                  <div key={slotIndex} className="border-2 border-slate-900 dark:border-slate-600 rounded-xl overflow-hidden bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-sm p-3 space-y-2">
                    {/* Product Name (EXTRA BOLD / THICK) */}
                    <div className="border-b border-slate-200 dark:border-slate-800 pb-2">
                      <h3 className="text-lg sm:text-xl font-[900] uppercase text-black dark:text-white leading-snug tracking-tight line-clamp-2">
                        {nameProd}
                      </h3>
                    </div>

                    {/* Code & Barcode split (NO text labels) */}
                    <div className="grid grid-cols-2 divide-x divide-slate-200 dark:divide-slate-800 items-center pt-1">
                      {/* Left: Huge bold ICO Code */}
                      <div className="pr-2">
                        <span className="text-4xl sm:text-5xl font-[900] text-black dark:text-white font-mono tracking-wider block">
                          {codeIco}
                        </span>
                      </div>

                      {/* Right: Barcode preview */}
                      <div className="pl-2 text-center">
                        <ProductBarcodePreview code={codeIco} />
                      </div>
                    </div>
                  </div>
                );
              })}

            </div>

            <div className="mt-3 text-center">
              <button
                type="button"
                onClick={() => {
                  if (prodLabelMode === 'MASIVO' && bulkCodeText.trim() && prodLabelQueue.length === 0) {
                    const newItems = parseBulkCodesToQueue(bulkCodeText, catalog);
                    if (newItems.length > 0) {
                      handlePrintProductLabelsA4(newItems);
                      return;
                    }
                  }
                  handlePrintProductLabelsA4();
                }}
                className="px-6 py-2.5 bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600 text-white text-xs font-black uppercase tracking-wider rounded-xl shadow-lg shadow-amber-500/20 transition-all active:scale-95 flex items-center gap-2 mx-auto cursor-pointer"
              >
                <Printer className="w-4 h-4" />
                <span>DESCARGAR / IMPRIMIR HOJAS A4 ({previewProductList.length || 3} RÓTULOS)</span>
              </button>
            </div>

          </div>

        </div>
      )}
      {activeTab === 'HISTORICOS' && (
        <div className="bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 p-3 rounded-2xl shadow-sm flex flex-col flex-1 min-h-0 animate-in fade-in duration-100">
          
          {/* Search and Action Bar */}
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2.5 mb-3 shrink-0">
            <div className="relative flex-1">
              <input
                type="text"
                value={searchHistoryTerm}
                onChange={e => setSearchHistoryTerm(e.target.value)}
                className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 focus:border-[#009ED6] rounded-xl p-2 pl-9 text-[11px] font-extrabold focus:ring-2 focus:ring-[#009ED6]/20 transition-all outline-none text-slate-800 dark:text-white"
                placeholder="Buscar por LPN, código, descripción..."
              />
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 w-3.5 h-3.5" />
              {searchHistoryTerm && (
                <button 
                  onClick={() => setSearchHistoryTerm('')} 
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 p-0.5"
                >
                  <XCircle className="w-4 h-4" />
                </button>
              )}
            </div>
            
            <div className="flex items-center gap-2 justify-between sm:justify-end">
              {selectedHistoricalLpns.size > 0 && (
                <button
                  onClick={() => {
                    const selectedItems = historicalRotulos.filter(item => selectedHistoricalLpns.has(item.lpn));
                    printBulkLpns(selectedItems);
                  }}
                  className="px-3.5 py-2 bg-slate-950 dark:bg-slate-100 hover:bg-neutral-900 dark:hover:bg-neutral-200 text-white dark:text-slate-950 font-black text-[10px] uppercase tracking-widest rounded-xl transition-all active:scale-95 flex items-center gap-2 shadow-sm cursor-pointer"
                >
                  <Printer className="w-3.5 h-3.5 text-[#82BD02]" />
                  <span>Imprimir Selección ({selectedHistoricalLpns.size})</span>
                </button>
              )}
              <button
                onClick={fetchHistoricalRotulos}
                disabled={isLoadingHist}
                className="p-2.5 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 text-slate-600 dark:text-slate-200 rounded-xl transition-all active:scale-95 flex items-center justify-center cursor-pointer"
                title="Refrescar lista"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${isLoadingHist ? 'animate-spin' : ''}`} />
              </button>
            </div>
          </div>
          
          {/* List content - Contenedor con scroll vertical y alto fijo garantizado */}
          <div className="h-[480px] sm:h-[580px] overflow-y-auto bg-slate-50/50 dark:bg-slate-950/20 rounded-xl border border-slate-100 dark:border-slate-800/85 p-3 space-y-2.5">
            {isLoadingHist ? (
              <div className="flex flex-col items-center justify-center py-12 text-slate-400 animate-in fade-in">
                <RefreshCw className="w-8 h-8 animate-spin mb-2 text-[#009ED6]" />
                <span className="text-[10px] font-black uppercase tracking-widest">Cargando Históricos...</span>
              </div>
            ) : filteredHistorical.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 text-slate-350 dark:text-slate-600 animate-in fade-in">
                <Package className="w-10 h-10 mb-2 opacity-20" />
                <span className="text-[10px] font-black uppercase tracking-widest text-center text-slate-400">No se encontraron rótulos generados</span>
              </div>
            ) : (
              paginatedHistorical.map(item => {
                const isSelected = selectedHistoricalLpns.has(item.lpn);
                return (
                  <div
                    key={item.lpn}
                    className={`p-4 bg-white dark:bg-slate-900 border rounded-2xl shadow-sm hover:shadow-md transition-all relative flex flex-col lg:flex-row lg:items-center justify-between gap-4 cursor-pointer ${
                      isSelected 
                        ? 'border-[#009ED6] ring-1 ring-[#009ED6]/30 bg-blue-50/10 dark:bg-[#009ED6]/5' 
                        : 'border-slate-150 dark:border-slate-800 hover:border-slate-350 dark:hover:border-slate-700'
                    }`}
                    onClick={() => {
                      const newSet = new Set(selectedHistoricalLpns);
                      if (newSet.has(item.lpn)) newSet.delete(item.lpn);
                      else newSet.add(item.lpn);
                      setSelectedHistoricalLpns(newSet);
                    }}
                  >
                    {/* Left Column: Checkbox and info */}
                    <div className="flex items-start gap-3.5 min-w-0 flex-1">
                      <div className="pt-1 select-none shrink-0" onClick={e => e.stopPropagation()}>
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => {
                            const newSet = new Set(selectedHistoricalLpns);
                            if (newSet.has(item.lpn)) newSet.delete(item.lpn);
                            else newSet.add(item.lpn);
                            setSelectedHistoricalLpns(newSet);
                          }}
                          className="w-4.5 h-4.5 text-[#009ED6] focus:ring-[#009ED6] border-slate-300 dark:border-slate-700 rounded-lg cursor-pointer"
                        />
                      </div>

                      {/* Information panel */}
                      <div className="min-w-0 flex-1">
                      {/* Row 1: Monospace LPN & productCode and type badges */}
                      <div className="flex flex-wrap items-center gap-2 mb-2">
                        <span className="font-mono font-black text-xs text-[#009ED6] tracking-wider bg-blue-50/50 dark:bg-[#009ED6]/10 px-2.5 py-1 rounded-lg border border-[#009ED6]/20">
                          LPN: {item.lpn}
                        </span>
                        
                        <span className="font-mono font-black text-xs text-indigo-700 bg-indigo-50 dark:bg-indigo-950 dark:text-indigo-400 px-2.5 py-1 rounded-lg border border-indigo-150 dark:border-indigo-900/50 uppercase">
                          CÓD_ICO: {item.productCode}
                        </span>

                        {item.isMixed ? (
                          <span className="text-[9px] font-black bg-purple-100 text-purple-700 dark:bg-purple-950 dark:text-purple-400 px-2 py-1 rounded-lg border border-purple-200 dark:border-purple-900/50 uppercase leading-none">
                            MIXTO
                          </span>
                        ) : (
                          <span className="text-[9px] font-black bg-[#82BD02]/10 text-lime-700 dark:bg-lime-950 dark:text-lime-400 px-2 py-1 rounded-lg border border-lime-200 dark:border-lime-900/50 uppercase leading-none">
                            UNITARIO
                          </span>
                        )}
                      </div>
                      
                      {/* Row 2: Product Name */}
                      <h4 className="text-[13px] font-extrabold text-slate-900 dark:text-white leading-normal mb-3 font-sans">
                        {item.productName}
                      </h4>
                      
                      {/* Mixed items display if applicable */}
                      {item.isMixed && item.mixedItems && item.mixedItems.length > 0 && (
                        <div className="mb-3 flex flex-wrap gap-1 bg-slate-50 dark:bg-slate-950 p-2 rounded-xl border border-slate-100 dark:border-slate-800">
                          {item.mixedItems.map((mi, idx) => (
                            <span key={idx} className="text-[8px] font-semibold bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300 px-2 py-1 rounded-lg border border-slate-200 dark:border-slate-800">
                              {mi.productCode}: <b className="font-black text-slate-900 dark:text-white">{mi.quantity} {mi.unitOfMeasure || catalog.find(p => p.codigo === mi.productCode || p.id === mi.productId)?.unidad_venta || 'UN'}</b>
                            </span>
                          ))}
                        </div>
                      )}
                      
                      {/* Display LPN comment if present */}
                      {item.comentario && (
                        <div className="mb-3 flex items-center gap-1.5 text-[8px] font-black uppercase text-amber-600 dark:text-amber-400 bg-amber-500/10 dark:bg-amber-500/15 border border-amber-200/50 dark:border-amber-900/40 px-2.5 py-1 rounded-lg w-fit leading-none shrink-0">
                          <span className="h-1.5 w-1.5 rounded-full bg-amber-500 animate-pulse" />
                          <span>OBSERVACIONES: {item.comentario}</span>
                        </div>
                      )}
                      
                      {/* Grid with main attributes structured professionally for high clarity */}
                      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-2">
                        {/* Cantidad */}
                        <div className="bg-emerald-50 dark:bg-emerald-950/20 border border-emerald-250 dark:border-emerald-900/40 p-2 rounded-xl flex items-center gap-2">
                          <Package className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
                          <div className="min-w-0">
                            <span className="block text-[8px] font-black uppercase text-emerald-600 dark:text-emerald-500 tracking-wider font-mono">CANTIDAD TOTAL</span>
                            <span className="block text-xs font-black text-emerald-800 dark:text-emerald-300 leading-none mt-0.5">{item.quantity} {item.unitOfMeasure || 'UN'}</span>
                          </div>
                        </div>

                        {/* Fecha de Vencimiento */}
                        <div className="bg-amber-50 dark:bg-amber-950/20 border border-amber-250 dark:border-amber-900/40 p-2 rounded-xl flex items-center gap-2">
                          <Calendar className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0" />
                          <div className="min-w-0">
                            <span className="block text-[8px] font-black uppercase text-amber-600 dark:text-amber-500 tracking-wider font-mono">VENCIMIENTO</span>
                            <span className="block text-xs font-black text-amber-800 dark:text-amber-300 leading-none mt-0.5">
                              {item.expirationDate ? formatDate(item.expirationDate) : 'N/A'}
                            </span>
                          </div>
                        </div>

                        {/* Usuario Generador */}
                        <div className="bg-slate-50 dark:bg-slate-800/30 border border-slate-200 dark:border-slate-800 p-2 rounded-xl flex items-center gap-2">
                          <User className="w-4 h-4 text-slate-500 dark:text-slate-400 shrink-0" />
                          <div className="min-w-0">
                            <span className="block text-[8px] font-black uppercase text-slate-500 dark:text-slate-450 tracking-wider font-mono">USUARIO REGISTRO</span>
                            <span className="block text-xs font-bold text-slate-700 dark:text-slate-300 truncate leading-none mt-0.5">{item.receivedBy}</span>
                          </div>
                        </div>

                        {/* Fecha/Hora Creación */}
                        <div className="bg-slate-50 dark:bg-slate-800/30 border border-slate-200 dark:border-slate-800 p-2 rounded-xl flex items-center gap-2">
                          <Clock className="w-4 h-4 text-slate-500 dark:text-slate-400 shrink-0" />
                          <div className="min-w-0">
                            <span className="block text-[8px] font-black uppercase text-slate-500 dark:text-slate-450 tracking-wider font-mono">FECHA/HORA GENERADA</span>
                            <span className="block text-xs font-bold text-slate-700 dark:text-slate-300 leading-none mt-0.5">
                              {new Date(item.receptionDate).toLocaleString('es-ES', { dateStyle: 'short', timeStyle: 'short' })}
                            </span>
                          </div>
                        </div>
                      </div>
                    </div>
                    </div>
                    
                    {/* Action Panel - Pure instant single print */}
                    <div 
                      className="flex items-center justify-end lg:pt-0 pt-2 border-t lg:border-t-0 border-slate-100 dark:border-slate-800 shrink-0"
                    >
                      <button
                        onClick={() => printLpnLabel(item)}
                        className="w-full lg:w-auto px-4 py-3 bg-[#82BD02] hover:bg-lime-600 text-white font-black text-[11px] uppercase tracking-widest rounded-xl transition-all active:scale-95 flex items-center justify-center gap-2 shadow-md hover:shadow-lg cursor-pointer"
                        title="Reimprimir etiqueta individual"
                      >
                        <Printer className="w-4 h-4" />
                        <span>IMPRIMIR</span>
                      </button>
                    </div>
                    
                  </div>
                );
              })
            )}
          </div>

          {/* Pagination Controls */}
          {filteredHistorical.length > 0 && (
            <div className="flex flex-col sm:flex-row items-center justify-between gap-2 pt-2 border-t border-slate-100 dark:border-slate-800 shrink-0 select-none">
              <span className="text-[10px] font-black text-slate-450 dark:text-slate-500 uppercase tracking-wider">
                Mostrando {Math.min(filteredHistorical.length, (historyPage - 1) * itemsPerPage + 1)} - {Math.min(filteredHistorical.length, historyPage * itemsPerPage)} de {filteredHistorical.length} registros
              </span>
              
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => setHistoryPage(prev => Math.max(1, prev - 1))}
                  disabled={historyPage === 1}
                  className="px-2.5 py-1.5 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-750 text-slate-700 dark:text-slate-300 rounded-lg text-[9px] font-black uppercase transition-all disabled:opacity-40 disabled:cursor-not-allowed select-none active:scale-95 leading-none"
                >
                  Anterior
                </button>
                
                {Array.from({ length: Math.ceil(filteredHistorical.length / itemsPerPage) }).map((_, i) => {
                  const pageNum = i + 1;
                  const totalPages = Math.ceil(filteredHistorical.length / itemsPerPage);
                  
                  if (
                    pageNum === 1 || 
                    pageNum === totalPages || 
                    Math.abs(pageNum - historyPage) <= 1
                  ) {
                    return (
                      <button
                        key={pageNum}
                        type="button"
                        onClick={() => setHistoryPage(pageNum)}
                        className={`w-7 h-7 rounded-lg text-[9px] font-black transition-all ${
                          historyPage === pageNum 
                            ? 'bg-[#009ED6] text-white shadow-sm shadow-[#009ED6]/30' 
                            : 'bg-slate-100 dark:bg-slate-800 text-slate-450 dark:text-slate-500 hover:bg-slate-200 dark:hover:bg-slate-700'
                        }`}
                      >
                        {pageNum}
                      </button>
                    );
                  }
                  
                  if (
                    (pageNum === 2 && historyPage > 3) ||
                    (pageNum === totalPages - 1 && historyPage < totalPages - 2)
                  ) {
                    return (
                      <span key={pageNum} className="text-[9px] font-black text-slate-400 px-1 select-none">
                        ...
                      </span>
                    );
                  }
                  
                  return null;
                })}

                <button
                  type="button"
                  onClick={() => setHistoryPage(prev => Math.min(Math.ceil(filteredHistorical.length / itemsPerPage), prev + 1))}
                  disabled={historyPage === Math.ceil(filteredHistorical.length / itemsPerPage)}
                  className="px-2.5 py-1.5 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-750 text-slate-700 dark:text-slate-300 rounded-lg text-[9px] font-black uppercase transition-all disabled:opacity-40 disabled:cursor-not-allowed select-none active:scale-95 leading-none"
                >
                  Siguiente
                </button>
              </div>
            </div>
          )}
        </div>
      )}
          
              {/* 4. COMMENT MODAL POPUP */}
      {showCommentModal && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-200">
          <div className="bg-white dark:bg-slate-900 rounded-3xl w-full max-w-sm overflow-hidden shadow-2xl p-5 border border-slate-100 dark:border-slate-850 animate-in zoom-in-95 duration-150 space-y-3 flex flex-col">
            
            <div className="flex items-center justify-between pb-2 border-b border-slate-100 dark:border-slate-800 shrink-0">
              <span className="text-[10px] font-black uppercase text-amber-600 dark:text-amber-450 flex items-center gap-1.5">
                <MessageSquare className="w-4 h-4 text-amber-500" />
                Comentario u Observación
              </span>
              {palletComment && (
                <button
                  type="button"
                  onClick={() => setPalletComment('')}
                  className="text-[8.5px] font-black uppercase text-red-500 hover:underline"
                >
                  Limpiar
                </button>
              )}
            </div>
            
            <div className="space-y-1">
              <label className="text-[8.5px] font-black text-slate-400 dark:text-slate-550 uppercase tracking-wide block">Observación para el rótulo:</label>
              <textarea
                value={palletComment}
                onChange={e => setPalletComment(e.target.value)}
                placeholder="ej: RETENIDO POR CALIDAD..."
                className="w-full h-24 bg-slate-50 dark:bg-slate-950 border border-slate-205 dark:border-slate-800 rounded-xl p-2.5 text-[11px] font-extrabold text-slate-800 dark:text-white placeholder-slate-400 outline-none focus:ring-2 focus:ring-[#82BD02]/30 transition-all leading-normal resize-none"
              />
            </div>
            
            <div className="space-y-1 shrink-0">
              <span className="text-[8.5px] font-black text-slate-400 dark:text-slate-550 uppercase tracking-wide block">Tags Rápidos:</span>
              <div className="flex flex-wrap gap-1">
                {['RETENIDO POR CALIDAD', 'REINGRESADO', 'MUESTRA', 'RECHAZADO'].map((tag) => (
                  <button
                    key={tag}
                    type="button"
                    onClick={() => setPalletComment(tag)}
                    className={`px-2 py-1 rounded-lg text-[8px] font-black uppercase tracking-wider transition-all border ${
                      palletComment === tag
                        ? 'bg-[#82BD02] text-white border-[#82BD02] shadow-sm'
                        : 'bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-750 text-slate-650 dark:text-slate-300 border-slate-150 dark:border-slate-800/80'
                    }`}
                  >
                    {tag}
                  </button>
                ))}
              </div>
            </div>
            
            <div className="grid grid-cols-2 gap-2 pt-2 border-t border-slate-100 dark:border-slate-800 shrink-0">
              <button
                type="button"
                onClick={() => {
                  setShowCommentModal(false);
                }}
                className="py-2.5 bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-350 text-[9px] font-black uppercase tracking-wider rounded-xl active:scale-95 transition-all"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowCommentModal(false);
                }}
                className="py-2.5 bg-[#82BD02] hover:bg-lime-600 text-white text-[9px] font-black uppercase tracking-wider rounded-xl active:scale-95 transition-all shadow shadow-lime-100 dark:shadow-none"
              >
                Guardar
              </button>
            </div>
            
          </div>
        </div>
      )}

      {/* 5. FLOATING PRINT QUEUE BUTTON */}
      {pendingPrintQueue.length > 0 && (
        <button
          onClick={() => setShowPrintQueueModal(true)}
          className="fixed bottom-4 right-4 z-40 bg-[#009ED6] hover:bg-sky-600 text-white p-3 pr-4 rounded-full shadow-lg flex items-center gap-2 font-black text-[10px] uppercase tracking-wider animate-bounce active:scale-95 transition-all"
          title="LPNs pendientes de imprimir"
        >
          <Printer className="w-4 h-4 text-white shrink-0" />
          <span>Cola ({pendingPrintQueue.length})</span>
        </button>
      )}

      {/* 6. PENDING PRINT QUEUE LIST MODAL */}
      {showPrintQueueModal && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-200">
          <div className="bg-white dark:bg-slate-900 rounded-3xl w-full max-w-md overflow-hidden shadow-2xl p-4 sm:p-5 border border-slate-100 dark:border-slate-805 flex flex-col max-h-[85vh] animate-in zoom-in-95 duration-150">
            
            {/* Modal Header */}
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800 shrink-0">
              <div className="flex items-center gap-2">
                <div className="bg-[#009ED6] text-white p-2 rounded-xl shrink-0">
                  <Printer className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-xs font-black text-slate-900 dark:text-white uppercase tracking-wider leading-none">COLA DE IMPRESIÓN PENDIENTE</h3>
                  <p className="text-[9px] font-semibold text-slate-500 dark:text-slate-400 mt-1">Rótulos generados listos para imprimir</p>
                </div>
              </div>
              <button
                onClick={() => setShowPrintQueueModal(false)}
                className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 p-1 rounded-full hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
              >
                <XCircle className="w-5 h-5" />
              </button>
            </div>
            
            {/* Modal Content - List of pending LPNs */}
            <div className="flex-1 overflow-y-auto py-3 space-y-2 pr-1 min-h-[150px]">
              {pendingPrintQueue.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-10 text-slate-400">
                  <CheckCircle className="w-10 h-10 text-emerald-500 mb-2 opacity-50" />
                  <p className="text-[10px] font-black uppercase text-slate-500">¡COLA VACÍA!</p>
                  <p className="text-[8.5px] font-semibold text-slate-400 text-center px-4 mt-0.5">Todos los rótulos han sido impresos o limpiados.</p>
                </div>
              ) : (
                pendingPrintQueue.map((item, idx) => (
                  <div
                    key={`${item.lpn}-${idx}`}
                    className="p-2.5 bg-slate-50 dark:bg-slate-950 border border-slate-150 dark:border-slate-800/80 rounded-xl relative flex items-center justify-between gap-3 shadow-sm hover:border-slate-200 dark:hover:border-slate-700 hover:shadow-md transition-all animate-in slide-in-from-bottom-2 duration-150"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5 mb-1">
                        <span className="font-mono font-black text-[10px] text-slate-800 dark:text-white tracking-widest leading-none">{item.lpn}</span>
                        {item.isMixed ? (
                          <span className="text-[6.5px] font-black bg-indigo-50 text-indigo-700 dark:bg-indigo-950/40 dark:text-indigo-400 px-1.5 py-0.5 rounded uppercase leading-none border border-indigo-100 dark:border-indigo-900/30">MIXTO</span>
                        ) : (
                          <span className="text-[6.5px] font-black bg-[#82BD02]/10 text-lime-700 dark:bg-lime-950/40 dark:text-lime-400 px-1.5 py-0.5 rounded uppercase leading-none border border-lime-100 dark:border-lime-900/30">UNITARIO</span>
                        )}
                      </div>
                      
                      <h4 className="text-[10px] font-black text-slate-700 dark:text-slate-300 truncate leading-tight mb-1">
                        {item.productName}
                      </h4>
                      
                      <div className="flex items-center gap-2 text-[8px] font-mono text-slate-450 dark:text-slate-500">
                        <span className="text-red-500 font-bold">VENCE: {item.expirationDate}</span>
                        <span>•</span>
                        <span>CANT: {item.quantity} {item.unitOfMeasure || 'UN'}</span>
                      </div>
                      
                      {item.comentario && (
                        <div className="mt-1 flex items-center gap-1 text-[7.5px] font-black text-amber-600 dark:text-amber-400 bg-amber-500/5 px-1.5 py-0.5 rounded border border-amber-200/20 w-fit leading-none">
                          OBS: {item.comentario}
                        </div>
                      )}
                    </div>
                    
                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        onClick={() => {
                          printLpnLabel(item);
                        }}
                        className="p-2 bg-[#82BD02] hover:bg-lime-600 text-white rounded-lg shadow-sm transition-all active:scale-90"
                        title="Imprimir etiqueta individual"
                      >
                        <Printer className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => {
                          setPendingPrintQueue(prev => prev.filter((_, i) => i !== idx));
                        }}
                        className="p-2 bg-white dark:bg-slate-800 text-slate-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-950/20 border border-slate-100 dark:border-slate-700 rounded-lg shadow-sm transition-all active:scale-95"
                        title="Quitar de la cola"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
            
            {/* Modal Actions */}
            {pendingPrintQueue.length > 0 && (
              <div className="pt-3 border-t border-slate-100 dark:border-slate-800 grid grid-cols-2 gap-2 shrink-0">
                <button
                  type="button"
                  onClick={() => {
                    if (window.confirm("¿Seguro que desea vaciar toda la cola de impresión?")) {
                      setPendingPrintQueue([]);
                    }
                  }}
                  className="py-2.5 bg-slate-50 hover:bg-slate-100 hover:text-red-550 border border-slate-150 dark:bg-slate-800 dark:hover:bg-slate-755 text-slate-500 dark:text-slate-350 rounded-xl text-[9px] font-black uppercase tracking-wider transition-all active:scale-95"
                >
                  VACIAR COLA
                </button>
                
                <button
                  type="button"
                  onClick={() => {
                    printBulkLpns(pendingPrintQueue);
                    setPendingPrintQueue([]);
                    setShowPrintQueueModal(false);
                    alert("Se ha descargado el lote completo de etiquetas LPN.");
                  }}
                  className="py-2.5 bg-[#82BD02] hover:bg-lime-600 text-white rounded-xl text-[9px] font-black uppercase tracking-wider transition-all shadow-md active:scale-95 flex items-center justify-center gap-1.5"
                >
                  <Printer className="w-3.5 h-3.5 text-white" />
                  IMPRIMIR TODO ({pendingPrintQueue.length})
                </button>
              </div>
            )}
            
          </div>
        </div>
      )}

      {/* 3. GENERATED LABEL MODAL OVERLAY (With print capability, cell optimized) */}
      {showLabelModal && generatedLpn && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-200" id="success_modal_overlay">
          <div className="bg-white dark:bg-slate-900 rounded-2xl w-full max-w-sm overflow-hidden shadow-2xl p-6 text-center border-t-4 border-[#82BD02] animate-in zoom-in-95 duration-150" id="success_modal_card">
            
            <div className="mx-auto flex items-center justify-center h-12 w-12 rounded-full bg-emerald-100 dark:bg-emerald-950/50 mb-4 animate-bounce">
              <CheckCircle className="h-6 w-6 text-emerald-600 dark:text-emerald-400" />
            </div>
            
            <h3 className="text-base font-black text-emerald-600 dark:text-emerald-450 uppercase tracking-wide">
              ROTULO GENERADO
            </h3>
            
            <p className="font-mono text-sm font-black text-slate-550 dark:text-slate-400 mt-2">
              LPN: {generatedLpn.lpn}
            </p>
            
            {generatedLpn.comentario && (
              <p className="bg-amber-50 dark:bg-slate-950 text-amber-700 dark:text-amber-400 border border-amber-200 dark:border-amber-900/50 rounded-xl py-1.5 px-3 text-[10px] font-black uppercase mt-3 inline-block leading-tight max-w-full truncate">
                OBS: {generatedLpn.comentario}
              </p>
            )}

            <div className="mt-3 text-[10px] text-sky-600 dark:text-sky-400 font-extrabold bg-sky-50 dark:bg-sky-950/40 p-2 rounded-xl">
              Agregado a la Cola de Impresión
            </div>
            
            <div className="mt-4 flex justify-center">
              <span className="flex h-2 w-2 relative">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#82BD02] opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-[#82BD02]"></span>
              </span>
            </div>

          </div>
        </div>
      )}

    </div>
  );
};
