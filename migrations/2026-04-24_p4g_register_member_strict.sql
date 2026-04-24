-- =============================================================================
-- P4g : Verrou "liste vide = personne ne peut rejoindre" (P4 strict)
-- =============================================================================
-- Avant : si participants_autorises est vide pour un trip, register_member
-- accepte tout le monde (comportement legacy hérité du modèle QR direct).
-- Après : register_member refuse l'inscription si la liste est vide.
--
-- Pourquoi : avec le flow P4 (lien universel /install + invitations push),
-- il n'y a plus de QR direct vers un trip. L'accès doit passer par une
-- inscription dans participants_autorises. Un trip à liste vide = trip
-- verrouillé, aucun accès possible.
--
-- Le créateur du trip passe par la RPC create_trip (pas register_member)
-- donc cette migration ne casse pas la création de trip par un admin.
-- =============================================================================

-- On recrée register_member en modifiant juste le bloc de vérification
-- participants_autorises. Le reste de la fonction (trip lookup, couleur,
-- token, INSERT) reste identique au code actuel de Phase 2.

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
  v_token TEXT;
  v_member_id UUID;
BEGIN
  -- Validations basiques
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

  -- Récupérer le trip
  SELECT * INTO v_trip FROM trips WHERE code = p_trip_code;
  IF v_trip.id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'message', 'Trip introuvable.');
  END IF;

  v_tel_norm := normalize_tel(p_tel);
  IF v_tel_norm = '' THEN
    RETURN jsonb_build_object('success', false, 'message', 'Téléphone invalide.');
  END IF;

  -- Vérifier si le tel est déjà associé à un NIP différent cross-trip
  IF EXISTS (
    SELECT 1 FROM membres
    WHERE normalize_tel(tel) = v_tel_norm
      AND nip IS NOT NULL
      AND nip != p_nip_hash
  ) THEN
    RETURN jsonb_build_object(
      'success', false,
      'message', 'Ce numéro de téléphone est déjà associé à un NIP différent.'
    );
  END IF;

  -- =======================================================================
  -- P4 STRICT : Vérification participants_autorises
  -- =======================================================================
  SELECT COUNT(*) INTO v_autorises_count
  FROM participants_autorises
  WHERE trip_id = v_trip.id;

  v_prenom_final := trim(p_prenom);
  v_nom_final := COALESCE(trim(p_nom), '');

  -- P4g : liste vide = personne ne peut rejoindre (plus d'accès legacy ouvert)
  IF v_autorises_count = 0 THEN
    RETURN jsonb_build_object(
      'success', false,
      'message', 'Ce trip n''accepte pas encore de participants. Contactez l''administrateur.'
    );
  END IF;

  -- Liste non vide : match sur (prenom, nom) insensible casse + accents
  SELECT * INTO v_matched_autorise FROM participants_autorises
  WHERE trip_id = v_trip.id
    AND lower(public.unaccent(trim(prenom))) = lower(public.unaccent(trim(v_prenom_final)))
    AND lower(public.unaccent(trim(COALESCE(nom, '')))) = lower(public.unaccent(trim(v_nom_final)))
  LIMIT 1;

  IF v_matched_autorise.id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'message', 'Pas dans la liste autorisée.');
  END IF;

  -- Si le participant autorisé a un tel spécifique, vérifier la correspondance
  IF v_matched_autorise.tel IS NOT NULL AND v_matched_autorise.tel != '' THEN
    IF normalize_tel(v_matched_autorise.tel) != v_tel_norm THEN
      RETURN jsonb_build_object('success', false, 'message', 'Le numéro ne correspond pas à celui enregistré pour ce participant.');
    END IF;
  END IF;

  -- Utiliser les valeurs canoniques du participant autorisé
  v_prenom_final := v_matched_autorise.prenom;
  v_nom_final := COALESCE(v_matched_autorise.nom, '');

  -- =======================================================================
  -- Inscription
  -- =======================================================================
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
    -- NIP null ou match : mettre à jour tel + nip au cas où, retourner token
    v_token := COALESCE(v_existing_member.share_token, gen_random_uuid()::text);
    UPDATE membres
    SET tel = p_tel,
        nip = p_nip_hash,
        share_token = v_token,
        last_seen_at = now()
    WHERE id = v_existing_member.id;
    RETURN jsonb_build_object('success', true, 'token', v_token, 'member_id', v_existing_member.id);
  END IF;

  -- Nouveau membre : couleur aléatoire + INSERT
  v_couleur := (ARRAY['#E74C3C','#3498DB','#2ECC71','#F39C12','#9B59B6','#1ABC9C','#E67E22','#34495E'])
               [1 + floor(random() * 8)::int];
  v_token := gen_random_uuid()::text;

  INSERT INTO membres (trip_id, prenom, nom, tel, nip, couleur, is_createur, share_token)
  VALUES (v_trip.id, v_prenom_final, v_nom_final, p_tel, p_nip_hash, v_couleur, false, v_token)
  RETURNING id INTO v_member_id;

  RETURN jsonb_build_object('success', true, 'token', v_token, 'member_id', v_member_id);
END;
$$;

GRANT EXECUTE ON FUNCTION register_member(TEXT, TEXT, TEXT, TEXT, TEXT) TO anon, authenticated;

-- =============================================================================
-- Validation
-- =============================================================================

-- V1 : register_member sur un trip à liste vide doit refuser
-- (simule un trip fictif — à commenter en prod)
-- SELECT register_member('XXXXXX', 'Test', 'User', '5145551234', repeat('x', 64));

-- V2 : participants_autorises de Les Gonzesses bien trouvés
SELECT COUNT(*) AS nb_autorises_gonzesses
FROM participants_autorises
WHERE trip_id = 'f18dc5e3-4d40-4929-a942-c5cb4ab62417';
