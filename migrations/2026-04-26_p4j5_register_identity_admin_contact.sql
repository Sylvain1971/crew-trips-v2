-- =============================================================================
-- P4j5 : register_identity expose admin_tel/admin_prenom/trip_nom en cas d'erreur
-- =============================================================================
-- Quand register_identity rejette un NIP different (cas C de P4j4), le frontend
-- doit pouvoir afficher un bouton "Contacter l'admin" pour permettre a l'utilisateur
-- de demander un reset du NIP. Pour ca, la RPC retourne maintenant les infos
-- de l'admin du trip le plus recent du membre concerne.
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
  v_membres_sans_nip INT;
  v_admin_tel TEXT;
  v_admin_prenom TEXT;
  v_trip_nom TEXT;
BEGIN
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

  SELECT nip INTO v_existing_nip
  FROM membres
  WHERE normalize_tel(tel) = v_tel_norm AND nip IS NOT NULL
  LIMIT 1;

  IF v_existing_nip IS NOT NULL AND v_existing_nip != p_nip_hash THEN
    SELECT
      t.nom,
      t.createur_tel,
      COALESCE(
        (SELECT prenom FROM membres WHERE trip_id = t.id AND is_createur = true LIMIT 1),
        'l''administrateur'
      )
    INTO v_trip_nom, v_admin_tel, v_admin_prenom
    FROM trips t
    JOIN membres m ON m.trip_id = t.id
    WHERE normalize_tel(m.tel) = v_tel_norm
    ORDER BY t.created_at DESC
    LIMIT 1;

    RETURN jsonb_build_object(
      'success', false,
      'message', 'Ce numero de telephone est deja associe a un NIP different.',
      'admin_tel', v_admin_tel,
      'admin_prenom', v_admin_prenom,
      'trip_nom', v_trip_nom
    );
  END IF;

  SELECT COUNT(*) INTO v_membres_sans_nip
  FROM membres
  WHERE normalize_tel(tel) = v_tel_norm AND nip IS NULL;

  IF v_membres_sans_nip > 0 THEN
    UPDATE membres
    SET nip = p_nip_hash
    WHERE normalize_tel(tel) = v_tel_norm AND nip IS NULL;
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'prenom', trim(p_prenom),
    'nom', trim(p_nom),
    'tel', v_tel_norm,
    'nip_propagated', v_membres_sans_nip
  );
END;
$$;

GRANT EXECUTE ON FUNCTION register_identity(TEXT, TEXT, TEXT, TEXT) TO anon, authenticated;

SELECT proname, pronargs FROM pg_proc WHERE proname = 'register_identity';
