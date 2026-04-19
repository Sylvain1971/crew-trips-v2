# Tests manuels Crew Trips v2

Checklist à parcourir avant chaque release sur prod (`crew-trips-v2.vercel.app`).

**Temps estimé** : ~20 min pour un passage complet.
**Devices conseillés** : 1 iPhone (Safari + PWA installée) + 1 desktop Chrome.

---

## 🧪 Setup test

Avant de démarrer, prépare :
- [ ] 2 users distincts (créateur + membre invité) dans un trip test
- [ ] Au moins 1 trip avec quelques cards déjà créées
- [ ] Quelques photos dans l'album (au moins 10)
- [ ] Au moins 1 card privée existante de chaque user
- [ ] Au moins 1 fichier PDF uploadé dans une card

---

## 1. Création & jointure de trip

### Créer un nouveau trip (`/nouveau`)
- [ ] Accès `/nouveau` via code créateur fonctionne
- [ ] Sélection type de trip (pêche, ski, hike, etc.) change l'icône et les labels
- [ ] Nom, destination, dates sauvegardés correctement
- [ ] Redirection vers `/trip/{code}/created` après création
- [ ] Code d'invitation affiché et copiable
- [ ] Cloner un trip existant → cards/lodge/whatsapp recopiés (pas les membres)

### Rejoindre un trip (`/rejoindre`)
- [ ] Code valide → écran JoinScreen avec nom/prénom
- [ ] Code invalide → message d'erreur clair
- [ ] Après join, atterrissage sur l'onglet Infos du trip
- [ ] Nouveau membre apparaît dans l'onglet Membres côté créateur

---

## 2. Onglet Infos — Lodge

- [ ] Header Lodge toujours visible en sticky
- [ ] Tap sur header → expand/collapse
- [ ] Épingler → reste ouvert au scroll + persiste après reload
- [ ] Désépingler → referme au scroll down
- [ ] Ajouter infos Lodge complètes (nom, adresse, tel, wifi, arrivée, départ)
- [ ] Adresse multi-ligne → normalisée à la sauvegarde (virgules, 1 ligne)
- [ ] Lien adresse → Google Maps s'ouvre dans nouvel onglet
- [ ] Lien tel → déclenche l'appel sur mobile
- [ ] Modifier Lodge → optimistic (sheet ferme immédiatement)
- [ ] Les labels changent selon le type de trip (Hôtel/Refuge/Resort/Lodge)

---

## 3. Onglet Infos — Cards publiques

### Ajouter
- [ ] Tap FAB + → sheet s'ouvre
- [ ] Case vide en haut-gauche de la grille catégories
- [ ] Sélection catégorie → bordure + bg colorés
- [ ] Placeholders du titre/détails changent selon la catégorie
- [ ] Upload PDF → apparaît dans la sheet avec taille
- [ ] Upload image → apparaît dans la sheet
- [ ] Card apparaît **immédiatement** après tap "Ajouter" (optimistic)
- [ ] Tap "Ajouter" avec erreur réseau → rollback + sheet ré-ouvre avec valeurs

### Modifier
- [ ] Tap crayon sur card → sheet pré-remplie
- [ ] Changer catégorie → chip active change
- [ ] Remplacer fichier → ancien fichier disparaît, nouveau s'affiche
- [ ] Supprimer fichier → card sans fichier
- [ ] Sauvegarder → optimistic (sheet ferme, card mise à jour)

### Supprimer
- [ ] Tap poubelle → confirm native du navigateur
- [ ] Annuler → card reste
- [ ] Confirmer → card disparaît **immédiatement**
- [ ] Erreur réseau → card ré-apparaît à sa position

---

## 4. Cards privées (critique après fix `48a1633`)

- [ ] **Créer une nouvelle card privée** → visible chez toi uniquement
- [ ] Un autre membre connecté ne la voit PAS dans son trip
- [ ] **Modifier une card existante et la passer en privée** → reste visible chez toi **sans clignotement**
- [ ] Repasser une card privée en publique → devient visible chez les autres
- [ ] Badge/couleur privée (ambre) visible sur la card dans la liste
- [ ] Filtres catégories → cards privées des autres restent cachées

