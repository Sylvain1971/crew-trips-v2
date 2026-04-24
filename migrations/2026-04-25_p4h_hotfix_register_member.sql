-- =============================================================================
-- P4h HOTFIX : register_member sans share_token
-- =============================================================================
-- Bug détecté en prod (soir du 24 avril 2026) :
--   column "share_token" of relation "membres" does not exist
-- Sophie (et tous les invités) bloqués à "Rejoindre ce trip".
--
-- Cause : ma migration P4g a ajouté des références à share_token dans
-- register_member, mais cette colonne n'existe pas dans le schéma prod
-- de membres.
--
-- Fix : retirer share_token + last_seen_at des UPDATE/INSERT. Le token
-- n'est plus retourné — le frontend doit aussi être nettoyé.
-- =============================================================================

-- Étape 1 : DIAGNOSTIC — confirmer le vrai schéma de membres
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'membres'
ORDER BY ordinal_position;

-- Étape 2 : HOTFIX — recréer register_member sans share_token
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

  -- P4 strict : liste vide = refus
  SELECT COUNT(*) INTO v_autorises_count
  FROM participants_autorises
  WHERE trip_id = v_trip.id;

  v_prenom_final := trim(p_prenom);
  v_nom_final := COALESCE(trim(p_nom), '');

  IF v_autorises_count = 0 THEN
    RETURN jsonb_build_object('success', false, 'message', 'Ce trip n''accepte pas encore de participants. Contactez l''administrateur.');
  END IF;

  -- Matching insensible aux accents
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

  -- Utiliser les valeurs canoniques
  v_prenom_final := v_matched_autorise.prenom;
  v_nom_final := COALESCE(v_matched_autorise.nom, '');

  -- Vérifier si déjà membre (reconnexion)
  SELECT * INTO v_existing_member FROM membres
  WHERE trip_id = v_trip.id
    AND lower(public.unaccent(trim(prenom))) = lower(public.unaccent(trim(v_prenom_final)))
    AND lower(public.unaccent(trim(COALESCE(nom, '')))) = lower(public.unaccent(trim(v_nom_final)))
  LIMIT 1;

  IF v_existing_member.id IS NOT NULL THEN
    -- Déjà membre : vérif NIP
    IF v_existing_member.nip IS NOT NULL AND v_existing_member.nip != p_nip_hash THEN
      RETURN jsonb_build_object('success', false, 'message', 'NIP incorrect.');
    END IF;
    -- Mise à jour tel + nip (PAS de share_token, PAS de last_seen_at)
    UPDATE membres
    SET tel = p_tel,
        nip = p_nip_hash
    WHERE id = v_existing_member.id;
    RETURN jsonb_build_object('success', true, 'member_id', v_existing_member.id);
  END IF;

  -- Nouveau membre : couleur aléatoire + INSERT (PAS de share_token)
  v_couleur := (ARRAY['#E74C3C','#3498DB','#2ECC71','#F39C12','#9B59B6','#1ABC9C','#E67E22','#34495E'])
               [1 + floor(random() * 8)::int];

  INSERT INTO membres (trip_id, prenom, nom, tel, nip, couleur, is_createur)
  VALUES (v_trip.id, v_prenom_final, v_nom_final, p_tel, p_nip_hash, v_couleur, false)
  RETURNING id INTO v_member_id;

  RETURN jsonb_build_object('success', true, 'member_id', v_member_id);
END;
$$;

GRANT EXECUTE ON FUNCTION register_member(TEXT, TEXT, TEXT, TEXT, TEXT) TO anon, authenticated;

-- Étape 3 : VALIDATION — la fonction est bien créée
SELECT proname, pronargs
FROM pg_proc
WHERE proname = 'register_member';
