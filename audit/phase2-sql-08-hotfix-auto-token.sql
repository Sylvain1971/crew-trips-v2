-- =========================================================================
-- HOTFIX : get_membre_by_id genere aussi un token (Phase 2)
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

  -- Generer un nouveau token pour ce membre (necessaire pour ecrire via RPC)
  INSERT INTO access_tokens (membre_id, trip_id, tel)
  VALUES (v_membre.id, v_membre.trip_id, normalize_tel(COALESCE(v_membre.tel, '')))
  RETURNING token INTO v_token;

  RETURN jsonb_build_object(
    'success', true,
    'membre', row_to_json(v_membre),
    'token', v_token
  );
END;
$$;

GRANT EXECUTE ON FUNCTION get_membre_by_id(UUID) TO anon, authenticated;
