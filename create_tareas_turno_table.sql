-- Tabla para persistencia de Pendientes / Tareas de Turno agendadas
CREATE TABLE IF NOT EXISTS public.tareas_turno (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    description TEXT,
    priority TEXT DEFAULT 'ALTA',
    status TEXT DEFAULT 'PENDIENTE',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    completed_at TIMESTAMP WITH TIME ZONE,
    photos TEXT[] DEFAULT '{}',
    created_by TEXT,
    completed_by TEXT,
    scheduled_date TEXT,
    alert_time TEXT,
    canceled_at TIMESTAMP WITH TIME ZONE,
    canceled_by TEXT,
    canceled_comment TEXT,
    triggered_alert BOOLEAN DEFAULT false,
    history JSONB DEFAULT '[]'::jsonb,
    sede_id TEXT
);

-- Deshabilitar Row Level Security para permitir acceso completo sin bloqueos de autenticación
ALTER TABLE public.tareas_turno DISABLE ROW LEVEL SECURITY;

-- Índices para búsqueda rápida por fecha y estado
CREATE INDEX IF NOT EXISTS idx_tareas_turno_status ON public.tareas_turno(status);
CREATE INDEX IF NOT EXISTS idx_tareas_turno_scheduled_date ON public.tareas_turno(scheduled_date);
CREATE INDEX IF NOT EXISTS idx_tareas_turno_sede_id ON public.tareas_turno(sede_id);
