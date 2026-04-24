# SCHEMA.md - Snapshot du schéma Supabase production

> **Généré le** : 25 avril 2026 (après P4h hotfix)
> **Projet Supabase** : dnvzqsgwqwrvsgfjqqxn (crew-trip main/production)
> **Source** : `SELECT * FROM information_schema.columns WHERE table_schema = 'public'`

## ⚠️ À Claude : anti-hallucination

Avant d'écrire ou modifier une migration SQL qui touche une table, **vérifie la colonne dans ce fichier**. Ne jamais supposer l'existence d'une colonne. Si le schéma a changé depuis cette capture, régénérer le fichier via Supabase SQL Editor :
```sql
SELECT table_name, column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_schema = 'public'
ORDER BY table_name, ordinal_position;
```
Puis Export → Copy as Markdown, remplacer le contenu ci-dessous.

## Tables du schéma public
| table_name             | column_name     | data_type                | is_nullable |
| ---------------------- | --------------- | ------------------------ | ----------- |
| access_tokens          | token           | uuid                     | NO          |
| access_tokens          | membre_id       | uuid                     | NO          |
| access_tokens          | trip_id         | uuid                     | NO          |
| access_tokens          | tel             | text                     | NO          |
| access_tokens          | created_at      | timestamp with time zone | NO          |
| access_tokens          | expires_at      | timestamp with time zone | NO          |
| access_tokens          | last_used_at    | timestamp with time zone | YES         |
| archive                | id              | uuid                     | NO          |
| archive                | trip_id         | uuid                     | YES         |
| archive                | categorie       | text                     | NO          |
| archive                | titre           | text                     | NO          |
| archive                | details         | text                     | YES         |
| archive                | url             | text                     | YES         |
| archive                | membre_id       | uuid                     | YES         |
| archive                | membre_prenom   | text                     | YES         |
| archive                | created_at      | timestamp with time zone | YES         |
| config                 | key             | text                     | NO          |
| config                 | value           | text                     | NO          |
| infos                  | id              | uuid                     | NO          |
| infos                  | trip_id         | uuid                     | YES         |
| infos                  | categorie       | text                     | NO          |
| infos                  | titre           | text                     | NO          |
| infos                  | contenu         | text                     | YES         |
| infos                  | lien            | text                     | YES         |
| infos                  | fichier_url     | text                     | YES         |
| infos                  | membre_prenom   | text                     | YES         |
| infos                  | created_at      | timestamp with time zone | YES         |
| infos                  | fichier_nom     | text                     | YES         |
| infos                  | fichier_taille  | bigint                   | YES         |
| infos                  | is_prive        | boolean                  | YES         |
| infos                  | auteur_id       | uuid                     | YES         |
| membres                | id              | uuid                     | NO          |
| membres                | trip_id         | uuid                     | YES         |
| membres                | prenom          | text                     | NO          |
| membres                | couleur         | text                     | NO          |
| membres                | created_at      | timestamp with time zone | YES         |
| membres                | is_createur     | boolean                  | NO          |
| membres                | tel             | text                     | YES         |
| membres                | nom             | text                     | YES         |
| membres                | nip             | text                     | YES         |
| messages               | id              | uuid                     | NO          |
| messages               | trip_id         | uuid                     | YES         |
| messages               | type            | text                     | NO          |
| messages               | contenu         | text                     | YES         |
| messages               | photo_url       | text                     | YES         |
| messages               | photo_caption   | text                     | YES         |
| messages               | membre_id       | uuid                     | YES         |
| messages               | membre_prenom   | text                     | YES         |
| messages               | membre_couleur  | text                     | YES         |
| messages               | created_at      | timestamp with time zone | YES         |
| messages               | image_url       | text                     | NO          |
| participants_autorises | id              | uuid                     | NO          |
| participants_autorises | trip_id         | uuid                     | YES         |
| participants_autorises | prenom          | text                     | NO          |
| participants_autorises | created_at      | timestamp with time zone | YES         |
| participants_autorises | nom             | text                     | YES         |
| participants_autorises | tel             | text                     | YES         |
| photos                 | id              | uuid                     | NO          |
| photos                 | trip_id         | uuid                     | YES         |
| photos                 | storage_path    | text                     | NO          |
| photos                 | url             | text                     | NO          |
| photos                 | caption         | text                     | YES         |
| photos                 | taille_bytes    | bigint                   | YES         |
| photos                 | membre_id       | uuid                     | YES         |
| photos                 | membre_prenom   | text                     | YES         |
| photos                 | created_at      | timestamp with time zone | YES         |
| rate_limit_attempts    | id              | uuid                     | NO          |
| rate_limit_attempts    | tel             | text                     | NO          |
| rate_limit_attempts    | trip_code       | text                     | NO          |
| rate_limit_attempts    | attempts_count  | integer                  | NO          |
| rate_limit_attempts    | last_attempt_at | timestamp with time zone | NO          |
| rate_limit_attempts    | blocked_until   | timestamp with time zone | YES         |
| trip_storage_usage     | trip_id         | uuid                     | YES         |
| trip_storage_usage     | nb_photos       | bigint                   | YES         |
| trip_storage_usage     | total_bytes     | numeric                  | YES         |
| trips                  | id              | uuid                     | NO          |
| trips                  | code            | text                     | NO          |
| trips                  | nom             | text                     | NO          |
| trips                  | type            | text                     | NO          |
| trips                  | destination     | text                     | YES         |
| trips                  | date_debut      | date                     | YES         |
| trips                  | date_fin        | date                     | YES         |
| trips                  | created_at      | timestamp with time zone | YES         |
| trips                  | lodge_nom       | text                     | YES         |
| trips                  | lodge_adresse   | text                     | YES         |
| trips                  | lodge_tel       | text                     | YES         |
| trips                  | lodge_wifi      | text                     | YES         |
| trips                  | lodge_code      | text                     | YES         |
| trips                  | lodge_arrivee   | text                     | YES         |
| trips                  | sms_lien        | text                     | YES         |
| trips                  | can_delete      | boolean                  | NO          |
| trips                  | can_edit        | boolean                  | NO          |
| trips                  | createur_tel    | text                     | YES         |
| trips                  | whatsapp_lien   | text                     | YES         |
| trips                  | can_post_photos | boolean                  | NO          |
| trips                  | share_token     | text                     | YES         |

