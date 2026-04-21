-- =========================================================================
-- PHASE 2 HOTFIX — create_trip sans creator_code
-- Date : 2026-04-21
--
-- Le creator_code devient inutile (config n'est plus lisible côté client).
-- On retire la vérification et on simplifie la signature.
-- L'ancienne fonction est remplacée.
-- =========================================================================

-- Supprimer l'ancienne version (elle a 11 params, on passe à 10)
DROP FUNCTION IF EXISTS create_trip(TEXT, TEXT, TEXT, TEXT, TEXT, DATE, DATE, TEXT, TEXT, TEXT, TEXT);

CREATE OR REPLACE FUNCTION create_trip(
  p_code TEXT,
  p_nom TEXT,
  p_type TEXT,
  p_destination TEXT,
  p_date_debut DATE,
  p_date_fin DATE,
  p_createur_prenom TEXT,
  p_createur_nom TEXT,
  p_createur_tel TEXT,
  p_createur_nip_hash TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_trip_id UUID;
  v_membre_id UUID;
  v_token UUID;
  v_tel_norm TEXT;
  v_couleur TEXT;
  v_inherited_nip TEXT;
BEGIN
  v_tel_norm := normalize_tel(p_createur_tel);
  IF v_tel_norm = '' OR p_createur_prenom IS NULL OR p_code IS NULL THEN
    RETURN jsonb_build_object('success', false, 'message', 'Parametres invalides');
  END IF;

  -- Verifier que le code n'est pas deja pris
  IF EXISTS (SELECT 1 FROM trips WHERE code = p_code) THEN
    RETURN jsonb_build_object('success', false, 'message', 'Code deja utilise');
  END IF;

  -- Si pas de NIP fourni, essayer d'heriter d'un NIP existant pour ce tel
  IF p_createur_nip_hash IS NULL OR LENGTH(p_createur_nip_hash) < 40 THEN
    SELECT nip INTO v_inherited_nip FROM membres
    WHERE normalize_tel(tel) = v_tel_norm AND nip IS NOT NULL
    LIMIT 1;
  ELSE
    v_inherited_nip := p_createur_nip_hash;
  END IF;

  -- Inserer le trip
  INSERT INTO trips (code, nom, type, destination, date_debut, date_fin, createur_tel)
  VALUES (p_code, p_nom, p_type, p_destination, p_date_debut, p_date_fin, v_tel_norm)
  RETURNING id INTO v_trip_id;

  -- Ajouter le createur comme membre
  v_couleur := (ARRAY['#E74C3C','#3498DB','#2ECC71','#F39C12','#9B59B6','#1ABC9C','#E67E22','#34495E'])
    [1 + (floor(random() * 8))::INT];
  INSERT INTO membres (trip_id, prenom, nom, tel, nip, couleur, is_createur)
  VALUES (v_trip_id, p_createur_prenom, p_createur_nom, v_tel_norm, v_inherited_nip, v_couleur, true)
  RETURNING id INTO v_membre_id;

  -- Generer le token
  INSERT INTO access_tokens (membre_id, trip_id, tel)
  VALUES (v_membre_id, v_trip_id, v_tel_norm)
  RETURNING token INTO v_token;

  RETURN jsonb_build_object(
    'success', true,
    'trip_id', v_trip_id,
    'membre_id', v_membre_id,
    'token', v_token
  );
END;
$$;

GRANT EXECUTE ON FUNCTION create_trip(TEXT, TEXT, TEXT, TEXT, DATE, DATE, TEXT, TEXT, TEXT, TEXT) TO anon, authenticated;

-- =========================================================================
-- BONUS : clone_trip_content
-- Copie lodge + cards d'un trip source vers un trip destination.
-- Exige un token valide du trip destination.
-- =========================================================================
CREATE OR REPLACE FUNCTION clone_trip_content(
  p_token UUID,
  p_dst_trip_id UUID,
  p_src_trip_code TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_src trips%ROWTYPE;
  v_cards_count INT := 0;
BEGIN
  IF NOT is_valid_token(p_token, p_dst_trip_id) THEN
    RETURN jsonb_build_object('success', false, 'message', 'Token invalide');
  END IF;

  -- Recuperer le trip source
  SELECT * INTO v_src FROM trips WHERE code = p_src_trip_code;
  IF v_src.id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'message', 'Trip source introuvable');
  END IF;

  -- Copier le lodge + whatsapp_lien
  UPDATE trips SET
    lodge_nom = v_src.lodge_nom,
    lodge_adresse = v_src.lodge_adresse,
    lodge_tel = v_src.lodge_tel,
    lodge_wifi = v_src.lodge_wifi,
    lodge_code = v_src.lodge_code,
    lodge_arrivee = v_src.lodge_arrivee,
    whatsapp_lien = v_src.whatsapp_lien
  WHERE id = p_dst_trip_id;

  -- Copier les cards (sauf privees)
  INSERT INTO infos (trip_id, categorie, titre, contenu, lien, fichier_url, is_prive, auteur_id, membre_prenom)
  SELECT p_dst_trip_id, categorie, titre, contenu, lien, fichier_url, false, NULL, membre_prenom
  FROM infos
  WHERE trip_id = v_src.id AND (is_prive = false OR is_prive IS NULL);
  GET DIAGNOSTICS v_cards_count = ROW_COUNT;

  RETURN jsonb_build_object(
    'success', true,
    'cards_cloned', v_cards_count
  );
END;
$$;

GRANT EXECUTE ON FUNCTION clone_trip_content(UUID, UUID, TEXT) TO anon, authenticated;

-- =========================================================================
-- FIN du hotfix
-- =========================================================================
