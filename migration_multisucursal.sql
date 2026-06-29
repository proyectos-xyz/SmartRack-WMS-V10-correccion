-- MIGRASTIÓN A MULTISUCURSAL (MULTI-TENANT)
-- Este script agrega la columna sede_id a todas las tablas relevantes y migra los datos existentes.

-- 1. Asegurar que la tabla de sedes exista
CREATE TABLE IF NOT EXISTS sedes (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    nombre TEXT NOT NULL,
    direccion TEXT,
    codigo TEXT UNIQUE,
    color_primario TEXT DEFAULT '#009ED6',
    fecha_creacion TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now())
);

-- 2. Insertar sede por defecto si no existe
INSERT INTO sedes (nombre, codigo, color_primario)
SELECT 'Sede Central', '001', '#009ED6'
WHERE NOT EXISTS (SELECT 1 FROM sedes);

-- 3. Función auxiliar para agregar sede_id a tablas
DO $$ 
DECLARE 
    tbl_name text;
    default_sede_id uuid;
BEGIN
    SELECT id INTO default_sede_id FROM sedes LIMIT 1;

    FOR tbl_name IN 
        SELECT table_name 
        FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_name IN (
            'productos', 'recepcion_productos', 'paletas_lpn', 'despacho_encabezado', 
            'conteo_inventario', 'zonas', 'estantes', 'muestras', 
            'logistica_inversa', 'mermas', 'tareas', 'alertas_recepcion', 
            'historial_diferencias', 'mermas_reportes', 'despachos_item', 'stock_sistema'
        )
    LOOP
        -- Agregar columna si no existe
        IF NOT EXISTS (SELECT 1 FROM pg_attribute WHERE attrelid = tbl_name::regclass AND attname = 'sede_id') THEN
            EXECUTE format('ALTER TABLE %I ADD COLUMN sede_id UUID REFERENCES sedes(id)', tbl_name);
            
            -- Migrar datos existentes a la sede por defecto
            EXECUTE format('UPDATE %I SET sede_id = %L WHERE sede_id IS NULL', tbl_name, default_sede_id);
            
            -- Opcional: Hacerla NOT NULL después de la migración si se desea rigor, 
            -- pero por seguridad en migración lo dejamos nullable inicialmente.
        END IF;
    END LOOP;
END $$;

-- 4. Asegurar que la tabla de usuarios tenga sede_id (ya debería tenerlo pero por si acaso)
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_attribute WHERE attrelid = 'usuarios'::regclass AND attname = 'sede_id') THEN
        ALTER TABLE usuarios ADD COLUMN sede_id UUID REFERENCES sedes(id);
    END IF;
END $$;
