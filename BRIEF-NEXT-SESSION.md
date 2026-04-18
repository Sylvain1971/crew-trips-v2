# Crew Trips v2 — Brief session suivante

> **Dernière session : 18 avril 2026** — refonte icônes SVG iOS Settings complète + cards privées fonctionnelles + polish UX.
> **État : stable, déployé, backupé.** Tout est prêt pour les prochaines features.

---

## 🚀 Démarrage rapide

**Avant de commencer à coder** — vérifier que l'environnement est prêt :

```powershell
cd C:\Users\sbergeron\crew-trips-v2
git status                    # Doit être "working tree clean, up to date with origin/main"
git log -3 --oneline          # Dernier commit : 5201738 (docs session 18 avril)
```

**Stack technique** :
- Next.js 16.2.3 Turbopack + React 19 + TypeScript + Supabase
- Librairies : `react-zoom-pan-pinch`, `jszip`
- Déployé : `crew-trips-v2.vercel.app` (auto-deploy sur push main)
- Supabase : projet `dnvzqsgwqwrvsgfjqqxn`
- Local : `C:\Users\sbergeron\crew-trips-v2` (Windows user `sbergeron`)
- Repo : `Sylvain1971/crew-trips-v2`

**Backup disponible** : branche + tag `backup-2026-04-18` sur GitHub.
Pour revenir à cet état : `git checkout backup-2026-04-18`.

---

## 🎯 Features à faire — priorisées

### 🔴 Priorité 1 — Logo Crew Trips + slogan

**Problème** : l'emoji actuel 🏕 (camping tente) est dans le logo hero de plusieurs pages. Sylvain veut un chalet en rondins dans le même style illustré Apple 3D que les emoji TRIP_ICONS (🎣⛷☀️🏕).

**Décisions en attente** :
- **Quel type de visuel ?**
  * PNG/WebP custom dans `/public/` (chalet illustré 3D)
  * Fluent Emoji 3D Microsoft (open-source)
  * Emoji natif 🛖 (hut) — plus simple mais style différent
  * Les SVG custom ont été **rejetés** par Sylvain (pas le même style que les emoji 3D)

**À faire en même temps — slogan** :
- `app/page.tsx` lignes ~11-12
- **Actuel** : `Tout ce que ton groupe a besoin de savoir.<br/>Un seul lien.`
- **Nouveau** : `Un seul lien.<br/>Pour tout savoir.`

**Fichiers à modifier** :
- `app/page.tsx` — logo hero ligne 8, slogan ligne 11-12
- `app/rejoindre/page.tsx` — (logo remplacé dernièrement par SVG link, laisser tel quel)
- `app/mes-trips/page.tsx` — logo hero ligne ~110 (🏕 aussi présent)
- `app/trip/[code]/created/page.tsx` — possiblement

### 🟡 Priorité 2 — Cohérence visuelle en suspens

- **Harmoniser les crayons "Modifier"** dans les cards (`InfoCardView.tsx` ligne ~21, variable `SVG.edit`) : actuellement en outline, pourraient passer en style plein iOS Settings pour cohérence totale (Option C discutée mais Sylvain avait choisi B à ce moment)
- **3 boutons header trip** (crayon, Inviter, imprimante) : existants, fonctionnent, mais viennent de conversations précédentes. À revoir pour cohérence visuelle si Sylvain le souhaite
- **InstallBanner.tsx** : 1 emoji mineur restant (basse priorité)

### 🟢 Priorité 3 — Brief audit stabilité pré-existant

Voir `BRIEF-*.md` du 17 avril pour détails. 7 axes :

1. **Audit optimistic UI** — Album.tsx `deleteSelected` / `uploadAllPending`, Membres toggles + `regenerateShareToken`, Infos CRUD
2. **Perf Album N=100 photos** — lightbox re-mount, realtime leak, memoization grille, lazy loading
3. **Perf Download ZIP mobile** — iOS Safari 50MB+, parallélisation p-limit, progress feedback
4. **Bundle size** — `.next/static/chunks/`, dynamic imports `jszip` et `react-zoom-pan-pinch`
5. **RLS Supabase sanity check** — validé phase B, à revérifier
6. **Service Worker** — robustesse cache PWA
7. **Checklist tests manuels** — créer une grille de tests avant release

**Bug connu à surveiller** :
- `npm run build` local échoue sur `/_global-error` (TypeError Cannot read properties of null reading useContext)
- Pré-existant avant toute modif récente
- TypeScript reste clean (`npx tsc --noEmit` OK)
- Vercel peut reproduire — **à surveiller sur le dashboard**

---

## 📦 Ce qui est en place (contexte pour reprendre)

### Système d'icônes SVG iOS Settings

**Helper central** : `lib/svgIcons.tsx` — 26 icônes en fill=currentColor :
`link, chat, camera, clipboard, refresh, lock, settings, trash, alert, chevronDown,
hourglass, pin, calendar, star, check, plane, key, phone, users, fileText, image,
attachment, edit, close, plus`.

**Usage** : `<SvgIcon name="lock" size={18} />`

**Icônes catégories** : `lib/types.tsx` — fonction `getCatSvg(id, size, tripType)` :
- Variantes Lodge par tripType (cabin/hôtel/tente/palmier)
- Variantes Permis par tripType (carte ID/ticket/cadenas)
- 10 catégories colorées (all/itineraire/transport/lodge/permis/equipement/infos/meteo/resto/liens)

### Cards privées — fonctionnelles

**DB Supabase** (migration déjà exécutée) :
```sql
ALTER TABLE infos
  ADD COLUMN is_prive boolean DEFAULT false,
  ADD COLUMN auteur_id uuid REFERENCES membres(id) ON DELETE SET NULL;
```

