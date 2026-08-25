-- ==============================================================================
-- SCRIPT PARA CREAR Y CONFIGURAR EL BUCKET "evidencias" EN SUPABASE STORAGE
-- Ejecuta este script en el SQL Editor de tu proyecto Supabase si deseas crearlo manualmente
-- ==============================================================================

-- 1. Insertar el bucket 'evidencias' como público
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
    'evidencias', 
    'evidencias', 
    true, 
    10485760, -- 10 MB límite por archivo
    ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/jpg', 'audio/mpeg', 'audio/mp3', 'application/pdf']
)
ON CONFLICT (id) DO UPDATE SET 
    public = true,
    file_size_limit = 10485760;

-- 2. Permitir lectura pública de archivos en el bucket 'evidencias'
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE schemaname = 'storage' AND tablename = 'objects' AND policyname = 'Evidencias Public Access'
    ) THEN
        CREATE POLICY "Evidencias Public Access" 
        ON storage.objects FOR SELECT 
        USING (bucket_id = 'evidencias');
    END IF;
END $$;

-- 3. Permitir subida/inserción de archivos a 'evidencias' (anónimo y autenticado)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE schemaname = 'storage' AND tablename = 'objects' AND policyname = 'Evidencias Upload Access'
    ) THEN
        CREATE POLICY "Evidencias Upload Access" 
        ON storage.objects FOR INSERT 
        WITH CHECK (bucket_id = 'evidencias');
    END IF;
END $$;

-- 4. Permitir actualización y eliminación en 'evidencias'
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE schemaname = 'storage' AND tablename = 'objects' AND policyname = 'Evidencias Update Access'
    ) THEN
        CREATE POLICY "Evidencias Update Access" 
        ON storage.objects FOR UPDATE 
        USING (bucket_id = 'evidencias');
    END IF;
    
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE schemaname = 'storage' AND tablename = 'objects' AND policyname = 'Evidencias Delete Access'
    ) THEN
        CREATE POLICY "Evidencias Delete Access" 
        ON storage.objects FOR DELETE 
        USING (bucket_id = 'evidencias');
    END IF;
END $$;
