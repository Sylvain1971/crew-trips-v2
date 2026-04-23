-- P4 Sous-chantier 4.1 : Fix extension unaccent
-- L'extension est installée mais inaccessible via PostgREST
-- On la recrée dans le schéma public pour la rendre accessible

DROP EXTENSION IF EXISTS unaccent;
CREATE EXTENSION unaccent SCHEMA public;

-- Validation
SELECT public.unaccent('Joée Boudreault') AS test_avec_accent,
       public.unaccent('Joée Boudreault') = 'Joee Boudreault' AS unaccent_ok;
