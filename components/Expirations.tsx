import React, { useState, useEffect } from 'react';
import { supabase } from '../supabaseClient';
import { Product, Usuario } from '../types';
import { 
  Search, 
  Clock, 
  AlertTriangle, 
  ArrowDownLeft, 
  Filter, 
  ChevronRight, 
  History, 
  Info, 
  Calendar, 
  TrendingUp, 
  ShieldAlert,
  RefreshCw
} from 'lucide-react';

interface ExpirationsProps {
  catalog: Product[];
  currentUser: Usuario | null;
}

interface ExpirationMovement {
  id: string;
  fecha: string;
  source: 'RECEPCION' | 'INVENTARIO';
  cantidad: number;
  usuario: string;
  comentario?: string;
}

interface ExpirationGroup {
  key: string; // codigo_fechaVencimiento
  codigo: string;
  nombre: string;
  fecha_vencimiento: string;
  dias_restantes: number;
  total_recepcionado: number;
  ultimo_conteo: number | null;
  ultima_fecha_conteo: string | null;
  movements: ExpirationMovement[];
  alertas: string[];
  nivel_alerta: 'CRITICAL' | 'WARNING' | 'INFO' | 'OK';
}

export const Expirations: React.FC<ExpirationsProps> = ({ catalog, currentUser }) => {
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [alertFilter, setAlertFilter] = useState<'TODOS' | 'CON_ALERTA' | 'CRITICOS' | 'OLVIDADOS'>('TODOS');
  const [expirationGroups, setExpirationGroups] = useState<ExpirationGroup[]>([]);
  const [selectedGroup, setSelectedGroup] = useState<ExpirationGroup | null>(null);

  // Helper local para fecha de Perú (America/Lima)
  const getPeruDateString = (dateInput?: Date | string) => {
    const date = dateInput ? new Date(dateInput) : new Date();
    const formatter = new Intl.DateTimeFormat('es-PE', {
      timeZone: 'America/Lima',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit'
    });
    const parts = formatter.formatToParts(date);
    const day = parts.find(p => p.type === 'day')?.value || '01';
    const month = parts.find(p => p.type === 'month')?.value || '01';
    const year = parts.find(p => p.type === 'year')?.value || '2026';
    return `${year}-${month}-${day}`;
  };

  const getPeruDateTimeString = (dateInput: Date | string) => {
    const date = new Date(dateInput);
    return new Intl.DateTimeFormat('es-PE', {
      timeZone: 'America/Lima',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false
    }).format(date);
  };

  const loadExpirationsData = async () => {
    setLoading(true);
    setErrorMsg(null);
    try {
      const hoyStr = getPeruDateString();
      const hoy = new Date(hoyStr + 'T00:00:00');

      // 1. Obtener recepciones activas
      let recQuery = supabase
        .from('recepcion_productos')
        .select('id, codigo, nombre, cantidad, fecha_vencimiento, fecha_registro, usuario_receptor')
        .eq('estado', 'ACTIVO');

      if (currentUser?.sede_id) {
        recQuery = recQuery.eq('sede_id', currentUser.sede_id);
      }

      const { data: recData, error: recError } = await recQuery;
      if (recError) throw recError;

      // 2. Obtener conteos de inventario
      let countQuery = supabase
        .from('conteo_inventario')
        .select('id, codigo, cantidad, fecha_vencimiento, fecha_registro, usuario_conteo, comentario');

      if (currentUser?.sede_id) {
        countQuery = countQuery.eq('sede_id', currentUser.sede_id);
      }

      const { data: countData, error: countError } = await countQuery;
      if (countError) throw countError;

      // 3. Agrupar por producto y fecha de vencimiento
      const groupsMap: Record<string, ExpirationGroup> = {};

      // Procesar recepciones
      (recData || []).forEach(r => {
        if (!r.fecha_vencimiento || r.fecha_vencimiento === 'ROTO' || r.fecha_vencimiento === 'REMAR' || r.fecha_vencimiento === 'DESTRUCCION') return;
        
        const key = `${r.codigo}_${r.fecha_vencimiento}`;
        
        // Obtener nombre del producto desde catálogo si es posible
        const prod = catalog.find(p => p.codigo === r.codigo);
        const nombre = prod?.nombre || r.nombre || 'Producto Desconocido';

        if (!groupsMap[key]) {
          const expDate = new Date(r.fecha_vencimiento + 'T00:00:00');
          const diffTime = expDate.getTime() - hoy.getTime();
          const dias_restantes = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

          groupsMap[key] = {
            key,
            codigo: r.codigo,
            nombre,
            fecha_vencimiento: r.fecha_vencimiento,
            dias_restantes,
            total_recepcionado: 0,
            ultimo_conteo: null,
            ultima_fecha_conteo: null,
            movements: [],
            alertas: [],
            nivel_alerta: 'OK'
          };
        }

        groupsMap[key].total_recepcionado += r.cantidad;
        groupsMap[key].movements.push({
          id: r.id,
          fecha: r.fecha_registro,
          source: 'RECEPCION',
          cantidad: r.cantidad,
          usuario: r.usuario_receptor || 'Receptor'
        });
      });

      // Procesar conteos de inventario
      (countData || []).forEach(c => {
        if (!c.fecha_vencimiento || c.fecha_vencimiento === 'ROTO' || c.fecha_vencimiento === 'REMAR' || c.fecha_vencimiento === 'DESTRUCCION') return;

        const key = `${c.codigo}_${c.fecha_vencimiento}`;
        const prod = catalog.find(p => p.codigo === c.codigo);
        const nombre = prod?.nombre || 'Producto Desconocido';

        if (!groupsMap[key]) {
          const expDate = new Date(c.fecha_vencimiento + 'T00:00:00');
          const diffTime = expDate.getTime() - hoy.getTime();
          const dias_restantes = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

          groupsMap[key] = {
            key,
            codigo: c.codigo,
            nombre,
            fecha_vencimiento: c.fecha_vencimiento,
            dias_restantes,
            total_recepcionado: 0,
            ultimo_conteo: null,
            ultima_fecha_conteo: null,
            movements: [],
            alertas: [],
            nivel_alerta: 'OK'
          };
        }

        groupsMap[key].movements.push({
          id: c.id,
          fecha: c.fecha_registro,
          source: 'INVENTARIO',
          cantidad: c.cantidad,
          usuario: c.usuario_conteo || 'Inventariador',
          comentario: c.comentario
        });
      });

      // Calcular estados consolidados y alertas inteligentes para cada grupo
      const finalGroups = Object.values(groupsMap).map(g => {
        // Ordenar movimientos cronológicamente
        g.movements.sort((a, b) => new Date(a.fecha).getTime() - new Date(b.fecha).getTime());

        // Obtener último conteo y su fecha
        const inventoryMovements = g.movements.filter(m => m.source === 'INVENTARIO');
        if (inventoryMovements.length > 0) {
          const lastCountMov = inventoryMovements[inventoryMovements.length - 1];
          g.ultimo_conteo = lastCountMov.cantidad;
          g.ultima_fecha_conteo = lastCountMov.fecha;
        }

        const alertas: string[] = [];
        let nivel: 'CRITICAL' | 'WARNING' | 'INFO' | 'OK' = 'OK';

        // 1. Alerta de Vencimiento Próximo o Vencido
        if (g.dias_restantes < 0) {
          alertas.push(`Lote Vencido (Hace ${Math.abs(g.dias_restantes)} días)`);
          nivel = 'CRITICAL';
        } else if (g.dias_restantes <= 30) {
          alertas.push(`Por vencer próximamente (Quedan ${g.dias_restantes} días)`);
          nivel = 'WARNING';
        }

        // 2. Alerta de descuadre: Último conteo vs Recepcionando
        if (g.ultimo_conteo !== null && g.total_recepcionado > 0) {
          const diff = g.ultimo_conteo - g.total_recepcionado;
          if (diff < 0) {
            alertas.push(`Faltante en inventario: Se recibieron ${g.total_recepcionado} u. pero el último conteo es de ${g.ultimo_conteo} u. (Faltan ${Math.abs(diff)} u.)`);
            if (nivel !== 'CRITICAL') nivel = 'WARNING';
          } else if (diff > 0) {
            alertas.push(`Aumento no justificado: El último conteo es de ${g.ultimo_conteo} u. pero solo se recibieron ${g.total_recepcionado} u. (+${diff} u.)`);
            if (nivel !== 'CRITICAL') nivel = 'WARNING';
          }
        }

        // 3. Alerta de seguimiento temporal (Olvido de inventariar):
        // Si tiene fecha de recepción y ha pasado más de 30 días sin que se le haga inventario
        const ultimaActividadCount = g.ultima_fecha_conteo ? new Date(g.ultima_fecha_conteo) : null;
        const ultimaActividadRec = g.movements.length > 0 ? new Date(g.movements[0].fecha) : null;
        const ultimaFechaSeguimiento = ultimaActividadCount || ultimaActividadRec;

        if (ultimaFechaSeguimiento) {
          const diffDays = Math.ceil((hoy.getTime() - ultimaFechaSeguimiento.getTime()) / (1000 * 60 * 60 * 24));
          if (diffDays > 30 && g.ultimo_conteo === null) {
            alertas.push(`Lote recibido hace ${diffDays} días pero NUNCA ha sido inventariado`);
            nivel = 'CRITICAL';
          } else if (diffDays > 45) {
            alertas.push(`Sin control de fecha de vencimiento: No se realiza inventario hace ${diffDays} días`);
            if (nivel !== 'CRITICAL') nivel = 'WARNING';
          }
        }

        // 4. Traceo de caídas o subidas sospechosas consecutivas de conteos
        if (inventoryMovements.length > 1) {
          for (let i = 1; i < inventoryMovements.length; i++) {
            const prev = inventoryMovements[i - 1].cantidad;
            const curr = inventoryMovements[i].cantidad;
            if (curr > prev) {
              const diff = curr - prev;
              alertas.push(`Conteo aumentó sospechosamente de ${prev} u. a ${curr} u. en el conteo del ${getPeruDateTimeString(inventoryMovements[i].fecha)} (+${diff} u.)`);
              if (nivel !== 'CRITICAL') nivel = 'WARNING';
            }
          }
        }

        g.alertas = alertas;
        g.nivel_alerta = nivel;

        return g;
      });

      // Ordenar por días restantes al vencimiento de menor a mayor (los más urgentes primero)
      finalGroups.sort((a, b) => a.dias_restantes - b.dias_restantes);
      setExpirationGroups(finalGroups);

      // Si había un grupo seleccionado, actualizar su detalle
      if (selectedGroup) {
        const updated = finalGroups.find(g => g.key === selectedGroup.key);
        if (updated) setSelectedGroup(updated);
      }

    } catch (err: any) {
      console.error("Error cargando vencimientos:", err);
      setErrorMsg("Error al cargar datos de vencimientos: " + err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadExpirationsData();
  }, [catalog]);

  // Filtrado de grupos
  const filteredGroups = expirationGroups.filter(g => {
    const matchSearch = g.codigo.toLowerCase().includes(searchTerm.toLowerCase()) || 
                        g.nombre.toLowerCase().includes(searchTerm.toLowerCase());
    
    if (!matchSearch) return false;

    if (alertFilter === 'CON_ALERTA') return g.alertas.length > 0;
    if (alertFilter === 'CRITICOS') return g.nivel_alerta === 'CRITICAL';
    if (alertFilter === 'OLVIDADOS') {
      return g.alertas.some(a => a.toLowerCase().includes('nunca ha sido') || a.toLowerCase().includes('no se realiza'));
    }

    return true;
  });

  return (
    <div className="flex flex-col h-full bg-slate-50 dark:bg-slate-900/40 p-4 sm:p-6" id="vencimientos-container">
      {/* HEADER */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6" id="vencimientos-header">
        <div>
          <h1 className="text-xl sm:text-2xl font-black text-slate-800 dark:text-white uppercase tracking-tight flex items-center gap-2">
            <Clock className="w-6 h-6 text-[#009ED6]" />
            Control de Vencimientos
          </h1>
          <p className="text-xs text-slate-500 font-bold uppercase">
            Monitoreo inteligente de caducidad, auditoría de conteos y detección de descuadres
          </p>
        </div>
        <button 
          onClick={loadExpirationsData} 
          disabled={loading}
          className="bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 font-black text-xs px-4 py-3 rounded-2xl shadow-sm border border-slate-200 dark:border-slate-700 flex items-center justify-center gap-2 hover:bg-slate-50 active:scale-95 transition-all uppercase"
          id="btn-recargar-vencimientos"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          Recargar Datos
        </button>
      </div>

      {errorMsg && (
        <div className="p-4 mb-6 bg-rose-50 border border-rose-200 rounded-2xl flex items-start gap-3 text-rose-800 text-xs font-bold uppercase" id="error-alert">
          <AlertTriangle className="w-5 h-5 shrink-0" />
          <span>{errorMsg}</span>
        </div>
      )}

      {/* METRICAS RAPIDAS */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6" id="vencimientos-metrics">
        <div className="bg-white dark:bg-slate-800 p-4 rounded-2xl border border-slate-150 shadow-sm flex flex-col justify-between">
          <span className="text-[10px] font-black text-slate-400 uppercase">Lotes Vencidos</span>
          <div className="flex items-baseline gap-2 mt-2">
            <span className="text-2xl font-black text-rose-600">
              {expirationGroups.filter(g => g.dias_restantes < 0).length}
            </span>
            <span className="text-[10px] font-black text-rose-400 uppercase">Urgente</span>
          </div>
        </div>
        <div className="bg-white dark:bg-slate-800 p-4 rounded-2xl border border-slate-150 shadow-sm flex flex-col justify-between">
          <span className="text-[10px] font-black text-slate-400 uppercase">Por Vencer (≤30 días)</span>
          <div className="flex items-baseline gap-2 mt-2">
            <span className="text-2xl font-black text-amber-500">
              {expirationGroups.filter(g => g.dias_restantes >= 0 && g.dias_restantes <= 30).length}
            </span>
            <span className="text-[10px] font-black text-amber-400 uppercase">Monitorear</span>
          </div>
        </div>
        <div className="bg-white dark:bg-slate-800 p-4 rounded-2xl border border-slate-150 shadow-sm flex flex-col justify-between">
          <span className="text-[10px] font-black text-slate-400 uppercase">Con Descuadre u Alerta</span>
          <div className="flex items-baseline gap-2 mt-2">
            <span className="text-2xl font-black text-indigo-600">
              {expirationGroups.filter(g => g.alertas.length > 0).length}
            </span>
            <span className="text-[10px] font-black text-indigo-400 uppercase">Auditar</span>
          </div>
        </div>
        <div className="bg-white dark:bg-slate-800 p-4 rounded-2xl border border-slate-150 shadow-sm flex flex-col justify-between">
          <span className="text-[10px] font-black text-slate-400 uppercase">Lotes Olvidados (&gt;30d)</span>
          <div className="flex items-baseline gap-2 mt-2">
            <span className="text-2xl font-black text-blue-600">
              {expirationGroups.filter(g => g.alertas.some(a => a.toLowerCase().includes('nunca ha sido') || a.toLowerCase().includes('no se realiza'))).length}
            </span>
            <span className="text-[10px] font-black text-blue-400 uppercase">Inventariar</span>
          </div>
        </div>
      </div>

      {/* WORKSPACE DIVIDIDO EN DOS COLUMNAS */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start grow" id="vencimientos-split-layout">
        
        {/* COLUMNA IZQUIERDA: BUSQUEDA Y LISTADO */}
        <div className="lg:col-span-7 bg-white dark:bg-slate-800 rounded-3xl border border-slate-150 shadow-sm overflow-hidden flex flex-col" id="columna-listado">
          
          {/* BARRA DE FILTROS */}
          <div className="p-4 border-b border-slate-100 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-800/50 flex flex-col gap-3">
            <div className="relative">
              <Search className="absolute left-3 top-3.5 w-4 h-4 text-slate-400" />
              <input 
                type="text" 
                placeholder="BUSCAR POR CÓDIGO O DESCRIPCIÓN..."
                className="w-full pl-9 pr-4 py-3 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-2xl text-xs font-black uppercase text-slate-800 dark:text-white outline-none focus:ring-2 focus:ring-[#009ED6] placeholder-slate-400"
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
              />
            </div>

            <div className="flex flex-wrap gap-1.5 items-center">
              <span className="text-[10px] font-black text-slate-400 uppercase flex items-center gap-1 mr-1">
                <Filter className="w-3.5 h-3.5" /> Filtrar:
              </span>
              {[
                { id: 'TODOS', label: 'TODOS' },
                { id: 'CON_ALERTA', label: 'CON ALERTA' },
                { id: 'CRITICOS', label: 'CRÍTICOS' },
                { id: 'OLVIDADOS', label: 'SIN INVENTARIAR (&gt;30D)' }
              ].map(f => (
                <button
                  key={f.id}
                  onClick={() => setAlertFilter(f.id as any)}
                  className={`px-3 py-1.5 rounded-xl text-[9px] font-black uppercase border transition-all ${
                    alertFilter === f.id 
                      ? 'bg-[#009ED6] border-[#009ED6] text-white' 
                      : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-50'
                  }`}
                >
                  <span dangerouslySetInnerHTML={{ __html: f.label }} />
                </button>
              ))}
            </div>
          </div>

          {/* LISTA */}
          <div className="overflow-y-auto max-h-[500px]" id="lista-lotes-vencimiento">
            {loading ? (
              <div className="p-8 text-center text-xs font-bold text-slate-400 uppercase flex flex-col items-center gap-2">
                <RefreshCw className="w-6 h-6 animate-spin text-[#009ED6]" />
                Cargando datos...
              </div>
            ) : filteredGroups.length === 0 ? (
              <div className="p-12 text-center text-xs font-bold text-slate-400 uppercase">
                No se encontraron lotes que coincidan con la búsqueda.
              </div>
            ) : (
              <div className="divide-y divide-slate-100 dark:divide-slate-700">
                {filteredGroups.map(g => {
                  const isSelected = selectedGroup?.key === g.key;
                  let cardBorder = 'border-l-4 border-l-slate-200';
                  let badgeBg = 'bg-slate-100 text-slate-600';
                  
                  if (g.nivel_alerta === 'CRITICAL') {
                    cardBorder = 'border-l-4 border-l-rose-500';
                    badgeBg = 'bg-rose-50 dark:bg-rose-950/30 text-rose-600 dark:text-rose-400';
                  } else if (g.nivel_alerta === 'WARNING') {
                    cardBorder = 'border-l-4 border-l-amber-500';
                    badgeBg = 'bg-amber-50 dark:bg-amber-950/30 text-amber-600 dark:text-amber-400';
                  } else if (g.nivel_alerta === 'OK') {
                    cardBorder = 'border-l-4 border-l-emerald-500';
                    badgeBg = 'bg-emerald-50 dark:bg-emerald-950/30 text-emerald-600 dark:text-emerald-400';
                  }

                  return (
                    <div 
                      key={g.key}
                      onClick={() => setSelectedGroup(g)}
                      className={`p-4 flex items-center justify-between gap-4 cursor-pointer hover:bg-slate-50/80 dark:hover:bg-slate-800/50 transition-all ${cardBorder} ${isSelected ? 'bg-sky-50/55 dark:bg-slate-800/80' : ''}`}
                    >
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1 flex-wrap">
                          <span className="text-[10px] font-black px-2 py-0.5 bg-slate-100 dark:bg-slate-700 rounded-md text-slate-600 dark:text-slate-300">
                            {g.codigo}
                          </span>
                          <span className={`text-[9px] font-black px-2 py-0.5 rounded-full ${badgeBg}`}>
                            VENCE: {g.fecha_vencimiento}
                          </span>
                          {g.dias_restantes < 0 ? (
                            <span className="text-[9px] font-black text-rose-600 bg-rose-50 dark:bg-rose-900/10 px-2 py-0.5 rounded-full uppercase">
                              VENCIDO HACE {Math.abs(g.dias_restantes)} DÍAS
                            </span>
                          ) : (
                            <span className="text-[9px] font-black text-slate-500 uppercase">
                              Quedan {g.dias_restantes} días
                            </span>
                          )}
                        </div>
                        <h4 className="text-xs font-black text-slate-800 dark:text-white uppercase truncate">
                          {g.nombre}
                        </h4>
                        <div className="flex items-center gap-4 mt-2 text-[10px] font-bold text-slate-400 uppercase">
                          <span>Recibido: <strong className="text-slate-600 dark:text-slate-200">{g.total_recepcionado} u.</strong></span>
                          <span>Últ. Conteo: <strong className="text-slate-600 dark:text-slate-200">{g.ultimo_conteo !== null ? `${g.ultimo_conteo} u.` : 'S/I'}</strong></span>
                        </div>
                      </div>

                      <div className="flex items-center gap-2 shrink-0">
                        {g.alertas.length > 0 && (
                          <div className="w-5 h-5 bg-rose-100 dark:bg-rose-950 text-rose-600 dark:text-rose-400 rounded-full flex items-center justify-center animate-pulse">
                            <AlertTriangle className="w-3.5 h-3.5" />
                          </div>
                        )}
                        <ChevronRight className="w-4 h-4 text-slate-300" />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          <div className="p-4 border-t border-slate-100 dark:border-slate-700 bg-slate-50/30 text-center text-[10px] font-black text-slate-400 uppercase">
            Total {filteredGroups.length} lotes encontrados
          </div>
        </div>

        {/* COLUMNA DERECHA: DETALLE Y SEGUIMIENTO CRONOLOGICO */}
        <div className="lg:col-span-5" id="columna-detalle">
          {selectedGroup ? (
            <div className="bg-white dark:bg-slate-800 rounded-3xl border border-slate-150 shadow-sm overflow-hidden flex flex-col">
              
              {/* CABECERA DEL DETALLE */}
              <div className="p-5 border-b border-slate-100 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-800/50">
                <div className="flex items-center justify-between gap-2 mb-2">
                  <span className="text-[10px] font-black text-slate-400 uppercase">Detalle del Lote</span>
                  <span className="text-xs font-black px-3 py-1 bg-[#009ED6]/10 text-[#009ED6] rounded-full uppercase">
                    Vence: {selectedGroup.fecha_vencimiento}
                  </span>
                </div>
                <h3 className="text-sm font-black text-slate-800 dark:text-white uppercase leading-snug">
                  {selectedGroup.nombre}
                </h3>
                <p className="text-[10px] font-black text-slate-400 uppercase mt-1">
                  Código: <strong className="text-[#009ED6]">{selectedGroup.codigo}</strong>
                </p>
              </div>

              {/* ALERTAS INTELIGENTES */}
              {selectedGroup.alertas.length > 0 && (
                <div className="p-5 bg-rose-50/50 dark:bg-rose-950/20 border-b border-rose-100 dark:border-rose-950 space-y-2">
                  <h4 className="text-[10px] font-black text-rose-700 dark:text-rose-400 uppercase flex items-center gap-1.5 mb-1.5">
                    <ShieldAlert className="w-4 h-4" /> Alertas de Consistencia detectadas:
                  </h4>
                  {selectedGroup.alertas.map((al, idx) => (
                    <div key={idx} className="flex gap-2 text-[10px] font-bold text-rose-800 dark:text-rose-300 uppercase leading-relaxed">
                      <span className="shrink-0">•</span>
                      <span>{al}</span>
                    </div>
                  ))}
                </div>
              )}

              {/* SECCIÓN MOVIMIENTOS / HISTORIAL DE CONTROL */}
              <div className="p-5">
                <h4 className="text-xs font-black text-slate-700 dark:text-slate-300 uppercase flex items-center gap-1.5 mb-4">
                  <History className="w-4 h-4 text-slate-400" />
                  Historial Cronológico de Movimiento
                </h4>

                <div className="relative border-l border-slate-200 dark:border-slate-700 pl-4 ml-2 space-y-6">
                  {selectedGroup.movements.map((m, idx) => {
                    const isRec = m.source === 'RECEPCION';
                    return (
                      <div key={m.id || idx} className="relative">
                        {/* Dot */}
                        <span className={`absolute -left-[21px] top-1 w-3 h-3 rounded-full border-2 border-white dark:border-slate-800 ${
                          isRec ? 'bg-emerald-500' : 'bg-indigo-500'
                        }`} />

                        <div className="flex items-center justify-between gap-2 mb-1 flex-wrap">
                          <span className={`text-[9px] font-black px-2 py-0.5 rounded-full flex items-center gap-1 uppercase ${
                            isRec ? 'bg-emerald-50 text-emerald-600' : 'bg-indigo-50 text-indigo-600'
                          }`}>
                            {isRec ? <ArrowDownLeft className="w-3 h-3" /> : <TrendingUp className="w-3 h-3" />}
                            {isRec ? 'Recepción Aceptada' : 'Inventario / Conteo'}
                          </span>
                          <span className="text-[9px] font-bold text-slate-400 uppercase">
                            {getPeruDateTimeString(m.fecha)}
                          </span>
                        </div>

                        <div className="flex items-baseline gap-2">
                          <span className="text-xs font-black text-slate-800 dark:text-white uppercase">
                            Cantidad: <strong className={isRec ? 'text-emerald-600' : 'text-indigo-600'}>{m.cantidad} u.</strong>
                          </span>
                        </div>

                        <p className="text-[10px] text-slate-400 font-bold uppercase mt-1">
                          Registrado por: <strong className="text-slate-600 dark:text-slate-300">{m.usuario}</strong>
                        </p>

                        {m.comentario && (
                          <div className="mt-1 px-2.5 py-1.5 bg-slate-50 dark:bg-slate-900 rounded-lg text-[9px] font-bold text-slate-500 uppercase leading-normal">
                            Obs: {m.comentario}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* ANALISIS O RECOMENDACIÓN */}
              <div className="p-5 border-t border-slate-100 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-800/50 text-[10px] font-bold text-slate-500 uppercase leading-relaxed flex items-start gap-2">
                <Info className="w-4 h-4 text-slate-400 shrink-0 mt-0.5" />
                <div>
                  Para evitar pérdida de trazabilidad, asegúrese de que todo lote con fecha de vencimiento menor a 45 días sea rotulado e inventariado semanalmente. Todo aumento de inventario sin recepción previa amerita auditoría.
                </div>
              </div>

            </div>
          ) : (
            <div className="bg-slate-100/50 dark:bg-slate-800/20 rounded-3xl p-8 border border-dashed border-slate-200 dark:border-slate-700 text-center text-xs font-bold text-slate-400 uppercase py-16 flex flex-col items-center gap-3" id="detalle-vacio">
              <Calendar className="w-8 h-8 text-slate-300" />
              <span>Seleccione un producto y lote de vencimiento para auditar su historial cronológico.</span>
            </div>
          )}
        </div>

      </div>
    </div>
  );
};
