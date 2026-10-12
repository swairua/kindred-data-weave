import math

# Reference masses (from PDF table, exact)
mould_tare = 3050.0
vol = 903.0
mould_wet = [4564, 4617, 4667, 4697, 4695, 4677]
cw =      [204.4, 169.0, 201.0, 201.2, 204.1, 256.3]
cd =      [155.3, 126.4, 148.0, 145.9, 145.9, 180.6]
ctare =   [0, 0, 0, 0, 0, 0]

print('=== per-point calculations from exact masses ===')
moist = []
dd = []
bulk = []
for i in range(6):
    wet_mat = mould_wet[i] - mould_tare
    water = cw[i] - cd[i]
    dry_soil = cd[i] - ctare[i]
    mc = water / dry_soil * 100
    bd = wet_mat / vol * 1000
    drd = bd / (1 + mc/100)
    moist.append(mc)
    dd.append(drd)
    bulk.append(bd)
    print(f'  pt{i+1}: wetMat={wet_mat} water={water} drySoil={dry_soil} mc={mc:.4f}% bulk={bd:.2f} dd={drd:.2f}')

def parabola_fit(xs, ys):
    n = len(xs)
    sx=sx2=sx3=sx4=sy=sxy=sx2y=0.0
    for x,y in zip(xs,ys):
        sx+=x; sx2+=x*x; sx3+=x**3; sx4+=x**4; sy+=y; sxy+=x*y; sx2y+=x*x*y
    M=[[n,sx,sx2],[sx,sx2,sx3],[sx2,sx3,sx4]]
    V=[sy,sxy,sx2y]
    def d3(m):
        return m[0][0]*(m[1][1]*m[2][2]-m[1][2]*m[2][1]) - m[0][1]*(m[1][0]*m[2][2]-m[1][2]*m[2][0]) + m[0][2]*(m[1][0]*m[2][1]-m[1][1]*m[2][0])
    D=d3(M)
    c = d3([[V[0],M[0][1],M[0][2]],[V[1],M[1][1],M[1][2]],[V[2],M[2][1],M[2][2]]])/D
    b = d3([[M[0][0],V[0],M[0][2]],[M[1][0],V[1],M[1][2]],[M[2][0],V[2],M[2][2]]])/D
    a = d3([[M[0][0],M[0][1],V[0]],[M[1][0],M[1][1],V[1]],[M[2][0],M[2][1],V[2]]])/D
    omc = -b/(2*a)
    mdd = a*omc*omc + b*omc + c
    mean = sy/n
    ss_res = sum((ys[i]-(a*xs[i]**2+b*xs[i]+c))**2 for i in range(n))
    ss_tot = sum((y-mean)**2 for y in ys)
    r2 = 1 - ss_res/ss_tot
    return a,b,c,omc,mdd,r2

print()
print('=== parabola through (moisture, dryDensity) -- app method ===')
a,b,c,omc,mdd,r2 = parabola_fit(moist, dd)
print(f'  OMC={omc:.3f}%  MDD={mdd:.2f}  bulk={mdd*(1+omc/100):.1f}  R2={r2:.4f}')

print()
print('=== parabola through (moisture, dryDensity) using ROUNDED table values ===')
omc_r=[31.6,33.7,35.8,37.9,39.9,41.9]
dd_r=[1274,1298,1319,1323,1302,1270]
a,b,c,omc,mdd,r2 = parabola_fit(omc_r, dd_r)
print(f'  OMC={omc:.3f}%  MDD={mdd:.2f}  bulk={mdd*(1+omc/100):.1f}  R2={r2:.4f}')

print()
print('=== parabola through (moisture, bulkDensity) -- alternate method ===')
a,b,c,omc,mdd,r2 = parabola_fit(moist, bulk)
bd_peak = a*omc*omc+b*omc+c
dd_peak = bd_peak/(1+omc/100)
print(f'  OMC(bulk peak)={omc:.3f}%  bulk_peak={bd_peak:.2f}  -> dd={dd_peak:.1f}  R2={r2:.4f}')

print()
print('=== reference reported values ===')
print('  OMC=37.6%%  MDD=1325  bulk=1823  (bulk = 1325*(1+0.376) = %.1f)' % (1325*1.376))
