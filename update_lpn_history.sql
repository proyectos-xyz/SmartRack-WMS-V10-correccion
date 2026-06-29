-- Script para habilitar el historial de movimientos en el Mapa de Almacén

-- 1. Crear la tabla de historial de movimientos
CREATE TABLE IF NOT EXISTS public.lpn_movimientos (
    id uuid NOT NULL DEFAULT gen_random_uuid(),
    lpn text NOT NULL,
    ubicacion_id uuid,
    tipo_movimiento text NOT NULL CHECK (tipo_movimiento IN ('UBICACION', 'RETIRO', 'REUBICACION')),
    usuario text NOT NULL,
    fecha timestamp with time zone DEFAULT now(),
    motivo text,
    cantidad_afectada numeric,
    CONSTRAINT lpn_movimientos_pkey PRIMARY KEY (id),
    CONSTRAINT lpn_movimientos_lpn_fkey FOREIGN KEY (lpn) REFERENCES public.paletas_lpn(lpn),
    CONSTRAINT lpn_movimientos_ubicacion_id_fkey FOREIGN KEY (ubicacion_id) REFERENCES public.ubicaciones(id)
);

-- 2. Agregar índices para optimizar búsquedas de historial
CREATE INDEX IF NOT EXISTS idx_lpn_movimientos_lpn ON public.lpn_movimientos(lpn);
CREATE INDEX IF NOT EXISTS idx_lpn_movimientos_fecha ON public.lpn_movimientos(fecha);

-- 3. Agregar columnas de auditoría rápida a paletas_lpn (opcional pero recomendado para el UI)
ALTER TABLE public.paletas_lpn 
ADD COLUMN IF NOT EXISTS usuario_ultima_ubicacion text,
ADD COLUMN IF NOT EXISTS fecha_ultima_ubicacion timestamp with time zone,
ADD COLUMN IF NOT EXISTS motivo_ultima_ubicacion text;

-- 4. Comentarios para documentación
COMMENT ON TABLE public.lpn_movimientos IS 'Registra cada vez que un LPN entra o sale de una ubicación en el rack.';
COMMENT ON COLUMN public.lpn_movimientos.tipo_movimiento IS 'UBICACION: Cuando se coloca en el rack. RETIRO: Cuando se saca del rack. REUBICACION: Cambio de un slot a otro.';
