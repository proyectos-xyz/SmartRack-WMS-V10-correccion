-- Script para eliminar restricciones de la tabla logistica_inversa
-- Convierte columnas de ENUM a TEXT y elimina la obligatoriedad de los campos

-- 1. Cambiar tipo de datos de enums a TEXT para permitir cualquier valor
ALTER TABLE public.logistica_inversa ALTER COLUMN tipo_devolucion TYPE TEXT USING tipo_devolucion::text;
ALTER TABLE public.logistica_inversa ALTER COLUMN defecto TYPE TEXT USING defecto::text;

-- 2. Eliminar restricciones NOT NULL para que ningún campo sea obligatorio
ALTER TABLE public.logistica_inversa ALTER COLUMN placa_vehiculo DROP NOT NULL;
ALTER TABLE public.logistica_inversa ALTER COLUMN factura_guia DROP NOT NULL;
ALTER TABLE public.logistica_inversa ALTER COLUMN tipo_devolucion DROP NOT NULL;
ALTER TABLE public.logistica_inversa ALTER COLUMN defecto DROP NOT NULL;

-- 3. (Opcional) Eliminar los tipos enum si ya no se necesitan
-- DROP TYPE IF EXISTS tipo_devolucion;
-- DROP TYPE IF EXISTS tipo_defecto;
