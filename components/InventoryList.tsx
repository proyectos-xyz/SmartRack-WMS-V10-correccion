
import React, { useState, useEffect, useRef, useMemo } from 'react';
import { InventoryItem, Product, ZoneType, StocktakeRecord, Usuario, SystemStock } from '../types';
import { BarChart as RechartsBarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell, LineChart, Line, Legend } from 'recharts';
import { Search, AlertTriangle, Camera, CheckCircle, ClipboardList, PlusCircle, History, FileSpreadsheet, XCircle, Scan, ChevronLeft, ChevronRight, FileText, Calculator, Bell, Delete, RefreshCw, User, Upload, Download, BarChart3 } from './Icons';
import { supabase } from '../supabaseClient';
import { compressImage, generateStorageFileName } from '../utils';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import * as XLSX from 'xlsx';

interface InventoryListProps {
  inventory: InventoryItem[];
  onUpdateItem: (lpn: string, updates: Partial<InventoryItem>) => void;
  catalog: Product[];
  onSaveStocktake: (record: Omit<StocktakeRecord, 'id'>) => Promise<void>;
  currentUser: Usuario | null;
}

const InventoryList: React.FC<InventoryListProps> = ({ 
    inventory, 
    onUpdateItem,
    catalog,
    onSaveStocktake,
    currentUser
}) => {
  const [activeTab, setActiveTab] = useState<'LIST' | 'COUNT' | 'RECOUNT'>('COUNT');
  const [recountSubTab, setRecountSubTab] = useState<'DIFERENCIAS' | 'CRUCES'>('DIFERENCIAS');
  const [searchTerm, setSearchTerm] = useState('');
  const [debouncedSearchTerm, setDebouncedSearchTerm] = useState('');
  
  // Paginación
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 20;

  // -- Today's Counts State --
  const [todayCounts, setTodayCounts] = useState<StocktakeRecord[]>([]);
  const [systemStock, setSystemStock] = useState<SystemStock[]>([]);
  const [isLoadingCounts, setIsLoadingCounts] = useState(false);
  const [editingCount, setEditingCount] = useState<StocktakeRecord | null>(null);
  const [editQty, setEditQty] = useState('');
  const [editDate, setEditDate] = useState('');

  // -- Stocktake State --
  const [countProduct, setCountProduct] = useState<Product | null>(null);
  const [countSearch, setCountSearch] = useState('');
  const [countPallets, setCountPallets] = useState<string>('');
  const [countBoxes, setCountBoxes] = useState<string>('');
  const [countQty, setCountQty] = useState<string>('');
  const [countDay, setCountDay] = useState('');
  const [countMonth, setCountMonth] = useState('');
  const [countYear, setCountYear] = useState('');
  const [countDate, setCountDate] = useState('');
  const [countStatus, setCountStatus] = useState<string>('');
  const [countPhotos, setCountPhotos] = useState<{file: File, preview: string}[]>([]); // New: Photos during count
  const [sessionHistory, setSessionHistory] = useState<StocktakeRecord[]>([]);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [expiryWarning, setExpiryWarning] = useState<string | null>(null);

  // Download Modal State
  const [showDownloadModal, setShowDownloadModal] = useState(false);
  const [showStatsModal, setShowStatsModal] = useState(false);
  const [showUploadStockModal, setShowUploadStockModal] = useState(false);
  const [recountZoneFilter, setRecountZoneFilter] = useState<string>('TODOS');
  const [downloadStartDate, setDownloadStartDate] = useState(new Date().toISOString().split('T')[0]);
  const [downloadEndDate, setDownloadEndDate] = useState(new Date().toISOString().split('T')[0]);
  const [isDownloading, setIsDownloading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadSuccess, setUploadSuccess] = useState(false);

  // Calculator State
  const [showCalculator, setShowCalculator] = useState(false);
  const [calcValue, setCalcValue] = useState('');
  const [calcTarget, setCalcTarget] = useState<'PALLETS' | 'BOXES' | 'UNITS'>('UNITS');

  // Expiration Monitoring State
  const [showExpAlerts, setShowExpAlerts] = useState(false);
  const [expiringRecords, setExpiringRecords] = useState<any[]>([]);
  const [isUpdatingAction, setIsUpdatingAction] = useState(false);
  const [selectedAction, setSelectedAction] = useState<Record<string, {action: string, qty: string}>>({});
  const [selectedGroupIds, setSelectedGroupIds] = useState<string[]>([]);
  const [bulkAction, setBulkAction] = useState<string>('');
  const [expiringPage, setExpiringPage] = useState(1);
  const [expiringZoneFilter, setExpiringZoneFilter] = useState<string>('TODAS');
  const EXPIRING_ITEMS_PER_PAGE = 25;
  
  // Stats Modal Filters
  const [statsInterval, setStatsInterval] = useState<5 | 30>(30);
  const [statsUserFilter, setStatsUserFilter] = useState<string>('TODOS');

  // References for Focus Management (Rapid Scanning)
  const searchInputRef = useRef<HTMLInputElement>(null);
  const qtyInputRef = useRef<HTMLInputElement>(null);
  const calcInputRef = useRef<HTMLTextAreaElement | HTMLInputElement>(null);

  // Missing Modal State
  const [missingModalZone, setMissingModalZone] = useState<ZoneType | null>(null);

  // Photo Modal State (For Visualization Only now)
  const [photoItemLPN, setPhotoItemLPN] = useState<string | null>(null);
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  
  // Logic: Auto-select product if scanned code matches exactly
  // Fix: p.codigo or p.sku
  useEffect(() => {
      if (activeTab === 'COUNT' && countSearch) {
          const cleanSearch = countSearch.trim().toLowerCase();
          const exactMatch = catalog.find(p => 
              p.codigo.trim().toLowerCase() === cleanSearch ||
              (p.sku && p.sku.trim().toLowerCase() === cleanSearch)
          );
          if (exactMatch) {
              setCountProduct(exactMatch);
              setCountSearch(''); // Clear scanner buffer
              // Focus quantity input for rapid entry
              setTimeout(() => {
                  qtyInputRef.current?.focus();
              }, 100);
          }
      }
  }, [countSearch, catalog, activeTab]);

  // Sync countDate from day/month/year or status
  useEffect(() => {
    if (countStatus) {
        setCountDate(countStatus);
        setCountDay('');
        setCountMonth('');
        setCountYear('');
    } else if (countDay && countMonth && countYear) {
        const formattedDate = `${countYear}-${countMonth.padStart(2, '0')}-${countDay.padStart(2, '0')}`;
        setCountDate(formattedDate);
    } else {
        setCountDate('');
    }
  }, [countDay, countMonth, countYear, countStatus]);

  // Fetch today's counts
  const fetchTodayCounts = async () => {
    setIsLoadingCounts(true);
    try {
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const tomorrow = new Date(today);
        tomorrow.setDate(tomorrow.getDate() + 1);

        let query = supabase
            .from('conteo_inventario')
            .select('*')
            .gte('fecha_registro', today.toISOString())
            .lt('fecha_registro', tomorrow.toISOString());

        if (currentUser?.sede_id) {
            query = query.eq('sede_id', currentUser.sede_id);
        }

        const { data, error } = await query
            .order('fecha_registro', { ascending: false });

        if (error) throw error;
        setTodayCounts(data || []);

        // Also fetch system stock for Reconteo tab
        let sysQuery = supabase.from('stock_sistema').select('codigo, cantidad, costo');
        if (currentUser?.sede_id) {
            sysQuery = sysQuery.eq('sede_id', currentUser.sede_id);
        }
        const { data: sysData } = await sysQuery;
        if (sysData) setSystemStock(sysData as SystemStock[]);
    } catch (err) {
        console.error("Error fetching today counts:", err);
    } finally {
        setIsLoadingCounts(false);
    }
  };

  useEffect(() => {
    if (activeTab === 'LIST' || activeTab === 'RECOUNT') {
        fetchTodayCounts();
    }
  }, [activeTab]);

  const handleUpdateCount = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingCount) return;

    try {
        const { error } = await supabase
            .from('conteo_inventario')
            .update({
                cantidad: parseFloat(editQty),
                fecha_vencimiento: editDate
            })
            .eq('id', editingCount.id);

        if (error) throw error;
        
        setTodayCounts(prev => prev.map(c => c.id === editingCount.id ? { ...c, cantidad: parseFloat(editQty), fecha_vencimiento: editDate } : c));
        setEditingCount(null);
        alert("Registro actualizado correctamente.");
    } catch (err: any) {
        alert("Error al actualizar: " + err.message);
    }
  };

  const handleCalcInput = (val: string) => {
    if (!calcInputRef.current) {
        setCalcValue(prev => prev + val);
        return;
    }
    const start = calcInputRef.current.selectionStart || 0;
    const end = calcInputRef.current.selectionEnd || 0;
    const newValue = calcValue.substring(0, start) + val + calcValue.substring(end);
    setCalcValue(newValue);
    
    setTimeout(() => {
        if (calcInputRef.current) {
            calcInputRef.current.focus();
            calcInputRef.current.setSelectionRange(start + val.length, start + val.length);
        }
    }, 0);
  };

  const handleCalcDelete = () => {
    if (!calcInputRef.current) {
        setCalcValue(prev => prev.slice(0, -1));
        return;
    }
    const start = calcInputRef.current.selectionStart || 0;
    const end = calcInputRef.current.selectionEnd || 0;
    
    let newValue = '';
    let newPos = 0;
    
    if (start !== end) {
        newValue = calcValue.substring(0, start) + calcValue.substring(end);
        newPos = start;
    } else if (start > 0) {
        newValue = calcValue.substring(0, start - 1) + calcValue.substring(start);
        newPos = start - 1;
    } else {
        return;
    }
    
    setCalcValue(newValue);
    setTimeout(() => {
        if (calcInputRef.current) {
            calcInputRef.current.focus();
            calcInputRef.current.setSelectionRange(newPos, newPos);
        }
    }, 0);
  };


  // Auto-scroll calculator to bottom
  useEffect(() => {
    if (showCalculator && calcInputRef.current) {
        calcInputRef.current.scrollTop = calcInputRef.current.scrollHeight;
    }
  }, [calcValue, showCalculator]);

  // Focus calculator input when modal opens
  useEffect(() => {
    if (showCalculator) {
        setTimeout(() => {
            calcInputRef.current?.focus();
        }, 100);
    }
  }, [showCalculator]);

  // Check expiration immediately on input
  useEffect(() => {
    if (countDate && !['ROTO', 'REMAR', 'DESTRUCCION'].includes(countDate)) {
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        
        let exp: Date;
        if (/^\d{4}-\d{2}-\d{2}$/.test(countDate)) {
            const [year, month, day] = countDate.split('-').map(Number);
            exp = new Date(year, month - 1, day);
        } else {
            exp = new Date(countDate);
        }

        if (!isNaN(exp.getTime())) {
            const diffDays = Math.ceil((exp.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
            
            if (diffDays <= 5) {
                setExpiryWarning("⚠️ ¡Atención! Este producto vence en menos de 5 días (o ya venció). Debe ser retirado, pero se permitirá el registro.");
            } else {
                setExpiryWarning(null);
            }
        } else {
            setExpiryWarning(null);
        }
    } else {
        setExpiryWarning(null);
    }
  }, [countDate]);

  // Helper for robust date parsing
  const parseDate = (dateStr: any): Date | null => {
    if (!dateStr) return null;
    if (dateStr instanceof Date) return dateStr;
    if (typeof dateStr !== 'string') return null;
    
    const trimmed = dateStr.trim();
    if (!trimmed || ['ROTO', 'REMAR', 'DESTRUCCION'].includes(trimmed)) return null;

    // Try to parse directly first (handles ISO strings)
    let exp = new Date(trimmed);
    if (!isNaN(exp.getTime())) return exp;

    // Try YYYY-MM-DD
    if (/^\d{4}-\d{2}-\d{2}/.test(trimmed)) {
        const parts = trimmed.split(/[- : T]/);
        const year = parseInt(parts[0]);
        const month = parseInt(parts[1]);
        const day = parseInt(parts[2]);
        exp = new Date(year, month - 1, day);
    } 
    // Try DD/MM/YYYY
    else if (/^\d{2}\/\d{2}\/\d{4}/.test(trimmed)) {
        const parts = trimmed.split(/[\/ :]/);
        const day = parseInt(parts[0]);
        const month = parseInt(parts[1]);
        const year = parseInt(parts[2]);
        exp = new Date(year, month - 1, day);
    }
    // Try DD-MM-YYYY
    else if (/^\d{2}-\d{2}-\d{4}/.test(trimmed)) {
        const parts = trimmed.split(/[- :]/);
        const day = parseInt(parts[0]);
        const month = parseInt(parts[1]);
        const year = parseInt(parts[2]);
        exp = new Date(year, month - 1, day);
    }
    
    if (exp && !isNaN(exp.getTime())) return exp;
    return null;
  };

  // Calculate expiration status for list view
  const fetchExpiringSoon = async () => {
    try {
        setSelectedGroupIds([]);
        setBulkAction('');
        setExpiringPage(1);
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        
        const daysAgo30 = new Date(today);
        daysAgo30.setDate(daysAgo30.getDate() - 30);
        const daysAgo30Str = daysAgo30.toISOString();

        const ninetyDaysFromNow = new Date(today);
        ninetyDaysFromNow.setDate(ninetyDaysFromNow.getDate() + 90);
        ninetyDaysFromNow.setHours(23, 59, 59, 999);
        const ninetyDaysStr = ninetyDaysFromNow.toISOString().split('T')[0];

        // 1. Fetch from conteo_inventario - filtering out nulls, empties, N/A and placeholders on DB directly
        let query = supabase
            .from('conteo_inventario')
            .select('id, producto_id, codigo, nombre, cantidad, fecha_vencimiento, zona, accion, cantidad_accion, usuario_registro, fecha_registro, sede_id')
            .not('fecha_vencimiento', 'is', null)
            .neq('fecha_vencimiento', '')
            .neq('fecha_vencimiento', 'N/A')
            .neq('fecha_vencimiento', 'ROTO')
            .neq('fecha_vencimiento', 'REMAR')
            .neq('fecha_vencimiento', 'VENTA_PERSONAL')
            .neq('fecha_vencimiento', 'DESTRUCCION')
            .or('accion.is.null,accion.eq.""') // Only show pending actions
            .gte('fecha_registro', daysAgo30Str) // Registered in last 30 days
            .lte('fecha_vencimiento', ninetyDaysStr); // Expiring within 90 days

        if (currentUser?.sede_id) {
            query = query.eq('sede_id', currentUser.sede_id);
        }

        const { data, error } = await query
            .order('fecha_vencimiento', { ascending: true });

        if (error) throw error;

        const conteoFiltered = (data || []).filter(record => {
            // Filter out non-date statuses in JS to avoid Supabase query errors
            if (['ROTO', 'VENTA_PERSONAL','REMAR', 'DESTRUCCION'].includes(record.fecha_vencimiento)) return false;
            
            // Filter out items where action is 'vendido', 'vencido' or 'merma' (per user request)
            if (record.accion) {
                const actionLower = record.accion.toLowerCase().trim();
                if (['vendido', 'vencido', 'merma'].includes(actionLower)) return false;
            }

            let exp = parseDate(record.fecha_vencimiento);
            if (!exp) return false;
            
            const diffDays = Math.ceil((exp.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
            // Show if expired or expiring in next 90 days (per user request)
            return diffDays <= 90;
        });

        // 2. Combine with inventory (paletas_lpn) - REMOVED completely per user request (only show physical stocktakes)
        const inventoryExpiring: any[] = [];

        // Combine and sort by date ascending
        const combined = [...conteoFiltered, ...inventoryExpiring].sort((a, b) => {
            const dateA = parseDate(a.fecha_vencimiento)?.getTime() || 0;
            const dateB = parseDate(b.fecha_vencimiento)?.getTime() || 0;
            return dateA - dateB;
        });

        setExpiringRecords(combined);

        // Initialize selectedAction
        const initialActions: Record<string, {action: string, qty: string}> = {};
        combined.forEach(record => {
            if ((record as any).accion) {
                initialActions[record.id] = { 
                    action: (record as any).accion, 
                    qty: ((record as any).cantidad_accion || record.cantidad).toString() 
                };
            }
        });
        setSelectedAction(prev => ({ ...prev, ...initialActions }));
    } catch (err) {
        console.error("Error fetching expiring soon:", err);
    }
  };

  // Fetch expiring soon on mount and when inventory changes
  useEffect(() => {
    fetchExpiringSoon();
  }, [inventory]);

  const handleExecuteAction = async (recordId: string, isGroup: boolean = false, recordIds: string[] = []) => {
    const config = selectedAction[recordId];
    if (!config || !config.action || !config.qty) {
        alert("Por favor seleccione una acción y cantidad.");
        return;
    }

    setIsUpdatingAction(true);
    try {
        const idsToUpdate = isGroup ? recordIds : [recordId];
        const totalQty = parseFloat(config.qty);
        const qtyPerRecord = totalQty / idsToUpdate.length;
        
        // Separate inventory items from conteo items
        const invIds = idsToUpdate.filter(id => id.startsWith('inv-'));
        const conteoIds = idsToUpdate.filter(id => !id.startsWith('inv-'));

        // 1. Update existing conteo records
        if (conteoIds.length > 0) {
            const { error } = await supabase
                .from('conteo_inventario')
                .update({
                    accion: config.action,
                    cantidad_accion: qtyPerRecord,
                    fecha_accion: new Date().toISOString()
                })
                .in('id', conteoIds);
            if (error) throw error;
        }

        // 2. Create new conteo records for inventory items being processed
        if (invIds.length > 0) {
            const newRecords = invIds.map(id => {
                const lpn = id.replace('inv-', '');
                const item = inventory.find(i => i.lpn === lpn);
                if (!item) return null;
                return {
                    producto_id: item.productId,
                    codigo: item.productCode,
                    nombre: item.productName,
                    cantidad: item.quantity,
                    fecha_vencimiento: item.expirationDate,
                    zona: item.location?.aisle || 'N/A',
                    accion: config.action,
                    cantidad_accion: qtyPerRecord,
                    fecha_accion: new Date().toISOString(),
                    usuario_registro: currentUser?.nombre || 'SISTEMA',
                    fecha_registro: new Date().toISOString(),
                    sede_id: currentUser?.sede_id || (() => {
                        try {
                            const saved = localStorage.getItem('smartwms_user');
                            return saved ? JSON.parse(saved)?.sede_id : undefined;
                        } catch {
                            return undefined;
                        }
                    })()
                };
            }).filter(Boolean);

            if (newRecords.length > 0) {
                const { error } = await supabase.from('conteo_inventario').insert(newRecords);
                if (error) throw error;
            }
        }
        
        // Refresh list
        await fetchExpiringSoon();
        
        // Force immediate removal from UI state to ensure visual feedback
        setExpiringRecords(prev => prev.filter(r => !idsToUpdate.includes(r.id)));
        
        // If they were inventory items, sync with main inventory state to remove them from stock alerts
        if (invIds.length > 0) {
            invIds.forEach(id => {
                const lpn = id.replace(/inv-|-m\d+$/g, '');
                // Update quantity to 0 in main inventory so it no longer shows up in future refreshes
                onUpdateItem(lpn, { quantity: 0 });
            });
        }

        setSuccessMsg("Acción registrada correctamente.");
        setTimeout(() => setSuccessMsg(null), 2000);
    } catch (err: any) {
        alert("Error al registrar acción: " + err.message);
    } finally {
        setIsUpdatingAction(false);
    }
  };

  const getExpirationStatus = (dateStr: string | undefined) => {
    if (!dateStr) return { status: 'OK', color: 'bg-slate-100 text-slate-400 border-slate-200', days: 999 };
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    let expDate: Date | null = null;
    if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
        const [year, month, day] = dateStr.split('-').map(Number);
        expDate = new Date(year, month - 1, day);
    } else if (/^\d{2}\/\d{2}\/\d{4}$/.test(dateStr)) {
        const [day, month, year] = dateStr.split('/').map(Number);
        expDate = new Date(year, month - 1, day);
    } else if (/^\d{2}-\d{2}-\d{4}$/.test(dateStr)) {
        const [day, month, year] = dateStr.split('-').map(Number);
        expDate = new Date(year, month - 1, day);
    } else {
        expDate = new Date(dateStr);
    }

    if (!expDate || isNaN(expDate.getTime())) return { status: 'OK', color: 'bg-slate-100 text-slate-400 border-slate-200', days: 999 };
    const diffTime = expDate.getTime() - today.getTime();
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    
    if (diffDays <= 5) return { status: 'EXPIRED', color: 'bg-red-100 text-red-800 border-red-200', days: diffDays };
    if (diffDays <= 15) return { status: 'WARNING', color: 'bg-orange-100 text-orange-800 border-orange-200', days: diffDays };
    return { status: 'OK', color: 'bg-green-100 text-green-800 border-green-200', days: diffDays };
  };

  const groupedExpiringRecords = useMemo(() => {
    const groups: Record<string, {
        id: string,
        productIdentifier: string,
        nombre: string,
        codigo: string,
        fecha_vencimiento: string,
        cantidadTotal: number,
        zona: string,
        ids: string[],
        registros: { usuario: string, fecha: string, cantidad: number }[]
    }> = {};

    expiringRecords.forEach(r => {
        const productIdentifier = r.producto_id || r.codigo || r.nombre;
        const key = `${productIdentifier}-${r.fecha_vencimiento}`;
        if (!groups[key]) {
            groups[key] = {
                id: r.id,
                productIdentifier,
                nombre: r.nombre,
                codigo: r.codigo,
                fecha_vencimiento: r.fecha_vencimiento,
                cantidadTotal: 0,
                zona: r.zona || 'N/A',
                ids: [],
                registros: []
            };
        }
        groups[key].cantidadTotal += r.cantidad;
        groups[key].ids.push(r.id);
        groups[key].registros.push({
            usuario: r.usuario_registro || 'N/A',
            fecha: r.fecha_registro ? new Date(r.fecha_registro).toLocaleString('es-PE', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : 'N/A',
            cantidad: r.cantidad
        });
    });

    let sortedList = Object.values(groups).sort((a, b) => {
        const statusA = getExpirationStatus(a.fecha_vencimiento);
        const statusB = getExpirationStatus(b.fecha_vencimiento);
        return statusA.days - statusB.days;
    });

    if (expiringZoneFilter && expiringZoneFilter !== 'TODAS') {
        sortedList = sortedList.filter(g => g.zona && g.zona.toUpperCase() === expiringZoneFilter.toUpperCase());
    }

    return sortedList;
  }, [expiringRecords, expiringZoneFilter]);

  const paginatedExpiringRecords = useMemo(() => {
    const startIndex = (expiringPage - 1) * EXPIRING_ITEMS_PER_PAGE;
    return groupedExpiringRecords.slice(startIndex, startIndex + EXPIRING_ITEMS_PER_PAGE);
  }, [groupedExpiringRecords, expiringPage]);

  const expiringTotalPages = useMemo(() => {
    return Math.ceil(groupedExpiringRecords.length / EXPIRING_ITEMS_PER_PAGE);
  }, [groupedExpiringRecords]);

  const handleExecuteBulkAction = async (action: string) => {
    if (!action) {
        alert("Por favor seleccione una acción para procesar en masivo.");
        return;
    }
    if (selectedGroupIds.length === 0) {
        alert("No hay registros seleccionados.");
        return;
    }

    const confirmMsg = `¿Está seguro de que desea marcar los ${selectedGroupIds.length} productos seleccionados como "${action}"?`;
    if (!window.confirm(confirmMsg)) {
        return;
    }

    setIsUpdatingAction(true);
    try {
        const selectedGroups = groupedExpiringRecords.filter(g => selectedGroupIds.includes(g.id));
        const updates: any[] = [];
        const newRecords: any[] = [];
        const invIdsToProcess: string[] = [];
        
        for (const group of selectedGroups) {
            group.ids.forEach(id => {
                if (id.startsWith('inv-')) {
                    const lpn = id.replace('inv-', '');
                    invIdsToProcess.push(id);
                    const item = inventory.find(i => i.lpn === lpn);
                    if (item) {
                        newRecords.push({
                            producto_id: item.productId,
                            codigo: item.productCode,
                            nombre: item.productName,
                            cantidad: item.quantity,
                            fecha_vencimiento: item.expirationDate,
                            zona: item.location?.aisle || 'N/A',
                            accion: action,
                            cantidad_accion: item.quantity,
                            fecha_accion: new Date().toISOString(),
                            usuario_registro: currentUser?.nombre || 'SISTEMA',
                            fecha_registro: new Date().toISOString(),
                            sede_id: currentUser?.sede_id || (() => {
                                try {
                                    const saved = localStorage.getItem('smartwms_user');
                                    return saved ? JSON.parse(saved)?.sede_id : undefined;
                                } catch {
                                    return undefined;
                                }
                            })()
                        });
                    }
                } else {
                    const record = expiringRecords.find(r => r.id === id);
                    if (record) {
                        updates.push(
                            supabase
                                .from('conteo_inventario')
                                .update({
                                    accion: action,
                                    cantidad_accion: record.cantidad,
                                    fecha_accion: new Date().toISOString()
                                })
                                .eq('id', id)
                                .then(res => {
                                    if (res.error) throw res.error;
                                    return res.data;
                                })
                        );
                    }
                }
            });
        }

        // Wait for all conteo updates
        if (updates.length > 0) {
            await Promise.all(updates);
        }

        // Insert new records for inventory items
        if (newRecords.length > 0) {
            const { error } = await supabase.from('conteo_inventario').insert(newRecords);
            if (error) throw error;
        }

        // Clear stock alerts for processed inventory item LPNS
        if (invIdsToProcess.length > 0) {
            invIdsToProcess.forEach(id => {
                const lpn = id.replace(/inv-|-m\d+$/g, '');
                onUpdateItem(lpn, { quantity: 0 });
            });
        }

        // Refresh lists
        await fetchExpiringSoon();
        setSelectedGroupIds([]);
        setBulkAction('');

        setSuccessMsg("Productos procesados en lote correctamente.");
        setTimeout(() => setSuccessMsg(null), 2000);
    } catch (err: any) {
        alert("Error al procesar en lote: " + err.message);
    } finally {
        setIsUpdatingAction(false);
    }
  };

  // Debounce search term
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearchTerm(searchTerm);
    }, 300);
    return () => clearTimeout(timer);
  }, [searchTerm]);

  // Reset page when search changes
  useEffect(() => {
    setCurrentPage(1);
  }, [debouncedSearchTerm]);

  // Fix: p.nombre, p.codigo
  const filteredCatalog = useMemo(() => {
    const term = countSearch.toLowerCase().trim();
    if (!term) return [];
    
    return catalog.filter(p => 
       p.nombre.toLowerCase().includes(term) || 
       p.codigo.toLowerCase().includes(term) ||
       (p.sku && p.sku.toLowerCase().includes(term)) ||
       (p.marca && p.marca.toLowerCase().includes(term)) ||
       (p.categoria && p.categoria.toLowerCase().includes(term))
    );
  }, [catalog, countSearch]);

  // --- PHOTO HANDLING (STOCKTAKE) ---
  const handleCountAddPhoto = (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) {
          if (countPhotos.length >= 5) {
              alert("Máximo 5 fotos permitidas.");
              return;
          }
          const preview = URL.createObjectURL(file);
          setCountPhotos(prev => [...prev, { file, preview }]);
      }
  };

  const handleCountRemovePhoto = (index: number) => {
      const photoToRemove = countPhotos[index];
      if (photoToRemove) {
          URL.revokeObjectURL(photoToRemove.preview);
      }
      setCountPhotos(prev => prev.filter((_, i) => i !== index));
  };

  const handleStocktakeSubmit = (e: React.FormEvent) => {
      e.preventDefault();
      if (!countProduct) return;

      const p = parseFloat(countPallets) || 0;
      const b = parseFloat(countBoxes) || 0;
      const u = parseFloat(countQty) || 0;
      const cpp = countProduct.cajas_por_palet || 0;
      const upc = countProduct.unidades_por_caja || 1;
      
      const totalQty = (cpp > 0 || upc > 1) ? ((p * cpp * upc) + (b * upc) + u) : u;
      
      if (totalQty <= 0) {
          alert("La cantidad total debe ser mayor a 0");
          return;
      }

      // Capture current form state for background processing
      const productToSave = { ...countProduct };
      const qtyToSave = totalQty.toString();
      const dateToSave = countDate;
      const photosToSave = [...countPhotos];
      const userToSave = currentUser?.nombre || 'Auditor';
      const timestamp = new Date().toISOString();
      
      // New fields to save breakdown
      const palletsToSave = p;
      const boxesToSave = b;
      const unitsToSave = u;

      // Reset form immediately for "feeling of speed"
      setCountPallets('');
      setCountBoxes('');
      setCountQty('');
      setCountDate('');
      setCountStatus('');
      setCountDay('');
      setCountMonth('');
      setCountYear('');
      setCountPhotos([]);
      setExpiryWarning(null);
      setCountProduct(null);
      
      setSuccessMsg(`Conteo registrado correctamente`);
      setTimeout(() => setSuccessMsg(null), 2000);

      setTimeout(() => {
          searchInputRef.current?.focus();
      }, 100);

      // Background processing
      (async () => {
          try {
              const uploadedUrls: string[] = [];
              
              for (const photo of photosToSave) {
                  const fileName = generateStorageFileName();
                  const filePath = `evidencias/${fileName}`;

                  try {
                      const compressedBlob = await compressImage(photo.file, 1024, 0.6);
                      const { data, error } = await supabase.storage
                          .from('evidencias')
                          .upload(filePath, compressedBlob, { contentType: 'image/jpeg' });

                      if (error) {
                          console.error("Error uploading photo in background:", error);
                          continue;
                      }

                      if (data) {
                          const { data: { publicUrl } } = supabase.storage
                              .from('evidencias')
                              .getPublicUrl(filePath);
                          uploadedUrls.push(publicUrl);
                      }
                  } catch (compressErr) {
                      console.error("Error compressing image:", compressErr);
                      // Fallback to original if compression fails
                      const { data } = await supabase.storage
                          .from('evidencias')
                          .upload(filePath, photo.file);
                      
                      if (data) {
                          const { data: { publicUrl } } = supabase.storage
                              .from('evidencias')
                              .getPublicUrl(filePath);
                          uploadedUrls.push(publicUrl);
                      }
                  }
              }

              const newRecord: Omit<StocktakeRecord, 'id'> = {
                  producto_id: productToSave.id,
                  codigo: productToSave.codigo,
                  nombre: productToSave.nombre,
                  cantidad: parseFloat(qtyToSave),
                  pallets: palletsToSave,
                  cajas: boxesToSave,
                  unidades: unitsToSave,
                  fecha_vencimiento: dateToSave,
                  usuario_registro: userToSave,
                  fecha_registro: timestamp,
                  fotos: uploadedUrls,
                  zona: productToSave.zona_predeterminada,
                  sede_id: currentUser?.sede_id || (() => {
                      try {
                          const saved = localStorage.getItem('smartwms_user');
                          return saved ? JSON.parse(saved)?.sede_id : undefined;
                      } catch {
                          return undefined;
                      }
                  })()
              };

              await onSaveStocktake(newRecord);

              // Refresh expiring soon bell
              fetchExpiringSoon();

              // Update local session history
              setSessionHistory(prev => [{ ...newRecord, id: Date.now().toString() } as StocktakeRecord, ...prev]);
          } catch (err: any) {
              console.error("Error in background save:", err);
              // Optional: notify user of failure if critical
          }
      })();
  };

  // --- STATISTICS LOGIC ---
  const userStats = useMemo(() => {
    const stats: Record<string, { user: string, totalCounted: number, recordsCount: number, startTime: number, endTime: number }> = {};
    
    todayCounts.forEach(record => {
        const user = record.usuario_registro || 'Desconocido';
        const time = new Date(record.fecha_registro).getTime();
        
        if (!stats[user]) {
            stats[user] = {
                user,
                totalCounted: 0,
                recordsCount: 0,
                startTime: time,
                endTime: time
            };
        }
        
        stats[user].totalCounted += record.cantidad;
        stats[user].recordsCount += 1;
        if (time < stats[user].startTime) stats[user].startTime = time;
        if (time > stats[user].endTime) stats[user].endTime = time;
    });
    
    return Object.values(stats).map(s => {
        const hours = (s.endTime - s.startTime) / (1000 * 60 * 60);
        // Speed: records per hour. If less than 5 mins between first and last, use recordsCount as base
        const speed = hours > 0.083 ? (s.recordsCount / hours) : s.recordsCount;
        return {
            ...s,
            speed: parseFloat(speed.toFixed(1))
        };
    }).sort((a, b) => b.totalCounted - a.totalCounted);
  }, [todayCounts]);

  const countingFrequencyData = useMemo(() => {
    if (todayCounts.length === 0) return [];
    
    // Filter by user if needed
    const filteredCounts = statsUserFilter === 'TODOS' 
        ? todayCounts 
        : todayCounts.filter(r => (r.usuario_registro || 'Desconocido') === statsUserFilter);

    if (filteredCounts.length === 0) return [];

    const users = Array.from(new Set(filteredCounts.map(r => r.usuario_registro || 'Desconocido')));
    const intervals: Record<string, any> = {};
    
    const times = filteredCounts.map(r => new Date(r.fecha_registro).getTime());
    const minTime = Math.min(...times);
    const maxTime = Math.max(...times);
    
    const startObj = new Date(minTime);
    startObj.setMinutes(0, 0, 0);
    const endObj = new Date(maxTime);
    endObj.setHours(endObj.getHours() + 1, 0, 0, 0);
    
    let current = startObj.getTime();
    const end = endObj.getTime();
    
    const intervalStep = statsInterval * 60 * 1000;

    while (current <= end) {
        const timeStr = new Date(current).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        intervals[timeStr] = { time: timeStr, timestamp: current };
        users.forEach(u => {
            intervals[timeStr][u] = 0;
        });
        current += intervalStep;
    }
    
    filteredCounts.forEach(record => {
        const date = new Date(record.fecha_registro);
        const mins = date.getMinutes();
        const roundedMins = Math.floor(mins / statsInterval) * statsInterval;
        date.setMinutes(roundedMins, 0, 0);
        
        const timeStr = date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        const user = record.usuario_registro || 'Desconocido';
        
        if (intervals[timeStr]) {
            intervals[timeStr][user] += 1;
        }
    });
    
    return Object.values(intervals).sort((a: any, b: any) => a.timestamp - b.timestamp);
  }, [todayCounts, statsInterval, statsUserFilter]);

  const activeUsers = useMemo(() => {
    return Array.from(new Set(todayCounts.map(r => r.usuario_registro || 'Desconocido')));
  }, [todayCounts]);

  const handleExportSession = () => {
      setShowDownloadModal(true);
  };

  const handleDownloadHistory = async () => {
      setIsDownloading(true);
      try {
          // Fetch from Supabase with date range
          let query = supabase
              .from('conteo_inventario')
              .select('*')
              .gte('fecha_registro', `${downloadStartDate}T00:00:00`)
              .lte('fecha_registro', `${downloadEndDate}T23:59:59`);

          if (currentUser?.sede_id) {
              query = query.eq('sede_id', currentUser.sede_id);
          }

          const { data, error } = await query
              .order('fecha_registro', { ascending: false });

          if (error) throw error;

          if (!data || data.length === 0) {
              alert("No se encontraron registros en el rango seleccionado.");
              return;
          }

          // Headers: fechas de registro , hora de registro , Codigo , producto , unidad de medida , cantidad , VENCIMIENTO, DIAS RESTANTES, ESTADO, ACCION, CANT. ACCION, foto, usuario que registró.
          const headers = ['FECHA REGISTRO', 'HORA REGISTRO', 'CODIGO', 'PRODUCTO', 'UNIDAD MEDIDA', 'PALLETS', 'CAJAS', 'UNIDADES', 'TOTAL', 'VENCIMIENTO', 'DIAS RESTANTES', 'ESTADO', 'ACCION', 'CANT. ACCION', 'FOTO', 'USUARIO'];
          const csvRows = [headers.join(',')];

          for (const record of data) {
              const dateObj = new Date(record.fecha_registro);
              const fecha = dateObj.toLocaleDateString();
              const hora = dateObj.toLocaleTimeString();
              
              // Try to find product in catalog to get unidad_medida
              const product = catalog.find(p => p.id === record.producto_id || p.codigo === record.codigo);
              const unidadMedida = product?.unidad_medida_sap || product?.unidad_venta || 'UND';

              // Calculate expiration status
              const expStatus = getExpirationStatus(record.fecha_vencimiento);
              const diasRestantes = expStatus.days === 999 ? 'N/A' : expStatus.days;
              const estadoVencimiento = expStatus.status === 'EXPIRED' ? 'VENCIDO' : (expStatus.status === 'WARNING' ? 'POR VENCER' : 'OK');

              // Join photos with a semicolon if multiple exist
              const photosStr = record.fotos && Array.isArray(record.fotos) ? record.fotos.join(' ; ') : (record.fotos || '');

              const row = [
                  fecha,
                  hora,
                  record.codigo,
                  `"${record.nombre.replace(/"/g, '""')}"`,
                  unidadMedida,
                  record.pallets || 0,
                  record.cajas || 0,
                  record.unidades || 0,
                  Number(record.cantidad).toFixed(2),
                  record.fecha_vencimiento || 'N/A',
                  diasRestantes,
                  estadoVencimiento,
                  record.accion || 'SIN ACCION',
                  Number(record.cantidad_accion || 0).toFixed(2),
                  `"${photosStr.replace(/"/g, '""')}"`,
                  record.usuario_registro
              ];
              csvRows.push(row.join(','));
          }

          const csvContent = "data:text/csv;charset=utf-8,%EF%BB%BF" + encodeURIComponent(csvRows.join("\n"));
          const link = document.createElement("a");
          link.setAttribute("href", csvContent);
          link.setAttribute("download", `registro_conteo_${downloadStartDate}_al_${downloadEndDate}.csv`);
          document.body.appendChild(link);
          link.click();
          document.body.removeChild(link);
          
          setShowDownloadModal(false);
      } catch (err: any) {
          alert("Error al descargar: " + err.message);
      } finally {
          setIsDownloading(false);
      }
  };

  const handleDownloadMatrixExcel = async () => {
      setIsDownloading(true);
      try {
          // Fetch from Supabase with date range
          let query = supabase
              .from('conteo_inventario')
              .select('*')
              .gte('fecha_registro', `${downloadStartDate}T00:00:00`)
              .lte('fecha_registro', `${downloadEndDate}T23:59:59`);

          if (currentUser?.sede_id) {
              query = query.eq('sede_id', currentUser.sede_id);
          }

          const { data, error } = await query
              .order('fecha_registro', { ascending: true });

          if (error) throw error;

          if (!data || data.length === 0) {
              alert("No se encontraron registros en el rango seleccionado.");
              return;
          }

          // Group by product code and then by expiration date for consolidation
          const matrixData: Record<string, Record<string, number>> = {};
          const productInfo: Record<string, { nombre: string, um: string, rtu: number }> = {};

          data.forEach(record => {
              const code = record.codigo;
              const expDate = record.fecha_vencimiento || 'SIN FECHA';
              
              if (!matrixData[code]) {
                  matrixData[code] = {};
                  const product = catalog.find(p => p.codigo === code);
                  productInfo[code] = {
                      nombre: product?.nombre || record.nombre,
                      um: product?.unidad_medida_sap || product?.unidad_venta || 'UND',
                      rtu: product?.unidades_por_caja || 1
                  };
              }
              
              matrixData[code][expDate] = (matrixData[code][expDate] || 0) + record.cantidad;
          });

          // Find max unique expiration dates per product to define columns
          let maxDates = 0;
          Object.values(matrixData).forEach(dates => {
              const count = Object.keys(dates).length;
              if (count > maxDates) maxDates = count;
          });

          // Prepare rows for XLSX
          const rows = [];
          for (const code in matrixData) {
              const info = productInfo[code];
              const expDates = matrixData[code];
              const sortedDates = Object.keys(expDates).sort();
              
              const totalCount = Object.values(expDates).reduce((sum, qty) => sum + qty, 0);
              
              const row: any = {
                  'COD': code,
                  'DESCRIPCION': info.nombre,
                  'UM': info.um,
                  'RTU': info.rtu,
                  'Conteo Total': Number(totalCount.toFixed(2))
              };

              // Fill STOCKx and Fechax columns using expiration dates
              sortedDates.forEach((date, idx) => {
                  row[`STOCK${idx + 1}`] = Number(expDates[date].toFixed(2));
                  
                  // Format YYYY-MM-DD to DD/MM/YYYY
                  let displayDate = date;
                  if (date !== 'SIN FECHA' && date.includes('-')) {
                      const parts = date.split('-');
                      if (parts.length === 3) {
                          displayDate = `${parts[2]}/${parts[1]}/${parts[0]}`;
                      }
                  }
                  row[`Fecha ${idx + 1}`] = displayDate;
              });

              rows.push(row);
          }

          // Define headers order
          const headers = ['COD', 'DESCRIPCION', 'UM', 'RTU', 'Conteo Total'];
          for (let i = 1; i <= maxDates; i++) {
              headers.push(`STOCK${i}`, `Fecha ${i}`);
          }

          // Create worksheet
          const ws = XLSX.utils.json_to_sheet(rows, { header: headers });
          const wb = XLSX.utils.book_new();
          XLSX.utils.book_append_sheet(wb, ws, "Inventario Matriz");

          // Export
          XLSX.writeFile(wb, `inventario_matriz_${downloadStartDate}_al_${downloadEndDate}.xlsx`);
          
          setShowDownloadModal(false);
      } catch (err: any) {
          alert("Error al descargar matriz: " + err.message);
      } finally {
          setIsDownloading(false);
      }
  };

  const handleUploadStock = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsDownloading(true);
    setUploadProgress(0);
    setUploadSuccess(false);
    
    const reader = new FileReader();
    reader.onload = async (evt) => {
        try {
            setUploadProgress(10);
            const bstr = evt.target?.result;
            const wb = XLSX.read(bstr, { type: 'binary' });
            const wsname = wb.SheetNames[0];
            const ws = wb.Sheets[wsname];
            const data = XLSX.utils.sheet_to_json(ws) as any[];

            setUploadProgress(30);
            const mapped = data.map(row => {
                // Normalize keys: lowercase and trim spaces
                const normalizedRow: any = {};
                Object.keys(row).forEach(key => {
                    normalizedRow[key.toLowerCase().trim()] = row[key];
                });

                const codigo = String(normalizedRow.codigo || normalizedRow.code || '').trim();
                const cantidad = parseFloat(normalizedRow.cantidad || normalizedRow['stock del día'] || normalizedRow.stock || normalizedRow.qty || '0');
                const costo = parseFloat(normalizedRow.costo || normalizedRow.price || '0');

                return { 
                    codigo, 
                    cantidad, 
                    costo,
                    ...(currentUser?.sede_id ? { sede_id: currentUser.sede_id } : {})
                };
            }).filter(item => item.codigo !== '');

            if (mapped.length === 0) {
                throw new Error("No se encontraron registros válidos en el archivo. Verifique que las columnas sean 'codigo', 'stock del día' y 'costo'.");
            }

            setUploadProgress(50);
            // Clear and insert
            let delQuery = supabase.from('stock_sistema').delete();
            if (currentUser?.sede_id) {
                delQuery = delQuery.eq('sede_id', currentUser.sede_id);
            }
            const { error: delError } = await delQuery.neq('codigo', '_EMPTY_');
            if (delError) throw delError;
            
            setUploadProgress(70);
            const { error: insError } = await supabase.from('stock_sistema').insert(mapped);
            if (insError) throw insError;

            setUploadProgress(100);
            setSystemStock(mapped);
            setUploadSuccess(true);
            fetchTodayCounts(); // Refresh
            
            // Auto-close after 2 seconds
            setTimeout(() => {
                setShowUploadStockModal(false);
                setUploadSuccess(false);
                setUploadProgress(0);
            }, 2000);
        } catch (err: any) {
            alert("Error al procesar archivo: " + err.message);
            setUploadProgress(0);
        } finally {
            setIsDownloading(false);
        }
    };
    reader.readAsBinaryString(file);
  };

  const handleDownloadStockTemplate = () => {
    const template = [
        { 'codigo': 'PROD001', 'stock del día': 100, 'costo': 15.50 },
        { 'codigo': 'PROD002', 'stock del día': 50, 'costo': 22.00 }
    ];
    const ws = XLSX.utils.json_to_sheet(template);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Plantilla Stock");
    XLSX.writeFile(wb, "plantilla_stock_sistema.xlsx");
  };

  const handleDownloadExpiringExcel = () => {
    if (expiringRecords.length === 0) {
        alert("No hay registros para descargar.");
        return;
    }

    try {
      const headers = ['CODIGO', 'PRODUCTO', 'UNIDAD MEDIDA', 'CANTIDAD', 'VENCIMIENTO', 'DIAS RESTANTES', 'ESTADO', 'USUARIO'];
      const csvRows = [headers.join(',')];

      for (const record of expiringRecords) {
        const product = catalog.find(p => p.id === record.producto_id || p.codigo === record.codigo);
        const unidadMedida = product?.unidad_medida_sap || product?.unidad_venta || 'UND';

        const expStatus = getExpirationStatus(record.fecha_vencimiento);
        const diasRestantes = expStatus.days === 999 ? 'N/A' : expStatus.days;
        const estadoVencimiento = expStatus.status === 'EXPIRED' ? 'VENCIDO' : (expStatus.status === 'WARNING' ? 'POR VENCER' : 'OK');

        const row = [
          record.codigo,
          `"${record.nombre.replace(/"/g, '""')}"`,
          unidadMedida,
          Number(record.cantidad).toFixed(2),
          record.fecha_vencimiento || 'N/A',
          diasRestantes,
          estadoVencimiento,
          record.usuario_registro
        ];
        csvRows.push(row.join(','));
      }

      const csvContent = "data:text/csv;charset=utf-8,%EF%BB%BF" + encodeURIComponent(csvRows.join("\n"));
      const link = document.createElement("a");
      link.setAttribute("href", csvContent);
      link.setAttribute("download", `productos_vencimiento_corto_${new Date().toISOString().split('T')[0]}.csv`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } catch (err: any) {
      alert("Error al descargar Excel: " + err.message);
    }
  };

  const handleDownloadEggPDF = async () => {
    setIsDownloading(true);
    try {
        // 1. Fetch records
        let query = supabase
            .from('conteo_inventario')
            .select('*')
            .gte('fecha_registro', `${downloadStartDate}T00:00:00`)
            .lte('fecha_registro', `${downloadEndDate}T23:59:59`);

        if (currentUser?.sede_id) {
            query = query.eq('sede_id', currentUser.sede_id);
        }

        const { data, error } = await query
            .order('fecha_registro', { ascending: true });

        if (error) throw error;
        if (!data || data.length === 0) {
            alert("No se encontraron registros en el rango seleccionado.");
            return;
        }

        // 2. Filter by category "HUEVO"
        const eggRecords = data.filter(record => {
            const product = catalog.find(p => p.codigo === record.codigo);
            return product?.categoria?.toUpperCase() === 'HUEVO';
        });

        if (eggRecords.length === 0) {
            alert("No se encontraron registros de la categoría HUEVO en este rango.");
            return;
        }

        // 3. Group by product for Matrix format
        const matrix: Record<string, Record<string, number>> = {};
        const productInfo: Record<string, { nombre: string, um: string }> = {};

        eggRecords.forEach(record => {
            const code = record.codigo;
            const expDate = record.fecha_vencimiento || 'SIN FECHA';
            
            if (!matrix[code]) {
                matrix[code] = {};
                const product = catalog.find(p => p.codigo === code);
                productInfo[code] = { 
                    nombre: record.nombre,
                    um: product?.unidad_medida_sap || product?.unidad_venta || 'UND'
                };
            }
            matrix[code][expDate] = (matrix[code][expDate] || 0) + record.cantidad;
        });

        // 4. Generate PDF
        const doc = new jsPDF('l', 'mm', 'a4');
        const pageWidth = doc.internal.pageSize.getWidth();
        const pageHeight = doc.internal.pageSize.getHeight();

        const addHeader = (pageNum: number) => {
            doc.setFontSize(20);
            doc.setFont('helvetica', 'bold');
            doc.setTextColor(0, 0, 0);
            doc.text('CONTROL DE FECHAS DE VENCIMIENTO DE HUEVOS - ICO', pageWidth / 2, 15, { align: 'center' });
            
            doc.setFontSize(12);
            doc.setFont('helvetica', 'normal');
            const operario = currentUser?.nombre || 'SISTEMA';
            const now = new Date().toLocaleString();
            doc.text(`Operario: ${operario} - ${now}`, pageWidth / 2, 22, { align: 'center' });
            
            doc.setFontSize(9);
            doc.setTextColor(150, 150, 150);
            doc.text(`Página ${pageNum}`, pageWidth - 20, 10);
        };

        const addFooter = () => {
            doc.setFontSize(9);
            doc.setFont('helvetica', 'italic');
            doc.setTextColor(100, 100, 100);
            doc.text('impreso desde logistic-pro', pageWidth / 2, pageHeight - 8, { align: 'center' });
        };

        // Prepare all rows
        const allRows: any[] = [];
        const sortedCodes = Object.keys(matrix).sort();
        
        for (const code of sortedCodes) {
            const info = productInfo[code];
            const dates = matrix[code];
            const sortedDates = Object.keys(dates).sort();
            
            const row = [
                code,
                info.nombre.toUpperCase(),
            ];

            // Add up to 5 date/qty pairs
            for (let i = 0; i < 5; i++) {
                if (sortedDates[i]) {
                    const d = sortedDates[i];
                    let displayDate = d;
                    if (d !== 'SIN FECHA' && d.includes('-')) {
                        const [y, m, d_] = d.split('-');
                        displayDate = `${d_}/${m}/${y}`;
                    }
                    const qty = dates[d];
                    row.push(`${displayDate}\n(${qty.toFixed(2)} ${info.um})`);
                } else {
                    row.push('');
                }
            }
            allRows.push(row);
        }

        // Split into pages of 5 products
        const productsPerPage = 5;
        for (let i = 0; i < allRows.length; i += productsPerPage) {
            if (i > 0) doc.addPage();
            
            const pageNum = Math.floor(i / productsPerPage) + 1;
            addHeader(pageNum);
            
            const pageRows = allRows.slice(i, i + productsPerPage);
            
            autoTable(doc, {
                startY: 30,
                head: [['COD', 'PRODUCTO', 'VENC. 1', 'VENC. 2', 'VENC. 3', 'VENC. 4', 'VENC. 5']],
                body: pageRows,
                theme: 'grid',
                headStyles: {
                    fillColor: [0, 158, 214],
                    textColor: 255,
                    fontSize: 11,
                    fontStyle: 'bold',
                    halign: 'center',
                    valign: 'middle',
                    cellPadding: 3
                },
                bodyStyles: {
                    fontSize: 11,
                    fontStyle: 'bold',
                    halign: 'center',
                    valign: 'middle',
                    cellPadding: 4,
                    textColor: 50
                },
                columnStyles: {
                    0: { cellWidth: 25, fontSize: 10 },
                    1: { cellWidth: 75, halign: 'left', fontSize: 10 },
                },
                margin: { top: 30, bottom: 15 },
                didDrawPage: () => {
                    addFooter();
                }
            });
        }
        
        doc.save(`reporte_huevos_matriz_${downloadStartDate}.pdf`);
        setShowDownloadModal(false);
    } catch (err: any) {
        alert("Error al generar PDF de huevos: " + err.message);
    } finally {
        setIsDownloading(false);
    }
  };

  const handleDownloadPDF = async () => {
    setIsDownloading(true);
    try {
        let query = supabase
            .from('conteo_inventario')
            .select('*')
            .gte('fecha_registro', `${downloadStartDate}T00:00:00`)
            .lte('fecha_registro', `${downloadEndDate}T23:59:59`);

        if (currentUser?.sede_id) {
            query = query.eq('sede_id', currentUser.sede_id);
        }

        const { data, error } = await query
            .order('fecha_registro', { ascending: false });

        if (error) throw error;
        if (!data || data.length === 0) {
            alert("No se encontraron registros.");
            return;
        }

        const bodyRows: any[] = [];
        for (const record of data) {
            const dateObj = new Date(record.fecha_registro);
            const product = catalog.find(p => p.id === record.producto_id || p.codigo === record.codigo);
            const unidadMedida = product?.unidad_medida_sap || product?.unidad_venta || 'UND';
            
            // Calculate expiration status
            const expStatus = getExpirationStatus(record.fecha_vencimiento);
            const diasRestantes = expStatus.days === 999 ? 'N/A' : expStatus.days;
            const estadoVencimiento = expStatus.status === 'EXPIRED' ? 'VENCIDO' : (expStatus.status === 'WARNING' ? 'POR VENCER' : 'OK');

            bodyRows.push({
                fecha: dateObj.toLocaleDateString(),
                hora: dateObj.toLocaleTimeString(),
                codigo: record.codigo,
                producto: record.nombre,
                um: unidadMedida,
                cant: Number(record.cantidad).toFixed(2),
                vencimiento: record.fecha_vencimiento || 'N/A',
                dias: diasRestantes,
                estado: estadoVencimiento,
                accion: record.accion || '-',
                cant_accion: Number(record.cantidad_accion || 0).toFixed(2),
                usuario: record.usuario_registro,
                fotos: record.fotos || []
            });
        }

        // Pre-fetch images
        const imageMap = new Map();
        for (const row of bodyRows) {
            if (row.fotos && row.fotos.length > 0) {
                try {
                    const url = row.fotos[0];
                    const base64 = await getBase64Image(url);
                    imageMap.set(url, base64);
                } catch (e) {
                    console.error("Error loading image", e);
                }
            }
        }

        const reportDoc = new jsPDF('l', 'mm', 'a4');
        reportDoc.setFontSize(16);
        reportDoc.text('REPORTE DE CONTEO DE INVENTARIO', 14, 15);
        reportDoc.setFontSize(10);
        reportDoc.text(`Generado el: ${new Date().toLocaleString()}`, 14, 22);
        reportDoc.text(`Rango: ${downloadStartDate} al ${downloadEndDate}`, 14, 27);

        autoTable(reportDoc, {
            startY: 35,
            head: [['FECHA', 'HORA', 'CODIGO', 'PRODUCTO', 'U.M', 'CANT', 'VENC.', 'DIAS', 'ESTADO', 'ACCION', 'C. ACCION', 'FOTO', 'USUARIO']],
            body: bodyRows.map(r => [r.fecha, r.hora, r.codigo, r.producto, r.um, r.cant, r.vencimiento, r.dias, r.estado, r.accion, r.cant_accion, '', r.usuario]),
            theme: 'grid',
            styles: { fontSize: 6, valign: 'middle' },
            columnStyles: {
                3: { cellWidth: 35 },
                11: { cellWidth: 25, minCellHeight: 20 }
            },
            didDrawCell: (dataCell) => {
                if (dataCell.section === 'body' && dataCell.column.index === 11) {
                    const rowIndex = dataCell.row.index;
                    const rowData = bodyRows[rowIndex];
                    if (rowData.fotos && rowData.fotos.length > 0) {
                        const base64 = imageMap.get(rowData.fotos[0]);
                        if (base64) {
                            const x = dataCell.cell.x + 2;
                            const y = dataCell.cell.y + 2;
                            const w = dataCell.cell.width - 4;
                            const h = dataCell.cell.height - 4;
                            reportDoc.addImage(base64, 'JPEG', x, y, w, h);
                        }
                    }
                }
            }
        });

        reportDoc.save(`reporte_inventario_${downloadStartDate}_${downloadEndDate}.pdf`);
        setShowDownloadModal(false);
    } catch (err: any) {
        alert("Error al generar PDF: " + err.message);
    } finally {
        setIsDownloading(false);
    }
  };

  const getBase64Image = (url: string): Promise<string> => {
    return new Promise((resolve, reject) => {
        const img = new Image();
        img.setAttribute('crossOrigin', 'anonymous');
        img.onload = () => {
            const canvas = document.createElement('canvas');
            canvas.width = img.width;
            canvas.height = img.height;
            const ctx = canvas.getContext('2d');
            ctx?.drawImage(img, 0, 0);
            resolve(canvas.toDataURL('image/jpeg', 0.7));
        };
        img.onerror = reject;
        img.src = url;
    });
  };

  const handleExportInventory = () => {
      // Headers
      const headers = ['EAN', 'NOMBRE', 'CANTIDAD', 'FECHA DE VENCIMIENTO'];
      const csvRows = [headers.join(',')];

      for(const item of inventory) {
          const row = [
              item.productCode,
              `"${item.productName.replace(/"/g, '""')}"`,
              Number(item.quantity).toFixed(2),
              item.expirationDate
          ];
          csvRows.push(row.join(','));
      }

      // Add BOM for Excel UTF-8 compatibility (%EF%BB%BF)
      const csvContent = "data:text/csv;charset=utf-8,%EF%BB%BF" + encodeURIComponent(csvRows.join("\n"));
      const link = document.createElement("a");
      link.setAttribute("href", csvContent);
      link.setAttribute("download", `inventario_completo_${new Date().toISOString().slice(0,10)}.csv`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
  };

  // --- STATS LOGIC ---
  const filteredTodayCounts = useMemo(() => {
    const term = debouncedSearchTerm.toLowerCase().trim();
    if (!term) return todayCounts;
    return todayCounts.filter(c => {
        const matchesCount = c.nombre.toLowerCase().includes(term) || 
                             c.codigo.toLowerCase().includes(term);
        if (matchesCount) return true;
        
        // Match by brand, category, or SKU from the catalog table
        const product = catalog.find(p => p.codigo === c.codigo || p.id === c.producto_id);
        if (!product) return false;
        
        return (product.sku && product.sku.toLowerCase().includes(term)) ||
               (product.marca && product.marca.toLowerCase().includes(term)) ||
               (product.categoria && product.categoria.toLowerCase().includes(term));
    });
  }, [todayCounts, debouncedSearchTerm, catalog]);

  const totalPagesCounts = Math.ceil(filteredTodayCounts.length / itemsPerPage);
  const paginatedTodayCounts = useMemo(() => {
    const start = (currentPage - 1) * itemsPerPage;
    return filteredTodayCounts.slice(start, start + itemsPerPage);
  }, [filteredTodayCounts, currentPage]);

  const recountItems = useMemo(() => {
    // 1. Consolidate theoretical stock from SYSTEM STOCK (stock_sistema table)
    const theoreticalStock: Record<string, { nombre: string, cantidad: number, categoria: string, peso: number, costo: number, zona: string }> = {};
    systemStock.forEach(item => {
      if (!theoreticalStock[item.codigo]) {
        const product = catalog.find(p => p.codigo === item.codigo);
        theoreticalStock[item.codigo] = { 
            nombre: product?.nombre || 'Desconocido', 
            cantidad: 0,
            categoria: product?.categoria || 'GENERAL',
            peso: product?.peso_unitario || 0,
            costo: item.costo || 0,
            zona: product?.zona_predeterminada || 'SECO'
        };
      }
      theoreticalStock[item.codigo].cantidad += item.cantidad;
    });

    // 2. Consolidate today's counts
    const countedStock: Record<string, number> = {};
    todayCounts.forEach(record => {
      if (!countedStock[record.codigo]) {
        countedStock[record.codigo] = 0;
      }
      countedStock[record.codigo] += record.cantidad;
    });

    // 3. Compare and filter differences
    const results: { codigo: string, nombre: string, theoretical: number, counted: number, diff: number, percentage: number, categoria: string, peso: number, costo: number, zona: string }[] = [];
    
    const allCodes = new Set([...Object.keys(countedStock), ...Object.keys(theoreticalStock)]);

    allCodes.forEach(codigo => {
      const counted = countedStock[codigo] || 0;
      const theoretical = theoreticalStock[codigo]?.cantidad || 0;
      const product = catalog.find(p => p.codigo === codigo);
      const info = theoreticalStock[codigo] || { 
          nombre: todayCounts.find(c => c.codigo === codigo)?.nombre || product?.nombre || 'Desconocido',
          categoria: product?.categoria || 'GENERAL',
          peso: product?.peso_unitario || 0,
          costo: 0,
          zona: product?.zona_predeterminada || 'SECO'
      };
      
      const diff = counted - theoretical;
      if (Math.abs(diff) < 0.01) return; 

      const percentage = theoretical > 0 ? (diff / theoretical) : (counted > 0 ? 1 : 0);

      results.push({ 
          codigo, 
          nombre: info.nombre, 
          theoretical, 
          counted, 
          diff, 
          percentage: percentage * 100,
          categoria: info.categoria,
          peso: info.peso,
          costo: info.costo,
          zona: info.zona
      });
    });

    // Apply Zone Filter
    const filteredResults = recountZoneFilter === 'TODOS' 
        ? results 
        : results.filter(i => i.zona === recountZoneFilter);

    return filteredResults.sort((a, b) => Math.abs(b.diff) - Math.abs(a.diff));
  }, [systemStock, todayCounts, catalog, recountZoneFilter]);

  const crossOverItems = useMemo(() => {
    const crosses: { 
        itemA: typeof recountItems[0], 
        itemB: typeof recountItems[0], 
        amount: number,
        category: string,
        weight: number,
        zone: string
    }[] = [];

    // Group by zone, category and weight
    const groups: Record<string, typeof recountItems> = {};
    recountItems.forEach(item => {
        const key = `${item.zona}_${item.categoria.toUpperCase()}_${item.peso}`;
        if (!groups[key]) groups[key] = [];
        groups[key].push(item);
    });

    Object.entries(groups).forEach(([key, items]) => {
        const [zone, category, weight] = key.split('_');
        const surplus = items.filter(i => i.diff > 0).sort((a, b) => b.diff - a.diff);
        const deficit = items.filter(i => i.diff < 0).sort((a, b) => a.diff - b.diff);

        let sIdx = 0;
        while (sIdx < surplus.length) {
            const sItem = surplus[sIdx];
            let dIdx = 0;
            while (dIdx < deficit.length) {
                const dItem = deficit[dIdx];
                
                // COST SIMILARITY CHECK: Max 10% difference in cost
                const costDiff = Math.abs(sItem.costo - dItem.costo);
                const maxAllowedCostDiff = Math.max(sItem.costo, dItem.costo) * 0.1;
                
                if (costDiff <= maxAllowedCostDiff && dItem.diff < 0) {
                    const amount = Math.min(sItem.diff, Math.abs(dItem.diff));
                    if (amount > 0) {
                        crosses.push({
                            itemA: { ...sItem },
                            itemB: { ...dItem },
                            amount,
                            category,
                            weight: parseFloat(weight),
                            zone
                        });
                        
                        sItem.diff -= amount;
                        dItem.diff += amount;
                    }
                }
                if (sItem.diff <= 0) break;
                dIdx++;
            }
            sIdx++;
        }
    });

    return crosses;
  }, [recountItems]);

  const handleDownloadCrosses = () => {
    if (crossOverItems.length === 0) {
        alert("No hay cruces para descargar.");
        return;
    }

    const rows = crossOverItems.map(c => ({
        'CATEGORIA': c.category,
        'PESO': c.weight,
        'CANTIDAD CRUCE': c.amount,
        'CODIGO SOBRA': c.itemA.codigo,
        'PRODUCTO SOBRA': c.itemA.nombre,
        'DIFERENCIA SOBRA': c.itemA.diff + c.amount,
        'COSTO SOBRA': c.itemA.costo,
        'CODIGO FALTA': c.itemB.codigo,
        'PRODUCTO FALTA': c.itemB.nombre,
        'DIFERENCIA FALTA': c.itemB.diff - c.amount,
        'COSTO FALTA': c.itemB.costo,
        'IMPACTO ESTIMADO': c.amount * c.itemA.costo
    }));

    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Cruces Detectados");
    XLSX.writeFile(wb, `cruces_inventario_${new Date().toISOString().split('T')[0]}.xlsx`);
  };

  const getZoneStats = (type: ZoneType) => {
      const zoneProducts = catalog.filter(p => p.zona_predeterminada === type);
      const totalCatalog = zoneProducts.length;
      
      // Found codes in inventory for this zone type
      const inventoryCodes = new Set(inventory.map(i => i.productCode));
      
      const foundCount = zoneProducts.filter(p => inventoryCodes.has(p.codigo)).length;
      const missingCount = totalCatalog - foundCount;
      const missingItems = zoneProducts.filter(p => !inventoryCodes.has(p.codigo));

      return { totalCatalog, foundCount, missingCount, missingItems };
  };

  // Fix: ZoneType values SECO, REFRIGERADO, CONGELADO
  const statsDry = getZoneStats('SECO');
  const statsCold = getZoneStats('REFRIGERADO');
  const statsFrozen = getZoneStats('CONGELADO');

  const photoModalItem = photoItemLPN ? inventory.find(i => i.lpn === photoItemLPN) : null;

  return (
    <div className="flex flex-col h-full bg-slate-50 relative">
        {/* Tab Navigation & Header */}
        <div className="bg-white border-b border-gray-200 px-2 pt-2 flex flex-wrap justify-between items-center sticky top-0 z-20 shadow-sm">
            <div className="flex items-center gap-2 overflow-x-auto no-scrollbar w-full md:w-auto">
                <button
                    onClick={() => setActiveTab('COUNT')}
                    className={`pb-3 px-3 text-xs md:text-sm font-bold border-b-2 transition-colors flex items-center gap-1 whitespace-nowrap ${activeTab === 'COUNT' ? 'border-blue-600 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700'}`}
                >
                    <ClipboardList className="w-4 h-4"/>
                    Toma Inventario
                </button>
                <button
                    onClick={() => setActiveTab('LIST')}
                    className={`pb-3 px-3 text-xs md:text-sm font-bold border-b-2 transition-colors whitespace-nowrap ${activeTab === 'LIST' ? 'border-blue-600 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700'}`}
                >
                    Listado
                </button>
                <button
                    onClick={() => setActiveTab('RECOUNT')}
                    className={`pb-3 px-3 text-xs md:text-sm font-bold border-b-2 transition-colors flex items-center gap-1 whitespace-nowrap ${activeTab === 'RECOUNT' ? 'border-blue-600 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700'}`}
                >
                    <RefreshCw className="w-4 h-4"/>
                    Reconteo
                    {recountItems.length > 0 && (
                        <span className="bg-red-500 text-white text-[10px] px-1.5 py-0.5 rounded-full ml-1 animate-pulse">
                            {recountItems.length}
                        </span>
                    )}
                </button>
            </div>
            
            {activeTab === 'LIST' && (
                <div className="flex items-center gap-2 mb-2 ml-auto">
                    <button 
                        onClick={() => setShowStatsModal(true)}
                        className="flex items-center gap-2 bg-blue-600 text-white px-3 py-1.5 rounded-lg text-xs font-bold hover:bg-blue-700"
                    >
                        <BarChart3 className="w-4 h-4"/> Estadísticas
                    </button>
                    <button 
                        onClick={handleExportSession}
                        className="flex items-center gap-2 bg-green-600 text-white px-3 py-1.5 rounded-lg text-xs font-bold hover:bg-green-700"
                    >
                        <FileSpreadsheet className="w-4 h-4"/> Excel
                    </button>
                </div>
            )}
        </div>

        {/* --- VIEW: TODAY'S COUNTS LIST --- */}
        {activeTab === 'LIST' && (
            <>
                <div className="bg-white p-4 shadow-sm border-b border-gray-200">
                    <div className="relative">
                        <input 
                            type="text" 
                            placeholder="Buscar en conteos de hoy..."
                            className="w-full pl-10 pr-4 py-3 border border-gray-300 rounded-lg shadow-sm focus:ring-2 focus:ring-blue-500 outline-none"
                            value={searchTerm}
                            onChange={e => setSearchTerm(e.target.value)}
                        />
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 w-5 h-5"/>
                    </div>
                    <p className="text-[10px] font-bold text-gray-400 uppercase mt-2">Mostrando solo conteos realizados hoy</p>
                </div>

                <div className="flex-1 overflow-y-auto p-2 md:p-4 space-y-2 pb-20">
                    {isLoadingCounts ? (
                        <div className="text-center py-10 text-gray-400">Cargando conteos...</div>
                    ) : paginatedTodayCounts.length === 0 ? (
                        <div className="text-center text-gray-500 py-10">
                            No se han realizado conteos hoy.
                        </div>
                    ) : (
                        paginatedTodayCounts.map(item => {
                            const expStatus = getExpirationStatus(item.fecha_vencimiento);
                            const product = catalog.find(p => p.codigo === item.codigo || p.id === item.producto_id);
                            
                            return (
                                <div key={item.id} className={`bg-white rounded-lg shadow-sm border p-3 flex flex-col gap-2 ${expStatus.status !== 'OK' ? 'border-red-300' : 'border-gray-200'}`}>
                                    <div className="flex justify-between items-start">
                                        <div>
                                            <h3 className="font-bold text-gray-900 leading-tight text-sm md:text-base break-words">{item.nombre}</h3>
                                            <div className="flex flex-wrap gap-2 items-center mt-1">
                                                <span className="text-sm font-black text-blue-600 font-mono tracking-tight">EAN: {item.codigo}</span>
                                                {product && product.sku && (
                                                    <span className="text-[10px] bg-blue-50 text-blue-700 px-1.5 py-0.5 rounded font-mono font-bold">SKU: {product.sku}</span>
                                                )}
                                                {product && product.marca && (
                                                    <span className="text-[10px] bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded font-bold">{product.marca}</span>
                                                )}
                                                {product && product.categoria && (
                                                    <span className="text-[10px] bg-slate-100 text-slate-500 px-1.5 py-0.5 rounded italic">{product.categoria}</span>
                                                )}
                                                {product && (
                                                    <span className={`px-1.5 py-0.5 rounded text-[8px] font-black uppercase tracking-wider ${
                                                        product.zona_predeterminada === 'SECO' ? 'bg-amber-100 text-amber-800' :
                                                        product.zona_predeterminada === 'REFRIGERADO' ? 'bg-blue-100 text-blue-800' :
                                                        'bg-indigo-100 text-indigo-800'
                                                    }`}>
                                                        {product.zona_predeterminada}
                                                    </span>
                                                )}
                                            </div>
                                        </div>
                                        <div className="flex flex-col items-end gap-1">
                                            <div className="text-[10px] text-gray-400 font-bold">{new Date(item.fecha_registro).toLocaleTimeString()}</div>
                                            {expStatus.status !== 'OK' && (
                                                <div className={`shrink-0 px-2 py-0.5 rounded text-[10px] font-bold flex items-center gap-1 ${expStatus.color}`}>
                                                    <AlertTriangle className="w-3 h-3"/>
                                                    {expStatus.status === 'EXPIRED' ? 'VENCIDO' : `${expStatus.days} días`}
                                                </div>
                                            )}
                                        </div>
                                    </div>

                                    <div className="grid grid-cols-2 gap-4 items-center bg-slate-50 p-2 rounded-lg">
                                        <div>
                                            <label className="text-[8px] uppercase font-bold text-gray-400 block">Cantidad Total</label>
                                            <div className="font-black text-lg text-gray-800">
                                                {Number(item.cantidad).toFixed(2)}
                                            </div>
                                            {(item.pallets !== undefined || item.cajas !== undefined || item.unidades !== undefined) && (
                                                <div className="text-[10px] text-blue-600 font-bold mt-1">
                                                    {item.pallets || 0}P | {item.cajas || 0}C | {item.unidades || 0}U
                                                </div>
                                            )}
                                        </div>
                                        <div>
                                            <label className="text-[8px] uppercase font-bold text-gray-400 block">Vencimiento</label>
                                            <div className={`font-bold text-sm ${expStatus.status !== 'OK' ? 'text-red-600' : 'text-gray-800'}`}>
                                                {item.fecha_vencimiento || 'N/A'}
                                            </div>
                                        </div>
                                    </div>

                                    <div className="flex justify-between items-center pt-2 border-t border-gray-50 mt-1">
                                        <div className="flex gap-2">
                                            <button 
                                                onClick={() => {
                                                    setEditingCount(item);
                                                    setEditQty(item.cantidad.toString());
                                                    setEditDate(item.fecha_vencimiento);
                                                }}
                                                className="text-[10px] font-black uppercase text-blue-600 hover:bg-blue-50 px-3 py-1.5 rounded-lg border border-blue-100 transition-all"
                                            >
                                                Editar
                                            </button>
                                        </div>
                                        
                                        <div className="text-[10px] text-gray-400 font-bold italic">Por: {item.usuario_registro}</div>
                                    </div>
                                </div>
                            );
                        })
                    )}

                    {/* PAGINACIÓN */}
                    {totalPagesCounts > 1 && (
                        <div className="flex flex-col md:flex-row justify-between items-center gap-4 bg-white p-6 rounded-2xl shadow-sm border border-gray-200 mt-4">
                            <p className="text-[10px] font-black uppercase text-gray-400 tracking-widest">
                                Mostrando {Math.min(filteredTodayCounts.length, (currentPage - 1) * itemsPerPage + 1)} - {Math.min(filteredTodayCounts.length, currentPage * itemsPerPage)} de {filteredTodayCounts.length} conteos
                            </p>
                            <div className="flex items-center gap-2">
                                <button 
                                    disabled={currentPage === 1}
                                    onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                                    className="p-2 rounded-xl bg-gray-50 text-gray-400 disabled:opacity-30 hover:bg-gray-100 transition-all"
                                >
                                    <ChevronLeft className="w-5 h-5" />
                                </button>
                                <div className="flex items-center gap-1">
                                    {[...Array(Math.min(5, totalPagesCounts))].map((_, i) => {
                                        let pageNum = currentPage;
                                        if (currentPage <= 3) pageNum = i + 1;
                                        else if (currentPage >= totalPagesCounts - 2) pageNum = totalPagesCounts - 4 + i;
                                        else pageNum = currentPage - 2 + i;
                                        if (pageNum <= 0 || pageNum > totalPagesCounts) return null;
                                        return (
                                            <button
                                                key={pageNum}
                                                onClick={() => setCurrentPage(pageNum)}
                                                className={`w-10 h-10 rounded-xl text-[10px] font-black transition-all ${currentPage === pageNum ? 'bg-blue-600 text-white shadow-lg shadow-blue-600/20' : 'bg-gray-50 text-gray-400 hover:bg-gray-100'}`}
                                            >
                                                {pageNum}
                                            </button>
                                        );
                                    })}
                                </div>
                                <button 
                                    disabled={currentPage === totalPagesCounts}
                                    onClick={() => setCurrentPage(prev => Math.min(totalPagesCounts, prev + 1))}
                                    className="p-2 rounded-xl bg-gray-50 text-gray-400 disabled:opacity-30 hover:bg-gray-100 transition-all"
                                >
                                    <ChevronRight className="w-5 h-5" />
                                </button>
                            </div>
                        </div>
                    )}
                </div>
            </>
        )}

        {/* --- VIEW: RECOUNT (DIFERENCIAS GRANDES) --- */}
        {activeTab === 'RECOUNT' && (
            <div className="flex-1 overflow-y-auto p-2 md:p-4 space-y-4 pb-20">
                <div className="bg-white p-4 rounded-xl border border-blue-200 shadow-sm flex flex-col md:flex-row justify-between items-center gap-4">
                    <div className="flex-1">
                        <div className="flex items-center gap-3 text-blue-600 mb-2">
                            <RefreshCw className="w-6 h-6" />
                            <h2 className="font-black uppercase tracking-tight">Auditoría de Inventario</h2>
                        </div>
                        <p className="text-xs text-gray-500">Compare los conteos físicos de hoy con el stock teórico cargado para identificar discrepancias y posibles cruces.</p>
                    </div>
                    <button 
                        onClick={() => setShowUploadStockModal(true)}
                        className="bg-[#009ED6] text-white px-4 py-2 rounded-xl text-xs font-black hover:bg-[#0088b9] transition-all flex items-center gap-2"
                    >
                        <Upload className="w-4 h-4" />
                        CARGAR STOCK DEL DÍA
                    </button>
                </div>

                {/* Sub-Tabs for Recount */}
                <div className="flex flex-col md:flex-row gap-4 items-start md:items-center">
                    <div className="flex bg-gray-100 p-1 rounded-xl w-full md:w-max">
                        <button 
                            onClick={() => setRecountSubTab('DIFERENCIAS')}
                            className={`flex-1 md:w-40 py-2 rounded-lg text-[10px] font-black uppercase transition-all flex items-center justify-center gap-2 ${recountSubTab === 'DIFERENCIAS' ? 'bg-white text-blue-600 shadow-sm' : 'text-gray-400'}`}
                        >
                            <AlertTriangle className="w-3 h-3" />
                            Diferencias ({recountItems.filter(i => Math.abs(i.percentage) > 10).length})
                        </button>
                        <button 
                            onClick={() => setRecountSubTab('CRUCES')}
                            className={`flex-1 md:w-40 py-2 rounded-lg text-[10px] font-black uppercase transition-all flex items-center justify-center gap-2 ${recountSubTab === 'CRUCES' ? 'bg-white text-blue-600 shadow-sm' : 'text-gray-400'}`}
                        >
                            <RefreshCw className="w-3 h-3" />
                            Cruces ({crossOverItems.length})
                        </button>
                    </div>

                    {/* Zone Filters */}
                    <div className="flex bg-gray-100 p-1 rounded-xl w-full md:w-max">
                        {['TODOS', 'SECO', 'REFRIGERADO', 'CONGELADO'].map(zone => (
                            <button
                                key={zone}
                                onClick={() => setRecountZoneFilter(zone)}
                                className={`flex-1 px-4 py-2 rounded-lg text-[10px] font-black uppercase transition-all ${recountZoneFilter === zone ? 'bg-white text-blue-600 shadow-sm' : 'text-gray-400'}`}
                            >
                                {zone}
                            </button>
                        ))}
                    </div>
                </div>

                {recountSubTab === 'DIFERENCIAS' ? (
                    <>
                        <div className="bg-amber-50 p-4 rounded-xl border border-amber-200">
                            <div className="flex items-center gap-3 text-amber-600 mb-1">
                                <AlertTriangle className="w-5 h-5" />
                                <h3 className="font-black uppercase text-xs tracking-tight">Diferencias Críticas (+/- 10%)</h3>
                            </div>
                            <p className="text-[10px] text-amber-700 font-medium">Productos con variaciones significativas que requieren revisión inmediata.</p>
                        </div>

                        {recountItems.filter(i => Math.abs(i.percentage) > 10).length === 0 ? (
                            <div className="text-center py-20 bg-white rounded-2xl border border-gray-100">
                                <CheckCircle className="w-12 h-12 text-green-500 mx-auto mb-4 opacity-20" />
                                <p className="text-gray-400 font-bold">No hay diferencias críticas detectadas hoy.</p>
                            </div>
                        ) : (
                            <div className="grid grid-cols-1 gap-3">
                                {recountItems.filter(i => Math.abs(i.percentage) > 10).map(item => (
                                    <div key={item.codigo} className="bg-white rounded-2xl shadow-sm border border-gray-200 p-4 hover:border-blue-300 transition-all group">
                                        <div className="flex justify-between items-start mb-3">
                                            <div className="flex-1">
                                                <h3 className="font-black text-gray-900 group-hover:text-blue-600 transition-colors leading-tight">{item.nombre}</h3>
                                                <div className="text-xs font-bold text-gray-400 font-mono mt-1">{item.codigo}</div>
                                            </div>
                                            <div className={`px-3 py-1 rounded-full text-xs font-black shrink-0 ${item.percentage > 0 ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                                                {item.percentage > 0 ? '+' : ''}{item.percentage.toFixed(1)}%
                                            </div>
                                        </div>

                                        <div className="grid grid-cols-3 gap-2">
                                            <div className="bg-slate-50 p-3 rounded-xl border border-slate-100">
                                                <span className="text-[8px] font-black uppercase text-gray-400 block mb-1">Teórico</span>
                                                <span className="text-sm font-black text-gray-700">{item.theoretical.toFixed(2)}</span>
                                            </div>
                                            <div className="bg-slate-50 p-3 rounded-xl border border-slate-100">
                                                <span className="text-[8px] font-black uppercase text-gray-400 block mb-1">Físico</span>
                                                <span className="text-sm font-black text-gray-700">{item.counted.toFixed(2)}</span>
                                            </div>
                                            <div className={`p-3 rounded-xl border ${Math.abs(item.diff) > 0 ? 'bg-amber-50 border-amber-100' : 'bg-slate-50 border-slate-100'}`}>
                                                <span className="text-[8px] font-black uppercase text-gray-400 block mb-1">Diferencia</span>
                                                <span className={`text-sm font-black ${item.diff > 0 ? 'text-green-600' : 'text-red-600'}`}>
                                                    {item.diff > 0 ? '+' : ''}{item.diff.toFixed(2)}
                                                </span>
                                            </div>
                                        </div>

                                        <div className="mt-4 flex justify-end">
                                            <button 
                                                onClick={() => {
                                                    setCountSearch(item.codigo);
                                                    setActiveTab('COUNT');
                                                    const prod = catalog.find(p => p.codigo === item.codigo);
                                                    if (prod) setCountProduct(prod);
                                                }}
                                                className="flex items-center gap-2 bg-blue-600 text-white px-4 py-2 rounded-xl text-xs font-black hover:bg-blue-700 transition-all shadow-lg shadow-blue-600/20 active:scale-95"
                                            >
                                                <RefreshCw className="w-4 h-4" />
                                                RECONTAR AHORA
                                            </button>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </>
                ) : (
                    <>
                        <div className="bg-blue-50 p-4 rounded-xl border border-blue-200 flex flex-col md:flex-row justify-between items-center gap-4">
                            <div className="flex-1">
                                <div className="flex items-center gap-3 text-blue-600 mb-1">
                                    <RefreshCw className="w-5 h-5" />
                                    <h3 className="font-black uppercase text-xs tracking-tight">Cruces Detectados</h3>
                                </div>
                                <p className="text-[10px] text-blue-700 font-medium">Productos de la misma categoría, peso y costo similar con diferencias opuestas.</p>
                            </div>
                            <button 
                                onClick={handleDownloadCrosses}
                                className="bg-emerald-600 text-white px-4 py-2 rounded-xl text-[10px] font-black hover:bg-emerald-700 transition-all flex items-center gap-2"
                            >
                                <FileSpreadsheet className="w-4 h-4" />
                                DESCARGAR CRUCES (XLSX)
                            </button>
                        </div>

                        {crossOverItems.length === 0 ? (
                            <div className="text-center py-20 bg-white rounded-2xl border border-gray-100">
                                <CheckCircle className="w-12 h-12 text-blue-500 mx-auto mb-4 opacity-20" />
                                <p className="text-gray-400 font-bold">No se detectaron cruces potenciales.</p>
                            </div>
                        ) : (
                            <div className="grid grid-cols-1 gap-4">
                                {crossOverItems.map((cross, idx) => (
                                    <div key={idx} className="bg-white rounded-2xl shadow-lg border border-blue-100 overflow-hidden">
                                        <div className="bg-blue-600 px-4 py-2 flex justify-between items-center">
                                            <span className="text-[10px] font-black text-white uppercase tracking-widest">Posible Cruce: {cross.amount.toFixed(2)} Unidades</span>
                                            <span className="text-[10px] font-bold text-blue-100 uppercase">{cross.zone} | {cross.category} | {cross.weight} KG</span>
                                        </div>
                                        <div className="p-4 grid grid-cols-1 md:grid-cols-2 gap-4 relative">
                                            <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-10 hidden md:block">
                                                <div className="bg-blue-100 text-blue-600 p-2 rounded-full shadow-md border-2 border-white">
                                                    <RefreshCw className="w-4 h-4" />
                                                </div>
                                            </div>

                                            {/* Item A: Surplus */}
                                            <div className="bg-green-50/50 p-3 rounded-xl border border-green-100">
                                                <div className="flex justify-between items-start mb-2">
                                                    <div className="flex-1">
                                                        <h4 className="font-black text-gray-900 text-xs uppercase leading-tight">{cross.itemA.nombre}</h4>
                                                        <span className="text-[10px] font-mono text-gray-500 font-bold">{cross.itemA.codigo}</span>
                                                    </div>
                                                    <span className="text-xs font-black text-green-600 shrink-0">SOBRA: +{cross.itemA.diff.toFixed(2)}</span>
                                                </div>
                                                <div className="text-[9px] font-bold text-gray-400 mb-2">COSTO: S/ {cross.itemA.costo.toFixed(2)}</div>
                                                <button 
                                                    onClick={() => {
                                                        setCountSearch(cross.itemA.codigo);
                                                        setActiveTab('COUNT');
                                                        const prod = catalog.find(p => p.codigo === cross.itemA.codigo);
                                                        if (prod) setCountProduct(prod);
                                                    }}
                                                    className="w-full mt-2 py-1.5 bg-white border border-green-200 text-green-700 rounded-lg text-[10px] font-black hover:bg-green-100 transition-all"
                                                >
                                                    RECONTAR ESTE
                                                </button>
                                            </div>

                                            {/* Item B: Deficit */}
                                            <div className="bg-red-50/50 p-3 rounded-xl border border-red-100">
                                                <div className="flex justify-between items-start mb-2">
                                                    <div className="flex-1">
                                                        <h4 className="font-black text-gray-900 text-xs uppercase leading-tight">{cross.itemB.nombre}</h4>
                                                        <span className="text-[10px] font-mono text-gray-500 font-bold">{cross.itemB.codigo}</span>
                                                    </div>
                                                    <span className="text-xs font-black text-red-600 shrink-0">FALTA: {cross.itemB.diff.toFixed(2)}</span>
                                                </div>
                                                <div className="text-[9px] font-bold text-gray-400 mb-2">COSTO: S/ {cross.itemB.costo.toFixed(2)}</div>
                                                <button 
                                                    onClick={() => {
                                                        setCountSearch(cross.itemB.codigo);
                                                        setActiveTab('COUNT');
                                                        const prod = catalog.find(p => p.codigo === cross.itemB.codigo);
                                                        if (prod) setCountProduct(prod);
                                                    }}
                                                    className="w-full mt-2 py-1.5 bg-white border border-red-200 text-red-700 rounded-lg text-[10px] font-black hover:bg-red-100 transition-all"
                                                >
                                                    RECONTAR ESTE
                                                </button>
                                            </div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </>
                )}
            </div>
        )}

        {/* --- VIEW: STOCKTAKE (BARRIDO) --- */}
        {activeTab === 'COUNT' && (
            <div className="flex flex-col h-full overflow-hidden relative">
                
                <div className="flex flex-col md:flex-row flex-1 overflow-hidden">
                    {/* Left: Input Form (SCROLLABLE BEHIND BUTTON) */}
                    <div className="w-full md:w-2/3 p-2 md:p-6 overflow-y-auto pb-32 md:pb-6 custom-scrollbar">
                        <div className="max-w-xl mx-auto space-y-3 md:space-y-8 relative">
                            
                            {/* Download Session Records Button */}
                            <div className="absolute right-0 -top-1 md:top-0 z-10 flex gap-2">
                                <button 
                                    type="button"
                                    onClick={() => {
                                        setShowExpAlerts(true);
                                        fetchExpiringSoon();
                                    }}
                                    className={`relative p-1.5 md:p-2 border rounded-full transition-all flex items-center justify-center shadow-sm ${
                                        expiringRecords.some(r => {
                                            const status = getExpirationStatus(r.fecha_vencimiento);
                                            return status.days <= 5;
                                        }) 
                                        ? 'bg-red-50 text-red-600 border-red-200 hover:bg-red-100' 
                                        : expiringRecords.some(r => {
                                            const status = getExpirationStatus(r.fecha_vencimiento);
                                            return status.days > 5 && status.days <= 15;
                                        })
                                        ? 'bg-orange-50 text-orange-600 border-orange-200 hover:bg-orange-100'
                                        : expiringRecords.length > 0
                                        ? 'bg-emerald-50 text-emerald-600 border-emerald-200 hover:bg-emerald-100'
                                        : 'bg-gray-50 text-gray-400 border-gray-200 hover:bg-gray-100'
                                    }`}
                                    title="Próximos a vencer"
                                >
                                    <Bell className={`w-4 h-4 md:w-5 md:h-5 ${expiringRecords.length > 0 ? 'animate-bounce' : ''}`} />
                                    {expiringRecords.length > 0 && (
                                        <span className={`absolute -top-1 -right-1 text-white text-[7px] min-w-[14px] h-[14px] px-0.5 rounded-full flex items-center justify-center font-black shadow-sm border border-white ${
                                            expiringRecords.some(r => {
                                                const status = getExpirationStatus(r.fecha_vencimiento);
                                                return status.days <= 5;
                                            }) ? 'bg-red-600' : 
                                            expiringRecords.some(r => {
                                                const status = getExpirationStatus(r.fecha_vencimiento);
                                                return status.days > 5 && status.days <= 15;
                                            }) ? 'bg-orange-500' : 'bg-emerald-600'
                                        }`}>
                                            {expiringRecords.length > 99 ? '99+' : expiringRecords.length}
                                        </span>
                                    )}
                                </button>
                                <button 
                                    onClick={() => setShowStatsModal(true)}
                                    className="p-1.5 md:p-2 bg-blue-50 text-blue-600 border border-blue-200 rounded-full shadow-sm hover:bg-blue-100 transition-all flex items-center justify-center"
                                    title="Estadísticas de Hoy"
                                >
                                    <BarChart3 className="w-4 h-4 md:w-5 md:h-5" />
                                </button>
                                <button 
                                    onClick={handleExportSession}
                                    className="flex items-center gap-1 md:gap-2 bg-emerald-100 text-emerald-700 px-3 py-1.5 rounded-full text-[10px] md:text-xs font-bold shadow-sm hover:bg-emerald-200 transition-colors border border-emerald-200"
                                >
                                    <FileSpreadsheet className="w-3 h-3 md:w-4 md:h-4"/>
                                    <span>Descargar Registro</span>
                                </button>
                            </div>
                            
                            {/* Export Button inside form view */}
                            <div className="mt-6 flex justify-end md:hidden">
                                <button onClick={handleExportInventory} className="text-green-600 font-bold text-xs flex items-center gap-1 underline">
                                    <FileSpreadsheet className="w-4 h-4"/> Excel
                                </button>
                            </div>

                            {/* 1. Product Select / Scan */}
                            <div className="space-y-1 md:space-y-2 mt-4 md:mt-0">
                                <div className="flex justify-between items-center">
                                    <label className="text-xs md:text-sm font-bold text-gray-500 uppercase flex items-center gap-2">
                                        <Scan className="w-4 h-4"/> Escanear Producto
                                    </label>
                                </div>
                                {countProduct ? (
                                    <div className="flex flex-col bg-blue-600 text-white p-2 md:p-4 rounded-lg shadow-md">
                                        <div className="flex justify-between items-start">
                                            {/* Fix: countProduct.nombre, countProduct.codigo */}
                                            <div className="min-w-0 flex-1">
                                                <div className="font-black text-base md:text-lg leading-tight">{countProduct.nombre}</div>
                                                <div className="text-xs opacity-75 font-mono">{countProduct.codigo}</div>
                                            </div>
                                            <button 
                                                onClick={() => {
                                                    setCountProduct(null);
                                                    setCountSearch('');
                                                    setSuccessMsg(null);
                                                    setCountPhotos([]);
                                                    setTimeout(() => searchInputRef.current?.focus(), 100);
                                                }}
                                                className="text-white hover:bg-blue-700 px-3 py-1 rounded-full text-xs font-bold border border-white/30 ml-2 h-max"
                                            >
                                                Cambiar
                                            </button>
                                        </div>
                                        
                                        {/* Pack Info - Displaying units per box from the product master */}
                                        <div className="mt-2 pt-2 border-t border-white/20 flex flex-wrap gap-4 text-xs md:text-sm font-sans">
                                            <div className="font-bold">
                                                UM: <span className="font-mono bg-white/20 px-1 rounded">{countProduct.unidad_venta || 'UND'}</span>
                                            </div>
                                            <div className="font-bold flex items-center gap-1">
                                                <span className="font-sans">Unidades x Caja:</span> <span className="font-mono text-yellow-300 text-base md:text-lg">{countProduct.unidades_por_caja}</span>
                                            </div>
                                            {(countProduct.cajas_por_palet ?? 0) > 0 && (
                                                <div className="font-bold flex items-center gap-1">
                                                    <span className="font-sans">Cajas x Palet:</span> <span className="font-mono text-yellow-300 text-base md:text-lg">{countProduct.cajas_por_palet}</span>
                                                </div>
                                            )}
                                            {countProduct.unidad_compra && (
                                                <div className="font-bold opacity-80 italic">
                                                    ({countProduct.unidad_compra})
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                ) : (
                                    <div className="relative">
                                        <input
                                            ref={searchInputRef}
                                            autoFocus
                                            type="text"
                                            placeholder="Escanee EAN o escriba nombre..."
                                            className="w-full p-2 md:p-4 border-2 border-gray-300 rounded-lg focus:border-blue-500 outline-none text-base md:text-lg"
                                            value={countSearch}
                                            onChange={e => setCountSearch(e.target.value)}
                                            onKeyDown={e => {
                                                if (e.key === 'Enter') {
                                                    e.preventDefault();
                                                    const cleanSearch = countSearch.trim().toLowerCase();
                                                    if (cleanSearch) {
                                                        const match = catalog.find(p => 
                                                            p.codigo.trim().toLowerCase() === cleanSearch ||
                                                            (p.sku && p.sku.trim().toLowerCase() === cleanSearch)
                                                        );
                                                        if (match) {
                                                            setCountProduct(match);
                                                            setCountSearch('');
                                                            setTimeout(() => qtyInputRef.current?.focus(), 100);
                                                        } else if (filteredCatalog.length > 0) {
                                                            setCountProduct(filteredCatalog[0]);
                                                            setCountSearch('');
                                                            setTimeout(() => qtyInputRef.current?.focus(), 100);
                                                        }
                                                    }
                                                }
                                            }}
                                        />
                                        {countSearch.length > 0 && (
                                            <div className="absolute w-full bg-white shadow-xl border rounded-lg mt-1 max-h-60 overflow-y-auto z-10 divide-y divide-slate-100">
                                                {filteredCatalog.map(p => (
                                                    <button
                                                        key={p.id}
                                                        onClick={() => {
                                                            setCountProduct(p);
                                                            setCountSearch('');
                                                            setTimeout(() => qtyInputRef.current?.focus(), 100);
                                                        }}
                                                        className="w-full text-left p-3 hover:bg-slate-50 transition-colors flex justify-between items-start gap-3"
                                                    >
                                                        <div className="min-w-0 flex-1">
                                                            <div className="font-extrabold text-sm text-slate-800 leading-tight mb-1">{p.nombre}</div>
                                                            <div className="flex flex-wrap gap-1 items-center text-[10px] text-slate-500">
                                                                <span className="font-mono bg-slate-100 text-slate-700 px-1 py-0.5 rounded font-bold">EAN: {p.codigo}</span>
                                                                {p.sku && <span className="font-mono bg-blue-50 text-blue-700 px-1 py-0.5 rounded font-bold">SKU: {p.sku}</span>}
                                                                {p.marca && <span className="bg-slate-100 px-1 py-0.5 rounded text-[9px] font-semibold text-slate-600">{p.marca}</span>}
                                                                {p.categoria && <span className="bg-slate-100 px-1 py-0.5 rounded text-[9px] font-semibold text-slate-600 truncate max-w-[100px]" title={p.categoria}>{p.categoria}</span>}
                                                            </div>
                                                        </div>
                                                        <div className="shrink-0 flex flex-col items-end gap-1 text-[10px]">
                                                            <span className={`px-2 py-0.5 rounded-full font-black text-[8px] uppercase tracking-wider ${
                                                                p.zona_predeterminada === 'SECO' ? 'bg-amber-100 text-amber-800' :
                                                                p.zona_predeterminada === 'REFRIGERADO' ? 'bg-blue-100 text-blue-800' :
                                                                'bg-indigo-100 text-indigo-800'
                                                            }`}>
                                                                {p.zona_predeterminada}
                                                            </span>
                                                            {p.unidades_por_caja && (
                                                                <span className="text-slate-400 font-medium">x{p.unidades_por_caja} Un/Caja</span>
                                                            )}
                                                        </div>
                                                    </button>
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                )}
                            </div>

                            {/* 2. Form Inputs */}
                            <form onSubmit={handleStocktakeSubmit} className={`space-y-3 md:space-y-6 transition-all ${countProduct ? 'opacity-100' : 'opacity-50 pointer-events-none'}`}>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 md:gap-6">
                                    <div className="space-y-4">
                                        {(countProduct?.cajas_por_palet ?? 0) > 0 || (countProduct?.unidades_por_caja ?? 0) > 1 ? (
                                            <div className={`grid gap-2 ${ (countProduct?.cajas_por_palet ?? 0) > 0 ? 'grid-cols-3' : 'grid-cols-2' }`}>
                                                {(countProduct?.cajas_por_palet ?? 0) > 0 && (
                                                    <div>
                                                        <div className="flex items-center justify-between mb-1">
                                                            <label className="block text-[10px] font-bold text-gray-400 uppercase">Pallets</label>
                                                            <button 
                                                                type="button"
                                                                onClick={() => { setCalcTarget('PALLETS'); setShowCalculator(true); }}
                                                                className="text-blue-600 hover:text-blue-800"
                                                                title="Calculadora"
                                                            >
                                                                <Calculator className="w-3 h-3" />
                                                            </button>
                                                        </div>
                                                        <input 
                                                            type="number" 
                                                            className="w-full p-2 border border-gray-300 rounded-lg text-lg font-bold text-center outline-none focus:border-blue-500"
                                                            value={countPallets}
                                                            onChange={e => setCountPallets(e.target.value)}
                                                            placeholder="0"
                                                        />
                                                    </div>
                                                )}
                                                <div>
                                                    <div className="flex items-center justify-between mb-1">
                                                        <label className="block text-[10px] font-bold text-gray-400 uppercase">Cajas</label>
                                                        <button 
                                                            type="button"
                                                            onClick={() => { setCalcTarget('BOXES'); setShowCalculator(true); }}
                                                            className="text-blue-600 hover:text-blue-800"
                                                            title="Calculadora"
                                                        >
                                                            <Calculator className="w-3 h-3" />
                                                        </button>
                                                    </div>
                                                    <input 
                                                        type="number" 
                                                        className="w-full p-2 border border-gray-300 rounded-lg text-lg font-bold text-center outline-none focus:border-blue-500"
                                                        value={countBoxes}
                                                        onChange={e => setCountBoxes(e.target.value)}
                                                        placeholder="0"
                                                    />
                                                </div>
                                                <div>
                                                    <div className="flex items-center justify-between mb-1">
                                                        <label className="block text-[10px] font-bold text-gray-400 uppercase">Unidades</label>
                                                        <button 
                                                            type="button"
                                                            onClick={() => { setCalcTarget('UNITS'); setShowCalculator(true); }}
                                                            className="text-blue-600 hover:text-blue-800"
                                                            title="Calculadora"
                                                        >
                                                            <Calculator className="w-3 h-3" />
                                                        </button>
                                                    </div>
                                                    <input 
                                                        type="number" 
                                                        className="w-full p-2 border border-gray-300 rounded-lg text-lg font-bold text-center outline-none focus:border-blue-500"
                                                        value={countQty}
                                                        onChange={e => setCountQty(e.target.value)}
                                                        placeholder="0"
                                                    />
                                                </div>
                                            </div>
                                        ) : (
                                            <div>
                                                <label className="block text-[10px] md:text-xs font-bold text-gray-500 uppercase mb-1 md:mb-2">Cantidad (Unidades)</label>
                                                <div className="grid grid-cols-[1fr_auto] items-center gap-2">
                                                    <input 
                                                        ref={qtyInputRef}
                                                        required
                                                        type="number" 
                                                        step="0.01"
                                                        min="0"
                                                        className="w-full p-2 md:p-4 border border-gray-300 rounded-lg text-lg md:text-2xl font-bold text-center outline-none focus:border-blue-500"
                                                        value={countQty}
                                                        onChange={e => setCountQty(e.target.value)}
                                                    />
                                                    <button 
                                                        type="button"
                                                        onClick={() => { setCalcTarget('UNITS'); setShowCalculator(true); }}
                                                        className="w-12 h-12 md:w-16 md:h-16 bg-blue-600 text-white rounded-lg shadow-lg hover:bg-blue-700 transition-all flex items-center justify-center"
                                                        title="Calculadora"
                                                    >
                                                        <Calculator className="w-6 h-6 md:w-8 md:h-8" />
                                                    </button>
                                                </div>
                                            </div>
                                        )}

                                        {/* Total Calculation Display */}
                                        {countProduct && (
                                            <div className="bg-blue-50 border border-blue-100 p-3 rounded-xl flex justify-between items-center">
                                                <span className="text-[10px] font-black text-blue-400 uppercase">Total Calculado:</span>
                                                <span className="text-xl font-black text-blue-700">
                                                    {(() => {
                                                        const p = parseFloat(countPallets) || 0;
                                                        const b = parseFloat(countBoxes) || 0;
                                                        const u = parseFloat(countQty) || 0;
                                                        const cpp = countProduct.cajas_por_palet || 0;
                                                        const upc = countProduct.unidades_por_caja || 1;
                                                        
                                                        if (cpp > 0 || upc > 1) {
                                                            return ((p * cpp * upc) + (b * upc) + u).toFixed(2);
                                                        }
                                                        return u.toFixed(2);
                                                    })()} <span className="text-xs">{countProduct.unidad_venta || 'UND'}</span>
                                                </span>
                                            </div>
                                        )}
                                    </div>
                                    <div className="space-y-4">
                                        <div>
                                            <label className="block text-[10px] md:text-xs font-bold text-gray-500 uppercase mb-1 md:mb-2">Vencimiento</label>
                                            <div className={`space-y-2 ${countStatus ? 'opacity-30 pointer-events-none' : ''}`}>
                                                <div className="grid grid-cols-2 gap-2">
                                                    <select 
                                                        disabled={!!countStatus}
                                                        className={`w-full p-2 md:p-3 border rounded-lg text-sm md:text-base font-bold outline-none focus:border-blue-500 bg-white ${expiryWarning ? 'border-red-500 ring-1 ring-red-100' : 'border-gray-300'}`}
                                                        value={countDay}
                                                        onChange={e => setCountDay(e.target.value)}
                                                    >
                                                        <option value="">DIA</option>
                                                        {[...Array(31)].map((_, i) => (
                                                            <option key={i+1} value={i+1}>{i+1}</option>
                                                        ))}
                                                    </select>
                                                    <select 
                                                        disabled={!!countStatus}
                                                        className={`w-full p-2 md:p-3 border rounded-lg text-sm md:text-base font-bold outline-none focus:border-blue-500 bg-white ${expiryWarning ? 'border-red-500 ring-1 ring-red-100' : 'border-gray-300'}`}
                                                        value={countMonth}
                                                        onChange={e => setCountMonth(e.target.value)}
                                                    >
                                                        <option value="">MES</option>
                                                        {['ENE', 'FEB', 'MAR', 'ABR', 'MAY', 'JUN', 'JUL', 'AGO', 'SEP', 'OCT', 'NOV', 'DIC'].map((m, i) => (
                                                            <option key={i+1} value={i+1}>{m}</option>
                                                        ))}
                                                    </select>
                                                </div>
                                                <div className="flex flex-wrap gap-1">
                                                    {[2026, 2027, 2028, 2029, 2030, 2031, 2032, 2033].map(year => (
                                                        <button
                                                            key={year}
                                                            type="button"
                                                            disabled={!!countStatus}
                                                            onClick={() => setCountYear(year.toString())}
                                                            className={`flex-1 py-1.5 px-1 rounded-lg text-[10px] md:text-xs font-black transition-all border-2 ${countYear === year.toString() ? 'bg-blue-600 border-blue-600 text-white shadow-lg' : 'bg-white border-gray-200 text-gray-400 hover:border-blue-300'}`}
                                                        >
                                                            {year}
                                                        </button>
                                                    ))}
                                                </div>
                                            </div>
                                        </div>
                                        <div>
                                            <label className="block text-[10px] md:text-xs font-bold text-gray-500 uppercase mb-1 md:mb-2">Estado / Condición</label>
                                            <select 
                                                className="w-full p-2 md:p-3 border border-gray-300 rounded-lg text-sm md:text-base font-bold outline-none focus:border-blue-500 bg-white"
                                                value={countStatus}
                                                onChange={e => setCountStatus(e.target.value)}
                                            >
                                                <option value="">ESTÁNDAR (CON VENC.)</option>
                                                <option value="ROTO">ROTO</option>
                                                <option value="REMAR">REMAR</option>
                                                <option value="CORTE">CORTE</option>
                                                <option value="POR_REVISAR">POR_REVISAR</option>
                                                <option value="DESTRUCCION">DESTRUCCION</option>
                                            </select>
                                        </div>
                                    </div>
                                </div>

                                {/* Expiration Alert */}
                                {expiryWarning && (
                                    <div className="bg-red-100 border-2 border-red-500 text-red-900 p-3 md:p-4 rounded-lg text-xs md:text-sm shadow-md flex items-center gap-3">
                                        <AlertTriangle className="w-8 h-8 text-red-600 animate-bounce shrink-0" />
                                        <div>
                                            <p className="font-black uppercase">Alerta de Caducidad</p>
                                            <p className="font-medium">{expiryWarning}</p>
                                        </div>
                                    </div>
                                )}

                                {/* Photo Capture Section (Stocktake Only) */}
                                <div className="bg-slate-50 border border-dashed border-gray-300 rounded-lg p-3">
                                    <label className="block text-[10px] md:text-xs font-bold text-gray-500 uppercase mb-2">Evidencia Fotográfica ({countPhotos.length}/5)</label>
                                    <div className="flex gap-3 overflow-x-auto py-1">
                                        {countPhotos.map((photo, idx) => (
                                            <div key={idx} className="relative w-16 h-16 shrink-0 rounded border border-gray-200 overflow-hidden group cursor-zoom-in">
                                                <img 
                                                    src={photo.preview} 
                                                    alt="evidencia" 
                                                    className="w-full h-full object-cover hover:opacity-80 transition-opacity"
                                                    onClick={() => setSelectedImage(photo.preview)}
                                                />
                                                <button 
                                                    type="button"
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        handleCountRemovePhoto(idx);
                                                    }}
                                                    className="absolute top-0 right-0 bg-red-600 text-white p-0.5 rounded-bl opacity-80 hover:opacity-100"
                                                >
                                                    <XCircle className="w-3 h-3"/>
                                                </button>
                                            </div>
                                        ))}
                                        {countPhotos.length < 5 && (
                                            <label className="w-16 h-16 shrink-0 flex flex-col items-center justify-center border border-dashed border-blue-300 bg-white rounded hover:bg-blue-50 cursor-pointer">
                                                <Camera className="w-5 h-5 text-blue-500"/>
                                                <span className="text-[8px] text-blue-600 font-bold mt-1">Agregar</span>
                                                <input 
                                                    type="file" 
                                                    accept="image/*" 
                                                    capture
                                                    className="hidden" 
                                                    onChange={handleCountAddPhoto}
                                                />
                                            </label>
                                        )}
                                    </div>
                                </div>

                                {/* FLOATING SUBMIT BUTTON (Fixed at bottom on mobile, Sticky on desktop) */}
                                <div className="fixed bottom-0 left-0 right-0 p-4 bg-white/90 backdrop-blur-md border-t border-gray-100 z-40 md:sticky md:bottom-0 md:p-0 md:pt-4 md:pb-2 md:bg-white/80 md:border-0 flex flex-col gap-2">
                                     {successMsg && (
                                        <div className="text-center text-white font-bold bg-emerald-500 p-4 rounded-xl shadow-lg text-sm flex items-center justify-center gap-2 animate-fade-in mb-2">
                                            <CheckCircle className="w-5 h-5" /> {successMsg}
                                        </div>
                                     )}
                                     
                                     <button 
                                        type="submit" 
                                        disabled={!countProduct}
                                        className={`w-full bg-[#82BD02] hover:bg-[#74a902] text-white font-black py-4 md:py-5 rounded-2xl shadow-xl shadow-[#82BD02]/20 transform active:scale-[0.98] transition-all flex justify-center items-center gap-3 disabled:opacity-50 disabled:cursor-not-allowed`}
                                     >
                                        <PlusCircle className="w-6 h-6"/>
                                        GUARDAR
                                     </button>
                                </div>
                            </form>
                        </div>
                    </div>

                    {/* Right: Session History */}
                    <div className="w-full md:w-1/3 bg-slate-100 border-l border-gray-200 p-4 overflow-y-auto hidden md:block">
                        <div className="flex justify-between items-center mb-4">
                            <h4 className="font-bold text-gray-600 flex items-center gap-2 uppercase text-xs tracking-widest">
                                <History className="w-4 h-4 text-blue-500"/>
                                Sesión Actual
                            </h4>
                            <div className="flex items-center gap-2">
                                <span className="bg-blue-600 text-white text-[10px] font-black px-2 py-0.5 rounded-full">{sessionHistory.length}</span>
                                <button onClick={handleExportSession} className="text-emerald-600 hover:text-emerald-800" title="Descargar Sesión">
                                    <FileSpreadsheet className="w-5 h-5"/>
                                </button>
                            </div>
                        </div>
                        <div className="space-y-3">
                            {sessionHistory.length === 0 ? (
                                <div className="flex flex-col items-center justify-center h-64 text-gray-400 opacity-60">
                                    <ClipboardList className="w-12 h-12 mb-2" />
                                    <p className="text-xs italic text-center">Aún no se han registrado items en esta sesión.</p>
                                </div>
                            ) : (
                                sessionHistory.map((record, idx) => (
                                    <div key={record.id || idx} className="bg-white p-3 rounded-xl shadow-sm border border-gray-200 animate-fade-in hover:shadow-md transition-all group">
                                        <div className="flex justify-between items-start mb-1">
                                            <div className="font-bold text-gray-800 text-sm leading-tight group-hover:text-blue-600 transition-colors">{record.nombre}</div>
                                            <div className="bg-blue-50 text-blue-700 text-[10px] font-black px-1.5 py-0.5 rounded">x{record.cantidad}</div>
                                        </div>
                                        <div className="flex justify-between items-center text-[10px] text-gray-500 font-mono">
                                            <span>{record.codigo}</span>
                                            <span className="bg-gray-100 px-1 rounded">{new Date(record.fecha_registro).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</span>
                                        </div>
                                        {record.fecha_vencimiento && (
                                            <div className="mt-2 pt-2 border-t border-gray-50 flex items-center gap-1 text-[10px] font-bold text-orange-600">
                                                <AlertTriangle className="w-3 h-3"/> Vence: {record.fecha_vencimiento}
                                            </div>
                                        )}
                                    </div>
                                ))
                            )}
                        </div>
                    </div>
                </div>

                {/* --- MODAL: MISSING ITEMS --- */}
                {/* Fix: missingModalZone comparisons, stats labels */}
                {missingModalZone && (
                    <div className="fixed inset-0 z-50 bg-black/60 flex justify-center items-center p-4">
                        <div className="bg-white rounded-lg shadow-2xl w-full max-w-md max-h-[80vh] flex flex-col">
                            <div className="p-4 border-b border-gray-100 flex justify-between items-center">
                                <h3 className="font-bold text-lg text-gray-800">
                                    Faltantes: {missingModalZone === 'SECO' ? 'Secos' : missingModalZone === 'REFRIGERADO' ? 'Refrigerados' : 'Congelados'}
                                </h3>
                                <button onClick={() => setMissingModalZone(null)} className="text-gray-400 hover:text-gray-600">
                                    <XCircle className="w-6 h-6"/>
                                </button>
                            </div>
                            <div className="flex-1 overflow-y-auto p-4 space-y-2">
                                {/* Fix: missingModalZone vs SECO/REFRIGERADO/CONGELADO */}
                                {missingModalZone === 'SECO' && statsDry.missingItems.length === 0 && <p className="text-green-600 text-center font-bold">¡Todo contado!</p>}
                                {missingModalZone === 'REFRIGERADO' && statsCold.missingItems.length === 0 && <p className="text-green-600 text-center font-bold">¡Todo contado!</p>}
                                {missingModalZone === 'CONGELADO' && statsFrozen.missingItems.length === 0 && <p className="text-green-600 text-center font-bold">¡Todo contado!</p>}

                                {/* Fix: p.nombre, p.codigo */}
                                {(missingModalZone === 'SECO' ? statsDry.missingItems : missingModalZone === 'REFRIGERADO' ? statsCold.missingItems : statsFrozen.missingItems).map(p => (
                                    <div key={p.id} className="p-3 border rounded hover:bg-gray-50 flex justify-between items-center">
                                        <div>
                                            <div className="font-bold text-sm text-gray-800">{p.nombre}</div>
                                            <div className="text-xs text-gray-400">{p.codigo}</div>
                                        </div>
                                        <button 
                                            onClick={() => {
                                                setCountProduct(p);
                                                setMissingModalZone(null);
                                                setTimeout(() => qtyInputRef.current?.focus(), 100);
                                            }}
                                            className="text-blue-600 text-xs font-bold hover:underline"
                                        >
                                            Contar
                                        </button>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>
                )}
            </div>
        )}

        {/* --- MODAL: PHOTO GALLERY (READ ONLY FOR LIST VIEW) --- */}
        {photoModalItem && (
            <div className="fixed inset-0 z-50 bg-black/90 backdrop-blur-sm flex justify-center items-center p-4">
                <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg max-h-[90vh] flex flex-col overflow-hidden">
                    <div className="p-4 border-b flex justify-between items-center bg-gray-50">
                        <div>
                            <h3 className="font-bold text-gray-800">Fotos del Producto</h3>
                            <p className="text-xs text-gray-500">{photoModalItem.productName}</p>
                        </div>
                        <button onClick={() => setPhotoItemLPN(null)} className="text-gray-500 hover:text-red-500">
                            <XCircle className="w-6 h-6"/>
                        </button>
                    </div>

                    <div className="flex-1 overflow-y-auto p-4">
                        <div className="grid grid-cols-2 gap-3">
                            {/* Display existing photos */}
                            {(photoModalItem.photos || (photoModalItem.photoUrl ? [photoModalItem.photoUrl] : [])).map((photo, idx) => (
                                <div key={idx} className="relative group rounded-lg overflow-hidden border border-gray-200 aspect-square cursor-zoom-in">
                                    <img 
                                        src={photo} 
                                        alt={`Evidencia ${idx}`} 
                                        className="w-full h-full object-cover hover:opacity-80 transition-opacity"
                                        onClick={() => setSelectedImage(photo)}
                                    />
                                </div>
                            ))}
                        </div>
                        
                        {((photoModalItem.photos?.length || 0) === 0 && !photoModalItem.photoUrl) && (
                            <p className="text-center text-gray-400 text-sm mt-4 italic">No hay fotos registradas.</p>
                        )}
                    </div>

                    <div className="p-4 border-t bg-gray-50 text-center">
                        <button 
                            onClick={() => setPhotoItemLPN(null)}
                            className="bg-slate-800 text-white px-6 py-2 rounded-lg font-bold w-full md:w-auto"
                        >
                            Cerrar
                        </button>
                    </div>
                </div>
            </div>
        )}
        {/* --- MODAL: STATISTICS --- */}
        {showStatsModal && (
            <div className="fixed inset-0 z-[100] bg-slate-900/80 backdrop-blur-sm flex items-center justify-center p-2 md:p-4">
                <div className="bg-white w-full max-w-4xl max-h-[95vh] rounded-[2rem] shadow-2xl overflow-hidden flex flex-col animate-in fade-in zoom-in duration-300">
                    <div className="bg-[#009ED6] p-6 text-white flex justify-between items-center shrink-0">
                        <div>
                            <h2 className="text-xl md:text-2xl font-black uppercase tracking-tighter flex items-center gap-3">
                                <BarChart3 className="w-8 h-8" />
                                Estadísticas de Inventario
                            </h2>
                            <p className="text-blue-100 text-[10px] font-bold uppercase tracking-widest mt-1">Rendimiento del equipo hoy</p>
                        </div>
                        <button onClick={() => setShowStatsModal(false)} className="bg-white/10 hover:bg-white/20 p-2 rounded-full transition-all">
                            <XCircle className="w-8 h-8" />
                        </button>
                    </div>

                    <div className="flex-1 overflow-y-auto p-4 md:p-8 custom-scrollbar">
                        {userStats.length === 0 ? (
                            <div className="text-center py-20">
                                <ClipboardList className="w-20 h-20 text-gray-200 mx-auto mb-4" />
                                <p className="text-gray-400 font-bold uppercase tracking-widest">No hay datos suficientes para generar estadísticas hoy</p>
                            </div>
                        ) : (
                            <div className="space-y-8">
                                {/* Summary Cards */}
                                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                    <div className="bg-blue-50 p-6 rounded-3xl border border-blue-100 shadow-sm">
                                        <span className="text-[10px] font-black text-blue-400 uppercase tracking-widest block mb-2">Total Unidades Contadas</span>
                                        <div className="text-3xl font-black text-blue-900">
                                            {userStats.reduce((sum, s) => sum + s.totalCounted, 0).toLocaleString()}
                                        </div>
                                    </div>
                                    <div className="bg-emerald-50 p-6 rounded-3xl border border-emerald-100 shadow-sm">
                                        <span className="text-[10px] font-black text-emerald-400 uppercase tracking-widest block mb-2">Total Registros</span>
                                        <div className="text-3xl font-black text-emerald-900">
                                            {userStats.reduce((sum, s) => sum + s.recordsCount, 0).toLocaleString()}
                                        </div>
                                    </div>
                                    <div className="bg-purple-50 p-6 rounded-3xl border border-purple-100 shadow-sm">
                                        <span className="text-[10px] font-black text-purple-400 uppercase tracking-widest block mb-2">Promedio Rapidez</span>
                                        <div className="text-3xl font-black text-purple-900">
                                            {(userStats.reduce((sum, s) => sum + s.speed, 0) / userStats.length).toFixed(1)}
                                            <span className="text-xs ml-1 font-bold text-purple-400">reg/hr</span>
                                        </div>
                                    </div>
                                </div>

                                {/* Charts Section */}
                                <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                                    <div className="bg-white p-6 rounded-3xl border border-gray-100 shadow-sm">
                                        <h3 className="text-sm font-black text-gray-800 uppercase tracking-tight mb-6 flex items-center gap-2">
                                            <div className="w-2 h-2 bg-blue-500 rounded-full"></div>
                                            Unidades por Usuario
                                        </h3>
                                        <div className="h-[300px] w-full">
                                            <ResponsiveContainer width="100%" height="100%">
                                                <RechartsBarChart data={userStats} layout="vertical" margin={{ left: 20, right: 30 }}>
                                                    <CartesianGrid strokeDasharray="3 3" horizontal={true} vertical={false} stroke="#f1f5f9" />
                                                    <XAxis type="number" hide />
                                                    <YAxis 
                                                        dataKey="user" 
                                                        type="category" 
                                                        width={80} 
                                                        axisLine={false} 
                                                        tickLine={false}
                                                        tick={{ fontSize: 10, fontWeight: 'bold', fill: '#64748b' }}
                                                    />
                                                    <Tooltip 
                                                        cursor={{ fill: '#f8fafc' }}
                                                        contentStyle={{ borderRadius: '16px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)' }}
                                                    />
                                                    <Bar dataKey="totalCounted" name="Unidades" radius={[0, 10, 10, 0]} barSize={20}>
                                                        {userStats.map((_, index) => (
                                                            <Cell key={`cell-${index}`} fill={['#3b82f6', '#10b981', '#8b5cf6', '#f59e0b', '#ef4444'][index % 5]} />
                                                        ))}
                                                    </Bar>
                                                </RechartsBarChart>
                                            </ResponsiveContainer>
                                        </div>
                                    </div>

                                    <div className="bg-white p-6 rounded-3xl border border-gray-100 shadow-sm">
                                        <h3 className="text-sm font-black text-gray-800 uppercase tracking-tight mb-6 flex items-center gap-2">
                                            <div className="w-2 h-2 bg-purple-500 rounded-full"></div>
                                            Rapidez (Registros / Hora)
                                        </h3>
                                        <div className="h-[300px] w-full">
                                            <ResponsiveContainer width="100%" height="100%">
                                                <RechartsBarChart data={userStats} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                                                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                                                    <XAxis 
                                                        dataKey="user" 
                                                        axisLine={false} 
                                                        tickLine={false}
                                                        tick={{ fontSize: 10, fontWeight: 'bold', fill: '#64748b' }}
                                                    />
                                                    <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: '#94a3b8' }} />
                                                    <Tooltip 
                                                        cursor={{ fill: '#f8fafc' }}
                                                        contentStyle={{ borderRadius: '16px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)' }}
                                                    />
                                                    <Bar dataKey="speed" name="Reg/Hr" radius={[10, 10, 0, 0]} barSize={30} fill="#8b5cf6" />
                                                </RechartsBarChart>
                                            </ResponsiveContainer>
                                        </div>
                                    </div>

                                    {/* Counting Frequency Line Chart */}
                                    <div className="bg-white p-6 rounded-3xl border border-gray-100 shadow-sm lg:col-span-2">
                                        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
                                            <div>
                                                <h3 className="text-sm font-black text-gray-800 uppercase tracking-tight mb-1 flex items-center gap-2">
                                                    <div className="w-2 h-2 bg-pink-500 rounded-full"></div>
                                                    Frecuencia de Conteo (Registros por Intervalo)
                                                </h3>
                                                <p className="text-[10px] text-gray-400 font-bold uppercase">Visualización de actividad continua - Evite huecos en la línea</p>
                                            </div>
                                            
                                            <div className="flex flex-wrap items-center gap-3">
                                                {/* Interval Filter */}
                                                <div className="flex bg-slate-100 p-1 rounded-xl">
                                                    <button 
                                                        onClick={() => setStatsInterval(5)}
                                                        className={`px-3 py-1.5 text-[9px] font-black uppercase rounded-lg transition-all ${
                                                            statsInterval === 5 ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-400 hover:text-slate-600'
                                                        }`}
                                                    >
                                                        5 Min
                                                    </button>
                                                    <button 
                                                        onClick={() => setStatsInterval(30)}
                                                        className={`px-3 py-1.5 text-[9px] font-black uppercase rounded-lg transition-all ${
                                                            statsInterval === 30 ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-400 hover:text-slate-600'
                                                        }`}
                                                    >
                                                        30 Min
                                                    </button>
                                                </div>

                                                {/* User Filter */}
                                                <div className="flex items-center gap-2 bg-slate-100 px-3 py-1.5 rounded-xl border border-slate-200">
                                                    <User className="w-3 h-3 text-slate-400" />
                                                    <select 
                                                        value={statsUserFilter}
                                                        onChange={(e) => setStatsUserFilter(e.target.value)}
                                                        className="bg-transparent text-[9px] font-black uppercase outline-none text-slate-600 cursor-pointer"
                                                    >
                                                        <option value="TODOS">TODOS LOS USUARIOS</option>
                                                        {activeUsers.map(user => (
                                                            <option key={user} value={user}>{user.toUpperCase()}</option>
                                                        ))}
                                                    </select>
                                                </div>
                                            </div>
                                        </div>

                                        <div className="h-[350px] w-full">
                                            <ResponsiveContainer width="100%" height="100%">
                                                <LineChart data={countingFrequencyData} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
                                                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                                                    <XAxis 
                                                        dataKey="time" 
                                                        axisLine={false} 
                                                        tickLine={false}
                                                        tick={{ fontSize: 8, fontWeight: 'bold', fill: '#94a3b8' }}
                                                        interval={statsInterval === 5 ? (countingFrequencyData.length > 20 ? Math.floor(countingFrequencyData.length / 10) : 0) : 0}
                                                    />
                                                    <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: '#94a3b8' }} />
                                                    <Tooltip 
                                                        contentStyle={{ borderRadius: '16px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)', fontSize: '10px' }}
                                                    />
                                                    <Legend wrapperStyle={{ paddingTop: '20px', fontSize: '9px', fontWeight: '900', textTransform: 'uppercase', letterSpacing: '0.05em' }} />
                                                    {activeUsers.filter(u => statsUserFilter === 'TODOS' || u === statsUserFilter).map((user, index) => (
                                                        <Line 
                                                            key={user} 
                                                            type="monotone" 
                                                            dataKey={user} 
                                                            stroke={['#3b82f6', '#10b981', '#8b5cf6', '#f59e0b', '#ef4444', '#ec4899', '#06b6d4'][index % 7]} 
                                                            strokeWidth={3}
                                                            dot={{ r: 4, strokeWidth: 2, fill: '#fff' }}
                                                            activeDot={{ r: 6, strokeWidth: 0 }}
                                                            connectNulls={false} // Important: leave gaps if no activity
                                                        />
                                                    ))}
                                                </LineChart>
                                            </ResponsiveContainer>
                                        </div>
                                    </div>
                                </div>

                                {/* Detailed Table */}
                                <div className="bg-white rounded-3xl border border-gray-100 shadow-sm overflow-hidden">
                                    <table className="w-full text-left border-collapse">
                                        <thead>
                                            <tr className="bg-slate-50">
                                                <th className="p-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">Usuario</th>
                                                <th className="p-4 text-[10px] font-black text-slate-400 uppercase tracking-widest text-center">Registros</th>
                                                <th className="p-4 text-[10px] font-black text-slate-400 uppercase tracking-widest text-center">Total Unidades</th>
                                                <th className="p-4 text-[10px] font-black text-slate-400 uppercase tracking-widest text-center">Rapidez</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-slate-50">
                                            {userStats.map((s, i) => (
                                                <tr key={i} className="hover:bg-slate-50/50 transition-colors">
                                                    <td className="p-4">
                                                        <div className="flex items-center gap-3">
                                                            <div className="w-8 h-8 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center font-black text-xs">
                                                                {s.user.charAt(0)}
                                                            </div>
                                                            <span className="font-bold text-slate-700">{s.user}</span>
                                                        </div>
                                                    </td>
                                                    <td className="p-4 text-center font-bold text-slate-600">{s.recordsCount}</td>
                                                    <td className="p-4 text-center font-black text-slate-900">{s.totalCounted.toLocaleString()}</td>
                                                    <td className="p-4 text-center">
                                                        <span className="bg-purple-50 text-purple-700 px-3 py-1 rounded-full text-[10px] font-black">
                                                            {s.speed} reg/hr
                                                        </span>
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        )}
                    </div>

                    <div className="p-6 bg-slate-50 border-t border-slate-100 flex justify-end shrink-0">
                        <button 
                            onClick={() => setShowStatsModal(false)}
                            className="bg-slate-200 hover:bg-slate-300 text-slate-700 px-8 py-3 rounded-2xl font-black text-xs uppercase transition-all"
                        >
                            Cerrar
                        </button>
                    </div>
                </div>
            </div>
        )}

        {/* --- MODAL: EDIT COUNT --- */}
        {editingCount && (
            <div className="fixed inset-0 z-[150] bg-black/60 backdrop-blur-sm flex justify-center items-center p-4">
                <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden animate-fade-in">
                    <div className="p-6 border-b flex justify-between items-center bg-blue-50">
                        <h3 className="font-bold text-gray-800">Editar Conteo</h3>
                        <button onClick={() => setEditingCount(null)} className="text-gray-400 hover:text-red-500">
                            <XCircle className="w-6 h-6"/>
                        </button>
                    </div>
                    <form onSubmit={handleUpdateCount} className="p-6 space-y-4">
                        <div>
                            <label className="text-xs font-black text-gray-400 uppercase tracking-widest block mb-1">Producto</label>
                            <div className="font-bold text-gray-800">{editingCount.nombre}</div>
                            <div className="text-xs text-blue-600 font-mono">{editingCount.codigo}</div>
                        </div>
                        <div>
                            <label className="text-xs font-black text-gray-400 uppercase tracking-widest block mb-1">Cantidad</label>
                            <input 
                                type="number" 
                                step="0.01"
                                required
                                className="w-full p-3 bg-gray-50 border border-gray-200 rounded-xl font-bold outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                                value={editQty}
                                onChange={e => setEditQty(e.target.value)}
                            />
                        </div>
                        <div>
                            <label className="text-xs font-black text-gray-400 uppercase tracking-widest block mb-1">Vencimiento</label>
                            <input 
                                type="date" 
                                className="w-full p-3 bg-gray-50 border border-gray-200 rounded-xl font-bold outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                                value={editDate}
                                onChange={e => setEditDate(e.target.value)}
                            />
                        </div>
                        <div className="pt-4 flex gap-3">
                            <button 
                                type="button"
                                onClick={() => setEditingCount(null)}
                                className="flex-1 py-3 bg-gray-100 text-gray-500 font-bold rounded-xl hover:bg-gray-200 transition-all"
                            >
                                Cancelar
                            </button>
                            <button 
                                type="submit"
                                className="flex-1 py-3 bg-blue-600 text-white font-bold rounded-xl hover:bg-blue-700 shadow-lg shadow-blue-200 transition-all"
                            >
                                Guardar Cambios
                            </button>
                        </div>
                    </form>
                </div>
            </div>
        )}

        {/* --- MODAL: DOWNLOAD RANGE --- */}
        {showDownloadModal && (
            <div className="fixed inset-0 z-[100] bg-black/60 backdrop-blur-sm flex justify-center items-center p-4">
                <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden animate-fade-in">
                    <div className="p-6 border-b flex justify-between items-center bg-gray-50">
                        <div className="flex items-center gap-3">
                            <div className="p-2 bg-emerald-100 rounded-lg">
                                <FileSpreadsheet className="w-6 h-6 text-emerald-600"/>
                            </div>
                            <h3 className="font-bold text-gray-800 text-lg">Descargar Registros</h3>
                        </div>
                        <button onClick={() => setShowDownloadModal(false)} className="text-gray-400 hover:text-red-500 transition-colors">
                            <XCircle className="w-6 h-6"/>
                        </button>
                    </div>
                    
                    <div className="p-6 space-y-6">
                        <p className="text-sm text-gray-500 font-medium">Seleccione el rango de fechas para exportar los conteos realizados.</p>
                        
                        <div className="grid grid-cols-1 gap-4">
                            <div className="space-y-2">
                                <label className="text-xs font-black text-gray-400 uppercase tracking-widest">Fecha Inicio</label>
                                <input 
                                    type="date" 
                                    className="w-full p-3 bg-gray-50 border border-gray-200 rounded-xl font-bold outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100 transition-all"
                                    value={downloadStartDate}
                                    onChange={e => setDownloadStartDate(e.target.value)}
                                />
                            </div>
                            <div className="space-y-2">
                                <label className="text-xs font-black text-gray-400 uppercase tracking-widest">Fecha Fin</label>
                                <input 
                                    type="date" 
                                    className="w-full p-3 bg-gray-50 border border-gray-200 rounded-xl font-bold outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100 transition-all"
                                    value={downloadEndDate}
                                    onChange={e => setDownloadEndDate(e.target.value)}
                                />
                            </div>
                        </div>
                    </div>

                    <div className="p-6 border-t bg-gray-50 flex flex-col gap-3">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                            <button 
                                onClick={handleDownloadHistory}
                                disabled={isDownloading}
                                className="bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-3 rounded-xl font-bold shadow-lg shadow-emerald-200 transition-all flex items-center justify-center gap-2 disabled:opacity-50"
                            >
                                <FileSpreadsheet className="w-5 h-5"/>
                                Excel Plano
                            </button>
                            <button 
                                onClick={handleDownloadMatrixExcel}
                                disabled={isDownloading}
                                className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-3 rounded-xl font-bold shadow-lg shadow-blue-200 transition-all flex items-center justify-center gap-2 disabled:opacity-50"
                            >
                                <FileSpreadsheet className="w-5 h-5"/>
                                Excel Matriz
                            </button>
                            <button 
                                onClick={handleDownloadPDF}
                                disabled={isDownloading}
                                className="bg-red-600 hover:bg-red-700 text-white px-4 py-3 rounded-xl font-bold shadow-lg shadow-red-200 transition-all flex items-center justify-center gap-2 disabled:opacity-50"
                            >
                                <FileText className="w-5 h-5"/>
                                PDF
                            </button>
                            <button 
                                onClick={handleDownloadEggPDF}
                                disabled={isDownloading}
                                className="bg-orange-600 hover:bg-orange-700 text-white px-4 py-3 rounded-xl font-bold shadow-lg shadow-orange-200 transition-all flex items-center justify-center gap-2 disabled:opacity-50"
                            >
                                <FileText className="w-5 h-5"/>
                                PDF Matriz Huevo
                            </button>
                        </div>
                        <button 
                            onClick={() => setShowDownloadModal(false)}
                            className="w-full px-6 py-2 rounded-xl font-bold text-gray-400 hover:text-gray-600 transition-colors text-sm"
                        >
                            Cancelar
                        </button>
                    </div>
                </div>
            </div>
        )}

        {/* Upload Stock Modal */}
        {showUploadStockModal && (
            <div className="fixed inset-0 z-[100] bg-black/60 backdrop-blur-sm flex justify-center items-center p-4">
                <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden animate-fade-in">
                    <div className="p-6 border-b flex justify-between items-center bg-blue-50">
                        <div className="flex items-center gap-3">
                            <div className="p-2 bg-blue-100 rounded-lg">
                                <Upload className="w-6 h-6 text-blue-600"/>
                            </div>
                            <h3 className="font-bold text-gray-800 text-lg">Cargar Stock del Día</h3>
                        </div>
                        <button onClick={() => setShowUploadStockModal(false)} className="text-gray-400 hover:text-red-500 transition-colors">
                            <XCircle className="w-6 h-6"/>
                        </button>
                    </div>
                    
                    <div className="p-8 space-y-6 text-center">
                        {!isDownloading && !uploadSuccess && (
                            <>
                                <div className="w-20 h-20 bg-blue-50 rounded-full flex items-center justify-center mx-auto mb-4">
                                    <FileSpreadsheet className="w-10 h-10 text-blue-600" />
                                </div>
                                <h4 className="font-black text-gray-800 uppercase tracking-tight">Importar Inventario Teórico</h4>
                                <p className="text-xs text-gray-500 leading-relaxed">
                                    Cargue un archivo Excel con las columnas <strong>codigo</strong>, <strong>stock del día</strong> (o cantidad) y <strong>costo</strong>. 
                                    Este stock se utilizará para validar los conteos físicos de hoy y detectar cruces por costo.
                                </p>
                                
                                <div className="flex flex-col gap-4">
                                    <button 
                                        onClick={handleDownloadStockTemplate}
                                        className="flex items-center justify-center gap-2 text-blue-600 font-bold text-xs uppercase hover:underline"
                                    >
                                        <Download className="w-4 h-4" />
                                        Descargar Estructura (Plantilla)
                                    </button>

                                    <div className="relative group">
                                        <input 
                                            type="file" 
                                            accept=".xlsx, .xls, .csv"
                                            onChange={handleUploadStock}
                                            className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
                                        />
                                        <div className="border-2 border-dashed border-blue-200 rounded-2xl p-8 group-hover:border-blue-400 group-hover:bg-blue-50 transition-all">
                                            <Upload className="w-8 h-8 text-blue-400 mx-auto mb-2" />
                                            <span className="text-[10px] font-black text-blue-600 uppercase">Seleccionar Archivo Excel</span>
                                        </div>
                                    </div>
                                </div>
                            </>
                        )}

                        {isDownloading && !uploadSuccess && (
                            <div className="py-10 space-y-4">
                                <RefreshCw className="w-12 h-12 text-blue-500 mx-auto animate-spin" />
                                <h4 className="font-black text-gray-800 uppercase tracking-tight">Procesando Archivo...</h4>
                                <div className="w-full bg-gray-100 rounded-full h-3 overflow-hidden">
                                    <div 
                                        className="bg-blue-600 h-full transition-all duration-300" 
                                        style={{ width: `${uploadProgress}%` }}
                                    ></div>
                                </div>
                                <p className="text-[10px] font-bold text-gray-400 uppercase">{uploadProgress}% Completado</p>
                            </div>
                        )}

                        {uploadSuccess && (
                            <div className="py-10 space-y-4 animate-bounce-in">
                                <div className="w-20 h-20 bg-green-100 rounded-full flex items-center justify-center mx-auto">
                                    <CheckCircle className="w-12 h-12 text-green-600" />
                                </div>
                                <h4 className="font-black text-green-700 uppercase tracking-tight">¡Carga Exitosa!</h4>
                                <p className="text-xs text-gray-500">El stock del sistema ha sido actualizado correctamente.</p>
                            </div>
                        )}
                    </div>

                    <div className="p-6 bg-slate-50 border-t border-gray-100 text-center">
                        <button onClick={() => setShowUploadStockModal(false)} className="text-slate-400 font-bold text-xs uppercase hover:text-slate-600">Cerrar</button>
                    </div>
                </div>
            </div>
        )}

        {/* --- MODAL: EXPIRATION ALERTS & ACTIONS --- */}
        {showExpAlerts && (
            <div className="fixed inset-0 z-[110] bg-black/60 backdrop-blur-sm flex justify-center items-center p-2 sm:p-4">
                <div className="bg-white rounded-2xl shadow-2xl w-full max-w-7xl max-h-[95vh] h-[95vh] overflow-hidden animate-fade-in flex flex-col">
                    <div className="p-4 border-b flex justify-between items-center bg-red-50/75">
                        <div className="flex items-center gap-4">
                            <div className="flex items-center gap-2">
                                <Bell className={`w-6 h-6 animate-pulse ${expiringRecords.some(r => {
                                    const exp = parseDate(r.fecha_vencimiento);
                                    if (!exp) return false;
                                    const today = new Date();
                                    today.setHours(0,0,0,0);
                                    return Math.ceil((exp.getTime() - today.getTime()) / (1000 * 60 * 60 * 24)) <= 5;
                                }) ? 'text-red-600' : expiringRecords.some(r => {
                                    const exp = parseDate(r.fecha_vencimiento);
                                    if (!exp) return false;
                                    const today = new Date();
                                    today.setHours(0,0,0,0);
                                    const diff = Math.ceil((exp.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
                                    return diff > 5 && diff <= 15;
                                }) ? 'text-orange-500' : 'text-emerald-600'}`}/>
                                <div>
                                    <h3 className="font-bold text-gray-800">Próximos a vencer ({expiringRecords.length})</h3>
                                    <p className="text-[10px] font-medium">
                                        <span className="text-red-600">Rojo: ≤ 5 días</span> • <span className="text-orange-500">Naranja: 6-15 días</span> • <span className="text-emerald-600">Verde: +15 días</span>
                                    </p>
                                </div>
                            </div>
                            {expiringRecords.length > 0 && (
                                <button 
                                    onClick={handleDownloadExpiringExcel}
                                    className="flex items-center gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white px-3 py-1.5 rounded-lg text-[10px] font-black uppercase transition-all shadow-sm"
                                >
                                    <FileSpreadsheet className="w-3.5 h-3.5"/>
                                    Excel
                                </button>
                            )}
                        </div>
                        <button onClick={() => setShowExpAlerts(false)} className="text-gray-400 hover:text-red-500">
                            <XCircle className="w-6 h-6"/>
                        </button>
                    </div>
                    
                    <div className="flex-1 overflow-auto p-4 sm:p-6 bg-slate-50">
                        {expiringRecords.length > 0 && (
                            <div className="mb-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 bg-white p-3 rounded-xl border border-gray-100 shadow-sm animate-fade-in">
                                <span className="text-[10px] font-black uppercase text-gray-400 tracking-wider">
                                    Filtrar por Zona:
                                </span>
                                <div className="flex flex-wrap gap-1.5">
                                    {[
                                        { key: 'TODAS', label: 'TODAS' },
                                        { key: 'SECO', label: 'SECO ☀️' },
                                        { key: 'REFRIGERADO', label: 'REFRIGERADO ❄️' },
                                        { key: 'CONGELADO', label: 'CONGELADO 🧊' }
                                    ].map(z => {
                                        const count = z.key === 'TODAS'
                                            ? expiringRecords.length
                                            : expiringRecords.filter(r => r.zona && r.zona.toUpperCase() === z.key.toUpperCase()).length;
                                        
                                        const isActive = expiringZoneFilter === z.key;
                                        return (
                                            <button
                                                key={z.key}
                                                onClick={() => {
                                                    setExpiringZoneFilter(z.key);
                                                    setExpiringPage(1);
                                                }}
                                                className={`px-3 py-1.5 rounded-lg text-[10px] font-black tracking-wider transition-all cursor-pointer flex items-center gap-1.5 ${
                                                    isActive 
                                                        ? 'bg-blue-600 text-white shadow-lg shadow-blue-600/20' 
                                                        : 'bg-gray-50 border border-gray-100 hover:bg-gray-100 text-gray-500'
                                                }`}
                                            >
                                                {z.label}
                                                <span className={`px-1.5 py-0.5 rounded-full text-[9px] font-black ${
                                                    isActive ? 'bg-blue-700 text-white' : 'bg-gray-200 text-gray-600'
                                                }`}>
                                                    {count}
                                                </span>
                                            </button>
                                        );
                                    })}
                                </div>
                            </div>
                        )}

                        {expiringRecords.length === 0 ? (
                            <div className="text-center py-12 text-gray-400">
                                <CheckCircle className="w-12 h-12 mx-auto mb-2 opacity-20" />
                                <p>No hay productos críticos pendientes de acción.</p>
                                <div className="mt-4 flex flex-col items-center gap-1">
                                    <button 
                                        onClick={() => fetchExpiringSoon()}
                                        className="text-blue-500 underline text-xs hover:text-blue-700"
                                    >
                                        Reintentar búsqueda
                                    </button>
                                </div>
                            </div>
                        ) : groupedExpiringRecords.length === 0 ? (
                            <div className="text-center py-12 text-gray-400 bg-white border border-gray-100 rounded-2xl shadow-sm">
                                <AlertTriangle className="w-12 h-12 mx-auto mb-2 text-amber-500 opacity-60 animate-bounce" />
                                <p className="font-bold text-gray-700">No hay productos próximos a vencer en la zona {expiringZoneFilter}.</p>
                                <p className="text-xs text-gray-400 mt-1">Pruebe seleccionando otra zona o limpie el filtro.</p>
                                <button 
                                    onClick={() => setExpiringZoneFilter('TODAS')}
                                    className="mt-4 px-4 py-2 bg-blue-600 text-white text-xs font-black rounded-lg uppercase tracking-wider shadow-md hover:bg-blue-700 transition-all cursor-pointer"
                                >
                                    Ver Todas las Zonas
                                </button>
                            </div>
                        ) : (
                            <div className="space-y-4">
                                {selectedGroupIds.length > 0 && (
                                    <div className="bg-blue-50 border border-blue-200 rounded-xl p-3 sm:p-4 flex flex-col sm:flex-row justify-between items-center gap-3 animate-fade-in shadow-sm">
                                        <div className="flex items-center gap-2">
                                            <div className="bg-blue-500 text-white rounded-full p-1.5 flex-shrink-0">
                                                <ClipboardList className="w-4 h-4"/>
                                            </div>
                                            <div>
                                                <p className="text-xs font-black text-blue-900 uppercase">Procesamiento Masivo</p>
                                                <p className="text-[10px] text-blue-700 font-medium leading-none mt-0.5">Marcando {selectedGroupIds.length} {selectedGroupIds.length === 1 ? 'producto' : 'productos'} con acción masiva.</p>
                                            </div>
                                        </div>
                                        <div className="flex items-center gap-2 w-full sm:w-auto">
                                            <select 
                                                className="flex-1 sm:flex-none p-2 border border-blue-300 rounded-lg text-xs font-bold bg-white text-gray-800 outline-none focus:ring-2 focus:ring-blue-500/20"
                                                value={bulkAction}
                                                onChange={e => setBulkAction(e.target.value)}
                                            >
                                                <option value="">Seleccionar Acción Masiva...</option>
                                                <option value="Venta Personal">Venta Personal</option>
                                                <option value="Merma">Merma</option>
                                                <option value="Vendido">Vendido</option>
                                                <option value="Vencido">Vencido</option>
                                            </select>
                                            <button
                                                onClick={() => handleExecuteBulkAction(bulkAction)}
                                                disabled={isUpdatingAction || !bulkAction}
                                                className="px-4 py-2 bg-blue-600 text-white text-xs font-black rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-all uppercase tracking-wider shadow-md shadow-blue-600/10 hover:shadow-blue-600/20 active:scale-[0.98]"
                                            >
                                                {isUpdatingAction ? 'Procesando...' : 'Aplicar a Todos'}
                                            </button>
                                            <button 
                                                onClick={() => setSelectedGroupIds([])}
                                                className="text-gray-500 hover:text-red-500 font-bold text-xs uppercase px-2 py-1"
                                            >
                                                Cancelar
                                            </button>
                                        </div>
                                    </div>
                                )}
                                
                                <div className="overflow-x-auto border border-gray-200 rounded-xl bg-white shadow-sm min-w-full">
                                    <table className="min-w-full divide-y divide-gray-200 text-left text-xs">
                                        <thead className="bg-slate-50 text-gray-700 uppercase tracking-wider text-[10px] font-black select-none border-b border-gray-200">
                                            <tr>
                                                <th className="px-4 py-3 w-10 text-center">
                                                    <input 
                                                        type="checkbox"
                                                        className="rounded border-gray-300 text-blue-600 focus:ring-blue-500 w-4 h-4 cursor-pointer"
                                                        checked={paginatedExpiringRecords.length > 0 && paginatedExpiringRecords.every(g => selectedGroupIds.includes(g.id))}
                                                        onChange={(e) => {
                                                            if (e.target.checked) {
                                                                const pageIds = paginatedExpiringRecords.map(g => g.id);
                                                                setSelectedGroupIds(prev => Array.from(new Set([...prev, ...pageIds])));
                                                            } else {
                                                                const pageIds = paginatedExpiringRecords.map(g => g.id);
                                                                setSelectedGroupIds(prev => prev.filter(id => !pageIds.includes(id)));
                                                            }
                                                        }}
                                                    />
                                                </th>
                                                <th className="px-4 py-3 min-w-[200px]">Producto</th>
                                                <th className="px-4 py-3 min-w-[120px]">Estado / Vencimiento</th>
                                                <th className="px-4 py-3 text-center min-w-[80px]">Cant. Total</th>
                                                <th className="px-4 py-3 min-w-[240px]">Detalle de Registros</th>
                                                <th className="px-4 py-3 min-w-[340px]">Acción a Procesar</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-gray-100 bg-white">
                                            {paginatedExpiringRecords.map(group => {
                                                const status = getExpirationStatus(group.fecha_vencimiento);
                                                const diff = status.days;
                                                
                                                return (
                                                    <tr key={group.id} className="hover:bg-slate-50/85 transition-colors">
                                                        {/* Columna Checkbox */}
                                                        <td className="px-4 py-3 text-center">
                                                            <input 
                                                                type="checkbox"
                                                                className="rounded border-gray-300 text-blue-600 focus:ring-blue-500 w-4 h-4 cursor-pointer"
                                                                checked={selectedGroupIds.includes(group.id)}
                                                                onChange={(e) => {
                                                                    if (e.target.checked) {
                                                                        setSelectedGroupIds(prev => [...prev, group.id]);
                                                                    } else {
                                                                        setSelectedGroupIds(prev => prev.filter(id => id !== group.id));
                                                                    }
                                                                }}
                                                            />
                                                        </td>
                                                        
                                                        {/* Columna: Producto */}
                                                        <td className="px-4 py-3">
                                                            <div className="font-bold text-gray-900 line-clamp-2 max-w-[250px]">
                                                                {group.nombre}
                                                            </div>
                                                            <div className="text-[10px] text-gray-500 mt-1 flex items-center gap-1.5 flex-wrap">
                                                                <span className="bg-gray-100 text-gray-700 px-1 rounded font-mono font-medium">{group.codigo}</span>
                                                                <span className="text-gray-400">•</span>
                                                                <span className="text-indigo-600 font-semibold bg-indigo-50 px-1 rounded">Zona: {group.zona}</span>
                                                            </div>
                                                        </td>
                                                        
                                                        {/* Columna: Estado / Vencimiento */}
                                                        <td className="px-4 py-3">
                                                            <div className="text-xs font-semibold text-gray-800">
                                                                {group.fecha_vencimiento}
                                                            </div>
                                                            <div className="mt-1">
                                                                <span className={`inline-block px-2 py-0.5 rounded text-[9px] font-black tracking-wide ${
                                                                    diff < 0 ? 'bg-red-600 text-white shadow-sm' : 
                                                                    diff <= 5 ? 'bg-red-500 text-white shadow-sm' : 
                                                                    diff <= 15 ? 'bg-orange-500 text-white' :
                                                                    'bg-emerald-100 text-emerald-800'
                                                                }`}>
                                                                    {diff < 0 ? 'VENCIDO' : diff === 0 ? 'VENCE HOY' : `VENCE EN ${diff} DÍAS`}
                                                                </span>
                                                            </div>
                                                        </td>
 
                                                        {/* Columna: Cant. Total */}
                                                        <td className="px-4 py-3 text-center">
                                                            <span className="text-xs font-black text-gray-950 bg-amber-50 border border-amber-200 px-2 py-1 rounded inline-block">
                                                                {group.cantidadTotal.toFixed(2)}
                                                            </span>
                                                        </td>
 
                                                        {/* Columna: Detalle de Registros */}
                                                        <td className="px-4 py-3">
                                                            <div className="max-h-[75px] overflow-y-auto pr-1 space-y-1 custom-scrollbar">
                                                                {group.registros.map((reg, idx) => (
                                                                    <div key={idx} className="flex justify-between items-center text-[9px] py-0.5 border-b border-gray-50 last:border-0">
                                                                        <div className="flex items-center gap-1 text-gray-600">
                                                                            <User className="w-2.5 h-2.5 text-gray-400 flex-shrink-0"/>
                                                                            <span className="font-bold truncate max-w-[80px]">{reg.usuario}</span>
                                                                            <span className="text-gray-400 text-[8px]">{reg.fecha}</span>
                                                                        </div>
                                                                        <span className="font-bold text-blue-600 bg-blue-50 px-1 rounded flex-shrink-0">+{reg.cantidad.toFixed(2)}</span>
                                                                    </div>
                                                                ))}
                                                            </div>
                                                        </td>
 
                                                        {/* Columna: Acción a Procesar */}
                                                        <td className="px-4 py-3">
                                                            <div className="flex items-center gap-2">
                                                                <div className="flex-1 min-w-[115px]">
                                                                    <select 
                                                                        className="w-full p-2 border border-gray-300 rounded-lg text-[11px] font-bold bg-white outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all text-gray-800"
                                                                        value={selectedAction[group.id]?.action || ''}
                                                                        onChange={e => setSelectedAction(prev => ({
                                                                            ...prev,
                                                                            [group.id]: { ...(prev[group.id] || {qty: group.cantidadTotal.toString()}), action: e.target.value }
                                                                        }))}
                                                                    >
                                                                        <option value="">Seleccionar...</option>
                                                                        <option value="Venta Personal">Venta Personal</option>
                                                                        <option value="Merma">Merma</option>
                                                                        <option value="Vendido">Vendido</option>
                                                                        <option value="Vencido">Vencido</option>
                                                                    </select>
                                                                </div>
                                                                <div className="w-[85px]">
                                                                    <input 
                                                                        type="number"
                                                                        step="0.01"
                                                                        className="w-full p-2 border border-gray-300 rounded-lg text-[11px] font-bold bg-white outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all text-center text-gray-800"
                                                                        placeholder="0.00"
                                                                        value={selectedAction[group.id]?.qty || ''}
                                                                        onChange={e => setSelectedAction(prev => ({
                                                                            ...prev,
                                                                            [group.id]: { ...(prev[group.id] || {action: ''}), qty: e.target.value }
                                                                        }))}
                                                                    />
                                                                </div>
                                                                <button 
                                                                    onClick={() => handleExecuteAction(group.id, true, group.ids)}
                                                                    disabled={isUpdatingAction}
                                                                    className="px-3 py-2 bg-blue-600 text-white text-[10px] font-black rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-all shadow-md shadow-blue-600/10 hover:shadow-blue-600/20 active:scale-[0.98] uppercase tracking-wider flex-shrink-0"
                                                                >
                                                                    {isUpdatingAction ? '...' : 'Confirmar'}
                                                                </button>
                                                            </div>
                                                        </td>
                                                    </tr>
                                                );
                                            })}
                                        </tbody>
                                    </table>
                                </div>

                                {/* PAGINACIÓN MODAL VENCIMIENTO */}
                                {expiringTotalPages > 1 && (
                                    <div className="flex flex-col sm:flex-row justify-between items-center gap-4 bg-white p-4 rounded-xl border border-gray-100 mt-2">
                                        <p className="text-[10px] font-black uppercase text-gray-400 tracking-widest">
                                            Mostrando {Math.min(groupedExpiringRecords.length, (expiringPage - 1) * EXPIRING_ITEMS_PER_PAGE + 1)} - {Math.min(groupedExpiringRecords.length, expiringPage * EXPIRING_ITEMS_PER_PAGE)} de {groupedExpiringRecords.length} productos
                                        </p>
                                        <div className="flex items-center gap-2">
                                            <button 
                                                disabled={expiringPage === 1}
                                                onClick={() => setExpiringPage(prev => Math.max(1, prev - 1))}
                                                className="p-2 rounded-lg bg-gray-50 text-gray-400 disabled:opacity-30 hover:bg-gray-100 transition-all cursor-pointer"
                                            >
                                                <ChevronLeft className="w-4 h-4" />
                                            </button>
                                            <div className="flex items-center gap-1">
                                                {[...Array(Math.min(5, expiringTotalPages))].map((_, i) => {
                                                    let pageNum = expiringPage;
                                                    if (expiringPage <= 3) pageNum = i + 1;
                                                    else if (expiringPage >= expiringTotalPages - 2) pageNum = expiringTotalPages - 4 + i;
                                                    else pageNum = expiringPage - 2 + i;
                                                    if (pageNum <= 0 || pageNum > expiringTotalPages) return null;
                                                    return (
                                                        <button
                                                            key={pageNum}
                                                            onClick={() => setExpiringPage(pageNum)}
                                                            className={`w-8 h-8 rounded-lg text-[10px] font-black transition-all cursor-pointer ${expiringPage === pageNum ? 'bg-blue-600 text-white shadow-md shadow-blue-600/20' : 'bg-gray-50 text-gray-400 hover:bg-gray-100'}`}
                                                        >
                                                            {pageNum}
                                                        </button>
                                                    );
                                                })}
                                            </div>
                                            <button 
                                                disabled={expiringPage === expiringTotalPages}
                                                onClick={() => setExpiringPage(prev => Math.min(expiringTotalPages, prev + 1))}
                                                className="p-2 rounded-lg bg-gray-50 text-gray-400 disabled:opacity-30 hover:bg-gray-100 transition-all cursor-pointer"
                                            >
                                                <ChevronRight className="w-4 h-4" />
                                            </button>
                                        </div>
                                    </div>
                                )}
                            </div>
                        )}
                    </div>
                    
                    <div className="p-4 bg-gray-50 border-t text-[10px] text-gray-400 text-center italic">
                        Solo se muestran registros de conteo sin acciones previas.
                    </div>
                </div>
            </div>
        )}

        {/* --- MODAL: CALCULATOR --- */}
        {showCalculator && (
            <div className="fixed inset-0 z-[110] bg-black/60 backdrop-blur-sm flex justify-center items-center p-4">
                <div className="bg-white rounded-2xl shadow-2xl w-full max-w-xs overflow-hidden animate-fade-in">
                    <div className="p-4 border-b flex justify-between items-center bg-gray-50">
                        <div className="flex items-center gap-2">
                            <Calculator className="w-5 h-5 text-blue-600"/>
                            <h3 className="font-bold text-gray-800">Calculadora</h3>
                        </div>
                        <button onClick={() => setShowCalculator(false)} className="text-gray-400 hover:text-red-500">
                            <XCircle className="w-6 h-6"/>
                        </button>
                    </div>
                    
                    <div className="p-4 space-y-4">
                        <textarea 
                            ref={calcInputRef as any}
                            rows={3}
                            inputMode="none"
                            className="w-full bg-gray-100 p-4 rounded-xl text-right text-2xl font-mono font-bold text-gray-800 outline-none focus:ring-2 focus:ring-blue-500 cursor-default resize-none overflow-y-auto break-all"
                            value={calcValue}
                            onChange={e => setCalcValue(e.target.value)}
                            placeholder="0"
                        />
                        
                        <div className="grid grid-cols-4 gap-2">
                            {['(', ')', 'C', '/'].map(btn => (
                                <button 
                                    key={btn} 
                                    onClick={() => {
                                        if (btn === 'C') setCalcValue('');
                                        else handleCalcInput(btn);
                                    }} 
                                    className={`p-3 rounded-lg font-bold ${btn === 'C' ? 'bg-red-50 text-red-600 hover:bg-red-100' : 'bg-slate-100 hover:bg-slate-200'}`}
                                >
                                    {btn}
                                </button>
                            ))}
                            {['7', '8', '9', 'X'].map(btn => (
                                <button key={btn} onClick={() => handleCalcInput(btn)} className="p-3 bg-slate-100 rounded-lg font-bold hover:bg-slate-200">{btn}</button>
                            ))}
                            {['4', '5', '6', '-'].map(btn => (
                                <button key={btn} onClick={() => handleCalcInput(btn)} className="p-3 bg-slate-100 rounded-lg font-bold hover:bg-slate-200">{btn}</button>
                            ))}
                            {['1', '2', '3', '+'].map(btn => (
                                <button key={btn} onClick={() => handleCalcInput(btn)} className="p-3 bg-slate-100 rounded-lg font-bold hover:bg-slate-200">{btn}</button>
                            ))}
                            {['0', '.', '00'].map(btn => (
                                <button key={btn} onClick={() => handleCalcInput(btn)} className="p-3 bg-slate-100 rounded-lg font-bold hover:bg-slate-200">{btn}</button>
                            ))}
                            <button 
                                onClick={handleCalcDelete}
                                className="p-3 bg-red-50 text-red-600 rounded-lg font-bold hover:bg-red-100 flex items-center justify-center"
                            >
                                <Delete className="w-5 h-5"/>
                            </button>
                        </div>
                        
                        <div className="flex gap-2">
                            <button 
                                onClick={() => {
                                    try {
                                        // eslint-disable-next-line no-eval
                                        const result = eval(calcValue.replace(/X/gi, '*'));
                                        setCalcValue(result.toString());
                                    } catch (e) {
                                        setCalcValue('Error');
                                    }
                                }}
                                className="w-full py-3 bg-blue-600 text-white font-bold rounded-xl shadow-lg hover:bg-blue-700 transition-all text-xl"
                            >
                                =
                            </button>
                        </div>

                        <button 
                            onClick={() => {
                                try {
                                    // eslint-disable-next-line no-eval
                                    const result = eval(calcValue.replace(/X/gi, '*'));
                                    const resultStr = result.toString();
                                    
                                    if (calcTarget === 'PALLETS') setCountPallets(resultStr);
                                    else if (calcTarget === 'BOXES') setCountBoxes(resultStr);
                                    else setCountQty(resultStr);
                                    
                                    setShowCalculator(false);
                                    setCalcValue('');
                                } catch (e) {
                                    alert("Expresión inválida");
                                }
                            }}
                            className="w-full py-4 bg-[#82BD02] text-white font-black rounded-xl shadow-lg hover:bg-[#74a902] transition-all uppercase tracking-widest text-sm"
                        >
                            {calcTarget === 'PALLETS' ? 'Agregar a Pallets' : calcTarget === 'BOXES' ? 'Agregar a Cajas' : 'Agregar a Unidades'}
                        </button>
                    </div>
                </div>
            </div>
        )}

        {/* Image Viewer Modal */}
        {selectedImage && (
            <div 
                className="fixed inset-0 z-[500] flex items-center justify-center p-4 bg-black/90 backdrop-blur-sm animate-in fade-in duration-200 cursor-zoom-out"
                onClick={() => setSelectedImage(null)}
            >
                <div className="relative max-w-5xl max-h-full flex items-center justify-center">
                    <button 
                        className="absolute -top-12 right-0 p-2 text-white hover:text-gray-300 transition-colors"
                        onClick={() => setSelectedImage(null)}
                    >
                        <XCircle className="w-8 h-8" />
                    </button>
                    <img 
                        src={selectedImage} 
                        alt="Maximized" 
                        className="max-w-full max-h-[90vh] rounded-xl shadow-2xl object-contain animate-in zoom-in-95 duration-200"
                        referrerPolicy="no-referrer"
                    />
                </div>
            </div>
        )}
    </div>
  );
};

export default InventoryList;
