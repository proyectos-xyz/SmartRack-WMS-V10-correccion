import React, { useState, useMemo, useEffect, useRef } from 'react';
import { InventoryItem, Rack, Zone, Product, Usuario, RackLocation } from '../types';
import { 
  ArrowLeft, 
  Search, 
  Package, 
  Maximize2, 
  Minimize2, 
  Layers, 
  ChevronRight, 
  Snowflake, 
  Sun, 
  Thermometer, 
  Lock, 
  PlusCircle, 
  ArrowRight, 
  CheckCircle2, 
  AlertTriangle, 
  X, 
  Info,
  Copy,
  RotateCw,
  Smartphone,
  ZoomIn,
  ZoomOut
} from 'lucide-react';

interface InventoryMapExplorerProps {
  inventory: InventoryItem[];
  racks: Rack[];
  zones?: Zone[];
  catalog?: Product[];
  currentUser?: Usuario | null;
  onAssignLocation?: (lpn: string, location: RackLocation, reason?: string) => void;
  onMoveToPicking?: (lpn: string) => Promise<void> | void;
  onClose?: () => void;
}

type ChamberType = 'SECO' | 'REFRIGERADO' | 'CONGELADO';

interface ChamberInfo {
  type: ChamberType;
  name: string;
  subtitle: string;
  temperature: string;
  tempBadge: string;
  bgGradient: string;
  borderClass: string;
  accentColor: string;
  icon: React.ReactNode;
  imageBg: string;
  description: string;
}

const CHAMBERS: ChamberInfo[] = [
  {
    type: 'SECO',
    name: 'Cámara Seco',
    subtitle: 'Almacén Seco / Abarrotes & Insumos',
    temperature: '+15°C a +25°C',
    tempBadge: 'Ambiente',
    bgGradient: 'from-amber-500/10 via-orange-500/5 to-transparent',
    borderClass: 'border-amber-200 hover:border-amber-400 dark:border-amber-800',
    accentColor: '#f59e0b',
    icon: <Sun className="w-6 h-6 text-amber-500" />,
    imageBg: 'https://images.unsplash.com/photo-1586528116311-ad8dd3c8310d?auto=format&fit=crop&w=800&q=80',
    description: 'Productos no perecibles, abarrotes secos, cajas de empaque y materias primas a temperatura controlada estándar.'
  },
  {
    type: 'REFRIGERADO',
    name: 'Cámara Refrigerado',
    subtitle: 'Frío Positivo / Lácteos & Perecibles',
    temperature: '0°C a +4°C',
    tempBadge: 'Refrigeración',
    bgGradient: 'from-cyan-500/10 via-blue-500/5 to-transparent',
    borderClass: 'border-cyan-200 hover:border-cyan-400 dark:border-cyan-800',
    accentColor: '#06b6d4',
    icon: <Thermometer className="w-6 h-6 text-cyan-500" />,
    imageBg: 'https://images.unsplash.com/photo-1578575437130-527eed3abbec?auto=format&fit=crop&w=800&q=80',
    description: 'Productos frescos lácteos, embutidos, quesos, vegetales y conservas que exigen cadena de frío continua.'
  },
  {
    type: 'CONGELADO',
    name: 'Cámara Congelado',
    subtitle: 'Frío Negativo / Pulpas & Carnes',
    temperature: '-18°C a -25°C',
    tempBadge: 'Congelación',
    bgGradient: 'from-blue-600/15 via-indigo-500/5 to-transparent',
    borderClass: 'border-blue-300 hover:border-blue-500 dark:border-blue-700',
    accentColor: '#3b82f6',
    icon: <Snowflake className="w-6 h-6 text-blue-500 animate-pulse" />,
    imageBg: 'https://images.unsplash.com/photo-1587293852726-70cdb56c2866?auto=format&fit=crop&w=800&q=80',
    description: 'Pulpas de frutas congeladas, carnes, helados, bases concentradas y productos de ultracongelación.'
  }
];