**Frontend** :
- Types `InfoCard` dans `lib/types.tsx` : `is_prive?: boolean`, `auteur_id?: string`
- Filtre dans `Infos.tsx` : `cards.filter(c => !c.is_prive || c.auteur_id === membre.id)`
- Toggle "Carte privée" dans les 2 sheets (Ajouter + Modifier)
- Badge "Privée" sur les cards privées (visible seulement par l'auteur)

**Sécurité** : filtrage frontend uniquement (pas de RLS car l'auth Crew Trips
ne passe pas par Supabase Auth). Acceptable pour groupe d'amis, **inadéquat
pour données sensibles**.

### UX récents

- Countdown "X jours avant le départ" : aligné à gauche sous la date, sans pastille
- Badge Lodge header : "Principal" vert clair
- Bouton Modifier Lodge : icône seule 32×32 teintée verte (3 états : plus/edit/close)
- Badge trip mes-trips : "Admin" (court) au lieu de "Administrateur" (trop long)

---

## ⚠️ Règles d'environnement — à connaître absolument

### Paths Windows avec brackets `[code]`
Les crochets cassent PowerShell. **Toujours utiliser `-LiteralPath`** :
```powershell
Get-Content -LiteralPath "app\trip\[code]\Infos.tsx"
```
`Desktop Commander:edit_block` gère automatiquement les brackets.

### Git commits avec accents/emoji
- Ne **pas** utiliser `git commit -m "message"` directement (caractères cassés)
- Écrire le message dans `_m.txt` via `Desktop Commander:write_file`
- Puis `git commit -F _m.txt`

### Création de fichiers
- `create_file` écrit dans le **conteneur Claude**, PAS sur Windows
- **Utiliser `Desktop Commander:write_file`** pour écrire dans `C:\Users\sbergeron\...`
- `Desktop Commander:edit_block` pour les modifications

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

---

## 🎨 Design system — palette et conventions

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
- **Pastilles** : fond couleur plein + SVG blanc 20-36px (selon contexte)
- **Filtres actifs** : fond teinté 15% + bordure 2px (sauf "Tout" = fond plein forest-mid)
- **Empty states** : grosse pastille 64×64 + SVG blanc 32px
- **Toggles** : switch 44×24 avec thumb 20×20 (iOS style)
- **Badges** : pill arrondie 6px, fontSize 9-10px, letterSpacing .04-.06em
- **Eyebrow cards** : 10px bold uppercase, couleur catégorie
- **Titres cards** : 14px bold letter-spacing -.01em

---

## 📋 Commits de la dernière session (chronologique)

| Commit | Description |
|---|---|
| `48dcf48` | Refonte iOS Settings (fills pleins, pastilles colorées) |
| `009539d` | Round 2 emoji → SVG (Membres/Album/Infos/nouveau/mes-trips) |
| `3b65b5a` | Round 3 + fix "Tout" actif vert + badge "Principal" Lodge |
| `4bc5bb4` | Empty states Infos et Album passent en SVG pastille |
| `c1d97e3` | Nettoyage final + retrait sablier countdown |
| `d4c6db3` | **Cards privées** (toggle + filtre + badge) |
| `f8fb9f3` | Countdown à gauche + bouton Modifier Lodge icône + "Administrateur" |
| `f9cf054` | Raccourci "Administrateur" → "Admin" sur mes-trips |
| `b676d20` | Toggle "Carte privée" agrandi |
| `5201738` | Docs session 18 avril |

---

## 🗺️ Arborescence des fichiers clés

```
crew-trips-v2/
├── app/
│   ├── page.tsx                    # Home (logo 🏕 + 2 CTA)
│   ├── mes-trips/page.tsx          # Liste trips par tel (logo 🏕)
│   ├── nouveau/page.tsx            # Création trip (TRIP_ICONS select)
│   ├── rejoindre/page.tsx          # Rejoindre par code (SVG link)
│   ├── admin/page.tsx              # Admin trips
│   ├── album/[token]/page.tsx      # Album public partagé
│   └── trip/[code]/
│       ├── page.tsx                # Layout 3 tabs (Infos/Chat/Membres)
│       ├── Infos.tsx               # 🎯 MAIN FILE (Lodge + cards + filtres)
│       ├── InfoCardView.tsx        # Card individuelle (edit/delete)
│       ├── CardContent.tsx         # Rendering contenu card (liens/images)
│       ├── Album.tsx               # Onglet Chat (photos)
│       ├── Membres.tsx             # Onglet Membres + permissions admin
│       ├── JoinScreen.tsx          # Écran rejoindre (prénom+tel)
│       ├── created/page.tsx        # Page succès création
│       └── print/page.tsx          # Vue impression
├── lib/
│   ├── types.tsx                   # InfoCard, CATEGORIES, getCatSvg, getCatLabel
│   ├── utils.tsx                   # TRIP_ICONS, countdown, getYoutubeId, isPdf
│   ├── svgIcons.tsx                # 26 icônes SvgIcon helper
│   ├── supabase.ts                 # Client Supabase
│   └── downloadAlbum.ts            # ZIP download
└── public/
    └── manifest.json               # PWA config
```

---

## 💡 Pour démarrer la prochaine session

Colle au début de la conversation :

> "Salut Claude, on reprend Crew Trips v2. Lis `C:/Users/sbergeron/crew-trips-v2/BRIEF-NEXT-SESSION.md` pour le contexte complet. On va travailler sur [LE SUJET]."

Les 3 sujets probables :
1. **Logo + slogan** (priorité 1)
2. **Audit stabilité** (brief pré-existant)
3. **Nouvelle feature** à définir

Bonne session 🌲
