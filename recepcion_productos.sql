-- Script to create the reception table
CREATE TABLE IF NOT EXISTS public.recepcion_productos (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    producto_id uuid REFERENCES public.productos(id),
    codigo text NOT NULL,
    nombre text NOT NULL,
    cantidad numeric NOT NULL DEFAULT 0,
    fecha_vencimiento date NOT NULL,
    temperatura numeric,
    usuario_registro text NOT NULL,
    fecha_registro timestamp with time zone DEFAULT now(),
    fotos text[] DEFAULT '{}'::text[],
    proveedor text,
    guia_factura text,
    temperatura_transporte numeric,
    condicion_higienica text,
    indumentaria_limpia text,
    higiene_personal text,
    ubicacion text,
    lote text,
    ph numeric,
    aspecto_fisico text,
    color text,
    olor text,
    hermeticidad text,
    libre_impurezas text,
    estado_envase text,
    conclusiones text
);

-- Add RLS policies
ALTER TABLE public.recepcion_productos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow all for authenticated users on recepcion_productos" 
ON public.recepcion_productos FOR ALL 
TO authenticated 
USING (true) 
WITH CHECK (true);
