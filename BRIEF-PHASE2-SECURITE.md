# BRIEF PHASE 2 — SÉCURITÉ CREW TRIPS V2

**Date** : 2026-04-21
**Objectif** : fermer les failles documentées en Phase 1 sans impact utilisateur
**Approche** : RLS + fonctions RPC + rate-limit backoff exponentiel

---

## Contexte Phase 1 (rappel)

Audit Phase 1 a démontré :
- SELECT/INSERT/UPDATE/DELETE totalement ouverts sur les 6 tables avec clé anon
- NIP SHA-256 sans salt brute-forcable en 1.5 seconde
- `NEXT_PUBLIC_ADMIN_CODE` et `creator_code` exposés côté client
- Bucket `trip-photos` public avec liste complète des trip_id énumérable

## Stratégie retenue

**Option 1 : RLS + fonctions RPC + backoff exponentiel**
- 0 impact utilisateur (même flow tel + NIP)
- Clé anon reste dans bundle mais devient inutile sans NIP valide
- Backoff progressif empêche le brute-force
- 4 sous-sessions de 2-3h

## Choix techniques validés

- **Token d'accès** : UUID stocké en table `access_tokens` (Option B)
- **Durée validité** : 30 jours
- **Rate-limit** : backoff exponentiel
  - 1 à 3 tentatives : aucun délai
  - 4e : 5 secondes
  - 5e : 30 secondes
  - 6e : 2 minutes
  - 7e : 10 minutes
  - 8e et + : 1 heure
  - Reset après succès ou 24h sans tentative
- **Exécution SQL** : blocs clé-en-main collés manuellement dans SQL Editor par Sylvain

## Découpage 4 sessions

### Session 2.1 — Fondations backend
- Backup DB complet (JSON export 6 tables) ✅
- Table `access_tokens` (UUID, membre_id, trip_id, expires_at)
- Table `rate_limit_attempts` (tel, trip_code, attempts_count, last_attempt_at, blocked_until)
- Fonction RPC `verify_nip(trip_code, tel, nip)` avec backoff
- Fonction RPC `join_trip(trip_code, tel, nip)` retourne token
- Fonction RPC `get_trip_data(access_token)` retourne trip+membres+infos+messages
- Tests curl pour valider

### Session 2.2 — Refactor client
- `lib/api.ts` wrapper unique autour des RPC
- Refactor `Infos.tsx`, `Album.tsx`, `Membres.tsx`, `JoinScreen.tsx`
- Tests flows en dev local (rejoindre, créer card, uploader photo)

### Session 2.3 — Activation RLS + secrets
- `ALTER TABLE ... ENABLE RLS` sur 6 tables
- Policies `deny-all` par défaut + `SECURITY DEFINER` sur RPC
- Déplacer `ADMIN_CODE` vers route `/api/admin/verify` (env var serveur)
- Supprimer `creator_code` de table config → env var serveur
- Relancer tests Phase 1 → doivent tous retourner 403

### Session 2.4 — Bucket privé + finitions
- Bucket `trip-photos` en privé (désactiver accès public)
- Fonction RPC `get_signed_url(file_path, access_token)` → URL valide 1h
- Refactor Album/Infos/print pour signed URLs
- Batch signed URLs pour album (1 appel pour 50 photos)
- Audit sécurité final : relancer tous les tests Phase 1

## Garde-fous

- Backup DB avant chaque session
- Commit local avant chaque push prod
- Tests TS + build Next après chaque modif de code
- Tests curl après chaque `ALTER TABLE`
- Rollback prêt en 5 min si casse

## Livrables finaux

- 4+ commits séparés en prod
- `AUDIT-PHASE2-RESULTATS.md` avec tests avant/après (preuves que les trous sont fermés)
- Tous les trous de Phase 1 fermés
- Zéro impact utilisateur visible sur l'app

## État courant

- **Commit de base** : `5d40838` (fix Excel layout)
- **Backup DB** : `C:\Users\sbergeron\backups\crew-trips-db-2026-04-21-1050\`
- **Session active** : 2.1 — Fondations backend
