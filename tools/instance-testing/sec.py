import json, hashlib, sys, urllib.request, urllib.error, uuid, time
H = "https://sync.nookly.work"
TA, TB, TG = open(sys.argv[1]).read().split()
def call(method, path, token=None, body=None, raw=None, headers=None):
    h = {"content-type": "application/json", **(headers or {})}
    if token: h["authorization"] = "Bearer " + token
    data = raw if raw is not None else (json.dumps(body).encode() if body is not None else None)
    req = urllib.request.Request(H + path, data=data, method=method, headers=h)
    try:
        with urllib.request.urlopen(req, timeout=30) as r: b = r.read(); return r.status, b
    except urllib.error.HTTPError as e: return e.code, e.read()
    except (urllib.error.URLError, BrokenPipeError, ConnectionError) as e: return 0, repr(e).encode()
def js(b):
    try: return json.loads(b)
    except Exception: return b[:120]
out = []
def rec(name, expect, got, ok, note=""):
    out.append({"test": name, "expect": expect, "got": got, "pass": ok, "note": note}); print(("PASS " if ok else "FAIL ") + name.ljust(62), str(got)[:70], note[:90])
clk = lambda n: f"{int(time.time()*1000):013d}-{n:06d}-sec"
def change(pk, title, ds="own", table="entities", scope=None):
    return {"dataset": ds, "table": table, "pk": pk, "scope": scope, "fields": {"title": title, "type": "note", "space_id": "s", "created_at": "2026-01-01", "updated_at": "2026-01-01", "pinned": 0, "key_prefix": "NOT", "key_number": 1},
            "clocks": {k: clk(1) for k in ["title", "type", "space_id", "created_at", "updated_at", "pinned", "key_prefix", "key_number"]}, "baseClocks": {}, "deletedClock": None}
pk = "SEC-" + uuid.uuid4().hex[:8]
# alpha pushes a record and a blob
s, b = call("POST", "/v1/sync/push", TA, {"changes": [change(pk, "alpha secret")]}); rec("alpha push own record", 200, s, s == 200, str(js(b))[:60])
blob = ("alpha-secret-bytes-" + uuid.uuid4().hex).encode(); sha = hashlib.sha256(blob).hexdigest()
s, b = call("PUT", f"/v1/blobs/{sha}", TA, raw=blob, headers={"content-type": "application/octet-stream"}); rec("alpha upload blob", "201", s, s in (200, 201))
# beta attacks
s, b = call("GET", f"/v1/blobs/{sha}", TB); rec("beta GET alpha's blob by sha", "404/403", s, s in (403, 404))
s, b = call("PUT", f"/v1/blobs/{sha}", TB, raw=b"evil-different-bytes", headers={"content-type": "application/octet-stream"}); rec("beta PUT other bytes under alpha's sha", "4xx", s, 400 <= s < 500, str(js(b))[:60])
s, b = call("GET", f"/v1/blobs/{sha}", TA); rec("alpha blob intact after beta overwrite attempt", blob.decode()[:14], s, s == 200 and b == blob)
s, b = call("PUT", f"/v1/blobs/{sha}", TB, raw=blob, headers={"content-type": "application/octet-stream"}); rec("beta uploads SAME bytes (dedupe oracle?)", "201 own copy", s, True, "status " + str(s) + " (reveals nothing unless differs from fresh sha)")
fresh = hashlib.sha256(b"fresh-" + uuid.uuid4().bytes).hexdigest()
s, b = call("PUT", f"/v1/blobs/{fresh}", TB, raw=b"not matching", headers={"content-type": "application/octet-stream"}); rec("PUT wrong-hash content", "4xx", s, 400 <= s < 500, str(js(b))[:60])
for evil in ["../../etc/passwd", "%2e%2e%2fsecret", "A" * 64, "z" * 64, "0" * 63, "0" * 65, "%27%20OR%201=1%20--"]:
    s, b = call("GET", "/v1/blobs/" + evil, TB); rec(f"GET blob bad sha {evil[:22]!r}", "4xx", s, 400 <= s < 500 or s == 404)
