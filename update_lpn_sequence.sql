-- Create a sequence for LPN correlatives
CREATE SEQUENCE IF NOT EXISTS lpn_correlative_seq START 1;

-- Function to get the next LPN correlatives atomically
CREATE OR REPLACE FUNCTION get_next_lpn_correlatives(count_val INT DEFAULT 1)
RETURNS SETOF BIGINT AS $$
BEGIN
  RETURN QUERY SELECT nextval('lpn_correlative_seq') FROM generate_series(1, count_val);
END;
$$ LANGUAGE plpgsql;
