import React, { useState, useEffect, useRef } from 'react';
import { supabase } from '../supabaseClient';
import { 
  Bell, 
  Volume2, 
  Activity, 
  Building2, 
  CheckCircle2, 
  Play, 
  Wifi, 
  ShieldAlert, 
  Clock, 
  RefreshCw,
  LogOut
} from 'lucide-react';
import { Usuario } from '../types';

interface AlertMonitorProps {
  currentUser: Usuario | null;
  onLogout: () => void;
}

export const AlertMonitor: React.FC<AlertMonitorProps> = ({ currentUser, onLogout }) => {
  const [alerts, setAlerts] = useState<any[]>([]);
  const [isAudioEnabled, setIsAudioEnabled] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<Date>(new Date());
  const [bellAnimating, setBellAnimating] = useState(false);
  const [nextChimeInSeconds, setNextChimeInSeconds] = useState(600); // 10 minutes countdown
  
  const audioCtxRef = useRef<AudioContext | null>(null);
  const [customAlertSound, setCustomAlertSound] = useState<string | null>(null);

  useEffect(() => {
    const loadSound = async () => {
      if (currentUser?.sede_id) {
        try {
          const { data } = await supabase
            .from('sedes')
            .select('sonido_alerta')
            .eq('id', currentUser.sede_id)
            .single();
          if (data?.sonido_alerta) {
            setCustomAlertSound(data.sonido_alerta);
          } else {
            setCustomAlertSound(null);
          }
        } catch (err) {
          setCustomAlertSound(null);
        }
      } else {
        setCustomAlertSound(null);
      }
    };
    loadSound();
  }, [currentUser]);

  const pendingAlerts = alerts.filter(a => {
    if (a.estado !== undefined) {
      return a.estado === 'PENDIENTE';
    }
    return !a.recepcionado;
  });

  const pendingCount = pendingAlerts.length;

  const playWebAudioBellSound = () => {
    try {
      // Create or reuse audio context
      if (!audioCtxRef.current) {
        audioCtxRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
      }
      const audioCtx = audioCtxRef.current;
      if (audioCtx.state === 'suspended') {
        audioCtx.resume();
      }

      const now = audioCtx.currentTime;

      // 1. Fundamental chime frequency (D5 - ~587.33 Hz)
      const osc1 = audioCtx.createOscillator();
      const gain1 = audioCtx.createGain();
      osc1.type = 'sine';
      osc1.frequency.setValueAtTime(587.33, now);
      gain1.gain.setValueAtTime(0.5, now);
      gain1.gain.exponentialRampToValueAtTime(0.001, now + 2.5);
      
      // 2. High metallic overtone (A5 - ~880 Hz)
      const osc2 = audioCtx.createOscillator();
      const gain2 = audioCtx.createGain();
      osc2.type = 'sine';
      osc2.frequency.setValueAtTime(880, now);
      gain2.gain.setValueAtTime(0.3, now);
      gain2.gain.exponentialRampToValueAtTime(0.001, now + 1.5);

      // 3. Ultra-high crystalline sparkle (D6 - ~1174.66 Hz)
      const osc3 = audioCtx.createOscillator();
      const gain3 = audioCtx.createGain();
      osc3.type = 'sine';
      osc3.frequency.setValueAtTime(1174.66, now);
      gain3.gain.setValueAtTime(0.15, now);
      gain3.gain.exponentialRampToValueAtTime(0.001, now + 0.8);

      // Connections
      osc1.connect(gain1);
      gain1.connect(audioCtx.destination);

      osc2.connect(gain2);
      gain2.connect(audioCtx.destination);

      osc3.connect(gain3);
      gain3.connect(audioCtx.destination);

      // Start & Stop
      osc1.start(now);
      osc2.start(now);
      osc3.start(now);

      osc1.stop(now + 2.6);
      osc2.stop(now + 1.6);
      osc3.stop(now + 0.9);
    } catch (e) {
      console.error("Error playing metallic bell sound", e);
    }
  };

  // Synthesis of a beautiful metallic bell/chime sound
  const playBellSound = () => {
    try {
      setBellAnimating(true);
      setTimeout(() => setBellAnimating(false), 1200);

      // Check if sound alerts are active for the current user
      const isAlertaSonoraActive = currentUser?.alerta_sonora !== undefined && currentUser?.alerta_sonora !== null
        ? currentUser.alerta_sonora
        : (currentUser?.permisos?.['alerta_sonora'] !== false);

      if (!isAlertaSonoraActive) {
        console.log("Sound alert skipped: Deactivated for this user.");
        return;
      }

      if (customAlertSound) {
        const audio = new Audio(customAlertSound);
        audio.play().catch(err => {
          console.warn("Failed to play custom MP3 alert sound, falling back to Web Audio API: ", err);
          playWebAudioBellSound();
        });
      } else {
        playWebAudioBellSound();
      }
    } catch (e) {
      console.error("Error playing bell sound", e);
    }
  };

  // Enable audio context via user gesture (mandatory on modern browsers)
  const enableAudio = () => {
    try {
      audioCtxRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
      setIsAudioEnabled(true);
      playBellSound();
    } catch (e) {
      console.error("Could not enable AudioContext", e);
    }
  };

  // Fetch pending reception alerts
  const fetchAlerts = async () => {
    setIsLoading(true);
    try {
      let query = supabase
        .from('alertas_recepcion')
        .select('*');
      
      // Filter by branch if assigned
      if (currentUser?.sede_id) {
        query = query.or(`sede_id.eq.${currentUser.sede_id},sede_id.is.null`);
      }

      const { data, error } = await query.order('fecha_alerta', { ascending: false });
      if (error) throw error;
      
      if (data) {
        setAlerts(data);
      }
      setLastUpdated(new Date());
    } catch (err) {
      console.error("Error fetching alerts:", err);
    } finally {
      setIsLoading(false);
    }
  };

  // Initial fetch and Real-time Postgres subscription
  useEffect(() => {
    fetchAlerts();

    const filterObj = !currentUser?.sede_id
      ? {}
      : { filter: `sede_id=eq.${currentUser.sede_id}` };

    const channel = supabase
      .channel('alert-monitor-realtime')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'alertas_recepcion',
          ...filterObj
        },
        async (payload: any) => {
          console.log("Monitor received Postgres change payload:", payload);
          if (payload.eventType === 'INSERT') {
            const newAlert = payload.new;
            const isPending = newAlert.estado !== undefined ? newAlert.estado === 'PENDIENTE' : !newAlert.recepcionado;
            if (isPending && isAudioEnabled) {
              playBellSound();
            }
          }
          fetchAlerts();
        }
      )
      .subscribe();

    // Polling backup every 10 seconds
    const pollInterval = setInterval(() => {
      fetchAlerts();
    }, 10000);

    return () => {
      supabase.removeChannel(channel);
      clearInterval(pollInterval);
    };
  }, [currentUser, isAudioEnabled]);

  // Periodic Chime: every 10 minutes (600 seconds) if there are pending alerts
  useEffect(() => {
    if (pendingCount === 0) {
      setNextChimeInSeconds(600);
      return;
    }

    // Interval to tick down the countdown
    const countdownInterval = setInterval(() => {
      setNextChimeInSeconds(prev => {
        if (prev <= 1) {
          if (isAudioEnabled) {
            playBellSound();
          }
          return 600; // Reset to 10 minutes
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(countdownInterval);
  }, [pendingCount, isAudioEnabled]);

  // Play bell sound immediately when pendingCount becomes > 0 for the first time
  const prevPendingCountRef = useRef(0);
  useEffect(() => {
    if (pendingCount > prevPendingCountRef.current && isAudioEnabled) {
      playBellSound();
      setNextChimeInSeconds(600); // Reset timer on new alert
    }
    prevPendingCountRef.current = pendingCount;
  }, [pendingCount, isAudioEnabled]);

  const formatCountdown = (secs: number) => {
    const mins = Math.floor(secs / 60);
    const remainingSecs = secs % 60;
    return `${mins}:${remainingSecs.toString().padStart(2, '0')}`;
  };

  const timeSince = (dateString: string) => {
    try {
      const date = new Date(dateString);
      const seconds = Math.floor((new Date().getTime() - date.getTime()) / 1000);
      
      let interval = Math.floor(seconds / 31536000);
      if (interval >= 1) return `Hace ${interval} años`;
      
      interval = Math.floor(seconds / 2592000);
      if (interval >= 1) return `Hace ${interval} m`;
      
      interval = Math.floor(seconds / 86400);
      if (interval >= 1) return `Hace ${interval} d`;
      
      interval = Math.floor(seconds / 3600);
      if (interval >= 1) return `Hace ${interval} h`;
      
      interval = Math.floor(seconds / 60);
      if (interval >= 1) return `Hace ${interval} min`;
      
      return seconds < 10 ? 'Hace un momento' : `Hace ${seconds} s`;
    } catch {
      return '';
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-900 flex flex-col font-sans transition-colors duration-300">
      {/* Upper Navigation / Status bar */}
      <header className="bg-white dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700 py-4 px-6 flex items-center justify-between shadow-sm shrink-0">
        <div className="flex items-center gap-3">
          <div className="p-2.5 bg-emerald-500/10 text-emerald-600 rounded-2xl">
            <Activity className="w-5 h-5 animate-pulse" />
          </div>
          <div>
            <h1 className="text-base font-black text-slate-800 dark:text-white uppercase tracking-tight">
              SISTEMA DE <span className="text-emerald-500">MONITOREO</span>
            </h1>
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Rol: Campana de Alertas</p>
          </div>
        </div>

        <div className="flex items-center gap-4">
          <div className="hidden sm:flex items-center gap-2 bg-emerald-50 border border-emerald-200 dark:bg-emerald-950/20 dark:border-emerald-900/30 px-3.5 py-1.5 rounded-2xl">
            <Wifi className="w-4.5 h-4.5 text-emerald-500" />
            <span className="text-[10px] font-black text-emerald-600 dark:text-emerald-400 uppercase tracking-wider">Conectado a Supabase</span>
          </div>
          
          <button 
            onClick={onLogout}
            className="flex items-center gap-2 bg-slate-100 hover:bg-slate-200 text-slate-600 px-4 py-2.5 rounded-2xl text-xs font-black uppercase tracking-wider transition-all"
            title="Cerrar Sesión"
          >
            <LogOut className="w-4 h-4" />
            <span className="hidden sm:inline">Cerrar Sesión</span>
          </button>
        </div>
      </header>

      {/* Main Container */}
      <main className="flex-1 max-w-5xl mx-auto w-full p-4 sm:p-6 md:p-8 flex flex-col gap-6">
        
        {/* Branch / Sede Banner */}
        <div className="bg-white dark:bg-slate-800 rounded-3xl p-5 border border-slate-200 dark:border-slate-700 shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3.5">
            <div className="w-12 h-12 rounded-2xl bg-slate-100 dark:bg-slate-700 flex items-center justify-center text-slate-500 shrink-0">
              <Building2 className="w-6 h-6" />
            </div>
            <div>
              <span className="text-[9px] font-black uppercase tracking-widest text-slate-400 block">Ubicación Actual</span>
              <span className="text-base font-black text-slate-800 dark:text-white uppercase">
                {currentUser?.sede_nombre || 'TODAS LAS SEDES'}
              </span>
            </div>
          </div>
          <div className="flex items-center gap-2 text-right">
            <button 
              onClick={fetchAlerts}
              disabled={isLoading}
              className="p-2.5 bg-slate-50 hover:bg-slate-100 active:scale-95 text-slate-500 rounded-2xl border border-slate-200 transition-all cursor-pointer"
              title="Sincronizar"
            >
              <RefreshCw className={`w-4.5 h-4.5 ${isLoading ? 'animate-spin text-emerald-500' : ''}`} />
            </button>
            <div className="text-left sm:text-right">
              <span className="text-[9px] font-black uppercase tracking-widest text-slate-400 block">Sincronizado</span>
              <span className="text-xs font-bold text-slate-600 dark:text-slate-300">
                {lastUpdated.toLocaleTimeString()}
              </span>
            </div>
          </div>
        </div>

        {/* Audio Autoplay Gate */}
        {!isAudioEnabled && (
          <div className="bg-amber-50 border border-amber-200 rounded-3xl p-6 sm:p-8 text-center flex flex-col items-center justify-center gap-4 shadow-sm animate-fade-in">
            <div className="w-16 h-16 rounded-full bg-amber-500/10 flex items-center justify-center text-amber-600 mb-2">
              <Volume2 className="w-8 h-8 animate-bounce" />
            </div>
            <h2 className="text-lg font-black text-amber-800 uppercase tracking-tight">Habilitar Sonido Obligatorio</h2>
            <p className="text-xs text-amber-700 max-w-md leading-relaxed font-bold">
              Para cumplir las regulaciones de seguridad de los navegadores, debe hacer clic en el botón de abajo para activar el parlante de este equipo.
            </p>
            <button 
              onClick={enableAudio}
              className="mt-2 bg-[#82BD02] hover:bg-[#72a602] hover:scale-[1.02] active:scale-95 text-white font-black uppercase tracking-widest text-xs px-8 py-4 rounded-2xl shadow-lg shadow-green-100 transition-all flex items-center gap-3 cursor-pointer"
            >
              <Play className="w-4.5 h-4.5 fill-current" />
              Activar Parlante / Monitorear 🔊
            </button>
          </div>
        )}

        {/* Dynamic Sound Box Dashboard */}
        {isAudioEnabled && (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            
            {/* Bell Monitor Status Card */}
            <div className="bg-white dark:bg-slate-800 rounded-3xl p-6 border border-slate-200 dark:border-slate-700 shadow-sm flex flex-col items-center justify-center text-center relative overflow-hidden col-span-1 min-h-[280px]">
              {/* Background Ambient Ring */}
              {pendingCount > 0 && (
                <div className="absolute inset-0 bg-emerald-500/5 animate-pulse pointer-events-none" />
              )}

              <div 
                onClick={playBellSound}
                className={`w-28 h-28 rounded-full bg-slate-50 dark:bg-slate-700 flex items-center justify-center cursor-pointer transition-transform hover:scale-105 active:scale-95 border border-slate-100 dark:border-slate-600 relative ${
                  bellAnimating ? 'animate-wiggle' : ''
                }`}
              >
                {pendingCount > 0 ? (
                  <>
                    <span className="absolute -top-1 -right-1 flex h-6 w-6">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
                      <span className="relative inline-flex rounded-full h-6 w-6 bg-red-500 text-[10px] font-black text-white items-center justify-center">
                        {pendingCount}
                      </span>
                    </span>
                    <Bell className="w-14 h-14 text-emerald-500 animate-pulse" />
                  </>
                ) : (
                  <Bell className="w-14 h-14 text-slate-400" />
                )}
              </div>

              <div className="mt-5 space-y-1">
                <span className="text-[10px] font-black uppercase tracking-widest text-slate-400 block">Parlante Habilitado</span>
                <h3 className="text-sm font-black text-slate-800 dark:text-white uppercase tracking-tight">
                  {pendingCount > 0 ? (
                    <span className="text-red-500 animate-pulse">ALERTA EMITIENDO</span>
                  ) : (
                    <span className="text-emerald-500">TODO EN ORDEN</span>
                  )}
                </h3>
              </div>

              <button 
                onClick={playBellSound}
                className="mt-4 text-[10px] font-black uppercase tracking-widest text-[#009ED6] hover:text-[#008cb8] flex items-center gap-1.5 cursor-pointer"
              >
                <Volume2 className="w-3.5 h-3.5" />
                Probar Sonido Campana
              </button>
            </div>

            {/* Countdown / Pending Chime Loop Status */}
            <div className="bg-white dark:bg-slate-800 rounded-3xl p-6 border border-slate-200 dark:border-slate-700 shadow-sm flex flex-col justify-between col-span-1 md:col-span-2">
              <div>
                <div className="flex items-center justify-between">
                  <h3 className="text-xs font-black text-slate-400 uppercase tracking-widest">BUCLE DE REPETICIÓN (CADA 10 MIN)</h3>
                  <Clock className="w-4 h-4 text-slate-400" />
                </div>

                {pendingCount > 0 ? (
                  <div className="mt-4 space-y-3">
                    <p className="text-xs text-slate-500 leading-relaxed font-bold">
                      Hay <strong className="text-red-500 font-black">{pendingCount} alertas pendientes</strong>. El sistema volverá a emitir el sonido de campana de manera automática si persisten.
                    </p>
                    
                    <div className="bg-slate-50 dark:bg-slate-700 p-4 rounded-2xl border border-slate-100 dark:border-slate-600 flex items-center justify-between">
                      <div>
                        <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest block">Próxima Campana</span>
                        <span className="text-2xl font-black text-slate-800 dark:text-white font-mono">
                          {formatCountdown(nextChimeInSeconds)}
                        </span>
                      </div>
                      <div className="w-12 h-12 rounded-xl bg-red-500/10 flex items-center justify-center text-red-500">
                        <ShieldAlert className="w-6 h-6 animate-pulse" />
                      </div>
                    </div>

                    {/* Progress countdown visualizer bar */}
                    <div className="w-full bg-slate-100 dark:bg-slate-700 h-2 rounded-full overflow-hidden">
                      <div 
                        className="bg-red-500 h-full transition-all duration-1000"
                        style={{ width: `${(nextChimeInSeconds / 600) * 100}%` }}
                      />
                    </div>
                  </div>
                ) : (
                  <div className="mt-8 flex flex-col items-center justify-center py-4">
                    <div className="w-12 h-12 rounded-full bg-emerald-500/10 text-emerald-500 flex items-center justify-center mb-3">
                      <CheckCircle2 className="w-6 h-6" />
                    </div>
                    <p className="text-xs font-black text-slate-600 dark:text-slate-300 uppercase tracking-tight text-center">
                      Sin alertas por resolver. Temporizador inactivo.
                    </p>
                  </div>
                )}
              </div>

              <div className="border-t border-slate-100 dark:border-slate-700 pt-3 flex items-center justify-between text-[10px] font-bold text-slate-400 uppercase">
                <span>REPETICIÓN AUTOMÁTICA</span>
                <span className="text-emerald-500 font-black">HABILITADA (10 MIN)</span>
              </div>
            </div>

          </div>
        )}

        {/* List of Pending Alerts */}
        <div className="bg-white dark:bg-slate-800 rounded-3xl p-6 border border-slate-200 dark:border-slate-700 shadow-sm flex flex-col gap-4">
          <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-700 pb-3">
            <h2 className="text-sm font-black text-slate-800 dark:text-white uppercase tracking-tight flex items-center gap-2">
              <ShieldAlert className="w-4.5 h-4.5 text-red-500" />
              Alertas Pendientes de Solución ({pendingCount})
            </h2>
            <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">En Tiempo Real</span>
          </div>

          {pendingCount === 0 ? (
            <div className="py-12 flex flex-col items-center justify-center text-center">
              <div className="w-16 h-16 rounded-full bg-emerald-500/10 text-emerald-500 flex items-center justify-center mb-3">
                <CheckCircle2 className="w-8 h-8" />
              </div>
              <h3 className="text-sm font-black text-slate-800 dark:text-white uppercase tracking-tight">¡Todo en Orden!</h3>
              <p className="text-xs text-slate-400 mt-1 max-w-sm">
                No hay alertas de recepción pendientes por solucionar. El parlante emitirá un sonido de campana automáticamente apenas ingrese una nueva alerta.
              </p>
            </div>
          ) : (
            <div className="space-y-3.5">
              {pendingAlerts.map((alert) => (
                <div 
                  key={alert.id}
                  className="bg-slate-50 dark:bg-slate-700/40 hover:bg-slate-100/50 p-4.5 rounded-2xl border border-slate-100 dark:border-slate-600 transition-colors flex flex-col sm:flex-row justify-between gap-4"
                >
                  <div className="space-y-1.5 flex-1">
                    <div className="flex flex-wrap items-center gap-2.5">
                      <span className="bg-red-500/10 text-red-600 px-2.5 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wider">
                        {alert.tipo || 'ALERTA'}
                      </span>
                      {alert.proveedor && (
                        <span className="text-[10px] font-black text-slate-400 uppercase truncate max-w-[200px]">
                          PROV: {alert.proveedor}
                        </span>
                      )}
                      <span className="text-[10px] font-black text-blue-600 uppercase tracking-wider ml-auto sm:ml-0">
                        {alert.producto_codigo || alert.codigo}
                      </span>
                    </div>

                    <h4 className="text-xs font-black text-slate-800 dark:text-white uppercase leading-tight">
                      {alert.producto_nombre || alert.nombre || 'Producto No Identificado'}
                    </h4>

                    {alert.observaciones && (
                      <p className="text-[10px] text-slate-500 dark:text-slate-400 font-bold uppercase leading-normal">
                        Detalle: {alert.observaciones}
                      </p>
                    )}
                  </div>

                  <div className="flex sm:flex-col items-start sm:items-end justify-between sm:justify-center gap-1 shrink-0 border-t sm:border-t-0 border-slate-100 pt-2.5 sm:pt-0">
                    <div className="flex items-center gap-1.5 text-[10px] font-black text-slate-400 uppercase">
                      <Clock className="w-3.5 h-3.5" />
                      {alert.fecha_alerta || alert.fecha ? timeSince(alert.fecha_alerta || alert.fecha) : ''}
                    </div>
                    {alert.cantidad && (
                      <span className="text-xs font-black text-slate-800 dark:text-white mt-0.5">
                        Cant: {alert.cantidad}
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

      </main>
    </div>
  );
};
