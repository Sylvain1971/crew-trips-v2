# BRIEF REPRISE — Finalisation Phase 2 Sécurité Crew Trips v2

**Créé** : 2026-04-21 (fin session audit + activation RLS)
**À utiliser** : au début d'une nouvelle conversation Claude
**Contexte** : la sécurité critique est en place et déployée. Il reste quelques items à boucler pour officiellement clôturer la Phase 2.

---

## 🎯 État actuel — Ce qui est fait et déployé

### ✅ Backend Supabase (22 fonctions RPC, RLS activé)
- 4 fondations : `normalize_tel`, `verify_nip`, `join_trip`, `get_trip_data`
- 6 reconnexion/inscription : `get_trip_by_code`, `reconnect_by_tel`, `save_nip`, `register_member`, `get_autorises`, `get_membre_by_id`
- 2 helpers : `is_valid_token`, `is_admin_of_trip`
- 6 mutations critiques : `create_trip`, `delete_trip_full`, `update_trip_fields`, `update_member`, `delete_member_safe`, `upsert_config`
- 5 mutations secondaires : `save_info_card`, `delete_info_card`, `post_message`, `delete_messages`, `manage_autorises`
- RLS activée sur les 8 tables
- REVOKE INSERT/UPDATE/DELETE sur rôles anon/authenticated (écritures directes bloquées)
- Tables secrets invisibles (access_tokens, rate_limit_attempts, config)

### ✅ Code client
- `lib/api.ts` : 23 wrappers RPC (fichier complet 366 lignes)
- `JoinScreen.tsx` : génère un token après chaque login (non bloquant)
- `useTripSession.ts` : utilise RPC first avec fallback direct
- `Infos.tsx` : 5 mutations refactorées (INSERT/UPDATE/DELETE cards + update lodge + update trip)
- `Album.tsx` : 4 mutations refactorées (post message, delete messages, update share_token x2)
- `Membres.tsx` : 7 mutations refactorées (autorises, membres, permissions, share_token, delete trip)
- `admin/page.tsx` : refactoré (saveCreatorCode, supprimerTrip) + login via route API
- `admin/retrouver/page.tsx` : login via route API
- Route API `/api/admin/verify` : ADMIN_CODE protégé côté serveur

### ✅ Vercel
- Variable `ADMIN_CODE` ajoutée (Sensitive, Production + Preview)
- Variable `NEXT_PUBLIC_ADMIN_CODE` toujours présente comme fallback
- Redeploy effectué et testé : route `/api/admin/verify` répond correctement

### ✅ Commits en prod (ordre chronologique)
1. `5d40838` — fix layout Excel 2-col
2. `618bf33` — brief Phase 2
3. `4f4b029` — wrapper api.ts + JoinScreen génère token
4. `18ea0c7` — useTripSession RPC first
5. `b9ba492` — refactor Infos/Album/Membres/admin
6. `97fcf7c` — route API /api/admin/verify (dernier commit en prod)

### ✅ Fichiers SQL dans le repo (dossier `audit/`)
- `phase2-sql-01-fondations.sql` — exécuté
- `phase2-sql-02-rpc-reconnexion.sql` — exécuté
- `phase2-sql-03-mutations.sql` — exécuté
- `phase2-sql-04-mutations-secondaires.sql` — exécuté
- `phase2-sql-05-rls-activation.sql` — exécuté
- `phase2-sql-06-rls-force.sql` — exécuté
- `diag-rls-status.sql` — diagnostic

### ✅ Audit final prouvé
Tests Phase 1 rejoués après activation RLS :
- INSERT trip depuis anon → `401 Unauthorized` (avant : `201 Created`)
- UPDATE trip "HACKED" → `401` (avant : `200 OK`)
- DELETE trip → `401` (avant : `200 OK`)
- Lecture `config.creator_code` → `401 Forbidden` (avant : exposé en clair)
- Lecture `access_tokens` → `401` (tokens protégés)
- SELECT trips/membres/infos → `200 OK` (app fonctionne)
- RPC `join_trip` + `get_trip_data` → OK avec token valide

---

## 🟠 Ce qui reste à finaliser — 5 items

### ITEM 1 — CRITIQUE — Refactor `app/nouveau/page.tsx` ⏱️ 45 min

**Problème** : la création d'un nouveau trip fait encore des `supabase.from('trips').insert(...)` directs. Ces INSERT **échouent maintenant** depuis l'activation RLS. Impact : impossible de créer un nouveau trip via l'app en prod.

**Fichier** : `C:\Users\sbergeron\crew-trips-v2\app\nouveau\page.tsx` (389 lignes)

**Mutations directes à remplacer** :
1. `supabase.from('trips').insert({...})` — création du trip
2. `supabase.from('membres').insert({...}).select().single()` — ajout créateur
3. `supabase.from('trips').update({lodge_*})` — copie lodge depuis trip source
4. `supabase.from('infos').insert(srcInfos.map(...))` — clone des cards

**Solution** : utiliser la RPC `apiCreateTrip` qui fait tout en une seule transaction atomique.

