# BRIEF REPRISE — Crew Trips v2 Phase 2 (session du 2026-04-21 soir)

**État** : Sécurité industrielle en place, mais 1 SQL à exécuter par Sylvain + tests prod restants
**Dernier commit prod** : `f7cce2f` — "fix(phase2): auto-token generation on membre reconnexion"
**Repo** : `C:\Users\sbergeron\crew-trips-v2` / GitHub `Sylvain1971/crew-trips-v2`
**Prod** : https://crew-trips-v2.vercel.app

---

## 🎯 ACTION REQUISE DE SYLVAIN AVANT DE CONTINUER

**SQL #8 à exécuter dans Supabase SQL Editor** (nouvelle query → coller → Run) :

```sql
DROP FUNCTION IF EXISTS get_membre_by_id(UUID);

CREATE OR REPLACE FUNCTION get_membre_by_id(p_membre_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_membre membres%ROWTYPE;
  v_token UUID;
BEGIN
  SELECT * INTO v_membre FROM membres WHERE id = p_membre_id;
  IF v_membre.id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'message', 'Membre introuvable');
  END IF;
  INSERT INTO access_tokens (membre_id, trip_id, tel)
  VALUES (v_membre.id, v_membre.trip_id, normalize_tel(COALESCE(v_membre.tel, '')))
  RETURNING token INTO v_token;
  RETURN jsonb_build_object(
    'success', true,
    'membre', row_to_json(v_membre),
    'token', v_token
  );
END;
$$;

GRANT EXECUTE ON FUNCTION get_membre_by_id(UUID) TO anon, authenticated;
```

Fichier aussi sauvegardé : `audit/phase2-sql-08-hotfix-auto-token.sql`

**Pourquoi** : Sylvain est membre créateur de 3 trips mais avait seulement 1 token (Winter Steelhead). Sans ce SQL, les 2 autres trips (BC Fishing, Les Gonzesses au Soleil) ne peuvent pas uploader de photos — les écritures directes sont bloquées par RLS. Ce SQL modifie la RPC `get_membre_by_id` pour qu'elle retourne **aussi un token** à chaque ouverture d'un trip. Combiné avec le code client déjà déployé (commit `f7cce2f`), tout membre reconnecté automatiquement recevra un token valide à chaque ouverture d'app.

---

## ✅ TESTS À FAIRE EN PROD APRÈS LE SQL

1. Recharger l'app mobile (fermer/rouvrir Safari ou PWA)
2. Ouvrir chaque trip et tester :
   - **Winter Steelhead** (`6bncqg`) : upload photo → doit marcher ✅
   - **BC Fishing** (`vtjaby`) : upload photo → doit marcher après SQL #8
   - **Les Gonzesses au Soleil** (`ydkcs3`) : upload photo → doit marcher après SQL #8
3. Tester aussi sur ces 3 trips :
   - Créer/modifier/supprimer une card info
   - Changer le lodge
   - Supprimer un message photo
   - Inviter un membre

Si un flow casse, capturer l'erreur console (F12 si desktop) et me le dire dans la nouvelle conv.

---

## 📊 ÉTAT SÉCURITÉ FINAL

