-- =========================================================================
-- PHASE 2.2 — Complément RPC pour la reconnexion et le chargement public
-- Date : 2026-04-21
-- A executer APRES phase2-sql-01-fondations.sql
--
-- Contenu :
-- 1. Fonction get_trip_by_code (public, pour JoinScreen avant login)
-- 2. Fonction reconnect_by_tel (reconnexion auto d'un membre NIP deja configure)
-- 3. Fonction save_nip (definir/changer le NIP d'un membre)
-- 4. Fonction register_member (nouvelle inscription prenom+nom+tel+NIP)
-- 5. Fonction get_autorises (liste participants_autorises pour un trip)
-- 6. Fonction get_membre_by_id (reload d'un membre par son id)
-- =========================================================================

-- -------------------------------------------------------------------------
-- 1. get_trip_by_code : retourne le trip par son code (public, pas besoin de token)
-- -------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION get_trip_by_code(p_code TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_trip JSONB;
BEGIN
  SELECT to_jsonb(t.*) INTO v_trip FROM trips t WHERE code = p_code;
  IF v_trip IS NULL THEN
    RETURN jsonb_build_object('success', false, 'message', 'Trip introuvable');
  END IF;
  RETURN jsonb_build_object('success', true, 'trip', v_trip);
END;
$$;

-- -------------------------------------------------------------------------
-- 2. reconnect_by_tel : tente une reconnexion auto par tel
--    Si le membre a un NIP configure, on ne peut PAS generer de token
--    (il faut passer par verify_nip). On retourne juste les infos du membre
--    pour que le client sache s'il doit redemander le NIP.
-- -------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION reconnect_by_tel(p_trip_code TEXT, p_tel TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tel_norm TEXT;
  v_trip_id UUID;
  v_membre membres%ROWTYPE;
BEGIN
  v_tel_norm := normalize_tel(p_tel);
  IF v_tel_norm = '' THEN
    RETURN jsonb_build_object('success', false, 'message', 'Tel invalide');
  END IF;

  SELECT id INTO v_trip_id FROM trips WHERE code = p_trip_code;
  IF v_trip_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'message', 'Trip introuvable');
  END IF;

  SELECT * INTO v_membre FROM membres
  WHERE trip_id = v_trip_id AND normalize_tel(tel) = v_tel_norm
  LIMIT 1;

  IF v_membre.id IS NULL THEN
    -- Fallback: cas ou le createur_tel matche (ancien pattern)
    SELECT m.* INTO v_membre FROM membres m
    JOIN trips t ON t.id = m.trip_id
    WHERE t.code = p_trip_code AND m.is_createur = true AND normalize_tel(t.createur_tel) = v_tel_norm
    LIMIT 1;
  END IF;

  IF v_membre.id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'message', 'Membre introuvable');
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'membre', to_jsonb(v_membre),
    'has_nip', (v_membre.nip IS NOT NULL)
  );
END;
$$;

-- -------------------------------------------------------------------------
-- 3. save_nip : definit ou change le NIP d'un membre identifie par tel
--    Propage a toutes les lignes membres ayant le meme tel (meme personne
--    sur plusieurs trips).
-- -------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION save_nip(p_tel TEXT, p_nip_hash TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tel_norm TEXT;
  v_count INT;
BEGIN
  v_tel_norm := normalize_tel(p_tel);
  IF v_tel_norm = '' OR LENGTH(p_nip_hash) < 40 THEN
    RETURN jsonb_build_object('success', false, 'message', 'Parametres invalides');
  END IF;

  UPDATE membres SET nip = p_nip_hash WHERE normalize_tel(tel) = v_tel_norm;
  GET DIAGNOSTICS v_count = ROW_COUNT;

  IF v_count = 0 THEN
    RETURN jsonb_build_object('success', false, 'message', 'Aucun membre trouve');
  END IF;

  RETURN jsonb_build_object('success', true, 'updated', v_count);
END;
$$;

-- -------------------------------------------------------------------------
-- 4. register_member : inscription d'un nouveau participant
--    Verifie la liste des participants_autorises si elle est active,
--    cree une ligne dans membres avec NIP hashe, et retourne un token.
-- -------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION register_member(
  p_trip_code TEXT,
  p_prenom TEXT,
  p_nom TEXT,
  p_tel TEXT,
  p_nip_hash TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tel_norm TEXT;
  v_trip trips%ROWTYPE;
  v_existing_membre UUID;
  v_autorises_count INT;
  v_matched_autorise participants_autorises%ROWTYPE;
  v_new_membre_id UUID;
  v_token UUID;
  v_couleur TEXT;
  v_prenom_final TEXT;
  v_nom_final TEXT;
BEGIN
  v_tel_norm := normalize_tel(p_tel);
  IF v_tel_norm = '' OR LENGTH(p_nip_hash) < 40 OR p_prenom IS NULL THEN
    RETURN jsonb_build_object('success', false, 'message', 'Parametres invalides');
  END IF;

  SELECT * INTO v_trip FROM trips WHERE code = p_trip_code;
  IF v_trip.id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'message', 'Trip introuvable');
  END IF;

  -- Verifier si deja membre de ce trip
  SELECT id INTO v_existing_membre FROM membres
  WHERE trip_id = v_trip.id AND normalize_tel(tel) = v_tel_norm
  LIMIT 1;

  IF v_existing_membre IS NOT NULL THEN
    -- Deja membre : update NIP si pas encore configure, puis genere token
    UPDATE membres SET nip = COALESCE(nip, p_nip_hash) WHERE id = v_existing_membre;
    INSERT INTO access_tokens (membre_id, trip_id, tel)
    VALUES (v_existing_membre, v_trip.id, v_tel_norm)
    RETURNING token INTO v_token;
    RETURN jsonb_build_object(
      'success', true, 'token', v_token,
      'membre_id', v_existing_membre, 'trip_id', v_trip.id,
      'message', 'Deja membre, reconnecte'
    );
  END IF;

  -- Verifier la liste des participants autorises si elle est active
  SELECT COUNT(*) INTO v_autorises_count FROM participants_autorises WHERE trip_id = v_trip.id;
  v_prenom_final := trim(p_prenom);
  v_nom_final := COALESCE(trim(p_nom), '');

  IF v_autorises_count > 0 THEN
    -- Match sur (prenom, nom) insensible a la casse
    SELECT * INTO v_matched_autorise FROM participants_autorises
    WHERE trip_id = v_trip.id
      AND lower(trim(prenom)) = lower(trim(v_prenom_final))
      AND lower(trim(COALESCE(nom, ''))) = lower(trim(v_nom_final))
    LIMIT 1;

    IF v_matched_autorise.id IS NULL THEN
      RETURN jsonb_build_object('success', false, 'message', 'Pas dans la liste autorisee');
    END IF;

    -- Si le participant autorise a un tel, verifier la correspondance
    IF v_matched_autorise.tel IS NOT NULL AND v_matched_autorise.tel != '' THEN
      IF normalize_tel(v_matched_autorise.tel) != v_tel_norm THEN
        RETURN jsonb_build_object('success', false, 'message', 'Tel ne correspond pas');
      END IF;
    END IF;

    v_prenom_final := v_matched_autorise.prenom;
    v_nom_final := COALESCE(v_matched_autorise.nom, '');
  END IF;

  -- Attribuer une couleur aleatoire (liste fixe)
  v_couleur := (ARRAY['#E74C3C','#3498DB','#2ECC71','#F39C12','#9B59B6','#1ABC9C','#E67E22','#34495E'])
    [1 + (floor(random() * 8))::INT];

  -- Inserer le membre
  INSERT INTO membres (trip_id, prenom, nom, tel, nip, couleur, is_createur)
  VALUES (v_trip.id, v_prenom_final, v_nom_final, v_tel_norm, p_nip_hash, v_couleur, false)
  RETURNING id INTO v_new_membre_id;

  -- Generer le token
  INSERT INTO access_tokens (membre_id, trip_id, tel)
  VALUES (v_new_membre_id, v_trip.id, v_tel_norm)
  RETURNING token INTO v_token;

  RETURN jsonb_build_object(
    'success', true, 'token', v_token,
    'membre_id', v_new_membre_id, 'trip_id', v_trip.id,
    'message', 'Inscription reussie'
  );
END;
$$;

-- -------------------------------------------------------------------------
-- 5. get_autorises : liste des participants autorises d'un trip
--    Utilise par JoinScreen pour afficher qui peut s'inscrire
-- -------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION get_autorises(p_trip_code TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_trip_id UUID;
  v_autorises JSONB;
BEGIN
  SELECT id INTO v_trip_id FROM trips WHERE code = p_trip_code;
  IF v_trip_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'message', 'Trip introuvable');
  END IF;

  SELECT COALESCE(jsonb_agg(to_jsonb(p.*)), '[]'::jsonb) INTO v_autorises
  FROM participants_autorises p WHERE trip_id = v_trip_id;

  RETURN jsonb_build_object('success', true, 'autorises', v_autorises);
END;
$$;

-- -------------------------------------------------------------------------
-- 6. get_membre_by_id : recharge un membre par son id
--    Utilise par tryLocalStorage pour valider que le membre existe toujours
-- -------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION get_membre_by_id(p_membre_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_membre membres%ROWTYPE;
BEGIN
  SELECT * INTO v_membre FROM membres WHERE id = p_membre_id;
  IF v_membre.id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'message', 'Membre introuvable');
  END IF;
  RETURN jsonb_build_object('success', true, 'membre', to_jsonb(v_membre));
END;
$$;

-- -------------------------------------------------------------------------
-- 7. Permissions : autoriser l'appel des fonctions depuis le role anon
-- -------------------------------------------------------------------------
GRANT EXECUTE ON FUNCTION get_trip_by_code(TEXT) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION reconnect_by_tel(TEXT, TEXT) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION save_nip(TEXT, TEXT) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION register_member(TEXT, TEXT, TEXT, TEXT, TEXT) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION get_autorises(TEXT) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION get_membre_by_id(UUID) TO anon, authenticated;

-- =========================================================================
-- FIN du bloc 2
-- 6 nouvelles fonctions RPC pour couvrir tous les flows de JoinScreen +
-- reconnexion. A ce stade, les fonctions sont creees mais RLS n'est PAS
-- encore active. L'app continue a marcher exactement comme avant.
-- =========================================================================
