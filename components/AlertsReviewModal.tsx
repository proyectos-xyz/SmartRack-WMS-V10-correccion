import React, { useState } from 'react';
import { supabase } from '../supabaseClient';
import { XCircle, CheckCircle2, AlertTriangle, Calendar, Ban, Award, Layers, Eye, Check, RefreshCw, Bell } from 'lucide-react';

const parseTvuAlertDetails = (valorAlerta: string, fechaVencimiento?: string, fechaAlerta?: string) => {
  let tvuPercentage = '---';
  let tvmDays = '---';
  let tvuDays = '---';

  if (!valorAlerta) return { tvuPercentage, tvmDays, tvuDays };

  // 1. Try to match the percentage (e.g. TVU: 122% or similar)
  const tvuMatch = valorAlerta.match(/TVU:\s*(\d+)%/i);
  if (tvuMatch) {
    tvuPercentage = tvuMatch[1] + '%';
  }

  // 2. Try to match TVM (e.g. TVM: 180d or TVM: 180 o similar)
  const tvmMatch = valorAlerta.match(/TVM:\s*(\d+)/i);
  if (tvmMatch) {
    tvmDays = tvmMatch[1] + ' días';
  }

  // 3. Try to match remaining days (e.g. Días: 219d or Días: 219)
  const diasMatch = valorAlerta.match(/(?:Días|Dias):\s*(\d+)/i);
  if (diasMatch) {
    tvuDays = diasMatch[1] + ' días';
  } else if (fechaVencimiento) {
    // If not in the text, compute it!
    try {
      const expDate = new Date(fechaVencimiento + 'T00:00:00');
      // Use fechaAlerta if available, otherwise fallback to today
      const refDate = fechaAlerta ? new Date(fechaAlerta) : new Date();
      refDate.setHours(0, 0, 0, 0);
      const diffTime = expDate.getTime() - refDate.getTime();
      const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
      if (diffDays > 0) {
        tvuDays = diffDays + ' días';
      }
    } catch (_) {}
  }

  return { tvuPercentage, tvmDays, tvuDays };
};

interface AlertsReviewModalProps {
  isOpen: boolean;
  onClose: () => void;
  alerts: any[];
  onRefresh: () => void;
  currentUser: any;
  isDarkMode: boolean;
  onTaskDone?: (taskId: string, user: string) => void;
  onTaskReschedule?: (taskId: string, newDate: string, newTime: string, user: string, comment?: string) => void;
  onTaskCancel?: (taskId: string, user: string, comment?: string) => void;
}

