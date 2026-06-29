-- Update roles: Rename OPERADOR to ASISTENTE
UPDATE usuarios SET rol = 'ASISTENTE' WHERE rol = 'OPERADOR';

-- Update check constraint to remove OPERADOR
ALTER TABLE usuarios DROP CONSTRAINT IF EXISTS usuarios_rol_check;
ALTER TABLE usuarios ADD CONSTRAINT usuarios_rol_check CHECK (rol = ANY (ARRAY['ADMIN'::text, 'ASISTENTE'::text]));