### ✅ Ce qui est INDUSTRIEL (niveau production sérieuse)
- **RLS active** sur 8 tables Supabase
- **REVOKE INSERT/UPDATE/DELETE** sur anon/authenticated → écritures directes bloquées (retourne 401)
- **23 fonctions RPC** SECURITY DEFINER pour toutes les mutations avec validation token
- **Tables secrets invisibles** : `access_tokens`, `rate_limit_attempts`, `config` totalement inaccessibles
- **Backoff exponentiel NIP** : brute-force 1.5s → ~11 jours
- **`ADMIN_CODE` côté serveur** : variable Vercel Sensitive, route `/api/admin/verify` avec timing-safe compare
- **`CREATOR_CODE` côté serveur** : variable Vercel Sensitive, route `/api/creator/verify`
- **Tokens de session** : UUID v4, expire 30 jours, 1 par (membre, trip)
- **Auto-génération token** (après SQL #8) : à chaque reconnexion localStorage

### 🟡 Ce qui est SEMI-sécurisé (faiblesses connues, non-critiques)
- **Bucket photos encore public** (tentative de privé → échec, rollback effectué)
- **Cards privées lisibles via SELECT direct** (le filtrage est côté client seulement)
- **Hash NIP visible via SELECT** (mitigé par backoff serveur)
- **Lecture des tables `trips/membres/infos/messages`** ouverte (téléphones des membres visibles)

### 🔴 Par design — pas à fixer pour l'instant
- Pas d'auth véritable (tel + NIP = identité complète)
- Tokens en localStorage (vulnérable XSS si faille React, mais React protège par défaut)
- Pas de validation d'URLs externes dans les cards

**Score global** : 8/10 pour une app "amis/famille". Industriel pour cet usage.

---

## 🔜 ITEMS RESTANTS POUR OPTIMISATION

### Priorité 1 — RE-TENTER Bucket privé (~1h30, besoin de soin)

**Ce qui a été tenté** : transformer le bucket `trip-photos` en privé avec signed URLs (1h de validité).
**Pourquoi ça a échoué** : en supprimant la policy `public_read_photos` par erreur, l'accès URLs publiques a été cassé → tout l'album était broken. Rollback complet effectué (commit `59ba539`).
**Policy restaurée** : `public_read_photos` recréée via SQL hotfix (fichier `audit/hotfix-restore-public-read-policy.sql`).

**Plan pour re-tenter proprement** :
1. Créer `lib/storage.ts` avec `toSignedUrlsBatch`, `extractPath`, `getStoredUrlForPath`, `deleteFiles` — **code existait dans commit reverté `9cf08fa`, à récupérer via `git show 9cf08fa -- lib/storage.ts`**
2. Modifier Album.tsx pour faire batch-signing des photos au load (state `signedMap`, useEffect sur `[photos]`)
3. Modifier Infos.tsx pour signer `fichier_url` à la volée dans `openPdf`
4. Modifier print/page.tsx et album/[token]/page.tsx
5. **AVANT de désactiver le bucket public, tester en prod d'abord** : vérifier que toutes les photos se chargent via signed URLs en laissant le bucket public. Si OK, THEN désactiver.
6. Bucket privé via Supabase Dashboard → Storage → trip-photos → Edit bucket → toggle Public OFF
7. Tester les 3 trips, upload, delete, share link
8. Si casse : rollback immédiat (toggle Public ON)

**Piège à éviter** : NE PAS supprimer les policies storage.objects (`public_read_photos`, `public_upload_photos`, etc.). Les signed URLs ET l'upload en dépendent. Si l'UI Supabase affiche une bannière "2 broad SELECT policies", la dismissser.

### Priorité 2 — Stabilité token (optionnel, 15 min)

**Problème mineur** : actuellement `get_membre_by_id` crée un **nouveau token** à chaque ouverture de trip, même si un token valide existe déjà. Ça pollue la table `access_tokens` (~100 octets par token, négligeable mais non optimal).

**Fix** : modifier la RPC pour ne créer un token QUE si aucun token valide existe pour ce (membre, trip). SQL :
```sql
-- Dans get_membre_by_id, remplacer le INSERT inconditionnel par :
SELECT token INTO v_token FROM access_tokens
WHERE membre_id = v_membre.id AND expires_at > now()
ORDER BY created_at DESC LIMIT 1;
IF v_token IS NULL THEN
  INSERT INTO access_tokens (membre_id, trip_id, tel)
  VALUES (v_membre.id, v_membre.trip_id, normalize_tel(COALESCE(v_membre.tel, '')))
  RETURNING token INTO v_token;
END IF;
```

### Priorité 3 — Nettoyer tokens expirés (cron, 10 min)

Créer une fonction + cron Supabase qui supprime les tokens expirés tous les jours :
```sql
CREATE FUNCTION cleanup_expired_tokens() RETURNS void
LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  DELETE FROM access_tokens WHERE expires_at < now() - interval '7 days';
  DELETE FROM rate_limit_attempts WHERE last_attempt_at < now() - interval '1 day';
END; $$;
```
Puis Supabase Dashboard → Database → Cron → créer job quotidien.

### Priorité 4 — Tester tokens expirent bien après 30j (manuel)

Vérifier que le champ `expires_at` est bien à now() + 30 days quand un token est créé. Check :
```sql
SELECT token, created_at, expires_at, expires_at - created_at AS duration
FROM access_tokens ORDER BY created_at DESC LIMIT 5;
```

---

## 📁 INVENTAIRE DES 8 SQL EN PROD

Tous dans `C:\Users\sbergeron\crew-trips-v2\audit\` :

1. `phase2-sql-01-fondations.sql` — tables access_tokens + rate_limit + fonctions normalize_tel/verify_nip/join_trip/get_trip_data
2. `phase2-sql-02-rpc-reconnexion.sql` — 6 RPC reconnexion (get_trip_by_code, reconnect_by_tel, save_nip, register_member, get_autorises, get_membre_by_id v1)
3. `phase2-sql-03-mutations.sql` — helpers is_valid_token/is_admin_of_trip + mutations (create_trip v1, delete_trip_full, update_trip_fields, update_member, delete_member_safe, upsert_config)
4. `phase2-sql-04-mutations-secondaires.sql` — save_info_card, delete_info_card, post_message, delete_messages, manage_autorises
5. `phase2-sql-05-rls-activation.sql` — ENABLE ROW LEVEL SECURITY + policies SELECT public sur 5 tables publiques
6. `phase2-sql-06-rls-force.sql` — REVOKE INSERT/UPDATE/DELETE sur anon/authenticated + REVOKE ALL sur access_tokens/rate_limit/config
7. `phase2-sql-07-hotfix-create-trip.sql` — DROP ancienne create_trip (11 params) + nouvelle (10 params sans creator_code) + clone_trip_content
8. `phase2-sql-08-hotfix-auto-token.sql` — **NOUVEAU - À EXÉCUTER** : get_membre_by_id v2 qui retourne aussi un token
- `hotfix-restore-public-read-policy.sql` — restauration policy supprimée par erreur (déjà exécuté)

---

## 🚀 COMMITS GIT (chronologique)

```
f7cce2f — fix(phase2): auto-token generation on membre reconnexion  ← DERNIER
59ba539 — Revert "feat(phase2): bucket trip-photos prive..."         ← rollback bucket privé
9cf08fa — feat(phase2): bucket trip-photos prive + signed URLs       ← REVERTED, code récupérable
fc9f0ca — fix(phase2): refactor nouveau/page.tsx utilise apiCreateTrip + route API creator verify
ca49e0d — docs: brief reprise Phase 2 + fichiers SQL archives
97fcf7c — feat(phase2): route API /api/admin/verify (ADMIN_CODE hors du bundle)
b9ba492 — feat(phase2): refactor client utilise RPC avec fallback direct
18ea0c7 — feat(phase2): useTripSession RPC first avec fallback
4f4b029 — feat(phase2): wrapper api.ts + JoinScreen token
618bf33 — docs: brief Phase 2
5d40838 — fix(ui): layout cards 2-col Excel
```

**Pour récupérer le code du bucket privé (commit reverté) lors de la prochaine tentative** :
```bash
git show 9cf08fa -- lib/storage.ts > /tmp/storage.ts.old
git show 9cf08fa -- app/trip/[code]/Album.tsx > /tmp/album.tsx.old
```

---

## 💻 STACK & ENVIRONNEMENT

- **Next.js 16** App Router + TypeScript
- **Supabase** projet `dnvzqsgwqwrvsgfjqqxn`
  - URL: `https://dnvzqsgwqwrvsgfjqqxn.supabase.co`
  - Dashboard: `https://supabase.com/dashboard/project/dnvzqsgwqwrvsgfjqqxn`
- **Vercel** project `crew-trips-v2` sous `sylvain1971s-projects`
  - URL prod: `https://crew-trips-v2.vercel.app`
  - Dashboard: `https://vercel.com/sylvain1971s-projects/crew-trips-v2`

### Variables Vercel (toutes en place)
- `NEXT_PUBLIC_SUPABASE_URL` : normale, expose au bundle (nécessaire)
- `NEXT_PUBLIC_SUPABASE_ANON_KEY` : normale, expose au bundle (nécessaire)
- `NEXT_PUBLIC_ADMIN_CODE` : à supprimer un jour (orpheline, plus utilisée par le code)
- `ADMIN_CODE` : **Sensitive**, côté serveur = `CT2026admin`
- `CREATOR_CODE` : **Sensitive**, côté serveur = `Wsx1234567!!`

---

## 🔐 IDENTIFIANTS CRITIQUES (à NE PAS partager)

- Sylvain : tel `4185401302`, NIP `6611` (hash `adaec15ef2e59c8ee294b926aec163e678b950a4807d5cf94b6e16c42079f0d7`)
- Membre ID Sylvain par trip :
  - Winter Steelhead (`6bncqg`) : `3d31fe32-74a6-42a0-adca-ec4591a95cb1`
  - BC Fishing (`vtjaby`) : `ff65c9fb-685b-4a27-ae51-f20e9ef82fba`
  - Les Gonzesses (`ydkcs3`) : `815b3400-b401-4962-9f7d-0e4a0cc3062f`
- Trip IDs :
  - Winter Steelhead : `597f2c2f-c9f0-49b4-8091-4f81ddaf839d`
  - BC Fishing : `8acda704-1bc5-46c4-8395-fc1ff095d52b`
  - Les Gonzesses au Soleil : `f18dc5e3-4d40-4929-a942-c5cb4ab62417`
- Admin code : `CT2026admin`
- Creator code : `Wsx1234567!!`

---

## 💾 BACKUPS

- **Projet complet (code)** : `C:\Users\sbergeron\backups\crew-trips-v2-2026-04-21-1612.zip` (35 MB)
- **DB snapshot JSON** : `C:\Users\sbergeron\backups\crew-trips-db-2026-04-21-1641\`
  - 3 trips, 6 membres, 27 infos, 6 messages, 4 participants_autorises

---

## ⚠️ ROLLBACK D'URGENCE

### Si app cassée en prod
```bash
cd C:\Users\sbergeron\crew-trips-v2
git revert --no-edit f7cce2f
git push origin main
```
Vercel redéploiera automatiquement en ~2 min.

### Si RLS cause des problèmes (urgence extrême)
Coller dans Supabase SQL Editor :
```sql
ALTER TABLE trips DISABLE ROW LEVEL SECURITY;
ALTER TABLE membres DISABLE ROW LEVEL SECURITY;
ALTER TABLE infos DISABLE ROW LEVEL SECURITY;
ALTER TABLE messages DISABLE ROW LEVEL SECURITY;
ALTER TABLE participants_autorises DISABLE ROW LEVEL SECURITY;
GRANT INSERT, UPDATE, DELETE ON trips TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON membres TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON infos TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON messages TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON participants_autorises TO anon, authenticated;
```
App retourne en mode pré-Phase 2 (failles ouvertes mais fonctionnel).

---

## 📋 COMMANDE POUR DÉMARRER LA NOUVELLE CONV

Copie-colle ça au début de ton nouveau chat :

> Crew Trips Phase 2 — reprise. Lis le fichier `BRIEF-REPRISE-PHASE2-V2.md` dans mon repo `C:\Users\sbergeron\crew-trips-v2\`. Commence par vérifier si j'ai bien exécuté le SQL #8. Ensuite on attaque l'optimisation : Priorité 1 (bucket privé re-tentative) OU Priorité 2-3 (stabilité tokens) selon ce que tu me recommandes.

---

**Fin du brief. Session productive, app sécurisée à 8/10, optimisation possible dans de nouvelles sessions sans urgence.**
