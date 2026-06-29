-- SQL Migration to update reception alerts and link with reception products
ALTER TABLE public.alertas_recepcion ADD COLUMN IF NOT EXISTS recepcion_id UUID REFERENCES public.recepcion_productos(id) ON DELETE CASCADE;
ALTER TABLE public.alertas_recepcion ADD COLUMN IF NOT EXISTS area_autorizacion TEXT; -- 'COMPRAS', 'COMERCIA', 'ALMACEN', 'GERENCIA'
ALTER TABLE public.alertas_recepcion ADD COLUMN IF NOT EXISTS observaciones TEXT;
ALTER TABLE public.recepcion_productos ADD COLUMN IF NOT EXISTS alerta_id UUID REFERENCES public.alertas_recepcion(id) ON DELETE SET NULL;

