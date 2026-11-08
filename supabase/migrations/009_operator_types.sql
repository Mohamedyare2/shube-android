-- Migration 009: Separate Shube and Geesh Operators
-- Adds an app_type column to operators to differentiate them.

ALTER TABLE public.operators 
ADD COLUMN IF NOT EXISTS app_type TEXT DEFAULT 'shube' CHECK (app_type IN ('shube', 'geesh'));
