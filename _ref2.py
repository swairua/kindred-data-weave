import fitz
ref = r"Additional docs/Correct design compressive strength.pdf"
d = fitz.open(ref)
p = d[0]
# Blue fills/strokes = page frame + header rule. Peach fills = label cells.
seen = set()
for dr in p.get_drawings():
    for key in ("fill", "color"):
        c = dr.get(key)
        if not c:
            continue
        r = tuple(round(v, 1) for v in c)
        if len(r) == 3 and r[2] > 0.8 and r[2] > r[0] + 0.3:
            rect = dr["rect"]
            tag = (key, r, round(rect.x0, 1), round(rect.y0, 1), round(rect.x1, 1), round(rect.y1, 1), round(dr.get("width", 0) or 0, 2))
            seen.add(tag)
for tag in sorted(seen, key=lambda t: (t[1], t[3])):
    print(tag)
# Terms + footer text (below the table)
words = p.get_text("words")
below = sorted([w for w in words if w[1] >= 360], key=lambda w: (round(w[1], 0), w[0]))
cur = None
for w in below:
    y = round(w[1], 0)
    if y != cur:
        print(f"y={int(y)} | ", end="")
        cur = y
    print(w[4], end=" ")
print()
