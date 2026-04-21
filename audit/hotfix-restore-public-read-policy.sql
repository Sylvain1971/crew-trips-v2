-- =========================================================================
-- HOTFIX : restaurer la policy public_read_photos supprimee par erreur
-- Cette policy permettait aux URLs publiques /storage/v1/object/public/ de
-- fonctionner. Sans elle, les URLs publiques retournent HTTP 400.
-- =========================================================================

CREATE POLICY "public_read_photos"
ON storage.objects
FOR SELECT
TO public
USING (bucket_id = 'trip-photos');
