-- =============================================================================
-- AUDIT access_tokens - 2026-04-26
-- =============================================================================

-- 1) Stats globales
SELECT
  COUNT(*) AS total_tokens,
  COUNT(*) FILTER (WHERE expires_at > NOW()) AS valides,
  COUNT(*) FILTER (WHERE expires_at <= NOW()) AS expires,
  COUNT(*) FILTER (WHERE expires_at < NOW() - INTERVAL '7 days') AS purgeables,
  MIN(created_at)::date AS plus_vieux,
  MAX(created_at)::date AS plus_recent,
  COUNT(DISTINCT membre_id) AS membres_uniques,
  COUNT(DISTINCT trip_id) AS trips_avec_tokens
FROM access_tokens;

-- 2) Top 10 membres avec doublons (plus d'1 token valide)
SELECT
  m.prenom || ' ' || COALESCE(m.nom, '') AS membre,
  t.nom AS trip,
  COUNT(at.token) AS nb_tokens,
  COUNT(at.token) FILTER (WHERE at.expires_at > NOW()) AS valides,
  MAX(at.created_at)::date AS dernier_login,
  MAX(at.last_used_at)::date AS dernier_usage
FROM access_tokens at
JOIN membres m ON m.id = at.membre_id
JOIN trips t ON t.id = at.trip_id
GROUP BY m.id, m.prenom, m.nom, t.id, t.nom
HAVING COUNT(at.token) > 1
ORDER BY nb_tokens DESC
LIMIT 10;

-- 3) Distribution par trip
SELECT
  t.nom AS trip,
  COUNT(at.token) AS nb_tokens,
  COUNT(DISTINCT at.membre_id) AS nb_membres,
  ROUND(COUNT(at.token)::numeric / NULLIF(COUNT(DISTINCT at.membre_id), 0), 1) AS tokens_par_membre
FROM access_tokens at
JOIN trips t ON t.id = at.trip_id
GROUP BY t.id, t.nom
ORDER BY nb_tokens DESC;
