-- Migration : ajouter le support des photos dans le chat
-- À exécuter dans Supabase Studio > SQL Editor
-- https://supabase.com/dashboard/project/dnvzqsgwqwrvsgfjqqxn/sql/new

-- Colonne optionnelle pour l'URL de l'image attachée à un message.
-- Les messages texte existants restent intacts (image_url = NULL).
-- Les messages photo peuvent avoir `contenu` vide ou contenir une légende.
ALTER TABLE messages
  ADD COLUMN IF NOT EXISTS image_url TEXT;

-- Permettre `contenu` vide quand il y a une image.
-- Si la contrainte NOT NULL existait sur `contenu`, elle doit être retirée.
ALTER TABLE messages
  ALTER COLUMN contenu DROP NOT NULL;

-- Contrainte : un message doit contenir SOIT du texte, SOIT une image (ou les deux).
-- Pas de messages complètement vides.
ALTER TABLE messages
  ADD CONSTRAINT messages_has_content
  CHECK (
    (contenu IS NOT NULL AND length(trim(contenu)) > 0)
    OR image_url IS NOT NULL
  );
