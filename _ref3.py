import fitz
ref = r"Additional docs/Correct design compressive strength.pdf"
p = fitz.open(ref)[0]
print("=== peach label rects (ID block) ===")
for dr in p.get_drawings():
    f = dr.get("fill")
    if not f:
        continue
    r = tuple(round(v * 255) for v in f)
    rect = dr["rect"]
    if r == (252, 228, 214) and 180 <= rect.y0 <= 300:
        print(f"y0={rect.y0:6.1f} x0={rect.x0:6.1f} x1={rect.x1:6.1f} y1={rect.y1:6.1f}")
print("=== ID block cell borders (all rects y 180-300, wide) ===")
for dr in p.get_drawings():
    rect = dr["rect"]
    if 180 <= rect.y0 <= 300 and (rect.x1 - rect.x0) > 40 and (rect.y1 - rect.y0) < 30:
        print(f"y0={rect.y0:6.1f} x0={rect.x0:6.1f} x1={rect.x1:6.1f} y1={rect.y1:6.1f} fill={dr.get('fill')}")
