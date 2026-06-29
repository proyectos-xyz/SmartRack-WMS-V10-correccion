
import React, { useState, useEffect } from 'react';
import { ReverseLogisticsItem, Product, Usuario } from '../types';
import { supabase } from '../supabaseClient';
import { compressImage, generateStorageFileName } from '../utils';
import { Camera, PlusCircle, History, Truck, Search, CheckCircle, Trash, Clock, Box, XCircle, FileSpreadsheet, RefreshCw } from './Icons';
import * as XLSX from 'xlsx';

const PLATES = [
  'ALQUILADO', 'ANL777', 'ASN830',  'ASN831', 'AWZ803', 'AXB704', 'AXB705', 'AXB706', 'AXB802', 'AXB905',
  'BDS737', 'BTF847', 'BTF857', 'BTF937', 'BTG748', 'BTG847', 'BTI850', 'CAB769', 'CAB882', 'CAC765',
  'CAE767', 'CFZ900', 'CHJ779', 'CHA901', 'CHB890', 'CHA890','CHD705','CHE969'
].sort();

interface Props {
  currentUser: Usuario | null;
  catalog?: Product[];
  onRefreshCatalog?: () => Promise<void>;
}

const ReverseLogistics: React.FC<Props> = ({ currentUser, catalog = [], onRefreshCatalog }) => {
  const [activeTab, setActiveTab] = useState<'REGISTER' | 'HISTORY'>('REGISTER');
  const [items, setItems] = useState<ReverseLogisticsItem[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Product Search State
  const [productSearch, setProductSearch] = useState('');
  const [searchResults, setSearchResults] = useState<Product[]>([]);
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [isSearchingProducts, setIsSearchingProducts] = useState(false);

  // Form State
  const [plate, setPlate] = useState('');
  const [invoice, setInvoice] = useState('');
  const [returnType, setReturnType] = useState<ReverseLogisticsItem['returnType']>('SOBRANTE');
  const [defect, setDefect] = useState<ReverseLogisticsItem['defect']>('ROTO / DAÑADO');
  const [quantity, setQuantity] = useState<string>('');
  const [photos, setPhotos] = useState<File[]>([]);
  const [photoPreviews, setPhotoPreviews] = useState<string[]>([]);
  const [successMsg, setSuccessMsg] = useState(false);
  const [hasExpiration, setHasExpiration] = useState(false);

  // History Filters State
  const [filterStartDate, setFilterStartDate] = useState('');
  const [filterEndDate, setFilterEndDate] = useState('');
  const [filterReturnType, setFilterReturnType] = useState('ALL');

  // Pagination State
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 10;

  // Image Maximize State
  const [maximizedImage, setMaximizedImage] = useState<string | null>(null);

  // Date Selector State
  const [selDay, setSelDay] = useState('01');
  const [selMonth, setSelMonth] = useState('01');
  const [selYear, setSelYear] = useState(new Date().getFullYear().toString());

  const months = [
    { v: '01', l: 'ENE' }, { v: '02', l: 'FEB' }, { v: '03', l: 'MAR' },
    { v: '04', l: 'ABR' }, { v: '05', l: 'MAY' }, { v: '06', l: 'JUN' },
    { v: '07', l: 'JUL' }, { v: '08', l: 'AGO' }, { v: '09', l: 'SET' },
    { v: '10', l: 'OCT' }, { v: '11', l: 'NOV' }, { v: '12', l: 'DIC' }
  ];

  const years = Array.from({ length: 5 }, (_, i) => (new Date().getFullYear() + i).toString());

  useEffect(() => {
    fetchItems();
  }, []);

  useEffect(() => {
    const term = productSearch.trim();
    if (term.length > 2) {
      const delayDebounceFn = setTimeout(() => {
        searchProducts(term);
      }, 400);
      return () => clearTimeout(delayDebounceFn);
    } else {
      setSearchResults([]);
    }
  }, [productSearch]);

  const searchProducts = async (term: string) => {
    setIsSearchingProducts(true);
    try {
      // If we have the catalog prop, search locally first
      if (catalog && catalog.length > 0) {
        const lowerTerm = term.toLowerCase();
        const results = catalog.filter(p => 
          (p.codigo || '').toLowerCase().includes(lowerTerm) || 
          (p.sku || '').toLowerCase().includes(lowerTerm) || 
          (p.nombre || '').toLowerCase().includes(lowerTerm)
        );
        
        if (results.length > 0) {
          setSearchResults(results);
          setIsSearchingProducts(false);
          return;
        }
      }

      // Fallback to DB query if no local results or no catalog
      const { data, error } = await supabase
        .from('productos')
        .select('*')
        .or(`codigo.ilike.%${term}%,sku.ilike.%${term}%,nombre.ilike.%${term}%`);
      
      if (error) throw error;
      setSearchResults(data || []);
    } catch (err) {
      console.error("Error searching products:", err);
    } finally {
      setIsSearchingProducts(false);
    }
  };

  const fetchItems = async () => {
    setIsProcessing(true);
    try {
      const { data, error } = await supabase
        .from('logistica_inversa')
        .select('*')
        .order('registrado_at', { ascending: false });
      
      if (error) throw error;
      
      // Map DB fields to interface
      const mapped = (data || []).map(d => ({
        id: d.id,
        plate: d.placa_vehiculo,
        invoice: d.factura_guia,
        returnType: d.tipo_devolucion,
        defect: d.defecto,
        quantity: d.cantidad,
        expirationDate: d.fecha_vencimiento_producto,
        photos: d.fotos || [],
        registeredAt: d.registrado_at,
        productCode: d.codigo_producto,
        productName: d.nombre_producto,
        registeredBy: d.usuario_registro
      }));
      
      setItems(mapped as any);
    } catch (err: any) {
      console.error(err);
    } finally {
      setIsProcessing(false);
    }
  };

  const handlePhotoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;

    const remainingSlots = 3 - photos.length;
    const filesToAdd = files.slice(0, remainingSlots);

    if (filesToAdd.length === 0) return;

    setPhotos(prev => [...prev, ...filesToAdd]);
    
    filesToAdd.forEach(file => {
      const reader = new FileReader();
      reader.onloadend = () => {
        setPhotoPreviews(prev => [...prev, reader.result as string]);
      };
      reader.readAsDataURL(file);
    });
  };

  const removePhoto = (index: number) => {
    setPhotos(prev => prev.filter((_, i) => i !== index));
    setPhotoPreviews(prev => prev.filter((_, i) => i !== index));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    setIsSaving(true);
    setErrorMsg(null);
    
    // Capture state for processing
    const dataToSave = {
      plate: plate,
      invoice,
      returnType,
      defect,
      quantity: quantity ? parseFloat(quantity) : null,
      expirationDate: hasExpiration ? `${selYear}-${selMonth}-${selDay}` : null,
      productCode: selectedProduct?.codigo || 'N/A',
      productName: selectedProduct?.nombre || 'N/A'
    };
    const photosToSave = [...photos];

    try {
      const photoUrls: string[] = [];
      for (let i = 0; i < photosToSave.length; i++) {
        const file = photosToSave[i];
        const fileName = generateStorageFileName();
        const filePath = `logistica_Inversa/${fileName}`;

        try {
          const compressedBlob = await compressImage(file, 1024, 0.6);
          const { error: uploadError } = await supabase.storage
            .from('evidencias')
            .upload(filePath, compressedBlob, { contentType: 'image/jpeg' });

          if (uploadError) {
            console.error("Error uploading reverse logistics photo:", uploadError);
            continue;
          }

          const { data: { publicUrl } } = supabase.storage
            .from('evidencias')
            .getPublicUrl(filePath);

          photoUrls.push(publicUrl);
        } catch (compressErr) {
          console.error("Error compressing image:", compressErr);
          // Fallback
          const { error: uploadError } = await supabase.storage
            .from('evidencias')
            .upload(filePath, file, { contentType: 'image/jpeg' });

          if (uploadError) {
            console.error("Error uploading reverse logistics photo:", uploadError);
            continue;
          }

          const { data: { publicUrl } } = supabase.storage
            .from('evidencias')
            .getPublicUrl(filePath);

          photoUrls.push(publicUrl);
        }
      }

      const { error } = await supabase.from('logistica_inversa').insert([{
        placa_vehiculo: dataToSave.plate,
        factura_guia: dataToSave.invoice,
        tipo_devolucion: dataToSave.returnType,
        defecto: dataToSave.defect,
        cantidad: dataToSave.quantity,
        fecha_vencimiento_producto: dataToSave.expirationDate,
        fotos: photoUrls,
        codigo_producto: dataToSave.productCode,
        nombre_producto: dataToSave.productName,
        usuario_registro: currentUser?.nombre || 'SISTEMA',
        cliente_destino: 'N/A'
      }]);

      if (error) throw error;
      
      // Success
      resetForm();
      setSuccessMsg(true);
      setTimeout(() => setSuccessMsg(false), 3000);
      fetchItems();
    } catch (err: any) {
      console.error("Error saving reverse logistics:", err);
      setErrorMsg("Error al guardar: " + (err.message || "Error desconocido"));
      setTimeout(() => setErrorMsg(null), 5000);
    } finally {
      setIsSaving(false);
    }
  };

  const resetForm = () => {
    setPlate('');
    setInvoice('');
    setReturnType('SOBRANTE');
    setDefect('ROTO / DAÑADO');
    setQuantity('');
    setPhotos([]);
    setPhotoPreviews([]);
    setSelectedProduct(null);
    setProductSearch('');
    setHasExpiration(false);
  };

  const handleDownloadExcel = () => {
    try {
      const data = filteredItems.map(item => ({
        'FECHA REGISTRO': new Date(item.registeredAt).toLocaleString(),
        'PLACA VEHICULO': item.plate,
        'N° FACTURA / GUIA': item.invoice,
        'CODIGO PRODUCTO': item.productCode || 'N/A',
        'NOMBRE PRODUCTO': item.productName || 'N/A',
        'CANTIDAD': item.quantity || 0,
        'TIPO DEVOLUCION': item.returnType,
        'DEFECTO DETECTADO': item.defect,
        'FECHA VENCIMIENTO': item.expirationDate,
        'USUARIO REGISTRO': item.registeredBy || '---',
        'FOTOS (URL)': item.photos.join(' ; ')
      }));

      const ws = XLSX.utils.json_to_sheet(data);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "Retornos");
      XLSX.writeFile(wb, `historial_retornos_${new Date().toISOString().split('T')[0]}.xlsx`);
    } catch (err: any) {
      alert("Error al generar Excel: " + err.message);
    }
  };

  const filteredItems = items.filter(i => {
    const matchesSearch = (i.plate || '').includes(searchTerm.toUpperCase()) || 
      (i.invoice || '').includes(searchTerm) ||
      (i.productName && i.productName.toLowerCase().includes(searchTerm.toLowerCase())) ||
      (i.productCode && i.productCode.toLowerCase().includes(searchTerm.toLowerCase()));
    
    const matchesType = filterReturnType === 'ALL' || i.returnType === filterReturnType;
    
    const itemDate = new Date(i.registeredAt).toISOString().split('T')[0];
    const matchesStartDate = !filterStartDate || itemDate >= filterStartDate;
    const matchesEndDate = !filterEndDate || itemDate <= filterEndDate;
    
    return matchesSearch && matchesType && matchesStartDate && matchesEndDate;
  });

  // Pagination Logic
  const totalPages = Math.ceil(filteredItems.length / itemsPerPage);
  const paginatedItems = filteredItems.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);

  // Reset page when filters change
  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, filterReturnType, filterStartDate, filterEndDate]);

  return (
    <div className="flex flex-col h-full bg-slate-50 dark:bg-[#0f172a]">
      {/* Tabs */}
      <div className="bg-white dark:bg-[#1e293b] border-b border-gray-200 dark:border-slate-700 shrink-0 flex shadow-sm z-10">
        <button 
          onClick={() => setActiveTab('REGISTER')}
          className={`flex-1 py-4 text-[10px] font-black uppercase tracking-widest border-b-4 transition-all ${activeTab === 'REGISTER' ? 'border-[#009ED6] text-[#009ED6] bg-[#009ED6]/5' : 'border-transparent text-slate-400'}`}
        >
          <PlusCircle className="w-4 h-4 mx-auto mb-1" />
          Registro Devolución
        </button>
        <button 
          onClick={() => setActiveTab('HISTORY')}
          className={`flex-1 py-4 text-[10px] font-black uppercase tracking-widest border-b-4 transition-all ${activeTab === 'HISTORY' ? 'border-[#009ED6] text-[#009ED6] bg-[#009ED6]/5' : 'border-transparent text-slate-400'}`}
        >
          <History className="w-4 h-4 mx-auto mb-1" />
          Historial Retornos
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-2 md:p-4 custom-scrollbar">
        {activeTab === 'REGISTER' ? (
          <div className="max-w-2xl mx-auto animate-fade-in relative">
             {isProcessing && (
                <div className="absolute inset-0 z-50 bg-white/50 backdrop-blur-sm flex items-center justify-center rounded-[1.5rem]">
                    <div className="w-8 h-8 border-4 border-[#009ED6] border-t-transparent rounded-full animate-spin"></div>
                </div>
             )}
             <div className="bg-white dark:bg-[#1e293b] p-4 md:p-5 rounded-[1.5rem] border border-gray-100 dark:border-slate-700 shadow-xl">
                <div className="flex items-center gap-3 mb-4">
                    <div className="bg-[#009ED6]/10 text-[#009ED6] p-2 rounded-xl shadow-inner"><Truck className="w-5 h-5" /></div>
                    <div>
                        <h2 className="text-lg font-black text-slate-800 dark:text-white uppercase tracking-tight">Logística Inversa</h2>
                    </div>
                </div>

                <form onSubmit={handleSubmit} className="space-y-3">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        <div className="space-y-1">
                            <label className="text-[9px] font-black text-slate-500 uppercase tracking-widest ml-1">Tipo de Devolución</label>
                            <select className="w-full p-3 border dark:border-slate-700 rounded-xl bg-gray-50 dark:bg-slate-800 dark:text-white font-bold outline-none border-blue-200 text-sm" value={returnType} onChange={e => setReturnType(e.target.value as any)}>
                                <option value="SOBRANTE">Sobrante</option>
                                <option value="RECHAZO">Rechazo</option>
                                <option value="RECOJO">Recojo</option>
                                <option value="DEVOLUCION">Devolución</option>
                                <option value="FALTANTES">Faltantes</option>
                                <option value="NOTA DE CREDITO">Nota_credito</option>
                                <option value="PEND TOTAL">Pendiente Total</option>
                                <option value="PENDIENTE PARCIAL">Pendiente Parcial</option>
                                <option value="CAMBIO MANO A MANO">Cambio Mano a Mano</option>
                                <option value="VENCIMIENTO">Vencimiento</option>
                                <option value="ANULADO">Anulado</option>
                                <option value="OTROS">Otros</option>
                            </select>
                        </div>
                        <div className="space-y-1">
                            <label className="text-[9px] font-black text-slate-500 uppercase tracking-widest ml-1">Carro Placa</label>
                            <select className="w-full p-3 border dark:border-slate-700 rounded-xl bg-gray-50 dark:bg-slate-800 dark:text-white font-black text-base outline-none focus:ring-4 focus:ring-[#009ED6]/10" value={plate} onChange={e => setPlate(e.target.value)}>
                                <option value="">Seleccionar Placa...</option>
                                {PLATES.map(p => <option key={p} value={p}>{p}</option>)}
                            </select>
                        </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        <div className="space-y-1">
                            <label className="text-[9px] font-black text-slate-500 uppercase tracking-widest ml-1">N° Factura / Guía</label>
                            <input type="text" placeholder="F001-000123" className="w-full p-3 border dark:border-slate-700 rounded-xl bg-gray-50 dark:bg-slate-800 dark:text-white font-black text-base outline-none focus:ring-4 focus:ring-[#009ED6]/10" value={invoice} onChange={e => setInvoice(e.target.value)} />
                        </div>
                        <div className="space-y-1">
                            <label className="text-[9px] font-black text-slate-500 uppercase tracking-widest ml-1">Cantidad</label>
                            <input type="number" step="any" placeholder="0.00" className="w-full p-3 border dark:border-slate-700 rounded-xl bg-gray-50 dark:bg-slate-800 dark:text-white font-black text-base outline-none focus:ring-4 focus:ring-[#009ED6]/10" value={quantity} onChange={e => setQuantity(e.target.value)} />
                        </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        <div className="space-y-1">
                            <label className="text-[9px] font-black text-slate-500 uppercase tracking-widest ml-1">Defecto Detectado</label>
                            <select className="w-full p-3 border dark:border-slate-700 rounded-xl bg-gray-50 dark:bg-slate-800 dark:text-white font-bold outline-none text-sm" value={defect} onChange={e => setDefect(e.target.value as any)}>
                                <option value="ROTO / DAÑADO">Roto / Dañado</option>
                                <option value="VENCIDO">Vencido</option>
                                <option value="BUEN ESTADO">Buen_estado</option>
                                <option value="OBSERVADO">Observado</option>
                                <option value="OTROS">Otros</option>
                            </select>
                        </div>
                    </div>

                    <div className="space-y-1 relative">
                        <div className="flex items-center justify-between">
                            <label className="text-[9px] font-black text-slate-500 uppercase tracking-widest ml-1">Buscar Producto</label>
                            {onRefreshCatalog && (
                                <button 
                                    type="button"
                                    onClick={() => {
                                        setIsSearchingProducts(true);
                                        onRefreshCatalog().finally(() => setIsSearchingProducts(false));
                                    }}
                                    className="text-[8px] font-black text-[#009ED6] uppercase flex items-center gap-1 hover:opacity-70 transition-opacity"
                                    title="Sincronizar catálogo con la base de datos"
                                >
                                    <RefreshCw className={`w-2.5 h-2.5 ${isSearchingProducts ? 'animate-spin' : ''}`} />
                                    Sincronizar
                                </button>
                            )}
                        </div>
                        <div className="relative">
                            <input 
                                type="text" 
                                placeholder="Código, EAN o Nombre..." 
                                className={`w-full p-3 pr-10 border dark:border-slate-700 rounded-xl bg-gray-50 dark:bg-slate-800 dark:text-white font-bold outline-none focus:ring-4 focus:ring-[#009ED6]/10 text-sm ${selectedProduct ? 'border-green-500 bg-green-50' : ''}`} 
                                value={selectedProduct ? `${selectedProduct.codigo} - ${selectedProduct.nombre}` : productSearch} 
                                onChange={e => {
                                    setProductSearch(e.target.value);
                                    if (selectedProduct) setSelectedProduct(null);
                                }}
                                readOnly={!!selectedProduct}
                            />
                            {selectedProduct ? (
                                <button type="button" onClick={() => setSelectedProduct(null)} className="absolute right-3 top-1/2 -translate-y-1/2 text-red-500"><XCircle className="w-5 h-5" /></button>
                            ) : (
                                <div className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center gap-2">
                                    {isSearchingProducts && <div className="w-4 h-4 border-2 border-blue-500 border-t-transparent rounded-full animate-spin"></div>}
                                    <Search className="text-slate-400 w-4 h-4" />
                                </div>
                            )}
                        </div>

                        {searchResults.length > 0 && !selectedProduct && (
                            <div className="absolute z-50 w-full mt-1 bg-white dark:bg-slate-800 border dark:border-slate-700 rounded-xl shadow-2xl overflow-hidden max-h-72 overflow-y-auto">
                                {searchResults.map(p => (
                                    <button 
                                        key={p.id} 
                                        type="button"
                                        onClick={() => {
                                            setSelectedProduct(p);
                                            setSearchResults([]);
                                        }}
                                        className="w-full p-3 text-left hover:bg-slate-50 dark:hover:bg-slate-700 border-b dark:border-slate-700 last:border-0 transition-colors flex items-center gap-3"
                                    >
                                        <div className="bg-blue-100 text-blue-600 p-2 rounded-lg"><Box className="w-4 h-4" /></div>
                                        <div>
                                            <div className="font-black text-slate-800 dark:text-white text-xs">{p.codigo}</div>
                                            <div className="text-[10px] text-blue-600 dark:text-blue-400 font-bold leading-tight">{p.nombre}</div>
                                        </div>
                                    </button>
                                ))}
                            </div>
                        )}
                    </div>

                    {/* Expiration Date Selector */}
                    <div className="bg-[#82BD02]/5 p-3 rounded-2xl border border-[#82BD02]/20 space-y-2">
                        <div className="flex items-center justify-between">
                            <label className="text-[9px] font-black text-[#82BD02] uppercase tracking-widest flex items-center gap-2">
                               <Clock className="w-3 h-3" /> Vencimiento Producto
                            </label>
                            <div className="flex items-center gap-2">
                                <span className="text-[8px] font-bold text-slate-400 uppercase">¿Tiene Vencimiento?</span>
                                <button 
                                    type="button"
                                    onClick={() => setHasExpiration(!hasExpiration)}
                                    className={`w-8 h-4 rounded-full transition-colors relative ${hasExpiration ? 'bg-[#82BD02]' : 'bg-slate-300'}`}
                                >
                                    <div className={`absolute top-0.5 w-3 h-3 bg-white rounded-full transition-all ${hasExpiration ? 'left-[18px]' : 'left-0.5'}`}></div>
                                </button>
                            </div>
                        </div>
                        
                        {hasExpiration && (
                            <div className="flex gap-2 animate-fade-in">
                                <select value={selDay} onChange={e => setSelDay(e.target.value)} className="flex-1 p-2 border dark:border-slate-700 rounded-xl bg-white dark:bg-slate-800 dark:text-white font-black outline-none shadow-sm text-sm">
                                    {Array.from({length: 31}, (_, i) => (i + 1).toString().padStart(2, '0')).map(d => <option key={d} value={d}>{d}</option>)}
                                </select>
                                <select value={selMonth} onChange={e => setSelMonth(e.target.value)} className="flex-[1.5] p-2 border dark:border-slate-700 rounded-xl bg-white dark:bg-slate-800 dark:text-white font-black outline-none shadow-sm text-sm">
                                    {months.map(m => <option key={m.v} value={m.v}>{m.l}</option>)}
                                </select>
                                <select value={selYear} onChange={e => setSelYear(e.target.value)} className="flex-1 p-2 border dark:border-slate-700 rounded-xl bg-white dark:bg-slate-800 dark:text-white font-black outline-none shadow-sm text-sm">
                                    {years.map(y => <option key={y} value={y}>{y}</option>)}
                                </select>
                            </div>
                        )}
                    </div>

                    {/* Photos */}
                    <div className="space-y-2">
                        <label className="text-[9px] font-black text-slate-500 uppercase tracking-widest ml-1">Fotos Evidencia ({photos.length}/3)</label>
                        <div className="flex gap-3 overflow-x-auto pb-1 no-scrollbar">
                            {photoPreviews.map((p, i) => (
                                <div key={i} className="relative w-16 h-16 rounded-xl border-2 border-white dark:border-slate-700 overflow-hidden shadow-md shrink-0">
                                    <img src={p} className="w-full h-full object-cover" />
                                    <button type="button" onClick={() => removePhoto(i)} className="absolute top-0.5 right-0.5 bg-red-600 text-white rounded-full p-0.5 shadow-lg"><Trash className="w-2.5 h-2.5" /></button>
                                </div>
                            ))}
                            {photoPreviews.length < 3 && (
                                <label className="w-16 h-16 border-2 border-dashed border-[#009ED6]/20 bg-[#009ED6]/5 rounded-xl flex flex-col items-center justify-center cursor-pointer hover:bg-[#009ED6]/10 transition-colors shrink-0 group">
                                    <Camera className="w-5 h-5 text-[#009ED6] group-hover:scale-110 transition-transform" />
                                    <span className="text-[7px] font-black text-[#009ED6] uppercase mt-0.5">Capturar</span>
                                    <input type="file" accept="image/*" capture multiple className="hidden" onChange={handlePhotoUpload} />
                                </label>
                            )}
                        </div>
                    </div>

                    {successMsg && (
                        <div className="bg-emerald-50 dark:bg-emerald-900/20 text-emerald-600 p-2 rounded-xl font-black text-[10px] uppercase flex items-center gap-2 border border-emerald-100 dark:border-emerald-900/30 animate-fade-in">
                            <CheckCircle className="w-4 h-4" /> Registrado con éxito
                        </div>
                    )}

                    {errorMsg && (
                        <div className="bg-red-50 dark:bg-red-900/20 text-red-600 p-2 rounded-xl font-black text-[10px] uppercase flex items-center gap-2 border border-red-100 dark:border-red-900/30 animate-shake">
                            <XCircle className="w-4 h-4" /> {errorMsg}
                        </div>
                    )}

                    <button 
                        type="submit" 
                        disabled={isSaving}
                        className="w-full bg-[#009ED6] hover:bg-[#0088b9] text-white font-black py-3 rounded-2xl shadow-lg shadow-[#009ED6]/20 transition-all active:scale-[0.98] uppercase tracking-widest text-xs flex items-center justify-center gap-2 disabled:opacity-50 disabled:grayscale"
                    >
                        {isSaving ? (
                            <>
                                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                                <span>Guardando...</span>
                            </>
                        ) : (
                            <>
                                <PlusCircle className="w-5 h-5" />
                                <span>Guardar Devolución</span>
                            </>
                        )}
                    </button>
                </form>
             </div>
          </div>
        ) : (
          <div className="max-w-6xl mx-auto space-y-3 animate-fade-in pb-20">
             {/* Filters Header */}
             <div className="bg-white dark:bg-[#1e293b] p-3 rounded-2xl shadow-sm border border-gray-100 dark:border-slate-700 space-y-3">
                <div className="flex flex-wrap gap-3 items-end">
                    <div className="flex-1 min-w-[200px] space-y-1">
                        <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-1">Búsqueda General</label>
                        <div className="relative">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                            <input type="text" placeholder="Placa, Factura o Producto..." className="w-full pl-9 pr-4 py-2 bg-slate-50 dark:bg-slate-800 border-none rounded-xl outline-none font-bold text-slate-700 dark:text-white text-xs" value={searchTerm} onChange={e => setSearchTerm(e.target.value)} />
                        </div>
                    </div>
                    
                    <div className="space-y-1">
                        <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-1">Tipo Devolución</label>
                        <select className="p-2 bg-slate-50 dark:bg-slate-800 border-none rounded-xl outline-none font-bold text-slate-700 dark:text-white text-xs min-w-[120px]" value={filterReturnType} onChange={e => setFilterReturnType(e.target.value)}>
                            <option value="ALL">TODOS</option>
                            <option value="SOBRANTE">SOBRANTE</option>
                            <option value="RECHAZO">RECHAZO</option>
                            <option value="DEVOLUCION">DEVOLUCIÓN</option>
                            <option value="FALTANTES">FALTANTES</option>
                            <option value="PEND TOTAL">PEND. TOTAL</option>
                            <option value="PENDIENTE PARCIAL">PEND. PARCIAL</option>
                            <option value="CAMBIO MANO A MANO">CAMBIO M.A.M</option>
                            <option value="VENCIMIENTO">VENCIMIENTO</option>
                            <option value="OTROS">OTROS</option>
                        </select>
                    </div>

                    <div className="space-y-1">
                        <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-1">Rango de Fechas</label>
                        <div className="flex items-center gap-2 bg-slate-50 dark:bg-slate-800 p-1 rounded-xl">
                            <input type="date" className="bg-transparent border-none outline-none text-[10px] font-bold text-slate-600 dark:text-slate-300 p-1" value={filterStartDate} onChange={e => setFilterStartDate(e.target.value)} />
                            <span className="text-slate-300">/</span>
                            <input type="date" className="bg-transparent border-none outline-none text-[10px] font-bold text-slate-600 dark:text-slate-300 p-1" value={filterEndDate} onChange={e => setFilterEndDate(e.target.value)} />
                        </div>
                    </div>

                    <button 
                        onClick={handleDownloadExcel}
                        className="bg-emerald-600 hover:bg-emerald-700 text-white p-2.5 rounded-xl shadow-lg shadow-emerald-600/20 transition-all flex items-center gap-2 text-[10px] font-black uppercase tracking-widest"
                    >
                        <FileSpreadsheet className="w-4 h-4" />
                        Excel
                    </button>
                </div>
             </div>

             {filteredItems.length === 0 ? (
                 <div className="flex flex-col items-center justify-center py-20 opacity-20">
                    <History className="w-16 h-16 mb-4" />
                    <p className="font-black uppercase tracking-widest text-sm">Sin registros históricos</p>
                 </div>
             ) : (
                 <div className="bg-white dark:bg-[#1e293b] rounded-2xl border border-gray-100 dark:border-slate-700 shadow-xl overflow-hidden">
                    <div className="overflow-x-auto">
                        <table className="w-full text-left border-collapse">
                            <thead>
                                <tr className="bg-slate-50 dark:bg-slate-800/50 border-b dark:border-slate-700">
                                    <th className="p-3 text-[10px] font-black text-slate-400 uppercase tracking-widest">Fecha</th>
                                    <th className="p-3 text-[10px] font-black text-slate-400 uppercase tracking-widest">Placa</th>
                                    <th className="p-3 text-[10px] font-black text-slate-400 uppercase tracking-widest">Factura</th>
                                    <th className="p-3 text-[10px] font-black text-slate-400 uppercase tracking-widest">Producto</th>
                                    <th className="p-3 text-[10px] font-black text-slate-400 uppercase tracking-widest">Cant.</th>
                                    <th className="p-3 text-[10px] font-black text-slate-400 uppercase tracking-widest">Vencimiento</th>
                                    <th className="p-3 text-[10px] font-black text-slate-400 uppercase tracking-widest">Tipo</th>
                                    <th className="p-3 text-[10px] font-black text-slate-400 uppercase tracking-widest">Defecto</th>
                                    <th className="p-3 text-[10px] font-black text-slate-400 uppercase tracking-widest">Usuario</th>
                                    <th className="p-3 text-[10px] font-black text-slate-400 uppercase tracking-widest">Fotos</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y dark:divide-slate-700">
                                {paginatedItems.map(item => (
                                    <tr key={item.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors">
                                        <td className="p-3 text-xs font-bold text-slate-500 whitespace-nowrap">
                                            {new Date(item.registeredAt).toLocaleDateString()}<br/>
                                            <span className="text-sm text-blue-600 font-black">{new Date(item.registeredAt).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</span>
                                        </td>
                                        <td className="p-3">
                                            <span className="bg-blue-100 text-blue-700 px-2 py-1 rounded-lg text-[10px] font-black">{item.plate}</span>
                                        </td>
                                        <td className="p-3 text-xs font-black text-slate-700 dark:text-white">{item.invoice}</td>
                                        <td className="p-3">
                                            <div className="text-xs font-black text-slate-800 dark:text-white truncate max-w-[150px]">{item.productName || 'N/A'}</div>
                                            <div className="text-[9px] text-slate-400 font-bold">{item.productCode || '---'}</div>
                                        </td>
                                        <td className="p-3 text-xs font-black text-blue-600">{item.quantity || 0}</td>
                                        <td className="p-3 text-xs font-bold text-slate-500">
                                            {item.expirationDate || '---'}
                                        </td>
                                        <td className="p-3">
                                            <span className="bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded-full text-[9px] font-black uppercase">{item.returnType}</span>
                                        </td>
                                        <td className="p-3">
                                            <span className="bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full text-[9px] font-black uppercase">{item.defect}</span>
                                        </td>
                                        <td className="p-3 text-xs font-bold text-slate-500">
                                            <div className="flex items-center gap-1">
                                                <div className="w-5 h-5 bg-slate-100 rounded-full flex items-center justify-center">
                                                    <span className="text-[8px] text-slate-400">👤</span>
                                                </div>
                                                {item.registeredBy || '---'}
                                            </div>
                                        </td>
                                        <td className="p-3">
                                            <div className="flex -space-x-2">
                                                {item.photos.map((img, idx) => (
                                                    <button 
                                                        key={idx} 
                                                        onClick={() => setMaximizedImage(img)}
                                                        className="w-8 h-8 rounded-lg border-2 border-white dark:border-slate-800 overflow-hidden shadow-sm hover:scale-110 transition-transform active:scale-95"
                                                    >
                                                        <img src={img} className="w-full h-full object-cover" />
                                                    </button>
                                                ))}
                                                {item.photos.length === 0 && <span className="text-[9px] text-slate-300">Sin fotos</span>}
                                            </div>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>

                    {/* Pagination UI */}
                    {totalPages > 1 && (
                        <div className="p-4 bg-slate-50 dark:bg-slate-800/50 border-t dark:border-slate-700 flex items-center justify-between">
                            <div className="text-[10px] font-black text-slate-400 uppercase tracking-widest">
                                Mostrando {((currentPage - 1) * itemsPerPage) + 1} a {Math.min(currentPage * itemsPerPage, filteredItems.length)} de {filteredItems.length} registros
                            </div>
                            <div className="flex gap-2">
                                <button 
                                    disabled={currentPage === 1}
                                    onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                                    className="px-3 py-1.5 bg-white dark:bg-slate-800 border dark:border-slate-700 rounded-lg text-[10px] font-black uppercase text-slate-500 disabled:opacity-30 transition-all"
                                >
                                    Anterior
                                </button>
                                <div className="flex gap-1">
                                    {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                                        let pageNum;
                                        if (totalPages <= 5) pageNum = i + 1;
                                        else if (currentPage <= 3) pageNum = i + 1;
                                        else if (currentPage >= totalPages - 2) pageNum = totalPages - 4 + i;
                                        else pageNum = currentPage - 2 + i;

                                        return (
                                            <button
                                                key={pageNum}
                                                onClick={() => setCurrentPage(pageNum)}
                                                className={`w-8 h-8 rounded-lg text-[10px] font-black transition-all ${currentPage === pageNum ? 'bg-[#009ED6] text-white' : 'bg-white dark:bg-slate-800 border dark:border-slate-700 text-slate-400'}`}
                                            >
                                                {pageNum}
                                            </button>
                                        );
                                    })}
                                </div>
                                <button 
                                    disabled={currentPage === totalPages}
                                    onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
                                    className="px-3 py-1.5 bg-white dark:bg-slate-800 border dark:border-slate-700 rounded-lg text-[10px] font-black uppercase text-slate-500 disabled:opacity-30 transition-all"
                                >
                                    Siguiente
                                </button>
                            </div>
                        </div>
                    )}
                 </div>
             )}
          </div>
        )}
      </div>

      {/* Image Maximize Modal */}
      {maximizedImage && (
        <div className="fixed inset-0 z-[100] bg-black/90 backdrop-blur-md flex items-center justify-center p-4" onClick={() => setMaximizedImage(null)}>
            <button className="absolute top-6 right-6 text-white/50 hover:text-white transition-colors">
                <XCircle className="w-10 h-10" />
            </button>
            <img 
                src={maximizedImage} 
                className="max-w-full max-h-full rounded-2xl shadow-2xl animate-scale-in object-contain" 
                onClick={e => e.stopPropagation()}
            />
        </div>
      )}
    </div>
  );
};

export default ReverseLogistics;
