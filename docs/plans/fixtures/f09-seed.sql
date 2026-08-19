-- ════════════════════════════════════════════════════════════════════════════
--  F09 QA fixture — one shared expense, so /s/[token] can be opened for real.
--
--  Every row is prefixed `f09-` so the teardown at the bottom is exact and nothing
--  belonging to a real account can be caught by it. Apply, look at the page, then run the
--  teardown; do not leave this in a database anyone signs in to.
--
--    psql "$DATABASE_URL_UNPOOLED" -f docs/plans/fixtures/f09-seed.sql
--    open http://localhost:3000/s/f09Sh4reT0kn
--
--  The content is the roadmap's canonical example (§1): six items, Rp 266.350, so the
--  total on screen can be checked against a number that is written down elsewhere. The
--  category on `perumahan laddaland` is `entertainment` per R-76 — it is a film, not rent.
--
--  The photo row points at a blob that does not exist. That is deliberate and it is the
--  limit of this fixture: it proves the "Foto" section, the 3-up grid and the ABSENCE of a
--  delete affordance are rendered, and it proves nothing about what a photo looks like.
--  R-86 (EXIF orientation) still runs on /e/[id] with a real iPhone photo.
-- ════════════════════════════════════════════════════════════════════════════

INSERT INTO "user" (id, name, email) VALUES
  ('f09user00001', 'Pengguna QA', 'f09-qa@example.invalid');

INSERT INTO expense_groups (id, user_id, title, occurred_on, note, raw_text) VALUES
  ('f09group0001', 'f09user00001', 'bakar duit tuesday', DATE '2026-08-18',
   'Patungan dulu, ditagih nanti.',
   'JANGAN TAMPIL DI /s — raw_text tidak boleh ada di halaman publik');

INSERT INTO expense_items (id, group_id, name, amount_idr, category, sort_order) VALUES
  ('f09item00001', 'f09group0001', 'roti buaya',            38500, 'food',          0),
  ('f09item00002', 'f09group0001', 'ayam sambal hitam',     45000, 'food',          1),
  ('f09item00003', 'f09group0001', 'perumahan laddaland',   49000, 'entertainment', 2),
  ('f09item00004', 'f09group0001', 'kungfu soccer',         49000, 'entertainment', 3),
  ('f09item00005', 'f09group0001', 'fan fries plaza blok m',58850, 'food',          4),
  ('f09item00006', 'f09group0001', 'pak gembus',            26000, 'other',         5);

INSERT INTO expense_photos (id, group_id, blob_url, blob_pathname, width, height, size_bytes, sort_order) VALUES
  ('f09photo0001', 'f09group0001',
   'https://f09qa.public.blob.vercel-storage.com/photos/2026/08/f09-not-a-real-blob.jpg',
   'photos/2026/08/f09-not-a-real-blob.jpg', 1600, 1200, 280000, 0);

INSERT INTO share_links (token, group_id) VALUES ('f09Sh4reT0kn', 'f09group0001');

-- ── teardown ────────────────────────────────────────────────────────────────
-- The FK cascades from expense_groups take items, photos and the share link, and the
-- cascade from "user" takes the group — so one DELETE is enough. Both are here because
-- being explicit about what a teardown removes is cheaper than reading three schemas.
--
--   DELETE FROM "user" WHERE id = 'f09user00001';
