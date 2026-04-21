-- =========================================================================
-- PHASE 2.3 — RPC mutations critiques (Option Z)
-- Date : 2026-04-21
--
-- 5 fonctions pour couvrir les ecritures les plus sensibles :
--  1. create_trip       : creation d'un nouveau trip (anon peut, mais on verifie creator_code)
--  2. delete_trip_full  : suppression cascade complete
--  3. update_trip_fields: UPDATE generique sur trips, exige token
--  4. update_member     : UPDATE membre (via token)
--  5. delete_member_safe: DELETE membre (via token)
--  6. upsert_config     : UPSERT config (exige creator_code verifie serveur)
--
-- Toutes ces fonctions exigent soit un token valide, soit un code secret
-- serveur. Les policies RLS qui suivront interdiront les INSERT/UPDATE/DELETE
-- directs anon.
-- =========================================================================

-- -------------------------------------------------------------------------
-- Helper : is_valid_token
-- Retourne true si le token existe, n'est pas expire, et est lie au trip_id
-- -------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION is_valid_token(p_token UUID, p_trip_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
DECLARE
  v_expires TIMESTAMPTZ;
BEGIN
  SELECT expires_at INTO v_expires
  FROM access_tokens
  WHERE token = p_token AND trip_id = p_trip_id;
  RETURN v_expires IS NOT NULL AND v_expires > NOW();
END;
$$;

-- -------------------------------------------------------------------------
-- Helper : is_admin_of_trip
-- Retourne true si le token correspond a un membre is_createur=true du trip
-- -------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION is_admin_of_trip(p_token UUID, p_trip_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
DECLARE
  v_is_createur BOOLEAN := false;
BEGIN
  SELECT m.is_createur INTO v_is_createur
  FROM access_tokens at
  JOIN membres m ON m.id = at.membre_id
  WHERE at.token = p_token
    AND at.trip_id = p_trip_id
    AND at.expires_at > NOW()
    AND m.is_createur = true;
  RETURN COALESCE(v_is_createur, false);
END;
$$;

-- -------------------------------------------------------------------------
-- 1. create_trip : creation d'un nouveau trip
-- Exige que le p_creator_code corresponde au creator_code en table config.
-- Le createur devient automatiquement membre et obtient un token.
-- -------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION create_trip(
  p_creator_code TEXT,
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
  v_stored_creator_code TEXT;
  v_trip_id UUID;
  v_membre_id UUID;
  v_token UUID;
  v_tel_norm TEXT;
  v_couleur TEXT;
BEGIN
  -- Verifier le creator_code
  SELECT value INTO v_stored_creator_code FROM config WHERE key = 'creator_code';
  IF v_stored_creator_code IS NULL OR v_stored_creator_code = '' THEN
    v_stored_creator_code := NULL; -- Pas configure = on laisse passer (bootstrap)
  END IF;
  IF v_stored_creator_code IS NOT NULL AND p_creator_code != v_stored_creator_code THEN
    RETURN jsonb_build_object('success', false, 'message', 'Code createur invalide');
  END IF;

  v_tel_norm := normalize_tel(p_createur_tel);
  IF v_tel_norm = '' OR LENGTH(p_createur_nip_hash) < 40 THEN
    RETURN jsonb_build_object('success', false, 'message', 'Parametres invalides');
  END IF;

  -- Verifier que le code n'est pas deja pris
  IF EXISTS (SELECT 1 FROM trips WHERE code = p_code) THEN
    RETURN jsonb_build_object('success', false, 'message', 'Code deja utilise');
  END IF;

  -- Inserer le trip
  INSERT INTO trips (code, nom, type, destination, date_debut, date_fin, createur_tel)
  VALUES (p_code, p_nom, p_type, p_destination, p_date_debut, p_date_fin, v_tel_norm)
  RETURNING id INTO v_trip_id;

  -- Ajouter le createur comme membre
  v_couleur := (ARRAY['#E74C3C','#3498DB','#2ECC71','#F39C12','#9B59B6','#1ABC9C','#E67E22','#34495E'])
    [1 + (floor(random() * 8))::INT];
  INSERT INTO membres (trip_id, prenom, nom, tel, nip, couleur, is_createur)
  VALUES (v_trip_id, p_createur_prenom, p_createur_nom, v_tel_norm, p_createur_nip_hash, v_couleur, true)
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

-- -------------------------------------------------------------------------
-- 2. delete_trip_full : cascade delete d'un trip
-- Exige un token valide du createur (is_admin_of_trip).
-- -------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION delete_trip_full(p_token UUID, p_trip_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT is_admin_of_trip(p_token, p_trip_id) THEN
    RETURN jsonb_build_object('success', false, 'message', 'Non autorise');
  END IF;

  DELETE FROM messages WHERE trip_id = p_trip_id;
  DELETE FROM infos WHERE trip_id = p_trip_id;
  DELETE FROM participants_autorises WHERE trip_id = p_trip_id;
  DELETE FROM access_tokens WHERE trip_id = p_trip_id;
  DELETE FROM rate_limit_attempts WHERE trip_code = (SELECT code FROM trips WHERE id = p_trip_id);
  DELETE FROM membres WHERE trip_id = p_trip_id;
  DELETE FROM trips WHERE id = p_trip_id;

  RETURN jsonb_build_object('success', true);
END;
$$;

-- -------------------------------------------------------------------------
-- 3. update_trip_fields : UPDATE generique sur la table trips
-- Exige un token valide. Champs autorises : lodge_*, can_*, share_token,
-- whatsapp_lien, nom, destination, dates, createur_tel.
-- -------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION update_trip_fields(
  p_token UUID,
  p_trip_id UUID,
  p_updates JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_allowed TEXT[] := ARRAY[
    'nom','type','destination','date_debut','date_fin','createur_tel',
    'lodge_nom','lodge_adresse','lodge_tel','lodge_wifi','lodge_code','lodge_arrivee',
    'can_delete','can_edit','can_post_photos','share_token','whatsapp_lien'
  ];
  v_key TEXT;
  v_value JSONB;
  v_sql TEXT := 'UPDATE trips SET ';
  v_first BOOLEAN := true;
BEGIN
  IF NOT is_valid_token(p_token, p_trip_id) THEN
    RETURN jsonb_build_object('success', false, 'message', 'Token invalide');
  END IF;

  FOR v_key, v_value IN SELECT * FROM jsonb_each(p_updates) LOOP
    IF v_key = ANY(v_allowed) THEN
      IF NOT v_first THEN v_sql := v_sql || ', '; END IF;
      -- Conversion type selon champ
      IF v_key IN ('can_delete','can_edit','can_post_photos') THEN
        v_sql := v_sql || quote_ident(v_key) || ' = ' || (v_value::TEXT)::BOOLEAN::TEXT;
      ELSIF v_key IN ('date_debut','date_fin') THEN
        IF v_value = 'null'::JSONB THEN
          v_sql := v_sql || quote_ident(v_key) || ' = NULL';
        ELSE
          v_sql := v_sql || quote_ident(v_key) || ' = ' || quote_literal(v_value#>>'{}') || '::DATE';
        END IF;
      ELSE
        IF v_value = 'null'::JSONB THEN
          v_sql := v_sql || quote_ident(v_key) || ' = NULL';
        ELSE
          v_sql := v_sql || quote_ident(v_key) || ' = ' || quote_literal(v_value#>>'{}');
        END IF;
      END IF;
      v_first := false;
    END IF;
  END LOOP;

  IF v_first THEN
    RETURN jsonb_build_object('success', false, 'message', 'Aucun champ autorise');
  END IF;

  v_sql := v_sql || ' WHERE id = ' || quote_literal(p_trip_id::TEXT) || '::UUID';
  EXECUTE v_sql;

  RETURN jsonb_build_object('success', true);
END;
$$;

-- -------------------------------------------------------------------------
-- 4. update_member : UPDATE sur un membre (prenom, nom, tel, couleur)
-- L'utilisateur peut modifier son propre membre OU un admin peut modifier
-- n'importe quel membre de son trip.
-- -------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION update_member(
  p_token UUID,
  p_membre_id UUID,
  p_updates JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_trip_id UUID;
  v_self_membre_id UUID;
  v_is_admin BOOLEAN;
  v_allowed TEXT[] := ARRAY['prenom','nom','tel','couleur'];
  v_key TEXT;
  v_value JSONB;
  v_sql TEXT := 'UPDATE membres SET ';
  v_first BOOLEAN := true;
BEGIN
  -- Recuperer le trip du membre cible
  SELECT trip_id INTO v_trip_id FROM membres WHERE id = p_membre_id;
  IF v_trip_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'message', 'Membre introuvable');
  END IF;

  -- Recuperer le membre associe au token
  SELECT membre_id INTO v_self_membre_id FROM access_tokens
  WHERE token = p_token AND trip_id = v_trip_id AND expires_at > NOW();

  IF v_self_membre_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'message', 'Token invalide');
  END IF;

  v_is_admin := is_admin_of_trip(p_token, v_trip_id);

  -- Autorisation : soi-meme OU admin
  IF v_self_membre_id != p_membre_id AND NOT v_is_admin THEN
    RETURN jsonb_build_object('success', false, 'message', 'Non autorise');
  END IF;

  FOR v_key, v_value IN SELECT * FROM jsonb_each(p_updates) LOOP
    IF v_key = ANY(v_allowed) THEN
      IF NOT v_first THEN v_sql := v_sql || ', '; END IF;
      IF v_value = 'null'::JSONB THEN
        v_sql := v_sql || quote_ident(v_key) || ' = NULL';
      ELSE
        v_sql := v_sql || quote_ident(v_key) || ' = ' || quote_literal(v_value#>>'{}');
      END IF;
      v_first := false;
    END IF;
  END LOOP;

  IF v_first THEN
    RETURN jsonb_build_object('success', false, 'message', 'Aucun champ autorise');
  END IF;

  v_sql := v_sql || ' WHERE id = ' || quote_literal(p_membre_id::TEXT) || '::UUID';
  EXECUTE v_sql;

  RETURN jsonb_build_object('success', true);
END;
$$;

-- -------------------------------------------------------------------------
-- 5. delete_member_safe : DELETE membre avec verification admin
-- Seul le createur du trip peut supprimer un membre (autre que lui-meme).
-- -------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION delete_member_safe(p_token UUID, p_membre_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_trip_id UUID;
  v_target_is_createur BOOLEAN;
BEGIN
  SELECT trip_id, is_createur INTO v_trip_id, v_target_is_createur
  FROM membres WHERE id = p_membre_id;

  IF v_trip_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'message', 'Membre introuvable');
  END IF;

  -- Ne pas permettre de supprimer le createur
  IF v_target_is_createur THEN
    RETURN jsonb_build_object('success', false, 'message', 'Le createur ne peut etre supprime');
  END IF;

  IF NOT is_admin_of_trip(p_token, v_trip_id) THEN
    RETURN jsonb_build_object('success', false, 'message', 'Non autorise');
  END IF;

  DELETE FROM access_tokens WHERE membre_id = p_membre_id;
  DELETE FROM membres WHERE id = p_membre_id;

  RETURN jsonb_build_object('success', true);
END;
$$;

-- -------------------------------------------------------------------------
-- 6. upsert_config : UPSERT sur la table config
-- Exige le creator_code actuel comme protection.
-- -------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION upsert_config(
  p_creator_code TEXT,
  p_key TEXT,
  p_value TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_stored TEXT;
BEGIN
  SELECT value INTO v_stored FROM config WHERE key = 'creator_code';
  IF v_stored IS NULL OR v_stored = '' OR p_creator_code != v_stored THEN
    RETURN jsonb_build_object('success', false, 'message', 'Code createur invalide');
  END IF;

  INSERT INTO config (key, value) VALUES (p_key, p_value)
  ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value;

  RETURN jsonb_build_object('success', true);
END;
$$;

-- -------------------------------------------------------------------------
-- 7. Permissions
-- -------------------------------------------------------------------------
GRANT EXECUTE ON FUNCTION is_valid_token(UUID, UUID) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION is_admin_of_trip(UUID, UUID) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION create_trip(TEXT, TEXT, TEXT, TEXT, TEXT, DATE, DATE, TEXT, TEXT, TEXT, TEXT) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION delete_trip_full(UUID, UUID) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION update_trip_fields(UUID, UUID, JSONB) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION update_member(UUID, UUID, JSONB) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION delete_member_safe(UUID, UUID) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION upsert_config(TEXT, TEXT, TEXT) TO anon, authenticated;

-- =========================================================================
-- FIN du bloc 3
-- 8 nouvelles fonctions creees. A ce stade, RLS toujours PAS active —
-- l'app continue a marcher via les SELECT/INSERT/UPDATE/DELETE directs.
-- Les RPC sont pretes pour quand RLS sera active en fin de refactor.
-- =========================================================================
