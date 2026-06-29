-- Script to set alerta_sonora to false for all users
-- This updates both the 'alerta_sonora' boolean column and the 'alerta_sonora' key inside the 'permisos' JSONB field

UPDATE usuarios 
SET 
  alerta_sonora = false,
  permisos = COALESCE(permisos, '{}'::jsonb) || '{"alerta_sonora": false}'::jsonb;
