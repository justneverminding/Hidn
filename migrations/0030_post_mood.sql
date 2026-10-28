-- A post's mood: how its card looks (plain, haunted, cctv, classified, note).
-- Purely visual; it says nothing about who wrote the post.
ALTER TABLE hidn_threads ADD COLUMN mood TEXT;
