
import React, { useState } from 'react';
import { Rack, Zone, ZoneType } from '../types';
import { Trash, Plus, Lock, Snowflake, Sun, Upload, Camera, Monitor as MonitorIcon, Download, RefreshCw, CheckCircle, XCircle } from './Icons';
import { supabase } from '../supabaseClient';

interface ConfigurationProps {
  zones: Zone[];
  racks: Rack[];
  onAddZone: (zone: Zone) => void;
  onDeleteZone: (zoneId: string) => void;
  onAddRack: (rack: Rack) => void;
  onDeleteRack: (rackId: number) => void;
  onToggleBlockSlot: (rackId: number, level: number, position: number) => void;
  onUpdateLocationCode: (slotDbId: string, newCode: string) => Promise<void>;
}

const Configuration: React.FC<ConfigurationProps> = ({
  zones,
  racks,
  onAddZone,
  onDeleteZone,
  onAddRack,
  onDeleteRack,
  onToggleBlockSlot,
  onUpdateLocationCode
}) => {
  const [activeTab, setActiveTab] = useState<'ZONES' | 'RACKS' | 'BLOCKING' | 'LOCATIONS' | 'APPEARANCE' | 'BACKUP'>('ZONES');
  const [isBackingUp, setIsBackingUp] = useState(false);
  const [backupProgress, setBackupProgress] = useState('');
  const [selectedZoneId, setSelectedZoneId] = useState<string>(zones[0]?.id || '');
  const [appLogo, setAppLogo] = useState<string | null>(localStorage.getItem('smartwms_app_logo'));
  const [appFavicon, setAppFavicon] = useState<string | null>(localStorage.getItem('smartwms_app_favicon'));
  const [faviconUrl, setFaviconUrl] = useState('');
  const [selectedRackId, setSelectedRackId] = useState<number>(racks[0]?.id || 0);

  // Form States
  const [newZoneName, setNewZoneName] = useState('');
  const [newZoneType, setNewZoneType] = useState<ZoneType>('SECO');
  const [newRackAisle, setNewRackAisle] = useState('');
  const [newRackLevels, setNewRackLevels] = useState(6);
  const [newRackPositions, setNewRackPositions] = useState(9);

  const isSlotBlocked = (rackId: number, level: number, pos: number) => {
    const rack = racks.find(r => r.id === rackId);
    if (!rack) return false;
    const slot = rack.slots.find(s => s.location.level === level && s.location.position === pos);
    return slot?.isBlocked || false;
  };

  const handleAddZone = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newZoneName) return;
    onAddZone({ id: `zone-${Date.now()}`, name: newZoneName, type: newZoneType });
    setNewZoneName('');
  };

  const handleAddRack = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newRackAisle || !selectedZoneId) return;
    const newRackId = Math.max(...racks.map(r => r.id), 0) + 1;
    const slots = [];
    for (let l = 1; l <= newRackLevels; l++) {
        for (let p = 1; p <= newRackPositions; p++) {
            slots.push({
                id: `${newRackAisle}${newRackId}-${l}-${p}`,
                location: { aisle: newRackAisle, rackId: newRackId, level: l, position: p },
                status: 'empty' as const,
                isBlocked: false
            });
        }
    }
    onAddRack({ id: newRackId, zoneId: selectedZoneId, aisle: newRackAisle.toUpperCase(), levels: newRackLevels, positionsPerLevel: newRackPositions, slots: slots });
    setNewRackAisle('');
  };

  const handleLogoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        const base64 = reader.result as string;
        setAppLogo(base64);
        localStorage.setItem('smartwms_app_logo', base64);
        window.location.reload(); // Recargar para aplicar en todo el sistema
      };
      reader.readAsDataURL(file);
    }
  };

  const handleFaviconUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        const base64 = reader.result as string;
        setAppFavicon(base64);
        localStorage.setItem('smartwms_app_favicon', base64);
        updateFavicon(base64);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleFaviconUrlSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (faviconUrl) {
      setAppFavicon(faviconUrl);
      localStorage.setItem('smartwms_app_favicon', faviconUrl);
      updateFavicon(faviconUrl);
      setFaviconUrl('');
    }
  };

  const updateFavicon = (url: string) => {
    const link: HTMLLinkElement | null = document.querySelector("link[id='favicon']");
    if (link) {
      link.href = url;
    }
  };

  const handleBackup = async () => {
    setIsBackingUp(true);
    setBackupProgress('Iniciando respaldo...');
    
    const tables = [
        'usuarios',
        'zonas',
        'productos',
        'estantes',
        'ubicaciones',
        'paletas_lpn',
        'conteo_inventario',
        'despacho_encabezado',
        'despachos_item',
        'fotos_evidencia',
        'items_mixtos_paleta',
        'logistica_inversa',
        'muestras',
        'ordenes_despacho',
        'tareas',
        'stock_sistema',
        'historial_diferencias'
    ];

    let sql = `-- RESPALDO SMART WMS - ${new Date().toLocaleString()}\n`;
    sql += `-- Generado automáticamente desde la aplicación\n\n`;
    sql += `BEGIN;\n\n`;

    try {
        // Generate DELETE statements in reverse order to avoid FK issues
        sql += `-- Limpieza de datos existentes (en orden inverso de dependencias)\n`;
        const reverseTables = [...tables].reverse();
        for (const table of reverseTables) {
            sql += `DELETE FROM public.${table};\n`;
        }
        sql += `\n`;

        for (const table of tables) {
            setBackupProgress(`Procesando tabla: ${table}...`);
            
            // Fetch all data with pagination
            let allData: any[] = [];
            let from = 0;
            let to = 999;
            let hasMore = true;

            while (hasMore) {
                const { data, error } = await supabase
                    .from(table)
                    .select('*')
                    .range(from, to);

                if (error) throw error;
                if (data && data.length > 0) {
                    allData = [...allData, ...data];
                    if (data.length < 1000) {
                        hasMore = false;
                    } else {
                        from += 1000;
                        to += 1000;
                    }
                } else {
                    hasMore = false;
                }
            }

            if (allData.length > 0) {
                sql += `-- Datos para la tabla: ${table}\n`;
                const columns = Object.keys(allData[0]);
                
                // Chunk inserts to avoid massive statements
                const chunkSize = 100;
                for (let i = 0; i < allData.length; i += chunkSize) {
                    const chunk = allData.slice(i, i + chunkSize);
                    sql += `INSERT INTO public.${table} (${columns.join(', ')}) VALUES\n`;
                    
                    const valuesStrings = chunk.map(row => {
                        const values = columns.map(col => {
                            const val = row[col];
                            if (val === null) return 'NULL';
                            if (typeof val === 'string') return `'${val.replace(/'/g, "''")}'`;
                            if (typeof val === 'boolean') return val ? 'TRUE' : 'FALSE';
                            if (typeof val === 'object') return `'${JSON.stringify(val).replace(/'/g, "''")}'`;
                            return val;
                        });
                        return `(${values.join(', ')})`;
                    });
                    
                    sql += valuesStrings.join(',\n') + ';\n';
                }
                sql += `\n`;
            }
        }

        sql += `COMMIT;`;

        // Download the file
        const blob = new Blob([sql], { type: 'text/sql' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `respaldo_smartwms_${new Date().toISOString().split('T')[0]}.sql`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);

        setBackupProgress('Respaldo completado con éxito.');
        setTimeout(() => setBackupProgress(''), 3000);
    } catch (error: any) {
        console.error("Error en el respaldo:", error);
        setBackupProgress(`Error: ${error.message}`);
    } finally {
        setIsBackingUp(false);
    }
  };

  const filteredRacks = racks.filter(r => r.zoneId === selectedZoneId);

  return (
    <div className="flex flex-col h-full bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
      <div className="bg-slate-50 border-b border-gray-200 p-2 flex gap-2 overflow-x-auto no-scrollbar shrink-0">
        {[
          {id: 'ZONES', label: 'Cámaras'},
          {id: 'RACKS', label: 'Racks'},
          {id: 'BLOCKING', label: 'Bloqueos'},
          {id: 'LOCATIONS', label: 'Ubicaciones'},
          {id: 'APPEARANCE', label: 'Apariencia'},
          {id: 'BACKUP', label: 'Respaldo'}
        ].map(tab => (
          <button 
            key={tab.id}
            onClick={() => setActiveTab(tab.id as any)}
            className={`px-3 py-2 rounded-lg font-bold text-xs whitespace-nowrap transition-all ${activeTab === tab.id ? 'bg-blue-600 text-white shadow-md' : 'text-gray-500 hover:bg-white'}`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-y-auto p-4 custom-scrollbar">
        {activeTab === 'ZONES' && (
          <div className="space-y-6 max-w-xl mx-auto">
             <form onSubmit={handleAddZone} className="bg-blue-50 p-4 rounded-xl border border-blue-100 flex flex-col gap-3">
                <h3 className="font-black text-blue-900 uppercase text-xs tracking-widest">Nueva Cámara</h3>
                <input type="text" className="w-full p-3 border rounded-lg outline-none" placeholder="Nombre (Ej. Congelados)" value={newZoneName} onChange={e => setNewZoneName(e.target.value)} />
                <select className="w-full p-3 border rounded-lg outline-none" value={newZoneType} onChange={(e) => setNewZoneType(e.target.value as ZoneType)}>
                   <option value="SECO">Seco</option><option value="REFRIGERADO">Refrigerado</option><option value="CONGELADO">Congelado</option>
                </select>
                <button type="submit" className="bg-blue-600 text-white py-3 rounded-lg font-black uppercase text-xs shadow-lg">Agregar Cámara</button>
             </form>
             <div className="space-y-2">
                {zones.map(zone => (
                    <div key={zone.id} className="border p-3 rounded-xl flex items-center justify-between">
                        <div className="flex items-center gap-3">
                            <div className={`p-2 rounded-lg ${zone.type === 'SECO' ? 'bg-orange-100 text-orange-600' : 'bg-blue-100 text-blue-600'}`}>
                                {zone.type === 'SECO' ? <Sun className="w-5 h-5"/> : <Snowflake className="w-5 h-5"/>}
                            </div>
                            <div><h4 className="font-bold text-sm">{zone.name}</h4><span className="text-[10px] uppercase font-bold text-gray-400">{zone.type}</span></div>
                        </div>
                        <button onClick={() => onDeleteZone(zone.id)} className="text-red-400 p-2"><Trash className="w-4 h-4"/></button>
                    </div>
                ))}
             </div>
          </div>
        )}

        {activeTab === 'APPEARANCE' && (
          <div className="max-w-xl mx-auto py-6 animate-fade-in space-y-10">
             <div className="text-center">
                <h2 className="text-xl font-black text-slate-800 uppercase tracking-tighter">Identidad Visual</h2>
                <p className="text-gray-500 text-xs mt-1 font-bold uppercase tracking-widest">Personaliza el logo e icono de tu WMS</p>
             </div>
             
             {/* Logo Section */}
             <div className="flex flex-col items-center gap-6">
                <h3 className="text-xs font-black text-gray-400 uppercase">Logo del Sistema</h3>
                <div className="w-32 h-32 rounded-3xl border-4 border-slate-100 shadow-xl overflow-hidden bg-slate-50 flex items-center justify-center relative group">
                   {appLogo ? <img src={appLogo} className="w-full h-full object-cover" /> : <Camera className="w-12 h-12 text-slate-300"/>}
                   <label className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center cursor-pointer">
                      <Upload className="w-8 h-8 text-white" />
                      <input type="file" accept="image/*" className="hidden" onChange={handleLogoUpload} />
                   </label>
                </div>

                <div className="bg-gray-50 p-4 rounded-xl border border-gray-100 w-full">
                   <label className="flex items-center justify-center w-full py-4 border-2 border-dashed border-blue-200 bg-white rounded-2xl cursor-pointer hover:bg-blue-50 transition-all">
                      <Plus className="w-5 h-5 text-blue-600 mr-2" />
                      <span className="text-xs font-black text-blue-800 uppercase">Subir Nuevo Logo</span>
                      <input type="file" accept="image/*" className="hidden" onChange={handleLogoUpload} />
                   </label>
                   {appLogo && (
                      <button onClick={() => { localStorage.removeItem('smartwms_app_logo'); window.location.reload(); }} className="w-full mt-3 py-3 text-red-500 font-bold text-xs uppercase underline">Eliminar Logo</button>
                   )}
                </div>
             </div>

             <hr className="border-gray-100" />

             {/* Favicon Section */}
             <div className="flex flex-col items-center gap-6">
                <h3 className="text-xs font-black text-gray-400 uppercase">Favicon (Icono de Pestaña)</h3>
                <div className="w-16 h-16 rounded-2xl border-2 border-slate-100 shadow-lg overflow-hidden bg-slate-50 flex items-center justify-center">
                   {appFavicon ? <img src={appFavicon} className="w-full h-full object-contain" /> : <MonitorIcon className="w-8 h-8 text-slate-300"/>}
                </div>

                <div className="bg-gray-50 p-6 rounded-2xl border border-gray-100 w-full space-y-4">
                   <div className="space-y-2">
                      <label className="text-[10px] font-black text-gray-400 uppercase ml-2">Subir Archivo (PNG, JPG)</label>
                      <label className="flex items-center justify-center w-full py-3 border-2 border-dashed border-blue-200 bg-white rounded-xl cursor-pointer hover:bg-blue-50 transition-all">
                         <Upload className="w-4 h-4 text-blue-600 mr-2" />
                         <span className="text-[10px] font-black text-blue-800 uppercase">Seleccionar Imagen</span>
                         <input type="file" accept="image/png, image/jpeg" className="hidden" onChange={handleFaviconUpload} />
                      </label>
                   </div>

                   <div className="relative">
                      <div className="absolute inset-0 flex items-center">
                         <div className="w-full border-t border-gray-200"></div>
                      </div>
                      <div className="relative flex justify-center text-[10px] uppercase font-black">
                         <span className="px-2 bg-gray-50 text-gray-400">O por enlace</span>
                      </div>
                   </div>

                   <form onSubmit={handleFaviconUrlSubmit} className="space-y-2">
                      <label className="text-[10px] font-black text-gray-400 uppercase ml-2">URL del Favicon</label>
                      <div className="flex gap-2">
                         <input 
                            type="url" 
                            placeholder="https://ejemplo.com/favicon.png"
                            className="flex-1 p-3 border rounded-xl text-xs outline-none focus:border-blue-500 transition-all"
                            value={faviconUrl}
                            onChange={e => setFaviconUrl(e.target.value)}
                         />
                         <button type="submit" className="bg-blue-600 text-white px-4 rounded-xl font-black text-[10px] uppercase shadow-lg shadow-blue-200">Aplicar</button>
                      </div>
                   </form>

                   {appFavicon && (
                      <button onClick={() => { localStorage.removeItem('smartwms_app_favicon'); window.location.reload(); }} className="w-full mt-2 py-2 text-red-500 font-bold text-[10px] uppercase hover:underline">Restablecer por defecto</button>
                   )}
                </div>
             </div>
          </div>
        )}

        {activeTab === 'RACKS' && (
          <div className="space-y-6 max-w-xl mx-auto">
             <div className="flex items-center gap-3 mb-4">
                <label className="text-xs font-bold text-gray-500 uppercase">Cámara:</label>
                <select className="flex-1 p-2 border rounded-lg text-sm" value={selectedZoneId} onChange={(e) => setSelectedZoneId(e.target.value)}>
                   {zones.map(z => <option key={z.id} value={z.id}>{z.name}</option>)}
                </select>
             </div>
             <form onSubmit={handleAddRack} className="bg-slate-800 p-4 rounded-2xl text-white space-y-4 shadow-xl">
                <h3 className="font-black text-xs uppercase text-blue-400">Crear Rack</h3>
                <div className="grid grid-cols-3 gap-2">
                   <div><label className="text-[10px] block mb-1">Pasillo</label><input type="text" className="w-full p-2 rounded bg-slate-700 uppercase font-black text-center" value={newRackAisle} onChange={e => setNewRackAisle(e.target.value)} /></div>
                   <div><label className="text-[10px] block mb-1">Niveles</label><input type="number" className="w-full p-2 rounded bg-slate-700 font-bold text-center" value={newRackLevels} onChange={e => setNewRackLevels(parseInt(e.target.value))} /></div>
                   <div><label className="text-[10px] block mb-1">Posic.</label><input type="number" className="w-full p-2 rounded bg-slate-700 font-bold text-center" value={newRackPositions} onChange={e => setNewRackPositions(parseInt(e.target.value))} /></div>
                </div>
                <button type="submit" className="w-full bg-blue-600 py-3 rounded-xl font-black uppercase text-xs">Crear Rack</button>
             </form>
             <div className="grid grid-cols-2 gap-3">
                {filteredRacks.map(rack => (
                    <div key={rack.id} className="border p-4 rounded-xl relative group bg-white shadow-sm">
                        <div className="font-black text-slate-800 uppercase text-xs">Rack {rack.id} ({rack.aisle})</div>
                        <div className="text-[10px] text-gray-400 mt-1">{rack.levels * rack.positionsPerLevel} Posiciones</div>
                        <button onClick={() => onDeleteRack(rack.id)} className="absolute top-2 right-2 text-red-300 opacity-0 group-hover:opacity-100 transition-opacity"><Trash className="w-4 h-4"/></button>
                    </div>
                ))}
             </div>
          </div>
        )}

        {activeTab === 'BLOCKING' && (
          <div className="max-w-xl mx-auto text-center space-y-6">
             <div className="bg-yellow-50 p-3 rounded-xl border border-yellow-200 flex items-start gap-2 text-left">
                <Lock className="w-5 h-5 text-yellow-600 mt-1 shrink-0" />
                <p className="text-[10px] text-yellow-800 font-bold leading-tight">Mantenimiento: Toca las posiciones de los racks para bloquearlas. Las bloqueadas aparecen en gris y no pueden recibir LPNs.</p>
             </div>
             <select className="w-full p-2 border rounded-lg text-sm" value={selectedZoneId} onChange={(e) => setSelectedZoneId(e.target.value)}>
                {zones.map(z => <option key={z.id} value={z.id}>{z.name}</option>)}
             </select>
             <div className="space-y-8">
                {filteredRacks.map(rack => {
                    const levels = Array.from({ length: rack.levels }, (_, i) => rack.levels - i);
                    const positions = Array.from({ length: rack.positionsPerLevel }, (_, i) => i + 1);
                    return (
                        <div key={rack.id} className="inline-block p-2 bg-slate-100 rounded-lg">
                            <div className="text-[10px] font-bold text-gray-500 mb-2">Pasillo {rack.aisle}</div>
                            <div className="grid gap-[2px]" style={{ gridTemplateColumns: `repeat(${rack.positionsPerLevel}, 1fr)` }}>
                                {levels.map(level => positions.map(pos => {
                                    const blocked = isSlotBlocked(rack.id, level, pos);
                                    return <div key={`${level}-${pos}`} onClick={() => onToggleBlockSlot(rack.id, level, pos)} className={`w-5 h-5 border rounded-sm cursor-pointer ${blocked ? 'bg-gray-400 border-gray-500' : 'bg-white border-blue-200 hover:bg-red-50'}`}></div>;
                                }))}
                            </div>
                        </div>
                    );
                })}
             </div>
          </div>
        )}

        {activeTab === 'LOCATIONS' && (
          <div className="max-w-2xl mx-auto space-y-6">
             <div className="bg-blue-50 p-4 rounded-xl border border-blue-100">
                <h3 className="font-black text-blue-900 uppercase text-xs tracking-widest mb-2">Gestión de Códigos de Ubicación</h3>
                <p className="text-[10px] text-blue-700 font-bold">Aquí puedes modificar los códigos de cada posición en los racks. Estos códigos son los que se escanean para ubicar mercadería.</p>
             </div>
             <div className="flex items-center gap-3">
                <label className="text-xs font-bold text-gray-500 uppercase">Rack:</label>
                <select className="flex-1 p-2 border rounded-lg text-sm" value={selectedRackId} onChange={(e) => setSelectedRackId(parseInt(e.target.value))}>
                   {racks.map(r => <option key={r.id} value={r.id}>Rack {r.id} ({r.aisle})</option>)}
                </select>
             </div>
             
             {racks.find(r => r.id === selectedRackId) && (
                <div className="bg-white border rounded-xl overflow-hidden shadow-sm">
                   <table className="w-full text-left text-xs">
                      <thead className="bg-slate-50 border-b">
                         <tr>
                            <th className="p-3 font-black uppercase text-[10px] text-slate-500">Nivel</th>
                            <th className="p-3 font-black uppercase text-[10px] text-slate-500">Posición</th>
                            <th className="p-3 font-black uppercase text-[10px] text-slate-500">Código Actual</th>
                            <th className="p-3 font-black uppercase text-[10px] text-slate-500">Acción</th>
                         </tr>
                      </thead>
                      <tbody className="divide-y">
                         {racks.find(r => r.id === selectedRackId)?.slots.sort((a,b) => b.location.level - a.location.level || a.location.position - b.location.position).map(slot => (
                            <LocationRow key={slot.dbId} slot={slot} onUpdate={onUpdateLocationCode} />
                         ))}
                      </tbody>
                   </table>
                </div>
             )}
          </div>
        )}

        {activeTab === 'BACKUP' && (
          <div className="max-w-xl mx-auto py-10 space-y-8 animate-fade-in">
             <div className="text-center">
                <div className="inline-flex p-4 bg-blue-50 rounded-full mb-4">
                    <Download className="w-10 h-10 text-blue-600" />
                </div>
                <h2 className="text-2xl font-black text-slate-800 uppercase tracking-tighter">Respaldo de Base de Datos</h2>
                <p className="text-gray-500 text-xs mt-2 font-bold uppercase tracking-widest max-w-sm mx-auto">
                    Genera un archivo SQL con toda la información de tu sistema para migrar o respaldar tus datos.
                </p>
             </div>

             <div className="bg-slate-50 border-2 border-dashed border-slate-200 rounded-3xl p-8 text-center space-y-6">
                <div className="space-y-2">
                    <p className="text-[10px] font-black text-slate-400 uppercase">Información Incluida</p>
                    <div className="flex flex-wrap justify-center gap-2">
                        {['Productos', 'Inventario', 'Zonas', 'Racks', 'Usuarios', 'Tareas', 'Historial'].map(tag => (
                            <span key={tag} className="px-3 py-1 bg-white border border-slate-200 rounded-full text-[9px] font-bold text-slate-600 uppercase">{tag}</span>
                        ))}
                    </div>
                </div>

                <button 
                    onClick={handleBackup}
                    disabled={isBackingUp}
                    className={`
                        w-full py-5 rounded-2xl font-black uppercase text-sm tracking-widest transition-all flex items-center justify-center gap-3
                        ${isBackingUp ? 'bg-slate-200 text-slate-400 cursor-not-allowed' : 'bg-[#009ED6] text-white shadow-xl shadow-blue-100 hover:scale-[1.02] active:scale-95'}
                    `}
                >
                    {isBackingUp ? (
                        <>
                            <RefreshCw className="w-5 h-5 animate-spin" />
                            <span>Procesando...</span>
                        </>
                    ) : (
                        <>
                            <Download className="w-5 h-5" />
                            <span>Descargar Respaldo SQL</span>
                        </>
                    )}
                </button>

                {backupProgress && (
                    <div className="animate-pulse">
                        <p className={`text-[10px] font-black uppercase ${backupProgress.includes('Error') ? 'text-red-500' : 'text-blue-600'}`}>
                            {backupProgress}
                        </p>
                    </div>
                )}
             </div>

             <div className="bg-amber-50 border border-amber-100 rounded-2xl p-4 flex gap-3">
                <Lock className="w-5 h-5 text-amber-600 shrink-0" />
                <div className="space-y-1">
                    <h4 className="text-[10px] font-black text-amber-900 uppercase">Nota Importante</h4>
                    <p className="text-[9px] text-amber-800 font-medium leading-relaxed">
                        Este archivo contiene sentencias SQL para insertar datos. Para restaurar en un nuevo Supabase, asegúrate de haber creado primero las tablas correspondientes o utiliza el script de inicialización del sistema.
                    </p>
                </div>
             </div>
          </div>
        )}
      </div>
    </div>
  );
};

const LocationRow: React.FC<{ slot: any, onUpdate: any }> = ({ slot, onUpdate }) => {
    const [isEditing, setIsEditing] = useState(false);
    const [newCode, setNewCode] = useState(slot.id);
    const [isSaving, setIsSaving] = useState(false);

    const handleSave = async () => {
        if (!newCode || newCode === slot.id) {
            setIsEditing(false);
            return;
        }
        setIsSaving(true);
        try {
            await onUpdate(slot.dbId, newCode.toUpperCase());
            setIsEditing(false);
        } catch (err) {
            alert("Error al actualizar código");
        } finally {
            setIsSaving(false);
        }
    };

    return (
        <tr className="hover:bg-slate-50 transition-colors">
            <td className="p-3 font-bold text-slate-400">N{slot.location.level}</td>
            <td className="p-3 font-bold text-slate-400">P{slot.location.position}</td>
            <td className="p-3">
                {isEditing ? (
                    <input 
                        type="text" 
                        className="w-full p-1 border rounded font-black uppercase text-blue-600 outline-none focus:ring-2 focus:ring-blue-500"
                        value={newCode}
                        onChange={e => setNewCode(e.target.value)}
                        autoFocus
                        onKeyDown={e => e.key === 'Enter' && handleSave()}
                    />
                ) : (
                    <span className="font-black text-slate-700 uppercase">{slot.id}</span>
                )}
            </td>
            <td className="p-3">
                {isEditing ? (
                    <div className="flex gap-1">
                        <button 
                            onClick={handleSave}
                            disabled={isSaving}
                            className="p-1 bg-green-500 text-white rounded hover:bg-green-600 disabled:opacity-50"
                        >
                            {isSaving ? '...' : <CheckCircle className="w-3 h-3" />}
                        </button>
                        <button 
                            onClick={() => { setIsEditing(false); setNewCode(slot.id); }}
                            className="p-1 bg-gray-400 text-white rounded hover:bg-gray-500"
                        >
                            <XCircle className="w-3 h-3" />
                        </button>
                    </div>
                ) : (
                    <button 
                        onClick={() => setIsEditing(true)}
                        className="text-blue-500 hover:text-blue-700 font-bold uppercase text-[10px]"
                    >
                        Editar
                    </button>
                )}
            </td>
        </tr>
    );
};

export default Configuration;