Signature :
```typescript
apiCreateTrip(creatorCode: string, params: {
  code: string
  nom: string
  type: string
  destination: string
  date_debut: string | null
  date_fin: string | null
  createur_prenom: string
  createur_nom: string
  createur_tel: string
  createur_nip_hash: string
}) => { success, trip_id, membre_id, token }
```

**Attention** :
- `creatorCode` doit matcher la valeur stockée dans table `config` (`Wsx1234567!!` actuel)
- Si table config vide, la RPC laisse passer (bootstrap)
- Pour le clone de lodge : utiliser `apiUpdateTripFields()` après création
- Pour le clone des cards : boucle sur `apiSaveInfoCard()` OU créer une nouvelle RPC `clone_infos_from(src_trip_id, dst_trip_id, token)` (plus élégant)

**NIP hérité** : le code actuel fait un SELECT direct sur `membres` pour trouver un NIP existant du même téléphone. Ce SELECT marche encore (RLS autorise SELECT) donc pas bloquant, mais on peut utiliser `apiReconnectByTel()` à la place.

---

### ITEM 2 — FACILE — Nettoyer `NEXT_PUBLIC_ADMIN_CODE` ⏱️ 10 min

**Situation** : `NEXT_PUBLIC_ADMIN_CODE` existe encore dans Vercel et `.env.local` comme fallback. Maintenant que `ADMIN_CODE` côté serveur fonctionne, on peut retirer le fallback.

**Actions** :
1. **Sur Vercel** (manuel Sylvain) : Settings → Environment Variables → supprimer `NEXT_PUBLIC_ADMIN_CODE`
2. **Dans le code** (Claude) :
   - Retirer le fallback `process.env.NEXT_PUBLIC_ADMIN_CODE` dans `app/api/admin/verify/route.ts`
   - Retirer le fallback local dans `app/admin/page.tsx` et `app/admin/retrouver/page.tsx` (comparaison locale avec `ADMIN_CODE`)
3. **`.env.local`** : supprimer la ligne `NEXT_PUBLIC_ADMIN_CODE=CT2026admin`
4. Commit + push + redeploy
5. Tester `/admin` login fonctionne toujours

---

### ITEM 3 — IMPORTANT — Tests manuels en production ⏱️ 20 min (Sylvain)

**À tester sur https://crew-trips-v2.vercel.app** (mobile et/ou desktop) :

**Flow 1 — Rejoindre un trip existant**
- [ ] Ouvrir `/trip/vtjaby` (BC Fishing) en incognito
- [ ] JoinScreen → tel `4185401302` + NIP `6611` → accès OK
- [ ] Revisiter le trip : reconnexion auto OK

**Flow 2 — Créer/modifier/supprimer une card info**
- [ ] Tab Infos → + → remplir titre + contenu → enregistrer
- [ ] Vérifier que la card apparaît
- [ ] La modifier → vérifier update
- [ ] La supprimer → vérifier disparition

**Flow 3 — Album photo**
- [ ] Tab Album → + → uploader une photo avec caption
- [ ] Vérifier apparition dans la grille
- [ ] Long-press → sélection → supprimer → vérifier disparition

**Flow 4 — Permissions + lodge**
- [ ] Tab Groupe → modifier lodge → vérifier sauvegarde
- [ ] Toggle "Peut supprimer photos" → vérifier persistance
- [ ] Share link → générer → copier → ouvrir dans autre navigateur → album visible sans login

**Flow 5 — Création de trip** ⚠️ cassé jusqu'à Item 1 fait
- [ ] Page /nouveau → remplir formulaire → soumettre
- [ ] Redirection vers /trip/{code}/created
- [ ] Trip visible dans /mes-trips

**Flow 6 — Admin**
- [ ] /admin → login avec `CT2026admin` → voir la liste
- [ ] /admin/retrouver → chercher un membre → voir les résultats

**Si un flow casse** :
- Capturer l'erreur console (F12 → Console + Network)
- Dire à Claude : "flow X casse, voici l'erreur : ..."
- Claude fait un hotfix ou rollback dans les 5 min

---

### ITEM 4 — MOYEN — Bucket `trip-photos` privé ⏱️ 45 min

**Situation actuelle** : bucket PUBLIC. Les photos sont accessibles via URL directe publique. L'énumération complète du bucket est bloquée côté storage mais qui connaît l'URL y accède sans auth.

**Actions** :

1. **Supabase Dashboard** → Storage → trip-photos → Settings → décocher "Public bucket"

