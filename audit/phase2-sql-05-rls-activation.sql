-- =========================================================================
-- PHASE 2.5 — ACTIVATION RLS
-- Date : 2026-04-21
-- Dernière étape de la sécurisation : verrouiller les écritures directes.
--
-- Stratégie :
--  - Les RPC SECURITY DEFINER continuent de marcher (elles s'exécutent
--    avec les privilèges du propriétaire, bypass RLS).
--  - Les anon/authenticated ne peuvent PLUS faire de INSERT/UPDATE/DELETE
--    direct sur les 6 tables publiques.
--  - SELECT reste permis sur trips/membres/infos/messages/participants_autorises
--    (lecture publique acceptable pour Crew Trips — contenu partagé entre amis).
--  - SELECT BLOQUÉ sur access_tokens, rate_limit_attempts, config (secrets).
--
-- ROLLBACK : pour tout désactiver d'un coup si souci :
--   ALTER TABLE trips DISABLE ROW LEVEL SECURITY;
--   (idem pour les autres tables)
-- =========================================================================

-- -------------------------------------------------------------------------
-- 1. ACCESS_TOKENS : verrouillage TOTAL (secrets)
-- Les RPC (SECURITY DEFINER) continuent à fonctionner.
-- Anon ne doit jamais pouvoir lire/écrire cette table directement.
-- -------------------------------------------------------------------------
ALTER TABLE access_tokens ENABLE ROW LEVEL SECURITY;
ALTER TABLE access_tokens FORCE ROW LEVEL SECURITY;

-- Pas de policy = tout est refusé par défaut (sauf pour le owner et SECURITY DEFINER)

-- -------------------------------------------------------------------------
-- 2. RATE_LIMIT_ATTEMPTS : verrouillage TOTAL
-- -------------------------------------------------------------------------
ALTER TABLE rate_limit_attempts ENABLE ROW LEVEL SECURITY;
ALTER TABLE rate_limit_attempts FORCE ROW LEVEL SECURITY;

-- -------------------------------------------------------------------------
-- 3. CONFIG : verrouillage TOTAL (contient creator_code)
-- -------------------------------------------------------------------------
ALTER TABLE config ENABLE ROW LEVEL SECURITY;
ALTER TABLE config FORCE ROW LEVEL SECURITY;

-- -------------------------------------------------------------------------
-- 4. TRIPS : lecture publique OK, écritures bloquées
-- -------------------------------------------------------------------------
ALTER TABLE trips ENABLE ROW LEVEL SECURITY;

CREATE POLICY "trips_select_public" ON trips
  FOR SELECT
  TO anon, authenticated
  USING (true);

-- Pas de INSERT/UPDATE/DELETE policy = bloqués (sauf SECURITY DEFINER)

-- -------------------------------------------------------------------------
-- 5. MEMBRES : lecture publique OK, écritures bloquées
-- -------------------------------------------------------------------------
ALTER TABLE membres ENABLE ROW LEVEL SECURITY;

CREATE POLICY "membres_select_public" ON membres
  FOR SELECT
  TO anon, authenticated
  USING (true);

-- -------------------------------------------------------------------------
-- 6. INFOS : lecture publique OK, écritures bloquées
-- -------------------------------------------------------------------------
ALTER TABLE infos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "infos_select_public" ON infos
  FOR SELECT
  TO anon, authenticated
  USING (true);

-- -------------------------------------------------------------------------
-- 7. MESSAGES : lecture publique OK, écritures bloquées
-- -------------------------------------------------------------------------
ALTER TABLE messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "messages_select_public" ON messages
  FOR SELECT
  TO anon, authenticated
  USING (true);

-- -------------------------------------------------------------------------
-- 8. PARTICIPANTS_AUTORISES : lecture publique OK, écritures bloquées
-- -------------------------------------------------------------------------
ALTER TABLE participants_autorises ENABLE ROW LEVEL SECURITY;

CREATE POLICY "autorises_select_public" ON participants_autorises
  FOR SELECT
  TO anon, authenticated
  USING (true);

-- =========================================================================
-- FIN du bloc 5
--
-- Après cette exécution :
--   ✅ L'app continue à marcher via les RPC (SECURITY DEFINER bypass RLS)
--   ✅ Les SELECT directs fonctionnent encore (lecture publique)
--   ❌ Les INSERT/UPDATE/DELETE directs depuis anon ne passent plus
--   ❌ access_tokens, rate_limit_attempts, config deviennent invisibles
--
-- Si un flow critique casse, ROLLBACK rapide :
--   ALTER TABLE trips DISABLE ROW LEVEL SECURITY;
--   ALTER TABLE membres DISABLE ROW LEVEL SECURITY;
--   ALTER TABLE infos DISABLE ROW LEVEL SECURITY;
--   ALTER TABLE messages DISABLE ROW LEVEL SECURITY;
--   ALTER TABLE participants_autorises DISABLE ROW LEVEL SECURITY;
--   ALTER TABLE access_tokens DISABLE ROW LEVEL SECURITY;
--   ALTER TABLE rate_limit_attempts DISABLE ROW LEVEL SECURITY;
--   ALTER TABLE config DISABLE ROW LEVEL SECURITY;
-- =========================================================================
