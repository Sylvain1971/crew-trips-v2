# Crew Trips v2 — Brief session suivante

> **Dernière session : 18 avril 2026 (soir)** — 6 commits poussés : refonte Lodge card complète, fix navigation admin (SW), optimistic UI partout.
> **État : stable, déployé, TypeScript clean (0 erreur).**
> **Pas encore backupé** — créer un tag `backup-2026-04-18-evening` si besoin avant de reprendre.

---

## 🚀 Démarrage rapide

**Avant de coder** — vérifier l'environnement :

```powershell
cd C:\Users\sbergeron\crew-trips-v2
git status                    # Doit être "working tree clean, up to date with origin/main"
git log -3 --oneline          # Dernier commit: bcbbfc9 (optimistic UI partout)
```

**Stack technique** :
- Next.js 16.2.3 Turbopack + React 19 + TypeScript + Supabase
- Librairies : `react-zoom-pan-pinch`, `jszip`
- Déployé : `crew-trips-v2.vercel.app` (auto-deploy sur push main)
- Supabase : projet `dnvzqsgwqwrvsgfjqqxn`
- Local : `C:\Users\sbergeron\crew-trips-v2` (Windows user `sbergeron`)
- Repo : `Sylvain1971/crew-trips-v2`

**Backups disponibles** :
- Branche/tag `backup-2026-04-18` (état matin avant cette session)
- Pour revenir : `git checkout backup-2026-04-18`

---

## 🎯 Features à faire — priorisées

### 🔴 Priorité 1 — Logo Crew Trips

**Statut** : Slogan changé ✅ ("Un seul lien. / Pour tout savoir." commit `36a7af4`)
**Reste** : le visuel du logo hero (emoji 🏕 actuel) — Sylvain va magasiner un PNG/WebP 3D style Apple.

**Quand le logo est prêt** :
1. Placer le fichier dans `public/logo-hero.png` (ou .webp), idéalement 512×512+ avec fond transparent
2. Remplacer l'emoji 🏕 dans ces 3 fichiers :
   - `app/page.tsx` ligne ~10 (home)
   - `app/mes-trips/page.tsx` ligne ~110 (liste trips)
   - `app/trip/[code]/created/page.tsx` (page succès création)
3. Utiliser `next/image` avec `<Image src="/logo-hero.png" width={80} height={80} alt="Crew Trips" priority />`
4. Tester sur fond sable (`/mes-trips`) ET fond foncé (`/`) — peut nécessiter 2 versions du logo

**Pistes si Sylvain ne trouve pas de logo** :
- Fluent Emoji 3D Microsoft (GitHub open-source, pas de chalet parfait mais proche)
- IA gen Midjourney/DALL-E avec prompt : `"3D rendered log cabin in the style of Apple emoji, isometric view, transparent background, glossy, soft lighting, warm wood tones"`
- Flaticon / Iconscout packs 3D (~$5-10)

### 🟡 Priorité 2 — Perfs et stabilité (audit de la session précédente)

**Reste 6 axes du brief d'audit (l'axe Optimistic UI a été fait cette session ✅)** :

1. **Perf Album N=100 photos** — lightbox re-mount au clic, realtime leak, memoization de la grille, lazy loading. Symptôme attendu : freeze lors de l'ouverture si +50 photos.

2. **Perf Download ZIP mobile** — iOS Safari refuse les ZIP >50MB, parallélisation `p-limit` non utilisée, pas de progress feedback. Tester avec 80+ photos.

3. **Bundle size** — `.next/static/chunks/`, dynamic imports `jszip` et `react-zoom-pan-pinch` (utilisés que dans Album). À faire : `import('jszip')` lazy dans `lib/downloadAlbum.ts`.

