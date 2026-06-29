
-- Crear tabla de sedes
CREATE TABLE IF NOT EXISTS sedes (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    nombre TEXT NOT NULL,
    direccion TEXT,
    codigo TEXT UNIQUE,
    color_primario TEXT DEFAULT '#009ED6',
    fecha_creacion TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now())
);

-- Agregar columna sede_id a la tabla de usuarios si no existe
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_attribute WHERE attrelid = 'usuarios'::regclass AND attname = 'sede_id') THEN
        ALTER TABLE usuarios ADD COLUMN sede_id UUID REFERENCES sedes(id);
    END IF;
END $$;

-- Insertar sedes de ejemplo si la tabla está vacía
INSERT INTO sedes (nombre, codigo, color_primario)
SELECT 'Sede Central', '001', '#009ED6'
WHERE NOT EXISTS (SELECT 1 FROM sedes);

INSERT INTO sedes (nombre, codigo, color_primario)
SELECT 'Sede Norte', '002', '#82BD02'
WHERE NOT EXISTS (SELECT 1 FROM sedes WHERE codigo = '002');
