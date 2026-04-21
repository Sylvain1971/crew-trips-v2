-- =========================================================================
-- PHASE 2.5 CORRECTIF — RLS réellement forcée
--
-- Le bloc 5 précédent a activé RLS mais les GRANTs existants laissent
-- passer les écritures. On corrige en :
--  1. REVOKE des privileges INSERT/UPDATE/DELETE à anon/authenticated
--  2. FORCE RLS sur les tables avec policies (au cas où)
-- =========================================================================

-- -------------------------------------------------------------------------
-- REVOKE des privileges d'ecriture pour anon et authenticated
-- Les RPC SECURITY DEFINER n'ont PAS besoin de ces privileges (elles
-- s'executent avec les privileges du owner = postgres).
-- -------------------------------------------------------------------------
REVOKE INSERT, UPDATE, DELETE ON trips FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE ON membres FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE ON infos FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE ON messages FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE ON participants_autorises FROM anon, authenticated;

-- Tables secrets : REVOKE total (incluant SELECT)
REVOKE ALL ON access_tokens FROM anon, authenticated;
REVOKE ALL ON rate_limit_attempts FROM anon, authenticated;
REVOKE ALL ON config FROM anon, authenticated;

-- On conserve SELECT pour les tables publiques
GRANT SELECT ON trips TO anon, authenticated;
GRANT SELECT ON membres TO anon, authenticated;
GRANT SELECT ON infos TO anon, authenticated;
GRANT SELECT ON messages TO anon, authenticated;
GRANT SELECT ON participants_autorises TO anon, authenticated;

-- =========================================================================
-- Après cette exécution :
--   ✅ Les RPC SECURITY DEFINER continuent à marcher
--   ✅ SELECT direct sur les 5 tables publiques passe encore
--   ❌ INSERT/UPDATE/DELETE direct depuis anon -> 403 Forbidden
--   ❌ access_tokens, rate_limit_attempts, config totalement invisibles
--
-- ROLLBACK si souci :
--   GRANT INSERT, UPDATE, DELETE ON trips TO anon, authenticated;
--   (idem autres tables)
-- =========================================================================
