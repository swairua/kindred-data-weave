import fitz, io

path = r"Additional docs/Correct design compressive strength.pdf"
d = fitz.open(path)
p = d[0]
W,H = p.rect.width, p.rect.height
print("page", round(W,1), round(H,1))
draws = p.get_drawings()
out=[]

# Stroked rects (borders) in title region y 120-175
print("=== strokes near title (y118-175) ===")
for dr in draws:
    r=dr["rect"]
    if 118 <= r.y0 <= 175 and (r.x1-r.x0) > 40:
        col = dr.get("color")
        print(f"  y0={r.y0:.1f} x0={r.x0:.1f} x1={r.x1:.1f} y1={r.y1:.1f} w={(r.x1-r.x0):.1f} h={(r.y1-r.y0):.1f} stroke={col}")

print("=== near full-page frame (big rects) ===")
for dr in draws:
    r=dr["rect"]
    if (r.x1-r.x0) > 600 and (r.y1-r.y0) > 400:
        col = dr.get("color"); fill=dr.get("fill")
        print(f"  y0={r.y0:.1f} x0={r.x0:.1f} x1={r.x1:.1f} y1={r.y1:.1f} stroke={col} fill={fill}")

# blue-ish fills/strokes anywhere
print("=== blue-ish elements ===")
for dr in draws:
    for key in ("color","fill"):
        c=dr.get(key)
        if c and len(c)==3 and c[2] > 0.5 and c[2] > c[0]+0.2:
            r=dr["rect"]
            print(f"  {key} {tuple(round(x,2) for x in c)} y0={r.y0:.1f} x0={r.x0:.1f} x1={r.x1:.1f} y1={r.y1:.1f}")
