-- Script para agregar campos de trazabilidad a despachos_item
ALTER TABLE public.despachos_item 
ADD COLUMN IF NOT EXISTS usuario_preparacion text,
ADD COLUMN IF NOT EXISTS fecha_preparacion timestamp with time zone;

COMMENT ON COLUMN public.despachos_item.usuario_preparacion IS 'Usuario que realizó el picking/preparación del item';
COMMENT ON COLUMN public.despachos_item.fecha_preparacion IS 'Fecha y hora exacta en que se completó la preparación del item';
