import React, { useState, useEffect, useMemo } from 'react';
import { supabase } from '../supabaseClient';
import { Usuario, Product } from '../types';
import { 
  Search, RefreshCw, FileText, 
  Truck, User, Calendar, X, Save, FileSpreadsheet, Beaker, Pencil
} from './Icons';
import * as XLSX from 'xlsx';

const ExternalLinkIcon = ({ className }: { className?: string }) => (
  <svg className={className || "w-4 h-4"} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
  </svg>
);

const LinkIcon = ({ className }: { className?: string }) => (
  <svg className={className || "w-4 h-4"} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
  </svg>
);

interface EnsayosPickingProps {
  currentUser: Usuario | null;
  catalog?: Product[];
}

export interface EnsayoItem {
  id: string;
  documento: string;
  cliente: string;
  placa_vehiculo: string;
  codigo: string;
  descripcion: string;
  categoria: string;
  unidad_medida: string;
  cantidad_pedida: number;
  cantidad_despachada: number;
  estado: string;
  fecha_vencimiento: string | null;
  fecha_preparacion: string | null;
  subTipo: string;
  tipo_camara: string;
  url_documento?: string | null;
  cod_fecha: string;
}

export const EnsayosPicking: React.FC<EnsayosPickingProps> = ({ currentUser }) => {
  const [items, setItems] = useState<EnsayoItem[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [dateFilter, setDateFilter] = useState<string>(''); // YYYY-MM-DD
  const [selectedPlaca, setSelectedPlaca] = useState<string>('TODAS');

  // URL modal state
  const [editingItem, setEditingItem] = useState<EnsayoItem | null>(null);
  const [urlInput, setUrlInput] = useState<string>('');
  const [isSavingUrl, setIsSavingUrl] = useState<boolean>(false);

  // Local storage cache for URLs mapped by Cod Fecha or Item ID
  const [urlMap, setUrlMap] = useState<Record<string, string>>(() => {
    try {
      const stored = localStorage.getItem('smartrack_ensayos_urls');
      return stored ? JSON.parse(stored) : {};
    } catch (e) {
      return {};
    }
  });

  const fetchEnsayosData = async () => {
    setLoading(true);
    try {
      let query = supabase
        .from('despacho_encabezado')
        .select(`
          id,
          documento,
          cliente,
          placa_vehiculo,
          tipo_despacho,
          fecha_despacho,
          estado,
          despachos_item (*)
        `)
        .order('created_at', { ascending: false });

      if (currentUser?.sede_id) {
        query = query.eq('sede_id', currentUser.sede_id);
      }

      const { data, error } = await query;

      if (error) {
        console.error('Error fetching ensayos:', error);
        setLoading(false);
        return;
      }

      const ensayosList: EnsayoItem[] = [];

      (data || []).forEach((header: any) => {
        const headerItems = header.despachos_item || [];
        headerItems.forEach((item: any) => {
          const tipo_camara = String(item.tipo_camara || '');
          const subTipo = String(item.subTipo || '');
          const categoria = String(item.categoria || '');
          const descripcion = String(item.descripcion || '');
          const camara = String(item.camara || '');

          const isEnsayo = 
            tipo_camara.toUpperCase().includes('INFORME') ||
            tipo_camara.toUpperCase().includes('ENSAYO') ||
            subTipo.toUpperCase().includes('ENSAYO') ||
            categoria.toUpperCase().includes('ENSAYO') ||
            descripcion.toUpperCase().includes('ENSAYO') ||
            camara.toUpperCase().includes('INFORME') ||
            camara.toUpperCase().includes('ENSAYO') ||
            header.documento?.toUpperCase().includes('ENSAYO') ||
            header.cliente?.toUpperCase().includes('ENSAYO');

          if (isEnsayo) {
            const codigoIco = (item.codigo || item.sku || '').trim();
            const fechaVenc = item.fecha_vencimiento ? item.fecha_vencimiento.trim() : '';
            const codFecha = fechaVenc ? `${codigoIco} - ${fechaVenc}` : `${codigoIco} - S/F`;
            
            // Check stored URL priority: DB field -> LocalStorage by CodFecha -> LocalStorage by ItemId
            const storedUrl = item.url_documento || urlMap[codFecha] || urlMap[item.id] || '';

            ensayosList.push({
              id: item.id,
              documento: header.documento || 'S/D',
              cliente: header.cliente || 'CLIENTE S/N',
              placa_vehiculo: header.placa_vehiculo || 'SIN PLACA',
              codigo: codigoIco,
              descripcion: item.descripcion || 'PRODUCTO ENSAYO',
              categoria: item.categoria || 'ENSAYO',
              unidad_medida: item.unidad_medida || item.unidad || 'UND',
              cantidad_pedida: Number(item.cantidad_pedida) || 0,
              cantidad_despachada: Number(item.cantidad_despachada) || 0,
              estado: item.estado || 'PENDIENTE',
              fecha_vencimiento: item.fecha_vencimiento || null,
              fecha_preparacion: item.fecha_preparacion || header.fecha_despacho || null,
              subTipo,
              tipo_camara,
              url_documento: storedUrl,
              cod_fecha: codFecha
            });
          }
        });
      });

      setItems(ensayosList);
    } catch (e) {
      console.error('Exception fetching ensayos:', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchEnsayosData();
  }, [currentUser]);

  // Unique placas list
  const placas = useMemo(() => {
    const set = new Set<string>();
    items.forEach(i => {
      if (i.placa_vehiculo) set.add(i.placa_vehiculo);
    });
    return Array.from(set).sort();
  }, [items]);

  // Filtered items
  const filteredItems = useMemo(() => {
    return items.filter(item => {
      // Search
      const term = searchTerm.toLowerCase().trim();
      const matchSearch = !term || 
        item.codigo.toLowerCase().includes(term) ||
        item.descripcion.toLowerCase().includes(term) ||
        item.cliente.toLowerCase().includes(term) ||
        item.documento.toLowerCase().includes(term) ||
        item.placa_vehiculo.toLowerCase().includes(term) ||
        item.cod_fecha.toLowerCase().includes(term);

      // Placa
      const matchPlaca = selectedPlaca === 'TODAS' || item.placa_vehiculo === selectedPlaca;

      // Date filter
      let matchDate = true;
      if (dateFilter) {
        if (item.fecha_preparacion) {
          matchDate = item.fecha_preparacion.startsWith(dateFilter);
        } else {
          matchDate = false;
        }
      }

      return matchSearch && matchPlaca && matchDate;
    });
  }, [items, searchTerm, selectedPlaca, dateFilter]);

  // Handle URL Save
  const handleSaveUrl = async () => {
    if (!editingItem) return;
    setIsSavingUrl(true);
    const newUrl = urlInput.trim();

    try {
      // Update LocalStorage map by Cod Fecha and by Item ID
      const updatedMap = {
        ...urlMap,
        [editingItem.cod_fecha]: newUrl,
        [editingItem.id]: newUrl
      };
      setUrlMap(updatedMap);
      localStorage.setItem('smartrack_ensayos_urls', JSON.stringify(updatedMap));

      // Attempt DB update on despachos_item
      try {
        await supabase
          .from('despachos_item')
          .update({ url_documento: newUrl })
          .eq('id', editingItem.id);
      } catch (e) {
        // Fallback silently if column doesn't exist
      }

      // Update state in UI
      setItems(prev => prev.map(i => {
        if (i.cod_fecha === editingItem.cod_fecha || i.id === editingItem.id) {
          return { ...i, url_documento: newUrl };
        }
        return i;
      }));

      setEditingItem(null);
      setUrlInput('');
    } catch (e) {
      console.error('Error saving URL:', e);
    } finally {
      setIsSavingUrl(false);
    }
  };

  // Export to Excel
  const handleExportExcel = () => {
    const dataToExport = filteredItems.map(item => ({
      'Placa Vehículo': item.placa_vehiculo,
      'Documento / Pedido': item.documento,
      'Cliente': item.cliente,
      'Código ICO': item.codigo,
      'Producto': item.descripcion,
      'Cant. Pedida': item.cantidad_pedida,
      'Cant. Despachada': item.cantidad_despachada,
      'U.M.': item.unidad_medida,
      'Fecha Vencimiento': item.fecha_vencimiento || 'Sin fecha',
      'Cod Fecha': item.cod_fecha,
      'URL Documento': item.url_documento || 'No asignado',
      'Estado': item.estado
    }));

    const worksheet = XLSX.utils.json_to_sheet(dataToExport);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Ensayos Picking');
    XLSX.writeFile(workbook, `Ensayos_Picking_${new Date().toISOString().slice(0, 10)}.xlsx`);
  };

  // KPI calculations
  const totalEnsayos = filteredItems.length;
  const totalConVencimiento = filteredItems.filter(i => i.fecha_vencimiento).length;
  const totalConUrl = filteredItems.filter(i => i.url_documento).length;
  const totalClientes = new Set(filteredItems.map(i => i.cliente)).size;

  return (
    <div className="p-4 sm:p-6 space-y-6 max-w-[1600px] mx-auto text-slate-800 dark:text-slate-100">
      {/* HEADER SECTION */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white dark:bg-slate-900 p-5 rounded-2xl border border-zinc-200/80 dark:border-slate-800 shadow-sm">
        <div className="flex items-center gap-3">
          <div className="p-3 bg-amber-500/10 text-amber-600 dark:text-amber-400 rounded-2xl border border-amber-500/20">
            <Beaker className="w-6 h-6" />
          </div>
          <div>
            <h1 className="text-xl sm:text-2xl font-black uppercase tracking-tight text-slate-900 dark:text-white">
              ENSAYOS DE PICKING
            </h1>
            <p className="text-xs font-bold text-slate-400 dark:text-slate-500">
              Control e información de productos tipo Ensayo / Informe con Cod Fecha y URL
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={fetchEnsayosData}
            disabled={loading}
            className="flex items-center gap-2 px-3.5 py-2.5 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 text-xs font-bold rounded-xl transition-all"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            <span>Actualizar</span>
          </button>

          <button
            onClick={handleExportExcel}
            className="flex items-center gap-2 px-3.5 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-xl shadow-sm transition-all"
          >
            <FileSpreadsheet className="w-4 h-4" />
            <span>Excel</span>
          </button>
        </div>
      </div>

      {/* KPI METRICS */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4">
        <div className="p-4 bg-white dark:bg-slate-900 rounded-2xl border border-zinc-200/80 dark:border-slate-800 flex items-center justify-between">
          <div>
            <span className="text-[10px] font-black uppercase tracking-wider text-slate-400">Total Ensayos</span>
            <p className="text-xl sm:text-2xl font-black text-slate-900 dark:text-white mt-0.5">{totalEnsayos}</p>
          </div>
          <div className="p-3 bg-amber-500/10 text-amber-600 rounded-xl">
            <Beaker className="w-5 h-5" />
          </div>
        </div>

        <div className="p-4 bg-white dark:bg-slate-900 rounded-2xl border border-zinc-200/80 dark:border-slate-800 flex items-center justify-between">
          <div>
            <span className="text-[10px] font-black uppercase tracking-wider text-slate-400">Con Vencimiento</span>
            <p className="text-xl sm:text-2xl font-black text-emerald-600 dark:text-emerald-400 mt-0.5">{totalConVencimiento}</p>
          </div>
          <div className="p-3 bg-emerald-500/10 text-emerald-600 rounded-xl">
            <Calendar className="w-5 h-5" />
          </div>
        </div>

        <div className="p-4 bg-white dark:bg-slate-900 rounded-2xl border border-zinc-200/80 dark:border-slate-800 flex items-center justify-between">
          <div>
            <span className="text-[10px] font-black uppercase tracking-wider text-slate-400">Con URL Documento</span>
            <p className="text-xl sm:text-2xl font-black text-sky-600 dark:text-sky-400 mt-0.5">{totalConUrl}</p>
          </div>
          <div className="p-3 bg-sky-500/10 text-sky-600 rounded-xl">
            <FileText className="w-5 h-5" />
          </div>
        </div>

        <div className="p-4 bg-white dark:bg-slate-900 rounded-2xl border border-zinc-200/80 dark:border-slate-800 flex items-center justify-between">
          <div>
            <span className="text-[10px] font-black uppercase tracking-wider text-slate-400">Clientes Atendidos</span>
            <p className="text-xl sm:text-2xl font-black text-indigo-600 dark:text-indigo-400 mt-0.5">{totalClientes}</p>
          </div>
          <div className="p-3 bg-indigo-500/10 text-indigo-600 rounded-xl">
            <User className="w-5 h-5" />
          </div>
        </div>
      </div>

      {/* FILTERS TOOLBAR */}
      <div className="p-4 bg-white dark:bg-slate-900 rounded-2xl border border-zinc-200/80 dark:border-slate-800 space-y-3 sm:space-y-0 sm:flex sm:items-center sm:gap-4">
        <div className="relative flex-1">
          <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Buscar por Código, Producto, Cod Fecha, Cliente, Placa o Documento..."
            className="w-full pl-10 pr-4 py-2.5 bg-slate-50 dark:bg-slate-800/80 border border-zinc-200 dark:border-slate-700 rounded-xl text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-[#009ED6]"
          />
        </div>

        <div className="flex items-center gap-2">
          {/* Placa Filter */}
          <select
            value={selectedPlaca}
            onChange={(e) => setSelectedPlaca(e.target.value)}
            className="px-3 py-2.5 bg-slate-50 dark:bg-slate-800/80 border border-zinc-200 dark:border-slate-700 rounded-xl text-xs font-bold text-slate-700 dark:text-slate-200 focus:outline-none"
          >
            <option value="TODAS">Placas (Todas)</option>
            {placas.map(p => (
              <option key={p} value={p}>{p}</option>
            ))}
          </select>

          {/* Date Filter */}
          <input
            type="date"
            value={dateFilter}
            onChange={(e) => setDateFilter(e.target.value)}
            className="px-3 py-2.5 bg-slate-50 dark:bg-slate-800/80 border border-zinc-200 dark:border-slate-700 rounded-xl text-xs font-bold text-slate-700 dark:text-slate-200 focus:outline-none"
          />

          {dateFilter && (
            <button
              onClick={() => setDateFilter('')}
              className="px-2.5 py-2.5 bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-300 rounded-xl text-xs font-bold"
              title="Limpiar fecha"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>

      {/* TABLE / CARDS SECTION */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-zinc-200/80 dark:border-slate-800 overflow-hidden shadow-sm">
        {loading ? (
          <div className="p-12 text-center text-slate-400 space-y-3">
            <RefreshCw className="w-8 h-8 animate-spin mx-auto text-[#009ED6]" />
            <p className="text-xs font-bold uppercase tracking-wider">Cargando datos de Ensayos...</p>
          </div>
        ) : filteredItems.length === 0 ? (
          <div className="p-12 text-center text-slate-400 space-y-2">
            <Beaker className="w-10 h-10 mx-auto text-slate-300 dark:text-slate-700" />
            <p className="text-sm font-black text-slate-600 dark:text-slate-300 uppercase">Sin resultados de Ensayos</p>
            <p className="text-xs font-semibold text-slate-400">No se encontraron registros de Ensayos con los filtros actuales.</p>
          </div>
        ) : (
          <>
            {/* DESKTOP TABLE */}
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-slate-50 dark:bg-slate-800/50 text-[10px] font-black uppercase text-slate-400 tracking-wider border-b border-zinc-100 dark:border-slate-800">
                    <th className="p-4">Placa / Doc</th>
                    <th className="p-4">Cliente</th>
                    <th className="p-4">Código ICO</th>
                    <th className="p-4">Producto</th>
                    <th className="p-4 text-center">Cant. Ped / Desp</th>
                    <th className="p-4">F. Vencimiento</th>
                    <th className="p-4 bg-amber-50/50 dark:bg-amber-950/20 text-amber-700 dark:text-amber-400 font-black">
                      Cod Fecha
                    </th>
                    <th className="p-4 text-center">Documento URL</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-100 dark:divide-slate-800/80 text-xs font-semibold">
                  {filteredItems.map((item, idx) => (
                    <tr key={item.id || idx} className="hover:bg-slate-50/80 dark:hover:bg-slate-800/40 transition-colors">
                      <td className="p-4">
                        <div className="flex flex-col">
                          <span className="font-black text-slate-800 dark:text-white flex items-center gap-1">
                            <Truck className="w-3.5 h-3.5 text-slate-400" />
                            {item.placa_vehiculo}
                          </span>
                          <span className="text-[10px] font-mono text-slate-400">{item.documento}</span>
                        </div>
                      </td>

                      <td className="p-4 font-bold text-slate-700 dark:text-slate-300 max-w-[200px] truncate" title={item.cliente}>
                        {item.cliente}
                      </td>

                      <td className="p-4 font-mono font-bold text-[#009ED6]">
                        {item.codigo}
                      </td>

                      <td className="p-4 font-bold text-slate-800 dark:text-white uppercase max-w-[260px]">
                        {item.descripcion}
                      </td>

                      <td className="p-4 text-center">
                        <span className="inline-flex items-center gap-1 px-2.5 py-1 bg-slate-100 dark:bg-slate-800 rounded-lg text-xs font-black">
                          <span className="text-slate-900 dark:text-white">{item.cantidad_despachada}</span>
                          <span className="text-slate-400">/</span>
                          <span className="text-slate-500">{item.cantidad_pedida} {item.unidad_medida}</span>
                        </span>
                      </td>

                      <td className="p-4">
                        {item.fecha_vencimiento ? (
                          <span className="inline-block px-2.5 py-1 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 font-mono font-bold rounded-lg text-xs">
                            {item.fecha_vencimiento}
                          </span>
                        ) : (
                          <span className="text-slate-400 italic text-[11px]">Sin Fecha</span>
                        )}
                      </td>

                      <td className="p-4 bg-amber-50/30 dark:bg-amber-950/10">
                        <span className="inline-block px-2.5 py-1 bg-amber-500/15 text-amber-800 dark:text-amber-300 font-mono font-black text-xs rounded-lg border border-amber-500/20">
                          {item.cod_fecha}
                        </span>
                      </td>

                      <td className="p-4 text-center">
                        {item.url_documento ? (
                          <div className="flex items-center justify-center gap-2">
                            <a
                              href={item.url_documento}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-sky-50 hover:bg-sky-100 dark:bg-sky-950/40 dark:hover:bg-sky-900/60 text-sky-700 dark:text-sky-300 rounded-xl font-bold text-xs border border-sky-200 dark:border-sky-800 transition-all"
                            >
                              <ExternalLinkIcon className="w-3.5 h-3.5" />
                              <span>Ver URL</span>
                            </a>
                            <button
                              onClick={() => {
                                setEditingItem(item);
                                setUrlInput(item.url_documento || '');
                              }}
                              className="p-1.5 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 rounded-lg transition-all"
                              title="Editar URL"
                            >
                              <Pencil className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        ) : (
                          <button
                            onClick={() => {
                              setEditingItem(item);
                              setUrlInput('');
                            }}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 rounded-xl font-bold text-xs transition-all border border-zinc-200 dark:border-slate-700"
                          >
                            <LinkIcon className="w-3.5 h-3.5 text-[#009ED6]" />
                            <span>+ Asignar URL</span>
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* MOBILE CARDS VIEW */}
            <div className="md:hidden divide-y divide-zinc-100 dark:divide-slate-800">
              {filteredItems.map((item, idx) => (
                <div key={item.id || idx} className="p-4 space-y-3">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <span className="text-[10px] font-mono text-slate-400">PLACA: {item.placa_vehiculo} | DOC: {item.documento}</span>
                      <h3 className="text-sm font-black text-slate-900 dark:text-white uppercase leading-snug">{item.descripcion}</h3>
                      <p className="text-xs font-bold text-slate-500 mt-0.5">{item.cliente}</p>
                    </div>

                    <span className="px-2 py-0.5 bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-mono font-black text-xs rounded">
                      {item.codigo}
                    </span>
                  </div>

                  <div className="p-2.5 bg-amber-50 dark:bg-amber-950/20 border border-amber-200/60 dark:border-amber-900/40 rounded-xl space-y-1">
                    <div className="text-[10px] font-black uppercase text-amber-700 dark:text-amber-400">Cod Fecha:</div>
                    <div className="font-mono font-black text-xs text-amber-900 dark:text-amber-200">{item.cod_fecha}</div>
                  </div>

                  <div className="flex items-center justify-between text-xs pt-1">
                    <div>
                      <span className="text-[10px] font-bold text-slate-400 block">Vencimiento:</span>
                      <span className="font-mono font-bold text-slate-700 dark:text-slate-200">
                        {item.fecha_vencimiento || 'Sin Fecha'}
                      </span>
                    </div>

                    <div className="text-right">
                      <span className="text-[10px] font-bold text-slate-400 block">Cantidad:</span>
                      <span className="font-bold text-slate-900 dark:text-white">
                        {item.cantidad_despachada} / {item.cantidad_pedida} {item.unidad_medida}
                      </span>
                    </div>
                  </div>

                  <div className="pt-2 border-t border-zinc-100 dark:border-slate-800 flex justify-end">
                    {item.url_documento ? (
                      <div className="flex items-center gap-2">
                        <a
                          href={item.url_documento}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-sky-50 text-sky-700 dark:bg-sky-950/50 dark:text-sky-300 rounded-xl font-bold text-xs border border-sky-200 dark:border-sky-800"
                        >
                          <ExternalLinkIcon className="w-3.5 h-3.5" />
                          <span>Ver Documento</span>
                        </a>
                        <button
                          onClick={() => {
                            setEditingItem(item);
                            setUrlInput(item.url_documento || '');
                          }}
                          className="p-1.5 bg-slate-100 text-slate-600 rounded-lg text-xs"
                        >
                          <Pencil className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={() => {
                          setEditingItem(item);
                          setUrlInput('');
                        }}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-slate-100 dark:bg-slate-800 text-slate-800 dark:text-slate-200 rounded-xl font-bold text-xs"
                      >
                        <LinkIcon className="w-3.5 h-3.5 text-[#009ED6]" />
                        <span>+ Asignar URL</span>
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </div>

      {/* MODAL TO EDIT / ASSIGN URL */}
      {editingItem && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4">
          <div className="w-full max-w-lg bg-white dark:bg-slate-900 rounded-2xl border border-zinc-200 dark:border-slate-800 shadow-2xl overflow-hidden p-6 space-y-5 animate-in fade-in zoom-in duration-150">
            <div className="flex items-center justify-between border-b border-zinc-100 dark:border-slate-800 pb-3">
              <div className="flex items-center gap-2.5 text-[#009ED6]">
                <LinkIcon className="w-5 h-5" />
                <h3 className="text-base font-black uppercase text-slate-900 dark:text-white">
                  Asignar URL de Documento
                </h3>
              </div>
              <button
                onClick={() => setEditingItem(null)}
                className="p-1.5 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg text-slate-400"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-3">
              <div className="p-3 bg-slate-50 dark:bg-slate-800/60 rounded-xl space-y-1 text-xs">
                <p className="font-bold text-slate-800 dark:text-white uppercase">{editingItem.descripcion}</p>
                <p className="font-mono text-slate-500">CÓDIGO ICO: <span className="text-[#009ED6] font-bold">{editingItem.codigo}</span></p>
                <p className="font-mono text-amber-700 dark:text-amber-400 font-black">COD FECHA: {editingItem.cod_fecha}</p>
              </div>

              <div>
                <label className="block text-xs font-black uppercase tracking-wider text-slate-600 dark:text-slate-300 mb-1.5">
                  URL del Documento / Certificado
                </label>
                <input
                  type="url"
                  value={urlInput}
                  onChange={(e) => setUrlInput(e.target.value)}
                  placeholder="https://ejemplo.com/documento-ensayo.pdf"
                  className="w-full px-3.5 py-2.5 bg-slate-50 dark:bg-slate-800 border border-zinc-200 dark:border-slate-700 rounded-xl text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-[#009ED6]"
                />
                <p className="text-[10px] text-slate-400 mt-1">
                  Ingrese la URL del documento asociado a este Cod Fecha ({editingItem.cod_fecha}).
                </p>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-zinc-100 dark:border-slate-800">
              <button
                type="button"
                onClick={() => setEditingItem(null)}
                className="px-4 py-2 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300 text-xs font-bold rounded-xl transition-all"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleSaveUrl}
                disabled={isSavingUrl}
                className="flex items-center gap-2 px-5 py-2 bg-[#009ED6] hover:bg-[#0089ba] text-white text-xs font-bold rounded-xl shadow-sm transition-all"
              >
                {isSavingUrl ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                <span>Guardar URL</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default EnsayosPicking;
