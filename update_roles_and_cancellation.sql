-- Script to update user roles and add cancellation logic to dispatch tables

-- 1. Update roles in usuarios table
-- The user already has ADMIN and OPERADOR, we just need to allow ASISTENTE
ALTER TABLE public.usuarios DROP CONSTRAINT IF EXISTS usuarios_rol_check;
ALTER TABLE public.usuarios ADD CONSTRAINT usuarios_rol_check 
  CHECK (rol = ANY (ARRAY['ADMIN'::text, 'ASISTENTE'::text, 'OPERADOR'::text]));

-- 2. Add cancellation columns to despacho_encabezado
ALTER TABLE public.despacho_encabezado ADD COLUMN IF NOT EXISTS motivo_cancelacion text;
ALTER TABLE public.despacho_encabezado ADD COLUMN IF NOT EXISTS usuario_cancelacion text;
ALTER TABLE public.despacho_encabezado ADD COLUMN IF NOT EXISTS fecha_cancelacion timestamp with time zone;

-- 3. Update check constraint for estado in despacho_encabezado
-- Note: In Supabase/Postgres, we need to drop and recreate the constraint
ALTER TABLE public.despacho_encabezado DROP CONSTRAINT IF EXISTS despacho_encabezado_estado_check;
ALTER TABLE public.despacho_encabezado ADD CONSTRAINT despacho_encabezado_estado_check 
  CHECK (estado = ANY (ARRAY['PENDIENTE'::text, 'EN PROCESO'::text, 'FINALIZADO'::text, 'COMPLETADO'::text, 'CANCELADO'::text]));

-- 4. Add cancellation columns to despachos_item
ALTER TABLE public.despachos_item ADD COLUMN IF NOT EXISTS motivo_cancelacion text;
ALTER TABLE public.despachos_item ADD COLUMN IF NOT EXISTS usuario_cancelacion text;
ALTER TABLE public.despachos_item ADD COLUMN IF NOT EXISTS fecha_cancelacion timestamp with time zone;

-- 5. Update check constraint for estado in despachos_item
ALTER TABLE public.despachos_item DROP CONSTRAINT IF EXISTS despachos_item_estado_check;
ALTER TABLE public.despachos_item ADD CONSTRAINT despachos_item_estado_check 
  CHECK (estado = ANY (ARRAY['PENDIENTE'::text, 'FINALIZADO'::text, 'COMPLETADO'::text, 'CANCELADO'::text]));
