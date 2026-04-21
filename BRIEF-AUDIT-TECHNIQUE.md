---
# BRIEF — AUDIT TECHNIQUE CREW TRIPS V2
**Préparé le 2026-04-20 (après 35 commits de session sécurité + UX)**
---

## 🎯 OBJECTIF DE LA PROCHAINE SESSION

Faire un **audit technique complet** de Crew Trips v2 pour détecter :
1. **Bugs et erreurs** latentes non encore exposées
2. **Redondances** de code (logique dupliquée, composants jumeaux, patterns répétés)
3. **Problèmes de performance** (N+1 queries, re-renders inutiles, bundle size, CSS)
4. **Dette technique** (erreurs TS ignorées, `any`, code mort, imports inutilisés)
5. **Vulnérabilités de sécurité** (RLS Supabase, XSS potentiels, auth bypass, race conditions)
6. **Fluidité UX** (états de loading manquants, feedback utilisateur, navigation)

L'audit doit produire une **liste priorisée** (critique → nice-to-have) avec estimation d'effort par item.

---

## 🏗️ ÉTAT ACTUEL DU PROJET

### Stack technique
- **Frontend**: Next.js 16 (App Router), TypeScript, React 18
- **Backend**: Supabase (Postgres + Storage + Realtime + Auth)
- **Déploiement**: Vercel (auto-deploy via push main)
- **Local**: `C:\Users\sbergeron\crew-trips-v2`
- **Repo GitHub**: `Sylvain1971/crew-trips-v2`
- **Prod**: `https://crew-trips-v2.vercel.app`
- **Supabase project**: `dnvzqsgwqwrvsgfjqqxn` (région: free tier)

### Métriques
- **325 commits** total sur le repo
- **6473 lignes de code** TS/TSX dans `app/` et `lib/`
- **~349 KB** de code source
- **~374 MB** avec node_modules + .next

### Fichiers principaux (zones à auditer en priorité)
- `app/trip/[code]/Album.tsx` (~930 lignes) — photos, upload, share, selection, delete
- `app/trip/[code]/Infos.tsx` (~890 lignes) — cards, lodge, filtres, PDF viewer
- `app/trip/[code]/JoinScreen.tsx` (~640 lignes) — 4 modes (choice/reconnexion/inscription/creer-nip)
- `app/trip/[code]/Membres.tsx` (~775 lignes) — membres, invitations, NIP, participants autorisés
- `app/trip/[code]/Chat.tsx` (inconnu — à vérifier)
- `app/nouveau/page.tsx` (~385 lignes) — création trip
- `app/mes-trips/page.tsx` — liste trips de l'utilisateur
- `app/admin/page.tsx` et `app/admin/retrouver/page.tsx` — admin
- `lib/types.tsx` — types + helpers (normalizeTel, hashNip, matchParticipant, etc.)
- `lib/utils.tsx` — utilitaires (countdown, withRetry, getCat*)

### Dépendances clés (package.json à vérifier)
- `@supabase/supabase-js`
- `next` v16
- `react` v18
- `qrcode` (génération QR codes)
- `react-zoom-pan-pinch` (lightbox photos)
- Libraries d'upload/compression d'images
- JSZip (download album)

---

## 🚨 PROBLÈMES CONNUS À INVESTIGUER EN PRIORITÉ

### 1. Erreurs TypeScript ignorées (pipeline Vercel permissive)
Plusieurs erreurs TS **pré-existantes** sont laissées passer par le build Vercel :

- **`app/trip/[code]/Album.tsx:299`** — TS2345: `Argument of type 'unknown' is not assignable to parameter of type 'Blob | MediaSource'` (dans le bloc upload optimistic, probablement dans le `catch` avec `File` ou le blob URL)
- **`app/trip/[code]/Infos.tsx:547,554`** — TS2322: `FilterBtn` mal typé (props `children` vs type du composant)
- **`app/trip/[code]/Infos.tsx:631`** — TS2322: `InfoCardView` reçoit des `any` au lieu du type `InfoCard` exact
- Erreurs volontairement ignorées dans les scripts de build : **TS7016, TS7006, TS2503, TS7026** (imports `any`, types manquants node_modules)

**À faire** : corriger ces erreurs ou documenter pourquoi elles sont acceptées. Ajouter `tsc --noEmit --strict` comme check pre-commit.

