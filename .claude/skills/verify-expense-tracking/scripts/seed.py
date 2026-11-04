"""python3 seed.py: the SQL that seeds a verify run's database, on stdout.

Three users, one per state the app distinguishes:
  demo      16 expense groups spread over the last ~70 days, dated relative to TODAY in
            Asia/Jakarta, so the month list, /stats and the 62-day insight window always have
            data (fixed dates would age out of every window). One group carries a note with a URL.
  stranger  one group of its own: the target of every "someone else's expense" check.
  newcomer  no expenses at all: the empty month and empty /stats.

Raw inputs only (users, groups, items). Everything the app derives (share links, photos,
insights) is created by driving the app. Ids are fixed 12-character strings so recipes can
name them: demoGroup001 is today's, demoGroup016 the oldest, strangerG001 the stranger's.
"""
from datetime import datetime, timedelta
from zoneinfo import ZoneInfo

JKT = ZoneInfo("Asia/Jakarta")
now = datetime.now(JKT)
today = now.date()

USERS = [
    ("et-verify-demo", "Demo Verify", "demo@et-verify.invalid"),
    ("et-verify-stranger", "Stranger Verify", "stranger@et-verify.invalid"),
    ("et-verify-newcomer", "Newcomer Verify", "newcomer@et-verify.invalid"),
]

# (days ago, title, note, [(item, amount, category)])
DEMO = [
    (0, "makan siang kantor", None, [("nasi padang rendang", 32000, "meals"), ("es teh manis", 5000, "drinks")]),
    (1, "bensin + parkir", None, [("pertamax", 50000, "fuel"), ("parkir mall", 5000, "parking")]),
    (2, "nonton weekend", "kursi F12, studio 3", [("tiket xxi", 50000, "cinema"), ("popcorn caramel", 45000, "snacks")]),
    (3, "jajan sore", None, [("martabak manis", 38000, "jajan"), ("cireng isi", 12000, "jajan")]),
    (5, "dinner ulang tahun", "lokasi: https://example.com/steak-house reservasi jam 7", [("steak wagyu", 285000, "dining"), ("mocktail", 45000, "drinks"), ("service charge", 33000, "dining")]),
    (7, "pulsa + internet", None, [("paket data 30gb", 100000, "bills"), ("indihome bulanan", 385000, "internet")]),
    (9, "gojek seminggu", None, [("gojek ke kantor", 18000, "transport"), ("gojek pulang", 21000, "transport"), ("grab hujan", 34000, "transport")]),
    (12, "apotek", None, [("vitamin c", 45000, "health"), ("obat flu", 23500, "health")]),
    (16, "potong rambut", None, [("barbershop", 60000, "grooming")]),
    (20, "kopi kerja", None, [("kopi susu gula aren", 28000, "drinks"), ("croissant", 32000, "snacks")]),
    (26, "token listrik", None, [("token pln 200rb", 202500, "utilities")]),
    (33, "sewa apartemen", None, [("sewa bulanan", 4500000, "housing"), ("service charge", 650000, "housing")]),
    (40, "top up game", None, [("diamond ml", 150000, "entertainment")]),
    (48, "makan keluarga", None, [("bakso", 25000, "meals"), ("soto ayam", 22000, "meals"), ("es jeruk", 8000, "drinks")]),
    (55, "sewa parkir motor", None, [("parkir bulanan", 150000, "parking")]),
    (70, "belanja lain", None, [("kado teman", 175000, "other")]),
]

STRANGER = [(4, "rahasia stranger", "jangan terlihat oleh demo", [("barang stranger", 999000, "other")])]


def q(s):
    return "NULL" if s is None else "'" + s.replace("'", "''") + "'"


out = ["begin;"]
for uid, name, email in USERS:
    out.append(f'insert into "user" (id, name, email, "emailVerified") values ({q(uid)}, {q(name)}, {q(email)}, now());')


def groups(user, prefix, rows):
    for n, (ago, title, note, items) in enumerate(rows, 1):
        gid = f"{prefix}{n:03d}"
        assert len(gid) == 12, gid
        day = today - timedelta(days=ago)
        # created_at/updated_at at noon Jakarta on the day, so "recently added" orderings follow the
        # date; never in the future (before noon, today's noon would outrank every real edit in the
        # insight watermark, max(updated_at)).
        ts = min(datetime(day.year, day.month, day.day, 12, tzinfo=JKT), now - timedelta(minutes=5)).isoformat()
        out.append(
            "insert into expense_groups (id, user_id, title, occurred_on, note, raw_text, created_at, updated_at) "
            f"values ({q(gid)}, {q(user)}, {q(title)}, {q(day.isoformat())}, {q(note)}, NULL, {q(ts)}, {q(ts)});"
        )
        for i, (item, amount, cat) in enumerate(items):
            iid = f"{prefix[:4]}I{n:03d}{i:04d}"
            assert len(iid) == 12, iid
            out.append(
                "insert into expense_items (id, group_id, name, amount_idr, category, sort_order) "
                f"values ({q(iid)}, {q(gid)}, {q(item)}, {amount}, {q(cat)}, {i});"
            )


groups("et-verify-demo", "demoGroup", DEMO)
groups("et-verify-stranger", "strangerG", STRANGER)
out.append("commit;")
print("\n".join(out))
