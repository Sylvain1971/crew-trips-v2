-- Migration : permission "peuvent envoyer des photos" dans le chat
-- A executer dans Supabase Studio > SQL Editor
-- https://supabase.com/dashboard/project/dnvzqsgwqwrvsgfjqqxn/sql/new

-- Colonne de permission, cohérent avec can_delete / can_edit existants.
-- Default true pour preserver le comportement actuel (tout le monde peut envoyer).
ALTER TABLE trips
  ADD COLUMN IF NOT EXISTS can_post_photos BOOLEAN NOT NULL DEFAULT true;
