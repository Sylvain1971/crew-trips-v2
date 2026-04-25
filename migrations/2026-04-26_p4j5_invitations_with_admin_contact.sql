-- =============================================================================
-- P4j5 : get_invitations_en_attente expose le tel + prenom du createur
-- =============================================================================
-- Contexte : sur /mes-trips create-identity, si un utilisateur a un probleme
-- d'inscription (ex: "Ce numero deja associe a un NIP different"), on veut
-- afficher un bouton "Contacter l'administrateur" avec un SMS pre-rempli.
--
-- Pour ca, on doit connaitre le tel de l'admin du trip auquel l'utilisateur
-- est invite. Cette migration enrichit la RPC en ajoutant 2 colonnes :
--  - trip_createur_tel    (depuis trips.createur_tel)
--  - trip_createur_prenom (premier admin trouve via membres is_createur=true)
--
-- Approche : LEFT JOIN sur membres pour recuperer le prenom de l'admin.
-- Si plusieurs admins, on prend le plus ancien (created_at).
-- =============================================================================

DROP FUNCTION IF EXISTS get_invitations_en_attente(TEXT, TEXT, TEXT);

CREATE FUNCTION get_invitations_en_attente(
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
  trip_date_fin DATE,
  trip_type TEXT,
  trip_createur_tel TEXT,
  trip_createur_prenom TEXT
)
SECURITY DEFINER
SET search_path = public
LANGUAGE sql
AS $$
  SELECT
    t.id,
    t.code,
    t.nom,
    t.destination,
    t.date_debut,
    t.date_fin,
    t.type,
    t.createur_tel,
    (
      SELECT m_admin.prenom
      FROM membres m_admin
      WHERE m_admin.trip_id = t.id AND m_admin.is_createur = true
      ORDER BY m_admin.created_at ASC NULLS LAST
      LIMIT 1
    ) AS trip_createur_prenom
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

-- =============================================================================
-- VALIDATION
-- =============================================================================
SELECT proname, pronargs FROM pg_proc WHERE proname = 'get_invitations_en_attente';

-- Test : verifier qu'on retrouve le tel + prenom admin pour Joee
SELECT trip_nom, trip_createur_prenom, trip_createur_tel
FROM get_invitations_en_attente('Joée', 'Boudreault', '4188126438');
