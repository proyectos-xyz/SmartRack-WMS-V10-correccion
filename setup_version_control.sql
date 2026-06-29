-- Script para habilitar el control de versiones obligatorio
CREATE TABLE IF NOT EXISTS public.configuracion_sistema (
    id text PRIMARY KEY,
    valor text NOT NULL,
    descripcion text,
    ultima_actualizacion timestamp with time zone DEFAULT now()
);

-- Insertar versión inicial (v1.0.2)
INSERT INTO public.configuracion_sistema (id, valor, descripcion)
VALUES ('min_version_required', '1.0.2', 'Versión mínima de la app para permitir acceso')
ON CONFLICT (id) DO UPDATE SET valor = EXCLUDED.valor;
