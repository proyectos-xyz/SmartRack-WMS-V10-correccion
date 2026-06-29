-- Add signature and responsible columns to mermas_reportes
ALTER TABLE mermas_reportes ADD COLUMN IF NOT EXISTS numero_reporte TEXT;
ALTER TABLE mermas_reportes ADD COLUMN IF NOT EXISTS firma_digital TEXT;
ALTER TABLE mermas_reportes ADD COLUMN IF NOT EXISTS responsable_firma TEXT;

-- Ensure reporte_id exists in mermas (it should, but just in case)
ALTER TABLE mermas ADD COLUMN IF NOT EXISTS reporte_id UUID REFERENCES mermas_reportes(id);
