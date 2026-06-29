import React, { useState, useEffect } from 'react';
import { supabase } from '../supabaseClient';
import { Product, Usuario } from '../types';
import { Search, Download, Info, Clock, ChevronRight, RefreshCw } from 'lucide-react';
import * as XLSX from 'xlsx';

interface TvuReportProps {
  catalog: Product[];
  currentUser: Usuario | null;
}

interface TvuRecord {
  id: string;
  source: 'RECEPCION' | 'DESPACHO';
  codigo: string;
  nombre: string;
  cantidad: number;
  fecha_vencimiento: string;
  fecha_operacion: string;
  usuario: string;
  extra_info: string; // e.g. "Proveedor: X" or "Provincia: Y"
  lote?: string;
}

export const TvuReport: React.FC<TvuReportProps> = ({ catalog, currentUser }) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [receptionsList, setReceptionsList] = useState<TvuRecord[]>([]);
  const [dispatchesList, setDispatchesList] = useState<TvuRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  
  // Tab for selected product logs
  const [activeTab, setActiveTab] = useState<'RECEPCIONES' | 'DESPACHOS'>('RECEPCIONES');

  // Filter suggestion list based on search term
  const filteredCatalog = catalog.filter(p => 
    p.nombre.toLowerCase().includes(searchTerm.toLowerCase()) || 
    p.codigo.toLowerCase().includes(searchTerm.toLowerCase())
  ).slice(0, 8);

  const calculateTvuStats = (fechaVencimiento: string, vidaUtilDias: number) => {
    if (!fechaVencimiento || !vidaUtilDias) return { remainingDays: 0, pct: 0, status: 'UNKNOWN' };
    
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    const expDate = new Date(fechaVencimiento);
    expDate.setHours(0, 0, 0, 0);
    
    const diffTime = expDate.getTime() - today.getTime();
    const remainingDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    
    const pct = Math.max(0, Math.round((remainingDays / vidaUtilDias) * 100));
    
    let status: 'CRITICAL' | 'WARNING' | 'HEALTHY' = 'HEALTHY';
    if (pct <= 30 || remainingDays <= 15) {
      status = 'CRITICAL';
    } else if (pct <= 60) {
      status = 'WARNING';
    }
    
    return { remainingDays, pct, status };
  };

  const handleSelectProduct = (product: Product) => {
    setSelectedProduct(product);
    setSearchTerm(`${product.codigo} - ${product.nombre}`);
    setShowSuggestions(false);
  };

  const fetchTvuLogs = async (product: Product) => {
    setLoading(true);
    setErrorMsg(null);
    try {
      // 1. Fetch receptions (limit 3)
      let receptionsQuery = supabase
        .from('recepcion_productos')
        .select('*')
        .eq('codigo', product.codigo)
        .eq('conclusiones', 'ACEPTADO')
        .eq('estado', 'ACTIVO');
        
      if (currentUser?.sede_id) {
        // Supposing recepcion_productos might have sede_id or default to active context
        // Some tables might not have sede_id, let's build it safe
      }
      
      const { data: recData, error: recError } = await receptionsQuery
        .order('fecha_registro', { ascending: false })
        .limit(3);

      if (recError) throw recError;

      const formattedRecs: TvuRecord[] = (recData || []).map(r => ({
        id: r.id,
        source: 'RECEPCION',
        codigo: r.codigo,
        nombre: r.nombre || product.nombre,
        cantidad: Number(r.cantidad) || 0,
        fecha_vencimiento: r.fecha_vencimiento,
        fecha_operacion: r.fecha_registro || new Date().toISOString(),
        usuario: r.usuario_registro || 'Sistema',
        extra_info: r.proveedor ? `Proveedor: ${r.proveedor}` : 'Recepción estándar',
        lote: r.lote || ''
      }));

      // 2. Fetch dispatches (limit 3)
      const { data: dispData, error: dispError } = await supabase
        .from('despachos_item')
        .select('*, despacho_encabezado!inner(*)')
        .eq('codigo', product.codigo)
        .eq('despacho_encabezado.estado', 'COMPLETADO')
        .order('fecha_preparacion', { ascending: false })
        .limit(3);

      if (dispError) throw dispError;

      const formattedDisps: TvuRecord[] = (dispData || []).map(d => {
        const header = (d as any).despacho_encabezado;
        return {
          id: d.id,
          source: 'DESPACHO',
          codigo: d.codigo,
          nombre: product.nombre,
          cantidad: Number(d.cantidad_despachada) || 0,
          fecha_vencimiento: d.fecha_vencimiento,
          fecha_operacion: d.fecha_preparacion || header.fecha_despacho || new Date().toISOString(),
          usuario: d.usuario_preparacion || 'Operador',
          extra_info: header ? `Provincia: ${header.provincia} (${header.documento || 'S/D'})` : 'Despacho estándar'
        };
      });

      setReceptionsList(formattedRecs);
      setDispatchesList(formattedDisps);
      
      // Select the tab that has more data by default
      if (formattedRecs.length === 0 && formattedDisps.length > 0) {
        setActiveTab('DESPACHOS');
      } else {
        setActiveTab('RECEPCIONES');
      }
    } catch (err: any) {
      console.error('Error fetching TVU details:', err);
      setErrorMsg('No se pudo cargar la información de fechas de vencimiento.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (selectedProduct) {
      fetchTvuLogs(selectedProduct);
    } else {
      setReceptionsList([]);
      setDispatchesList([]);
    }
  }, [selectedProduct]);

  // Download logic for the currently selected product
  const downloadSingleProductTvu = () => {
    if (!selectedProduct) return;
    
    setExporting(true);
    try {
      const dataRows: any[] = [];
      
      // Combine and formulate all records
      receptionsList.forEach(rec => {
        const { remainingDays, pct } = calculateTvuStats(rec.fecha_vencimiento, selectedProduct.vida_util_dias);
        dataRows.push({
          'Tipo de Operación': 'INGRESO / RECEPCION',
          'Código SKU': rec.codigo,
          'Producto': selectedProduct.nombre,
          'Lote': rec.lote || 'N/A',
          'Cantidad': rec.cantidad,
          'Fecha Ingreso/Despacho': new Date(rec.fecha_operacion).toLocaleDateString(),
          'Fecha de Vencimiento': rec.fecha_vencimiento ? new Date(rec.fecha_vencimiento).toLocaleDateString() : 'N/A',
          'Días Útiles Totales': selectedProduct.vida_util_dias,
          'Días de Vida Restantes': remainingDays,
          'Porcentaje TVU restante': `${pct}%`,
          'Registrado por': rec.usuario,
          'Detalle / Procedencia': rec.extra_info
        });
      });

      dispatchesList.forEach(disp => {
        const { remainingDays, pct } = calculateTvuStats(disp.fecha_vencimiento || '', selectedProduct.vida_util_dias);
        dataRows.push({
          'Tipo de Operación': 'SALIDA / DESPACHO',
          'Código SKU': disp.codigo,
          'Producto': selectedProduct.nombre,
          'Lote': disp.lote || 'N/A',
          'Cantidad': disp.cantidad,
          'Fecha Ingreso/Despacho': new Date(disp.fecha_operacion).toLocaleDateString(),
          'Fecha de Vencimiento': disp.fecha_vencimiento ? new Date(disp.fecha_vencimiento).toLocaleDateString() : 'N/A',
          'Días Útiles Totales': selectedProduct.vida_util_dias,
          'Días de Vida Restantes': remainingDays,
          'Porcentaje TVU restante': `${pct}%`,
          'Registrado por': disp.usuario,
          'Detalle / Procedencia': disp.extra_info
        });
      });

      if (dataRows.length === 0) {
        alert("No hay registros de transacciones para este producto.");
        return;
      }

      const ws = XLSX.utils.json_to_sheet(dataRows);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "Reporte TVU");
      XLSX.writeFile(wb, `Reporte_TVU_Producto_${selectedProduct.codigo}.xlsx`);
    } catch (error) {
      console.error(error);
      alert('Error al descargar el reporte del producto.');
    } finally {
      setExporting(false);
    }
  };

  // Download report for ALL active products
  const downloadAllProductsTvuReport = async () => {
    setExporting(true);
    try {
      // 1. Fetch latest receptions (last 300 entries to get a robust view)
      let recQuery = supabase
        .from('recepcion_productos')
        .select('*')
        .eq('conclusiones', 'ACEPTADO')
        .eq('estado', 'ACTIVO');
        
      const { data: recData, error: recError } = await recQuery
        .order('fecha_registro', { ascending: false })
        .limit(300);

      if (recError) throw recError;

      // 2. Fetch latest dispatches (last 300 entries)
      const { data: dispData, error: dispError } = await supabase
        .from('despachos_item')
        .select('*, despacho_encabezado!inner(*)')
        .eq('despacho_encabezado.estado', 'COMPLETADO')
        .order('fecha_preparacion', { ascending: false })
        .limit(300);

      if (dispError) throw dispError;

      // Combine both lists and match with catalog for life days
      const allRows: any[] = [];

      (recData || []).forEach(r => {
        const prod = catalog.find(p => p.codigo === r.codigo);
        if (!prod) return;
        const { remainingDays, pct, status } = calculateTvuStats(r.fecha_vencimiento, prod.vida_util_dias);
        allRows.push({
          'Operación': 'INGRESO (RECEPCIÓN)',
          'SKU / Código': r.codigo,
          'Descripción del Producto': r.nombre || prod.nombre,
          'Marca': prod.marca || 'N/A',
          'Lote': r.lote || 'N/A',
          'Cantidad Reales': r.cantidad,
          'Fecha Transacción': r.fecha_registro ? new Date(r.fecha_registro).toLocaleDateString() : '',
          'Fecha de Vencimiento': r.fecha_vencimiento,
          'Vida Útil (Días)': prod.vida_util_dias,
          'Días al Vencer': remainingDays,
          'TVU Restante (%)': `${pct}%`,
          'Estado TVU': status === 'CRITICAL' ? 'CRÍTICO' : status === 'WARNING' ? 'ALERTA' : 'ÓPTIMO',
          'Operador / Proveedor': r.proveedor || r.usuario_registro || ''
        });
      });

      (dispData || []).forEach(d => {
        const prod = catalog.find(p => p.codigo === d.codigo);
        if (!prod) return;
        const header = (d as any).despacho_encabezado;
        const { remainingDays, pct, status } = calculateTvuStats(d.fecha_vencimiento || '', prod.vida_util_dias);
        allRows.push({
          'Operación': 'SALIDA (DESPACHO)',
          'SKU / Código': d.codigo,
          'Descripción del Producto': prod.nombre,
          'Marca': prod.marca || 'N/A',
          'Lote': 'N/A',
          'Cantidad Reales': d.cantidad_despachada,
          'Fecha Transacción': d.fecha_preparacion ? new Date(d.fecha_preparacion).toLocaleDateString() : (header.fecha_despacho ? new Date(header.fecha_despacho).toLocaleDateString() : ''),
          'Fecha de Vencimiento': d.fecha_vencimiento || '',
          'Vida Útil (Días)': prod.vida_util_dias,
          'Días al Vencer': remainingDays,
          'TVU Restante (%)': `${pct}%`,
          'Estado TVU': status === 'CRITICAL' ? 'CRÍTICO' : status === 'WARNING' ? 'ALERTA' : 'ÓPTIMO',
          'Operador / Proveedor': d.usuario_preparacion || header?.provincia || ''
        });
      });

      if (allRows.length === 0) {
        alert("No se encontraron registros de recepciones ni de despachos para compilar.");
        return;
      }

      const ws = XLSX.utils.json_to_sheet(allRows);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "Historial General TVU");
      XLSX.writeFile(wb, `Reporte_General_TVU_${new Date().toISOString().split('T')[0]}.xlsx`);
    } catch (err) {
      console.error(err);
      alert('Error compilando reporte de todo el catálogo.');
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="bg-slate-50 min-h-screen text-slate-800 p-4 md:p-6 space-y-6 animate-fade-in" id="tvu-report-container">
      {/* Header and Brand Banner */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white p-6 rounded-3xl shadow-sm border border-slate-150">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="w-2.5 h-2.5 rounded-full bg-[var(--brand-color)] animate-pulse" />
            <span className="text-[10px] uppercase font-black tracking-widest text-[var(--brand-color)] font-mono">Consola de Control WMS</span>
          </div>
          <h1 className="text-2xl md:text-3xl font-black text-slate-900 tracking-tight flex items-center gap-2">
            Reporte de Control TVU <span className="text-xs font-normal text-slate-400 bg-slate-100 px-2.5 py-1 rounded-full border border-slate-200">Tiempo de Vida Útil</span>
          </h1>
          <p className="text-xs text-slate-500 mt-1 max-w-2xl">
            Permite auditar el cumplimiento del **Tiempo de Vida Útil** de los productos recibidos y despachados. Consulte la trazabilidad de las últimas 3 fechas por artículo o descargue el consolidado histórico.
          </p>
        </div>

        {/* Global Export Button */}
        <button
          type="button"
          onClick={downloadAllProductsTvuReport}
          disabled={exporting}
          className="flex items-center justify-center gap-2 px-5 py-3 rounded-2xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs uppercase tracking-wider transition-all shadow-md hover:shadow-lg disabled:opacity-50 select-none cursor-pointer border border-emerald-500"
          id="btn-download-all-tvu"
        >
          {exporting ? (
            <RefreshCw className="w-4 h-4 animate-spin" />
          ) : (
            <Download className="w-4 h-4" />
          )}
          Download Completo (Excel)
        </button>
      </div>

      {/* Main Content Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        
        {/* Search & Selection Panel */}
        <div className="lg:col-span-5 flex flex-col gap-5">
          <div className="bg-white p-6 rounded-3xl shadow-sm border border-slate-150">
            <h2 className="text-sm font-black text-slate-900 uppercase tracking-wider mb-4 flex items-center gap-2">
              <Search className="w-4 h-4 text-[var(--brand-color)]" />
              Seleccionar Producto
            </h2>
            
            {/* Search inputs */}
            <div className="relative">
              <div className="flex items-center bg-slate-50 border border-slate-200 focus-within:border-[var(--brand-color)] focus-within:ring-2 focus-within:ring-[var(--brand-color)]/25 rounded-2xl p-3.5 transition-all shadow-inner">
                <Search className="w-5 h-5 text-slate-400 mr-2.5" />
                <input
                  type="text"
                  placeholder="Buscar por código SKU o nombre..."
                  value={searchTerm}
                  onChange={(e) => {
                    setSearchTerm(e.target.value);
                    setShowSuggestions(true);
                  }}
                  onFocus={() => setShowSuggestions(true)}
                  className="w-full text-sm font-medium focus:outline-none bg-transparent text-slate-800 placeholder-slate-400"
                  id="product-tvu-search-input"
                />
                {selectedProduct && (
                  <button
                    onClick={() => {
                      setSelectedProduct(null);
                      setSearchTerm('');
                    }}
                    className="text-slate-400 hover:text-slate-600 text-xs font-bold"
                  >
                    Limpiar
                  </button>
                )}
              </div>

              {/* Autocomplete list */}
              {showSuggestions && searchTerm && filteredCatalog.length > 0 && (
                <div className="absolute left-0 right-0 mt-2 bg-white rounded-2xl shadow-xl border border-slate-200 z-50 overflow-hidden divide-y divide-slate-100 max-h-64 overflow-y-auto">
                  {filteredCatalog.map(prod => (
                    <button
                      key={prod.id}
                      type="button"
                      onClick={() => handleSelectProduct(prod)}
                      className="w-full text-left p-3.5 hover:bg-slate-50/85 transition-colors flex items-center justify-between text-xs font-semibold text-slate-700"
                    >
                      <div className="flex flex-col">
                        <span className="font-mono text-[10px] text-[var(--brand-color)] font-bold">{prod.codigo}</span>
                        <span className="text-slate-900 font-bold mt-0.5">{prod.nombre}</span>
                        <span className="text-[10px] text-slate-400 mt-0.5">Vida Útil: {prod.vida_util_dias || 'N/A'} días | TVM: {prod.tvm_dias || '0'}</span>
                      </div>
                      <ChevronRight className="w-4 h-4 text-slate-400" />
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Selected Product Card */}
            {selectedProduct ? (
              <div className="mt-5 p-5 rounded-2xl bg-slate-50 border border-slate-200 relative overflow-hidden">
                <div className="absolute top-0 right-0 p-3 text-[9px] font-mono text-slate-350 bg-slate-100 border-l border-b border-slate-200 rounded-bl-xl font-bold">
                  SKU ACTIVO
                </div>
                
                <h3 className="text-xs font-black uppercase tracking-widest text-[var(--brand-color)]">{selectedProduct.codigo}</h3>
                <h4 className="text-base font-black text-slate-900 mt-1">{selectedProduct.nombre}</h4>
                
                <div className="grid grid-cols-2 gap-3.5 mt-4 text-xs">
                  <div className="bg-white p-3 rounded-xl border border-slate-200">
                    <span className="text-[10px] text-slate-400 uppercase font-black block tracking-wider">Vida útil total</span>
                    <span className="text-base font-black text-slate-800">{selectedProduct.vida_util_dias || '---'} <span className="text-[10px] text-slate-500 font-normal">días</span></span>
                  </div>
                  <div className="bg-white p-3 rounded-xl border border-slate-200">
                    <span className="text-[10px] text-slate-400 uppercase font-black block tracking-wider">Zona asignada</span>
                    <span className="text-base font-black text-slate-800">{selectedProduct.zona_predeterminada || 'SECO'}</span>
                  </div>
                </div>

                {selectedProduct.marca && (
                  <div className="mt-3 text-[11px] font-semibold text-slate-500">
                    Marca: <span className="text-slate-800 font-bold">{selectedProduct.marca}</span>
                  </div>
                )}
              </div>
            ) : (
              <div className="mt-5 p-8 text-center bg-slate-50 rounded-2xl border-2 border-dashed border-slate-200 text-slate-400">
                <Info className="w-8 h-8 mx-auto text-slate-300 mb-2" />
                <p className="text-xs font-bold uppercase tracking-wider">Busque un producto para ver el historial y TVU</p>
              </div>
            )}
          </div>
        </div>

        {/* Results & History Panel */}
        <div className="lg:col-span-7 flex flex-col gap-5">
          <div className="bg-white p-6 rounded-3xl shadow-sm border border-slate-150 min-h-[400px] flex flex-col">
            
            {/* Action Header */}
            <div className="flex items-center justify-between border-b border-slate-100 pb-4 mb-4">
              <div>
                <h2 className="text-sm font-black text-slate-900 uppercase tracking-wider flex items-center gap-2">
                  <Clock className="w-4.5 h-4.5 text-[var(--brand-color)]" />
                  Últimos 3 Despachos/Ingresos
                </h2>
              </div>
              
              {selectedProduct && (
                <button
                  type="button"
                  onClick={downloadSingleProductTvu}
                  disabled={exporting}
                  className="flex items-center gap-1 px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-[10px] font-black uppercase tracking-wider border border-slate-200 transition-all cursor-pointer"
                >
                  <Download className="w-3.5 h-3.5" />
                  Exportar SKU
                </button>
              )}
            </div>

            {!selectedProduct ? (
              <div className="flex-1 flex flex-col items-center justify-center text-slate-450 p-8 text-center">
                <div className="w-16 h-16 rounded-full bg-slate-50 flex items-center justify-center text-[var(--brand-color)] mb-4">
                  <Info className="w-8 h-8" />
                </div>
                <h3 className="text-sm font-black uppercase tracking-wider text-slate-700">Sin datos de consulta</h3>
                <p className="text-xs max-w-sm mt-1 text-slate-500">
                  Seleccione un producto en el buscador lateral para ver las últimas tres fechas transaccionadas en el WMS.
                </p>
              </div>
            ) : loading ? (
              <div className="flex-1 flex flex-col items-center justify-center p-8">
                <RefreshCw className="w-8 h-8 animate-spin text-[var(--brand-color)] mb-2" />
                <p className="text-xs font-bold uppercase tracking-widest text-slate-400">Cargando trazabilidad desde la base de datos...</p>
              </div>
            ) : (
              <div className="flex-1 flex flex-col">
                {errorMsg && (
                  <div className="mb-4 p-3.5 bg-red-50 border border-red-200 text-red-700 text-xs font-semibold rounded-2xl flex items-center gap-2">
                    <Info className="w-4 h-4 text-red-600 shrink-0" />
                    <span>{errorMsg}</span>
                  </div>
                )}
                
                {/* Internal Tabs */}
                <div className="flex border-b border-slate-200 mb-5 text-xs font-bold p-0.5 bg-slate-50 rounded-xl">
                  <button
                    type="button"
                    onClick={() => setActiveTab('RECEPCIONES')}
                    className={`flex-1 py-2.5 text-center transition-all uppercase tracking-wider rounded-lg border-none cursor-pointer text-[10px] font-black ${
                      activeTab === 'RECEPCIONES'
                        ? 'bg-white text-[var(--brand-color)] shadow-sm'
                        : 'text-slate-550 hover:text-slate-800'
                    }`}
                  >
                    📥 Recepciones (Ingresos) [{receptionsList.length}]
                  </button>
                  <button
                    type="button"
                    onClick={() => setActiveTab('DESPACHOS')}
                    className={`flex-1 py-2.5 text-center transition-all uppercase tracking-wider rounded-lg border-none cursor-pointer text-[10px] font-black ${
                      activeTab === 'DESPACHOS'
                        ? 'bg-white text-[var(--brand-color)] shadow-sm'
                        : 'text-slate-550 hover:text-slate-800'
                    }`}
                  >
                    📤 Despachado (Salidas) [{dispatchesList.length}]
                  </button>
                </div>

                {/* Display Lists */}
                {activeTab === 'RECEPCIONES' ? (
                  receptionsList.length === 0 ? (
                    <div className="flex-1 flex flex-col items-center justify-center p-8 bg-slate-50/50 rounded-2xl border border-slate-100 text-center">
                      <p className="text-xs font-bold uppercase tracking-wider text-slate-500">No se encontraron registros de recepciones</p>
                      <p className="text-[10px] text-slate-400 mt-0.5">No hay ingresos registrados para este SKU.</p>
                    </div>
                  ) : (
                    <div className="space-y-4 flex-1">
                      {receptionsList.map((rec, index) => {
                        const { remainingDays, pct, status } = calculateTvuStats(rec.fecha_vencimiento, selectedProduct.vida_util_dias);
                        return (
                          <div
                            key={rec.id}
                            className="p-5 rounded-2xl bg-white border border-slate-205 shadow-sm hover:shadow transition-all flex flex-col md:flex-row md:items-center justify-between gap-4 relative overflow-hidden"
                          >
                            {/* Color Bar indicator */}
                            <div className={`absolute top-0 bottom-0 left-0 w-1.5 ${
                              status === 'CRITICAL' ? 'bg-red-500' : status === 'WARNING' ? 'bg-amber-500' : 'bg-emerald-500'
                            }`} />

                            <div className="pl-2 space-y-1">
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className="px-2 py-0.5 rounded bg-blue-50 text-blue-700 font-mono text-[9px] font-bold uppercase tracking-wider">
                                  Ingreso {index + 1}
                                </span>
                                <span className="text-slate-400 font-mono text-[10px] font-semibold">
                                  {new Date(rec.fecha_operacion).toLocaleDateString()}
                                </span>
                              </div>
                              
                              <div className="text-xs font-bold text-slate-800">
                                Lote: <span className="font-mono text-slate-900 bg-slate-100 px-1.5 py-0.5 rounded">{rec.lote || 'N/A'}</span> 
                                <span className="mx-2 text-slate-350">|</span> 
                                Cantidad: <span className="text-slate-900 font-black">{rec.cantidad} u.</span>
                              </div>
                              
                              <div className="text-[10px] font-bold text-slate-500 flex items-center gap-1">
                                <span>{rec.extra_info}</span>
                                <span className="text-slate-350">•</span>
                                <span>Por {rec.usuario}</span>
                              </div>
                            </div>

                            {/* TVU Stats representation */}
                            <div className="md:text-right flex items-center gap-4 bg-slate-50/50 p-3 md:bg-transparent md:p-0 rounded-xl border border-slate-100 md:border-none">
                              <div className="space-y-0.5">
                                <div className="text-[10px] uppercase font-black tracking-widest text-slate-500">
                                  Vence: <span className="text-slate-900 font-black">{rec.fecha_vencimiento}</span>
                                </div>
                                <div className="text-xs font-semibold text-slate-500">
                                  Quedan <span className={`font-black ${status === 'CRITICAL' ? 'text-red-600' : status === 'WARNING' ? 'text-amber-600' : 'text-emerald-700'}`}>{remainingDays}</span> días útiles
                                </div>
                                <div className="text-[10px] text-slate-400 font-medium">
                                  Equivale al {pct}% de su vida útil
                                </div>
                              </div>
                              
                              {/* Status circle badge */}
                              <div className={`w-11 h-11 rounded-full flex items-center justify-center font-black text-xs shadow-sm shadow-slate-100 ${
                                status === 'CRITICAL' 
                                  ? 'bg-red-50 text-red-600 border border-red-200' 
                                  : status === 'WARNING' 
                                  ? 'bg-amber-50 text-amber-600 border border-amber-200' 
                                  : 'bg-emerald-50 text-emerald-600 border border-emerald-250'
                              }`}>
                                {pct}%
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )
                ) : (
                  dispatchesList.length === 0 ? (
                    <div className="flex-1 flex flex-col items-center justify-center p-8 bg-slate-50/50 rounded-2xl border border-slate-100 text-center">
                      <p className="text-xs font-bold uppercase tracking-wider text-slate-500">No se encontraron registros de despachos</p>
                      <p className="text-[10px] text-slate-400 mt-0.5">No hay salidas completadas para este SKU.</p>
                    </div>
                  ) : (
                    <div className="space-y-4 flex-1">
                      {dispatchesList.map((disp, index) => {
                        const { remainingDays, pct, status } = calculateTvuStats(disp.fecha_vencimiento || '', selectedProduct.vida_util_dias);
                        return (
                          <div
                            key={disp.id}
                            className="p-5 rounded-2xl bg-white border border-slate-205 shadow-sm hover:shadow transition-all flex flex-col md:flex-row md:items-center justify-between gap-4 relative overflow-hidden"
                          >
                            <div className={`absolute top-0 bottom-0 left-0 w-1.5 ${
                              status === 'CRITICAL' ? 'bg-red-500' : status === 'WARNING' ? 'bg-amber-500' : 'bg-emerald-500'
                            }`} />

                            <div className="pl-2 space-y-1">
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className="px-2 py-0.5 rounded bg-orange-50 text-orange-700 font-mono text-[9px] font-bold uppercase tracking-wider">
                                  Salida {index + 1}
                                </span>
                                <span className="text-slate-400 font-mono text-[10px] font-semibold">
                                  {new Date(disp.fecha_operacion).toLocaleDateString()}
                                </span>
                              </div>
                              
                              <div className="text-xs font-bold text-slate-800">
                                Cantidad Cargada: <span className="text-slate-900 font-black">{disp.cantidad} u.</span>
                              </div>
                              
                              <div className="text-[10px] font-bold text-slate-500 flex items-center gap-1">
                                <span>{disp.extra_info}</span>
                                <span className="text-slate-350">•</span>
                                <span>Ejecutó: {disp.usuario}</span>
                              </div>
                            </div>

                            <div className="md:text-right flex items-center gap-4 bg-slate-50/50 p-3 md:bg-transparent md:p-0 rounded-xl border border-slate-100 md:border-none">
                              <div className="space-y-0.5">
                                <div className="text-[10px] uppercase font-black tracking-widest text-slate-500">
                                  Vence: <span className="text-slate-900 font-black">{disp.fecha_vencimiento || 'N/A'}</span>
                                </div>
                                <div className="text-xs font-semibold text-slate-500">
                                  Quedaron <span className={`font-black ${status === 'CRITICAL' ? 'text-red-600' : status === 'WARNING' ? 'text-amber-600' : 'text-emerald-700'}`}>{remainingDays}</span> días útiles
                                </div>
                                <div className="text-[10px] text-slate-400 font-medium">
                                  Cumplió con {pct}% de vida útil en despacho
                                </div>
                              </div>
                              
                              <div className={`w-11 h-11 rounded-full flex items-center justify-center font-black text-xs shadow-sm shadow-slate-100 ${
                                status === 'CRITICAL' 
                                  ? 'bg-red-50 text-red-600 border border-red-200' 
                                  : status === 'WARNING' 
                                  ? 'bg-amber-50 text-amber-600 border border-amber-200' 
                                  : 'bg-emerald-50 text-emerald-600 border border-emerald-250'
                              }`}>
                                {pct}%
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )
                )}

                {/* Footnote / Warning thresholds explaining TVU levels */}
                <div className="mt-6 p-4 rounded-2xl bg-indigo-50/40 border border-indigo-100/60 text-[11px] text-indigo-750 flex items-start gap-2.5">
                  <Info className="w-4 h-4 text-indigo-600 shrink-0 mt-0.5" />
                  <div>
                    <span className="font-bold uppercase tracking-wide block mb-0.5 text-indigo-900">Ayuda: Leyenda de Semáforos de TVU</span>
                    <span>El semáforo se define basado en la vida útil del artículo: </span>
                    <ul className="list-disc pl-4 mt-1 space-y-0.5 font-medium">
                      <li><strong className="text-rose-700">Crítico (0% - 30%):</strong> Requiere despacho prioritario inmediato o se encuentra observado debido a corta caducidad.</li>
                      <li><strong className="text-amber-700">Alerta (31% - 60%):</strong> Flujo rotacional continuo normal requerido.</li>
                      <li><strong className="text-emerald-700">Óptimo (61% - 100%):</strong> Excelente caducidad, apto para tramos largos/provincia.</li>
                    </ul>
                  </div>
                </div>

              </div>
            )}

          </div>
        </div>

      </div>
    </div>
  );
};
