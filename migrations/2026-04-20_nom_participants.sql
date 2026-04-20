-- =====================================================================
-- Migration : séparation prénom / nom de famille + tel optionnel autorisés
-- Date : 2026-04-20
-- Contexte : sécurité d'accès aux trips — évite les ambiguïtés fuzzy
--            quand plusieurs participants partagent le même prénom ou nom
-- =====================================================================

-- 1. Ajout des nouvelles colonnes (idempotent)
ALTER TABLE membres
  ADD COLUMN IF NOT EXISTS nom TEXT DEFAULT '';

ALTER TABLE participants_autorises
  ADD COLUMN IF NOT EXISTS nom TEXT DEFAULT '';

ALTER TABLE participants_autorises
  ADD COLUMN IF NOT EXISTS tel TEXT;

-- 2. Split des données existantes sur le PREMIER espace
--    "Sylvain Bergeron" -> prenom="Sylvain", nom="Bergeron"
--    "Marie-Eve Tremblay-Roy" -> prenom="Marie-Eve", nom="Tremblay-Roy"
--    "Marc" (sans espace) -> prenom="Marc", nom=""
--    Idempotent : on ne touche QUE les lignes où nom est NULL ou ''.

UPDATE membres
SET
  nom = CASE
    WHEN position(' ' in prenom) > 0
      THEN trim(substring(prenom from position(' ' in prenom) + 1))
    ELSE ''
  END,
  prenom = CASE
    WHEN position(' ' in prenom) > 0
      THEN trim(substring(prenom from 1 for position(' ' in prenom) - 1))
    ELSE prenom
  END
WHERE nom IS NULL OR nom = '';

UPDATE participants_autorises
SET
  nom = CASE
    WHEN position(' ' in prenom) > 0
      THEN trim(substring(prenom from position(' ' in prenom) + 1))
    ELSE ''
  END,
  prenom = CASE
    WHEN position(' ' in prenom) > 0
      THEN trim(substring(prenom from 1 for position(' ' in prenom) - 1))
    ELSE prenom
  END
WHERE nom IS NULL OR nom = '';
