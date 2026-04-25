-- =============================================================================
-- P4j : admin_reset_member_nip
-- =============================================================================
-- Permet à l'admin (créateur) d'un trip de réinitialiser le NIP d'un membre
-- qui l'a oublié. Met membres.nip à NULL et invalide les access_tokens du
-- membre cible. Au prochain login, JoinScreen détecte nip IS NULL et bascule
-- automatiquement vers le mode 'creer-nip' (mécanisme migration douce déjà
-- en place depuis Phase 2).
--
-- Sécurité :
--   - Admin authentifié via access_tokens.token
--   - Lien token <-> trip vérifié (un admin ne peut reset que dans SES trips)
--   - membres.is_createur = true requis
--   - Pas de reset de son propre NIP par cette voie (utiliser "Modifier mon NIP")
-- =============================================================================

CREATE OR REPLACE FUNCTION admin_reset_member_nip(
  p_token TEXT,
  p_trip_code TEXT,
  p_member_id UUID
)
RETURNS JSONB
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql
AS $$
DECLARE
  v_trip trips%ROWTYPE;
  v_token_record access_tokens%ROWTYPE;
  v_admin membres%ROWTYPE;
  v_target membres%ROWTYPE;
BEGIN
  -- Validation entrée
  IF p_token IS NULL OR p_token = '' THEN
    RETURN jsonb_build_object('success', false, 'message', 'Token manquant.');
  END IF;
  IF p_trip_code IS NULL OR p_trip_code = '' THEN
    RETURN jsonb_build_object('success', false, 'message', 'Code de trip manquant.');
  END IF;
  IF p_member_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'message', 'Membre cible manquant.');
  END IF;

  -- Trouver le trip
  SELECT * INTO v_trip FROM trips WHERE code = p_trip_code;
  IF v_trip.id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'message', 'Trip introuvable.');
  END IF;

  -- Vérifier le token, et qu'il est bien lié à ce trip
  SELECT * INTO v_token_record FROM access_tokens
    WHERE token = p_token::uuid
      AND trip_id = v_trip.id;
  IF v_token_record.token IS NULL THEN
    RETURN jsonb_build_object('success', false, 'message', 'Token invalide ou expiré.');
  END IF;

  -- Vérifier que le porteur du token est admin (créateur) du trip
  SELECT * INTO v_admin FROM membres
    WHERE id = v_token_record.membre_id
      AND trip_id = v_trip.id;
  IF v_admin.id IS NULL OR v_admin.is_createur != true THEN
    RETURN jsonb_build_object('success', false, 'message', 'Action réservée à l''administrateur du trip.');
  END IF;

  -- Vérifier que le membre cible appartient bien au même trip
  SELECT * INTO v_target FROM membres
    WHERE id = p_member_id
      AND trip_id = v_trip.id;
  IF v_target.id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'message', 'Membre introuvable dans ce trip.');
  END IF;

  -- Empêcher de reset son propre NIP via cette RPC
  IF v_target.id = v_admin.id THEN
    RETURN jsonb_build_object('success', false, 'message', 'Utilisez "Modifier mon NIP" pour votre propre NIP.');
  END IF;

  -- Reset NIP côté DB
  UPDATE membres SET nip = NULL WHERE id = p_member_id;

  -- Invalider les access_tokens du membre cible : force re-login + re-création NIP
  DELETE FROM access_tokens WHERE membre_id = p_member_id;

  RETURN jsonb_build_object(
    'success', true,
    'message', 'NIP de ' || v_target.prenom || ' réinitialisé.',
    'prenom', v_target.prenom,
    'nom', v_target.nom
  );
END;
$$;

GRANT EXECUTE ON FUNCTION admin_reset_member_nip(TEXT, TEXT, UUID) TO anon, authenticated;

-- Validation
SELECT proname, pronargs FROM pg_proc WHERE proname = 'admin_reset_member_nip';
