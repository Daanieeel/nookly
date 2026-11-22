"""px.py <pid> <wid> x,y [x,y ...] : screenshot context, then pixel-click each (0.7s apart)"""
import json, subprocess, sys, os, time
C = os.path.expanduser("~/.local/bin/cua-driver"); pid, wid = int(sys.argv[1]), int(sys.argv[2]); S = "px%d" % int(time.time()*1000)
def run(t, a): return subprocess.run([C, t, json.dumps({"session": S, "pid": pid, "window_id": wid, **a})], capture_output=True, text=True).stdout
run("get_window_state", {"max_elements": 5, "include_screenshot": True})
for xy in sys.argv[3:]:
    x, y = map(int, xy.split(",")); run("click", {"x": x, "y": y, "post_action_wait": "none"}); time.sleep(0.7)
