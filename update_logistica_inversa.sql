-- Script para actualizar los enums de Logística Inversa en Supabase
-- Ejecuta este script en el SQL Editor de tu proyecto de Supabase

-- 1. Asegurar que el valor 'FALTANTES' esté en el enum de tipo de devolución
-- Nota: Asumimos que el tipo se llama 'tipo_devolucion' basado en el nombre de la columna.
-- Si el nombre es diferente, ajusta el script.
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_type WHERE typname = 'tipo_devolucion') THEN
        ALTER TYPE tipo_devolucion ADD VALUE IF NOT EXISTS 'FALTANTES';
    END IF;
END
$$;

-- 2. Asegurar que el valor 'VENCIDO' esté en el enum de defecto
-- El error reportado confirma que el tipo se llama 'tipo_defecto'.
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_type WHERE typname = 'tipo_defecto') THEN
        ALTER TYPE tipo_defecto ADD VALUE IF NOT EXISTS 'VENCIDO';
    END IF;
END
$$;

-- 3. Asegurar que todos los valores del frontend estén presentes en los enums
-- Para tipo_devolucion:
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_type WHERE typname = 'tipo_devolucion') THEN
        ALTER TYPE tipo_devolucion ADD VALUE IF NOT EXISTS 'RECHAZO';
        ALTER TYPE tipo_devolucion ADD VALUE IF NOT EXISTS 'DEVOLUCION';
        ALTER TYPE tipo_devolucion ADD VALUE IF NOT EXISTS 'PEND TOTAL';
        ALTER TYPE tipo_devolucion ADD VALUE IF NOT EXISTS 'PENDIENTE PARCIAL';
        ALTER TYPE tipo_devolucion ADD VALUE IF NOT EXISTS 'CAMBIO MANO A MANO';
        ALTER TYPE tipo_devolucion ADD VALUE IF NOT EXISTS 'VENCIMIENTO';
        ALTER TYPE tipo_devolucion ADD VALUE IF NOT EXISTS 'OTROS';
        ALTER TYPE tipo_devolucion ADD VALUE IF NOT EXISTS 'SOBRANTE';
    END IF;
END
$$;

-- Para tipo_defecto:
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_type WHERE typname = 'tipo_defecto') THEN
        ALTER TYPE tipo_defecto ADD VALUE IF NOT EXISTS 'ROTO / DAÑADO';
        ALTER TYPE tipo_defecto ADD VALUE IF NOT EXISTS 'OBSERVADO';
        ALTER TYPE tipo_defecto ADD VALUE IF NOT EXISTS 'OTROS';
    END IF;
END
$$;

-- 4. Asegurar que la fecha de vencimiento sea opcional (ya lo es según el CREATE TABLE, pero por si acaso)
ALTER TABLE logistica_inversa ALTER COLUMN fecha_vencimiento_producto DROP NOT NULL;
