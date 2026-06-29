
import React, { useState, useEffect } from 'react';
import * as XLSX from 'xlsx-js-style';
import { DespachoEncabezado, DespachoItem, Product } from '../types';
import { Upload, FileSpreadsheet, Truck, Box, CheckCircle, XCircle, Printer, Clock, Plus, Minus, Camera, X, Eye, AlertTriangle, Info, Bell, ChevronDown, ChevronLeft, ChevronRight, Pencil, Scale, Image as ImageIcon, Trash2, Save, BarChart3, MapPin } from './Icons';
import { supabase } from '../supabaseClient';
import { compressImage, generateStorageFileName } from '../utils';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { 
    PieChart, Pie, Cell, ResponsiveContainer, 
    Tooltip as RechartsTooltip, Legend, Label,
    LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip 
} from 'recharts';
import { motion, AnimatePresence } from 'motion/react';


interface DespachoProvinciaProps {
    catalog: Product[];
    user: any; // Using any for now to avoid strict type issues if Usuario is not fully imported, but should be Usuario
}

const DespachoProvincia: React.FC<DespachoProvinciaProps> = ({ catalog, user }) => {
  const despachoModo = 'PROVINCIA';
  const [pestañaActiva, setPestañaActiva] = useState<'CARGA' | 'PENDIENTES' | 'CONSOLIDADO'>('PENDIENTES');
  const [headers, setHeaders] = useState<DespachoEncabezado[]>([]);
  const [itemsDetalle, setItemsDetalle] = useState<DespachoItem[]>([]);
  const [selectedHeaderId, setSelectedHeaderId] = useState<string | null>(null);
  const [showTvuHighlights, setShowTvuHighlights] = useState(false);
  
  const [tempData, setTempData] = useState<{header: Partial<DespachoEncabezado>, items: Partial<DespachoItem>[]}[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [paletaActivaNo, setPaletaActivaNo] = useState<number>(1);
  const [toast, setToast] = useState<{show: boolean, message: string, type: 'success' | 'error'}>({show: false, message: '', type: 'success'});
  const [showConfirmFinalize, setShowConfirmFinalize] = useState(false);
  const [headerToFinalize, setHeaderToFinalize] = useState<string | null>(null);

  const [activeItemPicking, setActiveItemPicking] = useState<DespachoItem | null>(null);
  const [editingItemId, setEditingItemId] = useState<string | null>(null);
  const [pickQty, setPickQty] = useState('');
  const [pickPhotos, setPickPhotos] = useState<string[]>([]);

  // Weight and Tare Control States
  const [pesoBruto, setPesoBruto] = useState<string>('');
  const [nroCajasTinas, setNroCajasTinas] = useState<string>('');
  const [taraCajaUnid, setTaraCajaUnid] = useState<string>('');
  const [taraPallet, setTaraPallet] = useState<string>('');
  const [pesoNeto, setPesoNeto] = useState<number>(0);

  const [showHistoryDetail, setShowHistoryDetail] = useState(false);
  const [selectedHistoryHeader, setSelectedHistoryHeader] = useState<DespachoEncabezado | null>(null);
  const [historyItems, setHistoryItems] = useState<DespachoItem[]>([]);
  const [camaraFilter, setCamaraFilter] = useState<'TODOS' | 'SECO' | 'REFRIGERADO' | 'CONGELADO'>('TODOS');
  
  const [showDeleteHistoryConfirm, setShowDeleteHistoryConfirm] = useState(false);
  const [headerToDelete, setHeaderToDelete] = useState<DespachoEncabezado | null>(null);
  
  // Custom Date States
  const [pickDay, setPickDay] = useState<string>('');
  const [pickMonth, setPickMonth] = useState<string>('');
  const [pickYear, setPickYear] = useState<string>('');

  const [tvuWarning, setTvuWarning] = useState<{
    show: boolean;
    percentage: number;
    color: 'red' | 'orange' | 'none';
    message: string;
  }>({ show: false, percentage: 0, color: 'none', message: '' });

  const [alertModal, setAlertModal] = useState<{show: boolean, title: string, message: string, type: 'info' | 'error' | 'warning'}>({show: false, title: '', message: '', type: 'info'});
  const [maximizedGallery, setMaximizedGallery] = useState<{ photos: string[], index: number } | null>(null);
  const [showSuccessMsg, setShowSuccessMsg] = useState(false);
  const [showTvuModal, setShowTvuModal] = useState(false);
  const [tvuModalData, setTvuModalData] = useState<{provincia: string, items: any[]}>({provincia: '', items: []});

  const [showAddProductModal, setShowAddProductModal] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<Product[]>([]);
  const [selectedProductToAdd, setSelectedProductToAdd] = useState<Product | null>(null);
  const [addQty, setAddQty] = useState('');
  const [isAddingProduct, setIsAddingProduct] = useState(false);

  const [showCancelModal, setShowCancelModal] = useState(false);
  const [showPreparedWeightsModal, setShowPreparedWeightsModal] = useState(false);
  const [preparedWeightsHeader, setPreparedWeightsHeader] = useState<any | null>(null);
  const [preparedWeightsItems, setPreparedWeightsItems] = useState<any[]>([]);
  const [loadingPreparedWeights, setLoadingPreparedWeights] = useState(false);
  const [showDeleteRecordModal, setShowDeleteRecordModal] = useState(false);
  const [recordIdToDelete, setRecordIdToDelete] = useState<string | null>(null);
  const [cancelReason, setCancelReason] = useState('');
  const [itemToCancel, setItemToCancel] = useState<DespachoItem | null>(null);
  const [headerToCancel, setHeaderToCancel] = useState<string | null>(null);
  const [isSavingPicking, setIsSavingPicking] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [isCancelling, setIsCancelling] = useState(false);

  // Manejo del botón atrás del sistema (Mobile Back Button) para PROVINCIA
  useEffect(() => {
    const handleBackButton = (e: PopStateEvent) => {
        // Solo actuar si estamos en modo PROVINCIA, ya que CARRO_TARDE tiene su propia lógica interna
        if (despachoModo === 'PROVINCIA') {
            const hasModalOpen = activeItemPicking || selectedHeaderId || showHistoryDetail || showAddProductModal || showPreparedWeightsModal;
            
            if (hasModalOpen) {
                e.preventDefault();
                
                if (showPreparedWeightsModal) {
                    setShowPreparedWeightsModal(false);
                } else if (activeItemPicking) {
                    setActiveItemPicking(null);
                } else if (showAddProductModal) {
                    setShowAddProductModal(false);
                } else if (selectedHeaderId) {
                    setSelectedHeaderId(null);
                } else if (showHistoryDetail) {
                    setShowHistoryDetail(false);
                }
                
                // Volver a empujar un estado para capturar el siguiente atrás si aún hay algo abierto
                window.history.pushState({ modo: 'PROVINCIA' }, '');
            }
        }
    };

    const isSomethingOpen = despachoModo === 'PROVINCIA' && (activeItemPicking || selectedHeaderId || showHistoryDetail || showAddProductModal || showPreparedWeightsModal);

    if (isSomethingOpen) {
        window.history.pushState({ modo: 'PROVINCIA' }, '');
        window.addEventListener('popstate', handleBackButton);
    }

    return () => window.removeEventListener('popstate', handleBackButton);
  }, [despachoModo, activeItemPicking, selectedHeaderId, showHistoryDetail, showAddProductModal, showPreparedWeightsModal]);

  const showAlert = (message: string, title: string = 'Atención', type: 'info' | 'error' | 'warning' = 'info') => {
    setAlertModal({ show: true, title, message, type });
  };

  const handleOpenPreparedWeights = async (header: any) => {
    setPreparedWeightsHeader(header);
    setShowPreparedWeightsModal(true);
    setLoadingPreparedWeights(true);
    setPreparedWeightsItems([]);
    try {
      const { data, error } = await supabase
        .from('despachos_item')
        .select('*')
        .eq('encabezado_id', header.id)
        .eq('estado', 'COMPLETADO');
      if (error) throw error;
      setPreparedWeightsItems(data || []);
    } catch (err: any) {
      console.error("Error al cargar pesos preparados:", err);
      showAlert("Error al cargar los pesos preparados: " + (err.message || err), "Error", "error");
    } finally {
      setLoadingPreparedWeights(false);
    }
  };

  const handleShowTvuModal = async (header: DespachoEncabezado) => {
    setIsProcessing(true);
    try {
        const { data: items, error } = await supabase
            .from('despachos_item')
            .select('*')
            .eq('encabezado_id', header.id);
        
        if (error) throw error;

        const today = new Date();
        today.setHours(0, 0, 0, 0);

        const observedItems = items?.filter(it => {
            if (it.estado === 'COMPLETADO' && it.fecha_vencimiento) {
                const product = catalog.find(p => p.codigo === it.codigo);
                if (product && product.vida_util_dias) {
                    const expDate = new Date(it.fecha_vencimiento);
                    const remainingDays = Math.ceil((expDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
                    const totalLifeDays = product.vida_util_dias;
                    const percentage = (remainingDays / totalLifeDays) * 100;
                    return percentage < 70;
                }
            }
            return false;
        }).map(it => {
            const product = catalog.find(p => p.codigo === it.codigo);
            const expDate = new Date(it.fecha_vencimiento!);
            const remainingDays = Math.ceil((expDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
            const totalLifeDays = product!.vida_util_dias;
            const percentage = Math.round((remainingDays / totalLifeDays) * 100);
            return {
                codigo: it.codigo,
                nombre: it.descripcion,
                tvuActual: percentage,
                tvuDias: remainingDays,
                tvmDias: product!.tvm_dias,
                vencimiento: it.fecha_vencimiento,
                pedido: it.cantidad_pedida,
                unidadMedida: it.unidad_medida
            };
        }) || [];

        // Sort by expiration date (vencimiento) ascending
        observedItems.sort((a, b) => {
            if (!a.vencimiento) return 1;
            if (!b.vencimiento) return -1;
            return new Date(a.vencimiento).getTime() - new Date(b.vencimiento).getTime();
        });

        setTvuModalData({ provincia: header.provincia, items: observedItems });
        setShowTvuModal(true);
    } catch (err) {
        console.error(err);
        showAlert("Error al cargar productos observados", "Error", "error");
    } finally {
        setIsProcessing(false);
    }
  };

  const [showChartsModal, setShowChartsModal] = useState(false);
  const [selectedHeaderForCharts, setSelectedHeaderForCharts] = useState<DespachoEncabezado | null>(null);

  const [showUserStatsModal, setShowUserStatsModal] = useState(false);
  const [userStatsData, setUserStatsData] = useState<{usuario: string, frecuencia: number, kilos: number}[]>([]);
  const [timeStatsData, setTimeStatsData] = useState<{hora: string, kilos: number}[]>([]);
  const [isLoadingStats, setIsLoadingStats] = useState(false);
  const [headerNameForStats, setHeaderNameForStats] = useState('');

  const verEstadisticasPicking = async (header: DespachoEncabezado) => {
    setIsLoadingStats(true);
    setShowUserStatsModal(true);
    setHeaderNameForStats(header.provincia);
    try {
        const { data, error } = await supabase
            .from('despachos_item')
            .select('usuario_preparacion, cantidad_despachada, peso_total, estado, fecha_preparacion')
            .eq('encabezado_id', header.id)
            .eq('estado', 'COMPLETADO');

        if (error) throw error;

        const statsMap: Record<string, { frecuencia: number, kilos: number }> = {};
        const hourlyMap: Record<string, number> = {};

        data?.forEach(item => {
            const user = item.usuario_preparacion || 'Sin Usuario';
            if (!statsMap[user]) {
                statsMap[user] = { frecuencia: 0, kilos: 0 };
            }
            statsMap[user].frecuencia += 1;
            statsMap[user].kilos += item.peso_total || 0;

            if (item.fecha_preparacion) {
                const date = new Date(item.fecha_preparacion);
                const hour = date.getHours().toString().padStart(2, '0') + ':00';
                hourlyMap[hour] = (hourlyMap[hour] || 0) + (item.peso_total || 0);
            }
        });

        const statsArray = Object.entries(statsMap).map(([usuario, stats]) => ({
            usuario,
            frecuencia: stats.frecuencia,
            kilos: parseFloat(stats.kilos.toFixed(2))
        }));

        const timeArray = Object.entries(hourlyMap).map(([hora, kilos]) => ({
            hora,
            kilos: parseFloat(kilos.toFixed(2))
        })).sort((a, b) => a.hora.localeCompare(b.hora));

        // Sort by kilos descending
        statsArray.sort((a, b) => b.kilos - a.kilos);

        setUserStatsData(statsArray);
        setTimeStatsData(timeArray);
    } catch (err) {
        console.error(err);
        showAlert("Error al obtener estadísticas de picking", "Error", "error");
    } finally {
        setIsLoadingStats(false);
    }
  };

  const handlePickQtyChange = (val: string) => {
    const num = parseFloat(val);
    if (isNaN(num)) {
      setPickQty('');
      return;
    }
    // Prevent negative values
    setPickQty(Math.max(0, num).toString());
  };

  // Effect to calculate Net Weight
  useEffect(() => {
    if (activeItemPicking) {
      const product = catalog.find(p => p.codigo === activeItemPicking.codigo);
      if (product?.usa_control_tara) {
        const bruto = parseFloat(pesoBruto) || 0;
        const cajas = parseInt(nroCajasTinas) || 0;
        const tCaja = parseFloat(taraCajaUnid) || 0;
        const tPallet = parseFloat(taraPallet) || 0;
        
        const neto = Math.max(0, bruto - (cajas * tCaja) - tPallet);
        setPesoNeto(neto);
        setPickQty(neto.toFixed(2));
      }
    }
  }, [pesoBruto, nroCajasTinas, taraCajaUnid, taraPallet, activeItemPicking, catalog]);

  const adjustQty = (amount: number) => {
    const current = parseFloat(pickQty) || 0;
    handlePickQtyChange((current + amount).toString());
  };

  const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;
    
    if (pickPhotos.length + files.length > 4) {
      showAlert("Máximo 4 fotos en total", "Límite Alcanzado", "warning");
      return;
    }

    setIsUploading(true);
    try {
      const newPhotos = await Promise.all(files.map(file => {
        return new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = (evt) => resolve(evt.target?.result as string);
          reader.onerror = reject;
          reader.readAsDataURL(file);
        });
      }));
      setPickPhotos(prev => [...prev, ...newPhotos]);
    } catch (err) {
      console.error(err);
      showAlert("Error al cargar una o más fotos", "Error", "error");
    } finally {
      setIsUploading(false);
      // Reset input value to allow re-uploading same file if needed
      e.target.value = '';
    }
  };

  useEffect(() => {
      fetchHeaders();
  }, []);

  const fetchHeaders = async () => {
      setIsProcessing(true);
      try {
          let query = supabase
              .from('despacho_encabezado')
              .select('*')
              .eq('tipo_despacho', 'PROVINCIA')
              .neq('estado', 'CANCELADO');

          if (user?.sede_id) {
              query = query.eq('sede_id', user.sede_id);
          }

          const { data: hData, error: hError } = await query.order('fecha_creacion', { ascending: false });
          
          if (hError) throw hError;

          const headersConMetricas = await Promise.all(hData.map(async (h) => {
              const { data: items, error: iError } = await supabase
                  .from('despachos_item')
                  .select('estado, cantidad_pedida, cantidad_despachada, peso_total, codigo, fecha_vencimiento, tipo_camara')
                  .eq('encabezado_id', h.id);
              
              if (iError) return h;

              const itemsCompletados = items.filter(it => it.estado === 'COMPLETADO');
              const completados = itemsCompletados.length;
              const totalItems = items.length;
              const totalPedida = items.reduce((acc, it) => acc + (it.cantidad_pedida || 0), 0);
              const totalCargada = itemsCompletados.reduce((acc, it) => acc + (it.cantidad_despachada || 0), 0);
              const pesoCargado = itemsCompletados.reduce((acc, it) => acc + (it.peso_total || 0), 0);

              // Calculate total estimated pallets
              const totalPalletsEstimados = itemsCompletados.reduce((acc, it) => {
                const pesoItem = it.peso_total || 0;
                return acc + calculateEstimatedPallets(pesoItem);
              }, 0);

              // Calculate total_peso_pedido
              let pesoPedidoTotal = 0;
              items.forEach(it => {
                  const product = catalog.find(p => p.codigo === it.codigo);
                  const pesoUnitario = product?.peso_unitario || 0;
                  pesoPedidoTotal += (it.cantidad_pedida || 0) * pesoUnitario;
              });

              // Calculate category progress and weights
              const categories = ['SECO', 'REFRIGERADO', 'CONGELADO'];
              const categoryMetrics = categories.reduce((acc, cat) => {
                  const catItems = items.filter(it => it.tipo_camara?.toUpperCase() === cat);
                  const catPedida = catItems.reduce((sum, it) => sum + (it.cantidad_pedida || 0), 0);
                  const catItemsCompletados = catItems.filter(it => it.estado === 'COMPLETADO');
                  const catDespachada = catItemsCompletados.reduce((sum, it) => sum + (it.cantidad_despachada || 0), 0);
                  const catPeso = catItemsCompletados.reduce((sum, it) => sum + (it.peso_total || 0), 0);
                  acc.pct[cat] = catPedida > 0 ? Number(((catDespachada / catPedida) * 100).toFixed(1)) : 0;
                  acc.weight[cat] = catPeso;
                  return acc;
              }, { pct: {} as Record<string, number>, weight: {} as Record<string, number> });

              // Check for TVU < 50%
              let hasTvuWarning = false;
              const today = new Date();
              today.setHours(0, 0, 0, 0);

              for (const it of items) {
                if (it.estado === 'COMPLETADO' && it.fecha_vencimiento) {
                  const product = catalog.find(p => p.codigo === it.codigo);
                  if (product && product.vida_util_dias) {
                    const expDate = new Date(it.fecha_vencimiento);
                    const remainingDays = Math.ceil((expDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
                    const totalLifeDays = product.vida_util_dias;
                    const percentage = (remainingDays / totalLifeDays) * 100;
                    
                    if (percentage < 70) {
                      hasTvuWarning = true;
                      break;
                    }
                  }
                }
              }

              return { 
                ...h, 
                total_items: totalItems,
                items_completados: completados,
                total_qty_pedida: totalPedida,
                total_qty_despachada: totalCargada,
                total_peso_pedido: pesoPedidoTotal,
                total_peso_cargado: pesoCargado,
                secos_pct: categoryMetrics.pct['SECO'],
                refrigerados_pct: categoryMetrics.pct['REFRIGERADO'],
                congelados_pct: categoryMetrics.pct['CONGELADO'],
                peso_seco: categoryMetrics.weight['SECO'],
                peso_refrigerado: categoryMetrics.weight['REFRIGERADO'],
                peso_congelado: categoryMetrics.weight['CONGELADO'],
                total_pallets_estimados: totalPalletsEstimados,
                has_tvu_warning: hasTvuWarning
              };
          }));

          setHeaders(headersConMetricas);
      } catch (err) {
          console.error(err);
      } finally {
          setIsProcessing(false);
      }
  };

  const fetchItems = async (headerId: string) => {
      setIsProcessing(true);
      setShowTvuHighlights(false); // Reset highlights when changing order
      const { data, error } = await supabase
          .from('despachos_item')
          .select('*')
          .eq('encabezado_id', headerId)
          .order('estado', { ascending: false }) // PENDIENTE (P) antes que COMPLETADO (C)
          .order('cantidad_pedida', { ascending: false });
      
      if (!error && data) setItemsDetalle(data);
      setIsProcessing(false);
  };

  const handleFinalizeHeader = (e: React.MouseEvent, headerId: string) => {
    e.stopPropagation();
    setHeaderToFinalize(headerId);
    setShowConfirmFinalize(true);
  };

  const handleCancelHeader = (e: React.MouseEvent, headerId: string) => {
    e.stopPropagation();
    setHeaderToCancel(headerId);
    setItemToCancel(null);
    setShowCancelModal(true);
  };

  const handleCancelItem = (e: React.MouseEvent, item: DespachoItem) => {
    e.stopPropagation();
    setItemToCancel(item);
    setHeaderToCancel(null);
    setShowCancelModal(true);
  };

  const handleCancel = async () => {
    if (!cancelReason.trim()) {
      showAlert("Debe ingresar un motivo de cancelación", "Atención", "warning");
      return;
    }

    setIsCancelling(true);
    try {
      const cancelData = {
        estado: 'CANCELADO',
        motivo_cancelacion: cancelReason,
        usuario_cancelacion: user.nombre || user.username,
        fecha_cancelacion: new Date().toISOString()
      };

      if (itemToCancel) {
        // Cancel single item or consolidated group
        const item = itemToCancel as any;
        const idsToCancel = item.original_items 
          ? item.original_items.map((it: any) => it.id) 
          : [item.id];

        const { error } = await supabase
          .from('despachos_item')
          .update(cancelData)
          .in('id', idsToCancel);
        
        if (error) throw error;
        
        setItemsDetalle(prev => prev.map(it => idsToCancel.includes(it.id) ? { ...it, ...cancelData } as DespachoItem : it));
        
        // Update header totals
        if (selectedHeaderId) {
            const { data: currentHeader } = await supabase
                .from('despacho_encabezado')
                .select('total_items')
                .eq('id', selectedHeaderId)
                .single();
            
            if (currentHeader) {
                await supabase
                    .from('despacho_encabezado')
                    .update({ total_items: Math.max(0, (currentHeader.total_items || 0) - idsToCancel.length) })
                    .eq('id', selectedHeaderId);
            }
        }
        await fetchHeaders();
      } else if (headerToCancel) {
        // Cancel entire header and all its items
        const { error: hError } = await supabase
          .from('despacho_encabezado')
          .update(cancelData)
          .eq('id', headerToCancel);
        
        if (hError) throw hError;

        const { error: iError } = await supabase
          .from('despachos_item')
          .update(cancelData)
          .eq('encabezado_id', headerToCancel)
          .neq('estado', 'CANCELADO');

        if (iError) throw iError;

        setHeaders(prev => prev.map(h => h.id === headerToCancel ? { ...h, ...cancelData } as DespachoEncabezado : h));
        if (selectedHeaderId === headerToCancel) {
          setSelectedHeaderId(null);
        }
      }

      setShowCancelModal(false);
      setCancelReason('');
      setItemToCancel(null);
      setHeaderToCancel(null);
      setToast({ show: true, message: 'Cancelación realizada correctamente', type: 'success' });
      setTimeout(() => setToast({ show: false, message: '', type: 'success' }), 3000);
      
      // Show alert modal as requested
      showAlert(
        itemToCancel 
          ? `El producto "${itemToCancel.descripcion}" ha sido cancelado.` 
          : "El despacho ha sido cancelado correctamente.",
        "Cancelación Exitosa",
        "info"
      );
    } catch (err: any) {
      console.error(err);
      showAlert(err.message || "Error al cancelar", "Error", "error");
    } finally {
      setIsCancelling(false);
    }
  };

  const handleDeletePickingRecord = async () => {
    if (!recordIdToDelete) return;
    const itemId = recordIdToDelete;
    
    try {
      setIsProcessing(true);
      
      // If it's a temporary ID, just remove it from local state
      if (itemId.startsWith('temp-')) {
        setItemsDetalle(prev => prev.filter(it => it.id !== itemId));
        showAlert("Registro eliminado correctamente", "Éxito", "info");
        setShowDeleteRecordModal(false);
        setRecordIdToDelete(null);
        return;
      }

      const { error } = await supabase
        .from('despachos_item')
        .update({ 
          estado: 'CANCELADO',
          motivo_cancelacion: 'Eliminado desde picking',
          usuario_cancelacion: user.nombre || user.username,
          fecha_cancelacion: new Date().toISOString()
        })
        .eq('id', itemId);

      if (error) throw error;
      
      setItemsDetalle(prev => prev.filter(it => it.id !== itemId));
      showAlert("Registro eliminado correctamente", "Éxito", "info");
    } catch (err: any) {
      console.error(err);
      showAlert(err.message || "Error al eliminar registro", "Error", "error");
    } finally {
      setIsProcessing(false);
      setShowDeleteRecordModal(false);
      setRecordIdToDelete(null);
    }
  };

  const confirmFinalize = async () => {
    if (!headerToFinalize) return;
    
    setIsProcessing(true);
    setShowConfirmFinalize(false);
    try {
        const { error } = await supabase
            .from('despacho_encabezado')
            .update({ 
                estado: 'COMPLETADO',
                fecha_despacho: new Date().toISOString()
            })
            .eq('id', headerToFinalize);
        
        if (error) throw error;
        
        await fetchHeaders();
        setPestañaActiva('CONSOLIDADO');
        setToast({ show: true, message: 'Despacho finalizado y movido al histórico', type: 'success' });
        setTimeout(() => setToast({ show: false, message: '', type: 'success' }), 3000);
    } catch (err: any) {
        console.error(err);
        setToast({ show: true, message: `Error: ${err.message || 'No se pudo finalizar'}`, type: 'error' });
        setTimeout(() => setToast({ show: false, message: '', type: 'success' }), 3000);
    } finally {
        setIsProcessing(false);
        setHeaderToFinalize(null);
    }
  };

  const calculateEstimatedPallets = (weight: number) => {
    return Math.round(weight / 720);
  };

  const handleDownloadExcel = async (e: React.MouseEvent, header: DespachoEncabezado) => {
    e.stopPropagation(); // Evitar que abra la vista de picking
    setIsProcessing(true);
    try {
        const { data: items, error } = await supabase
            .from('despachos_item')
            .select('*')
            .eq('encabezado_id', header.id)
            .order('numero_paleta', { ascending: true })
            .order('descripcion', { ascending: true });
        
        if (error) throw error;
        if (!items || items.length === 0) {
            showAlert("No hay items para exportar", "Error", "error");
            return;
        }

        const exportData = items.map(it => {
            const product = catalog.find(p => p.codigo === it.codigo);
            let tvuPercentage: number | null = null;
            if (it.fecha_vencimiento && product?.vida_util_dias) {
                const today = new Date();
                today.setHours(0, 0, 0, 0);
                const expDate = new Date(it.fecha_vencimiento);
                const remainingDays = Math.ceil((expDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
                const totalLifeDays = product.vida_util_dias;
                tvuPercentage = Math.round((remainingDays / totalLifeDays) * 100);
            }

            const pesoSolicitado = (it.cantidad_pedida || 0) * (product?.peso_unitario || 0);
            const pesoDespachado = it.estado === 'COMPLETADO' ? (it.peso_total || (it.cantidad_despachada * (product?.peso_unitario || 0))) : 0;
            const estimatedPallets = calculateEstimatedPallets(pesoDespachado);

            return {
                'Provincia': header.provincia,
                'Paleta': it.numero_paleta || 'S/P',
                'Código/SKU': it.codigo,
                'Descripción': it.descripcion,
                'Unidad': it.unidad_medida,
                'Cámara': it.tipo_camara,
                'Cantidad Pedida': it.cantidad_pedida,
                'Cantidad Cargada': it.cantidad_despachada,
                'Diferencia': it.cantidad_despachada - it.cantidad_pedida,
                'Peso Solicitado': pesoSolicitado,
                'Peso Despachado': pesoDespachado,
                'Estimado Pallets': estimatedPallets,
                'Peso Bruto': it.peso_bruto || 0,
                'Número de Cajas / Tinas': it.nro_cajas_tinas || 0,
                'Tara Caja Tina': it.tara_caja_unid || 0,
                'Tara de Pallet': it.tara_pallet || 0,
                'Peso Neto': it.peso_neto || 0,
                'Estado': it.estado,
                'Vencimiento': it.fecha_vencimiento || '',
                'Porcentaje de TVU': tvuPercentage !== null ? `${tvuPercentage}%` : '',
                'tvu_val': tvuPercentage, // Helper for sorting
                'Preparado Por': it.usuario_preparacion || '',
                'Fecha Preparación': it.fecha_preparacion ? new Date(it.fecha_preparacion).toLocaleString() : '',
                'Foto 1': it.fotos && it.fotos[0] ? it.fotos[0] : '',
                'Foto 2': it.fotos && it.fotos[1] ? it.fotos[1] : '',
                'Foto 3': it.fotos && it.fotos[2] ? it.fotos[2] : ''
            };
        });

        // Sort by TVU percentage (lowest to highest). Items without TVU go to the end.
        exportData.sort((a, b) => {
            const valA = a.tvu_val === null ? 999999 : a.tvu_val;
            const valB = b.tvu_val === null ? 999999 : b.tvu_val;
            return valA - valB;
        });

        // Remove helper field
        const finalExportData = exportData.map(({ tvu_val, ...rest }: any) => rest);

        const ws = XLSX.utils.json_to_sheet(finalExportData);
        
        // Add styles
        const range = XLSX.utils.decode_range(ws['!ref']!);
        for (let R = range.s.r; R <= range.e.r; ++R) {
            // Check if row is cancelled
            const isCancelled = R > 0 && finalExportData[R - 1] && finalExportData[R - 1].Estado === 'CANCELADO';

            for (let C = range.s.c; C <= range.e.c; ++C) {
                const cell_address = { c: C, r: R };
                const cell_ref = XLSX.utils.encode_cell(cell_address);
                if (!ws[cell_ref]) continue;

                if (!ws[cell_ref].s) ws[cell_ref].s = {};

                // Header styles
                if (R === 0) {
                    ws[cell_ref].s = {
                        fill: { fgColor: { rgb: "E9ECEF" } },
                        font: { bold: true, color: { rgb: "000000" } },
                        alignment: { horizontal: "center" }
                    };
                }

                // Row-level styles (CANCELADO)
                if (isCancelled) {
                    ws[cell_ref].s = {
                        ...ws[cell_ref].s,
                        fill: { fgColor: { rgb: "F8D7DA" } }, // Light red background
                    };
                }

                // Column specific styles
                const headers = Object.keys(finalExportData[0] || {});
                const headerName = headers[C];
                
                if (headerName === "Cantidad Cargada") {
                    ws[cell_ref].s = {
                        ...ws[cell_ref].s,
                        font: { color: { rgb: "0000FF" }, bold: R === 0 }, // Blue text
                    };
                } else if (["Peso Solicitado", "Peso Despachado", "Estimado Pallets", "Peso Bruto", "Número de Cajas / Tinas", "Tara Caja Tina", "Tara de Pallet", "Peso Neto"].includes(headerName)) {
                    // Only apply celeste if not cancelled
                    if (!isCancelled) {
                        ws[cell_ref].s = {
                            ...ws[cell_ref].s,
                            fill: { fgColor: { rgb: "B0E0E6" } }, // PowderBlue (Celeste)
                        };
                    }
                }
            }
        }

        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, "Resumen de Carga");
        XLSX.writeFile(wb, `Despacho_${header.provincia}_${new Date().toISOString().split('T')[0]}.xlsx`);
    } catch (err) {
        console.error(err);
        showAlert("Error al exportar excel", "Error", "error");
    } finally {
        setIsProcessing(false);
    }
  };

  const handleDownloadAllHistory = async () => {
    setIsProcessing(true);
    try {
      let query = supabase
        .from('despachos_item')
        .select('*, despacho_encabezado!inner(*)')
        .eq('despacho_encabezado.estado', 'COMPLETADO');

      if (user?.sede_id) {
        query = query.eq('sede_id', user.sede_id);
      }

      const { data: items, error } = await query.order('fecha_preparacion', { ascending: false });

      if (error) throw error;
      if (!items || items.length === 0) {
        showAlert("No hay datos históricos para exportar", "Información", "info");
        return;
      }

        const exportData = items.map(it => {
          const header = (it as any).despacho_encabezado;
          const product = catalog.find(p => p.codigo === it.codigo);
          let tvuPercentage: number | null = null;
          if (it.fecha_vencimiento && product?.vida_util_dias) {
            const today = new Date();
            today.setHours(0, 0, 0, 0);
            const expDate = new Date(it.fecha_vencimiento);
            const remainingDays = Math.ceil((expDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
            const totalLifeDays = product.vida_util_dias;
            tvuPercentage = Math.round((remainingDays / totalLifeDays) * 100);
          }

          const pesoSolicitado = (it.cantidad_pedida || 0) * (product?.peso_unitario || 0);
          const pesoDespachado = it.estado === 'COMPLETADO' ? (it.peso_total || (it.cantidad_despachada * (product?.peso_unitario || 0))) : 0;
          const estimatedPallets = calculateEstimatedPallets(pesoDespachado);

          return {
            'Provincia': header.provincia,
            'Fecha Despacho': header.fecha_despacho ? new Date(header.fecha_despacho).toLocaleDateString() : '',
            'Paleta': it.numero_paleta || 'S/P',
            'Código/SKU': it.codigo,
            'Descripción': it.descripcion,
            'Unidad': it.unidad_medida,
            'Cámara': it.tipo_camara,
            'Cantidad Pedida': it.cantidad_pedida,
            'Cantidad Cargada': it.cantidad_despachada,
            'Diferencia': it.cantidad_despachada - it.cantidad_pedida,
            'Peso Solicitado': pesoSolicitado,
            'Peso Despachado': pesoDespachado,
            'Estimado Pallets': estimatedPallets,
            'Peso Bruto': it.peso_bruto || 0,
            'Número de Cajas / Tinas': it.nro_cajas_tinas || 0,
            'Tara Caja Tina': it.tara_caja_unid || 0,
            'Tara de Pallet': it.tara_pallet || 0,
            'Peso Neto': it.peso_neto || 0,
            'Estado': it.estado,
            'Vencimiento': it.fecha_vencimiento || '',
            'Porcentaje de TVU': tvuPercentage !== null ? `${tvuPercentage}%` : '',
            'tvu_val': tvuPercentage,
            'Preparado Por': it.usuario_preparacion || '',
            'Fecha Preparación': it.fecha_preparacion ? new Date(it.fecha_preparacion).toLocaleString() : '',
            'Foto 1': it.fotos && it.fotos[0] ? it.fotos[0] : '',
            'Foto 2': it.fotos && it.fotos[1] ? it.fotos[1] : '',
            'Foto 3': it.fotos && it.fotos[2] ? it.fotos[2] : ''
          };
        });

      // Sort by TVU percentage (lowest to highest). Items without TVU go to the end.
      exportData.sort((a, b) => {
        const valA = a.tvu_val === null ? 999999 : a.tvu_val;
        const valB = b.tvu_val === null ? 999999 : b.tvu_val;
        return valA - valB;
      });

      // Remove helper field
      const finalExportData = exportData.map(({ tvu_val, ...rest }: any) => rest);

      const ws = XLSX.utils.json_to_sheet(finalExportData);

      // Add styles
      const range = XLSX.utils.decode_range(ws['!ref']!);
      for (let R = range.s.r; R <= range.e.r; ++R) {
        // Check if row is cancelled
        const isCancelled = R > 0 && finalExportData[R - 1] && finalExportData[R - 1].Estado === 'CANCELADO';

        for (let C = range.s.c; C <= range.e.c; ++C) {
          const cell_address = { c: C, r: R };
          const cell_ref = XLSX.utils.encode_cell(cell_address);
          if (!ws[cell_ref]) continue;

          if (!ws[cell_ref].s) ws[cell_ref].s = {};

          // Header styles
          if (R === 0) {
            ws[cell_ref].s = {
              fill: { fgColor: { rgb: "E9ECEF" } },
              font: { bold: true, color: { rgb: "000000" } },
              alignment: { horizontal: "center" }
            };
          }

          // Row-level styles (CANCELADO)
          if (isCancelled) {
            ws[cell_ref].s = {
              ...ws[cell_ref].s,
              fill: { fgColor: { rgb: "F8D7DA" } }, // Light red background
            };
          }

          // Column specific styles
          const headers = Object.keys(finalExportData[0] || {});
          const headerName = headers[C];
          
          if (headerName === "Cantidad Cargada") {
            ws[cell_ref].s = {
              ...ws[cell_ref].s,
              font: { color: { rgb: "0000FF" }, bold: R === 0 }, // Blue text
            };
          } else if (["Peso Solicitado", "Peso Despachado", "Estimado Pallets", "Peso Bruto", "Número de Cajas / Tinas", "Tara Caja Tina", "Tara de Pallet", "Peso Neto"].includes(headerName)) {
            // Only apply celeste if not cancelled
            if (!isCancelled) {
              ws[cell_ref].s = {
                ...ws[cell_ref].s,
                fill: { fgColor: { rgb: "B0E0E6" } }, // PowderBlue (Celeste)
              };
            }
          }
        }
      }

      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "Reporte Histórico General");
      XLSX.writeFile(wb, `Reporte_General_Despachos_${new Date().toISOString().split('T')[0]}.xlsx`);
    } catch (err: any) {
      console.error(err);
      showAlert(err.message || "Error al exportar reporte general", "Error", "error");
    } finally {
      setIsProcessing(false);
    }
  };

  const handleViewHistoryDetail = async (header: DespachoEncabezado) => {
    setIsProcessing(true);
    setShowTvuHighlights(false); // Reset highlights
    try {
        const { data, error } = await supabase
            .from('despachos_item')
            .select('*')
            .eq('encabezado_id', header.id)
            .order('numero_paleta', { ascending: true })
            .order('descripcion', { ascending: true });
        
        if (error) throw error;
        setHistoryItems(data || []);
        setSelectedHistoryHeader(header);
        setShowHistoryDetail(true);
    } catch (err) {
        console.error(err);
        showAlert("Error al cargar detalle", "Error", "error");
    } finally {
        setIsProcessing(false);
    }
  };

  const handleDeleteHistory = async () => {
    if (!headerToDelete) return;
    setIsProcessing(true);
    try {
      // Soft delete: update status to CANCELADO instead of deleting
      // ELIMINADO is not allowed by the database check constraint
      const { error: headerError } = await supabase
        .from('despacho_encabezado')
        .update({ estado: 'CANCELADO' })
        .eq('id', headerToDelete.id);

      if (headerError) throw headerError;

      setHeaders(prev => prev.filter(h => h.id !== headerToDelete.id));
      setShowDeleteHistoryConfirm(false);
      setHeaderToDelete(null);
      showAlert("Registro quitado del historial correctamente", "Éxito", "info");
    } catch (err: any) {
      console.error(err);
      showAlert(err.message || "Error al quitar registro", "Error", "error");
    } finally {
      setIsProcessing(false);
    }
  };

  const generateHistoryPDF = async () => {
    if (!selectedHistoryHeader || historyItems.length === 0) return;

    const doc = new jsPDF({
        orientation: 'landscape',
        unit: 'mm',
        format: 'a4'
    });

    // Header
    doc.setFontSize(18);
    doc.text(`REPORTE DE DESPACHO - ${selectedHistoryHeader.provincia}`, 14, 20);
    
    doc.setFontSize(10);
    doc.text(`Fecha Despacho: ${selectedHistoryHeader.fecha_despacho ? new Date(selectedHistoryHeader.fecha_despacho).toLocaleString() : 'N/A'}`, 14, 28);
    doc.text(`Estado: ${selectedHistoryHeader.estado}`, 14, 33);
    doc.text(`Total Items: ${selectedHistoryHeader.total_items}`, 14, 38);

    const tableData = await Promise.all(historyItems.map(async (it) => {
        return [
            it.numero_paleta || 'S/P',
            it.codigo,
            it.descripcion,
            it.cantidad_pedida,
            it.cantidad_despachada,
            it.unidad_medida,
            it.fecha_vencimiento || '',
            it.usuario_preparacion || '',
            '', // Foto 1 placeholder
            '', // Foto 2 placeholder
            ''  // Foto 3 placeholder
        ];
    }));

    autoTable(doc, {
        startY: 45,
        head: [['PLT', 'CÓDIGO', 'DESCRIPCIÓN', 'PEDIDO', 'CARGADO', 'UM', 'VENC.', 'ASISTENTE', 'FOTO 1', 'FOTO 2', 'FOTO 3']],
        body: tableData,
        theme: 'grid',
        styles: { fontSize: 7, cellPadding: 2 },
        headStyles: { fillColor: [200, 200, 200], textColor: 0, fontStyle: 'bold' },
        columnStyles: {
            8: { cellWidth: 25, minCellHeight: 20 }, // Foto 1
            9: { cellWidth: 25, minCellHeight: 20 }, // Foto 2
            10: { cellWidth: 25, minCellHeight: 20 } // Foto 3
        },
        didDrawCell: (data) => {
            if (data.section === 'body' && (data.column.index === 8 || data.column.index === 9 || data.column.index === 10)) {
                const itemIndex = data.row.index;
                const photoIndex = data.column.index - 8;
                const item = historyItems[itemIndex];
                
                if (item.fotos && item.fotos[photoIndex]) {
                    try {
                        doc.addImage(item.fotos[photoIndex], 'JPEG', data.cell.x + 2, data.cell.y + 2, 21, 16);
                    } catch (e) {
                        console.error("Error adding image to PDF", e);
                    }
                }
            }
        }
    });

    doc.save(`Reporte_Despacho_${selectedHistoryHeader.provincia}_${new Date().toISOString().split('T')[0]}.pdf`);
  };

  const handleDownloadSample = () => {
    const sampleData = [
      ['PROVINCIA', 'CODIGO_SKU', 'DESCRIPCION', 'CANTIDAD_PEDIDA'],
      ['LIMA', 'SKU001', 'PRODUCTO EJEMPLO 1', 100],
      ['AREQUIPA', 'SKU002', 'PRODUCTO EJEMPLO 2', 50],
      ['TRUJILLO', 'SKU003', 'PRODUCTO EJEMPLO 3', 75]
    ];

    const ws = XLSX.utils.aoa_to_sheet(sampleData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Plantilla Despachos");
    XLSX.writeFile(wb, "Plantilla_Ejemplo_Despachos.xlsx");
  };

  const handleImportExcel = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (evt) => {
        try {
            const data = new Uint8Array(evt.target?.result as ArrayBuffer);
            const workbook = XLSX.read(data, { type: 'array' });
            const sheet = workbook.Sheets[workbook.SheetNames[0]];
            const json: any[][] = XLSX.utils.sheet_to_json(sheet, { header: 1 });

            if (json.length < 2) throw new Error("Archivo vacío.");

            const groupedByProvince: Record<string, Partial<DespachoItem>[]> = {};

            for(let i = 1; i < json.length; i++) {
                const row = json[i];
                const prov = String(row[0] || 'SIN PROVINCIA').toUpperCase().trim();
                const code = String(row[1] || '').trim();
                if (!code) continue;

                const product = catalog.find(p => p.codigo === code || p.sku === code);
                
                if (!groupedByProvince[prov]) groupedByProvince[prov] = [];
                groupedByProvince[prov].push({
                    codigo: code,
                    descripcion: String(row[2] || product?.nombre || 'PRODUCTO').toUpperCase(),
                    cantidad_pedida: parseFloat(row[3]) || 0,
                    cantidad_despachada: 0,
                    peso_total: 0,
                    estado: 'PENDIENTE',
                    unidad_medida: product?.unidad_venta || 'UND',
                    cajas_estimadas: product ? (parseFloat(row[3]) / (product.unidades_por_caja || 1)) : 0,
                    tipo_camara: product?.zona_predeterminada || 'SECO',
                    producto_id: product?.id
                });
            }

            const newTempData = Object.keys(groupedByProvince).map(prov => ({
                header: { 
                    provincia: prov, 
                    total_items: groupedByProvince[prov].length, 
                    estado: 'PENDIENTE' as any,
                    tipo_despacho: 'PROVINCIA' as any
                },
                items: groupedByProvince[prov]
            }));

            setTempData(newTempData);
            setPestañaActiva('CARGA');
        } catch (err: any) {
            showAlert(err.message, "Error de Importación", "error");
        }
    };
    reader.readAsArrayBuffer(file);
  };

  const handleSearchProduct = (query: string) => {
    setSearchQuery(query);
    if (query.length < 2) {
      setSearchResults([]);
      return;
    }
    const results = catalog.filter(p => 
      p.codigo.toLowerCase().includes(query.toLowerCase()) || 
      p.nombre.toLowerCase().includes(query.toLowerCase()) ||
      (p.sku && p.sku.toLowerCase().includes(query.toLowerCase()))
    ).slice(0, 10);
    setSearchResults(results);
  };

  const handleAddProductToDispatch = async () => {
    if (!selectedProductToAdd || !addQty || !selectedHeaderId) return;
    
    setIsAddingProduct(true);
    try {
      const qty = parseFloat(addQty);
      if (isNaN(qty) || qty <= 0) throw new Error("Cantidad inválida");

      const newItem: Partial<DespachoItem> = {
        encabezado_id: selectedHeaderId,
        producto_id: selectedProductToAdd.id,
        codigo: selectedProductToAdd.codigo,
        descripcion: selectedProductToAdd.nombre,
        cantidad_pedida: qty,
        cantidad_despachada: 0,
        peso_total: 0,
        estado: 'PENDIENTE',
        unidad_medida: selectedProductToAdd.unidad_venta || 'UND',
        cajas_estimadas: qty / (selectedProductToAdd.unidades_por_caja || 1),
        tipo_camara: selectedProductToAdd.zona_predeterminada || 'SECO',
        sede_id: user?.sede_id
      };

      const { data, error } = await supabase
        .from('despachos_item')
        .insert([newItem])
        .select()
        .single();

      if (error) throw error;

      // Update header total_items in DB
      const currentHeader = headers.find(h => h.id === selectedHeaderId);
      if (currentHeader) {
        await supabase
          .from('despacho_encabezado')
          .update({ total_items: (currentHeader.total_items || 0) + 1 })
          .eq('id', selectedHeaderId);
      }

      setItemsDetalle(prev => [data, ...prev]);
      setShowAddProductModal(false);
      setSelectedProductToAdd(null);
      setAddQty('');
      setSearchQuery('');
      setSearchResults([]);
      
      // Update header totals
      fetchHeaders();
      
      setToast({ show: true, message: 'Producto agregado correctamente', type: 'success' });
      setTimeout(() => setToast({ show: false, message: '', type: 'success' }), 3000);
    } catch (err: any) {
      console.error(err);
      showAlert(err.message || "Error al agregar producto", "Error", "error");
    } finally {
      setIsAddingProduct(false);
    }
  };

  const guardarProvinciaEnDB = async (index: number) => {
      setIsProcessing(true);
      const group = tempData[index];
      try {
          const { data: hData, error: hError } = await supabase.from('despacho_encabezado').insert([{ 
              ...group.header,
              tipo_despacho: 'PROVINCIA',
              sede_id: user?.sede_id
          }]).select().single();
          if (hError) throw hError;

          const itemsConId = group.items.map(it => ({ 
              ...it, 
              encabezado_id: hData.id,
              sede_id: user?.sede_id
          }));
          await supabase.from('despachos_item').insert(itemsConId);

          setTempData(prev => prev.filter((_, i) => i !== index));
          fetchHeaders();
      } catch (err) {
          console.error(err);
          showAlert('Error al guardar.', "Error", "error");
      } finally {
          setIsProcessing(false);
      }
  };

  const finalizePicking = async (force: boolean = false, stayOpen: boolean = false) => {
      if (!activeItemPicking || !pickQty) return;

      // Validaciones obligatorias
      if (!pickDay || !pickMonth || !pickYear) {
          showAlert("La fecha de vencimiento es obligatoria", "Faltan Datos", "warning");
          return;
      }

      // Foto obligatoria para productos pesables (KGM)
      if (activeItemPicking.unidad_medida?.toUpperCase() === 'KGM' || activeItemPicking.unidad_medida?.toUpperCase() === 'KG') {
          if (pickPhotos.length === 0) {
              showAlert("La foto es obligatoria para productos pesables (KGM)", "Foto Requerida", "warning");
              return;
          }
      }

      // TVU Validation
      if (!force) {
          const product = catalog.find(p => p.codigo === activeItemPicking.codigo);
          if (product && product.vida_util_dias && pickDay && pickMonth && pickYear) {
              const expDate = new Date(parseInt(pickYear), parseInt(pickMonth) - 1, parseInt(pickDay));
              const today = new Date();
              today.setHours(0, 0, 0, 0);

              const remainingDays = Math.ceil((expDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
              const totalLifeDays = product.vida_util_dias;
              const percentage = (remainingDays / totalLifeDays) * 100;

              if (percentage < 70) {
                  let color: 'red' | 'orange' = 'orange';
                  if (percentage < 50) color = 'red';

                  setTvuWarning({
                      show: true,
                      percentage: Math.round(percentage),
                      color,
                      message: `El TVU del producto es de ${Math.round(percentage)}%`
                  });
                  return;
              }
          }
      }
      
      // Optimistic Update Data
      const isEditing = !!editingItemId;
      const itemId = editingItemId || activeItemPicking.id;
      const itemDesc = activeItemPicking.descripcion;
      const itemCodigo = activeItemPicking.codigo;
      const cant = parseFloat(pickQty);
      const paleta = paletaActivaNo;
      const finalExpDate = `${pickYear}-${pickMonth.padStart(2, '0')}-${pickDay.padStart(2, '0')}`;
      const photosToUpload = [...pickPhotos];
      const userName = user.nombre || user.username;

      // 1. Update local state immediately (Optimistic)
      if (isEditing) {
          setItemsDetalle(prev => prev.map(it => 
              it.id === itemId 
              ? { 
                  ...it, 
                  estado: 'COMPLETADO', 
                  cantidad_despachada: cant, 
                  numero_paleta: paleta, 
                  usuario_preparacion: userName, 
                  fecha_preparacion: new Date().toISOString(),
                  fecha_vencimiento: finalExpDate,
                  peso_bruto: parseFloat(pesoBruto) || 0,
                  nro_cajas_tinas: parseInt(nroCajasTinas) || 0,
                  tara_caja_unid: parseFloat(taraCajaUnid) || 0,
                  tara_pallet: parseFloat(taraPallet) || 0,
                  peso_neto: pesoNeto
                } as DespachoItem
              : it
          ));
      } else {
          // New record (pallet)
          const tempId = `temp-${Date.now()}`;
          const newItem: DespachoItem = {
              ...activeItemPicking,
              id: tempId,
              estado: 'COMPLETADO',
              cantidad_pedida: 0, // Extra pallets don't add to requested total
              cantidad_despachada: cant,
              numero_paleta: paleta,
              usuario_preparacion: userName,
              fecha_preparacion: new Date().toISOString(),
              fecha_vencimiento: finalExpDate,
              fotos: photosToUpload, // Temporary base64 for UI
              peso_bruto: parseFloat(pesoBruto) || 0,
              nro_cajas_tinas: parseInt(nroCajasTinas) || 0,
              tara_caja_unid: parseFloat(taraCajaUnid) || 0,
              tara_pallet: parseFloat(taraPallet) || 0,
              peso_neto: pesoNeto
          };
          setItemsDetalle(prev => [...prev, newItem]);
      }

      // 2. Handle modal state
      if (!stayOpen) {
          setActiveItemPicking(null);
          setEditingItemId(null);
          setPickQty('');
          setPickPhotos([]);
          setPickDay('');
          setPickMonth('');
          setPickYear('');
          setPesoBruto('');
          setNroCajasTinas('');
          setTaraCajaUnid('');
          setTaraPallet('');
          setPesoNeto(0);
      } else {
          // Prepare for next pallet
          setEditingItemId(null); // Next save will be an insert
          setPickQty('');
          setPickPhotos([]);
          setPesoBruto('');
          setNroCajasTinas('');
          setTaraCajaUnid('');
          setTaraPallet('');
          setPesoNeto(0);
          // Keep date if user wants to reuse it, or clear it. Let's keep it for speed.
          setPaletaActivaNo(prev => prev + 1);
          setShowSuccessMsg(true);
          setTimeout(() => setShowSuccessMsg(false), 2000);
          setToast({ show: true, message: 'Pallet guardado. Ingrese el siguiente.', type: 'success' });
          setTimeout(() => setToast({ show: false, message: '', type: 'success' }), 2000);
      }

      // 3. Background Processing
      (async () => {
          try {
              // Subir fotos al Storage y obtener URLs
              const photoUrls: string[] = [];
              
              for (let i = 0; i < photosToUpload.length; i++) {
                  const base64Data = photosToUpload[i];
                  if (base64Data.startsWith('http')) {
                      photoUrls.push(base64Data);
                      continue;
                  }
                  
                  const res = await fetch(base64Data);
                  const blob = await res.blob();
                  const file = new File([blob], `photo_${i}.jpg`, { type: 'image/jpeg' });
                  
                  const fileName = generateStorageFileName();
                  const filePath = `picking/${fileName}`;

                  try {
                      const compressedBlob = await compressImage(file, 1024, 0.6);
                      const { error: uploadError } = await supabase.storage
                          .from('evidencias')
                          .upload(filePath, compressedBlob, { 
                              contentType: 'image/jpeg',
                              upsert: true 
                          });

                      if (uploadError) {
                          console.error("DEBUG: Storage error in evidencias bucket:", uploadError);
                          throw new Error(`Error subiendo imagen: ${uploadError.message}`);
                      }

                      const { data: pubData } = supabase.storage
                          .from('evidencias')
                          .getPublicUrl(filePath);
                      
                      photoUrls.push(pubData.publicUrl);
                  } catch (compressErr: any) {
                      console.error("Error compressing/uploading image:", compressErr);
                      // Fallback to original blob if compression fails
                      const { error: uploadError } = await supabase.storage
                          .from('evidencias')
                          .upload(filePath, blob, { 
                              contentType: 'image/jpeg',
                              upsert: true
                          });

                      if (uploadError) throw new Error(`Error subiendo imagen: ${uploadError.message}`);

                      const { data: pubData } = supabase.storage
                          .from('evidencias')
                          .getPublicUrl(filePath);
                      
                      photoUrls.push(pubData.publicUrl);
                  }
              }

              const product = catalog.find(p => p.codigo === itemCodigo);
              // @ts-ignore
              const pesoUnitario = product?.peso_unitario || 0;
              const pesoCalculado = cant * pesoUnitario;

              // Actualizar Base de Datos
              if (isEditing) {
                  const { error } = await supabase
                      .from('despachos_item')
                      .update({
                          cantidad_despachada: cant,
                          peso_total: pesoCalculado,
                          numero_paleta: paleta,
                          estado: 'COMPLETADO',
                          fotos: photoUrls,
                          fecha_vencimiento: finalExpDate,
                          usuario_preparacion: userName,
                          fecha_preparacion: new Date().toISOString(),
                          peso_bruto: parseFloat(pesoBruto) || 0,
                          nro_cajas_tinas: parseInt(nroCajasTinas) || 0,
                          tara_caja_unid: parseFloat(taraCajaUnid) || 0,
                          tara_pallet: parseFloat(taraPallet) || 0,
                          peso_neto: pesoNeto
                      })
                      .eq('id', itemId);
                  
                  if (error) throw error;
              } else {
                  // Insert new record
                  const { data: insertedData, error } = await supabase
                      .from('despachos_item')
                      .insert([{
                          encabezado_id: activeItemPicking.encabezado_id,
                          producto_id: activeItemPicking.producto_id,
                          codigo: activeItemPicking.codigo,
                          descripcion: activeItemPicking.descripcion,
                          cantidad_pedida: 0,
                          cantidad_despachada: cant,
                          peso_total: pesoCalculado,
                          unidad_medida: activeItemPicking.unidad_medida,
                          tipo_camara: activeItemPicking.tipo_camara,
                          numero_paleta: paleta,
                          estado: 'COMPLETADO',
                          fotos: photoUrls,
                          fecha_vencimiento: finalExpDate,
                          usuario_preparacion: userName,
                          fecha_preparacion: new Date().toISOString(),
                          peso_bruto: parseFloat(pesoBruto) || 0,
                          nro_cajas_tinas: parseInt(nroCajasTinas) || 0,
                          tara_caja_unid: parseFloat(taraCajaUnid) || 0,
                          tara_pallet: parseFloat(taraPallet) || 0,
                          peso_neto: pesoNeto,
                          sede_id: user?.sede_id || activeItemPicking.sede_id
                      }])
                      .select()
                      .single();
                  
                  if (error) throw error;

                  // Replace temp item with real one
                  if (insertedData) {
                      setItemsDetalle(prev => prev.map(it => it.id.startsWith('temp-') && it.codigo === itemCodigo && it.numero_paleta === paleta ? insertedData : it));
                  }
              }

              // Refrescar encabezados para actualizar barras de progreso
              fetchHeaders();
          } catch (err: any) {
              console.error("Error en background finalizePicking:", err);
              setToast({ 
                  show: true, 
                  message: `Error al sincronizar: ${itemDesc}. Por favor reintente.`, 
                  type: 'error' 
              });
              setTimeout(() => setToast({ show: false, message: '', type: 'error' }), 5000);
              
              // Revertir estado local si falla (solo si era edición, si era nuevo simplemente se queda ahí o se quita)
              if (isEditing) {
                  // Fetch items again to be sure
                  if (selectedHeaderId) fetchItems(selectedHeaderId);
              }
          }
      })();
  };

  const handleClosePicking = () => {
    setActiveItemPicking(null);
    setEditingItemId(null);
    setPickQty('');
    setPickPhotos([]);
    setPickDay('');
    setPickMonth('');
    setPickYear('');
    setPesoBruto('');
    setNroCajasTinas('');
    setTaraCajaUnid('');
    setTaraPallet('');
    setPesoNeto(0);
  };

  const handleSavePicking = async (force: boolean = false) => {
    setIsSavingPicking(true);
    try {
      await finalizePicking(force, true);
    } catch (err: any) {
      console.error(err);
      showAlert(err.message || "Error al guardar picking", "Error", "error");
    } finally {
      setIsSavingPicking(false);
    }
  };

  return (
    <div className="flex flex-col h-full bg-slate-50 dark:bg-[#0f172a]">
        <div className="bg-white dark:bg-[#1e293b] border-b border-gray-200 dark:border-slate-700 flex shadow-sm z-10 no-print">
            <button onClick={() => setPestañaActiva('CARGA')} className={`flex-1 py-4 flex flex-col items-center justify-center text-[10px] font-black uppercase tracking-widest border-b-4 transition-all ${pestañaActiva === 'CARGA' ? 'border-[#009ED6] text-[#009ED6] bg-[#009ED6]/5' : 'border-transparent text-slate-400'}`}>
                <Upload className="w-4 h-4 mb-1"/><span>Consolidar Excel</span>
            </button>
            <button onClick={() => setPestañaActiva('PENDIENTES')} className={`flex-1 py-4 flex flex-col items-center justify-center text-[10px] font-black uppercase tracking-widest border-b-4 transition-all ${pestañaActiva === 'PENDIENTES' ? 'border-[#009ED6] text-[#009ED6] bg-[#009ED6]/5' : 'border-transparent text-slate-400'}`}>
                <Clock className="w-4 h-4 mb-1"/><span>Despachos Hoy</span>
            </button>
            <button onClick={() => setPestañaActiva('CONSOLIDADO')} className={`flex-1 py-4 flex flex-col items-center justify-center text-[10px] font-black uppercase tracking-widest border-b-4 transition-all ${pestañaActiva === 'CONSOLIDADO' ? 'border-[#009ED6] text-[#009ED6] bg-[#009ED6]/5' : 'border-transparent text-slate-400'}`}>
                <CheckCircle className="w-4 h-4 mb-1"/><span>Histórico</span>
            </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 md:p-6 custom-scrollbar">
            {isProcessing && (
                <div className="fixed inset-0 z-[300] bg-white/40 backdrop-blur-sm flex items-center justify-center">
                    <div className="bg-white p-6 rounded-3xl shadow-2xl flex flex-col items-center gap-4 border border-indigo-100 animate-fade-in">
                        <div className="w-10 h-10 border-4 border-[#009ED6] border-t-transparent rounded-full animate-spin"></div>
                        <p className="text-[10px] font-black uppercase text-[#009ED6] tracking-widest">Sincronizando...</p>
                    </div>
                </div>
            )}

            {toast.show && (
                <div className={`fixed bottom-10 left-1/2 -translate-x-1/2 z-[500] px-6 py-3 rounded-2xl shadow-2xl animate-bounce-in flex items-center gap-3 border ${toast.type === 'success' ? 'bg-emerald-600 border-emerald-500 text-white' : 'bg-red-600 border-red-500 text-white'}`}>
                    {toast.type === 'success' ? <CheckCircle className="w-5 h-5" /> : <XCircle className="w-5 h-5" />}
                    <span className="text-[10px] font-black uppercase tracking-widest">{toast.message}</span>
                </div>
            )}

            {pestañaActiva === 'PENDIENTES' && (
                <div className="max-w-6xl mx-auto space-y-6">
                    {!selectedHeaderId ? (
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 animate-fade-in">
                            {headers.filter(h => h.estado !== 'COMPLETADO').map(h => {
                                const skus_pct = h.total_items > 0 ? Math.round(((h.items_completados || 0) / h.total_items) * 100) : 0;
                                return (
                                    <div 
                                        key={h.id} 
                                        onClick={() => { setSelectedHeaderId(h.id); fetchItems(h.id); }} 
                                        className="bg-white dark:bg-[#1e293b] p-4 rounded-[2rem] border border-gray-100 dark:border-slate-700 shadow-lg hover:shadow-xl transition-all cursor-pointer group flex flex-col h-full overflow-hidden relative"
                                    >
                                        <div className="flex justify-between items-start mb-3">
                                            <div className="bg-[#009ED6]/10 p-2.5 rounded-xl text-[#009ED6] group-hover:bg-[#009ED6] group-hover:text-white transition-all duration-300 relative">
                                                <Truck className="w-5 h-5"/>
                                                {h.has_tvu_warning && (
                                                  <button 
                                                    onClick={(e) => {
                                                      e.stopPropagation();
                                                      handleShowTvuModal(h);
                                                    }}
                                                    className="absolute -top-2 -right-2 bg-red-600 text-white p-1 rounded-full shadow-lg animate-bell-shake border-2 border-white dark:border-slate-800 hover:scale-110 transition-transform z-10"
                                                  >
                                                    <Bell className="w-3 h-3" />
                                                  </button>
                                                )}
                                            </div>
                                            <div className="flex flex-col items-end gap-1">
                                                <div className="flex gap-1.5">
                                                    <button 
                                                        onClick={(e) => { e.stopPropagation(); verEstadisticasPicking(h); }}
                                                        className="p-1.5 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-400 hover:text-indigo-600 hover:shadow-md transition-all"
                                                        title="Estadísticas de Picking"
                                                    >
                                                        <BarChart3 className="w-3.5 h-3.5"/>
                                                    </button>
                                                    <button 
                                                        onClick={(e) => handleDownloadExcel(e, h)}
                                                        className="p-1.5 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-400 hover:text-[#009ED6] hover:shadow-md transition-all"
                                                        title="Descargar Excel de Carga"
                                                    >
                                                        <Printer className="w-3.5 h-3.5"/>
                                                    </button>
                                                    {(user?.rol === 'ADMIN' || user?.rol === 'ASISTENTE') && (
                                                        <button 
                                                            onClick={(e) => handleCancelHeader(e, h.id)}
                                                            className="p-1.5 bg-white dark:bg-slate-800 border border-red-200 dark:border-red-900 rounded-lg text-red-400 hover:text-red-600 hover:shadow-md transition-all"
                                                            title="Cancelar Despacho"
                                                        >
                                                            <XCircle className="w-3.5 h-3.5"/>
                                                        </button>
                                                    )}
                                                    <button 
                                                        onClick={(e) => handleFinalizeHeader(e, h.id)}
                                                        className={`px-2.5 py-1 text-white rounded-lg text-[7px] font-black uppercase tracking-widest shadow-lg transition-all ${skus_pct === 100 ? 'bg-[#82BD02] shadow-green-100' : 'bg-amber-500 shadow-amber-100'} hover:scale-105`}
                                                    >
                                                        Finalizar
                                                    </button>
                                                </div>
                                                <span className={`text-[7px] font-black uppercase px-2 py-0.5 rounded-full border ${skus_pct > 0 ? 'bg-indigo-50 text-indigo-600 border-indigo-100' : 'bg-amber-50 text-amber-600 border-amber-100'}`}>
                                                    {skus_pct === 100 ? 'Listo' : skus_pct > 0 ? 'En Carga' : 'Pendiente'}
                                                </span>
                                            </div>
                                        </div>

                                        <h3 className="font-black text-slate-800 dark:text-white text-lg uppercase tracking-tighter mb-3 group-hover:text-[#009ED6] transition-colors">{h.provincia}</h3>

                                        <div className="space-y-4 mb-4">
                                            <div className="flex justify-between items-center bg-slate-50 dark:bg-slate-800/50 p-3 rounded-2xl border border-slate-100 dark:border-slate-700">
                                                <div 
                                                    onClick={(e) => { 
                                                        e.stopPropagation(); 
                                                        handleOpenPreparedWeights(h); 
                                                    }}
                                                    className="text-left cursor-pointer hover:bg-indigo-50/60 dark:hover:bg-slate-800 p-1.5 rounded-xl transition-all border border-transparent hover:border-indigo-100 active:scale-95"
                                                    title="Ver productos preparados"
                                                >
                                                    <div className="text-[8px] font-black text-[#009ED6] uppercase tracking-widest mb-0.5 flex items-center gap-1">
                                                        <span>Kilos Pedidos / Preparados</span>
                                                        <Eye className="w-2.5 h-2.5" />
                                                    </div>
                                                    <div className="text-sm font-black text-slate-800 dark:text-white">
                                                        {Math.round(h.total_peso_pedido || 0).toLocaleString()} / {Math.round(h.total_peso_cargado || 0).toLocaleString()} <span className="text-[10px]">KG</span>
                                                    </div>
                                                </div>
                                                <div className="text-right">
                                                    <div className="text-[8px] font-black text-slate-400 uppercase tracking-widest mb-0.5">Estimación Pallets</div>
                                                    <div className="text-sm font-black text-[#009ED6]">
                                                        {h.total_pallets_estimados || 0} <span className="text-[10px]">PLT</span>
                                                    </div>
                                                </div>
                                            </div>
                                            <button 
                                                onClick={(e) => { e.stopPropagation(); setSelectedHeaderForCharts(h); setShowChartsModal(true); }}
                                                className="w-full py-2 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-[8px] font-black uppercase tracking-widest text-slate-500 hover:bg-slate-50 dark:hover:bg-slate-700 transition-all flex items-center justify-center gap-2"
                                            >
                                                <BarChart3 className="w-3 h-3" />
                                                Ver Gráficos Detallados
                                            </button>
                                        </div>

                                        <div className="absolute bottom-0 left-0 right-0 h-1 bg-gradient-to-r from-[#009ED6] to-[#82BD02] opacity-0 group-hover:opacity-100 transition-opacity" />
                                    </div>
                                );
                            })}
                        </div>
                    ) : (
                        <div className="animate-fade-in space-y-6">
                            <div className="flex justify-between items-center">
                                <div className="flex items-center gap-4">
                                    <button onClick={() => setSelectedHeaderId(null)} className="p-4 bg-white dark:bg-slate-800 rounded-3xl shadow-lg text-slate-400 hover:text-red-500 transition-all"><XCircle className="w-7 h-7"/></button>
                                    {(user?.rol === 'ADMIN' || user?.rol === 'ASISTENTE') && (
                                        <button 
                                            onClick={() => setShowAddProductModal(true)}
                                            className="p-4 bg-[#009ED6] text-white rounded-3xl shadow-lg hover:bg-blue-600 transition-all flex items-center gap-2"
                                            title="Agregar Producto Manualmente"
                                        >
                                            <Plus className="w-7 h-7"/>
                                            <span className="hidden md:inline font-black text-[10px] uppercase tracking-widest">Agregar</span>
                                        </button>
                                    )}
                                </div>
                                <div className="text-center flex items-center gap-4">
                                    <div>
                                        <h2 className="text-3xl font-black text-slate-800 dark:text-white uppercase tracking-tighter">{headers.find(h => h.id === selectedHeaderId)?.provincia}</h2>
                                        <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">Operación de Carga Activa</p>
                                    </div>
                                    {headers.find(h => h.id === selectedHeaderId)?.has_tvu_warning && (
                                        <button 
                                            onClick={() => setShowTvuHighlights(!showTvuHighlights)}
                                            className={`p-3 rounded-2xl shadow-lg transition-all animate-bell-shake ${showTvuHighlights ? 'bg-red-600 text-white' : 'bg-white dark:bg-slate-800 text-red-600 border border-red-100 dark:border-red-900'}`}
                                            title="Ver productos con TVU corto"
                                        >
                                            <Bell className="w-6 h-6" />
                                        </button>
                                    )}
                                </div>
                                <div className="bg-slate-800 p-4 rounded-3xl text-white flex items-center gap-4 shadow-xl">
                                    <span className="text-[10px] font-black uppercase tracking-widest">Paleta Actual:</span>
                                    <input type="number" className="w-14 bg-white/10 text-white font-black text-center p-1 rounded-xl outline-none" value={paletaActivaNo} onChange={e => setPaletaActivaNo(parseInt(e.target.value) || 1)}/>
                                </div>
                            </div>

                            {/* Filtros de Cámara */}
                            <div className="flex flex-wrap justify-center gap-2">
                                {(['TODOS', 'SECO', 'REFRIGERADO', 'CONGELADO'] as const).map(f => (
                                    <button
                                        key={f}
                                        onClick={() => setCamaraFilter(f)}
                                        className={`px-5 py-2.5 rounded-2xl text-[9px] font-black uppercase tracking-widest transition-all shadow-sm ${camaraFilter === f ? 'bg-[#009ED6] text-white shadow-[#009ED6]/20' : 'bg-white dark:bg-slate-800 text-slate-400 border border-slate-100 dark:border-slate-700'}`}
                                    >
                                        {f}
                                    </button>
                                ))}
                                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
                                {Object.values(itemsDetalle
                                    .filter(item => camaraFilter === 'TODOS' || item.tipo_camara?.toUpperCase() === camaraFilter)
                                    .reduce((acc, item) => {
                                        // Group by SKU and whether it's cancelled or not
                                        const key = `${item.codigo}_${item.estado === 'CANCELADO' ? 'CANCELADO' : 'ACTIVE'}`;
                                        if (!acc[key]) {
                                            acc[key] = { 
                                                ...item, 
                                                cantidad_pedida: item.cantidad_pedida || 0,
                                                cantidad_despachada: item.cantidad_despachada || 0,
                                                all_paletas: item.estado === 'COMPLETADO' ? [item.numero_paleta] : [],
                                                original_items: [item]
                                            };
                                        } else {
                                            acc[key].cantidad_pedida += (item.cantidad_pedida || 0);
                                            acc[key].cantidad_despachada += (item.cantidad_despachada || 0);
                                            if (item.estado === 'COMPLETADO') {
                                                acc[key].all_paletas.push(item.numero_paleta);
                                            }
                                            acc[key].original_items.push(item);
                                            // Prioritize PENDIENTE status and its ID for the consolidated card
                                            if (item.estado === 'PENDIENTE') {
                                                acc[key].estado = 'PENDIENTE';
                                                acc[key].id = item.id;
                                            }
                                        }
                                        return acc;
                                    }, {} as Record<string, any>))
                                    .sort((a, b) => {
                                        // Move CANCELADO items to the end
                                        if (a.estado === 'CANCELADO' && b.estado !== 'CANCELADO') return 1;
                                        if (a.estado !== 'CANCELADO' && b.estado === 'CANCELADO') return -1;
                                        return 0;
                                    })
                                    .map(item => {
                                        const product = catalog.find(p => p.codigo === item.codigo || p.sku === item.codigo);
                                        const rtu = product?.unidades_por_caja || 1;

                                        // TVU Check - use the most recent expiry date from completed items if available
                                        let isTvuCritical = false;
                                        const completedItems = item.original_items.filter((it: any) => it.estado === 'COMPLETADO' && it.fecha_vencimiento);
                                        if (completedItems.length > 0 && product?.vida_util_dias) {
                                            const today = new Date();
                                            today.setHours(0, 0, 0, 0);
                                            // Check if any of the completed items has critical TVU
                                            isTvuCritical = completedItems.some((it: any) => {
                                                const expDate = new Date(it.fecha_vencimiento);
                                                const remainingDays = Math.ceil((expDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
                                                const totalLifeDays = product.vida_util_dias;
                                                const percentage = (remainingDays / totalLifeDays) * 100;
                                                return percentage < 70;
                                            });
                                        }

                                        // Estilos dinámicos por cámara
                                        let camaraStyles = "bg-white dark:bg-[#1e293b] border-gray-100 dark:border-slate-700";
                                        if (item.estado === 'CANCELADO') {
                                            camaraStyles = "bg-red-50 dark:bg-red-900/20 border-red-300 dark:border-red-800 shadow-red-100/50";
                                        } else if (item.estado !== 'COMPLETADO') {
                                            switch(item.tipo_camara?.toUpperCase()) {
                                                case 'CONGELADO': camaraStyles = "bg-blue-50 dark:bg-blue-900/30 border-blue-200 dark:border-blue-800 shadow-blue-100/50"; break;
                                                case 'REFRIGERADO': camaraStyles = "bg-sky-50 dark:bg-sky-900/30 border-sky-200 dark:border-sky-800 shadow-sky-100/50"; break;
                                                case 'SECO': camaraStyles = "bg-orange-50 dark:bg-orange-900/30 border-orange-200 dark:border-orange-800 shadow-orange-100/50"; break;
                                            }
                                        } else {
                                            camaraStyles = "bg-emerald-100/50 dark:bg-emerald-500/20 border-emerald-400 dark:border-emerald-500 shadow-lg shadow-emerald-500/10";
                                        }

                                        const highlightStyle = showTvuHighlights && isTvuCritical ? "ring-4 ring-red-500 ring-offset-2 dark:ring-offset-slate-900 animate-pulse" : "";

                                        // Get the last person who prepared a pallet for this SKU
                                        const lastPreparedItem = [...item.original_items]
                                            .filter(it => it.estado === 'COMPLETADO')
                                            .sort((a, b) => new Date(b.fecha_preparacion || 0).getTime() - new Date(a.fecha_preparacion || 0).getTime())[0];

                                        return (
                                            <div 
                                                key={`${item.codigo}_${item.estado}`} 
                                                onClick={() => {
                                                    if (item.estado === 'CANCELADO') return;
                                                    
                                                    // Find the representative item for picking
                                                    // If there's a PENDIENTE one, use it. Otherwise use the first one.
                                                    const repItem = item.original_items.find((it: any) => it.estado === 'PENDIENTE') || item.original_items[0];
                                                    setActiveItemPicking(repItem);
                                                    const isAlreadyRegistered = repItem.estado === 'COMPLETADO';
                                                    
                                                    const product = catalog.find(p => p.codigo === repItem.codigo);
                                                    if (product?.usa_control_tara) {
                                                        setPesoBruto(repItem.peso_bruto?.toString() || '');
                                                        setNroCajasTinas(repItem.nro_cajas_tinas?.toString() || '');
                                                        setTaraCajaUnid(repItem.tara_caja_unid?.toString() || product.peso_tara_caja_std?.toString() || '0');
                                                        setTaraPallet(repItem.tara_pallet?.toString() || product.peso_tara_pallet_std?.toString() || '0');
                                                    } else {
                                                        setPesoBruto('');
                                                        setNroCajasTinas('');
                                                        setTaraCajaUnid('');
                                                        setTaraPallet('');
                                                    }

                                                    if (isAlreadyRegistered) {
                                                        setEditingItemId(null);
                                                        setPickQty('');
                                                        setPickPhotos([]);
                                                    } else {
                                                        setEditingItemId(repItem.id);
                                                        setPickQty(repItem.cantidad_despachada?.toString() || '');
                                                        setPickPhotos(repItem.fotos || []);
                                                    }

                                                    if(repItem.fecha_vencimiento) {
                                                        const d = new Date(repItem.fecha_vencimiento);
                                                        setPickDay(d.getUTCDate().toString().padStart(2, '0'));
                                                        setPickMonth((d.getUTCMonth()+1).toString().padStart(2, '0'));
                                                        setPickYear(d.getUTCFullYear().toString());
                                                    } else {
                                                        setPickDay('');
                                                        setPickMonth('');
                                                        setPickYear('');
                                                    }
                                                    const nextPalletNo = itemsDetalle
                                                        .filter(it => it.codigo === item.codigo && it.estado === 'COMPLETADO')
                                                        .reduce((max, it) => Math.max(max, it.numero_paleta || 0), 0) + 1;
                                                    setPaletaActivaNo(nextPalletNo);
                                                }}
                                                className={`p-3 rounded-[2rem] border transition-all cursor-pointer group relative overflow-hidden ${camaraStyles} ${highlightStyle} hover:shadow-xl hover:-translate-y-1`}
                                            >
                                                <div className="flex justify-between items-start mb-2">
                                                    <div className="bg-white/50 dark:bg-slate-800/50 p-2 rounded-xl text-slate-400 group-hover:text-[#009ED6] transition-colors shadow-sm"><Box className="w-4 h-4"/></div>
                                                    <div className="flex items-center gap-2">
                                                        {item.estado === 'CANCELADO' ? (
                                                            <div className="flex items-center gap-1">
                                                                <XCircle className="w-6 h-6 text-red-600" />
                                                            </div>
                                                        ) : (
                                                            <>
                                                                {(user?.rol === 'ADMIN' || user?.rol === 'ASISTENTE') && (
                                                                    <button 
                                                                        onClick={(e) => {
                                                                            e.stopPropagation();
                                                                            handleCancelItem(e, item);
                                                                        }}
                                                                        className="p-1.5 bg-red-50 text-red-500 rounded-lg hover:bg-red-500 hover:text-white transition-all shadow-sm border border-red-100"
                                                                        title="Cancelar Producto"
                                                                    >
                                                                        <X className="w-3.5 h-3.5" />
                                                                    </button>
                                                                )}
                                                                {isTvuCritical && <Bell className="w-5 h-5 text-red-600 animate-bell-shake" />}
                                                                {item.estado === 'COMPLETADO' ? (
                                                                    <CheckCircle className="w-6 h-6 text-emerald-500" />
                                                                ) : (
                                                                    <div className={`px-2.5 py-1 rounded-lg border font-black text-[10px] shadow-sm ${
                                                                        item.tipo_camara?.toUpperCase() === 'CONGELADO' ? 'bg-blue-500 text-white border-blue-400' :
                                                                        item.tipo_camara?.toUpperCase() === 'REFRIGERADO' ? 'bg-sky-500 text-white border-sky-400' :
                                                                        item.tipo_camara?.toUpperCase() === 'SECO' ? 'bg-orange-500 text-white border-orange-400' :
                                                                        'bg-emerald-50 text-emerald-600 border-emerald-100'
                                                                    }`}>
                                                                        RTU: {rtu}
                                                                    </div>
                                                                )}
                                                            </>
                                                        )}
                                                    </div>
                                                </div>
                                                <h4 className="font-black text-slate-800 dark:text-white text-[11px] uppercase mb-0.5 truncate leading-tight">{item.descripcion}</h4>
                                                <div className="text-xs font-black text-slate-500 dark:text-slate-400 mb-2 font-mono tracking-wider">{item.codigo}</div>
                                                
                                                {lastPreparedItem && item.estado !== 'CANCELADO' && (
                                                    <div className="mb-2 px-2 py-1 bg-emerald-500/10 rounded-lg border border-emerald-500/20">
                                                        <div className="text-[6px] font-black text-emerald-600 uppercase">Preparado por:</div>
                                                        <div className="text-[8px] font-bold text-emerald-700 truncate">{lastPreparedItem.usuario_preparacion}</div>
                                                        <div className="text-[7px] text-emerald-600/70 font-mono">
                                                            {lastPreparedItem.fecha_preparacion ? new Date(lastPreparedItem.fecha_preparacion).toLocaleString('es-PE', { hour12: false }) : ''}
                                                        </div>
                                                    </div>
                                                )}

                                                {item.estado === 'CANCELADO' && (
                                                    <div className="mb-2 px-2 py-1 bg-red-500/10 rounded-lg border border-red-500/20">
                                                        <div className="text-[6px] font-black text-red-600 uppercase">Cancelado por: {item.usuario_cancelacion}</div>
                                                        <div className="text-[8px] font-bold text-red-700 leading-tight mt-0.5 italic">"{item.motivo_cancelacion}"</div>
                                                        <div className="text-[7px] text-red-600/70 font-mono mt-0.5">
                                                            {item.fecha_cancelacion ? new Date(item.fecha_cancelacion).toLocaleString('es-PE', { hour12: false }) : ''}
                                                        </div>
                                                    </div>
                                                )}

                                                <div className="flex justify-between items-end border-t dark:border-slate-800/50 pt-2">
                                                    <div>
                                                        <div className="text-[7px] font-black text-slate-400 uppercase tracking-widest">Pedido</div>
                                                        <div className="text-xs font-black text-slate-800 dark:text-slate-200">{item.cantidad_pedida}</div>
                                                    </div>
                                                    {item.cantidad_despachada > 0 && (
                                                        <div className={`text-right ${item.cantidad_despachada <= item.cantidad_pedida * 0.8 ? 'animate-blink' : ''}`}>
                                                            <div className="text-[7px] font-black text-emerald-600 uppercase tracking-widest">
                                                                {item.all_paletas.length > 1 ? `En ${item.all_paletas.length} PLTs` : `En PLT #${item.all_paletas[0]}`}
                                                            </div>
                                                            <div className="text-xs font-black text-emerald-700">{item.cantidad_despachada}</div>
                                                        </div>
                                                    )}
                                                </div>
                                                {item.estado !== 'COMPLETADO' && (
                                                    <div className={`absolute bottom-0 left-0 right-0 h-1 opacity-0 group-hover:opacity-100 transition-opacity ${
                                                        item.tipo_camara?.toUpperCase() === 'CONGELADO' ? 'bg-blue-500' :
                                                        item.tipo_camara?.toUpperCase() === 'REFRIGERADO' ? 'bg-sky-500' :
                                                        item.tipo_camara?.toUpperCase() === 'SECO' ? 'bg-orange-500' :
                                                        'bg-[#009ED6]'
                                                    }`} />
                                                )}
                                            </div>
                                        );
                                    })}
                            </div>                         </div>
                        </div>
                    )}
                </div>
            )}

            {pestañaActiva === 'CARGA' && (
                <div className="max-w-4xl mx-auto space-y-6 pt-6 animate-fade-in text-center px-4">
                    <div className="bg-white dark:bg-[#1e293b] p-8 md:p-12 rounded-[3rem] md:rounded-[4rem] shadow-2xl border border-gray-100 dark:border-slate-700">
                        <div className="bg-[#009ED6]/10 w-20 h-20 md:w-24 md:h-24 rounded-[2rem] md:rounded-[2.5rem] flex items-center justify-center mx-auto mb-6 md:mb-8 text-[#009ED6] shadow-inner">
                            <FileSpreadsheet className="w-10 h-10 md:w-12 md:h-12" />
                        </div>
                        <h2 className="text-3xl md:text-4xl font-black text-slate-800 dark:text-white uppercase tracking-tighter mb-4">Importar Despachos Provincia</h2>
                        <p className="text-slate-400 text-[10px] md:text-xs font-bold uppercase tracking-widest mb-10 max-w-sm mx-auto">Carga el consolidado para segmentación geográfica</p>
                        
                        <div className="flex justify-center">
                            {/* Provincia Option */}
                            <label className="w-full max-w-md bg-white dark:bg-slate-800 border-2 border-slate-100 dark:border-slate-700 p-6 md:p-8 rounded-[2.5rem] hover:border-[#009ED6] hover:shadow-xl transition-all cursor-pointer group">
                                <div className="w-12 h-12 bg-blue-50 dark:bg-blue-900/20 rounded-2xl flex items-center justify-center mx-auto mb-4 text-[#009ED6] group-hover:scale-110 transition-transform">
                                    <MapPin className="w-6 h-6" />
                                </div>
                                <h3 className="text-sm font-black text-slate-800 dark:text-white uppercase mb-2 text-center">Despacho Provincia</h3>
                                <p className="text-[9px] text-slate-400 font-bold uppercase mb-6 leading-relaxed text-center">Formato estándar de consolidado para segmentación geográfica</p>
                                <div className="bg-[#009ED6] text-white py-3 px-6 rounded-2xl font-black text-[10px] uppercase tracking-widest shadow-lg shadow-blue-500/20 text-center">
                                    Seleccionar Excel
                                </div>
                                <input type="file" accept=".xlsx" className="hidden" onChange={handleImportExcel} />
                            </label>
                        </div>

                        <div className="mt-12 pt-8 border-t border-slate-50 dark:border-slate-800 flex justify-center">
                            <button 
                                onClick={handleDownloadSample}
                                className="text-[#009ED6] font-black text-[10px] uppercase tracking-widest hover:underline flex items-center justify-center gap-2"
                            >
                                <FileSpreadsheet className="w-4 h-4" /> Plantilla Provincia
                            </button>
                        </div>
                    </div>

                    {tempData.length > 0 && (
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-10">
                            {tempData.map((group, idx) => (
                                <div key={idx} className="bg-white dark:bg-[#1e293b] p-8 rounded-[3rem] border border-gray-100 flex items-center justify-between shadow-lg">
                                    <div className="text-left">
                                        <h4 className="font-black text-slate-800 dark:text-white uppercase text-xl">{group.header.provincia}</h4>
                                        <p className="text-[10px] text-slate-400 font-bold uppercase mt-1 tracking-widest">{group.header.total_items} SKUs Detectados</p>
                                    </div>
                                    <button onClick={() => guardarProvinciaEnDB(idx)} className="bg-[#82BD02] text-white px-6 py-3 rounded-2xl font-black text-xs uppercase shadow-xl shadow-[#82BD02]/20 hover:scale-105 active:scale-95 transition-all">Sincronizar</button>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            )}

            {pestañaActiva === 'CONSOLIDADO' && (
                <div className="max-w-5xl mx-auto space-y-6 animate-fade-in">
                    <div className="flex justify-between items-center px-4">
                        <h2 className="text-4xl font-black text-slate-800 dark:text-white uppercase tracking-tighter">Histórico</h2>
                        <button 
                            onClick={handleDownloadAllHistory}
                            className="bg-emerald-600 text-white px-8 py-4 rounded-2xl font-black text-[10px] uppercase shadow-xl flex items-center gap-3 hover:scale-105 transition-all active:scale-95"
                        >
                            <FileSpreadsheet className="w-5 h-5"/> Reporte General
                        </button>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                        {headers.filter(h => h.estado === 'COMPLETADO').map(h => {
                            return (
                                <div 
                                    key={h.id} 
                                    onClick={() => handleViewHistoryDetail(h)}
                                    className="bg-white dark:bg-[#1e293b] p-4 rounded-[2rem] border border-gray-100 dark:border-slate-700 shadow-lg hover:shadow-xl transition-all cursor-pointer group flex flex-col h-full overflow-hidden relative"
                                >
                                    <div className="flex justify-between items-start mb-3">
                                        <div className="bg-emerald-50 text-emerald-600 p-2.5 rounded-xl group-hover:bg-emerald-600 group-hover:text-white transition-all duration-300 relative">
                                            <Truck className="w-5 h-5"/>
                                            {h.has_tvu_warning && (
                                                <div className="absolute -top-2 -right-2 bg-red-600 text-white p-1 rounded-full shadow-lg animate-bell-shake border-2 border-white dark:border-slate-800">
                                                    <Bell className="w-3 h-3" />
                                                </div>
                                            )}
                                        </div>
                                        <div className="flex flex-col items-end gap-1">
                                            <div className="flex gap-1.5">
                                                <button 
                                                    onClick={(e) => { e.stopPropagation(); verEstadisticasPicking(h); }}
                                                    className="p-1.5 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-400 hover:text-indigo-600 hover:shadow-md transition-all"
                                                    title="Estadísticas de Picking"
                                                >
                                                    <BarChart3 className="w-3.5 h-3.5"/>
                                                </button>
                                                <button 
                                                    onClick={(e) => { e.stopPropagation(); handleViewHistoryDetail(h); }}
                                                    className="p-1.5 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-400 hover:text-[#009ED6] hover:shadow-md transition-all"
                                                    title="Ver Detalle"
                                                >
                                                    <Eye className="w-3.5 h-3.5"/>
                                                </button>
                                                <button 
                                                    onClick={(e) => handleDownloadExcel(e, h)}
                                                    className="p-1.5 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-400 hover:text-emerald-600 hover:shadow-md transition-all"
                                                    title="Descargar Excel"
                                                >
                                                    <Printer className="w-3.5 h-3.5"/>
                                                </button>
                                                <button 
                                                    onClick={(e) => { e.stopPropagation(); setHeaderToDelete(h); setShowDeleteHistoryConfirm(true); }}
                                                    className="p-1.5 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-400 hover:text-red-600 hover:shadow-md transition-all"
                                                    title="Eliminar del Historial"
                                                >
                                                    <Trash2 className="w-3.5 h-3.5"/>
                                                </button>
                                            </div>
                                            <span className="text-[7px] font-black uppercase px-2 py-0.5 rounded-full border bg-emerald-50 text-emerald-600 border-emerald-100">
                                                Cerrado: {new Date(h.fecha_despacho || '').toLocaleDateString()}
                                            </span>
                                        </div>
                                    </div>

                                    <h3 className="font-black text-slate-800 dark:text-white text-lg uppercase tracking-tighter mb-3 group-hover:text-emerald-600 transition-colors">{h.provincia}</h3>

                                    <div className="space-y-4 mb-4">
                                        <div className="flex justify-between items-center bg-slate-50 dark:bg-slate-800/50 p-3 rounded-2xl border border-slate-100 dark:border-slate-700">
                                            <div 
                                                onClick={(e) => { 
                                                    e.stopPropagation(); 
                                                    handleOpenPreparedWeights(h); 
                                                }}
                                                className="text-left cursor-pointer hover:bg-emerald-50/60 dark:hover:bg-slate-800 p-1.5 rounded-xl transition-all border border-transparent hover:border-emerald-100 active:scale-95"
                                                title="Ver productos preparados"
                                            >
                                                <div className="text-[8px] font-black text-emerald-600 uppercase tracking-widest mb-0.5 flex items-center gap-1">
                                                    <span>Kilos Pedidos / Preparados</span>
                                                    <Eye className="w-2.5 h-2.5" />
                                                </div>
                                                <div className="text-sm font-black text-slate-800 dark:text-white">
                                                    {Math.round(h.total_peso_pedido || 0).toLocaleString()} / {Math.round(h.total_peso_cargado || 0).toLocaleString()} <span className="text-[10px]">KG</span>
                                                </div>
                                            </div>
                                            <div className="text-right">
                                                <div className="text-[8px] font-black text-slate-400 uppercase tracking-widest mb-0.5">Estimación Pallets</div>
                                                <div className="text-sm font-black text-emerald-600">
                                                    {h.total_pallets_estimados || 0} <span className="text-[10px]">PLT</span>
                                                </div>
                                            </div>
                                        </div>
                                        <button 
                                            onClick={(e) => { e.stopPropagation(); setSelectedHeaderForCharts(h); setShowChartsModal(true); }}
                                            className="w-full py-2 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-[8px] font-black uppercase tracking-widest text-slate-500 hover:bg-slate-50 dark:hover:bg-slate-700 transition-all flex items-center justify-center gap-2"
                                        >
                                            <BarChart3 className="w-3 h-3" />
                                            Ver Gráficos Detallados
                                        </button>
                                    </div>

                                    <div className="absolute bottom-0 left-0 right-0 h-1 bg-gradient-to-r from-emerald-500 to-emerald-700 opacity-0 group-hover:opacity-100 transition-opacity" />
                                </div>
                            );
                        })}
                    </div>
                </div>
            )}
        </div>

        {despachoModo === 'PROVINCIA' && (
            <>
            {showHistoryDetail && selectedHistoryHeader && (
            <div className="fixed inset-0 z-[500] bg-slate-900/90 backdrop-blur-md flex items-center justify-center animate-fade-in p-0 md:p-6">
                <div className="bg-white dark:bg-[#1e293b] w-full h-full md:max-w-6xl md:h-[90vh] md:rounded-3xl md:shadow-2xl flex flex-col overflow-hidden">
                    <div className="p-6 md:p-8 border-b dark:border-slate-800 flex justify-between items-center bg-slate-50/50 dark:bg-slate-800/50">
                        <div className="flex items-center gap-4">
                            <div>
                                <h3 className="text-2xl md:text-3xl font-black text-slate-800 dark:text-white uppercase tracking-tighter">Detalle de Despacho: {selectedHistoryHeader.provincia}</h3>
                                <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest mt-1">Cerrado el {new Date(selectedHistoryHeader.fecha_despacho || '').toLocaleString()}</p>
                            </div>
                            {selectedHistoryHeader.has_tvu_warning && (
                                <button 
                                    onClick={() => setShowTvuHighlights(!showTvuHighlights)}
                                    className={`p-3 rounded-2xl shadow-lg transition-all animate-bell-shake ${showTvuHighlights ? 'bg-red-600 text-white' : 'bg-white dark:bg-slate-800 text-red-600 border border-red-100 dark:border-red-900'}`}
                                    title="Ver productos con TVU corto"
                                >
                                    <Bell className="w-6 h-6" />
                                </button>
                            )}
                        </div>
                        <div className="flex gap-2 md:gap-3">
                            <button 
                                onClick={() => generateHistoryPDF()}
                                className="bg-red-600 text-white px-4 md:px-6 py-2 md:py-3 rounded-xl md:rounded-2xl font-black text-[8px] md:text-[10px] uppercase shadow-lg shadow-red-200 flex items-center gap-2 hover:scale-105 transition-all"
                            >
                                <Printer className="w-4 h-4"/> <span className="hidden sm:inline">Exportar PDF</span>
                            </button>
                            <button 
                                onClick={(e) => handleDownloadExcel(e, selectedHistoryHeader)}
                                className="bg-emerald-600 text-white px-4 md:px-6 py-2 md:py-3 rounded-xl md:rounded-2xl font-black text-[8px] md:text-[10px] uppercase shadow-lg shadow-emerald-200 flex items-center gap-2 hover:scale-105 transition-all"
                            >
                                <FileSpreadsheet className="w-4 h-4"/> <span className="hidden sm:inline">Exportar Excel</span>
                            </button>
                            <button 
                                onClick={() => setShowHistoryDetail(false)}
                                className="p-2 md:p-3 bg-white dark:bg-slate-700 rounded-xl md:rounded-2xl text-slate-400 hover:text-red-500 transition-all shadow-md"
                            >
                                <X className="w-6 h-6"/>
                            </button>
                        </div>
                    </div>

                    <div className="flex-1 overflow-auto p-4 md:p-8 custom-scrollbar">
                        <div className="min-w-[800px]">
                            <table className="w-full text-left border-collapse">
                                <thead>
                                    <tr className="border-b-2 dark:border-slate-700">
                                        <th className="py-4 px-2 text-[10px] font-black text-slate-400 uppercase tracking-widest">PLT</th>
                                        <th className="py-4 px-2 text-[10px] font-black text-slate-400 uppercase tracking-widest">Código</th>
                                        <th className="py-4 px-2 text-[10px] font-black text-slate-400 uppercase tracking-widest">Descripción</th>
                                        <th className="py-4 px-2 text-[10px] font-black text-slate-400 uppercase tracking-widest">Pedido</th>
                                        <th className="py-4 px-2 text-[10px] font-black text-slate-400 uppercase tracking-widest">Cargado</th>
                                        <th className="py-4 px-2 text-[10px] font-black text-slate-400 uppercase tracking-widest">UM</th>
                                        <th className="py-4 px-2 text-[10px] font-black text-slate-400 uppercase tracking-widest">Vencimiento</th>
                                        <th className="py-4 px-2 text-[10px] font-black text-slate-400 uppercase tracking-widest">Operador</th>
                                        <th className="py-4 px-2 text-[10px] font-black text-slate-400 uppercase tracking-widest">Fotos</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {historyItems.map((it) => {
                                        const product = catalog.find(p => p.codigo === it.codigo);
                                        let isTvuCritical = false;
                                        if (it.estado === 'COMPLETADO' && it.fecha_vencimiento && product?.vida_util_dias) {
                                            const today = new Date();
                                            today.setHours(0, 0, 0, 0);
                                            const expDate = new Date(it.fecha_vencimiento);
                                            const remainingDays = Math.ceil((expDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
                                            const totalLifeDays = product.vida_util_dias;
                                            const percentage = (remainingDays / totalLifeDays) * 100;
                                            if (percentage < 70) isTvuCritical = true;
                                        }

                                        return (
                                            <tr key={it.id} className={`border-b dark:border-slate-800 transition-colors ${showTvuHighlights && isTvuCritical ? 'bg-red-50 dark:bg-red-900/30' : 'hover:bg-slate-50 dark:hover:bg-slate-800/50'}`}>
                                                <td className="py-4 px-2 font-black text-slate-800 dark:text-slate-200 text-xs">
                                                    <div className="flex items-center gap-2">
                                                        #{it.numero_paleta || 'S/P'}
                                                        {isTvuCritical && <Bell className="w-3 h-3 text-red-600 animate-bell-shake" />}
                                                    </div>
                                                </td>
                                                <td className="py-4 px-2 font-mono text-slate-500 text-[10px]">{it.codigo}</td>
                                                <td className="py-4 px-2 font-bold text-slate-700 dark:text-slate-300 text-[11px] uppercase">{it.descripcion}</td>
                                                <td className="py-4 px-2 font-black text-slate-400 text-xs">{it.cantidad_pedida}</td>
                                                <td className="py-4 px-2 font-black text-emerald-600 text-xs">{it.cantidad_despachada}</td>
                                                <td className="py-4 px-2 font-bold text-slate-500 text-[10px]">{it.unidad_medida}</td>
                                                <td className={`py-4 px-2 font-mono text-[10px] ${isTvuCritical ? 'text-red-600 font-black' : 'text-slate-500'}`}>{it.fecha_vencimiento || '-'}</td>
                                                <td className="py-4 px-2 font-bold text-slate-600 dark:text-slate-400 text-[10px]">{it.usuario_preparacion || '-'}</td>
                                                <td className="py-4 px-2">
                                                    <div className="flex gap-1">
                                                        {it.fotos?.map((f, i) => (
                                                            <img 
                                                                key={i} 
                                                                src={f} 
                                                                alt="Evidencia" 
                                                                onClick={() => setMaximizedGallery({ photos: it.fotos!, index: i })}
                                                                className="w-10 h-10 rounded-lg object-cover border border-slate-200 dark:border-slate-700 shadow-sm hover:scale-125 transition-transform cursor-zoom-in"
                                                                referrerPolicy="no-referrer"
                                                            />
                                                        ))}
                                                    </div>
                                                </td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>
            </div>
        )}

        {/* Picking Modal - Mobile View on Desktop */}
        {activeItemPicking && (
            <div className="fixed inset-0 z-[400] bg-slate-900/80 backdrop-blur-sm flex items-center justify-center animate-fade-in font-sans p-0 md:p-6">
                    <div className="bg-slate-50 dark:bg-slate-950 w-full h-full md:max-w-[450px] md:h-[90vh] md:rounded-[2.5rem] md:shadow-2xl flex flex-col overflow-hidden relative md:border-[8px] md:border-[#009ED6] dark:md:border-[#009ED6]">
                        {/* Modal Header - Enhanced Visibility */}
                        <div className="bg-[#009ED6] text-white px-5 py-3 relative shadow-md border-b border-[#0088B8]">
                            <div className="flex items-center justify-between pr-12">
                                <div className="flex-1 min-w-0">
                                    <div className="flex items-center gap-2 mb-1">
                                        <span className="bg-white text-[#009ED6] text-[9px] font-bold px-1.5 py-0.5 rounded uppercase tracking-widest">Picking</span>
                                        <span className="text-white/70 text-[9px] font-bold uppercase tracking-widest truncate">ID: {activeItemPicking.id.slice(0,8)}</span>
                                    </div>
                                    <h2 className="text-sm md:text-base font-black uppercase leading-tight tracking-tight">
                                        {activeItemPicking.descripcion}
                                    </h2>
                                    <div className="flex items-center gap-3 mt-2">
                                        <p className="text-white text-[13px] font-black tracking-widest bg-white/10 px-2 py-0.5 rounded-lg border border-white/20">{activeItemPicking.codigo}</p>
                                        <div className="h-4 w-px bg-white/30"></div>
                                        <span className="text-[12px] font-black uppercase text-white/80 tracking-tight">UM: <span className="text-white bg-white/20 px-1.5 py-0.5 rounded ml-1">
                                            {catalog.find(p => p.sku === activeItemPicking.codigo || p.codigo === activeItemPicking.codigo)?.unidad_medida_sap || activeItemPicking.unidad_medida || 'UND'}
                                        </span></span>
                                    </div>
                                </div>

                                <div className="bg-white/20 border border-white/30 px-3 py-1.5 rounded-2xl flex flex-col items-center justify-center ml-3 shrink-0 min-w-[65px] shadow-inner">
                                    <div className="flex items-center gap-1.5 mb-0.5">
                                        <Box className="w-4 h-4 text-yellow-300" />
                                        <span className="text-sm font-black text-white leading-none">
                                            {catalog.find(p => p.codigo === activeItemPicking.codigo)?.unidades_por_caja || 1}
                                        </span>
                                    </div>
                                    <span className="text-[9px] font-black text-white uppercase tracking-tighter">UNID/CAJA</span>
                                </div>
                            </div>
                            
                            <button 
                                onClick={handleClosePicking}
                                className="absolute top-3 right-3 w-9 h-9 bg-white/20 hover:bg-red-500 text-white rounded-xl flex items-center justify-center transition-all active:scale-90 z-10 border border-white/30"
                            >
                                <X className="w-5 h-5" />
                            </button>
                        </div>

                <div className="flex-1 overflow-y-auto custom-scrollbar bg-slate-50 dark:bg-slate-950">
                        <div className="p-4 space-y-4">
                            {/* Success Message Overlay */}
                            {showSuccessMsg && (
                                <div className="fixed inset-x-4 top-20 z-[500] animate-scale-in flex justify-center">
                                    <div className="bg-emerald-500 text-white py-2 px-4 rounded-xl shadow-xl flex items-center gap-2 border border-white/20 backdrop-blur-sm">
                                        <CheckCircle className="w-4 h-4" />
                                        <span className="text-[10px] font-black uppercase tracking-widest">¡REGISTRO EXITOSO!</span>
                                    </div>
                                </div>
                            )}

                            {/* Section 1: Summary Stats - Larger Cards */}
                            <div className="grid grid-cols-3 gap-3">
                                {(() => {
                                    const totalPedida = itemsDetalle
                                        .filter(it => it.codigo === activeItemPicking.codigo)
                                        .reduce((sum, it) => sum + (it.cantidad_pedida || 0), 0);
                                    const totalPreparada = itemsDetalle
                                        .filter(it => it.codigo === activeItemPicking.codigo && it.estado === 'COMPLETADO')
                                        .reduce((sum, it) => sum + (it.cantidad_despachada || 0), 0);
                                    const porcentaje = totalPedida > 0 ? Math.round((totalPreparada / totalPedida) * 100) : 0;

                                    return (
                                        <>
                                            <div className="bg-white dark:bg-slate-900 rounded-xl p-3 shadow-sm border border-slate-200 dark:border-slate-800 text-center relative overflow-hidden">
                                                <div className="absolute top-0 left-0 w-full h-1 bg-[#009ED6]"></div>
                                                <p className="text-[9px] font-bold text-slate-400 uppercase mb-1 tracking-widest">Pedido</p>
                                                <p className="text-lg font-black text-slate-900 dark:text-white leading-none">{totalPedida}</p>
                                            </div>
                                            <div className="bg-white dark:bg-slate-900 rounded-xl p-3 shadow-sm border border-slate-200 dark:border-slate-800 text-center relative overflow-hidden">
                                                <div className="absolute top-0 left-0 w-full h-1 bg-emerald-500"></div>
                                                <p className="text-[9px] font-bold text-slate-400 uppercase mb-1 tracking-widest">Preparado</p>
                                                <p className="text-lg font-black text-emerald-600 leading-none">{totalPreparada}</p>
                                            </div>
                                            <div className="bg-white dark:bg-slate-900 rounded-xl p-3 shadow-sm border border-slate-200 dark:border-slate-800 text-center relative overflow-hidden">
                                                <div className="absolute top-0 left-0 w-full h-1 bg-amber-500"></div>
                                                <p className="text-[9px] font-bold text-slate-400 uppercase mb-1 tracking-widest">Avance</p>
                                                <p className="text-lg font-black text-slate-900 dark:text-white leading-none">{porcentaje}%</p>
                                            </div>
                                        </>
                                    );
                                })()}
                            </div>

                        {/* Main Input Box - Grouped Sections (Cantidad, Vencimiento, Fotos) */}
                        <div className="bg-white dark:bg-slate-900 rounded-2xl p-5 shadow-xl border border-slate-200 dark:border-slate-800 space-y-6">
                            {/* Section 2: Weight Calculator - Only if usa_control_tara is true */}
                            {(() => {
                                const product = catalog.find(p => p.codigo === activeItemPicking.codigo);
                                if (!product?.usa_control_tara) return null;

                                return (
                                    <div className="space-y-4 pb-6 border-b border-slate-100 dark:border-slate-800">
                                        <div className="flex justify-between items-center">
                                            <h3 className="text-[10px] font-bold text-slate-900 dark:text-white uppercase tracking-widest">Control de Peso</h3>
                                            <div className="flex items-center gap-1.5">
                                                <Scale className="w-3.5 h-3.5 text-[#009ED6]" />
                                                <span className="text-[9px] font-bold text-[#009ED6] uppercase">Calculadora</span>
                                            </div>
                                        </div>

                                        <div className="grid grid-cols-2 gap-4">
                                            <div className="space-y-2">
                                                <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Peso Bruto (Kg)</label>
                                                <input 
                                                    type="number" 
                                                    className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl py-3 px-4 text-base font-black text-slate-900 dark:text-white outline-none focus:border-[#009ED6] transition-all" 
                                                    value={pesoBruto} 
                                                    onChange={e => setPesoBruto(e.target.value)}
                                                    placeholder="0.00"
                                                />
                                            </div>
                                            <div className="space-y-2">
                                                <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Nro Cajas/Tinas</label>
                                                <input 
                                                    type="number" 
                                                    className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl py-3 px-4 text-base font-black text-slate-900 dark:text-white outline-none focus:border-[#009ED6] transition-all" 
                                                    value={nroCajasTinas} 
                                                    onChange={e => setNroCajasTinas(e.target.value)}
                                                    placeholder="0"
                                                />
                                            </div>
                                        </div>

                                        <div className="grid grid-cols-2 gap-4">
                                            <div className="space-y-2">
                                                <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Tara Caja (Kg)</label>
                                                <input 
                                                    type="number" 
                                                    className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl py-3 px-4 text-base font-black text-slate-900 dark:text-white outline-none focus:border-[#009ED6] transition-all" 
                                                    value={taraCajaUnid} 
                                                    onChange={e => setTaraCajaUnid(e.target.value)}
                                                    placeholder="0.00"
                                                />
                                            </div>
                                            <div className="space-y-2">
                                                <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Tara Pallet (Kg)</label>
                                                <input 
                                                    type="number" 
                                                    className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl py-3 px-4 text-base font-black text-slate-900 dark:text-white outline-none focus:border-[#009ED6] transition-all" 
                                                    value={taraPallet} 
                                                    onChange={e => setTaraPallet(e.target.value)}
                                                    placeholder="0.00"
                                                />
                                            </div>
                                        </div>

                                        <div className="bg-[#009ED6]/5 dark:bg-[#009ED6]/10 rounded-2xl p-4 border border-[#009ED6]/20 dark:border-[#009ED6]/30 flex justify-between items-center">
                                            <span className="text-[10px] font-black text-[#009ED6] dark:text-[#009ED6] uppercase tracking-widest">Peso Neto Calculado:</span>
                                            <span className="text-xl font-black text-[#009ED6] dark:text-[#009ED6]">{pesoNeto.toFixed(2)} Kg</span>
                                        </div>
                                    </div>
                                );
                            })()}

                            {/* Section 3: Quantity Input */}
                            <div className="space-y-4">
                                <div className="flex justify-between items-center">
                                    <h3 className="text-[10px] font-bold text-slate-900 dark:text-white uppercase tracking-widest">Cantidad a Preparar</h3>
                                    <span className="text-[9px] font-bold text-[#009ED6] uppercase tracking-widest bg-[#009ED6]/10 dark:bg-[#009ED6]/20 px-2 py-0.5 rounded-full">{activeItemPicking.unidad_medida}</span>
                                </div>
                                
                                <div className="flex items-center justify-center gap-4">
                                    {(() => {
                                        const product = catalog.find(p => p.codigo === activeItemPicking.codigo);
                                        const isWeightControlled = product?.usa_control_tara;
                                        
                                        return (
                                            <>
                                                {!isWeightControlled && (
                                                    <button 
                                                        onClick={() => adjustQty(-1)}
                                                        className="w-12 h-12 bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 rounded-xl flex items-center justify-center active:scale-90 transition-all border border-slate-200 dark:border-slate-700"
                                                    >
                                                        <Minus className="w-5 h-5" />
                                                    </button>
                                                )}
                                                
                                                <div className="relative flex-1 max-w-[160px]">
                                                    <input 
                                                        autoFocus={!isWeightControlled}
                                                        type="number" 
                                                        readOnly={isWeightControlled}
                                                        className={`w-full bg-slate-50 dark:bg-slate-800 border-2 border-slate-200 dark:border-slate-700 rounded-xl py-3 px-4 text-center text-3xl font-black outline-none transition-all shadow-inner ${
                                                            isWeightControlled ? 'text-[#009ED6] dark:text-[#009ED6] border-[#009ED6]/30 dark:border-[#009ED6]/40 cursor-not-allowed' : 'text-slate-900 dark:text-white focus:border-[#009ED6]'
                                                        }`} 
                                                        value={pickQty} 
                                                        onChange={e => handlePickQtyChange(e.target.value)}
                                                        placeholder="0"
                                                    />
                                                    {isWeightControlled && (
                                                        <div className="absolute -top-2 -right-2 bg-[#009ED6] text-white p-1.5 rounded-lg shadow-lg">
                                                            <Scale className="w-4 h-4" />
                                                        </div>
                                                    )}
                                                </div>

                                                {!isWeightControlled && (
                                                    <button 
                                                        onClick={() => adjustQty(1)}
                                                        className="w-12 h-12 bg-[#009ED6] text-white rounded-xl flex items-center justify-center active:scale-90 transition-all shadow-lg"
                                                    >
                                                        <Plus className="w-5 h-5" />
                                                    </button>
                                                )}
                                            </>
                                        );
                                    })()}
                                </div>
                            </div>

                            {/* Section 4: Expiration Date */}
                            <div className="space-y-4 pt-5 border-t border-slate-100 dark:border-slate-800">
                                <h3 className="text-[10px] font-bold text-slate-900 dark:text-white uppercase tracking-widest">Fecha de Vencimiento</h3>
                                <div className="grid grid-cols-2 gap-3">
                                    <div className="relative">
                                        <select 
                                            className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl py-2.5 px-3 text-sm font-bold text-slate-900 dark:text-white outline-none appearance-none focus:border-[#009ED6] transition-all"
                                            value={pickDay}
                                            onChange={e => setPickDay(e.target.value)}
                                        >
                                            <option value="">Día</option>
                                            {Array.from({ length: 31 }, (_, i) => (i + 1).toString().padStart(2, '0')).map(d => (
                                                <option key={d} value={d}>{d}</option>
                                            ))}
                                        </select>
                                        <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400 pointer-events-none" />
                                    </div>
                                    <div className="relative">
                                        <select 
                                            className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl py-2.5 px-3 text-sm font-bold text-slate-900 dark:text-white outline-none appearance-none focus:border-[#009ED6] transition-all"
                                            value={pickMonth}
                                            onChange={e => setPickMonth(e.target.value)}
                                        >
                                            <option value="">Mes</option>
                                            {[
                                                { v: '01', l: 'ENE' }, { v: '02', l: 'FEB' }, { v: '03', l: 'MAR' },
                                                { v: '04', l: 'ABR' }, { v: '05', l: 'MAY' }, { v: '06', l: 'JUN' },
                                                { v: '07', l: 'JUL' }, { v: '08', l: 'AGO' }, { v: '09', l: 'SEP' },
                                                { v: '10', l: 'OCT' }, { v: '11', l: 'NOV' }, { v: '12', l: 'DIC' }
                                            ].map(m => (
                                                <option key={m.v} value={m.v}>{m.l}</option>
                                            ))}
                                        </select>
                                        <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400 pointer-events-none" />
                                    </div>
                                </div>
                                <div className="flex gap-2 overflow-x-auto pb-1 no-scrollbar">
                                    {['2026', '2027', '2028', '2029', '2030'].map(y => (
                                        <button
                                            key={y}
                                            onClick={() => setPickYear(y)}
                                            className={`flex-1 min-w-[60px] py-2 rounded-lg text-[10px] font-bold transition-all border ${
                                                pickYear === y 
                                                ? 'bg-slate-900 border-slate-900 text-white shadow-md' 
                                                : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-400 hover:border-slate-300'
                                            }`}
                                        >
                                            {y}
                                        </button>
                                    ))}
                                </div>
                            </div>

                            {/* Section 6: Photos */}
                            <div className="space-y-4 pt-5 border-t border-slate-100 dark:border-slate-800">
                                <div className="flex justify-between items-center">
                                    <h3 className="text-[10px] font-bold text-slate-900 dark:text-white uppercase tracking-widest">Evidencia Fotográfica</h3>
                                    <span className="text-[9px] font-bold text-slate-400 uppercase">{pickPhotos.length}/4</span>
                                </div>
                                
                                <div className="flex gap-2 overflow-x-auto pb-1 no-scrollbar">
                                    <label className="w-16 h-16 bg-slate-100 dark:bg-slate-800 border-2 border-dashed border-slate-300 dark:border-slate-700 rounded-xl flex flex-col items-center justify-center cursor-pointer hover:bg-slate-200 dark:hover:bg-slate-700 transition-all flex-shrink-0">
                                        <Camera className="w-6 h-6 text-[#009ED6] mb-0.5" />
                                        <span className="text-[7px] font-bold text-slate-500 uppercase">Subir</span>
                                        <input 
                                            type="file" 
                                            accept="image/*" 
                                            className="hidden" 
                                            multiple
                                            onChange={handlePhotoUpload}
                                            disabled={isUploading || pickPhotos.length >= 4}
                                        />
                                    </label>

                                    {pickPhotos.map((photo, idx) => (
                                        <div key={idx} className="relative w-16 h-16 rounded-xl overflow-hidden border border-slate-200 dark:border-slate-700 flex-shrink-0 group shadow-sm">
                                            <img 
                                                src={photo} 
                                                alt={`Evidencia ${idx + 1}`} 
                                                className="w-full h-full object-cover"
                                                referrerPolicy="no-referrer"
                                                onClick={() => setMaximizedGallery({ photos: pickPhotos, index: idx })}
                                            />
                                            <button 
                                                onClick={() => setPickPhotos(prev => prev.filter((_, i) => i !== idx))}
                                                className="absolute top-1 right-1 bg-red-500 text-white p-1.5 rounded-lg opacity-0 group-hover:opacity-100 transition-opacity shadow-lg"
                                            >
                                                <X className="w-3 h-3" />
                                            </button>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </div>

                        {/* Section 6: Registered Pallets - Enhanced for Mobile View */}
                        <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-xl border border-slate-200 dark:border-slate-800 overflow-hidden flex flex-col max-h-[180px]">
                            <div className="px-5 py-2.5 border-b border-slate-100 dark:border-slate-800 flex justify-between items-center bg-slate-50/50 dark:bg-slate-800/50">
                                <h3 className="text-[10px] font-bold text-slate-900 dark:text-white uppercase tracking-widest">Pallets Registrados</h3>
                                <div className="flex items-center gap-2">
                                    <span className="text-[9px] font-bold text-slate-400 uppercase">Total:</span>
                                    <span className="bg-[#009ED6] text-white text-[9px] font-bold px-2 py-0.5 rounded-full shadow-sm">
                                        {itemsDetalle.filter(it => it.codigo === activeItemPicking.codigo && it.estado === 'COMPLETADO').length}
                                    </span>
                                </div>
                            </div>
                            <div className="flex-1 overflow-y-auto custom-scrollbar divide-y dark:divide-slate-800">
                                {itemsDetalle
                                    .filter(it => it.codigo === activeItemPicking.codigo && it.estado === 'COMPLETADO')
                                    .map((it) => (
                                        <div key={it.id} className="px-4 py-2 flex items-center justify-between gap-3 hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors">
                                            <div className="flex items-center gap-3 flex-1 min-w-0">
                                                {it.fotos && it.fotos.length > 0 ? (
                                                    <div 
                                                        className="w-10 h-10 rounded-lg overflow-hidden border border-slate-200 dark:border-slate-700 flex-shrink-0 cursor-zoom-in shadow-sm"
                                                        onClick={() => setMaximizedGallery({ photos: it.fotos!, index: 0 })}
                                                    >
                                                        <img 
                                                            src={it.fotos[0]} 
                                                            alt="Evidencia" 
                                                            className="w-full h-full object-cover"
                                                            referrerPolicy="no-referrer"
                                                        />
                                                    </div>
                                                ) : (
                                                    <div className="w-10 h-10 rounded-lg bg-slate-100 dark:bg-slate-800 flex items-center justify-center flex-shrink-0 border border-slate-200 dark:border-slate-700">
                                                        <ImageIcon className="w-4 h-4 text-slate-400" />
                                                    </div>
                                                )}
                                                <div className="flex flex-col min-w-0">
                                                    <div className="flex items-center gap-2">
                                                        <span className="text-[9px] font-bold text-slate-900 dark:text-white uppercase tracking-widest">PLT {it.numero_paleta}</span>
                                                        <span className="text-[8px] font-bold text-emerald-600 dark:text-emerald-400 uppercase tracking-widest bg-emerald-50 dark:bg-emerald-500/10 px-1.5 py-0.5 rounded-lg border border-emerald-100 dark:border-emerald-800/50">{it.cantidad_despachada} {it.unidad_medida}</span>
                                                        {it.inspeccion_calidad && (
                                                            <CheckCircle className="w-3 h-3 text-amber-500" />
                                                        )}
                                                    </div>
                                                    <span className="text-[9px] font-black text-emerald-600 uppercase tracking-widest truncate mt-0.5">
                                                        VENCE: {it.fecha_vencimiento ? it.fecha_vencimiento.split('-').reverse().join('/') : '-'}
                                                    </span>
                                                </div>
                                            </div>
                                            <div className="flex items-center gap-2">
                                                <button 
                                                    onClick={() => {
                                                        setEditingItemId(it.id);
                                                        setPickQty(it.cantidad_despachada?.toString() || '');
                                                        setPickPhotos(it.fotos || []);
                                                        if(it.fecha_vencimiento) {
                                                            const d = new Date(it.fecha_vencimiento);
                                                            setPickDay(d.getUTCDate().toString().padStart(2, '0'));
                                                            setPickMonth((d.getUTCMonth()+1).toString().padStart(2, '0'));
                                                            setPickYear(d.getUTCFullYear().toString());
                                                        }
                                                        setPaletaActivaNo(it.numero_paleta || 1);
                                                        
                                                        // Cargar datos de peso si existen
                                                        setPesoBruto(it.peso_bruto?.toString() || '');
                                                        setNroCajasTinas(it.nro_cajas_tinas?.toString() || '');
                                                        setTaraCajaUnid(it.tara_caja_unid?.toString() || '');
                                                        setTaraPallet(it.tara_pallet?.toString() || '');
                                                        setPesoNeto(it.peso_neto || 0);
                                                        setEditingItemId(it.id);
                                                    }}
                                                    className="w-8 h-8 bg-[#009ED6] text-white rounded-lg flex items-center justify-center active:scale-90 transition-all shadow-md hover:bg-[#0088B8]"
                                                    title="Editar registro"
                                                >
                                                    <Pencil className="w-4 h-4" />
                                                </button>
                                                <button 
                                                    onClick={() => {
                                                        setRecordIdToDelete(it.id);
                                                        setShowDeleteRecordModal(true);
                                                    }}
                                                    className="w-8 h-8 bg-red-500 text-white rounded-lg flex items-center justify-center active:scale-90 transition-all shadow-md hover:bg-red-600"
                                                    title="Eliminar registro"
                                                >
                                                    <Trash2 className="w-4 h-4" />
                                                </button>
                                            </div>
                                        </div>
                                    ))}
                            </div>
                        </div>
                    </div>
                </div>

                {/* Modal Footer - Professional Buttons */}
                <div className="bg-white dark:bg-slate-900 border-t border-slate-200 dark:border-slate-800 p-4 shadow-2xl">
                    <div className="grid grid-cols-2 gap-3">
                        <button 
                            onClick={handleClosePicking}
                            className="bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 py-2.5 rounded-xl text-xs font-bold uppercase tracking-widest active:scale-95 transition-all border border-slate-200 dark:border-slate-700"
                        >
                            Cerrar
                        </button>
                        <button 
                            onClick={() => handleSavePicking()}
                            disabled={isSavingPicking || (parseFloat(pickQty) <= 0 && !itemsDetalle.filter(it => it.codigo === activeItemPicking.codigo && it.estado === 'COMPLETADO').length)}
                            className={`py-2.5 rounded-xl text-xs font-bold uppercase tracking-widest shadow-lg active:scale-95 transition-all flex items-center justify-center gap-2 ${
                                isSavingPicking 
                                ? 'bg-slate-300 dark:bg-slate-700 text-slate-500 cursor-not-allowed' 
                                : 'bg-[#009ED6] text-white hover:bg-[#0088B8]'
                            }`}
                        >
                            {isSavingPicking ? (
                                <>
                                    <div className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                                    <span>Guardando...</span>
                                </>
                            ) : (
                                <>
                                    <Save className="w-3.5 h-3.5" />
                                    <span>{editingItemId ? 'Actualizar' : 'Finalizar'}</span>
                                </>
                            )}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    )}
    {maximizedGallery && (
            <div 
                className="fixed inset-0 z-[700] bg-black/95 flex items-center justify-center p-4 animate-fade-in"
                onClick={() => setMaximizedGallery(null)}
            >
                <button 
                    className="absolute top-6 right-6 text-white/50 hover:text-white transition-colors z-[710]"
                    onClick={(e) => { e.stopPropagation(); setMaximizedGallery(null); }}
                >
                    <X className="w-10 h-10" />
                </button>

                {maximizedGallery.photos.length > 1 && (
                    <>
                        <button 
                            className="absolute left-4 top-1/2 -translate-y-1/2 w-12 h-12 bg-white/10 hover:bg-white/20 text-white rounded-full flex items-center justify-center transition-all active:scale-90 z-[710]"
                            onClick={(e) => {
                                e.stopPropagation();
                                setMaximizedGallery(prev => {
                                    if (!prev) return null;
                                    const newIndex = prev.index === 0 ? prev.photos.length - 1 : prev.index - 1;
                                    return { ...prev, index: newIndex };
                                });
                            }}
                        >
                            <ChevronLeft className="w-8 h-8" />
                        </button>
                        <button 
                            className="absolute right-4 top-1/2 -translate-y-1/2 w-12 h-12 bg-white/10 hover:bg-white/20 text-white rounded-full flex items-center justify-center transition-all active:scale-90 z-[710]"
                            onClick={(e) => {
                                e.stopPropagation();
                                setMaximizedGallery(prev => {
                                    if (!prev) return null;
                                    const newIndex = prev.index === prev.photos.length - 1 ? 0 : prev.index + 1;
                                    return { ...prev, index: newIndex };
                                });
                            }}
                        >
                            <ChevronRight className="w-8 h-8" />
                        </button>
                        <div className="absolute bottom-6 left-1/2 -translate-x-1/2 bg-black/50 px-4 py-2 rounded-full text-white text-xs font-black tracking-widest uppercase">
                            Foto {maximizedGallery.index + 1} de {maximizedGallery.photos.length}
                        </div>
                    </>
                )}

                <img 
                    src={maximizedGallery.photos[maximizedGallery.index]} 
                    alt="Evidencia Maximizada" 
                    className="max-w-full max-h-full object-contain rounded-2xl shadow-2xl animate-scale-in"
                    referrerPolicy="no-referrer"
                    onClick={(e) => e.stopPropagation()}
                />
            </div>
        )}
            {showTvuModal && (
                <div className="fixed inset-0 z-[600] bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
                    <div className="bg-white dark:bg-[#1e293b] w-full max-w-4xl rounded-[2.5rem] shadow-2xl overflow-hidden animate-scale-in">
                        <div className="bg-red-600 p-6 flex justify-between items-center">
                            <div className="flex items-center gap-3 text-white">
                                <Bell className="w-6 h-6 animate-bell-shake" />
                                <div>
                                    <h3 className="font-black text-xl uppercase tracking-tighter">Productos Observados</h3>
                                    <p className="text-[10px] font-bold uppercase opacity-80 tracking-widest">{tvuModalData.provincia}</p>
                                </div>
                            </div>
                            <button onClick={() => setShowTvuModal(false)} className="bg-white/20 hover:bg-white/30 text-white p-2 rounded-full transition-colors">
                                <X className="w-5 h-5" />
                            </button>
                        </div>
                        
                        <div className="p-6 max-h-[60vh] overflow-y-auto custom-scrollbar">
                            {tvuModalData.items.length === 0 ? (
                                <div className="text-center py-10">
                                    <CheckCircle className="w-12 h-12 text-emerald-500 mx-auto mb-3" />
                                    <p className="text-slate-500 font-bold uppercase text-xs tracking-widest">No hay productos con TVU crítico</p>
                                </div>
                            ) : (
                                <div className="space-y-3">
                                    {tvuModalData.items.map((it, idx) => (
                                        <div key={idx} className="bg-slate-50 dark:bg-slate-800/50 p-4 rounded-2xl border border-slate-100 dark:border-slate-700 flex items-center justify-between group hover:border-red-200 transition-colors">
                                            <div className="flex flex-col">
                                                <span className="text-[10px] font-black text-red-600 uppercase tracking-widest mb-1">{it.codigo}</span>
                                                <span className="font-bold text-slate-800 dark:text-white text-sm uppercase leading-tight">{it.nombre}</span>
                                            </div>
                                            <div className="flex items-center gap-4">
                                                <div className="text-right">
                                                    <div className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-0.5">Pedido</div>
                                                    <div className="text-lg font-black text-slate-800 dark:text-white">
                                                        {it.pedido} <span className="text-[10px] font-bold text-slate-400">{it.unidadMedida || ''}</span>
                                                    </div>
                                                </div>
                                                <div className="text-right border-l pl-4 dark:border-slate-700">
                                                    <div className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-0.5">TVM Días</div>
                                                    <div className="text-lg font-black text-slate-800 dark:text-white">{it.tvmDias}</div>
                                                </div>
                                                <div className="text-right border-l pl-4 dark:border-slate-700">
                                                    <div className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-0.5">Vencimiento</div>
                                                    <div className="text-lg font-black text-slate-800 dark:text-white">
                                                        {it.vencimiento ? it.vencimiento.split('-').reverse().join('-') : 'N/A'}
                                                    </div>
                                                </div>
                                                <div className="text-right border-l pl-4 dark:border-slate-700">
                                                    <div className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-0.5">TVU Actual</div>
                                                    <div className={`text-lg font-black ${it.tvuActual <= 30 ? 'text-red-600' : 'text-amber-600'}`}>{it.tvuActual}%</div>
                                                </div>
                                                <div className="text-right border-l pl-4 dark:border-slate-700">
                                                    <div className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-0.5">Días Rest.</div>
                                                    <div className="text-lg font-black text-slate-800 dark:text-white">{it.tvuDias}</div>
                                                </div>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                        
                        <div className="p-6 bg-slate-50 dark:bg-slate-800/30 border-t dark:border-slate-700 flex justify-end">
                            <button 
                                onClick={() => setShowTvuModal(false)}
                                className="px-8 py-3 bg-slate-800 text-white rounded-2xl font-black text-[10px] uppercase tracking-widest hover:bg-slate-700 transition-colors shadow-lg"
                            >
                                Entendido
                            </button>
                        </div>
                    </div>
                </div>
            )}

        {alertModal.show && (
            <div className="fixed inset-0 z-[600] bg-slate-900/80 backdrop-blur-lg flex items-center justify-center p-6 animate-fade-in">
                <div className={`bg-white dark:bg-[#1e293b] w-full max-w-xs rounded-[2.5rem] shadow-2xl p-8 text-center space-y-6 border-4 ${alertModal.type === 'error' ? 'border-red-500' : alertModal.type === 'warning' ? 'border-amber-500' : 'border-blue-500'}`}>
                    <div className={`w-20 h-20 rounded-full flex items-center justify-center mx-auto shadow-lg ${alertModal.type === 'error' ? 'bg-red-100 text-red-600' : alertModal.type === 'warning' ? 'bg-amber-100 text-amber-600' : 'bg-blue-100 text-blue-600'}`}>
                        {alertModal.type === 'error' ? <XCircle className="w-10 h-10" /> : alertModal.type === 'warning' ? <AlertTriangle className="w-10 h-10" /> : <Info className="w-10 h-10" />}
                    </div>
                    <div className="space-y-2">
                        <h3 className={`text-2xl font-black uppercase tracking-tighter ${alertModal.type === 'error' ? 'text-red-600' : alertModal.type === 'warning' ? 'text-amber-600' : 'text-blue-600'}`}>
                            {alertModal.title}
                        </h3>
                        <p className="text-slate-500 dark:text-slate-400 text-xs font-bold uppercase tracking-widest leading-relaxed">
                            {alertModal.message}
                        </p>
                    </div>
                    <button 
                        onClick={() => setAlertModal(prev => ({ ...prev, show: false }))}
                        className={`w-full py-4 text-white font-black rounded-2xl text-[10px] uppercase tracking-widest shadow-lg transition-all active:scale-95 ${alertModal.type === 'error' ? 'bg-red-600 hover:bg-red-700 shadow-red-200' : alertModal.type === 'warning' ? 'bg-amber-600 hover:bg-amber-700 shadow-amber-200' : 'bg-blue-600 hover:bg-blue-700 shadow-blue-200'}`}
                    >
                        Entendido
                    </button>
                </div>
            </div>
        )}
        {tvuWarning.show && (
            <div className="fixed inset-0 z-[500] bg-slate-900/80 backdrop-blur-lg flex items-center justify-center p-6 animate-fade-in">
                <div className={`bg-white dark:bg-[#1e293b] w-full max-w-xs rounded-[2.5rem] shadow-2xl p-8 text-center space-y-6 border-4 ${tvuWarning.color === 'red' ? 'border-red-500' : 'border-orange-500'}`}>
                    <div className={`w-20 h-20 rounded-full flex items-center justify-center mx-auto shadow-lg ${tvuWarning.color === 'red' ? 'bg-red-100 text-red-600' : 'bg-orange-100 text-orange-600'}`}>
                        <Clock className="w-10 h-10" />
                    </div>
                    <div className="space-y-2">
                        <h3 className={`text-2xl font-black uppercase tracking-tighter ${tvuWarning.color === 'red' ? 'text-red-600' : 'text-orange-600'}`}>
                            Alerta de TVU
                        </h3>
                        <p className="text-slate-500 dark:text-slate-400 text-xs font-bold uppercase tracking-widest leading-relaxed">
                            {tvuWarning.message}
                        </p>
                    </div>
                    <div className="flex flex-col gap-3">
                        <button 
                            onClick={() => {
                                handleSavePicking(true);
                                setTvuWarning(prev => ({ ...prev, show: false }));
                            }}
                            className={`w-full py-4 text-white font-black rounded-2xl text-[10px] uppercase tracking-widest shadow-lg transition-all active:scale-95 ${tvuWarning.color === 'red' ? 'bg-red-600 hover:bg-red-700 shadow-red-200' : 'bg-orange-600 hover:bg-orange-700 shadow-orange-200'}`}
                        >
                            Confirmar de todas formas
                        </button>
                        <button 
                            onClick={() => setTvuWarning(prev => ({ ...prev, show: false }))}
                            className="w-full py-4 bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 font-black rounded-2xl text-[10px] uppercase tracking-widest hover:bg-slate-200 transition-all active:scale-95"
                        >
                            Revisar Fecha
                        </button>
                    </div>
                </div>
            </div>
        )}
        {showConfirmFinalize && (
            <div className="fixed inset-0 z-[500] bg-slate-900/80 backdrop-blur-lg flex items-center justify-center p-6 animate-fade-in">
                <div className="bg-white dark:bg-[#1e293b] w-full max-w-xs rounded-[2.5rem] shadow-2xl p-8 text-center space-y-6 border-4 border-[#009ED6]">
                    <div className="w-20 h-20 rounded-full bg-blue-100 text-[#009ED6] flex items-center justify-center mx-auto shadow-lg">
                        <CheckCircle className="w-10 h-10" />
                    </div>
                    <div className="space-y-2">
                        <h3 className="text-2xl font-black uppercase tracking-tighter text-[#009ED6]">
                            ¿Finalizar Despacho?
                        </h3>
                        <p className="text-slate-500 dark:text-slate-400 text-xs font-bold uppercase tracking-widest leading-relaxed">
                            ¿Estás seguro de finalizar este despacho? El estado pasará de PENDIENTE a COMPLETADO y se moverá al histórico.
                        </p>
                    </div>
                    <div className="flex flex-col gap-3">
                        <button 
                            onClick={confirmFinalize}
                            className="w-full py-4 bg-[#009ED6] text-white font-black rounded-2xl text-[10px] uppercase tracking-widest shadow-lg shadow-blue-200 hover:bg-blue-600 transition-all active:scale-95"
                        >
                            Sí, Finalizar
                        </button>
                        <button 
                            onClick={() => {
                                setShowConfirmFinalize(false);
                                setHeaderToFinalize(null);
                            }}
                            className="w-full py-4 bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 font-black rounded-2xl text-[10px] uppercase tracking-widest hover:bg-slate-200 transition-all active:scale-95"
                        >
                            Cancelar
                        </button>
                    </div>
                </div>
            </div>
        )}

        {showPreparedWeightsModal && preparedWeightsHeader && (
            <div className="fixed inset-0 z-[600] bg-slate-900/40 backdrop-blur-sm flex items-center justify-center p-4 animate-fade-in">
                <div className="bg-white dark:bg-slate-900 w-full max-w-4xl rounded-[2.5rem] shadow-2xl overflow-hidden border border-slate-100 dark:border-slate-800 animate-scale-in flex flex-col max-h-[85vh]">
                    
                    {/* Header */}
                    <div className="p-6 border-b border-slate-100 dark:border-slate-800 flex justify-between items-center bg-slate-50/50 dark:bg-slate-800/50">
                        <div>
                            <div className="flex items-center gap-2 mb-1">
                                <span className="bg-indigo-100 text-indigo-700 dark:bg-indigo-950/50 dark:text-indigo-400 px-2.5 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wider">
                                    Detalle de Pesos
                                </span>
                                <span className="text-[10px] text-slate-400 font-bold uppercase">
                                    Cerrado: {preparedWeightsHeader.fecha_despacho ? new Date(preparedWeightsHeader.fecha_despacho).toLocaleDateString() : 'Pendiente'}
                                </span>
                            </div>
                            <h3 className="text-2xl font-black text-slate-800 dark:text-white uppercase tracking-tighter">
                                {preparedWeightsHeader.provincia}
                            </h3>
                        </div>
                        <button 
                            onClick={() => setShowPreparedWeightsModal(false)}
                            className="p-2 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-full text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-all"
                        >
                            <X className="w-5 h-5" />
                        </button>
                    </div>

                    {/* Content */}
                    <div className="p-6 overflow-y-auto flex-1 min-h-0">
                        {loadingPreparedWeights ? (
                            <div className="py-20 flex flex-col items-center justify-center gap-3">
                                <div className="w-8 h-8 border-4 border-[#009ED6] border-t-transparent rounded-full animate-spin"></div>
                                <p className="text-[10.5px] font-black text-slate-400 uppercase tracking-widest">
                                    Consultando registros de carga...
                                </p>
                            </div>
                        ) : preparedWeightsItems.length === 0 ? (
                            <div className="py-20 text-center">
                                <div className="w-16 h-16 bg-slate-50 dark:bg-slate-800 rounded-3xl flex items-center justify-center mb-4 mx-auto text-slate-400">
                                    <Info className="w-8 h-8" />
                                </div>
                                <h4 className="text-sm font-black text-slate-700 dark:text-slate-300 uppercase tracking-tight mb-1">
                                    Sin Productos Preparados
                                </h4>
                                <p className="text-slate-400 dark:text-slate-500 text-xs font-bold uppercase tracking-wide">
                                    Aún no se han registrado pesajes o cargas con estado COMPLETADO para este despacho.
                                </p>
                            </div>
                        ) : (
                            <div className="space-y-6">
                                <div className="overflow-x-auto border border-slate-100 dark:border-slate-800 rounded-2xl shadow-sm">
                                    <table className="w-full text-left border-collapse">
                                        <thead>
                                            <tr className="bg-slate-50/75 dark:bg-slate-800/50 border-b border-slate-100 dark:border-slate-800">
                                                <th className="py-3 px-4 text-[9px] font-black text-slate-400 uppercase tracking-wider border-b border-slate-100 dark:border-slate-800">LPN / Palet</th>
                                                <th className="py-3 px-4 text-[9px] font-black text-slate-400 uppercase tracking-wider border-b border-slate-100 dark:border-slate-800">Código/SKU</th>
                                                <th className="py-3 px-4 text-[9px] font-black text-slate-400 uppercase tracking-wider border-b border-slate-100 dark:border-slate-800">Producto</th>
                                                <th className="py-3 px-4 text-[9px] font-black text-slate-400 uppercase tracking-wider border-b border-slate-100 dark:border-slate-800 text-right">Cant. Pedida</th>
                                                <th className="py-3 px-4 text-[9px] font-black text-slate-400 uppercase tracking-wider border-b border-slate-100 dark:border-slate-800 text-right">Cant. Preparada</th>
                                                <th className="py-3 px-4 text-[9px] font-black text-slate-400 uppercase tracking-wider border-b border-slate-100 dark:border-slate-800 text-right">Peso Registrado</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                                            {preparedWeightsItems.map((item, index) => {
                                                const product = catalog.find(p => p.codigo === item.codigo);
                                                return (
                                                    <tr key={item.id || index} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/30 transition-colors">
                                                        <td className="py-3 px-4 font-black text-slate-800 dark:text-slate-200 text-xs">
                                                            #{item.numero_paleta || 'S/P'}
                                                        </td>
                                                        <td className="py-3 px-4 font-mono text-slate-400 text-[10px]">
                                                            {item.codigo}
                                                        </td>
                                                        <td className="py-3 px-4 font-bold text-slate-700 dark:text-slate-300 text-[11px] uppercase truncate max-w-xs">
                                                            {item.descripcion || product?.nombre || 'PRODUCTO'}
                                                        </td>
                                                        <td className="py-3 px-4 font-black text-slate-400 text-xs text-right">
                                                            {item.cantidad_pedida} <span className="text-[9px] text-slate-400 font-bold">{item.unidad_medida || 'UND'}</span>
                                                        </td>
                                                        <td className="py-3 px-4 font-black text-indigo-600 dark:text-indigo-400 text-xs text-right">
                                                            {item.cantidad_despachada} <span className="text-[9px] font-bold">{item.unidad_medida || 'UND'}</span>
                                                        </td>
                                                        <td className="py-3 px-4 font-black text-emerald-600 dark:text-emerald-400 text-xs text-right">
                                                            {(item.peso_total || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} KG
                                                        </td>
                                                    </tr>
                                                );
                                            })}
                                        </tbody>
                                    </table>
                                </div>

                                {/* Summary metric row */}
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    <div className="bg-slate-50 dark:bg-slate-800/50 p-4 rounded-2xl flex justify-between items-center border border-slate-100 dark:border-slate-800">
                                        <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">
                                            Total SKUs preparados
                                        </span>
                                        <span className="text-base font-black text-slate-800 dark:text-white">
                                            {new Set(preparedWeightsItems.map(it => it.codigo)).size}
                                        </span>
                                    </div>
                                    <div className="bg-emerald-50 dark:bg-emerald-950/20 p-4 rounded-2xl flex justify-between items-center border border-emerald-100/30">
                                        <span className="text-[10px] font-black text-emerald-600 uppercase tracking-widest flex items-center gap-1.5">
                                            <Scale className="w-3.5 h-3.5" /> Total Kilogramos Preparados
                                        </span>
                                        <span className="text-base font-black text-emerald-600 dark:text-emerald-400">
                                            {preparedWeightsItems.reduce((acc, it) => acc + (it.peso_total || 0), 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} KG
                                        </span>
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>

                    {/* Footer */}
                    <div className="p-6 border-t border-slate-100 dark:border-slate-800 flex justify-end bg-slate-50/50 dark:bg-slate-800/50">
                        <button 
                            onClick={() => setShowPreparedWeightsModal(false)}
                            className="px-6 py-3 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-500 dark:text-slate-400 font-black rounded-xl text-[10px] uppercase tracking-widest transition-all active:scale-95"
                        >
                            Cerrar
                        </button>
                    </div>

                </div>
            </div>
        )}

        {showCancelModal && (
            <div className="fixed inset-0 z-[600] bg-slate-900/80 backdrop-blur-md flex items-center justify-center p-4 animate-fade-in">
                <div className="bg-white dark:bg-slate-900 w-full max-w-md rounded-[2.5rem] shadow-2xl overflow-hidden border border-slate-100 dark:border-slate-800 animate-scale-in">
                    <div className="p-8">
                        <div className="w-16 h-16 bg-red-100 dark:bg-red-900/30 rounded-3xl flex items-center justify-center mb-6 mx-auto">
                            <AlertTriangle className="w-8 h-8 text-red-600" />
                        </div>
                        <h3 className="text-2xl font-black text-slate-900 dark:text-white text-center uppercase tracking-tighter mb-2">
                            Confirmar Cancelación
                        </h3>
                        <p className="text-slate-500 dark:text-slate-400 text-center text-sm font-medium mb-8">
                            {itemToCancel 
                                ? `¿Está seguro que desea cancelar el producto "${itemToCancel.descripcion}"?`
                                : "¿Está seguro que desea cancelar todo el despacho?"}
                            <br />
                            <span className="text-xs font-bold text-red-500 uppercase tracking-widest mt-2 block">Esta acción no se puede deshacer.</span>
                        </p>

                        <div className="space-y-4">
                            <div>
                                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 block">Motivo de Cancelación</label>
                                <textarea 
                                    value={cancelReason}
                                    onChange={e => setCancelReason(e.target.value)}
                                    className="w-full bg-slate-50 dark:bg-slate-800 border-2 border-slate-100 dark:border-slate-700 rounded-2xl p-4 text-sm font-bold text-slate-800 dark:text-white outline-none focus:border-red-500 transition-all resize-none h-32"
                                    placeholder="Ingrese el motivo detallado..."
                                />
                            </div>

                            <div className="grid grid-cols-2 gap-4 pt-4">
                                <button 
                                    onClick={() => {
                                        setShowCancelModal(false);
                                        setCancelReason('');
                                        setItemToCancel(null);
                                        setHeaderToCancel(null);
                                    }}
                                    className="py-4 rounded-2xl text-[10px] font-black uppercase tracking-widest text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800 transition-all"
                                >
                                    Cerrar
                                </button>
                                <button 
                                    onClick={handleCancel}
                                    disabled={isCancelling || !cancelReason.trim()}
                                    className="py-4 bg-red-600 text-white rounded-2xl text-[10px] font-black uppercase tracking-widest shadow-lg shadow-red-200 dark:shadow-none hover:bg-red-700 transition-all disabled:opacity-50 flex items-center justify-center gap-2"
                                >
                                    {isCancelling ? (
                                        <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                                    ) : (
                                        <>Confirmar</>
                                    )}
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        )}

        {showDeleteRecordModal && (
            <div className="fixed inset-0 z-[600] bg-slate-900/80 backdrop-blur-md flex items-center justify-center p-4 animate-fade-in">
                <div className="bg-white dark:bg-slate-900 w-full max-w-md rounded-[2.5rem] shadow-2xl overflow-hidden border border-slate-100 dark:border-slate-800 animate-scale-in">
                    <div className="p-8 text-center">
                        <div className="w-16 h-16 bg-red-100 dark:bg-red-900/30 rounded-3xl flex items-center justify-center mb-6 mx-auto">
                            <Trash2 className="w-8 h-8 text-red-600" />
                        </div>
                        <h3 className="text-2xl font-black text-slate-900 dark:text-white uppercase tracking-tighter mb-2">
                            ¿Anular Registro?
                        </h3>
                        <p className="text-slate-500 dark:text-slate-400 text-sm font-medium mb-8">
                            ¿Estás seguro de que deseas anular este registro de preparación? Esta acción se registrará como una cancelación lógica.
                        </p>

                        <div className="grid grid-cols-2 gap-4">
                            <button 
                                onClick={() => {
                                    setShowDeleteRecordModal(false);
                                    setRecordIdToDelete(null);
                                }}
                                className="py-4 rounded-2xl text-[10px] font-black uppercase tracking-widest text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800 transition-all border border-slate-100 dark:border-slate-700"
                            >
                                No, Volver
                            </button>
                            <button 
                                onClick={handleDeletePickingRecord}
                                className="py-4 bg-red-600 text-white rounded-2xl text-[10px] font-black uppercase tracking-widest shadow-lg shadow-red-200 dark:shadow-none hover:bg-red-700 transition-all flex items-center justify-center gap-2"
                            >
                                Sí, Anular
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        )}

        {showAddProductModal && (
            <div className="fixed inset-0 z-[600] bg-slate-900/80 backdrop-blur-lg flex items-center justify-center p-6 animate-fade-in">
                <div className="bg-white dark:bg-[#1e293b] w-full max-w-md rounded-[2.5rem] shadow-2xl overflow-hidden flex flex-col">
                    <div className="bg-[#009ED6] p-6 flex justify-between items-center">
                        <div className="flex items-center gap-3 text-white">
                            <Plus className="w-6 h-6" />
                            <h3 className="font-black text-xl uppercase tracking-tighter">Agregar Producto</h3>
                        </div>
                        <button onClick={() => {
                            setShowAddProductModal(false);
                            setSelectedProductToAdd(null);
                            setSearchQuery('');
                            setSearchResults([]);
                        }} className="bg-white/20 hover:bg-white/30 text-white p-2 rounded-full transition-colors">
                            <X className="w-5 h-5" />
                        </button>
                    </div>

                    <div className="p-8 space-y-6">
                        <div className="space-y-2">
                            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-2">Buscar Producto (Código o Nombre)</label>
                            <div className="relative">
                                <input 
                                    type="text" 
                                    value={searchQuery}
                                    onChange={(e) => handleSearchProduct(e.target.value)}
                                    placeholder="Ej: LAC001 o Leche..."
                                    className="w-full bg-slate-50 dark:bg-slate-800 border-2 border-slate-100 dark:border-slate-700 rounded-2xl px-6 py-4 text-sm font-bold focus:border-[#009ED6] outline-none transition-all"
                                />
                            </div>
                            
                            {searchResults.length > 0 && !selectedProductToAdd && (
                                <div className="mt-2 bg-white dark:bg-slate-800 border-2 border-slate-100 dark:border-slate-700 rounded-2xl overflow-hidden shadow-xl max-h-48 overflow-y-auto custom-scrollbar">
                                    {searchResults.map(p => (
                                        <button 
                                            key={p.id}
                                            onClick={() => {
                                                setSelectedProductToAdd(p);
                                                setSearchQuery(p.nombre);
                                                setSearchResults([]);
                                            }}
                                            className="w-full text-left px-6 py-3 hover:bg-slate-50 dark:hover:bg-slate-700 border-b last:border-0 dark:border-slate-700 transition-colors"
                                        >
                                            <div className="text-[10px] font-black text-[#009ED6] uppercase tracking-widest">{p.codigo}</div>
                                            <div className="text-xs font-bold text-slate-800 dark:text-white uppercase truncate">{p.nombre}</div>
                                        </button>
                                    ))}
                                </div>
                            )}
                        </div>

                        {selectedProductToAdd && (
                            <div className="bg-blue-50 dark:bg-blue-900/30 p-4 rounded-2xl border border-blue-100 dark:border-blue-800 animate-fade-in">
                                <div className="flex justify-between items-start">
                                    <div>
                                        <div className="text-[10px] font-black text-blue-600 uppercase tracking-widest">{selectedProductToAdd.codigo}</div>
                                        <div className="text-xs font-bold text-slate-800 dark:text-white uppercase">{selectedProductToAdd.nombre}</div>
                                    </div>
                                    <button 
                                        onClick={() => setSelectedProductToAdd(null)}
                                        className="text-blue-400 hover:text-red-500"
                                    >
                                        <X className="w-4 h-4" />
                                    </button>
                                </div>
                            </div>
                        )}

                        <div className="space-y-2">
                            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-2">Cantidad a Pedir</label>
                            <input 
                                type="number" 
                                value={addQty}
                                onChange={(e) => setAddQty(e.target.value)}
                                placeholder="0.00"
                                className="w-full bg-slate-50 dark:bg-slate-800 border-2 border-slate-100 dark:border-slate-700 rounded-2xl px-6 py-4 text-2xl font-black text-center focus:border-[#009ED6] outline-none transition-all"
                            />
                        </div>

                        <button 
                            onClick={handleAddProductToDispatch}
                            disabled={!selectedProductToAdd || !addQty || isAddingProduct}
                            className={`w-full py-5 rounded-2xl font-black text-xs uppercase tracking-widest shadow-xl transition-all active:scale-95 flex items-center justify-center gap-3 ${
                                !selectedProductToAdd || !addQty || isAddingProduct 
                                ? 'bg-slate-200 text-slate-400 cursor-not-allowed' 
                                : 'bg-[#009ED6] text-white hover:bg-blue-600 shadow-blue-200'
                            }`}
                        >
                            {isAddingProduct ? (
                                <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                            ) : (
                                <CheckCircle className="w-5 h-5" />
                            )}
                            {isAddingProduct ? 'Agregando...' : 'Confirmar Adición'}
                        </button>
                    </div>
                </div>
            </div>
        )}

        {/* Modal Confirmación Eliminar Historial */}
        {showDeleteHistoryConfirm && headerToDelete && (
            <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/80 backdrop-blur-md animate-in fade-in duration-300">
                <div className="bg-white dark:bg-[#1e293b] w-full max-w-md rounded-[2.5rem] p-10 shadow-2xl border border-slate-200 dark:border-slate-700 text-center animate-in zoom-in duration-300">
                    <div className="bg-red-50 dark:bg-red-900/20 text-red-600 w-24 h-24 rounded-full flex items-center justify-center mx-auto mb-8 shadow-inner">
                        <Trash2 className="w-12 h-12" />
                    </div>
                    <h3 className="text-3xl font-black text-slate-800 dark:text-white uppercase tracking-tighter mb-4">¿Quitar del Historial?</h3>
                    <p className="text-slate-500 dark:text-slate-400 text-sm font-medium mb-8 leading-relaxed">
                        Estás a punto de quitar el despacho de <span className="font-black text-slate-800 dark:text-white">"{headerToDelete.provincia}"</span> de tu vista. El registro se mantendrá en la base de datos con estado "CANCELADO".
                    </p>
                    <div className="flex flex-col gap-3">
                        <button 
                            onClick={handleDeleteHistory}
                            className="w-full bg-red-600 text-white py-5 rounded-2xl font-black text-xs uppercase shadow-xl hover:bg-red-700 transition-all active:scale-95"
                        >
                            Sí, quitar de la vista
                        </button>
                        <button 
                            onClick={() => { setShowDeleteHistoryConfirm(false); setHeaderToDelete(null); }}
                            className="w-full bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 py-5 rounded-2xl font-black text-xs uppercase hover:bg-slate-200 dark:hover:bg-slate-700 transition-all"
                        >
                            Cancelar
                        </button>
                    </div>
                </div>
            </div>
        )}

        {/* Modal de Estadísticas por Usuario */}
        <AnimatePresence>
            {showUserStatsModal && (
                <div className="fixed inset-0 z-[400] flex items-center justify-center p-4">
                    <motion.div 
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        onClick={() => setShowUserStatsModal(false)}
                        className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm"
                    />
                    <motion.div 
                        initial={{ opacity: 0, scale: 0.9, y: 20 }}
                        animate={{ opacity: 1, scale: 1, y: 0 }}
                        exit={{ opacity: 0, scale: 0.9, y: 20 }}
                        className="relative bg-white dark:bg-[#1e293b] w-full max-w-lg rounded-[3rem] shadow-2xl overflow-hidden border border-indigo-100 dark:border-slate-700"
                    >
                        <div className="bg-[#009ED6] p-8 text-white">
                            <div className="flex justify-between items-start">
                                <div>
                                    <h2 className="text-3xl font-black uppercase tracking-tighter leading-none mb-2">Estadísticas</h2>
                                    <p className="text-sky-100 text-[10px] font-black uppercase tracking-widest">{headerNameForStats}</p>
                                </div>
                                <button 
                                    onClick={() => setShowUserStatsModal(false)}
                                    className="p-3 bg-white/10 hover:bg-white/20 rounded-2xl transition-colors"
                                >
                                    <X className="w-6 h-6" />
                                </button>
                            </div>
                        </div>

                        <div className="p-8 max-h-[70vh] overflow-y-auto">
                            {isLoadingStats ? (
                                <div className="flex flex-col items-center py-12 gap-4">
                                    <div className="w-12 h-12 border-4 border-[#009ED6] border-t-transparent rounded-full animate-spin"></div>
                                    <p className="text-[10px] font-black uppercase text-[#009ED6] tracking-widest">Cargando datos...</p>
                                </div>
                            ) : userStatsData.length > 0 ? (
                                <div className="space-y-8">
                                    {/* Gráfico de Evolución Temporal */}
                                    {timeStatsData.length > 0 && (
                                        <div className="space-y-3">
                                            <h3 className="text-[10px] font-black uppercase text-slate-400 tracking-widest ml-1">Evolución de Picking (KG/Hora)</h3>
                                            <div className="h-48 w-full bg-slate-50 dark:bg-slate-800/50 rounded-3xl p-4 border border-slate-100 dark:border-slate-700">
                                                <ResponsiveContainer width="100%" height="100%">
                                                    <LineChart data={timeStatsData}>
                                                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                                                        <XAxis 
                                                            dataKey="hora" 
                                                            fontSize={9} 
                                                            fontWeight="bold"
                                                            axisLine={false}
                                                            tickLine={false}
                                                            tick={{fill: '#94a3b8'}}
                                                        />
                                                        <YAxis 
                                                            fontSize={9} 
                                                            fontWeight="bold"
                                                            axisLine={false}
                                                            tickLine={false}
                                                            tick={{fill: '#94a3b8'}}
                                                        />
                                                        <Tooltip 
                                                            contentStyle={{ borderRadius: '16px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)', fontSize: '10px' }}
                                                            labelStyle={{ fontWeight: 'black', color: '#009ED6' }}
                                                        />
                                                        <Line 
                                                            type="monotone" 
                                                            dataKey="kilos" 
                                                            stroke="#009ED6" 
                                                            strokeWidth={3} 
                                                            dot={{ fill: '#009ED6', r: 4 }} 
                                                            activeDot={{ r: 6, stroke: 'white', strokeWidth: 2 }}
                                                        />
                                                    </LineChart>
                                                </ResponsiveContainer>
                                            </div>
                                        </div>
                                    )}

                                    <div className="space-y-3">
                                        <h3 className="text-[10px] font-black uppercase text-slate-400 tracking-widest ml-1">Desempeño por Usuario</h3>
                                        <div className="overflow-x-auto">
                                            <table className="w-full text-left">
                                            <thead>
                                                <tr className="border-b border-indigo-50 dark:border-slate-700">
                                                    <th className="pb-4 text-[10px] font-black uppercase text-slate-400 tracking-widest">Usuario</th>
                                                    <th className="pb-4 text-[10px] font-black uppercase text-slate-400 tracking-widest text-center">Frecuencia</th>
                                                    <th className="pb-4 text-[10px] font-black uppercase text-slate-400 tracking-widest text-right">Cantidad (KG)</th>
                                                </tr>
                                            </thead>
                                            <tbody className="divide-y divide-indigo-50 dark:divide-slate-700">
                                                {userStatsData.map((stat, idx) => (
                                                    <tr key={idx} className="group hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors">
                                                        <td className="py-4">
                                                            <div className="flex items-center gap-3">
                                                                <div className="w-8 h-8 rounded-full bg-indigo-100 dark:bg-indigo-900/30 flex items-center justify-center text-indigo-600 dark:text-indigo-400 text-xs font-black">
                                                                    {stat.usuario.charAt(0).toUpperCase()}
                                                                </div>
                                                                <span className="text-xs font-bold text-slate-700 dark:text-slate-200">{stat.usuario}</span>
                                                            </div>
                                                        </td>
                                                        <td className="py-4 text-center">
                                                            <span className="text-xs font-black text-slate-900 dark:text-white bg-slate-100 dark:bg-slate-800 px-3 py-1 rounded-full border border-slate-200 dark:border-slate-700">
                                                                {stat.frecuencia}
                                                            </span>
                                                        </td>
                                                        <td className="py-4 text-right">
                                                            <div className="flex flex-col items-end">
                                                                <span className="text-sm font-black text-indigo-600 dark:text-indigo-400">{stat.kilos}</span>
                                                                <span className="text-[10px] text-slate-400 font-bold uppercase tracking-tighter">Kilogramos</span>
                                                            </div>
                                                        </td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>
                                </div>

                                <div className="pt-6 border-t border-indigo-50 dark:border-slate-700">
                                        <div className="grid grid-cols-2 gap-4">
                                            <div className="bg-slate-50 dark:bg-slate-800/50 p-4 rounded-3xl border border-slate-100 dark:border-slate-700">
                                                <p className="text-[10px] font-black uppercase text-slate-400 tracking-widest mb-1">Total Usuarios</p>
                                                <p className="text-2xl font-black text-slate-900 dark:text-white leading-none">{userStatsData.length}</p>
                                            </div>
                                            <div className="bg-indigo-50/50 dark:bg-indigo-900/20 p-4 rounded-3xl border border-indigo-100/50 dark:border-indigo-900/30">
                                                <p className="text-[10px] font-black uppercase text-indigo-400 tracking-widest mb-1">Total KG</p>
                                                <p className="text-2xl font-black text-indigo-600 dark:text-indigo-400 leading-none">
                                                    {userStatsData.reduce((acc, curr) => acc + curr.kilos, 0).toFixed(2)}
                                                </p>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            ) : (
                                <div className="flex flex-col items-center py-12 text-center gap-3">
                                    <div className="w-16 h-16 bg-slate-100 dark:bg-slate-800 rounded-full flex items-center justify-center text-slate-300">
                                        <Info className="w-8 h-8" />
                                    </div>
                                    <p className="text-xs font-black uppercase text-slate-400 tracking-widest">No hay preparaciones registradas</p>
                                </div>
                            )}
                        </div>
                    </motion.div>
                </div>
            )}
        </AnimatePresence>

        {/* Modal de Gráficos */}
        <AnimatePresence>
          {showChartsModal && selectedHeaderForCharts && (
            <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
              <motion.div 
                initial={{ opacity: 0, scale: 0.9, y: 20 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.9, y: 20 }}
                className="bg-white dark:bg-[#0f172a] w-full max-w-6xl rounded-[3rem] shadow-2xl overflow-hidden border border-slate-100 dark:border-slate-800 flex flex-col max-h-[90vh]"
              >
                <div className="p-8 border-b dark:border-slate-800 flex justify-between items-center bg-gradient-to-r from-slate-50 to-white dark:from-slate-900 dark:to-[#0f172a]">
                  <div>
                    <h2 className="text-3xl font-black text-slate-800 dark:text-white uppercase tracking-tighter flex items-center gap-3">
                      <BarChart3 className="w-8 h-8 text-[#009ED6]" />
                      Métricas: {selectedHeaderForCharts.provincia}
                    </h2>
                    <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest mt-1">Análisis detallado de carga y distribución</p>
                  </div>
                  <button 
                    onClick={() => setShowChartsModal(false)}
                    className="p-3 bg-slate-100 dark:bg-slate-800 rounded-2xl text-slate-400 hover:text-red-500 transition-all hover:rotate-90"
                  >
                    <X className="w-6 h-6" />
                  </button>
                </div>

                <div className="p-8 overflow-y-auto custom-scrollbar">
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                    {/* Progress Indicators */}
                    <div className="space-y-8">
                      <div className="bg-slate-50 dark:bg-slate-800/50 p-6 rounded-[2rem] border border-slate-100 dark:border-slate-700">
                        <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-6">Cumplimiento General</h3>
                        
                        <div className="space-y-6">
                          <div className="space-y-2">
                            <div className="flex justify-between items-end">
                              <span className="text-[8px] font-black text-slate-500 uppercase tracking-widest">SKUs Completados</span>
                              <span className="text-xs font-black text-slate-800 dark:text-slate-200">
                                {selectedHeaderForCharts.items_completados} / {selectedHeaderForCharts.total_items} 
                                ({selectedHeaderForCharts.total_items > 0 ? (((selectedHeaderForCharts.items_completados || 0) / selectedHeaderForCharts.total_items) * 100).toFixed(1).replace(/\.0$/, '') : 0}%)
                              </span>
                            </div>
                            <div className="w-full h-3 bg-slate-200 dark:bg-slate-700 rounded-full overflow-hidden">
                              <motion.div 
                                initial={{ width: 0 }}
                                animate={{ width: `${selectedHeaderForCharts.total_items > 0 ? (((selectedHeaderForCharts.items_completados || 0) / selectedHeaderForCharts.total_items) * 100).toFixed(1).replace(/\.0$/, '') : 0}%` }}
                                transition={{ duration: 1, ease: "easeOut" }}
                                className="h-full bg-[#009ED6]" 
                              />
                            </div>
                          </div>

                          <div className="space-y-2">
                            <div className="flex justify-between items-end">
                              <span className="text-[8px] font-black text-slate-500 uppercase tracking-widest">Volumen Unidades</span>
                              <span className="text-xs font-black text-slate-800 dark:text-slate-200">
                                {Math.round(selectedHeaderForCharts.total_qty_despachada || 0)} / {Math.round(selectedHeaderForCharts.total_qty_pedida || 0)} 
                                ({(selectedHeaderForCharts.total_qty_pedida || 0) > 0 ? (((selectedHeaderForCharts.total_qty_despachada || 0) / (selectedHeaderForCharts.total_qty_pedida || 1)) * 100).toFixed(1).replace(/\.0$/, '') : 0}%)
                              </span>
                            </div>
                            <div className="w-full h-3 bg-slate-200 dark:bg-slate-700 rounded-full overflow-hidden">
                              <motion.div 
                                initial={{ width: 0 }}
                                animate={{ width: `${(selectedHeaderForCharts.total_qty_pedida || 0) > 0 ? (((selectedHeaderForCharts.total_qty_despachada || 0) / (selectedHeaderForCharts.total_qty_pedida || 1)) * 100).toFixed(1).replace(/\.0$/, '') : 0}%` }}
                                transition={{ duration: 1, ease: "easeOut", delay: 0.2 }}
                                className="h-full bg-[#82BD02]" 
                              />
                            </div>
                          </div>

                          <div className="space-y-2">
                            <div className="flex justify-between items-end">
                              <span className="text-[8px] font-black text-slate-500 uppercase tracking-widest">Masa Total (KG)</span>
                              <span className="text-xs font-black text-slate-800 dark:text-slate-200">
                                {Math.round(selectedHeaderForCharts.total_peso_cargado || 0).toLocaleString()} / {Math.round(selectedHeaderForCharts.total_peso_pedido || 0).toLocaleString()} 
                                ({selectedHeaderForCharts.total_peso_pedido ? Math.min(100, Number(((selectedHeaderForCharts.total_peso_cargado || 0) / selectedHeaderForCharts.total_peso_pedido * 100).toFixed(1))) : 0}%)
                              </span>
                            </div>
                            <div className="w-full h-3 bg-slate-200 dark:bg-slate-700 rounded-full overflow-hidden">
                              <motion.div 
                                initial={{ width: 0 }}
                                animate={{ width: `${selectedHeaderForCharts.total_peso_pedido ? Math.min(100, Number(((selectedHeaderForCharts.total_peso_cargado || 0) / selectedHeaderForCharts.total_peso_pedido * 100).toFixed(1))) : 0}%` }}
                                transition={{ duration: 1, ease: "easeOut", delay: 0.4 }}
                                className="h-full bg-indigo-500" 
                              />
                            </div>
                          </div>
                        </div>
                      </div>

                      <div className="grid grid-cols-3 gap-4">
                        <div className="bg-orange-50 dark:bg-orange-900/20 p-4 rounded-2xl border border-orange-100 dark:border-orange-800 text-center">
                          <div className="text-[8px] font-black text-orange-500 uppercase mb-1">Seco</div>
                          <div className="text-lg font-black text-orange-600">{selectedHeaderForCharts.secos_pct}%</div>
                        </div>
                        <div className="bg-sky-50 dark:bg-sky-900/20 p-4 rounded-2xl border border-sky-100 dark:border-sky-800 text-center">
                          <div className="text-[8px] font-black text-sky-500 uppercase mb-1">Refri</div>
                          <div className="text-lg font-black text-sky-600">{selectedHeaderForCharts.refrigerados_pct}%</div>
                        </div>
                        <div className="bg-blue-50 dark:bg-blue-900/20 p-4 rounded-2xl border border-blue-100 dark:border-blue-800 text-center">
                          <div className="text-[8px] font-black text-blue-500 uppercase mb-1">Cong</div>
                          <div className="text-lg font-black text-blue-600">{selectedHeaderForCharts.congelados_pct}%</div>
                        </div>
                      </div>
                    </div>

                    {/* Pie Chart */}
                    <div className="bg-slate-50 dark:bg-slate-800/50 p-6 rounded-[2rem] border border-slate-100 dark:border-slate-700 flex flex-col h-full">
                      <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">Participación por Cámaras (KG)</h3>
                      <div className="flex-1 min-h-[400px]">
                        <ResponsiveContainer width="100%" height="100%">
                          <PieChart margin={{ top: 20, right: 80, bottom: 60, left: 80 }}>
                            <Pie
                              data={[
                                { name: 'Seco', value: selectedHeaderForCharts.peso_seco || 0, color: '#fb923c' },
                                { name: 'Refrigerado', value: selectedHeaderForCharts.peso_refrigerado || 0, color: '#38bdf8' },
                                { name: 'Congelado', value: selectedHeaderForCharts.peso_congelado || 0, color: '#3b82f6' },
                              ].filter(d => d.value > 0)}
                              cx="50%"
                              cy="50%"
                              innerRadius={60}
                              outerRadius={100}
                              paddingAngle={5}
                              stroke="none"
                              dataKey="value"
                              animationDuration={1000}
                              animationBegin={200}
                              label={({ cx, cy, midAngle, outerRadius, percent, value, fill }) => {
                                const RADIAN = Math.PI / 180;
                                const angle = midAngle || 0;
                                const radius = (outerRadius || 100) + 25;
                                const x = cx + radius * Math.cos(-angle * RADIAN);
                                const y = cy + radius * Math.sin(-angle * RADIAN);
                                return (
                                  <text 
                                    x={x} 
                                    y={y} 
                                    fill={fill} 
                                    textAnchor={x > cx ? 'start' : 'end'} 
                                    dominantBaseline="central"
                                    className="text-[11px] font-bold tracking-tight"
                                  >
                                    {`${((percent || 0) * 100).toFixed(1).replace(/\.0$/, '')}% (${Math.round(value).toLocaleString()} kg)`}
                                  </text>
                                );
                              }}
                            >
                              <Label 
                                content={({ viewBox }) => {
                                  const { cx, cy } = viewBox as any;
                                  return (
                                    <g>
                                      <text x={cx} y={cy - 5} textAnchor="middle" dominantBaseline="central" className="text-lg font-black fill-slate-800 dark:fill-white">
                                        {`${Math.round(selectedHeaderForCharts.total_peso_cargado || 0).toLocaleString()}`}
                                      </text>
                                      <text x={cx} y={cy + 15} textAnchor="middle" dominantBaseline="central" className="text-[10px] font-bold fill-slate-400 uppercase tracking-widest">
                                        KG TOTAL
                                      </text>
                                    </g>
                                  );
                                }}
                              />
                              {[
                                { name: 'Seco', value: selectedHeaderForCharts.peso_seco || 0, color: '#fb923c' },
                                { name: 'Refrigerado', value: selectedHeaderForCharts.peso_refrigerado || 0, color: '#38bdf8' },
                                { name: 'Congelado', value: selectedHeaderForCharts.peso_congelado || 0, color: '#3b82f6' },
                              ].filter(d => d.value > 0).map((entry, index) => (
                                <Cell key={`cell-${index}`} fill={entry.color} />
                              ))}
                            </Pie>
                            <RechartsTooltip 
                              contentStyle={{ 
                                borderRadius: '1.5rem', 
                                border: 'none', 
                                boxShadow: '0 20px 25px -5px rgb(0 0 0 / 0.1), 0 8px 10px -6px rgb(0 0 0 / 0.1)',
                                padding: '12px 20px',
                                backgroundColor: 'rgba(255, 255, 255, 0.95)',
                                backdropFilter: 'blur(8px)'
                              }}
                              itemStyle={{ fontSize: '12px', fontWeight: 600, color: '#1e293b' }}
                              formatter={(value: any) => [`${Number(value || 0).toLocaleString()} KG`, 'Peso Total']}
                            />
                            <Legend 
                              verticalAlign="bottom" 
                              height={40}
                              iconType="circle"
                              wrapperStyle={{
                                paddingTop: '20px',
                                fontSize: '10px',
                                fontWeight: 700,
                                textTransform: 'uppercase',
                                letterSpacing: '0.1em'
                              }}
                            />
                          </PieChart>
                        </ResponsiveContainer>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="p-8 bg-slate-50 dark:bg-slate-900/50 border-t dark:border-slate-800 flex justify-end">
                  <button 
                    onClick={() => setShowChartsModal(false)}
                    className="px-8 py-3 bg-slate-800 dark:bg-white text-white dark:text-slate-900 rounded-2xl font-black text-[10px] uppercase tracking-widest hover:scale-105 transition-all shadow-lg"
                  >
                    Cerrar Análisis
                  </button>
                </div>
              </motion.div>
            </div>
          )}
        </AnimatePresence>
            </>
        )}
    </div>
  );
};

export default DespachoProvincia;