### 2. Redondances suspectes à vérifier
- **Code de share QR code** : logique dupliquée entre `Album.tsx` et `Membres.tsx` (QRCode.toDataURL avec mêmes paramètres `{width:512, margin:2, color:{...}}`)
- **Formatage téléphone** : `formatTel()` dupliqué dans 4-5 fichiers (`nouveau/page.tsx`, `admin/retrouver/page.tsx`, `JoinScreen.tsx`, `Membres.tsx`). Devrait être dans `lib/types.tsx` ou `lib/utils.tsx`
- **Logique de suppression avec rollback** : pattern optimistic + rollback répété dans Album.tsx, Infos.tsx, Membres.tsx — extraire dans un hook `useOptimisticMutation()`?
- **Sheet overlay pattern** : `overlay + sheet open` dupliqué 5-6 fois dans `Infos.tsx`, `Album.tsx`, etc. — composant `<Sheet>` générique?
- **PDF handling / fichier attachment** : logique upload/remove/replace dupliquée entre "Ajouter card" et "Modifier card" dans `Infos.tsx`
- **Bouton œil (show/hide password)** : SVG du même icône dupliqué dans au moins 3 fichiers (JoinScreen, admin/page, admin/retrouver/page)
- **`saveNip` vs `creerNipMigration`** : logique quasi-identique dans `Membres.tsx` et `JoinScreen.tsx` — le NIP hashing + UPDATE WHERE tel pourrait être dans un helper partagé `lib/nip.ts`

### 3. Performance — patterns N+1 et re-renders
- **Route `/members` et `/leaderboard`** : on a corrigé une partie en Hockey Capital mais **pas vérifié dans Crew Trips**. À auditer si pertinent.
- **Album.tsx** : `photos.filter(p => selectedIds.has(p.id) && !p._pending)` appelé plusieurs fois par render (ligne affichage du count, ligne bouton share, ligne bouton delete). Memoize.
- **Infos.tsx** : les listes de cards filtrées ont déjà `useMemo`, mais le `sentinelRef` + scroll detection sur lodge fait un `getComputedStyle` à chaque mount — vérifier le coût sur appareils bas de gamme
- **Realtime channels** : `Album.tsx` ouvre un channel par mount, `Chat.tsx` aussi. Si un utilisateur navigue vite entre trips, s'assurer que les anciens channels sont bien `supabase.removeChannel()`
- **QR code généré au mount** dans `Membres.tsx` même si jamais affiché — lazy-generate only si le modal est ouvert
- **Blob URL tracking** : `liveBlobUrls` ref dans Album.tsx — vérifier qu'il n'y a pas de fuite mémoire si l'user upload puis ferme la sheet sans uploader

### 4. Sécurité RLS Supabase — JAMAIS AUDITÉ
**C'est le point le plus critique.** À ma connaissance, **aucune Row Level Security (RLS)** n'est active sur les tables Supabase. Ça signifie que :
- Un utilisateur malveillant avec la clé anon peut potentiellement **lire/modifier/supprimer n'importe quelle ligne** de `trips`, `membres`, `messages`, `infos`, `participants_autorises`
- Le NIP hashé est en DB, mais sans RLS il peut être lu directement
- **Les photos de l'album sont publiques** (bucket `trip-photos` public)

**À auditer** :
1. État actuel des RLS policies (probablement `SELECT/INSERT/UPDATE/DELETE to anon` = full access)
2. Concevoir des policies basées sur le NIP hashé ou un JWT custom
3. Evaluer si un système d'auth Supabase proper est nécessaire, ou si on peut vivre avec la sécurité "obscurity" du code de trip + NIP

### 5. Race conditions potentielles
- **Création de trip** : `INSERT trips` puis `INSERT membres` non-atomique. Si le 2e échoue, on a un trip orphelin. Transaction ou edge function?
- **Propagation du NIP** : 2 UPDATEs séparés dans JoinScreen rejoindre() (INSERT nouveau membre + UPDATE WHERE tel != id). Si le 2e échoue, incohérence.
- **Suppression trip** : `DELETE messages → infos → participants_autorises → membres → trips` séquentiel. Si un crash arrive entre, données partielles.
- **Upload photo optimistic** : blob URL créée, ajoutée au state, puis uploadée. Si user navigate entre, cleanup des blob URLs peut laisser des photos "fantômes".

### 6. UX et fluidité
- **États de loading manquants** dans certaines mutations (rechercher `setLoading` pour voir la couverture)
- **Messages d'erreur génériques** ("Erreur : " + e.message) exposent parfois des détails Supabase techniques à l'utilisateur
- **`alert()` natif** utilisé partout au lieu d'une modal propre — sur mobile c'est acceptable mais pas idéal pour l'UX
- **`confirm()` natif** idem — bloque l'UI
- **Pas de skeleton screens** pour les listes (photos, cards, membres) — les "Chargement…" en texte sont basiques
- **Navigation `router.push()` vs `window.location.href`** mélangés — on utilise hard reload dans certains cas (useTripSession) mais pas d'autres. Standardiser.

