import React, { useState } from 'react';
import { Task } from '../types';
import { 
  XCircle, Clock, Camera, Trash2, 
  Search, Bell, RefreshCw, 
  Check, Ban, PlusCircle, ChevronDown, ChevronUp,
  ClipboardList, ArrowLeft
} from 'lucide-react';
import { supabase } from '../supabaseClient';
import { compressImage, generateStorageFileName } from '../utils';

interface PendientesModalProps {
  isOpen: boolean;
  onClose: () => void;
  tasks: Task[];
  currentUser: any;
  isDarkMode: boolean;
  onAddTask: (task: Task) => void;
  onTaskDone: (taskId: string, user: string) => void;
  onTaskReschedule: (taskId: string, newDate: string, newTime: string, user: string, comment?: string) => void;
  onTaskCancel: (taskId: string, user: string, comment?: string) => void;
  onDeleteTask?: (taskId: string) => void;
}

const getLocalDateString = (d: Date = new Date()) => {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

export const PendientesModal: React.FC<PendientesModalProps> = ({
  isOpen,
  onClose,
  tasks,
  currentUser,
  isDarkMode,
  onAddTask,
  onTaskDone,
  onTaskReschedule,
  onTaskCancel,
  onDeleteTask
}) => {
  const [activeTab, setActiveTab] = useState<'HOY' | 'TODAS' | 'HISTORIAL'>('HOY');
  const [showAddForm, setShowAddForm] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [expandedHistories, setExpandedHistories] = useState<Record<string, boolean>>({});
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const [showMobileDetail, setShowMobileDetail] = useState(false);

  // Form State
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [scheduledDate, setScheduledDate] = useState(() => getLocalDateString());
  const [scheduledHour, setScheduledHour] = useState('12');
  const [scheduledMinute, setScheduledMinute] = useState('00');
  const [scheduledSecond, setScheduledSecond] = useState('00');
  const [photos, setPhotos] = useState<string[]>([]);
  
  // Reschedule inline state
  const [reschedulingTaskId, setReschedulingTaskId] = useState<string | null>(null);
  const [reschedDate, setReschedDate] = useState('');
  const [reschedHour, setReschedHour] = useState('12');
  const [reschedMinute, setReschedMinute] = useState('00');
  const [reschedSecond, setReschedSecond] = useState('00');
  const [reschedComment, setReschedComment] = useState('');

  // Cancel inline state
  const [cancelingTaskId, setCancelingTaskId] = useState<string | null>(null);
  const [cancelComment, setCancelComment] = useState('');

  if (!isOpen) return null;

  const todayStr = getLocalDateString();

  const [isUploadingPhoto, setIsUploadingPhoto] = useState(false);

  const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      alert("Error de seguridad: Solo se permiten subir archivos de imagen válidos.");
      return;
    }

    if (file.size > 10 * 1024 * 1024) {
      alert("Error: La imagen seleccionada es demasiado pesada (>10MB). Seleccione un archivo más pequeño.");
      return;
    }

    if (photos.length >= 3) {
      alert("Límite alcanzado: Solo se permiten hasta 3 fotos de apoyo.");
      return;
    }

    setIsUploadingPhoto(true);

    try {
      // Compress image client-side to keep size optimized and not fill storage (maxWidth = 800, quality = 0.6)
      const compressedBlob = await compressImage(file, 800, 0.6);
      const fileName = generateStorageFileName('jpg');
      const filePath = `tareas/${fileName}`;

      const { data, error: uploadError } = await supabase.storage
        .from('evidencias')
        .upload(filePath, compressedBlob, { contentType: 'image/jpeg' });

      if (uploadError) throw uploadError;

      if (data) {
        const { data: { publicUrl } } = supabase.storage
          .from('evidencias')
          .getPublicUrl(filePath);

        setPhotos(prev => [...prev, publicUrl]);
      }
    } catch (err: any) {
      console.error("Error al subir imagen:", err);
      alert(`Error al subir la imagen al storage: ${err.message || err}`);
    } finally {
      setIsUploadingPhoto(false);
    }
  };

  const isTimeInPast = (dateStr: string, hourStr: string, minuteStr: string) => {
    if (dateStr !== getLocalDateString()) return false;
    const now = new Date();
    const curH = now.getHours();
    const curM = now.getMinutes();
    const h = parseInt(hourStr);
    const m = parseInt(minuteStr);
    return h < curH || (h === curH && m < curM);
  };

  const handleCreateTask = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !description.trim()) return;

    if (isTimeInPast(scheduledDate, scheduledHour, scheduledMinute)) {
      alert('La hora programada no puede estar en el pasado.');
      return;
    }

    const formattedTime = `${scheduledHour.padStart(2, '0')}:${scheduledMinute.padStart(2, '0')}:${scheduledSecond.padStart(2, '0')}`;
    const creatorName = currentUser?.nombre || currentUser?.username || 'Admin';

    const uuid = typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
      const r = Math.random() * 16 | 0, v = c === 'x' ? r : (r & 0x3 | 0x8);
      return v.toString(16);
    });

    const newTask: Task = {
      id: uuid,
      title: title.trim(),
      description: description.trim(),
      priority: 'ALTA',
      status: 'PENDIENTE',
      createdAt: new Date().toISOString(),
      photos,
      createdBy: creatorName,
      scheduledDate,
      alertTime: formattedTime,
      triggeredAlert: false,
      history: [
        {
          action: 'CREADO',
          user: creatorName,
          timestamp: new Date().toISOString(),
          comment: `Tarea programada para el ${scheduledDate} a las ${formattedTime}`
        }
      ]
    };

    onAddTask(newTask);
    setShowAddForm(false);
    resetForm();
  };

  const resetForm = () => {
    setTitle('');
    setDescription('');
    setScheduledDate(getLocalDateString());
    setScheduledHour('12');
    setScheduledMinute('00');
    setScheduledSecond('00');
    setPhotos([]);
  };

  const toggleHistory = (taskId: string) => {
    setExpandedHistories(prev => ({ ...prev, [taskId]: !prev[taskId] }));
  };

  const handleDone = (taskId: string) => {
    if (!confirm('¿Está seguro de marcar este pendiente como REALIZADO?')) return;
    const userName = currentUser?.nombre || currentUser?.username || 'Usuario';
    onTaskDone(taskId, userName);
  };

  const handleRescheduleSubmit = (taskId: string) => {
    if (!confirm('¿Está seguro de REPROGRAMAR este pendiente?')) return;
    const userName = currentUser?.nombre || currentUser?.username || 'Usuario';
    const formattedTime = `${reschedHour.padStart(2, '0')}:${reschedMinute.padStart(2, '0')}:${reschedSecond.padStart(2, '0')}`;
    onTaskReschedule(taskId, reschedDate, formattedTime, userName, reschedComment);
    setReschedulingTaskId(null);
    setReschedComment('');
  };

  const handleCancelSubmit = (taskId: string) => {
    if (!confirm('¿Está seguro de CANCELAR este pendiente?')) return;
    const userName = currentUser?.nombre || currentUser?.username || 'Usuario';
    onTaskCancel(taskId, userName, cancelComment);
    setCancelingTaskId(null);
    setCancelComment('');
  };

  // Filter logic
  const filteredTasks = tasks.filter(t => {
    const matchesSearch = t.title.toLowerCase().includes(searchTerm.toLowerCase()) || 
                          t.description.toLowerCase().includes(searchTerm.toLowerCase());
    
    if (!matchesSearch) return false;

    if (activeTab === 'HOY') {
      return t.status === 'PENDIENTE' && t.scheduledDate === todayStr;
    } else if (activeTab === 'TODAS') {
      return t.status === 'PENDIENTE';
    } else {
      return t.status === 'REALIZADO' || t.status === 'CANCELADO';
    }
  });

  // Sort chronologically by scheduled date and execution time
  const sortedTasks = [...filteredTasks].sort((a, b) => {
    const dateA = a.scheduledDate || '';
    const dateB = b.scheduledDate || '';
    if (dateA !== dateB) {
      return dateA.localeCompare(dateB);
    }
    const timeA = a.alertTime || '';
    const timeB = b.alertTime || '';
    return timeA.localeCompare(timeB);
  });

  // Get active task detail
  const selectedTask = tasks.find(t => t.id === selectedTaskId) || null;

  return (
    <div className={`w-full h-full flex flex-col overflow-hidden ${isDarkMode ? 'bg-[#1e293b] text-white' : 'bg-white text-slate-800'}`}>
      
      {/* Header Panel */}
      <div className="p-4 md:p-5 border-b border-slate-200 dark:border-slate-700 flex items-center justify-between bg-gradient-to-tr from-[#009ED6] to-indigo-600 text-white shrink-0">
        <div className="flex items-center gap-3">
          <div className="bg-white/20 p-2 rounded-2xl shrink-0">
            <Bell className="w-5 h-5 md:w-6 md:h-6 text-white animate-bounce" />
          </div>
          <div>
            <h2 className="text-sm md:text-xl font-black uppercase tracking-tight leading-none">PENDIENTES DEL TURNO</h2>
            <p className="text-[9px] md:text-xs text-white/85 font-medium mt-1 uppercase tracking-wider line-clamp-1">Tareas diarias y alertas de cumplimiento</p>
          </div>
        </div>
        <button 
          onClick={onClose}
          className="p-1.5 md:p-2 rounded-xl bg-white/10 hover:bg-white/20 transition-all text-white active:scale-95 shrink-0"
        >
          <XCircle className="w-5 h-5 md:w-6 md:h-6" />
        </button>
      </div>

      {/* Filters and Action Header Row */}
      <div className="flex flex-col xl:flex-row xl:items-center justify-between border-b border-slate-200 dark:border-slate-700 px-4 py-3 bg-slate-50 dark:bg-slate-900/60 gap-4 shrink-0">
        <div className="flex flex-wrap gap-2 md:gap-4">
          <button
            onClick={() => { setActiveTab('HOY'); }}
            className={`pb-2 pt-1 px-1 text-xs font-black uppercase tracking-wider border-b-2 transition-all ${
              activeTab === 'HOY' 
                ? 'text-indigo-600 border-indigo-600 dark:text-indigo-400 dark:border-indigo-400' 
                : 'text-slate-400 hover:text-slate-600 border-transparent dark:hover:text-slate-300'
            }`}
          >
            De Hoy ({tasks.filter(t => t.status === 'PENDIENTE' && t.scheduledDate === todayStr).length})
          </button>
          <button
            onClick={() => { setActiveTab('TODAS'); }}
            className={`pb-2 pt-1 px-1 text-xs font-black uppercase tracking-wider border-b-2 transition-all ${
              activeTab === 'TODAS' 
                ? 'text-indigo-600 border-indigo-600 dark:text-indigo-400 dark:border-indigo-400' 
                : 'text-slate-400 hover:text-slate-600 border-transparent dark:hover:text-slate-300'
            }`}
          >
            Todas las Programadas ({tasks.filter(t => t.status === 'PENDIENTE').length})
          </button>
          <button
            onClick={() => { setActiveTab('HISTORIAL'); }}
            className={`pb-2 pt-1 px-1 text-xs font-black uppercase tracking-wider border-b-2 transition-all ${
              activeTab === 'HISTORIAL' 
                ? 'text-emerald-600 border-emerald-600 dark:text-emerald-450 dark:border-emerald-450' 
                : 'text-slate-400 hover:text-slate-600 border-transparent dark:hover:text-slate-300'
            }`}
          >
            Históricos / Realizados ({tasks.filter(t => t.status === 'REALIZADO' || t.status === 'CANCELADO').length})
          </button>
        </div>

        <div className="flex flex-col md:flex-row gap-3 xl:justify-end items-stretch md:items-center max-w-xl flex-1">
          <div className="relative flex-1">
            <input 
              type="text" 
              placeholder="Buscar pendiente..."
              className="w-full bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl pl-9 pr-4 py-2 text-xs font-semibold focus:ring-2 focus:ring-indigo-500 outline-none text-slate-800 dark:text-white"
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
            />
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 w-4 h-4"/>
          </div>

          <button
            onClick={() => {
              setShowAddForm(true);
              resetForm();
            }}
            className="bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-xl font-black text-xs uppercase tracking-tight flex items-center justify-center gap-1.5 shrink-0 shadow-md active:scale-95 transition-all"
          >
            <PlusCircle className="w-4 h-4" />
            AGENDAR
          </button>
        </div>
      </div>

      {/* Main Split-Screen Section */}
      <div className="flex-1 flex flex-col md:flex-row overflow-hidden">
        
        {/* Left Side: Tasks Table List */}
        <div className="flex-1 flex flex-col overflow-y-auto border-r border-slate-200 dark:border-slate-700">
          {sortedTasks.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 px-4 text-center h-full">
              <div className="p-4 bg-indigo-50 dark:bg-slate-800 rounded-full mb-4">
                <ClipboardList className="w-10 h-10 text-indigo-600 dark:text-indigo-400" />
              </div>
              <h3 className="text-base font-black text-slate-800 dark:text-white uppercase tracking-tight">Sin Tareas Agendadas</h3>
              <p className="text-slate-400 text-xs mt-1 max-w-sm">No existen registros programados o auditorías para mostrar en la pestaña seleccionada.</p>
            </div>
          ) : (
            <div className="w-full min-w-0 overflow-x-auto">
              <table className="w-full text-left border-collapse min-w-[600px]">
                <thead>
                  <tr className={`border-b ${isDarkMode ? 'border-slate-700 bg-slate-850 text-slate-400' : 'border-slate-200 bg-slate-50 text-slate-500'} text-[10px] font-black uppercase tracking-wider`}>
                    <th className="py-3 px-4">Prioridad</th>
                    <th className="py-3 px-4">Pendiente</th>
                    <th className="py-3 px-4">Fecha de Alerta</th>
                    <th className="py-3 px-4">Asignado por</th>
                    <th className="py-3 px-4">Estado</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {sortedTasks.map(task => {
                    const isSelected = selectedTaskId === task.id;
                    return (
                      <tr 
                        key={task.id} 
                        onClick={() => {
                          setSelectedTaskId(task.id);
                          setShowMobileDetail(true);
                          setReschedulingTaskId(null);
                          setCancelingTaskId(null);
                        }}
                        className={`cursor-pointer transition-all text-xs font-medium ${
                          isSelected 
                            ? (isDarkMode ? 'bg-indigo-600/20 text-white border-l-4 border-l-indigo-500' : 'bg-indigo-50/50 text-slate-900 border-l-4 border-l-indigo-600 font-bold') 
                            : (isDarkMode ? 'hover:bg-slate-800/40 text-slate-300' : 'hover:bg-slate-50/80 text-slate-600')
                        }`}
                      >
                        <td className="py-3 px-4">
                          <span className={`px-2 py-0.5 rounded-lg text-[9px] font-black uppercase tracking-wide inline-block ${
                            task.priority === 'ALTA' ? 'bg-red-50 text-red-600 dark:bg-red-950/40 dark:text-red-400 border border-red-100 dark:border-red-900' :
                            task.priority === 'MEDIA' ? 'bg-amber-50 text-amber-600 dark:bg-amber-950/40 dark:text-amber-400 border border-amber-100 dark:border-amber-900' : 
                            'bg-slate-50 text-slate-500 dark:bg-slate-800 dark:text-slate-400 border border-slate-200 dark:border-slate-700'
                          }`}>
                            {task.priority}
                          </span>
                        </td>
                        <td className="py-3 px-4">
                          <div className="font-black text-slate-800 dark:text-white">{task.title}</div>
                          <div className="text-[11px] text-slate-400 dark:text-slate-400 line-clamp-1 font-normal">{task.description}</div>
                        </td>
                        <td className="py-3 px-4">
                          <div className="flex items-center gap-1.5 font-bold text-slate-700 dark:text-slate-300">
                            <Clock className="w-3.5 h-3.5 text-indigo-500 shrink-0" />
                            <span>{task.scheduledDate} {task.alertTime}</span>
                          </div>
                        </td>
                        <td className="py-3 px-4 font-semibold text-slate-600 dark:text-slate-400">
                          {task.createdBy}
                        </td>
                        <td className="py-3 px-4">
                          <span className={`px-2 py-0.5 rounded-lg text-[9px] font-black uppercase tracking-wide inline-block ${
                            task.status === 'REALIZADO' ? 'bg-emerald-50 text-emerald-600 dark:bg-emerald-950/30 dark:text-emerald-400 border border-emerald-100' :
                            task.status === 'CANCELADO' ? 'bg-rose-50 text-rose-550 dark:bg-rose-950/30 dark:text-rose-400 border border-rose-100' : 
                            'bg-indigo-50 text-indigo-600 dark:bg-indigo-950/30 dark:text-indigo-400 border border-indigo-100 animate-pulse'
                          }`}>
                            {task.status === 'REALIZADO' ? 'Realizado' : task.status === 'CANCELADO' ? 'Cancelado' : 'Pendiente'}
                          </span>
                          {task.status === 'REALIZADO' && task.completedBy && (
                            <div className="text-[10px] text-emerald-600 dark:text-emerald-400 font-bold mt-1">Por: {task.completedBy}</div>
                          )}
                          {task.status === 'CANCELADO' && task.canceledBy && (
                            <div className="text-[10px] text-rose-600 dark:text-rose-400 font-bold mt-1">Por: {task.canceledBy}</div>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Right Side: Selected Task Detail Panel (Desktop only, hidden on mobile) */}
        <div className="hidden md:flex md:w-[350px] xl:w-[420px] flex-col overflow-y-auto bg-slate-50 dark:bg-slate-900/40 p-5">
          {!selectedTask ? (
            <div className="flex flex-col items-center justify-center text-center h-full text-slate-400 py-12 px-4 border-2 border-dashed border-slate-200 dark:border-slate-800 rounded-3xl">
              <ClipboardList className="w-8 h-8 opacity-45 mb-2.5" />
              <p className="text-xs font-bold uppercase tracking-wider">Detalles de Pendiente</p>
              <p className="text-[11px] text-slate-400 max-w-[220px] mt-1 font-medium">Seleccione una tarea de la tabla para ver sus detalles y ejecutar acciones.</p>
            </div>
          ) : (
            <div className="space-y-5 animate-fade-in">
              {/* Task Header Details */}
              <div className="space-y-2 border-b border-slate-200 dark:border-slate-800 pb-4">
                <div className="flex items-center justify-between">
                  <span className={`px-2.5 py-0.5 rounded-lg text-[9px] font-black uppercase ${
                    selectedTask.priority === 'ALTA' ? 'bg-red-50 text-red-600 dark:bg-red-950/40 dark:text-red-400 border border-red-100' : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300'
                  }`}>
                    Prioridad {selectedTask.priority}
                  </span>
                  <span className={`px-2.5 py-0.5 rounded-lg text-[9px] font-black uppercase ${
                    selectedTask.status === 'REALIZADO' ? 'bg-emerald-50 text-emerald-600 dark:bg-emerald-950/40 dark:text-emerald-400 border border-emerald-100' :
                    selectedTask.status === 'CANCELADO' ? 'bg-rose-50 text-rose-500 dark:bg-rose-950/40 dark:text-rose-450 border border-rose-100' : 
                    'bg-indigo-50 text-indigo-600 dark:bg-indigo-950/40 dark:text-indigo-400 border border-indigo-100'
                  }`}>
                    {selectedTask.status === 'REALIZADO' ? 'Hecho' : selectedTask.status === 'CANCELADO' ? 'Cancelada' : 'Pendiente'}
                  </span>
                </div>
                <h3 className="text-base font-black text-slate-800 dark:text-white leading-tight">{selectedTask.title}</h3>
                <p className="text-slate-500 dark:text-slate-300 text-xs leading-relaxed">{selectedTask.description}</p>
              </div>

              {/* Photos Attachment */}
              {selectedTask.photos && selectedTask.photos.length > 0 && (
                <div className="space-y-1.5">
                  <span className="text-[10px] font-black text-slate-400 dark:text-slate-400 uppercase tracking-wider block">Evidencias ({selectedTask.photos.length})</span>
                  <div className="flex gap-2 overflow-x-auto pb-2 custom-scrollbar">
                    {selectedTask.photos.map((photo, idx) => (
                      <div key={idx} className="w-16 h-16 rounded-xl overflow-hidden border border-slate-200 dark:border-slate-700 relative group shrink-0 shadow-sm">
                        <img src={photo} className="w-full h-full object-cover" alt="Evidencia" />
                        <a href={photo} target="_blank" rel="noopener noreferrer" className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center text-white text-[9px] font-bold">Ver</a>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Timing Metadata Info */}
              <div className="bg-white dark:bg-slate-800/80 rounded-2xl p-3.5 border border-slate-200 dark:border-slate-750 text-xs space-y-2">
                <div className="flex justify-between items-center">
                  <span className="text-slate-400 dark:text-slate-400 font-bold uppercase tracking-wider text-[9px]">Fecha Alerta:</span>
                  <span className="font-extrabold text-slate-800 dark:text-white">{selectedTask.scheduledDate || '---'}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-slate-400 dark:text-slate-400 font-bold uppercase tracking-wider text-[9px]">Hora de Alerta:</span>
                  <span className="font-black text-indigo-600 dark:text-indigo-400 flex items-center gap-1">
                    <Clock className="w-3.5 h-3.5" />
                    {selectedTask.alertTime || '---'}
                  </span>
                </div>
                <div className="flex justify-between items-center pt-2 border-t border-slate-100 dark:border-slate-700">
                  <span className="text-slate-400 dark:text-slate-400 font-bold uppercase tracking-wider text-[9px]">Asignado por:</span>
                  <span className="font-bold text-slate-700 dark:text-slate-200">{selectedTask.createdBy}</span>
                </div>
                {selectedTask.completedBy && (
                  <div className="flex justify-between items-center pt-1">
                    <span className="text-slate-400 dark:text-slate-400 font-bold uppercase tracking-wider text-[9px]">Realizado por:</span>
                    <span className="font-black text-emerald-600 dark:text-emerald-400">{selectedTask.completedBy}</span>
                  </div>
                )}
                {selectedTask.canceledBy && (
                  <div className="flex justify-between items-center pt-1">
                    <span className="text-slate-400 dark:text-slate-400 font-bold uppercase tracking-wider text-[9px]">Cancelado por:</span>
                    <span className="font-black text-rose-600 dark:text-rose-450">{selectedTask.canceledBy}</span>
                  </div>
                )}
              </div>

              {/* Dynamic Action Forms Inline in Sidebar */}
              {reschedulingTaskId === selectedTask.id && (
                <div className="p-4 bg-amber-50/50 dark:bg-amber-900/10 border border-amber-200 dark:border-amber-800 rounded-2xl space-y-3 text-xs">
                  <p className="font-black text-amber-700 dark:text-amber-400 uppercase tracking-tight text-[10px]">Reprogramar Tarea de Turno</p>
                  
                  <div className="space-y-1">
                    <span className="text-[9px] text-slate-400 font-bold uppercase">Día Programado</span>
                    <input 
                      type="date"
                      min={getLocalDateString()}
                      className="w-full bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2 text-xs font-semibold"
                      value={reschedDate}
                      onChange={e => setReschedDate(e.target.value)}
                    />
                  </div>

                  <div className="space-y-1">
                    <span className="text-[9px] text-slate-400 font-bold uppercase block">Hora Programada (H:M:S)</span>
                    <div className="grid grid-cols-3 gap-2">
                      <input 
                        type="number" min="0" max="23" placeholder="Hora"
                        className="w-full bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-2 py-2 text-xs font-bold text-center"
                        value={reschedHour}
                        onChange={e => setReschedHour(e.target.value)}
                      />
                      <input 
                        type="number" min="0" max="59" placeholder="Min"
                        className="w-full bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-2 py-2 text-xs font-bold text-center"
                        value={reschedMinute}
                        onChange={e => setReschedMinute(e.target.value)}
                      />
                      <input 
                        type="number" min="0" max="59" placeholder="Seg"
                        className="w-full bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-2 py-2 text-xs font-bold text-center"
                        value={reschedSecond}
                        onChange={e => setReschedSecond(e.target.value)}
                      />
                    </div>
                  </div>

                  <div className="space-y-1">
                    <span className="text-[9px] text-slate-400 font-bold uppercase">Comentario de Reprogramación</span>
                    <input 
                      type="text"
                      placeholder="Ej. Esperar cambio de turno..."
                      className="w-full bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2 text-xs"
                      value={reschedComment}
                      onChange={e => setReschedComment(e.target.value)}
                    />
                  </div>

                  <div className="flex justify-end gap-1.5 pt-1">
                    <button 
                      type="button" 
                      onClick={() => setReschedulingTaskId(null)}
                      className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 rounded-xl text-[10px] font-black uppercase text-slate-500"
                    >
                      Atrás
                    </button>
                    <button 
                      type="button" 
                      onClick={() => handleRescheduleSubmit(selectedTask.id)}
                      className="px-4 py-1.5 bg-amber-600 hover:bg-amber-700 text-white rounded-xl text-[10px] font-black uppercase shadow-sm"
                    >
                      Guardar
                    </button>
                  </div>
                </div>
              )}

              {cancelingTaskId === selectedTask.id && (
                <div className="p-4 bg-rose-50/50 dark:bg-rose-900/10 border border-rose-200 dark:border-rose-800 rounded-2xl space-y-3 text-xs">
                  <p className="font-black text-rose-700 dark:text-rose-400 uppercase tracking-tight text-[10px]">Cancelar Pendiente</p>
                  
                  <div className="space-y-1">
                    <span className="text-[9px] text-slate-400 font-bold uppercase">Motivo de Cancelación</span>
                    <input 
                      type="text"
                      placeholder="Especificar motivo de cancelación..."
                      required
                      className="w-full bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2 text-xs"
                      value={cancelComment}
                      onChange={e => setCancelComment(e.target.value)}
                    />
                  </div>

                  <div className="flex justify-end gap-1.5 pt-1">
                    <button 
                      type="button" 
                      onClick={() => setCancelingTaskId(null)}
                      className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 rounded-xl text-[10px] font-black uppercase text-slate-500"
                    >
                      Atrás
                    </button>
                    <button 
                      type="button" 
                      onClick={() => handleCancelSubmit(selectedTask.id)}
                      className="px-4 py-1.5 bg-red-600 hover:bg-red-700 text-white rounded-xl text-[10px] font-black uppercase shadow-sm"
                    >
                      Confirmar
                    </button>
                  </div>
                </div>
              )}

              {/* Standard Actions Buttons Panel */}
              {selectedTask.status === 'PENDIENTE' && !reschedulingTaskId && !cancelingTaskId && (
                <div className="grid grid-cols-2 gap-3 pt-2">
                  <button
                    onClick={() => handleDone(selectedTask.id)}
                    className="py-3 px-4 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-black uppercase rounded-2xl flex items-center justify-center gap-1.5 transition-all shadow-md active:scale-95 cursor-pointer"
                  >
                    <Check className="w-4 h-4 shrink-0" />
                    REALIZADOS
                  </button>

                  <button
                    onClick={() => {
                      setReschedulingTaskId(selectedTask.id);
                      setReschedDate(selectedTask.scheduledDate || todayStr);
                      const tParts = (selectedTask.alertTime || '12:00:00').split(':');
                      setReschedHour(tParts[0] || '12');
                      setReschedMinute(tParts[1] || '00');
                      setReschedSecond(tParts[2] || '00');
                    }}
                    className="py-3 px-4 bg-amber-500 hover:bg-amber-600 text-white text-xs font-black uppercase rounded-2xl flex items-center justify-center gap-1.5 transition-all shadow-md active:scale-95 cursor-pointer"
                  >
                    <RefreshCw className="w-4 h-4 shrink-0" />
                    REPROGRAMADO
                  </button>

                  <button
                    onClick={() => {
                      setCancelingTaskId(selectedTask.id);
                    }}
                    className="py-3 px-4 bg-slate-200 hover:bg-slate-350 dark:bg-slate-800 dark:hover:bg-slate-750 text-slate-600 dark:text-slate-300 text-xs font-black uppercase rounded-2xl flex items-center justify-center gap-1.5 transition-all active:scale-95 cursor-pointer"
                  >
                    <Ban className="w-4 h-4 shrink-0" />
                    Cancelar
                  </button>

                  <button
                    onClick={() => {
                      if (confirm('¿Está seguro de que desea eliminar permanentemente este pendiente?')) {
                        onDeleteTask?.(selectedTask.id);
                        setSelectedTaskId(null);
                      }
                    }}
                    className="py-3 px-4 bg-rose-600 hover:bg-rose-700 text-white text-xs font-black uppercase rounded-2xl flex items-center justify-center gap-1.5 transition-all shadow-md active:scale-95 cursor-pointer"
                  >
                    <Trash2 className="w-4 h-4 shrink-0" />
                    ELIMINADO
                  </button>
                </div>
              )}

              {/* Canceled/Done admin delete capability */}
              {selectedTask.status !== 'PENDIENTE' && (
                <div className="pt-2">
                  <button
                    onClick={() => {
                      if (confirm('¿Está seguro de eliminar permanentemente este registro del historial?')) {
                        onDeleteTask?.(selectedTask.id);
                        setSelectedTaskId(null);
                      }
                    }}
                    className="w-full py-3 px-4 bg-rose-600 hover:bg-rose-700 text-white text-xs font-black uppercase rounded-2xl flex items-center justify-center gap-1.5 transition-all shadow-md active:scale-95 cursor-pointer"
                  >
                    <Trash2 className="w-4 h-4 shrink-0" />
                    ELIMINAR DE HISTORIAL
                  </button>
                </div>
              )}

              {/* Audit History Logs details */}
              <div className="border-t border-slate-200 dark:border-slate-800 pt-3.5">
                <button
                  onClick={() => toggleHistory(selectedTask.id)}
                  className="text-xs font-black text-slate-400 dark:text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 flex items-center justify-between w-full uppercase outline-none"
                >
                  <span className="flex items-center gap-1.5">
                    <ClipboardList className="w-4 h-4" />
                    Historial de Auditoría
                  </span>
                  {expandedHistories[selectedTask.id] ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                </button>

                {expandedHistories[selectedTask.id] && (
                  <div className="mt-3 space-y-2 bg-white dark:bg-slate-800/60 p-3 rounded-2xl border border-slate-150 dark:border-slate-750 max-h-56 overflow-y-auto custom-scrollbar">
                    {selectedTask.history && selectedTask.history.length > 0 ? (
                      selectedTask.history.map((h, i) => (
                        <div key={i} className="text-[10px] border-b border-slate-100 dark:border-slate-700 last:border-0 pb-2 last:pb-0 space-y-1">
                          <div className="flex justify-between items-center font-black">
                            <span className={`px-1.5 py-0.5 rounded text-[8px] tracking-wide ${
                              h.action === 'CREADO' ? 'bg-indigo-50 text-indigo-700 dark:bg-indigo-950/40 dark:text-indigo-400' :
                              h.action === 'REALIZADO' ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400' :
                              h.action === 'REPROGRAMADO' ? 'bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-400' : 'bg-rose-50 text-rose-700 dark:bg-rose-950/40 dark:text-rose-400'
                            }`}>{h.action}</span>
                            <span className="text-slate-400 font-semibold">{new Date(h.timestamp).toLocaleString('es-PE')}</span>
                          </div>
                          <p className="text-slate-600 dark:text-slate-300 font-medium leading-normal">
                            Por <strong className="text-slate-700 dark:text-slate-200">{h.user}</strong>: {h.comment || 'Sin observaciones.'}
                          </p>
                        </div>
                      ))
                    ) : (
                      <p className="text-[10px] text-slate-400 italic">No hay historial registrado.</p>
                    )}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Mobile Detailed Task Overlay Bottom-Sheet/View */}
      {showMobileDetail && selectedTask && (
        <div className="md:hidden fixed inset-0 z-[120] bg-slate-900/60 backdrop-blur-sm flex items-end justify-center">
          <div className={`w-full max-h-[85vh] overflow-y-auto rounded-t-[2.5rem] p-5 shadow-2xl flex flex-col space-y-4 animate-in slide-in-from-bottom-20 duration-300 ${isDarkMode ? 'bg-slate-900 text-white' : 'bg-white text-slate-800'}`}>
            {/* Top Handle bar */}
            <div className="w-12 h-1.5 bg-slate-300 dark:bg-slate-700 rounded-full mx-auto shrink-0 mb-1" onClick={() => setShowMobileDetail(false)} />
            
            <div className="flex items-center justify-between pb-2 border-b border-slate-100 dark:border-slate-800 shrink-0">
              <button 
                onClick={() => setShowMobileDetail(false)}
                className="flex items-center gap-1 text-xs font-black uppercase text-indigo-600 dark:text-indigo-400"
              >
                <ArrowLeft className="w-4 h-4" /> Volver
              </button>
              <h4 className="text-xs font-black uppercase tracking-widest text-slate-400">Detalles</h4>
              <button 
                onClick={() => setShowMobileDetail(false)}
                className="text-slate-400 hover:text-slate-600"
              >
                <XCircle className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-4 flex-1 overflow-y-auto">
              <div className="space-y-1">
                <div className="flex justify-between items-center">
                  <span className={`px-2 py-0.5 rounded-lg text-[9px] font-black uppercase ${
                    selectedTask.priority === 'ALTA' ? 'bg-red-50 text-red-600 dark:bg-red-950/30' : 'bg-slate-100'
                  }`}>
                    {selectedTask.priority}
                  </span>
                  <span className={`px-2 py-0.5 rounded-lg text-[9px] font-black uppercase ${
                    selectedTask.status === 'REALIZADO' ? 'bg-emerald-55 text-emerald-600' : 'bg-indigo-50 text-indigo-600'
                  }`}>
                    {selectedTask.status}
                  </span>
                </div>
                <h3 className="text-sm font-black leading-tight text-slate-800 dark:text-white">{selectedTask.title}</h3>
                <p className="text-slate-500 dark:text-slate-300 text-xs leading-relaxed">{selectedTask.description}</p>
              </div>

              {/* Photos */}
              {selectedTask.photos && selectedTask.photos.length > 0 && (
                <div className="space-y-1">
                  <span className="text-[10px] font-black text-slate-400 uppercase tracking-wider block">Adjuntos ({selectedTask.photos.length})</span>
                  <div className="flex gap-2 overflow-x-auto pb-1 no-scrollbar">
                    {selectedTask.photos.map((photo, idx) => (
                      <img key={idx} src={photo} className="w-14 h-14 rounded-xl object-cover border border-slate-150" alt="Soporte" />
                    ))}
                  </div>
                </div>
              )}

              {/* Timings */}
              <div className="bg-slate-50 dark:bg-slate-800/80 rounded-2xl p-3 border border-slate-200 dark:border-slate-750 text-xs space-y-2">
                <div className="flex justify-between items-center">
                  <span className="text-slate-400 font-bold uppercase tracking-wider text-[9px]">Fecha Alerta:</span>
                  <span className="font-extrabold text-slate-850 dark:text-white">{selectedTask.scheduledDate || '---'}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-slate-400 font-bold uppercase tracking-wider text-[9px]">Hora Alerta:</span>
                  <span className="font-black text-indigo-600 dark:text-indigo-400 flex items-center gap-1">
                    <Clock className="w-3.5 h-3.5" />
                    {selectedTask.alertTime || '---'}
                  </span>
                </div>
                <div className="flex justify-between items-center pt-2 border-t border-slate-200/40">
                  <span className="text-slate-400 font-bold uppercase tracking-wider text-[9px]">Asignado por:</span>
                  <span className="font-bold">{selectedTask.createdBy}</span>
                </div>
                {selectedTask.completedBy && (
                  <div className="flex justify-between items-center pt-1">
                    <span className="text-slate-400 font-bold uppercase tracking-wider text-[9px]">Realizado por:</span>
                    <span className="font-black text-emerald-600 dark:text-emerald-400">{selectedTask.completedBy}</span>
                  </div>
                )}
                {selectedTask.canceledBy && (
                  <div className="flex justify-between items-center pt-1">
                    <span className="text-slate-400 font-bold uppercase tracking-wider text-[9px]">Cancelado por:</span>
                    <span className="font-black text-rose-600 dark:text-rose-450">{selectedTask.canceledBy}</span>
                  </div>
                )}
              </div>

              {/* Reschedule on mobile */}
              {reschedulingTaskId === selectedTask.id && (
                <div className="p-4 bg-amber-50/50 dark:bg-amber-900/10 border border-amber-200 dark:border-amber-800 rounded-2xl space-y-3 text-xs">
                  <p className="font-black text-amber-700 dark:text-amber-400 uppercase tracking-tight text-[10px]">Reprogramar Pendiente</p>
                  <div className="space-y-1">
                    <span className="text-[9px] text-slate-400 font-bold uppercase">Día Programado</span>
                    <input 
                      type="date"
                      min={getLocalDateString()}
                      className="w-full bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2 text-xs"
                      value={reschedDate}
                      onChange={e => setReschedDate(e.target.value)}
                    />
                  </div>
                  <div className="grid grid-cols-3 gap-2">
                    <input type="number" min="0" max="23" placeholder="Hora" className="w-full bg-white dark:bg-slate-800 border rounded-xl p-2 text-center text-xs" value={reschedHour} onChange={e => setReschedHour(e.target.value)} />
                    <input type="number" min="0" max="59" placeholder="Min" className="w-full bg-white dark:bg-slate-800 border rounded-xl p-2 text-center text-xs" value={reschedMinute} onChange={e => setReschedMinute(e.target.value)} />
                    <input type="number" min="0" max="59" placeholder="Seg" className="w-full bg-white dark:bg-slate-800 border rounded-xl p-2 text-center text-xs" value={reschedSecond} onChange={e => setReschedSecond(e.target.value)} />
                  </div>
                  <input type="text" placeholder="Motivo de reprogramación" className="w-full bg-white dark:bg-slate-800 border rounded-xl p-2 text-xs" value={reschedComment} onChange={e => setReschedComment(e.target.value)} />
                  <div className="flex justify-end gap-1.5">
                    <button type="button" onClick={() => setReschedulingTaskId(null)} className="px-3 py-1.5 bg-slate-100 rounded-xl text-[10px] font-black uppercase text-slate-500">Atrás</button>
                    <button type="button" onClick={() => handleRescheduleSubmit(selectedTask.id)} className="px-4 py-1.5 bg-amber-600 text-white rounded-xl text-[10px] font-black uppercase">Guardar</button>
                  </div>
                </div>
              )}

              {cancelingTaskId === selectedTask.id && (
                <div className="p-4 bg-rose-50/50 dark:bg-rose-900/10 border border-rose-200 dark:border-rose-800 rounded-2xl space-y-3 text-xs">
                  <p className="font-black text-rose-700 dark:text-rose-400 uppercase tracking-tight text-[10px]">Cancelar Pendiente</p>
                  <input type="text" placeholder="Especificar motivo de cancelación..." className="w-full bg-white dark:bg-slate-800 border rounded-xl p-2 text-xs" value={cancelComment} onChange={e => setCancelComment(e.target.value)} />
                  <div className="flex justify-end gap-1.5">
                    <button type="button" onClick={() => setCancelingTaskId(null)} className="px-3 py-1.5 bg-slate-100 rounded-xl text-[10px] font-black uppercase text-slate-500">Atrás</button>
                    <button type="button" onClick={() => handleCancelSubmit(selectedTask.id)} className="px-4 py-1.5 bg-red-600 text-white rounded-xl text-[10px] font-black uppercase">Confirmar</button>
                  </div>
                </div>
              )}

              {/* Actions on Mobile */}
              {selectedTask.status === 'PENDIENTE' && !reschedulingTaskId && !cancelingTaskId && (
                <div className="grid grid-cols-2 gap-2.5 pt-2">
                  <button
                    onClick={() => {
                      handleDone(selectedTask.id);
                      setShowMobileDetail(false);
                    }}
                    className="py-3 px-4 bg-emerald-600 text-white text-xs font-black uppercase rounded-2xl flex items-center justify-center gap-1.5"
                  >
                    <Check className="w-4 h-4 shrink-0" />
                    REALIZADOS
                  </button>

                  <button
                    onClick={() => {
                      setReschedulingTaskId(selectedTask.id);
                      setReschedDate(selectedTask.scheduledDate || todayStr);
                      const tParts = (selectedTask.alertTime || '12:00:00').split(':');
                      setReschedHour(tParts[0] || '12');
                      setReschedMinute(tParts[1] || '00');
                      setReschedSecond(tParts[2] || '00');
                    }}
                    className="py-3 px-4 bg-amber-500 text-white text-xs font-black uppercase rounded-2xl flex items-center justify-center gap-1.5"
                  >
                    <RefreshCw className="w-4 h-4 shrink-0" />
                    REPROGRAMADO
                  </button>

                  <button
                    onClick={() => setCancelingTaskId(selectedTask.id)}
                    className="py-3 px-4 bg-slate-200 text-slate-600 text-xs font-black uppercase rounded-2xl flex items-center justify-center gap-1.5"
                  >
                    <Ban className="w-4 h-4 shrink-0" />
                    Cancelar
                  </button>

                  <button
                    onClick={() => {
                      if (confirm('¿Está seguro de que desea eliminar permanentemente este pendiente?')) {
                        onDeleteTask?.(selectedTask.id);
                        setSelectedTaskId(null);
                        setShowMobileDetail(false);
                      }
                    }}
                    className="py-3 px-4 bg-rose-600 text-white text-xs font-black uppercase rounded-2xl flex items-center justify-center gap-1.5"
                  >
                    <Trash2 className="w-4 h-4 shrink-0" />
                    ELIMINADO
                  </button>
                </div>
              )}

              {selectedTask.status !== 'PENDIENTE' && (
                <div className="pt-2">
                  <button
                    onClick={() => {
                      if (confirm('¿Está seguro de eliminar permanentemente este registro del historial?')) {
                        onDeleteTask?.(selectedTask.id);
                        setSelectedTaskId(null);
                        setShowMobileDetail(false);
                      }
                    }}
                    className="w-full py-3 px-4 bg-rose-600 text-white text-xs font-black uppercase rounded-2xl flex items-center justify-center gap-1.5"
                  >
                    <Trash2 className="w-4 h-4 shrink-0" />
                    ELIMINAR DE HISTORIAL
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* AGENDAR Form Popup Modal */}
      {showAddForm && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[150] flex items-center justify-center p-4">
          <form 
            onSubmit={handleCreateTask} 
            className={`w-full max-w-xl max-h-[90vh] overflow-y-auto rounded-3xl p-6 shadow-2xl border ${isDarkMode ? 'bg-slate-900 border-slate-700 text-white' : 'bg-white border-slate-100 text-slate-800'} animate-scale-in space-y-4`}
          >
            <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
              <h3 className="text-sm font-black text-indigo-900 dark:text-white uppercase flex items-center gap-1.5">
                <PlusCircle className="w-5 h-5 text-indigo-600" />
                Agendar Pendiente
              </h3>
              <button type="button" onClick={() => setShowAddForm(false)} className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-300">
                <XCircle className="w-5 h-5" />
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="md:col-span-2 space-y-1">
                <label className="text-[10px] font-black text-slate-400 dark:text-slate-400 uppercase tracking-wider">Título del Pendiente</label>
                <input 
                  required 
                  type="text" 
                  placeholder="Ej. Control de Temperatura de Congelados"
                  className="w-full bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-2.5 text-xs font-bold text-slate-800 dark:text-white focus:ring-2 focus:ring-indigo-500 outline-none"
                  value={title}
                  onChange={e => setTitle(e.target.value)}
                />
              </div>

              <div className="space-y-1">
                <label className="text-[10px] font-black text-slate-400 dark:text-slate-400 uppercase tracking-wider">Asignado Por</label>
                <input 
                  type="text" 
                  readOnly
                  className="w-full bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-2.5 text-xs font-bold text-slate-500 cursor-not-allowed outline-none"
                  value={currentUser?.nombre || currentUser?.username || 'Admin'}
                />
              </div>
            </div>

            <div className="space-y-1">
              <label className="text-[10px] font-black text-slate-400 dark:text-slate-400 uppercase tracking-wider">Detalles / Instrucciones</label>
              <textarea 
                required 
                rows={3}
                placeholder="Escriba los detalles precisos de lo que se debe auditar o cumplir..."
                className="w-full bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 rounded-xl p-4 text-xs font-semibold text-slate-800 dark:text-white focus:ring-2 focus:ring-indigo-500 outline-none"
                value={description}
                onChange={e => setDescription(e.target.value)}
              />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-1">
                <label className="text-[10px] font-black text-slate-400 dark:text-slate-400 uppercase tracking-wider">Fecha Programada</label>
                <input 
                  type="date"
                  required
                  min={getLocalDateString()}
                  className="w-full bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-2 text-xs font-bold text-slate-800 dark:text-white outline-none focus:ring-2 focus:ring-indigo-500"
                  value={scheduledDate}
                  onChange={e => {
                    const val = e.target.value;
                    setScheduledDate(val);
                    if (val === getLocalDateString()) {
                      const now = new Date();
                      const curH = now.getHours();
                      const curM = now.getMinutes();
                      const sH = parseInt(scheduledHour);
                      const sM = parseInt(scheduledMinute);
                      if (sH < curH || (sH === curH && sM < curM)) {
                        setScheduledHour(String(curH).padStart(2, '0'));
                        setScheduledMinute(String(curM).padStart(2, '0'));
                      }
                    }
                  }}
                />
              </div>

              <div className="space-y-1">
                <label className="text-[10px] font-black text-slate-400 dark:text-slate-400 uppercase tracking-wider block">Hora de Alerta</label>
                <div className="bg-slate-50 dark:bg-slate-800/40 border border-slate-200 dark:border-slate-700 rounded-xl p-3 flex flex-col items-center gap-3">
                  <div className="flex items-center gap-4">
                    {/* Hour controls */}
                    <div className="flex flex-col items-center select-none">
                      <button 
                        type="button" 
                        onClick={() => {
                          let h = parseInt(scheduledHour) + 1;
                          if (h > 23) h = 0;
                          if (scheduledDate === getLocalDateString()) {
                            const curH = new Date().getHours();
                            if (h < curH) h = curH;
                          }
                          setScheduledHour(String(h).padStart(2, '0'));
                        }}
                        className="p-0.5 text-indigo-600 dark:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-slate-800 rounded-md"
                      >
                        <ChevronUp className="w-4 h-4" />
                      </button>
                      <span className="text-xl font-black text-slate-800 dark:text-white tracking-tight">{scheduledHour.padStart(2, '0')}</span>
                      <button 
                        type="button" 
                        onClick={() => {
                          let h = parseInt(scheduledHour) - 1;
                          if (h < 0) h = 23;
                          if (scheduledDate === getLocalDateString()) {
                            const curH = new Date().getHours();
                            if (h < curH) {
                              h = curH;
                            }
                          }
                          setScheduledHour(String(h).padStart(2, '0'));
                        }}
                        className="p-0.5 text-indigo-600 dark:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-slate-800 rounded-md"
                      >
                        <ChevronDown className="w-4 h-4" />
                      </button>
                    </div>

                    <span className="text-xl font-black text-slate-300 dark:text-slate-600 animate-pulse">:</span>

                    {/* Minute controls */}
                    <div className="flex flex-col items-center select-none">
                      <button 
                        type="button" 
                        onClick={() => {
                          let m = parseInt(scheduledMinute) + 1;
                          if (m > 59) m = 0;
                          if (scheduledDate === getLocalDateString() && parseInt(scheduledHour) === new Date().getHours()) {
                            const curM = new Date().getMinutes();
                            if (m < curM) m = curM;
                          }
                          setScheduledMinute(String(m).padStart(2, '0'));
                        }}
                        className="p-0.5 text-indigo-600 dark:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-slate-800 rounded-md"
                      >
                        <ChevronUp className="w-4 h-4" />
                      </button>
                      <span className="text-xl font-black text-slate-800 dark:text-white tracking-tight">{scheduledMinute.padStart(2, '0')}</span>
                      <button 
                        type="button" 
                        onClick={() => {
                          let m = parseInt(scheduledMinute) - 1;
                          if (m < 0) m = 59;
                          if (scheduledDate === getLocalDateString() && parseInt(scheduledHour) === new Date().getHours()) {
                            const curM = new Date().getMinutes();
                            if (m < curM) m = curM;
                          }
                          setScheduledMinute(String(m).padStart(2, '0'));
                        }}
                        className="p-0.5 text-indigo-600 dark:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-slate-800 rounded-md"
                      >
                        <ChevronDown className="w-4 h-4" />
                      </button>
                    </div>
                  </div>

                  {/* AM/PM Toggle */}
                  <div className="flex justify-center gap-1.5">
                    <button
                      type="button"
                      disabled={scheduledDate === getLocalDateString() && new Date().getHours() >= 12}
                      onClick={() => {
                        let h = parseInt(scheduledHour);
                        if (h >= 12) h -= 12;
                        if (scheduledDate === getLocalDateString()) {
                          const curH = new Date().getHours();
                          if (h < curH) h = curH;
                        }
                        setScheduledHour(String(h).padStart(2, '0'));
                      }}
                      className={`px-3 py-1 rounded-lg text-[9px] font-black transition-all ${
                        parseInt(scheduledHour) < 12 
                          ? 'bg-indigo-600 text-white shadow-sm' 
                          : 'bg-white dark:bg-slate-850 hover:bg-slate-100 border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300'
                      } ${(scheduledDate === getLocalDateString() && new Date().getHours() >= 12) ? 'opacity-40 cursor-not-allowed' : ''}`}
                    >
                      AM
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        let h = parseInt(scheduledHour);
                        if (h < 12) h += 12;
                        if (scheduledDate === getLocalDateString()) {
                          const curH = new Date().getHours();
                          if (h < curH) h = curH;
                        }
                        setScheduledHour(String(h).padStart(2, '0'));
                      }}
                      className={`px-3 py-1 rounded-lg text-[9px] font-black transition-all ${
                        parseInt(scheduledHour) >= 12 
                          ? 'bg-indigo-600 text-white shadow-sm' 
                          : 'bg-white dark:bg-slate-850 hover:bg-slate-100 border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300'
                      }`}
                    >
                      PM
                    </button>
                  </div>

                  {/* Shortcuts */}
                  <div className="flex justify-center gap-1.5 flex-wrap">
                    {['00', '15', '30', '45'].map((min) => {
                      const isDisabled = scheduledDate === getLocalDateString() && 
                        parseInt(scheduledHour) === new Date().getHours() && 
                        parseInt(min) < new Date().getMinutes();
                      return (
                        <button
                          key={min}
                          type="button"
                          disabled={isDisabled}
                          onClick={() => setScheduledMinute(min)}
                          className={`px-2.5 py-1 rounded-lg text-[9px] font-black transition-all ${
                            scheduledMinute === min 
                              ? 'bg-indigo-600 text-white shadow-sm' 
                              : 'bg-white dark:bg-slate-850 hover:bg-slate-100 border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300'
                          } ${isDisabled ? 'opacity-40 cursor-not-allowed' : ''}`}
                        >
                          :{min}
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>
            </div>

            {/* Photos */}
            <div className="space-y-2">
              <label className="text-[10px] font-black text-slate-400 dark:text-slate-400 uppercase tracking-wider block">Adjuntar Fotos de Soporte ({photos.length}/3)</label>
              <div className="flex flex-wrap gap-2.5 items-center">
                {photos.map((p, idx) => (
                  <div key={idx} className="w-14 h-14 rounded-2xl border border-slate-200 dark:border-slate-750 overflow-hidden relative group shrink-0">
                    <img src={p} className="w-full h-full object-cover" />
                    <button 
                      type="button" 
                      onClick={() => setPhotos(prev => prev.filter((_, i) => i !== idx))} 
                      className="absolute inset-0 bg-rose-600/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center text-white"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                ))}
                {isUploadingPhoto && (
                  <div className="w-14 h-14 rounded-2xl border-2 border-indigo-100 bg-indigo-50/10 flex flex-col items-center justify-center animate-pulse shrink-0">
                    <RefreshCw className="w-4 h-4 text-indigo-500 animate-spin" />
                    <span className="text-[7px] text-indigo-600 font-bold mt-1">SUBIENDO</span>
                  </div>
                )}
                {photos.length < 3 && !isUploadingPhoto && (
                  <label className="w-14 h-14 rounded-2xl border-2 border-dashed border-indigo-200 dark:border-indigo-800 bg-indigo-50/20 dark:bg-slate-800/40 flex flex-col items-center justify-center cursor-pointer hover:bg-indigo-50 dark:hover:bg-slate-800 transition-colors shrink-0">
                    <Camera className="w-5 h-5 text-indigo-400 dark:text-indigo-500" />
                    <input type="file" accept="image/*" className="hidden" onChange={handlePhotoUpload} />
                  </label>
                )}
              </div>
            </div>

            <div className="pt-3 flex justify-end gap-2 border-t border-slate-100 dark:border-slate-800">
              <button 
                type="button" 
                onClick={() => setShowAddForm(false)}
                disabled={isUploadingPhoto}
                className="px-5 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 text-xs font-black uppercase transition-colors disabled:opacity-50"
              >
                Cancelar
              </button>
              <button 
                type="submit"
                disabled={isUploadingPhoto}
                className={`px-6 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-black uppercase shadow-md transition-colors ${
                  isUploadingPhoto ? 'opacity-50 cursor-not-allowed' : ''
                }`}
              >
                {isUploadingPhoto ? 'Subiendo...' : 'Agendar'}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};
