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
  Calendar,
  Layers
} from 'lucide-react';
import { InventoryItem, Product, Usuario } from '../types';
import { supabase } from '../supabaseClient';

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
  const [visibleCount, setVisibleCount] = useState<number>(30);

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

  // Reset visibleCount when search or tab changes for instant render
  useEffect(() => {
    setVisibleCount(30);
  }, [searchQuery, activeTab]);

  const paginatedLpns = useMemo(() => {
    return filteredLpns.slice(0, visibleCount);
  }, [filteredLpns, visibleCount]);

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
    <div className="min-h-screen bg-slate-50/80 dark:bg-slate-950 p-2 sm:p-4 md:p-6 pb-24 text-slate-800 dark:text-slate-100">
      
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

      {/* Header Banner */}
      <div className="bg-white dark:bg-slate-900 rounded-3xl p-4 sm:p-5 shadow-sm border border-slate-200/80 dark:border-slate-800 mb-4">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
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
        <form onSubmit={handleSearchSubmit} className="mt-4 flex flex-col sm:flex-row items-stretch gap-2">
          <div className="relative flex-1">
            <input
              ref={searchInputRef}
              type="text"
              placeholder="Escriba o escanee LPN (ej: LPN-00104), EAN, Producto..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-10 py-3.5 bg-slate-50 dark:bg-slate-800/90 border-2 border-slate-200 dark:border-slate-700 rounded-2xl text-sm md:text-base font-bold outline-none focus:border-amber-500 focus:ring-2 focus:ring-amber-500/20 transition-all text-slate-900 dark:text-white placeholder-slate-400"
            />
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                className="absolute right-3.5 top-1/2 -translate-y-1/2 p-1 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>

          <button
            type="button"
            onClick={startCameraScan}
            className="px-4 py-3.5 bg-amber-600 hover:bg-amber-700 active:scale-98 text-white rounded-2xl font-black text-xs sm:text-sm uppercase shadow-md shadow-amber-600/20 transition-all flex items-center justify-center gap-2 cursor-pointer shrink-0"
          >
            <QrCode className="w-5 h-5" />
            <span>Cámara QR / LPN</span>
          </button>
        </form>
      </div>

      {/* Tabs Bar */}
      <div className="flex items-center gap-1.5 overflow-x-auto pb-2 mb-4 scrollbar-none">
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
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                {paginatedLpns.map(item => {
                  const prodInfo = catalogMap.get(item.productCode?.trim().toLowerCase() || '');
                  const displayLocation = item.location 
                    ? `Rack ${item.location.rackId} • Niv ${item.location.level} • Pos ${item.location.position}`
                    : item.locationId 
                    ? `Ubicación ID: ${item.locationId}` 
                    : 'Piso / Recepción (Sin Rack)';

                  return (
                    <div
                      key={item.lpn}
                      className="bg-white dark:bg-slate-900 rounded-3xl p-4 sm:p-5 border border-slate-200/80 dark:border-slate-800 shadow-sm hover:shadow-md transition-all flex flex-col justify-between gap-3 group"
                    >
                      {/* Header line: LPN code & location badge */}
                      <div>
                        <div className="flex items-start justify-between gap-2 mb-2">
                          <span className="px-3 py-1 bg-amber-50 dark:bg-amber-950/60 border border-amber-200 dark:border-amber-800 text-amber-900 dark:text-amber-200 rounded-xl font-mono text-xs sm:text-sm font-black tracking-wider flex items-center gap-1.5">
                            <QrCode className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                            <span>{item.lpn}</span>
                          </span>

                          <span className={`px-2.5 py-1 rounded-xl text-[10px] font-black uppercase border flex items-center gap-1 ${
                            item.location || item.locationId
                              ? 'bg-emerald-50 text-emerald-800 border-emerald-200 dark:bg-emerald-950/50 dark:text-emerald-300 dark:border-emerald-800'
                              : 'bg-slate-100 text-slate-600 border-slate-200 dark:bg-slate-800 dark:text-slate-400 dark:border-slate-700'
                          }`}>
                            <MapPin className="w-3 h-3 shrink-0" />
                            <span className="truncate max-w-[130px]">{displayLocation}</span>
                          </span>
                        </div>

                        {/* Product details */}
                        <h3 className="font-black text-sm sm:text-base text-slate-900 dark:text-white line-clamp-2 leading-snug">
                          {item.productName || 'Producto no especificado'}
                        </h3>

                        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-2 text-xs font-semibold text-slate-500 dark:text-slate-400">
                          {item.productCode && (
                            <span className="font-mono">EAN/SKU: <strong className="text-slate-700 dark:text-slate-200">{item.productCode}</strong></span>
                          )}
                          {prodInfo?.marca && (
                            <span>Marca: <strong className="text-slate-700 dark:text-slate-200">{prodInfo.marca}</strong></span>
                          )}
                        </div>

                        {/* Quantities breakdown */}
                        <div className="grid grid-cols-3 gap-2 mt-3 p-2.5 bg-slate-50 dark:bg-slate-800/60 rounded-2xl border border-slate-100 dark:border-slate-800 text-center">
                          <div>
                            <span className="block text-[9px] font-black text-slate-400 uppercase">Cajas</span>
                            <span className="text-sm font-black text-slate-800 dark:text-white">{item.cajas || 0}</span>
                          </div>
                          <div>
                            <span className="block text-[9px] font-black text-slate-400 uppercase">Unidades</span>
                            <span className="text-sm font-black text-slate-800 dark:text-white">{item.unidades || item.quantity || 0}</span>
                          </div>
                          <div>
                            <span className="block text-[9px] font-black text-slate-400 uppercase">Pallets</span>
                            <span className="text-sm font-black text-slate-800 dark:text-white">{item.pallets || 1}</span>
                          </div>
                        </div>

                        {item.expirationDate && (
                          <div className="mt-2 text-[11px] font-bold text-amber-700 dark:text-amber-400 flex items-center gap-1">
                            <Calendar className="w-3.5 h-3.5" />
                            <span>Vence: {item.expirationDate}</span>
                          </div>
                        )}
                      </div>

                      {/* Action Button */}
                      <button
                        type="button"
                        onClick={() => {
                          setSelectedLpnItem(item);
                          setIsConfirmModalOpen(true);
                        }}
                        className="w-full py-3 px-4 bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600 active:scale-98 text-white rounded-2xl font-black text-xs uppercase tracking-wider shadow-md shadow-amber-500/20 transition-all flex items-center justify-center gap-2 cursor-pointer mt-1"
                      >
                        <LogOut className="w-4 h-4" />
                        <span>DAR SALIDA A LPN</span>
                      </button>
                    </div>
                  );
                })}
              </div>

              {filteredLpns.length > visibleCount && (
                <div className="text-center pt-4 pb-2">
                  <button
                    type="button"
                    onClick={() => setVisibleCount(prev => prev + 30)}
                    className="px-6 py-3.5 bg-slate-200 dark:bg-slate-800 hover:bg-slate-300 dark:hover:bg-slate-700 active:scale-98 text-slate-800 dark:text-slate-100 text-xs font-black uppercase rounded-2xl transition-all shadow-sm cursor-pointer"
                  >
                    Cargar más LPNs ({filteredLpns.length - visibleCount} restantes)
                  </button>
                </div>
              )}
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

    </div>
  );
};

export default SalidasLpn;