4. **RLS Supabase sanity check** — validé phase B, à revérifier (surtout après l'ajout des cards privées). Créer un trip test avec 2 users, vérifier qu'un user ne peut rien modifier chez l'autre.

5. **Service Worker robustesse** — cache PWA + ajouts cette session (referrer-based redirect). Tester : offline → online → lancement depuis icône home-screen → navigation /admin → retour. Vérifier qu'aucun scénario ne casse.

6. **Checklist tests manuels** — créer une grille markdown avec tous les flows utilisateur à cocher avant release. Au minimum : créer trip, rejoindre, upload photo, ajouter card, modifier Lodge, permissions, partage album, suppression trip.

### 🟢 Priorité 3 — Cohérence visuelle restante (low priority)

- **InstallBanner.tsx** : 1 emoji mineur restant (banner PWA install)
- **Page `/nouveau`** : emoji 🏕 dans le select TRIP_ICONS (cohérence avec nouveau logo si changé)

---

## ✅ Ce qui a été fait cette session (18 avril soir)

Ordre chronologique des 6 commits :

### `95f29e8` — Header épuré + card Lodge refactor
- Bouton "Inviter" retiré du header trip
- Crayon + imprimante harmonisés au style pâle miroir de "Mes trips"
- Card Lodge : pin button (localStorage `crew-trips:lodge-pinned:{tripCode}`)
- Chevron passé en carré vert 32×32 cohérent avec les autres boutons
- Badge "Épinglée" (vert pâle match Principal) quand pin activé
- LodgeItem : fontSize réduit (11→10 label, 13→12 val), padding 9×12→7×10
- LodgeItem : téléphone en couleur normale (fini le vert qui tape à l'œil)
- LodgeItem : label "WiFi" → "Wifi ou code" (affichage + edit sheet)
- LodgeItem : `height: 100%` + grid `alignItems: stretch` = rangées alignées

### `17073c9` — Crayon unifié, pin en punaise, auto-close scroll, liens
- Icône `pin` dans `lib/svgIcons.tsx` : de map-pin (goutte) → punaise verticale classique
- Crayon card Lodge remplacé par le même SVG inline que le header (rectangle+pencil)
- **Auto-close Lodge changé** : scroll down dans le conteneur scrollable (seuil 8px) déclenche la fermeture, SAUF si `lodgePinned=true`
- Sentinel `<div ref>` ajouté pour détecter le conteneur scrollable parent
- Téléphone + Adresse : vert `#16A34A` (catégorie Lodge) avec flèche externe ↗
- Adresse devient cliquable : `https://google.com/maps/search/?api=1&query=...` → Google Maps

### `a1262f7` — Fix nav admin : retour → Mes trips
- Admin page : bouton retour pointe sur `/mes-trips` au lieu de `/` (label "← Mes trips")
- Admin login page : même changement
- **Service Worker fix** : le SW interceptait TOUTES les navigations vers `/` et redirigeait sur le dernier trip. Maintenant il ne redirige QUE si le referrer est vide ou externe (vrai démarrage PWA depuis home-screen). Navigations internes depuis /admin, /mes-trips, /nouveau vers / passent normalement.
- Version SW bumpée dans le header pour forcer la mise à jour chez les utilisateurs existants

### `edf8534` — Adresse paste-friendly
- Formulaire Lodge : champ Adresse en `<textarea>` pleine largeur (3 lignes, resize vertical)
- Hint "Colle n'importe quel format" (vert discret) à droite du label
- Réordre formulaire : Nom + Tél rangée 1, Adresse full width rangée 2, Wifi + Arrivée + Départ ensuite
- **Normalisation à la sauvegarde** : retours ligne → virgules, espaces multiples → un espace, trim
- Placeholder avec exemple complet "Ex: 3740 Cedar Key Avenue, Terrace, BC V8G 4M6"
- LodgeItem affichage : `white-space: nowrap` + `text-overflow: ellipsis` = 1 ligne par cellule
- `title` attr = adresse complète visible au hover/long-press
- Grid parent : `grid-template-columns: minmax(0,1fr) minmax(0,1fr)` pour que l'ellipsis fonctionne

### `36a7af4` — Nouveau slogan
- `app/page.tsx` : "Tout ce que ton groupe a besoin de savoir. / Un seul lien." → **"Un seul lien. / Pour tout savoir."**

### `bcbbfc9` — Optimistic UI partout (audit stabilité axe 1)

**Pattern utilisé partout** : snapshot + update immédiat + rollback en cas d'erreur Supabase.

**Membres.tsx** :
- `togglePermission` : toggle instantané (plus d'attente du round-trip) — impact énorme UX
- `saveWhatsapp` + `saveSms` : sheet ferme immédiatement, rollback si erreur
- `generateShareToken` + `regenerateShareToken` : token visible tout de suite

**Infos.tsx** :
- `saveLodge` : adresse normalisée + sheet ferme immédiatement, rollback restaure les valeurs
- `saveTrip` : nom/dates/destination mis à jour tout de suite, rollback si erreur

**Album.tsx** (le gros morceau) :
- `uploadAllPending` : photos apparaissent IMMÉDIATEMENT via `URL.createObjectURL(blob)`
- Sheet d'envoi se ferme dès la compression (plus d'attente de l'upload séquentiel complet)
- Chaque photo uploade en arrière-plan et remplace sa version temp par la vraie en DB
- Si une photo échoue : retirée, les autres continuent, alert à la fin
- Blob URLs révoquées après remplacement (pas de memory leak)
- Overlay spinner sur photos `_pending` + clic/long-press bloqués pendant upload
- `thumbUrl()` skippe la query-string transform pour les `blob:` URLs (sinon 404)
- `generateShareToken` + `regenerateShareToken` Album : même pattern optimistic

**globals.css** : `@keyframes crew-spin` ajouté pour le spinner upload

**Type local ajouté** : `type AlbumPhoto = Message & { _pending?: boolean }` (flag local, pas en DB)

**Fonctions qui étaient DÉJÀ optimistic avant cette session (inchangées)** :
- `save()`, `updateCard()`, `removeCard()` dans Infos
- `deleteSelected()` dans Album
- `ajouterAutorise()`, `retirerAutorise()`, `retirerMembre()`, `savePrenom()` dans Membres

---

## 📦 Contexte pour reprendre

### Système d'icônes SVG iOS Settings

**Helper central** : `lib/svgIcons.tsx` — 26 icônes en fill=currentColor :
`link, chat, camera, clipboard, refresh, lock, settings, trash, alert, chevronDown,
hourglass, pin, calendar, star, check, plane, key, phone, users, fileText, image,
attachment, edit, close, plus`.

**Note : `pin` a changé cette session** — c'est maintenant une punaise verticale classique (path `M16 9V4h1a1 1 0 0 0 0-2H7...`), plus un map-pin (goutte).

### Cards privées — fonctionnelles (fait session précédente)

**DB Supabase** (migration déjà exécutée) :
```sql
ALTER TABLE infos
  ADD COLUMN is_prive boolean DEFAULT false,
  ADD COLUMN auteur_id uuid REFERENCES membres(id) ON DELETE SET NULL;
```

### Service Worker — version critique

**Fichier** : `public/sw.js`
**Comportement actuel (après le fix de cette session)** :
- Au démarrage PWA (referrer vide OU externe) → redirige vers `/trip/{lastTripCode}` si trip en cache
- Navigation interne vers `/` (depuis /admin, /mes-trips, etc.) → laisse passer normalement
- Met à jour le cache `last-trip-code` à chaque visite d'un trip

**Important** : bumper la version en commentaire en haut du fichier quand on modifie le SW, sinon les utilisateurs restent sur l'ancienne version (les SW sont cachés agressivement).

### Optimistic UI pattern (référence)

Template du pattern utilisé partout :
```ts
async function actionXYZ() {
  const snapshot = /* valeur actuelle */
  const newValue = /* nouvelle valeur */
  
  // 1. Optimistic : appliquer localement TOUT DE SUITE
  setState(newValue)
  
  try {
    const { error } = await supabase.from('...').update(...).eq('id', ...)
    if (error) throw error
  } catch (e) {
    // 2. Rollback : restaurer snapshot
    setState(snapshot)
    alert('Erreur : ' + e.message)
  }
}
```

Pour les uploads de fichier (Album), on utilise `URL.createObjectURL(file)` comme preview en attendant l'URL Supabase réelle, puis remplacement à la réception.

---

## ⚠️ Règles d'environnement — à connaître absolument

### Paths Windows avec brackets `[code]`
Les crochets cassent PowerShell. **Toujours utiliser `-LiteralPath`** :
```powershell
Get-Content -LiteralPath "app\trip\[code]\Infos.tsx"
```
`Desktop Commander:edit_block` gère automatiquement les brackets.

**`str_replace` natif NE GÈRE PAS les brackets** — toujours utiliser `Desktop Commander:edit_block` pour les fichiers sous `app/trip/[code]/`.

### Git commits avec accents/emoji
- Ne **pas** utiliser `git commit -m "message"` directement (caractères cassés)
- Écrire le message dans `_m.txt` via `Desktop Commander:write_file` avec `-Encoding UTF8`
- Puis `git commit -F _m.txt; Remove-Item _m.txt`

### Création de fichiers
- `create_file` écrit dans le **conteneur Claude**, PAS sur Windows
- **Utiliser `Desktop Commander:write_file`** pour écrire dans `C:\Users\sbergeron\...`
- `Desktop Commander:edit_block` pour les modifications

### PowerShell séparateurs
- `&&` NE FONCTIONNE PAS en PowerShell — utiliser `;` à la place
- `cd path; command1; command2` OK, `cd path && command1` KO

### NODE_ENV
- `NODE_ENV=production` global par défaut sur la machine
- Avant `npx tsc --noEmit` ou `npm run build` :
```powershell
$env:NODE_ENV='development'
npx tsc --noEmit
```

### Supabase gotchas
- `.single().catch()` chaining = **invalide** en Supabase JS (throw, ne chain pas)
- Inputs React Supabase bloquent l'injection programmatique (utiliser flux .env pour Vercel)
- Subscription realtime : le check `prev.some(x => x.id === newPhoto.id)` évite les doublons si on fait des inserts optimistic locaux (matcher l'id DB dans le replace)

### Bug connu à surveiller
- `npm run build` local échoue sur `/_global-error` (TypeError Cannot read properties of null reading useContext)
- **Pré-existant**, pas causé par les changements de cette session
- TypeScript reste clean (`npx tsc --noEmit` OK)
- Vercel peut reproduire — à surveiller sur le dashboard

---

## 🎨 Design system — palette et conventions (inchangé)

### Couleurs CSS variables
```css
--forest       #0F2D0F   /* Header vert foncé */
--forest-mid   #1A4A1A   /* Bouton "Tout" actif, badge Lodge Principal */
--green        #2D6A2D
--green-light  #4A9A4A
--sand         #F5F0E8   /* Body background */
--sand-dark    #E8E0CC
--stone        #8B7355
--border       #E0D8C8
```

### Palette couleurs catégories (pastilles)
```
all          #6B7280   gris
itineraire   #0D9488   teal
transport    #2563EB   bleu
lodge        #16A34A   vert
permis       #B45309   ambre
equipement   #6B7280   gris
infos        #0EA5E9   bleu clair
meteo        #F59E0B   orange
resto        #E11D48   rose/rouge
liens        #7C3AED   violet
```

### Conventions UX établies
- **Mobile-first** — Linear / Arc Browser aesthetic
- **Pastilles catégorie** : fond couleur plein + SVG blanc 20-36px
- **Boutons Lodge card** : carrés 32×32 vert pâle (bg `rgba(22,163,74,.1)`, border `rgba(22,163,74,.3)`, color `#16A34A`)
- **Boutons header trip** : même style que "Mes trips" pâle (bg `rgba(255,255,255,.1)`, color `rgba(255,255,255,.75)`)
- **Pin activé** (inversion) : fond plein `#16A34A` + icône blanche
- **Liens cliquables LodgeItem** : couleur `#16A34A` (vert Lodge) + flèche externe ↗ à 60% d'opacité
- **Filtres actifs** : fond teinté 15% + bordure 2px (sauf "Tout" = fond plein forest-mid)
- **Empty states** : grosse pastille 64×64 + SVG blanc 32px
- **Toggles** : switch 44×24 avec thumb 20×20 (iOS style)
- **Badges** : pill arrondie 6px, fontSize 9-10px, letterSpacing .04-.06em
- **Eyebrow cards** : 10px bold uppercase, couleur catégorie
- **Titres cards** : 14px bold letter-spacing -.01em

---

## 📋 Commits de cette session (chronologique)

| Commit | Description |
|---|---|
| `95f29e8` | Header épuré + card Lodge avec pin + détails compacts |
| `17073c9` | Crayon unifié, pin en punaise, auto-close scroll, liens cliquables |
| `a1262f7` | Fix retour admin → Mes trips + SW ne redirige plus navs internes |
| `edf8534` | Adresse paste-friendly (textarea + normalisation + ellipsis) |
| `36a7af4` | Nouveau slogan "Un seul lien. Pour tout savoir." |
| `bcbbfc9` | **Optimistic UI partout (Album + Infos + Membres)** |

---

## 🗺️ Arborescence des fichiers clés

```
crew-trips-v2/
├── app/
│   ├── page.tsx                    # Home (logo 🏕 + 2 CTA) — slogan changé ce session
│   ├── mes-trips/page.tsx          # Liste trips par tel (logo 🏕)
│   ├── nouveau/page.tsx            # Création trip (TRIP_ICONS select)
│   ├── rejoindre/page.tsx          # Rejoindre par code
│   ├── admin/page.tsx              # Admin trips — retour → Mes trips depuis ce session
│   ├── album/[token]/page.tsx      # Album public partagé
│   ├── globals.css                 # + @keyframes crew-spin ajouté ce session
│   └── trip/[code]/
│       ├── page.tsx                # Layout 3 tabs (Infos/Chat/Membres)
│       ├── Infos.tsx               # 🎯 MAIN FILE (Lodge + cards + filtres)
│       ├── InfoCardView.tsx        # Card individuelle (edit/delete) — inchangé
│       ├── CardContent.tsx         # Rendering contenu card (liens/images)
│       ├── Album.tsx               # Onglet Chat (photos) — optimistic upload ajouté
│       ├── Membres.tsx             # Onglet Membres + permissions — optimistic partout
│       ├── JoinScreen.tsx          # Écran rejoindre (prénom+tel)
│       ├── created/page.tsx        # Page succès création
│       └── print/page.tsx          # Vue impression
├── lib/
│   ├── types.tsx                   # InfoCard, CATEGORIES, Message, getCatSvg
│   ├── utils.tsx                   # TRIP_ICONS, countdown, getYoutubeId, isPdf
│   ├── svgIcons.tsx                # 26 icônes — `pin` changé en punaise ce session
│   ├── supabase.ts                 # Client Supabase
│   └── downloadAlbum.ts            # ZIP download (candidat dynamic import)
└── public/
    ├── manifest.json               # PWA config
    └── sw.js                       # Service Worker — fix referrer ce session
```

---

## 💡 Pour démarrer la prochaine session

Colle au début de la conversation :

> "Salut Claude, on reprend Crew Trips v2. Lis `C:/Users/sbergeron/crew-trips-v2/BRIEF-NEXT-SESSION.md` pour le contexte complet. On va travailler sur [LE SUJET]."

**Les 3 sujets les plus probables pour la prochaine fois** :

1. **Logo Crew Trips** — Sylvain arrive avec un PNG/WebP du logo, intégration rapide sur Home + Mes trips + created (~20 min)

2. **Perf Album 100 photos** — lightbox memoization, realtime leak check, lazy loading grille. Tester avec un trip qui a beaucoup de photos. Impact visible sur mobile iOS Safari surtout.

3. **Checklist tests manuels** — créer `TESTS-MANUELS.md` avec tous les flows à cocher avant release. Pas de code à changer, juste de la doc.

**Sujets secondaires** (si temps) :
- Bundle size + dynamic imports `jszip` + `react-zoom-pan-pinch`
- RLS Supabase sanity check (créer un trip test avec 2 users)
- Perf Download ZIP mobile (iOS 50MB+)
- Service Worker robustesse (tester offline → online → PWA flows)

---

## 🧪 Pour valider les changements de cette session

**À tester sur `crew-trips-v2.vercel.app`** (après déploiement Vercel ~1-2 min) :

### Header + Card Lodge
- [ ] Plus de bouton "Inviter" dans le header trip
- [ ] Crayon + imprimante au même style pâle que "Mes trips"
- [ ] Card Lodge fermée par défaut
- [ ] Clic sur la card → ouvre avec chevron qui tourne
- [ ] Scroll down → card se ferme automatiquement
- [ ] Pin (punaise) activé → card reste ouverte même au scroll
- [ ] Pin persiste après refresh (localStorage)
- [ ] Badge "Épinglée" apparaît quand pin activé

### Liens cliquables
- [ ] Téléphone est vert avec flèche ↗, tap → appel téléphone
- [ ] Adresse est verte avec flèche ↗, tap → Google Maps
- [ ] Long-press sur adresse tronquée → affiche l'intégrale (tooltip)

### Formulaire Lodge
- [ ] Champ Adresse est un textarea pleine largeur
- [ ] Hint "Colle n'importe quel format" visible en vert
- [ ] Copier-coller depuis Google Maps fonctionne (retours ligne normalisés en virgules)

### Fix navigation admin
- [ ] Mes trips → ouvrir un trip → aller à /admin → retour → revient à Mes trips (pas au trip)
- [ ] Le lien affiche "← Mes trips" (pas "← Accueil")

### Nouveau slogan
- [ ] Page home `/` affiche "Un seul lien. / Pour tout savoir."

### Optimistic UI
- [ ] Ajouter une card info → apparaît instantanément
- [ ] Supprimer une card → disparaît instantanément
- [ ] Toggle permission dans Membres → switch bouge immédiatement
- [ ] Sauvegarder Lodge → sheet ferme tout de suite
- [ ] **Upload photos** : sélectionner 5 photos → envoyer → elles apparaissent immédiatement avec spinner, se "figent" progressivement à mesure que l'upload finit
- [ ] Si désactiver le réseau avant un upload → rollback propre (photos disparaissent + alert)

**Cas limite Service Worker** : si le comportement de navigation admin reste buggé sur un appareil particulier, c'est que l'ancien SW est encore en cache. Solutions :
- Chrome DevTools → Application → Service Workers → Unregister
- Safari iOS : fermer complètement la PWA (swipe up) et relancer
- Firefox : Ctrl+Shift+Delete → Vider cache

---

Bonne session 🌲
