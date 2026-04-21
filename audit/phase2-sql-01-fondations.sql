-- =========================================================================
-- PHASE 2.1 — FONDATIONS BACKEND
-- Date : 2026-04-21
-- A executer dans Supabase SQL Editor (role postgres)
--
-- Contenu :
-- 1. Table access_tokens (session tokens UUID, 30 jours)
-- 2. Table rate_limit_attempts (backoff exponentiel)
-- 3. Fonction normalize_tel (helper pour comparer telephones)
-- 4. Fonction verify_nip (valide NIP avec backoff)
-- 5. Fonction join_trip (cree une session apres NIP OK)
-- 6. Fonction get_trip_data (retourne trip + membres + infos + messages)
--
-- Ne fait PAS encore : activer RLS. On teste d'abord.
-- =========================================================================

-- -------------------------------------------------------------------------
-- 1. Table access_tokens
-- -------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS access_tokens (
  token UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  membre_id UUID NOT NULL REFERENCES membres(id) ON DELETE CASCADE,
  trip_id UUID NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
  tel TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '30 days'),
  last_used_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_access_tokens_membre ON access_tokens(membre_id);
CREATE INDEX IF NOT EXISTS idx_access_tokens_trip ON access_tokens(trip_id);
CREATE INDEX IF NOT EXISTS idx_access_tokens_expires ON access_tokens(expires_at);

-- -------------------------------------------------------------------------
-- 2. Table rate_limit_attempts
-- -------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS rate_limit_attempts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tel TEXT NOT NULL,
  trip_code TEXT NOT NULL,
  attempts_count INT NOT NULL DEFAULT 0,
  last_attempt_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  blocked_until TIMESTAMPTZ DEFAULT NULL,
  UNIQUE(tel, trip_code)
);

CREATE INDEX IF NOT EXISTS idx_rate_limit_tel_trip ON rate_limit_attempts(tel, trip_code);
CREATE INDEX IF NOT EXISTS idx_rate_limit_blocked ON rate_limit_attempts(blocked_until);

-- -------------------------------------------------------------------------
-- 3. Fonction normalize_tel (helper)
-- -------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION normalize_tel(input_tel TEXT)
RETURNS TEXT
LANGUAGE plpgsql
IMMUTABLE
AS $$
BEGIN
  RETURN regexp_replace(COALESCE(input_tel, ''), '[^0-9]', '', 'g');
END;
$$;

-- -------------------------------------------------------------------------
-- 4. Fonction verify_nip
--    Retourne :
--    { success: bool, membre_id: uuid, trip_id: uuid, delay_seconds: int, message: text }
--    Applique le backoff exponentiel si echec.
-- -------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION verify_nip(
  p_trip_code TEXT,
  p_tel TEXT,
  p_nip_hash TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tel_norm TEXT;
  v_trip_id UUID;
  v_membre_id UUID;
  v_stored_nip TEXT;
  v_rate_row rate_limit_attempts%ROWTYPE;
  v_now TIMESTAMPTZ := NOW();
  v_wait_seconds INT := 0;
  v_next_delay INT;
BEGIN
  v_tel_norm := normalize_tel(p_tel);

  IF v_tel_norm = '' OR p_trip_code IS NULL OR p_nip_hash IS NULL THEN
    RETURN jsonb_build_object(
      'success', false,
      'message', 'Parametres invalides'
    );
  END IF;

  -- Trouve ou cree la ligne de rate-limit
  SELECT * INTO v_rate_row
  FROM rate_limit_attempts
  WHERE tel = v_tel_norm AND trip_code = p_trip_code;

  -- Si bloque : retourne delai restant
  IF v_rate_row.blocked_until IS NOT NULL AND v_rate_row.blocked_until > v_now THEN
    v_wait_seconds := EXTRACT(EPOCH FROM (v_rate_row.blocked_until - v_now))::INT;
    RETURN jsonb_build_object(
      'success', false,
      'message', 'Trop de tentatives. Reessayez plus tard.',
      'delay_seconds', v_wait_seconds
    );
  END IF;

  -- Reset compteur si derniere tentative > 24h
  IF v_rate_row.last_attempt_at IS NOT NULL AND v_rate_row.last_attempt_at < v_now - INTERVAL '24 hours' THEN
    UPDATE rate_limit_attempts
    SET attempts_count = 0, blocked_until = NULL
    WHERE tel = v_tel_norm AND trip_code = p_trip_code;
    v_rate_row.attempts_count := 0;
  END IF;

  -- Trouve le trip
  SELECT id INTO v_trip_id FROM trips WHERE code = p_trip_code;
  IF v_trip_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'message', 'Trip introuvable');
  END IF;

  -- Trouve le membre par tel normalise
  SELECT id, nip INTO v_membre_id, v_stored_nip
  FROM membres
  WHERE trip_id = v_trip_id AND normalize_tel(tel) = v_tel_norm
  LIMIT 1;

  IF v_membre_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'message', 'Membre non trouve dans ce trip');
  END IF;

  -- NIP jamais configure -> on laisse passer (migration douce)
  IF v_stored_nip IS NULL THEN
    RETURN jsonb_build_object(
      'success', true,
      'membre_id', v_membre_id,
      'trip_id', v_trip_id,
      'nip_required', true,
      'message', 'NIP a configurer'
    );
  END IF;

  -- Verification du hash
  IF v_stored_nip = p_nip_hash THEN
    -- Succes : reset le compteur
    DELETE FROM rate_limit_attempts WHERE tel = v_tel_norm AND trip_code = p_trip_code;
    RETURN jsonb_build_object(
      'success', true,
      'membre_id', v_membre_id,
      'trip_id', v_trip_id
    );
  END IF;

  -- Echec : incremente et applique backoff
  INSERT INTO rate_limit_attempts (tel, trip_code, attempts_count, last_attempt_at)
  VALUES (v_tel_norm, p_trip_code, 1, v_now)
  ON CONFLICT (tel, trip_code) DO UPDATE
    SET attempts_count = rate_limit_attempts.attempts_count + 1,
        last_attempt_at = v_now
  RETURNING * INTO v_rate_row;

  -- Backoff exponentiel
  v_next_delay := CASE
    WHEN v_rate_row.attempts_count <= 3 THEN 0
    WHEN v_rate_row.attempts_count = 4 THEN 5
    WHEN v_rate_row.attempts_count = 5 THEN 30
    WHEN v_rate_row.attempts_count = 6 THEN 120
    WHEN v_rate_row.attempts_count = 7 THEN 600
    ELSE 3600
  END;

  IF v_next_delay > 0 THEN
    UPDATE rate_limit_attempts
    SET blocked_until = v_now + (v_next_delay || ' seconds')::INTERVAL
    WHERE tel = v_tel_norm AND trip_code = p_trip_code;
  END IF;

  RETURN jsonb_build_object(
    'success', false,
    'message', 'NIP incorrect',
    'delay_seconds', v_next_delay,
    'attempts', v_rate_row.attempts_count
  );
