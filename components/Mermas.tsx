
import React, { useState, useRef } from 'react';
import { Product, Usuario } from '../types';
import { Search, Scan, Camera, XCircle, AlertTriangle, Trash2, CheckCircle, User, Calendar, FileText, Info } from './Icons';
import { supabase } from '../supabaseClient';
import { compressImage, generateStorageFileName } from '../utils';
import MermaReports from './MermaReports';

interface MermasProps {
    catalog: Product[];
    currentUser: Usuario | null;
}

const Mermas: React.FC<MermasProps> = ({ catalog, currentUser }) => {
    const [view, setView] = useState<'REGISTRY' | 'REPORTS'>('REGISTRY');
    const [searchTerm, setSearchTerm] = useState('');
    const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
    const [quantity, setQuantity] = useState('');
    const [procedencia, setProcedencia] = useState('');
    const [defecto, setDefecto] = useState('');
    const [destino, setDestino] = useState('');
    const [day, setDay] = useState('');
    const [month, setMonth] = useState('');
    const [year, setYear] = useState('');
    const [photos, setPhotos] = useState<{ file: File, preview: string }[]>([]);
    const [isSaving, setIsSaving] = useState(false);
    const [successMsg, setSuccessMsg] = useState<string | null>(null);
    const [errorMsg, setErrorMsg] = useState<string | null>(null);
    const [selectedImage, setSelectedImage] = useState<string | null>(null);

    const searchInputRef = useRef<HTMLInputElement>(null);
    const qtyInputRef = useRef<HTMLInputElement>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);

    const PROCEDENCIA_OPTIONS = ['DISTRIBUCION', 'ALMACEN', 'VENTA', 'DEVOLUCION', 'CAMBIO MANO A MANO', 'CORTE'];
    const DEFECTO_OPTIONS = ['ROTO', 'MAL ESTADO', 'REVENTADO', 'GOLPEADO', 'VENCIDO', 'CALIDAD'];
    const DESTINO_OPTIONS = ['VENTA PERSONAL', 'REMAR', 'DESECHAR', 'DESTRUCCION', 'RECLAMO'];

    const filteredCatalog = catalog.filter(p => 
        p.nombre.toLowerCase().includes(searchTerm.toLowerCase()) || 
        p.codigo.toLowerCase().includes(searchTerm.toLowerCase())
    ).slice(0, 5);

    const handlePhotoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files) {
            const newFiles = Array.from(e.target.files);
            if (photos.length + newFiles.length > 3) {
                alert("Máximo 3 fotos permitidas");
                return;
            }

            const newPhotos = newFiles.map(file => ({
                file,
                preview: URL.createObjectURL(file)
            }));
            setPhotos(prev => [...prev, ...newPhotos]);
        }
    };

    const removePhoto = (index: number) => {
        setPhotos(prev => {
            const newPhotos = [...prev];
            URL.revokeObjectURL(newPhotos[index].preview);
            newPhotos.splice(index, 1);
            return newPhotos;
        });
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!selectedProduct || !quantity || !procedencia || !defecto || !destino || !day || !month || !year) {
            setErrorMsg("Por favor complete todos los campos obligatorios");
            return;
        }

        setIsSaving(true);
        setErrorMsg(null);

        try {
            const uploadedUrls: string[] = [];
            for (const photo of photos) {
                const fileName = generateStorageFileName();
                const filePath = `Mermas/${fileName}`;

                try {
                    const compressedBlob = await compressImage(photo.file, 1024, 0.6);
                    const { data, error: uploadError } = await supabase.storage
                        .from('evidencias')
                        .upload(filePath, compressedBlob, { contentType: 'image/jpeg' });

                    if (uploadError) throw uploadError;

                    if (data) {
                        const { data: { publicUrl } } = supabase.storage
                            .from('evidencias')
                            .getPublicUrl(filePath);
                        uploadedUrls.push(publicUrl);
                    }
                } catch (compressErr) {
                    console.error("Error compressing image:", compressErr);
                    // Fallback to original
                    const { data, error: uploadError } = await supabase.storage
                        .from('evidencias')
                        .upload(filePath, photo.file);
                    
                    if (uploadError) throw uploadError;

                    if (data) {
                        const { data: { publicUrl } } = supabase.storage
                            .from('evidencias')
                            .getPublicUrl(filePath);
                        uploadedUrls.push(publicUrl);
                    }
                }
            }

            const expirationDate = `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
            
            const newMerma = {
                producto_id: selectedProduct.id,
                codigo: selectedProduct.codigo,
                nombre: selectedProduct.nombre,
                cantidad: parseFloat(quantity),
                fecha_vencimiento: expirationDate,
                procedencia,
                defecto,
                destino,
                fotos: uploadedUrls,
                usuario_registro: currentUser?.nombre || 'Desconocido',
                fecha_registro: new Date().toISOString(),
                revisado_calidad: false,
                unidad_medida: selectedProduct.unidad_venta || 'UND',
                sede_id: currentUser?.sede_id
            };

            const { error } = await supabase.from('mermas').insert([newMerma]);
            if (error) throw error;

            setSuccessMsg("Merma registrada correctamente");
            resetForm();
            setTimeout(() => setSuccessMsg(null), 3000);
        } catch (err: any) {
            console.error("Error saving merma:", err);
            setErrorMsg(err.message || "Error al registrar la merma");
        } finally {
            setIsSaving(false);
        }
    };

    const resetForm = () => {
        setSelectedProduct(null);
        setSearchTerm('');
        setQuantity('');
        setProcedencia('');
        setDefecto('');
        setDestino('');
        setDay('');
        setMonth('');
        setYear('');
        setPhotos(prev => {
            prev.forEach(p => URL.revokeObjectURL(p.preview));
            return [];
        });
    };

    if (view === 'REPORTS') {
        return <MermaReports currentUser={currentUser} onBack={() => setView('REGISTRY')} />;
    }

    return (
        <div className="flex flex-col h-full bg-slate-50 overflow-hidden">
            <div className="bg-white border-b border-gray-200 px-4 py-3 flex items-center justify-between sticky top-0 z-20 shadow-sm">
                <div className="flex items-center gap-3">
                    <div className="bg-red-100 p-2 rounded-lg">
                        <Trash2 className="w-5 h-5 text-red-600" />
                    </div>
                    <h1 className="text-lg font-black text-gray-800 uppercase tracking-tight">Registro de Mermas</h1>
                </div>
                <div className="flex items-center gap-3">
                    <button 
                        onClick={() => setView('REPORTS')}
                        className="flex items-center gap-2 text-xs font-black text-blue-600 bg-blue-50 px-3 py-1.5 rounded-full border border-blue-100 hover:bg-blue-100 transition-all"
                    >
                        <FileText className="w-3.5 h-3.5" />
                        REPORTES
                    </button>
                    {currentUser && (
                        <div className="flex items-center gap-2 text-xs font-bold text-gray-500 bg-gray-50 px-3 py-1.5 rounded-full border border-gray-100">
                            <User className="w-3.5 h-3.5" />
                            {currentUser.nombre}
                        </div>
                    )}
                </div>
            </div>

            <div className="flex-1 overflow-y-auto p-4 md:p-6 pb-24 custom-scrollbar">
                <div className="max-w-2xl mx-auto space-y-6">
                    {/* Product Search */}
                    <div className="space-y-2">
                        <label className="text-xs font-black text-gray-400 uppercase tracking-widest flex items-center gap-2">
                            <Scan className="w-4 h-4" /> Buscar Producto
                        </label>
                        {selectedProduct ? (
                            <div className="bg-blue-600 text-white p-4 rounded-xl shadow-lg relative overflow-hidden group">
                                <div className="absolute top-0 right-0 p-2 opacity-10 group-hover:opacity-20 transition-opacity">
                                    <Scan className="w-24 h-24" />
                                </div>
                                <div className="relative z-10 flex justify-between items-start">
                                    <div className="min-w-0 flex-1">
                                        <h3 className="font-black text-lg leading-tight truncate">{selectedProduct.nombre}</h3>
                                        <p className="text-xs font-mono opacity-80 mt-1">{selectedProduct.codigo}</p>
                                        
                                        <div className="mt-4 pt-4 border-t border-white/20 flex flex-wrap gap-4 items-center">
                                            <div className="flex items-center gap-2">
                                                <span className="text-[10px] font-black uppercase opacity-60">UM:</span>
                                                <span className="bg-white/20 px-2 py-0.5 rounded text-xs font-bold">{selectedProduct.unidad_venta || 'UN'}</span>
                                            </div>
                                            <div className="flex items-center gap-2">
                                                <Info className="w-3.5 h-3.5 opacity-60" />
                                                <span className="text-xs font-bold">
                                                    Unidades x Caja: <span className="text-yellow-300">{selectedProduct.unidades_por_caja || 1}</span>
                                                    <span className="opacity-60 ml-1">({selectedProduct.unidad_venta || 'UN'})</span>
                                                </span>
                                            </div>
                                            <div className="flex items-center gap-2">
                                                <span className={`text-[10px] font-black px-2 py-0.5 rounded ${selectedProduct.zona_predeterminada === 'CONGELADO' ? 'bg-cyan-500' : 'bg-orange-500'}`}>
                                                    {selectedProduct.zona_predeterminada || 'SECO'}
                                                </span>
                                            </div>
                                        </div>
                                    </div>
                                    <button 
                                        onClick={() => setSelectedProduct(null)}
                                        className="bg-white/20 hover:bg-white/30 p-1.5 rounded-full transition-colors ml-4"
                                    >
                                        <XCircle className="w-5 h-5" />
                                    </button>
                                </div>
                            </div>
                        ) : (
                            <div className="relative">
                                <input
                                    ref={searchInputRef}
                                    type="text"
                                    placeholder="Escriba código o nombre..."
                                    className="w-full p-4 bg-white border-2 border-gray-100 rounded-xl shadow-sm focus:border-blue-500 outline-none text-base font-bold transition-all"
                                    value={searchTerm}
                                    onChange={e => setSearchTerm(e.target.value)}
                                />
                                <Search className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-300 w-5 h-5" />
                                
                                {searchTerm.length > 0 && (
                                    <div className="absolute w-full bg-white shadow-2xl border border-gray-100 rounded-xl mt-2 overflow-hidden z-30 animate-in fade-in slide-in-from-top-2">
                                        {filteredCatalog.length > 0 ? filteredCatalog.map(p => (
                                            <button
                                                key={p.id}
                                                onClick={() => {
                                                    setSelectedProduct(p);
                                                    setSearchTerm('');
                                                    setTimeout(() => qtyInputRef.current?.focus(), 100);
                                                }}
                                                className="w-full text-left p-4 hover:bg-blue-50 border-b border-gray-50 last:border-0 transition-colors group"
                                            >
                                                <div className="font-black text-gray-800 group-hover:text-blue-700">{p.nombre}</div>
                                                <div className="text-xs text-gray-400 font-mono mt-0.5">{p.codigo}</div>
                                            </button>
                                        )) : (
                                            <div className="p-4 text-center text-gray-400 text-sm italic">No se encontraron productos</div>
                                        )}
                                    </div>
                                )}
                            </div>
                        )}
                    </div>

                    <form onSubmit={handleSubmit} className={`space-y-6 transition-all duration-300 ${selectedProduct ? 'opacity-100' : 'opacity-40 pointer-events-none'}`}>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            {/* Quantity */}
                            <div className="space-y-2">
                                <label className="text-xs font-black text-gray-400 uppercase tracking-widest">Cantidad</label>
                                <input
                                    ref={qtyInputRef}
                                    type="number"
                                    step="0.01"
                                    placeholder="0.00"
                                    className="w-full p-4 bg-white border-2 border-gray-100 rounded-xl shadow-sm focus:border-blue-500 outline-none text-xl font-black text-center"
                                    value={quantity}
                                    onChange={e => setQuantity(e.target.value)}
                                    required
                                />
                            </div>

                            {/* Expiration Date */}
                            <div className="space-y-2">
                                <label className="text-xs font-black text-gray-400 uppercase tracking-widest flex items-center gap-2">
                                    <Calendar className="w-4 h-4" /> Vencimiento
                                </label>
                                <div className="grid grid-cols-2 gap-2">
                                    <select 
                                        className="w-full p-3 bg-white border-2 border-gray-100 rounded-xl text-sm font-bold outline-none focus:border-blue-500"
                                        value={day}
                                        onChange={e => setDay(e.target.value)}
                                        required
                                    >
                                        <option value="">DÍA</option>
                                        {[...Array(31)].map((_, i) => (
                                            <option key={i+1} value={i+1}>{i+1}</option>
                                        ))}
                                    </select>
                                    <select 
                                        className="w-full p-3 bg-white border-2 border-gray-100 rounded-xl text-sm font-bold outline-none focus:border-blue-500"
                                        value={month}
                                        onChange={e => setMonth(e.target.value)}
                                        required
                                    >
                                        <option value="">MES</option>
                                        {['ENE', 'FEB', 'MAR', 'ABR', 'MAY', 'JUN', 'JUL', 'AGO', 'SEP', 'OCT', 'NOV', 'DIC'].map((m, i) => (
                                            <option key={i+1} value={i+1}>{m}</option>
                                        ))}
                                    </select>
                                </div>
                                <div className="flex gap-1">
                                    {[2025, 2026, 2027, 2028, 2029].map(y => (
                                        <button
                                            key={y}
                                            type="button"
                                            onClick={() => setYear(y.toString())}
                                            className={`flex-1 py-2 rounded-lg text-xs font-black transition-all border-2 ${year === y.toString() ? 'bg-blue-600 border-blue-600 text-white shadow-md' : 'bg-white border-gray-100 text-gray-400 hover:border-blue-200'}`}
                                        >
                                            {y}
                                        </button>
                                    ))}
                                </div>
                            </div>
                        </div>

                        {/* Selects */}
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                            <div className="space-y-2">
                                <label className="text-xs font-black text-gray-400 uppercase tracking-widest">Procedencia</label>
                                <select 
                                    className="w-full p-3 bg-white border-2 border-gray-100 rounded-xl text-sm font-bold outline-none focus:border-blue-500"
                                    value={procedencia}
                                    onChange={e => setProcedencia(e.target.value)}
                                    required
                                >
                                    <option value="">SELECCIONE...</option>
                                    {PROCEDENCIA_OPTIONS.map(opt => <option key={opt} value={opt}>{opt}</option>)}
                                </select>
                            </div>
                            <div className="space-y-2">
                                <label className="text-xs font-black text-gray-400 uppercase tracking-widest">Defecto</label>
                                <select 
                                    className="w-full p-3 bg-white border-2 border-gray-100 rounded-xl text-sm font-bold outline-none focus:border-blue-500"
                                    value={defecto}
                                    onChange={e => setDefecto(e.target.value)}
                                    required
                                >
                                    <option value="">SELECCIONE...</option>
                                    {DEFECTO_OPTIONS.map(opt => <option key={opt} value={opt}>{opt}</option>)}
                                </select>
                            </div>
                            <div className="space-y-2">
                                <label className="text-xs font-black text-gray-400 uppercase tracking-widest">Destino</label>
                                <select 
                                    className="w-full p-3 bg-white border-2 border-gray-100 rounded-xl text-sm font-bold outline-none focus:border-blue-500"
                                    value={destino}
                                    onChange={e => setDestino(e.target.value)}
                                    required
                                >
                                    <option value="">SELECCIONE...</option>
                                    {DESTINO_OPTIONS.map(opt => <option key={opt} value={opt}>{opt}</option>)}
                                </select>
                            </div>
                        </div>

                        {/* Photos */}
                        <div className="space-y-3">
                            <label className="text-xs font-black text-gray-400 uppercase tracking-widest flex items-center gap-2">
                                <Camera className="w-4 h-4" /> Evidencia Fotográfica ({photos.length}/3)
                            </label>
                            <div className="flex flex-wrap gap-4">
                                {photos.map((photo, index) => (
                                    <div key={index} className="relative w-24 h-24 rounded-xl overflow-hidden shadow-md border-2 border-white group cursor-zoom-in">
                                        <img 
                                            src={photo.preview} 
                                            alt="Preview" 
                                            className="w-full h-full object-cover hover:opacity-80 transition-opacity" 
                                            onClick={() => setSelectedImage(photo.preview)}
                                        />
                                        <button 
                                            type="button"
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                removePhoto(index);
                                            }}
                                            className="absolute top-1 right-1 bg-red-600 text-white rounded-full p-1 shadow-lg opacity-0 group-hover:opacity-100 transition-opacity"
                                        >
                                            <XCircle className="w-4 h-4" />
                                        </button>
                                    </div>
                                ))}
                                {photos.length < 3 && (
                                    <button
                                        type="button"
                                        onClick={() => fileInputRef.current?.click()}
                                        className="w-24 h-24 border-2 border-dashed border-gray-200 rounded-xl flex flex-col items-center justify-center gap-2 text-gray-400 hover:border-blue-400 hover:text-blue-500 hover:bg-blue-50 transition-all"
                                    >
                                        <Camera className="w-6 h-6" />
                                        <span className="text-[10px] font-black uppercase">Añadir</span>
                                    </button>
                                )}
                            </div>
                            <input
                                ref={fileInputRef}
                                type="file"
                                accept="image/*"
                                capture="environment"
                                className="hidden"
                                onChange={handlePhotoChange}
                                multiple
                            />
                        </div>

                        {/* Messages */}
                        {errorMsg && (
                            <div className="bg-red-50 border-l-4 border-red-500 p-4 rounded-r-xl flex items-center gap-3 animate-in fade-in slide-in-from-left-2">
                                <AlertTriangle className="w-5 h-5 text-red-600" />
                                <p className="text-sm font-bold text-red-800">{errorMsg}</p>
                            </div>
                        )}
                        {successMsg && (
                            <div className="bg-green-50 border-l-4 border-green-500 p-4 rounded-r-xl flex items-center gap-3 animate-in fade-in slide-in-from-left-2">
                                <CheckCircle className="w-5 h-5 text-green-600" />
                                <p className="text-sm font-bold text-green-800">{successMsg}</p>
                            </div>
                        )}

                        {/* Submit Button */}
                        <button
                            type="submit"
                            disabled={isSaving}
                            className={`w-full py-4 rounded-xl text-white font-black uppercase tracking-widest shadow-xl transition-all flex items-center justify-center gap-3 ${isSaving ? 'bg-gray-400 cursor-not-allowed' : 'bg-red-600 hover:bg-red-700 active:scale-[0.98] shadow-red-600/20'}`}
                        >
                            {isSaving ? (
                                <>
                                    <div className="w-5 h-5 border-4 border-white/30 border-t-white rounded-full animate-spin" />
                                    <span>Guardando...</span>
                                </>
                            ) : (
                                <>
                                    <Trash2 className="w-5 h-5" />
                                    <span>Registrar Merma</span>
                                </>
                            )}
                        </button>
                    </form>
                </div>
            </div>

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

export default Mermas;
