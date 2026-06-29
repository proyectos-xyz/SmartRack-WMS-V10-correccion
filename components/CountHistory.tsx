
import React, { useState, useEffect } from 'react';
import { ZoneType, StocktakeRecord } from '../types';
import { Clock, User, FileSpreadsheet, History, Sun, Snowflake, RefreshCw, Camera, XCircle } from './Icons';
import { formatDate } from '../utils';
import { supabase } from '../supabaseClient';

interface CountHistoryProps {
}

const CountHistory: React.FC<CountHistoryProps> = () => {
  const [currentUser] = useState(() => {
    try {
      const saved = localStorage.getItem('smartwms_user');
      return saved ? JSON.parse(saved) : null;
    } catch (e) {
      return null;
    }
  });
  const [records, setRecords] = useState<StocktakeRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeFilter, setActiveFilter] = useState<FilterType>('ALL');
  const [searchTerm, setSearchTerm] = useState('');
  
  // Date Filters
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [selectedPhotos, setSelectedPhotos] = useState<string[] | null>(null);

  // Sorting
  const [sortConfig, setSortConfig] = useState<{ key: SortKey; direction: SortDirection }>({
    key: 'fecha_registro',
    direction: 'desc'
  });

  useEffect(() => {
    fetchRecords();
  }, []);

  const fetchRecords = async () => {
    setLoading(true);
    try {
      let query = supabase
        .from('conteo_inventario')
        .select('*');
      
      const sedeId = currentUser?.sede_id;
      if (sedeId) {
        query = query.eq('sede_id', sedeId);
      }
      
      const { data, error } = await query.order('fecha_registro', { ascending: false });
      
      if (error) throw error;
      setRecords(data || []);
    } catch (err: any) {
      console.error('Error fetching stocktake records:', err.message);
    } finally {
      setLoading(false);
    }
  };

  type FilterType = 'ALL' | ZoneType;
  type SortKey = 'fecha_registro' | 'fecha_vencimiento';
  type SortDirection = 'asc' | 'desc';

  const getRecordZone = (record: StocktakeRecord): ZoneType => {
    return (record.zona as ZoneType) || 'SECO';
  };

  // Helper for Expiration Color Coding
  const getExpirationStyle = (dateStr: string | undefined) => {
    if (!dateStr) return 'bg-slate-100 text-slate-400 border-slate-200';
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    let exp: Date;
    if (dateStr.match(/^\d{4}-\d{2}-\d{2}$/)) {
      const [year, month, day] = dateStr.split('-').map(Number);
      exp = new Date(year, month - 1, day);
    } else {
      exp = new Date(dateStr);
    }

    if (isNaN(exp.getTime())) return 'bg-slate-100 text-slate-400 border-slate-200';
    const diffTime = exp.getTime() - today.getTime();
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

    // Logic: <= 5 days (Red), 6-10 days (Orange), > 10 days (Green)
    if (diffDays <= 5) return 'bg-red-100 text-red-700 border-red-200';
    if (diffDays <= 10) return 'bg-orange-100 text-orange-700 border-orange-200';
    return 'bg-green-100 text-green-700 border-green-200';
  };

  // Sort Handler
  const handleSort = (key: SortKey) => {
      setSortConfig(prev => ({
          key,
          direction: prev.key === key && prev.direction === 'desc' ? 'asc' : 'desc'
      }));
  };

  // Filter Logic
  const filteredHistory = records.filter(record => {
    const zone = getRecordZone(record);
    const matchesZone = activeFilter === 'ALL' || zone === activeFilter;
    const matchesSearch = 
        record.nombre.toLowerCase().includes(searchTerm.toLowerCase()) || 
        record.codigo.includes(searchTerm) || 
        record.usuario_registro.toLowerCase().includes(searchTerm.toLowerCase());
    
    let matchesDate = true;
    if (startDate) {
        const start = new Date(startDate);
        const itemDate = new Date(record.fecha_registro);
        matchesDate = matchesDate && itemDate >= start;
    }
    if (endDate) {
        const end = new Date(endDate);
        end.setHours(23, 59, 59, 999);
        matchesDate = matchesDate && new Date(record.fecha_registro) <= end;
    }

    return matchesZone && matchesSearch && matchesDate;
  });

  // Sort Logic
  const sortedHistory = [...filteredHistory].sort((a, b) => {
      const dateAVal = a[sortConfig.key];
      const dateBVal = b[sortConfig.key];
      
      const dateA = dateAVal ? new Date(dateAVal).getTime() : (sortConfig.direction === 'asc' ? Infinity : -Infinity);
      const dateB = dateBVal ? new Date(dateBVal).getTime() : (sortConfig.direction === 'asc' ? Infinity : -Infinity);
      
      return sortConfig.direction === 'asc' ? dateA - dateB : dateB - dateA;
  });

  const stats = {
      total: sortedHistory.length,
      qty: sortedHistory.reduce((acc, curr) => acc + curr.cantidad, 0)
  };

  // Fix: Case values SECO, REFRIGERADO, CONGELADO
  const getZoneLabel = (type: ZoneType) => {
      switch(type) {
          case 'SECO': return { label: 'Secos', color: 'bg-orange-100 text-orange-700', icon: <Sun className="w-3 h-3"/> };
          case 'REFRIGERADO': return { label: 'Refrigerados', color: 'bg-cyan-100 text-cyan-700', icon: <Snowflake className="w-3 h-3"/> };
          case 'CONGELADO': return { label: 'Congelados', color: 'bg-blue-100 text-blue-700', icon: <Snowflake className="w-3 h-3"/> };
          default: return { label: 'General', color: 'bg-gray-100 text-gray-700', icon: null };
      }
  };

  const handleExportHistory = () => {
    const headers = ['Fecha Registro', 'Hora Registro', 'Zona', 'Codigo', 'Producto', 'Cantidad', 'Vencimiento', 'Usuario'];
    const csvRows = [headers.join(',')];

    for(const record of sortedHistory) {
        const date = new Date(record.fecha_registro);
        const row = [
            date.toLocaleDateString(),
            date.toLocaleTimeString(),
            record.zona || 'SECO',
            record.codigo,
            record.nombre.replace(/"/g, '""'),
            record.cantidad,
            record.fecha_vencimiento || 'N/A',
            record.usuario_registro
        ];
        csvRows.push(row.join(','));
    }

    // Add BOM for Excel UTF-8 compatibility (%EF%BB%BF)
    const csvContent = "data:text/csv;charset=utf-8,%EF%BB%BF" + encodeURIComponent(csvRows.join("\n"));
    const link = document.createElement("a");
    link.setAttribute("href", csvContent);
    link.setAttribute("download", `historial_conteos_${new Date().toISOString().slice(0,10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="flex flex-col h-full bg-slate-50">
        {/* Header */}
        <div className="bg-white border-b border-gray-200 px-4 py-3 shadow-sm flex flex-col gap-4">
            <div className="flex justify-between items-center">
                <h2 className="text-lg font-bold text-gray-800 flex items-center gap-2">
                    <History className="w-5 h-5 text-blue-600"/>
                    Histórico de Conteos
                </h2>
                <button 
                    onClick={handleExportHistory}
                    className="flex items-center gap-2 bg-green-600 text-white px-3 py-2 rounded-lg text-xs font-bold hover:bg-green-700"
                >
                    <FileSpreadsheet className="w-4 h-4"/> Exportar
                </button>
            </div>
            
            <div className="flex flex-col md:flex-row gap-2 items-center">
                <input 
                    type="text" 
                    placeholder="Buscar por Producto, LPN o Usuario..."
                    className="flex-1 w-full md:w-auto px-3 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                    value={searchTerm}
                    onChange={e => setSearchTerm(e.target.value)}
                />
                
                <div className="flex items-center gap-2 text-sm text-gray-600 bg-gray-50 p-1 rounded border border-gray-200 w-full md:w-auto justify-between md:justify-start">
                    <span className="text-xs font-bold pl-2 uppercase">Fecha:</span>
                    <input 
                        type="date" 
                        className="bg-transparent border-none outline-none text-xs w-28 md:w-32"
                        value={startDate}
                        onChange={e => setStartDate(e.target.value)}
                    />
                    <span>-</span>
                    <input 
                        type="date" 
                        className="bg-transparent border-none outline-none text-xs w-28 md:w-32"
                        value={endDate}
                        onChange={e => setEndDate(e.target.value)}
                    />
                </div>
            </div>
            
            {/* Color Legend */}
            <div className="flex flex-wrap gap-3 text-[10px] text-gray-500 pt-1">
                <div className="flex items-center gap-1">
                    <div className="w-3 h-3 bg-red-100 border border-red-200 rounded"></div>
                    <span>≤ 5 Días</span>
                </div>
                <div className="flex items-center gap-1">
                    <div className="w-3 h-3 bg-orange-100 border border-orange-200 rounded"></div>
                    <span>6-10 Días</span>
                </div>
                <div className="flex items-center gap-1">
                    <div className="w-3 h-3 bg-green-100 border border-green-200 rounded"></div>
                    <span>&gt; 10 Días</span>
                </div>
            </div>
        </div>

        {/* Tabs */}
        <div className="bg-white px-4 pt-2 border-b border-gray-200 flex overflow-x-auto no-scrollbar gap-4">
            {(['ALL', 'SECO', 'REFRIGERADO', 'CONGELADO'] as const).map(tab => (
                <button
                    key={tab}
                    onClick={() => setActiveFilter(tab)}
                    className={`pb-3 px-2 text-sm font-bold border-b-2 transition-colors whitespace-nowrap ${
                        activeFilter === tab 
                        ? 'border-blue-600 text-blue-600' 
                        : 'border-transparent text-gray-500 hover:text-gray-700'
                    }`}
                >
                    {tab === 'ALL' ? 'Todos' : tab === 'SECO' ? 'Secos' : tab === 'REFRIGERADO' ? 'Refrigerados' : 'Congelados'}
                </button>
            ))}
        </div>

        {/* Stats Summary */}
        <div className="p-4 grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="bg-white p-3 rounded-lg border border-gray-200 shadow-sm">
                <div className="text-xs text-gray-500 font-bold uppercase">Registros</div>
                <div className="text-xl font-black text-gray-800">{stats.total}</div>
            </div>
            <div className="bg-white p-3 rounded-lg border border-gray-200 shadow-sm">
                <div className="text-xs text-gray-500 font-bold uppercase">Unidades Totales</div>
                <div className="text-xl font-black text-blue-600">{Number(stats.qty).toFixed(2)}</div>
            </div>
        </div>

        {/* Table */}
        <div className="flex-1 overflow-auto px-4 pb-20">
            <div className="bg-white border border-gray-200 rounded-lg overflow-hidden shadow-sm min-w-[800px]">
                <table className="w-full text-sm text-left">
                    <thead className="bg-gray-50 text-gray-600 font-bold uppercase text-xs sticky top-0 z-10">
                        <tr>
                            <th className="px-4 py-3 cursor-pointer hover:bg-gray-100" onClick={() => handleSort('fecha_registro')}>
                                Fecha / Hora {sortConfig.key === 'fecha_registro' && (sortConfig.direction === 'asc' ? '↑' : '↓')}
                            </th>
                            <th className="px-4 py-3">Zona</th>
                            <th className="px-4 py-3">Producto</th>
                            <th className="px-4 py-3 text-center">Codigo</th>
                            <th className="px-4 py-3 text-center">Cant.</th>
                            <th className="px-4 py-3 cursor-pointer hover:bg-gray-100" onClick={() => handleSort('fecha_vencimiento')}>
                                Vencimiento {sortConfig.key === 'fecha_vencimiento' && (sortConfig.direction === 'asc' ? '↑' : '↓')}
                            </th>
                            <th className="px-4 py-3">Usuario</th>
                            <th className="px-4 py-3 text-center">Fotos</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                        {loading ? (
                            <tr>
                                <td colSpan={7} className="px-4 py-8 text-center">
                                    <div className="flex items-center justify-center gap-2 text-blue-600">
                                        <RefreshCw className="w-5 h-5 animate-spin"/>
                                        <span>Cargando registros...</span>
                                    </div>
                                </td>
                            </tr>
                        ) : sortedHistory.length === 0 ? (
                            <tr>
                                <td colSpan={7} className="px-4 py-8 text-center text-gray-400 italic">
                                    No se encontraron registros.
                                </td>
                            </tr>
                        ) : (
                            sortedHistory.map((record, idx) => {
                                const zone = getRecordZone(record);
                                const zoneStyle = getZoneLabel(zone);
                                return (
                                    <tr key={record.id || idx} className="hover:bg-gray-50 transition-colors">
                                        <td className="px-4 py-3 text-gray-600 whitespace-nowrap">
                                            <div className="flex items-center gap-1 font-mono text-xs">
                                                <Clock className="w-3 h-3 text-gray-400"/>
                                                {new Date(record.fecha_registro).toLocaleString()}
                                            </div>
                                        </td>
                                        <td className="px-4 py-3">
                                            <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold ${zoneStyle.color}`}>
                                                {zoneStyle.icon} {zoneStyle.label}
                                            </span>
                                        </td>
                                        <td className="px-4 py-3">
                                            <div className="font-bold text-gray-800 leading-tight break-words min-w-[200px]">{record.nombre}</div>
                                        </td>
                                        <td className="px-4 py-3 text-center">
                                            <span className="text-sm font-black text-blue-600 font-mono tracking-tighter">{record.codigo}</span>
                                        </td>
                                        <td className="px-4 py-3 text-center font-bold text-gray-800">{Number(record.cantidad).toFixed(2)}</td>
                                        <td className="px-4 py-3">
                                            <span className={`px-2 py-1 rounded text-xs font-bold border ${getExpirationStyle(record.fecha_vencimiento)}`}>
                                                {record.fecha_vencimiento ? formatDate(record.fecha_vencimiento) : 'SIN FECHA'}
                                            </span>
                                        </td>
                                        <td className="px-4 py-3">
                                            <div className="flex items-center gap-1 text-xs text-gray-600">
                                                <User className="w-3 h-3 text-gray-400"/>
                                                {record.usuario_registro}
                                            </div>
                                        </td>
                                        <td className="px-4 py-3 text-center">
                                            {record.fotos && record.fotos.length > 0 ? (
                                                <button 
                                                    onClick={() => setSelectedPhotos(record.fotos || [])}
                                                    className="text-blue-600 hover:text-blue-800 transition-colors"
                                                >
                                                    <Camera className="w-5 h-5 mx-auto"/>
                                                </button>
                                            ) : (
                                                <span className="text-gray-300">-</span>
                                            )}
                                        </td>
                                    </tr>
                                );
                            })
                        )}
                    </tbody>
                </table>
            </div>
        </div>

        {/* Photo Modal */}
        {selectedPhotos && (
            <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex justify-center items-center p-4">
                <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg max-h-[90vh] flex flex-col overflow-hidden">
                    <div className="p-4 border-b flex justify-between items-center bg-gray-50">
                        <h3 className="font-bold text-gray-800">Evidencia Fotográfica</h3>
                        <button onClick={() => setSelectedPhotos(null)} className="text-gray-500 hover:text-red-500">
                            <XCircle className="w-6 h-6"/>
                        </button>
                    </div>
                    <div className="flex-1 overflow-y-auto p-4">
                        <div className="grid grid-cols-2 gap-3">
                            {selectedPhotos.map((photo, idx) => (
                                <div key={idx} className="rounded-lg overflow-hidden border border-gray-200 aspect-square">
                                    <img src={photo} alt={`Evidencia ${idx}`} className="w-full h-full object-cover"/>
                                </div>
                            ))}
                        </div>
                    </div>
                    <div className="p-4 border-t bg-gray-50 text-center">
                        <button 
                            onClick={() => setSelectedPhotos(null)}
                            className="bg-slate-800 text-white px-6 py-2 rounded-lg font-bold w-full"
                        >
                            Cerrar
                        </button>
                    </div>
                </div>
            </div>
        )}
    </div>
  );
};

export default CountHistory;
