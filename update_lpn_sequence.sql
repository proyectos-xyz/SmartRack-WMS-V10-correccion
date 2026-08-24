-- Table structure for LPN Sequence
CREATE TABLE IF NOT EXISTS public.lpn_sequence (
  id integer NOT NULL DEFAULT 1,
  last_value integer NOT NULL DEFAULT 0,
  CONSTRAINT lpn_sequence_pkey PRIMARY KEY (id)
);

-- Insert initial row if not exists
INSERT INTO public.lpn_sequence (id, last_value)
VALUES (1, 0)
ON CONFLICT (id) DO NOTHING;

