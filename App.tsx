
import React, { useState, useEffect } from 'react';
import Reception from './components/Reception';
import LaiveModule from './components/LaiveModule';
import Layout from './components/Layout';
import Configuration from './components/Configuration';
import InventoryList from './components/InventoryList';
import ArticleMaster from './components/ArticleMaster';
import Samples from './components/Samples';
import DispatchProvince from './components/DispatchProvince';
import Orchestrator from './components/Orchestrator';
import ReverseLogistics from './components/ReverseLogistics';
import Login from './components/Login';
import UserManagement from './components/UserManagement';
import BranchManagement from './components/BranchManagement';
import BulkImport from './components/BulkImport';
import CountHistory from './components/CountHistory';
import Monitor from './components/Monitor';
import Conciliation from './components/Conciliation';
import DifferenceHistoryView from './components/DifferenceHistory';
import Mermas from './components/Mermas';
import Metrics from './components/Metrics';
import ReceptionLaive from './components/ReceptionLaive';
import { Rotulado } from './components/Rotulado';
import { TvuReport } from './components/TvuReport';
import { Cortes } from './components/Cortes';
import { Clientes } from './components/Clientes';
import { AlertsReviewModal } from './components/AlertsReviewModal';
import { PendientesModal } from './components/PendientesModal';
import { ImpUbicaciones } from './components/ImpUbicaciones';
import AfternoonCar from './components/AfternoonCar';
import AfternoonMonitor from './components/AfternoonMonitor';
import { CapturaEan } from './components/CapturaEan';
import { AlertMonitor } from './components/AlertMonitor';
import { InventoryItem, Rack, Zone, ViewState, Slot, RackLocation, Product, Task, Usuario, StocktakeRecord, ZoneType } from './types';
import { LayoutGrid, ArrowDownToLine, Settings, ClipboardList, Database, Beaker, Tag, Truck, ListChecks, Menu, XCircle, Sun, Moon, RefreshCw, ChevronRight, User, Upload, History as HistoryIcon, Monitor as MonitorIcon, Scale, Trash2, FileCheck, ChevronUp, ChevronDown, Package, TrendingUp, Building2, Bell, Printer, CheckCircle } from './components/Icons';
import { supabase } from './supabaseClient';

const LOGO_URL = 'https://iili.io/fsmAapV.png';
const APP_VERSION = '2.0.0'; // Versión actual de la aplicación

const VersionModal: React.FC<{ isOpen: boolean; minVersion: string }> = ({ isOpen, minVersion }) => {
    if (!isOpen) return null;

    const handleHardReload = async () => {
        try {
            // 1. Intentar desregistrar Service Workers para romper el cache de PWA
            if ('serviceWorker' in navigator) {
                const registrations = await navigator.serviceWorker.getRegistrations();
                for (const registration of registrations) {
                    await registration.unregister();
                }
            }
            
            // 2. Limpiar cache del navegador si es posible (Cache Storage API)
            if ('caches' in window) {
                const cacheNames = await caches.keys();
                for (const name of cacheNames) {
                    await caches.delete(name);
                }
            }

            // 3. Forzar redirección con un query param único para ignorar el cache del servidor/CDN
            const url = new URL(window.location.href);
            url.searchParams.set('v', Date.now().toString());
            window.location.assign(url.toString());
        } catch (e) {
            console.error("Error forcing reload", e);
            window.location.reload();
        }
    };

    return (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/90 backdrop-blur-md p-4 text-center">
            <div className="bg-white dark:bg-slate-900 rounded-3xl shadow-2xl p-8 max-w-sm w-full border border-slate-200 dark:border-slate-800 transform transition-all animate-in fade-in zoom-in duration-300">
                <div className="w-20 h-20 bg-amber-100 dark:bg-amber-900/30 rounded-full flex items-center justify-center mx-auto mb-6 text-amber-600">
                    <RefreshCw className="w-10 h-10 animate-spin-slow" />
                </div>
                <h2 className="text-2xl font-black text-slate-900 dark:text-white mb-2 uppercase tracking-tighter">
                    Nueva Versión
                </h2>
                <p className="text-sm text-slate-600 dark:text-slate-400 mb-6 leading-relaxed">
                    Hay cambios importantes en el sistema. Es necesario actualizar para evitar errores de sincronización.
                </p>
                
                <div className="flex flex-col gap-3 mb-8">
                    <div className="flex justify-between items-center px-4 py-2 bg-slate-50 dark:bg-slate-800 rounded-xl">
                        <span className="text-[10px] font-bold text-slate-400 uppercase">Actual</span>
                        <span className="text-xs font-black text-slate-600 dark:text-slate-300">{APP_VERSION}</span>
                    </div>
                    <div className="flex justify-between items-center px-4 py-2 bg-emerald-50 dark:bg-emerald-900/20 rounded-xl">
                        <span className="text-[10px] font-bold text-emerald-500 uppercase">Requerida</span>
                        <span className="text-xs font-black text-emerald-600">{minVersion}</span>
                    </div>
                </div>

                <button 
                    onClick={handleHardReload}
                    className="w-full bg-[#009ED6] hover:bg-[#008cb8] text-white font-black py-4 px-6 rounded-2xl transition-all shadow-lg shadow-blue-500/25 active:scale-95 flex items-center justify-center gap-3 uppercase text-xs tracking-widest"
                >
                    <RefreshCw className="w-4 h-4" />
                    Actualizar Ahora
                </button>
                
                <p className="mt-6 text-[9px] text-slate-400 font-medium italic">
                    Si el mensaje persiste, cierre la aplicación y vuelva a abrirla.
                </p>
            </div>
        </div>
    );
};

const createSlots = (aisle: string, rackId: number, levels: number, positions: number): Slot[] => {
    const slots: Slot[] = [];
    for (let l = 1; l <= levels; l++) {
        for (let p = 1; p <= positions; p++) {
            slots.push({
                id: `${aisle}${rackId}-${l}-${p}`,
                location: { aisle, rackId, level: l, position: p },
                status: 'empty',
                isBlocked: false
            });
        }
    }
    return slots;
};

