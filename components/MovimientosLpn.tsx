import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  Search,
  QrCode,
  Layers,
  ArrowDownToLine,
  ArrowUpToLine,
  ArrowRight,
  RotateCcw,
  CheckCircle2,
  AlertTriangle,
  RefreshCw,
  Warehouse,
  Building2,
  Package,
  MapPin,
  Camera,
  X,
  Undo2,
  Check,
  Info,
  MoveRight,
  ShoppingCart,
  Calendar,
  CheckSquare,
  Square,
  Trash2,
  Plus
} from 'lucide-react';
import { Html5Qrcode, Html5QrcodeSupportedFormats } from 'html5-qrcode';
import { InventoryItem, Product, Usuario, Rack, RackLocation, Zone, ZoneType } from '../types';
import { supabase } from '../supabaseClient';
import { InventoryMapExplorer } from './InventoryMapExplorer';

interface MovimientosLpnProps {
  inventory: InventoryItem[];
  catalog: Product[];
  racks: Rack[];
  zones?: Zone[];
  currentUser: Usuario | null;
  onAssignLocation: (lpn: string, location: RackLocation, reason?: string) => void;
  onRefresh: () => Promise<void>;
}

interface MovementLog {
  id?: string;
  lpn: string;
  tipo: 'UBICACION' | 'BAJADA_PICKING' | 'DIRECTO_PICKING' | 'REUBICACION' | 'DEVOLUCION_RACK' | 'MASIVO_PICKING' | 'MASIVO_RACK';
  origen: string;
  destino: string;
  usuario: string;
  fecha: string;
  timestamp: number;
  productName?: string;
  productCode?: string;
  quantity?: number;
  unidades?: number;
  cajas?: number;
  previousState?: 'PENDIENTE' | 'RESERVA' | 'PICKING';
  previousLocationId?: string | null;
  previousLocation?: RackLocation | null;
}

// Sound synthesized audio beep helper
function playFeedbackTone(type: 'success' | 'warn' | 'error') {
  try {
    const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioContextClass) return;
    const ctx = new AudioContextClass();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);

    if (type === 'success') {
      osc.type = 'sine';
      osc.frequency.setValueAtTime(880, ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(1320, ctx.currentTime + 0.1);
      gain.gain.setValueAtTime(0.15, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.12);
      osc.start();
      osc.stop(ctx.currentTime + 0.12);
    } else if (type === 'warn') {
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(440, ctx.currentTime);
      gain.gain.setValueAtTime(0.2, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.15);
      osc.start();
      osc.stop(ctx.currentTime + 0.15);
    } else {
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(220, ctx.currentTime);
      gain.gain.setValueAtTime(0.25, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.2);
      osc.start();
      osc.stop(ctx.currentTime + 0.2);
    }
  } catch {
    // Ignore audio autoplay restrictions
  }
}

// Format local time Peru UTC-5
function formatLocalPeruTime(dateStrOrTs: string | number | undefined | null): string {
  if (!dateStrOrTs) return '-';
  try {
    const d = typeof dateStrOrTs === 'number' ? new Date(dateStrOrTs) : new Date(dateStrOrTs);
    if (isNaN(d.getTime())) return '-';
    return new Intl.DateTimeFormat('es-PE', {
      timeZone: 'America/Lima',
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hour12: true
    }).format(d);
  } catch {
    return String(dateStrOrTs);
  }
}

