-- Add battery monitoring columns to the devices table
ALTER TABLE public.devices
ADD COLUMN IF NOT EXISTS battery_level INTEGER,
ADD COLUMN IF NOT EXISTS is_charging BOOLEAN DEFAULT false;