export const AlertsReviewModal: React.FC<AlertsReviewModalProps> = ({
  isOpen,
  onClose,
  alerts,
  onRefresh,
  currentUser,
  isDarkMode,
  onTaskDone,
  onTaskReschedule,
  onTaskCancel
}) => {
  const [activeTab, setActiveTab] = useState<'PENDIENTES' | 'HISTORIAL'>('PENDIENTES');
  
  // Real-time asynchronous reactive list state
  const [localAlerts, setLocalAlerts] = useState<any[]>([]);
  // Simulated original alert visual modal trigger state
  const [selectedAlertForView, setSelectedAlertForView] = useState<any | null>(null);

  // Keep local status synchronized with props
  React.useEffect(() => {
    if (alerts) {
      setLocalAlerts(alerts);
    }
  }, [alerts]);

  // Decision capturing states
  const [actionType, setActionType] = useState<{ id: string; type: 'APROBAR' | 'RECHAZAR' } | null>(null);
  const [authorizedByText, setAuthorizedByText] = useState(currentUser?.nombre || '');
  const [decisionReason, setDecisionReason] = useState('');
  const [errorMsg, setErrorMsg] = useState('');

  // Editing alert date and quantity states
  const [editingAlert, setEditingAlert] = useState<any | null>(null);
  const [editDateInput, setEditDateInput] = useState('');
  const [editQtyInput, setEditQtyInput] = useState('');
  const [isSavingEdit, setIsSavingEdit] = useState(false);

  const handleSaveAlertEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingAlert) return;
    setIsSavingEdit(true);
    try {
      const newDate = editDateInput;
      const newQty = parseFloat(editQtyInput) || 0;

      const { error: err1 } = await supabase
        .from('alertas_recepcion')
        .update({
          fecha_vencimiento_llegada: newDate,
          cantidad: newQty
        })
        .eq('id', editingAlert.id);

      if (err1) throw err1;

      try {
        await supabase
          .from('recepcion_productos')
          .update({
            fecha_vencimiento: newDate,
            cantidad: newQty
          })
          .eq('alerta_id', editingAlert.id);
      } catch (errRec) {
        console.warn("No se pudo actualizar recepcion_productos secundariamente:", errRec);
      }

      setLocalAlerts(prev => prev.map(a => a.id === editingAlert.id ? { ...a, fecha_vencimiento_llegada: newDate, cantidad: newQty } : a));
      onRefresh();
      setEditingAlert(null);
    } catch (err: any) {
      console.error("Error al editar alerta:", err);
      alert("Error al guardar los cambios: " + (err.message || 'Error desconocido'));
    } finally {
      setIsSavingEdit(false);
    }
  };

  // Table schema feature detection
  const [hasEstadoCol, setHasEstadoCol] = useState(true);
  const [hasMotivoCol, setHasMotivoCol] = useState(true);
  const [hasFechaDecisionCol, setHasFechaDecisionCol] = useState(true);
  const [hasDecisionPorCol, setHasDecisionPorCol] = useState(true);

  React.useEffect(() => {
    if (!isOpen) return;
    const checkColumns = async () => {
      try {
        const { error: err1 } = await supabase.from('alertas_recepcion').select('estado').limit(1);
        if (err1 && (err1.code === 'PGRST100' || err1.code === 'PGRST204' || err1.message?.includes('estado'))) {
          setHasEstadoCol(false);
        }
        const { error: err2 } = await supabase.from('alertas_recepcion').select('motivo_decision').limit(1);
        if (err2 && (err2.code === 'PGRST100' || err2.code === 'PGRST204' || err2.message?.includes('motivo_decision'))) {
          setHasMotivoCol(false);
        }
        const { error: err3 } = await supabase.from('alertas_recepcion').select('fecha_decision').limit(1);
        if (err3 && (err3.code === 'PGRST100' || err3.code === 'PGRST204' || err3.message?.includes('fecha_decision'))) {
          setHasFechaDecisionCol(false);
        }
        const { error: err4 } = await supabase.from('alertas_recepcion').select('decision_por').limit(1);
        if (err4 && (err4.code === 'PGRST100' || err4.code === 'PGRST204' || err4.message?.includes('decision_por'))) {
          setHasDecisionPorCol(false);
        }
      } catch (e) {
        console.warn("Error checking columns:", e);
      }
    };
    checkColumns();
  }, [isOpen]);

  if (!isOpen) return null;

  const pendingAlerts = localAlerts.filter(a => {
    if (hasEstadoCol && a.estado !== undefined) {
      return a.estado === 'PENDIENTE';
    }
    return !a.recepcionado;
  });

  const processedAlerts = localAlerts.filter(a => {
    if (hasEstadoCol && a.estado !== undefined) {
      return a.estado === 'ACEPTADO' || a.estado === 'RECHAZADO';
    }
    return a.recepcionado;
  });

  // Statistics calculation
  const totalAlerts = localAlerts.length;
  const totalAccepted = localAlerts.filter(a => {
    if (hasEstadoCol && a.estado !== undefined) {
      return a.estado === 'ACEPTADO';
    }
    return a.recepcionado && a.autorizado_por;
  }).length;

  const totalRejected = localAlerts.filter(a => {
    if (hasEstadoCol && a.estado !== undefined) {
      return a.estado === 'RECHAZADO';
    }
    return a.recepcionado && !a.autorizado_por;
  }).length;

  const totalProcessed = totalAccepted + totalRejected;
  const rejectionRate = totalProcessed > 0 ? Math.round((totalRejected / totalProcessed) * 100) : 0;

  // Supplier incident count
  const supplierIncidents: Record<string, number> = {};
  localAlerts.forEach(a => {
    const prov = a.proveedor || 'No especificado';
    supplierIncidents[prov] = (supplierIncidents[prov] || 0) + 1;
  });

  const rankedSuppliers = Object.entries(supplierIncidents)
    .map(([supplier, count]) => ({ supplier, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 5);

  const getAlertVisualColor = (tipo: string) => {
    const norm = (tipo || '').toUpperCase().trim();
    if (norm === 'TAREA_PROGRAMADA') {
      return {
        borderClass: 'border-indigo-600',
        headerBgClass: 'bg-indigo-600',
        badgeClass: 'bg-indigo-800/20 text-indigo-700',
        titleText: 'TAREA DE TURNO PENDIENTE',
        bodyBgClass: 'bg-indigo-50 border-indigo-100 text-indigo-900',
        alertDetailsLabel: 'Instrucciones del Pendiente',
        alertDetailsTextClass: 'text-indigo-700 font-bold',
        vencBlockClass: 'bg-indigo-100 text-indigo-950'
      };
    } else if (norm === 'ROTATION' || norm === 'MALA ROTACION' || norm === 'MALA ROTACIÓN') {
      return {
        borderClass: 'border-red-600',
        headerBgClass: 'bg-red-600',
        badgeClass: 'bg-red-800/20 text-red-700',
        titleText: '¡MALA ROTACIÓN!',
        bodyBgClass: 'bg-red-50 border-red-100 text-red-900',
        alertDetailsLabel: 'Última fecha ingresada (Histórico)',
        alertDetailsTextClass: 'text-red-700',
        vencBlockClass: 'bg-red-100 text-red-900'
      };
    } else if (
      norm === 'OVERSTOCK' || 
      norm === 'SOBRE STOCK' || 
      norm === 'SOBRESTOCK' || 
      norm === 'WEEKLY_OVER_ROTATION' || 
      norm.includes('OVER_ROTATION') || 
      norm.includes('SOBRE')
    ) {
      return {
        borderClass: 'border-[#72B964]',
        headerBgClass: 'bg-[#72B964]',
        badgeClass: 'bg-[#72B964]/20 text-[#72B964]',
        titleText: norm === 'WEEKLY_OVER_ROTATION' ? 'ALERTA POR SOBRE STOCK - REVISAR LA ROTACIÓN Y DIAS DE STOCK' : '¡POSIBLE SOBRE STOCK!',
        bodyBgClass: 'bg-green-50 border-green-100 text-green-900',
        alertDetailsLabel: norm === 'WEEKLY_OVER_ROTATION' ? 'Venta Semanal' : 'Venta Media Histórica',
        alertDetailsTextClass: 'text-[#72B964] font-black',
        vencBlockClass: 'bg-[#72B964]/10 text-green-900'
      };
    } else if (norm === 'TVU_OVER_100' || norm === 'TVU SUPERIOR AL 100%' || norm === 'TVU_OVER_100%' || norm.includes('INCONSISTENCIA')) {
      return {
        borderClass: 'border-blue-600',
        headerBgClass: 'bg-blue-600',
        badgeClass: 'bg-blue-800/20 text-blue-700',
        titleText: 'INCONSISTENCIA DE TVU - REVISARLO CON CALIDAD',
        bodyBgClass: 'bg-blue-50 border-blue-100 text-slate-900',
        alertDetailsLabel: 'Detalle de la Alerta TVU',
        alertDetailsTextClass: 'text-blue-700',
        vencBlockClass: 'bg-blue-100 text-blue-955'
      };
    } else if (norm === 'BOTH' || norm === 'DOBLE') {
      return {
        borderClass: 'border-orange-500',
        headerBgClass: 'bg-orange-500',
        badgeClass: 'bg-orange-850/30 text-white',
        titleText: '¡ALERTA DOBLE!',
        bodyBgClass: 'bg-orange-50 border-orange-100 text-orange-900',
        alertDetailsLabel: 'Detalle de la Alerta Doble',
        alertDetailsTextClass: 'text-orange-700',
        vencBlockClass: 'bg-orange-100 text-orange-950'
      };
    } else {
      // Default to TVM / Other
      return {
        borderClass: 'border-orange-500',
        headerBgClass: 'bg-orange-500',
        badgeClass: 'bg-orange-850/30 text-white',
        titleText: '¡ALERTA DE TVM!',
        bodyBgClass: 'bg-orange-50 border-orange-100 text-orange-900',
        alertDetailsLabel: 'Detalle de la Alerta TVM',
        alertDetailsTextClass: 'text-orange-700',
        vencBlockClass: 'bg-orange-100 text-orange-955'
      };
    }
  };

  const handleApplyDecision = (alertId: string, approved: boolean) => {
    if (approved && !authorizedByText.trim()) {
      setErrorMsg('Debe especificar quién aprueba el ingreso.');
      return;
    }
    if (!approved && !decisionReason.trim()) {
      setErrorMsg('Debe especificar el motivo del rechazo.');
      return;
    }

    setErrorMsg('');

    // Capture decision contexts so they remain consistent when background closures fire
    const authByVal = authorizedByText;
    const reasonVal = decisionReason;
    const currentUserName = currentUser?.nombre || 'Administrador';

    // 1. Instantly transition local state to hide this alert from the pending tab immediately!
    setLocalAlerts(prev => prev.map(a => 
      a.id === alertId 
        ? { 
            ...a, 
            estado: approved ? 'ACEPTADO' : 'RECHAZADO', 
            recepcionado: true,
            decision_por: currentUserName,
            autorizado_por: approved ? authByVal : null,
            motivo_decision: reasonVal,
            fecha_decision: new Date().toISOString()
          } 
        : a
    ));

    // Reset views and triggers immediately to prevent perception of slow saving operations
    setActionType(null);
    setSelectedAlertForView(null);
    setDecisionReason('');

    // 2. Perform database actions asynchronously in the background
    (async () => {
      try {
        const finalStatus = approved ? 'ACEPTADO' : 'RECHAZADO';
        
        const updatePayload: any = {
          autorizado_por: approved ? authByVal : null,
          recepcionado: true
        };

        if (hasEstadoCol) {
          updatePayload.estado = finalStatus;
        }
        if (hasDecisionPorCol) {
          updatePayload.decision_por = currentUserName;
        }
        if (hasMotivoCol) {
          updatePayload.motivo_decision = reasonVal;
        }
        if (hasFechaDecisionCol) {
          updatePayload.fecha_decision = new Date().toISOString();
        }

        // Update the alert record first
        const { error } = await supabase
          .from('alertas_recepcion')
          .update(updatePayload)
          .eq('id', alertId);

        if (error) throw error;

        if (approved) {
          // Let's check for column exists
          let hasAlertaId = true;
          try {
            const { error: alertColErr } = await supabase.from('recepcion_productos').select('alerta_id').limit(1);
            if (alertColErr && (alertColErr.code === 'PGRST100' || alertColErr.message?.includes('alerta_id'))) {
              hasAlertaId = false;
            }
          } catch (e) {
            hasAlertaId = false;
          }

          if (hasAlertaId) {
            // 1. Fetch corresponding pending logs
            const { data: recs, error: fetchError } = await supabase
              .from('recepcion_productos')
              .select('*')
              .eq('alerta_id', alertId);

            if (fetchError) throw fetchError;

            if (recs && recs.length > 0) {
              // 2. Clear block status
              const { error: updateRecError } = await supabase
                .from('recepcion_productos')
                .update({
                  estado: 'ACTIVO',
                  autorizado_por: authByVal,
                  observaciones: reasonVal,
                  verificado_por: currentUserName,
                  fecha_verificacion: new Date().toISOString()
                })
                .eq('alerta_id', alertId);

              if (updateRecError) throw updateRecError;

              // 3. For each physical item registration, finalize the paletas_lpn inventory rows
              for (const rec of recs) {
                const qrCodeUrl = `https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${rec.lpn}`;
                
                const { error: lpnError } = await supabase.from('paletas_lpn').insert([{
                    lpn: rec.lpn,
                    producto_id: rec.producto_id,
                    cantidad_total: rec.cantidad,
                    pallets: rec.pallets || 0,
                    cajas: rec.cajas || 0,
                    unidades: rec.unidades || 0,
                    fecha_vencimiento_critica: rec.fecha_vencimiento,
                    fecha_recepcion: rec.fecha_registro || new Date().toISOString(),
                    recibido_por: rec.usuario_registro,
                    qr_url: qrCodeUrl,
                    es_mixto: false,
                    generado: false,
                    estado: 'ACTIVO',
                    estado_lpn: 'PENDIENTE',
                    sede_id: rec.sede_id,
                    tipo: 'RECEPCION',
                    comentario: reasonVal || rec.conclusiones || null
                }]);
                
                if (lpnError) {
                  console.error(`Error background inserting paletas_lpn for LPN ${rec.lpn}:`, lpnError);
                }
              }
            }
          }
        } else {
          // Rejected flow
          let hasAlertaId = true;
          try {
            const { error: alertColErr } = await supabase.from('recepcion_productos').select('alerta_id').limit(1);
            if (alertColErr && (alertColErr.code === 'PGRST100' || alertColErr.message?.includes('alerta_id'))) {
              hasAlertaId = false;
            }
          } catch (e) {
            hasAlertaId = false;
          }

          if (hasAlertaId) {
            await supabase
              .from('recepcion_productos')
              .update({
                estado: 'RECHAZADO',
                observaciones: reasonVal,
                verificado_por: currentUserName,
                fecha_verificacion: new Date().toISOString()
              })
              .eq('alerta_id', alertId);
          }
        }

        // Silent parent reload to consolidate DB state changes without UI flickering
        onRefresh();
      } catch (err: any) {
        console.error("Background async decision saving error:", err);
      }
    })();
  };

  const formatDateString = (dateStr: string) => {
    if (!dateStr) return '---';
    try {
      const d = new Date(dateStr);
      return d.toLocaleDateString('es-PE', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      });
    } catch {
      return dateStr;
    }
  };

  const formatDate = (dateStr: string) => {
    if (!dateStr) return '---';
    try {
      if (dateStr.includes('-') && dateStr.length === 10) {
        const [year, month, day] = dateStr.split('-');
        return `${day}/${month}/${year}`;
      }
      const d = new Date(dateStr);
      return d.toLocaleDateString('es-PE', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric'
      });
    } catch {
      return dateStr;
    }
  };

  const alertBadgeType = (type: string) => {
    switch (type.toUpperCase()) {
      case 'TVM':
      case 'TVU':
        return 'bg-amber-100 text-amber-700 border-amber-200';
      case 'ROTACION':
        return 'bg-rose-100 text-rose-700 border-rose-200';
      case 'OVERSTOCK':
      case 'TVU_OVER_100':
        return 'bg-blue-100 text-blue-700 border-blue-200';
      default:
        return 'bg-slate-100 text-slate-700 border-slate-200';
    }
  };

  return (
    <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[99] flex items-center justify-center p-0 md:p-3">
      <div className={`w-full max-w-none md:max-w-[98%] h-full md:h-[96vh] max-h-screen md:max-h-[96vh] rounded-none md:rounded-3xl ${isDarkMode ? 'bg-slate-900 border border-slate-800 text-white' : 'bg-white text-slate-800'} shadow-2xl flex flex-col overflow-hidden animate-in fade-in zoom-in duration-250`}>

        
        {/* Header */}
        <div className="p-6 border-b border-slate-100 flex items-center justify-between bg-gradient-to-tr from-rose-500 to-red-600 text-white">
          <div className="flex items-center gap-3">
            <div className="bg-white/20 p-2 rounded-2xl">
              <AlertTriangle className="w-6 h-6 text-white animate-pulse" />
            </div>
            <div>
              <h2 className="text-xl font-black uppercase tracking-tight">CONTROL DE ALERTAS - ICO LOGISTICA</h2>
              <p className="text-xs text-white/80 font-medium font-semibold">Revisión y aprobación de recepciones con corta vida útil, mala rotación o sobrestock</p>
            </div>
          </div>
          <button 
            onClick={onClose}
            className="p-2 rounded-xl bg-white/10 hover:bg-white/20 transition-all text-white active:scale-95"
          >
            <XCircle className="w-6 h-6" />
          </button>
        </div>

        {/* Navigation Tabs */}
        <div className="flex border-b border-slate-200 px-6 pt-2 bg-slate-50 gap-4">
          <button
            onClick={() => { setActiveTab('PENDIENTES'); setActionType(null); }}
            className={`py-3 text-xs font-black uppercase tracking-wider relative transition-all ${
              activeTab === 'PENDIENTES' 
                ? 'text-red-600 font-bold border-b-2 border-red-600' 
                : 'text-slate-400 hover:text-slate-600'
            }`}
          >
            Alertas Pendientes ({pendingAlerts.length})
          </button>
          <button
            onClick={() => { setActiveTab('HISTORIAL'); setActionType(null); }}
            className={`py-3 text-xs font-black uppercase tracking-wider relative transition-all ${
              activeTab === 'HISTORIAL' 
                ? 'text-red-500 font-bold border-b-2 border-red-500' 
                : 'text-slate-400 hover:text-slate-600'
            }`}
          >
            Auditoría y Estadísticas ({processedAlerts.length})
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-6 bg-slate-50">
          {errorMsg && (
            <div className="mb-4 p-4 bg-red-50 border border-red-200 text-red-700 text-xs font-bold rounded-2xl flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-red-600 shrink-0" />
              <span>{errorMsg}</span>
            </div>
          )}

          {activeTab === 'PENDIENTES' ? (
            pendingAlerts.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 px-4 text-center bg-white rounded-3xl border border-slate-100 shadow-sm">
                <div className="p-4 bg-emerald-50 rounded-full mb-4">
                  <CheckCircle2 className="w-12 h-12 text-emerald-500" />
                </div>
                <h3 className="text-base font-black text-slate-800">¡Todo al día!</h3>
                <p className="text-slate-500 text-xs mt-1 max-w-sm">No existen alertas de recepción pendientes de autorización por los asistentes o administradores.</p>
              </div>
            ) : (
              <div className="space-y-4">
                {/* TABLA DE ALERTAS PENDIENTES */}
                <div className="bg-white rounded-3xl border border-slate-200/60 shadow-sm overflow-hidden animate-in fade-in duration-300">
                  <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse text-xs">
                      <thead>
                        <tr className="bg-slate-100/75 border-b border-slate-200/60 text-slate-500 font-extrabold uppercase tracking-wider text-[10px]">
                          <th className="py-4 px-4 font-black">Fecha / Hora</th>
                          <th className="py-4 px-4 font-black">Operador</th>
                          <th className="py-4 px-4 font-black">Producto</th>
                          <th className="py-4 px-4 font-black">Alerta</th>
                          <th className="py-4 px-4 font-black">Detalle Alerta</th>
                          <th className="py-4 px-4 font-black text-center">Cant / Guía</th>
                          <th className="py-4 px-4 font-black text-center">Vista</th>
                          <th className="py-4 px-4 font-black text-right">Acción</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 text-slate-700">
                        {pendingAlerts.map((alert) => {
                          if (alert.isTask) {
                            return (
                              <tr key={alert.id} className="hover:bg-indigo-50/10 transition-colors">
                                <td className="py-3 px-4 font-semibold text-[11px] text-slate-500 whitespace-nowrap">
                                  <div className="flex items-center gap-1.5">
                                    <Calendar className="w-3.5 h-3.5 text-indigo-500 shrink-0" />
                                    {formatDateString(alert.fecha_alerta)}
                                  </div>
                                </td>
                                <td className="py-3 px-4 font-bold text-slate-600 whitespace-nowrap">
                                  <div className="max-w-[125px] truncate text-[11px]" title={alert.usuario_registro}>
                                    {alert.usuario_registro || 'Orquestador'}
                                  </div>
                                </td>
                                <td className="py-3 px-4">
                                  <div className="max-w-[180px] md:max-w-[240px]">
                                    <span className="font-extrabold text-indigo-900 dark:text-indigo-400 text-[11px] block leading-tight truncate" title={alert.nombre}>
                                      📌 TAREA: {alert.nombre}
                                    </span>
                                    <div className="text-[10px] text-slate-400 font-semibold flex items-center gap-1.5 mt-0.5 whitespace-nowrap">
                                      <span>Prioridad: {alert.taskOriginal?.priority || 'MEDIA'}</span>
                                    </div>
                                  </div>
                                </td>
                                <td className="py-3 px-4 whitespace-nowrap">
                                  <span className="px-2 py-0.5 text-[9px] font-black rounded-md uppercase tracking-tight border bg-indigo-50 text-indigo-700 border-indigo-200">
                                    TAREA PROGRAMADA
                                  </span>
                                </td>
                                <td className="py-3 px-4">
                                  <div className="max-w-[150px] font-extrabold text-slate-700 dark:text-slate-300 text-[11px] leading-tight truncate" title={alert.valor_alerta}>
                                    {alert.valor_alerta}
                                  </div>
                                </td>
                                <td className="py-3 px-4 text-center whitespace-nowrap">
                                  {alert.photos && alert.photos.length > 0 ? (
                                    <span className="text-[10px] bg-slate-50 text-slate-600 px-2 py-0.5 rounded font-black border border-slate-200">
                                      📷 {alert.photos.length} foto(s)
                                    </span>
                                  ) : (
                                    <span className="text-[10px] text-slate-400 font-bold">Sin fotos</span>
                                  )}
                                </td>
                                <td className="py-3 px-4 text-center whitespace-nowrap">
                                  <button
                                    type="button"
                                    onClick={() => setSelectedAlertForView(alert)}
                                    className="p-1.5 bg-indigo-50 hover:bg-indigo-100 text-indigo-600 rounded-xl transition-all hover:scale-105 active:scale-95 cursor-pointer inline-flex items-center gap-1 font-extrabold text-[10px]"
                                  >
                                    <Eye className="w-3.5 h-3.5" />
                                    <span>Ver Tarea</span>
                                  </button>
                                </td>
                                <td className="py-3 px-4 text-right whitespace-nowrap">
                                  <div className="flex justify-end gap-1.5">
                                    <button
                                      type="button"
                                      onClick={() => {
                                        if (onTaskDone) {
                                          onTaskDone(alert.id, currentUser?.nombre || 'Usuario');
                                        }
                                      }}
                                      className="px-2.5 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white text-[10px] font-black uppercase tracking-tight rounded-lg flex items-center gap-1 shadow-sm transition-all active:scale-95 cursor-pointer font-bold"
                                    >
                                      <Check className="w-3 h-3" />
                                      Hecho
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => {
                                        const newDate = prompt("Nueva fecha (YYYY-MM-DD):", alert.taskOriginal?.scheduledDate || new Date().toISOString().split('T')[0]);
                                        const newTime = prompt("Nueva hora (HH:MM:SS):", alert.taskOriginal?.alertTime || "12:00:00");
                                        if (newDate && newTime && onTaskReschedule) {
                                          onTaskReschedule(alert.id, newDate, newTime, currentUser?.nombre || 'Usuario', "Reprogramado desde Alertas");
                                        }
                                      }}
                                      className="px-2.5 py-1.5 bg-amber-500 hover:bg-amber-600 text-white text-[10px] font-black uppercase tracking-tight rounded-lg flex items-center gap-1 shadow-sm transition-all active:scale-95 cursor-pointer font-bold"
                                    >
                                      <RefreshCw className="w-3 h-3" />
                                      Reprog
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => {
                                        const reason = prompt("Motivo de cancelación:");
                                        if (reason !== null && onTaskCancel) {
                                          onTaskCancel(alert.id, currentUser?.nombre || 'Usuario', reason);
                                        }
                                      }}
                                      className="px-2.5 py-1.5 bg-red-600 hover:bg-red-700 text-white text-[10px] font-black uppercase tracking-tight rounded-lg flex items-center gap-1 shadow-sm transition-all active:scale-95 cursor-pointer font-bold"
                                    >
                                      <Ban className="w-3 h-3" />
                                      Cancelar
                                    </button>
                                  </div>
                                </td>
                              </tr>
                            );
                          }

                          return (
                            <tr key={alert.id} className="hover:bg-slate-50/50 transition-colors">
                            <td className="py-3 px-4 font-semibold text-[11px] text-slate-500 whitespace-nowrap">
                              <div className="flex items-center gap-1.5">
                                <Calendar className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                                {formatDateString(alert.fecha_alerta)}
                              </div>
                            </td>
                            <td className="py-3 px-4 font-bold text-slate-600 whitespace-nowrap">
                              <div className="max-w-[125px] truncate text-[11px]" title={alert.usuario_registro}>
                                {alert.usuario_registro || 'Desconocido'}
                              </div>
                            </td>
                            <td className="py-3 px-4">
                              <div className="max-w-[180px] md:max-w-[240px]">
                                <span className="font-extrabold text-slate-800 text-[11px] block leading-tight truncate" title={alert.nombre}>
                                  {alert.nombre}
                                </span>
                                <div className="text-[10px] text-slate-400 font-semibold flex items-center gap-1.5 mt-0.5 whitespace-nowrap">
                                  <span>SKU: {alert.codigo}</span>
                                  {alert.proveedor && (
                                    <>
                                      <span>•</span>
                                      <span className="truncate max-w-[80px]">Prov: {alert.proveedor}</span>
                                    </>
                                  )}
                                </div>
                              </div>
                            </td>
                            <td className="py-3 px-4 whitespace-nowrap">
                              <span className={`px-2 py-0.5 text-[9px] font-black rounded-md uppercase tracking-tight border ${alertBadgeType(alert.tipo_alerta)}`}>
                                {alert.tipo_alerta}
                              </span>
                            </td>
                            <td className="py-3 px-4">
                              <div className="max-w-[150px] font-extrabold text-red-500 text-[11px] leading-tight truncate" title={alert.valor_alerta}>
                                {alert.valor_alerta}
                              </div>
                            </td>
                            <td className="py-3 px-4 text-center whitespace-nowrap">
                              <div className="inline-flex flex-col items-center">
                                {alert.cantidad ? (
                                  <span className="text-[10px] bg-indigo-50 text-indigo-700 px-2 py-0.5 rounded font-black border border-indigo-100">
                                    {alert.cantidad} un.
                                  </span>
                                ) : (
                                  <span className="text-[10px] text-slate-400 font-bold">---</span>
                                )}
                                {alert.guia_factura && (
                                  <span className="text-[9px] text-slate-400 font-bold max-w-[80px] truncate block" title={alert.guia_factura}>
                                    {alert.guia_factura}
                                  </span>
                                )}
                              </div>
                            </td>
                            <td className="py-3 px-4 text-center whitespace-nowrap">
                              <button
                                type="button"
                                onClick={() => setSelectedAlertForView(alert)}
                                className="p-1.5 bg-indigo-50 hover:bg-indigo-100 text-indigo-600 rounded-xl transition-all hover:scale-105 active:scale-95 cursor-pointer inline-flex items-center gap-1 font-extrabold text-[10px]"
                                title="Ver formato original de la alerta"
                              >
                                <Eye className="w-3.5 h-3.5" />
                                <span>Ver Alerta</span>
                              </button>
                            </td>
                            <td className="py-3 px-4 text-right whitespace-nowrap">
                              <div className="flex justify-end gap-1.55">
                                <button
                                  type="button"
                                  onClick={() => {
                                    setEditingAlert(alert);
                                    const v = alert.fecha_vencimiento_llegada || '';
                                    const localVal = v.includes('T') ? v.split('T')[0] : v;
                                    setEditDateInput(localVal);
                                    setEditQtyInput(alert.cantidad !== undefined && alert.cantidad !== null ? String(alert.cantidad) : '0');
                                  }}
                                  className="px-2.5 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-[10px] font-black uppercase tracking-tight rounded-lg flex items-center gap-1 shadow-sm transition-all active:scale-95 cursor-pointer font-bold"
                                  title="Editar fecha de vencimiento y cantidad"
                                >
                                  ✏️ Editar
                                </button>
                                <button
                                  type="button"
                                  onClick={() => {
                                    setActionType({ id: alert.id, type: 'APROBAR' });
                                    setAuthorizedByText('COMPRAS');
                                    setDecisionReason('');
                                  }}
                                  className="px-2.5 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white text-[10px] font-black uppercase tracking-tight rounded-lg flex items-center gap-1 shadow-sm transition-all active:scale-95 cursor-pointer font-bold"
                                >
                                  <Check className="w-3 h-3" />
                                  Aceptar
                                </button>
                                <button
                                  type="button"
                                  onClick={() => {
                                    setActionType({ id: alert.id, type: 'RECHAZAR' });
                                    setAuthorizedByText('');
                                    setDecisionReason('');
                                  }}
                                  className="px-2.5 py-1.5 bg-red-600 hover:bg-red-700 text-white text-[10px] font-black uppercase tracking-tight rounded-lg flex items-center gap-1 shadow-sm transition-all active:scale-95 cursor-pointer font-bold"
                                >
                                  <Ban className="w-3 h-3" />
                                  Rechazar
                                </button>
                              </div>
                            </td>
                          </tr>
                        );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            )
          ) : (
            <div className="space-y-6">
              {/* KPIS row */}
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                <div className="p-4 bg-white border border-slate-100 rounded-3xl shadow-sm text-center">
                  <div className="text-[10px] text-slate-400 font-black uppercase tracking-wider">Total Alertas</div>
                  <div className="text-2xl font-black text-rose-600 mt-1">{totalAlerts}</div>
                </div>
                <div className="p-4 bg-white border border-slate-100 rounded-3xl shadow-sm text-center">
                  <div className="text-[10px] text-slate-400 font-black uppercase tracking-wider">Ingresos Aceptados</div>
                  <div className="text-2xl font-black text-emerald-600 mt-1">{totalAccepted}</div>
                </div>
                <div className="p-4 bg-white border border-slate-100 rounded-3xl shadow-sm text-center">
                  <div className="text-[10px] text-slate-400 font-black uppercase tracking-wider">Ingresos Rechazados</div>
                  <div className="text-2xl font-black text-red-600 mt-1">{totalRejected}</div>
                </div>
                <div className="p-4 bg-white border border-slate-100 rounded-3xl shadow-sm text-center">
                  <div className="text-[10px] text-slate-400 font-black uppercase tracking-wider">Tasa de Rechazo</div>
                  <div className="text-2xl font-black text-indigo-600 mt-1">{rejectionRate}%</div>
                </div>
              </div>

              {/* Statistics Details Area */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                
                {/* Ranking of providers with issues */}
                <div className="p-5 bg-white border border-slate-100 rounded-3xl shadow-sm space-y-4">
                  <h4 className="text-xs font-black uppercase tracking-wider text-slate-500 flex items-center gap-1.5">
                    <Award className="w-4 h-4 text-rose-500" />
                    Proveedores con más incidencias
                  </h4>

                  {rankedSuppliers.length === 0 ? (
                    <div className="text-slate-400 text-xs py-4 text-center font-bold">Sin datos de proveedores</div>
                  ) : (
                    <div className="space-y-3">
                      {rankedSuppliers.map((rs, i) => (
                        <div key={i} className="flex justify-between items-center text-xs border-b border-slate-100 pb-2">
                          <span className="font-extrabold text-slate-700 truncate max-w-[140px]">{rs.supplier}</span>
                          <span className="bg-red-50 text-red-700 font-extrabold px-2.5 py-1 rounded-lg">
                            {rs.count} {rs.count === 1 ? 'incidencia' : 'incidencias'}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Audit table history logic */}
                <div className="col-span-1 md:col-span-2 p-5 bg-white border border-slate-100 rounded-3xl shadow-sm space-y-4">
                  <h4 className="text-xs font-black uppercase tracking-wider text-slate-500 flex items-center gap-1.5">
                    <Layers className="w-4 h-4 text-indigo-500" />
                    Bitácora de Decisiones Solucionadas
                  </h4>

                  {processedAlerts.length === 0 ? (
                    <div className="text-slate-400 text-xs py-8 text-center font-bold">No hay registros procesados de auditoría.</div>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full text-left border-collapse text-xs">
                        <thead>
                          <tr className="border-b border-slate-100 text-slate-400 font-extrabold">
                            <th className="py-2 font-black">Fecha</th>
                            <th className="py-2 font-black">Producto</th>
                            <th className="py-2 font-black">Estado</th>
                            <th className="py-2 font-black flex items-center gap-1">Decidido Por</th>
                            <th className="py-2 font-black">Justificación / Motivo</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 text-slate-705">
                          {processedAlerts.slice(0, 10).map((alert) => {
                            if (alert.isTask) {
                              return (
                                <tr key={alert.id} className="hover:bg-indigo-50/10">
                                  <td className="py-2.5 font-semibold text-[11px] whitespace-nowrap text-slate-500">
                                    {formatDateString(alert.taskOriginal?.completedAt || alert.taskOriginal?.canceledAt || alert.fecha_alerta)}
                                  </td>
                                  <td className="py-2.5 max-w-[120px] truncate flex flex-col">
                                    <span className="font-black block text-indigo-950 truncate">📌 TAREA: {alert.nombre}</span>
                                    <span className="text-[10px] text-slate-400 font-semibold">Prioridad: {alert.taskOriginal?.priority}</span>
                                  </td>
                                  <td className="py-2.5">
                                    <span className={`px-1.5 py-0.5 rounded-md font-black text-[9px] uppercase ${
                                      alert.taskOriginal?.status === 'REALIZADO' 
                                        ? 'bg-emerald-50 text-emerald-750 text-emerald-700 border border-emerald-100' 
                                        : 'bg-red-50 text-red-750 text-red-700 border border-red-100'
                                    }`}>
                                      {alert.taskOriginal?.status === 'REALIZADO' ? 'HECHO' : 'CANCELADA'}
                                    </span>
                                  </td>
                                  <td className="py-2.5 font-bold text-slate-700">
                                    <div>{alert.taskOriginal?.completedBy || alert.taskOriginal?.canceledBy || '---'}</div>
                                  </td>
                                  <td className="py-2.5 italic text-slate-500 max-w-[160px] truncate" title={alert.valor_alerta}>
                                    {alert.taskOriginal?.status === 'REALIZADO' ? 'Completado exitosamente' : 'Cancelado.'}
                                  </td>
                                </tr>
                              );
                            }
                            return (
                              <tr key={alert.id} className="hover:bg-slate-50/50">
                              <td className="py-2.5 font-semibold text-[11px] whitespace-nowrap">
                                {formatDateString(alert.fecha_decision || alert.fecha_alerta)}
                              </td>
                              <td className="py-2.5 max-w-[120px] truncate flex flex-col">
                                <span className="font-black block text-slate-800 truncate">{alert.nombre}</span>
                                <span className="text-[10px] text-slate-400 font-semibold">SKU: {alert.codigo}</span>
                              </td>
                              <td className="py-2.5">
                                <span className={`px-1.5 py-0.5 rounded-md font-black text-[9px] uppercase ${
                                  alert.estado === 'ACEPTADO' 
                                    ? 'bg-emerald-50 text-emerald-700 border border-emerald-100' 
                                    : 'bg-red-50 text-red-700 border border-red-100'
                                }`}>
                                  {alert.estado}
                                </span>
                              </td>
                              <td className="py-2.5 font-bold">
                                <div>{alert.decision_por || '---'}</div>
                                {alert.autorizado_por && (
                                  <div className="text-[10px] text-slate-400 font-semibold">Aut: {alert.autorizado_por}</div>
                                )}
                              </td>
                              <td className="py-2.5 italic text-slate-505 max-w-[160px] truncate" title={alert.motivo_decision}>
                                {alert.motivo_decision || '---'}
                              </td>
                            </tr>
                          );
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>

              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-slate-200/60 bg-slate-50 flex justify-end">
          <button
            onClick={onClose}
            className="px-6 py-2.5 bg-slate-200 hover:bg-slate-300 transition-colors text-slate-705 text-xs font-black uppercase tracking-wider rounded-xl active:scale-95 cursor-pointer"
          >
            Cerrar Ventana
          </button>
        </div>

      </div>

      {/* SUB-MODAL: Replica exacta del formato visual de alertas de recepción */}
      {selectedAlertForView && (() => {
        if (selectedAlertForView.isTask) {
          const task = selectedAlertForView.taskOriginal;
          return (
            <div className="fixed inset-0 z-[150] bg-black/80 backdrop-blur-md flex justify-center items-center p-4">
              <div className="bg-white rounded-3xl shadow-2xl w-full max-w-sm overflow-hidden border-4 border-indigo-600 animate-in zoom-in-95 duration-200 text-slate-800">
                
                <div className="bg-indigo-600 p-5 text-white text-center">
                  <Bell className="w-12 h-12 mx-auto mb-2 animate-bounce" />
                  <h2 className="text-sm font-black uppercase tracking-tight leading-tight">
                    {task.title}
                  </h2>
                  <p className="text-[10px] font-black opacity-90 mt-1.5 uppercase tracking-widest bg-indigo-800/40 py-1 px-3 rounded-full inline-block">
                    TAREA PROGRAMADA
                  </p>
                </div>

                <div className="p-5 space-y-4 max-h-[70vh] overflow-y-auto">
                  <div className="bg-slate-50 border border-slate-200/60 rounded-xl p-3 space-y-2 text-xs">
                    <p className="text-slate-500 font-bold uppercase tracking-wider text-[9px]">Instrucciones / Detalles:</p>
                    <p className="font-extrabold text-slate-800 leading-relaxed text-xs">{task.description}</p>
                    
                    <div className="pt-2 border-t border-slate-200/50 space-y-1">
                      <div className="flex justify-between items-center">
                        <span className="text-slate-400 text-[9px] font-bold uppercase">Día Alerta:</span>
                        <span className="font-extrabold text-slate-700">{task.scheduledDate}</span>
                      </div>
                      <div className="flex justify-between items-center">
                        <span className="text-slate-400 text-[9px] font-bold uppercase">Hora Alerta:</span>
                        <span className="font-black text-indigo-600">{task.alertTime}</span>
                      </div>
                      <div className="flex justify-between items-center">
                        <span className="text-slate-400 text-[9px] font-bold uppercase">Programó:</span>
                        <span className="font-extrabold text-slate-600">{task.createdBy}</span>
                      </div>
                    </div>
                  </div>

                  {task.photos && task.photos.length > 0 && (
                    <div className="space-y-1">
                      <p className="text-slate-400 text-[9px] font-bold uppercase">Evidencia Fotográfica:</p>
                      <div className="flex gap-2 overflow-x-auto pb-1">
                        {task.photos.map((p: string, idx: number) => (
                          <img key={idx} src={p} className="w-14 h-14 rounded-xl object-cover border" />
                        ))}
                      </div>
                    </div>
                  )}

                  {task.history && task.history.length > 0 && (
                    <div className="space-y-1.5">
                      <p className="text-slate-400 text-[9px] font-bold uppercase">Historial de Operaciones:</p>
                      <div className="space-y-1.5 max-h-32 overflow-y-auto border border-slate-100 p-2.5 bg-slate-50 rounded-xl">
                        {task.history.map((h: any, idx: number) => (
                          <div key={idx} className="text-[10px] border-b border-slate-100 last:border-0 pb-1 last:pb-0">
                            <div className="flex justify-between font-black text-slate-505 text-[8px]">
                              <span>{h.action}</span>
                              <span>{new Date(h.timestamp).toLocaleTimeString()}</span>
                            </div>
                            <p className="text-slate-600 font-medium">Por <strong>{h.user}</strong>: {h.comment || 'Sin obs'}</p>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {task.status === 'PENDIENTE' && (
                    <div className="flex gap-2 pt-1 border-t border-slate-100">
                      <button
                        type="button"
                        onClick={() => {
                          if (onTaskDone) {
                            onTaskDone(task.id, currentUser?.nombre || 'Usuario');
                          }
                          setSelectedAlertForView(null);
                        }}
                        className="flex-1 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-black text-xs uppercase rounded-xl transition-all shadow-md flex items-center justify-center gap-1 cursor-pointer active:scale-95"
                      >
                        <Check className="w-3.5 h-3.5" />
                        Hecho
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          const newDate = prompt("Nueva fecha (YYYY-MM-DD):", task.scheduledDate);
                          const newTime = prompt("Nueva hora (HH:MM:SS):", task.alertTime);
                          if (newDate && newTime && onTaskReschedule) {
                            onTaskReschedule(task.id, newDate, newTime, currentUser?.nombre || 'Usuario', "Reprogramado desde Alertas");
                            setSelectedAlertForView(null);
                          }
                        }}
                        className="flex-1 py-2 bg-amber-500 hover:bg-amber-600 text-white font-black text-xs uppercase rounded-xl transition-all shadow-md flex items-center justify-center gap-1 cursor-pointer active:scale-95"
                      >
                        <RefreshCw className="w-3.5 h-3.5" />
                        Reprog
                      </button>
                    </div>
                  )}

                  <button 
                    type="button"
                    onClick={() => setSelectedAlertForView(null)}
                    className="w-full py-2 bg-slate-100 text-slate-600 font-bold rounded-xl hover:bg-slate-200 transition-all uppercase text-[10px] tracking-wider cursor-pointer"
                  >
                    Cerrar Tarea
                  </button>
                </div>
              </div>
            </div>
          );
        }

        const alertConfig = getAlertVisualColor(selectedAlertForView.tipo_alerta);
        return (
          <div className="fixed inset-0 z-[150] bg-black/80 backdrop-blur-md flex justify-center items-center p-4">
            <div className={`bg-white rounded-3xl shadow-2xl w-full max-w-sm overflow-hidden border-4 ${alertConfig.borderClass} animate-in zoom-in-95 duration-200 text-slate-800`}>
              
              <div className={`${alertConfig.headerBgClass} p-5 text-white text-center`}>
                <AlertTriangle className="w-12 h-12 mx-auto mb-2 animate-bounce" />
                <h2 className="text-sm font-black uppercase tracking-tight leading-tight">
                  {selectedAlertForView.codigo} - {selectedAlertForView.nombre}
                </h2>
                <p className="text-[10px] font-black opacity-90 mt-1.5 uppercase tracking-widest bg-black/20 py-1 px-3 rounded-full inline-block">
                  {alertConfig.titleText}
                </p>
              </div>

              <div className="p-5 space-y-4">
                <div className="bg-slate-50 border border-slate-200/60 rounded-xl p-3 space-y-2">
                  <div className="flex justify-between items-center text-xs">
                    <span className="text-slate-500 font-bold uppercase tracking-wider text-[9px]">Cant. que está llegando:</span>
                    <span className="text-slate-950 font-black text-sm bg-indigo-50 text-indigo-700 px-2.5 py-0.5 rounded-lg border border-indigo-100">{selectedAlertForView.cantidad || '---'} UNIDADES</span>
                  </div>
                  <div className="flex justify-between items-center text-xs pt-2 border-t border-slate-200/60">
                    <span className="text-slate-500 font-bold uppercase tracking-wider text-[9px]">Rte (Proveedor):</span>
                    <span className="text-slate-950 font-black uppercase tracking-tight truncate max-w-[170px]" title={selectedAlertForView.proveedor}>
                      {selectedAlertForView.proveedor || 'Sin especificar'}
                    </span>
                  </div>
                  {selectedAlertForView.guia_factura && (
                    <div className="flex justify-between items-center text-xs pt-1">
                      <span className="text-slate-500 font-bold uppercase tracking-wider text-[9px]">GUÍA/FACTURA:</span>
                      <span className="text-slate-950 font-black uppercase tracking-tight">{selectedAlertForView.guia_factura}</span>
                    </div>
                  )}
                </div>

                {/* Warnings details inside replica format */}
                <div className={`${alertConfig.bodyBgClass} p-4 rounded-xl border text-center space-y-2.5`}>
                  {(() => {
                    const normType = (selectedAlertForView.tipo_alerta || '').toUpperCase().trim();
                    const isTvuSpecific = normType === 'TVM' || normType === 'TVU_OVER_100' || normType === 'BOTH' || normType === 'DOBLE' || normType.includes('TVU') || normType.includes('TVM') || normType.includes('INCONSISTENCIA');
                    
                    if (isTvuSpecific) {
                      const { tvuPercentage, tvmDays, tvuDays } = parseTvuAlertDetails(
                        selectedAlertForView.valor_alerta || '',
                        selectedAlertForView.fecha_vencimiento_llegada,
                        selectedAlertForView.fecha_alerta
                      );
                      const isOver100 = normType === 'TVU_OVER_100' || normType.includes('INCONSISTENCIA') || normType.includes('100');
                      
                      return (
                        <>
                          <p className={`text-[10px] font-black uppercase tracking-wider ${isOver100 ? 'text-blue-900' : 'text-orange-950'}`}>
                            {alertConfig.alertDetailsLabel}
                          </p>
                          <div className={`grid grid-cols-3 gap-2 border-t border-b ${isOver100 ? 'border-blue-200/50' : 'border-orange-200/50'} py-2.5 my-1 text-left`}>
                            <div className="text-center w-full">
                              <p className="text-[9px] text-slate-500 font-bold uppercase truncate">TVM</p>
                              <p className={`text-xs md:text-sm font-black ${isOver100 ? 'text-blue-700' : 'text-orange-700'}`}>{tvmDays}</p>
                            </div>
                            <div className={`text-center border-l border-r ${isOver100 ? 'border-blue-200/50' : 'border-orange-200/50'} w-full`}>
                              <p className="text-[9px] text-slate-500 font-bold uppercase truncate">% tvu Recepción hoy</p>
                              <p className={`text-xs md:text-sm font-black ${isOver100 ? 'text-blue-700' : 'text-orange-700'}`}>{tvuPercentage}</p>
                            </div>
                            <div className="text-center w-full">
                              <p className="text-[9px] text-slate-500 font-bold uppercase truncate">DIAS TVU Recepción hoy</p>
                              <p className={`text-xs md:text-sm font-black ${isOver100 ? 'text-blue-700' : 'text-orange-700'}`}>{tvuDays}</p>
                            </div>
                          </div>
                        </>
                      );
                    } else {
                      return (
                        <div>
                          <p className="text-gray-500 text-[10px] font-bold uppercase mb-0.5">{alertConfig.alertDetailsLabel}</p>
                          <p className={`text-xs font-bold ${alertConfig.alertDetailsTextClass}`}>{selectedAlertForView.valor_alerta || '---'}</p>
                        </div>
                      );
                    }
                  })()}
                  {selectedAlertForView.fecha_vencimiento_llegada && (
                    <div className="pt-2 border-t border-slate-200/40">
                      <p className="text-slate-500 text-[10px] font-bold uppercase tracking-wider mb-0.5">
                        Fecha Vencimiento Registrada:
                      </p>
                      <span className={`text-sm block font-black py-1 rounded-lg ${alertConfig.vencBlockClass}`}>
                        {formatDate(selectedAlertForView.fecha_vencimiento_llegada)}
                      </span>
                    </div>
                  )}
                </div>

                <div className="text-[10px] text-slate-400 text-center font-bold">
                  REGISTRADO POR: <span className="text-slate-600 uppercase font-black">{selectedAlertForView.usuario_registro || 'Desconocido'}</span>
                </div>

                {/* Decision makers shortcut inside alert view */}
                <div className="flex gap-2 pt-1 border-t border-slate-100">
                  <button
                    type="button"
                    onClick={() => {
                      setActionType({ id: selectedAlertForView.id, type: 'APROBAR' });
                      setAuthorizedByText('COMPRAS');
                      setDecisionReason('');
                    }}
                    className="flex-1 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white font-black text-xs uppercase tracking-wider rounded-xl transition-all shadow-md flex items-center justify-center gap-1 cursor-pointer active:scale-95"
                  >
                    <Check className="w-4 h-4" />
                    Aceptar
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setActionType({ id: selectedAlertForView.id, type: 'RECHAZAR' });
                      setAuthorizedByText('');
                      setDecisionReason('');
                    }}
                    className="flex-1 py-2.5 bg-red-650 hover:bg-red-750 text-white font-black text-xs uppercase tracking-wider rounded-xl transition-all shadow-md flex items-center justify-center gap-1 cursor-pointer active:scale-95 bg-red-600 hover:bg-red-700"
                  >
                    <Ban className="w-4 h-4" />
                    Rechazar
                  </button>
                </div>

                <button 
                  type="button"
                  onClick={() => setSelectedAlertForView(null)}
                  className="w-full py-2 bg-slate-100 text-slate-450 font-bold rounded-xl hover:bg-slate-200 transition-all uppercase text-[10px] tracking-wider cursor-pointer"
                >
                  Cerrar Alerta
                </button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* FORMULARIO DE DECISIÓN DE ACCIÓN EMITIDA (ASÍNCRONO) */}
      {actionType && (
        <div className="fixed inset-0 z-[160] bg-black/60 backdrop-blur-sm flex justify-center items-center p-4 text-slate-800">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-sm overflow-hidden p-6 space-y-4 border border-slate-100">
            <h3 className="text-xs font-black uppercase text-slate-800 border-b pb-2 flex items-center gap-1.5">
              <AlertTriangle className="w-5 h-5 text-amber-500 animate-bounce" />
              {actionType.type === 'APROBAR' ? 'Autorizar Ingreso con Alerta' : 'Rechazar Ingreso'}
            </h3>

            {actionType.type === 'APROBAR' && (
              <div className="space-y-1">
                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">¿Quién autoriza?*</label>
                <select 
                  value={authorizedByText}
                  onChange={(e) => setAuthorizedByText(e.target.value)}
                  className="w-full px-3 py-2.5 bg-slate-100 border border-slate-200 rounded-xl text-xs font-black uppercase tracking-tight focus:border-red-500 outline-none"
                >
                  <option value="COMPRAS">COMPRAS</option>
                  <option value="COMERCIA">COMERCIA</option>
                  <option value="ALMACEN">ALMACEN</option>
                  <option value="GERENCIA">GERENCIA</option>
                </select>
              </div>
            )}

            <div className="space-y-1">
              <label className="text-[10px] font-bold text-slate-400 uppercase block">
                {actionType.type === 'APROBAR' ? 'Justificación / Comentario Comercial:' : 'Motivo del Rechazo:*'}
              </label>
              <textarea
                rows={3}
                value={decisionReason}
                onChange={(e) => setDecisionReason(e.target.value)}
                className="w-full px-3 py-2.5 bg-slate-100 border border-slate-200 rounded-xl text-xs font-bold focus:border-red-500 outline-none resize-none text-slate-800"
                placeholder={actionType.type === 'APROBAR' ? 'Ej. Se aprueba por compromiso comercial...' : 'Ej. Fecha nueva sumamente corta...'}
              />
            </div>

            <div className="flex gap-2 pt-2">
              <button
                type="button"
                onClick={() => {
                  handleApplyDecision(actionType.id, actionType.type === 'APROBAR');
                }}
                className={`flex-1 py-3 text-xs font-black text-white rounded-xl shadow-md transition-all uppercase cursor-pointer active:scale-[0.97] ${
                  actionType.type === 'APROBAR' 
                    ? 'bg-emerald-600 hover:bg-emerald-700 shadow-emerald-250' 
                    : 'bg-red-600 hover:bg-red-700'
                }`}
              >
                Confirmar
              </button>
              <button
                type="button"
                onClick={() => setActionType(null)}
                className="px-4 py-3 text-xs font-bold bg-slate-100 hover:bg-slate-200 text-slate-500 rounded-xl transition-colors cursor-pointer"
              >
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL DE EDICIÓN DE FECHA Y CANTIDAD */}
      {editingAlert && (
        <div className="fixed inset-0 z-[200] bg-black/80 backdrop-blur-md flex justify-center items-center p-4">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-md overflow-hidden border border-slate-100 animate-in zoom-in-95 duration-200 text-slate-800 p-6 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="text-sm font-black uppercase text-slate-800">✏️ Editar Registro de Alerta</h3>
              <button type="button" onClick={() => setEditingAlert(null)} className="text-slate-400 hover:text-slate-600 p-1">
                ✕
              </button>
            </div>
            
            <div className="text-xs font-bold text-slate-600 truncate bg-slate-50 p-2.5 rounded-xl border border-slate-200">
              📌 {editingAlert.nombre}
            </div>

            <form onSubmit={handleSaveAlertEdit} className="space-y-4">
              <div className="space-y-1">
                <label className="text-[10px] font-bold text-slate-500 uppercase block">Fecha de Vencimiento:*</label>
                <input
                  type="date"
                  required
                  value={editDateInput}
                  onChange={(e) => setEditDateInput(e.target.value)}
                  className="w-full px-3 py-2.5 bg-slate-100 border border-slate-200 rounded-xl text-xs font-bold focus:border-blue-500 outline-none text-slate-800"
                />
              </div>

              <div className="space-y-1">
                <label className="text-[10px] font-bold text-slate-500 uppercase block">Cantidad / Guía:*</label>
                <input
                  type="number"
                  step="any"
                  required
                  value={editQtyInput}
                  onChange={(e) => setEditQtyInput(e.target.value)}
                  className="w-full px-3 py-2.5 bg-slate-100 border border-slate-200 rounded-xl text-xs font-bold focus:border-blue-500 outline-none text-slate-800"
                />
              </div>

              <div className="flex gap-2 pt-2">
                <button
                  type="submit"
                  disabled={isSavingEdit}
                  className="flex-1 py-3 text-xs font-black text-white bg-blue-600 hover:bg-blue-700 rounded-xl shadow-md transition-all uppercase cursor-pointer active:scale-[0.97] disabled:opacity-50"
                >
                  {isSavingEdit ? 'Guardando...' : 'Guardar Cambios'}
                </button>
                <button
                  type="button"
                  disabled={isSavingEdit}
                  onClick={() => setEditingAlert(null)}
                  className="px-4 py-3 text-xs font-bold bg-slate-100 hover:bg-slate-200 text-slate-500 rounded-xl transition-colors cursor-pointer"
                >
                  Cancelar
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
