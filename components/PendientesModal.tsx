import React, { useState } from 'react';
import { Task } from '../types';
import { 
  XCircle, Clock, Camera, Trash2, 
  Search, Bell, RefreshCw, 
  Check, Ban, PlusCircle, ChevronDown, ChevronUp,
  ClipboardList
} from 'lucide-react';

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

  const handlePhotoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
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

    if (photos.length >= 5) {
      alert("Límite alcanzado: Solo se permiten hasta 5 fotos de apoyo.");
      return;
    }

    const reader = new FileReader();
    reader.onload = (event) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        let width = img.width;
        let height = img.height;

        const MAX_WIDTH = 800;
        const MAX_HEIGHT = 800;

        if (width > height) {
          if (width > MAX_WIDTH) {
            height *= MAX_WIDTH / width;
            width = MAX_WIDTH;
          }
        } else {
          if (height > MAX_HEIGHT) {
            width *= MAX_HEIGHT / height;
            height = MAX_HEIGHT;
          }
        }

        canvas.width = width;
        canvas.height = height;

        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.drawImage(img, 0, 0, width, height);
          const optimizedBase64 = canvas.toDataURL('image/jpeg', 0.6);
          setPhotos(prev => [...prev, optimizedBase64]);
        }
      };
      img.src = event.target?.result as string;
    };
    reader.readAsDataURL(file);
  };

  const handleCreateTask = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !description.trim()) return;

    const formattedTime = `${scheduledHour.padStart(2, '0')}:${scheduledMinute.padStart(2, '0')}:${scheduledSecond.padStart(2, '0')}`;
    const creatorName = currentUser?.nombre || currentUser?.username || 'Admin';

    const newTask: Task = {
      id: Date.now().toString(),
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
    const userName = currentUser?.nombre || currentUser?.username || 'Usuario';
    onTaskDone(taskId, userName);
  };

  const handleRescheduleSubmit = (taskId: string) => {
    const userName = currentUser?.nombre || currentUser?.username || 'Usuario';
    const formattedTime = `${reschedHour.padStart(2, '0')}:${reschedMinute.padStart(2, '0')}:${reschedSecond.padStart(2, '0')}`;
    onTaskReschedule(taskId, reschedDate, formattedTime, userName, reschedComment);
    setReschedulingTaskId(null);
    setReschedComment('');
  };

  const handleCancelSubmit = (taskId: string) => {
    const userName = currentUser?.nombre || currentUser?.username || 'Usuario';
    onTaskCancel(taskId, userName, cancelComment);
    setCancelingTaskId(null);
    setCancelComment('');
  };

  // Filter logic
  const filteredTasks = tasks.filter(t => {
    // Search filter
    const matchesSearch = t.title.toLowerCase().includes(searchTerm.toLowerCase()) || 
                          t.description.toLowerCase().includes(searchTerm.toLowerCase());
    
    if (!matchesSearch) return false;

    // Tab filters
    if (activeTab === 'HOY') {
      return t.status === 'PENDIENTE' && t.scheduledDate === todayStr;
    } else if (activeTab === 'TODAS') {
      return t.status === 'PENDIENTE';
    } else {
      // HISTORIAL
      return t.status === 'REALIZADO' || t.status === 'CANCELADO';
    }
  });

  return (
    <div className="fixed inset-0 bg-slate-900/70 backdrop-blur-md z-[99] flex items-center justify-center p-0 text-slate-800">
      <div className={`w-screen h-screen rounded-none ${isDarkMode ? 'bg-slate-900 text-white' : 'bg-white text-slate-800'} shadow-none flex flex-col overflow-hidden`}>
        
        {/* Header Panel */}
        <div className="p-3.5 md:p-6 border-b border-slate-200 flex items-center justify-between bg-gradient-to-tr from-[#009ED6] to-indigo-600 text-white shrink-0">
          <div className="flex items-center gap-2.5 md:gap-3">
            <div className="bg-white/20 p-2 rounded-2xl shrink-0">
              <Bell className="w-5 h-5 md:w-6 md:h-6 text-white animate-bounce" />
            </div>
            <div>
              <h2 className="text-sm md:text-xl font-black uppercase tracking-tight leading-none">PENDIENTES DEL TURNO</h2>
              <p className="text-[9px] md:text-xs text-white/80 font-medium mt-1 uppercase tracking-wider line-clamp-1">Tareas diarias y alertas de cumplimiento</p>
            </div>
          </div>
          <button 
            onClick={onClose}
            className="p-1.5 md:p-2 rounded-xl bg-white/10 hover:bg-white/20 transition-all text-white active:scale-95 shrink-0"
          >
            <XCircle className="w-5 h-5 md:w-6 md:h-6" />
          </button>
        </div>

        {/* Tab Filters and Action Row */}
        <div className="flex flex-col md:flex-row md:items-center justify-between border-b border-slate-200 px-6 py-3 bg-slate-50 dark:bg-slate-900/40 gap-4">
          <div className="flex gap-4">
            <button
              onClick={() => { setActiveTab('HOY'); setShowAddForm(false); }}
              className={`pb-2.5 pt-1.5 text-xs font-black uppercase tracking-wider border-b-2 transition-all ${
                activeTab === 'HOY' 
                  ? 'text-indigo-600 border-indigo-600 font-bold' 
                  : 'text-slate-400 hover:text-slate-600 border-transparent'
              }`}
            >
              De Hoy ({tasks.filter(t => t.status === 'PENDIENTE' && t.scheduledDate === todayStr).length})
            </button>
            <button
              onClick={() => { setActiveTab('TODAS'); setShowAddForm(false); }}
              className={`pb-2.5 pt-1.5 text-xs font-black uppercase tracking-wider border-b-2 transition-all ${
                activeTab === 'TODAS' 
                  ? 'text-indigo-600 border-indigo-600 font-bold' 
                  : 'text-slate-400 hover:text-slate-600 border-transparent'
              }`}
            >
              Todas las Programadas ({tasks.filter(t => t.status === 'PENDIENTE').length})
            </button>
            <button
              onClick={() => { setActiveTab('HISTORIAL'); setShowAddForm(false); }}
              className={`pb-2.5 pt-1.5 text-xs font-black uppercase tracking-wider border-b-2 transition-all ${
                activeTab === 'HISTORIAL' 
                  ? 'text-emerald-600 border-emerald-600 font-bold' 
                  : 'text-slate-400 hover:text-slate-600 border-transparent'
              }`}
            >
              Históricos / Realizados ({tasks.filter(t => t.status === 'REALIZADO' || t.status === 'CANCELADO').length})
            </button>
          </div>

          <div className="flex flex-1 md:justify-end gap-3 max-w-lg items-center">
            <div className="relative flex-1">
              <input 
                type="text" 
                placeholder="Buscar pendiente..."
                className="w-full bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl pl-9 pr-4 py-1.5 text-xs font-medium focus:ring-2 focus:ring-indigo-500 outline-none text-slate-800 dark:text-white"
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
              />
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 w-4 h-4"/>
            </div>

            <button
              onClick={() => {
                setShowAddForm(!showAddForm);
                if (!showAddForm) resetForm();
              }}
              className="bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-xl font-black text-xs uppercase tracking-tight flex items-center gap-1.5 shrink-0 shadow-md active:scale-95 transition-transform"
            >
              <PlusCircle className="w-4 h-4" />
              Agendar Turno
            </button>
          </div>
        </div>

        {/* Modal Main Content Container */}
        <div className="flex-1 overflow-y-auto p-6 bg-slate-50 dark:bg-slate-900/20">
          
          {/* Nueva Tarea / Programación Form */}
          {showAddForm && (
            <form onSubmit={handleCreateTask} className="mb-6 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-3xl p-6 shadow-md animate-in slide-in-from-top-4 duration-200 space-y-4">
              <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                <h3 className="text-sm font-black text-indigo-900 dark:text-white uppercase flex items-center gap-1.5">
                  <PlusCircle className="w-5 h-5 text-indigo-600" />
                  Programar Nueva Alerta de Turno
                </h3>
                <button type="button" onClick={() => setShowAddForm(false)} className="text-slate-400 hover:text-slate-600">
                  <XCircle className="w-5 h-5" />
                </button>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="md:col-span-2 space-y-1">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-wider">Título de la Tarea / Alerta</label>
                  <input 
                    required 
                    type="text" 
                    placeholder="Ej. Realizar Control de Temperatura en Congelados"
                    className="w-full bg-slate-50 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-2.5 text-xs font-bold text-slate-800 dark:text-white focus:ring-2 focus:ring-indigo-500 outline-none"
                    value={title}
                    onChange={e => setTitle(e.target.value)}
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-wider">Creado Por</label>
                  <input 
                    type="text" 
                    readOnly
                    className="w-full bg-slate-100 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-750 rounded-xl px-4 py-2.5 text-xs font-bold text-slate-500 cursor-not-allowed outline-none"
                    value={currentUser?.nombre || currentUser?.username || 'Admin'}
                  />
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-wider">Detalles del Trabajo / Observaciones</label>
                <textarea 
                  required 
                  rows={2}
                  placeholder="Escriba aquí los detalles precisos de lo que se debe auditar o cumplir..."
                  className="w-full bg-slate-50 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-700 rounded-xl p-4 text-xs font-medium text-slate-800 dark:text-white focus:ring-2 focus:ring-indigo-500 outline-none"
                  value={description}
                  onChange={e => setDescription(e.target.value)}
                />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-wider">Día Programado</label>
                  <input 
                    type="date"
                    required
                    className="w-full bg-slate-50 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-2 text-xs font-bold text-slate-850 dark:text-white outline-none"
                    value={scheduledDate}
                    onChange={e => setScheduledDate(e.target.value)}
                  />
                </div>

                {/* Modern Custom Time Picker */}
                <div className="space-y-1">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-wider block">Hora de Alerta</label>
                  <div className="bg-slate-50 dark:bg-slate-900/40 border border-slate-200 dark:border-slate-700 rounded-xl p-3 flex flex-col items-center gap-3">
                    <div className="flex items-center gap-4">
                      {/* Hour controls */}
                      <div className="flex flex-col items-center select-none">
                        <button 
                          type="button" 
                          onClick={() => {
                            let h = parseInt(scheduledHour) + 1;
                            if (h > 23) h = 0;
                            setScheduledHour(String(h).padStart(2, '0'));
                          }}
                          className="p-0.5 text-indigo-600 dark:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-slate-800 rounded-md transition-colors"
                        >
                          <ChevronUp className="w-4 h-4" />
                        </button>
                        <span className="text-xl font-black text-slate-850 dark:text-white tracking-tight">{scheduledHour.padStart(2, '0')}</span>
                        <button 
                          type="button" 
                          onClick={() => {
                            let h = parseInt(scheduledHour) - 1;
                            if (h < 0) h = 23;
                            setScheduledHour(String(h).padStart(2, '0'));
                          }}
                          className="p-0.5 text-indigo-600 dark:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-slate-800 rounded-md transition-colors"
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
                            setScheduledMinute(String(m).padStart(2, '0'));
                          }}
                          className="p-0.5 text-indigo-600 dark:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-slate-800 rounded-md transition-colors"
                        >
                          <ChevronUp className="w-4 h-4" />
                        </button>
                        <span className="text-xl font-black text-slate-850 dark:text-white tracking-tight">{scheduledMinute.padStart(2, '0')}</span>
                        <button 
                          type="button" 
                          onClick={() => {
                            let m = parseInt(scheduledMinute) - 1;
                            if (m < 0) m = 59;
                            setScheduledMinute(String(m).padStart(2, '0'));
                          }}
                          className="p-0.5 text-indigo-600 dark:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-slate-800 rounded-md transition-colors"
                        >
                          <ChevronDown className="w-4 h-4" />
                        </button>
                      </div>
                    </div>

                    {/* Quick select minute shortcuts */}
                    <div className="flex justify-center gap-1 flex-wrap">
                      {['00', '15', '30', '45'].map((min) => (
                        <button
                          key={min}
                          type="button"
                          onClick={() => setScheduledMinute(min)}
                          className={`px-2 py-0.5 rounded-md text-[9px] font-black transition-all ${
                            scheduledMinute === min 
                              ? 'bg-indigo-600 text-white' 
                              : 'bg-white dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300'
                          }`}
                        >
                          :{min}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              </div>

              {/* Photos attachment list */}
              <div className="space-y-2">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-wider block">Evidencia Fotográfica de Soporte ({photos.length}/5)</label>
                <div className="flex flex-wrap gap-3 items-center">
                  {photos.map((p, idx) => (
                    <div key={idx} className="w-16 h-16 rounded-2xl border border-slate-200 overflow-hidden relative group shrink-0">
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
                  {photos.length < 5 && (
                    <label className="w-16 h-16 rounded-2xl border-2 border-dashed border-indigo-200 bg-indigo-50/50 flex flex-col items-center justify-center cursor-pointer hover:bg-indigo-55 dark:hover:bg-slate-800 transition-colors">
                      <Camera className="w-5 h-5 text-indigo-400" />
                      <input type="file" accept="image/*" className="hidden" onChange={handlePhotoUpload} />
                    </label>
                  )}
                </div>
                <span className="text-[9px] text-zinc-400 block font-medium">Las imágenes se optimizan y comprimen automáticamente antes de cargarse para conservar almacenamiento.</span>
              </div>

              <div className="pt-2 flex justify-end gap-2">
                <button 
                  type="button" 
                  onClick={() => { setShowAddForm(false); resetForm(); }}
                  className="px-5 py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-750 text-slate-600 dark:text-slate-350 text-xs font-black uppercase transition-colors"
                >
                  Cancelar
                </button>
                <button 
                  type="submit"
                  className="px-6 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-black uppercase shadow-lg shadow-indigo-100 dark:shadow-none transition-colors"
                >
                  Programar Alerta de Turno
                </button>
              </div>
            </form>
          )}

          {/* Dynamic Pending List Grid */}
          {filteredTasks.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 px-4 text-center bg-white dark:bg-slate-850 rounded-[2rem] border border-slate-100 dark:border-slate-800 shadow-sm">
              <div className="p-4 bg-indigo-50 dark:bg-slate-800 rounded-full mb-4">
                <ClipboardList className="w-10 h-10 text-indigo-600 dark:text-indigo-400" />
              </div>
              <h3 className="text-base font-black text-slate-800 dark:text-white uppercase tracking-tight">Sin Tareas Agendadas</h3>
              <p className="text-slate-400 text-xs mt-1 max-w-sm">No existen registros programados o auditorías para mostrar en la pestaña seleccionada.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {filteredTasks.map(task => {
                const isExpanded = !!expandedHistories[task.id];
                const isRescheduling = reschedulingTaskId === task.id;
                const isCanceling = cancelingTaskId === task.id;

                return (
                  <div 
                    key={task.id} 
                    className={`bg-white dark:bg-slate-850 border border-slate-200/65 dark:border-slate-800 rounded-[2rem] p-5 shadow-sm hover:shadow-md transition-all flex flex-col h-full relative overflow-hidden`}
                  >
                    {/* Top status header */}
                    <div className="flex items-center justify-between mb-3 border-b border-slate-50 dark:border-slate-800 pb-2.5">
                      <span className={`px-2.5 py-0.5 rounded-lg text-[9px] font-black uppercase ${
                        task.priority === 'ALTA' ? 'bg-red-50 text-red-600 border border-red-100' :
                        task.priority === 'MEDIA' ? 'bg-amber-50 text-amber-600 border border-amber-100' : 'bg-slate-50 text-slate-500'
                      }`}>
                        Prioridad {task.priority}
                      </span>

                      <span className={`px-2.5 py-0.5 rounded-lg text-[9px] font-black uppercase ${
                        task.status === 'REALIZADO' ? 'bg-emerald-50 text-emerald-600 border border-emerald-100' :
                        task.status === 'CANCELADO' ? 'bg-red-50 text-red-500 border border-red-100' : 'bg-indigo-50 text-indigo-600 animate-pulse border border-indigo-100'
                      }`}>
                        {task.status === 'REALIZADO' ? 'Hecho' : 
                         task.status === 'CANCELADO' ? 'Cancelada' : 'Pendiente'}
                      </span>
                    </div>

                    <h3 className="text-sm font-black text-slate-800 dark:text-white leading-snug mb-1">{task.title}</h3>
                    <p className="text-slate-500 dark:text-slate-400 text-xs leading-relaxed flex-1 mb-4">{task.description}</p>

                    {/* Support Evidence Photos */}
                    {task.photos && task.photos.length > 0 && (
                      <div className="flex gap-2 overflow-x-auto pb-2.5 mb-3 no-scrollbar">
                        {task.photos.map((p, idx) => (
                          <img 
                            key={idx} 
                            src={p} 
                            className="w-14 h-14 rounded-xl object-cover border border-slate-150 shrink-0 hover:scale-105 transition-transform" 
                            alt="Auditoría soporte" 
                          />
                        ))}
                      </div>
                    )}

                    {/* Scheduled Info Alert Alarm */}
                    <div className="bg-slate-50 dark:bg-slate-800/80 rounded-xl p-3 border border-slate-150 dark:border-slate-750 text-xs mb-4 space-y-1">
                      <div className="flex justify-between items-center">
                        <span className="text-slate-400 font-bold uppercase tracking-wider text-[9px]">Fecha de Alerta:</span>
                        <span className="font-extrabold text-slate-800 dark:text-white">{task.scheduledDate || '---'}</span>
                      </div>
                      <div className="flex justify-between items-center">
                        <span className="text-slate-400 font-bold uppercase tracking-wider text-[9px]">Hora Programada:</span>
                        <span className="font-black text-indigo-600 dark:text-indigo-400 flex items-center gap-1">
                          <Clock className="w-3.5 h-3.5 shrink-0" />
                          {task.alertTime || '---'}
                        </span>
                      </div>
                      <div className="flex justify-between items-center pt-1 border-t border-slate-200/30">
                        <span className="text-slate-400 font-bold uppercase tracking-wider text-[9px]">Asignado por:</span>
                        <span className="font-bold text-slate-600 dark:text-slate-300">{task.createdBy}</span>
                      </div>
                    </div>

                    {/* Action form render if inline editing is triggered */}
                    {isRescheduling && (
                      <div className="p-3 bg-amber-50/50 dark:bg-amber-900/10 border border-amber-200 dark:border-amber-800 rounded-xl space-y-3 mb-4 text-xs">
                        <p className="font-black text-amber-700 dark:text-amber-400 uppercase tracking-tight text-[10px]">Reprogramar Tarea de Turno</p>
                        
                        <div className="grid grid-cols-2 gap-2">
                          <div className="space-y-0.5">
                            <span className="text-[9px] text-slate-400 font-bold uppercase">Día</span>
                            <input 
                              type="date"
                              className="w-full bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-2 py-1 text-xs"
                              value={reschedDate}
                              onChange={e => setReschedDate(e.target.value)}
                            />
                          </div>

                          <div className="grid grid-cols-3 gap-1">
                            <div className="space-y-0.5">
                              <span className="text-[8px] text-slate-400 font-bold uppercase">H</span>
                              <input 
                                type="number" min="0" max="23"
                                className="w-full bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-1 py-1 text-xs font-bold"
                                value={reschedHour}
                                onChange={e => setReschedHour(e.target.value)}
                              />
                            </div>
                            <div className="space-y-0.5">
                              <span className="text-[8px] text-slate-400 font-bold uppercase">M</span>
                              <input 
                                type="number" min="0" max="59"
                                className="w-full bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-1 py-1 text-xs font-bold"
                                value={reschedMinute}
                                onChange={e => setReschedMinute(e.target.value)}
                              />
                            </div>
                            <div className="space-y-0.5">
                              <span className="text-[8px] text-slate-400 font-bold uppercase">S</span>
                              <input 
                                type="number" min="0" max="59"
                                className="w-full bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-1 py-1 text-xs font-bold"
                                value={reschedSecond}
                                onChange={e => setReschedSecond(e.target.value)}
                              />
                            </div>
                          </div>
                        </div>

                        <div className="space-y-0.5">
                          <span className="text-[9px] text-slate-400 font-bold uppercase">Motivo / Comentario de Reprogramación</span>
                          <input 
                            type="text"
                            placeholder="Ej. Esperar llegada de camión de provincia"
                            className="w-full bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-2 py-1 text-xs"
                            value={reschedComment}
                            onChange={e => setReschedComment(e.target.value)}
                          />
                        </div>

                        <div className="flex justify-end gap-1.5">
                          <button 
                            type="button" 
                            onClick={() => setReschedulingTaskId(null)}
                            className="px-2.5 py-1 bg-slate-100 hover:bg-slate-200 rounded text-[10px] font-bold uppercase"
                          >
                            Atrás
                          </button>
                          <button 
                            type="button" 
                            onClick={() => handleRescheduleSubmit(task.id)}
                            className="px-3 py-1 bg-amber-600 hover:bg-amber-700 text-white rounded text-[10px] font-black uppercase"
                          >
                            Guardar
                          </button>
                        </div>
                      </div>
                    )}

                    {isCanceling && (
                      <div className="p-3 bg-red-50/50 dark:bg-red-900/10 border border-red-200 dark:border-red-800 rounded-xl space-y-3 mb-4 text-xs">
                        <p className="font-black text-red-700 dark:text-red-400 uppercase tracking-tight text-[10px]">Cancelar Tarea</p>
                        
                        <div className="space-y-0.5">
                          <span className="text-[9px] text-slate-400 font-bold uppercase">Especificar motivo de cancelación</span>
                          <input 
                            type="text"
                            placeholder="Ej. Tarea ya no es necesaria"
                            required
                            className="w-full bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-2 py-1 text-xs"
                            value={cancelComment}
                            onChange={e => setCancelComment(e.target.value)}
                          />
                        </div>

                        <div className="flex justify-end gap-1.5">
                          <button 
                            type="button" 
                            onClick={() => setCancelingTaskId(null)}
                            className="px-2.5 py-1 bg-slate-100 hover:bg-slate-200 rounded text-[10px] font-bold uppercase"
                          >
                            Atrás
                          </button>
                          <button 
                            type="button" 
                            onClick={() => handleCancelSubmit(task.id)}
                            className="px-3 py-1 bg-red-650 hover:bg-red-750 bg-red-600 hover:bg-red-700 text-white rounded text-[10px] font-black uppercase"
                          >
                            Confirmar Cancelación
                          </button>
                        </div>
                      </div>
                    )}

                    {/* Operational Action buttons */}
                    {task.status === 'PENDIENTE' && !isRescheduling && !isCanceling && (
                      <div className="grid grid-cols-3 gap-2 border-t border-slate-100 dark:border-slate-800 pt-3">
                        <button
                          type="button"
                          onClick={() => handleDone(task.id)}
                          className="px-2 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-[10px] font-black uppercase rounded-xl flex items-center justify-center gap-1 active:scale-95 transition-all shadow-sm cursor-pointer"
                        >
                          <Check className="w-3.5 h-3.5" />
                          Hecho
                        </button>

                        <button
                          type="button"
                          onClick={() => {
                            setReschedulingTaskId(task.id);
                            setCancelingTaskId(null);
                            setReschedDate(task.scheduledDate || todayStr);
                            const tParts = (task.alertTime || '12:00:00').split(':');
                            setReschedHour(tParts[0] || '12');
                            setReschedMinute(tParts[1] || '00');
                            setReschedSecond(tParts[2] || '00');
                          }}
                          className="px-2 py-2 bg-amber-500 hover:bg-amber-600 text-white text-[10px] font-black uppercase rounded-xl flex items-center justify-center gap-1 active:scale-95 transition-all shadow-sm cursor-pointer"
                        >
                          <RefreshCw className="w-3.5 h-3.5" />
                          Reprog.
                        </button>

                        <button
                          type="button"
                          onClick={() => {
                            setCancelingTaskId(task.id);
                            setReschedulingTaskId(null);
                          }}
                          className="px-2 py-2 bg-red-600 hover:bg-red-700 text-white text-[10px] font-black uppercase rounded-xl flex items-center justify-center gap-1 active:scale-95 transition-all shadow-sm cursor-pointer"
                        >
                          <Ban className="w-3.5 h-3.5" />
                          Cancelar
                        </button>
                      </div>
                    )}

                    {/* Historical logs tracking sub-accordion */}
                    <div className="mt-3 border-t border-slate-50 dark:border-slate-850/50 pt-2.5">
                      <button
                        type="button"
                        onClick={() => toggleHistory(task.id)}
                        className="text-[9px] font-extrabold text-slate-400 hover:text-slate-600 flex items-center gap-1 uppercase tracking-tight outline-none"
                      >
                        {isExpanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                        Historial de Cambios ({task.history?.length || 1})
                      </button>

                      {isExpanded && (
                        <div className="mt-2.5 space-y-2 bg-slate-50 dark:bg-slate-800/40 p-2.5 rounded-xl border border-slate-100 dark:border-slate-800 max-h-40 overflow-y-auto custom-scrollbar">
                          {task.history && task.history.length > 0 ? (
                            task.history.map((h, i) => (
                              <div key={i} className="text-[10px] border-b border-slate-100 dark:border-slate-800 last:border-0 pb-1.5 last:pb-0 space-y-0.5">
                                <div className="flex justify-between items-center font-black">
                                  <span className={`px-1 rounded text-[8px] ${
                                    h.action === 'CREADO' ? 'bg-indigo-50 text-indigo-700' :
                                    h.action === 'REALIZADO' ? 'bg-emerald-50 text-emerald-700' :
                                    h.action === 'REPROGRAMADO' ? 'bg-amber-50 text-amber-700' : 'bg-red-55 text-red-700'
                                  }`}>{h.action}</span>
                                  <span className="text-slate-400 font-semibold">{new Date(h.timestamp).toLocaleTimeString('es-PE')}</span>
                                </div>
                                <p className="text-slate-600 dark:text-slate-300 font-medium">
                                  Por <strong className="text-slate-700 dark:text-slate-200">{h.user}</strong>: {h.comment || 'Sin comentarios.'}
                                </p>
                              </div>
                            ))
                          ) : (
                            <p className="text-[10px] text-slate-400 italic">No hay historial para mostrar.</p>
                          )}
                        </div>
                      )}
                    </div>

                    {/* Delete Option for Administrators only */}
                    {currentUser?.rol === 'ADMIN' && onDeleteTask && (
                      <button 
                        onClick={() => {
                          if (confirm('¿Está seguro de eliminar este pendiente permanentemente?')) {
                            onDeleteTask(task.id);
                          }
                        }}
                        className="absolute top-4 right-4 text-slate-300 hover:text-rose-500 transition-colors opacity-0 group-hover:opacity-100 focus:opacity-100"
                        title="Eliminar Pendiente"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          )}

        </div>

        {/* Footer */}
        <div className="p-4 border-t border-slate-200/60 bg-slate-50 dark:bg-slate-900/60 flex justify-end">
          <button
            onClick={onClose}
            className="px-6 py-2.5 bg-slate-200 hover:bg-slate-300 transition-colors text-slate-700 text-xs font-black uppercase tracking-wider rounded-xl active:scale-95"
          >
            Cerrar Pendientes
          </button>
        </div>

      </div>
    </div>
  );
};
