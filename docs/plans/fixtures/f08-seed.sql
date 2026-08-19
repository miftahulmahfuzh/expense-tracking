-- F08 QA fixture — the three account shapes /stats has to survive.
--
-- Referenced by docs/plans/F08-stats.md §7.2. Every id is prefixed `f08` so the whole
-- fixture can be removed again with the DELETE at the bottom of this file; the FK cascades
-- take the items with the groups.
--
-- Table names are the SHIPPED ones: the Auth.js Drizzle adapter names its table "user"
-- (singular, and therefore quoted), not "users" as roadmap §4.2 sketched.
--
--   psql "$DATABASE_URL" -f docs/plans/fixtures/f08-seed.sql
--
-- The dates below are relative to the current Asia/Jakarta month, computed in SQL, so the
-- fixture does not rot: U-THIN and U-FULL always have an in-progress current month and
-- U-FULL always has a deliberately empty month in the middle of its window.

begin;

-- ── the three users ─────────────────────────────────────────────────────────────
insert into "user" (id, name, email) values
  ('f08empty0001', 'QA Empty', 'f08-empty@example.test'),
  ('f08thin00001', 'QA Thin',  'f08-thin@example.test'),
  ('f08full00001', 'QA Full',  'f08-full@example.test')
on conflict (id) do nothing;

-- ── U-EMPTY: signed in, zero groups. Nothing to insert; that is the case. ───────

-- ── U-THIN: one group in the current month, 3 items, 2 categories ───────────────
insert into expense_groups (id, user_id, title, occurred_on, raw_text) values
  ('f08thing0001', 'f08thin00001', 'bakar duit tuesday',
   date_trunc('month', (now() at time zone 'Asia/Jakarta'))::date + 2,
   'roti buaya 38500' || chr(10) || 'ayam sambal hitam 45k' || chr(10) || 'perumahan laddaland 49k')
on conflict (id) do nothing;

insert into expense_items (id, group_id, name, amount_idr, category, sort_order) values
  ('f08thini001', 'f08thing0001', 'roti buaya',        38500, 'food',    0),
  ('f08thini002', 'f08thing0001', 'ayam sambal hitam', 45000, 'food',    1),
  ('f08thini003', 'f08thing0001', 'perumahan laddaland', 49000, 'housing', 2)
on conflict (id) do nothing;

-- ── U-FULL: 14 months of history ────────────────────────────────────────────────
-- One group per month at offset -13 .. 0, EXCEPT offset -4, which is left empty on
-- purpose: that hole is the entire reason decision D-B (explicit zero months) exists, and
-- a chart that closes it is the chart lying. Offset 0 is the in-progress current month.
insert into expense_groups (id, user_id, title, occurred_on)
select
  'f08fullg' || lpad((13 + k)::text, 4, '0'),
  'f08full00001',
  'bulan ' || to_char(date_trunc('month', (now() at time zone 'Asia/Jakarta')) + (k || ' month')::interval, 'Mon YYYY'),
  (date_trunc('month', (now() at time zone 'Asia/Jakarta')) + (k || ' month')::interval)::date + 1
from generate_series(-13, 0) as k
where k <> -4
on conflict (id) do nothing;

-- Every group gets all 8 categories, with amounts that differ per month so the 12-month
-- chart has real shape and the breakdown has a genuine largest row. The tiny `other` row
-- is the < 1% case QA step 21 checks does not vanish.
insert into expense_items (id, group_id, name, amount_idr, category, sort_order)
select
  'f08fulli' || lpad(g.n::text, 3, '0') || lpad(c.ord::text, 1, '0'),
  g.id,
  c.label,
  c.base + (g.n * 7919 % 40000),
  c.cat,
  c.ord
from (
  select id, row_number() over (order by occurred_on) as n
  from expense_groups where user_id = 'f08full00001'
) g
cross join (values
  ('food',          'nasi padang',        180000, 0),
  ('groceries',     'indomaret',           95000, 1),
  ('transport',     'grab + bensin',       80000, 2),
  ('bills',         'internet',           320000, 3),
  ('housing',       'iuran ipl',          150000, 4),
  ('entertainment', 'langganan streaming',  65000, 5),
  ('health',        'vitamin',             45000, 6),
  ('other',         'parkir',               2000, 7)
) as c(cat, label, base, ord)
on conflict (id) do nothing;

commit;

-- ── teardown ────────────────────────────────────────────────────────────────────
-- Removes every row this fixture created. The ON DELETE CASCADE on expense_groups.user_id
-- and expense_items.group_id means deleting the three users is sufficient.
--
--   delete from "user" where id in ('f08empty0001','f08thin00001','f08full00001');
