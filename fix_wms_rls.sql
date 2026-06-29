-- Asegurar políticas de RLS para paletas_lpn y ubicaciones
-- Esto garantiza que los movimientos de almacén se persistan correctamente

ALTER TABLE public.paletas_lpn ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ubicaciones ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policy WHERE polname = 'Allow all for authenticated users on paletas_lpn') THEN
        CREATE POLICY "Allow all for authenticated users on paletas_lpn" 
        ON public.paletas_lpn FOR ALL 
        TO authenticated 
        USING (true) 
        WITH CHECK (true);
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_policy WHERE polname = 'Allow all for authenticated users on ubicaciones') THEN
        CREATE POLICY "Allow all for authenticated users on ubicaciones" 
        ON public.ubicaciones FOR ALL 
        TO authenticated 
        USING (true) 
        WITH CHECK (true);
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM pg_policy WHERE polname = 'Allow all for authenticated users on lpn_movimientos') THEN
        CREATE POLICY "Allow all for authenticated users on lpn_movimientos" 
        ON public.lpn_movimientos FOR ALL 
        TO authenticated 
        USING (true) 
        WITH CHECK (true);
    END IF;
END $$;
