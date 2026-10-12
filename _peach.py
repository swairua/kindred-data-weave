import fitz, io

path = r"Additional docs/Correct design compressive strength.pdf"
d = fitz.open(path)
p = d[0]

# Find filled rectangles (drawings) in the ID region and header region.
draws = p.get_drawings()
def near(c, target, tol=6):
    return all(abs(int(c[i]*255)-target[i])<=tol for i in range(3))

peach=(252,228,214)
idrects=[]
for dr in draws:
    f=dr.get("fill")
    if not f: continue
    r=dr["rect"]
    if 180 <= r.y0 <= 300 and near(f, peach):
        idrects.append((round(r.y0,1),round(r.x0,1),round(r.x1,1),round(r.y1,1)))
idrects.sort()
out=["PEACH LABEL RECTS (y0,x0,x1,y1):"]
for t in idrects: out.append(str(t))

io.open("C:/Users/USER/AppData/Local/Temp/cs_peach.txt","w",encoding="utf-8").write("\n".join(out))
print("peach rects:", len(idrects))
