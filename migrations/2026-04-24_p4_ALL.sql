-- =============================================================================
-- P4 MIGRATION COMPLETE — 24 avril 2026
-- Sous-chantiers 4.1 (unaccent) + 4.2 (get_invitations) + 4.4 (register_identity)
-- + 4.5 (register_from_invitation)
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 4.1 : Fix extension unaccent (installée mais inaccessible via PostgREST)
-- -----------------------------------------------------------------------------
DROP EXTENSION IF EXISTS unaccent;
CREATE EXTENSION unaccent SCHEMA public;


-- -----------------------------------------------------------------------------
-- 4.2 : get_invitations_en_attente (matching hybride tel-first / nom-accent-insensitive)
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION get_invitations_en_attente(
  p_prenom TEXT,
  p_nom TEXT,
  p_tel TEXT DEFAULT NULL
)
RETURNS TABLE (
  trip_id UUID,
  trip_code TEXT,
  trip_nom TEXT,
  trip_destination TEXT,
  trip_date_debut DATE,
  trip_date_fin DATE
)
SECURITY DEFINER
SET search_path = public
LANGUAGE sql
AS $$
  SELECT t.id, t.code, t.nom, t.destination, t.date_debut, t.date_fin
  FROM participants_autorises pa
  JOIN trips t ON pa.trip_id = t.id
  WHERE
    (
      (p_tel IS NOT NULL AND pa.tel = p_tel)
      OR
      (
        LOWER(public.unaccent(pa.prenom)) = LOWER(public.unaccent(p_prenom))
        AND LOWER(public.unaccent(pa.nom)) = LOWER(public.unaccent(p_nom))
      )
    )
    AND NOT EXISTS (
      SELECT 1 FROM membres m
      WHERE m.trip_id = pa.trip_id
        AND (
          (p_tel IS NOT NULL AND m.tel = p_tel)
          OR (
            LOWER(public.unaccent(m.prenom)) = LOWER(public.unaccent(p_prenom))
            AND LOWER(public.unaccent(m.nom)) = LOWER(public.unaccent(p_nom))
          )
        )
    )
  ORDER BY t.date_debut ASC NULLS LAST;
$$;

GRANT EXECUTE ON FUNCTION get_invitations_en_attente(TEXT, TEXT, TEXT) TO anon, authenticated;


-- -----------------------------------------------------------------------------
-- 4.4 : register_identity (valide identité sans inscrire, pour localStorage client)
-- -----------------------------------------------------------------------------
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

  v_tel_norm := normalize_tel(p_tel);
  IF v_tel_norm = '' THEN
    RETURN jsonb_build_object('success', false, 'message', 'Téléphone invalide.');
  END IF;

  SELECT nip INTO v_existing_nip
  FROM membres
  WHERE normalize_tel(tel) = v_tel_norm AND nip IS NOT NULL
  LIMIT 1;

  IF v_existing_nip IS NOT NULL AND v_existing_nip != p_nip_hash THEN
    RETURN jsonb_build_object(
      'success', false,
      'message', 'Ce numéro de téléphone est déjà associé à un NIP différent.'
    );
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'prenom', trim(p_prenom),
    'nom', trim(p_nom),
    'tel', v_tel_norm
  );
END;
$$;

GRANT EXECUTE ON FUNCTION register_identity(TEXT, TEXT, TEXT, TEXT) TO anon, authenticated;


-- -----------------------------------------------------------------------------
-- 4.5 : register_from_invitation (wrapper qui délègue à register_member)
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION register_from_invitation(
  p_trip_id UUID,
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
  v_trip_code TEXT;
BEGIN
  SELECT code INTO v_trip_code FROM trips WHERE id = p_trip_id;
  IF v_trip_code IS NULL THEN
    RETURN jsonb_build_object('success', false, 'message', 'Trip introuvable.');
  END IF;

  RETURN register_member(v_trip_code, p_prenom, p_nom, p_tel, p_nip_hash);
END;
$$;

GRANT EXECUTE ON FUNCTION register_from_invitation(UUID, TEXT, TEXT, TEXT, TEXT) TO anon, authenticated;


-- =============================================================================
-- VALIDATIONS
-- =============================================================================

-- V1 : unaccent fonctionne
SELECT public.unaccent('Joée Boudreault') = 'Joee Boudreault' AS v1_unaccent_ok;

-- V2 : get_invitations_en_attente — Sylvain (déjà membre partout) → 0 ligne
SELECT COUNT(*) = 0 AS v2_sylvain_pas_invite
FROM get_invitations_en_attente('Sylvain', 'Bergeron', '4185401302');

-- V3 : register_identity avec NIP différent → échec attendu
SELECT (register_identity('Sylvain', 'Bergeron', '4185401302', repeat('x', 64)))->>'success' = 'false'
       AS v3_nip_conflict_detected;
