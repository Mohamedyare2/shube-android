-- ============================================================
-- SHUBE – Migration 016: Add plain_password to operators
-- Allows admins to view and manage operator passwords
-- ============================================================

ALTER TABLE public.operators
  ADD COLUMN IF NOT EXISTS plain_password TEXT;
