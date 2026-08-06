import React, { useState, useEffect, useMemo, useRef } from 'react';
import { 
  Search, 
  QrCode, 
  X, 
  LogOut, 
  RotateCcw, 
  Clock, 
  Package, 
  MapPin, 
  AlertTriangle, 
  CheckCircle2, 
  RefreshCw, 
  Info, 
  Layers,
  FileSpreadsheet,
  BarChart3,
  ShieldCheck,
  TrendingUp,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight
} from 'lucide-react';
import * as XLSX from 'xlsx';
import { 
  ResponsiveContainer, 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  Tooltip as RechartsTooltip, 
  Cell, 
  CartesianGrid 
} from 'recharts';
import { InventoryItem, Product, Usuario } from '../types';
import { supabase } from '../supabaseClient';

// Helper to get chamber from product or catalogMap
function getChamberForItem(item: InventoryItem, catalogMap: Map<string, Product>): 'SECO' | 'REFRIGERADO' | 'CONGELADO' {
  const prod = catalogMap.get(item.productCode?.trim().toLowerCase() || '');
  if (!prod) return 'SECO';
  if (prod.es_congelado) return 'CONGELADO';
  if (prod.es_refrigerado) return 'REFRIGERADO';
  if (prod.es_seco) return 'SECO';
  if (prod.zona_predeterminada) return prod.zona_predeterminada;
  if (prod.camara_texto) {
    const txt = prod.camara_texto.toUpperCase();
    if (txt.includes('CONGEL')) return 'CONGELADO';
    if (txt.includes('REFRIG')) return 'REFRIGERADO';
    if (txt.includes('SECO')) return 'SECO';
  }
  return 'SECO';
}

// Helper to calculate age in days
function getLpnAgeInDays(item: InventoryItem): number {
  const dateStr = item.receptionDate || item.fecha_generado || item.fecha_ultima_ubicacion;
  if (!dateStr) return 0;
  const dateObj = new Date(dateStr);
  if (isNaN(dateObj.getTime())) return 0;
  const diffTime = Math.max(0, Date.now() - dateObj.getTime());
  return Math.floor(diffTime / (1000 * 60 * 60 * 24));
}

// Helper to calculate total weight (kg)
function getItemWeightKg(item: InventoryItem, catalogMap: Map<string, Product>): number {
  const prod = catalogMap.get(item.productCode?.trim().toLowerCase() || '');
  if (prod && prod.peso_unitario > 0) {
    const totalUnits = item.unidades || item.quantity || ((item.cajas || 0) * (prod.unidades_por_caja || 1));
    return totalUnits * prod.peso_unitario;
  }
  if (item.cajas && item.cajas > 0) return item.cajas * 10;
  return (item.pallets || 1) * 400;
}

interface RecentExitRecord {
  lpn: string;
  item: InventoryItem;
  exitedAt: number; // timestamp in ms
  reason: string;
  user: string;
  originalLocationId?: string | null;
  reversed?: boolean;
}

interface SalidasLpnProps {
  inventory: InventoryItem[];
  catalog: Product[];
  currentUser: Usuario | null;
  onDispatch: (lpn: string, reason?: string) => void;
  onRefresh: () => Promise<void>;
}

