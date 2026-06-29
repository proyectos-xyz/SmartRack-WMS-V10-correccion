-- Create mermas_reportes table
CREATE TABLE mermas_reportes (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  fecha_creacion TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
  usuario_creacion TEXT NOT NULL,
  foto_firmada TEXT,
  items_count INTEGER NOT NULL,
  filtros_aplicados JSONB
);

-- Create mermas table
CREATE TABLE mermas (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  producto_id UUID REFERENCES productos(id),
  codigo TEXT NOT NULL,
  nombre TEXT NOT NULL,
  cantidad NUMERIC NOT NULL,
  fecha_vencimiento TEXT,
  procedencia TEXT NOT NULL, -- DISTRIBUCION, ALMACEN, VENTA, DEVOLUCION, CAMBIO MANO A MANO, CORTE
  defecto TEXT NOT NULL,     -- ROTO, MAL ESTADO, REVENTADO, GOLPEADO, VENCIDO, CALIDAD
  destino TEXT NOT NULL,     -- VENTA PERSONAL, REMAR, DESECHAR, DESTRUCCION, RECLAMO
  fotos TEXT[] DEFAULT '{}',
  fecha_registro TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
  usuario_registro TEXT NOT NULL,
  revisado_calidad BOOLEAN DEFAULT FALSE,
  reporte_id UUID REFERENCES mermas_reportes(id)
);

-- Index for faster searches
CREATE INDEX idx_mermas_codigo ON mermas(codigo);
CREATE INDEX idx_mermas_fecha_registro ON mermas(fecha_registro);
