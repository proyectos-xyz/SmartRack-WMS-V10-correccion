import React, { useState, useEffect, useMemo, useRef } from 'react';
import { supabase } from '../supabaseClient';
import { DifferenceHistory } from '../types';
import { 
  History, Search, RefreshCw, Download, Calendar, Filter, 
  TrendingUp, TrendingDown, ArrowUpDown, ArrowUp, ArrowDown, 
  Maximize, Minimize, AlertTriangle, CheckCircle, Package
} from './Icons';
import { getPeruDateString } from '../utils';
import * as XLSX from 'xlsx';

interface ProductDiffSummary {
  codigo: string;
  nombre: string;
  diffs: Record<string, number>;
  latestDiff: number | undefined;
  previousDiff: number | undefined;
  trendStatus: 'INCREASED' | 'DECREASED' | 'FIXED' | 'NEW' | 'PERSISTENT' | 'NONE';
  trendLabel: string;
}

const DifferenceHistoryView: React.FC = () => {
  const [currentUser] = useState(() => {
    try {
      const saved = localStorage.getItem('smartwms_user');
      return saved ? JSON.parse(saved) : null;
    } catch {
      return null;
    }
  });

  const [history, setHistory] = useState<DifferenceHistory[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [activeTab, setActiveTab] = useState<'matrix' | 'list'>('matrix');
  const [filterDate, setFilterDate] = useState<string>('');
  const [trendFilter, setTrendFilter] = useState<'ALL' | 'DIFFS_ONLY' | 'INCREASED' | 'DECREASED' | 'FIXED'>('ALL');
  const [isFullscreen, setIsFullscreen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Sorting state
  const [sortColumn, setSortColumn] = useState<string>('');
  const [sortDirection, setSortDirection] = useState<'desc' | 'asc'>('desc');

  useEffect(() => {
    loadHistory();
  }, []);

  const loadHistory = async () => {
    setIsLoading(true);
    try {
      let query = supabase
        .from('historial_diferencias')
        .select('*');

      const sedeId = currentUser?.sede_id;
      if (sedeId) {
        query = query.eq('sede_id', sedeId);
      }

      const { data, error } = await query.order('fecha', { ascending: false });

      if (error) throw error;
      if (data) {
        setHistory(data as DifferenceHistory[]);
      }
    } catch (error) {
      console.error("Error cargando historial de diferencias:", error);
    } finally {
      setIsLoading(false);
    }
  };

  // Get unique dates sorted descending (latest first)
  const uniqueDates = useMemo(() => {
    return Array.from(new Set(history.map(h => h.fecha))).sort((a, b) => b.localeCompare(a));
  }, [history]);

  // Set default sort column to latest date on load
  useEffect(() => {
    if (uniqueDates.length > 0 && !sortColumn) {
      setSortColumn(uniqueDates[0]);
      setSortDirection('desc');
    }
  }, [uniqueDates, sortColumn]);

  // Group by product code and compute trends
  const productsSummary = useMemo<ProductDiffSummary[]>(() => {
    const grouped = history.reduce((acc, curr) => {
      const code = (curr.codigo || '').trim();
      if (!code) return acc;
      if (!acc[code]) {
        acc[code] = {
          codigo: code,
          nombre: curr.nombre || 'N/A',
          diffs: {}
        };
      } else if (curr.nombre && acc[code].nombre === 'N/A') {
        acc[code].nombre = curr.nombre;
      }
      acc[code].diffs[curr.fecha] = Number(curr.diferencia || 0);
      return acc;
    }, {} as Record<string, { codigo: string; nombre: string; diffs: Record<string, number> }>);

    const latestDate = uniqueDates[0];
    const previousDate = uniqueDates[1];

    return Object.values(grouped).map(p => {
      const latestDiff = latestDate !== undefined ? p.diffs[latestDate] : undefined;
      const previousDiff = previousDate !== undefined ? p.diffs[previousDate] : undefined;

      let trendStatus: ProductDiffSummary['trendStatus'] = 'NONE';
      let trendLabel = 'Sin datos';

      if (latestDiff === undefined && previousDiff === undefined) {
        trendStatus = 'NONE';
        trendLabel = 'Sin registros recientes';
      } else if (latestDiff === 0 || latestDiff === undefined) {
        if (previousDiff !== undefined && previousDiff !== 0) {
          trendStatus = 'FIXED';
          trendLabel = '🟢 Corregido / Cuadrado';
        } else {
          trendStatus = 'NONE';
          trendLabel = 'Sin diferencia';
        }
      } else if (previousDiff === undefined) {
        trendStatus = 'NEW';
        trendLabel = '🚨 Nueva Diferencia';
      } else if (previousDiff === 0) {
        trendStatus = 'NEW';
        trendLabel = '🚨 Nueva Diferencia';
      } else if (latestDiff === previousDiff) {
        trendStatus = 'PERSISTENT';
        trendLabel = '⚠️ Persistente';
      } else {
        const absLatest = Math.abs(latestDiff);
        const absPrevious = Math.abs(previousDiff);

        if (absLatest > absPrevious) {
          trendStatus = 'INCREASED';
          trendLabel = '📈 Incrementó';
        } else if (absLatest < absPrevious) {
          trendStatus = 'DECREASED';
          trendLabel = '📉 Redujo';
        } else {
          trendStatus = 'PERSISTENT';
          trendLabel = '⚠️ Persistente';
        }
      }

      return {
        codigo: p.codigo,
        nombre: p.nombre,
        diffs: p.diffs,
        latestDiff,
        previousDiff,
        trendStatus,
        trendLabel
      };
    });
  }, [history, uniqueDates]);

  // Handle header click sorting by absolute value for dates or alphanumeric for strings
  const handleSort = (column: string) => {
    if (sortColumn === column) {
      setSortDirection(prev => prev === 'desc' ? 'asc' : 'desc');
    } else {
      setSortColumn(column);
      setSortDirection('desc');
    }
  };

  // Filter and sort matrix data
  const filteredAndSortedMatrix = useMemo(() => {
    let result = productsSummary.filter(p => {
      const matchSearch = 
        p.codigo.toLowerCase().includes(searchTerm.toLowerCase().trim()) ||
        p.nombre.toLowerCase().includes(searchTerm.toLowerCase().trim());

      if (!matchSearch) return false;

      if (trendFilter === 'DIFFS_ONLY') {
        return (p.latestDiff !== undefined && p.latestDiff !== 0) || Object.values(p.diffs).some(d => d !== 0);
      }
      if (trendFilter === 'INCREASED') {
        return p.trendStatus === 'INCREASED' || p.trendStatus === 'NEW';
      }
      if (trendFilter === 'DECREASED') {
        return p.trendStatus === 'DECREASED';
      }
      if (trendFilter === 'FIXED') {
        return p.trendStatus === 'FIXED';
      }

      return true;
    });

    // Sorting logic
    if (sortColumn) {
      result.sort((a, b) => {
        if (sortColumn === 'product') {
          const comp = a.nombre.localeCompare(b.nombre);
          return sortDirection === 'desc' ? -comp : comp;
        }
        if (sortColumn === 'codigo') {
          const comp = a.codigo.localeCompare(b.codigo);
          return sortDirection === 'desc' ? -comp : comp;
        }
        if (sortColumn === 'trend') {
          const priority: Record<ProductDiffSummary['trendStatus'], number> = {
            INCREASED: 5,
            NEW: 4,
            PERSISTENT: 3,
            DECREASED: 2,
            FIXED: 1,
            NONE: 0
          };
          const scoreA = priority[a.trendStatus] || 0;
          const scoreB = priority[b.trendStatus] || 0;
          return sortDirection === 'desc' ? scoreB - scoreA : scoreA - scoreB;
        }

        // Date columns: STRICT ABSOLUTE VALUE SORTING
        // Example: +512, -500, +310, -349, +200, -221 -> +512, -500, -349, +310, -221, +200
        const diffA = a.diffs[sortColumn];
        const diffB = b.diffs[sortColumn];

        const hasA = diffA !== undefined;
        const hasB = diffB !== undefined;

        if (!hasA && !hasB) return 0;
        if (!hasA) return 1; // items without data always at the end
        if (!hasB) return -1;

        const absA = Math.abs(diffA);
        const absB = Math.abs(diffB);

        if (absA !== absB) {
          return sortDirection === 'desc' ? absB - absA : absA - absB;
        }

        // Tie-breaker: positive before negative or by code
        return sortDirection === 'desc' ? diffB - diffA : diffA - diffB;
      });
    }

    return result;
  }, [productsSummary, searchTerm, trendFilter, sortColumn, sortDirection]);

  // Filtered flat list
  const listItems = useMemo(() => {
    let result = history.filter(item => {
      const matchesSearch = 
        item.codigo.toLowerCase().includes(searchTerm.toLowerCase().trim()) ||
        item.nombre.toLowerCase().includes(searchTerm.toLowerCase().trim());
      const matchesDate = filterDate ? item.fecha === filterDate : true;
      return matchesSearch && matchesDate;
    });

    if (sortColumn === 'diferencia_abs') {
      result.sort((a, b) => {
        const absA = Math.abs(Number(a.diferencia || 0));
        const absB = Math.abs(Number(b.diferencia || 0));
        return sortDirection === 'desc' ? absB - absA : absA - absB;
      });
    }

    return result;
  }, [history, searchTerm, filterDate, sortColumn, sortDirection]);

  // Fullscreen toggle handler
  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      if (containerRef.current?.requestFullscreen) {
        containerRef.current.requestFullscreen().catch(() => {
          setIsFullscreen(prev => !prev);
        });
      } else {
        setIsFullscreen(prev => !prev);
      }
    } else {
      if (document.exitFullscreen) {
        document.exitFullscreen().catch(() => {});
      }
      setIsFullscreen(false);
    }
  };

  useEffect(() => {
    const handleFsChange = () => {
      setIsFullscreen(!!document.fullscreenElement);
    };
    document.addEventListener('fullscreenchange', handleFsChange);
    return () => document.removeEventListener('fullscreenchange', handleFsChange);
  }, []);

  // Format 2 decimal numbers cleanly
  const formatDecimal = (val: number | undefined): string => {
    if (val === undefined) return '—';
    const sign = val > 0 ? '+' : '';
    return `${sign}${val.toFixed(2)}`;
  };

  const getDifferenceStyle = (val: number | undefined) => {
    if (val === undefined) return 'text-slate-300 dark:text-slate-600 font-medium';
    if (val === 0) return 'text-emerald-700 dark:text-emerald-400 bg-emerald-50/80 dark:bg-emerald-950/30 font-bold';
    if (val > 0) return 'text-blue-700 dark:text-blue-300 bg-blue-50/80 dark:bg-blue-950/30 font-black';
    return 'text-rose-700 dark:text-rose-300 bg-rose-50/80 dark:bg-rose-950/30 font-black';
  };

  const renderTrendBadge = (item: ProductDiffSummary) => {
    switch (item.trendStatus) {
      case 'INCREASED':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-black bg-rose-100 text-rose-800 dark:bg-rose-900/40 dark:text-rose-300 border border-rose-300 dark:border-rose-700 shadow-sm whitespace-nowrap">
            <TrendingUp className="w-3.5 h-3.5 text-rose-600 animate-pulse" />
            Incrementó
          </span>
        );
      case 'DECREASED':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-black bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300 border border-blue-300 dark:border-blue-700 shadow-sm whitespace-nowrap">
            <TrendingDown className="w-3.5 h-3.5 text-blue-600" />
            Redujo
          </span>
        );
      case 'FIXED':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-black bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-700 shadow-sm whitespace-nowrap">
            <CheckCircle className="w-3.5 h-3.5 text-emerald-600" />
            Corregido
          </span>
        );
      case 'NEW':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-black bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300 border border-amber-300 dark:border-amber-700 shadow-sm whitespace-nowrap">
            <AlertTriangle className="w-3.5 h-3.5 text-amber-600" />
            Nueva Dif.
          </span>
        );
      case 'PERSISTENT':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300 border border-slate-300 dark:border-slate-600 shadow-sm whitespace-nowrap">
            ⚠️ Persistente
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-medium text-slate-400 dark:text-slate-500 whitespace-nowrap">
            Sin dif.
          </span>
        );
    }
  };

  const exportToExcel = () => {
    let dataToExport = [];
    let filename = '';

    if (activeTab === 'matrix') {
      dataToExport = filteredAndSortedMatrix.map(p => {
        const row: Record<string, any> = {
          'Código': p.codigo,
          'Producto': p.nombre,
          'Tendencia': p.trendLabel
        };
        uniqueDates.forEach(date => {
          row[date] = p.diffs[date] !== undefined ? Number(p.diffs[date].toFixed(2)) : '—';
        });
        return row;
      });
      filename = `Matriz_Historial_Diferencias_${getPeruDateString()}.xlsx`;
    } else {
      dataToExport = listItems.map(item => ({
        'Fecha': item.fecha,
        'Código': item.codigo,
        'Producto': item.nombre,
        'Stock Sistema': Number(Number(item.stock_sistema || 0).toFixed(2)),
        'Conteo Físico': Number(Number(item.conteo_fisico || 0).toFixed(2)),
        'Diferencia': Number(Number(item.diferencia || 0).toFixed(2)),
        'Responsable': item.procesado_por || 'N/A',
        'Fecha Procesado': item.fecha_procesado ? new Date(item.fecha_procesado).toLocaleString('es-PE', { timeZone: 'America/Lima' }) : 'N/A'
      }));
      filename = `Detalle_Historial_Diferencias_${getPeruDateString()}.xlsx`;
    }

    const ws = XLSX.utils.json_to_sheet(dataToExport);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, activeTab === 'matrix' ? "Matriz Histórico" : "Listado Detalle");
    XLSX.writeFile(wb, filename);
  };

  // Helper for sorting indicator icon
  const renderSortIndicator = (column: string) => {
    if (sortColumn !== column) {
      return <ArrowUpDown className="w-3.5 h-3.5 opacity-30 group-hover:opacity-100 transition-opacity" />;
    }
    return sortDirection === 'desc' ? (
      <ArrowDown className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400 font-bold" />
    ) : (
      <ArrowUp className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400 font-bold" />
    );
  };

  return (
    <div 
      ref={containerRef} 
      id="difference-history-root"
      className={`flex flex-col bg-slate-50 dark:bg-slate-900 transition-all ${
        isFullscreen ? 'fixed inset-0 z-[9999] h-screen w-screen p-4' : 'h-full w-full'
      }`}
    >
      {/* Header Bar */}
      <header className="bg-white dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700 px-6 py-4 flex flex-col md:flex-row md:items-center justify-between gap-4 shadow-sm flex-shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-2xl bg-indigo-50 dark:bg-indigo-950/50 border border-indigo-200 dark:border-indigo-800 flex items-center justify-center text-indigo-600 dark:text-indigo-400 shadow-sm flex-shrink-0">
            <History className="w-6 h-6" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl md:text-2xl font-black text-slate-800 dark:text-white tracking-tight">
                HISTORIAL DE DIFERENCIAS
              </h1>
              <span className="hidden sm:inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-extrabold bg-indigo-100 text-indigo-800 dark:bg-indigo-900/50 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-700">
                {productsSummary.length} Productos
              </span>
            </div>
            <p className="text-xs md:text-sm font-medium text-slate-500 dark:text-slate-400">
              Visualización a pantalla completa con ordenamiento por valor absoluto (|dif|) y tendencias.
            </p>
          </div>
        </div>

        {/* Action Controls */}
        <div className="flex items-center gap-2 flex-wrap">
          {/* Tabs */}
          <div className="bg-slate-100 dark:bg-slate-700/60 p-1 rounded-xl flex items-center border border-slate-200 dark:border-slate-600">
            <button
              onClick={() => setActiveTab('matrix')}
              className={`px-3 py-1.5 rounded-lg text-xs font-black transition-all ${
                activeTab === 'matrix'
                  ? 'bg-white dark:bg-slate-800 text-indigo-600 dark:text-indigo-400 shadow-sm'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
              }`}
            >
              📈 Matriz Horizontal
            </button>
            <button
              onClick={() => setActiveTab('list')}
              className={`px-3 py-1.5 rounded-lg text-xs font-black transition-all ${
                activeTab === 'list'
                  ? 'bg-white dark:bg-slate-800 text-indigo-600 dark:text-indigo-400 shadow-sm'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
              }`}
            >
              📋 Vista Lista Detalle
            </button>
          </div>

          <button
            onClick={exportToExcel}
            title="Exportar a Excel con 2 decimales"
            className="flex items-center gap-2 px-3.5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-bold text-xs shadow-md shadow-emerald-600/20 active:scale-95 transition-all"
          >
            <Download className="w-4 h-4" />
            <span className="hidden sm:inline">Exportar Excel</span>
          </button>

          <button
            onClick={toggleFullscreen}
            title={isFullscreen ? "Salir de Pantalla Completa" : "Ver a Pantalla Completa"}
            className="flex items-center gap-1.5 px-3.5 py-2 bg-indigo-50 hover:bg-indigo-100 dark:bg-indigo-950/40 dark:hover:bg-indigo-900/60 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800 rounded-xl font-bold text-xs transition-all shadow-sm"
          >
            {isFullscreen ? <Minimize className="w-4 h-4" /> : <Maximize className="w-4 h-4" />}
            <span className="hidden md:inline">{isFullscreen ? "Reducir" : "Full Screen"}</span>
          </button>

          <button
            onClick={loadHistory}
            title="Recargar historial"
            className="p-2 bg-slate-100 hover:bg-slate-200 dark:bg-slate-700 dark:hover:bg-slate-600 text-slate-700 dark:text-slate-200 rounded-xl transition-all"
          >
            <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </header>

      {/* Filter and Search Bar */}
      <section className="bg-white dark:bg-slate-800/90 border-b border-slate-200 dark:border-slate-700 px-6 py-3 flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3 flex-shrink-0">
        <div className="flex-1 relative">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input
            type="text"
            placeholder="Filtrar por código o nombre del producto..."
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
            className="w-full pl-10 pr-4 py-2 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-sm font-medium text-slate-800 dark:text-white placeholder-slate-400 focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none transition-all"
          />
        </div>

        {/* Quick Filter Buttons */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 md:pb-0">
          <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider mr-1 flex items-center gap-1 flex-shrink-0">
            <Filter className="w-3 h-3" /> Filtro:
          </span>
          <button
            onClick={() => setTrendFilter('ALL')}
            className={`px-2.5 py-1 rounded-lg text-xs font-bold whitespace-nowrap transition-all ${
              trendFilter === 'ALL'
                ? 'bg-slate-800 text-white dark:bg-slate-200 dark:text-slate-900 shadow-sm'
                : 'bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-200'
            }`}
          >
            Todos
          </button>
          <button
            onClick={() => setTrendFilter('DIFFS_ONLY')}
            className={`px-2.5 py-1 rounded-lg text-xs font-bold whitespace-nowrap transition-all ${
              trendFilter === 'DIFFS_ONLY'
                ? 'bg-indigo-600 text-white shadow-sm'
                : 'bg-indigo-50 dark:bg-indigo-950/40 text-indigo-700 dark:text-indigo-300 hover:bg-indigo-100'
            }`}
          >
            Con Diferencias
          </button>
          <button
            onClick={() => setTrendFilter('INCREASED')}
            className={`px-2.5 py-1 rounded-lg text-xs font-bold whitespace-nowrap transition-all ${
              trendFilter === 'INCREASED'
                ? 'bg-rose-600 text-white shadow-sm'
                : 'bg-rose-50 dark:bg-rose-950/40 text-rose-700 dark:text-rose-300 hover:bg-rose-100'
            }`}
          >
            📈 Incrementaron
          </button>
          <button
            onClick={() => setTrendFilter('DECREASED')}
            className={`px-2.5 py-1 rounded-lg text-xs font-bold whitespace-nowrap transition-all ${
              trendFilter === 'DECREASED'
                ? 'bg-blue-600 text-white shadow-sm'
                : 'bg-blue-50 dark:bg-blue-950/40 text-blue-700 dark:text-blue-300 hover:bg-blue-100'
            }`}
          >
            📉 Redujeron
          </button>
          <button
            onClick={() => setTrendFilter('FIXED')}
            className={`px-2.5 py-1 rounded-lg text-xs font-bold whitespace-nowrap transition-all ${
              trendFilter === 'FIXED'
                ? 'bg-emerald-600 text-white shadow-sm'
                : 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 hover:bg-emerald-100'
            }`}
          >
            🟢 Corregidos
          </button>
        </div>

        {activeTab === 'list' && (
          <div className="w-full md:w-56 flex-shrink-0">
            <select
              value={filterDate}
              onChange={e => setFilterDate(e.target.value)}
              className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-bold text-slate-700 dark:text-slate-200 outline-none focus:ring-2 focus:ring-indigo-500"
            >
              <option value="">Todas las Fechas</option>
              {uniqueDates.map(d => (
                <option key={d} value={d}>{d}</option>
              ))}
            </select>
          </div>
        )}
      </section>

      {/* Sorting Info Banner */}
      <div className="bg-indigo-50/60 dark:bg-indigo-950/20 border-b border-indigo-100 dark:border-indigo-900/30 px-6 py-2 flex items-center justify-between text-xs text-indigo-900 dark:text-indigo-300 font-medium">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-bold">Ordenando por:</span>
          {sortColumn ? (
            <span className="inline-flex items-center gap-1 font-black bg-white dark:bg-slate-800 px-2 py-0.5 rounded border border-indigo-200 dark:border-indigo-800 shadow-2xs">
              {sortColumn === 'product' ? 'Nombre Producto' : sortColumn === 'codigo' ? 'Código' : sortColumn === 'trend' ? 'Tendencia' : `Fecha ${sortColumn} (|Valor Absoluto|)`}
              {sortDirection === 'desc' ? ' (Mayor a Menor |ABS| ↓)' : ' (Menor a Mayor |ABS| ↑)'}
            </span>
          ) : (
            <span>Selecciona un encabezado para ordenar por valor absoluto (|dif|)</span>
          )}
        </div>
        <div className="hidden sm:flex items-center gap-3 text-[11px] text-slate-500">
          <span>* Todos los valores se muestran a <strong>2 decimales</strong>.</span>
          <span>* Haz clic en cualquier fecha para ordenar por <strong>|Magnitud|</strong>.</span>
        </div>
      </div>

      {/* Full-width Matrix / List Canvas */}
      <main className="flex-1 overflow-hidden p-3 md:p-6 flex flex-col min-h-0">
        <div className="flex-1 bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-xl overflow-hidden flex flex-col min-h-0">
          <div className="flex-1 overflow-auto">
            {activeTab === 'matrix' ? (
              <table className="w-full text-left border-collapse border-spacing-0">
                {/* Sticky Header Row */}
                <thead className="sticky top-0 z-30 bg-slate-100 dark:bg-slate-800 border-b border-slate-300 dark:border-slate-700 shadow-xs">
                  <tr>
                    {/* Fixed Product Column Header */}
                    <th 
                      onClick={() => handleSort('product')}
                      className="group p-3.5 text-xs font-black text-slate-700 dark:text-slate-200 uppercase tracking-wider sticky left-0 z-40 bg-slate-100 dark:bg-slate-800 border-r border-slate-300 dark:border-slate-700 cursor-pointer select-none hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors min-w-[260px] max-w-[320px]"
                    >
                      <div className="flex items-center justify-between">
                        <span>Producto / Código</span>
                        {renderSortIndicator('product')}
                      </div>
                    </th>

                    {/* Fixed Trend Column Header */}
                    <th 
                      onClick={() => handleSort('trend')}
                      className="group p-3.5 text-xs font-black text-slate-700 dark:text-slate-200 uppercase tracking-wider text-center border-r border-slate-200 dark:border-slate-700 cursor-pointer select-none hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors min-w-[140px]"
                    >
                      <div className="flex items-center justify-center gap-1.5">
                        <span>Evolución</span>
                        {renderSortIndicator('trend')}
                      </div>
                    </th>

                    {/* Historical Dates Columns Headers */}
                    {uniqueDates.map((date, idx) => {
                      const isSorted = sortColumn === date;
                      return (
                        <th
                          key={date}
                          onClick={() => handleSort(date)}
                          className={`group p-3.5 text-xs font-black uppercase tracking-wider text-center cursor-pointer select-none border-r border-slate-200 dark:border-slate-700 transition-colors min-w-[125px] ${
                            isSorted 
                              ? 'bg-indigo-100/90 dark:bg-indigo-950/80 text-indigo-950 dark:text-indigo-200 ring-1 ring-indigo-400' 
                              : 'text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700'
                          }`}
                          title={`Ordenar por magnitud absoluta de diferencias del día ${date}`}
                        >
                          <div className="flex flex-col items-center justify-center gap-0.5">
                            <div className="flex items-center gap-1">
                              <Calendar className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400" />
                              <span className="font-mono text-xs">{date}</span>
                              {renderSortIndicator(date)}
                            </div>
                            <span className="text-[10px] font-bold text-slate-400 font-sans tracking-normal">
                              {idx === 0 ? '(Hoy/Último)' : idx === 1 ? '(Ayer)' : `Día -${idx}`}
                            </span>
                          </div>
                        </th>
                      );
                    })}
                  </tr>
                </thead>

                <tbody className="divide-y divide-slate-100 dark:divide-slate-700/60 bg-white dark:bg-slate-800">
                  {filteredAndSortedMatrix.length === 0 ? (
                    <tr>
                      <td colSpan={uniqueDates.length + 2} className="p-16 text-center text-slate-400">
                        <div className="flex flex-col items-center justify-center gap-3">
                          <Package className="w-12 h-12 text-slate-300 stroke-1" />
                          <p className="font-bold text-base text-slate-600 dark:text-slate-300">
                            No se encontraron registros de diferencias
                          </p>
                          <p className="text-xs text-slate-400 max-w-md">
                            Para generar historial, ve al módulo de <strong>Conciliación</strong> y presiona el botón <strong>"Procesar Diferencias"</strong>.
                          </p>
                        </div>
                      </td>
                    </tr>
                  ) : (
                    filteredAndSortedMatrix.map(item => {
                      return (
                        <tr 
                          key={item.codigo} 
                          className="hover:bg-indigo-50/40 dark:hover:bg-slate-700/40 transition-colors group"
                        >
                          {/* Fixed Sticky Product Cell */}
                          <td className="p-3.5 sticky left-0 z-20 bg-white dark:bg-slate-800 group-hover:bg-indigo-50/80 dark:group-hover:bg-slate-700/80 border-r border-slate-300 dark:border-slate-700 shadow-[3px_0_6px_-2px_rgba(0,0,0,0.08)]">
                            <div className="flex flex-col gap-1">
                              <span className="font-extrabold text-slate-900 dark:text-white text-xs sm:text-sm leading-snug">
                                {item.nombre}
                              </span>
                              <div className="flex items-center gap-2">
                                <span className="font-mono text-xs font-black bg-indigo-50 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800 px-2 py-0.5 rounded shadow-2xs">
                                  {item.codigo}
                                </span>
                              </div>
                            </div>
                          </td>

                          {/* Trend Evolution Cell */}
                          <td className="p-3.5 text-center border-r border-slate-200 dark:border-slate-700 whitespace-nowrap">
                            {renderTrendBadge(item)}
                          </td>

                          {/* Historical Values at 2 decimals */}
                          {uniqueDates.map((date, dateIdx) => {
                            const val = item.diffs[date];
                            const isSortedCol = sortColumn === date;
                            const prevDate = uniqueDates[dateIdx + 1];
                            const prevVal = prevDate ? item.diffs[prevDate] : undefined;

                            let trendIndicator = null;
                            if (val !== undefined && prevVal !== undefined) {
                              const absCurrent = Math.abs(val);
                              const absPast = Math.abs(prevVal);
                              if (absCurrent > absPast) {
                                trendIndicator = <span title="Incrementó magnitud vs día previo" className="text-rose-500 font-black text-xs">↑</span>;
                              } else if (absCurrent < absPast) {
                                trendIndicator = <span title="Redujo magnitud vs día previo" className="text-emerald-500 font-black text-xs">↓</span>;
                              }
                            }

                            return (
                              <td
                                key={date}
                                className={`p-3.5 text-center border-r border-slate-200 dark:border-slate-700 transition-colors font-mono text-sm ${
                                  isSortedCol ? 'bg-indigo-50/40 dark:bg-indigo-950/30 font-black' : ''
                                }`}
                              >
                                <div className="flex items-center justify-center gap-1">
                                  <span className={`px-2 py-1 rounded-lg ${getDifferenceStyle(val)}`}>
                                    {formatDecimal(val)}
                                  </span>
                                  {trendIndicator}
                                </div>
                              </td>
                            );
                          })}
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            ) : (
              /* Flat Detailed Table */
              <table className="w-full text-left border-collapse">
                <thead className="sticky top-0 z-30 bg-slate-100 dark:bg-slate-800 border-b border-slate-300 dark:border-slate-700">
                  <tr>
                    <th className="p-3.5 text-xs font-black text-slate-700 dark:text-slate-200 uppercase tracking-wider">Fecha</th>
                    <th className="p-3.5 text-xs font-black text-slate-700 dark:text-slate-200 uppercase tracking-wider">Código</th>
                    <th className="p-3.5 text-xs font-black text-slate-700 dark:text-slate-200 uppercase tracking-wider">Producto</th>
                    <th className="p-3.5 text-xs font-black text-slate-700 dark:text-slate-200 uppercase tracking-wider text-center">Stock Sistema</th>
                    <th className="p-3.5 text-xs font-black text-slate-700 dark:text-slate-200 uppercase tracking-wider text-center">Conteo Físico</th>
                    <th 
                      onClick={() => handleSort('diferencia_abs')}
                      className="p-3.5 text-xs font-black text-slate-700 dark:text-slate-200 uppercase tracking-wider text-center cursor-pointer select-none hover:bg-slate-200 transition-colors"
                    >
                      <div className="flex items-center justify-center gap-1">
                        <span>Diferencia (|ABS|)</span>
                        {renderSortIndicator('diferencia_abs')}
                      </div>
                    </th>
                    <th className="p-3.5 text-xs font-black text-slate-700 dark:text-slate-200 uppercase tracking-wider text-center">Responsable</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-700/60 bg-white dark:bg-slate-800">
                  {listItems.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="p-12 text-center text-slate-400 font-medium">
                        No hay diferencias que coincidan con la búsqueda o filtro seleccionado.
                      </td>
                    </tr>
                  ) : (
                    listItems.map((item, idx) => (
                      <tr key={idx} className="hover:bg-slate-50 dark:hover:bg-slate-700/30 transition-colors">
                        <td className="p-3.5 font-mono text-xs font-bold text-slate-700 dark:text-slate-300">
                          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-slate-100 dark:bg-slate-700 rounded-lg">
                            <Calendar className="w-3.5 h-3.5 text-indigo-500" />
                            {item.fecha}
                          </span>
                        </td>
                        <td className="p-3.5 font-mono text-xs font-black text-indigo-600 dark:text-indigo-400">
                          {item.codigo}
                        </td>
                        <td className="p-3.5 font-extrabold text-slate-800 dark:text-slate-200 text-sm">
                          {item.nombre}
                        </td>
                        <td className="p-3.5 text-center font-mono font-bold text-slate-600 dark:text-slate-400 text-sm">
                          {Number(item.stock_sistema || 0).toFixed(2)}
                        </td>
                        <td className="p-3.5 text-center font-mono font-bold text-slate-600 dark:text-slate-400 text-sm">
                          {Number(item.conteo_fisico || 0).toFixed(2)}
                        </td>
                        <td className="p-3.5 text-center font-mono text-sm">
                          <span className={`px-2.5 py-1 rounded-lg ${getDifferenceStyle(item.diferencia)}`}>
                            {formatDecimal(item.diferencia)}
                          </span>
                        </td>
                        <td className="p-3.5 text-center text-slate-500 dark:text-slate-400 text-xs font-bold">
                          {item.procesado_por || 'N/A'}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            )}
          </div>

          {/* Table Footer Status */}
          <footer className="bg-slate-50 dark:bg-slate-900 border-t border-slate-200 dark:border-slate-700 px-6 py-3 flex flex-col sm:flex-row items-center justify-between gap-2 text-xs text-slate-500 dark:text-slate-400 flex-shrink-0">
            <div>
              Mostrando <strong className="text-slate-800 dark:text-slate-200">{activeTab === 'matrix' ? filteredAndSortedMatrix.length : listItems.length}</strong> registros
              {searchTerm && <span> para la búsqueda "<strong className="text-indigo-600">{searchTerm}</strong>"</span>}
            </div>
            <div className="flex items-center gap-4">
              <span className="inline-flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-full bg-blue-500"></span> Sobrante (+)
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-full bg-rose-500"></span> Faltante (-)
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-full bg-emerald-500"></span> Cuadrado (0.00)
              </span>
            </div>
          </footer>
        </div>
      </main>
    </div>
  );
};

export default DifferenceHistoryView;