---

## 🗄️ ÉTAT DE LA BASE DE DONNÉES (au 20 avril 2026, 22h)

### Trips actifs (2)
- **Winter Steelhead - 2026** (code `6bncqg`, id `597f2c2f-c9f0-49b4-8091-4f81ddaf839d`)
  - Skeena River, Terrace BC
  - 25 avril → 1er mai 2026
- **Les Gonzesses au Soleil☀️** (code `ydkcs3`, id `f18dc5e3-4d40-4929-a942-c5cb4ab62417`)
  - Punta Cana, RD
  - 8 → 14 mai 2026

### Membres (4 lignes, 3 personnes distinctes)
- Sylvain Bergeron · `4185401302` · NIP 6611 (SET) · ADMIN sur les 2 trips
- Joée Boudreault · `4188126438` · NIP NULL (migration douce en attente) · Gonzesses
- Dorys Lapointe · `4185403206` · NIP NULL (migration douce en attente) · Gonzesses

### Hash SHA-256 de "6611" (référence)
```
adaec15ef2e59c8ee294b926aec163e678b950a4807d5cf94b6e16c42079f0d7
```

### Migrations SQL exécutées pendant cette session
1. `migrations/2026-04-20_nom_participants.sql` — séparation prénom/nom + tel optionnel
2. `migrations/2026-04-20_nip_membres.sql` — `ALTER TABLE membres ADD COLUMN nip TEXT NULL; CREATE INDEX idx_membres_trip_tel_nip`
3. Reset DB complet via SQL Editor : DELETE trip "Test", DELETE membres Winter+Gonzesses, INSERT Sylvain admin sur les 2 trips avec NIP hashé

### Schémas de tables (à vérifier exactement avec `\d+` dans Supabase SQL Editor)
- `trips` — id (uuid), code (text unique), nom, type, destination, date_debut/fin, createur_tel, lodge_* (nom, adresse, tel, wifi, code, arrivee), share_token, can_delete, can_edit, can_post_photos, whatsapp_lien, created_at
- `membres` — id, trip_id (FK), prenom, nom, tel, nip (hash SHA-256 ou NULL), is_createur, couleur, created_at
- `messages` — id, trip_id, membre_id, membre_prenom, membre_couleur, contenu, image_url, created_at
- `infos` — id, trip_id, categorie, titre, contenu, lien, fichier_url, membre_prenom, is_prive, auteur_id, epingle, created_at
- `participants_autorises` — id, trip_id, prenom, nom, tel
- `config` — key, value (couples clé-valeur pour creator_code et settings globaux)

### Storage Supabase
- Bucket `trip-photos` (PUBLIC) — album photos, PDF attachments, docs
- Organisation : `{trip_id}/album/{timestamp}-{idx}-{prenom}.{ext}` et `{trip_id}/docs/{timestamp}-{prenom}.{ext}`

---

## 📦 BACKUP

Backup complet créé le **2026-04-20 22:13** :
- **Fichier** : `C:\Users\sbergeron\backups\crew-trips-v2-2026-04-20-2213.zip`
- **Taille** : 374 MB (inclut node_modules + .next)
- Restauration : extraire dans un dossier vide, `npm install` pour vérifier, `npm run dev` pour lancer

---

## 🎯 MÉTHODOLOGIE SUGGÉRÉE POUR L'AUDIT

### Phase 1 — Snapshot et mesures (2h)
1. Build TS avec `tsc --noEmit --strict` et lister **toutes** les erreurs, même ignorées
2. `npm run build` et analyser la taille du bundle (quel chunk est gros?)
3. Lighthouse audit sur iPhone simulé pour `/trip/{code}` (quelle lighthouse score actuel?)
4. Lister les dépendances avec `npm outdated` et `npm audit`
5. Compter les `any`, `@ts-ignore`, `@ts-expect-error`, `eslint-disable`
6. Identifier les imports non utilisés (ESLint)

### Phase 2 — Audit de sécurité (3h)
1. Vérifier RLS policies sur chaque table Supabase
2. Tester avec `curl` depuis un client externe quelles tables sont accessibles en anon
3. Vérifier le bucket storage (peut-on lister toutes les photos de tous les trips?)
4. Auditer les `--break-system-packages` ou équivalents côté npm
5. Chercher les secrets hardcodés (clé service role en env.local?)

