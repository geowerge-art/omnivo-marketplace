-- Amprenta vizuală (dHash, 16 caractere hex) a fiecărei poze: găsim aceeași poză pusă de alt cont.
ALTER TABLE listing_images ADD COLUMN IF NOT EXISTS phash TEXT;
CREATE INDEX IF NOT EXISTS listing_images_phash_idx ON listing_images (phash) WHERE phash IS NOT NULL;
