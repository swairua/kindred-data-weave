import fitz, io
ref = r"Additional docs/Correct design compressive strength.pdf"
d = fitz.open(ref)
words = d[0].get_text("words")
out = []
for w in words:
    y = round(w[1], 0)
    if 185 <= y <= 280:
        out.append((int(y), int(round(w[0], 0)), w[4]))
out.sort()
txt = "\n".join(f"y={y:3d} x={x:3d} {t}" for y, x, t in out)
io.open("refid.txt", "w", encoding="utf-8").write(txt)
print(txt)