export const SalidasLpn: React.FC<SalidasLpnProps> = ({
  inventory,
  catalog,
  currentUser,
  onDispatch,
  onRefresh
}) => {
  // State
  const [searchQuery, setSearchQuery] = useState('');
  const [activeTab, setActiveTab] = useState<'ALL' | 'RAQUEADO' | 'SIN_UBICACION' | 'HISTORIAL'>('ALL');
  const [selectedLpnItem, setSelectedLpnItem] = useState<InventoryItem | null>(null);
  const [dispatchReason, setDispatchReason] = useState('Baja de Pallet para Picking / Consumo');
  const [isConfirmModalOpen, setIsConfirmModalOpen] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [notification, setNotification] = useState<{ message: string; type: 'success' | 'error' | 'info' } | null>(null);

  // Scanner state
  const [isCameraActive, setIsCameraActive] = useState(false);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const searchInputRef = useRef<HTMLInputElement | null>(null);

  // Recent Exits History & Timer (10 min return window)
  const [recentExits, setRecentExits] = useState<RecentExitRecord[]>([]);
  const [currentTimeMs, setCurrentTimeMs] = useState<number>(Date.now());
  
  // Pagination State
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [itemsPerPage, setItemsPerPage] = useState<number>(25);
  const [jumpToPageInput, setJumpToPageInput] = useState<string>('');

  // Ticker for live 10-minute countdowns (only when in HISTORIAL tab with active exits)
  useEffect(() => {
    if (activeTab !== 'HISTORIAL' || recentExits.length === 0) return;

    const hasUnexpired = recentExits.some(r => !r.reversed && (Date.now() - r.exitedAt) < 10 * 60 * 1000);
    if (!hasUnexpired) return;

    const timer = setInterval(() => {
      setCurrentTimeMs(Date.now());
    }, 1000);
    return () => clearInterval(timer);
  }, [activeTab, recentExits]);

  // Load recent exits from localStorage & Supabase movements on mount
  useEffect(() => {
    const loadRecentExitsFromStorageAndDB = async () => {
      let loaded: RecentExitRecord[] = [];
      try {
        const saved = localStorage.getItem('smartwms_salidas_lpn_recent');
        if (saved) {
          loaded = JSON.parse(saved);
        }
      } catch (e) {
        console.error("Error reading localStorage recent exits:", e);
      }

      // Fetch recent RETIRO movements from Supabase
      try {
        const tenMinAgoIso = new Date(Date.now() - 3600 * 1000 * 2).toISOString(); // last 2 hours
        const { data: dbMoves, error } = await supabase
          .from('lpn_movimientos')
          .select('*')
          .eq('tipo_movimiento', 'RETIRO')
          .gte('fecha', tenMinAgoIso)
          .order('fecha', { ascending: false });

        if (!error && dbMoves && dbMoves.length > 0) {
          dbMoves.forEach(move => {
            const moveTime = new Date(move.fecha).getTime();
            if (!loaded.some(r => r.lpn === move.lpn && Math.abs(r.exitedAt - moveTime) < 5000)) {
              // Try to find catalog or item details
              const dummyItem: Partial<InventoryItem> = {
                lpn: move.lpn,
                productName: 'Pallet / LPN Registrado',
                productCode: move.lpn,
                quantity: move.cantidad_afectada || 1,
                receptionDate: move.fecha,
                receivedBy: move.usuario,
                qrCodeUrl: ''
              };

              loaded.push({
                lpn: move.lpn,
                item: dummyItem as InventoryItem,
                exitedAt: moveTime,
                reason: move.motivo || 'Salida registrada',
                user: move.usuario || 'OPERADOR',
                originalLocationId: move.ubicacion_id
              });
            }
          });
        }
      } catch (err) {
        console.error("Error loading recent movements from DB:", err);
      }

      // Sort by exitedAt descending
      loaded.sort((a, b) => b.exitedAt - a.exitedAt);
      setRecentExits(loaded);
    };

    loadRecentExitsFromStorageAndDB();
  }, []);

  // Save recentExits to localStorage whenever it changes
  const updateRecentExits = (records: RecentExitRecord[]) => {
    setRecentExits(records);
    try {
      localStorage.setItem('smartwms_salidas_lpn_recent', JSON.stringify(records.slice(0, 30)));
    } catch (e) {
      console.error("Error writing localStorage recent exits:", e);
    }
  };

  // Show notification toast helper
  const showToast = (message: string, type: 'success' | 'error' | 'info' = 'success') => {
    setNotification({ message, type });
    setTimeout(() => {
      setNotification(null);
    }, 4500);
  };

  // Active LPNs in inventory (not dispatched, not eliminated)
  const activeLpns = useMemo(() => {
    return inventory.filter(item => item.lpn && item.estado_lpn !== 'ELIMINADO');
  }, [inventory]);

  // Catalog Map helper
  const catalogMap = useMemo(() => {
    const map = new Map<string, Product>();
    catalog.forEach(p => {
      if (p.codigo) map.set(p.codigo.trim().toLowerCase(), p);
      if (p.sku) map.set(p.sku.trim().toLowerCase(), p);
    });
    return map;
  }, [catalog]);

  // Admin role check
  const isAdmin = currentUser?.rol === 'ADMIN';

  // Admin Modals state
  const [isAdminExcelModalOpen, setIsAdminExcelModalOpen] = useState(false);
  const [isAdminMetricsModalOpen, setIsAdminMetricsModalOpen] = useState(false);
  const [agingLimit, setAgingLimit] = useState<number>(10);

  // Admin Metrics Data
  const adminMetricsData = useMemo(() => {
    let totalUnitsSeco = 0;
    let totalCajasSeco = 0;
    let totalPalletsSeco = 0;

    let totalUnitsRefrig = 0;
    let totalCajasRefrig = 0;
    let totalPalletsRefrig = 0;

    let totalUnitsCong = 0;
    let totalCajasCong = 0;
    let totalPalletsCong = 0;

    let totalWeightKg = 0;

    activeLpns.forEach(item => {
      const chamber = getChamberForItem(item, catalogMap);
      const units = item.unidades || item.quantity || 0;
      const cajas = item.cajas || 0;
      const pallets = item.pallets || 1;
      const weight = getItemWeightKg(item, catalogMap);

      totalWeightKg += weight;

      if (chamber === 'CONGELADO') {
        totalUnitsCong += units;
        totalCajasCong += cajas;
        totalPalletsCong += pallets;
      } else if (chamber === 'REFRIGERADO') {
        totalUnitsRefrig += units;
        totalCajasRefrig += cajas;
        totalPalletsRefrig += pallets;
      } else {
        totalUnitsSeco += units;
        totalCajasSeco += cajas;
        totalPalletsSeco += pallets;
      }
    });

    const chartData = [
      { name: 'Secos', unidades: totalUnitsSeco, cajas: totalCajasSeco, pallets: totalPalletsSeco, fill: '#f59e0b' },
      { name: 'Refrigerado', unidades: totalUnitsRefrig, cajas: totalCajasRefrig, pallets: totalPalletsRefrig, fill: '#0284c7' },
      { name: 'Congelado', unidades: totalUnitsCong, cajas: totalCajasCong, pallets: totalPalletsCong, fill: '#6366f1' },
    ];

    // All aging LPNs sorted by age descending
    const sortedByAge = [...activeLpns].sort((a, b) => {
      return getLpnAgeInDays(b) - getLpnAgeInDays(a);
    });

    const agingLpns = sortedByAge.slice(0, agingLimit);

    return {
      chartData,
      totalUnitsSeco,
      totalUnitsRefrig,
      totalUnitsCong,
      totalWeightKg,
      totalLpns: activeLpns.length,
      allAgingCount: sortedByAge.length,
      agingLpns
    };
  }, [activeLpns, catalogMap, agingLimit]);

  // Export Excel Function
  const handleExportExcel = (chamber: 'TODOS' | 'SECO' | 'REFRIGERADO' | 'CONGELADO') => {
    let targetLpns = activeLpns;
    if (chamber !== 'TODOS') {
      targetLpns = activeLpns.filter(item => getChamberForItem(item, catalogMap) === chamber);
    }

    if (targetLpns.length === 0) {
      showToast(`No hay LPNs pendientes en la cámara ${chamber}`, 'info');
      return;
    }

    const rows = targetLpns.map((item, index) => {
      const prod = catalogMap.get(item.productCode?.trim().toLowerCase() || '');
      const ch = getChamberForItem(item, catalogMap);
      const ageDays = getLpnAgeInDays(item);
      const weightKg = getItemWeightKg(item, catalogMap);
      const displayLoc = item.location 
        ? `Rack ${item.location.rackId} - N${item.location.level}-P${item.location.position}`
        : item.locationId 
        ? `Ubicación ID: ${item.locationId}` 
        : 'Piso / Recepción';

      return {
        'N°': index + 1,
        'LPN': item.lpn,
        'CÓDIGO EAN/SKU': item.productCode || '-',
        'PRODUCTO': item.productName || 'No especificado',
        'MARCA': prod?.marca || '-',
        'CÁMARA': ch,
        'UBICACIÓN': displayLoc,
        'CAJAS': item.cajas || 0,
        'UNIDADES': item.unidades || item.quantity || 0,
        'PALLETS': item.pallets || 1,
        'FECHA VENCIMIENTO': item.expirationDate || '-',
        'FECHA INGRESO / ROTULADO': item.receptionDate || item.fecha_generado || '-',
        'DÍAS EN RESERVA': ageDays,
        'PESO ESTIMADO (KG)': Number(weightKg.toFixed(2))
      };
    });

    const worksheet = XLSX.utils.json_to_sheet(rows);
    worksheet['!cols'] = [
      { wch: 5 },  // N°
      { wch: 18 }, // LPN
      { wch: 16 }, // CODIGO
      { wch: 38 }, // PRODUCTO
      { wch: 18 }, // MARCA
      { wch: 14 }, // CAMARA
      { wch: 25 }, // UBICACION
      { wch: 10 }, // CAJAS
      { wch: 12 }, // UNIDADES
      { wch: 10 }, // PALLETS
      { wch: 18 }, // FECHA VENC
      { wch: 22 }, // FECHA INGRESO
      { wch: 16 }, // DIAS RESERVA
      { wch: 18 }  // PESO
    ];

    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, `Inventario_${chamber}`);

    const todayStr = new Date().toISOString().slice(0, 10);
    XLSX.writeFile(workbook, `Inventario_Reserva_LPN_${chamber}_${todayStr}.xlsx`);
    setIsAdminExcelModalOpen(false);
    showToast(`Excel generado exitosamente (${rows.length} LPNs - ${chamber})`, 'success');
  };

  // Filtered list based on search and activeTab
  const filteredLpns = useMemo(() => {
    let result = activeLpns;

    // Apply tab filter
    if (activeTab === 'RAQUEADO') {
      result = result.filter(i => !!i.location || !!i.locationId);
    } else if (activeTab === 'SIN_UBICACION') {
      result = result.filter(i => !i.location && !i.locationId);
    }

    // Apply search filter
    if (searchQuery.trim()) {
      const q = searchQuery.trim().toLowerCase();
      result = result.filter(item => {
        const matchLpn = item.lpn?.toLowerCase().includes(q);
        const matchProdName = item.productName?.toLowerCase().includes(q);
        const matchProdCode = item.productCode?.toLowerCase().includes(q);
        const locStr = item.location ? `rack ${item.location.rackId} nivel ${item.location.level} pos ${item.location.position} pasillo ${item.location.aisle}`.toLowerCase() : '';
        const matchLoc = locStr.includes(q);
        return matchLpn || matchProdName || matchProdCode || matchLoc;
      });
    }

    return result;
  }, [activeLpns, activeTab, searchQuery]);

  // Reset currentPage when search, activeTab, or itemsPerPage changes
  useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery, activeTab, itemsPerPage]);

  const totalPages = useMemo(() => {
    return Math.max(1, Math.ceil(filteredLpns.length / itemsPerPage));
  }, [filteredLpns.length, itemsPerPage]);

  const safeCurrentPage = useMemo(() => {
    return Math.min(Math.max(1, currentPage), totalPages);
  }, [currentPage, totalPages]);

  const paginatedLpns = useMemo(() => {
    const start = (safeCurrentPage - 1) * itemsPerPage;
    return filteredLpns.slice(start, start + itemsPerPage);
  }, [filteredLpns, safeCurrentPage, itemsPerPage]);

  // Helper render for pagination controls
  const renderPaginationControls = () => {
    if (filteredLpns.length === 0) return null;

    const startIdx = (safeCurrentPage - 1) * itemsPerPage + 1;
    const endIdx = Math.min(safeCurrentPage * itemsPerPage, filteredLpns.length);

    const getPageNumbers = () => {
      const pages: (number | string)[] = [];
      if (totalPages <= 7) {
        for (let i = 1; i <= totalPages; i++) pages.push(i);
      } else {
        pages.push(1);
        if (safeCurrentPage > 3) pages.push('...');
        
        const start = Math.max(2, safeCurrentPage - 1);
        const end = Math.min(totalPages - 1, safeCurrentPage + 1);
        for (let i = start; i <= end; i++) pages.push(i);

        if (safeCurrentPage < totalPages - 2) pages.push('...');
        pages.push(totalPages);
      }
      return pages;
    };

    return (
      <div className="bg-white dark:bg-slate-900 rounded-2xl p-3 sm:p-4 border border-slate-200 dark:border-slate-800 shadow-sm flex flex-col md:flex-row items-center justify-between gap-3 text-xs my-2">
        {/* Left: Summary & Page size */}
        <div className="flex flex-wrap items-center justify-between md:justify-start w-full md:w-auto gap-3">
          <span className="font-bold text-slate-600 dark:text-slate-300">
            Mostrando <strong className="text-slate-900 dark:text-white font-mono">{startIdx} - {endIdx}</strong> de <strong className="text-amber-600 dark:text-amber-400 font-mono">{filteredLpns.length}</strong> LPNs
          </span>

          <div className="flex items-center gap-1.5 bg-slate-50 dark:bg-slate-800/80 px-2.5 py-1 rounded-xl border border-slate-200 dark:border-slate-700">
            <span className="font-bold text-slate-500 dark:text-slate-400 text-[11px] uppercase">Por pág:</span>
            <select
              value={itemsPerPage}
              onChange={(e) => {
                setItemsPerPage(Number(e.target.value));
                setCurrentPage(1);
              }}
              className="bg-transparent font-black text-slate-900 dark:text-white outline-none cursor-pointer"
            >
              <option value={15} className="dark:bg-slate-900">15</option>
              <option value={25} className="dark:bg-slate-900">25</option>
              <option value={50} className="dark:bg-slate-900">50</option>
              <option value={100} className="dark:bg-slate-900">100</option>
            </select>
          </div>
        </div>

        {/* Right: Buttons & Jump */}
        <div className="flex flex-wrap items-center justify-center gap-1.5 w-full md:w-auto">
          <button
            type="button"
            disabled={safeCurrentPage === 1}
            onClick={() => setCurrentPage(1)}
            className="p-1.5 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-amber-100 hover:text-amber-800 dark:hover:bg-amber-950 dark:hover:text-amber-300 disabled:opacity-30 disabled:pointer-events-none transition-all cursor-pointer"
            title="Primera página"
          >
            <ChevronsLeft className="w-4 h-4" />
          </button>

          <button
            type="button"
            disabled={safeCurrentPage === 1}
            onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
            className="px-2.5 py-1.5 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-amber-100 hover:text-amber-800 dark:hover:bg-amber-950 dark:hover:text-amber-300 disabled:opacity-30 disabled:pointer-events-none transition-all font-bold flex items-center gap-1 cursor-pointer"
            title="Página anterior"
          >
            <ChevronLeft className="w-4 h-4" />
            <span className="hidden sm:inline">Anterior</span>
          </button>

          <div className="flex items-center gap-1">
            {getPageNumbers().map((p, idx) => {
              if (typeof p === 'string') {
                return <span key={`ellipsis-${idx}`} className="px-1 text-slate-400 font-bold">...</span>;
              }
              const isActive = p === safeCurrentPage;
              return (
                <button
                  key={`page-${p}`}
                  type="button"
                  onClick={() => setCurrentPage(p)}
                  className={`min-w-[32px] h-8 px-2 rounded-xl text-xs font-black transition-all cursor-pointer ${
                    isActive
                      ? 'bg-amber-500 text-white shadow-md shadow-amber-500/30 scale-105'
                      : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700'
                  }`}
                >
                  {p}
                </button>
              );
            })}
          </div>

          <button
            type="button"
            disabled={safeCurrentPage === totalPages}
            onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
            className="px-2.5 py-1.5 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-amber-100 hover:text-amber-800 dark:hover:bg-amber-950 dark:hover:text-amber-300 disabled:opacity-30 disabled:pointer-events-none transition-all font-bold flex items-center gap-1 cursor-pointer"
            title="Página siguiente"
          >
            <span className="hidden sm:inline">Siguiente</span>
            <ChevronRight className="w-4 h-4" />
          </button>

          <button
            type="button"
            disabled={safeCurrentPage === totalPages}
            onClick={() => setCurrentPage(totalPages)}
            className="p-1.5 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-amber-100 hover:text-amber-800 dark:hover:bg-amber-950 dark:hover:text-amber-300 disabled:opacity-30 disabled:pointer-events-none transition-all cursor-pointer"
            title="Última página"
          >
            <ChevronsRight className="w-4 h-4" />
          </button>

          {totalPages > 5 && (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                const p = parseInt(jumpToPageInput, 10);
                if (!isNaN(p) && p >= 1 && p <= totalPages) {
                  setCurrentPage(p);
                  setJumpToPageInput('');
                }
              }}
              className="flex items-center gap-1 ml-1"
            >
              <input
                type="number"
                min={1}
                max={totalPages}
                placeholder="Pág"
                value={jumpToPageInput}
                onChange={(e) => setJumpToPageInput(e.target.value)}
                className="w-12 py-1 px-1.5 bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-center font-black text-xs outline-none focus:border-amber-500"
              />
              <button
                type="submit"
                className="px-2 py-1 bg-amber-500 hover:bg-amber-600 text-white font-bold rounded-lg text-[10px] uppercase cursor-pointer"
              >
                Ir
              </button>
            </form>
          )}
        </div>
      </div>
    );
  };

  // Handle Search Input submit / enter (e.g., when scanned via handheld scanner)
  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const clean = searchQuery.trim().toLowerCase();
    if (!clean) return;

    // Direct match check
    const exactMatch = activeLpns.find(item => item.lpn.trim().toLowerCase() === clean);
    if (exactMatch) {
      setSelectedLpnItem(exactMatch);
      setIsConfirmModalOpen(true);
      return;
    }

    // Partial match
    if (filteredLpns.length === 1) {
      setSelectedLpnItem(filteredLpns[0]);
      setIsConfirmModalOpen(true);
    }
  };

  // Open Camera Scanner
  const startCameraScan = async () => {
    setIsCameraActive(true);
    try {
      const mediaStream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment' }
      });
      streamRef.current = mediaStream;
      if (videoRef.current) {
        videoRef.current.srcObject = mediaStream;
        await videoRef.current.play();
      }
    } catch (err) {
      console.error("Camera access error:", err);
      showToast("No se pudo acceder a la cámara. Ingrese el LPN manualmente.", "error");
      setIsCameraActive(false);
    }
  };

  // Stop Camera
  const stopCameraScan = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
    setIsCameraActive(false);
  };

  useEffect(() => {
    return () => {
      stopCameraScan();
    };
  }, []);

  // Execute Dispatch Action
  const handleConfirmDispatch = async () => {
    if (!selectedLpnItem) return;

    setIsProcessing(true);
    const itemToDispatch = { ...selectedLpnItem };
    const lpnCode = itemToDispatch.lpn;
    const userToSave = currentUser?.nombre || currentUser?.username || 'AUXILIAR';

    try {
      // 1. Call parent onDispatch which updates state & Supabase
      onDispatch(lpnCode, dispatchReason);

      // 2. Add to local recent exits for 10-minute return window
      const newExitRecord: RecentExitRecord = {
        lpn: lpnCode,
        item: itemToDispatch,
        exitedAt: Date.now(),
        reason: dispatchReason,
        user: userToSave,
        originalLocationId: itemToDispatch.locationId || (itemToDispatch.location ? `${itemToDispatch.location.rackId}-${itemToDispatch.location.level}-${itemToDispatch.location.position}` : null)
      };

      const updatedExits = [newExitRecord, ...recentExits.filter(r => r.lpn !== lpnCode)];
      updateRecentExits(updatedExits);

      showToast(`Salida registrada para LPN ${lpnCode}. Tiene 10 min para revertir si fue un error.`, "success");
      setIsConfirmModalOpen(false);
      setSelectedLpnItem(null);
      setSearchQuery('');
    } catch (err: any) {
      console.error("Error dando salida a LPN:", err);
      showToast(`Error al procesar salida: ${err?.message || 'Fallo desconocido'}`, "error");
    } finally {
      setIsProcessing(false);
    }
  };

  // Execute 10-Minute Reversal / Return (Devolución)
  const handleRevertDispatch = async (record: RecentExitRecord) => {
    const elapsedMinutes = (Date.now() - record.exitedAt) / (60 * 1000);
    if (elapsedMinutes > 10) {
      showToast("Ha transcurrido más de 10 minutos. No se puede anular esta salida automáticamente.", "error");
      return;
    }

    setIsProcessing(true);
    try {
      const lpnCode = record.lpn;

      // 1. Restore LPN status in Supabase paletas_lpn
      const { error: lpnErr } = await supabase
        .from('paletas_lpn')
        .update({
          estado: 'ACTIVO',
          estado_lpn: 'GENERADO',
          ubicacion_id: record.originalLocationId || null
        })
        .eq('lpn', lpnCode);

      if (lpnErr) throw lpnErr;

      // 2. If it had a location, set location back to OCUPADO in ubicaciones table if valid
      if (record.originalLocationId) {
        await supabase
          .from('ubicaciones')
          .update({ estado: 'OCUPADO' })
          .eq('id', record.originalLocationId);
      }

      // 3. Log movement in lpn_movimientos
      await supabase.from('lpn_movimientos').insert([{
        lpn: lpnCode,
        ubicacion_id: record.originalLocationId || null,
        tipo_movimiento: 'UBICACION',
        usuario: currentUser?.nombre || currentUser?.username || 'AUXILIAR',
        motivo: 'ANULACION SALIDA (<10 min) - DEVOLUCION A RESERVA',
        cantidad_afectada: record.item?.quantity || 1,
        fecha: new Date().toISOString(),
        sede_id: currentUser?.sede_id
      }]);

      // 4. Update local recent exits state (mark as reversed)
      const updatedExits = recentExits.map(r => {
        if (r.lpn === lpnCode && r.exitedAt === record.exitedAt) {
          return { ...r, reversed: true };
        }
        return r;
      });
      updateRecentExits(updatedExits);

      // 5. Trigger parent refresh
      await onRefresh();

      showToast(`LPN ${lpnCode} devuelto exitosamente a la reserva.`, "success");
    } catch (err: any) {
      console.error("Error anulando salida:", err);
      showToast(`Error al devolver LPN: ${err?.message || 'Fallo de conexión'}`, "error");
    } finally {
      setIsProcessing(false);
    }
  };

  // Helper for formatting time remaining
  const getTimeRemainingStr = (exitedAt: number) => {
    const elapsedMs = currentTimeMs - exitedAt;
    const tenMinMs = 10 * 60 * 1000;
    const remainingMs = tenMinMs - elapsedMs;

    if (remainingMs <= 0) return null;

    const totalSec = Math.floor(remainingMs / 1000);
    const mins = Math.floor(totalSec / 60);
    const secs = totalSec % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')} min`;
  };

  return (
    <div className="h-full w-full overflow-y-auto bg-slate-50/80 dark:bg-slate-950 p-2 sm:p-4 md:p-6 pb-24 text-slate-800 dark:text-slate-100">
      
      {/* Toast Notification Banner */}
      {notification && (
        <div className={`fixed top-4 left-1/2 -translate-x-1/2 z-[1000] max-w-md w-[92%] px-4 py-3 rounded-2xl shadow-xl border flex items-center gap-3 animate-in fade-in slide-in-from-top-4 duration-300 ${
          notification.type === 'success' 
            ? 'bg-emerald-600 text-white border-emerald-700 shadow-emerald-500/20'
            : notification.type === 'error'
            ? 'bg-rose-600 text-white border-rose-700 shadow-rose-500/20'
            : 'bg-blue-600 text-white border-blue-700 shadow-blue-500/20'
        }`}>
          {notification.type === 'success' && <CheckCircle2 className="w-5 h-5 shrink-0" />}
          {notification.type === 'error' && <AlertTriangle className="w-5 h-5 shrink-0" />}
          {notification.type === 'info' && <Info className="w-5 h-5 shrink-0" />}
          <span className="text-xs md:text-sm font-bold flex-1">{notification.message}</span>
          <button onClick={() => setNotification(null)} className="p-1 hover:bg-white/20 rounded-lg">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Header Banner - Minimalist on Mobile */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl p-3 sm:p-5 shadow-sm border border-slate-200/80 dark:border-slate-800 mb-3">
        <div className="hidden sm:flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-2xl bg-gradient-to-tr from-amber-500 to-orange-500 flex items-center justify-center text-white shadow-md shadow-amber-500/20 shrink-0">
              <LogOut className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-lg sm:text-xl font-black uppercase tracking-tight text-slate-900 dark:text-white">
                  SALIDAS LPN (RESERVA)
                </h1>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-black uppercase bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300 border border-amber-300 dark:border-amber-700">
                  Mobile 100%
                </span>
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400 font-medium mt-0.5">
                Escanee o seleccione pallets LPN para retirarlos de reserva y mantener el inventario 100% alineado.
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onRefresh}
            className="w-full sm:w-auto px-3.5 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 text-xs font-bold uppercase transition-colors flex items-center justify-center gap-2 cursor-pointer"
          >
            <RefreshCw className="w-4 h-4" />
            <span>Actualizar</span>
          </button>
        </div>

        {/* Search Bar & Camera Button */}
        <form onSubmit={handleSearchSubmit} className="sm:mt-4 flex items-center gap-2">
          <div className="relative flex-1">
            <input
              ref={searchInputRef}
              type="text"
              placeholder="Ingrese código LPN o producto..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-9 py-2.5 sm:py-3.5 bg-slate-50 dark:bg-slate-800/90 border-2 border-slate-200 dark:border-slate-700 rounded-xl sm:rounded-2xl text-xs sm:text-base font-bold outline-none focus:border-amber-500 focus:ring-2 focus:ring-amber-500/20 transition-all text-slate-900 dark:text-white placeholder-slate-400"
            />
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 sm:w-5 sm:h-5 text-slate-400" />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 p-1 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
              >
                <X className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
              </button>
            )}
          </div>

          <button
            type="button"
            onClick={startCameraScan}
            className="px-3 sm:px-4 py-2.5 sm:py-3.5 bg-amber-600 hover:bg-amber-700 active:scale-98 text-white rounded-xl sm:rounded-2xl font-black text-xs sm:text-sm uppercase shadow-md shadow-amber-600/20 transition-all flex items-center justify-center gap-1.5 cursor-pointer shrink-0"
          >
            <QrCode className="w-4 h-4 sm:w-5 sm:h-5" />
            <span className="hidden sm:inline">Cámara QR / LPN</span>
            <span className="sm:hidden text-[11px]">ESCANEAR</span>
          </button>
        </form>

        {/* Admin Action Bar (Only visible to ADMIN) */}
        {isAdmin && (
          <div className="mt-3 pt-3 border-t border-slate-100 dark:border-slate-800 flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-1.5 text-xs font-black text-amber-800 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/60 px-2.5 py-1 rounded-lg border border-amber-200/80 dark:border-amber-800/80">
              <ShieldCheck className="w-4 h-4 text-amber-600 dark:text-amber-400" />
              <span>OPCIONES ADMIN:</span>
            </div>

            <div className="flex items-center gap-2 flex-wrap">
              <button
                type="button"
                onClick={() => setIsAdminMetricsModalOpen(true)}
                className="px-3.5 py-2 bg-sky-50 hover:bg-sky-100 dark:bg-sky-950/60 dark:hover:bg-sky-900/60 border border-sky-200 dark:border-sky-800 text-sky-800 dark:text-sky-300 rounded-xl font-bold text-xs flex items-center gap-1.5 transition-all cursor-pointer shadow-sm active:scale-98"
              >
                <BarChart3 className="w-4 h-4 text-sky-600 dark:text-sky-400" />
                <span>Métricas & Antigüedad</span>
              </button>

              <button
                type="button"
                onClick={() => setIsAdminExcelModalOpen(true)}
                className="px-3.5 py-2 bg-emerald-50 hover:bg-emerald-100 dark:bg-emerald-950/60 dark:hover:bg-emerald-900/60 border border-emerald-200 dark:border-emerald-800 text-emerald-800 dark:text-emerald-300 rounded-xl font-bold text-xs flex items-center gap-1.5 transition-all cursor-pointer shadow-sm active:scale-98"
              >
                <FileSpreadsheet className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                <span>Descargar Excel Reserva</span>
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Tabs Bar - Hidden on Mobile */}
      <div className="hidden sm:flex items-center gap-1.5 overflow-x-auto pb-2 mb-4 scrollbar-none">
        <button
          type="button"
          onClick={() => setActiveTab('ALL')}
          className={`px-3.5 py-2.5 rounded-2xl text-xs font-black uppercase transition-all whitespace-nowrap flex items-center gap-1.5 cursor-pointer border ${
            activeTab === 'ALL'
              ? 'bg-amber-600 border-amber-600 text-white shadow-md shadow-amber-600/20'
              : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
          }`}
        >
          <Layers className="w-4 h-4" />
          <span>Todos en Reserva</span>
          <span className="ml-1 px-1.5 py-0.2 rounded-full bg-black/10 dark:bg-white/10 text-[10px]">
            {activeLpns.length}
          </span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('RAQUEADO')}
          className={`px-3.5 py-2.5 rounded-2xl text-xs font-black uppercase transition-all whitespace-nowrap flex items-center gap-1.5 cursor-pointer border ${
            activeTab === 'RAQUEADO'
              ? 'bg-amber-600 border-amber-600 text-white shadow-md shadow-amber-600/20'
              : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
          }`}
        >
          <MapPin className="w-4 h-4 text-emerald-500" />
          <span>Raqueados</span>
          <span className="ml-1 px-1.5 py-0.2 rounded-full bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300 text-[10px]">
            {activeLpns.filter(i => !!i.location || !!i.locationId).length}
          </span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('SIN_UBICACION')}
          className={`px-3.5 py-2.5 rounded-2xl text-xs font-black uppercase transition-all whitespace-nowrap flex items-center gap-1.5 cursor-pointer border ${
            activeTab === 'SIN_UBICACION'
              ? 'bg-amber-600 border-amber-600 text-white shadow-md shadow-amber-600/20'
              : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
          }`}
        >
          <Package className="w-4 h-4 text-sky-500" />
          <span>Sin Ubicación</span>
          <span className="ml-1 px-1.5 py-0.2 rounded-full bg-sky-100 text-sky-800 dark:bg-sky-900/40 dark:text-sky-300 text-[10px]">
            {activeLpns.filter(i => !i.location && !i.locationId).length}
          </span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('HISTORIAL')}
          className={`px-3.5 py-2.5 rounded-2xl text-xs font-black uppercase transition-all whitespace-nowrap flex items-center gap-1.5 cursor-pointer border ${
            activeTab === 'HISTORIAL'
              ? 'bg-amber-600 border-amber-600 text-white shadow-md shadow-amber-600/20'
              : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
          }`}
        >
          <Clock className="w-4 h-4 text-amber-500" />
          <span>Salidas Recientes (&lt;10 min)</span>
          <span className="ml-1 px-1.5 py-0.2 rounded-full bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300 text-[10px]">
            {recentExits.length}
          </span>
        </button>
      </div>

      {/* Main Content Area */}
      {activeTab !== 'HISTORIAL' ? (
        <div className="space-y-3">
          {filteredLpns.length === 0 ? (
            <div className="bg-white dark:bg-slate-900 rounded-3xl p-8 text-center border border-slate-200 dark:border-slate-800 shadow-sm">
              <Package className="w-12 h-12 text-slate-300 dark:text-slate-700 mx-auto mb-3" />
              <h3 className="text-base font-black text-slate-700 dark:text-slate-200 uppercase">
                No se encontraron LPNs
              </h3>
              <p className="text-xs text-slate-400 mt-1 max-w-sm mx-auto">
                {searchQuery ? `No hay resultados para "${searchQuery}". Verifique el código ingresado.` : 'No hay paletas de reserva registradas en esta categoría.'}
              </p>
            </div>
          ) : (
            <>
              {/* Pagination Controls Top */}
              {renderPaginationControls()}

              {/* Desktop Table View (md:block) */}
              <div className="hidden md:block bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse min-w-[650px]">
                    <thead>
                      <tr className="bg-slate-100 dark:bg-slate-800/80 border-b border-slate-200 dark:border-slate-700 text-[10px] font-black uppercase text-slate-500 dark:text-slate-400 tracking-wider">
                        <th className="py-3 px-3">CÓDIGO LPN</th>
                        <th className="py-3 px-3">PRODUCTO / CÓDIGO</th>
                        <th className="py-3 px-3">UBICACIÓN</th>
                        <th className="py-3 px-3 text-center">CAJAS / UNID.</th>
                        <th className="py-3 px-3 text-right">ACCIÓN</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800 text-xs">
                      {paginatedLpns.map(item => {
                        const prodInfo = catalogMap.get(item.productCode?.trim().toLowerCase() || '');
                        const displayLocation = item.location 
                          ? `Rack ${item.location.rackId} • N${item.location.level}-P${item.location.position}`
                          : item.locationId 
                          ? `Ubicación ID: ${item.locationId}` 
                          : 'Piso / Recepción';

                        return (
                          <tr key={item.lpn} className="hover:bg-amber-50/50 dark:hover:bg-amber-950/20 transition-colors">
                            <td className="py-2.5 px-3 font-mono font-black">
                              <span className="inline-flex items-center gap-1 px-2.5 py-1 bg-amber-100 dark:bg-amber-950/80 text-amber-900 dark:text-amber-200 rounded-lg text-xs border border-amber-200 dark:border-amber-800">
                                <QrCode className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                                {item.lpn}
                              </span>
                            </td>
                            <td className="py-2.5 px-3 max-w-[240px]">
                              <div className="font-black text-slate-900 dark:text-white uppercase truncate text-xs">
                                {item.productName || 'Producto no especificado'}
                              </div>
                              <div className="flex items-center gap-2 text-[10px] font-bold text-slate-400">
                                {item.productCode && <span className="font-mono">COD: {item.productCode}</span>}
                                {prodInfo?.marca && <span className="truncate">| {prodInfo.marca}</span>}
                              </div>
                            </td>
                            <td className="py-2.5 px-3">
                              <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-black uppercase border ${
                                item.location || item.locationId
                                  ? 'bg-emerald-50 text-emerald-800 border-emerald-200 dark:bg-emerald-950/50 dark:text-emerald-300 dark:border-emerald-800'
                                  : 'bg-slate-100 text-slate-600 border-slate-200 dark:bg-slate-800 dark:text-slate-400 dark:border-slate-700'
                              }`}>
                                <MapPin className="w-3 h-3 shrink-0" />
                                {displayLocation}
                              </span>
                            </td>
                            <td className="py-2.5 px-3 text-center">
                              <div className="font-black text-slate-900 dark:text-white text-xs">
                                {item.cajas || 0} Cj / {item.unidades || item.quantity || 0} Un
                              </div>
                            </td>
                            <td className="py-2.5 px-3 text-right">
                              <button
                                type="button"
                                onClick={() => {
                                  setSelectedLpnItem(item);
                                  setIsConfirmModalOpen(true);
                                }}
                                className="px-3.5 py-1.5 bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600 active:scale-95 text-white rounded-xl font-black text-[10px] uppercase tracking-wider shadow-sm transition-all inline-flex items-center gap-1 cursor-pointer"
                              >
                                <LogOut className="w-3.5 h-3.5" />
                                <span>DAR SALIDA</span>
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Mobile Compact List View (md:hidden) */}
              <div className="md:hidden space-y-2">
                {paginatedLpns.map(item => {
                  const prodInfo = catalogMap.get(item.productCode?.trim().toLowerCase() || '');
                  const displayLocation = item.location 
                    ? `Rack ${item.location.rackId} • N${item.location.level}-P${item.location.position}`
                    : item.locationId 
                    ? `Ubicación ID: ${item.locationId}` 
                    : 'Piso / Recepción';

                  return (
                    <div 
                      key={item.lpn}
                      className="bg-white dark:bg-slate-900 rounded-2xl p-3 border border-slate-200/90 dark:border-slate-800 shadow-sm flex flex-col gap-2"
                    >
                      {/* Top Row: LPN + Ubicación */}
                      <div className="flex items-center justify-between gap-1.5">
                        <span className="px-2.5 py-1 bg-amber-100 dark:bg-amber-950/80 text-amber-900 dark:text-amber-200 rounded-lg font-mono text-xs font-black tracking-wider flex items-center gap-1 border border-amber-200 dark:border-amber-800 shrink-0">
                          <QrCode className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                          {item.lpn}
                        </span>

                        <span className={`px-2 py-0.5 rounded-md text-[10px] font-black uppercase border flex items-center gap-1 truncate max-w-[160px] ${
                          item.location || item.locationId
                            ? 'bg-emerald-50 text-emerald-800 border-emerald-200 dark:bg-emerald-950/50 dark:text-emerald-300 dark:border-emerald-800'
                            : 'bg-slate-100 text-slate-600 border-slate-200 dark:bg-slate-800 dark:text-slate-400 dark:border-slate-700'
                        }`}>
                          <MapPin className="w-3 h-3 shrink-0" />
                          <span className="truncate">{displayLocation}</span>
                        </span>
                      </div>

                      {/* Middle Row: Product Name & Code */}
                      <div>
                        <h4 className="font-black text-xs text-slate-900 dark:text-white uppercase leading-snug line-clamp-2">
                          {item.productName || 'Producto no especificado'}
                        </h4>
                        <div className="flex items-center gap-2 text-[10px] font-bold text-slate-400 mt-0.5">
                          {item.productCode && <span className="font-mono">COD: {item.productCode}</span>}
                          {prodInfo?.marca && <span className="truncate">| {prodInfo.marca}</span>}
                        </div>
                      </div>

                      {/* Bottom Row: Quantities & Action Button */}
                      <div className="flex items-center justify-between pt-1.5 border-t border-slate-100 dark:border-slate-800/80 mt-0.5">
                        <div className="text-[11px] font-black text-slate-700 dark:text-slate-300">
                          <span className="text-amber-600 dark:text-amber-400 font-bold">{item.cajas || 0}</span> Cj / <span className="text-amber-600 dark:text-amber-400 font-bold">{item.unidades || item.quantity || 0}</span> Un
                        </div>

                        <button
                          type="button"
                          onClick={() => {
                            setSelectedLpnItem(item);
                            setIsConfirmModalOpen(true);
                          }}
                          className="px-3.5 py-1.5 bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600 active:scale-95 text-white rounded-xl font-black text-[10px] uppercase tracking-wider shadow-sm transition-all inline-flex items-center gap-1 cursor-pointer"
                        >
                          <LogOut className="w-3.5 h-3.5" />
                          <span>DAR SALIDA</span>
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Pagination Controls Bottom */}
              {renderPaginationControls()}
            </>
          )}
        </div>
      ) : (
        /* Historial de Salidas Recientes (<10 min) */
        <div className="space-y-3">
          <div className="p-4 bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 rounded-2xl text-xs text-amber-900 dark:text-amber-200 flex items-start gap-2.5">
            <Info className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
            <div>
              <strong className="font-black uppercase block mb-0.5">Regla de Devolución (10 Minutos)</strong>
              <span>Si dio salida por error a un LPN, dispone de un temporizador en vivo de 10 minutos para anular la salida y restaurar el LPN a la reserva y a su rack original.</span>
            </div>
          </div>

          {recentExits.length === 0 ? (
            <div className="bg-white dark:bg-slate-900 rounded-3xl p-8 text-center border border-slate-200 dark:border-slate-800 shadow-sm">
              <Clock className="w-12 h-12 text-slate-300 dark:text-slate-700 mx-auto mb-3" />
              <h3 className="text-base font-black text-slate-700 dark:text-slate-200 uppercase">
                Sin Salidas Recientes
              </h3>
              <p className="text-xs text-slate-400 mt-1 max-w-sm mx-auto">
                Aún no se han registrado salidas de LPN en esta sesión.
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {recentExits.map((record, index) => {
                const timeRemainingStr = getTimeRemainingStr(record.exitedAt);
                const isExpired = !timeRemainingStr;
                const formattedExitTime = new Date(record.exitedAt).toLocaleTimeString('es-PE', { hour: '2-digit', minute: '2-digit', second: '2-digit' });

                return (
                  <div
                    key={`${record.lpn}-${record.exitedAt}-${index}`}
                    className={`bg-white dark:bg-slate-900 rounded-3xl p-4 sm:p-5 border shadow-sm transition-all flex flex-col md:flex-row items-start md:items-center justify-between gap-4 ${
                      record.reversed
                        ? 'border-slate-200 dark:border-slate-800 opacity-60 bg-slate-50/50'
                        : isExpired
                        ? 'border-slate-200 dark:border-slate-800'
                        : 'border-amber-300 dark:border-amber-700 bg-gradient-to-r from-amber-50/30 to-transparent'
                    }`}
                  >
                    <div className="flex-1 space-y-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="px-2.5 py-0.5 bg-slate-100 dark:bg-slate-800 text-slate-900 dark:text-white rounded-lg font-mono text-xs font-black">
                          {record.lpn}
                        </span>

                        <span className="text-xs font-bold text-slate-500 flex items-center gap-1">
                          <Clock className="w-3.5 h-3.5" />
                          <span>Hora salida: {formattedExitTime}</span>
                        </span>

                        <span className="text-xs font-bold text-slate-400">
                          • Por: {record.user}
                        </span>
                      </div>

                      <h4 className="font-black text-sm text-slate-800 dark:text-slate-100">
                        {record.item?.productName || 'Producto en Pallet'}
                      </h4>

                      <div className="flex flex-wrap items-center gap-3 text-xs text-slate-500 font-medium">
                        <span>Motivo: <strong className="text-slate-700 dark:text-slate-300">{record.reason}</strong></span>
                        {record.item?.quantity && (
                          <span>Cant: <strong className="text-slate-700 dark:text-slate-300">{record.item.quantity} u.</strong></span>
                        )}
                      </div>
                    </div>

                    {/* Status & Devolución Action */}
                    <div className="w-full md:w-auto shrink-0 flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
                      {record.reversed ? (
                        <span className="px-3 py-2 bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-700 rounded-xl font-black text-xs uppercase flex items-center justify-center gap-1.5">
                          <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                          <span>SALIDA ANULADA (DEVUELTO)</span>
                        </span>
                      ) : isExpired ? (
                        <span className="px-3 py-2 bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400 border border-slate-200 dark:border-slate-700 rounded-xl font-bold text-xs uppercase flex items-center justify-center gap-1.5">
                          <Clock className="w-4 h-4 text-slate-400" />
                          <span>TIEMPO EXPIRADO (+10 MIN)</span>
                        </span>
                      ) : (
                        <button
                          type="button"
                          disabled={isProcessing}
                          onClick={() => handleRevertDispatch(record)}
                          className="px-4 py-3 bg-emerald-600 hover:bg-emerald-700 active:scale-98 text-white rounded-2xl font-black text-xs uppercase tracking-wider shadow-md shadow-emerald-600/20 transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
                        >
                          <RotateCcw className="w-4 h-4 animate-spin-slow" />
                          <span>DEVOLVER A RESERVA</span>
                          <span className="px-2 py-0.5 bg-black/20 rounded-lg font-mono text-[11px] font-black">
                            ⏱️ {timeRemainingStr}
                          </span>
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Confirmation Modal for LPN Dispatch */}
      {isConfirmModalOpen && selectedLpnItem && (
        <div className="fixed inset-0 z-[500] bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in duration-200">
          <div className="bg-white dark:bg-slate-900 rounded-3xl p-5 md:p-6 max-w-md w-full shadow-2xl border border-slate-200 dark:border-slate-800 animate-in zoom-in-95 duration-150">
            
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800 mb-4">
              <div className="flex items-center gap-2">
                <div className="w-9 h-9 rounded-xl bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300 flex items-center justify-center">
                  <LogOut className="w-5 h-5" />
                </div>
                <h3 className="text-base font-black text-slate-900 dark:text-white uppercase tracking-wider">
                  Confirmar Salida LPN
                </h3>
              </div>
              <button
                type="button"
                onClick={() => {
                  setIsConfirmModalOpen(false);
                  setSelectedLpnItem(null);
                }}
                className="p-1.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* LPN details box */}
            <div className="p-4 bg-slate-50 dark:bg-slate-800/80 rounded-2xl border border-slate-200/80 dark:border-slate-700 space-y-2 mb-4">
              <div className="flex justify-between items-center">
                <span className="text-[10px] font-black uppercase text-slate-400">Código LPN</span>
                <span className="px-2.5 py-0.5 bg-amber-100 text-amber-900 dark:bg-amber-900/60 dark:text-amber-200 font-mono font-black text-xs rounded-lg">
                  {selectedLpnItem.lpn}
                </span>
              </div>

              <div>
                <span className="text-[10px] font-black uppercase text-slate-400 block">Producto</span>
                <p className="font-black text-sm text-slate-900 dark:text-white leading-tight">
                  {selectedLpnItem.productName}
                </p>
              </div>

              <div className="grid grid-cols-2 gap-2 pt-2 border-t border-slate-200/60 dark:border-slate-700/60 text-xs">
                <div>
                  <span className="text-[9px] font-black uppercase text-slate-400 block">Ubicación Rack</span>
                  <span className="font-bold text-slate-800 dark:text-slate-200">
                    {selectedLpnItem.location 
                      ? `Rack ${selectedLpnItem.location.rackId} • N${selectedLpnItem.location.level}-P${selectedLpnItem.location.position}` 
                      : 'Piso / Recepción'}
                  </span>
                </div>
                <div>
                  <span className="text-[9px] font-black uppercase text-slate-400 block">Cantidad Tot.</span>
                  <span className="font-bold text-slate-800 dark:text-slate-200">
                    {selectedLpnItem.cajas || 0} Cajas ({selectedLpnItem.unidades || selectedLpnItem.quantity || 0} u.)
                  </span>
                </div>
              </div>
            </div>

            {/* Reason selector */}
            <div className="space-y-1.5 mb-5">
              <label className="block text-xs font-black uppercase tracking-wider text-slate-700 dark:text-slate-300">
                Motivo de Salida
              </label>
              <select
                value={dispatchReason}
                onChange={e => setDispatchReason(e.target.value)}
                className="w-full p-3 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl font-bold text-xs sm:text-sm text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-amber-500"
              >
                <option value="Baja de Pallet para Picking / Consumo">Baja de Pallet para Picking / Consumo</option>
                <option value="Despacho a Cliente / Tienda">Despacho a Cliente / Tienda</option>
                <option value="Transferencia entre Almacenes">Transferencia entre Almacenes</option>
                <option value="Ajuste de Almacén / Reubicación Externa">Ajuste de Almacén / Reubicación Externa</option>
                <option value="Ajuste por Rotura / Merma">Ajuste por Rotura / Merma</option>
              </select>
            </div>

            {/* Action Buttons */}
            <div className="flex items-center gap-2 pt-2 border-t border-slate-100 dark:border-slate-800">
              <button
                type="button"
                onClick={() => {
                  setIsConfirmModalOpen(false);
                  setSelectedLpnItem(null);
                }}
                className="flex-1 py-3 px-4 rounded-xl font-bold text-xs uppercase text-slate-600 dark:text-slate-400 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors"
              >
                Cancelar
              </button>

              <button
                type="button"
                disabled={isProcessing}
                onClick={handleConfirmDispatch}
                className="flex-1 py-3 px-4 rounded-xl font-black text-xs uppercase tracking-wider text-white bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600 shadow-md shadow-amber-500/20 transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
              >
                {isProcessing ? (
                  <RefreshCw className="w-4 h-4 animate-spin" />
                ) : (
                  <LogOut className="w-4 h-4" />
                )}
                <span>CONFIRMAR SALIDA</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Camera Video Modal */}
      {isCameraActive && (
        <div className="fixed inset-0 z-[600] bg-black/90 flex flex-col items-center justify-between p-4">
          <div className="w-full flex items-center justify-between text-white pb-3 border-b border-white/20">
            <div className="flex items-center gap-2">
              <QrCode className="w-5 h-5 text-amber-400" />
              <span className="font-black uppercase text-sm">Escáner QR / Código LPN</span>
            </div>
            <button
              onClick={stopCameraScan}
              className="p-2 bg-white/10 hover:bg-white/20 rounded-xl text-white"
            >
              <X className="w-6 h-6" />
            </button>
          </div>

          <div className="relative w-full max-w-sm aspect-square bg-slate-900 rounded-3xl overflow-hidden border-2 border-amber-500/50 shadow-2xl my-auto flex items-center justify-center">
            <video
              ref={videoRef}
              playsInline
              muted
              className="w-full h-full object-cover"
            />
            <div className="absolute inset-0 border-2 border-dashed border-amber-400/80 rounded-2xl m-8 pointer-events-none animate-pulse flex items-center justify-center">
              <span className="bg-black/60 text-amber-300 text-[10px] font-black px-3 py-1 rounded-full uppercase">
                Apunta al código QR de LPN
              </span>
            </div>
          </div>

          <div className="w-full max-w-sm space-y-2 text-center pb-4">
            <p className="text-xs text-slate-300">
              O escriba el código LPN detectado:
            </p>
            <div className="flex gap-2">
              <input
                type="text"
                placeholder="Ingresar LPN detectado..."
                onChange={e => {
                  const val = e.target.value.trim();
                  if (val.length >= 4) {
                    setSearchQuery(val);
                  }
                }}
                className="flex-1 px-3 py-2.5 bg-slate-800 border border-slate-700 text-white rounded-xl text-sm font-mono font-bold"
              />
              <button
                onClick={() => {
                  stopCameraScan();
                  if (searchQuery) handleSearchSubmit({ preventDefault: () => {} } as any);
                }}
                className="px-4 py-2.5 bg-amber-600 text-white font-black text-xs uppercase rounded-xl"
              >
                OK
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Admin Excel Chamber Selector Modal */}
      {isAdminExcelModalOpen && (
        <div className="fixed inset-0 z-[999] bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4">
          <div className="bg-white dark:bg-slate-900 rounded-3xl max-w-lg w-full border border-slate-200 dark:border-slate-800 shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-200">
            <div className="p-4 sm:p-5 bg-gradient-to-r from-emerald-600 to-teal-600 text-white flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="p-2 bg-white/10 rounded-xl">
                  <FileSpreadsheet className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-black text-base uppercase">Exportar Inventario Reserva (Excel)</h3>
                  <p className="text-xs text-emerald-100 font-medium">LPNs pendientes de salida por Cámara</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsAdminExcelModalOpen(false)}
                className="p-1.5 hover:bg-white/20 rounded-xl transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-4 sm:p-6 space-y-4">
              <p className="text-xs text-slate-600 dark:text-slate-300 font-medium leading-relaxed">
                Seleccione la cámara o temperatura requerida para descargar en Excel todo el inventario que actualmente se encuentra en reserva y no se le ha dado salida:
              </p>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => handleExportExcel('TODOS')}
                  className="p-3.5 bg-slate-50 hover:bg-emerald-50 dark:bg-slate-800/80 dark:hover:bg-emerald-950/40 border-2 border-slate-200 hover:border-emerald-500 dark:border-slate-700 dark:hover:border-emerald-600 rounded-2xl text-left transition-all group flex flex-col justify-between cursor-pointer"
                >
                  <div className="flex items-center justify-between">
                    <span className="p-2 bg-emerald-100 dark:bg-emerald-900/60 text-emerald-700 dark:text-emerald-300 rounded-xl">
                      <Layers className="w-4 h-4" />
                    </span>
                    <span className="text-xs font-black text-slate-500 dark:text-slate-400 font-mono">
                      {activeLpns.length} LPNs
                    </span>
                  </div>
                  <div className="mt-3">
                    <span className="block font-black text-sm text-slate-900 dark:text-white uppercase group-hover:text-emerald-700 dark:group-hover:text-emerald-300">
                      TODAS LAS CÁMARAS
                    </span>
                    <span className="text-[11px] text-slate-500 dark:text-slate-400">Seco, Refrigerado y Congelado</span>
                  </div>
                </button>

                <button
                  type="button"
                  onClick={() => handleExportExcel('SECO')}
                  className="p-3.5 bg-slate-50 hover:bg-amber-50 dark:bg-slate-800/80 dark:hover:bg-amber-950/40 border-2 border-slate-200 hover:border-amber-500 dark:border-slate-700 dark:hover:border-amber-600 rounded-2xl text-left transition-all group flex flex-col justify-between cursor-pointer"
                >
                  <div className="flex items-center justify-between">
                    <span className="p-2 bg-amber-100 dark:bg-amber-900/60 text-amber-700 dark:text-amber-300 rounded-xl">
                      <Package className="w-4 h-4" />
                    </span>
                    <span className="text-xs font-black text-slate-500 dark:text-slate-400 font-mono">
                      {activeLpns.filter(i => getChamberForItem(i, catalogMap) === 'SECO').length} LPNs
                    </span>
                  </div>
                  <div className="mt-3">
                    <span className="block font-black text-sm text-slate-900 dark:text-white uppercase group-hover:text-amber-700 dark:group-hover:text-amber-300">
                      SECOS
                    </span>
                    <span className="text-[11px] text-slate-500 dark:text-slate-400">Productos a T° Ambiente</span>
                  </div>
                </button>

                <button
                  type="button"
                  onClick={() => handleExportExcel('REFRIGERADO')}
                  className="p-3.5 bg-slate-50 hover:bg-sky-50 dark:bg-slate-800/80 dark:hover:bg-sky-950/40 border-2 border-slate-200 hover:border-sky-500 dark:border-slate-700 dark:hover:border-sky-600 rounded-2xl text-left transition-all group flex flex-col justify-between cursor-pointer"
                >
                  <div className="flex items-center justify-between">
                    <span className="p-2 bg-sky-100 dark:bg-sky-900/60 text-sky-700 dark:text-sky-300 rounded-xl">
                      <RefreshCw className="w-4 h-4" />
                    </span>
                    <span className="text-xs font-black text-slate-500 dark:text-slate-400 font-mono">
                      {activeLpns.filter(i => getChamberForItem(i, catalogMap) === 'REFRIGERADO').length} LPNs
                    </span>
                  </div>
                  <div className="mt-3">
                    <span className="block font-black text-sm text-slate-900 dark:text-white uppercase group-hover:text-sky-700 dark:group-hover:text-sky-300">
                      REFRIGERADO
                    </span>
                    <span className="text-[11px] text-slate-500 dark:text-slate-400">Cámara Fresca (0°C a 4°C)</span>
                  </div>
                </button>

                <button
                  type="button"
                  onClick={() => handleExportExcel('CONGELADO')}
                  className="p-3.5 bg-slate-50 hover:bg-indigo-50 dark:bg-slate-800/80 dark:hover:bg-indigo-950/40 border-2 border-slate-200 hover:border-indigo-500 dark:border-slate-700 dark:hover:border-indigo-600 rounded-2xl text-left transition-all group flex flex-col justify-between cursor-pointer"
                >
                  <div className="flex items-center justify-between">
                    <span className="p-2 bg-indigo-100 dark:bg-indigo-900/60 text-indigo-700 dark:text-indigo-300 rounded-xl">
                      <Clock className="w-4 h-4" />
                    </span>
                    <span className="text-xs font-black text-slate-500 dark:text-slate-400 font-mono">
                      {activeLpns.filter(i => getChamberForItem(i, catalogMap) === 'CONGELADO').length} LPNs
                    </span>
                  </div>
                  <div className="mt-3">
                    <span className="block font-black text-sm text-slate-900 dark:text-white uppercase group-hover:text-indigo-700 dark:group-hover:text-indigo-300">
                      CONGELADO
                    </span>
                    <span className="text-[11px] text-slate-500 dark:text-slate-400">Cámara Congelada (-18°C)</span>
                  </div>
                </button>
              </div>
            </div>

            <div className="p-4 bg-slate-50 dark:bg-slate-800/60 border-t border-slate-200 dark:border-slate-800 flex justify-end">
              <button
                type="button"
                onClick={() => setIsAdminExcelModalOpen(false)}
                className="px-4 py-2 bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-200 font-bold text-xs uppercase rounded-xl hover:bg-slate-300 transition-colors cursor-pointer"
              >
                Cerrar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Admin Metrics & Aging Modal */}
      {isAdminMetricsModalOpen && (
        <div className="fixed inset-0 z-[999] bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-2 sm:p-4">
          <div className="bg-white dark:bg-slate-900 rounded-3xl max-w-4xl w-full max-h-[92vh] sm:max-h-[88vh] border border-slate-200 dark:border-slate-800 shadow-2xl flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-200">
            
            {/* Modal Header */}
            <div className="p-4 sm:p-5 bg-gradient-to-r from-sky-600 via-blue-600 to-indigo-600 text-white flex items-center justify-between shrink-0">
              <div className="flex items-center gap-3">
                <div className="p-2.5 bg-white/10 rounded-2xl">
                  <BarChart3 className="w-6 h-6" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="font-black text-base sm:text-lg uppercase">Métricas de Reserva & Antigüedad LPN</h3>
                    <span className="px-2 py-0.5 bg-white/20 text-white rounded-md text-[10px] font-black uppercase">Admin</span>
                  </div>
                  <p className="text-xs text-sky-100 font-medium">Análisis de unidades por Cámara y LPNs con mayor tiempo en reserva</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsAdminMetricsModalOpen(false)}
                className="p-2 hover:bg-white/20 rounded-xl transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-4 sm:p-6 space-y-6 flex-1 overflow-y-auto overscroll-contain">

              {/* 1. Summary Cards */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="p-3.5 bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 rounded-2xl">
                  <span className="text-[10px] font-black text-amber-700 dark:text-amber-400 uppercase block">Total LPNs Reserva</span>
                  <span className="text-xl sm:text-2xl font-black text-amber-900 dark:text-amber-200 mt-0.5 block font-mono">{adminMetricsData.totalLpns}</span>
                </div>

                <div className="p-3.5 bg-sky-50 dark:bg-sky-950/40 border border-sky-200 dark:border-sky-800 rounded-2xl">
                  <span className="text-[10px] font-black text-sky-700 dark:text-sky-400 uppercase block">Unidades Secos</span>
                  <span className="text-xl sm:text-2xl font-black text-sky-900 dark:text-sky-200 mt-0.5 block font-mono">{adminMetricsData.totalUnitsSeco.toLocaleString()}</span>
                </div>

                <div className="p-3.5 bg-blue-50 dark:bg-blue-950/40 border border-blue-200 dark:border-blue-800 rounded-2xl">
                  <span className="text-[10px] font-black text-blue-700 dark:text-blue-400 uppercase block">Unid. Refrigerado</span>
                  <span className="text-xl sm:text-2xl font-black text-blue-900 dark:text-blue-200 mt-0.5 block font-mono">{adminMetricsData.totalUnitsRefrig.toLocaleString()}</span>
                </div>

                <div className="p-3.5 bg-indigo-50 dark:bg-indigo-950/40 border border-indigo-200 dark:border-indigo-800 rounded-2xl">
                  <span className="text-[10px] font-black text-indigo-700 dark:text-indigo-400 uppercase block">Unid. Congelado</span>
                  <span className="text-xl sm:text-2xl font-black text-indigo-900 dark:text-indigo-200 mt-0.5 block font-mono">{adminMetricsData.totalUnitsCong.toLocaleString()}</span>
                </div>
              </div>

              {/* 2. Chart Section: Total Units per Camera */}
              <div className="bg-slate-50 dark:bg-slate-800/60 rounded-2xl p-4 border border-slate-200 dark:border-slate-800">
                <div className="flex items-center justify-between mb-3">
                  <h4 className="text-xs font-black text-slate-800 dark:text-slate-200 uppercase flex items-center gap-1.5">
                    <TrendingUp className="w-4 h-4 text-sky-500" />
                    <span>Gráfico: Total de Unidades por Cámara</span>
                  </h4>
                  <span className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase">
                    Peso Total Est: {adminMetricsData.totalWeightKg.toLocaleString('es-PE', { maximumFractionDigits: 1 })} kg
                  </span>
                </div>

                <div className="h-56 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={adminMetricsData.chartData} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" opacity={0.2} />
                      <XAxis dataKey="name" tick={{ fontSize: 11, fontWeight: 'bold' }} />
                      <YAxis tick={{ fontSize: 11 }} />
                      <RechartsTooltip 
                        formatter={(val: any) => [`${Number(val).toLocaleString()} unidades`, 'Cantidad']}
                        contentStyle={{ backgroundColor: '#0f172a', borderRadius: '12px', color: '#fff', fontSize: '12px', border: 'none' }}
                      />
                      <Bar dataKey="unidades" radius={[8, 8, 0, 0]} barSize={45}>
                        {adminMetricsData.chartData.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={entry.fill} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>

              {/* 3. Aging LPNs Table */}
              <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 overflow-hidden shadow-sm">
                <div className="p-3 bg-slate-100 dark:bg-slate-800/90 border-b border-slate-200 dark:border-slate-700 flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <Clock className="w-4 h-4 text-amber-600 shrink-0" />
                    <h4 className="text-xs font-black text-slate-800 dark:text-slate-100 uppercase">
                      LPNs MÁS ANTIGUOS EN RESERVA ({adminMetricsData.agingLpns.length} de {adminMetricsData.allAgingCount})
                    </h4>
                  </div>
                  
                  {/* Controls to change display limit */}
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => setAgingLimit(10)}
                      className={`px-2.5 py-1 rounded-lg text-[10px] font-black uppercase transition-all cursor-pointer ${
                        agingLimit === 10
                          ? 'bg-amber-600 text-white shadow-sm'
                          : 'bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200'
                      }`}
                    >
                      Top 10
                    </button>
                    <button
                      type="button"
                      onClick={() => setAgingLimit(50)}
                      className={`px-2.5 py-1 rounded-lg text-[10px] font-black uppercase transition-all cursor-pointer ${
                        agingLimit === 50
                          ? 'bg-amber-600 text-white shadow-sm'
                          : 'bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200'
                      }`}
                    >
                      Top 50
                    </button>
                    <button
                      type="button"
                      onClick={() => setAgingLimit(adminMetricsData.allAgingCount || 9999)}
                      className={`px-2.5 py-1 rounded-lg text-[10px] font-black uppercase transition-all cursor-pointer ${
                        agingLimit >= adminMetricsData.allAgingCount && adminMetricsData.allAgingCount > 0
                          ? 'bg-amber-600 text-white shadow-sm'
                          : 'bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200'
                      }`}
                    >
                      Ver Todos ({adminMetricsData.allAgingCount})
                    </button>
                  </div>
                </div>

                <div className="overflow-x-auto touch-pan-x">
                  <table className="w-full text-left border-collapse min-w-[650px]">
                    <thead>
                      <tr className="bg-slate-50 dark:bg-slate-800/50 border-b border-slate-200 dark:border-slate-700 text-[10px] font-black uppercase text-slate-500 dark:text-slate-400">
                        <th className="py-2.5 px-3 text-center">#</th>
                        <th className="py-2.5 px-3">CÓDIGO LPN</th>
                        <th className="py-2.5 px-3">PRODUCTO</th>
                        <th className="py-2.5 px-3">CÁMARA</th>
                        <th className="py-2.5 px-3">UBICACIÓN</th>
                        <th className="py-2.5 px-3 text-center">ANTIGÜEDAD</th>
                        <th className="py-2.5 px-3 text-center">CANTIDAD</th>
                        <th className="py-2.5 px-3 text-right">PESO EST.</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800 text-xs">
                      {adminMetricsData.agingLpns.length === 0 ? (
                        <tr>
                          <td colSpan={8} className="text-center py-6 text-slate-400 font-bold">
                            No hay LPNs en reserva actualmente
                          </td>
                        </tr>
                      ) : (
                        adminMetricsData.agingLpns.map((item, idx) => {
                          const ch = getChamberForItem(item, catalogMap);
                          const ageDays = getLpnAgeInDays(item);
                          const weightKg = getItemWeightKg(item, catalogMap);
                          const displayLoc = item.location 
                            ? `Rack ${item.location.rackId} • N${item.location.level}-P${item.location.position}`
                            : item.locationId 
                            ? `ID: ${item.locationId}` 
                            : 'Piso / Recepción';

                          return (
                            <tr key={item.lpn} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                              <td className="py-2.5 px-3 text-center font-black font-mono text-slate-400">
                                #{idx + 1}
                              </td>
                              <td className="py-2.5 px-3 font-mono font-black text-amber-900 dark:text-amber-200">
                                {item.lpn}
                              </td>
                              <td className="py-2.5 px-3 max-w-[200px]">
                                <div className="font-black text-slate-900 dark:text-white uppercase truncate text-xs">
                                  {item.productName || 'No especificado'}
                                </div>
                                <div className="text-[10px] font-bold text-slate-400 font-mono">
                                  {item.productCode}
                                </div>
                              </td>
                              <td className="py-2.5 px-3">
                                <span className={`px-2 py-0.5 rounded-md text-[10px] font-black uppercase ${
                                  ch === 'CONGELADO' 
                                    ? 'bg-indigo-100 text-indigo-800 dark:bg-indigo-950 dark:text-indigo-300'
                                    : ch === 'REFRIGERADO'
                                    ? 'bg-sky-100 text-sky-800 dark:bg-sky-950 dark:text-sky-300'
                                    : 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300'
                                }`}>
                                  {ch}
                                </span>
                              </td>
                              <td className="py-2.5 px-3 text-[11px] font-semibold text-slate-600 dark:text-slate-300">
                                {displayLoc}
                              </td>
                              <td className="py-2.5 px-3 text-center">
                                <span className={`px-2 py-1 rounded-lg text-xs font-black font-mono inline-flex items-center gap-1 ${
                                  ageDays > 30 
                                    ? 'bg-rose-100 text-rose-800 dark:bg-rose-950/80 dark:text-rose-300 border border-rose-300 dark:border-rose-800'
                                    : ageDays > 15
                                    ? 'bg-amber-100 text-amber-800 dark:bg-amber-950/80 dark:text-amber-300 border border-amber-300 dark:border-amber-800'
                                    : 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/80 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-800'
                                }`}>
                                  <Clock className="w-3 h-3 shrink-0" />
                                  {ageDays} días
                                </span>
                              </td>
                              <td className="py-2.5 px-3 text-center font-bold text-slate-800 dark:text-slate-200">
                                {item.cajas || 0} Cj / {item.unidades || item.quantity || 0} Un
                              </td>
                              <td className="py-2.5 px-3 text-right font-mono font-black text-slate-900 dark:text-white">
                                {weightKg.toLocaleString('es-PE', { maximumFractionDigits: 1 })} kg
                              </td>
                            </tr>
                          );
                        })
                      )}
                    </tbody>
                  </table>
                </div>
              </div>

            </div>

            {/* Footer */}
            <div className="p-4 bg-slate-50 dark:bg-slate-800/60 border-t border-slate-200 dark:border-slate-800 flex justify-end shrink-0">
              <button
                type="button"
                onClick={() => setIsAdminMetricsModalOpen(false)}
                className="px-5 py-2.5 bg-slate-800 hover:bg-slate-900 dark:bg-slate-700 dark:hover:bg-slate-600 text-white font-black text-xs uppercase rounded-xl transition-colors cursor-pointer"
              >
                Cerrar
              </button>
            </div>

          </div>
        </div>
      )}

    </div>
  );
};

export default SalidasLpn;
