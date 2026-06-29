
import React, { useState, useEffect } from 'react';
import { Building2, Plus, RefreshCw, Palette, MapPin, Hash, Pencil, Save, X } from './Icons';
import { Volume2, Play, Square, Music, Trash2, Loader2, VolumeX } from 'lucide-react';
import { supabase } from '../supabaseClient';
import { Sede, Usuario } from '../types';

interface BranchManagementProps {
    currentUser: Usuario | null;
}

const BranchManagement: React.FC<BranchManagementProps> = () => {
    const [sedes, setSedes] = useState<Sede[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    
    // New Sede State
    const [newName, setNewName] = useState('');
    const [newCode, setNewCode] = useState('');
    const [newAddress, setNewAddress] = useState('');
    const [newColor, setNewColor] = useState('#009ED6');
    const [newAudioUrl, setNewAudioUrl] = useState('');
    const [showNewForm, setShowNewForm] = useState(false);

    // Edit Sede State
    const [editingSedeId, setEditingSedeId] = useState<string | null>(null);
    const [editName, setEditName] = useState('');
    const [editCode, setEditCode] = useState('');
    const [editAddress, setEditAddress] = useState('');
    const [editColor, setEditColor] = useState('#009ED6');
    const [editAudioUrl, setEditAudioUrl] = useState('');

    const [isUploading, setIsUploading] = useState(false);
    const [playingUrl, setPlayingUrl] = useState<string | null>(null);
    const [audioRef] = useState<HTMLAudioElement>(() => new Audio());

    const togglePlayAudio = (url: string) => {
        if (playingUrl === url) {
            audioRef.pause();
            setPlayingUrl(null);
        } else {
            audioRef.src = url;
            audioRef.play().then(() => {
                setPlayingUrl(url);
            }).catch(err => {
                alert('No se pudo reproducir el audio: ' + err.message);
            });
        }
    };

    useEffect(() => {
        const handleEnded = () => setPlayingUrl(null);
        audioRef.addEventListener('ended', handleEnded);
        return () => {
            audioRef.removeEventListener('ended', handleEnded);
            audioRef.pause();
        };
    }, [audioRef]);

    const handleAudioUpload = async (e: React.ChangeEvent<HTMLInputElement>, isEdit: boolean) => {
        const file = e.target.files?.[0];
        if (!file) return;

        if (!file.name.toLowerCase().endsWith('.mp3') && file.type !== 'audio/mpeg') {
            alert('Por favor, seleccione un archivo .mp3');
            return;
        }

        setIsUploading(true);
        try {
            const code = isEdit ? editCode : newCode;
            const fileExt = 'mp3';
            const fileName = `AudiosAlerta/sede_${code || 'temp'}_${Date.now()}.${fileExt}`;

            const { error: uploadError } = await supabase.storage
                .from('evidencias')
                .upload(fileName, file, {
                    contentType: 'audio/mpeg',
                    cacheControl: '3600',
                    upsert: true
                });

            if (uploadError) throw uploadError;

            const { data: { publicUrl } } = supabase.storage
                .from('evidencias')
                .getPublicUrl(fileName);

            if (isEdit) {
                setEditAudioUrl(publicUrl);
            } else {
                setNewAudioUrl(publicUrl);
            }
        } catch (err: any) {
            alert('Error al subir audio: ' + err.message);
        } finally {
            setIsUploading(false);
        }
    };

    const handleStartEdit = (sede: Sede) => {
        setEditingSedeId(sede.id);
        setEditName(sede.nombre);
        setEditCode(sede.codigo || '');
        setEditAddress(sede.direccion || '');
        setEditColor(sede.color_primario || '#009ED6');
        setEditAudioUrl(sede.sonido_alerta || '');
    };

    const handleUpdateSede = async (e: React.FormEvent, id: string) => {
        e.preventDefault();
        if (!editName || !editCode) return;
        
        try {
            const { data, error } = await supabase
                .from('sedes')
                .update({
                    nombre: editName,
                    codigo: editCode,
                    direccion: editAddress,
                    color_primario: editColor,
                    sonido_alerta: editAudioUrl
                })
                .eq('id', id)
                .select()
                .single();

            if (error) throw error;

            setSedes(sedes.map(s => s.id === id ? data : s));
            setEditingSedeId(null);
        } catch (err: any) {
            alert('Error al actualizar sede: ' + err.message);
        }
    };

    const fetchData = async () => {
        setIsLoading(true);
        try {
            const { data, error } = await supabase
                .from('sedes')
                .select('*')
                .order('nombre', { ascending: true });
            
            if (error) throw error;
            setSedes(data || []);
        } catch (err: any) {
            alert('Error al cargar sedes: ' + err.message);
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => {
        fetchData();
    }, []);

    const handleAddSede = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!newName || !newCode) return;

        try {
            const { data, error } = await supabase
                .from('sedes')
                .insert([{
                    nombre: newName,
                    codigo: newCode,
                    direccion: newAddress,
                    color_primario: newColor,
                    sonido_alerta: newAudioUrl
                }])
                .select()
                .single();

            if (error) throw error;
            
            setSedes([...sedes, data]);
            setNewName('');
            setNewCode('');
            setNewAddress('');
            setNewColor('#009ED6');
            setNewAudioUrl('');
            setShowNewForm(false);
        } catch (err: any) {
            alert('Error al crear sede: ' + err.message);
        }
    };

    const colorOptions = [
        '#009ED6', // SmartRack Blue
        '#82BD02', // Laive Green
        '#F44336', // Red
        '#9C27B0', // Purple
        '#FF9800', // Orange
        '#795548', // Brown
        '#607D8B', // Blue Grey
        '#E91E63', // Pink
        '#3F51B5', // Indigo
        '#4CAF50'  // Green
    ];

    if (isLoading && sedes.length === 0) {
        return (
            <div className="flex flex-col items-center justify-center p-20 animate-pulse">
                <Building2 className="w-16 h-16 text-slate-300 mb-4" />
                <p className="text-slate-400 font-black uppercase tracking-widest italic animate-bounce">Cargando Sedes...</p>
            </div>
        );
    }

    return (
        <div className="p-4 md:p-8 space-y-8 animate-fade-in pb-32 max-w-6xl mx-auto">
            {/* Header section */}
            <div className="flex flex-col md:flex-row md:items-end justify-between gap-6">
                <div>
                    <div className="flex items-center gap-3 mb-2">
                        <div className="w-10 h-10 rounded-2xl bg-[#009ED6]/10 flex items-center justify-center text-[#009ED6]">
                            <Building2 className="w-6 h-6" />
                        </div>
                        <h2 className="text-3xl font-black text-slate-800 dark:text-white uppercase tracking-tighter italic">
                            Gestión de <span className="text-[#009ED6] not-italic">Sedes</span>
                        </h2>
                    </div>
                    <p className="text-slate-400 text-[10px] font-bold uppercase tracking-[0.2em] ml-1">Configuración multisucursal del sistema</p>
                </div>
                
                <div className="flex gap-3">
                    <button 
                        onClick={fetchData}
                        className="p-4 rounded-2xl bg-white dark:bg-slate-800 text-slate-400 hover:text-[#009ED6] transition-all shadow-xl hover:shadow-2xl border border-slate-100 dark:border-slate-700"
                        title="Refrescar"
                    >
                        <RefreshCw className={`w-6 h-6 ${isLoading ? 'animate-spin' : ''}`} />
                    </button>
                    <button 
                        onClick={() => setShowNewForm(!showNewForm)}
                        className={`flex items-center gap-3 px-8 py-4 rounded-2xl font-black text-xs uppercase tracking-widest transition-all shadow-xl hover:shadow-2xl ${showNewForm ? 'bg-slate-100 text-slate-500' : 'bg-[#009ED6] text-white hover:scale-105 active:scale-95'}`}
                    >
                        {showNewForm ? <Plus className="w-5 h-5 rotate-45 transition-transform" /> : <Plus className="w-5 h-5" />}
                        {showNewForm ? 'Cancelar' : 'Nueva Sede'}
                    </button>
                </div>
            </div>

            {/* New Sede Form */}
            {showNewForm && (
                <div className="bg-white dark:bg-slate-800 rounded-[2.5rem] shadow-2xl p-8 md:p-12 border border-slate-100 dark:border-slate-700 animate-slide-up relative overflow-hidden">
                    <div className="absolute top-0 right-0 w-64 h-64 bg-[#009ED6]/5 rounded-bl-[10rem] -mr-32 -mt-32 blur-3xl -z-0"></div>
                    
                    <form onSubmit={handleAddSede} className="relative z-10 space-y-8">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                            <div className="space-y-2">
                                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-4">Nombre de la Sede</label>
                                <div className="relative">
                                    <input 
                                        type="text"
                                        placeholder="Ejem: Sede Regional Sur"
                                        className="w-full bg-slate-50 dark:bg-slate-900/50 dark:text-white px-6 py-4 rounded-2xl border-2 border-transparent focus:border-[#009ED6] outline-none transition-all font-bold placeholder:text-slate-300"
                                        value={newName}
                                        onChange={e => setNewName(e.target.value)}
                                        required
                                    />
                                    <Building2 className="absolute right-6 top-4 w-5 h-5 text-slate-300" />
                                </div>
                            </div>

                            <div className="space-y-2">
                                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-4">Código / ID</label>
                                <div className="relative">
                                    <input 
                                        type="text"
                                        placeholder="Ejem: SUR-01"
                                        className="w-full bg-slate-50 dark:bg-slate-900/50 dark:text-white px-6 py-4 rounded-2xl border-2 border-transparent focus:border-[#009ED6] outline-none transition-all font-bold placeholder:text-slate-300 uppercase"
                                        value={newCode}
                                        onChange={e => setNewCode(e.target.value)}
                                        required
                                    />
                                    <Hash className="absolute right-6 top-4 w-5 h-5 text-slate-300" />
                                </div>
                            </div>

                            <div className="space-y-2 md:col-span-2">
                                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-4">Dirección</label>
                                <div className="relative">
                                    <input 
                                        type="text"
                                        placeholder="Av. Principal 123, Ciudad"
                                        className="w-full bg-slate-50 dark:bg-slate-900/50 dark:text-white px-6 py-4 rounded-2xl border-2 border-transparent focus:border-[#009ED6] outline-none transition-all font-bold placeholder:text-slate-300"
                                        value={newAddress}
                                        onChange={e => setNewAddress(e.target.value)}
                                    />
                                    <MapPin className="absolute right-6 top-4 w-5 h-5 text-slate-300" />
                                </div>
                            </div>

                            <div className="space-y-2 md:col-span-2">
                                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-4">Color de Sede (UX)</label>
                                <div className="flex flex-wrap gap-3 p-4 bg-slate-50 dark:bg-slate-900/50 rounded-2xl">
                                    {colorOptions.map(color => (
                                        <button
                                            key={color}
                                            type="button"
                                            onClick={() => setNewColor(color)}
                                            className={`w-10 h-10 rounded-xl transition-all scale-90 hover:scale-110 flex items-center justify-center ${newColor === color ? 'ring-4 ring-offset-2 ring-slate-200' : ''}`}
                                            style={{ backgroundColor: color }}
                                        >
                                            {newColor === color && <div className="w-2 h-2 bg-white rounded-full shadow-lg" />}
                                        </button>
                                    ))}
                                    <div className="flex items-center gap-3 ml-4 border-l border-slate-200 dark:border-slate-700 pl-4">
                                        <input 
                                            type="color" 
                                            value={newColor}
                                            onChange={e => setNewColor(e.target.value)}
                                            className="w-10 h-10 rounded-xl cursor-pointer bg-transparent border-none"
                                        />
                                        <span className="text-[10px] font-black font-mono text-slate-400 uppercase">{newColor}</span>
                                    </div>
                                </div>
                            </div>
                            <div className="space-y-2 md:col-span-2">
                                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-4">Sonido de Alerta (MP3)</label>
                                <div className="p-6 bg-slate-50 dark:bg-slate-900/50 rounded-2xl border-2 border-dashed border-slate-200 dark:border-slate-800 flex flex-col md:flex-row items-center gap-6">
                                    <div className="w-12 h-12 rounded-xl bg-blue-500/10 flex items-center justify-center text-blue-500 shrink-0">
                                        <Volume2 className="w-6 h-6" />
                                    </div>
                                    <div className="flex-1 text-center md:text-left">
                                        <p className="text-xs font-black text-slate-700 dark:text-slate-300 uppercase">Subir Audio para Alertas</p>
                                        <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider mt-0.5">Formatos soportados: .mp3 solamente. Este sonido se reproducirá cuando lleguen alertas.</p>
                                    </div>
                                    <div className="flex items-center gap-3 shrink-0">
                                        {newAudioUrl ? (
                                            <>
                                                <button
                                                    type="button"
                                                    onClick={() => togglePlayAudio(newAudioUrl)}
                                                    className={`p-3 rounded-xl flex items-center justify-center font-black uppercase text-xs tracking-wider transition-all cursor-pointer ${playingUrl === newAudioUrl ? 'bg-red-500 text-white shadow-lg' : 'bg-emerald-500 text-white shadow-lg'}`}
                                                >
                                                    {playingUrl === newAudioUrl ? <Square className="w-4 h-4" /> : <Play className="w-4 h-4 fill-white" />}
                                                </button>
                                                <button
                                                    type="button"
                                                    onClick={() => setNewAudioUrl('')}
                                                    className="p-3 rounded-xl bg-slate-200 dark:bg-slate-800 text-slate-500 hover:text-red-500 transition-all cursor-pointer"
                                                    title="Eliminar audio"
                                                >
                                                    <Trash2 className="w-4 h-4" />
                                                </button>
                                            </>
                                        ) : (
                                            <label className={`px-6 py-3 rounded-xl font-black text-[10px] uppercase tracking-widest transition-all cursor-pointer shadow-md flex items-center gap-2 ${isUploading ? 'bg-slate-200 text-slate-400 cursor-not-allowed' : 'bg-slate-100 hover:bg-slate-200 text-slate-600'}`}>
                                                {isUploading ? (
                                                    <Loader2 className="w-4 h-4 animate-spin" />
                                                ) : (
                                                    <Music className="w-4 h-4" />
                                                )}
                                                {isUploading ? 'Subiendo...' : 'Seleccionar .mp3'}
                                                <input 
                                                    type="file" 
                                                    accept="audio/mp3,audio/mpeg" 
                                                    onChange={e => handleAudioUpload(e, false)} 
                                                    className="hidden" 
                                                    disabled={isUploading}
                                                />
                                            </label>
                                        )}
                                    </div>
                                </div>
                            </div>
                        </div>

                        <div className="flex gap-4 pt-4">
                            <button 
                                type="submit"
                                className="flex-1 bg-[#009ED6] text-white py-5 rounded-2xl font-black text-xs uppercase tracking-widest shadow-xl hover:shadow-[#009ED6]/20 transition-all hover:scale-[1.02] active:scale-95 flex items-center justify-center gap-3"
                            >
                                <Plus className="w-5 h-5" />
                                Guardar Sede
                            </button>
                        </div>
                    </form>
                </div>
            )}

            {/* List Sedes */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {sedes.map((sede) => {
                    const isEditing = editingSedeId === sede.id;
                    return (
                        <div 
                            key={sede.id} 
                            className="group bg-white dark:bg-slate-800 rounded-[2.5rem] shadow-xl hover:shadow-2xl border border-slate-100 dark:border-slate-700 p-8 transition-all flex flex-col relative overflow-hidden min-h-[350px]"
                        >
                            {isEditing ? (
                                <form onSubmit={(e) => handleUpdateSede(e, sede.id)} className="space-y-4 flex flex-col h-full justify-between flex-1">
                                    <div>
                                        <div className="text-xs font-black text-[#009ED6] uppercase tracking-widest mb-3 flex items-center gap-2">
                                            <Pencil className="w-4 h-4 shrink-0" /> Configurar Sede
                                        </div>
                                        
                                        <div className="space-y-3">
                                            <div className="space-y-1">
                                                <label className="text-[9px] font-black text-slate-400 uppercase tracking-wider block">Código / ID</label>
                                                <input 
                                                    type="text"
                                                    className="w-full bg-slate-50 dark:bg-slate-900/50 dark:text-white px-4 py-2.5 rounded-xl border-2 border-transparent focus:border-[#009ED6] outline-none transition-all font-bold text-xs uppercase"
                                                    value={editCode}
                                                    onChange={e => setEditCode(e.target.value)}
                                                    required
                                                />
                                            </div>

                                            <div className="space-y-1">
                                                <label className="text-[9px] font-black text-slate-400 uppercase tracking-wider block">Nombre de la Sede</label>
                                                <input 
                                                    type="text"
                                                    className="w-full bg-slate-50 dark:bg-slate-900/50 dark:text-white px-4 py-2.5 rounded-xl border-2 border-transparent focus:border-[#009ED6] outline-none transition-all font-bold text-xs"
                                                    value={editName}
                                                    onChange={e => setEditName(e.target.value)}
                                                    required
                                                />
                                            </div>

                                            <div className="space-y-1">
                                                <label className="text-[9px] font-black text-slate-400 uppercase tracking-wider block">Dirección</label>
                                                <input 
                                                    type="text"
                                                    className="w-full bg-slate-50 dark:bg-slate-900/50 dark:text-white px-4 py-2.5 rounded-xl border-2 border-transparent focus:border-[#009ED6] outline-none transition-all font-bold text-xs"
                                                    value={editAddress}
                                                    onChange={e => setEditAddress(e.target.value)}
                                                />
                                            </div>

                                            <div className="space-y-1">
                                                <label className="text-[9px] font-black text-slate-400 uppercase tracking-wider block">Sonido Alerta (.mp3)</label>
                                                <div className="p-3 bg-slate-50 dark:bg-slate-900/50 rounded-xl border border-slate-200 dark:border-slate-800 flex items-center justify-between gap-3">
                                                    <div className="flex items-center gap-2 min-w-0">
                                                        <Volume2 className="w-4 h-4 text-slate-400 shrink-0" />
                                                        <span className="text-[10px] font-bold text-slate-500 truncate" title={editAudioUrl || 'Sin sonido configurado'}>
                                                            {editAudioUrl ? 'Audio subido ✅' : 'Sin sonido configurado'}
                                                        </span>
                                                    </div>
                                                    <div className="flex items-center gap-1.5 shrink-0">
                                                        {editAudioUrl ? (
                                                            <>
                                                                <button
                                                                    type="button"
                                                                    onClick={() => togglePlayAudio(editAudioUrl)}
                                                                    className={`p-1.5 rounded-lg transition-all cursor-pointer ${playingUrl === editAudioUrl ? 'bg-red-500 text-white' : 'bg-emerald-500 text-white'}`}
                                                                >
                                                                    {playingUrl === editAudioUrl ? <Square className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5 fill-white" />}
                                                                </button>
                                                                <button
                                                                    type="button"
                                                                    onClick={() => setEditAudioUrl('')}
                                                                    className="p-1.5 rounded-lg bg-slate-200 dark:bg-slate-800 text-slate-500 hover:text-red-500 transition-all cursor-pointer"
                                                                    title="Eliminar audio"
                                                                >
                                                                    <Trash2 className="w-3.5 h-3.5" />
                                                                </button>
                                                            </>
                                                        ) : (
                                                            <label className={`px-3 py-1.5 rounded-lg font-black text-[9px] uppercase tracking-wider transition-all cursor-pointer flex items-center gap-1 ${isUploading ? 'bg-slate-200 text-slate-400' : 'bg-[#009ED6] text-white'}`}>
                                                                {isUploading ? (
                                                                    <Loader2 className="w-3 h-3 animate-spin" />
                                                                ) : (
                                                                    <Music className="w-3 h-3" />
                                                                )}
                                                                {isUploading ? 'Subiendo' : 'Subir'}
                                                                <input 
                                                                    type="file" 
                                                                    accept="audio/mp3,audio/mpeg" 
                                                                    onChange={e => handleAudioUpload(e, true)} 
                                                                    className="hidden" 
                                                                    disabled={isUploading}
                                                                />
                                                            </label>
                                                        )}
                                                    </div>
                                                </div>
                                            </div>

                                            <div className="space-y-2">
                                                <label className="text-[10px] font-black text-slate-400 uppercase tracking-wider block">Color de Sede</label>
                                                <div className="flex flex-col gap-3 p-3 bg-slate-50 dark:bg-slate-900/50 rounded-2xl border border-slate-100 dark:border-slate-800 shadow-inner">
                                                    {/* Color Presets */}
                                                    <div className="flex flex-wrap gap-1.5 justify-start">
                                                        {colorOptions.map(color => (
                                                            <button
                                                                key={color}
                                                                type="button"
                                                                onClick={() => setEditColor(color)}
                                                                className={`w-7 h-7 rounded-full transition-all hover:scale-110 active:scale-95 flex items-center justify-center relative ${editColor.toLowerCase() === color.toLowerCase() ? 'ring-2 ring-offset-2 ring-slate-400 dark:ring-offset-slate-900 z-10' : ''}`}
                                                                style={{ backgroundColor: color }}
                                                                title={color}
                                                            >
                                                                {editColor.toLowerCase() === color.toLowerCase() && (
                                                                    <div className="w-1.5 h-1.5 bg-white rounded-full shadow-md" />
                                                                )}
                                                            </button>
                                                        ))}
                                                    </div>

                                                    {/* Custom Picker Trigger and Manual input */}
                                                    <div className="flex items-center gap-3 pt-2.5 border-t border-slate-100 dark:border-slate-800">
                                                        <div className="flex items-center gap-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 px-3 py-1.5 rounded-xl shadow-sm">
                                                            <input 
                                                                type="color" 
                                                                value={editColor}
                                                                onChange={e => setEditColor(e.target.value)}
                                                                className="w-7 h-7 rounded-lg cursor-pointer bg-transparent border-0 p-0 shrink-0 outline-none"
                                                                title="Seleccionar color deseado"
                                                            />
                                                            <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest leading-none">Paleta</span>
                                                        </div>
                                                        <div className="flex-1 relative">
                                                            <input 
                                                                type="text"
                                                                value={editColor}
                                                                onChange={e => setEditColor(e.target.value)}
                                                                placeholder="#HEX"
                                                                className="w-full bg-white dark:bg-slate-900 px-4 py-2 rounded-xl border border-slate-200 dark:border-slate-700 outline-none transition-all font-mono font-bold text-xs uppercase focus:border-[#009ED6] focus:ring-1 focus:ring-[#009ED6]/20"
                                                                maxLength={7}
                                                            />
                                                            <div className="absolute right-3.5 top-2.5 w-3 h-3 rounded-full border border-black/10" style={{ backgroundColor: editColor }} />
                                                        </div>
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                    </div>

                                    <div className="pt-4 flex gap-2 mt-auto">
                                        <button 
                                            type="button"
                                            onClick={() => setEditingSedeId(null)}
                                            className="flex-1 bg-slate-100 dark:bg-slate-700 text-slate-500 dark:text-slate-300 py-3 rounded-xl font-black text-[10px] uppercase tracking-widest transition-all flex items-center justify-center gap-1.5"
                                        >
                                            <X className="w-3.5 h-3.5" />
                                            Cancelar
                                        </button>
                                        <button 
                                            type="submit"
                                            className="flex-1 bg-[#009ED6] text-white py-3 rounded-xl font-black text-[10px] uppercase tracking-widest transition-all shadow-md hover:shadow-lg flex items-center justify-center gap-1.5"
                                        >
                                            <Save className="w-3.5 h-3.5" />
                                            Guardar
                                        </button>
                                    </div>
                                </form>
                            ) : (
                                <>
                                    {/* Status badge */}
                                    <div 
                                        className="absolute top-0 right-0 px-6 py-2 rounded-bl-3xl text-[8px] font-black text-white uppercase tracking-widest shadow-lg animate-fade-in"
                                        style={{ backgroundColor: sede.color_primario || '#009ED6' }}
                                    >
                                        {sede.codigo}
                                    </div>

                                    <div className="flex items-center gap-5 mb-6">
                                        <div 
                                            className="w-14 h-14 rounded-2xl flex items-center justify-center text-white shadow-xl transform rotate-3 transition-transform group-hover:rotate-6 shrink-0"
                                            style={{ backgroundColor: sede.color_primario || '#009ED6' }}
                                        >
                                            <Building2 className="w-7 h-7" />
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <h3 className="text-xl font-black text-slate-800 dark:text-white uppercase tracking-tighter leading-tight mb-1 truncate" title={sede.nombre}>{sede.nombre}</h3>
                                            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Sucursal Activa</p>
                                        </div>
                                    </div>

                                    <div className="space-y-4 mb-8">
                                        <div className="flex items-start gap-3">
                                            <MapPin className="w-4 h-4 text-slate-300 mt-0.5 shrink-0" />
                                            <p className="text-xs font-bold text-slate-500 leading-relaxed uppercase">{sede.direccion || 'Dirección no especificada'}</p>
                                        </div>
                                        <div className="flex items-center gap-3">
                                            <Palette className="w-4 h-4 text-slate-300 shrink-0" />
                                            <div className="flex items-center gap-2">
                                                <div className="w-4 h-4 rounded-full shadow-sm border border-black/10" style={{ backgroundColor: sede.color_primario || '#009ED6' }}></div>
                                                <span className="text-[10px] font-black font-mono text-slate-400">{sede.color_primario || '#009ED6'}</span>
                                            </div>
                                        </div>

                                        <div className="pt-2">
                                            {sede.sonido_alerta ? (
                                                <div className="flex items-center justify-between bg-slate-50 dark:bg-slate-900/30 p-2.5 rounded-xl border border-slate-100 dark:border-slate-800">
                                                    <div className="flex items-center gap-2">
                                                        <Volume2 className="w-4 h-4 text-emerald-500 shrink-0" />
                                                        <span className="text-[10px] font-black text-slate-500 uppercase tracking-wider">Audio Alerta Activo</span>
                                                    </div>
                                                    <button
                                                        onClick={() => togglePlayAudio(sede.sonido_alerta!)}
                                                        className={`p-1.5 rounded-lg transition-all cursor-pointer shadow ${playingUrl === sede.sonido_alerta ? 'bg-red-500 text-white' : 'bg-emerald-500 text-white hover:scale-105'}`}
                                                        title={playingUrl === sede.sonido_alerta ? "Detener" : "Probar sonido"}
                                                    >
                                                        {playingUrl === sede.sonido_alerta ? <Square className="w-3 h-3" /> : <Play className="w-3 h-3 fill-white" />}
                                                    </button>
                                                </div>
                                            ) : (
                                                <div className="flex items-center gap-2 text-slate-300 dark:text-slate-600 pl-1">
                                                    <VolumeX className="w-4 h-4" />
                                                    <span className="text-[10px] font-black uppercase tracking-wider">Sin sonido configurado</span>
                                                </div>
                                            )}
                                        </div>
                                    </div>

                                    <div className="mt-auto flex gap-3">
                                         <button 
                                            onClick={() => handleStartEdit(sede)}
                                            className="flex-1 bg-blue-50 dark:bg-slate-700 hover:bg-blue-100 dark:hover:bg-slate-600 text-[#009ED6] dark:text-white py-4 rounded-2xl font-black text-[10px] uppercase tracking-widest transition-all flex items-center justify-center gap-2"
                                        >
                                            <Pencil className="w-4 h-4" />
                                            Configurar
                                        </button>
                                    </div>
                                </>
                            )}
                        </div>
                    );
                })}

                {sedes.length === 0 && !isLoading && (
                    <div className="col-span-full py-20 text-center">
                        <Building2 className="w-16 h-16 text-slate-200 mx-auto mb-4" />
                        <h3 className="text-xl font-black text-slate-300 uppercase tracking-tighter italic">No hay sedes configuradas</h3>
                        <p className="text-slate-400 text-[10px] font-bold uppercase tracking-widest mt-2">Pulse "Nueva Sede" para empezar</p>
                    </div>
                )}
            </div>
        </div>
    );
};

export default BranchManagement;
