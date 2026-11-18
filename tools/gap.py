"""Sets the Done mark of rows of GAP_ANALYSIS.md: gap.py "<text in the row's first cell>" "<mark>" ["note"]"""
import sys
text, mark = sys.argv[1], sys.argv[2]
note = sys.argv[3] if len(sys.argv) > 3 else ""
lines = open("GAP_ANALYSIS.md").read().split("\n")
hit = 0
for i, line in enumerate(lines):
    if line.startswith("|") and text in line.split("|")[1]:
        cells = line.split("|")
        cells[-2] = f" {mark} {note}".rstrip() + " "
        lines[i] = "|".join(cells)
        hit += 1
open("GAP_ANALYSIS.md", "w").write("\n".join(lines))
print(f"{hit} row(s)")