export const MovimientosLpn: React.FC<MovimientosLpnProps> = ({
  inventory,
  catalog = [],
  racks,
  zones = [],
  currentUser,
  onAssignLocation,
  onRefresh
}) => {
  // Navigation Tabs
  const [activeTab, setActiveTab] = useState<'SCANNER' | 'RACKS' | 'PENDIENTES' | 'PICKING' | 'HISTORIAL' | 'MAPA_INVENTARIO'>('SCANNER');

  // Search & Barcode input
  const [scanInput, setScanInput] = useState('');
  const [selectedLpn, setSelectedLpn] = useState<InventoryItem | null>(null);
  const [searchFilter, setSearchFilter] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [soundEnabled] = useState(true);
  const [visibleCount, setVisibleCount] = useState(30);

  // ❄️ CÁMARA FILTER STATE ('TODOS' | 'SECO' | 'REFRIGERADO' | 'CONGELADO')
  const [selectedChamber, setSelectedChamber] = useState<'TODOS' | 'SECO' | 'REFRIGERADO' | 'CONGELADO'>('TODOS');
  const [isChamberModalOpen, setIsChamberModalOpen] = useState(false);

  // ⚡ ASÍNCRONO OPTIMISTA: Almacena cambios en caliente (0 ms) antes de que la BD termine
  const [optimisticOverrides, setOptimisticOverrides] = useState<Map<string, Partial<InventoryItem>>>(new Map());

  // 🛒 MULTI-SCAN BATCH QUEUE (Floating Bag)
  const [batchQueue, setBatchQueue] = useState<InventoryItem[]>([]);
  const [isBatchModalOpen, setIsBatchModalOpen] = useState(false);
  const [selectedBatchLpns, setSelectedBatchLpns] = useState<string[]>([]);

  // Rack modal state
  const [isRackModalOpen, setIsRackModalOpen] = useState(false);
  const [isBatchRackModalOpen, setIsBatchRackModalOpen] = useState(false);
  const [selectedRackId, setSelectedRackId] = useState<number | null>(null);
  const [selectedLevel, setSelectedLevel] = useState<number | null>(null);
  const [selectedPosition, setSelectedPosition] = useState<number | null>(null);
  const [manualLocationText, setManualLocationText] = useState('');
  const [showDetailedLocation, setShowDetailedLocation] = useState(false);

  // Toast notification
  const [toastMessage, setToastMessage] = useState<{ text: string; type: 'success' | 'error' | 'info' } | null>(null);

  // Local movement history with 10-min undo
  const [recentMoves, setRecentMoves] = useState<MovementLog[]>(() => {
    try {
      const saved = localStorage.getItem('smartrack_recent_lpn_moves');
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

  // Camera scanner state
  const [isCameraActive, setIsCameraActive] = useState(false);
  const html5QrCodeRef = useRef<Html5Qrcode | null>(null);
  const lastScannedTimeRef = useRef<{ code: string; time: number }>({ code: '', time: 0 });
  const inputRef = useRef<HTMLInputElement>(null);

  // Helper to trigger toast
  const showToast = (text: string, type: 'success' | 'error' | 'info' = 'success') => {
    setToastMessage({ text, type });
    if (soundEnabled) {
      playFeedbackTone(type === 'success' ? 'success' : type === 'error' ? 'error' : 'warn');
    }
    if (navigator.vibrate) {
      navigator.vibrate(type === 'success' ? [60] : [80, 40, 80]);
    }
    setTimeout(() => setToastMessage(null), 3500);
  };

  // Save recent moves to localStorage
  useEffect(() => {
    try {
      localStorage.setItem('smartrack_recent_lpn_moves', JSON.stringify(recentMoves.slice(0, 30)));
    } catch (e) {
      console.error(e);
    }
  }, [recentMoves]);

  // Merge server inventory with optimistic local changes for 0 ms UI feedback
  const effectiveInventory = useMemo(() => {
    if (optimisticOverrides.size === 0) return inventory;
    return inventory.map(item => {
      const override = optimisticOverrides.get(item.lpn);
      return override ? { ...item, ...override } : item;
    });
  }, [inventory, optimisticOverrides]);

  // Clean up optimistic overrides once server inventory has acknowledged them
  useEffect(() => {
    if (optimisticOverrides.size === 0) return;
    setOptimisticOverrides(prev => {
      let changed = false;
      const next = new Map(prev);
      for (const [lpn, override] of prev.entries()) {
        const item = inventory.find(i => i.lpn === lpn);
        if (!item) continue;
        if (override.tipo === 'PICKING' && (item.tipo === 'PICKING' || (item as any).estado_lpn === 'PICKING')) {
          next.delete(lpn);
          changed = true;
        } else if (override.location && item.location && item.location.rackId === override.location.rackId && item.location.level === override.location.level && item.location.position === override.location.position) {
          next.delete(lpn);
          changed = true;
        }
      }
      return changed ? next : prev;
    });
  }, [inventory]);

  // Catalog index for chamber determination
  const catalogMap = useMemo(() => {
    const map = new Map<string, Product>();
    if (catalog && Array.isArray(catalog)) {
      for (const p of catalog) {
        if (p.codigo) map.set(p.codigo.trim().toUpperCase(), p);
        if (p.id) map.set(p.id.trim().toUpperCase(), p);
        if (p.sku) map.set(p.sku.trim().toUpperCase(), p);
      }
    }
    return map;
  }, [catalog]);

  // Determine chamber for an inventory pallet
  const getItemChamber = (item: InventoryItem): ZoneType => {
    // 1. If currently located in rack, infer from aisle
    if (item.location?.aisle) {
      const a = item.location.aisle.trim().toUpperCase();
      if (a === 'A' || a === 'B') return 'SECO';
      if (a === 'C' || a === 'D') return 'REFRIGERADO';
      if (a === 'E' || a === 'F' || a === 'G') return 'CONGELADO';
    }

    // 2. Look up product in catalog
    const pCode = item.productCode?.trim().toUpperCase() || (item as any).producto_id?.trim().toUpperCase() || (item as any).sku?.trim().toUpperCase();
    const prod = pCode ? catalogMap.get(pCode) : null;
    if (prod) {
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
    }

    // 3. Keyword heuristic on product name
    const nameUpper = (item.productName || '').toUpperCase();
    if (nameUpper.includes('CONGEL') || nameUpper.includes('HELAD') || nameUpper.includes('PULPA') || nameUpper.includes('HIELO')) {
      return 'CONGELADO';
    }
    if (nameUpper.includes('REFRIG') || nameUpper.includes('LACTEO') || nameUpper.includes('QUESO') || nameUpper.includes('MANTEQUILLA') || nameUpper.includes('YOGURT') || nameUpper.includes('FIAMBRE') || nameUpper.includes('JAMON')) {
      return 'REFRIGERADO';
    }

    return 'SECO';
  };

  // Helper to determine real computed status of LPN
  const getLpnState = (item: InventoryItem): 'PENDIENTE' | 'RESERVA' | 'PICKING' => {
    if (item.estado_lpn === 'PICKING' || (item as any).tipo === 'PICKING' || (item.motivo_ultima_ubicacion && item.motivo_ultima_ubicacion.toLowerCase().includes('picking'))) return 'PICKING';
    if (item.location || item.locationId) {
      return 'RESERVA';
    }
    return 'PENDIENTE';
  };

  // 🔥 HIGH-PERFORMANCE SINGLE-PASS MEMOIZATION (con effectiveInventory para actualización optimista instantánea)
  const { lpnMap, suffixMap, activeList, pendientesList, reservasInRackList, pickingList } = useMemo(() => {
    const map = new Map<string, InventoryItem>();
    const sufMap = new Map<string, InventoryItem[]>();
    const act: InventoryItem[] = [];
    const pend: InventoryItem[] = [];
    const res: InventoryItem[] = [];
    const pick: InventoryItem[] = [];

    for (let i = 0; i < effectiveInventory.length; i++) {
      const item = effectiveInventory[i];
      if (!item.lpn || item.estado_lpn === 'ELIMINADO') continue;

      act.push(item);
      const cleanKey = item.lpn.trim().toUpperCase();
      map.set(cleanKey, item);

      // Index digits for 4, 5, 6 digit suffix matching
      const digitsOnly = cleanKey.replace(/\D/g, '');
      if (digitsOnly.length >= 4) {
        for (let len = 4; len <= Math.min(8, digitsOnly.length); len++) {
          const suffix = digitsOnly.slice(-len);
          const existing = sufMap.get(suffix) || [];
          existing.push(item);
          sufMap.set(suffix, existing);
        }
      }

      const state = (item.estado_lpn === 'PICKING' || (item as any).tipo === 'PICKING' || (item.motivo_ultima_ubicacion && item.motivo_ultima_ubicacion.toLowerCase().includes('picking')))
        ? 'PICKING'
        : (item.location || item.locationId)
          ? 'RESERVA'
          : 'PENDIENTE';

      if (state === 'PENDIENTE') pend.push(item);
      else if (state === 'RESERVA') res.push(item);
      else pick.push(item);
    }

    return {
      lpnMap: map,
      suffixMap: sufMap,
      activeList: act,
      pendientesList: pend,
      reservasInRackList: res,
      pickingList: pick
    };
  }, [effectiveInventory]);

  // Real-time counts by chamber specifically for PENDIENTES
  const pendingChamberCounts = useMemo(() => {
    let seco = 0;
    let refrigerado = 0;
    let congelado = 0;

    for (const item of pendientesList) {
      const ch = getItemChamber(item);
      if (ch === 'SECO') seco++;
      else if (ch === 'REFRIGERADO') refrigerado++;
      else if (ch === 'CONGELADO') congelado++;
    }

    return {
      total: pendientesList.length,
      seco,
      refrigerado,
      congelado
    };
  }, [pendientesList, catalogMap]);

  // Real-time counts by chamber for the currently active tab (Pendientes / En Rack / Picking)
  const currentTabChamberCounts = useMemo(() => {
    let baseList = pendientesList;
    if (activeTab === 'RACKS') baseList = reservasInRackList;
    else if (activeTab === 'PICKING') baseList = pickingList;

    let seco = 0;
    let refrigerado = 0;
    let congelado = 0;

    for (const item of baseList) {
      const ch = getItemChamber(item);
      if (ch === 'SECO') seco++;
      else if (ch === 'REFRIGERADO') refrigerado++;
      else if (ch === 'CONGELADO') congelado++;
    }

    return {
      total: baseList.length,
      seco,
      refrigerado,
      congelado
    };
  }, [activeTab, pendientesList, reservasInRackList, pickingList, catalogMap]);

  // Find LPN by scanned string, full code or 4-5 trailing digits
  const findLpnCandidate = (rawCode: string): InventoryItem | null => {
    const clean = rawCode.trim().toUpperCase();
    if (!clean) return null;

    // 1. Direct match
    let found = lpnMap.get(clean);
    if (found) return found;

    // 2. LPN prefix variance
    if (!clean.startsWith('LPN')) {
      found = lpnMap.get(`LPN${clean}`) || lpnMap.get(`LPN-${clean}`);
    } else {
      const withoutPrefix = clean.replace(/^LPN-?/, '');
      found = lpnMap.get(withoutPrefix);
    }
    if (found) return found;

    // 3. Suffix match (last 4, 5 or 6 digits)
    const digitsOnly = clean.replace(/\D/g, '');
    if (digitsOnly.length >= 3) {
      const matches = suffixMap.get(digitsOnly);
      if (matches && matches.length > 0) {
        return matches[0]; // Match first exact suffix candidate
      }
    }

    // 4. Substring search in active items as fallback
    if (clean.length >= 4) {
      return activeList.find(i => i.lpn.includes(clean)) || null;
    }

    return null;
  };

  // Fast PDA/Scan handler: adds automatically to Cola and displays pallet preview
  const handleLookupLpn = (rawCode: string, addToBatch: boolean = true) => {
    const found = findLpnCandidate(rawCode);

    if (found) {
      setSelectedLpn(found);
      if (addToBatch) {
        // Multi-scan cola mode
        if (batchQueue.some(b => b.lpn === found.lpn)) {
          showToast(`LPN ${found.lpn} ya está en la cola`, "info");
        } else {
          setBatchQueue(prev => [found, ...prev]);
          setSelectedBatchLpns(prev => [...prev, found.lpn]);
          showToast(`+ En Cola: ${found.lpn} (Total: ${batchQueue.length + 1})`, "success");
        }
      } else {
        showToast(`${found.lpn} seleccionado`, "success");
      }
      setScanInput('');
    } else {
      showToast(`No se encontró LPN con "${rawCode}"`, "error");
    }

    // Auto re-focus for high-speed PDA gun scanning
    setTimeout(() => {
      inputRef.current?.focus();
    }, 60);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      if (scanInput.trim()) {
        handleLookupLpn(scanInput, true);
      }
    }
  };

  // Add currently selected single LPN into cola queue
  const handleAddCurrentToBatch = () => {
    if (!selectedLpn) return;
    if (batchQueue.some(b => b.lpn === selectedLpn.lpn)) {
      showToast(`LPN ${selectedLpn.lpn} ya está en la cola`, "info");
    } else {
      setBatchQueue(prev => [selectedLpn, ...prev]);
      setSelectedBatchLpns(prev => [...prev, selectedLpn.lpn]);
      showToast(`+ En Cola: ${selectedLpn.lpn} (Total: ${batchQueue.length + 1})`, "success");
    }
  };

  // 🚀 ACTION 1: BAJAR A PICKING (INDIVIDUAL) - 100% ASÍNCRONO OPTIMISTA (0 ms)
  const handleBajarAPicking = (item: InventoryItem, reason: string = 'Bajada a Picking') => {
    const lpnCode = item.lpn;
    const currentState = getLpnState(item);
    const oldLocationId = item.locationId || item.location?.id;
    const oldLocation = item.location;
    const operatorName = currentUser?.nombre || currentUser?.username || 'OPERADOR';
    const nowIso = new Date().toISOString();

    // ⚡ 1. ACTUALIZACIÓN INMEDIATA OPTIMISTA (0 ms)
    setOptimisticOverrides(prev => {
      const next = new Map(prev);
      next.set(lpnCode, {
        estado_lpn: 'GENERADO',
        tipo: 'PICKING',
        location: undefined,
        locationId: undefined,
        motivo_ultima_ubicacion: reason,
        usuario_ultima_ubicacion: operatorName,
        fecha_ultima_ubicacion: nowIso
      });
      return next;
    });

    const isDirectFromPendiente = currentState === 'PENDIENTE';
    const newMove: MovementLog = {
      lpn: lpnCode,
      tipo: isDirectFromPendiente ? 'DIRECTO_PICKING' : 'BAJADA_PICKING',
      origen: oldLocation ? `RACK ${oldLocation.aisle}-R${oldLocation.rackId}-N${oldLocation.level}-P${oldLocation.position}` : 'Playa Recepción',
      destino: 'Zona Picking',
      usuario: operatorName,
      fecha: nowIso,
      timestamp: Date.now(),
      productName: item.productName,
      productCode: item.productCode,
      quantity: item.quantity,
      cajas: item.cajas,
      unidades: item.unidades,
      previousState: currentState,
      previousLocationId: oldLocationId || null,
      previousLocation: oldLocation || null
    };

    setRecentMoves(prev => [newMove, ...prev.filter(m => !(m.lpn === lpnCode && Date.now() - m.timestamp < 1000))]);
    setBatchQueue(prev => prev.filter(b => b.lpn !== lpnCode));
    setSelectedBatchLpns(prev => prev.filter(l => l !== lpnCode));
    setSelectedLpn(prev => prev && prev.lpn === lpnCode ? { ...prev, estado_lpn: 'GENERADO', tipo: 'PICKING', motivo_ultima_ubicacion: reason, location: null, locationId: undefined } : null);

    showToast(`⚡ LPN ${lpnCode} pasado a PICKING`, "success");

    // 🌐 2. PERSISTENCIA EN SEGUNDO PLANO (BACKGROUND ASYNC)
    void (async () => {
      try {
        if (oldLocationId) {
          await supabase
            .from('ubicaciones')
            .update({ estado: 'VACIO' })
            .eq('id', oldLocationId);
        }

        const { error: lpnErr } = await supabase
          .from('paletas_lpn')
          .update({
            estado: 'ACTIVO',
            estado_lpn: 'GENERADO',
            tipo: 'PICKING',
            ubicacion_id: null,
            usuario_ultima_ubicacion: operatorName,
            fecha_ultima_ubicacion: nowIso,
            motivo_ultima_ubicacion: reason
          })
          .eq('lpn', lpnCode);

        if (lpnErr) throw lpnErr;

        await supabase.from('lpn_movimientos').insert([{
          lpn: lpnCode,
          ubicacion_id: oldLocationId || null,
          tipo_movimiento: isDirectFromPendiente ? 'DIRECTO_PICKING' : 'BAJADA_PICKING',
          usuario: operatorName,
          motivo: reason,
          cantidad_afectada: item.quantity || item.unidades || item.cajas || 1,
          fecha: nowIso,
          sede_id: currentUser?.sede_id
        }]);

        await onRefresh();
      } catch (err: any) {
        console.error("Error asíncrono bajando LPN a picking:", err);
        // Revertir optimismo en caso de error
        setOptimisticOverrides(prev => {
          const next = new Map(prev);
          next.delete(lpnCode);
          return next;
        });
        showToast(`Error al sincronizar con BD: ${err?.message || 'Fallo de conexión'}`, "error");
      }
    })();
  };

  // 🚀 ACTION 2: RACKEAR / ASIGNAR EN ALTURA (INDIVIDUAL) - 100% ASÍNCRONO OPTIMISTA (0 ms)
  const handleConfirmRackAssignment = () => {
    if (!selectedLpn) return;
    if (!selectedRackId || !selectedLevel || !selectedPosition) {
      if (manualLocationText.trim()) {
        parseAndApplyManualLocation(manualLocationText.trim());
        return;
      }
      showToast("Seleccione o ingrese una ubicación.", "error");
      return;
    }

    const rack = racks.find(r => r.id === selectedRackId);
    if (!rack) {
      showToast("Rack no encontrado.", "error");
      return;
    }

    const targetLocation: RackLocation = {
      aisle: rack.aisle,
      rackId: rack.id,
      level: selectedLevel,
      position: selectedPosition
    };

    const lpnCode = selectedLpn.lpn;
    const currentState = getLpnState(selectedLpn);
    const oldLocation = selectedLpn.location;
    const oldLocationId = selectedLpn.locationId;
    const operatorName = currentUser?.nombre || currentUser?.username || 'OPERADOR';
    const nowIso = new Date().toISOString();

    // ⚡ 1. ACTUALIZACIÓN INMEDIATA OPTIMISTA (0 ms)
    onAssignLocation(lpnCode, targetLocation, currentState === 'PENDIENTE' ? 'Rackeo inicial' : 'Reubicación');

    setOptimisticOverrides(prev => {
      const next = new Map(prev);
      next.set(lpnCode, {
        estado_lpn: 'GENERADO',
        tipo: 'RECEPCION',
        location: targetLocation,
        locationId: undefined,
        motivo_ultima_ubicacion: currentState === 'PENDIENTE' ? 'Rackeo inicial' : 'Reubicación',
        usuario_ultima_ubicacion: operatorName,
        fecha_ultima_ubicacion: nowIso
      });
      return next;
    });

    const newMove: MovementLog = {
      lpn: lpnCode,
      tipo: currentState === 'PENDIENTE' ? 'UBICACION' : 'REUBICACION',
      origen: oldLocation ? `RACK ${oldLocation.aisle}-R${oldLocation.rackId}-N${oldLocation.level}-P${oldLocation.position}` : (currentState === 'PICKING' ? 'Zona Picking' : 'Playa Recepción'),
      destino: `RACK ${targetLocation.aisle}-R${targetLocation.rackId}-N${targetLocation.level}-P${targetLocation.position}`,
      usuario: operatorName,
      fecha: nowIso,
      timestamp: Date.now(),
      productName: selectedLpn.productName,
      productCode: selectedLpn.productCode,
      quantity: selectedLpn.quantity,
      cajas: selectedLpn.cajas,
      unidades: selectedLpn.unidades,
      previousState: currentState,
      previousLocationId: oldLocationId || null,
      previousLocation: oldLocation || null
    };

    setRecentMoves(prev => [newMove, ...prev]);

    // Cerrar modal y limpiar campos de inmediato sin congelar la app
    setIsRackModalOpen(false);
    setSelectedRackId(null);
    setSelectedLevel(null);
    setSelectedPosition(null);
    setManualLocationText('');
    setShowDetailedLocation(false);

    setBatchQueue(prev => prev.filter(b => b.lpn !== lpnCode));
    setSelectedBatchLpns(prev => prev.filter(l => l !== lpnCode));
    setSelectedLpn(null);

    showToast(`⚡ LPN ${lpnCode} ubicado en ${targetLocation.aisle}-R${targetLocation.rackId}-N${targetLocation.level}-P${targetLocation.position}`, "success");

    // 🌐 2. PERSISTENCIA EN SEGUNDO PLANO (BACKGROUND ASYNC)
    void (async () => {
      try {
        await supabase
          .from('paletas_lpn')
          .update({
            estado: 'ACTIVO',
            estado_lpn: 'GENERADO',
            tipo: 'RECEPCION',
            usuario_ultima_ubicacion: operatorName,
            fecha_ultima_ubicacion: nowIso
          })
          .eq('lpn', lpnCode);

        await onRefresh();
      } catch (err: any) {
        console.error("Error al almacenar en rack:", err);
        setOptimisticOverrides(prev => {
          const next = new Map(prev);
          next.delete(lpnCode);
          return next;
        });
        showToast(`Error al guardar en BD: ${err?.message || 'Fallo desconocido'}`, "error");
      }
    })();
  };

  // ⚡ RACKEO RÁPIDO CON BOTONES (A, B, C, D, E) - 100% ASÍNCRONO OPTIMISTA (0 ms)
  const handleFastRackSelect = (rackLetter: string) => {
    if (!selectedLpn) {
      showToast("Seleccione un LPN primero", "error");
      return;
    }

    const lpnCode = selectedLpn.lpn;
    const currentState = getLpnState(selectedLpn);
    const oldLocation = selectedLpn.location;
    const oldLocationId = selectedLpn.locationId || oldLocation?.id;
    const operatorName = currentUser?.nombre || currentUser?.username || 'OPERADOR';
    const nowIso = new Date().toISOString();
    const letterUpper = rackLetter.toUpperCase();

    // Buscar rack por letra de pasillo (A, B, C, D, E...)
    const matchingRacks = racks.filter(r => r.aisle?.toUpperCase() === letterUpper);
    const selectedRack = matchingRacks.find(r => r.slots.some(s => s.status === 'empty')) 
      || matchingRacks[0] 
      || racks.find(r => r.aisle?.toUpperCase().includes(letterUpper)) 
      || racks[0];

    if (!selectedRack) {
      showToast(`Rack ${letterUpper} no configurado en esta sede`, "error");
      return;
    }

    const targetSlot = selectedRack.slots.find(s => s.status === 'empty') || selectedRack.slots[0];
    const targetLevel = targetSlot ? targetSlot.location.level : 1;
    const targetPosition = targetSlot ? targetSlot.location.position : 1;

    const targetLocation: RackLocation = {
      aisle: selectedRack.aisle,
      rackId: selectedRack.id,
      level: targetLevel,
      position: targetPosition
    };

    // ⚡ 1. ACTUALIZACIÓN INMEDIATA OPTIMISTA (0 ms)
    onAssignLocation(lpnCode, targetLocation, currentState === 'PENDIENTE' ? `Rackeo inicial a Rack ${letterUpper}` : `Reubicación a Rack ${letterUpper}`);

    setOptimisticOverrides(prev => {
      const next = new Map(prev);
      next.set(lpnCode, {
        estado_lpn: 'GENERADO',
        tipo: 'RECEPCION',
        location: targetLocation,
        locationId: targetSlot?.dbId,
        motivo_ultima_ubicacion: `Rackeo a Rack ${letterUpper}`,
        usuario_ultima_ubicacion: operatorName,
        fecha_ultima_ubicacion: nowIso
      });
      return next;
    });

    const newMove: MovementLog = {
      lpn: lpnCode,
      tipo: currentState === 'PENDIENTE' ? 'UBICACION' : 'REUBICACION',
      origen: oldLocation ? `RACK ${oldLocation.aisle}-R${oldLocation.rackId}-N${oldLocation.level}-P${oldLocation.position}` : (currentState === 'PICKING' ? 'Zona Picking' : 'Playa Recepción'),
      destino: `RACK ${selectedRack.aisle} (N${targetLevel}-P${targetPosition})`,
      usuario: operatorName,
      fecha: nowIso,
      timestamp: Date.now(),
      productName: selectedLpn.productName,
      productCode: selectedLpn.productCode,
      quantity: selectedLpn.quantity,
      cajas: selectedLpn.cajas,
      unidades: selectedLpn.unidades,
      previousState: currentState,
      previousLocationId: oldLocationId || null,
      previousLocation: oldLocation || null
    };

    setRecentMoves(prev => [newMove, ...prev]);

    // Cerrar modal y limpiar campos de inmediato sin congelar la pantalla
    setIsRackModalOpen(false);
    setSelectedRackId(null);
    setSelectedLevel(null);
    setSelectedPosition(null);
    setManualLocationText('');
    setShowDetailedLocation(false);

    setBatchQueue(prev => prev.filter(b => b.lpn !== lpnCode));
    setSelectedBatchLpns(prev => prev.filter(l => l !== lpnCode));
    setSelectedLpn(null);

    showToast(`⚡ LPN ${lpnCode} rackeado en RACK ${letterUpper} con éxito`, "success");

    // 🌐 2. PERSISTENCIA EN SEGUNDO PLANO (BACKGROUND ASYNC)
    void (async () => {
      try {
        if (oldLocationId) {
          await supabase
            .from('ubicaciones')
            .update({ estado: 'VACIO' })
            .eq('id', oldLocationId);
        }

        if (targetSlot?.dbId) {
          await supabase
            .from('ubicaciones')
            .update({ estado: 'OCUPADO' })
            .eq('id', targetSlot.dbId);
        }

        const { error: lpnErr } = await supabase
          .from('paletas_lpn')
          .update({
            estado: 'ACTIVO',
            estado_lpn: 'GENERADO',
            tipo: 'RECEPCION',
            ubicacion_id: targetSlot?.dbId || null,
            usuario_ultima_ubicacion: operatorName,
            fecha_ultima_ubicacion: nowIso,
            motivo_ultima_ubicacion: `Rackeo a Rack ${letterUpper}`
          })
          .eq('lpn', lpnCode);

        if (lpnErr) throw lpnErr;

        await supabase.from('lpn_movimientos').insert([{
          lpn: lpnCode,
          ubicacion_id: targetSlot?.dbId || null,
          tipo_movimiento: currentState === 'PENDIENTE' ? 'UBICACION' : 'REUBICACION',
          usuario: operatorName,
          motivo: `Rackeo rápido a Rack ${letterUpper}`,
          cantidad_afectada: selectedLpn.quantity || selectedLpn.unidades || selectedLpn.cajas || 1,
          fecha: nowIso,
          sede_id: currentUser?.sede_id
        }]);

        await onRefresh();
      } catch (err: any) {
        console.error("Error al almacenar en rack:", err);
        setOptimisticOverrides(prev => {
          const next = new Map(prev);
          next.delete(lpnCode);
          return next;
        });
        showToast(`Error al rackear: ${err?.message || 'Fallo desconocido'}`, "error");
      }
    })();
  };

  // ⚡ RACKEO RÁPIDO MASIVO CON BOTONES (A, B, C, D, E) - 100% ASÍNCRONO OPTIMISTA (0 ms)
  const handleFastBatchRackSelect = (rackLetter: string) => {
    if (selectedBatchLpns.length === 0) return;

    const operatorName = currentUser?.nombre || currentUser?.username || 'OPERADOR';
    const nowIso = new Date().toISOString();
    const letterUpper = rackLetter.toUpperCase();

    const matchingRacks = racks.filter(r => r.aisle?.toUpperCase() === letterUpper);
    const selectedRack = matchingRacks.find(r => r.slots.some(s => s.status === 'empty')) 
      || matchingRacks[0] 
      || racks.find(r => r.aisle?.toUpperCase().includes(letterUpper)) 
      || racks[0];

    if (!selectedRack) {
      showToast(`Rack ${letterUpper} no configurado`, "error");
      return;
    }

    const emptySlots = selectedRack.slots.filter(s => s.status === 'empty');
    const targetItems = inventory.filter(i => selectedBatchLpns.includes(i.lpn));
    const assignedSlots: Array<{ item: InventoryItem; slot: any; location: RackLocation }> = [];

    // ⚡ 1. ACTUALIZACIÓN INMEDIATA OPTIMISTA (0 ms)
    setOptimisticOverrides(prev => {
      const next = new Map(prev);
      for (let i = 0; i < targetItems.length; i++) {
        const item = targetItems[i];
        const slot = emptySlots[i] || selectedRack.slots[0];
        const targetLocation: RackLocation = {
          aisle: selectedRack.aisle,
          rackId: selectedRack.id,
          level: slot.location.level,
          position: slot.location.position
        };
        assignedSlots.push({ item, slot, location: targetLocation });
        onAssignLocation(item.lpn, targetLocation, `Rackeo masivo a Rack ${letterUpper}`);
        next.set(item.lpn, {
          estado_lpn: 'GENERADO',
          tipo: 'RECEPCION',
          location: targetLocation,
          locationId: slot.dbId,
          motivo_ultima_ubicacion: `Rackeo masivo a Rack ${letterUpper}`
        });
      }
      return next;
    });

    setIsBatchRackModalOpen(false);
    setBatchQueue(prev => prev.filter(b => !selectedBatchLpns.includes(b.lpn)));
    setSelectedBatchLpns([]);

    showToast(`⚡ ${targetItems.length} pallets rackeados en RACK ${letterUpper}`, "success");

    // 🌐 2. PERSISTENCIA EN SEGUNDO PLANO (BACKGROUND ASYNC)
    void (async () => {
      try {
        for (const { item, slot } of assignedSlots) {
          if (slot.dbId) {
            await supabase.from('ubicaciones').update({ estado: 'OCUPADO' }).eq('id', slot.dbId);
          }

          await supabase
            .from('paletas_lpn')
            .update({
              estado: 'ACTIVO',
              estado_lpn: 'GENERADO',
              tipo: 'RECEPCION',
              ubicacion_id: slot.dbId || null,
              usuario_ultima_ubicacion: operatorName,
              fecha_ultima_ubicacion: nowIso,
              motivo_ultima_ubicacion: `Rackeo masivo a Rack ${letterUpper}`
            })
            .eq('lpn', item.lpn);
        }

        await onRefresh();
      } catch (err: any) {
        console.error("Error en rackeo masivo:", err);
        showToast(`Error en persistencia masiva: ${err?.message || 'Fallo desconocido'}`, "error");
      }
    })();
  };

  const parseAndApplyManualLocation = (text: string) => {
    const clean = text.toUpperCase().replace(/^UBC-/, '').replace(/\s+/g, '');
    const match = clean.match(/([A-Z]+)[-_]?(\d+)[-_]?[Nn]?(\d+)[-_]?[Pp]?(\d+)/);
    if (!match) {
      showToast(`Formato inválido. Ej: A-01-N1-P2`, "error");
      return;
    }

    const [, aisle, rackNumStr, levelStr, posStr] = match;
    const rackNum = parseInt(rackNumStr, 10);
    const level = parseInt(levelStr, 10);
    const pos = parseInt(posStr, 10);

    const foundRack = racks.find(r => r.aisle.toUpperCase() === aisle.toUpperCase() && (r.id === rackNum || r.aisle.includes(aisle)));
    if (!foundRack) {
      showToast(`No existe rack ${aisle}-${rackNum}`, "error");
      return;
    }

    const targetLocation: RackLocation = {
      aisle: foundRack.aisle,
      rackId: foundRack.id,
      level: level,
      position: pos
    };

    if (!selectedLpn) return;
    const lpnCode = selectedLpn.lpn;
    const operatorName = currentUser?.nombre || currentUser?.username || 'OPERADOR';
    const nowIso = new Date().toISOString();

    // ⚡ 1. ACTUALIZACIÓN INMEDIATA OPTIMISTA (0 ms)
    onAssignLocation(lpnCode, targetLocation, 'Rackeo Manual Escaneado');
    setOptimisticOverrides(prev => {
      const next = new Map(prev);
      next.set(lpnCode, {
        estado_lpn: 'GENERADO',
        tipo: 'RECEPCION',
        location: targetLocation,
        motivo_ultima_ubicacion: 'Rackeo Manual Escaneado',
        usuario_ultima_ubicacion: operatorName,
        fecha_ultima_ubicacion: nowIso
      });
      return next;
    });

    setIsRackModalOpen(false);
    setManualLocationText('');
    setSelectedLpn(null);
    showToast(`⚡ Ubicado en ${foundRack.aisle}-R${foundRack.id}-N${level}-P${pos}`, "success");

    // 🌐 2. PERSISTENCIA EN SEGUNDO PLANO (BACKGROUND ASYNC)
    void (async () => {
      try {
        await supabase
          .from('paletas_lpn')
          .update({
            estado: 'ACTIVO',
            estado_lpn: 'GENERADO',
            tipo: 'RECEPCION',
            usuario_ultima_ubicacion: operatorName,
            fecha_ultima_ubicacion: nowIso
          })
          .eq('lpn', lpnCode);

        await onRefresh();
      } catch (e: any) {
        setOptimisticOverrides(prev => {
          const next = new Map(prev);
          next.delete(lpnCode);
          return next;
        });
        showToast(`Error al persistir ubicación: ${e?.message}`, "error");
      }
    })();
  };

  // 🔥 ACTION 4: PROCESAMIENTO MASIVO (BATCH A PICKING O RACK) - 100% ASÍNCRONO OPTIMISTA (0 ms)
  const handleExecuteBatchMove = (action: 'PICKING' | 'RACK') => {
    if (selectedBatchLpns.length === 0) {
      showToast("Seleccione al menos 1 LPN.", "error");
      return;
    }

    const targetItems = batchQueue.filter(item => selectedBatchLpns.includes(item.lpn));
    if (targetItems.length === 0) return;

    if (action === 'RACK') {
      // Open Rack assignment modal for batch
      setIsBatchRackModalOpen(true);
      return;
    }

    // Direct Batch to PICKING
    const operatorName = currentUser?.nombre || currentUser?.username || 'OPERADOR';
    const nowIso = new Date().toISOString();

    const locationIdsToFree: string[] = [];
    const lpnCodesToUpdate: string[] = [];
    const logsToInsert: any[] = [];
    const newMovesList: MovementLog[] = [];

    // ⚡ 1. ACTUALIZACIÓN INMEDIATA OPTIMISTA (0 ms)
    setOptimisticOverrides(prev => {
      const next = new Map(prev);
      for (const item of targetItems) {
        const lpnCode = item.lpn;
        const oldLocId = item.locationId || item.location?.id;
        if (oldLocId) locationIdsToFree.push(oldLocId);
        lpnCodesToUpdate.push(lpnCode);

        next.set(lpnCode, {
          estado_lpn: 'GENERADO',
          tipo: 'PICKING',
          location: undefined,
          locationId: undefined,
          motivo_ultima_ubicacion: `Pase Masivo a Picking (${targetItems.length} pallets)`,
          usuario_ultima_ubicacion: operatorName,
          fecha_ultima_ubicacion: nowIso
        });

        logsToInsert.push({
          lpn: lpnCode,
          ubicacion_id: oldLocId || null,
          tipo_movimiento: item.location ? 'BAJADA_PICKING' : 'DIRECTO_PICKING',
          usuario: operatorName,
          motivo: `Pase Masivo a Picking (${targetItems.length} pallets)`,
          cantidad_afectada: item.quantity || item.unidades || item.cajas || 1,
          fecha: nowIso,
          sede_id: currentUser?.sede_id
        });

        newMovesList.push({
          lpn: lpnCode,
          tipo: 'MASIVO_PICKING',
          origen: item.location ? `RACK ${item.location.aisle}-R${item.location.rackId}` : 'Playa Recepción',
          destino: 'Zona Picking',
          usuario: operatorName,
          fecha: nowIso,
          timestamp: Date.now(),
          productName: item.productName,
          productCode: item.productCode,
          quantity: item.quantity,
          cajas: item.cajas,
          unidades: item.unidades,
          previousState: getLpnState(item)
        });
      }
      return next;
    });

    setRecentMoves(prev => [...newMovesList, ...prev]);
    setBatchQueue(prev => prev.filter(b => !selectedBatchLpns.includes(b.lpn)));
    setSelectedBatchLpns([]);
    setIsBatchModalOpen(false);

    showToast(`⚡ ${targetItems.length} LPNs pasados a PICKING con éxito`, "success");

    // 🌐 2. PERSISTENCIA EN SEGUNDO PLANO (BACKGROUND ASYNC)
    void (async () => {
      try {
        if (locationIdsToFree.length > 0) {
          await supabase
            .from('ubicaciones')
            .update({ estado: 'VACIO' })
            .in('id', locationIdsToFree);
        }

        const { error: lpnErr } = await supabase
          .from('paletas_lpn')
          .update({
            estado: 'ACTIVO',
            estado_lpn: 'GENERADO',
            tipo: 'PICKING',
            ubicacion_id: null,
            usuario_ultima_ubicacion: operatorName,
            fecha_ultima_ubicacion: nowIso,
            motivo_ultima_ubicacion: `Pase Masivo a Picking (${targetItems.length} pallets)`
          })
          .in('lpn', lpnCodesToUpdate);

        if (lpnErr) throw lpnErr;

        if (logsToInsert.length > 0) {
          await supabase.from('lpn_movimientos').insert(logsToInsert);
        }

        await onRefresh();
      } catch (err: any) {
        console.error("Error en movimiento masivo a picking:", err);
        showToast(`Error masivo en BD: ${err?.message || 'Fallo de conexión'}`, "error");
      }
    })();
  };

  // 🔥 ACTION 4.B: BATCH TO RACK CONFIRMATION - 100% ASÍNCRONO OPTIMISTA (0 ms)
  const handleConfirmBatchRackAssignment = () => {
    if (!selectedRackId || !selectedLevel || !selectedPosition) {
      showToast("Seleccione una posición de rack destino.", "error");
      return;
    }

    const rack = racks.find(r => r.id === selectedRackId);
    if (!rack) {
      showToast("Rack no encontrado.", "error");
      return;
    }

    const targetItems = batchQueue.filter(item => selectedBatchLpns.includes(item.lpn));
    if (targetItems.length === 0) return;

    const operatorName = currentUser?.nombre || currentUser?.username || 'OPERADOR';
    const nowIso = new Date().toISOString();

    const targetLocation: RackLocation = {
      aisle: rack.aisle,
      rackId: rack.id,
      level: selectedLevel,
      position: selectedPosition
    };

    const lpnCodesToUpdate = targetItems.map(i => i.lpn);
    const logsToInsert: any[] = [];
    const newMovesList: MovementLog[] = [];

    // ⚡ 1. ACTUALIZACIÓN INMEDIATA OPTIMISTA (0 ms)
    setOptimisticOverrides(prev => {
      const next = new Map(prev);
      for (const item of targetItems) {
        onAssignLocation(item.lpn, targetLocation, `Rackeo Masivo (${targetItems.length} pallets)`);
        next.set(item.lpn, {
          estado_lpn: 'GENERADO',
          tipo: 'RECEPCION',
          location: targetLocation,
          motivo_ultima_ubicacion: `Rackeo Masivo a ${targetLocation.aisle}-R${targetLocation.rackId}`,
          usuario_ultima_ubicacion: operatorName,
          fecha_ultima_ubicacion: nowIso
        });

        logsToInsert.push({
          lpn: item.lpn,
          ubicacion_id: null,
          tipo_movimiento: 'UBICACION',
          usuario: operatorName,
          motivo: `Rackeo Masivo a ${targetLocation.aisle}-R${targetLocation.rackId}`,
          cantidad_afectada: item.quantity || item.unidades || item.cajas || 1,
          fecha: nowIso,
          sede_id: currentUser?.sede_id
        });

        newMovesList.push({
          lpn: item.lpn,
          tipo: 'MASIVO_RACK',
          origen: 'Playa / Pendiente',
          destino: `RACK ${targetLocation.aisle}-R${targetLocation.rackId}-N${targetLocation.level}-P${targetLocation.position}`,
          usuario: operatorName,
          fecha: nowIso,
          timestamp: Date.now(),
          productName: item.productName,
          productCode: item.productCode,
          quantity: item.quantity,
          cajas: item.cajas,
          unidades: item.unidades,
          previousState: getLpnState(item)
        });
      }
      return next;
    });

    setRecentMoves(prev => [...newMovesList, ...prev]);

    // Clear batch and modals inmediatamente
    setBatchQueue(prev => prev.filter(b => !selectedBatchLpns.includes(b.lpn)));
    setSelectedBatchLpns([]);
    setIsBatchRackModalOpen(false);
    setIsBatchModalOpen(false);

    showToast(`⚡ ${targetItems.length} LPNs rackeados en ${targetLocation.aisle}-R${targetLocation.rackId}`, "success");

    // 🌐 2. PERSISTENCIA EN SEGUNDO PLANO (BACKGROUND ASYNC)
    void (async () => {
      try {
        await supabase
          .from('paletas_lpn')
          .update({
            estado: 'ACTIVO',
            estado_lpn: 'GENERADO',
            usuario_ultima_ubicacion: operatorName,
            fecha_ultima_ubicacion: nowIso,
            motivo_ultima_ubicacion: `Rackeo Masivo a ${targetLocation.aisle}-R${targetLocation.rackId}`
          })
          .in('lpn', lpnCodesToUpdate);

        if (logsToInsert.length > 0) {
          await supabase.from('lpn_movimientos').insert(logsToInsert);
        }

        await onRefresh();
      } catch (err: any) {
        console.error("Error en rackeo masivo:", err);
        showToast(`Error masivo al persistir: ${err?.message || 'Fallo desconocido'}`, "error");
      }
    })();
  };

  // ACTION 3: DESHACER (<10 min)
  const handleUndoMovement = async (move: MovementLog) => {
    const elapsedMinutes = (Date.now() - move.timestamp) / (1000 * 60);
    if (elapsedMinutes > 10) {
      showToast("Excedió los 10 minutos para deshacer.", "error");
      return;
    }

    setIsProcessing(true);
    const lpnCode = move.lpn;
    const operatorName = currentUser?.nombre || currentUser?.username || 'OPERADOR';
    const nowIso = new Date().toISOString();

    try {
      if (move.tipo === 'BAJADA_PICKING' || move.tipo === 'DIRECTO_PICKING' || move.tipo === 'MASIVO_PICKING') {
        if (move.previousLocation && move.previousLocationId) {
          await supabase.from('ubicaciones').update({ estado: 'OCUPADO' }).eq('id', move.previousLocationId);
          await supabase.from('paletas_lpn').update({
            estado: 'ACTIVO',
            estado_lpn: 'GENERADO',
            ubicacion_id: move.previousLocationId,
            usuario_ultima_ubicacion: operatorName,
            fecha_ultima_ubicacion: nowIso
          }).eq('lpn', lpnCode);
        } else {
          await supabase.from('paletas_lpn').update({
            estado: 'ACTIVO',
            estado_lpn: 'PENDIENTE',
            ubicacion_id: null,
            usuario_ultima_ubicacion: operatorName,
            fecha_ultima_ubicacion: nowIso
          }).eq('lpn', lpnCode);
        }

        await supabase.from('lpn_movimientos').insert([{
          lpn: lpnCode,
          ubicacion_id: move.previousLocationId || null,
          tipo_movimiento: 'UBICACION',
          usuario: operatorName,
          motivo: 'DESHACER (<10 min)',
          cantidad_afectada: move.quantity || 1,
          fecha: nowIso,
          sede_id: currentUser?.sede_id
        }]);
      } else if (move.tipo === 'UBICACION' || move.tipo === 'REUBICACION' || move.tipo === 'MASIVO_RACK') {
        if (move.previousState === 'PENDIENTE') {
          const currItem = inventory.find(i => i.lpn === lpnCode);
          if (currItem?.locationId) {
            await supabase.from('ubicaciones').update({ estado: 'VACIO' }).eq('id', currItem.locationId);
          }
          await supabase.from('paletas_lpn').update({
            estado: 'ACTIVO',
            estado_lpn: 'PENDIENTE',
            ubicacion_id: null,
            usuario_ultima_ubicacion: operatorName,
            fecha_ultima_ubicacion: nowIso
          }).eq('lpn', lpnCode);
        }
      }

      setRecentMoves(prev => prev.filter(m => m.timestamp !== move.timestamp));
      await onRefresh();
      showToast(`Movimiento ${lpnCode} revertido.`, "success");
    } catch (err: any) {
      console.error("Error al deshacer:", err);
      showToast(`Error: ${err?.message || 'Fallo desconocido'}`, "error");
    } finally {
      setIsProcessing(false);
    }
  };

  // CAMERA SCANNER (QR & BARCODES 1D/2D)
  const handleScannedCodeFromCamera = (rawCode: string) => {
    const clean = rawCode.trim().toUpperCase();
    if (!clean) return;
    const now = Date.now();
    if (lastScannedTimeRef.current.code === clean && now - lastScannedTimeRef.current.time < 2200) {
      return; // Throttle to avoid repeated trigger on same video frame
    }
    lastScannedTimeRef.current = { code: clean, time: now };
    handleLookupLpn(clean, true);
  };

  const startCamera = async () => {
    setIsCameraActive(true);
    setTimeout(async () => {
      try {
        if (html5QrCodeRef.current) {
          try {
            if (html5QrCodeRef.current.isScanning) {
              await html5QrCodeRef.current.stop();
            }
          } catch (e) {
            console.warn(e);
          }
        }

        const qrScanner = new Html5Qrcode("lpn-camera-viewport", {
          formatsToSupport: [
            Html5QrcodeSupportedFormats.QR_CODE,
            Html5QrcodeSupportedFormats.CODE_128,
            Html5QrcodeSupportedFormats.CODE_39,
            Html5QrcodeSupportedFormats.EAN_13,
            Html5QrcodeSupportedFormats.EAN_8,
            Html5QrcodeSupportedFormats.UPC_A,
            Html5QrcodeSupportedFormats.UPC_E,
            Html5QrcodeSupportedFormats.ITF,
            Html5QrcodeSupportedFormats.CODABAR
          ],
          verbose: false
        });
        html5QrCodeRef.current = qrScanner;

        await qrScanner.start(
          { facingMode: "environment" },
          {
            fps: 15,
            qrbox: (viewfinderWidth, viewfinderHeight) => {
              const minEdge = Math.min(viewfinderWidth, viewfinderHeight);
              return {
                width: Math.floor(viewfinderWidth * 0.85),
                height: Math.floor(minEdge * 0.6)
              };
            }
          },
          (decodedText) => {
            handleScannedCodeFromCamera(decodedText);
          },
          () => {
            // Frame search error, safely ignored
          }
        );
      } catch (err: any) {
        console.error("Camera error:", err);
        showToast("No se pudo iniciar cámara: " + (err?.message || "Sin permisos"), "error");
        setIsCameraActive(false);
      }
    }, 150);
  };

  const stopCamera = async () => {
    if (html5QrCodeRef.current) {
      try {
        if (html5QrCodeRef.current.isScanning) {
          await html5QrCodeRef.current.stop();
        }
        await html5QrCodeRef.current.clear();
      } catch (err) {
        console.warn("Camera stop error:", err);
      }
      html5QrCodeRef.current = null;
    }
    setIsCameraActive(false);
  };

  useEffect(() => {
    return () => {
      if (html5QrCodeRef.current) {
        try {
          if (html5QrCodeRef.current.isScanning) {
            html5QrCodeRef.current.stop();
          }
        } catch (e) {
          console.warn(e);
        }
      }
    };
  }, []);

  // Filtered lists for list tabs
  const filteredList = useMemo(() => {
    let baseList = activeList;
    if (activeTab === 'RACKS') baseList = reservasInRackList;
    else if (activeTab === 'PENDIENTES') baseList = pendientesList;
    else if (activeTab === 'PICKING') baseList = pickingList;

    // ❄️ Filtrado por Cámara (Secos, Refrigerado, Congelado)
    if (selectedChamber !== 'TODOS') {
      baseList = baseList.filter(item => getItemChamber(item) === selectedChamber);
    }

    if (!searchFilter.trim()) return baseList;
    const q = searchFilter.trim().toLowerCase();
    return baseList.filter(item =>
      item.lpn.toLowerCase().includes(q) ||
      (item.productCode && item.productCode.toLowerCase().includes(q)) ||
      (item.productName && item.productName.toLowerCase().includes(q)) ||
      (item.location && `${item.location.aisle}-${item.location.rackId}-${item.location.level}-${item.location.position}`.toLowerCase().includes(q))
    );
  }, [activeList, reservasInRackList, pendientesList, pickingList, activeTab, searchFilter, selectedChamber, catalogMap]);

  // Batch selection helpers
  const handleToggleSelectAllBatch = () => {
    if (selectedBatchLpns.length === batchQueue.length) {
      setSelectedBatchLpns([]);
    } else {
      setSelectedBatchLpns(batchQueue.map(b => b.lpn));
    }
  };

  const handleToggleBatchItem = (lpnCode: string) => {
    setSelectedBatchLpns(prev =>
      prev.includes(lpnCode) ? prev.filter(l => l !== lpnCode) : [...prev, lpnCode]
    );
  };

  const handleRemoveFromBatch = (lpnCode: string) => {
    setBatchQueue(prev => prev.filter(b => b.lpn !== lpnCode));
    setSelectedBatchLpns(prev => prev.filter(l => l !== lpnCode));
  };

  return (
    <div className="flex flex-col h-full bg-slate-50 text-slate-800 animate-fade-in overflow-y-auto custom-scrollbar relative">
      {/* 📱 COMPACT APP-LIKE TOP BAR */}
      <div className="bg-white border-b border-slate-200 sticky top-0 z-30 px-3 py-2 shadow-2xs">
        <div className="max-w-2xl mx-auto flex items-center justify-between gap-2">
          <div className="flex items-center gap-1.5">
            <div className="w-7 h-7 rounded-lg bg-indigo-50 border border-indigo-100 flex items-center justify-center text-indigo-600">
              <Layers className="w-4 h-4" />
            </div>
            <button
              onClick={() => setActiveTab('SCANNER')}
              className={`px-2.5 py-1 rounded-xl text-xs font-black transition-all flex items-center gap-1 shadow-2xs ${
                activeTab === 'SCANNER'
                  ? 'bg-slate-900 text-white ring-2 ring-slate-400/40'
                  : 'bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200'
              }`}
            >
              <QrCode className="w-3.5 h-3.5" />
              <span>Escanear</span>
            </button>
          </div>

          <div className="flex items-center gap-1.5">
            <button
              onClick={() => setActiveTab(activeTab === 'HISTORIAL' ? 'SCANNER' : 'HISTORIAL')}
              className={`px-2 py-1 rounded-lg border text-xs font-bold transition-all flex items-center gap-1 ${
                activeTab === 'HISTORIAL'
                  ? 'bg-slate-800 text-white border-slate-900'
                  : 'bg-slate-50 hover:bg-slate-100 text-slate-600 border-slate-200'
              }`}
              title="Historial de movimientos"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Historial</span>
              <span className="text-[10px] opacity-80">({recentMoves.length})</span>
            </button>

            <button
              onClick={() => setActiveTab(activeTab === 'MAPA_INVENTARIO' ? 'SCANNER' : 'MAPA_INVENTARIO')}
              className={`px-2 py-1 rounded-lg border text-xs font-bold transition-all flex items-center gap-1 ${
                activeTab === 'MAPA_INVENTARIO'
                  ? 'bg-indigo-600 text-white border-indigo-700'
                  : 'bg-slate-50 hover:bg-slate-100 text-slate-600 border-slate-200'
              }`}
              title="Mapa 3D del almacén"
            >
              <MapPin className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Mapa 3D</span>
            </button>

            <button
              onClick={onRefresh}
              className="p-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg border border-slate-200 transition-all"
              title="Recargar"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isProcessing ? 'animate-spin' : ''}`} />
            </button>
          </div>
        </div>

        {/* 📱 4 STATUS PILLS: PENDIENTES, EN RACK, PICKING Y FILTRAR POR CÁMARA (100% APPLIKE) */}
        <div className="max-w-2xl mx-auto grid grid-cols-4 gap-1.5 mt-2">
          <button
            onClick={() => setActiveTab(activeTab === 'PENDIENTES' ? 'SCANNER' : 'PENDIENTES')}
            className={`py-1.5 px-1.5 rounded-xl border text-center transition-all ${
              activeTab === 'PENDIENTES'
                ? 'bg-amber-500 text-white border-amber-600 shadow-xs font-black ring-2 ring-amber-300'
                : 'bg-amber-50/70 border-amber-200 text-amber-900 font-bold hover:bg-amber-100/80'
            }`}
          >
            <div className="text-[9px] uppercase opacity-90 leading-none">Pendientes</div>
            <div className="text-sm font-black mt-0.5 leading-none">{pendientesList.length}</div>
          </button>

          <button
            onClick={() => setActiveTab(activeTab === 'RACKS' ? 'SCANNER' : 'RACKS')}
            className={`py-1.5 px-1.5 rounded-xl border text-center transition-all ${
              activeTab === 'RACKS'
                ? 'bg-indigo-600 text-white border-indigo-700 shadow-xs font-black ring-2 ring-indigo-300'
                : 'bg-indigo-50/70 border-indigo-200 text-indigo-900 font-bold hover:bg-indigo-100/80'
            }`}
          >
            <div className="text-[9px] uppercase opacity-90 leading-none">En Rack</div>
            <div className="text-sm font-black mt-0.5 leading-none">{reservasInRackList.length}</div>
          </button>

          <button
            onClick={() => setActiveTab(activeTab === 'PICKING' ? 'SCANNER' : 'PICKING')}
            className={`py-1.5 px-1.5 rounded-xl border text-center transition-all ${
              activeTab === 'PICKING'
                ? 'bg-emerald-600 text-white border-emerald-700 shadow-xs font-black ring-2 ring-emerald-300'
                : 'bg-emerald-50/70 border-emerald-200 text-emerald-900 font-bold hover:bg-emerald-100/80'
            }`}
          >
            <div className="text-[9px] uppercase opacity-90 leading-none">Picking</div>
            <div className="text-sm font-black mt-0.5 leading-none">{pickingList.length}</div>
          </button>

          {/* ❄️ BOTÓN CÁMARA: FILTRAR POR CÁMARA (SECOS, REFRIGERADO, CONGELADO) */}
          <button
            type="button"
            onClick={() => setIsChamberModalOpen(true)}
            className={`py-1.5 px-1.5 rounded-xl border text-center transition-all active:scale-95 ${
              selectedChamber !== 'TODOS'
                ? 'bg-gradient-to-r from-sky-600 to-indigo-600 text-white border-indigo-700 shadow-xs font-black ring-2 ring-sky-300'
                : 'bg-sky-50/80 border-sky-200 text-sky-900 font-bold hover:bg-sky-100'
            }`}
            title="Filtrar inventario por Cámara (Secos, Refrigerado, Congelado)"
          >
            <div className="text-[9px] uppercase opacity-90 leading-none flex items-center justify-center gap-0.5">
              <span>❄️ Cámara</span>
            </div>
            <div className="text-xs font-black mt-0.5 leading-none truncate">
              {selectedChamber === 'TODOS'
                ? 'Todas'
                : selectedChamber === 'SECO'
                ? '📦 Secos'
                : selectedChamber === 'REFRIGERADO'
                ? '❄️ Refrig.'
                : '🧊 Congel.'}
            </div>
          </button>
        </div>
      </div>

      {/* 📱 BODY CONTENT */}
      <div className={`${activeTab === 'MAPA_INVENTARIO' ? 'w-full px-2 sm:px-4' : 'max-w-2xl mx-auto w-full p-2.5 sm:p-4'} space-y-2.5 flex-1 pb-24`}>
        {/* Toast Alert Banner */}
        {toastMessage && (
          <div className={`p-2.5 rounded-xl border font-bold text-xs flex items-center justify-between gap-2 shadow-xs animate-fade-in ${
            toastMessage.type === 'success' ? 'bg-emerald-50 border-emerald-300 text-emerald-800' :
            toastMessage.type === 'error' ? 'bg-rose-50 border-rose-300 text-rose-800' : 'bg-blue-50 border-blue-300 text-blue-800'
          }`}>
            <div className="flex items-center gap-1.5 truncate">
              {toastMessage.type === 'success' && <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />}
              {toastMessage.type === 'error' && <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />}
              {toastMessage.type === 'info' && <Info className="w-4 h-4 text-blue-600 shrink-0" />}
              <span className="truncate">{toastMessage.text}</span>
            </div>
            <button onClick={() => setToastMessage(null)} className="text-slate-400 hover:text-slate-600 p-0.5">
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        {/* ----------------- TAB: MAPA DE INVENTARIO ----------------- */}
        {activeTab === 'MAPA_INVENTARIO' && (
          <div className="w-full h-full min-h-[600px] flex flex-col bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl shadow-xs overflow-hidden">
            <InventoryMapExplorer
              inventory={inventory}
              racks={racks}
              zones={zones}
              catalog={catalog}
              currentUser={currentUser}
              onAssignLocation={onAssignLocation}
              onMoveToPicking={async (lpn) => {
                const item = inventory.find(i => i.lpn === lpn);
                if (item) await handleBajarAPicking(item);
              }}
              onClose={() => setActiveTab('SCANNER')}
            />
          </div>
        )}

        {/* ----------------- TAB 1: SCANNER & ACTIVE ACTION ----------------- */}
        {activeTab === 'SCANNER' && (
          <div className="space-y-2.5">
            {/* FAST BARCODE SCANNER INPUT BAR */}
            <div className="bg-white p-2.5 sm:p-3 rounded-2xl border border-slate-200 shadow-2xs space-y-2">
              <div className="flex items-center gap-1.5">
                <div className="relative flex-1">
                  <input
                    ref={inputRef}
                    type="text"
                    autoFocus
                    placeholder="Escanear LPN o últimos 4-5 dígitos..."
                    value={scanInput}
                    onChange={e => setScanInput(e.target.value)}
                    onKeyDown={handleKeyDown}
                    className="w-full pl-8 pr-7 py-2 bg-slate-50 focus:bg-white border border-slate-300 focus:border-indigo-500 rounded-xl text-xs sm:text-sm font-mono font-bold text-slate-900 placeholder:text-slate-400 outline-none transition-all"
                  />
                  <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                  {scanInput && (
                    <button
                      onClick={() => setScanInput('')}
                      className="absolute right-2 top-1/2 -translate-y-1/2 p-0.5 text-slate-400 hover:text-slate-600"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>

                <button
                  onClick={() => handleLookupLpn(scanInput, true)}
                  disabled={!scanInput.trim() || isProcessing}
                  className="px-3 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white rounded-xl font-black text-xs transition-all shadow-2xs flex items-center gap-1 shrink-0 active:scale-95"
                >
                  <span>+ Cola</span>
                  <MoveRight className="w-3.5 h-3.5" />
                </button>

                <button
                  onClick={() => {
                    if (isCameraActive) stopCamera();
                    else startCamera();
                  }}
                  className={`p-2 rounded-xl border text-xs font-bold transition-all shrink-0 active:scale-95 ${
                    isCameraActive ? 'bg-rose-500 text-white border-rose-600 ring-2 ring-rose-300' : 'bg-slate-100 hover:bg-slate-200 text-slate-700 border-slate-200'
                  }`}
                  title={isCameraActive ? 'Cerrar cámara' : 'Abrir cámara para escanear QR / Barras'}
                >
                  <Camera className="w-4 h-4" />
                </button>
              </div>

              {/* Camera Live Barcode & QR Code Scanner */}
              {isCameraActive && (
                <div className="relative w-full rounded-2xl overflow-hidden bg-slate-950 border border-slate-700 shadow-md">
                  <div id="lpn-camera-viewport" className="w-full min-h-[220px]" />
                  <button
                    onClick={stopCamera}
                    className="absolute top-2 right-2 z-20 p-1.5 bg-rose-600 hover:bg-rose-700 text-white rounded-full shadow-md"
                    title="Cerrar cámara"
                  >
                    <X className="w-4 h-4" />
                  </button>
                  <div className="absolute bottom-2 left-1/2 -translate-x-1/2 z-20 px-3 py-1 bg-slate-900/80 backdrop-blur-xs rounded-full text-white text-[10px] font-bold pointer-events-none whitespace-nowrap border border-slate-700">
                    Apunta al código QR o de barras del LPN
                  </div>
                </div>
              )}
            </div>

            {/* ❄️ BARRA RÁPIDA DE FILTRO POR CÁMARA (100% APPLIKE PARA OPERARIO) */}
            <div className="bg-white p-2.5 rounded-2xl border border-slate-200 shadow-2xs space-y-1.5">
              <div className="flex items-center justify-between text-[11px] font-black px-0.5">
                <span className="text-slate-600 uppercase tracking-wider flex items-center gap-1">
                  <span>❄️ Filtrar por Cámara:</span>
                </span>
                {selectedChamber !== 'TODOS' && (
                  <button
                    type="button"
                    onClick={() => setSelectedChamber('TODOS')}
                    className="text-[10px] text-indigo-600 font-bold hover:underline"
                  >
                    Ver todas
                  </button>
                )}
              </div>

              <div className="grid grid-cols-4 gap-1 sm:gap-1.5">
                <button
                  type="button"
                  onClick={() => {
                    setSelectedChamber('TODOS');
                    showToast(`Mostrando todas las cámaras (${pendingChamberCounts.total} pend.)`, 'info');
                  }}
                  className={`py-1.5 px-1 rounded-xl text-center border transition-all active:scale-95 ${
                    selectedChamber === 'TODOS'
                      ? 'bg-slate-900 text-white border-slate-900 font-black shadow-xs ring-1 ring-slate-400'
                      : 'bg-slate-50 text-slate-700 border-slate-200 font-bold hover:bg-slate-100'
                  }`}
                >
                  <div className="text-[9px] uppercase leading-none">Todas</div>
                  <div className="text-xs font-black mt-0.5 leading-none">{pendingChamberCounts.total}</div>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setSelectedChamber('SECO');
                    showToast(`Cámara Secos: ${pendingChamberCounts.seco} pallets pendientes`, 'info');
                  }}
                  className={`py-1.5 px-1 rounded-xl text-center border transition-all active:scale-95 ${
                    selectedChamber === 'SECO'
                      ? 'bg-amber-500 text-white border-amber-600 font-black shadow-xs ring-2 ring-amber-300'
                      : 'bg-amber-50/80 text-amber-900 border-amber-200 font-bold hover:bg-amber-100'
                  }`}
                >
                  <div className="text-[9px] uppercase leading-none">📦 Secos</div>
                  <div className="text-xs font-black mt-0.5 leading-none">{pendingChamberCounts.seco}</div>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setSelectedChamber('REFRIGERADO');
                    showToast(`Cámara Refrigerado: ${pendingChamberCounts.refrigerado} pallets pendientes`, 'info');
                  }}
                  className={`py-1.5 px-1 rounded-xl text-center border transition-all active:scale-95 ${
                    selectedChamber === 'REFRIGERADO'
                      ? 'bg-sky-600 text-white border-sky-700 font-black shadow-xs ring-2 ring-sky-300'
                      : 'bg-sky-50/80 text-sky-900 border-sky-200 font-bold hover:bg-sky-100'
                  }`}
                >
                  <div className="text-[9px] uppercase leading-none">❄️ Refrig.</div>
                  <div className="text-xs font-black mt-0.5 leading-none">{pendingChamberCounts.refrigerado}</div>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setSelectedChamber('CONGELADO');
                    showToast(`Cámara Congelado: ${pendingChamberCounts.congelado} pallets pendientes`, 'info');
                  }}
                  className={`py-1.5 px-1 rounded-xl text-center border transition-all active:scale-95 ${
                    selectedChamber === 'CONGELADO'
                      ? 'bg-indigo-600 text-white border-indigo-700 font-black shadow-xs ring-2 ring-indigo-300'
                      : 'bg-indigo-50/80 text-indigo-900 border-indigo-200 font-bold hover:bg-indigo-100'
                  }`}
                >
                  <div className="text-[9px] uppercase leading-none">🧊 Congel.</div>
                  <div className="text-xs font-black mt-0.5 leading-none">{pendingChamberCounts.congelado}</div>
                </button>
              </div>

              {selectedChamber !== 'TODOS' && (
                <div className="pt-1 flex items-center justify-between text-[11px] bg-slate-50 p-2 rounded-xl border border-slate-200">
                  <span className="text-slate-700 font-medium">
                    Pendientes en <strong className="font-black text-slate-900">{selectedChamber}</strong>: {pendingChamberCounts[selectedChamber.toLowerCase() as 'seco' | 'refrigerado' | 'congelado']} pallets
                  </span>
                  <button
                    type="button"
                    onClick={() => setActiveTab('PENDIENTES')}
                    className="text-indigo-600 font-black flex items-center gap-0.5 hover:underline"
                  >
                    <span>Ver lista</span>
                    <MoveRight className="w-3 h-3" />
                  </button>
                </div>
              )}
            </div>

            {/* 🎯 COMPACT SCANNED LPN ACTION CARD */}
            {selectedLpn && (
              <div className="bg-white rounded-2xl border-2 border-indigo-300 p-3 shadow-xs space-y-2.5 animate-scale-up">
                {/* Header: LPN Code + State Badge + Close */}
                <div className="flex items-center justify-between gap-2 border-b border-slate-100 pb-2">
                  <div className="flex items-center gap-1.5">
                    <span className="text-sm sm:text-base font-black font-mono text-slate-900">{selectedLpn.lpn}</span>
                    {getLpnState(selectedLpn) === 'PENDIENTE' && (
                      <span className="px-2 py-0.5 rounded-md text-[10px] font-black bg-amber-100 text-amber-800 border border-amber-200">
                        1. PENDIENTE
                      </span>
                    )}
                    {getLpnState(selectedLpn) === 'RESERVA' && (
                      <span className="px-2 py-0.5 rounded-md text-[10px] font-black bg-indigo-100 text-indigo-800 border border-indigo-200">
                        2. EN RACK
                      </span>
                    )}
                    {getLpnState(selectedLpn) === 'PICKING' && (
                      <span className="px-2 py-0.5 rounded-md text-[10px] font-black bg-emerald-100 text-emerald-800 border border-emerald-200">
                        3. EN PICKING
                      </span>
                    )}
                  </div>

                  <div className="flex items-center gap-1">
                    <button
                      onClick={handleAddCurrentToBatch}
                      className="text-[11px] font-bold text-indigo-600 hover:text-indigo-800 bg-indigo-50 border border-indigo-200 px-2 py-0.5 rounded-md flex items-center gap-1 active:scale-95 transition-all"
                    >
                      <Plus className="w-3 h-3" />
                      <span>Cola</span>
                    </button>
                    <button
                      onClick={() => setSelectedLpn(null)}
                      className="text-[11px] font-bold text-slate-400 hover:text-slate-600 px-2 py-0.5 rounded-md border border-slate-200"
                    >
                      Cerrar
                    </button>
                  </div>
                </div>

                {/* 🌟 PROMINENT PRODUCT CODE (ICO GRANDE) & DESCRIPTION */}
                <div className="space-y-1">
                  <div className="flex items-center justify-between gap-2">
                    {/* CÓDIGO ICO DESTACADO Y GRANDE */}
                    <div className="flex items-center gap-1.5 bg-indigo-50/80 border border-indigo-200 px-2.5 py-1 rounded-xl">
                      <span className="text-[10px] font-black uppercase text-indigo-600 tracking-wider">ICO / SKU:</span>
                      <span className="text-sm sm:text-base font-black font-mono text-indigo-950 tracking-wide">
                        {selectedLpn.productCode || 'N/A'}
                      </span>
                    </div>

                    {/* FECHA DE INGRESO / CREACIÓN */}
                    <div className="flex items-center gap-1 text-[10px] font-bold text-slate-500 bg-slate-50 px-2 py-1 rounded-lg border border-slate-200 shrink-0">
                      <Calendar className="w-3 h-3 text-slate-400" />
                      <span>{(selectedLpn.receptionDate || selectedLpn.fecha_generado) ? formatLocalPeruTime(selectedLpn.receptionDate || selectedLpn.fecha_generado).split(' ')[0] : 'S/F'}</span>
                    </div>
                  </div>

                  <h3 className="text-xs font-bold text-slate-900 leading-tight line-clamp-2 pt-0.5">
                    {selectedLpn.productName || 'Producto no identificado'}
                  </h3>

                  {/* CANTIDAD EN CAJAS Y UNIDADES DETALLADO */}
                  <div className="grid grid-cols-2 gap-2 pt-1">
                    <div className="p-1.5 rounded-xl bg-slate-50 border border-slate-200 text-center">
                      <span className="text-[9px] uppercase font-black text-slate-400 block leading-none">Cajas</span>
                      <span className="text-xs sm:text-sm font-black text-slate-800 leading-tight">
                        {selectedLpn.cajas || 0} cjs
                      </span>
                    </div>
                    <div className="p-1.5 rounded-xl bg-slate-50 border border-slate-200 text-center">
                      <span className="text-[9px] uppercase font-black text-slate-400 block leading-none">Unidades</span>
                      <span className="text-xs sm:text-sm font-black text-slate-800 leading-tight">
                        {selectedLpn.unidades || selectedLpn.quantity || 0} un
                      </span>
                    </div>
                  </div>
                </div>

                {/* Current Location Badge */}
                <div className="flex items-center gap-1.5 text-[11px] font-bold p-2 rounded-xl bg-slate-50 border border-slate-200">
                  <MapPin className="w-3.5 h-3.5 text-indigo-600 shrink-0" />
                  <span className="text-slate-500">Ubicación:</span>
                  <span className="font-mono text-slate-900 truncate">
                    {selectedLpn.location
                      ? `${selectedLpn.location.aisle}-R${selectedLpn.location.rackId}-N${selectedLpn.location.level}-P${selectedLpn.location.position}`
                      : 'Suelo (Sin Rack Asignado)'}
                  </span>
                </div>

                {/* Direct Thumb-Friendly Action Buttons */}
                <div className="pt-1">
                  {/* CASE 1: PENDIENTE */}
                  {getLpnState(selectedLpn) === 'PENDIENTE' && (
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] font-black uppercase text-slate-500 tracking-wider">
                          Rackeo Rápido Directo:
                        </span>
                        <span className="text-[10px] text-indigo-600 font-bold bg-indigo-50 px-1.5 py-0.5 rounded">1-Tap</span>
                      </div>

                      <div className="grid grid-cols-5 gap-1.5">
                        {['A', 'B', 'C', 'D', 'E'].map(letter => (
                          <button
                            key={letter}
                            onClick={() => handleFastRackSelect(letter)}
                            disabled={isProcessing}
                            className="py-2.5 px-1 rounded-xl bg-indigo-50 border border-indigo-200 hover:bg-indigo-600 hover:border-indigo-600 hover:text-white text-indigo-900 font-black text-xs flex flex-col items-center justify-center transition-all active:scale-90 shadow-2xs"
                            title={`Rackeo directo a Rack ${letter}`}
                          >
                            <span className="text-sm font-mono leading-none">{letter}</span>
                            <span className="text-[9px] opacity-75 mt-0.5">Rack</span>
                          </button>
                        ))}
                      </div>

                      <div className="grid grid-cols-2 gap-2 pt-1">
                        <button
                          onClick={() => setIsRackModalOpen(true)}
                          disabled={isProcessing}
                          className="py-2.5 px-3 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-black text-xs flex items-center justify-center gap-1.5 shadow-2xs active:scale-95 transition-all"
                        >
                          <Building2 className="w-3.5 h-3.5" />
                          <span>MÁS OPCIONES</span>
                        </button>

                        <button
                          onClick={() => handleBajarAPicking(selectedLpn, 'Pase directo a Picking')}
                          disabled={isProcessing}
                          className="py-2.5 px-3 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-black text-xs flex items-center justify-center gap-1.5 shadow-2xs active:scale-95 transition-all"
                        >
                          <ArrowDownToLine className="w-3.5 h-3.5" />
                          <span>A PICKING</span>
                        </button>
                      </div>
                    </div>
                  )}

                  {/* CASE 2: RESERVA (EN RACK) */}
                  {getLpnState(selectedLpn) === 'RESERVA' && (
                    <div className="grid grid-cols-2 gap-2">
                      <button
                        onClick={() => handleBajarAPicking(selectedLpn, 'Bajada de pallet a piso')}
                        disabled={isProcessing}
                        className="py-2.5 px-3 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-black text-xs flex items-center justify-center gap-1.5 shadow-2xs active:scale-95 transition-all ring-1 ring-emerald-500"
                      >
                        <ArrowDownToLine className="w-4 h-4" />
                        <span>BAJAR A PICKING</span>
                      </button>

                      <button
                        onClick={() => setIsRackModalOpen(true)}
                        disabled={isProcessing}
                        className="py-2.5 px-3 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-800 border border-slate-300 font-bold text-xs flex items-center justify-center gap-1.5 active:scale-95 transition-all"
                      >
                        <Building2 className="w-3.5 h-3.5 text-indigo-600" />
                        <span>Reubicar Rack</span>
                      </button>
                    </div>
                  )}

                  {/* CASE 3: PICKING */}
                  {getLpnState(selectedLpn) === 'PICKING' && (
                    <div className="flex items-center justify-between gap-2 p-2 rounded-xl bg-emerald-50 border border-emerald-200">
                      <div className="flex items-center gap-1.5">
                        <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                        <span className="text-[11px] font-bold text-emerald-900">En Zona Picking</span>
                      </div>
                      <button
                        onClick={() => setIsRackModalOpen(true)}
                        disabled={isProcessing}
                        className="px-2.5 py-1 bg-white hover:bg-slate-50 text-indigo-700 border border-indigo-200 rounded-lg font-bold text-[11px] flex items-center gap-1 shrink-0 shadow-2xs"
                      >
                        <ArrowUpToLine className="w-3 h-3" />
                        <span>Subir a Rack</span>
                      </button>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* 📱 RECENT MOVEMENTS LIST (Ultra-compact) */}
            {recentMoves.length > 0 && (
              <div className="bg-white rounded-2xl border border-slate-200 p-2.5 sm:p-3 shadow-2xs space-y-1.5">
                <div className="flex items-center justify-between pb-1 border-b border-slate-100">
                  <span className="text-[10px] font-black uppercase text-slate-500 tracking-wider flex items-center gap-1">
                    <RotateCcw className="w-3 h-3 text-indigo-600" />
                    Últimos Movimientos
                  </span>
                  <span className="text-[10px] text-slate-400">Deshacer disponible 10m</span>
                </div>

                <div className="divide-y divide-slate-100">
                  {recentMoves.slice(0, 4).map((move, idx) => {
                    const elapsedMin = Math.floor((Date.now() - move.timestamp) / (1000 * 60));
                    const canUndo = elapsedMin <= 10;

                    return (
                      <div key={idx} className="py-1.5 flex items-center justify-between gap-2 text-xs">
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-1.5">
                            <span className="font-mono font-black text-[11px] text-slate-900">{move.lpn}</span>
                            <span className={`px-1.5 py-0.2 rounded text-[9px] font-black uppercase ${
                              move.tipo === 'BAJADA_PICKING' || move.tipo === 'DIRECTO_PICKING' || move.tipo === 'MASIVO_PICKING' ? 'bg-emerald-100 text-emerald-800' : 'bg-indigo-100 text-indigo-800'
                            }`}>
                              {move.tipo === 'BAJADA_PICKING' ? 'A PICKING' : (move.tipo === 'DIRECTO_PICKING' ? 'DIRECTO PICKING' : (move.tipo === 'MASIVO_PICKING' ? 'MASIVO PICKING' : 'A RACK'))}
                            </span>
                            <span className="text-[10px] text-slate-400">{elapsedMin === 0 ? 'Ahora' : `${elapsedMin}m`}</span>
                          </div>
                          <p className="text-[10px] text-slate-500 truncate mt-0.5">
                            {move.origen} <ArrowRight className="w-2.5 h-2.5 inline text-slate-400" /> {move.destino}
                          </p>
                        </div>

                        {canUndo && (
                          <button
                            onClick={() => handleUndoMovement(move)}
                            disabled={isProcessing}
                            className="px-2 py-1 bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 rounded-lg font-bold text-[10px] flex items-center gap-1 shrink-0 active:scale-95"
                            title="Deshacer"
                          >
                            <Undo2 className="w-3 h-3" />
                            <span>Deshacer</span>
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        )}

        {/* ----------------- TABS: LIST VIEWS (RACKS / PENDIENTES / PICKING) ----------------- */}
        {(activeTab === 'RACKS' || activeTab === 'PENDIENTES' || activeTab === 'PICKING') && (
          <div className="space-y-2">
            {/* Quick Return Bar to Scanner */}
            <div className="flex items-center justify-between gap-2">
              <button
                onClick={() => setActiveTab('SCANNER')}
                className="px-2.5 py-1 bg-white hover:bg-slate-100 border border-slate-200 text-indigo-700 rounded-xl text-xs font-black flex items-center gap-1 shadow-2xs transition-all active:scale-95"
              >
                <QrCode className="w-3.5 h-3.5" />
                <span>← Escanear</span>
              </button>
              <span className="text-[11px] font-black text-slate-600 uppercase tracking-wide">
                {activeTab === 'RACKS' && `En Racks (${reservasInRackList.length})`}
                {activeTab === 'PENDIENTES' && `Pendientes (${pendientesList.length})`}
                {activeTab === 'PICKING' && `En Picking (${pickingList.length})`}
              </span>
            </div>

            {/* ❄️ SELECTOR RÁPIDO DE CÁMARA PARA LISTAS (1-TAP APPLIKE) */}
            <div className="flex items-center gap-1.5 overflow-x-auto pb-0.5 custom-scrollbar">
              <button
                type="button"
                onClick={() => setSelectedChamber('TODOS')}
                className={`px-2.5 py-1 rounded-xl text-xs font-black transition-all shrink-0 active:scale-95 flex items-center gap-1 ${
                  selectedChamber === 'TODOS'
                    ? 'bg-slate-900 text-white shadow-2xs ring-1 ring-slate-400'
                    : 'bg-white text-slate-700 border border-slate-200 hover:bg-slate-100'
                }`}
              >
                <span>🌟 Todas</span>
                <span className={`text-[10px] px-1.5 py-0.2 rounded-full font-mono ${selectedChamber === 'TODOS' ? 'bg-slate-700 text-white' : 'bg-slate-100 text-slate-700'}`}>
                  {currentTabChamberCounts.total}
                </span>
              </button>

              <button
                type="button"
                onClick={() => setSelectedChamber('SECO')}
                className={`px-2.5 py-1 rounded-xl text-xs font-black transition-all shrink-0 active:scale-95 flex items-center gap-1 ${
                  selectedChamber === 'SECO'
                    ? 'bg-amber-500 text-white shadow-2xs ring-2 ring-amber-300'
                    : 'bg-amber-50/80 text-amber-900 border border-amber-200 hover:bg-amber-100'
                }`}
              >
                <span>📦 Secos</span>
                <span className={`text-[10px] px-1.5 py-0.2 rounded-full font-mono ${selectedChamber === 'SECO' ? 'bg-amber-600 text-white' : 'bg-amber-100 text-amber-900'}`}>
                  {currentTabChamberCounts.seco}
                </span>
              </button>

              <button
                type="button"
                onClick={() => setSelectedChamber('REFRIGERADO')}
                className={`px-2.5 py-1 rounded-xl text-xs font-black transition-all shrink-0 active:scale-95 flex items-center gap-1 ${
                  selectedChamber === 'REFRIGERADO'
                    ? 'bg-sky-600 text-white shadow-2xs ring-2 ring-sky-300'
                    : 'bg-sky-50/80 text-sky-900 border border-sky-200 hover:bg-sky-100'
                }`}
              >
                <span>❄️ Refrig.</span>
                <span className={`text-[10px] px-1.5 py-0.2 rounded-full font-mono ${selectedChamber === 'REFRIGERADO' ? 'bg-sky-700 text-white' : 'bg-sky-100 text-sky-900'}`}>
                  {currentTabChamberCounts.refrigerado}
                </span>
              </button>

              <button
                type="button"
                onClick={() => setSelectedChamber('CONGELADO')}
                className={`px-2.5 py-1 rounded-xl text-xs font-black transition-all shrink-0 active:scale-95 flex items-center gap-1 ${
                  selectedChamber === 'CONGELADO'
                    ? 'bg-indigo-600 text-white shadow-2xs ring-2 ring-indigo-300'
                    : 'bg-indigo-50/80 text-indigo-900 border border-indigo-200 hover:bg-indigo-100'
                }`}
              >
                <span>🧊 Congel.</span>
                <span className={`text-[10px] px-1.5 py-0.2 rounded-full font-mono ${selectedChamber === 'CONGELADO' ? 'bg-indigo-700 text-white' : 'bg-indigo-100 text-indigo-900'}`}>
                  {currentTabChamberCounts.congelado}
                </span>
              </button>
            </div>

            {/* Filter Bar */}
            <div className="bg-white p-2 rounded-xl border border-slate-200 flex items-center gap-2 shadow-2xs">
              <div className="relative flex-1">
                <input
                  type="text"
                  placeholder="Filtrar LPN, SKU, nombre..."
                  value={searchFilter}
                  onChange={e => setSearchFilter(e.target.value)}
                  className="w-full pl-7 pr-3 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs font-bold text-slate-800 outline-none focus:border-indigo-500"
                />
                <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2 top-1/2 -translate-y-1/2" />
              </div>
              <span className="text-[11px] font-bold text-slate-500 shrink-0">
                {filteredList.length}
              </span>
            </div>

            {/* List Cards (Paginated / Limited for 60fps performance) */}
            {filteredList.length === 0 ? (
              <div className="bg-white p-8 text-center rounded-2xl border border-slate-200 text-slate-400">
                <Package className="w-8 h-8 mx-auto mb-1 opacity-30" />
                <p className="text-xs font-bold text-slate-500">No hay paletas en esta sección con los filtros actuales.</p>
              </div>
            ) : (
              <div className="space-y-1.5">
                {filteredList.slice(0, visibleCount).map((item, idx) => {
                  const state = getLpnState(item);
                  const chamber = getItemChamber(item);
                  const isItemInBatch = batchQueue.some(b => b.lpn === item.lpn);

                  return (
                    <div
                      key={item.lpn || idx}
                      className="bg-white p-2.5 rounded-xl border border-slate-200 hover:border-indigo-200 shadow-2xs transition-all space-y-1.5"
                    >
                      {/* Top row: LPN Code + State Badge + Chamber Badge + Quick Cola toggle */}
                      <div className="flex items-center justify-between gap-1.5">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="font-mono font-black text-xs sm:text-sm text-slate-900">{item.lpn}</span>
                          <span className={`px-1.5 py-0.2 rounded text-[9px] font-black uppercase ${
                            state === 'RESERVA' ? 'bg-indigo-100 text-indigo-800' : (state === 'PICKING' ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800')
                          }`}>
                            {state === 'RESERVA' ? 'RACK' : state}
                          </span>
                          <span className={`px-1.5 py-0.2 rounded text-[9px] font-black uppercase ${
                            chamber === 'SECO' ? 'bg-amber-50 text-amber-900 border border-amber-200' :
                            chamber === 'REFRIGERADO' ? 'bg-sky-50 text-sky-900 border border-sky-200' :
                            'bg-indigo-50 text-indigo-900 border border-indigo-200'
                          }`}>
                            {chamber === 'SECO' ? '📦 Seco' : chamber === 'REFRIGERADO' ? '❄️ Refrig.' : '🧊 Congel.'}
                          </span>
                        </div>

                        <div className="flex items-center gap-1">
                          {/* Cola Toggle Button */}
                          <button
                            onClick={() => {
                              if (isItemInBatch) {
                                handleRemoveFromBatch(item.lpn);
                              } else {
                                setBatchQueue(prev => [item, ...prev]);
                                setSelectedBatchLpns(prev => [...prev, item.lpn]);
                                showToast(`+ En Cola: ${item.lpn}`, 'success');
                              }
                            }}
                            className={`p-1 rounded-md text-[10px] font-bold border transition-all active:scale-95 ${
                              isItemInBatch
                                ? 'bg-indigo-600 text-white border-indigo-700 shadow-2xs'
                                : 'bg-slate-50 text-slate-600 border-slate-200 hover:bg-indigo-50 hover:text-indigo-700'
                            }`}
                            title={isItemInBatch ? 'Quitar de la cola' : 'Agregar a cola'}
                          >
                            <ShoppingCart className="w-3 h-3" />
                          </button>

                          {/* Quick action button */}
                          {state === 'RESERVA' && (
                            <button
                              onClick={() => handleBajarAPicking(item)}
                              disabled={isProcessing}
                              className="px-2 py-1 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg font-bold text-[10px] flex items-center gap-1 shadow-2xs active:scale-95"
                            >
                              <ArrowDownToLine className="w-3 h-3" />
                              <span>Bajar</span>
                            </button>
                          )}

                          {state === 'PENDIENTE' && (
                            <div className="flex items-center gap-1">
                              <button
                                onClick={() => {
                                  setSelectedLpn(item);
                                  setActiveTab('SCANNER');
                                  setIsRackModalOpen(true);
                                }}
                                className="px-2 py-1 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg font-bold text-[10px] shadow-2xs flex items-center gap-0.5"
                                title="Subir / Asignar en Rack"
                              >
                                <ArrowUpToLine className="w-3 h-3" />
                                <span>Rackear</span>
                              </button>
                              <button
                                onClick={() => handleBajarAPicking(item, 'Pase directo a Picking')}
                                disabled={isProcessing}
                                className="px-2 py-1 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg font-bold text-[10px] shadow-2xs flex items-center gap-0.5"
                                title="Pasar directamente a Picking"
                              >
                                <ArrowDownToLine className="w-3 h-3" />
                                <span>A Picking</span>
                              </button>
                            </div>
                          )}
                        </div>
                      </div>

                      {/* Product Name */}
                      <h4 className="text-xs font-semibold text-slate-800 truncate">
                        {item.productName || 'Producto no identificado'}
                      </h4>

                      {/* 🌟 HIGHLIGHTED CÓDIGO ICO, FECHA, CAJAS Y UNIDADES */}
                      <div className="flex flex-wrap items-center justify-between gap-1 text-[11px] pt-0.5 border-t border-slate-100">
                        {/* ICO / SKU MAS GRANDE */}
                        <div className="flex items-center gap-1 bg-indigo-50/70 border border-indigo-100 px-1.5 py-0.5 rounded text-indigo-900 font-mono font-bold">
                          <span className="text-[9px] text-indigo-500 font-sans">ICO:</span>
                          <span className="text-xs font-black">{item.productCode || 'N/A'}</span>
                        </div>

                        {/* Cantidad Cajas & Unidades */}
                        <div className="flex items-center gap-1 font-bold text-slate-700 font-mono text-[10px]">
                          <span className="bg-slate-100 px-1 py-0.5 rounded text-slate-900">{item.cajas || 0} cjs</span>
                          <span>/</span>
                          <span className="bg-slate-100 px-1 py-0.5 rounded text-slate-900">{item.unidades || item.quantity || 0} un</span>
                        </div>

                        {/* Fecha */}
                        <div className="flex items-center gap-1 text-[10px] text-slate-400 font-mono">
                          <Calendar className="w-2.5 h-2.5" />
                          <span>{(item.receptionDate || item.fecha_generado) ? formatLocalPeruTime(item.receptionDate || item.fecha_generado).split(' ')[0] : 'S/F'}</span>
                        </div>
                      </div>
                    </div>
                  );
                })}

                {filteredList.length > visibleCount && (
                  <button
                    onClick={() => setVisibleCount(prev => prev + 30)}
                    className="w-full py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold transition-all"
                  >
                    Mostrar más ({filteredList.length - visibleCount} restantes)
                  </button>
                )}
              </div>
            )}
          </div>
        )}

        {/* ----------------- TAB: HISTORIAL ----------------- */}
        {activeTab === 'HISTORIAL' && (
          <div className="bg-white rounded-2xl border border-slate-200 p-3 shadow-2xs space-y-2">
            <div className="flex items-center justify-between border-b border-slate-100 pb-2">
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setActiveTab('SCANNER')}
                  className="px-2 py-0.5 bg-slate-100 hover:bg-slate-200 text-indigo-700 rounded-lg text-xs font-bold flex items-center gap-1"
                >
                  <QrCode className="w-3 h-3" />
                  <span>← Escanear</span>
                </button>
                <span className="text-xs font-black text-slate-900">Historial de Turno</span>
              </div>
              <button
                onClick={() => setRecentMoves([])}
                className="text-[10px] font-bold text-slate-400 hover:text-rose-600"
              >
                Limpiar lista
              </button>
            </div>

            {recentMoves.length === 0 ? (
              <div className="p-6 text-center text-slate-400">
                <RotateCcw className="w-6 h-6 mx-auto mb-1 opacity-30" />
                <p className="text-xs font-bold">No hay movimientos registrados.</p>
              </div>
            ) : (
              <div className="divide-y divide-slate-100">
                {recentMoves.map((move, idx) => (
                  <div key={idx} className="py-2 flex items-center justify-between gap-2 text-xs">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5">
                        <span className="font-mono font-black text-xs text-slate-900">{move.lpn}</span>
                        <span className={`px-1.5 py-0.2 rounded text-[9px] font-black uppercase ${
                          move.tipo === 'BAJADA_PICKING' || move.tipo === 'DIRECTO_PICKING' || move.tipo === 'MASIVO_PICKING' ? 'bg-emerald-100 text-emerald-800' : 'bg-indigo-100 text-indigo-800'
                        }`}>
                          {move.tipo.replace('_', ' ')}
                        </span>
                        <span className="text-[10px] text-slate-400">{formatLocalPeruTime(move.timestamp).split(' ')[1]}</span>
                      </div>
                      <p className="text-[11px] text-slate-600 truncate mt-0.5">
                        {move.origen} <ArrowRight className="w-2.5 h-2.5 inline text-slate-400" /> {move.destino}
                      </p>
                      <p className="text-[10px] text-slate-400 font-mono">Op: {move.usuario}</p>
                    </div>

                    {(Date.now() - move.timestamp) <= 10 * 60 * 1000 && (
                      <button
                        onClick={() => handleUndoMovement(move)}
                        disabled={isProcessing}
                        className="px-2 py-1 bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 rounded-lg font-bold text-[10px] flex items-center gap-1 shrink-0"
                      >
                        <Undo2 className="w-3 h-3" />
                        <span>Deshacer</span>
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* 🛒 FLOATING BATCH BUTTON (Cola de LPNs Escaneados) */}
      {batchQueue.length > 0 && (
        <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-40 w-full max-w-sm px-3 animate-slide-up">
          <div className="bg-slate-900 text-white rounded-2xl p-2.5 sm:p-3 shadow-2xl border border-slate-700 flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-xl bg-indigo-500 text-white flex items-center justify-center font-black text-xs shadow-xs">
                {batchQueue.length}
              </div>
              <div>
                <span className="text-xs font-black block leading-none">Cola de Pallets ({batchQueue.length})</span>
                <span className="text-[10px] text-slate-300 font-mono">Listos para mover en bloque</span>
              </div>
            </div>

            <div className="flex items-center gap-1.5">
              <button
                onClick={() => {
                  setSelectedBatchLpns(batchQueue.map(b => b.lpn));
                  setIsBatchModalOpen(true);
                }}
                className="px-3 py-1.5 bg-indigo-500 hover:bg-indigo-600 active:scale-95 text-white rounded-xl text-xs font-black shadow-xs flex items-center gap-1 transition-all"
              >
                <span>Abrir Cola</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>

              <button
                onClick={() => {
                  setBatchQueue([]);
                  setSelectedBatchLpns([]);
                  showToast("Cola vaciada", "info");
                }}
                className="p-1.5 bg-slate-800 hover:bg-rose-900/50 text-slate-400 hover:text-rose-400 rounded-xl transition-all"
                title="Vaciar cola"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 📱 MODAL 1: GESTIÓN MASIVA DE LPNs (COLA MODAL) */}
      {isBatchModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-2xs flex items-center justify-center p-3 animate-fade-in">
          <div className="bg-white w-full max-w-md rounded-2xl border border-slate-200 shadow-2xl p-4 space-y-3 animate-scale-up max-h-[90vh] flex flex-col">
            {/* Modal Header */}
            <div className="flex items-center justify-between border-b border-slate-100 pb-2.5">
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 rounded-lg bg-indigo-50 border border-indigo-100 flex items-center justify-center text-indigo-600">
                  <ShoppingCart className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-xs sm:text-sm font-black text-slate-900 leading-none">Cola Masiva de Pallets</h3>
                  <span className="text-[10px] text-slate-500 font-mono">
                    {selectedBatchLpns.length} de {batchQueue.length} seleccionados
                  </span>
                </div>
              </div>

              <button
                onClick={() => setIsBatchModalOpen(false)}
                className="p-1 rounded-full text-slate-400 hover:text-slate-600"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Select All Toggle Bar */}
            <div className="flex items-center justify-between px-2 py-1.5 rounded-xl bg-slate-50 border border-slate-200 text-xs">
              <button
                onClick={handleToggleSelectAllBatch}
                className="flex items-center gap-1.5 font-bold text-slate-700 hover:text-indigo-600 text-[11px]"
              >
                {selectedBatchLpns.length === batchQueue.length ? (
                  <CheckSquare className="w-4 h-4 text-indigo-600" />
                ) : (
                  <Square className="w-4 h-4 text-slate-400" />
                )}
                <span>Seleccionar Todo ({batchQueue.length})</span>
              </button>

              <button
                onClick={() => setBatchQueue([])}
                className="text-[10px] font-bold text-rose-600 hover:underline flex items-center gap-1"
              >
                <Trash2 className="w-3 h-3" />
                <span>Limpiar Cola</span>
              </button>
            </div>

            {/* Scanned Items List inside Cola */}
            <div className="flex-1 overflow-y-auto space-y-1.5 pr-1 max-h-60 custom-scrollbar">
              {batchQueue.map((item, idx) => {
                const isSelected = selectedBatchLpns.includes(item.lpn);
                const state = getLpnState(item);

                return (
                  <div
                    key={item.lpn || idx}
                    onClick={() => handleToggleBatchItem(item.lpn)}
                    className={`p-2 rounded-xl border transition-all cursor-pointer flex items-center justify-between gap-2 ${
                      isSelected
                        ? 'bg-indigo-50/50 border-indigo-300 shadow-2xs'
                        : 'bg-white border-slate-200 opacity-70'
                    }`}
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      {isSelected ? (
                        <CheckSquare className="w-4 h-4 text-indigo-600 shrink-0" />
                      ) : (
                        <Square className="w-4 h-4 text-slate-300 shrink-0" />
                      )}

                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5">
                          <span className="font-mono font-black text-xs text-slate-900">{item.lpn}</span>
                          <span className="text-[9px] font-black uppercase px-1 rounded bg-slate-100 text-slate-700">
                            {state}
                          </span>
                        </div>
                        <p className="text-[11px] font-medium text-slate-700 truncate">{item.productName}</p>
                        <div className="flex items-center gap-1 text-[10px] font-mono text-slate-500">
                          <span className="font-bold text-indigo-700">ICO: {item.productCode}</span>
                          <span>·</span>
                          <span>{item.cajas || 0} cjs ({item.unidades || item.quantity || 0} un)</span>
                        </div>
                      </div>
                    </div>

                    <button
                      onClick={e => {
                        e.stopPropagation();
                        handleRemoveFromBatch(item.lpn);
                      }}
                      className="p-1 text-slate-300 hover:text-rose-500 rounded"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                );
              })}
            </div>

            {/* Mass Action Buttons */}
            <div className="pt-2 border-t border-slate-100 space-y-2">
              <div className="grid grid-cols-2 gap-2">
                <button
                  onClick={() => handleExecuteBatchMove('RACK')}
                  disabled={isProcessing || selectedBatchLpns.length === 0}
                  className="py-2.5 px-3 rounded-xl bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white font-black text-xs flex items-center justify-center gap-1.5 shadow-2xs active:scale-95 transition-all"
                >
                  <ArrowUpToLine className="w-4 h-4" />
                  <span>RACKEAR COLA ({selectedBatchLpns.length})</span>
                </button>

                <button
                  onClick={() => handleExecuteBatchMove('PICKING')}
                  disabled={isProcessing || selectedBatchLpns.length === 0}
                  className="py-2.5 px-3 rounded-xl bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white font-black text-xs flex items-center justify-center gap-1.5 shadow-2xs active:scale-95 transition-all"
                >
                  <ArrowDownToLine className="w-4 h-4" />
                  <span>A PICKING COLA ({selectedBatchLpns.length})</span>
                </button>
              </div>

              <div className="text-[10px] text-center text-slate-400 font-mono">
                Registra usuario: {currentUser?.nombre || currentUser?.username || 'OPERADOR'} · {new Date().toLocaleTimeString('es-PE')}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 📱 MODAL 2: ASIGNACIÓN DE RACK (INDIVIDUAL) */}
      {isRackModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-2xs flex items-center justify-center p-3 animate-fade-in">
          <div className="bg-white w-full max-w-sm rounded-2xl border border-slate-200 shadow-xl p-4 space-y-3 animate-scale-up">
            <div className="flex items-center justify-between border-b border-slate-100 pb-2">
              <div className="flex items-center gap-1.5">
                <Building2 className="w-4 h-4 text-indigo-600" />
                <h3 className="text-xs sm:text-sm font-black text-slate-900">Ubicación en Rack</h3>
              </div>
              <button
                onClick={() => setIsRackModalOpen(false)}
                className="p-1 rounded-full text-slate-400 hover:text-slate-600"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {selectedLpn && (
              <div className="p-2 rounded-xl bg-indigo-50 border border-indigo-100 text-xs space-y-1">
                <div className="flex items-center justify-between">
                  <span className="font-mono font-black text-indigo-900">{selectedLpn.lpn}</span>
                  <span className="px-2 py-0.5 rounded bg-white font-bold text-[10px] text-indigo-800">
                    {selectedLpn.cajas || 0} cjs ({selectedLpn.unidades || selectedLpn.quantity || 0} un)
                  </span>
                </div>
                <div className="flex items-center justify-between text-[11px]">
                  <span className="text-indigo-700 truncate max-w-[180px]">{selectedLpn.productName}</span>
                  <span className="font-mono font-black text-indigo-900 text-xs">ICO: {selectedLpn.productCode}</span>
                </div>
              </div>
            )}

            {/* ⚡ BOTONES RÁPIDOS DE RACK (A, B, C, D, E) */}
            <div className="space-y-2 pt-1">
              <label className="text-[11px] font-black uppercase text-slate-700 tracking-wider flex items-center justify-between">
                <span>Seleccionar Rack de Destino:</span>
                <span className="text-[10px] text-indigo-600 font-bold bg-indigo-50 px-2 py-0.5 rounded-md">1-Tap Rápido</span>
              </label>

              <div className="grid grid-cols-5 gap-1.5 sm:gap-2">
                {['A', 'B', 'C', 'D', 'E'].map(letter => {
                  const matchingRack = racks.find(r => r.aisle?.toUpperCase() === letter);
                  const emptyCount = matchingRack ? matchingRack.slots.filter(s => s.status === 'empty').length : 0;
                  return (
                    <button
                      key={letter}
                      onClick={() => handleFastRackSelect(letter)}
                      disabled={isProcessing}
                      className="group flex flex-col items-center justify-center py-3.5 px-1 rounded-2xl border-2 border-indigo-200 bg-indigo-50/70 hover:bg-indigo-600 hover:border-indigo-600 text-indigo-950 hover:text-white transition-all active:scale-90 shadow-2xs hover:shadow-md focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-1 disabled:opacity-50"
                    >
                      <span className="text-xl sm:text-2xl font-black font-mono leading-none group-hover:scale-110 transition-transform">
                        {letter}
                      </span>
                      <span className="text-[10px] font-black mt-1 uppercase tracking-wide group-hover:text-indigo-100">
                        Rack
                      </span>
                      <span className="text-[9px] font-bold text-indigo-600 group-hover:text-indigo-200 mt-0.5">
                        {emptyCount} lib
                      </span>
                    </button>
                  );
                })}
              </div>
              <p className="text-[10px] text-slate-500 text-center font-medium">
                Toque la letra del rack para ubicar el pallet en el sistema de forma inmediata.
              </p>
            </div>

            {/* Opciones opcionales / avanzadas (Manual) */}
            <div className="pt-2 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setShowDetailedLocation(!showDetailedLocation)}
                className="w-full text-[11px] font-bold text-slate-500 hover:text-indigo-600 flex items-center justify-center gap-1 py-1 transition-colors"
              >
                <span>{showDetailedLocation ? '▲ Ocultar especificación de nivel/posición' : '▼ Especificar nivel y posición (opcional)'}</span>
              </button>

              {showDetailedLocation && (
                <div className="space-y-3 pt-2">
                  {/* Manual Code Input */}
                  <div className="space-y-1">
                    <label className="text-[10px] font-black uppercase text-slate-500 tracking-wider block">
                      Escanear / Digitar Código:
                    </label>
                    <div className="flex items-center gap-1.5">
                      <input
                        type="text"
                        placeholder="Ej: A-01-N2-P1"
                        value={manualLocationText}
                        onChange={e => setManualLocationText(e.target.value)}
                        onKeyDown={e => {
                          if (e.key === 'Enter' && manualLocationText.trim()) {
                            e.preventDefault();
                            parseAndApplyManualLocation(manualLocationText.trim());
                          }
                        }}
                        className="flex-1 px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl font-mono font-bold text-xs text-slate-900 outline-none focus:border-indigo-500"
                      />
                      <button
                        onClick={() => parseAndApplyManualLocation(manualLocationText.trim())}
                        disabled={!manualLocationText.trim() || isProcessing}
                        className="px-3 py-2 bg-slate-900 text-white rounded-xl font-bold text-xs shrink-0"
                      >
                        Asignar
                      </button>
                    </div>
                  </div>

                  {/* Visual Selector Dropdowns */}
                  <div className="space-y-2 pt-1 border-t border-slate-100">
                    <div>
                      <label className="text-[10px] font-bold text-slate-500 block mb-0.5">Rack:</label>
                      <select
                        value={selectedRackId || ''}
                        onChange={e => {
                          const val = Number(e.target.value);
                          setSelectedRackId(val || null);
                          setSelectedLevel(1);
                          setSelectedPosition(1);
                        }}
                        className="w-full p-2 bg-slate-50 border border-slate-200 rounded-xl font-bold text-xs text-slate-800 outline-none focus:border-indigo-500"
                      >
                        <option value="">-- Seleccionar Rack --</option>
                        {racks.map(r => (
                          <option key={r.id} value={r.id}>
                            Pasillo {r.aisle} - Rack {r.id} ({r.levels}x{r.positionsPerLevel})
                          </option>
                        ))}
                      </select>
                    </div>

                    {selectedRackId && (
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <label className="text-[10px] font-bold text-slate-500 block mb-0.5">Nivel:</label>
                          <select
                            value={selectedLevel || 1}
                            onChange={e => setSelectedLevel(Number(e.target.value))}
                            className="w-full p-2 bg-slate-50 border border-slate-200 rounded-xl font-bold text-xs text-slate-800 outline-none focus:border-indigo-500"
                          >
                            {Array.from({ length: racks.find(r => r.id === selectedRackId)?.levels || 4 }, (_, i) => i + 1).map(lvl => (
                              <option key={lvl} value={lvl}>Nivel {lvl}</option>
                            ))}
                          </select>
                        </div>

                        <div>
                          <label className="text-[10px] font-bold text-slate-500 block mb-0.5">Posición:</label>
                          <select
                            value={selectedPosition || 1}
                            onChange={e => setSelectedPosition(Number(e.target.value))}
                            className="w-full p-2 bg-slate-50 border border-slate-200 rounded-xl font-bold text-xs text-slate-800 outline-none focus:border-indigo-500"
                          >
                            {Array.from({ length: racks.find(r => r.id === selectedRackId)?.positionsPerLevel || 3 }, (_, i) => i + 1).map(pos => (
                              <option key={pos} value={pos}>Posición {pos}</option>
                            ))}
                          </select>
                        </div>
                      </div>
                    )}
                  </div>

                  <div className="flex items-center justify-end gap-1.5 pt-2 border-t border-slate-100">
                    <button
                      onClick={handleConfirmRackAssignment}
                      disabled={isProcessing || !selectedRackId}
                      className="w-full py-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white rounded-xl font-black text-xs shadow-2xs flex items-center justify-center gap-1"
                    >
                      <Check className="w-3.5 h-3.5" />
                      <span>Confirmar Nivel y Posición</span>
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* Modal Cancel Button */}
            <div className="flex items-center justify-end pt-2 border-t border-slate-100">
              <button
                onClick={() => {
                  setIsRackModalOpen(false);
                  setShowDetailedLocation(false);
                }}
                className="w-full py-2 rounded-xl text-slate-600 bg-slate-100 hover:bg-slate-200 font-bold text-xs text-center transition-colors"
              >
                Cerrar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 📱 MODAL 3: ASIGNACIÓN DE RACK PARA BATCH MASIVO */}
      {isBatchRackModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-2xs flex items-center justify-center p-3 animate-fade-in">
          <div className="bg-white w-full max-w-sm rounded-2xl border border-slate-200 shadow-xl p-4 space-y-3 animate-scale-up">
            <div className="flex items-center justify-between border-b border-slate-100 pb-2">
              <div className="flex items-center gap-1.5">
                <Building2 className="w-4 h-4 text-indigo-600" />
                <h3 className="text-xs sm:text-sm font-black text-slate-900">Rackeo Masivo ({selectedBatchLpns.length} pallets)</h3>
              </div>
              <button
                onClick={() => setIsBatchRackModalOpen(false)}
                className="p-1 rounded-full text-slate-400 hover:text-slate-600"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-2 rounded-xl bg-indigo-50 border border-indigo-100 text-xs">
              <span className="font-bold text-indigo-950 block">Destino de almacenamiento:</span>
              <span className="text-[11px] text-indigo-700">Se asignarán los {selectedBatchLpns.length} pallets a la posición seleccionada</span>
            </div>

            {/* ⚡ BOTONES RÁPIDOS DE RACK MASIVO (A, B, C, D, E) */}
            <div className="space-y-2 pt-1">
              <label className="text-[11px] font-black uppercase text-slate-700 tracking-wider flex items-center justify-between">
                <span>Seleccionar Rack de Destino:</span>
                <span className="text-[10px] text-indigo-600 font-bold bg-indigo-50 px-2 py-0.5 rounded-md">1-Tap Masivo</span>
              </label>

              <div className="grid grid-cols-5 gap-1.5 sm:gap-2">
                {['A', 'B', 'C', 'D', 'E'].map(letter => {
                  const matchingRack = racks.find(r => r.aisle?.toUpperCase() === letter);
                  const emptyCount = matchingRack ? matchingRack.slots.filter(s => s.status === 'empty').length : 0;
                  return (
                    <button
                      key={letter}
                      onClick={() => handleFastBatchRackSelect(letter)}
                      disabled={isProcessing}
                      className="group flex flex-col items-center justify-center py-3 px-1 rounded-2xl border-2 border-indigo-200 bg-indigo-50/70 hover:bg-indigo-600 hover:border-indigo-600 text-indigo-950 hover:text-white transition-all active:scale-90 shadow-2xs hover:shadow-md focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-1 disabled:opacity-50"
                    >
                      <span className="text-xl sm:text-2xl font-black font-mono leading-none group-hover:scale-110 transition-transform">
                        {letter}
                      </span>
                      <span className="text-[10px] font-black mt-1 uppercase tracking-wide group-hover:text-indigo-100">
                        Rack
                      </span>
                      <span className="text-[9px] font-bold text-indigo-600 group-hover:text-indigo-200 mt-0.5">
                        {emptyCount} lib
                      </span>
                    </button>
                  );
                })}
              </div>
              <p className="text-[10px] text-slate-500 text-center font-medium">
                Toque el rack deseado para asignar los {selectedBatchLpns.length} pallets de inmediato.
              </p>
            </div>

            {/* Opciones opcionales / avanzadas (Manual) */}
            <div className="pt-2 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setShowDetailedLocation(!showDetailedLocation)}
                className="w-full text-[11px] font-bold text-slate-500 hover:text-indigo-600 flex items-center justify-center gap-1 py-1 transition-colors"
              >
                <span>{showDetailedLocation ? '▲ Ocultar especificación de nivel/posición' : '▼ Especificar nivel y posición (opcional)'}</span>
              </button>

              {showDetailedLocation && (
                <div className="space-y-3 pt-2">
                  <div className="space-y-2">
                    <div>
                      <label className="text-[10px] font-bold text-slate-500 block mb-0.5">Rack:</label>
                      <select
                        value={selectedRackId || ''}
                        onChange={e => {
                          const val = Number(e.target.value);
                          setSelectedRackId(val || null);
                          setSelectedLevel(1);
                          setSelectedPosition(1);
                        }}
                        className="w-full p-2 bg-slate-50 border border-slate-200 rounded-xl font-bold text-xs text-slate-800 outline-none focus:border-indigo-500"
                      >
                        <option value="">-- Seleccionar Rack --</option>
                        {racks.map(r => (
                          <option key={r.id} value={r.id}>
                            Pasillo {r.aisle} - Rack {r.id} ({r.levels}x{r.positionsPerLevel})
                          </option>
                        ))}
                      </select>
                    </div>

                    {selectedRackId && (
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <label className="text-[10px] font-bold text-slate-500 block mb-0.5">Nivel:</label>
                          <select
                            value={selectedLevel || 1}
                            onChange={e => setSelectedLevel(Number(e.target.value))}
                            className="w-full p-2 bg-slate-50 border border-slate-200 rounded-xl font-bold text-xs text-slate-800 outline-none focus:border-indigo-500"
                          >
                            {Array.from({ length: racks.find(r => r.id === selectedRackId)?.levels || 4 }, (_, i) => i + 1).map(lvl => (
                              <option key={lvl} value={lvl}>Nivel {lvl}</option>
                            ))}
                          </select>
                        </div>

                        <div>
                          <label className="text-[10px] font-bold text-slate-500 block mb-0.5">Posición:</label>
                          <select
                            value={selectedPosition || 1}
                            onChange={e => setSelectedPosition(Number(e.target.value))}
                            className="w-full p-2 bg-slate-50 border border-slate-200 rounded-xl font-bold text-xs text-slate-800 outline-none focus:border-indigo-500"
                          >
                            {Array.from({ length: racks.find(r => r.id === selectedRackId)?.positionsPerLevel || 3 }, (_, i) => i + 1).map(pos => (
                              <option key={pos} value={pos}>Posición {pos}</option>
                            ))}
                          </select>
                        </div>
                      </div>
                    )}
                  </div>

                  <div className="flex items-center justify-end gap-1.5 pt-2 border-t border-slate-100">
                    <button
                      onClick={handleConfirmBatchRackAssignment}
                      disabled={isProcessing || !selectedRackId}
                      className="w-full py-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white rounded-xl font-black text-xs shadow-2xs flex items-center justify-center gap-1"
                    >
                      <Check className="w-3.5 h-3.5" />
                      <span>Guardar Masivo</span>
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* Modal Cancel Button */}
            <div className="flex items-center justify-end pt-2 border-t border-slate-100">
              <button
                onClick={() => {
                  setIsBatchRackModalOpen(false);
                  setShowDetailedLocation(false);
                }}
                className="w-full py-2 rounded-xl text-slate-600 bg-slate-100 hover:bg-slate-200 font-bold text-xs text-center transition-colors"
              >
                Cerrar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 📱 MODAL 4: FILTRO POR CÁMARA (SECOS, REFRIGERADO, CONGELADO) - 100% APPLIKE */}
      {isChamberModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-2xs flex items-center justify-center p-3 animate-fade-in">
          <div className="bg-white w-full max-w-sm rounded-3xl border border-slate-200 shadow-2xl p-4 sm:p-5 space-y-4 animate-scale-up">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2">
                <div className="p-2 bg-sky-100 text-sky-700 rounded-xl">
                  <Warehouse className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-sm sm:text-base font-black text-slate-900">Filtrar por Cámara</h3>
                  <p className="text-[11px] font-bold text-slate-500">Almacenamiento por temperatura</p>
                </div>
              </div>
              <button
                onClick={() => setIsChamberModalOpen(false)}
                className="p-1.5 rounded-full text-slate-400 hover:text-slate-600 bg-slate-100"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Chamber selection cards */}
            <div className="space-y-2">
              {/* Option 1: TODAS */}
              <button
                type="button"
                onClick={() => {
                  setSelectedChamber('TODOS');
                  setIsChamberModalOpen(false);
                  showToast(`Filtro: Todas las Cámaras (${pendingChamberCounts.total} pendientes)`, 'info');
                }}
                className={`w-full p-3 rounded-2xl border-2 text-left transition-all flex items-center justify-between active:scale-98 ${
                  selectedChamber === 'TODOS'
                    ? 'border-indigo-600 bg-indigo-50/80 shadow-xs ring-1 ring-indigo-400'
                    : 'border-slate-200 hover:border-slate-300 bg-white'
                }`}
              >
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-slate-100 text-slate-800 flex items-center justify-center text-lg font-black shrink-0">
                    🌟
                  </div>
                  <div>
                    <span className="text-xs font-black text-slate-900 block">Todas las Cámaras</span>
                    <span className="text-[10px] font-bold text-slate-500">Ver inventario completo</span>
                  </div>
                </div>
                <div className="text-right">
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-mono font-black bg-slate-200 text-slate-800">
                    {pendingChamberCounts.total} pend.
                  </span>
                </div>
              </button>

              {/* Option 2: SECO */}
              <button
                type="button"
                onClick={() => {
                  setSelectedChamber('SECO');
                  setIsChamberModalOpen(false);
                  showToast(`Cámara SECO seleccionada (${pendingChamberCounts.seco} pendientes)`, 'info');
                }}
                className={`w-full p-3 rounded-2xl border-2 text-left transition-all flex items-center justify-between active:scale-98 ${
                  selectedChamber === 'SECO'
                    ? 'border-amber-500 bg-amber-50/80 shadow-xs ring-2 ring-amber-300'
                    : 'border-slate-200 hover:border-amber-300 bg-white'
                }`}
              >
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-amber-100 text-amber-800 flex items-center justify-center text-lg font-black shrink-0">
                    📦
                  </div>
                  <div>
                    <span className="text-xs font-black text-amber-950 block">Cámara de Secos</span>
                    <span className="text-[10px] font-bold text-slate-500">Abarrotes y temperatura ambiente</span>
                  </div>
                </div>
                <div className="text-right">
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-mono font-black bg-amber-100 text-amber-900 border border-amber-300">
                    {pendingChamberCounts.seco} pend.
                  </span>
                </div>
              </button>

              {/* Option 3: REFRIGERADO */}
              <button
                type="button"
                onClick={() => {
                  setSelectedChamber('REFRIGERADO');
                  setIsChamberModalOpen(false);
                  showToast(`Cámara REFRIGERADO seleccionada (${pendingChamberCounts.refrigerado} pendientes)`, 'info');
                }}
                className={`w-full p-3 rounded-2xl border-2 text-left transition-all flex items-center justify-between active:scale-98 ${
                  selectedChamber === 'REFRIGERADO'
                    ? 'border-sky-500 bg-sky-50/80 shadow-xs ring-2 ring-sky-300'
                    : 'border-slate-200 hover:border-sky-300 bg-white'
                }`}
              >
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-sky-100 text-sky-800 flex items-center justify-center text-lg font-black shrink-0">
                    ❄️
                  </div>
                  <div>
                    <span className="text-xs font-black text-sky-950 block">Cámara de Refrigerado</span>
                    <span className="text-[10px] font-bold text-slate-500">0°C a 4°C (Lácteos, embutidos, frutas)</span>
                  </div>
                </div>
                <div className="text-right">
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-mono font-black bg-sky-100 text-sky-900 border border-sky-300">
                    {pendingChamberCounts.refrigerado} pend.
                  </span>
                </div>
              </button>

              {/* Option 4: CONGELADO */}
              <button
                type="button"
                onClick={() => {
                  setSelectedChamber('CONGELADO');
                  setIsChamberModalOpen(false);
                  showToast(`Cámara CONGELADO seleccionada (${pendingChamberCounts.congelado} pendientes)`, 'info');
                }}
                className={`w-full p-3 rounded-2xl border-2 text-left transition-all flex items-center justify-between active:scale-98 ${
                  selectedChamber === 'CONGELADO'
                    ? 'border-indigo-600 bg-indigo-50/80 shadow-xs ring-2 ring-indigo-300'
                    : 'border-slate-200 hover:border-indigo-300 bg-white'
                }`}
              >
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-indigo-100 text-indigo-800 flex items-center justify-center text-lg font-black shrink-0">
                    🧊
                  </div>
                  <div>
                    <span className="text-xs font-black text-indigo-950 block">Cámara de Congelado</span>
                    <span className="text-[10px] font-bold text-slate-500">-18°C (Carnes, pescados, helados)</span>
                  </div>
                </div>
                <div className="text-right">
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-mono font-black bg-indigo-100 text-indigo-900 border border-indigo-300">
                    {pendingChamberCounts.congelado} pend.
                  </span>
                </div>
              </button>
            </div>

            {/* Quick Action: Ir directo a Pendientes de la cámara seleccionada */}
            <div className="pt-2 border-t border-slate-100 flex gap-2">
              <button
                type="button"
                onClick={() => {
                  setActiveTab('PENDIENTES');
                  setIsChamberModalOpen(false);
                }}
                className="flex-1 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-black text-xs flex items-center justify-center gap-1.5 shadow-2xs active:scale-95 transition-all"
              >
                <span>Ver Lista Pendientes</span>
                <MoveRight className="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                onClick={() => setIsChamberModalOpen(false)}
                className="px-4 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl font-bold text-xs"
              >
                Listo
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
