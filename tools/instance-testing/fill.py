"""fill.py <pid> <wid> x,y=text ... : for each, pixel-focus the field, select all, type (foreground). One screenshot context up front."""
import json, subprocess, sys, os, time
C = os.path.expanduser("~/.local/bin/cua-driver"); pid, wid = int(sys.argv[1]), int(sys.argv[2]); S = "fill%d" % int(time.time())
def run(t, a): 
    r = subprocess.run([C, t, json.dumps({"session": S, "pid": pid, "window_id": wid, **a})], capture_output=True, text=True); return r.stdout
run("get_window_state", {"max_elements": 5, "include_screenshot": True})
for spec in sys.argv[3:]:
    xy, text = spec.split("=", 1); x, y = map(int, xy.split(","))
    run("click", {"x": x, "y": y, "post_action_wait": "none"}); time.sleep(0.25)
    run("hotkey", {"keys": ["cmd", "a"], "delivery_mode": "foreground"}); time.sleep(0.15)
    run("press_key", {"key": "delete", "delivery_mode": "foreground"}); time.sleep(0.15)
    if text: run("type_text", {"text": text, "delivery_mode": "foreground"})
    time.sleep(0.25)
print("filled", len(sys.argv) - 3)
