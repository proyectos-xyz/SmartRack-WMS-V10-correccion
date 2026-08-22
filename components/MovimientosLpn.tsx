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
  FileSpreadsheet,
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
import * as XLSX from 'xlsx';
import { Html5Qrcode, Html5QrcodeSupportedFormats } from 'html5-qrcode';
import { InventoryItem, Product, Usuario, Rack, RackLocation } from '../types';
import { supabase } from '../supabaseClient';

interface MovimientosLpnProps {
  inventory: InventoryItem[];
  catalog: Product[];
  racks: Rack[];
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
  catalog: _catalog,
  racks,
  currentUser,
  onAssignLocation,
  onRefresh
}) => {
  // Navigation Tabs
  const [activeTab, setActiveTab] = useState<'SCANNER' | 'RACKS' | 'PENDIENTES' | 'PICKING' | 'HISTORIAL'>('SCANNER');

  // Search & Barcode input
  const [scanInput, setScanInput] = useState('');
  const [selectedLpn, setSelectedLpn] = useState<InventoryItem | null>(null);
  const [searchFilter, setSearchFilter] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [soundEnabled] = useState(true);
  const [visibleCount, setVisibleCount] = useState(30);

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

  // Helper to determine real computed status of LPN
  const getLpnState = (item: InventoryItem): 'PENDIENTE' | 'RESERVA' | 'PICKING' => {
    if (item.estado_lpn === 'PICKING') return 'PICKING';
    if (item.location || item.locationId || item.estado_lpn === 'UBICADO' || item.estado_lpn === 'GENERADO' || item.estado_lpn === 'RESERVA') {
      return 'RESERVA';
    }
    return 'PENDIENTE';
  };

  // 🔥 HIGH-PERFORMANCE SINGLE-PASS MEMOIZATION:
  // Pre-computes exact maps and suffix lookup index for 4/5-digit fast PDA matching
  const { lpnMap, suffixMap, activeList, pendientesList, reservasInRackList, pickingList } = useMemo(() => {
    const map = new Map<string, InventoryItem>();
    const sufMap = new Map<string, InventoryItem[]>();
    const act: InventoryItem[] = [];
    const pend: InventoryItem[] = [];
    const res: InventoryItem[] = [];
    const pick: InventoryItem[] = [];

    for (let i = 0; i < inventory.length; i++) {
      const item = inventory[i];
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

      const state = item.estado_lpn === 'PICKING'
        ? 'PICKING'
        : (item.location || item.locationId || item.estado_lpn === 'UBICADO' || item.estado_lpn === 'GENERADO' || item.estado_lpn === 'RESERVA')
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
  }, [inventory]);

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

  // 🚀 ACTION 1: BAJAR A PICKING (INDIVIDUAL)
  const handleBajarAPicking = async (item: InventoryItem, reason: string = 'Bajada a Picking') => {
    setIsProcessing(true);
    const lpnCode = item.lpn;
    const currentState = getLpnState(item);
    const oldLocationId = item.locationId || item.location?.id;
    const oldLocation = item.location;
    const operatorName = currentUser?.nombre || currentUser?.username || 'OPERADOR';
    const nowIso = new Date().toISOString();

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
          estado_lpn: 'PICKING',
          ubicacion_id: null,
          usuario_ultima_ubicacion: operatorName,
          fecha_ultima_ubicacion: nowIso,
          motivo_ultima_ubicacion: reason
        })
        .eq('lpn', lpnCode);

      if (lpnErr) throw lpnErr;

      const isDirectFromPendiente = currentState === 'PENDIENTE';
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
      // Remove from batch if present
      setBatchQueue(prev => prev.filter(b => b.lpn !== lpnCode));
      setSelectedBatchLpns(prev => prev.filter(l => l !== lpnCode));

      await onRefresh();
      setSelectedLpn(prev => prev && prev.lpn === lpnCode ? { ...prev, estado_lpn: 'PICKING', location: null, locationId: undefined } : null);
      showToast(`LPN ${lpnCode} pasado a PICKING`, "success");
    } catch (err: any) {
      console.error("Error bajando LPN a picking:", err);
      showToast(`Error: ${err?.message || 'Fallo de conexión'}`, "error");
    } finally {
      setIsProcessing(false);
    }
  };

  // 🚀 ACTION 2: RACKEAR / ASIGNAR EN ALTURA (INDIVIDUAL)
  const handleConfirmRackAssignment = async () => {
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

    setIsProcessing(true);
    const lpnCode = selectedLpn.lpn;
    const currentState = getLpnState(selectedLpn);
    const oldLocation = selectedLpn.location;
    const oldLocationId = selectedLpn.locationId;
    const operatorName = currentUser?.nombre || currentUser?.username || 'OPERADOR';
    const nowIso = new Date().toISOString();

    try {
      onAssignLocation(lpnCode, targetLocation, currentState === 'PENDIENTE' ? 'Rackeo inicial' : 'Reubicación');

      await supabase
        .from('paletas_lpn')
        .update({
          estado: 'ACTIVO',
          estado_lpn: 'GENERADO',
          usuario_ultima_ubicacion: operatorName,
          fecha_ultima_ubicacion: nowIso
        })
        .eq('lpn', lpnCode);

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

      setIsRackModalOpen(false);
      setSelectedRackId(null);
      setSelectedLevel(null);
      setSelectedPosition(null);
      setManualLocationText('');

      // Remove from batch if present
      setBatchQueue(prev => prev.filter(b => b.lpn !== lpnCode));
      setSelectedBatchLpns(prev => prev.filter(l => l !== lpnCode));

      await onRefresh();
      setSelectedLpn(null);
      showToast(`LPN ${lpnCode} ubicado en ${targetLocation.aisle}-R${targetLocation.rackId}-N${targetLocation.level}-P${targetLocation.position}`, "success");
    } catch (err: any) {
      console.error("Error al almacenar en rack:", err);
      showToast(`Error: ${err?.message || 'Fallo desconocido'}`, "error");
    } finally {
      setIsProcessing(false);
    }
  };

  const parseAndApplyManualLocation = async (text: string) => {
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
    setIsProcessing(true);
    try {
      onAssignLocation(selectedLpn.lpn, targetLocation, 'Rackeo Manual Escaneado');
      setIsRackModalOpen(false);
      setManualLocationText('');
      await onRefresh();
      setSelectedLpn(null);
      showToast(`Ubicado en ${foundRack.aisle}-R${foundRack.id}-N${level}-P${pos}`, "success");
    } catch (e: any) {
      showToast(`Error: ${e?.message}`, "error");
    } finally {
      setIsProcessing(false);
    }
  };

  // 🔥 ACTION 4: PROCESAMIENTO MASIVO (BATCH A PICKING O RACK)
  const handleExecuteBatchMove = async (action: 'PICKING' | 'RACK') => {
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
    setIsProcessing(true);
    const operatorName = currentUser?.nombre || currentUser?.username || 'OPERADOR';
    const nowIso = new Date().toISOString();

    try {
      const locationIdsToFree: string[] = [];
      const lpnCodesToUpdate: string[] = [];
      const logsToInsert: any[] = [];
      const newMovesList: MovementLog[] = [];

      for (const item of targetItems) {
        const lpnCode = item.lpn;
        const oldLocId = item.locationId || item.location?.id;
        if (oldLocId) locationIdsToFree.push(oldLocId);
        lpnCodesToUpdate.push(lpnCode);

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

      // 1. Free rack locations in bulk
      if (locationIdsToFree.length > 0) {
        await supabase
          .from('ubicaciones')
          .update({ estado: 'VACIO' })
          .in('id', locationIdsToFree);
      }

      // 2. Update LPN states in bulk
      const { error: lpnErr } = await supabase
        .from('paletas_lpn')
        .update({
          estado: 'ACTIVO',
          estado_lpn: 'PICKING',
          ubicacion_id: null,
          usuario_ultima_ubicacion: operatorName,
          fecha_ultima_ubicacion: nowIso,
          motivo_ultima_ubicacion: `Pase Masivo a Picking (${targetItems.length} pallets)`
        })
        .in('lpn', lpnCodesToUpdate);

      if (lpnErr) throw lpnErr;

      // 3. Insert audit movement logs in bulk
      if (logsToInsert.length > 0) {
        await supabase.from('lpn_movimientos').insert(logsToInsert);
      }

      setRecentMoves(prev => [...newMovesList, ...prev]);

      // Remove processed items from batch queue
      setBatchQueue(prev => prev.filter(b => !selectedBatchLpns.includes(b.lpn)));
      setSelectedBatchLpns([]);
      setIsBatchModalOpen(false);

      await onRefresh();
      showToast(`${targetItems.length} LPNs pasados a PICKING con éxito`, "success");
    } catch (err: any) {
      console.error("Error en movimiento masivo a picking:", err);
      showToast(`Error masivo: ${err?.message || 'Fallo de base de datos'}`, "error");
    } finally {
      setIsProcessing(false);
    }
  };

  // 🔥 ACTION 4.B: BATCH TO RACK CONFIRMATION
  const handleConfirmBatchRackAssignment = async () => {
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

    setIsProcessing(true);
    const operatorName = currentUser?.nombre || currentUser?.username || 'OPERADOR';
    const nowIso = new Date().toISOString();

    const targetLocation: RackLocation = {
      aisle: rack.aisle,
      rackId: rack.id,
      level: selectedLevel,
      position: selectedPosition
    };

    try {
      const lpnCodesToUpdate = targetItems.map(i => i.lpn);
      const logsToInsert: any[] = [];
      const newMovesList: MovementLog[] = [];

      for (const item of targetItems) {
        onAssignLocation(item.lpn, targetLocation, `Rackeo Masivo (${targetItems.length} pallets)`);

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

      setRecentMoves(prev => [...newMovesList, ...prev]);

      // Clear batch and modals
      setBatchQueue(prev => prev.filter(b => !selectedBatchLpns.includes(b.lpn)));
      setSelectedBatchLpns([]);
      setIsBatchRackModalOpen(false);
      setIsBatchModalOpen(false);

      await onRefresh();
      showToast(`${targetItems.length} LPNs rackeados en ${targetLocation.aisle}-R${targetLocation.rackId}`, "success");
    } catch (err: any) {
      console.error("Error en rackeo masivo:", err);
      showToast(`Error masivo: ${err?.message || 'Fallo desconocido'}`, "error");
    } finally {
      setIsProcessing(false);
    }
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

  // EXPORT TO EXCEL
  const handleExportData = (mode: 'RESERVA' | 'ALL') => {
    try {
      const targetItems = mode === 'RESERVA' ? reservasInRackList : activeList;
      const exportRows = targetItems.map((item, idx) => {
        const state = getLpnState(item);
        const locStr = item.location
          ? `${item.location.aisle}-R${item.location.rackId}-N${item.location.level}-P${item.location.position}`
          : (item.locationId || 'Sin Ubicación (Suelo)');

        return {
          'N°': idx + 1,
          'LPN': item.lpn,
          'Código ICO': item.productCode || '',
          'Descripción': item.productName || '',
          'Estado': state === 'RESERVA' ? 'EN RACK' : (state === 'PICKING' ? 'PICKING' : 'PENDIENTE'),
          'Ubicación': locStr,
          'Cajas': item.cajas || 0,
          'Unidades': item.unidades || item.quantity || 0,
          'Fecha Ingreso / Creación': (item.receptionDate || item.fecha_generado) ? formatLocalPeruTime(item.receptionDate || item.fecha_generado) : '-',
          'Vencimiento': item.expirationDate ? formatLocalPeruTime(item.expirationDate).split(' ')[0] : 'N/A'
        };
      });

      const ws = XLSX.utils.json_to_sheet(exportRows);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, mode === 'RESERVA' ? 'LPNs_Rack' : 'LPNs_Todos');

      const fileName = mode === 'RESERVA'
        ? `LPNS_RACK_${new Date().toISOString().split('T')[0]}.xlsx`
        : `LPNS_TOTAL_${new Date().toISOString().split('T')[0]}.xlsx`;

      XLSX.writeFile(wb, fileName);
      showToast(`Descargado ${fileName}`, "success");
    } catch (e: any) {
      showToast(`Error exportar: ${e?.message}`, "error");
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

    if (!searchFilter.trim()) return baseList;
    const q = searchFilter.trim().toLowerCase();
    return baseList.filter(item =>
      item.lpn.toLowerCase().includes(q) ||
      (item.productCode && item.productCode.toLowerCase().includes(q)) ||
      (item.productName && item.productName.toLowerCase().includes(q)) ||
      (item.location && `${item.location.aisle}-${item.location.rackId}-${item.location.level}-${item.location.position}`.toLowerCase().includes(q))
    );
  }, [activeList, reservasInRackList, pendientesList, pickingList, activeTab, searchFilter]);

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

            {currentUser?.rol === 'ADMIN' && (
              <button
                onClick={() => handleExportData('RESERVA')}
                className="px-2 py-1 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-200 rounded-lg text-[11px] font-bold flex items-center gap-1 transition-all"
                title="Descargar Racks en Excel"
              >
                <FileSpreadsheet className="w-3.5 h-3.5" />
                <span>Excel</span>
              </button>
            )}

            <button
              onClick={onRefresh}
              className="p-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg border border-slate-200 transition-all"
              title="Recargar"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isProcessing ? 'animate-spin' : ''}`} />
            </button>
          </div>
        </div>

        {/* 📱 3 ULTRA-COMPACT STATUS PILLS (Click to view list or return to scanner) */}
        <div className="max-w-2xl mx-auto grid grid-cols-3 gap-1.5 mt-2">
          <button
            onClick={() => setActiveTab(activeTab === 'PENDIENTES' ? 'SCANNER' : 'PENDIENTES')}
            className={`py-1.5 px-2 rounded-xl border text-center transition-all ${
              activeTab === 'PENDIENTES'
                ? 'bg-amber-500 text-white border-amber-600 shadow-xs font-black ring-2 ring-amber-300'
                : 'bg-amber-50/70 border-amber-200 text-amber-900 font-bold hover:bg-amber-100/80'
            }`}
          >
            <div className="text-[10px] uppercase opacity-90 leading-none">Pendientes</div>
            <div className="text-sm font-black mt-0.5 leading-none">{pendientesList.length}</div>
          </button>

          <button
            onClick={() => setActiveTab(activeTab === 'RACKS' ? 'SCANNER' : 'RACKS')}
            className={`py-1.5 px-2 rounded-xl border text-center transition-all ${
              activeTab === 'RACKS'
                ? 'bg-indigo-600 text-white border-indigo-700 shadow-xs font-black ring-2 ring-indigo-300'
                : 'bg-indigo-50/70 border-indigo-200 text-indigo-900 font-bold hover:bg-indigo-100/80'
            }`}
          >
            <div className="text-[10px] uppercase opacity-90 leading-none">En Rack</div>
            <div className="text-sm font-black mt-0.5 leading-none">{reservasInRackList.length}</div>
          </button>

          <button
            onClick={() => setActiveTab(activeTab === 'PICKING' ? 'SCANNER' : 'PICKING')}
            className={`py-1.5 px-2 rounded-xl border text-center transition-all ${
              activeTab === 'PICKING'
                ? 'bg-emerald-600 text-white border-emerald-700 shadow-xs font-black ring-2 ring-emerald-300'
                : 'bg-emerald-50/70 border-emerald-200 text-emerald-900 font-bold hover:bg-emerald-100/80'
            }`}
          >
            <div className="text-[10px] uppercase opacity-90 leading-none">Picking</div>
            <div className="text-sm font-black mt-0.5 leading-none">{pickingList.length}</div>
          </button>
        </div>
      </div>

      {/* 📱 BODY CONTENT */}
      <div className="max-w-2xl mx-auto w-full p-2.5 sm:p-4 space-y-2.5 flex-1 pb-24">
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
                    <div className="grid grid-cols-2 gap-2">
                      <button
                        onClick={() => setIsRackModalOpen(true)}
                        disabled={isProcessing}
                        className="py-2.5 px-3 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-black text-xs flex items-center justify-center gap-1.5 shadow-2xs active:scale-95 transition-all"
                      >
                        <ArrowUpToLine className="w-4 h-4" />
                        <span>RACKEAR</span>
                      </button>

                      <button
                        onClick={() => handleBajarAPicking(selectedLpn, 'Pase directo a Picking')}
                        disabled={isProcessing}
                        className="py-2.5 px-3 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-black text-xs flex items-center justify-center gap-1.5 shadow-2xs active:scale-95 transition-all"
                      >
                        <ArrowDownToLine className="w-4 h-4" />
                        <span>A PICKING</span>
                      </button>
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
                <p className="text-xs font-bold text-slate-500">No hay paletas en esta sección.</p>
              </div>
            ) : (
              <div className="space-y-1.5">
                {filteredList.slice(0, visibleCount).map((item, idx) => {
                  const state = getLpnState(item);
                  const isItemInBatch = batchQueue.some(b => b.lpn === item.lpn);

                  return (
                    <div
                      key={item.lpn || idx}
                      className="bg-white p-2.5 rounded-xl border border-slate-200 hover:border-indigo-200 shadow-2xs transition-all space-y-1.5"
                    >
                      {/* Top row: LPN Code + State Badge + Quick Cola toggle */}
                      <div className="flex items-center justify-between gap-1.5">
                        <div className="flex items-center gap-1.5">
                          <span className="font-mono font-black text-xs sm:text-sm text-slate-900">{item.lpn}</span>
                          <span className={`px-1.5 py-0.2 rounded text-[9px] font-black uppercase ${
                            state === 'RESERVA' ? 'bg-indigo-100 text-indigo-800' : (state === 'PICKING' ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800')
                          }`}>
                            {state === 'RESERVA' ? 'RACK' : state}
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
                            <button
                              onClick={() => {
                                setSelectedLpn(item);
                                setActiveTab('SCANNER');
                                setIsRackModalOpen(true);
                              }}
                              className="px-2 py-1 bg-indigo-600 text-white rounded-lg font-bold text-[10px] shadow-2xs"
                            >
                              Rackear
                            </button>
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

            {/* Manual Code Input */}
            <div className="space-y-1">
              <label className="text-[10px] font-black uppercase text-slate-500 tracking-wider block">
                Escanear / Digitar Ubicación:
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

            {/* Modal Buttons */}
            <div className="flex items-center justify-end gap-1.5 pt-2 border-t border-slate-100">
              <button
                onClick={() => setIsRackModalOpen(false)}
                className="px-3 py-1.5 rounded-xl text-slate-600 font-bold text-xs"
              >
                Cancelar
              </button>
              <button
                onClick={handleConfirmRackAssignment}
                disabled={isProcessing || !selectedRackId}
                className="px-4 py-1.5 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white rounded-xl font-black text-xs shadow-2xs flex items-center gap-1"
              >
                <Check className="w-3.5 h-3.5" />
                <span>Confirmar</span>
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

            {/* Visual Selector Dropdowns */}
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

            {/* Modal Buttons */}
            <div className="flex items-center justify-end gap-1.5 pt-2 border-t border-slate-100">
              <button
                onClick={() => setIsBatchRackModalOpen(false)}
                className="px-3 py-1.5 rounded-xl text-slate-600 font-bold text-xs"
              >
                Cancelar
              </button>
              <button
                onClick={handleConfirmBatchRackAssignment}
                disabled={isProcessing || !selectedRackId}
                className="px-4 py-1.5 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white rounded-xl font-black text-xs shadow-2xs flex items-center gap-1"
              >
                <Check className="w-3.5 h-3.5" />
                <span>Guardar Masivo</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