### Phase 3 — Audit code (4h)
1. Pour chaque gros fichier (>500 lignes), faire une revue manuelle
2. Identifier les redondances listées + autres
3. Proposer un plan de refactoring avec priorités
4. Vérifier les edge cases :
   - Utilisateur sans tel
   - Trip sans créateur (bug possible détecté dans Gonzesses avant reset)
   - Offline/reconnexion réseau
   - PWA iOS vs Android vs Desktop
   - Dark mode / light mode (y a-t-il un support?)

### Phase 4 — Rapport (1h)
Produire un document `AUDIT-RAPPORT-YYYYMMDD.md` avec :
- Liste des issues critiques (sécurité, data loss)
- Liste des issues performance
- Liste des redondances avec estimation ROI du refactor
- Quick wins (< 1h à fixer)
- Long-term (> 4h)
- Estimation d'effort total

---

## 🔧 OUTILS À UTILISER POUR L'AUDIT

```powershell
# Build TS strict
cd C:\Users\sbergeron\crew-trips-v2
npx -p typescript@5.9.3 -- tsc --noEmit --strict 2>&1 | Out-File audit-ts-strict.txt

# Bundle analyzer Next.js
$env:ANALYZE="true"; npm run build

# Lister les imports inutilisés
npx eslint --ext ts,tsx app/ lib/ --rule 'no-unused-vars: error'

# Chercher les any et ts-ignore
Get-ChildItem -Path app,lib -Recurse -Include "*.tsx","*.ts" | Select-String -Pattern "any|@ts-ignore|@ts-expect-error" | Measure-Object

# Chercher les `alert(` et `confirm(`
Get-ChildItem -Path app,lib -Recurse -Include "*.tsx","*.ts" | Select-String -Pattern "alert\(|confirm\("

# Analyser les dépendances
npm outdated
npm audit --json > audit-npm.json
```

---

## 📝 INSTRUCTIONS POUR LA NOUVELLE SESSION

Quand tu commences la nouvelle conversation, copie ce brief en premier message ou réfère-toi à ce fichier `BRIEF-AUDIT-TECHNIQUE.md` dans le repo.

Demande à Claude de :
1. Lire le brief complet
2. Proposer un plan d'audit en 4 phases (ci-dessus)
3. Commencer par la **Phase 1 — mesures** avant toute correction
4. Me soumettre les chiffres bruts avant de proposer des fixes
5. Je déciderai des priorités après avoir vu les résultats

Règles importantes à rappeler à Claude pour l'audit :
- **Ne pas corriger de bug sans m'avoir demandé** — même si évident
- **Documenter chaque redondance trouvée** avec LOC exact et recommandation
- **Ne pas refactorer sans plan d'ensemble approuvé**
- **Toujours garder un backup avant tout refactor**
- **Build TS check après chaque modification** (`npx -p typescript@5.9.3 -- tsc --noEmit`)

---

## 📊 RÉSUMÉ DE LA SESSION PRÉCÉDENTE (20 avril 2026)

**35 commits en production** avec focus:
- Système NIP 4 chiffres complet (SHA-256 hashé, rate limiting, migration douce, propagation par tel)
- Verrou d'identité localStorage (un appareil = un participant)
- PWA standalone avec skip direct reconnexion
- Outil admin `/admin/retrouver`
- Permissions album (participants avec can_post_photos peuvent supprimer toute photo)
- Icône activité (TripIcon) dans header du trip pour cohérence avec /mes-trips
- UX uniforme /nouveau (hauteurs 50px, espacements 20px/68px, placeholders Début/Fin intégrés)
- Reset DB propre : Sylvain admin des 2 trips avec NIP 6611

**Derniers commits** : 6a51681 (espace bloc Dates/bouton) → 53a6e1e (typo harmonie) → 3ea5b7e (étoile admin) → bf810e8 → 4ed4d9d → da23138 → 0d0fff8 (album delete) → 3b94b13 → 44959cc → 5b52134 → 567de7f (NIP unique) → 45b30dd → 7d4e56b → ade0ea4 → fa007fa → bb900a4 → fe67c10 → 56fae87 → 58a83db → d799c82 → 360df0d → b3b69bf → 068ffa6 → 1283d3d → 830a74a → c754aa6 → 4e8c50c → 75c1d92 → adbe1ec → efe2367 → 8932ca8 → 7986389 → 4346673 → 835bdad

---

**Fin du brief. Prêt pour session d'audit.**
