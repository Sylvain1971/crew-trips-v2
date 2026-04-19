# Crew Trips v2 — Brief session suivante

> **Dernière session : 18 avril 2026 (soirée marathon)** — 15 commits poussés + cleanup DB.
> **Bugs critiques fixés (cards privées) + UX (zoom parasite, lightbox) + Logo hero complet + Fraunces serif + signature marque unifiée.**
> **État : stable, déployé, TypeScript clean, build Next OK, working tree clean.**

---

## 🎯 PROCHAINE SESSION — 3 priorités

### 🔴 PRIORITÉ 1 — Icône PWA écran d'accueil (~20 min)

**Problème** : le logo-hero (silhouettes + montagne brumeuse) est magnifique à 180px sur la home, mais devient bouillie à 60×60 sur le home screen iOS quand l'app est installée.

**À faire** : créer une icône PWA dédiée, simplifiée pour rester lisible à petite taille.

**Options de design à explorer** :
- Monogramme "CT" en Fraunces serif blanc sur fond forest `#0F2D0F`
- Juste la montagne + halo lunaire du logo-hero (sans les silhouettes)
- Silhouettes très simplifiées (2-3 persos au lieu de 6)
- Symbole abstrait style Apple/Notion (initiales stylisées dans une forme organique)

Sylvain va probablement demander à ChatGPT une version spécifique "icône app 512×512". Pour bien lui cadrer la commande, prompt suggéré :

```
Crée-moi un icône d'app mobile 512×512 pour Crew Trips.
Contraintes :
- Fond forest #0F2D0F pleine couleur (pas transparent — iOS ignore la transparence)
- Sujet centré occupant 60-70% du cadre
- Lisible et reconnaissable même réduit à 60×60 pixels
- Cohérent visuellement avec mon logo-hero actuel (illustration éditoriale
  avec montagne brumeuse et halo lunaire, palette vert sépia) mais SIMPLIFIÉ
- Maximum 3 éléments visuels (ex: montagne stylisée + lune/soleil + sol)
- Style "silhouette éditoriale" comme mon logo, pas cartoon flat
```

**Fichiers à regénérer après validation** (script Sharp déjà écrit dans une session précédente, refaire pareil) :
- `public/apple-touch-icon.png` (180×180 iOS, fond forest plein)
- `public/icon-192.png` (192×192 Android PWA)
- `public/icon-512.png` (512×512 Android PWA + splash)
- `public/icon-maskable-512.png` (avec padding safe zone 15% pour Android adaptive)
- `public/favicon.ico` + `public/favicon-32.png`

Le `public/manifest.json` référence déjà les bons chemins, pas à modifier.

### 🟡 PRIORITÉ 2 — Icônes types de trip — TRIP_ICONS refactor (~45-60 min)

**État actuel** : `lib/utils.ts` définit `TRIP_ICONS` avec des emojis `🎣⛷🗻🥾🚵🫎🧘☀️🏕`. Utilisés à 5 endroits :
- `app/nouveau/page.tsx` — select type + preview header
- `app/trip/[code]/page.tsx` — header small
- `app/trip/[code]/JoinScreen.tsx` — branding type
- `app/trip/[code]/created/page.tsx` — page succès
- `app/mes-trips/page.tsx` — liste trips

**Blocage à résoudre** : Sylvain a essayé 2 fois de faire générer les 9 icônes par ChatGPT, résultat désastreux (ChatGPT fusionne tout en une image unique au lieu de 9 fichiers séparés). Prompt ultra-strict à utiliser :

```
Je veux 9 icônes SVG pour une app web React.
INSTRUCTION CRITIQUE : Pas d'image. Pas de DALL-E. Écris du CODE SVG BRUT
dans 9 code blocks markdown distincts.

Format obligatoire pour chaque icône :
```svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none"
     stroke="currentColor" stroke-width="2" stroke-linecap="round"
     stroke-linejoin="round" width="24" height="24">
  <!-- paths ici -->
