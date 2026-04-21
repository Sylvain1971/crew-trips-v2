-- =========================================================================
-- PHASE 2 - SQL #9 : Stabilite token (reuse si valide existant)
-- =========================================================================
--
-- Contexte : Apres SQL #8, get_membre_by_id creait INCONDITIONNELLEMENT un
-- nouveau token a chaque ouverture de trip, meme si un token valide existait
-- deja. Ca polluait access_tokens (1 row par reload x 3 trips x N membres).
--
-- Fix : chercher d'abord un token valide (non expire) pour ce (membre, trip).
--       Si trouve -> bumper last_used_at et le reutiliser.
--       Si absent -> creer un nouveau token (comportement actuel).
--
-- Rollback : reexecuter phase2-sql-08-hotfix-auto-token.sql pour revenir
-- au comportement "1 token par reconnexion".
-- =========================================================================

DROP FUNCTION IF EXISTS get_membre_by_id(UUID);

CREATE OR REPLACE FUNCTION get_membre_by_id(p_membre_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_membre membres%ROWTYPE;
  v_token UUID;
BEGIN
  SELECT * INTO v_membre FROM membres WHERE id = p_membre_id;
  IF v_membre.id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'message', 'Membre introuvable');
  END IF;

  -- Cherche un token valide existant pour ce membre/trip
  SELECT token INTO v_token
  FROM access_tokens
  WHERE membre_id = v_membre.id
    AND trip_id = v_membre.trip_id
    AND expires_at > NOW()
  ORDER BY created_at DESC
  LIMIT 1;

  IF v_token IS NULL THEN
    -- Aucun token valide : en creer un nouveau
    INSERT INTO access_tokens (membre_id, trip_id, tel)
    VALUES (v_membre.id, v_membre.trip_id, normalize_tel(COALESCE(v_membre.tel, '')))
    RETURNING token INTO v_token;
  ELSE
    -- Token valide reutilise : bump last_used_at pour monitoring
    UPDATE access_tokens SET last_used_at = NOW() WHERE token = v_token;
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'membre', row_to_json(v_membre),
    'token', v_token
  );
END;
$$;

GRANT EXECUTE ON FUNCTION get_membre_by_id(UUID) TO anon, authenticated;

-- =========================================================================
-- VERIFICATION POST-EXECUTION (optionnel, a runner dans le SQL Editor)
-- =========================================================================
--
-- 1) Appeler la RPC deux fois de suite pour le meme membre -> doit retourner
--    le meme token la 2e fois :
--
--    SELECT get_membre_by_id('3d31fe32-74a6-42a0-adca-ec4591a95cb1'::uuid);
--    SELECT get_membre_by_id('3d31fe32-74a6-42a0-adca-ec4591a95cb1'::uuid);
--
-- 2) Verifier qu'aucun nouveau token n'a ete cree :
--
--    SELECT membre_id, COUNT(*) AS nb_tokens
--    FROM access_tokens
--    WHERE expires_at > NOW()
--    GROUP BY membre_id
--    ORDER BY nb_tokens DESC;
--
-- =========================================================================
