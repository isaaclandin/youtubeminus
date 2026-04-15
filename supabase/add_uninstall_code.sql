-- Add uninstall_code column to profiles.
-- This is written by the macOS app during setup and shown only on the partner dashboard.

ALTER TABLE profiles ADD COLUMN IF NOT EXISTS uninstall_code text;
