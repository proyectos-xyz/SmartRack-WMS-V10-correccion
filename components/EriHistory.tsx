import React, { useState, useEffect, useMemo, useRef } from 'react';
import { Product, ZoneType } from '../types';
import { supabase } from '../supabaseClient';
import { 
  Search, 
  RefreshCw, 
  Download, 
  Calendar, 
  Sun, 
  Snowflake, 
  CheckCircle, 
  ChevronLeft, 
  ChevronRight, 
  ChevronDown, 
  TrendingUp, 
  X,
  Maximize,
  Minimize,
  Layers
} from './Icons';
import { 
  ResponsiveContainer, 
  LineChart, 
  Line, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ReferenceLine 
} from 'recharts';
import * as XLSX from 'xlsx-js-style';

interface EriHistoryProps {
  catalog?: Product[];
}

type ZoneFilterType = 'ALL' | ZoneType;

interface DifferenceRecord {
  id?: string;
  fecha: string;
  codigo: string;
  nombre: string;
  stock_sistema: number;
  conteo_fisico: number;
  diferencia: number;
  procesado_por?: string;
  fecha_procesado?: string;
  sede_id?: string;
  zona: ZoneType;
  categoria: string;
}

interface DayEriSummary {
  fecha: string;
  displayDate: string;
  dayName: string;
  totalItems: number;
  exactItems: number;
  diffItems: number;
  eriGlobal: number;
  eriSeco: number;
  secoTotal: number;
  secoExact: number;
  eriRefrigerado: number;
  refrigTotal: number;
  refrigExact: number;
  eriCongelado: number;
  congTotal: number;
  congExact: number;
  records: DifferenceRecord[];
}

// Peruvian Timezone Helpers
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

const formatFriendlyDate = (dateStr: string): { displayDate: string; dayName: string } => {
  if (!dateStr) return { displayDate: '', dayName: '' };
  try {
    const [y, m, d] = dateStr.split('-').map(Number);
    const date = new Date(Date.UTC(y, m - 1, d, 12, 0, 0));
    
    const dayName = new Intl.DateTimeFormat('es-PE', {
      timeZone: 'America/Lima',
      weekday: 'short'
    }).format(date).toUpperCase();

    const displayDate = `${String(d).padStart(2, '0')}/${String(m).padStart(2, '0')}`;
    return { displayDate, dayName };
  } catch {
    return { displayDate: dateStr, dayName: '' };
  }
};