const getLocalDateString = (d: Date = new Date()) => {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const INITIAL_ZONES: Zone[] = [
    { id: 'zone-1', name: 'Cámara Seca A', type: 'SECO' },
    { id: 'zone-2', name: 'Cámara Refrigerada', type: 'REFRIGERADO' },
];

const INITIAL_RACKS: Rack[] = [
  { id: 1, zoneId: 'zone-1', aisle: 'A', levels: 6, positionsPerLevel: 9, slots: createSlots('A', 1, 6, 9) },
  { id: 2, zoneId: 'zone-1', aisle: 'A', levels: 6, positionsPerLevel: 9, slots: createSlots('A', 2, 6, 9) },
  { id: 3, zoneId: 'zone-1', aisle: 'B', levels: 6, positionsPerLevel: 9, slots: createSlots('B', 3, 6, 9) },
  { id: 4, zoneId: 'zone-2', aisle: 'C', levels: 5, positionsPerLevel: 8, slots: createSlots('C', 4, 5, 8) }, 
];

const App: React.FC = () => {
  const [view, setView] = useState<ViewState>(ViewState.ORCHESTRATOR);
  const [expandedMenus, setExpandedMenus] = useState<Set<string>>(new Set(['RECEPTION']));
  const [isDarkMode, setIsDarkMode] = useState<boolean>(() => localStorage.getItem('smartwms_darkmode') === 'true');
  const [inventory, setInventory] = useState<InventoryItem[]>([]);
  const [tasks, setTasks] = useState<Task[]>(() => {
    try {
      const saved = localStorage.getItem('smartwms_tasks');
      return saved ? JSON.parse(saved) : [];
    } catch (e) {
      return [];
    }
  });

  useEffect(() => {
    localStorage.setItem('smartwms_tasks', JSON.stringify(tasks));
  }, [tasks]);

  const handleAddTask = (task: Task) => {
    setTasks(prev => [task, ...prev]);
  };

  const handleTaskDone = (taskId: string, user: string) => {
    setTasks(prev => prev.map(t => {
      if (t.id === taskId) {
        const history = t.history || [];
        return {
          ...t,
          status: 'REALIZADO' as const,
          completedAt: new Date().toISOString(),
          completedBy: user,
          history: [
            ...history,
            {
              action: 'REALIZADO',
              user,
              timestamp: new Date().toISOString(),
              comment: 'Completado desde el panel de control'
            }
          ]
        };
      }
      return t;
    }));
  };

  const handleTaskReschedule = (taskId: string, newDate: string, newTime: string, user: string, comment?: string) => {
    setTasks(prev => prev.map(t => {
      if (t.id === taskId) {
        const history = t.history || [];
        return {
          ...t,
          scheduledDate: newDate,
          alertTime: newTime,
          triggeredAlert: false, // Reset trigger flag to allow alarm again
          history: [
            ...history,
            {
              action: 'REPROGRAMADO',
              user,
              timestamp: new Date().toISOString(),
              comment: comment || `Reprogramado para el ${newDate} a las ${newTime}`
            }
          ]
        };
      }
      return t;
    }));
  };

  const handleTaskCancel = (taskId: string, user: string, comment?: string) => {
    setTasks(prev => prev.map(t => {
      if (t.id === taskId) {
        const history = t.history || [];
        return {
          ...t,
          status: 'CANCELADO' as const,
          canceledAt: new Date().toISOString(),
          canceledBy: user,
          canceledComment: comment,
          history: [
            ...history,
            {
              action: 'CANCELADO',
              user,
              timestamp: new Date().toISOString(),
              comment: comment || 'Cancelado por el operador'
            }
          ]
        };
      }
      return t;
    }));
  };

  const handleDeleteTask = (taskId: string) => {
    setTasks(prev => prev.filter(t => t.id !== taskId));
  };
  const [racks, setRacks] = useState<Rack[]>(INITIAL_RACKS);
  const [zones, setZones] = useState<Zone[]>(INITIAL_ZONES);
  const [pendingXmlData, setPendingXmlData] = useState<any>(null);
  const [sequenceCounter, setSequenceCounter] = useState(150);
  const [mixedSequenceCounter, setMixedSequenceCounter] = useState(1);
  const [catalog, setCatalog] = useState<Product[]>([]);
  const [isConnecting, setIsConnecting] = useState(true);
  const [currentUser, setCurrentUser] = useState<Usuario | null>(() => {
      try {
          const saved = localStorage.getItem('smartwms_user');
          const loginTime = localStorage.getItem('smartwms_login_time');
          
          if (saved) {
              const userObj = JSON.parse(saved);
              if (userObj.rol === 'ASISTENTE' && userObj.permisos?.es_campana_alertas) {
                  userObj.rol = 'ALERTAS';
              }
              if (userObj.rol === 'ALERTAS') {
                  return userObj;
              }
              if (loginTime) {
                  const now = Date.now();
                  const thirtyMinutes = 30 * 60 * 1000;
                  if (now - parseInt(loginTime) > thirtyMinutes) {
                      localStorage.removeItem('smartwms_user');
                      localStorage.removeItem('smartwms_login_time');
                      return null;
                  }
              }
              return userObj;
          }
          return null;
      } catch (e) {
          console.error("Error parsing user from localStorage", e);
          return null;
      }
  });

  const [customAlertSound, setCustomAlertSound] = useState<string | null>(null);

  useEffect(() => {
    const loadSound = async () => {
      if (currentUser?.sede_id) {
        try {
          const { data } = await supabase
            .from('sedes')
            .select('sonido_alerta')
            .eq('id', currentUser.sede_id)
            .single();
          if (data?.sonido_alerta) {
            setCustomAlertSound(data.sonido_alerta);
          } else {
            setCustomAlertSound(null);
          }
        } catch (err) {
          setCustomAlertSound(null);
        }
      } else {
        setCustomAlertSound(null);
      }
    };
    loadSound();
  }, [currentUser]);

  const handleLogout = () => {
    localStorage.removeItem('smartwms_user');
    localStorage.removeItem('smartwms_login_time');
    setCurrentUser(null);
    setView(ViewState.ORCHESTRATOR);
  };

  // Session Timeout Logic (30 minutes of inactivity)
  useEffect(() => {
    if (!currentUser || currentUser.rol === 'ALERTAS') return;

    let timeoutId: NodeJS.Timeout;
    const TIMEOUT_DURATION = 30 * 60 * 1000; // 30 minutes

    const resetTimer = () => {
      if (timeoutId) clearTimeout(timeoutId);
      timeoutId = setTimeout(() => {
        handleLogout();
        alert("Su sesión ha expirado por inactividad. Por favor, inicie sesión nuevamente.");
      }, TIMEOUT_DURATION);
      
      // Also update login time in localStorage to persist across refreshes if active
      localStorage.setItem('smartwms_login_time', Date.now().toString());
    };

    // Events to track activity
    const events = ['mousedown', 'mousemove', 'keypress', 'scroll', 'touchstart'];
    events.forEach(event => document.addEventListener(event, resetTimer));

    resetTimer(); // Initial start

    return () => {
      if (timeoutId) clearTimeout(timeoutId);
      events.forEach(event => document.removeEventListener(event, resetTimer));
    };
  }, [currentUser]);
  const [isSidebarOpen, setIsSidebarOpen] = useState(window.innerWidth > 768);
  const [minVersionRequired, setMinVersionRequired] = useState<string | null>(null);
  const [isVersionOutdated, setIsVersionOutdated] = useState(false);
  const [receptionsAlerts, setReceptionsAlerts] = useState<any[]>([]);
  const [showAlertsReviewModal, setShowAlertsReviewModal] = useState(false);
  const [showPendientesModal, setShowPendientesModal] = useState(false);

  const receptionsAlertsCount = receptionsAlerts.filter((a: any) => {
    if (a.estado !== undefined) {
      return a.estado === 'PENDIENTE';
    }
    return !a.recepcionado;
  }).length;

  // Accordion categories collapse state
  const [expandedCategories, setExpandedCategories] = useState<Record<string, boolean>>(() => {
    try {
        const stored = localStorage.getItem('smartrack_expanded_categories');
        if (stored) return JSON.parse(stored);
    } catch (e) {}
    return {
        'OPERACIONES': true,
        'CONTROL_INVENTARIO': true,
        'MONITOREO_METRICAS': true,
        'ADMINISTRACION': true
    };
  });

  const toggleCategory = (categoryId: string) => {
    setExpandedCategories(prev => {
      const updated = { ...prev, [categoryId]: !prev[categoryId] };
      localStorage.setItem('smartrack_expanded_categories', JSON.stringify(updated));
      return updated;
    });
  };

  // VERSION CHECK LOGIC
  const checkAppVersion = async () => {
    try {
        const { data, error } = await supabase
            .from('configuracion_sistema')
            .select('valor')
            .eq('id', 'min_version_required')
            .single();
        
        if (error) {
            console.error("Error checking app version:", error);
            return;
        }

        if (data && data.valor) {
            setMinVersionRequired(data.valor);
            
            // Basic semver comparison (1.0.1 vs 1.0.2)
            const convertToNumber = (v: string) => {
                const parts = v.split('.');
                // Asegurar que siempre tenga 3 partes para comparar correctamente (e.g. 1.02 -> 1.0.2)
                const major = parseInt(parts[0]) || 0;
                const minor = parseInt(parts[1]) || 0;
                const patch = parseInt(parts[2]) || 0;
                return major * 10000 + minor * 100 + patch;
            };
            
            const currentNum = convertToNumber(APP_VERSION);
            const reqNum = convertToNumber(data.valor);

            if (currentNum < reqNum) {
                console.warn(`App version outdated. Current: ${APP_VERSION}, Required: ${data.valor}`);
                setIsVersionOutdated(true);
            }
        }
    } catch (e) {
        console.error("Critical error in version check", e);
    }
  };

  // FETCH DATA FROM SUPABASE ON MOUNT
  const loadInitialData = async () => {
      if (!currentUser?.sede_id) {
          console.warn("User has no branch assigned");
          setIsConnecting(false);
          return;
      }

      try {
          setIsConnecting(true);
          const currentSedeId = currentUser.sede_id;

          // Load Zones
          const { data: zonesData, error: zonesError } = await supabase
              .from('zonas')
              .select('*')
              .eq('sede_id', currentSedeId);
          if (zonesError) throw zonesError;
          const mappedZones: Zone[] = zonesData.map(z => ({
              id: String(z.id),
              name: z.nombre,
              type: z.tipo as ZoneType
          }));
          setZones(mappedZones);

          // Load Racks (Estantes) with their Locations (Ubicaciones)
          const { data: estantesData, error: estantesError } = await supabase
              .from('estantes')
              .select('*, ubicaciones(*)')
              .eq('sede_id', currentSedeId)
              .order('pasillo', { ascending: true })
              .order('id', { ascending: true });
          if (estantesError) throw estantesError;
          
          const mappedRacks: Rack[] = estantesData.map((e, index) => {
              const rackId = index + 1;
              
              // Sort locations by level and position for consistency
              const dbUbicaciones = e.ubicaciones ? [...e.ubicaciones].sort((a, b) => {
                  if (a.nivel !== b.nivel) return a.nivel - b.nivel;
                  return a.posicion - b.posicion;
              }) : [];

                  const slots: Slot[] = dbUbicaciones.length > 0 
                  ? dbUbicaciones.map((u: any) => ({
                      id: u.codigo_ubicacion,
                      dbId: u.id,
                      location: { aisle: e.pasillo, rackId, level: u.nivel, position: u.posicion },
                      status: (u.estado === 'OCUPADO' ? 'occupied' : u.esta_bloqueado ? 'blocked' : 'empty') as 'occupied' | 'blocked' | 'empty',
                      isBlocked: u.esta_bloqueado
                  }))
                  : createSlots(e.pasillo, rackId, e.niveles, e.posiciones_por_nivel);

              return {
                  id: rackId,
                  dbId: e.id,
                  zoneId: e.zona_id ? String(e.zona_id) : (mappedZones.length > 0 ? mappedZones[0].id : 'zone-1'),
                  aisle: e.pasillo,
                  levels: e.niveles,
                  positionsPerLevel: e.posiciones_por_nivel,
                  slots: slots
              };
          });
          setRacks(mappedRacks);

          // Load Catalog with minimal columns for the main view
          let allProducts: Product[] = [];
          let from = 0;
          let to = 999;
          let hasMore = true;
          const pageSize = 1000;
          // Only columns needed for the app's general operation
          let productColumns = 'id, codigo, sku, nombre, categoria, marca, unidad_venta, unidades_por_caja, cajas_por_palet, requiere_pesaje, zona_predeterminada, es_seco, es_refrigerado, es_congelado, es_peso, tvm_dias, vida_util_dias, peso_unitario, unidad_medida_sap, unidad_compra, factor_unidad, factor_inventario, usa_control_tara, peso_tara_caja_std, peso_tara_pallet_std, foto_uno, foto_dos, extranjero, venta_media, ean_bulto, camara_texto, tvu_promesa, ventas_semanal, multiplo';

          while (hasMore) {
              let { data, error } = await supabase
                .from('productos')
                .select(productColumns)
                .range(from, to);
              
              if (error) {
                  // Fallback in case 'multiplo' column is not yet present on products table
                  if (error.message && error.message.includes('multiplo')) {
                      console.warn("Column 'multiplo' not found in database. Retrying query without it.");
                      productColumns = 'id, codigo, sku, nombre, categoria, marca, unidad_venta, unidades_por_caja, cajas_por_palet, requiere_pesaje, zona_predeterminada, es_seco, es_refrigerado, es_congelado, es_peso, tvm_dias, vida_util_dias, peso_unitario, unidad_medida_sap, unidad_compra, factor_unidad, factor_inventario, usa_control_tara, peso_tara_caja_std, peso_tara_pallet_std, foto_uno, foto_dos, extranjero, venta_media, ean_bulto, camara_texto, tvu_promesa, ventas_semanal';
                      const retryResult = await supabase
                        .from('productos')
                        .select(productColumns)
                        .range(from, to);
                      if (retryResult.error) throw retryResult.error;
                      data = retryResult.data;
                  } else {
                      throw error;
                  }
              }

              if (data && data.length > 0) {
                  const mapped = data.map((p: any) => ({
                      ...p,
                      multiplo: p.multiplo !== undefined ? p.multiplo : null
                  }));
                  allProducts = [...allProducts, ...mapped];
                  if (data.length < pageSize) hasMore = false;
                  else { from += pageSize; to += pageSize; }
              } else hasMore = false;
          }
          setCatalog(allProducts);

          // Load Inventory (Paletas LPN) - Only ACTIVE items
          let allInv: any[] = [];
          from = 0;
          to = 999;
          hasMore = true;
          // Only columns needed for the inventory list
          const invColumns = 'lpn, producto_id, cantidad_total, fecha_vencimiento_critica, fecha_recepcion, recibido_por, es_mixto, ubicacion_id, generado, estado_lpn, ubicaciones(id, nivel, posicion, estantes(id, pasillo))';

          while (hasMore) {
              const { data: invData, error: invError } = await supabase
                .from('paletas_lpn')
                .select(invColumns)
                .eq('estado', 'ACTIVO')
                .eq('sede_id', currentSedeId)
                .range(from, to);
              if (invError) throw invError;
              
              if (invData && invData.length > 0) {
                  // Fetch items for mixed pallets separately to avoid PGRST200 error
                  const mixedLpns = invData.filter(d => d.es_mixto).map(d => d.lpn);
                  let allItems: any[] = [];
                  if (mixedLpns.length > 0) {
                      const { data: itemsData, error: itemsError } = await supabase
                          .from('paletas_lpn_items')
                          .select('*')
                          .in('lpn', mixedLpns);
                      if (!itemsError && itemsData) {
                          allItems = itemsData;
                      }
                  }

                  const mappedInv = invData.map(d => {
                      // Find product in catalog to get name and code
                      const product = allProducts.find(p => p.id === d.producto_id);
                      const palletItems = allItems.filter(item => item.lpn === d.lpn);
                      
                      // Handle singular vs array response from Supabase joins
                      const ubicacion = Array.isArray(d.ubicaciones) ? d.ubicaciones[0] : d.ubicaciones;
                      
                      // CRITICAL: Robust Rack Identification
                      let estanteIdFromDB = null;
                      if (ubicacion && ubicacion.estantes) {
                          if (Array.isArray(ubicacion.estantes)) {
                              estanteIdFromDB = ubicacion.estantes[0]?.id;
                          } else {
                              estanteIdFromDB = (ubicacion.estantes as any).id;
                          }
                      }

                      // Find which of our mapped racks corresponds to this DB ID
                      const foundRack = mappedRacks.find(r => r.dbId === estanteIdFromDB);

                      return {
                          lpn: d.lpn,
                          productId: d.producto_id,
                          productName: product?.nombre || (d.es_mixto ? `PALLET MIXTO (${palletItems.length} Refs)` : 'Desconocido'),
                          productCode: product?.codigo || (d.es_mixto ? 'MIXED-PALLET' : 'N/A'),
                          quantity: d.cantidad_total,
                          expirationDate: d.fecha_vencimiento_critica,
                          receptionDate: d.fecha_recepcion,
                          receivedBy: d.recibido_por,
                          qrCodeUrl: `https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${d.lpn}`,
                          photoUrl: '', 
                          isMixed: d.es_mixto,
                          mixedItems: palletItems.map((mi: any) => ({
                              productId: mi.producto_id,
                              productCode: mi.codigo,
                              productName: mi.nombre,
                              quantity: mi.cantidad,
                              expirationDate: mi.fecha_vencimiento
                          })),
                          locationId: d.ubicacion_id,
                          location: ubicacion && foundRack ? { 
                              id: ubicacion.id,
                              aisle: foundRack.aisle,
                              rackId: foundRack.id, 
                              level: ubicacion.nivel,
                              position: ubicacion.posicion
                          } : null,
                          generado: (d as any).generado,
                          fecha_generado: (d as any).fecha_generado,
                          usuario_generado: (d as any).usuario_generado,
                          estado_lpn: (d as any).estado_lpn || ((d as any).generado ? 'GENERADO' : 'PENDIENTE')
                      };
                  });
                  allInv = [...allInv, ...mappedInv];
                  
                  // Update sequence counter based on max LPN in this chunk
                  const maxSeq = invData.reduce((max, item) => {
                      if (item.lpn.startsWith('LPN')) {
                          const seq = parseInt(item.lpn.replace('LPN', ''));
                          return seq > max ? seq : max;
                      }
                      return max;
                  }, 150);
                  setSequenceCounter(prev => Math.max(prev, maxSeq + 1));

                  const maxMixedSeq = invData.reduce((max, item) => {
                      if (item.lpn.startsWith('MIX')) {
                          const seq = parseInt(item.lpn.replace('MIX', ''));
                          return seq > max ? seq : max;
                      }
                      return max;
                  }, 0);
                  setMixedSequenceCounter(prev => Math.max(prev, maxMixedSeq + 1));

                  if (invData.length < pageSize) hasMore = false;
                  else { from += pageSize; to += pageSize; }
              } else hasMore = false;
          }
          setInventory(allInv as any);

      } catch (err) {
          console.error('Error cargando datos desde Supabase:', err);
      } finally {
          setIsConnecting(false);
      }
  };

  useEffect(() => {
    checkAppVersion();
    if (currentUser?.sede_id) {
        loadInitialData();
    } else if (currentUser) {
        setIsConnecting(false);
    }

    const versionInterval = setInterval(checkAppVersion, 5 * 60 * 1000);
    return () => clearInterval(versionInterval);
  }, [currentUser?.sede_id]);

  const audioCtxRef = React.useRef<AudioContext | null>(null);

  // Initialize and resume AudioContext on first user click/interaction to comply with modern browser autoplay policies
  useEffect(() => {
    const unlockAudio = () => {
      try {
        if (!audioCtxRef.current) {
          audioCtxRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
        }
        if (audioCtxRef.current && audioCtxRef.current.state === 'suspended') {
          audioCtxRef.current.resume();
        }
      } catch (e) {
        console.warn("Failed to unlock AudioContext:", e);
      }
    };

    window.addEventListener('click', unlockAudio, { passive: true });
    window.addEventListener('keydown', unlockAudio, { passive: true });
    window.addEventListener('touchstart', unlockAudio, { passive: true });

    return () => {
      window.removeEventListener('click', unlockAudio);
      window.removeEventListener('keydown', unlockAudio);
      window.removeEventListener('touchstart', unlockAudio);
    };
  }, []);

  // Robust offline-safe two-tone alarm beep synthesis using Web Audio API
  const playWebAudioAlertSound = React.useCallback(() => {
    try {
      if (!audioCtxRef.current) {
        audioCtxRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
      }
      const audioCtx = audioCtxRef.current;
      if (audioCtx.state === 'suspended') {
        audioCtx.resume();
      }

      if (currentUser?.rol === 'ALERTAS') {
        const now = audioCtx.currentTime;
        const o1 = audioCtx.createOscillator();
        const o2 = audioCtx.createOscillator();
        const o3 = audioCtx.createOscillator();
        const g1 = audioCtx.createGain();
        const g2 = audioCtx.createGain();
        const g3 = audioCtx.createGain();

        o1.type = 'sine';
        o1.frequency.setValueAtTime(587.33, now);
        g1.gain.setValueAtTime(0.5, now);
        g1.gain.exponentialRampToValueAtTime(0.001, now + 2.5);

        o2.type = 'sine';
        o2.frequency.setValueAtTime(880, now);
        g2.gain.setValueAtTime(0.3, now);
        g2.gain.exponentialRampToValueAtTime(0.001, now + 1.5);

        o3.type = 'sine';
        o3.frequency.setValueAtTime(1174.66, now);
        g3.gain.setValueAtTime(0.15, now);
        g3.gain.exponentialRampToValueAtTime(0.001, now + 0.8);

        o1.connect(g1);
        g1.connect(audioCtx.destination);
        o2.connect(g2);
        g2.connect(audioCtx.destination);
        o3.connect(g3);
        g3.connect(audioCtx.destination);

        o1.start(now);
        o2.start(now);
        o3.start(now);

        o1.stop(now + 2.6);
        o2.stop(now + 1.6);
        o3.stop(now + 0.9);
        return;
      }

      const now = audioCtx.currentTime;
      const frequencies = [587.33, 880, 1174.66, 1760]; // beautiful chime chord
      const gains = [0.4, 0.25, 0.15, 0.08];
      const decays = [1.8, 1.4, 1.0, 0.6];
      
      frequencies.forEach((f, i) => {
        const osc = audioCtx.createOscillator();
        const gainNode = audioCtx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(f, now);
        
        gainNode.gain.setValueAtTime(gains[i], now);
        gainNode.gain.exponentialRampToValueAtTime(0.001, now + decays[i]);
        
        osc.connect(gainNode);
        gainNode.connect(audioCtx.destination);
        
        osc.start(now);
        osc.stop(now + decays[i]);
      });
    } catch (e) {
      console.log("Audio presentation blocked or failed: ", e);
    }
  }, [currentUser]);

  const playAlertSound = React.useCallback(() => {
    try {
      if (customAlertSound) {
        const audio = new Audio(customAlertSound);
        audio.play().catch(err => {
          console.warn("Failed to play custom MP3 alert sound, falling back to Web Audio API: ", err);
          playWebAudioAlertSound();
        });
      } else {
        playWebAudioAlertSound();
      }
    } catch (e) {
      console.log("Audio presentation blocked or failed: ", e);
    }
  }, [customAlertSound, playWebAudioAlertSound]);

  // Exact second scheduled task sound alarm trigger effect
  useEffect(() => {
    const interval = setInterval(() => {
      let updated = false;
      const now = new Date();
      
      const newTasks = tasks.map(t => {
        if (t.status === 'PENDIENTE' && t.scheduledDate && t.alertTime && !t.triggeredAlert) {
          try {
            const [year, month, day] = t.scheduledDate.split('-').map(Number);
            const [hour, min, sec] = t.alertTime.split(':').map(Number);
            const scheduledDateTime = new Date(year, month - 1, day, hour, min, sec || 0);
            if (now >= scheduledDateTime) {
              updated = true;
              
              // Play alarm sound if user has sound alerts active
              const hasSoundEnabled = currentUser?.alerta_sonora !== undefined && currentUser?.alerta_sonora !== null
                ? currentUser.alerta_sonora
                : (currentUser?.permisos?.['alerta_sonora'] !== false);
                
              if (hasSoundEnabled) {
                console.log("🔔 [ALERTAS_PENDIENTES] Play alarm bell sound for scheduled task:", t.title);
                playAlertSound();
              }
              
              return { ...t, triggeredAlert: true };
            }
          } catch (e) {
            console.error("Error evaluating task alarm schedule:", e);
          }
        }
        return t;
      });
      
      if (updated) {
        setTasks(newTasks);
      }
    }, 1000); // Poll once per second for maximum precision
    return () => clearInterval(interval);
  }, [tasks, currentUser, playAlertSound]);

  const fetchReceptionsAlerts = React.useCallback(async () => {
    if (!currentUser) return;
    try {
      let query = supabase
        .from('alertas_recepcion')
        .select('*');
      
      // Filter by branch only if user is NOT an ADMIN
      if (currentUser.rol !== 'ADMIN') {
        if (currentUser.sede_id) {
          query = query.or(`sede_id.eq.${currentUser.sede_id},sede_id.is.null`);
        } else {
          query = query.is('sede_id', null);
        }
      }

      const { data, error } = await query.order('fecha_alerta', { ascending: false });
      
      if (error) throw error;
      if (data) {
        setReceptionsAlerts(data);
      }
    } catch (err) {
      console.error("Error fetching reception alerts:", err);
    }
  }, [currentUser]);

  // REALTIME SUBSCRIPTIONS & POLLING FOR RECEPTION ALERTS (ADMIN / ASISTENTE ONLY)
  useEffect(() => {
    if (!currentUser) return;
    if (currentUser.rol !== 'ADMIN' && currentUser.rol !== 'ASISTENTE' && currentUser.rol !== 'ALERTAS') return;

    fetchReceptionsAlerts();

    // Determine the channel filter: Admin or null sede shouldn't put branch filters
    const filterObj = currentUser.rol === 'ADMIN' || !currentUser.sede_id
      ? {}
      : { filter: `sede_id=eq.${currentUser.sede_id}` };

    // Subscribe to reception alerts in real time
    const channel = supabase
      .channel('alertas-recepcion-realtime')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'alertas_recepcion',
          ...filterObj
        },
        async (payload) => {
          console.log("Realtime reception alert event received:", payload);
          if (payload.eventType === 'INSERT') {
            const newAlert = payload.new;
            const isPending = newAlert.estado !== undefined ? newAlert.estado === 'PENDIENTE' : !newAlert.recepcionado;
            const hasSoundEnabled = currentUser?.alerta_sonora !== undefined && currentUser?.alerta_sonora !== null
              ? currentUser.alerta_sonora
              : (currentUser?.permisos?.['alerta_sonora'] !== false);
            if (isPending && hasSoundEnabled) {
              playAlertSound();
            }
          }
          fetchReceptionsAlerts();
        }
      )
      .subscribe();

    // Polling backup every 10 seconds
    const interval = setInterval(() => {
      fetchReceptionsAlerts();
    }, 10000);

    return () => {
      supabase.removeChannel(channel);
      clearInterval(interval);
    };
  }, [currentUser, fetchReceptionsAlerts, playAlertSound]);

  // REAL-TIME SUBSCRIPTION FOR INVENTORY - Filtered by branch
  useEffect(() => {
    if (catalog.length === 0 || !currentUser?.sede_id) return;

    const channel = supabase
      .channel('inventory-realtime')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'paletas_lpn',
          filter: `sede_id=eq.${currentUser.sede_id}`
        },
        async (payload) => {
          if (payload.eventType === 'INSERT') {
            const newItem = payload.new;
            if (newItem.estado === 'ACTIVO') {
              const product = catalog.find(p => p.id === newItem.producto_id);
              // Fetch full location context if ubicacion_id changed
              let fullLocation = null;
              if (newItem.ubicacion_id) {
                const { data: locData } = await supabase
                  .from('ubicaciones')
                  .select('id, nivel, posicion, estantes(id, pasillo)')
                  .eq('id', newItem.ubicacion_id)
                  .single();
                
                if (locData) {
                  const ubicacion = locData;
                  let estanteIdFromDB = null;
                  if (ubicacion.estantes) {
                    estanteIdFromDB = Array.isArray(ubicacion.estantes) ? ubicacion.estantes[0]?.id : (ubicacion.estantes as any).id;
                  }
                  const foundRack = racks.find(r => r.dbId === estanteIdFromDB);
                  
                  fullLocation = {
                    id: ubicacion.id,
                    aisle: foundRack?.aisle || (Array.isArray(ubicacion.estantes) ? (ubicacion.estantes as any[])[0]?.pasillo : (ubicacion.estantes as any)?.pasillo) || '',
                    rackId: foundRack?.id || 0,
                    level: ubicacion.nivel,
                    position: ubicacion.posicion
                  };
                }
              }

              const mappedItem = {
                lpn: newItem.lpn,
                productId: newItem.producto_id,
                productName: product?.nombre || 'Desconocido',
                productCode: product?.codigo || 'N/A',
                quantity: newItem.cantidad_total,
                expirationDate: newItem.fecha_vencimiento_critica,
                receptionDate: newItem.fecha_recepcion,
                receivedBy: newItem.recibido_por,
                qrCodeUrl: `https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${newItem.lpn}`,
                photoUrl: '', 
                isMixed: newItem.es_mixto,
                mixedItems: newItem.mixed_items,
                locationId: newItem.ubicacion_id,
                location: fullLocation,
                generado: newItem.generado,
                fecha_generado: undefined,
                usuario_generado: undefined,
                estado_lpn: newItem.estado_lpn || (newItem.generado ? 'GENERADO' : 'PENDIENTE'),
                usuario_ultima_ubicacion: newItem.usuario_ultima_ubicacion,
                fecha_ultima_ubicacion: newItem.fecha_ultima_ubicacion,
                motivo_ultima_ubicacion: newItem.motivo_ultima_ubicacion
              };
              
              setInventory(prev => {
                const exists = prev.some(i => i.lpn === mappedItem.lpn);
                if (exists) return prev;
                return [...prev, mappedItem];
              });
            }
          } else if (payload.eventType === 'UPDATE') {
            const updatedItem = payload.new;
            if (updatedItem.estado !== 'ACTIVO') {
              setInventory(prev => prev.filter(i => i.lpn !== updatedItem.lpn));
            } else {
              const product = catalog.find(p => p.id === updatedItem.producto_id);
              
              // Try to find the full location info from our racks state
              let mappedLocation = null;
              if (updatedItem.ubicacion_id) {
                for (const rack of racks) {
                  const slot = rack.slots.find(s => s.dbId === updatedItem.ubicacion_id);
                  if (slot) {
                    mappedLocation = {
                      id: slot.dbId,
                      aisle: rack.aisle,
                      rackId: rack.id,
                      level: slot.location.level,
                      position: slot.location.position
                    };
                    break;
                  }
                }
              }

              setInventory(prev => prev.map(i => {
                if (i.lpn === updatedItem.lpn) {
                  return {
                    ...i,
                    productId: updatedItem.producto_id,
                    productName: product?.nombre || i.productName,
                    productCode: product?.codigo || i.productCode,
                    quantity: updatedItem.cantidad_total,
                    expirationDate: updatedItem.fecha_vencimiento_critica,
                    receptionDate: updatedItem.fecha_recepcion,
                    receivedBy: updatedItem.recibido_por,
                    isMixed: updatedItem.es_mixto,
                    mixedItems: updatedItem.mixed_items,
                    locationId: updatedItem.ubicacion_id,
                    location: mappedLocation,
                    generado: updatedItem.generado,
                    estado_lpn: updatedItem.estado_lpn || (updatedItem.generado ? 'GENERADO' : 'PENDIENTE'),
                    usuario_ultima_ubicacion: updatedItem.usuario_ultima_ubicacion,
                    fecha_ultima_ubicacion: updatedItem.fecha_ultima_ubicacion,
                    motivo_ultima_ubicacion: updatedItem.motivo_ultima_ubicacion
                  };
                }
                return i;
              }));
            }
          } else if (payload.eventType === 'DELETE') {
            setInventory(prev => prev.filter(i => i.lpn !== payload.old.lpn));
          }
        }
      )
      .subscribe();
      
    // REAL-TIME SUBSCRIPTION FOR LOCATIONS (UBICACIONES)
    const locationsChannel = supabase
      .channel('locations-realtime')
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'ubicaciones'
        },
        (payload) => {
          const updatedLoc = payload.new;
          setRacks(prevRacks => prevRacks.map(rack => {
            // Check if this location belongs to this rack
            const slotIndex = rack.slots.findIndex(s => s.dbId === updatedLoc.id);
            if (slotIndex === -1) return rack;

            const newSlots = [...rack.slots];
            newSlots[slotIndex] = {
              ...newSlots[slotIndex],
              status: updatedLoc.estado === 'OCUPADO' ? 'occupied' : 'empty',
              isBlocked: updatedLoc.esta_bloqueado
            };

            return { ...rack, slots: newSlots };
          }));
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
      supabase.removeChannel(locationsChannel);
    };
  }, [catalog]);

  useEffect(() => {
    try {
        const savedSeq = localStorage.getItem('smartwms_sequence');
        const savedMixedSeq = localStorage.getItem('smartwms_mixed_sequence');
        if (savedSeq) setSequenceCounter(parseInt(savedSeq));
        if (savedMixedSeq) setMixedSequenceCounter(parseInt(savedMixedSeq));
    } catch (e) {
        console.error("Error loading from localStorage", e);
    }
  }, []);

  useEffect(() => {
    localStorage.setItem('smartwms_sequence', sequenceCounter.toString());
    localStorage.setItem('smartwms_mixed_sequence', mixedSequenceCounter.toString());
    if (currentUser) {
        localStorage.setItem('smartwms_user', JSON.stringify(currentUser));
    } else {
        localStorage.removeItem('smartwms_user');
    }
  }, [sequenceCounter, mixedSequenceCounter, currentUser]);

  useEffect(() => {
    if (currentUser?.sede_color) {
      document.documentElement.style.setProperty('--brand-color', currentUser.sede_color);
      // To ensure tailwind picks it up if we use it in some places
      document.documentElement.style.setProperty('--primary-color', currentUser.sede_color);
    } else {
      document.documentElement.style.setProperty('--brand-color', '#009ED6');
      document.documentElement.style.setProperty('--primary-color', '#009ED6');
    }
  }, [currentUser]);

  useEffect(() => {
      if (isDarkMode) {
          document.documentElement.classList.add('dark');
      } else {
          document.documentElement.classList.remove('dark');
      }
      localStorage.setItem('smartwms_darkmode', String(isDarkMode));
  }, [isDarkMode]);

  useEffect(() => {
      const savedFavicon = localStorage.getItem('smartwms_app_favicon');
      if (savedFavicon) {
          const link: HTMLLinkElement | null = document.querySelector("link[id='favicon']");
          if (link) {
              link.href = savedFavicon;
          }
      }
  }, []);

  const handleReceive = (item: InventoryItem) => {
    // Update local state immediately
    setInventory(prev => [...prev, item]);
    if (item.isMixed) {
        setMixedSequenceCounter(prev => prev + 1);
    } else {
        setSequenceCounter(prev => prev + 1);
    }

    // Background DB call
    (async () => {
      try {
          const { error } = await supabase.from('paletas_lpn').insert([{
              lpn: item.lpn,
              producto_id: item.productId || null,
              cantidad_total: item.quantity,
              pallets: item.pallets || 0,
              cajas: item.cajas || 0,
              unidades: item.unidades || 0,
              fecha_vencimiento_critica: item.expirationDate,
              fecha_recepcion: item.receptionDate,
              recibido_por: item.receivedBy,
              qr_url: item.qrCodeUrl,
              es_mixto: item.isMixed || false,
              generado: item.generado || false,
              fecha_generado: item.fecha_generado || null,
              usuario_generado: item.usuario_generado || null,
              estado: 'ACTIVO',
              estado_lpn: 'PENDIENTE',
              sede_id: currentUser?.sede_id,
              tipo: item.tipo || 'RECEPCION',
              comentario: item.comentario || null
          }]);
          if (error) throw error;

          // If mixed, save items to paletas_lpn_items
          if (item.isMixed && item.mixedItems && item.mixedItems.length > 0) {
              const { error: itemsError } = await supabase.from('paletas_lpn_items').insert(item.mixedItems.map(mi => ({
                  lpn: item.lpn,
                  producto_id: mi.productId,
                  codigo: mi.productCode,
                  nombre: mi.productName,
                  cantidad: mi.quantity,
                  pallets: mi.pallets || 0,
                  cajas: mi.cajas || 0,
                  unidades: mi.unidades || 0,
                  fecha_vencimiento: mi.expirationDate,
                  sede_id: currentUser?.sede_id
              })));
              if (itemsError) throw itemsError;
          }
      } catch (err: any) {
          console.error("Error saving reception in background:", err);
      }
    })();
  };

  const handleAssignLocation = (lpn: string, location: RackLocation, _reason: string = 'Ubicación inicial') => {
    const oldItem = inventory.find(i => i.lpn === lpn);
    const oldLocation = oldItem?.location;
    const oldLocationId = oldItem?.locationId;

    // 1. Update Inventory State
    setInventory(prev => prev.map(item => {
      if (item.lpn === lpn) return { 
        ...item, 
        location,
        estado_lpn: 'GENERADO', // Use GENERADO as it is known to be valid in DB constraint
        usuario_ultima_ubicacion: currentUser?.username || 'SISTEMA',
        fecha_ultima_ubicacion: new Date().toISOString(),
        motivo_ultima_ubicacion: _reason
      };
      return item;
    }));

    // 2. Update Racks State (Visual feedback)
    setRacks(prevRacks => prevRacks.map(rack => {
        let newSlots = rack.slots;
        
        // If it was in this rack, clear old slot
        if (oldLocation && oldLocation.rackId === rack.id) {
            newSlots = newSlots.map(s => 
                (s.location.level === oldLocation.level && s.location.position === oldLocation.position) 
                ? { ...s, status: 'empty' as const } 
                : s
            );
        }

        // If it's entering this rack, set new slot
        if (location.rackId === rack.id) {
            newSlots = newSlots.map(s => 
                (s.location.level === location.level && s.location.position === location.position) 
                ? { ...s, status: 'occupied' as const } 
                : s
            );
        }

        if (newSlots === rack.slots) return rack;
        return { ...rack, slots: newSlots };
    }));

    // 3. Background DB synchronization
    (async () => {
      try {
          const rack = racks.find(r => r.id === location.rackId);
          if (!rack?.dbId) {
              console.error("Rack DB ID not found for rack:", location.rackId, "Racks available:", racks.length);
              return;
          }

          console.log(`Checking location in DB: Rack ${rack.dbId}, L${location.level}, P${location.position}`);
          const { data: locData, error: locError } = await supabase
              .from('ubicaciones')
              .select('id')
              .eq('estante_id', rack.dbId)
              .eq('nivel', location.level)
              .eq('posicion', location.position)
              .single();
          
          if (locError || !locData) {
              console.error("Location not found in DB for coordinates:", { rackId: rack.dbId, level: location.level, position: location.position }, "Error:", locError);
              return;
          }

          const newLocationId = locData.id;
          console.log(`Location found! ID: ${newLocationId}`);

          // Transaction-like sequence
          
          // A. Clear old location status if it changed
          if (oldLocationId && oldLocationId !== newLocationId) {
              await supabase.from('ubicaciones').update({ estado: 'VACIO' }).eq('id', oldLocationId);
          }

          // B. Set new location status
          await supabase.from('ubicaciones').update({ estado: 'OCUPADO' }).eq('id', newLocationId);

          // C. Update LPN Record
          const { error: lpnError } = await supabase.from('paletas_lpn').update({
              ubicacion_id: newLocationId,
              estado_lpn: 'GENERADO', // Using GENERADO which is allowed by DB constraint
              usuario_ultima_ubicacion: currentUser?.username || 'SISTEMA',
              fecha_ultima_ubicacion: new Date().toISOString(),
              motivo_ultima_ubicacion: _reason
          }).eq('lpn', lpn);
          
          if (lpnError) throw lpnError;

          // D. Record movement history (lpn_movimientos) - Use explicitly for tracking
          console.log(`Logging movement to DB for LPN ${lpn} at location ${newLocationId}`);
          const { error: moveError } = await supabase.from('lpn_movimientos').insert([{
              lpn: lpn,
              ubicacion_id: newLocationId,
              tipo_movimiento: oldLocationId ? 'REUBICACION' : 'UBICACION',
              usuario: currentUser?.username || 'SISTEMA',
              motivo: _reason || 'Asignación via Escáner',
              cantidad_afectada: oldItem?.quantity || 0,
              fecha: new Date().toISOString(),
              sede_id: currentUser?.sede_id
          }]);

          if (moveError) {
              console.error("Error in lpn_movimientos insert:", moveError);
          } else {
              console.log("Movement successfully recorded in DB.");
          }

          // Update local state with the actual ID from DB
          setInventory(prev => prev.map(invItem => 
            invItem.lpn === lpn ? { ...invItem, locationId: newLocationId } : invItem
          ));

      } catch (err: any) {
          console.error("Error assigning location in background:", err);
      }
    })();
  };

  const handleDispatch = (lpn: string, _reason: string = 'Despacho estándar') => {
    const itemToDispatch = inventory.find(i => i.lpn === lpn);
    // Update local state immediately
    setInventory(prev => prev.filter(item => item.lpn !== lpn));

    // Background DB call
    (async () => {
      try {
          if (itemToDispatch?.locationId) {
              // 1. Update location status to VACIO
              await supabase.from('ubicaciones').update({ estado: 'VACIO' }).eq('id', itemToDispatch.locationId);
              
              // 2. Record movement history
              await supabase.from('lpn_movimientos').insert([{
                  lpn: lpn,
                  ubicacion_id: itemToDispatch.locationId,
                  tipo_movimiento: 'RETIRO',
                  usuario: currentUser?.username || 'SISTEMA',
                  motivo: _reason,
                  cantidad_afectada: itemToDispatch.quantity,
                  fecha: new Date().toISOString(),
                  sede_id: currentUser?.sede_id
              }]);
          }

          // 3. Logical delete for dispatch
          const { error } = await supabase.from('paletas_lpn').update({ 
              estado: 'DESPACHADO',
              ubicacion_id: null // Free up the slot
          }).eq('lpn', lpn);
          
          if (error) throw error;

      } catch (err: any) {
          console.error("Error dispatching in background:", err);
      }
    })();
  };

  const handleUpdateItem = (lpn: string, updates: Partial<InventoryItem>) => {
      // Update local state immediately
      setInventory(prev => prev.map(item => {
          if (item.lpn === lpn) return { ...item, ...updates };
          return item;
      }));

      // Background DB call
      (async () => {
        try {
            const dbUpdates: any = {};
            if (updates.quantity !== undefined) dbUpdates.cantidad_total = updates.quantity;
            if (updates.expirationDate !== undefined) dbUpdates.fecha_vencimiento_critica = updates.expirationDate;
            
            const { error } = await supabase.from('paletas_lpn').update(dbUpdates).eq('lpn', lpn);
            if (error) throw error;
        } catch (err: any) {
            console.error("Error updating item in background:", err);
        }
      })();
  };

  const handleSaveStocktake = async (record: Omit<StocktakeRecord, 'id'>) => {
    // This is called from InventoryList which already handles backgrounding
    let finalSedeId = record.sede_id;
    if (!finalSedeId) {
        finalSedeId = currentUser?.sede_id;
    }
    if (!finalSedeId) {
        try {
            const saved = localStorage.getItem('smartwms_user');
            if (saved) {
                const parsed = JSON.parse(saved);
                finalSedeId = parsed?.sede_id;
            }
        } catch (e) {
            console.error("Error reading sede_id from localStorage fallback:", e);
        }
    }

    const recordWithSede = {
      ...record,
      sede_id: finalSedeId || undefined
    };
    const { error } = await supabase.from('conteo_inventario').insert([recordWithSede]);
    if (error) throw error;
  };

  interface SidebarItem {
    view: ViewState;
    icon: React.ReactNode;
    label: string;
    subItems?: { view: ViewState; label: string; icon: React.ReactNode }[];
    hidden?: boolean;
  }

  interface SidebarCategory {
    id: string;
    label: string;
    items: SidebarItem[];
  }

  const sidebarCategories: SidebarCategory[] = [
    {
      id: 'OPERACIONES',
      label: '📥 OPERACIONES',
      items: [
        { view: ViewState.RECEPTION_XML, icon: <div className="w-5 h-5 flex items-center justify-center font-black italic"> L </div>, label: "LAIVE" },
        { 
            view: ViewState.RECEPTION, 
            icon: <ArrowDownToLine className="w-5 h-5" />, 
            label: "Recepción",
            subItems: [
                { view: ViewState.RECEPTION_LAIVE, label: "Recepcion Laive", icon: <Package className="w-4 h-4" /> },
                { view: ViewState.RECEPTION_VALIDATE, label: "Validar Ingreso", icon: <FileCheck className="w-4 h-4" /> }
            ]
        },
        { view: ViewState.DISPATCH_PROVINCE, icon: <Truck className="w-5 h-5" />, label: "Despachos Provincia" },
        { view: ViewState.REVERSE_LOGISTICS, icon: <RefreshCw className="w-5 h-5" />, label: "Logíst. Inversa" },
        { view: ViewState.CORTES, icon: <ClipboardList className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />, label: "Cortes" },
      ]
    },
    {
      id: 'PICKING',
      label: '📋 PICKING',
      items: [
        { view: ViewState.PICKING, icon: <ClipboardList className="w-5 h-5 text-sky-600 dark:text-sky-450" />, label: "Picking / Piking" },
        { view: ViewState.VALIDADOR, icon: <CheckCircle className="w-5 h-5 text-emerald-600 dark:text-emerald-450" />, label: "Validador" },
        { view: ViewState.PICKING_CONTROL, icon: <TrendingUp className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />, label: "Control" }
      ]
    },
    {
      id: 'CONTROL_INVENTARIO',
      label: '🔍 CONTROL E INVENTARIO',
      items: [
        { view: ViewState.INVENTORY, icon: <ClipboardList className="w-5 h-5" />, label: "Inventario" },
        { view: ViewState.LAYOUT, icon: <LayoutGrid className="w-5 h-5" />, label: "Mapa Almacén" },
        { view: ViewState.CONCILIATION, icon: <Scale className="w-5 h-5" />, label: "Conciliación" },
        { view: ViewState.DIFFERENCE_HISTORY, icon: <HistoryIcon className="w-5 h-5" />, label: "Historial Diferencias" },
        { view: ViewState.COUNT_HISTORY, icon: <HistoryIcon className="w-5 h-5" />, label: "Historial Conteos" },
        { view: ViewState.MERMAS, icon: <Trash2 className="w-5 h-5" />, label: "Mermas" },
        { view: ViewState.SAMPLES, icon: <Beaker className="w-5 h-5" />, label: "Muestras" },
        { view: ViewState.ROTULADO, icon: <Tag className="w-5 h-5" />, label: "Rotulado" },
        { view: ViewState.REPORTE_TVU, icon: <ClipboardList className="w-5 h-5" />, label: "Reporte TVU" },
        { view: ViewState.IMP_UBICACIONES, icon: <Printer className="w-5 h-5" />, label: "IMP Ubicaciones" },
      ]
    },
    {
      id: 'MONITOREO_METRICAS',
      label: '📈 MONITOREO Y MÉTRICAS',
      items: [
        { view: ViewState.MONITOR, icon: <MonitorIcon className="w-5 h-5" />, label: "Monitor" },
        { view: ViewState.METRICS, icon: <TrendingUp className="w-5 h-5" />, label: "Métricas" },
      ]
    },
    {
      id: 'ADMINISTRACION',
      label: '⚙️ ADMINISTRACIÓN',
      items: [
        { view: ViewState.ARTICLE_MASTER, icon: <Database className="w-5 h-5" />, label: "Base Artículos" },
        { view: ViewState.CAPTURA_EAN, icon: <Tag className="w-5 h-5" />, label: "Captura EAN" },
        { view: ViewState.MAINTENANCE, icon: <RefreshCw className="w-5 h-5" />, label: "Mantenimiento" },
        { view: ViewState.BULK_IMPORT, icon: <Upload className="w-5 h-5" />, label: "Carga Masiva" },
        { view: ViewState.USER_MANAGEMENT, icon: <User className="w-5 h-5" />, label: "Gestión Usuarios" },
        { view: ViewState.BRANCH_MANAGEMENT, icon: <Building2 className="w-5 h-5" />, label: "Gestión Sedes" },
        { view: ViewState.CLIENTES, icon: <User className="w-5 h-5 text-[#009ED6]" />, label: "Clientes" },
        { view: ViewState.CONFIGURATION, icon: <Settings className="w-5 h-5" />, label: "Configuración" },
        { view: ViewState.ORCHESTRATOR, icon: <ListChecks className="w-5 h-5" />, label: "Orquestador", hidden: true },
      ]
    }
  ];

  const allowedCategories = sidebarCategories.map(category => {
      const mappedItems = category.items.map(item => {
          if (item.subItems) {
              const allowedSubItems = item.subItems.filter(sub => {
                  if (!currentUser) return false;
                  if (currentUser.rol === 'ADMIN') return true;
                  return !!currentUser.permisos?.[sub.view as string];
              });
              return { ...item, subItems: allowedSubItems };
          }
          return item;
      });

      const filteredItems = mappedItems.filter(item => {
          if (item.hidden) return false;
          if (!currentUser) return false;
          if (currentUser.rol === 'ADMIN') return true;
          
          if (item.view === ViewState.CLIENTES) {
              return currentUser.rol === 'ASISTENTE';
          }
          
          if (
              item.view === ViewState.ARTICLE_MASTER || 
              item.view === ViewState.BULK_IMPORT || 
              item.view === ViewState.USER_MANAGEMENT || 
              item.view === ViewState.BRANCH_MANAGEMENT || 
              item.view === ViewState.CONFIGURATION
          ) {
              return false;
          }
          
          const hasAllowedSubItems = item.subItems && item.subItems.length > 0;
          const isParentAllowed = !!currentUser.permisos?.[item.view as string];

          if (item.subItems) {
              return isParentAllowed || hasAllowedSubItems;
          }
          
          return isParentAllowed;
      });

      return {
          ...category,
          items: filteredItems
      };
  }).filter(category => category.items.length > 0);

  const sidebarItems = allowedCategories.flatMap(cat => cat.items);

  // Redirect to first allowed module if current view is not allowed
  useEffect(() => {
      if (!currentUser) return;
      
      if (currentUser.rol === 'ALERTAS') {
          if (view !== ViewState.ALERT_MONITOR) {
              setView(ViewState.ALERT_MONITOR);
          }
          return;
      }
      
      const isAllowed = currentUser.rol === 'ADMIN' || 
                        (view === ViewState.CLIENTES && currentUser.rol === 'ASISTENTE') ||
                        !!currentUser.permisos?.[view];
      
      if (!isAllowed) {
          // If the user does not have permission for the main view but has permission for any sub-item of a category, 
          // they might be on a sub-item, so let's allow it if it's one of the allowed sidebar sub-items!
          const isSubItemAllowed = sidebarItems.some(item => 
              item.subItems && item.subItems.some(sub => sub.view === view)
          );

          if (!isSubItemAllowed) {
              const firstAllowed = sidebarItems.find(item => !item.hidden);
              if (firstAllowed) {
                  if (firstAllowed.subItems && firstAllowed.subItems.length > 0) {
                      setView(firstAllowed.subItems[0].view as ViewState);
                  } else {
                      setView(firstAllowed.view as ViewState);
                  }
              }
          }
      }
  }, [currentUser, view, sidebarItems]);

  if (isVersionOutdated) {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center p-4">
        <VersionModal isOpen={true} minVersion={minVersionRequired || '---'} />
      </div>
    );
  }

  if (!currentUser) {
      return <Login 
        onLogin={(user) => {
            const normalizedUser = { ...user };
            if (normalizedUser.rol === 'ASISTENTE' && normalizedUser.permisos?.es_campana_alertas) {
                normalizedUser.rol = 'ALERTAS';
            }
            setCurrentUser(normalizedUser);
            localStorage.setItem('smartwms_user', JSON.stringify(normalizedUser));
            localStorage.setItem('smartwms_login_time', Date.now().toString());
            if (normalizedUser.rol === 'ALERTAS') {
                setView(ViewState.ALERT_MONITOR);
            }
            checkAppVersion(); // Re-check version on login
        }} 
        version={APP_VERSION}
      />;
  }

  if (currentUser.rol === 'ALERTAS') {
      return <AlertMonitor currentUser={currentUser} onLogout={handleLogout} />;
  }

  return (
    <div className={`min-h-screen transition-all duration-500 ${isDarkMode ? 'bg-[#0f172a]' : 'bg-indigo-50/50'} flex flex-col font-sans pb-16 md:pb-0 overflow-hidden`}>
      <style>{`
        :root {
            --brand-color: ${currentUser?.sede_color || '#009ED6'};
        }
        .bg-\\[\\#009ED6\\] { background-color: var(--brand-color) !important; }
        .text-\\[\\#009ED6\\] { color: var(--brand-color) !important; }
        .border-\\[\\#009ED6\\] { border-color: var(--brand-color) !important; }
        .focus\\:border-\\[\\#009ED6\\]:focus { border-color: var(--brand-color) !important; }
        .hover\\:text-\\[\\#009ED6\\]:hover { color: var(--brand-color) !important; }
        .hover\\:bg-\\[\\#009ED6\\]:hover { background-color: var(--brand-color) !important; }
        .shadow-\\[\\#009ED6\\/20\\] { --tw-shadow-color: var(--brand-color); }
        
        /* Specific overrides for sidebar and header */
        .bg-indigo-600 { background-color: var(--brand-color) !important; }
        .text-indigo-600 { color: var(--brand-color) !important; }
        
        /* Smooth transitions for brand color changes */
        * { transition-property: background-color, border-color, color, fill, stroke; transition-duration: 300ms; }
      `}</style>
      <VersionModal isOpen={isVersionOutdated} minVersion={minVersionRequired || '---'} />
      {showAlertsReviewModal && (
        <AlertsReviewModal
          isOpen={showAlertsReviewModal}
          onClose={() => setShowAlertsReviewModal(false)}
          alerts={receptionsAlerts}
          onRefresh={fetchReceptionsAlerts}
          currentUser={currentUser}
          isDarkMode={isDarkMode}
        />
      )}
      
      {showPendientesModal && (
        <PendientesModal
          isOpen={showPendientesModal}
          onClose={() => setShowPendientesModal(false)}
          tasks={tasks}
          currentUser={currentUser}
          isDarkMode={isDarkMode}
          onAddTask={handleAddTask}
          onTaskDone={handleTaskDone}
          onTaskReschedule={handleTaskReschedule}
          onTaskCancel={handleTaskCancel}
          onDeleteTask={handleDeleteTask}
        />
      )}
      
      <div className={`flex flex-col w-full h-full overflow-hidden transition-all duration-500 ${isDarkMode ? 'bg-[#0f172a]' : 'bg-white'}`}>
        
        {/* Header Section */}
        <header className={`${isDarkMode ? 'bg-[#1e293b] border-slate-700' : 'bg-[#009ED6] border-[#0088b9]'} text-white shadow-xl z-40 no-print shrink-0 border-b`}>
            <div className="px-4 md:px-6 h-16 flex items-center justify-between">
                <div className="flex items-center gap-3">
                    <button onClick={() => setIsSidebarOpen(!isSidebarOpen)} className="p-2 rounded-xl bg-white/10 hover:bg-white/20 transition-all border border-white/10 active:scale-95">
                        <Menu className="w-6 h-6" />
                    </button>

                    <div className="bg-white p-1.5 rounded-xl overflow-hidden w-10 h-10 flex items-center justify-center shadow-lg transform -rotate-3 border border-indigo-200">
                        <img src={LOGO_URL} className="w-full h-full object-contain" alt="SmartRack Logo" />
                    </div>
                    <div className="flex flex-col">
                        <h1 className="text-lg font-black tracking-tighter leading-none italic hidden xs:block">
                          SMARTRACK <span className="text-zinc-200 not-italic font-medium">WMS</span>
                        </h1>
                        {currentUser?.sede_nombre && (
                            <div className="flex items-center gap-1 mt-0.5">
                                <Building2 className="w-3 h-3 text-white/70" />
                                <span className="text-[9px] font-black uppercase tracking-widest text-emerald-300 drop-shadow-sm">
                                    SEDE: {currentUser.sede_nombre}
                                </span>
                            </div>
                        )}
                        {isConnecting && <span className="text-[8px] font-bold uppercase animate-pulse">Conectando Supabase...</span>}
                    </div>
                </div>
            
                <div className="flex items-center gap-2">
                    {currentUser?.rol === 'ADMIN' && (
                        <button 
                            onClick={() => {
                                handleLogout();
                            }}
                            className="p-2.5 rounded-xl bg-white/10 hover:bg-white/20 text-white transition-all border border-white/10 flex items-center gap-2 px-2.5 md:px-4 group"
                            title="Cambiar Sede"
                        >
                            <Building2 className="w-4 h-4 group-hover:scale-110 transition-transform" />
                            <span className="text-[10px] font-black uppercase tracking-tighter hidden md:inline">Sede</span>
                        </button>
                    )}

                    {(currentUser?.rol === 'ADMIN' || currentUser?.rol === 'ASISTENTE') && (
                        <button 
                            onClick={() => setShowAlertsReviewModal(true)}
                            className={`p-2.5 rounded-xl transition-all border flex items-center gap-2 px-2.5 md:px-3.5 group relative select-none cursor-pointer ${
                                receptionsAlertsCount > 0 
                                ? 'bg-red-600 border-red-500 text-white animate-pulse shadow-rose-300 shadow-md ring-2 ring-red-400 font-bold' 
                                : 'bg-white/10 hover:bg-white/20 text-white border-white/10'
                            }`}
                            title="Alertas de Recepción"
                        >
                            <Bell className="w-4 h-4 group-hover:animate-bounce shrink-0" />
                            {receptionsAlertsCount > 0 && (
                                <span className="absolute -top-1.5 -right-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-yellow-500 text-[10px] font-black text-slate-950 ring-2 ring-red-600 shadow-sm">
                                    {receptionsAlertsCount}
                                </span>
                            )}
                            <span className="text-[10px] font-black uppercase tracking-tighter hidden md:inline">Alertas</span>
                        </button>
                    )}

                    <button 
                        onClick={() => setShowPendientesModal(true)}
                        className={`p-2.5 rounded-xl transition-all border flex items-center gap-2 px-2.5 md:px-3.5 group relative select-none cursor-pointer ${
                            tasks.filter(t => t.status === 'PENDIENTE' && t.scheduledDate === getLocalDateString()).length > 0 
                            ? 'bg-amber-500 border-amber-400 text-slate-950 font-bold hover:bg-amber-600' 
                            : 'bg-white/10 hover:bg-white/20 text-white border-white/10'
                        }`}
                        title="Pendientes del Turno"
                    >
                        <ListChecks className="w-4 h-4 group-hover:scale-110 transition-transform shrink-0" />
                        {tasks.filter(t => t.status === 'PENDIENTE' && t.scheduledDate === getLocalDateString()).length > 0 && (
                            <span className="absolute -top-1.5 -right-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-red-600 text-[10px] font-black text-white ring-2 ring-amber-400 shadow-sm">
                                {tasks.filter(t => t.status === 'PENDIENTE' && t.scheduledDate === getLocalDateString()).length}
                            </span>
                        )}
                        <span className="text-[10px] font-black uppercase tracking-tighter hidden md:inline">Pendientes</span>
                    </button>

                    <button 
                        onClick={() => setIsDarkMode(!isDarkMode)}
                        className="p-2.5 rounded-xl bg-white/10 hover:bg-white/20 text-white transition-all border border-white/10"
                        title="Cambiar tema"
                    >
                        {isDarkMode ? <Sun className="w-5 h-5 text-amber-400" /> : <Moon className="w-5 h-5" />}
                    </button>

                    <button 
                        onClick={() => {
                            setCurrentUser(null);
                            localStorage.removeItem('smartwms_user');
                        }}
                        className="p-2.5 rounded-xl bg-red-500/10 hover:bg-red-500/20 text-red-100 transition-all border border-red-500/20"
                        title="Cerrar Sesión"
                    >
                        <XCircle className="w-5 h-5" />
                    </button>
                </div>
            </div>
        </header>

        <div className="flex flex-1 overflow-hidden relative">
            {isSidebarOpen && <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[45] md:hidden" onClick={() => setIsSidebarOpen(false)} />}

            <aside className={`
                fixed md:relative inset-y-0 left-0 z-[50] md:z-0
                transform transition-all duration-300 ease-in-out flex flex-col p-4 gap-2
                ${isSidebarOpen ? 'w-72 md:w-64 translate-x-0' : 'w-0 -translate-x-full md:w-0 md:p-0 md:opacity-0 pointer-events-none'}
                ${isDarkMode ? 'bg-[#1e293b] border-slate-700' : 'bg-white md:bg-transparent border-indigo-100'}
                border-r md:border-none shadow-2xl md:shadow-none overflow-hidden
            `}>
                <div className="flex items-center justify-between mb-6">
                    <div className="flex items-center gap-3">
                        <img src={LOGO_URL} className="w-8 h-8 object-contain" />
                        <span className={`font-black tracking-tighter ${isDarkMode ? 'text-white' : 'text-slate-900'}`}>SMARTRACK</span>
                    </div>
                    <button onClick={() => setIsSidebarOpen(false)} className="p-2 text-slate-400 hover:text-red-500 transition-colors">
                        <XCircle className="w-8 h-8" />
                    </button>
                </div>

                <div className="flex flex-col gap-3 flex-1 overflow-y-auto custom-scrollbar pr-1">
                    {allowedCategories.map((category) => {
                        const isCategoryExpanded = !!expandedCategories[category.id];
                        
                        return (
                            <div key={category.id} className="flex flex-col gap-1">
                                {/* Category Header */}
                                <button 
                                    onClick={() => toggleCategory(category.id)}
                                    className={`flex items-center justify-between w-full px-3 py-1.5 rounded-xl transition-all font-black text-[10px] uppercase tracking-widest text-[#009ED6]
                                        ${isDarkMode 
                                            ? 'text-slate-400 hover:text-white hover:bg-slate-800/40' 
                                            : 'text-[#009ED6] hover:bg-indigo-50/50'}
                                    `}
                                >
                                    <span className="font-extrabold italic">{category.label}</span>
                                    {isCategoryExpanded ? (
                                        <ChevronUp className="w-3.5 h-3.5 opacity-70" />
                                    ) : (
                                        <ChevronDown className="w-3.5 h-3.5 opacity-70" />
                                    )}
                                </button>

                                {/* Category Items (Accordion Body) */}
                                {isCategoryExpanded && (
                                    <div className="flex flex-col gap-0.5 pl-1 transition-all">
                                        {category.items.map((item) => {
                                            const isExpanded = expandedMenus.has(item.view as string);
                                            const hasSubItems = item.subItems && item.subItems.length > 0;
                                            const isActive = view === item.view || (item.subItems?.some(sub => sub.view === view));

                                            return (
                                                <div key={item.view as string} className="flex flex-col gap-0.5">
                                                    <button 
                                                        onClick={() => { 
                                                            if (hasSubItems) {
                                                                const newExpanded = new Set(expandedMenus);
                                                                if (isExpanded) newExpanded.delete(item.view as string);
                                                                else newExpanded.add(item.view as string);
                                                                setExpandedMenus(newExpanded);
                                                            }
                                                            setView(item.view as ViewState); 
                                                            if (window.innerWidth < 768 && !hasSubItems) setIsSidebarOpen(false); 
                                                        }} 
                                                        className={`
                                                            flex items-center justify-between p-2 pl-3 rounded-2xl font-black transition-all text-xs uppercase tracking-tighter group 
                                                            ${isActive
                                                                ? (isDarkMode ? 'bg-[#009ED6] text-white shadow-md' : 'bg-[#009ED6] text-white shadow-sm scale-[1.01]') 
                                                                : (isDarkMode ? 'text-slate-400 hover:bg-slate-800' : 'text-slate-500 hover:bg-[#009ED6]/5')}
                                                        `}
                                                    >
                                                        <div className="flex items-center gap-2.5">
                                                            <div className={`p-1.5 rounded-xl transition-colors ${isActive ? 'bg-white/20 text-white' : (isDarkMode ? 'bg-slate-700/60 text-slate-400' : 'bg-indigo-50 text-[#009ED6]')}`}>
                                                                {item.icon}
                                                            </div>
                                                            <span className="whitespace-nowrap font-bold text-[11px]">{item.label}</span>
                                                        </div>
                                                        {hasSubItems && (
                                                            isExpanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />
                                                        )}
                                                    </button>

                                                    {hasSubItems && isExpanded && (
                                                        <div className="flex flex-col gap-0.5 ml-5 mt-0.5 mb-1 border-l-2 border-indigo-100 pl-1.5">
                                                            {item.subItems?.map(sub => (
                                                                <button
                                                                    key={sub.view}
                                                                    onClick={() => {
                                                                        setView(sub.view as ViewState);
                                                                        if(window.innerWidth < 768) setIsSidebarOpen(false);
                                                                    }}
                                                                    className={`
                                                                        flex items-center gap-2 p-1.5 rounded-xl font-bold text-[10px] uppercase tracking-tight transition-all
                                                                        ${view === sub.view
                                                                            ? 'bg-indigo-600 text-white shadow-sm'
                                                                            : (isDarkMode ? 'text-slate-400 hover:bg-slate-800' : 'text-slate-500 hover:bg-indigo-50')}
                                                                    `}
                                                                >
                                                                    <div className={`p-1 rounded-lg ${view === sub.view ? 'bg-white/20' : 'bg-slate-100 text-slate-400'}`}>
                                                                        {sub.icon}
                                                                    </div>
                                                                    <span className="font-semibold">{sub.label}</span>
                                                                </button>
                                                            ))}
                                                        </div>
                                                    )}
                                                </div>
                                            );
                                        })}
                                    </div>
                                )}
                            </div>
                        );
                    })}
                </div>
            </aside>

            <main className={`flex-1 overflow-hidden p-2 md:p-4 flex flex-col h-full transition-all duration-300 ${isDarkMode ? 'bg-[#0f172a]' : 'bg-indigo-50/50'}`}>
                <section className={`flex-1 min-w-0 overflow-hidden h-full rounded-[1.5rem] md:rounded-[2rem] shadow-2xl border transition-colors duration-300 ${isDarkMode ? 'bg-[#1e293b] border-slate-700 text-white' : 'bg-white border-white'} relative`}>
                    
                    {!isSidebarOpen && (
                        <button 
                            onClick={() => setIsSidebarOpen(true)} 
                            className="hidden md:flex absolute top-4 left-4 z-50 bg-[#009ED6] text-white p-2 rounded-full shadow-lg hover:scale-110 transition-transform active:scale-95"
                            title="Mostrar Menú"
                        >
                            <ChevronRight className="w-5 h-5" />
                        </button>
                    )}

                    {view === ViewState.RECEPTION && <Reception 
                        onReceive={handleReceive} 
                        lastMixedSequence={mixedSequenceCounter} 
                        pendingItems={inventory.filter(i => !i.location && i.tipo !== 'GENERADO')} 
                        catalog={catalog} 
                        currentInventory={inventory.filter(i => i.tipo !== 'GENERADO')} 
                        onDeleteItems={async (lpns) => {
                            setInventory(inventory.filter(i => !lpns.includes(i.lpn)));
                            try {
                                await supabase.from('paletas_lpn').update({ estado: 'ELIMINADO', estado_lpn: 'ELIMINADO' }).in('lpn', lpns);
                                await supabase.from('recepcion_productos').update({ estado: 'ELIMINADO' }).in('lpn', lpns);
                            } catch (err) {
                                console.error("Error deleting items:", err);
                            }
                        }} 
                        onBulkDispatch={async (lpns) => {
                            setInventory(inventory.filter(i => !lpns.includes(i.lpn)));
                            try {
                                await supabase.from('paletas_lpn').update({ estado: 'DESPACHADO', estado_lpn: 'CROSS' }).in('lpn', lpns);
                            } catch (err) {
                                console.error("Error bulk dispatching items:", err);
                            }
                        }} 
                        currentUser={currentUser} 
                        onRefresh={loadInitialData} 
                        onAssignLocation={handleAssignLocation} 
                        initialData={pendingXmlData}
                        onClearInitialData={() => setPendingXmlData(null)}
                    />}
                    
                    {view === ViewState.RECEPTION_LAIVE && <ReceptionLaive 
                        currentUser={currentUser}
                        catalog={catalog}
                    />}
                    
                    {view === ViewState.RECEPTION_XML && <LaiveModule 
                        catalog={catalog} 
                        currentUser={currentUser}
                        onSelectProductForReception={(_, data) => {
                            setPendingXmlData(data);
                            setView(ViewState.RECEPTION);
                        }} 
                    />}

                    {view === ViewState.RECEPTION_VALIDATE && <Reception onReceive={handleReceive} lastMixedSequence={mixedSequenceCounter} pendingItems={inventory.filter(i => !i.location && i.tipo !== 'GENERADO')} catalog={catalog} currentInventory={inventory.filter(i => i.tipo !== 'GENERADO')} onDeleteItems={async (lpns) => {
                        setInventory(inventory.filter(i => !lpns.includes(i.lpn)));
                        try {
                            await supabase.from('paletas_lpn').update({ estado: 'ELIMINADO', estado_lpn: 'ELIMINADO' }).in('lpn', lpns);
                            await supabase.from('recepcion_productos').update({ estado: 'ELIMINADO' }).in('lpn', lpns);
                        } catch (err) {
                            console.error("Error deleting items:", err);
                        }
                    }} onBulkDispatch={async (lpns) => {
                        setInventory(inventory.filter(i => !lpns.includes(i.lpn)));
                        try {
                            await supabase.from('paletas_lpn').update({ estado: 'DESPACHADO', estado_lpn: 'CROSS' }).in('lpn', lpns);
                        } catch (err) {
                            console.error("Error bulk dispatching items:", err);
                        }
                    }} currentUser={currentUser} onRefresh={loadInitialData} onAssignLocation={handleAssignLocation} initialAccordion="VALIDATE" />}
                    {view === ViewState.LAYOUT && <Layout inventory={inventory} catalog={catalog} racks={racks} zones={zones} onAssignLocation={(lpn, loc) => handleAssignLocation(lpn, loc)} onDispatch={(lpn) => handleDispatch(lpn)} onReceive={handleReceive} itemsPendingLocation={inventory.filter(i => !i.location)} lastMixedSequence={mixedSequenceCounter} lastSequence={sequenceCounter} />}
                    {view === ViewState.DISPATCH_PROVINCE && <DispatchProvince catalog={catalog} user={currentUser} />}
                    {view === ViewState.PICKING && <AfternoonCar catalog={catalog} user={currentUser} initialViewMode="CARGA" />}
                    {view === ViewState.VALIDADOR && <AfternoonCar catalog={catalog} user={currentUser} initialViewMode="VALIDADOR" />}
                    {view === ViewState.PICKING_CONTROL && <AfternoonMonitor onClose={() => setView(ViewState.PICKING)} />}
                    {view === ViewState.REVERSE_LOGISTICS && <ReverseLogistics currentUser={currentUser} catalog={catalog} onRefreshCatalog={loadInitialData} />}
                    {view === ViewState.CORTES && <Cortes catalog={catalog} currentUser={currentUser} />}
                    {view === ViewState.INVENTORY && <InventoryList inventory={inventory} onUpdateItem={handleUpdateItem} catalog={catalog} onSaveStocktake={handleSaveStocktake} currentUser={currentUser} />}
                    {view === ViewState.MONITOR && <Monitor />}
                    {view === ViewState.METRICS && <Metrics />}
                    {view === ViewState.COUNT_HISTORY && <CountHistory />}
                    {view === ViewState.CONCILIATION && <Conciliation catalog={catalog} currentUser={currentUser} />}
                    {view === ViewState.DIFFERENCE_HISTORY && <DifferenceHistoryView />}
                    {view === ViewState.SAMPLES && <Samples currentUser={currentUser} />}
                    {view === ViewState.ROTULADO && <Rotulado catalog={catalog} currentUser={currentUser} lastSequence={sequenceCounter} lastMixedSequence={mixedSequenceCounter} onReceive={handleReceive} />}
                    {view === ViewState.REPORTE_TVU && <TvuReport catalog={catalog} currentUser={currentUser} />}
                    {view === ViewState.IMP_UBICACIONES && <ImpUbicaciones currentUser={currentUser} />}
                    {view === ViewState.ARTICLE_MASTER && <ArticleMaster catalog={catalog} onUpdateCatalog={setCatalog} userRole={currentUser?.rol} />}
                    {view === ViewState.CAPTURA_EAN && <CapturaEan catalog={catalog} onUpdateCatalog={setCatalog} />}
                    {view === ViewState.MAINTENANCE && <ArticleMaster catalog={catalog} onUpdateCatalog={setCatalog} userRole={currentUser?.rol} maintenanceMode={true} />}
                    {view === ViewState.BULK_IMPORT && <BulkImport onUpdateCatalog={setCatalog} />}
                    {view === ViewState.USER_MANAGEMENT && <UserManagement currentUser={currentUser} onUpdateCurrentUser={setCurrentUser} />}
                    {view === ViewState.BRANCH_MANAGEMENT && <BranchManagement currentUser={currentUser} />}
                    {view === ViewState.CLIENTES && <Clientes currentUser={currentUser} />}
                    {view === ViewState.ORCHESTRATOR && <Orchestrator tasks={tasks} onAddTask={handleAddTask} onUpdateTask={(id, u) => setTasks(prev => prev.map(t => t.id === id ? {...t, ...u} : t))} onDeleteTask={handleDeleteTask} />}
                    {view === ViewState.MERMAS && <Mermas catalog={catalog} currentUser={currentUser} />}
                    {view === ViewState.CONFIGURATION && <Configuration 
                        zones={zones} 
                        racks={racks} 
                        onAddZone={async (z) => {
                            try {
                                const { data, error } = await supabase.from('zonas').insert({
                                    nombre: z.name,
                                    tipo: z.type
                                }).select().single();
                                if (error) throw error;
                                setZones([...zones, { ...z, id: data.id }]);
                            } catch (err) {
                                console.error("Error adding zone:", err);
                                alert("Error al agregar cámara");
                            }
                        }} 
                        onDeleteZone={async (id) => {
                            try {
                                const { error } = await supabase.from('zonas').delete().eq('id', id);
                                if (error) throw error;
                                setZones(zones.filter(z => z.id !== id));
                            } catch (err) {
                                console.error("Error deleting zone:", err);
                                alert("Error al eliminar cámara. Asegúrese de que no tenga racks asociados.");
                            }
                        }} 
                        onAddRack={async (r) => {
                            try {
                                // 1. Insert Rack
                                const { data: rackData, error: rackError } = await supabase.from('estantes').insert({
                                    zona_id: r.zoneId,
                                    pasillo: r.aisle,
                                    niveles: r.levels,
                                    posiciones_por_nivel: r.positionsPerLevel
                                }).select().single();
                                if (rackError) throw rackError;

                                // 2. Insert Locations (Ubicaciones)
                                const locationsToInsert = r.slots.map(s => ({
                                    estante_id: rackData.id,
                                    nivel: s.location.level,
                                    posicion: s.location.position,
                                    codigo_ubicacion: s.id,
                                    esta_bloqueado: s.isBlocked
                                }));
                                
                                const { data: locsData, error: locsError } = await supabase.from('ubicaciones').insert(locationsToInsert).select();
                                if (locsError) throw locsError;

                                // 3. Update local state with DB IDs
                                const newRack = {
                                    ...r,
                                    dbId: rackData.id,
                                    slots: r.slots.map((s, idx) => ({
                                        ...s,
                                        dbId: locsData[idx].id
                                    }))
                                };
                                setRacks([...racks, newRack]);
                            } catch (err) {
                                console.error("Error adding rack:", err);
                                alert("Error al agregar rack");
                            }
                        }} 
                        onDeleteRack={async (id) => {
                            const rack = racks.find(r => r.id === id);
                            if (!rack?.dbId) return;
                            try {
                                // Ubicaciones will be deleted by cascade if configured, or we delete them manually
                                await supabase.from('ubicaciones').delete().eq('estante_id', rack.dbId);
                                const { error } = await supabase.from('estantes').delete().eq('id', rack.dbId);
                                if (error) throw error;
                                setRacks(racks.filter(r => r.id !== id));
                            } catch (err) {
                                console.error("Error deleting rack:", err);
                                alert("Error al eliminar rack");
                            }
                        }} 
                        onToggleBlockSlot={async (rid, l, p) => {
                            const rack = racks.find(rk => rk.id === rid);
                            const slot = rack?.slots.find(s => s.location.level === l && s.location.position === p);
                            if (!slot?.dbId) return;

                            try {
                                const newBlockedState = !slot.isBlocked;
                                const { error } = await supabase.from('ubicaciones').update({
                                    esta_bloqueado: newBlockedState
                                }).eq('id', slot.dbId);
                                if (error) throw error;

                                setRacks(racks.map(rk => rk.id === rid ? {
                                    ...rk, 
                                    slots: rk.slots.map(s => s.location.level === l && s.location.position === p ? {...s, isBlocked: newBlockedState} : s)
                                } : rk));
                            } catch (err) {
                                console.error("Error toggling block:", err);
                            }
                        }} 
                        onUpdateLocationCode={async (slotDbId, newCode) => {
                            try {
                                const { error } = await supabase.from('ubicaciones').update({
                                    codigo_ubicacion: newCode
                                }).eq('id', slotDbId);
                                if (error) throw error;

                                setRacks(prevRacks => prevRacks.map(rk => ({
                                    ...rk,
                                    slots: rk.slots.map(s => s.dbId === slotDbId ? { ...s, id: newCode } : s)
                                })));
                            } catch (err) {
                                console.error("Error updating location code:", err);
                                throw err;
                            }
                        }}
                    />}
                </section>
            </main>
        </div>
      </div>
    </div>
  );
};

export default App;
