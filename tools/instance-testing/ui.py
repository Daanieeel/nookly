"""ui.py <pid> <wid> click '<regex>' [--nth N] | setval '<regex>' 'value' | list '<regex>' | key <key> [--fg]
Reads the window fresh (session per call), finds the Nth row matching the regex, acts on it."""
import json, subprocess, sys, re, os, time
C = os.path.expanduser("~/.local/bin/cua-driver")
a = sys.argv[1:]
pid, wid, cmd = int(a[0]), int(a[1]), a[2]
sess = "ui%d" % int(time.time()*1000)
def run(tool, args):
    r = subprocess.run([C, tool, json.dumps(args)], capture_output=True, text=True)
    try: return json.loads(r.stdout)
    except Exception: return {"raw": r.stdout[:300], "err": r.stderr[:300]}
def read():
    d = run("get_window_state", {"session": sess, "pid": pid, "window_id": wid, "max_elements": 900, "include_screenshot": False})
    rows = []
    for l in d.get("tree_markdown", "").splitlines():
        m = re.search(r"\[(\d+)\]", l)
        if m: rows.append((d["snapshot_id"] + ":" + m.group(1), l.strip()))
    return rows
nth = int(a[a.index("--nth")+1]) if "--nth" in a else 0
if cmd == "key":
    args = {"session": sess, "pid": pid, "window_id": wid, "key": a[3]}
    if "--fg" in a: args["delivery_mode"] = "foreground"
    print(json.dumps(run("press_key", args))[:400]); sys.exit()
rows = read()
pat = re.compile(a[3], re.I)
hits = [r for r in rows if pat.search(r[1])]
if cmd == "list":
    for t, l in hits: print(t.ljust(14), l[:190])
    sys.exit()
if len(hits) <= nth:
    print("NO MATCH", a[3], "rows:", len(rows)); sys.exit(2)
tok, line = hits[nth]
print("target:", line[:160])
if cmd == "click":
    res = run("click", {"session": sess, "pid": pid, "window_id": wid, "element_token": tok})
elif cmd == "type":
    args = {"session": sess, "pid": pid, "window_id": wid, "element_token": tok, "text": a[4], "delivery_mode": "foreground"}
    res = run("type_text", args)
elif cmd == "setval":
    res = run("set_value", {"session": sess, "pid": pid, "window_id": wid, "element_token": tok, "value": a[4]})
print(json.dumps({k: res.get(k) for k in ("status", "effect", "refusal", "hint", "raw", "err") if res.get(k)})[:500])
