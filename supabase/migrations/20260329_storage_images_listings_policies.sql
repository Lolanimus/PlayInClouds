DROP POLICY IF EXISTS "allow_public_listings_images" ON storage.objects;
DROP POLICY IF EXISTS "allow_user_upload_own_images" ON storage.objects;
DROP POLICY IF EXISTS "allow_user_delete_own_images" ON storage.objects;

CREATE POLICY "allow_public_listings_images"
ON storage.objects
FOR SELECT
USING (
  bucket_id = 'images'
  AND LOWER((storage.foldername(name))[1]) = 'listings'
  AND (metadata->>'mimetype') LIKE 'image/%'
);

CREATE POLICY "allow_user_upload_own_images"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'images'
  AND LOWER((storage.foldername(name))[1]) = 'listings'
  AND (storage.foldername(name))[2] = auth.uid()::text
);

CREATE POLICY "allow_user_delete_own_images"
ON storage.objects
FOR DELETE
TO authenticated
USING (
  bucket_id = 'images'
  AND LOWER((storage.foldername(name))[1]) = 'listings'
  AND (storage.foldername(name))[2] = auth.uid()::text
);