export const InventoryMapExplorer: React.FC<InventoryMapExplorerProps> = ({
  inventory,
  racks,
  zones = [],
  catalog = [],
  currentUser: _currentUser,
  onAssignLocation,
  onMoveToPicking,
  onClose
}) => {
  // Navigation states: 'CHAMBERS' | 'RACKS_IN_CHAMBER' | 'RACK_ELEVATION'
  const [currentStep, setCurrentStep] = useState<'CHAMBERS' | 'RACKS_IN_CHAMBER' | 'RACK_ELEVATION'>('CHAMBERS');
  const [selectedChamber, setSelectedChamber] = useState<ChamberType | null>(null);
  const [selectedRack, setSelectedRack] = useState<Rack | null>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);

  // 📱 Mobile & Responsive App-Like States
  const [isMobile, setIsMobile] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false;
    return window.innerWidth < 768 || ('ontouchstart' in window) || navigator.maxTouchPoints > 0;
  });
  const [isPortrait, setIsPortrait] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false;
    return window.innerHeight > window.innerWidth;
  });
  const [forceLandscapeRotation, setForceLandscapeRotation] = useState<boolean>(true);
  const [zoomScale, setZoomScale] = useState<number>(1);
  const [slotHighlightFilter, setSlotHighlightFilter] = useState<'ALL' | 'OCCUPIED' | 'FREE' | 'MIXED' | 'EXPIRING'>('ALL');
  const gridContainerRef = useRef<HTMLDivElement>(null);

  // Monitor Window Resize & Screen Orientation
  useEffect(() => {
    const checkViewport = () => {
      if (typeof window === 'undefined') return;
      const mobile = window.innerWidth < 768 || ('ontouchstart' in window) || navigator.maxTouchPoints > 0;
      const portrait = window.innerHeight > window.innerWidth;
      setIsMobile(mobile);
      setIsPortrait(portrait);
    };

    checkViewport();
    window.addEventListener('resize', checkViewport);
    window.addEventListener('orientationchange', checkViewport);

    return () => {
      window.removeEventListener('resize', checkViewport);
      window.removeEventListener('orientationchange', checkViewport);
    };
  }, []);

  // Lock body scroll when entering full-screen rack elevation on mobile
  useEffect(() => {
    if (currentStep === 'RACK_ELEVATION' && isMobile) {
      document.body.style.overflow = 'hidden';
      // Attempt device screen orientation lock to landscape if supported
      try {
        const screenOrient = screen.orientation as any;
        if (screenOrient && typeof screenOrient.lock === 'function') {
          screenOrient.lock('landscape').catch(() => {});
        } else if ((screen as any).lockOrientation) {
          (screen as any).lockOrientation('landscape');
        }
      } catch {
        // Fallback gracefully to CSS rotation
      }
    } else {
      document.body.style.overflow = '';
      try {
        const screenOrient = screen.orientation as any;
        if (screenOrient && typeof screenOrient.unlock === 'function') {
          screenOrient.unlock();
        }
      } catch {}
    }

    return () => {
      document.body.style.overflow = '';
    };
  }, [currentStep, isMobile]);

  // Handler to open rack elevation with device adaptation
  const handleOpenRackElevation = (rack: Rack) => {
    setSelectedRack(rack);
    setCurrentStep('RACK_ELEVATION');
    if (window.innerWidth < 768) {
      setForceLandscapeRotation(true);
      setZoomScale(0.85); // optimized mobile fit
    } else {
      setZoomScale(1);
    }
  };

  // Search and Filter states
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedAisleFilter, setSelectedAisleFilter] = useState<string>('TODOS');

  // Modal interaction states
  const [selectedItemModal, setSelectedItemModal] = useState<InventoryItem | null>(null);
  const [quickAssignSlot, setQuickAssignSlot] = useState<{ rack: Rack; level: number; position: number } | null>(null);
  const [quickAssignSearch, setQuickAssignSearch] = useState('');
  const [feedbackToast, setFeedbackToast] = useState<{ type: 'success' | 'error' | 'info'; message: string } | null>(null);

  const showToast = (type: 'success' | 'error' | 'info', message: string) => {
    setFeedbackToast({ type, message });
    setTimeout(() => setFeedbackToast(null), 3500);
  };

  // Helper: map a rack to its chamber type
  const getRackChamber = (rack: Rack): ChamberType => {
    // 1. Check if rack.zoneId matches a zone with type
    if (rack.zoneId && zones.length > 0) {
      const matchedZone = zones.find(z => z.id === rack.zoneId || String(z.id) === String(rack.zoneId));
      if (matchedZone?.type) return matchedZone.type;
    }
    // 2. Default mapping based on aisle if not assigned:
    const aisleUpper = (rack.aisle || '').trim().toUpperCase();
    if (aisleUpper === 'A' || aisleUpper === 'B') return 'SECO';
    if (aisleUpper === 'C' || aisleUpper === 'D') return 'REFRIGERADO';
    if (aisleUpper === 'E' || aisleUpper === 'F' || aisleUpper === 'G') return 'CONGELADO';
    
    // Fallback: Default to SECO
    return 'SECO';
  };

  // Helper: items pending location
  const pendingItems = useMemo(() => {
    return inventory.filter(i => {
      const st = (i.estado_lpn || '').toUpperCase();
      return !i.location && st !== 'PICKING' && st !== 'DESPACHADO' && st !== 'ELIMINADO';
    });
  }, [inventory]);

  // Statistics per chamber
  const chamberStats = useMemo(() => {
    const stats: Record<ChamberType, {
      racksCount: number;
      aisles: string[];
      totalSlots: number;
      occupiedSlots: number;
      freeSlots: number;
      lpnsInRack: number;
      lpnsInPicking: number;
      occupancyRate: number;
    }> = {
      SECO: { racksCount: 0, aisles: [], totalSlots: 0, occupiedSlots: 0, freeSlots: 0, lpnsInRack: 0, lpnsInPicking: 0, occupancyRate: 0 },
      REFRIGERADO: { racksCount: 0, aisles: [], totalSlots: 0, occupiedSlots: 0, freeSlots: 0, lpnsInRack: 0, lpnsInPicking: 0, occupancyRate: 0 },
      CONGELADO: { racksCount: 0, aisles: [], totalSlots: 0, occupiedSlots: 0, freeSlots: 0, lpnsInRack: 0, lpnsInPicking: 0, occupancyRate: 0 }
    };

    // Calculate slots from racks
    racks.forEach(rack => {
      const ch = getRackChamber(rack);
      const rackSlots = rack.levels * rack.positionsPerLevel;
      stats[ch].racksCount += 1;
      if (rack.aisle && !stats[ch].aisles.includes(rack.aisle)) {
        stats[ch].aisles.push(rack.aisle);
      }
      stats[ch].totalSlots += rackSlots;
    });

    // Calculate LPNs in racks
    inventory.forEach(item => {
      if (item.location) {
        const rack = racks.find(r => r.aisle === item.location?.aisle && r.id === item.location?.rackId);
        const ch = rack ? getRackChamber(rack) : 'SECO';
        stats[ch].occupiedSlots += 1;
        stats[ch].lpnsInRack += 1;
      } else if (item.estado_lpn === 'PICKING') {
        const catProd = catalog.find(p => p.codigo === item.productCode);
        const prefZone = catProd?.zona_predeterminada || (catProd?.es_congelado ? 'CONGELADO' : catProd?.es_refrigerado ? 'REFRIGERADO' : 'SECO');
        stats[prefZone as ChamberType].lpnsInPicking += 1;
      }
    });

    // Calculate free slots & rates
    (Object.keys(stats) as ChamberType[]).forEach(ch => {
      stats[ch].freeSlots = Math.max(0, stats[ch].totalSlots - stats[ch].occupiedSlots);
      stats[ch].occupancyRate = stats[ch].totalSlots > 0 
        ? Math.round((stats[ch].occupiedSlots / stats[ch].totalSlots) * 100) 
        : 0;
      stats[ch].aisles.sort();
    });

    return stats;
  }, [racks, inventory, zones, catalog]);

  // Racks belonging to selected chamber
  const chamberRacks = useMemo(() => {
    if (!selectedChamber) return [];
    return racks.filter(r => getRackChamber(r) === selectedChamber);
  }, [racks, selectedChamber, zones]);

  // Available aisles for filter in selected chamber
  const chamberAisles = useMemo(() => {
    const setA = new Set<string>();
    chamberRacks.forEach(r => {
      if (r.aisle) setA.add(r.aisle);
    });
    return Array.from(setA).sort();
  }, [chamberRacks]);

  // Filtered racks list inside chamber
  const filteredChamberRacks = useMemo(() => {
    return chamberRacks.filter(r => {
      if (selectedAisleFilter !== 'TODOS' && r.aisle !== selectedAisleFilter) {
        return false;
      }
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const matchRack = `pasillo ${r.aisle} estante ${r.id} rack ${r.id}`.toLowerCase().includes(q);
        // Also check if any item on this rack matches
        const hasMatchingItem = inventory.some(i => 
          i.location?.aisle === r.aisle && 
          i.location?.rackId === r.id && 
          (i.lpn.toLowerCase().includes(q) || (i.productName && i.productName.toLowerCase().includes(q)) || (i.productCode && i.productCode.toLowerCase().includes(q)))
        );
        return matchRack || hasMatchingItem;
      }
      return true;
    });
  }, [chamberRacks, selectedAisleFilter, searchQuery, inventory]);

  // Helper to get slot item on a rack
  const getRackSlotItem = (rack: Rack, level: number, position: number): InventoryItem | null => {
    return inventory.find(i => 
      i.location && 
      i.location.aisle === rack.aisle && 
      i.location.rackId === rack.id && 
      i.location.level === level && 
      i.location.position === position
    ) || null;
  };

  // Helper to check if slot is blocked in rack config
  const isRackSlotBlocked = (rack: Rack, level: number, position: number): boolean => {
    const slotCfg = rack.slots?.find(s => s.location?.level === level && s.location?.position === position);
    return !!slotCfg?.isBlocked;
  };

  // Rack statistics for currently viewed rack
  const currentRackOccupiedCount = useMemo(() => {
    if (!selectedRack) return 0;
    return inventory.filter(i => 
      i.location && 
      i.location.aisle === selectedRack.aisle && 
      i.location.rackId === selectedRack.id
    ).length;
  }, [selectedRack, inventory]);

  const currentRackOccupancyRate = useMemo(() => {
    if (!selectedRack) return 0;
    const total = selectedRack.levels * selectedRack.positionsPerLevel;
    if (total === 0) return 0;
    return Math.round((currentRackOccupiedCount / total) * 100);
  }, [selectedRack, currentRackOccupiedCount]);

  // Handle Quick Assign action
  const handlePerformQuickAssign = (itemToAssign: InventoryItem) => {
    if (!quickAssignSlot || !onAssignLocation) return;
    const loc: RackLocation = {
      aisle: quickAssignSlot.rack.aisle,
      rackId: quickAssignSlot.rack.id,
      level: quickAssignSlot.level,
      position: quickAssignSlot.position
    };
    onAssignLocation(itemToAssign.lpn, loc, 'Asignación directa desde Mapa de Inventario');
    showToast('success', `LPN ${itemToAssign.lpn} asignado a Pasillo ${loc.aisle}-R${loc.rackId}-L${loc.level}-P${loc.position}`);
    setQuickAssignSlot(null);
  };

  // Handle Move to Picking action
  const handlePerformMoveToPicking = async (lpn: string) => {
    if (!onMoveToPicking) return;
    try {
      await onMoveToPicking(lpn);
      showToast('success', `LPN ${lpn} ha sido bajado a Picking.`);
      setSelectedItemModal(null);
    } catch (e) {
      showToast('error', `Error al mover LPN a picking.`);
    }
  };

  return (
    <div className={`flex flex-col h-full bg-slate-100 dark:bg-slate-950 text-slate-800 dark:text-slate-100 ${isFullscreen ? 'fixed inset-0 z-50 p-2 sm:p-4' : 'relative'}`}>
      
      {/* 🧭 TOP BREADCRUMB & CONTEXT BAR */}
      <div className="bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 px-3 sm:px-5 py-2.5 flex items-center justify-between gap-3 shrink-0 shadow-2xs">
        <div className="flex items-center gap-2 flex-wrap min-w-0">
          
          {/* Back button */}
          {currentStep !== 'CHAMBERS' && (
            <button
              onClick={() => {
                if (currentStep === 'RACK_ELEVATION') {
                  setCurrentStep('RACKS_IN_CHAMBER');
                  setSelectedRack(null);
                } else if (currentStep === 'RACKS_IN_CHAMBER') {
                  setCurrentStep('CHAMBERS');
                  setSelectedChamber(null);
                }
              }}
              className="px-2.5 py-1.5 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 rounded-xl text-xs font-black flex items-center gap-1.5 transition-all shadow-2xs active:scale-95"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              <span>{currentStep === 'RACK_ELEVATION' ? 'Racks' : 'Cámaras'}</span>
            </button>
          )}

          {/* Breadcrumb pills */}
          <div className="flex items-center gap-1.5 text-xs font-bold text-slate-500 dark:text-slate-400">
            <button 
              onClick={() => { setCurrentStep('CHAMBERS'); setSelectedChamber(null); setSelectedRack(null); }}
              className={`hover:text-blue-600 font-extrabold uppercase transition-colors ${currentStep === 'CHAMBERS' ? 'text-slate-900 dark:text-white font-black' : ''}`}
            >
              🗺️ Cámaras
            </button>

            {selectedChamber && (
              <>
                <ChevronRight className="w-3.5 h-3.5 text-slate-300" />
                <button
                  onClick={() => { setCurrentStep('RACKS_IN_CHAMBER'); setSelectedRack(null); }}
                  className={`hover:text-blue-600 font-extrabold uppercase transition-colors ${currentStep === 'RACKS_IN_CHAMBER' ? 'text-slate-900 dark:text-white font-black' : ''}`}
                >
                  {selectedChamber === 'SECO' && '☀️ Cámara Seco'}
                  {selectedChamber === 'REFRIGERADO' && '❄️ Cámara Refrigerado'}
                  {selectedChamber === 'CONGELADO' && '🧊 Cámara Congelado'}
                </button>
              </>
            )}

            {selectedRack && (
              <>
                <ChevronRight className="w-3.5 h-3.5 text-slate-300" />
                <span className="text-blue-600 dark:text-blue-400 font-black uppercase">
                  Pasillo {selectedRack.aisle} · Rack {selectedRack.id}
                </span>
              </>
            )}
          </div>
        </div>

        {/* Action Controls */}
        <div className="flex items-center gap-2">
          {currentStep === 'RACK_ELEVATION' && (
            <button
              onClick={() => setIsFullscreen(!isFullscreen)}
              className="p-1.5 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300 rounded-lg text-xs font-bold flex items-center gap-1 transition-all"
              title={isFullscreen ? "Restaurar tamaño" : "Pantalla completa"}
            >
              {isFullscreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
            </button>
          )}

          {onClose && (
            <button
              onClick={onClose}
              className="p-1.5 text-slate-400 hover:text-slate-700 dark:hover:text-white rounded-lg transition-colors"
              title="Cerrar vista"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>

      {/* Toast Feedback Message */}
      {feedbackToast && (
        <div className="absolute top-14 left-1/2 -translate-x-1/2 z-50 animate-fade-in shadow-xl">
          <div className={`px-4 py-2 rounded-2xl border text-xs font-bold flex items-center gap-2 ${
            feedbackToast.type === 'success' ? 'bg-emerald-500 text-white border-emerald-600' :
            feedbackToast.type === 'error' ? 'bg-rose-500 text-white border-rose-600' :
            'bg-slate-900 text-white border-slate-700'
          }`}>
            {feedbackToast.type === 'success' && <CheckCircle2 className="w-4 h-4" />}
            {feedbackToast.type === 'error' && <AlertTriangle className="w-4 h-4" />}
            {feedbackToast.type === 'info' && <Info className="w-4 h-4" />}
            <span>{feedbackToast.message}</span>
          </div>
        </div>
      )}

      {/* ------------------------------------------------------------- */}
      {/* 🚀 LEVEL 1: 3 CÁMARAS OVERVIEW (SECO - REFRIGERADO - CONGELADO) */}
      {/* ------------------------------------------------------------- */}
      {currentStep === 'CHAMBERS' && (
        <div className="flex-1 overflow-y-auto custom-scrollbar p-3 sm:p-6 space-y-6">
          {/* Header Banner */}
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-4 sm:p-6 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div>
              <div className="flex items-center gap-2">
                <div className="p-2 rounded-2xl bg-blue-50 dark:bg-blue-950/40 text-blue-600 border border-blue-100 dark:border-blue-900">
                  <Layers className="w-5 h-5" />
                </div>
                <h1 className="text-xl sm:text-2xl font-black tracking-tight text-slate-900 dark:text-white uppercase">
                  Mapa de Inventario por Cámaras
                </h1>
              </div>
              <p className="text-xs font-bold text-slate-500 dark:text-slate-400 mt-1 max-w-2xl">
                Seleccione una cámara para visualizar la distribución de pasillos, estantes configurados y todos los LPNs rackeados en alta definición gráfica.
              </p>
            </div>

            {/* Global Summary Stats */}
            <div className="flex items-center gap-3 bg-slate-50 dark:bg-slate-800/80 p-2.5 px-4 rounded-2xl border border-slate-200/60 dark:border-slate-700 shrink-0">
              <div className="text-center pr-3 border-r border-slate-200 dark:border-slate-700">
                <div className="text-[10px] font-black text-slate-400 uppercase">Total Racks</div>
                <div className="text-base font-black text-slate-800 dark:text-white">{racks.length}</div>
              </div>
              <div className="text-center pr-3 border-r border-slate-200 dark:border-slate-700">
                <div className="text-[10px] font-black text-slate-400 uppercase">Pallets Rackeados</div>
                <div className="text-base font-black text-blue-600 dark:text-blue-400">
                  {inventory.filter(i => !!i.location).length}
                </div>
              </div>
              <div className="text-center">
                <div className="text-[10px] font-black text-slate-400 uppercase">Pendientes Ubicar</div>
                <div className="text-base font-black text-amber-500">
                  {pendingItems.length}
                </div>
              </div>
            </div>
          </div>

          {/* 3 Representative Chamber Cards */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
            {CHAMBERS.map(ch => {
              const stats = chamberStats[ch.type];
              return (
                <div
                  key={ch.type}
                  onClick={() => {
                    setSelectedChamber(ch.type);
                    setCurrentStep('RACKS_IN_CHAMBER');
                    setSelectedAisleFilter('TODOS');
                  }}
                  className={`group relative overflow-hidden bg-white dark:bg-slate-900 rounded-3xl border-2 ${ch.borderClass} shadow-md hover:shadow-xl transition-all duration-300 cursor-pointer flex flex-col justify-between transform hover:-translate-y-1`}
                >
                  {/* Top Image & Temperature Badge Banner */}
                  <div className="relative h-44 sm:h-48 overflow-hidden bg-slate-900">
                    <img 
                      src={ch.imageBg} 
                      alt={ch.name}
                      className="w-full h-full object-cover object-center group-hover:scale-105 transition-transform duration-500 opacity-80"
                      referrerPolicy="no-referrer"
                    />
                    <div className={`absolute inset-0 bg-gradient-to-t from-slate-950 via-slate-950/40 to-transparent`} />
                    
                    {/* Temperature Pill */}
                    <div className="absolute top-3.5 left-3.5 flex items-center gap-1.5 bg-slate-900/85 backdrop-blur-md px-3 py-1.5 rounded-full border border-white/20 text-white shadow-lg">
                      {ch.icon}
                      <span className="text-[11px] font-black tracking-wide font-mono">{ch.temperature}</span>
                    </div>

                    {/* Type Badge */}
                    <div className="absolute top-3.5 right-3.5">
                      <span className="text-[10px] font-black uppercase tracking-wider px-2.5 py-1 rounded-full bg-white/20 backdrop-blur-md text-white border border-white/30">
                        {ch.tempBadge}
                      </span>
                    </div>

                    {/* Bottom Title on Image */}
                    <div className="absolute bottom-3.5 left-3.5 right-3.5 text-white">
                      <h2 className="text-xl font-black tracking-tight drop-shadow-md">
                        {ch.name}
                      </h2>
                      <p className="text-[11px] font-bold text-slate-200/90 truncate drop-shadow-sm">
                        {ch.subtitle}
                      </p>
                    </div>
                  </div>

                  {/* Chamber Metrics & Body */}
                  <div className="p-4 sm:p-5 flex-1 flex flex-col justify-between space-y-4">
                    <p className="text-xs text-slate-600 dark:text-slate-400 font-medium line-clamp-2">
                      {ch.description}
                    </p>

                    {/* Pasillos Tags */}
                    <div>
                      <div className="text-[10px] font-black uppercase text-slate-400 dark:text-slate-500 mb-1.5 tracking-wider">
                        Pasillos configurados:
                      </div>
                      <div className="flex flex-wrap gap-1.5">
                        {stats.aisles.length > 0 ? (
                          stats.aisles.map(a => (
                            <span 
                              key={a}
                              className="px-2 py-0.5 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-800 dark:text-slate-200 font-black text-xs border border-slate-200 dark:border-slate-700"
                            >
                              Pasillo {a}
                            </span>
                          ))
                        ) : (
                          <span className="text-xs text-slate-400 italic">Sin pasillos asignados</span>
                        )}
                      </div>
                    </div>

                    {/* Live Occupancy Gauge */}
                    <div className="bg-slate-50 dark:bg-slate-800/60 p-3 rounded-2xl border border-slate-100 dark:border-slate-800 space-y-2">
                      <div className="flex justify-between items-center text-xs font-black">
                        <span className="text-slate-600 dark:text-slate-400">Ocupación Cámara:</span>
                        <span className="text-blue-600 dark:text-blue-400 font-mono">{stats.occupancyRate}%</span>
                      </div>
                      <div className="w-full h-2.5 bg-slate-200 dark:bg-slate-700 rounded-full overflow-hidden">
                        <div 
                          className="h-full rounded-full transition-all duration-500"
                          style={{
                            width: `${Math.min(100, stats.occupancyRate)}%`,
                            backgroundColor: stats.occupancyRate > 90 ? '#ef4444' : stats.occupancyRate > 70 ? '#f59e0b' : '#10b981'
                          }}
                        />
                      </div>
                      <div className="flex justify-between text-[11px] font-bold text-slate-500 dark:text-slate-400">
                        <span>{stats.lpnsInRack} Pallets en Rack</span>
                        <span>{stats.totalSlots} Capacidad</span>
                      </div>
                    </div>

                    {/* Action Button */}
                    <button
                      type="button"
                      className="w-full py-2.5 px-4 rounded-xl bg-slate-900 hover:bg-blue-600 text-white font-black text-xs flex items-center justify-center gap-2 transition-all shadow-md group-hover:bg-blue-600"
                    >
                      <span>Entrar a Cámara ({stats.racksCount} Racks)</span>
                      <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ------------------------------------------------------------- */}
      {/* 🏢 LEVEL 2: RACKS INSIDE SELECTED CHAMBER (A, B, C, D, E, F, G) */}
      {/* ------------------------------------------------------------- */}
      {currentStep === 'RACKS_IN_CHAMBER' && selectedChamber && (
        <div className="flex-1 overflow-y-auto custom-scrollbar p-3 sm:p-6 space-y-5">
          
          {/* Header Summary for selected chamber */}
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-4 sm:p-6 shadow-xs flex flex-col lg:flex-row lg:items-center justify-between gap-4">
            <div className="space-y-1">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-xs font-black px-2.5 py-1 rounded-full bg-blue-100 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300 uppercase tracking-wide">
                  {selectedChamber === 'SECO' && '☀️ AMBIENTE (+15°C A +25°C)'}
                  {selectedChamber === 'REFRIGERADO' && '❄️ REFRIGERACIÓN (0°C A +4°C)'}
                  {selectedChamber === 'CONGELADO' && '🧊 CONGELACIÓN (-18°C A -25°C)'}
                </span>
                <h1 className="text-xl sm:text-2xl font-black text-slate-900 dark:text-white uppercase tracking-tight">
                  {selectedChamber === 'SECO' && 'Racks · Cámara de Secos'}
                  {selectedChamber === 'REFRIGERADO' && 'Racks · Cámara de Refrigerados'}
                  {selectedChamber === 'CONGELADO' && 'Racks · Cámara de Congelados'}
                </h1>
              </div>
              <p className="text-xs text-slate-500 font-bold">
                Haga clic en cualquier estante para abrir la elevación gráfica completa en full screen y visualizar cada LPN ubicado.
              </p>
            </div>

            {/* Quick Filter & Search Tools */}
            <div className="flex items-center gap-2 flex-wrap">
              <div className="relative min-w-[220px]">
                <input
                  type="text"
                  placeholder="Buscar LPN, SKU o Producto..."
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  className="w-full pl-8 pr-7 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-bold text-slate-900 dark:text-white placeholder:text-slate-400 outline-none focus:border-blue-500 transition-all"
                />
                <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
                {searchQuery && (
                  <button onClick={() => setSearchQuery('')} className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>

              {/* Aisle Pills Selector */}
              <div className="flex bg-slate-100 dark:bg-slate-800 p-1 rounded-xl border border-slate-200 dark:border-slate-700 overflow-x-auto max-w-full">
                <button
                  onClick={() => setSelectedAisleFilter('TODOS')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-black uppercase transition-all whitespace-nowrap ${
                    selectedAisleFilter === 'TODOS'
                      ? 'bg-white dark:bg-slate-900 text-blue-600 shadow-2xs'
                      : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
                  }`}
                >
                  Todos
                </button>
                {chamberAisles.map(aisle => (
                  <button
                    key={aisle}
                    onClick={() => setSelectedAisleFilter(aisle)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-black uppercase transition-all whitespace-nowrap ${
                      selectedAisleFilter === aisle
                        ? 'bg-white dark:bg-slate-900 text-blue-600 shadow-2xs'
                        : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
                    }`}
                  >
                    Pasillo {aisle}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Racks Grid */}
          {filteredChamberRacks.length === 0 ? (
            <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 p-12 text-center text-slate-400 space-y-3">
              <Package className="w-12 h-12 mx-auto opacity-40 text-slate-400" />
              <p className="text-base font-black text-slate-700 dark:text-slate-300 uppercase">
                No se encontraron racks configurados para esta cámara
              </p>
              <p className="text-xs font-bold text-slate-400 max-w-md mx-auto">
                Puede asignar pasillos y estantes a esta cámara desde el menú de Configuración de Almacén.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
              {filteredChamberRacks.map(rack => {
                const totalSlots = rack.levels * rack.positionsPerLevel;
                const occupiedItems = inventory.filter(i => 
                  i.location && 
                  i.location.aisle === rack.aisle && 
                  i.location.rackId === rack.id
                );
                const occupiedCount = occupiedItems.length;
                const freeCount = Math.max(0, totalSlots - occupiedCount);
                const rate = totalSlots > 0 ? Math.round((occupiedCount / totalSlots) * 100) : 0;

                return (
                  <div
                    key={`${rack.aisle}-${rack.id}`}
                    onClick={() => handleOpenRackElevation(rack)}
                    className="group bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 hover:border-blue-500 dark:hover:border-blue-500 p-5 shadow-xs hover:shadow-lg transition-all duration-200 cursor-pointer flex flex-col justify-between space-y-4"
                  >
                    {/* Header */}
                    <div className="flex justify-between items-start">
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="w-2.5 h-2.5 rounded-full bg-blue-600 animate-pulse" />
                          <h3 className="text-lg font-black text-slate-900 dark:text-white uppercase tracking-tight">
                            Estante {rack.id} · Pasillo {rack.aisle}
                          </h3>
                        </div>
                        <p className="text-[11px] font-bold text-slate-400 font-mono mt-0.5">
                          {rack.levels} Niveles × {rack.positionsPerLevel} Posiciones ({totalSlots} Slots)
                        </p>
                      </div>

                      <span className={`px-2 py-1 rounded-xl text-xs font-mono font-black border ${
                        rate > 85 ? 'bg-red-50 text-red-600 border-red-200' :
                        rate > 60 ? 'bg-amber-50 text-amber-600 border-amber-200' :
                        'bg-emerald-50 text-emerald-600 border-emerald-200'
                      }`}>
                        {rate}% Ocupado
                      </span>
                    </div>

                    {/* Mini Graphical Elevation Matrix Preview */}
                    <div className="bg-slate-900 p-3 rounded-2xl border border-slate-800 space-y-1.5">
                      <div className="flex justify-between text-[9px] font-mono text-slate-400 font-bold uppercase">
                        <span>Vista Rápida de Bahías</span>
                        <span>{occupiedCount} Pallets</span>
                      </div>
                      <div 
                        className="grid gap-1 py-1"
                        style={{
                          gridTemplateColumns: `repeat(${Math.min(rack.positionsPerLevel, 10)}, 1fr)`
                        }}
                      >
                        {Array.from({ length: Math.min(rack.levels, 6) }).map((_, lIdx) => {
                          const lvl = rack.levels - lIdx;
                          return Array.from({ length: Math.min(rack.positionsPerLevel, 10) }).map((_, pIdx) => {
                            const pos = pIdx + 1;
                            const item = getRackSlotItem(rack, lvl, pos);
                            const isBlocked = isRackSlotBlocked(rack, lvl, pos);

                            let dotColor = 'bg-slate-800 border-slate-700'; // empty
                            if (isBlocked) dotColor = 'bg-slate-700 border-slate-600';
                            else if (item?.isMixed || item?.lpn.startsWith('LPN-MIX')) dotColor = 'bg-blue-500 border-blue-400 shadow-2xs';
                            else if (item) dotColor = 'bg-emerald-400 border-emerald-300 shadow-2xs';

                            return (
                              <div
                                key={`${lvl}-${pos}`}
                                className={`h-2.5 rounded-sm border ${dotColor}`}
                                title={`N${lvl}-P${pos}: ${item ? item.lpn : 'Libre'}`}
                              />
                            );
                          });
                        })}
                      </div>
                    </div>

                    {/* Bottom Stats & CTA */}
                    <div className="pt-2 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between">
                      <div className="text-xs font-bold text-slate-500">
                        <strong className="text-slate-800 dark:text-white font-mono">{occupiedCount}</strong> ocupados · <span className="text-slate-400">{freeCount} libres</span>
                      </div>

                      <button
                        type="button"
                        className="px-3 py-1.5 bg-blue-50 hover:bg-blue-600 hover:text-white text-blue-600 dark:bg-blue-950/60 dark:text-blue-300 rounded-xl text-xs font-black flex items-center gap-1 transition-all group-hover:bg-blue-600 group-hover:text-white shadow-2xs"
                      >
                        <span>Ver Elevación</span>
                        <ChevronRight className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ------------------------------------------------------------- */}
      {/* 🖼️ LEVEL 3: FULL-SCREEN GRAPHICAL RACK ELEVATION BOARD           */}
      {/* (100% App-Like, Auto-Rotated Landscape on Mobile, Zoom & Filters) */}
      {/* ------------------------------------------------------------- */}
      {currentStep === 'RACK_ELEVATION' && selectedRack && (() => {
        const isRotatedMobile = isMobile && isPortrait && forceLandscapeRotation;
        const totalRackSlots = selectedRack.levels * selectedRack.positionsPerLevel;
        const freeRackSlots = Math.max(0, totalRackSlots - currentRackOccupiedCount);
        
        // Calculate items with critical or near expiry
        const expiringCount = inventory.filter(i => {
          if (!i.location || i.location.aisle !== selectedRack.aisle || i.location.rackId !== selectedRack.id || !i.expirationDate) return false;
          const today = new Date();
          const exp = new Date(i.expirationDate);
          const diffDays = Math.ceil((exp.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
          return diffDays <= 30;
        }).length;

        const mixedCount = inventory.filter(i => 
          i.location && 
          i.location.aisle === selectedRack.aisle && 
          i.location.rackId === selectedRack.id &&
          (i.isMixed || i.lpn.startsWith('LPN-MIX'))
        ).length;

        return (
          <div 
            className="flex flex-col bg-[#070c18] text-slate-100 overflow-hidden select-none"
            style={isRotatedMobile ? {
              position: 'fixed',
              top: 0,
              left: '100vw',
              width: '100vh',
              height: '100vw',
              transformOrigin: 'top left',
              transform: 'rotate(90deg)',
              zIndex: 9999,
            } : {
              position: 'fixed',
              inset: 0,
              zIndex: 9999,
            }}
          >
            {/* 📱 TOP APP-BAR / CONTROLS */}
            <div className="bg-[#0b1329] border-b border-slate-800 px-3 sm:px-5 py-2.5 flex items-center justify-between gap-3 shrink-0 shadow-md">
              
              {/* Left: Back & Rack Name */}
              <div className="flex items-center gap-2.5 sm:gap-3 min-w-0">
                <button
                  onClick={() => {
                    setCurrentStep('RACKS_IN_CHAMBER');
                    setSelectedRack(null);
                  }}
                  className="px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 active:scale-95 text-slate-200 border border-slate-700 text-xs font-black flex items-center gap-1.5 transition-all shadow-md shrink-0"
                >
                  <ArrowLeft className="w-4 h-4 text-blue-400" />
                  <span className="hidden sm:inline">VOLVER A RACKS</span>
                  <span className="sm:hidden">RACKS</span>
                </button>

                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="w-2.5 h-2.5 rounded-full bg-blue-500 animate-pulse shrink-0" />
                    <h2 className="text-sm sm:text-base md:text-lg font-black text-white uppercase tracking-tight truncate">
                      ESTANTE {selectedRack.id} · PASILLO {selectedRack.aisle}
                    </h2>
                    <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-blue-950 border border-blue-800 text-blue-300 font-bold hidden sm:inline">
                      {selectedRack.levels} Niv × {selectedRack.positionsPerLevel} Pos
                    </span>
                  </div>
                  <div className="text-[10px] font-bold text-slate-400 truncate">
                    {currentRackOccupiedCount} pallets · <span className="text-emerald-400">{freeRackSlots} libres</span> · <span className="font-mono text-blue-400">{currentRackOccupancyRate}% ocupación</span>
                  </div>
                </div>
              </div>

              {/* Center: Quick Filter Badges */}
              <div className="hidden lg:flex items-center gap-1.5 bg-slate-950/80 p-1 rounded-2xl border border-slate-800">
                <button
                  onClick={() => setSlotHighlightFilter('ALL')}
                  className={`px-2.5 py-1 rounded-xl text-xs font-bold transition-all ${
                    slotHighlightFilter === 'ALL' ? 'bg-blue-600 text-white font-black shadow-xs' : 'text-slate-400 hover:text-white'
                  }`}
                >
                  Todos ({totalRackSlots})
                </button>
                <button
                  onClick={() => setSlotHighlightFilter('OCCUPIED')}
                  className={`px-2.5 py-1 rounded-xl text-xs font-bold transition-all ${
                    slotHighlightFilter === 'OCCUPIED' ? 'bg-emerald-600 text-white font-black shadow-xs' : 'text-slate-400 hover:text-white'
                  }`}
                >
                  Ocupados ({currentRackOccupiedCount})
                </button>
                <button
                  onClick={() => setSlotHighlightFilter('FREE')}
                  className={`px-2.5 py-1 rounded-xl text-xs font-bold transition-all ${
                    slotHighlightFilter === 'FREE' ? 'bg-rose-600 text-white font-black shadow-xs' : 'text-slate-400 hover:text-white'
                  }`}
                >
                  Libres ({freeRackSlots})
                </button>
                {mixedCount > 0 && (
                  <button
                    onClick={() => setSlotHighlightFilter('MIXED')}
                    className={`px-2.5 py-1 rounded-xl text-xs font-bold transition-all ${
                      slotHighlightFilter === 'MIXED' ? 'bg-blue-700 text-white font-black shadow-xs' : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    Mixtos ({mixedCount})
                  </button>
                )}
                {expiringCount > 0 && (
                  <button
                    onClick={() => setSlotHighlightFilter('EXPIRING')}
                    className={`px-2.5 py-1 rounded-xl text-xs font-bold transition-all ${
                      slotHighlightFilter === 'EXPIRING' ? 'bg-amber-600 text-white font-black shadow-xs' : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    Próx. Vencer ({expiringCount})
                  </button>
                )}
              </div>

              {/* Right: Zoom Scale & Device Orientation Toggle */}
              <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
                
                {/* 🔍 Zoom Controls */}
                <div className="flex items-center bg-slate-950/90 border border-slate-800 rounded-xl p-0.5 shadow-2xs">
                  <button
                    onClick={() => setZoomScale(s => Math.max(0.65, +(s - 0.15).toFixed(2)))}
                    className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg active:scale-90 transition-all"
                    title="Alejar Zoom"
                  >
                    <ZoomOut className="w-3.5 h-3.5" />
                  </button>

                  <button
                    onClick={() => setZoomScale(1)}
                    className="px-2 py-1 text-[11px] font-mono font-bold text-slate-300 hover:text-white"
                    title="Restablecer 100%"
                  >
                    {Math.round(zoomScale * 100)}%
                  </button>

                  <button
                    onClick={() => setZoomScale(s => Math.min(1.45, +(s + 0.15).toFixed(2)))}
                    className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg active:scale-90 transition-all"
                    title="Acercar Zoom"
                  >
                    <ZoomIn className="w-3.5 h-3.5" />
                  </button>
                </div>

                {/* 🔄 Mobile Landscape Rotation Switcher (when on mobile/portrait) */}
                {isMobile && isPortrait && (
                  <button
                    onClick={() => setForceLandscapeRotation(!forceLandscapeRotation)}
                    className={`px-2.5 py-1.5 rounded-xl border text-xs font-black flex items-center gap-1.5 transition-all shadow-md active:scale-95 ${
                      forceLandscapeRotation
                        ? 'bg-blue-600 text-white border-blue-500 ring-2 ring-blue-400/40'
                        : 'bg-slate-800 text-slate-300 border-slate-700 hover:bg-slate-700'
                    }`}
                    title={forceLandscapeRotation ? 'Cambiar a modo vertical' : 'Forzar modo horizontal panorámico'}
                  >
                    <RotateCw className={`w-3.5 h-3.5 ${forceLandscapeRotation ? 'animate-spin-slow' : ''}`} />
                    <span className="hidden sm:inline">{forceLandscapeRotation ? 'Horizontal (90°)' : 'Vertical'}</span>
                    <span className="sm:hidden">{forceLandscapeRotation ? '90°' : 'Vert'}</span>
                  </button>
                )}

                {/* Close modal */}
                <button
                  onClick={() => {
                    setCurrentStep('RACKS_IN_CHAMBER');
                    setSelectedRack(null);
                  }}
                  className="p-1.5 text-slate-400 hover:text-white bg-slate-800/80 hover:bg-slate-700 border border-slate-700 rounded-xl transition-all shadow-xs active:scale-90"
                  title="Cerrar elevación"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

            </div>

            {/* 💡 Floating Mobile Orientation Helper Hint */}
            {isMobile && isPortrait && forceLandscapeRotation && (
              <div className="bg-gradient-to-r from-blue-900/90 to-indigo-900/90 border-b border-blue-800/60 px-3 py-1 text-[11px] font-bold text-blue-200 flex items-center justify-between shrink-0">
                <div className="flex items-center gap-1.5">
                  <Smartphone className="w-3.5 h-3.5 text-blue-400 rotate-90" />
                  <span>Modo Horizontal Activo · Mantén tu celular en posición cómoda o gira la pantalla</span>
                </div>
                <button 
                  onClick={() => setForceLandscapeRotation(false)}
                  className="text-[10px] uppercase font-black underline text-white hover:text-blue-200"
                >
                  Ver Vertical
                </button>
              </div>
            )}

            {/* 🖼️ GRAPHICAL ELEVATION MATRIX CANVAS (Touch Scroll & Sticky Levels) */}
            <div 
              ref={gridContainerRef}
              className="flex-1 overflow-auto custom-scrollbar bg-[#080d1a] p-2.5 sm:p-4 md:p-6"
              style={{
                WebkitOverflowScrolling: 'touch',
                touchAction: 'pan-x pan-y'
              }}
            >
              <div 
                className="flex flex-col gap-2.5 sm:gap-3 transition-transform origin-top-left pb-12"
                style={{
                  minWidth: `${Math.max(650, selectedRack.positionsPerLevel * (120 * zoomScale))}px`,
                }}
              >
                {/* 🔝 Top Positions Header Row (Sticky Header) */}
                <div className="flex items-center gap-2.5 sm:gap-3 sticky top-0 z-30 bg-[#080d1a]/95 backdrop-blur-xs py-1.5 border-b border-slate-800/80">
                  <div className="sticky left-0 z-40 w-16 sm:w-20 shrink-0 text-center text-[10px] font-black text-slate-500 uppercase tracking-widest bg-[#080d1a] shadow-xs">
                    NIVEL
                  </div>
                  <div 
                    className="flex-1 grid gap-2 sm:gap-2.5"
                    style={{
                      gridTemplateColumns: `repeat(${selectedRack.positionsPerLevel}, minmax(${110 * zoomScale}px, 1fr))`
                    }}
                  >
                    {Array.from({ length: selectedRack.positionsPerLevel }).map((_, pIdx) => (
                      <div key={pIdx} className="text-center text-[11px] font-mono font-black text-slate-400 tracking-wider">
                        POS-{pIdx + 1}
                      </div>
                    ))}
                  </div>
                </div>

                {/* Rows: From top level down to level 1 */}
                {Array.from({ length: selectedRack.levels }).map((_, levelIndex) => {
                  const levelNumber = selectedRack.levels - levelIndex;

                  return (
                    <div key={levelNumber} className="flex items-stretch gap-2.5 sm:gap-3 relative">
                      
                      {/* 📌 Sticky Level Label on the left */}
                      <div className="sticky left-0 z-20 w-16 sm:w-20 shrink-0 flex items-center justify-center bg-slate-950/95 backdrop-blur-xs border-r border-slate-800 rounded-l-2xl text-slate-200 font-black text-xs uppercase tracking-wider select-none shadow-md">
                        Nivel {levelNumber}
                      </div>

                      {/* Slots in this level */}
                      <div 
                        className="flex-1 grid gap-2 sm:gap-2.5"
                        style={{
                          gridTemplateColumns: `repeat(${selectedRack.positionsPerLevel}, minmax(${110 * zoomScale}px, 1fr))`
                        }}
                      >
                        {Array.from({ length: selectedRack.positionsPerLevel }).map((_, posIndex) => {
                          const positionNumber = posIndex + 1;
                          const item = getRackSlotItem(selectedRack, levelNumber, positionNumber);
                          const isBlocked = isRackSlotBlocked(selectedRack, levelNumber, positionNumber);
                          const isMixed = item ? (item.isMixed || item.lpn.startsWith('LPN-MIX')) : false;

                          // Check expiry status
                          let isCritical = false;
                          let isNearExp = false;
                          let expDisplay = 'SIN VENC';
                          if (item?.expirationDate) {
                            const today = new Date();
                            const exp = new Date(item.expirationDate);
                            const diffDays = Math.ceil((exp.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
                            if (diffDays <= 5) isCritical = true;
                            else if (diffDays <= 30) isNearExp = true;
                            expDisplay = item.expirationDate.split('-').slice(1).reverse().join('/');
                          }

                          // Filter dimming logic
                          let matchesFilter = true;
                          if (slotHighlightFilter === 'OCCUPIED' && !item) matchesFilter = false;
                          if (slotHighlightFilter === 'FREE' && item) matchesFilter = false;
                          if (slotHighlightFilter === 'MIXED' && !isMixed) matchesFilter = false;
                          if (slotHighlightFilter === 'EXPIRING' && !isCritical && !isNearExp) matchesFilter = false;

                          const filterDimClass = !matchesFilter ? 'opacity-20 grayscale scale-95' : 'opacity-100';

                          // Case 1: Slot is Blocked
                          if (isBlocked) {
                            return (
                              <div
                                key={positionNumber}
                                style={{ minHeight: `${100 * zoomScale}px` }}
                                className={`rounded-2xl bg-slate-800/60 border border-slate-700/80 p-2 sm:p-2.5 flex flex-col justify-between items-center text-center select-none shadow-xs transition-all ${filterDimClass}`}
                              >
                                <div className="w-full flex justify-between items-center text-[10px] font-mono text-slate-400 font-bold">
                                  <span>P-{positionNumber}</span>
                                  <Lock className="w-3.5 h-3.5 text-slate-400" />
                                </div>
                                <div className="text-[11px] font-black text-slate-400 uppercase tracking-tight">
                                  BLOQUEADO
                                </div>
                                <div className="text-[9px] font-bold text-slate-500 uppercase tracking-widest">
                                  NO DISPONIBLE
                                </div>
                              </div>
                            );
                          }

                          // Case 2: Slot is Empty / Available (Peach/Rose style from screenshot)
                          if (!item) {
                            return (
                              <div
                                key={positionNumber}
                                onClick={() => {
                                  setQuickAssignSlot({
                                    rack: selectedRack,
                                    level: levelNumber,
                                    position: positionNumber
                                  });
                                }}
                                style={{ minHeight: `${100 * zoomScale}px` }}
                                className={`rounded-2xl bg-[#fff1f2] border-2 border-rose-100 hover:border-rose-300 active:scale-95 p-2 sm:p-2.5 flex flex-col justify-between items-center text-center cursor-pointer transition-all shadow-xs group ${filterDimClass}`}
                                title={`Ubicación vacía Pasillo ${selectedRack.aisle}-R${selectedRack.id}-L${levelNumber}-P${positionNumber}. Clic para asignar.`}
                              >
                                <div className="w-full text-left text-[10px] font-mono font-black text-rose-400">
                                  P-{positionNumber}
                                </div>
                                
                                <div className="flex flex-col items-center gap-1 group-hover:scale-105 transition-transform">
                                  <PlusCircle className="w-5 h-5 sm:w-6 sm:h-6 text-rose-400/80 group-hover:text-rose-500" />
                                  <span className="text-[10px] sm:text-[11px] font-black text-rose-500 uppercase tracking-wider">
                                    (+) UBICAR
                                  </span>
                                </div>

                                <div className="text-[9px] font-extrabold text-rose-400/80 uppercase tracking-widest leading-none">
                                  DISPONIBLE
                                </div>
                              </div>
                            );
                          }

                          // Case 3: Slot is Occupied by Mixed Pallet (Blue with crimson border as in screenshot)
                          if (isMixed) {
                            const refsCount = item.mixedItems?.length || 0;
                            return (
                              <div
                                key={positionNumber}
                                onClick={() => setSelectedItemModal(item)}
                                style={{ minHeight: `${100 * zoomScale}px` }}
                                className={`rounded-2xl bg-[#2563eb] border-2 border-red-500 p-2 sm:p-2.5 flex flex-col justify-between text-white shadow-lg cursor-pointer transition-all active:scale-95 relative select-none ${filterDimClass}`}
                                title={`Pallet Mixto: ${item.lpn}`}
                              >
                                {/* Top Bar: Position & Tag */}
                                <div className="flex justify-between items-center text-[10px] font-mono font-black">
                                  <span className="bg-white/20 px-1.5 py-0.5 rounded">P-{positionNumber}</span>
                                  <span className="bg-red-500 text-white px-1.5 py-0.5 rounded text-[9px] font-black tracking-wider uppercase">
                                    MIX
                                  </span>
                                </div>

                                {/* Center: LPN & Refs */}
                                <div className="min-w-0">
                                  <div className="text-[11px] sm:text-xs font-mono font-black truncate text-white leading-tight">
                                    {item.lpn}
                                  </div>
                                  <div className="text-[9px] sm:text-[10px] font-extrabold text-blue-100 truncate mt-0.5">
                                    PALLET MIXTO ({refsCount} Refs)
                                  </div>
                                </div>

                                {/* Bottom: Quantity & Expiration */}
                                <div className="flex justify-between items-center text-[10px] font-mono font-black pt-1 border-t border-white/20">
                                  <span>{item.quantity} UN</span>
                                  <span className="bg-red-600/90 text-white px-1.5 py-0.5 rounded text-[9px] font-bold">
                                    {expDisplay}
                                  </span>
                                </div>
                              </div>
                            );
                          }

                          // Case 4: Slot is Occupied by Standard Product LPN (Mint Green Card from screenshot)
                          return (
                            <div
                              key={positionNumber}
                              onClick={() => setSelectedItemModal(item)}
                              style={{ minHeight: `${100 * zoomScale}px` }}
                              className={`rounded-2xl ${
                                isCritical 
                                  ? 'bg-red-500 text-white border-2 border-red-600 shadow-red-500/20' 
                                  : isNearExp
                                  ? 'bg-amber-100 text-slate-900 border-2 border-amber-400'
                                  : 'bg-[#dcfce7] text-slate-900 border border-emerald-400'
                              } p-2 sm:p-2.5 flex flex-col justify-between shadow-md cursor-pointer transition-all active:scale-95 select-none ${filterDimClass}`}
                              title={`${item.productName} (${item.lpn})`}
                            >
                              {/* Top Bar: Position & Unit tag */}
                              <div className="flex justify-between items-center text-[10px] font-mono font-black">
                                <span className={`${isCritical ? 'bg-white/20 text-white' : 'bg-slate-900/10 text-slate-800'} px-1.5 py-0.5 rounded`}>
                                  P-{positionNumber}
                                </span>
                                <span className={`${isCritical ? 'bg-white text-red-600' : 'bg-emerald-600 text-white'} px-1.5 py-0.5 rounded text-[9px] font-black uppercase`}>
                                  UN
                                </span>
                              </div>

                              {/* Center: SKU & Product Name */}
                              <div className="min-w-0">
                                <div className={`text-[10px] font-mono font-black truncate ${isCritical ? 'text-white' : 'text-emerald-800'}`}>
                                  {item.productCode || item.lpn}
                                </div>
                                <div className={`text-[10px] sm:text-[11px] font-extrabold truncate line-clamp-2 leading-tight ${isCritical ? 'text-white' : 'text-slate-900'}`}>
                                  {item.productName}
                                </div>
                              </div>

                              {/* Bottom: Quantity & Expiration */}
                              <div className={`flex justify-between items-center text-[10px] font-mono font-black pt-1 ${isCritical ? 'border-t border-white/20' : 'border-t border-emerald-200'}`}>
                                <span>{item.quantity} UN</span>
                                <span className={`px-1.5 py-0.5 rounded text-[9px] font-bold ${
                                  isCritical ? 'bg-white text-red-600 animate-pulse font-black' : 
                                  isNearExp ? 'bg-amber-400 text-slate-950 font-black' : 
                                  'text-emerald-900'
                                }`}>
                                  {expDisplay}
                                </span>
                              </div>
                            </div>
                          );
                        })}
                      </div>

                    </div>
                  );
                })}

                {/* Bottom Bays Footer Row */}
                <div className="flex items-center gap-2.5 sm:gap-3 pt-3 border-t border-slate-800">
                  <div className="sticky left-0 z-20 w-16 sm:w-20 shrink-0 text-center text-[10px] font-black text-slate-500 uppercase tracking-widest bg-[#080d1a]">
                    BAHÍAS
                  </div>
                  <div 
                    className="flex-1 grid gap-2 sm:gap-2.5"
                    style={{
                      gridTemplateColumns: `repeat(${selectedRack.positionsPerLevel}, minmax(${110 * zoomScale}px, 1fr))`
                    }}
                  >
                    {Array.from({ length: selectedRack.positionsPerLevel }).map((_, pIdx) => (
                      <div key={pIdx} className="text-center text-xs font-mono font-black text-slate-400 tracking-wider">
                        BAYA {pIdx + 1}
                      </div>
                    ))}
                  </div>
                </div>

              </div>
            </div>
          </div>
        );
      })()}

      {/* ------------------------------------------------------------- */}
      {/* 🔍 MODAL 1: LPN DETAILS MODAL (When clicking occupied slot)    */}
      {/* ------------------------------------------------------------- */}
      {selectedItemModal && (
        <div className="fixed inset-0 z-50 bg-slate-950/70 backdrop-blur-sm flex items-center justify-center p-3 animate-fade-in">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-5 sm:p-6 w-full max-w-lg shadow-2xl space-y-4 max-h-[90vh] overflow-y-auto custom-scrollbar">
            
            {/* Modal Header */}
            <div className="flex justify-between items-start pb-3 border-b border-slate-100 dark:border-slate-800">
              <div className="space-y-0.5">
                <span className="text-[10px] font-black uppercase px-2 py-0.5 rounded-full bg-blue-100 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300">
                  Detalle de Pallet Rackeado
                </span>
                <h3 className="text-lg font-mono font-black text-slate-900 dark:text-white flex items-center gap-2">
                  <span>{selectedItemModal.lpn}</span>
                  <button
                    onClick={() => {
                      navigator.clipboard.writeText(selectedItemModal.lpn);
                      showToast('info', 'LPN copiado al portapapeles');
                    }}
                    className="text-slate-400 hover:text-blue-600 p-1"
                    title="Copiar LPN"
                  >
                    <Copy className="w-3.5 h-3.5" />
                  </button>
                </h3>
              </div>

              <button
                onClick={() => setSelectedItemModal(null)}
                className="p-1 text-slate-400 hover:text-slate-700 dark:hover:text-white rounded-lg transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Product Details Grid */}
            <div className="bg-slate-50 dark:bg-slate-800/60 p-4 rounded-2xl border border-slate-100 dark:border-slate-800 space-y-2.5">
              <div>
                <div className="text-[10px] font-black text-slate-400 uppercase">Producto</div>
                <div className="text-sm font-black text-slate-900 dark:text-white">
                  {selectedItemModal.productName}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3 pt-2 border-t border-slate-200/60 dark:border-slate-700/60 text-xs">
                <div>
                  <span className="text-[10px] font-black text-slate-400 uppercase block">Código SKU</span>
                  <span className="font-mono font-black text-slate-800 dark:text-slate-200">
                    {selectedItemModal.productCode || 'N/A'}
                  </span>
                </div>
                <div>
                  <span className="text-[10px] font-black text-slate-400 uppercase block">Cantidad</span>
                  <span className="font-mono font-black text-blue-600 dark:text-blue-400 text-sm">
                    {selectedItemModal.quantity} UN
                  </span>
                </div>
                <div>
                  <span className="text-[10px] font-black text-slate-400 uppercase block">Vencimiento</span>
                  <span className="font-mono font-bold text-slate-800 dark:text-slate-200">
                    {selectedItemModal.expirationDate || 'SIN FECHA'}
                  </span>
                </div>
                <div>
                  <span className="text-[10px] font-black text-slate-400 uppercase block">Ubicación Actual</span>
                  <span className="font-mono font-black text-slate-800 dark:text-slate-200">
                    {selectedItemModal.location 
                      ? `Pasillo ${selectedItemModal.location.aisle}-R${selectedItemModal.location.rackId}-L${selectedItemModal.location.level}-P${selectedItemModal.location.position}`
                      : 'Sin Ubicación'
                    }
                  </span>
                </div>
              </div>

              {/* If Mixed Pallet: List items */}
              {selectedItemModal.isMixed && selectedItemModal.mixedItems && selectedItemModal.mixedItems.length > 0 && (
                <div className="pt-2 border-t border-slate-200/60 dark:border-slate-700/60 space-y-1.5">
                  <div className="text-[10px] font-black text-slate-400 uppercase">Productos en Pallet Mixto ({selectedItemModal.mixedItems.length})</div>
                  <div className="max-h-36 overflow-y-auto space-y-1 custom-scrollbar">
                    {selectedItemModal.mixedItems.map((mItem: any, idx: number) => (
                      <div key={idx} className="flex justify-between items-center text-xs bg-white dark:bg-slate-900 p-2 rounded-xl border border-slate-200/60 dark:border-slate-700">
                        <span className="font-bold text-slate-800 dark:text-slate-200 truncate pr-2">{mItem.productName || mItem.codigo}</span>
                        <span className="font-mono font-black text-blue-600 shrink-0">{mItem.units || mItem.unidades || mItem.quantity} UN</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Actions: Bajar a Picking / Cerrar */}
            <div className="flex items-center gap-2 pt-2">
              {onMoveToPicking && (
                <button
                  type="button"
                  onClick={() => handlePerformMoveToPicking(selectedItemModal.lpn)}
                  className="flex-1 py-2.5 px-4 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-black flex items-center justify-center gap-1.5 transition-all shadow-md active:scale-95"
                >
                  <Package className="w-4 h-4" />
                  <span>Bajar a Picking</span>
                </button>
              )}

              <button
                type="button"
                onClick={() => setSelectedItemModal(null)}
                className="py-2.5 px-4 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300 rounded-xl text-xs font-bold transition-all"
              >
                Cerrar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ------------------------------------------------------------- */}
      {/* ⚡ MODAL 2: QUICK ASSIGN MODAL (When clicking empty slot)     */}
      {/* ------------------------------------------------------------- */}
      {quickAssignSlot && (
        <div className="fixed inset-0 z-50 bg-slate-950/70 backdrop-blur-sm flex items-center justify-center p-3 animate-fade-in">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-5 sm:p-6 w-full max-w-xl shadow-2xl space-y-4 max-h-[90vh] overflow-y-auto custom-scrollbar">
            
            <div className="flex justify-between items-start pb-3 border-b border-slate-100 dark:border-slate-800">
              <div>
                <span className="text-[10px] font-black uppercase px-2 py-0.5 rounded-full bg-amber-100 text-amber-800">
                  ⚡ Asignación Visual de Pallet
                </span>
                <h3 className="text-base font-black text-slate-900 dark:text-white mt-1">
                  Ubicando en Pasillo {quickAssignSlot.rack.aisle} · Estante {quickAssignSlot.rack.id} · Nivel {quickAssignSlot.level} · Posición {quickAssignSlot.position}
                </h3>
              </div>

              <button
                onClick={() => setQuickAssignSlot(null)}
                className="p-1 text-slate-400 hover:text-slate-700 dark:hover:text-white rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Search within pending items */}
            <div className="relative">
              <input
                type="text"
                placeholder="Filtrar pallets pendientes por LPN o producto..."
                value={quickAssignSearch}
                onChange={e => setQuickAssignSearch(e.target.value)}
                className="w-full pl-8 pr-7 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-bold text-slate-900 dark:text-white placeholder:text-slate-400 outline-none focus:border-blue-500"
              />
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
            </div>

            {/* Pending LPNs List */}
            {pendingItems.length === 0 ? (
              <div className="bg-slate-50 dark:bg-slate-800 p-8 rounded-2xl border border-dashed border-slate-200 dark:border-slate-700 text-center text-slate-400 space-y-2">
                <Package className="w-10 h-10 mx-auto opacity-30" />
                <p className="text-xs font-black uppercase">No hay pallets pendientes de ubicar</p>
                <p className="text-[11px] text-slate-400">Todos los LPNs registrados ya tienen ubicación asignada o están en picking.</p>
              </div>
            ) : (
              <div className="space-y-2 max-h-[300px] overflow-y-auto custom-scrollbar pr-1">
                {pendingItems
                  .filter(item => {
                    if (!quickAssignSearch.trim()) return true;
                    const q = quickAssignSearch.toLowerCase().trim();
                    return item.lpn.toLowerCase().includes(q) || (item.productName && item.productName.toLowerCase().includes(q));
                  })
                  .map(item => (
                    <div
                      key={item.lpn}
                      onClick={() => handlePerformQuickAssign(item)}
                      className="p-3 bg-white dark:bg-slate-800 hover:bg-blue-50/60 dark:hover:bg-blue-950/40 border border-slate-200 dark:border-slate-700 hover:border-blue-500 rounded-2xl cursor-pointer transition-all flex items-center justify-between gap-3 shadow-2xs group"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span className="font-mono font-black text-xs text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-950/60 px-2 py-0.5 rounded">
                            {item.lpn}
                          </span>
                          <span className="text-[10px] font-mono text-slate-400">{item.productCode}</span>
                        </div>
                        <div className="text-xs font-black text-slate-800 dark:text-slate-200 truncate mt-1">
                          {item.productName}
                        </div>
                        <div className="flex items-center gap-3 text-[10px] font-mono font-bold text-slate-500 mt-0.5">
                          <span>Cant: <strong className="text-slate-700 dark:text-slate-300">{item.quantity} UN</strong></span>
                          <span>Vence: <strong className="text-slate-700 dark:text-slate-300">{item.expirationDate || 'SIN FECHA'}</strong></span>
                        </div>
                      </div>

                      <button
                        type="button"
                        className="px-3 py-1.5 bg-blue-600 group-hover:bg-blue-700 text-white rounded-xl text-xs font-black flex items-center gap-1 shrink-0 shadow-2xs transition-all"
                      >
                        <span>Ubicar Aquí</span>
                        <ArrowRight className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ))}
              </div>
            )}
          </div>
        </div>
      )}

    </div>
  );
};