2. **Créer RPC** `get_signed_urls_batch` (SQL #7) :
```sql
CREATE FUNCTION get_signed_urls_batch(
  p_token UUID,
  p_trip_id UUID,
  p_paths TEXT[]
) RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  IF NOT is_valid_token(p_token, p_trip_id) THEN
    RETURN jsonb_build_object('success', false);
  END IF;
  -- Note : la signature des URLs signées se fait côté client avec
  -- supabase.storage.from('trip-photos').createSignedUrls(paths, 3600)
  -- Cette RPC ne fait que valider le token, le client signe ensuite.
  RETURN jsonb_build_object('success', true);
END;
$$;
```

3. **Refactor client** :
   - `Album.tsx` ligne ~370 : remplacer `getPublicUrl()` par `createSignedUrl(path, 3600)` ou batch `createSignedUrls()`
   - `Infos.tsx` ligne ~170 (upload PDF) : idem
   - `print/page.tsx` : idem pour photos dans PDF
   - Pour l'album avec N photos : **un seul appel batch** `createSignedUrls` plutôt que N appels

4. **Cache client** : signed URLs valides 1h, cacher en `useMemo` pour éviter re-signing à chaque render

5. **Share link** (trip.share_token) : le flow `/album/[token]` doit aussi passer par signed URLs maintenant

---

### ITEM 5 — FINAL — Rapport `AUDIT-PHASE2-RESULTATS.md` committé ⏱️ 15 min

**Contenu à générer** (par Claude à la toute fin) :
- Résumé exécutif : "avant/après" en 3 lignes
- Comparaison tests Phase 1 vs Phase 2 (tableau)
- Liste des 22 RPC créées
- Liste des 6 commits en prod
- Liste des SQL exécutés
- Mesures sécurité : NIP brute-force (avant 1.5s → après : ~11 jours), tokens protégés, bucket (à faire Item 4)
- Points restants pour évolution future (auth email, JWT, etc.)
- Commit le fichier dans le repo

---

## 💻 Environnement technique (pour reprise)

### Repo & config
- Path local : `C:\Users\sbergeron\crew-trips-v2`
- Repo : `https://github.com/Sylvain1971/crew-trips-v2`
- Branche : `main`
- Dernier commit en prod : `97fcf7c`
- Deploy : `https://crew-trips-v2.vercel.app`

### Supabase
- Project ref : `dnvzqsgwqwrvsgfjqqxn`
- URL : `https://dnvzqsgwqwrvsgfjqqxn.supabase.co`
- Dashboard : `https://supabase.com/dashboard/project/dnvzqsgwqwrvsgfjqqxn`

### Trips actuels (état 2026-04-21)
- `vtjaby` — BC Fishing - 2026 (1 membre : Sylvain, 9 infos cards)
- `6bncqg` — Winter Steelhead - 2026
- `ydkcs3` — Les Gonzesses au Soleil

### Backup DB
- Backup JSON : `C:\Users\sbergeron\backups\crew-trips-db-2026-04-21-1050\`
- Backup ZIP repo : `C:\Users\sbergeron\backups\crew-trips-v2-2026-04-20-2213.zip`

### Secrets (à NE PAS partager)
- NIP Sylvain : `6611` (hash `adaec15e...`)
- Tel Sylvain : `4185401302`
- Membre ID Sylvain (vtjaby) : `ff65c9fb-685b-4a27-ae51-f20e9ef82fba`
- Trip ID BC Fishing : `8acda704-1bc5-46c4-8395-fc1ff095d52b`
- Creator code DB : `Wsx1234567!!` (dans table config)
- Admin code : `CT2026admin` (Vercel env)

---

## 🚀 Pour démarrer la nouvelle conversation

Au début du nouveau chat, dis simplement :

> "Crew Trips Phase 2 — reprise. Lis le brief `BRIEF-REPRISE-PHASE2.md` dans mon repo et commence par l'Item 1 (refactor nouveau/page.tsx)."

OU si tu veux tester d'abord manuellement :

> "Crew Trips Phase 2 — avant de faire les items restants, je viens de tester l'app et [décris ce qui marche / casse]"

Claude lira ce brief (via `view` ou `read_file`) et saura exactement où reprendre.

---

## ⚠️ En cas de problème urgent

Si tu découvres que l'app est cassée en prod et que tu ne peux pas attendre :

### Rollback rapide de RLS (1 min)
Coller dans Supabase SQL Editor :
```sql
ALTER TABLE trips DISABLE ROW LEVEL SECURITY;
ALTER TABLE membres DISABLE ROW LEVEL SECURITY;
ALTER TABLE infos DISABLE ROW LEVEL SECURITY;
ALTER TABLE messages DISABLE ROW LEVEL SECURITY;
ALTER TABLE participants_autorises DISABLE ROW LEVEL SECURITY;
ALTER TABLE access_tokens DISABLE ROW LEVEL SECURITY;
ALTER TABLE rate_limit_attempts DISABLE ROW LEVEL SECURITY;
ALTER TABLE config DISABLE ROW LEVEL SECURITY;

GRANT INSERT, UPDATE, DELETE ON trips TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON membres TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON infos TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON messages TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON participants_autorises TO anon, authenticated;
GRANT ALL ON access_tokens TO anon, authenticated;
GRANT ALL ON rate_limit_attempts TO anon, authenticated;
GRANT ALL ON config TO anon, authenticated;
```

L'app retourne à l'état Phase 1 (failles ouvertes mais fonctionnel à 100%).

### Rollback code Vercel (30 sec)
Vercel → Deployments → sur un deploy antérieur à `97fcf7c` → 3 points → "Promote to Production"

---

**Fin du brief. Bonne continuation 🚀**
