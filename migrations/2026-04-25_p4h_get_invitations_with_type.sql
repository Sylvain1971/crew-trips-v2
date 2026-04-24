-- =============================================================================
-- P4h : Ajout de trip_type dans get_invitations_en_attente
-- =============================================================================
-- Permet au frontend d'afficher l'icône correcte (TripIcon dynamique) au lieu
-- d'un emoji 🎣 fixe dans la section "Invitations en attente" de /mes-trips.
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
  trip_type TEXT
)
SECURITY DEFINER
SET search_path = public
LANGUAGE sql
AS $$
  SELECT t.id, t.code, t.nom, t.destination, t.date_debut, t.date_fin, t.type
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

-- Validation
SELECT * FROM get_invitations_en_attente('Sophie', 'Bergeron', NULL);
