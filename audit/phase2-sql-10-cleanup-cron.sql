-- =========================================================================
-- PHASE 2 - SQL #10 : Cleanup tokens et rate_limit expires (preparation cron)
-- =========================================================================
--
-- Contexte : la table access_tokens accumule des rows au fil du temps.
-- Depuis le SQL #9, on ne cree plus de nouveau token si un valide existe,
-- mais les anciens tokens (non-expires) restent jusqu'a expiration (30 jours).
-- De plus, rate_limit_attempts accumule des tentatives NIP.
--
-- Objectif : une fonction idempotente qui purge :
--   - les access_tokens expires depuis plus de 7 jours (garde marge de securite
--     au cas ou un client aurait encore un token cache expire pas trop vieux)
--   - les rate_limit_attempts qui n'ont plus servi depuis plus de 24h
--
-- Deploiement :
--   1) Executer ce SQL dans le SQL Editor -> cree la fonction uniquement.
--   2) Tester manuellement : SELECT * FROM cleanup_expired_tokens();
--   3) Brancher un cron Supabase quotidien (voir Dashboard > Database > Cron).
--
-- Rollback : DROP FUNCTION cleanup_expired_tokens();
-- =========================================================================

DROP FUNCTION IF EXISTS cleanup_expired_tokens();

CREATE OR REPLACE FUNCTION cleanup_expired_tokens()
RETURNS TABLE(
  tokens_deleted BIGINT,
  rate_limits_deleted BIGINT,
  run_at TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tokens_deleted BIGINT;
  v_rl_deleted BIGINT;
BEGIN
  WITH del AS (
    DELETE FROM access_tokens
    WHERE expires_at < NOW() - INTERVAL '7 days'
    RETURNING 1
  )
  SELECT COUNT(*) INTO v_tokens_deleted FROM del;

  WITH del AS (
    DELETE FROM rate_limit_attempts
    WHERE last_attempt_at < NOW() - INTERVAL '1 day'
    RETURNING 1
  )
  SELECT COUNT(*) INTO v_rl_deleted FROM del;

  RETURN QUERY SELECT v_tokens_deleted, v_rl_deleted, NOW();
END;
$$;

-- On NE grant PAS EXECUTE a anon/authenticated : cette fonction est
-- admin-only (appelee par le cron qui tourne en role postgres).
REVOKE ALL ON FUNCTION cleanup_expired_tokens() FROM anon, authenticated, public;

-- =========================================================================
-- APRES EXECUTION : test manuel
-- =========================================================================
--
--   SELECT * FROM cleanup_expired_tokens();
--
-- Vu l'etat actuel (tokens valides accumules mais pas expires depuis 7j+,
-- et probablement peu de rate_limit_attempts), ce premier appel devrait
-- retourner (0, 0, NOW()) ou presque. C'est normal.
--
-- La fonction deviendra utile au fil des semaines/mois.
-- =========================================================================

-- =========================================================================
-- ETAPE SUIVANTE : brancher le cron
-- =========================================================================
--
-- Dashboard Supabase > Database > Cron > Create a new cron job :
--   Name      : cleanup-expired-tokens-daily
--   Schedule  : 0 4 * * *   (chaque jour a 04h00 UTC, soit minuit ET)
--   SQL       : SELECT cleanup_expired_tokens();
--
-- Alternative via pg_cron SQL (si l'extension est activee) :
--   SELECT cron.schedule(
--     'cleanup-expired-tokens-daily',
--     '0 4 * * *',
--     $CRON$ SELECT cleanup_expired_tokens(); $CRON$
--   );
--
-- =========================================================================
