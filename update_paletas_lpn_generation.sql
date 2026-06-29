-- Add tracking columns for LPN generation to paletas_lpn table
ALTER TABLE public.paletas_lpn 
ADD COLUMN IF NOT EXISTS generado boolean DEFAULT false,
ADD COLUMN IF NOT EXISTS fecha_generado timestamp with time zone,
ADD COLUMN IF NOT EXISTS usuario_generado text;

-- Update existing records to have generado = true if they already have a reception date (optional, but good for consistency)
-- UPDATE public.paletas_lpn SET generado = true WHERE fecha_recepcion IS NOT NULL;
