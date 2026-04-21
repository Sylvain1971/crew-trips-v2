-- =========================================================================
-- PHASE 2.5 — ACTIVATION RLS (Option A : SELECT ouvert, écritures bloquées)
-- Date : 2026-04-21
--
-- Bloque INSERT/UPDATE/DELETE direct sur toutes les tables sensibles.
-- Les RPC SECURITY DEFINER continuent à fonctionner (elles bypass RLS
-- car elles tournent avec les privilèges du owner postgres).
--
-- Lecture (SELECT) reste ouverte pour compatibilité avec les composants
-- qui lisent directement la DB (chargement trip, liste messages, etc.).
--
-- Pour rollback en cas de casse : voir section ROLLBACK à la fin du fichier.
-- =========================================================================

-- Table trips
ALTER TABLE trips ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "allow_select_trips" ON trips;
CREATE POLICY "allow_select_trips" ON trips FOR SELECT TO anon, authenticated USING (true);
-- Aucune policy INSERT/UPDATE/DELETE => bloqué pour anon

-- Table membres
ALTER TABLE membres ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "allow_select_membres" ON membres;
CREATE POLICY "allow_select_membres" ON membres FOR SELECT TO anon, authenticated USING (true);

-- Table infos
ALTER TABLE infos ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "allow_select_infos" ON infos;
CREATE POLICY "allow_select_infos" ON infos FOR SELECT TO anon, authenticated USING (true);

-- Table messages
ALTER TABLE messages ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "allow_select_messages" ON messages;
CREATE POLICY "allow_select_messages" ON messages FOR SELECT TO anon, authenticated USING (true);

-- Table participants_autorises
ALTER TABLE participants_autorises ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "allow_select_autorises" ON participants_autorises;
CREATE POLICY "allow_select_autorises" ON participants_autorises FOR SELECT TO anon, authenticated USING (true);

-- Table config : SELECT AUSSI BLOQUE car le creator_code ne doit pas être lisible
-- La RPC create_trip et upsert_config lisent cette table via SECURITY DEFINER.
ALTER TABLE config ENABLE ROW LEVEL SECURITY;
-- Aucune policy => tout bloque pour anon (y compris SELECT)

-- Table access_tokens : SELECT AUSSI BLOQUE (tokens sensibles)
ALTER TABLE access_tokens ENABLE ROW LEVEL SECURITY;
-- Aucune policy => tout bloque pour anon

-- Table rate_limit_attempts : SELECT AUSSI BLOQUE
ALTER TABLE rate_limit_attempts ENABLE ROW LEVEL SECURITY;
-- Aucune policy => tout bloque pour anon

-- =========================================================================
-- ROLLBACK (en cas de besoin, décommenter et exécuter)
-- =========================================================================
-- ALTER TABLE trips DISABLE ROW LEVEL SECURITY;
-- ALTER TABLE membres DISABLE ROW LEVEL SECURITY;
-- ALTER TABLE infos DISABLE ROW LEVEL SECURITY;
-- ALTER TABLE messages DISABLE ROW LEVEL SECURITY;
-- ALTER TABLE participants_autorises DISABLE ROW LEVEL SECURITY;
-- ALTER TABLE config DISABLE ROW LEVEL SECURITY;
-- ALTER TABLE access_tokens DISABLE ROW LEVEL SECURITY;
-- ALTER TABLE rate_limit_attempts DISABLE ROW LEVEL SECURITY;

-- =========================================================================
-- FIN du bloc 5
-- =========================================================================
