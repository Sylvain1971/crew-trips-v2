-- =============================================================================
-- P4j4 : register_identity propage NIP si tel existe avec nip NULL
-- =============================================================================
-- BUG SÉCURITÉ identifié 2026-04-26 :
-- 1. Membre dont le NIP a été reset par admin (P4j) -> membres.nip = NULL en DB
-- 2. Sur nouvel appareil, /mes-trips create-identity appelle register_identity
-- 3. register_identity ne trouve aucun "NIP différent" (NULL n'est pas comparé)
-- 4. Validation passe avec n'importe quel NIP saisi
-- 5. NIP stocké uniquement en localStorage, jamais en DB
-- 6. Au prochain login, tryTelReconnect connecte par tel sans valider NIP
-- 7. -> N'importe quel NIP fonctionne pour un membre reset
--
-- Fix : register_identity doit AUSSI propager le NIP saisi à toutes les
-- lignes membres avec ce tel quand nip IS NULL (équivalent save_nip).
-- Ainsi le NIP saisi à create-identity devient le NIP officiel du membre.
--
-- Cas couverts par cette version :
--  A) tel n'existe pas en DB (nouvel utilisateur)         -> success, pas de propagation
--  B) tel existe avec nip set, nip match                 -> success, pas de modif (idempotent)
--  C) tel existe avec nip set, nip différent             -> error "NIP différent" (inchangé)
--  D) tel existe avec nip NULL (post-reset admin)        -> success + UPDATE nip  ← NOUVEAU
--  E) tel existe sur plusieurs trips (cross-trip)        -> propagation à TOUS (cohérence "1 personne = 1 NIP")
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
  -- Validations basiques
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

  -- Cherche un NIP existant pour ce tel (cross-trip)
  SELECT nip INTO v_existing_nip
  FROM membres
  WHERE normalize_tel(tel) = v_tel_norm AND nip IS NOT NULL
  LIMIT 1;

  -- Cas C : NIP existant qui ne match pas -> bloquer
  IF v_existing_nip IS NOT NULL AND v_existing_nip != p_nip_hash THEN
    RETURN jsonb_build_object(
      'success', false,
      'message', 'Ce numero de telephone est deja associe a un NIP different.'
    );
  END IF;

  -- Cas D : tel existe avec nip NULL -> propager le NIP saisi
  -- (cas typique : membre dont l'admin a reset le NIP)
  -- Couvre aussi cas E si plusieurs trips ont ce tel sans NIP set.
  SELECT COUNT(*) INTO v_membres_sans_nip
  FROM membres
  WHERE normalize_tel(tel) = v_tel_norm AND nip IS NULL;

  IF v_membres_sans_nip > 0 THEN
    UPDATE membres
    SET nip = p_nip_hash
    WHERE normalize_tel(tel) = v_tel_norm AND nip IS NULL;
  END IF;

  -- Succes : identite validee + (si applicable) NIP propage en DB
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

-- =============================================================================
-- VALIDATION
-- =============================================================================
SELECT proname, pronargs FROM pg_proc WHERE proname = 'register_identity';

-- Test manuel apres application :
-- 1. Verifier le fix sur Joee (nip NULL en DB) :
--    SELECT prenom, nom, tel, CASE WHEN nip IS NULL THEN 'NULL' ELSE 'SET' END
--    FROM membres WHERE normalize_tel(tel) = '4188126438';
-- 2. Apres que Joee se reconnecte avec un nouveau NIP via /mes-trips,
--    re-runner la query : nip doit etre SET.