</svg>
```

Style : viewBox 24x24, stroke currentColor, width 2px, style Lucide Icons.

Les 9 icônes :
1. peche — canne à pêche avec ligne et leurre
2. ski — deux skis croisés en X avec bâtons
3. motoneige — silhouette de motoneige vue de côté
4. hike — chaussure de randonnée vue de profil
5. velo — VTT vue de côté
6. chasse — bois de cerf (panache)
7. yoga — personne en position lotus vue de face
8. soleil — soleil couchant sur horizon
9. autre — boussole (cercle + aiguille)

Livre en 9 code blocks ```svg séparés.
```

**Plan d'intégration** :
1. Créer `lib/tripIcons.tsx` avec 9 composants React `<TripIcon type="peche" />`
2. Transformer `TRIP_ICONS` : `Record<string, string>` → `Record<string, React.ComponentType>`
3. Adapter les 5 call sites
4. Cas particulier du `<select>` HTML dans `/nouveau` : HTML ne supporte pas SVG dans `<option>`. Soit garder les emojis dans le select et SVG ailleurs, soit refaire custom dropdown (chantier plus gros — probablement garder emojis pour cette session)

### 🟢 PRIORITÉ 3 — Finaliser signature typographique sur les autres pages (~20 min)

L'harmonisation Fraunces serif + slogan uppercase letter-spacé a été appliquée UNIQUEMENT sur `/` et `/mes-trips`. Pages restantes avec ancien style :
- `app/nouveau/page.tsx` — header "Crew Trips" + sous-titre "Nouveau trip"
- `app/trip/[code]/JoinScreen.tsx` — branding "Crew Trips"
- `app/trip/[code]/created/page.tsx` — page succès

**Recette à appliquer** (cohérente avec mes-trips/page.tsx) :
```tsx
<div style={{marginBottom: -10}}>
  <Image src="/logo-hero.webp" alt="Crew Trips" width={84} height={84} />
</div>
<div style={{
  fontFamily: 'var(--font-brand), Georgia, serif',
  fontWeight: 700, fontSize: 22, color: '#fff',
  letterSpacing: '-.02em', lineHeight: 1, marginBottom: 6
}}>Crew Trips</div>
<div style={{
  fontSize: 9, color: 'rgba(255,255,255,.5)',
  letterSpacing: '.22em', textTransform: 'uppercase',
  fontWeight: 500
}}>XXX</div>
```

Remplacer "XXX" par : "NOUVEAU TRIP" / "REJOIGNEZ LE TRIP" / "TRIP CRÉÉ" selon la page.

---

## 🚀 Démarrage rapide

```powershell
cd C:\Users\sbergeron\crew-trips-v2
git status                    # Doit être clean, synchro origin/main
git log -5 --oneline          # Dernier commit : 9e56d4e (UX remonte signature)
```

---

## 📦 Stack technique

- **Next.js 16.2.3** Turbopack + React 19.2.4 + TypeScript 5.9.3 + Supabase 2.103
- **Librairies** : `react-zoom-pan-pinch` 4.0.3, `jszip` 3.10.1, `browser-image-compression` 2.0.2, `sharp` (via Next/Image)
- **Police de marque** : Fraunces serif 700 via `next/font/google`, exposée via CSS var `--font-brand`
- **browserslist moderne** (Chrome 93+, Safari 15+, FF 93+, Edge 93+)
- **next.config.ts** : AVIF/WebP images, optimizePackageImports, remotePatterns Supabase/YouTube
- **Déployé** : `crew-trips-v2.vercel.app` (auto-deploy sur push main)
- **Supabase** : projet `dnvzqsgwqwrvsgfjqqxn`
- **Local** : `C:\Users\sbergeron\crew-trips-v2` (Windows user `sbergeron`)
- **Repo** : `Sylvain1971/crew-trips-v2`
- **Sylvain membre.id dans trip Winter Steelhead** : `cdb50338-1b42-4a4a-b5c5-5a6f8201176c`

---

## 🎨 Design system actualisé

### Couleurs CSS variables
```css
--forest       #0F2D0F   /* Header vert foncé + home bg */
--forest-mid   #1A4A1A   /* Bouton "Tout" actif, badge Lodge Principal */
--green        #2D6A2D
--green-light  #4A9A4A
--sand         #F5F0E8   /* Body background */
--sand-dark    #E8E0CC
--stone        #8B7355
--border       #E0D8C8
```

### Palette catégories
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

### Signature marque (recette reproductible)

**Version HERO** (page `/` home, logo grand) :
```tsx
<Image src="/logo-hero.webp" width={180} height={180} priority
  style={{marginBottom: -18}} />
<h1 style={{
  fontFamily: 'var(--font-brand), Georgia, serif',
  fontSize: 32, fontWeight: 700,
  letterSpacing: '-.02em', lineHeight: 1,
  color: '#fff', margin: '0 0 10px'
}}>Crew Trips</h1>
<p style={{
  fontSize: 9, color: 'rgba(255,255,255,.5)',
  letterSpacing: '.22em', textTransform: 'uppercase',
  fontWeight: 500, margin: 0
}}>Un seul lien · Pour tout savoir</p>
```

**Version COMPACTE** (headers des autres pages, logo petit) :
```tsx
<Image src="/logo-hero.webp" width={84} height={84}
  style={{marginBottom: -10}} />
