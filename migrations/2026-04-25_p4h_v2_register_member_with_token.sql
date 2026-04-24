-- =============================================================================
-- P4h-v2 : register_member avec génération de token access_tokens
-- =============================================================================
-- La v1 du hotfix a retiré share_token (qui n'existait pas) mais a aussi
-- oublié de générer le token dans access_tokens. Résultat : Sophie peut
-- rejoindre mais n'a pas de token pour les endpoints protégés (album,
-- messages, permissions).
--
-- Cette v2 rétablit la génération du token via INSERT INTO access_tokens
-- (pattern original de Phase 2), tout en gardant le verrou strict P4g
-- (liste vide = refus).
-- =============================================================================

CREATE OR REPLACE FUNCTION register_member(
  p_trip_code TEXT,
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
  v_trip trips%ROWTYPE;
  v_tel_norm TEXT;
  v_autorises_count INT;
  v_matched_autorise participants_autorises%ROWTYPE;
  v_existing_member membres%ROWTYPE;
  v_prenom_final TEXT;
  v_nom_final TEXT;
  v_couleur TEXT;
  v_member_id UUID;
  v_token TEXT;
BEGIN
  IF p_prenom IS NULL OR trim(p_prenom) = '' THEN
    RETURN jsonb_build_object('success', false, 'message', 'Prénom requis.');
  END IF;
  IF p_nom IS NULL OR trim(p_nom) = '' THEN
    RETURN jsonb_build_object('success', false, 'message', 'Nom requis.');
  END IF;
  IF p_tel IS NULL OR trim(p_tel) = '' THEN
    RETURN jsonb_build_object('success', false, 'message', 'Téléphone requis.');
  END IF;
  IF p_nip_hash IS NULL OR LENGTH(p_nip_hash) < 40 THEN
    RETURN jsonb_build_object('success', false, 'message', 'NIP invalide.');
  END IF;

  SELECT * INTO v_trip FROM trips WHERE code = p_trip_code;
  IF v_trip.id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'message', 'Trip introuvable.');
  END IF;

  v_tel_norm := normalize_tel(p_tel);
  IF v_tel_norm = '' THEN
    RETURN jsonb_build_object('success', false, 'message', 'Téléphone invalide.');
  END IF;

  -- Vérif NIP cross-trip
  IF EXISTS (
    SELECT 1 FROM membres
    WHERE normalize_tel(tel) = v_tel_norm
      AND nip IS NOT NULL
      AND nip != p_nip_hash
  ) THEN
    RETURN jsonb_build_object('success', false, 'message', 'Ce numéro de téléphone est déjà associé à un NIP différent.');
  END IF;

  -- P4g : verrou strict liste vide
  SELECT COUNT(*) INTO v_autorises_count
  FROM participants_autorises
  WHERE trip_id = v_trip.id;

  v_prenom_final := trim(p_prenom);
  v_nom_final := COALESCE(trim(p_nom), '');

  IF v_autorises_count = 0 THEN
    RETURN jsonb_build_object('success', false, 'message', 'Ce trip n''accepte pas encore de participants. Contactez l''administrateur.');
  END IF;

  -- Matching accent-insensitif sur participants_autorises
  SELECT * INTO v_matched_autorise FROM participants_autorises
  WHERE trip_id = v_trip.id
    AND lower(public.unaccent(trim(prenom))) = lower(public.unaccent(trim(v_prenom_final)))
    AND lower(public.unaccent(trim(COALESCE(nom, '')))) = lower(public.unaccent(trim(v_nom_final)))
  LIMIT 1;

  IF v_matched_autorise.id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'message', 'Pas dans la liste autorisée.');
  END IF;

  IF v_matched_autorise.tel IS NOT NULL AND v_matched_autorise.tel != '' THEN
    IF normalize_tel(v_matched_autorise.tel) != v_tel_norm THEN
      RETURN jsonb_build_object('success', false, 'message', 'Le numéro ne correspond pas à celui enregistré pour ce participant.');
    END IF;
  END IF;

  v_prenom_final := v_matched_autorise.prenom;
  v_nom_final := COALESCE(v_matched_autorise.nom, '');

  -- Vérifier si déjà membre (reconnexion)
  SELECT * INTO v_existing_member FROM membres
  WHERE trip_id = v_trip.id
    AND lower(public.unaccent(trim(prenom))) = lower(public.unaccent(trim(v_prenom_final)))
    AND lower(public.unaccent(trim(COALESCE(nom, '')))) = lower(public.unaccent(trim(v_nom_final)))
  LIMIT 1;

  IF v_existing_member.id IS NOT NULL THEN
    IF v_existing_member.nip IS NOT NULL AND v_existing_member.nip != p_nip_hash THEN
      RETURN jsonb_build_object('success', false, 'message', 'NIP incorrect.');
    END IF;
    UPDATE membres
    SET tel = p_tel,
        nip = p_nip_hash
    WHERE id = v_existing_member.id;

    -- Générer un nouveau token d'accès
    INSERT INTO access_tokens (membre_id, trip_id, tel)
    VALUES (v_existing_member.id, v_trip.id, v_tel_norm)
    RETURNING token INTO v_token;

    RETURN jsonb_build_object(
      'success', true,
      'token', v_token,
      'member_id', v_existing_member.id,
      'membre_id', v_existing_member.id,
      'trip_id', v_trip.id
    );
  END IF;

  -- Nouveau membre : INSERT + génération token
  v_couleur := (ARRAY['#E74C3C','#3498DB','#2ECC71','#F39C12','#9B59B6','#1ABC9C','#E67E22','#34495E'])
               [1 + floor(random() * 8)::int];

  INSERT INTO membres (trip_id, prenom, nom, tel, nip, couleur, is_createur)
  VALUES (v_trip.id, v_prenom_final, v_nom_final, p_tel, p_nip_hash, v_couleur, false)
  RETURNING id INTO v_member_id;

  INSERT INTO access_tokens (membre_id, trip_id, tel)
  VALUES (v_member_id, v_trip.id, v_tel_norm)
  RETURNING token INTO v_token;

  RETURN jsonb_build_object(
    'success', true,
    'token', v_token,
    'member_id', v_member_id,
    'membre_id', v_member_id,
    'trip_id', v_trip.id
  );
END;
$$;

GRANT EXECUTE ON FUNCTION register_member(TEXT, TEXT, TEXT, TEXT, TEXT) TO anon, authenticated;

-- Validation
SELECT proname, pronargs FROM pg_proc WHERE proname = 'register_member';