---

## 5. Filtres & navigation

- [ ] Filtre "Tout" (fond `--forest-mid`) → toutes cards visibles, triées par CAT_ORDER
- [ ] Filtre par catégorie → seulement les cards de cette catégorie
- [ ] En mode "Tout", tap sur une card → navigation vers filtre + scroll auto
- [ ] Bouton Retour navigateur → remet le filtre précédent
- [ ] Badges vide avec icône catégorie si aucune card


---

## 6. PDF viewer

- [ ] Tap sur fichier PDF d'une card — **desktop** : viewer plein écran avec header
- [ ] Tap sur fichier PDF d'une card — **mobile** : ouverture onglet externe
- [ ] Bouton "Retour" viewer desktop → ferme et remet le filtre précédent
- [ ] Bouton "Ouvrir" viewer desktop → ouvre le PDF dans un nouvel onglet

---

## 7. Onglet Chat — Album photos

### Upload
- [ ] Tap bouton upload → sélection fichiers
- [ ] Upload 1 photo → preview optimistic avec spinner
- [ ] Upload batch (5+ photos d'un coup) → toutes apparaissent immédiatement
- [ ] Image compressée automatiquement (vérif taille < original)
- [ ] Erreur réseau → photo disparaît avec message
- [ ] Pas de leak blob URL (DevTools Memory snapshot avant/après)

### Grille
- [ ] Scroll fluide même à 100+ photos
- [ ] Layout responsive (3 colonnes mobile, plus desktop)
- [ ] Tap sur une photo → ouvre lightbox

### Lightbox
- [ ] Première ouverture → léger délai (chargement dynamic import react-zoom-pan-pinch)
- [ ] Swipe prev/next → fluide, **pas de re-mount** (photo précédente ne recharge pas)
- [ ] Pinch to zoom jusqu'à 4x → pas de pixelisation visible
- [ ] Tap juste à côté des boutons ‹ › → navigation déclenchée (pas pan)
- [ ] Bouton X → ferme la lightbox
- [ ] **[À TESTER APRÈS PRIORITÉ 3]** Touche Escape sur desktop → ferme la lightbox

### Mode sélection
- [ ] Long press sur photo → mode sélection activé
- [ ] Tap additionnel → ajoute/retire sélection
- [ ] Barre du bas affiche "N sélectionnées"
- [ ] Bouton Partager apparaît dès 1 photo sélectionnée
- [ ] 1 photo sélectionnée → sheet native directe
- [ ] 2+ photos → sheet de choix "Toutes ensemble / Une par une"
- [ ] AirDrop batch fonctionne
- [ ] iMessage une-par-une fonctionne
- [ ] Bouton Supprimer sélection → confirm + suppression

### Download ZIP
- [ ] Bouton Télécharger tout (desktop) → lance le download
- [ ] Fichier .zip généré avec toutes les photos à leur taille originale
- [ ] Si > 50MB sur iOS Safari → comportement acceptable (fallback ou warning)

---

## 8. Onglet Membres

- [ ] Liste des membres avec avatar/prénom
- [ ] Badge "Créateur" sur le créateur
- [ ] Bouton Invite proéminent en haut
- [ ] Copie du code d'invitation fonctionne (confirmation visuelle 2.5s)
- [ ] **Créateur seulement** : toggle permissions `can_edit` / `can_delete`
- [ ] Toggle optimistic → sheet ferme, changement immédiat
- [ ] **Créateur seulement** : bouton "Exclure membre" → confirm + suppression
- [ ] Membre exclu → retour shares à AMM reserve (si applicable)
- [ ] **Créateur seulement** : supprimer le trip → double confirmation avec nom à saisir

---

## 9. Permissions (RLS sanity check)

Avec 2 comptes dans le même trip (user A créateur, user B membre) :

- [ ] User B **sans** `can_edit` → bouton crayon caché sur cards de A
- [ ] User B **avec** `can_edit` → peut modifier cards publiques de A
- [ ] User B **sans** `can_delete` → bouton poubelle caché
- [ ] User B **avec** `can_delete` → peut supprimer cards publiques de A
- [ ] User B ne voit **jamais** les cards privées de A, même avec `can_edit` activé
- [ ] User B ne peut pas modifier le Lodge (créateur uniquement)
- [ ] User B ne peut pas modifier le trip lui-même (créateur uniquement)
- [ ] User B ne peut pas changer les permissions des autres membres


---

## 10. PWA

### Installation iOS Safari
- [ ] Menu partage → "Sur l'écran d'accueil" → icône ajoutée
- [ ] Icône et nom app corrects (Crew Trips)
- [ ] Lancement depuis home screen → mode standalone (pas de barre Safari)
- [ ] Splash screen cohérent avec la palette forest

### Installation Android Chrome
- [ ] Bouton "Installer" disponible (InstallBanner)
- [ ] App ajoutée au launcher
- [ ] Lancement plein écran

### Service Worker
- [ ] Première ouverture PWA → redirige vers `/trip/{lastTripCode}` si en cache
- [ ] Navigation interne vers `/` → laisse passer (ne redirige pas)
- [ ] Ouverture PWA → cache `last-trip-code` mis à jour
- [ ] Après mise à jour SW → prompt/refresh propre (pas de version zombie)

---

## 11. Accessibilité

- [ ] Zoom pinch sur la home `/` → fonctionne (avant bloqué avec userScalable=false)
- [ ] Zoom pinch sur page de trip → fonctionne jusqu'à 5x
- [ ] Bouton ⚙ admin en bas à droite de la home → accessible au lecteur d'écran (aria-label)
- [ ] Contraste textes lisibles sur fond forest (especially sous-textes)
- [ ] Navigation clavier desktop : Tab cycle logique
- [ ] Bouton Partager album → aria-label dynamique cohérent (N photos)

---

## 12. Partage d'album externe (token public)

- [ ] Générer un lien de partage depuis un trip
- [ ] Ouvrir le lien dans un navigateur privé (non connecté)
- [ ] Page `/album/{token}` affiche les photos
- [ ] Aucune card privée n'apparaît
- [ ] Pas de bouton d'édition/suppression (read-only)
- [ ] Révoquer le token → lien ne fonctionne plus

---

## 13. Build & déploiement

Avant de push sur `main` :

```powershell
cd C:\Users\sbergeron\crew-trips-v2
Remove-Item Env:\NODE_ENV -ErrorAction SilentlyContinue
$env:NODE_ENV='development'
npx tsc --noEmit
```
- [ ] TypeScript exit code 0 (aucune erreur)
- [ ] `npm run build` local passe (3-5s)
- [ ] Vercel auto-deploy vert (~1-2 min après push)
- [ ] Lighthouse prod mobile : Perf ≥ 90, A11y 100, BP 100, SEO 100

---

## 14. Regression quick-check (à lancer après chaque gros refactor)

Pour une vérif express (~5 min) avant un merge :
- [ ] Créer 1 trip, le rejoindre avec 2e compte
- [ ] Ajouter 1 card publique + 1 card privée
- [ ] Upload 2 photos
- [ ] Swipe lightbox prev/next
- [ ] Mode sélection + partager 1 photo
- [ ] Modifier le Lodge
- [ ] Toggle permission puis modifier une card cross-user
- [ ] Lighthouse quick audit sur `/trip/{code}`

---

## 📝 Notes de test

Utilise cette section pour noter les bugs découverts pendant une session de test avant d'ouvrir des issues/commits :

```
Date : YYYY-MM-DD
Version testée : commit {hash}
Device : {iPhone / desktop / ...}

Bug 1 :
- Scénario :
- Attendu :
- Constaté :

Bug 2 :
...
```
