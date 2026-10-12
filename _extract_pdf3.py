import pymupdf

doc = pymupdf.open(r'C:\xampp\htdocs\kindred\Density-moisture content relationship.pdf')
pg = doc[0]

# Chart plot area: x 207.4-401.4, y 407.5-565.0
# Axis calibration:
#   x: 30.0% at 207.4, 42.0% at 386.4  -> 14.9167 px per %
#   y: 1240 at 565.0, 1360 at 430.1    -> 1.1242 px per kg/m3
X0, X1 = 207.4, 386.4
MO0, MO1 = 30.0, 42.0
Y0, Y1 = 565.0, 430.1
D0, D1 = 1240.0, 1360.0

def to_data(px, py):
    mo = MO0 + (px - X0) / (X1 - X0) * (MO1 - MO0)
    d = D0 + (Y0 - py) / (Y0 - Y1) * (D1 - D0)
    return mo, d

print('=== ALL drawings (full page) ===')
for i, d in enumerate(pg.get_drawings()):
    r = d['rect']
    # only paths that intersect the chart plot area
    if r.x1 < 200 or r.x0 > 410 or r.y1 < 400 or r.y0 > 575:
        continue
    stroke = d.get('color')
    fill = d.get('fill')
    dash = d.get('dashes')
    width = d.get('width')
    print(f'--- path {i}: rect=({r.x0:.1f},{r.y0:.1f},{r.x1:.1f},{r.y1:.1f}) stroke={stroke} fill={fill} dash={dash} w={width}')
    for item in d['items']:
        if item[0] == 'l':
            p1, p2 = item[1], item[2]
            m1, d1v = to_data(p1.x, p1.y)
            m2, d2v = to_data(p2.x, p2.y)
            print('  line (%.1f,%.1f)->(%.1f,%.1f)  data (%.2f%%,%.1f)->(%.2f%%,%.1f)' % (p1.x, p1.y, p2.x, p2.y, m1, d1v, m2, d2v))
        elif item[0] == 'c':
            pts = [item[1], item[2], item[3], item[4]]
            print('  curve', ['(%.1f,%.1f)' % (p.x, p.y) for p in pts])
        elif item[0] == 're':
            print('  rect', item[1])
        elif item[0] == 'qu':
            print('  quad', item[1])