<div style={{
  fontFamily: 'var(--font-brand), Georgia, serif',
  fontSize: 22, fontWeight: 700,
  letterSpacing: '-.02em', lineHeight: 1, marginBottom: 6,
  color: '#fff'
}}>Crew Trips</div>
<div style={{
  fontSize: 9, color: 'rgba(255,255,255,.5)',
  letterSpacing: '.22em', textTransform: 'uppercase',
  fontWeight: 500
}}>[LABEL PAGE]</div>
```

### Proportions clés

| Element | Home hero | Headers compacts |
|---|---|---|
| Logo | 180px | 84px (×0.47) |
| Logo marginBottom | -18 | -10 |
| "Crew Trips" font-size | 32 | 22 |
| Slogan/label letter-spacing | .22em | .22em |
| Slogan/label font-size | 9 | 9 |

### Layout home actuel (validé par Sylvain)
- `padding: '56px 20px 40px'` (signature ancrée à 56px du haut, pas centrage mathématique)
- `marginBottom: 80` sur la signature → gros air avant les boutons
- `position: absolute bottom: 24` pour le footer "crew-trips-v2.vercel.app"
- Bouton admin `position: fixed bottom: 24 right: 20`

### Conventions UX
- Mobile-first, Linear / Arc Browser aesthetic
- Hitbox minimum 44×44 Apple HIG (80×80 pour flèches lightbox)
- **Viewport bloqué** : `userScalable: false, maximumScale: 1` (évite zoom parasite, compromis A11y accepté)
- Service Worker PWA : cache agressif, bumper la version en commentaire en haut de `public/sw.js` quand modifié

---

## 🗺️ Arborescence des fichiers clés

```
crew-trips-v2/
├── app/
│   ├── layout.tsx                  # Fraunces via next/font, viewport bloqué
│   ├── page.tsx                    # Home : logo 180px + Fraunces 32 + slogan UPPERCASE
│   ├── mes-trips/page.tsx          # Logo 84 + Fraunces 22 + "MES TRIPS" UPPERCASE
│   ├── nouveau/page.tsx            # PAS ENCORE harmonisé (P3)
│   ├── rejoindre/page.tsx
│   ├── admin/page.tsx
│   ├── album/[token]/page.tsx
│   ├── globals.css
│   └── trip/[code]/
│       ├── page.tsx                # Layout 3 tabs (Infos/Chat/Membres)
│       ├── Infos.tsx               # MAIN FILE cards + lodge + filtres
│       ├── InfoCardView.tsx
│       ├── CardContent.tsx
│       ├── Album.tsx               # Onglet Chat (photos) - PhotoTile memo, Lightbox dynamic
│       ├── Lightbox.tsx            # Lightbox dynamique + prefetch N±1 + clavier
│       ├── Membres.tsx             # Permissions + invite + nom editable
│       ├── JoinScreen.tsx          # PAS ENCORE harmonisé (P3)
│       ├── created/page.tsx        # PAS ENCORE harmonisé (P3)
│       └── print/page.tsx
├── lib/
│   ├── types.tsx                   # InfoCard, CATEGORIES, getCatSvg
│   ├── utils.tsx                   # TRIP_ICONS emoji (À REFACTORER en SVG - P2)
│   ├── svgIcons.tsx                # 26 icônes UI
│   ├── supabase.ts
│   ├── downloadAlbum.ts            # ZIP dynamic import jszip
│   ├── shareFiles.ts               # Web Share API
│   └── imageCompression.ts
├── public/
│   ├── logo-hero.png               # 200 KB, 1024x1024, fond transparent
│   ├── logo-hero.webp              # 124 KB (servi par next/image)
│   ├── favicon.ico + favicon-32.png
│   ├── icon-192.png + icon-512.png # À REGÉNÉRER (P1)
│   ├── icon-maskable-512.png       # À REGÉNÉRER (P1)
│   ├── apple-touch-icon.png        # À REGÉNÉRER (P1)
│   ├── manifest.json
│   └── sw.js                       # Service Worker
├── next.config.ts                  # AVIF/WebP + optimizePackageImports + remotePatterns
├── package.json                    # browserslist moderne
├── TESTS-MANUELS.md                # 273 lignes, 14 sections
└── BRIEF-NEXT-SESSION.md           # Ce fichier
```

---

## ✅ Ce qui a été fait cette session (18 avril 2026 soirée)

### Bugs critiques
- `48a1633` Fix cards privées disparaissent/réapparaissent (SELECT incomplet + optimistic)
- `c5026ae` Fix adopte auteur_id sur cards orphelines (pre-migration)
- `6e3c74f` Fix bloque zoom parasite double-tap + pinch (compromis A11y)
- **SQL cleanup** : 3 cards orphelines du trip Winter Steelhead récupérées avec membre.id Sylvain

### UX & Features
- `543e755` Lightbox prefetch N±1 + Escape + flèches clavier desktop
- `2e474ad` Docs TESTS-MANUELS.md (273 lignes, 14 sections)

### Logo & Branding
- `7dd3d76` Assets logo-hero PNG + WebP
- `2ea383d` Intégration logo sur home + mes-trips + assets PWA complets
- `c3e8059` Agrandissement logo 120→180px home, 56→84px mes-trips
- `8a611ff` Police Fraunces serif via next/font/google
- `3f44f7e` Retrait filet blanc (erreur d'attribution)
- `d2b05a7` Rééquilibre titre 40→32px + harmonisation mes-trips
- `b86af2b` Layout hero (tentative centrage)
- `6b5c631` marginBottom négatif pour coller logo↔titre (absorbe halo)
- `9003c90` Padding symétrique + update brief
- `9e56d4e` Ancrage signature haut (56px padding) + 80px air avant boutons ← **DERNIER COMMIT**

---

## ⚠️ Règles d'environnement — à connaître absolument

### Paths Windows avec brackets `[code]`
```powershell
Get-Content -LiteralPath "app\trip\[code]\Infos.tsx"
git add app/trip/`[code`]/Album.tsx  # backtick-escape obligatoire pour git
```
`Desktop Commander:edit_block` gère automatiquement les brackets.

### Git commits avec accents/emoji
Écrire le message dans `_m.txt` via `Desktop Commander:write_file`, puis `git commit -F _m.txt; Remove-Item _m.txt`.

### PowerShell
- `&&` ne fonctionne pas → utiliser `;`
- `$env:VAR` pas `$VAR`
- Variables `$` mangées par le shell parent → passer par un script `.ps1` file

### NODE_ENV
Sylvain a `NODE_ENV=production` global sur la machine.
- Avant `npm run build` : `Remove-Item Env:\NODE_ENV`
- Avant `npx tsc --noEmit` : `$env:NODE_ENV='development'`

### Supabase gotchas
- `.single().catch()` chaining = **invalide** (throw, ne chain pas)
- Subscription realtime : check `prev.some(x => x.id === newPhoto.id)` pour éviter doublons optimistic
- RLS bloque l'accès aux cards privées où `auteur_id ≠ membre.id` (bien)
- **Clé ANON uniquement disponible dans .env.local**, pas de SERVICE_ROLE_KEY → écritures DB passent par UI ou SQL Editor Supabase
- Supabase project : `dnvzqsgwqwrvsgfjqqxn`

### Création de fichiers
- `create_file` de Claude écrit dans le **conteneur Claude**, PAS sur Windows
- **Utiliser `Desktop Commander:write_file`** pour écrire dans `C:\Users\sbergeron\...`
- `Desktop Commander:edit_block` pour les modifications

---

## 🧪 Tests à faire avant release

Voir `TESTS-MANUELS.md` racine du repo — 14 sections couvrant tous les flows critiques. Utiliser le "regression quick-check" (section 14) pour validation express ~5 min avant merge.

---

## 💡 Pour démarrer la prochaine conversation

Colle EXACTEMENT ce prompt :

> "Salut Claude, on reprend Crew Trips v2. Lis `C:/Users/sbergeron/crew-trips-v2/BRIEF-NEXT-SESSION.md` pour le contexte complet. On va travailler sur [SUJET]."

**Sujets probables** :

1. **🔴 Icône PWA écran d'accueil** — simplifier le logo pour 60-80px, regénérer les 5 assets (favicon, icon-192, icon-512, maskable, apple-touch-icon)
2. **🟡 Refactor TRIP_ICONS en SVG** — Sylvain arrive avec 9 SVG de ChatGPT, on crée `lib/tripIcons.tsx` et on adapte 5 call sites
3. **🟢 Finaliser signature typographique** sur `/nouveau`, `JoinScreen.tsx`, `/created` (appliquer la recette Fraunces compacte)

Bonne session 🌲
