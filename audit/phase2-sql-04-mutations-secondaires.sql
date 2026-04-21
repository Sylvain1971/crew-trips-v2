-- =========================================================================
-- PHASE 2.4 — RPC pour infos, messages et participants_autorises
-- =========================================================================

-- -------------------------------------------------------------------------
-- save_info_card : INSERT ou UPDATE d'une info card
-- Si p_id est NULL, c'est un INSERT. Sinon UPDATE.
-- -------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION save_info_card(
  p_token UUID,
  p_trip_id UUID,
  p_id UUID,
  p_categorie TEXT,
  p_titre TEXT,
  p_contenu TEXT,
  p_lien TEXT,
  p_fichier_url TEXT,
  p_is_prive BOOLEAN,
  p_auteur_id UUID,
  p_membre_prenom TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_new_id UUID;
  v_row infos%ROWTYPE;
BEGIN
  IF NOT is_valid_token(p_token, p_trip_id) THEN
    RETURN jsonb_build_object('success', false, 'message', 'Token invalide');
  END IF;

  IF p_id IS NULL THEN
    INSERT INTO infos (trip_id, categorie, titre, contenu, lien, fichier_url, is_prive, auteur_id, membre_prenom)
    VALUES (p_trip_id, p_categorie, p_titre, p_contenu, p_lien, p_fichier_url, COALESCE(p_is_prive, false), p_auteur_id, p_membre_prenom)
    RETURNING * INTO v_row;
  ELSE
    UPDATE infos
    SET categorie = p_categorie, titre = p_titre, contenu = p_contenu,
        lien = p_lien, fichier_url = p_fichier_url,
        is_prive = COALESCE(p_is_prive, false), auteur_id = p_auteur_id
    WHERE id = p_id AND trip_id = p_trip_id
    RETURNING * INTO v_row;
  END IF;

  RETURN jsonb_build_object('success', true, 'card', to_jsonb(v_row));
END;
$$;

-- -------------------------------------------------------------------------
-- delete_info_card
-- -------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION delete_info_card(p_token UUID, p_trip_id UUID, p_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT is_valid_token(p_token, p_trip_id) THEN
    RETURN jsonb_build_object('success', false, 'message', 'Token invalide');
  END IF;

  DELETE FROM infos WHERE id = p_id AND trip_id = p_trip_id;
  RETURN jsonb_build_object('success', true);
END;
$$;

-- -------------------------------------------------------------------------
-- post_message : INSERT d'un message (texte ou photo)
-- -------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION post_message(
  p_token UUID,
  p_trip_id UUID,
  p_type TEXT,
  p_contenu TEXT,
  p_image_url TEXT,
  p_photo_url TEXT,
  p_photo_caption TEXT,
  p_membre_id UUID,
  p_membre_prenom TEXT,
  p_membre_couleur TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row messages%ROWTYPE;
BEGIN
  IF NOT is_valid_token(p_token, p_trip_id) THEN
    RETURN jsonb_build_object('success', false, 'message', 'Token invalide');
  END IF;

  INSERT INTO messages (trip_id, type, contenu, image_url, photo_url, photo_caption, membre_id, membre_prenom, membre_couleur)
  VALUES (p_trip_id, p_type, p_contenu, p_image_url, p_photo_url, p_photo_caption, p_membre_id, p_membre_prenom, p_membre_couleur)
  RETURNING * INTO v_row;

  RETURN jsonb_build_object('success', true, 'message', to_jsonb(v_row));
END;
$$;

-- -------------------------------------------------------------------------
-- delete_messages : DELETE de plusieurs messages par ids
-- -------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION delete_messages(p_token UUID, p_trip_id UUID, p_ids UUID[])
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT is_valid_token(p_token, p_trip_id) THEN
    RETURN jsonb_build_object('success', false, 'message', 'Token invalide');
  END IF;

  DELETE FROM messages WHERE id = ANY(p_ids) AND trip_id = p_trip_id;
  RETURN jsonb_build_object('success', true);
END;
$$;

-- -------------------------------------------------------------------------
-- manage_autorises : bulk CRUD sur participants_autorises
-- p_action = 'add' | 'delete' | 'set' (set = remplace toute la liste)
-- -------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION manage_autorises(
  p_token UUID,
  p_trip_id UUID,
  p_action TEXT,
  p_id UUID,
  p_prenom TEXT,
  p_nom TEXT,
  p_tel TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_new_id UUID;
BEGIN
  IF NOT is_admin_of_trip(p_token, p_trip_id) THEN
    RETURN jsonb_build_object('success', false, 'message', 'Admin requis');
  END IF;

  IF p_action = 'add' THEN
    INSERT INTO participants_autorises (trip_id, prenom, nom, tel)
    VALUES (p_trip_id, p_prenom, p_nom, p_tel)
    RETURNING id INTO v_new_id;
    RETURN jsonb_build_object('success', true, 'id', v_new_id);
  ELSIF p_action = 'delete' THEN
    DELETE FROM participants_autorises WHERE id = p_id AND trip_id = p_trip_id;
    RETURN jsonb_build_object('success', true);
  ELSE
    RETURN jsonb_build_object('success', false, 'message', 'Action inconnue');
  END IF;
END;
$$;

-- Permissions
GRANT EXECUTE ON FUNCTION save_info_card(UUID, UUID, UUID, TEXT, TEXT, TEXT, TEXT, TEXT, BOOLEAN, UUID, TEXT) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION delete_info_card(UUID, UUID, UUID) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION post_message(UUID, UUID, TEXT, TEXT, TEXT, TEXT, TEXT, UUID, TEXT, TEXT) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION delete_messages(UUID, UUID, UUID[]) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION manage_autorises(UUID, UUID, TEXT, UUID, TEXT, TEXT, TEXT) TO anon, authenticated;

-- =========================================================================
-- FIN du bloc 4
-- 5 nouvelles fonctions pour les mutations secondaires (infos/messages/autorises).
-- =========================================================================
