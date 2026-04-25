-- =============================================================================
-- P4j5 REVERT (Desktop) : retire les champs admin_tel/admin_prenom/trip_nom
-- du retour de register_identity.
-- =============================================================================
-- Contexte : 2 approches P4j5 ont ete creees en parallele (Claude mobile +
-- Claude desktop). L'approche mobile (modification de get_invitations_en_attente)
-- a ete retenue car elle reutilise les invitations deja chargees, plus propre
-- que dupliquer la logique dans register_identity.
--
-- Cette migration restaure register_identity a sa version P4j4 :
-- - Cas A (nouveau)              -> success simple
-- - Cas B (nip match)            -> success
-- - Cas C (nip different)        -> error "NIP different" SANS admin info
-- - Cas D (nip NULL)             -> success + propagation
-- - Cas E (multi-trip cross-tel) -> propagation a tous
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
    RETURN jsonb_build_object(
      'success', false,
      'message', 'Ce numero de telephone est deja associe a un NIP different.'
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
