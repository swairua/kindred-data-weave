import fitz, io, sys

ref = r"Additional docs/Correct design compressive strength.pdf"
d = fitz.open(ref)
print("pages:", len(d))
words = d[0].get_text("words")  # x0,y0,x1,y1,word,...
lines = {}
for w in words:
    y = round(w[1], 0)
    lines.setdefault(y, []).append(w)
out = []
for y in sorted(lines):
    row = sorted(lines[y], key=lambda w: w[0])
    txt = " ".join(t[4] for t in row)
    if y < 380:
        out.append(f"y={int(y):3d} | {txt}")
open(sys.argv[1], "w", encoding="utf-8").write("\n".join(out))
print("wrote", sys.argv[1])
