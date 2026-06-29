
import React, { useState, useEffect, useRef } from 'react';
import { InventoryItem, Rack, RackLocation, Zone, Product, MixedItem } from '../types';
import { formatDate } from '../utils';
import { Info, Package, Lock, Scan, CheckCircle, User, Clock, XCircle, ArrowRightFromLine, ArrowRight, Layers, PlusCircle, Trash2, Search, RefreshCw, MapPin, ArrowLeft } from './Icons';
import { WarehouseFloorPlan } from './WarehouseFloorPlan';
import { motion, AnimatePresence } from 'motion/react';

interface LayoutProps {
  inventory: InventoryItem[];
  catalog: Product[];
  racks: Rack[];
  zones: Zone[];
  onAssignLocation: (lpn: string, location: RackLocation, reason?: string) => void;
  onDispatch: (lpn: string, reason?: string) => void;
  onReceive: (item: InventoryItem) => void;
  itemsPendingLocation: InventoryItem[];
  lastMixedSequence: number;
  lastSequence: number;
}

const Layout: React.FC<LayoutProps> = ({ 
  inventory, 
  catalog,
  racks, 
  zones,
  onAssignLocation,
  onDispatch,
  onReceive,
  itemsPendingLocation,
  lastMixedSequence,
  lastSequence
}) => {
  const [activeZoneId, setActiveZoneId] = useState<string>('');
  const [searchTerm, setSearchTerm] = useState('');
  
  // Interactive Map and Horizontal View States
  const [selectedRackForHorizontalView, setSelectedRackForHorizontalView] = useState<Rack | null>(null);
  const activeMapMode = 'MAP';
  const [selectedSlotForQuickAssign, setSelectedSlotForQuickAssign] = useState<{ rack: Rack; level: number; position: number } | null>(null);
  
  // Modal States
  const [selectedSlotItem, setSelectedSlotItem] = useState<InventoryItem | null>(null);
  const [isScanMode, setIsScanMode] = useState(false);

  // Visual Tab State
  const [activeTab] = useState<'MAPA_RACKS' | 'CONSTRUCTOR_LPN'>('MAPA_RACKS');
  
  // Mixed LPN Creation State
  const [mixedModalMode, setMixedModalMode] = useState<'CONSOLIDATE' | 'REGENERATE'>('CONSOLIDATE');
  const [mixedLpnSearch, setMixedLpnSearch] = useState('');
  const [mixedLpnResults, setMixedLpnResults] = useState<Product[]>([]);
  const [selectedMixedItems, setSelectedMixedItems] = useState<MixedItem[]>([]);
  
  // New state for adding items to mixed LPN
  const [addingProduct, setAddingProduct] = useState<Product | null>(null);
  const [addingPallets, setAddingPallets] = useState<string>('');
  const [addingBoxes, setAddingBoxes] = useState<string>('');
  const [addingUnits, setAddingUnits] = useState<string>('');
  const [addingDay, setAddingDay] = useState<string>('');
  const [addingMonth, setAddingMonth] = useState<string>('');
  const [addingYear, setAddingYear] = useState<string>('');
  const [customAlert, setCustomAlert] = useState<{title: string, message: string} | null>(null);

  // Scan Mode States
  const [scanLPN, setScanLPN] = useState('');
  const [scanLocation, setScanLocation] = useState('');
  const [scanStep, setScanStep] = useState<'LPN' | 'LOCATION' | 'CONFIRM'>('LPN');
  const [scanMessage, setScanMessage] = useState<{type: 'success' | 'error' | 'info', text: string} | null>(null);
  const lpnInputRef = useRef<HTMLInputElement>(null);
  const locInputRef = useRef<HTMLInputElement>(null);

  // Set initial active zone when zones load
  useEffect(() => {
    if (zones.length > 0) {
      // If no zone is active, or the current active zone doesn't exist in the new list, set the first one
      if (!activeZoneId || !zones.find(z => z.id === activeZoneId)) {
        setActiveZoneId(zones[0].id);
      }
    }
  }, [zones, activeZoneId]);

  // Focus management for Scan Mode
  useEffect(() => {
    if (isScanMode) {
        if (scanStep === 'LPN') lpnInputRef.current?.focus();
        if (scanStep === 'LOCATION') locInputRef.current?.focus();
    }
  }, [isScanMode, scanStep]);

  // const activeZone = zones.find(z => z.id === activeZoneId);

  // Fix: Argument type changed from ZoneType to Zone['type'] (Unused in compact layout)
  /*
  const getZoneCode = (type?: Zone['type']) => {
    switch(type) {
        case 'SECO': return 'SE';
        case 'REFRIGERADO': return 'RF';
        case 'CONGELADO': return 'CG';
        default: return 'GN';
    }
  };
  */

  // Helper to check if a specific slot is occupied or blocked
  const getSlotStatus = (rack: Rack, level: number, position: number) => {
    const rackId = rack.id;
    
    // Check occupancy
    const item = inventory.find(i => 
      i.location?.rackId === rackId && 
      i.location?.level === level && 
      i.location?.position === position
    );

    // Check blocked status from rack config
    const slotConfig = rack.slots.find(s => s.location.level === level && s.location.position === position);
    const isBlocked = slotConfig?.isBlocked || false;

    if (isBlocked) return { status: 'blocked' as const, item: null };
    if (item) return { status: 'occupied' as const, item };
    return { status: 'empty' as const, item: null };
  };

  const handleSlotClick = (rack: Rack, level: number, position: number) => {
    const { status, item } = getSlotStatus(rack, level, position);

    if (status === 'blocked') return;

    if (status === 'occupied' && item) {
       setSelectedSlotItem(item); // Open Detail Modal
    } 
    else if (status === 'empty') {
        // Auto-Trigger Scan Mode for Assignment
        setIsScanMode(true);
        // Pre-fill location: Aisle-R{rackId}-L{level}-P{position} (e.g., A-R1-L1-P1)
        const locationCode = `${rack.aisle}-R${rack.id}-L${level}-P${position}`;
        setScanLocation(locationCode);
        
        // If we have a location, we just need the LPN. 
        setScanStep('LPN'); 
        setScanMessage({ type: 'info', text: `Ubicación ${locationCode} seleccionada. Por favor escanee el LPN.` });
    }
  };

  // --- SCAN MODE LOGIC ---
  const handleScanLPNSubmit = (e: React.FormEvent) => {
      e.preventDefault();
      // Validate LPN exists in Pending
      const cleanLPN = scanLPN.trim();
      
      const pendingItem = itemsPendingLocation.find(i => i.lpn === cleanLPN);
      
      if (pendingItem) {
          setScanMessage(null);
          // If a location is already typed (often from a previous scan or manual prep), finalize
          if (scanLocation) {
             finalizeAssignment(cleanLPN, scanLocation);
          } else {
             setScanStep('LOCATION');
          }
      } else {
          // Check if already assigned
          const exists = inventory.find(i => i.lpn === cleanLPN);
          if (exists) {
              setScanMessage({ type: 'error', text: `El LPN ${cleanLPN} ya está ubicado en ${exists.location?.aisle}-R${exists.location?.rackId}-L${exists.location?.level}-P${exists.location?.position}` });
          } else {
              setScanMessage({ type: 'error', text: `LPN ${cleanLPN} no encontrado en recepción pendiente.` });
          }
          setScanLPN('');
          lpnInputRef.current?.focus();
      }
  };

  const handleScanLocationSubmit = (e: React.FormEvent) => {
      e.preventDefault();
      finalizeAssignment(scanLPN, scanLocation);
  };

  const finalizeAssignment = (lpn: string, locString: string) => {
      const cleanLPN = lpn.trim().toUpperCase();
      const cleanLoc = locString.trim().toUpperCase();
      const regex = /^([A-Z0-9]+)-R(\d+)-L(\d+)-P(\d+)$/;
      const match = cleanLoc.match(regex);

      if (match) {
          const [_, aisle, rackIdStr, levelStr, posStr] = match;
          const rackId = parseInt(rackIdStr);
          const level = parseInt(levelStr);
          const position = parseInt(posStr);

          const rack = racks.find(r => r.aisle === aisle && r.id === rackId);
          
          if (rack) {
              const { status, item: occupant } = getSlotStatus(rack, level, position);
              const itemToAssign = inventory.find(i => i.lpn === cleanLPN);
              
              if (!itemToAssign) {
                  setScanMessage({ type: 'error', text: `LPN ${cleanLPN} no encontrado.` });
                  return;
              }

              if (status === 'empty' || (occupant && occupant.lpn === cleanLPN)) {
                  const isRelocation = !!itemToAssign.location;
                  const reason = isRelocation ? "Reubicación via Mapa" : "Ubicación inicial via Escáner"; 
                  onAssignLocation(cleanLPN, { aisle, rackId: rack.id, level, position }, reason);
                  
                  setScanLPN('');
                  setScanLocation('');
                  setScanStep('LPN');
                  setScanMessage({ type: 'success', text: isRelocation ? "Reubicado" : "Ubicado" });
                  
                  setTimeout(() => {
                      lpnInputRef.current?.focus();
                  }, 100);
              } else {
                  setScanMessage({ type: 'error', text: `Ubicación ${cleanLoc} ocupada por LPN ${occupant?.lpn || 'Desconocido'}` });
                  setScanLocation('');
                  if(scanStep === 'LOCATION') locInputRef.current?.focus();
              }
          } else {
              setScanMessage({ type: 'error', text: `No se encontró rack en Pasillo ${aisle}.` });
              setScanLocation('');
          }
      } else {
          setScanMessage({ type: 'error', text: "Formato inválido. Use: PASILLO-R{rack}-L{nivel}-P{pos} (ej. A-R1-L1-P1)" });
          setScanLocation('');
          if(scanStep === 'LOCATION') locInputRef.current?.focus();
      }
  }

  const visibleRacks = racks.filter(r => r.zoneId === activeZoneId);
  const aisles = Array.from(new Set(visibleRacks.map(r => r.aisle))).sort();

  const handleMixedLpnSearch = (term: string) => {
    setMixedLpnSearch(term);
    if (term.length < 2) {
      setMixedLpnResults([]);
      return;
    }
    const results = catalog.filter(p => 
      p.nombre.toLowerCase().includes(term.toLowerCase()) || 
      p.codigo.toLowerCase().includes(term.toLowerCase())
    );
    setMixedLpnResults(results.slice(0, 5));
  };

  const addMixedItem = (product: Product) => {
    if (mixedModalMode === 'REGENERATE' && selectedMixedItems.length >= 1) {
      alert('En modo regeneración solo se puede seleccionar 1 producto.');
      return;
    }
    setAddingProduct(product);
    setAddingPallets('');
    setAddingBoxes('');
    setAddingUnits('');
    setAddingDay('');
    setAddingMonth('');
    setAddingYear('');
    setMixedLpnSearch('');
    setMixedLpnResults([]);
  };

  const handleConfirmAddMixedItem = () => {
    if (!addingProduct) return;
    
    const p = parseFloat(addingPallets) || 0;
    const b = parseFloat(addingBoxes) || 0;
    const u = parseFloat(addingUnits) || 0;
    const cpp = addingProduct.cajas_por_palet || 0;
    const upc = addingProduct.unidades_por_caja || 1;
    
    const totalQty = (cpp > 0 || upc > 1) ? ((p * cpp * upc) + (b * upc) + u) : u;
    
    if (totalQty <= 0) {
        setCustomAlert({
            title: "Cantidad Inválida",
            message: "La cantidad total debe ser mayor a 0 para agregar el producto."
        });
        return;
    }

    if (!addingDay || !addingMonth || !addingYear) {
        setCustomAlert({
            title: "Falta Información",
            message: "Debe ingresar una fecha de vencimiento completa (Día, Mes, Año) para continuar."
        });
        return;
    }

    const formattedDate = `${addingYear}-${addingMonth.padStart(2, '0')}-${addingDay.padStart(2, '0')}`;

    const newItem: MixedItem = {
      productId: addingProduct.id,
      productCode: addingProduct.codigo,
      productName: addingProduct.nombre,
      quantity: totalQty,
      pallets: p,
      cajas: b,
      unidades: u,
      expirationDate: formattedDate,
      unitType: 'UN', // Defaulting to UN as we already calculated total
      inputQuantity: totalQty
    };

    setSelectedMixedItems([...selectedMixedItems, newItem]);
    setAddingProduct(null);
    setAddingPallets('');
    setAddingBoxes('');
    setAddingUnits('');
    setAddingDay('');
    setAddingMonth('');
    setAddingYear('');
  };

  const removeMixedItem = (index: number) => {
    setSelectedMixedItems(selectedMixedItems.filter((_, i) => i !== index));
  };

  const handleCreateMixedLpn = async () => {
    if (selectedMixedItems.length < 1) {
      setCustomAlert({
          title: "Lista Vacía",
          message: "Debe seleccionar al menos 1 producto para generar el LPN."
      });
      return;
    }

    // Validate all items have quantity and expiration date
    const invalidItem = selectedMixedItems.find(item => !item.quantity || item.quantity <= 0 || !item.expirationDate);
    if (invalidItem) {
      alert('Todos los productos deben tener cantidad y fecha de vencimiento.');
      return;
    }

    const isRegenerate = mixedModalMode === 'REGENERATE';
    const isMixed = !isRegenerate && selectedMixedItems.length > 1;

    // Calculate critical expiration date (earliest)
    const dates = selectedMixedItems.map(i => new Date(i.expirationDate!).getTime());
    const minDate = new Date(Math.min(...dates));
    const criticalExpirationDate = minDate.toISOString().split('T')[0];

    // Generate LPN
    let newLpn = '';
    if (isMixed || (mixedModalMode === 'CONSOLIDATE' && selectedMixedItems.length === 1)) {
        newLpn = `MIX${lastMixedSequence}`;
    } else {
        // Standard sequence for regeneration
        newLpn = `LPN${String(lastSequence).padStart(5, '0')}`;
    }

    const firstItem = selectedMixedItems[0];

    const newLpnItem: InventoryItem = {
      lpn: newLpn,
      productId: isMixed ? undefined : firstItem.productId,
      productCode: isMixed ? 'MIXTO' : (firstItem.productCode || 'N/A'),
      productName: isMixed ? 'PALLET MIXTO CONSOLIDADO' : (firstItem.productName || 'N/A'),
      quantity: selectedMixedItems.reduce((sum, i) => sum + i.quantity, 0),
      pallets: isMixed ? 0 : firstItem.pallets,
      cajas: isMixed ? 0 : firstItem.cajas,
      unidades: isMixed ? 0 : firstItem.unidades,
      expirationDate: criticalExpirationDate,
      receptionDate: new Date().toISOString(),
      receivedBy: 'SISTEMA',
      qrCodeUrl: `https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${newLpn}`,
      photoUrl: '',
      isMixed: isMixed,
      mixedItems: isMixed ? selectedMixedItems : [],
      location: null,
      estado_lpn: 'PENDIENTE',
      generado: true, // Always true since it's created in this modal
      fecha_generado: new Date().toISOString(),
      usuario_generado: 'SISTEMA'
    };

    onReceive(newLpnItem);
    
    alert(`${isMixed ? 'LPN Mixto' : 'LPN'} ${newLpn} creado exitosamente y agregado a items pendientes de ubicación.`);
    
    // Reset
    setSelectedMixedItems([]);
    setMixedLpnSearch('');
    setMixedModalMode('CONSOLIDATE');
  };

  const renderRack = (rack: Rack, isFull: boolean = false) => {
    const levels = Array.from({ length: rack.levels }, (_, i) => rack.levels - i); 
    const positions = Array.from({ length: rack.positionsPerLevel }, (_, i) => i + 1);

    return (
        <div className={`bg-white rounded-2xl shadow-xl border border-slate-200 p-4 transition-all hover:shadow-2xl ${isFull ? 'w-full h-full flex flex-col' : 'w-full sm:w-fit'}`}>
            <div className="flex justify-between items-center mb-3">
                <div className="flex items-center gap-2">
                    <div className="w-2 h-4 bg-blue-600 rounded-full"></div>
                    <div className="font-black text-[10px] text-slate-500 uppercase tracking-widest italic">RACK {rack.id} • PASILLO {rack.aisle}</div>
                </div>
            </div>
            
            <div className={`flex gap-3 ${isFull ? 'flex-1' : ''}`}>
                {/* Level Indicators */}
                <div className="flex flex-col justify-between py-2 text-[8px] font-black text-slate-400 uppercase tracking-tighter italic">
                    {levels.map(l => (
                        <div key={l} className={`${isFull ? 'flex-1' : 'h-8 sm:h-9'} flex items-center justify-center`}>N{l}</div>
                    ))}
                </div>

                <div className={`bg-[#0f172a] p-2 rounded-xl relative shadow-2xl border-2 border-slate-800 ${isFull ? 'flex-1 flex flex-col' : 'w-full sm:w-fit'}`}>
                    {/* Rack Structure */}
                    <div 
                        className={`grid gap-[2px] bg-slate-800 p-[2px] rounded-lg ${isFull ? 'flex-1' : ''} overflow-hidden`} 
                        style={{ gridTemplateColumns: `repeat(${rack.positionsPerLevel}, 1fr)` }}
                    >
                        {levels.map(level => (
                            <React.Fragment key={level}>
                                {positions.map(pos => {
                                    const { status, item } = getSlotStatus(rack, level, pos);
                                    const colorClass = getSlotColor(status, item);
                                    const isDarkBg = colorClass.includes('bg-red-600') || colorClass.includes('bg-blue-600');
                                    const locationTooltip = `${rack.aisle}-R${rack.id}-L${level}-P${pos}`;

                                    return (
                                        <div 
                                            key={`${level}-${pos}`}
                                            onClick={() => handleSlotClick(rack, level, pos)}
                                            className={`
                                                ${isFull ? 'w-full h-full' : 'w-full min-w-[30px] h-8 sm:h-9 sm:w-9'} relative cursor-pointer group transition-all flex items-center justify-center border-[0.5px] rounded-sm
                                                ${colorClass}
                                            `}
                                        >
                                            {/* Custom CSS Tooltip */}
                                            <div className="absolute bottom-[110%] left-1/2 -translate-x-1/2 bg-slate-800 text-white text-[9px] font-bold px-1.5 py-0.5 rounded opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-20 whitespace-nowrap shadow-sm">
                                                {locationTooltip}
                                                <div className="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-slate-800"></div>
                                            </div>

                                            {status === 'occupied' && item && (
                                                <Package className={`${isFull ? 'w-8 h-8' : 'w-5 h-5'} ${isDarkBg ? 'text-white' : 'text-slate-800/60'}`} />
                                            )}
                                            {status === 'blocked' && (
                                                <Lock className={`${isFull ? 'w-6 h-6' : 'w-3 h-3'} text-gray-500 opacity-50`} />
                                            )}
                                            {status === 'empty' && (
                                                <div className={`${isFull ? 'text-xs' : 'text-[6px]'} text-red-300 font-mono select-none`}>{pos}</div>
                                            )}
                                        </div>
                                    );
                                })}
                            </React.Fragment>
                        ))}
                    </div>
                    
                    {/* Floor Labels */}
                    <div 
                        className="grid mt-1 pt-1 border-t border-blue-400/30" 
                        style={{ gridTemplateColumns: `repeat(${rack.positionsPerLevel}, 1fr)` }}
                    >
                        {positions.map(p => (
                            <div key={p} className={`text-center ${isFull ? 'text-[10px]' : 'text-[7px]'} font-bold text-blue-200/60`}>
                                {p}
                            </div>
                        ))}
                    </div>
                </div>
            </div>
        </div>
    );
  };

  // Render Horizontal side profile matrix view
  const renderHorizontalRackDetail = (rack: Rack) => {
    // Sort levels descending so level N6 is at the top, down to N1 at the bottom
    const levels = Array.from({ length: rack.levels }, (_, i) => rack.levels - i);
    const positions = Array.from({ length: rack.positionsPerLevel }, (_, i) => i + 1);
    
    // Count occupancy for this specific rack
    const rackOccupiedSlots = inventory.filter(i => i.location?.aisle === rack.aisle && i.location?.rackId === rack.id).length;
    const rackTotalSlots = rack.levels * rack.positionsPerLevel;
    const rackOccupancy = rackTotalSlots > 0 ? Math.round((rackOccupiedSlots / rackTotalSlots) * 100) : 0;

    return (
      <div className="flex-1 flex flex-col gap-6 animate-fade-in bg-slate-50 dark:bg-slate-900/40 p-4 md:p-8 rounded-[2.5rem] border border-slate-200 dark:border-slate-850">
        
        {/* Action Header & Indicators */}
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center bg-white dark:bg-slate-850 p-6 rounded-3xl shadow-sm border border-slate-100 dark:border-slate-800 gap-4">
          
          <div className="flex items-center gap-4">
            <button
              onClick={() => {
                setSelectedRackForHorizontalView(null);
                setSelectedSlotForQuickAssign(null);
              }}
              className="group flex items-center gap-2 px-4 py-2 bg-slate-50 hover:bg-[#009ED6] hover:text-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-300 rounded-xl font-black text-xs uppercase tracking-wider transition-all duration-300 shadow-sm"
            >
              <ArrowLeft className="w-4 h-4 text-[#009ED6] group-hover:text-white" />
              Volver al Plano 
            </button>
            
            <div className="h-8 w-px bg-slate-200 dark:bg-slate-700"></div>

            <div>
              <div className="flex items-center gap-2.5">
                <span className={`w-3.5 h-3.5 rounded-full ${rack.zoneId === 'zone-1' ? 'bg-amber-500 animate-pulse' : 'bg-blue-500 animate-pulse'}`}></span>
                <h2 className="text-xl font-black text-slate-800 dark:text-white uppercase tracking-tight">Estante {rack.id} • Pasillo {rack.aisle}</h2>
              </div>
              <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider mt-1">
                Vista de Elevación Lateral (Horizontal) • {rack.levels} Niveles x {rack.positionsPerLevel} Posiciones • {rackOccupiedSlots} Pallets
              </p>
            </div>
          </div>

          {/* Stats segment */}
          <div className="flex items-center gap-6">
            <div className="flex flex-col items-end">
              <span className="text-[9px] font-black uppercase text-slate-400 tracking-wider">Ocupación del Estante</span>
              <div className="flex items-center gap-2 mt-1">
                <span className={`text-sm font-black ${rackOccupancy > 80 ? 'text-red-500' : 'text-[#009ED6]'}`}>
                  {rackOccupancy}%
                </span>
                <div className="w-20 h-2 bg-slate-100 dark:bg-slate-700 rounded-full overflow-hidden">
                  <div 
                    className={`h-full ${rackOccupancy > 80 ? 'bg-red-500' : 'bg-[#009ED6]'}`}
                    style={{ width: `${rackOccupancy}%` }}
                  ></div>
                </div>
              </div>
            </div>
          </div>

        </div>

        {/* Main Matrix Board */}
        <div className="bg-slate-950 p-4 md:p-8 rounded-[2rem] border-4 border-slate-800 shadow-2xl relative overflow-x-auto min-w-0">
          
          {/* Horizontal scroll container with custom scrollbars */}
          <div className="min-w-[850px] space-y-4">
            
            {/* Level Rows */}
            {levels.map(level => (
              <div key={level} className="flex gap-4 items-center animate-fade-in">
                {/* Vertical Level label */}
                <div className="w-16 text-right text-xs font-black text-slate-400 tracking-wide font-mono pr-2 font-black italic">
                  Nivel {level}
                </div>

                {/* Slots row */}
                <div className="flex-1 grid gap-4" style={{ gridTemplateColumns: `repeat(${rack.positionsPerLevel}, 1fr)` }}>
                  {positions.map(pos => {
                    const { status, item } = getSlotStatus(rack, level, pos);
                    const colorClass = getSlotColor(status, item);
                    const isOccupied = status === 'occupied' && item;
                    
                    // Compute warnings or details
                    let isNearExp = false;
                    let isCritical = false;
                    if (isOccupied && item.expirationDate) {
                      const today = new Date();
                      today.setHours(0,0,0,0);
                      const exp = new Date(item.expirationDate);
                      const diff = Math.ceil((exp.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
                      if (diff <= 5) isCritical = true;
                      else if (diff <= 30) isNearExp = true;
                    }

                    return (
                      <div
                        key={pos}
                        onClick={() => {
                          if (status === 'empty') {
                            // Open direct assign panel
                            setSelectedSlotForQuickAssign({ rack, level, position: pos });
                          } else {
                            handleSlotClick(rack, level, pos);
                          }
                        }}
                        className={`
                          h-28 rounded-2xl border-2 flex flex-col justify-between p-3.5 cursor-pointer relative group transition-all duration-300 hover:scale-[1.04] hover:shadow-xl select-none
                          ${colorClass}
                          ${selectedSlotForQuickAssign?.level === level && selectedSlotForQuickAssign?.position === pos ? 'ring-4 ring-[#009ED6] scale-105 border-transparent' : ''}
                        `}
                      >
                        {/* Slot position indicator */}
                        <div className="flex justify-between items-start">
                          <span className="text-[9px] font-black font-mono px-1.5 py-0.5 rounded bg-black/10">
                            P-{pos}
                          </span>
                          
                          {/* Status indicators / badges */}
                          {isOccupied && (
                            <div className="flex items-center gap-1">
                              {item.isMixed ? (
                                <span className="text-[8px] font-black bg-blue-500/20 text-blue-300 px-1 rounded uppercase tracking-wider">MIX</span>
                              ) : (
                                <span className="text-[8px] font-black bg-slate-900/10 text-slate-600 px-1 rounded uppercase tracking" style={{fontSize: '7px'}}>UN</span>
                              )}
                            </div>
                          )}
                        </div>

                        {/* Middle details */}
                        {isOccupied ? (
                          <div className="space-y-1">
                            <div className="text-[10px] font-black font-mono leading-none tracking-tight truncate text-slate-900 break-all bg-white/45 px-1 py-0.5 rounded text-center">
                              {item.lpn}
                            </div>
                            <div className="text-[9px] font-extrabold text-slate-800 tracking-tight leading-snug line-clamp-2 truncate" title={item.productName}>
                              {item.productName}
                            </div>
                          </div>
                        ) : status === 'blocked' ? (
                          <div className="flex flex-col items-center justify-center py-2 text-slate-400 opacity-60">
                            <Lock className="w-5 h-5 stroke-1.5" />
                            <span className="text-[8px] font-extrabold uppercase mt-1">BLOQUEADO</span>
                          </div>
                        ) : (
                          <div className="flex flex-col items-center justify-center py-1 text-[#009ED6]/80 hover:text-[#009ED6]">
                            <PlusCircle className="w-6 h-6 stroke-1.5" />
                            <span className="text-[8px] font-black uppercase mt-1 tracking-wider leading-none text-center">UBICAR</span>
                          </div>
                        )}

                        {/* Footer tags */}
                        <div className="flex justify-between items-center text-[8px] font-mono font-black mt-1">
                          {isOccupied ? (
                            <>
                              <span className="text-slate-805 font-black">{item.quantity} UN</span>
                              <span className={`px-1 rounded font-black ${
                                isCritical ? 'bg-red-500 text-white animate-pulse' : isNearExp ? 'bg-amber-400 text-slate-950' : 'text-slate-700'
                              }`}>
                                {item.expirationDate ? item.expirationDate.split('-').slice(1).reverse().join('/') : 'SIN VENC'}
                              </span>
                            </>
                          ) : (
                            <span className="text-red-400/80 w-full text-center tracking-widest uppercase text-[7px] font-extrabold leading-none">DISPONIBLE</span>
                          )}
                        </div>

                      </div>
                    );
                  })}
                </div>
              </div>
            ))}

            {/* Floor Position numbering row at the bottom */}
            <div className="flex gap-4 items-center pt-2 border-t border-slate-800">
              <div className="w-16"></div>
              <div className="flex-1 grid gap-4" style={{ gridTemplateColumns: `repeat(${rack.positionsPerLevel}, 1fr)` }}>
                {positions.map(pos => (
                  <div key={pos} className="text-center text-xs font-black text-slate-400 tracking-widest uppercase font-mono">
                    BAYA {pos}
                  </div>
                ))}
              </div>
            </div>

          </div>

        </div>

        {/* --- DYNAMIC VISUAL QUICK-ASSIGNMENT CONSOLE --- */}
        <AnimatePresence>
          {selectedSlotForQuickAssign && (
            <motion.div
              initial={{ opacity: 0, y: 30 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 30 }}
              className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 mt-6 p-6 rounded-3xl shadow-xl space-y-4"
            >
              <div className="flex justify-between items-center">
                <div>
                  <h3 className="text-base font-black text-slate-800 dark:text-white uppercase tracking-tight">
                    ⚡ Asignación Visual Rápida de Pallet
                  </h3>
                  <p className="text-[10px] text-slate-400 font-extrabold uppercase mt-0.5 tracking-wider">
                    Ubicación seleccionada: <span className="font-mono text-[#009ED6] bg-blue-50 dark:bg-slate-900 px-2 py-0.5 rounded">Pasillo {selectedSlotForQuickAssign.rack.aisle} • Rack {selectedSlotForQuickAssign.rack.id} • Nivel {selectedSlotForQuickAssign.level} • Posición {selectedSlotForQuickAssign.position}</span>
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setSelectedSlotForQuickAssign(null)}
                  className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 dark:bg-slate-900 border border-slate-250 dark:border-slate-800 text-slate-500 rounded-xl font-bold text-xs"
                >
                  Cancelar
                </button>
              </div>

              {itemsPendingLocation.length === 0 ? (
                <div className="bg-slate-50 dark:bg-slate-900 p-6 rounded-2xl border border-dashed border-slate-200 dark:border-slate-800 text-center text-slate-450 text-xs py-8">
                  <Package className="w-10 h-10 opacity-30 mx-auto mb-2" />
                  No hay pallets pendientes de ubicar en la lista de recepción.
                  <button
                    onClick={() => {
                      const parentRack = selectedSlotForQuickAssign.rack;
                      const level = selectedSlotForQuickAssign.level;
                      const pos = selectedSlotForQuickAssign.position;
                      setSelectedSlotForQuickAssign(null);
                      handleSlotClick(parentRack, level, pos);
                    }}
                    className="block mx-auto mt-2 text-xs text-[#009ED6] font-black underline uppercase"
                  >
                    Usar modo escáner libre
                  </button>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 max-h-[250px] overflow-y-auto p-1 custom-scrollbar">
                  {itemsPendingLocation.map(item => (
                    <div
                      key={item.lpn}
                      onClick={() => {
                        onAssignLocation(item.lpn, {
                          aisle: selectedSlotForQuickAssign.rack.aisle,
                          rackId: selectedSlotForQuickAssign.rack.id,
                          level: selectedSlotForQuickAssign.level,
                          position: selectedSlotForQuickAssign.position
                        });
                        alert(`Pallet ${item.lpn} ha sido asignado al slot Pasillo ${selectedSlotForQuickAssign.rack.aisle}-R${selectedSlotForQuickAssign.rack.id}-L${selectedSlotForQuickAssign.level}-P${selectedSlotForQuickAssign.position} exitosamente.`);
                        setSelectedSlotForQuickAssign(null);
                      }}
                      className="border border-slate-200 dark:border-slate-700 hover:border-[#009ED6] p-4 rounded-2xl bg-white hover:bg-sky-50/50 dark:bg-slate-900/60 dark:hover:bg-sky-950/20 cursor-pointer transition-all hover:shadow-md flex flex-col justify-between h-28 select-none"
                    >
                      <div className="flex justify-between items-start">
                        <span className="text-xs font-black font-mono text-slate-900 dark:text-blue-200 bg-slate-100 dark:bg-slate-800 px-2 py-0.5 rounded leading-none">
                          {item.lpn}
                        </span>
                        <span className="text-[9px] font-extrabold uppercase px-1.5 py-0.5 bg-yellow-50 dark:bg-yellow-950/20 text-yellow-750 dark:text-yellow-400 rounded">
                          PENDIENTE
                        </span>
                      </div>
                      <div className="text-xs font-black truncate text-slate-800 dark:text-slate-200 mt-2 line-clamp-1">
                        {item.productName}
                      </div>
                      <div className="flex justify-between text-[10px] font-mono font-bold text-slate-400 mt-1">
                        <span>Cant: <strong className="text-slate-800 dark:text-slate-300">{item.quantity} UN</strong></span>
                        <span>Vence: <strong className="text-slate-800 dark:text-slate-300">{item.expirationDate || 'SIN FECHA'}</strong></span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>

      </div>
    );
  };

  // Calculate Global Occupancy Stats for the entire warehouse floor plan
  const totalGlobalSlots = racks.reduce((acc, r) => acc + (r.levels * r.positionsPerLevel), 0);
  const occupiedGlobalSlots = racks.reduce((acc, r) => {
      let count = 0;
      for (let l = 1; l <= r.levels; l++) {
          for (let p = 1; p <= r.positionsPerLevel; p++) {
              const { status } = getSlotStatus(r, l, p);
              if (status === 'occupied') count++;
          }
      }
      return acc + count;
  }, 0);
  const finalGlobalOccupancyRate = totalGlobalSlots > 0 ? Math.round((occupiedGlobalSlots / totalGlobalSlots) * 100) : 0;

  // Helper for alert colors
  const getSlotColor = (status: string, item: InventoryItem | null) => {
      if (status === 'blocked') return 'bg-gray-300 border-gray-400 cursor-not-allowed';
      
      // Highlight if matches search
      const isMatch = searchTerm && item && (
          item.productName.toLowerCase().includes(searchTerm.toLowerCase()) ||
          item.productCode.toLowerCase().includes(searchTerm.toLowerCase()) ||
          item.lpn.toLowerCase().includes(searchTerm.toLowerCase()) ||
          (item.isMixed && item.mixedItems?.some(mi => 
              mi.productName.toLowerCase().includes(searchTerm.toLowerCase()) ||
              mi.productCode.toLowerCase().includes(searchTerm.toLowerCase())
          ))
      );

      if (status === 'empty') return 'bg-red-50 border-red-200 hover:bg-red-100';
      
      if (status === 'occupied' && item) {
          if (isMatch) return 'bg-yellow-400 border-yellow-600 ring-2 ring-yellow-400 z-10 scale-110';

          // Expiration Check
          let diffDays = 999;
          if (item.expirationDate) {
            const today = new Date();
            today.setHours(0, 0, 0, 0);
            const expDate = new Date(item.expirationDate);
            if (!isNaN(expDate.getTime())) {
                diffDays = Math.ceil((expDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
            }
          }

          // Critical Alert: <= 5 days (includes expired)
          if (diffDays <= 5) {
              if (item.isMixed) return 'bg-blue-600 border-blue-700 animate-pulse ring-4 ring-red-500'; // Mixed but critical
              return 'bg-red-600 border-red-700 animate-pulse'; 
          }
          
          // Warning: <= 30 days
          if (diffDays <= 30) {
              if (item.isMixed) return 'bg-blue-600 border-blue-700'; // Mixed Warning (keep blue but maybe light border?)
              return 'bg-amber-300 border-amber-400'; 
          }

          // Mixed Pallet (Safe)
          if (item.isMixed) return 'bg-blue-600 border-blue-700 hover:bg-blue-500';

          // Standard OK
          return 'bg-emerald-200 border-emerald-300'; 
      }
      return 'bg-slate-100 border-slate-200';
  };

  return (
    <div className="flex flex-col h-full gap-5 relative">
      
      {/* Top Site Connection Status Indicator styled minimally */}
      {activeTab !== 'MAPA_RACKS' && (
        <div className="flex justify-end pr-4 shrink-0 -mb-2 mt-1">
            <div className="flex items-center gap-2 font-black text-[10px] text-slate-400 dark:text-slate-500 uppercase tracking-widest italic select-none">
                <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
                Sedes Conectadas • LIMA GLOBAL
            </div>
        </div>
      )}

      {/* VIEW: MAPA DE RACKS */}
      {activeTab === 'MAPA_RACKS' && (
          <div className="flex-1 flex flex-col gap-4 min-h-0 animate-fade-in animate-duration-300">
              
              {/* Racks Visualization Panel */}
              <div className="flex-1 flex flex-col min-h-0 min-w-0">
                {selectedRackForHorizontalView ? (
                  // Render Horizontal Elevations Side profile
                  (() => {
                    const liveRack = racks.find(r => r.id === selectedRackForHorizontalView.id || (r.aisle === selectedRackForHorizontalView.aisle && r.dbId === selectedRackForHorizontalView.dbId)) || selectedRackForHorizontalView;
                    return renderHorizontalRackDetail(liveRack);
                  })()
                ) : activeMapMode === 'MAP' ? (
                  // Render Interactive 2D SVG Layout Map with floating HUD Legend
                  <div className="flex-1 flex flex-col relative bg-white dark:bg-slate-950 min-h-0 min-w-0">
                    <div className="flex-1 overflow-auto custom-scrollbar">
                      <WarehouseFloorPlan 
                        racks={racks}
                        inventory={inventory}
                        searchTerm={searchTerm}
                        onSearchChange={setSearchTerm}
                        globalOccupancyRate={finalGlobalOccupancyRate}
                        onRackClick={(rack) => {
                          setSelectedRackForHorizontalView(rack);
                          setSelectedSlotForQuickAssign(null);
                        }}
                      />
                    </div>

                    {/* Integrated Floating HUD color legend */}
                    <div className="absolute bottom-6 left-6 bg-slate-950/85 backdrop-blur-md border border-slate-800/80 rounded-2xl p-2.5 px-4 flex items-center gap-4 shadow-2xl select-none z-30 flex-wrap max-w-[90%] md:max-w-fit">
                      <span className="text-[9px] font-black text-slate-450 tracking-wider uppercase pr-2 border-r border-slate-800">Leyenda:</span>
                      <div className="flex items-center gap-1.5 text-[10px] text-slate-350 font-black tracking-tight">
                        <div className="w-2.5 h-2.5 bg-emerald-400 rounded-sm shadow-sm"></div>
                        <span>Apto (OK)</span>
                      </div>
                      <div className="flex items-center gap-1.5 text-[10px] text-slate-355 font-black tracking-tight">
                        <div className="w-2.5 h-2.5 bg-blue-600 rounded-sm shadow-sm"></div>
                        <span>Mixto (MIX)</span>
                      </div>
                      <div className="flex items-center gap-1.5 text-[10px] text-slate-355 font-black tracking-tight">
                        <div className="w-2.5 h-2.5 bg-amber-400 rounded-sm shadow-sm"></div>
                        <span>Vence &lt;30d</span>
                      </div>
                      <div className="flex items-center gap-1.5 text-[10px] text-slate-355 font-black tracking-tight">
                        <div className="w-2.5 h-2.5 bg-red-600 rounded-sm shadow-sm animate-pulse"></div>
                        <span>Crítico ≤5d</span>
                      </div>
                      <div className="flex items-center gap-1.5 text-[10px] text-slate-355 font-black tracking-tight">
                        <div className="w-2.5 h-2.5 bg-slate-800 border border-slate-700 rounded-sm"></div>
                        <span>Vacío</span>
                      </div>
                      {searchTerm && (
                        <div className="flex items-center gap-1.5 text-[10px] text-yellow-500 font-extrabold animate-bounce bg-yellow-400/10 px-2.5 py-0.5 rounded-lg border border-yellow-400/20">
                          <div className="w-2 h-2 bg-yellow-400 rounded-full"></div>
                          <span>Coincidencia</span>
                        </div>
                      )}
                    </div>
                  </div>
                ) : (
                  // Classic Grouped List View
                  <div className="flex-1 overflow-auto bg-slate-50 dark:bg-slate-900/50 rounded-[2.5rem] border border-slate-200 dark:border-slate-800 p-4 md:p-8 shadow-inner custom-scrollbar">
                    {visibleRacks.length === 0 ? (
                        <div className="flex flex-col items-center justify-center h-full text-slate-300 dark:text-slate-700">
                            <div className="w-24 h-24 bg-slate-100 dark:bg-slate-800 rounded-full flex items-center justify-center mb-6">
                                <Package className="w-12 h-12 opacity-50"/>
                            </div>
                            <p className="text-xl font-black uppercase tracking-widest italic">No hay racks configurados</p>
                            <p className="text-xs font-bold text-slate-400 dark:text-slate-500 mt-2">Asigne racks a esta cámara en el menú configuración</p>
                        </div>
                    ) : (
                        aisles.map(aisle => (
                            <div key={aisle} className="flex flex-col gap-6 mb-16 w-full">
                                <div className="flex items-center gap-4 sticky left-0 z-10 w-full mb-2">
                                    <div className="bg-[#009ED6] text-white px-6 py-2.5 rounded-2xl shadow-lg transform -rotate-1 font-black text-sm uppercase tracking-widest italic">
                                        Pasillo {aisle}
                                    </div>
                                    <div className="flex-1 h-px bg-slate-200 dark:bg-slate-800"></div>
                                </div>
                                
                                <div className="grid grid-cols-1 sm:grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-8 md:gap-12 pb-4">
                                    {visibleRacks.filter(r => r.aisle === aisle).map(rack => (
                                        <div key={rack.id} className="flex justify-center md:justify-start">
                                            {renderRack(rack)}
                                        </div>
                                    ))}
                                </div>
                            </div>
                        ))
                    )}
                  </div>
                )}
              </div>
          </div>
      )}

      {/* VIEW: CONSTRUCTOR DE LPNS */}
      {activeTab === 'CONSTRUCTOR_LPN' && (
          <div className="flex-1 flex flex-col gap-6 animate-fade-in animate-duration-300">
              
              {/* Option Mode Bar */}
              <div className="bg-white dark:bg-slate-800 p-6 rounded-3xl border border-slate-100 dark:border-slate-700 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
                  <div className="space-y-1">
                      <div className="flex items-center gap-2">
                          <Layers className="w-5 h-5 text-[#82BD02]" />
                          <h2 className="text-xl font-black text-slate-800 dark:text-white uppercase tracking-tight">Estación de Construcción de LPNs</h2>
                      </div>
                      <p className="text-xs font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest">
                          Soporte para consolidación multi-SKU y reconstrucción/regeneración unitaria de LPNs
                      </p>
                  </div>
                  
                  {/* Mode Selector */}
                  <div className="flex bg-slate-100 dark:bg-slate-900 p-1.5 rounded-2xl border border-slate-200/40 dark:border-slate-800 shadow-inner block shrink-0">
                      <button 
                        type="button"
                        onClick={() => { setMixedModalMode('CONSOLIDATE'); setSelectedMixedItems([]); setAddingProduct(null); }}
                        className={`flex items-center gap-2 px-5 py-2.5 rounded-xl text-[10px] font-black uppercase transition-all whitespace-nowrap ${mixedModalMode === 'CONSOLIDATE' ? 'bg-white dark:bg-slate-800 text-[#009ED6] shadow' : 'text-slate-400 hover:text-slate-600'}`}
                      >
                        <Layers className="w-3.5 h-3.5" />
                        Consolidador Mixto (MIX)
                      </button>
                      <button 
                        type="button"
                        onClick={() => { setMixedModalMode('REGENERATE'); setSelectedMixedItems([]); setAddingProduct(null); }}
                        className={`flex items-center gap-2 px-5 py-2.5 rounded-xl text-[10px] font-black uppercase transition-all whitespace-nowrap ${mixedModalMode === 'REGENERATE' ? 'bg-white dark:bg-slate-800 text-[#82BD02] shadow' : 'text-slate-400 hover:text-slate-600'}`}
                      >
                        <RefreshCw className="w-3.5 h-3.5" />
                        Regenerador Unitario (LPN)
                      </button>
                  </div>
              </div>

              {/* Working Interactive Panels */}
              <div className="flex-1 grid grid-cols-1 lg:grid-cols-12 gap-6 min-h-0">
                  
                  {/* LEFT COLUMN: PRODUCT SEARCH & SPECIFICATION (5 cols) */}
                  <div className="col-span-1 lg:col-span-5 flex flex-col gap-4 min-h-[400px]">
                      
                      <div className="bg-white dark:bg-slate-800 p-6 rounded-3xl border border-slate-100 dark:border-slate-700 shadow-sm flex flex-col flex-1">
                          <h3 className="text-xs font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest mb-4 flex items-center gap-2">
                              <Search className="w-4 h-4 text-[#82BD02]" />
                              1. Búsqueda y Selección de Productos
                          </h3>
                          
                          {/* Search Input */}
                          <div className="relative mb-4">
                              <input 
                                  type="text" 
                                  className="w-full bg-slate-50 dark:bg-slate-900 border-2 border-transparent focus:border-[#82BD02] rounded-2xl p-4 pl-12 text-xs font-extrabold focus:ring-4 focus:ring-lime-100 dark:focus:ring-lime-950/20 transition-all outline-none dark:text-white" 
                                  placeholder="Escriba código SKU o nombre comercial..."
                                  value={mixedLpnSearch}
                                  onChange={e => handleMixedLpnSearch(e.target.value)}
                              />
                              <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 w-5 h-5" />
                          </div>

                          {/* Search dropdown in container */}
                          {mixedLpnResults.length > 0 ? (
                              <div className="bg-slate-50 dark:bg-slate-900 rounded-2xl border border-slate-100 dark:border-slate-800 divide-y divide-slate-100 dark:divide-slate-800 overflow-hidden mb-6 shadow-md">
                                  {mixedLpnResults.map(product => (
                                      <button 
                                          key={product.id}
                                          onClick={() => addMixedItem(product)}
                                          className="w-full text-left p-4 hover:bg-lime-50 dark:hover:bg-lime-950/10 border-b border-transparent transition-colors flex justify-between items-center group"
                                      >
                                          <div className="min-w-0 flex-1">
                                              <div className="font-mono font-black text-[#82BD02] text-[10px] tracking-wider mb-0.5">{product.codigo}</div>
                                              <div className="text-[12px] text-slate-800 dark:text-slate-200 font-extrabold truncate">{product.nombre}</div>
                                          </div>
                                          <PlusCircle className="w-5 h-5 text-slate-300 dark:text-slate-650 group-hover:text-[#82BD02] shrink-0 ml-3 transition-transform group-hover:scale-110" />
                                      </button>
                                  ))}
                              </div>
                          ) : mixedLpnSearch.length >= 2 ? (
                              <p className="text-center text-[11px] font-bold text-red-400 mb-6 uppercase">No se encontraron productos coincidentes</p>
                          ) : null}

                          {/* Quantities entry form */}
                          {addingProduct ? (
                              <div className="bg-lime-50/40 dark:bg-lime-950/10 p-5 rounded-2xl border-2 border-[#82BD02]/20 dark:border-[#82BD02]/30 shadow-sm space-y-4 animate-scale-in">
                                  <div className="flex justify-between items-start">
                                      <div className="min-w-0 flex-1">
                                          <span className="text-[9px] font-mono font-black text-[#82BD02] uppercase tracking-widest">PRODUCTO ACTIVO DE CARGA</span>
                                          <h4 className="font-black text-slate-900 dark:text-white text-sm tracking-tight leading-snug line-clamp-2 mt-0.5" title={addingProduct.nombre}>
                                              {addingProduct.nombre}
                                          </h4>
                                      </div>
                                      <button 
                                          type="button"
                                          onClick={() => setAddingProduct(null)} 
                                          className="text-slate-400 hover:text-red-500 hover:bg-white dark:hover:bg-slate-800 p-1 rounded-lg transition-colors ml-2"
                                      >
                                          <XCircle className="w-5 h-5" />
                                      </button>
                                  </div>

                                  <div className="grid grid-cols-3 gap-2">
                                      {/* Pallets input */}
                                      <div className="bg-white dark:bg-slate-900 p-3 rounded-xl border border-slate-100 dark:border-slate-800">
                                          <label className="text-[8px] font-black text-slate-400 dark:text-slate-500 mb-1 block uppercase tracking-wider">Pallets</label>
                                          <input 
                                              type="number"
                                              className="w-full bg-transparent text-sm font-black text-slate-900 dark:text-white outline-none"
                                              placeholder="0"
                                              min={0}
                                              value={addingPallets}
                                              onChange={e => setAddingPallets(e.target.value)}
                                          />
                                          {addingProduct.unidades_por_caja && (
                                              <span className="text-[7.5px] text-slate-400 font-mono tracking-tighter">C: {addingProduct.unidades_por_caja} UN</span>
                                          )}
                                      </div>

                                      {/* Cajas input */}
                                      <div className="bg-white dark:bg-slate-900 p-3 rounded-xl border border-slate-100 dark:border-slate-800">
                                          <label className="text-[8px] font-black text-slate-400 dark:text-slate-500 mb-1 block uppercase tracking-wider">Cajas</label>
                                          <input 
                                              type="number"
                                              className="w-full bg-transparent text-sm font-black text-slate-900 dark:text-white outline-none"
                                              placeholder="0"
                                              min={0}
                                              value={addingBoxes}
                                              onChange={e => setAddingBoxes(e.target.value)}
                                          />
                                          <span className="text-[7.5px] text-slate-400 font-mono tracking-tighter">BOM de Caja</span>
                                      </div>

                                      {/* Units input */}
                                      <div className="bg-white dark:bg-slate-900 p-3 rounded-xl border border-slate-100 dark:border-slate-800">
                                          <label className="text-[8px] font-black text-[#82BD02] mb-1 block uppercase tracking-wider">Unidades</label>
                                          <input 
                                              type="number"
                                              className="w-full bg-transparent text-sm font-black text-slate-900 dark:text-white outline-none"
                                              placeholder="0"
                                              min={0}
                                              value={addingUnits}
                                              onChange={e => setAddingUnits(e.target.value)}
                                              autoFocus
                                          />
                                          <span className="text-[7.5px] text-slate-400 font-mono tracking-tighter">Sueltas</span>
                                      </div>
                                  </div>

                                  {/* Expiration date block */}
                                  <div className="bg-white dark:bg-slate-900 p-4 rounded-xl border border-slate-100 dark:border-slate-800 space-y-1.5">
                                      <label className="text-[8px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest block">Fecha de Vencimiento Crítica del Lote</label>
                                      
                                      <div className="flex gap-2">
                                          <div className="flex-1">
                                              <select 
                                                  className="w-full bg-slate-50 dark:bg-slate-800 rounded-lg p-2 font-bold text-[10px] dark:text-white outline-none border border-transparent focus:border-[#82BD02]"
                                                  value={addingDay} 
                                                  onChange={e => setAddingDay(e.target.value)}
                                              >
                                                  <option value="">Día</option>
                                                  {[...Array(31)].map((_, i) => {
                                                      const dayVal = String(i+1).padStart(2, '0');
                                                      return <option key={dayVal} value={dayVal}>{dayVal}</option>
                                                  })}
                                              </select>
                                          </div>
                                          <div className="flex-[2_2_0%]">
                                              <select 
                                                  className="w-full bg-slate-50 dark:bg-slate-800 rounded-lg p-2 font-bold text-[10px] dark:text-white outline-none border border-transparent focus:border-[#82BD02]"
                                                  value={addingMonth} 
                                                  onChange={e => setAddingMonth(e.target.value)}
                                              >
                                                  <option value="">Mes</option>
                                                  {['01 - ENE', '02 - FEB', '03 - MAR', '04 - ABR', '05 - MAY', '06 - JUN', '07 - JUL', '08 - AGO', '09 - SEP', '10 - OCT', '11 - NOV', '12 - DIC'].map((m, i) => (
                                                      <option key={i+1} value={String(i+1).padStart(2, '0')}>{m}</option>
                                                  ))}
                                              </select>
                                          </div>
                                          <div className="flex-[1.5_1.5_0%]">
                                              <select 
                                                  className="w-full bg-slate-50 dark:bg-slate-800 rounded-lg p-2 font-bold text-[10px] dark:text-white outline-none border border-transparent focus:border-[#82BD02]"
                                                  value={addingYear} 
                                                  onChange={e => setAddingYear(e.target.value)}
                                              >
                                                  <option value="">Año</option>
                                                  {[2024, 2025, 2026, 2027, 2028, 2029, 2030, 2031, 2032, 2033].map(y => (
                                                      <option key={y} value={y}>{y}</option>
                                                  ))}
                                              </select>
                                          </div>
                                      </div>
                                  </div>

                                  {/* Packing conversion helper tag */}
                                  <div className="bg-white/60 dark:bg-slate-900/40 p-2.5 rounded-lg text-[9px] font-mono text-slate-500 flex items-center justify-between border border-dashed border-slate-200 dark:border-slate-800 leading-snug">
                                      <span>CONVERSIÓN DE CARGA:</span>
                                      <span className="font-extrabold text-[#82BD02]">
                                          {(() => {
                                              const p = parseFloat(addingPallets) || 0;
                                              const b = parseFloat(addingBoxes) || 0;
                                              const u = parseFloat(addingUnits) || 0;
                                              const cpp = addingProduct.cajas_por_palet || 0;
                                              const upc = addingProduct.unidades_por_caja || 1;
                                              const calculatedTotal = (cpp > 0 || upc > 1) ? ((p * cpp * upc) + (b * upc) + u) : u;
                                              return `${calculatedTotal} UNIDADES TOTALES`;
                                          })()}
                                      </span>
                                  </div>

                                  <button 
                                      type="button"
                                      onClick={handleConfirmAddMixedItem}
                                      className="w-full bg-[#82BD02] text-white py-3.5 rounded-xl font-black text-[10px] uppercase tracking-widest shadow-md hover:bg-lime-600 active:scale-95 transition-all flex items-center justify-center gap-2"
                                  >
                                      <PlusCircle className="w-4 h-4" /> 
                                      Confirmar e Inserter en Pallet
                                  </button>
                              </div>
                          ) : (
                              <div className="flex-1 flex flex-col justify-center items-center py-12 text-slate-350 dark:text-slate-600 border-2 border-dashed border-slate-100 dark:border-slate-800 rounded-2xl min-h-[180px]">
                                  <Package className="w-12 h-12 mb-3 stroke-[1.25] text-slate-300 dark:text-slate-700 animate-bounce" />
                                  <p className="text-[10px] font-black uppercase text-center tracking-widest max-w-[160px] leading-relaxed">Seleccione un producto del buscador para asignar cantidades</p>
                              </div>
                          )}
                      </div>
                  </div>

                  {/* RIGHT COLUMN: RECEPTACLE PREVIEW & LPN PALLET ASSEMBLY (7 cols) */}
                  <div className="col-span-1 lg:col-span-7 flex flex-col gap-4 min-h-[400px]">
                      
                      {/* Realistic sticker representation of Pallet ticket */}
                      <div className="bg-white dark:bg-slate-800 p-6 rounded-3xl border border-slate-100 dark:border-slate-700 shadow-sm flex flex-col flex-1 gap-6 relative">
                          <h3 className="text-xs font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest flex items-center gap-2 shrink-0">
                              <Layers className="w-4 h-4 text-[#009ED6]" />
                              2. Pallet de Trabajo & Etiquetado LPN Resultado
                          </h3>

                          {/* Interactive placard preview */}
                          <div className="border-[3px] border-slate-900 rounded-[2rem] p-6 bg-amber-50/10 hover:bg-amber-50/25 dark:bg-slate-900/40 border-dashed relative overflow-hidden transition-all shrink-0">
                               <div className="absolute top-0 right-0 p-4 shrink-0 flex items-center gap-1.5 opacity-50 select-none">
                                   <div className="w-1.5 h-1.5 rounded-full bg-slate-900"></div>
                                   <div className="font-mono text-[8px] font-bold text-slate-900 dark:text-slate-400">SMARTRACK TML-01</div>
                               </div>

                               <div className="flex flex-col md:flex-row justify-between gap-6">
                                   {/* Barecode placeholder */}
                                   <div className="w-full md:w-36 shrink-0 flex flex-col items-center justify-center p-3 bg-white dark:bg-slate-800 rounded-3xl border border-slate-200 dark:border-slate-700 shadow-sm">
                                       <div className="text-[34px] font-serif leading-none tracking-tight text-slate-800 dark:text-white mb-2 font-black select-none opacity-40 uppercase">|||||</div>
                                       <div className="font-mono text-[9px] font-black text-slate-900 dark:text-white leading-none uppercase">
                                           {mixedModalMode === 'CONSOLIDATE' ? `MIX${lastMixedSequence}` : `LPN${String(lastSequence).padStart(5, '0')}`}
                                       </div>
                                       <div className="text-[7px] text-slate-400 uppercase font-bold tracking-widest mt-1">ID SECUENCIAL GENERADO</div>
                                   </div>

                                   {/* Metadata */}
                                   <div className="flex-1 flex flex-col justify-between">
                                        <div className="space-y-1">
                                            <div className="flex items-center gap-2">
                                                <span className={`px-2.5 py-0.5 rounded-full text-[8px] font-black text-white uppercase tracking-widest shadow-sm ${mixedModalMode === 'CONSOLIDATE' ? 'bg-[#009ED6]' : 'bg-[#82BD02]'}`}>
                                                    {mixedModalMode === 'CONSOLIDATE' ? 'Pallet Mixto (MIX)' : 'Pallet Unitario'}
                                                </span>
                                                <span className="text-[8px] font-mono text-slate-400 dark:text-slate-500 font-extrabold uppercase">SMARTRACK DIGITAL LABEL SYSTEM</span>
                                            </div>
                                            <h4 className="text-2xl font-black font-mono tracking-tighter text-slate-950 dark:text-white uppercase leading-none">
                                                {mixedModalMode === 'CONSOLIDATE' ? `MIX${lastMixedSequence}` : `LPN${String(lastSequence).padStart(5, '0')}`}
                                            </h4>
                                        </div>

                                        <div className="grid grid-cols-2 gap-3 pt-3 border-t border-slate-100 dark:border-slate-800/80 mt-2">
                                            <div className="space-y-0.5">
                                                <span className="text-[7.5px] font-black text-slate-400 uppercase tracking-widest">VENCIMIENTO MÁS CRÍTICO</span>
                                                <p className="text-xs font-black text-red-600 dark:text-red-400 tracking-tighter uppercase italic">
                                                    {selectedMixedItems.length > 0 
                                                        ? (() => {
                                                            const dates = selectedMixedItems.map(i => new Date(i.expirationDate!).getTime());
                                                            const minDate = new Date(Math.min(...dates));
                                                            return minDate.toISOString().split('T')[0];
                                                          })()
                                                        : 'Esperando items...'
                                                    }
                                                </p>
                                            </div>
                                            <div className="space-y-0.5">
                                                <span className="text-[7.5px] font-black text-slate-400 uppercase tracking-widest">UNIDADES TOTALES EMPACADAS</span>
                                                <p className="text-xs font-black text-slate-900 dark:text-white tracking-widest">
                                                    {selectedMixedItems.reduce((sum, item) => sum + item.quantity, 0)} UN
                                                </p>
                                            </div>
                                        </div>
                                   </div>
                               </div>
                          </div>

                          {/* List of items inside active build assembly */}
                          <div className="flex-1 flex flex-col min-h-0">
                              <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-3 flex justify-between shrink-0">
                                  <span>ÍTEMS AGREGADOS ({selectedMixedItems.length})</span>
                                  <span>PESO ESTIMADO: ~ {selectedMixedItems.reduce((sum, item) => sum + (item.quantity * 0.8), 0).toFixed(1)} KG</span>
                              </h4>
                              
                              <div className="flex-1 overflow-y-auto pr-1 space-y-2.5 custom-scrollbar min-h-0">
                                  {selectedMixedItems.length === 0 ? (
                                      <div className="h-full flex flex-col items-center justify-center bg-slate-50 dark:bg-slate-900 rounded-3xl text-slate-300 dark:text-slate-700 py-12 border-2 border-dashed border-slate-150 dark:border-slate-800">
                                          <Layers className="w-10 h-10 mb-2 opacity-20" />
                                          <p className="text-[9px] font-black uppercase tracking-widest">Pallet Vacío</p>
                                          <p className="text-[8px] text-slate-400 dark:text-slate-500 max-w-[150px] text-center mt-1">Busque productos y asígnelos en el panel izquierdo para cargarlos aquí</p>
                                      </div>
                                  ) : (
                                      selectedMixedItems.map((item, index) => (
                                          <div key={`${item.productCode}-${index}`} className="flex items-center gap-3 p-4 bg-slate-50 dark:bg-slate-900 border border-slate-100 dark:border-slate-800 rounded-2xl shadow-sm animate-fade-in group">
                                              <div className="flex-1 min-w-0">
                                                  <div className="flex justify-between items-start mb-0.5">
                                                      <span className="text-[10px] font-mono font-black text-[#009ED6] leading-none">{item.productCode}</span>
                                                      <span className="text-[10px] font-black text-slate-900 dark:text-white bg-white dark:bg-slate-800 px-2 py-0.5 rounded-full border border-slate-100 dark:border-slate-700">{item.quantity} UN</span>
                                                  </div>
                                                  <h5 className="text-[11px] font-black text-slate-800 dark:text-slate-200 truncate leading-tight">{item.productName}</h5>
                                                  <div className="text-[8.5px] font-bold text-red-500 dark:text-red-400 uppercase tracking-wider mt-0.5">Lote Vence: {item.expirationDate}</div>
                                              </div>
                                              <button 
                                                  onClick={() => removeMixedItem(index)} 
                                                  className="p-2 sm:p-2.5 text-slate-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-950/20 rounded-xl transition-all border border-transparent hover:border-red-100 dark:hover:border-red-900/30"
                                                  title="Quitar ítem de este pallet"
                                              >
                                                  <Trash2 className="w-4 h-4" />
                                              </button>
                                          </div>
                                      ))
                                  )}
                              </div>
                          </div>

                          {/* Workspace actions bar */}
                          <div className="pt-4 border-t border-slate-100 dark:border-slate-700 flex flex-col sm:flex-row gap-3 shrink-0">
                              <button
                                  type="button"
                                  onClick={() => {
                                      if (confirm('¿Está seguro de vaciar la lista actual? Se borrarán todos los ítems agregados.')) {
                                          setSelectedMixedItems([]);
                                          setAddingProduct(null);
                                      }
                                  }}
                                  disabled={selectedMixedItems.length === 0}
                                  className={`px-4 py-3.5 rounded-xl font-black text-[10px] uppercase tracking-widest transition-all ${selectedMixedItems.length === 0 ? 'bg-slate-100 dark:bg-slate-900 text-slate-350 dark:text-slate-650 cursor-not-allowed' : 'bg-red-50 hover:bg-red-100 text-red-500 hover:scale-[1.01]'}`}
                              >
                                  Vaciar Pallet
                              </button>

                              <button 
                                  onClick={handleCreateMixedLpn}
                                  disabled={selectedMixedItems.length < 1}
                                  className={`flex-1 py-3.5 rounded-xl font-black text-[10px] uppercase tracking-widest shadow-lg transition-all flex items-center justify-center gap-2 ${
                                      selectedMixedItems.length < 1
                                      ? 'bg-slate-100 dark:bg-slate-900 text-slate-300 dark:text-slate-700 cursor-not-allowed shadow-none'
                                      : 'bg-slate-950 hover:bg-black text-white hover:scale-[1.01] active:scale-95 shadow-slate-100 dark:shadow-none'
                                  }`}
                              >
                                  {mixedModalMode === 'CONSOLIDATE' ? 'GENERAR E IMPRIMIR LPN MIXTO' : 'GENERAR E IMPRIMIR LPN REGENERADO'}
                                  <ArrowRight className="w-4 h-4 text-emerald-400 shrink-0" />
                              </button>
                          </div>

                      </div>
                  </div>

              </div>

          </div>
      )}

      {/* --- MODAL: ITEM DETAIL --- */}
      {selectedSlotItem && (
          <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-md flex justify-center items-center p-4">
              <div className="bg-white rounded-[2.5rem] shadow-2xl max-w-md w-full overflow-hidden animate-fade-in border border-white/20">
                  <div className={`p-8 relative text-white ${selectedSlotItem.isMixed ? 'bg-gradient-to-br from-blue-600 to-indigo-800' : 'bg-gradient-to-br from-slate-800 to-slate-950'}`}>
                      <button 
                        onClick={() => setSelectedSlotItem(null)}
                        className="absolute top-6 right-6 p-2 bg-white/10 hover:bg-white/20 rounded-full text-white transition-all border border-white/10"
                      >
                          <XCircle className="w-6 h-6" />
                      </button>
                      <div className="flex items-center gap-3 mb-4">
                          <div className="bg-white/20 p-2 rounded-xl">
                              <Info className="w-5 h-5 text-white" />
                          </div>
                          <h3 className="text-sm font-black text-white/60 uppercase tracking-widest">Detalle de Carga</h3>
                      </div>
                      <h2 className="text-2xl font-black leading-tight mb-2 tracking-tighter uppercase">{selectedSlotItem.productName}</h2>
                      {selectedSlotItem.isMixed && (
                          <div className="inline-flex items-center gap-2 bg-blue-400/30 px-3 py-1 rounded-full text-[10px] font-black border border-blue-400/50 uppercase tracking-widest">
                              <Layers className="w-3 h-3" /> Pallet Mixto
                          </div>
                      )}
                  </div>
                  
                  <div className="p-8 space-y-8">
                      <div className="grid grid-cols-2 gap-4">
                          <div className="p-4 bg-slate-50 rounded-2xl border border-slate-100">
                               <p className="text-[10px] text-slate-400 font-black uppercase tracking-widest mb-1">LPN IDENTIFICADOR</p>
                               <p className="text-xl font-mono font-black text-slate-900">{selectedSlotItem.lpn}</p>
                          </div>
                          <div className="p-4 bg-blue-50 rounded-2xl border border-blue-100 text-right">
                               <p className="text-[10px] text-blue-400 font-black uppercase tracking-widest mb-1">CANTIDAD TOTAL</p>
                               <p className="text-2xl font-black text-blue-600 leading-none">{selectedSlotItem.quantity} <span className="text-xs font-bold text-blue-400">UN</span></p>
                          </div>
                      </div>

                      <div className="space-y-4">
                          <div className="flex items-center justify-between pb-3 border-b border-slate-50">
                              <div className="flex items-center gap-3 text-slate-500">
                                  <User className="w-5 h-5 opacity-40" />
                                  <span className="text-[10px] font-black uppercase tracking-widest">Recibido por</span>
                              </div>
                              <span className="text-sm font-bold text-slate-700">{selectedSlotItem.receivedBy || 'SISTEMA'}</span>
                          </div>
                          <div className="flex items-center justify-between pb-3 border-b border-slate-50">
                              <div className="flex items-center gap-3 text-slate-500">
                                  <Clock className="w-5 h-5 opacity-40" />
                                  <span className="text-[10px] font-black uppercase tracking-widest">Fecha Recepción</span>
                              </div>
                              <span className="text-sm font-bold text-slate-700">{new Date(selectedSlotItem.receptionDate).toLocaleDateString()}</span>
                          </div>
                          <div className="flex items-center justify-between pb-3 border-b border-slate-50">
                              <div className="flex items-center gap-3 text-red-500">
                                  <XCircle className="w-5 h-5 opacity-40" />
                                  <span className="text-[10px] font-black uppercase tracking-widest">Vencimiento</span>
                              </div>
                              <span className="text-sm font-black text-red-600 uppercase italic">
                                  {selectedSlotItem.expirationDate ? formatDate(selectedSlotItem.expirationDate) : 'SIN FECHA'}
                              </span>
                          </div>
                      </div>

                      {selectedSlotItem.usuario_ultima_ubicacion && (
                          <div className="p-4 bg-indigo-50 rounded-[1.5rem] border border-indigo-100 flex items-start gap-4">
                              <div className="bg-indigo-600 p-2 rounded-xl shrink-0 shadow-lg shadow-indigo-100">
                                  <MapPin className="w-4 h-4 text-white" />
                              </div>
                              <div className="space-y-1">
                                  <p className="text-[10px] font-black text-indigo-400 uppercase tracking-widest">Última Ubicación</p>
                                  <p className="text-xs font-bold text-indigo-900 leading-tight">
                                      {selectedSlotItem.usuario_ultima_ubicacion} • {selectedSlotItem.fecha_ultima_ubicacion ? new Date(selectedSlotItem.fecha_ultima_ubicacion).toLocaleDateString() : 'N/A'}
                                  </p>
                                  <p className="text-[10px] italic text-indigo-400 font-medium break-words">
                                      "{selectedSlotItem.motivo_ultima_ubicacion || 'Sin motivo especificado'}"
                                  </p>
                              </div>
                          </div>
                      )}

                      {/* Mixed Items Detail Table */}
                      {selectedSlotItem.isMixed && selectedSlotItem.mixedItems && (
                          <div className="border border-slate-100 rounded-2xl overflow-hidden shadow-sm">
                              <div className="bg-slate-50 px-4 py-2 text-[10px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-2">
                                  <Layers className="w-3 h-3"/> Contenido Detallado
                              </div>
                              <div className="max-h-40 overflow-y-auto">
                                  <table className="w-full text-xs text-left">
                                      <thead className="bg-slate-50/50 sticky top-0 border-b border-slate-100">
                                          <tr>
                                              <th className="px-4 py-2 text-[8px] font-black uppercase text-slate-400">Producto</th>
                                              <th className="px-4 py-2 text-[8px] font-black uppercase text-slate-400 text-center">Cant</th>
                                              <th className="px-4 py-2 text-[8px] font-black uppercase text-slate-400 text-center">Vence</th>
                                          </tr>
                                      </thead>
                                      <tbody>
                                          {selectedSlotItem.mixedItems.map((item, i) => (
                                              <tr key={i} className="border-b border-slate-50 last:border-0 hover:bg-slate-50 transition-colors">
                                                  <td className="px-4 py-2 font-bold text-slate-700 truncate max-w-[120px]">{item.productName}</td>
                                                  <td className="px-4 py-2 text-center font-black text-slate-900">{item.quantity}</td>
                                                  <td className="px-4 py-2 text-center text-[10px] font-bold text-slate-400">{item.expirationDate}</td>
                                              </tr>
                                          ))}
                                      </tbody>
                                  </table>
                              </div>
                          </div>
                      )}

                      <div className="flex flex-col gap-3 pt-2">
                          <button
                            onClick={() => {
                                setIsScanMode(true);
                                setScanLPN(selectedSlotItem.lpn);
                                setScanLocation('');
                                setScanStep('LOCATION');
                                setScanMessage({ type: 'info', text: `Reubicando LPN ${selectedSlotItem.lpn}. Escanee la nueva ubicación.` });
                                setSelectedSlotItem(null);
                            }}
                            className="w-full py-4 bg-indigo-600 text-white rounded-2xl font-black text-xs uppercase tracking-widest hover:bg-indigo-700 transition-all flex justify-center items-center gap-2 shadow-xl shadow-indigo-100 hover:scale-[1.02]"
                          >
                              <RefreshCw className="w-4 h-4" />
                              Reubicar LPN
                          </button>

                          <button
                            onClick={() => {
                                const reason = prompt(`¿Motivo del despacho del LPN ${selectedSlotItem.lpn}?`, "Despacho estándar");
                                if (reason !== null) {
                                    onDispatch(selectedSlotItem.lpn, reason || "Despacho estándar");
                                    setSelectedSlotItem(null);
                                }
                            }}
                            className="w-full py-4 bg-white text-red-500 border-2 border-red-50 rounded-2xl font-black text-xs uppercase tracking-widest hover:bg-red-50 hover:border-red-100 transition-all flex justify-center items-center gap-2"
                          >
                              <ArrowRightFromLine className="w-5 h-5" />
                              Registrar Salida
                          </button>
                      </div>
                  </div>
              </div>
          </div>
      )}

      {/* --- MODAL: SCAN MODE --- */}
      {isScanMode && (
          <div className="fixed inset-0 z-50 bg-slate-900/90 flex justify-center items-start pt-10 px-4">
              <div className="w-full max-w-4xl flex flex-col md:flex-row gap-6">
                  
                  {/* Scanner Box */}
                  <div className="flex-1">
                      <div className="flex justify-between items-center mb-6 text-white">
                          <h2 className="text-3xl font-black flex items-center gap-3">
                              <Scan className="w-8 h-8 text-green-400" />
                              MODO ESCÁNER
                          </h2>
                          <button 
                            onClick={() => setIsScanMode(false)}
                            className="text-white/50 hover:text-white"
                          >
                              <XCircle className="w-8 h-8" />
                          </button>
                      </div>

                      <div className="bg-slate-800 rounded-2xl p-8 shadow-2xl border border-slate-700">
                          
                          {/* Step 1: Scan LPN */}
                          <div className={`transition-all duration-300 ${scanStep === 'LPN' ? 'opacity-100 translate-x-0' : 'opacity-30 translate-x-[-20px] hidden'}`}>
                              <label className="block text-slate-400 text-sm font-bold uppercase mb-2">Paso 1: Escanear LPN</label>
                              <form onSubmit={handleScanLPNSubmit}>
                                  <input 
                                      ref={lpnInputRef}
                                      type="text" 
                                      value={scanLPN}
                                      onChange={e => setScanLPN(e.target.value)}
                                      placeholder="Escanee código de barra LPN..."
                                      className="w-full bg-slate-900 text-white text-xl font-mono p-4 rounded-lg border-2 border-slate-600 focus:border-green-500 outline-none"
                                      autoFocus
                                  />
                              </form>
                          </div>

                          {/* Step 2: Scan Location */}
                          {scanStep === 'LOCATION' && (
                              <div className="animate-fade-in">
                                  <div className="mb-6 p-4 bg-slate-700/50 rounded-lg border border-slate-600">
                                      <p className="text-xs text-slate-400 uppercase">LPN Seleccionado</p>
                                      <p className="text-2xl font-mono text-white font-bold tracking-widest">{scanLPN}</p>
                                  </div>

                                  <label className="block text-slate-400 text-sm font-bold uppercase mb-2">Paso 2: Escanear Ubicación (QR Rack)</label>
                                  <form onSubmit={handleScanLocationSubmit}>
                                      <input 
                                          ref={locInputRef}
                                          type="text" 
                                          value={scanLocation}
                                          onChange={e => setScanLocation(e.target.value)}
                                          placeholder="Ej. SE-A-1-5 (Zona-Pasillo-Col-Nivel)..."
                                          className="w-full bg-slate-900 text-white text-xl font-mono p-4 rounded-lg border-2 border-slate-600 focus:border-blue-500 outline-none"
                                          autoFocus
                                      />
                                  </form>
                                  <button onClick={() => setScanStep('LPN')} className="mt-4 text-slate-400 text-sm underline">Cancelar y volver a escanear LPN</button>
                              </div>
                          )}

                          {/* Feedback Messages */}
                          {scanMessage && (
                              <div className={`mt-6 p-4 rounded-lg flex items-center gap-3 ${
                                  scanMessage.type === 'success' ? 'bg-green-500/20 text-green-300 border border-green-500/50' :
                                  scanMessage.type === 'error' ? 'bg-red-500/20 text-red-300 border border-red-500/50' :
                                  'bg-blue-500/20 text-blue-300 border border-blue-500/30'
                              }`}>
                                  {scanMessage.type === 'success' ? <CheckCircle className="w-6 h-6"/> : <Info className="w-6 h-6"/>}
                                  <span className="font-bold">{scanMessage.text}</span>
                              </div>
                          )}
                      </div>
                  </div>

                  {/* Helpers: Pending Items List */}
                  {scanStep === 'LPN' && (
                      <div className="w-full md:w-80 bg-slate-800 rounded-xl p-4 border border-slate-700 flex flex-col h-[500px]">
                          <h3 className="text-white font-bold mb-3 flex items-center gap-2">
                             <Package className="w-4 h-4 text-orange-400"/>
                             Pendientes ({itemsPendingLocation.length})
                          </h3>
                          <div className="flex-1 overflow-y-auto space-y-2 pr-1 custom-scrollbar">
                              {itemsPendingLocation.length === 0 ? (
                                  <p className="text-slate-500 text-sm italic">No hay ítems pendientes.</p>
                              ) : (
                                  itemsPendingLocation.map(item => (
                                      <button 
                                        key={item.lpn}
                                        onClick={() => {
                                            setScanLPN(item.lpn);
                                            lpnInputRef.current?.focus();
                                        }}
                                        className="w-full text-left bg-slate-700/50 hover:bg-slate-700 p-3 rounded border border-slate-600 hover:border-blue-500 transition-all group"
                                      >
                                          <div className="flex justify-between items-start">
                                              <span className="text-orange-300 font-mono font-bold text-sm">{item.lpn}</span>
                                              <span className="text-slate-400 text-xs">x{item.quantity}</span>
                                          </div>
                                          <div className="text-slate-300 text-xs truncate mt-1">{item.productName}</div>
                                          {item.isMixed && <div className="text-[10px] text-blue-400 uppercase font-bold mt-1">Mixto</div>}
                                      </button>
                                  ))
                              )}
                          </div>
                          <div className="mt-2 pt-2 border-t border-slate-700 text-[10px] text-slate-500 text-center">
                              Click en un ítem para autocompletar
                          </div>
                      </div>
                  )}
              </div>
          </div>
      )}
      {/* --- MODAL: CUSTOM ALERT --- */}
      {customAlert && (
          <div className="fixed inset-0 z-[100] bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
              <div className="bg-white w-full max-w-sm rounded-[2rem] shadow-2xl overflow-hidden animate-fade-in border border-zinc-100">
                  <div className="p-8 text-center">
                      <div className="w-16 h-16 bg-red-50 text-red-500 rounded-2xl flex items-center justify-center mx-auto mb-6">
                          <Info className="w-8 h-8" />
                      </div>
                      <h3 className="text-xl font-black text-slate-900 uppercase tracking-tight mb-2">{customAlert.title}</h3>
                      <p className="text-slate-500 text-sm font-medium leading-relaxed mb-8">
                          {customAlert.message}
                      </p>
                      <button 
                          onClick={() => setCustomAlert(null)}
                          className="w-full bg-slate-900 text-white py-4 rounded-2xl font-black text-sm uppercase tracking-widest hover:bg-slate-800 transition-all shadow-xl shadow-slate-200"
                      >
                          Entendido
                      </button>
                  </div>
              </div>
          </div>
      )}
    </div>
  );
};

export default Layout;
