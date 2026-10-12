import pymupdf, math, json

doc = pymupdf.open(r'C:\xampp\htdocs\kindred\Density-moisture content relationship.pdf')
pg = doc[0]

X0, X1, MO0, MO1 = 207.4, 386.4, 30.0, 42.0
Y0, Y1, D0, D1 = 565.0, 430.1, 1240.0, 1360.0
PX_PER_MO = (X1-X0)/(MO1-MO0)
PX_PER_D = (Y0-Y1)/(D1-D0)

def to_data(px, py):
    mo = MO0 + (px-X0)/PX_PER_MO
    d = D0 + (Y0-py)/PX_PER_D
    return mo, d

# Find paths whose items include any segment with an endpoint inside the chart plot area
chart_x0, chart_x1, chart_y0, chart_y1 = 200, 410, 400, 600

print('=== paths with segments in chart area, with style info ===')
for i, d in enumerate(pg.get_drawings()):
    r = d['rect']
    stroke = d.get('color')
    fill = d.get('fill')
    dash = d.get('dashes')
    w = d.get('width')
    total = 0.0
    points = []
    in_chart = False
    for item in d['items']:
        if item[0] == 'l':
            p1, p2 = item[1], item[2]
            length = math.hypot(p2.x-p1.x, p2.y-p1.y)
            total += length
            mid = ((p1.x+p2.x)/2, (p1.y+p2.y)/2)
            if chart_x0 <= mid[0] <= chart_x1 and chart_y0 <= mid[1] <= chart_y1:
                in_chart = True
                points.append(('l', p1, p2))
        elif item[0] == 'c':
            pts = [item[1], item[2], item[3], item[4]]
            length = sum(math.hypot(pts[j+1].x-pts[j].x, pts[j+1].y-pts[j].y) for j in range(3))
            total += length
            mid = (sum(p.x for p in pts)/4, sum(p.y for p in pts)/4)
            if chart_x0 <= mid[0] <= chart_x1 and chart_y0 <= mid[1] <= chart_y1:
                in_chart = True
                points.append(('c', pts))
    if in_chart and total > 30:
        label = 'VOIDSLINE?' if (stroke and stroke != (0,0,0)) else ''
        print(f'path {i}: stroke={stroke} fill={fill} dash={dash} w={w} total_len={total:.1f}')
        # print a few sample points converted to data
        shown = 0
        for kind, *rest in points[:6]:
            if kind == 'l':
                p1, p2 = rest
                m1, d1 = to_data(p1.x, p1.y)
                m2, d2 = to_data(p2.x, p2.y)
                print(f'   {m1:.2f}%,{d1:.0f} -> {m2:.2f}%,{d2:.0f}')
            shown += 1

print()
print('=== parabola fit on the 6 reference points ===')
pts = [(31.6, 1274.0), (33.7, 1298.0), (35.8, 1319.0), (37.9, 1323.0), (39.9, 1302.0), (41.9, 1270.0)]
n = 0; sx=0; sx2=0; sx3=0; sx4=0; sy=0; sxy=0; sx2y=0
for x,y in pts:
    n+=1; sx+=x; sx2+=x*x; sx3+=x**3; sx4+=x**4; sy+=y; sxy+=x*y; sx2y+=x*x*y
det = n*(sx2*(sx4*sx2 - sx3*sx3) - sx3*(sx3*sx2 - sx4*sx) + sx4*(sx3*sx3 - sx2*sx2)) if False else None
# solve 3x3 [n sx sx2; sx sx2 sx3; sx2 sx3 sx4] [c b a] = [sy sxy sx2y]
M = [[n, sx, sx2], [sx, sx2, sx3], [sx2, sx3, sx4]]
V = [sy, sxy, sx2y]
def det3(m):
    return m[0][0]*(m[1][1]*m[2][2]-m[1][2]*m[2][1]) - m[0][1]*(m[1][0]*m[2][2]-m[1][2]*m[2][0]) + m[0][2]*(m[1][0]*m[2][1]-m[1][1]*m[2][0])
D = det3(M)
c = det3([ [V[0], M[0][1], M[0][2]], [V[1], M[1][1], M[1][2]], [V[2], M[2][1], M[2][2]] ]) / D
b = det3([ [M[0][0], V[0], M[0][2]], [M[1][0], V[1], M[1][2]], [M[2][0], V[2], M[2][2]] ]) / D
a = det3([ [M[0][0], M[0][1], V[0]], [M[1][0], M[1][1], V[1]], [M[2][0], M[2][1], V[2]] ]) / D
omc = -b/(2*a)
mdd = a*omc*omc + b*omc + c
# rSquared
ys = [a*x*x + b*x + c for x,_ in pts]
mean = sy/n
ss_res = sum((pts[i][1]-ys[i])**2 for i in range(n))
ss_tot = sum((pts[i][1]-mean)**2 for i in range(n))
r2 = 1 - ss_res/ss_tot
print(f'a={a:.6f} b={b:.6f} c={c:.4f}')
print(f'OMC={omc:.2f}%  MDD={mdd:.0f} kg/m3  bulk={mdd*(1+omc/100):.0f}  R2={r2:.4f}')
