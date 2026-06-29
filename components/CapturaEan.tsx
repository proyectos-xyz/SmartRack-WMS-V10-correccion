import React, { useState, useMemo, useRef, useEffect } from 'react';
import { supabase } from '../supabaseClient';
import { Product } from '../types';
import { 
  Search, 
  Barcode, 
  X, 
  Check, 
  ChevronRight, 
  Layers, 
  Save,
  Filter, 
  RefreshCw,
  AlertCircle
} from 'lucide-react';

interface CapturaEanProps {
  catalog: Product[];
  onUpdateCatalog: (updatedCatalog: Product[]) => void;
}

export const CapturaEan: React.FC<CapturaEanProps> = ({ catalog, onUpdateCatalog }) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCamera, setSelectedCamera] = useState<string>('TODAS');
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  
  // Modal states
  const [eanBulto, setEanBulto] = useState('');
  const [eanProducto, setEanProducto] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  const eanBultoRef = useRef<HTMLInputElement>(null);
  const eanProductoRef = useRef<HTMLInputElement>(null);

  // Auto-clear toast
  useEffect(() => {
    if (toast) {
      const timer = setTimeout(() => setToast(null), 3000);
      return () => clearTimeout(timer);
    }
  }, [toast]);

  // Focus EAN Bulto field when product is selected
  useEffect(() => {
    if (selectedProduct) {
      setTimeout(() => {
        eanBultoRef.current?.focus();
      }, 150);
    }
  }, [selectedProduct]);

  // Extract unique cameras from catalog
  const cameras = useMemo(() => {
    const unique = new Set<string>();
    catalog.forEach(p => {
      if (p.camara_texto && p.camara_texto.trim().length > 0) {
        unique.add(p.camara_texto.trim().toUpperCase());
      } else if (p.zona_predeterminada && p.zona_predeterminada.trim().length > 0) {
        unique.add(p.zona_predeterminada.trim().toUpperCase());
      }
    });
    return ['TODAS', ...Array.from(unique)];
  }, [catalog]);

  // Filter products
  const filteredProducts = useMemo(() => {
    return catalog.filter(p => {
      // Camera filter
      if (selectedCamera !== 'TODAS') {
        const prodCam = (p.camara_texto || p.zona_predeterminada || '').trim().toUpperCase();
        if (prodCam !== selectedCamera) return false;
      }

      // Search term
      if (searchTerm.trim() !== '') {
        const term = searchTerm.toLowerCase().trim();
        const codigo = (p.codigo || '').toLowerCase();
        const sku = (p.sku || '').toLowerCase();
        const name = (p.nombre || '').toLowerCase();
        const eanBulto = (p.ean_bulto || '').toLowerCase();
        
        return codigo.includes(term) || sku.includes(term) || name.includes(term) || eanBulto.includes(term);
      }

      return true;
    });
  }, [catalog, selectedCamera, searchTerm]);

  const handleSelectProduct = (product: Product) => {
    setSelectedProduct(product);
    setEanBulto(product.ean_bulto || '');
    setEanProducto(product.sku || ''); // sku serves as EAN Producto in this system
  };

  const handleSaveEans = async () => {
    if (!selectedProduct) return;

    setIsSaving(true);
    const cleanBulto = eanBulto.trim();
    const cleanProducto = eanProducto.trim();

    try {
      const { error } = await supabase
        .from('productos')
        .update({
          ean_bulto: cleanBulto || null,
          sku: cleanProducto || null // Updates sku as EAN Producto
        })
        .eq('id', selectedProduct.id);

      if (error) throw error;

      // Update parent catalog state to keep memory synchronized
      const updatedProduct = {
        ...selectedProduct,
        ean_bulto: cleanBulto,
        sku: cleanProducto
      };

      onUpdateCatalog(catalog.map(p => p.id === selectedProduct.id ? updatedProduct : p));

      setToast({
        message: 'Códigos EAN guardados con éxito',
        type: 'success'
      });
      setSelectedProduct(null);
    } catch (err: any) {
      console.error('Error saving EAN codes:', err);
      setToast({
        message: 'Error al guardar los códigos EAN: ' + (err.message || ''),
        type: 'error'
      });
    } finally {
      setIsSaving(false);
    }
  };

  const getEanStatusBadge = (product: Product) => {
    const hasBulto = !!(product.ean_bulto && product.ean_bulto.trim().length > 0);
    const hasProducto = !!(product.sku && product.sku.trim().length > 0);

    if (hasBulto && hasProducto) {
      return (
        <span className="px-2 py-1 bg-green-100 text-green-800 text-[10px] font-bold rounded-lg uppercase tracking-wider">
          Completo
        </span>
      );
    } else if (hasBulto || hasProducto) {
      return (
        <span className="px-2 py-1 bg-amber-100 text-amber-800 text-[10px] font-bold rounded-lg uppercase tracking-wider">
          Parcial
        </span>
      );
    } else {
      return (
        <span className="px-2 py-1 bg-slate-100 text-slate-500 text-[10px] font-bold rounded-lg uppercase tracking-wider">
          Sin EAN
        </span>
      );
    }
  };

  return (
    <div className="w-full h-full bg-slate-50 font-sans overflow-hidden">
      <div className="max-w-lg mx-auto w-full h-full flex flex-col overflow-hidden bg-slate-50">
        {/* Dynamic Toast Feedback Notification */}
      {toast && (
        <div className={`fixed bottom-4 left-1/2 -translate-x-1/2 z-50 px-5 py-3.5 rounded-2xl shadow-xl flex items-center gap-2.5 transition-all text-sm font-bold ${
          toast.type === 'success' 
            ? 'bg-emerald-600 text-white' 
            : 'bg-rose-600 text-white'
        }`}>
          {toast.type === 'success' ? <Check className="w-5 h-5 shrink-0" /> : <AlertCircle className="w-5 h-5 shrink-0" />}
          {toast.message}
        </div>
      )}

      {/* Header Container */}
      <div className="bg-white border-b border-slate-100 p-4 sticky top-0 z-20 shadow-sm">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-[#009ED6]/10 text-[#009ED6] rounded-xl">
            <Barcode className="w-6 h-6" />
          </div>
          <div>
            <span className="text-[10px] font-black uppercase text-[#009ED6] tracking-wider block">Administración</span>
            <h1 className="text-lg font-extrabold text-slate-900 tracking-tight">Captura EAN (PDA)</h1>
          </div>
        </div>

        {/* Input de Busqueda */}
        <div className="mt-4 relative">
          <span className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
            <Search className="w-5 h-5" />
          </span>
          <input
            type="text"
            className="w-full pl-11 pr-10 py-3.5 bg-slate-100 text-slate-900 placeholder-slate-400 font-medium text-sm rounded-2xl border-none outline-none focus:ring-2 focus:ring-[#009ED6] transition-all"
            placeholder="Buscar por código, SKU o nombre..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
          {searchTerm && (
            <button 
              onClick={() => setSearchTerm('')}
              className="absolute inset-y-0 right-0 pr-3 flex items-center text-slate-400 hover:text-slate-600 cursor-pointer min-w-[44px] justify-center"
            >
              <X className="w-5 h-5" />
            </button>
          )}
        </div>

        {/* Filas de Filtros de Cámara */}
        <div className="mt-3.5">
          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block mb-1.5 flex items-center gap-1">
            <Filter className="w-3.5 h-3.5" /> Filtrar por Cámara / Zona
          </span>
          <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-hide">
            {cameras.map((cam) => (
              <button
                key={cam}
                onClick={() => setSelectedCamera(cam)}
                className={`px-3.5 py-2 rounded-xl text-xs font-black uppercase tracking-wider shrink-0 transition-all cursor-pointer border ${
                  selectedCamera === cam
                    ? 'bg-[#009ED6] text-white border-transparent shadow-sm'
                    : 'bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100'
                }`}
                style={{ minHeight: '40px' }}
              >
                {cam}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Product List Content Container */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3 pb-8">
        {filteredProducts.length === 0 ? (
          <div className="bg-white rounded-3xl p-8 text-center border border-slate-150-100 shadow-sm space-y-3">
            <Layers className="w-10 h-10 text-slate-300 mx-auto" />
            <p className="text-slate-500 font-semibold text-sm">No se encontraron productos</p>
            <p className="text-slate-400 text-xs">Pruebe modificando su criterio de búsqueda o filtro de cámara.</p>
          </div>
        ) : (
          filteredProducts.map((p) => (
            <div
              key={p.id}
              onClick={() => handleSelectProduct(p)}
              className="bg-white hover:bg-slate-50 border border-slate-150/80 active:scale-[0.98] rounded-2xl p-4 flex items-center justify-between gap-4 transition-all shadow-sm cursor-pointer"
            >
              <div className="space-y-1.5 flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="px-2 py-0.5 bg-slate-100 text-slate-700 text-[10px] font-black rounded-md font-mono tracking-wider">
                    {p.codigo}
                  </span>
                  <span className="px-2 py-0.5 bg-[#009ED6]/10 text-[#009ED6] text-[10px] font-black rounded-md uppercase tracking-wider">
                    {p.camara_texto || p.zona_predeterminada || 'SIN CÁMARA'}
                  </span>
                  {getEanStatusBadge(p)}
                </div>
                
                <h3 className="text-sm font-bold text-slate-800 line-clamp-2 uppercase leading-snug">
                  {p.nombre}
                </h3>

                <div className="flex gap-4 text-xs font-mono text-slate-500">
                  <div>
                    <span className="text-slate-400 font-sans text-[10px] font-bold block uppercase">EAN BULTO</span>
                    <span>{p.ean_bulto || '—'}</span>
                  </div>
                  <div>
                    <span className="text-slate-400 font-sans text-[10px] font-bold block uppercase">EAN PRODUCTO</span>
                    <span>{p.sku || '—'}</span>
                  </div>
                </div>
              </div>

              <div className="shrink-0 text-slate-400 bg-slate-50 p-2.5 rounded-xl border border-slate-100">
                <ChevronRight className="w-5 h-5 text-slate-500" />
              </div>
            </div>
          ))
        )}
      </div>

      {/* Modal Dialog for Recording EANs */}
      {selectedProduct && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-end justify-center sm:items-center p-0 sm:p-4">
          <div className="bg-white w-full max-w-md rounded-t-[2.5rem] sm:rounded-3xl shadow-2xl border-t border-slate-100 flex flex-col max-h-[85vh] overflow-hidden">
            {/* Modal Header */}
            <div className="p-5 border-b border-slate-100 flex justify-between items-start gap-4">
              <div className="space-y-1">
                <span className="px-2.5 py-0.5 bg-sky-100 text-sky-800 text-[10px] font-black rounded-lg uppercase tracking-wider inline-block">
                  {selectedProduct.codigo}
                </span>
                <h2 className="text-base font-extrabold text-slate-800 uppercase leading-snug">
                  {selectedProduct.nombre}
                </h2>
                <p className="text-xs text-slate-500 flex items-center gap-1.5 font-bold">
                  <span className="inline-block w-2.5 h-2.5 rounded-full bg-[#009ED6]"></span>
                  Cámara: {selectedProduct.camara_texto || selectedProduct.zona_predeterminada || 'SIN CÁMARA'}
                </p>
              </div>
              <button
                onClick={() => setSelectedProduct(null)}
                className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-xl transition-all cursor-pointer min-w-[44px] min-h-[44px] flex items-center justify-center shrink-0"
              >
                <X className="w-5 h-5 font-black" />
              </button>
            </div>

            {/* Modal Form Content */}
            <div className="p-5 space-y-4 overflow-y-auto flex-1">
              <div className="space-y-1.5">
                <label className="text-xs font-black text-slate-500 uppercase tracking-wider block">
                  📦 Código EAN Bulto (Caja)
                </label>
                <div className="relative">
                  <input
                    ref={eanBultoRef}
                    type="text"
                    className="w-full p-4 bg-slate-50 focus:bg-white text-slate-900 placeholder-slate-400 font-mono text-sm rounded-2xl border border-slate-200 focus:border-[#009ED6] focus:ring-2 focus:ring-[#009ED6]/20 outline-none transition-all pr-12"
                    placeholder="Escanee o digite EAN de Bulto..."
                    value={eanBulto}
                    onChange={(e) => setEanBulto(e.target.value)}
                  />
                  {eanBulto && (
                    <button 
                      onClick={() => setEanBulto('')}
                      className="absolute inset-y-0 right-0 pr-4 flex items-center text-slate-400 hover:text-slate-600 min-w-[44px] justify-center cursor-pointer"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  )}
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-black text-slate-500 uppercase tracking-wider block">
                  🏷️ Código EAN Producto (Unidad / SKU)
                </label>
                <div className="relative">
                  <input
                    ref={eanProductoRef}
                    type="text"
                    className="w-full p-4 bg-slate-50 focus:bg-white text-slate-900 placeholder-slate-400 font-mono text-sm rounded-2xl border border-slate-200 focus:border-[#009ED6] focus:ring-2 focus:ring-[#009ED6]/20 outline-none transition-all pr-12"
                    placeholder="Escanee o digite EAN de Producto..."
                    value={eanProducto}
                    onChange={(e) => setEanProducto(e.target.value)}
                  />
                  {eanProducto && (
                    <button 
                      onClick={() => setEanProducto('')}
                      className="absolute inset-y-0 right-0 pr-4 flex items-center text-slate-400 hover:text-slate-600 min-w-[44px] justify-center cursor-pointer"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  )}
                </div>
              </div>
            </div>

            {/* Modal Actions */}
            <div className="p-5 border-t border-slate-100 bg-slate-50 rounded-b-[2.5rem] sm:rounded-b-3xl grid grid-cols-2 gap-3 shrink-0">
              <button
                type="button"
                className="w-full py-4 text-slate-600 hover:bg-slate-150 border border-slate-200 font-bold uppercase text-xs tracking-wider rounded-2xl transition-colors cursor-pointer"
                style={{ minHeight: '48px' }}
                onClick={() => setSelectedProduct(null)}
                disabled={isSaving}
              >
                Cancelar
              </button>
              <button
                type="button"
                className="w-full py-4 bg-[#82BD02] hover:bg-[#72a602] active:scale-[0.98] text-white font-extrabold uppercase text-xs tracking-wider rounded-2xl transition-all shadow-md cursor-pointer flex items-center justify-center gap-2 disabled:opacity-50"
                style={{ minHeight: '48px' }}
                onClick={handleSaveEans}
                disabled={isSaving}
              >
                {isSaving ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    Guardando...
                  </>
                ) : (
                  <>
                    <Save className="w-4 h-4" />
                    Guardar
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
      </div>
    </div>
  );
};
