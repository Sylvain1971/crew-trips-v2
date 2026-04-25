-- =============================================================================
-- P4j2 : token-stability étendu à join_trip + register_member
-- =============================================================================
-- Contexte : SQL #9 token-stability ne couvre que get_membre_by_id (reconnexion
-- auto via localStorage/SW). Les logins NIP via JoinScreen passent par
-- register_member (inscription) ou join_trip (reconnexion par tel+NIP), qui
-- INSERT inconditionnellement dans access_tokens à chaque appel.
--
-- Résultat observé : 18 tokens accumulés sur Winter Steelhead 2026 pour
-- 1 seul membre, après 5 jours de tests Phase 2.
--
-- Fix : appliquer le même pattern qu'en SQL #9 (chercher un token valide
-- existant, le réutiliser et bumper last_used_at, sinon en créer un nouveau).
-- Pas de breaking change : la signature et le retour des RPCs sont identiques.
-- =============================================================================

-- -------------------------------------------------------------------------
-- 1) join_trip : reuse token valide existant
-- -------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION join_trip(
  p_trip_code TEXT,
  p_tel TEXT,
  p_nip_hash TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_verify JSONB;
  v_token UUID;
  v_tel_norm TEXT;
  v_membre_id UUID;
  v_trip_id UUID;
BEGIN
  v_verify := verify_nip(p_trip_code, p_tel, p_nip_hash);

  IF (v_verify->>'success')::BOOLEAN IS NOT TRUE THEN
    RETURN v_verify;
  END IF;

  v_tel_norm := normalize_tel(p_tel);
  v_membre_id := (v_verify->>'membre_id')::UUID;
  v_trip_id := (v_verify->>'trip_id')::UUID;

  -- P4j2 : Cherche un token valide existant pour ce (membre, trip) avant d'en créer un nouveau
  SELECT token INTO v_token
  FROM access_tokens
  WHERE membre_id = v_membre_id
    AND trip_id = v_trip_id
    AND expires_at > NOW()
  ORDER BY created_at DESC
  LIMIT 1;

  IF v_token IS NULL THEN
    INSERT INTO access_tokens (membre_id, trip_id, tel)
    VALUES (v_membre_id, v_trip_id, v_tel_norm)
    RETURNING token INTO v_token;
  ELSE
    UPDATE access_tokens SET last_used_at = NOW() WHERE token = v_token;
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'token', v_token,
    'membre_id', v_membre_id,
    'trip_id', v_trip_id,
    'nip_required', COALESCE((v_verify->>'nip_required')::BOOLEAN, false)
  );
END;
$$;

GRANT EXECUTE ON FUNCTION join_trip(TEXT, TEXT, TEXT) TO anon, authenticated;

-- -------------------------------------------------------------------------
-- 2) register_member : reuse token valide existant
-- (basé sur la version P4h-v2 hotfix register_member with token, avec
--  ajout du pattern token-stability pour ne plus créer de doublons)
-- -------------------------------------------------------------------------
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

  -- Verif NIP cross-trip
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

    -- P4j2 : reuse token valide existant
    SELECT token::TEXT INTO v_token
    FROM access_tokens
    WHERE membre_id = v_existing_member.id
      AND trip_id = v_trip.id
      AND expires_at > NOW()
    ORDER BY created_at DESC
    LIMIT 1;

    IF v_token IS NULL THEN
      INSERT INTO access_tokens (membre_id, trip_id, tel)
      VALUES (v_existing_member.id, v_trip.id, v_tel_norm)
      RETURNING token INTO v_token;
    ELSE
      UPDATE access_tokens SET last_used_at = NOW() WHERE token::TEXT = v_token;
    END IF;

    RETURN jsonb_build_object(
      'success', true,
      'token', v_token,
      'member_id', v_existing_member.id,
      'membre_id', v_existing_member.id,
      'trip_id', v_trip.id
    );
  END IF;

  -- Nouveau membre : INSERT + génération token (toujours nouveau, pas de reuse possible)
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

-- =============================================================================
-- VALIDATION
-- =============================================================================
SELECT proname, pronargs FROM pg_proc WHERE proname IN ('join_trip', 'register_member') ORDER BY proname;

-- Test idempotence (à runner manuellement après application) :
-- 1. Run register_member 2x avec mêmes params -> doit retourner même token la 2e fois
-- 2. SELECT membre_id, COUNT(*) FROM access_tokens WHERE expires_at > NOW() GROUP BY membre_id HAVING COUNT(*) > 1;
--    -> doit retourner 0 ligne après quelques heures d'usage normal
