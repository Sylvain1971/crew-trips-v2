-- Migration: Ajouter colonne nip (NIP 4 chiffres, hashe SHA-256) a la table membres
-- Date: 2026-04-20
-- Contexte: Securite anti-usurpation. Le tel seul (public) n'est pas
-- suffisant puisque tous les participants d'un trip se connaissent.
-- Le NIP est un secret personnel choisi par l'utilisateur, stocke en
-- hash cote client avant envoi a Supabase (irreversible).
--
-- Usage:
-- - Connexion: hash du NIP tape cote client, compare avec membres.nip
-- - Reset par admin: UPDATE membres SET nip = NULL WHERE id = X
-- - Migration douce: si nip IS NULL a la reconnexion, on affiche un
--   ecran "Creez votre NIP" avant d'entrer

ALTER TABLE membres ADD COLUMN IF NOT EXISTS nip TEXT NULL;

-- Index pour accelerer les lookups par (trip_id, tel, nip) lors des reconnexions
CREATE INDEX IF NOT EXISTS idx_membres_trip_tel_nip
  ON membres(trip_id, tel, nip);

COMMENT ON COLUMN membres.nip IS 'NIP 4 chiffres hashe SHA-256 (64 chars hex). NULL = pas encore cree (migration douce ou apres reset admin).';
