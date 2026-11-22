"""Fingerprint of a Nookly data dir: per synced table row counts and a content hash,
device-local columns excluded. Usage: python3 -I fp.py <dataDir> [--json]"""
import hashlib, json, os, sqlite3, sys

data = sys.argv[1]
con = sqlite3.connect("file:" + os.path.join(data, "nookly.db") + "?mode=ro", uri=True)
EXCLUDE = {"files": {"local_path", "source_path"}}
TABLES = ["spaces", "entities", "blocks", "tasks", "task_statuses", "courses", "semesters", "assignments", "exams",
          "bookmarks", "calendar_entries", "recipes", "recipe_ingredients", "recipe_steps", "index_card_decks",
          "index_cards", "labels", "entity_labels", "relationships", "mentions", "views", "files", "space_modules",
          "sessions", "session_templates", "calendar_entry_templates", "series_slots", "study_blocks", "account_settings",
          "note_settings", "page_docs", "entity_references"]
like = None
if "--like" in sys.argv:
    like = sqlite3.connect("file:" + sys.argv[sys.argv.index("--like") + 1] + "?mode=ro", uri=True)
out = {}
for t in TABLES:
    try:
        cols = [r[1] for r in con.execute(f"pragma table_info({t})")]
    except Exception:
        continue
    if not cols:
        continue
    keep = [c for c in cols if c not in EXCLUDE.get(t, set())]
    if like is not None:
        lc = {r[1] for r in like.execute(f"pragma table_info({t})")}
        keep = [c for c in keep if c in lc]
        if not keep:
            continue
    rows = con.execute(f"select {','.join(keep)} from {t}").fetchall()
    h = hashlib.sha256()
    for r in sorted(map(repr, rows)):
        h.update(r.encode())
    out[t] = {"n": len(rows), "h": h.hexdigest()[:12]}
# file bytes on disk
fh = {}
for eid, lp in con.execute("select entity_id, local_path from files"):
    p = lp if lp and os.path.isabs(lp) else os.path.join(data, lp or "")
    if lp and os.path.exists(p):
        fh[eid] = hashlib.sha256(open(p, "rb").read()).hexdigest()
out["_file_bytes"] = {"n": len(fh), "h": hashlib.sha256("".join(sorted(fh.values())).encode()).hexdigest()[:12]}
out["_deleted_entities"] = {"n": con.execute("select count(*) from entities where deleted_at is not null").fetchone()[0]}
try:
    out["_sync_dirty"] = {"n": con.execute("select count(*) from sync_dirty").fetchone()[0]}
    out["_sync_conflicts"] = {"n": con.execute("select count(*) from sync_conflicts").fetchone()[0]}
except Exception:
    pass
if "--json" in sys.argv:
    print(json.dumps(out, sort_keys=True))
else:
    for k, v in out.items():
        print(f"{k:28} {v['n']:>6} {v.get('h','')}")
