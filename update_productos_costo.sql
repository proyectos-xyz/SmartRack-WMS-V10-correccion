-- SQL Script for Supabase SQL Editor
-- Add 'costo' column to 'productos' table
ALTER TABLE public.productos ADD COLUMN IF NOT EXISTS costo numeric DEFAULT 0;
