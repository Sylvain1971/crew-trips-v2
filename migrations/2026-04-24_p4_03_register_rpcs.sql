-- P4 Sous-chantiers 4.4 + 4.5 : RPC register_identity et register_from_invitation
-- register_identity : valide l'identite (verif NIP cross-trip) sans inscrire en DB
-- register_from_invitation : wrapper qui delegue a register_member avec le trip_code resolu

-- =============================================================================
-- 4.4 : register_identity
-- =============================================================================
CREATE OR REPLACE FUNCTION register_identity(
  p_prenom TEXT,
  p_nom TEXT,
  p_tel TEXT,
  p_nip_hash TEXT
)
RETURNS JSONB
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql
AS $$
DECLARE
  v_tel_norm TEXT;
  v_existing_nip TEXT;
BEGIN
  -- Validations basiques
  IF p_prenom IS NULL OR trim(p_prenom) = '' THEN
    RETURN jsonb_build_object('success', false, 'message', 'Prenom requis.');
  END IF;
  IF p_nom IS NULL OR trim(p_nom) = '' THEN
    RETURN jsonb_build_object('success', false, 'message', 'Nom requis.');
  END IF;
  IF p_tel IS NULL OR trim(p_tel) = '' THEN
    RETURN jsonb_build_object('success', false, 'message', 'Telephone requis.');
  END IF;
  IF p_nip_hash IS NULL OR LENGTH(p_nip_hash) < 40 THEN
    RETURN jsonb_build_object('success', false, 'message', 'NIP invalide.');
  END IF;

  v_tel_norm := normalize_tel(p_tel);
  IF v_tel_norm = '' THEN
    RETURN jsonb_build_object('success', false, 'message', 'Telephone invalide.');
  END IF;

  -- Verifier si ce tel existe deja dans membres (cross-trip)
  SELECT nip INTO v_existing_nip
  FROM membres
  WHERE normalize_tel(tel) = v_tel_norm AND nip IS NOT NULL
  LIMIT 1;

  -- Si NIP existant avec tel : valider que les NIP concordent
  IF v_existing_nip IS NOT NULL AND v_existing_nip != p_nip_hash THEN
    RETURN jsonb_build_object(
      'success', false,
      'message', 'Ce numero de telephone est deja associe a un NIP different.'
    );
  END IF;

  -- Succes : l'identite est validee. Pas d'enregistrement en DB a ce stade.
  -- L'enregistrement se fera quand l'utilisateur rejoint un trip via register_from_invitation.
  RETURN jsonb_build_object(
    'success', true,
    'prenom', trim(p_prenom),
    'nom', trim(p_nom),
    'tel', v_tel_norm
  );
END;
$$;

GRANT EXECUTE ON FUNCTION register_identity(TEXT, TEXT, TEXT, TEXT) TO anon, authenticated;


-- =============================================================================
-- 4.5 : register_from_invitation
-- =============================================================================
CREATE OR REPLACE FUNCTION register_from_invitation(
  p_trip_id UUID,
  p_prenom TEXT,
  p_nom TEXT,
  p_tel TEXT,
  p_nip_hash TEXT
)
RETURNS JSONB
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql
AS $$
DECLARE
  v_trip_code TEXT;
BEGIN
  -- Recuperer le trip_code
  SELECT code INTO v_trip_code FROM trips WHERE id = p_trip_id;
  IF v_trip_code IS NULL THEN
    RETURN jsonb_build_object('success', false, 'message', 'Trip introuvable.');
  END IF;

  -- Deleguer a register_member avec le trip_code
  RETURN register_member(v_trip_code, p_prenom, p_nom, p_tel, p_nip_hash);
END;
$$;

GRANT EXECUTE ON FUNCTION register_from_invitation(UUID, TEXT, TEXT, TEXT, TEXT) TO anon, authenticated;


-- =============================================================================
-- Validation
-- =============================================================================
-- Test register_identity avec Sylvain (tel deja en DB avec NIP) : doit succeed
-- si p_nip_hash matche le NIP existant
SELECT register_identity('Sylvain', 'Bergeron', '4185401302', 'fake_hash_pour_test_different');
-- Attendu : success=false avec message "numero deja associe a un NIP different"
