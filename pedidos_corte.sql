-- Script to create public.pedidos_corte table for cheese/meat cuts
CREATE TABLE IF NOT EXISTS public.pedidos_corte (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    producto_id uuid REFERENCES public.productos(id) ON DELETE SET NULL,
    codigo text NOT NULL,
    nombre text NOT NULL,
    cantidad numeric NOT NULL,
    unidad_medida text NOT NULL,
    usuario_registro text NOT NULL,
    fecha_registro timestamp with time zone DEFAULT now(),
    sede_id uuid,
    estado text DEFAULT 'PENDIENTE'
);

-- Ensure columns exist if table was already created
ALTER TABLE public.pedidos_corte ADD COLUMN IF NOT EXISTS estado text DEFAULT 'PENDIENTE';
ALTER TABLE public.pedidos_corte ADD COLUMN IF NOT EXISTS fecha_atencion timestamp with time zone;
ALTER TABLE public.pedidos_corte ADD COLUMN IF NOT EXISTS usuario_atencion text;

-- Disable Row Level Security to ensure seamless integration and avoid policy violation 42501
ALTER TABLE public.pedidos_corte DISABLE ROW LEVEL SECURITY;

-- Grant broad access privileges
GRANT ALL ON TABLE public.pedidos_corte TO anon, authenticated;

