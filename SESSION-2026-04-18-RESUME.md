# Crew Trips v2 — Résumé session 18 avril 2026

## État du projet à la fin de session

- **Dernier commit** : `b676d20` (fix(ui): agrandir toggle "Carte privée")
- **Backup git** : branche + tag `backup-2026-04-18` pushés sur GitHub
- **Vercel** : déployé sur `crew-trips-v2.vercel.app`, tous les commits auto-déployés
- **Supabase** : projet `dnvzqsgwqwrvsgfjqqxn`, migration cards privées **exécutée** (colonnes `is_prive` et `auteur_id` ajoutées à `infos`)

## Ce qui a été fait dans cette session

### 1. Refonte complète du système d'icônes — style iOS Settings

Remplacement des emoji par SVG pleins (fill=currentColor) sur pastilles colorées.
Commits : `48dcf48`, `009539d`, `3b65b5a`, `4bc5bb4`, `c1d97e3`, `f8fb9f3`.

**Helper central** créé : `lib/svgIcons.tsx` avec 23 icônes réutilisables
(link, chat, camera, clipboard, refresh, lock, settings, trash, alert, chevronDown,
hourglass, pin, calendar, star, check, plane, key, phone, users, fileText, image,
attachment, edit, close, plus).

**Icônes catégories** (`lib/types.tsx` — fonction `getCatSvg(id, size, tripType)`) :
- `all` : grille 4 carrés (gris #6B7280)
- `itineraire` : carte dépliée (teal #0D9488)
- `transport` : avion papier (bleu #2563EB)
- `lodge` variantes par tripType (vert #16A34A) :
  * Défaut (pêche/chasse/motoneige) : cabin + fumée de cheminée
  * Ski/vélo : hôtel multi-étages avec fenêtres
  * Hike : tente triangle
  * Yoga/soleil : palmier Phosphor plein
- `permis` variantes par tripType (ambre #B45309) :
  * Pêche : carte ID avec photo
  * Ski : ticket entaillé
  * Autres : cadenas
- `equipement` : engrenage (gris #6B7280)
- `infos` : cercle "i" (bleu clair #0EA5E9)
- `meteo` : soleil rayonnant (orange #F59E0B)
- `resto` : cuillère+fourchette croisées (rose #E11D48)
- `liens` : chaîne (violet #7C3AED)

**Filtres refaits** : grille 5×2 verticale (mini-pastille 22px + label court).
Bouton "Tout" actif = fond vert forest-mid (#1A4A1A) plein + texte blanc.
Les autres filtres actifs = fond teinté 15% + bordure 2px.

**Empty states** transformés en grosses pastilles colorées avec SVG blanc.

**Fichiers touchés** :
`lib/types.tsx`, `lib/svgIcons.tsx`, `Infos.tsx`, `InfoCardView.tsx`, `Album.tsx`,
`Membres.tsx`, `nouveau/page.tsx`, `mes-trips/page.tsx`, `print/page.tsx`,
`admin/page.tsx`, `JoinScreen.tsx`, `rejoindre/page.tsx`, `created/page.tsx`,
`album/[token]/page.tsx`, `app/page.tsx`.

**Emoji conservés** (contextuels, gardés selon décision Sylvain) :
- TRIP_ICONS (🎣⛷🗻🥾🚵🫎🧘☀️🏕) dans les listes/selects
- Logo header 🏕 (Crew Trips)
- 🖨 📐 ☑️ hero de la vue impression
- 📄 bouton "Ouvrir document" PDF attachment
- Emoji hero de pages spécifiques (🔐 admin login, etc.)

### 2. LodgeItem refondus (Infos.tsx + print/page.tsx)

Les 6 items (Nom, Adresse, Téléphone, WiFi, Arrivée, Départ) passent en SVG inline.
- **Arrivée = clé** (check-in, Material flight_land corrigé en key)
- **Départ = horloge** (check-out, plus sémantique que décollage d'avion)

### 3. Header Lodge amélioré

- Pastille verte 26×26 + SVG `getCatSvg('lodge', trip.type)` + label
- Badge **"Principal"** vert clair à côté (rgba(22,163,74,.1))
- Bouton Modifier = icône seule 32×32 teintée verte, 3 états :
  * Pas de lodge : icône `plus`
  * Lodge existant : icône `edit` (crayon plein iOS Settings)
  * Mode édition : icône `close`

### 4. Cards privées — Option A (filtrage frontend)

**Migration SQL exécutée** :
```sql
ALTER TABLE infos
  ADD COLUMN IF NOT EXISTS is_prive boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS auteur_id uuid REFERENCES membres(id) ON DELETE SET NULL;
```

**Frontend** :
- Types `InfoCard` : `is_prive?: boolean`, `auteur_id?: string`
- Filtre dans `Infos.tsx` : `cards.filter(c => !c.is_prive || c.auteur_id === membre.id)`
- Sheets Ajouter/Modifier : toggle **"Carte privée"** avec :
  * Pastille cadenas 36×36 ambre (#B45309 quand actif, var(--border) sinon)
  * Titre "Carte privée" 15px bold
  * Sous-texte "Visible par toi uniquement" 12px
  * Switch 44×24 avec thumb 20×20
- Sur insert : `is_prive: bool` + `auteur_id: membre.id`
- Sur update : `is_prive: editIsPrive` (sync via openEdit)
- Rollback correct si erreur
- Badge **"Privée"** sur les cards privées (ambre, cadenas 9px, visible seulement par l'auteur via le filtrage)

**Sécurité** : filtrage frontend uniquement (pas de RLS car l'auth Crew Trips ne passe
pas par Supabase Auth). Acceptable pour groupe d'amis, inadéquat pour données sensibles.

### 5. Autres polishs

- Countdown "7 jours avant le départ" : décentré, aligné à gauche sous la date, sans pastille, juste texte en blanc 70%
- "Créateur" → "Administrateur" en mode UI (puis raccourci en "Admin" sur mes-trips car trop long → cachait le titre du trip)
- Empty states `📭` → pastille + SVG clipboard
- Sablier `⏳` retiré du countdown (doublon visuel avec le texte)

## Ce qui reste à faire

### Items visibles/priorisés

1. **Logo Crew Trips** — question ouverte : remplacer l'emoji 🏕 (camping tente) par un chalet en rondins dans le même style illustré Apple 3D
   - Options discutées : PNG custom, Fluent Emoji 3D Microsoft, emoji natif 🛖 (hut)
   - Aucune décision finale prise
   - **Slogan à changer en même temps** : "Tout ce que ton groupe a besoin de savoir. Un seul lien." → **"Un seul lien. Pour tout savoir."** (`app/page.tsx` lignes ~11-12)

2. **3 nouveaux boutons dans header trip** (crayon, Inviter, imprimante — visible sur capture Sylvain) — fonctionnent déjà, viennent de conversations précédentes, à revoir éventuellement pour cohérence visuelle

3. **Harmoniser les crayons "Modifier" des cards** (outline actuel) en style plein iOS Settings si on veut la cohérence totale (Option C discutée mais non retenue — Sylvain a choisi B)

4. **InstallBanner.tsx** — 1 emoji mineur pas encore traité (basse priorité)

### Items backlog (brief audit stabilité pré-existant)

Dans `BRIEF-*.md` (17 avril), 7 axes :
1. Audit optimistic UI patterns (Album.tsx deleteSelected, uploadAllPending, Membres toggles/regenerateShareToken, Infos add/update/remove)
2. Performance Album N=100 photos (lightbox re-mount, realtime leak, memoization grille, lazy loading)
3. Performance Download ZIP mobile (mémoire iOS Safari 50MB+, parallélisation p-limit, progress feedback)
4. Bundle size (`.next/static/chunks/`, dynamic imports jszip et react-zoom-pan-pinch)
5. RLS Supabase sanity check (validé phase B, à vérifier)
6. Service Worker robustesse cache PWA
7. Checklist tests manuels

**Bug pré-existant connu** : `npm run build` local échoue sur `/_global-error`
(TypeError Cannot read properties of null reading useContext). TypeScript reste clean.
Présent avant toute modif. Vercel peut reproduire — surveiller le dashboard.

## Règles d'environnement à retenir

### Paths Windows avec brackets
- `app/trip/[code]/...` casse PowerShell → **utiliser `-LiteralPath`** ou `Desktop Commander:edit_block` qui gère automatiquement les brackets
- Exemple PowerShell : `Get-Content -LiteralPath "app\trip\[code]\Infos.tsx"`

### Git commits avec caractères spéciaux
- Messages git avec emoji/accents : écrire dans `_m.txt` via `Desktop Commander:write_file` puis `git commit -F _m.txt`
- `create_file` écrit dans le conteneur Claude (pas sur Windows) → utiliser `Desktop Commander:write_file` pour écrire localement

### NODE_ENV
- `NODE_ENV=production` global par défaut sur la machine
- Avant `npx tsc --noEmit` ou `npm run build` : `$env:NODE_ENV='development'`

### Supabase
- `current_prices` dans hockey-capital = VIEW pas TABLE (pour référence cross-projet)
- `.single().catch()` chaining invalide en Supabase JS
- Supabase React inputs block programmatic injection

## Structure du projet

**Stack** : Next.js 16.2.3 Turbopack + React 19 + TypeScript + Supabase
+ `react-zoom-pan-pinch` + `jszip`

**Local** : `C:\Users\sbergeron\crew-trips-v2`
**Repo GitHub** : `Sylvain1971/crew-trips-v2`
**Vercel** : `crew-trips-v2.vercel.app`
**Supabase** : project `dnvzqsgwqwrvsgfjqqxn`
**User Windows** : `sbergeron`

**Design** : palette outdoor/natural :
- `--forest` #0F2D0F (header)
- `--forest-mid` #1A4A1A (bouton "Tout" actif)
- `--green` #2D6A2D
- `--green-light` #4A9A4A
- `--sand` #F5F0E8 (body bg)
- `--sand-dark` #E8E0CC
- `--stone` #8B7355
- `--border` #E0D8C8

Mobile-first, Linear/Arc Browser aesthetic.

## Commits de la session (chronologique)

| Commit | Description |
|---|---|
| `60d8744` | Réordonnancement filtres + × actions repositionnées |
| `5a4999b` | Toolbar album toujours visible + permissions |
| `54402bf` | Filtres sur 3 lignes + Partager grisé si album vide |
| `3593620` | Abandon 3 lignes → grille 5×2 |
| `3d7d109` | Premières icônes SVG Lucide colorées |
| `5dcf651` | Header Lodge sticky au-dessus des filtres |
| `1c66447` | Premier getCatSvg + SVG partout + variantes par tripType |
| `7756a44` | Légende lightbox contrastée + labels boutons upload |
| `48dcf48` | **Refonte iOS Settings** (fills pleins, pastilles colorées) |
| `009539d` | Round 2 emoji → SVG (Membres/Album/Infos/nouveau/mes-trips) |
| `3b65b5a` | Round 3 + fix "Tout" actif vert + badge "Principal" Lodge |
| `4bc5bb4` | Empty states Infos et Album passent en SVG pastille |
| `c1d97e3` | Nettoyage final + retrait sablier countdown |
| `d4c6db3` | **Cards privées** (toggle + filtre + badge) |
| `f8fb9f3` | Countdown à gauche + bouton Modifier Lodge icône + "Administrateur" |
| `f9cf054` | Raccourci "Administrateur" → "Admin" |
| `b676d20` | Toggle "Carte privée" agrandi |
