-- Agregar columnas de desglose de cantidades a paletas_lpn y paletas_lpn_items
ALTER TABLE public.paletas_lpn 
ADD COLUMN IF NOT EXISTS pallets numeric DEFAULT 0,
ADD COLUMN IF NOT EXISTS cajas numeric DEFAULT 0,
ADD COLUMN IF NOT EXISTS unidades numeric DEFAULT 0;

ALTER TABLE public.paletas_lpn_items
ADD COLUMN IF NOT EXISTS pallets numeric DEFAULT 0,
ADD COLUMN IF NOT EXISTS cajas numeric DEFAULT 0,
ADD COLUMN IF NOT EXISTS unidades numeric DEFAULT 0;

-- Comentario para el usuario
COMMENT ON COLUMN public.paletas_lpn.pallets IS 'Cantidad de pallets completos';
COMMENT ON COLUMN public.paletas_lpn.cajas IS 'Cantidad de cajas completas';
COMMENT ON COLUMN public.paletas_lpn.unidades IS 'Cantidad de unidades sueltas';