const EriHistory: React.FC<EriHistoryProps> = ({ catalog = [] }) => {
  const [currentUser] = useState(() => {
    try {
      const saved = localStorage.getItem('smartwms_user');
      return saved ? JSON.parse(saved) : null;
    } catch {
      return null;
    }
  });

  // Date Range (default: last 7 days in Peru timezone)
  const [startDate, setStartDate] = useState(() => addDaysPeru(getPeruToday(), -6));
  const [endDate, setEndDate] = useState(() => getPeruToday());

  // Filter and view states
  const [activeZone, setActiveZone] = useState<ZoneFilterType>('ALL');
  const [activeTab, setActiveTab] = useState<'HIERARCHY' | 'DAILY' | 'PRODUCT_MATRIX'>('HIERARCHY');
  const [searchTerm, setSearchTerm] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [showTrendModal, setShowTrendModal] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Hierarchy expansion state
  const [expandedZones, setExpandedZones] = useState<Record<string, boolean>>({
    'SECO': true,
    'REFRIGERADO': true,
    'CONGELADO': true
  });
  const [expandedCategories, setExpandedCategories] = useState<Record<string, boolean>>({});

  // Trend chart series visibility
  const [visibleSeries, setVisibleSeries] = useState({
    global: true,
    seco: true,
    refrigerado: true,
    congelado: true
  });

  // Raw records loaded from Supabase
  const [diffRecords, setDiffRecords] = useState<DifferenceRecord[]>([]);

  // Selected day for detail modal
  const [selectedDayDetail, setSelectedDayDetail] = useState<DayEriSummary | null>(null);

  // Pagination for product matrix
  const [matrixPage, setMatrixPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);

  // Debounce search
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(searchTerm.trim().toLowerCase());
      setMatrixPage(1);
    }, 150);
    return () => clearTimeout(timer);
  }, [searchTerm]);

  // Catalog Map for instant O(1) zone, category, and name lookup
  const catalogMap = useMemo(() => {
    const map = new Map<string, Product>();
    catalog.forEach(p => {
      if (p.codigo) {
        map.set(p.codigo.trim().toLowerCase(), p);
      }
    });
    return map;
  }, [catalog]);

  // Fetch records whenever startDate or endDate changes
  useEffect(() => {
    if (startDate && endDate) {
      loadEriHistory(startDate, endDate);
    }
  }, [startDate, endDate]);

  const loadEriHistory = async (start: string, end: string) => {
    if (!start || !end) return;
    setIsLoading(true);
    try {
      const sedeId = currentUser?.sede_id;

      // 1. Fetch paginated from historial_diferencias
      let allRecords: any[] = [];
      let from = 0;
      const step = 1000;
      let hasMore = true;

      while (hasMore) {
        let query = supabase
          .from('historial_diferencias')
          .select('*')
          .gte('fecha', start)
          .lte('fecha', end)
          .order('fecha', { ascending: false })
          .range(from, from + step - 1);

        if (sedeId) {
          query = query.eq('sede_id', sedeId);
        }

        const { data, error } = await query;
        if (error) throw error;

        if (data && data.length > 0) {
          allRecords = allRecords.concat(data);
          if (data.length < step) {
            hasMore = false;
          } else {
            from += step;
          }
        } else {
          hasMore = false;
        }
      }

      // 2. Check if today is inside the range and has stock_sistema + conteos that aren't yet closed in historial_diferencias
      const today = getPeruToday();
      const hasTodayInHistory = allRecords.some(r => r.fecha === today);

      if (!hasTodayInHistory && start <= today && end >= today) {
        try {
          // Fetch current stock_sistema
          let sysQuery = supabase.from('stock_sistema').select('*');
          if (sedeId) sysQuery = sysQuery.eq('sede_id', sedeId);
          const { data: sysData } = await sysQuery;

          // Fetch today's counts from conteo_inventario
          const startISO = `${today}T00:00:00.000-05:00`;
          const endISO = `${today}T23:59:59.999-05:00`;
          let countQuery = supabase
            .from('conteo_inventario')
            .select('*')
            .gte('fecha_registro', startISO)
            .lte('fecha_registro', endISO);
          if (sedeId) countQuery = countQuery.eq('sede_id', sedeId);
          const { data: countsData } = await countQuery;

          if (sysData && sysData.length > 0 && countsData && countsData.length > 0) {
            // Group today's counts by product code
            const countsMap = new Map<string, number>();
            countsData.forEach(c => {
              const code = (c.codigo || '').trim().toLowerCase();
              countsMap.set(code, (countsMap.get(code) || 0) + (Number(c.cantidad) || 0));
            });

            // Build today's live reconciliation records
            const liveRecords = sysData.map(s => {
              const code = (s.codigo || '').trim();
              const counted = countsMap.get(code.toLowerCase()) || 0;
              const systemQty = Number(s.cantidad) || 0;
              const diff = counted - systemQty;
              const prod = catalogMap.get(code.toLowerCase());

              return {
                id: `live-${code}`,
                fecha: today,
                codigo: code,
                nombre: prod?.nombre || s.nombre || `Producto ${code}`,
                stock_sistema: systemQty,
                conteo_fisico: counted,
                diferencia: diff,
                procesado_por: 'En Vivo (Hoy)',
                sede_id: sedeId,
                zona: (prod?.zona_predeterminada as ZoneType) || 'SECO',
                categoria: (prod?.categoria || '').trim().toUpperCase() || 'SIN CATEGORÍA'
              };
            });

            allRecords = [...liveRecords, ...allRecords];
          }
        } catch (liveErr) {
          console.warn("No se pudo calcular ERI en vivo de hoy:", liveErr);
        }
      }

      // Map catalog zone and category to all records
      const enriched: DifferenceRecord[] = allRecords.map(r => {
        const prod = catalogMap.get((r.codigo || '').trim().toLowerCase());
        const zona = (prod?.zona_predeterminada as ZoneType) || 'SECO';
        const categoria = (prod?.categoria || '').trim().toUpperCase() || 'SIN CATEGORÍA';
        return {
          ...r,
          nombre: prod?.nombre || r.nombre || `SKU ${r.codigo}`,
          stock_sistema: Number(r.stock_sistema || 0),
          conteo_fisico: Number(r.conteo_fisico || 0),
          diferencia: Number(r.diferencia || 0),
          zona,
          categoria
        };
      });

      setDiffRecords(enriched);
    } catch (err) {
      console.error("Error al cargar historial ERI:", err);
    } finally {
      setIsLoading(false);
    }
  };

  // Filter records by camera/zone
  const filteredRecords = useMemo(() => {
    if (activeZone === 'ALL') return diffRecords;
    return diffRecords.filter(r => r.zona === activeZone);
  }, [diffRecords, activeZone]);

  // Unique Dates sorted chronologically (Ascending for horizontal progression left-to-right)
  const sortedDatesAsc = useMemo(() => {
    const dates = Array.from(new Set(diffRecords.map(r => r.fecha)));
    return dates.sort((a, b) => a.localeCompare(b));
  }, [diffRecords]);

  // Unique Dates in descending order (latest first)
  const sortedDatesDesc = useMemo(() => {
    return [...sortedDatesAsc].reverse();
  }, [sortedDatesAsc]);

  // Group by Date for Day Summary Cards and Table
  const daySummaries = useMemo<DayEriSummary[]>(() => {
    return sortedDatesDesc.map(fecha => {
      const recordsForDay = diffRecords.filter(r => r.fecha === fecha);
      const { displayDate, dayName } = formatFriendlyDate(fecha);

      const activeZoneRecords = activeZone === 'ALL' 
        ? recordsForDay 
        : recordsForDay.filter(r => r.zona === activeZone);

      const totalItems = activeZoneRecords.length;
      const exactItems = activeZoneRecords.filter(r => r.diferencia === 0).length;
      const diffItems = totalItems - exactItems;
      const eriGlobal = totalItems > 0 ? (exactItems / totalItems) * 100 : 0;

      // Seco
      const secoRecords = recordsForDay.filter(r => r.zona === 'SECO');
      const secoTotal = secoRecords.length;
      const secoExact = secoRecords.filter(r => r.diferencia === 0).length;
      const eriSeco = secoTotal > 0 ? (secoExact / secoTotal) * 100 : 0;

      // Refrigerado
      const refrigRecords = recordsForDay.filter(r => r.zona === 'REFRIGERADO');
      const refrigTotal = refrigRecords.length;
      const refrigExact = refrigRecords.filter(r => r.diferencia === 0).length;
      const eriRefrigerado = refrigTotal > 0 ? (refrigExact / refrigTotal) * 100 : 0;

      // Congelado
      const congRecords = recordsForDay.filter(r => r.zona === 'CONGELADO');
      const congTotal = congRecords.length;
      const congExact = congRecords.filter(r => r.diferencia === 0).length;
      const eriCongelado = congTotal > 0 ? (congExact / congTotal) * 100 : 0;

      return {
        fecha,
        displayDate: `${displayDate}/${fecha.split('-')[0]}`,
        dayName,
        totalItems,
        exactItems,
        diffItems,
        eriGlobal,
        eriSeco,
        secoTotal,
        secoExact,
        eriRefrigerado,
        refrigTotal,
        refrigExact,
        eriCongelado,
        congTotal,
        congExact,
        records: activeZoneRecords
      };
    });
  }, [sortedDatesDesc, diffRecords, activeZone]);

  // Global KPIs for the current date range and zone
  const globalKpis = useMemo(() => {
    const totalItems = filteredRecords.length;
    const exactItems = filteredRecords.filter(r => r.diferencia === 0).length;
    const diffItems = totalItems - exactItems;
    const eriGlobal = totalItems > 0 ? (exactItems / totalItems) * 100 : 0;

    // Seco
    const seco = diffRecords.filter(r => r.zona === 'SECO');
    const secoExact = seco.filter(r => r.diferencia === 0).length;
    const eriSeco = seco.length > 0 ? (secoExact / seco.length) * 100 : 0;

    // Refrigerado
    const refrig = diffRecords.filter(r => r.zona === 'REFRIGERADO');
    const refrigExact = refrig.filter(r => r.diferencia === 0).length;
    const eriRefrig = refrig.length > 0 ? (refrigExact / refrig.length) * 100 : 0;

    // Congelado
    const cong = diffRecords.filter(r => r.zona === 'CONGELADO');
    const congExact = cong.filter(r => r.diferencia === 0).length;
    const eriCong = cong.length > 0 ? (congExact / cong.length) * 100 : 0;

    return {
      totalItems,
      exactItems,
      diffItems,
      eriGlobal,
      eriSeco,
      secoCount: seco.length,
      secoExact,
      eriRefrig,
      refrigCount: refrig.length,
      refrigExact,
      eriCong,
      congCount: cong.length,
      congExact
    };
  }, [filteredRecords, diffRecords]);

  // --------------------------------------------------------------------------
  // HIERARCHICAL MATRIX DATA (GLOBAL -> CÁMARA -> CATEGORÍA)
  // --------------------------------------------------------------------------
  interface HierarchyCell {
    total: number;
    exact: number;
    eri: number | null;
  }

  interface CategoryNode {
    categoria: string;
    periodEri: number;
    totalEvaluations: number;
    exactEvaluations: number;
    byDate: Record<string, HierarchyCell>;
    skus: {
      codigo: string;
      nombre: string;
      periodEri: number;
      byDate: Record<string, { diff: number; exact: boolean }>;
    }[];
  }

  interface CameraNode {
    zona: ZoneType;
    label: string;
    icon: any;
    color: string;
    periodEri: number;
    totalEvaluations: number;
    exactEvaluations: number;
    byDate: Record<string, HierarchyCell>;
    categories: CategoryNode[];
  }

  const hierarchyMatrix = useMemo(() => {
    // 1. Global Row
    const globalByDate: Record<string, HierarchyCell> = {};
    let globalTotalEval = 0;
    let globalExactEval = 0;

    sortedDatesAsc.forEach(date => {
      const recs = diffRecords.filter(r => r.fecha === date);
      const exact = recs.filter(r => r.diferencia === 0).length;
      const total = recs.length;
      globalTotalEval += total;
      globalExactEval += exact;
      globalByDate[date] = {
        total,
        exact,
        eri: total > 0 ? (exact / total) * 100 : null
      };
    });

    const globalPeriodEri = globalTotalEval > 0 ? (globalExactEval / globalTotalEval) * 100 : 0;

    // 2. Camera Nodes
    const zonesList: ZoneType[] = ['SECO', 'REFRIGERADO', 'CONGELADO'];
    const cameras: CameraNode[] = zonesList.map(zona => {
      const cameraRecs = diffRecords.filter(r => r.zona === zona);
      const cameraByDate: Record<string, HierarchyCell> = {};
      let camTotal = 0;
      let camExact = 0;

      sortedDatesAsc.forEach(date => {
        const recs = cameraRecs.filter(r => r.fecha === date);
        const exact = recs.filter(r => r.diferencia === 0).length;
        const total = recs.length;
        camTotal += total;
        camExact += exact;
        cameraByDate[date] = {
          total,
          exact,
          eri: total > 0 ? (exact / total) * 100 : null
        };
      });

      const camPeriodEri = camTotal > 0 ? (camExact / camTotal) * 100 : 0;

      // Categories inside this Camera
      const uniqueCats = Array.from(new Set(cameraRecs.map(r => r.categoria || 'SIN CATEGORÍA'))).sort();
      const categories: CategoryNode[] = uniqueCats.map(cat => {
        const catRecs = cameraRecs.filter(r => (r.categoria || 'SIN CATEGORÍA') === cat);
        const catByDate: Record<string, HierarchyCell> = {};
        let catTotal = 0;
        let catExact = 0;

        sortedDatesAsc.forEach(date => {
          const recs = catRecs.filter(r => r.fecha === date);
          const exact = recs.filter(r => r.diferencia === 0).length;
          const total = recs.length;
          catTotal += total;
          catExact += exact;
          catByDate[date] = {
            total,
            exact,
            eri: total > 0 ? (exact / total) * 100 : null
          };
        });

        const catPeriodEri = catTotal > 0 ? (catExact / catTotal) * 100 : 0;

        // SKUs inside this Category
        const uniqueSkus = Array.from(new Set(catRecs.map(r => r.codigo)));
        const skus = uniqueSkus.map(code => {
          const skuRecs = catRecs.filter(r => r.codigo === code);
          const name = skuRecs[0]?.nombre || code;
          const byDate: Record<string, { diff: number; exact: boolean }> = {};
          let skuTotal = 0;
          let skuExact = 0;

          skuRecs.forEach(r => {
            const isEx = r.diferencia === 0;
            byDate[r.fecha] = { diff: r.diferencia, exact: isEx };
            skuTotal++;
            if (isEx) skuExact++;
          });

          return {
            codigo: code,
            nombre: name,
            periodEri: skuTotal > 0 ? (skuExact / skuTotal) * 100 : 0,
            byDate
          };
        }).sort((a, b) => a.periodEri - b.periodEri || a.codigo.localeCompare(b.codigo));

        return {
          categoria: cat,
          periodEri: catPeriodEri,
          totalEvaluations: catTotal,
          exactEvaluations: catExact,
          byDate: catByDate,
          skus
        };
      });

      const icon = zona === 'SECO' ? Sun : Snowflake;
      const color = zona === 'SECO' ? 'text-amber-700' : zona === 'REFRIGERADO' ? 'text-emerald-700' : 'text-blue-700';

      return {
        zona,
        label: zona,
        icon,
        color,
        periodEri: camPeriodEri,
        totalEvaluations: camTotal,
        exactEvaluations: camExact,
        byDate: cameraByDate,
        categories
      };
    });

    return {
      global: {
        periodEri: globalPeriodEri,
        totalEvaluations: globalTotalEval,
        exactEvaluations: globalExactEval,
        byDate: globalByDate
      },
      cameras
    };
  }, [diffRecords, sortedDatesAsc]);

  // Product Matrix Data: horizontal view by SKU
  const productMatrix = useMemo(() => {
    const grouped = new Map<string, {
      codigo: string;
      nombre: string;
      zona: ZoneType;
      categoria: string;
      byDate: Record<string, { diff: number; exact: boolean }>;
      totalDays: number;
      exactDays: number;
      eriProduct: number;
    }>();

    filteredRecords.forEach(rec => {
      const code = (rec.codigo || '').trim();
      if (!code) return;

      if (!grouped.has(code)) {
        grouped.set(code, {
          codigo: code,
          nombre: rec.nombre || 'Desconocido',
          zona: rec.zona,
          categoria: rec.categoria,
          byDate: {},
          totalDays: 0,
          exactDays: 0,
          eriProduct: 0
        });
      }

      const p = grouped.get(code)!;
      const isExact = rec.diferencia === 0;
      p.byDate[rec.fecha] = {
        diff: rec.diferencia,
        exact: isExact
      };
    });

    grouped.forEach(p => {
      const daysCount = Object.keys(p.byDate).length;
      const exacts = Object.values(p.byDate).filter(v => v.exact).length;
      p.totalDays = daysCount;
      p.exactDays = exacts;
      p.eriProduct = daysCount > 0 ? (exacts / daysCount) * 100 : 0;
    });

    let list = Array.from(grouped.values());

    if (debouncedSearch) {
      list = list.filter(p => 
        p.codigo.toLowerCase().includes(debouncedSearch) ||
        p.nombre.toLowerCase().includes(debouncedSearch) ||
        p.categoria.toLowerCase().includes(debouncedSearch)
      );
    }

    return list.sort((a, b) => a.eriProduct - b.eriProduct || a.codigo.localeCompare(b.codigo));
  }, [filteredRecords, debouncedSearch]);

  const paginatedMatrix = useMemo(() => {
    const start = (matrixPage - 1) * pageSize;
    return productMatrix.slice(start, start + pageSize);
  }, [productMatrix, matrixPage, pageSize]);

  const totalMatrixPages = Math.ceil(productMatrix.length / pageSize) || 1;

  // --------------------------------------------------------------------------
  // TREND CHART DATA (Chronological Order)
  // --------------------------------------------------------------------------
  const trendChartData = useMemo(() => {
    return sortedDatesAsc.map(fecha => {
      const { displayDate, dayName } = formatFriendlyDate(fecha);
      const recs = diffRecords.filter(r => r.fecha === fecha);

      const total = recs.length;
      const exact = recs.filter(r => r.diferencia === 0).length;
      const eriGlobal = total > 0 ? Number(((exact / total) * 100).toFixed(1)) : null;

      // Seco
      const secoRecs = recs.filter(r => r.zona === 'SECO');
      const eriSeco = secoRecs.length > 0 ? Number(((secoRecs.filter(r => r.diferencia === 0).length / secoRecs.length) * 100).toFixed(1)) : null;

      // Refrigerado
      const refrigRecs = recs.filter(r => r.zona === 'REFRIGERADO');
      const eriRefrig = refrigRecs.length > 0 ? Number(((refrigRecs.filter(r => r.diferencia === 0).length / refrigRecs.length) * 100).toFixed(1)) : null;

      // Congelado
      const congRecs = recs.filter(r => r.zona === 'CONGELADO');
      const eriCong = congRecs.length > 0 ? Number(((congRecs.filter(r => r.diferencia === 0).length / congRecs.length) * 100).toFixed(1)) : null;

      return {
        fecha,
        fechaLabel: `${dayName} ${displayDate}`,
        eriGlobal,
        eriSeco,
        eriRefrigerado: eriRefrig,
        eriCongelado: eriCong,
        totalItems: total,
        exactItems: exact
      };
    });
  }, [sortedDatesAsc, diffRecords]);

  // Quick Date Range Helpers
  const setQuickRange = (days: number) => {
    const today = getPeruToday();
    setEndDate(today);
    setStartDate(addDaysPeru(today, -days + 1));
  };

  const setMonthRange = () => {
    const today = getPeruToday();
    const [y, m] = today.split('-');
    const firstDay = `${y}-${m}-01`;
    setStartDate(firstDay);
    setEndDate(today);
  };

  // ERI Badge Colors
  const getEriBadgeStyle = (eri: number | null) => {
    if (eri === null || isNaN(eri)) {
      return {
        bg: 'bg-slate-50 text-slate-400 border-slate-200',
        text: 'text-slate-400',
        label: 'Sin Datos'
      };
    }
    if (eri >= 95) {
      return {
        bg: 'bg-emerald-50 text-emerald-800 border-emerald-200',
        text: 'text-emerald-700',
        label: 'Excelente (≥95%)'
      };
    }
    if (eri >= 85) {
      return {
        bg: 'bg-amber-50 text-amber-800 border-amber-200',
        text: 'text-amber-700',
        label: 'Aceptable (≥85%)'
      };
    }
    return {
      bg: 'bg-rose-50 text-rose-800 border-rose-200',
      text: 'text-rose-700',
      label: 'Crítico (<85%)'
    };
  };

  // Toggle helpers for hierarchy
  const toggleZone = (zone: string) => {
    setExpandedZones(prev => ({ ...prev, [zone]: !prev[zone] }));
  };

  const toggleCategory = (key: string) => {
    setExpandedCategories(prev => ({ ...prev, [key]: !prev[key] }));
  };

  const expandAllHierarchy = () => {
    const z: Record<string, boolean> = { 'SECO': true, 'REFRIGERADO': true, 'CONGELADO': true };
    const c: Record<string, boolean> = {};
    hierarchyMatrix.cameras.forEach(cam => {
      cam.categories.forEach(cat => {
        c[`${cam.zona}_${cat.categoria}`] = true;
      });
    });
    setExpandedZones(z);
    setExpandedCategories(c);
  };

  const collapseAllHierarchy = () => {
    setExpandedZones({ 'SECO': false, 'REFRIGERADO': false, 'CONGELADO': false });
    setExpandedCategories({});
  };

  // --------------------------------------------------------------------------
  // EXCEL EXPORT (DESAGREGADO POR CÁMARA Y CATEGORÍA)
  // --------------------------------------------------------------------------
  const handleExportExcel = () => {
    if (sortedDatesAsc.length === 0) {
      alert("No hay registros en el rango de fechas seleccionado.");
      return;
    }

    const wb = XLSX.utils.book_new();

    // Sheet 1: MATRIZ ERI DESAGREGADA (Cámaras y Categorías)
    const matrixSheetData: any[] = [];

    // Header row
    const headers = ['Nivel', 'Cámara', 'Categoría', 'ERI Período (%)', 'Total Evaluaciones', 'Total Exactos'];
    sortedDatesAsc.forEach(date => {
      const { displayDate, dayName } = formatFriendlyDate(date);
      headers.push(`${dayName} ${displayDate} (${date})`);
    });

    // 1. Fila ERI General
    const globalRow: any = {
      'Nivel': 'GLOBAL',
      'Cámara': 'TOTAL ALMACÉN',
      'Categoría': 'TODAS',
      'ERI Período (%)': Number(hierarchyMatrix.global.periodEri.toFixed(2)),
      'Total Evaluaciones': hierarchyMatrix.global.totalEvaluations,
      'Total Exactos': hierarchyMatrix.global.exactEvaluations
    };
    sortedDatesAsc.forEach(date => {
      const cell = hierarchyMatrix.global.byDate[date];
      globalRow[`${formatFriendlyDate(date).dayName} ${formatFriendlyDate(date).displayDate} (${date})`] = 
        cell && cell.eri !== null ? `${cell.eri.toFixed(1)}% (${cell.exact}/${cell.total})` : '—';
    });
    matrixSheetData.push(globalRow);

    // 2. Filas por Cámara y Categoría
    hierarchyMatrix.cameras.forEach(cam => {
      const camRow: any = {
        'Nivel': 'CÁMARA',
        'Cámara': cam.zona,
        'Categoría': 'TODAS',
        'ERI Período (%)': Number(cam.periodEri.toFixed(2)),
        'Total Evaluaciones': cam.totalEvaluations,
        'Total Exactos': cam.exactEvaluations
      };
      sortedDatesAsc.forEach(date => {
        const cell = cam.byDate[date];
        camRow[`${formatFriendlyDate(date).dayName} ${formatFriendlyDate(date).displayDate} (${date})`] = 
          cell && cell.eri !== null ? `${cell.eri.toFixed(1)}% (${cell.exact}/${cell.total})` : '—';
      });
      matrixSheetData.push(camRow);

      // Categorías dentro de la cámara
      cam.categories.forEach(cat => {
        const catRow: any = {
          'Nivel': 'CATEGORÍA',
          'Cámara': cam.zona,
          'Categoría': cat.categoria,
          'ERI Período (%)': Number(cat.periodEri.toFixed(2)),
          'Total Evaluaciones': cat.totalEvaluations,
          'Total Exactos': cat.exactEvaluations
        };
        sortedDatesAsc.forEach(date => {
          const cell = cat.byDate[date];
          catRow[`${formatFriendlyDate(date).dayName} ${formatFriendlyDate(date).displayDate} (${date})`] = 
            cell && cell.eri !== null ? `${cell.eri.toFixed(1)}% (${cell.exact}/${cell.total})` : '—';
        });
        matrixSheetData.push(catRow);
      });
    });

    const wsHierarchy = XLSX.utils.json_to_sheet(matrixSheetData);
    XLSX.utils.book_append_sheet(wb, wsHierarchy, "Matriz ERI Desagregada");

    // Sheet 2: RESUMEN POR CÁMARA Y CATEGORÍA (Formato Consolidado)
    const categorySummaryData: any[] = [];
    hierarchyMatrix.cameras.forEach(cam => {
      cam.categories.forEach(cat => {
        categorySummaryData.push({
          'Cámara': cam.zona,
          'Categoría': cat.categoria,
          'ERI (%)': Number(cat.periodEri.toFixed(2)),
          'Total Evaluaciones': cat.totalEvaluations,
          'Exactos (Sin Dif)': cat.exactEvaluations,
          'Discrepancias': cat.totalEvaluations - cat.exactEvaluations,
          'Total SKUs': cat.skus.length
        });
      });
    });
    const wsSummary = XLSX.utils.json_to_sheet(categorySummaryData);
    XLSX.utils.book_append_sheet(wb, wsSummary, "Resumen Cámara y Categoría");

    // Sheet 3: HISTORIAL POR DÍA
    const dailyData = daySummaries.map(d => ({
      'Fecha': d.fecha,
      'Día': d.dayName,
      'ERI Global (%)': Number(d.eriGlobal.toFixed(2)),
      'Ítems Auditados': d.totalItems,
      'Ítems Exactos': d.exactItems,
      'Ítems con Diferencia': d.diffItems,
      'ERI Seco (%)': Number(d.eriSeco.toFixed(2)),
      'ERI Refrigerado (%)': Number(d.eriRefrigerado.toFixed(2)),
      'ERI Congelado (%)': Number(d.eriCongelado.toFixed(2))
    }));
    const wsDaily = XLSX.utils.json_to_sheet(dailyData);
    XLSX.utils.book_append_sheet(wb, wsDaily, "Historial por Fecha");

    // Sheet 4: DETALLE DE AUDITORÍA (SKUs)
    const detailData = filteredRecords.map(r => ({
      'Fecha': r.fecha,
      'Código': r.codigo,
      'Producto': r.nombre,
      'Cámara': r.zona,
      'Categoría': r.categoria,
      'Stock Sistema': Number(r.stock_sistema || 0),
      'Conteo Físico': Number(r.conteo_fisico || 0),
      'Diferencia': Number(r.diferencia || 0),
      'Estado ERI': r.diferencia === 0 ? 'EXACTO' : 'DESVIACIÓN',
      'Responsable': r.procesado_por || 'N/A'
    }));
    const wsDetail = XLSX.utils.json_to_sheet(detailData);
    XLSX.utils.book_append_sheet(wb, wsDetail, "Detalle Auditoría SKUs");

    XLSX.writeFile(wb, `Reporte_ERI_Desagregado_${startDate}_al_${endDate}.xlsx`);
  };

  return (
    <div 
      ref={containerRef}
      id="eri-history-root"
      className={`flex flex-col bg-slate-50 min-h-screen text-slate-800 ${
        isFullscreen ? 'fixed inset-0 z-[9999] h-screen w-screen p-4 overflow-auto' : 'h-full w-full'
      }`}
    >
      {/* Top Header */}
      <header className="bg-white border-b border-slate-200 px-4 sm:px-6 py-4 flex flex-col md:flex-row md:items-center justify-between gap-4 shadow-sm flex-shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-2xl bg-emerald-50 border border-emerald-200 flex items-center justify-center text-emerald-600 shadow-sm flex-shrink-0">
            <CheckCircle className="w-6 h-6" />
          </div>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-xl sm:text-2xl font-black text-slate-800 tracking-tight">
                HISTORIAL DE ERI
              </h1>
              <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-black bg-emerald-100 text-emerald-800 border border-emerald-200">
                Exactitud de Inventario (IRA)
              </span>
              {currentUser?.sede_nombre && (
                <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold bg-slate-100 text-slate-600 border border-slate-200">
                  {currentUser.sede_nombre}
                </span>
              )}
            </div>
            <p className="text-xs sm:text-sm font-medium text-slate-500">
              Evaluación histórica diaria de concordancia entre stock del sistema y conteo físico por cámara y categoría.
            </p>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center gap-2 flex-wrap">
          {/* Trend Chart Modal Trigger */}
          <button
            onClick={() => setShowTrendModal(true)}
            className="flex items-center gap-1.5 px-3 py-2 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 rounded-xl font-black text-xs transition-all shadow-xs cursor-pointer"
            title="Ver Gráfico de Tendencia Histórica del ERI"
          >
            <TrendingUp className="w-4 h-4 text-indigo-600" />
            <span className="hidden sm:inline">Tendencia ERI</span>
          </button>

          {/* Export to Excel */}
          <button
            onClick={handleExportExcel}
            disabled={isLoading || sortedDatesAsc.length === 0}
            className="flex items-center gap-1.5 px-3.5 py-2 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white rounded-xl font-black text-xs transition-all shadow-sm cursor-pointer"
            title="Descargar reporte detallado en Excel desagregado por cámaras y categoría"
          >
            <Download className="w-4 h-4" />
            Exportar Excel
          </button>

          {/* Refresh */}
          <button
            onClick={() => loadEriHistory(startDate, endDate)}
            disabled={isLoading}
            className="p-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl transition-all border border-slate-200 cursor-pointer"
            title="Actualizar datos"
          >
            <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin text-emerald-600' : ''}`} />
          </button>

          {/* Fullscreen */}
          <button
            onClick={() => setIsFullscreen(!isFullscreen)}
            className="p-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl transition-all border border-slate-200 cursor-pointer"
            title={isFullscreen ? "Salir de pantalla completa" : "Pantalla completa"}
          >
            {isFullscreen ? <Minimize className="w-4 h-4" /> : <Maximize className="w-4 h-4" />}
          </button>
        </div>
      </header>

      {/* Control Bar: Date Range + Camera Filters */}
      <div className="bg-white border-b border-slate-200 px-4 sm:px-6 py-3 flex flex-col gap-3 shadow-xs">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
          
          {/* Date Range Selectors */}
          <div className="flex items-center gap-2 flex-wrap">
            <div className="flex items-center gap-1 bg-slate-50 border border-slate-200 rounded-xl px-2.5 py-1.5 shadow-xs">
              <Calendar className="w-4 h-4 text-slate-400 shrink-0" />
              <div className="flex items-center gap-1 text-xs">
                <span className="font-black text-[10px] uppercase text-slate-400">Desde:</span>
                <input 
                  type="date" 
                  value={startDate}
                  onChange={e => setStartDate(e.target.value)}
                  className="bg-transparent font-black text-slate-700 outline-none text-xs cursor-pointer"
                />
              </div>
              <span className="text-slate-300 font-bold px-1">—</span>
              <div className="flex items-center gap-1 text-xs">
                <span className="font-black text-[10px] uppercase text-slate-400">Hasta:</span>
                <input 
                  type="date" 
                  value={endDate}
                  onChange={e => setEndDate(e.target.value)}
                  className="bg-transparent font-black text-slate-700 outline-none text-xs cursor-pointer"
                />
              </div>
            </div>

            {/* Quick date pills */}
            <div className="flex items-center gap-1 flex-wrap">
              <button
                onClick={() => setQuickRange(1)}
                className={`px-2.5 py-1.5 rounded-lg text-xs font-black transition-all ${
                  startDate === getPeruToday() && endDate === getPeruToday()
                    ? 'bg-emerald-600 text-white shadow-xs'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                Hoy
              </button>
              <button
                onClick={() => setQuickRange(7)}
                className="px-2.5 py-1.5 rounded-lg text-xs font-black bg-slate-100 text-slate-600 hover:bg-slate-200 transition-all"
              >
                7 Días
              </button>
              <button
                onClick={() => setQuickRange(15)}
                className="px-2.5 py-1.5 rounded-lg text-xs font-black bg-slate-100 text-slate-600 hover:bg-slate-200 transition-all"
              >
                15 Días
              </button>
              <button
                onClick={() => setQuickRange(30)}
                className="px-2.5 py-1.5 rounded-lg text-xs font-black bg-slate-100 text-slate-600 hover:bg-slate-200 transition-all"
              >
                30 Días
              </button>
              <button
                onClick={setMonthRange}
                className="px-2.5 py-1.5 rounded-lg text-xs font-black bg-slate-100 text-slate-600 hover:bg-slate-200 transition-all"
              >
                Este Mes
              </button>
            </div>
          </div>

          {/* Camera / Zone Filters */}
          <div className="flex items-center bg-slate-100 p-1 rounded-xl border border-slate-200 gap-1 self-start lg:self-auto overflow-x-auto max-w-full">
            <button
              onClick={() => setActiveZone('ALL')}
              className={`px-3 py-1.5 rounded-lg text-xs font-black uppercase transition-all whitespace-nowrap ${
                activeZone === 'ALL'
                  ? 'bg-white text-slate-900 shadow-xs border border-slate-200/60'
                  : 'text-slate-500 hover:text-slate-900'
              }`}
            >
              Todas las Cámaras
            </button>
            <button
              onClick={() => setActiveZone('SECO')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-black uppercase transition-all whitespace-nowrap ${
                activeZone === 'SECO'
                  ? 'bg-white text-amber-700 shadow-xs border border-slate-200/60'
                  : 'text-slate-500 hover:text-slate-900'
              }`}
            >
              <Sun className="w-3.5 h-3.5 text-amber-500" />
              Seco
            </button>
            <button
              onClick={() => setActiveZone('REFRIGERADO')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-black uppercase transition-all whitespace-nowrap ${
                activeZone === 'REFRIGERADO'
                  ? 'bg-white text-emerald-700 shadow-xs border border-slate-200/60'
                  : 'text-slate-500 hover:text-slate-900'
              }`}
            >
              <Snowflake className="w-3.5 h-3.5 text-emerald-500" />
              Refrigerado
            </button>
            <button
              onClick={() => setActiveZone('CONGELADO')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-black uppercase transition-all whitespace-nowrap ${
                activeZone === 'CONGELADO'
                  ? 'bg-white text-blue-700 shadow-xs border border-slate-200/60'
                  : 'text-slate-500 hover:text-slate-900'
              }`}
            >
              <Snowflake className="w-3.5 h-3.5 text-blue-500" />
              Congelado
            </button>
          </div>

        </div>
      </div>

      {/* KPI Cards: General ERI and by Zone */}
      <div className="p-4 sm:p-6 grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-3">
        {/* Global ERI */}
        <div className="col-span-2 sm:col-span-2 lg:col-span-2 bg-white p-4 rounded-2xl border border-slate-200 shadow-xs flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-black text-slate-400 uppercase tracking-wider">ERI General del Período</span>
            <span className={`px-2 py-0.5 rounded-md text-[10px] font-black border ${getEriBadgeStyle(globalKpis.eriGlobal).bg}`}>
              {getEriBadgeStyle(globalKpis.eriGlobal).label}
            </span>
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-3xl font-black text-slate-900">
              {globalKpis.eriGlobal.toFixed(1)}%
            </span>
            <span className="text-xs font-bold text-slate-400">
              ({globalKpis.exactItems.toLocaleString()} de {globalKpis.totalItems.toLocaleString()} exactos)
            </span>
          </div>
          <div className="mt-3 w-full bg-slate-100 rounded-full h-2 overflow-hidden">
            <div 
              className={`h-full transition-all duration-500 ${
                globalKpis.eriGlobal >= 95 ? 'bg-emerald-500' : globalKpis.eriGlobal >= 85 ? 'bg-amber-500' : 'bg-rose-500'
              }`}
              style={{ width: `${Math.min(100, Math.max(0, globalKpis.eriGlobal))}%` }}
            />
          </div>
        </div>

        {/* ERI Seco */}
        <div className="bg-white p-3.5 rounded-2xl border border-slate-200 shadow-xs flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-[9px] font-black text-amber-700 uppercase tracking-tight flex items-center gap-1">
              <Sun className="w-3 h-3 text-amber-500" />
              ERI Seco
            </span>
            <span className="text-[9px] font-extrabold text-slate-400">{globalKpis.secoCount} ítems</span>
          </div>
          <div className="text-xl font-black text-slate-800 mt-1">
            {globalKpis.eriSeco.toFixed(1)}%
          </div>
          <div className="text-[10px] font-bold text-slate-400 mt-0.5">
            {globalKpis.secoExact} exactos
          </div>
        </div>

        {/* ERI Refrigerado */}
        <div className="bg-white p-3.5 rounded-2xl border border-slate-200 shadow-xs flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-[9px] font-black text-emerald-700 uppercase tracking-tight flex items-center gap-1">
              <Snowflake className="w-3 h-3 text-emerald-500" />
              ERI Refrig.
            </span>
            <span className="text-[9px] font-extrabold text-slate-400">{globalKpis.refrigCount} ítems</span>
          </div>
          <div className="text-xl font-black text-slate-800 mt-1">
            {globalKpis.eriRefrig.toFixed(1)}%
          </div>
          <div className="text-[10px] font-bold text-slate-400 mt-0.5">
            {globalKpis.refrigExact} exactos
          </div>
        </div>

        {/* ERI Congelado */}
        <div className="bg-white p-3.5 rounded-2xl border border-slate-200 shadow-xs flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-[9px] font-black text-blue-700 uppercase tracking-tight flex items-center gap-1">
              <Snowflake className="w-3 h-3 text-blue-500" />
              ERI Cong.
            </span>
            <span className="text-[9px] font-extrabold text-slate-400">{globalKpis.congCount} ítems</span>
          </div>
          <div className="text-xl font-black text-slate-800 mt-1">
            {globalKpis.eriCong.toFixed(1)}%
          </div>
          <div className="text-[10px] font-bold text-slate-400 mt-0.5">
            {globalKpis.congExact} exactos
          </div>
        </div>

        {/* Items Sin Diferencia */}
        <div className="bg-white p-3.5 rounded-2xl border border-slate-200 shadow-xs flex flex-col justify-between">
          <span className="text-[9px] font-black text-slate-400 uppercase tracking-wider">Sin Diferencia</span>
          <div className="text-xl font-black text-emerald-600 mt-1">
            {globalKpis.exactItems.toLocaleString()}
          </div>
          <div className="text-[10px] font-bold text-emerald-700 mt-0.5">
            100% Cuadrados
          </div>
        </div>

        {/* Items Con Diferencia */}
        <div className="bg-white p-3.5 rounded-2xl border border-slate-200 shadow-xs flex flex-col justify-between">
          <span className="text-[9px] font-black text-slate-400 uppercase tracking-wider">Con Diferencia</span>
          <div className="text-xl font-black text-rose-600 mt-1">
            {globalKpis.diffItems.toLocaleString()}
          </div>
          <div className="text-[10px] font-bold text-rose-700 mt-0.5">
            Desviaciones
          </div>
        </div>
      </div>

      {/* Main View Tabs + Actions */}
      <div className="px-4 sm:px-6 flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
        {/* Navigation Tabs */}
        <div className="flex items-center bg-slate-200/80 p-1 rounded-xl border border-slate-200 max-w-max overflow-x-auto">
          <button
            onClick={() => setActiveTab('HIERARCHY')}
            className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-black uppercase transition-all whitespace-nowrap ${
              activeTab === 'HIERARCHY'
                ? 'bg-white text-slate-900 shadow-sm'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <Layers className="w-3.5 h-3.5 text-indigo-600" />
            Matriz Desagregada (Cámara y Categoría)
          </button>
          <button
            onClick={() => setActiveTab('DAILY')}
            className={`px-4 py-2 rounded-lg text-xs font-black uppercase transition-all whitespace-nowrap ${
              activeTab === 'DAILY'
                ? 'bg-white text-slate-900 shadow-sm'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            📅 Resumen Diario
          </button>
          <button
            onClick={() => setActiveTab('PRODUCT_MATRIX')}
            className={`px-4 py-2 rounded-lg text-xs font-black uppercase transition-all whitespace-nowrap ${
              activeTab === 'PRODUCT_MATRIX'
                ? 'bg-white text-slate-900 shadow-sm'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            📦 Matriz por Producto
          </button>
        </div>

        {/* Actions for Hierarchy or Matrix */}
        {activeTab === 'HIERARCHY' && (
          <div className="flex items-center gap-2">
            <button
              onClick={expandAllHierarchy}
              className="px-2.5 py-1.5 rounded-lg text-xs font-bold bg-white border border-slate-200 text-slate-700 hover:bg-slate-50 transition-all cursor-pointer shadow-xs"
            >
              + Expandir Todo
            </button>
            <button
              onClick={collapseAllHierarchy}
              className="px-2.5 py-1.5 rounded-lg text-xs font-bold bg-white border border-slate-200 text-slate-700 hover:bg-slate-50 transition-all cursor-pointer shadow-xs"
            >
              − Colapsar Todo
            </button>
          </div>
        )}

        {/* Search for Product Matrix */}
        {activeTab === 'PRODUCT_MATRIX' && (
          <div className="relative w-full sm:w-72">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input 
              type="text" 
              placeholder="Buscar código, nombre o categoría..." 
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              className="w-full pl-9 pr-4 py-2 bg-white border border-slate-200 rounded-xl text-xs font-medium text-slate-800 placeholder-slate-400 outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent shadow-xs"
            />
            {searchTerm && (
              <button 
                onClick={() => setSearchTerm('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        )}
      </div>

      {/* Content Area */}
      <div className="flex-1 px-4 sm:px-6 pb-8 overflow-auto">
        {isLoading ? (
          <div className="bg-white rounded-2xl border border-slate-200 p-16 text-center shadow-sm">
            <RefreshCw className="w-10 h-10 text-emerald-600 animate-spin mx-auto mb-3" />
            <h3 className="text-base font-black text-slate-800">Cargando Historial de ERI...</h3>
            <p className="text-xs font-medium text-slate-400 mt-1">Consultando registros auditados y diferencias en la zona horaria local.</p>
          </div>
        ) : sortedDatesAsc.length === 0 ? (
          <div className="bg-white rounded-2xl border border-slate-200 p-16 text-center shadow-sm">
            <Calendar className="w-12 h-12 text-slate-300 mx-auto mb-3" />
            <h3 className="text-base font-black text-slate-700">No hay registros de ERI en el rango seleccionado</h3>
            <p className="text-xs font-medium text-slate-400 mt-1 max-w-md mx-auto">
              No se encontraron conciliaciones procesadas entre el {startDate} y el {endDate}. 
              Cargue el stock del sistema en Inventario o procese la conciliación para generar datos de ERI.
            </p>
          </div>
        ) : activeTab === 'HIERARCHY' ? (
          /* TAB 1: MATRIZ DESAGREGADA (CÁMARA Y CATEGORÍA CON FECHAS EN COLUMNAS) */
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden flex flex-col">
            <div className="p-4 border-b border-slate-100 flex items-center justify-between flex-wrap gap-2 bg-slate-50/50">
              <div>
                <h3 className="text-sm font-black uppercase text-slate-800 tracking-tight flex items-center gap-2">
                  <Layers className="w-4 h-4 text-indigo-600" />
                  Matriz Jerárquica de ERI por Columnas de Fecha
                </h3>
                <p className="text-xs text-slate-500 font-medium">
                  Cada columna representa el ERI general y desagregado por Cámara y Categoría (ej: LECHES, MANJARES, etc.)
                </p>
              </div>

              <div className="flex items-center gap-3 text-xs font-bold text-slate-500">
                <span className="flex items-center gap-1">
                  <span className="w-2.5 h-2.5 rounded-md bg-emerald-100 border border-emerald-300"></span> ≥95% (Excelente)
                </span>
                <span className="flex items-center gap-1">
                  <span className="w-2.5 h-2.5 rounded-md bg-amber-100 border border-amber-300"></span> ≥85% (Aceptable)
                </span>
                <span className="flex items-center gap-1">
                  <span className="w-2.5 h-2.5 rounded-md bg-rose-100 border border-rose-300"></span> &lt;85% (Crítico)
                </span>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-slate-100/90 border-b border-slate-200 text-[10px] font-black uppercase text-slate-500 tracking-wider">
                    <th className="py-3 px-4 sticky left-0 bg-slate-100 z-20 min-w-64 border-r border-slate-200 shadow-xs">
                      Cámara / Categoría
                    </th>
                    <th className="py-3 px-3 text-center min-w-28 bg-slate-100 border-r border-slate-200">
                      ERI Período
                    </th>
                    {sortedDatesAsc.map(date => {
                      const { displayDate, dayName } = formatFriendlyDate(date);
                      return (
                        <th key={date} className="py-3 px-3 text-center min-w-28 border-r border-slate-200/60 whitespace-nowrap bg-slate-100/60">
                          <div className="text-[9px] text-slate-400 font-bold">{dayName}</div>
                          <div className="text-[11px] text-slate-800 font-black">{displayDate}</div>
                          <div className="text-[8px] text-slate-400 font-mono font-normal">{date}</div>
                        </th>
                      );
                    })}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-xs">
                  {/* NIVEL 1: ERI GENERAL (FILA PRINCIPAL SUPERIOR) */}
                  <tr className="bg-indigo-50/70 font-black border-b-2 border-indigo-200 hover:bg-indigo-50 transition-colors">
                    <td className="py-3 px-4 sticky left-0 bg-indigo-50/95 z-10 border-r border-indigo-200">
                      <div className="flex items-center gap-2">
                        <span className="w-6 h-6 rounded-lg bg-indigo-600 text-white flex items-center justify-center text-xs">
                          ★
                        </span>
                        <div>
                          <span className="text-indigo-950 font-black tracking-wide text-xs">ERI GENERAL ALMACÉN</span>
                          <div className="text-[10px] font-bold text-indigo-600/80">Todas las Cámaras Consolidadas</div>
                        </div>
                      </div>
                    </td>

                    {/* ERI Global Período */}
                    <td className="py-3 px-3 text-center border-r border-indigo-200">
                      <span className={`px-2.5 py-1 rounded-xl text-xs font-black border ${getEriBadgeStyle(hierarchyMatrix.global.periodEri).bg}`}>
                        {hierarchyMatrix.global.periodEri.toFixed(1)}%
                      </span>
                      <div className="text-[9px] text-slate-400 font-bold mt-0.5">
                        ({hierarchyMatrix.global.exactEvaluations}/{hierarchyMatrix.global.totalEvaluations})
                      </div>
                    </td>

                    {/* ERI Global por Fecha */}
                    {sortedDatesAsc.map(date => {
                      const cell = hierarchyMatrix.global.byDate[date];
                      if (!cell || cell.eri === null) {
                        return (
                          <td key={date} className="py-3 px-3 text-center border-r border-indigo-100 text-slate-300 font-bold">
                            —
                          </td>
                        );
                      }
                      const badge = getEriBadgeStyle(cell.eri);
                      return (
                        <td key={date} className="py-3 px-3 text-center border-r border-indigo-100">
                          <span className={`px-2.5 py-1 rounded-xl text-xs font-black border ${badge.bg}`}>
                            {cell.eri.toFixed(1)}%
                          </span>
                          <div className="text-[9px] text-slate-500 font-bold mt-0.5">
                            ({cell.exact}/{cell.total})
                          </div>
                        </td>
                      );
                    })}
                  </tr>

                  {/* NIVEL 2 Y 3: CÁMARAS Y CATEGORÍAS */}
                  {hierarchyMatrix.cameras.map(cam => {
                    const isCamExpanded = !!expandedZones[cam.zona];
                    const CamIcon = cam.icon;

                    return (
                      <React.Fragment key={cam.zona}>
                        {/* Fila de Cámara */}
                        <tr 
                          onClick={() => toggleZone(cam.zona)}
                          className="bg-slate-50/80 hover:bg-slate-100/80 font-black cursor-pointer transition-colors border-t border-slate-200"
                        >
                          <td className="py-3 px-4 sticky left-0 bg-slate-50 z-10 border-r border-slate-200">
                            <div className="flex items-center justify-between">
                              <div className="flex items-center gap-2">
                                <span className="text-slate-400">
                                  {isCamExpanded ? <ChevronDown className="w-4 h-4 text-slate-600" /> : <ChevronRight className="w-4 h-4 text-slate-600" />}
                                </span>
                                <CamIcon className={`w-4 h-4 ${cam.color}`} />
                                <span className={`uppercase font-black text-xs ${cam.color}`}>
                                  CÁMARA {cam.zona}
                                </span>
                                <span className="text-[10px] font-bold px-1.5 py-0.2 rounded-md bg-white border border-slate-200 text-slate-500">
                                  {cam.categories.length} cat.
                                </span>
                              </div>
                            </div>
                          </td>

                          {/* Period ERI */}
                          <td className="py-3 px-3 text-center border-r border-slate-200">
                            <span className={`px-2 py-0.5 rounded-lg text-xs font-black border ${getEriBadgeStyle(cam.periodEri).bg}`}>
                              {cam.periodEri.toFixed(1)}%
                            </span>
                            <div className="text-[9px] text-slate-400 font-bold mt-0.5">
                              ({cam.exactEvaluations}/{cam.totalEvaluations})
                            </div>
                          </td>

                          {/* Daily cells */}
                          {sortedDatesAsc.map(date => {
                            const cell = cam.byDate[date];
                            if (!cell || cell.eri === null) {
                              return (
                                <td key={date} className="py-3 px-3 text-center border-r border-slate-100 text-slate-300 font-bold">
                                  —
                                </td>
                              );
                            }
                            const badge = getEriBadgeStyle(cell.eri);
                            return (
                              <td key={date} className="py-3 px-3 text-center border-r border-slate-100">
                                <span className={`px-2 py-0.5 rounded-lg text-[11px] font-black border ${badge.bg}`}>
                                  {cell.eri.toFixed(1)}%
                                </span>
                                <div className="text-[9px] text-slate-400 font-bold mt-0.5">
                                  ({cell.exact}/{cell.total})
                                </div>
                              </td>
                            );
                          })}
                        </tr>

                        {/* NIVEL 3: CATEGORÍAS (Desplegadas al abrir la cámara) */}
                        {isCamExpanded && cam.categories.map(cat => {
                          const catKey = `${cam.zona}_${cat.categoria}`;
                          const isCatExpanded = !!expandedCategories[catKey];

                          return (
                            <React.Fragment key={catKey}>
                              <tr className="hover:bg-slate-50 transition-colors bg-white">
                                <td className="py-2.5 px-4 sticky left-0 bg-white group-hover:bg-slate-50 z-10 border-r border-slate-200 pl-8">
                                  <div className="flex items-center gap-2">
                                    <button
                                      onClick={() => toggleCategory(catKey)}
                                      className="p-1 hover:bg-slate-100 rounded text-slate-400 hover:text-slate-600 transition-colors cursor-pointer"
                                      title={isCatExpanded ? "Ocultar SKUs" : "Ver SKUs de esta categoría"}
                                    >
                                      {isCatExpanded ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
                                    </button>
                                    <span className="font-bold text-slate-700 text-xs tracking-tight">
                                      {cat.categoria}
                                    </span>
                                    <span className="text-[9px] font-bold text-slate-400">
                                      ({cat.skus.length} SKUs)
                                    </span>
                                  </div>
                                </td>

                                {/* Period ERI */}
                                <td className="py-2.5 px-3 text-center border-r border-slate-200">
                                  <span className={`px-1.5 py-0.5 rounded text-[11px] font-black ${
                                    cat.periodEri >= 95 ? 'text-emerald-700 bg-emerald-50' : cat.periodEri >= 85 ? 'text-amber-700 bg-amber-50' : 'text-rose-700 bg-rose-50'
                                  }`}>
                                    {cat.periodEri.toFixed(1)}%
                                  </span>
                                  <div className="text-[9px] text-slate-400 font-bold">
                                    ({cat.exactEvaluations}/{cat.totalEvaluations})
                                  </div>
                                </td>

                                {/* Daily cells for Category */}
                                {sortedDatesAsc.map(date => {
                                  const cell = cat.byDate[date];
                                  if (!cell || cell.eri === null) {
                                    return (
                                      <td key={date} className="py-2.5 px-3 text-center border-r border-slate-100 text-slate-300 font-bold">
                                        —
                                      </td>
                                    );
                                  }
                                  return (
                                    <td key={date} className="py-2.5 px-3 text-center border-r border-slate-100">
                                      <span className={`px-1.5 py-0.5 rounded text-[11px] font-black ${
                                        cell.eri >= 95 ? 'text-emerald-700 bg-emerald-50' : cell.eri >= 85 ? 'text-amber-700 bg-amber-50' : 'text-rose-700 bg-rose-50'
                                      }`}>
                                        {cell.eri.toFixed(1)}%
                                      </span>
                                      <div className="text-[9px] text-slate-400 font-bold">
                                        ({cell.exact}/{cell.total})
                                      </div>
                                    </td>
                                  );
                                })}
                              </tr>

                              {/* NIVEL 4: SKUs DE ESTA CATEGORÍA (Opcional al expandir categoría) */}
                              {isCatExpanded && cat.skus.map(sku => (
                                <tr key={sku.codigo} className="bg-slate-50/40 hover:bg-slate-100/50 text-[11px] transition-colors">
                                  <td className="py-2 px-4 sticky left-0 bg-slate-50/90 z-10 border-r border-slate-200 pl-14">
                                    <div className="flex items-center gap-1.5 truncate max-w-xs">
                                      <span className="font-mono font-black text-slate-700">{sku.codigo}</span>
                                      <span className="text-slate-500 truncate" title={sku.nombre}>{sku.nombre}</span>
                                    </div>
                                  </td>

                                  <td className="py-2 px-3 text-center border-r border-slate-200 font-black text-slate-700">
                                    {sku.periodEri.toFixed(0)}%
                                  </td>

                                  {sortedDatesAsc.map(date => {
                                    const entry = sku.byDate[date];
                                    if (!entry) {
                                      return (
                                        <td key={date} className="py-2 px-3 text-center border-r border-slate-100 text-slate-300 font-bold">
                                          —
                                        </td>
                                      );
                                    }
                                    if (entry.exact) {
                                      return (
                                        <td key={date} className="py-2 px-3 text-center border-r border-slate-100">
                                          <span className="inline-block px-1.5 py-0.2 rounded bg-emerald-100 text-emerald-800 text-[10px] font-black" title="Exacto (Dif: 0)">
                                            ✓ 0
                                          </span>
                                        </td>
                                      );
                                    }
                                    return (
                                      <td key={date} className="py-2 px-3 text-center border-r border-slate-100">
                                        <span className={`inline-block px-1.5 py-0.2 rounded text-[10px] font-black ${
                                          entry.diff > 0 ? 'bg-blue-100 text-blue-800' : 'bg-rose-100 text-rose-800'
                                        }`} title={`Diferencia: ${entry.diff > 0 ? `+${entry.diff}` : entry.diff}`}>
                                          {entry.diff > 0 ? `+${entry.diff}` : entry.diff}
                                        </span>
                                      </td>
                                    );
                                  })}
                                </tr>
                              ))}
                            </React.Fragment>
                          );
                        })}
                      </React.Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        ) : activeTab === 'DAILY' ? (
          /* TAB 2: RESUMEN DIARIO POR FECHA */
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="p-4 border-b border-slate-100 flex items-center justify-between flex-wrap gap-2">
              <div>
                <h3 className="text-sm font-black uppercase text-slate-800 tracking-tight">
                  Evolución Diaria de Exactitud de Inventario (ERI)
                </h3>
                <p className="text-xs text-slate-400 font-medium">
                  Resultados consolidados día por día ({daySummaries.length} días evaluados)
                </p>
              </div>
              <span className="text-xs font-bold text-slate-500 bg-slate-50 px-3 py-1 rounded-xl border border-slate-200">
                Filtro: {activeZone === 'ALL' ? 'Todas las Cámaras' : activeZone}
              </span>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200 text-[10px] font-black uppercase text-slate-400 tracking-wider">
                    <th className="py-3.5 px-4">Fecha</th>
                    <th className="py-3.5 px-4 text-center">ERI Global</th>
                    <th className="py-3.5 px-4 text-center">ERI Seco</th>
                    <th className="py-3.5 px-4 text-center">ERI Refrigerado</th>
                    <th className="py-3.5 px-4 text-center">ERI Congelado</th>
                    <th className="py-3.5 px-4 text-center">Ítems Auditados</th>
                    <th className="py-3.5 px-4 text-center">Exactos</th>
                    <th className="py-3.5 px-4 text-center">Con Dif.</th>
                    <th className="py-3.5 px-4 text-right">Acción</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-xs font-medium">
                  {daySummaries.map(day => {
                    const badge = getEriBadgeStyle(day.eriGlobal);
                    return (
                      <tr key={day.fecha} className="hover:bg-slate-50/80 transition-colors">
                        <td className="py-3.5 px-4">
                          <div className="flex items-center gap-2">
                            <span className="w-8 h-8 rounded-xl bg-slate-100 flex items-center justify-center text-[10px] font-black text-slate-600 shrink-0">
                              {day.dayName}
                            </span>
                            <div>
                              <div className="font-black text-slate-800">{day.displayDate}</div>
                              <div className="text-[10px] font-bold text-slate-400 font-mono">{day.fecha}</div>
                            </div>
                          </div>
                        </td>

                        <td className="py-3.5 px-4 text-center">
                          <span className={`px-2.5 py-1 rounded-xl text-xs font-black border ${badge.bg}`}>
                            {day.eriGlobal.toFixed(1)}%
                          </span>
                        </td>

                        <td className="py-3.5 px-4 text-center">
                          {day.secoTotal > 0 ? (
                            <div>
                              <span className="font-black text-slate-800">{day.eriSeco.toFixed(1)}%</span>
                              <div className="text-[10px] text-slate-400 font-bold">({day.secoExact}/{day.secoTotal})</div>
                            </div>
                          ) : (
                            <span className="text-slate-300 font-bold">—</span>
                          )}
                        </td>

                        <td className="py-3.5 px-4 text-center">
                          {day.refrigTotal > 0 ? (
                            <div>
                              <span className="font-black text-slate-800">{day.eriRefrigerado.toFixed(1)}%</span>
                              <div className="text-[10px] text-slate-400 font-bold">({day.refrigExact}/{day.refrigTotal})</div>
                            </div>
                          ) : (
                            <span className="text-slate-300 font-bold">—</span>
                          )}
                        </td>

                        <td className="py-3.5 px-4 text-center">
                          {day.congTotal > 0 ? (
                            <div>
                              <span className="font-black text-slate-800">{day.eriCongelado.toFixed(1)}%</span>
                              <div className="text-[10px] text-slate-400 font-bold">({day.congExact}/{day.congTotal})</div>
                            </div>
                          ) : (
                            <span className="text-slate-300 font-bold">—</span>
                          )}
                        </td>

                        <td className="py-3.5 px-4 text-center font-black text-slate-700">
                          {day.totalItems.toLocaleString()}
                        </td>

                        <td className="py-3.5 px-4 text-center font-black text-emerald-600">
                          {day.exactItems.toLocaleString()}
                        </td>

                        <td className="py-3.5 px-4 text-center">
                          {day.diffItems > 0 ? (
                            <span className="px-2 py-0.5 rounded-md bg-rose-50 text-rose-700 font-black text-[11px] border border-rose-200">
                              {day.diffItems}
                            </span>
                          ) : (
                            <span className="text-emerald-600 font-black">0</span>
                          )}
                        </td>

                        <td className="py-3.5 px-4 text-right">
                          <button
                            onClick={() => setSelectedDayDetail(day)}
                            className="px-3 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-xs font-black transition-all border border-slate-200 cursor-pointer"
                          >
                            Ver Detalle
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        ) : (
          /* TAB 3: MATRIZ POR PRODUCTO */
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden flex flex-col">
            <div className="p-4 border-b border-slate-100 flex items-center justify-between flex-wrap gap-2">
              <div>
                <h3 className="text-sm font-black uppercase text-slate-800 tracking-tight">
                  Matriz de Exactitud por Producto (SKU)
                </h3>
                <p className="text-xs text-slate-400 font-medium">
                  Visualice la concordancia de cada SKU día a día ({productMatrix.length} productos evaluados)
                </p>
              </div>

              <div className="flex items-center gap-3 text-xs font-bold text-slate-500">
                <span className="flex items-center gap-1">
                  <span className="w-2.5 h-2.5 rounded-full bg-emerald-500"></span> Exacto (Dif: 0)
                </span>
                <span className="flex items-center gap-1">
                  <span className="w-2.5 h-2.5 rounded-full bg-rose-500"></span> Desviación
                </span>
                <span className="flex items-center gap-1">
                  <span className="w-2.5 h-2.5 rounded-full bg-slate-300"></span> No Auditado
                </span>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200 text-[10px] font-black uppercase text-slate-400 tracking-wider">
                    <th className="py-3 px-3.5 sticky left-0 bg-slate-50 z-10 w-28">Código</th>
                    <th className="py-3 px-3.5 sticky left-28 bg-slate-50 z-10 min-w-48">Producto</th>
                    <th className="py-3 px-3 text-center">Cámara</th>
                    <th className="py-3 px-3 text-center">Categoría</th>
                    <th className="py-3 px-3 text-center">ERI Prod.</th>
                    {sortedDatesAsc.map(date => {
                      const { displayDate, dayName } = formatFriendlyDate(date);
                      return (
                        <th key={date} className="py-3 px-2.5 text-center min-w-24 whitespace-nowrap">
                          <div className="text-[9px] text-slate-400 font-bold">{dayName}</div>
                          <div className="text-[10px] text-slate-700 font-black">{displayDate}</div>
                        </th>
                      );
                    })}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-xs font-medium">
                  {paginatedMatrix.length === 0 ? (
                    <tr>
                      <td colSpan={5 + sortedDatesAsc.length} className="py-12 text-center text-slate-400 font-bold">
                        No se encontraron productos que coincidan con la búsqueda.
                      </td>
                    </tr>
                  ) : (
                    paginatedMatrix.map(prod => (
                      <tr key={prod.codigo} className="hover:bg-slate-50/70 transition-colors">
                        <td className="py-2.5 px-3.5 font-mono font-black text-slate-800 sticky left-0 bg-white group-hover:bg-slate-50 z-10">
                          {prod.codigo}
                        </td>

                        <td className="py-2.5 px-3.5 font-bold text-slate-700 sticky left-28 bg-white group-hover:bg-slate-50 z-10 truncate max-w-xs">
                          {prod.nombre}
                        </td>

                        <td className="py-2.5 px-3 text-center">
                          <span className={`px-2 py-0.5 rounded-md text-[9px] font-black uppercase ${
                            prod.zona === 'SECO'
                              ? 'bg-amber-50 text-amber-700 border border-amber-200'
                              : prod.zona === 'REFRIGERADO'
                              ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                              : 'bg-blue-50 text-blue-700 border border-blue-200'
                          }`}>
                            {prod.zona}
                          </span>
                        </td>

                        <td className="py-2.5 px-3 text-center text-[10px] font-bold text-slate-500">
                          {prod.categoria}
                        </td>

                        <td className="py-2.5 px-3 text-center">
                          <span className={`px-2 py-0.5 rounded-lg text-xs font-black ${
                            prod.eriProduct >= 95 ? 'text-emerald-700 bg-emerald-50' : prod.eriProduct >= 85 ? 'text-amber-700 bg-amber-50' : 'text-rose-700 bg-rose-50'
                          }`}>
                            {prod.eriProduct.toFixed(0)}%
                          </span>
                        </td>

                        {sortedDatesAsc.map(date => {
                          const item = prod.byDate[date];
                          if (!item) {
                            return (
                              <td key={date} className="py-2.5 px-2 text-center text-slate-300 font-bold">
                                —
                              </td>
                            );
                          }
                          if (item.exact) {
                            return (
                              <td key={date} className="py-2.5 px-2 text-center">
                                <span className="inline-flex items-center justify-center w-6 h-6 rounded-lg bg-emerald-100 text-emerald-800 text-[10px] font-black" title="Exacto (Dif: 0)">
                                  ✓
                                </span>
                              </td>
                            );
                          }
                          return (
                            <td key={date} className="py-2.5 px-2 text-center">
                              <span 
                                className={`inline-flex items-center justify-center px-1.5 py-0.5 rounded-md text-[10px] font-black ${
                                  item.diff > 0 ? 'bg-blue-100 text-blue-800' : 'bg-rose-100 text-rose-800'
                                }`}
                                title={`Diferencia: ${item.diff > 0 ? `+${item.diff}` : item.diff}`}
                              >
                                {item.diff > 0 ? `+${item.diff}` : item.diff}
                              </span>
                            </td>
                          );
                        })}
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            {/* Pagination Controls */}
            <div className="p-3 border-t border-slate-200 bg-slate-50 flex items-center justify-between flex-wrap gap-2 text-xs">
              <div className="text-slate-500 font-bold">
                Mostrando {Math.min(productMatrix.length, (matrixPage - 1) * pageSize + 1)} - {Math.min(productMatrix.length, matrixPage * pageSize)} de {productMatrix.length} productos
              </div>

              <div className="flex items-center gap-2">
                <select
                  value={pageSize}
                  onChange={e => {
                    setPageSize(Number(e.target.value));
                    setMatrixPage(1);
                  }}
                  className="px-2 py-1 bg-white border border-slate-200 rounded-lg text-xs font-bold text-slate-700 outline-none"
                >
                  <option value={25}>25 por pág.</option>
                  <option value={50}>50 por pág.</option>
                  <option value={100}>100 por pág.</option>
                </select>

                <div className="flex items-center gap-1">
                  <button
                    onClick={() => setMatrixPage(p => Math.max(1, p - 1))}
                    disabled={matrixPage === 1}
                    className="p-1.5 rounded-lg bg-white border border-slate-200 text-slate-700 disabled:opacity-40 hover:bg-slate-100 cursor-pointer"
                  >
                    <ChevronLeft className="w-4 h-4" />
                  </button>
                  <span className="font-bold text-slate-700 px-2">
                    {matrixPage} / {totalMatrixPages}
                  </span>
                  <button
                    onClick={() => setMatrixPage(p => Math.min(totalMatrixPages, p + 1))}
                    disabled={matrixPage >= totalMatrixPages}
                    className="p-1.5 rounded-lg bg-white border border-slate-200 text-slate-700 disabled:opacity-40 hover:bg-slate-100 cursor-pointer"
                  >
                    <ChevronRight className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* -------------------------------------------------------------------------- */}
      {/* MODAL: GRÁFICO DE TENDENCIA PROFESIONAL DEL ERI                            */}
      {/* -------------------------------------------------------------------------- */}
      {showTrendModal && (
        <div className="fixed inset-0 z-[99999] bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in duration-150">
          <div className="bg-white rounded-3xl shadow-2xl border border-slate-200 w-full max-w-5xl max-h-[90vh] flex flex-col overflow-hidden">
            {/* Modal Header */}
            <div className="p-5 border-b border-slate-200 flex items-center justify-between bg-slate-50/70">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-indigo-50 border border-indigo-200 flex items-center justify-center text-indigo-600 shadow-xs">
                  <TrendingUp className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-black text-slate-800 text-base sm:text-lg">
                    Tendencia Histórica de Exactitud de Inventario (ERI)
                  </h3>
                  <p className="text-xs text-slate-500">
                    Evolución temporal del ERI Global y por cámaras en el período seleccionado ({startDate} al {endDate})
                  </p>
                </div>
              </div>

              <button
                onClick={() => setShowTrendModal(false)}
                className="p-2 rounded-xl text-slate-400 hover:text-slate-600 hover:bg-slate-200/60 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="flex-1 overflow-auto p-5 space-y-4">
              {/* Summary KPIs bar inside Modal */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="bg-indigo-50/60 border border-indigo-100 p-3 rounded-2xl">
                  <div className="text-[10px] font-black uppercase text-indigo-700">ERI Promedio Período</div>
                  <div className="text-2xl font-black text-indigo-950 mt-0.5">{globalKpis.eriGlobal.toFixed(1)}%</div>
                </div>

                <div className="bg-emerald-50/60 border border-emerald-100 p-3 rounded-2xl">
                  <div className="text-[10px] font-black uppercase text-emerald-700">Meta Objetivo ERI</div>
                  <div className="text-2xl font-black text-emerald-950 mt-0.5">≥ 95.0%</div>
                </div>

                <div className="bg-amber-50/60 border border-amber-100 p-3 rounded-2xl">
                  <div className="text-[10px] font-black uppercase text-amber-700">Umbral Aceptable</div>
                  <div className="text-2xl font-black text-amber-950 mt-0.5">≥ 85.0%</div>
                </div>

                <div className="bg-slate-50 border border-slate-200 p-3 rounded-2xl">
                  <div className="text-[10px] font-black uppercase text-slate-500">Días con Conteo</div>
                  <div className="text-2xl font-black text-slate-800 mt-0.5">{trendChartData.length} días</div>
                </div>
              </div>

              {/* Series toggles */}
              <div className="flex items-center justify-between flex-wrap gap-2 pt-2 border-t border-slate-100">
                <span className="text-xs font-black uppercase text-slate-400">Series Visibles:</span>
                <div className="flex items-center gap-2 flex-wrap">
                  <button
                    onClick={() => setVisibleSeries(s => ({ ...s, global: !s.global }))}
                    className={`flex items-center gap-1.5 px-3 py-1 rounded-xl text-xs font-black transition-all border ${
                      visibleSeries.global
                        ? 'bg-indigo-600 text-white border-indigo-700 shadow-xs'
                        : 'bg-slate-100 text-slate-400 border-slate-200'
                    }`}
                  >
                    <span className="w-2.5 h-2.5 rounded-full bg-white"></span>
                    ERI Global
                  </button>

                  <button
                    onClick={() => setVisibleSeries(s => ({ ...s, seco: !s.seco }))}
                    className={`flex items-center gap-1.5 px-3 py-1 rounded-xl text-xs font-black transition-all border ${
                      visibleSeries.seco
                        ? 'bg-amber-500 text-white border-amber-600 shadow-xs'
                        : 'bg-slate-100 text-slate-400 border-slate-200'
                    }`}
                  >
                    <Sun className="w-3.5 h-3.5" />
                    Seco
                  </button>

                  <button
                    onClick={() => setVisibleSeries(s => ({ ...s, refrigerado: !s.refrigerado }))}
                    className={`flex items-center gap-1.5 px-3 py-1 rounded-xl text-xs font-black transition-all border ${
                      visibleSeries.refrigerado
                        ? 'bg-emerald-600 text-white border-emerald-700 shadow-xs'
                        : 'bg-slate-100 text-slate-400 border-slate-200'
                    }`}
                  >
                    <Snowflake className="w-3.5 h-3.5" />
                    Refrigerado
                  </button>

                  <button
                    onClick={() => setVisibleSeries(s => ({ ...s, congelado: !s.congelado }))}
                    className={`flex items-center gap-1.5 px-3 py-1 rounded-xl text-xs font-black transition-all border ${
                      visibleSeries.congelado
                        ? 'bg-blue-600 text-white border-blue-700 shadow-xs'
                        : 'bg-slate-100 text-slate-400 border-slate-200'
                    }`}
                  >
                    <Snowflake className="w-3.5 h-3.5" />
                    Congelado
                  </button>
                </div>
              </div>

              {/* Main Chart */}
              <div className="bg-slate-50/50 p-4 rounded-2xl border border-slate-200/80">
                <div className="h-80 sm:h-96 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={trendChartData} margin={{ top: 15, right: 30, left: 0, bottom: 25 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
                      <XAxis 
                        dataKey="fechaLabel" 
                        tick={{ fontSize: 11, fill: '#64748b', fontWeight: 600 }}
                        dy={10}
                      />
                      <YAxis 
                        domain={[0, 100]} 
                        ticks={[0, 20, 40, 60, 80, 85, 95, 100]}
                        unit="%" 
                        tick={{ fontSize: 11, fill: '#64748b', fontWeight: 600 }}
                      />
                      {/* Meta 95% Reference Line */}
                      <ReferenceLine 
                        y={95} 
                        stroke="#10b981" 
                        strokeDasharray="4 4" 
                        strokeWidth={1.5}
                        label={{ value: 'Meta (95%)', fill: '#059669', fontSize: 10, fontWeight: 800, position: 'top' }}
                      />
                      {/* Alerta 85% Reference Line */}
                      <ReferenceLine 
                        y={85} 
                        stroke="#f59e0b" 
                        strokeDasharray="4 4" 
                        strokeWidth={1.5}
                        label={{ value: 'Alerta (85%)', fill: '#d97706', fontSize: 10, fontWeight: 800, position: 'top' }}
                      />

                      <Tooltip 
                        content={({ active, payload }) => {
                          if (!active || !payload || payload.length === 0) return null;
                          const d = payload[0]?.payload;
                          return (
                            <div className="bg-white p-3.5 rounded-2xl shadow-xl border border-slate-200 text-xs">
                              <div className="font-black text-slate-800 text-sm border-b border-slate-100 pb-1.5 mb-2">
                                {d.fechaLabel} <span className="text-[10px] text-slate-400 font-mono">({d.fecha})</span>
                              </div>
                              <div className="space-y-1.5">
                                {d.eriGlobal !== null && (
                                  <div className="flex items-center justify-between gap-4 font-black text-indigo-700">
                                    <span className="flex items-center gap-1">
                                      <span className="w-2 h-2 rounded-full bg-indigo-600"></span> ERI Global:
                                    </span>
                                    <span>{d.eriGlobal}% ({d.exactItems}/{d.totalItems})</span>
                                  </div>
                                )}
                                {d.eriSeco !== null && (
                                  <div className="flex items-center justify-between gap-4 font-bold text-amber-700">
                                    <span className="flex items-center gap-1">
                                      <span className="w-2 h-2 rounded-full bg-amber-500"></span> Seco:
                                    </span>
                                    <span>{d.eriSeco}%</span>
                                  </div>
                                )}
                                {d.eriRefrigerado !== null && (
                                  <div className="flex items-center justify-between gap-4 font-bold text-emerald-700">
                                    <span className="flex items-center gap-1">
                                      <span className="w-2 h-2 rounded-full bg-emerald-600"></span> Refrigerado:
                                    </span>
                                    <span>{d.eriRefrigerado}%</span>
                                  </div>
                                )}
                                {d.eriCongelado !== null && (
                                  <div className="flex items-center justify-between gap-4 font-bold text-blue-700">
                                    <span className="flex items-center gap-1">
                                      <span className="w-2 h-2 rounded-full bg-blue-600"></span> Congelado:
                                    </span>
                                    <span>{d.eriCongelado}%</span>
                                  </div>
                                )}
                              </div>
                            </div>
                          );
                        }}
                      />

                      {/* Line ERI Global */}
                      {visibleSeries.global && (
                        <Line 
                          type="monotone" 
                          dataKey="eriGlobal" 
                          name="ERI Global" 
                          stroke="#4f46e5" 
                          strokeWidth={3.5}
                          dot={{ r: 4.5, fill: '#4f46e5', strokeWidth: 2, stroke: '#ffffff' }}
                          activeDot={{ r: 7, fill: '#4f46e5' }}
                          connectNulls
                        />
                      )}

                      {/* Line Seco */}
                      {visibleSeries.seco && (
                        <Line 
                          type="monotone" 
                          dataKey="eriSeco" 
                          name="Seco" 
                          stroke="#d97706" 
                          strokeWidth={2}
                          strokeDasharray="5 5"
                          dot={{ r: 3, fill: '#d97706' }}
                          connectNulls
                        />
                      )}

                      {/* Line Refrigerado */}
                      {visibleSeries.refrigerado && (
                        <Line 
                          type="monotone" 
                          dataKey="eriRefrigerado" 
                          name="Refrigerado" 
                          stroke="#059669" 
                          strokeWidth={2}
                          strokeDasharray="5 5"
                          dot={{ r: 3, fill: '#059669' }}
                          connectNulls
                        />
                      )}

                      {/* Line Congelado */}
                      {visibleSeries.congelado && (
                        <Line 
                          type="monotone" 
                          dataKey="eriCongelado" 
                          name="Congelado" 
                          stroke="#2563eb" 
                          strokeWidth={2}
                          strokeDasharray="5 5"
                          dot={{ r: 3, fill: '#2563eb' }}
                          connectNulls
                        />
                      )}
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </div>
            </div>

            {/* Modal Footer */}
            <div className="p-4 border-t border-slate-200 bg-slate-50 flex justify-end">
              <button
                onClick={() => setShowTrendModal(false)}
                className="px-5 py-2.5 bg-slate-800 hover:bg-slate-900 text-white font-black text-xs rounded-xl transition-all cursor-pointer shadow-xs"
              >
                Cerrar Gráfico
              </button>
            </div>
          </div>
        </div>
      )}

      {/* -------------------------------------------------------------------------- */}
      {/* MODAL: DETALLE AUDITORÍA POR DÍA                                           */}
      {/* -------------------------------------------------------------------------- */}
      {selectedDayDetail && (
        <div className="fixed inset-0 z-[99999] bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in duration-150">
          <div className="bg-white rounded-2xl shadow-xl border border-slate-200 w-full max-w-4xl max-h-[85vh] flex flex-col overflow-hidden">
            {/* Modal Header */}
            <div className="p-4 border-b border-slate-200 flex items-center justify-between bg-slate-50">
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="font-black text-slate-800 text-base">
                    Detalle ERI — {selectedDayDetail.displayDate} ({selectedDayDetail.dayName})
                  </h3>
                  <span className={`px-2 py-0.5 rounded-md text-xs font-black border ${getEriBadgeStyle(selectedDayDetail.eriGlobal).bg}`}>
                    ERI: {selectedDayDetail.eriGlobal.toFixed(1)}%
                  </span>
                </div>
                <p className="text-xs text-slate-500 mt-0.5">
                  {selectedDayDetail.exactItems} exactos de {selectedDayDetail.totalItems} ítems auditados
                </p>
              </div>
              <button
                onClick={() => setSelectedDayDetail(null)}
                className="p-2 rounded-xl text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="flex-1 overflow-auto p-4">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200 text-[10px] font-black uppercase text-slate-400 tracking-wider">
                    <th className="py-2.5 px-3">Código</th>
                    <th className="py-2.5 px-3">Producto</th>
                    <th className="py-2.5 px-2 text-center">Cámara</th>
                    <th className="py-2.5 px-2 text-center">Categoría</th>
                    <th className="py-2.5 px-3 text-right">Stock Sistema</th>
                    <th className="py-2.5 px-3 text-right">Conteo Físico</th>
                    <th className="py-2.5 px-3 text-right">Diferencia</th>
                    <th className="py-2.5 px-3 text-center">Estado</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {selectedDayDetail.records.map(rec => {
                    const isExact = rec.diferencia === 0;
                    return (
                      <tr key={rec.codigo} className={isExact ? '' : 'bg-rose-50/40'}>
                        <td className="py-2 px-3 font-mono font-black text-slate-800">{rec.codigo}</td>
                        <td className="py-2 px-3 font-bold text-slate-700">{rec.nombre}</td>
                        <td className="py-2 px-2 text-center">
                          <span className="text-[9px] font-black text-slate-500 uppercase">{rec.zona}</span>
                        </td>
                        <td className="py-2 px-2 text-center text-[10px] font-bold text-slate-400">
                          {rec.categoria}
                        </td>
                        <td className="py-2 px-3 text-right font-mono font-bold text-slate-600">
                          {rec.stock_sistema.toFixed(2)}
                        </td>
                        <td className="py-2 px-3 text-right font-mono font-bold text-slate-800">
                          {rec.conteo_fisico.toFixed(2)}
                        </td>
                        <td className={`py-2 px-3 text-right font-mono font-black ${
                          isExact ? 'text-emerald-600' : rec.diferencia > 0 ? 'text-blue-600' : 'text-rose-600'
                        }`}>
                          {rec.diferencia > 0 ? `+${rec.diferencia.toFixed(2)}` : rec.diferencia.toFixed(2)}
                        </td>
                        <td className="py-2 px-3 text-center">
                          {isExact ? (
                            <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-emerald-100 text-emerald-800">
                              ✓ Exacto
                            </span>
                          ) : (
                            <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-rose-100 text-rose-800">
                              Desviación
                            </span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Modal Footer */}
            <div className="p-3 border-t border-slate-200 bg-slate-50 flex justify-end">
              <button
                onClick={() => setSelectedDayDetail(null)}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-900 text-white font-black text-xs rounded-xl cursor-pointer"
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

export default EriHistory;