END;
$$;

-- -------------------------------------------------------------------------
-- 5. Fonction join_trip
--    Appelle verify_nip, et si succes cree un access_token (30 jours)
-- -------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION join_trip(
  p_trip_code TEXT,
  p_tel TEXT,
  p_nip_hash TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_verify JSONB;
  v_token UUID;
  v_tel_norm TEXT;
BEGIN
  v_verify := verify_nip(p_trip_code, p_tel, p_nip_hash);

  IF (v_verify->>'success')::BOOLEAN IS NOT TRUE THEN
    RETURN v_verify;
  END IF;

  -- Cree le token
  v_tel_norm := normalize_tel(p_tel);
  INSERT INTO access_tokens (membre_id, trip_id, tel)
  VALUES (
    (v_verify->>'membre_id')::UUID,
    (v_verify->>'trip_id')::UUID,
    v_tel_norm
  )
  RETURNING token INTO v_token;

  RETURN jsonb_build_object(
    'success', true,
    'token', v_token,
    'membre_id', v_verify->>'membre_id',
    'trip_id', v_verify->>'trip_id',
    'nip_required', COALESCE((v_verify->>'nip_required')::BOOLEAN, false)
  );
END;
$$;

-- -------------------------------------------------------------------------
-- 6. Fonction get_trip_data
--    Valide le token, retourne trip + membres + infos + messages
-- -------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION get_trip_data(p_token UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_token_row access_tokens%ROWTYPE;
  v_trip JSONB;
  v_membres JSONB;
  v_infos JSONB;
  v_messages JSONB;
BEGIN
  SELECT * INTO v_token_row FROM access_tokens WHERE token = p_token;

  IF v_token_row.token IS NULL THEN
    RETURN jsonb_build_object('success', false, 'message', 'Token invalide');
  END IF;

  IF v_token_row.expires_at < NOW() THEN
    DELETE FROM access_tokens WHERE token = p_token;
    RETURN jsonb_build_object('success', false, 'message', 'Token expire');
  END IF;

  -- Update last_used_at
  UPDATE access_tokens SET last_used_at = NOW() WHERE token = p_token;

  -- Recupere les donnees
  SELECT to_jsonb(t.*) INTO v_trip FROM trips t WHERE id = v_token_row.trip_id;
  SELECT COALESCE(jsonb_agg(to_jsonb(m.*)), '[]'::jsonb) INTO v_membres
    FROM membres m WHERE trip_id = v_token_row.trip_id;
  SELECT COALESCE(jsonb_agg(to_jsonb(i.*)), '[]'::jsonb) INTO v_infos
    FROM infos i WHERE trip_id = v_token_row.trip_id;
  SELECT COALESCE(jsonb_agg(to_jsonb(msg.*) ORDER BY msg.created_at), '[]'::jsonb) INTO v_messages
    FROM messages msg WHERE trip_id = v_token_row.trip_id;

  RETURN jsonb_build_object(
    'success', true,
    'trip', v_trip,
    'membres', v_membres,
    'infos', v_infos,
    'messages', v_messages,
    'current_membre_id', v_token_row.membre_id
  );
END;
$$;

-- -------------------------------------------------------------------------
-- 7. Permissions : autoriser l'appel des fonctions depuis le role anon
-- -------------------------------------------------------------------------
GRANT EXECUTE ON FUNCTION verify_nip(TEXT, TEXT, TEXT) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION join_trip(TEXT, TEXT, TEXT) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION get_trip_data(UUID) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION normalize_tel(TEXT) TO anon, authenticated;

-- =========================================================================
-- FIN du bloc 1
-- A ce stade, les fonctions sont creees mais RLS n'est PAS encore active.
-- L'app continue a marcher exactement comme avant.
-- Les tests de la prochaine etape valideront que les fonctions retournent
-- les bons resultats avant qu'on active les verrous en Session 2.3.
-- =========================================================================
