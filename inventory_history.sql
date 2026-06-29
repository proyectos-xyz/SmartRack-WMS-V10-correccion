
-- Tabla para almacenar el stock del sistema cargado
CREATE TABLE IF NOT EXISTS public.stock_sistema (
    id uuid NOT NULL DEFAULT gen_random_uuid(),
    codigo text NOT NULL,
    cantidad numeric NOT NULL DEFAULT 0,
    nombre text,
    categoria text,
    marca text,
    fecha_carga timestamp with time zone DEFAULT now(),
    cargado_por text,
    CONSTRAINT stock_sistema_pkey PRIMARY KEY (id),
    CONSTRAINT stock_sistema_codigo_key UNIQUE (codigo)
);

-- Tabla para el historial de diferencias procesadas
CREATE TABLE IF NOT EXISTS public.historial_diferencias (
    id uuid NOT NULL DEFAULT gen_random_uuid(),
    fecha date NOT NULL DEFAULT CURRENT_DATE,
    codigo text NOT NULL,
    nombre text NOT NULL,
    stock_sistema numeric NOT NULL DEFAULT 0,
    conteo_fisico numeric NOT NULL DEFAULT 0,
    diferencia numeric NOT NULL DEFAULT 0,
    procesado_por text,
    fecha_procesado timestamp with time zone DEFAULT now(),
    CONSTRAINT historial_diferencias_pkey PRIMARY KEY (id)
);

-- Habilitar RLS
ALTER TABLE public.stock_sistema ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.historial_diferencias ENABLE ROW LEVEL SECURITY;

-- Políticas simples (permitir todo por ahora para facilitar el desarrollo, ajustar luego)
CREATE POLICY "Allow all on stock_sistema" ON public.stock_sistema FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all on historial_diferencias" ON public.historial_diferencias FOR ALL USING (true) WITH CHECK (true);
