-- Fix RLS for zonas table
ALTER TABLE public.zonas ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policy WHERE polname = 'Allow all for authenticated users on zonas') THEN
        CREATE POLICY "Allow all for authenticated users on zonas" 
        ON public.zonas FOR ALL 
        TO authenticated 
        USING (true) 
        WITH CHECK (true);
    END IF;
END $$;
