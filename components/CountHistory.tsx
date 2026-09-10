import React, { useState, useEffect, useMemo } from 'react';
import { ZoneType, StocktakeRecord, Product } from '../types';
import { 
  FileSpreadsheet, 
  History, 
  Sun, 
  Snowflake, 
  RefreshCw, 
  Search, 
  Calendar, 
  ChevronLeft, 
  ChevronRight,
  X
} from './Icons';
import { saveExcelWorkbook } from '../utils';
import { supabase } from '../supabaseClient';
import * as XLSX from 'xlsx-js-style';

interface CountHistoryProps {
  catalog?: Product[];
}

type FilterType = 'ALL' | ZoneType;

interface DayCountEntry {
  qty: number;
  rawExpiry: string;
  shortExpiry: string;
}

interface ProductMatrixRow {
  codigo: string;
  descripcion: string;
  um: string;
  zona: ZoneType;
  countsByDate: Record<string, DayCountEntry[]>;
  dayTotals: Record<string, number>;
  total: number;
  recordCount: number;
  allExpiries?: DayCountEntry[];
}

// Helpers: Timezone America/Lima (UTC-5)
const getPeruToday = (): string => {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Lima',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).format(new Date());
};

const addDaysPeru = (dateStr: string, days: number): string => {
  if (!dateStr) return getPeruToday();
  const [y, m, d] = dateStr.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + days, 12, 0, 0));
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Lima',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).format(dt);
};

// Formato corto de fecha de vencimiento: DD/MM/AA (ej: 30/11/26) o S/V
const formatShortExpiry = (dateStr: string | null | undefined): string => {
  if (!dateStr || !dateStr.trim()) return 'S/V';
  try {
    const clean = dateStr.trim().split('T')[0];
    const parts = clean.split('-');
    if (parts.length === 3) {
      const [y, m, d] = parts;
      const shortYear = y.length === 4 ? y.slice(2) : y;
      return `${d}/${m}/${shortYear}`;
    }
    return clean;
  } catch {
    return dateStr || 'S/V';
  }
};

