import React, { useState, useEffect, useMemo } from 'react';
import { supabase } from '../supabaseClient';
import { Usuario, Cliente } from '../types';
import { Search, Plus, Phone, MapPin, CreditCard, ChevronLeft, ChevronRight, RefreshCw, UserCheck, X } from 'lucide-react';

interface ClientesProps {
  currentUser: Usuario | null;
}

export const Clientes: React.FC<ClientesProps> = ({ currentUser }) => {
  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 8;

  // Modal Creation States
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [nombre, setNombre] = useState('');
  const [documento, setDocumento] = useState('');
  const [telefono, setTelefono] = useState('');
  const [direccion, setDireccion] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Check if current user is exactly ASISTENTE
  const isAsistente = currentUser?.rol === 'ASISTENTE';

  const fetchClientes = async () => {
    setIsLoading(true);
    try {
      let query = supabase.from('clientes').select('*');
      
      // Filter by active sede if defined and not ADMIN
      const isAdmin = currentUser?.rol === 'ADMIN';
      const sedeId = currentUser?.sede_id;
      if (sedeId && !isAdmin) {
        query = query.or(`sede_id.eq.${sedeId},sede_id.is.null`);
      }

      const { data, error } = await query.order('nombre', { ascending: true });
      if (error) throw error;
      setClientes(data || []);
    } catch (err) {
      console.error('Error fetching clients:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchClientes();
  }, [currentUser]);

  // Search logic
  const filteredClientes = useMemo(() => {
    if (!searchTerm.trim()) return clientes;
    const term = searchTerm.toLowerCase();
    return clientes.filter(c => 
      c.nombre.toLowerCase().includes(term) || 
      (c.documento && c.documento.toLowerCase().includes(term)) ||
      (c.telefono && c.telefono.toLowerCase().includes(term))
    );
  }, [clientes, searchTerm]);

  const totalPages = Math.ceil(filteredClientes.length / itemsPerPage);
  const paginatedClientes = useMemo(() => {
    const start = (currentPage - 1) * itemsPerPage;
    return filteredClientes.slice(start, start + itemsPerPage);
  }, [filteredClientes, currentPage]);

  const handlePageChange = (page: number) => {
    if (page >= 1 && page <= totalPages) {
      setCurrentPage(page);
    }
  };

  const handleCreateCliente = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isAsistente) {
      alert('Solo los usuarios con rol de ASISTENTE pueden crear clientes.');
      return;
    }

    if (!nombre.trim()) {
      alert('Por favor ingrese el nombre del cliente.');
      return;
    }

    setIsSubmitting(true);
    try {
      const newClienteData = {
        nombre: nombre.trim(),
        documento: documento.trim() || null,
        telefono: telefono.trim() || null,
        direccion: direccion.trim() || null,
        sede_id: currentUser?.sede_id || null
      };

      const { data, error } = await supabase
        .from('clientes')
        .insert([newClienteData])
        .select();

      if (error) throw error;

      // Update local state instantly to avoid wait
      if (data && data[0]) {
        setClientes(prev => [...prev, data[0]].sort((a, b) => a.nombre.localeCompare(b.nombre)));
      }

      alert('Cliente registrado con éxito.');
      
      // Reset and close
      setNombre('');
      setDocumento('');
      setTelefono('');
      setDireccion('');
      setIsModalOpen(false);
      
      // Sync from DB
      fetchClientes();
    } catch (err: any) {
      console.error('Error creating client:', err);
      alert('Error registrando cliente: ' + err.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="flex flex-col flex-1 h-full max-w-7xl mx-auto p-2 sm:p-6 space-y-4 sm:space-y-6">
      {/* HEADER PART */}
      <div className="flex justify-between items-center bg-white dark:bg-slate-900 p-4 sm:p-6 rounded-2xl sm:rounded-3xl border border-zinc-100 dark:border-slate-800 shadow-sm">
        <div className="flex items-center gap-3">
          <div className="p-2 sm:p-3 bg-[#009ED6]/10 text-[#009ED6] rounded-xl sm:rounded-2xl shrink-0">
            <UserCheck className="w-6 h-6 sm:w-7 sm:h-7" />
          </div>
          <div>
            <h1 className="text-base sm:text-2xl font-black text-slate-800 dark:text-white uppercase tracking-tight">Directorio de Clientes</h1>
            <p className="text-[9px] sm:text-xs text-slate-400 dark:text-slate-500 font-bold uppercase tracking-wider">Cartera de clientes registrados de la sucursal</p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button 
            onClick={fetchClientes}
            className="p-2 sm:p-2.5 bg-slate-50 dark:bg-slate-800 text-slate-600 dark:text-slate-300 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-700/80 transition-colors cursor-pointer border border-zinc-100 dark:border-slate-700"
            title="Sincronizar"
          >
            <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
          </button>

          {/* Plus "+" option visible only to ASISTENTE role as requested */}
          {isAsistente && (
            <button
              onClick={() => setIsModalOpen(true)}
              className="flex items-center justify-center gap-1.5 px-3 py-2 sm:px-4 sm:py-2.5 bg-[#009ED6] text-white text-[10px] sm:text-xs font-black tracking-widest uppercase rounded-xl sm:rounded-2xl hover:bg-[#0089ba] shadow-lg shadow-[#009ED6]/15 hover:shadow-xl transition-all cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              Nuevo Cliente
            </button>
          )}
        </div>
      </div>

      {/* FILTER SEARCH AREA */}
      <div className="bg-white dark:bg-slate-900 p-3 sm:p-4 rounded-xl sm:rounded-2xl border border-zinc-50 dark:border-slate-800 shadow-sm flex flex-col md:flex-row gap-4 items-stretch md:items-center">
        <div className="relative flex-1">
          <input
            type="text"
            placeholder="Buscar por Nombre, RUC, Teléfono..."
            value={searchTerm}
            onChange={(e) => {
              setSearchTerm(e.target.value);
              setCurrentPage(1);
            }}
            className="w-full text-xs sm:text-sm font-bold bg-slate-50 dark:bg-slate-800 dark:text-white rounded-xl p-3 pl-10 sm:p-3.5 sm:pl-11 border-none outline-none focus:ring-2 focus:ring-[#009ED6]/30"
          />
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 w-4 h-4 sm:w-5 sm:h-5" />
        </div>
        <div className="text-[10px] sm:text-xs font-black text-slate-400 tracking-wider text-right flex items-center justify-end">
          Total: {filteredClientes.length} registros
        </div>
      </div>

      {/* ERROR / LIST VIEW */}
      {isLoading && clientes.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 bg-white dark:bg-slate-900 rounded-3xl border border-zinc-100 dark:border-slate-800">
          <RefreshCw className="w-10 h-10 animate-spin text-[#009ED6] mb-4" />
          <p className="text-xs font-black uppercase text-slate-400">Cargando Directorio...</p>
        </div>
      ) : filteredClientes.length === 0 ? (
        <div className="text-center py-16 bg-white dark:bg-slate-900 rounded-3xl border border-dashed border-zinc-100 dark:border-slate-800">
          <p className="text-xs font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest mb-2">No se encontraron clientes</p>
          <p className="text-[10px] text-zinc-400 dark:text-zinc-500 uppercase">Intente buscar con otro término u agregue uno nuevo.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {/* TABLE DISPLAY FOR DESKTOP */}
          <div className="hidden md:block bg-white dark:bg-slate-900 rounded-3xl border border-zinc-100 dark:border-slate-800 overflow-hidden shadow-sm">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-50 dark:bg-slate-800/50 text-[10px] font-black uppercase tracking-widest text-slate-400 border-b border-zinc-100 dark:border-slate-800">
                  <th className="p-4 pl-6">Cliente</th>
                  <th className="p-4">Identificación / RUC</th>
                  <th className="p-4">Teléfono</th>
                  <th className="p-4">Dirección</th>
                  <th className="p-4 text-right pr-6">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100 dark:divide-slate-800 font-bold text-slate-700 dark:text-slate-200 text-xs">
                {paginatedClientes.map((c) => (
                  <tr key={c.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/30 transition-all">
                    <td className="p-4 pl-6 text-[#009ED6] font-black uppercase">{c.nombre}</td>
                    <td className="p-4 font-mono">{c.documento || '—'}</td>
                    <td className="p-4 text-slate-500 font-semibold">{c.telefono || '—'}</td>
                    <td className="p-4 max-w-xs truncate text-[11px] font-semibold text-slate-550 dark:text-slate-400">{c.direccion || '—'}</td>
                    <td className="p-4 text-right pr-6">
                      <span className="inline-flex items-center gap-1.5 px-3 py-1 bg-emerald-50 dark:bg-emerald-950/20 text-emerald-600 dark:text-emerald-400 rounded-full text-[10px] font-black uppercase">
                        Activo
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* CARD DISPLAY FOR MOBILE/TABLET */}
          <div className="grid grid-cols-1 sm:grid-cols-2 md:hidden gap-3.5">
            {paginatedClientes.map((c) => (
              <div key={c.id} className="p-4 bg-white dark:bg-slate-900 border border-zinc-100 dark:border-slate-800 rounded-2xl shadow-sm space-y-3">
                <div>
                  <span className="text-[8px] font-bold text-zinc-400 uppercase tracking-widest">Nombre Comercial</span>
                  <h3 className="text-sm font-black text-[#009ED6] uppercase truncate leading-tight mt-0.5">{c.nombre}</h3>
                </div>

                <div className="grid grid-cols-2 gap-3 pt-2 border-t border-zinc-50 dark:border-slate-800/50">
                  <div>
                    <span className="text-[8px] font-bold text-zinc-400 uppercase tracking-widest leading-none">RUC / DOC</span>
                    <p className="text-xs font-mono font-bold text-slate-700 dark:text-slate-300 mt-0.5">{c.documento || '—'}</p>
                  </div>
                  <div>
                    <span className="text-[8px] font-bold text-zinc-400 uppercase tracking-widest leading-none">Teléfono</span>
                    <p className="text-xs font-bold text-slate-600 dark:text-slate-400 mt-0.5 truncate flex items-center gap-1">
                      {c.telefono && <Phone className="w-3 h-3 text-slate-400" />} {c.telefono || '—'}
                    </p>
                  </div>
                </div>

                <div className="pt-1.5">
                  <span className="text-[8px] font-bold text-zinc-400 uppercase tracking-widest">Dirección</span>
                  <p className="text-[11px] font-medium text-slate-500 dark:text-slate-400 truncate mt-0.5 flex items-center gap-1">
                    {c.direccion && <MapPin className="w-3 h-3 text-slate-400" />} {c.direccion || '—'}
                  </p>
                </div>
              </div>
            ))}
          </div>

          {/* PAGINATION PANEL */}
          {totalPages > 1 && (
            <div className="flex justify-between items-center bg-white dark:bg-slate-900 p-3.5 rounded-2xl mt-4 border border-zinc-100 dark:border-slate-800">
              <span className="text-[10px] font-bold text-slate-400 uppercase">Pág. {currentPage} de {totalPages}</span>
              <div className="flex gap-2">
                <button
                  onClick={() => handlePageChange(currentPage - 1)}
                  disabled={currentPage === 1}
                  className="p-2 bg-slate-50 dark:bg-slate-800 border border-zinc-100 dark:border-slate-700 rounded-xl hover:bg-slate-100 disabled:opacity-40 cursor-pointer"
                >
                  <ChevronLeft className="w-4 h-4 text-slate-600 dark:text-white" />
                </button>
                <button
                  onClick={() => handlePageChange(currentPage + 1)}
                  disabled={currentPage === totalPages}
                  className="p-2 bg-slate-50 dark:bg-slate-800 border border-zinc-100 dark:border-slate-700 rounded-xl hover:bg-slate-100 disabled:opacity-40 cursor-pointer"
                >
                  <ChevronRight className="w-4 h-4 text-slate-600 dark:text-white" />
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* CREATE NEW CLIENT MODAL */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 z-[999]">
          <div className="bg-white dark:bg-slate-900 rounded-3xl p-6 sm:p-8 max-w-md w-full shadow-2xl border border-slate-100 dark:border-slate-800 animate-in fade-in zoom-in duration-200">
            <div className="flex justify-between items-start mb-6">
              <div>
                <span className="text-[10px] font-black text-[#009ED6] uppercase tracking-widest">ASISTENTE PRIVILEGES</span>
                <h2 className="text-lg font-black text-slate-800 dark:text-white uppercase mt-0.5">Crear Nuevo Cliente</h2>
              </div>
              <button 
                onClick={() => setIsModalOpen(false)}
                className="p-1.5 bg-slate-55 dark:bg-slate-800 text-slate-400 dark:text-slate-350 hover:bg-slate-150 rounded-xl transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreateCliente} className="space-y-4">
              <div className="space-y-1">
                <label className="text-[9px] font-black text-slate-400 uppercase ml-1 block">Nombre Comercial / Cliente *</label>
                <input
                  type="text"
                  required
                  placeholder="Ej. SUPERMERCADOS PERUANOS S.A."
                  value={nombre}
                  onChange={(e) => setNombre(e.target.value)}
                  className="w-full p-3.5 bg-slate-50 dark:bg-slate-800 dark:text-white rounded-xl font-bold text-xs border-none outline-none focus:ring-2 focus:ring-[#009ED6]/30 uppercase"
                />
              </div>

              <div className="space-y-1">
                <label className="text-[9px] font-black text-slate-400 uppercase ml-1 block">Identificación / RUC / DNI</label>
                <div className="relative">
                  <input
                    type="text"
                    placeholder="Ej. 20100078945"
                    value={documento}
                    onChange={(e) => setDocumento(e.target.value)}
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
                    value={telefono}
                    onChange={(e) => setTelefono(e.target.value)}
                    className="w-full p-3.5 pl-10 bg-slate-50 dark:bg-slate-800 dark:text-white rounded-xl font-bold text-xs border-none outline-none focus:ring-2 focus:ring-[#009ED6]/30"
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
                    value={direccion}
                    onChange={(e) => setDireccion(e.target.value)}
                    className="w-full p-3.5 pl-10 bg-slate-50 dark:bg-slate-800 dark:text-white rounded-xl font-bold text-xs border-none outline-none focus:ring-2 focus:ring-[#009ED6]/30 uppercase"
                  />
                  <MapPin className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 w-4 h-4" />
                </div>
              </div>

              <button
                type="submit"
                disabled={isSubmitting}
                className="w-full py-4 bg-[#009ED6] text-white text-[11px] font-black tracking-widest uppercase rounded-xl sm:rounded-2xl hover:bg-[#0089ba] shadow-lg shadow-[#009ED6]/20 transition-all hover:scale-[1.01] flex items-center justify-center gap-2 mt-2 cursor-pointer disabled:opacity-50"
              >
                {isSubmitting ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
                Registrar Cliente
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
