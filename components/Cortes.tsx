import React, { useState, useEffect, useMemo, useRef } from 'react';
import { supabase } from '../supabaseClient';
import { Product, Usuario, Cliente } from '../types';
import { Search, ClipboardList, CheckCircle2, History, ChevronLeft, ChevronRight, RefreshCw, Layers, User, Plus, X, CreditCard, Phone, MapPin } from 'lucide-react';

interface CortesProps {
  catalog: Product[];
  currentUser: Usuario | null;
}

interface PedidoCorte {
  id: string;
  producto_id: string | null;
  codigo: string;
  nombre: string;
  cantidad: number;
  unidad_medida: string;
  usuario_registro: string;
  fecha_registro: string;
  sede_id: string | null;
  cliente_id?: string | null;
  cliente_nombre?: string | null;
}

export const Cortes: React.FC<CortesProps> = ({ catalog, currentUser }) => {
  const [activeTab, setActiveTab] = useState<'FORM' | 'HISTORY'>('FORM');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const isSubmittingRef = useRef(false);

  // Robust date/time helper for responsive design
  const formatDateTime = (dateStr: string) => {
    if (!dateStr) return { date: '', time: '' };
    try {
      const d = new Date(dateStr);
      if (isNaN(d.getTime())) return { date: dateStr, time: '' };
      
      const pad = (n: number) => n.toString().padStart(2, '0');
      
      const day = pad(d.getDate());
      const month = pad(d.getMonth() + 1);
      const fullYear = d.getFullYear();

      let hours = d.getHours();
      const minutes = pad(d.getMinutes());
      const ampm = hours >= 12 ? 'PM' : 'AM';
      hours = hours % 12;
      hours = hours ? hours : 12; // the hour '0' should be '12'
      
      return {
        date: `${day}/${month}/${fullYear}`,
        time: `${pad(hours)}:${minutes} ${ampm}`
      };
    } catch (e) {
      return { date: dateStr, time: '' };
    }
  };

  // Form states
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [quantity, setQuantity] = useState<number | ''>('');

  // Cliente selection states
  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [clientSearchTerm, setClientSearchTerm] = useState('');
  const [selectedCliente, setSelectedCliente] = useState<Cliente | null>(null);
  const [isClientDropdownOpen, setIsClientDropdownOpen] = useState(false);
  const clientDropdownRef = useRef<HTMLDivElement>(null);

  // Cliente creation modal states (ASISTENTE only)
  const [isClientModalOpen, setIsClientModalOpen] = useState(false);
  const [newClientNombre, setNewClientNombre] = useState('');
  const [newClientDocumento, setNewClientDocumento] = useState('');
  const [newClientTelefono, setNewClientTelefono] = useState('');
  const [newClientDireccion, setNewClientDireccion] = useState('');
  const [isSavingClient, setIsSavingClient] = useState(false);

  const fetchClientesList = async (searchVal?: string) => {
    try {
      let query = supabase.from('clientes').select('*');
      if (currentUser?.sede_id) {
        query = query.or(`sede_id.eq.${currentUser.sede_id},sede_id.is.null`);
      }
      
      const term = (searchVal || '').trim();
      if (term) {
        query = query.or(`nombre.ilike.%${term}%,documento.ilike.%${term}%`);
      }
      
      const { data, error } = await query.order('nombre', { ascending: true }).limit(100);
      if (error) throw error;
      
      if (data) {
        setClientes(data);
      }
    } catch (err) {
      console.error("Error loading clients in Cortes:", err);
    }
  };

  useEffect(() => {
    const delayDebounceFn = setTimeout(() => {
      fetchClientesList(clientSearchTerm);
    }, 250);

    return () => clearTimeout(delayDebounceFn);
  }, [clientSearchTerm, currentUser]);

  const filteredClientes = useMemo(() => {
    const term = clientSearchTerm.toLowerCase().trim();
    if (!term || (selectedCliente && term === selectedCliente.nombre.toLowerCase().trim())) {
      return clientes;
    }
    return clientes.filter(c => {
      const nombreNorm = (c.nombre || '').toLowerCase();
      const docNorm = (c.documento || '').toLowerCase();
      return nombreNorm.includes(term) || docNorm.includes(term);
    });
  }, [clientes, clientSearchTerm, selectedCliente]);

  useEffect(() => {
    const handleClickOutsideClient = (event: MouseEvent) => {
      if (clientDropdownRef.current && !clientDropdownRef.current.contains(event.target as Node)) {
        setIsClientDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutsideClient);
    return () => document.removeEventListener('mousedown', handleClickOutsideClient);
  }, []);

  const handleQuickCreateCliente = async (e: React.FormEvent) => {
    e.preventDefault();
    if (currentUser?.rol !== 'ASISTENTE') {
      alert('Solo los usuarios con rol de ASISTENTE pueden crear clientes.');
      return;
    }

    if (!newClientNombre.trim()) {
      alert('Por favor ingrese el nombre del cliente.');
      return;
    }

    setIsSavingClient(true);
    try {
      const newClienteData = {
        nombre: newClientNombre.trim(),
        documento: newClientDocumento.trim() || null,
        telefono: newClientTelefono.trim() || null,
        direccion: newClientDireccion.trim() || null,
        sede_id: currentUser?.sede_id || null
      };

      const { data, error } = await supabase
        .from('clientes')
        .insert([newClienteData])
        .select();

      if (error) throw error;

      if (data && data[0]) {
        const created: Cliente = data[0];
        setClientes(prev => [...prev, created].sort((a, b) => a.nombre.localeCompare(b.nombre)));
        setSelectedCliente(created);
        setClientSearchTerm(created.nombre);
        setIsClientDropdownOpen(false);
      }

      alert('Cliente registrado con éxito.');
      
      setNewClientNombre('');
      setNewClientDocumento('');
      setNewClientTelefono('');
      setNewClientDireccion('');
      setIsClientModalOpen(false);

      fetchClientesList();
    } catch (err: any) {
      console.error('Error creating client in Cortes:', err);
      alert('Error registrando cliente: ' + err.message);
    } finally {
      setIsSavingClient(false);
    }
  };
  
  // Modal states for success summary
  const [showSuccessModal, setShowSuccessModal] = useState(false);
  const [lastSubmittedPedido, setLastSubmittedPedido] = useState<{
    codigo: string;
    nombre: string;
    cantidad: number;
    unidad_medida: string;
    usuario: string;
    fecha: string;
    cliente_nombre?: string;
  } | null>(null);

  // History states
  const [history, setHistory] = useState<PedidoCorte[]>([]);
  const [isLoadingHistory, setIsLoadingHistory] = useState(false);
  const [historySearch, setHistorySearch] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 10;

  // Filtered dropdown results
  const filteredProducts = useMemo(() => {
    if (!searchTerm.trim()) return [];
    const term = searchTerm.toLowerCase();
    return catalog.filter(p => 
      p.nombre.toLowerCase().includes(term) || 
      p.codigo.toLowerCase().includes(term)
    ).slice(0, 8); // Limit to top 8 suggestions
  }, [catalog, searchTerm]);

  // Handle outside click to close dropdown
  const dropdownRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleSelectProduct = (product: Product) => {
    setSelectedProduct(product);
    setSearchTerm(`${product.codigo} - ${product.nombre}`);
    setIsDropdownOpen(false);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedProduct) {
      alert("Por favor seleccione un producto del catálogo.");
      return;
    }
    if (!selectedCliente) {
      alert("Por favor busque y seleccione un cliente (Campo obligatorio).");
      return;
    }
    if (quantity === '' || quantity <= 0) {
      alert("Por favor ingrese una cantidad válida mayor a 0.");
      return;
    }

    if (isSubmittingRef.current) return;
    isSubmittingRef.current = true;
    setIsSubmitting(true);

    const uom = selectedProduct.unidad_venta || 'UN';

    const newPedido = {
      producto_id: selectedProduct.id,
      codigo: selectedProduct.codigo,
      nombre: selectedProduct.nombre,
      cantidad: Number(quantity),
      unidad_medida: uom,
      usuario_registro: currentUser?.nombre || 'Call Center',
      sede_id: currentUser?.sede_id || null,
      cliente_id: selectedCliente.id,
      cliente_nombre: selectedCliente.nombre
    };

    // Asynchronous Feedback: Show success confirmation immediately to avoid perceived delay!
    setLastSubmittedPedido({
      codigo: selectedProduct.codigo,
      nombre: selectedProduct.nombre,
      cantidad: Number(quantity),
      unidad_medida: uom,
      usuario: currentUser?.nombre || 'Call Center',
      cliente_nombre: selectedCliente.nombre,
      fecha: new Date().toLocaleDateString('es-PE', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: true
      })
    });

    // Clear Form state right away
    setSelectedProduct(null);
    setSearchTerm('');
    setSelectedCliente(null);
    setClientSearchTerm('');
    setQuantity('');
    setShowSuccessModal(true);

    // Background push to Supabase to prevent locking/delays
    (async () => {
      try {
        const { error } = await supabase.from('pedidos_corte').insert([newPedido]);
        isSubmittingRef.current = false;
        setIsSubmitting(false);
        
        if (error) {
          console.error("Error creating cut order asynchronously:", error);
        } else {
          // Refresh history automatically
          fetchHistory();
        }
      } catch (err) {
        isSubmittingRef.current = false;
        setIsSubmitting(false);
        console.error("Unhandled error creating cut order asynchronously:", err);
      }
    })();
  };

  const fetchHistory = async () => {
    setIsLoadingHistory(true);
    try {
      let query = supabase
        .from('pedidos_corte')
        .select('*');
      
      const sedeId = currentUser?.sede_id;
      if (sedeId) {
        query = query.eq('sede_id', sedeId);
      }

      const { data, error } = await query.order('fecha_registro', { ascending: false });
      if (error) throw error;

      setHistory(data || []);
    } catch (err) {
      console.error("Error loading cut history:", err);
    } finally {
      setIsLoadingHistory(false);
    }
  };

  useEffect(() => {
    fetchHistory();
  }, [currentUser]);

  // Filter history list
  const filteredHistory = useMemo(() => {
    if (!historySearch.trim()) return history;
    const term = historySearch.toLowerCase();
    return history.filter(p => 
      p.nombre.toLowerCase().includes(term) || 
      p.codigo.toLowerCase().includes(term) ||
      p.usuario_registro.toLowerCase().includes(term)
    );
  }, [history, historySearch]);

  const totalPages = Math.ceil(filteredHistory.length / itemsPerPage);
  const paginatedHistory = useMemo(() => {
    const start = (currentPage - 1) * itemsPerPage;
    return filteredHistory.slice(start, start + itemsPerPage);
  }, [filteredHistory, currentPage]);

  const handlePageChange = (page: number) => {
    if (page >= 1 && page <= totalPages) {
      setCurrentPage(page);
    }
  };

  return (
    <div className="flex flex-col flex-1 h-full max-w-7xl mx-auto p-2 sm:p-6 space-y-4 sm:space-y-6">
      {/* HEADER SECTION */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 bg-white dark:bg-slate-900 p-4 sm:p-6 rounded-2xl sm:rounded-3xl border border-zinc-100 dark:border-slate-800 shadow-sm">
        <div className="flex items-center gap-3 sm:gap-4">
          <div className="p-2 sm:p-3.5 bg-[#009ED6]/10 text-[#009ED6] rounded-xl sm:rounded-2xl shrink-0">
            <ClipboardList className="w-6 h-6 sm:w-8 sm:h-8" />
          </div>
          <div className="min-w-0">
            <h1 className="text-base sm:text-2xl font-black text-slate-800 dark:text-white tracking-tighter uppercase truncate">PEDIDOS DE CORTE</h1>
            <p className="text-[9px] sm:text-xs text-slate-400 dark:text-slate-500 font-bold uppercase tracking-wider truncate">CORTES DE QUESOS Y EMBUTIDOS / CARNES</p>
          </div>
        </div>

        {/* TAB NAVIGATION */}
        <div className="flex p-1 bg-slate-50 dark:bg-slate-800 rounded-xl sm:rounded-2xl w-full md:w-auto">
          <button
            onClick={() => setActiveTab('FORM')}
            className={`flex-1 md:flex-none flex items-center justify-center gap-1.5 sm:gap-2 px-3 sm:px-6 py-2.5 sm:py-3 rounded-lg sm:rounded-xl text-[10px] sm:text-xs font-black tracking-wider uppercase transition-all duration-200 ${
              activeTab === 'FORM'
                ? 'bg-[#009ED6] text-white shadow-md'
                : 'text-slate-500 hover:text-slate-800 dark:text-slate-400'
            }`}
          >
            <ClipboardList className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
            REGISTRAR
          </button>
          <button
            onClick={() => {
              setActiveTab('HISTORY');
              fetchHistory();
            }}
            className={`flex-1 md:flex-none flex items-center justify-center gap-1.5 sm:gap-2 px-3 sm:px-6 py-2.5 sm:py-3 rounded-lg sm:rounded-xl text-[10px] sm:text-xs font-black tracking-wider uppercase transition-all duration-200 ${
              activeTab === 'HISTORY'
                ? 'bg-[#009ED6] text-white shadow-md'
                : 'text-slate-500 hover:text-slate-800 dark:text-slate-400'
            }`}
          >
            <History className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
            HISTORIAL
          </button>
        </div>
      </div>

      {/* FORM TAB */}
      {activeTab === 'FORM' && (
        <div className="bg-white dark:bg-slate-900 p-4 sm:p-8 rounded-2xl sm:rounded-3xl border border-zinc-100 dark:border-slate-800 shadow-sm max-w-2xl mx-auto w-full animate-fade-in relative z-20">
          <h2 className="text-sm sm:text-lg font-black text-slate-800 dark:text-white uppercase mb-4 sm:mb-6 tracking-tight flex items-center gap-2">
            <Layers className="w-5 h-5 text-[#009ED6]" />
            Nuevo Pedido de Corte
          </h2>

          <form onSubmit={handleSubmit} className="space-y-6">
            {/* BUSCADOR DE CLIENTE (OBLIGATORIO) */}
            <div className="space-y-1 relative" ref={clientDropdownRef}>
              <div className="flex justify-between items-center ml-1">
                <label className="text-[10px] font-black text-slate-400 uppercase block">Cliente / Destinatario *</label>
                {currentUser?.rol === 'ASISTENTE' && (
                  <button
                    type="button"
                    onClick={() => setIsClientModalOpen(true)}
                    className="flex items-center gap-1 text-[10px] font-black uppercase text-[#009ED6] hover:text-[#0089ba] tracking-wide cursor-pointer transition-all hover:scale-105 active:scale-95"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    Registrar Cliente
                  </button>
                )}
              </div>
              <div className="relative">
                <input
                  type="text"
                  required
                  placeholder="Buscar cliente por nombre..."
                  value={clientSearchTerm}
                  onChange={(e) => {
                    setClientSearchTerm(e.target.value);
                    setIsClientDropdownOpen(true);
                    if (selectedCliente && e.target.value !== selectedCliente.nombre) {
                      setSelectedCliente(null);
                    }
                  }}
                  onFocus={() => setIsClientDropdownOpen(true)}
                  className="w-full p-3 sm:p-4 pl-10 sm:pl-12 bg-slate-50 dark:bg-slate-800 dark:text-white rounded-2xl font-bold text-xs sm:text-sm border-none outline-none focus:ring-2 focus:ring-[#009ED6]/50 uppercase"
                />
                <User className="absolute left-3.5 sm:left-4 top-1/2 -translate-y-1/2 text-[#009ED6] w-4 h-4 sm:w-5 sm:h-5" />
                {selectedCliente && (
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedCliente(null);
                      setClientSearchTerm('');
                    }}
                    className="absolute right-2 sm:right-4 top-1/2 -translate-y-1/2 text-[10px] sm:text-xs font-black text-rose-500 bg-rose-50 dark:bg-rose-950/40 px-2.5 sm:px-3 py-1 sm:py-1.5 rounded-lg sm:rounded-xl uppercase hover:bg-rose-100"
                  >
                    Borrar
                  </button>
                )}
              </div>

              {/* CLIENT DROPDOWN */}
              {isClientDropdownOpen && filteredClientes.length > 0 && (
                <div className="absolute left-0 right-0 mt-2 bg-white dark:bg-slate-800 border border-zinc-100 dark:border-slate-700 rounded-2xl shadow-xl max-h-64 overflow-y-auto z-50 divide-y divide-zinc-50 dark:divide-slate-700/80">
                  {filteredClientes.map((c) => (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => {
                        setSelectedCliente(c);
                        setClientSearchTerm(c.nombre);
                        setIsClientDropdownOpen(false);
                      }}
                      className="w-full text-left p-4 hover:bg-slate-50 dark:hover:bg-slate-700/50 flex flex-col transition-colors duration-150"
                    >
                      <span className="text-sm font-black text-slate-700 dark:text-white leading-none uppercase">{c.nombre}</span>
                      <span className="text-[10px] font-bold text-zinc-400 dark:text-slate-400 mt-1 uppercase">
                        {c.documento ? `RUC/DOC: ${c.documento}` : 'SIN DOCUMENTO'} {c.telefono ? `| TEL: ${c.telefono}` : ''}
                      </span>
                    </button>
                  ))}
                </div>
              )}
              {isClientDropdownOpen && clientSearchTerm.trim() !== '' && filteredClientes.length === 0 && (
                <div className="absolute left-0 right-0 mt-2 bg-white dark:bg-slate-800 border border-zinc-100 dark:border-slate-700 rounded-2xl shadow-xl p-4 text-center text-xs text-slate-400 font-bold z-50">
                  No se encontraron clientes con "{clientSearchTerm}".
                </div>
              )}
            </div>

            {/* BUSCADOR DE PRODUCTO COMPLETO */}
            <div className="space-y-1 relative" ref={dropdownRef}>
              <label className="text-[10px] font-black text-slate-400 uppercase ml-1">Producto (EAN / Código / Nombre) *</label>
              <div className="relative">
                <input
                  type="text"
                  required
                  placeholder="Ingrese código o sople nombre para buscar..."
                  value={searchTerm}
                  onChange={(e) => {
                    setSearchTerm(e.target.value);
                    setIsDropdownOpen(true);
                    if (selectedProduct && e.target.value !== `${selectedProduct.codigo} - ${selectedProduct.nombre}`) {
                      setSelectedProduct(null);
                    }
                  }}
                  onFocus={() => setIsDropdownOpen(true)}
                  className="w-full p-3 sm:p-4 pl-10 sm:pl-12 bg-slate-50 dark:bg-slate-800 dark:text-white rounded-2xl font-bold text-xs sm:text-sm border-none outline-none focus:ring-2 focus:ring-[#009ED6]/50"
                />
                <Search className="absolute left-3.5 sm:left-4 top-1/2 -translate-y-1/2 text-slate-400 w-4 h-4 sm:w-5 sm:h-5" />
                {selectedProduct && (
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedProduct(null);
                      setSearchTerm('');
                    }}
                    className="absolute right-2 sm:right-4 top-1/2 -translate-y-1/2 text-[10px] sm:text-xs font-black text-rose-500 bg-rose-50 dark:bg-rose-950/40 px-2.5 sm:px-3 py-1 sm:py-1.5 rounded-lg sm:rounded-xl uppercase hover:bg-rose-100"
                  >
                    Borrar
                  </button>
                )}
              </div>

              {/* DROPDOWN */}
              {isDropdownOpen && filteredProducts.length > 0 && (
                <div className="absolute left-0 right-0 mt-2 bg-white dark:bg-slate-800 border border-zinc-100 dark:border-slate-700 rounded-2xl shadow-xl max-h-64 overflow-y-auto z-50 divide-y divide-zinc-50 dark:divide-slate-700/80">
                  {filteredProducts.map((p) => (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => handleSelectProduct(p)}
                      className="w-full text-left p-4 hover:bg-slate-50 dark:hover:bg-slate-700/50 flex flex-col transition-colors duration-150"
                    >
                      <span className="text-sm font-black text-slate-700 dark:text-white leading-none">{p.nombre}</span>
                      <span className="text-[10px] font-bold text-zinc-400 dark:text-slate-400 mt-1 uppercase">CÓDIGO: {p.codigo} | SKU: {p.sku || 'SIN EAN'}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* PRODUCT DETAIL READ-ONLY PREVIEW */}
            {selectedProduct && (
              <div className="grid grid-cols-2 gap-4 p-4 bg-emerald-500/5 border border-emerald-500/10 rounded-2xl text-xs">
                <div>
                  <span className="block text-[9px] font-black uppercase text-slate-400">Categoría</span>
                  <p className="font-bold text-emerald-700 dark:text-emerald-400 uppercase mt-0.5">{selectedProduct.categoria || 'SIN CATEGORÍA'}</p>
                </div>
                <div>
                  <span className="block text-[9px] font-black uppercase text-slate-400">Unidad de Medida</span>
                  <p className="font-bold text-slate-700 dark:text-emerald-400 uppercase mt-0.5">
                    {selectedProduct.unidad_venta || 'UN'}
                  </p>
                </div>
              </div>
            )}

            {/* CANTIDAD PEDIDA Y BOTÓN ENVIAR */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-6 items-end">
              <div className="space-y-1">
                <label className="text-[10px] font-black text-slate-400 uppercase ml-1">Cantidad Pedida *</label>
                <div className="relative">
                  <input
                    type="number"
                    step="any"
                    required
                    min="0.001"
                    placeholder="0.00"
                    value={quantity}
                    onChange={(e) => setQuantity(e.target.value === '' ? '' : Number(e.target.value))}
                    className="w-full p-3.5 sm:p-4 bg-slate-50 dark:bg-slate-800 dark:text-white rounded-xl sm:rounded-2xl font-bold text-xs sm:text-sm border-none outline-none focus:ring-2 focus:ring-[#009ED6]/50"
                  />
                  {selectedProduct && (
                    <span className="absolute right-4 top-1/2 -translate-y-1/2 text-xs font-black text-slate-400">
                      {selectedProduct.unidad_venta || 'UN'}
                    </span>
                  )}
                </div>
              </div>

              <button
                type="submit"
                disabled={isSubmitting || !selectedProduct}
                className={`w-full py-3.5 sm:py-4 rounded-xl sm:rounded-2xl text-[10px] sm:text-xs font-black tracking-widest uppercase text-white shadow-lg shadow-[#009ED6]/20 transition-all active:scale-[0.98] ${
                  !selectedProduct
                    ? 'bg-zinc-300 dark:bg-slate-800 text-zinc-400 cursor-not-allowed shadow-none'
                    : isSubmitting
                    ? 'bg-[#009ED6]/70 cursor-not-allowed shadow-none flex items-center justify-center gap-2'
                    : 'bg-[#009ED6] hover:bg-[#008cb8]'
                }`}
              >
                {isSubmitting && <RefreshCw className="w-4 h-4 animate-spin-slow" />}
                ENVIAR PEDIDO
              </button>
            </div>
          </form>
        </div>
      )}

      {/* HISTORY TAB */}
      {activeTab === 'HISTORY' && (
        <div className="bg-white dark:bg-slate-900 p-3.5 sm:p-6 rounded-2xl sm:rounded-3xl border border-zinc-100 dark:border-slate-800 shadow-sm animate-fade-in space-y-4 sm:space-y-6">
          <div className="flex flex-col md:flex-row gap-4 justify-between items-stretch md:items-center">
            <h2 className="text-sm sm:text-lg font-black text-slate-800 dark:text-white uppercase tracking-tight flex items-center gap-2">
              <History className="w-4 h-4 sm:w-5 sm:h-5 text-[#009ED6]" />
              Lista Histórica de Pedidos
            </h2>
            
            {/* SEARCH */}
            <div className="relative w-full md:w-64">
              <input
                type="text"
                placeholder="Buscar en el historial..."
                value={historySearch}
                onChange={(e) => {
                  setHistorySearch(e.target.value);
                  setCurrentPage(1);
                }}
                className="w-full py-2.5 pl-10 pr-4 bg-slate-50 dark:bg-slate-800 dark:text-white border-none rounded-xl text-xs font-bold shadow-inner focus:ring-2 focus:ring-[#009ED6]/50"
              />
              <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 w-4 h-4" />
            </div>
          </div>

          {/* LIST TABLE OR CARD */}
          {isLoadingHistory ? (
            <div className="flex flex-col items-center justify-center py-12 space-y-3">
              <RefreshCw className="w-8 h-8 text-[#009ED6] animate-spin" />
              <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">Cargando Historial...</p>
            </div>
          ) : filteredHistory.length === 0 ? (
            <div className="text-center py-12 text-slate-400 dark:text-slate-500 font-bold uppercase text-xs tracking-wider border border-dashed border-zinc-100 dark:border-slate-800 rounded-2xl">
              No se encontraron registros de pedidos de corte.
            </div>
          ) : (
            <div className="space-y-4">
              {/* TABLE VIEW (FOR DESKTOP) */}
              <div className="hidden md:block overflow-x-auto rounded-2xl border border-zinc-100 dark:border-slate-800">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-slate-50 dark:bg-slate-800 text-slate-400 text-[10px] uppercase font-black tracking-wider">
                      <th className="p-4 border-b border-zinc-100 dark:border-slate-800">Persona que Pidió</th>
                      <th className="p-4 border-b border-zinc-100 dark:border-slate-800">Cliente / Destinatario</th>
                      <th className="p-4 border-b border-zinc-100 dark:border-slate-800">Fecha y Hora</th>
                      <th className="p-4 border-b border-zinc-100 dark:border-slate-800">Código de Producto</th>
                      <th className="p-4 border-b border-zinc-100 dark:border-slate-800">Producto Pedido</th>
                      <th className="p-4 border-b border-zinc-100 dark:border-slate-800 text-right">Cantidad</th>
                      <th className="p-4 border-b border-zinc-100 dark:border-slate-800">UM</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-100 dark:divide-slate-800 font-bold text-slate-700 dark:text-slate-200 text-xs">
                    {paginatedHistory.map((item) => {
                      const formatted = formatDateTime(item.fecha_registro);
                      return (
                        <tr key={item.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/30">
                          <td className="p-4 uppercase font-bold text-[#009ED6]">{item.usuario_registro}</td>
                          <td className="p-4 uppercase text-slate-700 dark:text-slate-300 font-extrabold max-w-[150px] truncate">
                            {item.cliente_nombre || <span className="text-slate-400 font-normal">S/A</span>}
                          </td>
                          <td className="p-4 text-slate-400 text-[11px] font-semibold whitespace-nowrap">
                            {formatted.date} <span className="text-[10px] ml-1 font-normal text-slate-500">{formatted.time}</span>
                          </td>
                          <td className="p-4 font-mono">{item.codigo}</td>
                          <td className="p-4 max-w-xs truncate uppercase">{item.nombre}</td>
                          <td className="p-4 text-right text-base font-black text-slate-800 dark:text-white">{item.cantidad}</td>
                          <td className="p-4 uppercase text-slate-400">{item.unidad_medida}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {/* CARD LIST VIEW (FOR MOBILE) */}
              <div className="grid grid-cols-1 gap-3 md:hidden">
                {paginatedHistory.map((item) => {
                  const formatted = formatDateTime(item.fecha_registro);
                  return (
                    <div key={item.id} className="p-4 bg-slate-50/50 dark:bg-slate-800/40 rounded-xl border border-zinc-100 dark:border-slate-800 space-y-2.5">
                      <div className="flex justify-between items-start gap-2">
                        <div className="min-w-0">
                          <p className="text-[9px] font-black uppercase text-zinc-400 dark:text-slate-500 leading-none mb-0.5 animate-pulse-slow">Pedido por</p>
                          <p className="text-xs font-black text-[#009ED6] uppercase truncate">{item.usuario_registro}</p>
                        </div>
                        <div className="text-right shrink-0">
                          <p className="text-[10px] font-bold text-slate-700 dark:text-slate-300">{formatted.date}</p>
                          <p className="text-[9px] font-medium text-slate-455 dark:text-slate-400">{formatted.time}</p>
                        </div>
                      </div>

                      {item.cliente_nombre && (
                        <div className="border-t border-zinc-100 dark:border-slate-800/60 pt-2">
                          <p className="text-[9px] font-black uppercase text-zinc-400 dark:text-slate-500 leading-none mb-1">Cliente / Destinatario</p>
                          <p className="text-xs font-bold text-slate-800 dark:text-white uppercase truncate">{item.cliente_nombre}</p>
                        </div>
                      )}

                      <div className="border-t border-zinc-100 dark:border-slate-800/60 pt-2">
                        <p className="text-[9px] font-black uppercase text-zinc-400 dark:text-slate-500 leading-none mb-1">Producto</p>
                        <p className="text-xs font-black text-slate-800 dark:text-white uppercase leading-snug break-words">{item.nombre}</p>
                        <div className="inline-flex mt-1.5 items-center gap-1 px-1.5 py-0.5 bg-slate-200/50 dark:bg-slate-700/50 rounded text-[9px] font-mono text-slate-600 dark:text-slate-300">
                          <span className="font-bold">CÓD:</span> {item.codigo}
                        </div>
                      </div>

                      <div className="flex justify-between items-center bg-white dark:bg-slate-800/30 p-2.5 rounded-lg border border-zinc-100/50 dark:border-slate-800/20">
                        <div>
                          <p className="text-[9px] font-black uppercase text-zinc-400 dark:text-slate-500 leading-none mb-0.5">U. Medida</p>
                          <span className="text-xs uppercase font-extrabold text-slate-500 dark:text-slate-400">{item.unidad_medida}</span>
                        </div>
                        <div className="text-right">
                          <p className="text-[9px] font-black uppercase text-zinc-400 dark:text-slate-500 leading-none mb-0.5 font-bold">Cantidad</p>
                          <span className="text-base font-black text-slate-800 dark:text-white">{item.cantidad}</span>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* PAGINATION */}
              {totalPages > 1 && (
                <div className="flex justify-between items-center bg-slate-50 dark:bg-slate-800/50 p-3 sm:p-4 rounded-xl sm:rounded-2xl mt-4">
                  <span className="text-[10px] sm:text-xs font-bold text-slate-400 uppercase">Pág. {currentPage} de {totalPages}</span>
                  <div className="flex gap-2">
                    <button
                      onClick={() => handlePageChange(currentPage - 1)}
                      disabled={currentPage === 1}
                      className="p-1.5 sm:p-2 bg-white dark:bg-slate-800 border border-zinc-100 dark:border-slate-700 rounded-lg sm:rounded-xl hover:border-zinc-300 disabled:opacity-40 cursor-pointer"
                    >
                      <ChevronLeft className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-slate-600 dark:text-white" />
                    </button>
                    <button
                      onClick={() => handlePageChange(currentPage + 1)}
                      disabled={currentPage === totalPages}
                      className="p-1.5 sm:p-2 bg-white dark:bg-slate-800 border border-zinc-100 dark:border-slate-700 rounded-lg sm:rounded-xl hover:border-zinc-300 disabled:opacity-40 cursor-pointer"
                    >
                      <ChevronRight className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-slate-600 dark:text-white" />
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* SUCCESS MODAL SUMMARY */}
      {showSuccessModal && lastSubmittedPedido && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-fade-in">
          <div className="bg-emerald-50 dark:bg-emerald-950/80 border border-emerald-200 dark:border-emerald-800/60 shadow-2xl rounded-3xl p-6 sm:p-8 max-w-md w-full text-center space-y-6 transform animate-in zoom-in duration-300">
            <div className="w-16 h-16 bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 rounded-full flex items-center justify-center mx-auto shadow-inner">
              <CheckCircle2 className="w-10 h-10" />
            </div>
            
            <div className="space-y-2">
              <h3 className="text-xl font-black text-emerald-900 dark:text-emerald-100 uppercase tracking-tighter">¡Pedido Enviado con Éxito!</h3>
              <p className="text-xs text-emerald-700/80 dark:text-emerald-300/80 font-bold uppercase tracking-wide">Resumen del pedido enviado para corte:</p>
            </div>

            {/* SUMMARY CARD */}
            <div className="bg-white dark:bg-slate-900 border border-emerald-100 dark:border-emerald-900/50 p-5 rounded-2xl text-left space-y-3 shadow-sm">
              {lastSubmittedPedido.cliente_nombre && (
                <div className="pb-2">
                  <span className="text-[9px] font-black uppercase text-slate-400">Cliente / Destinatario</span>
                  <p className="text-sm font-black text-[#009ED6] uppercase mt-0.5">{lastSubmittedPedido.cliente_nombre}</p>
                </div>
              )}

              <div className={lastSubmittedPedido.cliente_nombre ? "border-t border-emerald-50 dark:border-emerald-900/40 pt-2" : ""}>
                <span className="text-[9px] font-black uppercase text-emerald-600/70 dark:text-emerald-400/60">Producto</span>
                <p className="text-sm font-black text-emerald-950 dark:text-emerald-50 uppercase mt-0.5">{lastSubmittedPedido.nombre}</p>
                <div className="mt-2">
                  <span className="inline-block text-sm sm:text-base font-mono font-black text-slate-800 dark:text-white bg-slate-100 dark:bg-slate-800/80 px-3 py-1 rounded-lg border border-slate-200 dark:border-slate-700 uppercase tracking-widest">
                    CÓDIGO: {lastSubmittedPedido.codigo}
                  </span>
                </div>
              </div>

              <div className="flex justify-between items-center border-t border-emerald-50 dark:border-emerald-900/40 pt-3">
                <div>
                  <span className="text-[9px] font-black uppercase text-emerald-600/70 dark:text-emerald-400/60">Cant. Pedida</span>
                  <p className="text-2xl font-black text-emerald-950 dark:text-emerald-50 mt-0.5">{lastSubmittedPedido.cantidad}</p>
                </div>
                <div className="text-right">
                  <span className="text-[9px] font-black uppercase text-emerald-600/70 dark:text-emerald-400/60">Unidad de Medida</span>
                  <p className="text-xs font-black text-emerald-800 dark:text-emerald-200 uppercase mt-0.5 bg-emerald-50 dark:bg-emerald-900/80 px-2.5 py-1.5 rounded-lg inline-block">{lastSubmittedPedido.unidad_medida}</p>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2 border-t border-emerald-50 dark:border-emerald-900/40 pt-3 text-xs">
                <div>
                  <span className="text-[9px] font-black uppercase text-emerald-600/70 dark:text-emerald-400/60 block">Solicitado Por</span>
                  <span className="font-extrabold text-slate-700 dark:text-slate-300 uppercase block mt-0.5 truncate">{lastSubmittedPedido.usuario}</span>
                </div>
                <div className="text-right">
                  <span className="text-[9px] font-black uppercase text-emerald-600/70 dark:text-emerald-400/60 block">Fecha y Hora</span>
                  <span className="font-bold text-slate-600 dark:text-slate-400 block mt-0.5 text-[10px]">{lastSubmittedPedido.fecha}</span>
                </div>
              </div>
            </div>

            <button
              onClick={() => {
                setShowSuccessModal(false);
                setLastSubmittedPedido(null);
              }}
              className="w-full py-4 bg-emerald-600 hover:bg-emerald-700 text-white font-black rounded-2xl text-xs tracking-widest uppercase transition-all shadow-lg shadow-emerald-600/20 active:scale-[0.98]"
            >
              ENTENDIDO
            </button>
          </div>
        </div>
      )}

      {/* QUICK CREATE CLIENT MODAL */}
      {isClientModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-fade-in">
          <div className="bg-white dark:bg-slate-900 rounded-3xl p-6 sm:p-8 max-w-md w-full shadow-2xl border border-slate-100 dark:border-slate-800 animate-in fade-in zoom-in duration-200">
            <div className="flex justify-between items-start mb-6">
              <div>
                <span className="text-[10px] font-black text-[#009ED6] uppercase tracking-widest">ASISTENTE PRIVILEGES</span>
                <h2 className="text-lg font-black text-slate-800 dark:text-white uppercase mt-0.5">Crear Nuevo Cliente</h2>
              </div>
              <button 
                type="button"
                onClick={() => setIsClientModalOpen(false)}
                className="p-1.5 bg-slate-50 dark:bg-slate-800 text-slate-400 dark:text-slate-350 hover:bg-slate-100 rounded-xl transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleQuickCreateCliente} className="space-y-4">
              <div className="space-y-1">
                <label className="text-[9px] font-black text-slate-400 uppercase ml-1 block">Nombre Comercial / Cliente *</label>
                <input
                  type="text"
                  required
                  placeholder="Ej. SUPERMERCADOS PERUANOS S.A."
                  value={newClientNombre}
                  onChange={(e) => setNewClientNombre(e.target.value)}
                  className="w-full p-3.5 bg-slate-50 dark:bg-slate-800 dark:text-white rounded-xl font-bold text-xs border-none outline-none focus:ring-2 focus:ring-[#009ED6]/30 uppercase"
                />
              </div>

              <div className="space-y-1">
                <label className="text-[9px] font-black text-slate-400 uppercase ml-1 block">Identificación / RUC / DNI</label>
                <div className="relative">
                  <input
                    type="text"
                    placeholder="Ej. 20100078945"
                    value={newClientDocumento}
                    onChange={(e) => setNewClientDocumento(e.target.value)}
                    className="w-full p-3.5 pl-10 bg-slate-50 dark:bg-slate-800 dark:text-white rounded-xl font-bold text-xs border-none outline-none focus:ring-2 focus:ring-[#009ED6]/30 font-mono"
                  />
                  <CreditCard className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 w-4 h-4" />
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-[9px] font-black text-slate-400 uppercase ml-1 block">Teléfono de Contacto</label>
                <div className="relative">
                  <input
                    type="text"
                    placeholder="Ej. 987654321"
                    value={newClientTelefono}
                    onChange={(e) => setNewClientTelefono(e.target.value)}
                    className="w-full p-3.5 pl-10 bg-[#f8fafc] dark:bg-slate-800 dark:text-white rounded-xl font-bold text-xs border-none outline-none focus:ring-2 focus:ring-[#009ED6]/30"
                  />
                  <Phone className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 w-4 h-4" />
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-[9px] font-black text-slate-400 uppercase ml-1 block">Dirección de Despacho</label>
                <div className="relative">
                  <input
                    type="text"
                    placeholder="Ej. Av. Panamericana Sur Km 18.5"
                    value={newClientDireccion}
                    onChange={(e) => setNewClientDireccion(e.target.value)}
                    className="w-full p-3.5 pl-10 bg-slate-50 dark:bg-slate-800 dark:text-white rounded-xl font-bold text-xs border-none outline-none focus:ring-2 focus:ring-[#009ED6]/30 uppercase"
                  />
                  <MapPin className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 w-4 h-4" />
                </div>
              </div>

              <button
                type="submit"
                disabled={isSavingClient}
                className="w-full py-4 bg-[#009ED6] text-white text-[11px] font-black tracking-widest uppercase rounded-xl sm:rounded-2xl hover:bg-[#0089ba] shadow-lg shadow-[#009ED6]/20 transition-all hover:scale-[1.01] flex items-center justify-center gap-2 mt-2 cursor-pointer disabled:opacity-50"
              >
                {isSavingClient ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
                Registrar Cliente
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