const CountHistory: React.FC<CountHistoryProps> = ({ catalog = [] }) => {
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

  // Fast Search with Debouncing (prevents UI freezing while typing)
  const [searchTerm, setSearchTerm] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(searchTerm.trim().toLowerCase());
    }, 150);
    return () => clearTimeout(timer);
  }, [searchTerm]);

  // Date Range Filters: DESDE y HASTA
  const [startDate, setStartDate] = useState(() => addDaysPeru(getPeruToday(), -2));
  const [endDate, setEndDate] = useState(() => getPeruToday());

  // Pagination for matrix view
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState<number>(50);

  // Fast O(1) Catalog Map Indexing
  const catalogMap = useMemo(() => {
    const map = new Map<string, Product>();
    catalog.forEach(p => {
      if (p.codigo) {
        map.set(p.codigo.trim().toUpperCase(), p);
      }
    });
    return map;
  }, [catalog]);

  // Fetch records whenever startDate or endDate changes
  useEffect(() => {
    if (startDate && endDate) {
      fetchRecords(startDate, endDate);
    }
  }, [startDate, endDate]);

  const fetchRecords = async (start: string, end: string) => {
    if (!start || !end) return;
    setLoading(true);
    try {
      const sedeId = currentUser?.sede_id;
      const startISO = `${start}T00:00:00.000-05:00`;
      const endISO = `${end}T23:59:59.999-05:00`;

      let allData: StocktakeRecord[] = [];
      let from = 0;
      const step = 1000;
      let hasMore = true;

      while (hasMore) {
        let query = supabase
          .from('conteo_inventario')
          .select('*')
          .gte('fecha_registro', startISO)
          .lte('fecha_registro', endISO)
          .order('fecha_registro', { ascending: false })
          .range(from, from + step - 1);

        if (sedeId) {
          query = query.eq('sede_id', sedeId);
        }

        const { data, error } = await query;
        if (error) throw error;

        if (data && data.length > 0) {
          allData = allData.concat(data as StocktakeRecord[]);
          if (data.length < step) {
            hasMore = false;
          } else {
            from += step;
          }
        } else {
          hasMore = false;
        }
      }

      setRecords(allData);
    } catch (err: any) {
      console.error('Error fetching stocktake records:', err.message);
    } finally {
      setLoading(false);
    }
  };

  // Timezone conversion helper to America/Lima YYYY-MM-DD
  const getPeruDateKey = (dateStr: string): string => {
    if (!dateStr) return '';
    try {
      const d = new Date(dateStr);
      if (isNaN(d.getTime())) return dateStr.slice(0, 10);
      return new Intl.DateTimeFormat('en-CA', {
        timeZone: 'America/Lima',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit'
      }).format(d);
    } catch {
      return dateStr.slice(0, 10);
    }
  };

  // Month abbreviations in uppercase
  const MONTH_ABBR = ['ENE', 'FEB', 'MAR', 'ABR', 'MAY', 'JUN', 'JUL', 'AGO', 'SEP', 'OCT', 'NOV', 'DIC'];

  // Format Peru Date for column headers (e.g. 09-AGO, 08-SEP)
  const formatPeruDateDisplay = (dateKey: string): { display: string; short: string; weekday: string } => {
    try {
      const [y, m, d] = dateKey.split('-').map(Number);
      const dateObj = new Date(Date.UTC(y, m - 1, d, 12, 0, 0));
      const dayStr = String(d).padStart(2, '0');
      const monthAbbr = MONTH_ABBR[m - 1] || String(m).padStart(2, '0');
      const weekday = new Intl.DateTimeFormat('es-PE', { weekday: 'short', timeZone: 'America/Lima' }).format(dateObj);
      return {
        display: `${dayStr}-${monthAbbr}`,
        short: `${dayStr}/${String(m).padStart(2, '0')}`,
        weekday: weekday.toUpperCase().replace('.', '')
      };
    } catch {
      return { display: dateKey, short: dateKey, weekday: '' };
    }
  };

  const getRecordZone = (record: StocktakeRecord): ZoneType => {
    if (record.zona) return record.zona as ZoneType;
    const prod = catalogMap.get((record.codigo || '').trim().toUpperCase());
    if (prod?.zona_predeterminada) return prod.zona_predeterminada as ZoneType;
    if (prod?.es_congelado) return 'CONGELADO';
    if (prod?.es_refrigerado) return 'REFRIGERADO';
    return 'SECO';
  };

  // Filter individual records
  const filteredRecords = useMemo(() => {
    return records.filter(record => {
      const zone = getRecordZone(record);
      const matchesZone = activeFilter === 'ALL' || zone === activeFilter;
      
      const term = debouncedSearch;
      const matchesSearch = !term || 
        (record.nombre && record.nombre.toLowerCase().includes(term)) || 
        (record.codigo && record.codigo.toLowerCase().includes(term)) || 
        (record.usuario_registro && record.usuario_registro.toLowerCase().includes(term)) ||
        (record.fecha_vencimiento && record.fecha_vencimiento.toLowerCase().includes(term));
      
      const recordDateKey = getPeruDateKey(record.fecha_registro);
      let matchesDate = true;
      if (startDate) {
        matchesDate = matchesDate && recordDateKey >= startDate;
      }
      if (endDate) {
        matchesDate = matchesDate && recordDateKey <= endDate;
      }

      return matchesZone && matchesSearch && matchesDate;
    });
  }, [records, activeFilter, debouncedSearch, startDate, endDate, catalogMap]);

  // Aggregation for Columnar Matrix View
  // Columns: CÓDIGO | DESCRIPCIÓN | U.M. | [FECHA 1, FECHA 2...] | TOTAL
  const { 
    matrixRows, 
    sortedDateKeys, 
    totalsByDate, 
    grandTotal 
  } = useMemo(() => {
    const productMap = new Map<string, ProductMatrixRow>();
    const dateKeySet = new Set<string>();

    // Generar todas las fechas del rango seleccionado (DESDE - HASTA)
    if (startDate && endDate) {
      try {
        const [sy, sm, sd] = startDate.split('-').map(Number);
        const [ey, em, ed] = endDate.split('-').map(Number);
        const cur = new Date(Date.UTC(sy, sm - 1, sd, 12, 0, 0));
        const target = new Date(Date.UTC(ey, em - 1, ed, 12, 0, 0));
        let count = 0;
        while (cur <= target && count < 62) {
          const y = cur.getUTCFullYear();
          const m = String(cur.getUTCMonth() + 1).padStart(2, '0');
          const d = String(cur.getUTCDate()).padStart(2, '0');
          dateKeySet.add(`${y}-${m}-${d}`);
          cur.setUTCDate(cur.getUTCDate() + 1);
          count++;
        }
      } catch (e) {
        console.error('Error generating date range', e);
      }
    }

    filteredRecords.forEach(record => {
      const rawCode = (record.codigo || '').trim().toUpperCase();
      if (!rawCode) return;

      const dateKey = getPeruDateKey(record.fecha_registro);
      if (dateKey) {
        dateKeySet.add(dateKey);
      }

      let row = productMap.get(rawCode);
      if (!row) {
        const prod = catalogMap.get(rawCode);
        const desc = prod?.nombre || record.nombre || 'SIN DESCRIPCIÓN';
        const um = (prod?.unidad_medida_sap || prod?.unidad_venta || 'UND').toUpperCase();
        const zone = getRecordZone(record);

        row = {
          codigo: rawCode,
          descripcion: desc,
          um,
          zona: zone,
          countsByDate: {},
          dayTotals: {},
          total: 0,
          recordCount: 0
        };
        productMap.set(rawCode, row);
      }

      const qty = Number(record.cantidad) || 0;
      const rawExp = (record.fecha_vencimiento || '').trim();

      if (dateKey) {
        if (!row.countsByDate[dateKey]) {
          row.countsByDate[dateKey] = [];
          row.dayTotals[dateKey] = 0;
        }

        // Check if there is an existing count entry with the exact same expiry date on that day
        const existingEntry = row.countsByDate[dateKey].find(e => e.rawExpiry === rawExp);
        if (existingEntry) {
          existingEntry.qty += qty;
        } else {
          row.countsByDate[dateKey].push({
            qty,
            rawExpiry: rawExp,
            shortExpiry: formatShortExpiry(rawExp)
          });
        }

        row.dayTotals[dateKey] += qty;
      }

      row.total += qty;
      row.recordCount += 1;
    });

    // Sort unique date columns chronologically (from oldest to newest)
    const dateKeys = Array.from(dateKeySet).sort((a, b) => a.localeCompare(b));

    // Compute column totals per date
    const colTotals: Record<string, number> = {};
    dateKeys.forEach(dk => { colTotals[dk] = 0; });
    let totalAll = 0;

    const rows = Array.from(productMap.values()).sort((a, b) => a.codigo.localeCompare(b.codigo));

    rows.forEach(r => {
      totalAll += r.total;
      dateKeys.forEach(dk => {
        if (r.dayTotals[dk] !== undefined) {
          colTotals[dk] = (colTotals[dk] || 0) + r.dayTotals[dk];
        }
      });

      // Recopilar todos los vencimientos únicos del período para la vista consolidada
      const expMap = new Map<string, DayCountEntry>();
      Object.values(r.countsByDate).forEach(entries => {
        entries.forEach(e => {
          const existing = expMap.get(e.rawExpiry);
          if (existing) {
            existing.qty += e.qty;
          } else {
            expMap.set(e.rawExpiry, { ...e });
          }
        });
      });
      r.allExpiries = Array.from(expMap.values()).sort((a, b) => (a.rawExpiry || '').localeCompare(b.rawExpiry || ''));
    });

    return {
      matrixRows: rows,
      sortedDateKeys: dateKeys,
      totalsByDate: colTotals,
      grandTotal: totalAll
    };
  }, [filteredRecords, catalogMap]);

  // Paginated matrix rows
  const paginatedMatrixRows = useMemo(() => {
    if (pageSize === -1) return matrixRows;
    const start = (page - 1) * pageSize;
    return matrixRows.slice(start, start + pageSize);
  }, [matrixRows, page, pageSize]);

  const totalPages = pageSize === -1 ? 1 : Math.max(1, Math.ceil(matrixRows.length / pageSize));

  // Export Matrix to Excel
  const handleExportMatrixExcel = () => {
    if (matrixRows.length === 0) {
      alert("No hay datos para exportar con los filtros actuales.");
      return;
    }

    try {
      // Exportación de Matriz con fechas en columnas (ej: 01-SEP ... 10-SEP) y solo cantidades numéricas
      const dateHeaders = sortedDateKeys.map(dk => formatPeruDateDisplay(dk).display);
      const headers = ['CÓDIGO', 'DESCRIPCIÓN', 'U.M.', ...dateHeaders, 'TOTAL'];

      const exportRows = matrixRows.map(row => {
        const item: any = {
          'CÓDIGO': row.codigo,
          'DESCRIPCIÓN': row.descripcion,
          'U.M.': row.um,
        };

        sortedDateKeys.forEach((dk, idx) => {
          const colName = dateHeaders[idx];
          const dayTot = row.dayTotals[dk];
          if (dayTot !== undefined && (row.countsByDate[dk] || []).length > 0) {
            item[colName] = Number(dayTot.toFixed(2));
          } else {
            item[colName] = '-';
          }
        });

        item['TOTAL'] = Number(row.total.toFixed(2));
        return item;
      });

      // Totals summary row
      const totalsRow: any = {
        'CÓDIGO': 'TOTALES',
        'DESCRIPCIÓN': `SUMA TOTAL (${matrixRows.length} PRODUCTOS)`,
        'U.M.': '',
      };
      sortedDateKeys.forEach((dk, idx) => {
        const colName = dateHeaders[idx];
        const colTotal = totalsByDate[dk] || 0;
        totalsRow[colName] = colTotal > 0 ? Number(colTotal.toFixed(2)) : '-';
      });
      totalsRow['TOTAL'] = Number(grandTotal.toFixed(2));
      exportRows.push(totalsRow);

      const ws = XLSX.utils.json_to_sheet(exportRows, { header: headers });
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "Conteo_Matriz_Fechas");

      const fileDate = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Lima' }).format(new Date());
      saveExcelWorkbook(wb, `historico_conteos_matriz_${fileDate}`, XLSX);
    } catch (e: any) {
      alert("Error al exportar a Excel: " + e.message);
    }
  };

  return (
    <div className="flex flex-col h-full bg-slate-50 text-slate-800">
      {/* ========================================================================= */}
      {/* HEADER COMPACTO Y ELEGANTE                                                */}
      {/* ========================================================================= */}
      <div className="bg-white border-b border-slate-200 px-4 py-2.5 shadow-xs">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-2.5">
          {/* Título & Resumen Estadístico */}
          <div className="flex items-center gap-3">
            <div className="p-2 bg-sky-50 text-[#009ED6] rounded-xl border border-sky-100 shadow-xs">
              <History className="w-5 h-5"/>
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-black text-slate-900 leading-tight">
                  Histórico de Conteos
                </h2>
                {/* Resumen Compacto */}
                <div className="hidden sm:flex items-center gap-1.5 text-[11px] font-bold text-slate-600 bg-slate-100 px-2.5 py-0.5 rounded-full border border-slate-200">
                  <span>{matrixRows.length} Productos</span>
                  <span>•</span>
                  <span className="text-[#009ED6]">{sortedDateKeys.length} Días</span>
                  <span>•</span>
                  <span className="text-emerald-700 font-extrabold">{Number(grandTotal.toFixed(2))} Unidades</span>
                </div>
              </div>
              <p className="text-[11px] text-slate-400 font-medium">
                Matriz de cantidades contadas por fecha de registro
              </p>
            </div>
          </div>

          {/* Exportar & Recargar */}
          <div className="flex items-center gap-2">
            {/* Botón Exportar Matriz */}
            <button 
              onClick={handleExportMatrixExcel}
              disabled={matrixRows.length === 0}
              className="flex items-center gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white px-3 py-1.5 rounded-xl text-xs font-bold shadow-xs transition-all disabled:opacity-50"
              title="Descargar matriz con columnas de fechas en Excel"
            >
              <FileSpreadsheet className="w-3.5 h-3.5"/>
              <span className="hidden sm:inline">Excel</span> Matriz
            </button>

            {/* Botón Refrescar */}
            <button
              onClick={() => fetchRecords(startDate, endDate)}
              disabled={loading}
              className="p-2 text-slate-600 hover:text-[#009ED6] bg-slate-100 hover:bg-sky-50 border border-slate-200 rounded-xl transition-all"
              title="Recargar datos del rango seleccionado"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin text-[#009ED6]' : ''}`} />
            </button>
          </div>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* BARRA DE FILTROS: RANGO DE FECHAS Y CÁMARAS (SECO, REFRI, CONGELADO)     */}
      {/* ========================================================================= */}
      <div className="bg-white border-b border-slate-200 px-4 py-2.5 shadow-xs">
        <div className="flex flex-wrap items-center justify-between gap-3">
          {/* Lado Izquierdo: Buscador & Rango de Fechas (DESDE / HASTA) */}
          <div className="flex flex-wrap items-center gap-2.5 flex-1 min-w-[280px]">
            {/* Buscador */}
            <div className="relative flex-1 min-w-[200px] max-w-sm">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input 
                type="text" 
                placeholder="Buscar por código o descripción..."
                className="w-full pl-8 pr-7 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-800 placeholder-slate-400 focus:bg-white focus:border-[#009ED6] focus:ring-1 focus:ring-[#009ED6] outline-none transition-all"
                value={searchTerm}
                onChange={e => {
                  setSearchTerm(e.target.value);
                  setPage(1);
                }}
              />
              {searchTerm && (
                <button
                  onClick={() => {
                    setSearchTerm('');
                    setPage(1);
                  }}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 p-0.5"
                  title="Limpiar búsqueda"
                >
                  <X className="w-3 h-3" />
                </button>
              )}
            </div>

            {/* Selector de Rango de Fechas: DESDE / HASTA */}
            <div className="flex items-center gap-1.5 bg-slate-50 border border-slate-200 px-2.5 py-1 rounded-xl text-xs">
              <Calendar className="w-3.5 h-3.5 text-[#009ED6] shrink-0" />
              <span className="text-[10px] font-black text-slate-500 uppercase">Desde:</span>
              <input 
                type="date" 
                className="bg-white border border-slate-200 rounded-md px-1.5 py-0.5 text-xs font-bold text-slate-700 outline-none focus:border-[#009ED6]"
                value={startDate}
                onChange={e => {
                  setStartDate(e.target.value);
                  setPage(1);
                }}
                title="Fecha inicio"
              />
              <span className="text-[10px] font-black text-slate-500 uppercase">Hasta:</span>
              <input 
                type="date" 
                className="bg-white border border-slate-200 rounded-md px-1.5 py-0.5 text-xs font-bold text-slate-700 outline-none focus:border-[#009ED6]"
                value={endDate}
                onChange={e => {
                  setEndDate(e.target.value);
                  setPage(1);
                }}
                title="Fecha fin"
              />
            </div>

            {/* Icono de Cargando en el filtro */}
            {loading && (
              <div className="flex items-center gap-1.5 px-2.5 py-1 bg-sky-50 text-[#009ED6] border border-sky-200 rounded-lg text-xs font-bold animate-pulse">
                <RefreshCw className="w-3.5 h-3.5 animate-spin text-[#009ED6]" />
                <span>Cargando...</span>
              </div>
            )}
          </div>

          {/* Lado Derecho: Pestañas de Sector */}
          <div className="flex items-center gap-1 bg-slate-100 p-0.5 rounded-xl border border-slate-200 text-xs font-bold">
            {(['ALL', 'SECO', 'REFRIGERADO', 'CONGELADO'] as const).map(tab => (
              <button
                key={tab}
                onClick={() => {
                  setActiveFilter(tab);
                  setPage(1);
                }}
                className={`px-2.5 py-1 rounded-lg transition-all flex items-center gap-1 text-[11px] ${
                  activeFilter === tab 
                    ? 'bg-white text-slate-900 shadow-xs font-black' 
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                {tab === 'SECO' && <Sun className="w-3 h-3 text-amber-500" />}
                {tab === 'REFRIGERADO' && <Snowflake className="w-3 h-3 text-cyan-500" />}
                {tab === 'CONGELADO' && <Snowflake className="w-3 h-3 text-blue-500" />}
                <span>{tab === 'ALL' ? 'Todos' : tab === 'SECO' ? 'Secos' : tab === 'REFRIGERADO' ? 'Refrig.' : 'Congel.'}</span>
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* MATRIZ POR COLUMNAS DE FECHAS                                             */}
      {/* ========================================================================= */}
      <div className="flex-1 flex flex-col min-h-0 p-3">
          <div className="flex-1 overflow-x-auto overflow-y-auto bg-white border border-slate-200 rounded-2xl shadow-xs relative min-h-[350px]">
            {loading ? (
              <div className="flex flex-col items-center justify-center py-24 text-slate-500 gap-3">
                <RefreshCw className="w-7 h-7 text-[#009ED6] animate-spin" />
                <span className="text-xs font-bold uppercase tracking-wider text-slate-600">
                  Cargando conteos de inventario...
                </span>
              </div>
            ) : paginatedMatrixRows.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-24 text-slate-400 gap-2">
                <Calendar className="w-8 h-8 text-slate-300" />
                <p className="text-sm font-bold text-slate-500">
                  No se encontraron conteos con los filtros seleccionados.
                </p>
                <p className="text-xs text-slate-400">
                  Intente ampliar el rango de fechas o limpiar el buscador.
                </p>
              </div>
            ) : (
              /* TABLA MATRIZ: COLUMNAS DE FECHAS CON CANTIDADES CONTADAS */
              <table className="w-full text-left border-collapse min-w-[700px]">
                <thead>
                  <tr className="bg-slate-100 text-slate-700 font-extrabold text-[11px] uppercase border-b border-slate-200 sticky top-0 z-20 shadow-xs">
                    {/* 1. CÓDIGO */}
                    <th className="px-3 py-2.5 sticky left-0 z-30 bg-slate-100 border-r border-slate-200 min-w-[110px] max-w-[130px] shadow-xs">
                      CÓDIGO
                    </th>

                    {/* 2. DESCRIPCIÓN */}
                    <th className="px-3 py-2.5 sticky left-[110px] z-30 bg-slate-100 border-r border-slate-200 min-w-[220px] max-w-[340px] shadow-xs">
                      DESCRIPCIÓN
                    </th>

                    {/* 3. U.M. */}
                    <th className="px-2.5 py-2.5 text-center border-r border-slate-200 min-w-[55px] text-[10px]">
                      U.M.
                    </th>

                    {/* 4. COLUMNAS DINÁMICAS POR FECHA (todas las fechas del filtro) */}
                    {sortedDateKeys.map(dateKey => {
                      const { display, weekday } = formatPeruDateDisplay(dateKey);
                      const daySum = totalsByDate[dateKey] || 0;
                      return (
                        <th 
                          key={dateKey} 
                          className="px-2 py-2 text-center border-r border-slate-200 min-w-[85px] max-w-[120px] bg-slate-50/90"
                        >
                          <div className="flex flex-col items-center">
                            <span className="text-[11px] font-black text-slate-800 tracking-tight">{display}</span>
                            <span className="text-[8.5px] font-bold text-slate-400 uppercase">{weekday}</span>
                            <span className={`text-[9px] font-black px-1.5 py-0.2 rounded mt-0.5 border ${
                              daySum > 0 
                                ? 'text-[#009ED6] bg-sky-50 border-sky-200' 
                                : 'text-slate-400 bg-slate-100 border-slate-200'
                            }`}>
                              {daySum > 0 ? Number(daySum.toFixed(2)).toLocaleString('es-PE', { minimumFractionDigits: 0, maximumFractionDigits: 1 }) : '-'}
                            </span>
                          </div>
                        </th>
                      );
                    })}

                    {/* 5. TOTAL */}
                    <th className="px-3.5 py-2.5 text-right bg-slate-200/90 font-black text-slate-900 border-l border-slate-300 min-w-[95px]">
                      TOTAL
                    </th>
                  </tr>
                </thead>

                <tbody className="divide-y divide-slate-100 text-xs">
                  {paginatedMatrixRows.map((row) => (
                    <tr 
                      key={row.codigo} 
                      className="hover:bg-slate-50/90 transition-colors group"
                    >
                      {/* CÓDIGO */}
                      <td className="px-3 py-2.5 sticky left-0 z-10 bg-white group-hover:bg-slate-50 border-r border-slate-200 font-mono font-black text-[#009ED6] shadow-xs whitespace-nowrap">
                        {row.codigo}
                      </td>

                      {/* DESCRIPCIÓN */}
                      <td className="px-3 py-2.5 sticky left-[110px] z-10 bg-white group-hover:bg-slate-50 border-r border-slate-200 font-bold text-slate-800 shadow-xs break-words line-clamp-2">
                        {row.descripcion}
                      </td>

                      {/* U.M. */}
                      <td className="px-2.5 py-2.5 text-center border-r border-slate-100 font-extrabold text-slate-500 uppercase text-[10px]">
                        {row.um}
                      </td>

                      {/* CELDAS POR FECHA: SOLO CANTIDADES NUMÉRICAS */}
                      {sortedDateKeys.map(dateKey => {
                        const entries = row.countsByDate[dateKey] || [];
                        const dayTotal = row.dayTotals[dateKey] || 0;
                        const hasCount = entries.length > 0;

                        return (
                          <td 
                            key={dateKey} 
                            className="px-2 py-2 text-center border-r border-slate-100 align-middle"
                          >
                            {hasCount ? (
                              <div 
                                className="flex flex-col items-center justify-center py-1"
                                title={entries.map(e => `${e.qty} ${e.shortExpiry ? `[${e.shortExpiry}]` : ''}`).join(' | ')}
                              >
                                <span className="text-xs font-black text-slate-900 font-mono">
                                  {Number(dayTotal.toFixed(2)).toLocaleString('es-PE', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}
                                </span>
                              </div>
                            ) : (
                              <span className="text-slate-300 font-medium">-</span>
                            )}
                          </td>
                        );
                      })}

                      {/* TOTAL PRODUCTO */}
                      <td className="px-3.5 py-2.5 text-right font-black text-slate-900 bg-slate-50/60 group-hover:bg-slate-100/60 border-l border-slate-200 font-mono text-xs">
                        {Number(row.total.toFixed(2)).toLocaleString('es-PE', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}
                      </td>
                    </tr>
                  ))}
                </tbody>

                {/* FILA DE TOTALES EN EL PIE */}
                <tfoot>
                  <tr className="bg-slate-200/90 text-slate-900 font-black text-xs border-t-2 border-slate-300 sticky bottom-0 z-20 shadow-md">
                    <td className="px-3 py-2.5 sticky left-0 z-30 bg-slate-200 border-r border-slate-300 shadow-xs uppercase text-[10px]">
                      TOTALES
                    </td>
                    <td className="px-3 py-2.5 sticky left-[110px] z-30 bg-slate-200 border-r border-slate-300 shadow-xs text-[11px] uppercase">
                      Suma ({matrixRows.length} productos)
                    </td>
                    <td className="px-2.5 py-2.5 text-center border-r border-slate-300">-</td>
                    {sortedDateKeys.map(dateKey => {
                      const dayTotal = totalsByDate[dateKey] || 0;
                      return (
                        <td key={dateKey} className="px-2 py-2.5 text-center border-r border-slate-300 font-mono font-black text-xs text-slate-900">
                          {dayTotal > 0 ? Number(dayTotal.toFixed(2)).toLocaleString('es-PE', { minimumFractionDigits: 0, maximumFractionDigits: 2 }) : '-'}
                        </td>
                      );
                    })}
                    <td className="px-3.5 py-2.5 text-right bg-slate-300 font-mono font-black text-xs text-emerald-800 border-l border-slate-400">
                      {Number(grandTotal.toFixed(2)).toLocaleString('es-PE', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}
                    </td>
                  </tr>
                </tfoot>
              </table>
            )}
          </div>

          {/* Controles de Paginación */}
          {matrixRows.length > 0 && (
            <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-2 text-xs text-slate-600">
              <div className="flex items-center gap-2">
                <span>Mostrar:</span>
                <select
                  className="bg-white border border-slate-200 rounded-lg px-2 py-1 font-bold outline-none"
                  value={pageSize}
                  onChange={e => {
                    setPageSize(Number(e.target.value));
                    setPage(1);
                  }}
                >
                  <option value={25}>25 productos</option>
                  <option value={50}>50 productos</option>
                  <option value={100}>100 productos</option>
                  <option value={-1}>Todos ({matrixRows.length})</option>
                </select>
                <span className="text-slate-400 text-[11px]">
                  Mostrando {pageSize === -1 ? matrixRows.length : Math.min(matrixRows.length, (page - 1) * pageSize + 1)} - {pageSize === -1 ? matrixRows.length : Math.min(matrixRows.length, page * pageSize)} de {matrixRows.length} productos
                </span>
              </div>

              {pageSize !== -1 && totalPages > 1 && (
                <div className="flex items-center gap-1.5">
                  <button
                    onClick={() => setPage(p => Math.max(1, p - 1))}
                    disabled={page === 1}
                    className="p-1.5 bg-white border border-slate-200 rounded-lg disabled:opacity-40 hover:bg-slate-50 transition-colors"
                  >
                    <ChevronLeft className="w-4 h-4" />
                  </button>
                  <span className="px-2 font-bold text-slate-700 text-xs">
                    Página {page} de {totalPages}
                  </span>
                  <button
                    onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                    disabled={page === totalPages}
                    className="p-1.5 bg-white border border-slate-200 rounded-lg disabled:opacity-40 hover:bg-slate-50 transition-colors"
                  >
                    <ChevronRight className="w-4 h-4" />
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
    </div>
  );
};

export default CountHistory;
