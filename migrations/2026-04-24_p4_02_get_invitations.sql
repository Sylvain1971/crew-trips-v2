-- P4 Sous-chantier 4.2 : RPC get_invitations_en_attente
-- Matching hybride : tel si fourni, sinon prenom+nom insensible casse/accents
-- Exclut les trips ou l'utilisateur est deja membre

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
    -- Matching hybride : tel si fourni, sinon prenom+nom
    (
      (p_tel IS NOT NULL AND pa.tel = p_tel)
      OR
      (
        LOWER(public.unaccent(pa.prenom)) = LOWER(public.unaccent(p_prenom))
        AND LOWER(public.unaccent(pa.nom)) = LOWER(public.unaccent(p_nom))
      )
    )
    -- Exclure les trips ou deja membre (match par tel OU par nom complet)
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

-- Validation (Sylvain deja membre de ses 3 trips, donc rien attendu)
SELECT * FROM get_invitations_en_attente('Sylvain', 'Bergeron', '4185401302');
-- Doit retourner 0 ligne
