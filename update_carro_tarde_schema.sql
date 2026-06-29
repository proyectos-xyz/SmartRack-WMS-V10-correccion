-- Actualización para el módulo de Carro de la Tarde
ALTER TABLE public.despacho_encabezado 
ADD COLUMN IF NOT EXISTS tipo_despacho text DEFAULT 'PROVINCIA',
ADD COLUMN IF NOT EXISTS placa_vehiculo text,
ADD COLUMN IF NOT EXISTS rampa_asignada integer,
ADD COLUMN IF NOT EXISTS documento text,
ADD COLUMN IF NOT EXISTS cliente text,
ADD COLUMN IF NOT EXISTS comentario text;

ALTER TABLE public.despachos_item 
ADD COLUMN IF NOT EXISTS categoria text;

-- Comentario para identificar registros
COMMENT ON COLUMN public.despacho_encabezado.tipo_despacho IS 'Diferencia entre Despacho a Provincia y Carro de la Tarde';
