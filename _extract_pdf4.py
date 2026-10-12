import pymupdf
import math

doc = pymupdf.open(r'C:\xampp\htdocs\kindred\Density-moisture content relationship.pdf')
pg = doc[0]

# Axis calibration (from tick marks):
#   x: 30.0% at 207.4, 42.0% at 386.4  -> 14.9167 px per %
#   y: 1240 at 565.0, 1360 at 430.1    -> 1.1242 px per kg/m3
X0, X1 = 207.4, 386.4
MO0, MO1 = 30.0, 42.0
Y0, Y1 = 565.0, 430.1
D0, D1 = 1240.0, 1360.0
PX_PER_MO = (X1 - X0) / (MO1 - MO0)
PX_PER_D = (Y0 - Y1) / (D1 - D0)

def to_data(px, py):
    mo = MO0 + (px - X0) / PX_PER_MO
    d = D0 + (Y0 - py) / PX_PER_D
    return mo, d

def gs_from_zav(moisture_pct, density):
    """Solve rho_d = 1000*Gs/(1+w*Gs) for Gs."""
    w = moisture_pct / 100.0
    denom = 1000.0 - w * density
    if denom <= 0:
        return None
    return density / denom

print('=== long line segments (>15 px) in chart area ===')
for i, d in enumerate(pg.get_drawings()):
    r = d['rect']
    if r.x1 < 200 or r.x0 > 410 or r.y1 < 400 or r.y0 > 600:
        continue
    for item in d['items']:
        if item[0] == 'l':
            p1, p2 = item[1], item[2]
            length = math.hypot(p2.x - p1.x, p2.y - p1.y)
            if length > 15:
                m1, d1v = to_data(p1.x, p1.y)
                m2, d2v = to_data(p2.x, p2.y)
                print('path %d line (%.1f,%.1f)->(%.1f,%.1f) len=%.1f  data (%.2f%%,%.1f)->(%.2f%%,%.1f)'
                      % (i, p1.x, p1.y, p2.x, p2.y, length, m1, d1v, m2, d2v))
        elif item[0] == 'c':
            pts = [item[1], item[2], item[3], item[4]]
            xs = [p.x for p in pts]
            ys = [p.y for p in pts]
            if max(xs) - min(xs) > 15 or max(ys) - min(ys) > 15:
                print('path %d curve' % i, ['(%.1f,%.1f)' % (p.x, p.y) for p in pts])

# Square markers (from earlier extraction): (324.48,408.6) (354.36,450.12) (384.24,489.6)
print()
print('=== square markers -> implied Gs (if 0%% voids line) ===')
for sx, sy in [(324.48, 408.6), (354.36, 450.12), (384.24, 489.6)]:
    cx, cy = sx + 0.78, sy + 0.78
    mo, d = to_data(cx, cy)
    g = gs_from_zav(mo, d)
    print('  (%.2f%%, %.1f kg/m3) -> Gs = %.4f' % (mo, d, g))

# Triangle markers centroids
print()
print('=== triangle markers -> implied Gs (if 5%% / 10%% voids lines) ===')
triA = [((294.1, 433.7), (294.8, 435.2), (293.4, 435.2)),
        ((325.2, 476.9), (325.9, 478.4), (324.5, 478.4)),
        ((355.1, 516.1), (355.8, 517.6), (354.4, 517.6)),
        ((385.0, 553.3), (385.7, 554.8), (384.2, 554.8))]
triB = [((232.0, 423.2), (230.4, 421.8), (230.4, 423.2)),
        ((263.3, 469.8), (261.8, 468.4), (261.8, 469.8)),
        ((294.8, 513.8), (293.4, 512.3), (293.4, 513.8)),
        ((325.9, 554.8), (324.5, 553.3), (324.5, 554.8))]
for name, tris, frac in [('A', triA, 0.95), ('B', triB, 0.90)]:
    for t in tris:
        cx = sum(p[0] for p in t) / 3.0
        cy = sum(p[1] for p in t) / 3.0
        mo, d = to_data(cx, cy)
        zav = d / frac
        g = gs_from_zav(mo, zav)
        print('  line %s (%.2f%%, %.1f) ZAV=%.1f -> Gs = %.4f' % (name, mo, d, zav, g))
