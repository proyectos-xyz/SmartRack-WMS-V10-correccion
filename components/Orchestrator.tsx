
import React, { useState, useEffect } from 'react';
import { Task } from '../types';
// Fix: Added ListChecks to the import from './Icons'
import { PlusCircle, CheckCircle, Clock, User, Camera, Trash, Bell, XCircle, Search, ListChecks } from './Icons';
import { ChevronUp, ChevronDown } from 'lucide-react';

interface OrchestratorProps {
  tasks: Task[];
  onAddTask: (task: Task) => void;
  onUpdateTask: (taskId: string, updates: Partial<Task>) => void;
  onDeleteTask: (taskId: string) => void;
}

const getLocalDateString = (d: Date = new Date()) => {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const Orchestrator: React.FC<OrchestratorProps> = ({ tasks, onAddTask, onUpdateTask, onDeleteTask }) => {
  const [activeView, setActiveView] = useState<'PENDING' | 'HISTORY'>('PENDING');
  const [showModal, setShowModal] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [priorityFilter, setPriorityFilter] = useState<'TODAS' | 'BAJA' | 'MEDIA' | 'ALTA'>('TODAS');
  const [selectedPhoto, setSelectedPhoto] = useState<string | null>(null);

  // Form State
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [photos, setPhotos] = useState<string[]>([]);
  const [creator] = useState('Admin');
  const [scheduledDate, setScheduledDate] = useState(() => getLocalDateString());
  const [selectedHour, setSelectedHour] = useState(() => String(new Date().getHours()).padStart(2, '0'));
  const [selectedMinute, setSelectedMinute] = useState(() => String(new Date().getMinutes()).padStart(2, '0'));

  // Alarm state
  const [isAlarmActive, setIsAlarmActive] = useState(false);

  // Sound Alarm Logic
  useEffect(() => {
    let lastAlarmDate = '';
    
    const interval = setInterval(() => {
      const now = new Date();
      const todayStr = now.toDateString();
      
      // Trigger alarm if it's past midnight and we haven't triggered today yet
      // We check if it's between 00:00 and 00:10 to avoid triggering if the app is opened late in the day
      if (now.getHours() === 0 && now.getMinutes() < 10 && lastAlarmDate !== todayStr) {
        const hasPending = tasks.some(t => t.status === 'PENDIENTE');
        if (hasPending) {
          lastAlarmDate = todayStr;
          setIsAlarmActive(true);
          playAlarmSound();
        }
      }
    }, 5000); // Check every 5 seconds
    return () => clearInterval(interval);
  }, [tasks]);

  const playAlarmSound = () => {
    // Generate simple beep sound via Web Audio API
    try {
      const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
      const oscillator = audioCtx.createOscillator();
      const gainNode = audioCtx.createGain();
      oscillator.connect(gainNode);
      gainNode.connect(audioCtx.destination);
      oscillator.type = 'sine';
      oscillator.frequency.setValueAtTime(440, audioCtx.currentTime);
      gainNode.gain.setValueAtTime(0.5, audioCtx.currentTime);
      oscillator.start();
      oscillator.stop(audioCtx.currentTime + 3); // 3 seconds beep
    } catch (e) {
      console.error("Audio error", e);
    }
  };

  const handlePhotoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

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

  const handleAddTask = (e: React.FormEvent) => {
    e.preventDefault();
    const formattedTime = `${selectedHour.padStart(2, '0')}:${selectedMinute.padStart(2, '0')}:00`;
    const newTask: Task = {
      id: Date.now().toString(),
      title,
      description,
      priority: 'ALTA',
      status: 'PENDIENTE',
      createdAt: new Date().toISOString(),
      photos,
      createdBy: creator,
      scheduledDate,
      alertTime: formattedTime,
      history: [
        {
          action: "CREACIÓN",
          timestamp: new Date().toISOString(),
          user: creator,
          comment: `Tarea agendada para ${scheduledDate} a las ${formattedTime}`
        }
      ]
    };
    onAddTask(newTask);
    setShowModal(false);
    resetForm();
  };

  const resetForm = () => {
    setTitle('');
    setDescription('');
    setPhotos([]);
    setScheduledDate(getLocalDateString());
    const d = new Date();
    setSelectedHour(String(d.getHours()).padStart(2, '0'));
    setSelectedMinute(String(d.getMinutes()).padStart(2, '0'));
  };

  const filteredTasks = tasks.filter(t => 
    (activeView === 'PENDING' ? t.status === 'PENDIENTE' : t.status === 'REALIZADO') &&
    (priorityFilter === 'TODAS' || t.priority === priorityFilter) &&
    (t.title.toLowerCase().includes(searchTerm.toLowerCase()) || t.description.toLowerCase().includes(searchTerm.toLowerCase()))
  );

  return (
    <div className="flex flex-col h-full bg-zinc-50 font-sans">
      {/* Alarm Banner */}
      {isAlarmActive && (
        <div className="bg-rose-600 text-white p-4 text-center animate-pulse flex items-center justify-center gap-4 z-50">
          <Bell className="w-6 h-6" />
          <span className="font-black uppercase tracking-widest">ALERTA: TAREAS PENDIENTES A MEDIANOCHE</span>
          <button onClick={() => setIsAlarmActive(false)} className="bg-white text-rose-600 px-4 py-1 rounded-full font-bold text-xs">DETENER</button>
        </div>
      )}

      {/* Header Panel */}
      <div className="bg-white border-b border-zinc-200 px-4 pt-4 flex flex-col gap-4 sticky top-0 z-30 shadow-sm">
        <div className="flex justify-between items-center">
            <h2 className="text-2xl font-black text-indigo-900 flex items-center gap-3">
                <ListChecks className="w-8 h-8 text-indigo-600" />
                ORQUESTADOR DE TAREAS
            </h2>
            <button 
                onClick={() => setShowModal(true)}
                className="bg-indigo-600 hover:bg-indigo-700 text-white px-6 py-3 rounded-2xl font-black text-xs uppercase shadow-xl shadow-indigo-200 transition-all flex items-center gap-2"
            >
                <PlusCircle className="w-5 h-5"/> NUEVA TAREA
            </button>
        </div>

        <div className="flex items-center gap-6">
            <button 
                onClick={() => setActiveView('PENDING')}
                className={`pb-3 text-sm font-bold border-b-4 transition-all ${activeView === 'PENDING' ? 'border-indigo-600 text-indigo-600' : 'border-transparent text-zinc-400 hover:text-zinc-600'}`}
            >
                Pendientes ({tasks.filter(t => t.status === 'PENDIENTE').length})
            </button>
            <button 
                onClick={() => setActiveView('HISTORY')}
                className={`pb-3 text-sm font-bold border-b-4 transition-all ${activeView === 'HISTORY' ? 'border-emerald-600 text-emerald-600' : 'border-transparent text-zinc-400 hover:text-zinc-600'}`}
            >
                Historial de Realizados
            </button>
            
            <div className="ml-auto flex items-center gap-4 w-full max-w-xl mb-3">
                <select 
                    className="bg-zinc-100 border-none rounded-2xl px-4 py-2.5 text-xs font-bold focus:ring-2 focus:ring-indigo-500 outline-none appearance-none cursor-pointer"
                    value={priorityFilter}
                    onChange={e => setPriorityFilter(e.target.value as any)}
                >
                    <option value="TODAS">TODAS LAS PRIORIDADES</option>
                    <option value="BAJA">PRIORIDAD BAJA</option>
                    <option value="MEDIA">PRIORIDAD MEDIA</option>
                    <option value="ALTA">PRIORIDAD ALTA</option>
                </select>

                <div className="relative flex-1">
                    <input 
                        type="text" 
                        placeholder="Buscar tarea..."
                        className="w-full bg-zinc-100 border-none rounded-2xl pl-10 pr-4 py-2.5 text-xs font-medium focus:ring-2 focus:ring-indigo-500 outline-none"
                        value={searchTerm}
                        onChange={e => setSearchTerm(e.target.value)}
                    />
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400 w-4 h-4"/>
                </div>
            </div>
        </div>
      </div>

      {/* Tasks List Area */}
      <div className="flex-1 overflow-y-auto p-6 space-y-4">
        {filteredTasks.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-zinc-300 opacity-50">
            <ListChecks className="w-20 h-20 mb-4" />
            <p className="font-bold uppercase tracking-widest">No hay tareas para mostrar</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {filteredTasks.map(task => (
              <div key={task.id} className="bg-white rounded-3xl p-6 border border-zinc-200 shadow-sm hover:shadow-xl transition-all group flex flex-col h-full">
                <div className="flex justify-between items-start mb-4">
                  <span className={`px-3 py-1 rounded-full text-[10px] font-black uppercase ${
                    task.priority === 'ALTA' ? 'bg-rose-100 text-rose-700' :
                    task.priority === 'MEDIA' ? 'bg-amber-100 text-amber-700' : 'bg-zinc-100 text-zinc-700'
                  }`}>
                    Prioridad {task.priority}
                  </span>
                  {activeView === 'PENDING' && (
                    <button onClick={() => onDeleteTask(task.id)} className="text-zinc-300 hover:text-rose-500 transition-colors">
                      <Trash className="w-5 h-5" />
                    </button>
                  )}
                </div>

                <h3 className="text-lg font-black text-indigo-900 mb-2">{task.title}</h3>
                <p className="text-zinc-500 text-sm mb-4 flex-1">{task.description}</p>

                {task.photos.length > 0 && (
                    <div className="flex gap-2 overflow-x-auto pb-2 mb-4 no-scrollbar">
                        {task.photos.map((photo, i) => (
                            <img 
                                key={i} 
                                src={photo} 
                                className="w-16 h-16 rounded-xl object-cover border border-zinc-100 shrink-0 cursor-pointer hover:scale-105 transition-transform" 
                                alt="task step" 
                                onClick={() => setSelectedPhoto(photo)}
                            />
                        ))}
                    </div>
                )}

                <div className="border-t border-zinc-50 pt-4 mt-auto space-y-3">
                  <div className="flex items-center justify-between text-[10px] text-zinc-400 font-bold uppercase tracking-tight">
                    <div className="flex items-center gap-1"><User className="w-3 h-3"/> {task.createdBy}</div>
                    <div className="flex items-center gap-1"><Clock className="w-3 h-3"/> {new Date(task.createdAt).toLocaleString()}</div>
                  </div>

                  {task.status === 'PENDIENTE' ? (
                    <button 
                      onClick={() => onUpdateTask(task.id, { status: 'REALIZADO', completedAt: new Date().toISOString(), completedBy: 'Operador B' })}
                      className="w-full bg-emerald-50 text-emerald-700 py-3 rounded-2xl font-black text-xs uppercase hover:bg-emerald-600 hover:text-white transition-all flex justify-center items-center gap-2"
                    >
                      <CheckCircle className="w-4 h-4" /> MARCAR COMO REALIZADO
                    </button>
                  ) : (
                    <div className="bg-emerald-100 text-emerald-800 p-3 rounded-2xl text-[10px] font-black uppercase flex flex-col items-center gap-1">
                      <span>Realizado por {task.completedBy}</span>
                      <span>{new Date(task.completedAt!).toLocaleString()}</span>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Modal: Nueva Tarea */}
      {showModal && (
        <div className="fixed inset-0 z-50 bg-indigo-950/80 backdrop-blur-md flex items-center justify-center p-0 md:p-4 text-slate-800">
          <div className="bg-white w-full max-w-lg h-full md:h-auto max-h-[100vh] md:max-h-[92vh] rounded-none md:rounded-[2.5rem] shadow-2xl flex flex-col overflow-hidden animate-fade-in">
            <div className="bg-indigo-600 p-6 md:p-8 text-white relative shrink-0">
                <button onClick={() => setShowModal(false)} className="absolute top-5 right-5 text-white/50 hover:text-white transition-colors">
                    <XCircle className="w-8 h-8" />
                </button>
                <h2 className="text-2xl md:text-3xl font-black uppercase tracking-tighter leading-none">Nueva Tarea</h2>
                <p className="text-indigo-200 text-xs md:text-sm font-bold mt-1 uppercase tracking-widest">ORGANIZA EL FLUJO DE TRABAJO</p>
            </div>

            <form onSubmit={handleAddTask} className="p-6 md:p-8 space-y-5 overflow-y-auto flex-1">
                <div className="space-y-1.5">
                    <label className="text-[10px] font-black text-zinc-400 uppercase tracking-widest block">Título de la Tarea</label>
                    <input 
                        required 
                        type="text" 
                        className="w-full bg-zinc-50 border border-zinc-200/50 rounded-2xl p-4 text-sm font-bold focus:ring-4 focus:ring-indigo-100 outline-none" 
                        placeholder="Ej. Limpieza de Cámara 02"
                        value={title}
                        onChange={e => setTitle(e.target.value)}
                    />
                </div>

                <div className="space-y-1.5">
                    <label className="text-[10px] font-black text-zinc-400 uppercase tracking-widest block">Descripción</label>
                    <textarea 
                        required 
                        rows={3}
                        className="w-full bg-zinc-50 border border-zinc-200/50 rounded-2xl p-4 text-sm font-medium focus:ring-4 focus:ring-indigo-100 outline-none" 
                        placeholder="Detalle la tarea a realizar..."
                        value={description}
                        onChange={e => setDescription(e.target.value)}
                    />
                </div>

                <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                        <label className="text-[10px] font-black text-zinc-400 uppercase tracking-widest block">Fecha Programada</label>
                        <input 
                            type="date"
                            required
                            className="w-full bg-zinc-50 border border-zinc-200/50 rounded-2xl p-4 text-sm font-bold focus:ring-4 focus:ring-indigo-100 outline-none"
                            value={scheduledDate}
                            onChange={e => setScheduledDate(e.target.value)}
                        />
                    </div>
                    <div className="space-y-1.5">
                         <label className="text-[10px] font-black text-zinc-400 uppercase tracking-widest block">Solicitante</label>
                         <input type="text" className="w-full bg-zinc-100 border border-zinc-200/50 rounded-2xl p-4 text-sm font-bold text-zinc-400 cursor-not-allowed" value={creator} readOnly />
                    </div>
                </div>

                {/* Modern Custom Hour and Minute Picker */}
                <div className="space-y-2">
                    <label className="text-[10px] font-black text-zinc-400 uppercase tracking-widest block">Hora de Alerta</label>
                    <div className="bg-zinc-50 border border-zinc-100 rounded-3xl p-4 flex flex-col items-center gap-4">
                        {/* Interactive Time Selector */}
                        <div className="flex items-center gap-6">
                            {/* Hour Selector */}
                            <div className="flex flex-col items-center select-none">
                                <button 
                                    type="button" 
                                    onClick={() => {
                                        let h = parseInt(selectedHour) + 1;
                                        if (h > 23) h = 0;
                                        setSelectedHour(String(h).padStart(2, '0'));
                                    }}
                                    className="p-1.5 text-indigo-600 hover:bg-indigo-50 rounded-xl transition-all active:scale-95"
                                >
                                    <ChevronUp className="w-5 h-5" />
                                </button>
                                <span className="text-3xl font-black text-slate-800 tracking-tight">{selectedHour}</span>
                                <button 
                                    type="button" 
                                    onClick={() => {
                                        let h = parseInt(selectedHour) - 1;
                                        if (h < 0) h = 23;
                                        setSelectedHour(String(h).padStart(2, '0'));
                                    }}
                                    className="p-1.5 text-indigo-600 hover:bg-indigo-50 rounded-xl transition-all active:scale-95"
                                >
                                    <ChevronDown className="w-5 h-5" />
                                </button>
                            </div>
                            
                            <span className="text-3xl font-black text-indigo-200 animate-pulse">:</span>
                            
                            {/* Minute Selector */}
                            <div className="flex flex-col items-center select-none">
                                <button 
                                    type="button" 
                                    onClick={() => {
                                        let m = parseInt(selectedMinute) + 1;
                                        if (m > 59) m = 0;
                                        setSelectedMinute(String(m).padStart(2, '0'));
                                    }}
                                    className="p-1.5 text-indigo-600 hover:bg-indigo-50 rounded-xl transition-all active:scale-95"
                                >
                                    <ChevronUp className="w-5 h-5" />
                                </button>
                                <span className="text-3xl font-black text-slate-800 tracking-tight">{selectedMinute}</span>
                                <button 
                                    type="button" 
                                    onClick={() => {
                                        let m = parseInt(selectedMinute) - 1;
                                        if (m < 0) m = 59;
                                        setSelectedMinute(String(m).padStart(2, '0'));
                                    }}
                                    className="p-1.5 text-indigo-600 hover:bg-indigo-50 rounded-xl transition-all active:scale-95"
                                >
                                    <ChevronDown className="w-5 h-5" />
                                </button>
                            </div>
                        </div>

                        {/* Quick Selection Shortcuts */}
                        <div className="w-full space-y-3 pt-2 border-t border-zinc-200/50">
                            <div>
                                <span className="text-[9px] font-black uppercase text-zinc-400 tracking-widest block text-center mb-1.5">Ajuste Rápido de Minuto</span>
                                <div className="flex justify-center gap-1.5">
                                    {['00', '15', '30', '45'].map((min) => (
                                        <button
                                            key={min}
                                            type="button"
                                            onClick={() => setSelectedMinute(min)}
                                            className={`px-3 py-1.5 rounded-xl text-xs font-black transition-all ${
                                                selectedMinute === min 
                                                ? 'bg-indigo-600 text-white shadow-md shadow-indigo-100' 
                                                : 'bg-white hover:bg-zinc-100 border border-zinc-200/60 text-zinc-650'
                                            }`}
                                        >
                                            :{min}
                                        </button>
                                    ))}
                                </div>
                            </div>
                            <div>
                                <span className="text-[9px] font-black uppercase text-zinc-400 tracking-widest block text-center mb-1.5">Ajuste Rápido de Hora</span>
                                <div className="flex justify-center gap-1.5">
                                    {['08', '12', '16', '20', '00'].map((hr) => (
                                        <button
                                            key={hr}
                                            type="button"
                                            onClick={() => setSelectedHour(hr)}
                                            className={`px-3 py-1.5 rounded-xl text-xs font-black transition-all ${
                                                selectedHour === hr 
                                                ? 'bg-indigo-600 text-white shadow-md shadow-indigo-100' 
                                                : 'bg-white hover:bg-zinc-100 border border-zinc-200/60 text-zinc-650'
                                            }`}
                                        >
                                            {hr}:00
                                        </button>
                                    ))}
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                <div className="space-y-1.5">
                    <label className="text-[10px] font-black text-zinc-400 uppercase tracking-widest block">Fotos de Apoyo ({photos.length}/5)</label>
                    <div className="flex flex-wrap gap-3">
                        {photos.map((p, i) => (
                            <div key={i} className="w-16 h-16 rounded-2xl border border-zinc-200 overflow-hidden relative group">
                                <img src={p} className="w-full h-full object-cover" />
                                <button type="button" onClick={() => setPhotos(prev => prev.filter((_, idx) => idx !== i))} className="absolute inset-0 bg-rose-600/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center text-white">
                                    <Trash className="w-4 h-4" />
                                </button>
                            </div>
                        ))}
                        {photos.length < 5 && (
                            <label className="w-16 h-16 rounded-2xl border-2 border-dashed border-indigo-200 bg-indigo-50/50 flex flex-col items-center justify-center cursor-pointer hover:bg-indigo-100 transition-colors">
                                <Camera className="w-6 h-6 text-indigo-400" />
                                <input type="file" accept="image/*" className="hidden" onChange={handlePhotoUpload} />
                            </label>
                        )}
                    </div>
                    <span className="text-[9px] text-zinc-400 block font-medium">Las imágenes se optimizan y comprimen automáticamente antes de cargarse para conservar almacenamiento.</span>
                </div>

                <button type="submit" className="w-full bg-indigo-600 py-4 rounded-2xl text-white font-black text-sm uppercase shadow-xl hover:bg-indigo-700 transition-colors shrink-0">
                    CREAR TAREA AHORA
                </button>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Ver Foto */}
      {selectedPhoto && (
        <div className="fixed inset-0 z-[100] bg-black/90 backdrop-blur-sm flex items-center justify-center p-4" onClick={() => setSelectedPhoto(null)}>
            <div className="relative max-w-4xl w-full h-full flex items-center justify-center">
                <img src={selectedPhoto} className="max-w-full max-h-full object-contain rounded-2xl shadow-2xl" alt="Full size" />
                <button className="absolute top-4 right-4 text-white hover:text-rose-500 transition-colors">
                    <XCircle className="w-10 h-10" />
                </button>
            </div>
        </div>
      )}
    </div>
  );
};

export default Orchestrator;