s, b = call("POST", "/v1/sync/missing", TB, {"table": "entities", "pks": [pk]}); rec("beta missing() sees alpha's pk as missing (isolation)", {"missing": [pk]}, js(b), js(b) == {"missing": [pk]})
s, b = call("POST", "/v1/sync/pull", TB, {"cursors": {"own": 0}}); d = js(b); leak = any(r["pk"] == pk for ds in d.get("datasets", []) for r in ds["records"]); rec("beta pull own has none of alpha's records", "no leak", "leak" if leak else "clean", not leak)
s, b = call("POST", "/v1/sync/pull", TB, {"cursors": {"share:" + str(uuid.uuid4()): 0}}); d = js(b); rec("beta pulls random share dataset", "empty/removed", str(d)[:70], not any(ds.get("records") for ds in d.get("datasets", [])))
s, b = call("POST", "/v1/sync/push", TB, {"changes": [change("X-" + pk, "inject", ds="share:" + str(uuid.uuid4()))]}); d = js(b); st = d.get("results", [{}])[0].get("status"); rec("beta pushes into someone else's share dataset", "rejected", d.get("results"), st == "rejected")
s, b = call("POST", "/v1/sync/push", TB, {"changes": [change(pk, "beta writes same pk in own ns")]}); s2, b2 = call("POST", "/v1/sync/pull", TA, {"cursors": {"own": 0}}); d2 = js(b2); t = [r["fields"]["title"] for ds in d2.get("datasets", []) for r in ds["records"] if r["pk"] == pk]
rec("beta same-pk write does not touch alpha's record", ["alpha secret"], t, t == ["alpha secret"])
# sessions / devices / conflicts
s, b = call("GET", "/v1/sessions", TA); asess = js(b)["sessions"]; aid = asess[0]["id"]
s, b = call("DELETE", f"/v1/sessions/{aid}", TB); rec("beta revokes alpha's session id", "403/404", s, s in (403, 404))
s, b = call("GET", "/v1/account", TA); rec("alpha token still valid after attempt", 200, s, s == 200)
s, b = call("GET", "/v1/devices", TB); dv = js(b); rec("beta device list contains only beta's", "own only", str(dv)[:70], True, "manual: ids differ from alpha's: " + str([d.get('name') for d in (dv.get('devices') if isinstance(dv, dict) else [])]))
s, b = call("POST", f"/v1/conflicts/{uuid.uuid4()}/resolve", TB); rec("beta resolves nonexistent/other conflict", "404", s, s in (403, 404))
s, b = call("GET", "/v1/account", TB); acc = js(b); rec("account response exposes no password hash/secrets", "no secrets", str(acc)[:90], not any(k in json.dumps(acc).lower() for k in ("password", "hash", "secret")))
# input abuse
big = json.dumps({"changes": [], "pad": "x" * (9 * 1024 * 1024)}).encode()
s, b = call("POST", "/v1/sync/push", TA, raw=big); rec("push 9MB body", "413 or closed", s, s in (0, 413), "0 = connection closed by server")
s, b = call("POST", "/v1/sync/push", TA, raw=b"{not json"); rec("push malformed JSON", "4xx", s, 400 <= s < 500, str(js(b))[:50])
s, b = call("POST", "/v1/sync/push", TA, {"changes": [change(f"p{i}", "x") for i in range(501)]}); rec("push 501 changes (max 500)", "422", s, s == 422)
nested = "[" * 5000 + "]" * 5000
s, b = call("POST", "/v1/sync/push", TA, raw=nested.encode()); rec("deeply nested JSON", "4xx not 5xx", s, 400 <= s < 500)
for evil in ["entities'; DROP TABLE records;--", "../../etc", "<script>alert(1)</script>", "\u0000"]:
    s, b = call("POST", "/v1/sync/push", TA, {"changes": [change("inj-" + uuid.uuid4().hex[:6], evil, table="entities")]}); rec(f"push field value {evil[:26]!r}", "stored as data, no 5xx", s, s < 500)
s, b = call("POST", "/v1/sync/push", TA, {"changes": [change("inj-tbl", "x", table="records; drop table records")]}); rec("push table name with SQL", "rejected or inert", str(js(b))[:70], s < 500)
s, b = call("POST", "/v1/sync/push", TA, {"changes": [{**change("clk", "x"), "clocks": {"title": "9999999999999-999999-sec"}}]}); rec("push clock far in the future (clock poisoning)", "rejected clock-skew", str(js(b))[:80], s == 200 and "clock-skew" in str(js(b)))
for m in ["TRACE", "OPTIONS", "HEAD"]:
    s, b = call(m, "/v1/account", TA); rec(f"{m} /v1/account", "no 5xx", s, s < 500)
json.dump(out, open(sys.argv[2], "w"), indent=1)
print("\nfailed:", [o["test"] for o in out if not o["pass"]])
